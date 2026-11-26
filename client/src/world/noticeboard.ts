import * as THREE from 'three';
import type { Goal, Task, WorldState } from '@dash-iso/shared';
import { tagFeature, type FeatureTarget } from './features.js';
import { projectCss } from './projects.js';
import { makeCanvas, roundRect, toTexture, type Ctx } from './textures.js';

/**
 * Goals noticeboard in the lobby: a cork board with one pinned card per goal
 * (title, project colour, progress bar). Clicking a card opens that goal;
 * clicking elsewhere on the board opens the goals overlay.
 */

export interface GoalProgress {
  total: number;
  merged: number;
  active: number;
  failed: number;
  /** 0..1, merged / total (0 when the goal has no tasks). */
  ratio: number;
}

const ACTIVE = new Set<Task['status']>(['queued', 'in_progress', 'review', 'merging']);

/** Progress of a goal from its tasks' statuses. Tasks Dash no longer lists are ignored. */
export function goalProgress(goal: Goal, tasks: readonly Task[]): GoalProgress {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const mine = goal.taskIds.map((id) => byId.get(id)).filter((t): t is Task => !!t);
  const merged = mine.filter((t) => t.status === 'merged').length;
  return {
    total: mine.length,
    merged,
    active: mine.filter((t) => ACTIVE.has(t.status)).length,
    failed: mine.filter((t) => t.status === 'failed').length,
    ratio: mine.length ? merged / mine.length : 0,
  };
}

/** Goals shown on the board, filtered by project. */
export function boardGoals(state: WorldState, filter: string | null): Goal[] {
  return filter === null ? state.goals : state.goals.filter((g) => g.project === filter);
}

export const BOARD_W = 3.8;
export const BOARD_H = 1.9;
const TEX_W = 1024;
const TEX_H = Math.round((TEX_W * BOARD_H) / BOARD_W);
export const CARD_COLS = 3;
export const CARD_ROWS = 2;
const PAD = 34;
const GAP = 24;
const CARD_W = (TEX_W - 2 * PAD - (CARD_COLS - 1) * GAP) / CARD_COLS;
const CARD_H = (TEX_H - 2 * PAD - (CARD_ROWS - 1) * GAP) / CARD_ROWS;

/** Card index under a board UV (u right, v up), or -1. */
export function cardAt(u: number, v: number): number {
  const x = u * TEX_W - PAD;
  const y = (1 - v) * TEX_H - PAD;
  const col = Math.floor(x / (CARD_W + GAP));
  const row = Math.floor(y / (CARD_H + GAP));
  if (col < 0 || col >= CARD_COLS || row < 0 || row >= CARD_ROWS) return -1;
  if (x - col * (CARD_W + GAP) > CARD_W || y - row * (CARD_H + GAP) > CARD_H) return -1;
  return row * CARD_COLS + col;
}

function wrap(ctx: Ctx, text: string, max: number, lines: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= max) line = next;
    else {
      if (line) out.push(line);
      line = w;
    }
    if (out.length === lines) break;
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && out.join(' ').length < text.length) {
    let last = out[lines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > max) last = last.slice(0, -1);
    out[lines - 1] = `${last}…`;
  }
  return out;
}

const NOTE_COLORS = ['#fff7c2', '#ffe0ec', '#dff3ff', '#e5ffd9', '#fff0d6', '#efe4ff'];

function boardTexture(
  goals: readonly Goal[],
  tasks: readonly Task[],
  projectName: (id: string) => string,
): THREE.Texture {
  const c = makeCanvas(TEX_W, TEX_H);
  if (c) {
    const { ctx } = c;
    // Cork with a wooden frame.
    ctx.fillStyle = '#7a4a22';
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.fillStyle = '#c99a5b';
    ctx.fillRect(14, 14, TEX_W - 28, TEX_H - 28);
    ctx.fillStyle = 'rgba(90,50,10,0.18)';
    for (let i = 0; i < 600; i++) ctx.fillRect((i * 97) % TEX_W, (i * 61 + 13) % TEX_H, 3, 3);

    const cards = CARD_COLS * CARD_ROWS;
    const shown = goals.length > cards ? goals.slice(0, cards - 1) : goals;
    shown.forEach((g, i) => {
      const col = i % CARD_COLS;
      const row = Math.floor(i / CARD_COLS);
      const x = PAD + col * (CARD_W + GAP);
      const y = PAD + row * (CARD_H + GAP);
      const p = goalProgress(g, tasks);
      ctx.save();
      ctx.translate(x + CARD_W / 2, y + CARD_H / 2);
      ctx.rotate((((i * 37) % 7) - 3) * 0.006);
      ctx.translate(-CARD_W / 2, -CARD_H / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(5, 7, CARD_W, CARD_H);
      ctx.fillStyle = NOTE_COLORS[i % NOTE_COLORS.length]!;
      ctx.fillRect(0, 0, CARD_W, CARD_H);
      // Project stripe and pin.
      const color = projectCss(g.project);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, CARD_W, 34);
      ctx.beginPath();
      ctx.arc(CARD_W / 2, 6, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#e23b3b';
      ctx.fill();
      ctx.strokeStyle = '#7a1414';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        wrap(ctx, projectName(g.project).toUpperCase(), CARD_W - 60, 1)[0] ?? '',
        14,
        20,
      );
      // Title.
      ctx.fillStyle = '#2a2a2a';
      ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
      wrap(ctx, g.title, CARD_W - 28, 2).forEach((l, k) => ctx.fillText(l, 14, 66 + k * 34));
      // Progress bar.
      const by = CARD_H - 62;
      const bw = CARD_W - 28;
      ctx.fillStyle = '#d8c48a';
      ctx.beginPath();
      roundRect(ctx, 14, by, bw, 24, 10);
      ctx.fill();
      if (p.ratio > 0) {
        ctx.fillStyle = '#3fbf6a';
        ctx.beginPath();
        roundRect(ctx, 14, by, Math.max(20, bw * p.ratio), 24, 10);
        ctx.fill();
      }
      ctx.fillStyle = '#4a3a1a';
      ctx.font = 'bold 22px "Trebuchet MS", Verdana, sans-serif';
      const label = p.total
        ? `${p.merged}/${p.total} merged${p.failed ? ` · ${p.failed} failed` : ''}`
        : 'No tasks yet';
      ctx.fillText(label, 14, CARD_H - 20);
      ctx.restore();
    });
    if (goals.length > shown.length) {
      const i = shown.length;
      const x = PAD + (i % CARD_COLS) * (CARD_W + GAP);
      const y = PAD + Math.floor(i / CARD_COLS) * (CARD_H + GAP);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, CARD_W, CARD_H);
      ctx.fillStyle = '#2b4a8b';
      ctx.font = 'bold 44px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${goals.length - shown.length} more`, x + CARD_W / 2, y + CARD_H / 2);
      ctx.textAlign = 'left';
    }
    if (goals.length === 0) {
      ctx.fillStyle = '#fffdf2';
      ctx.font = 'bold 48px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No goals pinned', TEX_W / 2, TEX_H / 2);
    }
  }
  return toTexture(c);
}

const LEG_GEO = new THREE.BoxGeometry(0.1, 1, 0.1).translate(0, 0.5, 0);
const LEG_MAT = new THREE.MeshLambertMaterial({ color: 0x7a4a22 });

/** Freestanding goals board on two legs; local origin at its feet, facing +z. */
export class Noticeboard {
  readonly group = new THREE.Group();
  private readonly board: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial>;
  private key = '';
  /** Goal ids in card order, for picking. */
  private cards: string[] = [];

  constructor() {
    this.group.name = 'noticeboard';
    const lift = 0.75;
    for (const x of [-BOARD_W / 2 + 0.25, BOARD_W / 2 - 0.25]) {
      const leg = new THREE.Mesh(LEG_GEO, LEG_MAT);
      leg.scale.y = lift + BOARD_H * 0.9;
      leg.position.set(x, 0, -0.06);
      this.group.add(leg);
    }
    this.board = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W, BOARD_H),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    this.board.position.y = lift + BOARD_H / 2;
    // Wooden back so the board reads from behind too (cards only face front).
    const back = new THREE.Mesh(LEG_GEO, LEG_MAT);
    back.scale.set((BOARD_W + 0.08) / 0.1, BOARD_H + 0.08, 0.6);
    back.position.set(0, lift - 0.04, -0.035);
    this.group.add(back);
    this.board.name = 'noticeboard-face';
    tagFeature(this.board, (hit) => this.targetAt(hit.uv));
    this.group.add(this.board);
  }

  private targetAt(uv: THREE.Vector2 | undefined): FeatureTarget {
    const i = uv ? cardAt(uv.x, uv.y) : -1;
    const goalId = i >= 0 ? this.cards[i] : undefined;
    return goalId ? { kind: 'goals', goalId } : { kind: 'goals' };
  }

  update(state: WorldState, filter: string | null): void {
    const goals = boardGoals(state, filter);
    const progress = goals.map((g) => goalProgress(g, state.tasks));
    const name = (id: string) => state.projects.find((p) => p.id === id)?.name ?? id;
    const key = JSON.stringify([
      goals.map((g) => [g.id, g.title, g.project, name(g.project)]),
      progress,
    ]);
    if (key === this.key) return;
    this.key = key;
    const max = CARD_COLS * CARD_ROWS;
    this.cards = (goals.length > max ? goals.slice(0, max - 1) : goals).map((g) => g.id);
    const mat = this.board.material;
    mat.map?.dispose();
    mat.map = boardTexture(goals, state.tasks, name);
    mat.needsUpdate = true;
  }

  get pickables(): THREE.Object3D[] {
    return [this.board];
  }

  dispose(): void {
    this.board.geometry.dispose();
    this.board.material.map?.dispose();
    this.board.material.dispose();
    this.group.parent?.remove(this.group);
  }
}
