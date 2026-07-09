import type { CoreState, LoadoutSnapshot, RunModifiers, ShipSpec, WeaponSpec } from './types';

/** Loadout + card modifiers + timed boosts, folded once per use site (never recomputed). */
export interface EffectiveStats {
  weaponEquipped: boolean;
  weaponDamage: number;
  weaponInterval: number;
  weaponEnergyPerShot: number;
  weaponMaxTargets: number;
  weaponFalloff: number;
  rearWeaponEquipped: boolean;
  rearWeaponDamage: number;
  rearWeaponInterval: number;
  rearWeaponEnergyPerShot: number;
  rearWeaponMaxTargets: number;
  rearWeaponFalloff: number;
  sideWeaponEquipped: boolean;
  sideWeaponDamage: number;
  sideWeaponMaxTargets: number;
  sideWeaponFalloff: number;
  /** Charges granted at mission start; 0 when unequipped. */
  sideWeaponMaxCharges: number;
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

/** Front weapon fields — the only slot with fire-rate/energy modifier support. */
function computeWeaponStats(
  weapon: WeaponSpec | null, mods: RunModifiers, damageBoostMult: number, fireRateBoostMult: number,
): Pick<EffectiveStats, 'weaponEquipped' | 'weaponDamage' | 'weaponInterval' | 'weaponEnergyPerShot' | 'weaponMaxTargets' | 'weaponFalloff'> {
  return {
    weaponEquipped: weapon !== null,
    weaponDamage: weapon !== null ? weapon.damagePerShot * mods.weaponDamageMult * damageBoostMult : 0,
    weaponInterval: weapon !== null ? weapon.ticksBetweenShots * mods.fireIntervalMult / fireRateBoostMult : 0,
    weaponEnergyPerShot: weapon !== null ? weapon.energyPerShot * mods.weaponEnergyMult : 0,
    weaponMaxTargets: weapon !== null ? weapon.maxTargets + mods.extraPierce : 0,
    weaponFalloff: weapon !== null ? weapon.falloffPerTarget : 1,
  };
}

/** Rear weapon fields — auto-fire on a fixed interval, no card modifiers applied. */
function computeRearWeaponStats(
  rearWeapon: WeaponSpec | null, damageBoostMult: number,
): Pick<EffectiveStats, 'rearWeaponEquipped' | 'rearWeaponDamage' | 'rearWeaponInterval' | 'rearWeaponEnergyPerShot' | 'rearWeaponMaxTargets' | 'rearWeaponFalloff'> {
  return {
    rearWeaponEquipped: rearWeapon !== null,
    rearWeaponDamage: rearWeapon !== null ? rearWeapon.damagePerShot * damageBoostMult : 0,
    rearWeaponInterval: rearWeapon !== null ? rearWeapon.ticksBetweenShots : 0,
    rearWeaponEnergyPerShot: rearWeapon !== null ? rearWeapon.energyPerShot : 0,
    rearWeaponMaxTargets: rearWeapon !== null ? rearWeapon.maxTargets : 0,
    rearWeaponFalloff: rearWeapon !== null ? rearWeapon.falloffPerTarget : 1,
  };
}

/** Side weapon fields — manual-fire, no interval/energy (charges are consumed instead). */
function computeSideWeaponStats(
  sideWeapon: WeaponSpec | null, damageBoostMult: number,
): Pick<EffectiveStats, 'sideWeaponEquipped' | 'sideWeaponDamage' | 'sideWeaponMaxTargets' | 'sideWeaponFalloff' | 'sideWeaponMaxCharges'> {
  return {
    sideWeaponEquipped: sideWeapon !== null,
    sideWeaponDamage: sideWeapon !== null ? sideWeapon.damagePerShot * damageBoostMult : 0,
    sideWeaponMaxTargets: sideWeapon !== null ? sideWeapon.maxTargets : 0,
    sideWeaponFalloff: sideWeapon !== null ? sideWeapon.falloffPerTarget : 1,
    sideWeaponMaxCharges: sideWeapon?.maxCharges ?? 0,
  };
}

/** Ship passive fields — each ship overrides exactly one of these; the rest stay neutral. */
function computeShipPassiveStats(
  ship: ShipSpec,
): Pick<EffectiveStats, 'shipEnemyMissBonus' | 'shipCollisionDamageMult' | 'shipCoinMult' | 'shipCritMultOverride'> {
  return {
    shipEnemyMissBonus: ship.passiveKind === 'enemy-miss-bonus' ? ship.passiveValue : 0,
    shipCollisionDamageMult: ship.passiveKind === 'collision-reduction' ? ship.passiveValue : 1,
    shipCoinMult: ship.passiveKind === 'coin-bonus' ? ship.passiveValue : 1,
    shipCritMultOverride: ship.passiveKind === 'crit-mult-override' ? ship.passiveValue : null,
  };
}

export function computeEffectiveStats(
  loadout: LoadoutSnapshot,
  mods: RunModifiers,
  damageBoostMult = 1,
  fireRateBoostMult = 1,
  generatorBoostMult = 1,
): EffectiveStats {
  const { ship, weapon, rearWeapon, sideWeapon, shield, generator, motor } = loadout;
  const reactorMult = ship.passiveKind === 'generator-capacity-bonus' ? ship.passiveValue : 1;
  const generatorCapacity = generator.capacity * reactorMult + mods.generatorCapacityBonus;
  return {
    ...computeWeaponStats(weapon, mods, damageBoostMult, fireRateBoostMult),
    ...computeRearWeaponStats(rearWeapon, damageBoostMult),
    ...computeSideWeaponStats(sideWeapon, damageBoostMult),
    shieldCapacity: shield !== null ? (shield.capacity + mods.shieldCapacityBonus) * mods.shieldCapacityMult : 0,
    shieldPulseFraction: shield !== null ? shield.pulseShieldFraction * mods.shieldPulseMult : 0,
    generatorOutput: (generator.outputPerTick + mods.generatorOutputBonus) * generatorBoostMult,
    generatorCapacity,
    generatorPulseDrain: generator.pulseDrainFraction * generatorCapacity,
    motorTimelineMultiplier: motor.timelineMultiplier * mods.motorTimelineMult,
    motorDraw: motor.powerDrawPerTick * mods.motorDrawMult,
    ...computeShipPassiveStats(ship),
  };
}

/** Product of live damage-boost effects at the current tick. */
export function activeDamageMult(state: CoreState): number {
  let mult = 1;
  for (const effect of state.activeEffects) {
    if (effect.kind === 'damage-mult' && effect.expiresAtTick > state.tick) mult *= effect.multiplier;
  }
  return mult;
}

/** Product of live fire-rate-boost effects at the current tick (>1 = faster fire). */
export function activeFireRateMult(state: CoreState): number {
  let mult = 1;
  for (const effect of state.activeEffects) {
    if (effect.kind === 'fire-rate-mult' && effect.expiresAtTick > state.tick) mult *= effect.multiplier;
  }
  return mult;
}

/** Product of live generator-output-boost effects at the current tick. */
export function activeGeneratorMult(state: CoreState): number {
  let mult = 1;
  for (const effect of state.activeEffects) {
    if (effect.kind === 'generator-mult' && effect.expiresAtTick > state.tick) mult *= effect.multiplier;
  }
  return mult;
}

/** True when the ship has an active invulnerability effect. */
export function isInvulnerable(state: CoreState): boolean {
  return state.activeEffects.some((e) => e.kind === 'invulnerable' && e.expiresAtTick > state.tick);
}
