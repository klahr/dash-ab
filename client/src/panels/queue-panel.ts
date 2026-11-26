import { queuedTasks, SEATS } from '../world/reception.js';
import { filterNote, h, taskList, type OverlayView } from './overlay.js';

/** Reception overlay: the queue in order, with the clicked visitor highlighted. */
export function queueView(focus?: string): OverlayView {
  return {
    id: focus ? `queue:${focus}` : 'queue',
    className: 'queue',
    title: () => 'Reception',
    render: (ctx) => {
      const all = queuedTasks(ctx.state);
      const tasks = ctx.filter === null ? all : all.filter((t) => t.project === ctx.filter);
      const standing = Math.max(0, all.length - SEATS);
      const summary = h(
        'p',
        'summary',
        `${tasks.length} task(s) waiting for a free desk` +
          (standing ? ` · ${standing} standing (benches seat ${SEATS})` : ''),
      );
      return [
        ...[filterNote(ctx)].filter((x): x is HTMLElement => !!x),
        summary,
        taskList(ctx.state, tasks, 'Nobody is waiting. Every task has a desk.', focus, true),
      ];
    },
  };
}
