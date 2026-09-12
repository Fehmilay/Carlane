import type { Screen, PointerEv, Lang } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';
import { t, setLang } from '../core/i18n';
import { Button, Toggle, drawHeader, drawPanel, drawConsoleBar, toast, drawToasts, dialog } from './widgets';
import { goTitle } from './nav';
import { restore } from '../services/Store';

/** Options: audio, haptics, handedness, language, restore purchases, resets. */
export class SettingsScreen implements Screen {
  private toggles: Toggle[] = [];
  private buttons: Button[] = [];
  private langBtns: Button[] = [];
  constructor(private g: Game) { this.build(); }
  private build(): void {
    const g = this.g, r = g.r, s = g.save.data.settings;
    const x = 16, w = r.w - 32;
    let y = r.safeTop + 34;
    const row = () => { const rr = { x, y, w, h: 18 }; y += 22; return rr; };
    this.toggles = [
      new Toggle(row(), t('sound'), s.sound, (v) => { s.sound = v; g.audio.enabled = v; g.save.save(); }),
      new Toggle(row(), t('music'), s.music, (v) => { s.music = v; g.audio.setMusicEnabled(v); g.save.save(); }),
      new Toggle(row(), t('haptics'), s.haptics, (v) => { s.haptics = v; g.haptics.enabled = v; g.save.save(); }),
      new Toggle(row(), t('lefty'), s.lefty, (v) => { s.lefty = v; g.save.save(); }),
    ];
    y += 10;
    const langY = y; y += 24;
    const lw = (w - 8) / 3;
    const langs: (Lang | 'auto')[] = ['auto', 'de', 'en'];
    this.langBtns = langs.map((l, i) => new Button({ x: x + i * (lw + 4), y: langY, w: lw, h: 18 }, l === 'auto' ? t('auto') : l.toUpperCase(), {
      color: s.lang === l ? P.red : P.gray3,
      onTap: () => { s.lang = l; setLang(l); g.save.save(); this.build(); },
    }));
    this.buttons = [
      new Button({ x, y, w, h: 20 }, t('restore'), { color: P.blue, onTap: () => void this.doRestore() }),
      new Button({ x, y: y + 24, w, h: 20 }, t('resetTutorial'), { color: P.gray3, onTap: () => { g.save.data.tutorialsSeen = {}; g.save.save(); toast(t('ok'), P.green); } }),
      new Button({ x, y: y + 48, w, h: 20 }, t('resetProgress'), { color: P.redDark, onTap: () => dialog(g, t('resetProgress'), t('resetSure'), [
        { label: t('no'), color: P.gray3, onTap: () => {} },
        { label: t('yes'), color: P.red, onTap: () => { g.save.reset(); toast(t('ok'), P.green); } },
      ]) }),
      new Button({ x, y: y + 76, w: 70, h: 18 }, t('back'), { color: P.gray3, style: 'ghost', onTap: () => void goTitle(g) }),
    ];
  }
  private async doRestore(): Promise<void> {
    const n = await restore(this.g);
    toast(n > 0 ? t('restored', { n }) : t('nothingRestored'), n > 0 ? P.green : P.gray1);
  }
  update(dt: number): void { for (const b of [...this.buttons, ...this.langBtns]) b.update(dt); }
  render(): void {
    const r = this.g.r;
    r.clear(P.black);
    for (let y = 0; y < r.h; y += 4) r.fillRect(0, y, r.w, 2, P.ink);
    drawHeader(r, t('settings'), { coins: this.g.save.coins });
    drawPanel(r, { x: 10, y: r.safeTop + 28, w: r.w - 20, h: 100 }, { color: P.gray3 });
    for (const tg of this.toggles) tg.draw(r);
    r.text(t('language'), 16, this.langBtns[0].rect.y - 10, { color: P.gray1 });
    for (const b of this.langBtns) b.draw(r);
    for (const b of this.buttons) b.draw(r);
    r.text(t('credits'), r.w / 2, r.h - r.safeBottom - 36, { align: 'center', color: P.gray2 });
    drawConsoleBar(r, { hearts: 3, center: '車は夢を追う' });
    drawToasts(r, 1 / 60);
  }
  onPointer(ev: PointerEv): void {
    for (const tg of this.toggles) if (tg.handle(ev, this.g)) return;
    for (const b of [...this.langBtns, ...this.buttons]) if (b.handle(ev, this.g)) return;
  }
  onBack(): boolean { void goTitle(this.g); return true; }
}
