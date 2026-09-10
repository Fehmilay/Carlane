import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P } from '../core/Palette';
import { t } from '../core/i18n';

/** STUB pause overlay — replaced by the UI agent with a styled panel. */
export class PauseOverlay implements Screen {
  overlay = true;
  constructor(private g: Game, private ps: PlayScreen) {}
  update(): void { if (this.g.input.keys.has('Escape')) { this.g.input.keys.delete('Escape'); this.g.pop(); } }
  render(): void {
    const r = this.g.r;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.6);
    r.text(t('pause'), r.w / 2, r.h / 2 - 20, { align: 'center', scale: 2, color: P.white });
    r.text(t('resume'), r.w / 2, r.h / 2 + 10, { align: 'center', color: P.yellow });
  }
  onPointer(ev: PointerEv): void { if (ev.kind === 'down') { this.g.pop(); void this.ps; } }
  onBack(): boolean { this.g.pop(); return true; }
}
