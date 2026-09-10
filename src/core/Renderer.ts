import { GAME_W, MIN_GAME_H, MAX_GAME_H, type Rect } from './types';
import type { PixelSprite } from './Sprite';
import { makeCanvas } from './Sprite';
import { PixelFont, type TextOpts } from './PixelFont';
import { mix } from './Palette';

export interface DrawOpts {
  /** uniform scale (nearest neighbor). default 1 */
  scale?: number;
  /** independent x/y scale (overrides scale) */
  sx?: number;
  sy?: number;
  flip?: boolean;
  alpha?: number;
  /** 'anchor' (default: use sprite anchor) or 'topleft' */
  origin?: 'anchor' | 'topleft' | 'center';
}

/**
 * Low-res pixel renderer. All drawing happens on `ctx` (GAME_W × h). `end()` blits to the
 * display canvas with nearest-neighbor scaling and applies shake/flash.
 */
export class Renderer {
  readonly display: HTMLCanvasElement;
  readonly dctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  readonly w = GAME_W;
  h = 520;
  /** css px per game px */
  cssScale = 1;
  /** device px per game px */
  devScale = 1;
  safeTop = 0;
  safeBottom = 0;
  safeLeft = 0;
  safeRight = 0;
  font: PixelFont;
  // effects
  private shakeT = 0;
  private shakeAmp = 0;
  shakeX = 0;
  shakeY = 0;
  private flashA = 0;
  private flashColor = '#ffffff';
  /** frame counter for blink animations */
  frame = 0;
  time = 0;

  constructor(display: HTMLCanvasElement) {
    this.display = display;
    this.dctx = display.getContext('2d', { alpha: false })!;
    this.buffer = makeCanvas(GAME_W, this.h);
    this.ctx = this.buffer.getContext('2d', { alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;
    this.font = new PixelFont();
    this.resize();
  }

  resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(4, window.devicePixelRatio || 1);
    this.cssScale = cssW / GAME_W;
    this.h = Math.max(MIN_GAME_H, Math.min(MAX_GAME_H, Math.round(cssH / this.cssScale)));
    this.devScale = (cssW * dpr) / GAME_W;
    this.display.width = Math.round(cssW * dpr);
    this.display.height = Math.round(cssH * dpr);
    this.display.style.width = cssW + 'px';
    this.display.style.height = cssH + 'px';
    if (this.buffer.height !== this.h) {
      this.buffer = makeCanvas(GAME_W, this.h);
      this.ctx = this.buffer.getContext('2d', { alpha: false })!;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.dctx.imageSmoothingEnabled = false;
    // safe areas from CSS env() (set in index.html)
    const cs = getComputedStyle(document.documentElement);
    const px = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    this.safeTop = Math.round(px(cs.getPropertyValue('--sat')) / this.cssScale);
    this.safeBottom = Math.round(px(cs.getPropertyValue('--sab')) / this.cssScale);
    this.safeLeft = Math.round(px(cs.getPropertyValue('--sal')) / this.cssScale);
    this.safeRight = Math.round(px(cs.getPropertyValue('--sar')) / this.cssScale);
  }

  /** Convert CSS client coords → game coords. */
  toGame(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.display.getBoundingClientRect();
    return { x: (clientX - r.left) / this.cssScale, y: (clientY - r.top) / this.cssScale };
  }

  begin(dt: number): void {
    this.frame++;
    this.time += dt;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.min(1, this.shakeT * 4);
      this.shakeX = Math.round((Math.random() * 2 - 1) * a);
      this.shakeY = Math.round((Math.random() * 2 - 1) * a);
    } else { this.shakeX = 0; this.shakeY = 0; }
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - dt * 4);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = '#0b0b12';
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  end(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    if (this.flashA > 0) {
      c.globalAlpha = Math.min(1, this.flashA);
      c.fillStyle = this.flashColor;
      c.fillRect(0, 0, this.w, this.h);
      c.globalAlpha = 1;
    }
    const d = this.dctx;
    d.imageSmoothingEnabled = false;
    const sx = this.shakeX * this.devScale, sy = this.shakeY * this.devScale;
    if (this.shakeX || this.shakeY) { d.fillStyle = '#0b0b12'; d.fillRect(0, 0, this.display.width, this.display.height); }
    d.drawImage(this.buffer, 0, 0, this.w, this.h, sx, sy, this.w * this.devScale, this.h * this.devScale);
  }

  shake(amp: number, dur = 0.3): void {
    this.shakeAmp = Math.max(this.shakeAmp * (this.shakeT > 0 ? 1 : 0), amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }
  flash(color = '#ffffff', alpha = 0.8): void { this.flashColor = color; this.flashA = Math.max(this.flashA, alpha); }

  // ── primitives ────────────────────────────────────────────────────────────
  clear(color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(0, 0, this.w, this.h); }
  px(x: number, y: number, color: string): void { this.ctx.fillStyle = color; this.ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  fillRect(x: number, y: number, w: number, h: number, color: string, alpha?: number): void {
    const c = this.ctx;
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = color;
    c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha !== undefined) c.globalAlpha = 1;
  }
  strokeRect(x: number, y: number, w: number, h: number, color: string): void {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    this.fillRect(x, y, w, 1, color); this.fillRect(x, y + h - 1, w, 1, color);
    this.fillRect(x, y, 1, h, color); this.fillRect(x + w - 1, y, 1, h, color);
  }
  hline(x0: number, x1: number, y: number, color: string): void { this.fillRect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, color); }
  vline(x: number, y0: number, y1: number, color: string): void { this.fillRect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, color); }
  /** Pixel-perfect disc. */
  disc(cx: number, cy: number, r: number, color: string, alpha?: number): void {
    const c = this.ctx;
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = color;
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -r; y <= r; y++) {
      const hw = Math.floor(Math.sqrt(r * r - y * y));
      c.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
    }
    if (alpha !== undefined) c.globalAlpha = 1;
  }
  ring(cx: number, cy: number, r: number, color: string, thick = 1, alpha?: number): void {
    const c = this.ctx;
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.fillStyle = color;
    cx = Math.round(cx); cy = Math.round(cy);
    const n = Math.max(8, Math.round(r * 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      c.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), thick, thick);
    }
    if (alpha !== undefined) c.globalAlpha = 1;
  }
  /** Retro banded vertical gradient (no smooth gradients: quantized to `bands`). */
  bandedGradient(x: number, y: number, w: number, h: number, colors: string[], bands = 8): void {
    const n = Math.max(1, bands);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const idx = t * (colors.length - 1);
      const c0 = colors[Math.floor(idx)], c1 = colors[Math.min(colors.length - 1, Math.ceil(idx))];
      const f = idx - Math.floor(idx);
      const col = mix(c0, c1, f);
      const y0 = Math.round(y + (h * i) / n), y1 = Math.round(y + (h * (i + 1)) / n);
      this.fillRect(x, y0, w, y1 - y0, col);
    }
  }
  /** Checkerboard dither between two colors over a rect. */
  dither(x: number, y: number, w: number, h: number, a: string, b: string, step = 1): void {
    x = Math.round(x); y = Math.round(y);
    this.fillRect(x, y, w, h, a);
    this.ctx.fillStyle = b;
    for (let j = 0; j < h; j += step) for (let i = ((j / step) & 1) * step; i < w; i += step * 2) this.ctx.fillRect(x + i, y + j, step, step);
  }

  sprite(spr: PixelSprite, x: number, y: number, o: DrawOpts = {}): void {
    const c = this.ctx;
    const sx = o.sx ?? o.scale ?? 1;
    const sy = o.sy ?? o.scale ?? 1;
    const dw = Math.max(1, Math.round(spr.w * sx));
    const dh = Math.max(1, Math.round(spr.h * sy));
    let dx: number, dy: number;
    if (o.origin === 'topleft') { dx = x; dy = y; }
    else if (o.origin === 'center') { dx = x - dw / 2; dy = y - dh / 2; }
    else { dx = x - Math.round(spr.ax * sx); dy = y - Math.round(spr.ay * sy); }
    dx = Math.round(dx); dy = Math.round(dy);
    if (dx > this.w || dy > this.h || dx + dw < 0 || dy + dh < 0) return;
    if (o.alpha !== undefined) c.globalAlpha = o.alpha;
    if (o.flip) {
      c.save();
      c.translate(dx + dw, dy);
      c.scale(-1, 1);
      c.drawImage(spr.canvas, 0, 0, dw, dh);
      c.restore();
    } else {
      c.drawImage(spr.canvas, dx, dy, dw, dh);
    }
    if (o.alpha !== undefined) c.globalAlpha = 1;
  }

  /** Draw a sub-rectangle of a sprite sheet canvas. */
  blit(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw = sw, dh = sh, alpha?: number): void {
    const c = this.ctx;
    if (alpha !== undefined) c.globalAlpha = alpha;
    c.drawImage(src, sx, sy, sw, sh, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    if (alpha !== undefined) c.globalAlpha = 1;
  }

  text(str: string, x: number, y: number, opts: TextOpts = {}): number {
    return this.font.draw(this.ctx, str, x, y, opts);
  }
  textWidth(str: string, opts: TextOpts = {}): number { return this.font.measure(str, opts); }

  clip(r: Rect): void { this.ctx.save(); this.ctx.beginPath(); this.ctx.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)); this.ctx.clip(); }
  unclip(): void { this.ctx.restore(); }
  alpha(a: number): void { this.ctx.globalAlpha = a; }
}
