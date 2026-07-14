# Overdrive trap fix + Reserve blurb fix (tune-report follow-up)

> Written by Fable 2026-07-11 for hand-off: a Sonnet session should be able to implement
> this cold, without reading the investigation conversation. Every claim below was
> verified against the actual code/data this session; file/line references are current
> as of the uncommitted working tree (branch `nesro/phaser`, HEAD `2bc85d0`).

## What this changes and why

`pnpm tune`'s dominant-kind invariant check (tools/tune-report.md, generated 2026-07-11)
flagged the motor system at 100pp clear-rate spread on m1–m5. Investigation confirmed a
genuine "trap kind" violating GAME_DESIGN.md §3's "no single best build / no kind is
ever a strictly worse purchase": **Overdrive Lv1 is free (price 0, stars 0, shared
ladder since the 2026-07-10 repricing), yet clears 0.0% of every early mission** — its
energy draw (3.5/tick at Lv1) exceeds the game's *maximum* generator output at every
level (surge tops out at 3/5/9/14/20 vs. overdrive's draw of 3.5/7/12/18/26), which
means permanent zero energy → permanent max brownout (2× fire-interval stretch) → and,
because `pulseShield` (src/core/energy.ts) only fires at *full* energy capacity, **the
shield never regenerates at all** — while the timeline runs 3× faster. A new player can
tap the Overdrive shop row on day one, switch for free, and go from ~90% clear to ~0%.
This plan fixes it with data-only stat changes (no star-gating — see decision 2 for
why), fixes a second, smaller trap where the Reserve generator's blurb ("Charge then
unleash") actively recommends the pairing (reserve + heavy weapon) that the
trough-sampled brownout punishes hardest (reserve+nova measured 0.0% this session), and
optionally improves the tune tool's reporting so the next investigation is a table
lookup instead of a reconstruction.

## Design decisions requiring confirmation

### 1. Overdrive's fix is stat parity at Lv1 + survivable scaling above — NOT removal, NOT star-gating

**Proposed `MOTOR_BASE.overdrive` change** (src/data/items.ts, currently line ~450):

```
current:  mults: [3.0, 5.0, 7.5, 10.5, 14.0], draws: [3.50, 7.00, 12.0, 18.0, 26.0]
proposed: mults: [1.0, 2.6, 4.0,  5.6,  7.5], draws: [0.30, 2.00, 3.50,  6.0,  9.0]
```

Rationale, point by point:

- **Lv1 identical to rush-1 (mult 1.0, draw 0.30)** — this is the *established pattern*,
  not an invention: sentinel-1 and tactical-1 already have stats identical to rush-1
  (`MOTOR_BASE`, lines ~447-449; all three are mult 1.0 / draw 0.30). Every motor kind's
  free Lv1 tap becomes safe; the kind's identity emerges as you invest. This is what
  makes the m1–m4/m6 motor tournaments (all at intended motorLevel 1) collapse to a
  near-tie and the dominant-kind flag disappear by construction.
- **Draws at every level stay below torrent's output** (the free starter generator:
  outputs 2/4/7/11/16) — check: 0.30<2, 2.0<4, 3.5<7, 6.0<11, 9.0<16. Overdrive becomes
  brutal-but-survivable on any generator, instead of mathematically dead on all of them.
- **Mults stay strictly above rush's at every level ≥2** (rush: 1.0/2.0/3.0/4.2/5.8) —
  check: 2.6>2.0, 4.0>3.0, 5.6>4.2, 7.5>5.8 — and overdrive pays a worse draw-per-mult
  ratio than rush (Lv5: 1.2 vs 1.03 draw per mult). Identity preserved: the fastest,
  thirstiest motor; the "go faster, earn more coins/time-stars per minute, take more
  risk" gamble — just no longer a guaranteed death sentence.
- These exact numbers are a **starting point, not gospel** — the implementing session
  should apply them, re-run the verification loop below, and nudge (same iteration
  protocol as the 2026-07-11 nova rebalance: adjust → re-sim → re-check, one variable
  at a time) if acceptance criteria miss. Do not redesign the shape (Lv1 parity +
  below-generator-output draws) without coming back to Tomáš.

- [ ] Confirmed by Tomáš: fix via stat rebalance with Lv1 parity, starting from the
      values above.

### 2. Explicitly rejected alternative: re-gating Overdrive behind stars

Restoring overdrive's old 27–30★ gate looks smaller but silently breaks three things
that were *deliberately decided two days ago*: (a) hub.test.ts's test asserting "a kind
row can never be locked — every kind's Lv1 needs 0 stars since the 2026-07-10
redesign"; (b) hub.test.ts's invariant test "every kind within a system shares an
identical price/star ladder — no kind is a hidden tier"; (c) GAME_DESIGN.md §5's "Kinds
are situational sidegrades, not tiers" section. Undoing that decision for one kind is a
design reversal, not a bug fix.

- [ ] Confirmed by Tomáš: no star-gating; the shared-ladder invariant stands.

### 3. Reserve generator blurb rewrite (text-only)

Current (src/data/items.ts, `GENERATOR_BASE.reserve`):
`'Vast tank, slow trickle. Charge then unleash.'`

"Charge then unleash" reads as an explicit recommendation to pair Reserve with
expensive-per-shot weapons (ion/nova) — the exact pairing the trough-sampled brownout
(see docs/plans/nova-weapon-and-campaign-tension-review.md, Fable's review §1) punishes
hardest; reserve+nova measured **0.0% clear** this session. The mechanics can't honor
the promise: heavy shots crater the buffer to the trough at the moment brownout is
sampled, and the trickle output can't sustain the fire rate between bursts.

Proposed replacement (pick one; A recommended):

- **A:** `'Vast tank, slow trickle. Feeds efficient weapons.'`
- **B:** `'Huge buffer, thin flow. Starves hungry weapons.'`

Both are honest about the actual niche (low-drain weapons like pulse break roughly even
on reserve's output; energy-refill supplies and burst ability cards get outsized value
from the huge capacity) and stop pointing players at the trap. Same string length
class as the current blurb — no layout risk, but the visual-verification rule still
applies (see test plan).

- [ ] Confirmed by Tomáš: blurb option ☐ A / ☐ B / ☐ other wording: ______

### 4. GAME_DESIGN.md §5 motor table row must stop saying "endgame only"

The doc currently contradicts itself: §5's "Kinds are situational sidegrades" header,
then two subsections later the motor table row reads "Overdrive | Extreme speed and
draw — endgame only." Post-fix, replace with something matching the new identity, e.g.
"Overdrive | Fastest timeline, heaviest draw — maximum coins per minute for players who
can feed it." Also update `MOTOR_BASE.overdrive`'s in-code blurb (`'Extreme speed and
draw. Endgame only.'`) to match. Same-pass rule applies: GAME_DESIGN.md changes land
with the code change, not after.

- [ ] Confirmed by Tomáš: overdrive's documented identity changes from "endgame only"
      to "fastest/thirstiest, economy-focused."

### 5. Optional (cut freely if budget is short): tune-tool reporting improvements

Two small quality fixes to `tools/tune-loadouts.ts`, flagged during the investigation:

- **Store the raw per-candidate grid in tune-report.json**, not just the spread — this
  investigation had to *reconstruct* which cell was 0% from arithmetic; the data
  existed and was thrown away.
- **Add a second, sharper invariant metric for weapon×generator**: spread of each
  weapon *at its own best generator*. The current joint-spread flag fires whenever
  pairings matter (which is §3's "allocate, don't accumulate" working as intended) and
  will therefore cry wolf forever; per-weapon-best spread answers the actual question —
  "is any *weapon* a trap?" — separately from "do pairings matter?". Keep the existing
  flag too; label them distinctly in the report.

- [ ] Confirmed by Tomáš: include ☐ both / ☐ json-grid only / ☐ neither this pass.

## Complexity analysis

No loops over external data; all changes are O(1) constant edits to data tables and
strings. The real cost is verification wall-clock (all local, cheap on tokens):

- `pnpm tune` regenerates `tools/recommendedKinds.generated.ts` — expected diff: motor
  recommendation stays `rush` everywhere (rush still wins on clear-rate; overdrive's
  payoff is economic, which the tournament doesn't score). If the motor recommendation
  *changes* anywhere, stop and report rather than accepting silently.
- `pnpm balance -- --runs 2000 --json` — expected: **byte-identical** intended-loadout
  numbers (m1=89.6 / m2=79.6 / m3=70.2 / m4=83.9 / m5=89.9 / m6=88.4, 0 flags). Every
  intended loadout uses rush (motor index 0), which this plan does not touch. Any drift
  here means the edit leaked outside overdrive's own entries — that's a bug in the
  edit, not an acceptable side effect.
- `pnpm campaign -- --runs 500` — expected: both archetypes still 100% completion;
  `average` (committed to rush) numerically unchanged; `expert` may shift only if the
  regenerated table changed (see above — it shouldn't).

Blast radius if this ships broken: worst case is overdrive becoming *too good* (players
never choosing rush) — caught by the re-run tune report's spread going dominant in the
other direction. No save-data, core-engine, or replay-determinism surface is touched
(`src/core/` untouched; motor specs flow through the existing `motorSpecAtLevel`).

## Test plan

Do not start implementation until the decision checkboxes above are confirmed.

- [ ] **New data-sanity test** (src/data/ or tools/, colocated per convention): every
      motor kind's Lv1 spec has `timelineMultiplier === 1.0` and
      `powerDrawPerTick === 0.30` — locks in the "free Lv1 tap is always safe" pattern
      that sentinel/tactical already follow and overdrive now joins. (Mirrors the
      standing sanity-test pattern from abilities.test.ts's ≤1-multiplier test.)
- [ ] **New data-sanity test**: for every motor kind and level, `powerDrawPerTick` is
      strictly less than torrent's output at the same level (torrent = free starter
      generator, outputs [2, 4, 7, 11, 16]) — encodes "no motor can starve the starter
      generator by itself" so this exact trap can't silently return.
- [ ] Existing hub.test.ts invariant tests still pass unmodified (shared ladder, no
      locked kind rows) — they must NOT need edits; if they do, the implementation
      drifted into decision-2 territory.
- [ ] `pnpm tune` re-run: motor dominant-kind flag (⚠️) gone from m1–m4/m6 in
      tune-report.md; m5 (motorLevel 2) spread reported — if still >50pp there, surface
      the number to Tomáš rather than iterating unprompted.
- [ ] `pnpm balance -- --runs 2000 --json`: 0 flags, intended numbers byte-identical
      (see complexity section for the exact expected values).
- [ ] `pnpm campaign -- --runs 500`: both archetypes 100% completion.
- [ ] Reserve blurb: visual check per v2/CLAUDE.md's mandatory rule — `pnpm dev`,
      `__cheat.navShop('generator')`, select Reserve, `preview_screenshot`, confirm the
      new blurb renders un-clipped in the shop detail panel.
- [ ] GAME_DESIGN.md §5 motor row + items.ts overdrive blurb updated in the same pass
      (decision 4), and §14's findings table gets one row recording this fix.
- [ ] If decision-5 items are included: tune-report.json contains per-candidate
      results; report shows both spread metrics with distinct labels.
- [ ] `pnpm lint` / `pnpm build:dry` / `pnpm test` clean; `pnpm dlx fallow` clean.

## File hygiene

- Files touched: `v2/src/data/items.ts` (MOTOR_BASE.overdrive stats + blurb,
  GENERATOR_BASE.reserve blurb, plus a dated comment on the overdrive line following
  the file's existing "Rebalanced YYYY-MM-DD (plan-doc ref)" convention),
  `GAME_DESIGN.md` (§5 motor table, §14 findings table), one new colocated test file
  (or additions to an existing data test), optionally `v2/tools/tune-loadouts.ts`.
  Regenerated (not hand-edited): `v2/tools/recommendedKinds.generated.ts`,
  `tune-report.md/json`, `balance-report.md/json`.
- No hardcoded paths, credentials, or TODO comments in any of the above today; add
  none.
- `recommendedKinds.generated.ts` must only change via `pnpm tune` — never hand-edit
  it to "make the expected diff appear."

## Checklist

**Design decisions**
- [x] Decision 1 (overdrive stat shape + starting values) confirmed by Tomáš — applied
      exactly as proposed: Lv1 parity with rush, scaling to a real speed/coin premium
      above rush from Lv2, draws kept below torrent's output at every level.
- [x] Decision 2 (no star-gating) confirmed by Tomáš.
- [x] Decision 3 (reserve blurb wording) confirmed: option A, "Feeds efficient weapons."
- [x] Decision 4 (overdrive identity language) confirmed by Tomáš.
- [x] Decision 5 (optional tool improvements) confirmed: skip this pass.
- [x] Test plan approved by Tomáš.

**Guardrails**
- [x] hub.test.ts's shared-ladder and no-locked-row invariant tests pass **unmodified**
      (part of the 507-test full suite run, no edits needed).
- [x] `pnpm balance` intended-loadout numbers byte-identical (89.6/79.6/70.2/83.9/89.9/
      88.4%, 0 flags) — confirmed no leak outside overdrive's own entries.
- [x] Motor recommendation in the regenerated table stayed `rush` everywhere — no
      surprise change.
- [x] Blast radius held: no core/save/replay surface touched; only data + one blurb
      string + two new tests.

**Performance**
- [x] All O(1) data edits; `pnpm tune`/`pnpm balance`/`pnpm campaign` all executed via
      run_in_background.

**Readability**
- [x] Dated rationale comment added on the overdrive line, matching WEAPON_BASE.nova's
      2026-07-11 comment convention.
- [x] No magic numbers beyond the data tables themselves.

**Testability**
- [x] Two new data-sanity tests added to `v2/src/data/items.test.ts` (new file — no
      prior items.ts test existed): Lv1 parity across all 4 motor kinds, and
      draw < torrent-output at every level for every kind. Both pass.

**File hygiene**
- [x] No hardcoded personal paths, usernames, or credentials.
- [x] No TODO/FIXME left without an owner.
- [x] No hand edits to generated files — `recommendedKinds.generated.ts` regenerated
      via a real `pnpm tune` run.

**CI**
- [x] `pnpm build:dry` passes.
- [x] `pnpm lint` passes.
- [x] `pnpm test` passes with no new failures (507/507, +2 new).
- [x] `pnpm dlx fallow` clean (0 above threshold).

## Resolution (2026-07-11)

Implemented exactly as planned, both design decisions taken as recommended (Reserve
blurb option A; optional tune-tool improvements skipped). Verified end to end:

- `pnpm tune` re-run: **motor dominant-kind flag gone from all 6 missions** (was
  flagged on m1-m5 before, 45-100pp spread); only the pre-existing, mostly-expected
  weapon×generator flag remains (Fable's investigation already characterized this as
  ~90% intended counter-matchup/pairing design, one real trap in Reserve's old blurb —
  now fixed).
- `pnpm balance -- --runs 2000 --json`: intended-loadout numbers byte-identical to
  before the fix — confirms the change never leaked outside overdrive's own entries.
- `pnpm campaign -- --runs 500`: both archetypes still 100% completion, m6 numbers
  unchanged (expert 1.89, average 2.87) — expected, since neither archetype's core
  recommendation ever used overdrive.
- Visual verification (mandatory per v2/CLAUDE.md): live-checked both changed blurbs in
  the running shop UI. Overdrive's Lv1 row now shows identical stats to Rush/Sentinel/
  Tactical (SPD 1x, PWR 0.3); its new blurb ("Fastest timeline, heaviest draw. Maximum
  coins/minute for players who can feed it.") renders cleanly on two lines. Reserve's
  new blurb ("Vast tank, slow trickle. Feeds efficient weapons.") renders on one line,
  un-clipped.
- `pnpm lint` / `pnpm build:dry` / `pnpm test` (507 passing, +2 new) / `pnpm dlx fallow`
  (0 above threshold) all clean.

GAME_DESIGN.md §5 (motor + generator tables) and §14 (Fable's findings table) updated
in the same pass.
