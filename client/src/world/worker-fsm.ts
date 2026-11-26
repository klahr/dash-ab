/**
 * Pure worker behaviour: a small state machine plus 2D movement in room-local
 * coordinates (x, z). No three.js here; the view (`worker.ts`) reads `mode`,
 * `pos`, `facing` and `progress` each frame and poses the character.
 *
 *   idle ──assign──▶ toDesk ──arrive──▶ sittingDown ──▶ typing
 *    ▲                 │ release                          │ release
 *    │◀────────────────┘                                  ▼
 *    └──────────────────────────────────────────────── gettingUp
 *
 *   any ──leave──▶ leaving ──reach door──▶ gone
 */
import type { Slot, Task, TaskStatus } from '@dash-iso/shared';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Spot {
  pos: Vec2;
  /** Yaw in radians; 0 faces +z, π faces −z. */
  facing: number;
}

export type IdleActivity = 'wander' | 'cooler' | 'chat';

export type WorkerMode =
  'idle' | 'toDesk' | 'sittingDown' | 'typing' | 'gettingUp' | 'leaving' | 'gone';

export type Outcome = 'success' | 'failure';

/** Where this worker's desk is and where it can hang out, in room-local units. */
export interface WorkerSite {
  /** Chair position and the yaw that faces the desk. */
  seat: Spot;
  /** Where the worker stands before sitting down / after getting up. */
  approach: Vec2;
  /** Door (spawn and exit point). */
  door: Vec2;
  /** A place to go for an idle activity. */
  idleSpot(activity: IdleActivity, rnd: () => number): Spot;
}

export const WALK_SPEED = 1.3; // units per second
export const TURN_SPEED = 9; // radians per second
export const SIT_TIME = 0.45;
export const STAND_TIME = 0.5;
const ARRIVE_EPS = 0.02;

/** Ending a task in one of these is a success; `failed` is a failure; anything else is neutral. */
export function outcomeOf(status: TaskStatus | undefined): Outcome | null {
  if (status === 'review' || status === 'merging' || status === 'merged') return 'success';
  if (status === 'failed') return 'failure';
  return null;
}

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export interface BrainOptions {
  random?: () => number;
  /**
   * 'placed': already in the room (seated if busy, else at an idle spot).
   * 'door': walks in from the door.
   */
  start?: 'placed' | 'door';
}

export class WorkerBrain {
  mode: WorkerMode = 'idle';
  activity: IdleActivity = 'wander';
  pos: Vec2;
  facing = 0;
  /** True while walking this frame (drives the walk cycle). */
  moving = false;
  /** Seconds since entering the current mode. */
  timeInMode = 0;
  /** True while the slot has work (even if the task details are unknown). */
  busy = false;
  task: Task | null = null;
  lastOutcome: Outcome | null = null;
  /** Last finished task, for the details overlay. */
  lastTask: Task | null = null;

  private target: Spot | null = null;
  /** Idle: time left to linger at the current spot (≤0 means still walking). */
  private linger = 0;
  private readonly rnd: () => number;

  constructor(
    private site: WorkerSite,
    opts: BrainOptions = {},
  ) {
    this.rnd = opts.random ?? Math.random;
    if ((opts.start ?? 'placed') === 'door') {
      this.pos = { ...site.door };
      this.facing = Math.PI;
      this.pickIdle();
    } else {
      const spot = site.idleSpot('wander', this.rnd);
      this.pos = { ...spot.pos };
      this.facing = spot.facing;
      this.target = spot;
      this.linger = this.lingerTime('wander');
    }
  }

  get seated(): boolean {
    return this.mode === 'typing' || this.mode === 'sittingDown' || this.mode === 'gettingUp';
  }

  /** 0..1 progress through timed modes (sitting down / getting up), else 0. */
  get progress(): number {
    if (this.mode === 'sittingDown') return Math.min(1, this.timeInMode / SIT_TIME);
    if (this.mode === 'gettingUp') return Math.min(1, this.timeInMode / STAND_TIME);
    return 0;
  }

  /** Current walk target, if any. */
  get destination(): Vec2 | null {
    return this.target?.pos ?? null;
  }

  /** Desk moved (slot count changed and desks were re-laid out). */
  setSite(site: WorkerSite): void {
    this.site = site;
    if (this.mode === 'typing') {
      this.pos = { ...site.seat.pos };
      this.facing = site.seat.facing;
    } else if (this.mode === 'toDesk') {
      this.target = { pos: site.approach, facing: site.seat.facing };
    } else if (this.mode === 'sittingDown' || this.mode === 'gettingUp') {
      // Snap the tween onto the new desk.
      if (this.mode === 'sittingDown' || this.busy) this.seatNow();
      else this.pickIdle();
    } else if (this.mode === 'leaving') {
      this.target = { pos: site.door, facing: 0 };
    }
  }

  /** The slot got a task (or a different one). Starts the walk to the desk. */
  assign(task: Task | null): void {
    const sameTask = this.busy && (task?.id ?? null) === (this.task?.id ?? null);
    this.busy = true;
    this.task = task;
    if (sameTask || this.mode === 'leaving' || this.mode === 'gone') return;
    if (this.mode === 'typing' || this.mode === 'sittingDown') return; // keeps working
    if (this.mode === 'gettingUp') return; // sits back down once up (see update)
    this.setMode('toDesk');
    this.target = { pos: this.site.approach, facing: this.site.seat.facing };
  }

  /**
   * The slot became free. The worker gets up (or abandons the walk to the
   * desk) and goes back to idling; `outcome` is remembered for the overlay.
   */
  release(outcome: Outcome | null): void {
    if (!this.busy) return;
    this.busy = false;
    this.lastTask = this.task;
    this.lastOutcome = outcome;
    this.task = null;
    if (this.mode === 'typing' || this.mode === 'sittingDown') {
      this.setMode('gettingUp');
      this.target = null;
    } else if (this.mode === 'toDesk') {
      this.pickIdle();
    }
  }

  /** The slot was removed: walk out of the door, then become `gone`. */
  leave(): void {
    if (this.mode === 'leaving' || this.mode === 'gone') return;
    if (this.busy) this.release(null);
    if (this.seated) this.pos = { ...this.site.approach };
    this.setMode('leaving');
    this.target = { pos: this.site.door, facing: 0 };
  }

  update(dt: number): void {
    this.timeInMode += dt;
    this.moving = false;
    switch (this.mode) {
      case 'idle':
        if (this.linger > 0) {
          this.turnTo(this.target?.facing ?? this.facing, dt);
          this.linger -= dt;
          if (this.linger <= 0) this.pickIdle();
        } else if (this.walk(dt)) {
          this.linger = this.lingerTime(this.activity);
        }
        break;
      case 'toDesk':
        if (this.walk(dt)) this.setMode('sittingDown');
        break;
      case 'sittingDown': {
        const t = this.progress;
        this.pos = lerp2(this.site.approach, this.site.seat.pos, t);
        this.turnTo(this.site.seat.facing, dt);
        if (t >= 1) {
          this.facing = this.site.seat.facing;
          this.setMode('typing');
        }
        break;
      }
      case 'typing':
        this.pos = { ...this.site.seat.pos };
        this.facing = this.site.seat.facing;
        break;
      case 'gettingUp': {
        const t = this.progress;
        this.pos = lerp2(this.site.seat.pos, this.site.approach, t);
        if (t >= 1) {
          if (this.busy) {
            // A new task arrived while getting up: sit straight back down.
            this.setMode('sittingDown');
          } else {
            this.pickIdle();
          }
        }
        break;
      }
      case 'leaving':
        if (this.walk(dt)) this.setMode('gone');
        break;
      case 'gone':
        break;
    }
  }

  /** Put the worker straight into its seat (initial snapshot with a running task). */
  seatNow(): void {
    this.setMode('typing');
    this.pos = { ...this.site.seat.pos };
    this.facing = this.site.seat.facing;
    this.target = null;
  }

  private setMode(mode: WorkerMode): void {
    this.mode = mode;
    this.timeInMode = 0;
  }

  private pickIdle(): void {
    this.setMode('idle');
    const r = this.rnd();
    this.activity = r < 0.5 ? 'wander' : r < 0.75 ? 'cooler' : 'chat';
    this.target = this.site.idleSpot(this.activity, this.rnd);
    this.linger = 0;
  }

  private lingerTime(a: IdleActivity): number {
    const [lo, hi] = a === 'wander' ? [0.8, 2.5] : [3, 7];
    return lo + this.rnd() * (hi - lo);
  }

  /** Step toward the target. Returns true once arrived. */
  private walk(dt: number): boolean {
    const t = this.target;
    if (!t) return true;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= ARRIVE_EPS) {
      this.pos = { ...t.pos };
      return true;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    this.pos = { x: this.pos.x + (dx / dist) * step, z: this.pos.z + (dz / dist) * step };
    this.turnTo(Math.atan2(dx, dz), dt);
    this.moving = true;
    if (step >= dist) {
      this.pos = { ...t.pos };
      return true;
    }
    return false;
  }

  private turnTo(target: number, dt: number): void {
    const d = angleDelta(this.facing, target);
    const max = TURN_SPEED * dt;
    this.facing += Math.abs(d) <= max ? d : Math.sign(d) * max;
  }
}

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  const s = t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * s, z: a.z + (b.z - a.z) * s };
}

/** What happened when syncing a brain with its slot. */
export type SlotChange =
  | { kind: 'none' }
  | { kind: 'assigned'; task: Task | null }
  | { kind: 'released'; task: Task | null; outcome: Outcome | null };

/**
 * Bring a worker in line with its slot. When a task leaves the slot, its
 * outcome is read from the task list (the bridge sends task updates before
 * runner updates, so the final status is already there).
 */
export function syncSlot(
  brain: WorkerBrain,
  slot: Slot | undefined,
  tasks: readonly Task[],
): SlotChange[] {
  const busy = !!slot && (slot.state === 'working' || !!slot.task);
  const nextTask = busy ? (slot!.task ?? null) : null;
  const changes: SlotChange[] = [];
  const prev = brain.task;
  const switched = brain.busy && busy && (prev?.id ?? null) !== (nextTask?.id ?? null);

  if (brain.busy && (!busy || switched)) {
    const final = prev ? (tasks.find((t) => t.id === prev.id) ?? prev) : null;
    // A task still "in progress" in the list just vanished from the slot: unknown outcome.
    const outcome = outcomeOf(final?.status);
    if (switched) {
      // Straight on to the next task: remember the outcome, keep sitting.
      brain.lastTask = final;
      brain.lastOutcome = outcome;
    } else {
      brain.release(outcome);
    }
    changes.push({ kind: 'released', task: final, outcome });
  }
  if (busy) {
    const isNew = !brain.busy || switched;
    brain.assign(nextTask);
    if (isNew) changes.push({ kind: 'assigned', task: nextTask });
  }
  return changes;
}
