import type { Screen, PointerEv, VehicleDef } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { Button, drawBezel, drawChecker } from './widgets';
import { getAbilityDef } from '../content/abilities';
import { drawIcon } from '../content/icons';
import { sideSprite } from '../content/vehicleSprites';
import { Ease } from '../core/Tween';

/** One-time card shown the first time a vehicle with a new ability is driven. */
export class AbilityCardOverlay implements Screen {
  overlay = true;
  private t = 0;
  private ok: Button;
  constructor(private g: Game, private ps: PlayScreen, private v: VehicleDef, private onClose?: () => void) {
    const r = g.r;
    this.ok = new Button({ x: r.w / 2 - 44, y: r.h / 2 + 44, w: 88, h: 22 }, t('understood'), { color: P.green, onTap: () => g.pop() });
  }
  enter(): void { this.ps.world.frozen = true; this.g.audio.sfx('powerup'); }
  exit(): void { this.ps.world.frozen = false; this.g.save.markTutorial('ability_' + this.v.ability); this.onClose?.(); }
  update(dt: number): void { this.t += dt; this.ok.update(dt); }
  render(): void {
    const r = this.g.r, ab = getAbilityDef(this.v.ability);
    r.fillRect(0, 0, r.w, r.h, P.black, 0.78);
    const w = Math.min(200, r.w - 20), x = (r.w - w) / 2;
    const y = r.h / 2 - 88 - (1 - Ease.outBack(Math.min(1, this.t * 4))) * 24;
    drawBezel(r, x, y, w, 176, P.ink);
    drawChecker(r, x + 6, y + 6, w - 12, 3, 3, ab.color, P.black);
    r.text(t('newAbility'), r.w / 2, y + 14, { align: 'center', color: P.gray1 });
    r.text(L(ab.name), r.w / 2, y + 24, { align: 'center', color: ab.color, scale: 2, outline: P.black });
    // pulsing icon
    const pulse = (Math.sin(this.t * 5) + 1) / 2;
    r.disc(r.w / 2, y + 56, 18 + pulse * 2, mix(ab.color, P.black, 0.6));
    r.ring(r.w / 2, y + 56, 18 + pulse * 3, ab.color, 1, 0.8);
    drawIcon(r, ab.icon, r.w / 2 - 8, y + 48, P.white);
    // car + description
    const spr = sideSprite(this.v);
    r.sprite(spr, r.w / 2, y + 94, { scale: Math.min(1.1, (w - 40) / spr.w, 34 / spr.h) });
    r.text(L(ab.desc), r.w / 2, y + 100, { align: 'center', color: P.white, wrap: w - 24, lineHeight: 9 });
    this.ok.rect.y = y + 144;
    this.ok.draw(r);
  }
  onPointer(ev: PointerEv): void { this.ok.handle(ev, this.g); }
  onBack(): boolean { this.g.pop(); return true; }
  /** true while the card is on screen */
  get busy(): boolean { return true; }
}
