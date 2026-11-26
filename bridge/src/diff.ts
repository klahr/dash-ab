import type { Delta, WorldState } from '@dash-iso/shared';

/** Structural equality for JSON-like values (key order independent). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).filter((k) => ao[k] !== undefined);
  const bk = Object.keys(bo).filter((k) => bo[k] !== undefined);
  return ak.length === bk.length && ak.every((k) => deepEqual(ao[k], bo[k]));
}

function diffList<T extends { id: string }>(
  prev: T[],
  next: T[],
  upsert: (x: T) => Delta,
  remove: (id: string) => Delta,
): { upserts: Delta[]; removes: Delta[] } {
  const before = new Map(prev.map((x) => [x.id, x]));
  const after = new Set(next.map((x) => x.id));
  return {
    upserts: next.filter((x) => !deepEqual(before.get(x.id), x)).map(upsert),
    removes: prev.filter((x) => !after.has(x.id)).map((x) => remove(x.id)),
  };
}

/**
 * Deltas that turn `prev` into `next` when applied in order with `applyDelta`.
 * Upserts come parents-first (projects, tasks, runners, goals), removals
 * children-first, so a client never sees a goal pointing at a removed project
 * mid-batch.
 */
export function diffWorld(prev: WorldState, next: WorldState): Delta[] {
  const projects = diffList(
    prev.projects,
    next.projects,
    (project) => ({ kind: 'project.upsert', project }),
    (id) => ({ kind: 'project.remove', id }),
  );
  const tasks = diffList(
    prev.tasks,
    next.tasks,
    (task) => ({ kind: 'task.upsert', task }),
    (id) => ({ kind: 'task.remove', id }),
  );
  const runners = diffList(
    prev.runners,
    next.runners,
    (runner) => ({ kind: 'runner.upsert', runner }),
    (id) => ({ kind: 'runner.remove', id }),
  );
  const goals = diffList(
    prev.goals,
    next.goals,
    (goal) => ({ kind: 'goal.upsert', goal }),
    (id) => ({ kind: 'goal.remove', id }),
  );
  return [
    ...(deepEqual(prev.org, next.org) ? [] : [{ kind: 'org.update', org: next.org } as Delta]),
    ...projects.upserts,
    ...tasks.upserts,
    ...runners.upserts,
    ...goals.upserts,
    ...goals.removes,
    ...runners.removes,
    ...tasks.removes,
    ...projects.removes,
  ];
}
