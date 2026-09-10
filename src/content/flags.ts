import type { Renderer } from '../core/Renderer';

// 9×6 pixel flags by ISO code (simplified but recognizable).
const COL: Record<string, string> = { w: '#f4f4f0', r: '#e0202a', k: '#16161f', y: '#f0c020', u: '#2040e0', g: '#20b040', o: '#f07020', c: '#40e0f0', p: '#8030c0', n: '#7a4a20', i: '#60a0ff', v: '#0e6a2a', d: '#3a3a48' };
const FLAGS: Record<string, string[]> = {
  JP: ['wwwwwwwww', 'wwwwrwwww', 'wwwrrrwww', 'wwwrrrwww', 'wwwwrwwww', 'wwwwwwwww'],
  DE: ['kkkkkkkkk', 'kkkkkkkkk', 'rrrrrrrrr', 'rrrrrrrrr', 'yyyyyyyyy', 'yyyyyyyyy'],
  TR: ['rrrrrrrrr', 'rrwwrrwrr', 'rwrrrrwrr', 'rwrrrwwwr', 'rrwwrrwrr', 'rrrrrrrrr'],
  FR: ['uuuwwwrrr', 'uuuwwwrrr', 'uuuwwwrrr', 'uuuwwwrrr', 'uuuwwwrrr', 'uuuwwwrrr'],
  GB: ['uwwuruuwu', 'wuwurwuwu', 'rrrrrrrrr', 'rrrrrrrrr', 'wuwurwuwu', 'uwwuruuwu'],
  IT: ['gggwwwrrr', 'gggwwwrrr', 'gggwwwrrr', 'gggwwwrrr', 'gggwwwrrr', 'gggwwwrrr'],
  NL: ['rrrrrrrrr', 'rrrrrrrrr', 'wwwwwwwww', 'wwwwwwwww', 'uuuuuuuuu', 'uuuuuuuuu'],
  ES: ['rrrrrrrrr', 'yyyyyyyyy', 'yyoyyyyyy', 'yyoyyyyyy', 'yyyyyyyyy', 'rrrrrrrrr'],
  RU: ['wwwwwwwww', 'wwwwwwwww', 'uuuuuuuuu', 'uuuuuuuuu', 'rrrrrrrrr', 'rrrrrrrrr'],
  IS: ['uuwrwuuuu', 'uuwrwuuuu', 'wrrrrrrrw', 'wrrrrrrrw', 'uuwrwuuuu', 'uuwrwuuuu'],
  US: ['uwuwrrrrr', 'wuwuwwwww', 'uwuwrrrrr', 'wwwwwwwww', 'rrrrrrrrr', 'wwwwwwwww'],
  MX: ['gggwwwrrr', 'gggwwwrrr', 'gggwnwrrr', 'gggwnwrrr', 'gggwwwrrr', 'gggwwwrrr'],
  BR: ['ggggggggg', 'gggyyyggg', 'gyyyuyyyg', 'gyyyuyyyg', 'gggyyyggg', 'ggggggggg'],
  AE: ['rrgggggggg', 'rrgggggggg', 'rrwwwwwwww', 'rrwwwwwwww', 'rrkkkkkkkk', 'rrkkkkkkkk'],
  EG: ['rrrrrrrrr', 'rrrrrrrrr', 'wwwwywwww', 'wwwwywwww', 'kkkkkkkkk', 'kkkkkkkkk'],
  ZA: ['rrrrrrrrr', 'wggrrrrrr', 'yvvggwwww', 'yvvggwwww', 'wgguuuuuu', 'uuuuuuuuu'],
  IN: ['ooooooooo', 'ooooooooo', 'wwwwuwwww', 'wwwwuwwww', 'ggggggggg', 'ggggggggg'],
  TH: ['rrrrrrrrr', 'wwwwwwwww', 'uuuuuuuuu', 'uuuuuuuuu', 'wwwwwwwww', 'rrrrrrrrr'],
  KR: ['wwwwwwwww', 'wkwwrrwkw', 'wwwrrrrww', 'wwwuuuuww', 'wkwwuuwkw', 'wwwwwwwww'],
  CN: ['rrrrrrrrr', 'ryryrrrrr', 'ryyyryrrr', 'ryryrrrrr', 'rrrrrrrrr', 'rrrrrrrrr'],
  HK: ['rrrrrrrrr', 'rrrrwrrrr', 'rrrwwwrrr', 'rrrwwwrrr', 'rrrrwrrrr', 'rrrrrrrrr'],
  AU: ['uwuwuuuuu', 'wuwuuuwuu', 'uwuwuuuuu', 'uuuuuuwuu', 'uuwuuwuwu', 'uuuuuuuuu'],
};

export function registerFlag(code: string, rows: string[]): void { FLAGS[code] = rows; }
export function hasFlag(code: string): boolean { return !!FLAGS[code]; }
export function drawFlag(r: Renderer, code: string, x: number, y: number, scale = 1): void {
  const rows = FLAGS[code] ?? FLAGS.JP;
  const w = rows[0].length;
  r.fillRect(x - 1, y - 1, w * scale + 2, rows.length * scale + 2, '#0b0b12');
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) r.fillRect(x + i * scale, y + j * scale, scale, scale, COL[row[i]] ?? '#ffffff'); });
}
export const FLAG_CODES = Object.keys(FLAGS);
export const FLAG_W = 9;
export const FLAG_H = 6;
