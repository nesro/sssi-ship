import type { CardDefinition, CoreState, RunModifiers } from '../core/types';

// Helper for flat-modifier cards
function flat(
  id: string,
  system: CardDefinition['system'],
  name: string,
  description: string,
  apply: (mods: RunModifiers) => RunModifiers,
): CardDefinition {
  return { id, system, name, description, apply };
}

// Chain ids
const CHAIN_PIERCE = 'pierce';
const CHAIN_OVERCHARGE = 'overcharge';
const CHAIN_RESONANCE = 'resonance';
const CHAIN_BERSERKER = 'berserker';

// ── Flat boosts ───────────────────────────────────────────────────────────────
const FLAT_BOOSTS: CardDefinition[] = [
  flat('w-dmg-15', 'weapon', 'FOCUS LENS', '+15% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.15 })),
  flat('w-dmg-30', 'weapon', 'PRISM CORE', '+30% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.3 })),
  flat('w-dmg-50', 'weapon', 'SNIPER CORE', '+50% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.5 })),
  flat('w-rate-13', 'weapon', 'RAPID CYCLER', '13% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.87 })),
  flat('w-rate-20', 'weapon', 'TWIN ACTUATOR', '20% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.8 })),
  flat('w-rate-30', 'weapon', 'TRIPLE ACTUATOR', '30% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.7 })),
  flat('w-cost-25', 'weapon', 'COOL BARREL', 'Shots cost 25% less energy',
    (m) => ({ ...m, weaponEnergyMult: m.weaponEnergyMult * 0.75 })),
  flat('w-cost-40', 'weapon', 'ICE BARREL', 'Shots cost 40% less energy',
    (m) => ({ ...m, weaponEnergyMult: m.weaponEnergyMult * 0.6 })),
  flat('s-pulse-25', 'shield', 'HARMONIC TUNER', '+25% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.25 })),
  flat('s-pulse-40', 'shield', 'FIELD WEAVER', '+40% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.4 })),
  flat('s-pulse-60', 'shield', 'RESONANCE WEAVER', '+60% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.6 })),
  flat('s-cap-15', 'shield', 'WIDE PROJECTOR', '+15 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 15 })),
  flat('s-cap-20', 'shield', 'HEAVY PLATING', '+20 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 20 })),
  flat('s-cap-30', 'shield', 'MEGA PLATING', '+30 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 30 })),
  flat('g-out-04', 'generator', 'SPARE CELL', '+4 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.4 })),
  flat('g-out-08', 'generator', 'FUSION TAP', '+8 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.8 })),
  flat('g-out-12', 'generator', 'PLASMA TAP', '+12 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 1.2 })),
  flat('g-cap-15', 'generator', 'BUFFER BANK', '+15 energy capacity',
    (m) => ({ ...m, generatorCapacityBonus: m.generatorCapacityBonus + 15 })),
  flat('g-cap-30', 'generator', 'DEEP CELL', '+30 energy capacity',
    (m) => ({ ...m, generatorCapacityBonus: m.generatorCapacityBonus + 30 })),
  flat('m-over-20', 'motor', 'OVERDRIVE', '+20% mission speed',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.2 })),
  flat('m-over-35', 'motor', 'AFTERBURNER', '+35% mission speed',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.35 })),
  flat('m-eff-50', 'motor', 'FRICTIONLESS HUB', 'Motor draws 50% less power',
    (m) => ({ ...m, motorDrawMult: m.motorDrawMult * 0.5 })),
];

// ── Situational (per-target multipliers) ──────────────────────────────────────
const SITUATIONAL: CardDefinition[] = [
  flat('sit-demolisher', 'weapon', 'DEMOLISHER', '+100% damage to blocker enemies',
    (m) => ({ ...m, blockerDamageMult: m.blockerDamageMult * 2 })),
  flat('sit-boss-hunter', 'weapon', 'BOSS HUNTER', '+80% damage to boss enemies',
    (m) => ({ ...m, bossDamageMult: m.bossDamageMult * 1.8 })),
  flat('sit-armor-pierce', 'weapon', 'ARMOR PIERCE', '+60% damage to enemies above 50% HP',
    (m) => ({ ...m, highHpEnemyDamageMult: m.highHpEnemyDamageMult * 1.6 })),
  flat('sit-swarm-killer', 'weapon', 'SWARM KILLER', 'Each kill deals 5 AoE damage to all others',
    (m) => ({ ...m, killExplosionDamage: m.killExplosionDamage + 5 })),
  flat('sit-early-bird', 'weapon', 'EARLY BIRD', '+40% damage in first 25% of mission',
    (m) => ({ ...m, earlyBirdDmgBonus: m.earlyBirdDmgBonus + 0.4 })),
  flat('sit-final-push', 'weapon', 'FINAL PUSH', '+40% damage in last 25% of mission',
    (m) => ({ ...m, finalPushDmgBonus: m.finalPushDmgBonus + 0.4 })),
  flat('sit-swarm-sense', 'weapon', 'SWARM SENSE', 'Shots hit 3 extra enemies when 6+ are present',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 3 })),
  flat('sit-demolisher-2', 'weapon', 'HEAVY DEMO', '+150% damage to blockers',
    (m) => ({ ...m, blockerDamageMult: m.blockerDamageMult * 2.5 })),
];

// ── Conditional damage ────────────────────────────────────────────────────────
const CONDITIONAL: CardDefinition[] = [
  flat('cond-full-energy', 'weapon', 'FULL CHARGE', '+30% damage while at max energy',
    (m) => ({ ...m, fullEnergyDmgBonus: m.fullEnergyDmgBonus + 0.3 })),
  flat('cond-full-energy-2', 'weapon', 'OVERCHARGED', '+50% damage while at max energy',
    (m) => ({ ...m, fullEnergyDmgBonus: m.fullEnergyDmgBonus + 0.5 })),
  flat('cond-low-hull', 'weapon', 'LAST STAND', '×2.5 damage while hull < 30%',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 2.5 })),
  flat('cond-single-enemy', 'weapon', 'FOCUS FIRE', '+60% damage while only 1 enemy on screen',
    (m) => ({ ...m, singleEnemyDmgBonus: m.singleEnemyDmgBonus + 0.6 })),
  flat('cond-no-shield', 'weapon', 'DESPERATE FIRE', 'Shots pierce all enemies while shield = 0',
    (m) => ({ ...m, noShieldPierceAll: true })),
  flat('cond-high-hull-gen', 'generator', 'PRISTINE HULL', '+50% generator output while hull > 80%',
    (m) => ({ ...m, highHullGenBonus: m.highHullGenBonus + 0.5 })),
  flat('cond-boss-gen', 'generator', 'BOSS FOCUS', '+80% generator output while a boss is alive',
    (m) => ({ ...m, bossAliveGenBonus: m.bossAliveGenBonus + 0.8 })),
  flat('cond-many-enemies', 'weapon', 'SWARM MIND', '+4 extra targets when 6+ enemies on screen',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 4 })),
];

// ── Counter (every N-th event something happens) ──────────────────────────────
const COUNTER: CardDefinition[] = [
  flat('cnt-bounty', 'shield', 'BOUNTY', 'Every 3rd kill: restore 10 shield',
    (m) => ({ ...m, nthKillShieldInterval: m.nthKillShieldInterval === 0 ? 3 : m.nthKillShieldInterval, nthKillShieldAmount: m.nthKillShieldAmount + 10 })),
  flat('cnt-power-sink', 'generator', 'POWER SINK', 'Blocker kills restore 30 energy',
    (m) => ({ ...m, extraEnergyOnBlockerKill: m.extraEnergyOnBlockerKill + 30 })),
  flat('cnt-drain-cycle', 'shield', 'DRAIN CYCLE', 'Every 8th shot: restore 10 shield',
    (m) => ({ ...m, nthShotShieldInterval: m.nthShotShieldInterval === 0 ? 8 : m.nthShotShieldInterval, nthShotShieldAmount: m.nthShotShieldAmount + 10 })),
  flat('cnt-phantom-shot', 'weapon', 'PHANTOM SHOT', 'Every 8th shot costs 0 energy',
    (m) => ({ ...m, freeEveryNthShot: m.freeEveryNthShot === 0 ? 8 : m.freeEveryNthShot })),
  flat('cnt-breaker-bonus', 'generator', 'BREAKER BONUS', 'Blocker kills restore 20 energy',
    (m) => ({ ...m, extraEnergyOnBlockerKill: m.extraEnergyOnBlockerKill + 20 })),
  flat('cnt-windmill', 'generator', 'WINDMILL', 'Every 4th wave clear: energy refills completely',
    (m) => ({ ...m, nthWaveClearRefillInterval: m.nthWaveClearRefillInterval === 0 ? 4 : m.nthWaveClearRefillInterval })),
];

// ── Accumulate (grow stronger through the run) ────────────────────────────────
const ACCUMULATE: CardDefinition[] = [
  flat('acc-killcount', 'weapon', 'KILLCOUNT', '+0.5% weapon damage per kill this mission',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 0.5 })),
  flat('acc-killcount-2', 'weapon', 'EXTINCTION', '+1% weapon damage per kill this mission',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 1 })),
  flat('acc-momentum', 'weapon', 'MOMENTUM', '+3% damage per consecutive kill; resets on hull hit',
    (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 3 })),
  flat('acc-leech', 'shield', 'LEECH HULL', 'Each kill restores 1 hull HP',
    (m) => ({ ...m, hullPerKill: m.hullPerKill + 1 })),
];

// ── Trade (visible cost, visible gain) ───────────────────────────────────────
const TRADE: CardDefinition[] = [
  flat('trd-glass-cannon', 'weapon', 'GLASS CANNON', '+80% damage. Shield capacity → 0.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.8, shieldCapacityMult: 0 })),
  flat('trd-bloodfire', 'weapon', 'BLOODFIRE', '+50% fire rate. Each shot costs 1 hull HP.',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.67, hullDamagePerShot: m.hullDamagePerShot + 1 })),
  flat('trd-hungry-shield', 'shield', 'HUNGRY SHIELD', 'Shield pulses ×2 faster. Shots cost 50% more energy.',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 2, weaponEnergyMult: m.weaponEnergyMult * 1.5 })),
  flat('trd-warp-drive', 'motor', 'WARP DRIVE', 'Motor ×2 speed. Fire rate −20%.',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 2, fireIntervalMult: m.fireIntervalMult * 1.2 })),
  flat('trd-volatile-core', 'generator', 'VOLATILE CORE', '+4 energy/s output. 5% chance per pulse to vent all energy.',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.4, volatileCoreLosePct: 0.05 })),
  flat('trd-berserker-trade', 'weapon', 'BERSERKER OATH', '+60% damage. Each shot costs 1 hull HP.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, hullDamagePerShot: m.hullDamagePerShot + 1 })),
];

// ── Trap (hidden cost or random behaviour) ────────────────────────────────────
const TRAP: CardDefinition[] = [
  flat('trap-haywire', 'weapon', 'HAYWIRE', 'Shots target a random enemy instead of front-most.',
    (m) => ({ ...m, haywireTargeting: true })),
  flat('trap-gambler', 'weapon', 'GAMBLER', 'Each shot randomly deals 20%–200% of normal damage.',
    (m) => ({ ...m, shotRandomnessFraction: 0.8 })),
  flat('trap-entropy', 'weapon', 'ENTROPY', '+60% damage. Fire interval ±40% random each shot.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, shotRandomnessFraction: 0.4 })),
];

// ── Milestone (tied to run progress or specific thresholds) ──────────────────
const MILESTONE: CardDefinition[] = [
  flat('mile-endgame', 'weapon', 'ENDGAME', '+60% damage at 75%+ mission progress',
    (m) => ({ ...m, finalPushDmgBonus: m.finalPushDmgBonus + 0.6 })),
  flat('mile-earlybird-2', 'weapon', 'LIGHTNING START', '+60% damage in first 25% of mission',
    (m) => ({ ...m, earlyBirdDmgBonus: m.earlyBirdDmgBonus + 0.6 })),
  flat('mile-boss-2', 'weapon', 'APEX PREDATOR', '+150% damage to boss enemies',
    (m) => ({ ...m, bossDamageMult: m.bossDamageMult * 2.5 })),
  flat('mile-swarm-3', 'weapon', 'CROWD CONTROL', '+5 extra targets when 6+ enemies on screen',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 5 })),
  flat('mile-kill-2', 'weapon', 'GENOCIDE', '+1.5% damage per kill (stacks all mission)',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 1.5 })),
  flat('mile-momentum-2', 'weapon', 'UNSTOPPABLE', '+5% damage per consecutive kill (resets on hull hit)',
    (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 5 })),
  flat('mile-chain-shot', 'shield', 'BOUNTY SHIELD', 'Every 2nd kill restores 8 shield',
    (m) => ({ ...m, nthKillShieldInterval: m.nthKillShieldInterval === 0 ? 2 : m.nthKillShieldInterval, nthKillShieldAmount: m.nthKillShieldAmount + 8 })),
  flat('mile-drain-cycle-2', 'shield', 'BATTERY CYCLE', 'Every 5th shot: restore 15 shield',
    (m) => ({ ...m, nthShotShieldInterval: m.nthShotShieldInterval === 0 ? 5 : m.nthShotShieldInterval, nthShotShieldAmount: m.nthShotShieldAmount + 15 })),
  flat('mile-hull-leech-2', 'shield', 'VAMPIRE ROUNDS', 'Each kill restores 2 hull HP',
    (m) => ({ ...m, hullPerKill: m.hullPerKill + 2 })),
  flat('mile-overclock-gen', 'generator', 'OVERCLOCK', 'Generator output +16 energy/s, motor draw +1/s',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 1.6, motorDrawMult: m.motorDrawMult * 1.33 })),
  flat('mile-no-shield-dmg', 'weapon', 'ZERO BARRIER', '+40% damage while shield = 0',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 1.4 })),
  flat('mile-full-shield-dmg', 'weapon', 'PEAK CONDITION', '+35% damage while shield is full',
    (m) => ({ ...m, shieldActiveDmgBonus: m.shieldActiveDmgBonus + 0.35 })),
  flat('mile-prismatic', 'weapon', 'PRISMATIC BURST', 'Shots pierce +2 enemies',
    (m) => ({ ...m, extraPierce: m.extraPierce + 2 })),
  flat('mile-energy-leech', 'generator', 'ENERGY LEECH', 'Each enemy hit restores 3 energy',
    (m) => ({ ...m, energyPerHit: m.energyPerHit + 3 })),
  flat('mile-overcharge-2', 'weapon', 'RAPID OVERCHARGE', 'Overcharge fires every 5th shot',
    (m) => ({ ...m, overchargeEvery: m.overchargeEvery === 0 ? 5 : Math.min(m.overchargeEvery, 5) })),
  flat('mile-pulse-2', 'generator', 'PULSE STORM', '+80% shield per generator pulse. Motor draw +50%.',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.8, motorDrawMult: m.motorDrawMult * 1.5 })),
  flat('mile-free-shot-2', 'weapon', 'GHOST ROUNDS', 'Every 5th shot costs 0 energy',
    (m) => ({ ...m, freeEveryNthShot: m.freeEveryNthShot === 0 ? 5 : m.freeEveryNthShot })),
  flat('mile-windmill-2', 'generator', 'GALE FORCE', 'Every 3rd wave clear: energy refills completely',
    (m) => ({ ...m, nthWaveClearRefillInterval: m.nthWaveClearRefillInterval === 0 ? 3 : m.nthWaveClearRefillInterval })),
  flat('mile-blocker-nuke', 'weapon', 'CORE BREACH', 'Kill explosions deal +10 AoE damage',
    (m) => ({ ...m, killExplosionDamage: m.killExplosionDamage + 10 })),
  flat('mile-glass-cannon-2', 'weapon', 'TOTAL FOCUS', '+60% damage. +40% weapon energy cost.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, weaponEnergyMult: m.weaponEnergyMult * 1.4 })),
  flat('mile-armor-2', 'weapon', 'EXECUTION', '+100% damage to enemies above 75% HP',
    (m) => ({ ...m, highHpEnemyDamageMult: m.highHpEnemyDamageMult * 2 })),
  flat('mile-refund', 'weapon', 'ENERGY BANK', 'Overcharged shots refund energy cost',
    (m) => ({ ...m, overchargeRefund: true })),
  flat('mile-pulse-energy', 'generator', 'PULSE HARVEST', 'Each shield pulse restores 6 energy',
    (m) => ({ ...m, energyPerPulse: m.energyPerPulse + 6 })),
  flat('mile-blocker-coin', 'weapon', 'PILLAGER', 'Coins from blocker kills ×2',
    (m) => ({ ...m, blockerCoinMult: m.blockerCoinMult * 2 })),
  flat('mile-desperate-dmg', 'weapon', 'CORNERED', '+80% damage while hull < 50%',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 1.8 })),
];

// ── Economy ───────────────────────────────────────────────────────────────────
const ECONOMY: CardDefinition[] = [
  flat('eco-blood-money', 'generator', 'BLOOD MONEY', 'Each coin earned restores 0.5 energy',
    (m) => ({ ...m, coinsEnergyRestore: m.coinsEnergyRestore + 0.5 })),
  flat('eco-blood-money-2', 'generator', 'GOLD BATTERY', 'Each coin earned restores 1 energy',
    (m) => ({ ...m, coinsEnergyRestore: m.coinsEnergyRestore + 1 })),
  flat('eco-bounty-hunter', 'weapon', 'BOUNTY HUNTER', 'Coins from blocker kills ×3',
    (m) => ({ ...m, blockerCoinMult: m.blockerCoinMult * 3 })),
  flat('eco-greed', 'motor', 'GREED', '+30% mission speed. Generator output −2/s.',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.3, generatorOutputBonus: m.generatorOutputBonus - 0.2 })),
];

// ── Meta (affect the card draft itself) ───────────────────────────────────────
const META: CardDefinition[] = [
  {
    id: 'meta-windfall', system: 'weapon', name: 'WINDFALL',
    description: 'Immediately queue one extra bonus card offer.',
    apply: (m) => m,
    onPick: (state: CoreState) => { state.bonusCallsPending += 1; },
    unique: true,
  },
  {
    id: 'meta-reroll-cache', system: 'weapon', name: 'REROLL CACHE',
    description: '+3 rerolls for the rest of this mission.',
    apply: (m) => m,
    onPick: (state: CoreState) => { state.rerollsLeft += 3; },
  },
];

// ── Synergy chains ────────────────────────────────────────────────────────────

const PIERCE_CHAIN: CardDefinition[] = [
  {
    id: 'pierce-lance', system: 'weapon', name: 'PIERCE LANCE',
    description: 'Shots pierce +1 enemy',
    enablerFor: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
  {
    id: 'pierce-leech', system: 'weapon', name: 'LEECH ROUNDS',
    description: 'Each enemy hit restores 2 energy',
    requiresChain: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, energyPerHit: m.energyPerHit + 2 }),
  },
  {
    id: 'pierce-shrapnel', system: 'weapon', name: 'SHRAPNEL',
    description: 'Shots pierce +1 more enemy',
    requiresChain: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
];

const OVERCHARGE_CHAIN: CardDefinition[] = [
  {
    id: 'oc-core', system: 'weapon', name: 'OVERCHARGE',
    description: 'Every 6th shot deals ×3 damage',
    enablerFor: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeEvery: 6 }),
  },
  {
    id: 'oc-refund', system: 'weapon', name: 'CAPACITOR REFUND',
    description: 'Overcharged shots refund their energy cost',
    requiresChain: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeRefund: true }),
  },
  {
    id: 'oc-super', system: 'weapon', name: 'SUPERCHARGE',
    description: 'Overcharge fires every 4th shot',
    requiresChain: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeEvery: 4 }),
  },
];

// Shield Resonance chain: bonus while shield is active
const RESONANCE_CHAIN: CardDefinition[] = [
  {
    id: 'res-sync', system: 'shield', name: 'SHIELD SYNC',
    description: '+15% damage while shield > 0',
    enablerFor: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, shieldActiveDmgBonus: m.shieldActiveDmgBonus + 0.15 }),
  },
  {
    id: 'res-pulse-amp', system: 'shield', name: 'PULSE AMP',
    description: '+60% shield per generator pulse',
    requiresChain: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.6 }),
  },
  {
    id: 'res-pulse-nova', system: 'generator', name: 'PULSE NOVA',
    description: 'Each shield pulse restores 8 energy',
    requiresChain: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, energyPerPulse: m.energyPerPulse + 8 }),
  },
];

// Berserker chain: embraces taking hull damage
const BERSERKER_CHAIN: CardDefinition[] = [
  {
    id: 'brs-adrenaline', system: 'weapon', name: 'ADRENALINE',
    description: '×2 fire rate while hull < 30%',
    enablerFor: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, lowHullFireRateMult: m.lowHullFireRateMult * 2 }),
  },
  {
    id: 'brs-spite', system: 'weapon', name: 'SPITE',
    description: '+3% damage per consecutive kill',
    requiresChain: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 3 }),
  },
  {
    id: 'brs-frenzy', system: 'weapon', name: 'FRENZY',
    description: '×2.5 damage AND ×2 fire rate while hull < 30%',
    requiresChain: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 2.5, lowHullFireRateMult: m.lowHullFireRateMult * 2 }),
  },
];

export const ALL_CARDS: CardDefinition[] = [
  ...FLAT_BOOSTS,
  ...SITUATIONAL,
  ...CONDITIONAL,
  ...COUNTER,
  ...ACCUMULATE,
  ...MILESTONE,
  ...TRADE,
  ...TRAP,
  ...ECONOMY,
  ...META,
  ...PIERCE_CHAIN,
  ...OVERCHARGE_CHAIN,
  ...RESONANCE_CHAIN,
  ...BERSERKER_CHAIN,
];

const CARDS_BY_ID: Record<string, CardDefinition> = Object.fromEntries(
  ALL_CARDS.map((c) => [c.id, c]),
);

export function cardById(id: string): CardDefinition {
  const card = CARDS_BY_ID[id];
  if (card === undefined) throw new Error(`Unknown card id "${id}"`);
  return card;
}
