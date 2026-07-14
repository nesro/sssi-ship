// Balance sweep — runs every non-tutorial mission × strategy × loadout and writes
// a markdown report to tools/balance-report.md.
//
// Usage:
//   pnpm balance              # default: 500 runs per combo (~2 min)
//   pnpm balance -- --runs 5000   # thorough: ~20 min, tight confidence intervals
//   pnpm balance -- --runs 50000  # exhaustive: ~1 hour, ±0.2% accuracy
//   pnpm balance -- --json        # also writes tools/balance-report.json
//
// The report shows clear-rate and per-star rates for every combination so you can
// spot which missions are too hard or too easy and which stars are impossible or
// trivial (see the threshold constants below for the exact cutoffs).
//
// The process exits non-zero if anything is flagged, so a caller can check `$?`
// instead of reading the report — only load the full report when something actually
// flags. Run anything past the quick default (500 runs) in the background
// (docs/plans/mission-design-and-testing.md item 5) rather than waiting on it
// synchronously; then read tools/balance-report.md (or .json) once it's done.

import { writeFileSync } from 'fs';
import { TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { mulberry32 } from '../src/core/rng';
import type { AbilityOffer, CoreState, LoadoutSnapshot } from '../src/core/types';
import { abilityById, abilityPoolForLoadout } from '../src/data/cards';
import { ALL_MISSIONS } from '../src/data/missions';
import { STARTER_LOADOUT } from '../src/data/loadouts';
import { intendedLoadoutForMission, starterKindLoadoutAtLevel, weaponAtKindIndex } from './loadoutPresets';

// ── Flag thresholds ──────────────────────────────────────────────────────────
// GAME_DESIGN.md §13 does not set one flat clear-rate band — it sets a declining
// per-mission floor, each checked against that mission's own "intended loadout" (a
// specific partial upgrade, not the generic starter/mid/full tiers below), played with
// the `greedy` strategy specifically — greedy's card-optimizing heuristic is this
// project's realistic-player proxy (see project balance memory: calibrating against
// `random` instead produced thresholds that read as unreachable under real play, since
// random's careless, non-synergizing choices are a much weaker baseline than any real
// player). Only the intended+greedy combo is checked against this table — starter/mid/
// full rows, and every row's `random` strategy, are informational only.
const INTENDED_CLEAR_RATE_FLOOR: Record<string, number> = {
  m1: 0.85, m2: 0.75, m3: 0.65, m4: 0.55, m5: 0.50, m6: 0.45,
};
const INTENDED_CLEAR_RATE_CEILING = 0.9; // ">90% is too easy", applies to every mission
const STAR_UNREACHABLE = 0.05;
const STAR_TRIVIAL = 0.95;

type ComboFlag = 'TOO_HARD' | 'TOO_EASY' | null;
type StarFlag = 'UNREACHABLE' | 'TRIVIAL' | null;

/** Only meaningful for the intended+greedy combo — every other combo has no defined target. */
function intendedComboFlag(missionId: string, loadoutKey: string, strategyKey: string, rate: number): ComboFlag {
  if (loadoutKey !== 'intended' || strategyKey !== 'greedy') return null;
  const floor = INTENDED_CLEAR_RATE_FLOOR[missionId];
  if (floor === undefined) return null;
  if (rate < floor) return 'TOO_HARD';
  if (rate > INTENDED_CLEAR_RATE_CEILING) return 'TOO_EASY';
  return null;
}

function starFlag(rate: number): StarFlag {
  if (rate < STAR_UNREACHABLE) return 'UNREACHABLE';
  if (rate > STAR_TRIVIAL) return 'TRIVIAL';
  return null;
}

const COMBO_FLAG_LABEL: Record<Exclude<ComboFlag, null>, string> = {
  TOO_HARD: ' ⚠️ TOO HARD',
  TOO_EASY: ' 💤 TOO EASY',
};
const STAR_FLAG_LABEL: Record<Exclude<StarFlag, null>, string> = {
  UNREACHABLE: ' ⚠️ UNREACHABLE',
  TRIVIAL: ' 💤 TRIVIAL',
};

// ── Loadout presets ──────────────────────────────────────────────────────────
// mid/full read kind index + level from src/data/items.ts's *_KINDS arrays instead
// of hardcoding item ids — see loadoutPresets.ts for why.

const LOADOUTS: Record<string, LoadoutSnapshot> = {
  starter: STARTER_LOADOUT,
  // Weapon a level ahead of the rest — represents prioritizing the starter weapon.
  mid: { ...starterKindLoadoutAtLevel(2), weapon: weaponAtKindIndex(0, 3) },
  // Branched into the second weapon kind — represents having upgraded off the starter.
  full: { ...starterKindLoadoutAtLevel(3), weapon: weaponAtKindIndex(1, 4) },
};
const LOADOUT_KEYS = [...Object.keys(LOADOUTS), 'intended'];

/** `intended` resolves per-mission (loadoutPresets.ts); the rest are the static LOADOUTS above. */
function resolveLoadout(missionId: string, loadoutKey: string): LoadoutSnapshot {
  if (loadoutKey === 'intended') return intendedLoadoutForMission(missionId);
  const loadout = LOADOUTS[loadoutKey];
  if (loadout === undefined) throw new Error(`Unknown loadout ${loadoutKey}`);
  return loadout;
}

// ── Card strategies ──────────────────────────────────────────────────────────

function randomPolicies(seed: number, loadout: LoadoutSnapshot): RunPolicies {
  const rng = mulberry32(seed ^ 0x5f3759df);
  return { abilityPool: abilityPoolForLoadout(loadout), pickAbility: () => Math.floor(rng() * 3) };
}

function greedyPolicies(loadout: LoadoutSnapshot): RunPolicies {
  const priorities: Record<string, number> = { nexus: 0, quantum: 1, aegis: 2, comet: 3 };
  const pickAbility = (_state: CoreState, offer: AbilityOffer): number => {
    let best = 0;
    let bestRank = Number.POSITIVE_INFINITY;
    offer.abilityIds.forEach((cardId, i) => {
      const rank = priorities[abilityById(cardId).company] ?? 9;
      if (rank < bestRank) { bestRank = rank; best = i; }
    });
    return best;
  };
  return { abilityPool: abilityPoolForLoadout(loadout), pickAbility };
}

// ── Stats accumulator ────────────────────────────────────────────────────────

interface ComboResult {
  missionId: string;
  loadout: string;
  strategy: string;
  runs: number;
  victories: number;
  totalTicks: number;
  starCounts: Map<string, number>;
}

function runCombo(
  missionId: string,
  loadoutKey: string,
  strategyKey: string,
  runs: number,
  baseSeed: number,
): ComboResult {
  const mission = ALL_MISSIONS.find((m) => m.id === missionId);
  if (mission === undefined) throw new Error(`Unknown mission ${missionId}`);
  const loadout = resolveLoadout(missionId, loadoutKey);

  let victories = 0;
  let totalTicks = 0;
  const starCounts = new Map<string, number>();

  for (let i = 0; i < runs; i++) {
    const seed = baseSeed + i;
    const policies = strategyKey === 'greedy' ? greedyPolicies(loadout) : randomPolicies(seed, loadout);
    const { state } = runMission(mission, loadout, seed, policies);
    const result = buildMissionResult(state);
    if (result.status === 'victory') victories += 1;
    totalTicks += result.durationTicks;
    for (const starId of result.earnedStarIds) {
      starCounts.set(starId, (starCounts.get(starId) ?? 0) + 1);
    }
  }

  return { missionId, loadout: loadoutKey, strategy: strategyKey, runs, victories, totalTicks, starCounts };
}

// ── Report formatting ─────────────────────────────────────────────────────────

function pct(n: number, total: number): string {
  return `${((n / total) * 100).toFixed(1)}%`;
}

function formatReport(results: ComboResult[], missions: typeof ALL_MISSIONS): string {
  const lines: string[] = [
    `# Balance Report`,
    ``,
    `Generated by \`pnpm balance\`. Each cell is clear-rate; starred rows show per-star earn rates.`,
    `**Combo flags**: only the \`intended\` loadout row is checked against a real target — ` +
      `GAME_DESIGN.md §13's per-mission floor (m1 85% down to m6 45%) with a 90% "too easy" ` +
      `ceiling for every mission. starter/mid/full rows are informational only; no target was ` +
      `ever defined for those generic tiers.`,
    `**Star flags**: below ${(STAR_UNREACHABLE * 100).toFixed(0)}% (unreachable) or above ` +
      `${(STAR_TRIVIAL * 100).toFixed(0)}% (trivial), measured on starter/greedy.`,
    ``,
  ];

  for (const mission of missions) {
    lines.push(`## ${mission.id}: ${mission.name}`);
    lines.push(``);

    const mResults = results.filter((r) => r.missionId === mission.id);

    // Summary table
    lines.push(`| loadout | strategy | clear-rate | avg-duration |`);
    lines.push(`|---------|----------|-----------|--------------|`);
    for (const r of mResults) {
      const avgS = (r.totalTicks / r.runs / TICKS_PER_SECOND).toFixed(1);
      const flag = intendedComboFlag(r.missionId, r.loadout, r.strategy, r.victories / r.runs);
      lines.push(`| ${r.loadout} | ${r.strategy} | **${pct(r.victories, r.runs)}**${flag !== null ? COMBO_FLAG_LABEL[flag] : ''} | ${avgS}s |`);
    }

    lines.push(``);

    // Star detail from the intended/greedy combo — the mission's own target gear, not
    // generic starter (which understates reachability for m3-m6, whose intended loadout
    // is a partial upgrade past starter per GAME_DESIGN.md §13).
    const baseline = mResults.find((r) => r.loadout === 'intended' && r.strategy === 'greedy');
    if (baseline !== undefined && mission.stars.length > 0) {
      lines.push(`**Stars** (intended/greedy):`);
      for (const star of mission.stars) {
        const rate = pct(baseline.starCounts.get(star.id) ?? 0, baseline.runs);
        const flag = starFlag((baseline.starCounts.get(star.id) ?? 0) / baseline.runs);
        lines.push(`- \`${star.id}\` ${rate}${flag !== null ? STAR_FLAG_LABEL[flag] : ''}`);
      }
      lines.push(``);
    }
  }

  return lines.join('\n');
}

// ── JSON output ──────────────────────────────────────────────────────────────
// A compact, structured alternative to the markdown report — lets a script or agent
// check "did anything flag" in a few lines instead of parsing prose.

interface JsonComboEntry {
  missionId: string; loadout: string; strategy: string; clearRate: number; flag: ComboFlag;
}
interface JsonStarEntry {
  missionId: string; starId: string; rate: number; flag: StarFlag;
}
interface JsonReport {
  combos: JsonComboEntry[];
  stars: JsonStarEntry[];
  anyFlagged: boolean;
}

function buildJsonReport(results: ComboResult[], missions: typeof ALL_MISSIONS): JsonReport {
  const combos: JsonComboEntry[] = results.map((r) => {
    const clearRate = r.victories / r.runs;
    return {
      missionId: r.missionId, loadout: r.loadout, strategy: r.strategy, clearRate,
      flag: intendedComboFlag(r.missionId, r.loadout, r.strategy, clearRate),
    };
  });

  // Iterate every star the mission defines, not just starCounts' keys — a star earned
  // in zero runs never gets a starCounts entry at all, and 0% is exactly the case
  // UNREACHABLE exists to catch. Skipping missing keys here would silently drop it.
  const stars: JsonStarEntry[] = [];
  for (const mission of missions) {
    const baseline = results.find((r) => r.missionId === mission.id && r.loadout === 'intended' && r.strategy === 'greedy');
    if (baseline === undefined) continue;
    for (const star of mission.stars) {
      const rate = (baseline.starCounts.get(star.id) ?? 0) / baseline.runs;
      stars.push({ missionId: mission.id, starId: star.id, rate, flag: starFlag(rate) });
    }
  }

  const anyFlagged = combos.some((c) => c.flag !== null) || stars.some((s) => s.flag !== null);
  return { combos, stars, anyFlagged };
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface CliOptions { runs: number; json: boolean }

function parseCliOptions(argv: string[]): CliOptions {
  const idx = argv.indexOf('--runs');
  let runs = 500;
  if (idx >= 0 && argv[idx + 1] !== undefined) {
    const n = parseInt(argv[idx + 1] ?? '', 10);
    if (Number.isFinite(n) && n > 0) runs = n;
  }
  return { runs, json: argv.includes('--json') };
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const runsPerCombo = options.runs;
  const nonTutorial = ALL_MISSIONS.filter((m) => m.forcedLoadout === undefined);
  const loadoutKeys = LOADOUT_KEYS;
  const strategyKeys = ['greedy', 'random'];
  const total = nonTutorial.length * loadoutKeys.length * strategyKeys.length;
  let done = 0;

  console.log(`Running ${String(total)} combos × ${String(runsPerCombo)} runs = ${String(total * runsPerCombo)} total simulations…`);

  const results: ComboResult[] = [];
  for (const mission of nonTutorial) {
    for (const loadoutKey of loadoutKeys) {
      for (const strategyKey of strategyKeys) {
        const r = runCombo(mission.id, loadoutKey, strategyKey, runsPerCombo, 1);
        results.push(r);
        done++;
        process.stdout.write(`\r  ${String(done)}/${String(total)} (${mission.id}/${loadoutKey}/${strategyKey})        `);
      }
    }
  }

  console.log('\nDone. Writing report…');
  const report = formatReport(results, nonTutorial);
  const outPath = new URL('./balance-report.md', import.meta.url).pathname;
  writeFileSync(outPath, report, 'utf8');
  console.log(`Report written to tools/balance-report.md`);

  const jsonReport = buildJsonReport(results, nonTutorial);
  if (options.json) {
    const jsonPath = new URL('./balance-report.json', import.meta.url).pathname;
    writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');
    console.log(`JSON report written to tools/balance-report.json`);
  }

  console.log(`\nQuick summary (intended loadout — the mission's own GAME_DESIGN.md §13 target):`);
  for (const r of results.filter((r) => r.strategy === 'greedy' && r.loadout === 'intended')) {
    const rate = ((r.victories / r.runs) * 100).toFixed(1);
    const flag = intendedComboFlag(r.missionId, r.loadout, r.strategy, r.victories / r.runs);
    const icon = flag === 'TOO_HARD' ? '⚠️' : flag === 'TOO_EASY' ? '💤' : '✓';
    console.log(`  ${icon} ${r.missionId.padEnd(4)} clear ${rate}%`);
  }

  // Non-zero exit when anything is flagged — lets a caller check `$?` instead of
  // parsing the report; only read the full report when this signals a problem.
  if (jsonReport.anyFlagged) {
    console.log('\n⚠️  One or more combos/stars are flagged — see the report for detail.');
    process.exitCode = 1;
  }
}

main();
