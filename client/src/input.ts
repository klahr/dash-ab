import * as THREE from 'three';
import type { IsoCameraRig } from './camera.js';

export interface ControlsOptions {
  /** Pointer released without dragging. */
  onClick?: (ndc: THREE.Vector2) => void;
  /** Pointer moved (no buttons held). */
  onHover?: (ndc: THREE.Vector2) => void;
  /** Camera rotated by a step. */
  onRotate?: (step: number) => void;
}

const DRAG_THRESHOLD = 5;
const KEY_PAN_SPEED = 1.4; // view heights per second

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/**
 * Mouse/keyboard controls: drag to pan, wheel to zoom at the cursor, WASD or
 * arrows to pan, Q/E to rotate 90°. A click (no drag) is reported separately.
 */
export class Controls {
  private readonly keys = new Set<string>();
  private drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  private readonly abort = new AbortController();

  constructor(
    private readonly el: HTMLElement,
    private readonly rig: IsoCameraRig,
    private readonly opts: ControlsOptions = {},
  ) {
    const signal = this.abort.signal;
    el.addEventListener('pointerdown', (e) => this.down(e), { signal });
    el.addEventListener('pointermove', (e) => this.move(e), { signal });
    el.addEventListener('pointerup', (e) => this.up(e), { signal });
    el.addEventListener('pointercancel', () => (this.drag = null), { signal });
    el.addEventListener('wheel', (e) => this.wheel(e), { signal, passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    window.addEventListener('keydown', (e) => this.keydown(e), { signal });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
  }

  ndc(e: { clientX: number; clientY: number }): THREE.Vector2 {
    const r = this.el.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
  }

  private down(e: PointerEvent): void {
    this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    this.el.setPointerCapture(e.pointerId);
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) {
      this.opts.onHover?.(this.ndc(e));
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    d.moved = true;
    this.el.style.cursor = 'grabbing';
    this.rig.panPixels(dx, dy, this.el.clientHeight);
    d.x = e.clientX;
    d.y = e.clientY;
  }

  private up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    this.el.style.cursor = '';
    if (d && !d.moved && e.button === 0) this.opts.onClick?.(this.ndc(e));
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? 16 : 1;
    this.rig.zoom(Math.exp(e.deltaY * lines * 0.0015), this.ndc(e));
  }

  private keydown(e: KeyboardEvent): void {
    if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyQ' || e.code === 'KeyE') {
      this.rig.rotate(e.code === 'KeyQ' ? -1 : 1);
      this.opts.onRotate?.(this.rig.step);
      return;
    }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') this.rig.zoom(0.85);
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.rig.zoom(1 / 0.85);
    this.keys.add(e.code);
  }

  /** Apply held-key panning. Call once per frame. */
  update(dt: number): void {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (!x && !y) return;
    const speed = KEY_PAN_SPEED * this.rig.viewSize * dt;
    this.rig.panScreen(x * speed, y * speed);
  }

  dispose(): void {
    this.abort.abort();
  }
}
