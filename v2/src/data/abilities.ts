import type { AbilityDefinition, CoreState, RunModifiers } from '../core/types';

// ── Nexus Armaments — weapon company ────────────────────────────────────────

/** NEXUS OVERLOAD (active): 2× damage burst for ~5 s. */
const nexusOverload: AbilityDefinition = {
  id: 'nexus-overload',
  name: 'NEXUS OVERLOAD',
  description: 'Active: ×2 damage for 5 s (40e, 5 s cd)',
  company: 'nexus',
  kind: 'active',
  energyCost: 40,
  cooldownTicks: 50,
  unique: true,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'damage-mult', multiplier: 2, expiresAtTick: state.tick + 50 });
  },
};

/** BARRAGE MODE (active): faster fire for ~4 s. */
const barrageMode: AbilityDefinition = {
  id: 'nexus-barrage',
  name: 'BARRAGE MODE',
  description: 'Active: ×2 fire rate for 4 s (30e, 8 s cd)',
  company: 'nexus',
  kind: 'active',
  energyCost: 30,
  cooldownTicks: 80,
  unique: true,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'fire-rate-mult', multiplier: 2, expiresAtTick: state.tick + 40 });
  },
};

/** ARMOUR BREAKER (passive): +50 % damage vs armoured (high-HP) enemies. */
const armourBreaker: AbilityDefinition = {
  id: 'nexus-armour-breaker',
  name: 'ARMOUR BREAKER',
  description: 'Passive: +50 % damage vs enemies above 50 % HP',
  company: 'nexus',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    highHpEnemyDamageMult: mods.highHpEnemyDamageMult * 1.5,
  }),
};

/** BLOCKER BANE (passive): +60 % damage vs blocker enemies. */
const blockerBane: AbilityDefinition = {
  id: 'nexus-blocker-bane',
  name: 'BLOCKER BANE',
  description: 'Passive: +60 % damage vs blocker enemies',
  company: 'nexus',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    blockerDamageMult: mods.blockerDamageMult * 1.6,
  }),
};

/** SHRAPNEL KILL (passive): each kill explodes for 8 AoE damage. */
const shrapnelKill: AbilityDefinition = {
  id: 'nexus-shrapnel',
  name: 'SHRAPNEL KILL',
  description: 'Passive: kills deal 8 AoE damage to nearby enemies',
  company: 'nexus',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    killExplosionDamage: mods.killExplosionDamage + 8,
  }),
};

// ── Aegis Defense — shield company ──────────────────────────────────────────

/** AEGIS BARRIER (active): full invulnerability for ~2 s. */
const aegisBarrier: AbilityDefinition = {
  id: 'aegis-barrier',
  name: 'AEGIS BARRIER',
  description: 'Active: invulnerable for 2 s (50e, 6 s cd)',
  company: 'aegis',
  kind: 'active',
  energyCost: 50,
  cooldownTicks: 60,
  unique: true,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'invulnerable', expiresAtTick: state.tick + 20 });
  },
};

/** RESONANCE PULSE (active): invulnerable for ~1 s — short but cheap. */
const resonancePulse: AbilityDefinition = {
  id: 'aegis-resonance-pulse',
  name: 'RESONANCE PULSE',
  description: 'Active: invulnerable for 1 s (20e, 3 s cd)',
  company: 'aegis',
  kind: 'active',
  energyCost: 20,
  cooldownTicks: 30,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'invulnerable', expiresAtTick: state.tick + 10 });
  },
};

/** HULL RECOVERY (passive): restore 1 hull HP per kill. */
const hullRecovery: AbilityDefinition = {
  id: 'aegis-hull-recovery',
  name: 'HULL RECOVERY',
  description: 'Passive: +1 hull HP restored per kill',
  company: 'aegis',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    hullPerKill: mods.hullPerKill + 1,
  }),
};

/** SHIELD RESONANCE (passive): +40 % shield pulse strength. */
const shieldResonance: AbilityDefinition = {
  id: 'aegis-shield-resonance',
  name: 'SHIELD RESONANCE',
  description: 'Passive: shield pulses restore +40 % more shield',
  company: 'aegis',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    shieldPulseMult: mods.shieldPulseMult * 1.4,
  }),
};

/** GUARDIAN SYNC (passive): +25 % weapon damage while shield is active. */
const guardianSync: AbilityDefinition = {
  id: 'aegis-guardian-sync',
  name: 'GUARDIAN SYNC',
  description: 'Passive: +25% damage while shield is above 0',
  company: 'aegis',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    shieldActiveDmgBonus: mods.shieldActiveDmgBonus + 0.25,
  }),
};

// ── Quantum Power — generator company ───────────────────────────────────────

/** POWER SURGE (active): 3× generator output for ~3 s. */
const powerSurge: AbilityDefinition = {
  id: 'quantum-power-surge',
  name: 'POWER SURGE',
  description: 'Active: ×3 generator output for 3 s (35e, 6 s cd)',
  company: 'quantum',
  kind: 'active',
  energyCost: 35,
  cooldownTicks: 60,
  unique: true,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'generator-mult', multiplier: 3, expiresAtTick: state.tick + 30 });
  },
};

/** ENERGY OVERDRIVE (active): 2× generator output for ~4 s — longer but weaker. */
const energyOverdrive: AbilityDefinition = {
  id: 'quantum-energy-overdrive',
  name: 'ENERGY OVERDRIVE',
  description: 'Active: ×2 generator output for 4 s (25e, 4 s cd)',
  company: 'quantum',
  kind: 'active',
  energyCost: 25,
  cooldownTicks: 40,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'generator-mult', multiplier: 2, expiresAtTick: state.tick + 40 });
  },
};

/** EFFICIENCY CORE (passive): weapon shots cost 20 % less energy. */
const efficiencyCore: AbilityDefinition = {
  id: 'quantum-efficiency-core',
  name: 'EFFICIENCY CORE',
  description: 'Passive: weapon energy cost ×0.8',
  company: 'quantum',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    weaponEnergyMult: mods.weaponEnergyMult * 0.8,
  }),
};

/** PULSE AMPLIFIER (passive): each shield pulse earns 5 energy. */
const pulseAmplifier: AbilityDefinition = {
  id: 'quantum-pulse-amplifier',
  name: 'PULSE AMPLIFIER',
  description: 'Passive: each shield pulse restores +5 energy',
  company: 'quantum',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    energyPerPulse: mods.energyPerPulse + 5,
  }),
};

/** FULL CHARGE BONUS (passive): +30 % damage at max energy. */
const fullChargeBonus: AbilityDefinition = {
  id: 'quantum-full-charge',
  name: 'FULL CHARGE BONUS',
  description: 'Passive: +30% damage when energy is full',
  company: 'quantum',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    fullEnergyDmgBonus: mods.fullEnergyDmgBonus + 0.3,
  }),
};

// ── Comet Drive — motor company ──────────────────────────────────────────────

/** SPEED BURST (active): 2× fire rate for ~4 s. */
const speedBurst: AbilityDefinition = {
  id: 'comet-speed-burst',
  name: 'SPEED BURST',
  description: 'Active: ×2 fire rate for 4 s (30e, 5 s cd)',
  company: 'comet',
  kind: 'active',
  energyCost: 30,
  cooldownTicks: 50,
  unique: true,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'fire-rate-mult', multiplier: 2, expiresAtTick: state.tick + 40 });
  },
};

/** TIMELINE RUSH (active): brief 2× fire rate push for ~2 s — cheap sprint. */
const timelineRush: AbilityDefinition = {
  id: 'comet-timeline-rush',
  name: 'TIMELINE RUSH',
  description: 'Active: ×2 fire rate for 2 s (20e, 7 s cd)',
  company: 'comet',
  kind: 'active',
  energyCost: 20,
  cooldownTicks: 70,
  activate: (state: CoreState): void => {
    state.activeEffects.push({ kind: 'fire-rate-mult', multiplier: 2, expiresAtTick: state.tick + 20 });
  },
};

/** MOTOR EFFICIENCY (passive): motor power draw reduced by 25 %. */
const motorEfficiency: AbilityDefinition = {
  id: 'comet-motor-efficiency',
  name: 'MOTOR EFFICIENCY',
  description: 'Passive: motor power draw ×0.75',
  company: 'comet',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    motorDrawMult: mods.motorDrawMult * 0.75,
  }),
};

/** EARLY ASSAULT (passive): +35 % damage in the first 25 % of the mission. */
const earlyAssault: AbilityDefinition = {
  id: 'comet-early-assault',
  name: 'EARLY ASSAULT',
  description: 'Passive: +35% damage in the first 25 % of the mission',
  company: 'comet',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    earlyBirdDmgBonus: mods.earlyBirdDmgBonus + 0.35,
  }),
};

/** LAST LAP PUSH (passive): +40 % damage in the final 25 % of the mission. */
const lastLapPush: AbilityDefinition = {
  id: 'comet-last-lap',
  name: 'LAST LAP PUSH',
  description: 'Passive: +40% damage in the final 25 % of the mission',
  company: 'comet',
  kind: 'passive',
  apply: (mods: RunModifiers): RunModifiers => ({
    ...mods,
    finalPushDmgBonus: mods.finalPushDmgBonus + 0.4,
  }),
};

// ── Exports ──────────────────────────────────────────────────────────────────

export const ALL_NEW_ABILITIES: AbilityDefinition[] = [
  // nexus
  nexusOverload,
  barrageMode,
  armourBreaker,
  blockerBane,
  shrapnelKill,
  // aegis
  aegisBarrier,
  resonancePulse,
  hullRecovery,
  shieldResonance,
  guardianSync,
  // quantum
  powerSurge,
  energyOverdrive,
  efficiencyCore,
  pulseAmplifier,
  fullChargeBonus,
  // comet
  speedBurst,
  timelineRush,
  motorEfficiency,
  earlyAssault,
  lastLapPush,
];
