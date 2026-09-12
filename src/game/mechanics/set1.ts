import type { MechanicId } from '../../core/types';
import type { World, Hazard } from '../World';
import type { Mechanic } from '../Mechanic';
import { BaseMechanic } from '../Mechanic';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { mix } from '../../core/Palette';

// Set 1: atmosphere & visual mechanics — rain, snow, fog, night, ice, sandstorm, wind, heat, aurora, neon,
// blossom, fireworks, festival, monsoon, tunnels, bridge, curves, hills.

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** True while the player is on a hazard of `kind` (same lane, within 2 m). */
function onHazard(w: World, kind: string): Hazard | undefined {
  const pl = w.player;
  return w.hazards.find((h) => h.kind === kind && Math.abs(h.lane - pl.laneX) < 0.6 && Math.abs(h.z - PLAYER_Z) < 2.5);
}
/** Tail-light glow discs for traffic (night / rain). */
function tailGlow(w: World, alpha = 0.35): void {
  const r = w.game.r;
  for (const t of w.traffic) {
    if (t.state === 'wreck' || t.z < -1) continue;
    const p = w.road.project(t.laneX, t.z);
    const R = Math.max(1, Math.round(6 * p.s));
    r.disc(p.x - Math.round(t.tpl.sprite.w * 0.3 * p.s), p.y - 10 * p.s, R, '#e0202a', alpha);
    r.disc(p.x + Math.round(t.tpl.sprite.w * 0.3 * p.s), p.y - 10 * p.s, R, '#e0202a', alpha);
  }
}
/** Road reflection streaks below light sources (wet look). */
function wetRoad(w: World, strength = 0.35): void {
  const r = w.game.r;
  for (const t of w.traffic) {
    if (t.state === 'wreck' || t.z < 0) continue;
    const p = w.road.project(t.laneX, t.z);
    const len = Math.round(14 * p.s) + 2;
    r.fillRect(p.x - Math.round(t.tpl.sprite.w * 0.3 * p.s) - 1, p.y, 2, len, '#e0202a', strength);
    r.fillRect(p.x + Math.round(t.tpl.sprite.w * 0.3 * p.s) - 1, p.y, 2, len, '#e0202a', strength);
  }
  const pl = w.player.screen();
  r.fillRect(pl.x - 20, pl.y, 3, 18, '#e0202a', strength * 0.7); r.fillRect(pl.x + 17, pl.y, 3, 18, '#e0202a', strength * 0.7);
}

class Rain extends BaseMechanic {
  readonly id: MechanicId = 'rain';
  private flashT = 0;
  private nextFlash = 6;
  update(dt: number): void {
    const w = this.w, r = w.game.r;
    w.mod.grip *= 0.82;
    for (let i = 0; i < 6; i++) w.fxFront.spawn({ x: rnd(-20, r.w + 20), y: rnd(-10, r.h * 0.6), vx: -40, vy: 380, life: 0.9, maxLife: 0.9, color: '#c0f8ff', size: 1, gravity: 0, alpha: 0.6 });
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) { this.flashT = 0.25; this.nextFlash = rnd(5, 14); w.game.audio.sfx('explode'); }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT > 0.12) r.flash('#ffffff', 0.35); }
    w.mod.dark = Math.max(w.mod.dark, 0.15);
  }
  renderRoad(): void { wetRoad(this.w, 0.3); }
  renderFront(): void {
    const r = this.w.game.r;
    // splashes on the road near the player
    for (let i = 0; i < 6; i++) { const x = rnd(0, r.w), y = rnd(this.w.road.hy + 40, r.h); r.fillRect(x, y, 2, 1, '#c0f8ff', 0.5); }
    for (let i = 0; i < 14; i++) { const x = ((i * 41 + this.w.time * 220) % (r.w + 30)) - 15, y = ((i * 67 + this.w.time * 640) % (r.h + 20)) - 10; r.fillRect(x, y, 1, 7, '#c0f8ff', 0.45); }
  }
}

class Snow extends BaseMechanic {
  readonly id: MechanicId = 'snow';
  private iceDist = 120;
  update(dt: number): void {
    const w = this.w, r = w.game.r;
    w.mod.grip *= 0.78;
    for (let i = 0; i < 3; i++) w.fxFront.spawn({ x: rnd(-10, r.w + 10), y: -4, vx: rnd(-25, 15), vy: rnd(40, 70), life: 5, maxLife: 5, color: '#f4f4f0', size: rnd(1, 2.6), gravity: 0, alpha: 0.9 });
    if (w.distance + SPAWN_Z > this.iceDist) { w.spawnHazard('ice', Math.floor(rnd(0, w.lanes)), SPAWN_Z, 1); this.iceDist += rnd(60, 140); }
    if (onHazard(w, 'ice')) { w.mod.grip *= 0.35; if (Math.random() < 0.5) { const p = w.player.screen(); w.fx.spawn({ x: p.x + rnd(-16, 16), y: p.y, vx: rnd(-30, 30), vy: -20, life: 0.3, maxLife: 0.3, color: '#c0f8ff', size: 2, gravity: 60 }); } }
    void dt;
  }
  renderRoad(): void {
    // snow banks along the barriers
    const w = this.w, r = w.game.r, road = w.road;
    for (let y = road.hy + 2; y < r.h; y += 2) {
      const s = (y - road.hy) / road.roadH, cx = road.centerX(s), hw = road.halfW(s);
      const bw = Math.max(2, Math.round(10 * s));
      r.fillRect(cx - hw - bw - 4 * s, y, bw, 2, '#f4f4f0'); r.fillRect(cx + hw + 4 * s, y, bw, 2, '#f4f4f0');
    }
  }
}

class Fog extends BaseMechanic {
  readonly id: MechanicId = 'fog';
  update(): void { const w = this.w; w.mod.fog = Math.max(w.mod.fog, 0.62 + Math.sin(w.time * 0.4) * 0.15); }
  renderFront(): void {
    const w = this.w, r = w.game.r;
    for (let i = 0; i < 5; i++) { const x = ((i * 90 + w.time * 12) % (r.w + 120)) - 60; r.fillRect(x, w.road.hy - 10 + i * 6, 70, 4, w.pal.haze, 0.18); }
  }
}

class Night extends BaseMechanic {
  readonly id: MechanicId = 'night';
  update(): void { this.w.mod.dark = Math.max(this.w.mod.dark, 0.32); }
  renderRoad(): void {
    // headlight cone ahead of the player
    const w = this.w, road = w.road, pl = w.player;
    const p0 = road.project(pl.laneX, PLAYER_Z + 1), p1 = road.project(pl.laneX, PLAYER_Z + 60);
    const r = w.game.r;
    for (let y = Math.round(p1.y); y < Math.round(p0.y); y++) {
      const t = (p0.y - y) / (p0.y - p1.y);
      const x = p0.x + (p1.x - p0.x) * t;
      const hw = (1.2 - t * 0.7) * road.laneW * (p0.s + (p1.s - p0.s) * t) * 0.5;
      r.fillRect(x - hw, y, hw * 2, 1, '#ffe870', 0.14 * (1 - t));
    }
    tailGlow(w, 0.3);
  }
}

class Ice extends BaseMechanic {
  readonly id: MechanicId = 'ice';
  update(): void {
    const w = this.w;
    w.mod.grip *= 0.6;
    if (Math.random() < 0.3) { const r = w.game.r; w.fxFront.spawn({ x: rnd(0, r.w), y: rnd(w.road.hy, r.h), vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#ffffff', size: 1, gravity: 0 }); }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road;
    for (let y = road.hy + 4; y < r.h; y += 3) { const s = (y - road.hy) / road.roadH; r.fillRect(road.centerX(s) - road.halfW(s), y, road.halfW(s) * 2, 1, '#c0f8ff', 0.1); }
  }
}

class Sandstorm extends BaseMechanic {
  readonly id: MechanicId = 'sandstorm';
  private gust = 0;
  update(dt: number): void {
    const w = this.w, r = w.game.r;
    const g = 0.5 + 0.5 * Math.sin(w.time * 0.7);
    w.mod.fog = Math.max(w.mod.fog, 0.35 + g * 0.3);
    w.mod.tint = '#d0a060'; w.mod.tintA = Math.max(w.mod.tintA, 0.12 + g * 0.12);
    for (let i = 0; i < 8; i++) w.fxFront.spawn({ x: r.w + 10, y: rnd(0, r.h), vx: -rnd(250, 420), vy: rnd(-20, 20), life: 1, maxLife: 1, color: i % 2 ? '#e0c080' : '#d0a060', size: rnd(1, 2), gravity: 0, alpha: 0.6 });
    this.gust += dt;
    if (this.gust > 3) { this.gust = 0; w.player.laneX -= 0.18 * (0.5 + g); }
  }
}

class Wind extends BaseMechanic {
  readonly id: MechanicId = 'wind';
  private next = 4;
  private dir = 1;
  private gustT = 0;
  update(dt: number): void {
    const w = this.w, r = w.game.r;
    this.next -= dt;
    if (this.next <= 0) { this.next = rnd(5, 9); this.dir = Math.random() < 0.5 ? -1 : 1; this.gustT = 1.2; w.floatText(this.dir > 0 ? 'WIND →' : '← WIND', (w.lanes - 1) / 2, 40, '#c0f8ff', 2); w.game.audio.sfx('whoosh'); }
    if (this.gustT > 0) {
      this.gustT -= dt;
      w.player.laneX += this.dir * dt * 0.5;
      for (let i = 0; i < 4; i++) w.fxFront.spawn({ x: this.dir > 0 ? -5 : r.w + 5, y: rnd(w.road.hy - 40, r.h), vx: this.dir * rnd(200, 320), vy: rnd(-10, 10), life: 1, maxLife: 1, color: i % 2 ? '#20b040' : '#f4f4f0', size: 2, gravity: 0, alpha: 0.7 });
    }
  }
}

class Heat extends BaseMechanic {
  readonly id: MechanicId = 'heat';
  update(): void { const w = this.w; w.mod.tint = '#f07020'; w.mod.tintA = Math.max(w.mod.tintA, 0.06); }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road, t = w.time;
    // shimmer bands near the horizon + mirage puddle
    for (let y = road.hy + 2; y < road.hy + 30; y += 2) { const off = Math.round(Math.sin(t * 6 + y * 0.5) * 2); const s = (y - road.hy) / road.roadH; r.fillRect(road.centerX(s) - road.halfW(s) + off, y, road.halfW(s) * 2, 1, '#f4f4f0', 0.08); }
    const s = 0.2 + 0.05 * Math.sin(t); const y = road.yAt(s);
    r.fillRect(road.centerX(s) - road.halfW(s) * 0.5, y, road.halfW(s), 2, mix(w.pal.skyBottom, '#ffffff', 0.4), 0.5);
  }
}

class Aurora extends BaseMechanic {
  readonly id: MechanicId = 'aurora';
  update(): void {}
  renderBack(): void {
    const w = this.w, r = w.game.r, t = w.time;
    for (let x = 0; x < r.w; x += 3) {
      const h = 30 + Math.sin(x * 0.05 + t * 0.8) * 12 + Math.sin(x * 0.13 - t * 1.3) * 8;
      const y0 = 30 + Math.sin(x * 0.03 + t * 0.5) * 10;
      for (let i = 0; i < 4; i++) r.fillRect(x, y0 + i * (h / 4), 3, h / 4, i < 2 ? '#20b040' : i === 2 ? '#20c0b0' : '#8030c0', 0.22 - i * 0.04);
    }
  }
}

class Neon extends BaseMechanic {
  readonly id: MechanicId = 'neon';
  update(): void { const w = this.w; const p = Math.floor(w.time * 1.5) % 2; w.mod.tint = p ? '#40e0f0' : '#e04080'; w.mod.tintA = Math.max(w.mod.tintA, 0.05); }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road, t = w.time;
    const col = Math.floor(t * 2) % 2 ? '#40e0f0' : '#ff90c0';
    for (let y = road.hy + 2; y < r.h; y += 1) { const s = (y - road.hy) / road.roadH; const zz = road.scroll + 20 / s - 20; if (Math.floor(zz / 3) % 2) continue; const cx = road.centerX(s), hw = road.halfW(s); r.fillRect(cx - hw - 2, y, 1, 1, col); r.fillRect(cx + hw + 1, y, 1, 1, col); }
  }
}

class BlossomM extends BaseMechanic {
  readonly id: MechanicId = 'blossom';
  update(): void {
    const w = this.w, r = w.game.r;
    if (Math.random() < 0.5) w.fxFront.spawn({ x: rnd(-10, r.w + 10), y: rnd(-5, w.road.hy), vx: rnd(-30, -10), vy: rnd(20, 40), life: 5, maxLife: 5, colors: ['#ffb7d0', '#ff90c0'], size: 2, gravity: 6, alpha: 0.9 });
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road;
    for (let i = 0; i < 20; i++) { const s = 0.3 + ((i * 0.037 + road.scroll * 0.002) % 0.7); const y = road.yAt(s); const x = road.centerX(s) + ((i % 2 ? 1 : -1) * (road.halfW(s) - 6 * s - (i * 7) % 20 * s)); r.fillRect(x, y, Math.max(1, 2 * s), 1, '#ffb7d0', 0.8); }
  }
}

class FireworksM extends BaseMechanic {
  readonly id: MechanicId = 'fireworks';
  private next = 2;
  private bursts: { x: number; y: number; t: number; color: string }[] = [];
  update(dt: number): void {
    const w = this.w, r = w.game.r;
    this.next -= dt;
    if (this.next <= 0) { this.next = rnd(1.2, 3); this.bursts.push({ x: rnd(20, r.w - 20), y: rnd(20, w.road.hy - 60), t: 0, color: ['#ff90c0', '#ffe870', '#40e0f0', '#20b040', '#f07020'][Math.floor(rnd(0, 5))] }); w.game.audio.sfx('star'); }
    for (let i = this.bursts.length - 1; i >= 0; i--) { const b = this.bursts[i]; b.t += dt; if (b.t > 1.4) this.bursts.splice(i, 1); }
  }
  renderBack(): void {
    const r = this.w.game.r;
    for (const b of this.bursts) {
      const p = clamp(b.t / 1.2, 0, 1), R = 4 + p * 26;
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; r.fillRect(b.x + Math.cos(a) * R, b.y + Math.sin(a) * R + p * p * 14, 2, 2, i % 3 ? b.color : '#ffffff', 1 - p); }
      if (p < 0.3) r.disc(b.x, b.y, 3, '#ffffff', 1 - p * 3);
    }
  }
}

class Festival extends BaseMechanic {
  readonly id: MechanicId = 'festival';
  update(): void {
    const w = this.w, r = w.game.r;
    if (Math.random() < 0.4) w.fxFront.spawn({ x: rnd(0, r.w), y: -4, vx: rnd(-20, 20), vy: rnd(30, 60), life: 6, maxLife: 6, color: ['#ff90c0', '#ffe870', '#40e0f0', '#20b040', '#f07020'][Math.floor(rnd(0, 5))], size: 2, gravity: 5, alpha: 0.9 });
  }
  renderFront(): void {
    // strings of paper lanterns across the road at a few depths
    const w = this.w, road = w.road, r = w.game.r;
    for (let k = 0; k < 4; k++) {
      const z = ((k * 28 - road.scroll) % 110 + 110) % 110 + 4;
      const s = road.sAt(z), sc = s / road.sAt(PLAYER_Z);
      const y = road.yAt(s) - Math.round(70 * sc), cx = road.centerX(s), hw = road.halfW(s) + 8 * s;
      r.fillRect(cx - hw, y, hw * 2, 1, '#3a3a48');
      const n = Math.max(3, Math.round(hw / (12 * sc + 4)));
      for (let i = 0; i <= n; i++) { const x = cx - hw + (hw * 2 * i) / n, ly = y + Math.round(Math.sin(w.time * 3 + i) * 2 * sc); const lw = Math.max(2, Math.round(6 * sc)), lh = Math.max(2, Math.round(8 * sc)); r.fillRect(x - lw / 2, ly + 1, lw, lh, i % 2 ? '#e0202a' : '#ffe870'); r.fillRect(x - lw / 2 + 1, ly + 2, Math.max(1, lw - 2), Math.max(1, lh - 2), i % 2 ? '#f07020' : '#ffffff'); }
    }
  }
}

class Monsoon extends BaseMechanic {
  readonly id: MechanicId = 'monsoon';
  private rain = new Rain(this.w);
  private floodDist = 150;
  update(dt: number): void {
    const w = this.w;
    this.rain.update(dt);
    if (w.distance + SPAWN_Z > this.floodDist) { const l = Math.floor(rnd(0, w.lanes - 1)); w.spawnHazard('water', l, SPAWN_Z, 2); w.spawnHazard('water', l + 1, SPAWN_Z, 1); this.floodDist += rnd(90, 160); }
    if (onHazard(w, 'water')) { w.mod.speed *= 0.85; const p = w.player.screen(); for (let i = 0; i < 3; i++) w.fx.spawn({ x: p.x + rnd(-20, 20), y: p.y, vx: rnd(-40, 40), vy: -rnd(40, 90), life: 0.4, maxLife: 0.4, colors: ['#ffffff', '#40e0f0', '#2040e0'], size: 2, gravity: 200 }); }
  }
  renderRoad(): void { this.rain.renderRoad(); }
  renderFront(): void { this.rain.renderFront(); }
}

class Tunnels extends BaseMechanic {
  readonly id: MechanicId = 'tunnels';
  private nextStart = 250;
  private len = 220;
  private inside = 0; // 0..1
  update(dt: number): void {
    const w = this.w;
    const d = w.distance;
    const start = this.nextStart, end = start + this.len;
    const target = d > start && d < end ? 1 : 0;
    this.inside += (target - this.inside) * Math.min(1, dt * 3);
    if (d > end + 30) { this.nextStart = d + rnd(300, 600); this.len = rnd(150, 280); }
    w.mod.dark = Math.max(w.mod.dark, this.inside * 0.5);
    if (this.inside > 0.5) tailGlow(w, 0.25);
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road;
    const d = w.distance, start = this.nextStart, end = start + this.len;
    // tunnel mouth ahead (approaching) or exit
    const drawArch = (z: number, exit: boolean) => {
      if (z < -2 || z > SPAWN_Z) return;
      const s = road.sAt(z), cx = road.centerX(s), hw = road.halfW(s) + 6 * s, y = road.yAt(s);
      const h = Math.round(90 * s / road.sAt(PLAYER_Z));
      r.fillRect(cx - hw - 6 * s, y - h, hw * 2 + 12 * s, h, '#3a3a48');
      if (!exit) r.fillRect(cx - hw, y - h + 8 * s, hw * 2, h - 8 * s, '#0b0b12');
      else r.fillRect(cx - hw, y - h + 8 * s, hw * 2, h - 8 * s, w.pal.skyBottom);
      r.fillRect(cx - hw - 6 * s, y - h, hw * 2 + 12 * s, Math.max(1, 3 * s), '#f0c020');
    };
    if (this.inside < 0.5) drawArch(start - d, false);
    else {
      drawArch(end - d, true);
      // tunnel walls with lights flying past
      for (let y = road.hy + 1; y < r.h; y += 2) {
        const s = (y - road.hy) / road.roadH, cx = road.centerX(s), hw = road.halfW(s) + 6 * s;
        const wallH = Math.round(90 * s / road.sAt(PLAYER_Z));
        r.fillRect(cx - hw - 10 * s, y - wallH, 10 * s + 1, 2, '#23232f'); r.fillRect(cx + hw, y - wallH, 10 * s + 1, 2, '#23232f');
        const zz = road.scroll + 20 / s - 20;
        if (Math.floor(zz / 8) % 2 === 0 && y % 4 === 0) { r.fillRect(cx - hw - 4 * s, y - wallH + 4 * s, 3, 2, '#f07020'); r.fillRect(cx + hw + 2 * s, y - wallH + 4 * s, 3, 2, '#f07020'); }
      }
    }
  }
}

class Bridge extends BaseMechanic {
  readonly id: MechanicId = 'bridge';
  private nextStart = 200;
  private len = 300;
  update(): void { const w = this.w; if (w.distance > this.nextStart + this.len + 40) { this.nextStart = w.distance + rnd(300, 500); this.len = rnd(250, 400); } }
  private get on(): boolean { const d = this.w.distance; return d > this.nextStart && d < this.nextStart + this.len; }
  renderBack(): void {
    if (!this.on) return;
    const w = this.w, r = w.game.r;
    r.fillRect(0, w.road.hy - 8, r.w, 8, mix(w.pal.skyBottom, '#2040e0', 0.5));
    for (let i = 0; i < 12; i++) r.fillRect(((i * 41 + w.time * 20) % r.w), w.road.hy - 7 + (i % 3) * 2, 6, 1, '#f4f4f0', 0.6);
  }
  renderRoad(): void {
    if (!this.on) return;
    const w = this.w, r = w.game.r, road = w.road;
    // railings + cables on both sides
    for (let y = road.hy + 2; y < r.h; y += 2) {
      const s = (y - road.hy) / road.roadH, cx = road.centerX(s), hw = road.halfW(s) + 7 * s;
      const zz = road.scroll + 20 / s - 20;
      const post = Math.floor(zz / 6) % 2 === 0;
      const rh = Math.max(2, Math.round(16 * s / road.sAt(PLAYER_Z)));
      r.fillRect(cx - hw - 2, y - rh, 2, post ? rh : 1, '#a8a8b4'); r.fillRect(cx + hw, y - rh, 2, post ? rh : 1, '#a8a8b4');
      if (post && s > 0.2) { const ch = Math.round(rh * 6); r.fillRect(cx - hw - 3, y - rh - ch, 1, ch, '#d8d8e0', 0.7); r.fillRect(cx + hw + 2, y - rh - ch, 1, ch, '#d8d8e0', 0.7); }
    }
  }
}

class Curves extends BaseMechanic {
  readonly id: MechanicId = 'curves';
  private next = 100;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { const side = w.road.curve > 0 ? 0 : w.lanes - 1; w.spawnHazard('cone', side, SPAWN_Z, 1); this.next += rnd(70, 140); }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road;
    if (Math.abs(road.curve) < 0.15) return;
    // chevron arrows on the outside barrier
    const dir = road.curve > 0 ? 1 : -1;
    for (let k = 0; k < 5; k++) {
      const z = ((k * 22 - road.scroll) % 110 + 110) % 110 + 6;
      const s = road.sAt(z), cx = road.centerX(s), hw = road.halfW(s);
      const x = cx + dir * (hw + 10 * s), y = road.yAt(s) - 8 * s;
      const sz = Math.max(2, Math.round(6 * s));
      r.fillRect(x - sz, y - sz, sz * 2, sz * 2, '#f0c020'); r.text(dir > 0 ? '→' : '←', x, y - 3, { align: 'center', color: '#0b0b12', scale: 1 });
    }
  }
}

class Hills extends BaseMechanic {
  readonly id: MechanicId = 'hills';
  update(): void {
    const w = this.w, h = w.road.hill;
    w.mod.speed *= 1 - h * 0.08; // uphill (positive hill lifts horizon) slows a bit
    if (h < -0.4 && Math.random() < 0.2) { const p = w.player.screen(); w.fx.spawn({ x: p.x + rnd(-20, 20), y: p.y, vx: rnd(-10, 10), vy: -30, life: 0.5, maxLife: 0.5, color: '#f4f4f0', size: 2, gravity: 0, alpha: 0.5 }); }
  }
}

export const SET1: Partial<Record<MechanicId, (w: World) => Mechanic>> = {
  rain: (w) => new Rain(w), snow: (w) => new Snow(w), fog: (w) => new Fog(w), night: (w) => new Night(w), ice: (w) => new Ice(w),
  sandstorm: (w) => new Sandstorm(w), wind: (w) => new Wind(w), heat: (w) => new Heat(w), aurora: (w) => new Aurora(w), neon: (w) => new Neon(w),
  blossom: (w) => new BlossomM(w), fireworks: (w) => new FireworksM(w), festival: (w) => new Festival(w), monsoon: (w) => new Monsoon(w),
  tunnels: (w) => new Tunnels(w), bridge: (w) => new Bridge(w), curves: (w) => new Curves(w), hills: (w) => new Hills(w),
};
