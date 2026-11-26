import * as THREE from 'three';

/** Bright, saturated hospital-sim colours. */
export const COLORS = {
  corridorA: 0xd8e3ea,
  corridorB: 0x9fb9cc,
  wall: 0xf4e7c8,
  wallInner: 0xf4e7c8,
  doorFrame: 0x8b5a2b,
  wood: 0xb5763a,
  woodDark: 0x7a4a22,
  terracotta: 0xd9622b,
  leaf: 0x3fae3a,
  leafLight: 0x6dd34f,
  white: 0xeef3f6,
  metal: 0x8796a6,
  metalDark: 0x5a6878,
  water: 0x5fc4ff,
  red: 0xe23b3b,
  blue: 0x2f7fe0,
  lampOn: 0xffe680,
  lampOff: 0x4a4a46,
  selection: 0xffb000,
  night: 0x1a2140,
} as const;

export interface RoomTheme {
  floorA: number;
  floorB: number;
  /** Trim on wall tops, door, rug. */
  accent: number;
  furniture: number;
}

/** One theme per room, chosen deterministically from the runner id. */
export const ROOM_THEMES: readonly RoomTheme[] = [
  { floorA: 0x46c2b4, floorB: 0x2f9e93, accent: 0x1d6f8c, furniture: 0xf05a5a },
  { floorA: 0xffb347, floorB: 0xf28c28, accent: 0xb3401c, furniture: 0x2f7fe0 },
  { floorA: 0xb48ae6, floorB: 0x8f62c9, accent: 0x5a2d91, furniture: 0xffd23f },
  { floorA: 0xff8fb1, floorB: 0xe8628e, accent: 0x9c2552, furniture: 0x3fbf6a },
  { floorA: 0x7cc8ff, floorB: 0x4f9fe6, accent: 0x1f4f9e, furniture: 0xff8c2a },
  { floorA: 0xa6dc5a, floorB: 0x7fbf3a, accent: 0x3c7a1e, furniture: 0xe84c8b },
  { floorA: 0xffe066, floorB: 0xf2c230, accent: 0xb3741a, furniture: 0x8a4fd8 },
];

const tmp = new THREE.Color();
const orig = new THREE.Color();
const night = new THREE.Color(COLORS.night);

/** "Lights off": desaturate, darken and push toward a cool night blue. */
export function dim(hex: number): number {
  orig.setHex(hex);
  const l = orig.r * 0.3 + orig.g * 0.59 + orig.b * 0.11;
  tmp.setRGB(l, l, l).lerp(orig, 0.35).multiplyScalar(0.55).lerp(night, 0.35);
  return tmp.getHex();
}
