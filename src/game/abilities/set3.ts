import type { AbilityId } from '../../core/types';
import type { SfxName } from '../../core/Audio';
import type { Renderer } from '../../core/Renderer';
import type { PixelSprite } from '../../core/Sprite';
import { Grid, buildSprite, flipSprite } from '../../core/Sprite';
import type { World } from '../World';
import type { Traffic } from '../Traffic';
import type { Ability } from '../Ability';
import { BaseAbility } from '../Ability';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { ABILITIES } from '../../content/abilities';
import { registerIcon } from '../../content/icons';
import { rearSprite } from '../../content/vehicleSprites';

// ─────────────────────────────────────────────────────────────────────────────
// Set 3: chain, tornado, quake, mines, gatling, shockwave, timewarp, blossom,
// dragon, anchor, plasma, fireworks, bass, rocketjump, turbojet, railgun.
// ─────────────────────────────────────────────────────────────────────────────

function cdOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.cooldown > 0 ? d.cooldown : fallback; }
function durOf(id: AbilityId, fallback: number): number { const d = ABILITIES[id]; return d && d.duration && d.duration > 0 ? d.duration : fallback; }
const LANE_M = 3;
const FIRE = ['#ffffff', '#ffe870', '#f07020', '#e0202a', '#3a3a48'];
const STEEL = ['#ffffff', '#d8d8e0', '#a8a8b4', '#6a6a78'];
const CYAN = ['#ffffff', '#c0f8ff', '#40e0f0', '#2040e0'];
const PINK = ['#ffffff', '#ffb7d0', '#ff90c0', '#e04080'];
const DUST = ['#f4f4f0', '#d0a060', '#a8a8b4', '#6a6a78'];
const JET = ['#ffffff', '#c0f8ff', '#60a0ff', '#2040e0', '#101c80'];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function line(r: Renderer, x0: number, y0: number, x1: number, y1: number, color: string, thick = 1, alpha?: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
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
/** Ring lying on the road around (laneX, z), radius R metres. */
function roadRing(w: World, laneX: number, z: number, R: number, color: string, thick = 2, alpha?: number): void {
  const r = w.game.r, n = Math.round(clamp(R * 3 + 16, 16, 120));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, zz = z + Math.sin(a) * R;
    if (zz < -1.5) continue;
    const p = w.road.project(laneX + (Math.cos(a) * R) / LANE_M, zz);
    if (p.y < w.road.hy) continue;
    r.fillRect(p.x - thick / 2, p.y - thick / 2, thick, thick, color, alpha);
  }
}
interface Wfx { laneX: number; z: number; h?: number; dz?: number; vx?: number; vy?: number; life: number; colors?: string[]; color?: string; size: number; gravity?: number; shrink?: boolean; alpha?: number; }
function wfx(w: World, o: Wfx): void {
  w.fx.spawn({ x: 0, y: 0, laneX: o.laneX, z: o.z, h: o.h ?? 0, dz: o.dz ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life, maxLife: o.life, colors: o.colors, color: o.color ?? '#ffffff', size: o.size, gravity: o.gravity ?? 0, shrink: o.shrink, alpha: o.alpha });
}
function tintMax(w: World, color: string, a: number): void { if (a > w.mod.tintA) { w.mod.tint = color; w.mod.tintA = a; } }
function sprite(id: string, rows: string[], map?: Record<string, string | null>): PixelSprite { return buildSprite({ id: 'ab3_' + id, rows, map }); }

abstract class Ab extends BaseAbility {
  private _car: PixelSprite | null = null;
  protected get r(): Renderer { return this.w.game.r; }
  protected get pl() { return this.w.player; }
  protected get car(): PixelSprite { return (this._car ??= rearSprite(this.w.vehicle)); }
  protected sfx(n: SfxName): void { this.w.game.audio.sfx(n); }
  protected get elapsed(): number { return this.duration - this.act; }
  protected get roofY(): number { const { y } = this.pl.screen(); return y - this.car.h * this.pl.sizeMul - this.pl.air; }
  protected knockDir(t: Traffic): number {
    const pl = this.pl.laneX;
    if (t.laneX < pl - 0.2) return -1;
    if (t.laneX > pl + 0.2) return 1;
    return t.laneX < (this.w.lanes - 1) / 2 ? -1 : 1;
  }
}

// ── CHAIN (harpoon) ─────────────────────────────────────────────────────────
class Chain extends Ab {
  readonly id: AbilityId = 'chain';
  override cooldown = cdOf('chain', 4);
  private target: Traffic | null = null;
  private hookZ = 0;
  private phase: 'idle' | 'out' | 'pull' = 'idle';
  private t = 0;
  protected onActivate(): void {
    this.target = this.w.trafficAhead(90, this.pl.laneX, 0.6)[0] ?? this.w.trafficAhead(60)[0] ?? null;
    this.hookZ = PLAYER_Z; this.phase = 'out'; this.t = 0;
    this.sfx('shoot');
  }
  protected override onUpdate(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'out') {
      this.hookZ += dt * 140;
      const tz = this.target && this.target.collidable ? this.target.z : 70;
      if (this.hookZ >= tz) {
        if (this.target && this.target.collidable) { this.phase = 'pull'; this.t = 0; this.sfx('zap'); this.target.state = 'pulled'; this.target.stateT = 9; }
        else this.phase = 'idle';
      }
    } else if (this.phase === 'pull' && this.target) {
      const t = this.target;
      t.laneX += this.knockDir(t) * dt * 5;
      t.z -= dt * 30;
      this.hookZ = t.z;
      const p = this.w.road.project(t.laneX, t.z);
      this.w.fx.burst(p.x, p.y - 6 * p.s, 2, { speed: 40 * p.s, colors: STEEL, life: 0.3, size: 2 * p.s, gravity: 100 });
      if (this.t > 0.45 || !t.collidable) { if (t.collidable) this.w.destroyTraffic(t, 'weapon', this.knockDir(t)); this.phase = 'idle'; this.target = null; }
    }
  }
  override renderOver(): void {
    if (this.phase === 'idle') return;
    const r = this.r, { x, y } = this.pl.screen();
    const p = this.w.road.project(this.target && this.phase === 'pull' ? this.target.laneX : this.pl.laneX, this.hookZ);
    // chain links
    const n = Math.max(2, Math.round(Math.hypot(p.x - x, p.y - (y - 20)) / 4));
    for (let i = 0; i <= n; i++) { const t = i / n; r.fillRect(x + (p.x - x) * t - 1, y - 20 + (p.y - 8 * p.s - (y - 20)) * t - 1, 2, 2, i % 2 ? '#d8d8e0' : '#6a6a78'); }
    // hook head
    const hs = Math.max(2, Math.round(6 * p.s));
    r.fillRect(p.x - hs / 2, p.y - 10 * p.s - hs / 2, hs, hs, '#d8d8e0');
    r.fillRect(p.x - hs, p.y - 10 * p.s, hs / 2, hs, '#a8a8b4'); r.fillRect(p.x + hs / 2, p.y - 10 * p.s, hs / 2, hs, '#a8a8b4');
  }
}

// ── TORNADO ─────────────────────────────────────────────────────────────────
class Tornado extends Ab {
  readonly id: AbilityId = 'tornado';
  override cooldown = cdOf('tornado', 8);
  override duration = durOf('tornado', 3);
  private hit = new Set<number>();
  protected onActivate(): void { this.hit.clear(); this.sfx('whoosh'); }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w, pl = this.pl;
    for (const t of w.traffic) {
      if (!t.collidable || this.hit.has(t.id)) continue;
      const dl = Math.abs(t.laneX - pl.laneX);
      if (t.z > -2 && t.z < 12 && dl >= 0.5 && dl < 1.6) { this.hit.add(t.id); w.destroyTraffic(t, 'weapon', this.knockDir(t)); t.launch = 40; }
    }
    for (let i = 0; i < 4; i++) {
      const a = w.time * 12 + i * 1.6, R = 1.4 + Math.random() * 0.4;
      wfx(w, { laneX: pl.laneX + Math.cos(a) * R, z: PLAYER_Z + Math.sin(a) * R * LANE_M * 0.5, h: rnd(0, 40), vy: 30, life: 0.35, colors: ['#ffffff', '#40e0f0', '#20c0b0', '#a8a8b4'], size: 3, shrink: true });
    }
    if (Math.floor(w.time * 10) % 5 === 0) this.sfx('whoosh');
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, { x, y } = this.pl.screen(), t = this.w.time;
    for (let j = 0; j < 9; j++) {
      const yy = y - 4 - j * 8, rad = 18 + j * 5, ph = t * 9 + j * 0.7;
      for (let k = 0; k < 3; k++) { const a = ph + k * 2.1; r.fillRect(x + Math.cos(a) * rad - 2, yy + Math.sin(a) * rad * 0.25, 4 + (j % 2), 2, k ? '#40e0f0' : '#ffffff', 0.55); }
    }
  }
}

// ── QUAKE (ground pound) ────────────────────────────────────────────────────
class Quake extends Ab {
  readonly id: AbilityId = 'quake';
  override cooldown = cdOf('quake', 9);
  private wave = -1;
  protected onActivate(): void {
    const w = this.w;
    this.wave = 0;
    w.game.r.shake(9, 0.6);
    this.sfx('explodeBig');
    for (const t of w.traffic) if (t.collidable && t.z > -2 && t.z < 30) { t.launch = 50 + Math.random() * 30; w.destroyTraffic(t, 'weapon', this.knockDir(t)); }
    for (let i = 0; i < 30; i++) wfx(w, { laneX: rnd(-0.5, w.lanes - 0.5), z: rnd(0, 26), h: 0, vy: rnd(60, 160), life: 0.9, colors: DUST, size: rnd(2, 4), gravity: -220, shrink: true });
    this.pl.bump = 8;
  }
  protected override onUpdate(dt: number): void { if (this.wave >= 0) { this.wave += dt; if (this.wave > 1) this.wave = -1; } }
  override renderUnder(): void {
    if (this.wave < 0) return;
    const w = this.w, pl = this.pl, t = this.wave;
    roadRing(w, pl.laneX, PLAYER_Z, 2 + t * 30, '#d0a060', 3, 1 - t);
    roadRing(w, pl.laneX, PLAYER_Z, 1 + t * 22, '#7a4a20', 2, 1 - t);
    // cracks
    const r = this.r, { x, y } = pl.screen();
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; line(r, x, y - 2, x + Math.cos(a) * 60 * t, y - 2 - Math.abs(Math.sin(a)) * 30 * t, '#16161f', 2, 1 - t); }
  }
}

// ── MINES ───────────────────────────────────────────────────────────────────
class Mines extends Ab {
  readonly id: AbilityId = 'mines';
  override cooldown = cdOf('mines', 6);
  private mines: { lane: number; z: number; h: number; vz: number; vh: number; armed: boolean; t: number }[] = [];
  private spr: PixelSprite | null = null;
  protected onActivate(): void {
    const w = this.w, n = w.lanes, base = Math.round(this.pl.laneX);
    const lanes = [base - 1, base + 1, base + 2, base - 2].filter((l) => l >= 0 && l < n).slice(0, 3);
    if (!lanes.length) lanes.push(base);
    for (const l of lanes) this.mines.push({ lane: l, z: PLAYER_Z, h: 10, vz: 70 + Math.random() * 20, vh: 60, armed: false, t: 0 });
    this.sfx('shoot');
  }
  protected override onUpdate(dt: number): void {
    const w = this.w;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.t += dt;
      if (!m.armed) {
        m.z += m.vz * dt; m.h += m.vh * dt; m.vh -= 260 * dt;
        if (m.h <= 0) { m.h = 0; m.armed = true; m.vz = 0; this.sfx('land'); }
      } else {
        m.z -= this.pl.speed * dt;
        const v = w.traffic.find((t) => t.collidable && Math.abs(t.z - m.z) < 3 && Math.abs(t.laneX - m.lane) < 0.6);
        if (v) { w.hitTraffic(v, 99, 'weapon'); this.mines.splice(i, 1); continue; }
        if (m.z < -4) { this.mines.splice(i, 1); continue; }
      }
    }
  }
  override renderUnder(): void {
    this.spr ??= sprite('mine', ['..kkkk..', '.kddddk.', 'kdrrrrdk', 'kdrLLrdk', 'kdrLLrdk', 'kdrrrrdk', '.kddddk.', '..kkkk..'], { L: '#ffe870', r: '#8a1018' });
    for (const m of this.mines) {
      const p = this.w.road.project(m.lane, m.z);
      const blink = m.armed && Math.floor(m.t * 8) % 2 === 0;
      this.r.sprite(this.spr, p.x, p.y - m.h * p.s, { scale: Math.max(0.3, p.s * 1.6) });
      if (blink) this.r.fillRect(p.x - 1, p.y - m.h * p.s - 6 * p.s, 2, 2, '#e0202a');
    }
  }
}

// ── GATLING ─────────────────────────────────────────────────────────────────
class Gatling extends Ab {
  readonly id: AbilityId = 'gatling';
  override cooldown = cdOf('gatling', 7);
  override duration = durOf('gatling', 3);
  private shotT = 0;
  private side = 0;
  protected onActivate(): void { this.shotT = 0; this.sfx('shoot'); }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    this.shotT -= dt;
    if (this.shotT <= 0) {
      this.shotT = 0.09;
      this.side = 1 - this.side;
      this.w.fire({ kind: 'bullet', laneX: this.pl.laneX + (this.side ? 0.12 : -0.12), z: PLAYER_Z + 2, speed: 260, h: 8, damage: 1, owner: 'player', life: 1.2, color: '#ffe870' });
      this.sfx('shoot');
      this.pl.bump = 1;
    }
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, { x, y } = this.pl.screen(), spin = this.w.time * 30;
    // twin barrels on the roof spinning
    for (let i = 0; i < 2; i++) { const bx = x - 8 + i * 16; r.fillRect(bx - 3, this.roofY - 6, 6, 6, '#3a3a48'); r.fillRect(bx - 2 + Math.round(Math.sin(spin + i) * 1), this.roofY - 12, 4, 6, '#6a6a78'); if (this.shotT > 0.05) r.fillRect(bx - 3, this.roofY - 16, 6, 4, '#ffe870'); }
  }
}

// ── SHOCKWAVE ───────────────────────────────────────────────────────────────
class Shockwave extends Ab {
  readonly id: AbilityId = 'shockwave';
  override cooldown = cdOf('shockwave', 7);
  private t = -1;
  protected onActivate(): void {
    const w = this.w;
    this.t = 0;
    w.game.r.flash('#60a0ff', 0.4); w.game.r.shake(5, 0.3);
    this.sfx('emp');
    for (const tr of w.traffic) {
      if (!tr.collidable || tr.z < -2) continue;
      if (tr.z < 15) w.destroyTraffic(tr, 'weapon', this.knockDir(tr));
      else if (tr.z < 40) { tr.z += 12; tr.targetLane = clamp(tr.lane + this.knockDir(tr), 0, w.lanes - 1); tr.bump = 4; }
    }
  }
  protected override onUpdate(dt: number): void { if (this.t >= 0) { this.t += dt; if (this.t > 0.8) this.t = -1; } }
  override renderOver(): void {
    if (this.t < 0) return;
    const w = this.w, p = this.t / 0.8;
    roadRing(w, this.pl.laneX, PLAYER_Z, 1 + p * 40, '#ffffff', 3, 1 - p);
    roadRing(w, this.pl.laneX, PLAYER_Z, 0.5 + p * 32, '#60a0ff', 2, 1 - p);
    roadRing(w, this.pl.laneX, PLAYER_Z, 0.2 + p * 24, '#2040e0', 2, (1 - p) * 0.7);
  }
}

// ── TIMEWARP (Chrono Shift) ─────────────────────────────────────────────────
class Timewarp extends Ab {
  readonly id: AbilityId = 'timewarp';
  override cooldown = cdOf('timewarp', 10);
  override duration = durOf('timewarp', 2);
  protected onActivate(): void { this.pl.phasing = true; this.sfx('freeze'); this.w.game.r.flash('#d0a060', 0.3); }
  protected override onUpdate(): void {
    if (!this.active) return;
    this.w.mod.timeScale = 0;
    tintMax(this.w, '#7a4a20', 0.28);
    this.pl.phasing = true;
    if (Math.random() < 0.3) { const { x, y } = this.pl.screen(); this.w.fx.spawn({ x: x + rnd(-40, 40), y: y - rnd(0, 60), vx: 0, vy: -10, life: 0.5, maxLife: 0.5, color: '#ffe870', size: 1 }); }
  }
  protected override onEnd(): void { this.pl.phasing = false; this.sfx('zap'); }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, { x } = this.pl.screen();
    // clock face top center
    const cx = x, cy = this.roofY - 22;
    r.disc(cx, cy, 10, '#0b0b12', 0.7); r.ring(cx, cy, 10, '#ffe870', 1);
    const a = -Math.PI / 2 + (this.elapsed / this.duration) * Math.PI * 2;
    line(r, cx, cy, cx + Math.cos(a) * 7, cy + Math.sin(a) * 7, '#ffffff', 1);
    r.fillRect(cx - 1, cy - 1, 2, 2, '#ffe870');
  }
}

// ── BLOSSOM (Sakura storm) ──────────────────────────────────────────────────
class Blossom extends Ab {
  readonly id: AbilityId = 'blossom';
  override cooldown = cdOf('blossom', 9);
  override duration = durOf('blossom', 4);
  private pushed = new Map<number, number>();
  protected onActivate(): void { this.pushed.clear(); this.sfx('powerup'); }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w;
    for (let i = 0; i < 6; i++) wfx(w, { laneX: rnd(-1, w.lanes), z: rnd(2, 60), h: rnd(10, 60), vx: -20, vy: -15 - rnd(0, 20), life: 1.2, colors: PINK, size: 2, gravity: 30, shrink: true });
    for (const t of w.traffic) {
      if (!t.collidable || t.z < -1 || t.z > 45) continue;
      const acc = (this.pushed.get(t.id) ?? 0) + dt;
      this.pushed.set(t.id, acc);
      t.laneX += this.knockDir(t) * dt * 1.6;
      if (acc > 0.6) { t.state = 'wreck'; t.wreckT = 0; t.knock = this.knockDir(t); t.launch = 0; w.kills++; w.combo++; w.comboT = 3; w.score += 120; w.floatText('+120', t.laneX, t.z, '#ff90c0'); const p = w.road.project(t.laneX, t.z); w.fx.burst(p.x, p.y - 8 * p.s, 10, { speed: 40 * p.s, colors: PINK, life: 0.6, size: 2 * p.s, gravity: 40 }); this.pushed.delete(t.id); w.emit('kill', t); }
    }
    tintMax(w, '#ffb7d0', 0.08);
  }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, t = this.w.time;
    for (let i = 0; i < 14; i++) { const x = ((i * 53 + t * 40) % (r.w + 20)) - 10, y = ((i * 37 + t * 60 * (1 + (i % 3) * 0.2)) % r.h); r.fillRect(x, y, 2, 2, i % 2 ? '#ffb7d0' : '#ff90c0'); }
  }
}

// ── DRAGON ──────────────────────────────────────────────────────────────────
class Dragon extends Ab {
  readonly id: AbilityId = 'dragon';
  override cooldown = cdOf('dragon', 11);
  override duration = durOf('dragon', 2);
  private z = 0;
  private frames: PixelSprite[] = [];
  protected onActivate(): void { this.z = PLAYER_Z + 4; this.sfx('missile'); this.w.game.r.flash('#ffd040', 0.3); }
  protected override onUpdate(dt: number): void {
    if (!this.active) return;
    const w = this.w;
    this.z += dt * 55;
    const lane = this.pl.laneX;
    for (const t of w.traffic) if (t.collidable && Math.abs(t.laneX - lane) < 0.8 && t.z > this.z - 8 && t.z < this.z + 4) { w.destroyTraffic(t, 'weapon', this.knockDir(t)); t.launch = 30; }
    for (let i = 0; i < 3; i++) wfx(w, { laneX: lane + rnd(-0.5, 0.5), z: this.z - rnd(0, 6), h: rnd(4, 20), vy: rnd(10, 40), life: 0.4, colors: FIRE, size: 3, shrink: true });
    tintMax(w, '#f07020', 0.08);
  }
  override renderOver(): void {
    if (!this.active) return;
    if (!this.frames.length) {
      const body = ['......kkk.......', '.....kxxxk......', '....kxLxxxk.....', '...kxxxxxxkk....', '..kxxxxxxxxxk...', '.kxxrrxxxxxxxk..', 'kxxrrrrxxxkxxxk.', 'kxrrrrrxxxk.kxxk', '.kxrrrxxxxk..kk.', '..kkxxxxxk......', '...kxxxxk.......', '....kxxk........', '.....kk.........'];
      this.frames = [sprite('dragon0', body, { x: '#ffd040', r: '#e0202a', L: '#ffffff' }), sprite('dragon1', body.map((l) => l.replace('kxxk', 'kkkk')), { x: '#f0c020', r: '#e0202a', L: '#ffffff' })];
    }
    const p = this.w.road.project(this.pl.laneX, this.z);
    const f = this.frames[Math.floor(this.w.time * 8) % 2];
    const sc = Math.max(0.6, p.s * 3.2);
    this.r.sprite(f, p.x, p.y - 26 * p.s, { scale: sc });
    // flame breath cone ahead
    const q = this.w.road.project(this.pl.laneX, this.z + 8);
    for (let i = 0; i < 5; i++) this.r.fillRect(q.x - 6 * q.s + i * 3 * q.s, q.y - (10 + i * 2) * q.s + Math.round(Math.sin(this.w.time * 20 + i) * 2), 3 * q.s + 1, 3 * q.s + 1, FIRE[i % 3 + 1]);
  }
}

// ── ANCHOR ──────────────────────────────────────────────────────────────────
class Anchor extends Ab {
  readonly id: AbilityId = 'anchor';
  override cooldown = cdOf('anchor', 5);
  private spr: PixelSprite | null = null;
  protected onActivate(): void {
    this.w.fire({ kind: 'rock', laneX: this.pl.laneX, z: PLAYER_Z + 2, speed: 110, h: 14, damage: 99, owner: 'player', life: 0.7, pierce: true, color: '#a8a8b4' });
    this.sfx('cannon'); this.pl.bump = 4; this.w.game.r.shake(3, 0.2);
  }
  override renderOver(): void {
    this.spr ??= sprite('anchor', ['....kk....', '...kwwk...', '....kk....', '....ww....', 'kk..ww..kk', 'kwk.ww.kwk', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'], { w: '#d8d8e0' });
    for (const p of this.w.projectiles) {
      if (p.kind !== 'rock' || p.owner !== 'player') continue;
      const q = this.w.road.project(p.laneX, p.z);
      this.r.sprite(this.spr, q.x, q.y - p.h * q.s, { scale: Math.max(0.5, q.s * 2.4) });
      // chain trail
      const { x, y } = this.pl.screen();
      for (let i = 0; i < 6; i++) { const t = i / 6; this.r.fillRect(x + (q.x - x) * t - 1, y - 16 + (q.y - p.h * q.s - (y - 16)) * t, 2, 2, i % 2 ? '#a8a8b4' : '#6a6a78'); }
    }
  }
}

// ── PLASMA (tri-shot) ───────────────────────────────────────────────────────
class Plasma extends Ab {
  readonly id: AbilityId = 'plasma';
  override cooldown = cdOf('plasma', 4);
  protected onActivate(): void {
    const n = this.w.lanes, l = this.pl.laneX;
    for (const d of [-1, 0, 1]) { const lx = l + d; if (lx < -0.2 || lx > n - 0.8) continue; this.w.fire({ kind: 'plasma', laneX: lx, z: PLAYER_Z + 2, speed: 150, h: 10, damage: 2, owner: 'player', life: 1.4, color: '#40e0f0' }); }
    this.sfx('laser'); this.w.game.r.flash('#40e0f0', 0.2);
    const { x, y } = this.pl.screen();
    this.w.fx.burst(x, y - 20, 12, { speed: 60, colors: CYAN, life: 0.3, size: 2, gravity: 0, shrink: true });
  }
  override renderOver(): void {
    for (const p of this.w.projectiles) {
      if (p.kind !== 'plasma') continue;
      const q = this.w.road.project(p.laneX, p.z), R = Math.max(2, Math.round(5 * q.s));
      this.r.disc(q.x, q.y - p.h * q.s, R + 2, '#2040e0', 0.4); this.r.disc(q.x, q.y - p.h * q.s, R, '#40e0f0'); this.r.disc(q.x, q.y - p.h * q.s, Math.max(1, R - 2), '#ffffff');
      wfx(this.w, { laneX: p.laneX, z: p.z - 1, h: p.h, vy: 0, life: 0.25, colors: CYAN, size: 3 * q.s, shrink: true });
    }
  }
}

// ── FIREWORKS ───────────────────────────────────────────────────────────────
class Fireworks extends Ab {
  readonly id: AbilityId = 'fireworks';
  override cooldown = cdOf('fireworks', 9);
  private rockets: { lane: number; z: number; h: number; t: number; color: string }[] = [];
  protected onActivate(): void {
    const n = this.w.lanes;
    const cols = ['#ff90c0', '#ffe870', '#40e0f0', '#20b040', '#f07020'];
    for (let i = 0; i < 6; i++) this.rockets.push({ lane: Math.floor(Math.random() * n), z: rnd(10, 60), h: 0, t: -i * 0.12, color: cols[i % cols.length] });
    this.sfx('missile');
  }
  protected override onUpdate(dt: number): void {
    const w = this.w;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rk = this.rockets[i];
      rk.t += dt;
      if (rk.t < 0) continue;
      rk.h = rk.t * 120;
      wfx(w, { laneX: rk.lane, z: rk.z, h: rk.h, vy: -20, life: 0.3, colors: FIRE, size: 2, shrink: true });
      if (rk.t > 0.7) {
        // burst: hits the car nearest to the landing lane/z
        const v = w.traffic.find((t) => t.collidable && Math.abs(t.laneX - rk.lane) < 0.7 && Math.abs(t.z - rk.z) < 12);
        if (v) w.destroyTraffic(v, 'weapon', this.knockDir(v));
        for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; wfx(w, { laneX: rk.lane + Math.cos(a) * 1.2, z: rk.z, h: rk.h + Math.sin(a) * 10, vx: Math.cos(a) * 30, vy: Math.sin(a) * 40, life: 0.7, colors: ['#ffffff', rk.color, rk.color, '#3a3a48'], size: 3, gravity: -40, shrink: true }); }
        this.sfx('star'); w.game.r.flash(rk.color, 0.15);
        this.rockets.splice(i, 1);
      }
    }
  }
}

// ── BASS DROP ───────────────────────────────────────────────────────────────
class Bass extends Ab {
  readonly id: AbilityId = 'bass';
  override cooldown = cdOf('bass', 8);
  private t = -1;
  protected onActivate(): void {
    const w = this.w;
    this.t = 0;
    this.sfx('horn'); this.sfx('explodeBig'); w.game.r.shake(7, 0.5);
    for (const tr of w.traffic) if (tr.collidable && tr.z > -2 && tr.z < 20) { w.destroyTraffic(tr, 'weapon', this.knockDir(tr)); tr.launch = 20; }
  }
  protected override onUpdate(dt: number): void {
    if (this.t >= 0) { this.t += dt; tintMax(this.w, '#e04080', 0.25 * Math.max(0, 1 - this.t)); if (this.t > 1) this.t = -1; }
  }
  override renderOver(): void {
    if (this.t < 0) return;
    const r = this.r, { x, y } = this.pl.screen(), p = this.t;
    for (let i = 0; i < 3; i++) { const q = clamp(p - i * 0.15, 0, 1); r.ring(x, y - 20, 10 + q * 80, i ? '#ff90c0' : '#ffffff', 2, 1 - q); }
    // speaker cones on the roof
    for (let i = 0; i < 2; i++) { const bx = x - 12 + i * 24, pulse = Math.round(Math.sin(this.w.time * 40) * 2); r.disc(bx, this.roofY - 6, 6 + pulse, '#23232f'); r.disc(bx, this.roofY - 6, 3 + pulse, '#e04080'); }
  }
}

// ── ROCKET JUMP ─────────────────────────────────────────────────────────────
class RocketJump extends Ab {
  readonly id: AbilityId = 'rocketjump';
  override cooldown = cdOf('rocketjump', 7);
  override duration = durOf('rocketjump', 1.5);
  protected onActivate(): void { this.pl.airborne = true; this.sfx('boostStart'); this.sfx('jump'); }
  protected override onUpdate(): void {
    if (!this.active) return;
    const p = this.elapsed / this.duration;
    this.pl.air = Math.sin(p * Math.PI) * 90;
    this.pl.airborne = true;
    const { x, y } = this.pl.screen();
    if (p < 0.5) for (let i = 0; i < 2; i++) this.w.fx.spawn({ x: x + rnd(-10, 10), y: y - this.pl.air, vx: rnd(-20, 20), vy: 80, life: 0.35, maxLife: 0.35, colors: FIRE, size: 3, gravity: 0, shrink: true });
  }
  protected override onEnd(): void {
    const w = this.w;
    this.pl.air = 0; this.pl.airborne = false;
    w.game.r.shake(7, 0.4); this.sfx('explode');
    for (const t of w.traffic) if (t.collidable && t.z > -3 && t.z < 12) w.destroyTraffic(t, 'weapon', this.knockDir(t));
    for (let i = 0; i < 24; i++) wfx(w, { laneX: this.pl.laneX + rnd(-1.5, 1.5), z: PLAYER_Z + rnd(-1, 6), h: 0, vy: rnd(40, 120), life: 0.6, colors: DUST, size: 3, gravity: -200, shrink: true });
    this.landT = 0;
  }
  private landT = -1;
  override renderUnder(): void {
    if (this.landT >= 0) { this.landT += 1 / 60; roadRing(this.w, this.pl.laneX, PLAYER_Z, 1 + this.landT * 20, '#ffe870', 3, 1 - this.landT * 1.5); if (this.landT > 0.7) this.landT = -1; }
  }
}

// ── TURBOJET ────────────────────────────────────────────────────────────────
class Turbojet extends Ab {
  readonly id: AbilityId = 'turbojet';
  override cooldown = cdOf('turbojet', 12);
  override duration = durOf('turbojet', 4);
  protected onActivate(): void { this.sfx('boostStart'); this.w.game.r.flash('#60a0ff', 0.3); }
  protected override onUpdate(): void {
    if (!this.active) return;
    const w = this.w;
    w.mod.speed *= 1.8;
    this.pl.crushAll = true; this.pl.invuln = Math.max(this.pl.invuln, 0.2);
    const { x, y } = this.pl.screen();
    for (let i = 0; i < 3; i++) w.fx.spawn({ x: x + rnd(-14, 14), y: y - 4, vx: rnd(-10, 10), vy: rnd(90, 160), life: 0.3, maxLife: 0.3, colors: JET, size: 4, gravity: 0, shrink: true });
    tintMax(w, '#2040e0', 0.06);
  }
  onCollision(): boolean { return this.active; }
  protected override onEnd(): void { this.pl.crushAll = false; this.sfx('boostEnd'); }
  override renderOver(): void {
    if (!this.active) return;
    const r = this.r, { x } = this.pl.screen(), t = this.w.time;
    // jet intakes on the roof + speed streaks
    r.fillRect(x - 16, this.roofY - 4, 8, 6, '#3a3a48'); r.fillRect(x + 8, this.roofY - 4, 8, 6, '#3a3a48');
    r.fillRect(x - 14, this.roofY - 2, 4, 2, '#60a0ff'); r.fillRect(x + 10, this.roofY - 2, 4, 2, '#60a0ff');
    for (let i = 0; i < 12; i++) { const yy = ((t * 900 + i * 47) % (r.h - this.w.road.hy)) + this.w.road.hy; const xx = i % 2 ? 6 + (i * 17) % 40 : r.w - 8 - (i * 13) % 40; r.fillRect(xx, yy, 1, 16, '#c0f8ff', 0.6); }
  }
}

// ── RAILGUN ─────────────────────────────────────────────────────────────────
class Railgun extends Ab {
  readonly id: AbilityId = 'railgun';
  override cooldown = cdOf('railgun', 9);
  override duration = durOf('railgun', 0.8);
  private fired = false;
  private beamT = -1;
  private lane = 0;
  protected onActivate(): void { this.fired = false; this.lane = this.pl.laneX; this.sfx('emp'); }
  protected override onUpdate(dt: number): void {
    if (this.active) {
      this.lane = this.pl.laneX;
      const { x, y } = this.pl.screen();
      this.w.fx.spawn({ x: x + rnd(-30, 30), y: y - rnd(0, 40), vx: 0, vy: 0, life: 0.2, maxLife: 0.2, colors: CYAN, size: 2, gravity: 0, shrink: true });
    }
    if (this.beamT >= 0) { this.beamT += dt; if (this.beamT > 0.5) this.beamT = -1; }
  }
  protected override onEnd(): void {
    if (this.fired) return;
    this.fired = true;
    const w = this.w;
    for (const t of w.traffic) if (t.collidable && Math.abs(t.laneX - this.lane) < 0.7 && t.z > -1 && t.z < 200) w.destroyTraffic(t, 'weapon', this.knockDir(t));
    this.beamT = 0;
    this.pl.bump = 6; this.pl.stagger = 0.25;
    w.game.r.shake(8, 0.4); w.game.r.flash('#c0f8ff', 0.7);
    this.sfx('laser'); this.sfx('cannon');
  }
  override renderOver(): void {
    const r = this.r;
    if (this.active) {
      // charge glow gathering at the front
      const { x, y } = this.pl.screen(), p = this.elapsed / this.duration;
      r.ring(x, this.roofY + 4, Math.round(14 * (1 - p)) + 2, '#40e0f0', 2, 0.8);
      r.disc(x, this.roofY + 4, Math.round(2 + p * 4), '#ffffff', 0.9);
      void y;
    }
    if (this.beamT >= 0) {
      const q = this.beamT / 0.5;
      const a = this.w.road.project(this.lane, PLAYER_Z + 1), b = this.w.road.project(this.lane, 200);
      const wdt = Math.max(1, Math.round(10 * (1 - q)));
      line(r, a.x, a.y - 16, b.x, b.y - 2, '#2040e0', wdt + 4, 0.5 * (1 - q));
      line(r, a.x, a.y - 16, b.x, b.y - 2, '#40e0f0', wdt + 2, 1 - q);
      line(r, a.x, a.y - 16, b.x, b.y - 2, '#ffffff', wdt, 1 - q);
    }
  }
}

// ── icons ───────────────────────────────────────────────────────────────────
const I = (id: string, rows: string[]) => registerIcon(id, rows);
I('chain', ['..............#.', '.............##.', '............##..', '...........##...', '..........##....', '....##...##.....', '...#..#.##......', '...#..###.......', '....##.#........', '...#..#.........', '..#....#........', '..#....#........', '...#..#.........', '....##..........', '................', '................']);
I('tornado', ['..############..', '.##############.', '..############..', '....#########...', '.....########...', '.....#######....', '......######....', '......#####.....', '.......####.....', '.......####.....', '........###.....', '........##......', '........##......', '.........#......', '.........#......', '........##......']);
I('quake', ['................', '.......##.......', '......####......', '.....######.....', '....########....', '...##########...', '................', '#....#....#....#', '.#..#.#..#.#..#.', '..##...##...##..', '..#.....#...#...', '.#.......#...#..', '#.........#...#.', '................', '################', '################']);
I('mines', ['....#......#....', '.....#....#.....', '....########....', '...##########...', '..###..##..###..', '.####..##..####.', '####..####..####', '####..####..####', '.####..##..####.', '..###..##..###..', '...##########...', '....########....', '.....#....#.....', '....#......#....', '................', '................']);
I('gatling', ['................', '...####..####...', '...#..#..#..#...', '...#..#..#..#...', '...#..#..#..#...', '...#..#..#..#...', '...#..#..#..#...', '..############..', '..############..', '....########....', '....#......#....', '....#......#....', '....#......#....', '....########....', '................', '................']);
I('shockwave', ['.......##.......', '.....######.....', '...##......##...', '..#..........#..', '.#....####....#.', '#....#....#....#', '#...#..##..#...#', '#...#..##..#...#', '#....#....#....#', '.#....####....#.', '..#..........#..', '...##......##...', '.....######.....', '.......##.......', '................', '................']);
I('timewarp', ['....########....', '....#......#....', '.....#....#.....', '......#..#......', '.......##.......', '......#..#......', '.....#....#.....', '....#......#....', '....########....', '................', '....########....', '.....#....#.....', '......####......', '.......##.......', '......####......', '.....######.....']);
I('blossom', ['......####......', '.....######.....', '.###.######.###.', '################', '################', '.##############.', '..############..', '.###..####..###.', '.###..####..###.', '..##########....', '....##..##......', '................', '......##........', '.....##.........', '....##..........', '................']);
I('dragon', ['......###.......', '.....#####......', '....##.####.....', '...####.####....', '..######.####...', '.#########.###..', '##############..', '.############...', '..##########....', '...########.....', '....######......', '.....####..##...', '......##..##....', '.........##.....', '........##......', '................']);
I('anchor', ['.......##.......', '......#..#......', '.......##.......', '....########....', '.......##.......', '.......##.......', '.......##.......', '#......##......#', '##.....##.....##', '.##....##....##.', '..##...##...##..', '...###.##.###...', '....########....', '......####......', '................', '................']);
I('plasma', ['................', '...##......##...', '..####....####..', '..####....####..', '...##......##...', '................', '.......##.......', '......####......', '.....######.....', '.....######.....', '......####......', '.......##.......', '................', '...##......##...', '..####....####..', '...##......##...']);
I('fireworks', ['.......#........', '...#...#...#....', '....#..#..#.....', '.....#.#.#......', '..#...###...#...', '...####.####....', '#######.#######.', '...####.####....', '..#...###...#...', '.....#.#.#......', '....#..#..#.....', '...#...#...#....', '.......#........', '.......#........', '......###.......', '................']);
I('bass', ['....########....', '...##########...', '...#..####..#...', '...#.######.#...', '...#.######.#...', '...#..####..#...', '...##########...', '...#........#...', '...#..####..#...', '...#.######.#...', '...#.##..##.#...', '...#.######.#...', '...#..####..#...', '...##########...', '....########....', '................']);
I('rocketjump', ['.......##.......', '......####......', '.....######.....', '.....######.....', '.....##..##.....', '.....##..##.....', '.....######.....', '....########....', '...##########...', '..###.####.###..', '......####......', '.....######.....', '....########....', '...##..##..##...', '..#....##....#..', '................']);
I('turbojet', ['.......##.......', '......####......', '.....######.....', '.....######.....', '....########....', '....########....', '...##########...', '..############..', '.###..####..###.', '###...####...###', '......####......', '.....######.....', '....###..###....', '...##......##...', '..#..........#..', '................']);
I('railgun', ['................', '................', '##..............', '###.............', '####............', '#####...........', '################', '################', '################', '#####...........', '####............', '###.............', '##..............', '................', '................', '................']);

export const SET3: Partial<Record<AbilityId, (w: World) => Ability>> = {
  chain: (w) => new Chain(w), tornado: (w) => new Tornado(w), quake: (w) => new Quake(w), mines: (w) => new Mines(w),
  gatling: (w) => new Gatling(w), shockwave: (w) => new Shockwave(w), timewarp: (w) => new Timewarp(w), blossom: (w) => new Blossom(w),
  dragon: (w) => new Dragon(w), anchor: (w) => new Anchor(w), plasma: (w) => new Plasma(w), fireworks: (w) => new Fireworks(w),
  bass: (w) => new Bass(w), rocketjump: (w) => new RocketJump(w), turbojet: (w) => new Turbojet(w), railgun: (w) => new Railgun(w),
};
void flipSprite; void SPAWN_Z; void Grid;
