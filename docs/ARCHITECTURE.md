# CARLANE — Architecture & Content Spec

CARLANE is an 8-bit, pixel-art, portrait-mode lane-dodging arcade racer for iPhone.
It is written in TypeScript on a hand-rolled HTML5 Canvas engine and shipped as a
native iOS app via Capacitor (StoreKit in-app purchases via RevenueCat, haptics, safe
areas). Everything (sprites, fonts, audio, skylines) is generated procedurally in code —
there are no binary assets. This keeps the bundle tiny and makes every visual tweakable.

Visual language: the reference is the "夢のガレージ / JAPAN CAR COLLECTION" Nintendo-style
sheet: gray Game-Boy-like bezel frames, chunky black outlines, saturated primaries
(red #e0202a, blue #2040e0, yellow #f0c020, purple #8030c0, pink #e04080, orange #f07020,
white #f0f0f0), cherry blossoms, torii gates, Mt. Fuji, kanji decorations, numbered
vehicle cards "01 GT-R R34" with brand badges. UI text is a bitmap pixel font.

## Rendering model

* Internal resolution: `GAME_W = 240` px wide; `GAME_H` is derived from the device
  aspect (≈ 520 on a 19.5:9 iPhone, clamped 400..600). All game code works in this
  low-res coordinate space (integers where possible).
* `Renderer` draws to a low-res `OffscreenCanvas`/canvas with `imageSmoothingEnabled=false`
  and blits it every frame to the full-device-pixel display canvas with nearest-neighbor
  scaling (crisp pixels). Post effects: screen shake, flash, letterbox wipes.
* Safe areas: `Renderer.safeTop/safeBottom` (game-px) are computed from CSS env() insets so
  HUD elements avoid the notch / home indicator.
* Sprites (`core/Sprite.ts`): a `PixelSprite` is built from an array of strings, each char
  mapping to a color via a per-sprite (or shared) char→color map. Chars `B b H A G L W`
  are "recolor slots" (body, body-shade, highlight, accent, glass, light, wheel) that get
  substituted per vehicle palette. Sprites compile to canvases and are cached by
  (sprite id + palette hash). Nearest-neighbor scaling and horizontal flip are supported.
* Gameplay uses a pseudo-3D rear-view road ("OutRun" style, `game/Road.ts`): horizon at
  ~42% of screen height, sky + parallax city skyline above, road trapezoid below with 3 or
  5 discrete lanes. World objects have a lane index and a distance `d` ahead of the
  player (meters). Screen scale `s = 1/(1 + d*K)`; y = horizonY + (GAME_H-horizonY)*s,
  x = roadCenter(s) + laneOffset(lane)*s, sprite drawn scaled by `s` (nearest-neighbor).
  Roads can bend (curve offset per depth), and the camera can bob on boost/jump.

## Runtime structure

```
src/main.ts                 boot: create Game, attach canvas, resize, start loop
src/core/                   engine (types, Renderer, Sprite, Palette, Input, Audio, Save, Rng, Tween, PixelFont, i18n)
src/game/                   gameplay (Road, World, Player, Traffic, Collision, Damage, Explosion, Particles, Hud, Tutorial, abilities/, mechanics/)
src/content/                data: vehicles, vehicleSprites (templates), cities (skylines), levels, abilities catalog, products, props
src/ui/                     screens: Title, Garage, Map, Shop, Settings, Results, Pause, shared widgets
src/services/               IAP (mock + RevenueCat), Haptics, Platform
```

`core/Game.ts` runs a fixed-timestep update (60 Hz, dt clamped) and a variable render.
Screens implement `Screen` (`enter/exit/update/render/onPointer/onBack`). A stack allows
overlays (pause, tutorial cards, purchase dialogs).

## Input

Touch (pointer events) on the display canvas, mapped to game coordinates:
* Swipe left/right (≥ 18 game-px horizontal within 350 ms) → lane change.
* Hold (pointer down ≥ 140 ms without swiping) → BOOST while held (flames, speed lines).
* Tap (< 140 ms, little movement) on the big ability button → activate ability.
  Tapping anywhere else while playing also fires the ability if the vehicle's ability is
  "instant" (jump/shoot) — the ability button still exists so it is discoverable.
* Keyboard (dev/desktop): ←/→ or A/D lanes, Space/↑ boost, X/Enter ability, Esc pause.

## Gameplay rules

* Player speed = vehicle base speed × (boost ? boostMul : 1) × level speed modifiers.
* Traffic spawns ahead at the horizon in random lanes with per-level density/speed;
  never spawns an unavoidable wall (at least one free lane in every "row" band).
* Collision (player reaches a traffic car in the same lane): the traffic car explodes
  (multi-frame pixel explosion, debris particles, screen shake, hit-stop 70 ms, flash),
  the player loses 1 HP (heavy traffic: 2 HP) unless shielded/jumping/crushing.
  Vehicles with `crush` (tanks, trucks, monster truck) destroy traffic without damage
  (still lose 1 HP against heavy traffic unless tank).
* Durability = HP (3..12). Damage is drawn progressively on the player sprite:
  ≥ 1/3 damage: scratches + missing paint; ≥ 2/3: dents, cracked glass, smoke;
  last HP: fire + heavy smoke + sparks. HP 0 → big explosion → Game Over (revive offer).
* Coins float on the road (lane pickups). Score = distance + coins + kills×combo.
* Level ends at the finish line (length in meters). Stars by score thresholds.
* Abilities have a cooldown and an optional duration; each vehicle has one unique
  ability with a strong visual signature (see content/abilities.ts). The HUD button shows
  the ability icon, cooldown sweep, and a one-time explanation card the first time a
  vehicle with that ability is driven.

## Persistence & monetization

`core/Save.ts` stores a versioned JSON blob (localStorage + Capacitor Preferences).
`services/IAP.ts` exposes `IAPService` with `products()`, `purchase(id)`, `restore()`;
`MockIAPService` (web/dev: simulated sheet) and `RevenueCatIAPService` (iOS).
Products: revive packs (consumable), coin packs (consumable), Tank Pack (non-consumable),
Legend Pass (non-consumable: 2× coins + exclusive vehicle), Unlock All (non-consumable).

## Localization

`core/i18n.ts` — German is the primary language, English fallback; device language decides.
