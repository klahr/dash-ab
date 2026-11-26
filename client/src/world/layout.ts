/**
 * Pure grid layout for the office: rooms sit in a fixed number of columns,
 * separated (and surrounded) by corridors. All units are floor tiles (1 tile =
 * 1 world unit). Nothing in here touches three.js.
 */

export interface LayoutConfig {
  /** Rooms per row. Fixed so that adding runners never moves existing rooms. */
  cols: number;
  /** Room footprint in tiles, walls included. */
  roomW: number;
  roomD: number;
  /** Corridor width in tiles. */
  corridor: number;
}

export const DEFAULT_LAYOUT: LayoutConfig = { cols: 4, roomW: 8, roomD: 7, corridor: 2 };

export interface RoomRect {
  slot: number;
  col: number;
  row: number;
  /** Min corner in world x/z. */
  x0: number;
  z0: number;
  w: number;
  d: number;
}

export interface GridExtent {
  cols: number;
  rows: number;
  width: number;
  depth: number;
}

export function slotRect(slot: number, cfg: LayoutConfig = DEFAULT_LAYOUT): RoomRect {
  const col = slot % cfg.cols;
  const row = Math.floor(slot / cfg.cols);
  return {
    slot,
    col,
    row,
    x0: cfg.corridor + col * (cfg.roomW + cfg.corridor),
    z0: cfg.corridor + row * (cfg.roomD + cfg.corridor),
    w: cfg.roomW,
    d: cfg.roomD,
  };
}

/** Extent of the whole floor needed to hold `slotCount` slots (at least one row). */
export function gridExtent(slotCount: number, cfg: LayoutConfig = DEFAULT_LAYOUT): GridExtent {
  const rows = Math.max(1, Math.ceil(slotCount / cfg.cols));
  return {
    cols: cfg.cols,
    rows,
    width: cfg.corridor + cfg.cols * (cfg.roomW + cfg.corridor),
    depth: cfg.corridor + rows * (cfg.roomD + cfg.corridor),
  };
}

export function rectContains(r: RoomRect, x: number, z: number): boolean {
  return x >= r.x0 && x < r.x0 + r.w && z >= r.z0 && z < r.z0 + r.d;
}

/**
 * Keeps a stable id -> slot mapping. Existing ids keep their slot; removed ids
 * free theirs; new ids take the lowest free slot, in the order given.
 */
export class SlotAllocator {
  private readonly slots = new Map<string, number>();

  assign(ids: readonly string[]): ReadonlyMap<string, number> {
    const keep = new Set(ids);
    for (const id of [...this.slots.keys()]) if (!keep.has(id)) this.slots.delete(id);
    const used = new Set(this.slots.values());
    let next = 0;
    for (const id of ids) {
      if (this.slots.has(id)) continue;
      while (used.has(next)) next++;
      this.slots.set(id, next);
      used.add(next);
    }
    return this.slots;
  }

  get(id: string): number | undefined {
    return this.slots.get(id);
  }

  /** One past the highest slot in use (0 when empty). */
  get span(): number {
    let max = -1;
    for (const s of this.slots.values()) max = Math.max(max, s);
    return max + 1;
  }
}

/** Small deterministic PRNG so each room's props stay put across reloads. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type WallSide = 'n' | 's' | 'e' | 'w';

const NORMALS: Record<WallSide, [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  w: [-1, 0],
  e: [1, 0],
};

/** Horizontal angle of the camera around its target for a 90° rotation step. */
export function viewAngle(step: number): number {
  return Math.PI / 4 + step * (Math.PI / 2);
}

/**
 * A wall is "front" (cut away / lowered) when its outward normal points toward
 * the camera, i.e. it would hide the room's interior.
 */
export function isFrontWall(side: WallSide, step: number): boolean {
  const a = viewAngle(step);
  const [nx, nz] = NORMALS[side];
  return nx * Math.sin(a) + nz * Math.cos(a) > 0;
}
