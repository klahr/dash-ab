/**
 * Pure desk layout for a room: one desk (with computer and chair) per runner
 * slot, in rows along the back (north) wall, plus the spots idle workers
 * wander to. Room-local coordinates; no three.js.
 */
import type { IdleActivity, Spot, Vec2, WorkerSite } from './worker-fsm.js';

export interface DeskSpot {
  index: number;
  /** Desk centre (base). The worker sits on the +z side, facing −z. */
  x: number;
  z: number;
  width: number;
  depth: number;
  seat: Spot;
  approach: Vec2;
}

export interface RoomDims {
  w: number;
  d: number;
}

const MARGIN_X = 0.6;
const MAX_PITCH = 1.7;
const FIRST_ROW_Z = 1.45;
const ROW_PITCH = 2.0;
const DESK_DEPTH = 0.6;
const CHAIR_OFFSET = 0.62;
const APPROACH_OFFSET = 0.45;
/** Where the water cooler stands (matches `propParts`). */
const WALL_T = 0.22;

export function deskLayout(count: number, room: RoomDims): DeskSpot[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.min(count, Math.max(4, Math.ceil(count / 3))));
  const span = room.w - 2 * MARGIN_X;
  const pitch = Math.min(MAX_PITCH, span / cols);
  const width = Math.min(1.25, pitch - 0.15);
  const out: DeskSpot[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const inRow = Math.min(cols, count - row * cols);
    const col = i % cols;
    const x0 = room.w / 2 - (inRow * pitch) / 2;
    const x = x0 + (col + 0.5) * pitch;
    const z = FIRST_ROW_Z + row * ROW_PITCH;
    const seatZ = z + CHAIR_OFFSET;
    out.push({
      index: i,
      x,
      z,
      width,
      depth: DESK_DEPTH,
      seat: { pos: { x, z: seatZ }, facing: Math.PI },
      approach: { x, z: seatZ + APPROACH_OFFSET },
    });
  }
  return out;
}

/** Door point just outside the room's south wall (room-local). */
export function doorPoint(room: RoomDims): Vec2 {
  return { x: 2.0, z: room.d + 0.35 };
}

/** Rectangle idle workers stay in: in front of the desks, clear of the walls. */
export function idleArea(desks: DeskSpot[], room: RoomDims) {
  const lastApproach = desks.reduce((m, d) => Math.max(m, d.approach.z), FIRST_ROW_Z);
  const z1 = room.d - 0.8;
  const z0 = Math.min(lastApproach + 0.35, z1 - 0.6);
  return { x0: 1.1, x1: room.w - 1.3, z0, z1 };
}

/** Everything a slot's worker needs to know about where things are. */
export function workerSite(desk: DeskSpot, desks: DeskSpot[], room: RoomDims): WorkerSite {
  const area = idleArea(desks, room);
  const huddle = { x: room.w / 2 + 0.4, z: (area.z0 + area.z1) / 2 };
  const cooler = { x: room.w - WALL_T - 0.3, z: 3.0 };
  return {
    seat: desk.seat,
    approach: desk.approach,
    door: doorPoint(room),
    idleSpot(activity: IdleActivity, rnd: () => number): Spot {
      if (activity === 'cooler') {
        return {
          pos: { x: cooler.x - 0.6 - rnd() * 0.15, z: cooler.z + (rnd() - 0.5) * 0.7 },
          facing: Math.PI / 2,
        };
      }
      if (activity === 'chat') {
        // Four places around a huddle point; neighbours face each other.
        const a = (desk.index % 4) * (Math.PI / 2) + Math.PI / 4;
        const r = 0.42;
        const pos = { x: huddle.x + Math.sin(a) * r, z: huddle.z + Math.cos(a) * r };
        return { pos, facing: Math.atan2(huddle.x - pos.x, huddle.z - pos.z) };
      }
      return {
        pos: {
          x: area.x0 + rnd() * (area.x1 - area.x0),
          z: area.z0 + rnd() * (area.z1 - area.z0),
        },
        // Mostly face the room's open (camera) side.
        facing: (rnd() - 0.5) * Math.PI * 1.4,
      };
    },
  };
}
