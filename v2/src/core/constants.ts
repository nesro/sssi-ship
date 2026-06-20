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
