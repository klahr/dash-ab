import * as THREE from 'three';
import { mockSnapshot, type Task, type WorldState } from '@dash-iso/shared';
import { IsoCameraRig } from './camera.js';
import { ChatPanel } from './chat.js';
import { Controls } from './input.js';
import { RoomPanel } from './panel.js';
import { aimSun, createScene } from './scene.js';
import { BridgeConnection } from './socket.js';
import { Store } from './store.js';
import { WorkerPanel } from './worker-panel.js';
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
const workerPanel = new WorkerPanel(document.body, () => {});

// Data source: the bridge by default (`npm run dev:mock` for the simulator);
// `?fixture` uses the static mock fixture with dev keys instead.
const params = new URLSearchParams(location.search);
const fixtureMode = params.has('fixture');
const store = new Store();

const askPm = document.getElementById('ask-pm')!;
let send: ((text: string) => boolean) | null = null;
const chat = new ChatPanel(document.body, {
  onSend: (text) => send?.(text) ?? false,
  onPending: (pending) => {
    world.pm.setThinking(pending);
    askPm.classList.toggle('busy', pending);
  },
});
askPm.addEventListener('click', () => chat.toggle());
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.code === 'KeyC' && !e.metaKey && !e.ctrlKey && !e.altKey) chat.toggle();
});

let state: WorldState = mockSnapshot();
let link = fixtureMode ? 'fixture data' : 'connecting…';
let applied = -1;

function applyState(next: WorldState): void {
  const first = world.roomCount === 0;
  state = next;
  world.update(state);
  const b = world.bounds;
  rig.setBounds(b.minX, b.minZ, b.maxX, b.maxZ);
  if (first && world.roomCount > 0) rig.lookAt((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2);
  panel.refresh(state);
  if (panel.shownId === null && world.selected) world.select(null);
  refreshWorkerPanel();
  updateStatus();
}

function updateStatus(): void {
  const busy = state.runners.reduce(
    (n, r) => n + r.slots.filter((s) => s.state === 'working').length,
    0,
  );
  const slots = state.runners.reduce((n, r) => n + r.slots.length, 0);
  status.textContent = `${state.org.name} · ${state.runners.length} runner(s) · ${busy}/${slots} busy · ${link}`;
}

function refreshWorkerPanel(): void {
  const ref = workerPanel.shown;
  if (ref) workerPanel.refresh(world.worker(ref.runnerId, ref.slot), state);
}

const raycaster = new THREE.Raycaster();
function pickWorker(ndc: THREE.Vector2) {
  raycaster.setFromCamera(ndc, rig.camera);
  return world.workerAt(raycaster);
}

function pick(ndc: THREE.Vector2): string | null {
  const p = rig.groundPoint(ndc);
  return p ? world.roomAt(p.x, p.z) : null;
}

const controls = new Controls(renderer.domElement, rig, {
  onClick: (ndc) => {
    const ground = rig.groundPoint(ndc);
    if (world.pickPm(ndc, rig.camera) || (ground && world.pmOfficeAt(ground.x, ground.z))) {
      chat.open();
      return;
    }
    const worker = pickWorker(ndc);
    if (worker) {
      world.select(worker.runnerId);
      panel.hide();
      workerPanel.show({ runnerId: worker.runnerId, slot: worker.slotIndex }, worker, state);
      return;
    }
    workerPanel.hide();
    const id = pick(ndc);
    world.select(id);
    const runner = id ? world.runner(id) : undefined;
    if (runner) panel.show(runner, state);
    else panel.hide();
  },
  onHover: (ndc) => {
    const ground = rig.groundPoint(ndc);
    const overPm =
      world.pickPm(ndc, rig.camera) || (ground && world.pmOfficeAt(ground.x, ground.z));
    renderer.domElement.style.cursor = overPm || pickWorker(ndc) || pick(ndc) ? 'pointer' : '';
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
if (fixtureMode) store.setState(state);

const clock = new THREE.Clock();
let panelTimer = 0;
let shownChat = store.chat;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  // Deltas arrive one message each; apply them to the scene at most once per frame.
  if (store.state && store.version !== applied) {
    applied = store.version;
    applyState(store.state);
  }
  if (store.chat !== shownChat) {
    shownChat = store.chat;
    chat.setMessages(shownChat);
  }
  controls.update(dt);
  rig.update(dt);
  aimSun(sun, rig.target, rig.currentAngle);
  world.tick(clock.elapsedTime);
  if ((panelTimer += dt) > 0.25) {
    panelTimer = 0;
    refreshWorkerPanel();
  }
  renderer.render(scene, rig.camera);
});

if (!fixtureMode) {
  const url = import.meta.env.VITE_BRIDGE_URL ?? 'ws://localhost:8787';
  const conn = new BridgeConnection(url, store, {
    onStatus: (s) => {
      link =
        s.kind === 'open'
          ? 'live'
          : s.kind === 'connecting'
            ? s.attempt > 1
              ? `reconnecting (attempt ${s.attempt})…`
              : 'connecting…'
            : `bridge offline, retrying in ${Math.ceil(s.retryInMs / 1000)}s (run \`npm run dev:mock\`)`;
      if (store.state) updateStatus();
      else status.textContent = link;
    },
  });
  send = (text) => conn.send({ type: 'chat.send', text });
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
      store.setState({ ...state, runners: [...state.runners, runner] });
    } else if (e.code === 'KeyX') {
      store.setState({ ...state, runners: state.runners.slice(0, -1) });
    } else if (e.code === 'KeyO' && world.selected) {
      const id = world.selected;
      store.setState({
        ...state,
        runners: state.runners.map((r) => (r.id === id ? { ...r, online: !r.online } : r)),
      });
    } else if (e.code === 'KeyT' && world.selected) {
      store.setState(cycleTask(state, world.selected));
    } else if (e.code === 'KeyY' && world.selected) {
      const id = world.selected;
      store.setState({
        ...state,
        runners: state.runners.map((r) =>
          r.id !== id
            ? r
            : e.shiftKey
              ? { ...r, slots: r.slots.slice(0, -1) }
              : { ...r, slots: [...r.slots, { index: r.slots.length, state: 'idle' as const }] },
        ),
      });
    }
  });
}

let fakeTasks = 0;
/**
 * Fixture-mode helper: give the selected runner's first free slot a new task,
 * or (when all are busy) finish one, alternating success and failure.
 */
function cycleTask(s: WorldState, runnerId: string): WorldState {
  const runner = s.runners.find((r) => r.id === runnerId);
  if (!runner || runner.slots.length === 0) return s;
  const free = runner.slots.find((sl) => !sl.task);
  let tasks = s.tasks;
  let slots = runner.slots;
  if (free) {
    const project = s.projects[fakeTasks % s.projects.length]!;
    const task: Task = {
      id: `fake-${++fakeTasks}`,
      title: `Fixture task #${fakeTasks}`,
      project: project.id,
      status: 'in_progress',
    };
    tasks = [...tasks, task];
    slots = slots.map((sl) => (sl === free ? { ...sl, state: 'working', task } : sl));
  } else {
    const done = slots[fakeTasks % slots.length]!;
    const status = fakeTasks++ % 2 ? 'failed' : 'review';
    tasks = tasks.map((t) => (t.id === done.task?.id ? { ...t, status } : t));
    slots = slots.map((sl) => (sl === done ? { index: sl.index, state: 'idle' } : sl));
  }
  return {
    ...s,
    tasks,
    runners: s.runners.map((r) => (r.id === runnerId ? { ...r, slots } : r)),
  };
}
