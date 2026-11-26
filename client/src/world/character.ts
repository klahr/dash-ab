import * as THREE from 'three';
import { seededRandom } from './layout.js';

/**
 * Chunky low-poly people built from boxes. Everything is procedural and
 * deterministic per seed: colours, build, hair style and a first name. The
 * returned rig has pivots for limbs so poses can be driven with simple tweens
 * (see `poseCharacter`).
 */

export type HairStyle = 'bald' | 'short' | 'spiky' | 'afro' | 'bun' | 'long' | 'mohawk';

export interface Look {
  name: string;
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  shirt: number;
  trousers: number;
  shoes: number;
  glasses: boolean;
  tie: number | null;
  /** Torso width multiplier (0.9..1.25). */
  build: number;
  /** Overall height multiplier (0.92..1.08). */
  height: number;
}

const SKINS = [0xffdbb5, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e];
const HAIRS = [0x2b1d14, 0x2b1d14, 0x6b3e1f, 0xe8c35a, 0xc4561d, 0xb8b8b8, 0x3a7bd5, 0xff6fa8];
const SHIRTS = [
  0xe23b3b, 0x2f7fe0, 0x3fbf6a, 0xffd23f, 0x8a4fd8, 0xff8c2a, 0x46c2b4, 0xf05a9a, 0xffffff,
  0x7cc8ff,
];
const TROUSERS = [0x23325e, 0x3a3a44, 0xb9a27a, 0x3d6ea8, 0x4b3621];
const SHOES = [0x222222, 0x6b3e1f, 0xeeeeee];
const STYLES: HairStyle[] = ['bald', 'short', 'short', 'spiky', 'afro', 'bun', 'long', 'mohawk'];
const NAMES = [
  'Ada',
  'Bo',
  'Cleo',
  'Dev',
  'Esme',
  'Finn',
  'Gus',
  'Hana',
  'Ivo',
  'Jun',
  'Kit',
  'Lars',
  'Mira',
  'Nils',
  'Oona',
  'Pip',
  'Quinn',
  'Rosa',
  'Sami',
  'Tove',
  'Uma',
  'Vik',
  'Wren',
  'Yara',
  'Zed',
  'Alva',
  'Bram',
  'Cyd',
  'Dot',
  'Elis',
];

export function lookFor(seed: string): Look {
  const r = seededRandom(`look:${seed}`);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  return {
    name: pick(NAMES),
    skin: pick(SKINS),
    hair: pick(HAIRS),
    hairStyle: pick(STYLES),
    shirt: pick(SHIRTS),
    trousers: pick(TROUSERS),
    shoes: pick(SHOES),
    glasses: r() < 0.3,
    tie: r() < 0.25 ? pick([0xe23b3b, 0x23325e, 0xffd23f]) : null,
    build: 0.9 + r() * 0.35,
    height: 0.92 + r() * 0.16,
  };
}

// Shared resources: one box geometry and one material per colour.
const BOX = new THREE.BoxGeometry(1, 1, 1);
const BLOB = new THREE.IcosahedronGeometry(0.5, 0);
const materials = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number): THREE.MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    materials.set(color, m);
  }
  return m;
}

function box(
  parent: THREE.Object3D,
  color: number,
  [sx, sy, sz]: [number, number, number],
  [x, y, z]: [number, number, number],
  geo: THREE.BufferGeometry = BOX,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export interface CharacterRig {
  /** Positioned/rotated by the owner. Front faces +z. */
  root: THREE.Group;
  /** Moves up/down for bobbing and sitting. */
  body: THREE.Group;
  head: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  look: Look;
}

/** Hip height when standing; legs hang from here. */
export const HIP_Y = 0.44;

export function buildCharacter(look: Look): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  root.scale.setScalar(look.height);

  const tw = 0.34 * look.build;
  const legLen = HIP_Y;
  const limb = (x: number, y: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    body.add(g);
    return g;
  };

  // Legs hang down from the hip pivots; shoes poke forward.
  const legL = limb(-0.085 * look.build, HIP_Y);
  const legR = limb(0.085 * look.build, HIP_Y);
  for (const leg of [legL, legR]) {
    box(leg, look.trousers, [0.14, legLen - 0.04, 0.15], [0, -(legLen - 0.04) / 2, 0]);
    box(leg, look.shoes, [0.15, 0.07, 0.22], [0, -legLen + 0.035, 0.035]);
  }

  // Torso, belt and optional tie.
  box(body, look.shirt, [tw, 0.42, 0.22], [0, HIP_Y + 0.2, 0]);
  box(body, look.trousers, [tw + 0.01, 0.06, 0.23], [0, HIP_Y + 0.01, 0]);
  if (look.tie !== null) box(body, look.tie, [0.06, 0.26, 0.02], [0, HIP_Y + 0.25, 0.115]);

  // Arms hang from shoulder pivots; hands are skin cubes.
  const shoulderY = HIP_Y + 0.37;
  const armL = limb(-(tw / 2 + 0.055), shoulderY);
  const armR = limb(tw / 2 + 0.055, shoulderY);
  for (const arm of [armL, armR]) {
    box(arm, look.shirt, [0.1, 0.3, 0.12], [0, -0.13, 0]);
    box(arm, look.skin, [0.09, 0.09, 0.1], [0, -0.32, 0]);
  }

  // Head with face details and hair.
  const head = new THREE.Group();
  head.position.set(0, HIP_Y + 0.42, 0);
  body.add(head);
  box(head, look.skin, [0.06, 0.05, 0.06], [0, 0.02, 0]); // neck
  const hs = 0.28;
  box(head, look.skin, [hs, hs, hs - 0.02], [0, 0.04 + hs / 2, 0]);
  const eyeY = 0.04 + hs * 0.55;
  for (const x of [-0.06, 0.06])
    box(head, 0x1a1a1a, [0.04, 0.045, 0.02], [x, eyeY, hs / 2 - 0.005]);
  box(head, 0xc0504d, [0.08, 0.02, 0.02], [0, 0.04 + hs * 0.22, hs / 2 - 0.005]); // mouth
  if (look.glasses) {
    for (const x of [-0.06, 0.06])
      box(head, 0x222222, [0.085, 0.07, 0.015], [x, eyeY, hs / 2 + 0.008]);
    box(head, 0x222222, [0.06, 0.015, 0.015], [0, eyeY + 0.02, hs / 2 + 0.008]);
  }
  addHair(head, look, hs);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = false;
  });
  return { root, body, head, legL, legR, armL, armR, look };
}

function addHair(head: THREE.Group, look: Look, hs: number): void {
  const top = 0.04 + hs;
  const c = look.hair;
  const cap = () => {
    box(head, c, [hs + 0.03, 0.07, hs + 0.01], [0, top + 0.02, -0.005]);
    box(head, c, [hs + 0.03, hs * 0.6, 0.05], [0, top - hs * 0.3, -hs / 2 + 0.01]);
  };
  switch (look.hairStyle) {
    case 'bald':
      break;
    case 'short':
      cap();
      break;
    case 'spiky':
      cap();
      for (let i = -1; i <= 1; i++) {
        const s = box(head, c, [0.08, 0.1, 0.08], [i * 0.09, top + 0.07, 0]);
        s.rotation.z = i * 0.35;
      }
      break;
    case 'afro':
      box(head, c, [hs + 0.16, hs * 0.85, hs + 0.12], [0, top - 0.06, -0.02], BLOB);
      break;
    case 'bun':
      cap();
      box(head, c, [0.12, 0.11, 0.12], [0, top + 0.08, -0.08]);
      break;
    case 'long':
      cap();
      box(head, c, [hs + 0.05, hs + 0.1, 0.07], [0, top - hs - 0.03, -hs / 2 + 0.01]);
      for (const x of [-1, 1])
        box(head, c, [0.05, hs * 0.75, hs * 0.7], [x * (hs / 2 + 0.02), top - hs * 0.8, -0.03]);
      break;
    case 'mohawk':
      box(head, c, [0.06, 0.12, hs + 0.04], [0, top, -0.01]);
      break;
  }
}

export type Pose =
  | { kind: 'stand'; t: number }
  | { kind: 'walk'; phase: number }
  | { kind: 'sit'; amount: number; typing: boolean; t: number }
  | { kind: 'drink'; t: number }
  | { kind: 'talk'; t: number; seed: number };

const SEAT_DROP = HIP_Y - 0.4; // hips rest on a 0.4 high seat

/** Procedural pose: limb rotations and body offset from a few parameters. */
export function poseCharacter(rig: CharacterRig, pose: Pose): void {
  const { body, head, legL, legR, armL, armR } = rig;
  body.position.y = 0;
  head.rotation.set(0, 0, 0);
  legL.rotation.set(0, 0, 0);
  legR.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0);
  armR.rotation.set(0, 0, 0);
  switch (pose.kind) {
    case 'stand':
      body.position.y = Math.sin(pose.t * 2.2) * 0.008;
      armL.rotation.z = -0.06;
      armR.rotation.z = 0.06;
      break;
    case 'walk': {
      const s = Math.sin(pose.phase);
      legL.rotation.x = s * 0.6;
      legR.rotation.x = -s * 0.6;
      armL.rotation.x = -s * 0.5;
      armR.rotation.x = s * 0.5;
      body.position.y = Math.abs(Math.cos(pose.phase)) * 0.04;
      break;
    }
    case 'sit': {
      const a = pose.amount;
      body.position.y = -SEAT_DROP * a;
      legL.rotation.x = legR.rotation.x = (-Math.PI / 2) * a;
      if (pose.typing) {
        const tap = pose.t * 14;
        armL.rotation.x = -1.15 * a + Math.sin(tap) * 0.1;
        armR.rotation.x = -1.15 * a + Math.sin(tap + Math.PI * 0.8) * 0.1;
        head.rotation.x = 0.08 + Math.sin(pose.t * 1.3) * 0.04;
        body.position.y += Math.abs(Math.sin(pose.t * 7)) * 0.006;
      } else {
        armL.rotation.x = armR.rotation.x = -0.5 * a;
      }
      break;
    }
    case 'drink': {
      // Sip from a cup every few seconds.
      const cycle = pose.t % 3.5;
      const lift = cycle < 1.2 ? Math.sin((cycle / 1.2) * Math.PI) : 0;
      armR.rotation.x = -0.4 - lift * 1.6;
      armR.rotation.z = -lift * 0.35;
      head.rotation.x = -lift * 0.25;
      body.position.y = Math.sin(pose.t * 2.2) * 0.008;
      break;
    }
    case 'talk': {
      const t = pose.t + pose.seed * 10;
      armL.rotation.x = -0.3 - Math.max(0, Math.sin(t * 2.3)) * 0.7;
      armR.rotation.x = -0.2 - Math.max(0, Math.sin(t * 1.7 + 1)) * 0.5;
      armL.rotation.z = -0.15;
      armR.rotation.z = 0.15;
      head.rotation.y = Math.sin(t * 0.9) * 0.25;
      head.rotation.x = Math.sin(t * 3.1) * 0.06;
      body.position.y = Math.abs(Math.sin(t * 4)) * 0.012;
      break;
    }
  }
}
