// Pacing/fun report — measures mission pacing directly instead of relying on a human
// reading missions.ts prose. Two layers:
//
//   static  — computed straight from MissionSpec.events + EnemySpec.speed, no simulation
//             needed: each event's "aggression tier" via the time-to-impact = LANE_LENGTH/
//             speed/TICKS_PER_SECOND relationship (docs/plans/mission-design-and-testing.md's
//             already-proposed Patient/Escalating/Aggressive bands), plus the longest
//             same-kind consecutive streak (catches m1's 14-fodder-wave problem directly).
//   dynamic — needs real sim runs: peak concurrent enemies and the longest unbroken
//             zero-enemy stretch (the "screensaver" signal — aggregate idle time turned
//             out not to discriminate at all, see the threshold comment below) via a
//             TickSampler, plus boss weapon-kill-share (from CoreState.bossKillTick,
//             already tracked — no sampling needed for this one).
//
// Time-star reachability is deliberately NOT duplicated here — `pnpm balance` already
// flags UNREACHABLE/TRIVIAL stars directly from the real star system; re-deriving that
// from percentile data here would be a second, divergent implementation of the same check.
//
// Usage:
//   pnpm pacing                    # default: 300 runs/mission (~30s), quick default
//   pnpm pacing -- --runs 2000     # tighter dynamic-metric confidence
//   pnpm pacing -- --mission m1    # single mission
//   pnpm pacing -- --json          # also writes tools/pacing-report.json
//
// Non-zero exit if anything is flagged, matching balance-sweep.ts's convention — check
// `$?` instead of parsing the report; only read the full report when something flags.

import { writeFileSync } from 'fs';
import { LANE_LENGTH, TICKS_PER_SECOND } from '../src/core/constants';
import { runMission } from '../src/core/replay';
import type { CoreState, LoadoutSnapshot, MissionSpec } from '../src/core/types';
import { buildMissionResult } from '../src/core/result';
import { resolveForcedLoadout } from '../src/data/loadouts';
import { ALL_MISSIONS, missionById } from '../src/data/missions';
import { intendedLoadoutForMission } from './loadoutPresets';
import { greedyPick } from './policies';

// ── Flag thresholds ──────────────────────────────────────────────────────────
// Tuned against m2 ("Picket Line") as the known-good reference — GAME_DESIGN.md calls
// it the best-paced mission in the game, so it must never flag. See the tuning notes
// inline with each constant.

const AGGRESSION_TIER_PATIENT_MIN_SECONDS = 8; // time-to-impact ≥ 8s = Patient
const AGGRESSION_TIER_ESCALATING_MIN_SECONDS = 4; // 4-8s = Escalating, <4s = Aggressive

// m2's longest same-kind streak is 3 (its alternating fodder/striker rhythm); m1's
// pre-fix streak is 14. 6 sits cleanly between the two.
const MONOTONY_STREAK_THRESHOLD = 6;

// Longest single unbroken stretch with zero enemies on the lane, in seconds. Measured
// at 2000 runs/mission: m2 (the declared best-paced mission) sits at 14.0s, m6 at
// 16.0s, m3/m4 at a clearly-distinct 20.0s. 17 sits with real margin above m2/m6 and
// below m3/m4 — a genuine gap, not aggregate idle time (which is 35-55% on every
// mission regardless of pacing quality and was dropped as a non-discriminating metric).
const LONGEST_IDLE_STRETCH_THRESHOLD_SECONDS = 17;

// Share of boss-mission victories where the boss actually died to weapon fire
// (CoreState.bossKillTick !== null) rather than being collision-tanked at full/near-full
// hull.
const ANTICLIMAX_WEAPON_KILL_SHARE_THRESHOLD = 0.5;

// First tick (state.tick, the real per-advance counter — not timelineTick, which can
// freeze behind a blocksConveyor enemy) at which the player's ship has done SOMETHING
// to or with an enemy — fired a shot or taken a collision — "how long until something
// actually happens." 30 ticks = 3s, the same "nothing happening for more than 2-3
// seconds is bad" rule that drove t1's guardian-speed fix (missions.ts's
// GUARDIAN_SLOW).
//
// Deliberately shotsFired, not kills: an early draft used kills+collisions and
// falsely flagged t3 at 36s — t3's guardian is a stationary blocksConveyor enemy the
// player's weapon starts firing at almost immediately, but by design (the regen
// mechanic) doesn't actually DIE until well after the damage card lands. The player
// is watching an active fight the whole time; "no kill yet" isn't "nothing is
// happening." shotsFired catches the moment engagement starts, which is what the
// playtest complaint was actually about (t1's true problem: zero enemies, zero fire,
// zero anything for ~15-19s). Runs with no shot or collision at all don't count
// toward the average — see the sample loop below.
const SLOW_START_THRESHOLD_TICKS = 30;

type Tier = 'stationary' | 'patient' | 'escalating' | 'aggressive';

export function timeToImpactSeconds(speed: number): number {
  return speed > 0 ? LANE_LENGTH / speed / TICKS_PER_SECOND : Number.POSITIVE_INFINITY;
}

export function tierForSpeed(speed: number): Tier {
  if (speed <= 0) return 'stationary';
  const tti = timeToImpactSeconds(speed);
  if (tti >= AGGRESSION_TIER_PATIENT_MIN_SECONDS) return 'patient';
  if (tti >= AGGRESSION_TIER_ESCALATING_MIN_SECONDS) return 'escalating';
  return 'aggressive';
}

// ── Static profile ───────────────────────────────────────────────────────────

interface StaticProfile {
  eventTiers: { atTimelineTick: number; kind: string; tier: Tier }[];
  longestSameKindStreak: { kind: string; streak: number };
  kindVarietyByThird: [number, number, number]; // distinct kinds seen in each time-third
}

export function computeStaticProfile(mission: MissionSpec): StaticProfile {
  const eventTiers = mission.events.map((event) => {
    const spec = mission.enemyKinds[event.kind];
    if (spec === undefined) throw new Error(`Mission "${mission.id}" event references unknown kind "${event.kind}"`);
    return { atTimelineTick: event.atTimelineTick, kind: event.kind, tier: tierForSpeed(spec.speed) };
  });

  let longestSameKindStreak = { kind: '', streak: 0 };
  let currentKind = '';
  let currentStreak = 0;
  for (const event of mission.events) {
    if (event.kind === currentKind) currentStreak += 1;
    else { currentKind = event.kind; currentStreak = 1; }
    if (currentStreak > longestSameKindStreak.streak) longestSameKindStreak = { kind: currentKind, streak: currentStreak };
  }

  const lastTick = mission.events[mission.events.length - 1]?.atTimelineTick ?? 0;
  const thirdWidth = (lastTick + 1) / 3;
  const kindsByThird: [Set<string>, Set<string>, Set<string>] = [new Set(), new Set(), new Set()];
  for (const event of mission.events) {
    const third = Math.min(2, Math.floor(event.atTimelineTick / thirdWidth));
    kindsByThird[third]?.add(event.kind);
  }

  return {
    eventTiers,
    longestSameKindStreak,
    kindVarietyByThird: kindsByThird.map((s) => s.size) as [number, number, number],
  };
}

// ── Dynamic profile ──────────────────────────────────────────────────────────

interface DynamicProfile {
  runs: number;
  // Brief gaps between waves are normal pacing, not a problem — measured directly:
  // every mission's aggregate idle-tick fraction sits in the same 35-55% band whether
  // or not it's well-paced (m2, the declared best-paced mission, is 52%). The real
  // "screensaver" signal is a single SUSTAINED dead patch, so this tracks the longest
  // unbroken idle stretch per run instead of total idle time.
  avgLongestIdleStretchSeconds: number;
  avgPeakConcurrency: number;
  bossVictories: number;
  bossWeaponKills: number; // subset of bossVictories where bossKillTick !== null
  hasBoss: boolean;
  // Runs with zero kills AND zero collisions (a clean, hitless clear) never fire a
  // first event and are excluded from the average — same "only average what actually
  // happened" approach as bossWeaponKillShare above.
  runsWithFirstEvent: number;
  avgFirstEventSeconds: number;
}

/** Tutorials use their own forced gear (the mission's whole point); every other
 * mission uses its GAME_DESIGN.md §13 intended loadout, same as balance-sweep.ts. */
function resolveLoadout(mission: MissionSpec): LoadoutSnapshot {
  return mission.forcedLoadout !== undefined
    ? resolveForcedLoadout(mission.forcedLoadout)
    : intendedLoadoutForMission(mission.id);
}

function computeDynamicProfile(mission: MissionSpec, runs: number, baseSeed: number): DynamicProfile {
  const loadout = resolveLoadout(mission);
  const hasBoss = Object.values(mission.enemyKinds).some((spec) => spec.isBoss === true);

  let longestIdleStretchSum = 0;
  let peakConcurrencySum = 0;
  let bossVictories = 0;
  let bossWeaponKills = 0;
  let runsWithFirstEvent = 0;
  let firstEventTickSum = 0;

  for (let i = 0; i < runs; i++) {
    const seed = baseSeed + i;
    let currentIdleStretch = 0;
    let longestIdleStretch = 0;
    let peak = 0;
    // A property, not a bare `let`, so TS/eslint's closure control-flow analysis
    // doesn't narrow it to the literal `null` it starts at — the object holds the
    // union type stably across the sampleTick closure and the runMission call.
    const firstEvent: { tick: number | null } = { tick: null };
    const sampleTick = (state: CoreState): void => {
      if (state.enemies.length === 0) {
        currentIdleStretch += 1;
        if (currentIdleStretch > longestIdleStretch) longestIdleStretch = currentIdleStretch;
      } else {
        currentIdleStretch = 0;
        if (state.enemies.length > peak) peak = state.enemies.length;
      }
      if (firstEvent.tick === null && state.stats.shotsFired + state.stats.collisions > 0) {
        firstEvent.tick = state.tick;
      }
    };
    const { state } = runMission(mission, loadout, seed, { pickAbility: greedyPick, sampleTick });
    const result = buildMissionResult(state);

    longestIdleStretchSum += longestIdleStretch / TICKS_PER_SECOND;
    peakConcurrencySum += peak;
    if (hasBoss && result.status === 'victory') {
      bossVictories += 1;
      if (state.bossKillTick !== null) bossWeaponKills += 1;
    }
    if (firstEvent.tick !== null) {
      runsWithFirstEvent += 1;
      firstEventTickSum += firstEvent.tick;
    }
  }

  return {
    runs,
    avgLongestIdleStretchSeconds: longestIdleStretchSum / runs,
    avgPeakConcurrency: peakConcurrencySum / runs,
    bossVictories,
    bossWeaponKills,
    hasBoss,
    runsWithFirstEvent,
    avgFirstEventSeconds: runsWithFirstEvent > 0
      ? (firstEventTickSum / runsWithFirstEvent) / TICKS_PER_SECOND
      : 0,
  };
}

// ── Flags ─────────────────────────────────────────────────────────────────────

type MissionFlag = 'MONOTONY' | 'IDLE_STRETCH' | 'ANTICLIMAX' | 'SLOW_START';

function flagsFor(staticProfile: StaticProfile, dynamicProfile: DynamicProfile): MissionFlag[] {
  const flags: MissionFlag[] = [];
  if (staticProfile.longestSameKindStreak.streak > MONOTONY_STREAK_THRESHOLD) flags.push('MONOTONY');
  if (dynamicProfile.avgLongestIdleStretchSeconds > LONGEST_IDLE_STRETCH_THRESHOLD_SECONDS) flags.push('IDLE_STRETCH');
  if (dynamicProfile.hasBoss && dynamicProfile.bossVictories > 0) {
    const share = dynamicProfile.bossWeaponKills / dynamicProfile.bossVictories;
    if (share < ANTICLIMAX_WEAPON_KILL_SHARE_THRESHOLD) flags.push('ANTICLIMAX');
  }
  if (
    dynamicProfile.runsWithFirstEvent > 0
    && dynamicProfile.avgFirstEventSeconds > SLOW_START_THRESHOLD_TICKS / TICKS_PER_SECOND
  ) {
    flags.push('SLOW_START');
  }
  return flags;
}

const FLAG_LABEL: Record<MissionFlag, string> = {
  MONOTONY: '⚠️ MONOTONY',
  IDLE_STRETCH: '⚠️ IDLE_STRETCH',
  ANTICLIMAX: '⚠️ ANTICLIMAX',
  SLOW_START: '⚠️ SLOW_START',
};

// ── Report ────────────────────────────────────────────────────────────────────

interface MissionPacingResult {
  missionId: string;
  name: string;
  static: StaticProfile;
  dynamic: DynamicProfile;
  flags: MissionFlag[];
}

function formatReport(results: MissionPacingResult[]): string {
  const lines: string[] = [
    '# Pacing Report',
    '',
    'Generated by `pnpm pacing`. Static columns come straight from `missions.ts` data ' +
      '(no simulation); dynamic columns are measured from real runs at the mission\'s ' +
      'intended/forced loadout with the `greedy` card strategy.',
    '',
    `| Mission | Longest same-kind streak | Longest idle stretch | Peak concurrency | First event | Boss weapon-kill share | Flags |`,
    `|---|---|---|---|---|---|---|`,
  ];
  for (const r of results) {
    const streak = `${r.static.longestSameKindStreak.kind || '—'} ×${String(r.static.longestSameKindStreak.streak)}`;
    const idleStretch = `${r.dynamic.avgLongestIdleStretchSeconds.toFixed(1)}s`;
    const peak = r.dynamic.avgPeakConcurrency.toFixed(1);
    const firstEvent = r.dynamic.runsWithFirstEvent > 0 ? `${r.dynamic.avgFirstEventSeconds.toFixed(1)}s` : '—';
    const bossShare = r.dynamic.hasBoss && r.dynamic.bossVictories > 0
      ? `${((r.dynamic.bossWeaponKills / r.dynamic.bossVictories) * 100).toFixed(0)}%`
      : '—';
    const flagLabels = r.flags.map((f) => FLAG_LABEL[f]).join(' ') || '';
    lines.push(`| ${r.missionId} | ${streak} | ${idleStretch} | ${peak} | ${firstEvent} | ${bossShare} | ${flagLabels} |`);
  }
  lines.push('');
  for (const r of results) {
    lines.push(`## ${r.missionId}: ${r.name}`);
    lines.push('');
    lines.push('Event tier sequence: ' + r.static.eventTiers.map((e) => `${e.kind}/${e.tier}`).join(' → '));
    lines.push('');
    lines.push(`Kind variety by time-third: ${r.static.kindVarietyByThird.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

interface JsonReport {
  missions: {
    missionId: string;
    longestSameKindStreak: StaticProfile['longestSameKindStreak'];
    kindVarietyByThird: StaticProfile['kindVarietyByThird'];
    avgLongestIdleStretchSeconds: number;
    avgPeakConcurrency: number;
    avgFirstEventSeconds: number | null;
    bossWeaponKillShare: number | null;
    flags: MissionFlag[];
  }[];
  anyFlagged: boolean;
}

function buildJsonReport(results: MissionPacingResult[]): JsonReport {
  const missions = results.map((r) => ({
    missionId: r.missionId,
    longestSameKindStreak: r.static.longestSameKindStreak,
    kindVarietyByThird: r.static.kindVarietyByThird,
    avgLongestIdleStretchSeconds: r.dynamic.avgLongestIdleStretchSeconds,
    avgPeakConcurrency: r.dynamic.avgPeakConcurrency,
    avgFirstEventSeconds: r.dynamic.runsWithFirstEvent > 0 ? r.dynamic.avgFirstEventSeconds : null,
    bossWeaponKillShare: r.dynamic.hasBoss && r.dynamic.bossVictories > 0
      ? r.dynamic.bossWeaponKills / r.dynamic.bossVictories
      : null,
    flags: r.flags,
  }));
  return { missions, anyFlagged: missions.some((m) => m.flags.length > 0) };
}

// ── Main ─────────────────────────────────────────────────────────────────────

interface CliOptions { runs: number; json: boolean; missionId: string | null }

function parseCliOptions(argv: string[]): CliOptions {
  const runsIdx = argv.indexOf('--runs');
  let runs = 300;
  if (runsIdx >= 0 && argv[runsIdx + 1] !== undefined) {
    const n = parseInt(argv[runsIdx + 1] ?? '', 10);
    if (Number.isFinite(n) && n > 0) runs = n;
  }
  const missionIdx = argv.indexOf('--mission');
  const missionId = missionIdx >= 0 ? (argv[missionIdx + 1] ?? null) : null;
  return { runs, json: argv.includes('--json'), missionId };
}

function main(): void {
  const options = parseCliOptions(process.argv.slice(2));
  const missions = options.missionId !== null ? [missionById(options.missionId)] : ALL_MISSIONS;

  const results: MissionPacingResult[] = missions.map((mission) => {
    const staticProfile = computeStaticProfile(mission);
    const dynamicProfile = computeDynamicProfile(mission, options.runs, 1);
    return {
      missionId: mission.id,
      name: mission.name,
      static: staticProfile,
      dynamic: dynamicProfile,
      flags: flagsFor(staticProfile, dynamicProfile),
    };
  });

  const report = formatReport(results);
  const outPath = new URL('./pacing-report.md', import.meta.url).pathname;
  writeFileSync(outPath, report, 'utf8');
  console.log(`Report written to tools/pacing-report.md`);

  const jsonReport = buildJsonReport(results);
  if (options.json) {
    const jsonPath = new URL('./pacing-report.json', import.meta.url).pathname;
    writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');
    console.log(`JSON report written to tools/pacing-report.json`);
  }

  console.log('\nQuick summary:');
  for (const r of results) {
    const icon = r.flags.length > 0 ? '⚠️' : '✓';
    console.log(`  ${icon} ${r.missionId.padEnd(4)} ${r.flags.join(', ')}`);
  }

  if (jsonReport.anyFlagged) {
    console.log('\n⚠️  One or more missions are flagged — see the report for detail.');
    process.exitCode = 1;
  }
}

main();
