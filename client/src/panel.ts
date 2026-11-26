import type { Runner, WorldState } from '@dash-iso/shared';

/** HTML overlay showing details for the selected runner's room. */
export class RoomPanel {
  readonly el: HTMLElement;
  private runnerId: string | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onClose: () => void,
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'room-panel';
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  get shownId(): string | null {
    return this.runnerId;
  }

  show(runner: Runner, state: WorldState): void {
    this.runnerId = runner.id;
    this.render(runner, state);
    this.el.hidden = false;
  }

  /** Re-render for a new snapshot; hides itself if the runner disappeared. */
  refresh(state: WorldState): void {
    if (!this.runnerId) return;
    const runner = state.runners.find((r) => r.id === this.runnerId);
    if (runner) this.render(runner, state);
    else this.hide();
  }

  hide(): void {
    this.runnerId = null;
    this.el.hidden = true;
  }

  private render(runner: Runner, state: WorldState): void {
    const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    const project = (id: string) => state.projects.find((p) => p.id === id)?.name ?? id;

    const header = h('header');
    header.append(h('h2', undefined, runner.name));
    const close = h('button', 'close', '×');
    close.title = 'Close';
    close.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    header.append(close);

    const status = h('div', `status ${runner.online ? 'online' : 'offline'}`);
    status.append(
      h('span', 'dot'),
      h('span', undefined, runner.online ? 'Online' : 'Offline — lights out'),
    );

    const working = runner.slots.filter((s) => s.state === 'working').length;
    const summary = h('p', 'summary', `${working} of ${runner.slots.length} slot(s) busy`);

    const list = h('ul', 'slots');
    for (const slot of runner.slots) {
      const li = h('li', slot.state);
      li.append(h('span', 'slot-index', `#${slot.index + 1}`));
      const body = h('div', 'slot-body');
      if (slot.task) {
        body.append(h('div', 'task-title', slot.task.title));
        body.append(
          h(
            'div',
            'task-meta',
            `${project(slot.task.project)} · ${slot.task.status.replace('_', ' ')}`,
          ),
        );
      } else {
        body.append(h('div', 'task-title idle', slot.state === 'working' ? 'Working' : 'Idle'));
      }
      li.append(body);
      list.append(li);
    }

    this.el.replaceChildren(header, status, summary, list);
  }
}
