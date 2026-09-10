import type { PointerEv } from './types';
import type { Renderer } from './Renderer';

export interface GestureState {
  /** -1 left, +1 right, consumed by consumeSwipe() */
  swipe: number;
  holding: boolean;
  holdTime: number;
  /** tap position (game px), consumed by consumeTap() */
  tap: { x: number; y: number } | null;
  /** current pointer position while down */
  x: number;
  y: number;
  down: boolean;
}

const SWIPE_PX = 18;
const SWIPE_MS = 350;
const HOLD_MS = 140;

/**
 * Pointer + keyboard input. Emits raw pointer events (game coords) to the active screen and
 * also recognizes gameplay gestures (swipe / hold / tap) for the Play screen.
 */
export class Input {
  readonly g: GestureState = { swipe: 0, holding: false, holdTime: 0, tap: null, x: 0, y: 0, down: false };
  keys = new Set<string>();
  /** regions where a pointer-down must NOT start a hold/boost (HUD buttons). set by Play screen */
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private swiped = false;
  private activeId = -1;
  private keyHold = false;
  onPointer: ((ev: PointerEv) => void) | null = null;
  onKey: ((code: string, down: boolean) => void) | null = null;
  /** Optional guard: return true to suppress gesture recognition for this pointer-down. */
  gestureGuard: ((x: number, y: number) => boolean) | null = null;
  private guarded = false;

  constructor(private r: Renderer) {
    const el = r.display;
    const opts: AddEventListenerOptions = { passive: false };
    el.addEventListener('pointerdown', (e) => this.pd(e), opts);
    el.addEventListener('pointermove', (e) => this.pm(e), opts);
    el.addEventListener('pointerup', (e) => this.pu(e, 'up'), opts);
    el.addEventListener('pointercancel', (e) => this.pu(e, 'cancel'), opts);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.g.swipe = -1;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.g.swipe = 1;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { this.keyHold = true; e.preventDefault(); }
      this.onKey?.(e.code, true);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.keyHold = false;
      this.onKey?.(e.code, false);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.keyHold = false; this.g.holding = false; this.g.down = false; });
  }

  private ev(e: PointerEvent, kind: PointerEv['kind']): PointerEv {
    const p = this.r.toGame(e.clientX, e.clientY);
    return { kind, x: p.x, y: p.y, id: e.pointerId, t: performance.now() };
  }

  private pd(e: PointerEvent) {
    e.preventDefault();
    try { this.r.display.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const ev = this.ev(e, 'down');
    this.onPointer?.(ev);
    if (this.activeId !== -1) return; // ignore multi-touch for gestures
    this.activeId = e.pointerId;
    this.startX = ev.x; this.startY = ev.y; this.startT = ev.t;
    this.swiped = false;
    this.guarded = this.gestureGuard ? this.gestureGuard(ev.x, ev.y) : false;
    this.g.down = true; this.g.x = ev.x; this.g.y = ev.y; this.g.holdTime = 0;
  }
  private pm(e: PointerEvent) {
    e.preventDefault();
    const ev = this.ev(e, 'move');
    this.onPointer?.(ev);
    if (e.pointerId !== this.activeId) return;
    this.g.x = ev.x; this.g.y = ev.y;
    if (this.guarded || this.swiped) return;
    const dx = ev.x - this.startX, dy = ev.y - this.startY;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.2 && ev.t - this.startT < SWIPE_MS) {
      this.g.swipe = dx > 0 ? 1 : -1;
      this.swiped = true;
      // allow a second swipe without lifting: reset origin
      this.startX = ev.x; this.startY = ev.y; this.startT = ev.t;
      this.swiped = false;
    }
  }
  private pu(e: PointerEvent, kind: 'up' | 'cancel') {
    e.preventDefault();
    const ev = this.ev(e, kind);
    this.onPointer?.(ev);
    if (e.pointerId !== this.activeId) return;
    const dt = ev.t - this.startT;
    const moved = Math.hypot(ev.x - this.startX, ev.y - this.startY);
    if (kind === 'up' && !this.guarded && !this.swiped && dt < HOLD_MS + 60 && moved < 10) this.g.tap = { x: ev.x, y: ev.y };
    this.activeId = -1;
    this.g.down = false; this.g.holding = false; this.g.holdTime = 0;
  }

  /** Called once per frame by the game loop. */
  update(dt: number): void {
    if (this.g.down && !this.guarded) {
      this.g.holdTime += dt * 1000;
      this.g.holding = this.g.holdTime >= HOLD_MS;
    }
    if (this.keyHold) this.g.holding = true;
  }
  consumeSwipe(): number { const s = this.g.swipe; this.g.swipe = 0; return s; }
  consumeTap(): { x: number; y: number } | null { const t = this.g.tap; this.g.tap = null; return t; }
  get holding(): boolean { return this.g.holding; }
  /** Drop any pending gesture (e.g. when a screen changes). */
  reset(): void { this.g.swipe = 0; this.g.tap = null; this.g.holding = false; this.g.down = false; this.activeId = -1; this.keyHold = false; }
}
