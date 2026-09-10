import type { Screen } from '../../core/types';
import type { Game } from '../../core/Game';
import { P } from '../../core/Palette';
import { PROP_IDS, propSprite } from '../../content/props';
import { iconRows, drawIcon } from '../../content/icons';
import { drawFlag } from '../../content/flags';
import { CITIES } from '../../content/cities';

/** DEV: all props, icons and flags. Route: #screen=props | #screen=icons&ids=a,b,c | #screen=flags */
export class PropsScreen implements Screen {
  constructor(private g: Game, private mode: 'props' | 'icons' | 'flags', private ids: string[] = []) {}
  update(): void {}
  render(): void {
    const r = this.g.r;
    r.clear(P.gray3);
    let x = 4, y = 14;
    r.text(this.mode.toUpperCase(), 4, 2, { color: P.white });
    if (this.mode === 'props') {
      for (const id of PROP_IDS) {
        const s = propSprite(id)!;
        const w = Math.max(40, s.w + 4);
        if (x + w > r.w) { x = 4; y += 56; }
        r.sprite(s, x + w / 2, y + 40);
        r.text(id.slice(0, 7), x, y + 43, { color: P.yellow });
        x += w;
      }
    } else if (this.mode === 'icons') {
      const ids = this.ids.length ? this.ids : ['nitro'];
      for (const id of ids) {
        if (x + 40 > r.w) { x = 4; y += 30; }
        r.fillRect(x, y, 20, 20, P.black);
        drawIcon(r, id, x + 2, y + 2, iconRows(id) ? P.white : P.red);
        r.text(id.slice(0, 7), x, y + 22, { color: P.yellow });
        x += 40;
      }
    } else {
      const codes = Array.from(new Set(CITIES.map((c) => c.countryCode)));
      for (const code of codes) {
        if (x + 40 > r.w) { x = 4; y += 24; }
        drawFlag(r, code, x + 2, y + 2, 2);
        r.text(code, x, y + 14, { color: P.yellow });
        x += 40;
      }
    }
  }
}
