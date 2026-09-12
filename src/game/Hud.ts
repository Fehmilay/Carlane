import type { Game } from '../core/Game';
import type { PlayScreen } from '../ui/PlayScreen';
import { P, mix } from '../core/Palette';
import { getAbilityDef } from '../content/abilities';
import { drawIcon } from '../content/icons';
import { drawFlag } from '../content/flags';
import { L } from '../core/i18n';
import { drawChecker } from '../ui/widgets';

/**
 * In-game HUD in the style of the in-game reference: a slim bezel panel top-left with SCORE,
 * a progress bar with a checkered finish marker, the lives readout, a speed strip and the
 * round ability button bottom-right (mirrored for left-handers by PlayScreen).
 */
export function drawHud(g: Game, ps: PlayScreen): void {
  const r = g.r, w = ps.world, pl = w.player;
  const top = r.safeTop + 4;

  // ── top-left: SCORE panel ────────────────────────────────────────────────
  const scoreStr = String(Math.floor(w.score)).padStart(6, '0');
  const sw = Math.max(52, r.textWidth(scoreStr, { scale: 2 }) + 8);
  panel(r, 4, top, sw, 22);
  r.text('SCORE', 8, top + 2, { color: P.gray1 });
  r.text(scoreStr, 8, top + 10, { color: P.white, scale: 2 });

  // ── top-right: lives / HP ────────────────────────────────────────────────
  const hpW = 58;
  panel(r, r.w - 4 - hpW, top, hpW, 22);
  const hpCol = pl.hp <= Math.ceil(pl.maxHp / 3) ? (r.frame % 20 < 10 ? P.red : P.orange) : pl.hp <= Math.ceil((pl.maxHp * 2) / 3) ? P.yellow : P.green;
  r.text(`${pl.hp} / ${pl.maxHp}`, r.w - 8, top + 2, { align: 'right', color: P.gray1 });
  const segs = Math.min(pl.maxHp, 12);
  const segW = Math.floor((hpW - 10) / segs);
  for (let i = 0; i < segs; i++) {
    const on = i < Math.round((pl.hp / pl.maxHp) * segs);
    const shake = pl.flash > 0 ? Math.round((Math.random() - 0.5) * 2) : 0;
    r.fillRect(r.w - 4 - hpW + 5 + i * segW + shake, top + 11 + shake, segW - 1, 7, on ? hpCol : P.gray3);
  }

  // ── progress bar with flags ──────────────────────────────────────────────
  const pbY = top + 25, pbX = 30, pbW = r.w - 60;
  r.fillRect(pbX - 2, pbY - 2, pbW + 4, 9, P.black, 0.75);
  r.fillRect(pbX, pbY, pbW, 5, P.dark);
  const grad = [P.green, P.green, P.yellow, P.orange, P.red];
  const fill = Math.round(pbW * w.progress);
  for (let i = 0; i < fill; i++) r.fillRect(pbX + i, pbY + 1, 1, 3, grad[Math.min(grad.length - 1, Math.floor((i / pbW) * grad.length))]);
  const px = pbX + fill;
  r.fillRect(px - 1, pbY - 1, 3, 7, P.white);
  drawFlag(r, w.city.countryCode, 6, pbY - 2, 1);
  drawChecker(r, pbX + pbW + 2, pbY - 1, 8, 7, 2, P.white, P.black);

  // ── coins + combo ────────────────────────────────────────────────────────
  const cy = pbY + 10;
  r.fillRect(4, cy, 36, 11, P.black, 0.7);
  r.fillRect(7, cy + 2, 7, 7, P.yellow); r.fillRect(8, cy + 3, 5, 5, P.yellowLight); r.fillRect(9, cy + 4, 1, 3, P.white);
  r.text(String(w.coinsCollected), 17, cy + 3, { color: P.yellow });
  if (w.combo > 1) {
    const big = w.combo >= 5;
    const scale = big ? 2 : 1;
    const pop = Math.max(0, 1 - (3 - w.comboT) * 4);
    r.text(`${w.combo}× COMBO`, r.w - 8, cy + 2 - Math.round(pop * 2), { align: 'right', color: big ? P.pinkLight : P.yellow, outline: P.black, scale: 1 });
    void scale;
  }

  // ── boost / energy strip above the speedometer ───────────────────────────
  const bottom = r.h - r.safeBottom;
  const spW = 74, spX = (r.w - spW) / 2, spY = bottom - 26;
  panel(r, spX, spY, spW, 22);
  const kmh = Math.round(pl.speed * 3.6);
  r.text(String(kmh), spX + spW / 2 - 8, spY + 3, { align: 'center', color: pl.boosting ? P.cyan : P.white, scale: 2 });
  r.text('KM/H', spX + spW - 6, spY + 9, { align: 'right', color: P.gray1 });
  // energy bar
  const eW = spW - 8;
  r.fillRect(spX + 4, spY + 17, eW, 3, P.black);
  const e = Math.round(eW * pl.energy);
  for (let i = 0; i < e; i++) r.fillRect(spX + 4 + i, spY + 18, 1, 1, pl.overheated ? P.red : i > eW * 0.7 ? P.cyan : mix(P.green, P.cyan, i / eW));
  if (pl.boosting) r.text('BOOST', spX + spW / 2, spY - 9, { align: 'center', color: r.frame % 10 < 5 ? P.cyan : P.white, outline: P.black });

  // ── pause button ─────────────────────────────────────────────────────────
  const pb = ps.pauseBtn;
  r.fillRect(pb.x, pb.y, pb.w, pb.h, P.black, 0.55);
  r.strokeRect(pb.x, pb.y, pb.w, pb.h, P.gray2);
  r.fillRect(pb.x + 6, pb.y + 5, 3, 10, P.white);
  r.fillRect(pb.x + 11, pb.y + 5, 3, 10, P.white);
}

/** Small bezel-style HUD panel. */
function panel(r: ReturnType<() => Game['r']>, x: number, y: number, w: number, h: number): void {
  r.fillRect(x, y, w, h, P.black, 0.72);
  r.strokeRect(x, y, w, h, P.gray2);
  r.fillRect(x + 1, y + 1, w - 2, 1, P.gray3);
  // corner notches
  r.fillRect(x, y, 2, 1, P.white); r.fillRect(x + w - 2, y, 2, 1, P.white);
  r.fillRect(x, y + h - 1, 2, 1, P.white); r.fillRect(x + w - 2, y + h - 1, 2, 1, P.white);
}

/** The big round ability button with cooldown sweep, icon and ready pulse. */
export function drawAbilityButton(g: Game, ps: PlayScreen): void {
  const r = g.r, w = ps.world, ab = w.ability, def = getAbilityDef(ab.id);
  const b = ps.abilityBtn;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rad = b.w / 2;
  const ready = ab.ready;
  // outer ring + shadow
  r.disc(cx, cy + 2, rad + 1, P.black, 0.45);
  r.disc(cx, cy, rad + 1, P.black);
  r.disc(cx, cy, rad, ready ? mix(def.color, P.black, 0.25) : P.dark);
  if (!ready) {
    const frac = ab.active ? ab.activeT : 1 - ab.cooldownT;
    const c = r.ctx;
    c.save(); c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.closePath(); c.clip();
    r.disc(cx, cy, rad, ab.active ? def.color : mix(def.color, P.black, 0.55));
    c.restore();
  }
  r.disc(cx, cy, rad - 4, P.black, ready ? 0.35 : 0.6);
  drawIcon(r, def.icon, cx - 8, cy - 8, ready ? P.white : P.gray2);
  if (ready) {
    const pulse = (r.frame % 44) / 44;
    if (pulse < 0.5) r.ring(cx, cy, rad + 1 + Math.round(pulse * 4), def.color, 1, 1 - pulse * 2);
  }
  // name label for the first seconds of a run
  if (w.time < 3.5 && ps.phase === 'play') {
    const label = L(def.name);
    const tw = r.textWidth(label);
    // keep the label on screen even when the button sits in a corner
    const tx = Math.max(4 + tw / 2, Math.min(r.w - 4 - tw / 2, cx));
    r.fillRect(tx - tw / 2 - 2, b.y - 11, tw + 4, 9, P.black, 0.6);
    r.text(label, tx, b.y - 10, { align: 'center', color: def.color, outline: P.black });
  }
}
