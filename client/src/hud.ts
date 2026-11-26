import type { Project, WorldState } from '@dash-iso/shared';
import { EVENT_ICON, type OfficeEvent } from './events.js';
import { projectCss } from './world/projects.js';

/**
 * Theme Hospital-style bottom bar: counters (running, queued, in review,
 * merged today, failed), a project filter and a ticker of recent events.
 * Clicking a counter or the ticker asks the app to open the matching overlay.
 */

export type CounterKind = 'running' | 'queued' | 'review' | 'mergedToday' | 'failed';

export type HudCounts = Record<CounterKind, number>;

export const COUNTERS: { kind: CounterKind; icon: string; label: string; title: string }[] = [
  { kind: 'running', icon: '🏃', label: 'Running', title: 'Tasks being worked on at a desk' },
  { kind: 'queued', icon: '🪑', label: 'Queued', title: 'Visitors waiting in reception' },
  { kind: 'review', icon: '📂', label: 'In review', title: 'Folders in the review inbox' },
  { kind: 'mergedToday', icon: '🏆', label: 'Merged today', title: 'Trophies won since midnight' },
  { kind: 'failed', icon: '🔧', label: 'Failed', title: 'Crumpled paper in the repair bin' },
];

/** Counter values for a snapshot under a project filter. */
export function hudCounts(
  state: WorldState,
  filter: string | null,
  mergedToday: number,
): HudCounts {
  const mine = filter === null ? state.tasks : state.tasks.filter((t) => t.project === filter);
  const n = (...statuses: string[]) => mine.filter((t) => statuses.includes(t.status)).length;
  return {
    running: n('in_progress', 'merging'),
    queued: n('queued'),
    review: n('review'),
    mergedToday,
    failed: n('failed'),
  };
}

export interface HudOptions {
  onCounter: (kind: CounterKind) => void;
  onFilter: (projectId: string | null) => void;
  onTicker: () => void;
}

const TICK_MS = 4500;

export class Hud {
  readonly el: HTMLElement;
  private readonly values = new Map<CounterKind, HTMLElement>();
  private readonly select: HTMLSelectElement;
  private readonly ticker: HTMLElement;
  private lastSlide = 0;
  private readonly tickerText: HTMLElement;
  private projectsKey = '';
  private events: readonly OfficeEvent[] = [];
  private shownSeq = -1;
  private index = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(el: HTMLElement, opts: HudOptions) {
    this.el = el;
    el.classList.add('hud-bar');
    const counters = document.createElement('div');
    counters.className = 'counters';
    for (const c of COUNTERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `counter ${c.kind}`;
      b.title = c.title;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = c.icon;
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = '0';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = c.label;
      b.append(icon, value, label);
      b.addEventListener('click', () => opts.onCounter(c.kind));
      this.values.set(c.kind, value);
      counters.append(b);
    }

    const filter = document.createElement('label');
    filter.className = 'filter';
    filter.append('Project ');
    this.select = document.createElement('select');
    this.select.addEventListener('change', () => opts.onFilter(this.select.value || null));
    filter.append(this.select);

    // A div, not a <button>: buttons centre overflowing content.
    this.ticker = document.createElement('div');
    this.ticker.className = 'ticker';
    this.ticker.tabIndex = 0;
    this.ticker.setAttribute('role', 'button');
    this.ticker.title = 'Recent events — click for the log';
    this.tickerText = document.createElement('span');
    this.tickerText.className = 'ticker-text';
    this.tickerText.textContent = 'Waiting for news…';
    this.ticker.append(this.tickerText);
    this.ticker.addEventListener('click', () => opts.onTicker());
    this.ticker.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') opts.onTicker();
    });

    el.prepend(counters, filter, this.ticker);
    this.timer = setInterval(() => this.rotate(), TICK_MS);
  }

  setCounts(counts: HudCounts): void {
    for (const [k, el] of this.values) {
      const v = String(counts[k]);
      if (el.textContent !== v) {
        el.textContent = v;
        el.parentElement?.classList.remove('bump');
        void el.parentElement?.offsetWidth;
        el.parentElement?.classList.add('bump');
      }
    }
  }

  /** Rebuild the project dropdown if the project list changed. */
  setProjects(projects: readonly Project[], selected: string | null): void {
    const key = JSON.stringify([projects.map((p) => [p.id, p.name]), selected]);
    if (key === this.projectsKey) return;
    this.projectsKey = key;
    const all = new Option('All projects', '');
    const opts = projects.map((p) => {
      const o = new Option(`■ ${p.name}`, p.id);
      o.style.color = projectCss(p.id);
      return o;
    });
    this.select.replaceChildren(all, ...opts);
    this.select.value = selected ?? '';
  }

  /** Newest-first events; a new one jumps to the front of the ticker. */
  setEvents(events: readonly OfficeEvent[]): void {
    this.events = events;
    const newest = events[0];
    if (newest && newest.seq !== this.shownSeq) {
      this.index = 0;
      this.show(newest);
    } else if (!newest) {
      this.shownSeq = -1;
      this.tickerText.textContent = 'All quiet in the office.';
    }
  }

  private rotate(): void {
    if (this.events.length < 2) return;
    this.index = (this.index + 1) % Math.min(this.events.length, 8);
    this.show(this.events[this.index]!);
  }

  private show(e: OfficeEvent): void {
    this.shownSeq = this.index === 0 ? e.seq : this.shownSeq;
    const time = new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.tickerText.textContent = `${EVENT_ICON[e.kind]} ${time} · ${e.text}`;
    // Slide in, but not more than about once a second when news is busy.
    const now = performance.now();
    if (now - this.lastSlide < 1200) return;
    this.lastSlide = now;
    this.tickerText.classList.remove('slide');
    void this.tickerText.offsetWidth;
    this.tickerText.classList.add('slide');
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
