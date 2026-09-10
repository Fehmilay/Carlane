import type { Game } from '../core/Game';
import type { PlayScreen } from '../ui/PlayScreen';
import { P } from '../core/Palette';
import { getAbilityDef } from '../content/abilities';
import { drawIcon } from '../content/icons';
import { drawFlag } from '../content/flags';

/** In-game HUD: HP, score, coins, progress bar with city flag, combo. */
export function drawHud(g: Game, ps: PlayScreen): void {
  const r = g.r, w = ps.world, pl = w.player;
  const top = r.safeTop + 4;
  // HP: segmented bar with car icon
  const segs = pl.maxHp;
  const segW = Math.max(3, Math.min(8, Math.floor(80 / segs)));
  const barW = segs * (segW + 1) + 1;
  r.fillRect(6, top, barW + 2, 9, P.black, 0.7);
  for (let i = 0; i < segs; i++) {
    const on = i < pl.hp;
    const col = pl.hp <= Math.ceil(segs / 3) ? (r.frame % 20 < 10 ? P.red : P.orange) : pl.hp <= Math.ceil((segs * 2) / 3) ? P.yellow : P.green;
    r.fillRect(8 + i * (segW + 1), top + 2, segW, 5, on ? col : P.gray3);
  }
  // score
  r.text(String(Math.floor(w.score)).padStart(6, '0'), r.w - 30, top + 1, { align: 'right', color: P.white, outline: P.black });
  // coins
  r.fillRect(6, top + 12, 7, 7, P.yellow); r.fillRect(7, top + 13, 5, 5, P.yellowLight); r.fillRect(8, top + 14, 1, 3, P.white);
  r.text(String(w.coinsCollected), 16, top + 12, { color: P.yellow, outline: P.black });
  // combo
  if (w.combo > 1) r.text(`${w.combo}× COMBO`, r.w - 30, top + 12, { align: 'right', color: P.pinkLight, outline: P.black, scale: w.combo >= 5 ? 2 : 1 });
  // progress bar
  const pbX = 40, pbW = r.w - 80, pbY = top + 24;
  r.fillRect(pbX, pbY, pbW, 4, P.black, 0.7);
  r.fillRect(pbX + 1, pbY + 1, Math.round((pbW - 2) * w.progress), 2, P.cyan);
  const px = pbX + 1 + Math.round((pbW - 2) * w.progress);
  r.fillRect(px - 2, pbY - 1, 4, 6, P.white);
  drawFlag(r, w.city.countryCode, pbX + pbW + 3, pbY - 2, 1);
  // speed (km/h)
  const kmh = Math.round(pl.speed * 3.6);
  r.text(`${kmh}`, r.w / 2, r.h - r.safeBottom - 14, { align: 'center', color: pl.boosting ? P.cyan : P.gray1, outline: P.black, scale: pl.boosting ? 2 : 1 });
  r.text('KM/H', r.w / 2, r.h - r.safeBottom - 6 + (pl.boosting ? 4 : 0), { align: 'center', color: P.gray2, outline: P.black });
  // pause button
  const pb = ps.pauseBtn;
  r.fillRect(pb.x, pb.y, pb.w, pb.h, P.black, 0.5);
  r.fillRect(pb.x + 6, pb.y + 5, 3, 10, P.white); r.fillRect(pb.x + 11, pb.y + 5, 3, 10, P.white);
}

/** The big round ability button with cooldown sweep and icon. */
export function drawAbilityButton(g: Game, ps: PlayScreen): void {
  const r = g.r, w = ps.world, ab = w.ability, def = getAbilityDef(ab.id);
  const b = ps.abilityBtn;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rad = b.w / 2;
  const ready = ab.ready;
  r.disc(cx, cy, rad, P.black, 0.6);
  r.disc(cx, cy, rad - 2, ready ? def.color : P.gray3);
  if (!ready) {
    // cooldown sweep (pie) drawn as radial segments
    const frac = ab.active ? ab.activeT : 1 - ab.cooldownT;
    const c = r.ctx;
    c.save(); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, rad - 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.closePath(); c.clip();
    r.disc(cx, cy, rad - 2, ab.active ? def.color : P.gray2);
    c.restore();
  }
  r.disc(cx, cy, rad - 5, ready ? P.black : P.dark, 0.5);
  drawIcon(r, def.icon, cx - 8, cy - 8, ready ? P.white : P.gray1);
  if (ready && r.frame % 40 < 20) r.ring(cx, cy, rad + 1, def.color, 1);
}
