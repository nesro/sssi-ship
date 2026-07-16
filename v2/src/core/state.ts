import { REROLLS_PER_MISSION } from './constants';
import { mulberry32 } from './rng';
import { computeEffectiveStats, defaultModifiers } from './stats';
import type { AbilityDefinition, CoreState, LoadoutSnapshot, MissionSpec } from './types';

/** Builds the initial core state for a mission run. Pure given (mission, loadout, seed). */
export function createCoreState(
  mission: MissionSpec,
  loadout: LoadoutSnapshot,
  seed: number,
  abilityPool: AbilityDefinition[] = [],
): CoreState {
  const modifiers = defaultModifiers();
  const stats = computeEffectiveStats(loadout, modifiers);
  return {
    seed,
    tick: 0,
    timelineTick: 0,
    nextEventIndex: 0,
    nextEnemyId: 1,
    status: 'running',
    ship: {
      hull: loadout.ship.hull,
      maxHull: loadout.ship.hull,
      // Start empty: the player watches the generator fill energy and then pulse the
      // shield up step by step. Starting full would hide the core mechanic entirely.
      shield: 0,
      energy: 0,
      fireTimer: stats.weaponInterval,
      rearFireTimer: stats.rearWeaponInterval > 0 ? stats.rearWeaponInterval : 1,
      sideWeaponCharges: stats.sideWeaponMaxCharges,
    },
    enemies: [],
    stats: { shotsFired: 0, rearShotsFired: 0, sideShotsFired: 0, damageDealt: 0, kills: 0, collisions: 0, coinsEarned: 0 },
    rng: mulberry32(seed),
    loadout,
    mission,
    abilityPool,
    modifiers,
    pickedAbilityIds: [],
    abilityActions: [],
    pendingOffer: null,
    autoFireEnabled: true,
    rearWeaponEnabled: true,
    autoShieldEnabled: true,
    priorityTargetId: null,
    equippedAbilities: [],
    rerollsLeft: REROLLS_PER_MISSION + (loadout.motor.bonusRerollsPerMission ?? 0),
    supportCallsDone: 0,
    bonusCallsPending: 0,
    shotCounter: 0,
    supplies: loadout.supplies.map((supply) => ({
      spec: supply.spec,
      chargesLeft: supply.charges,
    })),
    activeEffects: [],
    boostTaps: [],
    sideWeaponTaps: [],
    priorityTargetTaps: [],
    bossKillTick: null,
    shieldBroke: false,
    spawnedCount: 0,
    consecutiveKills: 0,
    wavesClearedThisRun: 0,
    pendingVisualEvents: [],
    pendingNarrator: null,
    firedNarratorTicks: [],
  };
}
