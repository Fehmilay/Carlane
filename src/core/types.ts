// ─────────────────────────────────────────────────────────────────────────────
// CARLANE shared types. Every module builds against these. Keep this file the
// single source of truth for cross-module contracts.
// ─────────────────────────────────────────────────────────────────────────────

export const GAME_W = 240;
export const MIN_GAME_H = 400;
export const MAX_GAME_H = 600;

export type Lang = 'de' | 'en';
export type LocalizedText = { de: string; en: string };

// ── Sprites ─────────────────────────────────────────────────────────────────
/** Char → CSS color. `null`/'.'/' ' = transparent. Recolor slots: B b H A G L W (see Sprite.ts). */
export type CharMap = Record<string, string | null>;
export interface SpriteSource {
  id: string;
  rows: string[];
  map?: CharMap; // optional per-sprite overrides, merged over the global default map
  /** Anchor in pixels (default: bottom-center). */
  ax?: number;
  ay?: number;
}

/** Recolorable vehicle palette. Slot chars in vehicle sprites map to these keys. */
export interface VehiclePalette {
  body: string; // B
  shade: string; // b
  light: string; // H (highlight)
  accent: string; // A (stripe / spoiler / decal)
  glass: string; // G
  lamp: string; // L (headlight / taillight)
  wheel?: string; // W (default #202020)
  chrome?: string; // C (default #d8d8e0)
}

// ── Vehicles ────────────────────────────────────────────────────────────────
export type BodyTemplate =
  | 'coupe' // GT-R, Supra, RX-7, NSX, 350Z...
  | 'sedan' // Skyline sedans, Evo, WRX, Chaser, Mark II...
  | 'hatch' // AE86, 180SX...
  | 'kei' // Cappuccino, Beat
  | 'roadster' // S2000, MR2
  | 'wagon'
  | 'luxury' // Celsior, Crown, Soarer
  | 'suv'
  | 'pickup'
  | 'van'
  | 'truck' // semi truck
  | 'bus'
  | 'tank'
  | 'apc'
  | 'monster' // monster truck
  | 'hyper' // low, wide electric hypercar
  | 'limo'
  | 'police'
  | 'firetruck'
  | 'lowrider'
  | 'taxi'
  | 'tuktuk'
  | 'tram';

export type VehicleClass = 'jdm' | 'heavy' | 'tank' | 'special';

export interface VehicleStats {
  /** 1..10 — base cruising speed */
  speed: number;
  /** 1..10 — boost strength */
  boost: number;
  /** 1..10 — lane-change snappiness */
  handling: number;
  /** hit points (3..12) */
  durability: number;
  /** 1..5 — affects crush, knockback, collision damage dealt */
  weight: number;
}

export type UnlockRule =
  | { type: 'start' }
  | { type: 'coins'; cost: number }
  | { type: 'level'; level: number; cost: number }
  | { type: 'iap'; product: ProductId }
  | { type: 'stars'; stars: number; cost: number };

export interface VehicleDef {
  id: string;
  /** Display number "01".."48" */
  num: number;
  name: string;
  brand: BrandId;
  cls: VehicleClass;
  body: BodyTemplate;
  palette: VehiclePalette;
  /** Optional cosmetic details for sprite templates. */
  details?: VehicleDetails;
  stats: VehicleStats;
  ability: AbilityId;
  /** Drives over normal traffic without taking damage. */
  crush?: boolean;
  unlock: UnlockRule;
  /** Short flavor text shown in the garage. */
  desc: LocalizedText;
  /** Home city id (garage backdrop) */
  city?: CityId;
}

export interface VehicleDetails {
  spoiler?: 'none' | 'lip' | 'wing' | 'bigwing' | 'ducktail';
  stripe?: 'none' | 'center' | 'side' | 'double' | 'checker' | 'flames';
  exhaust?: 1 | 2 | 4;
  lights?: 'round' | 'square' | 'strip' | 'quad' | 'afterburner' | 'popup';
  roof?: 'hard' | 'targa' | 'open' | 'lightbar' | 'turret' | 'rack';
  number?: number; // racing number decal
  bumper?: 'stock' | 'bull' | 'plow' | 'ram';
  extra?: string; // template-specific hint (e.g. 'wide', 'lifted', 'cannonLong')
}

export type BrandId =
  | 'nissan' | 'toyota' | 'mazda' | 'honda' | 'mitsubishi' | 'subaru' | 'lexus' | 'suzuki'
  | 'gr' | 'nismo' | 'military' | 'volt' | 'city' | 'custom';

// ── Abilities ───────────────────────────────────────────────────────────────
export type AbilityId =
  | 'nitro' | 'jump' | 'phase' | 'cannon' | 'missile' | 'emp' | 'shield' | 'laser'
  | 'magnet' | 'slowmo' | 'shrink' | 'mega' | 'ram' | 'flame' | 'wings' | 'blink'
  | 'ironbumper' | 'goldrush' | 'repair' | 'spin' | 'freeze' | 'drone' | 'horn'
  | 'lightning' | 'shuriken' | 'lanerip' | 'hop' | 'sonicboom' | 'siren' | 'watercannon'
  | 'smokescreen' | 'boulder' | 'chain' | 'tornado' | 'quake' | 'mines' | 'gatling'
  | 'shockwave' | 'timewarp' | 'blossom' | 'dragon' | 'anchor' | 'plasma' | 'fireworks'
  | 'bass' | 'rocketjump' | 'turbojet' | 'railgun';

export type AbilityKind = 'instant' | 'duration' | 'projectile';

export interface AbilityDef {
  id: AbilityId;
  name: LocalizedText;
  /** One-line explanation for the one-time tutorial card. */
  desc: LocalizedText;
  kind: AbilityKind;
  /** seconds */
  cooldown: number;
  /** seconds (duration abilities) */
  duration?: number;
  /** 16×16 icon sprite id (content/icons.ts) */
  icon: string;
  /** HUD accent color for the button */
  color: string;
}

// ── Cities & levels ─────────────────────────────────────────────────────────
export type CityId =
  | 'tokyo' | 'osaka' | 'nagoya' | 'fukuoka' | 'kyoto'
  | 'duesseldorf' | 'berlin' | 'munich' | 'istanbul' | 'paris' | 'london' | 'rome'
  | 'amsterdam' | 'barcelona' | 'moscow' | 'reykjavik'
  | 'newyork' | 'losangeles' | 'lasvegas' | 'mexicocity' | 'rio'
  | 'dubai' | 'cairo' | 'capetown' | 'mumbai' | 'bangkok' | 'seoul' | 'shanghai'
  | 'hongkong' | 'sydney';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface CityPalette {
  skyTop: string;
  skyBottom: string;
  /** far skyline silhouette */
  farSky: string;
  /** near skyline color */
  nearSky: string;
  /** window / neon light dots */
  glow: string;
  ground: string;
  groundAlt: string; // roadside stripe / grass alt
  road: string;
  roadAlt: string; // alternating road band shade
  stripe: string;
  curb: string;
  curbAlt: string;
  /** haze color mixed into far objects (fog/dusk) */
  haze: string;
  sun?: string;
  moon?: string;
}

export interface CityDef {
  id: CityId;
  name: LocalizedText;
  country: LocalizedText;
  /** ISO 3166-1 alpha-2, used for the pixel flag */
  countryCode: string;
  /** Decorative kanji / glyph shown in the level card (optional) */
  glyph?: string;
  palettes: Partial<Record<TimeOfDay, CityPalette>> & { day: CityPalette };
  /** Roadside prop sprite ids (content/props.ts) picked at random for this city. */
  props: string[];
  /** Traffic vehicle template ids typical for this city (taxi, tuktuk, police...). */
  traffic: string[];
  /** Music style id */
  music: MusicStyle;
  /** Optional vertical slogans drawn in the sky (left, right) with English captions; defaults to the JDM pair. */
  slogans?: [string, string];
  captions?: [string, string];
  /** Lamp-post prop id placed regularly on both roadsides ('' = none). Default 'lamp'. */
  lampProp?: string;
  /** Texts for the neon billboards along the road (native script welcome). Default: [glyph, NAME]. */
  billboards?: string[];
  /** Destinations shown on the green highway signs. Default: [name, country]. */
  signs?: string[];
}

export type MusicStyle =
  | 'jdm' | 'eurobeat' | 'techno' | 'anatolian' | 'chanson' | 'britpop' | 'italo'
  | 'hiphop' | 'latin' | 'arabic' | 'bollywood' | 'kpop' | 'chinese' | 'afro' | 'nordic' | 'surf';

export type MechanicId =
  | 'rain' | 'snow' | 'fog' | 'night' | 'ice' | 'sandstorm' | 'wind' | 'heat'
  | 'oncoming' | 'construction' | 'tunnels' | 'bridge' | 'potholes' | 'oilslicks'
  | 'police' | 'trains' | 'boss_truck' | 'boss_tank' | 'boss_bus' | 'earthquake'
  | 'festival' | 'neon' | 'nitro_pads' | 'toll' | 'convoy' | 'drawbridge' | 'lava'
  | 'aurora' | 'traffic_jam' | 'wrongway' | 'meteor' | 'flood' | 'speed_cameras'
  | 'blossom' | 'fireworks' | 'monsoon' | 'curves' | 'hills';

export interface LevelDef {
  id: number; // 1..30
  city: CityId;
  name: LocalizedText;
  lanes: 3 | 5;
  /** meters */
  length: number;
  timeOfDay: TimeOfDay;
  /** 0..1 spawn probability scale */
  density: number;
  /** traffic speed relative to player base (0.3..0.9) */
  trafficSpeed: number;
  /** player speed multiplier for this level (1 = normal) */
  speedMul: number;
  mechanics: MechanicId[];
  /** score thresholds for 1/2/3 stars */
  stars: [number, number, number];
  /** coin reward on first completion */
  reward: number;
  /** road curviness 0..1 */
  curves: number;
  /** probability of heavy traffic (trucks/buses) 0..1 */
  heavy: number;
  /** flavor description */
  desc: LocalizedText;
}

// ── Save data ───────────────────────────────────────────────────────────────
export type ProductId =
  | 'revive_3' | 'revive_10' | 'coins_s' | 'coins_m' | 'coins_l' | 'coins_xl'
  | 'tank_pack' | 'legend_pass' | 'unlock_all';

export interface SaveData {
  v: number;
  coins: number;
  revives: number;
  selectedVehicle: string;
  unlocked: string[];
  /** level id → best result */
  levels: Record<string, { stars: number; best: number; done: boolean }>;
  purchases: Partial<Record<ProductId, boolean>>;
  tutorialsSeen: Record<string, boolean>;
  settings: { sound: boolean; music: boolean; haptics: boolean; lang: Lang | 'auto'; lefty: boolean };
  stats: { runs: number; kills: number; distance: number; coinsEarned: number; bestScore: number };
  createdAt: number;
}

// ── Screens / input ─────────────────────────────────────────────────────────
export type PointerKind = 'down' | 'move' | 'up' | 'cancel';
export interface PointerEv {
  kind: PointerKind;
  /** game-space coordinates */
  x: number;
  y: number;
  id: number;
  t: number; // ms
}

export interface Screen {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  render(): void;
  onPointer?(ev: PointerEv): void;
  onKey?(code: string, down: boolean): void;
  /** hardware/back gesture. return true if handled */
  onBack?(): boolean;
  /** called when the app goes to the background (auto-pause) */
  onHide?(): void;
  /** overlay screens render on top of the one below */
  overlay?: boolean;
}

export interface Rect { x: number; y: number; w: number; h: number; }
export const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
