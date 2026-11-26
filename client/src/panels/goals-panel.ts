import type { Goal } from '@dash-iso/shared';
import { boardGoals, goalProgress } from '../world/noticeboard.js';
import { projectCss } from '../world/projects.js';
import {
  filterNote,
  h,
  projectTag,
  taskList,
  type OverlayContext,
  type OverlayView,
} from './overlay.js';

function progressBar(goal: Goal, ctx: OverlayContext): HTMLElement {
  const p = goalProgress(goal, ctx.state.tasks);
  const wrap = h('div', 'progress');
  const bar = h('div', 'bar');
  const fill = h('div', 'fill');
  fill.style.width = `${Math.round(p.ratio * 100)}%`;
  bar.append(fill);
  const label = p.total
    ? `${p.merged}/${p.total} merged · ${p.active} active${p.failed ? ` · ${p.failed} failed` : ''}`
    : 'No tasks linked yet';
  wrap.append(bar, h('span', 'progress-label', label));
  return wrap;
}

/** One goal: progress and its tasks. */
export function goalView(goalId: string): OverlayView {
  return {
    id: `goal:${goalId}`,
    className: 'goals',
    title: (ctx) => ctx.state.goals.find((g) => g.id === goalId)?.title ?? 'Goal',
    render: (ctx) => {
      const goal = ctx.state.goals.find((g) => g.id === goalId);
      if (!goal) return [h('p', 'empty', 'This goal is no longer on the board.')];
      const meta = h('div', 'task-meta');
      meta.append(projectTag(ctx.state, goal.project));
      const back = h('button', 'link', '← all goals');
      back.type = 'button';
      back.addEventListener('click', () => ctx.open(goalsView()));
      const tasks = goal.taskIds
        .map((id) => ctx.state.tasks.find((t) => t.id === id))
        .filter((t) => !!t);
      return [
        back,
        meta,
        progressBar(goal, ctx),
        taskList(ctx.state, tasks, 'Dash lists no tasks for this goal.'),
      ];
    },
  };
}

/** The noticeboard: every goal as a card with a progress bar. */
export function goalsView(): OverlayView {
  return {
    id: 'goals',
    className: 'goals',
    title: () => 'Goals noticeboard',
    render: (ctx) => {
      const goals = boardGoals(ctx.state, ctx.filter);
      const out: Node[] = [];
      const note = filterNote(ctx);
      if (note) out.push(note);
      if (!goals.length) return [...out, h('p', 'empty', 'No goals pinned.')];
      const ul = h('ul', 'goal-cards');
      for (const g of goals) {
        const li = h('li', 'goal-card');
        li.style.borderTopColor = projectCss(g.project);
        const title = h('button', 'goal-title', g.title);
        title.type = 'button';
        title.addEventListener('click', () => ctx.open(goalView(g.id)));
        const meta = h('div', 'task-meta');
        meta.append(projectTag(ctx.state, g.project));
        li.append(title, meta, progressBar(g, ctx));
        ul.append(li);
      }
      out.push(ul);
      return out;
    },
  };
}
