import type { AbilityId } from '../core/types';
import type { World } from './World';
import type { Traffic } from './Traffic';

/**
 * A vehicle's special. One instance per run. Implementations live in game/abilities/.
 * Visuals are drawn in renderUnder (below the player sprite) / renderOver (above).
 */
export interface Ability {
  readonly id: AbilityId;
  /** 0..1 remaining cooldown fraction (0 = ready) */
  readonly cooldownT: number;
  readonly ready: boolean;
  /** true while a duration ability is active */
  readonly active: boolean;
  /** 0..1 remaining active fraction */
  readonly activeT: number;
  /** Try to activate; returns false if on cooldown. */
  activate(): boolean;
  update(dt: number): void;
  /** world-space effects drawn before the player sprite */
  renderUnder(): void;
  /** effects drawn after the player sprite (over everything in the road layer) */
  renderOver(): void;
  /** Called when the player is about to collide with traffic. Return true to cancel damage. */
  onCollision?(t: Traffic): boolean;
  /** Called when traffic is destroyed (any cause). */
  onKill?(t: Traffic): void;
}

/** Shared helper base for abilities. */
export abstract class BaseAbility implements Ability {
  abstract readonly id: AbilityId;
  cooldown = 8;
  duration = 0;
  protected cd = 0;
  protected act = 0;
  constructor(protected w: World) {}
  get cooldownT(): number { return this.cooldown > 0 ? this.cd / this.cooldown : 0; }
  get ready(): boolean { return this.cd <= 0 && this.act <= 0; }
  get active(): boolean { return this.act > 0; }
  get activeT(): number { return this.duration > 0 ? this.act / this.duration : 0; }
  activate(): boolean {
    if (!this.ready) return false;
    this.cd = this.cooldown;
    this.act = this.duration;
    this.onActivate();
    return true;
  }
  protected abstract onActivate(): void;
  protected onEnd(): void { /* override */ }
  update(dt: number): void {
    if (this.act > 0) { this.act -= dt; if (this.act <= 0) { this.act = 0; this.onEnd(); } }
    else if (this.cd > 0) { this.cd -= dt; if (this.cd <= 0) { this.cd = 0; this.w.game.audio.sfx('cooldownReady'); } }
    this.onUpdate(dt);
  }
  protected onUpdate(_dt: number): void { /* override */ }
  renderUnder(): void { /* override */ }
  renderOver(): void { /* override */ }
}
