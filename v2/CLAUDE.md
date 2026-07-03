# Nesro Nova v2 — Agent orientation guide

Read `../GAME_DESIGN.md` **first** — it is the single source of truth for all design
decisions (confirmed by Tomáš on 2026-07-01). Do not re-litigate anything settled there.
This file covers how the v2 codebase itself is organized and the rules for working in it.

## What this is

Nesro Nova is a mobile idle/roguelite space shooter for Google Play (app id
`com.nesro.nova`, landscape, free, offline). v2 is a clean rebuild; the old `../phaser/`
tree is a **read-only reference corpus** — port knowledge, never code (except
`rng.ts`, ported verbatim by instruction).

## Constitutional rules (violations broke v1 — never bend these)

1. **`src/core/` is pure deterministic TypeScript. Zero Phaser imports, zero DOM, zero
   `Math.random()`** (ESLint enforces the last one). Fixed 100 ms tick. All randomness
   through the seeded Mulberry32 PRNG in `src/core/rng.ts`.
2. **The simulator and the live game run the same core module.** `tools/simulate.ts`
   imports `src/core/` directly. Never write a parallel approximation.
3. **Phaser is a view layer only**: it interpolates positions between ticks and translates
   input into tick-stamped commands. The view reads core state; it never mutates it.
4. **The tick phase order in `src/core/tick.ts` is a determinism contract.** Changing it
   invalidates every replay. Same for anything `hashCoreState` covers.
5. **Resource mechanics are slopes, never cliffs.** The brownout rule (fire interval
   stretches below 30% energy, capped at 2×, never stops) exists because v1's binary
   energy gate created an unrecoverable death spiral.

## How to run

```bash
cd v2/
pnpm install        # first time only
pnpm dev            # Vite dev server
pnpm test           # Vitest (colocated *.test.ts — the chosen convention, stay consistent)
pnpm lint           # ESLint flat config, type-checked rules
pnpm build:dry      # tsc --noEmit
pnpm build          # typecheck + production bundle
pnpm sim -- --mission smoke-1 --runs 1000   # headless balance runs (real core)
npx cap sync android && npx cap open android  # Capacitor → Android Studio
```

Run `pnpm lint` and `pnpm build:dry` after every edit; fix warnings immediately.

## Visual verification rule (mandatory)

After **any** change to `src/view/` — renderers, textures, layout, HUD, shop preview — take a `preview_screenshot` before reporting the task done. Never trust code logic alone to verify rendering output. Use `__cheat.equip(id)` and `__cheat.navShop(tab)` to reach the right state fast.

## Layout

```
v2/
  src/
    core/        # pure simulation: rng, types, constants, state, energy (brownout),
                 # combat, conveyor, timeline, tick (orchestrator), replay (+hash)
                 # tests are colocated *.test.ts
    data/        # typed TS data files: missions.ts, items.ts, cards.ts, story.ts,
                 # loadouts.ts (STARTER_LOADOUT + resolveForcedLoadout — shared by view,
                 # sim, and tests; never resolve forced loadouts in the view layer)
    view/        # Phaser: main.ts (dpr-sharp config), BootScene (preloads audio →
                 # MenuScene), CombatScene, CombatHud, ShopScene + ShopPreviewPanel,
                 # textures.ts (baked glow), palette.ts, layout.ts (px()/DPR helpers)
    audio/       # SoundManager.ts — game-level singleton over Phaser sound: looping music
                 # + SFX (fire/kill/shield-pulse/boost/victory) + persisted mute. Assets
                 # are copied into v2/public/audio/ (source files live in ../sounds)
  tools/         # simulate.ts CLI — week-1 skeleton; balance:ci + --sweep + campaign in week 2
  android/       # Capacitor-generated; never hand-edit, regenerate via cap sync
```

## Key conventions

- **Types** live in `src/core/types.ts` for the core; view-only types stay in view files.
  No central `types/index.ts`, no DTO folders — this is a game, not a NestJS service.
- **View sizing**: the canvas is `logical × devicePixelRatio` with `zoom: 1/DPR`
  (sharp-text fix, handoff §4.2). Always size through `px()` / `fontPx()` from
  `src/view/layout.ts`; never hardcode pixel values in scenes.
- **Neon look**: baked glow via multi-pass `generateTexture()` + `ADD` blend over
  near-black (`src/view/textures.ts`). Never per-object PostFX. Palette is system-coded
  in `src/view/palette.ts`: weapon cyan, shield blue, generator amber, motor magenta,
  enemies red/orange.
- **Data files** (`src/data/`) are plain typed constants. The simulator is the mission
  editor — no GUI editors.
- **Errors**: fail fast with context (mission id, seed) — see `timeline.ts` / `replay.ts`
  for the pattern. No swallowed exceptions, no silent nulls.
- Functions ≤100 lines, ≤5 params (ESLint-enforced). Named constants over magic numbers —
  tunables live in `src/core/constants.ts` or the typed specs in `src/data/`.

## Week-1 state and open items

Done: toolchain, deterministic core (conveyor, energy budget, brownout, blockers,
timeline, replay records + hash verification) with full test coverage, dpr-sharp Phaser
view with baked-glow renderer, simulator skeleton, Capacitor android platform.

Flagged for Tomáš:
- Collision damage currently routes **shield-first** ("through the shield" reading);
  one-line change in `conveyor.ts` if it should bypass shields.
- **On-device smoke test** of the additive renderer + text sharpness on a real Android
  phone is a week-1 exit criterion that needs a human with a phone.

Next: landscape revert (960×540, three-panel layout), rear weapon slot, subscriptions system, WelcomeScene.
