import { describe, expect, it } from 'vitest';
import { mockSnapshot, type Task, type WorldState } from '@dash-iso/shared';
import { EventLog, diffEvents, startOfDay } from './events.js';
import { hudCounts } from './hud.js';

const withTask = (s: WorldState, id: string, patch: Partial<Task>): WorldState => ({
  ...s,
  tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

describe('diffEvents', () => {
  it('yields nothing for the first snapshot', () => {
    expect(diffEvents(null, mockSnapshot())).toEqual([]);
  });

  it('reports status transitions, new tasks and runner flaps', () => {
    const a = mockSnapshot();
    let b = withTask(a, 'task-10', { status: 'merged' });
    b = withTask(b, 'task-4', { status: 'failed' });
    b = {
      ...b,
      tasks: [...b.tasks, { id: 'new', title: 'New one', project: 'proj-1', status: 'queued' }],
      runners: b.runners.map((r) => (r.id === 'runner-atlas' ? { ...r, online: false } : r)),
    };
    const kinds = diffEvents(a, b).map((e) => [e.kind, e.taskId ?? e.runnerId]);
    expect(kinds).toEqual([
      ['failed', 'task-4'],
      ['merged', 'task-10'],
      ['queued', 'new'],
      ['offline', 'runner-atlas'],
    ]);
  });

  it('names the runner that picked a task up', () => {
    const a = withTask(mockSnapshot(), 'task-1', { status: 'queued' });
    const b = mockSnapshot();
    const [e] = diffEvents(a, b);
    expect(e).toMatchObject({ kind: 'started', runnerId: 'runner-atlas' });
    expect(e!.text).toContain('atlas');
  });
});

describe('EventLog', () => {
  const noon = new Date(2026, 10, 26, 12, 0).getTime();

  it('keeps newest first and caps the log', () => {
    const log = new EventLog(3);
    let s = mockSnapshot();
    log.observe(s, noon);
    for (let i = 0; i < 5; i++) {
      s = {
        ...s,
        tasks: [...s.tasks, { id: `n${i}`, title: `T${i}`, project: 'proj-1', status: 'queued' }],
      };
      log.observe(s, noon + i);
    }
    expect(log.events.map((e) => e.taskId)).toEqual(['n4', 'n3', 'n2']);
  });

  it('counts merges seen today, including tasks Dash later drops', () => {
    const log = new EventLog();
    const a = mockSnapshot();
    log.observe(a, noon);
    // task-8 was already merged with no timestamp: unknown day, not counted.
    expect(log.mergedToday(null, noon)).toBe(0);
    const b = withTask(a, 'task-10', { status: 'merged' });
    log.observe(b, noon + 1000);
    expect(log.mergedToday(null, noon + 2000)).toBe(1);
    expect(log.mergedToday('proj-2', noon + 2000)).toBe(0);
    const c = { ...b, tasks: b.tasks.filter((t) => t.id !== 'task-10') };
    log.observe(c, noon + 3000);
    expect(log.mergedTodayIds(null, noon + 3000)).toEqual(['task-10']);
    // Tomorrow it no longer counts.
    expect(log.mergedToday(null, noon + 24 * 3600e3)).toBe(0);
  });

  it('uses Dash timestamps when present', () => {
    const log = new EventLog();
    let s = withTask(mockSnapshot(), 'task-8', { updatedAt: noon - 3600e3 });
    s = withTask(s, 'task-10', { status: 'merged', updatedAt: startOfDay(noon) - 1 });
    log.observe(s, noon);
    expect(log.mergedTodayIds(null, noon)).toEqual(['task-8']);
  });
});

describe('hudCounts', () => {
  it('counts by status under a project filter', () => {
    const s = mockSnapshot();
    expect(hudCounts(s, null, 2)).toEqual({
      running: 3,
      queued: 2,
      review: 2,
      mergedToday: 2,
      failed: 1,
    });
    expect(hudCounts(s, 'proj-2', 0)).toMatchObject({
      running: 1,
      queued: 1,
      review: 1,
      failed: 1,
    });
  });
});
