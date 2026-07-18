import { mulberry32 } from '../core/rng';
import { TICKS_PER_SECOND } from '../core/constants';
import type { EnemySpec, MissionSpec, SpawnEvent } from '../core/types';

const seconds = (n: number): number => n * TICKS_PER_SECOND;

/** Mission id the daily always resolves to — shared by SaveManager, HubScene, CombatScene. */
export const DAILY_MISSION_ID = 'daily';

/**
 * A once-per-day, endless, escalating mission: one attempt, own gear, and the goal is
 * to bank as many coins as possible before the ship dies. See
 * `docs/design/09-mission-progression.md`'s Daily Mission section for the player-facing
 * design and `docs/design/13-balance-and-tuning.md` for the tuned constants below.
 *
 * Architecturally this is a completely ordinary, *finite* `MissionSpec` — the same
 * deterministic core that runs every campaign mission runs this unchanged. "Endless"
 * is simulated, not real: `ROUND_COUNT` rounds of exponentially escalating enemy specs
 * are generated up front, tuned so no loadout can plausibly survive to the last one.
 * The run is expected to always end in defeat; if a run somehow *did* clear every
 * round, it pays out as a normal victory — a harmless edge case, not a special case
 * this module needs to handle.
 */

// ---------- Date -> seed ----------

/** Local calendar-date key (`YYYY-MM-DD`), the only unit of "which day" this feature
 * cares about — two `Date` objects on the same local day always produce the same key. */
export function dailyDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${String(y)}-${m}-${d}`;
}

/**
 * Derives a stable per-day seed from a calendar date. `src/core/` bans `Date` by
 * convention (v2/CLAUDE.md constitutional rule 1: pure deterministic TypeScript) — this
 * is the one place in the daily-mission feature that reads a `Date`, and it takes the
 * date as a parameter rather than calling `new Date()` itself, so callers (the view
 * layer) own "what time is it" and this stays a pure, testable function of its input.
 */
export function dailySeedForDate(date: Date): number {
  const key = dailyDateKey(date);
  // djb2 string hash folded into an unsigned 32-bit int — doesn't need to be
  // cryptographic, just deterministic and well-distributed across consecutive dates.
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/** "Hh Mm" (or just "Mm" under an hour) until the next local midnight — the daily
 * detail panel's reset countdown once today's attempt has been played. Pure function of
 * its input, same "caller owns the clock" convention as dailySeedForDate above. */
export function timeUntilNextMidnight(now: Date): string {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const totalMinutes = Math.max(0, Math.ceil((nextMidnight.getTime() - now.getTime()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(minutes)}m`;
}

// ---------- Escalating enemy archetypes ----------
// Independent, daily-mission-only baselines (deliberately not shared with
// missions.ts's campaign archetypes) since this mode's difficulty curve is tuned for
// exponential round-over-round escalation, not a single fixed mission.

interface RoundKindBase extends Omit<EnemySpec, 'hp' | 'shotDamage' | 'coinReward'> {
  hp: number;
  shotDamage: number;
  coinReward: number;
}

// `kind` must be one of the strings `textureForEnemyKind` (src/view/textures.ts)
// recognizes — the mission's `enemyKinds` Record key (built in generateDailyMission,
// below) is a separate per-round lookup id and can be anything; only the EnemySpec's
// own `kind` field drives rendering and the few kind-specific core behaviors
// (booster's regen-to-nearest-ahead, blocker's hold-charge bonus calls).
const BASE_FODDER: RoundKindBase = {
  kind: 'fodder', hp: 18, speed: 1.2, shotDamage: 2,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 4,
  critChance: 0, missChance: 0, critMult: 2.0,
};
const BASE_STRIKER: RoundKindBase = {
  kind: 'striker', hp: 32, speed: 1.6, shotDamage: 3,
  ticksBetweenShots: seconds(1.5), blocksConveyor: false, coinReward: 7,
  critChance: 0.05, missChance: 0, critMult: 2.0,
};
const BASE_SWARM: RoundKindBase = {
  kind: 'swarm', hp: 7, speed: 2.4, shotDamage: 1,
  ticksBetweenShots: seconds(1), blocksConveyor: false, coinReward: 3,
  critChance: 0, missChance: 0.1, critMult: 2.0,
};
const BASE_TANK: RoundKindBase = {
  kind: 'tank', hp: 85, speed: 0.6, shotDamage: 5,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 14,
  critChance: 0, missChance: 0, critMult: 2.0,
};
// Blocker/turret counts are deliberately never scaled up per round (see countForRound)
// — missions.ts's tuning history found stacking blocksConveyor enemies sits on sharp
// difficulty cliffs (2->3 blockers ~95%->42% clear in one measured case). Escalation
// here comes from HP/damage growth only, matching "slopes, not cliffs" (Principles).
const BASE_BLOCKER: RoundKindBase = {
  kind: 'blocker', hp: 130, speed: 0.5, shotDamage: 4,
  ticksBetweenShots: seconds(1.5), blocksConveyor: true, coinReward: 24,
  critChance: 0.08, missChance: 0, critMult: 2.0,
};
const BASE_TURRET: RoundKindBase = {
  kind: 'turret', hp: 75, speed: 0, shotDamage: 6,
  ticksBetweenShots: seconds(0.8), blocksConveyor: true, coinReward: 28,
  critChance: 0.10, missChance: 0.05, critMult: 2.0,
};
const BASE_KAMIKAZE: RoundKindBase = {
  kind: 'kamikaze', hp: 22, speed: 2.8, shotDamage: 12,
  ticksBetweenShots: seconds(2), blocksConveyor: false, coinReward: 11,
  critChance: 0, missChance: 0.15, critMult: 2.0,
};
// Periodic checkpoint enemy — the mode's REAL difficulty wall (see "Gates, not a
// motor-timed clock" below). `isBoss: true` opts it into the campaign boss's existing
// approach/stall cycle (conveyor.ts's `effectiveSpeed`) for free. `kind` doesn't need
// to be 'boss' for texture purposes (`textureForEnemyKind` checks `isBoss` before
// `kind`), kept as 'boss' anyway for consistency with the one other core `isBoss`
// special-case (bossKillTick, unused by the daily since it has no stars, but harmless).
const BASE_GATE: RoundKindBase = {
  kind: 'boss', hp: 150, speed: 0.3, shotDamage: 6,
  ticksBetweenShots: seconds(1), blocksConveyor: true, coinReward: 40, isBoss: true,
  critChance: 0.1, missChance: 0, critMult: 2.2,
};

// ---------- Tunables ----------
// First-cut values — not yet balanced against real sim data. Tune via
// `pnpm sim --daily-seed <n>` per docs/design/13-balance-and-tuning.md before shipping
// (see docs/plans referenced from that section for the tuning pass).

/**
 * Gates, not a motor-timed clock — the actual difficulty/economy driver.
 *
 * `timeline.ts`'s `advanceTimeline()` freezes `state.timelineTick` ENTIRELY while any
 * `blocksConveyor` enemy is alive, regardless of `motorTimelineMultiplier` (a fast
 * motor never speeds up a DPS check, only the gaps between them). First cut of this
 * generator scaled *all* enemies — including the plain flowing waves — by round index,
 * and scheduled everything via `atTimelineTick`. Measured via `pnpm sim --daily-seed`
 * (docs/design/13-balance-and-tuning.md): stronger loadouts (which bundle a faster
 * motor) blew through the motor-scaled wave schedule faster in real time than their
 * extra DPS/durability could compensate for, so survival time and coins earned came
 * out roughly FLAT or even INVERTED across starter/mid/full gear — a direct violation
 * of "a stronger loadout earns a real multiple more" (confirmed design requirement).
 *
 * Fix: put the escalation wall on periodic `BASE_GATE` enemies instead of the flowing
 * waves. A gate's real-time cost is `gateHP / playerDPS` — motor speed literally cannot
 * change that (the timeline can't advance past it either way), so "how many gates you
 * clear" becomes a function of weapon/shield/generator strength, not motor tier. Gate
 * kills also pay the dominant share of the run's coins (steep GATE_COIN_GROWTH), so
 * "reaches further gates" directly buys "earns dramatically more" — motor speed is
 * left to do what it already does for every other mission (pace the flowing waves
 * between gates), no longer the thing that determines how long you survive.
 */
const GATE_EVERY_N_ROUNDS = 4;
const GATE_HP_GROWTH_PER_GATE = 1.22;
const GATE_DAMAGE_GROWTH_PER_GATE = 1.10;
const GATE_COIN_GROWTH_PER_GATE = 1.30;

/** Flowing-wave growth — deliberately gentle now that gates carry the real wall (see
 * above). Still rises so a hypothetical zero-DPS run doesn't survive forever, and still
 * pays a small coin trickle, but should never be the dominant factor in either survival
 * time or coin total — that's what turning the wall over to gates was for. */
const HP_GROWTH_PER_ROUND = 1.035;
const DAMAGE_GROWTH_PER_ROUND = 1.02;
const COIN_GROWTH_PER_ROUND = 1.025;
const MAX_DAMAGE_MULT = 6;

/** Finite safety cap — large enough that no loadout should plausibly survive it. */
export const ROUND_COUNT = 80;

const SUPPORT_CALL_EVERY_N_ROUNDS = 3;

function scaleKind(base: RoundKindBase, round: number): EnemySpec {
  const hpMult = HP_GROWTH_PER_ROUND ** round;
  const dmgMult = Math.min(MAX_DAMAGE_MULT, DAMAGE_GROWTH_PER_ROUND ** round);
  const coinMult = COIN_GROWTH_PER_ROUND ** round;
  return {
    kind: base.kind,
    hp: Math.round(base.hp * hpMult),
    speed: base.speed,
    shotDamage: Math.round(base.shotDamage * dmgMult * 10) / 10,
    ticksBetweenShots: base.ticksBetweenShots,
    blocksConveyor: base.blocksConveyor,
    coinReward: Math.round(base.coinReward * coinMult),
    // exactOptionalPropertyTypes: only set isBoss when the base actually has it —
    // assigning `isBoss: undefined` explicitly is a type error, distinct from omitting it.
    ...(base.isBoss !== undefined ? { isBoss: base.isBoss } : {}),
    critChance: base.critChance,
    missChance: base.missChance,
    critMult: base.critMult,
  };
}

/** Gates scale by GATE INDEX (how many gates deep, round / GATE_EVERY_N_ROUNDS), not
 * raw round number — a separate, steeper axis from the flowing waves' per-round growth,
 * since gates are the mode's real wall (see the doc comment above). */
function scaleGate(gateIndex: number): EnemySpec {
  const hpMult = GATE_HP_GROWTH_PER_GATE ** gateIndex;
  const dmgMult = Math.min(MAX_DAMAGE_MULT, GATE_DAMAGE_GROWTH_PER_GATE ** gateIndex);
  const coinMult = GATE_COIN_GROWTH_PER_GATE ** gateIndex;
  return {
    kind: BASE_GATE.kind,
    hp: Math.round(BASE_GATE.hp * hpMult),
    speed: BASE_GATE.speed,
    shotDamage: Math.round(BASE_GATE.shotDamage * dmgMult * 10) / 10,
    ticksBetweenShots: BASE_GATE.ticksBetweenShots,
    blocksConveyor: BASE_GATE.blocksConveyor,
    coinReward: Math.round(BASE_GATE.coinReward * coinMult),
    ...(BASE_GATE.isBoss !== undefined ? { isBoss: BASE_GATE.isBoss } : {}),
    critChance: BASE_GATE.critChance,
    missChance: BASE_GATE.missChance,
    critMult: BASE_GATE.critMult,
  };
}

/** Which archetypes are in play this round — a slow, gradual unlock so the mission
 * teaches its own escalation the same way the campaign does, compressed into minutes
 * instead of missions. */
function kindPoolForRound(round: number): RoundKindBase[] {
  const pool = [BASE_FODDER];
  if (round >= 5) pool.push(BASE_STRIKER);
  if (round >= 10) pool.push(BASE_SWARM);
  if (round >= 15) pool.push(BASE_TANK);
  if (round >= 20) pool.push(BASE_BLOCKER);
  if (round >= 30) pool.push(BASE_TURRET);
  if (round >= 40) pool.push(BASE_KAMIKAZE);
  return pool;
}

function countForRound(round: number, kind: string, rng: () => number): number {
  // Blocking kinds (blocker/turret) stay at a flat, small count — see BASE_BLOCKER's
  // comment on why count is never this mode's escalation lever for them.
  if (kind === 'blocker' || kind === 'turret') return 1;
  const base = kind === 'swarm' ? 8 : kind === 'tank' ? 2 : kind === 'kamikaze' ? 3 : 4;
  const growth = Math.min(8, Math.floor(round / 6));
  const jitter = Math.floor(rng() * 3) - 1; // -1..+1
  return Math.max(1, base + growth + jitter);
}

function spacingForRound(round: number, kind: string, rng: () => number): number {
  if (kind === 'blocker' || kind === 'turret' || kind === 'boss') return 0;
  const base = kind === 'swarm' ? 6 : kind === 'kamikaze' ? 8 : 11;
  const tighten = Math.min(4, round * 0.05);
  const jitter = rng() * 2 - 1;
  return Math.max(3, base - tighten + jitter);
}

/** Real-time gap until the next round's wave. Note `blocksConveyor` freezes the
 * timeline for the entire lifetime of a blocking enemy (timeline.ts), so a blocker/
 * turret/sentinel round effectively buys its own extra time regardless of this value —
 * matching the fix already applied to m3/m4's finales (docs/known-issues.md). */
function roundPeriodTicks(round: number): number {
  return seconds(Math.max(26, 32 - round * 0.03));
}

/** Pure: same seed always produces the exact same mission (determinism contract,
 * same as every other seeded mission run). */
export function generateDailyMission(seed: number): MissionSpec {
  const rng = mulberry32(seed);
  const enemyKinds: Record<string, EnemySpec> = {};
  const events: SpawnEvent[] = [];
  const supportCallTicks: number[] = [];

  let tick = seconds(3);
  for (let round = 0; round < ROUND_COUNT; round++) {
    const pool = kindPoolForRound(round);
    const chosen = pool[Math.floor(rng() * pool.length)] ?? BASE_FODDER;
    const key = `${chosen.kind}-r${String(round)}`;
    enemyKinds[key] = scaleKind(chosen, round);
    events.push({
      atTimelineTick: tick,
      kind: key,
      count: countForRound(round, chosen.kind, rng),
      spacing: spacingForRound(round, chosen.kind, rng),
    });

    if (round > 0 && round % GATE_EVERY_N_ROUNDS === 0) {
      const gateIndex = round / GATE_EVERY_N_ROUNDS;
      const gateKey = `gate-r${String(round)}`;
      enemyKinds[gateKey] = scaleGate(gateIndex);
      events.push({ atTimelineTick: tick + seconds(2), kind: gateKey, count: 1, spacing: 0 });
    }

    if (round % SUPPORT_CALL_EVERY_N_ROUNDS === 0) {
      supportCallTicks.push(tick + seconds(1));
    }

    tick += roundPeriodTicks(round);
  }

  return {
    id: DAILY_MISSION_ID,
    name: 'Daily Mission',
    blurb: 'Endless waves, no retries. Bank as many coins as you can before you fall.',
    enemyKinds,
    // Empty stars: this mode is scored by coins banked, not campaign-style benchmarks
    // — also keeps it out of totalStarsAvailable()'s denominator (missions.ts).
    stars: [],
    // 0, not a flat bonus: the daily's entire reward is state.stats.coinsEarned
    // (per-kill, already unbounded) times SaveManager's DAILY_COIN_MULT — see
    // applyDailyResult. No forcedLoadout: uses the player's own equipped gear by
    // design (a stronger loadout survives longer and earns more).
    completionCoins: 0,
    events,
    supportCallTicks,
  };
}
