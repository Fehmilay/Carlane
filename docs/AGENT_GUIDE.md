# CARLANE — Contributor / Agent Guide

Read `docs/ARCHITECTURE.md` first. This file is the contract between parallel contributors.

## THE in-game look (second reference image — this is what the client wants the GAME to look like)
`/root/.claude/uploads/1cd161d2-70b3-557d-8eae-8a9ef8d37e33/16e31f44-image.png` — view it. Rear-view pseudo-3D road at dusk,
the player's blue GT-R R34 is HUGE (≈ 40 % of the screen width, ≈ 96 px at our 240-px width) with fine details (twin round
taillights with inner rings, GT-R badge, license plate with kanji, diffuser, exhaust, wing), traffic cars ahead are drawn from the
same detailed sprites scaled down by depth, horizon at ≈ 50 % of the height, a dense Tokyo skyline with neon kanji billboards
(東京 / JDM / ガレージ / スピード / 日本), Tokyo Tower, Mt. Fuji and a big sunset sun, sakura trees and red/white curbs along the road,
petals in the air, vertical kanji slogans in the sky (走り続けろ / 夢の先へ) with tiny English captions, a bezel-style HUD with panels
top-left/top-right (values in a bold pixel font), a green→red gradient speed/boost bar, a minimap panel bottom-left and one round
button bottom-right. Uniform pixel size everywhere (no mixed pixel scales).
Consequences: rear-view vehicle sprites are drawn at 2× the size first specified: cars 84–100 px wide × 56–76 px tall,
kei cars ≈ 64×52, luxury/sedans ≈ 96×64, heavies/tanks/buses 112–128 px wide × 90–124 px tall (max 128×128). Side-view garage
sprites stay 60–100 px wide. Skylines may be 60–130 px tall above the horizon.

## Ground rules
1. **Own your files.** Only create/modify the files assigned to you. Never edit `src/core/*`, `src/game/World.ts`,
   `src/game/Player.ts`, `src/game/Road.ts`, `src/game/Ability.ts`, `src/game/Mechanic.ts`, `src/game/Traffic.ts`,
   `src/ui/PlayScreen.ts`, `src/ui/routes.ts`, `src/main.ts`. If you need a change there, put a
   `// INTEGRATION NOTE:` comment at the top of your own file describing it, and work around it locally.
2. **No binary assets.** Everything is procedural pixel art (`Grid` + `buildSprite`) or drawn with `Renderer` primitives.
3. **TypeScript strict.** Verify with `npx tsc --noEmit -p tsconfig.json 2>&1 | grep '<your file path>'` — other
   contributors' files may be mid-edit; only errors in YOUR files matter. Write whole files at once (never leave a
   half-written file on disk).
4. **Look at your work.** Build into your own dir and screenshot: 
   `npx vite build --outDir dist-<you> >/dev/null && DIST=dist-<you> SHOTS=shots-<you> node tools/screenshots.mjs "<route>" "<route>"`
   then Read the PNG (it is an iPhone-size render). Iterate until it looks great. Routes:
   * `screen=spritesheet&page=N` (8 vehicles per page: rear + 3 damage levels + side), `screen=spritesheet&traffic=1`
   * `screen=skyline&city=<cityId>` (dawn/day/dusk/night rows), `screen=props`, `screen=icons&ids=a,b`, `screen=flags`
   * `level=N&car=<vehicleId>&skipcount&god&notut&t=<seconds>` (gameplay after t seconds), `screen=garage|map|shop|settings|title`
   * add `&coins=99999&unlockall&maxlevel=30` to simulate progress.
   The Chromium build cannot do gestures in screenshots; gameplay shots show the car driving straight.
5. **Style** (the reference sheet "夢のガレージ / JAPAN CAR COLLECTION"): chunky 1-px black (`P.black`/`'k'`) outlines,
   saturated colors from `src/core/Palette.ts` (`P.*`), gray bezel/paper panels (`P.paper`, `P.paperDark`) with
   black frames like a Game Boy shell, red accent (`P.red`), numbered cards "01 GT-R R34", brand badges, kanji
   decorations, cherry blossoms, torii gates, Mt. Fuji, checker flags. Everything is drawn in the 240-px-wide
   low-res space; keep text ≥ scale 1 pixel font (`r.text`). German UI first (`t('key')`, `L(localized)`), English fallback.
6. Use `Grid` (`src/core/Sprite.ts`) for pixel art: `rect/box/hline/vline/line/trap/ellipse/circle/mirrorX/outline/stamp`.
   Recolor slots in vehicle sprites: `B` body, `b` shade, `H` highlight, `A` accent, `G` glass, `L` lamp, `W` wheel,
   `C` chrome. Fixed colors: `k` black, `K` ink, `D` dark, `d` gray3, `e` gray2, `f` gray1, `w` white, `r` red,
   `R` red-dark, `o` orange, `y` yellow, `Y` yellow-light, `g` green, `v` green-dark, `t` teal, `c` cyan, `u` blue,
   `U` blue-dark, `i` blue-light, `p` purple, `P` purple-dark, `m` pink, `M` pink-light, `s` sakura, `n` brown, `T` tan,
   `x` gold, `S` skin, `q` paper. `.` = transparent.

## Key APIs (read the source for details)
* `Renderer` (`g.r`): `w`, `h`, `safeTop/safeBottom`, `clear/fillRect/strokeRect/hline/vline/disc/ring/bandedGradient/dither`,
  `sprite(spr, x, y, {scale, sx, sy, flip, alpha, origin})`, `text(str, x, y, {color, scale, align, outline, shadow, wave, t, wrap, alpha})`,
  `textWidth`, `clip/unclip`, `shake(amp, dur)`, `flash(color, alpha)`, `frame`, `time`, `ctx` (raw 2D context, 240×h).
* `Sprite`: `buildSprite(src, palette?, extraMap?)`, `flipSprite`, `tintSprite`, `shearSprite`, `darkenSprite`, `Grid`, `makeCanvas`, `spriteFromCanvas`.
* `World` (`src/game/World.ts`): `road` (`project(laneX, z) → {x,y,s}`, `lanes`, `laneW`, `hy`, `centerX(s)`, `halfW(s)`, `sAt(z)`, `scaleAt(z)`),
  `player` (`lane, laneX, hp, maxHp, speed, boosting, air, airborne, invuln, shield, phasing, crushAll, sizeMul, screen()`),
  `traffic: Traffic[]`, `coins`, `projectiles`, `hazards`, `fx` (ParticleSystem, world-attached particles via `{z, laneX}`), `fxFront`,
  `mod` (WorldMod: speed, spawn, trafficSpeed, fog, dark, grip, timeScale, coinMul, tint/tintA — reset every frame; mechanics/abilities multiply into it each update),
  `spawnTraffic(lane, z, tpl?, speedMul?)`, `spawnCoin`, `spawnCoinRow`, `spawnHazard(kind, lane, z, w?, data?)` (kinds drawn by World: pothole, oil, nitro, ice, lava, water, cone),
  `fire({kind, laneX, z, speed, h, damage, owner, target?, pierce?, color?})`, `explode(laneX, z, 'small'|'big'|'huge')`,
  `destroyTraffic(t, cause, knock?)`, `hitTraffic(t, dmg, cause)`, `trafficAhead(range?, laneX?, tol?)`, `nextInLane()`, `floatText(text, laneX, z, color?, scale?)`,
  `distance, time, score, combo, kills, progress, finished`, `on(event, fn)` events: kill, hit, coin, nearMiss, finish, dead, combo.
  Traffic states: `alive | wreck | frozen | stalled | pulled`; set `t.targetLane` to make it change lanes; `t.stateT` for timed states.
* `Ability` (`src/game/Ability.ts`): extend `BaseAbility` (`cooldown`, `duration`, `onActivate()`, `onUpdate(dt)`, `onEnd()`, `renderUnder()`, `renderOver()`, `onCollision(t)`, `onKill(t)`).
* `Mechanic` (`src/game/Mechanic.ts`): extend `BaseMechanic` (`update(dt)`, `renderBack/renderRoad/renderFront`, `start()`).
* `AudioEngine` (`g.audio`): `sfx(name)` — names in `src/core/Audio.ts` (`SfxName`); `registerTrack(name, patterns)` for music.
* `Save` (`g.save`): coins, unlock, select, levelResult, setLevelResult, maxLevel, totalStars, tutorialSeen/markTutorial, `data.settings`.
* `Store` (`src/services/Store.ts`): `buy(g, productId)`, `restore(g)`, `canUnlock(g, def)`, `unlockVehicle(g, def)`, `useRevive(g)`, `COIN_PACKS`, `REVIVE_PACKS`.
* `Game` (`g`): `push(screen)`, `pop()`, `goto(screen, fade?)`, `top`, `input` (`consumeSwipe`, `consumeTap`, `holding`, `keys`), `haptics`, `iap.products()`.

## Vehicle roster (ids are final — content and abilities must agree)
| # | id | name | brand | body | class | ability | crush | palette hint (from the reference sheet) |
|---|----|------|-------|------|-------|---------|-------|------|
| 01 | gtr_r34 | GT-R R34 | nissan | coupe | jdm | nitro | | bayside blue |
| 02 | supra_mk4 | Supra MK4 | toyota | coupe | jdm | laser | | red |
| 03 | rx7_fd | RX-7 FD | mazda | coupe | jdm | slowmo | | white, pop-up lights |
| 04 | nsx | NSX | honda | coupe | jdm | drone | | red, pop-up lights |
| 05 | s2000 | S2000 | honda | roadster | jdm | flame | | yellow |
| 06 | ae86 | AE86 | toyota | hatch | jdm | jump | | panda white/black, pop-up lights |
| 07 | skyline_r32 | Skyline R32 | nissan | sedan | jdm | lanerip | | gunmetal/black |
| 08 | skyline_r33 | Skyline R33 | nissan | coupe | jdm | sonicboom | | purple |
| 09 | skyline_r34 | Skyline R34 | nissan | sedan | jdm | shockwave | | blue |
| 10 | silvia_s15 | Silvia S15 | nissan | coupe | jdm | phase | | pink |
| 11 | silvia_s14 | Silvia S14 | nissan | coupe | jdm | shuriken | | teal/green |
| 12 | s180sx | 180SX | nissan | hatch | jdm | smokescreen | | purple, pop-up lights |
| 13 | fairlady_z | Fairlady Z | nissan | coupe | jdm | spin | | yellow (classic 240Z) |
| 14 | z350 | 350Z | nissan | coupe | jdm | ram | | orange |
| 15 | z370 | 370Z | nissan | coupe | jdm | blink | | white/silver |
| 16 | z400 | 400Z | nissan | coupe | jdm | plasma | | blue |
| 17 | gt86 | GT86 | toyota | coupe | jdm | tornado | | red |
| 18 | gr_supra | GR Supra | gr | coupe | jdm | turbojet | | white |
| 19 | evo6 | Lancer Evo VI | mitsubishi | sedan | jdm | wings | | red, big wing |
| 20 | evo9 | Lancer Evo IX | mitsubishi | sedan | jdm | boulder | | blue, big wing |
| 21 | evo10 | Lancer Evo X | mitsubishi | sedan | jdm | railgun | | black |
| 22 | galant_vr4 | Galant VR-4 | mitsubishi | sedan | jdm | ironbumper | | silver/white |
| 23 | wrx | Impreza WRX | subaru | sedan | jdm | quake | | blue, gold wheels |
| 24 | sti | Impreza STI | subaru | sedan | jdm | rocketjump | | pink, big wing |
| 25 | brz | BRZ | subaru | coupe | jdm | chain | | blue |
| 26 | chaser_jzx100 | Chaser JZX100 | toyota | sedan | jdm | mines | | black |
| 27 | mark2 | Mark II | toyota | sedan | jdm | repair | | white |
| 28 | cresta | Cresta | toyota | sedan | jdm | timewarp | | purple |
| 29 | soarer | Soarer | toyota | luxury | jdm | freeze | | white |
| 30 | crown_athlete | Crown Athlete | toyota | luxury | jdm | shield | | black |
| 31 | celsior | Celsior | lexus | luxury | jdm | goldrush | | black, gold trim |
| 32 | is300 | IS300 | lexus | sedan | jdm | lightning | | silver |
| 33 | altezza | Altezza | lexus | sedan | jdm | anchor | | red |
| 34 | mr2 | MR2 | toyota | roadster | jdm | hop | | white, pop-up lights |
| 35 | cappuccino | Cappuccino | suzuki | kei | jdm | shrink | | yellow |
| 36 | beat | Beat | honda | kei | jdm | magnet | | red |
| 37 | type90 | Type 90 | military | tank | tank | cannon | yes | olive/JGSDF green |
| 38 | leopard2 | Leopard 2 | military | tank | tank | missile | yes | NATO dark green/black camo |
| 39 | apc | Wolf APC | military | apc | tank | gatling | yes | desert tan |
| 40 | mega_truck | Mega Truck | custom | monster | heavy | mega | yes | red with flames, giant wheels |
| 41 | king_hauler | King Hauler | custom | truck | heavy | horn | yes | chrome + blue semi |
| 42 | party_bus | Party Bus | custom | bus | heavy | bass | yes | purple with neon |
| 43 | polizei | Polizei | city | police | special | siren | | silver/blue German police, lightbar |
| 44 | feuerwehr | Feuerwehr | city | firetruck | heavy | watercannon | yes | red fire truck, ladder |
| 45 | volt_lini | Volt Lini | volt | hyper | special | emp | yes | electric cyan/black hyper-limo, glowing seams |
| 46 | lowrider | Low Rider | custom | lowrider | special | fireworks | | candy purple/gold, hydraulics |
| 47 | dekotora | Dekotora | custom | truck | heavy | dragon | yes | Japanese decorated truck: chrome, neon, gold |
| 48 | hako_van | Hako Van | toyota | van | special | blossom | | white kei van with sakura decals |

Unlock economy (content agent decides exact numbers): 01 start; 02–06 coins 800–2500; 07–18 coins + level gates 3–12;
19–30 coins + level gates 8–20; 31–36 stars gates; 37–39 `tank_pack` IAP (Type 90 also unlockable with 30 stars + 40000 coins);
40–44 level 15–28 + coins; 45 `legend_pass`; 46–48 coins/stars. Everything must be reachable without paying except 45.

## Ability behaviour spec (visual signature must be unmistakable)
nitro: 3 s blue-flame overdrive, ×1.6 speed, collisions during nitro destroy traffic without damage · jump: leap ~1 s over the next car (shadow shrinks, arc) ·
phase: 2.5 s ghost, afterimages, passes through cars · cannon: lane shell, destroys first car, muzzle flash + recoil, 2.5 s cd ·
missile: homing missile to the nearest car in any lane · emp: expanding electric ring, all traffic within 80 m gets fried and knocked aside (counts as kills, sparks) ·
shield: 8 s bubble absorbing 2 hits · laser: 0.6 s beam down the lane, destroys everything within 120 m · magnet: 6 s, coins from all lanes fly to the car ·
slowmo: 3 s timeScale 0.35 with vignette + clock tick · shrink: 4 s tiny car (sizeMul 0.5, phasing) · mega: 5 s giant car (sizeMul 1.6, crushAll, stomp shake) ·
ram: 1.5 s iron-front charge (crushAll, speed ×1.4) · flame: 2 s flamethrower cone: cars in own+adjacent lanes within 40 m burn and explode ·
wings: 3 s flight (air 40 px, airborne), wing sprite unfolds · blink: teleport 60 m ahead with flash; traffic within 6 m of arrival explodes ·
ironbumper: 6 s bull-bar: collisions destroy traffic without damage · goldrush: 8 s coinMul 3 + coin rows spawn in your lane, gold aura ·
repair: instant +2 HP, wrench sparkles + green flash · spin: 1 s spin (sprite flips every 3 frames), destroys cars within 8 m in own+adjacent lanes ·
freeze: ice beam 50 m, cars in own+adjacent lanes freeze (state frozen, 4 s); frozen cars shatter harmlessly on contact (use onCollision) ·
drone: 5 s drone hovering ahead firing bullets at nearest cars · horn: sound-wave cone pushes cars within 40 m to adjacent lanes ·
lightning: chain lightning to up to 4 nearest cars · shuriken: throws 3 shuriken (own + adjacent lanes) · lanerip: all traffic in your lane within 100 m is shoved to adjacent lanes ·
hop: short 0.5 s hop, 3 s cd · sonicboom: instant ring, destroys all cars within 25 m in all lanes · siren: 5 s police lights, traffic ahead pulls away from your lane ·
watercannon: 2 s water jet in lane, cars are washed off the road (knocked outward, counts as kills) · smokescreen: 4 s tire smoke, invulnerable, hits destroy traffic ·
boulder: 3 bouncing boulders forward, each bounce destroys cars · chain: harpoon grabs the first car ahead and yanks it aside (destroy) · tornado: 3 s drift tornado around the car, adjacent-lane cars thrown ·
quake: ground pound, cars within 30 m launched and destroyed, heavy shake · mines: throws 3 mines that land 30 m ahead in the other lanes and explode on contact ·
gatling: 3 s rapid bullets in own lane · shockwave: expanding ring destroys everything within 15 m, pushes others · timewarp: 2 s sepia time-freeze, traffic stops, player phases ·
blossom: 4 s sakura storm, petals push cars gently off the road (kills, no explosion) · dragon: pixel dragon flies down your lane burning everything for 2 s ·
anchor: heavy anchor pierces the lane (pierce projectile, 60 m) · plasma: tri-shot plasma balls (own + adjacent lanes) · fireworks: rockets rain on all lanes within 60 m ·
bass: bass drop, cars within 20 m in all lanes knocked outward, screen pulses · rocketjump: high rocket jump, landing shockwave destroys cars within 10 m ·
turbojet: 4 s jet mode: speed ×1.8, invulnerable crush, jet flames · railgun: 0.8 s charge then everything in lane within 200 m is destroyed, recoil.

## Traffic template ids (sprites agent creates; cities reference)
Generic: sedan_red, sedan_white, sedan_blue, sedan_gray, hatch_green, hatch_yellow, coupe_black, wagon_brown, suv_gray, van_white, pickup_red.
City: taxi_yellow (NYC), taxi_jp (Tokyo Crown black), taxi_de (beige Mercedes), taxi_black (London cab), taxi_hk (red/silver), taxi_istanbul (yellow),
dolmus (yellow minibus), tuktuk, rickshaw_in (yellow/black auto), police_de, police_us, police_jp, police_uk, kei_van, lada (Moscow), trabant (Berlin),
citroen_2cv (Paris), vocho (VW Beetle Mexico), lowrider_traffic (LA), limo_stretch (Las Vegas), supercar_gold (Dubai), microbus (Cairo), minibus_taxi (Cape Town),
ute (Sydney), superjeep (Reykjavik), ev_taxi (Shanghai green/white), bus_blue (Seoul), songthaew (Bangkok red pickup bus), scooter_pack (Rome vespa trio), seat_yellow (Barcelona),
bus_rio (Rio yellow/blue), truck_indian (Mumbai decorated Tata), tram_de (Rheinbahn red/white, heavy), tram_hk (double-deck tram, heavy), bus_double (London red double-decker, heavy),
beer_truck (Munich, heavy), dekotora_traffic (heavy, neon), tanker (heavy), cement_mixer (heavy), truck_semi (heavy), bus_city (heavy), garbage_truck (heavy).
Bosses: boss_truck (hp 8), boss_tank (hp 10), boss_bus (hp 6).

## City ↔ level map (30 levels, one city each — final)
1 tokyo (3 lanes, day) · 2 osaka · 3 duesseldorf · 4 kyoto · 5 istanbul · 6 berlin · 7 paris · 8 london · 9 nagoya · 10 munich (5 lanes from here on, some later levels drop back to 3 for tight tracks) ·
11 amsterdam · 12 rome · 13 barcelona · 14 newyork · 15 losangeles · 16 mexicocity · 17 rio · 18 dubai · 19 cairo · 20 capetown · 21 mumbai · 22 bangkok · 23 seoul · 24 shanghai · 25 hongkong ·
26 sydney · 27 moscow · 28 reykjavik · 29 lasvegas · 30 fukuoka (finale).
