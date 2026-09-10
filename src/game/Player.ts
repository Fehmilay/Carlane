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
  /** 0..1 boost energy (unlimited by default; some levels may limit) */
  heat = 0;
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

  /** Apply damage; returns true if the vehicle was destroyed. */
  hit(amount: number): boolean {
    if (this.invincible || this.dead) return false;
    if (this.shield > 0) { this.shield--; this.w.game.audio.sfx('shield'); this.invuln = Math.max(this.invuln, 0.6); return false; }
    if (this.invuln > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.flash = 0.25;
    this.invuln = 1.0;
    this.stagger = 0.6;
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
    const yy = y - this.air - (this.boosting ? (this.w.game.r.frame % 4 < 2 ? 1 : 0) : 0);
    const blink = this.invuln > 0 && !this.dead && Math.floor(this.invuln * 20) % 2 === 0;
    if (this.flash > 0.12) r.sprite(tintSprite(spr, '#ffffff'), x, yy, { scale: s });
    else if (!blink || this.flash > 0) r.sprite(spr, x, yy, { scale: s, alpha: this.phasing ? 0.5 : 1 });
    else r.sprite(spr, x, yy, { scale: s, alpha: 0.45 });
  }
}
