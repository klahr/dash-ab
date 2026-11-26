import {
  applyDelta,
  type ChatMessage,
  type ServerMessage,
  type WorldState,
} from '@dash-iso/shared';

export type StoreListener = (store: Store) => void;

/**
 * Client-side mirror of the bridge's world. Fed by `snapshot` (replaces
 * everything) and `delta` (applied in order) messages; listeners are told after
 * every change. Deltas that arrive before the first snapshot are dropped: the
 * snapshot that follows a (re)connect is always complete.
 */
export class Store {
  state: WorldState | null = null;
  chat: ChatMessage[] = [];
  /** Bumped on every change, so consumers can cheaply tell whether to re-render. */
  version = 0;
  private readonly listeners = new Set<StoreListener>();

  subscribe(fn: StoreListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Replace the state wholesale (fixture mode or tests). */
  setState(state: WorldState): void {
    this.state = state;
    this.changed();
  }

  /** Apply one server message. Returns false when it was ignored. */
  apply(msg: ServerMessage): boolean {
    switch (msg.type) {
      case 'snapshot':
        this.state = msg.state;
        this.chat = msg.chat;
        break;
      case 'delta':
        if (!this.state) return false;
        this.state = applyDelta(this.state, msg.delta);
        break;
      case 'chat.receive':
        if (this.chat.some((m) => m.id === msg.message.id)) return false;
        this.chat = [...this.chat, msg.message];
        break;
    }
    this.changed();
    return true;
  }

  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn(this);
  }
}
