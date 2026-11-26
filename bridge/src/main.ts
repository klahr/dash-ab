import { existsSync } from 'node:fs';
import { loadConfig } from './config.js';
import { McpSource } from './mcp-source.js';
import { MockSource } from './mock-source.js';
import { startServer } from './server.js';
import type { DashSource } from './source.js';

// Load bridge/.env (run from the bridge workspace) without overriding real env vars.
if (existsSync('.env')) process.loadEnvFile('.env');

const cfg = loadConfig();
if (cfg.mock && process.env.MOCK === undefined) {
  console.log(
    '[bridge] no DASH_MCP_URL / DASH_MCP_COMMAND set: using the simulator (MOCK=0 to disable)',
  );
}
const source: DashSource = cfg.mock
  ? new MockSource(cfg.mockTickMs)
  : new McpSource(cfg.mcp, cfg.pollMs, cfg.orgName);

try {
  await source.start();
} catch (err) {
  console.error(`[bridge] could not start: ${err instanceof Error ? err.message : err}`);
  console.error('[bridge] tip: run with MOCK=1 to develop without a Dash server');
  process.exit(1);
}

const wss = startServer(source, cfg.port);
console.log(`[bridge] listening on ws://localhost:${cfg.port} (${cfg.mock ? 'mock' : 'mcp'} mode)`);

const shutdown = () => {
  wss.close();
  void source.stop().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
