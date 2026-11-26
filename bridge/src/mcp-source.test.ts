import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Delta } from '@dash-iso/shared';
import { loadConfig, parseArgs } from './config.js';
import { McpSource, resolveTools } from './mcp-source.js';
import { ChatUnavailableError } from './source.js';

const quiet = { log: () => {}, warn: () => {}, error: () => {} };
const json = (v: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(v) }] });

/** A fake Dash MCP server shaped like Dash's dash_board tools. */
function fakeDash(opts: { chat?: boolean } = {}) {
  const todos: Record<
    string,
    { todo_id: string; title: string; status: string; runner_name?: string }[]
  > = {
    'proj-a': [
      { todo_id: 't1', title: 'One', status: 'running', runner_name: 'mac' },
      { todo_id: 't2', title: 'Two', status: 'queued' },
    ],
    'proj-b': [{ todo_id: 't3', title: 'Three', status: 'review' }],
  };
  const server = new McpServer({ name: 'fake-dash', version: '0' });
  server.tool('list_projects', 'List projects', async () =>
    json({
      projects: [
        { id: 'proj-a', name: 'A' },
        { id: 'proj-b', name: 'B' },
      ],
    }),
  );
  server.tool('list_todos', 'List tasks', { project: z.string().optional() }, async ({ project }) =>
    json(todos[project ?? ''] ?? []),
  );
  server.tool('list_goals', 'List goals', { project: z.string().optional() }, async ({ project }) =>
    json(project === 'proj-a' ? [{ goal_id: 'g1', title: 'Goal', todo_ids: ['t1', 't2'] }] : []),
  );
  server.tool('get_todo', 'Read a task', { id: z.string() }, async () => json({}));
  if (opts.chat) {
    server.tool('org_chat', 'Talk to the PM', { message: z.string() }, async ({ message }) => ({
      content: [{ type: 'text' as const, text: `pm: ${message}` }],
    }));
  }
  const makeClient = async () => {
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(a);
    return client;
  };
  return { todos, makeClient };
}

const mcpCfg = loadConfig({ DASH_MCP_URL: 'http://unused' }).mcp;

describe('McpSource', () => {
  it('maps Dash tools onto the domain model and diffs polls', async () => {
    const dash = fakeDash();
    const src = new McpSource(mcpCfg, 60_000, 'Org', quiet, dash.makeClient);
    await src.start();
    try {
      const s = src.snapshot();
      expect(s.projects.map((p) => p.name)).toEqual(['A', 'B']);
      expect(s.tasks.map((t) => [t.id, t.project, t.status])).toEqual([
        ['t1', 'proj-a', 'in_progress'],
        ['t2', 'proj-a', 'queued'],
        ['t3', 'proj-b', 'review'],
      ]);
      expect(s.goals).toEqual([
        { id: 'g1', project: 'proj-a', title: 'Goal', taskIds: ['t1', 't2'] },
      ]);
      expect(s.runners).toHaveLength(1);
      expect(s.runners[0]).toMatchObject({
        id: 'mac',
        slots: [{ state: 'working', task: { id: 't1' } }],
      });

      const deltas: Delta[] = [];
      src.subscribe((d) => deltas.push(d));
      dash.todos['proj-a']![0]!.status = 'review';
      dash.todos['proj-a']!.pop();
      await src.poll();
      expect(deltas.map((d) => d.kind)).toEqual(['task.upsert', 'runner.upsert', 'task.remove']);
      expect(src.snapshot().runners[0]!.slots[0]!.state).toBe('idle');
    } finally {
      await src.stop();
    }
  });

  it('filters projects with DASH_PROJECTS', async () => {
    const cfg = loadConfig({ DASH_MCP_URL: 'http://x', DASH_PROJECTS: 'B' }).mcp;
    const src = new McpSource(cfg, 60_000, 'Org', quiet, fakeDash().makeClient);
    await src.start();
    expect(src.snapshot().tasks.map((t) => t.id)).toEqual(['t3']);
    await src.stop();
  });

  it('relays chat when a chat tool exists, and reports it as unavailable otherwise', async () => {
    const withChat = new McpSource(
      mcpCfg,
      60_000,
      'Org',
      quiet,
      fakeDash({ chat: true }).makeClient,
    );
    await withChat.start();
    expect(await withChat.chat('hello')).toBe('pm: hello');
    await withChat.stop();

    const without = new McpSource(mcpCfg, 60_000, 'Org', quiet, fakeDash().makeClient);
    await without.start();
    await expect(without.chat('hello')).rejects.toBeInstanceOf(ChatUnavailableError);
    await without.stop();
  });
});

describe('resolveTools', () => {
  it('uses known names, honours overrides and skips missing roles', () => {
    const tools = [{ name: 'list_todos' }, { name: 'my_tasks' }, { name: 'list_projects' }];
    const r = resolveTools(tools, { tasks: 'my_tasks', chat: 'nope' }, quiet);
    expect(r.tasks?.name).toBe('my_tasks');
    expect(r.projects?.name).toBe('list_projects');
    expect(r.chat).toBeUndefined();
    expect(r.runners).toBeUndefined();
  });
});

describe('config', () => {
  it('parses env', () => {
    const c = loadConfig({
      DASH_MCP_COMMAND: 'dash-mcp',
      DASH_MCP_ARGS: '["--org","x y"]',
      DASH_MCP_TRANSPORT: 'stdio',
      DASH_POLL_MS: '5000',
      DASH_TOOL_CHAT: 'pm',
    });
    expect(c.mock).toBe(false);
    expect(c.pollMs).toBe(5000);
    expect(c.mcp).toMatchObject({
      transport: 'stdio',
      command: 'dash-mcp',
      args: ['--org', 'x y'],
      tools: { chat: 'pm' },
    });
    expect(parseArgs('a  b')).toEqual(['a', 'b']);
    expect(() => loadConfig({ DASH_MCP_TRANSPORT: 'carrier-pigeon' })).toThrow();
  });

  it('falls back to mock when nothing is configured, unless MOCK=0', () => {
    expect(loadConfig({}).mock).toBe(true);
    expect(loadConfig({ MOCK: '0' }).mock).toBe(false);
    expect(loadConfig({ MOCK: '1', DASH_MCP_URL: 'http://x' }).mock).toBe(true);
  });
});
