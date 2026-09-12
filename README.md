# CARLANE

**8-bit JDM lane-dodging arcade racer for iPhone.** TypeScript + Canvas 2D, built with Vite, shipped natively with Capacitor.

> **Kurzfassung (Deutsch).** CARLANE ist ein Pixel-Art-Arcade-Racer im Hochformat: Du rast in Rückansicht über eine
> pseudo-3D-Straße, wechselst per Wischen die Spur, hältst gedrückt für Boost und zündest per Tipp die Spezialfähigkeit
> deines Autos. 48 Fahrzeuge (JDM-Legenden vom GT-R R34 bis zum Dekotora, Panzer, Monster-Truck, Polizei, Feuerwehr),
> 30 Level in 30 Städten von Tokio bis Fukuoka, 48 einzigartige Fähigkeiten, 3-Sterne-Wertung, Münz-Ökonomie und
> In-App-Käufe über StoreKit/RevenueCat. Alles ist prozedural gezeichnet — es gibt keine Bild- oder Audiodateien.
> Die UI ist Deutsch mit englischem Fallback. Entwicklung: `npm install`, `npm run dev`; iPhone: `npm run build`,
> `npx cap sync ios`, `npx cap open ios`, Team in Xcode wählen, auf dem Gerät starten. Details unten.

---

## What the game is

* **Core loop.** Portrait, rear-view pseudo-3D road ("OutRun" style) with 3 or 5 discrete lanes. Swipe left/right to change
  lane, hold to **boost**, tap the big button (or anywhere, for instant abilities) to fire the vehicle's **ability**.
  Traffic explodes on contact — you lose HP, heavy traffic costs 2. Coins float on the road. A level ends at the finish
  line; score = distance + coins + wrecks × combo; 1–3 stars by score thresholds.
* **48 vehicles** (`src/content/vehicles.ts`): 36 JDM icons (GT-R R34, Supra MK4, RX-7 FD, NSX, AE86, Silvia, Evo, WRX/STI,
  Chaser, Celsior, Cappuccino, Beat …), three tanks/APC, monster truck, semi, party bus, Polizei, Feuerwehr, an electric
  hyper-limo, a lowrider, a Dekotora and a sakura kei van. Each has stats (speed / boost / handling / durability / weight),
  a recolorable procedural sprite (rear view for gameplay, side view for the garage) and **one unique ability**.
* **48 abilities** (`src/content/abilities.ts`, runtime in `src/game/abilities/`): nitro, jump, phase, cannon, homing missile,
  EMP, shield, laser, magnet, slow-mo, shrink, mega, ram, flamethrower, wings, blink, gold rush, freeze, drone, lightning,
  shuriken, tornado, quake, mines, railgun, dragon, sakura storm … every one with an unmistakable visual signature.
* **30 levels in 30 cities** (`src/content/levels.ts`, `src/content/cities/`): Tokyo → Osaka → Düsseldorf → Kyoto → Istanbul →
  Berlin → Paris → London → Nagoya → Munich → Amsterdam → Rome → Barcelona → New York → Los Angeles → Mexico City → Rio →
  Dubai → Cairo → Cape Town → Mumbai → Bangkok → Seoul → Shanghai → Hong Kong → Sydney → Moscow → Reykjavík → Las Vegas →
  Fukuoka (finale). Each city has its own procedural skyline (dawn/day/dusk/night palettes), local traffic (taxis, tuk-tuks,
  trams, double-deckers …), roadside props, a music style and level mechanics (rain, fog, ice, sandstorm, oncoming traffic,
  construction, tunnels, police, boss truck/tank/bus, earthquake, festival, neon, drawbridge, lava, aurora, meteors …).
* **Economy.** Coins from runs unlock cars; later cars are gated by level progress or total stars. Everything is reachable
  without paying except the Legend Pass hyper-car. Revive tokens let you continue after a wreck.
* **In-app purchases** (StoreKit 2 via RevenueCat): revive packs and coin packs (consumable), Tank Pack, Legend Pass
  (2× coins + exclusive car) and Unlock All (non-consumable). See [IAP setup](#in-app-purchases-revenuecat--storekit).
* **No binary assets.** Sprites, fonts, skylines, flags, icons and music are generated in code. The web bundle is tiny and
  every pixel is tweakable. Saves live in `localStorage`, mirrored to Capacitor Preferences.

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict), ES2022 |
| Rendering | Hand-rolled Canvas 2D engine, 240 px wide low-res buffer blitted nearest-neighbour to the device canvas |
| Build | Vite 7 (`base: './'`, assets inlined) |
| Native shell | Capacitor 8 (iOS, Swift Package Manager): `@capacitor/app`, `haptics`, `preferences`, `splash-screen`, `status-bar` |
| Purchases | `@revenuecat/purchases-capacitor` (StoreKit 2) with a mock store for web/dev |
| Tooling | Playwright (headless Chromium) for screenshots, smoke tests and the app-icon generator |

Runtime: `Game` runs a fixed 60 Hz update with a variable render and a screen stack (`push/pop/goto`, overlays for
pause/results/tutorial cards). Everything is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); the contributor
contract (file ownership, style rules, roster, ability spec, city/level map) is [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).

## Repository layout

```
src/main.ts            boot: Game, IAP, Capacitor status bar / splash / back button, deep-link routes
src/core/              engine: types, Renderer, Sprite (Grid), Palette, PixelFont, Input, Audio, Save, i18n, Game
src/game/              gameplay: Road, World, Player, Traffic, Hud, Particles, abilities/, mechanics/
src/content/           data: vehicles, vehicleSprites (+ sprites/), abilities, levels, cities (+ cities/), props, icons, flags, music
src/ui/                screens: Title, Garage, Map, Shop, Settings, Play, Pause, Results, Tutorial, nav helpers, dev screens
src/services/          IAP (mock + RevenueCat), Store (economy helpers), Haptics
tools/                 screenshots.mjs, smoke.mjs, icon.mjs
ios/                   Capacitor Xcode project (App/App: Info.plist, Assets.xcassets, CarlaneStore.storekit)
docs/                  ARCHITECTURE.md, AGENT_GUIDE.md, APP_STORE.md (store listing copy)
```

## Development

Requires **Node 20+** (22 recommended). Playwright is used by the tools; a global install with Chromium is expected
(`npm i -g playwright && npx playwright install chromium`) — the tools also pick up a local `playwright` package.

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173 (open on your phone via the LAN IP)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production build into dist/
npm run preview      # serve dist/ on :4173
npm test             # build + quick headless smoke test (every screen, a few levels/cars, gestures)
npm run test:full    # all 30 levels and 25 cars
npm run shots        # screenshots, see below
npm run icon         # regenerate the iOS app icon + launch splash PNGs (tools/icon.mjs)
npm run ios:sync     # build + copy dist/ into the Xcode project
npm run ios:open     # open the Xcode workspace
```

Desktop controls for development: ←/→ or A/D lanes, Space/↑ boost, X/Enter ability, Esc pause.

### Dev routes (deep links)

Routes live in `src/ui/routes.ts` and are read from `location.hash`, e.g. `http://localhost:5173/#screen=garage`:

| Route | Opens |
|---|---|
| `screen=title` · `garage` · `map` · `shop` · `settings` | the respective screen |
| `level=N&car=<vehicleId>` | gameplay; add `&skipcount` (no countdown), `&god` (invincible), `&notut` (no tutorial cards), `&auto=1` (fire ability every second), `&boost=1` (hold boost), `&lane=N`, `&hp=N`, `&ab=<abilityId>` (swap ability) |
| `screen=spritesheet&page=N` · `&traffic=1` · `&all` | vehicle / traffic sprite sheets (8 vehicles per page: rear + 3 damage levels + side) |
| `screen=skyline&city=<cityId>` | a city's skyline at dawn/day/dusk/night |
| `screen=props` · `screen=icons&ids=a,b` · `screen=flags` | prop, ability-icon and flag sheets |
| `&coins=99999&unlockall&maxlevel=30` | simulate progress on any route |

### Screenshot tool

`tools/screenshots.mjs` serves a build directory and screenshots each route at iPhone size (393×852 CSS px, 3× DPR →
1179×2556, the App Store's 6.1"/6.3" size). Add `&t=<seconds>` to wait before capturing (gameplay).

```bash
npm run build
node tools/screenshots.mjs "screen=title" "screen=garage&coins=99999&unlockall&maxlevel=30" "level=1&car=gtr_r34&skipcount&notut&t=6"
# parallel work: build into your own dir and shoot from it
npx vite build --outDir dist-me >/dev/null && DIST=dist-me SHOTS=shots-me node tools/screenshots.mjs "screen=map"
```

The tool prints `PAGEERROR` / `CONSOLE` lines from the page — treat them as failures. Headless Chromium cannot do touch
gestures, so gameplay shots show the car driving straight (use `&auto=1&boost=1` to show abilities and boost).

## Running on an iPhone

**Prerequisites:** macOS with **Xcode 15+** (16 recommended; iOS deployment target is 15.0), **Node 20+**, an Apple ID
(free for device testing, paid Apple Developer Program for TestFlight/App Store), and the iPhone in Developer Mode
(Settings → Privacy & Security → Developer Mode, iOS 16+).

```bash
npm install
npm run build            # dist/
npx cap sync ios         # copies dist/ → ios/App/App/public and refreshes the SPM plugin package
npx cap open ios         # opens ios/App/App.xcodeproj in Xcode
```

In Xcode:

1. Wait for Swift Package resolution (Capacitor, plugins and RevenueCat are pulled via SPM on first open).
2. Select the **App** target → *Signing & Capabilities* → tick *Automatically manage signing* and choose your **Team**.
   Bundle identifier is `com.fehmilay.carlane` (set in `capacitor.config.ts` and the Xcode project). If your team cannot
   use that id, change it in both places and run `npx cap sync ios` again.
   Add the **In-App Purchase** capability once you set up StoreKit (it is added automatically when you enable IAP in App
   Store Connect, but adding it here avoids a signing warning).
3. Pick your iPhone in the run destination and press **Run** (⌘R). First install with a free Apple ID: on the phone go to
   Settings → General → VPN & Device Management and trust the developer certificate.
4. The app is portrait-only, status bar hidden, full-screen, dark UI (see `ios/App/App/Info.plist`). Safe areas (notch /
   home indicator) are read from CSS `env()` insets and respected by every screen.

Iterating: after every web change run `npm run build && npx cap sync ios` (or `npm run ios:sync`) and Run again. For fast
iteration on the phone you can also open the Vite dev server URL in Safari — everything except haptics and IAP works on the
web (the mock store simulates purchases).

**Archive for TestFlight / App Store:** Product → Archive with *Any iOS Device (arm64)* selected, then Distribute in the
Organizer. Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in the target's *General* tab first. Store listing copy,
screenshots and rating/privacy answers are prepared in [`docs/APP_STORE.md`](docs/APP_STORE.md).

### iOS project notes

* `ios/App/App/Info.plist` — portrait only (iPhone and iPad), `UIStatusBarHidden`, `UIRequiresFullScreen`, category
  `public.app-category.games`, `ITSAppUsesNonExemptEncryption = false` (no export-compliance prompt), German + English
  localizations.
* `ios/App/App/Assets.xcassets` — `AppIcon.appiconset` (single 1024×1024 icon) and `Splash.imageset` (2732×2732 at 1x/2x/3x),
  both generated by `npm run icon`. The launch storyboard aspect-fills the splash; the artwork is kept in the centre so
  nothing is cut off on 19.5:9 phones.
* `ios/App/App/CarlaneStore.storekit` — StoreKit configuration for local purchase testing (see below). The shared scheme
  `App` (ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme) already references it for Run.
* `ios/App/App/public` and `capacitor.config.json` are generated by `cap sync` and git-ignored.

## In-app purchases (RevenueCat + StoreKit)

`src/services/IAP.ts` picks the implementation at boot: on a native build **with** `VITE_REVENUECAT_IOS_KEY` it uses
RevenueCat (StoreKit 2); otherwise the **mock store** (every purchase succeeds after 400 ms, restore returns nothing).
`src/services/Store.ts` applies purchases to the save (`grantProduct`), runs the buy/restore flows and the coin/level/star
unlock rules.

### 1. Environment

```bash
cp .env.example .env
# VITE_REVENUECAT_IOS_KEY=appl_xxxxxxxxxxxxxxxx   (RevenueCat → Project → API keys → App-specific keys → iOS)
npm run build && npx cap sync ios
```

The key is a *public* SDK key and is inlined into the JS bundle at build time. Still, keep `.env` out of git.

### 2. Products (`PRODUCT_IDS` in `src/services/IAP.ts`)

| Key | App Store product id | Type | Grants | Suggested price (EUR / USD) |
|---|---|---|---|---|
| `revive_3` | `com.fehmilay.carlane.revive3` | Consumable | 3 revives | 0,99 € / $0.99 |
| `revive_10` | `com.fehmilay.carlane.revive10` | Consumable | 10 revives | 2,49 € / $2.49 |
| `coins_s` | `com.fehmilay.carlane.coins.s` | Consumable | 2 500 coins | 0,99 € / $0.99 |
| `coins_m` | `com.fehmilay.carlane.coins.m` | Consumable | 8 000 coins | 2,99 € / $2.99 |
| `coins_l` | `com.fehmilay.carlane.coins.l` | Consumable | 20 000 coins | 5,99 € / $5.99 |
| `coins_xl` | `com.fehmilay.carlane.coins.xl` | Consumable | 50 000 coins | 11,99 € / $11.99 |
| `tank_pack` | `com.fehmilay.carlane.tankpack` | Non-consumable | Type 90, Leopard 2, Wolf APC | 4,99 € / $4.99 |
| `legend_pass` | `com.fehmilay.carlane.legendpass` | Non-consumable | Volt Lini + 2× coins | 6,99 € / $6.99 |
| `unlock_all` | `com.fehmilay.carlane.unlockall` | Non-consumable | all 48 vehicles | 14,99 € / $14.99 |

Prices shown in the shop come from the store; the EUR strings above are the `FALLBACK_PRICES` used when the store is
unavailable. Coin amounts are `COIN_PACKS` / `REVIVE_PACKS` in `src/services/Store.ts`.

### 3. App Store Connect

1. Create the app (bundle id `com.fehmilay.carlane`, primary language German). Fill in *Agreements, Tax, and Banking* —
   the Paid Apps agreement must be active before products load in sandbox.
2. *Monetization → In-App Purchases*: create the 9 products with the ids, types and display names above (localized
   names/descriptions are in `docs/APP_STORE.md` and in the `.storekit` file). Set prices with the EUR tier as base.
   Add a review screenshot for each product (any shop screenshot is fine) and set them to *Ready to Submit*.
3. *Users and Access → Sandbox*: create a sandbox tester; sign in with it on the device under Settings → App Store →
   Sandbox Account. IAP works in sandbox on any signed dev build.
4. Enable the **In-App Purchase** capability on the App ID (developer portal) — Xcode's automatic signing does this when
   you add the capability to the target.

### 4. RevenueCat

1. Create a project, add an **App Store** app with the bundle id, and paste the **App-Specific Shared Secret** (App Store
   Connect → App → App Information → App-Specific Shared Secret) or upload the *In-App Purchase Key* (.p8) for StoreKit 2.
2. Import/create the 9 products under *Products*. Entitlements/offerings are optional — the app fetches products by id
   (`Purchases.getProducts`) and grants locally, it does not use RevenueCat offerings.
3. Copy the iOS SDK key into `.env` (see above). Restore purchases is wired to `Purchases.restorePurchases()` and re-grants
   the non-consumables (`tank_pack`, `legend_pass`, `unlock_all`).

### 5. StoreKit configuration file (local testing without App Store Connect)

`ios/App/App/CarlaneStore.storekit` lists all 9 products with EUR prices and German/English localizations. The shared
`App` scheme references it, so **Run from Xcode uses the local StoreKit store**: purchases succeed instantly, no sandbox
account needed, and you can inspect/refund transactions in Xcode via Debug → StoreKit → Manage Transactions. To toggle it,
edit the scheme (Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration). RevenueCat works with StoreKit
configuration files as long as `VITE_REVENUECAT_IOS_KEY` is set (RevenueCat validates against the local store in this mode;
see their "StoreKit configuration file" docs — enable *StoreKit 2* in the SDK, which the Capacitor plugin does by default).

## Where content lives

| Content | File(s) | Notes |
|---|---|---|
| Vehicles (48) | `src/content/vehicles.ts` | ids/numbers/brands/abilities are final; palettes from the reference sheet; unlock rules |
| Vehicle sprites | `src/content/vehicleSprites.ts`, `src/content/sprites/{rear,side,traffic}.ts` | procedural templates per body type, recolor slots `B b H A G L W C`, damage levels |
| Abilities | `src/content/abilities.ts` (catalog), `src/game/abilities/` (runtime) | behaviour spec in `docs/AGENT_GUIDE.md` |
| Levels (30) | `src/content/levels.ts` | lanes, length, density, time of day, mechanics, star thresholds, reward |
| Cities (30) | `src/content/cities.ts`, `src/content/cities/{asia,europe,world}.ts` | palettes per time of day, skyline painters, local traffic, props, music style |
| Level mechanics | `src/game/mechanics/` | weather, bosses, hazards |
| Props / icons / flags | `src/content/props.ts`, `icons.ts`, `flags.ts` | pixel grids |
| Music | `src/content/music.ts`, `src/core/Audio.ts` | pattern-based chiptune per music style, SFX synthesized |
| Strings | `src/core/i18n.ts` (`STR`), `t('key')`, `L({de,en})` | German first, English fallback; modules may `Object.assign(STR, {...})` |
| Economy / IAP | `src/services/Store.ts`, `src/services/IAP.ts` | |
| Save | `src/core/Save.ts` | versioned JSON, `localStorage` + Capacitor Preferences |

## Design language

The whole game is drawn in a 240-px-wide low-res space and imitates the "夢のガレージ / JAPAN CAR COLLECTION" Nintendo-style
reference sheet:

* **Game-Boy shell UI** — gray bezel/paper panels (`P.paper`, `P.paperDark`) with chunky 1-px black frames, a black
  header bar with tabs where the active tab is red, a console bar at the bottom (D-pad, PLAYER 1 ♥♥♥, SELECT/START pills,
  B/A buttons).
* **Numbered black cards** — "01 GT-R R34" with brand badge and a city/blossom backdrop for every vehicle and level.
* **Saturated 8-bit palette** (`src/core/Palette.ts`): red `#e0202a`, blue `#2040e0`, yellow `#f0c020`, purple `#8030c0`,
  pink `#e04080`, orange `#f07020`, white `#f0f0f0`, sakura `#ffb7d0`; 1-px black outlines everywhere.
* **Japanese street-culture decoration** — kanji (日本の伝説, 夢, 車は夢を追う CARS CHASE DREAMS), cherry blossoms, torii gates,
  Mt. Fuji, checker flags, "EST. 1990", "JDM CARS TUNING LIFESTYLE FOREVER".
* **Pixel font only** (`r.text`), scale 1 for body text, 2 for headings, uppercase; German strings first.
* **Feel** — hit-stop, screen shake, flashes, explosions with debris, progressive damage on the player sprite, haptics on
  iOS. Every ability must be recognisable from its visual alone.

The app icon and splash (`tools/icon.mjs`) follow the same language: a Bayside-blue GT-R side view with black outline on a
red sky / dark-blue road split, a white rising sun, sakura, and a white pixel "CARLANE" wordmark.

## Release checklist

1. `npm run test:full` passes with no page errors; `npm run shots` on the key screens looks right on a real device.
2. `npm run icon` (if the artwork changed), `npm run build`, `npx cap sync ios`.
3. Xcode: bump version/build, Archive, upload. Check the IAP products are *Ready to Submit* and attached to the version.
4. App Store Connect: listing copy, keywords, screenshots (6.9"/6.7" set), age rating, privacy answers → `docs/APP_STORE.md`.
5. Submit for review; mention in the review notes that purchases can be tested with the sandbox and that the app has no
   accounts or network features besides StoreKit/RevenueCat.
