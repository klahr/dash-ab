import * as THREE from 'three';
import { makeCanvas, roundRect, toTexture } from './textures.js';
import type { Outcome } from './worker-fsm.js';

/**
 * Short-lived outcome effects: a green tick with confetti for a successful
 * task, a red puff of smoke for a failed one. Each effect owns its objects and
 * removes itself when done.
 */

export const BUBBLE_W = 512;
export const BUBBLE_H = 150;

/** Stable, cheerful colour per project id. */
export function projectColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 70%, 42%)`;
}

function ellipsize(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  max: number,
): string {
  if (ctx.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > max) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Speech bubble: project name (coloured) above the task title, with a tail. */
export function bubbleTexture(title: string, project: string, projectId: string): THREE.Texture {
  const w = BUBBLE_W;
  const h = BUBBLE_H;
  const c = makeCanvas(w, h);
  if (c) {
    const { ctx } = c;
    const body = h - 30;
    ctx.beginPath();
    roundRect(ctx, 6, 6, w - 12, body - 6, 24);
    ctx.moveTo(w / 2 - 22, body - 1);
    ctx.lineTo(w / 2, h - 6);
    ctx.lineTo(w / 2 + 22, body - 1);
    ctx.closePath();
    ctx.fillStyle = '#fffdf4';
    ctx.strokeStyle = '#2b4a8b';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fill();
    // Project tag.
    ctx.font = 'bold 30px "Trebuchet MS", Verdana, sans-serif';
    const tag = ellipsize(ctx, project.toUpperCase(), w - 80);
    const tw = ctx.measureText(tag).width + 26;
    ctx.fillStyle = projectColor(projectId);
    ctx.beginPath();
    roundRect(ctx, 24, 18, tw, 40, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, 37, 39);
    // Title.
    ctx.font = 'bold 38px "Trebuchet MS", Verdana, sans-serif';
    ctx.fillStyle = '#222222';
    ctx.fillText(ellipsize(ctx, title, w - 56), 28, 87);
  }
  return toTexture(c);
}

function iconTexture(kind: Outcome): THREE.Texture {
  const s = 128;
  const c = makeCanvas(s, s);
  if (c) {
    const { ctx } = c;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
    ctx.fillStyle = kind === 'success' ? '#3fbf6a' : '#e23b3b';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (kind === 'success') {
      ctx.moveTo(36, 66);
      ctx.lineTo(56, 86);
      ctx.lineTo(94, 44);
    } else {
      ctx.moveTo(44, 44);
      ctx.lineTo(84, 84);
      ctx.moveTo(84, 44);
      ctx.lineTo(44, 84);
    }
    ctx.stroke();
  }
  return toTexture(c);
}

let icons: Record<Outcome, THREE.Texture> | null = null;
function icon(kind: Outcome): THREE.Texture {
  icons ??= { success: iconTexture('success'), failure: iconTexture('failure') };
  return icons[kind];
}

const CONFETTI_COLORS = [0xe23b3b, 0x2f7fe0, 0xffd23f, 0x3fbf6a, 0x8a4fd8, 0xff8c2a, 0xff6fa8];
const CONFETTI_GEO = new THREE.PlaneGeometry(0.08, 0.05);
const CONFETTI_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const SMOKE_GEO = new THREE.IcosahedronGeometry(0.5, 0);

interface Effect {
  update(dt: number): boolean;
  dispose(): void;
}

const DURATION = 1.8;

class SuccessEffect implements Effect {
  private age = 0;
  private readonly group = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly confetti: THREE.InstancedMesh;
  private readonly bits: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3 }[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(
    private readonly parent: THREE.Object3D,
    at: THREE.Vector3,
  ) {
    this.group.position.copy(at);
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: icon('success'), transparent: true, depthTest: false }),
    );
    this.sprite.renderOrder = 4;
    this.group.add(this.sprite);

    const n = 36;
    this.confetti = new THREE.InstancedMesh(CONFETTI_GEO, CONFETTI_MAT, n);
    this.confetti.frustumCulled = false;
    const color = new THREE.Color();
    this.bits = Array.from({ length: n }, (_, i) => {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 1.2;
      this.confetti.setColorAt(i, color.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!));
      return {
        p: new THREE.Vector3(0, 0.2, 0),
        v: new THREE.Vector3(Math.cos(a) * sp, 2.2 + Math.random() * 1.6, Math.sin(a) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        w: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, 0),
      };
    });
    this.group.add(this.confetti);
    parent.add(this.group);
    this.update(0);
  }

  update(dt: number): boolean {
    this.age += dt;
    const k = this.age / DURATION;
    const pop = Math.min(1, this.age / 0.25);
    const s = 0.6 * (pop < 1 ? 1.3 * Math.sin((pop * Math.PI) / 2) : 1);
    this.sprite.scale.set(s, s, 1);
    this.sprite.position.y = 0.5 + k * 0.6;
    this.sprite.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i]!;
      b.v.y -= 6 * dt;
      b.v.multiplyScalar(1 - 1.5 * dt);
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < -this.group.position.y + 0.02) {
        b.p.y = -this.group.position.y + 0.02;
        b.v.set(0, 0, 0);
      }
      b.r.x += b.w.x * dt;
      b.r.y += b.w.y * dt;
      const fade = k < 0.75 ? 1 : Math.max(0, 1 - (k - 0.75) / 0.25);
      this.m.compose(b.p, this.q.setFromEuler(b.r), this.one.setScalar(fade));
      this.confetti.setMatrixAt(i, this.m);
    }
    this.confetti.instanceMatrix.needsUpdate = true;
    return this.age < DURATION;
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.sprite.material.dispose();
    this.confetti.dispose();
  }
}

class FailureEffect implements Effect {
  private age = 0;
  private readonly group = new THREE.Group();
  private readonly sprite: THREE.Sprite;
  private readonly smokeMat: THREE.MeshLambertMaterial;
  private readonly puffs: { mesh: THREE.Mesh; v: THREE.Vector3; size: number; delay: number }[];

  constructor(
    private readonly parent: THREE.Object3D,
    at: THREE.Vector3,
  ) {
    this.group.position.copy(at);
    this.smokeMat = new THREE.MeshLambertMaterial({
      color: 0xb04a3a,
      emissive: 0x3a0d08,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      flatShading: true,
    });
    this.puffs = Array.from({ length: 10 }, (_, i) => {
      const mesh = new THREE.Mesh(SMOKE_GEO, this.smokeMat);
      const a = (i / 10) * Math.PI * 2;
      mesh.position.set(Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      this.group.add(mesh);
      return {
        mesh,
        v: new THREE.Vector3(Math.cos(a) * 0.5, 0.7 + Math.random() * 0.5, Math.sin(a) * 0.5),
        size: 0.25 + Math.random() * 0.2,
        delay: Math.random() * 0.2,
      };
    });
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: icon('failure'), transparent: true, depthTest: false }),
    );
    this.sprite.renderOrder = 4;
    this.group.add(this.sprite);
    parent.add(this.group);
    this.update(0);
  }

  update(dt: number): boolean {
    this.age += dt;
    const k = this.age / DURATION;
    for (const p of this.puffs) {
      const t = Math.max(0, this.age - p.delay);
      const g = Math.min(1, t / 0.3);
      p.mesh.position.addScaledVector(p.v, dt * (t > 0 ? 1 : 0));
      p.v.multiplyScalar(1 - 1.2 * dt);
      p.mesh.scale.setScalar(p.size * (0.3 + g * 0.7 + t * 0.5));
      p.mesh.rotation.y += dt;
    }
    // Smoke turns from red-hot to grey as it rises.
    this.smokeMat.color.setHex(0xb04a3a).lerp(new THREE.Color(0x6e6e72), Math.min(1, k * 1.6));
    this.smokeMat.emissive.setHex(0x3a0d08).multiplyScalar(Math.max(0, 1 - k * 2));
    this.smokeMat.opacity = 0.9 * Math.max(0, 1 - k);
    const pop = Math.min(1, this.age / 0.2);
    const s = 0.5 * pop;
    this.sprite.scale.set(s, s, 1);
    this.sprite.position.y = 0.9 + k * 0.3;
    this.sprite.material.opacity = k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3);
    return this.age < DURATION;
  }

  dispose(): void {
    this.parent.remove(this.group);
    this.sprite.material.dispose();
    this.smokeMat.dispose();
  }
}

/** Runs outcome effects; call `update(dt)` once per frame. */
export class Effects {
  private readonly live: Effect[] = [];

  constructor(private readonly parent: THREE.Object3D) {}

  get count(): number {
    return this.live.length;
  }

  spawn(outcome: Outcome, at: THREE.Vector3): void {
    this.live.push(
      outcome === 'success'
        ? new SuccessEffect(this.parent, at)
        : new FailureEffect(this.parent, at),
    );
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i]!;
      if (!e.update(dt)) {
        e.dispose();
        this.live.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const e of this.live) e.dispose();
    this.live.length = 0;
  }
}
