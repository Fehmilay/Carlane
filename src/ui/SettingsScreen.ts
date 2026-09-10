import type { Screen } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';

/** STUB — replaced by the UI agent. */
export class SettingsScreen implements Screen {
  constructor(private g: Game) {}
  update(): void {}
  render(): void { const r = this.g.r; r.clear(P.paper); r.text('SettingsScreen', r.w / 2, 40, { align: 'center', color: P.black }); }
}
