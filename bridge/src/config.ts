/** Bridge configuration, read from environment variables (see bridge/.env.example). */

export type McpTransportKind = 'auto' | 'http' | 'sse' | 'stdio';

export interface McpConfig {
  transport: McpTransportKind;
  /** Streamable HTTP / SSE endpoint, e.g. http://127.0.0.1:7788/mcp. */
  url?: string;
  /** Sent as `Authorization: Bearer <token>` on HTTP/SSE transports. */
  token?: string;
  /** stdio: executable to spawn. */
  command?: string;
  /** stdio: arguments for `command`. */
  args: string[];
  /** Only show these project ids/names (empty = all projects listed by Dash). */
  projects: string[];
  /** Overrides for tool names, e.g. { tasks: 'list_todos' }. */
  tools: Partial<Record<ToolRole, string>>;
}

export type ToolRole = 'projects' | 'tasks' | 'goals' | 'runners' | 'chat';

export interface BridgeConfig {
  port: number;
  pollMs: number;
  mock: boolean;
  /** Simulator tick in mock mode. */
  mockTickMs: number;
  orgName: string;
  mcp: McpConfig;
}

const truthy = (v: string | undefined) =>
  !!v && !['0', 'false', 'no', 'off', ''].includes(v.toLowerCase());

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : fallback;
}

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `DASH_MCP_ARGS` is either a JSON array or a space-separated string. */
export function parseArgs(v: string | undefined): string[] {
  if (!v) return [];
  const t = v.trim();
  if (t.startsWith('[')) {
    const parsed: unknown = JSON.parse(t);
    if (!Array.isArray(parsed)) throw new Error('DASH_MCP_ARGS must be a JSON array of strings');
    return parsed.map(String);
  }
  return t.split(/\s+/).filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const transport = (env.DASH_MCP_TRANSPORT ?? 'auto').toLowerCase() as McpTransportKind;
  if (!['auto', 'http', 'sse', 'stdio'].includes(transport)) {
    throw new Error(`DASH_MCP_TRANSPORT must be auto, http, sse or stdio (got "${transport}")`);
  }
  const tools: McpConfig['tools'] = {};
  for (const role of ['projects', 'tasks', 'goals', 'runners', 'chat'] as const) {
    const v = env[`DASH_TOOL_${role.toUpperCase()}`];
    if (v) tools[role] = v;
  }
  const configured = !!(env.DASH_MCP_URL || env.DASH_MCP_COMMAND);
  return {
    port: num(env.BRIDGE_PORT, 8787),
    pollMs: Math.max(250, num(env.DASH_POLL_MS, 3000)),
    // MOCK=1 forces the simulator; with MOCK unset it is used when no server is configured.
    mock: env.MOCK === undefined || env.MOCK === '' ? !configured : truthy(env.MOCK),
    mockTickMs: Math.max(50, num(env.MOCK_TICK_MS, 1500)),
    orgName: env.DASH_ORG_NAME || 'Dash',
    mcp: {
      transport,
      url: env.DASH_MCP_URL || undefined,
      token: env.DASH_MCP_TOKEN || undefined,
      command: env.DASH_MCP_COMMAND || undefined,
      args: parseArgs(env.DASH_MCP_ARGS),
      projects: list(env.DASH_PROJECTS),
      tools,
    },
  };
}
