import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mockSnapshot, type Runner, type Task, type WorldState } from '@dash-iso/shared';
import { World } from './world.js';
import { WALL, structureParts } from './room.js';
import { ROOM_THEMES } from './palette.js';

const meshCount = (w: World) => w.root.children.filter((c) => c.name.startsWith('pool-')).length;

describe('World', () => {
  it('creates one room per runner from a snapshot', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    expect(world.roomCount).toBe(state.runners.length);
    for (const r of state.runners) {
      expect(world.hasRoom(r.id)).toBe(true);
      expect(world.root.getObjectByName(`plaque-${r.id}`)).toBeDefined();
    }
  });

  it('adds and removes rooms when runners change, keeping others in place', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    const keep = state.runners[2]!.id;
    const rect = world.room(keep)!.rect;
    const removed = state.runners[0]!.id;

    const next: WorldState = {
      ...state,
      runners: [
        ...state.runners.slice(1),
        { id: 'runner-new', name: 'new', online: true, slots: [] },
      ],
    };
    world.update(next);
    expect(world.hasRoom(removed)).toBe(false);
    expect(world.root.getObjectByName(`plaque-${removed}`)).toBeUndefined();
    expect(world.hasRoom('runner-new')).toBe(true);
    expect(world.room(keep)!.rect).toEqual(rect);
    // New room reuses the freed slot.
    expect(world.room('runner-new')!.rect.slot).toBe(0);
  });

  it('uses a handful of instanced meshes no matter how many rooms', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    const before = meshCount(world);
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `r${i}`,
      name: `r${i}`,
      online: i % 3 !== 0,
      slots: [],
    }));
    world.update({ ...state, runners: many });
    expect(world.roomCount).toBe(40);
    expect(meshCount(world)).toBe(before);
  });

  it('toggles online state and frees instances on removal', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    const id = state.runners[0]!.id;
    world.update({
      ...state,
      runners: state.runners.map((r) => (r.id === id ? { ...r, online: false } : r)),
    });
    expect(world.room(id)!.isOnline).toBe(false);
    world.update({ ...state, runners: [] });
    expect(world.roomCount).toBe(0);
  });

  it('maps ground points to rooms and supports selection', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    const r = world.room(state.runners[1]!.id)!.rect;
    expect(world.roomAt(r.x0 + 1, r.z0 + 1)).toBe(state.runners[1]!.id);
    expect(world.roomAt(0.5, 0.5)).toBeNull();
    world.select(state.runners[1]!.id);
    expect(world.selected).toBe(state.runners[1]!.id);
    world.update({ ...state, runners: [state.runners[0]!] });
    expect(world.selected).toBeNull();
  });

  it('lowers the walls facing the camera', () => {
    const theme = ROOM_THEMES[0]!;
    const tallest = (step: number, inFront: (x: number, z: number) => boolean) =>
      Math.max(
        ...structureParts(8, 7, step, theme)
          .filter((p) => p.pool === 'box' && inFront(p.pos[0], p.pos[2]))
          .map((p) => p.pos[1] + p.size[1]),
      );
    const southWall = (_x: number, z: number) => z > 6;
    const northWall = (_x: number, z: number) => z < 1;
    expect(tallest(0, southWall)).toBeLessThan(WALL.height / 2);
    expect(tallest(0, northWall)).toBeGreaterThanOrEqual(WALL.height);
    expect(tallest(2, southWall)).toBeGreaterThanOrEqual(WALL.height);
    expect(tallest(2, northWall)).toBeLessThan(WALL.height / 2);
  });
});

describe('World desks and workers', () => {
  const withRunner = (state: WorldState, id: string, f: (r: Runner) => Runner): WorldState => ({
    ...state,
    runners: state.runners.map((r) => (r.id === id ? f(r) : r)),
  });
  const run = (world: World, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 30) world.tick(t + 1000);
  };

  it('gives every slot a desk and a worker, seated if the slot is busy', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    for (const r of state.runners) {
      const room = world.room(r.id)!;
      expect(room.deskCount).toBe(r.slots.length);
      expect(room.slotWorkers).toHaveLength(r.slots.length);
      r.slots.forEach((slot, i) => {
        const w = room.worker(i)!;
        expect(w.brain.mode).toBe(slot.task ? 'typing' : 'idle');
        expect(w.brain.task?.id).toBe(slot.task?.id);
      });
    }
  });

  it('follows tasks starting and ending, with an outcome effect', () => {
    const world = new World();
    let state = mockSnapshot();
    world.update(state);
    const id = 'runner-borealis';
    const task: Task = { id: 'new', title: 'New thing', project: 'proj-1', status: 'in_progress' };
    state = withRunner({ ...state, tasks: [...state.tasks, task] }, id, (r) => ({
      ...r,
      slots: [r.slots[0]!, { index: 1, state: 'working', task }],
    }));
    world.update(state);
    const w = world.worker(id, 1)!;
    expect(w.brain.mode).toBe('toDesk');
    world.tick(0);
    for (let t = 0; t < 15 && w.brain.mode !== 'typing'; t += 1 / 30) world.tick(t);
    expect(w.brain.mode).toBe('typing');

    state = withRunner(
      {
        ...state,
        tasks: state.tasks.map((t) => (t.id === 'new' ? { ...t, status: 'failed' } : t)),
      },
      id,
      (r) => ({ ...r, slots: [r.slots[0]!, { index: 1, state: 'idle' }] }),
    );
    world.update(state);
    expect(w.brain.mode).toBe('gettingUp');
    expect(w.brain.lastOutcome).toBe('failure');
    expect(world.effects.count).toBe(1);
    run(world, 3);
    expect(world.effects.count).toBe(0);
    expect(w.brain.mode).toBe('idle');
  });

  it('adds and removes desks and workers when slot counts change', () => {
    const world = new World();
    let state = mockSnapshot();
    world.update(state);
    const id = 'runner-ember';
    const room = world.room(id)!;
    const workerNodes = () => room.group.children.filter((c) => c.name.startsWith('worker-'));
    state = withRunner(state, id, (r) => ({
      ...r,
      slots: [0, 1, 2].map((index) => ({ index, state: 'idle' as const })),
    }));
    world.update(state);
    expect(room.deskCount).toBe(3);
    expect(room.slotWorkers).toHaveLength(3);
    expect(room.worker(2)!.brain.pos.z).toBeGreaterThan(room.rect.d); // walks in from the door

    state = withRunner(state, id, (r) => ({ ...r, slots: r.slots.slice(0, 1) }));
    world.update(state);
    expect(room.deskCount).toBe(1);
    expect(room.slotWorkers).toHaveLength(1);
    expect(workerNodes()).toHaveLength(3); // two still walking out
    run(world, 20);
    expect(workerNodes()).toHaveLength(1);
  });

  it('removes workers with their room', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    world.update({ ...state, runners: [] });
    expect(world.root.children.some((c) => c.name.startsWith('room-'))).toBe(false);
  });

  it('picks workers with a ray', () => {
    const world = new World();
    const state = mockSnapshot();
    world.update(state);
    world.root.updateMatrixWorld(true);
    const w = world.worker('runner-atlas', 0)!;
    const p = w.root.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Raycaster(new THREE.Vector3(p.x, 5, p.z), new THREE.Vector3(0, -1, 0));
    expect(world.workerAt(ray)).toBe(w);
    const miss = new THREE.Raycaster(new THREE.Vector3(-50, 5, -50), new THREE.Vector3(0, -1, 0));
    expect(world.workerAt(miss)).toBeNull();
  });
});
