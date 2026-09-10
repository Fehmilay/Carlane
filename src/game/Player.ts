import type { VehicleDef } from '../core/types';
import type { PixelSprite } from '../core/Sprite';
import { shearSprite, tintSprite } from '../core/Sprite';
import { clamp } from '../core/Rng';
import type { World } from './World';
import { PLAYER_Z } from './Road';

export const BASE_SPEED = 38; // m/s at speed stat 5

/** Runtime state of the player's vehicle. */
export class Player {
  lane: number;
  laneX: number;
  hp: number;
  maxHp: number;
  /** m/s */
  speed = 0;
  baseSpeed: number;
  boostMul: number;
  handling: number;
  boosting = false;
  /** 0..1 boost energy: drains while boosting, regenerates otherwise. */
  energy = 1;
  /** true when energy hit 0 — boosting is blocked until it recovers to 0.3 */
  overheated = false;
  /** vertical recoil bump (px) after a hit */
  bump = 0;
  /** jump height in px (0 = on ground) */
  air = 0;
  airborne = false;
  /** seconds of post-hit invulnerability */
  invuln = 0;
  /** hit flash */
  flash = 0;
  /** knockback slowdown timer */
  stagger = 0;
  /** shield charges (abilities) */
  shield = 0;
  /** visual: current lean (-1..1) */
  lean = 0;
  /** ghost/phasing: passes through traffic */
  phasing = false;
  /** crush everything (mega mode etc.) */
  crushAll = false;
  /** scale multiplier for shrink/mega */
  sizeMul = 1;
  /** true while dead animation plays */
  dead = false;
  /** dev/god flag */
  invincible = false;
  private sprite: PixelSprite;
  constructor(public w: World, public def: VehicleDef, sprite: PixelSprite) {
    this.sprite = sprite;
    this.lane = Math.floor(w.road.lanes / 2);
    this.laneX = this.lane;
    this.maxHp = def.stats.durability;
    this.hp = this.maxHp;
    this.baseSpeed = BASE_SPEED * (0.7 + def.stats.speed * 0.06);
    this.boostMul = 1.35 + def.stats.boost * 0.05;
    this.handling = 6 + def.stats.handling * 1.2;
    this.speed = this.baseSpeed;
  }
  get z(): number { return PLAYER_Z; }
  get crush(): boolean { return !!this.def.crush || this.crushAll; }
  get damageT(): number { return 1 - this.hp / this.maxHp; }

  setSprite(s: PixelSprite): void { this.sprite = s; }

  moveLane(dir: number): boolean {
    const target = clamp(this.lane + dir, 0, this.w.road.lanes - 1);
    if (target === this.lane) return false;
    this.lane = target;
    return true;
  }

  update(dt: number): void {
    const w = this.w;
    // boost energy
    if (this.boosting) {
      this.energy = Math.max(0, this.energy - dt * 0.22);
      if (this.energy <= 0) { this.overheated = true; this.boosting = false; this.w.game.audio.sfx('boostEnd'); }
    } else {
      this.energy = Math.min(1, this.energy + dt * (this.overheated ? 0.12 : 0.16));
      if (this.overheated && this.energy >= 0.35) this.overheated = false;
    }
    if (this.overheated) this.boosting = false;
    if (this.bump > 0) this.bump = Math.max(0, this.bump - dt * 30);
    this.spawnEffects(dt);
    // lane interpolation (grip < 1 makes it sluggish / overshooting)
    const k = this.handling * w.mod.grip;
    const diff = this.lane - this.laneX;
    const step = clamp(diff * k * dt, -Math.abs(diff), Math.abs(diff));
    this.laneX += step;
    if (Math.abs(diff) < 0.01) this.laneX = this.lane;
    this.lean += ((diff * 0.8) - this.lean) * Math.min(1, dt * 12);
    // speed
    const target = this.baseSpeed * (this.boosting ? this.boostMul : 1) * w.level.speedMul * w.mod.speed * (this.stagger > 0 ? 0.55 : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * (this.boosting ? 2.5 : 1.6));
    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.stagger > 0) this.stagger -= dt;
  }

  private smokeT = 0;
  /** Exhaust flames while boosting, smoke/fire when damaged, tire smoke on lane change. */
  private spawnEffects(dt: number): void {
    const w = this.w, fx = w.fx;
    const { x, y } = this.screen();
    const s = this.sizeMul;
    const half = Math.round(this.sprite.w * 0.28 * s);
    if (this.boosting && !this.dead) {
      const n = this.def.details?.exhaust ?? 2;
      const xs = n === 1 ? [x] : n === 4 ? [x - half, x - half + 4, x + half - 4, x + half] : [x - half, x + half];
      for (const ex of xs) {
        fx.spawn({ x: ex + (Math.random() - 0.5) * 2, y: y - 2, vx: (Math.random() - 0.5) * 12, vy: 70 + Math.random() * 50, life: 0.22 + Math.random() * 0.1, maxLife: 0.32, colors: ['#ffffff', '#ffe870', '#f07020', '#e0202a', '#3a3a48'], size: 3 * s, gravity: 0, shrink: true });
      }
    }
    const dmg = this.damageT;
    if (dmg > 0.3 && !this.dead) {
      this.smokeT += dt;
      const rate = dmg > 0.9 ? 0.03 : dmg > 0.6 ? 0.06 : 0.14;
      if (this.smokeT > rate) {
        this.smokeT = 0;
        const hy = y - this.sprite.h * 0.85 * s;
        fx.spawn({ x: x + (Math.random() - 0.5) * 10 * s, y: hy, vx: (Math.random() - 0.5) * 8, vy: -30 - Math.random() * 20, life: 0.6 + Math.random() * 0.4, maxLife: 1, colors: dmg > 0.9 ? ['#ffe870', '#f07020', '#e0202a', '#3a3a48', '#23232f'] : ['#a8a8b4', '#6a6a78', '#3a3a48'], size: (2 + Math.random() * 3) * s, gravity: -20, shrink: true });
      }
    }
    if (Math.abs(this.lean) > 0.35 && !this.airborne && Math.random() < 0.7) {
      const side = this.lean > 0 ? -1 : 1;
      fx.spawn({ x: x + side * half, y: y - 1, vx: side * 20 + (Math.random() - 0.5) * 10, vy: 10, life: 0.3, maxLife: 0.3, colors: ['#f4f4f0', '#a8a8b4'], size: 2, gravity: 0, shrink: true, alpha: 0.8 });
    }
  }

  /** Apply damage; returns true if the vehicle was destroyed. */
  hit(amount: number): boolean {
    if (this.invincible || this.dead) return false;
    if (this.shield > 0) { this.shield--; this.w.game.audio.sfx('shield'); this.invuln = Math.max(this.invuln, 0.6); return false; }
    if (this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.25;
    this.invuln = 1.0;
    this.stagger = 0.6;
    this.bump = 6;
    this.w.onPlayerDamaged(amount);
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }
  heal(n: number): void { this.hp = Math.min(this.maxHp, this.hp + n); }

  /** Screen position of the car's base (ground contact). */
  screen(): { x: number; y: number } {
    const p = this.w.road.project(this.laneX, PLAYER_Z);
    return { x: p.x, y: p.y };
  }

  render(): void {
    const r = this.w.game.r;
    const { x, y } = this.screen();
    const s = this.sizeMul;
    // shadow
    const shW = Math.round(this.sprite.w * 0.9 * s), shH = 4;
    r.fillRect(x - shW / 2, y - 2, shW, shH, '#000000', 0.35);
    let spr = this.w.damagedSprite(this.sprite, this.damageT);
    const lean = clamp(this.lean, -1, 1) * 0.28;
    if (Math.abs(lean) > 0.03) spr = shearSprite(spr, -lean);
    const yy = y - this.air - Math.round(this.bump * (this.w.game.r.frame % 2 ? 1 : -0.5)) - (this.boosting ? (this.w.game.r.frame % 4 < 2 ? 1 : 0) : 0);
    const blink = this.invuln > 0 && !this.dead && Math.floor(this.invuln * 20) % 2 === 0;
    if (this.flash > 0.12) r.sprite(tintSprite(spr, '#ffffff'), x, yy, { scale: s });
    else if (!blink || this.flash > 0) r.sprite(spr, x, yy, { scale: s, alpha: this.phasing ? 0.5 : 1 });
    else r.sprite(spr, x, yy, { scale: s, alpha: 0.45 });
  }
}
