# v2 Week 2+3 — Playable demo: cards, stars, economy, shop

> Approval note: Tomáš requested this scope directly ("I want the shop, and everything —
> this is very demo", 2026-06-12) with standing authorization to proceed autonomously.
> All design comes from `V2_HANDOFF.md` §3 (combat, cards, supplies, stars, economy, shop).

## What this changes and why

Turns the week-1 skeleton into a full demo loop: mission select → combat with scheduled
support calls (pick-1-of-3 cards, 2 rerolls, synergy chains) and reserve-supply buttons →
result screen with benchmark stars and coins → shop with the load-calculator live preview →
buy/equip better gear → star-gated mission progression. Six missions including a boss.
All new mechanics live in the deterministic core and are exercised by the same simulator.

## Design decisions requiring confirmation

Settled by V2_HANDOFF.md: card pool shape (~14 flat + 2 synergy chains), payoff weight
suppression (15%), scheduled support calls + blocker bonus call, supplies as permanent
auto-refilling charges, star families (boss-time ×3, hull ×2, all-kills, shield-unbroken),
full coins on replay, stars never spent, shop preview = load calculator.

Gaps filled here (flag if wrong):
- **Reroll encoding in replays**: handoff defines `cardPicks: number[]`. Encoded as an
  action stream: `-2` = reroll, `-1` = skip, `0..2` = pick index. Still `number[]`.
- **Support call pauses the sim** (pendingOffer blocks advanceTick); picks are therefore
  not tick-stamped, matching the handoff's `cardPicks: number[]` (per-call, not per-tick).
- **"100% kills" counts weapon kills only** — collisions are not kills (they're the
  endure-build tension the handoff describes).
- **"Shield never broke"** = shield never reached 0 during the run.
- **No selling in the demo** — replays pay full coins, so no dead end; selling is a
  shop-polish item for later.
- **Supplies**: 3 types (shield restore, energy refill, 5 s double damage), instant-or-
  timed effects, charges bought in the shop, auto-refill per mission.

## Complexity analysis

- Card draw: O(P) per offer over pool size P ≈ 20; ≤ 5 offers/mission.
- Star evaluation: O(S) with S ≈ 7 specs, once per run.
- Everything else unchanged: O(E log E) per tick worst case (E = live enemies ≤ ~30).
- Shop preview: O(1) arithmetic per selected item, recomputed on selection only.

## Test plan

- [x] modifiers: effective stats apply damage/interval/energy/pierce/regen/motor deltas
- [x] overcharge chain: every Nth shot ×3; refund payoff restores the energy cost
- [x] pierce chain: extra targets hit; energy-per-hit payoff restores energy
- [x] card offers: 3 distinct cards; payoffs suppressed (weight) until enabler picked;
      enablers/payoffs unique once picked
- [x] reroll consumes PRNG deterministically; -2/-1/pick action stream replays exactly
- [x] support calls fire at timeline points; blocker death grants a bonus call
- [x] pendingOffer blocks advanceTick (sim pauses until resolved)
- [x] supplies: charge consumption, shield restore clamps, energy refill, timed damage
      boost expires; boostTaps replay deterministically
- [x] stars: boss-time tiers, hull-above tiers, all-kills (collision ≠ kill),
      shield-unbroken; defeat earns no stars
- [x] coins: per-kill + completion; identical on replay
- [x] loadout report: net energy sign, brownout-time estimate, DPS single vs 3-queue
- [x] save manager: roundtrip, version field, star-total derivation, unlock gates,
      missing/corrupt save falls back to defaults
- [x] full-mission determinism with cards + boosts: same record → same resultHash

## File hygiene

- Week-1 smoke mission moves to a test fixture; the playable catalog is real missions.
- No hardcoded paths/credentials. No TODOs without owner.

## Checklist

**Design decisions**
- [x] Design decisions confirmed (V2_HANDOFF.md + gaps flagged above)
- [x] Test plan approved (standing autonomous authorization)

**Guardrails**
- [x] No opt-out guards / notification semantics in this code
- [x] Blast radius: v2/ demo only; corrupt saves fall back to defaults rather than crash
- [x] No swallowed exceptions

**Performance**
- [x] Big-O stated for every new loop (above)
- [x] Nothing worse than O(E log E) per tick
- [x] No repeated derived-value computation: effective stats computed once per tick use

**Readability**
- [x] Functions ≤100 lines, ≤5 params (ESLint-enforced)
- [x] Tunables in named constants / typed data files

**Testability**
- [x] All core additions tested (list above)
- [x] No full-service mocks; core tested directly

**File hygiene**
- [x] No personal paths/credentials
- [x] No orphan TODOs / commented-out code

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures (191 tests, 17 files)
