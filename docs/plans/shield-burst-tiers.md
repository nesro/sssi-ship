# Shield burst tiers — differentiate shield kinds by how far collision backlash reaches

## Context

Tomáš, on the current shield-burst mechanic (collision damage the shield absorbs
splashes onto other enemies): "when the shield of the ships hits an enemy, another
enemy in line gets damaged as well. this is wrong." Clarified on follow-up: not a bug
report — a request to turn this into three distinct shield behaviors instead of one
universal rule, since differentiating it "opens up some more design space":

1. The **basic** shield: burst hits only **one** enemy.
2. **Some other** shields: burst hits **every** on-screen enemy — today's behavior,
   unchanged.
3. **Some** shield, pitched as **much better**: **no burst at all**.

Explicit ask: write this spec, get a Fable-model review, before touching any code.

## Current mechanic (as-is)

`core/conveyor.ts`'s `advanceEnemies`: when an enemy collides (reaches `distance <= 0`),
its collision damage hits the ship shield-first; whatever the shield absorbed is
multiplied by `SHIELD_BURST_RETURN` (`core/constants.ts`, a flat `0.6`) and that amount
is subtracted from **every other surviving enemy currently on screen**
(`distance <= LANE_LENGTH` — restricted to on-screen enemies only as of the
"comes in already damaged" fix earlier this session, `docs/known-issues.md`). This is
uniform across every shield kind and every mission; `ShieldSpec`
(`core/types.ts`) carries no field describing it today.

The mechanic is explicitly taught, not incidental: t1 ("Shield Basics")'s second
narrator beat says outright, "Some of what your shield just absorbed bounces back onto
the **other guardians** — that blue number floating off them is shield backlash, not
weapon fire." (`missions.ts`'s `T1_NARRATOR_EVENTS`.)

## The shop's existing shield kinds

Four kinds, five levels each, today differentiated only by `capacity` and
`pulseShieldFraction` (`data/items.ts`'s `SHIELD_BASE`) — kinds are documented as
"situational sidegrades, not a tier ladder" (existing code comment):

| Kind | Blurb | Capacity range (Lv1→5) | Pulse fraction range |
|---|---|---|---|
| **Wall** | Thick plate — survives hits, slow recharge. **The free starter.** | 30→220 | 0.08→0.14 |
| Reflex | Thin plate, instant snap-back — loves fast pulses | 15→55 | 0.35→0.75 |
| Flux | Balanced capacity and pulse rate — works with anything | 40→210 | 0.18→0.38 |
| Bulwark | Extreme capacity, minimal regen — true tank armour | 60→320 | 0.05→0.10 |

`Wall` is the mandatory default on every fresh save (`SaveManager.ts`'s `defaultSave()`)
and t1 runs on the player's real equipped gear (no `forcedLoadout`) — so **Wall is what
t1's tutorial, and its narrator copy, are both built around today.**

## Proposed design

Add a `burstMode: 'single' | 'all' | 'none'` field to `ShieldSpec`, set per **kind**
(shared by all 5 levels of that kind — kind is already the "situational/flavor" axis;
level is the power axis, and this proposal doesn't change that split):

| Kind | `burstMode` | Reasoning |
|---|---|---|
| **Wall** | `single` | Tomáš's own "basic shield" — the free/default starter is the simplest version of the mechanic. |
| **Reflex** | `all` | Unchanged. "Instant snap-back" reads as the most natural fit for an outward-splashing shockwave. |
| **Flux** | `all` | Unchanged. "Works with anything" — a second, more neutral all-target option, matching Tomáš's plural "some **other shields**." |
| **Bulwark** | `none` | The "much better" pitch: already the highest-capacity, lowest-regen kind (extreme capacity, minimal regen — "true tank armour"); a shield that just *absorbs*, full stop, with no reflected side effect, fits that flavor directly rather than requiring a new 5th kind. |

`single` targets the **nearest surviving on-screen enemy** — a plain min-`distance` scan
over `survivors` (the enemy that just collided is already removed from that list by the
time burst applies). **Not** a reuse of `combat.ts`'s `nearestEnemyAhead`: that function
finds the nearest enemy strictly *ahead of* a given reference enemy (a max under a
ceiling, built for the booster-buff mechanic's different relationship) — since the
collided enemy is already at `distance <= 0`, the lane's minimum, nothing is ever
"ahead of" it under that rule, so calling it here would always return `null` and
`single` would silently behave exactly like `none`. This needs a small, genuinely new
helper (a plain loop, `let nearest = null; for (const e of survivors) if (nearest ===
null || e.distance < nearest.distance) nearest = e;`), living in `conveyor.ts` next to
`advanceEnemies` rather than `combat.ts`, since it isn't shared with anything else.
`SHIELD_BURST_RETURN`'s 60% fraction is unchanged in all three modes — only *how many*
enemies it's spread across changes, not the amount.

## Why this needs a review before coding, not just an implementation

1. **t1's balance is built on Wall's current (all-target) behavior, and is
   already razor-tuned.** This session's own regen.test.ts regression test locks in:
   starter gear (torrent generator) must fail t1, and a free torrent→surge switch must
   then clear it reliably. That balance was tuned (and just re-verified after an
   unrelated spacing fix) assuming burst reaches every on-screen guardian. Restricting
   Wall to single-target removes burst damage from every guardian except the nearest —
   likely a large effective nerf to how fast guardians die from backlash, which very
   plausibly breaks the surge-fix pass rate the same way the spacing regression did
   earlier this session (sim-confirmed cliff behavior there: small-looking changes to
   this exact mechanic swung clear rate from 100/100 to 0/100). **t1 will need
   re-simulation and likely re-tuning (spacing, guardian count, or generator numbers)
   after this lands, not just a copy update.**
2. **t1's narrator copy is now inaccurate.** "Bounces back onto the **other guardians**"
   (plural) describes all-target splash; under `single` it should describe hitting the
   *next* one in line specifically. This is a player-facing teaching moment, not
   incidental prose — the whole mission is about correctly reading what the blue number
   means.
3. **Bulwark's own shop blurb and design doc entries** (`docs/design/05-shop-and-modules.md`)
   need updating to state the burst behavior explicitly, not just capacity/regen — right
   now no shield's blurb mentions burst at all, so this is new information being surfaced
   to players, not just a stat tweak.
4. **Scope check — bigger than "sweep and see"**: `m5`'s own blurb is *"Shields are a
   weapon too"*, and its own comment calls kamikaze "the sharpest enemy in the game
   (highest collision damage)" as the mission's centerpiece — this mission leans on
   collision/shield-burst by design, not incidentally, and runs on real gear like t1
   does. A blanket `pnpm balance`/`pacing`/`campaign` sweep won't actually catch a
   kind-dependent regression there or anywhere else in m1-m6, because
   **`tools/loadoutPresets.ts` hard-codes shield-kind-index-0 (Wall) as the tuning
   baseline for every m1-m6 star threshold**, with its own comment admitting kind
   variation "isn't worth doubling the matrix." That shortcut was harmless while burst
   was uniform across kinds; once it isn't, every star threshold in the main campaign
   was implicitly tuned against whatever Wall's *new* burst behavior turns out to be,
   and no existing tool ever re-checks those thresholds against Reflex/Flux/Bulwark.
   m5 specifically, and whether `loadoutPresets.ts`'s shortcut needs to actually vary
   shield kind now, both need an explicit decision, not an assumption — see the open
   questions below.
5. **t1's own regression test doesn't cover every real path into the mission.** All four
   shield kinds share one price ladder (`SHIELD_BASE`'s `prices` column is identical
   across kinds), and a same-level kind swap costs `newPrice - currentPrice = 0`
   (`SaveManager.ts`'s `switchItem`). Nothing gates the shop before t1, so a player can
   freely swap Wall→Bulwark (or any kind) for 0 coins before ever running it. Today
   that's harmless (burst is uniform); once it isn't, t1's single regression test
   (anchored to `STARTER_LOADOUT`, i.e. Wall) stops representing every real path a
   curious player can take into that tutorial — worth at least one added test case per
   burst mode, not just the existing Wall-only pass/fail pair.

## Decided (Fable, second review round — treated as final)

- **Kind mapping stands as proposed**: wall=`single`, reflex=`all`, flux=`all`,
  bulwark=`none`. Wall→single is Tomáš's own words ("basic" = "free starter" =
  simplest), not to be second-guessed. Reflex's "instant snap-back" reads as an
  energetic outward re-emission, a natural fit for `all`; "recoils inward" has no clear
  link to hitting *other enemies* at all, which is what `burstMode` actually governs.
  Bulwark's blurb ("extreme capacity, minimal regen, true tank armour") is purely
  defensive with no retaliatory flavor anywhere in it — "just absorbs, full stop" fits
  it better than the most aggressive of the three modes. Swapping reflex/bulwark would
  leave the most defense-flavored kind doing the most aggressive thing.
- **m5 (and every other m1-m6 star threshold) gets re-simulated across all four shield
  kinds, not eyeballed and not left as a documented gap.** `loadoutPresets.ts`'s
  `intendedLoadoutForMission(missionId, shieldKindIndex)` already takes the index as a
  parameter — run `pnpm balance`/`pnpm campaign` across all 4 indices for every m1-m6
  threshold and confirm each still clears at its intended star rate. Any threshold that
  doesn't gets re-tuned individually; leave the ones that already pass alone. Justified
  by the same-level-swap-costs-0-coins gap (item 5 above): any player can reach any
  mission on any shield kind for free, so this isn't a hypothetical to wave off.
- **Kind-only, no level variance.** `burstMode` is a categorical identity trait (kind =
  flavor), not a power-scaling trait (level = power, already owned by
  capacity/pulse-fraction). Splitting it mid-kind would break that mental model,
  undermine t1's one-time teaching moment, and multiply the test/rebalance matrix from
  4 kinds to 4×5 for a request that only ever asked for three behaviors.
- **`SHIELD_BURST_RETURN`'s 60% fraction stays fixed across all kinds — target-count is
  the only axis that changes.** Tomáš's complaint was about how many enemies get hit,
  not damage magnitude; varying the fraction too would reopen the whole campaign's
  balance surface for something never asked for, on top of the re-tuning this change
  already requires. A separate spec if wanted later.
- **t1's shop is not gated in this change.** Onboarding/shop-flow gating is orthogonal
  to the burst mechanic and belongs in its own spec. The actual near-term mitigation is
  already in the plan: a t1 regression case per burst mode (below) makes sure t1 stays
  sane under any kind a player can reach it with, rather than preventing them from
  reaching it that way. Logged as a known gap in `docs/known-issues.md` instead.

## Implementation plan (once approved)

1. `core/types.ts`: add `burstMode: 'single' | 'all' | 'none'` to `ShieldSpec`.
2. `data/items.ts`: set `burstMode` per kind in `SHIELD_BASE`/`shieldSpecAtLevel`.
3. **Fixture/test literals that construct a raw `ShieldSpec`-shaped object need
   `burstMode` added or `pnpm build:dry` breaks immediately on step 1** — found by
   grepping for `pulseShieldFraction` literals, not assumed complete:
   - `core/fixtures.ts` (`FIXTURE_LOADOUT.shield`) — set to `'all'`, matching the
     behavior every existing `conveyor.test.ts` case using this fixture already
     assumes.
   - `core/pulse.test.ts`'s `PULSE_SHIELD`
   - `viewmodel/preview.test.ts`'s shield literal (line ~158)
   - `core/damage-variance.test.ts`'s shield literal
4. `core/stats.ts`: thread a `shieldBurstMode` field into `EffectiveStats` (from
   `loadout.shield?.burstMode`, defaulting to `'none'` when no shield is equipped —
   already a no-op today since `shieldCapacity` is 0 with no shield, so `totalBurst`
   can never exceed 0 regardless of mode; this just formalizes existing behavior).
5. `core/conveyor.ts`: add the new min-distance `nearestSurvivor` helper (see "Proposed
   design" above — not a reuse of `combat.ts`'s `nearestEnemyAhead`); `advanceEnemies`
   reads `stats.shieldBurstMode` to decide the burst's target set (nearest-one /
   all-on-screen / skip entirely) instead of always hitting every on-screen survivor.
6. `core/conveyor.test.ts`: the existing `'advanceEnemies: shield-burst kills a
   survivor'` block only exercises today's uniform (`'all'`) behavior — add new cases
   for `'single'` (confirms only the nearest survivor takes damage, others untouched)
   and `'none'` (confirms zero splash) rather than relying on the existing tests to
   catch a regression they were never written to check.
7. `missions.ts`: rewrite t1's second narrator line to describe single-target backlash
   accurately.
8. `docs/design/05-shop-and-modules.md`, `06-combat.md`: document the new per-kind
   split.
9. Re-verify: `pnpm test`/`lint`/`lint:comments`/`build:dry`, then `pnpm balance`/`pnpm
   pacing`/`pnpm campaign` for the whole game, with particular attention to:
   - t1's fail/fix regression test and its own sim clear rates — expect this to need
     actual re-tuning of t1's numbers (spacing/count/generator), not just a green
     checkmark, per the cliff behavior already sim-confirmed earlier this session for
     this exact mechanic.
   - **Every m1-m6 star threshold, re-simulated across all four shield kinds** —
     `loadoutPresets.ts`'s `intendedLoadoutForMission(missionId, shieldKindIndex)`
     already takes the index; run the balance/star check at all 4 indices (not just the
     default 0/Wall) for every main mission, m5 in particular given its own "shields are
     a weapon too" identity. Re-tune only the thresholds that actually fail; leave
     passing ones alone.
   - At least one added t1 regression case per burst mode (Reflex/Flux and Bulwark),
     not just the existing Wall-anchored pass/fail pair, since the shop lets a player
     reach t1 on any kind for free.
10. `docs/known-issues.md`: log "t1's shop isn't gated before a fresh player's first
    attempt, so any shield/generator kind is reachable for free" as a known, out-of-scope
    gap (Fable's call — onboarding/shop-flow gating is a separate concern from this
    change).
