import type { MechanicId } from '../../core/types';
import type { World, Hazard } from '../World';
import type { Mechanic } from '../Mechanic';
import { BaseMechanic } from '../Mechanic';
import type { Traffic, TrafficTemplate } from '../Traffic';
import { PLAYER_Z, SPAWN_Z } from '../Road';
import { trafficTemplate, trafficTemplates } from '../../content/vehicleSprites';
import { mix } from '../../core/Palette';

// Set 2: hazards, events and bosses — oncoming, construction, potholes, oilslicks, police, trains, boss_truck,
// boss_tank, boss_bus, earthquake, nitro_pads, toll, convoy, drawbridge, lava, traffic_jam, wrongway, meteor,
// flood, speed_cameras.

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pickLane = (w: World) => Math.floor(rnd(0, w.lanes));
function tpl(id: string, fallbackHeavy = false): TrafficTemplate {
  const t = trafficTemplate(id);
  if (t) return t;
  const all = trafficTemplates();
  return all.find((x) => x.heavy === fallbackHeavy) ?? all[0];
}
/** First hazard of `kind` under the player (same lane, within 2.5 m). */
function under(w: World, kind: string): Hazard | undefined {
  const pl = w.player;
  return w.hazards.find((h) => h.kind === kind && Math.abs(h.lane - pl.laneX) < 0.6 && Math.abs(h.z - PLAYER_Z) < 2.5 && !w.player.airborne);
}
/** Draw a flat rectangle on the road at (lane, z) spanning `lanes` lanes and `len` metres. */
function roadPatch(w: World, lane: number, z: number, lanes: number, len: number, color: string, alpha = 1): void {
  const road = w.road, r = w.game.r;
  const p0 = road.project(lane, z), p1 = road.project(lane, z + len);
  if (p0.y < road.hy) return;
  const y0 = Math.min(r.h, Math.round(p0.y)), y1 = Math.max(road.hy, Math.round(p1.y));
  for (let y = y1; y <= y0; y++) { const t = (y0 - y) / Math.max(1, y0 - y1); const s = p0.s + (p1.s - p0.s) * t; const x = p0.x + (p1.x - p0.x) * t; const hw = lanes * road.laneW * s * 0.5; r.fillRect(x - hw, y, hw * 2, 1, color, alpha); }
}
/** Warning float text at the horizon. */
function warn(w: World, text: string, color = '#e0202a'): void { w.floatText(text, (w.lanes - 1) / 2, 60, color, 2); }

// ── ONCOMING / WRONG WAY ────────────────────────────────────────────────────
class Oncoming extends BaseMechanic {
  readonly id: MechanicId = 'oncoming';
  protected every = 8;
  protected label = '!';
  private next = 6;
  update(dt: number): void {
    const w = this.w;
    this.next -= dt;
    if (this.next <= 0 && !w.finished) {
      this.next = this.every * rnd(0.7, 1.3);
      const t = w.spawnTraffic(pickLane(w), SPAWN_Z, w.rng.chance(0.4) ? tpl('dolmus', true) : undefined, 1.1);
      t.oncoming = true;
      warn(w, this.label);
      w.game.audio.sfx('horn');
    }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r;
    for (const t of w.traffic) {
      if (!t.oncoming || t.state === 'wreck') continue;
      const p = w.road.project(t.laneX, t.z);
      const on = Math.floor(w.time * 8) % 2 === 0;
      const R = Math.max(1, Math.round(5 * p.s));
      r.disc(p.x - Math.round(t.tpl.sprite.w * 0.3 * p.s), p.y - 10 * p.s, R, on ? '#ffffff' : '#ffe870', 0.9);
      r.disc(p.x + Math.round(t.tpl.sprite.w * 0.3 * p.s), p.y - 10 * p.s, R, on ? '#ffe870' : '#ffffff', 0.9);
      // headlight cone toward the player
      const q = w.road.project(t.laneX, t.z - 12);
      for (let y = Math.round(p.y); y < Math.min(r.h, Math.round(q.y)); y += 2) { const k = (y - p.y) / Math.max(1, q.y - p.y); r.fillRect(p.x + (q.x - p.x) * k - (8 + k * 20) * p.s, y, (16 + k * 40) * p.s, 1, '#ffe870', 0.12 * (1 - k)); }
    }
  }
}
class WrongWay extends Oncoming {
  override readonly id: MechanicId = 'wrongway';
  override every = 4.5;
  override label = 'FALSCHFAHRER!';
  override update(dt: number): void { super.update(dt); if (this.w.traffic.some((t) => t.oncoming && t.z < 40 && t.state !== 'wreck')) { this.w.mod.tint = '#e0202a'; this.w.mod.tintA = Math.max(this.w.mod.tintA, 0.08 + 0.06 * Math.sin(this.w.time * 12)); } }
}

// ── CONSTRUCTION ────────────────────────────────────────────────────────────
class Construction extends BaseMechanic {
  readonly id: MechanicId = 'construction';
  private next = 180;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next && !w.finished) {
      const lane = pickLane(w);
      w.spawnHazard('barrier', lane, SPAWN_Z, 1);
      for (let i = 1; i < 10; i++) w.spawnHazard('cone', lane, SPAWN_Z + i * 10, 1);
      warn(w, 'BAUSTELLE', '#f07020');
      this.next += rnd(250, 450);
    }
    const b = under(w, 'barrier');
    if (b && b.active) { b.active = false; w.player.hit(1); w.game.audio.sfx('crush'); }
    const c = under(w, 'cone');
    if (c && c.active) { c.active = false; w.player.stagger = Math.max(w.player.stagger, 0.2); w.game.audio.sfx('land'); const p = w.player.screen(); w.fx.burst(p.x, p.y - 10, 8, { speed: 90, colors: ['#f07020', '#f4f4f0'], life: 0.5, size: 3, gravity: 250 }); w.score += 20; }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r;
    for (const h of w.hazards) {
      if (h.kind !== 'barrier') continue;
      const p = w.road.project(h.lane, h.z);
      if (p.s < 0.03 || p.y < w.road.hy) continue;
      const bw = Math.round(w.road.laneW * 0.8 * p.s), bh = Math.max(2, Math.round(10 * p.s));
      r.fillRect(p.x - bw / 2, p.y - bh, bw, bh, h.active ? '#f4f4f0' : '#6a6a78');
      for (let i = 0; i < bw; i += Math.max(2, Math.round(6 * p.s))) r.fillRect(p.x - bw / 2 + i, p.y - bh, Math.max(1, Math.round(3 * p.s)), bh, '#f07020');
      const on = Math.floor(w.time * 6) % 2 === 0;
      r.fillRect(p.x - bw / 2, p.y - bh - 3 * p.s, Math.max(1, 3 * p.s), Math.max(1, 3 * p.s), on ? '#ffe870' : '#f07020');
      r.fillRect(p.x + bw / 2 - 3 * p.s, p.y - bh - 3 * p.s, Math.max(1, 3 * p.s), Math.max(1, 3 * p.s), on ? '#f07020' : '#ffe870');
    }
  }
}

// ── POTHOLES / OIL / LAVA / FLOOD / NITRO PADS ─────────────────────────────
class Potholes extends BaseMechanic {
  readonly id: MechanicId = 'potholes';
  private next = 80;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { w.spawnHazard('pothole', pickLane(w), SPAWN_Z, 1); this.next += rnd(40, 90); }
    const h = under(w, 'pothole');
    if (h && h.active) { h.active = false; w.player.stagger = Math.max(w.player.stagger, 0.3); w.player.bump = 5; w.game.r.shake(3, 0.2); w.game.audio.sfx('land'); }
  }
}
class OilSlicks extends BaseMechanic {
  readonly id: MechanicId = 'oilslicks';
  private next = 120;
  private slide = 0;
  private dir = 1;
  update(dt: number): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { w.spawnHazard('oil', pickLane(w), SPAWN_Z, 1); this.next += rnd(60, 120); }
    const h = under(w, 'oil');
    if (h && h.active) { h.active = false; this.slide = 0.8; this.dir = Math.random() < 0.5 ? -1 : 1; w.game.audio.sfx('swipe'); }
    if (this.slide > 0) { this.slide -= dt; w.mod.grip *= 0.3; w.player.laneX += this.dir * dt * 0.6; const p = w.player.screen(); w.fx.spawn({ x: p.x + rnd(-14, 14), y: p.y, vx: rnd(-20, 20), vy: -10, life: 0.4, maxLife: 0.4, colors: ['#f4f4f0', '#a8a8b4'], size: 3, gravity: 0, shrink: true, alpha: 0.7 }); }
  }
}
class Lava extends BaseMechanic {
  readonly id: MechanicId = 'lava';
  private next = 150;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { w.spawnHazard('lava', pickLane(w), SPAWN_Z, 1); if (w.rng.chance(0.4)) w.spawnHazard('lava', pickLane(w), SPAWN_Z + 8, 1); this.next += rnd(50, 110); }
    const h = under(w, 'lava');
    if (h && h.active) { h.active = false; w.player.hit(1); const p = w.player.screen(); w.fx.burst(p.x, p.y - 4, 14, { speed: 80, colors: ['#ffe870', '#f07020', '#e0202a'], life: 0.5, size: 3, gravity: 200 }); }
    if (Math.random() < 0.3) { const r = w.game.r; w.fxFront.spawn({ x: rnd(0, r.w), y: r.h, vx: 0, vy: -rnd(20, 50), life: 1.5, maxLife: 1.5, colors: ['#ffe870', '#f07020'], size: 1, gravity: 0, alpha: 0.7 }); }
    w.mod.tint = '#e0202a'; w.mod.tintA = Math.max(w.mod.tintA, 0.05);
  }
}
class Flood extends BaseMechanic {
  readonly id: MechanicId = 'flood';
  private next = 130;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { const l = Math.floor(rnd(0, w.lanes - 1)); w.spawnHazard('water', l, SPAWN_Z, 1); w.spawnHazard('water', l + 1, SPAWN_Z, 1); if (w.rng.chance(0.3)) w.spawnHazard('pothole', l, SPAWN_Z + 4, 1); this.next += rnd(80, 150); }
    if (under(w, 'water')) { w.mod.speed *= 0.8; const p = w.player.screen(); for (let i = 0; i < 3; i++) w.fx.spawn({ x: p.x + rnd(-24, 24), y: p.y, vx: rnd(-50, 50), vy: -rnd(40, 100), life: 0.4, maxLife: 0.4, colors: ['#ffffff', '#40e0f0', '#2040e0'], size: 2, gravity: 220 }); }
  }
}
class NitroPads extends BaseMechanic {
  readonly id: MechanicId = 'nitro_pads';
  private next = 100;
  private burst = 0;
  update(dt: number): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { w.spawnHazard('nitro', pickLane(w), SPAWN_Z, 1); this.next += rnd(90, 160); }
    const h = under(w, 'nitro');
    if (h && h.active) { h.active = false; this.burst = 1.5; w.player.speed += 25; w.game.audio.sfx('boostStart'); w.game.r.flash('#40e0f0', 0.25); w.floatText('NITRO!', w.player.laneX, 8, '#40e0f0', 2); }
    if (this.burst > 0) { this.burst -= dt; w.mod.speed *= 1.3; const p = w.player.screen(); for (let i = 0; i < 2; i++) w.fx.spawn({ x: p.x + rnd(-12, 12), y: p.y - 2, vx: rnd(-10, 10), vy: rnd(80, 140), life: 0.3, maxLife: 0.3, colors: ['#ffffff', '#40e0f0', '#2040e0'], size: 3, gravity: 0, shrink: true }); }
  }
}

// ── POLICE CHASE ────────────────────────────────────────────────────────────
class Police extends BaseMechanic {
  readonly id: MechanicId = 'police';
  private cop: Traffic | null = null;
  private next = 10;
  private chaseT = 0;
  private retarget = 0;
  update(dt: number): void {
    const w = this.w, pl = w.player;
    if (!this.cop) {
      this.next -= dt;
      if (this.next <= 0 && !w.finished && !pl.dead) {
        const id = w.city.traffic.find((x) => x.startsWith('police')) ?? 'police_us';
        const lane = clamp(pl.lane + (Math.random() < 0.5 ? -1 : 1), 0, w.lanes - 1);
        this.cop = w.spawnTraffic(lane, -3, tpl(id));
        this.cop.state = 'pulled';
        this.cop.stateT = 99;
        this.chaseT = 7; this.retarget = 0;
        warn(w, 'POLIZEI!', '#60a0ff'); w.game.audio.sfx('siren');
      }
      return;
    }
    const c = this.cop;
    if (c.state === 'wreck' || !w.traffic.includes(c)) { this.cop = null; this.next = rnd(12, 20); return; }
    this.chaseT -= dt; this.retarget -= dt;
    c.speed = pl.speed; // keeps pace; z is controlled here
    c.state = 'pulled'; c.stateT = 99;
    if (this.chaseT > 0) {
      c.z += (Math.min(0.5, c.z + 1.5) - c.z) * dt * 1.5; // creep up to the player's flank
      if (this.retarget <= 0) { this.retarget = 1.6; c.targetLane = pl.lane; }
      if (Math.floor(w.time * 4) % 4 === 0) w.game.audio.sfx('siren');
    } else {
      c.z -= dt * 6; // give up and fall back
      c.targetLane = c.lane;
    }
  }
  renderRoad(): void {
    const c = this.cop; if (!c || c.state === 'wreck') return;
    const w = this.w, r = w.game.r, p = w.road.project(c.laneX, c.z);
    const red = Math.floor(w.time * 6) % 2 === 0;
    r.disc(p.x - 8 * p.s, p.y - c.tpl.sprite.h * p.s, 5 * p.s, red ? '#e0202a' : '#2040e0', 0.5);
    r.disc(p.x + 8 * p.s, p.y - c.tpl.sprite.h * p.s, 5 * p.s, red ? '#2040e0' : '#e0202a', 0.5);
    r.fillRect(0, w.road.hy, r.w, r.h - w.road.hy, red ? '#e0202a' : '#2040e0', 0.05);
  }
}

// ── TRAINS (level crossing) ─────────────────────────────────────────────────
class Trains extends BaseMechanic {
  readonly id: MechanicId = 'trains';
  private crossAt = 320;
  private trainX = -1; // 0..1 across the road while crossing, -1 idle
  private done = false;
  update(dt: number): void {
    const w = this.w, pl = w.player;
    const dz = this.crossAt - w.distance;
    if (dz < 120 && dz > -10 && this.trainX < 0 && !this.done) { this.trainX = 0; w.game.audio.sfx('horn'); warn(w, 'BAHNÜBERGANG!', '#ffe870'); }
    if (this.trainX >= 0) {
      this.trainX += dt / 2.2;
      // train occupies lanes according to its head position (lane index = trainX * lanes)
      const head = this.trainX * (w.lanes + 1.5) - 0.5;
      const tail = head - 2.2;
      if (Math.abs(dz - PLAYER_Z) < 3 && pl.laneX > tail && pl.laneX < head && !pl.airborne && !pl.phasing) { pl.hit(2); pl.stagger = 0.8; w.game.r.shake(8, 0.4); }
      if (this.trainX > 1.4) { this.trainX = -1; this.done = true; }
    }
    if (dz < -40) { this.crossAt = w.distance + rnd(350, 600); this.done = false; }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road;
    const dz = this.crossAt - w.distance;
    if (dz > SPAWN_Z || dz < -8) return;
    const s = road.sAt(dz), cx = road.centerX(s), hw = road.halfW(s), y = road.yAt(s);
    // rails
    r.fillRect(cx - hw, y - 1, hw * 2, 1, '#a8a8b4'); r.fillRect(cx - hw, y + 1, hw * 2, 1, '#a8a8b4');
    // gates + flashing lights
    const on = Math.floor(w.time * 5) % 2 === 0, active = this.trainX >= 0 || dz < 120;
    for (const side of [-1, 1]) { const gx = cx + side * (hw + 6 * s); const gh = Math.round(22 * s / road.sAt(PLAYER_Z)); r.fillRect(gx - 1, y - gh, 3, gh, '#f4f4f0'); r.fillRect(gx - 3, y - gh - 4 * s, 7, 4 * s + 1, active && on ? '#e0202a' : '#8a1018'); if (active) r.fillRect(side < 0 ? gx : cx + hw - hw * 0.5, y - gh + 2, hw * 0.5, Math.max(1, 2 * s), on ? '#e0202a' : '#f4f4f0'); }
    if (this.trainX >= 0) {
      // the tram: a long striped box moving across the road
      const head = this.trainX * (w.lanes + 1.5) - 0.5;
      const x0 = cx + road.laneOffset(head - 2.2, s), x1 = cx + road.laneOffset(head, s);
      const th = Math.round(60 * s / road.sAt(PLAYER_Z));
      r.fillRect(x0, y - th, x1 - x0, th, '#e0202a');
      r.fillRect(x0, y - th + Math.round(th * 0.35), x1 - x0, Math.round(th * 0.3), '#f4f4f0');
      for (let x = x0 + 3 * s; x < x1 - 3 * s; x += 8 * s) r.fillRect(x, y - th + Math.round(th * 0.4), Math.max(1, 4 * s), Math.round(th * 0.2), '#40e0f0');
      r.fillRect(x0, y - th - 3 * s, 2 * s + 1, 3 * s + 1, '#3a3a48');
      r.fillRect(x1 - 2, y - th * 0.5, 2, 2, '#ffe870');
    }
  }
}

// ── BOSSES ──────────────────────────────────────────────────────────────────
abstract class Boss extends BaseMechanic {
  protected boss: Traffic | null = null;
  private spawned = 0;
  private swerve = 0;
  protected shot = 0;
  protected abstract tplId: string;
  protected abstract name: string;
  constructor(w: World) { super(w); w.on('kill', (t) => { const tr = t as Traffic; if (tr === this.boss) { w.score += 2000; w.floatText('+2000 BOSS!', tr.laneX, tr.z, '#ffe870', 2); for (let i = 0; i < 12; i++) w.spawnCoin(pickLane(w), 20 + i * 5, 5, true); w.game.audio.sfx('levelup'); this.boss = null; } }); }
  update(dt: number): void {
    const w = this.w;
    const want = w.progress > 0.75 ? 2 : w.progress > 0.35 ? 1 : 0;
    if (this.spawned < want && !this.boss && !w.finished) {
      this.spawned++;
      this.boss = w.spawnTraffic(Math.floor(w.lanes / 2), SPAWN_Z, tpl(this.tplId, true), 1.15);
      warn(w, this.name, '#e0202a'); w.game.audio.sfx('horn'); w.game.r.shake(4, 0.4);
    }
    const b = this.boss;
    if (!b) return;
    if (b.state === 'wreck' || !w.traffic.includes(b)) { this.boss = null; return; }
    // never drives away: stays 12–40 m ahead
    if (b.z > 45) b.z -= dt * 20;
    if (b.z < 10) b.z += dt * 10;
    this.swerve -= dt;
    if (this.swerve <= 0) { this.swerve = rnd(1.4, 2.4); b.targetLane = clamp(w.player.lane + Math.round(rnd(-1, 1)), 0, w.lanes - 1); }
    this.act(dt, b);
  }
  protected abstract act(dt: number, b: Traffic): void;
  renderFront(): void {
    const b = this.boss; if (!b) return;
    const w = this.w, r = w.game.r;
    const bw = 120, x = (r.w - bw) / 2, y = r.safeTop + 34;
    r.fillRect(x - 2, y - 2, bw + 4, 10, '#0b0b12', 0.75);
    r.fillRect(x, y, Math.round(bw * clamp(b.hp / b.tpl.hp, 0, 1)), 6, Math.floor(w.time * 4) % 2 ? '#e0202a' : '#f07020');
    r.text(this.name, r.w / 2, y - 9, { align: 'center', color: '#f4f4f0', outline: '#0b0b12' });
  }
}
class BossTruck extends Boss {
  readonly id: MechanicId = 'boss_truck';
  protected tplId = 'boss_truck'; protected name = 'KING TRUCK';
  protected act(dt: number, b: Traffic): void { this.shot -= dt; if (this.shot <= 0) { this.shot = rnd(1.5, 2.5); this.w.spawnHazard('cone', b.lane, b.z - 4, 1); this.w.game.audio.sfx('crush'); } const c = under(this.w, 'cone'); if (c && c.active) { c.active = false; this.w.player.stagger = 0.3; this.w.game.audio.sfx('land'); } }
}
class BossTank extends Boss {
  readonly id: MechanicId = 'boss_tank';
  protected tplId = 'boss_tank'; protected name = 'PANZER';
  protected act(dt: number, b: Traffic): void {
    this.shot -= dt;
    if (this.shot <= 0) { this.shot = rnd(2, 3.2); this.w.fire({ kind: 'shell', laneX: b.laneX, z: b.z - 3, speed: -40, h: 10, damage: 1, owner: 'enemy', life: 4, color: '#3a3a48' }); this.w.game.audio.sfx('cannon'); const p = this.w.road.project(b.laneX, b.z); this.w.fx.burst(p.x, p.y - 30 * p.s, 8, { speed: 50 * p.s, colors: ['#ffffff', '#ffe870', '#f07020'], life: 0.3, size: 3 * p.s, gravity: 0 }); }
  }
}
class BossBus extends Boss {
  readonly id: MechanicId = 'boss_bus';
  protected tplId = 'boss_bus'; protected name = 'MEGA BUS';
  protected act(dt: number, b: Traffic): void { this.shot -= dt; if (this.shot <= 0) { this.shot = 1.2; b.targetLane = this.w.player.lane; } }
}

// ── EARTHQUAKE / METEOR ─────────────────────────────────────────────────────
class Earthquake extends BaseMechanic {
  readonly id: MechanicId = 'earthquake';
  private next = 8;
  private tremor = 0;
  update(dt: number): void {
    const w = this.w;
    this.next -= dt;
    if (this.next <= 0) { this.next = rnd(9, 16); this.tremor = 2.5; warn(w, 'ERDBEBEN!', '#d0a060'); w.game.audio.sfx('explodeBig'); for (let i = 0; i < 4; i++) w.spawnHazard('pothole', pickLane(w), SPAWN_Z + i * 12, 1); }
    if (this.tremor > 0) {
      this.tremor -= dt;
      w.game.r.shake(3, 0.1);
      w.player.laneX += Math.sin(w.time * 30) * dt * 0.6;
      if (Math.random() < 0.4) { const r = w.game.r; w.fx.spawn({ x: rnd(0, r.w), y: rnd(w.road.hy, r.h), vx: 0, vy: -20, life: 0.5, maxLife: 0.5, colors: ['#d0a060', '#6a6a78'], size: 2, gravity: 80 }); }
    }
    const h = under(w, 'pothole');
    if (h && h.active) { h.active = false; w.player.stagger = 0.3; w.player.bump = 5; w.game.audio.sfx('land'); }
  }
  renderRoad(): void {
    if (this.tremor <= 0) return;
    const w = this.w, r = w.game.r, road = w.road;
    for (let i = 0; i < 6; i++) { const s = 0.25 + ((i * 0.13 + road.scroll * 0.003) % 0.7); const y = road.yAt(s); const x = road.centerX(s) + (i % 2 ? 1 : -1) * road.halfW(s) * 0.5; r.fillRect(x, y, Math.max(2, 14 * s), 1, '#16161f'); r.fillRect(x + 4 * s, y + 1, Math.max(2, 8 * s), 1, '#16161f'); }
  }
}
class Meteor extends BaseMechanic {
  readonly id: MechanicId = 'meteor';
  private next = 6;
  private falling: { lane: number; z: number; t: number }[] = [];
  update(dt: number): void {
    const w = this.w;
    this.next -= dt;
    if (this.next <= 0) { this.next = rnd(5, 9); this.falling.push({ lane: pickLane(w), z: 70, t: 0 }); warn(w, 'METEOR!', '#f07020'); w.game.audio.sfx('missile'); }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const m = this.falling[i];
      m.t += dt; m.z -= w.player.speed * dt * 0.4;
      const p = w.road.project(m.lane, m.z);
      const h = (1 - m.t / 1.6) * 260;
      w.fx.spawn({ x: p.x + rnd(-2, 2), y: p.y - h * p.s - 40 * (1 - m.t / 1.6), vx: rnd(-10, 10), vy: -20, life: 0.4, maxLife: 0.4, colors: ['#ffffff', '#ffe870', '#f07020', '#3a3a48'], size: 4, gravity: 0, shrink: true });
      if (m.t >= 1.6) {
        this.falling.splice(i, 1);
        w.explode(m.lane, m.z, 'huge');
        w.spawnHazard('lava', m.lane, m.z, 1);
        for (const t of w.traffic) if (t.collidable && Math.abs(t.laneX - m.lane) < 0.8 && Math.abs(t.z - m.z) < 8) w.destroyTraffic(t, 'other');
        if (Math.abs(m.z - PLAYER_Z) < 5 && Math.abs(m.lane - w.player.laneX) < 0.7) w.player.hit(2);
      }
    }
    const l = under(w, 'lava');
    if (l && l.active) { l.active = false; w.player.hit(1); }
  }
  renderFront(): void {
    const w = this.w, r = w.game.r;
    for (const m of this.falling) {
      const p = w.road.project(m.lane, m.z), h = (1 - m.t / 1.6) * 260;
      const y = p.y - h * p.s - 40 * (1 - m.t / 1.6);
      r.disc(p.x, y, Math.max(2, Math.round(6 * p.s + 2)), '#f07020'); r.disc(p.x, y, Math.max(1, Math.round(3 * p.s + 1)), '#ffe870');
      // landing marker
      const rr = Math.max(3, Math.round(12 * p.s)); r.ring(p.x, p.y, rr, Math.floor(w.time * 8) % 2 ? '#e0202a' : '#ffe870', 1);
    }
  }
}

// ── TOLL / SPEED CAMERAS / DRAWBRIDGE ───────────────────────────────────────
class Toll extends BaseMechanic {
  readonly id: MechanicId = 'toll';
  private next = 400;
  update(): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next && !w.finished) {
      const open = pickLane(w);
      for (let l = 0; l < w.lanes; l++) if (l !== open) w.spawnHazard('tollgate', l, SPAWN_Z, 1, { open: 0 });
      w.spawnHazard('tollgate', open, SPAWN_Z, 1, { open: 1 });
      warn(w, 'MAUT', '#ffe870');
      this.next += rnd(500, 800);
    }
    const g = under(w, 'tollgate');
    if (g && g.active) { g.active = false; if (g.data?.open) { w.score += 150; w.floatText('+150', w.player.laneX, 6, '#20b040'); w.game.audio.sfx('coin'); } else { w.player.hit(1); w.game.audio.sfx('crush'); } }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r;
    for (const h of w.hazards) {
      if (h.kind !== 'tollgate') continue;
      const p = w.road.project(h.lane, h.z); if (p.y < w.road.hy || p.s < 0.04) continue;
      const bw = Math.round(w.road.laneW * 0.9 * p.s), bh = Math.max(2, Math.round(36 * p.s));
      r.fillRect(p.x - bw / 2, p.y - bh, 3, bh, '#a8a8b4'); r.fillRect(p.x - bw / 2, p.y - bh - 3, bw, 3, '#3a3a48');
      const open = !!h.data?.open;
      if (open) { r.fillRect(p.x - bw / 2 + 2, p.y - bh + 2, 2, Math.round(bh * 0.6), '#f4f4f0'); }
      else { r.fillRect(p.x - bw / 2, p.y - Math.round(bh * 0.4), bw, Math.max(1, 3 * p.s), '#f4f4f0'); for (let i = 0; i < bw; i += Math.max(2, 6 * p.s)) r.fillRect(p.x - bw / 2 + i, p.y - Math.round(bh * 0.4), Math.max(1, 3 * p.s), Math.max(1, 3 * p.s), '#e0202a'); }
      r.fillRect(p.x + bw / 2 - 4 * p.s, p.y - bh - 2, 4 * p.s, 2, open ? '#20b040' : '#e0202a');
    }
  }
}
class SpeedCameras extends BaseMechanic {
  readonly id: MechanicId = 'speed_cameras';
  private next = 200;
  private flash = 0;
  update(dt: number): void {
    const w = this.w;
    if (w.distance + SPAWN_Z > this.next) { w.spawnHazard('camera', w.rng.chance(0.5) ? -0.9 : w.lanes - 0.1, SPAWN_Z, 1); this.next += rnd(250, 400); }
    for (const h of w.hazards) {
      if (h.kind !== 'camera' || !h.active || h.z > PLAYER_Z) continue;
      h.active = false;
      if (w.player.boosting) { w.score = Math.max(0, w.score - 50); w.floatText('BLITZER! -50', w.player.laneX, 4, '#ffffff', 2); this.flash = 0.2; w.game.r.flash('#ffffff', 0.9); w.game.audio.sfx('error'); }
      else { w.score += 200; w.floatText('+200', w.player.laneX, 4, '#20b040'); w.game.audio.sfx('coin'); }
    }
    if (this.flash > 0) this.flash -= dt;
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r;
    for (const h of w.hazards) {
      if (h.kind !== 'camera') continue;
      const p = w.road.project(h.lane, h.z); if (p.y < w.road.hy) continue;
      const ph = Math.max(3, Math.round(40 * p.s));
      r.fillRect(p.x - 1, p.y - ph, 3, ph, '#6a6a78'); r.fillRect(p.x - 4 * p.s, p.y - ph - 6 * p.s, 8 * p.s + 1, 6 * p.s + 1, '#3a3a48'); r.fillRect(p.x - 2 * p.s, p.y - ph - 4 * p.s, 4 * p.s + 1, 2 * p.s + 1, h.active ? '#40e0f0' : '#e0202a');
    }
  }
}
class Drawbridge extends BaseMechanic {
  readonly id: MechanicId = 'drawbridge';
  private at = 350;
  private resolved = false;
  update(dt: number): void {
    const w = this.w, pl = w.player, dz = this.at - w.distance;
    if (dz < 100 && dz > 90) warn(w, 'BRÜCKE HOCH!', '#ffe870');
    if (dz < 2 && !this.resolved) {
      this.resolved = true;
      if (pl.boosting || pl.airborne || pl.speed > pl.baseSpeed * 1.2) { pl.air = 1; pl.airborne = true; this.jump = 0.9; w.game.audio.sfx('jump'); w.floatText('SPRUNG! +300', pl.laneX, 4, '#ffe870', 2); w.score += 300; }
      else { pl.hit(1); pl.stagger = 1; w.game.r.shake(8, 0.4); }
    }
    if (this.jump > 0) { this.jump -= dt; pl.air = Math.sin((1 - this.jump / 0.9) * Math.PI) * 50; pl.airborne = true; if (this.jump <= 0) { pl.air = 0; pl.airborne = false; w.game.audio.sfx('land'); } }
    if (dz < -60) { this.at = w.distance + rnd(400, 700); this.resolved = false; }
  }
  private jump = 0;
  renderRoad(): void {
    const w = this.w, r = w.game.r, road = w.road, dz = this.at - w.distance;
    if (dz > SPAWN_Z || dz < -20) return;
    const s0 = road.sAt(dz), s1 = road.sAt(dz + 14);
    // gap (water) between dz and dz+14, raised deck leaf before the gap
    const y0 = road.yAt(s0), y1 = road.yAt(s1);
    for (let y = Math.round(y1); y <= Math.round(y0); y++) { const t = (y0 - y) / Math.max(1, y0 - y1); const s = s0 + (s1 - s0) * t; r.fillRect(road.centerX(s) - road.halfW(s), y, road.halfW(s) * 2, 1, mix(w.pal.skyBottom, '#2040e0', 0.5)); }
    const leafH = Math.round(50 * s0 / road.sAt(PLAYER_Z));
    const cx = road.centerX(s0), hw = road.halfW(s0);
    for (let j = 0; j < leafH; j++) { const k = j / leafH; r.fillRect(cx - hw * (1 - k * 0.3), y0 - j, hw * 2 * (1 - k * 0.3), 1, j % 4 === 0 ? '#f4f4f0' : '#3a3a48'); }
    const on = Math.floor(w.time * 5) % 2 === 0; r.fillRect(cx - hw - 3, y0 - leafH - 4, 4, 4, on ? '#e0202a' : '#8a1018'); r.fillRect(cx + hw, y0 - leafH - 4, 4, 4, on ? '#8a1018' : '#e0202a');
  }
}

// ── CONVOY / TRAFFIC JAM ────────────────────────────────────────────────────
class Convoy extends BaseMechanic {
  readonly id: MechanicId = 'convoy';
  private next = 12;
  update(dt: number): void {
    const w = this.w;
    this.next -= dt;
    if (this.next <= 0 && !w.finished) {
      this.next = rnd(10, 16);
      const lane = pickLane(w);
      const heavy = trafficTemplates().filter((t) => t.heavy && !t.boss);
      const t = heavy.length ? heavy[Math.floor(rnd(0, heavy.length))] : undefined;
      for (let i = 0; i < 3; i++) w.spawnTraffic(lane, SPAWN_Z + i * 14, t, 0.9);
      const esc = clamp(lane + (lane === 0 ? 1 : -1), 0, w.lanes - 1);
      w.spawnTraffic(esc, SPAWN_Z + 7, undefined, 0.9);
      warn(w, 'KONVOI', '#f4f4f0');
    }
  }
}
class TrafficJam extends BaseMechanic {
  readonly id: MechanicId = 'traffic_jam';
  private next = 15;
  update(dt: number): void {
    const w = this.w;
    this.next -= dt;
    if (this.next <= 0 && !w.finished) {
      this.next = rnd(14, 22);
      const free = pickLane(w);
      for (let l = 0; l < w.lanes; l++) { if (l === free) continue; for (let row = 0; row < 3; row++) { const t = w.spawnTraffic(l, SPAWN_Z + row * 9 + rnd(0, 3), undefined, 0.35); t.bump = 0; } }
      w.spawnCoinRow(free, SPAWN_Z + 2, 6, 5);
      warn(w, 'STAU!', '#f07020'); w.game.audio.sfx('horn');
    }
  }
  renderRoad(): void {
    const w = this.w, r = w.game.r;
    for (const t of w.traffic) { if (t.state !== 'alive' || t.speed > w.player.baseSpeed * 0.3) continue; const p = w.road.project(t.laneX, t.z); const R = Math.max(1, Math.round(4 * p.s)); r.disc(p.x - 10 * p.s, p.y - 10 * p.s, R, '#e0202a', 0.6); r.disc(p.x + 10 * p.s, p.y - 10 * p.s, R, '#e0202a', 0.6); }
  }
}

export const SET2: Partial<Record<MechanicId, (w: World) => Mechanic>> = {
  oncoming: (w) => new Oncoming(w), wrongway: (w) => new WrongWay(w), construction: (w) => new Construction(w), potholes: (w) => new Potholes(w),
  oilslicks: (w) => new OilSlicks(w), lava: (w) => new Lava(w), flood: (w) => new Flood(w), nitro_pads: (w) => new NitroPads(w),
  police: (w) => new Police(w), trains: (w) => new Trains(w), boss_truck: (w) => new BossTruck(w), boss_tank: (w) => new BossTank(w), boss_bus: (w) => new BossBus(w),
  earthquake: (w) => new Earthquake(w), meteor: (w) => new Meteor(w), toll: (w) => new Toll(w), speed_cameras: (w) => new SpeedCameras(w),
  drawbridge: (w) => new Drawbridge(w), convoy: (w) => new Convoy(w), traffic_jam: (w) => new TrafficJam(w),
};
