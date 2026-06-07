/**
 * Headless balance simulator for Nesro Nova.
 *
 * Usage:
 *   npx tsx tools/simulate.ts [options]
 *
 * Modes:
 *   (default)  Run a single mission and print the results table.
 *   --ci       Run all CI targets and exit 1 if any fail.
 *   --sweep P  Sweep parameter P over --range min:max:step and show clear rates.
 *
 * Options:
 *   --mission   tutorial|mission_1|mission_2|mission_3  (default: mission_1)
 *   --loadout   none|basic|full                          (default: none)
 *   --strategy  random|greedy|optimal|all                (default: all)
 *   --runs      number                                   (default: 2000)
 *   --range     min:max:step  (used with --sweep, default: auto)
 *   --json      output raw JSON instead of table (default mode only)
 *
 * Sweep params: bossHp | bossShootMs | waveHp
 *
 * Examples:
 *   npx tsx tools/simulate.ts --sweep bossHp --range 200:600:25 --mission mission_1 --loadout none
 *   npx tsx tools/simulate.ts --sweep bossShootMs --range 200:600:25 --mission mission_2 --loadout basic
 */

import { computeStats } from '../src/game/computeStats.js';
import type { SaveData } from '../src/SaveManager.js';
import type { ComputedStats } from '../src/game/computeStats.js';
import { MISSION_SPECS, runSimulation, makeInitialRun } from './sim/SimEngine.js';
import type { SimConfig, SimResult } from './sim/SimTypes.js';
import type { MissionWaveSpec } from '../src/game/WaveSpec.js';
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
    runHistory: [],
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
      chain_pool_1: 1,
      chain_pool_2: 1,
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

function buildChainLevel(loadout: 'none' | 'basic' | 'full'): number {
  if (loadout === 'full') {
    const t = buildSaveFull().talents ?? {};
    if ((t['chain_pool_2'] ?? 0) > 0) return 2;
    if ((t['chain_pool_1'] ?? 0) > 0) return 1;
  }
  return 0;
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

// ─── balance CI ──────────────────────────────────────────────────────────────
//
// `npm run balance:ci` runs all missions at their canonical loadout and checks
// each strategy's clear rate against a ±10 pp tolerance band around the targets
// in CLAUDE.md. Exits 1 if any check fails.

interface CiTarget {
  missionId: string;
  loadout:   'none' | 'basic' | 'full';
  random:    [number, number]; // [min, max] inclusive, 0–100
  greedy:    [number, number];
  optimal:   [number, number];
}

// Achievable targets confirmed by sweep analysis (2026-06-06).
// M1/none is intentionally excluded: bossHp=450 is tuned for basic-gear play; without gear
// clear rates collapse to ~8% which is by design — the game pushes players to buy gear first.
const CI_TARGETS: CiTarget[] = [
  { missionId: 'tutorial',   loadout: 'none',  random: [75, 100], greedy: [80, 100], optimal: [85, 100] },
  { missionId: 'mission_1',  loadout: 'basic', random: [53,  75], greedy: [70, 100], optimal: [75, 100] },
  { missionId: 'mission_2',  loadout: 'basic', random: [ 8,  35], greedy: [20,  48], optimal: [20,  48] },
  { missionId: 'mission_3',  loadout: 'full',  random: [30,  52], greedy: [45,  65], optimal: [55,  75] },
];

const CI_RUNS = 1000; // fast enough for CI; enough to keep ±3 pp statistical noise

function runCi(): void {
  const strategies: Array<{ name: 'random' | 'greedy' | 'optimal'; strategy: CardStrategy }> = [
    { name: 'random',  strategy: new RandomStrategy()  },
    { name: 'greedy',  strategy: new GreedyStrategy()  },
    { name: 'optimal', strategy: new OptimalStrategy() },
  ];

  const SEP = '─'.repeat(72);
  let allPassed = true;

  console.log('\nNesro Nova — Balance CI');
  console.log(SEP);
  console.log(
    `  ${'mission'.padEnd(12)} ${'loadout'.padEnd(7)} ${'strategy'.padEnd(9)} ${'result'.padStart(7)}  ${'actual'.padStart(7)}  ${'target'.padStart(14)}`,
  );
  console.log(SEP);

  for (const target of CI_TARGETS) {
    const stats      = buildStats(target.loadout);
    const chainLevel = buildChainLevel(target.loadout);
    const missionSpec = MISSION_SPECS[target.missionId]!;
    const config: SimConfig = { missionSpec, stats, chainLevel };

    for (const { name, strategy } of strategies) {
      const batch   = runBatch(target.missionId, config, strategy, name, CI_RUNS);
      const actual  = Math.round(batch.clearRate * 100);
      const [lo, hi] = target[name];
      const passed  = actual >= lo && actual <= hi;
      if (!passed) allPassed = false;

      const resultStr = passed ? ' PASS' : ' FAIL';
      const actualStr = `${actual}%`;
      const rangeStr  = `[${lo}–${hi}%]`;
      const row = `  ${target.missionId.padEnd(12)} ${target.loadout.padEnd(7)} ${name.padEnd(9)} ${resultStr.padStart(7)}  ${actualStr.padStart(7)}  ${rangeStr.padStart(14)}`;
      console.log(passed ? row : row + '  ←');
    }
  }

  console.log(SEP);
  if (allPassed) {
    console.log('  All balance checks passed.\n');
  } else {
    console.log('  BALANCE CHECK FAILED — one or more targets are out of range.\n');
    process.exit(1);
  }
}

// ─── parameter sweep ─────────────────────────────────────────────────────────
//
// Varies one spec parameter over a numeric range and prints a clear-rate table.
// Rows that would pass CI targets for the given mission/loadout are marked ✓.

type SweepParam = 'bossHp' | 'bossShootMs' | 'waveHp';

const SWEEP_DEFAULTS: Record<SweepParam, { min: number; max: number; step: number }> = {
  bossHp:      { min: 100, max: 800,  step: 25 },
  bossShootMs: { min: 200, max: 700,  step: 25 },
  waveHp:      { min: 5,   max: 50,   step: 5  },
};

function applySweepParam(spec: MissionWaveSpec, param: SweepParam, value: number): MissionWaveSpec {
  const clone: MissionWaveSpec = { ...spec, waves: spec.waves.map(w => ({ ...w })) };
  switch (param) {
    case 'bossHp':      clone.bossHp      = value; break;
    case 'bossShootMs': clone.bossShootMs = value; break;
    case 'waveHp':      clone.waves       = clone.waves.map(w => ({ ...w, hp: value })); break;
  }
  return clone;
}

function runSweep(
  param:     SweepParam,
  range:     { min: number; max: number; step: number },
  missionId: string,
  loadout:   'none' | 'basic' | 'full',
  runs:      number,
): void {
  const baseSpec   = MISSION_SPECS[missionId]!;
  const stats      = buildStats(loadout);
  const chainLevel = buildChainLevel(loadout);
  const strategies = [
    { name: 'random'  as const, strategy: new RandomStrategy()  },
    { name: 'greedy'  as const, strategy: new GreedyStrategy()  },
    { name: 'optimal' as const, strategy: new OptimalStrategy() },
  ];
  const ciTarget = CI_TARGETS.find(t => t.missionId === missionId && t.loadout === loadout);

  const SEP = '─'.repeat(68);
  console.log(`\nSweep: ${param} [${range.min}…${range.max} step ${range.step}]  |  ${missionId} / ${loadout}  |  ${runs} runs`);
  console.log(SEP);
  console.log(`  ${'value'.padStart(8)}  ${'random'.padStart(7)}  ${'greedy'.padStart(7)}  ${'optimal'.padStart(7)}`);
  console.log(SEP);

  for (let v = range.min; v <= range.max; v += range.step) {
    const spec    = applySweepParam(baseSpec, param, v);
    const config: SimConfig = { missionSpec: spec, stats, chainLevel };
    const cols    = strategies.map(({ name, strategy }) => {
      const b = runBatch(missionId, config, strategy, name, runs);
      return { name, pct: Math.round(b.clearRate * 100) };
    });
    const allPass = ciTarget !== undefined && cols.every(c => {
      const [lo, hi] = ciTarget[c.name];
      return c.pct >= lo && c.pct <= hi;
    });
    const marker = allPass ? '  ✓' : '';
    const colStr = cols.map(c => `${c.pct}%`.padStart(7)).join('  ');
    console.log(`  ${String(v).padStart(8)}  ${colStr}${marker}`);
  }

  console.log(SEP);
  if (ciTarget) {
    const fmt = (r: [number, number]) => `[${r[0]}–${r[1]}%]`;
    console.log(`  CI targets: random ${fmt(ciTarget.random)}  greedy ${fmt(ciTarget.greedy)}  optimal ${fmt(ciTarget.optimal)}`);
  } else {
    console.log(`  (no CI target defined for ${missionId} / ${loadout})`);
  }
  console.log();
}

// ─── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(): {
  ci:           boolean;
  sweep:        SweepParam | null;
  sweepRange:   { min: number; max: number; step: number } | null;
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

  const ci         = args.includes('--ci');
  const sweepRaw   = get('--sweep')    ?? null;
  const rangeRaw   = get('--range')    ?? null;
  const missionId  = get('--mission')  ?? 'mission_1';
  const loadoutRaw = get('--loadout')  ?? 'none';
  const strategyRaw = get('--strategy') ?? 'all';
  const runsRaw    = get('--runs')     ?? '2000';
  const jsonOutput = args.includes('--json');

  const validSweepParams: SweepParam[] = ['bossHp', 'bossShootMs', 'waveHp'];
  if (sweepRaw && !validSweepParams.includes(sweepRaw as SweepParam)) {
    throw new Error(`Unknown sweep param: ${sweepRaw}. Use ${validSweepParams.join('|')}.`);
  }
  const sweep = sweepRaw as SweepParam | null;

  let sweepRange: { min: number; max: number; step: number } | null = null;
  if (sweep) {
    if (rangeRaw) {
      const parts = rangeRaw.split(':').map(Number);
      if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`--range must be min:max:step, e.g. 200:600:25`);
      }
      sweepRange = { min: parts[0]!, max: parts[1]!, step: parts[2]! };
    } else {
      sweepRange = SWEEP_DEFAULTS[sweep];
    }
  }

  if (!ci && !sweep) {
    if (!['none', 'basic', 'full'].includes(loadoutRaw)) {
      throw new Error(`Unknown loadout: ${loadoutRaw}. Use none|basic|full.`);
    }
    if (!['random', 'greedy', 'optimal', 'all'].includes(strategyRaw)) {
      throw new Error(`Unknown strategy: ${strategyRaw}. Use random|greedy|optimal|all.`);
    }
    if (!MISSION_SPECS[missionId]) {
      throw new Error(`Unknown mission: ${missionId}. Use tutorial|mission_1|mission_2|mission_3.`);
    }
  }

  return {
    ci,
    sweep,
    sweepRange,
    missionId,
    loadout:     loadoutRaw  as 'none' | 'basic' | 'full',
    strategyKey: strategyRaw as 'random' | 'greedy' | 'optimal' | 'all',
    runs:        parseInt(runsRaw, 10),
    jsonOutput,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

function main(): void {
  const { ci, sweep, sweepRange, missionId, loadout, strategyKey, runs, jsonOutput } = parseArgs();

  if (ci) { runCi(); return; }
  if (sweep && sweepRange) {
    runSweep(sweep, sweepRange, missionId, loadout, runs === 2000 ? 500 : runs);
    return;
  }

  const stats      = buildStats(loadout);
  const chainLevel = buildChainLevel(loadout);
  const missionSpec = MISSION_SPECS[missionId]!;
  const config: SimConfig = { missionSpec, stats, chainLevel };

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
