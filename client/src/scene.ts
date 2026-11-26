import * as THREE from 'three';

export interface OfficeScene {
  scene: THREE.Scene;
  /** Key light; call `aimSun` each frame so shading stays consistent while rotating. */
  sun: THREE.DirectionalLight;
}

/** Scene with sky colour and cheerful flat lighting (no shadows, for speed). */
export function createScene(): OfficeScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c7e8);
  scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6c7fa6, 1.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  scene.add(sun, sun.target);
  return { scene, sun };
}

/** Keep the key light up and to the camera's left, relative to `target`. */
export function aimSun(sun: THREE.DirectionalLight, target: THREE.Vector3, angle: number): void {
  const a = angle + 0.7;
  sun.position.set(target.x + Math.sin(a) * 20, 30, target.z + Math.cos(a) * 20);
  sun.target.position.copy(target);
}
