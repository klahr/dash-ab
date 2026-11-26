import { describe, expect, it } from 'vitest';
import { mockSnapshot, type ServerMessage } from '@dash-iso/shared';
import {
  BridgeConnection,
  backoffDelay,
  type ConnectionStatus,
  type SocketLike,
} from './socket.js';
import { Store } from './store.js';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  onmessage: SocketLike['onmessage'] = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop() {
    this.readyState = 3;
    this.onerror?.({});
    this.onclose?.({});
  }
  receive(m: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
}

function harness() {
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  const statuses: ConnectionStatus[] = [];
  const store = new Store();
  const conn = new BridgeConnection('ws://test', store, {
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    setTimeout: (fn, ms) => timers.push({ fn, ms }) - 1,
    clearTimeout: () => {},
    onStatus: (s) => statuses.push(s),
  });
  const fire = () => timers.shift()!.fn();
  return { sockets, timers, statuses, store, conn, fire };
}

describe('Store', () => {
  it('takes snapshots, applies deltas and appends chat', () => {
    const store = new Store();
    let calls = 0;
    store.subscribe(() => calls++);
    const state = mockSnapshot();
    expect(store.apply({ type: 'delta', delta: { kind: 'task.remove', id: 'task-1' } })).toBe(
      false,
    );
    store.apply({ type: 'snapshot', state, chat: [] });
    store.apply({ type: 'delta', delta: { kind: 'task.remove', id: 'task-1' } });
    expect(store.state!.tasks.some((t) => t.id === 'task-1')).toBe(false);
    const message = { id: 'm1', role: 'user' as const, text: 'hi', timestamp: 1 };
    store.apply({ type: 'chat.receive', message });
    store.apply({ type: 'chat.receive', message });
    expect(store.chat).toHaveLength(1);
    expect(calls).toBe(3);
    expect(store.version).toBe(3);
  });
});

describe('BridgeConnection', () => {
  it('feeds the store from the socket', () => {
    const { sockets, store, statuses } = harness();
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'snapshot', state: mockSnapshot(), chat: [] });
    expect(store.state?.runners.length).toBeGreaterThan(0);
    expect(statuses.map((s) => s.kind)).toEqual(['connecting', 'open']);
  });

  it('reconnects with backoff and resets it after a successful open', () => {
    const { sockets, timers, statuses, fire } = harness();
    sockets[0]!.drop();
    expect(timers[0]!.ms).toBe(500);
    fire();
    sockets[1]!.drop();
    expect(timers[0]!.ms).toBe(1000);
    fire();
    sockets[2]!.open();
    sockets[2]!.drop();
    expect(timers[0]!.ms).toBe(500);
    expect(sockets).toHaveLength(3);
    expect(statuses.at(-1)).toEqual({ kind: 'closed', retryInMs: 500 });
  });

  it('a new snapshot after reconnect replaces stale state', () => {
    const { sockets, store, fire } = harness();
    sockets[0]!.open();
    sockets[0]!.receive({ type: 'snapshot', state: mockSnapshot(), chat: [] });
    sockets[0]!.drop();
    fire();
    const next = { ...mockSnapshot(), runners: [] };
    sockets[1]!.open();
    sockets[1]!.receive({ type: 'snapshot', state: next, chat: [] });
    expect(store.state!.runners).toEqual([]);
  });

  it('stops for good on close and only sends while open', () => {
    const { sockets, timers, conn } = harness();
    expect(conn.send({ type: 'chat.send', text: 'x' })).toBe(false);
    sockets[0]!.open();
    expect(conn.send({ type: 'chat.send', text: 'x' })).toBe(true);
    expect(sockets[0]!.sent).toHaveLength(1);
    conn.close();
    expect(sockets[0]!.closed).toBe(true);
    expect(timers).toHaveLength(0);
  });

  it('caps the backoff', () => {
    expect(backoffDelay(1)).toBe(500);
    expect(backoffDelay(3)).toBe(2000);
    expect(backoffDelay(20)).toBe(10_000);
  });
});
