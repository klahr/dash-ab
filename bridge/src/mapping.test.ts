import { describe, expect, it } from 'vitest';
import {
  UNASSIGNED_RUNNER,
  buildRunners,
  buildWorld,
  extractList,
  mapGoal,
  mapProject,
  mapRunner,
  mapTask,
  mapTaskStatus,
  parseTime,
  toolPayload,
  toolText,
  type MappedTask,
} from './mapping.js';

const text = (t: string) => ({ content: [{ type: 'text', text: t }] });

describe('tool results', () => {
  it('prefers structuredContent, else parses JSON text', () => {
    expect(toolPayload({ structuredContent: { a: 1 }, content: [] })).toEqual({ a: 1 });
    expect(toolPayload(text('[{"id":"x"}]'))).toEqual([{ id: 'x' }]);
    expect(
      toolPayload({
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: '{"b":2}' },
        ],
      }),
    ).toEqual({ b: 2 });
    expect(toolPayload(text('Listed 3 tasks'))).toBeUndefined();
    expect(toolText(text(' hi '))).toBe('hi');
  });

  it('extracts lists from arrays, named keys, or a lone array property', () => {
    expect(extractList([{ id: 1 }, 'junk'], [])).toEqual([{ id: 1 }]);
    expect(extractList({ todos: [{ id: 'a' }], count: 1 }, ['todos'])).toEqual([{ id: 'a' }]);
    expect(extractList({ whatever: [{ id: 'b' }], total: 1 }, ['todos'])).toEqual([{ id: 'b' }]);
    expect(extractList({ a: [], b: [] }, ['todos'])).toEqual([]);
    expect(extractList('nope', ['todos'])).toEqual([]);
  });
});

describe('mapTaskStatus', () => {
  it.each([
    ['draft', 'draft'],
    ['queued', 'queued'],
    ['waiting_build', 'queued'],
    ['running', 'in_progress'],
    ['In Progress', 'in_progress'],
    ['in-review', 'review'],
    ['merging', 'merging'],
    ['merged', 'merged'],
    ['stopped', 'failed'],
    ['out_of_budget', 'failed'],
    ['something-new', 'draft'],
    [undefined, 'draft'],
  ] as const)('%s → %s', (raw, want) => {
    expect(mapTaskStatus(raw)).toBe(want);
  });
});

describe('entity mapping', () => {
  it('maps projects', () => {
    expect(mapProject({ project_id: 'p1', name: 'Alpha' }, 'o')).toEqual({
      id: 'p1',
      orgId: 'o',
      name: 'Alpha',
    });
    expect(mapProject({ name: 'Solo' }, 'o')).toEqual({ id: 'Solo', orgId: 'o', name: 'Solo' });
    expect(mapProject({}, 'o')).toBeNull();
  });

  it('maps Dash todos including runner and slot', () => {
    expect(
      mapTask(
        {
          todo_id: 't1',
          title: 'Fix it',
          project_id: 'p1',
          status: 'running',
          runner_name: 'mac',
          slot: 1,
        },
        'px',
      ),
    ).toEqual({
      task: { id: 't1', title: 'Fix it', project: 'p1', status: 'in_progress' },
      runner: 'mac',
      slot: 1,
    });
  });

  it('falls back for title and project, and accepts nested objects', () => {
    const m = mapTask(
      { id: 7, prompt: 'Do the thing\nwith details', project: { id: 'p2' }, status: 'queued' },
      'px',
    );
    expect(m?.task).toEqual({ id: '7', title: 'Do the thing', project: 'p2', status: 'queued' });
    expect(mapTask({ id: 'x' }, 'px')?.task).toEqual({
      id: 'x',
      title: 'x',
      project: 'px',
      status: 'draft',
    });
    expect(mapTask({ title: 'no id' }, 'px')).toBeNull();
    expect(mapTask({ id: 'x', slot: -1 }, 'px')?.slot).toBeUndefined();
  });

  it('reads when a task last changed', () => {
    const iso = '2026-11-26T10:00:00Z';
    const ms = Date.parse(iso);
    expect(parseTime(iso)).toBe(ms);
    expect(parseTime(ms / 1000)).toBe(ms);
    expect(parseTime(String(ms))).toBe(ms);
    expect(parseTime('soon')).toBeUndefined();
    expect(mapTask({ id: 'x', updated_at: iso }, 'px')?.task.updatedAt).toBe(ms);
    expect(
      mapTask({ id: 'x', merged_at: iso, updated_at: '2026-11-27T00:00:00Z' }, 'px')?.task
        .updatedAt,
    ).toBe(ms);
  });

  it('maps goals with task id lists in different shapes', () => {
    expect(mapGoal({ goal_id: 'g', title: 'Ship', todo_ids: ['a', 2] }, 'p')).toEqual({
      id: 'g',
      project: 'p',
      title: 'Ship',
      taskIds: ['a', '2'],
    });
    expect(mapGoal({ id: 'g', todos: [{ id: 'a' }, { todo_id: 'b' }] }, 'p')?.taskIds).toEqual([
      'a',
      'b',
    ]);
  });

  it('maps runners', () => {
    expect(mapRunner({ name: 'mac', status: 'offline', slots: 3 })).toEqual({
      id: 'mac',
      name: 'mac',
      online: false,
      slotCount: 3,
    });
    expect(mapRunner({ id: 'r', online: true, slots: [{}, {}] })?.slotCount).toBe(2);
    expect(mapRunner({ id: 'r' })).toMatchObject({ online: true, slotCount: 1 });
  });
});

const mt = (
  id: string,
  status: MappedTask['task']['status'],
  runner?: string,
  slot?: number,
): MappedTask => ({
  task: { id, title: id, project: 'p', status },
  runner,
  slot,
});

describe('buildRunners', () => {
  it('fills known runners, honouring slot indexes', () => {
    const runners = buildRunners(
      [mt('a', 'in_progress', 'r1', 1), mt('b', 'in_progress', 'r1'), mt('c', 'review', 'r1')],
      [{ id: 'r1', name: 'one', online: true, slotCount: 3 }],
    );
    expect(runners).toHaveLength(1);
    expect(runners[0]!.slots.map((s) => [s.state, s.task?.id])).toEqual([
      ['working', 'b'],
      ['working', 'a'],
      ['idle', undefined],
    ]);
  });

  it('matches tasks to known runners by name', () => {
    const [r] = buildRunners(
      [mt('a', 'merging', 'one')],
      [{ id: 'r1', name: 'one', online: true, slotCount: 1 }],
    );
    expect(r!.slots[0]!.task?.id).toBe('a');
  });

  it('grows slots when more tasks run than reported capacity', () => {
    const [r] = buildRunners(
      [mt('a', 'in_progress', 'r1', 0), mt('b', 'in_progress', 'r1', 0)],
      [{ id: 'r1', name: 'r1', online: true, slotCount: 1 }],
    );
    expect(r!.slots.map((s) => s.task?.id)).toEqual(['a', 'b']);
  });

  it('infers runners from tasks and keeps them (and their slot count) between polls', () => {
    const first = buildRunners(
      [mt('a', 'in_progress', 'mac'), mt('b', 'in_progress', 'mac'), mt('c', 'in_progress')],
      null,
    );
    expect(first.map((r) => [r.id, r.slots.length])).toEqual([
      ['mac', 2],
      [UNASSIGNED_RUNNER, 1],
    ]);
    const second = buildRunners([mt('a', 'merged', 'mac')], null, first);
    expect(
      second.map((r) => [r.id, r.slots.length, r.slots.every((s) => s.state === 'idle')]),
    ).toEqual([['mac', 2, true]]);
  });
});

describe('buildWorld', () => {
  it('dedupes and sorts by id', () => {
    const w = buildWorld({
      org: { id: 'o', name: 'O' },
      projects: [
        { id: 'p2', orgId: 'o', name: 'B' },
        { id: 'p1', orgId: 'o', name: 'A' },
      ],
      tasks: [mt('t2', 'queued'), mt('t1', 'queued'), mt('t1', 'review')],
      goals: [],
      runners: [],
    });
    expect(w.projects.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(w.tasks.map((t) => [t.id, t.status])).toEqual([
      ['t1', 'review'],
      ['t2', 'queued'],
    ]);
  });
});
