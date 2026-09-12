import type { Screen, PointerEv } from '../core/types';
import type { Game } from '../core/Game';
import type { PlayScreen } from './PlayScreen';
import { P, mix } from '../core/Palette';
import { t, L } from '../core/i18n';
import { Button, drawBezel, drawDeco } from './widgets';
import { getAbilityDef } from '../content/abilities';
import { Ease } from '../core/Tween';

type Step = 'swipe' | 'boost' | 'ability' | 'done';

/** One-time first-run tutorial: explains swipe, boost and the ability, waiting for each action. */
export class TutorialOverlay implements Screen {
  overlay = true;
  private step: Step = 'swipe';
  private phase: 'card' | 'wait' = 'card';
  private t = 0;
  private skipBtn: Button;
  private okBtn: Button;
  constructor(private g: Game, private ps: PlayScreen) {
    const r = g.r;
    this.skipBtn = new Button({ x: r.w - 58, y: r.safeTop + 30, w: 52, h: 14 }, t('skip'), { color: P.gray3, style: 'ghost', onTap: () => this.finish() });
    this.okBtn = new Button({ x: r.w / 2 - 40, y: r.h / 2 + 30, w: 80, h: 20 }, t('ok'), { color: P.green, onTap: () => this.startWait() });
  }
  enter(): void {
    this.ps.world.frozen = true;
    this.ps.onAction = (a) => this.onAction(a);
  }
  exit(): void {
    this.ps.world.frozen = false;
    this.ps.onAction = null;
    this.g.save.markTutorial('play');
  }
  private finish(): void { this.g.pop(); }
  private startWait(): void {
    this.phase = 'wait';
    this.t = 0;
    this.ps.world.frozen = false;
    this.g.audio.sfx('ui');
  }
  private onAction(a: 'swipe' | 'boost' | 'ability'): void {
    if (this.phase !== 'wait') return;
    if (a !== this.step) return;
    this.g.audio.sfx('powerup');
    this.g.haptics.success();
    this.step = this.step === 'swipe' ? 'boost' : this.step === 'boost' ? 'ability' : 'done';
    this.phase = this.step === 'done' ? 'wait' : 'card';
    this.t = 0;
    if (this.step === 'done') { this.ps.world.frozen = false; }
    else this.ps.world.frozen = true;
  }
  update(dt: number): void {
    this.t += dt;
    this.skipBtn.update(dt);
    this.okBtn.update(dt);
    if (this.step === 'done' && this.t > 1.2) this.finish();
  }
  render(): void {
    const r = this.g.r;
    if (this.step === 'done') {
      const a = Math.min(1, this.t * 3);
      r.text(t('tutorialDone'), r.w / 2, r.h * 0.4, { align: 'center', scale: 3, color: P.green, outline: P.black, alpha: 1 - Math.max(0, this.t - 0.8) / 0.4, wave: 2, t: this.t });
      void a;
      return;
    }
    if (this.phase === 'card') this.drawCard();
    else this.drawHint();
    this.skipBtn.draw(r);
  }
  private texts(): { title: string; sub: string; icon: string; color: string } {
    if (this.step === 'swipe') return { title: t('swipeStep'), sub: t('swipeStepSub'), icon: 'dpad', color: P.cyan };
    if (this.step === 'boost') return { title: t('boostStep'), sub: t('boostStepSub'), icon: 'play', color: P.orange };
    const ab = getAbilityDef(this.ps.vehicle.ability);
    return { title: t('abilityStep'), sub: L(ab.name), icon: 'star', color: ab.color };
  }
  private drawCard(): void {
    const r = this.g.r;
    const info = this.texts();
    r.fillRect(0, 0, r.w, r.h, P.black, 0.72);
    const w = Math.min(196, r.w - 20), x = (r.w - w) / 2;
    const y = r.h / 2 - 64 - (1 - Ease.outBack(Math.min(1, this.t * 4))) * 20;
    drawBezel(r, x, y, w, 116, P.ink);
    r.text(info.title, r.w / 2, y + 14, { align: 'center', color: info.color, scale: 2 });
    r.text(info.sub, r.w / 2, y + 34, { align: 'center', color: P.white, wrap: w - 24, lineHeight: 9 });
    // animated hand demo
    const cy = y + 62;
    if (this.step === 'swipe') {
      const k = (Math.sin(this.t * 3) + 1) / 2;
      const hx = x + 30 + k * (w - 84);
      r.fillRect(x + 24, cy + 8, w - 48, 2, P.gray3);
      drawHand(r, hx, cy, P.white);
      r.text('←', x + 18, cy + 4, { color: P.cyan, scale: 2 });
      r.text('→', x + w - 26, cy + 4, { color: P.cyan, scale: 2 });
    } else if (this.step === 'boost') {
      const pulse = Math.floor(this.t * 4) % 2 === 0;
      drawHand(r, r.w / 2, cy + (pulse ? 2 : 0), P.white);
      r.ring(r.w / 2, cy + 4, 12 + (pulse ? 3 : 0), P.orange, 1, pulse ? 0.9 : 0.4);
      for (let i = 0; i < 5; i++) r.fillRect(r.w / 2 - 16 + i * 8, cy + 20, 2, 6 + (i % 2) * 4, mix(P.orange, P.yellow, i / 5));
    } else {
      const pulse = Math.floor(this.t * 3) % 2 === 0;
      const b = this.ps.abilityBtn;
      r.disc(r.w / 2, cy + 4, 14, info.color);
      drawHand(r, r.w / 2 + 8, cy + 6, P.white);
      if (pulse) r.ring(r.w / 2, cy + 4, 18, info.color, 1, 0.7);
      void b;
    }
    this.okBtn.rect.y = y + 88;
    this.okBtn.draw(r);
  }
  private drawHint(): void {
    const r = this.g.r;
    const info = this.texts();
    // compact top banner so the road stays visible
    const bw = Math.min(190, r.w - 20), bx = (r.w - bw) / 2, by = r.safeTop + 52;
    r.fillRect(bx, by, bw, 22, P.black, 0.8);
    r.strokeRect(bx, by, bw, 22, info.color);
    r.text(info.title, r.w / 2, by + 4, { align: 'center', color: info.color });
    r.text(info.sub, r.w / 2, by + 13, { align: 'center', color: P.white });
    // arrow pointing at the ability button during the ability step
    if (this.step === 'ability') {
      const b = this.ps.abilityBtn;
      const bob = Math.round(Math.sin(this.t * 6) * 2);
      drawDeco(r, 'chevron', b.x + b.w / 2 - 5, b.y - 16 + bob, 1, info.color);
      r.ring(b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 3 + (Math.floor(this.t * 4) % 2), info.color, 1, 0.9);
    }
    if (this.step === 'swipe') {
      const k = (Math.sin(this.t * 3) + 1) / 2;
      drawHand(r, 40 + k * (r.w - 80), r.h - r.safeBottom - 90, P.white);
    }
  }
  onPointer(ev: PointerEv): void {
    if (this.skipBtn.handle(ev, this.g)) return;
    if (this.phase === 'card' && this.okBtn.handle(ev, this.g)) return;
  }
  onBack(): boolean { this.finish(); return true; }
}

function drawHand(r: import('../core/Renderer').Renderer, x: number, y: number, color: string): void {
  const rows = ['..##....', '.#..#...', '.#..#.##', '.#..#.##', '.#......', '.#......', '..#####.', '...####.'];
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') r.fillRect(Math.round(x) - 4 + i, Math.round(y) - 4 + j, 1, 1, color); });
  r.fillRect(Math.round(x) - 5, Math.round(y) - 5, 1, 1, P.black);
}
