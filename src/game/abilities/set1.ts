import type { AbilityId } from '../../core/types';
import type { SfxName } from '../../core/Audio';
import type { Renderer } from '../../core/Renderer';
import type { PixelSprite } from '../../core/Sprite';
import { Grid, buildSprite, tintSprite } from '../../core/Sprite';
import type { World } from '../World';
import type { Traffic } from '../Traffic';
import type { Ability } from '../Ability';
import { BaseAbility } from '../Ability';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { ABILITIES } from '../../content/abilities';
import { registerIcon } from '../../content/icons';
import { rearSprite } from '../../content/vehicleSprites';

// INTEGRATION NOTE (Player.ts): Player.render() draws the ground shadow at full size even while `air > 0`.
// Jump/Wings draw their own shrinking shadow in renderUnder; ideally the player shadow would scale with
// `1 - air / 60` so the two do not overlap.
// DEV: `#level=1&car=gtr_r34&ab=<abilityId>` overrides the ability of the (only) roster vehicle for screenshots.

// ─────────────────────────────────────────────────────────────────────────────
// Set 1: nitro, jump, phase, cannon, missile, emp, shield, laser, magnet, slowmo,
// shrink, mega, ram, flame, wings, blink.
// ─────────────────────────────────────────────────────────────────────────────

/** Cooldown / duration come from the catalog when present, otherwise the spec defaults below. */
function cdOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.cooldown > 0 ? d.cooldown : fallback; }
function durOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.duration && d.duration > 0 ? d.duration : fallback; }

/** approx. metres per lane (lateral) for rings / cones drawn in world space */
const LANE_M = 3;
const WHITE = '#ffffff';
const NITRO_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0', '#101c80'];
const FIRE_COLS = ['#ffffff', '#ffe870', '#f07020', '#e0202a', '#3a3a48'];
const SPARK_COLS = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0'];
const DUST_COLS = ['#f4f4f0', '#a8a8b4', '#6a6a78'];

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
function ellipseRing(r: Renderer, cx: number, cy: number, rx: number, ry: number, color: string, thick = 1, alpha?: number, n = 40, phase = 0): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    r.fillRect(cx + Math.cos(a) * rx - thick / 2, cy + Math.sin(a) * ry - thick / 2, thick, thick, color, alpha);
  }
}
/** Ring lying flat on the road, centred at (laneX, z) with radius R metres. */
function roadRing(w: World, laneX: number, z: number, R: number, color: string, thick = 2, alpha?: number): void {
  const r = w.game.r, n = Math.round(Math.min(140, Math.max(28, R * 2.2)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const zz = z + Math.sin(a) * R;
    if (zz < -1.5) continue;
    const p = w.road.project(laneX + (Math.cos(a) * R) / LANE_M, zz);
    if (p.y < w.road.hy || p.y > r.h + 2 || p.x < -4 || p.x > r.w + 4) continue;
    r.fillRect(p.x - thick / 2, p.y - thick / 2, thick, thick, color, alpha);
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
function speedLines(r: Renderer, time: number, color: string, alpha: number, n = 10): void {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const x = r.w / 2 + side * (34 + ((i * 53) % 78));
    const len = 12 + (i % 3) * 10;
    const y = ((time * 700 + i * 131) % (r.h + len)) - len;
    r.fillRect(x, y, 1, len, color, alpha);
  }
}
function tintMax(w: World, color: string, a: number): void { if (a > w.mod.tintA) { w.mod.tint = color; w.mod.tintA = a; } }
interface WfxOpts { laneX: number; z: number; h?: number; dz?: number; vx?: number; vy?: number; life: number; colors?: string[]; color?: string; size: number; gravity?: number; shrink?: boolean; alpha?: number; }
/** depth-attached particle (re-projected every frame; z is relative to the player) */
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
function magnetSprite(): PixelSprite {
  const g = new Grid(13, 13);
  g.rect(1, 0, 4, 3, 'w').rect(8, 0, 4, 3, 'w').rect(1, 1, 4, 1, 'f').rect(8, 1, 4, 1, 'f');
  g.rect(1, 3, 4, 5, 'r').rect(8, 3, 4, 5, 'r');
  g.rect(1, 8, 11, 2, 'r').rect(2, 10, 9, 1, 'r').rect(3, 11, 7, 1, 'R');
  g.rect(4, 8, 5, 1, 'R').vline(4, 3, 8, 'R').vline(8, 3, 8, 'R');
  g.vline(1, 3, 9, 'm').hline(2, 10, 10, 'R');
  g.outline('k');
  return buildSprite(g.toSource('fx_magnet', 6, 12));
}
function ramPlateSprite(): PixelSprite {
  const g = new Grid(38, 11);
  g.rect(1, 1, 36, 8, 'd').rect(2, 2, 34, 2, 'f').rect(2, 7, 34, 2, 'D');
  for (let x = 4; x < 36; x += 6) { g.px(x, 5, 'w'); g.px(x + 1, 5, 'e'); }
  g.hline(1, 36, 9, 'o');
  g.rect(0, 3, 2, 5, 'e').rect(36, 3, 2, 5, 'e');
  g.outline('k');
  return buildSprite(g.toSource('fx_ramplate', 19, 10));
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
  const W = 56, H = 22, half = 27;
  const g = new Grid(W, H);
  for (let x = 0; x < half; x++) {
    const d = x / (half - 1); // 0 = tip … 1 = root
    const top = Math.round(3 + 6 * d * d + (1 - flap) * 5 * (1 - d));
    const th = Math.round(3 + 6 * d);
    const scallop = x % 4 === 0 ? 2 : x % 4 === 2 ? 1 : 0;
    const bot = top + th + scallop;
    for (let y = top; y < bot; y++) g.px(x, y, y >= bot - 2 ? 'f' : x < 4 ? 'x' : 'w');
    if (x % 4 === 0) g.vline(x, Math.max(top + 1, bot - 4), bot - 1, 'e');
  }
  g.mirrorX();
  g.outline('k');
  return buildSprite(g.toSource('fx_wings' + flap, W >> 1, H - 4));
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
}

// ── 01 NITRO ─────────────────────────────────────────────────────────────────
class Nitro extends Ab {
  readonly id: AbilityId = 'nitro';
  override cooldown = cdOf('nitro', 9);
  override duration = durOf('nitro', 3);
  protected onActivate(): void {
    this.sfx('boostStart');
    this.r.flash('#40e0f0', 0.35); this.r.shake(3, 0.25);
    this.w.floatText('NITRO!', this.pl.laneX, 6, '#40e0f0', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 24, { speed: 130, color: '#40e0f0', life: 0.4, size: 2, gravity: 0 });
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    w.mod.speed *= 1.6;
    tintMax(w, '#2040e0', 0.08);
    const { x, y } = pl.screen(); const s = pl.sizeMul;
    const half = Math.round(this.car.w * 0.28 * s);
    for (const ex of [x - half, x + half]) for (let i = 0; i < 2; i++) {
      w.fx.spawn({ x: ex + rnd(-1.5, 1.5), y: y - 2, vx: rnd(-7, 7), vy: rnd(110, 180), life: rnd(0.22, 0.38), maxLife: 0.38, colors: NITRO_COLS, size: rnd(3, 5) * s, gravity: 0, shrink: true });
    }
    // heat sparks flying past
    if (Math.random() < 0.5) wfx(w, { laneX: pl.laneX + rnd(-1.4, 1.4), z: rnd(20, 60), h: rnd(0, 10), dz: -pl.speed * 1.2, life: 0.5, color: '#c0f8ff', size: 2, alpha: 0.8 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen(); const r = this.r;
    r.disc(x, y - 3, Math.round(20 * this.pl.sizeMul), '#40e0f0', 0.18 + 0.08 * Math.sin(r.time * 30));
  }
  override renderOver(): void { if (this.active) speedLines(this.r, this.r.time, '#c0f8ff', 0.55, 12); }
  onCollision(): boolean { if (!this.active) return false; this.sfx('crush'); this.r.shake(4, 0.15); return true; }
}

// ── 02 JUMP ──────────────────────────────────────────────────────────────────
class Jump extends Ab {
  readonly id: AbilityId = 'jump';
  override cooldown = cdOf('jump', 5);
  override duration = durOf('jump', 1);
  private readonly H = 46;
  private height = 0;
  protected onActivate(): void {
    this.sfx('jump'); this.r.shake(1, 0.1);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 12, { speed: 60, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.35, size: 2, gravity: 120 });
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const pl = this.pl;
    const p = 1 - this.act / this.duration;
    this.height = this.H * Math.sin(Math.PI * p);
    pl.air = Math.round(this.height); pl.airborne = true;
    if (Math.random() < 0.7) {
      const { x, y } = pl.screen();
      this.w.fx.spawn({ x: x + rnd(-0.6, 0.6) * this.car.w, y: y - pl.air - Math.random() * this.car.h * 0.6, vx: 0, vy: 170, life: 0.18, maxLife: 0.18, color: WHITE, size: 1, gravity: 0, alpha: 0.7 });
    }
  }
  protected override onEnd(): void {
    const pl = this.pl; pl.air = 0; pl.airborne = false; this.height = 0;
    this.sfx('land'); this.r.shake(3, 0.15);
    const { x, y } = pl.screen();
    this.w.fx.burst(x, y, 18, { speed: 90, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 2, gravity: 150 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const { x, y } = this.pl.screen(); const k = 1 - (this.height / this.H) * 0.6;
    const sw = Math.round(this.car.w * 0.8 * k * this.pl.sizeMul);
    this.r.fillRect(x - sw / 2, y - 1, sw, 3, '#000000', 0.25 + 0.2 * k);
  }
}

// ── 03 PHASE ─────────────────────────────────────────────────────────────────
class Phase extends Ab {
  readonly id: AbilityId = 'phase';
  override cooldown = cdOf('phase', 9);
  override duration = durOf('phase', 2.5);
  private trail: { x: number; y: number }[] = [];
  protected onActivate(): void {
    this.pl.phasing = true; this.trail.length = 0;
    this.sfx('whoosh'); this.r.flash('#e04080', 0.25);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 20, { speed: 70, colors: ['#ff90c0', '#e04080', '#8030c0'], life: 0.5, size: 2, gravity: -40 });
    this.w.floatText('GHOST', this.pl.laneX, 6, '#ff90c0', 1);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    pl.phasing = true;
    const { x, y } = pl.screen();
    this.trail.unshift({ x, y: y - pl.air });
    if (this.trail.length > 18) this.trail.pop();
    if (Math.random() < 0.6) wfx(w, { laneX: pl.laneX + rnd(-0.6, 0.6), z: PLAYER_Z + rnd(-0.5, 2.5), h: 2, vy: rnd(25, 50), life: 0.6, colors: ['#ff90c0', '#e04080', '#8030c0'], size: 2, shrink: true, alpha: 0.85 });
    tintMax(w, '#8030c0', 0.1);
  }
  protected override onEnd(): void {
    this.pl.phasing = false; this.trail.length = 0; this.sfx('whoosh');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 14, { speed: 60, colors: ['#ff90c0', '#e04080'], life: 0.4, size: 2 });
  }
  override renderUnder(): void {
    if (!this.active) return;
    const g1 = tintSprite(this.car, '#ff90c0'), g2 = tintSprite(this.car, '#8030c0');
    const n = this.trail.length;
    for (let i = 3; i < n; i += 3) {
      const t = this.trail[i];
      this.r.sprite(i % 6 ? g1 : g2, t.x, t.y + i * 2, { scale: this.pl.sizeMul, alpha: 0.45 * (1 - i / n) });
    }
  }
}

// ── 04 CANNON ────────────────────────────────────────────────────────────────
class Cannon extends Ab {
  readonly id: AbilityId = 'cannon';
  override cooldown = cdOf('cannon', 2.5);
  private flashT = 0;
  private recoilT = 0;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    w.fire({ kind: 'shell', laneX: pl.laneX, z: PLAYER_Z + 4, speed: 240, h: 6, damage: 3, owner: 'player', color: '#3a3a48' });
    this.sfx('cannon'); this.r.shake(4, 0.2); this.r.flash('#ffe870', 0.15);
    this.flashT = 0.12; this.recoilT = 0.3;
    const { x, y } = pl.screen(); const my = y - this.car.h * pl.sizeMul - 4;
    w.fx.burst(x, my, 14, { speed: 90, spread: 1.4, angle: -Math.PI / 2, colors: FIRE_COLS, life: 0.3, size: 2, gravity: 0 });
    w.fx.burst(x, my, 10, { speed: 30, spread: Math.PI * 2, colors: ['#a8a8b4', '#6a6a78'], life: 0.6, size: 3, gravity: -30, shrink: true });
  }
  protected override onUpdate(dt: number): void {
    if (this.flashT > 0) this.flashT -= dt;
    if (this.recoilT > 0) { this.recoilT -= dt; this.w.mod.speed *= 0.8; }
  }
  override renderOver(): void {
    if (this.flashT <= 0) return;
    const { x, y } = this.pl.screen();
    const my = y - this.car.h * this.pl.sizeMul - 4;
    const sc = 1 + this.flashT * 6;
    this.r.disc(x, my, Math.round(4 * sc), '#ffe870', 0.6);
    this.r.sprite(muzzleSprite(), x, my, { scale: sc, origin: 'center' });
  }
}

// ── 05 MISSILE ───────────────────────────────────────────────────────────────
class Missile extends Ab {
  readonly id: AbilityId = 'missile';
  override cooldown = cdOf('missile', 5);
  private lock: Traffic | null = null;
  private lockT = 0;
  protected onActivate(): void {
    const w = this.w, pl = this.pl;
    const target = w.trafficAhead(SPAWN_Z).filter((t) => t.z > 4)[0] ?? null;
    w.fire({ kind: 'missile', laneX: pl.laneX, z: PLAYER_Z + 3, speed: 120, h: 10, damage: 4, owner: 'player', target, color: '#e0202a', life: 4 });
    this.lock = target; this.lockT = 0.7;
    this.sfx('missile'); this.r.shake(2, 0.12);
    const { x, y } = pl.screen(); const my = y - this.car.h * pl.sizeMul * 0.6;
    w.fx.burst(x, my, 16, { speed: 50, spread: Math.PI * 2, colors: ['#ffe870', '#f07020', '#a8a8b4', '#6a6a78'], life: 0.6, size: 3, gravity: -20, shrink: true });
  }
  protected override onUpdate(dt: number): void { if (this.lockT > 0) this.lockT -= dt; }
  override renderOver(): void {
    const t = this.lock;
    if (!t || this.lockT <= 0 || !t.collidable) return;
    const p = this.w.road.project(t.laneX, t.z);
    const r = this.r, sz = Math.max(6, Math.round(22 * p.s)), cx = Math.round(p.x), cy = Math.round(p.y - 8 * p.s);
    const on = r.frame % 6 < 3;
    const col = on ? '#e0202a' : '#ffe870';
    const L = Math.max(2, Math.round(sz / 3));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const x0 = cx + dx * sz, y0 = cy + dy * sz;
      r.fillRect(dx < 0 ? x0 : x0 - L + 1, y0, L, 1, col);
      r.fillRect(x0, dy < 0 ? y0 : y0 - L + 1, 1, L, col);
    }
    r.fillRect(cx - 1, cy - 1, 3, 3, col);
  }
}

// ── 06 EMP ───────────────────────────────────────────────────────────────────
class Emp extends Ab {
  readonly id: AbilityId = 'emp';
  override cooldown = cdOf('emp', 10);
  private readonly R = 80;
  private ringT = -1;
  private arcs: { t: Traffic; life: number }[] = [];
  protected onActivate(): void {
    this.ringT = 0;
    this.sfx('emp'); this.r.flash('#40e0f0', 0.5); this.r.shake(5, 0.4);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 30, { speed: 140, colors: SPARK_COLS, life: 0.5, size: 2, gravity: 60 });
    this.w.floatText('EMP!', this.pl.laneX, 6, '#40e0f0', 2);
  }
  protected override onUpdate(dt: number): void {
    const w = this.w;
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    if (this.ringT < 0) return;
    this.ringT += dt;
    const R = this.R * Math.min(1, this.ringT / 0.7);
    for (const t of w.traffic) {
      if (!t.collidable || t.z < -2 || t.z - PLAYER_Z > R) continue;
      const knock = t.laneX < this.pl.laneX - 0.2 ? -1 : t.laneX > this.pl.laneX + 0.2 ? 1 : (t.laneX < (w.lanes - 1) / 2 ? -1 : 1);
      for (let i = 0; i < 6; i++) wfx(w, { laneX: t.laneX + rnd(-0.4, 0.4), z: t.z, h: rnd(4, 14), dz: -this.pl.speed, vy: rnd(20, 60), life: 0.5, colors: SPARK_COLS, size: 2, gravity: -40 });
      w.destroyTraffic(t, 'weapon', knock);
      this.arcs.push({ t, life: 0.25 });
      this.sfx('zap');
    }
    tintMax(w, '#40e0f0', 0.18 * (1 - this.ringT / 0.9));
    if (this.ringT > 0.9) this.ringT = -1;
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
    const q = this.ringT / 0.9, R = this.R * Math.min(1, this.ringT / 0.7);
    roadRing(w, pl.laneX, PLAYER_Z, R, '#40e0f0', 3, 1 - q);
    roadRing(w, pl.laneX, PLAYER_Z, R * 0.92, WHITE, 1, 1 - q);
    roadRing(w, pl.laneX, PLAYER_Z, R * 0.6, '#2040e0', 2, 0.7 * (1 - q));
    // crackle around the car
    if (r.frame % 2 === 0) for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      bolt(r, x, top, x + Math.cos(a) * 26, top + Math.sin(a) * 14, i ? '#40e0f0' : WHITE, 4, 3, 1, 0.9 * (1 - q));
    }
  }
}

// ── 07 SHIELD ────────────────────────────────────────────────────────────────
class Shield extends Ab {
  readonly id: AbilityId = 'shield';
  override cooldown = cdOf('shield', 10);
  override duration = durOf('shield', 8);
  private last = 0;
  private crackT = 0;
  protected onActivate(): void {
    this.pl.shield = 2; this.last = 2;
    this.sfx('shield'); this.r.flash('#40e0f0', 0.2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 12, 20, { speed: 80, colors: ['#ffffff', '#40e0f0', '#60a0ff'], life: 0.5, size: 2, gravity: -30 });
  }
  protected override onUpdate(dt: number): void {
    if (this.crackT > 0) this.crackT -= dt;
    if (!this.active) return;
    const pl = this.pl;
    if (pl.shield < this.last) {
      this.crackT = 0.35; this.r.flash('#40e0f0', 0.4); this.r.shake(4, 0.2);
      const { x, y } = pl.screen();
      this.w.fx.burst(x, y - 12, 26, { speed: 110, colors: ['#ffffff', '#40e0f0', '#2040e0'], life: 0.5, size: 2, gravity: 120 });
      this.last = pl.shield;
    }
    if (pl.shield <= 0) { this.finish(); return; }
    if (Math.random() < 0.3) {
      const { x, y } = pl.screen(); const a = Math.random() * Math.PI * 2;
      this.w.fx.spawn({ x: x + Math.cos(a) * 20, y: y - 12 + Math.sin(a) * 12, vx: 0, vy: -20, life: 0.4, maxLife: 0.4, color: '#c0f8ff', size: 1, gravity: 0, alpha: 0.8 });
    }
  }
  protected override onEnd(): void { this.pl.shield = 0; this.sfx('uiBack'); }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const s = pl.sizeMul;
    const cx = x, cy = y - this.car.h * 0.5 * s - pl.air;
    const rx = this.car.w * 0.7 * s, ry = this.car.h * 0.85 * s;
    const strong = pl.shield >= 2;
    const flick = strong || r.frame % 8 < 6;
    const col = strong ? '#40e0f0' : '#ffe870';
    if (this.crackT > 0) { ellipseRing(r, cx, cy, rx + 3, ry + 3, WHITE, 2, this.crackT * 2, 44, r.time); }
    r.ctx.save(); r.ctx.beginPath(); r.ctx.ellipse(Math.round(cx), Math.round(cy), rx, ry, 0, 0, Math.PI * 2); r.ctx.clip();
    r.dither(cx - rx, cy - ry, rx * 2, ry * 2, col, WHITE, 2);
    r.ctx.restore();
    r.fillRect(cx - rx, cy - ry, rx * 2, ry * 2, '#0b0b12', 0); // no-op keeps alpha state sane
    if (flick) {
      ellipseRing(r, cx, cy, rx, ry, col, 2, 0.85 + 0.15 * Math.sin(r.time * 12), 48);
      ellipseRing(r, cx, cy, rx - 2, ry - 2, WHITE, 1, 0.5, 40, r.time * 2);
    }
    // sweeping glint
    const a = r.time * 3;
    r.fillRect(cx + Math.cos(a) * (rx - 3) - 1, cy + Math.sin(a) * (ry - 3) - 1, 3, 3, WHITE);
  }
}

// ── 08 LASER ─────────────────────────────────────────────────────────────────
class Laser extends Ab {
  readonly id: AbilityId = 'laser';
  override cooldown = cdOf('laser', 7);
  override duration = durOf('laser', 0.6);
  private readonly range = 120;
  protected onActivate(): void {
    this.sfx('laser'); this.r.flash('#e0202a', 0.25); this.r.shake(2, this.duration);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - this.car.h * this.pl.sizeMul, 16, { speed: 60, colors: ['#ffffff', '#ff90c0', '#e0202a'], life: 0.35, size: 2 });
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
    this.sfx('powerup'); this.r.flash('#e0202a', 0.15);
    this.w.floatText('MAGNET', this.pl.laneX, 6, '#ffe870', 1);
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
      if (Math.abs(step) > 0.001 && Math.random() < 0.25) wfx(w, { laneX: c.lane, z: c.z, h: 8, dz: -pl.speed, vy: rnd(-10, 10), life: 0.3, color: '#ffe870', size: 2, shrink: true });
    }
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    const cy = y - this.car.h * 0.5 * pl.sizeMul - pl.air;
    for (let k = 0; k < 2; k++) {
      const ph = (r.time * 1.4 + k * 0.5) % 1;
      const rx = 16 + ph * 26, ry = 9 + ph * 15;
      ellipseRing(r, x, cy, rx, ry, k ? '#2040e0' : '#e0202a', 2, 0.9 * (1 - ph), 40 + Math.round(ph * 20), ph);
    }
    const bob = Math.round(Math.sin(r.time * 6) * 2);
    r.sprite(magnetSprite(), x, y - this.car.h * pl.sizeMul - 8 - pl.air + bob, { scale: 1 });
    if (r.frame % 8 < 4) { r.fillRect(x - 8, y - this.car.h * pl.sizeMul - 22 - pl.air + bob, 3, 1, WHITE); r.fillRect(x + 6, y - this.car.h * pl.sizeMul - 22 - pl.air + bob, 3, 1, WHITE); }
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
    w.mod.speed *= 0.55;
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
    this.w.fx.burst(x, y - 10, 18, { speed: 70, colors: ['#ffffff', '#ff90c0', '#e04080'], life: 0.5, size: 2, gravity: -20 });
    this.w.floatText('MINI!', this.pl.laneX, 6, '#ff90c0', 2);
  }
  protected override onUpdate(dt: number): void {
    const pl = this.pl;
    if (this.active) {
      pl.sizeMul += (0.5 - pl.sizeMul) * Math.min(1, dt * 10);
      pl.phasing = true;
      if (this.r.frame % 4 === 0) {
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
  override cooldown = cdOf('mega', 11);
  override duration = durOf('mega', 5);
  private restoring = false;
  private stompT = 0;
  private waveT = 0;
  protected onActivate(): void {
    this.sfx('powerup'); this.r.shake(4, 0.3); this.r.flash('#f07020', 0.25);
    this.restoring = false; this.stompT = 0;
    this.w.floatText('MEGA!', this.pl.laneX, 8, '#f07020', 2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y, 20, { speed: 90, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.5, size: 3, gravity: 120 });
  }
  protected override onUpdate(dt: number): void {
    const pl = this.pl, w = this.w;
    if (this.waveT > 0) this.waveT -= dt;
    if (this.active) {
      pl.sizeMul += (1.6 - pl.sizeMul) * Math.min(1, dt * 8);
      pl.crushAll = true;
      this.stompT += dt;
      if (this.stompT >= 0.4) {
        this.stompT = 0; this.waveT = 0.3;
        this.r.shake(3, 0.15); this.sfx('land'); w.game.haptics.impact('Light');
        const { x, y } = pl.screen(); const half = this.car.w * 0.45 * pl.sizeMul;
        for (const wx of [x - half, x + half]) w.fx.burst(wx, y, 6, { speed: 50, spread: Math.PI, angle: -Math.PI / 2, colors: DUST_COLS, life: 0.4, size: 3, gravity: 100, shrink: true });
      }
    } else if (this.restoring) {
      pl.sizeMul += (1 - pl.sizeMul) * Math.min(1, dt * 8);
      if (Math.abs(1 - pl.sizeMul) < 0.01) { pl.sizeMul = 1; this.restoring = false; }
    }
  }
  protected override onEnd(): void { this.pl.crushAll = false; this.restoring = true; this.sfx('whoosh'); }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const { x, y } = pl.screen();
    r.disc(x, y - 2, Math.round(24 * pl.sizeMul), '#f07020', 0.15 + 0.05 * Math.sin(r.time * 20));
    if (this.waveT > 0) {
      const q = 1 - this.waveT / 0.3;
      ellipseRing(r, x, y - 1, 14 + q * 34, 5 + q * 12, '#f07020', 2, 1 - q, 40);
      ellipseRing(r, x, y - 1, 10 + q * 30, 3 + q * 10, '#ffe870', 1, 1 - q, 32);
    }
  }
}

// ── 13 RAM ───────────────────────────────────────────────────────────────────
class Ram extends Ab {
  readonly id: AbilityId = 'ram';
  override cooldown = cdOf('ram', 7);
  override duration = durOf('ram', 1.5);
  protected onActivate(): void {
    this.sfx('whoosh'); this.r.shake(3, 0.2); this.r.flash('#f07020', 0.15);
    this.w.floatText('RAM!', this.pl.laneX, 6, '#f07020', 2);
  }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    pl.crushAll = true;
    w.mod.speed *= 1.4;
    for (let i = 0; i < 2; i++) wfx(w, { laneX: pl.laneX + rnd(-0.45, 0.45), z: PLAYER_Z + 2.5, h: rnd(2, 8), dz: rnd(40, 80), vy: rnd(10, 40), life: 0.3, colors: ['#ffffff', '#ffe870', '#f07020'], size: 2, gravity: -60, shrink: true });
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
    const { x, y } = pl.screen();
    const s = pl.sizeMul;
    const py = y - this.car.h * s * 0.9 - pl.air + Math.round(Math.sin(r.time * 40));
    r.sprite(ramPlateSprite(), x, py, { scale: s });
    if (r.frame % 2 === 0) r.fillRect(x - 18 * s, py - 1, 36 * s, 1, '#ffe870', 0.9);
    for (let k = 0; k < 3; k++) {
      const z = PLAYER_Z + 3 + ((k * 4 + r.time * 24) % 12);
      const p = w.road.project(pl.laneX, z);
      const sz = 11 * p.s, a = 0.9 - ((z - PLAYER_Z) / 15) * 0.7;
      line(r, p.x - sz, p.y - 2 * p.s, p.x, p.y - 2 * p.s - sz * 0.7, '#f07020', 2, a);
      line(r, p.x, p.y - 2 * p.s - sz * 0.7, p.x + sz, p.y - 2 * p.s, '#f07020', 2, a);
    }
    speedLines(r, r.time, '#ffe870', 0.45, 8);
  }
}

// ── 14 FLAME ─────────────────────────────────────────────────────────────────
class Flame extends Ab {
  readonly id: AbilityId = 'flame';
  override cooldown = cdOf('flame', 8);
  override duration = durOf('flame', 2);
  private readonly range = 40;
  private roarT = 0;
  private get reach(): number { return this.range * Math.min(1, this.elapsed / 0.3); }
  protected onActivate(): void { this.sfx('whoosh'); this.r.flash('#f07020', 0.2); this.roarT = 0; }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    const reach = this.reach;
    for (const t of w.traffic) {
      if (!t.collidable || t.z < 0 || t.z > reach || Math.abs(t.laneX - pl.laneX) > 1.5) continue;
      for (let i = 0; i < 5; i++) wfx(w, { laneX: t.laneX + rnd(-0.3, 0.3), z: t.z, h: rnd(2, 12), dz: -pl.speed, vy: rnd(30, 70), life: 0.5, colors: FIRE_COLS, size: 4, gravity: -20, shrink: true });
      w.destroyTraffic(t, 'weapon');
    }
    for (let i = 0; i < 4; i++) wfx(w, { laneX: pl.laneX + rnd(-0.3, 0.3), z: PLAYER_Z + 2, h: rnd(3, 8), dz: rnd(70, 120), vx: rnd(-45, 45), vy: rnd(10, 40), life: rnd(0.3, 0.5), colors: FIRE_COLS, size: rnd(4, 7), gravity: -30, shrink: true });
    tintMax(w, '#f07020', 0.06);
    this.roarT += dt;
    if (this.roarT > 0.45) { this.roarT = 0; this.sfx('whoosh'); }
    if (this.r.frame % 3 === 0) this.r.shake(1, 0.05);
  }
  override renderUnder(): void {
    if (!this.active) return;
    const r = this.r, pl = this.pl;
    const f = r.frame;
    const lift = this.car.h * pl.sizeMul * 0.45 + pl.air;
    roadCone(this.w, pl.laneX, PLAYER_Z + 1.5, this.reach, 0.7, 3.1, lift, (y, t, x, hw) => {
      const n = (y * 7 + f * 3) % 5;
      const hj = hw * (0.8 + 0.2 * Math.sin(y * 0.6 + f * 0.5)) + (n - 2) * (1 + t * 2);
      const col = t > 0.72 ? (n < 2 ? '#e0202a' : '#f07020') : t > 0.35 ? (n < 2 ? '#f07020' : '#ffe870') : n < 2 ? '#ffe870' : WHITE;
      r.fillRect(x - hj, y, hj * 2, 1, col, 0.7 * (1 - t * 0.6));
      if (n === 0) r.fillRect(x - hj * 0.4, y, hj * 0.8, 1, WHITE, 0.5 * (1 - t));
    });
  }
}

// ── 15 WINGS ─────────────────────────────────────────────────────────────────
class Wings extends Ab {
  readonly id: AbilityId = 'wings';
  override cooldown = cdOf('wings', 10);
  override duration = durOf('wings', 3);
  private readonly H = 40;
  private height = 0;
  protected onActivate(): void {
    this.sfx('jump'); this.sfx('whoosh');
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 10, 16, { speed: 60, colors: ['#ffffff', '#ffd040'], life: 0.6, size: 2, gravity: 30 });
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
      w.fx.spawn({ x: x + side * rnd(16, 26), y: y - pl.air - 8, vx: side * 6, vy: 22, life: 0.9, maxLife: 0.9, colors: ['#ffffff', '#f4f4f0', '#a8a8b4'], size: 2, gravity: 25, alpha: 0.9 });
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
    const k = 1 - (this.height / this.H) * 0.5;
    const sw = Math.round(this.car.w * 0.8 * k * pl.sizeMul);
    r.fillRect(x - sw / 2, y - 1, sw, 3, '#000000', 0.2 + 0.2 * k);
    const unfold = Math.min(1, this.elapsed / 0.3);
    const flap = Math.floor(r.time * 7) % 2;
    const spr = wingSprite(flap);
    r.sprite(spr, x, y - pl.air - this.car.h * pl.sizeMul * 0.3, { sx: Math.max(0.15, unfold) * pl.sizeMul, sy: pl.sizeMul });
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

/** DEV: `#…&ab=<id>` overrides the ability for screenshots while the roster is incomplete. */
function devOverride(w: World): Ability | null {
  try {
    const m = /(?:^|[#&])ab=([a-z]+)/.exec(typeof location !== 'undefined' ? location.hash : '');
    if (m && m[1] !== 'nitro') { const f = SET1[m[1] as AbilityId]; if (f) return f(w); }
  } catch { /* ignore */ }
  return null;
}

export const SET1: Partial<Record<AbilityId, (w: World) => Ability>> = {
  nitro: (w) => devOverride(w) ?? new Nitro(w),
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
