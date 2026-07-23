← [Design docs index](../../GAME_DESIGN.md) · [← Shop & Modules](05-shop-and-modules.md)

# Combat

A mission is a sequence of wave events on a timeline (in ticks). The motor's
`timelineMultiplier` compresses or expands the timeline.

**Tick loop (100 ms / tick, 10 ticks/sec) — corrected 2026-07-18 (Fable full-review
session; the previous 8-step list didn't match `tick.ts`'s actual call order, a
determinism contract per `v2/CLAUDE.md`). Transcribed directly from
`advanceTick`'s body, in order:**
1. Generator produces energy; motor draws its constant cost (energy never goes negative).
2. Each equipped active ability's cooldown ticks down by one, if running.
3. Advance the timeline (frozen entirely while any `blocksConveyor` enemy — blocker,
   turret, boss, booster — is alive, which cascades to freezing both new spawns and
   support-call triggers, not just spawns); spawn new wave events and check support
   calls as they become due.
4. Enemies regenerate HP (a self-healing kind, or a booster feeding its nearest-ahead
   neighbor).
5. Front weapon fires at the front-most (or tap-marked priority) enemy — firing always
   happens once its timer elapses; brownout stretches the *next* interval instead of
   blocking the shot (energy < 30% of capacity).
6. Rear weapon fires sideways at mid-queue depth (if toggled on) — its own interval
   never stretches under brownout (see clarification below).
7. Enemies fire at the ship.
8. Enemies move; any reaching distance 0 collides — dies, deals `shotDamage × 3` to the
   ship (shield-first), and 60% of whatever the shield absorbed bursts back onto other
   enemies already on screen — how many depends on the equipped shield's own kind
   ([Shop & Modules](05-shop-and-modules.md)): the nearest one only, every one of them,
   or none at all. An enemy killed by the burst is removed and fully death-processed
   (kill credit, coins, on-kill chains, blocker bonus calls) in this same step, not left
   to linger until a later weapon shot prunes it.
9. If the generator is at full capacity, it pulses: shield gains
   `shield × pulseShieldFraction`, generator drops by its pulse drain.
10. Expire any timed card/supply effects whose duration has run out.
11. Blocker/turret/boss hold-charge accrues by one tick — only while at least one other
    enemy is also alive on the conveyor.
12. If a blocker death queued a bonus support call and none is currently pending, fire it.
13. Check victory/defeat, star benchmarks, and any scripted narrator event due at this
    timeline tick.

**Boss approach/stall cycle** (not previously documented): a boss alternates moving at
its normal `speed` for `BOSS_APPROACH_TICKS` (6s) and standing still for
`BOSS_STALL_TICKS` (8s), repeating for its whole fight (`conveyor.ts`'s
`effectiveSpeed`, constants in `constants.ts`) — every other enemy kind ignores this and
always moves at its own `speed`. Exists so the boss can't just walk into the player and
win via collision before weapon DPS gets a real shot at it (the F3 anticlimax fix,
[Balance & Tuning](13-balance-and-tuning.md)).

**Victory:** all events complete and the conveyor empties. **Defeat:** hull reaches 0.

**Two clarifications, confirmed 2026-07-15:**
- **Rear weapon energy vs. brownout.** The rear weapon costs energy per shot like the front
  weapon, but its fire interval never stretches under brownout — it fires on a fixed schedule
  regardless of energy level, so the player can rely on it as a predictable AoE tool. Only the
  front weapon's fire rate responds to brownout (step 5 of the tick loop above).
- **Enemies never interact with each other.** The conveyor is a set of independent distance
  values, not a physical queue — enemies never block, collide with, or pass around each other.
  `blocksConveyor` (the blocker/turret/boss/booster flag) has no effect on enemies already
  on the lane, which keep moving at their own speed regardless (the boss is the one
  exception — its own STALL half of the approach/stall cycle above stops its movement too,
  but that's driven by its `aliveTicks` cycle, not by `blocksConveyor`). **Corrected
  2026-07-18:** it freezes `timelineTick` itself, not just "new spawns" as this line
  previously said — which also freezes support-call triggers for as long as the enemy is
  alive (a real mission bug once: t3's own support call was scheduled past its guardian's
  spawn tick and could never fire while the guardian lived, fixed 2026-07-17 by moving the
  call earlier — see [Balance & Tuning](13-balance-and-tuning.md)/`docs/known-issues.md`).

## Manual controls

The ship fires automatically. The player actively manages energy by toggling:

| Toggle | Effect when OFF |
|--------|----------------|
| Front weapon | Stops firing; saves energy-per-shot |
| Rear weapon | Stops firing; saves energy-per-shot |
| Shield recharge | Generator pulses no longer restore shield; saves pulse energy drain |

Turning a system off lets energy accumulate — for a side weapon burst, recovering from
brownout, or saving up before a blocker. This is the core skill loop: read the situation,
deprioritize the right thing, act at the right moment.

**Full player action set:**
- Toggle front weapon / rear weapon / shield recharge on or off.
- Pick a card at a support call.
- Tap a side weapon.
- Tap a reserve supply.
- Tap an enemy to mark it as the front weapon's priority target (added 2026-07-15).

## Tap-to-target (front weapon only)

Tap an enemy in the game field to mark it as the front weapon's priority target. **Soft
priority:** the front weapon fires at the marked enemy whenever it's still alive and
present, falling back to the normal front-most rule otherwise — never wastes a shot on a
target that no longer exists. Free and instant, no cooldown, no limit on re-marking.
Front weapon only; the rear weapon keeps firing its predictable mid-queue AoE regardless,
and side weapons are already player-timed by their own manual-fire button.

This is a real trade-off, not a free upgrade: ignoring the front-most enemies to chase a
priority target elsewhere in the queue measurably increases collision risk (front-most
enemies reach the ship while attention is elsewhere) — confirmed by simulation, not just
asserted. It gives enemies described as "must be prioritized" (turret, booster — see
[Enemies](08-enemies.md)) a real mechanism to act on, where previously none existed.

---

Next: [Support Calls](07-support-calls.md)
