import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P } from '../core/Palette';
import { t } from '../core/i18n';

/** STUB results / game-over overlay — replaced by the UI agent. */
export class ResultsOverlay implements Screen {
  overlay = true;
  constructor(private g: Game, private ps: PlayScreen, private won: boolean) {
    const w = ps.world;
    g.save.addCoins(w.coinsCollected);
    if (won) {
      const stars = w.score >= ps.level.stars[2] ? 3 : w.score >= ps.level.stars[1] ? 2 : w.score >= ps.level.stars[0] ? 1 : 0;
      g.save.setLevelResult(ps.level.id, stars, Math.floor(w.score));
    }
  }
  update(): void { /* nothing */ }
  render(): void {
    const r = this.g.r, w = this.ps.world;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.6);
    r.text(this.won ? t('finish') : t('gameover'), r.w / 2, r.h / 2 - 40, { align: 'center', scale: 2, color: this.won ? P.yellow : P.red });
    r.text(`${t('score')} ${Math.floor(w.score)}`, r.w / 2, r.h / 2 - 10, { align: 'center', color: P.white });
    r.text(`${t('coins')} ${w.coinsCollected}`, r.w / 2, r.h / 2 + 2, { align: 'center', color: P.yellow });
    r.text(t('continue'), r.w / 2, r.h / 2 + 30, { align: 'center', color: P.cyan });
  }
  onPointer(ev: PointerEv): void {
    if (ev.kind !== 'down') return;
    void import('./TitleScreen').then((m) => this.g.goto(new m.TitleScreen(this.g)));
  }
}
