import type { Screen, PointerEv, LevelDef, VehicleDef, Rect } from '../core/types';
import { inRect } from '../core/types';
import type { Game } from '../core/Game';
import { P } from '../core/Palette';
import { World } from '../game/World';
import { t, L } from '../core/i18n';
import { getAbilityDef } from '../content/abilities';
import { drawAbilityButton, drawHud } from '../game/Hud';

export type PlayPhase = 'countdown' | 'play' | 'dead' | 'finished';

/**
 * The gameplay screen: owns a World, translates gestures into player actions and draws the HUD.
 * Overlays (pause, results, revive, tutorial) are pushed on top by the screen itself.
 */
export class PlayScreen implements Screen {
  world: World;
  phase: PlayPhase = 'countdown';
  countdown = 3.2;
  phaseT = 0;
  abilityBtn: Rect = { x: 0, y: 0, w: 44, h: 44 };
  pauseBtn: Rect = { x: 0, y: 0, w: 20, h: 20 };
  private boostSfx = false;
  revived = 0;
  /** DEV: auto-activate the ability whenever it is ready, starting after N seconds (screenshots). */
  autoAbility = 0;
  /** DEV: hold boost permanently (screenshots). */
  autoBoost = false;
  /** hook set by the tutorial to intercept gestures */
  onAction: ((a: 'swipe' | 'boost' | 'ability') => void) | null = null;
  constructor(public g: Game, public level: LevelDef, public vehicle: VehicleDef) {
    this.world = new World(g, level, vehicle, Date.now() & 0xffff);
    this.layout();
    this.world.on('finish', () => this.finish());
    this.world.on('dead', () => this.die());
    g.input.gestureGuard = (x, y) => inRect(this.abilityBtn, x, y) || inRect(this.pauseBtn, x, y);
  }
  layout(): void {
    const r = this.g.r;
    const lefty = this.g.save.data.settings.lefty;
    this.abilityBtn = { x: lefty ? 10 : r.w - 54, y: r.h - r.safeBottom - 62, w: 44, h: 44 };
    this.pauseBtn = { x: r.w - 24, y: r.safeTop + 6, w: 20, h: 20 };
  }
  enter(): void {
    this.g.audio.playMusic(this.world.city.music);
    this.g.save.data.stats.runs++;
    void this.showTutorials();
  }
  /** First-run tutorial + one-time ability card (overlays freeze the world while shown). */
  private async showTutorials(): Promise<void> {
    const s = this.g.save;
    const abKey = 'ability_' + this.vehicle.ability;
    const needAbility = !s.tutorialSeen(abKey) && !s.tutorialSeen('__all');
    const needPlay = !s.tutorialSeen('play') && !s.tutorialSeen('__all');
    const showPlay = async () => {
      if (!needPlay) return;
      const m = await import('./TutorialOverlay');
      this.g.push(new m.TutorialOverlay(this.g, this));
    };
    if (needAbility) {
      const m = await import('./AbilityCardOverlay');
      // the ability card comes first; the driving tutorial follows once it is dismissed
      this.g.push(new m.AbilityCardOverlay(this.g, this, this.vehicle, () => void showPlay()));
      return;
    }
    await showPlay();
  }
  exit(): void { this.g.input.gestureGuard = null; this.g.audio.engine(0, false, false); }

  private finish(): void {
    this.phase = 'finished';
    this.phaseT = 0;
    this.g.audio.sfx('finish');
    this.g.haptics.success();
  }
  private die(): void {
    this.phase = 'dead';
    this.phaseT = 0;
    this.g.audio.sfx('gameover');
  }
  /** Revive after death: restores HP, clears nearby traffic. */
  revive(): void {
    const w = this.world;
    w.player.dead = false;
    w.player.hp = w.player.maxHp;
    w.player.invuln = 2.5;
    for (const tr of w.traffic) if (tr.z < 60) tr.state = 'wreck';
    this.phase = 'play';
    this.revived++;
    this.g.audio.duck(1);
    this.g.audio.sfx('powerup');
  }

  update(dt: number): void {
    const g = this.g, w = this.world, inp = g.input;
    this.phaseT += dt;
    if (this.phase === 'countdown') {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const cur = Math.ceil(this.countdown);
      if (cur !== prev && cur > 0) g.audio.sfx('countdown');
      if (this.countdown <= 0) { this.phase = 'play'; g.audio.sfx('go'); }
      inp.consumeSwipe(); inp.consumeTap();
      w.update(dt * 0.0); // keep effects alive
      return;
    }
    if (this.phase === 'play') {
      const sw = inp.consumeSwipe();
      if (sw !== 0 && !w.frozen) { if (w.player.moveLane(sw)) { g.audio.sfx('swipe'); g.haptics.tick(); } this.onAction?.('swipe'); }
      const boosting = (inp.holding || this.autoBoost) && !w.frozen && !w.finished && !w.player.overheated;
      if (this.autoAbility > 0 && w.time >= this.autoAbility && w.ability.ready) this.tryAbility();
      if (boosting && !w.player.boosting) { g.audio.sfx('boostStart'); this.onAction?.('boost'); }
      if (!boosting && w.player.boosting) g.audio.sfx('boostEnd');
      w.player.boosting = boosting;
      const tap = inp.consumeTap();
      if (tap && !w.frozen) {
        if (inRect(this.pauseBtn, tap.x, tap.y)) { this.pause(); return; }
        else this.tryAbility();
      }
      if (inp.keys.has('KeyX') || inp.keys.has('Enter')) { inp.keys.delete('KeyX'); inp.keys.delete('Enter'); this.tryAbility(); }
      if (inp.keys.has('Escape')) { inp.keys.delete('Escape'); this.pause(); return; }
      g.audio.engine(Math.min(1, w.player.speed / 80), w.player.boosting, true);
      w.update(dt);
      if (w.finished && w.finishT > 1.2 && this.phase === 'play') this.showResults();
      return;
    }
    if (this.phase === 'dead') {
      w.player.boosting = false;
      g.audio.engine(0, false, false);
      w.update(dt);
      if (this.phaseT > 1.4) this.showGameOver();
      return;
    }
    if (this.phase === 'finished') { w.player.boosting = false; w.update(dt); }
  }

  tryAbility(): void {
    const w = this.world;
    if (w.ability.activate()) { this.g.audio.sfx('ability'); this.g.haptics.impact('Medium'); this.onAction?.('ability'); }
    else this.g.audio.sfx('error');
  }

  onPointer(ev: PointerEv): void {
    if (ev.kind !== 'down' || this.phase !== 'play' || this.world.frozen) return;
    if (inRect(this.abilityBtn, ev.x, ev.y)) { this.tryAbility(); return; }
    if (inRect(this.pauseBtn, ev.x, ev.y)) { this.pause(); return; }
    // instant abilities also fire on a plain tap anywhere (handled via consumeTap in update)
  }
  onBack(): boolean { if (this.phase === 'play') { this.pause(); return true; } return false; }
  onHide(): void { this.pause(); }

  pause(): void {
    if (this.phase !== 'play') return;
    this.world.player.boosting = false;
    this.g.audio.engine(0, false, false);
    void import('./PauseOverlay').then((m) => this.g.push(new m.PauseOverlay(this.g, this)));
  }
  showResults(): void {
    this.phase = 'finished';
    void import('./ResultsOverlay').then((m) => this.g.push(new m.ResultsOverlay(this.g, this, true)));
  }
  showGameOver(): void {
    this.phaseT = -999;
    void import('./ResultsOverlay').then((m) => this.g.push(new m.ResultsOverlay(this.g, this, false)));
  }

  render(): void {
    const r = this.g.r, w = this.world;
    w.render();
    // speed lines while boosting
    if (w.player.boosting && this.phase === 'play') {
      for (let i = 0; i < 8; i++) {
        const y = ((r.frame * 9 + i * 67) % (r.h - w.road.hy)) + w.road.hy;
        const x = i % 2 ? 4 + (i * 13) % 20 : r.w - 6 - (i * 11) % 20;
        r.fillRect(x, y, 1, 10 + (i % 3) * 6, P.white, 0.5);
      }
    }
    drawHud(this.g, this);
    drawAbilityButton(this.g, this);
    if (this.phase === 'countdown') {
      const n = Math.ceil(this.countdown);
      const label = n > 0 ? String(n) : t('go');
      const sc = 4 + (1 - (this.countdown - Math.floor(this.countdown))) * 0.001;
      r.text(label, r.w / 2, r.h * 0.38, { align: 'center', scale: Math.round(sc), color: n > 0 ? P.yellow : P.green, outline: P.black });
      if (this.countdown > 2.4) r.text(L(this.level.name).toUpperCase(), r.w / 2, r.h * 0.38 + 40, { align: 'center', color: P.white, outline: P.black });
    }
    if (w.finished && this.phase !== 'dead' && w.finishT < 1.5) r.text(t('finish'), r.w / 2, r.h * 0.35, { align: 'center', scale: 3, color: P.yellow, outline: P.black, wave: 2, t: w.finishT });
    if (this.phase === 'dead' && this.phaseT > 0.4) r.text(t('gameover'), r.w / 2, r.h * 0.35, { align: 'center', scale: 3, color: P.red, outline: P.black });
    // ability def name flash on activate
    const ab = w.ability;
    if (ab.active && ab.activeT > 0.85) r.text(L(getAbilityDef(ab.id).name), r.w / 2, r.h * 0.5, { align: 'center', scale: 2, color: getAbilityDef(ab.id).color, outline: P.black });
  }
}
