import type { PixelSprite } from '../core/Sprite';

/** Visual + gameplay template for a traffic vehicle (from content/vehicleSprites.ts). */
export interface TrafficTemplate {
  id: string;
  sprite: PixelSprite;
  /** hits needed to destroy (1 = normal car, 2-3 = heavy) */
  hp: number;
  heavy: boolean;
  /** damage dealt to the player on collision */
  damage: number;
  /** relative speed factor (1 = level traffic speed) */
  speed: number;
  /** points for destroying */
  points: number;
  /** width in lanes for collision (1 = normal) */
  width?: number;
  /** boss flag: does not get destroyed by one hit and shows a health bar */
  boss?: boolean;
}

export type TrafficState = 'alive' | 'wreck' | 'frozen' | 'stalled' | 'pulled';

export class Traffic {
  static nextId = 1;
  id = Traffic.nextId++;
  lane: number;
  laneX: number;
  z: number;
  speed: number;
  hp: number;
  state: TrafficState = 'alive';
  /** seconds in wreck state */
  wreckT = 0;
  /** knock direction for wrecks (-1 / +1) */
  knock = 0;
  /** vertical launch for wrecks (px) */
  launch = 0;
  /** hit flash timer */
  flash = 0;
  /** freeze / stall timer */
  stateT = 0;
  /** lane-change target (traffic may change lanes in some levels) */
  targetLane: number;
  /** oncoming vehicles drive toward the player (negative relative speed) */
  oncoming = false;
  /** visual y offset (bumps) */
  bump = 0;
  /** true when the player passed it (near-miss scoring) */
  passed = false;
  scored = false;
  /** how many times the player hit it (for bosses) */
  hits = 0;
  constructor(public tpl: TrafficTemplate, lane: number, z: number, speed: number) {
    this.lane = lane; this.laneX = lane; this.targetLane = lane; this.z = z; this.speed = speed; this.hp = tpl.hp;
  }
  get alive(): boolean { return this.state === 'alive' || this.state === 'frozen' || this.state === 'stalled' || this.state === 'pulled'; }
  get collidable(): boolean { return this.state !== 'wreck'; }
}
