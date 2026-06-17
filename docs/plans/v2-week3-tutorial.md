# v2 Week 3 — Tutorial missions + Narrator bar

> Standing authorization: all design derives from V2_HANDOFF.md §3.9 (tutorial missions) and
> §3.10 (narrator bar), confirmed 2026-06-06. The "please continue" instruction of 2026-06-12
> grants approval to proceed autonomously within the stated v2 scope.

## What this changes and why

Adds the four scripted tutorial missions (t1–t4) that teach the power-budget mechanic, support
calls, pierce weapons, and brownout through gameplay rather than menus. Adds the narrator bar —
a typewriter text strip at the bottom of CombatScene that shows ~20 pre-scripted lines triggered
by mission events. Two small core extensions are required: enemy HP regeneration (needed for the
"unkillable guardian" in t2) and a scripted first card offer (needed for t2 and t4 to guarantee
the right cards in the tutorial moment). Regular missions m1–m6 are unchanged.

## Design decisions requiring confirmation

All covered by V2_HANDOFF.md or filled in here:

- **Tutorial gate structure**: t1 at starGate: 0; t2 at starGate: 1; t3 at starGate: 2; t4 at
  starGate: 3. Each tutorial has 3–4 stars so the gates are easily cleared sequentially.
  Regular m1–m6 retain their existing star gates unchanged (tutorials add bonus stars on top).
- **Enemy regen**: adds `regenPerTick?: number` to EnemySpec/EnemyState. Regeneration runs at
  the start of each tick before combat, capped at maxHp. Regen enemies heal per tick while
  alive — they do not resurrect from 0 HP.
- **Scripted first offer**: adds `firstOfferIds?: [string, string, string]` to MissionSpec.
  When the first support call fires (supportCallsDone === 0) and this field is set, the offer
  uses exactly those three card IDs. Subsequent offers use normal weighted draw. PRNG is still
  consumed for the reroll if the player rerolls a scripted offer.
- **Narrator bar**: Phaser.GameObjects.Text at bottom of CombatScene with typewriter animation
  (one character per 40 ms). A queued line replaces the current one as soon as it starts.
  Lines are keyed by trigger type: `'mission-start' | 'first-support-call' | 'boss-appear'`.
- **SHOP gate**: handoff §3.9 says SHOP unlocks at tutorial 3. For the demo: the SHOP button is
  always visible (already shipped); narrator text at t3 guides player there. Hard gate deferred.

## Complexity analysis

- Enemy regen: O(E) per tick over live enemies E ≤ ~30 — trivial.
- Scripted offer check: O(1) look-up before the existing O(P) weighted draw.
- Narrator: O(1) per-frame character advance, one active line at a time.

## Test plan

- [x] Enemy regen: guardian heals each tick; clamps at maxHp; a dead enemy does not regen
- [x] Enemy regen: guardian is unkillable at base weapon DPS; killable after +30% damage card
- [x] Scripted first offer: returns exactly the specified card ids on the first call
- [x] Scripted first offer: second offer uses normal weighted draw (not scripted)
- [x] Scripted first offer: reroll of scripted offer still consumes reroll budget and produces new random offer
- [x] Tutorial missions: all four resolve (no crash, correct status after running to completion)

## File hygiene

- No hardcoded paths, credentials, or personal data.
- Narrator lines are a typed data file — no magic strings in scene code.

## Checklist

**Design decisions**
- [x] Design decisions confirmed (V2_HANDOFF.md §3.9/3.10 + gaps above)
- [x] Test plan approved (standing autonomous authorization)

**Guardrails**
- [x] No opt-out guards / blast radius: tutorials add to m1–m6, never replace them
- [x] No swallowed exceptions

**Performance**
- [x] Enemy regen O(E) per tick — negligible
- [x] Narrator update O(1) per frame

**Readability**
- [x] Functions ≤100 lines, ≤5 params (ESLint-enforced)
- [x] Narrator lines in typed data file, not inline strings

**Testability**
- [x] Regen and scripted-offer logic tested in core (no Phaser dependency)
- [x] NarratorBar typewriter is view-only — no core test needed

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures
