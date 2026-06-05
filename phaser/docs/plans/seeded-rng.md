# Plan: Seeded RNG

## What this changes and why

Currently `Math.random()` is used for everything — card draws, enemy fire timing, spawn
jitter. This is fine for the main game (unpredictability is a feature), but it causes two
concrete problems: (1) the balance simulator produces different numbers on every batch run
making it hard to compare tuning attempts, and (2) the daily mission needs all players to
face the same enemy layout on the same date. A single 5-line Mulberry32 PRNG in
`src/utils/rng.ts` solves both without touching game combat code at all.

---

## Design decisions (confirmed in conversation)

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Main game combat | Keep `Math.random()` — high refactor cost, low player benefit |
| 2 | Daily wave generation | Date-seeded Mulberry32 in `src/data/daily.ts` |
| 3 | Balance simulator | Per-run seeded PRNG (future work, separate PR) |
| 4 | PRNG algorithm | Mulberry32 — 5 lines, no deps, high-quality output |
| 5 | Date seed format | `YYYYMMDD` UTC integer — same value for all players same day |

---

## Implementation

`src/utils/rng.ts` (new file, ~25 lines):

```typescript
/** Mulberry32 — fast, seedable, good statistical quality. */
export function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Returns today's UTC date as an integer, e.g. 20260605. */
export function utcDateInt(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/** Returns today's UTC date as "YYYY-MM-DD". */
export function utcDateString(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
```

This file has zero Phaser dependencies. It can be used from both `src/` and `tools/`.

---

## Files touched

| File | Change |
|------|--------|
| `src/utils/rng.ts` | **NEW** — Mulberry32 + date helpers |
| `src/data/daily.ts` | Imports `mulberry32`, `utcDateInt`, `utcDateString` |
| `src/SaveManager.ts` | Imports `utcDateString` for `awardDailyResult()` |

No other files touched for this plan. Simulator seeding is a separate future task.

---

## Checklist

**Design decisions**
- [x] Scope confirmed: only `src/utils/rng.ts` + daily data, no game combat changes

**CI**
- [ ] `typecheck` passes
- [ ] `mulberry32` produces values in [0, 1) — verify by inspection
