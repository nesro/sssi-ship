# Game-feel pass — enemy density/size, shop progression, in-mission UI clarity, progress bar

## Context

Tomáš played the current build and came back with five complaints in one sitting,
spanning four separate systems. None of these are bugs — they're "the mechanics work
as designed, but the design doesn't feel right" calls. Captured together here (rather
than as four separate plans) because they're all first-impression/feel issues from the
same playthrough, and some of them interact (item A's density rework will also move
item D's numbers).

## A. Enemy density and size

**His words:** "too many small enemies... I would like less of them and bigger. I hate
that there are periods without enemies at all... the level design should be so that
there is ALWAYS at least one enemy. max gap should be like 1 second max."

**Current state, concretely:**
- The enemy roster (`src/data/missions.ts`) spans hp 8 (swarm) to 1900 (boss), but the
  overwhelmingly common kind across the whole campaign is **fodder** (hp 20, the
  smallest sprite after swarm at 48px vs swarm's 30px — `textures.ts`). Per
  `docs/known-issues.md`'s existing open entry, fodder-based waves at `spacing: 14`
  appear in m1-m6, t2, t4, and w0 — i.e., most of the game's enemy volume is the
  smallest, most disposable kind.
- Gaps between waves are not just tolerated but **designed in**: `pnpm pacing`
  (`tools/pacing-report.ts`) flags a mission only when its average longest gap exceeds
  **17 seconds** (`LONGEST_IDLE_STRETCH_THRESHOLD_SECONDS`). A 1-second ceiling is a
  categorically different pacing philosophy, not a tuning nudge — it means "no dead air,
  ever," where the current design explicitly budgets for breathing room between waves.

**Proposed direction:**
1. Rework the roster's mix, not just individual mission waves: fewer fodder/swarm-heavy
   events, more tank/striker/guardian-weight events, mission by mission. This likely
   means new or reweighted `EnemySpec` stat curves (bigger hp bracket floor) so "fewer,
   bigger" doesn't just mean the same total DPS/HP arrives slower — clear-rate tuning
   for every main mission (m1-m6) would need re-verification via `pnpm balance`/`pnpm sim`
   after any roster reweight, since `docs/plans/mission-fun-review.md`'s whole roster
   distribution (turret→m4, kamikaze→m5, etc.) was itself a tuned, sim-verified pass.
2. Rewrite `pnpm pacing`'s idle-stretch model from "average longest gap per mission"
   (a summary stat) to a **hard per-tick invariant**: no tick where `state.enemies.length
   === 0` for longer than ~10 ticks (1s), checked continuously, not just measured as an
   average. This is a new metric, not a threshold tweak to the existing one — the
   current metric can't even express "never," only "usually short."
3. Every mission's `events` array (m1-m6, t1-t4, w0, the daily generator) needs
   re-spacing against whatever the new floor becomes. This touches the same wave data
   `docs/known-issues.md`'s open jitter-overlap entry already flags as needing a
   game-wide pass — worth doing both in the same sweep rather than twice.

**Open questions:**
- Is "at least one enemy on screen, always" meant literally per-tick, or "no gap a
  player would perceive as empty" (which a shorter but real gap might still satisfy,
  and is much cheaper to hit than a hard zero-gap invariant across every mission)?
- Does the boss-mission "STALL" mechanic (m6's stall-and-bombard, `mission-fun-review.md`
  F3) count as an intentional exception, since the boss itself is always present during
  its own stall (never a true zero-enemy gap) — or should it be re-examined too?
- Scope: all missions (m1-m6, t1-t4, w0, daily) in one pass, or main missions first with
  tutorials (already heavily tuned this session, see `docs/known-issues.md`) held back
  for a follow-up?

## B. Shop progression — too much available from the start

**His words:** "the shop have all things allowed at first, I want to have some late
game modules be available later."

**Current state, concretely:**
- Kind-level star gates already exist per system (`src/data/items.ts`):
  `WEAPON_KIND_UNLOCK_STARS` (ion:4, nova:8), `REAR_WEAPON_KIND_UNLOCK_STARS`
  (cluster:5, arc:3, plasma:8), `GENERATOR_KIND_UNLOCK_STARS` (reserve:3, steady:5), and
  a similar side-weapon gate. Level-2-through-5 of every kind (including the free
  starter kinds) also costs stars (`WEAPON_STARS_BY_LEVEL` etc.), so it's not literally
  true that everything is purchasable at 0 stars.
- What genuinely is unconditional from mission 1: **all 9 shop tabs** (`SHOP_TABS`,
  `HubScene.ts`) — MY LOADOUT, SHIP, FRONT/REAR/SIDE WEAPON, SHIELD, GENERATOR, MOTOR,
  SUPPLIES — are all visible and navigable on day one, even though most of what's inside
  several of them is locked. The shop's entire *structure* is exposed immediately; only
  its *contents* unlock gradually.

**Open question this plan can't resolve without his input:** which of these is the
actual complaint?
- (a) The full 9-tab structure being visible from day one, even mostly locked, feels
  like "everything is already here" regardless of how gated the contents are — fix
  would be hiding whole tabs (e.g. REAR WEAPON, SIDE WEAPON, maybe SHIP) behind an
  early-campaign milestone, not just gating kinds within an always-visible tab.
- (b) The *rate* individual items/levels become reachable feels too fast relative to
  how much coin/stars a real campaign run generates — fix is retuning the existing
  star-cost ladders upward (`WEAPON_STARS_BY_LEVEL`, `GENERATOR_KIND_UNLOCK_STARS`,
  etc.), not adding new gating.
- (c) Both.

Recommend Fable's review flag which of these it thinks the actual friction is, since it
can react to the concrete gate values above rather than guess blind, but the real answer
is Tomáš's call.

## C. In-mission buttons — unclear and reportedly unresponsive

**His words:** "the buttons are over the place and I don't know what they do/they
don't work."

**Current state:** the combat HUD's action surface (`CombatScene.ts`) is: three toggle
rows (AUTO-FIRE, REAR, AUTO-SHIELD — REAR only when a rear weapon is equipped), an EXIT
button, an ABILITIES panel (fills in mid-run as cards are picked), and a BOOST/supply
row (`SupplyButtons.ts`). Position is **dynamic**, not fixed — the file's own comment
says the vertical cursor moves "top-down... toggles, then ability slots... rear/side
conditional," i.e. which row lands where shifts depending on loadout (whether rear/side
weapon is equipped). A player's button layout is genuinely different mission to mission
depending on what they have equipped.

**Not yet root-caused — needs its own investigation before a fix, not guessed at
here:**
- "Don't know what they do" — no label ambiguity in the code itself (AUTO-FIRE ON/OFF,
  AUTO-SHIELD ON/OFF read plainly) so this likely means *discoverability*, not label
  clarity: nothing explains what a toggle *does* to someone who's never seen this HUD
  before, and there's no tooltip/first-use hint system for in-combat UI (only the hub's
  own coach-mark tours, `HubTour`, exist today — combat has none).
- "They don't work" is the more concerning report and needs a live repro, not
  speculation — candidates: the dynamic-position system landing a toggle in a spot that
  visually overlaps something else (a real regression risk exactly because position
  isn't fixed), a hit-target too small on a specific device/DPR, or a real functional
  bug in one specific toggle. This needs Tomáš to say *which* button, ideally with a
  screenshot, before a fix is attempted — "buttons don't work" covers too wide a range
  of possible causes to fix blind.

**Proposed direction (contingent on the above):** a first-use in-combat coach-mark
(mirroring `HubTour`'s existing pattern, not a new system) pointing at each toggle once,
and auditing whether the dynamic-position system can ever produce an overlapping or
off-screen layout for any real loadout combination (t1's weaponless state, full
rear+side+3-supply state, etc. — `tools/tap-target-audit.ts` already has fixtures for
some of these, worth checking if it covers every real combination before assuming it
does).

## D. Progress bar — should be time-based and smooth, not stepped per enemy

**His words:** "the progress bar feels weird as it ticks per enemy. I would like to
have it more smooth, based on time primarily with stops on enemies that hold place."

**This directly reverses a fix from earlier today.** The bar (`computeProgressFrac`,
`src/viewmodel/combat.ts`) was originally `state.timelineTick / (last event's own tick,
padded 5%)` — broke badly for t1 (whole wave fires at tick 1, bar hit its ceiling in
under a second, then sat there). Fixed by switching to `(kills + collisions) / total
enemy count` — correct in that it can't get stuck, but it's necessarily discrete
(jumps in fixed steps, one per enemy resolved) rather than smooth, which is exactly
what he's now flagging.

**The right fix satisfies both constraints at once, and was actually the first idea
before today's simpler one shipped:** keep `state.timelineTick` as the numerator (it
already *naturally* freezes while a `blocksConveyor` enemy is alive — "stops on
enemies that hold place" is this mechanic's existing behavior, no new code needed for
that part) — but replace the denominator with a real worst-case duration estimate
instead of "the last event's own scheduling tick": for every event, `event.
atTimelineTick + (LANE_LENGTH + (event.count - 1) × event.spacing) / enemySpec.speed`
(the tick at which that event's farthest-spaced enemy would reach the ship if never
killed), then take the max across all events. This is smooth (continuous ticks, not
discrete kills), time-based (as asked), and structurally can't blow past its own
denominator the way the original bug did, since it's derived from the same distance/
speed model that governs real travel time — including t1's now-early single event.

**Trade-off to flag:** this is closer to the codebase's own existing
`TIMELINE_TAIL_FRACTION` padding idea, just computed per-event instead of off the
tail event alone, so it's not a new concept — but it does mean the bar reaches 100%
only in the worst case (every enemy survives to reach the ship), so on a mission
where enemies die well before arrival (the common case), the bar will still read
under 100% at the moment of victory. That undershoot-at-victory is arguably more
honest than a bar that either gets stuck or overshoots, but it's a real, visible
property worth confirming he's fine with before landing it.

## Suggested order

C needs a live repro before any fix (can't be planned blind); B needs Tomáš's own
answer to the (a)/(b)/(c) question above before scoping; A and D are both
well-understood enough to implement directly once reviewed. Recommend Fable weigh in on
all four before any of them land, given how much A and D interact (a roster/wave
reweight changes the very travel-time numbers D's formula depends on) and how large A's
blast radius is (every mission's data, re-verified via sim).
