import * as THREE from 'three';
import type { Runner, WorldState } from '@dash-iso/shared';
import { deskLayout, workerSite, type DeskSpot } from './desks.js';
import type { Effects } from './effects.js';
import type { Kit, Part, PartHandle } from './instancing.js';
import { isFrontWall, seededRandom, type RoomRect, type WallSide } from './layout.js';
import { COLORS, ROOM_THEMES, dim, type RoomTheme } from './palette.js';
import * as P from './props.js';
import { PLAQUE_ASPECT, plaqueTexture } from './textures.js';
import { Worker } from './worker.js';
import { syncSlot } from './worker-fsm.js';

export const WALL = {
  thickness: 0.22,
  height: 2.1,
  /** Height of cut-away walls on the camera side. */
  low: 0.3,
  doorX0: 1.3,
  doorX1: 2.7,
  doorHeight: 1.75,
} as const;

const TILE_H = 0.1;

/** Checkered floor tiles in room-local coordinates. */
export function floorParts(w: number, d: number, a: number, b: number): Part[] {
  const parts: Part[] = [];
  for (let i = 0; i < w; i++) {
    for (let j = 0; j < d; j++) {
      parts.push({
        pool: 'tile',
        pos: [i + 0.5, -TILE_H, j + 0.5],
        size: [0.98, TILE_H, 0.98],
        color: (i + j) % 2 ? a : b,
      });
    }
  }
  return parts;
}

/**
 * Walls, trim and door for a room of size w×d (local coordinates). Walls facing
 * the camera for the given rotation step are lowered so the interior shows.
 */
export function structureParts(w: number, d: number, step: number, theme: RoomTheme): Part[] {
  const { thickness: T, height: H, low: L, doorX0, doorX1, doorHeight } = WALL;
  const parts: Part[] = [];
  const h = (side: WallSide) => (isFrontWall(side, step) ? L : H);

  const wall = (side: WallSide, cx: number, cz: number, alongX: boolean, len: number) => {
    const height = h(side);
    const sx = alongX ? len : T;
    const sz = alongX ? T : len;
    parts.push({ pool: 'box', pos: [cx, 0, cz], size: [sx, height, sz], color: COLORS.wall });
    // Skirting and a chunky coloured cap.
    const pad = 0.04;
    parts.push({
      pool: 'box',
      pos: [cx, 0, cz],
      size: [alongX ? len : T + pad, Math.min(0.16, height), alongX ? T + pad : len],
      color: theme.accent,
    });
    parts.push({
      pool: 'box',
      pos: [cx, height, cz],
      size: [alongX ? len + pad : T + pad, 0.08, alongX ? T + pad : len + pad],
      color: theme.accent,
    });
  };

  wall('n', w / 2, T / 2, true, w);
  wall('s', doorX0 / 2, d - T / 2, true, doorX0);
  wall('s', (doorX1 + w) / 2, d - T / 2, true, w - doorX1);
  wall('w', T / 2, d / 2, false, d - 2 * T);
  wall('e', w - T / 2, d / 2, false, d - 2 * T);

  // Door: frame posts, lintel (only when the wall is standing) and an open door.
  const sH = h('s');
  const frameH = sH === H ? doorHeight : sH + 0.06;
  const zc = d - T / 2;
  for (const x of [doorX0 + 0.06, doorX1 - 0.06]) {
    parts.push({
      pool: 'box',
      pos: [x, 0, zc],
      size: [0.12, frameH, T + 0.1],
      color: COLORS.doorFrame,
    });
  }
  if (sH === H) {
    const mid = (doorX0 + doorX1) / 2;
    const gap = doorX1 - doorX0;
    parts.push({
      pool: 'box',
      pos: [mid, doorHeight, zc],
      size: [gap, H - doorHeight, T],
      color: COLORS.wall,
    });
    parts.push({
      pool: 'box',
      pos: [mid, doorHeight - 0.1, zc],
      size: [gap, 0.12, T + 0.1],
      color: COLORS.doorFrame,
    });
    parts.push({
      pool: 'box',
      pos: [mid, H, zc],
      size: [gap + 0.04, 0.08, T + 0.04],
      color: theme.accent,
    });
  }
  const leaf = doorX1 - doorX0 - 0.24;
  const swing = 1.25; // radians, opening inward
  const hx = doorX0 + 0.12;
  const hz = d - T;
  parts.push({
    pool: 'box',
    pos: [hx + (Math.cos(swing) * leaf) / 2, 0.02, hz - (Math.sin(swing) * leaf) / 2],
    size: [leaf, Math.min(doorHeight - 0.08, sH), 0.07],
    rotY: swing,
    color: theme.accent,
  });
  return parts;
}

/** Furniture and decoration, varied per room but deterministic per runner id. */
export function propParts(id: string, w: number, d: number, theme: RoomTheme): Part[] {
  const rnd = seededRandom(id);
  const T = WALL.thickness;
  const parts: Part[] = [];
  const add = (p: Part[]) => parts.push(...p);

  add(P.placed(P.rug(3.2, 2.4, theme.floorB, theme.accent), w / 2 + 0.4, d / 2));
  add(P.placed(P.plant(1 + rnd() * 0.3), T + 0.45, T + 0.45));
  add(P.placed(P.bookshelf(Math.floor(rnd() * 6)), 3.0, T + 0.21));
  const cabinets = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < cabinets; i++) add(P.placed(P.filingCabinet(), 4.4 + i * 0.6, T + 0.3));
  add(P.placed(P.plant(0.8 + rnd() * 0.3), w - T - 0.45, T + 0.45));
  add(P.placed(P.waterCooler(), w - T - 0.3, 3.0, -Math.PI / 2));
  add(P.placed(P.floorLamp(), T + 0.35, 2.6));
  if (rnd() < 0.6) add(P.placed(P.sofa(theme.furniture), T + 0.4, 4.4, Math.PI / 2));
  else add(P.placed(P.bookshelf(3), T + 0.21, 4.4, Math.PI / 2));
  add(P.placed(P.plant(1.1), w - T - 0.5, d - T - 0.5));
  add(P.placed(P.bin(), w - T - 1.3, d - T - 0.3));
  // Doormat just outside the door, in the corridor.
  add(
    P.placed(
      P.rug(1.2, 0.7, COLORS.woodDark, COLORS.wood),
      (WALL.doorX0 + WALL.doorX1) / 2,
      d + 0.45,
    ),
  );
  return parts;
}

export function themeFor(id: string): RoomTheme {
  return ROOM_THEMES[Math.floor(seededRandom(`theme:${id}`)() * ROOM_THEMES.length)]!;
}

/** Hooks a room needs from its world (all optional, for tests). */
export interface RoomContext {
  effects?: Effects;
  projectName?: (id: string) => string;
}

interface DeskHandles {
  spot: DeskSpot;
  parts: PartHandle[];
  screen: PartHandle;
}

const SCREEN = {
  off: 0x10131c,
  idle: 0x23405a,
  on: 0x7fe0ff,
  flicker: 0xb6f4ff,
} as const;

/**
 * Scene objects for one runner's room. Owns its instances, plaque, one desk
 * per slot and one worker per slot.
 */
export class Room {
  readonly theme: RoomTheme;
  /** Room-local space (origin at the room's min corner); workers live here. */
  readonly group = new THREE.Group();
  private readonly base: THREE.Matrix4;
  private statics: PartHandle[] = [];
  private structure: PartHandle[] = [];
  private desks: DeskHandles[] = [];
  private workers: Worker[] = [];
  /** Workers whose slot was removed, walking out of the door. */
  private leaving: Worker[] = [];
  private readonly plaque: THREE.Sprite;
  private name: string;
  private online: boolean;
  private readonly tmp = new THREE.Vector3();
  private time = 0;

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    readonly runnerId: string,
    runner: Runner,
    readonly rect: RoomRect,
    private step: number,
    private readonly ctx: RoomContext = {},
    state?: WorldState,
  ) {
    this.theme = themeFor(runnerId);
    this.name = runner.name;
    this.online = runner.online;
    this.base = new THREE.Matrix4().makeTranslation(rect.x0, 0, rect.z0);
    const parts = [
      ...floorParts(rect.w, rect.d, this.theme.floorA, this.theme.floorB),
      ...propParts(runnerId, rect.w, rect.d, this.theme),
    ];
    this.statics = parts.map((p) => kit.place(p, this.base, this.colorOf(p)));
    this.buildStructure();

    this.group.name = `room-${runnerId}`;
    this.group.position.set(rect.x0, 0, rect.z0);
    parent.add(this.group);

    this.plaque = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: plaqueTexture(this.name, this.online), transparent: true }),
    );
    this.plaque.name = `plaque-${runnerId}`;
    const pw = 2.4;
    this.plaque.scale.set(pw, pw / PLAQUE_ASPECT, 1);
    this.plaque.position.set(
      rect.x0 + (WALL.doorX0 + WALL.doorX1) / 2,
      WALL.height + 0.55,
      rect.z0 + rect.d,
    );
    this.plaque.renderOrder = 2;
    parent.add(this.plaque);

    this.syncSlots(runner, state, true);
  }

  get isOnline(): boolean {
    return this.online;
  }

  get deskCount(): number {
    return this.desks.length;
  }

  /** Workers by slot index (excludes ones walking out). */
  get slotWorkers(): readonly Worker[] {
    return this.workers;
  }

  /** Every worker currently in the scene, including ones leaving. */
  get allWorkers(): readonly Worker[] {
    return [...this.workers, ...this.leaving];
  }

  worker(slot: number): Worker | undefined {
    return this.workers[slot];
  }

  private colorOf(p: Part): number {
    if (this.online) return p.color;
    return p.lamp ? COLORS.lampOff : dim(p.color);
  }

  private buildStructure(): void {
    for (const h of this.structure) this.kit.release(h);
    this.structure = structureParts(this.rect.w, this.rect.d, this.step, this.theme).map((p) =>
      this.kit.place(p, this.base, this.colorOf(p)),
    );
  }

  /** Lay out `count` desks (rebuilt from scratch when the count changes). */
  private buildDesks(count: number): void {
    for (const d of this.desks) for (const h of d.parts) this.kit.release(h);
    const dims = { w: this.rect.w, d: this.rect.d };
    this.desks = deskLayout(count, dims).map((spot) => {
      const parts = [
        ...P.placed(P.desk(spot.width, spot.index + this.rect.slot), spot.x, spot.z),
        ...P.placed(P.chair(this.theme.furniture), spot.seat.pos.x, spot.seat.pos.z),
      ];
      const handles = parts.map((p) => this.kit.place(p, this.base, this.colorOf(p)));
      return { spot, parts: handles, screen: handles.find((h) => h.pool === 'screen')! };
    });
  }

  /** Apply name / online / slot changes from a new snapshot. */
  update(runner: Runner, state?: WorldState): void {
    const onlineChanged = runner.online !== this.online;
    const nameChanged = runner.name !== this.name;
    this.online = runner.online;
    this.name = runner.name;
    if (onlineChanged) {
      const desks = this.desks.flatMap((d) => d.parts);
      for (const h of [...this.statics, ...this.structure, ...desks])
        this.kit.recolor(h, this.colorOf(h.part));
    }
    if (onlineChanged || nameChanged) {
      const mat = this.plaque.material;
      mat.map?.dispose();
      mat.map = plaqueTexture(this.name, this.online);
      mat.needsUpdate = true;
    }
    this.syncSlots(runner, state, false);
  }

  /**
   * One desk and one worker per slot. New slots get a worker walking in from
   * the door (or already in place on the first snapshot); removed slots' workers
   * walk out. Task changes drive each worker's state machine.
   */
  private syncSlots(runner: Runner, state: WorldState | undefined, initial: boolean): void {
    const count = runner.slots.length;
    const dims = { w: this.rect.w, d: this.rect.d };
    if (count !== this.desks.length) {
      this.buildDesks(count);
      const spots = this.desks.map((d) => d.spot);
      while (this.workers.length > count) {
        const w = this.workers.pop()!;
        w.brain.leave();
        this.leaving.push(w);
      }
      for (let i = 0; i < count; i++) {
        const site = workerSite(spots[i]!, spots, dims);
        const existing = this.workers[i];
        if (existing) {
          existing.brain.setSite(site);
          continue;
        }
        const w = new Worker(
          this.runnerId,
          i,
          site,
          { start: initial ? 'placed' : 'door' },
          (id) => this.ctx.projectName?.(id) ?? id,
        );
        this.group.add(w.root);
        this.workers.push(w);
      }
    }

    const tasks = state?.tasks ?? [];
    runner.slots.forEach((slot, i) => {
      const w = this.workers[i];
      if (!w) return;
      for (const change of syncSlot(w.brain, slot, tasks)) {
        if (change.kind === 'released' && change.outcome && !initial)
          this.ctx.effects?.spawn(change.outcome, w.effectAnchor(this.tmp));
        if (change.kind === 'assigned' && initial) w.brain.seatNow();
      }
      w.refreshTask();
    });
  }

  /** Per-frame animation: workers and computer screens. */
  tick(dt: number): void {
    this.time += dt;
    for (const w of this.workers) w.update(dt);
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const w = this.leaving[i]!;
      w.update(dt);
      if (w.brain.mode === 'gone') {
        w.dispose();
        this.leaving.splice(i, 1);
      }
    }
    this.desks.forEach((d, i) => {
      this.kit.recolor(d.screen, this.screenColor(this.workers[i], i));
    });
  }

  private screenColor(w: Worker | undefined, i: number): number {
    if (!this.online) return SCREEN.off;
    const mode = w?.brain.mode;
    if (mode === 'typing') {
      // Scrolling-text flicker, out of phase per desk.
      return Math.sin(this.time * 9 + i * 1.7) > 0.6 ? SCREEN.flicker : SCREEN.on;
    }
    if (mode === 'sittingDown' || (w?.brain.busy && mode === 'toDesk')) return SCREEN.on;
    return SCREEN.idle;
  }

  setViewRotation(step: number): void {
    if (step === this.step) return;
    this.step = step;
    this.buildStructure();
  }

  dispose(): void {
    const desks = this.desks.flatMap((d) => d.parts);
    for (const h of [...this.statics, ...this.structure, ...desks]) this.kit.release(h);
    this.statics = [];
    this.structure = [];
    this.desks = [];
    for (const w of [...this.workers, ...this.leaving]) w.dispose();
    this.workers = [];
    this.leaving = [];
    this.parent.remove(this.group);
    this.parent.remove(this.plaque);
    this.plaque.material.map?.dispose();
    this.plaque.material.dispose();
  }
}
