import type { Screen } from '../../core/types';
import type { Game } from '../../core/Game';
import { P } from '../../core/Palette';
import { VEHICLES } from '../../content/vehicles';
import { rearSprite, sideSprite, damagedSprite, trafficTemplates } from '../../content/vehicleSprites';
import type { BodyTemplate, VehicleDef } from '../../core/types';

const ALL_BODIES: BodyTemplate[] = ['coupe', 'sedan', 'hatch', 'kei', 'roadster', 'wagon', 'luxury', 'suv', 'pickup', 'van', 'truck', 'bus', 'tank', 'apc', 'monster', 'hyper', 'limo', 'police', 'firetruck', 'lowrider', 'taxi', 'tuktuk', 'tram'];
/** One synthetic vehicle per body template (for testing templates before the roster exists). */
function synthetic(): VehicleDef[] {
  return ALL_BODIES.map((body, i) => ({
    id: 'synth_' + body, num: i + 1, name: body.toUpperCase(), brand: 'custom', cls: 'jdm', body,
    palette: { body: ['#e0202a', '#2040e0', '#f0c020', '#f4f4f0', '#8030c0', '#20b040', '#f07020', '#e04080'][i % 8], shade: '#23232f', light: '#ffffff', accent: '#ffe870', glass: '#40e0f0', lamp: '#e0202a' },
    details: { spoiler: i % 2 ? 'wing' : 'none', exhaust: 2, lights: 'round' },
    stats: { speed: 5, boost: 5, handling: 5, durability: 5, weight: 3 }, ability: 'nitro', unlock: { type: 'start' }, desc: { de: '', en: '' },
  }));
}

/**
 * DEV: renders every vehicle's rear sprite (with 3 damage levels) and side sprite.
 * Route: #screen=spritesheet&page=0   (page = 0..n, 8 vehicles per page)  |  #screen=spritesheet&traffic=1
 */
export class SpriteSheetScreen implements Screen {
  constructor(private g: Game, private page = 0, private traffic = false, private all = false) {}
  update(): void {}
  render(): void {
    const r = this.g.r;
    r.clear(P.gray3);
    if (this.traffic) {
      const tpls = trafficTemplates();
      let x = 4, y = 12;
      r.text('TRAFFIC TEMPLATES ' + tpls.length, 4, 2, { color: P.white });
      for (const t of tpls) {
        if (x + 60 > r.w) { x = 4; y += 60; }
        r.sprite(t.sprite, x + 28, y + 44);
        r.text(t.id.slice(0, 11), x, y + 47, { color: P.yellow });
        x += 60;
      }
      return;
    }
    const per = 8;
    const src = this.all ? synthetic() : VEHICLES;
    const list = src.slice(this.page * per, this.page * per + per);
    r.text(`VEHICLES ${this.page * per + 1}-${this.page * per + list.length} / ${src.length}`, 4, 2, { color: P.white });
    let y = 14;
    for (const v of list) {
      const rear = rearSprite(v);
      const side = sideSprite(v);
      r.fillRect(0, y, r.w, 1, P.gray2);
      r.text(`${String(v.num).padStart(2, '0')} ${v.name}`, 4, y + 3, { color: P.yellow });
      r.text(`${v.body} ${rear.w}x${rear.h} ${side.w}x${side.h}`, 4, y + 12, { color: P.gray1 });
      const base = y + 60;
      r.sprite(rear, 26, base);
      r.sprite(damagedSprite(rear, 1), 70, base);
      r.sprite(damagedSprite(rear, 2), 114, base);
      r.sprite(damagedSprite(rear, 3), 158, base);
      r.sprite(side, 200, base);
      y += 66;
    }
  }
}
