import type { Screen, PointerEv, Rect } from '../core/types';
import type { Game } from '../core/Game';
import { P, mix } from '../core/Palette';
import { World } from '../game/World';
import { getLevel } from '../content/levels';
import { getVehicle } from '../content/vehicles';
import { t } from '../core/i18n';
import { Button, drawBezel, drawKanji, drawSakuraBranch, drawChecker, drawCoins, drawDeco, drawToasts } from './widgets';
import { goGarage, goMap, goShop, goSettings } from './nav';
import { musicFor } from '../content/music';

/** Attract-mode title screen: the selected car drives through the level-1 city behind the logo. */
export class TitleScreen implements Screen {
  private world: World;
  private t = 0;
  private buttons: Button[] = [];
  private tapArea: Rect;
  constructor(private g: Game) {
    const lvl = { ...getLevel(1), timeOfDay: 'dusk' as const, density: 0.5, length: 999999, mechanics: ['blossom' as const] };
    this.world = new World(g, lvl, getVehicle(g.save.data.selectedVehicle), 4242);
    this.world.player.invincible = true;
    this.world.showSlogans = false;
    this.world.player.boosting = false;
    this.tapArea = { x: 0, y: 0, w: g.r.w, h: g.r.h };
    this.layout();
  }
  private layout(): void {
    const r = this.g.r;
    const y = r.h - r.safeBottom - 34;
    const w = 57, gap = 2;
    const total = w * 4 + gap * 3;
    const x0 = Math.round((r.w - total) / 2);
    // labels are centred; long words are trimmed so they never overflow the 57-px button
    const mk = (i: number, label: string, icon: string, color: string, fn: () => void) =>
      new Button({ x: x0 + i * (w + gap), y, w, h: 26 }, label.length > 8 ? label.slice(0, 8) : label, { color, onTap: fn, icon });
    this.buttons = [
      mk(0, t('garage'), 'car', P.blue, () => void goGarage(this.g)),
      mk(1, t('play'), 'play', P.red, () => void goMap(this.g)),
      mk(2, t('shop'), 'bag', P.purple, () => void goShop(this.g)),
      mk(3, t('settings'), 'gear', P.gray3, () => void goSettings(this.g)),
    ];
  }
  enter(): void { this.g.audio.playMusic(musicFor('title')); }
  update(dt: number): void {
    this.t += dt;
    const w = this.world;
    // drive the attract-mode car: pick a free lane every so often
    if (Math.floor(this.t * 1.5) !== Math.floor((this.t - dt) * 1.5)) {
      const next = w.nextInLane();
      if (next && next.z < 45) {
        const lanes = Array.from({ length: w.lanes }, (_, i) => i).filter((l) => Math.abs(l - w.player.lane) <= 1 && l !== w.player.lane);
        const free = lanes.find((l) => !w.trafficAhead(60, l, 0.6).length);
        if (free !== undefined) w.player.lane = free;
      }
    }
    w.player.boosting = Math.floor(this.t / 3) % 2 === 0;
    w.update(dt);
    for (const b of this.buttons) b.update(dt);
  }
  render(): void {
    const r = this.g.r, g = this.g;
    this.world.render();
    // vignette + darkening so the logo reads
    r.fillRect(0, 0, r.w, Math.round(r.h * 0.5), P.black, 0.35);
    // logo block
    const cx = r.w / 2, ly = r.safeTop + 40;
    drawKanji(r, '車線', cx - 14, ly - 18, { size: 13, color: P.white, outline: P.black });
    const wob = Math.round(Math.sin(this.t * 2) * 1);
    r.text('CARLANE', cx + 2, ly + 2 + wob, { align: 'center', scale: 4, color: P.black });
    r.text('CARLANE', cx, ly + wob, { align: 'center', scale: 4, color: P.white, outline: P.black });
    // JDM stripe under the logo
    const sw = 120, sx = cx - sw / 2, sy = ly + 32;
    r.fillRect(sx, sy, sw, 2, P.red); r.fillRect(sx, sy + 2, sw, 2, P.white); r.fillRect(sx, sy + 4, sw, 2, P.blue);
    r.text('JDM ARCADE RACER', cx, sy + 9, { align: 'center', color: P.yellow, outline: P.black });
    // decorations
    drawSakuraBranch(r, -6, r.safeTop + 16);
    drawSakuraBranch(r, r.w - 42, r.safeTop + 16, true);
    drawChecker(r, 0, r.safeTop, r.w, 3, 3, P.white, P.black);
    // tap hint
    if (Math.floor(this.t * 2) % 2 === 0) r.text(t('tapStart'), cx, r.h - r.safeBottom - 54, { align: 'center', color: P.white, outline: P.black, shadow: P.red });
    // coins + footer
    drawCoins(r, r.w - 6, r.safeTop + 5, g.save.coins, 'right');
    drawDeco(r, 'trophy', 6, r.safeTop + 4, 1, P.yellow);
    r.text(String(g.save.totalStars), 18, r.safeTop + 5, { color: P.yellow, outline: P.black });
    for (const b of this.buttons) b.draw(r);
    r.text('EST. 2026 · JDM · TUNING · LIFESTYLE', cx, r.h - r.safeBottom - 40, { align: 'center', color: P.gray1, outline: P.black });
    drawToasts(r, 1 / 60);
  }
  onPointer(ev: PointerEv): void {
    for (const b of this.buttons) if (b.handle(ev, this.g)) return;
    if (ev.kind === 'down' && ev.y < this.g.r.h - this.g.r.safeBottom - 40) { this.g.audio.sfx('select'); void goMap(this.g); }
    void this.tapArea;
  }
  onBack(): boolean { return true; }
}
