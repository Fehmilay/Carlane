import type { Lang, LocalizedText } from './types';

let current: Lang = 'de';

export function setLang(l: Lang | 'auto'): void {
  if (l === 'auto') {
    const nav = (navigator.language || 'de').toLowerCase();
    current = nav.startsWith('de') ? 'de' : 'en';
  } else current = l;
}
export function lang(): Lang { return current; }
/** Resolve a LocalizedText for the current language. */
export function L(t: LocalizedText | string | undefined): string {
  if (t === undefined) return '';
  if (typeof t === 'string') return t;
  return t[current] ?? t.en ?? t.de;
}

/** UI string table. Keys are added by screens as needed. */
export const STR: Record<string, LocalizedText> = {
  play: { de: 'SPIELEN', en: 'PLAY' },
  garage: { de: 'GARAGE', en: 'GARAGE' },
  map: { de: 'KARTE', en: 'MAP' },
  shop: { de: 'SHOP', en: 'SHOP' },
  settings: { de: 'OPTIONEN', en: 'SETTINGS' },
  back: { de: 'ZURÜCK', en: 'BACK' },
  select: { de: 'WÄHLEN', en: 'SELECT' },
  selected: { de: 'GEWÄHLT', en: 'SELECTED' },
  unlock: { de: 'FREISCHALTEN', en: 'UNLOCK' },
  locked: { de: 'GESPERRT', en: 'LOCKED' },
  level: { de: 'LEVEL', en: 'LEVEL' },
  start: { de: 'START', en: 'START' },
  pause: { de: 'PAUSE', en: 'PAUSED' },
  resume: { de: 'WEITER', en: 'RESUME' },
  restart: { de: 'NEUSTART', en: 'RESTART' },
  quit: { de: 'BEENDEN', en: 'QUIT' },
  gameover: { de: 'ZERSTÖRT!', en: 'WRECKED!' },
  finish: { de: 'ZIEL!', en: 'FINISH!' },
  revive: { de: 'WEITERFAHREN', en: 'REVIVE' },
  score: { de: 'PUNKTE', en: 'SCORE' },
  best: { de: 'REKORD', en: 'BEST' },
  coins: { de: 'MÜNZEN', en: 'COINS' },
  distance: { de: 'STRECKE', en: 'DISTANCE' },
  kills: { de: 'WRACKS', en: 'WRECKS' },
  newRecord: { de: 'NEUER REKORD!', en: 'NEW RECORD!' },
  tapToStart: { de: 'TIPPEN ZUM STARTEN', en: 'TAP TO START' },
  speed: { de: 'TEMPO', en: 'SPEED' },
  boost: { de: 'BOOST', en: 'BOOST' },
  handling: { de: 'LENKUNG', en: 'HANDLING' },
  durability: { de: 'PANZERUNG', en: 'DURABILITY' },
  weight: { de: 'GEWICHT', en: 'WEIGHT' },
  ability: { de: 'SPEZIAL', en: 'SPECIAL' },
  sound: { de: 'SOUND', en: 'SOUND' },
  music: { de: 'MUSIK', en: 'MUSIC' },
  haptics: { de: 'VIBRATION', en: 'HAPTICS' },
  language: { de: 'SPRACHE', en: 'LANGUAGE' },
  restore: { de: 'KÄUFE WIEDERHERSTELLEN', en: 'RESTORE PURCHASES' },
  notEnough: { de: 'NICHT GENUG MÜNZEN', en: 'NOT ENOUGH COINS' },
  buy: { de: 'KAUFEN', en: 'BUY' },
  owned: { de: 'GEKAUFT', en: 'OWNED' },
  continue: { de: 'WEITER', en: 'CONTINUE' },
  next: { de: 'NÄCHSTES', en: 'NEXT' },
  ok: { de: 'OK', en: 'OK' },
  cancel: { de: 'ABBRECHEN', en: 'CANCEL' },
  ready: { de: 'BEREIT?', en: 'READY?' },
  go: { de: 'LOS!', en: 'GO!' },
  swipeHint: { de: 'WISCHE ← → ZUM SPURWECHSEL', en: 'SWIPE ← → TO CHANGE LANES' },
  holdHint: { de: 'HALTEN = BOOST', en: 'HOLD = BOOST' },
  abilityHint: { de: 'TIPPE DEN BUTTON: SPEZIAL', en: 'TAP THE BUTTON: SPECIAL' },
  combo: { de: 'KOMBO', en: 'COMBO' },
  reviveOffer: { de: 'WEITERFAHREN?', en: 'KEEP DRIVING?' },
  noRevives: { de: 'KEINE REVIVES', en: 'NO REVIVES' },
  stars: { de: 'STERNE', en: 'STARS' },
  requiresLevel: { de: 'LEVEL {n} NÖTIG', en: 'NEEDS LEVEL {n}' },
  requiresStars: { de: '{n} STERNE NÖTIG', en: 'NEEDS {n} STARS' },
  premium: { de: 'PREMIUM', en: 'PREMIUM' },
};

export function t(key: string, vars?: Record<string, string | number>): string {
  const e = STR[key];
  let s = e ? (e[current] ?? e.en) : key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}
