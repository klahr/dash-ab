import type { Task, WorldState } from '@dash-iso/shared';
import type { Worker } from './world/worker.js';

export interface WorkerRef {
  runnerId: string;
  slot: number;
}

/** What a worker is up to, in words. */
export function activityLabel(w: Worker): string {
  const b = w.brain;
  switch (b.mode) {
    case 'typing':
      return 'Typing away';
    case 'sittingDown':
      return 'Sitting down';
    case 'toDesk':
      return 'Heading to the desk';
    case 'gettingUp':
      return 'Getting up';
    case 'leaving':
    case 'gone':
      return 'Leaving';
    case 'idle':
      if (b.activity === 'cooler') return 'At the water cooler';
      if (b.activity === 'chat') return 'Chatting';
      return 'Wandering about';
  }
}

const STATUS_TEXT: Record<Task['status'], string> = {
  draft: 'Draft',
  queued: 'Queued',
  in_progress: 'In progress',
  review: 'In review',
  merging: 'Merging',
  merged: 'Merged',
  failed: 'Failed',
};

/** HTML overlay with the clicked worker's task details. Re-renders only on change. */
export class WorkerPanel {
  readonly el: HTMLElement;
  private ref: WorkerRef | null = null;
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'room-panel worker-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get shown(): WorkerRef | null {
    return this.ref;
  }

  show(ref: WorkerRef, worker: Worker, state: WorldState): void {
    this.ref = ref;
    this.lastKey = '';
    this.el.hidden = false;
    this.refresh(worker, state);
  }

  hide(): void {
    this.ref = null;
    this.el.hidden = true;
  }

  /** Re-render for new state or activity; hides itself if the worker is gone. */
  refresh(worker: Worker | undefined, state: WorldState): void {
    if (!this.ref) return;
    if (!worker) {
      this.hide();
      return;
    }
    const runner = state.runners.find((r) => r.id === this.ref!.runnerId);
    const b = worker.brain;
    const task = b.task ? (state.tasks.find((t) => t.id === b.task!.id) ?? b.task) : null;
    const last = b.lastTask
      ? (state.tasks.find((t) => t.id === b.lastTask!.id) ?? b.lastTask)
      : null;
    const key = JSON.stringify([
      runner?.name,
      runner?.online,
      activityLabel(worker),
      b.busy,
      task,
      last,
      b.lastOutcome,
      state.goals,
      state.projects,
    ]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const project = (id: string) => state.projects.find((p) => p.id === id)?.name ?? id;

    const header = h('header');
    header.append(h('h2', undefined, worker.name));
    const close = h('button', 'close', '×');
    close.title = 'Close';
    close.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    header.append(close);

    const where = h(
      'p',
      'summary',
      `${runner?.name ?? this.ref.runnerId} · desk #${this.ref.slot + 1}${runner && !runner.online ? ' · offline' : ''}`,
    );
    const status = h('div', `status ${b.busy ? 'online' : 'offline'}`);
    status.append(h('span', 'dot'), h('span', undefined, activityLabel(worker)));

    const body = h('div', 'task-card');
    if (b.busy) {
      if (task) {
        body.append(h('div', 'task-title', task.title));
        const meta = h('div', 'task-meta');
        meta.append(
          h('span', 'tag', project(task.project)),
          h('span', `pill ${task.status}`, STATUS_TEXT[task.status]),
        );
        body.append(meta);
        body.append(h('div', 'task-id', task.id));
        const goals = state.goals.filter((g) => g.taskIds.includes(task.id));
        if (goals.length) {
          const ul = h('ul', 'goals');
          for (const g of goals) ul.append(h('li', undefined, `🎯 ${g.title}`));
          body.append(ul);
        }
      } else {
        body.append(h('div', 'task-title', 'Working on something'));
        body.append(h('div', 'task-meta', 'No task details from Dash'));
      }
    } else {
      body.append(h('div', 'task-title idle', 'No task right now'));
      if (last) {
        const mark = b.lastOutcome === 'success' ? '✔' : b.lastOutcome === 'failure' ? '✖' : '•';
        const lastEl = h('div', `task-meta last ${b.lastOutcome ?? ''}`);
        lastEl.textContent = `${mark} Last: ${last.title} (${project(last.project)}) — ${STATUS_TEXT[last.status]}`;
        body.append(lastEl);
      }
    }
    this.el.replaceChildren(header, where, status, body);
  }
}
