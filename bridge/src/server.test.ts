import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket, type WebSocketServer } from 'ws';
import { parseServerMessage, type ServerMessage } from '@dash-iso/shared';
import { startServer } from './server.js';
import { MockSource, seededRandom } from './mock-source.js';
import { ChatUnavailableError, PollingSource, emptyWorld } from './source.js';

const quiet = { log: () => {}, warn: () => {}, error: () => {} };

let wss: WebSocketServer | undefined;
afterEach(() => new Promise<void>((r) => (wss ? wss.close(() => r()) : r())));

type Until = (msgs: ServerMessage[]) => boolean;
const chatCount = (msgs: ServerMessage[]) => msgs.filter((m) => m.type === 'chat.receive').length;

/** Connect, send `text` once open, and collect messages until `until` holds. */
async function exchange(
  server: WebSocketServer,
  until: Until,
  text?: string,
  during?: () => Promise<unknown>,
) {
  const { port } = server.address() as { port: number };
  const ws = new WebSocket(`ws://localhost:${port}`);
  const msgs: ServerMessage[] = [];
  const done = new Promise<void>((resolve) => {
    ws.on('message', (d) => {
      const m = parseServerMessage(d.toString());
      if (m) msgs.push(m);
      if (until(msgs)) resolve();
    });
  });
  await new Promise((r) => ws.on('open', r));
  if (text) ws.send(JSON.stringify({ type: 'chat.send', text }));
  await during?.();
  await done;
  ws.close();
  return msgs;
}

describe('bridge server', () => {
  it('sends a snapshot, relays chat and pushes deltas', async () => {
    const src = new MockSource(1000, { random: seededRandom(2), chatDelayMs: 0 }, quiet);
    wss = startServer(src, 0);
    const msgs = await exchange(
      wss,
      (ms) => chatCount(ms) === 2 && ms.some((m) => m.type === 'delta'),
      'status?',
      async () => {
        // advance the simulation until something changes
        for (let i = 0; i < 20 && (await src.poll()).length === 0; i++);
      },
    );
    expect(msgs[0]?.type).toBe('snapshot');
    const chat = msgs.filter((m) => m.type === 'chat.receive');
    expect(chat.map((m) => m.type === 'chat.receive' && m.message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(msgs.some((m) => m.type === 'delta')).toBe(true);
  });

  it('answers with a system message when chat is unavailable', async () => {
    class NoChat extends PollingSource {
      protected async fetchWorld() {
        return emptyWorld();
      }
      async chat(): Promise<string> {
        throw new ChatUnavailableError('no chat here');
      }
    }
    wss = startServer(new NoChat(1000, emptyWorld(), quiet), 0);
    const msgs = await exchange(wss, (ms) => chatCount(ms) === 2, 'hi');
    const last = msgs.at(-1);
    expect(last?.type === 'chat.receive' && last.message).toMatchObject({
      role: 'system',
      text: 'no chat here',
    });
  });
});
