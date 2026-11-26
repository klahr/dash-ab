import type { Goal, Project, TaskStatus, WorldState } from '@dash-iso/shared';
import { buildWorld, type MappedTask, type RunnerInfo } from './mapping.js';
import { PollingSource, type Logger } from './source.js';

/** Small seeded PRNG (mulberry32) so simulations are reproducible in tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimTask {
  id: string;
  title: string;
  project: string;
  status: TaskStatus;
  runner?: string;
  slot?: number;
  /** Ticks left in the current status. */
  ticks: number;
  /** Tick at which it reached merged/failed. */
  finishedAt?: number;
}

export interface SimOptions {
  random?: () => number;
  /** Probability per tick that a running task fails instead of reaching review. */
  failRate?: number;
  /** Max number of queued tasks to keep around. */
  maxQueued?: number;
  /** Finished tasks are dropped after this many ticks. */
  keepFinishedTicks?: number;
}

const TITLES = [
  'Add isometric camera controls',
  'Fix flaky websocket reconnect',
  'Render runner slots as desks',
  'Animate task hand-off',
  'Cache MCP tool listing',
  'Dark mode for chat panel',
  'Show goal progress rings',
  'Tidy up lint warnings',
  'Upgrade three.js',
  'Add keyboard shortcuts',
  'Profile frame time on low-end GPUs',
  'Write onboarding docs',
  'Persist camera position',
  'Highlight failed tasks',
  'Batch delta messages',
];

export const SIM_PROJECTS: Project[] = [
  { id: 'proj-atlas', orgId: 'org-mock', name: 'Atlas' },
  { id: 'proj-beacon', orgId: 'org-mock', name: 'Beacon' },
];

export const SIM_RUNNERS: RunnerInfo[] = [
  { id: 'runner-alpha', name: 'alpha', online: true, slotCount: 1 },
  { id: 'runner-bravo', name: 'bravo', online: true, slotCount: 2 },
  { id: 'runner-charlie', name: 'charlie', online: true, slotCount: 4 },
  { id: 'runner-delta', name: 'delta', online: true, slotCount: 3 },
];

/**
 * Fake Dash: tasks are created as `queued`, picked up by a free runner slot
 * (`in_progress`), then go to `review` (or occasionally `failed`), and finally
 * `merged` (or, rarely, `failed`). Runner `delta` sometimes drops offline,
 * failing its running tasks.
 */
export class Simulator {
  tickCount = 0;
  private tasks: SimTask[] = [];
  private runners: RunnerInfo[] = SIM_RUNNERS.map((r) => ({ ...r }));
  private goals: Goal[] = SIM_PROJECTS.map((p, i) => ({
    id: `goal-${i + 1}`,
    project: p.id,
    title: i === 0 ? 'Ship the isometric MVP' : 'Harden the bridge',
    taskIds: [],
  }));
  private nextId = 1;
  private readonly rnd: () => number;
  private readonly failRate: number;
  private readonly maxQueued: number;
  private readonly keepFinished: number;

  constructor(opts: SimOptions = {}) {
    this.rnd = opts.random ?? Math.random;
    this.failRate = opts.failRate ?? 0.12;
    this.maxQueued = opts.maxQueued ?? 4;
    this.keepFinished = opts.keepFinishedTicks ?? 12;
    for (let i = 0; i < 5; i++) this.spawn();
  }

  private between(lo: number, hi: number) {
    return lo + Math.floor(this.rnd() * (hi - lo + 1));
  }

  private spawn() {
    const project = SIM_PROJECTS[this.between(0, SIM_PROJECTS.length - 1)]!;
    const id = `task-${this.nextId++}`;
    const title = TITLES[(this.nextId - 2) % TITLES.length]!;
    this.tasks.push({ id, title, project: project.id, status: 'queued', ticks: 0 });
    const goal = this.goals.find((g) => g.project === project.id);
    if (goal && this.rnd() < 0.5) goal.taskIds = [...goal.taskIds, id];
  }

  private finish(t: SimTask, status: 'merged' | 'failed') {
    t.status = status;
    t.runner = undefined;
    t.slot = undefined;
    t.finishedAt = this.tickCount;
  }

  /** Advance one step and return the new world. */
  tick(): WorldState {
    this.tickCount++;

    // Runner delta flaps occasionally.
    const delta = this.runners.find((r) => r.id === 'runner-delta')!;
    if (this.rnd() < (delta.online ? 0.03 : 0.25)) delta.online = !delta.online;

    for (const t of this.tasks) {
      if (t.status === 'in_progress') {
        const runner = this.runners.find((r) => r.id === t.runner);
        if (!runner?.online) this.finish(t, 'failed');
        else if (--t.ticks <= 0) {
          if (this.rnd() < this.failRate) this.finish(t, 'failed');
          else
            Object.assign(t, {
              status: 'review',
              runner: undefined,
              slot: undefined,
              ticks: this.between(1, 3),
            });
        }
      } else if (t.status === 'review' && --t.ticks <= 0) {
        this.finish(t, this.rnd() < 0.05 ? 'failed' : 'merged');
      }
    }

    // Hand queued tasks to free slots on online runners.
    for (const t of this.tasks.filter((x) => x.status === 'queued')) {
      const free = this.freeSlots();
      if (free.length === 0) break;
      if (this.rnd() < 0.3) continue; // not every task starts the moment a slot frees up
      const [runner, slot] = free[this.between(0, free.length - 1)]!;
      Object.assign(t, { status: 'in_progress', runner, slot, ticks: this.between(2, 6) });
    }

    // Keep the queue topped up and drop old finished tasks.
    const queued = this.tasks.filter((t) => t.status === 'queued').length;
    if (queued < this.maxQueued && this.rnd() < 0.6) this.spawn();
    const dropped = new Set(
      this.tasks
        .filter(
          (t) => t.finishedAt !== undefined && this.tickCount - t.finishedAt > this.keepFinished,
        )
        .map((t) => t.id),
    );
    if (dropped.size) {
      this.tasks = this.tasks.filter((t) => !dropped.has(t.id));
      for (const g of this.goals) g.taskIds = g.taskIds.filter((id) => !dropped.has(id));
    }
    return this.world();
  }

  private freeSlots(): [string, number][] {
    const out: [string, number][] = [];
    for (const r of this.runners) {
      if (!r.online) continue;
      for (let i = 0; i < r.slotCount; i++) {
        if (
          !this.tasks.some((t) => t.status === 'in_progress' && t.runner === r.id && t.slot === i)
        )
          out.push([r.id, i]);
      }
    }
    return out;
  }

  /** Current world, built through the same mapping path as real Dash data. */
  world(): WorldState {
    const tasks: MappedTask[] = this.tasks.map((t) => ({
      task: { id: t.id, title: t.title, project: t.project, status: t.status },
      runner: t.runner,
      slot: t.slot,
    }));
    return buildWorld({
      org: { id: 'org-mock', name: 'Mock Org' },
      projects: SIM_PROJECTS,
      tasks,
      goals: this.goals.map((g) => ({ ...g, taskIds: [...g.taskIds] })),
      runners: this.runners.map((r) => ({ ...r })),
    });
  }
}

/** Canned project-manager replies, with a little awareness of the current state. */
export function cannedReply(text: string, world: WorldState): string {
  const q = text.toLowerCase();
  const count = (s: TaskStatus) => world.tasks.filter((t) => t.status === s).length;
  if (/\b(hi|hello|hey)\b/.test(q))
    return "Hi! I'm the mock project manager. Ask me about status, runners or failures.";
  if (q.includes('status') || q.includes('progress')) {
    return (
      `${count('queued')} queued, ${count('in_progress')} in progress, ${count('review')} in review, ` +
      `${count('merged')} merged and ${count('failed')} failed.`
    );
  }
  if (q.includes('runner') || q.includes('slot')) {
    return world.runners
      .map((r) => {
        const busy = r.slots.filter((s) => s.state === 'working').length;
        return `${r.name}: ${r.online ? `${busy}/${r.slots.length} slots busy` : 'offline'}`;
      })
      .join('; ');
  }
  if (q.includes('fail')) {
    const failed = world.tasks.filter((t) => t.status === 'failed').map((t) => t.title);
    return failed.length
      ? `Recently failed: ${failed.join(', ')}. I'd requeue them.`
      : 'Nothing has failed lately.';
  }
  if (q.includes('help')) return 'Try asking: "status", "how are the runners?", "what failed?".';
  return `Noted: "${text}". (This is a canned reply from MOCK mode; connect a real Dash for actual answers.)`;
}

export interface MockSourceOptions extends SimOptions {
  /** Simulated reply latency in ms. */
  chatDelayMs?: number;
}

/** `DashSource` backed by the simulator; each poll advances one tick. */
export class MockSource extends PollingSource {
  readonly sim: Simulator;
  private readonly chatDelayMs: number;

  constructor(tickMs = 1500, opts: MockSourceOptions = {}, log?: Logger) {
    const sim = new Simulator(opts);
    super(tickMs, sim.world(), log);
    this.sim = sim;
    this.chatDelayMs = opts.chatDelayMs ?? 400;
  }

  protected override async fetchWorld(): Promise<WorldState> {
    return this.sim.tick();
  }

  override async start(): Promise<void> {
    this.log.log('[mock] simulating 4 runners and a canned chat responder');
    await super.start();
  }

  async chat(text: string): Promise<string> {
    if (this.chatDelayMs) await new Promise((r) => setTimeout(r, this.chatDelayMs));
    return cannedReply(text, this.state);
  }
}
