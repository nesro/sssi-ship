# Nesro Nova v2 — Agent orientation guide

Read `../GAME_DESIGN.md` **first** — it's a short index into `../docs/design/`, the single
source of truth for all design decisions (confirmed by Tomáš on 2026-07-01, restructured into
topic files 2026-07-15). Read the topic file(s) relevant to what you're working on; do not
re-litigate anything settled there. This file covers how the v2 codebase itself is organized
and the rules for working in it.

## What this is

Nesro Nova is a mobile arcade roguelite space shooter for Google Play (app id
`com.nesro.nova`, landscape, free, offline) — corrected 2026-07-18 to match
[Game Identity](../docs/design/01-identity.md); "idle" was dropped project-wide
2026-07-15 (no away-progression mechanics exist). v2 is a clean rebuild; the old
`../phaser/` tree is a **read-only reference corpus** — port knowledge, never code
(except `rng.ts`, ported verbatim by instruction).

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

## Known issues & gaps (mandatory)

**When you find a gap, bug, inconsistency, or a design question with no clear answer —
document it immediately in `../docs/known-issues.md`, even if it's out of scope for what
you're doing right now.** That file is the durable catch-all; without it, findings from
one conversation evaporate once the session ends. Check that file before starting new
work in an area, and move an entry to its "Resolved" section (with date + what fixed it)
once you close it out — don't just delete it.

## How to run

```bash
cd v2/
pnpm install        # first time only
pnpm dev            # Vite dev server
pnpm test           # Vitest (colocated *.test.ts — the chosen convention, stay consistent)
pnpm lint           # ESLint flat config, type-checked rules
pnpm build:dry      # tsc --noEmit
pnpm build          # typecheck + production bundle
pnpm sim -- --mission m1 --runs 1000        # headless balance runs (real core)
pnpm campaign       # full-campaign sim; expect 100%/100% completion
pnpm balance        # star-reachability sweep (writes tools/balance-report.md)
pnpm tune           # per-mission loadout recommendation + dominant-kind report
pnpm pacing         # SLOW_START/IDLE_STRETCH/MONOTONY flags (writes tools/pacing-report.md)
pnpm audit-taps     # headless tap-target audit (44px min, 20px edge margin)
pnpm screenshot     # full visual-verification batch (writes v2/screenshots/*.png)
npx cap sync android && npx cap open android  # Capacitor → Android Studio
```

Run `pnpm lint` and `pnpm build:dry` after every edit; fix warnings immediately.
`pnpm dlx fallow` (dead-code/consistency checker, config `v2/.fallowrc.json`) is also run
before closing out any nontrivial change.

## Visual verification rule (mandatory)

After **any** change to `src/view/` — renderers, textures, layout, HUD, shop preview — take a `preview_screenshot` before reporting the task done. Never trust code logic alone to verify rendering output. Use `__cheat.equip(id)` and `__cheat.navShop(tab)` to reach the right state fast.

## Layout

Rewritten 2026-07-18 — the previous version referenced a `MenuScene`/`ShopScene` scene
graph and a "week-1 skeleton" `tools/` that no longer match the shipped code.

```
v2/
  src/
    core/        # pure simulation: rng, types, constants, state, energy (brownout),
                 # combat, conveyor, timeline, tick (orchestrator), replay (+hash),
                 # cards, supplies, stats, stars, narrator, result — colocated *.test.ts
    data/        # typed TS data files: missions.ts, items.ts, cards.ts, story.ts,
                 # abilities.ts, subscriptions.ts, dailyMission.ts (date-seeded daily
                 # generator), loadouts.ts (STARTER_LOADOUT + resolveForcedLoadout —
                 # shared by view, sim, and tests; never resolve forced loadouts in
                 # the view layer)
    viewmodel/   # pure-TS view logic, zero Phaser imports — computeGalaxyMap/
                 # computeMissionDetail (hub.ts), computeCombatHudViewModel (combat.ts),
                 # computeResultViewModel (result.ts), shop preview + shop-tab config
                 # (preview.ts, shopSystems.ts). Scenes read these, never recompute
                 # game logic inline — this is what lets Phase C's viewmodel tests run
                 # with zero Phaser/DOM dependency.
    view/        # Phaser scenes only (5 total): main.ts (dpr-sharp config, scene list,
                 # __cheat dev console), BootScene, AlphaNoticeScene (every-launch
                 # dev-build notice), HubScene (galaxy map + shop/dispatch/settings/
                 # credits as nav panels inside this one scene, not separate scenes),
                 # CombatScene, ResultScene. Plus CombatHud, CardOverlay, HubTour,
                 # NarratorBar, SupplyButtons, ShopPreviewPanel, textures.ts (baked
                 # glow), palette.ts, layout.ts (px()/DPR helpers), widgets.ts
                 # (addTextButton/ensureMinTapTarget — the 44px tap-target floor).
    save/        # SaveManager.ts — load/persist/migrate SaveData, purchase/switch-cost
                 # logic, mission-unlock checks. Single source of truth for save state;
                 # view and viewmodel both read/write through this, never localStorage
                 # directly.
    audio/       # SoundManager.ts — game-level singleton over Phaser sound: looping music
                 # + SFX (fire/kill/shield-pulse/boost/victory) + persisted mute. Assets
                 # are copied into v2/public/audio/ (source files live in ../sounds)
  tools/         # simulate.ts (headless sim CLI), campaign-simulate.ts, balance-sweep.ts,
                 # tune-loadouts.ts, pacing-report.ts, loadoutPresets.ts (named reference
                 # loadouts for time-star anchoring), playwrightHarness.ts (shared
                 # __cheat-driving plumbing), screenshot.ts, tap-target-audit.ts
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

## Current state and open items

**Removed 2026-07-18** — this file used to carry an inline "Week-1 state" status list
(toolchain/core/renderer done, a "Next:" queue) that had long since all shipped, plus a
"flagged for Tomáš" question (shield-first collision routing) that was answered and
implemented (shield-first is the shipped, intentional behavior — see
[Combat](../docs/design/06-combat.md)). Keeping a second, inline copy of project status
here just gives it a second place to drift out of sync with reality — read
[Status — What's Built vs What's Planned](../docs/design/14-status.md) instead; it's the
one place this is tracked now.

**On-device smoke test** (additive renderer + text sharpness on a real Android phone) is
still genuinely outstanding and needs a human with a phone — not something an agent
session can close out; check 14-status.md for its current state before assuming it's
been done.
