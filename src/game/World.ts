import type { Game } from '../core/Game';
import type { CityDef, CityPalette, LevelDef, VehicleDef } from '../core/types';
import type { PixelSprite } from '../core/Sprite';
import { darkenSprite } from '../core/Sprite';
import { Rng, clamp } from '../core/Rng';
import { Road, SPAWN_Z, PLAYER_Z } from './Road';
import { Player } from './Player';
import { Traffic, type TrafficTemplate } from './Traffic';
import { ParticleSystem, drawExplosion, type Explosion, EXPLOSION_COLORS } from './Particles';
import type { Ability } from './Ability';
import type { Mechanic, WorldMod } from './Mechanic';
import { defaultMod } from './Mechanic';
import { getCity, drawSkyline } from '../content/cities';
import { rearSprite, trafficTemplates, damagedSprite as makeDamaged } from '../content/vehicleSprites';
import { createAbility } from './abilities';
import { createMechanic } from './mechanics';
import { propSprite } from '../content/props';
import { kanjiSprite } from '../core/Kanji';
import { makeCanvas, spriteFromCanvas } from '../core/Sprite';
import { L } from '../core/i18n';

export interface Coin { lane: number; z: number; value: number; taken: boolean; t: number; big?: boolean; }
export interface Projectile {
  kind: 'shell' | 'missile' | 'bullet' | 'shuriken' | 'plasma' | 'rock' | 'ice' | 'water' | 'fire';
  laneX: number; z: number; speed: number; h: number; life: number; damage: number;
  /** homing target */
  target?: Traffic | null;
  /** owner: player or 'enemy' */
  owner: 'player' | 'enemy';
  hits?: number;
  color?: string;
  pierce?: boolean;
}
export interface Hazard { kind: string; lane: number; z: number; w: number; active: boolean; t: number; data?: Record<string, number>; }
export interface Prop { side: -1 | 1; z: number; sprite: PixelSprite; offset: number; }
/** Sign / billboard sprites are built once per text (pixel font + kanji helper drawn on a small canvas). */
const signCache = new Map<string, PixelSprite>();
export interface FloatText { x: number; y: number; text: string; t: number; color: string; scale?: number; laneX?: number; z?: number; }

export type WorldEvent = 'kill' | 'hit' | 'coin' | 'nearMiss' | 'finish' | 'dead' | 'combo';

/**
 * Runtime state of one run: road, player, traffic, coins, projectiles, particles, mechanics.
 * Screens (Play) drive `update`/`render`; abilities and mechanics use the public API.
 */
export class World {
  road: Road;
  player: Player;
  city: CityDef;
  pal: CityPalette;
  traffic: Traffic[] = [];
  coins: Coin[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  props: Prop[] = [];
  explosions: Explosion[] = [];
  floats: FloatText[] = [];
  fx = new ParticleSystem();
  /** particles drawn above everything (rain, sparks) */
  fxFront = new ParticleSystem();
  ability: Ability;
  mechanics: Mechanic[] = [];
  mod: WorldMod = defaultMod();
  rng: Rng;
  /** meters travelled */
  distance = 0;
  time = 0;
  score = 0;
  coinsCollected = 0;
  kills = 0;
  combo = 0;
  comboT = 0;
  nearMisses = 0;
  finished = false;
  finishT = 0;
  /** hit-stop timer (freezes the world briefly on impacts) */
  hitStop = 0;
  /** freeze flag while overlays (tutorial) are shown */
  frozen = false;
  /** draw the vertical kanji slogans in the sky (off on the title screen) */
  showSlogans = true;
  private spawnDist = 90; // next traffic row at this distance
  private lastFree: number[] = [];
  private coinDist = 60;
  private propDist = 0;
  private lampDist = 30;
  private signDist = 40;
  private signCount = 0;
  private templates: TrafficTemplate[];
  private heavyTemplates: TrafficTemplate[];
  private cityTemplates: TrafficTemplate[];
  private listeners: Partial<Record<WorldEvent, ((data?: unknown) => void)[]>> = {};
  /** curve target that changes over distance */
  private curveTarget = 0;
  private hillTarget = 0;
  private dmgCache = new Map<string, PixelSprite>();

  constructor(public game: Game, public level: LevelDef, public vehicle: VehicleDef, seed = 1) {
    this.rng = new Rng(seed * 7919 + level.id);
    this.road = new Road(game.r);
    this.road.setLanes(level.lanes);
    this.city = getCity(level.city);
    this.pal = this.city.palettes[level.timeOfDay] ?? this.city.palettes.day;
    const all = trafficTemplates();
    this.templates = all.filter((t) => !t.heavy && !t.boss);
    this.heavyTemplates = all.filter((t) => t.heavy && !t.boss);
    this.cityTemplates = all.filter((t) => this.city.traffic.includes(t.id));
    this.player = new Player(this, vehicle, rearSprite(vehicle));
    this.ability = createAbility(vehicle.ability, this);
    for (const m of level.mechanics) { const mech = createMechanic(m, this); if (mech) this.mechanics.push(mech); }
    for (const m of this.mechanics) m.start?.();
    // initial props
    for (let z = 10; z < SPAWN_Z; z += 14) this.addProp(z);
  }

  on(ev: WorldEvent, fn: (data?: unknown) => void): void { (this.listeners[ev] ??= []).push(fn); }
  emit(ev: WorldEvent, data?: unknown): void { this.listeners[ev]?.forEach((f) => f(data)); }

  get lanes(): number { return this.road.lanes; }
  get progress(): number { return clamp(this.distance / this.level.length, 0, 1); }

  // ── spawning API (used by mechanics/abilities) ───────────────────────────
  spawnTraffic(lane: number, z: number, tpl?: TrafficTemplate, speedMul = 1): Traffic {
    const t = tpl ?? this.pickTemplate();
    const spd = this.level.trafficSpeed * this.player.baseSpeed * this.level.speedMul * t.speed * speedMul * this.rng.range(0.92, 1.08);
    const tr = new Traffic(t, lane, z, spd);
    this.traffic.push(tr);
    return tr;
  }
  pickTemplate(): TrafficTemplate {
    const r = this.rng.next();
    if (this.heavyTemplates.length && r < this.level.heavy) return this.rng.pick(this.heavyTemplates);
    if (this.cityTemplates.length && r < this.level.heavy + 0.35) return this.rng.pick(this.cityTemplates);
    return this.rng.pick(this.templates);
  }
  spawnCoin(lane: number, z: number, value = 1, big = false): void { this.coins.push({ lane, z, value, taken: false, t: 0, big }); }
  spawnCoinRow(lane: number, z: number, n: number, gap = 6): void { for (let i = 0; i < n; i++) this.spawnCoin(lane, z + i * gap); }
  spawnHazard(kind: string, lane: number, z: number, w = 1, data?: Record<string, number>): Hazard {
    const h: Hazard = { kind, lane, z, w, active: true, t: 0, data };
    this.hazards.push(h);
    return h;
  }
  fire(p: Omit<Projectile, 'life'> & { life?: number }): Projectile {
    const q: Projectile = { life: 3, ...p };
    this.projectiles.push(q);
    return q;
  }
  addProp(z: number): void {
    if (!this.city.props.length) return;
    const side: -1 | 1 = this.rng.chance(0.5) ? -1 : 1;
    const id = this.rng.pick(this.city.props);
    const spr = propSprite(id);
    if (!spr) return;
    this.props.push({ side, z, sprite: spr, offset: this.rng.range(10, 40) });
  }
  floatText(text: string, laneX: number, z: number, color = '#ffe870', scale = 1): void {
    const p = this.road.project(laneX, z);
    this.floats.push({ x: p.x, y: p.y - 30, text, t: 0, color, scale, laneX, z });
  }

  /** Spawn an explosion at a world position; kind sets size + sound + shake. */
  explode(laneX: number, z: number, kind: 'small' | 'big' | 'huge' = 'big'): void {
    const p = this.road.project(laneX, z);
    const size = kind === 'small' ? 8 : kind === 'big' ? 16 : 26;
    this.explosions.push({ x: p.x, y: p.y - 6 * p.s, t: 0, dur: kind === 'huge' ? 0.9 : 0.6, size, kind, laneX, z });
    const n = kind === 'small' ? 10 : kind === 'big' ? 26 : 50;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (30 + Math.random() * 90) * p.s;
      this.fx.spawn({ x: p.x, y: p.y - 6 * p.s, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40 * p.s, life: 0.5 + Math.random() * 0.6, maxLife: 1, colors: EXPLOSION_COLORS, size: (1 + Math.random() * 3) * p.s, gravity: 160 * p.s, shrink: true });
    }
    // debris chunks
    for (let i = 0; i < (kind === 'small' ? 3 : 8); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (60 + Math.random() * 80) * p.s;
      this.fx.spawn({ x: p.x, y: p.y - 6 * p.s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9, maxLife: 0.9, color: Math.random() < 0.5 ? '#23232f' : '#6a6a78', size: 2 * p.s, gravity: 220 * p.s });
    }
    this.game.r.shake(kind === 'small' ? 2 : kind === 'big' ? 4 : 8, kind === 'huge' ? 0.6 : 0.3);
    if (kind !== 'small') this.game.r.flash('#ffffff', kind === 'huge' ? 0.7 : 0.35);
    this.game.audio.sfx(kind === 'huge' ? 'explodeBig' : 'explode');
    this.game.haptics.impact(kind === 'small' ? 'Light' : 'Heavy');
    this.hitStop = Math.max(this.hitStop, kind === 'huge' ? 0.12 : 0.06);
  }

  /** Destroy a traffic vehicle (any cause). Awards score/combo. */
  destroyTraffic(t: Traffic, cause: 'player' | 'weapon' | 'crush' | 'other' = 'weapon', knock = 0): void {
    if (t.state === 'wreck') return;
    t.state = 'wreck';
    t.wreckT = 0;
    t.knock = knock || (t.laneX < (this.lanes - 1) / 2 ? -1 : 1);
    t.launch = cause === 'crush' ? 0 : 30;
    this.explode(t.laneX, t.z, t.tpl.heavy || t.tpl.boss ? 'huge' : 'big');
    this.kills++;
    this.combo++;
    this.comboT = 3;
    const pts = t.tpl.points * Math.min(8, this.combo);
    this.score += pts;
    this.floatText(`+${pts}`, t.laneX, t.z, this.combo > 1 ? '#ff90c0' : '#ffe870', this.combo > 3 ? 2 : 1);
    if (this.combo > 1) this.emit('combo', this.combo);
    this.emit('kill', t);
    this.ability.onKill?.(t);
  }
  /** Traffic in front within `range` meters (sorted by distance). */
  trafficAhead(range = SPAWN_Z, laneX?: number, tol = 0.6): Traffic[] {
    return this.traffic
      .filter((t) => t.collidable && t.z > 0 && t.z < range && (laneX === undefined || Math.abs(t.laneX - laneX) < tol))
      .sort((a, b) => a.z - b.z);
  }
  /** Nearest collidable traffic in the player's lane. */
  nextInLane(): Traffic | undefined { return this.trafficAhead(SPAWN_Z, this.player.laneX)[0]; }

  onPlayerDamaged(_amount: number): void {
    this.combo = 0;
    this.game.r.shake(6, 0.35);
    this.game.r.flash('#e0202a', 0.35);
    this.game.audio.sfx('hit');
    this.game.haptics.error();
    this.emit('hit');
    const { x, y } = this.player.screen();
    this.fx.burst(x, y - 12, 14, { speed: 90, color: '#ffe870', life: 0.4, size: 2, gravity: 200 });
  }

  /** Scale factor that keeps a vehicle sprite at most ~1.15 lanes wide. */
  fitScale(spr: PixelSprite): number {
    return Math.min(1, (this.road.laneW * 1.15) / spr.w);
  }

  damagedSprite(spr: PixelSprite, t: number): PixelSprite {
    const lvl = t <= 0.001 ? 0 : t < 0.34 ? 1 : t < 0.67 ? 2 : 3;
    if (lvl === 0) return spr;
    const key = spr.id + '#dmg' + lvl;
    const hit = this.dmgCache.get(key);
    if (hit) return hit;
    const made = makeDamaged(spr, lvl);
    this.dmgCache.set(key, made);
    return made;
  }

  // ── update ───────────────────────────────────────────────────────────────
  update(dt: number): void {
    if (this.frozen) return;
    if (this.hitStop > 0) { this.hitStop -= dt; this.updateEffects(dt * 0.3); return; }
    this.time += dt;
    this.mod = defaultMod();
    for (const m of this.mechanics) m.update(dt);
    const pl = this.player;
    // curve / hill drift
    {
      const seg = Math.floor(this.distance / 220);
      const r2 = new Rng(seg * 31 + this.level.id);
      this.curveTarget = this.level.curves > 0 ? (r2.next() * 2 - 1) * this.level.curves * (r2.chance(0.3) ? 0 : 1) : 0;
      this.hillTarget = this.level.mechanics.includes('hills') ? (r2.next() * 2 - 1) * 0.8 : 0;
    }
    this.road.curve += (this.curveTarget - this.road.curve) * Math.min(1, dt * 0.8);
    this.road.hill += (this.hillTarget - this.road.hill) * Math.min(1, dt * 0.6);
    this.road.camLaneX = pl.laneX - (this.lanes - 1) / 2;
    // player
    pl.update(dt);
    const adv = pl.dead ? 0 : pl.speed * dt;
    this.distance += adv;
    this.road.scroll += adv;
    this.score += adv * 0.5 * (pl.boosting ? 2 : 1);
    // curve pushes the player sideways slightly (feel)
    // finish
    if (!this.finished && this.distance >= this.level.length) { this.finished = true; this.emit('finish'); }
    if (this.finished) this.finishT += dt;
    // spawn traffic rows (capped so the road never becomes an impassable wall)
    if (!this.finished && this.distance + SPAWN_Z > this.spawnDist && this.traffic.length < this.lanes * 4) {
      this.spawnRow(this.spawnDist - this.distance);
    }
    // coins
    if (!this.finished && this.distance + SPAWN_Z > this.coinDist) {
      const lane = this.rng.int(0, this.lanes - 1);
      this.spawnCoinRow(lane, this.coinDist - this.distance, this.rng.int(3, 6));
      this.coinDist += this.rng.range(70, 140);
    }
    // props
    if (this.distance + SPAWN_Z > this.propDist) { this.addProp(SPAWN_Z + this.rng.range(0, 8)); this.propDist = this.distance + this.rng.range(9, 18); }
    // regular lamp posts on both sides, city signs and neon billboards
    if (this.distance + SPAWN_Z > this.lampDist) {
      const lampId = this.city.lampProp ?? 'lamp';
      const lamp = lampId ? propSprite(lampId) : null;
      if (lamp) { this.props.push({ side: -1, z: SPAWN_Z, sprite: lamp, offset: 4 }, { side: 1, z: SPAWN_Z, sprite: lamp, offset: 4 }); }
      this.lampDist += 48;
    }
    if (this.distance + SPAWN_Z > this.signDist) {
      const side: -1 | 1 = this.signCount % 2 ? -1 : 1;
      const spr = this.signCount % 3 === 1 ? this.highwaySign() : this.billboard(this.signCount);
      this.props.push({ side, z: SPAWN_Z, sprite: spr, offset: 12 });
      this.signCount++;
      this.signDist += this.rng.range(110, 170);
    }
    // ability
    this.ability.update(dt);
    const ts = this.mod.timeScale;
    // traffic
    for (let i = this.traffic.length - 1; i >= 0; i--) {
      const t = this.traffic[i];
      const rel = t.state === 'alive' || t.state === 'pulled' ? (t.oncoming ? -t.speed : t.speed * this.mod.trafficSpeed) : 0;
      t.z -= (pl.speed - rel * ts) * dt * (pl.dead ? 0 : 1);
      if (t.flash > 0) t.flash -= dt;
      if (t.state === 'frozen' || t.state === 'stalled') { t.stateT -= dt; if (t.stateT <= 0) t.state = 'alive'; }
      if (t.state === 'wreck') {
        t.wreckT += dt;
        t.laneX += t.knock * dt * 2.2;
        if (t.launch > 0) { t.launch = Math.max(0, t.launch - dt * 70); }
        if (t.wreckT > 0.05 && Math.random() < 0.5) {
          const p = this.road.project(t.laneX, t.z);
          this.fx.spawn({ x: p.x + (Math.random() - 0.5) * 10 * p.s, y: p.y - (8 + t.launch * 0.4) * p.s, vx: (Math.random() - 0.5) * 10, vy: -25 * p.s, life: 0.6, maxLife: 0.6, colors: ['#f07020', '#6a6a78', '#3a3a48'], size: 3 * p.s, gravity: -10, shrink: true });
        }
      } else if (t.targetLane !== t.lane) {
        t.laneX += Math.sign(t.targetLane - t.laneX) * dt * 1.5;
        if (Math.abs(t.targetLane - t.laneX) < 0.05) { t.laneX = t.targetLane; t.lane = t.targetLane; }
      }
      // near miss scoring
      if (!t.scored && t.z < 2 && t.collidable && Math.abs(t.laneX - pl.laneX) >= 0.6 && Math.abs(t.laneX - pl.laneX) < 1.3 && !pl.dead) {
        t.scored = true; this.nearMisses++; this.score += 25; this.emit('nearMiss', t);
      }
      if (t.z < -8 || (t.state === 'wreck' && t.wreckT > 4)) { this.traffic.splice(i, 1); continue; }
      // collision with player
      if (!pl.dead && t.collidable && t.z > -2.2 && t.z < 3.2 && Math.abs(t.laneX - pl.laneX) < 0.62 && !pl.airborne && !pl.phasing) {
        this.collide(t);
      }
    }
    // coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.z -= pl.speed * dt * (pl.dead ? 0 : 1);
      c.t += dt;
      if (!c.taken && c.z < 2.5 && c.z > -1.5 && Math.abs(c.lane - pl.laneX) < 0.55) this.takeCoin(c, i);
      else if (c.z < -3) this.coins.splice(i, 1);
    }
    // hazards
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i];
      h.z -= pl.speed * dt * (pl.dead ? 0 : 1);
      h.t += dt;
      if (h.z < -6) this.hazards.splice(i, 1);
    }
    // projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.z += (p.speed - (p.owner === 'player' ? 0 : pl.speed)) * dt;
      if (p.target && p.target.collidable) p.laneX += clamp(p.target.laneX - p.laneX, -dt * 4, dt * 4);
      if (p.life <= 0 || p.z > SPAWN_Z + 20 || p.z < -5) { this.projectiles.splice(i, 1); continue; }
      if (p.owner === 'player') {
        const victim = this.traffic.find((t) => t.collidable && Math.abs(t.z - p.z) < 3 && Math.abs(t.laneX - p.laneX) < 0.6);
        if (victim) {
          this.hitTraffic(victim, p.damage, 'weapon');
          if (!p.pierce) { this.projectiles.splice(i, 1); }
        }
      } else if (!pl.dead && Math.abs(p.z - PLAYER_Z) < 2 && Math.abs(p.laneX - pl.laneX) < 0.6 && !pl.airborne) {
        this.projectiles.splice(i, 1);
        pl.hit(p.damage);
      }
    }
    // props
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.z -= pl.speed * dt * (pl.dead ? 0 : 1);
      if (p.z < -4) this.props.splice(i, 1);
    }
    // combo timer
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.updateAmbient(dt);
    this.updateEffects(dt);
  }

  private updateEffects(dt: number): void {
    const proj = (lx: number, z: number) => this.road.project(lx, z);
    this.fx.update(dt, proj);
    this.fxFront.update(dt);
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.t += dt;
      if (e.z !== undefined) { e.z -= this.player.speed * dt; const p = proj(e.laneX ?? 0, e.z); e.x = p.x; e.y = p.y - 6 * p.s; }
      if (e.t >= e.dur) this.explosions.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      if (f.z !== undefined) { f.z -= this.player.speed * dt; const p = proj(f.laneX ?? 0, f.z); f.x = p.x; f.y = p.y - 30 * p.s - f.t * 30; }
      else f.y -= dt * 30;
      if (f.t > 1) this.floats.splice(i, 1);
    }
  }

  private spawnRow(z: number): void {
    const n = this.lanes;
    const density = clamp(this.level.density * this.mod.spawn * (1 + this.progress * 0.5), 0.1, 0.95);
    // choose how many lanes to fill: at least 1 free lane, reachable from the previous free set
    const maxFill = n - 1;
    let fill = 0;
    for (let i = 0; i < maxFill; i++) if (this.rng.chance(density)) fill++;
    fill = clamp(fill, n >= 5 ? 1 : 0, maxFill);
    // the free lanes must include one adjacent to (or equal to) a previous free lane
    const lanesArr = Array.from({ length: n }, (_, i) => i);
    const shuffled = lanesArr.slice().sort(() => this.rng.next() - 0.5);
    const prevFree = this.lastFree.length ? this.lastFree : lanesArr;
    // guarantee lane: a lane that is free & reachable
    const reachable = lanesArr.filter((l) => prevFree.some((f) => Math.abs(f - l) <= 1));
    const guaranteed = this.rng.pick(reachable.length ? reachable : lanesArr);
    const blocked = shuffled.filter((l) => l !== guaranteed).slice(0, fill);
    const free = lanesArr.filter((l) => !blocked.includes(l));
    this.lastFree = free;
    for (const l of blocked) {
      const zz = z + this.rng.range(0, 6);
      // keep a clear gap behind the last car in this lane so traffic never stacks into a wall
      const last = this.traffic.reduce((m, t) => (Math.abs(t.laneX - l) < 0.6 ? Math.max(m, t.z) : m), -999);
      if (last > zz - 22) continue;
      this.spawnTraffic(l, zz, this.pickTemplate());
    }
    const gap = 34 + (1 - density) * 46;
    this.spawnDist += this.rng.range(gap * 0.85, gap * 1.4);
  }

  private takeCoin(c: Coin, i: number): void {
    c.taken = true;
    this.coins.splice(i, 1);
    const v = Math.round(c.value * this.mod.coinMul * (this.game.save.hasProduct('legend_pass') ? 2 : 1));
    this.coinsCollected += v;
    this.score += 10 * v;
    this.game.audio.sfx(c.big ? 'coinBig' : 'coin');
    const p = this.road.project(c.lane, c.z);
    this.fx.burst(p.x, p.y - 8, 6, { speed: 50, color: '#ffe870', life: 0.35, size: 2, gravity: 100 });
    this.emit('coin', v);
  }

  /** Player runs into traffic. */
  private collide(t: Traffic): void {
    const pl = this.player;
    if (this.ability.onCollision?.(t)) { this.destroyTraffic(t, 'player'); return; }
    const heavy = t.tpl.heavy || t.tpl.boss;
    if (pl.crush && (!heavy || pl.def.cls === 'tank' || pl.crushAll)) {
      // drive over it
      this.hitTraffic(t, 99, 'crush');
      this.game.audio.sfx('crush');
      pl.stagger = 0.15;
      return;
    }
    // normal collision: traffic takes damage, player takes damage
    this.hitTraffic(t, heavy ? 1 : 99, 'player');
    if (t.collidable) { t.z = Math.max(t.z, 3.4); }
    const dead = pl.hit(t.tpl.damage);
    if (dead) {
      this.explode(pl.laneX, PLAYER_Z, 'huge');
      this.game.audio.duck(0.2);
      this.emit('dead');
    }
  }

  /** Damage traffic (from weapons / crush / collision). */
  hitTraffic(t: Traffic, dmg: number, cause: 'player' | 'weapon' | 'crush' | 'other'): void {
    if (!t.collidable) return;
    t.hp -= dmg;
    t.hits++;
    t.flash = 0.15;
    if (t.hp <= 0) this.destroyTraffic(t, cause);
    else {
      const p = this.road.project(t.laneX, t.z);
      this.fx.burst(p.x, p.y - 8 * p.s, 8, { speed: 60 * p.s, color: '#ffe870', life: 0.3, size: 2 * p.s, gravity: 150 });
      this.game.audio.sfx('hit');
      t.bump = 3;
    }
  }

  // ── render ───────────────────────────────────────────────────────────────
  render(): void {
    const r = this.game.r;
    const road = this.road;
    // sky
    r.bandedGradient(0, 0, r.w, road.hy + 2, [this.pal.skyTop, this.pal.skyBottom], 12);
    for (const m of this.mechanics) m.renderBack?.();
    // skyline (parallax with curve + lane)
    const px = -road.curve * 30 - road.camLaneX * 3;
    drawSkyline(r, this.city, this.level.timeOfDay, px, road.hy, this.time, this.mod.fog);
    if (this.showSlogans) this.renderSlogans();
    // road
    road.render(this.pal, this.mod.fog);
    for (const m of this.mechanics) m.renderRoad?.();
    // hazards (flat on road)
    for (const h of this.hazards) this.renderHazard(h);
    // depth-sorted entities: props, traffic, coins, projectiles, player
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    for (const p of this.props) items.push({ z: p.z, draw: () => this.renderProp(p) });
    for (const t of this.traffic) items.push({ z: t.z, draw: () => this.renderTraffic(t) });
    for (const c of this.coins) items.push({ z: c.z, draw: () => this.renderCoin(c) });
    for (const p of this.projectiles) items.push({ z: p.z, draw: () => this.renderProjectile(p) });
    items.push({ z: PLAYER_Z, draw: () => { this.ability.renderUnder(); if (!this.player.dead || this.player.flash > 0) this.player.render(); } });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
    // finish line banner
    if (!this.finished || this.finishT < 1.5) this.renderFinish();
    this.fx.render(r);
    for (const e of this.explosions) drawExplosion(r, e, e.z !== undefined ? this.road.scaleAt(e.z) : 1);
    this.ability.renderOver();
    for (const m of this.mechanics) m.renderFront?.();
    this.fxFront.render(r);
    // darkness / tint
    if (this.mod.dark > 0) r.fillRect(0, 0, r.w, r.h, '#0b0b12', this.mod.dark * 0.6);
    if (this.mod.tint && this.mod.tintA > 0) r.fillRect(0, 0, r.w, r.h, this.mod.tint, this.mod.tintA);
    for (const f of this.floats) r.text(f.text, f.x, f.y, { align: 'center', color: f.color, outline: '#0b0b12', scale: f.scale ?? 1, alpha: 1 - Math.max(0, f.t - 0.6) / 0.4 });
  }

  /** Green highway sign: "CITY  →" + destinations, drawn with the pixel font. */
  private highwaySign(): PixelSprite {
    const lines = this.city.signs ?? [L(this.city.name).toUpperCase(), L(this.city.country).toUpperCase()];
    const key = 'sign:' + lines.join('|');
    const hit = signCache.get(key);
    if (hit) return hit;
    const font = this.game.r.font;
    const tw = Math.max(...lines.map((l) => font.measure(l))) + 16;
    const w = Math.max(44, tw), h = 8 + lines.length * 9 + 12;
    const c = makeCanvas(w, h);
    const x = c.getContext('2d')!;
    x.fillStyle = '#0b0b12'; x.fillRect(0, 0, w, h - 12);
    x.fillStyle = '#0e6a2a'; x.fillRect(1, 1, w - 2, h - 14);
    x.fillStyle = '#f4f4f0'; x.fillRect(2, 2, w - 4, 1); x.fillRect(2, h - 15, w - 4, 1); x.fillRect(2, 2, 1, h - 16); x.fillRect(w - 3, 2, 1, h - 16);
    // abstract "text" bars: real glyphs turn to mush once the sign is scaled down by depth
    lines.forEach((l, i) => {
      let bx = 6;
      const ly = 6 + i * 9;
      for (const word of l.split(' ')) {
        const bw = Math.max(3, Math.min(w - 16 - bx, word.length * 3));
        x.fillStyle = '#f4f4f0';
        x.fillRect(bx, ly, bw, 4);
        bx += bw + 3;
        if (bx > w - 18) break;
      }
    });
    x.fillStyle = '#ffe870';
    x.fillRect(w - 12, 6 + Math.round((lines.length - 1) * 4.5), 7, 3);
    x.fillRect(w - 8, 4 + Math.round((lines.length - 1) * 4.5), 3, 3);
    x.fillRect(w - 8, 8 + Math.round((lines.length - 1) * 4.5), 3, 3);
    void font;
    x.fillStyle = '#6a6a78'; x.fillRect(Math.round(w / 2) - 2, h - 12, 2, 12); x.fillRect(Math.round(w / 2) + 1, h - 12, 2, 12);
    const spr = spriteFromCanvas(key, c);
    signCache.set(key, spr);
    return spr;
  }
  /** Neon billboard with native-script text (kanji rendered crisp via the Kanji helper). */
  private billboard(n: number): PixelSprite {
    const texts = this.city.billboards ?? [this.city.glyph ?? L(this.city.name), L(this.city.name).toUpperCase(), 'JDM'];
    const text = texts[n % texts.length];
    const colors = ['#e0202a', '#40e0f0', '#ff90c0', '#ffe870', '#8030c0'];
    const col = colors[n % colors.length];
    const key = `bb:${text}|${col}`;
    const hit = signCache.get(key);
    if (hit) return hit;
    const vertical = Array.from(text).length <= 4 && /[\u3000-\u9fff]/.test(text);
    const ks = kanjiSprite(text, { size: vertical ? 16 : 12, vertical, color: '#f4f4f0', bold: true });
    const pad = 4, w = ks.w + pad * 2 + 2, h = ks.h + pad * 2 + 2 + 14;
    const c = makeCanvas(w, h);
    const x = c.getContext('2d')!;
    x.fillStyle = '#0b0b12'; x.fillRect(0, 0, w, h - 14);
    x.fillStyle = col; x.fillRect(1, 1, w - 2, h - 16);
    x.fillStyle = '#16161f'; x.fillRect(3, 3, w - 6, h - 20);
    x.drawImage(ks.canvas, pad + 1, pad + 1);
    x.fillStyle = '#3a3a48'; x.fillRect(Math.round(w / 2) - 2, h - 14, 4, 14);
    const spr = spriteFromCanvas(key, c);
    signCache.set(key, spr);
    return spr;
  }

  /** Vertical kanji slogans in the sky (走り続けろ / 夢の先へ) with tiny English captions, like the reference. */
  private renderSlogans(): void {
    const r = this.game.r;
    const [l, rr] = this.city.slogans ?? ['走り続けろ', '夢の先へ'];
    const [cl, cr] = this.city.captions ?? ['DRIVE\nBEYOND\nLIMITS', 'CARS\nPEOPLE\nSTORIES\nFOREVER'];
    const top = r.safeTop + 56;
    const sky = this.road.hy - top;
    if (sky < 60) return;
    const size = sky < 150 ? 11 : 13;
    // CJK/Thai/Devanagari read well stacked vertically; other scripts are drawn as normal lines
    const stack = /[\u3000-\u9fff\uff00-\uffef\uac00-\ud7af\u0e00-\u0e7f\u0900-\u097f]/;
    const side = (text: string, x: number, right: boolean): number => {
      if (stack.test(text)) {
        const spr = kanjiSprite(text, { size, vertical: true, color: '#f4f4f0', outline: '#16161f', gap: 1 });
        r.sprite(spr, right ? x - spr.w : x, top, { origin: 'topleft', alpha: 0.9 });
        return spr.h;
      }
      // horizontal: one word per line, bold pixel font
      const spr = kanjiSprite(text, { size: 13, color: '#f4f4f0', outline: '#16161f' });
      r.sprite(spr, right ? x - spr.w : x, top, { origin: 'topleft', alpha: 0.9 });
      return spr.h;
    };
    const lh = side(l, 6, false);
    const rh = side(rr, r.w - 6, true);
    if (top + Math.max(lh, rh) + 34 < this.road.hy - 70) {
      r.text(cl, 6, top + lh + 4, { color: '#f4f4f0', outline: '#16161f', alpha: 0.85, lineHeight: 8 });
      r.text(cr, r.w - 6, top + rh + 4, { color: '#f4f4f0', outline: '#16161f', alpha: 0.85, align: 'right', lineHeight: 8 });
    }
  }

  /** Ambient sakura petals for cities with cherry trees. */
  private petalT = 0;
  private updateAmbient(dt: number): void {
    if (!this.city.props.includes('sakura')) return;
    this.petalT += dt;
    if (this.petalT > 0.12) {
      this.petalT = 0;
      const r = this.game.r;
      const fromTop = Math.random() < 0.5;
      this.fxFront.spawn({ x: fromTop ? Math.random() * r.w : r.w + 4, y: fromTop ? this.road.hy - 20 - Math.random() * 60 : this.road.hy + Math.random() * (r.h - this.road.hy), vx: -18 - Math.random() * 20, vy: 22 + Math.random() * 25, life: 4, maxLife: 4, colors: ['#ffb7d0', '#ff90c0', '#e04080'], size: 2, gravity: 4, alpha: 0.9 });
    }
  }

  private renderProp(p: Prop): void {
    const road = this.road;
    const s = road.sAt(p.z);
    if (s <= 0.03) return;
    const x = road.centerX(s) + p.side * (road.halfW(s) + p.offset * s / (road.sAt(PLAYER_Z)));
    const y = road.yAt(s);
    const sc = s / road.sAt(PLAYER_Z);
    const fogT = this.mod.fog > 0 ? Math.min(1, this.mod.fog * (1 - s) * 1.4) : 0;
    this.game.r.sprite(p.sprite, x, y, { scale: sc, alpha: 1 - fogT * 0.8 });
  }
  private renderTraffic(t: Traffic): void {
    const r = this.game.r;
    if (t.z < -2.5) return;
    const p = this.road.project(t.laneX, t.z);
    if (p.s <= 0.02) return;
    let spr = t.tpl.sprite;
    const fit = this.fitScale(spr) * p.s;
    const w = Math.round(spr.w * fit * 0.9);
    r.fillRect(p.x - w / 2, p.y - 2 * p.s, w, Math.max(1, 3 * p.s), '#000000', 0.3);
    if (t.state === 'wreck') spr = darkenSprite(spr, Math.min(0.7, 0.3 + t.wreckT * 0.3));
    const fogT = this.mod.fog > 0 ? Math.min(1, this.mod.fog * (1 - this.road.sAt(t.z)) * 1.4) : 0;
    const alpha = 1 - fogT * 0.85;
    const yy = p.y - t.launch * p.s - t.bump;
    if (t.bump > 0) t.bump = Math.max(0, t.bump - 0.5);
    if (t.flash > 0.05) r.sprite(this.tint(spr, '#ffffff'), p.x, yy, { scale: fit, alpha });
    else r.sprite(spr, p.x, yy, { scale: fit, alpha });
    if (t.state === 'frozen') { r.sprite(this.tint(spr, '#40e0f0'), p.x, yy, { scale: fit, alpha: 0.55 }); }
    if (t.tpl.boss && t.state !== 'wreck') {
      const bw = Math.round(30 * p.s);
      r.fillRect(p.x - bw / 2, yy - spr.h * fit - 6 * p.s, bw, Math.max(2, 3 * p.s), '#0b0b12');
      r.fillRect(p.x - bw / 2 + 1, yy - spr.h * fit - 6 * p.s + 1, Math.round((bw - 2) * (t.hp / t.tpl.hp)), Math.max(1, 3 * p.s - 2), '#e0202a');
    }
  }
  private tintCache = new Map<string, PixelSprite>();
  private tint(spr: PixelSprite, color: string): PixelSprite {
    const key = spr.id + color;
    let s = this.tintCache.get(key);
    if (!s) { s = tintSpriteLocal(spr, color); this.tintCache.set(key, s); }
    return s;
  }
  private renderCoin(c: Coin): void {
    const r = this.game.r;
    const p = this.road.project(c.lane, c.z);
    if (p.s <= 0.03) return;
    const ph = Math.floor((c.t * 10 + c.lane) % 4);
    const rad = Math.max(1, Math.round((c.big ? 6 : 4) * p.s));
    const wobble = ph === 0 ? rad : ph === 1 ? Math.max(1, Math.round(rad * 0.6)) : ph === 2 ? 1 : Math.max(1, Math.round(rad * 0.6));
    const y = p.y - 8 * p.s;
    r.fillRect(p.x - wobble, y - rad, wobble * 2, rad * 2, '#f0c020');
    r.fillRect(p.x - Math.max(1, wobble - 1), y - rad + 1, Math.max(1, wobble * 2 - 2), rad * 2 - 2, ph === 2 ? '#f0c020' : '#ffe870');
    if (wobble > 1) r.fillRect(p.x - wobble + 1, y - rad + 1, 1, rad * 2 - 2, '#ffffff');
  }
  private renderProjectile(p: Projectile): void {
    const r = this.game.r;
    const pr = this.road.project(p.laneX, p.z);
    const sz = Math.max(2, Math.round(4 * pr.s));
    const y = pr.y - (10 + p.h) * pr.s;
    const col = p.color ?? (p.kind === 'shell' ? '#3a3a48' : p.kind === 'missile' ? '#e0202a' : p.kind === 'plasma' ? '#40e0f0' : '#ffe870');
    r.fillRect(pr.x - sz / 2, y - sz / 2, sz, sz, col);
    r.fillRect(pr.x - sz / 2 + 1, y - sz / 2 + 1, Math.max(1, sz - 2), Math.max(1, sz - 2), '#ffffff', 0.6);
    if (p.kind === 'missile' || p.kind === 'shell') this.fx.spawn({ x: pr.x, y: y + sz, vx: 0, vy: 20, life: 0.3, maxLife: 0.3, colors: ['#f07020', '#6a6a78'], size: 2 * pr.s, gravity: 0, shrink: true });
  }
  private renderHazard(h: Hazard): void {
    const r = this.game.r;
    const s = this.road.sAt(h.z);
    if (s <= 0.03) return;
    const p = this.road.project(h.lane, h.z);
    const w = Math.round(this.road.laneW * 0.7 * p.s), hh = Math.max(1, Math.round(4 * p.s));
    if (h.kind === 'pothole') { r.fillRect(p.x - w / 2, p.y - hh, w, hh, '#0b0b12'); r.fillRect(p.x - w / 2 + 1, p.y - hh, w - 2, 1, '#3a3a48'); }
    else if (h.kind === 'oil') { r.fillRect(p.x - w / 2, p.y - hh, w, hh, '#16161f'); r.fillRect(p.x - w / 4, p.y - hh, w / 3, 1, '#8030c0', 0.7); }
    else if (h.kind === 'nitro') { const on = Math.floor(h.t * 8) % 2 === 0; r.fillRect(p.x - w / 2, p.y - hh, w, hh, on ? '#40e0f0' : '#2040e0'); r.text('▲', p.x, p.y - hh - 6 * p.s, { align: 'center', color: '#ffffff', scale: Math.max(1, Math.round(p.s)) }); }
    else if (h.kind === 'ice') { r.fillRect(p.x - w / 2, p.y - hh, w, hh, '#c0f0ff', 0.6); }
    else if (h.kind === 'lava') { const on = Math.floor(h.t * 6) % 2 === 0; r.fillRect(p.x - w / 2, p.y - hh, w, hh, on ? '#f07020' : '#e0202a'); }
    else if (h.kind === 'water') { r.fillRect(p.x - w / 2, p.y - hh, w, hh, '#2040e0', 0.5); }
    else if (h.kind === 'cone') { r.fillRect(p.x - 2 * p.s, p.y - 8 * p.s, 4 * p.s, 8 * p.s, '#f07020'); r.fillRect(p.x - 3 * p.s, p.y - 2 * p.s, 6 * p.s, 2 * p.s, '#f4f4f0'); }
    // other kinds (barrier, tollgate, camera…) are drawn by their mechanics
  }
  private renderFinish(): void {
    const dz = this.level.length - this.distance;
    if (dz > SPAWN_Z || dz < -6) return;
    const r = this.game.r;
    const s = this.road.sAt(dz);
    const cx = this.road.centerX(s), hw = this.road.halfW(s), y = this.road.yAt(s);
    // checker line on the road
    const rows = Math.max(1, Math.round(4 * s));
    for (let j = 0; j < rows; j++) for (let i = 0; i < 12; i++) {
      const w = (hw * 2) / 12;
      r.fillRect(cx - hw + i * w, y + j, Math.ceil(w), 1, (i + j) % 2 ? '#f4f4f0' : '#0b0b12');
    }
    // banner
    const bh = Math.round(60 * s / this.road.sAt(PLAYER_Z)), by = y - bh;
    r.fillRect(cx - hw - 3 * s, by, Math.max(1, 3 * s), bh, '#3a3a48');
    r.fillRect(cx + hw, by, Math.max(1, 3 * s), bh, '#3a3a48');
    const bannerH = Math.max(2, Math.round(12 * s / this.road.sAt(PLAYER_Z)));
    r.fillRect(cx - hw - 3 * s, by, hw * 2 + 6 * s, bannerH, '#e0202a');
    if (bannerH >= 8) r.text('FINISH', cx, by + Math.round(bannerH / 2) - 3, { align: 'center', color: '#f4f4f0', scale: 1 });
  }
}

import { tintSprite as tintSpriteLocal } from '../core/Sprite';
