import type { CharMap, SpriteSource, VehiclePalette } from './types';
import { P, hexToRgb } from './Palette';

/**
 * Global char → color map. Vehicle recolor slots: B(body) b(shade) H(highlight) A(accent)
 * G(glass) L(lamp) W(wheel) C(chrome). Everything else is a fixed color.
 */
export const DEFAULT_MAP: CharMap = {
  '.': null, ' ': null,
  k: P.black, K: P.ink, D: P.dark, d: P.gray3, e: P.gray2, f: P.gray1, w: P.white, q: P.paper,
  r: P.red, R: P.redDark, o: P.orange, y: P.yellow, Y: P.yellowLight, g: P.green, v: P.greenDark,
  t: P.teal, c: P.cyan, u: P.blue, U: P.blueDark, i: P.blueLight, p: P.purple, P: P.purpleDark,
  m: P.pink, M: P.pinkLight, s: P.sakura, n: P.brown, T: P.tan, x: P.gold, S: P.skin,
  // recolor slots with neutral defaults
  B: '#909098', b: '#585860', H: '#c8c8d0', A: '#e0202a', G: '#40e0f0', L: '#ffe870', W: '#202020', C: '#d8d8e0',
};

export interface PixelSprite {
  id: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  canvas: HTMLCanvasElement;
}

const cache = new Map<string, PixelSprite>();
const flipCache = new Map<string, PixelSprite>();
const tintCache = new Map<string, PixelSprite>();

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

function paletteKey(pal?: Partial<VehiclePalette>): string {
  if (!pal) return '';
  return `${pal.body}|${pal.shade}|${pal.light}|${pal.accent}|${pal.glass}|${pal.lamp}|${pal.wheel}|${pal.chrome}`;
}

export function paletteToMap(pal?: Partial<VehiclePalette>): CharMap {
  if (!pal) return {};
  const m: CharMap = {};
  if (pal.body) m.B = pal.body;
  if (pal.shade) m.b = pal.shade;
  if (pal.light) m.H = pal.light;
  if (pal.accent) m.A = pal.accent;
  if (pal.glass) m.G = pal.glass;
  if (pal.lamp) m.L = pal.lamp;
  if (pal.wheel) m.W = pal.wheel;
  if (pal.chrome) m.C = pal.chrome;
  return m;
}

/** Build (and cache) a sprite from rows. Rows may have different lengths; width = longest. */
export function buildSprite(src: SpriteSource, pal?: Partial<VehiclePalette>, extraMap?: CharMap): PixelSprite {
  const key = `${src.id}#${paletteKey(pal)}#${extraMap ? JSON.stringify(extraMap) : ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const map: CharMap = { ...DEFAULT_MAP, ...(src.map ?? {}), ...paletteToMap(pal), ...(extraMap ?? {}) };
  const h = src.rows.length;
  const w = src.rows.reduce((m, r) => Math.max(m, r.length), 0);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const data = img.data;
  const rgbCache = new Map<string, [number, number, number]>();
  for (let y = 0; y < h; y++) {
    const row = src.rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const col = map[ch];
      if (col == null) continue;
      let rgb = rgbCache.get(col);
      if (!rgb) { rgb = hexToRgb(col); rgbCache.set(col, rgb); }
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const spr: PixelSprite = { id: key, w, h, ax: src.ax ?? Math.floor(w / 2), ay: src.ay ?? h, canvas };
  cache.set(key, spr);
  return spr;
}

/** Wrap an existing canvas as a sprite (for procedurally painted content). */
export function spriteFromCanvas(id: string, canvas: HTMLCanvasElement, ax?: number, ay?: number): PixelSprite {
  return { id, w: canvas.width, h: canvas.height, ax: ax ?? Math.floor(canvas.width / 2), ay: ay ?? canvas.height, canvas };
}

export function flipSprite(spr: PixelSprite): PixelSprite {
  const key = spr.id + '#flip';
  const hit = flipCache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(spr.w, spr.h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(spr.w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(spr.canvas, 0, 0);
  const out: PixelSprite = { id: key, w: spr.w, h: spr.h, ax: spr.w - 1 - spr.ax, ay: spr.ay, canvas };
  flipCache.set(key, out);
  return out;
}

/** Solid-color silhouette of a sprite (hit flash, shadows, ghosts). */
export function tintSprite(spr: PixelSprite, color: string): PixelSprite {
  const key = spr.id + '#tint' + color;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(spr.w, spr.h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(spr.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, spr.w, spr.h);
  const out: PixelSprite = { id: key, w: spr.w, h: spr.h, ax: spr.ax, ay: spr.ay, canvas };
  tintCache.set(key, out);
  return out;
}

export function clearSpriteCaches(): void {
  cache.clear(); flipCache.clear(); tintCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid: a tiny char-grid painter used by procedural sprite templates.
// ─────────────────────────────────────────────────────────────────────────────
export class Grid {
  readonly w: number;
  readonly h: number;
  private cells: string[];
  constructor(w: number, h: number, fill = '.') {
    this.w = w; this.h = h;
    this.cells = new Array(w * h).fill(fill);
  }
  get(x: number, y: number): string {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return '.';
    return this.cells[y * this.w + x];
  }
  px(x: number, y: number, c: string): this {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, c: string): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
    return this;
  }
  /** Outlined box: border color `o`, fill `c` (skip fill if undefined). */
  box(x: number, y: number, w: number, h: number, o: string, c?: string): this {
    if (c !== undefined) this.rect(x + 1, y + 1, w - 2, h - 2, c);
    this.hline(x, x + w - 1, y, o); this.hline(x, x + w - 1, y + h - 1, o);
    this.vline(x, y, y + h - 1, o); this.vline(x + w - 1, y, y + h - 1, o);
    return this;
  }
  hline(x0: number, x1: number, y: number, c: string): this {
    if (x1 < x0) [x0, x1] = [x1, x0];
    for (let x = x0; x <= x1; x++) this.px(x, y, c);
    return this;
  }
  vline(x: number, y0: number, y1: number, c: string): this {
    if (y1 < y0) [y0, y1] = [y1, y0];
    for (let y = y0; y <= y1; y++) this.px(x, y, c);
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }
  /** Filled trapezoid: top edge from (tx0..tx1) at y0 to bottom edge (bx0..bx1) at y1. */
  trap(tx0: number, tx1: number, y0: number, bx0: number, bx1: number, y1: number, c: string): this {
    const n = Math.max(1, y1 - y0);
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / n;
      const a = Math.round(tx0 + (bx0 - tx0) * t), b = Math.round(tx1 + (bx1 - tx1) * t);
      this.hline(a, b, y, c);
    }
    return this;
  }
  /** Filled ellipse. */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: string): this {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.001) + (y * y) / (ry * ry + 0.001) <= 1) this.px(cx + x, cy + y, c);
    }
    return this;
  }
  circle(cx: number, cy: number, r: number, c: string): this { return this.ellipse(cx, cy, r, r, c); }
  /** Mirror left half onto the right half (for symmetric rear/top views). */
  mirrorX(): this {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < Math.floor(this.w / 2); x++) {
      this.cells[y * this.w + (this.w - 1 - x)] = this.cells[y * this.w + x];
    }
    return this;
  }
  /** Draw an outline (color `o`) around every non-transparent pixel that borders transparency. */
  outline(o = 'k'): this {
    const src = this.cells.slice();
    const isSolid = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[y * this.w + x] !== '.';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x] !== '.') continue;
      if (isSolid(x - 1, y) || isSolid(x + 1, y) || isSolid(x, y - 1) || isSolid(x, y + 1)) this.cells[y * this.w + x] = o;
    }
    return this;
  }
  /** Replace every `a` with `b`. */
  replace(a: string, b: string): this {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i] === a) this.cells[i] = b;
    return this;
  }
  /** Paste another grid at (x,y); '.' is transparent. */
  paste(g: Grid, x: number, y: number): this {
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const c = g.get(i, j);
      if (c !== '.') this.px(x + i, y + j, c);
    }
    return this;
  }
  /** Stamp rows (string art) at (x,y). */
  stamp(rows: string[], x: number, y: number): this {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const c = rows[j][i];
      if (c !== '.' && c !== ' ') this.px(x + i, y + j, c);
    }
    return this;
  }
  rows(): string[] {
    const out: string[] = [];
    for (let y = 0; y < this.h; y++) out.push(this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
    return out;
  }
  toSource(id: string, ax?: number, ay?: number, map?: CharMap): SpriteSource {
    return { id, rows: this.rows(), ax, ay, map };
  }
}

// ── derived sprites ──────────────────────────────────────────────────────────
const shearCache = new Map<string, PixelSprite>();
/**
 * Horizontal shear: each row is shifted by `k * (h - y)` px (top moves, bottom stays).
 * Used for lane-change lean. k in [-0.5, 0.5].
 */
export function shearSprite(spr: PixelSprite, k: number): PixelSprite {
  const kq = Math.round(k * 20) / 20;
  if (kq === 0) return spr;
  const key = spr.id + '#shear' + kq;
  const hit = shearCache.get(key);
  if (hit) return hit;
  const extra = Math.ceil(Math.abs(kq) * spr.h);
  const canvas = makeCanvas(spr.w + extra, spr.h);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let y = 0; y < spr.h; y++) {
    const off = Math.round(kq * (spr.h - 1 - y));
    ctx.drawImage(spr.canvas, 0, y, spr.w, 1, (kq > 0 ? 0 : extra) + off, y, spr.w, 1);
  }
  const out: PixelSprite = { id: key, w: canvas.width, h: spr.h, ax: spr.ax + (kq > 0 ? 0 : extra), ay: spr.ay, canvas };
  shearCache.set(key, out);
  return out;
}

const darkCache = new Map<string, PixelSprite>();
/** Darkened / scorched variant (wrecks, night silhouettes). amt 0..1 */
export function darkenSprite(spr: PixelSprite, amt: number): PixelSprite {
  const key = spr.id + '#dark' + Math.round(amt * 10);
  const hit = darkCache.get(key);
  if (hit) return hit;
  const canvas = makeCanvas(spr.w, spr.h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(spr.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, spr.w, spr.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = Math.round(d[i] * (1 - amt)); d[i + 1] = Math.round(d[i + 1] * (1 - amt)); d[i + 2] = Math.round(d[i + 2] * (1 - amt));
  }
  ctx.putImageData(img, 0, 0);
  const out: PixelSprite = { id: key, w: spr.w, h: spr.h, ax: spr.ax, ay: spr.ay, canvas };
  darkCache.set(key, out);
  return out;
}
