/**
 * Pure mapping from Dash MCP tool results onto the shared domain model.
 *
 * Dash's tools don't publish output schemas, so these functions accept the
 * field names Dash uses (`todo_id`, `project_id`, `runner_name`, ...) as well as
 * common alternatives, and ignore anything they don't recognise.
 */
import type {
  Goal,
  Org,
  Project,
  Runner,
  Slot,
  Task,
  TaskStatus,
  WorldState,
} from '@dash-iso/shared';

export type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/** First non-empty string (or finite number, stringified) among `keys` of `o`. */
export function pick(o: Raw, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (isObj(v)) {
      const inner = pick(v, 'id', 'name');
      if (inner) return inner;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool results

interface ToolResultLike {
  content?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
}

/**
 * The JSON payload of an MCP tool result: `structuredContent` if present,
 * otherwise the first text content block that parses as JSON. Returns
 * `undefined` for plain-text results.
 */
export function toolPayload(result: unknown): unknown {
  if (!isObj(result)) return undefined;
  const r = result as ToolResultLike;
  if (r.structuredContent !== undefined) return r.structuredContent;
  if (!Array.isArray(r.content)) return undefined;
  for (const block of r.content) {
    if (isObj(block) && block.type === 'text' && typeof block.text === 'string') {
      try {
        return JSON.parse(block.text);
      } catch {
        // not JSON; try the next block
      }
    }
  }
  return undefined;
}

/** All text content of an MCP tool result, joined. */
export function toolText(result: unknown): string {
  if (!isObj(result) || !Array.isArray(result.content)) return '';
  return result.content
    .filter((b): b is Raw => isObj(b) && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim();
}

/**
 * Pull a list of records out of a payload: the payload itself if it is an
 * array, else the first of `keys` holding an array, else the only array-valued
 * property.
 */
export function extractList(payload: unknown, keys: string[]): Raw[] {
  const only = (a: unknown[]) => a.filter(isObj);
  if (Array.isArray(payload)) return only(payload);
  if (!isObj(payload)) return [];
  for (const k of [...keys, 'items', 'results', 'data']) {
    const v = payload[k];
    if (Array.isArray(v)) return only(v);
  }
  const arrays = Object.values(payload).filter(Array.isArray);
  return arrays.length === 1 ? only(arrays[0] as unknown[]) : [];
}

// ---------------------------------------------------------------------------
// Statuses

const STATUS_ALIASES: Record<string, TaskStatus> = {
  draft: 'draft',
  todo: 'draft',
  new: 'draft',
  queued: 'queued',
  pending: 'queued',
  waiting: 'queued',
  waiting_build: 'queued',
  scheduled: 'queued',
  blocked: 'queued',
  running: 'in_progress',
  in_progress: 'in_progress',
  working: 'in_progress',
  started: 'in_progress',
  active: 'in_progress',
  review: 'review',
  in_review: 'review',
  needs_review: 'review',
  approved: 'review',
  merging: 'merging',
  merged: 'merged',
  done: 'merged',
  completed: 'merged',
  closed: 'merged',
  failed: 'failed',
  error: 'failed',
  errored: 'failed',
  stopped: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
  out_of_budget: 'failed',
};

/** Map a Dash task status string onto `TaskStatus`; unknown values become `draft`. */
export function mapTaskStatus(raw: string | undefined): TaskStatus {
  if (!raw) return 'draft';
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return STATUS_ALIASES[key] ?? 'draft';
}

/** Statuses during which a task occupies a runner slot. */
export const ACTIVE_STATUSES: ReadonlySet<TaskStatus> = new Set(['in_progress', 'merging']);

// ---------------------------------------------------------------------------
// Entities

export function mapProject(raw: Raw, orgId: string): Project | null {
  const id = pick(raw, 'id', 'project_id', 'key', 'slug', 'name');
  if (!id) return null;
  return { id, orgId, name: pick(raw, 'name', 'title', 'slug', 'key') ?? id };
}

/** A task plus where Dash says it is running, if it says so. */
export interface MappedTask {
  task: Task;
  runner?: string;
  slot?: number;
}

function firstLine(s: string, max = 80): string {
  const line = s.split('\n')[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/**
 * Epoch milliseconds from an ISO date string or a number (values below 1e12
 * are taken to be seconds).
 */
export function parseTime(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return parseTime(n);
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

const TIME_KEYS = [
  'merged_at',
  'finished_at',
  'completed_at',
  'updated_at',
  'updatedAt',
  'modified_at',
] as const;

export function mapTask(raw: Raw, fallbackProject: string): MappedTask | null {
  const id = pick(raw, 'id', 'todo_id', 'task_id');
  if (!id) return null;
  const prompt = pick(raw, 'prompt', 'instructions', 'task_instructions');
  const title = pick(raw, 'title', 'name', 'todo_title') ?? (prompt ? firstLine(prompt) : id);
  const project = pick(raw, 'project_id', 'projectId', 'project') ?? fallbackProject;
  const status = mapTaskStatus(pick(raw, 'status', 'state'));
  const runner = pick(raw, 'runner_name', 'runner', 'runner_id', 'runnerId');
  const slotRaw = raw.slot ?? raw.slot_index ?? raw.slotIndex;
  const slot =
    typeof slotRaw === 'number' && Number.isInteger(slotRaw) && slotRaw >= 0 ? slotRaw : undefined;
  const task: Task = { id, title, project, status };
  for (const k of TIME_KEYS) {
    const t = parseTime(raw[k]);
    if (t !== undefined) {
      task.updatedAt = t;
      break;
    }
  }
  return { task, runner, slot };
}

function idList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) =>
      typeof x === 'string' || typeof x === 'number'
        ? String(x)
        : isObj(x)
          ? pick(x, 'id', 'todo_id')
          : undefined,
    )
    .filter((x): x is string => !!x);
}

export function mapGoal(raw: Raw, fallbackProject: string): Goal | null {
  const id = pick(raw, 'id', 'goal_id');
  if (!id) return null;
  return {
    id,
    project: pick(raw, 'project_id', 'projectId', 'project') ?? fallbackProject,
    title: pick(raw, 'title', 'name', 'goal', 'goal_note') ?? id,
    taskIds: idList(raw.todo_ids ?? raw.task_ids ?? raw.taskIds ?? raw.todos ?? raw.tasks),
  };
}

/** A runner as reported by a runner-listing tool; slots are filled in later. */
export interface RunnerInfo {
  id: string;
  name: string;
  online: boolean;
  slotCount: number;
}

export function mapRunner(raw: Raw): RunnerInfo | null {
  const id = pick(raw, 'id', 'runner_id', 'name', 'runner_name');
  if (!id) return null;
  const onlineRaw = raw.online ?? raw.connected;
  const status = pick(raw, 'status', 'state')?.toLowerCase();
  const online =
    typeof onlineRaw === 'boolean'
      ? onlineRaw
      : status
        ? !['offline', 'disconnected', 'stopped'].includes(status)
        : true;
  const slotsRaw = raw.slots ?? raw.runner_slots ?? raw.capacity ?? raw.max_slots ?? raw.parallel;
  const slotCount = Array.isArray(slotsRaw)
    ? slotsRaw.length
    : typeof slotsRaw === 'number'
      ? slotsRaw
      : 1;
  return {
    id,
    name: pick(raw, 'name', 'runner_name', 'label') ?? id,
    online,
    slotCount: Math.max(0, Math.floor(slotCount)),
  };
}

// ---------------------------------------------------------------------------
// Runners & slots

/** Runner that holds active tasks Dash didn't attribute to any runner. */
export const UNASSIGNED_RUNNER = 'unassigned';

/**
 * Build runners with their slots from the active tasks.
 *
 * - `known` runners (from a runner-listing tool) keep their slot counts.
 * - Otherwise runners are inferred from the tasks' `runner` fields; `previous`
 *   keeps inferred runners and their high-water slot count stable between polls
 *   so they don't vanish when idle.
 * - Active tasks without a runner go on a synthetic `unassigned` runner.
 */
export function buildRunners(
  tasks: MappedTask[],
  known: RunnerInfo[] | null,
  previous: Runner[] = [],
): Runner[] {
  const infos = new Map<string, RunnerInfo>();
  const keyOf = new Map<string, string>(); // id or name -> runner id
  const add = (r: RunnerInfo) => {
    infos.set(r.id, r);
    keyOf.set(r.id, r.id);
    keyOf.set(r.name, r.id);
  };
  if (known) known.forEach(add);
  else
    previous.forEach((r) =>
      add({ id: r.id, name: r.name, online: r.online, slotCount: r.slots.length }),
    );

  const byRunner = new Map<string, MappedTask[]>();
  for (const t of tasks) {
    if (!ACTIVE_STATUSES.has(t.task.status)) continue;
    let id = t.runner ? keyOf.get(t.runner) : undefined;
    if (!id) {
      id = t.runner ?? UNASSIGNED_RUNNER;
      if (!infos.has(id)) add({ id, name: id, online: true, slotCount: 0 });
    }
    byRunner.set(id, [...(byRunner.get(id) ?? []), t]);
  }

  const runners: Runner[] = [];
  for (const info of infos.values()) {
    const active = byRunner.get(info.id) ?? [];
    if (info.id === UNASSIGNED_RUNNER && active.length === 0) continue;
    const slots: Slot[] = Array.from(
      { length: Math.max(info.slotCount, active.length) },
      (_, index) => ({
        index,
        state: 'idle',
      }),
    );
    const unplaced: Task[] = [];
    for (const t of active) {
      const s = t.slot !== undefined ? slots[t.slot] : undefined;
      if (s && !s.task) Object.assign(s, { state: 'working', task: t.task });
      else unplaced.push(t.task);
    }
    for (const task of unplaced) {
      const s = slots.find((x) => !x.task)!;
      Object.assign(s, { state: 'working', task });
    }
    runners.push({ id: info.id, name: info.name, online: info.online, slots });
  }
  return runners.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// World

export interface RawWorld {
  org: Org;
  projects: Project[];
  tasks: MappedTask[];
  goals: Goal[];
  runners: RunnerInfo[] | null;
}

export function buildWorld(raw: RawWorld, previous?: WorldState): WorldState {
  const byId = <T extends { id: string }>(xs: T[]) =>
    [...new Map(xs.map((x) => [x.id, x])).values()].sort((a, b) => a.id.localeCompare(b.id));
  const tasks = byId(raw.tasks.map((t) => t.task));
  return {
    org: raw.org,
    projects: byId(raw.projects),
    runners: buildRunners(raw.tasks, raw.runners, previous?.runners),
    tasks,
    goals: byId(raw.goals),
  };
}
