import type { Task, WorldState } from '@dash-iso/shared';
import type { EventLog } from '../events.js';
import { projectCss } from '../world/projects.js';

/**
 * Generic details overlay (same look as the room panel). A feature module
 * supplies an `OverlayView`; the overlay re-renders it on every refresh but
 * only touches the DOM when the output changed, so scrolling and hover
 * survive live updates.
 */

export interface OverlayContext {
  state: WorldState;
  filter: string | null;
  events: EventLog;
  /** Switch the overlay to another view. */
  open: (view: OverlayView) => void;
  /** Set the HUD project filter. */
  setFilter: (id: string | null) => void;
}

export interface OverlayView {
  /** Stable id, e.g. `queue` or `goal:goal-1`. */
  id: string;
  title: (ctx: OverlayContext) => string;
  render: (ctx: OverlayContext) => Node[];
  /** Extra class on the panel (for accent colours). */
  className?: string;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export const STATUS_TEXT: Record<Task['status'], string> = {
  draft: 'Draft',
  queued: 'Queued',
  in_progress: 'In progress',
  review: 'In review',
  merging: 'Merging',
  merged: 'Merged',
  failed: 'Failed',
};

export function projectName(state: WorldState, id: string): string {
  return state.projects.find((p) => p.id === id)?.name ?? id;
}

/** Coloured project chip. */
export function projectTag(state: WorldState, id: string): HTMLElement {
  const tag = h('span', 'tag', projectName(state, id));
  tag.style.background = projectCss(id);
  return tag;
}

export function statusPill(status: Task['status']): HTMLElement {
  return h('span', `pill ${status}`, STATUS_TEXT[status]);
}

/** One task as a list row: title, project chip, status pill, runner and goals. */
export function taskRow(
  state: WorldState,
  task: Task,
  opts: { focus?: boolean; prefix?: string } = {},
): HTMLLIElement {
  const li = h('li', `task-row${opts.focus ? ' focus' : ''}`);
  li.style.borderLeftColor = projectCss(task.project);
  li.dataset.task = task.id;
  const title = h('div', 'task-title', `${opts.prefix ?? ''}${task.title}`);
  const meta = h('div', 'task-meta');
  meta.append(projectTag(state, task.project), statusPill(task.status));
  const runner = state.runners.find((r) => r.slots.some((s) => s.task?.id === task.id));
  if (runner) meta.append(h('span', 'where', `@ ${runner.name}`));
  li.append(title, meta);
  const goals = state.goals.filter((g) => g.taskIds.includes(task.id));
  if (goals.length)
    li.append(h('div', 'task-goals', goals.map((g) => `🎯 ${g.title}`).join(' · ')));
  li.append(h('div', 'task-id', task.id));
  return li;
}

/** A list of task rows, or an empty-state line. */
export function taskList(
  state: WorldState,
  tasks: readonly Task[],
  empty: string,
  focus?: string,
  numbered = false,
): HTMLElement {
  if (!tasks.length) return h('p', 'empty', empty);
  const ul = h('ul', 'task-list');
  tasks.forEach((t, i) =>
    ul.append(taskRow(state, t, { focus: t.id === focus, prefix: numbered ? `${i + 1}. ` : '' })),
  );
  return ul;
}

/** Note shown when the HUD filter is narrowing a view. */
export function filterNote(ctx: OverlayContext): HTMLElement | null {
  if (ctx.filter === null) return null;
  const p = h('p', 'filter-note');
  p.append(`Showing ${projectName(ctx.state, ctx.filter)} only · `);
  const clear = h('button', 'link', 'show all');
  clear.type = 'button';
  clear.addEventListener('click', () => ctx.setFilter(null));
  p.append(clear);
  return p;
}

export class Overlay {
  readonly el: HTMLElement;
  private view: OverlayView | null = null;
  private lastHtml = '';
  private ctx: OverlayContext | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onClose: () => void = () => {},
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'room-panel feature-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get shown(): OverlayView | null {
    return this.view;
  }

  show(view: OverlayView, ctx: OverlayContext): void {
    this.view = view;
    this.lastHtml = '';
    this.el.hidden = false;
    this.el.className = `room-panel feature-panel ${view.className ?? ''}`.trim();
    this.el.scrollTop = 0;
    this.refresh(ctx);
  }

  hide(): void {
    this.view = null;
    this.el.hidden = true;
  }

  refresh(ctx: OverlayContext): void {
    this.ctx = ctx;
    const view = this.view;
    if (!view) return;
    const header = h('header');
    header.append(h('h2', undefined, view.title(ctx)));
    const close = h('button', 'close', '×');
    close.title = 'Close';
    close.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    header.append(close);
    const body = h('div', 'feature-body');
    body.append(...view.render(ctx));
    const html = header.outerHTML + body.outerHTML;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    const top = this.el.scrollTop;
    this.el.replaceChildren(header, body);
    this.el.scrollTop = top;
  }

  /** Context from the last refresh (for views that switch views). */
  get context(): OverlayContext | null {
    return this.ctx;
  }
}
