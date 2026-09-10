import type { VehicleDef } from '../../core/types';
import { Grid, buildSprite, type PixelSprite } from '../../core/Sprite';

// STUB — replaced by the side-view template library (all BodyTemplate values). Keep exports identical.

/** Side-view garage sprite, facing left like the reference sheet. ~64×26 px for cars, up to 96×44 for heavies. */
export function drawSide(def: VehicleDef): PixelSprite {
  const w = 60, h = 22;
  const g = new Grid(w, h);
  g.rect(4, 11, 52, 7, 'B');
  g.trap(16, 40, 5, 10, 48, 11, 'B');
  g.trap(18, 38, 6, 13, 44, 10, 'G');
  g.vline(28, 6, 10, 'B');
  g.rect(4, 14, 52, 1, 'b');
  g.rect(4, 16, 52, 2, 'b');
  g.rect(53, 12, 3, 2, 'L'); g.rect(4, 12, 3, 2, 'L');
  if (def.details?.spoiler === 'wing') { g.rect(3, 8, 8, 1, 'b'); g.rect(4, 9, 2, 2, 'b'); }
  g.circle(14, 17, 4, 'W'); g.circle(46, 17, 4, 'W');
  g.circle(14, 17, 2, 'd'); g.circle(46, 17, 2, 'd');
  g.px(14, 17, 'C'); g.px(46, 17, 'C');
  g.outline('k');
  return buildSprite(g.toSource('side_' + def.id), def.palette);
}
