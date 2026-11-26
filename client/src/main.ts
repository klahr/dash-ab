import * as THREE from 'three';
import { mockSnapshot, type WorldState } from '@dash-iso/shared';
import { IsoCameraRig } from './camera.js';
import { Controls } from './input.js';
import { RoomPanel } from './panel.js';
import { aimSun, createScene } from './scene.js';
import { connect } from './socket.js';
import { World } from './world/world.js';

const app = document.getElementById('app')!;
const status = document.getElementById('status')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const { scene, sun } = createScene();
const world = new World();
scene.add(world.root);

const rig = new IsoCameraRig(1);
const panel = new RoomPanel(document.body, () => world.select(null));

let state: WorldState = mockSnapshot();

function applyState(next: WorldState): void {
  const first = world.roomCount === 0;
  state = next;
  world.update(state);
  const { width, depth } = world.extent;
  rig.setBounds(0, 0, width, depth);
  if (first) rig.lookAt(width / 2, depth / 2);
  panel.refresh(state);
  if (panel.shownId === null && world.selected) world.select(null);
  status.textContent = `${state.org.name} · ${state.runners.length} runner(s)`;
}

function pick(ndc: THREE.Vector2): string | null {
  const p = rig.groundPoint(ndc);
  return p ? world.roomAt(p.x, p.z) : null;
}

const controls = new Controls(renderer.domElement, rig, {
  onClick: (ndc) => {
    const id = pick(ndc);
    world.select(id);
    const runner = id ? world.runner(id) : undefined;
    if (runner) panel.show(runner, state);
    else panel.hide();
  },
  onHover: (ndc) => {
    renderer.domElement.style.cursor = pick(ndc) ? 'pointer' : '';
  },
  onRotate: (step) => world.setViewRotation(step),
});

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  rig.setAspect(w / h);
}
window.addEventListener('resize', resize);
resize();
applyState(state);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update(dt);
  rig.update(dt);
  aimSun(sun, rig.target, rig.currentAngle);
  world.tick(clock.elapsedTime);
  renderer.render(scene, rig.camera);
});

// Data source: mock fixture by default; `?live` switches to the bridge.
const params = new URLSearchParams(location.search);
if (params.has('live')) {
  const url = import.meta.env.VITE_BRIDGE_URL ?? 'ws://localhost:8787';
  status.textContent = 'connecting…';
  const conn = connect(url, (s) => s.state && applyState(s.state));
  conn.ws.onclose = () => (status.textContent = 'bridge offline (run `npm run dev`)');
} else {
  // Dev helpers to exercise dynamic rooms against the mock data.
  let added = 0;
  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'KeyN') {
      added++;
      const runner = {
        id: `runner-new-${added}`,
        name: `new-${added}`,
        online: true,
        slots: [{ index: 0, state: 'idle' as const }],
      };
      applyState({ ...state, runners: [...state.runners, runner] });
    } else if (e.code === 'KeyX') {
      applyState({ ...state, runners: state.runners.slice(0, -1) });
    } else if (e.code === 'KeyO' && world.selected) {
      const id = world.selected;
      applyState({
        ...state,
        runners: state.runners.map((r) => (r.id === id ? { ...r, online: !r.online } : r)),
      });
    }
  });
}
