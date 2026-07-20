// Simulator CLI — imports the REAL core (V2_HANDOFF.md §5.1): the balance simulator and
// the live game run the same module, so balance numbers can never lie.
//
// Usage: pnpm sim -- --mission m1 --runs 1000 --strategy greedy --loadout starter
// Usage: pnpm sim -- --mission t1 --runs 500 --strategy greedy --loadout forced
// Usage: pnpm sim -- --mission m1 --runs 2000 --strategy random --loadout starter --percentiles
// Usage: pnpm sim -- --mission t4 --runs 1000 --strategy greedy --loadout forced --use-supplies
// Strategies: random (uniform pick) | greedy (biggest damage boost) | skip (never picks)
// Loadouts: starter | mid | full | intended | forced | t3 | t4
//   intended = the mission's own specific target loadout from GAME_DESIGN.md §13's
//   balance table (a partial upgrade, e.g. m3 = Lv2 weapon + Lv2 generator, not a
//   uniform tier) — use this, not starter/mid/full, when checking against that table.
//   forced uses the mission's own forcedLoadout, required for tutorials.
//   t3/t4 = the fixed, mission-independent reference loadouts for the T3/T4 time-star
//   tiers (F4, docs/known-issues.md — weapon4/shield3/gen5/motor2 and
//   weapon5/shield4/gen5/motor3, verified ≥98%/100% clear across every main mission).
//   T1/T2 stay pinned to `intended` — only T3/T4 need a faster, gear-gated loadout.
// --percentiles: suggests T4-T1 time-star thresholds from successful-run durations only,
// per the 10th/25th/50th/75th percentile method in GAME_DESIGN.md §13. Output is a
// suggestion to review, not an instruction to apply — mission-star values are tuned by
// hand, same as every other number in src/data/missions.ts.
// --use-supplies: models a player who actually uses gifted/purchased supplies rather
// than ignoring them. Off by default (matches every strategy's historical behavior);
// needed for missions whose difficulty assumes supply usage, e.g. tutorial t4 ("Battle
// Supplies") — without this flag, the measured clear-rate is for a player who never
// taps the mechanic the mission is teaching.
// --supplies-policy naive|reactive (default naive, only matters with --use-supplies):
//   naive    — taps the first charged supply every tick, as soon as it's available,
//              even at full health/shield. A lower bound: "uses supplies, no judgment."
//   reactive — shield-restore only when shield is below 40% of capacity (using it at
//              full shield wastes it); damage-boost only when 3+ enemies are on screen
//              (its 5s window is wasted on a lull). Models "uses supplies with
//              reasonable judgment," not perfect optimal play.
// --manage-toggles: models a player who cuts the rear weapon to recover from brownout
// instead of leaving every toggle on for the whole mission (every strategy left energy
// management entirely unmodeled before this flag existed — see tools/policies.ts's
// brownoutAwareToggles). Off by default, matching every prior sim result's behavior.
// --daily-seed <n>: generates and registers the daily mission (src/data/dailyMission.ts)
// for the given seed and runs it in place of --mission (any --mission value is ignored
// once this is set). This is how the daily's escalation/economy constants get tuned —
// same "the simulator is the truth" principle as everything else, not eyeballed. Use
// --loadout starter/mid/full to compare survival time and coin yield across gear tiers
// (the daily always uses "own gear," so simulate.ts's existing tiered loadouts are
// exactly the right proxy — there's no daily-specific loadout concept to add).
// Usage: pnpm sim -- --daily-seed 1 --runs 500 --strategy greedy --loadout full

import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { mulberry32 } from '../src/core/rng';
import type { LoadoutSnapshot } from '../src/core/types';
import { abilityPoolForLoadout } from '../src/data/cards';
import { DAILY_MISSION_ID, generateDailyMission } from '../src/data/dailyMission';
import { ALL_MISSIONS, missionById, setDailyMission } from '../src/data/missions';
import { neutralizeMotorForDaily, resolveForcedLoadout, STARTER_LOADOUT } from '../src/data/loadouts';
import { intendedLoadoutForMission, starterKindLoadoutAtLevel, timeStarT2Loadout, timeStarT3Loadout, timeStarT4Loadout } from './loadoutPresets';
import { alwaysOnToggles, brownoutAwareToggles, greedyPick, prioritizeHighValueTargets, tapFirstChargedSupply, tapSuppliesReactively } from './policies';

interface CliOptions {
  missionId: string;
  runs: number;
  baseSeed: number;
  strategy: 'random' | 'greedy' | 'skip';
  loadout: 'starter' | 'mid' | 'full' | 'intended' | 'forced' | 't2' | 't3' | 't4';
  percentiles: boolean;
  useSupplies: boolean;
  suppliesPolicy: 'naive' | 'reactive';
  manageToggles: boolean;
  dailySeed: number | null;
  maxTicks: number | null;
}

const LOADOUTS: Record<'starter' | 'mid' | 'full', LoadoutSnapshot> = {
  starter: STARTER_LOADOUT,
  mid: starterKindLoadoutAtLevel(2),
  full: starterKindLoadoutAtLevel(3),
};

function parseArgs(rawArgv: string[]): CliOptions {
  // pnpm forwards the "--" script separator literally — it is not a flag.
  const argv = rawArgv.filter((arg) => arg !== '--');
  const options: CliOptions = {
    missionId: 'm1', runs: 1000, baseSeed: 1, strategy: 'random', loadout: 'starter',
    percentiles: false, useSupplies: false, suppliesPolicy: 'naive', manageToggles: false,
    dailySeed: null, maxTicks: null,
  };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    // --percentiles, --use-supplies, and --manage-toggles are boolean switches (no
    // value) — every other flag takes one.
    if (flag === '--percentiles') {
      options.percentiles = true;
      i += 1;
      continue;
    }
    if (flag === '--use-supplies') {
      options.useSupplies = true;
      i += 1;
      continue;
    }
    if (flag === '--manage-toggles') {
      options.manageToggles = true;
      i += 1;
      continue;
    }
    const value = argv[i + 1];
    if (flag === undefined || value === undefined) break;
    if (flag === '--mission') options.missionId = value;
    else if (flag === '--runs') options.runs = parsePositiveInt(value, flag);
    else if (flag === '--seed') options.baseSeed = parsePositiveInt(value, flag);
    else if (flag === '--strategy') options.strategy = parseChoice(value, ['random', 'greedy', 'skip']);
    else if (flag === '--loadout') options.loadout = parseChoice(value, ['starter', 'mid', 'full', 'intended', 'forced', 't2', 't3', 't4']);
    else if (flag === '--supplies-policy') options.suppliesPolicy = parseChoice(value, ['naive', 'reactive']);
    else if (flag === '--daily-seed') options.dailySeed = parsePositiveInt(value, flag);
    else if (flag === '--max-ticks') options.maxTicks = parsePositiveInt(value, flag);
    else {
      throw new Error(
        `Unknown flag "${flag}". Known: --mission --runs --seed --strategy --loadout ` +
          `--percentiles --use-supplies --supplies-policy --manage-toggles --daily-seed --max-ticks`,
      );
    }
    i += 2;
  }
  return options;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} expects a positive integer, got "${value}"`);
  }
  return parsed;
}

function parseChoice<T extends string>(value: string, choices: T[]): T {
  const match = choices.find((choice) => choice === value);
  if (match === undefined) throw new Error(`Expected one of ${choices.join('/')}, got "${value}"`);
  return match;
}

function policiesFor(options: CliOptions, seed: number, loadout: LoadoutSnapshot): RunPolicies {
  const abilityPool = abilityPoolForLoadout(loadout);
  const boostPolicy = options.suppliesPolicy === 'reactive' ? tapSuppliesReactively : tapFirstChargedSupply;
  const boost = options.useSupplies ? { useBoost: boostPolicy } : {};
  const toggles = { manageToggles: options.manageToggles ? brownoutAwareToggles : alwaysOnToggles };
  // maxTicks default (replay.ts's DEFAULT_MAX_TICKS = 6000, i.e. 600s) is a simulator-
  // only safety cap — the live game has no equivalent, it just keeps ticking. The daily
  // mission's own tuned survival time for a strong loadout can legitimately approach or
  // exceed it, so --max-ticks exists to raise the cap for that specific investigation
  // rather than the tool erroring out on an otherwise-valid long run.
  const maxTicks = options.maxTicks !== null ? { maxTicks: options.maxTicks } : {};
  if (options.strategy === 'skip') return { abilityPool, ...boost, ...toggles, ...maxTicks };
  if (options.strategy === 'random') {
    const rng = mulberry32(seed ^ 0x5f3759df);
    return { abilityPool, pickAbility: () => Math.floor(rng() * 3), ...boost, ...toggles, ...maxTicks };
  }
  // chooseTarget mirrors balance-sweep.ts's greedyPolicies (Item 7 note there) — greedy
  // is this project's realistic-player proxy, and a realistic player acts on the
  // in-game "tap to target it" hint, not just optimizes cards.
  return { abilityPool, pickAbility: greedyPick, chooseTarget: prioritizeHighValueTargets, ...boost, ...toggles, ...maxTicks };
}

function resolveLoadout(options: CliOptions, mission: ReturnType<typeof missionById>): LoadoutSnapshot {
  if (options.loadout === 'forced') {
    if (mission.forcedLoadout === undefined) {
      throw new Error(`Mission "${mission.id}" has no forcedLoadout — use starter/mid/full instead`);
    }
    return resolveForcedLoadout(mission.forcedLoadout);
  }
  if (options.loadout === 'intended') return intendedLoadoutForMission(mission.id);
  if (options.loadout === 't2') return timeStarT2Loadout();
  if (options.loadout === 't3') return timeStarT3Loadout();
  if (options.loadout === 't4') return timeStarT4Loadout();
  return LOADOUTS[options.loadout];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (options.dailySeed !== null) {
    setDailyMission(generateDailyMission(options.dailySeed));
    options.missionId = DAILY_MISSION_ID;
  }
  const mission = missionById(options.missionId);
  let loadout = resolveLoadout(options, mission);
  if (mission.id === DAILY_MISSION_ID) loadout = neutralizeMotorForDaily(loadout);

  let victories = 0;
  let totalTicks = 0;
  const starCounts = new Map<string, number>();
  // Successful-run durations only — the ones already-printed avg-duration mixes in
  // defeat-truncated runs, which skews it toward "died fast" rather than "cleared fast".
  const successfulDurationsTicks: number[] = [];
  // Coins earned — always tracked (cheap), but this is specifically the metric the
  // daily mission is tuned against ("score" = result.coins); every other mission's
  // reward is dominated by the flat completionCoins bonus, so this line matters far
  // less for them, but there's no reason to gate it behind --daily-seed.
  const coinsEarned: number[] = [];
  let totalCollisions = 0;
  let totalWeaponKills = 0;
  for (let i = 0; i < options.runs; i++) {
    const seed = options.baseSeed + i;
    const { state } = runMission(mission, loadout, seed, policiesFor(options, seed, loadout));
    const result = buildMissionResult(state);
    if (result.status === 'victory') {
      victories += 1;
      successfulDurationsTicks.push(result.durationTicks);
    }
    totalTicks += result.durationTicks;
    coinsEarned.push(result.coins);
    totalCollisions += result.collisions;
    totalWeaponKills += result.weaponKills;
    for (const starId of result.earnedStarIds) {
      starCounts.set(starId, (starCounts.get(starId) ?? 0) + 1);
    }
  }

  const clearRate = (victories / options.runs) * 100;
  const avgSeconds = totalTicks / options.runs / TICKS_PER_SECOND;
  const suppliesLabel = options.useSupplies ? options.suppliesPolicy : 'false';
  console.log(
    `mission=${mission.id} runs=${String(options.runs)} strategy=${options.strategy} ` +
      `loadout=${options.loadout} use-supplies=${suppliesLabel} manage-toggles=${String(options.manageToggles)}`,
  );
  console.log(`clear-rate=${clearRate.toFixed(1)}%  avg-duration=${avgSeconds.toFixed(1)}s (all runs, defeats included)`);
  const sortedCoins = [...coinsEarned].sort((a, b) => a - b);
  const avgCoins = coinsEarned.reduce((sum, c) => sum + c, 0) / options.runs;
  const medianCoins = sortedCoins[Math.floor(sortedCoins.length / 2)] ?? 0;
  console.log(`avg-coins=${avgCoins.toFixed(0)}  median-coins=${String(medianCoins)}`);
  console.log(`avg-weapon-kills=${(totalWeaponKills / options.runs).toFixed(1)}  avg-collisions=${(totalCollisions / options.runs).toFixed(1)}`);
  for (const star of mission.stars) {
    const rate = ((starCounts.get(star.id) ?? 0) / options.runs) * 100;
    console.log(`  star ${star.id.padEnd(16)} ${rate.toFixed(1)}%`);
  }
  console.log(`missions available: ${ALL_MISSIONS.map((m) => m.id).join(', ')}${options.dailySeed !== null ? ', daily' : ''}`);

  if (options.percentiles) printTimeStarPercentiles(successfulDurationsTicks);
}

/**
 * Suggests T4-T1 time-star thresholds from successful-run durations only, per the
 * 10th/25th/50th/75th percentile method in GAME_DESIGN.md §13 (10th → T4, tightest;
 * 75th → T1, loosest). A suggestion to review, not a value to apply automatically —
 * mission star thresholds in src/data/missions.ts are tuned by hand.
 */
function printTimeStarPercentiles(successfulDurationsTicks: number[]): void {
  if (successfulDurationsTicks.length === 0) {
    console.log('\nNo successful runs — cannot suggest time-star thresholds.');
    return;
  }
  const sorted = [...successfulDurationsTicks].sort((a, b) => a - b);
  const percentileSeconds = (p: number): number => {
    const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
    return (sorted[index] ?? 0) / TICKS_PER_SECOND;
  };
  console.log(`\nSuggested time-star thresholds from ${String(sorted.length)} successful runs (seconds):`);
  console.log(`  T4 (10th percentile, tightest): ${percentileSeconds(0.10).toFixed(1)}s`);
  console.log(`  T3 (25th percentile):           ${percentileSeconds(0.25).toFixed(1)}s`);
  console.log(`  T2 (50th percentile):           ${percentileSeconds(0.50).toFixed(1)}s`);
  console.log(`  T1 (75th percentile, loosest):  ${percentileSeconds(0.75).toFixed(1)}s`);
}

main();
