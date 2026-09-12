import type { Screen, PointerEv, ProductId, Rect } from '../core/types';
import type { Game } from '../core/Game';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { Button, ScrollList, drawHeader, drawConsoleBar, drawDeco, drawToasts, toast, drawChecker } from './widgets';
import { goTitle, goGarage, goMap } from './nav';
import { buy, restore, COIN_PACKS, REVIVE_PACKS } from '../services/Store';
import { VEHICLES } from '../content/vehicles';
import { sideSprite } from '../content/vehicleSprites';
import { musicFor } from '../content/music';

interface Item { id: ProductId; title: string; sub: string; color: string; icon: string; ribbon?: string; cars?: string[]; }

/** In-app purchase store: revives, coin packs and bundles. */
export class ShopScreen implements Screen {
  private list: ScrollList;
  private top = 0;
  private viewH = 0;
  private buttons: Button[] = [];
  private tabBtns: Button[] = [];
  private busy: ProductId | null = null;
  private items: { item: Item; rect: Rect }[] = [];
  private t = 0;
  constructor(private g: Game, public asOverlay = false) {
    const r = g.r;
    this.top = r.safeTop + 22;
    this.viewH = r.h - this.top - 30 - r.safeBottom;
    this.list = new ScrollList(this.viewH, 0);
    this.build();
  }
  enter(): void { if (!this.asOverlay) this.g.audio.playMusic(musicFor('garage')); }
  private priceOf(id: ProductId): string { return this.g.iap.products().find((p) => p.id === id)?.price ?? '—'; }
  private build(): void {
    const g = this.g, r = g.r;
    const defs: { header: string; items: Item[] }[] = [
      { header: t('revivePack'), items: [
        { id: 'revive_3', title: '3 × ' + t('revive'), sub: `${t('revives')}: ${g.save.data.revives}`, color: P.red, icon: 'heart' },
        { id: 'revive_10', title: '10 × ' + t('revive'), sub: t('bestDeal'), color: P.red, icon: 'heart', ribbon: t('bestDeal') },
      ] },
      { header: t('coinPacks'), items: [
        { id: 'coins_s', title: `${COIN_PACKS.coins_s} ¢`, sub: '', color: P.yellow, icon: 'coin' },
        { id: 'coins_m', title: `${COIN_PACKS.coins_m} ¢`, sub: '+15% ' + t('bonus'), color: P.yellow, icon: 'coin' },
        { id: 'coins_l', title: `${COIN_PACKS.coins_l} ¢`, sub: '+30% ' + t('bonus'), color: P.orange, icon: 'coin' },
        { id: 'coins_xl', title: `${COIN_PACKS.coins_xl} ¢`, sub: '+60% ' + t('bonus'), color: P.orange, icon: 'coin', ribbon: t('bestDeal') },
      ] },
      { header: t('bundles'), items: [
        { id: 'tank_pack', title: t('tankPack'), sub: t('tankPackDesc'), color: P.green, icon: 'trophy', cars: ['leopard2', 'apc'] },
        { id: 'legend_pass', title: t('legendPass'), sub: t('legendPassDesc'), color: P.purple, icon: 'trophy', cars: ['volt_lini'] },
        { id: 'unlock_all', title: t('unlockAll'), sub: t('unlockAllDesc'), color: P.pink, icon: 'bag' },
      ] },
    ];
    this.items = [];
    this.buttons = [];
    let y = this.top + 8;
    this.headers = [];
    for (const sec of defs) {
      this.headers.push({ label: sec.header, y });
      y += 12;
      for (const it of sec.items) {
        const rect: Rect = { x: 8, y, w: r.w - 16, h: it.cars ? 42 : 30 };
        this.items.push({ item: it, rect });
        const owned = g.save.hasProduct(it.id);
        const b = new Button({ x: rect.x + rect.w - 60, y: 0, w: 54, h: 18 }, owned ? t('owned') : this.priceOf(it.id), {
          color: owned ? P.gray3 : it.color,
          onTap: () => void this.doBuy(it.id),
        });
        b.disabled = owned;
        this.buttons.push(b);
        y += rect.h + 6;
      }
      y += 6;
    }
    this.restoreBtn = new Button({ x: 8, y: 0, w: r.w - 16, h: 18 }, t('restore'), { color: P.blue, style: 'ghost', onTap: () => void this.doRestore() });
    this.restoreY = y;
    this.list.contentH = y + 60 - this.top;
    this.list.viewH = this.viewH;
    this.buildTabs();
  }
  private headers: { label: string; y: number }[] = [];
  private restoreBtn!: Button;
  private restoreY = 0;
  private buildTabs(): void {
    const r = this.g.r;
    const labels = [t('garage'), t('map'), t('shop')];
    const acts = [() => void goGarage(this.g), () => void goMap(this.g), () => {}];
    let x = 4;
    this.tabBtns = labels.map((lb, i) => {
      const w = r.textWidth(lb) + 10;
      const b = new Button({ x, y: r.safeTop + 4, w, h: 13 }, lb, { color: i === 2 ? P.red : P.dark, onTap: acts[i], style: 'pill' });
      x += w + 3;
      return b;
    });
  }
  private async doBuy(id: ProductId): Promise<void> {
    if (this.busy) return;
    this.busy = id;
    const ok = await buy(this.g, id);
    this.busy = null;
    if (ok) { toast(t('purchased'), P.green); this.build(); }
    else toast(t('purchaseFailed'), P.red);
  }
  private async doRestore(): Promise<void> {
    const n = await restore(this.g);
    toast(n > 0 ? t('restored', { n }) : t('nothingRestored'), n > 0 ? P.green : P.gray1);
    this.build();
  }
  update(dt: number): void {
    this.t += dt;
    this.list.update(dt);
    for (const b of [...this.buttons, ...this.tabBtns, this.restoreBtn]) b.update(dt);
  }
  render(): void {
    const r = this.g.r, g = this.g;
    r.clear(P.black);
    for (let y = 0; y < r.h; y += 6) r.fillRect(0, y, r.w, 1, P.ink);
    r.clip({ x: 0, y: this.top, w: r.w, h: this.viewH });
    const off = this.list.offset;
    for (const h of this.headers) {
      const y = h.y - off;
      r.text(h.label, 8, y, { color: P.gray1 });
      r.fillRect(8 + r.textWidth(h.label) + 4, y + 3, r.w - 16 - r.textWidth(h.label) - 4, 1, P.gray3);
    }
    this.items.forEach((entry, i) => {
      const rect = { ...entry.rect, y: entry.rect.y - off };
      const it = entry.item;
      if (rect.y > this.top + this.viewH || rect.y + rect.h < this.top) { this.buttons[i].hidden = true; return; }
      this.buttons[i].hidden = false;
      this.buttons[i].rect.y = rect.y + (rect.h - 18) / 2;
      r.fillRect(rect.x, rect.y, rect.w, rect.h, mix(P.dark, it.color, 0.12));
      r.strokeRect(rect.x, rect.y, rect.w, rect.h, mix(it.color, P.black, 0.4));
      drawDeco(r, it.icon, rect.x + 5, rect.y + 5, 1, it.color);
      r.text(it.title, rect.x + 20, rect.y + 5, { color: P.white });
      if (it.sub) r.text(it.sub, rect.x + 20, rect.y + 15, { color: P.gray1, wrap: rect.w - 86, lineHeight: 8 });
      if (it.cars) {
        let cx = rect.x + 20;
        for (const id of it.cars) {
          const v = VEHICLES.find((x) => x.id === id);
          if (!v) continue;
          const spr = sideSprite(v);
          r.sprite(spr, cx + 20, rect.y + rect.h - 3, { scale: 0.45 });
          cx += 42;
        }
      }
      if (it.ribbon) {
        const rw = r.textWidth(it.ribbon) + 6;
        r.fillRect(rect.x + rect.w - rw - 2, rect.y - 3, rw, 9, P.red);
        r.text(it.ribbon, rect.x + rect.w - rw + 1, rect.y - 2, { color: P.white });
      }
      if (this.busy === it.id) { r.fillRect(rect.x, rect.y, rect.w, rect.h, P.black, 0.7); r.text(t('processing'), rect.x + rect.w / 2, rect.y + rect.h / 2 - 3, { align: 'center', color: P.yellow }); }
      this.buttons[i].draw(r);
    });
    this.restoreBtn.rect.y = this.restoreY - off;
    this.restoreBtn.draw(r);
    r.text(t('legal'), r.w / 2, this.restoreY - off + 22, { align: 'center', color: P.gray2, wrap: r.w - 20, lineHeight: 8 });
    r.unclip();
    drawHeader(r, t('shop'), { coins: g.save.coins });
    for (const b of this.tabBtns) b.draw(r);
    drawChecker(r, 0, this.top - 2, r.w, 2, 2, P.red, P.black);
    drawConsoleBar(r, { hearts: 3, center: `♥ ${g.save.data.revives}` });
    drawToasts(r, 1 / 60);
  }
  onPointer(ev: PointerEv): void {
    const g = this.g;
    for (const b of this.tabBtns) if (b.handle(ev, g)) return;
    if (ev.y < this.top || ev.y > this.top + this.viewH) return;
    this.list.handle(ev);
    if (this.list.tapped) {
      for (const b of this.buttons) if (b.handle(ev, g)) return;
      if (this.restoreBtn.handle(ev, g)) return;
    }
  }
  onBack(): boolean {
    if (this.asOverlay) this.g.pop();
    else void goTitle(this.g);
    return true;
  }
}
void L;
