import type { Renderer } from '../core/Renderer';

// Tiny 8×5 pixel flags by ISO code. STUB — extended by content agents.
const FLAGS: Record<string, string[]> = {
  JP: ['wwwwwwww', 'wwwrrwww', 'wwrrrrww', 'wwwrrwww', 'wwwwwwww'],
  DE: ['kkkkkkkk', 'kkkkkkkk', 'rrrrrrrr', 'yyyyyyyy', 'yyyyyyyy'],
};
const COL: Record<string, string> = { w: '#f4f4f0', r: '#e0202a', k: '#16161f', y: '#f0c020', u: '#2040e0', g: '#20b040', o: '#f07020', c: '#40e0f0', p: '#8030c0' };

export function registerFlag(code: string, rows: string[]): void { FLAGS[code] = rows; }
export function drawFlag(r: Renderer, code: string, x: number, y: number, scale = 1): void {
  const rows = FLAGS[code] ?? FLAGS.JP;
  r.fillRect(x - 1, y - 1, rows[0].length * scale + 2, rows.length * scale + 2, '#0b0b12');
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) r.fillRect(x + i * scale, y + j * scale, scale, scale, COL[row[i]] ?? '#ffffff'); });
}
