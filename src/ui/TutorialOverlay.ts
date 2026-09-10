import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P } from '../core/Palette';
import { t } from '../core/i18n';

/** STUB first-run tutorial — replaced by the UI agent (animated hand, step-by-step, waits for each action). */
export class TutorialOverlay implements Screen {
  overlay = true;
  constructor(private g: Game, private ps: PlayScreen) {}
  enter(): void { this.ps.world.frozen = true; }
  exit(): void { this.ps.world.frozen = false; this.g.save.markTutorial('play'); }
  update(): void {}
  render(): void {
    const r = this.g.r;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.6);
    r.text(t('swipeHint'), r.w / 2, r.h / 2 - 20, { align: 'center', color: P.white, wrap: r.w - 30 });
    r.text(t('holdHint'), r.w / 2, r.h / 2 + 4, { align: 'center', color: P.cyan });
    r.text(t('abilityHint'), r.w / 2, r.h / 2 + 16, { align: 'center', color: P.yellow, wrap: r.w - 30 });
  }
  onPointer(ev: PointerEv): void { if (ev.kind === 'down') this.g.pop(); }
}
