// Pure viewmodel for ResultScene: victory/defeat, NEW! star marking, the tutorial
// branch, and which button set to show. Zero Phaser import.

import { TICKS_PER_SECOND } from '../core/constants';
import type { MissionResult } from '../core/result';
import type { StarFamily, StarSpec } from '../core/types';
import { missionById } from '../data/missions';

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
  | { kind: 'w0-branch' } // TUTORIAL / EXPLORE, persists firstBranchChoice
  | { kind: 'standard' }; // RETRY / MISSIONS / SHOP

export interface ResultViewModel {
  status: 'victory' | 'defeat';
  missionName: string;
  durationLabel: string; // "12.3s"
  coinsEarned: number;
  killsLine: string; // "5/8   (2 collided)" — collided clause conditional
  hullPercent: number; // 85 — renderer builds the aligned "HULL           85%" line
  isTutorial: boolean;
  stars: StarResultViewModel[]; // [] for tutorials
  buttons: ResultButtonSet;
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

/** newStarIds is NOT derivable from anywhere else — it's the delta computed by applyMissionResult. */
export function computeResultViewModel(result: MissionResult, newStarIds: string[]): ResultViewModel {
  if (result.status === 'running') {
    throw new Error(`computeResultViewModel: mission "${result.missionId}" is still running`);
  }
  const mission = missionById(result.missionId);
  const isTutorial = mission.forcedLoadout !== undefined;
  const killsLine = `${String(result.weaponKills)}/${String(result.spawned)}` +
    (result.collisions > 0 ? `   (${String(result.collisions)} collided)` : '');

  return {
    status: result.status,
    missionName: mission.name,
    durationLabel: `${(result.durationTicks / TICKS_PER_SECOND).toFixed(1)}s`,
    coinsEarned: result.coins,
    killsLine,
    hullPercent: Math.round(result.hullFraction * 100),
    isTutorial,
    stars: isTutorial ? [] : mission.stars.map((star) => ({
      id: star.id,
      shortName: starShortName(star),
      state: computeStarState(star.id, result.earnedStarIds, newStarIds),
    })),
    buttons: result.missionId === 'w0' && result.status === 'victory' ? { kind: 'w0-branch' } : { kind: 'standard' },
  };
}
