import type { Runner, Task, WorldState } from './domain.js';

/**
 * Mock world state used by the client (and tests) until the bridge serves real
 * data. Returns a fresh deep copy on every call so callers can mutate freely.
 */
export function mockSnapshot(): WorldState {
  const tasks: Task[] = [
    { id: 'task-1', title: 'Isometric office scene', project: 'proj-1', status: 'in_progress' },
    { id: 'task-2', title: 'MCP bridge with mock mode', project: 'proj-1', status: 'in_progress' },
    { id: 'task-3', title: 'Desks driven by runner slots', project: 'proj-1', status: 'queued' },
    { id: 'task-4', title: 'Project manager character', project: 'proj-2', status: 'review' },
    { id: 'task-5', title: 'Fix flaky login test', project: 'proj-2', status: 'in_progress' },
    { id: 'task-6', title: 'HUD for queued tasks', project: 'proj-1', status: 'draft' },
    { id: 'task-7', title: 'Bench seating for visitors', project: 'proj-2', status: 'queued' },
    { id: 'task-8', title: 'Trophy shelf for merges', project: 'proj-1', status: 'merged' },
    { id: 'task-9', title: 'Repair bin for failures', project: 'proj-2', status: 'failed' },
    { id: 'task-10', title: 'Goals noticeboard', project: 'proj-1', status: 'review' },
  ];
  const t = (id: string): Task => ({ ...tasks.find((x) => x.id === id)! });
  const runner = (
    id: string,
    name: string,
    online: boolean,
    working: (string | null)[],
  ): Runner => ({
    id,
    name,
    online,
    slots: working.map((taskId, index) =>
      taskId ? { index, state: 'working', task: t(taskId) } : { index, state: 'idle' },
    ),
  });

  return {
    org: { id: 'org-1', name: 'Demo Org' },
    projects: [
      { id: 'proj-1', orgId: 'org-1', name: 'Dash Isometric' },
      { id: 'proj-2', orgId: 'org-1', name: 'Web App' },
    ],
    runners: [
      runner('runner-atlas', 'atlas', true, ['task-1', 'task-2']),
      runner('runner-borealis', 'borealis', true, ['task-5', null]),
      runner('runner-comet', 'comet', false, [null, null]),
      runner('runner-dynamo', 'dynamo', true, ['task-4', null, null]),
      runner('runner-ember', 'ember', true, [null]),
      runner('runner-fjord', 'fjord', false, [null, null]),
      runner('runner-gizmo', 'gizmo', true, [null, null]),
    ],
    tasks,
    goals: [
      {
        id: 'goal-1',
        project: 'proj-1',
        title: 'Ship the office',
        taskIds: ['task-1', 'task-3', 'task-8', 'task-10'],
      },
      {
        id: 'goal-2',
        project: 'proj-2',
        title: 'Stabilise the web app',
        taskIds: ['task-4', 'task-5', 'task-9'],
      },
    ],
  };
}
