import type { ReviewSection } from '../world/features.js';
import { reviewSections, SECTION_LABEL } from '../world/review.js';
import { filterNote, h, taskList, type OverlayView } from './overlay.js';

const SECTIONS: ReviewSection[] = ['review', 'merging', 'merged', 'failed'];

const BLURB: Record<ReviewSection, string> = {
  review: 'Folders in the inbox tray, waiting for a reviewer.',
  merging: 'Approved folders in the outbox, being merged.',
  merged: 'Trophies on the shelf. Dash drops old finished tasks, so this is recent ones.',
  failed: 'Crumpled paper in the repair bin. These need restarting or fixing.',
};

const EMPTY: Record<ReviewSection, string> = {
  review: 'The inbox is empty.',
  merging: 'Nothing merging right now.',
  merged: 'No trophies yet.',
  failed: 'The repair bin is empty.',
};

/**
 * Review office overlay: one section (inbox, outbox, trophy shelf or repair
 * bin) with tabs to switch, or all of them when no section is given.
 */
export function reviewView(section?: ReviewSection, focus?: string): OverlayView {
  return {
    id: `review:${section ?? 'all'}:${focus ?? ''}`,
    className: `review ${section ?? ''}`,
    title: () => (section ? SECTION_LABEL[section] : 'Review office'),
    render: (ctx) => {
      const sections = reviewSections(ctx.state, ctx.filter);
      const tabs = h('nav', 'tabs');
      for (const s of SECTIONS) {
        const b = h('button', `tab ${s}${s === section ? ' active' : ''}`);
        b.type = 'button';
        b.textContent = `${SECTION_LABEL[s]} ${sections[s].length}`;
        b.addEventListener('click', () => ctx.open(reviewView(s)));
        tabs.append(b);
      }
      const out: Node[] = [tabs];
      const note = filterNote(ctx);
      if (note) out.push(note);
      for (const s of section ? [section] : SECTIONS) {
        if (!section) out.push(h('h3', 'section', SECTION_LABEL[s]));
        out.push(h('p', 'summary', BLURB[s]));
        out.push(taskList(ctx.state, sections[s], EMPTY[s], focus));
      }
      return out;
    },
  };
}
