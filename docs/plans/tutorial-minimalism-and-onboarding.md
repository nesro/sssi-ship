# Minimal tutorials + defeat-completes + onboarding skip choice

## What this changes and why

Tomáš played t1 live and found it dragging even after the pacing fix (2026-07-11,
`GUARDIAN_SLOW.speed` 0.15→0.55). His real ask is bigger than pacing: **every tutorial
should be as short as possible and teach exactly one thing**, and a tutorial should be
allowed to end in the player's ship being destroyed — that's a valid, intentional
teaching moment (e.g. t1's whole point is "the shield tanks hits for you, but it isn't
infinite"), not a failure state to avoid. Right now every mission (tutorials included)
only marks itself complete and unlocks the next content on `status === 'victory'`; a
tutorial that ends in defeat currently teaches nothing about progression — the player
would have to replay it to move on, which contradicts "show it once, then move on."

Separately, Tomáš wants a way to skip tutorials entirely for players who don't want
them, and floated two shapes for that: a bare "skip" button during tutorial play, or
folding the choice into the (currently unbuilt) first-launch onboarding flow. Confirmed
direction: a lightweight, standalone "tutorials or skip?" prompt now, decoupled from the
full story-driven `WelcomeScene` (Captain Nesro portrait / narrative content) that
GAME_DESIGN.md §14 already lists as unbuilt and blocked on Tomáš's own writing — this
prompt needs no story content, just two buttons.

## Design decisions requiring confirmation

### 1. Which missions get "defeat still completes"

**Confirmed by Tomáš:** all 4 tutorials (t1-t4), not just t1.

**Explicitly excluded: `w0` ("Calibration Run").** `w0` also carries a `forcedLoadout`
(it currently reuses the same "is this a tutorial" signal other code uses), but it's a
different narrative beat — an instructor-guided calibration run, not one of the four
"learn one mechanic" tutorials — and Tomáš's ask was specifically about "the tutorial
missions." Reusing the existing `forcedLoadout !== undefined` check would silently pull
`w0` in too, which is why this plan adds a new, explicit signal (decision 2) instead of
loosening the existing loose one.

- [ ] Confirmed: `w0` keeps requiring a real victory; only t1-t4 get the new rule.

### 2. How "this mission completes on defeat" is represented in code

**Recommended: a new `completesOnDefeat?: boolean` field on `MissionSpec`** (default
falsy/absent for every mission except t1-t4), rather than reusing `forcedLoadout !==
undefined` (which also matches `w0`) or a fragile `missionId.startsWith('t')` check.
This is a real, new semantic — "this mission's defeat outcome is an acceptable
completion" — and deserves its own explicit, self-documenting flag directly on the
mission data, not an inference from an unrelated field.

Wiring (two call sites, both already have a natural hook):
- `src/core/result.ts`'s `buildMissionResult`: `completionBonus` currently gates on
  `state.status === 'victory'` only. Add `|| (state.status === 'defeat' &&
  state.mission.completesOnDefeat === true)`. Pure, deterministic, no core-purity
  concern — same function, same inputs, same guarantees.
- `src/save/SaveManager.ts`'s `markCompleted` (currently `if (status !== 'victory' ||
  alreadyCompleted) return unchanged`): needs the same relaxation. `applyMissionResult`
  already computes `missionById(result.missionId)` once for the existing `isTutorial`
  check (line ~404) — reorder so that lookup happens first, derive
  `completesOnDefeat` from it, and pass it into `markCompleted` as a parameter instead
  of having `markCompleted` do its own second lookup (avoids computing the same derived
  value twice, per the project's own standing convention).

- [ ] Confirmed: `completesOnDefeat` flag approach (vs. an alternative representation).

### 3. Full reward on tutorial-defeat, confirmed

**Confirmed by Tomáš:** a tutorial ending in defeat pays the exact same
`completionCoins` as a victory would (see decision 2's `result.ts` wiring — the
`completionBonus` calculation already produces this once the gate is relaxed). No
separate "partial reward" tier.

- [ ] Confirmed: identical reward on victory vs. allowed-defeat for t1-t4.

### 4. Tutorial content trims — one redesign per mission, matching its own mechanic

Tomáš's own worked example for t1: **2-3 enemies total**, some destroyed by the shield/
burst mechanic, the last one allowed to finish the ship off. Applying the same
"minimum content to demonstrate the one mechanic" standard to t2-t4 (each already
avoided the sub-30s-vs-121s pacing problem t1 had, per the earlier speed fix's sibling
comparison — t2=31.5s, t3=50.7s, t4=30.8s — but "not egregiously slow" isn't the same
bar as "minimal," which is what's being asked for now):

**t1 "Shield Basics"** (teaches: shield absorbs collisions, bursts back at survivors) —
currently 3 waves / 7 guardians. Proposed: **1 wave, 2-3 guardians**, spacing tuned so
the first collision's burst has a real chance to finish a second guardian while a third
(if included) still reaches the ship — demonstrating both halves of the mechanic
(burst kills, and "letting the last one through" is fine) in one short beat instead of
three repetitions of the same lesson.

**t2 "Weapon Systems"** (teaches: firing drains energy; a dense wall stretches your
fire rate; a card fixes it) — currently 4 waves / 23 fodder, 1 support call at 12s.
Proposed: trim to **2 waves** — a small first wave just to establish "you're firing,
watch the energy bar," then one dense wall sized to visibly trigger brownout stretch,
support call still offering the fire-rate/cost card. Enough to show cause (dense wall →
slow fire) and effect (card → fixed), nothing to demonstrate twice.

**t3 "Support Cards"** (teaches: a regenerating enemy can't be out-DPS'd; the right
card breaks it) — currently 4 waves mixing fodder padding + 2 regen guardians, 2
support calls. Proposed: trim the fodder padding, keep **1 regen guardian first**
(demonstrates "you can't kill this normally"), the support call offering the counter
card, then **1 more regen guardian** to demonstrate the card actually working. Two
guardians is the minimum that shows both "problem" and "solution."

**t4 "Battle Supplies"** (teaches: use your two gifted supplies) — currently 5 waves,
fodder+striker, 2 support calls, gifted shield-restore + damage-boost supplies.
Proposed: trim to **2-3 waves** sized just enough to (a) drop shield low enough that
using the shield-restore supply is clearly worthwhile, and (b) put enough enemies on
screen at once that the damage-boost supply visibly matters — one beat per supply, not
a full escalating mission.

Given decisions 1-3 (defeat is an acceptable ending), these trims can be genuinely
aggressive — there's no failure state left to protect the player from, so "minimal
enough that the player might occasionally lose" is fine, even expected, not a balance
bug to avoid.

- [ ] Confirmed: this scope and shape for all 4 trims (exact wave counts/timings to be
      tuned via `pnpm sim` during implementation, same iterate-and-verify loop as the
      earlier t1 speed fix — these are starting proposals, not final numbers).

### 5. Onboarding: lightweight prompt, no new persisted save field

**Recommended: derive "should we show the prompt" from existing save state, don't add a
new SaveData field.** Show the prompt when the save looks genuinely fresh: no missions
completed, no coins earned, `w0Completed` false (i.e. `defaultSave()`'s exact starting
state). This avoids a `SAVE_VERSION` bump / migration question entirely (in the spirit
of `feedback_no_save_migration`: don't build infrastructure that isn't needed yet) and
composes naturally with the "skip" choice's own effect (see below) — once a choice is
made, the save is no longer in its fresh state, so the prompt naturally never
reappears.

**"Skip" implementation:** a new `SaveManager.ts` mutator, e.g. `skipTutorials(save)`,
that adds `t1`/`t2`/`t3`/`t4` directly to `completedMissionIds` (reusing the existing
completion/unlock mechanism — `MISSION_UNLOCK_EDGES` shows `m1` only actually requires
`t1` to unlock, so marking all 4 keeps the save internally consistent rather than
leaving `t2`-`t4` looking like unclaimed, mysteriously-locked side content) — **without**
granting their coin rewards, since the player chose not to play them. "Start with
tutorials" needs no mutator at all — it's simply "don't skip," normal flow proceeds
from `w0`/`t1` as today.

**Scene wiring:** a new `OnboardingScene.ts`, inserted between `BootScene` and
`HubScene` — `BootScene.create()` checks the fresh-save condition above and routes to
`OnboardingScene` instead of `HubScene` when true; `OnboardingScene` shows the two
choices, applies the skip mutator if chosen, then always continues to `HubScene`
(`BootScene`'s comment already stales-references "MenuScene" — worth fixing to say
`OnboardingScene`/`HubScene` accurately while touching this file, not in scope to fix
beyond that one line).

- [ ] Confirmed: no new SaveData field / no migration; derive from existing "fresh
      save" signals.
- [ ] Confirmed: skip marks t1-t4 completed (unlock only, no coins) rather than some
      other bypass mechanism.

## Complexity / blast-radius analysis

- **`completesOnDefeat` wiring**: two small, targeted edits (`result.ts`'s one-line
  boolean gate, `SaveManager.ts`'s `markCompleted` signature + one call-site reorder).
  No loop over external data; O(1). Determinism: `buildMissionResult` stays a pure
  function of `CoreState` — no new randomness, no new core/replay surface touched.
- **Mission content trims**: pure data edits to `TUTORIAL_MISSIONS` (t1-t4 `events`/
  `supportCallTicks` arrays in `missions.ts`) — no shared constants, no core logic
  changes. Blast radius: these 4 missions only; `pnpm balance`'s m1-m6 numbers are
  provably unaffected (different mission ids entirely).
- **Onboarding scene**: new, additive file (`OnboardingScene.ts`) + a ~3-line change to
  `BootScene.create()`'s routing + a new `skipTutorials` mutator in `SaveManager.ts`.
  No existing scene's behavior changes for a save that isn't fresh (the routing check
  is a no-op for every existing/returning save).
- **Blast radius if something ships wrong**: worst case for the `completesOnDefeat`
  change is a tutorial paying its completion bonus twice if `markCompleted`'s
  idempotency check (`already in completedMissionIds`) has a gap — the existing
  idempotency guard already covers this, verify it still holds with defeat included.
  Worst case for onboarding is a returning player seeing the prompt again if the
  "fresh save" heuristic is too loose — mitigate by checking all three fields
  (`completedMissionIds.length === 0 && coins === 0 && !w0Completed`), not just one.

## Test plan

Do not start implementation until the decision checkboxes above are confirmed.

- [ ] `buildMissionResult`: a tutorial mission (`completesOnDefeat: true`) ending in
      defeat produces `coins` equal to `completionCoins + coinsEarned` (same as a
      victory would) — happy path.
- [ ] `buildMissionResult`: a non-tutorial mission (`completesOnDefeat` absent) ending
      in defeat still produces `coins === coinsEarned` only (no completion bonus) —
      regression guard, must not change today's m1-m6 behavior.
- [ ] `markCompleted`/`applyMissionResult`: a tutorial mission ending in defeat adds its
      id to `completedMissionIds` and unlocks whatever `MISSION_UNLOCK_EDGES` points to.
- [ ] `markCompleted`/`applyMissionResult`: idempotency — replaying an already-completed
      tutorial (whether the replay is victory or defeat) never double-adds the id or
      double-pays the completion bonus.
- [ ] `w0` is unaffected: still requires `status === 'victory'` to set `w0Completed`.
- [ ] Each trimmed tutorial (t1-t4), verified via `pnpm sim --mission tN --runs 500
      --strategy skip --loadout forced`: real duration meaningfully shorter than
      today's (t1 ~51s, t2 ~31s, t3 ~51s, t4 ~31s baselines to beat), and — since defeat
      is now an acceptable outcome — clear-rate is no longer required to be ~100%; a
      moderate defeat rate is fine as long as `pnpm sim`'s own reported duration stays
      short either way (a long *losing* run would be just as bad as a long winning one).
- [ ] `skipTutorials(save)`: adds exactly `t1`-`t4` to `completedMissionIds`, grants zero
      coins, and after calling it `isMissionUnlocked(save, 'm1')` returns true.
- [ ] `skipTutorials(save)` is idempotent / safe to call on a save that already has some
      tutorials completed (shouldn't happen via the UI, but the mutator itself
      shouldn't corrupt state if it ever is).
- [ ] New "fresh save" onboarding-trigger check: true for `defaultSave()`, false after
      any of coins/completedMissionIds/w0Completed changes from their defaults —
      colocated test alongside the check's implementation.
- [ ] Existing `hub.test.ts`/`SaveManager.test.ts` suites pass unmodified (no existing
      invariant should need touching for this change).
- [ ] `pnpm lint` / `pnpm build:dry` / `pnpm test` clean; `pnpm dlx fallow` clean.
- [ ] Mandatory visual verification (v2/CLAUDE.md): `OnboardingScene`'s two buttons
      render and are clickable; each trimmed tutorial visually plays through in the
      live preview at least once (both a win and, deliberately, a loss for t1, to
      confirm the defeat-still-completes flow actually reads correctly to a player —
      e.g. the result screen shouldn't say something contradictory like "Mission
      Failed" while still unlocking the next one).

## File hygiene

- Files touched: `src/core/types.ts` (new `MissionSpec.completesOnDefeat?: boolean`),
  `src/core/result.ts` (completion-bonus gate), `src/save/SaveManager.ts`
  (`markCompleted` signature + new `skipTutorials` mutator + fresh-save check),
  `src/data/missions.ts` (t1-t4 `completesOnDefeat: true` + trimmed `events`/
  `supportCallTicks`), new `src/view/OnboardingScene.ts`, `src/view/main.ts` (register
  the new scene), `src/view/BootScene.ts` (routing check + stale "MenuScene" comment
  fix), GAME_DESIGN.md (§9 unlock model, §13 tutorial targets, §14 built-vs-planned).
- No hardcoded paths/credentials/TODOs in any of the above today; add none.

## Checklist

**Design decisions**
- [ ] Decision 1 (scope: t1-t4 only, not w0) confirmed by Tomáš
- [ ] Decision 2 (`completesOnDefeat` flag representation) confirmed by Tomáš
- [ ] Decision 3 (full reward on allowed-defeat) confirmed by Tomáš
- [ ] Decision 4 (per-mission trim shapes) confirmed by Tomáš
- [ ] Decision 5 (no new save field; skip = mark-completed-no-coins) confirmed by Tomáš
- [ ] Test plan approved by Tomáš

**Guardrails**
- [ ] Non-tutorial missions (m1-m6, w0) provably unaffected — regression tests above
      pass, `pnpm balance` numbers unchanged
- [ ] `completedMissionIds` idempotency holds under the new defeat-completes path
- [ ] Onboarding prompt never reappears for a save that has made any progress at all

**Performance**
- [ ] All O(1) data/logic edits; no loop over external data added
- [ ] Tutorial re-tuning verified via `pnpm sim` at quick precision, not blocking

**Readability**
- [ ] `completesOnDefeat` is a named, documented field — no magic-string mission-id
      checks anywhere in the new logic

**Testability**
- [ ] Every new behavior (completesOnDefeat gate, skipTutorials, fresh-save check) has
      a happy-path test plus the idempotency/regression edge case listed above

**File hygiene**
- [ ] No hardcoded personal paths, usernames, or credentials
- [ ] No TODO/FIXME left without an owner
- [ ] `BootScene`'s stale "MenuScene" comment corrected while the file is touched anyway

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
- [ ] `pnpm dlx fallow` clean
