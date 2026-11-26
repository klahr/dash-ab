import { describe, expect, it } from 'vitest';
import { mockSnapshot } from '@dash-iso/shared';
import { World } from './world.js';
import { PM_OFFICE, PmCharacter, inOffice, officeSpots, routeToRoom } from './pm.js';
import { slotRect } from './layout.js';
import { isPending } from '../chat.js';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

describe('routes', () => {
  it('only uses corridor lanes (never crosses a room)', () => {
    const rects = Array.from({ length: 8 }, (_, s) => slotRect(s));
    for (const r of rects) {
      const route = routeToRoom(r);
      for (let i = 1; i < route.length; i++) {
        const [ax, az] = route[i - 1]!;
        const [bx, bz] = route[i]!;
        expect(ax === bx || az === bz).toBe(true); // axis-aligned
        for (let k = 0; k <= 20; k++) {
          const x = ax + ((bx - ax) * k) / 20;
          const z = az + ((bz - az) * k) / 20;
          for (const room of rects) {
            const inside =
              x > room.x0 && x < room.x0 + room.w && z > room.z0 && z < room.z0 + room.d;
            expect(inside).toBe(false);
          }
        }
      }
      const end = route[route.length - 1]!;
      expect(end[1]).toBeCloseTo(r.z0 + r.d + 0.9);
    }
  });

  it('office spots are inside the office', () => {
    for (const [x, z] of officeSpots()) expect(inOffice(x, z)).toBe(true);
  });
});

describe('PmCharacter', () => {
  it('wanders, visits a room, and comes home', () => {
    const rect = slotRect(5);
    // rng: wants a visit (<0.35), picks the only room.
    const pm = new PmCharacter(seq(0.1, 0));
    pm.rooms = [rect];
    pm.visit(rect);
    let sawVisit = false;
    for (let i = 0; i < 6000; i++) {
      pm.tick(0.05);
      if (pm.visiting) sawVisit = true;
      if (sawVisit && !pm.visiting && pm.mode === 'idle') break;
    }
    expect(sawVisit).toBe(true);
    expect(pm.visiting).toBe(false);
    expect(inOffice(pm.position.x, pm.position.z)).toBe(true);
  });

  it('stands still and shows a bubble while thinking', () => {
    const pm = new PmCharacter(() => 0.9);
    pm.visit(slotRect(0));
    for (let i = 0; i < 20; i++) pm.tick(0.1);
    const { x, z } = pm.position.clone();
    pm.setThinking(true);
    for (let i = 0; i < 20; i++) pm.tick(0.1);
    expect(pm.mode).toBe('thinking');
    expect(pm.position.x).toBe(x);
    expect(pm.position.z).toBe(z);
    expect(pm.bubbleLabel).toMatch(/^Thinking/);
    pm.setThinking(false);
    expect(pm.mode).not.toBe('thinking');
    expect(pm.bubbleLabel).toBe('Here you go!');
    for (let i = 0; i < 40; i++) pm.tick(0.1);
    expect(pm.bubbleLabel).toBe('');
  });
});

describe('World PM', () => {
  it('builds the office and lets the PM be picked', () => {
    const world = new World();
    world.update(mockSnapshot());
    expect(world.root.getObjectByName('plaque-pm')).toBeDefined();
    expect(world.root.getObjectByName('pm')).toBeDefined();
    expect(world.pmOfficeAt(PM_OFFICE.x0 + 1, PM_OFFICE.z0 + 1)).toBe(true);
    expect(world.pmOfficeAt(20, 20)).toBe(false);
    expect(world.pm.rooms.length).toBe(mockSnapshot().runners.length);
    world.tick(0);
    world.tick(0.1);
    world.dispose();
  });
});

describe('isPending', () => {
  it('is true only while the last message is the user’s', () => {
    const m = (role: 'user' | 'assistant' | 'system') => ({
      id: 'x',
      role,
      text: '',
      timestamp: 0,
    });
    expect(isPending([])).toBe(false);
    expect(isPending([m('user')])).toBe(true);
    expect(isPending([m('user'), m('assistant')])).toBe(false);
    expect(isPending([m('user'), m('system')])).toBe(false);
  });
});
