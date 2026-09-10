import type { VehicleDef, VehiclePalette, VehicleStats } from '../core/types';
import { P } from '../core/Palette';

// INTEGRATION NOTE: `UnlockRule` is a single variant, so the Type 90's "tank_pack OR 30 stars + 40000 coins"
// double path is expressed here as the free path (`stars`). `grantProduct('tank_pack')` in services/Store.ts
// already unlocks every `cls === 'tank'` vehicle, so buying the pack still grants the Type 90 as intended.

// ─────────────────────────────────────────────────────────────────────────────
// The 48-vehicle roster of CARLANE. Numbers, ids, names, brands, body templates, classes, abilities and crush
// flags are FINAL (docs/AGENT_GUIDE.md roster table). Palettes follow the "夢のガレージ / JAPAN CAR COLLECTION"
// reference sheet. Everything here is plain, deterministic data — no randomness, no side effects.
//
// Palette slots (see core/Sprite.ts): B body · b shade (darker body) · H light (lighter body) · A accent
// (stripes / wing / decals / trim) · G glass · L lamp (taillights in the rear view) · W wheel · C chrome.
//
// `details.extra` vocabulary for the sprite template agents (single lower-camel token per vehicle):
//   wide        – flared fenders / wide body (GT-R, Supra, GR Supra)
//   popup       – pop-up headlights (RX-7, NSX, AE86, 180SX, MR2)
//   midengine   – engine behind the cabin: rear louvres / vents (NSX, MR2, Beat)
//   panda       – two-tone white top / black lower body (AE86)
//   classic     – 70s long-nose proportions, chrome bumpers (Fairlady 240Z)
//   blackroof   – contrasting black roof (400Z)
//   vents       – hood vents (Evos)
//   hoodscoop   – big rally hood scoop (WRX / STI)
//   lowered     – slammed VIP-style stance (Chaser, Mark II, Cresta)
//   vip         – VIP sedan: chrome trim, curtains, tinted glass (Crown, Celsior)
//   cannonLong  – long main gun (tanks)
//   wheels6     – six wheels (Wolf APC)
//   lifted      – monster-truck lift, giant wheels (Mega Truck)
//   sleeper     – semi truck with sleeper cab (King Hauler)
//   neon        – glowing neon tubes / seams (Party Bus, Volt Lini, Dekotora)
//   polizei     – German police livery: silver body, blue side band, "POLIZEI" (Polizei)
//   ladder      – turntable ladder on the roof (Feuerwehr)
//   hydraulics  – lowrider hydraulics, wire wheels, candy flake (Low Rider)
//   sakura      – cherry-blossom decals (Hako Van)
// ─────────────────────────────────────────────────────────────────────────────

// Extra tones the shared palette lacks (light / dark variants of P.* so that shade < body < light).
const RED_L = '#ff6a5a';
const ORANGE_D = '#a04010';
const ORANGE_L = '#ffa860';
const YELLOW_D = '#a88010';
const PINK_D = '#a01858';
const TEAL_D = '#107868';
const TEAL_L = '#70f0e0';
const PURPLE_L = '#b070f0';
const WHITE_L = '#ffffff';
const SILVER_B = '#c8ccd4';
const SILVER_D = '#8890a0';
const GUN_B = '#505868';
const GUN_D = '#30343f';
const TAN_L = '#f0d090';
const CANDY_B = '#a030b8';
const CANDY_D = '#601870';
const CANDY_L = '#d878f0';
// military tones
const OLIVE = '#6b7a3a';
const OLIVE_D = '#3f4a22';
const OLIVE_L = '#98a65a';
const NATO = '#3d5a34';
const NATO_D = '#23361c';
const NATO_L = '#5f8250';
// smoked VIP glass / dark EV glass
const SMOKE = '#7888a8';
const EV_GLASS = '#2098b0';
const EV_CHROME = '#a0f0ff';

const pal = (
  body: string, shade: string, light: string, accent: string,
  glass: string = P.cyan, lamp: string = P.red, wheel?: string, chrome?: string,
): VehiclePalette => {
  const p: VehiclePalette = { body, shade, light, accent, glass, lamp };
  if (wheel) p.wheel = wheel;
  if (chrome) p.chrome = chrome;
  return p;
};

const st = (speed: number, boost: number, handling: number, durability: number, weight: number): VehicleStats =>
  ({ speed, boost, handling, durability, weight });

// Body colour sets (body, shade, light) straight from the sheet.
type Tone = [string, string, string];
const BLUE: Tone = [P.blue, P.blueDark, P.blueLight];
const RED: Tone = [P.red, P.redDark, RED_L];
const WHITE: Tone = [P.white, P.gray1, WHITE_L];
const BLACK: Tone = [P.gray3, P.dark, P.gray2];
const SILVER: Tone = [SILVER_B, SILVER_D, WHITE_L];
const GUNMETAL: Tone = [GUN_B, GUN_D, SILVER_D];
const PURPLE: Tone = [P.purple, P.purpleDark, PURPLE_L];
const PINK: Tone = [P.pink, PINK_D, P.pinkLight];
const YELLOW: Tone = [P.yellow, YELLOW_D, P.yellowLight];
const ORANGE: Tone = [P.orange, ORANGE_D, ORANGE_L];
const TEAL: Tone = [P.teal, TEAL_D, TEAL_L];
const CANDY: Tone = [CANDY_B, CANDY_D, CANDY_L];

export const VEHICLES: VehicleDef[] = [
  // ── 01–06: starter + pure coin cars (800 → 2500) ─────────────────────────
  {
    id: 'gtr_r34', num: 1, name: 'GT-R R34', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...BLUE, P.white, P.cyan, P.red),
    details: { spoiler: 'wing', lights: 'quad', exhaust: 2, extra: 'wide' },
    stats: st(8, 8, 7, 5, 3), ability: 'nitro', unlock: { type: 'start' },
    desc: { de: 'Godzilla. König der Wangan-Nacht.', en: 'Godzilla. King of the Wangan night.' }, city: 'tokyo',
  },
  {
    id: 'supra_mk4', num: 2, name: 'Supra MK4', brand: 'toyota', cls: 'jdm', body: 'coupe',
    palette: pal(...RED, P.white, P.cyan, P.red),
    details: { spoiler: 'bigwing', lights: 'round', exhaust: 1, extra: 'wide' },
    stats: st(9, 9, 5, 5, 3), ability: 'laser', unlock: { type: 'coins', cost: 800 },
    desc: { de: '2JZ, 1000 PS, kein Limit. Die Wangan-Legende.', en: '2JZ, 1000 hp, no limit. The Wangan legend.' }, city: 'tokyo',
  },
  {
    id: 'rx7_fd', num: 3, name: 'RX-7 FD', brand: 'mazda', cls: 'jdm', body: 'coupe',
    palette: pal(...WHITE, P.red, P.cyan, P.red),
    details: { spoiler: 'ducktail', lights: 'popup', exhaust: 1, extra: 'popup' },
    stats: st(8, 7, 9, 4, 2), ability: 'slowmo', unlock: { type: 'coins', cost: 1200 },
    desc: { de: 'Wankel-Kreischen, Klappaugen, Touge-Königin.', en: 'Rotary scream, pop-up eyes, queen of the touge.' }, city: 'osaka',
  },
  {
    id: 'nsx', num: 4, name: 'NSX', brand: 'honda', cls: 'jdm', body: 'coupe',
    palette: pal(...RED, P.ink, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'popup', exhaust: 2, extra: 'midengine' },
    stats: st(9, 7, 8, 4, 2), ability: 'drone', unlock: { type: 'coins', cost: 1600 },
    desc: { de: 'Mittelmotor-Samurai, von Senna abgestimmt.', en: 'Mid-engine samurai, tuned by Senna himself.' }, city: 'tokyo',
  },
  {
    id: 's2000', num: 5, name: 'S2000', brand: 'honda', cls: 'jdm', body: 'roadster',
    palette: pal(...YELLOW, P.red, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2, roof: 'open' },
    stats: st(7, 6, 9, 4, 2), ability: 'flame', unlock: { type: 'coins', cost: 2000 },
    desc: { de: '9000 Touren VTEC. Dach auf, Haare im Wind.', en: '9000 rpm VTEC. Top down, hair in the wind.' }, city: 'nagoya',
  },
  {
    id: 'ae86', num: 6, name: 'AE86', brand: 'toyota', cls: 'jdm', body: 'hatch',
    palette: pal(...WHITE, P.ink, P.cyan, P.red, P.dark, P.gray1),
    details: { spoiler: 'lip', stripe: 'side', lights: 'popup', exhaust: 1, extra: 'panda' },
    stats: st(5, 5, 10, 4, 2), ability: 'jump', unlock: { type: 'coins', cost: 2500 },
    desc: { de: 'Tofu-Lieferung im Morgengrauen. Kein Tropfen verschüttet.', en: 'Tofu delivery at dawn. Not a single drop spilled.' }, city: 'kyoto',
  },

  // ── 07–18: coins + level gates 3–12 (3000 → 10000) ──────────────────────
  {
    id: 'skyline_r32', num: 7, name: 'Skyline R32', brand: 'nissan', cls: 'jdm', body: 'sedan',
    palette: pal(...GUNMETAL, P.red, P.cyan, P.red),
    details: { spoiler: 'wing', lights: 'quad', exhaust: 2 },
    stats: st(7, 7, 6, 6, 3), ability: 'lanerip', unlock: { type: 'level', level: 3, cost: 3000 },
    desc: { de: 'Der Ur-Godzilla. Gruppe A, 29 Siege in Folge.', en: 'The original Godzilla. Group A, 29 wins in a row.' }, city: 'osaka',
  },
  {
    id: 'skyline_r33', num: 8, name: 'Skyline R33', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...PURPLE, P.white, P.cyan, P.red),
    details: { spoiler: 'wing', lights: 'quad', exhaust: 2 },
    stats: st(8, 7, 6, 5, 3), ability: 'sonicboom', unlock: { type: 'level', level: 4, cost: 3500 },
    desc: { de: 'Midnight Purple. Unter 8 Minuten am Ring.', en: 'Midnight Purple. Under 8 minutes at the Ring.' }, city: 'tokyo',
  },
  {
    id: 'skyline_r34', num: 9, name: 'Skyline R34', brand: 'nissan', cls: 'jdm', body: 'sedan',
    palette: pal(...BLUE, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'quad', exhaust: 2 },
    stats: st(8, 7, 7, 6, 3), ability: 'shockwave', unlock: { type: 'level', level: 4, cost: 4000 },
    desc: { de: 'Vier Türen, vier runde Lichter, ein Ziel: Tokio.', en: 'Four doors, four round lights, one goal: Tokyo.' }, city: 'tokyo',
  },
  {
    id: 'silvia_s15', num: 10, name: 'Silvia S15', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...PINK, P.white, P.cyan, P.red),
    details: { spoiler: 'wing', lights: 'strip', exhaust: 1 },
    stats: st(7, 6, 9, 4, 2), ability: 'phase', unlock: { type: 'level', level: 5, cost: 4500 },
    desc: { de: 'Drift-Königin in Pink. Quer durch jede Kurve.', en: 'Drift queen in pink. Sideways through every corner.' }, city: 'fukuoka',
  },
  {
    id: 'silvia_s14', num: 11, name: 'Silvia S14', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...TEAL, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 1 },
    stats: st(7, 6, 8, 5, 2), ability: 'shuriken', unlock: { type: 'level', level: 5, cost: 5000 },
    desc: { de: 'Kouki-Front, SR20-Herz, Ebisu im Blut.', en: 'Kouki face, SR20 heart, Ebisu in its blood.' }, city: 'osaka',
  },
  {
    id: 's180sx', num: 12, name: '180SX', brand: 'nissan', cls: 'jdm', body: 'hatch',
    palette: pal(...PURPLE, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'popup', exhaust: 1, extra: 'popup' },
    stats: st(7, 6, 8, 4, 2), ability: 'smokescreen', unlock: { type: 'level', level: 6, cost: 5500 },
    desc: { de: 'Klappaugen hoch, Reifen qualmen. Die Drift-Missile.', en: 'Pop-ups up, tires smoking. The drift missile.' }, city: 'nagoya',
  },
  {
    id: 'fairlady_z', num: 13, name: 'Fairlady Z', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...YELLOW, P.ink, P.cyan, P.red, P.dark, P.white),
    details: { spoiler: 'none', lights: 'round', exhaust: 1, extra: 'classic' },
    stats: st(6, 5, 7, 5, 3), ability: 'spin', unlock: { type: 'level', level: 7, cost: 6000 },
    desc: { de: 'Der 240Z von 1970. Der Devil Z lässt grüssen.', en: 'The 1970 240Z. The Devil Z sends its regards.' }, city: 'tokyo',
  },
  {
    id: 'z350', num: 14, name: '350Z', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...ORANGE, P.ink, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2 },
    stats: st(7, 7, 6, 5, 3), ability: 'ram', unlock: { type: 'level', level: 8, cost: 6500 },
    desc: { de: 'V6-Muskel in Orange. Rammt sich durch den Stau.', en: 'V6 muscle in orange. Rams its way through the jam.' }, city: 'osaka',
  },
  {
    id: 'z370', num: 15, name: '370Z', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...WHITE, P.gray3, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2 },
    stats: st(8, 7, 7, 5, 3), ability: 'blink', unlock: { type: 'level', level: 9, cost: 7000 },
    desc: { de: 'Bumerang-Lichter, Nismo-Herz. Weg, bevor du blinzelst.', en: 'Boomerang lights, Nismo heart. Gone before you blink.' }, city: 'tokyo',
  },
  {
    id: 'z400', num: 16, name: '400Z', brand: 'nissan', cls: 'jdm', body: 'coupe',
    palette: pal(...BLUE, P.ink, P.cyan, P.red),
    details: { spoiler: 'ducktail', lights: 'strip', exhaust: 2, extra: 'blackroof' },
    stats: st(9, 8, 7, 5, 3), ability: 'plasma', unlock: { type: 'level', level: 10, cost: 8000 },
    desc: { de: 'Twin-Turbo-Zukunft mit Retro-Seele. Seiran-Blau.', en: 'Twin-turbo future with a retro soul. Seiran blue.' }, city: 'fukuoka',
  },
  {
    id: 'gt86', num: 17, name: 'GT86', brand: 'toyota', cls: 'jdm', body: 'coupe',
    palette: pal(...RED, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'square', exhaust: 2, number: 86 },
    stats: st(6, 5, 9, 5, 2), ability: 'tornado', unlock: { type: 'level', level: 11, cost: 9000 },
    desc: { de: 'Hachiroku-Erbe. Leicht, Heckantrieb, immer quer.', en: 'Hachiroku heir. Light, rear-drive, always sideways.' }, city: 'nagoya',
  },
  {
    id: 'gr_supra', num: 18, name: 'GR Supra', brand: 'gr', cls: 'jdm', body: 'coupe',
    palette: pal(...WHITE, P.red, P.cyan, P.red),
    details: { spoiler: 'ducktail', stripe: 'side', lights: 'strip', exhaust: 2, extra: 'wide' },
    stats: st(9, 9, 7, 5, 3), ability: 'turbojet', unlock: { type: 'level', level: 12, cost: 10000 },
    desc: { de: 'Gazoo Racing. Der Jet unter den Supras.', en: 'Gazoo Racing. The jet among Supras.' }, city: 'nagoya',
  },

  // ── 19–30: coins + level gates 8–20 (8500 → 22000) ──────────────────────
  {
    id: 'evo6', num: 19, name: 'Lancer Evo VI', brand: 'mitsubishi', cls: 'jdm', body: 'sedan',
    palette: pal(...RED, P.white, P.cyan, P.red),
    details: { spoiler: 'bigwing', lights: 'square', exhaust: 1, extra: 'vents' },
    stats: st(7, 7, 8, 6, 3), ability: 'wings', unlock: { type: 'level', level: 8, cost: 8500 },
    desc: { de: 'Tommi-Mäkinen-Edition. Rallye-Flügel, Allrad-Biss.', en: 'Tommi Mäkinen Edition. Rally wing, all-wheel bite.' }, city: 'kyoto',
  },
  {
    id: 'evo9', num: 20, name: 'Lancer Evo IX', brand: 'mitsubishi', cls: 'jdm', body: 'sedan',
    palette: pal(...BLUE, P.white, P.cyan, P.red),
    details: { spoiler: 'bigwing', lights: 'square', exhaust: 1, extra: 'vents' },
    stats: st(8, 7, 8, 6, 3), ability: 'boulder', unlock: { type: 'level', level: 9, cost: 9500 },
    desc: { de: 'MIVEC 4G63. Wirft Felsen wie ein Schotter-Champion.', en: 'MIVEC 4G63. Hurls rocks like a gravel champion.' }, city: 'nagoya',
  },
  {
    id: 'evo10', num: 21, name: 'Lancer Evo X', brand: 'mitsubishi', cls: 'jdm', body: 'sedan',
    palette: pal(...BLACK, P.red, P.cyan, P.red),
    details: { spoiler: 'bigwing', lights: 'strip', exhaust: 2, extra: 'vents' },
    stats: st(8, 8, 7, 6, 3), ability: 'railgun', unlock: { type: 'level', level: 10, cost: 11000 },
    desc: { de: 'Der letzte Evo. Schwarz wie die Nacht, laut wie Donner.', en: 'The last Evo. Black as night, loud as thunder.' }, city: 'tokyo',
  },
  {
    id: 'galant_vr4', num: 22, name: 'Galant VR-4', brand: 'mitsubishi', cls: 'jdm', body: 'sedan',
    palette: pal(...SILVER, P.red, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2, bumper: 'ram' },
    stats: st(7, 6, 6, 7, 4), ability: 'ironbumper', unlock: { type: 'level', level: 11, cost: 12000 },
    desc: { de: 'Der Evo-Vater. Silbern, schwer, unerschütterlich.', en: 'Father of the Evo. Silver, heavy, unshakable.' }, city: 'osaka',
  },
  {
    id: 'wrx', num: 23, name: 'Impreza WRX', brand: 'subaru', cls: 'jdm', body: 'sedan',
    palette: pal(...BLUE, P.gold, P.cyan, P.red, P.gold),
    details: { spoiler: 'wing', lights: 'square', exhaust: 1, extra: 'hoodscoop' },
    stats: st(7, 7, 8, 6, 3), ability: 'quake', unlock: { type: 'level', level: 12, cost: 13000 },
    desc: { de: 'Boxer-Brabbeln, Goldfelgen, Rallye-Blau. Weltmeister.', en: 'Boxer rumble, gold wheels, rally blue. World champion.' }, city: 'kyoto',
  },
  {
    id: 'sti', num: 24, name: 'Impreza STI', brand: 'subaru', cls: 'jdm', body: 'sedan',
    palette: pal(...PINK, P.white, P.cyan, P.red, P.gold),
    details: { spoiler: 'bigwing', lights: 'square', exhaust: 2, extra: 'hoodscoop' },
    stats: st(8, 8, 8, 6, 3), ability: 'rocketjump', unlock: { type: 'level', level: 13, cost: 14000 },
    desc: { de: 'Sakura-Pink mit Riesenflügel. Springt über Berge.', en: 'Sakura pink with a giant wing. Jumps over mountains.' }, city: 'fukuoka',
  },
  {
    id: 'brz', num: 25, name: 'BRZ', brand: 'subaru', cls: 'jdm', body: 'coupe',
    palette: pal(...BLUE, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2 },
    stats: st(6, 5, 9, 5, 2), ability: 'chain', unlock: { type: 'level', level: 14, cost: 15000 },
    desc: { de: 'Boxer-Coupé. Harpuniert alles vor der Haube.', en: 'Boxer coupe. Harpoons anything ahead of the hood.' }, city: 'osaka',
  },
  {
    id: 'chaser_jzx100', num: 26, name: 'Chaser JZX100', brand: 'toyota', cls: 'jdm', body: 'sedan',
    palette: pal(...BLACK, P.white, SMOKE, P.red, P.dark, P.white),
    details: { spoiler: 'lip', lights: 'strip', exhaust: 2, extra: 'lowered' },
    stats: st(8, 7, 6, 6, 3), ability: 'mines', unlock: { type: 'level', level: 15, cost: 16000 },
    desc: { de: '1JZ-Drift-Limousine. Tief, schwarz, gefährlich.', en: '1JZ drift sedan. Low, black, dangerous.' }, city: 'osaka',
  },
  {
    id: 'mark2', num: 27, name: 'Mark II', brand: 'toyota', cls: 'jdm', body: 'sedan',
    palette: pal(...WHITE, P.gray3, P.cyan, P.red),
    details: { spoiler: 'none', lights: 'strip', exhaust: 2, extra: 'lowered' },
    stats: st(6, 6, 6, 7, 4), ability: 'repair', unlock: { type: 'level', level: 16, cost: 17000 },
    desc: { de: 'Weisser Werkstatt-Held. Repariert sich unterwegs.', en: 'White workshop hero. Repairs itself on the road.' }, city: 'nagoya',
  },
  {
    id: 'cresta', num: 28, name: 'Cresta', brand: 'toyota', cls: 'jdm', body: 'sedan',
    palette: pal(...PURPLE, P.white, P.cyan, P.red),
    details: { spoiler: 'none', lights: 'strip', exhaust: 2, extra: 'lowered' },
    stats: st(7, 6, 6, 6, 3), ability: 'timewarp', unlock: { type: 'level', level: 17, cost: 18000 },
    desc: { de: 'Der stille Bruder des Chaser. Hält die Zeit an.', en: "The Chaser's quiet brother. Stops time itself." }, city: 'osaka',
  },
  {
    id: 'soarer', num: 29, name: 'Soarer', brand: 'toyota', cls: 'jdm', body: 'luxury',
    palette: pal(...WHITE, P.gray3, P.blueLight, P.red),
    details: { spoiler: 'none', lights: 'strip', exhaust: 2 },
    stats: st(7, 6, 5, 7, 4), ability: 'freeze', unlock: { type: 'level', level: 18, cost: 20000 },
    desc: { de: 'Weisser Grand Tourer. Eiskalt auf der Bayshore.', en: 'White grand tourer. Ice cold on the Bayshore.' }, city: 'tokyo',
  },
  {
    id: 'crown_athlete', num: 30, name: 'Crown Athlete', brand: 'toyota', cls: 'jdm', body: 'luxury',
    palette: pal(...BLACK, P.white, SMOKE, P.red, P.dark, P.white),
    details: { spoiler: 'none', lights: 'strip', exhaust: 2, extra: 'vip' },
    stats: st(7, 6, 5, 7, 4), ability: 'shield', unlock: { type: 'level', level: 20, cost: 22000 },
    desc: { de: 'Schwarze Krone. VIP-Style, Chrom, Ruhe im Sturm.', en: 'Black crown. VIP style, chrome, calm in the storm.' }, city: 'tokyo',
  },

  // ── 31–36: star gates ────────────────────────────────────────────────────
  {
    id: 'celsior', num: 31, name: 'Celsior', brand: 'lexus', cls: 'jdm', body: 'luxury',
    palette: pal(...BLACK, P.gold, SMOKE, P.red, P.dark, P.gold),
    details: { spoiler: 'none', lights: 'strip', exhaust: 2, extra: 'vip' },
    stats: st(6, 6, 4, 7, 4), ability: 'goldrush', unlock: { type: 'stars', stars: 18, cost: 26000 },
    desc: { de: 'Der VIP-Boss. Goldleisten, tiefer als erlaubt.', en: 'The VIP boss. Gold trim, lower than the law allows.' }, city: 'osaka',
  },
  {
    id: 'is300', num: 32, name: 'IS300', brand: 'lexus', cls: 'jdm', body: 'sedan',
    palette: pal(...SILVER, P.ink, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'afterburner', exhaust: 2 },
    stats: st(7, 7, 7, 6, 3), ability: 'lightning', unlock: { type: 'stars', stars: 21, cost: 18000 },
    desc: { de: 'Reihensechser, Klarglas-Lichter, Blitz im Blut.', en: 'Straight-six, clear-lens lights, lightning in its veins.' }, city: 'fukuoka',
  },
  {
    id: 'altezza', num: 33, name: 'Altezza', brand: 'lexus', cls: 'jdm', body: 'sedan',
    palette: pal(...RED, P.white, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'afterburner', exhaust: 2 },
    stats: st(7, 6, 8, 6, 3), ability: 'anchor', unlock: { type: 'stars', stars: 24, cost: 20000 },
    desc: { de: 'Die japanische IS300. Wirft den Anker, nie das Handtuch.', en: 'The Japanese IS300. Drops the anchor, never the towel.' }, city: 'nagoya',
  },
  {
    id: 'mr2', num: 34, name: 'MR2', brand: 'toyota', cls: 'jdm', body: 'roadster',
    palette: pal(...WHITE, P.ink, P.cyan, P.red),
    details: { spoiler: 'lip', lights: 'popup', exhaust: 1, roof: 'targa', extra: 'midengine' },
    stats: st(7, 6, 9, 4, 2), ability: 'hop', unlock: { type: 'stars', stars: 27, cost: 22000 },
    desc: { de: 'Mittelmotor-Zwerg mit Klappaugen. Hüpft durch alles.', en: 'Mid-engine dwarf with pop-up eyes. Hops through it all.' }, city: 'kyoto',
  },
  {
    id: 'cappuccino', num: 35, name: 'Cappuccino', brand: 'suzuki', cls: 'jdm', body: 'kei',
    palette: pal(...YELLOW, P.ink, P.cyan, P.red, P.dark, P.gray1),
    details: { spoiler: 'none', lights: 'round', exhaust: 1, roof: 'targa' },
    stats: st(5, 5, 10, 3, 1), ability: 'shrink', unlock: { type: 'stars', stars: 30, cost: 15000 },
    desc: { de: '660 ccm Espresso. Passt durch jede Lücke.', en: '660 cc espresso. Fits through any gap.' }, city: 'nagoya',
  },
  {
    id: 'beat', num: 36, name: 'Beat', brand: 'honda', cls: 'jdm', body: 'kei',
    palette: pal(...RED, P.ink, P.cyan, P.red, P.dark, P.gray1),
    details: { spoiler: 'none', lights: 'strip', exhaust: 1, roof: 'open', extra: 'midengine' },
    stats: st(5, 4, 10, 3, 1), ability: 'magnet', unlock: { type: 'stars', stars: 33, cost: 16000 },
    desc: { de: 'Soichiros letztes Baby. Kei-Roadster, Münz-Magnet.', en: "Soichiro's last baby. Kei roadster, coin magnet." }, city: 'osaka',
  },

  // ── 37–39: the tank pack ─────────────────────────────────────────────────
  {
    id: 'type90', num: 37, name: 'Type 90', brand: 'military', cls: 'tank', body: 'tank',
    palette: pal(OLIVE, OLIVE_D, OLIVE_L, P.brown, P.cyan, P.red, P.gray3, P.gray2),
    details: { roof: 'turret', lights: 'square', exhaust: 2, bumper: 'plow', number: 90, extra: 'cannonLong' },
    stats: st(3, 4, 2, 11, 5), ability: 'cannon', crush: true, unlock: { type: 'stars', stars: 30, cost: 40000 },
    desc: { de: 'JGSDF-Kampfpanzer. 120 mm Antwort auf jeden Stau.', en: 'JGSDF main battle tank. A 120 mm answer to traffic.' }, city: 'tokyo',
  },
  {
    id: 'leopard2', num: 38, name: 'Leopard 2', brand: 'military', cls: 'tank', body: 'tank',
    palette: pal(NATO, NATO_D, NATO_L, P.ink, P.cyan, P.red, P.gray3, P.gray2),
    details: { roof: 'turret', lights: 'square', exhaust: 2, bumper: 'plow', extra: 'cannonLong' },
    stats: st(4, 4, 2, 12, 5), ability: 'missile', crush: true, unlock: { type: 'iap', product: 'tank_pack' },
    desc: { de: 'Deutsche Wertarbeit auf Ketten. Zielsuchend, unhöflich.', en: 'German engineering on tracks. Homing and impolite.' }, city: 'duesseldorf',
  },
  {
    id: 'apc', num: 39, name: 'Wolf APC', brand: 'military', cls: 'tank', body: 'apc',
    palette: pal(P.tan, P.brown, TAN_L, P.greenDark, P.cyan, P.red, P.gray3, P.gray2),
    details: { roof: 'turret', lights: 'square', exhaust: 2, bumper: 'bull', extra: 'wheels6' },
    stats: st(5, 5, 3, 10, 5), ability: 'gatling', crush: true, unlock: { type: 'iap', product: 'tank_pack' },
    desc: { de: 'Sechs Räder, ein Gatling, Wüstensand im Getriebe.', en: 'Six wheels, one gatling, desert sand in the gearbox.' }, city: 'cairo',
  },

  // ── 40–44: heavies, level 15–28 (25000 → 36000) ─────────────────────────
  {
    id: 'mega_truck', num: 40, name: 'Mega Truck', brand: 'custom', cls: 'heavy', body: 'monster',
    palette: pal(...RED, P.yellow, P.cyan, P.red, P.dark, P.gray1),
    details: { stripe: 'flames', lights: 'square', exhaust: 2, bumper: 'bull', number: 66, extra: 'lifted' },
    stats: st(5, 6, 3, 9, 5), ability: 'mega', crush: true, unlock: { type: 'level', level: 15, cost: 25000 },
    desc: { de: 'Flammen, Riesenreifen, null Respekt. Walzt alles platt.', en: 'Flames, giant tires, zero respect. Flattens everything.' }, city: 'lasvegas',
  },
  {
    id: 'king_hauler', num: 41, name: 'King Hauler', brand: 'custom', cls: 'heavy', body: 'truck',
    palette: pal(...BLUE, P.white, P.cyan, P.red, P.dark, P.white),
    details: { stripe: 'side', lights: 'square', exhaust: 2, bumper: 'bull', roof: 'rack', extra: 'sleeper' },
    stats: st(5, 5, 2, 10, 5), ability: 'horn', crush: true, unlock: { type: 'level', level: 18, cost: 28000 },
    desc: { de: 'Chrom-König der Interstate. Die Hupe räumt die Spur.', en: 'Chrome king of the interstate. The horn clears the lane.' }, city: 'newyork',
  },
  {
    id: 'party_bus', num: 42, name: 'Party Bus', brand: 'custom', cls: 'heavy', body: 'bus',
    palette: pal(...PURPLE, P.cyan, P.pinkLight, P.pink, P.dark, P.white),
    details: { stripe: 'double', lights: 'strip', exhaust: 2, extra: 'neon' },
    stats: st(4, 5, 2, 9, 5), ability: 'bass', crush: true, unlock: { type: 'level', level: 21, cost: 30000 },
    desc: { de: 'Neon, Bässe, 40 Gäste. Der Club fährt selbst.', en: 'Neon, bass, 40 guests. The club drives itself.' }, city: 'losangeles',
  },
  {
    id: 'polizei', num: 43, name: 'Polizei', brand: 'city', cls: 'special', body: 'police',
    palette: pal(...SILVER, P.blue, P.cyan, P.red),
    details: { spoiler: 'none', stripe: 'side', lights: 'strip', exhaust: 2, roof: 'lightbar', extra: 'polizei' },
    stats: st(7, 7, 7, 6, 3), ability: 'siren', unlock: { type: 'level', level: 24, cost: 32000 },
    desc: { de: 'Silber-Blau aus Düsseldorf. Sirene an, Spur frei.', en: 'Silver and blue from Düsseldorf. Siren on, lane clear.' }, city: 'duesseldorf',
  },
  {
    id: 'feuerwehr', num: 44, name: 'Feuerwehr', brand: 'city', cls: 'heavy', body: 'firetruck',
    palette: pal(...RED, P.white, P.cyan, P.red, P.dark, P.gray1),
    details: { stripe: 'side', lights: 'square', exhaust: 2, roof: 'rack', extra: 'ladder' },
    stats: st(5, 5, 3, 10, 5), ability: 'watercannon', crush: true, unlock: { type: 'level', level: 28, cost: 36000 },
    desc: { de: 'Drehleiter-Löschzug. Spült den Stau von der Strasse.', en: 'Ladder truck. Hoses the traffic right off the road.' }, city: 'duesseldorf',
  },

  // ── 45: Legend Pass exclusive ────────────────────────────────────────────
  {
    id: 'volt_lini', num: 45, name: 'Volt Lini', brand: 'volt', cls: 'special', body: 'hyper',
    palette: pal(P.dark, P.ink, P.gray3, P.cyan, EV_GLASS, P.cyan, P.ink, EV_CHROME),
    details: { spoiler: 'wing', stripe: 'double', lights: 'strip', exhaust: 4, extra: 'neon' },
    stats: st(10, 10, 8, 6, 3), ability: 'emp', crush: true, unlock: { type: 'iap', product: 'legend_pass' },
    desc: { de: 'Elektrische Hyper-Limo. Glühende Nähte, stiller Blitz.', en: 'Electric hyper-limo. Glowing seams, silent lightning.' }, city: 'shanghai',
  },

  // ── 46–48: coins / stars ─────────────────────────────────────────────────
  {
    id: 'lowrider', num: 46, name: 'Low Rider', brand: 'custom', cls: 'special', body: 'lowrider',
    palette: pal(...CANDY, P.gold, P.cyan, P.red, P.gold, P.gold),
    details: { spoiler: 'none', stripe: 'double', lights: 'round', exhaust: 2, extra: 'hydraulics' },
    stats: st(5, 5, 5, 6, 4), ability: 'fireworks', unlock: { type: 'coins', cost: 38000 },
    desc: { de: 'Candy-Lack, Speichenfelgen, Hydraulik. Hüpft und feiert.', en: 'Candy paint, wire wheels, hydraulics. Bounces and parties.' }, city: 'losangeles',
  },
  {
    id: 'dekotora', num: 47, name: 'Dekotora', brand: 'custom', cls: 'heavy', body: 'truck',
    palette: pal(...SILVER, P.gold, P.cyan, P.orange, P.dark, P.gold),
    details: { stripe: 'double', lights: 'strip', exhaust: 2, bumper: 'bull', roof: 'rack', extra: 'neon' },
    stats: st(5, 6, 3, 10, 5), ability: 'dragon', crush: true, unlock: { type: 'stars', stars: 60, cost: 60000 },
    desc: { de: 'Der Deko-Truck. Chrom, Neon, Gold und ein Drache.', en: 'The decorated truck. Chrome, neon, gold and a dragon.' }, city: 'fukuoka',
  },
  {
    id: 'hako_van', num: 48, name: 'Hako Van', brand: 'toyota', cls: 'special', body: 'van',
    palette: pal(...WHITE, P.sakura, P.cyan, P.red),
    details: { spoiler: 'none', stripe: 'side', lights: 'square', exhaust: 1, roof: 'rack', extra: 'sakura' },
    stats: st(4, 4, 7, 4, 1), ability: 'blossom', unlock: { type: 'stars', stars: 42, cost: 24000 },
    desc: { de: 'Weisser Kei-Kasten mit Sakura-Folie. Blütenzauber.', en: 'White kei box van in sakura wrap. Petal magic.' }, city: 'kyoto',
  },
];

export function getVehicle(id: string): VehicleDef {
  return VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
}
