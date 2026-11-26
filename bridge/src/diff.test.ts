import { describe, expect, it } from 'vitest';
import { applyDelta, type WorldState } from '@dash-iso/shared';
import { deepEqual, diffWorld } from './diff.js';
import { Simulator, seededRandom } from './mock-source.js';

const base: WorldState = {
  org: { id: 'o', name: 'Org' },
  projects: [{ id: 'p1', orgId: 'o', name: 'P1' }],
  runners: [{ id: 'r1', name: 'r1', online: true, slots: [{ index: 0, state: 'idle' }] }],
  tasks: [
    { id: 't1', title: 'A', project: 'p1', status: 'queued' },
    { id: 't2', title: 'B', project: 'p1', status: 'review' },
  ],
  goals: [{ id: 'g1', project: 'p1', title: 'G', taskIds: ['t1'] }],
};

const replay = (s: WorldState, next: WorldState) => diffWorld(s, next).reduce(applyDelta, s);
const norm = (s: WorldState) => ({
  ...s,
  projects: [...s.projects].sort((a, b) => a.id.localeCompare(b.id)),
  runners: [...s.runners].sort((a, b) => a.id.localeCompare(b.id)),
  tasks: [...s.tasks].sort((a, b) => a.id.localeCompare(b.id)),
  goals: [...s.goals].sort((a, b) => a.id.localeCompare(b.id)),
});

describe('deepEqual', () => {
  it('ignores key order and undefined props', () => {
    expect(deepEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(deepEqual({ a: 1, t: undefined }, { a: 1 })).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: [] }, { a: {} })).toBe(false);
  });
});

describe('diffWorld', () => {
  it('is empty for identical (but differently ordered) states', () => {
    expect(diffWorld(base, structuredClone(base))).toEqual([]);
    expect(diffWorld(base, { ...base, tasks: [...base.tasks].reverse() })).toEqual([]);
  });

  it('emits upserts only for changed entities', () => {
    const next = structuredClone(base);
    next.tasks[0]!.status = 'in_progress';
    next.runners[0]!.slots[0] = { index: 0, state: 'working', task: next.tasks[0]! };
    expect(diffWorld(base, next)).toEqual([
      { kind: 'task.upsert', task: next.tasks[0] },
      { kind: 'runner.upsert', runner: next.runners[0] },
    ]);
  });

  it('emits removals children-first and upserts parents-first', () => {
    const next: WorldState = {
      org: { id: 'o', name: 'Renamed' },
      projects: [{ id: 'p2', orgId: 'o', name: 'P2' }],
      runners: [],
      tasks: [{ id: 't3', title: 'C', project: 'p2', status: 'queued' }],
      goals: [],
    };
    expect(diffWorld(base, next).map((d) => d.kind)).toEqual([
      'org.update',
      'project.upsert',
      'task.upsert',
      'goal.remove',
      'runner.remove',
      'task.remove',
      'task.remove',
      'project.remove',
    ]);
    expect(norm(replay(base, next))).toEqual(norm(next));
  });

  it('round-trips a long simulation: applying the deltas reproduces each state', () => {
    const sim = new Simulator({ random: seededRandom(42) });
    let mirror = sim.world();
    for (let i = 0; i < 200; i++) {
      const next = sim.tick();
      mirror = replay(mirror, next);
      expect(norm(mirror)).toEqual(norm(next));
    }
  });
});
