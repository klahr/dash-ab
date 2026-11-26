import * as THREE from 'three';
import { viewAngle } from './world/layout.js';

/** Elevation of a true isometric view: atan(1/√2) ≈ 35.26°. */
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2);
const DISTANCE = 60;

/**
 * Orthographic isometric camera orbiting a ground target. Supports panning,
 * zooming toward a point and rotating in animated 90° steps.
 */
export class IsoCameraRig {
  readonly camera: THREE.OrthographicCamera;
  readonly target = new THREE.Vector3();
  /** Half-height of the view in world units. Smaller = zoomed in. */
  viewSize: number;
  minView = 4;
  maxView = 40;
  /** Logical rotation step; the angle animates toward it. */
  private _step = 0;
  private angle = viewAngle(0);
  private aspect: number;
  private readonly bounds = new THREE.Box2(
    new THREE.Vector2(-Infinity, -Infinity),
    new THREE.Vector2(Infinity, Infinity),
  );

  constructor(aspect: number, viewSize = 12) {
    this.aspect = aspect;
    this.viewSize = viewSize;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, DISTANCE * 3);
    this.apply();
  }

  get step(): number {
    return this._step;
  }

  /** Current horizontal angle in radians (animated). */
  get currentAngle(): number {
    return this.angle;
  }

  setAspect(aspect: number): void {
    this.aspect = aspect;
    this.apply();
  }

  /** Clamp the target to this ground rectangle (x/z). */
  setBounds(minX: number, minZ: number, maxX: number, maxZ: number): void {
    this.bounds.min.set(minX, minZ);
    this.bounds.max.set(maxX, maxZ);
    this.clampTarget();
    this.apply();
  }

  lookAt(x: number, z: number): void {
    this.target.set(x, 0, z);
    this.clampTarget();
    this.apply();
  }

  /** Ground-plane unit vectors for screen right and screen up at the current angle. */
  private axes(): { right: THREE.Vector3; up: THREE.Vector3 } {
    const a = this.angle;
    return {
      right: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
      up: new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)),
    };
  }

  /** Pan by a screen-space delta in pixels (content follows the pointer). */
  panPixels(dx: number, dy: number, viewportHeight: number): void {
    const upp = (2 * this.viewSize) / viewportHeight;
    this.panScreen(-dx * upp, dy * upp);
  }

  /**
   * Move the target by screen-aligned world units: +right moves the view right,
   * +up moves it up the screen. Ground is foreshortened vertically.
   */
  panScreen(right: number, up: number): void {
    const { right: r, up: u } = this.axes();
    this.target.addScaledVector(r, right).addScaledVector(u, up / Math.sin(ISO_ELEVATION));
    this.clampTarget();
    this.apply();
  }

  /**
   * Zoom by `factor` (<1 zooms in). If `ndc` is given, the ground point under it
   * stays put on screen.
   */
  zoom(factor: number, ndc?: THREE.Vector2): void {
    const before = ndc ? this.groundPoint(ndc) : null;
    this.viewSize = THREE.MathUtils.clamp(this.viewSize * factor, this.minView, this.maxView);
    this.apply();
    if (before && ndc) {
      const after = this.groundPoint(ndc);
      if (after) {
        this.target.add(before.sub(after));
        this.clampTarget();
        this.apply();
      }
    }
  }

  /** Rotate by ±90° around the target. */
  rotate(dir: 1 | -1): void {
    this._step += dir;
  }

  /** Advance the rotation animation. Returns true while still moving. */
  update(dt: number): boolean {
    const goal = viewAngle(this._step);
    const diff = goal - this.angle;
    if (Math.abs(diff) < 1e-4) {
      if (this.angle !== goal) {
        this.angle = goal;
        this.apply();
      }
      return false;
    }
    this.angle += diff * Math.min(1, dt * 10);
    this.apply();
    return true;
  }

  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Point on the y=0 ground plane under normalised device coordinates. */
  groundPoint(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.bounds.min.x, this.bounds.max.x);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.bounds.min.y, this.bounds.max.y);
  }

  private apply(): void {
    const cam = this.camera;
    const v = this.viewSize;
    cam.left = -v * this.aspect;
    cam.right = v * this.aspect;
    cam.top = v;
    cam.bottom = -v;
    cam.updateProjectionMatrix();
    const h = Math.cos(ISO_ELEVATION) * DISTANCE;
    cam.position.set(
      this.target.x + Math.sin(this.angle) * h,
      this.target.y + Math.sin(ISO_ELEVATION) * DISTANCE,
      this.target.z + Math.cos(this.angle) * h,
    );
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
  }
}
