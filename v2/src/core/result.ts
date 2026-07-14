import { evaluateStars } from './stars';
import type { CoreState, MissionStatus } from './types';

export interface MissionResult {
  missionId: string;
  status: MissionStatus;
  durationTicks: number;
  earnedStarIds: string[];
  /** Kill coins + completion bonus. Full reward on every replay (player-never-stuck). */
  coins: number;
  hullFraction: number;
  weaponKills: number;
  spawned: number;
  collisions: number;
}

export function buildMissionResult(state: CoreState): MissionResult {
  if (state.status === 'running') {
    throw new Error(`Mission ${state.mission.id} is still running — no result yet`);
  }
  // status is 'victory' | 'defeat' here (the running case already threw above), so a
  // non-victory status is necessarily 'defeat' — completesOnDefeat covers that case.
  const completes = state.status === 'victory' || state.mission.completesOnDefeat === true;
  const completionBonus = completes ? state.mission.completionCoins : 0;
  return {
    missionId: state.mission.id,
    status: state.status,
    durationTicks: state.tick,
    earnedStarIds: evaluateStars(state),
    coins: state.stats.coinsEarned + completionBonus,
    hullFraction: state.ship.hull / state.ship.maxHull,
    weaponKills: state.stats.kills,
    spawned: state.spawnedCount,
    collisions: state.stats.collisions,
  };
}
