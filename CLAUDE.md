# CARLANE — working notes for agents

* Read `docs/ARCHITECTURE.md` and `docs/AGENT_GUIDE.md` before touching code. The guide contains the content contracts
  (vehicle roster, ability spec, traffic ids, city↔level map) and the two reference images' paths.
* Everything is procedural pixel art in a 240-px-wide low-res canvas (TypeScript, Vite, Capacitor iOS). No binary assets.
* Verify: `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `node tools/screenshots.mjs "<route>"` (iPhone-size PNGs in
  `shots/`; routes documented in `src/ui/routes.ts`), `node tools/smoke.mjs --quick` (headless integration test with gestures).
* Use `--outDir dist-<name>` + `DIST=dist-<name> SHOTS=shots-<name>` when several contributors build at once.
