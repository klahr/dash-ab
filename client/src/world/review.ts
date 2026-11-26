import * as THREE from 'three';
import type { Task, TaskStatus, WorldState } from '@dash-iso/shared';
import { buildCharacter, lookFor, poseCharacter, type CharacterRig } from './character.js';
import { featureFromHit, hotspot, type FeatureTarget, type ReviewSection } from './features.js';
import type { Kit, Part, PartHandle } from './instancing.js';
import { COLORS, type RoomTheme } from './palette.js';
import { projectHex } from './projects.js';
import * as P from './props.js';
import { BUBBLE_ASPECT, bubbleTexture } from './textures.js';
import { PartSet, REVIEW_OFFICE, WingBuilding } from './wing.js';

/**
 * Review office. Tasks in review pile up as folders in the reviewer's inbox
 * tray; merging tasks sit in the outbox; merged tasks become trophies on the
 * trophy shelf; failed tasks are crumpled paper in the repair bin. Folders,
 * trophies and paper take their project's colour.
 */

export const REVIEW_THEME: RoomTheme = {
  floorA: 0xc8e6c9,
  floorB: 0xa5d6a7,
  accent: 0x2e7d32,
  furniture: 0x6d4c41,
};

export const SECTION_STATUS: Record<ReviewSection, TaskStatus> = {
  review: 'review',
  merging: 'merging',
  merged: 'merged',
  failed: 'failed',
};

export const SECTION_LABEL: Record<ReviewSection, string> = {
  review: 'In review',
  merging: 'Merging',
  merged: 'Merged',
  failed: 'Repair',
};

/** How many props each station shows at most (the label has the full count). */
export const CAPS: Record<ReviewSection, number> = {
  review: 12,
  merging: 8,
  merged: 18,
  failed: 10,
};

/** Tasks per section, filtered by project. */
export function reviewSections(
  state: WorldState,
  filter: string | null,
): Record<ReviewSection, Task[]> {
  const pick = (s: TaskStatus) =>
    state.tasks.filter((t) => t.status === s && (filter === null || t.project === filter));
  return {
    review: pick('review'),
    merging: pick('merging'),
    merged: pick('merged'),
    failed: pick('failed'),
  };
}

// Station positions (office-local).
const DESK = { x: 5.0, z: 2.75 };
const INBOX = { x: DESK.x + 0.65, y: 0.56, z: DESK.z };
const OUTBOX = { x: DESK.x - 0.65, y: 0.56, z: DESK.z };
const SHELF = { x: 7.5, z: 0.43 };
const BIN = { x: 8.3, z: 5.3 };

function tray(): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [0.5, 0.03, 0.38], color: COLORS.metalDark },
    { pool: 'box', pos: [0, 0, -0.18], size: [0.5, 0.09, 0.02], color: COLORS.metalDark },
    { pool: 'box', pos: [-0.24, 0, 0], size: [0.02, 0.09, 0.38], color: COLORS.metalDark },
    { pool: 'box', pos: [0.24, 0, 0], size: [0.02, 0.09, 0.38], color: COLORS.metalDark },
  ];
}

/** A stack of folders, one per task, bottom first. */
export function folderStack(tasks: readonly Task[], cap: number): Part[] {
  return tasks.slice(0, cap).flatMap((t, i) => {
    const y = 0.03 + i * 0.04;
    const rot = (((i * 53) % 9) - 4) * 0.03;
    const c = projectHex(t.project);
    return [
      { pool: 'box', pos: [0, y, 0], size: [0.42, 0.032, 0.3], rotY: rot, color: c },
      // Paper peeking out and a white label tab.
      {
        pool: 'box',
        pos: [0.02, y + 0.008, 0.01],
        size: [0.38, 0.02, 0.3],
        rotY: rot,
        color: COLORS.white,
      },
      {
        pool: 'box',
        pos: [-0.12, y + 0.02, 0.15],
        size: [0.12, 0.016, 0.03],
        rotY: rot,
        color: COLORS.white,
      },
    ] satisfies Part[];
  });
}

/** Open-fronted shelf unit (back panel, sides, three shelves). */
function trophyShelf(): Part[] {
  const parts: Part[] = [
    { pool: 'box', pos: [0, 0, -0.19], size: [2.3, 1.9, 0.05], color: 0x3b2a1a },
    { pool: 'box', pos: [-1.12, 0, 0], size: [0.07, 1.9, 0.42], color: COLORS.woodDark },
    { pool: 'box', pos: [1.12, 0, 0], size: [0.07, 1.9, 0.42], color: COLORS.woodDark },
    { pool: 'box', pos: [0, 1.86, 0], size: [2.3, 0.06, 0.42], color: COLORS.woodDark },
  ];
  for (let i = 0; i < 3; i++)
    parts.push({
      pool: 'box',
      pos: [0, 0.08 + i * 0.6, 0],
      size: [2.18, 0.05, 0.4],
      color: COLORS.wood,
    });
  return parts;
}

/** Trophies on the shelf: three rows of six gold cups on project-coloured plinths. */
export function trophies(tasks: readonly Task[], cap: number): Part[] {
  return tasks.slice(0, cap).flatMap((t, i) => {
    const row = Math.floor(i / 6);
    const x = -0.9 + (i % 6) * 0.36;
    const y = 0.13 + row * 0.6;
    return [
      { pool: 'box', pos: [x, y, 0.05], size: [0.2, 0.08, 0.2], color: projectHex(t.project) },
      { pool: 'cyl', pos: [x, y + 0.08, 0.05], size: [0.05, 0.1, 0.05], color: 0xc9a227 },
      { pool: 'taper', pos: [x, y + 0.18, 0.05], size: [0.2, 0.2, 0.2], color: 0xf2b632 },
    ] satisfies Part[];
  });
}

function repairBin(): Part[] {
  return [
    { pool: 'taper', pos: [0, 0, 0], size: [0.9, 0.75, 0.9], color: COLORS.red },
    { pool: 'cyl', pos: [0, 0.73, 0], size: [0.92, 0.05, 0.92], color: 0x8c1d1d },
    // A spanner leaning on the side.
    { pool: 'box', pos: [0.5, 0, 0.2], size: [0.06, 0.6, 0.04], rotY: 0.3, color: COLORS.metal },
    { pool: 'box', pos: [0.5, 0.58, 0.2], size: [0.16, 0.1, 0.05], rotY: 0.3, color: COLORS.metal },
  ];
}

/** Crumpled paper heaped in (and over) the bin. */
export function crumpled(tasks: readonly Task[], cap: number): Part[] {
  return tasks.slice(0, cap).map((t, i) => {
    const a = i * 2.4;
    const r = i < 5 ? 0.22 : 0.12;
    const y = 0.55 + Math.floor(i / 5) * 0.13;
    return {
      pool: 'blob',
      pos: [Math.cos(a) * r, y, Math.sin(a) * r],
      size: [0.26, 0.22, 0.26],
      color: projectHex(t.project),
    } satisfies Part;
  });
}

function officeProps(): Part[] {
  const T = 0.22;
  const parts: Part[] = [];
  const add = (p: Part[]) => parts.push(...p);
  add(P.placed(P.rug(4.2, 3.0, 0xe8f5e9, REVIEW_THEME.accent), DESK.x, 3.0));
  add(P.placed(P.desk(2.2, 1), DESK.x, DESK.z, Math.PI));
  add(P.placed(P.chair(REVIEW_THEME.furniture), DESK.x, DESK.z - 0.62, Math.PI));
  add(P.placed(tray(), INBOX.x, INBOX.z, 0, INBOX.y));
  add(P.placed(tray(), OUTBOX.x, OUTBOX.z, 0, OUTBOX.y));
  add(P.placed(trophyShelf(), SHELF.x, SHELF.z));
  add(P.placed(P.filingCabinet(0x4f7a52), 5.0, T + 0.3));
  add(P.placed(P.filingCabinet(0x4f7a52), 5.6, T + 0.3));
  add(P.placed(P.bookshelf(4), T + 0.21, 3.0, Math.PI / 2));
  add(P.placed(repairBin(), BIN.x, BIN.z));
  add(P.placed(P.plant(1.1), T + 0.5, T + 0.5));
  add(P.placed(P.plant(0.9), REVIEW_OFFICE.w - T - 0.5, REVIEW_OFFICE.d - T - 0.5));
  add(P.placed(P.floorLamp(), REVIEW_OFFICE.w - T - 0.35, 2.4));
  add(P.placed(P.rug(1.2, 0.7, COLORS.woodDark, COLORS.wood), 2.0, REVIEW_OFFICE.d + 0.45));
  return parts;
}

const LABEL_W = 2.3;

/** The review office: building, stations, reviewer and count labels. */
export class ReviewOffice {
  readonly building: WingBuilding;
  readonly group = new THREE.Group();
  private readonly statics: PartHandle[];
  private readonly piles: Record<ReviewSection, PartSet>;
  private readonly labels = {} as Record<ReviewSection, THREE.Sprite>;
  private readonly labelText = {} as Record<ReviewSection, string>;
  private readonly hotspots: THREE.Mesh[] = [];
  readonly reviewer: CharacterRig;
  private counts: Record<ReviewSection, number> = { review: 0, merging: 0, merged: 0, failed: 0 };
  private t = 0;

  constructor(
    private readonly kit: Kit,
    private readonly parent: THREE.Object3D,
    step: number,
  ) {
    const R = REVIEW_OFFICE;
    this.building = new WingBuilding(kit, parent, R, REVIEW_THEME, 'Review', step);
    const base = this.building.matrix;
    this.statics = officeProps().map((p) => kit.place(p, base));
    this.group.name = 'review-office';
    this.group.position.set(R.x0, 0, R.z0);
    parent.add(this.group);

    // Folder piles sit in the trays, trophies on the shelf, paper in the bin.
    const at = (x: number, y: number, z: number) =>
      new THREE.Matrix4().multiplyMatrices(base, new THREE.Matrix4().makeTranslation(x, y, z));
    this.piles = {
      review: new PartSet(kit, at(INBOX.x, INBOX.y, INBOX.z)),
      merging: new PartSet(kit, at(OUTBOX.x, OUTBOX.y, OUTBOX.z)),
      merged: new PartSet(kit, at(SHELF.x, 0, SHELF.z)),
      failed: new PartSet(kit, at(BIN.x, 0, BIN.z)),
    };

    const spots: Record<
      ReviewSection,
      { pos: [number, number, number]; size: [number, number, number]; label: number }
    > = {
      review: { pos: [INBOX.x, 0, INBOX.z], size: [0.6, 1.2, 0.6], label: 1.75 },
      merging: { pos: [OUTBOX.x, 0, OUTBOX.z], size: [0.6, 1.2, 0.6], label: 1.35 },
      merged: { pos: [SHELF.x, 0, SHELF.z + 0.1], size: [2.3, 1.9, 0.6], label: 2.4 },
      failed: { pos: [BIN.x, 0, BIN.z], size: [1.0, 1.2, 1.0], label: 1.6 },
    };
    for (const section of Object.keys(spots) as ReviewSection[]) {
      const s = spots[section];
      const h = hotspot(s.size, s.pos, { kind: 'review', section });
      this.hotspots.push(h);
      this.group.add(h);
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthTest: false }),
      );
      label.name = `label-${section}`;
      label.scale.set(LABEL_W, LABEL_W / BUBBLE_ASPECT, 1);
      label.position.set(s.pos[0], s.label, s.pos[2]);
      label.renderOrder = 3;
      label.userData.feature = { kind: 'review', section } satisfies FeatureTarget;
      this.labels[section] = label;
      this.group.add(label);
    }

    this.reviewer = buildCharacter(lookFor('reviewer:review-office'));
    this.reviewer.root.name = 'reviewer';
    this.reviewer.root.position.set(DESK.x, 0, DESK.z - 0.62);
    this.reviewer.root.userData.feature = {
      kind: 'review',
      section: 'review',
    } satisfies FeatureTarget;
    this.group.add(this.reviewer.root);
  }

  /** Counts per section after the last sync (filtered). */
  get sectionCounts(): Readonly<Record<ReviewSection, number>> {
    return this.counts;
  }

  /** Number of props currently shown for a section. */
  propCount(section: ReviewSection): number {
    return this.piles[section].size;
  }

  sync(state: WorldState, filter: string | null): void {
    const sections = reviewSections(state, filter);
    const key = (ts: Task[], cap: number) =>
      ts
        .slice(0, cap)
        .map((t) => t.project)
        .join(',');
    this.piles.review.set(key(sections.review, CAPS.review), () =>
      folderStack(sections.review, CAPS.review),
    );
    this.piles.merging.set(key(sections.merging, CAPS.merging), () =>
      folderStack(sections.merging, CAPS.merging),
    );
    this.piles.merged.set(key(sections.merged, CAPS.merged), () =>
      trophies(sections.merged, CAPS.merged),
    );
    this.piles.failed.set(key(sections.failed, CAPS.failed), () =>
      crumpled(sections.failed, CAPS.failed),
    );
    for (const section of Object.keys(sections) as ReviewSection[]) {
      const n = sections[section].length;
      this.counts[section] = n;
      const text = `${SECTION_LABEL[section]}: ${n}`;
      const label = this.labels[section];
      // Empty outbox / bin: no label clutter.
      label.visible = n > 0 || section === 'review' || section === 'merged';
      if (text === this.labelText[section]) continue;
      this.labelText[section] = text;
      label.material.map?.dispose();
      label.material.map = bubbleTexture(text);
      label.material.needsUpdate = true;
    }
  }

  tick(dt: number): void {
    this.t += dt;
    const busy = this.counts.review > 0;
    poseCharacter(this.reviewer, { kind: 'sit', amount: 1, typing: busy, t: this.t });
    if (!busy) this.reviewer.head.rotation.y = Math.sin(this.t * 0.6) * 0.5;
  }

  get pickables(): THREE.Object3D[] {
    return [
      ...Object.values(this.labels).filter((l) => l.visible),
      ...this.hotspots,
      this.reviewer.root,
    ];
  }

  pick(ray: THREE.Raycaster): FeatureTarget | null {
    for (const hit of ray.intersectObjects(this.pickables, true)) {
      const f = featureFromHit(hit);
      if (f) return f;
    }
    return null;
  }

  setViewRotation(step: number): void {
    this.building.setViewRotation(step);
  }

  dispose(): void {
    for (const h of this.statics) this.kit.release(h);
    for (const p of Object.values(this.piles)) p.dispose();
    for (const l of Object.values(this.labels)) {
      l.material.map?.dispose();
      l.material.dispose();
    }
    this.building.dispose();
    this.parent.remove(this.group);
  }
}
