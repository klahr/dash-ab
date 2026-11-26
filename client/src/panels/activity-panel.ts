import { EVENT_ICON } from '../events.js';
import { filterNote, h, taskList, type OverlayView } from './overlay.js';

/** HUD "running" counter: tasks at a desk (in progress or merging). */
export function runningView(): OverlayView {
  return {
    id: 'running',
    className: 'running',
    title: () => 'Running',
    render: (ctx) => {
      const tasks = ctx.state.tasks.filter(
        (t) =>
          (t.status === 'in_progress' || t.status === 'merging') &&
          (ctx.filter === null || t.project === ctx.filter),
      );
      const note = filterNote(ctx);
      return [...(note ? [note] : []), taskList(ctx.state, tasks, 'Every desk is free.')];
    },
  };
}

/** HUD "merged today" counter. */
export function mergedTodayView(): OverlayView {
  return {
    id: 'merged-today',
    className: 'review merged',
    title: (ctx) => `Merged today: ${ctx.events.mergedToday(ctx.filter)}`,
    render: (ctx) => {
      const ids = ctx.events.mergedTodayIds(ctx.filter);
      const tasks = ids.map((id) => ctx.state.tasks.find((t) => t.id === id)).filter((t) => !!t);
      const gone = ids.length - tasks.length;
      const note = filterNote(ctx);
      return [
        ...(note ? [note] : []),
        h(
          'p',
          'summary',
          'Counted from Dash timestamps when it reports them, otherwise from merges seen since this page opened.',
        ),
        taskList(ctx.state, tasks, 'No trophies yet today.'),
        ...(gone ? [h('p', 'summary', `+${gone} more that Dash no longer lists.`)] : []),
      ];
    },
  };
}

/** HUD ticker: the full recent-events log. */
export function eventsView(): OverlayView {
  return {
    id: 'events',
    className: 'events',
    title: () => 'Recent events',
    render: (ctx) => {
      const events = ctx.events.filtered(ctx.filter);
      const note = filterNote(ctx);
      if (!events.length)
        return [
          ...(note ? [note] : []),
          h('p', 'empty', 'Nothing has happened since the page opened.'),
        ];
      const ul = h('ul', 'event-log');
      for (const e of events) {
        const li = h('li', `event ${e.kind}`);
        const time = new Date(e.at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        li.append(
          h('span', 'icon', EVENT_ICON[e.kind]),
          h('time', undefined, time),
          h('span', 'text', e.text),
        );
        ul.append(li);
      }
      return [...(note ? [note] : []), ul];
    },
  };
}
