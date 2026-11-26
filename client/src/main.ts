import * as THREE from 'three';
import { createIsoCamera, createScene } from './scene.js';
import { connect } from './socket.js';

const app = document.getElementById('app')!;
const status = document.getElementById('status')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
app.appendChild(renderer.domElement);

const scene = createScene();
let camera = createIsoCamera(1);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera = createIsoCamera(w / h);
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  scene.children.forEach((o, i) => {
    if (o.name.startsWith('placeholder')) o.rotation.y = t / 1000 + i;
  });
  renderer.render(scene, camera);
});

const url = import.meta.env.VITE_BRIDGE_URL ?? 'ws://localhost:8787';
const conn = connect(url, (s) => {
  status.textContent = s.state
    ? `${s.state.org.name}: ${s.state.runners.length} runner(s), ${s.state.tasks.length} task(s)`
    : 'waiting for snapshot…';
});
conn.ws.onopen = () => (status.textContent = 'connected');
conn.ws.onclose = () => (status.textContent = 'bridge offline (run `npm run dev`)');
