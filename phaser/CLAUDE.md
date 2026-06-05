# Nesro Nova — Agent orientation guide

This file is the first thing any AI agent should read. It explains what the project is,
how it's structured, and what the current state is.

## What this project is

**Nesro Nova** is a mobile idle/roguelite space shooter. The player's ship fights
autonomously — the player's job is to configure the ship between missions (shop, talent
tree) and pick power-up cards during missions. No direct combat control.

This is a spiritual remake of a 2010 school project called SSSI Ship, built by Tomáš
Nesrovnal ("Nesro") for his maturita exam.

**Tech stack:** Phaser 3 + Vite 6 + TypeScript. Capacitor will wrap it for Android later.
No image assets — all visuals are drawn procedurally via `Graphics.generateTexture()`.

## How to run

```bash
cd phaser/
npm install        # first time only
npm run dev        # start the dev server → http://localhost:5173
npm run typecheck  # verify TypeScript compiles clean (no emit)
npm run build      # production bundle
npm test           # run Vitest unit tests (pure functions only)
```

## Project layout

```
phaser/
  src/
    main.ts                  # Phaser.Game config + scene registration; window.__game dev helper
    SaveManager.ts           # localStorage read/write; versioned; defines SaveData + related types
    data/
      missions.ts            # MissionDefinition + MissionResult types; calculateStars()
      cards.ts               # CardDefinition + StatDelta types; ALL_CARDS array
      items.ts               # ItemDefinition + SideWeaponType types; ITEMS record
      talents.ts             # TalentBranch + TalentNode types; TALENT_TREE array
      daily.ts               # DailyWaveSpec; generateDailyWaves(); dailyCoins()
    debug/
      DebugConfig.ts         # Singleton toggle; persists to localStorage; window.__debug
      DebugOverlay.ts        # Phaser panel rendering live stats; defines DebugStats type
    game/
      enemy.ts               # EnemyType + EnemySprite types (Phaser sprite extension)
      EnergyManager.ts       # Energy pool; trySpend(); regen per frame delta
      ShieldSystem.ts        # Shield HP pool; absorbs hits; regens from energy
      AutoAim.ts             # findNearestEnemy() + aimVelocity() — pure functions
      AutoDodge.ts           # Threat detection on incoming shots; lateral dodge; lastDodgeTime
      CardManager.ts         # Weighted draw; defines RunState type
      AllyShipEvent.ts       # scheduleAll() registers timed fly-bys; drops card on exit
      computeStats.ts        # Pure fn: computeStats(save) → ComputedStats; defines ComputedStats
      TutorialHUD.ts         # One-shot mechanic tooltips for the tutorial mission
      Starfield.ts           # Scrolling star background (90 particles, depth −1)
      textures.ts            # buildGameTextures(): all procedural textures for the combat scene
    hud/
      CombatHUD.ts           # Bottom status strip (HP/GEN/SHD bars + XP bar + score/level)
      ShieldVisual.ts        # Glowing shield ring following the player; flashes on hit
      EnemyHpBars.ts         # Per-enemy HP bar drawn via a single persistent Graphics object
    scenes/
      WelcomeScene.ts        # First-launch screen + Credits (fromMenu=true)
      MenuScene.ts           # Main menu: animated stars + asteroids, PLAY + ABOUT
      MissionSelectScene.ts  # Mission cards with unlock gates and best-star display
      GameScene.ts           # Combat loop coordinator (~760 lines)
      ResultScene.ts         # Post-mission summary: stars, coins, stat rows
      ShopScene.ts           # Buy / upgrade / sell / equip items
      TalentScene.ts         # Tab-per-branch talent tree; travel nodes + keystones; respec
    ui/
      NavBar.ts              # Shared bottom nav (MENU / MISSIONS / SHOP / TALENTS)
      LevelUpOverlay.ts      # Modal card picker; shows on level-up and ally drops
      SideWeaponButton.ts    # 80×80 tap button with cooldown bar; dims at low energy
  tools/
    simulate.ts              # CLI: headless balance simulator (npx tsx tools/simulate.ts)
    sim/
      SimEngine.ts           # Headless game loop — pure TS, no Phaser
      SimTypes.ts            # SimConfig, SimResult, SimEnemy interfaces
      SimCardManager.ts      # Wraps real CardManager for headless use
      strategies/
        CardStrategy.ts      # Interface: pick(cards, stats, run) → CardDefinition
        RandomStrategy.ts    # Baseline luck simulation
        GreedyStrategy.ts    # Greedy-damage casual player model
        OptimalStrategy.ts   # Synergy-aware veteran model
  editor/
    index.html               # Standalone offline content editor (cards / missions / talents)
  docs/
    PROGRESS.md              # Phase checklist — update whenever a task completes
    FLIGHT_READING.md        # 6-hour offline study guide
    plans/                   # One .md per planned feature (write plan, get approval, implement)
```

## Key conventions

**Types** — Types live in the file they naturally belong to. `SaveData` is in `SaveManager.ts`,
`MissionDefinition` is in `data/missions.ts`, etc. There is no central `types/index.ts`.
The `.js` extension is required on all imports (moduleResolution=bundler): e.g.
`import type { SaveData } from '../SaveManager.js'`.

**Textures** — Built by `buildGameTextures(scene)` in `src/game/textures.ts`.
Uses a temporary off-screen `Graphics` object per texture, then calls `generateTexture` and
destroys it. No PNG files — everything is procedural.

**EnemySprite** — Phaser groups return `GameObject[]`, but enemies carry extra fields (`hp`,
`enemyType`, etc.). Cast with `as unknown as EnemySprite` at the point of creation. The type
is in `src/game/enemy.ts`.

**TextStyle** — Phaser's type for text color is `color`, not `fill`. Always use `color: '#rrggbb'`.

**Collision callbacks** — `physics.add.overlap(a, b, callback, undefined, this)`. Use `undefined`
not `null` for the processCallback slot.

**Save data** — All state goes through `SaveManager`. Two star counters:
- `totalStarsEarned` — never decreases; used for mission unlock gates
- `spendableStars` — spent in the talent tree; can go down

**Debug overlay** — Toggle with F1 in-game, or `window.__debug.toggle()` in the browser
console. State persists in localStorage key `nesro-nova-debug`.

## Scene flow

```
WelcomeScene  →  MenuScene  →  MissionSelectScene  →  GameScene  →  ResultScene
                     ↑                                                     |
                     └─────────────────────────────────────────────────────┘
                     ↕               ↕
                  ShopScene      TalentScene   (accessible via NavBar from MenuScene)
```

WelcomeScene skips itself and goes straight to MenuScene when `save.welcomeSeen === true`.
The "About" button in MenuScene goes back to WelcomeScene with `{ fromMenu: true }`.

## Physics & depth layers

| Layer | depth | Contents |
|-------|-------|----------|
| Starfield | -1 | Scrolling background dots |
| Shield glow | 4 | Semi-transparent circle following player |
| Player + enemies | 0–5 | Ship (5), enemies (0), lasers (0) |
| Damage numbers | 8 | Floating "+10" text, self-destroying |
| HUD + boss bar | 9–10 | Bottom panel bg (9), bars + text (10) |
| Tutorial tooltips | 20 | Dark-bg pill text, fades automatically |
| Debug overlay | 100–101 | Stats panel |

## Balance targets (confirmed)

All targets validated by `tools/simulate.ts`. Re-run after any stat change.

| Mission | Random | Greedy | Optimal |
|---------|--------|--------|---------|
| Tutorial | 85% | 90% | 95% |
| M1 — no gear | 45% | 60% | 75% |
| M1 — basic gear | 65% | 80% | 90% |
| M2 — M1 gear | 20% | 45% | 65% |
| M3 — full gear | 8% | 28% | 55% |

Luck spread (same loadout, best vs worst draws): ±15–20 percentage points.

## What is NOT implemented yet

See `docs/PROGRESS.md` for the full phase breakdown. Current gaps:

- **Phase 4** (not started): Missions 2 and 3, environmental modifiers, full card pool
- **Seeded RNG** (planned): Per-run reproducible PRNG in the simulator.
  Plan: `docs/plans/seeded-rng.md`
- **Campaign simulator** (planned): Meta-simulation of a full player
  progression (tutorial → M1 → buy → M2 → …), reports runs-to-clear and grind time.

## Running the balance simulator

```bash
cd phaser/
npx tsx tools/simulate.ts --mission mission_1 --runs 2000
npx tsx tools/simulate.ts --mission mission_3 --loadout full --strategy optimal
```

## Game design reference

The full confirmed game design (energy system behaviour, star economy, roguelite cards,
ally ships, rerolls, etc.) is at `docs/plans/sssi-ship-mobile-redesign.md`.
