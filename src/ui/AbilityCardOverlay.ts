import type { Screen, PointerEv, VehicleDef } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P } from '../core/Palette';
import { L } from '../core/i18n';
import { getAbilityDef } from '../content/abilities';

/** STUB one-time ability explanation card — replaced by the UI agent. Freezes the world while shown. */
export class AbilityCardOverlay implements Screen {
  overlay = true;
  constructor(private g: Game, private ps: PlayScreen, private v: VehicleDef) {}
  enter(): void { this.ps.world.frozen = true; }
  exit(): void { this.ps.world.frozen = false; this.g.save.markTutorial('ability_' + this.v.ability); }
  update(): void {}
  render(): void {
    const r = this.g.r, def = getAbilityDef(this.v.ability);
    r.fillRect(0, 0, r.w, r.h, P.black, 0.6);
    r.text(L(def.name), r.w / 2, r.h / 2 - 20, { align: 'center', scale: 2, color: def.color });
    r.text(L(def.desc), r.w / 2, r.h / 2 + 4, { align: 'center', color: P.white, wrap: r.w - 40 });
  }
  onPointer(ev: PointerEv): void { if (ev.kind === 'down') this.g.pop(); }
}
