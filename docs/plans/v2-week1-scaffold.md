# v2 Week 1 — Skeleton + proof of risk

> Approval note: Tomáš authorized autonomous execution of this scaffold on 2026-06-12
> ("do as much work as possible without asking for permissions"). Design decisions below
> come verbatim from `V2_HANDOFF.md`, which is the confirmed source of truth. Items marked
> **NEEDS CONFIRMATION** are the only ones not settled there.

## What this changes and why

Creates the `v2/` directory per the handoff's week-1 build order: pnpm + Vite + TypeScript
strict + ESLint flat config + Vitest scaffolding, Capacitor initialized with app id
`com.nesro.nova`, a deterministic fixed-tick game core (conveyor, energy budget, brownout)
with tests, a minimal Phaser view rendering at native DPR with the baked-glow additive neon
look, a minimal simulator CLI that imports the real core, and a seeded `v2/CLAUDE.md`. The
old `phaser/` tree is untouched (read-only reference).

## Design decisions requiring confirmation

All major decisions are already settled in `V2_HANDOFF.md` §2–§4 (fixed 100 ms tick,
Mulberry32 PRNG, brownout slope, landscape conveyor, baked glow + ADD blend, dpr-sharp
canvas, Capacitor week 1). Two small gaps the handoff does not fully specify:

- **NEEDS CONFIRMATION — collision damage routing.** §3.1 says a colliding enemy deals
  "chunky hull damage through the shield (~3× a normal shot)". Implemented as: damage hits
  the shield first, remainder goes to hull (matches v1's note "destroyed in expense of
  shield or HP"). Alternative reading: bypasses shield entirely. Easy one-line change.
- **NEEDS CONFIRMATION — test layout.** Handoff §2.3 says "Vitest (or colocated *.test.ts —
  pick one, stay consistent)". Picked **colocated** `*.test.ts` next to the module under
  test (shorter imports, files stay small).

## Complexity analysis

- Core tick: O(E) per tick where E = live enemies on the conveyor (≤ ~30 by design).
  Pierce weapon hit resolution is O(E log E) due to one sort by distance per shot —
  fine at these sizes, and the sort only runs when a shot fires.
- Simulator: O(R × T × E) where R = runs, T = ticks per mission (≤ 1200 for a 120 s
  mission). 1000 runs of a 60 s mission ≈ 600k tick-enemy operations — milliseconds.
- No DB, no HTTP, no per-user loops in this project.

## Test plan

- [x] rng: same seed → identical sequence; different seeds diverge
- [x] energy: generator fills pool up to capacity, motor draws every tick
- [x] brownout: fire interval is 1× at ≥30% energy, stretches smoothly toward 2× near 0,
      never fully stops firing
- [x] conveyor: enemies advance toward the ship each tick
- [x] collision: enemy reaching the ship dies and deals 3× shot damage (shield first)
- [x] auto-fire: front-most enemy takes damage; pierce weapon hits first N with falloff
- [x] enemy fire: shield absorbs, remainder hits hull; shield regen draws energy
- [x] blocker: pauses the wave timeline until killed; motor multiplier scales the timeline
- [x] mission outcome: victory when timeline exhausted + enemies dead; defeat at hull 0
- [x] determinism: two runs with same seed + mission produce identical resultHash
- [x] replay: ReplayRecord re-run reproduces the original resultHash

## File hygiene

- No hardcoded personal paths or credentials introduced.
- v1's `utcDateInt`/`utcDateString` helpers are NOT ported (not needed in week 1; daily
  missions are cut from v1 scope anyway).

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user (via V2_HANDOFF.md; 2 small items flagged above)
- [x] Test plan approved by user (autonomous session authorization)

**Guardrails**
- [x] No opt-out preference guards in this code (game, not notifications)
- [x] No throttle/dedup keys in this code
- [x] Blast radius: v2/ is brand new and unreferenced; failure breaks nothing outside it
- [x] No swallowed exceptions; tools CLI fails fast with context

**Performance**
- [x] Every loop over game entities has its Big-O stated above
- [x] Nothing worse than O(E log E) per tick
- [x] No DB/HTTP calls anywhere

**Readability**
- [x] No function exceeds 100 lines or 5 positional parameters
- [x] Tunable numbers live in named constants / typed spec objects
- [x] No premature abstractions
- [x] Non-obvious invariants (brownout slope, timeline stall) carry one-line why-comments

**Testability**
- [x] Every core module has happy-path + edge-case tests (list above)
- [x] No mock stubs; the core is pure and tested directly
- [x] Edge cases: zero energy, dead conveyor, empty timeline covered

**File hygiene**
- [x] No hardcoded personal paths, usernames, or credentials
- [x] No TODO/FIXME without owner
- [x] No commented-out code

**CI**
- [x] `pnpm build:dry` passes (tsc --noEmit)
- [x] `pnpm lint` passes
- [x] `pnpm test` passes
