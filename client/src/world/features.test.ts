import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mockSnapshot, type Task, type WorldState } from '@dash-iso/shared';
import { cardAt, goalProgress, CARD_COLS, CARD_ROWS } from './noticeboard.js';
import { projectCss, projectHex } from './projects.js';
import { SEATS, SEAT_SPOTS, planSeats } from './reception.js';
import { CAPS, crumpled, folderStack, reviewSections, trophies } from './review.js';
import { LOBBY, REVIEW_OFFICE, routeFromWing } from './wing.js';
import { slotRect } from './layout.js';
import { PM_OFFICE } from './pm.js';
import { World } from './world.js';

const queued = (n: number, from = 0): Task[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `q${from + i}`,
    title: `Queued ${from + i}`,
    project: i % 2 ? 'proj-1' : 'proj-2',
    status: 'queued' as const,
  }));

describe('planSeats', () => {
  it('seats queued tasks in order and caps at the bench count', () => {
    const ids = queued(SEATS + 3).map((t) => t.id);
    const plan = planSeats(new Map(), ids);
    expect(plan.arrive).toHaveLength(SEATS);
    expect(plan.arrive[0]).toEqual(['q0', 0]);
    expect(plan.leave).toEqual([]);
  });

  it('keeps seats stable, frees them on pick-up and refills from the queue', () => {
    const first = planSeats(new Map(), ['a', 'b', 'c'], 2);
    expect([...first.seats]).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    const next = planSeats(first.seats, ['b', 'c'], 2);
    expect(next.leave).toEqual(['a']);
    expect(next.seats.get('b')).toBe(1);
    expect(next.arrive).toEqual([['c', 0]]);
  });

  it('has distinct seats inside the lobby', () => {
    expect(new Set(SEAT_SPOTS.map((s) => s.join())).size).toBe(SEATS);
    for (const [x, z] of SEAT_SPOTS) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(LOBBY.w);
      expect(z).toBeLessThan(LOBBY.d);
    }
  });
});

describe('north wing', () => {
  it('buildings do not overlap and fit the grid width', () => {
    const wing = [PM_OFFICE, LOBBY, REVIEW_OFFICE].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < wing.length; i++)
      expect(wing[i]!.x0).toBeGreaterThanOrEqual(wing[i - 1]!.x0 + wing[i - 1]!.w);
    expect(REVIEW_OFFICE.x0 + REVIEW_OFFICE.w).toBeLessThanOrEqual(new World().extent.width);
  });

  it('routes from the lobby end at the room door along corridors', () => {
    const r = slotRect(5);
    const route = routeFromWing(LOBBY, r);
    for (let i = 1; i < route.length; i++) {
      const [ax, az] = route[i - 1]!;
      const [bx, bz] = route[i]!;
      expect(ax === bx || az === bz).toBe(true);
    }
    expect(route.at(-1)![1]).toBeCloseTo(r.z0 + r.d + 0.9);
  });
});

describe('goals', () => {
  it('measures progress from merged tasks', () => {
    const s = mockSnapshot();
    const p = goalProgress(s.goals[0]!, s.tasks);
    expect(p).toMatchObject({ total: 4, merged: 1, active: 3, failed: 0 });
    expect(p.ratio).toBeCloseTo(0.25);
  });

  it('maps board UVs to cards', () => {
    expect(cardAt(0.1, 0.9)).toBe(0);
    expect(cardAt(0.9, 0.1)).toBe(CARD_COLS * CARD_ROWS - 1);
    expect(cardAt(0.001, 0.5)).toBe(-1);
  });
});

describe('review office', () => {
  it('sorts tasks into stations and caps the props', () => {
    const s = mockSnapshot();
    const sec = reviewSections(s, null);
    expect(sec.review.map((t) => t.id)).toEqual(['task-4', 'task-10']);
    expect(sec.merged.map((t) => t.id)).toEqual(['task-8']);
    expect(sec.failed.map((t) => t.id)).toEqual(['task-9']);
    expect(reviewSections(s, 'proj-1').review.map((t) => t.id)).toEqual(['task-10']);
    const many = queued(40);
    expect(folderStack(many, CAPS.review)).toHaveLength(CAPS.review * 3);
    expect(trophies(many, CAPS.merged)).toHaveLength(CAPS.merged * 3);
    expect(crumpled(many, CAPS.failed)).toHaveLength(CAPS.failed);
  });

  it('colours props by project', () => {
    const [folder] = folderStack([{ id: 'x', title: 'x', project: 'p', status: 'review' }], 1);
    expect(folder!.color).toBe(projectHex('p'));
    const c = new THREE.Color(projectCss('p'));
    expect(c.getHex()).toBe(projectHex('p'));
  });
});

describe('World features', () => {
  const at = (ref: WorldState) => ref;

  it('seats one visitor per queued task and walks them to the room on pick-up', () => {
    const world = new World();
    let s = mockSnapshot();
    world.update(s);
    expect(world.reception.visitors.map((v) => v.task.id).sort()).toEqual(['task-3', 'task-7']);
    expect(world.reception.visitors.every((v) => v.mode === 'seated')).toBe(true);

    // task-7 gets picked up by ember (slot 0).
    s = at({
      ...s,
      tasks: s.tasks.map((t) => (t.id === 'task-7' ? { ...t, status: 'in_progress' } : t)),
      runners: s.runners.map((r) =>
        r.id === 'runner-ember'
          ? {
              ...r,
              slots: [
                { index: 0, state: 'working', task: s.tasks.find((t) => t.id === 'task-7')! },
              ],
            }
          : r,
      ),
    });
    world.update(s);
    const v = world.reception.visitorFor('task-7')!;
    expect(v.leaving).toBe(true);
    const room = world.room('runner-ember')!.rect;
    for (let i = 0; i < 400 && v.mode !== 'gone'; i++) world.tick(i * 0.1);
    expect(world.reception.visitorFor('task-7')).toBeUndefined();
    expect(world.reception.visitors).toHaveLength(1);
    // It ended up at the ember room's door.
    expect(Math.abs(v.root.position.z - (room.z0 + room.d + 0.9))).toBeLessThan(0.01);
  });

  it('new queued tasks walk in and sit down', () => {
    const world = new World();
    const s = mockSnapshot();
    world.update(s);
    world.update({ ...s, tasks: [...s.tasks, ...queued(1, 100)] });
    const v = world.reception.visitorFor('q100')!;
    expect(v.mode).toBe('walking');
    for (let i = 0; i < 300 && v.mode === 'walking'; i++) world.tick(i * 0.1);
    expect(v.mode).toBe('seated');
  });

  it('caps visitors at the bench count', () => {
    const world = new World();
    const s = mockSnapshot();
    world.update({ ...s, tasks: [...s.tasks, ...queued(SEATS + 5, 100)] });
    expect(world.reception.visitors).toHaveLength(SEATS);
    expect(world.reception.queued).toBe(SEATS + 7);
  });

  it('fills the review stations and honours the project filter', () => {
    const world = new World();
    world.update(mockSnapshot());
    expect(world.review.sectionCounts).toEqual({ review: 2, merging: 0, merged: 1, failed: 1 });
    expect(world.review.propCount('review')).toBe(6);
    expect(world.banners.count).toBe(2);
    world.setProjectFilter('proj-1');
    expect(world.review.sectionCounts).toEqual({ review: 1, merging: 0, merged: 1, failed: 0 });
    const hidden = world.reception.visitors.filter((v) => !v.root.visible).map((v) => v.task.id);
    expect(hidden).toEqual(['task-7']);
  });

  it('maps ground points to features', () => {
    const world = new World();
    world.update(mockSnapshot());
    expect(world.featureAt(LOBBY.x0 + 5, LOBBY.z0 + 3)).toEqual({ kind: 'queue' });
    expect(world.featureAt(REVIEW_OFFICE.x0 + 5, REVIEW_OFFICE.z0 + 3)).toEqual({ kind: 'review' });
    expect(world.featureAt(5, 5)).toBeNull();
  });

  it('picks the noticeboard, a review station and a banner by ray', () => {
    const world = new World();
    world.update(mockSnapshot());
    world.root.updateMatrixWorld(true);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    const aim = (x: number, y: number, z: number, from: [number, number, number] = [0, 50, 0]) => {
      cam.position.set(x + from[0], y + from[1], z + from[2]);
      cam.lookAt(x, y, z);
      cam.updateMatrixWorld(true);
      return world.pickFeature(new THREE.Vector2(0, 0), cam);
    };
    const bin = REVIEW_OFFICE;
    expect(aim(bin.x0 + 8.3, 0, bin.z0 + 5.3)).toEqual({ kind: 'review', section: 'failed' });
    // Banners and the board are upright: look at them from the front.
    const front: [number, number, number] = [0, 0, 20];
    expect(aim(LOBBY.x0 + 0.9 + 0.5, 1.9, LOBBY.z0 + 0.75, front)).toEqual({
      kind: 'project',
      id: 'proj-1',
    });
    expect(aim(LOBBY.x0 + 9.2 - 1.5, 2.4, LOBBY.z0 + 0.75, front)).toEqual({
      kind: 'goals',
      goalId: 'goal-1',
    });
  });
});
