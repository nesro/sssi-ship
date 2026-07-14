// Simulator CLI — imports the REAL core (V2_HANDOFF.md §5.1): the balance simulator and
// the live game run the same module, so balance numbers can never lie.
//
// Usage: pnpm sim -- --mission m1 --runs 1000 --strategy greedy --loadout starter
// Usage: pnpm sim -- --mission t1 --runs 500 --strategy greedy --loadout forced
// Usage: pnpm sim -- --mission m1 --runs 2000 --strategy random --loadout starter --percentiles
// Usage: pnpm sim -- --mission t4 --runs 1000 --strategy greedy --loadout forced --use-supplies
// Strategies: random (uniform pick) | greedy (biggest damage boost) | skip (never picks)
// Loadouts: starter | mid | full | intended | forced
//   intended = the mission's own specific target loadout from GAME_DESIGN.md §13's
//   balance table (a partial upgrade, e.g. m3 = Lv2 weapon + Lv2 generator, not a
//   uniform tier) — use this, not starter/mid/full, when checking against that table.
//   forced uses the mission's own forcedLoadout, required for tutorials.
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

import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { mulberry32 } from '../src/core/rng';
import type { LoadoutSnapshot } from '../src/core/types';
import { abilityPoolForLoadout } from '../src/data/cards';
import { ALL_MISSIONS, missionById } from '../src/data/missions';
import { resolveForcedLoadout, STARTER_LOADOUT } from '../src/data/loadouts';
import { intendedLoadoutForMission, starterKindLoadoutAtLevel } from './loadoutPresets';
import { greedyPick, tapFirstChargedSupply, tapSuppliesReactively } from './policies';

interface CliOptions {
  missionId: string;
  runs: number;
  baseSeed: number;
  strategy: 'random' | 'greedy' | 'skip';
  loadout: 'starter' | 'mid' | 'full' | 'intended' | 'forced';
  percentiles: boolean;
  useSupplies: boolean;
  suppliesPolicy: 'naive' | 'reactive';
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
    percentiles: false, useSupplies: false, suppliesPolicy: 'naive',
  };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    // --percentiles and --use-supplies are boolean switches (no value) — every other flag takes one.
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
    const value = argv[i + 1];
    if (flag === undefined || value === undefined) break;
    if (flag === '--mission') options.missionId = value;
    else if (flag === '--runs') options.runs = parsePositiveInt(value, flag);
    else if (flag === '--seed') options.baseSeed = parsePositiveInt(value, flag);
    else if (flag === '--strategy') options.strategy = parseChoice(value, ['random', 'greedy', 'skip']);
    else if (flag === '--loadout') options.loadout = parseChoice(value, ['starter', 'mid', 'full', 'intended', 'forced']);
    else if (flag === '--supplies-policy') options.suppliesPolicy = parseChoice(value, ['naive', 'reactive']);
    else {
      throw new Error(
        `Unknown flag "${flag}". Known: --mission --runs --seed --strategy --loadout ` +
          `--percentiles --use-supplies --supplies-policy`,
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
  if (options.strategy === 'skip') return { abilityPool, ...boost };
  if (options.strategy === 'random') {
    const rng = mulberry32(seed ^ 0x5f3759df);
    return { abilityPool, pickAbility: () => Math.floor(rng() * 3), ...boost };
  }
  return { abilityPool, pickAbility: greedyPick, ...boost };
}

function resolveLoadout(options: CliOptions, mission: ReturnType<typeof missionById>): LoadoutSnapshot {
  if (options.loadout === 'forced') {
    if (mission.forcedLoadout === undefined) {
      throw new Error(`Mission "${mission.id}" has no forcedLoadout — use starter/mid/full instead`);
    }
    return resolveForcedLoadout(mission.forcedLoadout);
  }
  if (options.loadout === 'intended') return intendedLoadoutForMission(mission.id);
  return LOADOUTS[options.loadout];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const mission = missionById(options.missionId);
  const loadout = resolveLoadout(options, mission);

  let victories = 0;
  let totalTicks = 0;
  const starCounts = new Map<string, number>();
  // Successful-run durations only — the ones already-printed avg-duration mixes in
  // defeat-truncated runs, which skews it toward "died fast" rather than "cleared fast".
  const successfulDurationsTicks: number[] = [];
  for (let i = 0; i < options.runs; i++) {
    const seed = options.baseSeed + i;
    const { state } = runMission(mission, loadout, seed, policiesFor(options, seed, loadout));
    const result = buildMissionResult(state);
    if (result.status === 'victory') {
      victories += 1;
      successfulDurationsTicks.push(result.durationTicks);
    }
    totalTicks += result.durationTicks;
    for (const starId of result.earnedStarIds) {
      starCounts.set(starId, (starCounts.get(starId) ?? 0) + 1);
    }
  }

  const clearRate = (victories / options.runs) * 100;
  const avgSeconds = totalTicks / options.runs / TICKS_PER_SECOND;
  const suppliesLabel = options.useSupplies ? options.suppliesPolicy : 'false';
  console.log(
    `mission=${mission.id} runs=${String(options.runs)} strategy=${options.strategy} ` +
      `loadout=${options.loadout} use-supplies=${suppliesLabel}`,
  );
  console.log(`clear-rate=${clearRate.toFixed(1)}%  avg-duration=${avgSeconds.toFixed(1)}s (all runs, defeats included)`);
  for (const star of mission.stars) {
    const rate = ((starCounts.get(star.id) ?? 0) / options.runs) * 100;
    console.log(`  star ${star.id.padEnd(16)} ${rate.toFixed(1)}%`);
  }
  console.log(`missions available: ${ALL_MISSIONS.map((m) => m.id).join(', ')}`);

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
