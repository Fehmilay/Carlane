import type { Screen } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';

/** STUB — replaced by the UI agent. `asOverlay` = pushed on top of the play screen (revive flow); pop() to return. */
export class ShopScreen implements Screen {
  constructor(private g: Game, public asOverlay = false) {}
  update(): void {}
  render(): void { const r = this.g.r; r.clear(P.paper); r.text('ShopScreen', r.w / 2, 40, { align: 'center', color: P.black }); }
}
