import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Goal, Project, WorldState } from '@dash-iso/shared';
import type { McpConfig, ToolRole } from './config.js';
import {
  buildWorld,
  extractList,
  mapGoal,
  mapProject,
  mapRunner,
  mapTask,
  toolPayload,
  toolText,
  type MappedTask,
  type Raw,
  type RunnerInfo,
} from './mapping.js';
import { ChatUnavailableError, PollingSource, emptyWorld, type Logger } from './source.js';

/** Minimal view of an MCP tool definition. */
export interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] };
}

/**
 * Tool names tried for each role, in order. Dash (v0.26) exposes the first
 * entries for projects, tasks and goals; it has no runner-listing or org chat
 * tool, so those roles stay unresolved unless overridden (see README).
 */
export const TOOL_CANDIDATES: Record<ToolRole, string[]> = {
  projects: ['list_projects'],
  tasks: ['list_todos', 'list_tasks'],
  goals: ['list_goals'],
  runners: ['list_runners', 'get_runners'],
  chat: ['org_chat', 'project_manager', 'ask_project_manager', 'send_chat', 'chat'],
};

export function resolveTools(
  tools: ToolDef[],
  overrides: McpConfig['tools'],
  log: Logger = console,
): Partial<Record<ToolRole, ToolDef>> {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const out: Partial<Record<ToolRole, ToolDef>> = {};
  for (const role of Object.keys(TOOL_CANDIDATES) as ToolRole[]) {
    const override = overrides[role];
    if (override && !byName.has(override)) {
      log.warn(`[mcp] DASH_TOOL_${role.toUpperCase()}=${override} is not a tool on this server`);
    }
    const name = [override, ...TOOL_CANDIDATES[role]].find((n) => n && byName.has(n));
    if (name) out[role] = byName.get(name);
  }
  return out;
}

/** The first of `names` that the tool's input schema declares, if any. */
export function paramOf(tool: ToolDef, names: string[]): string | undefined {
  const props = tool.inputSchema?.properties ?? {};
  return names.find((n) => n in props);
}

export function createTransport(cfg: McpConfig, kind: 'http' | 'sse' | 'stdio'): Transport {
  if (kind === 'stdio') {
    if (!cfg.command) throw new Error('DASH_MCP_COMMAND is required for the stdio transport');
    const env = Object.fromEntries(
      Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
    );
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args,
      env,
      stderr: 'inherit',
    });
  }
  if (!cfg.url) throw new Error('DASH_MCP_URL is required for the http/sse transports');
  const url = new URL(cfg.url);
  const requestInit: RequestInit | undefined = cfg.token
    ? { headers: { Authorization: `Bearer ${cfg.token}` } }
    : undefined;
  return kind === 'http'
    ? new StreamableHTTPClientTransport(url, { requestInit })
    : new SSEClientTransport(url, { requestInit });
}

const CLIENT_INFO = { name: 'dash-isometric-bridge', version: '0.1.0' };

/** Connect with the configured transport; `auto` tries streamable HTTP, then SSE, then stdio. */
export async function connectClient(cfg: McpConfig, log: Logger = console): Promise<Client> {
  const kinds: ('http' | 'sse' | 'stdio')[] =
    cfg.transport !== 'auto'
      ? [cfg.transport]
      : cfg.url
        ? ['http', 'sse']
        : cfg.command
          ? ['stdio']
          : [];
  if (kinds.length === 0) {
    throw new Error(
      'No Dash MCP server configured: set DASH_MCP_URL or DASH_MCP_COMMAND (or MOCK=1)',
    );
  }
  let lastErr: unknown;
  for (const kind of kinds) {
    const client = new Client(CLIENT_INFO);
    try {
      await client.connect(createTransport(cfg, kind));
      log.log(`[mcp] connected via ${kind} to ${kind === 'stdio' ? cfg.command : cfg.url}`);
      return client;
    } catch (err) {
      lastErr = err;
      log.warn(`[mcp] ${kind} connect failed: ${err instanceof Error ? err.message : err}`);
      await client.close().catch(() => {});
    }
  }
  throw lastErr;
}

/** Reads world state from the Dash MCP server by polling its list tools. */
export class McpSource extends PollingSource {
  private client: Client | undefined;
  private tools: Partial<Record<ToolRole, ToolDef>> = {};
  private warned = new Set<string>();

  constructor(
    private readonly cfg: McpConfig,
    intervalMs: number,
    private readonly orgName: string,
    log: Logger = console,
    /** Override how the client is created (tests use an in-memory transport). */
    private readonly makeClient: () => Promise<Client> = () => connectClient(cfg, log),
  ) {
    super(intervalMs, emptyWorld(orgName), log);
  }

  protected override async connect(): Promise<void> {
    const client = await this.makeClient();
    client.onclose = () => {
      if (this.client === client) this.client = undefined;
    };
    this.client = client;
    const { tools } = await client.listTools();
    this.log.log(`[mcp] ${tools.length} tools:`);
    for (const t of tools) {
      this.log.log(
        `  - ${t.name}${t.description ? `: ${t.description.split('\n')[0]!.slice(0, 100)}` : ''}`,
      );
    }
    this.tools = resolveTools(tools as ToolDef[], this.cfg.tools, this.log);
    for (const role of Object.keys(TOOL_CANDIDATES) as ToolRole[]) {
      const t = this.tools[role];
      this.log.log(`[mcp] ${role.padEnd(8)} → ${t ? t.name : '(missing — stubbed, see README)'}`);
    }
  }

  protected override async disconnect(): Promise<void> {
    const c = this.client;
    this.client = undefined;
    await c?.close();
  }

  private warnOnce(key: string, msg: string) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.log.warn(msg);
  }

  private async call(tool: ToolDef, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.client) await this.connect();
    const result = await this.client!.callTool({ name: tool.name, arguments: args });
    if (result.isError)
      throw new Error(`${tool.name} failed: ${toolText(result) || 'unknown error'}`);
    return result;
  }

  /** Call a list tool and return its records; plain-text output is reported once and treated as empty. */
  private async list(tool: ToolDef, args: Record<string, unknown>, keys: string[]): Promise<Raw[]> {
    const result = await this.call(tool, args);
    const payload = toolPayload(result);
    if (payload === undefined) {
      this.warnOnce(
        `text:${tool.name}`,
        `[mcp] ${tool.name} returned text, not JSON; cannot map it. First line: ${toolText(result).split('\n')[0]}`,
      );
      return [];
    }
    return extractList(payload, keys);
  }

  /** Call `tool` once per project if it takes a project argument, else once. */
  private async perProject(
    tool: ToolDef,
    projects: Project[],
    keys: string[],
  ): Promise<{ raw: Raw; project: string }[]> {
    const param = paramOf(tool, ['project', 'project_id', 'projectId']);
    if (!param) {
      const fallback = projects[0]?.id ?? 'default';
      return (await this.list(tool, {}, keys)).map((raw) => ({ raw, project: fallback }));
    }
    const lists = await Promise.all(
      projects.map(async (p) =>
        (await this.list(tool, { [param]: p.id }, keys)).map((raw) => ({ raw, project: p.id })),
      ),
    );
    return lists.flat();
  }

  protected override async fetchWorld(prev: WorldState): Promise<WorldState> {
    const org = { id: 'org', name: this.orgName };
    const { projects: pTool, tasks: tTool, goals: gTool, runners: rTool } = this.tools;

    let projects: Project[];
    if (pTool) {
      projects = (await this.list(pTool, {}, ['projects']))
        .map((r) => mapProject(r, org.id))
        .filter((p): p is Project => !!p);
    } else {
      projects = (this.cfg.projects.length ? this.cfg.projects : ['default']).map((id) => ({
        id,
        orgId: org.id,
        name: id,
      }));
    }
    const filter = this.cfg.projects;
    if (filter.length)
      projects = projects.filter((p) => filter.includes(p.id) || filter.includes(p.name));

    const [tasks, goals, runners] = await Promise.all([
      tTool
        ? this.perProject(tTool, projects, ['todos', 'tasks']).then((xs) =>
            xs.map((x) => mapTask(x.raw, x.project)).filter((t): t is MappedTask => !!t),
          )
        : Promise.resolve([] as MappedTask[]),
      gTool
        ? this.perProject(gTool, projects, ['goals']).then((xs) =>
            xs.map((x) => mapGoal(x.raw, x.project)).filter((g): g is Goal => !!g),
          )
        : Promise.resolve([] as Goal[]),
      rTool
        ? this.list(rTool, {}, ['runners']).then((xs) =>
            xs.map(mapRunner).filter((r): r is RunnerInfo => !!r),
          )
        : Promise.resolve(null),
    ]);
    return buildWorld({ org, projects, tasks, goals, runners }, prev);
  }

  async chat(text: string): Promise<string> {
    const tool = this.tools.chat;
    if (!tool) {
      throw new ChatUnavailableError(
        'This Dash MCP server has no org-level chat tool, so chat is not relayed. ' +
          'Set DASH_TOOL_CHAT if your server exposes one, or run the bridge with MOCK=1.',
      );
    }
    const props = tool.inputSchema?.properties ?? {};
    const param =
      paramOf(tool, ['message', 'text', 'prompt', 'content', 'question']) ??
      tool.inputSchema?.required?.find(
        (k) => (props[k] as { type?: string } | undefined)?.type === 'string',
      ) ??
      'message';
    const result = await this.call(tool, { [param]: text });
    return toolText(result) || JSON.stringify(toolPayload(result) ?? null);
  }
}
