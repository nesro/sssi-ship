// Simulator CLI — imports the REAL core (V2_HANDOFF.md §5.1): the balance simulator and
// the live game run the same module, so balance numbers can never lie.
//
// Usage: pnpm sim -- --mission m1 --runs 1000 --strategy greedy --loadout starter
// Strategies: random (uniform pick) | greedy (biggest damage boost) | skip (never picks)

import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { mulberry32 } from '../src/core/rng';
import type { CardOffer, CoreState, LoadoutSnapshot } from '../src/core/types';
import { ALL_CARDS, cardById } from '../src/data/cards';
import { ALL_MISSIONS, missionById } from '../src/data/missions';
import { STARTER_LOADOUT } from '../src/data/loadouts';
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
  loadout: 'starter' | 'mid' | 'full';
}

const LOADOUTS: Record<CliOptions['loadout'], LoadoutSnapshot> = {
  starter: STARTER_LOADOUT,
  mid: {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecById('pulse-laser-2'),
    shield: shieldSpecById('shield-2'),
    generator: generatorSpecById('generator-2'),
    motor: motorSpecById('motor-1'),
    supplies: [],
  },
  full: {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecById('lance-1'),
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
    else if (flag === '--loadout') options.loadout = parseChoice(value, ['starter', 'mid', 'full']);
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

function policiesFor(strategy: CliOptions['strategy'], seed: number): RunPolicies {
  if (strategy === 'skip') return { cardPool: ALL_CARDS };
  if (strategy === 'random') {
    const rng = mulberry32(seed ^ 0x5f3759df);
    return { cardPool: ALL_CARDS, pickCard: () => Math.floor(rng() * 3) };
  }
  return { cardPool: ALL_CARDS, pickCard: greedyPick };
}

/** Casual-player model: prefer weapon cards, then generator, never reroll. */
function greedyPick(_state: CoreState, offer: CardOffer): number {
  const priorities: Record<string, number> = { weapon: 0, generator: 1, shield: 2, motor: 3 };
  let best = 0;
  let bestRank = Number.POSITIVE_INFINITY;
  offer.cardIds.forEach((cardId, index) => {
    const rank = priorities[cardById(cardId).system] ?? 9;
    if (rank < bestRank) {
      bestRank = rank;
      best = index;
    }
  });
  return best;
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const mission = missionById(options.missionId);
  const loadout = LOADOUTS[options.loadout];

  let victories = 0;
  let totalTicks = 0;
  const starCounts = new Map<string, number>();
  for (let i = 0; i < options.runs; i++) {
    const seed = options.baseSeed + i;
    const { state } = runMission(mission, loadout, seed, policiesFor(options.strategy, seed));
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
