// Vivid 8-bit palette inspired by the reference sheet. Use these names everywhere so the
// game reads as one system.
export const P = {
  black: '#0b0b12',
  ink: '#16161f',
  dark: '#23232f',
  gray3: '#3a3a48',
  gray2: '#6a6a78',
  gray1: '#a8a8b4',
  paper: '#d9d9d2', // bezel gray from the sheet
  paperDark: '#b8b8b0',
  white: '#f4f4f0',
  red: '#e0202a',
  redDark: '#8a1018',
  orange: '#f07020',
  yellow: '#f0c020',
  yellowLight: '#ffe870',
  green: '#20b040',
  greenDark: '#0e6a2a',
  teal: '#20c0b0',
  cyan: '#40e0f0',
  blue: '#2040e0',
  blueDark: '#101c80',
  blueLight: '#60a0ff',
  purple: '#8030c0',
  purpleDark: '#48187a',
  pink: '#e04080',
  pinkLight: '#ff90c0',
  sakura: '#ffb7d0',
  brown: '#7a4a20',
  tan: '#d0a060',
  gold: '#ffd040',
  skin: '#f0c0a0',
} as const;

export type PaletteKey = keyof typeof P;

/** Parse #rgb/#rrggbb → [r,g,b]. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
/** Mix two colors, t in 0..1 (0 = a). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export function shade(hex: string, amt: number): string {
  // amt < 0 darkens, > 0 lightens
  return amt < 0 ? mix(hex, '#000000', -amt) : mix(hex, '#ffffff', amt);
}
/** Quantize a color to a chunky 8-bit-ish level set so gradients stay "retro". */
export function quantize(hex: string, levels = 8): string {
  const [r, g, b] = hexToRgb(hex);
  const q = (v: number) => Math.round((v / 255) * (levels - 1)) * (255 / (levels - 1));
  return rgbToHex(q(r), q(g), q(b));
}
