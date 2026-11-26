import type { Task, TaskStatus, WorldState } from '@dash-iso/shared';

/**
 * Recent-events log for the HUD ticker, worked out by comparing successive
 * world snapshots (Dash pushes no events of its own). Also keeps the
 * "merged today" tally, which survives Dash dropping finished tasks.
 */

export type EventKind =
  'queued' | 'started' | 'review' | 'merging' | 'merged' | 'failed' | 'offline' | 'online';

export interface OfficeEvent {
  /** Unique, increasing. */
  seq: number;
  kind: EventKind;
  text: string;
  /** Epoch ms when the client saw it. */
  at: number;
  taskId?: string;
  project?: string;
  runnerId?: string;
}

export const EVENT_ICON: Record<EventKind, string> = {
  queued: '🪑',
  started: '🏃',
  review: '📂',
  merging: '🔀',
  merged: '🏆',
  failed: '🔧',
  offline: '🌙',
  online: '💡',
};

type Draft = Omit<OfficeEvent, 'seq' | 'at'>;

function runnerName(state: WorldState, taskId: string): { id: string; name: string } | undefined {
  const r = state.runners.find((x) => x.slots.some((s) => s.task?.id === taskId));
  return r ? { id: r.id, name: r.name } : undefined;
}

const STATUS_EVENT: Partial<Record<TaskStatus, EventKind>> = {
  queued: 'queued',
  in_progress: 'started',
  review: 'review',
  merging: 'merging',
  merged: 'merged',
  failed: 'failed',
};

function describe(kind: EventKind, t: Task, project: string, runner?: string): string {
  const title = `“${t.title}”`;
  switch (kind) {
    case 'queued':
      return `${title} is waiting in reception (${project})`;
    case 'started':
      return runner ? `${runner} picked up ${title}` : `${title} started`;
    case 'review':
      return `${title} landed in the review tray`;
    case 'merging':
      return `${title} is merging`;
    case 'merged':
      return `${title} merged — trophy for ${project}!`;
    case 'failed':
      return `${title} failed — into the repair bin`;
    default:
      return title;
  }
}

/**
 * Events between two snapshots, in a stable order (tasks, then runners). The
 * first snapshot (`prev` null) yields nothing: we don't know what changed.
 */
export function diffEvents(prev: WorldState | null, next: WorldState): Draft[] {
  if (!prev) return [];
  const out: Draft[] = [];
  const before = new Map(prev.tasks.map((t) => [t.id, t.status]));
  const project = (id: string) => next.projects.find((p) => p.id === id)?.name ?? id;
  for (const t of next.tasks) {
    const was = before.get(t.id);
    if (was === t.status) continue;
    const kind = STATUS_EVENT[t.status];
    if (!kind) continue;
    const runner = kind === 'started' ? runnerName(next, t.id) : undefined;
    out.push({
      kind,
      text: describe(kind, t, project(t.project), runner?.name),
      taskId: t.id,
      project: t.project,
      runnerId: runner?.id,
    });
  }
  const wasOnline = new Map(prev.runners.map((r) => [r.id, r.online]));
  for (const r of next.runners) {
    const was = wasOnline.get(r.id);
    if (was === undefined || was === r.online) continue;
    out.push({
      kind: r.online ? 'online' : 'offline',
      text: r.online ? `${r.name} is back online` : `${r.name} went offline — lights out`,
      runnerId: r.id,
    });
  }
  return out;
}

/** Local midnight at or before `now`. */
export function startOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export class EventLog {
  private list: OfficeEvent[] = [];
  private seq = 0;
  private prev: WorldState | null = null;
  /** Task id → when it merged and its project, for tasks merged today. */
  private readonly merged = new Map<string, { at: number; project: string }>();

  constructor(private readonly max = 60) {}

  /** Newest first. */
  get events(): readonly OfficeEvent[] {
    return this.list;
  }

  /** Feed the next snapshot; returns the new events (oldest first). */
  observe(state: WorldState, now = Date.now()): OfficeEvent[] {
    const drafts = diffEvents(this.prev, state);
    const fresh = drafts.map((d) => ({ ...d, seq: ++this.seq, at: now }));
    if (fresh.length) this.list = [...[...fresh].reverse(), ...this.list].slice(0, this.max);
    // Merged today: Dash's timestamp when it has one, else when we saw it merge.
    const was = new Map(this.prev?.tasks.map((t) => [t.id, t.status]));
    for (const t of state.tasks) {
      if (t.status !== 'merged' || this.merged.has(t.id)) continue;
      // Without a timestamp, only count merges we watched happen.
      const seen = this.prev !== null && was.get(t.id) !== 'merged';
      const at = t.updatedAt ?? (seen ? now : undefined);
      if (at !== undefined) this.merged.set(t.id, { at, project: t.project });
    }
    const midnight = startOfDay(now);
    for (const [id, m] of this.merged) if (m.at < midnight) this.merged.delete(id);
    this.prev = state;
    return fresh;
  }

  /** Tasks merged since local midnight (optionally for one project). */
  mergedToday(filter: string | null = null, now = Date.now()): number {
    const midnight = startOfDay(now);
    let n = 0;
    for (const m of this.merged.values())
      if (m.at >= midnight && (filter === null || m.project === filter)) n++;
    return n;
  }

  /** Ids of tasks counted as merged today. */
  mergedTodayIds(filter: string | null = null, now = Date.now()): string[] {
    const midnight = startOfDay(now);
    return [...this.merged]
      .filter(([, m]) => m.at >= midnight && (filter === null || m.project === filter))
      .map(([id]) => id);
  }

  /** Events matching a project filter (runner events always pass). */
  filtered(filter: string | null): OfficeEvent[] {
    return filter === null
      ? [...this.list]
      : this.list.filter((e) => e.project === undefined || e.project === filter);
  }
}
