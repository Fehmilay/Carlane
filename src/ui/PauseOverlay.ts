import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { Button, Toggle, drawBezel, drawChecker, drawKanji } from './widgets';
import { getAbilityDef } from '../content/abilities';
import { drawIcon } from '../content/icons';
import { goMap, startLevel } from './nav';
import { Ease } from '../core/Tween';

/** Pause panel: resume / restart / map, quick audio toggles and an ability reminder. */
export class PauseOverlay implements Screen {
  overlay = true;
  private buttons: Button[] = [];
  private toggles: Toggle[] = [];
  private t = 0;
  constructor(private g: Game, private ps: PlayScreen) {
    const r = g.r;
    const w = Math.min(200, r.w - 24), x = (r.w - w) / 2;
    const y = r.h / 2 - 72;
    this.buttons = [
      new Button({ x: x + 12, y: y + 44, w: w - 24, h: 22 }, t('resume'), { color: P.green, onTap: () => g.pop() }),
      new Button({ x: x + 12, y: y + 70, w: (w - 28) / 2, h: 20 }, t('restart'), { color: P.orange, onTap: () => void startLevel(g, ps.level.id) }),
      new Button({ x: x + 16 + (w - 28) / 2, y: y + 70, w: (w - 28) / 2, h: 20 }, t('map'), { color: P.blue, onTap: () => void goMap(g) }),
    ];
    const s = g.save.data.settings;
    this.toggles = [
      new Toggle({ x: x + 12, y: y + 96, w: w - 24, h: 14 }, t('sound'), s.sound, (v) => { s.sound = v; g.audio.enabled = v; g.save.save(); }),
      new Toggle({ x: x + 12, y: y + 112, w: w - 24, h: 14 }, t('music'), s.music, (v) => { s.music = v; g.audio.setMusicEnabled(v); g.save.save(); }),
    ];
  }
  enter(): void { this.ps.world.frozen = true; }
  exit(): void { this.ps.world.frozen = false; }
  update(dt: number): void {
    this.t += dt;
    for (const b of this.buttons) b.update(dt);
    if (this.g.input.keys.has('Escape')) { this.g.input.keys.delete('Escape'); this.g.pop(); }
  }
  render(): void {
    const r = this.g.r, v = this.ps.vehicle;
    r.fillRect(0, 0, r.w, r.h, P.black, 0.7);
    const w = Math.min(200, r.w - 24), x = (r.w - w) / 2;
    const y = r.h / 2 - 72 - (1 - Ease.outBack(Math.min(1, this.t * 4))) * 16;
    drawBezel(r, x, y, w, 172, P.ink);
    drawChecker(r, x + 6, y + 6, w - 12, 3, 3, P.white, P.black);
    r.text(t('pause'), r.w / 2, y + 16, { align: 'center', color: P.white, scale: 2 });
    drawKanji(r, '休', x + 10, y + 14, { size: 10, color: mix(P.red, P.white, 0.2) });
    // ability reminder
    const ab = getAbilityDef(v.ability);
    r.fillRect(x + 12, y + 136, w - 24, 26, P.black);
    r.strokeRect(x + 12, y + 136, w - 24, 26, mix(ab.color, P.black, 0.4));
    drawIcon(r, ab.icon, x + 15, y + 140, ab.color);
    r.text(L(ab.name), x + 34, y + 139, { color: ab.color });
    r.text(L(ab.desc), x + 34, y + 148, { color: P.gray1, wrap: w - 52, lineHeight: 8 });
    for (const b of this.buttons) { b.draw(r); }
    for (const tg of this.toggles) tg.draw(r);
  }
  onPointer(ev: PointerEv): void {
    for (const b of this.buttons) if (b.handle(ev, this.g)) return;
    for (const tg of this.toggles) if (tg.handle(ev, this.g)) return;
  }
  onBack(): boolean { this.g.pop(); return true; }
}
