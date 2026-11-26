import type { ChatMessage, Goal, Project, Runner, Task, WorldState } from './domain.js';

/** Bridge -> client. */
export type ServerMessage =
  | { type: 'snapshot'; state: WorldState; chat: ChatMessage[] }
  | { type: 'delta'; delta: Delta }
  | { type: 'chat.receive'; message: ChatMessage };

/** Client -> bridge. */
export type ClientMessage = { type: 'chat.send'; text: string };

export type Delta =
  | { kind: 'runner.upsert'; runner: Runner }
  | { kind: 'task.upsert'; task: Task }
  | { kind: 'project.upsert'; project: Project }
  | { kind: 'goal.upsert'; goal: Goal }
  | { kind: 'task.remove'; id: string };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

/** Pure reducer: apply a delta to a world state. */
export function applyDelta(state: WorldState, delta: Delta): WorldState {
  switch (delta.kind) {
    case 'runner.upsert':
      return { ...state, runners: upsert(state.runners, delta.runner) };
    case 'task.upsert':
      return { ...state, tasks: upsert(state.tasks, delta.task) };
    case 'project.upsert':
      return { ...state, projects: upsert(state.projects, delta.project) };
    case 'goal.upsert':
      return { ...state, goals: upsert(state.goals, delta.goal) };
    case 'task.remove':
      return { ...state, tasks: state.tasks.filter((t) => t.id !== delta.id) };
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as Partial<ClientMessage> | null;
    if (m && m.type === 'chat.send' && typeof m.text === 'string') {
      return { type: 'chat.send', text: m.text };
    }
  } catch {
    // fall through
  }
  return null;
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const m = JSON.parse(raw) as { type?: string } | null;
    if (m && (m.type === 'snapshot' || m.type === 'delta' || m.type === 'chat.receive')) {
      return m as ServerMessage;
    }
  } catch {
    // fall through
  }
  return null;
}
