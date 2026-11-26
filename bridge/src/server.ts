import { WebSocketServer, type WebSocket } from 'ws';
import { parseClientMessage, type ChatMessage, type ServerMessage } from '@dash-iso/shared';
import type { DashSource } from './source.js';

export function startServer(source: DashSource, port: number): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const chat: ChatMessage[] = [];
  let seq = 0;
  const mk = (role: ChatMessage['role'], text: string): ChatMessage => ({
    id: `m${++seq}`,
    role,
    text,
    timestamp: Date.now(),
  });
  const send = (ws: WebSocket, m: ServerMessage) => ws.send(JSON.stringify(m));
  const broadcast = (m: ServerMessage) => wss.clients.forEach((c) => send(c, m));

  source.subscribe((delta) => broadcast({ type: 'delta', delta }));

  wss.on('connection', (ws) => {
    send(ws, { type: 'snapshot', state: source.snapshot(), chat });
    ws.on('message', async (data) => {
      const msg = parseClientMessage(data.toString());
      if (!msg) return;
      const user = mk('user', msg.text);
      chat.push(user);
      broadcast({ type: 'chat.receive', message: user });
      const reply = mk('assistant', await source.chat(msg.text));
      chat.push(reply);
      broadcast({ type: 'chat.receive', message: reply });
    });
  });
  return wss;
}
