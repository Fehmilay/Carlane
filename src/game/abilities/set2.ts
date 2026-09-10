import type { AbilityId } from '../../core/types';
import type { SfxName } from '../../core/Audio';
import type { Renderer } from '../../core/Renderer';
import type { PixelSprite } from '../../core/Sprite';
import { Grid, buildSprite, tintSprite, makeCanvas, spriteFromCanvas } from '../../core/Sprite';
import type { World, Projectile } from '../World';
import type { Traffic } from '../Traffic';
import type { Ability } from '../Ability';
import { BaseAbility } from '../Ability';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { ABILITIES } from '../../content/abilities';
import { registerIcon } from '../../content/icons';
import { rearSprite } from '../../content/vehicleSprites';

// INTEGRATION NOTE (World.ts): abilities can only draw in the player's depth slot (renderUnder/renderOver), so
// travelling effects (drone, shuriken, boulders) are drawn above nearer traffic. A `renderAt(z)` hook or a
// World.addSprite(z, draw) API would let them depth-sort with the entities.
// INTEGRATION NOTE (World.ts): destroyTraffic always plays a fire explosion; "washed away" / "shattered" kills
// (watercannon, freeze) layer their own splash / shard bursts on top.

// ─────────────────────────────────────────────────────────────────────────────
// Set 2: ironbumper, goldrush, repair, spin, freeze, drone, horn, lightning,
// shuriken, lanerip, hop, sonicboom, siren, watercannon, smokescreen, boulder.
// ─────────────────────────────────────────────────────────────────────────────

/** Cooldown / duration come from the catalog when present, otherwise the spec defaults below. */
function cdOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.cooldown > 0 ? d.cooldown : fallback; }
function durOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.duration && d.duration > 0 ? d.duration : fallback; }

/** approx. metres per lane (lateral) for rings / cones drawn in world space */
const LANE_M = 3;
const WHITE = '#ffffff';
const ICE_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#60a0ff', '#2040e0'];
const GOLD_COLS = ['#ffffff', '#ffe870', '#ffd040', '#f0c020', '#f07020'];
const FIRE_COLS = ['#ffffff', '#ffe870', '#f07020', '#e0202a', '#3a3a48'];
const DUST_COLS = ['#f4f4f0', '#a8a8b4', '#6a6a78'];
const SMOKE_COLS = ['#ffffff', '#f4f4f0', '#d9d9d2', '#a8a8b4', '#6a6a78'];
const SPARK_COLS = ['#ffffff', '#ffe870', '#40e0f0', '#2040e0'];
const STEEL_COLS = ['#ffffff', '#d8d8e0', '#a8a8b4', '#6a6a78'];
const WATER_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0'];
const GREEN_COLS = ['#ffffff', '#b0ffb0', '#20b040', '#0e6a2a'];
const PURPLE_COLS = ['#ffffff', '#ff90c0', '#b070f0', '#8030c0'];

// ── drawing helpers ──────────────────────────────────────────────────────────
function line(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1, alpha?: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const c = r.ctx;
  if (alpha !== undefined) c.globalAlpha = alpha;
  c.fillStyle = color;
  for (let n = 0; n < 2000; n++) {
    c.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  if (alpha !== undefined) c.globalAlpha = 1;
}
/** jagged lightning bolt */
function bolt(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string, jitter = 6, seg = 6, thick = 1, alpha?: number): void {
  let px = x0, py = y0;
  for (let i = 1; i <= seg; i++) {
    const t = i / seg, last = i === seg;
    const nx = x0 + (x1 - x0) * t + (last ? 0 : (Math.random() - 0.5) * jitter * 2);
    const ny = y0 + (y1 - y0) * t + (last ? 0 : (Math.random() - 0.5) * jitter);
    line(r, px, py, nx, ny, color, thick, alpha);
    px = nx; py = ny;
  }
}
function ellipseRing(r: Renderer, cx: number, cy: number, rx: number, ry: number, color: string, thick = 1, alpha?: number, n = 40, phase = 0, span = Math.PI * 2): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * span;
    r.fillRect(cx + Math.cos(a) * rx - thick / 2, cy + Math.sin(a) * ry - thick / 2, thick, thick, color, alpha);
  }
}
/** Arc lying flat on the road, centred at (laneX, z) with radius R metres, from angle a0 to a1 (sin > 0 = ahead). */
function roadArc(w: World, laneX: number, z: number, R: number, a0: number, a1: number, color: string, thick = 2, alpha?: number): void {
  const r = w.game.r, n = Math.round(Math.min(140, Math.max(20, R * 2.2 * ((a1 - a0) / (Math.PI * 2)) + 12)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const zz = z + Math.sin(a) * R;
    if (zz < -1.5) continue;
    const p = w.road.project(laneX + (Math.cos(a) * R) / LANE_M, zz);
    if (p.y < w.road.hy || p.y > r.h + 2 || p.x < -4 || p.x > r.w + 4) continue;
    r.fillRect(p.x - thick / 2, p.y - thick / 2, thick, thick, color, alpha);
  }
}
function roadRing(w: World, laneX: number, z: number, R: number, color: string, thick = 2, alpha?: number): void {
  roadArc(w, laneX, z, R, 0, Math.PI * 2, color, thick, alpha);
}
/**
 * Scanline-filled cone along a lane: from (laneX, z0) `lanes0` wide to (laneX, z1) `lanes1` wide.
 * `yLift` raises the near end. paint(y, t 0..1 near→far, x, halfWidth).
 */
function roadCone(w: World, laneX: number, z0: number, z1: number, lanes0: number, lanes1: number, yLift: number, paint: (y: number, t: number, x: number, hw: number) => void): void {
  const road = w.road;
  const p0 = road.project(laneX, z0), p1 = road.project(laneX, z1);
  const y0 = Math.round(p0.y - yLift), y1 = Math.round(p1.y);
  if (y0 <= y1) return;
  for (let y = y1; y <= y0; y++) {
    const t = (y0 - y) / (y0 - y1);
    const x = p0.x + (p1.x - p0.x) * t;
    const s = p0.s + (p1.s - p0.s) * t;
    const hw = ((lanes0 + (lanes1 - lanes0) * t) * road.laneW * s) / 2;
    paint(y, t, x, hw);
  }
}
function tintMax(w: World, color: string, a: number): void { if (a > w.mod.tintA) { w.mod.tint = color; w.mod.tintA = a; } }
interface WfxOpts { laneX: number; z: number; h?: number; dz?: number; vx?: number; vy?: number; life: number; colors?: string[]; color?: string; size: number; gravity?: number; shrink?: boolean; alpha?: number; }
/** depth-attached particle (re-projected every frame; z is relative to the player) */
function wfx(w: World, o: WfxOpts): void {
  w.fx.spawn({ x: 0, y: 0, laneX: o.laneX, z: o.z, h: o.h ?? 0, dz: o.dz ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life, maxLife: o.life, colors: o.colors, color: o.color ?? WHITE, size: o.size, gravity: o.gravity ?? 0, shrink: o.shrink, alpha: o.alpha });
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A valid neighbouring lane for `t` that leads away from the player (parity splits ties like a zipper). */
function escapeLane(w: World, t: Traffic, parity = 0): number {
  const n = w.lanes, pl = w.player.laneX;
  const cur = t.targetLane;
  const left = cur - 1, right = cur + 1;
  const okL = left >= 0, okR = right <= n - 1;
  if (okL && !okR) return left;
  if (okR && !okL) return right;
  if (!okL && !okR) return cur;
  if (t.laneX < pl - 0.2) return left;
  if (t.laneX > pl + 0.2) return right;
  return parity % 2 === 0 ? left : right;
}
/** Extra lateral push for traffic that was shoved (World moves it at 1.5 lanes/s; this adds `rate`). */
class Shover {
  list: { t: Traffic; until: number }[] = [];
  add(t: Traffic, secs: number): void {
    const e = this.list.find((x) => x.t === t);
    if (e) e.until = Math.max(e.until, secs); else this.list.push({ t, until: secs });
  }
  has(t: Traffic): boolean { return this.list.some((x) => x.t === t); }
  update(dt: number, rate = 2.5): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.until -= dt;
      if (e.until <= 0 || !e.t.collidable || e.t.z < -5) { this.list.splice(i, 1); continue; }
      e.t.laneX += clamp(e.t.targetLane - e.t.laneX, -dt * rate, dt * rate);
    }
  }
}

// ── effect sprites (built lazily, cached by buildSprite / local maps) ────────
function bullBarSprite(): PixelSprite {
  const g = new Grid(48, 14);
  g.rect(2, 1, 44, 3, 'C'); g.hline(3, 44, 1, 'w'); g.hline(3, 44, 3, 'd');
  g.rect(2, 6, 44, 2, 'C'); g.hline(3, 44, 7, 'd');
  g.rect(2, 11, 44, 3, 'C'); g.hline(3, 44, 11, 'w'); g.hline(3, 44, 13, 'd');
  for (const x of [1, 12, 22, 33, 44]) { g.rect(x, 0, 3, 14, 'C'); g.vline(x, 1, 13, 'w'); g.vline(x + 2, 1, 13, 'd'); }
  g.rect(0, 0, 2, 2, 'e'); g.rect(46, 0, 2, 2, 'e');
  g.outline('k');
  return buildSprite(g.toSource('fx_bullbar', 24, 14));
}
function coinSprite(): PixelSprite {
  const g = new Grid(7, 7);
  g.circle(3, 3, 3, 'y').circle(3, 3, 2, 'Y').px(2, 2, 'w').px(3, 3, 'y').px(3, 4, 'y').px(3, 2, 'y');
  g.outline('k');
  return buildSprite(g.toSource('fx_coin', 3, 3));
}
function wrenchSprite(): PixelSprite {
  const g = new Grid(13, 13);
  for (let i = 0; i < 7; i++) g.rect(1 + i, 9 - i, 3, 3, 'f');
  g.circle(9, 3, 3, 'f');
  g.rect(9, 0, 4, 3, '.'); g.px(10, 3, '.'); g.px(11, 3, '.');
  g.line(2, 10, 8, 4, 'w');
  g.px(7, 3, 'w'); g.px(8, 2, 'w');
  g.outline('k');
  return buildSprite(g.toSource('fx_wrench', 6, 6));
}
function crossSprite(): PixelSprite {
  const g = new Grid(7, 7);
  g.rect(2, 0, 3, 7, 'g').rect(0, 2, 7, 3, 'g').rect(3, 1, 1, 5, 'w').rect(1, 3, 5, 1, 'w');
  g.outline('k');
  return buildSprite(g.toSource('fx_cross', 3, 3));
}
const spinCache = new Map<string, PixelSprite[]>();
/** Horizontal-squash frames of the player's sprite: a full pirouette in 12 phases. */
function spinFrames(car: PixelSprite): PixelSprite[] {
  let f = spinCache.get(car.id);
  if (f) return f;
  f = [];
  const widths = [1, 0.72, 0.4, 0.14, 0.4, 0.72, 1, 0.72, 0.4, 0.14, 0.4, 0.72];
  widths.forEach((k, i) => {
    const flip = i >= 3 && i <= 8;
    const canvas = makeCanvas(car.w, car.h);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const dw = Math.max(2, Math.round(car.w * k));
    const dx = Math.round((car.w - dw) / 2);
    if (flip) { ctx.translate(dx + dw, 0); ctx.scale(-1, 1); ctx.drawImage(car.canvas, 0, 0, car.w, car.h, 0, 0, dw, car.h); }
    else ctx.drawImage(car.canvas, 0, 0, car.w, car.h, dx, 0, dw, car.h);
    f!.push(spriteFromCanvas(car.id + '#spin' + i, canvas, car.ax, car.ay));
  });
  spinCache.set(car.id, f);
  return f;
}
function iceHeadSprite(): PixelSprite {
  const g = new Grid(15, 15);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.line(7, 7, 7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, 'c');
    g.px(7 + Math.cos(a) * 7, 7 + Math.sin(a) * 7, 'w');
    g.px(7 + Math.cos(a + 0.35) * 4, 7 + Math.sin(a + 0.35) * 4, 'i');
    g.px(7 + Math.cos(a - 0.35) * 4, 7 + Math.sin(a - 0.35) * 4, 'i');
  }
  g.circle(7, 7, 2, 'c').px(7, 7, 'w');
  return buildSprite(g.toSource('fx_icehead', 7, 7));
}
function droneSprite(f: number): PixelSprite {
  const g = new Grid(25, 12);
  if (f === 0) { g.hline(0, 9, 1, 'f'); g.hline(15, 24, 1, 'f'); g.px(4, 1, 'w'); g.px(19, 1, 'w'); }
  else { g.hline(2, 7, 1, 'e'); g.hline(17, 22, 1, 'e'); g.px(0, 1, 'f'); g.px(9, 1, 'f'); g.px(15, 1, 'f'); g.px(24, 1, 'f'); }
  g.rect(3, 2, 4, 2, 'd'); g.rect(18, 2, 4, 2, 'd');
  g.hline(5, 19, 4, 'd'); g.hline(5, 19, 5, 'D');
  g.rect(8, 3, 9, 7, 'r'); g.hline(9, 15, 3, 'm'); g.hline(9, 15, 9, 'R');
  g.rect(10, 5, 5, 2, 'G'); g.px(11, 5, 'w');
  g.px(8, 7, 'Y'); g.px(16, 7, 'Y');
  g.rect(11, 10, 3, 2, 'D'); g.px(12, 11, 'k');
  g.outline('k');
  return buildSprite(g.toSource('fx_drone' + f, 12, 12));
}
function hornSprite(): PixelSprite {
  const g = new Grid(31, 13);
  g.rect(12, 8, 7, 5, 'd'); g.hline(13, 17, 8, 'e'); g.rect(14, 9, 3, 2, 'f');
  g.rect(6, 5, 9, 3, 'C'); g.hline(7, 14, 5, 'w'); g.hline(7, 14, 7, 'd');
  for (let x = 0; x <= 5; x++) { const hh = 5 - x * 0.8; g.vline(x, Math.round(6 - hh), Math.round(6 + hh), 'C'); }
  g.vline(0, 2, 10, 'w'); g.vline(1, 2, 10, 'w'); g.px(0, 6, 'D'); g.px(1, 6, 'D'); g.px(1, 5, 'D'); g.px(1, 7, 'D');
  g.mirrorX();
  g.outline('k');
  return buildSprite(g.toSource('fx_horn', 15, 13));
}
function shurikenSprite(f: number): PixelSprite {
  const g = new Grid(11, 11);
  if (f === 0) {
    g.rect(4, 0, 3, 11, 'f').rect(0, 4, 11, 3, 'f').rect(3, 2, 5, 7, 'f').rect(2, 3, 7, 5, 'f');
    g.vline(4, 1, 4, 'w'); g.hline(6, 9, 4, 'w'); g.vline(6, 6, 9, 'e'); g.hline(1, 4, 6, 'e');
    g.px(5, 0, 'w'); g.px(10, 5, 'w'); g.px(5, 10, 'e'); g.px(0, 5, 'e');
  } else {
    for (let i = -1; i <= 1; i++) { g.line(0, i + 0, 10, i + 10, 'f'); g.line(0, 10 - i, 10, -i, 'f'); }
    g.rect(3, 3, 5, 5, 'f');
    g.line(1, 1, 4, 4, 'w'); g.line(9, 1, 6, 4, 'w'); g.line(1, 9, 4, 6, 'e'); g.line(9, 9, 6, 6, 'e');
  }
  g.rect(4, 4, 3, 3, 'D'); g.px(5, 5, 'k');
  g.outline('k');
  return buildSprite(g.toSource('fx_shuriken' + f, 5, 5));
}
function lightbarSprite(f: number): PixelSprite {
  const g = new Grid(26, 7);
  g.rect(0, 1, 26, 6, 'D');
  g.rect(1, 2, 11, 4, f === 0 ? 'u' : 'U'); g.rect(14, 2, 11, 4, f === 0 ? 'R' : 'r');
  if (f === 0) { g.rect(3, 3, 4, 2, 'i'); g.px(4, 3, 'w'); g.px(5, 3, 'w'); }
  else { g.rect(19, 3, 4, 2, 'o'); g.px(20, 3, 'w'); g.px(21, 3, 'w'); }
  g.rect(11, 0, 4, 7, 'e'); g.vline(12, 1, 5, 'w');
  g.hline(0, 25, 6, 'k');
  g.outline('k');
  return buildSprite(g.toSource('fx_lightbar' + f, 13, 7));
}
function nozzleSprite(): PixelSprite {
  const g = new Grid(11, 9);
  g.rect(3, 5, 5, 4, 'd'); g.rect(4, 6, 3, 2, 'e');
  g.rect(2, 2, 7, 3, 'C'); g.hline(3, 7, 2, 'w'); g.rect(4, 0, 3, 2, 'C');
  g.px(5, 0, 'c');
  g.outline('k');
  return buildSprite(g.toSource('fx_nozzle', 5, 9));
}
function boulderSprite(f: number): PixelSprite {
  const g = new Grid(19, 17);
  g.ellipse(9, 8, 8, 7, 'D');
  g.ellipse(8, 7, 7, 6, 'n');
  g.ellipse(7, 6, 5, 4, 'T');
  g.px(6, 4, 'w'); g.px(7, 4, 'w'); g.px(6, 5, 'w');
  if (f === 0) { g.line(4, 10, 8, 14, 'D'); g.line(11, 3, 13, 7, 'D'); g.line(9, 9, 12, 10, 'D'); g.px(13, 8, 'k'); }
  else { g.line(3, 6, 7, 3, 'D'); g.line(12, 11, 14, 14, 'D'); g.line(6, 10, 9, 13, 'D'); g.px(5, 9, 'k'); }
  g.outline('k');
  return buildSprite(g.toSource('fx_boulder' + f, 9, 16));
}
function reticle(r: Renderer, cx: number, cy: number, sz: number, col: string): void {
  const L = Math.max(2, Math.round(sz / 3));
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x0 = cx + dx * sz, y0 = cy + dy * sz;
    r.fillRect(dx < 0 ? x0 : x0 - L + 1, y0, L, 1, col);
    r.fillRect(x0, dy < 0 ? y0 : y0 - L + 1, 1, L, col);
  }
}

// ── shared base ──────────────────────────────────────────────────────────────
abstract class Ab extends BaseAbility {
  private _car: PixelSprite | null = null;
  protected get r(): Renderer { return this.w.game.r; }
  protected get pl() { return this.w.player; }
  protected get car(): PixelSprite { return (this._car ??= rearSprite(this.w.vehicle)); }
  protected sfx(n: SfxName): void { this.w.game.audio.sfx(n); }
  /** end a duration ability early */
  protected finish(): void { if (this.act > 0) { this.act = 0; this.onEnd(); } }
  /** seconds since activation (duration abilities) */
  protected get elapsed(): number { return this.duration - this.act; }
  /** screen y of the car's roof line */
  protected get roofY(): number { const { y } = this.pl.screen(); return y - this.car.h * this.pl.sizeMul - this.pl.air; }
  /** knock direction pushing traffic away from the player's lane (or off the road centre) */
  protected knockDir(t: Traffic): number {
    const pl = this.pl.laneX;
    if (t.laneX < pl - 0.2) return -1;
    if (t.laneX > pl + 0.2) return 1;
    return t.laneX < (this.w.lanes - 1) / 2 ? -1 : 1;
  }
}

// ── 17 IRON BUMPER ───────────────────────────────────────────────────────────
class IronBumper extends Ab {
  readonly id: AbilityId = 'ironbumper';
  override cooldown = cdOf('ironbumper', 10);
  override duration = durOf('ironbumper', 6);
  private hitT = 0;
  private deploy = 0;
  protected onActivate(): void {
    this.sfx('shield'); this.r.shake(2, 0.15); this.r.flash('#a8a8b4', 0.2);
    this.deploy = 0;
    this.w.floatText('IRON!', this.pl.laneX, 6, '#d8d8e0', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 16, 18, { speed: 80, colors: STEEL_COLS, life: 0.4, size: 2, gravity: 60 });
  }
  protected override onUpdate(dt: number): void {
    if (this.hitT > 0) this.hitT -= dt;
    if (!this.active) return;
    this.deploy = Math.min(1, this.deploy + dt * 5);
    const pl = this.pl, s = pl.sizeMul;
    if (this.r.frame % 5 === 0) {
      const { x } = pl.screen();
      const side = Math.random() < 0.5 ? -1 : 1;
      this.w.fx.spawn({ x: x + side * 22 * s, y: this.roofY + 2, vx: side * rnd(20, 50), vy: rnd(20, 60), life: 0.3, maxLife: 0.3, colors: ['#ffffff', '#ffe870', '#f07020'], size: 1.5, gravity: 200 });
    }
    // slight road rumble
    if (this.r.frame % 20 === 0) this.r.shake(1, 0.05);
    tintMax(this.w, '#6a6a78', 0.04);
  }
  protected override onEnd(): void { this.sfx('uiBack'); }
  onCollision(t: Traffic): boolean {
    if (!this.active) return false;
    this.hitT = 0.3; this.sfx('crush'); this.r.shake(6, 0.2); this.w.game.haptics.impact('Heavy');
    const { x } = this.pl.screen();
    this.w.fx.burst(x, this.roofY + 4, 24, { speed: 120, spread: Math.PI, angle: -Math.PI / 2, colors: ['#ffffff', '#ffe870', '#f07020', '#a8a8b4'], life: 0.5, size: 2, gravity: 220 });
    this.w.floatText('CLANG!', t.laneX, t.z, '#d8d8e0', 1);
    return true;
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, s = pl.sizeMul;
    const { x, y } = pl.screen();
    // bar bottom sits mid-body: the car occludes the lower half, the hoop sticks out above the roof and past the sides
    const by = y - this.car.h * s * 0.55 - pl.air + (1 - this.deploy) * 8;
    const spr = bullBarSprite();
    r.sprite(spr, x, by, { scale: s });
    if (this.hitT > 0) r.sprite(tintSprite(spr, WHITE), x, by, { scale: s, alpha: Math.min(1, this.hitT * 4) });
    // gray aura on the road
    r.disc(x, y - 2, Math.round(22 * s), '#a8a8b4', 0.12 + 0.05 * Math.sin(r.time * 20));
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, s = pl.sizeMul;
    const { x, y } = pl.screen();
    const by = y - this.car.h * s * 0.55 - pl.air + (1 - this.deploy) * 8;
    // glint sliding along the top tube
    const gx = x - 22 * s + ((r.time * 90) % (44 * s));
    r.fillRect(gx, by - 13 * s, 3, 1, WHITE); r.fillRect(gx + 1, by - 12 * s, 1, 1, WHITE);
    // side legs down the flanks
    const legX = Math.round(this.car.w * 0.5 * s) + 2;
    r.fillRect(x - legX - 1, by - 2, 2, 8 * s, '#d8d8e0'); r.fillRect(x + legX, by - 2, 2, 8 * s, '#d8d8e0');
    r.fillRect(x - legX - 2, by - 2, 1, 8 * s, '#0b0b12'); r.fillRect(x + legX + 2, by - 2, 1, 8 * s, '#0b0b12');
  }
}

// ── 18 GOLD RUSH ─────────────────────────────────────────────────────────────
class GoldRush extends Ab {
  readonly id: AbilityId = 'goldrush';
  override cooldown = cdOf('goldrush', 12);
  override duration = durOf('goldrush', 8);
  private rowT = 0;
  private rows = 0;
  constructor(w: World) {
    super(w);
    w.on('coin', () => { if (this.active) { this.w.floatText('×3', this.pl.laneX, 3, '#ffd040', 1); } });
  }
  protected onActivate(): void {
    this.sfx('coinBig'); this.sfx('powerup'); this.r.flash('#ffd040', 0.3);
    this.rowT = 0.5; this.rows = 0;
    this.w.floatText('GOLD RUSH!', this.pl.laneX, 8, '#ffd040', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 26, { speed: 90, colors: GOLD_COLS, life: 0.6, size: 2, gravity: -30 });
    this.w.spawnCoinRow(this.pl.lane, 30, 5, 5);
  }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    w.mod.coinMul *= 3;
    tintMax(w, '#ffd040', 0.06);
    this.rowT += dt;
    if (this.rowT >= 0.85) {
      this.rowT = 0; this.rows++;
      const z = 75 + rnd(0, 10);
      w.spawnCoinRow(pl.lane, z, 5, 5);
      if (this.rows % 2 === 0) w.spawnCoin(pl.lane, z + 28, 3, true);
    }
    // gold sparkles around the car and glitter down the lane
    const { x, y } = pl.screen();
    if (this.r.frame % 2 === 0) {
      const a = Math.random() * Math.PI * 2;
      w.fx.spawn({ x: x + Math.cos(a) * 20 * pl.sizeMul, y: y - 6 + Math.sin(a) * 8, vx: 0, vy: rnd(-40, -20), life: 0.5, maxLife: 0.5, colors: GOLD_COLS, size: 2, gravity: -20, shrink: true });
    }
    if (Math.random() < 0.6) wfx(w, { laneX: pl.lane + rnd(-0.5, 0.5), z: rnd(8, 90), h: rnd(2, 14), dz: -pl.speed, vy: rnd(5, 20), life: 0.5, colors: GOLD_COLS, size: 2, shrink: true });
  }
  protected override onEnd(): void { this.sfx('uiBack'); }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const pulse = 0.5 + 0.5 * Math.sin(r.time * 8);
    r.disc(x, y - 2, Math.round((22 + pulse * 3) * pl.sizeMul), '#ffd040', 0.22);
    r.disc(x, y - 2, Math.round(14 * pl.sizeMul), '#ffe870', 0.2);
    ellipseRing(r, x, y - 2, 26 * pl.sizeMul, 9 * pl.sizeMul, '#ffd040', 2, 0.7, 36, r.time * 2);
    // golden lane carpet ahead
    roadCone(this.w, pl.lane, PLAYER_Z + 2, 90, 0.7, 0.7, 0, (yy, t, xx, hw) => {
      if ((yy + Math.floor(r.time * 30)) % 3 !== 0) return;
      r.fillRect(xx - hw, yy, hw * 2, 1, '#ffd040', 0.25 * (1 - t));
    });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul - pl.air;
    const spr = coinSprite();
    for (let i = 0; i < 4; i++) {
      const a = r.time * 3 + (i * Math.PI) / 2;
      const front = Math.sin(a) > 0;
      const sx = x + Math.cos(a) * 24 * pl.sizeMul, sy = cy + Math.sin(a) * 9;
      r.sprite(spr, sx, sy, { origin: 'center', scale: front ? 1 : 0.7, alpha: front ? 1 : 0.6 });
    }
    // sparkle stars
    if (r.frame % 4 < 2) { r.fillRect(x - 15, cy - 14, 1, 3, WHITE); r.fillRect(x - 16, cy - 13, 3, 1, WHITE); }
    else { r.fillRect(x + 13, cy - 8, 1, 3, WHITE); r.fillRect(x + 12, cy - 7, 3, 1, WHITE); }
  }
}

// ── 19 REPAIR ────────────────────────────────────────────────────────────────
class Repair extends Ab {
  readonly id: AbilityId = 'repair';
  override cooldown = cdOf('repair', 12);
  private fxT = 0;
  private readonly FX = 1.1;
  protected onActivate(): void {
    const pl = this.pl, w = this.w;
    pl.heal(2);
    this.fxT = this.FX;
    this.sfx('powerup'); this.r.flash('#20b040', 0.35); this.r.shake(1, 0.1);
    w.floatText('+2 HP', pl.laneX, 6, '#20b040', 2);
    const { x, y } = pl.screen();
    w.fx.burst(x, y - 12, 24, { speed: 80, colors: GREEN_COLS, life: 0.6, size: 2, gravity: -40 });
    w.fx.burst(x, y - 8, 14, { speed: 110, spread: Math.PI, angle: -Math.PI / 2, colors: ['#ffffff', '#ffe870', '#f07020'], life: 0.4, size: 2, gravity: 220 });
  }
  protected override onUpdate(dt: number): void {
    if (this.fxT <= 0) return;
    this.fxT -= dt;
    const q = this.fxT / this.FX;
    tintMax(this.w, '#20b040', 0.14 * q);
    const { x, y } = this.pl.screen();
    if (this.r.frame % 2 === 0) this.w.fx.spawn({ x: x + rnd(-18, 18), y: y - rnd(0, 10), vx: 0, vy: rnd(-50, -30), life: 0.5, maxLife: 0.5, colors: GREEN_COLS, size: 2, gravity: 0, shrink: true });
    // wrench sparks
    if (this.r.frame % 3 === 0) {
      const a = this.r.time * 9;
      this.w.fx.spawn({ x: x + Math.cos(a) * 24, y: y - this.car.h * 0.5 + Math.sin(a) * 10, vx: rnd(-30, 30), vy: rnd(-20, 30), life: 0.3, maxLife: 0.3, colors: ['#ffffff', '#ffe870'], size: 1.5, gravity: 150 });
    }
  }
  override renderOver(): void {
    if (this.fxT <= 0) return;
    const r = this.r, pl = this.pl;
    const q = this.fxT / this.FX, k = 1 - q;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul - pl.air;
    ellipseRing(r, x, cy, 14 + k * 34, 7 + k * 16, '#20b040', 2, q, 44);
    ellipseRing(r, x, cy, 10 + k * 30, 5 + k * 13, '#b0ffb0', 1, q * 0.8, 36);
    const wr = wrenchSprite();
    for (let i = 0; i < 2; i++) {
      const a = r.time * 9 + i * Math.PI;
      const front = Math.sin(a) > 0;
      r.sprite(wr, x + Math.cos(a) * 24, cy + Math.sin(a) * 10, { origin: 'center', flip: Math.cos(a) < 0, alpha: front ? 1 : 0.6, scale: front ? 1 : 0.8 });
    }
    const cr = crossSprite();
    for (let i = 0; i < 3; i++) {
      const ph = (k * 1.4 + i * 0.33) % 1;
      const cx = x + (i - 1) * 14, cyy = cy - 4 - ph * 26;
      r.sprite(cr, cx, cyy, { origin: 'center', alpha: 1 - ph });
    }
  }
}

// ── 20 SPIN ──────────────────────────────────────────────────────────────────
class Spin extends Ab {
  readonly id: AbilityId = 'spin';
  override cooldown = cdOf('spin', 5);
  override duration = durOf('spin', 1);
  private frames: PixelSprite[] | null = null;
  private base: PixelSprite | null = null;
  private ringT = 0;
  protected onActivate(): void {
    this.base = this.car;
    this.frames = spinFrames(this.car);
    this.ringT = 0;
    this.sfx('whoosh'); this.r.shake(3, 0.2); this.r.flash('#f0c020', 0.15);
    this.w.floatText('SPIN!', this.pl.laneX, 6, '#f0c020', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 20, { speed: 80, spread: Math.PI * 2, colors: DUST_COLS, life: 0.5, size: 3, gravity: 40 });
  }
  protected override onUpdate(dt: number): void {
    this.ringT += dt;
    if (!this.active || !this.frames) return;
    const w = this.w, pl = this.pl;
    pl.setSprite(this.frames[Math.floor(this.r.frame / 3) % this.frames.length]);
    pl.lean = 0;
    for (const t of w.traffic) {
      if (!t.collidable || t.z < -3 || t.z - PLAYER_Z > 8 || Math.abs(t.laneX - pl.laneX) > 1.5) continue;
      w.destroyTraffic(t, 'weapon', this.knockDir(t));
      t.launch = 40;
    }
    const { x, y } = pl.screen();
    for (let i = 0; i < 3; i++) {
      const a = this.r.time * 14 + (i * Math.PI * 2) / 3;
      w.fx.spawn({ x: x + Math.cos(a) * 18 * pl.sizeMul, y: y - 3 + Math.sin(a) * 6, vx: Math.cos(a) * 30, vy: rnd(-15, -5), life: 0.45, maxLife: 0.45, colors: DUST_COLS, size: 3, gravity: 0, shrink: true, alpha: 0.9 });
    }
    if (this.r.frame % 9 === 0) this.sfx('swipe');
    tintMax(w, '#f0c020', 0.04);
  }
  protected override onEnd(): void {
    if (this.base) this.pl.setSprite(this.base);
    this.sfx('land'); this.r.shake(2, 0.12);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 12, { speed: 70, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 2, gravity: 150 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const w = this.w, r = this.r, pl = this.pl;
    const q = Math.min(1, this.ringT / 0.4);
    roadRing(w, pl.laneX, PLAYER_Z, 8 * q, '#f0c020', 2, 1 - q * 0.6);
    roadRing(w, pl.laneX, PLAYER_Z, 5 + 3 * ((this.ringT * 2) % 1), '#ffe870', 1, 0.5);
    const { x, y } = pl.screen();
    r.disc(x, y - 2, Math.round(20 * pl.sizeMul), '#f0c020', 0.15);
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, s = pl.sizeMul;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.45 * s - pl.air;
    for (let k = 0; k < 3; k++) {
      const a = r.time * 14 + k * 2.1;
      ellipseRing(r, x, cy, 25 * s, 10 * s, k ? '#ffe870' : WHITE, 2, 0.9, 7, a, 1.0);
    }
    ellipseRing(r, x, cy, 30 * s, 12 * s, '#f0c020', 1, 0.5, 5, -r.time * 10, 0.8);
  }
}

// ── 21 FREEZE ────────────────────────────────────────────────────────────────
class Freeze extends Ab {
  readonly id: AbilityId = 'freeze';
  override cooldown = cdOf('freeze', 8);
  private readonly range = 50;
  private beamT = -1;
  private get headZ(): number { return PLAYER_Z + 2 + this.range * Math.min(1, this.beamT / 0.4); }
  protected onActivate(): void {
    this.beamT = 0;
    this.sfx('freeze'); this.r.flash('#c0f8ff', 0.3); this.r.shake(2, 0.15);
    this.w.floatText('FREEZE!', this.pl.laneX, 6, '#a0f0ff', 2);
    const { x } = this.pl.screen();
    this.w.fx.burst(x, this.roofY + 6, 18, { speed: 70, spread: 1.6, angle: -Math.PI / 2, colors: ICE_COLS, life: 0.4, size: 2, gravity: 0 });
  }
  protected override onUpdate(dt: number): void {
    const w = this.w, pl = this.pl;
    if (this.beamT >= 0) {
      this.beamT += dt;
      const hz = this.headZ;
      for (const t of w.traffic) {
        if (!t.collidable || t.state === 'frozen' || t.z <= 0 || t.z > hz || Math.abs(t.laneX - pl.laneX) > 1.5) continue;
        t.state = 'frozen'; t.stateT = 4; t.flash = 0.12; t.bump = 2;
        for (let i = 0; i < 8; i++) wfx(w, { laneX: t.laneX + rnd(-0.4, 0.4), z: t.z + rnd(-1, 1), h: rnd(2, 12), dz: -pl.speed, vy: rnd(20, 50), life: 0.5, colors: ICE_COLS, size: 2, gravity: -30, shrink: true });
        this.sfx('ui');
      }
      for (let i = 0; i < 3; i++) wfx(w, { laneX: pl.laneX + rnd(-0.35, 0.35), z: rnd(2, hz), h: rnd(2, 10), dz: -pl.speed * 0.4, vx: rnd(-20, 20), vy: rnd(10, 40), life: 0.4, colors: ICE_COLS, size: 2, shrink: true });
      tintMax(w, '#60a0ff', 0.14 * Math.max(0, 1 - this.beamT / 0.7));
      if (this.beamT > 0.7) this.beamT = -1;
    }
    // frost sparkles on frozen cars
    if (this.r.frame % 3 === 0) for (const t of w.traffic) {
      if (t.state !== 'frozen' || t.z < -2 || Math.random() > 0.5) continue;
      wfx(w, { laneX: t.laneX + rnd(-0.4, 0.4), z: t.z + rnd(-1.5, 1.5), h: rnd(2, 14), dz: -pl.speed, vy: rnd(-5, 10), life: 0.35, colors: ['#ffffff', '#c0f8ff'], size: 1.5, shrink: true });
    }
  }
  onCollision(t: Traffic): boolean {
    if (t.state !== 'frozen') return false;
    const p = this.w.road.project(t.laneX, t.z);
    this.w.fx.burst(p.x, p.y - 8 * p.s, 28, { speed: 110 * p.s, colors: ICE_COLS, life: 0.6, size: 3 * p.s, gravity: 200 * p.s });
    this.sfx('freeze'); this.r.shake(3, 0.15); this.r.flash('#c0f8ff', 0.25);
    this.w.floatText('SHATTER', t.laneX, t.z, '#a0f0ff', 1);
    return true;
  }
  override renderOver(): void {
    const r = this.r, w = this.w, pl = this.pl;
    // ice blocks around frozen cars
    for (const t of w.traffic) {
      if (t.state !== 'frozen') continue;
      const p = w.road.project(t.laneX, t.z);
      if (p.s <= 0.03 || p.y < w.road.hy) continue;
      const bw = Math.round(t.tpl.sprite.w * p.s * 1.1) + 2, bh = Math.round(t.tpl.sprite.h * p.s * 1.05) + 2;
      const bx = Math.round(p.x - bw / 2), byy = Math.round(p.y - bh - t.bump);
      r.strokeRect(bx, byy, bw, bh, '#c0f8ff');
      r.fillRect(bx + 1, byy + 1, bw - 2, bh - 2, '#40e0f0', 0.15);
      r.fillRect(bx + 1, byy + 1, Math.max(1, bw - 2), 1, WHITE, 0.6);
      // icicles
      for (let i = 2; i < bw - 2; i += 4) r.fillRect(bx + i, byy + bh, 1, 2 + (i % 3), '#c0f8ff');
      if ((r.frame + t.id * 7) % 16 < 4) { r.fillRect(bx + 2, byy + 3, 1, 3, WHITE); r.fillRect(bx + 1, byy + 4, 3, 1, WHITE); }
    }
    if (this.beamT < 0) return;
    const q = Math.max(0, 1 - Math.max(0, this.beamT - 0.4) / 0.3);
    const hz = this.headZ;
    const lift = this.car.h * pl.sizeMul * 0.55 + pl.air;
    const f = r.frame;
    roadCone(w, pl.laneX, PLAYER_Z + 1, hz, 0.4, 0.75, lift, (y, t, x, hw) => {
      const jag = (y * 3 + f) % 4 === 0 ? 2 : 0;
      r.fillRect(x - hw - 2 - jag, y, (hw + 2 + jag) * 2, 1, '#2040e0', 0.45 * q);
      r.fillRect(x - hw, y, hw * 2, 1, '#40e0f0', 0.9 * q);
      r.fillRect(x - hw * 0.55, y, Math.max(1, hw * 1.1), 1, '#c0f8ff', q);
      if ((y + f) % 3 === 0) r.fillRect(x - hw * 0.2, y, Math.max(1, hw * 0.4), 1, WHITE, q);
    });
    const head = w.road.project(pl.laneX, hz);
    const sc = Math.max(0.6, head.s * 1.4) * (1 + 0.15 * (f % 2));
    r.disc(head.x, head.y - 4 * head.s, Math.round(6 * sc), '#c0f8ff', 0.6 * q);
    r.sprite(iceHeadSprite(), head.x, head.y - 4 * head.s, { origin: 'center', scale: sc, alpha: q });
    const { x } = pl.screen();
    r.disc(x, this.roofY + 6, 4 + (f % 2), '#c0f8ff', 0.9 * q);
    r.disc(x, this.roofY + 6, 2, WHITE, q);
  }
}

// ── 22 DRONE ─────────────────────────────────────────────────────────────────
class Drone extends Ab {
  readonly id: AbilityId = 'drone';
  override cooldown = cdOf('drone', 11);
  override duration = durOf('drone', 5);
  private phase: 'off' | 'fly' | 'leave' = 'off';
  private lx = 0; private lz = 0; private lh = 0;
  private leaveT = 0;
  private fireT = 0;
  private flashT = 0;
  private shots = 0;
  private target: Traffic | null = null;
  private bullets: Projectile[] = [];
  protected onActivate(): void {
    const pl = this.pl;
    this.phase = 'fly'; this.lx = pl.laneX; this.lz = PLAYER_Z + 0.5; this.lh = this.car.h * pl.sizeMul; this.fireT = 0.4; this.shots = 0;
    this.sfx('whoosh'); this.r.flash('#e0202a', 0.15);
    this.w.floatText('DRONE!', pl.laneX, 6, '#e0202a', 2);
    const { x } = pl.screen();
    this.w.fx.burst(x, this.roofY, 14, { speed: 60, colors: DUST_COLS, life: 0.4, size: 2, gravity: 40 });
  }
  protected override onUpdate(dt: number): void {
    if (this.flashT > 0) this.flashT -= dt;
    const w = this.w, pl = this.pl;
    this.bullets = this.bullets.filter((b) => w.projectiles.includes(b));
    if (this.phase === 'off') return;
    if (this.phase === 'leave') {
      this.leaveT += dt; this.lh += dt * 140; this.lz += dt * 40;
      if (this.leaveT > 0.8) this.phase = 'off';
      return;
    }
    const tz = PLAYER_Z + 9, th = 36 + Math.sin(this.r.time * 5) * 2;
    this.lz += (tz - this.lz) * Math.min(1, dt * 4);
    this.lh += (th - this.lh) * Math.min(1, dt * 4);
    const tgt = w.trafficAhead(130).filter((t) => t.z > this.lz + 3)[0] ?? null;
    this.target = tgt;
    const want = tgt ? pl.laneX * 0.55 + tgt.laneX * 0.45 : pl.laneX;
    this.lx += clamp(want - this.lx, -dt * 3, dt * 3);
    this.fireT -= dt;
    if (tgt && this.fireT <= 0) {
      this.fireT = 0.2; this.flashT = 0.07; this.shots++;
      const b = w.fire({ kind: 'bullet', laneX: this.lx, z: this.lz + 1.5, speed: 240, h: 14, damage: 1, owner: 'player', target: tgt, color: '#ffe870', life: 1.2 });
      this.bullets.push(b);
      if (this.shots % 2 === 1) this.sfx('shoot');
      this.lh -= 2;
    }
    // rotor downwash dust on the road
    if (this.r.frame % 4 === 0) wfx(w, { laneX: this.lx + rnd(-0.5, 0.5), z: this.lz + rnd(-1, 1), h: 1, dz: -pl.speed * 0.2, vx: rnd(-25, 25), vy: rnd(5, 15), life: 0.35, colors: DUST_COLS, size: 2, shrink: true, alpha: 0.7 });
  }
  protected override onEnd(): void { this.phase = 'leave'; this.leaveT = 0; this.target = null; this.sfx('whoosh'); }
  override renderOver(): void {
    const r = this.r, w = this.w;
    // tracers
    for (const b of this.bullets) {
      const p = w.road.project(b.laneX, b.z);
      const y = p.y - (10 + b.h) * p.s;
      r.fillRect(p.x, y, 1, Math.max(2, 8 * p.s), '#ffe870', 0.8);
      r.fillRect(p.x, y, 1, Math.max(1, 3 * p.s), WHITE);
    }
    if (this.phase === 'off') return;
    const p = w.road.project(this.lx, this.lz);
    const sc = p.s * this.pl.sizeMul;
    const y = p.y - this.lh * p.s;
    // shadow on the road
    r.fillRect(p.x - 9 * sc, p.y - 1, 18 * sc, 2, '#000000', 0.25);
    const spr = droneSprite(Math.floor(r.frame / 2) % 2);
    r.sprite(spr, p.x, y, { scale: sc });
    // status lamp
    if (r.frame % 10 < 5) r.fillRect(p.x - 1, y - 9 * sc, 2, 1, '#e0202a');
    if (this.flashT > 0) {
      r.disc(p.x, y + 1, Math.round(3 * sc) + 1, '#ffe870');
      r.disc(p.x, y + 1, Math.max(1, Math.round(1.5 * sc)), WHITE);
    }
    // target lock
    const t = this.target;
    if (t && t.collidable && this.phase === 'fly') {
      const tp = w.road.project(t.laneX, t.z);
      const sz = Math.max(5, Math.round(18 * tp.s));
      reticle(r, Math.round(tp.x), Math.round(tp.y - 8 * tp.s), sz, r.frame % 6 < 3 ? '#e0202a' : '#ffe870');
      // laser sight
      line(r, p.x, y + 2, tp.x, tp.y - 8 * tp.s, '#e0202a', 1, 0.35);
    }
  }
}

// ── 23 HORN ──────────────────────────────────────────────────────────────────
class Horn extends Ab {
  readonly id: AbilityId = 'horn';
  override cooldown = cdOf('horn', 5);
  private readonly range = 40;
  private waveT = -1;
  private front = 0;
  private hornT = 0;
  private readonly HORN = 0.75;
  private shover = new Shover();
  private parity = 0;
  protected onActivate(): void {
    this.waveT = 0; this.front = PLAYER_Z; this.hornT = this.HORN;
    this.sfx('horn'); this.r.shake(4, 0.35); this.r.flash('#f0c020', 0.15);
    this.w.floatText('HOOONK!', this.pl.laneX, 8, '#f0c020', 2);
    const { x } = this.pl.screen();
    this.w.fx.burst(x, this.roofY - 4, 16, { speed: 60, colors: ['#ffffff', '#ffe870', '#f0c020'], life: 0.4, size: 2, gravity: -20 });
  }
  protected override onUpdate(dt: number): void {
    this.shover.update(dt, 2.5);
    if (this.hornT > 0) { this.hornT -= dt; if (this.hornT > 0.3 && this.r.frame % 3 === 0) this.r.shake(1, 0.05); }
    const w = this.w, pl = this.pl;
    if (this.waveT < 0) return;
    this.waveT += dt;
    const nf = PLAYER_Z + this.range * Math.min(1, this.waveT / 0.35);
    for (const t of w.traffic) {
      if (!t.collidable || t.z <= this.front || t.z > nf || t.z <= 0) continue;
      const d = Math.abs(t.laneX - pl.laneX);
      let target = t.targetLane;
      if (d < 0.6) target = escapeLane(w, t, this.parity++);
      else if (d < 1.6) { const out = t.laneX < pl.laneX ? t.targetLane - 1 : t.targetLane + 1; if (out >= 0 && out < w.lanes) target = out; }
      t.bump = 4; t.flash = 0.08;
      if (target !== t.targetLane) { t.targetLane = target; this.shover.add(t, 0.7); }
      const dir = target < t.laneX ? -1 : 1;
      for (let i = 0; i < 5; i++) wfx(w, { laneX: t.laneX + dir * 0.4, z: t.z + rnd(-1, 1), h: rnd(1, 5), dz: -pl.speed, vx: dir * rnd(10, 40), vy: rnd(5, 20), life: 0.4, colors: DUST_COLS, size: 2, shrink: true });
    }
    this.front = nf;
    tintMax(w, '#f0c020', 0.08 * Math.max(0, this.hornT / this.HORN));
    if (this.waveT > 0.5) this.waveT = -1;
  }
  override renderOver(): void {
    if (this.hornT <= 0) return;
    const r = this.r, w = this.w, pl = this.pl;
    const k = 1 - this.hornT / this.HORN;
    const { x } = pl.screen();
    const s = pl.sizeMul * (1 + 0.12 * Math.abs(Math.sin(r.time * 40)) * (1 - k));
    r.sprite(hornSprite(), x, this.roofY + 4, { scale: s });
    // sound waves rolling ahead on the road
    for (let i = 0; i < 5; i++) {
      const R = ((k * 110 + i * 9) % 44);
      const a = 1 - R / 44;
      roadArc(w, pl.laneX, PLAYER_Z + 1, R, Math.PI * 0.18, Math.PI * 0.82, i % 2 ? '#ffe870' : WHITE, 2, a * 0.9);
    }
    // ")))" arcs beside the horn bells
    for (let i = 1; i <= 3; i++) {
      const a = 1 - ((k * 3 + i * 0.33) % 1);
      const rx = 6 + i * 5, ry = 4 + i * 3;
      ellipseRing(r, x - 16 * s, this.roofY - 3, rx, ry, '#f0c020', 1, a, 8, Math.PI * 0.6, Math.PI * 0.8);
      ellipseRing(r, x + 16 * s, this.roofY - 3, rx, ry, '#f0c020', 1, a, 8, -Math.PI * 0.4, Math.PI * 0.8);
    }
  }
}

// ── 24 LIGHTNING ─────────────────────────────────────────────────────────────
class Lightning extends Ab {
  readonly id: AbilityId = 'lightning';
  override cooldown = cdOf('lightning', 7);
  private hops: { t: Traffic; at: number; done: boolean }[] = [];
  private T = -1;
  private readonly LIFE = 0.8;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    this.T = 0; this.hops = [];
    const pool = w.traffic.filter((t) => t.collidable && t.z > 1 && t.z < 100);
    let px = pl.laneX, pz = PLAYER_Z;
    for (let i = 0; i < 4 && pool.length; i++) {
      let best = 0, bd = Infinity;
      pool.forEach((t, j) => { const d = Math.hypot((t.laneX - px) * LANE_M, t.z - pz); if (d < bd) { bd = d; best = j; } });
      const t = pool.splice(best, 1)[0];
      this.hops.push({ t, at: 0.06 + i * 0.12, done: false });
      px = t.laneX; pz = t.z;
    }
    this.sfx('zap'); this.r.flash('#ffe870', 0.4); this.r.shake(3, 0.25);
    const { x } = pl.screen();
    w.fx.burst(x, this.roofY, 20, { speed: 100, colors: SPARK_COLS, life: 0.4, size: 2, gravity: 80 });
    if (!this.hops.length) w.floatText('ZAP', pl.laneX, 6, '#ffe870', 1);
  }
  protected override onUpdate(dt: number): void {
    if (this.T < 0) return;
    this.T += dt;
    const w = this.w;
    for (const h of this.hops) {
      if (h.done || this.T < h.at) continue;
      h.done = true;
      for (let i = 0; i < 8; i++) wfx(w, { laneX: h.t.laneX + rnd(-0.4, 0.4), z: h.t.z, h: rnd(4, 14), dz: -this.pl.speed, vy: rnd(20, 60), life: 0.5, colors: SPARK_COLS, size: 2, gravity: -40 });
      w.destroyTraffic(h.t, 'weapon', this.knockDir(h.t));
      this.sfx('zap'); this.r.flash(WHITE, 0.15);
    }
    tintMax(w, '#ffe870', 0.12 * Math.max(0, 1 - this.T / this.LIFE));
    if (this.T > this.LIFE) this.T = -1;
  }
  override renderOver(): void {
    if (this.T < 0) return;
    const r = this.r, w = this.w, pl = this.pl;
    const a = Math.max(0, 1 - this.T / this.LIFE);
    const { x } = pl.screen();
    let x0 = x, y0 = this.roofY - 2;
    // antenna crackle on the car
    if (r.frame % 2 === 0) bolt(r, x0, y0, x0 + rnd(-14, 14), y0 - rnd(6, 16), '#ffe870', 3, 3, 1, a);
    r.disc(x0, y0, 2 + (r.frame % 2), WHITE, a);
    if (!this.hops.length) { bolt(r, x0, y0, x0 + rnd(-20, 20), w.road.hy - 30, '#ffe870', 10, 8, 2, a); return; }
    for (const h of this.hops) {
      if (!h.done) break;
      const p = w.road.project(h.t.laneX, h.t.z);
      const x1 = p.x, y1 = p.y - 8 * p.s;
      bolt(r, x0, y0, x1, y1, '#ffe870', 8, 7, 3, a);
      bolt(r, x0, y0, x1, y1, '#40e0f0', 5, 6, 2, a);
      bolt(r, x0, y0, x1, y1, WHITE, 3, 5, 1, a);
      r.disc(x1, y1, Math.max(2, Math.round(6 * p.s)) + (r.frame % 2), WHITE, a);
      x0 = x1; y0 = y1;
    }
  }
}

// ── 25 SHURIKEN ──────────────────────────────────────────────────────────────
class Shuriken extends Ab {
  readonly id: AbilityId = 'shuriken';
  override cooldown = cdOf('shuriken', 4);
  private stars: { p: Projectile; goal: number }[] = [];
  private throwT = 0;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    const lanes = [pl.lane - 1, pl.lane, pl.lane + 1].filter((l) => l >= 0 && l < w.lanes);
    while (lanes.length < 3) lanes.push(pl.lane);
    lanes.forEach((l, i) => {
      const p = w.fire({ kind: 'shuriken', laneX: pl.laneX, z: PLAYER_Z + 2 + (l === pl.lane ? 0 : 1) + i * 0.5, speed: 150 + i * 6, h: 9, damage: 2, owner: 'player', color: '#f4f4f0', life: 1.7 });
      this.stars.push({ p, goal: l });
    });
    this.throwT = 0.25;
    this.sfx('whoosh'); this.r.shake(1, 0.1);
    const { x } = pl.screen();
    w.fx.burst(x, this.roofY + 4, 12, { speed: 80, spread: 1.2, angle: -Math.PI / 2, colors: ['#ffffff', '#d8d8e0', '#20c0b0'], life: 0.3, size: 2, gravity: 0 });
  }
  protected override onUpdate(dt: number): void {
    const w = this.w;
    if (this.throwT > 0) this.throwT -= dt;
    this.stars = this.stars.filter((s) => w.projectiles.includes(s.p));
    for (const s of this.stars) {
      s.p.laneX += clamp(s.goal - s.p.laneX, -dt * 8, dt * 8);
      if (this.r.frame % 2 === 0) wfx(w, { laneX: s.p.laneX, z: s.p.z, h: 9 + rnd(-2, 2), dz: -this.pl.speed, life: 0.25, colors: ['#ffffff', '#d8d8e0'], size: 2, shrink: true, alpha: 0.8 });
    }
  }
  override renderOver(): void {
    const r = this.r, w = this.w;
    const f = Math.floor(r.frame / 2) % 2;
    for (const s of this.stars) {
      const pr = w.road.project(s.p.laneX, s.p.z);
      const y = pr.y - (10 + s.p.h) * pr.s;
      const sc = Math.max(0.5, pr.s * 1.5);
      r.fillRect(pr.x - 3 * sc, pr.y - 1, 6 * sc, 1, '#000000', 0.3);
      r.sprite(shurikenSprite(f), pr.x, y, { origin: 'center', scale: sc });
    }
    if (this.throwT > 0) {
      const { x } = this.pl.screen();
      const q = this.throwT / 0.25;
      ellipseRing(r, x, this.roofY + 2, 6 + (1 - q) * 14, 3 + (1 - q) * 6, '#20c0b0', 1, q, 20);
    }
  }
}

// ── 26 LANE RIP ──────────────────────────────────────────────────────────────
class LaneRip extends Ab {
  readonly id: AbilityId = 'lanerip';
  override cooldown = cdOf('lanerip', 6);
  private readonly range = 100;
  private readonly LIFE = 0.85;
  private T = -1;
  private front = 0;
  private parity = 0;
  private shover = new Shover();
  protected onActivate(): void {
    this.T = 0; this.front = PLAYER_Z;
    this.sfx('whoosh'); this.sfx('emp'); this.r.shake(5, 0.3); this.r.flash('#f07020', 0.25);
    this.w.floatText('LANE RIP!', this.pl.laneX, 8, '#f07020', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 8, 20, { speed: 100, spread: 1.4, angle: -Math.PI / 2, colors: FIRE_COLS, life: 0.4, size: 2, gravity: 0 });
  }
  protected override onUpdate(dt: number): void {
    this.shover.update(dt, 3);
    const w = this.w, pl = this.pl;
    if (this.T < 0) return;
    this.T += dt;
    const nf = PLAYER_Z + this.range * Math.min(1, this.T / 0.5);
    for (const t of w.traffic) {
      if (!t.collidable || t.z <= this.front || t.z > nf || Math.abs(t.laneX - pl.laneX) >= 0.6) continue;
      const target = escapeLane(w, t, this.parity++);
      if (target !== t.targetLane) { t.targetLane = target; this.shover.add(t, 0.8); }
      t.bump = 5; t.flash = 0.1;
      const dir = target < t.laneX ? -1 : 1;
      for (let i = 0; i < 7; i++) wfx(w, { laneX: t.laneX + dir * 0.45, z: t.z + rnd(-1.5, 1.5), h: rnd(1, 6), dz: -pl.speed, vx: dir * rnd(20, 60), vy: rnd(10, 30), life: 0.45, colors: ['#ffe870', '#f07020', '#a8a8b4'], size: 2, shrink: true });
    }
    // sparks flying along the rip
    for (let i = 0; i < 2; i++) wfx(w, { laneX: pl.laneX + rnd(-0.1, 0.1), z: rnd(2, nf), h: rnd(0, 4), dz: -pl.speed * 0.5, vx: rnd(-30, 30), vy: rnd(20, 60), life: 0.3, colors: ['#ffffff', '#ffe870', '#f07020'], size: 1.5, gravity: -20 });
    this.front = nf;
    tintMax(w, '#f07020', 0.1 * Math.max(0, 1 - this.T / this.LIFE));
    if (this.T > this.LIFE) this.T = -1;
  }
  override renderOver(): void {
    if (this.T < 0) return;
    const r = this.r, w = this.w, pl = this.pl;
    const q = Math.max(0, 1 - this.T / this.LIFE);
    const f = r.frame;
    roadCone(w, pl.laneX, PLAYER_Z + 1.5, this.front, 0.16, 0.16, this.car.h * 0.3 * pl.sizeMul, (y, t, x, hw) => {
      const j = (y * 5 + f * 3) % 4 === 0 ? 1 : 0;
      r.fillRect(x - hw - 1 - j, y, (hw + 1 + j) * 2, 1, '#f07020', 0.85 * q);
      r.fillRect(x - hw * 0.4, y, Math.max(1, hw * 0.8), 1, '#ffe870', q);
      if ((y + f) % 4 === 0) r.fillRect(x - 1, y, 2, 1, WHITE, q);
    });
    // split chevrons riding the wave front
    for (let i = 0; i < 6; i++) {
      const z = this.front - i * 7;
      if (z < 2) continue;
      const p = w.road.project(pl.laneX, z);
      const lw = w.road.laneW * p.s * 0.5, L = Math.max(2, 6 * p.s);
      const a = q * (1 - i / 7);
      line(r, p.x - lw, p.y - 2, p.x - lw + L, p.y - 2 - L * 0.7, '#ffe870', 1, a);
      line(r, p.x - lw, p.y - 2, p.x - lw + L, p.y - 2 + L * 0.7, '#ffe870', 1, a);
      line(r, p.x + lw, p.y - 2, p.x + lw - L, p.y - 2 - L * 0.7, '#ffe870', 1, a);
      line(r, p.x + lw, p.y - 2, p.x + lw - L, p.y - 2 + L * 0.7, '#ffe870', 1, a);
    }
    const p = w.road.project(pl.laneX, this.front);
    r.disc(p.x, p.y - 3 * p.s, Math.max(2, Math.round(7 * p.s)) + (f % 2), WHITE, q);
  }
}

// ── 27 HOP ───────────────────────────────────────────────────────────────────
class Hop extends Ab {
  readonly id: AbilityId = 'hop';
  override cooldown = cdOf('hop', 3);
  override duration = durOf('hop', 0.5);
  private readonly H = 28;
  protected onActivate(): void {
    this.sfx('jump');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 10, { speed: 55, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.3, size: 2, gravity: 120 });
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const pl = this.pl;
    const p = 1 - this.act / this.duration;
    pl.air = Math.round(this.H * Math.sin(Math.PI * p)); pl.airborne = true;
    if (this.r.frame % 2 === 0) {
      const { x, y } = pl.screen();
      this.w.fx.spawn({ x: x + rnd(-0.5, 0.5) * this.car.w, y: y - pl.air - Math.random() * this.car.h * 0.5, vx: 0, vy: 150, life: 0.15, maxLife: 0.15, color: WHITE, size: 1, gravity: 0, alpha: 0.7 });
    }
  }
  protected override onEnd(): void {
    const pl = this.pl; pl.air = 0; pl.airborne = false;
    this.sfx('land'); this.r.shake(1.5, 0.1);
    const { x, y } = pl.screen();
    this.w.fx.burst(x, y, 12, { speed: 70, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.35, size: 2, gravity: 150 });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const p = 1 - this.act / this.duration;
    if (p > 0.22) return;
    // spring "boing" lines under the car at take-off
    const { x, y } = pl.screen();
    const k = 1 - p / 0.22;
    for (const sx of [x - 12, x + 12]) {
      r.fillRect(sx - 1, y - 2 - k * 6, 3, 1, '#ffe870', k);
      r.fillRect(sx, y - 5 - k * 6, 1, 3, '#ffe870', k);
    }
  }
}

// ── 28 SONIC BOOM ────────────────────────────────────────────────────────────
class SonicBoom extends Ab {
  readonly id: AbilityId = 'sonicboom';
  override cooldown = cdOf('sonicboom', 7);
  private readonly R = 25;
  private readonly LIFE = 0.6;
  private T = -1;
  private prevR = 0;
  protected onActivate(): void {
    this.T = 0; this.prevR = 0;
    this.sfx('cannon'); this.sfx('emp');
    this.r.flash(WHITE, 0.6); this.r.shake(9, 0.4); this.w.game.haptics.impact('Heavy');
    this.w.floatText('BOOM!', this.pl.laneX, 8, '#ff90c0', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 34, { speed: 160, colors: PURPLE_COLS, life: 0.5, size: 2, gravity: 40 });
    // rattle everything further out
    for (const t of this.w.traffic) if (t.collidable && t.z > 0 && t.z - PLAYER_Z < 50) t.bump = 3;
  }
  protected override onUpdate(dt: number): void {
    if (this.T < 0) return;
    this.T += dt;
    const w = this.w;
    const R = this.R * Math.min(1, this.T / 0.3);
    for (const t of w.traffic) {
      if (!t.collidable || t.z < -2) continue;
      const d = t.z - PLAYER_Z;
      if (d <= R && d > this.prevR - 3) { w.destroyTraffic(t, 'weapon', this.knockDir(t)); t.launch = 45; }
    }
    this.prevR = R;
    tintMax(w, '#8030c0', 0.22 * Math.max(0, 1 - this.T / this.LIFE));
    if (this.T > this.LIFE) this.T = -1;
  }
  override renderOver(): void {
    if (this.T < 0) return;
    const r = this.r, w = this.w, pl = this.pl;
    const q = Math.max(0, 1 - this.T / this.LIFE), k = this.T / this.LIFE;
    const R = this.R * Math.min(1, this.T / 0.3);
    roadRing(w, pl.laneX, PLAYER_Z, R, '#8030c0', 3, q);
    roadRing(w, pl.laneX, PLAYER_Z, R * 0.92, WHITE, 1, q);
    roadRing(w, pl.laneX, PLAYER_Z, R * 0.55, '#ff90c0', 2, q * 0.7);
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul - pl.air;
    ellipseRing(r, x, cy, 18 + k * 110, 10 + k * 60, '#b070f0', 3, q, 60);
    ellipseRing(r, x, cy, 14 + k * 100, 8 + k * 54, WHITE, 1, q, 48);
    ellipseRing(r, x, cy, 10 + k * 70, 6 + k * 36, '#ff90c0', 2, q * 0.8, 40);
    // mach cone streaks
    if (k < 0.5) for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const L = 10 + i * 6;
      line(r, x + side * 14, cy - 6 + i * 3, x + side * (14 + L * (1 + k * 3)), cy - 14 + i * 5, i % 3 ? '#b070f0' : WHITE, 1, q);
    }
  }
}

// ── 29 SIREN ─────────────────────────────────────────────────────────────────
class Siren extends Ab {
  readonly id: AbilityId = 'siren';
  override cooldown = cdOf('siren', 10);
  override duration = durOf('siren', 5);
  private sirenT = 0;
  private shover = new Shover();
  private parity = 0;
  private get phase(): number { return Math.floor(this.r.time * 6) % 2; }
  protected onActivate(): void {
    this.sirenT = 0;
    this.sfx('siren'); this.r.flash('#2040e0', 0.3);
    this.w.floatText('POLIZEI!', this.pl.laneX, 8, '#60a0ff', 2);
    const { x } = this.pl.screen();
    this.w.fx.burst(x, this.roofY, 16, { speed: 70, colors: ['#ffffff', '#60a0ff', '#2040e0', '#e0202a'], life: 0.4, size: 2, gravity: -20 });
  }
  protected override onUpdate(dt: number): void {
    this.shover.update(dt, 2);
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    this.sirenT += dt;
    if (this.sirenT >= 0.65) { this.sirenT = 0; this.sfx('siren'); }
    tintMax(w, this.phase ? '#2040e0' : '#e0202a', 0.07);
    for (const t of w.traffic) {
      if (!t.collidable || t.z <= 2 || t.z > 110 || Math.abs(t.laneX - pl.laneX) >= 0.6 || t.targetLane !== t.lane) continue;
      const target = escapeLane(w, t, this.parity++);
      if (target === t.lane) continue;
      t.targetLane = target; t.bump = 2;
      this.shover.add(t, 0.9);
    }
    // hazard blinkers on cars pulling over
    if (this.r.frame % 12 < 6 && this.r.frame % 3 === 0) for (const e of this.shover.list) {
      const t = e.t;
      wfx(w, { laneX: t.laneX - 0.35, z: t.z, h: 6, dz: -pl.speed, life: 0.1, color: '#f07020', size: 2 });
      wfx(w, { laneX: t.laneX + 0.35, z: t.z, h: 6, dz: -pl.speed, life: 0.1, color: '#f07020', size: 2 });
    }
    // light sparks around the bar
    if (this.r.frame % 3 === 0) {
      const { x } = pl.screen();
      const side = this.phase ? -1 : 1;
      w.fx.spawn({ x: x + side * rnd(6, 12), y: this.roofY - 4, vx: side * rnd(10, 40), vy: rnd(-30, -10), life: 0.3, maxLife: 0.3, color: this.phase ? '#60a0ff' : '#ff9090', size: 2, gravity: 0, shrink: true });
    }
  }
  protected override onEnd(): void { this.sfx('uiBack'); }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, w = this.w, pl = this.pl;
    const col = this.phase ? '#2040e0' : '#e0202a';
    const { x, y } = pl.screen();
    r.disc(x, y - 2, Math.round(28 * pl.sizeMul), col, 0.3);
    r.disc(x, y - 2, Math.round(16 * pl.sizeMul), this.phase ? '#60a0ff' : '#ff9090', 0.25);
    // light sweep on the road ahead
    roadCone(w, pl.laneX, PLAYER_Z + 1, 45, 0.7, 3, 0, (yy, t, xx, hw) => {
      if ((yy + r.frame) % 2) return;
      r.fillRect(xx - hw, yy, hw * 2, 1, col, 0.2 * (1 - t));
    });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, s = pl.sizeMul;
    const { x } = pl.screen();
    const by = this.roofY + 3;
    r.sprite(lightbarSprite(this.phase), x, by, { scale: s });
    // glow halos over the lit half
    const lx = this.phase ? x - 7 * s : x + 7 * s;
    r.disc(lx, by - 4 * s, Math.round(7 * s), this.phase ? '#60a0ff' : '#ff9090', 0.45);
    r.disc(lx, by - 4 * s, Math.round(3 * s), WHITE, 0.7);
    // light rays
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.5 + (this.phase ? -0.3 : 0.3);
      line(r, lx, by - 4 * s, lx + Math.cos(a) * 22, by - 4 * s + Math.sin(a) * 14, this.phase ? '#60a0ff' : '#ff9090', 1, 0.5);
    }
    // vignette flashes at the screen edges
    r.fillRect(0, 0, 6, r.h, this.phase ? '#2040e0' : '#e0202a', 0.35);
    r.fillRect(r.w - 6, 0, 6, r.h, this.phase ? '#e0202a' : '#2040e0', 0.35);
  }
}

// ── 30 WATER CANNON ──────────────────────────────────────────────────────────
class WaterCannon extends Ab {
  readonly id: AbilityId = 'watercannon';
  override cooldown = cdOf('watercannon', 7);
  override duration = durOf('watercannon', 2);
  private readonly range = 60;
  private roarT = 0;
  private get reach(): number { return this.range * Math.min(1, this.elapsed / 0.35); }
  protected onActivate(): void {
    this.sfx('whoosh'); this.r.flash('#40e0f0', 0.2); this.roarT = 0;
    this.w.floatText('SPLASH!', this.pl.laneX, 8, '#40e0f0', 2);
  }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    const reach = this.reach;
    for (const t of w.traffic) {
      if (!t.collidable || t.z < 0 || t.z > reach || Math.abs(t.laneX - pl.laneX) > 0.6) continue;
      const p = w.road.project(t.laneX, t.z);
      w.fx.burst(p.x, p.y - 8 * p.s, 24, { speed: 120 * p.s, colors: WATER_COLS, life: 0.6, size: 3 * p.s, gravity: 220 * p.s });
      w.destroyTraffic(t, 'weapon', this.knockDir(t));
      t.launch = 50;
      w.floatText('WASHED!', t.laneX, t.z, '#40e0f0', 1);
    }
    // spray droplets flying down the lane
    for (let i = 0; i < 4; i++) wfx(w, { laneX: pl.laneX + rnd(-0.25, 0.25), z: PLAYER_Z + 3, h: this.car.h * 0.9 + rnd(0, 4), dz: rnd(80, 130), vx: rnd(-30, 30), vy: rnd(-10, 20), life: rnd(0.35, 0.55), colors: WATER_COLS, size: rnd(2, 4), gravity: -90, shrink: true });
    // puddle mist at the far end
    if (this.r.frame % 2 === 0) wfx(w, { laneX: pl.laneX + rnd(-0.6, 0.6), z: reach + rnd(-3, 3), h: rnd(0, 4), dz: -pl.speed * 0.3, vx: rnd(-40, 40), vy: rnd(20, 50), life: 0.45, colors: ['#ffffff', '#c0f8ff'], size: 2, gravity: -60, shrink: true });
    tintMax(w, '#2040e0', 0.06);
    this.roarT += dt;
    if (this.roarT > 0.5) { this.roarT = 0; this.sfx('whoosh'); }
    if (this.r.frame % 4 === 0) this.r.shake(1, 0.05);
  }
  protected override onEnd(): void { this.sfx('uiBack'); }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const f = r.frame;
    // wet lane shimmer under the jet
    roadCone(this.w, pl.laneX, PLAYER_Z + 1, this.reach + 6, 0.9, 1.0, 0, (y, t, x, hw) => {
      if ((y * 3 + f) % 5 !== 0) return;
      r.fillRect(x - hw, y, hw * 2, 1, '#40e0f0', 0.25 * (1 - t * 0.5));
    });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, w = this.w;
    const f = r.frame;
    const lift = this.car.h * pl.sizeMul * 0.95 + pl.air;
    const reach = this.reach;
    roadCone(w, pl.laneX, PLAYER_Z + 1, reach, 0.35, 0.9, lift, (y, t, x, hw) => {
      const wob = Math.sin(y * 0.55 + f * 0.7) * (1 + t * 3);
      const xx = x + wob;
      r.fillRect(xx - hw - 2, y, hw * 2 + 4, 1, '#2040e0', 0.55 * (1 - t * 0.4));
      r.fillRect(xx - hw, y, hw * 2, 1, '#40e0f0', 0.9);
      r.fillRect(xx - hw * 0.55, y, Math.max(1, hw * 1.1), 1, '#c0f8ff');
      if ((y + f) % 3 === 0) r.fillRect(xx - hw * 0.25, y, Math.max(1, hw * 0.5), 1, WHITE);
    });
    // splash foam at the end of the jet
    const far = w.road.project(pl.laneX, reach);
    for (let i = 0; i < 4; i++) {
      const a = f * 0.3 + i * 1.6;
      r.disc(far.x + Math.cos(a) * 8 * far.s * 2, far.y - 3 * far.s + Math.sin(a) * 3, Math.max(1, Math.round((3 + (i % 2)) * far.s * 2)), i % 2 ? WHITE : '#c0f8ff', 0.85);
    }
    // nozzle on the roof + spray burst at its mouth
    const { x } = pl.screen();
    r.sprite(nozzleSprite(), x, this.roofY + 4, { scale: pl.sizeMul });
    r.disc(x, this.roofY - 5, 4 + (f % 2), '#c0f8ff', 0.8);
    r.disc(x, this.roofY - 5, 2, WHITE);
  }
}

// ── 31 SMOKE SCREEN ──────────────────────────────────────────────────────────
class SmokeScreen extends Ab {
  readonly id: AbilityId = 'smokescreen';
  override cooldown = cdOf('smokescreen', 9);
  override duration = durOf('smokescreen', 4);
  private hitT = 0;
  protected onActivate(): void {
    this.sfx('boostStart'); this.r.shake(2, 0.2); this.r.flash('#a8a8b4', 0.2);
    this.w.floatText('DRIFT!', this.pl.laneX, 6, '#f4f4f0', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 2, 30, { speed: 70, spread: Math.PI * 2, colors: SMOKE_COLS, life: 1.0, size: 6, gravity: -10 });
  }
  protected override onUpdate(dt: number): void {
    if (this.hitT > 0) this.hitT -= dt;
    if (!this.active) return;
    const w = this.w, pl = this.pl, s = pl.sizeMul;
    // drift wiggle (Player.spawnEffects adds tyre smoke when |lean| > 0.35)
    pl.lean = Math.sin(this.r.time * 6.5) * 0.75;
    const { x, y } = pl.screen();
    const half = Math.round(this.car.w * 0.32 * s);
    for (let i = 0; i < 3; i++) {
      const side = i % 2 ? 1 : -1;
      w.fx.spawn({ x: x + side * half + rnd(-3, 3), y: y - 1, vx: side * rnd(15, 45) + pl.lean * 20, vy: rnd(-30, 5), life: rnd(0.7, 1.2), maxLife: 1.2, colors: SMOKE_COLS, size: rnd(4, 8) * s, gravity: -14, shrink: true, alpha: 0.9 });
    }
    // big slow plumes drifting back
    if (this.r.frame % 2 === 0) w.fx.spawn({ x: x + rnd(-20, 20) * s, y: y + rnd(0, 6), vx: rnd(-25, 25), vy: rnd(10, 40), life: 1.0, maxLife: 1.0, colors: SMOKE_COLS, size: rnd(7, 11), gravity: 0, shrink: true, alpha: 0.85 });
    // haze rolling up the road
    if (this.r.frame % 3 === 0) wfx(w, { laneX: pl.laneX + rnd(-1.4, 1.4), z: PLAYER_Z + rnd(1, 6), h: rnd(0, 6), dz: rnd(10, 30), vy: rnd(8, 20), life: 0.9, colors: SMOKE_COLS, size: 5, shrink: true, alpha: 0.7 });
    w.mod.fog = Math.max(w.mod.fog, 0.35);
    tintMax(w, '#a8a8b4', 0.1);
    if (this.r.frame % 30 === 0) this.sfx('swipe');
  }
  protected override onEnd(): void { this.sfx('boostEnd'); }
  onCollision(t: Traffic): boolean {
    if (!this.active) return false;
    this.hitT = 0.3; this.sfx('crush'); this.r.shake(5, 0.2); this.w.game.haptics.impact('Heavy');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 20, { speed: 90, colors: SMOKE_COLS, life: 0.7, size: 6, gravity: -20, shrink: true });
    this.w.floatText('DRIFT KILL', t.laneX, t.z, '#f4f4f0', 1);
    return true;
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    // rubber marks: two wavy skid lines behind the wheels
    const half = Math.round(this.car.w * 0.32 * pl.sizeMul);
    for (const sx of [x - half, x + half]) for (let i = 0; i < 14; i++) {
      const yy = y + 2 + i * 2;
      if (yy > r.h) break;
      r.fillRect(sx + Math.sin((yy + r.time * 60) * 0.25) * 3 - 1, yy, 3, 2, '#16161f', 0.5 * (1 - i / 14));
    }
    // smoke cloud disc under the car
    r.disc(x, y - 2, Math.round(24 * pl.sizeMul), '#d9d9d2', 0.2 + 0.05 * Math.sin(r.time * 9));
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r;
    // low smoke bank along the screen bottom (dithered)
    const h = 22 + Math.round(Math.sin(r.time * 3) * 3);
    r.dither(0, r.h - h, r.w, h, '#d9d9d2', '#a8a8b4', 2);
    r.ctx.globalAlpha = 1;
    r.fillRect(0, r.h - h, r.w, h, '#f4f4f0', 0.0);
    r.fillRect(0, r.h - h - 4, r.w, 4, '#d9d9d2', 0.5);
    if (this.hitT > 0) r.fillRect(0, 0, r.w, r.h, WHITE, this.hitT * 0.6);
  }
}

// ── 32 BOULDER ───────────────────────────────────────────────────────────────
interface Rock { laneX: number; z: number; h: number; vh: number; speed: number; life: number; bounces: number; delay: number; }
class Boulder extends Ab {
  readonly id: AbilityId = 'boulder';
  override cooldown = cdOf('boulder', 6);
  private rocks: Rock[] = [];
  private readonly G = 230;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    const lanes = [pl.lane, pl.lane - 1, pl.lane + 1].filter((l) => l >= 0 && l < w.lanes);
    while (lanes.length < 3) lanes.push(pl.lane);
    lanes.forEach((l, i) => this.rocks.push({ laneX: l, z: PLAYER_Z + 2, h: this.car.h * 0.6, vh: 95, speed: 42 + i * 4, life: 3.6, bounces: 0, delay: i * 0.14 }));
    this.sfx('cannon'); this.r.shake(4, 0.25);
    this.w.floatText('ROCKS!', pl.laneX, 6, '#d0a060', 2);
    const { x } = pl.screen();
    w.fx.burst(x, this.roofY + 4, 16, { speed: 70, spread: 1.5, angle: -Math.PI / 2, colors: ['#f4f4f0', '#d0a060', '#7a4a20'], life: 0.4, size: 2, gravity: 150 });
  }
  protected override onUpdate(dt: number): void {
    const w = this.w, pl = this.pl;
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const k = this.rocks[i];
      if (k.delay > 0) { k.delay -= dt; continue; }
      k.life -= dt;
      k.z += k.speed * dt;
      k.h += k.vh * dt; k.vh -= this.G * dt;
      if (k.h <= 0) {
        k.h = 0; k.vh = Math.max(55, Math.abs(k.vh) * 0.8); k.bounces++;
        const p = w.road.project(k.laneX, k.z);
        w.fx.burst(p.x, p.y - 1, 12, { speed: 70 * p.s, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 3 * p.s, gravity: 150 * p.s });
        this.sfx('land'); this.r.shake(Math.max(1, 4 * p.s), 0.12);
        // crush ring on the road
        for (let j = 0; j < 6; j++) wfx(w, { laneX: k.laneX + rnd(-0.5, 0.5), z: k.z + rnd(-2, 2), h: 0, dz: -pl.speed, vy: rnd(10, 30), life: 0.4, colors: DUST_COLS, size: 2, shrink: true });
      }
      // crush anything under / in front of the rock
      for (const t of w.traffic) {
        if (!t.collidable || Math.abs(t.z - k.z) > 3.5 || Math.abs(t.laneX - k.laneX) > 0.65) continue;
        w.destroyTraffic(t, 'weapon', this.knockDir(t));
        t.launch = 30;
        k.vh = Math.max(k.vh, 70);
      }
      // rolling grit
      if (this.r.frame % 3 === 0 && k.h < 6) wfx(w, { laneX: k.laneX + rnd(-0.3, 0.3), z: k.z - 1, h: 1, dz: -pl.speed, vy: rnd(10, 25), life: 0.3, colors: ['#d0a060', '#7a4a20', '#a8a8b4'], size: 2, shrink: true });
      if (k.life <= 0 || k.z > SPAWN_Z) this.rocks.splice(i, 1);
    }
  }
  override renderOver(): void {
    const r = this.r, w = this.w;
    for (const k of this.rocks) {
      if (k.delay > 0) continue;
      const p = w.road.project(k.laneX, k.z);
      if (p.s <= 0.03) continue;
      const sc = p.s * 1.15;
      const shW = Math.max(2, Math.round(18 * sc * (1 - Math.min(0.6, k.h / 60))));
      r.fillRect(p.x - shW / 2, p.y - 1, shW, Math.max(1, Math.round(3 * sc)), '#000000', 0.35 * (1 - Math.min(0.7, k.h / 60)));
      const f = Math.floor((k.z * 0.4 + r.frame * 0.15)) % 2;
      r.sprite(boulderSprite(f), p.x, p.y - k.h * p.s, { scale: sc, flip: Math.floor(k.z / 4) % 2 === 1 });
    }
  }
}

// ── 16×16 HUD icons ───────────────────────────────────────────────────────────
registerIcon('ironbumper', [
  '................', '..############..', '.##..##..##..##.', '.##..##..##..##.', '.##..##..##..##.', '.##..##..##..##.', '.##############.', '.##..##..##..##.',
  '.##..##..##..##.', '.##..##..##..##.', '.##..##..##..##.', '.##############.', '.##..........##.', '.##..........##.', '..#..........#..', '................',
]);
registerIcon('goldrush', [
  '................', '.....########...', '....##########..', '....##########..', '.....########...', '...########.....', '..##########....', '..##########....',
  '...########.....', '.....########...', '....##########..', '....##########..', '.....########...', '................', '..#....#....#...', '................',
]);
registerIcon('repair', [
  '..........#####.', '.........##...##', '.........#.....#', '.........##...##', '........#####.##', '.......######...', '......######....', '.....######.....',
  '....######......', '...######.......', '..######........', '.######.........', '######..........', '#####...........', '####............', '.##.............',
]);
registerIcon('spin', [
  '................', '....########....', '..###......###..', '.##..........##.', '.#.........#####', '.#.........####.', '............###.', '.............#..',
  '..#.............', '.###............', '.####.........#.', '#####.........#.', '.##..........##.', '..###......###..', '....########....', '................',
]);
registerIcon('freeze', [
  '.......#........', '....#..#..#.....', '.....#.#.#......', '......###.......', '.#....###....#..', '..#..#####..#...', '...#..###..#....', '#####.###.#####.',
  '...#..###..#....', '..#..#####..#...', '.#....###....#..', '......###.......', '.....#.#.#......', '....#..#..#.....', '.......#........', '................',
]);
registerIcon('drone', [
  '................', '.######..######.', '...#........#...', '...#........#...', '..###......###..', '..############..', '.##############.', '.####.####.####.',
  '.##############.', '..############..', '...#.######.#...', '......#..#......', '......####......', '.......##.......', '.......##.......', '................',
]);
registerIcon('horn', [
  '................', '.............#..', '............##..', '...........###..', '..........####..', '..#######.####..', '.##############.', '###############.',
  '###############.', '.##############.', '..#######.####..', '..........####..', '...........###..', '............##..', '.............#..', '................',
]);
registerIcon('lightning', [
  '.........####...', '........####....', '.......####.....', '......####......', '.....########...', '....########....', '.......####.....', '......####......',
  '.....####.......', '#...####........', '.#.####.....#...', '..####....#.....', '.####.......#...', '.###............', '.##.............', '.#..............',
]);
registerIcon('shuriken', [
  '.......##.......', '.......##.......', '......####......', '......####......', '.....######.....', '.#...######...#.', '.###.######.###.', '.######..######.',
  '.######..######.', '.###.######.###.', '.#...######...#.', '.....######.....', '......####......', '......####......', '.......##.......', '.......##.......',
]);
registerIcon('lanerip', [
  '................', '................', '...#........#...', '..##........##..', '.###........###.', '################', '################', '.###........###.',
  '..##........##..', '...#........#...', '................', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '................',
]);
registerIcon('hop', [
  '................', '......####......', '.....######.....', '....########....', '..############..', '.##############.', '.##############.', '.##..######..##.',
  '..#..######..#..', '................', '..#..........#..', '.#.#........#.#.', '#...#......#...#', '....##....##....', '.....######.....', '................',
]);
registerIcon('sonicboom', [
  '................', '.....######.....', '...##......##...', '..#..######..#..', '.#..##....##..#.', '.#.#..####..#.#.', '#..#.#....#.#..#', '#..#.#.##.#.#..#',
  '#..#.#.##.#.#..#', '#..#.#....#.#..#', '.#.#..####..#.#.', '.#..##....##..#.', '..#..######..#..', '...##......##...', '.....######.....', '................',
]);
registerIcon('siren', [
  '.......#........', '.#.....#.....#..', '..#....#....#...', '...#...#...#....', '................', '......####......', '.....######.....', '....########....',
  '....########....', '....########....', '....##.#####....', '....##.#####....', '..############..', '.##############.', '.##############.', '................',
]);
registerIcon('watercannon', [
  '................', '............#...', '..........###...', '.........###....', '........###..#..', '.......###..#...', '......###.......', '.....###...#....',
  '#...###...#.....', '##.###..........', '######..........', '######..........', '######..........', '####............', '##..............', '................',
]);
registerIcon('smokescreen', [
  '................', '................', '.......####.....', '.....########...', '....##########..', '..####.#######..', '.####..#########', '.###############',
  '################', '################', '.##############.', '..############..', '...........#....', '..#...#...#.....', '......#.........', '................',
]);
registerIcon('boulder', [
  '................', '.....######.....', '...###.#####....', '..##.###..###...', '.###.######.##..', '.##.#######..##.', '##.##########.#.', '##.###.#######.#',
  '#.###..#######.#', '#.####.########.', '##.##.#########.', '.##.###.######..', '.###.##########.', '..####.#######..', '...##########...', '.....######.....',
]);

export const SET2: Partial<Record<AbilityId, (w: World) => Ability>> = {
  ironbumper: (w) => new IronBumper(w),
  goldrush: (w) => new GoldRush(w),
  repair: (w) => new Repair(w),
  spin: (w) => new Spin(w),
  freeze: (w) => new Freeze(w),
  drone: (w) => new Drone(w),
  horn: (w) => new Horn(w),
  lightning: (w) => new Lightning(w),
  shuriken: (w) => new Shuriken(w),
  lanerip: (w) => new LaneRip(w),
  hop: (w) => new Hop(w),
  sonicboom: (w) => new SonicBoom(w),
  siren: (w) => new Siren(w),
  watercannon: (w) => new WaterCannon(w),
  smokescreen: (w) => new SmokeScreen(w),
  boulder: (w) => new Boulder(w),
};
