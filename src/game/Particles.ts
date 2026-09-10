import type { Renderer } from '../core/Renderer';

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number; gravity: number;
  /** shrink toward end */
  shrink?: boolean;
  /** color sequence over life (overrides color) */
  colors?: string[];
  /** depth-scale (world particles scale with the road) */
  scale?: number;
  /** attached to world depth: z (meters), laneX — re-projected each frame if set */
  z?: number; laneX?: number; dz?: number;
  /** vertical offset in world (for depth-attached particles) */
  h?: number;
  alpha?: number;
}

/** Cheap screen-space particle pool. */
export class ParticleSystem {
  list: Particle[] = [];
  max = 600;
  spawn(p: Partial<Particle> & { x: number; y: number }): Particle {
    const q: Particle = { vx: 0, vy: 0, life: 0.5, maxLife: 0.5, color: '#ffffff', size: 1, gravity: 0, ...p, x: p.x, y: p.y };
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(q);
    return q;
  }
  burst(x: number, y: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number; angle?: number } = {}): void {
    const sp = opts.speed ?? 60, spread = opts.spread ?? Math.PI * 2, ang = opts.angle ?? -Math.PI / 2;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const v = sp * (0.3 + Math.random() * 0.9);
      const life = (opts.life ?? 0.5) * (0.6 + Math.random() * 0.7);
      this.spawn({ ...opts, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, maxLife: life });
    }
  }
  update(dt: number, project?: (laneX: number, z: number) => { x: number; y: number; s: number }): void {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l[i] = l[l.length - 1]; l.pop(); continue; }
      if (p.z !== undefined && project) {
        p.z += (p.dz ?? 0) * dt;
        p.h = (p.h ?? 0) + p.vy * dt;
        p.vy += p.gravity * dt;
        const pr = project(p.laneX ?? 0, p.z);
        p.x = pr.x + p.vx * (p.maxLife - p.life); p.y = pr.y - (p.h ?? 0) * pr.s; p.scale = pr.s;
      } else {
        p.vy += p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }
  }
  render(r: Renderer): void {
    const c = r.ctx;
    for (const p of this.list) {
      const t = 1 - p.life / p.maxLife;
      let size = p.size * (p.scale ?? 1);
      if (p.shrink) size *= 1 - t;
      const sz = Math.max(1, Math.round(size));
      const col = p.colors ? p.colors[Math.min(p.colors.length - 1, Math.floor(t * p.colors.length))] : p.color;
      if (p.alpha !== undefined) c.globalAlpha = p.alpha;
      c.fillStyle = col;
      c.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz / 2), sz, sz);
      if (p.alpha !== undefined) c.globalAlpha = 1;
    }
  }
  clear(): void { this.list.length = 0; }
}

/** Frame-animated procedural explosion drawn in screen space, scaled by depth. */
export interface Explosion { x: number; y: number; t: number; dur: number; size: number; kind: 'small' | 'big' | 'huge'; laneX?: number; z?: number; }

export const EXPLOSION_COLORS = ['#ffffff', '#ffe870', '#f0c020', '#f07020', '#e0202a', '#8a1018', '#3a3a48', '#23232f'];

export function drawExplosion(r: Renderer, e: Explosion, scale = 1): void {
  const p = e.t / e.dur;
  const R = e.size * scale;
  const c = r.ctx;
  // expanding ring + core
  if (p < 0.35) {
    const q = p / 0.35;
    r.disc(e.x, e.y, R * (0.3 + q * 0.9), q < 0.3 ? '#ffffff' : '#ffe870');
    r.disc(e.x, e.y, R * q * 0.7, '#f07020');
  } else if (p < 0.7) {
    const q = (p - 0.35) / 0.35;
    r.disc(e.x, e.y, R * (1.2 - q * 0.2), '#e0202a');
    r.disc(e.x, e.y, R * (0.9 - q * 0.3), '#f07020');
    r.disc(e.x, e.y, R * (0.5 - q * 0.4), '#ffe870');
    // chunky flame blobs around
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + e.t * 3;
      const d = R * (0.8 + q * 0.6);
      r.disc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.7 - q * R * 0.6, R * 0.35 * (1 - q), i % 2 ? '#f07020' : '#ffe870');
    }
  } else {
    const q = (p - 0.7) / 0.3;
    c.globalAlpha = 1 - q;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + e.t;
      const d = R * (0.6 + q * 1.2);
      r.disc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.5 - q * R * 1.5, R * 0.45 * (1 - q * 0.5), i % 2 ? '#3a3a48' : '#6a6a78');
    }
    c.globalAlpha = 1;
  }
}
