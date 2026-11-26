import { COLORS } from './palette.js';
import type { Part } from './instancing.js';

/**
 * Chunky low-poly props described as lists of instanced primitives. Each prop
 * is in local space: base centred on the origin, front facing +z.
 */

export function plant(scale = 1): Part[] {
  const s = scale;
  return [
    { pool: 'taper', pos: [0, 0, 0], size: [0.5 * s, 0.42 * s, 0.5 * s], color: COLORS.terracotta },
    { pool: 'cyl', pos: [0, 0.4 * s, 0], size: [0.42 * s, 0.04, 0.42 * s], color: COLORS.woodDark },
    { pool: 'blob', pos: [0, 0.36 * s, 0], size: [0.8 * s, 0.75 * s, 0.8 * s], color: COLORS.leaf },
    {
      pool: 'blob',
      pos: [0.08 * s, 0.8 * s, -0.05 * s],
      size: [0.55 * s, 0.6 * s, 0.55 * s],
      color: COLORS.leafLight,
    },
  ];
}

export function waterCooler(): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [0.46, 0.9, 0.46], color: COLORS.white },
    { pool: 'box', pos: [0, 0.55, 0.23], size: [0.3, 0.16, 0.04], color: COLORS.metalDark },
    { pool: 'box', pos: [-0.07, 0.6, 0.26], size: [0.06, 0.06, 0.06], color: COLORS.blue },
    { pool: 'box', pos: [0.07, 0.6, 0.26], size: [0.06, 0.06, 0.06], color: COLORS.red },
    { pool: 'cyl', pos: [0, 0.9, 0], size: [0.2, 0.05, 0.2], color: COLORS.metal },
    { pool: 'glass', pos: [0, 0.95, 0], size: [0.38, 0.5, 0.38], color: COLORS.water },
    { pool: 'cyl', pos: [0, 1.45, 0], size: [0.16, 0.06, 0.16], color: COLORS.blue },
  ];
}

export function filingCabinet(color: number = COLORS.metal): Part[] {
  const parts: Part[] = [{ pool: 'box', pos: [0, 0, 0], size: [0.55, 1.15, 0.55], color }];
  for (let i = 0; i < 3; i++) {
    const y = 0.1 + i * 0.35;
    parts.push({ pool: 'box', pos: [0, y, 0.27], size: [0.47, 0.3, 0.03], color: COLORS.white });
    parts.push({
      pool: 'box',
      pos: [0, y + 0.2, 0.3],
      size: [0.18, 0.04, 0.04],
      color: COLORS.metalDark,
    });
  }
  return parts;
}

const BOOK_COLORS = [0xe23b3b, 0x2f7fe0, 0xffd23f, 0x3fbf6a, 0x8a4fd8, 0xff8c2a];

export function bookshelf(seed: number): Part[] {
  const parts: Part[] = [
    { pool: 'box', pos: [0, 0, 0], size: [1.3, 1.7, 0.4], color: COLORS.wood },
    { pool: 'box', pos: [0, 0.08, 0.04], size: [1.16, 1.5, 0.36], color: COLORS.woodDark },
  ];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 0.12 + shelf * 0.52;
    parts.push({
      pool: 'box',
      pos: [0, y - 0.04, 0.05],
      size: [1.18, 0.04, 0.34],
      color: COLORS.wood,
    });
    let x = -0.52;
    let i = seed + shelf * 3;
    while (x < 0.45) {
      const w = 0.08 + ((i * 7) % 4) * 0.025;
      const h = 0.3 + ((i * 5) % 3) * 0.05;
      parts.push({
        pool: 'box',
        pos: [x + w / 2, y, 0.06],
        size: [w, h, 0.26],
        color: BOOK_COLORS[i % BOOK_COLORS.length]!,
      });
      x += w + 0.015;
      i++;
    }
  }
  return parts;
}

export function floorLamp(): Part[] {
  return [
    { pool: 'cyl', pos: [0, 0, 0], size: [0.36, 0.06, 0.36], color: COLORS.metalDark },
    { pool: 'cyl', pos: [0, 0.06, 0], size: [0.06, 1.4, 0.06], color: COLORS.metalDark },
    { pool: 'glow', pos: [0, 1.3, 0], size: [0.55, 0.4, 0.55], color: COLORS.lampOn, lamp: true },
  ];
}

export function sofa(color: number): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [1.5, 0.42, 0.7], color },
    { pool: 'box', pos: [0, 0.42, -0.25], size: [1.5, 0.45, 0.2], color },
    { pool: 'box', pos: [-0.68, 0.42, 0.05], size: [0.16, 0.22, 0.6], color },
    { pool: 'box', pos: [0.68, 0.42, 0.05], size: [0.16, 0.22, 0.6], color },
  ];
}

export function bench(): Part[] {
  return [
    { pool: 'box', pos: [-0.6, 0, 0], size: [0.08, 0.38, 0.4], color: COLORS.metalDark },
    { pool: 'box', pos: [0.6, 0, 0], size: [0.08, 0.38, 0.4], color: COLORS.metalDark },
    { pool: 'box', pos: [0, 0.38, 0], size: [1.4, 0.08, 0.42], color: COLORS.blue },
    { pool: 'box', pos: [0, 0.46, -0.18], size: [1.4, 0.36, 0.06], color: COLORS.blue },
  ];
}

export function vendingMachine(): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [0.85, 1.75, 0.6], color: COLORS.red },
    { pool: 'box', pos: [-0.12, 0.65, 0.3], size: [0.5, 0.95, 0.03], color: COLORS.night },
    { pool: 'glow', pos: [0.3, 1.05, 0.31], size: [0.12, 0.35, 0.04], color: 0x9ff7ff, lamp: true },
    { pool: 'box', pos: [-0.12, 0.2, 0.31], size: [0.5, 0.18, 0.03], color: COLORS.metalDark },
    { pool: 'box', pos: [0, 1.6, 0.31], size: [0.75, 0.12, 0.02], color: 0xffd23f },
  ];
}

export function fireExtinguisher(): Part[] {
  return [
    { pool: 'cyl', pos: [0, 0, 0], size: [0.2, 0.5, 0.2], color: COLORS.red },
    { pool: 'cyl', pos: [0, 0.5, 0], size: [0.08, 0.1, 0.08], color: COLORS.metalDark },
  ];
}

export function rug(w: number, d: number, color: number, border: number): Part[] {
  return [
    { pool: 'box', pos: [0, 0, 0], size: [w, 0.02, d], color: border },
    { pool: 'box', pos: [0, 0.005, 0], size: [w - 0.3, 0.02, d - 0.3], color },
  ];
}

export function bin(): Part[] {
  return [{ pool: 'taper', pos: [0, 0, 0], size: [0.3, 0.38, 0.3], color: COLORS.metalDark }];
}

/**
 * Office desk with a computer, front (the user's side) facing +z. The screen
 * is the part with pool `screen`; owners recolour it to show activity.
 */
export function desk(width: number, seed: number): Part[] {
  const w = width;
  const top = 0.5;
  const parts: Part[] = [
    { pool: 'box', pos: [0, top, 0], size: [w, 0.06, 0.6], color: COLORS.wood },
    { pool: 'box', pos: [-w / 2 + 0.05, 0, 0], size: [0.06, top, 0.54], color: COLORS.woodDark },
    { pool: 'box', pos: [w / 2 - 0.05, 0, 0], size: [0.06, top, 0.54], color: COLORS.woodDark },
    { pool: 'box', pos: [0, 0.12, -0.24], size: [w - 0.1, 0.36, 0.04], color: COLORS.woodDark },
    // Monitor: foot, neck, casing and screen (facing +z).
    { pool: 'box', pos: [0, top + 0.06, -0.14], size: [0.22, 0.02, 0.14], color: COLORS.metalDark },
    { pool: 'box', pos: [0, top + 0.06, -0.16], size: [0.05, 0.14, 0.04], color: COLORS.metalDark },
    { pool: 'box', pos: [0, top + 0.18, -0.15], size: [0.52, 0.34, 0.06], color: 0x2a2d36 },
    { pool: 'screen', pos: [0, top + 0.21, -0.118], size: [0.46, 0.28, 0.01], color: 0x1c2333 },
    // Keyboard and mouse.
    { pool: 'box', pos: [0, top + 0.06, 0.12], size: [0.36, 0.02, 0.12], color: 0xd8dde2 },
    { pool: 'box', pos: [0.26, top + 0.06, 0.13], size: [0.05, 0.025, 0.08], color: 0xd8dde2 },
  ];
  // A little clutter: a mug or a stack of papers.
  if (seed % 3 === 0)
    parts.push({
      pool: 'cyl',
      pos: [-w / 2 + 0.2, top + 0.06, 0.1],
      size: [0.08, 0.1, 0.08],
      color: [COLORS.red, COLORS.blue, 0xffd23f][seed % 3]!,
    });
  else if (seed % 3 === 1)
    parts.push({
      pool: 'box',
      pos: [-w / 2 + 0.22, top + 0.06, 0.05],
      size: [0.2, 0.05, 0.26],
      color: COLORS.white,
    });
  return parts;
}

/** Office chair, seat at 0.4, backrest on the +z side (user faces −z). */
export function chair(color: number): Part[] {
  return [
    { pool: 'cyl', pos: [0, 0, 0], size: [0.4, 0.04, 0.4], color: COLORS.metalDark },
    { pool: 'cyl', pos: [0, 0.04, 0], size: [0.05, 0.3, 0.05], color: COLORS.metalDark },
    { pool: 'box', pos: [0, 0.33, 0], size: [0.42, 0.07, 0.42], color },
    { pool: 'box', pos: [0, 0.4, 0.2], size: [0.4, 0.26, 0.06], color },
  ];
}

/** Move/rotate a prop's parts into an owner's local space. */
export function placed(parts: Part[], x: number, z: number, rotY = 0, y = 0): Part[] {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  return parts.map((p) => {
    const [px, py, pz] = p.pos;
    return {
      ...p,
      pos: [x + px * c + pz * s, y + py, z - px * s + pz * c],
      rotY: (p.rotY ?? 0) + rotY,
    };
  });
}
