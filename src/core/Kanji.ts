import { makeCanvas, type PixelSprite } from './Sprite';

/**
 * Crisp pixel-art CJK/katakana text without hand-drawing glyphs: render with a system font onto a
 * low-res canvas, then threshold the alpha so every pixel is either solid or transparent.
 * On iOS the fallback fonts (Hiragino Sans) render, on Linux IPAGothic / WenQuanYi.
 */
const cache = new Map<string, PixelSprite>();
const FONT = '"WenQuanYi Zen Hei Sharp", "IPAGothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

export interface KanjiOpts {
  /** glyph size in game px (default 12) */
  size?: number;
  color?: string;
  /** 1-px outline colour */
  outline?: string;
  /** stack characters vertically (one per line) */
  vertical?: boolean;
  bold?: boolean;
  /** extra spacing between glyphs */
  gap?: number;
}

export function kanjiSprite(text: string, o: KanjiOpts = {}): PixelSprite {
  const size = o.size ?? 12, color = o.color ?? '#f4f4f0', gap = o.gap ?? 1;
  const key = `${text}|${size}|${color}|${o.outline ?? ''}|${o.vertical ? 'v' : 'h'}|${o.bold ? 'b' : ''}|${gap}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const chars = Array.from(text);
  const cell = size + gap;
  const pad = o.outline ? 1 : 0;
  const w = (o.vertical ? size : chars.length * cell) + pad * 2 + 1;
  const h = (o.vertical ? chars.length * cell : size) + pad * 2 + 1;
  const tmp = makeCanvas(w, h);
  const tc = tmp.getContext('2d')!;
  tc.font = `${o.bold ? 'bold ' : ''}${size}px ${FONT}`;
  tc.textBaseline = 'top';
  tc.fillStyle = '#ffffff';
  chars.forEach((ch, i) => {
    const x = pad + (o.vertical ? 0 : i * cell);
    const y = pad + (o.vertical ? i * cell : 0);
    tc.fillText(ch, x, y);
  });
  const img = tc.getImageData(0, 0, w, h);
  const d = img.data;
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) solid[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const out = makeCanvas(w, h);
  const oc = out.getContext('2d')!;
  const res = oc.createImageData(w, h);
  const rd = res.data;
  const hex = (c: string): [number, number, number] => { const n = parseInt(c.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const fc = hex(color), ocol = o.outline ? hex(o.outline) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let col: [number, number, number] | null = null;
    if (solid[i]) col = fc;
    else if (ocol) {
      const n = (x > 0 && solid[i - 1]) || (x < w - 1 && solid[i + 1]) || (y > 0 && solid[i - w]) || (y < h - 1 && solid[i + w]);
      if (n) col = ocol;
    }
    if (!col) continue;
    rd[i * 4] = col[0]; rd[i * 4 + 1] = col[1]; rd[i * 4 + 2] = col[2]; rd[i * 4 + 3] = 255;
  }
  oc.putImageData(res, 0, 0);
  const spr: PixelSprite = { id: 'kanji:' + key, w, h, ax: 0, ay: 0, canvas: out };
  cache.set(key, spr);
  return spr;
}
