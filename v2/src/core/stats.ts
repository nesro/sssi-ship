import type { CoreState, LoadoutSnapshot, RunModifiers } from './types';

/** Loadout + card modifiers + timed boosts, folded once per use site (never recomputed). */
export interface EffectiveStats {
  weaponEquipped: boolean;
  weaponDamage: number;
  weaponInterval: number;
  weaponEnergyPerShot: number;
  weaponMaxTargets: number;
  weaponFalloff: number;
  shieldCapacity: number;
  /** Effective fraction of shieldCapacity restored per generator pulse (after card mods). */
  shieldPulseFraction: number;
  generatorOutput: number;
  generatorCapacity: number;
  /** Energy drained from generator when a shield pulse fires. */
  generatorPulseDrain: number;
  motorTimelineMultiplier: number;
  motorDraw: number;
  /** Interceptor: added to each enemy's missChance when rolling their shots. */
  shipEnemyMissBonus: number;
  /** Tanker: multiplied with collision damage (0.5 = half; 1.0 = no change). */
  shipCollisionDamageMult: number;
  /** Salvager: multiplied with coin rewards on kill (1.5 = +50%; 1.0 = no change). */
  shipCoinMult: number;
  /** Warship: overrides player weapon critMult when non-null. */
  shipCritMultOverride: number | null;
}

export function defaultModifiers(): RunModifiers {
  return {
    weaponDamageMult: 1,
    fireIntervalMult: 1,
    weaponEnergyMult: 1,
    extraPierce: 0,
    energyPerHit: 0,
    overchargeEvery: 0,
    overchargeRefund: false,
    shieldPulseMult: 1,
    shieldCapacityBonus: 0,
    shieldCapacityMult: 1,
    generatorOutputBonus: 0,
    generatorCapacityBonus: 0,
    motorTimelineMult: 1,
    motorDrawMult: 1,
    blockerDamageMult: 1,
    bossDamageMult: 1,
    highHpEnemyDamageMult: 1,
    killExplosionDamage: 0,
    fullEnergyDmgBonus: 0,
    lowHullDmgMult: 1,
    singleEnemyDmgBonus: 0,
    shieldActiveDmgBonus: 0,
    noShieldPierceAll: false,
    manyEnemiesExtraTargets: 0,
    earlyBirdDmgBonus: 0,
    finalPushDmgBonus: 0,
    lowHullFireRateMult: 1,
    highHullGenBonus: 0,
    bossAliveGenBonus: 0,
    freeEveryNthShot: 0,
    nthShotShieldInterval: 0,
    nthShotShieldAmount: 0,
    nthKillShieldInterval: 0,
    nthKillShieldAmount: 0,
    extraEnergyOnBlockerKill: 0,
    nthWaveClearRefillInterval: 0,
    killDmgPerKillPct: 0,
    momentumDmgPerKillPct: 0,
    hullPerKill: 0,
    coinsEnergyRestore: 0,
    energyPerPulse: 0,
    blockerCoinMult: 1,
    hullDamagePerShot: 0,
    shotRandomnessFraction: 0,
    haywireTargeting: false,
    volatileCoreLosePct: 0,
  };
}

export function computeEffectiveStats(
  loadout: LoadoutSnapshot,
  mods: RunModifiers,
  damageBoostMult = 1,
): EffectiveStats {
  const { ship, weapon, shield, generator, motor } = loadout;
  const reactorMult = ship.passiveKind === 'generator-capacity-bonus' ? ship.passiveValue : 1;
  const generatorCapacity = generator.capacity * reactorMult + mods.generatorCapacityBonus;
  return {
    weaponEquipped: weapon !== null,
    weaponDamage: weapon !== null ? weapon.damagePerShot * mods.weaponDamageMult * damageBoostMult : 0,
    weaponInterval: weapon !== null ? weapon.ticksBetweenShots * mods.fireIntervalMult : 0,
    weaponEnergyPerShot: weapon !== null ? weapon.energyPerShot * mods.weaponEnergyMult : 0,
    weaponMaxTargets: weapon !== null ? weapon.maxTargets + mods.extraPierce : 0,
    weaponFalloff: weapon !== null ? weapon.falloffPerTarget : 1,
    shieldCapacity: (shield.capacity + mods.shieldCapacityBonus) * mods.shieldCapacityMult,
    shieldPulseFraction: shield.pulseShieldFraction * mods.shieldPulseMult,
    generatorOutput: generator.outputPerTick + mods.generatorOutputBonus,
    generatorCapacity,
    generatorPulseDrain: generator.pulseDrainFraction * generatorCapacity,
    motorTimelineMultiplier: motor.timelineMultiplier * mods.motorTimelineMult,
    motorDraw: motor.powerDrawPerTick * mods.motorDrawMult,
    shipEnemyMissBonus: ship.passiveKind === 'enemy-miss-bonus' ? ship.passiveValue : 0,
    shipCollisionDamageMult: ship.passiveKind === 'collision-reduction' ? ship.passiveValue : 1,
    shipCoinMult: ship.passiveKind === 'coin-bonus' ? ship.passiveValue : 1,
    shipCritMultOverride: ship.passiveKind === 'crit-mult-override' ? ship.passiveValue : null,
  };
}

/** Product of live damage-boost effects (reserve supplies) at the current tick. */
export function activeDamageMult(state: CoreState): number {
  let mult = 1;
  for (const effect of state.activeEffects) {
    if (effect.expiresAtTick > state.tick) mult *= effect.multiplier;
  }
  return mult;
}
