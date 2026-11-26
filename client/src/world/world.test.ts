import { describe, expect, it } from 'vitest';
import { mockSnapshot, type WorldState } from '@dash-iso/shared';
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
