// Integration smoke test: serves dist/, opens every screen and every level in headless Chromium at iPhone size,
// simulates swipes / hold-boost / ability taps, and fails on any page error. Usage: npm run build && node tools/smoke.mjs [--quick]
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const quick = process.argv.includes('--quick');
const root = path.resolve(process.env.DIST ?? 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  try { const data = await readFile(path.join(root, p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${m.text()}`); });

let n = 0;
async function open(route, wait = 800) {
  await page.goto(`http://localhost:${port}/?r=${n++}#${route}`);
  await page.waitForTimeout(wait);
}
async function swipe(dir) {
  const x = 196, y = 600;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(x + dir * i * 12, y); await page.waitForTimeout(12); }
  await page.mouse.up();
}
async function hold(ms) { await page.mouse.move(200, 500); await page.mouse.down(); await page.waitForTimeout(ms); await page.mouse.up(); }
async function tap(x, y) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up(); }
const state = () => page.evaluate(() => {
  const g = window.game; const top = g?.top; const w = top?.world;
  return { screen: top?.constructor?.name, phase: top?.phase, dist: w?.distance, hp: w?.player?.hp, lane: w?.player?.lane, kills: w?.kills, fps: window.__fps };
});
await page.addInitScript(() => { let f = 0, last = performance.now(); const tick = () => { f++; const now = performance.now(); if (now - last > 1000) { window.__fps = f; f = 0; last = now; } requestAnimationFrame(tick); }; requestAnimationFrame(tick); });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };

// screens
for (const s of ['title', 'garage', 'map', 'shop', 'settings', 'garage&coins=99999&unlockall&maxlevel=30', 'map&maxlevel=30', 'spritesheet', 'spritesheet&traffic=1', 'props', 'flags']) {
  await open(`screen=${s}`, 700);
  const st = await state();
  check(`screen ${s}`, !!st.screen, st.screen);
}
// gameplay with input on level 1
await open('level=1&skipcount&notut', 1200);
let st = await state();
check('play starts', st.phase === 'play', JSON.stringify(st));
const lane0 = st.lane;
await swipe(1); await page.waitForTimeout(300);
st = await state();
check('swipe right changes lane', st.lane === Math.min(lane0 + 1, 4), `lane ${lane0}->${st.lane}`);
await swipe(-1); await page.waitForTimeout(300);
st = await state();
check('swipe left changes lane', st.lane === lane0, `lane ${st.lane}`);
const d0 = (await state()).dist;
await hold(1500);
const d1 = (await state()).dist;
check('hold boost advances faster', d1 - d0 > 60, `+${Math.round(d1 - d0)}m in 1.5s`);
// ability button (bottom-right)
const abBtn = await page.evaluate(() => { const b = window.game.top.abilityBtn; const s = window.game.r.cssScale; return { x: (b.x + b.w / 2) * s, y: (b.y + b.h / 2) * s }; });
await tap(abBtn.x, abBtn.y); await page.waitForTimeout(200);
const abActive = await page.evaluate(() => { const a = window.game.top.world.ability; return !a.ready; });
check('ability activates on button tap', abActive);
await page.waitForTimeout(4000);
st = await state();
check('fps >= 50 during play', (st.fps ?? 60) >= 50, `fps ${st.fps}`);
// pause
const pb = await page.evaluate(() => { const b = window.game.top.pauseBtn; const s = window.game.r.cssScale; return { x: (b.x + b.w / 2) * s, y: (b.y + b.h / 2) * s }; });
await tap(pb.x, pb.y); await page.waitForTimeout(400);
st = await state();
check('pause overlay opens', st.screen === 'PauseOverlay', st.screen);

// every level loads and runs (god mode), a few cars
const levels = quick ? [1, 5, 10, 15, 20, 25, 30] : Array.from({ length: 30 }, (_, i) => i + 1);
for (const l of levels) {
  await open(`level=${l}&skipcount&god&notut&auto=1&boost=1`, quick ? 2500 : 4000);
  st = await state();
  check(`level ${l} runs`, st.phase === 'play' && st.dist > 50, `dist ${Math.round(st.dist ?? 0)} kills ${st.kills} fps ${st.fps}`);
}
const cars = quick ? ['ae86', 'type90', 'volt_lini', 'dekotora'] : ['supra_mk4', 'rx7_fd', 'nsx', 's2000', 'ae86', 'skyline_r32', 'silvia_s15', 'evo6', 'wrx', 'sti', 'celsior', 'cappuccino', 'beat', 'type90', 'leopard2', 'apc', 'mega_truck', 'king_hauler', 'party_bus', 'polizei', 'feuerwehr', 'volt_lini', 'lowrider', 'dekotora', 'hako_van'];
for (const c of cars) {
  await open(`level=2&car=${c}&skipcount&god&notut&auto=1`, 3500);
  st = await state();
  check(`car ${c} ability runs`, st.phase === 'play' && st.dist > 50, `dist ${Math.round(st.dist ?? 0)}`);
}
// game over + revive overlay
// finishing a short level must open the results panel
await open('level=1&skipcount&god&notut&len=400', 100);
for (let i = 0; i < 40; i++) { await page.waitForTimeout(500); st = await state(); if (st.screen === 'ResultsOverlay') break; }
check('finishing a level shows results', st.screen === 'ResultsOverlay', st.screen);

// dense 3-lane level with 1 HP: the idle car is guaranteed to be hit within a few seconds
await open('level=22&skipcount&notut&hp=1', 100);
for (let i = 0; i < 70; i++) { await page.waitForTimeout(500); st = await state(); if (st.screen === 'ResultsOverlay') break; }
check('death shows results/revive overlay', st.screen === 'ResultsOverlay', st.screen);

await browser.close(); server.close();
const failed = results.filter((r) => !r.ok);
if (errors.length) { console.log('\nERRORS:'); for (const e of Array.from(new Set(errors)).slice(0, 30)) console.log(' ', e); }
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${errors.length} page errors`);
process.exit(failed.length || errors.length ? 1 : 0);
