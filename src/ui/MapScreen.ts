import type { Screen, PointerEv, LevelDef, Rect, MechanicId } from '../core/types';
import type { Game } from '../core/Game';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { LEVELS, getLevel } from '../content/levels';
import { getCity, drawSkyline } from '../content/cities';
import { drawFlag } from '../content/flags';
import { rearSprite } from '../content/vehicleSprites';
import { getVehicle } from '../content/vehicles';
import { Button, ScrollList, drawHeader, drawPanel, drawConsoleBar, drawStars, drawDeco, drawToasts, drawChecker } from './widgets';
import { goTitle, goGarage, goShop, startLevel } from './nav';
import { Ease } from '../core/Tween';
import { musicFor } from '../content/music';

const ROW_H = 58;

/** Mechanic → short tag label. */
const TAGS: Partial<Record<MechanicId, { de: string; en: string; c: string }>> = {
  rain: { de: 'REGEN', en: 'RAIN', c: P.blueLight }, snow: { de: 'SCHNEE', en: 'SNOW', c: P.white }, fog: { de: 'NEBEL', en: 'FOG', c: P.gray1 },
  night: { de: 'NACHT', en: 'NIGHT', c: P.purple }, ice: { de: 'EIS', en: 'ICE', c: P.cyan }, sandstorm: { de: 'SANDSTURM', en: 'SANDSTORM', c: P.tan },
  wind: { de: 'WIND', en: 'WIND', c: P.teal }, heat: { de: 'HITZE', en: 'HEAT', c: P.orange }, oncoming: { de: 'GEGENVERKEHR', en: 'ONCOMING', c: P.red },
  construction: { de: 'BAUSTELLE', en: 'ROADWORKS', c: P.orange }, tunnels: { de: 'TUNNEL', en: 'TUNNELS', c: P.gray2 }, bridge: { de: 'BRÜCKE', en: 'BRIDGE', c: P.blueLight },
  potholes: { de: 'SCHLAGLÖCHER', en: 'POTHOLES', c: P.brown }, oilslicks: { de: 'ÖL', en: 'OIL', c: P.purple }, police: { de: 'POLIZEI', en: 'POLICE', c: P.blue },
  trains: { de: 'BAHN', en: 'TRAINS', c: P.red }, boss_truck: { de: 'BOSS', en: 'BOSS', c: P.red }, boss_tank: { de: 'BOSS', en: 'BOSS', c: P.red }, boss_bus: { de: 'BOSS', en: 'BOSS', c: P.red },
  earthquake: { de: 'BEBEN', en: 'QUAKE', c: P.brown }, festival: { de: 'FEST', en: 'FESTIVAL', c: P.pink }, neon: { de: 'NEON', en: 'NEON', c: P.pinkLight },
  nitro_pads: { de: 'NITRO', en: 'NITRO', c: P.cyan }, toll: { de: 'MAUT', en: 'TOLL', c: P.yellow }, convoy: { de: 'KONVOI', en: 'CONVOY', c: P.gray1 },
  drawbridge: { de: 'ZUGBRÜCKE', en: 'DRAWBRIDGE', c: P.blueLight }, lava: { de: 'LAVA', en: 'LAVA', c: P.orange }, aurora: { de: 'POLARLICHT', en: 'AURORA', c: P.green },
  traffic_jam: { de: 'STAU', en: 'JAM', c: P.orange }, wrongway: { de: 'FALSCHFAHRER', en: 'WRONG WAY', c: P.red }, meteor: { de: 'METEOR', en: 'METEOR', c: P.orange },
  flood: { de: 'FLUT', en: 'FLOOD', c: P.blue }, speed_cameras: { de: 'BLITZER', en: 'CAMERAS', c: P.white }, blossom: { de: 'SAKURA', en: 'BLOSSOM', c: P.sakura },
  fireworks: { de: 'FEUERWERK', en: 'FIREWORKS', c: P.yellow }, monsoon: { de: 'MONSUN', en: 'MONSOON', c: P.blue }, curves: { de: 'KURVEN', en: 'CURVES', c: P.green },
  hills: { de: 'HÜGEL', en: 'HILLS', c: P.green },
};

/** World-tour level select: a scrolling list of city cards with skyline backdrops. */
export class MapScreen implements Screen {
  private list: ScrollList;
  private top = 0;
  private viewH = 0;
  private open: LevelDef | null = null;
  private openT = 0;
  private buttons: Button[] = [];
  private tabBtns: Button[] = [];
  private t = 0;
  constructor(private g: Game) {
    const r = g.r;
    this.top = r.safeTop + 22;
    this.viewH = r.h - this.top - 30 - r.safeBottom;
    this.list = new ScrollList(this.viewH, LEVELS.length * ROW_H + 12);
    const cur = g.save.maxLevel;
    this.list.scrollTo((cur - 1) * ROW_H - this.viewH / 2 + ROW_H);
    const q = new URLSearchParams(location.hash.slice(1)).get('open');
    if (q) this.openCard(getLevel(parseInt(q, 10) || 1));
    this.buildTabs();
  }
  enter(): void { this.g.audio.playMusic(musicFor('garage')); }
  private buildTabs(): void {
    const r = this.g.r;
    const labels = [t('garage'), t('map'), t('shop')];
    const acts = [() => void goGarage(this.g), () => {}, () => void goShop(this.g)];
    let x = 4;
    this.tabBtns = labels.map((lb, i) => {
      const w = r.textWidth(lb) + 10;
      const b = new Button({ x, y: r.safeTop + 4, w, h: 13 }, lb, { color: i === 1 ? P.red : P.dark, onTap: acts[i], style: 'pill' });
      x += w + 3;
      return b;
    });
  }
  private rowRect(i: number): Rect { return { x: 6, y: this.top + 6 + i * ROW_H - this.list.offset, w: this.g.r.w - 12, h: ROW_H - 6 }; }
  private unlocked(l: LevelDef): boolean { return l.id <= this.g.save.maxLevel; }
  private openCard(l: LevelDef): void {
    this.open = l;
    this.openT = 0;
    const g = this.g, r = g.r;
    const h = 132;
    const y = r.h - r.safeBottom - 26 - h;
    const w = r.w - 32;
    this.buttons = [];
    if (this.unlocked(l)) {
      this.buttons.push(new Button({ x: 16, y: y + h - 26, w: w - 62, h: 22 }, t('start'), { color: P.red, onTap: () => void startLevel(g, l.id) }));
      this.buttons.push(new Button({ x: 16 + w - 58, y: y + h - 26, w: 58, h: 22 }, t('garage'), { color: P.blue, onTap: () => void goGarage(g) }));
    } else {
      const b = new Button({ x: 16, y: y + h - 26, w, h: 22 }, t('locked'), { color: P.gray3, onTap: () => {} });
      b.disabled = true;
      this.buttons.push(b);
    }
  }
  update(dt: number): void {
    this.t += dt;
    if (!this.open) this.list.update(dt);
    else this.openT = Math.min(1, this.openT + dt * 5);
    for (const b of [...this.buttons, ...this.tabBtns]) b.update(dt);
  }
  render(): void {
    const r = this.g.r, g = this.g;
    r.clear(P.black);
    r.clip({ x: 0, y: this.top, w: r.w, h: this.viewH });
    for (let i = 0; i < LEVELS.length; i++) {
      const rect = this.rowRect(i);
      if (rect.y > this.top + this.viewH || rect.y + rect.h < this.top) continue;
      this.drawRow(LEVELS[i], rect);
    }
    r.unclip();
    drawHeader(r, t('worldTour'), { coins: g.save.coins, stars: g.save.totalStars });
    for (const b of this.tabBtns) b.draw(r);
    drawConsoleBar(r, { hearts: 3, center: `${g.save.maxLevel}/${LEVELS.length}` });
    if (this.open) this.drawCard();
    drawToasts(r, 1 / 60);
  }
  private drawRow(l: LevelDef, rect: Rect): void {
    const r = this.g.r, g = this.g;
    const city = getCity(l.city);
    const res = g.save.levelResult(l.id);
    const unlocked = this.unlocked(l);
    const current = l.id === g.save.maxLevel;
    // skyline backdrop
    r.clip(rect);
    const pal = city.palettes[l.timeOfDay] ?? city.palettes.day;
    r.bandedGradient(rect.x, rect.y, rect.w, rect.h, [pal.skyTop, pal.skyBottom], 6);
    drawSkyline(r, city, l.timeOfDay, -rect.y * 0.3, rect.y + rect.h - 6, this.t, 0);
    r.fillRect(rect.x, rect.y + rect.h - 6, rect.w, 6, pal.road);
    r.fillRect(rect.x, rect.y, rect.w, rect.h, P.black, unlocked ? 0.3 : 0.68);
    r.unclip();
    r.strokeRect(rect.x, rect.y, rect.w, rect.h, current ? P.red : unlocked ? P.gray2 : P.gray3);
    // number pin
    const pinC = !unlocked ? P.gray3 : res.done ? P.green : P.red;
    r.disc(rect.x + 16, rect.y + rect.h / 2, 11, P.black);
    r.disc(rect.x + 16, rect.y + rect.h / 2, 10, pinC);
    if (current && Math.floor(this.t * 2) % 2 === 0) r.ring(rect.x + 16, rect.y + rect.h / 2, 12, P.white, 1);
    r.text(String(l.id), rect.x + 16, rect.y + rect.h / 2 - 3, { align: 'center', color: P.white, outline: P.black, scale: l.id > 9 ? 1 : 1 });
    // texts
    drawFlag(r, city.countryCode, rect.x + 32, rect.y + 6, 1);
    r.text(L(city.name).toUpperCase(), rect.x + 44, rect.y + 6, { color: unlocked ? P.white : P.gray1, outline: P.black });
    const nameW = rect.w - 32 - 26;
    r.text(L(l.name).toUpperCase().slice(0, Math.floor(nameW / 6)), rect.x + 32, rect.y + 17, { color: unlocked ? P.yellow : P.gray2, outline: P.black });
    // tags
    let tx = rect.x + 32;
    for (const m of l.mechanics.slice(0, 3)) {
      const tag = TAGS[m];
      if (!tag) continue;
      const label = (L(tag) as unknown as string) || tag.en;
      const lw = r.textWidth(label) + 5;
      if (tx + lw > rect.x + rect.w - 40) break;
      r.fillRect(tx, rect.y + 28, lw, 9, P.black, 0.8);
      r.text(label, tx + 2, rect.y + 29, { color: unlocked ? tag.c : P.gray2 });
      tx += lw + 3;
    }
    // lanes + stars
    // lane count icon: n vertical bars
    const lx = rect.x + rect.w - 6 - l.lanes * 3;
    r.fillRect(lx - 2, rect.y + 4, l.lanes * 3 + 3, 10, P.black, 0.7);
    for (let i = 0; i < l.lanes; i++) r.fillRect(lx + i * 3, rect.y + 5, 2, 8, i === Math.floor(l.lanes / 2) ? P.yellow : P.gray1);
    if (unlocked) drawStars(r, rect.x + rect.w - 24, rect.y + rect.h - 10, res.stars, 3, 1);
    else drawDeco(r, 'lock', rect.x + rect.w - 28, rect.y + rect.h - 16, 1, P.gray1);
    if (current) {
      const spr = rearSprite(getVehicle(g.save.data.selectedVehicle));
      r.sprite(spr, rect.x + rect.w - 52, rect.y + rect.h - 4, { scale: 0.3 });
      const nl = t('newLabel');
      const nw = r.textWidth(nl) + 4;
      r.fillRect(rect.x + 30, rect.y + rect.h - 11, nw, 9, P.red);
      r.text(nl, rect.x + 32, rect.y + rect.h - 10, { color: P.white });
    }
  }
  private drawCard(): void {
    const r = this.g.r, g = this.g, l = this.open!;
    const city = getCity(l.city);
    const res = g.save.levelResult(l.id);
    const h = 132;
    const y = r.h - r.safeBottom - 26 - h * Ease.outCubic(this.openT);
    r.fillRect(0, 0, r.w, r.h, P.black, 0.6 * this.openT);
    r.clip({ x: 0, y, w: r.w, h: h + 40 });
    r.fillRect(0, y, r.w, h + 40, P.ink);
    const pal = city.palettes[l.timeOfDay] ?? city.palettes.day;
    r.bandedGradient(0, y + 3, r.w, 44, [pal.skyTop, pal.skyBottom], 6);
    drawSkyline(r, city, l.timeOfDay, Math.sin(this.t * 0.3) * 10, y + 47, this.t, 0);
    r.fillRect(0, y + 47, r.w, 2, pal.road);
    r.fillRect(0, y + 3, r.w, 46, P.black, 0.25);
    r.fillRect(0, y, r.w, 1, P.red);
    drawChecker(r, 0, y + 1, r.w, 2, 2, P.white, P.black);
    // title over the backdrop
    drawFlag(r, city.countryCode, 8, y + 8, 1);
    r.text(`${l.id}. ${L(city.name).toUpperCase()}`, 22, y + 7, { color: P.white, outline: P.black });
    r.text(L(l.name).toUpperCase(), 8, y + 20, { color: P.yellow, outline: P.black, scale: 1 });
    r.text(city.glyph ?? '', r.w - 8, y + 7, { align: 'right', color: P.white, outline: P.black });
    drawStars(r, r.w - 26, y + 40, res.stars, 3, 1, this.openT * 2);
    // info rows
    r.text(L(l.desc), 8, y + 54, { color: P.gray1, wrap: r.w - 16, lineHeight: 9 });
    const iy = y + 76;
    r.text(`${t('lanes')} ${l.lanes}`, 8, iy, { color: P.white });
    r.text(`${Math.round(l.length / 100) / 10} KM`, 78, iy, { color: P.white });
    r.text(`${t('reward')} ${l.reward}`, 130, iy, { color: P.yellow });
    r.text(`${t('best')} ${res.best}`, 8, iy + 10, { color: P.cyan });
    r.text(`★ ${l.stars[0]} / ${l.stars[1]} / ${l.stars[2]}`, 78, iy + 10, { color: P.gray1 });
    // tags
    let tx = 8;
    for (const m of l.mechanics) {
      const tag = TAGS[m];
      if (!tag) continue;
      const label = (L(tag) as unknown as string) || tag.en;
      const lw = r.textWidth(label) + 5;
      if (tx + lw > r.w - 8) break;
      r.fillRect(tx, iy + 22, lw, 9, mix(tag.c, P.black, 0.65));
      r.text(label, tx + 2, iy + 23, { color: tag.c });
      tx += lw + 3;
    }
    for (const b of this.buttons) b.draw(r);
    r.unclip();
  }
  onPointer(ev: PointerEv): void {
    const g = this.g;
    if (this.open) {
      for (const b of this.buttons) if (b.handle(ev, g)) return;
      const y = g.r.h - g.r.safeBottom - 26 - 132;
      if (ev.kind === 'down' && ev.y < y) { this.open = null; this.buttons = []; g.audio.sfx('uiBack'); }
      return;
    }
    for (const b of this.tabBtns) if (b.handle(ev, g)) return;
    if (ev.y < this.top || ev.y > this.top + this.viewH) return;
    this.list.handle(ev);
    if (ev.kind === 'up' && this.list.tapped) {
      for (let i = 0; i < LEVELS.length; i++) {
        const rect = this.rowRect(i);
        if (ev.x >= rect.x && ev.x < rect.x + rect.w && ev.y >= rect.y && ev.y < rect.y + rect.h) { g.audio.sfx('ui'); this.openCard(LEVELS[i]); return; }
      }
    }
  }
  onBack(): boolean {
    if (this.open) { this.open = null; this.buttons = []; return true; }
    void goTitle(this.g);
    return true;
  }
}
void drawPanel;
