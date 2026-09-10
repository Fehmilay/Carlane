import type { Renderer } from '../../core/Renderer';
import type { CityPalette, TimeOfDay } from '../../core/types';
import { mix } from '../../core/Palette';
import { kanjiSprite } from '../../core/Kanji';

// Shared skyline drawing helpers (pixel silhouettes, windows, sun, clouds, water…).

/** Deterministic hash → 0..1 */
export const h01 = (a: number, b = 0): number => { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; x = x ^ (x >>> 16); return ((x >>> 0) % 10000) / 10000; };
export const isDark = (tod: TimeOfDay): boolean => tod === 'night' || tod === 'dusk';
export const isNight = (tod: TimeOfDay): boolean => tod === 'night';

/** Sun / moon disc with a banded glow. */
export function sun(r: Renderer, x: number, y: number, rad: number, color: string, glow: string, bands = 3): void {
  for (let i = bands; i >= 1; i--) r.disc(x, y, rad + i * 4, mix(glow, color, 0.3), 0.18);
  r.disc(x, y, rad, color);
  r.disc(x - Math.round(rad * 0.3), y - Math.round(rad * 0.3), Math.max(1, Math.round(rad * 0.35)), mix(color, '#ffffff', 0.5));
}

/** Pixel clouds along a band; `px` = parallax. */
export function clouds(r: Renderer, y: number, px: number, color: string, seed = 1, n = 5, spread = 40): void {
  for (let i = 0; i < n; i++) {
    const cx = ((i * 97 + seed * 31 + px * 0.2) % 320 + 320) % 320 - 40;
    const cy = y + Math.round((h01(i, seed) - 0.5) * spread);
    const w = 14 + Math.round(h01(i + 3, seed) * 22);
    r.fillRect(cx, cy, w, 3, color);
    r.fillRect(cx + 3, cy - 2, w - 8, 2, color);
    r.fillRect(cx + 6, cy - 4, Math.max(2, w - 14), 2, color);
  }
}

/** Filled block with glowing windows (dark times) or subtle window lines (day). */
export function block(r: Renderer, x: number, y: number, w: number, h: number, color: string, glow: string, tod: TimeOfDay, seed = 1, density = 0.6): void {
  r.fillRect(x, y - h, w, h, color);
  const dark = isDark(tod);
  const wc = dark ? glow : mix(color, '#ffffff', 0.18);
  for (let wy = y - h + 3; wy < y - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
    if (h01(wx * 7 + wy, seed) < (dark ? density : density * 0.5)) r.fillRect(wx, wy, 2, 2, wc);
  }
}

/** Generic dense city layer: `n` towers between x0..x1 with heights minH..maxH. */
export function towers(r: Renderer, y: number, px: number, color: string, glow: string, tod: TimeOfDay, seed: number, n: number, minH: number, maxH: number, x0 = -40, x1 = 280, minW = 10, maxW = 24): void {
  const span = x1 - x0;
  for (let i = 0; i < n; i++) {
    const w = minW + Math.round(h01(i, seed) * (maxW - minW));
    const bx = x0 + Math.round(((i / n) * span + px + h01(i + 11, seed) * 12) % span + span) % span + x0;
    const h = minH + Math.round(h01(i + 5, seed) * (maxH - minH));
    block(r, bx, y, w, h, color, glow, tod, seed + i);
    if (h01(i + 9, seed) < 0.3) r.fillRect(bx + Math.round(w / 2), y - h - 4, 1, 4, color);
  }
}

/** Triangle mountain with optional snow cap. */
export function mountain(r: Renderer, cx: number, y: number, w: number, h: number, color: string, snow?: string, snowH = 0.3): void {
  for (let j = 0; j < h; j++) {
    const hw = Math.round((w / 2) * (j / h));
    r.fillRect(cx - hw, y - h + j, hw * 2 + 1, 1, j < h * snowH && snow ? snow : color);
  }
}

/** Water strip with horizontal light reflections (draw just above the horizon). */
export function water(r: Renderer, y: number, h: number, color: string, light: string, t: number, px = 0): void {
  r.fillRect(0, y - h, r.w, h, color);
  for (let i = 0; i < 18; i++) {
    const wx = ((i * 53 + Math.round(t * 6) + Math.round(px)) % 260 + 260) % 260 - 10;
    const wy = y - h + 1 + ((i * 7) % Math.max(1, h - 2));
    r.fillRect(wx, wy, 4 + (i % 3) * 2, 1, light);
  }
}

/** Dome (half ellipse) sitting on y. */
export function dome(r: Renderer, cx: number, y: number, rx: number, ry: number, color: string): void {
  for (let j = 0; j <= ry; j++) {
    const hw = Math.round(rx * Math.sqrt(1 - (j / ry) * (j / ry)));
    r.fillRect(cx - hw, y - j, hw * 2 + 1, 1, color);
  }
}

/** Tapered spire. */
export function spire(r: Renderer, cx: number, y: number, w: number, h: number, color: string): void {
  for (let j = 0; j < h; j++) { const hw = Math.max(0, Math.round((w / 2) * (j / h))); r.fillRect(cx - hw, y - h + j, hw * 2 + 1, 1, color); }
}

/** Suspension / cable bridge silhouette between x0..x1 with deck at y. */
export function bridge(r: Renderer, x0: number, x1: number, y: number, towerH: number, color: string, cable: string, arch = false): void {
  r.fillRect(x0, y, x1 - x0, 2, color);
  const t0 = x0 + Math.round((x1 - x0) * 0.25), t1 = x0 + Math.round((x1 - x0) * 0.75);
  if (arch) {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    for (let x = x0; x <= x1; x++) { const u = (x - cx) / (w / 2); const ay = Math.round(y - towerH * (1 - u * u)); r.fillRect(x, ay, 1, 2, color); if ((x - x0) % 6 === 0) r.fillRect(x, ay, 1, y - ay, cable); }
    return;
  }
  r.fillRect(t0 - 1, y - towerH, 3, towerH, color);
  r.fillRect(t1 - 1, y - towerH, 3, towerH, color);
  for (let x = x0; x <= x1; x += 2) {
    const u = x < t0 ? (t0 - x) / (t0 - x0) : x > t1 ? (x - t1) / (x1 - t1) : Math.abs(x - (t0 + t1) / 2) / ((t1 - t0) / 2);
    const cy = Math.round(y - towerH * (x < t0 || x > t1 ? 1 - u : 0.2 + 0.8 * u * u));
    r.px(x, cy, cable);
    if (x % 8 === 0) r.fillRect(x, cy, 1, y - cy, cable);
  }
}

/** Neon / name sign sprite drawn at (x, y) top-left. */
export function neon(r: Renderer, text: string, x: number, y: number, color: string, size = 10, vertical = false, bg = '#16161f', alpha = 1): void {
  const s = kanjiSprite(text, { size, vertical, color, bold: true, gap: 1 });
  r.fillRect(x - 2, y - 2, s.w + 3, s.h + 3, '#0b0b12', alpha);
  r.fillRect(x - 1, y - 1, s.w + 1, s.h + 1, bg, alpha);
  r.sprite(s, x, y, { origin: 'topleft', alpha });
}

/** Palm silhouette (for skylines). */
export function palm(r: Renderer, x: number, y: number, h: number, color: string): void {
  r.fillRect(x, y - h, 2, h, color);
  for (const [dx, dy] of [[-7, -3], [7, -3], [-5, -7], [5, -7], [0, -8]] as [number, number][]) {
    const n = 6;
    for (let i = 0; i <= n; i++) r.px(x + 1 + Math.round((dx * i) / n), y - h + Math.round((dy * i) / n) + Math.round((i * i) / 8), color);
  }
}

/** Fade far layers into haze. */
export const far = (pal: CityPalette, fog: number, extra = 0.25): string => mix(pal.farSky, pal.haze, Math.min(1, extra + fog * 0.6));
export const mid = (pal: CityPalette, fog: number): string => mix(pal.nearSky, pal.farSky, 0.35 + fog * 0.3);
export const near = (pal: CityPalette, fog: number): string => mix(pal.nearSky, pal.haze, fog * 0.4);

/** Standard sky furniture: sun/moon + clouds by time of day. */
export function skyFurniture(r: Renderer, pal: CityPalette, tod: TimeOfDay, px: number, y: number, t: number, sunX = 120, sunY = 60, sunR = 12): void {
  if (tod === 'night' && pal.moon) sun(r, sunX + Math.round(px * 0.1), sunY, Math.round(sunR * 0.6), pal.moon, pal.skyBottom, 2);
  else if (tod !== 'night' && pal.sun) sun(r, sunX + Math.round(px * 0.1), sunY, tod === 'dusk' || tod === 'dawn' ? sunR + 6 : sunR, pal.sun, pal.skyBottom, 3);
  const cloudCol = tod === 'night' ? mix(pal.skyBottom, '#000000', 0.2) : tod === 'day' ? '#f4f4f0' : mix(pal.sun ?? '#ffd040', '#ff90c0', 0.5);
  clouds(r, y - 70, px + t * 3, cloudCol, 3, 5, 30);
  void t;
}
