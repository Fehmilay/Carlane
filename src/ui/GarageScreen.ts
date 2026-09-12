import type { Screen, PointerEv, VehicleDef, Rect } from '../core/types';
import { inRect } from '../core/types';
import type { Game } from '../core/Game';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { VEHICLES, getVehicle } from '../content/vehicles';
import { sideSprite } from '../content/vehicleSprites';
import { getAbilityDef } from '../content/abilities';
import { drawIcon } from '../content/icons';
import { getCity } from '../content/cities';
import { drawFlag } from '../content/flags';
import { canUnlock, unlockVehicle } from '../services/Store';
import { Button, ScrollList, drawHeader, drawCard, drawCardLock, drawConsoleBar, drawStatBar, drawKanji, drawDeco, drawCoins, toast, drawToasts, dialog, drawSakuraBranch, drawChecker } from './widgets';
import { goTitle, goMap, goShop } from './nav';
import { Ease } from '../core/Tween';
import { musicFor } from '../content/music';

const DETAIL_H = 206;
const COLS = 2;
const CARD_W = 104;
const CARD_H = 62;
const GAP = 6;

/** Car collection in the style of the reference sheet, with a slide-up detail panel. */
export class GarageScreen implements Screen {
  private list: ScrollList;
  private top = 0;
  private detail: VehicleDef | null = null;
  private detailT = 0;
  private buttons: Button[] = [];
  private tabBtns: Button[] = [];
  private t = 0;
  private gridRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  constructor(private g: Game) {
    const r = g.r;
    this.top = r.safeTop + 22;
    const rows = Math.ceil(VEHICLES.length / COLS);
    const viewH = r.h - this.top - 30 - r.safeBottom;
    this.list = new ScrollList(viewH, rows * (CARD_H + GAP) + 10);
    this.gridRect = { x: 0, y: this.top, w: r.w, h: viewH };
    const open = new URLSearchParams(location.hash.slice(1)).get('open');
    if (open) { const v = VEHICLES.find((x) => x.id === open); if (v) this.openDetail(v); }
    this.buildTabs();
  }
  enter(): void { this.g.audio.playMusic(musicFor('garage')); }
  private buildTabs(): void {
    const r = this.g.r;
    const labels = [t('garage'), t('map'), t('shop')];
    const acts = [() => {}, () => void goMap(this.g), () => void goShop(this.g)];
    let x = 4;
    this.tabBtns = labels.map((lb, i) => {
      const w = r.textWidth(lb) + 10;
      const b = new Button({ x, y: r.safeTop + 4, w, h: 13 }, lb, { color: i === 0 ? P.red : P.dark, onTap: acts[i], style: 'pill' });
      x += w + 3;
      return b;
    });
  }
  private cardRect(i: number): Rect {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = Math.round((this.g.r.w - (COLS * CARD_W + (COLS - 1) * GAP)) / 2) + col * (CARD_W + GAP);
    return { x, y: this.top + 4 + row * (CARD_H + GAP) - this.list.offset, w: CARD_W, h: CARD_H };
  }
  private openDetail(v: VehicleDef): void {
    this.detail = v;
    this.detailT = 0;
    this.buildDetailButtons();
  }
  private buildDetailButtons(): void {
    const g = this.g, r = g.r, v = this.detail;
    this.buttons = [];
    if (!v) return;
    const h = DETAIL_H;
    const y = r.h - r.safeBottom - 26 - h;
    const bw = r.w - 32;
    const selected = g.save.data.selectedVehicle === v.id;
    const unlocked = g.save.isUnlocked(v.id);
    const c = canUnlock(g, v);
    const by = y + h - 24;
    if (unlocked) {
      this.buttons.push(new Button({ x: 16, y: by, w: bw - 60, h: 20 }, selected ? t('selected') : t('select'), {
        color: selected ? P.gray3 : P.green,
        onTap: () => { if (!selected) { g.save.select(v.id); g.audio.sfx('select'); toast(L(v.name) + ' ' + t('selected'), P.green); } },
      }));
      this.buttons.push(new Button({ x: 16 + bw - 56, y: by, w: 56, h: 20 }, t('drive'), { color: P.red, onTap: () => { g.save.select(v.id); void goMap(g); } }));
    } else if (v.unlock.type === 'iap') {
      this.buttons.push(new Button({ x: 16, y: by, w: bw, h: 20 }, t('premium'), { color: P.purple, onTap: () => void goShop(g) }));
    } else if (c.ok) {
      this.buttons.push(new Button({ x: 16, y: by, w: bw, h: 20 }, `${t('unlock')}  ${c.cost}`, {
        color: P.yellow, onTap: () => { if (unlockVehicle(g, v)) { toast(t('unlocked'), P.yellow); this.buildDetailButtons(); } },
      }));
    } else if (c.reason === 'coins') {
      this.buttons.push(new Button({ x: 16, y: by, w: bw, h: 20 }, `${c.cost} ¢`, {
        color: P.gray3,
        onTap: () => dialog(g, t('notEnough'), t('needCoins', { n: c.need }), [
          { label: t('cancel'), color: P.gray3, onTap: () => {} },
          { label: t('toShop'), color: P.purple, onTap: () => void goShop(g) },
        ]),
      }));
    } else {
      const label = c.reason === 'level' ? t('requiresLevel', { n: c.need }) : t('requiresStars', { n: c.need });
      const b = new Button({ x: 16, y: by, w: bw, h: 20 }, label, { color: P.gray3, onTap: () => {} });
      b.disabled = true;
      this.buttons.push(b);
    }
  }
  update(dt: number): void {
    this.t += dt;
    if (!this.detail) this.list.update(dt);
    else this.detailT = Math.min(1, this.detailT + dt * 5);
    for (const b of [...this.buttons, ...this.tabBtns]) b.update(dt);
  }
  render(): void {
    const r = this.g.r, g = this.g;
    r.clear(P.black);
    // backdrop: dark grid + kanji columns
    for (let y = 0; y < r.h; y += 6) r.fillRect(0, y, r.w, 1, P.ink);
    drawKanji(r, '日本の伝説', 1, this.top + 30, { size: 9, vertical: true, color: mix(P.gray3, P.red, 0.4) });
    drawKanji(r, '夢', r.w - 10, this.top + 34, { size: 9, vertical: true, color: mix(P.gray3, P.red, 0.4) });
    // grid
    r.clip(this.gridRect);
    for (let i = 0; i < VEHICLES.length; i++) {
      const rect = this.cardRect(i);
      if (rect.y > this.gridRect.y + this.gridRect.h || rect.y + rect.h < this.gridRect.y) continue;
      this.drawVehicleCard(VEHICLES[i], rect);
    }
    r.unclip();
    // scroll shadow
    r.fillRect(0, this.top, r.w, 2, P.black, 0.6);
    drawHeader(r, t('garage'), { coins: g.save.coins, stars: g.save.totalStars });
    for (const b of this.tabBtns) b.draw(r);
    drawConsoleBar(r, { hearts: 3, center: `${g.save.data.unlocked.length}/${VEHICLES.length}` });
    if (this.detail) this.drawDetail();
    drawToasts(r, 1 / 60);
  }
  private drawVehicleCard(v: VehicleDef, rect: Rect): void {
    const r = this.g.r, g = this.g;
    const unlocked = g.save.isUnlocked(v.id);
    const selected = g.save.data.selectedVehicle === v.id;
    const cls = v.cls === 'tank' ? P.green : v.cls === 'heavy' ? P.orange : v.cls === 'special' ? P.purple : P.blue;
    const city = getCity(v.city ?? 'tokyo');
    const art = drawCard(r, rect, { num: v.num, title: L(v.name).toUpperCase().slice(0, 12), badge: v.brand, selected, locked: !unlocked, accent: cls, bg: mix(P.dark, cls, 0.12) });
    // backdrop decoration per home city
    r.clip(art);
    const pal = city.palettes.night ?? city.palettes.day;
    r.fillRect(art.x, art.y, art.w, art.h, mix(pal.nearSky, P.black, 0.35));
    for (let i = 0; i < 6; i++) { const bx = art.x + 4 + i * 17, bh = 10 + ((v.num * 7 + i * 5) % 4) * 5; r.fillRect(bx, art.y + art.h - bh, 12, bh, mix(pal.farSky, P.black, 0.3)); for (let wy = art.y + art.h - bh + 2; wy < art.y + art.h - 2; wy += 4) r.fillRect(bx + 2, wy, 2, 2, pal.glow); }
    if (v.city && ['tokyo', 'osaka', 'kyoto', 'nagoya', 'fukuoka'].includes(v.city)) { drawSakuraBranch(r, art.x + art.w - 30, art.y - 2, true); }
    // car
    const spr = sideSprite(v);
    const sc = Math.min(1, (art.w - 8) / spr.w);
    r.sprite(spr, art.x + art.w / 2, art.y + art.h - 3, { scale: sc, alpha: unlocked ? 1 : 0.55 });
    r.unclip();
    if (!unlocked) drawCardLock(r, rect);
    // price / status line
    if (!unlocked) {
      const c = canUnlock(this.g, v);
      const label = v.unlock.type === 'iap' ? t('premium') : c.ok || c.reason === 'coins' ? `${c.cost} ¢` : c.reason === 'level' ? `LV ${c.need}` : `${c.need} ★`;
      r.fillRect(rect.x + 1, rect.y + rect.h - 9, rect.w - 2, 8, P.black, 0.85);
      r.text(label, rect.x + rect.w / 2, rect.y + rect.h - 8, { align: 'center', color: v.unlock.type === 'iap' ? P.pinkLight : P.yellow });
    } else if (selected) {
      r.fillRect(rect.x + 1, rect.y + rect.h - 9, rect.w - 2, 8, P.red);
      r.text(t('selected'), rect.x + rect.w / 2, rect.y + rect.h - 8, { align: 'center', color: P.white });
    }
  }
  private drawDetail(): void {
    const r = this.g.r, v = this.detail!;
    const h = DETAIL_H;
    const slide = Ease.outCubic(this.detailT);
    const y = r.h - r.safeBottom - 26 - h * slide;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.55 * slide);
    r.clip({ x: 0, y, w: r.w, h: h + 40 });
    r.fillRect(0, y, r.w, h + 40, P.ink);
    for (let j = y + 3; j < y + h; j += 6) r.fillRect(0, j, r.w, 1, P.black, 0.35);
    r.fillRect(0, y, r.w, 1, P.red);
    drawChecker(r, 0, y + 1, r.w, 2, 2, P.white, P.black);
    const cls = v.cls === 'tank' ? P.green : v.cls === 'heavy' ? P.orange : v.cls === 'special' ? P.purple : P.blue;
    // header: number badge + name
    r.fillRect(6, y + 6, 22, 15, cls);
    r.text(String(v.num).padStart(2, '0'), 8, y + 9, { color: P.white, scale: 2 });
    r.text(L(v.name).toUpperCase(), 32, y + 7, { color: P.white, scale: 2 });
    r.text(v.cls.toUpperCase() + ' · ' + v.brand.toUpperCase(), 32, y + 24, { color: cls });
    const city = getCity(v.city ?? 'tokyo');
    drawFlag(r, city.countryCode, r.w - 16, y + 7, 1);
    r.text(L(city.name).toUpperCase(), r.w - 20, y + 8, { align: 'right', color: P.gray1 });
    // car with idle bob
    const spr = sideSprite(v);
    const sc = Math.max(0.8, Math.min(1.7, (r.w - 36) / spr.w, 52 / spr.h));
    const bob = Math.round(Math.sin(this.t * 3) * 1);
    const carY = y + 92 + bob;
    r.fillRect(Math.round(r.w / 2 - (spr.w * sc) / 2), carY, Math.round(spr.w * sc), 2, P.black, 0.45);
    r.sprite(spr, r.w / 2, carY, { scale: sc });
    // description
    r.text(L(v.desc), r.w / 2, y + 96, { align: 'center', color: P.gray1, wrap: r.w - 20, lineHeight: 9 });
    // stats (2 columns, short labels so nothing truncates)
    const sx = 10, sw = (r.w - 26) / 2, sy = y + 118;
    const st = v.stats;
    drawStatBar(r, sx, sy, sw, 'TEMPO', st.speed, 10, P.cyan);
    drawStatBar(r, sx, sy + 10, sw, 'BOOST', st.boost, 10, P.orange);
    drawStatBar(r, sx, sy + 20, sw, 'GRIP', st.handling, 10, P.green);
    drawStatBar(r, sx + sw + 6, sy, sw, 'HP', st.durability, 12, P.red);
    drawStatBar(r, sx + sw + 6, sy + 10, sw, 'KG', st.weight, 5, P.yellow);
    drawStatBar(r, sx + sw + 6, sy + 20, sw, 'CRUSH', v.crush ? 10 : 0, 10, P.purple);
    // ability strip (full width)
    const ab = getAbilityDef(v.ability);
    const ay = sy + 34;
    r.fillRect(8, ay, r.w - 16, 32, P.black);
    r.strokeRect(8, ay, r.w - 16, 32, mix(ab.color, P.black, 0.4));
    drawIcon(r, ab.icon, 11, ay + 4, ab.color);
    r.text(L(ab.name), 30, ay + 3, { color: ab.color });
    r.text(L(ab.desc), 30, ay + 12, { color: P.gray1, wrap: r.w - 48, lineHeight: 8 });
    for (const b of this.buttons) b.draw(r);
    r.unclip();
    drawDeco(r, 'chevron', r.w - 12, y + 4, 1, P.gray2);
  }

  onPointer(ev: PointerEv): void {
    const g = this.g;
    if (this.detail) {
      for (const b of this.buttons) if (b.handle(ev, g)) return;
      const y = g.r.h - g.r.safeBottom - 26 - DETAIL_H;
      if (ev.kind === 'down' && ev.y < y) { this.detail = null; this.buttons = []; g.audio.sfx('uiBack'); }
      return;
    }
    for (const b of this.tabBtns) if (b.handle(ev, g)) return;
    if (ev.y < this.top || ev.y > this.gridRect.y + this.gridRect.h) return;
    this.list.handle(ev);
    if (ev.kind === 'up' && this.list.tapped) {
      for (let i = 0; i < VEHICLES.length; i++) {
        if (inRect(this.cardRect(i), ev.x, ev.y)) { g.audio.sfx('ui'); this.openDetail(VEHICLES[i]); return; }
      }
    }
  }
  onBack(): boolean {
    if (this.detail) { this.detail = null; this.buttons = []; return true; }
    void goTitle(this.g);
    return true;
  }
}
void getVehicle;
