import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { IsoCameraRig } from './camera.js';

describe('IsoCameraRig', () => {
  it('uses an orthographic camera at the classic isometric angle', () => {
    const rig = new IsoCameraRig(16 / 9);
    const p = rig.camera.position;
    expect(rig.camera.isOrthographicCamera).toBe(true);
    expect(p.x).toBeCloseTo(p.y, 5);
    expect(p.y).toBeCloseTo(p.z, 5);
  });

  it('rotates in animated 90° steps around the target', () => {
    const rig = new IsoCameraRig(1);
    rig.lookAt(5, 5);
    rig.rotate(1);
    expect(rig.step).toBe(1);
    for (let i = 0; i < 200 && rig.update(1 / 60); i++);
    const p = rig.camera.position;
    // Step 1: camera on the +x / -z side of the target.
    expect(p.x - 5).toBeGreaterThan(0);
    expect(p.z - 5).toBeLessThan(0);
    expect(Math.abs(p.x - 5)).toBeCloseTo(Math.abs(p.z - 5), 3);
  });

  it('pans so the ground point under the centre moves with the drag', () => {
    const rig = new IsoCameraRig(1, 10);
    const before = rig.groundPoint(new THREE.Vector2(0, 0))!;
    rig.panScreen(2, 0);
    const after = rig.groundPoint(new THREE.Vector2(0, 0))!;
    // Screen-right at step 0 is (+x, -z) on the ground.
    expect(after.x - before.x).toBeGreaterThan(0);
    expect(after.z - before.z).toBeLessThan(0);
    expect(after.distanceTo(before)).toBeCloseTo(2, 3);
  });

  it('zooms toward the cursor and respects limits and bounds', () => {
    const rig = new IsoCameraRig(1, 10);
    const ndc = new THREE.Vector2(0.5, 0.5);
    const before = rig.groundPoint(ndc)!;
    rig.zoom(0.5, ndc);
    expect(rig.viewSize).toBe(5);
    expect(rig.groundPoint(ndc)!.distanceTo(before)).toBeLessThan(1e-6);
    rig.zoom(1000);
    expect(rig.viewSize).toBe(rig.maxView);
    rig.setBounds(0, 0, 10, 10);
    rig.panScreen(1000, 0);
    expect(rig.target.x).toBeLessThanOrEqual(10);
    expect(rig.target.z).toBeGreaterThanOrEqual(0);
  });
});
