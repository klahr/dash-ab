import { describe, expect, it } from 'vitest';
import type { Slot, Task } from '@dash-iso/shared';
import { deskLayout, workerSite } from './desks.js';
import {
  WorkerBrain,
  angleDelta,
  outcomeOf,
  syncSlot,
  type WorkerMode,
  type WorkerSite,
} from './worker-fsm.js';

const room = { w: 8, d: 7 };

function site(slots = 2, index = 0): WorkerSite {
  const desks = deskLayout(slots, room);
  return workerSite(desks[index]!, desks, room);
}

/** Deterministic PRNG. */
function rng(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function brain(start: 'placed' | 'door' = 'placed', s = site()): WorkerBrain {
  return new WorkerBrain(s, { random: rng(), start });
}

/** Step until `mode` (or give up after `maxSeconds`). Returns seconds taken. */
function runUntil(b: WorkerBrain, mode: WorkerMode, maxSeconds = 30, dt = 1 / 30): number {
  let t = 0;
  while (b.mode !== mode && t < maxSeconds) {
    b.update(dt);
    t += dt;
  }
  expect(b.mode).toBe(mode);
  return t;
}

const task = (id: string, status: Task['status'] = 'in_progress'): Task => ({
  id,
  title: `Task ${id}`,
  project: 'p1',
  status,
});

describe('outcomeOf', () => {
  it('maps final statuses to outcomes', () => {
    expect(outcomeOf('review')).toBe('success');
    expect(outcomeOf('merging')).toBe('success');
    expect(outcomeOf('merged')).toBe('success');
    expect(outcomeOf('failed')).toBe('failure');
    expect(outcomeOf('in_progress')).toBeNull();
    expect(outcomeOf('queued')).toBeNull();
    expect(outcomeOf(undefined)).toBeNull();
  });
});

describe('angleDelta', () => {
  it('takes the short way round', () => {
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDelta(-3, 3)).toBeCloseTo(6 - Math.PI * 2);
    expect(angleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
  });
});

describe('WorkerBrain', () => {
  it('idles between activities while there is no task', () => {
    const b = brain();
    expect(b.mode).toBe('idle');
    const seen = new Set<string>();
    let moved = false;
    for (let i = 0; i < 30 * 120; i++) {
      b.update(1 / 30);
      expect(b.mode).toBe('idle');
      seen.add(b.activity);
      moved ||= b.moving;
    }
    expect(moved).toBe(true);
    expect(seen).toEqual(new Set(['wander', 'cooler', 'chat']));
  });

  it('walks to the desk, sits down and types when assigned a task', () => {
    const s = site();
    const b = brain('placed', s);
    b.assign(task('t1'));
    expect(b.mode).toBe('toDesk');
    expect(b.destination).toEqual(s.approach);
    runUntil(b, 'sittingDown');
    expect(b.pos).toEqual(s.approach);
    runUntil(b, 'typing', 2);
    expect(b.pos).toEqual(s.seat.pos);
    expect(b.facing).toBeCloseTo(s.seat.facing);
    expect(b.seated).toBe(true);
    // Stays typing indefinitely.
    for (let i = 0; i < 100; i++) b.update(0.1);
    expect(b.mode).toBe('typing');
    expect(b.task?.id).toBe('t1');
  });

  it('gets up and goes back to idling when the task ends', () => {
    const b = brain();
    b.assign(task('t1'));
    runUntil(b, 'typing');
    b.release('success');
    expect(b.mode).toBe('gettingUp');
    expect(b.lastOutcome).toBe('success');
    expect(b.lastTask?.id).toBe('t1');
    expect(b.task).toBeNull();
    runUntil(b, 'idle', 2);
    expect(b.busy).toBe(false);
  });

  it('abandons the walk if the task ends before reaching the desk', () => {
    const b = brain();
    b.assign(task('t1'));
    b.update(0.1);
    b.release('failure');
    expect(b.mode).toBe('idle');
    expect(b.lastOutcome).toBe('failure');
  });

  it('sits straight back down if a task arrives while getting up', () => {
    const b = brain();
    b.assign(task('t1'));
    runUntil(b, 'typing');
    b.release('success');
    b.update(0.1);
    b.assign(task('t2'));
    expect(b.mode).toBe('gettingUp');
    runUntil(b, 'sittingDown', 2);
    runUntil(b, 'typing', 2);
    expect(b.task?.id).toBe('t2');
  });

  it('keeps typing when the slot switches straight to a new task', () => {
    const b = brain();
    b.assign(task('t1'));
    runUntil(b, 'typing');
    b.assign(task('t2'));
    expect(b.mode).toBe('typing');
    expect(b.task?.id).toBe('t2');
  });

  it('starts seated when placed with a running task', () => {
    const s = site();
    const b = brain('placed', s);
    b.assign(task('t1'));
    b.seatNow();
    expect(b.mode).toBe('typing');
    expect(b.pos).toEqual(s.seat.pos);
  });

  it('walks in from the door when spawned there', () => {
    const s = site();
    const b = brain('door', s);
    expect(b.pos).toEqual(s.door);
    b.update(0.5);
    expect(b.moving).toBe(true);
    expect(b.pos.z).toBeLessThan(s.door.z);
  });

  it('leaves through the door and is then gone', () => {
    const s = site();
    const b = brain('placed', s);
    b.assign(task('t1'));
    runUntil(b, 'typing');
    b.leave();
    expect(b.mode).toBe('leaving');
    expect(b.busy).toBe(false);
    runUntil(b, 'gone');
    expect(b.pos).toEqual(s.door);
    // Further events are ignored.
    b.assign(task('t2'));
    expect(b.mode).toBe('gone');
  });

  it('moves with its desk when the room is re-laid out', () => {
    const b = brain('placed', site(2, 1));
    b.assign(task('t1'));
    runUntil(b, 'typing');
    const moved = site(6, 1);
    b.setSite(moved);
    expect(b.pos).toEqual(moved.seat.pos);
    b.update(0.1);
    expect(b.mode).toBe('typing');
  });
});

describe('syncSlot', () => {
  const working = (t: Task, index = 0): Slot => ({ index, state: 'working', task: t });
  const idle: Slot = { index: 0, state: 'idle' };

  it('assigns on a new task and reports it once', () => {
    const b = brain();
    const t1 = task('t1');
    expect(syncSlot(b, working(t1), [t1])).toEqual([{ kind: 'assigned', task: t1 }]);
    expect(b.mode).toBe('toDesk');
    expect(syncSlot(b, working(t1), [t1])).toEqual([]);
  });

  it('updates task details without restarting', () => {
    const b = brain();
    syncSlot(b, working(task('t1')), []);
    const renamed = { ...task('t1'), title: 'Renamed' };
    expect(syncSlot(b, working(renamed), [])).toEqual([]);
    expect(b.task?.title).toBe('Renamed');
  });

  it('reads the outcome from the task list when the slot frees up', () => {
    const b = brain();
    syncSlot(b, working(task('t1')), []);
    runUntil(b, 'typing');
    const changes = syncSlot(b, idle, [task('t1', 'review')]);
    expect(changes).toEqual([{ kind: 'released', task: task('t1', 'review'), outcome: 'success' }]);
    expect(b.mode).toBe('gettingUp');

    const b2 = brain();
    syncSlot(b2, working(task('t2')), []);
    expect(syncSlot(b2, idle, [task('t2', 'failed')])[0]).toMatchObject({ outcome: 'failure' });
  });

  it('reports no outcome when the task vanished or is still running', () => {
    const b = brain();
    syncSlot(b, working(task('t1')), []);
    expect(syncSlot(b, idle, [])[0]).toMatchObject({ kind: 'released', outcome: null });
  });

  it('handles a slot switching directly to another task', () => {
    const b = brain();
    syncSlot(b, working(task('t1')), []);
    runUntil(b, 'typing');
    const changes = syncSlot(b, working(task('t2')), [task('t1', 'merged')]);
    expect(changes.map((c) => c.kind)).toEqual(['released', 'assigned']);
    expect(changes[0]).toMatchObject({ outcome: 'success' });
    expect(b.mode).toBe('typing');
    expect(b.task?.id).toBe('t2');
    expect(b.lastTask?.id).toBe('t1');
  });

  it('treats a working slot without task details as busy', () => {
    const b = brain();
    expect(syncSlot(b, { index: 0, state: 'working' }, [])).toEqual([
      { kind: 'assigned', task: null },
    ]);
    expect(b.busy).toBe(true);
    expect(syncSlot(b, undefined, [])[0]).toMatchObject({ kind: 'released' });
  });
});

describe('deskLayout', () => {
  it('gives every slot its own desk inside the room', () => {
    for (const n of [0, 1, 2, 4, 7, 12]) {
      const desks = deskLayout(n, room);
      expect(desks).toHaveLength(n);
      for (const d of desks) {
        expect(d.x - d.width / 2).toBeGreaterThan(0.22);
        expect(d.x + d.width / 2).toBeLessThan(room.w - 0.22);
        expect(d.approach.z).toBeLessThan(room.d - 0.22);
      }
      // No two desks overlap.
      for (const a of desks)
        for (const b of desks)
          if (a !== b)
            expect(
              Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.z - b.z) >= a.depth,
            ).toBe(true);
    }
  });

  it('keeps idle spots inside the room', () => {
    const desks = deskLayout(3, room);
    const r = rng(7);
    for (const d of desks) {
      const s = workerSite(d, desks, room);
      for (const a of ['wander', 'cooler', 'chat'] as const) {
        for (let i = 0; i < 20; i++) {
          const { pos } = s.idleSpot(a, r);
          expect(pos.x).toBeGreaterThan(0.3);
          expect(pos.x).toBeLessThan(room.w - 0.3);
          expect(pos.z).toBeGreaterThan(0.3);
          expect(pos.z).toBeLessThan(room.d - 0.3);
        }
      }
    }
  });
});
