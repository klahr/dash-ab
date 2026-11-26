import { describe, expect, it } from 'vitest';
import { createIsoCamera, createScene } from './scene.js';

describe('scene', () => {
  it('uses an orthographic camera looking at origin from equal axes', () => {
    const cam = createIsoCamera(16 / 9);
    expect(cam.isOrthographicCamera).toBe(true);
    expect(cam.position.x).toBe(cam.position.y);
    expect(cam.position.y).toBe(cam.position.z);
  });

  it('contains placeholder cubes', () => {
    expect(createScene().getObjectByName('placeholder-0')).toBeDefined();
  });
});
