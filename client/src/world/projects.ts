import * as THREE from 'three';
import type { Project } from '@dash-iso/shared';
import { makeCanvas, roundRect, toTexture } from './textures.js';
import { tagFeature } from './features.js';

/**
 * Project colours. Every project gets a stable, cheerful hue from its id; that
 * colour shows up on worker badges, visitors' shirts, folders, trophies,
 * noticeboard cards and the lobby banners.
 */

function hue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** CSS colour for a project id. */
export function projectCss(id: string): string {
  return `hsl(${hue(id)}, 70%, 42%)`;
}

const tmp = new THREE.Color();
/** Hex colour (sRGB) for a project id, for scene materials and instances. */
export function projectHex(id: string): number {
  return tmp.setHSL(hue(id) / 360, 0.7, 0.42, THREE.SRGBColorSpace).getHex(THREE.SRGBColorSpace);
}

/** True when `projectId` passes the HUD's project filter (null = all). */
export function matchesFilter(projectId: string, filter: string | null): boolean {
  return filter === null || projectId === filter;
}

const FLAG_W = 1.0;
const FLAG_H = 0.7;
const POLE_H = 2.3;

function flagTexture(name: string, color: string): THREE.Texture {
  const w = 256;
  const h = Math.round((w * FLAG_H) / FLAG_W);
  const c = makeCanvas(w, h);
  if (c) {
    const { ctx } = c;
    // Swallow-tail pennant.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w - 36, h / 2);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#f2b632';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    roundRect(ctx, 14, 14, w - 70, 22, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = name.toUpperCase();
    let px = 46;
    do {
      ctx.font = `bold ${px}px "Trebuchet MS", Verdana, sans-serif`;
      px -= 2;
    } while (px > 14 && ctx.measureText(label).width > w - 70);
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(label, (w - 30) / 2, h / 2 + 4);
    ctx.fillText(label, (w - 30) / 2, h / 2 + 4);
  }
  return toTexture(c);
}

const POLE_GEO = new THREE.CylinderGeometry(0.035, 0.035, POLE_H, 6).translate(0, POLE_H / 2, 0);
const FOOT_GEO = new THREE.CylinderGeometry(0.2, 0.24, 0.08, 8).translate(0, 0.04, 0);
const KNOB_GEO = new THREE.SphereGeometry(0.07, 8, 6);
const FLAG_GEO = new THREE.PlaneGeometry(FLAG_W, FLAG_H).translate(FLAG_W / 2, -FLAG_H / 2, 0);
const BRASS = new THREE.MeshLambertMaterial({ color: 0xc9a227 });

/**
 * One banner per project on a brass pole, in a row (local x grows by `pitch`).
 * Clicking a banner opens that project's overlay. Rebuilt when the project
 * list or the filter changes; filtered-out projects' flags are furled grey.
 */
export class ProjectBanners {
  readonly group = new THREE.Group();
  private key = '';
  private t = 0;
  private flags: THREE.Mesh[] = [];

  constructor(
    private readonly maxBanners = 6,
    private readonly pitch = 1.25,
  ) {
    this.group.name = 'project-banners';
  }

  update(projects: readonly Project[], filter: string | null): void {
    const shown = projects.slice(0, this.maxBanners);
    const key = JSON.stringify([shown.map((p) => [p.id, p.name]), filter]);
    if (key === this.key) return;
    this.key = key;
    this.clear();
    shown.forEach((p, i) => {
      const pole = new THREE.Group();
      pole.position.x = i * this.pitch;
      pole.add(new THREE.Mesh(POLE_GEO, BRASS), new THREE.Mesh(FOOT_GEO, BRASS));
      const knob = new THREE.Mesh(KNOB_GEO, BRASS);
      knob.position.y = POLE_H + 0.04;
      pole.add(knob);
      const dimmed = filter !== null && filter !== p.id;
      const flag = new THREE.Mesh(
        FLAG_GEO,
        new THREE.MeshLambertMaterial({
          map: flagTexture(p.name, dimmed ? '#8b8f99' : projectCss(p.id)),
          side: THREE.DoubleSide,
        }),
      );
      flag.position.set(0.04, POLE_H - 0.05, 0);
      flag.scale.y = dimmed ? 0.55 : 1;
      flag.name = `banner-${p.id}`;
      pole.add(flag);
      this.flags.push(flag);
      tagFeature(pole, { kind: 'project', id: p.id });
      this.group.add(pole);
    });
  }

  /** Flags flutter a little. */
  tick(dt: number): void {
    this.t += dt;
    this.flags.forEach((f, i) => (f.rotation.y = Math.sin(this.t * 2.1 + i) * 0.18));
  }

  get count(): number {
    return this.flags.length;
  }

  private clear(): void {
    for (const f of this.flags) {
      const m = f.material as THREE.MeshLambertMaterial;
      m.map?.dispose();
      m.dispose();
    }
    this.flags = [];
    this.group.clear();
  }

  dispose(): void {
    this.clear();
  }
}
