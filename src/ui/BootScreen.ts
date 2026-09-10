import type { Screen } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';

/** Minimal loading screen shown while save/IAP initialize. */
export class BootScreen implements Screen {
  private t = 0;
  constructor(private g: Game) {}
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = this.g.r;
    r.clear(P.black);
    r.text('CARLANE', r.w / 2, r.h / 2 - 8, { align: 'center', scale: 2, color: P.white, shadow: P.red });
    const dots = '.'.repeat(1 + (Math.floor(this.t * 3) % 3));
    r.text('LOADING' + dots, r.w / 2, r.h / 2 + 16, { align: 'center', color: P.gray1 });
  }
}
