import { parseServerMessage, type ClientMessage } from '@dash-iso/shared';
import type { Store } from './store.js';

export type ConnectionStatus =
  | { kind: 'connecting'; attempt: number }
  | { kind: 'open' }
  | { kind: 'closed'; retryInMs: number };

/** The subset of the browser WebSocket used here, so tests can pass a fake. */
export interface SocketLike {
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface BridgeOptions {
  /** Called whenever the connection status changes. */
  onStatus?: (s: ConnectionStatus) => void;
  /** Socket factory; defaults to the browser `WebSocket`. */
  createSocket?: (url: string) => SocketLike;
  /** First retry delay; doubles per failed attempt up to `maxDelayMs`. */
  baseDelayMs?: number;
  maxDelayMs?: number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (id: unknown) => void;
}

const OPEN = 1;

/** Delay before reconnect attempt `failures` (1-based): exponential with a cap. */
export function backoffDelay(failures: number, base = 500, max = 10_000): number {
  return Math.min(max, base * 2 ** Math.max(0, failures - 1));
}

/**
 * WebSocket connection to the bridge that feeds a `Store` and reconnects with
 * exponential backoff. Every (re)connect gets a fresh snapshot from the
 * bridge, so no state needs replaying.
 */
export class BridgeConnection {
  private socket: SocketLike | null = null;
  private failures = 0;
  private timer: unknown = null;
  private stopped = false;
  private readonly create: (url: string) => SocketLike;
  private readonly setT: (fn: () => void, ms: number) => unknown;
  private readonly clearT: (id: unknown) => void;

  constructor(
    readonly url: string,
    private readonly store: Store,
    private readonly opts: BridgeOptions = {},
  ) {
    this.create = opts.createSocket ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.setT = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearT = opts.clearTimeout ?? ((id) => clearTimeout(id as number));
    this.open();
  }

  get connected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  send(m: ClientMessage): boolean {
    if (!this.connected) return false;
    this.socket!.send(JSON.stringify(m));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearT(this.timer);
    this.timer = null;
    const s = this.socket;
    this.socket = null;
    if (s) {
      s.onclose = s.onerror = s.onmessage = s.onopen = null;
      s.close();
    }
  }

  private open(): void {
    if (this.stopped) return;
    this.timer = null;
    this.opts.onStatus?.({ kind: 'connecting', attempt: this.failures + 1 });
    let s: SocketLike;
    try {
      s = this.create(this.url);
    } catch {
      this.retry();
      return;
    }
    this.socket = s;
    s.onopen = () => {
      this.failures = 0;
      this.opts.onStatus?.({ kind: 'open' });
    };
    s.onmessage = (ev) => {
      const msg = parseServerMessage(String(ev.data));
      if (msg) this.store.apply(msg);
    };
    s.onerror = () => {
      // `close` always follows; reconnect from there.
    };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      this.retry();
    };
  }

  private retry(): void {
    if (this.stopped || this.timer !== null) return;
    this.failures++;
    const delay = backoffDelay(this.failures, this.opts.baseDelayMs, this.opts.maxDelayMs);
    this.opts.onStatus?.({ kind: 'closed', retryInMs: delay });
    this.timer = this.setT(() => this.open(), delay);
  }
}
