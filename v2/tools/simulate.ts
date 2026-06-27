// Simulator CLI — imports the REAL core (V2_HANDOFF.md §5.1): the balance simulator and
// the live game run the same module, so balance numbers can never lie.
//
// Usage: pnpm sim -- --mission m1 --runs 1000 --strategy greedy --loadout starter
// Usage: pnpm sim -- --mission t1 --runs 500 --strategy greedy --loadout forced
// Strategies: random (uniform pick) | greedy (biggest damage boost) | skip (never picks)
// Loadouts: starter | mid | full | forced (uses the mission's own forcedLoadout — required for tutorials)

import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { mulberry32 } from '../src/core/rng';
import type { AbilityDefinition, AbilityOffer, CoreState, LoadoutSnapshot } from '../src/core/types';
import { ALL_ABILITIES, abilityById } from '../src/data/cards';
import { ALL_NEW_ABILITIES } from '../src/data/abilities';
import { ALL_MISSIONS, missionById } from '../src/data/missions';
import { resolveForcedLoadout, STARTER_LOADOUT } from '../src/data/loadouts';
import {
  DEFAULT_SHIP_ID,
  generatorSpecById,
  motorSpecById,
  shieldSpecById,
  shipById,
  weaponSpecById,
} from '../src/data/items';

interface CliOptions {
  missionId: string;
  runs: number;
  baseSeed: number;
  strategy: 'random' | 'greedy' | 'skip';
  loadout: 'starter' | 'mid' | 'full' | 'forced';
}

const LOADOUTS: Record<'starter' | 'mid' | 'full', LoadoutSnapshot> = {
  starter: STARTER_LOADOUT,
  mid: {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecById('pulse-2'),
    shield: shieldSpecById('shield-2'),
    generator: generatorSpecById('generator-2'),
    motor: motorSpecById('motor-1'),
    supplies: [],
  },
  full: {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecById('ion-1'),
    shield: shieldSpecById('shield-3'),
    generator: generatorSpecById('generator-3'),
    motor: motorSpecById('motor-2'),
    supplies: [],
  },
};

function parseArgs(rawArgv: string[]): CliOptions {
  // pnpm forwards the "--" script separator literally — it is not a flag.
  const argv = rawArgv.filter((arg) => arg !== '--');
  const options: CliOptions = {
    missionId: 'm1', runs: 1000, baseSeed: 1, strategy: 'random', loadout: 'starter',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || value === undefined) break;
    if (flag === '--mission') options.missionId = value;
    else if (flag === '--runs') options.runs = parsePositiveInt(value, flag);
    else if (flag === '--seed') options.baseSeed = parsePositiveInt(value, flag);
    else if (flag === '--strategy') options.strategy = parseChoice(value, ['random', 'greedy', 'skip']);
    else if (flag === '--loadout') options.loadout = parseChoice(value, ['starter', 'mid', 'full', 'forced']);
    else throw new Error(`Unknown flag "${flag}". Known: --mission --runs --seed --strategy --loadout`);
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

function abilityPoolForLoadout(loadout: LoadoutSnapshot): AbilityDefinition[] {
  const all = [...ALL_ABILITIES, ...ALL_NEW_ABILITIES];
  if (loadout.weapon !== null) return all;
  return all.filter((a) => a.company !== 'nexus');
}

function policiesFor(strategy: CliOptions['strategy'], seed: number, loadout: LoadoutSnapshot): RunPolicies {
  const abilityPool = abilityPoolForLoadout(loadout);
  if (strategy === 'skip') return { abilityPool };
  if (strategy === 'random') {
    const rng = mulberry32(seed ^ 0x5f3759df);
    return { abilityPool, pickAbility: () => Math.floor(rng() * 3) };
  }
  return { abilityPool, pickAbility: greedyPick };
}

/** Casual-player model: prefer weapon cards, then generator, never reroll. */
function greedyPick(_state: CoreState, offer: AbilityOffer): number {
  const priorities: Record<string, number> = { nexus: 0, quantum: 1, aegis: 2, comet: 3 };
  let best = 0;
  let bestRank = Number.POSITIVE_INFINITY;
  offer.abilityIds.forEach((cardId, index) => {
    const rank = priorities[abilityById(cardId).company] ?? 9;
    if (rank < bestRank) {
      bestRank = rank;
      best = index;
    }
  });
  return best;
}

function resolveLoadout(options: CliOptions, mission: ReturnType<typeof missionById>): LoadoutSnapshot {
  if (options.loadout === 'forced') {
    if (mission.forcedLoadout === undefined) {
      throw new Error(`Mission "${mission.id}" has no forcedLoadout — use starter/mid/full instead`);
    }
    return resolveForcedLoadout(mission.forcedLoadout);
  }
  return LOADOUTS[options.loadout];
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const mission = missionById(options.missionId);
  const loadout = resolveLoadout(options, mission);

  let victories = 0;
  let totalTicks = 0;
  const starCounts = new Map<string, number>();
  for (let i = 0; i < options.runs; i++) {
    const seed = options.baseSeed + i;
    const { state } = runMission(mission, loadout, seed, policiesFor(options.strategy, seed, loadout));
    const result = buildMissionResult(state);
    if (result.status === 'victory') victories += 1;
    totalTicks += result.durationTicks;
    for (const starId of result.earnedStarIds) {
      starCounts.set(starId, (starCounts.get(starId) ?? 0) + 1);
    }
  }

  const clearRate = (victories / options.runs) * 100;
  const avgSeconds = totalTicks / options.runs / TICKS_PER_SECOND;
  console.log(
    `mission=${mission.id} runs=${String(options.runs)} strategy=${options.strategy} loadout=${options.loadout}`,
  );
  console.log(`clear-rate=${clearRate.toFixed(1)}%  avg-duration=${avgSeconds.toFixed(1)}s`);
  for (const star of mission.stars) {
    const rate = ((starCounts.get(star.id) ?? 0) / options.runs) * 100;
    console.log(`  star ${star.id.padEnd(16)} ${rate.toFixed(1)}%`);
  }
  console.log(`missions available: ${ALL_MISSIONS.map((m) => m.id).join(', ')}`);
}

main();
