import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  SlotAllocator,
  gridExtent,
  isFrontWall,
  rectContains,
  seededRandom,
  slotRect,
} from './layout.js';

describe('layout', () => {
  it('places rooms on a grid separated by corridors, without overlap', () => {
    const rects = Array.from({ length: 9 }, (_, i) => slotRect(i));
    for (const a of rects) {
      for (const b of rects) {
        if (a === b) continue;
        const overlapX =
          a.x0 < b.x0 + b.w + DEFAULT_LAYOUT.corridor &&
          b.x0 < a.x0 + a.w + DEFAULT_LAYOUT.corridor;
        const overlapZ =
          a.z0 < b.z0 + b.d + DEFAULT_LAYOUT.corridor &&
          b.z0 < a.z0 + a.d + DEFAULT_LAYOUT.corridor;
        expect(overlapX && overlapZ).toBe(false);
      }
    }
    const ext = gridExtent(9);
    expect(ext.rows).toBe(3);
    for (const r of rects) {
      expect(r.x0 + r.w + DEFAULT_LAYOUT.corridor).toBeLessThanOrEqual(ext.width);
      expect(r.z0 + r.d + DEFAULT_LAYOUT.corridor).toBeLessThanOrEqual(ext.depth);
    }
    expect(rectContains(rects[0]!, rects[0]!.x0 + 0.5, rects[0]!.z0 + 0.5)).toBe(true);
    expect(rectContains(rects[0]!, 0.5, 0.5)).toBe(false);
  });

  it('keeps slots stable as runners come and go', () => {
    const s = new SlotAllocator();
    s.assign(['a', 'b', 'c']);
    expect([s.get('a'), s.get('b'), s.get('c')]).toEqual([0, 1, 2]);
    s.assign(['a', 'c']);
    expect(s.get('c')).toBe(2);
    expect(s.get('b')).toBeUndefined();
    s.assign(['a', 'c', 'd', 'e']);
    expect(s.get('d')).toBe(1);
    expect(s.get('e')).toBe(3);
    expect(s.span).toBe(4);
  });

  it('cuts away the walls facing the camera for each rotation', () => {
    expect(['n', 's', 'e', 'w'].filter((w) => isFrontWall(w as 'n', 0))).toEqual(['s', 'e']);
    expect(['n', 's', 'e', 'w'].filter((w) => isFrontWall(w as 'n', 1))).toEqual(['n', 'e']);
    expect(['n', 's', 'e', 'w'].filter((w) => isFrontWall(w as 'n', 2))).toEqual(['n', 'w']);
    expect(['n', 's', 'e', 'w'].filter((w) => isFrontWall(w as 'n', 3))).toEqual(['s', 'w']);
    expect(isFrontWall('s', 4)).toBe(isFrontWall('s', 0));
  });

  it('seeded random is deterministic', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    expect([a(), a()]).toEqual([b(), b()]);
  });
});
