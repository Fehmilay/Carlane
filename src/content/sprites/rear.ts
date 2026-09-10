import type { VehicleDef } from '../../core/types';
import { Grid, buildSprite, makeCanvas, type PixelSprite } from '../../core/Sprite';

// STUB — replaced by the rear-view template library (all BodyTemplate values). Keep exports identical.

/** Rear-view gameplay sprite (player at scale 1; traffic scaled by depth). ~40×30 px for cars, up to 64×52 for heavies. */
export function drawRear(def: VehicleDef): PixelSprite {
  const w = 34, h = 26;
  const g = new Grid(w, h);
  g.rect(3, 11, 28, 12, 'B');
  g.trap(9, 24, 5, 4, 29, 11, 'B');
  g.rect(10, 6, 14, 5, 'G');
  g.hline(10, 23, 6, 'H');
  g.rect(3, 15, 28, 1, 'b');
  g.rect(3, 19, 28, 4, 'b');
  if (def.details?.spoiler === 'wing' || def.details?.spoiler === 'bigwing') { g.rect(4, 9, 26, 2, 'b'); g.rect(6, 11, 2, 2, 'b'); g.rect(26, 11, 2, 2, 'b'); }
  g.rect(4, 16, 4, 3, 'L'); g.rect(26, 16, 4, 3, 'L');
  g.rect(5, 17, 2, 1, 'w'); g.rect(27, 17, 2, 1, 'w');
  g.rect(14, 19, 6, 3, 'w');
  g.rect(3, 22, 28, 1, 'k');
  g.rect(9, 23, 3, 2, 'C'); g.rect(22, 23, 3, 2, 'C');
  g.rect(1, 17, 4, 8, 'W'); g.rect(29, 17, 4, 8, 'W');
  g.rect(2, 19, 2, 4, 'd'); g.rect(30, 19, 2, 4, 'd');
  g.outline('k');
  return buildSprite(g.toSource('rear_' + def.id + '_' + def.body), def.palette);
}

/** Progressive damage variant (level 1..3): scratches → dents/cracks/broken glass → holes & scorch marks. */
export function damagedSprite(spr: PixelSprite, level: number): PixelSprite {
  const c = makeCanvas(spr.w, spr.h);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(spr.canvas, 0, 0);
  const img = ctx.getImageData(0, 0, spr.w, spr.h);
  const d = img.data;
  let seed = 1234 + level * 77 + spr.w;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const n = level * 12;
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * spr.w), y = Math.floor(rnd() * spr.h);
    const idx = (y * spr.w + x) * 4;
    if (d[idx + 3] === 0) continue;
    if (level >= 3 && rnd() < 0.3) { d[idx + 3] = 0; continue; }
    const dark = rnd() < 0.6;
    d[idx] = dark ? 30 : 200; d[idx + 1] = dark ? 30 : 200; d[idx + 2] = dark ? 40 : 200;
  }
  ctx.putImageData(img, 0, 0);
  return { id: spr.id + '#dmg' + level, w: spr.w, h: spr.h, ax: spr.ax, ay: spr.ay, canvas: c };
}
