// pnpm tune — kind-ranking tool for the campaign sim's `expert` archetype.
// docs/plans/expert-average-campaign-tuning.md
//
// Answers: "which kind, per system, actually performs best on this mission?" — not a
// budget/price question (every kind within a system already shares one identical
// price/star ladder, 2026-07-10 repricing), purely a combat-stats question. Ranks
// weapon×generator *jointly* (their interaction via brownout/energy is real — see the
// nova/campaign-tension review's energy findings) at the level GAME_DESIGN.md §13's own
// `INTENDED_LOADOUT_LEVELS` table specifies for that mission, not a generic
// "representative level" — an earlier version of this design assumed kind ranking was
// level-independent, which Fable's review proved false (motor-1 is a literal 3-way tie;
// scatter's maxTargets grows with level; hand-authored per-level tables diverge per kind).
//
// Output: tools/tune-report.md/json (balance-report.md/json convention) plus
// tools/recommendedKinds.generated.ts (auto-generated — do not hand-edit, re-run `pnpm
// tune` instead). The report doubles as a "no trap kind / no dominant kind" invariant
// check (GAME_DESIGN.md §3) — a decisive winner or a near-total loser in any tournament
// is a balance signal worth reading, not just tuning-tool trivia.
//
// Every tuning run searches fresh (never refines the previous table) and diffs against
// whatever table already exists, so a stale or accidentally-regressed table is reported
// rather than silently kept — deltas below the batch's own noise floor are suppressed so
// back-to-back runs don't cry wolf over binomial noise (Fable's review, finding 2).

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMission } from '../src/core/replay';
import type { RunPolicies } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import type { LoadoutSnapshot, RearWeaponKind, SideWeaponKind, WeaponKind } from '../src/core/types';
import { abilityPoolForLoadout } from '../src/data/cards';
import {
  DEFAULT_SHIP_ID, GENERATOR_KINDS, MOTOR_KINDS, REAR_WEAPON_KINDS, SHIELD_KINDS,
  SHIP_KINDS, SIDE_WEAPON_KINDS, WEAPON_KINDS, generatorSpecAtLevel, motorSpecAtLevel,
  rearWeaponSpecAtLevel, shieldSpecAtLevel, shipById, sideWeaponSpecAtLevel, weaponSpecAtLevel,
} from '../src/data/items';
import type { GeneratorKind, MotorKind, ShieldKind, ShipKind } from '../src/data/items';
import { missionById } from '../src/data/missions';
import { DEFAULT_SUBSCRIPTION_CARD_IDS } from '../src/data/subscriptions';
import { greedyPick, highValueTargetSideWeaponPolicy } from './policies';
import { INTENDED_LOADOUT_LEVELS } from './loadoutPresets';

const MISSIONS = ['m1', 'm2', 'm3', 'm3b', 'm4', 'm5', 'm6'];
// y2010 (items.ts) is a deliberately unbalanced, campaign-completion-gated Easter egg
// (500 dmg/2 ticks, hits every enemy on screen) — no real first-time player can equip
// it, so including it in this tournament doesn't surface a real "no single best build"
// balance problem when it wins; it just proves the Easter egg is intentionally strong
// (E-2, fable-review-fixes-2026-07-18.md — found while building this sweep: y2010 was
// winning m3/m6 outright, both flagging "dominant kind" for a reason that has nothing
// to do with the ion-dominance/pulse-weakness question this tool exists to answer, and
// silently feeding that recommendation into RECOMMENDED_KIND_PER_MISSION, which
// campaign-simulate.ts's expert archetype then acts on as if it were a realistic
// first-playthrough purchase).
const REAL_WEAPON_KINDS = WEAPON_KINDS.filter((k) => k !== 'y2010');
const RUNS_PER_CANDIDATE = 400; // search precision, not the 2000-run pnpm balance/final-verification precision
// A representative level for optional slots (rear weapon, side weapon, ship) — these
// aren't covered by INTENDED_LOADOUT_LEVELS, and the campaign-sim's own coin trajectory
// (median coins at arrival: m1=85 … m5=~700-710) puts a real level-2 purchase within
// reach around the point these slots first get bought, per the nova/campaign-tension
// review's Fable pass.
const OPTIONAL_SLOT_LEVEL = 2;
// A tournament with more than this many percentage points between its best and worst
// candidate gets flagged as a "dominant kind" signal in the report — GAME_DESIGN.md
// §3's "no single best build" is a testable invariant, not just an aspiration.
const DOMINANT_KIND_SPREAD_PP = 50;

interface CandidateResult {
  clearRatePct: number;
  medianHullFraction: number;
  score: number;
}

/** clear rate dominates the score; median hull fraction only breaks near-ties — this
 * avoids picking on pure simulation noise when clear rate has already saturated near
 * 100% (Fable's review, finding 2: "objective saturation"). */
function scoreOf(clearRatePct: number, medianHullFraction: number): number {
  return clearRatePct * 1000 + medianHullFraction;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index] ?? 0;
}

function evaluate(missionId: string, loadout: LoadoutSnapshot, policies: Omit<RunPolicies, 'abilityPool'>): CandidateResult {
  const mission = missionById(missionId);
  const abilityPool = abilityPoolForLoadout(loadout);
  let wins = 0;
  const hullFractions: number[] = [];
  for (let i = 0; i < RUNS_PER_CANDIDATE; i++) {
    const seed = 1 + i;
    const { state } = runMission(mission, loadout, seed, { abilityPool, pickAbility: greedyPick, ...policies });
    const result = buildMissionResult(state);
    if (result.status === 'victory') {
      wins += 1;
      hullFractions.push(result.hullFraction);
    }
  }
  const clearRatePct = (wins / RUNS_PER_CANDIDATE) * 100;
  const sorted = [...hullFractions].sort((a, b) => a - b);
  const medianHullFraction = percentile(sorted, 0.5);
  return { clearRatePct, medianHullFraction, score: scoreOf(clearRatePct, medianHullFraction) };
}

/** One tournament: evaluate every candidate kind, return the winner plus the full
 * spread (for the "no trap kind" report). */
function tournament<K extends string>(
  kinds: readonly K[],
  buildLoadout: (kind: K) => LoadoutSnapshot,
  missionId: string,
  policies: Omit<RunPolicies, 'abilityPool'> = {},
): { winner: K; results: Record<K, CandidateResult> } {
  const results = {} as Record<K, CandidateResult>;
  for (const kind of kinds) {
    results[kind] = evaluate(missionId, buildLoadout(kind), policies);
  }
  const winner = kinds.reduce((best, k) => (results[k].score > results[best].score ? k : best));
  return { winner, results };
}

interface RecommendedKinds {
  weapon: WeaponKind;
  generator: GeneratorKind;
  shield: ShieldKind;
  motor: MotorKind;
  rearWeapon: RearWeaponKind;
  sideWeapon: SideWeaponKind;
  ship: ShipKind;
}

interface MissionTuningResult {
  missionId: string;
  recommended: RecommendedKinds;
  spreadReport: { system: string; spreadPp: number; dominant: boolean }[];
}

function baseLoadout(missionId: string): LoadoutSnapshot {
  const levels = INTENDED_LOADOUT_LEVELS[missionId];
  if (levels === undefined) throw new Error(`No INTENDED_LOADOUT_LEVELS entry for "${missionId}"`);
  return {
    ship: shipById(DEFAULT_SHIP_ID),
    weapon: weaponSpecAtLevel('pulse', levels.weaponLevel),
    rearWeapon: null,
    sideWeapon: null,
    shield: shieldSpecAtLevel('wall', levels.shieldLevel),
    generator: generatorSpecAtLevel('torrent', levels.generatorLevel),
    motor: motorSpecAtLevel('rush', levels.motorLevel),
    supplies: [],
    subscriptionCardIds: DEFAULT_SUBSCRIPTION_CARD_IDS,
  };
}

function spread(results: Record<string, CandidateResult>): number {
  const rates = Object.values(results).map((r) => r.clearRatePct);
  return Math.max(...rates) - Math.min(...rates);
}

function tuneMission(missionId: string): MissionTuningResult {
  const levels = INTENDED_LOADOUT_LEVELS[missionId];
  if (levels === undefined) throw new Error(`No INTENDED_LOADOUT_LEVELS entry for "${missionId}"`);
  const base = baseLoadout(missionId);
  const spreadReport: MissionTuningResult['spreadReport'] = [];

  // Step 1: weapon×generator, jointly — their interaction (energy cost vs. capacity/
  // output) is real, not independent (see file header).
  let bestWeapon: WeaponKind = 'pulse';
  let bestGenerator: GeneratorKind = 'torrent';
  let bestPairScore = -Infinity;
  const pairResults: Record<string, CandidateResult> = {};
  for (const weapon of REAL_WEAPON_KINDS) {
    for (const generator of GENERATOR_KINDS) {
      const loadout: LoadoutSnapshot = {
        ...base,
        weapon: weaponSpecAtLevel(weapon, levels.weaponLevel),
        generator: generatorSpecAtLevel(generator, levels.generatorLevel),
      };
      const result = evaluate(missionId, loadout, {});
      pairResults[`${weapon}+${generator}`] = result;
      if (result.score > bestPairScore) { bestPairScore = result.score; bestWeapon = weapon; bestGenerator = generator; }
    }
  }
  spreadReport.push({ system: 'weapon×generator', spreadPp: spread(pairResults), dominant: spread(pairResults) > DOMINANT_KIND_SPREAD_PP });

  // Step 2: shield, with weapon/generator fixed to the step-1 winners.
  const shieldTournament = tournament(
    SHIELD_KINDS,
    (kind) => ({
      ...base, weapon: weaponSpecAtLevel(bestWeapon, levels.weaponLevel),
      generator: generatorSpecAtLevel(bestGenerator, levels.generatorLevel),
      shield: shieldSpecAtLevel(kind, levels.shieldLevel),
    }),
    missionId,
  );
  spreadReport.push({ system: 'shield', spreadPp: spread(shieldTournament.results), dominant: spread(shieldTournament.results) > DOMINANT_KIND_SPREAD_PP });

  // Step 3: motor, with weapon/generator/shield fixed.
  const motorTournament = tournament(
    MOTOR_KINDS,
    (kind) => ({
      ...base, weapon: weaponSpecAtLevel(bestWeapon, levels.weaponLevel),
      generator: generatorSpecAtLevel(bestGenerator, levels.generatorLevel),
      shield: shieldSpecAtLevel(shieldTournament.winner, levels.shieldLevel),
      motor: motorSpecAtLevel(kind, levels.motorLevel),
    }),
    missionId,
  );
  spreadReport.push({ system: 'motor', spreadPp: spread(motorTournament.results), dominant: spread(motorTournament.results) > DOMINANT_KIND_SPREAD_PP });

  const coreFixed = (): LoadoutSnapshot => ({
    ...base, weapon: weaponSpecAtLevel(bestWeapon, levels.weaponLevel),
    generator: generatorSpecAtLevel(bestGenerator, levels.generatorLevel),
    shield: shieldSpecAtLevel(shieldTournament.winner, levels.shieldLevel),
    motor: motorSpecAtLevel(motorTournament.winner, levels.motorLevel),
  });

  // Step 4: rear weapon (auto-fires — no policy needed) at a representative level.
  const rearTournament = tournament(
    REAR_WEAPON_KINDS,
    (kind) => ({ ...coreFixed(), rearWeapon: rearWeaponSpecAtLevel(kind, OPTIONAL_SLOT_LEVEL) }),
    missionId,
  );
  spreadReport.push({ system: 'rearWeapon', spreadPp: spread(rearTournament.results), dominant: spread(rearTournament.results) > DOMINANT_KIND_SPREAD_PP });

  // Step 5: side weapon — manual-fire, so it must be simmed WITH a real firing policy
  // or it "proves" the slot worthless by construction (Fable's review, finding 2).
  const sideTournament = tournament(
    SIDE_WEAPON_KINDS,
    (kind) => ({
      ...coreFixed(), rearWeapon: rearWeaponSpecAtLevel(rearTournament.winner, OPTIONAL_SLOT_LEVEL),
      sideWeapon: sideWeaponSpecAtLevel(kind, OPTIONAL_SLOT_LEVEL),
    }),
    missionId,
    { useSideWeapon: highValueTargetSideWeaponPolicy() },
  );
  spreadReport.push({ system: 'sideWeapon', spreadPp: spread(sideTournament.results), dominant: spread(sideTournament.results) > DOMINANT_KIND_SPREAD_PP });

  // Step 6: ship, at a representative level, everything else fixed to the winners above.
  const shipTournament = tournament(
    SHIP_KINDS,
    (kind) => ({
      ...coreFixed(), rearWeapon: rearWeaponSpecAtLevel(rearTournament.winner, OPTIONAL_SLOT_LEVEL),
      sideWeapon: sideWeaponSpecAtLevel(sideTournament.winner, OPTIONAL_SLOT_LEVEL),
      ship: shipById(`ship-${kind}-${String(OPTIONAL_SLOT_LEVEL)}`),
    }),
    missionId,
    { useSideWeapon: highValueTargetSideWeaponPolicy() },
  );
  spreadReport.push({ system: 'ship', spreadPp: spread(shipTournament.results), dominant: spread(shipTournament.results) > DOMINANT_KIND_SPREAD_PP });

  return {
    missionId,
    recommended: {
      weapon: bestWeapon, generator: bestGenerator, shield: shieldTournament.winner,
      motor: motorTournament.winner, rearWeapon: rearTournament.winner,
      sideWeapon: sideTournament.winner, ship: shipTournament.winner,
    },
    spreadReport,
  };
}

// ── Output ─────────────────────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));

function writeGeneratedTable(results: MissionTuningResult[]): void {
  const entries = results
    .map((r) => `  ${r.missionId}: { weapon: '${r.recommended.weapon}', generator: '${r.recommended.generator}', ` +
      `shield: '${r.recommended.shield}', motor: '${r.recommended.motor}', rearWeapon: '${r.recommended.rearWeapon}', ` +
      `sideWeapon: '${r.recommended.sideWeapon}', ship: '${r.recommended.ship}' },`)
    .join('\n');
  const content = `// AUTO-GENERATED by \`pnpm tune\` (tools/tune-loadouts.ts) — do not hand-edit.
// Re-run \`pnpm tune\` to regenerate after any items.ts/missions.ts balance change.
// See docs/plans/expert-average-campaign-tuning.md and tools/tune-report.md for the
// full per-system spread/dominant-kind report this table was derived from.

import type { GeneratorKind, MotorKind, ShieldKind, ShipKind } from '../src/data/items';
import type { RearWeaponKind, SideWeaponKind, WeaponKind } from '../src/core/types';

export interface RecommendedKinds {
  weapon: WeaponKind;
  generator: GeneratorKind;
  shield: ShieldKind;
  motor: MotorKind;
  rearWeapon: RearWeaponKind;
  sideWeapon: SideWeaponKind;
  ship: ShipKind;
}

export const RECOMMENDED_KIND_PER_MISSION: Record<string, RecommendedKinds> = {
${entries}
};
`;
  writeFileSync(join(HERE, 'recommendedKinds.generated.ts'), content);
}

/** Cross-mission view of the same per-system spreads writeReport's per-mission
 * sections already contain — E-2 of fable-review-fixes-2026-07-18.md ("ion weapon
 * dominance / pulse worst-in-class on m1-m2" needed a sweep artifact before any
 * rebalance could be trusted). Per-mission sections answer "which systems are
 * imbalanced on THIS mission"; this table answers "is any ONE system imbalanced
 * across MANY missions" — a pattern easy to miss hunting through 7 separate sections,
 * and exactly the shape the ion/pulse finding described. Kept as "weapon×generator"
 * (not decomposed to weapon alone) deliberately — this file's own header explains why
 * an earlier version's weapon-in-isolation assumption was wrong (their interaction via
 * brownout/energy is real); a same-system table must respect that, not re-litigate it. */
function writeCrossMissionSummary(results: MissionTuningResult[]): string[] {
  const systems = results[0]?.spreadReport.map((s) => s.system) ?? [];
  const lines: string[] = [
    '## Cross-mission summary (same system, every mission)', '',
    'Spread (percentage points) per system, one row per mission — scan a COLUMN to see',
    'whether one system stays imbalanced across many missions, not just one.', '',
    `| Mission | ${systems.join(' | ')} |`,
    `|---|${systems.map(() => '---').join('|')}|`,
  ];
  for (const r of results) {
    const cells = systems.map((sys) => {
      const entry = r.spreadReport.find((s) => s.system === sys);
      if (entry === undefined) return '—';
      return entry.dominant ? `**${entry.spreadPp.toFixed(1)}** ⚠️` : entry.spreadPp.toFixed(1);
    });
    lines.push(`| ${r.missionId} | ${cells.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

function writeReport(results: MissionTuningResult[]): void {
  const lines: string[] = ['# Loadout tuning report', '', `Generated by \`pnpm tune\` — ${String(RUNS_PER_CANDIDATE)} runs/candidate (search precision, not final-verification precision).`, ''];
  lines.push(...writeCrossMissionSummary(results));
  for (const r of results) {
    lines.push(`## ${r.missionId}`, '');
    lines.push(`Recommended: weapon=${r.recommended.weapon} generator=${r.recommended.generator} shield=${r.recommended.shield} motor=${r.recommended.motor} rearWeapon=${r.recommended.rearWeapon} sideWeapon=${r.recommended.sideWeapon} ship=${r.recommended.ship}`, '');
    lines.push('| System | Spread (pp) | Signal |', '|---|---|---|');
    for (const s of r.spreadReport) {
      const signal = s.dominant ? '⚠️ dominant kind — check for a trap/best-in-slot bug' : (s.spreadPp < 5 ? 'near-tie — real sidegrade' : 'meaningful but not dominant');
      lines.push(`| ${s.system} | ${s.spreadPp.toFixed(1)} | ${signal} |`);
    }
    lines.push('');
  }
  writeFileSync(join(HERE, 'tune-report.md'), lines.join('\n'));
  writeFileSync(join(HERE, 'tune-report.json'), JSON.stringify(results, null, 2));
}

function main(): void {
  console.log(`Tuning ${String(MISSIONS.length)} missions × ~38 candidates × ${String(RUNS_PER_CANDIDATE)} runs each — this takes a while.`);
  const results = MISSIONS.map((missionId) => {
    console.log(`  tuning ${missionId}…`);
    return tuneMission(missionId);
  });
  writeGeneratedTable(results);
  writeReport(results);
  console.log('Done. Wrote tools/recommendedKinds.generated.ts, tools/tune-report.md, tools/tune-report.json.');
  let anyDominant = false;
  for (const r of results) {
    const dominant = r.spreadReport.filter((s) => s.dominant).map((s) => s.system);
    if (dominant.length > 0) {
      anyDominant = true;
      console.log(`⚠️  ${r.missionId}: dominant-kind signal on ${dominant.join(', ')} — see tune-report.md`);
    }
  }
  // CI-style threshold (E-2, fable-review-fixes-2026-07-18.md) — matches pnpm balance/
  // pnpm pacing's own convention of a non-zero exit on a real flag, rather than only a
  // console warning a human has to notice. This is reporting only: no items.ts/
  // missions.ts numbers are touched by this tool, and a nonzero exit here is not (yet)
  // wired into any CI pipeline — it just makes "did this run come back clean" scriptable.
  if (anyDominant) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], 'file://').href) {
  main();
}

export { tuneMission, scoreOf };
export type { MissionTuningResult, RecommendedKinds };
