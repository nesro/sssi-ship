// Pure viewmodel for ResultScene: victory/defeat, NEW! star marking, and which button
// set to show. Zero Phaser import.

import { TICKS_PER_SECOND } from '../core/constants';
import type { MissionResult } from '../core/result';
import type { StarFamily, StarSpec } from '../core/types';
import { DAILY_MISSION_ID } from '../data/dailyMission';
import { MISSION_UNLOCK_EDGES, missionById } from '../data/missions';

export interface StarResultViewModel {
  id: string;
  shortName: string; // e.g. "UNDER 186S" — a player-readable label, not the raw star id
  // 'new' iff earned this run and not previously earned; 'earned' iff earned this run
  // but already had it; 'unearned' otherwise. Derived entirely from `result` +
  // `newStarIds` — NEVER from save.missionStars history (that's ever-earned, not
  // this-run state), matching ResultScene.ts's real starLines() function.
  state: 'new' | 'earned' | 'unearned';
}

export type ResultButtonSet =
  | { kind: 'standard' } // RETRY / MISSIONS / SHOP
  | { kind: 'daily' } // MISSIONS only — no RETRY on a once-per-day attempt
  | { kind: 'defeat-shop-redirect' }; // GO TO SHOP only — a mission's defeatHint fix lives there

export interface ResultViewModel {
  status: 'victory' | 'defeat';
  /** Display-only outcome, derived from `status` + the daily mission's voluntary-abandon
   * flag — 'abandoned' iff `status === 'defeat'` AND the player chose to quit with a live
   * ship (never derived from `wasAbandoned` alone, so a stray/misused flag can't relabel
   * a real victory). `status` stays the single source of truth for scoring/star logic —
   * this field exists only so ResultScene can tell "you died" apart from "you left" for
   * its title/animation, without conflating the two in the one field every other
   * consumer (stars, coins, buttons) already relies on meaning exactly what it says. */
  outcome: 'victory' | 'defeat' | 'abandoned';
  missionName: string;
  durationLabel: string; // "12.3s"
  coinsEarned: number;
  killsLine: string; // "5/8   (2 collided)" — collided clause conditional
  hullPercent: number; // 85 — renderer builds the aligned "HULL           85%" line
  isTutorial: boolean;
  stars: StarResultViewModel[]; // [] for tutorials
  buttons: ResultButtonSet;
  /** Shown on defeat only, when the mission defines one — see `MissionSpec.defeatHint`. */
  defeatHint?: string;
  /** Present only for the daily mission — CombatScene passes the actual wallet deposit
   * (SaveManager's applyDailyResult already applied DAILY_COIN_MULT to result.coins) so
   * `coinsEarned` above reflects reality, plus whether this run set a new personal best. */
  daily?: { isNewBest: boolean };
  /** The mission a NEXT MISSION button should start, or null if none applies. Only
   * meaningful when `buttons.kind === 'standard'` (the view never renders a NEXT
   * MISSION button otherwise), but computed unconditionally here since it's cheap and
   * correct either way. A mission "completes" (unlocks its MISSION_UNLOCK_EDGES
   * targets) on victory, or — tutorials only — on defeat too (`completesOnDefeat`);
   * every mission has exactly one outgoing edge in the current forced chain
   * (t1→t2→t3→t4→m1→…→m6), so `.find()` never has more than one match to pick from. */
  nextMissionId: string | null;
}

/** Player-facing label built from the star's actual requirement, not its data id — the
 * old `id.split('-').slice(1).join('-').toUpperCase()` just uppercased whatever the
 * mission author happened to name the id (e.g. "m1-time-t1" -> "TIME-T1"), which told a
 * player nothing about what they needed to do. */
function starShortName(star: StarSpec): string {
  const seconds = (ticks: number): string => String(Math.round(ticks / TICKS_PER_SECOND));
  const family: StarFamily = star.family;
  switch (family) {
    case 'hull-above': return `HULL ${String(Math.round(star.threshold * 100))}%+`;
    case 'all-kills': return 'ALL KILLS';
    case 'shield-unbroken': return 'SHIELD UNBROKEN';
    case 'finish-time': return `UNDER ${seconds(star.threshold)}S`;
    case 'boss-time': return `BOSS UNDER ${seconds(star.threshold)}S`;
  }
}

function computeStarState(id: string, earnedStarIds: string[], newStarIds: string[]): StarResultViewModel['state'] {
  if (newStarIds.includes(id)) return 'new';
  if (earnedStarIds.includes(id)) return 'earned';
  return 'unearned';
}

/**
 * newStarIds is NOT derivable from anywhere else — it's the delta computed by
 * applyMissionResult. `dailyBonus` is likewise CombatScene/applyDailyResult's own
 * output (the actual coins deposited, post DAILY_COIN_MULT, and whether this run beat
 * the prior best) — result.coins alone is the raw score, not what landed in the wallet.
 */
export function computeResultViewModel(
  result: MissionResult, newStarIds: string[], dailyBonus?: { coinsAwarded: number; isNewBest: boolean },
  wasAbandoned?: boolean,
): ResultViewModel {
  if (result.status === 'running') {
    throw new Error(`computeResultViewModel: mission "${result.missionId}" is still running`);
  }
  const mission = missionById(result.missionId);
  const isTutorial = mission.campaign === 'tutorial';
  const isDaily = result.missionId === DAILY_MISSION_ID;
  const killsLine = `${String(result.weaponKills)}/${String(result.spawned)}` +
    (result.collisions > 0 ? `   (${String(result.collisions)} collided)` : '');
  const completed = result.status === 'victory' || mission.completesOnDefeat === true;
  const nextMissionId = completed
    ? MISSION_UNLOCK_EDGES.find(([from]) => from === result.missionId)?.[1] ?? null
    : null;

  return {
    status: result.status,
    outcome: result.status === 'defeat' && wasAbandoned === true ? 'abandoned' : result.status,
    missionName: mission.name,
    durationLabel: `${(result.durationTicks / TICKS_PER_SECOND).toFixed(1)}s`,
    coinsEarned: dailyBonus?.coinsAwarded ?? result.coins,
    killsLine,
    hullPercent: Math.round(result.hullFraction * 100),
    isTutorial,
    stars: isTutorial ? [] : mission.stars.map((star) => ({
      id: star.id,
      shortName: starShortName(star),
      state: computeStarState(star.id, result.earnedStarIds, newStarIds),
    })),
    // A tutorial's defeatHint marks a mission whose fix genuinely lives in the shop
    // (a free gear swap, not a retry-and-hope) — its defeat screen skips RETRY/MISSIONS
    // entirely and sends the player straight there, matching the mission's own design.
    buttons: isTutorial && result.status === 'defeat' && mission.defeatHint !== undefined
      ? { kind: 'defeat-shop-redirect' }
      : (isDaily ? { kind: 'daily' } : { kind: 'standard' }),
    ...(result.status === 'defeat' && mission.defeatHint !== undefined ? { defeatHint: mission.defeatHint } : {}),
    ...(dailyBonus !== undefined ? { daily: { isNewBest: dailyBonus.isNewBest } } : {}),
    nextMissionId,
  };
}
