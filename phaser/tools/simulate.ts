/**
 * Headless balance simulator for Nesro Nova.
 *
 * Usage:
 *   npx tsx tools/simulate.ts [options]
 *
 * Options:
 *   --mission   tutorial|mission_1|mission_2|mission_3  (default: mission_1)
 *   --loadout   none|basic|full                          (default: none)
 *   --strategy  random|greedy|optimal|all                (default: all)
 *   --runs      number                                   (default: 2000)
 *   --json      output raw JSON instead of table
 */

import { computeStats } from '../src/game/computeStats.js';
import type { SaveData } from '../src/SaveManager.js';
import type { ComputedStats } from '../src/game/computeStats.js';
import { MISSION_SPECS, runSimulation, makeInitialRun } from './sim/SimEngine.js';
import type { SimConfig, SimResult } from './sim/SimTypes.js';
import type { CardStrategy } from './sim/strategies/CardStrategy.js';
import { RandomStrategy }  from './sim/strategies/RandomStrategy.js';
import { GreedyStrategy }  from './sim/strategies/GreedyStrategy.js';
import { OptimalStrategy } from './sim/strategies/OptimalStrategy.js';

// ─── loadout definitions ─────────────────────────────────────────────────────

function buildSaveNone(): SaveData {
  return {
    version:         1,
    coins:           0,
    totalStarsEarned: 0,
    spendableStars:  0,
    welcomeSeen:     true,
    debugEnabled:    false,
    ship: {
      frontWeapon: null,
      leftWeapon:  null,
      rightWeapon: null,
      generator:   null,
      shields:     null,
    },
    inventory:  {},
    talents:    {},
    missions:   {},
    daily:      null,
  };
}

function buildSaveBasic(): SaveData {
  return {
    ...buildSaveNone(),
    ship: {
      frontWeapon: 'laser_mk1',
      leftWeapon:  null,
      rightWeapon: null,
      generator:   'generator_mk1',
      shields:     null,
    },
    inventory: {
      laser_mk1:     { level: 1 },
      generator_mk1: { level: 1 },
    },
  };
}

function buildSaveFull(): SaveData {
  return {
    ...buildSaveNone(),
    ship: {
      frontWeapon: 'laser_mk1',
      leftWeapon:  null,
      rightWeapon: null,
      generator:   'generator_mk1',
      shields:     'shield_mk1',
    },
    inventory: {
      laser_mk1:     { level: 3 },
      generator_mk1: { level: 3 },
      shield_mk1:    { level: 3 },
    },
    talents: {
      damage:      3,
      fire_rate:   3,
      weapon_eff:  3,
      battery:     3,
      efficiency:  3,
      shield_cap:  3,
      shield_regen: 3,
      dodge_eff:   3,
    },
  };
}

// ─── stats builders ───────────────────────────────────────────────────────────

function buildStats(loadout: 'none' | 'basic' | 'full'): ComputedStats {
  switch (loadout) {
    case 'none':  return computeStats(buildSaveNone());
    case 'basic': return computeStats(buildSaveBasic());
    case 'full':  return computeStats(buildSaveFull());
  }
}

// ─── 3-star criteria ─────────────────────────────────────────────────────────

const THREE_STAR_HP_THRESHOLD_MISSION_1 = 50;
const THREE_STAR_TIME_THRESHOLD_MISSION_1 = 75; // seconds

function isThreeStar(missionId: string, result: SimResult): boolean {
  switch (missionId) {
    case 'tutorial':
      return result.won && result.hullHpLeft >= 90;
    case 'mission_1':
      return result.won
        && result.hullHpLeft >= THREE_STAR_HP_THRESHOLD_MISSION_1
        && result.secondsTaken <= THREE_STAR_TIME_THRESHOLD_MISSION_1;
    case 'mission_2':
      return result.won && !result.shieldBroken;
    case 'mission_3':
      return result.won && result.hullHpLeft >= 10;
    default:
      return result.won;
  }
}

// ─── run batch ───────────────────────────────────────────────────────────────

interface BatchStats {
  strategyName: string;
  clearRate:    number; // 0–1
  avgHp:        number;
  avgTime:      number;
  threeStarRate: number; // 0–1
  avgCards:     number;
  hpPercentiles: { p25: number; p50: number; p75: number };
}

function runBatch(
  missionId: string,
  config: SimConfig,
  strategy: CardStrategy,
  strategyName: string,
  runs: number,
): BatchStats {
  const hpValues: number[] = [];
  let wins = 0;
  let threeStars = 0;
  let totalTime = 0;
  let totalCards = 0;

  for (let i = 0; i < runs; i++) {
    const run    = makeInitialRun();
    const result = runSimulation(config, strategy, run);

    if (result.won) wins++;
    if (isThreeStar(missionId, result)) threeStars++;

    hpValues.push(result.hullHpLeft);
    totalTime  += result.secondsTaken;
    totalCards += result.cardsPickedN;
  }

  hpValues.sort((a, b) => a - b);
  const p25 = hpValues[Math.floor(runs * 0.25)];
  const p50 = hpValues[Math.floor(runs * 0.50)];
  const p75 = hpValues[Math.floor(runs * 0.75)];

  return {
    strategyName,
    clearRate:    wins / runs,
    avgHp:        hpValues.reduce((s, v) => s + v, 0) / runs,
    avgTime:      totalTime / runs,
    threeStarRate: threeStars / runs,
    avgCards:     totalCards / runs,
    hpPercentiles: { p25, p50, p75 },
  };
}

// ─── output formatters ────────────────────────────────────────────────────────

function pct(ratio: number): string {
  return (ratio * 100).toFixed(1) + '%';
}

function printTable(
  missionId: string,
  loadout: string,
  runs: number,
  batches: BatchStats[],
): void {
  const SEP = '─'.repeat(64);
  console.log(SEP);
  console.log(`  ${missionId} | loadout: ${loadout} | runs: ${runs} per strategy`);
  console.log(SEP);
  console.log(
    `  ${'strategy'.padEnd(10)} ${'clear%'.padStart(7)}  ${'avg HP'.padStart(9)}  ${'avg time'.padStart(9)}  ${'3★ rate'.padStart(8)}  ${'avg cards'.padStart(9)}`,
  );

  for (const b of batches) {
    const avgHpStr   = `${b.avgHp.toFixed(0)} / 100`;
    const avgTimeStr = b.avgTime.toFixed(1) + ' s';
    console.log(
      `  ${b.strategyName.padEnd(10)} ${pct(b.clearRate).padStart(7)}  ${avgHpStr.padStart(9)}  ${avgTimeStr.padStart(9)}  ${pct(b.threeStarRate).padStart(8)}  ${b.avgCards.toFixed(1).padStart(9)}`,
    );
  }

  console.log(SEP);

  // Luck spread for the first non-random strategy (greedy if present).
  const spreadBatch = batches.find(b => b.strategyName === 'greedy') ?? batches[0];
  const { p25, p50, p75 } = spreadBatch.hpPercentiles;
  console.log(
    `  luck spread (${spreadBatch.strategyName}): p25 HP ${p25}, p50 HP ${p50}, p75 HP ${p75}`,
  );
}

// ─── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(): {
  missionId:    string;
  loadout:      'none' | 'basic' | 'full';
  strategyKey:  'random' | 'greedy' | 'optimal' | 'all';
  runs:         number;
  jsonOutput:   boolean;
} {
  const args = process.argv.slice(2);
  const get  = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const missionId   = get('--mission')  ?? 'mission_1';
  const loadoutRaw  = get('--loadout')  ?? 'none';
  const strategyRaw = get('--strategy') ?? 'all';
  const runsRaw     = get('--runs')     ?? '2000';
  const jsonOutput  = args.includes('--json');

  if (!['none', 'basic', 'full'].includes(loadoutRaw)) {
    throw new Error(`Unknown loadout: ${loadoutRaw}. Use none|basic|full.`);
  }
  if (!['random', 'greedy', 'optimal', 'all'].includes(strategyRaw)) {
    throw new Error(`Unknown strategy: ${strategyRaw}. Use random|greedy|optimal|all.`);
  }
  if (!MISSION_SPECS[missionId]) {
    throw new Error(`Unknown mission: ${missionId}. Use tutorial|mission_1|mission_2|mission_3.`);
  }

  return {
    missionId,
    loadout:     loadoutRaw  as 'none' | 'basic' | 'full',
    strategyKey: strategyRaw as 'random' | 'greedy' | 'optimal' | 'all',
    runs:        parseInt(runsRaw, 10),
    jsonOutput,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const { missionId, loadout, strategyKey, runs, jsonOutput } = parseArgs();

  const stats      = buildStats(loadout);
  const missionSpec = MISSION_SPECS[missionId];
  const config: SimConfig = { missionSpec, stats };

  const allStrategies: Array<{ name: string; strategy: CardStrategy }> = [
    { name: 'random',  strategy: new RandomStrategy()  },
    { name: 'greedy',  strategy: new GreedyStrategy()  },
    { name: 'optimal', strategy: new OptimalStrategy() },
  ];

  const selected =
    strategyKey === 'all'
      ? allStrategies
      : allStrategies.filter(s => s.name === strategyKey);

  const batches = selected.map(({ name, strategy }) =>
    runBatch(missionId, config, strategy, name, runs),
  );

  if (jsonOutput) {
    console.log(JSON.stringify(batches, null, 2));
  } else {
    printTable(missionId, loadout, runs, batches);
  }
}

main();
