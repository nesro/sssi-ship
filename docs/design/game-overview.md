# Game Overview

## What it is

Nesro Nova is a mobile idle/roguelite space shooter for Google Play
(`com.nesro.nova`). Landscape, free, offline. The player manages a ship's four
systems (weapon, shield, generator, motor) in a persistent hub, then runs
30–90 second missions where the ship fights automatically. The player's role
during combat is to choose cards offered by support ships and activate reserve
supply boosts at the right moment.

Target play session: ~1 hour across ~20 missions to reach the final boss and
see the credits. Replay value comes from the card system and loadout
optimisation, not procedural map generation.

## Core philosophy

**The player is never stuck.** Every failure state has a path out:
- Can't beat a mission → replay it for coins, buy better gear in the shop.
- Can't afford gear → replay any unlocked mission.
- Cards are bad → spend rerolls; skip what doesn't fit; no card is mandatory.

This principle overrides all other design concerns. Never gate progress behind
a single "correct" card choice or a fixed DPS threshold that punishes wrong gear.

## Constitutional rules (from v2/CLAUDE.md)

1. `src/core/` is pure deterministic TypeScript — zero Phaser, zero DOM, zero
   `Math.random()`. All randomness through the seeded Mulberry32 PRNG.
2. The simulator and the live game run the same core module.
3. Phaser is a view layer only — reads core state, never mutates it.
4. The tick phase order in `tick.ts` is a determinism contract. Changing it
   invalidates every replay.
5. Resource mechanics are slopes, never cliffs. The brownout rule (fire
   interval stretches at low energy, never stops) exists because v1's binary
   energy gate created an unrecoverable death spiral.

## Platform

- Google Play, app id `com.nesro.nova`
- Capacitor → Android Studio (`npx cap sync android && npx cap open android`)
- Canvas is `logical × devicePixelRatio` with `zoom: 1/DPR` for sharp text
- All sizing through `px()` / `fontPx()` from `src/view/layout.ts`

## What v2 rebuilt vs v1

v1 (Phaser, in `../phaser/`) is a read-only reference corpus. v2 is a clean
TypeScript rebuild with a deterministic core, headless simulator, and proper
Capacitor packaging. Never port code from v1 — port knowledge only (except
`rng.ts`, ported verbatim).
