import type { AbilityId } from '../../core/types';
import type { SfxName } from '../../core/Audio';
import type { Renderer } from '../../core/Renderer';
import type { PixelSprite } from '../../core/Sprite';
import { Grid, buildSprite, tintSprite } from '../../core/Sprite';
import type { World, Projectile } from '../World';
import type { Traffic } from '../Traffic';
import type { Ability } from '../Ability';
import { BaseAbility } from '../Ability';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { ABILITIES } from '../../content/abilities';
import { registerIcon } from '../../content/icons';
import { rearSprite } from '../../content/vehicleSprites';

// INTEGRATION NOTE (World.ts): World.update() resets `mod`, then runs `player.update()` (which reads mod.speed / mod.grip)
// BEFORE `ability.update()`. Speed multipliers an ability writes into `w.mod.speed` therefore never reach the player.
// Work-around here: `Ab.forceSpeed()` still writes mod.speed (so nothing double-counts once the order is fixed) but also
// nudges `player.speed` directly every frame. Ideal fix: call `this.ability.update(dt)` right after the mechanics loop.
// INTEGRATION NOTE (ui/dev/PropsScreen.ts): `#screen=icons` never imports game/abilities, so icons registered here show
// as missing on that dev sheet; in-game HUD buttons render them fine.

// ─────────────────────────────────────────────────────────────────────────────
// Set 1: nitro, jump, phase, cannon, missile, emp, shield, laser, magnet, slowmo,
// shrink, mega, ram, flame, wings, blink.
// ─────────────────────────────────────────────────────────────────────────────

/** Cooldown / duration come from the catalog (canonical); the fallbacks mirror it. */
function cdOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.cooldown > 0 ? d.cooldown : fallback; }
function durOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.duration && d.duration > 0 ? d.duration : fallback; }

/** approx. metres per lane (lateral) for rings / cones drawn in world space */
const LANE_M = 3;
const WHITE = '#ffffff';
const NITRO_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0', '#101c80'];
const FIRE_COLS = ['#ffffff', '#ffe870', '#f07020', '#e0202a', '#3a3a48'];
const SPARK_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0'];
const DUST_COLS = ['#f4f4f0', '#a8a8b4', '#6a6a78'];
const GHOST_COLS = ['#ffffff', '#ff90c0', '#e04080', '#8030c0'];
const SMOKE_COLS = ['#a8a8b4', '#6a6a78', '#3a3a48'];

// ── drawing helpers ──────────────────────────────────────────────────────────
function line(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1, alpha?: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const c = r.ctx;
  if (alpha !== undefined) c.globalAlpha = alpha;
  c.fillStyle = color;
  for (let n = 0; n < 1200; n++) {
    c.fillRect(x0, y0, thick, thick);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  if (alpha !== undefined) c.globalAlpha = 1;
}
function dotted(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string, alpha?: number, step = 4, phase = 0): void {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(d / step));
  const c = r.ctx;
  if (alpha !== undefined) c.globalAlpha = alpha;
  c.fillStyle = color;
  for (let i = 0; i <= n; i++) {
    const t = (i + phase) / n;
    if (t > 1) break;
    c.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
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
function ellipseRing(r: Renderer, cx: number, cy: number, rx: number, ry: number, color: string, thick = 1, alpha?: number, n = 40, phase = 0): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    r.fillRect(cx + Math.cos(a) * rx - thick / 2, cy + Math.sin(a) * ry - thick / 2, thick, thick, color, alpha);
  }
}
/** pixel-perfect translucent ellipse fill (scanlines) */
function ellipseFill(r: Renderer, cx: number, cy: number, rx: number, ry: number, color: string, alpha: number): void {
  const c = r.ctx;
  c.globalAlpha = alpha; c.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    c.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
  c.globalAlpha = 1;
}
/**
 * Front half of an ellipse lying on the road, centred at (laneX, z): Rz metres forward, Rl metres sideways.
 * Drawn as a polyline so it stays continuous however big it gets (shockwaves, EMP wave, stomp rings).
 */
function roadArc(w: World, laneX: number, z: number, Rz: number, Rl: number, color: string, thick = 2, alpha?: number, n = 36): void {
  const r = w.game.r;
  let px = 0, py = 0, has = false, onPrev = false;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI;
    const zz = z + Math.cos(a) * Rz, lx = laneX + (Math.sin(a) * Rl) / LANE_M;
    if (zz < -1.5) { has = false; continue; }
    const p = w.road.project(lx, zz);
    const on = p.y >= w.road.hy - 2 && p.y <= r.h + 2 && p.x >= -20 && p.x <= r.w + 20;
    if (has && (on || onPrev)) line(r, px, py, p.x, p.y, color, thick, alpha);
    px = p.x; py = p.y; has = true; onPrev = on;
  }
}
/**
 * Scanline-filled cone along a lane: from (laneX, z0) `lanes0` wide to (laneX, z1) `lanes1` wide.
 * `yLift` raises the near end (beam leaving the car's nose). paint(y, t 0..1 near→far, x, halfWidth).
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
/** Radial "warp" streaks racing outward from the vanishing point (nitro / ram). */
function warpLines(w: World, color: string, alpha: number, n = 16, speed = 520, phase = 0): void {
  const r = w.game.r, road = w.road;
  const vx = road.centerX(0.001), vy = road.hy, t = r.time;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase) / n) * Math.PI * 2 + 0.2;
    const cycle = 220 + (i % 3) * 70;
    const d = ((t * speed + i * 83) % cycle) + 24;
    const len = 16 + (i % 4) * 9;
    const x0 = vx + Math.cos(a) * d, y0 = vy + Math.sin(a) * d;
    const x1 = vx + Math.cos(a) * (d + len), y1 = vy + Math.sin(a) * (d + len);
    if ((x0 < 0 && x1 < 0) || (x0 > r.w && x1 > r.w) || (y0 < 0 && y1 < 0) || (y0 > r.h && y1 > r.h)) continue;
    line(r, x0, y0, x1, y1, color, i % 3 === 0 ? 2 : 1, alpha);
  }
}
function tintMax(w: World, color: string, a: number): void { if (a > w.mod.tintA) { w.mod.tint = color; w.mod.tintA = a; } }
interface WfxOpts { laneX: number; z: number; h?: number; dz?: number; vx?: number; vy?: number; life: number; colors?: string[]; color?: string; size: number; gravity?: number; shrink?: boolean; alpha?: number; }
/** depth-attached particle (re-projected every frame; z is relative to the player, dz = -player.speed keeps it fixed in the world) */
function wfx(w: World, o: WfxOpts): void {
  w.fx.spawn({ x: 0, y: 0, laneX: o.laneX, z: o.z, h: o.h ?? 0, dz: o.dz ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life, maxLife: o.life, colors: o.colors, color: o.color ?? WHITE, size: o.size, gravity: o.gravity ?? 0, shrink: o.shrink, alpha: o.alpha });
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ── effect sprites (built lazily, cached by buildSprite) ─────────────────────
function muzzleSprite(): PixelSprite {
  const g = new Grid(15, 15);
  g.line(2, 2, 12, 12, 'y').line(12, 2, 2, 12, 'y');
  g.hline(0, 14, 7, 'Y').vline(7, 0, 14, 'Y');
  g.circle(7, 7, 3, 'y').circle(7, 7, 2, 'w');
  return buildSprite(g.toSource('fx_muzzle', 7, 7));
}
function shellSprite(): PixelSprite {
  const g = new Grid(7, 11);
  g.rect(2, 0, 3, 1, 'D').rect(1, 1, 5, 2, 'D').rect(1, 3, 5, 6, 'd').rect(1, 5, 5, 1, 'x').rect(1, 9, 5, 2, 'D');
  g.vline(1, 3, 8, 'e').px(2, 2, 'e');
  g.outline('k');
  return buildSprite(g.toSource('fx_shell', 3, 5));
}
function missileSprite(): PixelSprite {
  const g = new Grid(9, 15);
  g.px(4, 0, 'r').rect(3, 1, 3, 2, 'r').rect(2, 3, 5, 8, 'w').vline(2, 3, 10, 'f').rect(3, 6, 3, 1, 'r');
  g.rect(0, 9, 2, 4, 'd').rect(7, 9, 2, 4, 'd').rect(2, 11, 5, 2, 'e').rect(3, 13, 3, 2, 'D');
  g.px(3, 4, 'Y');
  g.outline('k');
  return buildSprite(g.toSource('fx_missile', 4, 7));
}
function ghostSprite(): PixelSprite {
  const g = new Grid(11, 12);
  g.ellipse(5, 5, 5, 5, 'M').rect(0, 5, 11, 5, 'M');
  g.rect(0, 10, 3, 1, 'M').rect(4, 10, 3, 1, 'M').rect(8, 10, 3, 1, 'M');
  g.px(0, 11, 'M').px(5, 11, 'M').px(10, 11, 'M');
  g.vline(1, 3, 9, 'w').px(2, 2, 'w');
  g.rect(3, 4, 2, 3, 'k').rect(7, 4, 2, 3, 'k').px(3, 4, 'w').px(7, 4, 'w');
  g.px(5, 8, 'k').px(2, 7, 'm').px(9, 7, 'm');
  g.outline('k');
  return buildSprite(g.toSource('fx_ghost', 5, 12));
}
function magnetSprite(): PixelSprite {
  const g = new Grid(17, 17);
  g.rect(1, 0, 5, 4, 'w').rect(11, 0, 5, 4, 'w').rect(1, 1, 5, 1, 'f').rect(11, 1, 5, 1, 'f').rect(1, 3, 5, 1, 'f').rect(11, 3, 5, 1, 'f');
  g.rect(1, 4, 5, 7, 'r').rect(11, 4, 5, 7, 'r');
  g.rect(1, 11, 15, 2, 'r').rect(2, 13, 13, 2, 'r').rect(4, 15, 9, 2, 'r');
  g.rect(6, 11, 5, 1, 'R').rect(5, 12, 7, 1, 'R').hline(5, 11, 13, 'R');
  g.vline(1, 4, 12, 'm').vline(2, 4, 13, 'm').vline(11, 4, 10, 'm');
  g.hline(6, 10, 16, 'R').hline(3, 13, 15, 'R');
  g.outline('k');
  return buildSprite(g.toSource('fx_magnet', 8, 16));
}
function ramPlateSprite(): PixelSprite {
  const g = new Grid(40, 14);
  for (let x = 4; x <= 36; x += 8) { g.px(x, 0, 'e'); g.rect(x - 1, 1, 3, 2, 'd'); }
  g.rect(1, 3, 38, 9, 'd').rect(2, 4, 36, 2, 'f').rect(2, 10, 36, 2, 'D');
  for (let x = 3; x < 37; x += 6) g.rect(x, 7, 3, 2, 'o');
  for (let x = 4; x < 38; x += 6) g.px(x, 5, 'w');
  g.rect(0, 2, 2, 11, 'e').rect(38, 2, 2, 11, 'e');
  g.outline('k');
  return buildSprite(g.toSource('fx_ramplate', 20, 13));
}
function clockSprite(): PixelSprite {
  const g = new Grid(27, 27);
  g.circle(13, 13, 13, 'k').circle(13, 13, 11, 'w').circle(13, 13, 10, 'q');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    g.px(13 + Math.cos(a) * 9, 13 + Math.sin(a) * 9, 'k');
    if (big) g.px(13 + Math.cos(a) * 8, 13 + Math.sin(a) * 8, 'k');
  }
  g.circle(13, 13, 1, 'k');
  return buildSprite(g.toSource('fx_clock', 13, 13));
}
function wingSprite(flap: number): PixelSprite {
  const W = 72, H = 26, half = 35;
  const g = new Grid(W, H);
  const lift = flap === 0 ? 0 : flap === 1 ? 3 : 6;
  for (let x = 0; x < half; x++) {
    const d = x / (half - 1); // 0 = tip … 1 = root
    const top = Math.round(2 + 8 * d * d + lift * (1 - d) * (1 - d));
    const th = Math.round(3 + 8 * d);
    const scallop = x % 5 === 0 ? 3 : x % 5 === 2 ? 1 : 0;
    const bot = top + th + scallop;
    for (let y = top; y < bot; y++) g.px(x, y, y >= bot - 2 ? 'x' : x < 5 ? 'x' : y === top ? 'q' : 'w');
    if (x % 5 === 0) g.vline(x, Math.max(top + 1, bot - 5), bot - 1, 'e');
  }
  g.mirrorX();
  g.outline('k');
  return buildSprite(g.toSource('fx_wings' + flap, W >> 1, H - 6));
}
function starSprite(): PixelSprite {
  const g = new Grid(7, 7);
  g.hline(0, 6, 3, 'Y').vline(3, 0, 6, 'Y').px(3, 3, 'w').px(2, 2, 'y').px(4, 4, 'y').px(2, 4, 'y').px(4, 2, 'y');
  return buildSprite(g.toSource('fx_star', 3, 3));
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
  /** screen y of the car's nose (top of the sprite) */
  protected noseY(): number { const pl = this.pl; return pl.screen().y - this.car.h * pl.sizeMul - pl.air; }
  /** Speed multiplier that actually reaches the player (see INTEGRATION NOTE at the top). */
  protected forceSpeed(mul: number): void {
    const pl = this.pl, w = this.w;
    w.mod.speed *= mul;
    if (pl.dead) return;
    const base = pl.baseSpeed * (pl.boosting ? pl.boostMul : 1) * w.level.speedMul * (pl.stagger > 0 ? 0.55 : 1);
    const target = base * mul, step = base * 0.08;
    pl.speed = mul >= 1 ? Math.max(pl.speed, Math.min(target, pl.speed + step)) : Math.min(pl.speed, Math.max(target, pl.speed - step));
  }
}

// ── 01 NITRO ─────────────────────────────────────────────────────────────────
class Nitro extends Ab {
  readonly id: AbilityId = 'nitro';
  override cooldown = cdOf('nitro', 9);
  override duration = durOf('nitro', 3);
  protected onActivate(): void {
    this.sfx('boostStart');
    this.r.flash('#40e0f0', 0.4); this.r.shake(3, 0.25);
    this.w.floatText('NITRO!', this.pl.laneX, 6, '#40e0f0', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 26, { speed: 140, colors: SPARK_COLS, life: 0.45, size: 2, gravity: 0 });
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl, r = this.r;
    this.forceSpeed(1.6);
    tintMax(w, '#2040e0', 0.08);
    const { x, y } = pl.screen(); const s = pl.sizeMul;
    const half = Math.round(this.car.w * 0.28 * s);
    for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
      w.fx.spawn({ x: x + side * half + rnd(-1.5, 1.5), y: y - 1, vx: side * rnd(10, 40), vy: rnd(90, 170), life: rnd(0.2, 0.34), maxLife: 0.34, colors: NITRO_COLS, size: rnd(3, 5) * s, gravity: 0, shrink: true });
    }
    // heat sparks streaking past
    if (Math.random() < 0.7) wfx(w, { laneX: pl.laneX + rnd(-1.8, 1.8), z: rnd(12, 60), h: rnd(0, 14), dz: -pl.speed * 1.4, life: 0.5, color: Math.random() < 0.5 ? '#c0f8ff' : WHITE, size: 2, alpha: 0.9 });
    if (r.frame % 5 === 0) r.shake(1, 0.08);
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen(); const r = this.r, s = this.pl.sizeMul, f = r.frame;
    r.disc(x, y - 3, Math.round(22 * s), '#40e0f0', 0.2 + 0.08 * Math.sin(r.time * 30));
    // twin afterburner jets fanning out toward the camera
    const half = Math.round(this.car.w * 0.28 * s);
    for (const side of [-1, 1]) {
      const ex = x + side * half;
      for (let k = 3; k >= 0; k--) {
        const flick = (f + k + (side > 0 ? 1 : 0)) % 3 === 0 ? 1 : 0;
        const rad = Math.max(1, Math.round((1.6 + k * 1.2 + flick * 0.7) * s));
        const cx = ex + side * k * 2.6, cy = y + 1 + k * 3.2;
        r.disc(cx, cy, rad + 1, '#2040e0', 0.5);
        r.disc(cx, cy, rad, k === 0 ? WHITE : k === 1 ? '#c0f8ff' : k === 2 ? '#40e0f0' : '#2040e0');
      }
    }
  }
  override renderOver(): void {
    if (!this.active) return;
    warpLines(this.w, '#c0f8ff', 0.75, 18, 560);
    warpLines(this.w, WHITE, 0.5, 8, 700, 0.5);
  }
  onCollision(): boolean { if (!this.active) return false; this.sfx('crush'); this.r.shake(4, 0.15); return true; }
}

// ── 02 JUMP ──────────────────────────────────────────────────────────────────
class Jump extends Ab {
  readonly id: AbilityId = 'jump';
  override cooldown = cdOf('jump', 4.5);
  override duration = durOf('jump', 1);
  private readonly H = 48;
  private height = 0;
  protected onActivate(): void {
    this.sfx('jump'); this.r.shake(1, 0.1);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 14, { speed: 70, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.35, size: 2, gravity: 120 });
    this.w.floatText('JUMP!', this.pl.laneX, 5, '#f4f4f0', 1);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const pl = this.pl;
    const p = 1 - this.act / this.duration;
    this.height = this.H * Math.sin(Math.PI * p);
    pl.air = Math.round(this.height); pl.airborne = true;
    // wind streaks rushing past the car
    const { x, y } = pl.screen(); const hw = this.car.w * 0.5 * pl.sizeMul;
    for (let i = 0; i < 2; i++) {
      this.w.fx.spawn({ x: x + (Math.random() < 0.5 ? -1 : 1) * rnd(hw + 2, hw + 10), y: y - pl.air - Math.random() * this.car.h, vx: 0, vy: 220, life: 0.16, maxLife: 0.16, color: WHITE, size: 1, gravity: 0, alpha: 0.8 });
    }
  }
  protected override onEnd(): void {
    const pl = this.pl; pl.air = 0; pl.airborne = false; this.height = 0;
    this.sfx('land'); this.r.shake(3, 0.15);
    const { x, y } = pl.screen();
    this.w.fx.burst(x, y, 20, { speed: 100, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 2, gravity: 150 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen(); const r = this.r, s = this.pl.sizeMul;
    // motion-blur ghosts between the shadow and the car
    const g = tintSprite(this.car, WHITE);
    r.sprite(g, x, y - this.pl.air * 0.35, { scale: s, alpha: 0.14 });
    r.sprite(g, x, y - this.pl.air * 0.68, { scale: s, alpha: 0.24 });
  }
}

// ── 03 PHASE ─────────────────────────────────────────────────────────────────
class Phase extends Ab {
  readonly id: AbilityId = 'phase';
  override cooldown = cdOf('phase', 8);
  override duration = durOf('phase', 2.5);
  protected onActivate(): void {
    this.pl.phasing = true;
    this.sfx('whoosh'); this.r.flash('#e04080', 0.3);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 24, { speed: 80, colors: GHOST_COLS, life: 0.5, size: 2, gravity: -40 });
    this.w.floatText('GHOST', this.pl.laneX, 6, '#ff90c0', 2);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    pl.phasing = true;
    // wisps rising off the body
    for (let i = 0; i < 2; i++) wfx(w, { laneX: pl.laneX + rnd(-0.5, 0.5), z: PLAYER_Z + rnd(-0.3, 1.2), h: rnd(2, 12), vy: rnd(30, 60), vx: rnd(-8, 8), life: 0.6, colors: GHOST_COLS, size: 2, shrink: true, alpha: 0.9 });
    tintMax(w, '#8030c0', 0.12);
  }
  protected override onEnd(): void {
    this.pl.phasing = false; this.sfx('whoosh');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 16, { speed: 60, colors: GHOST_COLS, life: 0.4, size: 2 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, { x, y } = pl.screen();
    const s = pl.sizeMul, yy = y - pl.air;
    const off = 3 + Math.round(3 * Math.abs(Math.sin(r.time * 7)));
    const pink = tintSprite(this.car, '#ff90c0'), purple = tintSprite(this.car, '#8030c0');
    // chromatic ghost split + a lifted echo
    r.sprite(pink, x - off, yy, { scale: s, alpha: 0.55 });
    r.sprite(purple, x + off, yy, { scale: s, alpha: 0.55 });
    if (r.frame % 4 < 2) r.sprite(tintSprite(this.car, WHITE), x, yy - 3, { scale: s, alpha: 0.25 });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, { x } = pl.screen();
    const bob = Math.round(Math.sin(r.time * 5) * 3);
    r.sprite(ghostSprite(), x, this.noseY() - 6 + bob, { alpha: 0.85 + 0.15 * Math.sin(r.time * 12) });
  }
}

// ── 04 CANNON ────────────────────────────────────────────────────────────────
class Cannon extends Ab {
  readonly id: AbilityId = 'cannon';
  override cooldown = cdOf('cannon', 2.5);
  private flashT = 0;
  private recoilT = 0;
  private shell: Projectile | null = null;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    this.shell = w.fire({ kind: 'shell', laneX: pl.laneX, z: PLAYER_Z + 3, speed: 190, h: 6, damage: 3, owner: 'player', color: '#3a3a48' });
    this.sfx('cannon'); this.r.shake(5, 0.2); this.r.flash('#ffe870', 0.2);
    this.flashT = 0.14; this.recoilT = 0.3; pl.bump = 5;
    const { x } = pl.screen(); const my = this.noseY() - 4;
    w.fx.burst(x, my, 16, { speed: 100, spread: 1.4, angle: -Math.PI / 2, colors: FIRE_COLS, life: 0.3, size: 2, gravity: 0 });
    w.fx.burst(x, my, 12, { speed: 34, spread: Math.PI * 2, colors: SMOKE_COLS, life: 0.7, size: 3, gravity: -30, shrink: true });
  }
  protected override onUpdate(dt: number): void {
    if (this.flashT > 0) this.flashT -= dt;
    if (this.recoilT > 0) { this.recoilT -= dt; this.forceSpeed(0.8); }
    const s = this.shell;
    if (s && this.w.projectiles.includes(s)) {
      // smoke trail that stays where the shell has been
      wfx(this.w, { laneX: s.laneX + rnd(-0.1, 0.1), z: s.z, h: s.h + 6, dz: -this.pl.speed, vy: rnd(4, 12), life: 0.5, colors: ['#ffe870', '#a8a8b4', '#6a6a78'], size: 3, shrink: true });
    } else this.shell = null;
  }
  override renderOver(): void {
    const r = this.r;
    const s = this.shell;
    if (s) {
      const p = this.w.road.project(s.laneX, s.z);
      const sc = Math.max(0.6, p.s * 1.8);
      r.disc(p.x, p.y - (10 + s.h) * p.s + 5 * sc, Math.max(1, Math.round(2.5 * sc)), r.frame % 2 ? '#f07020' : '#ffe870');
      r.sprite(shellSprite(), p.x, p.y - (10 + s.h) * p.s, { scale: sc, origin: 'center' });
    }
    if (this.flashT <= 0) return;
    const { x } = this.pl.screen(); const my = this.noseY() - 4;
    const sc = 1.2 + this.flashT * 8;
    r.disc(x, my, Math.round(5 * sc), '#ffe870', 0.55);
    r.sprite(muzzleSprite(), x, my, { scale: sc, origin: 'center' });
  }
}

// ── 05 MISSILE ───────────────────────────────────────────────────────────────
class Missile extends Ab {
  readonly id: AbilityId = 'missile';
  override cooldown = cdOf('missile', 5);
  private lock: Traffic | null = null;
  private missile: Projectile | null = null;
  private lockT = 0;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    const target = w.trafficAhead(SPAWN_Z).filter((t) => t.z > 4)[0] ?? null;
    this.missile = w.fire({ kind: 'missile', laneX: pl.laneX, z: PLAYER_Z + 2, speed: 105, h: 12, damage: 4, owner: 'player', target, color: '#e0202a', life: 4 });
    this.lock = target; this.lockT = 1.4;
    this.sfx('missile'); this.r.shake(2, 0.12);
    const { x } = pl.screen(); const my = this.noseY() + 6;
    w.fx.burst(x, my, 18, { speed: 60, spread: Math.PI * 2, colors: ['#ffe870', '#f07020', '#a8a8b4', '#6a6a78'], life: 0.6, size: 3, gravity: -20, shrink: true });
    if (target) w.floatText('LOCK', target.laneX, target.z, '#e0202a', 1);
  }
  protected override onUpdate(dt: number): void {
    if (this.lockT > 0) this.lockT -= dt;
    const m = this.missile;
    if (m && this.w.projectiles.includes(m)) {
      for (let i = 0; i < 2; i++) wfx(this.w, { laneX: m.laneX + rnd(-0.12, 0.12), z: m.z - rnd(0, 1), h: m.h + rnd(0, 3), dz: -this.pl.speed, vy: rnd(6, 16), vx: rnd(-6, 6), life: 0.7, colors: ['#ffe870', '#f4f4f0', '#a8a8b4', '#6a6a78'], size: 3.5, shrink: true });
    } else this.missile = null;
  }
  override renderOver(): void {
    const r = this.r, w = this.w;
    const m = this.missile;
    if (m) {
      const p = w.road.project(m.laneX, m.z);
      const sc = Math.max(0.7, p.s * 1.6);
      const y = p.y - (10 + m.h) * p.s;
      r.disc(p.x, y + 8 * sc, Math.max(1, Math.round(3 * sc)), r.frame % 2 ? '#f07020' : '#ffe870');
      r.disc(p.x, y + 9 * sc, Math.max(1, Math.round(1.5 * sc)), WHITE);
      r.sprite(missileSprite(), p.x, y, { scale: sc, origin: 'center' });
    }
    const t = this.lock;
    if (!t || (this.lockT <= 0 && !m) || !t.collidable) return;
    const p = w.road.project(t.laneX, t.z);
    const sz = Math.max(7, Math.round(24 * p.s)), cx = Math.round(p.x), cy = Math.round(p.y - 8 * p.s);
    const on = r.frame % 6 < 3;
    const col = on ? '#e0202a' : '#ffe870';
    const L = Math.max(3, Math.round(sz / 2.5));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x0 = cx + dx * sz, y0 = cy + dy * sz;
      r.fillRect(dx < 0 ? x0 : x0 - L + 1, y0, L, 2, col);
      r.fillRect(x0, dy < 0 ? y0 : y0 - L + 1, 2, L, col);
    }
    r.fillRect(cx - 1, cy - 1, 3, 3, col);
  }
}

// ── 06 EMP ───────────────────────────────────────────────────────────────────
class Emp extends Ab {
  readonly id: AbilityId = 'emp';
  override cooldown = cdOf('emp', 10);
  override duration = durOf('emp', 1);
  private readonly R = 80;
  private readonly RL = 13; // lateral reach in metres (keeps the wave a readable arc)
  private ringT = -1;
  private arcs: { t: Traffic; life: number }[] = [];
  private get radius(): number { return this.R * Math.min(1, this.ringT / 0.7); }
  protected onActivate(): void {
    this.ringT = 0;
    this.sfx('emp'); this.r.flash('#40e0f0', 0.55); this.r.shake(5, 0.4);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 34, { speed: 150, colors: SPARK_COLS, life: 0.5, size: 2, gravity: 60 });
    this.w.floatText('EMP!', this.pl.laneX, 6, '#40e0f0', 2);
  }
  protected override onUpdate(dt: number): void {
    const w = this.w, pl = this.pl;
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    if (this.ringT < 0) return;
    this.ringT += dt;
    const R = this.radius;
    for (const t of w.traffic) {
      if (!t.collidable || t.z < -2 || t.z - PLAYER_Z > R) continue;
      const knock = t.laneX < pl.laneX - 0.2 ? -1 : t.laneX > pl.laneX + 0.2 ? 1 : (t.laneX < (w.lanes - 1) / 2 ? -1 : 1);
      for (let i = 0; i < 6; i++) wfx(w, { laneX: t.laneX + rnd(-0.4, 0.4), z: t.z, h: rnd(4, 14), dz: -pl.speed, vy: rnd(20, 60), life: 0.5, colors: SPARK_COLS, size: 2, gravity: -40 });
      w.destroyTraffic(t, 'weapon', knock);
      this.arcs.push({ t, life: 0.3 });
      this.sfx('zap');
    }
    // sparks dancing along the wave front
    if (R < this.R) for (let i = 0; i < 3; i++) {
      const a = rnd(-1.25, 1.25);
      wfx(w, { laneX: pl.laneX + (Math.sin(a) * Math.min(R, this.RL)) / LANE_M, z: PLAYER_Z + Math.cos(a) * R, h: rnd(0, 6), dz: -pl.speed, vy: rnd(30, 90), life: 0.35, colors: SPARK_COLS, size: 2, gravity: -60 });
    }
    tintMax(w, '#40e0f0', 0.2 * (1 - this.ringT / 1));
    if (this.ringT > 1) this.ringT = -1;
  }
  override renderOver(): void {
    const r = this.r, w = this.w, pl = this.pl;
    const { x, y } = pl.screen();
    const top = y - this.car.h * pl.sizeMul * 0.7 - pl.air;
    for (const a of this.arcs) {
      const p = w.road.project(a.t.laneX, a.t.z);
      bolt(r, x, top, p.x, p.y - 8 * p.s, '#40e0f0', 8, 7, 2, 0.9);
      bolt(r, x, top, p.x, p.y - 8 * p.s, WHITE, 5, 6, 1);
    }
    if (this.ringT < 0) return;
    const q = Math.min(1, this.ringT / 1), R = this.radius, RL = Math.min(R, this.RL);
    // expanding electric wave rolling down the road
    roadArc(w, pl.laneX, PLAYER_Z, R, RL, '#101c80', 4, 0.6 * (1 - q));
    roadArc(w, pl.laneX, PLAYER_Z, R, RL, '#40e0f0', 3, 1 - q * 0.6);
    roadArc(w, pl.laneX, PLAYER_Z, R, RL, WHITE, 1, 1 - q * 0.5);
    roadArc(w, pl.laneX, PLAYER_Z, R * 0.82, RL * 0.9, '#2040e0', 2, 0.7 * (1 - q));
    // standing bolts on the wave front
    for (let i = 0; i < 4; i++) {
      const a = rnd(-1.3, 1.3);
      const p = w.road.project(pl.laneX + (Math.sin(a) * RL) / LANE_M, PLAYER_Z + Math.cos(a) * R);
      if (p.y < w.road.hy) continue;
      const hgt = 8 + 30 * p.s;
      bolt(r, p.x, p.y, p.x + rnd(-6, 6), p.y - hgt, i % 2 ? WHITE : '#40e0f0', 4, 4, 1, 1 - q * 0.5);
    }
    // bright pulse around the car during the first 0.35 s
    if (this.ringT < 0.35) {
      const k = this.ringT / 0.35, cy = y - this.car.h * pl.sizeMul * 0.5 - pl.air;
      ellipseRing(r, x, cy, 14 + k * 70, 8 + k * 30, '#40e0f0', 3, 1 - k, 56);
      ellipseRing(r, x, cy, 10 + k * 60, 6 + k * 24, WHITE, 2, 1 - k, 48, r.time);
    }
    if (r.frame % 2 === 0) for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      bolt(r, x, top, x + Math.cos(a) * 28, top + Math.sin(a) * 14, i ? '#40e0f0' : WHITE, 4, 3, 1, 0.9 * (1 - q));
    }
  }
}

// ── 07 SHIELD ────────────────────────────────────────────────────────────────
class Shield extends Ab {
  readonly id: AbilityId = 'shield';
  override cooldown = cdOf('shield', 12);
  override duration = durOf('shield', 8);
  private last = 0;
  private crackT = 0;
  protected onActivate(): void {
    this.pl.shield = 2; this.last = 2;
    this.sfx('shield'); this.r.flash('#40e0f0', 0.25);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 22, { speed: 90, colors: ['#ffffff', '#40e0f0', '#60a0ff'], life: 0.5, size: 2, gravity: -30 });
    this.w.floatText('SHIELD', this.pl.laneX, 6, '#60a0ff', 1);
  }
  protected override onUpdate(dt: number): void {
    if (this.crackT > 0) this.crackT -= dt;
    if (!this.active) return;
    const pl = this.pl;
    if (pl.shield < this.last) {
      this.crackT = 0.4; this.r.flash('#40e0f0', 0.4); this.r.shake(4, 0.2);
      const { x, y } = pl.screen();
      this.w.fx.burst(x, y - 12, 30, { speed: 120, colors: ['#ffffff', '#40e0f0', '#2040e0'], life: 0.5, size: 2, gravity: 120 });
      this.last = pl.shield;
    }
    if (pl.shield <= 0) { this.finish(); return; }
    if (Math.random() < 0.35) {
      const { x, y } = pl.screen(); const a = Math.random() * Math.PI * 2;
      this.w.fx.spawn({ x: x + Math.cos(a) * 22, y: y - 12 + Math.sin(a) * 13, vx: 0, vy: -22, life: 0.4, maxLife: 0.4, color: '#c0f8ff', size: 1, gravity: 0, alpha: 0.9 });
    }
  }
  protected override onEnd(): void { this.pl.shield = 0; this.sfx('uiBack'); }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, c = r.ctx;
    const { x, y } = pl.screen();
    const s = pl.sizeMul;
    const cx = Math.round(x), cy = Math.round(y - this.car.h * 0.5 * s - pl.air);
    const rx = Math.round(this.car.w * 0.72 * s) + 2, ry = Math.round(this.car.h * 0.8 * s) + 2;
    const strong = pl.shield >= 2;
    const col = strong ? '#40e0f0' : '#ffe870';
    // translucent bubble (car stays visible) + hex sparkle
    ellipseFill(r, cx, cy, rx, ry, col, 0.22);
    c.globalAlpha = 0.3; c.fillStyle = WHITE;
    for (let yy = -ry + 1; yy < ry; yy += 3) {
      const rowHw = rx * Math.sqrt(Math.max(0, 1 - (yy * yy) / (ry * ry)));
      for (let xx = -rx + (((yy / 3) | 0) & 1) * 2; xx < rx; xx += 4) {
        if (Math.abs(xx) > rowHw * 0.92) continue;
        if ((xx + yy * 0.7) < -rx * 0.15) c.fillRect(cx + xx, cy + yy, 1, 1); // upper-left sheen
      }
    }
    c.globalAlpha = 1;
    if (this.crackT > 0) { ellipseRing(r, cx, cy, rx + 3, ry + 3, WHITE, 2, this.crackT * 2, 48, r.time); }
    const flick = strong || r.frame % 8 < 6;
    if (flick) {
      ellipseRing(r, cx, cy, rx, ry, col, 2, 0.9, 56);
      ellipseRing(r, cx, cy, rx - 2, ry - 2, WHITE, 1, 0.45, 40, r.time * 2);
    }
    // sweeping glint + charge pips
    const a = r.time * 3;
    r.fillRect(cx + Math.cos(a) * (rx - 3) - 1, cy + Math.sin(a) * (ry - 3) - 1, 3, 3, WHITE);
    for (let i = 0; i < pl.shield; i++) {
      const pa = -r.time * 2 + i * Math.PI;
      r.fillRect(cx + Math.cos(pa) * (rx + 4) - 1, cy + Math.sin(pa) * (ry + 3) - 1, 3, 3, col);
      r.fillRect(cx + Math.cos(pa) * (rx + 4), cy + Math.sin(pa) * (ry + 3), 1, 1, WHITE);
    }
  }
}

// ── 08 LASER ─────────────────────────────────────────────────────────────────
class Laser extends Ab {
  readonly id: AbilityId = 'laser';
  override cooldown = cdOf('laser', 8);
  override duration = durOf('laser', 0.6);
  private readonly range = 120;
  protected onActivate(): void {
    this.sfx('laser'); this.r.flash('#e0202a', 0.25); this.r.shake(2, this.duration);
    const { x } = this.pl.screen();
    this.w.fx.burst(x, this.noseY(), 18, { speed: 70, colors: ['#ffffff', '#ff90c0', '#e0202a'], life: 0.35, size: 2 });
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    for (const t of w.trafficAhead(this.range, pl.laneX, 0.6)) w.destroyTraffic(t, 'weapon');
    tintMax(w, '#e0202a', 0.08);
    for (let i = 0; i < 3; i++) wfx(w, { laneX: pl.laneX + rnd(-0.35, 0.35), z: rnd(2, this.range), h: rnd(2, 8), dz: -pl.speed * 0.5, vy: rnd(20, 60), vx: rnd(-20, 20), life: 0.3, colors: ['#ffffff', '#ff90c0', '#e0202a'], size: 2, shrink: true });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const wm = Math.min(1, this.activeT / 0.35) * (0.85 + 0.15 * (r.frame % 2));
    const lift = this.car.h * pl.sizeMul * 0.55 + pl.air;
    roadCone(this.w, pl.laneX, PLAYER_Z + 1, this.range, 0.45 * wm, 0.45 * wm, lift, (y, t, x, hw) => {
      const glow = hw * 2.2 + 1;
      r.fillRect(x - glow, y, glow * 2, 1, '#e0202a', 0.35 * (1 - t * 0.5));
      r.fillRect(x - hw - 1, y, hw * 2 + 2, 1, '#ff90c0');
      r.fillRect(x - hw * 0.5, y, Math.max(1, hw), 1, WHITE);
    });
    const { x, y } = pl.screen();
    r.disc(x, y - lift, Math.round(6 + 2 * (r.frame % 2)), '#e0202a', 0.5);
    r.disc(x, y - lift, Math.round(5 + 2 * (r.frame % 2)), '#ff90c0', 0.8);
    r.disc(x, y - lift, 3, WHITE);
    const far = this.w.road.project(pl.laneX, this.range);
    r.disc(far.x, far.y, Math.round(3 + (r.frame % 3)), WHITE, 0.9);
  }
}

// ── 09 MAGNET ────────────────────────────────────────────────────────────────
class Magnet extends Ab {
  readonly id: AbilityId = 'magnet';
  override cooldown = cdOf('magnet', 10);
  override duration = durOf('magnet', 6);
  protected onActivate(): void {
    this.sfx('powerup'); this.r.flash('#ffd040', 0.2);
    this.w.floatText('MAGNET', this.pl.laneX, 6, '#ffd040', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 18, { speed: 70, colors: ['#ffffff', '#ffe870', '#ffd040'], life: 0.5, size: 2, gravity: -20 });
  }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    for (const c of w.coins) {
      if (c.taken || c.z < -1 || c.z > 140) continue;
      const rate = c.z < 30 ? 6 : c.z < 70 ? 3.5 : 2;
      const d = pl.laneX - c.lane;
      const step = Math.max(-rate * dt, Math.min(rate * dt, d));
      c.lane += step;
      if (c.z < 60) c.z -= dt * 18;
      if (Math.abs(step) > 0.001 && Math.random() < 0.35) wfx(w, { laneX: c.lane - step * 6, z: c.z, h: 8, dz: -pl.speed, vy: rnd(-10, 10), life: 0.35, colors: ['#ffffff', '#ffe870', '#ffd040'], size: 2, shrink: true });
    }
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen();
    this.r.disc(x, y - 2, Math.round(20 * this.pl.sizeMul), '#ffd040', 0.15 + 0.06 * Math.sin(this.r.time * 10));
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, w = this.w;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul - pl.air;
    // attraction lines from coins being pulled
    let n = 0;
    for (const c of w.coins) {
      if (n > 8 || c.taken || c.z < 1 || c.z > 110 || Math.abs(c.lane - pl.laneX) < 0.08) continue;
      const p = w.road.project(c.lane, c.z);
      dotted(r, p.x, p.y - 8 * p.s, x, cy, '#ffd040', 0.6, 4, (r.time * 6) % 1);
      n++;
    }
    for (let k = 0; k < 2; k++) {
      const ph = (r.time * 1.4 + k * 0.5) % 1;
      const rx = 16 + ph * 30, ry = 9 + ph * 16;
      ellipseRing(r, x, cy, rx, ry, k ? '#e0202a' : '#ffd040', 2, 0.9 * (1 - ph), 44 + Math.round(ph * 20), ph);
    }
    const bob = Math.round(Math.sin(r.time * 6) * 2);
    const my = this.noseY() - 6 + bob;
    r.sprite(magnetSprite(), x, my);
    if (r.frame % 8 < 4) {
      bolt(r, x - 6, my - 17, x - 6 + rnd(-4, 4), my - 24, WHITE, 2, 2, 1);
      bolt(r, x + 6, my - 17, x + 6 + rnd(-4, 4), my - 24, WHITE, 2, 2, 1);
    }
  }
}

// ── 10 SLOWMO ────────────────────────────────────────────────────────────────
class Slowmo extends Ab {
  readonly id: AbilityId = 'slowmo';
  override cooldown = cdOf('slowmo', 10);
  override duration = durOf('slowmo', 3);
  private tickT = 0;
  private ticks = 0;
  protected onActivate(): void { this.sfx('freeze'); this.r.flash('#2040e0', 0.35); this.tickT = 0; this.ticks = 0; this.w.floatText('SLOW-MO', this.pl.laneX, 6, '#60a0ff', 1); }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w;
    w.mod.timeScale *= 0.35;
    this.forceSpeed(0.55);
    tintMax(w, '#2040e0', 0.2);
    this.tickT += dt;
    if (this.tickT >= 0.5) { this.tickT -= 0.5; this.ticks++; this.sfx('ui'); }
  }
  protected override onEnd(): void { this.sfx('whoosh'); this.r.flash(WHITE, 0.2); }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r;
    // stepped vignette
    const bands: [number, number][] = [[14, 0.35], [8, 0.3], [4, 0.25]];
    let off = 0;
    for (const [bw, a] of bands) {
      r.fillRect(0, off, r.w, bw, '#101c80', a); r.fillRect(0, r.h - off - bw, r.w, bw, '#101c80', a);
      r.fillRect(off, 0, bw, r.h, '#101c80', a); r.fillRect(r.w - off - bw, 0, bw, r.h, '#101c80', a);
      off += bw;
    }
    // clock in the sky
    const cx = r.w / 2, cy = this.w.road.hy - 46;
    r.disc(cx, cy, 15, '#101c80', 0.5);
    r.sprite(clockSprite(), cx, cy, { origin: 'center' });
    const a = -Math.PI / 2 + (this.ticks % 12) * (Math.PI / 6);
    line(r, cx, cy, cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, '#e0202a', 1);
    const ha = -Math.PI / 2 + r.time * 0.4;
    line(r, cx, cy, cx + Math.cos(ha) * 5, cy + Math.sin(ha) * 5, '#0b0b12', 1);
    r.fillRect(cx - 1, cy - 1, 2, 2, '#0b0b12');
    r.text('SLOW', cx, cy + 19, { align: 'center', color: '#c0f8ff', outline: '#0b0b12' });
  }
}

// ── 11 SHRINK ────────────────────────────────────────────────────────────────
class Shrink extends Ab {
  readonly id: AbilityId = 'shrink';
  override cooldown = cdOf('shrink', 9);
  override duration = durOf('shrink', 4);
  private restoring = false;
  protected onActivate(): void {
    this.sfx('powerup'); this.restoring = false;
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 20, { speed: 70, colors: ['#ffffff', '#ff90c0', '#e04080'], life: 0.5, size: 2, gravity: -20 });
    this.w.floatText('MINI!', this.pl.laneX, 6, '#ff90c0', 2);
  }
  protected override onUpdate(dt: number): void {
    const pl = this.pl;
    if (this.active) {
      pl.sizeMul += (0.5 - pl.sizeMul) * Math.min(1, dt * 10);
      pl.phasing = true;
      if (this.r.frame % 3 === 0) {
        const { x, y } = pl.screen(); const a = Math.random() * Math.PI * 2;
        this.w.fx.spawn({ x: x + Math.cos(a) * 14, y: y - 7 + Math.sin(a) * 7, vx: 0, vy: -25, life: 0.45, maxLife: 0.45, colors: ['#ffffff', '#ff90c0'], size: 2, gravity: 0, shrink: true });
      }
    } else if (this.restoring) {
      pl.sizeMul += (1 - pl.sizeMul) * Math.min(1, dt * 8);
      if (Math.abs(1 - pl.sizeMul) < 0.01) { pl.sizeMul = 1; this.restoring = false; }
    }
  }
  protected override onEnd(): void {
    this.pl.phasing = false; this.restoring = true; this.sfx('whoosh');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 12, { speed: 60, colors: ['#ffffff', '#ff90c0'], life: 0.4, size: 2 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen(); const r = this.r;
    const pulse = 0.5 + 0.5 * Math.sin(r.time * 8);
    r.disc(x, y - 2, 16 + Math.round(pulse * 3), '#ff90c0', 0.22);
    ellipseRing(r, x, y - 2, 17 + pulse * 3, 6 + pulse, '#e04080', 1, 0.8, 32, r.time * 3);
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul;
    for (let i = 0; i < 3; i++) {
      const a = r.time * 4 + (i * Math.PI * 2) / 3;
      const sx = x + Math.cos(a) * 16, sy = cy + Math.sin(a) * 7;
      r.sprite(starSprite(), sx, sy, { origin: 'center', alpha: Math.sin(a) > 0 ? 1 : 0.6 });
    }
  }
}

// ── 12 MEGA ──────────────────────────────────────────────────────────────────
class Mega extends Ab {
  readonly id: AbilityId = 'mega';
  override cooldown = cdOf('mega', 12);
  override duration = durOf('mega', 5);
  private restoring = false;
  private stompT = 0;
  private waveT = 0;
  private cracks: { laneX: number; z: number; seed: number; t: number }[] = [];
  protected onActivate(): void {
    this.sfx('powerup'); this.r.shake(5, 0.3); this.r.flash('#f07020', 0.3);
    this.restoring = false; this.stompT = 0;
    this.w.floatText('MEGA!', this.pl.laneX, 8, '#f07020', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 24, { speed: 100, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.5, size: 3, gravity: 120 });
  }
  protected override onUpdate(dt: number): void {
    const pl = this.pl, w = this.w;
    if (this.waveT > 0) this.waveT -= dt;
    for (let i = this.cracks.length - 1; i >= 0; i--) { const c = this.cracks[i]; c.z -= pl.speed * dt; c.t += dt; if (c.z < -3 || c.t > 1.5) this.cracks.splice(i, 1); }
    if (this.active) {
      pl.sizeMul += (1.6 - pl.sizeMul) * Math.min(1, dt * 8);
      pl.crushAll = true;
      tintMax(w, '#f07020', 0.05);
      this.stompT += dt;
      if (this.stompT >= 0.4) {
        this.stompT = 0; this.waveT = 0.35;
        this.r.shake(4, 0.15); this.sfx('land'); w.game.haptics.impact('Light');
        const { x, y } = pl.screen(); const half = this.car.w * 0.45 * pl.sizeMul;
        for (const wx of [x - half, x + half]) w.fx.burst(wx, y, 8, { speed: 60, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.45, size: 3, gravity: 100, shrink: true });
        for (const side of [-1, 1]) this.cracks.push({ laneX: pl.laneX + side * 0.4, z: PLAYER_Z + rnd(2, 5), seed: Math.random() * 6.28, t: 0 });
      }
    } else if (this.restoring) {
      pl.sizeMul += (1 - pl.sizeMul) * Math.min(1, dt * 8);
      if (Math.abs(1 - pl.sizeMul) < 0.01) { pl.sizeMul = 1; this.restoring = false; }
    }
  }
  protected override onEnd(): void { this.pl.crushAll = false; this.restoring = true; this.sfx('whoosh'); }
  override renderUnder(): void {
    const r = this.r, w = this.w, pl = this.pl;
    // road cracks (scroll with the world)
    for (const c of this.cracks) {
      const p = w.road.project(c.laneX, c.z);
      if (p.s < 0.05) continue;
      const a = 1 - c.t / 1.5, L = 14 * p.s;
      for (let k = 0; k < 4; k++) {
        const ang = c.seed + k * 1.5 + (k % 2) * 0.4;
        const ex = p.x + Math.cos(ang) * L, ey = p.y + Math.sin(ang) * L * 0.4;
        bolt(r, p.x, p.y, ex, ey, '#0b0b12', 3 * p.s, 3, Math.max(1, Math.round(2 * p.s)), a);
      }
    }
    if (!this.active) return;
    const { x, y } = pl.screen();
    r.disc(x, y - 2, Math.round(26 * pl.sizeMul), '#f07020', 0.16 + 0.05 * Math.sin(r.time * 20));
    if (this.waveT > 0) {
      const q = 1 - this.waveT / 0.35;
      roadArc(w, pl.laneX, PLAYER_Z, 1 + q * 14, 1 + q * 6, '#f07020', 3, 1 - q, 28);
      roadArc(w, pl.laneX, PLAYER_Z, 0.5 + q * 11, 0.8 + q * 5, '#ffe870', 2, 1 - q, 24);
    }
  }
}

// ── 13 RAM ───────────────────────────────────────────────────────────────────
class Ram extends Ab {
  readonly id: AbilityId = 'ram';
  override cooldown = cdOf('ram', 6);
  override duration = durOf('ram', 1.5);
  protected onActivate(): void {
    this.sfx('whoosh'); this.r.shake(3, 0.2); this.r.flash('#f07020', 0.2);
    this.w.floatText('RAM!', this.pl.laneX, 6, '#f07020', 2);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl, r = this.r;
    pl.crushAll = true;
    this.forceSpeed(1.4);
    // sparks grinding off the bull bar
    const { x } = pl.screen(); const py = this.noseY() + 2;
    for (let i = 0; i < 2; i++) w.fx.spawn({ x: x + rnd(-16, 16) * pl.sizeMul, y: py, vx: rnd(-60, 60), vy: rnd(-40, 20), life: rnd(0.25, 0.45), maxLife: 0.45, colors: ['#ffffff', '#ffe870', '#f07020'], size: 2, gravity: 260 });
    for (let i = 0; i < 2; i++) wfx(w, { laneX: pl.laneX + rnd(-0.45, 0.45), z: PLAYER_Z + 2.5, h: rnd(2, 8), dz: rnd(40, 80), vy: rnd(10, 40), life: 0.3, colors: ['#ffffff', '#ffe870', '#f07020'], size: 2, gravity: -60, shrink: true });
    if (r.frame % 4 === 0) r.shake(1, 0.06);
  }
  protected override onEnd(): void { this.pl.crushAll = false; }
  onCollision(): boolean {
    if (!this.active) return false;
    this.sfx('crush'); this.r.shake(6, 0.2); this.w.game.haptics.impact('Heavy');
    return true;
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl, w = this.w;
    const { x } = pl.screen();
    const s = pl.sizeMul;
    const py = this.noseY() + 4 + Math.round(Math.sin(r.time * 40));
    r.sprite(ramPlateSprite(), x, py, { scale: s });
    if (r.frame % 2 === 0) r.fillRect(x - 19 * s, py - 12 * s, 38 * s, 1, '#ffe870', 0.9);
    for (let k = 0; k < 3; k++) {
      const z = PLAYER_Z + 3 + ((k * 4 + r.time * 24) % 12);
      const p = w.road.project(pl.laneX, z);
      const sz = 12 * p.s, a = 0.95 - ((z - PLAYER_Z) / 15) * 0.7;
      line(r, p.x - sz, p.y - 2 * p.s, p.x, p.y - 2 * p.s - sz * 0.7, '#f07020', 2, a);
      line(r, p.x, p.y - 2 * p.s - sz * 0.7, p.x + sz, p.y - 2 * p.s, '#f07020', 2, a);
    }
    warpLines(w, '#ffe870', 0.55, 10, 480);
  }
}

// ── 14 FLAME ─────────────────────────────────────────────────────────────────
class Flame extends Ab {
  readonly id: AbilityId = 'flame';
  override cooldown = cdOf('flame', 7);
  override duration = durOf('flame', 2);
  private readonly range = 40;
  private roarT = 0;
  private get reach(): number { return this.range * Math.min(1, this.elapsed / 0.3); }
  protected onActivate(): void { this.sfx('whoosh'); this.r.flash('#f07020', 0.25); this.roarT = 0; }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    const reach = this.reach;
    for (const t of w.traffic) {
      if (!t.collidable || t.z < 0 || t.z > reach || Math.abs(t.laneX - pl.laneX) > 1.5) continue;
      for (let i = 0; i < 5; i++) wfx(w, { laneX: t.laneX + rnd(-0.3, 0.3), z: t.z, h: rnd(2, 12), dz: -pl.speed, vy: rnd(30, 70), life: 0.5, colors: FIRE_COLS, size: 4, gravity: -20, shrink: true });
      w.destroyTraffic(t, 'weapon');
    }
    for (let i = 0; i < 3; i++) wfx(w, { laneX: pl.laneX + rnd(-0.3, 0.3), z: PLAYER_Z + 1, h: rnd(3, 8), dz: rnd(60, 110), vx: rnd(-40, 40), vy: rnd(10, 40), life: rnd(0.3, 0.5), colors: FIRE_COLS, size: rnd(3, 6), gravity: -30, shrink: true });
    tintMax(w, '#f07020', 0.07);
    this.roarT += dt;
    if (this.roarT > 0.45) { this.roarT = 0; this.sfx('whoosh'); }
    if (this.r.frame % 3 === 0) this.r.shake(1, 0.05);
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const f = r.frame;
    const lift = this.car.h * pl.sizeMul * 0.85 + pl.air;
    roadCone(this.w, pl.laneX, PLAYER_Z, this.reach, 0.5, 2.6, lift, (y, t, x, hw) => {
      const n = (y * 7 + f * 5) % 7;
      // flickering tip: rows drop out toward the far end
      if (t > 0.7 && n < (t - 0.7) * 16) return;
      const h = hw * (0.85 + 0.25 * Math.sin(y * 0.55 + f * 0.6) + (n - 3) * 0.04);
      const a = t < 0.5 ? 1 : 1 - (t - 0.5) * 0.9;
      r.fillRect(x - h, y, h * 2, 1, t > 0.55 ? '#e0202a' : '#f07020', a);
      const h2 = h * (t < 0.3 ? 0.8 : t < 0.6 ? 0.62 : 0.4);
      r.fillRect(x - h2, y, h2 * 2, 1, t > 0.6 ? '#f07020' : '#ffe870', a);
      if (t < 0.55) { const h3 = h * (0.45 - t * 0.5); r.fillRect(x - h3, y, Math.max(1, h3 * 2), 1, n < 4 ? WHITE : '#ffe870', a); }
      // side tongues licking outward
      if (n === 0 || n === 4) { const side = n === 0 ? -1 : 1; r.fillRect(x + side * h + (side < 0 ? -3 : 0), y, 3, 1, t > 0.5 ? '#e0202a' : '#f07020', a * 0.9); }
    });
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, { x } = this.pl.screen();
    const ny = this.noseY() - 2, f = r.frame;
    r.disc(x, ny, 6 + (f % 2), '#f07020', 0.9);
    r.disc(x, ny, 4 + (f % 3 === 0 ? 1 : 0), '#ffe870');
    r.disc(x, ny, 2, WHITE);
  }
}

// ── 15 WINGS ─────────────────────────────────────────────────────────────────
class Wings extends Ab {
  readonly id: AbilityId = 'wings';
  override cooldown = cdOf('wings', 9);
  override duration = durOf('wings', 3);
  private readonly H = 40;
  private height = 0;
  protected onActivate(): void {
    this.sfx('jump'); this.sfx('whoosh');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 18, { speed: 60, colors: ['#ffffff', '#ffd040'], life: 0.6, size: 2, gravity: 30 });
    this.w.floatText('WINGS!', this.pl.laneX, 6, '#ffd040', 1);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const pl = this.pl, w = this.w;
    const e = this.elapsed, rem = this.act;
    const k = Math.min(1, e / 0.35, rem / 0.35);
    const sm = k * k * (3 - 2 * k);
    this.height = this.H * sm + Math.sin(this.r.time * 5) * 2 * sm;
    pl.air = Math.round(this.height); pl.airborne = true;
    if (this.r.frame % 3 === 0) {
      const { x, y } = pl.screen(); const side = Math.random() < 0.5 ? -1 : 1;
      w.fx.spawn({ x: x + side * rnd(18, 32), y: y - pl.air - 8, vx: side * 6, vy: 22, life: 0.9, maxLife: 0.9, colors: ['#ffffff', '#f4f4f0', '#a8a8b4'], size: 2, gravity: 25, alpha: 0.9 });
    }
    if (Math.random() < 0.8) wfx(w, { laneX: pl.laneX + rnd(-1.5, 1.5), z: rnd(10, 40), h: rnd(8, 20), dz: -pl.speed * 1.3, life: 0.4, color: WHITE, size: 1, alpha: 0.6 });
  }
  protected override onEnd(): void {
    const pl = this.pl; pl.air = 0; pl.airborne = false; this.height = 0;
    this.sfx('land'); this.r.shake(2, 0.12);
    const { x, y } = pl.screen();
    this.w.fx.burst(x, y, 14, { speed: 80, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 2, gravity: 150 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const unfold = Math.min(1, this.elapsed / 0.3);
    const flap = Math.floor(r.time * 8) % 4;
    const spr = wingSprite(flap === 3 ? 1 : flap);
    const wy = y - pl.air - this.car.h * pl.sizeMul * 0.3;
    r.sprite(spr, x, wy, { sx: Math.max(0.15, unfold) * pl.sizeMul, sy: pl.sizeMul });
    // golden glow at the wing roots
    r.disc(x, wy - 4, 6, '#ffd040', 0.35 + 0.15 * Math.sin(r.time * 10));
  }
}

// ── 16 BLINK ─────────────────────────────────────────────────────────────────
class Blink extends Ab {
  readonly id: AbilityId = 'blink';
  override cooldown = cdOf('blink', 6);
  private readonly D = 60;
  private fxT = 0;
  protected onActivate(): void {
    const w = this.w, pl = this.pl, D = this.D;
    for (const t of w.traffic) t.z -= D;
    for (const c of w.coins) c.z -= D;
    for (const h of w.hazards) h.z -= D;
    for (const p of w.props) p.z -= D;
    for (const p of w.projectiles) p.z -= D;
    for (const e of w.explosions) if (e.z !== undefined) e.z -= D;
    for (const f of w.floats) if (f.z !== undefined) f.z -= D;
    for (const p of w.fx.list) if (p.z !== undefined) p.z -= D;
    w.distance += D; w.road.scroll += D; w.score += D * 0.5;
    for (const t of w.traffic) if (t.collidable && Math.abs(t.z - PLAYER_Z) < 6) w.destroyTraffic(t, 'weapon');
    this.sfx('zap'); this.sfx('whoosh');
    this.r.flash(WHITE, 0.6); this.r.shake(3, 0.2);
    this.fxT = 0.4;
    const { x, y } = pl.screen();
    w.fx.burst(x, y - 12, 26, { speed: 120, colors: SPARK_COLS, life: 0.4, size: 2, gravity: 0 });
    w.floatText('BLINK', pl.laneX, 6, '#40e0f0', 1);
  }
  protected override onUpdate(dt: number): void {
    if (this.fxT > 0) { this.fxT -= dt; tintMax(this.w, '#40e0f0', 0.3 * (this.fxT / 0.4)); }
  }
  override renderOver(): void {
    if (this.fxT <= 0) return;
    const r = this.r, w = this.w, pl = this.pl;
    const q = this.fxT / 0.4;
    const { x, y } = pl.screen();
    const ghost = tintSprite(this.car, q > 0.5 ? WHITE : '#40e0f0');
    for (let k = 1; k <= 5; k++) {
      const p = w.road.project(pl.laneX, PLAYER_Z + k * 9 * q);
      r.sprite(ghost, p.x, p.y - pl.air * p.s, { scale: p.s * pl.sizeMul, alpha: 0.55 * q * (1 - k / 6) });
    }
    const top = y - this.car.h * pl.sizeMul * 0.6 - pl.air;
    r.fillRect(x - 3, w.road.hy, 6, top - w.road.hy, '#c0f8ff', 0.45 * q);
    r.fillRect(x - 1, w.road.hy, 2, top - w.road.hy, WHITE, 0.6 * q);
    if (q > 0.35) for (let i = 0; i < 2; i++) {
      const sx = x + (i ? 40 : -40) * q;
      bolt(r, sx, top - 90, x, top, i ? '#40e0f0' : WHITE, 9, 7, 2, q);
    }
  }
}

// ── 16×16 HUD icons ───────────────────────────────────────────────────────────
registerIcon('nitro', [
  '......##........', '.....###........', '.....####.......', '....#####.......', '....######..#...', '...#######..##..', '...########.##..', '..##############',
  '..##############', '..#############.', '..#############.', '...###########..', '...##########...', '....########....', '.....######.....', '......####......',
]);
registerIcon('jump', [
  '.......##.......', '......####......', '.....######.....', '....########....', '......####......', '......####......', '......####......', '................',
  '.....######.....', '....#......#....', '...##########...', '..############..', '.##############.', '.##############.', '.##.########.##.', '..#..######..#..',
]);
registerIcon('phase', [
  '.....######.....', '....########....', '...##########...', '..############..', '..###..##..###..', '..###..##..###..', '..############..', '..############..',
  '..############..', '..############..', '..############..', '..############..', '..############..', '..##.###.###.##.', '..#..##...##..#.', '................',
]);
registerIcon('cannon', [
  '.......##.......', '......####......', '.....######.....', '.....######.....', '....########....', '....########....', '....########....', '....########....',
  '....########....', '....########....', '....##....##....', '....########....', '...##########...', '...##########...', '...##########...', '................',
]);
registerIcon('missile', [
  '.......##.......', '......####......', '.....######.....', '.....######.....', '.....##..##.....', '.....##..##.....', '.....######.....', '.....######.....',
  '.....######.....', '..##.######.##..', '.###.######.###.', '.##############.', '.##..######..##.', '......####......', '.......##.......', '........#.......',
]);
registerIcon('emp', [
  '.....######.....', '...##......##...', '..#..........#..', '.#.......###..#.', '#.......###....#', '#......###.....#', '#.....#######..#', '#........###...#',
  '#.......###....#', '#......###.....#', '#.....###......#', '.#....##......#.', '..#..........#..', '...##......##...', '.....######.....', '................',
]);
registerIcon('shield', [
  '.##############.', '################', '##....####....##', '##....####....##', '##....####....##', '##....####....##', '################', '################',
  '.##....##....##.', '.##....##....##.', '..##...##...##..', '...##..##..##...', '....##.##.##....', '.....######.....', '......####......', '.......##.......',
]);
registerIcon('laser', [
  '.....#.##.#.....', '......####......', '....########....', '......####......', '.....#.##.#.....', '.......##.......', '.......##.......', '.......##.......',
  '.......##.......', '.......##.......', '......####......', '......####......', '....########....', '...##########...', '...##########...', '....########....',
]);
registerIcon('magnet', [
  '..####....####..', '..####....####..', '..####....####..', '................', '..####....####..', '..####....####..', '..####....####..', '..####....####..',
  '..####....####..', '..#####..#####..', '..############..', '...##########...', '....########....', '.....######.....', '................', '................',
]);
registerIcon('slowmo', [
  '.....######.....', '...##......##...', '..#....##....#..', '.#.....##.....#.', '#......##......#', '#......##......#', '#......##......#', '#......###.....#',
  '#.......###....#', '#........###...#', '#..............#', '.#............#.', '..#..........#..', '...##......##...', '.....######.....', '................',
]);
registerIcon('shrink', [
  '##............##', '#.#..........#.#', '..#..........#..', '................', '................', '......####......', '.....######.....', '....########....',
  '...##########...', '...##########...', '...##.####.##...', '....#......#....', '................', '..#..........#..', '#.#..........#.#', '##............##',
]);
registerIcon('mega', [
  '.....######.....', '....########....', '...##......##...', '..##........##..', '.##############.', '.##############.', '################', '################',
  '###..######..###', '###..######..###', '################', '################', '################', '.##..........##.', '.##..........##.', '................',
]);
registerIcon('ram', [
  '.###........###.', '#...#......#...#', '#....#....#....#', '.#...#....#...#.', '..###.####.###..', '....########....', '...##########...', '...##########...',
  '...##.####.##...', '...##########...', '....########....', '.....######.....', '.....#....#.....', '.....######.....', '......####......', '................',
]);
registerIcon('flame', [
  '#.....#..#.....#', '##...###.##...##', '###.###..###.###', '.###########.##.', '.##############.', '..############..', '..############..', '...##########...',
  '...##########...', '....########....', '....########....', '.....######.....', '.....######.....', '......####......', '......####......', '.......##.......',
]);
registerIcon('wings', [
  '#..............#', '##............##', '###..........###', '####........####', '#####......#####', '######.##.######', '################', '.##############.',
  '.#####.##.#####.', '..###..##..###..', '..##...##...##..', '...#...##...#...', '.......##.......', '.......##.......', '................', '................',
]);
registerIcon('blink', [
  '........####....', '.......####.....', '......####......', '.....####.......', '....########....', '...#########....', '......####......', '.....####.......',
  '....####........', '...####.........', '..####..........', '.####...........', '................', '..#.......#.....', '.#.........#....', '................',
]);

export const SET1: Partial<Record<AbilityId, (w: World) => Ability>> = {
  nitro: (w) => new Nitro(w),
  jump: (w) => new Jump(w),
  phase: (w) => new Phase(w),
  cannon: (w) => new Cannon(w),
  missile: (w) => new Missile(w),
  emp: (w) => new Emp(w),
  shield: (w) => new Shield(w),
  laser: (w) => new Laser(w),
  magnet: (w) => new Magnet(w),
  slowmo: (w) => new Slowmo(w),
  shrink: (w) => new Shrink(w),
  mega: (w) => new Mega(w),
  ram: (w) => new Ram(w),
  flame: (w) => new Flame(w),
  wings: (w) => new Wings(w),
  blink: (w) => new Blink(w),
};
