import type { MechanicId } from '../core/types';
import type { World } from './World';

/**
 * Level mechanics (weather, hazards, bosses…). Created per run from LevelDef.mechanics.
 * Mechanics mutate `world.mod` (modifiers) every frame and may spawn entities.
 */
export interface Mechanic {
  readonly id: MechanicId;
  update(dt: number): void;
  /** drawn after the sky/skyline, before the road (e.g. far weather) */
  renderBack?(): void;
  /** drawn after the road, before the entities (e.g. flat road hazards) */
  renderRoad?(): void;
  /** drawn after all entities, before the HUD (rain, fog, flashes) */
  renderFront?(): void;
  /** Called once when the run starts. */
  start?(): void;
}

/** Per-frame modifiers that mechanics/abilities write and the world reads. Reset each frame. */
export interface WorldMod {
  /** multiply player speed */
  speed: number;
  /** multiply spawn rate */
  spawn: number;
  /** multiply traffic speed */
  trafficSpeed: number;
  /** 0..1 fog strength */
  fog: number;
  /** 0..1 darkness overlay */
  dark: number;
  /** lane change responsiveness multiplier (ice < 1) */
  grip: number;
  /** time scale for traffic/projectiles (slow-mo) */
  timeScale: number;
  /** coin value multiplier */
  coinMul: number;
  /** extra screen tint */
  tint: string | null;
  tintA: number;
}

export function defaultMod(): WorldMod {
  return { speed: 1, spawn: 1, trafficSpeed: 1, fog: 0, dark: 0, grip: 1, timeScale: 1, coinMul: 1, tint: null, tintA: 0 };
}

export abstract class BaseMechanic implements Mechanic {
  abstract readonly id: MechanicId;
  constructor(protected w: World) {}
  abstract update(dt: number): void;
}
