import * as THREE from 'three';
import type { Kit, Part, PartHandle } from './instancing.js';
import { floorParts, structureParts, WALL } from './room.js';
import { rectContains, type RoomRect } from './layout.js';
import { COLORS, type RoomTheme } from './palette.js';
import * as P from './props.js';
import { BUBBLE_ASPECT, PLAQUE_ASPECT, bubbleTexture, plaqueTexture } from './textures.js';

/** The project manager's corner office sits north of the room grid. */
export const PM_THEME: RoomTheme = {
  floorA: 0x3d5a9e,
  floorB: 0x324b86,
  accent: 0xc9a227,
  furniture: 0x8a1f2d,
};

export const PM_OFFICE: RoomRect = { slot: -1, col: 0, row: -1, x0: 2, z0: -7, w: 10, d: 7 };

/** Where the door opens onto the top corridor (world x, z). */
const DOOR_X = PM_OFFICE.x0 + (WALL.doorX0 + WALL.doorX1) / 2;
const CORRIDOR_Z = 1;

type Vec2 = readonly [number, number];

export function executiveDesk(): Part[] {
  const w = COLORS.woodDark;
  return [
    { pool: 'box', pos: [0, 0, 0], size: [3.2, 0.8, 1.3], color: w },
    { pool: 'box', pos: [0, 0.8, 0], size: [3.4, 0.08, 1.45], color: COLORS.wood },
    // Drawer pedestals and a leather blotter.
    { pool: 'box', pos: [-1.2, 0, 0.66], size: [0.8, 0.7, 0.04], color: COLORS.wood },
    { pool: 'box', pos: [1.2, 0, 0.66], size: [0.8, 0.7, 0.04], color: COLORS.wood },
    { pool: 'box', pos: [0, 0.88, 0.2], size: [1.2, 0.02, 0.6], color: 0x2b2b33 },
    // Monitor, nameplate, desk lamp, mug.
    { pool: 'box', pos: [-0.8, 0.88, -0.3], size: [0.8, 0.5, 0.06], color: COLORS.metalDark },
    {
      pool: 'box',
      pos: [-0.8, 0.95, -0.26],
      size: [0.7, 0.4, 0.02],
      color: COLORS.lampOn,
      lamp: true,
    },
    { pool: 'box', pos: [-0.8, 0.88, -0.28], size: [0.1, 0.1, 0.1], color: COLORS.metalDark },
    { pool: 'box', pos: [0.2, 0.88, 0.55], size: [0.6, 0.1, 0.14], color: 0xc9a227 },
    { pool: 'cyl', pos: [1.2, 0.88, -0.35], size: [0.18, 0.02, 0.18], color: COLORS.metalDark },
    { pool: 'cyl', pos: [1.2, 0.9, -0.35], size: [0.04, 0.35, 0.04], color: COLORS.metalDark },
    { pool: 'glow', pos: [1.2, 1.2, -0.3], size: [0.34, 0.2, 0.34], color: 0x4fb05a, lamp: true },
    { pool: 'cyl', pos: [1.0, 0.88, 0.3], size: [0.1, 0.12, 0.1], color: COLORS.red },
  ];
}

export function executiveChair(color: number): Part[] {
  return [
    { pool: 'cyl', pos: [0, 0, 0], size: [0.5, 0.08, 0.5], color: COLORS.metalDark },
    { pool: 'cyl', pos: [0, 0.08, 0], size: [0.08, 0.3, 0.08], color: COLORS.metal },
    { pool: 'box', pos: [0, 0.38, 0], size: [0.7, 0.14, 0.66], color },
    { pool: 'box', pos: [0, 0.5, -0.3], size: [0.7, 1.0, 0.14], color },
    { pool: 'box', pos: [-0.38, 0.52, 0], size: [0.08, 0.3, 0.5], color: COLORS.metalDark },
    { pool: 'box', pos: [0.38, 0.52, 0], size: [0.08, 0.3, 0.5], color: COLORS.metalDark },
  ];
}

export function whiteboard(): Part[] {
  return [
    { pool: 'box', pos: [0, 0.6, 0], size: [2.1, 1.2, 0.06], color: COLORS.metal },
    { pool: 'box', pos: [0, 0.66, 0.03], size: [1.96, 1.06, 0.03], color: COLORS.white },
    // Scribbled gantt bars and sticky notes.
    { pool: 'box', pos: [-0.5, 1.4, 0.06], size: [0.8, 0.1, 0.02], color: COLORS.blue },
    { pool: 'box', pos: [0.1, 1.2, 0.06], size: [0.9, 0.1, 0.02], color: COLORS.red },
    { pool: 'box', pos: [-0.2, 1.0, 0.06], size: [0.7, 0.1, 0.02], color: 0x3fbf6a },
    { pool: 'box', pos: [0.6, 0.8, 0.06], size: [0.22, 0.22, 0.02], color: 0xffd23f },
    { pool: 'box', pos: [0.3, 0.8, 0.06], size: [0.22, 0.22, 0.02], color: 0xff8fb1 },
  ];
}

/** Furniture for the PM office (local coordinates, +z is toward the door). */
export function pmOfficeProps(w: number, d: number): Part[] {
  const T = WALL.thickness;
  const parts: Part[] = [];
  const add = (p: Part[]) => parts.push(...p);
  add(P.placed(P.rug(4.6, 3.2, 0x7d1f2b, PM_THEME.accent), 6.8, 3.2));
  add(P.placed(executiveDesk(), 6.8, 2.4));
  add(P.placed(executiveChair(PM_THEME.furniture), 6.8, 1.45));
  for (let i = 0; i < 3; i++) add(P.placed(P.bookshelf(i * 2), 2.3 + i * 1.35, T + 0.21));
  add(P.placed(P.filingCabinet(), w - T - 0.4, T + 0.35));
  add(P.placed(whiteboard(), w - T - 0.06, 4.1, -Math.PI / 2));
  add(P.placed(P.sofa(PM_THEME.furniture), T + 0.45, 4.6, Math.PI / 2));
  add(P.placed(P.floorLamp(), T + 0.35, 2.7));
  add(P.placed(P.plant(1.3), T + 0.5, T + 0.5));
  add(P.placed(P.plant(1.1), w - T - 0.5, d - T - 0.5));
  add(P.placed(P.waterCooler(), w - T - 0.3, 2.3, -Math.PI / 2));
  add(P.placed(P.bin(), 5.0, 1.6));
  add(
    P.placed(
      P.rug(1.2, 0.7, COLORS.woodDark, COLORS.wood),
      (WALL.doorX0 + WALL.doorX1) / 2,
      d + 0.45,
    ),
  );
  return parts;
}

/** Spots inside the office the PM wanders between (world coordinates). */
export function officeSpots(): Vec2[] {
  const { x0, z0 } = PM_OFFICE;
  return [
    [x0 + 3.9, z0 + 2.1],
    [x0 + 6.8, z0 + 5.0],
    [x0 + 8.4, z0 + 3.4],
    [x0 + 8.4, z0 + 5.4],
    [x0 + 3.0, z0 + 5.8],
  ];
}

/** Waypoints from just inside the office door out to the corridor. */
export function officeExit(): Vec2[] {
  return [
    [DOOR_X, PM_OFFICE.z0 + PM_OFFICE.d - 0.9],
    [DOOR_X, CORRIDOR_Z],
  ];
}

/**
 * Corridor route from the office door to just outside a room's door (the
 * point faces north into the doorway). Rooms sit on a grid with corridors on
 * every side, so a Manhattan route along the corridors never crosses a room.
 */
export function routeToRoom(rect: RoomRect): Vec2[] {
  const doorZ = rect.z0 + rect.d + 0.9;
  const lane = rect.x0 - 1;
  const pts: Vec2[] = [
    [DOOR_X, CORRIDOR_Z],
    [lane, CORRIDOR_Z],
    [lane, doorZ],
    [rect.x0 + (WALL.doorX0 + WALL.doorX1) / 2, doorZ],
  ];
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1]![0] || p[1] !== pts[i - 1]![1]);
}

/** Office interior + door area, for click picking. */
export function inOffice(x: number, z: number): boolean {
  return rectContains(PM_OFFICE, x, z);
}

export type PmMode = 'idle' | 'walking' | 'thinking';

const SPEED = 1.7;
const BODY = {
  suit: 0x23305c,
  trousers: 0x1b2340,
  skin: 0xf2c49b,
  hair: 0x5a3317,
  tie: 0xd22b2b,
  shirt: 0xf6f6f2,
  gold: 0xf2b632,
  clip: 0xb5763a,
  paper: 0xffffff,
} as const;

/**
 * The project manager: a little suited figure (red tie, gold badge, clipboard)
 * who potters around the office and now and then visits a room. While a chat
 * reply is pending they stop, face the camera and show a "thinking" bubble.
 */
export class PmCharacter {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly bubble: THREE.Sprite;
  private readonly owned: { dispose(): void }[] = [];
  private bubbleText = '';
  private bubbleUntil = Infinity;
  private heading = 0;
  private path: Vec2[] = [];
  private dwell = 2;
  private away: { back: Vec2[] } | null = null;
  private walkPhase = 0;
  private thinking = false;
  private viewAngle = Math.PI / 4;
  private clock = 0;
  /** Room rects the PM may visit; set by the world. */
  rooms: readonly RoomRect[] = [];

  constructor(private readonly rng: () => number = Math.random) {
    this.group.name = 'pm';
    const mat = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.owned.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number, c: number, y: number, parent: THREE.Object3D) => {
      const g = new THREE.BoxGeometry(w, h, d);
      this.owned.push(g);
      const m = new THREE.Mesh(g, mat(c));
      m.position.y = y;
      parent.add(m);
      return m;
    };

    this.group.add(this.body);
    // Legs pivot at the hip (y = 0.5).
    for (const [leg, x] of [
      [this.legL, -0.11],
      [this.legR, 0.11],
    ] as const) {
      leg.position.set(x, 0.5, 0);
      box(0.17, 0.5, 0.19, BODY.trousers, -0.25, leg);
      box(0.19, 0.08, 0.26, 0x14141c, -0.46, leg).position.z = 0.03;
      this.body.add(leg);
    }
    const torso = box(0.5, 0.55, 0.3, BODY.suit, 0.78, this.body);
    box(0.16, 0.5, 0.02, BODY.shirt, 0.78, this.body).position.z = 0.16;
    box(0.07, 0.4, 0.03, BODY.tie, 0.76, this.body).position.z = 0.17;
    const badge = box(0.09, 0.09, 0.03, BODY.gold, 0.9, this.body);
    badge.position.x = 0.15;
    badge.position.z = 0.16;
    torso.name = 'pm-torso';
    // Arms pivot at the shoulder (y = 1.02).
    for (const [arm, x] of [
      [this.armL, -0.32],
      [this.armR, 0.32],
    ] as const) {
      arm.position.set(x, 1.02, 0);
      box(0.13, 0.5, 0.15, BODY.suit, -0.25, arm);
      box(0.12, 0.12, 0.13, BODY.skin, -0.54, arm);
      this.body.add(arm);
    }
    // Clipboard held in the right hand, out in front.
    const clip = new THREE.Group();
    box(0.3, 0.38, 0.03, BODY.clip, 0, clip);
    box(0.25, 0.32, 0.035, BODY.paper, 0.01, clip);
    box(0.1, 0.05, 0.05, COLORS.metal, 0.37, clip);
    clip.position.set(0.02, -0.48, 0.14);
    clip.rotation.x = -0.35;
    this.armR.add(clip);
    this.armR.rotation.x = -0.5;

    const head = new THREE.Group();
    head.position.y = 1.06;
    box(0.34, 0.34, 0.32, BODY.skin, 0, head);
    box(0.36, 0.12, 0.34, BODY.hair, 0.28, head);
    box(0.06, 0.06, 0.02, 0x222222, 0.17, head).position.set(-0.08, 0.17, 0.165);
    box(0.06, 0.06, 0.02, 0x222222, 0.17, head).position.set(0.08, 0.17, 0.165);
    this.body.add(head);

    this.bubble = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: bubbleTexture(' '), transparent: true, depthTest: false }),
    );
    this.bubble.name = 'pm-bubble';
    this.bubble.renderOrder = 5;
    const bw = 2.0;
    this.bubble.scale.set(bw, bw / BUBBLE_ASPECT, 1);
    this.bubble.position.y = 2.15;
    this.bubble.visible = false;
    this.group.add(this.bubble);
    this.group.scale.setScalar(1.15);
    this.place(officeSpots()[2]!);
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  get mode(): PmMode {
    if (this.thinking) return 'thinking';
    return this.path.length ? 'walking' : 'idle';
  }

  /** True while on a trip to a room (not in the office). */
  get visiting(): boolean {
    return this.away !== null;
  }

  get bubbleLabel(): string {
    return this.bubble.visible ? this.bubbleText : '';
  }

  /** Put the PM at (x, z). */
  place(p: Vec2): void {
    this.group.position.set(p[0], 0, p[1]);
  }

  /** Camera direction, so a thinking PM can face the viewer. */
  setViewAngle(angle: number): void {
    this.viewAngle = angle;
  }

  /** Reply pending: stop and think out loud. */
  setThinking(on: boolean): void {
    if (on === this.thinking) return;
    this.thinking = on;
    if (on) {
      this.say('Thinking…', Infinity);
    } else {
      this.say('Here you go!', 2.5);
      this.dwell = Math.max(this.dwell, 2.5);
    }
  }

  /** Show a speech bubble for `seconds`. */
  say(text: string, seconds = 3): void {
    this.bubbleUntil = this.clock + seconds;
    this.setBubbleText(text);
    this.bubble.visible = true;
  }

  private setBubbleText(text: string): void {
    if (text === this.bubbleText) return;
    this.bubbleText = text;
    const mat = this.bubble.material;
    mat.map?.dispose();
    mat.map = bubbleTexture(text);
    mat.needsUpdate = true;
  }

  /** Start a trip to the given room, returning to the office afterwards. */
  visit(rect: RoomRect): void {
    const out = routeToRoom(rect);
    this.path = [...officeExit(), ...out];
    this.away = { back: [...out].reverse().concat([...officeExit()].reverse()) };
    this.dwell = 0;
  }

  private nextAction(): void {
    if (this.away) {
      // Finished peeking into the room: head home.
      this.path = [...this.away.back, this.pick(officeSpots())];
      this.away = null;
      return;
    }
    const wantsVisit = this.rooms.length > 0 && this.rng() < 0.35;
    if (wantsVisit) {
      this.visit(this.pick(this.rooms));
      return;
    }
    const spot = this.pick(officeSpots());
    const here = this.group.position;
    this.path = Math.hypot(spot[0] - here.x, spot[1] - here.z) < 0.5 ? [] : [spot];
    this.dwell = 3 + this.rng() * 4;
  }

  private pick<T>(list: readonly T[]): T {
    return list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))]!;
  }

  /** Advance simulation and animation by `dt` seconds. */
  tick(dt: number): void {
    this.clock += dt;
    if (this.bubble.visible && this.clock > this.bubbleUntil) this.bubble.visible = false;

    if (this.thinking) {
      this.face(Math.sin(this.viewAngle), Math.cos(this.viewAngle), dt);
      this.limbs(0, dt);
      // Pondering: sway, chin-scratch arm.
      this.body.position.y = Math.abs(Math.sin(this.clock * 3)) * 0.05;
      this.armL.rotation.x = -2.0 + Math.sin(this.clock * 6) * 0.15;
      this.bubble.position.y = 2.15 + Math.sin(this.clock * 3) * 0.04;
      const dots = '.'.repeat(1 + (Math.floor(this.clock * 2.5) % 3));
      this.setBubbleText(`Thinking${dots}`);
      this.bubbleUntil = Infinity;
      return;
    }
    this.bubble.position.y = 2.15;

    const target = this.path[0];
    if (target) {
      const pos = this.group.position;
      const dx = target[0] - pos.x;
      const dz = target[1] - pos.z;
      const dist = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (dist <= step) {
        pos.set(target[0], 0, target[1]);
        this.path.shift();
        if (!this.path.length) this.arrived();
      } else {
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
        this.face(dx, dz, dt);
      }
      this.limbs(SPEED, dt);
      return;
    }
    this.limbs(0, dt);
    this.dwell -= dt;
    if (this.dwell <= 0) this.nextAction();
  }

  private arrived(): void {
    if (this.away) {
      // Standing at a room's door: look in, say hi.
      this.dwell = 4 + this.rng() * 2;
      this.heading = Math.PI; // north, into the doorway
      this.say('Checking in…', 3);
    } else {
      this.dwell = 3 + this.rng() * 4;
    }
  }

  private face(dx: number, dz: number, dt: number): void {
    const want = Math.atan2(dx, dz);
    const tau = Math.PI * 2;
    let diff = ((((want - this.heading + Math.PI) % tau) + tau) % tau) - Math.PI;
    diff = Math.max(-1, Math.min(1, diff * Math.min(1, dt * 10)));
    this.heading += diff;
    this.group.rotation.y = this.heading;
  }

  private limbs(speed: number, dt: number): void {
    if (speed > 0) this.walkPhase += dt * 9;
    const s = speed > 0 ? Math.sin(this.walkPhase) : 0;
    this.legL.rotation.x = s * 0.7;
    this.legR.rotation.x = -s * 0.7;
    this.armL.rotation.x = -s * 0.6;
    this.armR.rotation.x = -0.5 + s * 0.15;
    this.body.position.y = speed > 0 ? Math.abs(s) * 0.05 : 0;
    if (speed === 0 && !this.thinking) this.group.rotation.y = this.heading;
  }

  dispose(): void {
    const mat = this.bubble.material;
    mat.map?.dispose();
    mat.dispose();
    for (const o of this.owned) o.dispose();
  }
}

/** Static parts of the PM office: floor, props, walls, plaque. */
export class PmOffice {
  readonly rect = PM_OFFICE;
  private readonly base = new THREE.Matrix4().makeTranslation(PM_OFFICE.x0, 0, PM_OFFICE.z0);
  private statics: PartHandle[] = [];
  private structure: PartHandle[] = [];
  private readonly plaque: THREE.Sprite;

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    private step: number,
  ) {
    const { w, d } = PM_OFFICE;
    const parts = [...floorParts(w, d, PM_THEME.floorA, PM_THEME.floorB), ...pmOfficeProps(w, d)];
    this.statics = parts.map((p) => kit.place(p, this.base));
    this.buildStructure();

    this.plaque = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: plaqueTexture('Project Manager', true),
        transparent: true,
      }),
    );
    this.plaque.name = 'plaque-pm';
    const pw = 2.8;
    this.plaque.scale.set(pw, pw / PLAQUE_ASPECT, 1);
    this.plaque.position.set(DOOR_X, WALL.height + 0.55, PM_OFFICE.z0 + d);
    this.plaque.renderOrder = 2;
    parent.add(this.plaque);
  }

  private buildStructure(): void {
    for (const h of this.structure) this.kit.release(h);
    this.structure = structureParts(PM_OFFICE.w, PM_OFFICE.d, this.step, PM_THEME).map((p) =>
      this.kit.place(p, this.base),
    );
  }

  setViewRotation(step: number): void {
    if (step === this.step) return;
    this.step = step;
    this.buildStructure();
  }

  dispose(): void {
    for (const h of [...this.statics, ...this.structure]) this.kit.release(h);
    this.statics = [];
    this.structure = [];
    this.parent.remove(this.plaque);
    this.plaque.material.map?.dispose();
    this.plaque.material.dispose();
  }
}
