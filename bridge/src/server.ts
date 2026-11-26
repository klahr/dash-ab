import { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage, type ChatMessage, type ServerMessage } from '@dash-iso/shared';
import { ChatUnavailableError, type DashSource } from './source.js';

/** Chat messages kept for snapshots sent to newly connected clients. */
const CHAT_HISTORY = 200;

/**
 * WebSocket server for browser clients: a `snapshot` on connect, then
 * `delta`s as the source changes; `chat.send` is relayed to the source and
 * both the message and the reply are broadcast as `chat.receive`.
 */
export function startServer(source: DashSource, port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const chat: ChatMessage[] = [];
  let seq = 0;
  const send = (ws: WebSocket, m: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  };
  const broadcast = (m: ServerMessage) => wss.clients.forEach((c) => send(c, m));
  const post = (role: ChatMessage['role'], text: string) => {
    const message: ChatMessage = { id: `m${++seq}`, role, text, timestamp: Date.now() };
    chat.push(message);
    if (chat.length > CHAT_HISTORY) chat.splice(0, chat.length - CHAT_HISTORY);
    broadcast({ type: 'chat.receive', message });
  };

  const unsubscribe = source.subscribe((delta) => broadcast({ type: 'delta', delta }));
  wss.on('close', unsubscribe);

  wss.on('connection', (ws) => {
    send(ws, { type: 'snapshot', state: source.snapshot(), chat });
    ws.on('message', async (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg || !msg.text.trim()) return;
      post('user', msg.text);
      try {
        post('assistant', await source.chat(msg.text));
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err);
        if (!(err instanceof ChatUnavailableError)) console.error('[bridge] chat failed:', why);
        post('system', err instanceof ChatUnavailableError ? why : `Chat failed: ${why}`);
      }
    });
  });
  return wss;
}
