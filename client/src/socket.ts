import {
  applyDelta,
  parseServerMessage,
  type ChatMessage,
  type ClientMessage,
  type WorldState,
} from '@dash-iso/shared';

export interface ClientStore {
  state: WorldState | null;
  chat: ChatMessage[];
}

/** Connects to the bridge and keeps a local mirror of world state. */
export function connect(url: string, onChange: (s: ClientStore) => void) {
  const store: ClientStore = { state: null, chat: [] };
  const ws = new WebSocket(url);
  ws.onmessage = (ev) => {
    const msg = parseServerMessage(String(ev.data));
    if (!msg) return;
    if (msg.type === 'snapshot') {
      store.state = msg.state;
      store.chat = msg.chat;
    } else if (msg.type === 'delta' && store.state) {
      store.state = applyDelta(store.state, msg.delta);
    } else if (msg.type === 'chat.receive') {
      store.chat = [...store.chat, msg.message];
    }
    onChange(store);
  };
  return {
    ws,
    send: (m: ClientMessage) => ws.send(JSON.stringify(m)),
  };
}
