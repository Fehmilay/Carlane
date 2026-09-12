import type { Screen, TimeOfDay } from '../../core/types';
import type { Game } from '../../core/Game';
import { P } from '../../core/Palette';
import { getCity, CITIES } from '../../content/cities';
import { drawSkyline } from '../../content/cities';
import { Road } from '../../game/Road';
import { drawFlag } from '../../content/flags';
import { L } from '../../core/i18n';
import { kanjiSprite } from '../../core/Kanji';

/**
 * DEV: renders a city's skyline for all four times of day with sky + road.
 * Route: #screen=skyline&city=istanbul
 */
export class SkylineScreen implements Screen {
  private t = 0;
  private road: Road;
  constructor(private g: Game, private cityId: string) { this.road = new Road(g.r); }
  update(dt: number): void { this.t += dt; }
  render(): void {
    const r = this.g.r;
    const city = getCity(this.cityId as never) ?? CITIES[0];
    r.clear(P.black);
    const tods: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
    const hh = Math.floor(r.h / 4);
    tods.forEach((tod, i) => {
      const pal = city.palettes[tod] ?? city.palettes.day;
      const y0 = i * hh;
      const hy = y0 + Math.round(hh * 0.62);
      r.clip({ x: 0, y: y0, w: r.w, h: hh });
      r.bandedGradient(0, y0, r.w, hy - y0 + 2, [pal.skyTop, pal.skyBottom], 10);
      drawSkyline(r, city, tod, Math.sin(this.t * 0.5) * 10, hy, this.t, 0);
      this.road.horizonY = hy; this.road.roadH = y0 + hh - hy; this.road.scroll = this.t * 30;
      this.road.render(pal, 0);
      r.unclip();
      r.text(tod.toUpperCase() + (city.palettes[tod] ? '' : ' (day fallback)'), 3, y0 + 2, { color: P.white, outline: P.black });
    });
    drawFlag(r, city.countryCode, 3, r.h - 10, 1);
    const label = `${L(city.name)} / ${L(city.country)}`;
    r.text(label, 16, r.h - 10, { color: P.white, outline: P.black });
    if (city.glyph) { const g = kanjiSprite(city.glyph, { size: 9, color: P.white, outline: P.black }); r.sprite(g, 20 + r.textWidth(label), r.h - 11, { origin: 'topleft' }); }
  }
}
