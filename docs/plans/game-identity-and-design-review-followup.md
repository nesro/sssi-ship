# Game identity and design-review follow-up

## What this changes and why

Fable's honest design review (2026-07-10, `[[project_design_review_findings]]` memory)
found one clear bug (already fixed: nova-5/warship-5 required 46★ against a real
44★ ceiling — see `src/data/items.ts`'s `WEAPON_STARS`/`SHIPS` comments) and four
genuine design judgment calls that are not bugs and were never touched. Tomáš asked
for all five to be addressed in `GAME_DESIGN.md` and worked on. This plan covers the
remaining four.

They are not independent. The campaign simulator's own numbers expose a real fork in
what this game currently *is* versus what `GAME_DESIGN.md` *says* it is: the doc's
identity line is "complete a ~1-hour campaign… never grinding, always progressing,"
but the shop's price ladder (up to 175,000 coins per system, anchored to a
~1,000,000-coin endgame budget) sits almost entirely above what a full campaign ever
generates — the campaign sim shows players finishing with roughly 1,000-2,000 coins on
hand, having earned maybe 4,000-8,000 total across all six missions combined.

That fork has to be resolved **first**, because it determines the right answer to the
other three:
- If this is a crafted ~1-hour campaign, the difficulty curve should be re-tuned
  against that short arc, the card pool needs to open up fast (there's no time for a
  slow drip), and kind-branching only matters if a first-time player will ever see
  more than 1-2 tiers of it.
- If this is an idle/farming game with the campaign as its onboarding, the price
  ladder and difficulty curve are *already* sized for something much longer — and the
  real gap is that there's no actual endgame content to spend that farmed currency on
  or replay for after m6.

## Design decisions requiring confirmation

### 1. The central fork — what is this game? (resolve first; gates 2-4)

**Confirmed by Tomáš (2026-07-10): (A) crafted ~1-hour campaign.** Compress the
price/star ladder roughly 10-20× so a first playthrough plausibly reaches tier 2-3 of
a couple of systems, and a completionist run can touch the top. `GAME_DESIGN.md`'s
existing identity line stays true as written; the shop data changes to match it.

### 2. Difficulty curve — flat-then-cliff vs. a real declining floor

`GAME_DESIGN.md` §13 specifies clear rates declining 85% → 45% across m1-m6. The
campaign sim shows what a real trajectory produces: both purchase archetypes clear
t1-m5 in essentially one attempt each (mean retries ≈1.00 per mission) with all real
challenge concentrated at m6 (median 2-3 retries, p90 up to 7). The per-mission
isolated clear-rate targets are met, but a real player's *lived experience* is 40+
minutes of no real threat, then a wall.

**Confirmed by Tomáš (2026-07-10): build tension gradually.** Retune m2-m5 so campaign
retry counts climb gradually (e.g. median ~1 at m1 rising to ~2-3 by m5), not flat
until m6. Validated against the campaign sim's retry distribution (`pnpm campaign`),
not just isolated per-mission clear rates — that's exactly what let the current
mismatch go unnoticed this whole session.

### 3. Default early card pool — thin utility vs. a real choice from the start

`sub-basic` Lv1 is 5 generator/motor utility cards; m1's 7 support calls draw from the
same 5 the entire mission. Confirmed elsewhere this session: greedy play has zero
completion-time variance for exactly this reason — the card draft, the game's most
frequent decision, is a non-decision for the whole early campaign.

**Confirmed by Tomáš (2026-07-10): expand `sub-basic` itself, not a new free-pick
mechanic.** Simpler than Fable's suggested choice-mechanic (no new `SaveManager`
mutator, no new UI, no save-migration path needed) — grow `sub-basic` Lv1's own
`cardIds` list substantially so there's real draft variance from m1 without adding a
new system. Source cards either by writing new ones or redistributing some existing
non-`sub-basic` cards that don't clash with the other subscriptions' identities.

Side finding to resolve in the same pass: subscriptions are 100% refundable and their
card pools union additively — Fable flagged that this currently *rewards* owning fewer,
more focused subscriptions rather than more, which likely wasn't the intended
incentive for a system meant to encourage specialization. Confirm whether that's
acceptable or needs its own fix.

### 4. Branching kinds — tiers wearing a sidegrade costume

Every system's kinds (pulse/scatter/ion/nova, wall/reflex/flux/bulwark, etc.) are
priced and star-gated in strictly increasing order — `items.ts`'s own comments say so.
Scatter isn't a sidegrade to pulse; it's the next tier, at ~10× the price and a much
higher star gate. This contradicts `GAME_DESIGN.md` §3's explicit "no single best
build / no module is universally best / ships are situational" language, and nothing
in m1-m6 currently punishes staying on the default kind hard enough to make switching
the obvious move (m5 gestures at this for AoE, but pulse still clears it at 100% in
the sim).

**Confirmed by Tomáš (2026-07-10): kinds are situational.** Reprice same-tier kinds
comparably (within ~30% of each other at a given level, not the current ~10× kind-to-
kind multiplier) and add at least one targeted encounter per system that rewards an
alternative kind over the default. Bounded scope for this pass: targeted additions to
specific missions' events (not a full reshape of all six), designed around each
system's already-existing kind identities (e.g. scatter/nova's multi-target spread vs.
a swarm-heavy segment, ion's burst vs. a high-HP single target) — not a deeper combat-
stat rebalance, which is out of scope here and would need its own plan if repricing +
targeted encounters turn out not to be enough.

## Complexity / blast-radius analysis

Not a notification-style N/L/A/D system — scope is stated per decision instead:

- **Decision 1 (identity)**: `GAME_DESIGN.md` §1/§3/§13 rewrite (prose only, no code)
  plus, if (A) is chosen, a global price/star rescale across all 7 systems in
  `items.ts` and `subscriptions.ts` (~140 catalog entries touched by a multiplier, not
  individually re-authored) — comparable in size to the existing
  `docs/plans/shop-economy-rebalance.md` pass. If (B), no `items.ts` change at all;
  instead a net-new `GAME_DESIGN.md` section (endgame content design) plus,
  eventually, real implementation work out of scope for this plan.
- **Decision 2 (difficulty)**: `missions.ts` event/wave reshaping for however many of
  m1-m5 the chosen curve requires — bounded-iteration tuning identical in shape to
  this session's earlier m1-m6 pass (diagnose via defeat-tick/retry-distribution →
  adjust → re-measure via `pnpm campaign`, not just `pnpm sim`/`pnpm balance` this
  time, since that's what caught the mismatch).
  Repeat that loop until every mission's target retry count is in band.
- **Decision 3 (card pool)**: if the free-pick-after-t3 mechanic is adopted, touches
  `SaveManager.ts` (a new mutator or a one-time flow), `HubScene.ts`/viewmodel (a
  one-time choice UI), and `defaultSave()`'s migration story (existing saves need a
  path to make the same choice retroactively or a sane default). Genuinely new
  feature work, not a data tweak — size it against `docs/plans/side-weapons.md` as a
  reference point for a new-slot-sized feature.
- **Decision 4 (branching kinds)**: if "situational," a full re-price of all 7
  systems' non-default kinds (`items.ts`) plus mission-shape changes to justify at
  least one kind-switch per system — the largest-scope option here, comparable to or
  larger than decision 1's rescale. If "tiers," prose-only in `GAME_DESIGN.md`.

## Test plan

- [ ] `GAME_DESIGN.md`'s identity/§3/§13 language matches whichever decisions 1/2/4
  land on — read back by a fresh pass to confirm no contradictory language remains
  elsewhere in the doc (e.g. §3's "no universally best" if decision 4 picks "tiers").
- [ ] `pnpm balance -- --runs 2000 --json` — 0 flags, after any `missions.ts`/
  `items.ts` change from decisions 2 or 4.
- [ ] `pnpm campaign -- --runs 500` — completion rate and per-mission retry
  distribution reviewed by hand against whatever target decision 2 sets, for both
  archetypes.
- [ ] If decision 3's free-pick mechanic is adopted: a save-migration test (existing
  saves get a sane default, don't crash, don't silently lose the choice) and a
  determinism test (the free pick doesn't introduce non-seeded randomness).
- [ ] `pnpm lint` / `pnpm build:dry` / `pnpm test` clean after every change.
- [ ] `pnpm dlx fallow` clean (no new duplication/dead code) after every change.

## File hygiene

- No hardcoded paths/credentials in any file this plan touches.
- `WEAPON_STARS`/`SHIPS` 46★→44★ fix (already applied) removed the one concrete bug;
  no other TODO/FIXME introduced by this plan.
- `GAME_DESIGN.md` is the source of truth per `v2/CLAUDE.md` — any decision here that
  changes stated design must update the doc in the same pass, not defer it.

## Checklist

**Design decisions**
- [x] Decision 1: **crafted ~1-hour campaign.** Price/star ladder to be compressed
  ~10-20×.
- [x] Decision 2: **build tension gradually.** Retune m2-m5 harder in absolute terms.
- [x] Decision 3: **expand `sub-basic` itself** (not a new free-pick mechanic).
- [x] Decision 4: **kinds are situational.** Reprice same-tier comparably + targeted
  encounters rewarding alternative kinds, not a full combat-stat rebalance.
- [x] Sequencing confirmed by Tomáš: implement all four now, autonomously, checking in
  only on genuine ambiguity.

**Guardrails**
- [ ] No `missions.ts`/`items.ts` edit lands without this plan's decisions being
  confirmed first — same standing rule as every other balance pass this session.
- [ ] `GAME_DESIGN.md` updated in the same pass as any code change it describes, not
  left to drift again.

**Performance**
- [ ] Any new `pnpm campaign`/`pnpm balance` runs used to validate a decision are
  sized appropriately (quick default for iteration, thorough + `run_in_background`
  for the final confirming run) per the conventions already established this session.

**Readability**
- [ ] Any new mission/item data follows the existing file conventions (kind-then-level
  ordering comments, named constants, no magic numbers).

**Testability**
- [ ] Every new mechanic (if decision 3 adds one) has a happy-path test plus the edge
  cases listed in the test plan above.

**File hygiene**
- [ ] No hardcoded personal paths, usernames, or credentials.
- [ ] No TODO/FIXME left untracked.

**CI**
- [ ] `pnpm build:dry` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm test` passes with no new failures.
- [ ] `pnpm dlx fallow` clean.
