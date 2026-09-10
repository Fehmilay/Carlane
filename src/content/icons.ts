import type { Renderer } from '../core/Renderer';
import { buildSprite, tintSprite } from '../core/Sprite';

// 16×16 monochrome ability/UI icons ('#' = pixel). STUB — extended by content agents.
const ICONS: Record<string, string[]> = {
  nitro: ['......##........', '.....###........', '....####........', '...#####........', '..######........', '.#######........', '########........', '....#####.......', '....######......', '.....#######....', '......########..', '.......########.', '........#######.', '.........#####..', '..........###...', '...........#....'],
  pause: ['................', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '....##....##....', '................', '................', '................'],
};

export function iconRows(id: string): string[] | undefined { return ICONS[id]; }
export function registerIcon(id: string, rows: string[]): void { ICONS[id] = rows; }

export function drawIcon(r: Renderer, id: string, x: number, y: number, color = '#f4f4f0', scale = 1): void {
  const rows = ICONS[id] ?? ICONS.nitro;
  const spr = buildSprite({ id: 'icon_' + id, rows, map: { '#': '#ffffff' } });
  r.sprite(color === '#ffffff' ? spr : tintSprite(spr, color), x, y, { origin: 'topleft', scale });
}
