export const Ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => t * (2 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t: number) => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outBounce: (t: number) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  pulse: (t: number) => Math.sin(t * Math.PI),
};

/** Simple countdown timer. */
export class Timer {
  t = 0;
  constructor(public dur = 1) {}
  start(dur?: number): this { if (dur !== undefined) this.dur = dur; this.t = this.dur; return this; }
  update(dt: number): boolean { if (this.t > 0) { this.t -= dt; if (this.t <= 0) { this.t = 0; return true; } } return false; }
  get active(): boolean { return this.t > 0; }
  /** 0..1 progress (1 = done) */
  get p(): number { return this.dur > 0 ? 1 - this.t / this.dur : 1; }
}

/** Value tween helper: call update(dt) each frame, read .v */
export class Tween {
  v: number;
  private from = 0;
  private to = 0;
  private t = 0;
  private dur = 0;
  private ease: (t: number) => number = Ease.outQuad;
  constructor(v = 0) { this.v = v; this.from = v; this.to = v; }
  go(to: number, dur: number, ease = Ease.outQuad): this { this.from = this.v; this.to = to; this.dur = dur; this.t = 0; this.ease = ease; if (dur <= 0) this.v = to; return this; }
  set(v: number): this { this.v = v; this.from = v; this.to = v; this.dur = 0; return this; }
  update(dt: number): number {
    if (this.dur > 0 && this.t < this.dur) {
      this.t = Math.min(this.dur, this.t + dt);
      this.v = this.from + (this.to - this.from) * this.ease(this.t / this.dur);
    }
    return this.v;
  }
  get done(): boolean { return this.dur <= 0 || this.t >= this.dur; }
}
