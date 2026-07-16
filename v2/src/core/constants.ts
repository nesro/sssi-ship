// Core simulation constants. The view layer may read these; it must never redefine them.

/** Fixed timestep — same cadence v1's simulator validated (V2_HANDOFF.md §2.1). */
export const TICKS_PER_SECOND = 10;
export const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

/** Below this energy fraction the fire interval starts stretching (the brownout slope). */
export const BROWNOUT_THRESHOLD = 0.3;
/** Fire interval multiplier as energy approaches zero. Never infinite — the weapon never stops. */
export const BROWNOUT_MAX_STRETCH = 2;

/** A colliding enemy deals this multiple of its normal shot damage (V2_HANDOFF.md §3.1). */
export const COLLISION_DAMAGE_MULTIPLIER = 3;
/** Fraction of shield-absorbed collision damage that bursts back to all remaining enemies. */
export const SHIELD_BURST_RETURN = 0.6;

/** Conveyor lane length in abstract distance units. Ship sits at 0; enemies spawn at the end. */
export const LANE_LENGTH = 100;

/** Spawn spacing jitter fraction; seeded, so replays still reproduce exactly. */
export const SPAWN_JITTER = 0.1;

/** Rerolls shared across all support calls in one mission (V2_HANDOFF.md §3.6). */
export const REROLLS_PER_MISSION = 2;

/** Payoff cards carry this weight until their chain's enabler is picked (v1 rule, kept). */
export const PAYOFF_SUPPRESSED_WEIGHT = 0.15;

/** Damage multiplier on an overcharged shot (overcharge synergy chain). */
export const OVERCHARGE_DAMAGE_MULT = 3;

/** Card action encoding in replays: reroll / skip; 0..2 are pick indices. */
export const CARD_ACTION_REROLL = -2;
export const CARD_ACTION_SKIP = -1;
export const CARDS_PER_OFFER = 3;

/** Blocker hold-charge → bonus support-call tiers (Item 6). `holdChargeTicks` only
 * accrues while other enemies are also alive (see tick.ts's accrueHoldCharge), so these
 * thresholds gate on sustained *real* pressure, not elapsed time alone. */
export const HOLD_CHARGE_TIER_2_TICKS = 60; // ~6s of sustained pressure → 2 bonus calls
export const HOLD_CHARGE_TIER_3_TICKS = 140; // ~14s of sustained pressure → 3 bonus calls

/** Boss stall-and-bombard cycle (F3, docs/known-issues.md): the boss alternates
 * APPROACH (closes distance at its normal `speed`) and STALL (speed 0 — it stops to
 * bombard instead of closing in) in a repeating cycle, tracked via `EnemyState.aliveTicks`
 * (see conveyor.ts's `bossEffectiveSpeed`). This is what stops the boss from simply
 * walking into the player and winning the mission via collision before weapon DPS ever
 * gets a real shot at it — the data-only fix (raising `shotDamage`) was tried and
 * reverted; it made collision costlier without changing collision vs. weapon-kill odds
 * at all, since that ratio is governed by time-to-collision vs. time-to-kill, which
 * `shotDamage` never touches. Values chosen to roughly stretch time-to-collision at
 * BOSS.speed=0.25 from 40s (constant walk) to ~93s (43% duty cycle) — comfortably past
 * the ~63s a full weapon-kill already takes post-spawn (mission-fun-review.md F3), so
 * DPS wins the race in most runs instead of losing it, while collision still remains
 * a real (if now rarer) fallback for under-geared runs rather than a categorical block. */
export const BOSS_APPROACH_TICKS = 60; // 6s advancing
export const BOSS_STALL_TICKS = 80; // 8s stalled — the "bombard" half of the cycle
