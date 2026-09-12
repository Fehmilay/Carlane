import type { Renderer } from '../core/Renderer';
import type { PointerEv, Rect, BrandId } from '../core/types';
import { inRect } from '../core/types';
import type { Game } from '../core/Game';
import { P, mix } from '../core/Palette';
import { Grid, buildSprite, type PixelSprite } from '../core/Sprite';
import { kanjiSprite } from '../core/Kanji';
import { Ease } from '../core/Tween';
import './strings';

// ─────────────────────────────────────────────────────────────────────────────
// CARLANE UI kit — Game-Boy-bezel panels, numbered cards, buttons, toggles,
// scroll lists, dialogs, toasts and pixel decorations. Everything draws in the
// 240-px-wide low-res space.
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Gray Game-Boy shell frame with rounded corners, inner black frame and screws. */
export function drawBezel(r: Renderer, x: number, y: number, w: number, h: number, inner: string = P.black): void {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  r.fillRect(x + 2, y, w - 4, h, P.paper);
  r.fillRect(x, y + 2, w, h - 4, P.paper);
  r.fillRect(x + 1, y + 1, 1, 1, P.paper); r.fillRect(x + w - 2, y + 1, 1, 1, P.paper);
  r.fillRect(x + 1, y + h - 2, 1, 1, P.paper); r.fillRect(x + w - 2, y + h - 2, 1, 1, P.paper);
  // shading
  r.fillRect(x + 2, y + h - 3, w - 4, 2, P.paperDark);
  r.fillRect(x + w - 3, y + 2, 2, h - 4, P.paperDark);
  // inner screen frame
  r.fillRect(x + 4, y + 4, w - 8, h - 8, P.ink);
  r.fillRect(x + 5, y + 5, w - 10, h - 10, inner);
  // screws
  for (const [sx, sy] of [[x + 3, y + 3], [x + w - 5, y + 3], [x + 3, y + h - 5], [x + w - 5, y + h - 5]] as [number, number][]) {
    r.fillRect(sx, sy, 2, 2, P.gray2); r.fillRect(sx, sy, 1, 1, P.gray1);
  }
}

/** Black panel with a light 1-px border and optional title tab. */
export function drawPanel(r: Renderer, rect: Rect, opts: { title?: string; color?: string; fill?: string; alpha?: number } = {}): void {
  const c = opts.color ?? P.gray2;
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  r.fillRect(x, y, w, h, opts.fill ?? P.ink, opts.alpha);
  r.strokeRect(x, y, w, h, c);
  r.fillRect(x + 1, y + 1, w - 2, 1, mix(opts.fill ?? P.ink, '#ffffff', 0.08));
  if (opts.title) {
    const tw = r.textWidth(opts.title) + 8;
    r.fillRect(x + 4, y - 4, tw, 9, c);
    r.text(opts.title, x + 8, y - 3, { color: P.black });
  }
}

/** Numbered vehicle/level card like the reference sheet. Returns the inner art rect. */
export function drawCard(r: Renderer, rect: Rect, o: { num?: number; title?: string; sub?: string; badge?: BrandId; selected?: boolean; locked?: boolean; accent?: string; bg?: string }): Rect {
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  const accent = o.accent ?? P.gray2;
  r.fillRect(x, y, w, h, P.black);
  r.fillRect(x + 1, y + 1, w - 2, h - 2, o.bg ?? P.dark);
  // header strip
  r.fillRect(x + 1, y + 1, w - 2, 9, P.black);
  if (o.num !== undefined) {
    r.fillRect(x + 1, y + 1, 14, 9, o.selected ? P.red : P.gray3);
    r.text(String(o.num).padStart(2, '0'), x + 3, y + 2, { color: P.white });
  }
  if (o.title) r.text(o.title, x + (o.num !== undefined ? 17 : 3), y + 2, { color: o.locked ? P.gray1 : P.white });
  if (o.badge) drawBrand(r, o.badge, x + w - 11, y + 2);
  // frame
  r.strokeRect(x, y, w, h, o.selected ? P.red : accent);
  if (o.selected) r.strokeRect(x + 1, y + 1, w - 2, h - 2, P.red);
  if (o.sub) r.text(o.sub, x + 3, y + h - 9, { color: o.locked ? P.gray1 : P.yellow });
  return { x: x + 2, y: y + 11, w: w - 4, h: h - 13 };
}

/** Dim + padlock overlay for a locked card. Call AFTER drawing the card art. */
export function drawCardLock(r: Renderer, rect: Rect): void {
  const x = Math.round(rect.x), y = Math.round(rect.y), w = Math.round(rect.w), h = Math.round(rect.h);
  r.fillRect(x + 1, y + 10, w - 2, h - 11, P.black, 0.5);
  for (let j = y + 11; j < y + h - 1; j += 3) r.fillRect(x + 1, j, w - 2, 1, P.black, 0.3);
  drawDeco(r, 'lock', x + w / 2 - 5, y + h / 2 - 8, 1, P.gray1);
}

export type ButtonStyle = 'primary' | 'secondary' | 'pill' | 'round' | 'ghost';

/** Touch button with press feedback. */
export class Button {
  rect: Rect;
  label: string;
  style: ButtonStyle;
  color: string;
  disabled = false;
  hidden = false;
  icon?: string;
  sub?: string;
  private press = 0;
  private downIn = false;
  onTap: (() => void) | null = null;
  constructor(rect: Rect, label: string, o: { style?: ButtonStyle; color?: string; icon?: string; sub?: string; onTap?: () => void } = {}) {
    this.rect = rect; this.label = label;
    this.style = o.style ?? 'primary';
    this.color = o.color ?? P.red;
    this.icon = o.icon; this.sub = o.sub;
    this.onTap = o.onTap ?? null;
  }
  /** Handle a pointer event; returns true if it consumed the event. */
  handle(ev: PointerEv, g?: Game): boolean {
    if (this.hidden || this.disabled) return false;
    const inside = inRect(this.rect, ev.x, ev.y);
    if (ev.kind === 'down' && inside) { this.downIn = true; this.press = 1; g?.audio.sfx('ui'); g?.haptics.tick(); return true; }
    if (ev.kind === 'up') {
      const was = this.downIn;
      this.downIn = false;
      if (was && inside) { this.onTap?.(); return true; }
    }
    if (ev.kind === 'cancel') this.downIn = false;
    return false;
  }
  update(dt: number): void { if (this.press > 0 && !this.downIn) this.press = Math.max(0, this.press - dt * 6); }
  draw(r: Renderer): void {
    if (this.hidden) return;
    const b = this.rect;
    const off = this.downIn ? 1 : 0;
    const col = this.disabled ? P.gray3 : this.color;
    const txt = this.disabled ? P.gray1 : P.white;
    if (this.style === 'round') {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + off, rad = b.w / 2;
      r.disc(cx, cy + 1, rad, P.black, 0.5);
      r.disc(cx, cy, rad, P.black);
      r.disc(cx, cy, rad - 1, col);
      r.disc(cx, cy - 1, rad - 3, mix(col, '#ffffff', 0.25));
      if (this.icon) drawDeco(r, this.icon, cx - 8, cy - 8, 1, txt);
      else r.text(this.label, cx, cy - 3, { align: 'center', color: txt, outline: P.black });
      return;
    }
    if (this.style === 'ghost') {
      r.strokeRect(b.x, b.y + off, b.w, b.h, col);
      r.text(this.label, b.x + b.w / 2, b.y + off + Math.round((b.h - 7) / 2), { align: 'center', color: this.disabled ? P.gray1 : col });
      return;
    }
    const rad = this.style === 'pill' ? 2 : 0;
    // shadow
    r.fillRect(b.x, b.y + 2, b.w, b.h, P.black, 0.45);
    r.fillRect(b.x + rad, b.y + off, b.w - rad * 2, b.h, P.black);
    r.fillRect(b.x, b.y + off + rad, b.w, b.h - rad * 2, P.black);
    const ix = b.x + 1, iy = b.y + off + 1, iw = b.w - 2, ih = b.h - 2;
    r.fillRect(ix + rad, iy, iw - rad * 2, ih, col);
    r.fillRect(ix, iy + rad, iw, ih - rad * 2, col);
    r.fillRect(ix + rad, iy, iw - rad * 2, 1, mix(col, '#ffffff', 0.35));
    r.fillRect(ix + rad, iy + ih - 1, iw - rad * 2, 1, mix(col, '#000000', 0.35));
    const tx = b.x + b.w / 2;
    if (this.icon && b.h >= 24) {
      // stacked: icon on top, label underneath (keeps wide labels inside the button)
      drawDeco(r, this.icon, tx - 5, b.y + off + 3, 1, txt);
      r.text(this.label, tx, b.y + off + b.h - 10, { align: 'center', color: txt, outline: P.black });
      return;
    }
    const ty = b.y + off + Math.round((b.h - (this.sub ? 12 : 7)) / 2);
    if (this.icon) drawDeco(r, this.icon, b.x + 3, b.y + off + Math.round((b.h - 10) / 2), 1, txt);
    r.text(this.label, tx + (this.icon ? 5 : 0), ty, { align: 'center', color: txt, outline: P.black });
    if (this.sub) r.text(this.sub, tx, ty + 9, { align: 'center', color: mix(txt, col, 0.35) });
  }
}

/** On/off switch. */
export class Toggle {
  constructor(public rect: Rect, public label: string, public value: boolean, public onChange: (v: boolean) => void) {}
  handle(ev: PointerEv, g?: Game): boolean {
    if (ev.kind !== 'down' || !inRect(this.rect, ev.x, ev.y)) return false;
    this.value = !this.value;
    this.onChange(this.value);
    g?.audio.sfx('ui'); g?.haptics.tick();
    return true;
  }
  draw(r: Renderer): void {
    const b = this.rect;
    r.text(this.label, b.x, b.y + Math.round((b.h - 7) / 2), { color: P.white });
    const sw = 26, sx = b.x + b.w - sw, sy = b.y + Math.round((b.h - 12) / 2);
    r.fillRect(sx, sy, sw, 12, P.black);
    r.fillRect(sx + 1, sy + 1, sw - 2, 10, this.value ? P.green : P.gray3);
    const kx = this.value ? sx + sw - 12 : sx + 1;
    r.fillRect(kx, sy + 1, 11, 10, P.white);
    r.fillRect(kx + 1, sy + 2, 9, 8, P.paper);
  }
}

/** 0..3 stars with pop-in animation (t = seconds since shown). */
export function drawStars(r: Renderer, cx: number, y: number, stars: number, max = 3, scale = 1, t = 99): void {
  const gap = 10 * scale;
  const x0 = cx - ((max - 1) * gap) / 2;
  for (let i = 0; i < max; i++) {
    const on = i < stars;
    const appear = clamp((t - i * 0.25) * 4, 0, 1);
    const s = on ? scale * (0.6 + Ease.outBack(appear) * 0.4) : scale;
    if (on && appear <= 0) continue;
    drawDeco(r, on ? 'star' : 'starEmpty', x0 + i * gap - 4 * s, y - 4 * s, s, on ? P.yellow : P.gray3);
  }
}

/** Coin badge (icon + amount). Returns its width. */
export function drawCoins(r: Renderer, x: number, y: number, coins: number, align: 'left' | 'right' = 'left'): number {
  const label = String(Math.round(coins));
  const w = 10 + r.textWidth(label);
  const bx = align === 'right' ? x - w : x;
  r.fillRect(bx - 3, y - 2, w + 6, 12, P.black, 0.65);
  drawDeco(r, 'coin', bx, y, 1, P.yellow);
  r.text(label, bx + 10, y + 1, { color: P.yellow, outline: P.black });
  return w + 6;
}

/** Top header bar with title/tabs and a coin badge, sitting under the notch. */
export function drawHeader(r: Renderer, title: string, o: { tabs?: string[]; active?: number; coins?: number; stars?: number } = {}): number {
  const top = r.safeTop;
  const h = 20;
  r.fillRect(0, 0, r.w, top + h, P.black);
  r.fillRect(0, top + h - 1, r.w, 1, P.red);
  if (o.tabs && o.tabs.length) {
    let x = 4;
    o.tabs.forEach((t, i) => {
      const tw = r.textWidth(t) + 8;
      const on = i === (o.active ?? 0);
      r.fillRect(x, top + 4, tw, 12, on ? P.red : P.dark);
      r.text(t, x + 4, top + 7, { color: on ? P.white : P.gray1 });
      x += tw + 3;
    });
  } else {
    r.text(title, 6, top + 7, { color: P.white, scale: 1 });
  }
  let rx = r.w - 6;
  if (o.coins !== undefined) rx -= drawCoins(r, rx, top + 5, o.coins, 'right') + 4;
  if (o.stars !== undefined) {
    const sw = 12 + r.textWidth(String(o.stars));
    r.fillRect(rx - sw - 3, top + 3, sw + 6, 12, P.black, 0.65);
    drawDeco(r, 'star', rx - sw, top + 4, 1, P.yellow);
    r.text(String(o.stars), rx - sw + 11, top + 6, { color: P.yellow, outline: P.black });
  }
  return top + h;
}

/** Bottom console bar (D-pad, PLAYER 1 hearts, SELECT/START, A/B) like the reference sheet. */
export function drawConsoleBar(r: Renderer, o: { hearts?: number; center?: string; left?: string; right?: string } = {}): number {
  const h = 26 + r.safeBottom;
  const y = r.h - h;
  r.fillRect(0, y, r.w, h, P.paper);
  r.fillRect(0, y, r.w, 1, P.gray2);
  r.fillRect(0, y + 1, r.w, 1, P.white);
  // D-pad
  drawDeco(r, 'dpad', 6, y + 5, 1, P.dark);
  // player hearts
  if (o.hearts !== undefined) {
    r.fillRect(24, y + 7, 44, 11, P.black);
    r.text('P1', 26, y + 9, { color: P.white });
    for (let i = 0; i < 3; i++) drawDeco(r, i < o.hearts ? 'heart' : 'heartEmpty', 38 + i * 9, y + 8, 1, i < o.hearts ? P.red : P.gray3);
  }
  if (o.center) r.text(o.center, r.w / 2, y + 10, { align: 'center', color: P.dark });
  // A / B buttons
  r.disc(r.w - 10, y + 11, 6, P.gray2); r.disc(r.w - 10, y + 10, 5, P.red); r.text('A', r.w - 10, y + 7, { align: 'center', color: P.white });
  r.disc(r.w - 24, y + 13, 6, P.gray2); r.disc(r.w - 24, y + 12, 5, P.gray3); r.text('B', r.w - 24, y + 9, { align: 'center', color: P.white });
  return y;
}

/** Horizontal stat bar (0..10). */
export function drawStatBar(r: Renderer, x: number, y: number, w: number, label: string, value: number, max = 10, color: string = P.cyan): void {
  r.text(label, x, y, { color: P.gray1 });
  const bx = x + 36, bw = w - 36;
  r.fillRect(bx, y, bw, 7, P.black);
  const n = 10, seg = Math.floor((bw - 2) / n);
  for (let i = 0; i < n; i++) {
    const on = i < Math.round((value / max) * n);
    r.fillRect(bx + 1 + i * seg, y + 1, seg - 1, 5, on ? (i > 6 ? mix(color, P.yellow, 0.4) : color) : P.gray3);
  }
}

export function drawProgressBar(r: Renderer, x: number, y: number, w: number, h: number, p: number, color: string = P.cyan, bg: string = P.black): void {
  r.fillRect(x, y, w, h, bg);
  r.fillRect(x + 1, y + 1, Math.round((w - 2) * clamp(p, 0, 1)), h - 2, color);
}

/** Drag-scroll helper with momentum and rubber banding. */
export class ScrollList {
  offset = 0;
  private vel = 0;
  private dragging = false;
  private lastY = 0;
  private lastT = 0;
  private startY = 0;
  moved = false;
  constructor(public viewH: number, public contentH: number) {}
  get maxOffset(): number { return Math.max(0, this.contentH - this.viewH); }
  handle(ev: PointerEv): void {
    if (ev.kind === 'down') { this.dragging = true; this.lastY = ev.y; this.startY = ev.y; this.lastT = ev.t; this.vel = 0; this.moved = false; }
    else if (ev.kind === 'move' && this.dragging) {
      const dy = ev.y - this.lastY;
      const dt = Math.max(1, ev.t - this.lastT);
      this.offset = clamp(this.offset - dy, -30, this.maxOffset + 30);
      this.vel = (-dy / dt) * 1000;
      this.lastY = ev.y; this.lastT = ev.t;
      if (Math.abs(ev.y - this.startY) > 6) this.moved = true;
    } else if (ev.kind === 'up' || ev.kind === 'cancel') { this.dragging = false; }
  }
  update(dt: number): void {
    if (!this.dragging) {
      this.offset += this.vel * dt;
      this.vel *= Math.pow(0.002, dt);
      if (Math.abs(this.vel) < 4) this.vel = 0;
      if (this.offset < 0) { this.offset += (0 - this.offset) * Math.min(1, dt * 12); this.vel = 0; if (this.offset < 0.5) this.offset = 0; }
      else if (this.offset > this.maxOffset) { this.offset += (this.maxOffset - this.offset) * Math.min(1, dt * 12); this.vel = 0; }
    }
  }
  scrollTo(y: number, smooth = true): void { const t = clamp(y, 0, this.maxOffset); if (smooth) this.vel = 0; this.offset = t; }
  /** true if the gesture was a tap (not a drag) */
  get tapped(): boolean { return !this.moved; }
}

// ── toasts ───────────────────────────────────────────────────────────────────
interface Toast { text: string; color: string; t: number; }
const toasts: Toast[] = [];
export function toast(text: string, color: string = P.green): void { toasts.push({ text, color, t: 0 }); if (toasts.length > 3) toasts.shift(); }
export function drawToasts(r: Renderer, dt: number): void {
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i];
    t.t += dt;
    if (t.t > 2.6) { toasts.splice(i, 1); continue; }
    const slide = t.t < 0.25 ? Ease.outBack(t.t / 0.25) : t.t > 2.3 ? 1 - (t.t - 2.3) / 0.3 : 1;
    const w = r.textWidth(t.text) + 16;
    const x = (r.w - w) / 2, y = r.safeTop + 24 + i * 16 - (1 - slide) * 20;
    r.fillRect(x, y, w, 13, P.black, 0.9 * slide);
    r.strokeRect(x, y, w, 13, t.color);
    r.text(t.text, r.w / 2, y + 3, { align: 'center', color: t.color, alpha: slide });
  }
}

// ── decorations (pixel sprites) ──────────────────────────────────────────────
const decoCache = new Map<string, PixelSprite>();
const DECOS: Record<string, string[]> = {
  star: ['.......#........', '.......#........', '......###.......', '......###.......', '#############...', '.###########....', '..#########.....', '...#######......', '...#######......', '..###...###.....', '.###.....###....', '.#.........#....', '................', '................', '................', '................'],
  starEmpty: ['.......#........', '......#.#.......', '......#.#.......', '#####...#####...', '.#.........#....', '..#.......#.....', '...#.....#......', '...#.....#......', '..#.......#.....', '.#.........#....', '.###.....###....', '................', '................', '................', '................', '................'],
  heart: ['..##...##...', '.####.####..', '##########..', '##########..', '##########..', '.########...', '..######....', '...####.....', '....##......', '............', '............', '............'],
  heartEmpty: ['..##...##...', '.#..#.#..#..', '#....#....#.', '#.........#.', '.#.......#..', '..#.....#...', '...#...#....', '....#.#.....', '.....#......', '............', '............', '............'],
  coin: ['..#####...', '.#######..', '##.###.##.', '##.#.#.##.', '##.#.#.##.', '##.#.#.##.', '##.###.##.', '.#######..', '..#####...', '..........'],
  lock: ['..#####...', '.#.....#..', '.#.....#..', '#########.', '#########.', '###.#.###.', '###.#.###.', '#########.', '#########.', '..........'],
  gear: ['...#..#...', '.########.', '.##....##.', '#..####..#', '#..#..#..#', '#..#..#..#', '#..####..#', '.##....##.', '.########.', '...#..#...'],
  bag: ['..##..##..', '.#......#.', '.########.', '.########.', '.##.##.##.', '.########.', '.########.', '.########.', '.########.', '..........'],
  map: ['##..####..', '##.##..##.', '##.##..##.', '##.######.', '##.##..##.', '##.##..##.', '##.##..##.', '..........', '..........', '..........'],
  flag: ['#.........', '#######...', '#.....#...', '#######...', '#.........', '#.........', '#.........', '#.........', '..........', '..........'],
  car: ['..######..', '.########.', '##########', '##.####.##', '##########', '.#.####.#.', '..........', '..........', '..........', '..........'],
  trophy: ['.########.', '##########', '#.######.#', '#.######.#', '..######..', '...####...', '....##....', '..######..', '.########.', '..........'],
  play: ['#.........', '###.......', '#####.....', '#######...', '#########.', '#######...', '#####.....', '###.......', '#.........', '..........'],
  dpad: ['...####...', '...####...', '...####...', '##########', '##########', '##########', '...####...', '...####...', '...####...', '..........'],
  pin: ['..#####...', '.#######..', '##.###.##.', '##.###.##.', '.#######..', '..#####...', '...###....', '....#.....', '..........', '..........'],
  wrench: ['.......###', '......####', '.....###..', '....###...', '...###....', '.###......', '###.......', '##........', '..........', '..........'],
  chevron: ['..##......', '...##.....', '....##....', '.....##...', '....##....', '...##.....', '..##......', '..........', '..........', '..........'],
};

export function registerDeco(id: string, rows: string[]): void { DECOS[id] = rows; }
export function drawDeco(r: Renderer, id: string, x: number, y: number, scale = 1, color: string = P.white): void {
  const rows = DECOS[id];
  if (!rows) return;
  const key = id + color;
  let spr = decoCache.get(key);
  if (!spr) { spr = buildSprite({ id: 'deco_' + key, rows, map: { '#': color } }); decoCache.set(key, spr); }
  r.sprite(spr, x, y, { origin: 'topleft', scale });
}

// ── brand emblems (9×9) ──────────────────────────────────────────────────────
const BRANDS: Record<BrandId, { rows: string[]; color: string }> = {
  nissan: { rows: ['..#####..', '.#.....#.', '#...#...#', '#..###..#', '#.#####.#', '#..###..#', '#...#...#', '.#.....#.', '..#####..'], color: P.gray1 },
  toyota: { rows: ['..#####..', '.#.....#.', '#..###..#', '#.#...#.#', '#.#####.#', '#.#...#.#', '#..###..#', '.#.....#.', '..#####..'], color: P.gray1 },
  mazda: { rows: ['..#####..', '.#.....#.', '#..#.#..#', '#.##.##.#', '#.#.#.#.#', '#.##.##.#', '#..#.#..#', '.#.....#.', '..#####..'], color: P.gray1 },
  honda: { rows: ['#########', '#.......#', '#.#...#.#', '#.#...#.#', '#.#####.#', '#.#...#.#', '#.#...#.#', '#.......#', '#########'], color: P.gray1 },
  mitsubishi: { rows: ['....#....', '...###...', '..#####..', '.#######.', '.##.#.##.', '##.....##', '#.......#', '.........', '.........'], color: P.red },
  subaru: { rows: ['..#####..', '.#..#..#.', '#..###..#', '#.#####.#', '#..#.#..#', '#.#...#.#', '#.......#', '.#.....#.', '..#####..'], color: P.blue },
  lexus: { rows: ['..#####..', '.#.....#.', '#..###..#', '#.#..#..#', '#.#..#..#', '#..##.#.#', '#....##.#', '.#.....#.', '..#####..'], color: P.gray1 },
  suzuki: { rows: ['#.......#', '##.....##', '#.#...#.#', '#..#.#..#', '#...#...#', '#..#.#..#', '#.#...#.#', '##.....##', '#.......#'], color: P.blue },
  gr: { rows: ['#########', '#.##..##.', '#.#.#.#..', '#.#..##..', '#.#####..', '#.#...#..', '#.#...#..', '#........', '#########'], color: P.red },
  nismo: { rows: ['#########', '#.......#', '#.##.##.#', '#.#.#.#.#', '#.#...#.#', '#.......#', '#########', '#.......#', '#########'], color: P.red },
  military: { rows: ['..#####..', '.##...##.', '##.....##', '#...#...#', '#..###..#', '#...#...#', '##.....##', '.##...##.', '..#####..'], color: P.green },
  volt: { rows: ['....##...', '...##....', '..##.....', '.######..', '....##...', '...##....', '..##.....', '.##......', '.........'], color: P.cyan },
  city: { rows: ['#..###..#', '#..#.#..#', '#..###..#', '#.......#', '####.####', '#.#...#.#', '#.#.#.#.#', '#.#...#.#', '#########'], color: P.blueLight },
  custom: { rows: ['....#....', '...###...', '..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'], color: P.yellow },
};
export function drawBrand(r: Renderer, id: BrandId, x: number, y: number, color?: string): void {
  const b = BRANDS[id] ?? BRANDS.custom;
  const key = 'brand_' + id + (color ?? b.color);
  let spr = decoCache.get(key);
  if (!spr) { spr = buildSprite({ id: key, rows: b.rows, map: { '#': color ?? b.color } }); decoCache.set(key, spr); }
  r.sprite(spr, x, y, { origin: 'topleft' });
}

// ── kanji / JDM decorations ──────────────────────────────────────────────────
export function drawKanji(r: Renderer, text: string, x: number, y: number, o: { size?: number; color?: string; vertical?: boolean; outline?: string; alpha?: number } = {}): PixelSprite {
  const spr = kanjiSprite(text, { size: o.size ?? 12, color: o.color ?? P.white, vertical: o.vertical, outline: o.outline, bold: true });
  r.sprite(spr, x, y, { origin: 'topleft', alpha: o.alpha });
  return spr;
}

/** Sakura branch in a corner (flip for the other side). */
export function drawSakuraBranch(r: Renderer, x: number, y: number, flip = false, scale = 1): void {
  const key = 'sakura_branch';
  let spr = decoCache.get(key);
  if (!spr) {
    const g = new Grid(48, 34);
    g.line(0, 4, 44, 2, 'n'); g.line(0, 5, 44, 3, 'n');
    g.line(10, 4, 18, 14, 'n'); g.line(26, 3, 34, 16, 'n'); g.line(38, 2, 44, 12, 'n');
    const bloom = (bx: number, by: number, big: boolean) => {
      g.ellipse(bx, by, big ? 4 : 3, big ? 4 : 3, 's');
      g.ellipse(bx, by, big ? 2 : 1, big ? 2 : 1, 'M');
      g.px(bx, by, 'Y');
    };
    bloom(6, 8, true); bloom(17, 16, true); bloom(24, 7, false); bloom(33, 18, true); bloom(41, 13, false); bloom(30, 4, false); bloom(12, 3, false); bloom(45, 5, true);
    spr = buildSprite(g.toSource(key));
    decoCache.set(key, spr);
  }
  r.sprite(spr, x, y, { origin: 'topleft', flip, scale });
}

/** Mt. Fuji silhouette. */
export function drawFuji(r: Renderer, cx: number, baseY: number, w: number, h: number, color: string = P.blueDark, snow: string = P.white): void {
  for (let j = 0; j < h; j++) {
    const hw = Math.round((w / 2) * (j / h));
    r.fillRect(cx - hw, baseY - h + j, hw * 2 + 1, 1, j < h * 0.32 ? snow : color);
  }
}

/** Big red sun disc with retro scan bands. */
export function drawSunDisc(r: Renderer, cx: number, cy: number, rad: number, top: string = P.yellow, bottom: string = P.red): void {
  for (let y = -rad; y <= rad; y++) {
    const hw = Math.floor(Math.sqrt(rad * rad - y * y));
    const t = (y + rad) / (rad * 2);
    if (t > 0.55 && Math.floor((y + rad) / 3) % 2 === 0) continue;
    r.fillRect(cx - hw, cy + y, hw * 2 + 1, 1, mix(top, bottom, t));
  }
}

/** Checkered band (finish flag look). */
export function drawChecker(r: Renderer, x: number, y: number, w: number, h: number, size = 3, a: string = P.white, b: string = P.black): void {
  for (let j = 0; j < h; j += size) for (let i = 0; i < w; i += size) {
    r.fillRect(x + i, y + j, Math.min(size, w - i), Math.min(size, h - j), ((i / size + j / size) | 0) % 2 ? b : a);
  }
}

// ── dialog overlay ───────────────────────────────────────────────────────────
import type { Screen } from '../core/types';
export class DialogOverlay implements Screen {
  overlay = true;
  private buttons: Button[] = [];
  private t = 0;
  constructor(private g: Game, private title: string, private message: string, actions: { label: string; color?: string; onTap: () => void }[]) {
    const r = g.r;
    const w = Math.min(200, r.w - 24);
    const x = (r.w - w) / 2, y = r.h / 2 - 40;
    const bw = actions.length > 1 ? (w - 20) / actions.length : w - 20;
    actions.forEach((a, i) => {
      this.buttons.push(new Button({ x: x + 10 + i * (bw + 4), y: y + 62, w: bw - (actions.length > 1 ? 4 : 0), h: 18 }, a.label, { color: a.color ?? P.red, onTap: () => { this.g.pop(); a.onTap(); } }));
    });
  }
  update(dt: number): void { this.t += dt; for (const b of this.buttons) b.update(dt); }
  render(): void {
    const r = this.g.r;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.7);
    const w = Math.min(200, r.w - 24);
    const x = (r.w - w) / 2, y = r.h / 2 - 40 - (1 - Ease.outBack(Math.min(1, this.t * 5))) * 20;
    drawBezel(r, x, y, w, 90, P.ink);
    r.text(this.title, r.w / 2, y + 14, { align: 'center', color: P.yellow, scale: 1 });
    r.text(this.message, r.w / 2, y + 30, { align: 'center', color: P.white, wrap: w - 24, lineHeight: 10 });
    for (const b of this.buttons) { b.rect.y = y + 62; b.draw(r); }
  }
  onPointer(ev: PointerEv): void { for (const b of this.buttons) if (b.handle(ev, this.g)) return; }
  onBack(): boolean { this.g.pop(); return true; }
}

export function dialog(g: Game, title: string, message: string, actions: { label: string; color?: string; onTap: () => void }[]): void {
  g.push(new DialogOverlay(g, title, message, actions));
}
