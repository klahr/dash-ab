export type TaskStatus =
  'draft' | 'queued' | 'in_progress' | 'review' | 'merging' | 'merged' | 'failed';

export const TASK_STATUSES: readonly TaskStatus[] = [
  'draft',
  'queued',
  'in_progress',
  'review',
  'merging',
  'merged',
  'failed',
];

export interface Org {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  /** Project id. */
  project: string;
  status: TaskStatus;
}

export type SlotState = 'idle' | 'working';

export interface Slot {
  index: number;
  state: SlotState;
  task?: Task;
}

export interface Runner {
  id: string;
  name: string;
  online: boolean;
  slots: Slot[];
}

export interface Goal {
  id: string;
  project: string;
  title: string;
  taskIds: string[];
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  /** Epoch milliseconds. */
  timestamp: number;
}

/** Full world state as held by the bridge and mirrored by the client. */
export interface WorldState {
  org: Org;
  projects: Project[];
  runners: Runner[];
  tasks: Task[];
  goals: Goal[];
}
