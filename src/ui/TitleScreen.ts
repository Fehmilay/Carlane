import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';

/** Placeholder — replaced by the real title screen. */
export class TitleScreen implements Screen {
  private t = 0;
  constructor(private g: Game) {}
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = this.g.r;
    r.bandedGradient(0, 0, r.w, r.h, [P.blueDark, P.purple, P.pink], 10);
    r.text('CARLANE', r.w / 2, 80, { align: 'center', scale: 3, color: P.white, outline: P.black, wave: 2, t: this.t });
    r.text('TAP TO START', r.w / 2, r.h - 60, { align: 'center', color: Math.floor(this.t * 2) % 2 ? P.yellow : P.white });
  }
  onPointer(ev: PointerEv): void { if (ev.kind === 'down') this.g.audio.sfx('select'); }
}
