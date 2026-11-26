import * as THREE from 'three';

/**
 * Procedural canvas textures. When no canvas is available (e.g. unit tests in
 * Node) a blank texture is returned so scene building still works.
 */

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function makeCanvas(
  w: number,
  h: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: Ctx } | null {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  }
  return null;
}

/** `ctx.roundRect` with a fallback for browsers that lack it (Chrome < 99). */
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function toTexture(c: ReturnType<typeof makeCanvas>): THREE.Texture {
  if (!c) return new THREE.Texture();
  const tex = new THREE.CanvasTexture(c.canvas as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * A white floor tile with a bevelled rim and a faint speckle. Tinted per
 * instance, so one texture serves every floor colour.
 */
export function tileTexture(): THREE.Texture {
  const size = 64;
  const c = makeCanvas(size, size);
  if (c) {
    const { ctx } = c;
    ctx.fillStyle = '#ebebeb';
    ctx.fillRect(0, 0, size, size);
    // Bevel: light top/left, dark bottom/right.
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(0, 0, size, 4);
    ctx.fillRect(0, 0, 4, size);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, size - 4, size, 4);
    ctx.fillRect(size - 4, 0, 4, size);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 37) % size;
      const y = (i * 23 + 11) % size;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  return toTexture(c);
}

/** Two-tone mown-lawn stripes for the ground around the office. */
export function grassTexture(): THREE.Texture {
  const size = 128;
  const c = makeCanvas(size, size);
  if (c) {
    const { ctx } = c;
    ctx.fillStyle = '#5bb043';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#4ea23a';
    ctx.fillRect(0, 0, size / 2, size);
    ctx.fillStyle = 'rgba(30,80,20,0.25)';
    for (let i = 0; i < 90; i++) {
      const x = (i * 53) % size;
      const y = (i * 29 + 7) % size;
      ctx.fillRect(x, y, 2, 3);
    }
  }
  const tex = toTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export const PLAQUE_ASPECT = 4;

/** Brass name plate; grey and labelled when the runner is offline. */
export function plaqueTexture(name: string, online: boolean): THREE.Texture {
  const w = 256;
  const h = w / PLAQUE_ASPECT;
  const c = makeCanvas(w, h);
  if (c) {
    const { ctx } = c;
    const r = 12;
    const plate = (inset: number, fill: string | CanvasGradient) => {
      ctx.beginPath();
      roundRect(ctx, inset, inset, w - inset * 2, h - inset * 2, r - inset / 2);
      ctx.fillStyle = fill;
      ctx.fill();
    };
    plate(0, online ? '#7a4a12' : '#3d4048');
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (online) {
      g.addColorStop(0, '#ffe58a');
      g.addColorStop(0.5, '#f2b632');
      g.addColorStop(1, '#c98a1a');
    } else {
      g.addColorStop(0, '#9aa0ab');
      g.addColorStop(1, '#6b717c');
    }
    plate(5, g);
    // Screws.
    ctx.fillStyle = online ? '#8a5a18' : '#4a4e57';
    for (const x of [16, w - 16]) {
      ctx.beginPath();
      ctx.arc(x, h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = online ? '#3b2405' : '#2a2d33';
    let px = 30;
    const label = name.toUpperCase();
    do {
      ctx.font = `bold ${px}px "Trebuchet MS", Verdana, sans-serif`;
      px -= 2;
    } while (px > 12 && ctx.measureText(label).width > w - 56);
    ctx.fillText(label, w / 2, online ? h / 2 + 1 : h / 2 - 7);
    if (!online) {
      ctx.font = 'bold 13px Verdana, sans-serif';
      ctx.fillStyle = '#c0392b';
      ctx.fillText('OFFLINE', w / 2, h / 2 + 16);
    }
  }
  return toTexture(c);
}

export const BUBBLE_ASPECT = 3;

/** Comic speech bubble with a tail pointing down. */
export function bubbleTexture(text: string): THREE.Texture {
  const w = 288;
  const h = w / BUBBLE_ASPECT;
  const c = makeCanvas(w, h);
  if (c) {
    const { ctx } = c;
    const tail = 14;
    ctx.beginPath();
    roundRect(ctx, 4, 4, w - 8, h - tail - 8, 16);
    ctx.moveTo(w / 2 - 12, h - tail - 4);
    ctx.lineTo(w / 2, h - 3);
    ctx.lineTo(w / 2 + 12, h - tail - 4);
    ctx.fillStyle = '#fffdf2';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#2b4a8b';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = '#2a2a2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = 30;
    do {
      ctx.font = `bold ${px}px "Trebuchet MS", Verdana, sans-serif`;
      px -= 2;
    } while (px > 12 && ctx.measureText(text).width > w - 36);
    ctx.fillText(text, w / 2, (h - tail) / 2 + 1);
  }
  return toTexture(c);
}
