import * as THREE from 'three';
import { tileTexture } from './textures.js';

/**
 * A growable InstancedMesh with a free list, so rooms can come and go without
 * rebuilding everything. Freed instances are collapsed to zero scale.
 */
export class InstancePool {
  mesh: THREE.InstancedMesh;
  private readonly free: number[] = [];
  private highWater = 0;
  private live = 0;

  constructor(
    readonly name: string,
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly parent: THREE.Object3D,
    capacity = 64,
  ) {
    this.mesh = this.createMesh(capacity);
    parent.add(this.mesh);
  }

  private createMesh(capacity: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.name = `pool-${this.name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    // Instances move around as the office grows; skip the (stale) bounding sphere.
    mesh.frustumCulled = false;
    return mesh;
  }

  get capacity(): number {
    return this.mesh.instanceMatrix.count;
  }

  /** Number of allocated (visible) instances. */
  get size(): number {
    return this.live;
  }

  private grow(): void {
    const old = this.mesh;
    const next = this.createMesh(old.instanceMatrix.count * 2);
    (next.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array);
    (next.instanceColor!.array as Float32Array).set(old.instanceColor!.array);
    next.count = old.count;
    this.parent.remove(old);
    this.parent.add(next);
    old.dispose();
    this.mesh = next;
  }

  alloc(matrix: THREE.Matrix4, color: THREE.ColorRepresentation): number {
    let id = this.free.pop();
    if (id === undefined) {
      if (this.highWater >= this.capacity) this.grow();
      id = this.highWater++;
      this.mesh.count = this.highWater;
    }
    this.live++;
    this.setMatrix(id, matrix);
    this.setColor(id, color);
    return id;
  }

  setMatrix(id: number, matrix: THREE.Matrix4): void {
    this.mesh.setMatrixAt(id, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private readonly tmpColor = new THREE.Color();
  setColor(id: number, color: THREE.ColorRepresentation): void {
    this.mesh.setColorAt(id, this.tmpColor.set(color));
    this.mesh.instanceColor!.needsUpdate = true;
  }

  release(id: number): void {
    this.setMatrix(id, ZERO);
    this.free.push(id);
    this.live--;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.dispose();
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Pools shared by all rooms. Every geometry is unit sized with its base at y=0. */
export type PoolKey = 'tile' | 'box' | 'cyl' | 'taper' | 'blob' | 'glow' | 'glass';

/**
 * A primitive placed relative to its owner. `size` scales the unit geometry;
 * `pos` is the base-centre position.
 */
export interface Part {
  pool: PoolKey;
  pos: readonly [number, number, number];
  size: readonly [number, number, number];
  rotY?: number;
  color: number;
  /** Lamp shades and screens: bright when the room is lit, dark otherwise. */
  lamp?: boolean;
}

export interface PartHandle {
  pool: PoolKey;
  id: number;
  part: Part;
}

function based(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox();
  geo.translate(0, -geo.boundingBox!.min.y, 0);
  return geo;
}

export class Kit {
  readonly pools: Record<PoolKey, InstancePool>;
  private readonly owned: { dispose(): void }[] = [];

  constructor(parent: THREE.Object3D) {
    const lambert = (opts: THREE.MeshLambertMaterialParameters = {}) =>
      this.own(new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts }));
    const geo = (g: THREE.BufferGeometry) => this.own(based(g));

    const box = geo(new THREE.BoxGeometry(1, 1, 1));
    const pool = (name: PoolKey, g: THREE.BufferGeometry, m: THREE.Material, cap = 256) =>
      new InstancePool(name, g, m, parent, cap);

    const tileMat = lambert({ map: this.own(tileTexture()) });
    this.pools = {
      tile: pool('tile', box, tileMat, 1024),
      box: pool('box', box, lambert(), 1024),
      cyl: pool(
        'cyl',
        geo(new THREE.CylinderGeometry(0.5, 0.5, 1, 8)),
        lambert({ flatShading: true }),
      ),
      taper: pool(
        'taper',
        geo(new THREE.CylinderGeometry(0.5, 0.36, 1, 7)),
        lambert({ flatShading: true }),
      ),
      blob: pool(
        'blob',
        geo(new THREE.IcosahedronGeometry(0.5, 0)),
        lambert({ flatShading: true }),
      ),
      glow: pool(
        'glow',
        geo(new THREE.CylinderGeometry(0.32, 0.5, 1, 8)),
        this.own(new THREE.MeshBasicMaterial()),
      ),
      glass: pool(
        'glass',
        geo(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
        lambert({ transparent: true, opacity: 0.72, depthWrite: false }),
        64,
      ),
    };
    this.pools.glass.mesh.renderOrder = 1;
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.owned.push(x);
    return x;
  }

  private readonly m = new THREE.Matrix4();
  private readonly local = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private static readonly UP = new THREE.Vector3(0, 1, 0);

  /** World matrix for `part` placed under `base`. */
  matrixFor(part: Part, base: THREE.Matrix4): THREE.Matrix4 {
    this.q.setFromAxisAngle(Kit.UP, part.rotY ?? 0);
    this.local.compose(this.v.set(...part.pos), this.q, this.s.set(...part.size));
    return this.m.multiplyMatrices(base, this.local);
  }

  place(
    part: Part,
    base: THREE.Matrix4,
    color: THREE.ColorRepresentation = part.color,
  ): PartHandle {
    const id = this.pools[part.pool].alloc(this.matrixFor(part, base), color);
    return { pool: part.pool, id, part };
  }

  recolor(h: PartHandle, color: THREE.ColorRepresentation): void {
    this.pools[h.pool].setColor(h.id, color);
  }

  release(h: PartHandle): void {
    this.pools[h.pool].release(h.id);
  }

  dispose(): void {
    for (const p of Object.values(this.pools)) p.dispose();
    for (const o of this.owned) o.dispose();
  }
}
