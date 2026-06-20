# Plan: Star-gated shop progression + time-gate stars

## What this changes and why

Stars are currently cosmetic — the only use is `missionById(...).starGate` gating mission access.
This changes them into the primary **shop progression currency**: items above the starter tier are
locked until the player has enough total stars, forcing engagement with mission replay to unlock
better gear. To give players many chances to earn stars each run, every mission gains multiple
time-gate stars ("finish in ≤Xs") on top of the existing survival/kill stars.

Coins remain the *purchase price* after an item is unlocked. Stars are the *access key*.
The two systems are orthogonal: you need stars to see the item and coins to buy it.

---

## Design decisions requiring confirmation

### 1. Time-gate star family

New `StarSpec.family`: `'finish-time'` — earned when `state.tick <= star.threshold` at victory.

Missions get **4 time-gate thresholds** each, calibrated after the balance sweep but initially
set at round estimates:

| mission | T1 (casual) | T2 (solid) | T3 (good build) | T4 (optimised) |
|---------|------------|-----------|----------------|---------------|
| m1      | 240s       | 210s      | 185s           | 160s          |
| m2      | 320s       | 285s      | 255s           | 225s          |
| m3      | 325s       | 290s      | 260s           | 230s          |
| m4      | 315s       | 280s      | 255s           | 225s          |
| m5      | 325s       | 290s      | 260s           | 230s          |
| m6      | 310s       | 275s      | 250s           | 220s          |

*These are initial guesses — run `pnpm balance -- --runs 2000` and calibrate T1 ≈ p50 clear time,
T2 ≈ p25, T3 ≈ p10, T4 ≈ p5 for the mid/greedy loadout combination.*

### 2. Per-mission star count after change

Each non-tutorial mission goes from 3–4 stars to **8 stars**:

| # | family | when earned |
|---|--------|------------|
| 1 | `finish-time` T1 | finish in ≤T1 |
| 2 | `finish-time` T2 | finish in ≤T2 |
| 3 | `finish-time` T3 | finish in ≤T3 |
| 4 | `finish-time` T4 | finish in ≤T4 |
| 5 | `hull-above 0.5` | end with >50% hull |
| 6 | `hull-above 0.9` | end with >90% hull |
| 7 | `all-kills` | kill every enemy |
| 8 | `shield-unbroken` | shield never broke |

m6 keeps its boss-time stars and drops the generic time-gates (boss kill time is the interesting
variable there). m6 star count stays at 6 (4 boss-time + hull + all-kills).

Total earnable stars across all 6 non-tutorial missions: **46**.
Tutorial missions keep their current small sets (2–4 each, unchanged).

### 3. `starsRequired` on shop items

Add `starsRequired?: number` to `CatalogItem` and `ShipSpec`. Items without the field require 0.
Proposed schedule (confirm before implementation):

| Stars | Items unlocked |
|-------|---------------|
| 0     | All starter items (price = 0), Interceptor, pulse-1 |
| 4     | pulse-2, shield-2 / reflex path tier 2, generator-2 / reserve path tier 2, motor-2 / tactical path tier 2, Salvager |
| 10    | pulse-3, scatter-1, ion-1 |
| 18    | pulse-4, scatter-2, ion-2, nova-1, shield-3 / cloak path tier 3, generator-3 / singularity path tier 3, motor-3 / tactical path tier 3, Tanker, Reactor |
| 28    | pulse-5, scatter-3, ion-3, nova-2 |
| 38    | scatter-4, scatter-5, ion-4, ion-5, nova-3, nova-4, nova-5, Warship |

*Rationale: a player who clears m1–m2 with T1 times and solid survival earns ~16 stars, unlocking
mid-game weapons. Clearing m1–m4 well (≈36 stars) opens everything except the late-game exotic
builds.*

**Decision required**: should the cheapest branch items (Reflex/Reserve/Tactical tier 2, price
~200–350) share the same star gate as their main-line equivalents, or should branch tier 2 items
require fewer stars to be more accessible as "curiosity unlocks"?

**My recommendation**: same gate — the branches are not harder to use, just different.

### 4. Mission `starGate` values

Current gates (total stars to unlock mission): 0/2/5/8/11/14.
With 8 stars per mission, a player earns 8 after m1, 16 after m2, etc. The existing gates are
too low — they'd all unlock after one mission with the new economy.

**Proposed new gates**: 0 / 5 / 12 / 20 / 28 / 36

This means:
- m2 (First Contact → Picket Line): need 5 stars — clear m1 with ≥1 time gate OR 4 survival stars.
- m3 (The Wall): need 12 — solid performance on m1+m2.
- m6 (Leviathan): need 36 — player must have engaged seriously with at least m1–m4.

**Decision required**: do you want this tightening of mission gates, or keep them soft?

### 5. Shop display for locked items

Locked items (stars < starsRequired) are visible but greyed, showing a lock icon and
"★ N to unlock" instead of a price. Same visual treatment as can't-afford items but
the lock is permanent until stars are earned (tapping a locked item shows its blurb but
no buy button — unlike can't-afford which shows "need X more ⬤").

**Decision required**: show locked items at all, or hide them completely?
**My recommendation**: show them greyed — the player can plan their build and knows what
to aim for. Hidden items feel arbitrary.

---

## Complexity analysis

- `evaluateStars`: O(S) per run where S = stars per mission (≤8). Negligible.
- `totalStars(save)`: O(M×S) where M = missions (≤10), S = stars per mission (≤8). Already
  called on every shop render — currently negligible, stays so.
- Shop lock check: O(1) per item — compare `save_total_stars >= item.starsRequired`.
- No loops over enemies, locations, or devices.

---

## Files to change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `'finish-time'` to `StarFamily` union |
| `src/core/stars.ts` | Handle `finish-time` case: `state.tick <= star.threshold` |
| `src/data/missions.ts` | Replace per-mission `stars` arrays with 8-star sets; update `starGate` values |
| `src/data/items.ts` | Add `starsRequired?: number` to `CatalogItem` and `ShipSpec`; populate values |
| `src/view/HubScene.ts` | Grey lock + "★N to unlock" for items where `totalStars(save) < starsRequired` |
| `src/save/SaveManager.ts` | No schema change needed (`totalStars` already exists) |
| `src/core/stats.ts` | No change |

---

## Test plan

- [ ] `finish-time` star earned when `state.tick <= threshold`
- [ ] `finish-time` star NOT earned when `state.tick > threshold`
- [ ] Defeat earns zero stars (existing; confirm still holds)
- [ ] `totalStars` sum matches sum of all missionStars array lengths
- [ ] Item locked when `totalStars < starsRequired` (unit test with mock save)
- [ ] Item accessible when `totalStars >= starsRequired`
- [ ] HubScene shows lock icon for locked items, normal row for accessible (view — no unit test)
- [ ] Earning stars on a replay unlocks an item that was previously locked (view — no unit test)

---

## Checklist

**Design decisions**
- [ ] Time-gate thresholds confirmed (or deferred to post-balance-sweep calibration)
- [ ] `starsRequired` schedule confirmed
- [ ] Mission `starGate` values confirmed (tighten vs keep)
- [ ] Locked item display confirmed (show greyed vs hide completely)
- [ ] Branch item star gate policy confirmed

**Guardrails**
- [ ] `starsRequired` absent = 0 (not undefined = locked — use `?? 0` everywhere)
- [ ] `totalStars` called once per shop render, result passed to row builders (not called per row)
- [ ] No swallowed exceptions in `evaluateStars`

**Performance**
- [ ] `evaluateStars` O(S) per run — confirmed negligible
- [ ] `totalStars` O(M×S) — confirmed negligible, called at most once per shop rebuild

**Testability**
- [ ] `finish-time` tested at threshold (== boundary), below, and above
- [ ] Star lock check tested with save at exactly `starsRequired - 1` and `starsRequired`

**File hygiene**
- [ ] All time-gate thresholds live in `missions.ts`, not hardcoded in `stars.ts`
- [ ] `starsRequired` schedule documented in items.ts with a comment block
