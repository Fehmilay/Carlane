import type { AbilityId } from '../../core/types';
import type { World } from '../World';
import type { Ability } from '../Ability';
import { BaseAbility } from '../Ability';

// STUB — set 1 (nitro … gatling per assignment). Export SET1 mapping AbilityId → factory.
class Nitro extends BaseAbility {
  readonly id: AbilityId = 'nitro';
  override cooldown = 9;
  override duration = 3;
  protected onActivate(): void { this.w.game.audio.sfx('boostStart'); }
  protected override onUpdate(): void {
    if (this.active) {
      this.w.mod.speed *= 1.6;
      const { x, y } = this.w.player.screen();
      if (Math.random() < 0.9) this.w.fx.spawn({ x: x + (Math.random() - 0.5) * 16, y: y - 4, vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 40, life: 0.3, maxLife: 0.3, colors: ['#ffffff', '#40e0f0', '#2040e0'], size: 3, gravity: 0, shrink: true });
    }
  }
  onCollision(): boolean { return this.active; }
}

export const SET1: Partial<Record<AbilityId, (w: World) => Ability>> = {
  nitro: (w) => new Nitro(w),
};
