import type { BodyTemplate, VehicleDef, VehicleDetails, VehiclePalette } from '../../core/types';
import type { TrafficTemplate } from '../../game/Traffic';
import { Grid, buildSprite, makeCanvas, type PixelSprite } from '../../core/Sprite';
import { P, hexToRgb, shade } from '../../core/Palette';
import { drawRear } from './rear';

// ─────────────────────────────────────────────────────────────────────────────
// Traffic template catalog — every id listed in docs/AGENT_GUIDE.md ("Traffic template ids").
//
// Each vehicle is a synthetic VehicleDef fed through drawRear() (body template + recolor palette),
// then "decorated": a tiny pixel pen paints the signature details straight onto the built sprite
// (taxi roof signs, police lightbars, battenburg checks, cargo drums, neon, decals…). The pen is
// silhouette-aware — it can restrict painting to body-colored pixels ('body'), to anything inside
// the black outline ('in') or to opaque pixels ('solid') — so decals never break the outline and
// never smear over taillights or plates, whatever geometry rear.ts produces.
//
// Bosses reuse a heavy sprite scaled 1.3× with nearest-neighbour (scaleSprite).
// Nothing is built at module load (no DOM yet): trafficTemplates() builds once and caches.
//
// INTEGRATION NOTE (World.ts, not editable from here): `World.templates` is built as
// `all.filter(t => !t.heavy && !t.boss)`, so every city-only vehicle (tuktuk, vocho, dolmuş,
// songthaew, London cab…) is also in the everywhere-pool and shows up in Tokyo or New York.
// Suggested fix in World.pickTemplate: keep a generic pool of the 11 ids that start with
// `sedan_/hatch_/coupe_/wagon_/suv_/van_/pickup_` (or add a `generic?: boolean` flag to
// TrafficTemplate and filter on it) and use city.traffic for everything else.
// heavy/hp follow the guide exactly: only the ten ids tagged "heavy" there are heavy (hp 2,
// damage 2, 250 pts) — city buses like bus_blue/bus_rio stay 1-hp city vehicles so they do not
// leak into the global heavy pool.
// ─────────────────────────────────────────────────────────────────────────────

type RGB = [number, number, number];
type Mode = 'any' | 'solid' | 'in' | 'body';

const RGB_CACHE = new Map<string, RGB>();
function rgb(c: string): RGB {
  let v = RGB_CACHE.get(c);
  if (!v) { v = hexToRgb(c); RGB_CACHE.set(c, v); }
  return v;
}
const OUTLINE_COLS: RGB[] = [P.black, P.ink, '#000000'].map((c) => hexToRgb(c));

/** 3×5 pixel font for the tiny decals (TAXI / POLIZEI / HORN OK …). 4 px advance. */
const FONT: Record<string, string> = {
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '### ..# ### #.. ###', '3': '### ..# ### ..# ###',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ### ..# ###', '6': '### #.. ### #.# ###', '7': '### ..# ..# ..# ..#',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ###',
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '### #.. #.. #.. ###', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '### #.. #.# #.# ###', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# ###', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '### #.# #.# #.# ###', P: '### #.# ### #.. #..',
  Q: '### #.# #.# ### ..#', R: '##. #.# ##. #.# #.#', S: '### #.. ### ..# ###', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###', '-': '... ... ### ... ...', '.': '... ... ... ... .#.',
  ' ': '... ... ... ... ...',
};

// ── pixel pen ────────────────────────────────────────────────────────────────
/** Paints on an RGBA buffer of an already built sprite. All coordinates are sprite pixels. */
class Pen {
  constructor(readonly w: number, readonly h: number, private d: Uint8ClampedArray, private bodyCols: RGB[]) {}
  private i(x: number, y: number): number { return (y * this.w + x) * 4; }
  private same(i: number, c: RGB): boolean { return this.d[i] === c[0] && this.d[i + 1] === c[1] && this.d[i + 2] === c[2]; }
  inside(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  solid(x: number, y: number): boolean { return this.inside(x, y) && this.d[this.i(x, y) + 3] > 0; }
  isOutline(x: number, y: number): boolean { if (!this.solid(x, y)) return false; const i = this.i(x, y); return OUTLINE_COLS.some((c) => this.same(i, c)); }
  isBody(x: number, y: number): boolean { if (!this.solid(x, y)) return false; const i = this.i(x, y); return this.bodyCols.some((c) => this.same(i, c)); }
  /** Perceived brightness 0..255 of an opaque pixel (0 when transparent). */
  lum(x: number, y: number): number {
    if (!this.solid(x, y)) return 0;
    const i = this.i(x, y);
    return 0.299 * this.d[i] + 0.587 * this.d[i + 1] + 0.114 * this.d[i + 2];
  }
  private ok(x: number, y: number, m: Mode): boolean {
    if (!this.inside(x, y)) return false;
    if (m === 'any') return true;
    if (m === 'solid') return this.solid(x, y);
    if (m === 'in') return this.solid(x, y) && !this.isOutline(x, y);
    return this.isBody(x, y);
  }
  px(x: number, y: number, col: string, m: Mode = 'any'): this {
    x = Math.round(x); y = Math.round(y);
    if (!this.ok(x, y, m)) return this;
    const c = rgb(col), i = this.i(x, y);
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
    return this;
  }
  rect(x: number, y: number, w: number, h: number, col: string, m: Mode = 'any'): this {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, col, m);
    return this;
  }
  hline(x0: number, x1: number, y: number, col: string, m: Mode = 'any'): this { for (let x = x0; x <= x1; x++) this.px(x, y, col, m); return this; }
  vline(x: number, y0: number, y1: number, col: string, m: Mode = 'any'): this { for (let y = y0; y <= y1; y++) this.px(x, y, col, m); return this; }
  frame(x: number, y: number, w: number, h: number, border: string, fill?: string): this {
    if (fill !== undefined) this.rect(x + 1, y + 1, w - 2, h - 2, fill);
    this.hline(x, x + w - 1, y, border); this.hline(x, x + w - 1, y + h - 1, border);
    this.vline(x, y, y + h - 1, border); this.vline(x + w - 1, y, y + h - 1, border);
    return this;
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, col: string, m: Mode = 'any'): this {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.001) + (y * y) / (ry * ry + 0.001) <= 1) this.px(cx + x, cy + y, col, m);
    }
    return this;
  }
  ring(cx: number, cy: number, r: number, col: string, m: Mode = 'any'): this {
    for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; this.px(cx + Math.cos(t) * r, cy + Math.sin(t) * r, col, m); }
    return this;
  }
  /** First opaque row in column x (-1 when the column is empty). */
  top(x: number): number { for (let y = 0; y < this.h; y++) if (this.solid(x, y)) return y; return -1; }
  /** Opaque span of a row, or null. */
  edges(y: number): [number, number] | null {
    let a = -1, b = -1;
    for (let x = 0; x < this.w; x++) if (this.solid(x, y)) { if (a < 0) a = x; b = x; }
    return a < 0 ? null : [a, b];
  }
  text(s: string, x: number, y: number, col: string, m: Mode = 'any'): number {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const gl = FONT[ch];
      if (gl) { const rows = gl.split(' '); for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (rows[j][i] === '#') this.px(cx + i, y + j, col, m); }
      cx += 4;
    }
    return cx - x - 1;
  }
  textMid(s: string, cx: number, y: number, col: string, m: Mode = 'any'): void {
    this.text(s, Math.round(cx - (s.length * 4 - 1) / 2), y, col, m);
  }
  stamp(rows: string[], x: number, y: number, map: Record<string, string>, s = 1, m: Mode = 'any'): this {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const col = map[rows[j][i]];
      if (!col) continue;
      for (let b = 0; b < s; b++) for (let a = 0; a < s; a++) this.px(x + i * s + a, y + j * s + b, col, m);
    }
    return this;
  }
}

/** Copy a built sprite, run a paint pass over it (with `padTop` free rows above), crop and return. */
function decorate(spr: PixelSprite, id: string, padTop: number, bodyCols: string[], fn: (p: Pen) => void): PixelSprite {
  const w = spr.w, h = spr.h + padTop;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(spr.canvas, 0, padTop);
  const img = ctx.getImageData(0, 0, w, h);
  fn(new Pen(w, h, img.data, bodyCols.map((c) => hexToRgb(c))));
  ctx.putImageData(img, 0, 0);
  // trim the unused transparent rows on top so the sprite stays tight
  let y0 = 0;
  while (y0 < h) {
    let any = false;
    for (let x = 0; x < w && !any; x++) if (img.data[(y0 * w + x) * 4 + 3] > 0) any = true;
    if (any) break;
    y0++;
  }
  if (y0 <= 0) return { id, w, h, ax: spr.ax, ay: spr.ay + padTop, canvas };
  const c2 = makeCanvas(w, h - y0);
  c2.getContext('2d')!.drawImage(canvas, 0, -y0);
  return { id, w, h: h - y0, ax: spr.ax, ay: spr.ay + padTop - y0, canvas: c2 };
}

/** Nearest-neighbour upscale (bosses are ~1.3× the normal heavy). */
function scaleSprite(spr: PixelSprite, f: number): PixelSprite {
  const w = Math.max(1, Math.round(spr.w * f)), h = Math.max(1, Math.round(spr.h * f));
  const src = spr.canvas.getContext('2d')!.getImageData(0, 0, spr.w, spr.h).data;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(spr.h - 1, Math.floor((y * spr.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(spr.w - 1, Math.floor((x * spr.w) / w));
      const si = (sy * spr.w + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = src[si]; out.data[di + 1] = src[si + 1]; out.data[di + 2] = src[si + 2]; out.data[di + 3] = src[si + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return { id: spr.id + '#x' + f, w, h, ax: Math.round(spr.ax * f), ay: Math.round(spr.ay * f), canvas };
}

// ── synthetic vehicle defs ───────────────────────────────────────────────────
const GLASS = '#26303f';
const GLASS_DARK = '#171d29';

function pal(body: string, o: Partial<VehiclePalette> = {}): VehiclePalette {
  return {
    body,
    shade: o.shade ?? shade(body, -0.4),
    light: o.light ?? shade(body, 0.28),
    accent: o.accent ?? P.white,
    glass: o.glass ?? GLASS,
    lamp: o.lamp ?? P.red,
    wheel: o.wheel ?? '#15151c',
    chrome: o.chrome ?? '#ced2dc',
  };
}
/** Body-ish colors of a palette — the pen repaints only those in 'body' mode. */
const bodyCols = (p: VehiclePalette): string[] => [p.body, p.shade, p.light];

function rearOf(id: string, body: BodyTemplate, palette: VehiclePalette, details?: VehicleDetails): PixelSprite {
  return drawRear({ id: 'tr_' + id, name: id, brand: 'city', cls: 'special', body, palette, details } as VehicleDef);
}
/** Build a traffic sprite: rear-view body template + optional decoration pass. */
function mk(id: string, body: BodyTemplate, p: VehiclePalette, details?: VehicleDetails, padTop = 0, fn?: (pen: Pen) => void): PixelSprite {
  const spr = rearOf(id, body, p, details);
  return fn ? decorate(spr, 'traffic_' + id, padTop, bodyCols(p), fn) : spr;
}

// ── decoration helpers ───────────────────────────────────────────────────────
const yf = (p: Pen, f: number): number => Math.round(p.h * f);

interface Roof { plane: number; top: number; x0: number; x1: number; pod: boolean; }
/** Roof line of the central band + an already existing roof pod (sign / lightbar) if the body drew one. */
function roofInfo(p: Pen): Roof {
  const cx = p.w >> 1, half = Math.max(6, Math.round(p.w * 0.3));
  const tops: number[] = [];
  for (let x = cx - half; x <= cx + half; x++) { const t = p.top(x); if (t >= 0) tops.push(t); }
  if (!tops.length) return { plane: 2, top: 2, x0: cx - 5, x1: cx + 5, pod: false };
  tops.sort((a, b) => a - b);
  const plane = tops[Math.floor(tops.length * 0.55)];
  let x0 = p.w, x1 = -1, top = plane;
  for (let x = cx - half; x <= cx + half; x++) {
    const t = p.top(x);
    if (t >= 0 && t <= plane - 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (t < top) top = t; }
  }
  return x1 >= x0 ? { plane, top, x0, x1, pod: true } : { plane, top: plane, x0: cx - 5, x1: cx + 5, pod: false };
}
interface Pod { x: number; y: number; w: number; h: number; existed: boolean; labelled: boolean; }
/**
 * Recolor the roof pod the body template already drew (rear.ts gives every `taxi` body a TAXI sign)
 * or draw a fresh one above the roof. With `keepDark` the pod's dark pixels — its lettering — survive
 * the recolor, so tinting a sign keeps it readable.
 */
function roofPod(p: Pen, bw: number, bh: number, border: string, fill: string, keepDark = false): Pod {
  const r = roofInfo(p);
  if (r.pod && r.plane - r.top >= 3) {
    const x = r.x0, w = r.x1 - r.x0 + 1, y = r.top, h = r.plane - r.top;
    let labelled = false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!p.solid(i, j) || p.isOutline(i, j)) continue;
      const dark = p.lum(i, j) < 100;
      if (dark && keepDark) { if (i > x && i < x + w - 1 && j > y) labelled = true; continue; }
      p.px(i, j, fill);
    }
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (!p.solid(i, j)) continue;
      if (!p.solid(i - 1, j) || !p.solid(i + 1, j) || !p.solid(i, j - 1)) p.px(i, j, border);
    }
    return { x, y, w, h, existed: true, labelled };
  }
  const x = (p.w >> 1) - (bw >> 1), y = Math.max(0, r.plane - bh);
  p.frame(x, y, bw, bh, border, fill);
  return { x, y, w: bw, h: bh, existed: false, labelled: false };
}
/** Lit taxi roof sign with a tiny label. */
function taxiSign(p: Pen, fill: string, label = 'TAXI', labelCol: string = P.black, border: string = P.black): void {
  const bw = Math.max(14, Math.round(p.w * 0.21)) | 1;      // roughly the size rear.ts gives `taxi` bodies
  const bh = Math.max(7, Math.round(p.h * 0.1));
  const r = roofPod(p, bw, bh, border, fill, true);
  if (r.labelled) return;                                  // the body template already lettered it
  if (r.w >= label.length * 4 + 2 && r.h >= 7) p.textMid(label, r.x + r.w / 2, r.y + Math.round((r.h - 5) / 2), labelCol, 'in');
  else if (r.h >= 4) p.hline(r.x + 2, r.x + r.w - 3, r.y + (r.h >> 1), labelCol, 'in');
  else p.hline(r.x + 1, r.x + r.w - 2, r.y + 1, shade(fill, 0.35), 'in');
}
/** Police lightbar (or a single dome when `dome`). */
function lightbar(p: Pen, left: string = P.red, right = '#2a5cf0', dome = false): void {
  const bw = dome ? Math.max(8, Math.round(p.w * 0.16)) : Math.max(16, Math.round(p.w * 0.5));
  const bh = dome ? Math.max(5, Math.round(p.h * 0.1)) : Math.max(5, Math.round(p.h * 0.11));
  const r = roofPod(p, bw, bh, P.black, '#1b1b26');
  const x0 = r.x + 1, x1 = r.x + r.w - 2;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / Math.max(1, x1 - x0);
    const col = dome ? left : t < 0.4 ? left : t > 0.6 ? right : '#e8e8f0';
    for (let y = r.y + 1; y <= r.y + r.h - 2; y++) p.px(x, y, col, 'in');
  }
  p.hline(x0, x1, r.y + 1, '#ffffff', 'in');
  if (!dome) p.hline(x0, x1, r.y + r.h - 1, '#3a3a48', 'in');
}
/** Destination / route board on the rear of a bus or tram (the label is trimmed to the board width). */
function destBoard(p: Pen, label: string, bg = '#14141c', fg = '#ffb020'): void {
  const r = roofInfo(p);
  const w = Math.max(14, Math.round(p.w * 0.4)), x = (p.w >> 1) - (w >> 1), y = r.plane + Math.max(2, Math.round(p.h * 0.05));
  p.rect(x, y, w, 7, bg, 'in');
  p.hline(x, x + w - 1, y, '#08080c', 'in');
  const fits = Math.max(1, Math.floor((w - 1) / 4));
  p.textMid(label.slice(0, fits), p.w / 2, y + 1, fg, 'in');
}
/** Paint the top `rows` of body pixels (contrast roof). */
function roofPaint(p: Pen, rows: number, col: string): void {
  for (let x = 0; x < p.w; x++) { const t = p.top(x); if (t < 0) continue; for (let y = t; y < t + rows; y++) p.px(x, y, col, 'body'); }
}
/** Paint everything below `f` (0..1 of height) — panda police, black taxi skirts. */
function lowerPaint(p: Pen, f: number, col: string, m: Mode = 'body'): void {
  for (let y = yf(p, f); y < p.h; y++) for (let x = 0; x < p.w; x++) p.px(x, y, col, m);
}
function bandY(p: Pen, f0: number, f1: number, col: string, m: Mode = 'body'): void {
  for (let y = yf(p, f0); y <= yf(p, f1); y++) for (let x = 0; x < p.w; x++) p.px(x, y, col, m);
}
function checkerBand(p: Pen, f0: number, f1: number, cw: number, ch: number, col: string, m: Mode = 'body'): void {
  const y0 = yf(p, f0), y1 = yf(p, f1);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < p.w; x++) {
    if (((((x / cw) | 0) + (((y - y0) / ch) | 0)) & 1) === 0) p.px(x, y, col, m);
  }
}
/** Band that follows the silhouette, inset from both edges (keeps stripes off the tyres). */
function rowBand(p: Pen, f0: number, f1: number, insetF: number, col: (x: number, y: number) => string, m: Mode = 'in'): void {
  for (let y = yf(p, f0); y <= yf(p, f1); y++) {
    const e = p.edges(y);
    if (!e) continue;
    const ins = Math.round((e[1] - e[0]) * insetF);
    for (let x = e[0] + ins; x <= e[1] - ins; x++) p.px(x, y, col(x, y), m);
  }
}
/** Diagonal hazard stripes (garbage truck / mixer / boss bumpers). */
function chevrons(p: Pen, f0: number, f1: number, a: string, b: string, m: Mode = 'in'): void {
  rowBand(p, f0, f1, 0.1, (x, y) => ((x + y) % 8 < 4 ? a : b), m);
}
/** Neon underglow strip + a row of marker lamps along the roof edge (dekotora, party rigs). */
function neonTrim(p: Pen, cols: string[]): void {
  for (let x = 0; x < p.w; x++) {
    const t = p.top(x);
    if (t >= 0 && x % 5 === 0) p.px(x, t + 1, cols[(x >> 2) % cols.length], 'in');
  }
  rowBand(p, 0.86, 0.89, 0.14, (x) => cols[(x >> 1) % cols.length], 'in');
}
/** Big cargo circle (tanker end cap / mixer drum). */
function drum(p: Pen, cy: number, r: number, paint: (x: number, y: number, d: number) => string | null): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d > r) continue;
    const col = paint(x, y, d);
    if (col) p.px((p.w >> 1) + x, cy + y, col, 'in');
  }
}

const SKULL = [
  '..#####..',
  '.#######.',
  '#########',
  '#oo###oo#',
  '#oo###oo#',
  '#########',
  '.##ooo##.',
  '..#####..',
  '...#.#...',
  '..##.##..',
];

// ── the Rome scooter trio (no body template fits — drawn as one Grid) ─────────
function scooterPack(): PixelSprite {
  const g = new Grid(70, 48);
  const one = (cx: number, by: number, body: string, sh: string, jacket: string, helm: string): void => {
    g.rect(cx - 3, by - 10, 7, 10, 'K');                   // rear tyre
    g.rect(cx - 2, by - 8, 5, 6, 'D'); g.px(cx, by - 5, 'e');
    g.trap(cx - 5, cx + 5, by - 21, cx - 6, cx + 6, by - 10, body); // tail
    g.ellipse(cx, by - 16, 7, 5, body);                    // signature side panels
    g.hline(cx - 6, cx + 6, by - 10, sh); g.vline(cx - 6, by - 15, by - 10, sh); g.vline(cx + 6, by - 15, by - 10, sh);
    g.hline(cx - 5, cx + 5, by - 21, 'w');                 // highlight on the tail
    g.rect(cx - 1, by - 20, 3, 2, 'r'); g.px(cx, by - 20, 'Y'); // taillight
    g.rect(cx - 2, by - 14, 5, 4, 'w'); g.hline(cx - 2, cx + 2, by - 14, 'k'); // plate
    g.rect(cx - 4, by - 25, 9, 3, 'K'); g.hline(cx - 4, cx + 4, by - 25, 'D'); // seat
    g.trap(cx - 4, cx + 4, by - 34, cx - 5, cx + 5, by - 25, jacket);          // rider
    g.line(cx - 5, by - 32, cx - 8, by - 29, jacket); g.line(cx + 5, by - 32, cx + 8, by - 29, jacket);
    g.px(cx - 8, by - 29, 'S'); g.px(cx + 8, by - 29, 'S');
    g.hline(cx - 9, cx + 9, by - 30, 'd');                 // handlebar
    g.px(cx - 10, by - 32, 'e'); g.px(cx + 10, by - 32, 'e'); g.px(cx - 10, by - 31, 'd'); g.px(cx + 10, by - 31, 'd');
    g.ellipse(cx, by - 38, 4, 4, helm);                    // helmet
    g.hline(cx - 4, cx + 4, by - 37, 'K'); g.px(cx - 2, by - 37, 'c');
    g.hline(cx - 3, cx + 3, by - 41, shadeChar(helm));
  };
  one(11, 47, '1', '2', 'r', 'Y');
  one(35, 44, '3', '4', 'K', 'w');
  one(59, 47, '5', '6', 'u', 'g');
  g.outline('k');
  return buildSprite(g.toSource('traffic_scooter_pack', 35, 48, {
    '1': '#e8e6dc', '2': '#9c9ca6', '3': '#d02028', '4': '#7a1018', '5': '#1f9fa8', '6': '#0e5a64',
  }));
}
const shadeChar = (c: string): string => (c === 'w' ? 'f' : c === 'Y' ? 'y' : c === 'g' ? 'v' : 'd');

// ── template constructors ────────────────────────────────────────────────────
const civil = (id: string, sprite: PixelSprite, speed = 1): TrafficTemplate => ({ id, sprite, hp: 1, heavy: false, damage: 1, speed, points: 100 });
const heavy = (id: string, sprite: PixelSprite, speed = 0.88): TrafficTemplate => ({ id, sprite, hp: 2, heavy: true, damage: 2, speed, points: 250 });
const bossT = (id: string, sprite: PixelSprite, hp: number, speed = 0.9): TrafficTemplate =>
  ({ id, sprite: scaleSprite(sprite, 1.3), hp, heavy: true, damage: 2, speed, points: 1000, boss: true });

function build(): TrafficTemplate[] {
  const out: TrafficTemplate[] = [];

  // ── generic civilians ──────────────────────────────────────────────────────
  const gen: [string, BodyTemplate, string, number, VehicleDetails][] = [
    ['sedan_red', 'sedan', '#c8202a', 1.0, { lights: 'square', exhaust: 1 }],
    ['sedan_white', 'sedan', '#eceee8', 1.05, { lights: 'strip', exhaust: 1 }],
    ['sedan_blue', 'sedan', '#2448c8', 0.95, { lights: 'square', exhaust: 1 }],
    ['sedan_gray', 'sedan', '#767682', 1.0, { lights: 'round', exhaust: 1 }],
    ['hatch_green', 'hatch', '#1c9c44', 0.95, { lights: 'round' }],
    ['hatch_yellow', 'hatch', '#e8c020', 1.05, { lights: 'square' }],
    ['coupe_black', 'coupe', '#1e1e28', 1.15, { lights: 'strip', spoiler: 'lip', exhaust: 2 }],
    ['wagon_brown', 'wagon', '#7a4a20', 0.9, { lights: 'square', roof: 'rack' }],
    ['suv_gray', 'suv', '#5c5c68', 0.9, { lights: 'square', roof: 'rack' }],
    ['van_white', 'van', '#e4e6e0', 0.88, { lights: 'square' }],
    ['pickup_red', 'pickup', '#b8202a', 0.95, { lights: 'square' }],
  ];
  for (const [id, body, col, spd, det] of gen) out.push(civil(id, mk(id, body, pal(col), det), spd));

  // ── taxis ──────────────────────────────────────────────────────────────────
  const pNY = pal('#f2c018', { accent: P.black, glass: GLASS_DARK });
  out.push(civil('taxi_yellow', mk('taxi_yellow', 'taxi', pNY, { lights: 'square' }, 14, (p) => {
    checkerBand(p, 0.5, 0.62, 4, 3, '#14141c');
    taxiSign(p, '#f2c018');
  }), 1.0));

  const pJP = pal('#15151d', { accent: '#f0c020', light: '#3a3a46', glass: GLASS_DARK });
  out.push(civil('taxi_jp', mk('taxi_jp', 'luxury', pJP, { lights: 'square' }, 14, (p) => {
    bandY(p, 0.47, 0.5, '#f0c020');
    const r = roofPod(p, Math.max(10, Math.round(p.w * 0.2)), Math.max(6, Math.round(p.h * 0.12)), P.black, '#f0a018');
    p.hline(r.x + 1, r.x + r.w - 2, r.y + 1, '#ffe870', 'in');
    p.rect(p.w / 2 - 6, yf(p, 0.63), 4, 4, '#20b040', 'body'); // 空車 lamp
  }), 0.95));

  const pDE = pal('#e2d3a4', { accent: P.black, glass: GLASS });
  out.push(civil('taxi_de', mk('taxi_de', 'taxi', pDE, { lights: 'strip' }, 14, (p) => {
    taxiSign(p, '#f0f0e8');
    p.hline(2, p.w - 3, yf(p, 0.83), '#b8b8b0', 'body');
  }), 1.05));

  const pLDN = pal('#17171f', { accent: '#f0c020', light: '#38384a', glass: GLASS_DARK });
  out.push(civil('taxi_black', mk('taxi_black', 'taxi', pLDN, { lights: 'round', extra: 'classic' }, 14, (p) => {
    taxiSign(p, '#f0c020');
    bandY(p, 0.72, 0.75, '#f0c020');
  }), 0.9));

  const pHK = pal('#c81c22', { accent: '#c8ccd4', glass: GLASS_DARK });
  out.push(civil('taxi_hk', mk('taxi_hk', 'taxi', pHK, { lights: 'square' }, 14, (p) => {
    roofPaint(p, Math.max(3, Math.round(p.h * 0.09)), '#c2c6d0');
    taxiSign(p, '#eceee8', 'TAXI', '#c81c22');
  }), 1.0));

  const pIST = pal('#f0b000', { accent: P.black, glass: GLASS_DARK });
  out.push(civil('taxi_istanbul', mk('taxi_istanbul', 'taxi', pIST, { lights: 'square' }, 14, (p) => {
    checkerBand(p, 0.52, 0.58, 3, 3, '#14141c');
    taxiSign(p, '#f0b000', 'TAKSI');
  }), 1.05));

  const pDOL = pal('#f0c020', { accent: '#1e50b4', glass: GLASS });
  out.push(civil('dolmus', mk('dolmus', 'van', pDOL, { lights: 'square' }, 12, (p) => {
    destBoard(p, 'DOLMUS', '#14141c', '#f0c020');
    bandY(p, 0.6, 0.64, '#1e50b4');
  }), 0.9));

  const pEV = pal('#16a45e', { accent: '#eceee8', glass: GLASS });
  out.push(civil('ev_taxi', mk('ev_taxi', 'taxi', pEV, { lights: 'strip' }, 14, (p) => {
    roofPaint(p, Math.max(3, Math.round(p.h * 0.1)), '#eceee8');
    taxiSign(p, '#eceee8', 'EV', '#16a45e');
    p.rect(p.w / 2 + 6, yf(p, 0.6), 3, 3, '#40e0f0', 'body');
  }), 1.0));

  const pBCN = pal('#f0c418', { accent: P.black, glass: GLASS_DARK });
  out.push(civil('seat_yellow', mk('seat_yellow', 'hatch', pBCN, { lights: 'square' }, 14, (p) => {
    lowerPaint(p, 0.62, '#15151d');
    taxiSign(p, '#f0c418');
    p.rect(p.w / 2 + 8, yf(p, 0.52), 3, 3, '#20b040', 'body');
  }), 1.0));

  const pVOC = pal('#1f9c46', { accent: '#eceee8', glass: GLASS });
  out.push(civil('vocho', mk('vocho', 'coupe', pVOC, { lights: 'round', extra: 'classic' }, 14, (p) => {
    roofPaint(p, Math.max(4, Math.round(p.h * 0.13)), '#eceee8');
    taxiSign(p, '#eceee8', 'TAXI', '#1f9c46');
  }), 0.9));

  // ── police ─────────────────────────────────────────────────────────────────
  const pPolDe = pal('#c4c8d2', { accent: '#1a3ca8', glass: GLASS });
  out.push(civil('police_de', mk('police_de', 'police', pPolDe, { lights: 'square' }, 14, (p) => {
    bandY(p, 0.4, 0.54, '#1a3ca8');
    if (p.w >= 44) p.textMid('POLIZEI', p.w / 2, yf(p, 0.43), '#eceee8', 'in');
    lightbar(p, '#2a5cf0', '#2a5cf0');
  }), 1.1));

  const pPolUs = pal('#eceee8', { accent: '#14141c', glass: GLASS_DARK });
  out.push(civil('police_us', mk('police_us', 'police', pPolUs, { lights: 'square' }, 14, (p) => {
    lowerPaint(p, 0.68, '#14141c');
    if (p.w >= 36) p.textMid('POLICE', p.w / 2, yf(p, 0.5), '#14141c', 'body');
    lightbar(p);
  }), 1.1));

  const pPolJp = pal('#eceee8', { accent: '#14141c', glass: GLASS });
  out.push(civil('police_jp', mk('police_jp', 'police', pPolJp, { lights: 'square' }, 14, (p) => {
    lowerPaint(p, 0.66, '#14141c');
    lightbar(p, '#e0202a', '#e0202a', true);
  }), 1.05));

  const pPolUk = pal('#eceee8', { accent: '#f0c020', glass: GLASS });
  out.push(civil('police_uk', mk('police_uk', 'police', pPolUk, { lights: 'square' }, 14, (p) => {
    // battenburg: one pass, otherwise the first colour would stop the second from seeing body pixels
    const y0 = yf(p, 0.44), y1 = yf(p, 0.74), ch = Math.max(3, Math.round((y1 - y0) / 2));
    const cw = Math.max(4, Math.round(p.w * 0.11));
    for (let y = y0; y <= y1; y++) for (let x = 0; x < p.w; x++) {
      const on = ((((x / cw) | 0) + (((y - y0) / ch) | 0)) & 1) === 0;
      p.px(x, y, on ? '#f0c020' : '#1a3ca8', 'body');
    }
    lightbar(p);
  }), 1.1));

  // ── three-wheelers & scooters ──────────────────────────────────────────────
  const pTuk = pal('#16a0c0', { accent: '#f0c020', glass: GLASS });
  out.push(civil('tuktuk', mk('tuktuk', 'tuktuk', pTuk, { lights: 'round', roof: 'hard' }, 12, (p) => {
    roofPaint(p, Math.max(3, Math.round(p.h * 0.1)), '#f0c020');
    bandY(p, 0.55, 0.58, '#f0c020');
  }), 0.7));

  const pRick = pal('#f0c020', { accent: '#14141c', glass: GLASS });
  out.push(civil('rickshaw_in', mk('rickshaw_in', 'tuktuk', pRick, { lights: 'round', roof: 'hard' }, 12, (p) => {
    roofPaint(p, Math.max(4, Math.round(p.h * 0.16)), '#14141c');
    lowerPaint(p, 0.78, '#14141c');
  }), 0.7));

  out.push(civil('scooter_pack', scooterPack(), 0.7));

  // ── city cars ──────────────────────────────────────────────────────────────
  const pKei = pal('#e8eae4', { accent: '#17a08c', glass: GLASS });
  out.push(civil('kei_van', mk('kei_van', 'kei', pKei, { lights: 'square', roof: 'hard' }, 10, (p) => {
    bandY(p, 0.68, 0.72, '#17a08c');                             // shop van livery, low stripe
    for (const dx of [-7, 0, 7]) p.rect(p.w / 2 + dx - 1, yf(p, 0.58), 3, 3, '#ffb7d0', 'body'); // sakura decals
  }), 0.9));

  const pLada = pal('#cdbf98', { accent: '#8a8a92', glass: GLASS });
  out.push(civil('lada', mk('lada', 'sedan', pLada, { lights: 'square', roof: 'rack', extra: 'classic' }, 12, (p) => {
    p.hline(3, p.w - 4, yf(p, 0.8), '#c8ccd4', 'body');
    const r = roofInfo(p);
    p.rect((p.w >> 1) - Math.round(p.w * 0.2), r.plane - 3, Math.round(p.w * 0.4), 3, '#7a4a20');
    p.hline((p.w >> 1) - Math.round(p.w * 0.2), (p.w >> 1) + Math.round(p.w * 0.2) - 1, r.plane - 3, P.black);
  }), 0.85));

  const pTrab = pal('#a8d0b0', { accent: '#eceee8', glass: GLASS });
  out.push(civil('trabant', mk('trabant', 'kei', pTrab, { lights: 'round', extra: 'classic' }, 10, (p) => {
    roofPaint(p, Math.max(3, Math.round(p.h * 0.09)), '#eceee8');
  }), 0.85));

  const p2cv = pal('#7f97b2', { accent: '#3a3a48', glass: GLASS });
  out.push(civil('citroen_2cv', mk('citroen_2cv', 'hatch', p2cv, { lights: 'round', roof: 'open', extra: 'classic' }, 10, (p) => {
    const r = roofInfo(p);
    const w = Math.round(p.w * 0.42);
    p.rect((p.w >> 1) - (w >> 1), r.plane, w, Math.max(2, Math.round(p.h * 0.07)), '#43434e', 'in'); // rolled canvas roof
    for (let x = 3; x < p.w - 3; x += 3) p.vline(x, yf(p, 0.74), yf(p, 0.82), shade('#7f97b2', -0.25), 'body'); // corrugation
  }), 0.85));

  const pLow = pal('#7a2ec0', { accent: '#ffd040', glass: GLASS_DARK, wheel: '#e8e8e0', chrome: '#ffd040' });
  out.push(civil('lowrider_traffic', mk('lowrider_traffic', 'lowrider', pLow, { lights: 'square', extra: 'hydraulics' }, 10, (p) => {
    bandY(p, 0.5, 0.52, '#ffd040');
    bandY(p, 0.56, 0.57, '#ff90c0');
    p.hline(2, p.w - 3, yf(p, 0.84), '#ffd040', 'body');
  }), 0.85));

  const pLimo = pal('#f0f0ea', { accent: '#d8d8e0', glass: '#12161e', chrome: '#e0e4ee' });
  out.push(civil('limo_stretch', mk('limo_stretch', 'limo', pLimo, { lights: 'strip' }, 10, (p) => {
    p.hline(2, p.w - 3, yf(p, 0.82), '#d8dce8', 'body');
    p.hline(2, p.w - 3, yf(p, 0.46), '#d8dce8', 'body');
  }), 0.9));

  const pGold = pal('#f0c024', { accent: '#14141c', glass: '#101620', light: '#ffe870', chrome: '#ffd040' });
  out.push(civil('supercar_gold', mk('supercar_gold', 'hyper', pGold, { lights: 'strip', spoiler: 'bigwing', exhaust: 4, extra: 'wide' }, 10, (p) => {
    bandY(p, 0.9, 0.94, '#14141c', 'in');
  }), 1.3));

  const pMicro = pal('#e8e8e0', { accent: '#1e50b4', glass: GLASS });
  out.push(civil('microbus', mk('microbus', 'van', pMicro, { lights: 'square' }, 10, (p) => {
    bandY(p, 0.5, 0.56, '#1e50b4');
    bandY(p, 0.58, 0.59, '#14141c');
  }), 0.9));

  const pMini = pal('#eceee8', { accent: '#d02028', glass: GLASS });
  out.push(civil('minibus_taxi', mk('minibus_taxi', 'van', pMini, { lights: 'square' }, 10, (p) => {
    bandY(p, 0.46, 0.52, '#d02028');
    bandY(p, 0.53, 0.55, '#1e50b4');
    if (p.w >= 40) p.textMid('TAXI', p.w / 2, yf(p, 0.64), '#d02028', 'body');
  }), 1.0));

  const pUte = pal('#e07818', { accent: '#14141c', glass: GLASS });
  out.push(civil('ute', mk('ute', 'pickup', pUte, { lights: 'square' }, 16, (p) => {
    const r = roofInfo(p), bw = Math.round(p.w * 0.56), x = (p.w >> 1) - (bw >> 1), h = Math.max(6, Math.round(p.h * 0.16));
    p.rect(x, r.plane - h, 3, h, '#22222c');                    // roll bar
    p.rect(x + bw - 3, r.plane - h, 3, h, '#22222c');
    p.rect(x, r.plane - h, bw, 3, '#22222c');
    p.rect(x + 4, r.plane - h + 1, bw - 8, 1, '#f0c020');
    bandY(p, 0.62, 0.64, '#14141c');
  }), 1.0));

  const pJeep = pal('#e8eae4', { accent: '#14141c', glass: GLASS_DARK });
  out.push(civil('superjeep', mk('superjeep', 'suv', pJeep, { lights: 'quad', roof: 'rack', bumper: 'bull', extra: 'lifted' }, 16, (p) => {
    lowerPaint(p, 0.72, '#22222c');
    const r = roofInfo(p), bw = Math.round(p.w * 0.66), x = (p.w >> 1) - (bw >> 1);
    p.rect(x, r.plane - 4, bw, 2, '#22222c');
    for (let i = 0; i < 4; i++) {
      const lx = x + 2 + Math.round((i * (bw - 6)) / 3);
      p.rect(lx, r.plane - 7, 4, 3, '#ffe870'); p.frame(lx - 1, r.plane - 8, 6, 5, P.black);
    }
  }), 0.9));

  const pSong = pal('#c8202a', { accent: '#eceee8', glass: GLASS });
  out.push(civil('songthaew', mk('songthaew', 'pickup', pSong, { lights: 'square' }, 20, (p) => {
    const r = roofInfo(p), bw = Math.max(14, Math.round(p.w * 0.74)), x = (p.w >> 1) - (bw >> 1);
    const h = Math.max(10, Math.round(p.h * 0.3));
    p.frame(x, r.plane - h, bw, h + 1, P.black, '#c8202a');     // canopy
    p.rect(x + 3, r.plane - h + 3, bw - 6, h - 4, '#2a1418');   // open rear with benches
    p.rect(x + 4, r.plane - 5, bw - 8, 2, '#7a4a20');
    p.vline((p.w >> 1) - 2, r.plane - h + 4, r.plane - 2, '#c8ccd4');  // ladder
    p.vline((p.w >> 1) + 2, r.plane - h + 4, r.plane - 2, '#c8ccd4');
    for (let y = r.plane - h + 6; y < r.plane - 2; y += 3) p.hline((p.w >> 1) - 2, (p.w >> 1) + 2, y, '#c8ccd4');
    p.hline(x + 1, x + bw - 2, r.plane - h + 1, '#eceee8');
  }), 0.9));

  // ── buses that belong to one city ──────────────────────────────────────────
  const pSeoul = pal('#1b4fc8', { accent: '#eceee8', glass: GLASS });
  out.push(civil('bus_blue', mk('bus_blue', 'bus', pSeoul, { lights: 'square' }, 12, (p) => {
    bandY(p, 0.52, 0.58, '#eceee8');
    destBoard(p, '470', '#14141c', '#ffb020');
  }), 0.88));

  const pRio = pal('#f0c020', { accent: '#1e50b4', glass: GLASS });
  out.push(civil('bus_rio', mk('bus_rio', 'bus', pRio, { lights: 'square' }, 12, (p) => {
    bandY(p, 0.46, 0.56, '#1e50b4');
    destBoard(p, 'RIO', '#14141c', '#20e060');
  }), 0.88));

  // ── Mumbai Tata truck (city-specific, wildly decorated) ────────────────────
  const pTata = pal('#1c74c8', { accent: '#f0c020', glass: GLASS });
  out.push(civil('truck_indian', mk('truck_indian', 'truck', pTata, { lights: 'square' }, 12, (p) => {
    bandY(p, 0.2, 0.26, '#e0202a', 'body');
    bandY(p, 0.27, 0.3, '#f0c020', 'body');
    bandY(p, 0.31, 0.34, '#20b040', 'body');
    rowBand(p, 0.5, 0.58, 0.08, () => '#14141c', 'in');          // painted "HORN OK PLEASE" plaque
    if (p.w >= 44) p.textMid('HORN OK', p.w / 2, yf(p, 0.52), '#f0c020', 'in');
    for (let x = 4; x < p.w - 4; x += 6) {                       // painted lotus dots
      p.px(x, yf(p, 0.42), '#ff90c0', 'body'); p.px(x + 1, yf(p, 0.43), '#f0c020', 'body'); p.px(x - 1, yf(p, 0.43), '#f0c020', 'body');
    }
    const e = p.edges(yf(p, 0.72));
    if (e) for (let x = e[0] + 2; x < e[1] - 1; x += 3) {         // tassels under the tailgate
      const c = [P.red, P.yellow, P.green, P.pinkLight][(x >> 1) % 4];
      p.vline(x, yf(p, 0.72), yf(p, 0.72) + 3, c, 'any');
    }
  }), 0.85));

  // ── heavies ────────────────────────────────────────────────────────────────
  const pTramDe = pal('#d02028', { accent: '#eceee8', glass: GLASS });
  out.push(heavy('tram_de', mk('tram_de', 'tram', pTramDe, { lights: 'strip' }, 12, (p) => {
    bandY(p, 0.3, 0.44, '#eceee8');
    if (p.w >= 56) p.textMid('RHEINBAHN', p.w / 2, yf(p, 0.34), '#d02028', 'in');
    destBoard(p, '709', '#14141c', '#ffb020');
    bandY(p, 0.88, 0.92, '#14141c', 'in');
  }), 0.85));

  const pTramHk = pal('#1a8a4a', { accent: '#f0c020', glass: GLASS });
  out.push(heavy('tram_hk', mk('tram_hk', 'tram', pTramHk, { lights: 'square', extra: 'doubledeck' }, 12, (p) => {
    const y0 = yf(p, 0.24), y1 = yf(p, 0.38);
    const ad = ['#e0202a', '#f0c020', '#2040e0', '#eceee8'];
    for (let y = y0; y <= y1; y++) for (let x = 0; x < p.w; x++) p.px(x, y, ad[((x / Math.max(4, p.w >> 3)) | 0) % ad.length], 'body');
    p.hline(1, p.w - 2, y0 - 1, '#14141c', 'in'); p.hline(1, p.w - 2, y1 + 1, '#14141c', 'in');
    destBoard(p, 'HK', '#14141c', '#ffb020');
  }), 0.8));

  const pDouble = pal('#d02028', { accent: '#eceee8', glass: GLASS });
  out.push(heavy('bus_double', mk('bus_double', 'bus', pDouble, { lights: 'square', extra: 'doubledeck' }, 12, (p) => {
    bandY(p, 0.46, 0.5, '#eceee8');
    destBoard(p, '38', '#14141c', '#ffb020');
    if (p.w >= 44) p.textMid('LONDON', p.w / 2, yf(p, 0.62), '#eceee8', 'body');
  }), 0.85));

  const pBeer = pal('#1a4fa0', { accent: '#eceee8', glass: GLASS });
  out.push(heavy('beer_truck', mk('beer_truck', 'truck', pBeer, { lights: 'square' }, 12, (p) => {
    const y0 = yf(p, 0.22), rows = 2, bw = Math.max(6, Math.round(p.w * 0.16)), bh = Math.max(7, Math.round(p.h * 0.2));
    for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) {
      const x = Math.round(p.w * 0.1) + c * (bw + 1), y = y0 + r * (bh + 1);
      p.rect(x, y, bw, bh, '#c08038', 'in');
      p.rect(x + 1, y + 1, bw - 2, bh - 2, '#d8a050', 'in');
      p.hline(x, x + bw - 1, y + 2, '#6a4a20', 'in'); p.hline(x, x + bw - 1, y + bh - 3, '#6a4a20', 'in');
      p.vline(x, y, y + bh - 1, '#14141c', 'in'); p.vline(x + bw - 1, y, y + bh - 1, '#14141c', 'in');
    }
    bandY(p, 0.66, 0.72, '#eceee8', 'body');
    if (p.w >= 44) p.textMid('BIER', p.w / 2, yf(p, 0.67), '#1a4fa0', 'in');
  }), 0.85));

  const pDeko = pal('#d4d8e4', { accent: '#ffd040', glass: '#101620', chrome: '#eef0f8' });
  out.push(heavy('dekotora_traffic', mk('dekotora_traffic', 'truck', pDeko, { lights: 'strip', extra: 'neon' }, 12, (p) => {
    // rear.ts already draws the chrome box, accent rows and DEKO/TORA lettering for extra 'neon' —
    // this only adds the gold flank panel and the underglow.
    bandY(p, 0.66, 0.71, '#ffd040', 'body');
    neonTrim(p, ['#40e0f0', '#e04080', '#ffd040', '#20e060']);
  }), 0.95));

  const pTank = pal('#c4c8d2', { accent: '#f07020', glass: GLASS });
  out.push(heavy('tanker', mk('tanker', 'truck', pTank, { lights: 'square' }, 12, (p) => {
    const r = Math.max(6, Math.round(Math.min(p.w * 0.3, p.h * 0.3))), cy = yf(p, 0.36);
    drum(p, cy, r, (x, y, d) => (d > r - 1 ? '#5a5a66' : y < -r * 0.3 ? '#e0e4ee' : y > r * 0.4 ? '#9aa0ac' : '#c8ccd8'));
    p.ring((p.w >> 1), cy, Math.max(2, r - 3), '#8a90a0', 'in');
    p.vline(p.w >> 1, cy - r + 1, cy + r - 1, '#8a90a0', 'in');
    p.rect((p.w >> 1) - 4, cy + r - 3, 9, 5, '#f07020', 'in');
    p.rect((p.w >> 1) - 3, cy + r - 2, 7, 3, '#ffd040', 'in');
  }), 0.88));

  const pMix = pal('#d8d8d0', { accent: '#f07020', glass: GLASS });
  out.push(heavy('cement_mixer', mk('cement_mixer', 'truck', pMix, { lights: 'square' }, 12, (p) => {
    const r = Math.max(7, Math.round(Math.min(p.w * 0.32, p.h * 0.32))), cy = yf(p, 0.34);
    drum(p, cy, r, (x, y, d) => (d > r - 1 ? '#5a5a66' : d < r * 0.42 ? '#2a2a34' : (x + y * 2) % 10 < 5 ? '#f07020' : '#eceee8'));
    p.ring(p.w >> 1, cy, Math.max(2, Math.round(r * 0.45)), '#14141c', 'in');
    chevrons(p, 0.86, 0.92, '#f07020', '#14141c');
  }), 0.85));

  const pSemi = pal('#2450b8', { accent: '#eceee8', glass: GLASS });
  out.push(heavy('truck_semi', mk('truck_semi', 'truck', pSemi, { lights: 'square' }, 12, (p) => {
    bandY(p, 0.18, 0.62, '#e8eae4', 'body');                    // box trailer
    p.vline(p.w >> 1, yf(p, 0.18), yf(p, 0.62), '#9a9aa4', 'in'); // door seam
    p.vline((p.w >> 1) - 1, yf(p, 0.18), yf(p, 0.62), '#b8b8b8', 'in');
    for (const fx of [0.24, 0.76]) p.vline(Math.round(p.w * fx), yf(p, 0.3), yf(p, 0.5), '#9a9aa4', 'in');
    bandY(p, 0.63, 0.67, '#2450b8', 'body');
    chevrons(p, 0.84, 0.88, '#e0202a', '#eceee8');
  }), 0.9));

  const pCity = pal('#e8eae4', { accent: '#16a45e', glass: GLASS });
  out.push(heavy('bus_city', mk('bus_city', 'bus', pCity, { lights: 'square' }, 12, (p) => {
    bandY(p, 0.5, 0.58, '#16a45e');
    bandY(p, 0.59, 0.61, '#14a0c0');
    destBoard(p, '12', '#14141c', '#ffb020');
  }), 0.88));

  const pGarb = pal('#2f6b3a', { accent: '#f0c020', glass: GLASS });
  out.push(heavy('garbage_truck', mk('garbage_truck', 'truck', pGarb, { lights: 'square' }, 12, (p) => {
    const y0 = yf(p, 0.3), y1 = yf(p, 0.72);
    for (let y = y0; y <= y1; y++) {                            // rear hopper
      const e = p.edges(y);
      if (!e) continue;
      const inset = 3 + Math.round(((y - y0) / Math.max(1, y1 - y0)) * 3);
      p.hline(e[0] + inset, e[1] - inset, y, y < y0 + 3 ? '#4a4a56' : '#3a3a46', 'in');
    }
    for (const fx of [0.22, 0.78]) p.vline(Math.round(p.w * fx), y0 + 2, y1 - 2, '#c8ccd4', 'in'); // hydraulic rams
    chevrons(p, 0.74, 0.82, '#f0c020', '#14141c');
  }), 0.8));

  // ── bosses (≈1.3× the heavies) ─────────────────────────────────────────────
  const pBossTruck = pal('#17171f', { accent: '#e0202a', light: '#3a3a48', glass: '#101620', chrome: '#c8ccd4' });
  out.push(bossT('boss_truck', mk('boss_truck', 'truck', pBossTruck, { lights: 'quad', bumper: 'ram', extra: 'wide' }, 12, (p) => {
    const s = p.w >= 90 ? 2 : 1;
    p.stamp(SKULL, (p.w >> 1) - Math.round((9 * s) / 2), yf(p, 0.26), { '#': '#eceee8', o: '#14141c' }, s, 'in');
    bandY(p, 0.5, 0.52, '#e0202a', 'body');
    chevrons(p, 0.86, 0.92, '#e0202a', '#14141c');
    for (let x = 3; x < p.w - 3; x += 6) p.px(x, yf(p, 0.18), '#ffb020', 'in');
  }), 8, 0.95));

  const pBossTank = pal('#4a5a30', { accent: '#2e3a1e', light: '#6a7a46', glass: '#1a2016', wheel: '#22221a', chrome: '#8a8a76' });
  out.push(bossT('boss_tank', mk('boss_tank', 'tank', pBossTank, { roof: 'turret', extra: 'cannonLong' }, 12, (p) => {
    for (let y = yf(p, 0.2); y < p.h; y += 3) for (let x = (y * 7) % 11; x < p.w; x += 11) {  // camo blotches
      p.ellipse(x, y, 3, 2, (x + y) % 2 ? '#2e3a1e' : '#6a5a34', 'body');
    }
    const s = p.w >= 90 ? 3 : 2;                                  // red star on the hull
    p.stamp(['..#..', '.###.', '#####', '.###.', '##.##'], (p.w >> 1) - Math.round((5 * s) / 2), yf(p, 0.4), { '#': '#e0202a' }, s, 'in');
    chevrons(p, 0.9, 0.94, '#f0c020', '#14141c');
  }), 10, 0.85));

  const pBossBus = pal('#2a1420', { accent: '#e0202a', light: '#4a2434', glass: '#12161e' });
  out.push(bossT('boss_bus', mk('boss_bus', 'bus', pBossBus, { lights: 'quad', bumper: 'bull', extra: 'doubledeck' }, 12, (p) => {
    const s = p.w >= 90 ? 2 : 1;
    p.stamp(SKULL, (p.w >> 1) - Math.round((9 * s) / 2), yf(p, 0.3), { '#': '#e0202a', o: '#14141c' }, s, 'in');
    for (let y = yf(p, 0.2); y <= yf(p, 0.28); y++) for (let x = 0; x < p.w; x++) p.px(x, y, (x + y) % 6 < 3 ? '#4a2434' : '#2a1420', 'body');
    bandY(p, 0.62, 0.64, '#e0202a', 'body');
    chevrons(p, 0.88, 0.94, '#e0202a', '#14141c');
  }), 6, 1.0));

  return out;
}

let CACHE: TrafficTemplate[] | null = null;
/** All traffic templates: generic civilians, city-specific vehicles, heavies and bosses. */
export function trafficTemplates(): TrafficTemplate[] {
  if (!CACHE) CACHE = build();
  return CACHE;
}
export function trafficTemplate(id: string): TrafficTemplate | undefined { return trafficTemplates().find((t) => t.id === id); }
