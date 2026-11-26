import * as THREE from 'three';

/**
 * Click targets for the Dash features drawn in the office (reception queue,
 * review office, goals noticeboard, project banners). Scene objects are
 * tagged with a target; `featureFromHit` resolves a raycast hit to one.
 */

/** What a click in the north wing (or on a banner) points at. */
export type FeatureTarget =
  | { kind: 'queue'; taskId?: string }
  | { kind: 'review'; section?: ReviewSection; taskId?: string }
  | { kind: 'goals'; goalId?: string }
  | { kind: 'project'; id: string };

export type ReviewSection = 'review' | 'merging' | 'merged' | 'failed';

/** Tag an object so `featureFromHit` can find what it stands for. */
export function tagFeature(
  o: THREE.Object3D,
  target: FeatureTarget | ((hit: THREE.Intersection) => FeatureTarget | null),
): void {
  o.userData.feature = target;
}

/** The feature an intersection belongs to (walking up the parents), if any. */
export function featureFromHit(hit: THREE.Intersection): FeatureTarget | null {
  let o: THREE.Object3D | null = hit.object;
  while (o) {
    const f = o.userData.feature as
      FeatureTarget | ((h: THREE.Intersection) => FeatureTarget | null) | undefined;
    if (typeof f === 'function') return f(hit);
    if (f) return f;
    o = o.parent;
  }
  return null;
}

/** An invisible box that only exists to be clicked. */
export function hotspot(
  size: [number, number, number],
  pos: [number, number, number],
  target: FeatureTarget,
): THREE.Mesh {
  const m = new THREE.Mesh(HOTSPOT_GEO, HOTSPOT_MAT);
  m.scale.set(...size);
  m.position.set(pos[0], pos[1] + size[1] / 2, pos[2]);
  m.name = `hotspot-${target.kind}`;
  tagFeature(m, target);
  return m;
}
const HOTSPOT_GEO = new THREE.BoxGeometry(1, 1, 1);
const HOTSPOT_MAT = new THREE.MeshBasicMaterial({ visible: false });
