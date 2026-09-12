import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { Button, drawBezel, drawStars, drawChecker, toast, drawToasts } from './widgets';
import { goMap, startLevel, pushShop } from './nav';
import { useRevive } from '../services/Store';
import { getCity } from '../content/cities';
import { drawFlag } from '../content/flags';
import { LEVELS } from '../content/levels';
import { Ease } from '../core/Tween';
import { musicFor } from '../content/music';

const REVIVE_SECONDS = 10;

/** Finish / game-over panel with animated counters, stars and the revive offer. */
export class ResultsOverlay implements Screen {
  overlay = true;
  private t = 0;
  private buttons: Button[] = [];
  private stars = 0;
  private record = false;
  private counted = { score: 0, dist: 0, kills: 0, coins: 0 };
  private reviveT = REVIVE_SECONDS;
  private offering: boolean;
  private awarded = false;
  private rewardCoins = 0;
  constructor(private g: Game, private ps: PlayScreen, private won: boolean) {
    this.offering = !won;
    this.award();
    this.build();
  }
  private award(): void {
    if (this.awarded) return;
    this.awarded = true;
    const g = this.g, w = this.ps.world, lvl = this.ps.level;
    g.save.addCoins(w.coinsCollected);
    g.save.data.stats.kills += w.kills;
    g.save.data.stats.distance += Math.round(w.distance);
    if (w.score > g.save.data.stats.bestScore) { g.save.data.stats.bestScore = Math.floor(w.score); }
    if (this.won) {
      const prev = g.save.levelResult(lvl.id);
      this.stars = w.score >= lvl.stars[2] ? 3 : w.score >= lvl.stars[1] ? 2 : w.score >= lvl.stars[0] ? 1 : 1;
      this.record = w.score > prev.best;
      if (!prev.done) { this.rewardCoins = lvl.reward; g.save.addCoins(lvl.reward); }
      g.save.setLevelResult(lvl.id, this.stars, Math.floor(w.score));
    }
    g.save.save();
  }
  private build(): void {
    const g = this.g, r = g.r;
    const w = Math.min(212, r.w - 16), x = (r.w - w) / 2;
    const y = this.panelY;
    this.buttons = [];
    if (this.offering) {
      const canRevive = g.save.data.revives > 0;
      this.buttons.push(new Button({ x: x + 12, y: y + 118, w: w - 24, h: 24 }, canRevive ? `${t('reviveCta')} (${g.save.data.revives})` : t('reviveBuy'), {
        color: canRevive ? P.green : P.purple,
        onTap: () => {
          if (g.save.data.revives > 0 && useRevive(g)) { this.ps.revive(); g.pop(); }
          else void pushShop(g);
        },
      }));
      this.buttons.push(new Button({ x: x + 12, y: y + 146, w: w - 24, h: 18 }, t('no'), { color: P.gray3, style: 'ghost', onTap: () => { this.offering = false; this.build(); } }));
      return;
    }
    const bw = (w - 28) / 2;
    const nextId = this.won ? Math.min(LEVELS.length, this.ps.level.id + 1) : this.ps.level.id;
    this.buttons.push(new Button({ x: x + 12, y: y + 120, w: w - 24, h: 22 }, this.won ? t('nextLevel') : t('retry'), {
      color: P.red, onTap: () => void startLevel(g, this.won ? nextId : this.ps.level.id),
    }));
    this.buttons.push(new Button({ x: x + 12, y: y + 146, w: bw, h: 18 }, t('retry'), { color: P.orange, onTap: () => void startLevel(g, this.ps.level.id) }));
    this.buttons.push(new Button({ x: x + 16 + bw, y: y + 146, w: bw, h: 18 }, t('toMap'), { color: P.blue, onTap: () => void goMap(g) }));
  }
  private get panelY(): number { return this.g.r.h / 2 - 92; }
  enter(): void { this.g.audio.playMusic(musicFor(this.won ? 'results' : 'gameover')); }
  update(dt: number): void {
    this.t += dt;
    const w = this.ps.world;
    const k = Math.min(1, this.t / 1.2);
    this.counted.score = Math.floor(w.score * Ease.outCubic(k));
    this.counted.dist = Math.floor(w.distance * Ease.outCubic(k));
    this.counted.kills = Math.floor(w.kills * Ease.outCubic(k));
    this.counted.coins = Math.floor(w.coinsCollected * Ease.outCubic(k));
    if (this.offering) {
      this.reviveT -= dt;
      if (this.reviveT <= 0) { this.offering = false; this.build(); }
      if (this.g.save.data.revives > 0 !== (this.buttons[0]?.color === P.green)) this.build();
    }
    for (const b of this.buttons) b.update(dt);
  }
  render(): void {
    const r = this.g.r, w = this.ps.world;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.72);
    const pw = Math.min(212, r.w - 16), x = (r.w - pw) / 2;
    const y = this.panelY - (1 - Ease.outBack(Math.min(1, this.t * 3))) * 24;
    drawBezel(r, x, y, pw, 176, P.ink);
    drawChecker(r, x + 6, y + 6, pw - 12, 4, 4, this.won ? P.white : P.red, P.black);
    const title = this.won ? t('finish') : t('gameover');
    r.text(title, r.w / 2, y + 16, { align: 'center', color: this.won ? P.yellow : P.red, scale: 2, outline: P.black });
    const city = getCity(this.ps.level.city);
    const cw = 12 + r.textWidth(L(city.name).toUpperCase());
    drawFlag(r, city.countryCode, r.w / 2 - cw / 2, y + 30, 1);
    r.text(L(city.name).toUpperCase(), r.w / 2 - cw / 2 + 12, y + 30, { color: P.gray1 });
    if (this.won) drawStars(r, r.w / 2, y + 48, this.stars, 3, 1.6, this.t);
    if (this.offering) {
      r.text(t('reviveOffer'), r.w / 2, y + 46, { align: 'center', color: P.white });
      // countdown ring
      const p = Math.max(0, this.reviveT / REVIVE_SECONDS);
      r.ring(r.w / 2, y + 80, 14, P.gray3, 1);
      const n = Math.round(40 * p);
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / 40) * Math.PI * 2; r.fillRect(r.w / 2 + Math.cos(a) * 14, y + 80 + Math.sin(a) * 14, 2, 2, P.green); }
      r.text(String(Math.ceil(this.reviveT)), r.w / 2, y + 77, { align: 'center', color: P.white, scale: 2 });
    } else {
      const ly = y + 62;
      const row = (i: number, label: string, value: string, col: string) => {
        r.text(label, x + 14, ly + i * 12, { color: P.gray1 });
        r.text(value, x + pw - 14, ly + i * 12, { align: 'right', color: col });
      };
      row(0, t('score'), String(this.counted.score), P.white);
      row(1, t('distance'), `${Math.round(this.counted.dist)} M`, P.cyan);
      row(2, t('wrecks'), String(this.counted.kills), P.orange);
      row(3, t('coins'), `${this.counted.coins}${this.rewardCoins ? ` +${this.rewardCoins}` : ''}`, P.yellow);
      if (this.record && this.t > 1.2 && r.frame % 24 < 14) r.text(t('newRecord'), r.w / 2, y + 110, { align: 'center', color: P.pinkLight, outline: P.black });
    }
    for (const b of this.buttons) b.draw(r);
    drawToasts(r, 1 / 60);
    void w;
  }
  onPointer(ev: PointerEv): void { for (const b of this.buttons) if (b.handle(ev, this.g)) return; }
  onBack(): boolean { void goMap(this.g); return true; }
}
void toast; void mix;
