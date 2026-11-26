import * as THREE from 'three';
import type { Runner, WorldState } from '@dash-iso/shared';
import { Kit, type Part, type PartHandle } from './instancing.js';
import {
  DEFAULT_LAYOUT,
  SlotAllocator,
  gridExtent,
  rectContains,
  slotRect,
  viewAngle,
  type GridExtent,
  type LayoutConfig,
} from './layout.js';
import { COLORS } from './palette.js';
import * as P from './props.js';
import { PM_OFFICE, PmCharacter, PmOffice, inOffice } from './pm.js';
import { Room } from './room.js';
import { grassTexture } from './textures.js';

/**
 * Scene side of the office. Feed it domain snapshots with `update()`; it adds,
 * removes and restyles rooms to match. It holds no domain state of its own
 * beyond the last snapshot (for lookups).
 */
export class World {
  readonly root = new THREE.Group();
  private readonly kit: Kit;
  private readonly rooms = new Map<string, Room>();
  private readonly slots = new SlotAllocator();
  private corridor: PartHandle[] = [];
  private corridorKey = '';
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private readonly selection: THREE.Group;
  private readonly selectionMat: THREE.MeshLambertMaterial;
  private selectedId: string | null = null;
  private step = 0;
  private _extent: GridExtent;
  private state: WorldState | null = null;
  private readonly office: PmOffice;
  readonly pm: PmCharacter;
  private lastT: number | null = null;
  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly cfg: LayoutConfig = DEFAULT_LAYOUT,
    rng: () => number = Math.random,
  ) {
    this.root.name = 'world';
    this.kit = new Kit(this.root);
    this._extent = gridExtent(0, cfg);

    const grass = grassTexture();
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff, map: grass }),
    );
    this.ground.name = 'ground';
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.12;
    this.root.add(this.ground);

    this.selectionMat = new THREE.MeshLambertMaterial({ color: COLORS.selection });
    this.selection = this.buildSelectionFrame();
    this.root.add(this.selection);

    this.rebuildCorridors();

    this.office = new PmOffice(this.kit, this.root, this.step);
    this.pm = new PmCharacter(rng);
    this.root.add(this.pm.group);
  }

  get extent(): GridExtent {
    return this._extent;
  }

  /** Ground rectangle covering the rooms and the PM's office (for camera bounds). */
  get bounds(): { minX: number; minZ: number; maxX: number; maxZ: number } {
    return { minX: 0, minZ: PM_OFFICE.z0 - 1, maxX: this._extent.width, maxZ: this._extent.depth };
  }

  /** Centre of the floor in world coordinates. */
  get center(): THREE.Vector3 {
    return new THREE.Vector3(this._extent.width / 2, 0, this._extent.depth / 2);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  get selected(): string | null {
    return this.selectedId;
  }

  hasRoom(id: string): boolean {
    return this.rooms.has(id);
  }

  room(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  runner(id: string): Runner | undefined {
    return this.state?.runners.find((r) => r.id === id);
  }

  /** Reconcile the scene with a snapshot: add, update and remove rooms. */
  update(state: WorldState): void {
    this.state = state;
    const ids = state.runners.map((r) => r.id);
    const assigned = this.slots.assign(ids);

    for (const [id, room] of this.rooms) {
      if (!assigned.has(id)) {
        room.dispose();
        this.rooms.delete(id);
        if (this.selectedId === id) this.select(null);
      }
    }
    for (const runner of state.runners) {
      const existing = this.rooms.get(runner.id);
      if (existing) {
        existing.update(runner);
      } else {
        const rect = slotRect(assigned.get(runner.id)!, this.cfg);
        this.rooms.set(
          runner.id,
          new Room(this.kit, this.root, runner.id, runner, rect, this.step),
        );
      }
    }
    this.rebuildCorridors();
    this.pm.rooms = [...this.rooms.values()].map((r) => r.rect);
  }

  /** Rotation step (0..3, any integer accepted) the camera is viewing from. */
  setViewRotation(step: number): void {
    this.step = ((step % 4) + 4) % 4;
    for (const room of this.rooms.values()) room.setViewRotation(this.step);
    this.office.setViewRotation(this.step);
    this.pm.setViewAngle(viewAngle(this.step));
  }

  /** Runner id of the room containing world point (x, z), if any. */
  roomAt(x: number, z: number): string | null {
    for (const [id, room] of this.rooms) if (rectContains(room.rect, x, z)) return id;
    return null;
  }

  /** True if world point (x, z) is inside the project manager's office. */
  pmOfficeAt(x: number, z: number): boolean {
    return inOffice(x, z);
  }

  /** True if the pointer (NDC) is over the project manager character. */
  pickPm(ndc: THREE.Vector2, camera: THREE.Camera): boolean {
    this.raycaster.setFromCamera(ndc, camera);
    return this.raycaster.intersectObject(this.pm.group, true).length > 0;
  }

  select(id: string | null): void {
    this.selectedId = id && this.rooms.has(id) ? id : null;
    const room = this.selectedId ? this.rooms.get(this.selectedId) : undefined;
    this.selection.visible = !!room;
    if (room) this.selection.position.set(room.rect.x0, 0, room.rect.z0);
  }

  /** Per-frame animation (selection pulse, PM). `t` in seconds. */
  tick(t: number): void {
    const dt = this.lastT === null ? 0 : Math.min(t - this.lastT, 0.1);
    this.lastT = t;
    this.pm.tick(dt);
    if (this.selection.visible) {
      this.selectionMat.emissive
        .setHex(COLORS.selection)
        .multiplyScalar(0.3 + 0.3 * Math.sin(t * 5));
    }
  }

  private buildSelectionFrame(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'selection';
    const { roomW: w, roomD: d } = this.cfg;
    const t = 0.3;
    const geo = new THREE.BoxGeometry(1, 0.2, 1);
    const bar = (x: number, z: number, sx: number, sz: number) => {
      const m = new THREE.Mesh(geo, this.selectionMat);
      m.position.set(x, 0.1, z);
      m.scale.set(sx, 1, sz);
      g.add(m);
    };
    bar(w / 2, -t / 2, w + 2 * t, t);
    bar(w / 2, d + t / 2, w + 2 * t, t);
    bar(-t / 2, d / 2, t, d);
    bar(w + t / 2, d / 2, t, d);
    g.visible = false;
    return g;
  }

  /**
   * Corridor floor, kerb and corridor props. Depends only on which slots are
   * occupied, so it is rebuilt only when that changes.
   */
  private rebuildCorridors(): void {
    const occupied = [...this.rooms.values()].map((r) => r.rect.slot).sort((a, b) => a - b);
    const ext = gridExtent(this.slots.span, this.cfg);
    const key = `${ext.rows}:${occupied.join(',')}`;
    if (key === this.corridorKey) return;
    this.corridorKey = key;
    this._extent = ext;

    for (const h of this.corridor) this.kit.release(h);
    const base = new THREE.Matrix4();
    this.corridor = corridorParts(ext, new Set(occupied), this.cfg).map((p) =>
      this.kit.place(p, base),
    );

    const margin = 60;
    this.ground.scale.set(ext.width + margin, ext.depth + margin, 1);
    this.ground.position.set(ext.width / 2, -0.12, ext.depth / 2);
    const map = this.ground.material.map;
    if (map) map.repeat.set((ext.width + margin) / 2, (ext.depth + margin) / 2);
  }

  dispose(): void {
    for (const r of this.rooms.values()) r.dispose();
    this.rooms.clear();
    this.pm.dispose();
    this.root.remove(this.pm.group);
    this.office.dispose();
    this.kit.dispose();
    this.ground.geometry.dispose();
    this.ground.material.map?.dispose();
    this.ground.material.dispose();
    this.selectionMat.dispose();
    (this.selection.children[0] as THREE.Mesh | undefined)?.geometry.dispose();
  }
}

/** Corridor tiles, kerb and props for the given extent (world coordinates). */
export function corridorParts(ext: GridExtent, occupied: Set<number>, cfg: LayoutConfig): Part[] {
  const parts: Part[] = [];
  const add = (p: Part[]) => parts.push(...p);
  const rects = occupied.size ? [...occupied].map((s) => slotRect(s, cfg)) : [];
  const inRoom = (x: number, z: number) => rects.some((r) => rectContains(r, x, z));

  for (let i = 0; i < ext.width; i++) {
    for (let j = 0; j < ext.depth; j++) {
      if (inRoom(i + 0.5, j + 0.5)) continue;
      parts.push({
        pool: 'tile',
        pos: [i + 0.5, -0.1, j + 0.5],
        size: [0.98, 0.1, 0.98],
        color: (i + j) % 2 ? COLORS.corridorA : COLORS.corridorB,
      });
    }
  }

  // Kerb around the building.
  const k = 0.25;
  const kc = 0xb8b2a2;
  // The north kerb is split around the project manager's office.
  const gx0 = PM_OFFICE.x0;
  const gx1 = PM_OFFICE.x0 + PM_OFFICE.w;
  for (const [a, b] of [
    [-k, gx0],
    [gx1, ext.width + k],
  ] as const) {
    parts.push({
      pool: 'box',
      pos: [(a + b) / 2, -0.12, -k / 2],
      size: [b - a, 0.2, k],
      color: kc,
    });
  }
  parts.push({
    pool: 'box',
    pos: [ext.width / 2, -0.12, ext.depth + k / 2],
    size: [ext.width + 2 * k, 0.2, k],
    color: kc,
  });
  parts.push({
    pool: 'box',
    pos: [-k / 2, -0.12, ext.depth / 2],
    size: [k, 0.2, ext.depth],
    color: kc,
  });
  parts.push({
    pool: 'box',
    pos: [ext.width + k / 2, -0.12, ext.depth / 2],
    size: [k, 0.2, ext.depth],
    color: kc,
  });

  // Outer corners of the building: alternate plants, coolers and vending machines.
  const pitchX = cfg.roomW + cfg.corridor;
  const pitchZ = cfg.roomD + cfg.corridor;
  let n = 0;
  for (let c = 0; c <= ext.cols; c++) {
    for (let r = 0; r <= ext.rows; r++) {
      const edgeX = c === 0 || c === ext.cols;
      const edgeZ = r === 0 || r === ext.rows;
      if (!edgeX && !edgeZ) continue;
      // Hug the outside edge of the perimeter corridor.
      const x = c * pitchX + (c === 0 ? 0.4 : c === ext.cols ? cfg.corridor - 0.4 : 1);
      const z = r * pitchZ + (r === 0 ? 0.4 : r === ext.rows ? cfg.corridor - 0.4 : 1);
      // Face inward.
      const rot = edgeZ ? (r === 0 ? 0 : Math.PI) : c === 0 ? Math.PI / 2 : -Math.PI / 2;
      const kind = n++ % 3;
      if (kind === 0 || (edgeX && edgeZ)) add(P.placed(P.plant(1.2), x, z));
      else if (kind === 1) add(P.placed(P.waterCooler(), x, z, rot));
      else add(P.placed(P.vendingMachine(), x, z, rot));
    }
  }

  // Against each room's back (north) wall, out in the corridor: a bench or an extinguisher.
  for (const rect of rects) {
    const z = rect.z0 - 0.28;
    if (rect.slot % 2 === 0) add(P.placed(P.bench(), rect.x0 + 5.6, z, Math.PI));
    else add(P.placed(P.fireExtinguisher(), rect.x0 + rect.w - 0.6, rect.z0 - 0.18));
  }

  // Vacant plots inside the grid become little garden courtyards.
  const lastSlot = ext.rows * ext.cols;
  for (let s = 0; s < lastSlot; s++) {
    if (occupied.has(s)) continue;
    const r = slotRect(s, cfg);
    const cx = r.x0 + r.w / 2;
    const cz = r.z0 + r.d / 2;
    add(P.placed(P.rug(r.w - 1, r.d - 1, 0x5bb043, 0x3c7a1e), cx, cz));
    add(P.placed(P.plant(2), cx, cz));
    add(P.placed(P.bench(), cx, cz + 1.6));
    add(P.placed(P.bench(), cx, cz - 1.6, Math.PI));
  }
  return parts;
}
