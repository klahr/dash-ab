import { TASK_STATUSES } from '@dash-iso/shared';
import { goalProgress } from '../world/noticeboard.js';
import { projectCss } from '../world/projects.js';
import { goalView } from './goals-panel.js';
import { h, statusPill, taskList, type OverlayView } from './overlay.js';

/** A project banner: colour, task counts by status, goals and active tasks. */
export function projectView(projectId: string): OverlayView {
  return {
    id: `project:${projectId}`,
    className: 'project',
    title: (ctx) => ctx.state.projects.find((p) => p.id === projectId)?.name ?? projectId,
    render: (ctx) => {
      const project = ctx.state.projects.find((p) => p.id === projectId);
      if (!project) return [h('p', 'empty', 'This project is gone.')];
      const swatch = h('div', 'swatch');
      swatch.style.background = projectCss(project.id);
      swatch.append(h('span', undefined, 'Badges, shirts, folders and trophies in this colour'));

      const tasks = ctx.state.tasks.filter((t) => t.project === project.id);
      const counts = h('div', 'status-counts');
      for (const s of TASK_STATUSES) {
        const n = tasks.filter((t) => t.status === s).length;
        if (!n) continue;
        const pill = statusPill(s);
        pill.textContent = `${pill.textContent} ${n}`;
        counts.append(pill);
      }
      if (!counts.childElementCount) counts.append(h('span', 'empty', 'No tasks'));

      const focus = h(
        'button',
        'action',
        ctx.filter === project.id ? 'Show all projects' : 'Filter the office to this project',
      );
      focus.type = 'button';
      focus.addEventListener('click', () =>
        ctx.setFilter(ctx.filter === project.id ? null : project.id),
      );

      const out: Node[] = [swatch, counts, focus];
      const goals = ctx.state.goals.filter((g) => g.project === project.id);
      if (goals.length) {
        out.push(h('h3', 'section', 'Goals'));
        const ul = h('ul', 'goal-links');
        for (const g of goals) {
          const p = goalProgress(g, ctx.state.tasks);
          const b = h('button', 'link', `🎯 ${g.title} — ${p.merged}/${p.total}`);
          b.type = 'button';
          b.addEventListener('click', () => ctx.open(goalView(g.id)));
          const li = h('li');
          li.append(b);
          ul.append(li);
        }
        out.push(ul);
      }
      out.push(h('h3', 'section', 'Active tasks'));
      const active = tasks.filter((t) =>
        ['queued', 'in_progress', 'review', 'merging'].includes(t.status),
      );
      out.push(taskList(ctx.state, active, 'Nothing active.'));
      return out;
    },
  };
}
