import * as THREE from 'three';

/** Orthographic camera at the classic isometric angle looking at the origin. */
export function createIsoCamera(aspect: number, viewSize = 10): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(
    -viewSize * aspect,
    viewSize * aspect,
    viewSize,
    -viewSize,
    0.1,
    100,
  );
  cam.position.set(10, 10, 10);
  cam.lookAt(0, 0, 0);
  return cam;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1e27);
  scene.add(new THREE.GridHelper(20, 20, 0x4a5068, 0x2d3140));
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 10, 3);
  scene.add(sun);

  const colors = [0x6aa9ff, 0x7be0a0, 0xffc66a];
  colors.forEach((c, i) => {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 1.5),
      new THREE.MeshStandardMaterial({ color: c }),
    );
    cube.position.set((i - 1) * 3, 0.75, 0);
    cube.name = `placeholder-${i}`;
    scene.add(cube);
  });
  return scene;
}
