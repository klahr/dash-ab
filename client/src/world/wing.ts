import * as THREE from 'three';
import type { Kit, Part, PartHandle } from './instancing.js';
import { rectContains, type RoomRect } from './layout.js';
import type { RoomTheme } from './palette.js';
import { floorParts, structureParts, WALL } from './room.js';
import { PLAQUE_ASPECT, plaqueTexture } from './textures.js';

/**
 * The north wing: buildings in a row north of the room grid, each with its
 * door on the south wall opening onto the top corridor. The project manager's
 * office (`pm.ts`) is the first; reception and the review office follow.
 */

export type Vec2 = readonly [number, number];

/** Reception / waiting room with the goals noticeboard and project banners. */
export const LOBBY: RoomRect = { slot: -2, col: 1, row: -1, x0: 14, z0: -7, w: 14, d: 7 };
/** Review office: inbox tray, trophy shelf, repair bin. */
export const REVIEW_OFFICE: RoomRect = { slot: -3, col: 2, row: -1, x0: 30, z0: -7, w: 10, d: 7 };

/** World z of the corridor running along the top of the grid. */
export const CORRIDOR_Z = 1;

/** World x of a building's (or room's) door centre. */
export function doorX(rect: RoomRect): number {
  return rect.x0 + (WALL.doorX0 + WALL.doorX1) / 2;
}

/** Waypoints from just inside a north-wing door out to the corridor. */
export function exitRoute(rect: RoomRect): Vec2[] {
  const x = doorX(rect);
  return [
    [x, rect.z0 + rect.d - 0.9],
    [x, CORRIDOR_Z],
  ];
}

/**
 * Corridor route from a north-wing building's door to just outside a grid
 * room's door. Rooms sit on a grid with corridors on every side, so a
 * Manhattan route along the corridors never crosses a room.
 */
export function routeFromWing(from: RoomRect, to: RoomRect): Vec2[] {
  const doorZ = to.z0 + to.d + 0.9;
  const lane = to.x0 - 1;
  const pts: Vec2[] = [...exitRoute(from), [lane, CORRIDOR_Z], [lane, doorZ], [doorX(to), doorZ]];
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
}

/**
 * A north-wing building shell: chequered floor, walls with the camera-side ones
 * cut away, a door on the south wall and a brass plaque over it.
 */
export class WingBuilding {
  private readonly base: THREE.Matrix4;
  private floor: PartHandle[] = [];
  private structure: PartHandle[] = [];
  private readonly plaque: THREE.Sprite;

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    readonly rect: RoomRect,
    private readonly theme: RoomTheme,
    title: string,
    private step: number,
  ) {
    this.base = new THREE.Matrix4().makeTranslation(rect.x0, 0, rect.z0);
    this.floor = floorParts(rect.w, rect.d, theme.floorA, theme.floorB).map((p) =>
      kit.place(p, this.base),
    );
    this.buildStructure();
    this.plaque = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: plaqueTexture(title, true), transparent: true }),
    );
    this.plaque.name = `plaque-${title}`;
    const pw = 2.8;
    this.plaque.scale.set(pw, pw / PLAQUE_ASPECT, 1);
    this.plaque.position.set(doorX(rect), WALL.height + 0.55, rect.z0 + rect.d);
    this.plaque.renderOrder = 2;
    parent.add(this.plaque);
  }

  /** Room-local → world matrix, for placing props. */
  get matrix(): THREE.Matrix4 {
    return this.base;
  }

  contains(x: number, z: number): boolean {
    return rectContains(this.rect, x, z);
  }

  private buildStructure(): void {
    for (const h of this.structure) this.kit.release(h);
    this.structure = structureParts(this.rect.w, this.rect.d, this.step, this.theme).map((p) =>
      this.kit.place(p, this.base),
    );
  }

  setViewRotation(step: number): void {
    if (step === this.step) return;
    this.step = step;
    this.buildStructure();
  }

  dispose(): void {
    for (const h of [...this.floor, ...this.structure]) this.kit.release(h);
    this.floor = [];
    this.structure = [];
    this.parent.remove(this.plaque);
    this.plaque.material.map?.dispose();
    this.plaque.material.dispose();
  }
}

/**
 * Rebuildable set of kit parts: `set(key, parts)` swaps the instances only when
 * the key changes. Used for props whose count follows the data (folders,
 * trophies, crumpled paper).
 */
export class PartSet {
  private handles: PartHandle[] = [];
  private key: string | null = null;

  constructor(
    private readonly kit: Kit,
    private readonly base: THREE.Matrix4,
  ) {}

  set(key: string, build: () => Part[]): void {
    if (key === this.key) return;
    this.key = key;
    this.clear();
    this.handles = build().map((p) => this.kit.place(p, this.base));
  }

  get size(): number {
    return this.handles.length;
  }

  clear(): void {
    for (const h of this.handles) this.kit.release(h);
    this.handles = [];
  }

  dispose(): void {
    this.clear();
    this.key = null;
  }
}
