import * as THREE from 'three';
import type { Task } from '@dash-iso/shared';
import {
  buildCharacter,
  lookFor,
  poseCharacter,
  type CharacterRig,
  type Look,
} from './character.js';
import { BUBBLE_H, BUBBLE_W, bubbleTexture } from './effects.js';
import { WorkerBrain, type BrainOptions, type WorkerSite } from './worker-fsm.js';

const BUBBLE_WIDTH = 2.2;

/**
 * One slot's worker in the scene: a `WorkerBrain` driving a procedural
 * character, plus a speech bubble with the task while typing. Positions are
 * room-local; `root` lives under the room's group.
 */
export class Worker {
  readonly brain: WorkerBrain;
  readonly rig: CharacterRig;
  readonly root: THREE.Group;
  private bubble: THREE.Sprite | null = null;
  private bubbleKey = '';
  private walkPhase = 0;
  private t = Math.random() * 10;

  constructor(
    readonly runnerId: string,
    readonly slotIndex: number,
    site: WorkerSite,
    opts: BrainOptions,
    private readonly projectName: (id: string) => string,
  ) {
    this.brain = new WorkerBrain(site, opts);
    this.rig = buildCharacter(lookFor(`${runnerId}#${slotIndex}`));
    this.root = this.rig.root;
    this.root.name = `worker-${runnerId}-${slotIndex}`;
    this.root.userData.worker = this;
    this.sync(0);
  }

  get look(): Look {
    return this.rig.look;
  }

  get name(): string {
    return this.look.name;
  }

  /** Bubble stagger so neighbouring desks' bubbles don't overlap. */
  private get bubbleY(): number {
    return 1.55 + (this.slotIndex % 2) * 0.42;
  }

  /** Refresh the bubble if the task's title or project changed. */
  refreshTask(): void {
    this.updateBubble(this.brain.task);
  }

  update(dt: number): void {
    this.t += dt;
    this.brain.update(dt);
    this.sync(dt);
  }

  private sync(dt: number): void {
    const b = this.brain;
    this.root.position.set(b.pos.x, 0, b.pos.z);
    this.root.rotation.y = b.facing;
    this.root.visible = b.mode !== 'gone';

    if (b.moving) {
      this.walkPhase += dt * 9;
      poseCharacter(this.rig, { kind: 'walk', phase: this.walkPhase });
    } else if (b.mode === 'sittingDown') {
      poseCharacter(this.rig, { kind: 'sit', amount: b.progress, typing: false, t: this.t });
    } else if (b.mode === 'gettingUp') {
      poseCharacter(this.rig, { kind: 'sit', amount: 1 - b.progress, typing: false, t: this.t });
    } else if (b.mode === 'typing') {
      poseCharacter(this.rig, { kind: 'sit', amount: 1, typing: true, t: this.t });
    } else if (b.mode === 'idle' && b.activity === 'cooler') {
      poseCharacter(this.rig, { kind: 'drink', t: b.timeInMode });
    } else if (b.mode === 'idle' && b.activity === 'chat') {
      poseCharacter(this.rig, { kind: 'talk', t: this.t, seed: this.slotIndex });
    } else {
      poseCharacter(this.rig, { kind: 'stand', t: this.t });
    }

    const showBubble = b.busy && (b.mode === 'typing' || b.mode === 'sittingDown');
    this.updateBubble(showBubble ? b.task : null, showBubble);
    if (this.bubble) {
      // Gentle bob; counter the root's rotation/scale so it hangs straight above the head.
      this.bubble.position.set(
        0,
        (this.bubbleY + Math.sin(this.t * 2) * 0.03) / this.look.height,
        0,
      );
    }
  }

  private updateBubble(task: Task | null, show = !!task): void {
    if (!show) {
      if (this.bubble) this.bubble.visible = false;
      return;
    }
    const title = task?.title ?? 'Working…';
    const project = task ? this.projectName(task.project) : '';
    const key = `${title}\n${project}\n${task?.project ?? ''}`;
    if (!this.bubble) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthTest: false });
      this.bubble = new THREE.Sprite(mat);
      this.bubble.name = 'bubble';
      this.bubble.renderOrder = 3;
      this.bubble.center.set(0.5, 0);
      const s = BUBBLE_WIDTH / this.look.height;
      this.bubble.scale.set(s, (s * BUBBLE_H) / BUBBLE_W, 1);
      this.root.add(this.bubble);
    }
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      const mat = this.bubble.material;
      mat.map?.dispose();
      mat.map = bubbleTexture(title, project || 'Task', task?.project ?? '');
      mat.needsUpdate = true;
    }
    this.bubble.visible = true;
  }

  /** World position just above the worker, for outcome effects. */
  effectAnchor(target = new THREE.Vector3()): THREE.Vector3 {
    target.set(this.brain.pos.x, 0.9, this.brain.pos.z);
    const parent = this.root.parent;
    if (!parent) return target;
    parent.updateWorldMatrix(true, false);
    return parent.localToWorld(target);
  }

  /** Bubble sprites are raycast-hit too; ignore them for picking. */
  get pickables(): THREE.Object3D[] {
    return this.root.children.filter((c) => c !== this.bubble);
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    if (this.bubble) {
      this.bubble.material.map?.dispose();
      this.bubble.material.dispose();
    }
  }
}
