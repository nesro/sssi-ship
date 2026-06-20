import type { CoreState, StarSpec } from './types';

/**
 * Evaluates every benchmark star against the finished run (§3.4). All families are
 * checked per run — a single run can earn several stars at once. Defeats earn none.
 */
export function evaluateStars(state: CoreState): string[] {
  if (state.status !== 'victory') return [];
  return state.mission.stars.filter((star) => starEarned(state, star)).map((star) => star.id);
}

function starEarned(state: CoreState, star: StarSpec): boolean {
  switch (star.family) {
    case 'boss-time':
      return state.bossKillTick !== null && state.bossKillTick <= star.threshold;
    case 'finish-time':
      return state.tick <= star.threshold;
    case 'hull-above':
      return state.ship.hull / state.ship.maxHull >= star.threshold;
    case 'all-kills':
      // Collisions are not kills — enduring builds trade this star for speed.
      return state.stats.kills === state.spawnedCount;
    case 'shield-unbroken':
      return !state.shieldBroke;
  }
}
