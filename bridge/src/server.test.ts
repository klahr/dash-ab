import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, type WebSocketServer } from 'ws';
import { parseServerMessage, type ServerMessage } from '@dash-iso/shared';
import { startServer } from './server.js';
import { MockSource } from './source.js';

let wss: WebSocketServer | undefined;
afterEach(() => new Promise<void>((r) => (wss ? wss.close(() => r()) : r())));

describe('bridge server', () => {
  it('sends a snapshot then echoes chat', async () => {
    wss = startServer(new MockSource(), 0);
    const { port } = wss.address() as { port: number };
    const ws = new WebSocket(`ws://localhost:${port}`);
    const msgs: ServerMessage[] = [];
    const done = new Promise<void>((resolve) => {
      ws.on('message', (d) => {
        const m = parseServerMessage(d.toString());
        if (m) msgs.push(m);
        if (msgs.length === 3) resolve();
      });
    });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'chat.send', text: 'hello' })));
    await done;
    ws.close();
    expect(msgs[0]?.type).toBe('snapshot');
    expect(msgs.slice(1).map((m) => m.type)).toEqual(['chat.receive', 'chat.receive']);
  });
});
