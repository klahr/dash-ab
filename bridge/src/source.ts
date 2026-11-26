import { applyDelta, type Delta, type WorldState } from '@dash-iso/shared';
import { diffWorld } from './diff.js';

/**
 * Where the bridge gets world state and chat replies from: the Dash MCP
 * server (`McpSource`) or the simulator (`MockSource`, `MOCK=1`).
 */
export interface DashSource {
  /** Connect and load the first state; resolves once `snapshot()` is meaningful. */
  start(): Promise<void>;
  stop(): Promise<void>;
  snapshot(): WorldState;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(onDelta: (d: Delta) => void): () => void;
  /**
   * Send a chat message to Dash and resolve with the reply text. Rejects with
   * `ChatUnavailableError` when the source has no chat capability.
   */
  chat(text: string): Promise<string>;
}

export class ChatUnavailableError extends Error {
  override name = 'ChatUnavailableError';
}

export type Logger = Pick<Console, 'log' | 'warn' | 'error'>;

export const emptyWorld = (orgName = 'Dash'): WorldState => ({
  org: { id: 'org', name: orgName },
  projects: [],
  runners: [],
  tasks: [],
  goals: [],
});

/**
 * Base for sources that periodically read a full world state: each poll is
 * diffed against the previous state and the resulting deltas are emitted.
 */
export abstract class PollingSource implements DashSource {
  protected state: WorldState;
  private listeners = new Set<(d: Delta) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private inFlight = false;

  constructor(
    protected readonly intervalMs: number,
    initial: WorldState,
    protected readonly log: Logger = console,
  ) {
    this.state = initial;
  }

  /** Read the current world. `prev` is the last state, for sticky data. */
  protected abstract fetchWorld(prev: WorldState): Promise<WorldState>;
  abstract chat(text: string): Promise<string>;

  /** Hook for subclasses to connect before the first poll. */
  protected async connect(): Promise<void> {}
  protected async disconnect(): Promise<void> {}

  async start(): Promise<void> {
    await this.connect();
    await this.poll();
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
  }

  async stop(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await this.disconnect();
  }

  snapshot(): WorldState {
    return this.state;
  }

  subscribe(onDelta: (d: Delta) => void): () => void {
    this.listeners.add(onDelta);
    return () => this.listeners.delete(onDelta);
  }

  /** Fetch, diff and emit once. Returns the emitted deltas. Errors are logged, not thrown. */
  async poll(): Promise<Delta[]> {
    if (this.inFlight) return [];
    this.inFlight = true;
    try {
      const next = await this.fetchWorld(this.state);
      const deltas = diffWorld(this.state, next);
      for (const d of deltas) {
        this.state = applyDelta(this.state, d);
        this.listeners.forEach((l) => l(d));
      }
      return deltas;
    } catch (err) {
      this.log.error('[bridge] poll failed:', err instanceof Error ? err.message : err);
      return [];
    } finally {
      this.inFlight = false;
    }
  }
}
