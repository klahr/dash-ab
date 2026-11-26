import * as THREE from 'three';
import type { Task, WorldState } from '@dash-iso/shared';
import { buildCharacter, lookFor, poseCharacter, type CharacterRig } from './character.js';
import { featureFromHit, hotspot, tagFeature, type FeatureTarget } from './features.js';
import type { Kit, Part, PartHandle } from './instancing.js';
import type { RoomRect } from './layout.js';
import { COLORS, type RoomTheme } from './palette.js';
import { matchesFilter, projectHex } from './projects.js';
import * as P from './props.js';
import { makeCanvas, roundRect, toTexture } from './textures.js';
import { LOBBY, WingBuilding, exitRoute, routeFromWing, type Vec2 } from './wing.js';

/**
 * Reception / waiting room. Every queued task is a visitor sitting on a bench
 * (one per task, up to `SEATS`; an LED sign shows the full count). When Dash
 * picks a task up, its visitor gets up and walks along the corridors to the
 * runner's room; when a queued task disappears any other way, the visitor
 * walks out. Visitors wear their project's colour.
 */

export const LOBBY_THEME: RoomTheme = {
  floorA: 0xeadbb0,
  floorB: 0xd6c08a,
  accent: 0x2b4a8b,
  furniture: 0x2f7fe0,
};

/** Bench centres (lobby-local); each bench seats two. */
const BENCHES: Vec2[] = [];
for (const z of [3.4, 5.15]) for (const x of [6.2, 8.2, 10.2, 12.2]) BENCHES.push([x, z]);

/** Seat spots (lobby-local), filled front row first, left to right. */
export const SEAT_SPOTS: Vec2[] = BENCHES.flatMap(([x, z]) => [
  [x - 0.35, z + 0.04] as Vec2,
  [x + 0.35, z + 0.04] as Vec2,
]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);

export const SEATS = SEAT_SPOTS.length;

/** Where the noticeboard and the project banners stand (lobby-local). */
export const NOTICEBOARD_SPOT: Vec2 = [9.2, 0.75];
export const BANNER_SPOT: Vec2 = [0.9, 0.75];
export const MAX_BANNERS = 4;

const INSIDE_DOOR: Vec2 = [2.0, LOBBY.d - 0.9];
const AISLE_X = 4.75;
const WALK_SPEED = 1.5;

export interface SeatPlan {
  /** Task id → seat index for every visitor that should be seated or walking to a seat. */
  seats: Map<string, number>;
  /** Visitors to create, walking in to their seat. */
  arrive: [taskId: string, seat: number][];
  /** Visitors whose task is no longer queued. */
  leave: string[];
}

/**
 * Pure seating: visitors keep their seat while their task stays queued, leave
 * when it isn't, and queued tasks without a visitor take the lowest free seats
 * in queue order until the benches are full.
 */
export function planSeats(
  current: ReadonlyMap<string, number>,
  queued: readonly string[],
  seats: number = SEATS,
): SeatPlan {
  const want = new Set(queued);
  const plan: SeatPlan = { seats: new Map(), arrive: [], leave: [] };
  for (const [id, seat] of current) {
    if (want.has(id) && seat < seats) plan.seats.set(id, seat);
    else plan.leave.push(id);
  }
  const used = new Set(plan.seats.values());
  let next = 0;
  for (const id of queued) {
    if (plan.seats.has(id)) continue;
    while (used.has(next)) next++;
    if (next >= seats) break;
    plan.seats.set(id, next);
    plan.arrive.push([id, next]);
    used.add(next);
  }
  return plan;
}

/** Queued tasks in queue order (as Dash lists them). */
export function queuedTasks(state: WorldState): Task[] {
  return state.tasks.filter((t) => t.status === 'queued');
}

/** The runner whose slot now holds `taskId`, if any. */
export function runnerOf(state: WorldState, taskId: string): string | undefined {
  return state.runners.find((r) => r.slots.some((s) => s.task?.id === taskId))?.id;
}

type VisitorMode = 'walking' | 'seated' | 'gone';

/** A waiting task, as a person on a bench. Positions are world coordinates. */
export class Visitor {
  readonly rig: CharacterRig;
  private path: Vec2[] = [];
  private sitOnArrival = false;
  private walkPhase = 0;
  private t = Math.random() * 10;
  private heading = 0;
  mode: VisitorMode = 'walking';
  leaving = false;

  constructor(
    readonly task: Task,
    start: Vec2,
  ) {
    const look = { ...lookFor(`visitor:${task.id}`), shirt: projectHex(task.project) };
    this.rig = buildCharacter(look);
    this.rig.root.name = `visitor-${task.id}`;
    tagFeature(this.rig.root, { kind: 'queue', taskId: task.id });
    this.rig.root.position.set(start[0], 0, start[1]);
  }

  get root(): THREE.Group {
    return this.rig.root;
  }

  get position(): Vec2 {
    return [this.root.position.x, this.root.position.z];
  }

  /** Walk along `path`; sit down at the end, or vanish there. */
  go(path: Vec2[], sit: boolean): void {
    this.path = path.slice();
    this.sitOnArrival = sit;
    this.mode = this.path.length ? 'walking' : sit ? 'seated' : 'gone';
    this.root.position.y = 0;
  }

  /** Sit at `seat` immediately (first snapshot). */
  seatAt(seat: Vec2): void {
    this.root.position.set(seat[0], 0, seat[1]);
    this.path = [];
    this.mode = 'seated';
  }

  update(dt: number): void {
    this.t += dt;
    const root = this.root;
    if (this.mode === 'walking') {
      let step = WALK_SPEED * dt;
      while (step > 0 && this.path.length) {
        const [tx, tz] = this.path[0]!;
        const dx = tx - root.position.x;
        const dz = tz - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-4) this.heading = Math.atan2(dx, dz);
        if (dist <= step) {
          root.position.x = tx;
          root.position.z = tz;
          step -= dist;
          this.path.shift();
        } else {
          root.position.x += (dx / dist) * step;
          root.position.z += (dz / dist) * step;
          step = 0;
        }
      }
      if (!this.path.length) this.mode = this.sitOnArrival ? 'seated' : 'gone';
    }
    if (this.mode === 'seated') {
      // Face the room (+z) and sit on the bench, fidgeting now and then.
      this.heading = 0;
      root.position.y = 0.06;
      poseCharacter(this.rig, { kind: 'sit', amount: 1, typing: false, t: this.t });
      this.rig.head.rotation.y = Math.sin(this.t * 0.7 + this.task.id.length) * 0.4;
    } else if (this.mode === 'walking') {
      this.walkPhase += dt * 9;
      poseCharacter(this.rig, { kind: 'walk', phase: this.walkPhase });
    }
    root.rotation.y = this.heading;
    root.visible = this.mode !== 'gone' && root.visible;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
  }
}

const local = (p: Vec2): Vec2 => [LOBBY.x0 + p[0], LOBBY.z0 + p[1]];

/** Lobby-local path from the door to the front of a seat, then onto it. */
function pathToSeat(seat: number): Vec2[] {
  const [x, z] = SEAT_SPOTS[seat]!;
  const front = z + 0.62;
  const pts: Vec2[] = [INSIDE_DOOR, [AISLE_X, front], [x, front], [x, z]];
  return pts.map(local);
}

/** From a visitor's position back out to the inside of the lobby door. */
function pathToDoor(from: Vec2, seated: boolean): Vec2[] {
  const lx = from[0] - LOBBY.x0;
  const lz = from[1] - LOBBY.z0;
  const pts: Vec2[] = [];
  if (seated) pts.push([lx, lz + 0.62], [AISLE_X, lz + 0.62]);
  pts.push(INSIDE_DOOR);
  return pts.map(local);
}

/** Reception desk with a bell, a monitor and a ticket dispenser. */
function receptionDesk(): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [2.4, 0.95, 0.7], color: COLORS.wood },
    { pool: 'box', pos: [0, 0.95, 0], size: [2.55, 0.08, 0.85], color: COLORS.white },
    { pool: 'box', pos: [0, 0.15, 0.36], size: [2.2, 0.6, 0.03], color: LOBBY_THEME.accent },
    { pool: 'box', pos: [0, 0.3, 0.38], size: [1.6, 0.08, 0.03], color: 0xf2b632 },
    { pool: 'cyl', pos: [0.7, 1.03, 0.15], size: [0.18, 0.08, 0.18], color: 0xf2b632 },
    { pool: 'box', pos: [-0.6, 1.03, -0.15], size: [0.6, 0.4, 0.06], color: COLORS.metalDark },
    {
      pool: 'box',
      pos: [-0.6, 1.08, -0.115],
      size: [0.52, 0.3, 0.02],
      color: 0x7fe0ff,
      lamp: true,
    },
  ];
}

function ticketMachine(): Part[] {
  return [
    { pool: 'cyl', pos: [0, 0, 0], size: [0.3, 0.05, 0.3], color: COLORS.metalDark },
    { pool: 'cyl', pos: [0, 0.05, 0], size: [0.06, 0.9, 0.06], color: COLORS.metal },
    { pool: 'box', pos: [0, 0.95, 0], size: [0.32, 0.36, 0.24], color: COLORS.red },
    { pool: 'box', pos: [0, 1.0, 0.125], size: [0.16, 0.04, 0.02], color: COLORS.white },
  ];
}

function lobbyProps(): Part[] {
  const T = 0.22;
  const parts: Part[] = [];
  const add = (p: Part[]) => parts.push(...p);
  add(P.placed(P.rug(7.6, 3.8, 0xc9e3f2, LOBBY_THEME.accent), 9.2, 4.3));
  for (const [x, z] of BENCHES) add(P.placed(P.bench(), x, z));
  add(P.placed(receptionDesk(), 2.5, 3.3));
  add(P.placed(ticketMachine(), 3.3, 5.6));
  add(P.placed(P.plant(1.2), LOBBY.w - T - 0.5, T + 0.5));
  add(P.placed(P.plant(1.0), LOBBY.w - T - 0.5, LOBBY.d - T - 0.5));
  add(P.placed(P.plant(0.9), T + 0.5, LOBBY.d - T - 0.5));
  add(P.placed(P.waterCooler(), LOBBY.w - T - 0.3, 2.3, -Math.PI / 2));
  add(P.placed(P.vendingMachine(), 5.3, T + 0.35));
  add(P.placed(P.rug(1.2, 0.7, COLORS.woodDark, COLORS.wood), 2.0, LOBBY.d + 0.45));
  return parts;
}

/** LED "now waiting" sign: a big count and a caption. */
export function queueSignTexture(count: number, seats: number): THREE.Texture {
  const w = 256;
  const h = 96;
  const c = makeCanvas(w, h);
  if (c) {
    const { ctx } = c;
    ctx.beginPath();
    roundRect(ctx, 0, 0, w, h, 12);
    ctx.fillStyle = '#2b4a8b';
    ctx.fill();
    ctx.beginPath();
    roundRect(ctx, 7, 7, w - 14, h - 14, 8);
    ctx.fillStyle = '#111418';
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px "Courier New", monospace';
    ctx.fillStyle = count ? '#ffb000' : '#5a6878';
    ctx.textAlign = 'left';
    ctx.fillText(String(Math.min(count, 999)).padStart(2, '0'), 18, h / 2 + 2);
    ctx.font = 'bold 18px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillStyle = '#ffe58a';
    ctx.fillText('WAITING', 118, h / 2 - 14);
    ctx.fillStyle = count > seats ? '#ff8c2a' : '#9fb9cc';
    ctx.fillText(count > seats ? `+${count - seats} STANDING` : 'IN QUEUE', 118, h / 2 + 14);
  }
  return toTexture(c);
}

export interface ReceptionSync {
  state: WorldState;
  filter: string | null;
  /** Room rect for a runner id, so visitors can find their way. */
  roomOf: (runnerId: string) => RoomRect | undefined;
  /** First snapshot: seat visitors without the walk in. */
  initial?: boolean;
}

/** The waiting room: building, benches, LED sign and visitors. */
export class Reception {
  readonly building: WingBuilding;
  /** Visitors live in world coordinates (they walk out to the rooms). */
  readonly group = new THREE.Group();
  private readonly statics: PartHandle[];
  private readonly seated = new Map<string, { visitor: Visitor; seat: number }>();
  private departing: Visitor[] = [];
  private readonly sign: THREE.Sprite;
  private signKey = '';
  private readonly floorSpot: THREE.Mesh;
  private filter: string | null = null;
  private count = 0;

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    step: number,
  ) {
    this.building = new WingBuilding(kit, parent, LOBBY, LOBBY_THEME, 'Reception', step);
    this.statics = lobbyProps().map((p) => kit.place(p, this.building.matrix));
    this.group.name = 'reception';
    parent.add(this.group);

    this.sign = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true }));
    this.sign.name = 'queue-sign';
    this.sign.scale.set(1.9, (1.9 * 96) / 256, 1);
    this.sign.position.set(LOBBY.x0 + 2.5, 2.0, LOBBY.z0 + 3.3);
    this.sign.renderOrder = 2;
    tagFeature(this.sign, { kind: 'queue' });
    this.group.add(this.sign);
    this.setSign(0);

    // The whole bench area opens the queue overlay too.
    this.floorSpot = hotspot([8.2, 1.0, 3.4], [LOBBY.x0 + 9.2, 0, LOBBY.z0 + 4.3], {
      kind: 'queue',
    });
    this.group.add(this.floorSpot);
  }

  /** Queued tasks right now (all projects). */
  get queued(): number {
    return this.count;
  }

  /** Visitors in the scene (seated, walking in, or on their way out). */
  get visitors(): Visitor[] {
    return [...[...this.seated.values()].map((s) => s.visitor), ...this.departing];
  }

  visitorFor(taskId: string): Visitor | undefined {
    return this.seated.get(taskId)?.visitor ?? this.departing.find((v) => v.task.id === taskId);
  }

  private setSign(count: number): void {
    const key = `${count}`;
    if (key === this.signKey) return;
    this.signKey = key;
    const mat = this.sign.material;
    mat.map?.dispose();
    mat.map = queueSignTexture(count, SEATS);
    mat.needsUpdate = true;
  }

  sync({ state, filter, roomOf, initial = false }: ReceptionSync): void {
    this.filter = filter;
    const queued = queuedTasks(state);
    this.count = queued.length;
    const visible = filter === null ? queued : queued.filter((t) => t.project === filter);
    this.setSign(visible.length);

    const current = new Map([...this.seated].map(([id, s]) => [id, s.seat]));
    const plan = planSeats(
      current,
      queued.map((t) => t.id),
    );
    for (const id of plan.leave) {
      const s = this.seated.get(id)!;
      this.seated.delete(id);
      const v = s.visitor;
      const runner = runnerOf(state, id);
      const room = runner ? roomOf(runner) : undefined;
      const toDoor = pathToDoor(v.position, v.mode === 'seated');
      const outside = room ? routeFromWing(LOBBY, room) : exitRoute(LOBBY);
      v.go([...toDoor, ...outside], false);
      v.leaving = true;
      this.departing.push(v);
    }
    const byId = new Map(queued.map((t) => [t.id, t]));
    for (const [id, seat] of plan.arrive) {
      const v = new Visitor(byId.get(id)!, local(INSIDE_DOOR));
      if (initial) v.seatAt(local(SEAT_SPOTS[seat]!));
      else {
        v.root.position.set(...doorStep());
        v.go([local(INSIDE_DOOR), ...pathToSeat(seat)], true);
      }
      this.group.add(v.root);
      this.seated.set(id, { visitor: v, seat });
    }
    this.applyFilter();
  }

  private applyFilter(): void {
    for (const v of this.visitors)
      v.root.visible = v.mode !== 'gone' && matchesFilter(v.task.project, this.filter);
  }

  tick(dt: number): void {
    for (const { visitor } of this.seated.values()) visitor.update(dt);
    for (let i = this.departing.length - 1; i >= 0; i--) {
      const v = this.departing[i]!;
      v.update(dt);
      if (v.mode === 'gone') {
        v.dispose();
        this.departing.splice(i, 1);
      }
    }
    this.applyFilter();
  }

  /** Clickable objects (visitors, sign, benches). */
  get pickables(): THREE.Object3D[] {
    return [this.sign, ...this.visitors.filter((v) => v.root.visible).map((v) => v.root)];
  }

  /** Benches hotspot, tested after everything else. */
  get fallbackPickables(): THREE.Object3D[] {
    return [this.floorSpot];
  }

  pick(ray: THREE.Raycaster): FeatureTarget | null {
    for (const hit of ray.intersectObjects(this.pickables, true)) {
      const f = featureFromHit(hit);
      if (f) return f;
    }
    return null;
  }

  setViewRotation(step: number): void {
    this.building.setViewRotation(step);
  }

  dispose(): void {
    for (const h of this.statics) this.kit.release(h);
    for (const v of this.visitors) v.dispose();
    this.seated.clear();
    this.departing = [];
    this.building.dispose();
    this.sign.material.map?.dispose();
    this.sign.material.dispose();
    this.parent.remove(this.group);
  }
}

/** Just outside the lobby door, where new visitors appear. */
function doorStep(): [number, number, number] {
  const [x] = local(INSIDE_DOOR);
  return [x, 0, LOBBY.z0 + LOBBY.d + 0.6];
}
