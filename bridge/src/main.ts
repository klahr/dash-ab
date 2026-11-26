import { startServer } from './server.js';
import { MockSource } from './source.js';

const port = Number(process.env.BRIDGE_PORT ?? 8787);
startServer(new MockSource(), port);
console.log(`bridge listening on ws://localhost:${port}`);
