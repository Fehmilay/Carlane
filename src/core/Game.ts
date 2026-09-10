import type { Screen, PointerEv } from './types';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { Save } from './Save';
import { AudioEngine } from './Audio';
import { setLang } from './i18n';
import type { IAPService } from '../services/IAP';
import { Haptics } from '../services/Haptics';

const STEP = 1 / 60;

/**
 * Root object: owns services, the screen stack and the main loop.
 * Screens are pushed/replaced; overlay screens render on top of the screen below them.
 */
export class Game {
  readonly r: Renderer;
  readonly input: Input;
  readonly save = new Save();
  readonly audio = new AudioEngine();
  readonly haptics = new Haptics();
  iap!: IAPService;
  private stack: Screen[] = [];
  private acc = 0;
  private last = 0;
  private running = false;
  private fade = 0; // 1 = black
  private fadeDir = 0;
  private pending: (() => void) | null = null;
  /** wall-clock seconds since boot */
  t = 0;
  paused = false;

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
    this.input = new Input(this.r);
    this.input.onPointer = (ev) => this.pointer(ev);
    this.input.onKey = (code, down) => this.top?.onKey?.(code, down);
    window.addEventListener('resize', () => this.r.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.r.resize(), 50));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.top?.onHide?.(); this.paused = true; this.audio.suspend(); this.save.flush(); }
      else { this.paused = false; this.last = performance.now(); this.audio.resume(); }
    });
  }

  async init(iap: IAPService): Promise<void> {
    this.iap = iap;
    await this.save.init();
    setLang(this.save.data.settings.lang);
    this.audio.enabled = this.save.data.settings.sound;
    this.audio.musicEnabled = this.save.data.settings.music;
    this.haptics.enabled = this.save.data.settings.haptics;
    await this.iap.init().catch(() => { /* offline */ });
  }

  get top(): Screen | undefined { return this.stack[this.stack.length - 1]; }

  push(s: Screen): void { this.input.reset(); s.enter?.(); this.stack.push(s); }
  pop(): void { const s = this.stack.pop(); s?.exit?.(); this.input.reset(); }
  /** Replace the whole stack with one screen, with a quick fade. */
  goto(s: Screen, fade = true): void {
    const doIt = () => { for (const x of this.stack.splice(0)) x.exit?.(); this.push(s); };
    if (!fade) { doIt(); return; }
    this.pending = doIt;
    this.fadeDir = 1;
  }
  replaceTop(s: Screen): void { this.pop(); this.push(s); }

  private pointer(ev: PointerEv): void {
    if (ev.kind === 'down') this.audio.unlock();
    if (this.fadeDir !== 0) return;
    this.top?.onPointer?.(ev);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      if (this.paused) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.25) dt = 0.25;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.acc -= STEP;
        this.update(STEP);
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.render(dt);
    };
    requestAnimationFrame(loop);
  }

  private update(dt: number): void {
    this.t += dt;
    this.input.update(dt);
    // fade transitions
    if (this.fadeDir > 0) {
      this.fade = Math.min(1, this.fade + dt * 5);
      if (this.fade >= 1) { this.pending?.(); this.pending = null; this.fadeDir = -1; }
      return;
    } else if (this.fadeDir < 0) {
      this.fade = Math.max(0, this.fade - dt * 4);
      if (this.fade <= 0) this.fadeDir = 0;
    }
    this.top?.update(dt);
    this.audio.update(dt);
  }

  private render(dt: number): void {
    const r = this.r;
    r.begin(dt);
    // find the lowest non-overlay screen, render it and all overlays above
    let i = this.stack.length - 1;
    while (i > 0 && this.stack[i].overlay) i--;
    for (; i < this.stack.length; i++) this.stack[i].render();
    if (this.fade > 0) r.fillRect(0, 0, r.w, r.h, '#0b0b12', this.fade);
    r.end();
  }
}
