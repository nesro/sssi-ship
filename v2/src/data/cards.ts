import type { AbilityDefinition, CompanyId, CoreState, LoadoutSnapshot, RunModifiers } from '../core/types';
import { ALL_NEW_ABILITIES } from './abilities';

// Helper for flat-modifier cards
function flat(
  id: string,
  company: CompanyId,
  name: string,
  description: string,
  apply: (mods: RunModifiers) => RunModifiers,
): AbilityDefinition {
  return { id, company, kind: 'passive', name, description, apply };
}

// Chain ids
const CHAIN_PIERCE = 'pierce';
const CHAIN_OVERCHARGE = 'overcharge';
const CHAIN_RESONANCE = 'resonance';
const CHAIN_BERSERKER = 'berserker';

// ── Flat boosts ───────────────────────────────────────────────────────────────
const FLAT_BOOSTS: AbilityDefinition[] = [
  flat('w-dmg-15', 'nexus', 'FOCUS LENS', '+15% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.15 })),
  flat('w-dmg-30', 'nexus', 'PRISM CORE', '+30% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.3 })),
  flat('w-dmg-50', 'nexus', 'SNIPER CORE', '+50% weapon damage',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.5 })),
  flat('w-rate-13', 'nexus', 'RAPID CYCLER', '13% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.87 })),
  flat('w-rate-20', 'nexus', 'TWIN ACTUATOR', '20% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.8 })),
  flat('w-rate-30', 'nexus', 'TRIPLE ACTUATOR', '30% faster firing',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.7 })),
  flat('w-cost-25', 'nexus', 'COOL BARREL', 'Shots cost 25% less energy',
    (m) => ({ ...m, weaponEnergyMult: m.weaponEnergyMult * 0.75 })),
  flat('w-cost-40', 'nexus', 'ICE BARREL', 'Shots cost 40% less energy',
    (m) => ({ ...m, weaponEnergyMult: m.weaponEnergyMult * 0.6 })),
  flat('s-pulse-25', 'aegis', 'HARMONIC TUNER', '+25% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.25 })),
  flat('s-pulse-40', 'aegis', 'FIELD WEAVER', '+40% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.4 })),
  flat('s-pulse-60', 'aegis', 'RESONANCE WEAVER', '+60% shield per generator pulse',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.6 })),
  flat('s-cap-15', 'aegis', 'WIDE PROJECTOR', '+15 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 15 })),
  flat('s-cap-20', 'aegis', 'HEAVY PLATING', '+20 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 20 })),
  flat('s-cap-30', 'aegis', 'MEGA PLATING', '+30 max shield',
    (m) => ({ ...m, shieldCapacityBonus: m.shieldCapacityBonus + 30 })),
  flat('g-out-04', 'quantum', 'SPARE CELL', '+4 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.4 })),
  flat('g-out-08', 'quantum', 'FUSION TAP', '+8 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.8 })),
  flat('g-out-12', 'quantum', 'PLASMA TAP', '+12 energy/s generator output',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 1.2 })),
  flat('g-cap-15', 'quantum', 'BUFFER BANK', '+15 energy capacity',
    (m) => ({ ...m, generatorCapacityBonus: m.generatorCapacityBonus + 15 })),
  flat('g-cap-30', 'quantum', 'DEEP CELL', '+30 energy capacity',
    (m) => ({ ...m, generatorCapacityBonus: m.generatorCapacityBonus + 30 })),
  flat('m-over-20', 'comet', 'OVERDRIVE', '+20% mission speed',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.2 })),
  flat('m-over-35', 'comet', 'AFTERBURNER', '+35% mission speed',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.35 })),
  flat('m-eff-50', 'comet', 'FRICTIONLESS HUB', 'Motor draws 50% less power',
    (m) => ({ ...m, motorDrawMult: m.motorDrawMult * 0.5 })),
  // Added 2026-07-10 (docs/plans/game-identity-and-design-review-followup.md,
  // decision 3) — sub-basic's Lv1 pool was 5 cards with zero real draft variance for
  // most of the early campaign. These two round it out with a survivability and an
  // economy option, at half the magnitude of their nearest existing card, matching
  // sub-basic's entry-tier identity rather than power-creeping it.
  flat('g-hull-02', 'quantum', 'RECYCLED PLATING', '+0.03 hull restored per kill',
    (m) => ({ ...m, hullPerKill: m.hullPerKill + 0.03 })),
  flat('m-eco-01', 'comet', 'SCRAP CONVERTER', '+0.01 energy restored per coin earned',
    (m) => ({ ...m, coinsEnergyRestore: m.coinsEnergyRestore + 0.01 })),
];

// ── Situational (per-target multipliers) ──────────────────────────────────────
const SITUATIONAL: AbilityDefinition[] = [
  flat('sit-demolisher', 'nexus', 'DEMOLISHER', '+100% damage to blocker enemies',
    (m) => ({ ...m, blockerDamageMult: m.blockerDamageMult * 2 })),
  flat('sit-boss-hunter', 'nexus', 'BOSS HUNTER', '+80% damage to boss enemies',
    (m) => ({ ...m, bossDamageMult: m.bossDamageMult * 1.8 })),
  flat('sit-armor-pierce', 'nexus', 'ARMOR PIERCE', '+60% damage to enemies above 50% HP',
    (m) => ({ ...m, highHpEnemyDamageMult: m.highHpEnemyDamageMult * 1.6 })),
  flat('sit-swarm-killer', 'nexus', 'SWARM KILLER', 'Each kill deals 5 AoE damage to all others',
    (m) => ({ ...m, killExplosionDamage: m.killExplosionDamage + 5 })),
  flat('sit-early-bird', 'nexus', 'EARLY BIRD', '+40% damage in first 25% of mission',
    (m) => ({ ...m, earlyBirdDmgBonus: m.earlyBirdDmgBonus + 0.4 })),
  flat('sit-final-push', 'nexus', 'FINAL PUSH', '+40% damage in last 25% of mission',
    (m) => ({ ...m, finalPushDmgBonus: m.finalPushDmgBonus + 0.4 })),
  flat('sit-swarm-sense', 'nexus', 'SWARM SENSE', 'Shots hit 3 extra enemies when 6+ are present',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 3 })),
  flat('sit-demolisher-2', 'nexus', 'HEAVY DEMO', '+150% damage to blockers',
    (m) => ({ ...m, blockerDamageMult: m.blockerDamageMult * 2.5 })),
];

// ── Conditional damage ────────────────────────────────────────────────────────
const CONDITIONAL: AbilityDefinition[] = [
  flat('cond-full-energy', 'nexus', 'FULL CHARGE', '+30% damage while at max energy',
    (m) => ({ ...m, fullEnergyDmgBonus: m.fullEnergyDmgBonus + 0.3 })),
  flat('cond-full-energy-2', 'nexus', 'OVERCHARGED', '+50% damage while at max energy',
    (m) => ({ ...m, fullEnergyDmgBonus: m.fullEnergyDmgBonus + 0.5 })),
  flat('cond-low-hull', 'nexus', 'LAST STAND', '×2.5 damage while hull < 30%',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 2.5 })),
  flat('cond-single-enemy', 'nexus', 'FOCUS FIRE', '+60% damage while only 1 enemy on screen',
    (m) => ({ ...m, singleEnemyDmgBonus: m.singleEnemyDmgBonus + 0.6 })),
  flat('cond-no-shield', 'nexus', 'DESPERATE FIRE', 'Shots pierce all enemies while shield = 0',
    (m) => ({ ...m, noShieldPierceAll: true })),
  flat('cond-high-hull-gen', 'quantum', 'PRISTINE HULL', '+50% generator output while hull > 80%',
    (m) => ({ ...m, highHullGenBonus: m.highHullGenBonus + 0.5 })),
  flat('cond-boss-gen', 'quantum', 'BOSS FOCUS', '+80% generator output while a boss is alive',
    (m) => ({ ...m, bossAliveGenBonus: m.bossAliveGenBonus + 0.8 })),
  flat('cond-many-enemies', 'nexus', 'SWARM MIND', '+4 extra targets when 6+ enemies on screen',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 4 })),
];

// ── Counter (every N-th event something happens) ──────────────────────────────
const COUNTER: AbilityDefinition[] = [
  flat('cnt-bounty', 'aegis', 'BOUNTY', 'Every 3rd kill: restore 10 shield',
    (m) => ({ ...m, nthKillShieldInterval: m.nthKillShieldInterval === 0 ? 3 : m.nthKillShieldInterval, nthKillShieldAmount: m.nthKillShieldAmount + 10 })),
  flat('cnt-power-sink', 'quantum', 'POWER SINK', 'Blocker kills restore 30 energy',
    (m) => ({ ...m, extraEnergyOnBlockerKill: m.extraEnergyOnBlockerKill + 30 })),
  flat('cnt-drain-cycle', 'aegis', 'DRAIN CYCLE', 'Every 8th shot: restore 10 shield',
    (m) => ({ ...m, nthShotShieldInterval: m.nthShotShieldInterval === 0 ? 8 : m.nthShotShieldInterval, nthShotShieldAmount: m.nthShotShieldAmount + 10 })),
  flat('cnt-phantom-shot', 'nexus', 'PHANTOM SHOT', 'Every 8th shot costs 0 energy',
    (m) => ({ ...m, freeEveryNthShot: m.freeEveryNthShot === 0 ? 8 : m.freeEveryNthShot })),
  flat('cnt-breaker-bonus', 'quantum', 'BREAKER BONUS', 'Blocker kills restore 20 energy',
    (m) => ({ ...m, extraEnergyOnBlockerKill: m.extraEnergyOnBlockerKill + 20 })),
  flat('cnt-windmill', 'quantum', 'WINDMILL', 'Every 4th wave clear: energy refills completely',
    (m) => ({ ...m, nthWaveClearRefillInterval: m.nthWaveClearRefillInterval === 0 ? 4 : m.nthWaveClearRefillInterval })),
];

// ── Accumulate (grow stronger through the run) ────────────────────────────────
const ACCUMULATE: AbilityDefinition[] = [
  flat('acc-killcount', 'nexus', 'KILLCOUNT', '+0.5% weapon damage per kill this mission',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 0.5 })),
  flat('acc-killcount-2', 'nexus', 'EXTINCTION', '+1% weapon damage per kill this mission',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 1 })),
  flat('acc-momentum', 'nexus', 'MOMENTUM', '+3% damage per consecutive kill; resets on hull hit',
    (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 3 })),
  flat('acc-leech', 'aegis', 'LEECH HULL', 'Each kill restores 1 hull HP',
    (m) => ({ ...m, hullPerKill: m.hullPerKill + 1 })),
];

// ── Trade (visible cost, visible gain) ───────────────────────────────────────
const TRADE: AbilityDefinition[] = [
  flat('trd-glass-cannon', 'nexus', 'GLASS CANNON', '+80% damage. Shield capacity → 0.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.8, shieldCapacityMult: 0 })),
  flat('trd-bloodfire', 'nexus', 'BLOODFIRE', '+50% fire rate. Each shot costs 1 hull HP.',
    (m) => ({ ...m, fireIntervalMult: m.fireIntervalMult * 0.67, hullDamagePerShot: m.hullDamagePerShot + 1 })),
  flat('trd-hungry-shield', 'aegis', 'HUNGRY SHIELD', 'Shield pulses ×2 faster. Shots cost 50% more energy.',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 2, weaponEnergyMult: m.weaponEnergyMult * 1.5 })),
  flat('trd-warp-drive', 'comet', 'WARP DRIVE', 'Motor ×2 speed. Fire rate −20%.',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 2, fireIntervalMult: m.fireIntervalMult * 1.2 })),
  flat('trd-volatile-core', 'quantum', 'VOLATILE CORE', '+4 energy/s output. 5% chance per pulse to vent all energy.',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 0.4, volatileCoreLosePct: 0.05 })),
  flat('trd-berserker-trade', 'nexus', 'BERSERKER OATH', '+60% damage. Each shot costs 1 hull HP.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, hullDamagePerShot: m.hullDamagePerShot + 1 })),
];

// ── Trap (hidden cost or random behaviour) ────────────────────────────────────
const TRAP: AbilityDefinition[] = [
  flat('trap-haywire', 'nexus', 'HAYWIRE', 'Shots target a random enemy instead of front-most.',
    (m) => ({ ...m, haywireTargeting: true })),
  flat('trap-gambler', 'nexus', 'GAMBLER', 'Each shot randomly deals 20%–200% of normal damage.',
    (m) => ({ ...m, shotRandomnessFraction: 0.8 })),
  flat('trap-entropy', 'nexus', 'ENTROPY', '+60% damage. Fire interval ±40% random each shot.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, shotRandomnessFraction: 0.4 })),
];

// ── Milestone (tied to run progress or specific thresholds) ──────────────────
const MILESTONE: AbilityDefinition[] = [
  flat('mile-endgame', 'nexus', 'ENDGAME', '+60% damage at 75%+ mission progress',
    (m) => ({ ...m, finalPushDmgBonus: m.finalPushDmgBonus + 0.6 })),
  flat('mile-earlybird-2', 'nexus', 'LIGHTNING START', '+60% damage in first 25% of mission',
    (m) => ({ ...m, earlyBirdDmgBonus: m.earlyBirdDmgBonus + 0.6 })),
  flat('mile-boss-2', 'nexus', 'APEX PREDATOR', '+150% damage to boss enemies',
    (m) => ({ ...m, bossDamageMult: m.bossDamageMult * 2.5 })),
  flat('mile-swarm-3', 'nexus', 'CROWD CONTROL', '+5 extra targets when 6+ enemies on screen',
    (m) => ({ ...m, manyEnemiesExtraTargets: m.manyEnemiesExtraTargets + 5 })),
  flat('mile-kill-2', 'nexus', 'GENOCIDE', '+1.5% damage per kill (stacks all mission)',
    (m) => ({ ...m, killDmgPerKillPct: m.killDmgPerKillPct + 1.5 })),
  flat('mile-momentum-2', 'nexus', 'UNSTOPPABLE', '+5% damage per consecutive kill (resets on hull hit)',
    (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 5 })),
  flat('mile-chain-shot', 'aegis', 'BOUNTY SHIELD', 'Every 2nd kill restores 8 shield',
    (m) => ({ ...m, nthKillShieldInterval: m.nthKillShieldInterval === 0 ? 2 : m.nthKillShieldInterval, nthKillShieldAmount: m.nthKillShieldAmount + 8 })),
  flat('mile-drain-cycle-2', 'aegis', 'BATTERY CYCLE', 'Every 5th shot: restore 15 shield',
    (m) => ({ ...m, nthShotShieldInterval: m.nthShotShieldInterval === 0 ? 5 : m.nthShotShieldInterval, nthShotShieldAmount: m.nthShotShieldAmount + 15 })),
  flat('mile-hull-leech-2', 'aegis', 'VAMPIRE ROUNDS', 'Each kill restores 2 hull HP',
    (m) => ({ ...m, hullPerKill: m.hullPerKill + 2 })),
  flat('mile-overclock-gen', 'quantum', 'OVERCLOCK', 'Generator output +16 energy/s, motor draw +1/s',
    (m) => ({ ...m, generatorOutputBonus: m.generatorOutputBonus + 1.6, motorDrawMult: m.motorDrawMult * 1.33 })),
  flat('mile-no-shield-dmg', 'nexus', 'ZERO BARRIER', '+40% damage while shield = 0',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 1.4 })),
  flat('mile-full-shield-dmg', 'nexus', 'PEAK CONDITION', '+35% damage while shield is full',
    (m) => ({ ...m, shieldActiveDmgBonus: m.shieldActiveDmgBonus + 0.35 })),
  flat('mile-prismatic', 'nexus', 'PRISMATIC BURST', 'Shots pierce +2 enemies',
    (m) => ({ ...m, extraPierce: m.extraPierce + 2 })),
  flat('mile-energy-leech', 'quantum', 'ENERGY LEECH', 'Each enemy hit restores 3 energy',
    (m) => ({ ...m, energyPerHit: m.energyPerHit + 3 })),
  flat('mile-overcharge-2', 'nexus', 'RAPID OVERCHARGE', 'Overcharge fires every 5th shot',
    (m) => ({ ...m, overchargeEvery: m.overchargeEvery === 0 ? 5 : Math.min(m.overchargeEvery, 5) })),
  flat('mile-pulse-2', 'quantum', 'PULSE STORM', '+80% shield per generator pulse. Motor draw +50%.',
    (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.8, motorDrawMult: m.motorDrawMult * 1.5 })),
  flat('mile-free-shot-2', 'nexus', 'GHOST ROUNDS', 'Every 5th shot costs 0 energy',
    (m) => ({ ...m, freeEveryNthShot: m.freeEveryNthShot === 0 ? 5 : m.freeEveryNthShot })),
  flat('mile-windmill-2', 'quantum', 'GALE FORCE', 'Every 3rd wave clear: energy refills completely',
    (m) => ({ ...m, nthWaveClearRefillInterval: m.nthWaveClearRefillInterval === 0 ? 3 : m.nthWaveClearRefillInterval })),
  flat('mile-blocker-nuke', 'nexus', 'CORE BREACH', 'Kill explosions deal +10 AoE damage',
    (m) => ({ ...m, killExplosionDamage: m.killExplosionDamage + 10 })),
  flat('mile-glass-cannon-2', 'nexus', 'TOTAL FOCUS', '+60% damage. +40% weapon energy cost.',
    (m) => ({ ...m, weaponDamageMult: m.weaponDamageMult + 0.6, weaponEnergyMult: m.weaponEnergyMult * 1.4 })),
  flat('mile-armor-2', 'nexus', 'EXECUTION', '+100% damage to enemies above 75% HP',
    (m) => ({ ...m, highHpEnemyDamageMult: m.highHpEnemyDamageMult * 2 })),
  flat('mile-refund', 'nexus', 'ENERGY BANK', 'Overcharged shots refund energy cost',
    (m) => ({ ...m, overchargeRefund: true })),
  flat('mile-pulse-energy', 'quantum', 'PULSE HARVEST', 'Each shield pulse restores 6 energy',
    (m) => ({ ...m, energyPerPulse: m.energyPerPulse + 6 })),
  flat('mile-blocker-coin', 'nexus', 'PILLAGER', 'Coins from blocker kills ×2',
    (m) => ({ ...m, blockerCoinMult: m.blockerCoinMult * 2 })),
  flat('mile-desperate-dmg', 'nexus', 'CORNERED', '+80% damage while hull < 50%',
    (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 1.8 })),
];

// ── Economy ───────────────────────────────────────────────────────────────────
const ECONOMY: AbilityDefinition[] = [
  flat('eco-blood-money', 'quantum', 'BLOOD MONEY', 'Each coin earned restores 0.5 energy',
    (m) => ({ ...m, coinsEnergyRestore: m.coinsEnergyRestore + 0.5 })),
  flat('eco-blood-money-2', 'quantum', 'GOLD BATTERY', 'Each coin earned restores 1 energy',
    (m) => ({ ...m, coinsEnergyRestore: m.coinsEnergyRestore + 1 })),
  flat('eco-bounty-hunter', 'nexus', 'BOUNTY HUNTER', 'Coins from blocker kills ×3',
    (m) => ({ ...m, blockerCoinMult: m.blockerCoinMult * 3 })),
  flat('eco-greed', 'comet', 'GREED', '+30% mission speed. Generator output −2/s.',
    (m) => ({ ...m, motorTimelineMult: m.motorTimelineMult * 1.3, generatorOutputBonus: m.generatorOutputBonus - 0.2 })),
];

// ── Meta (affect the card draft itself) ───────────────────────────────────────
const META: AbilityDefinition[] = [
  {
    id: 'meta-windfall', company: 'nexus', kind: 'passive', name: 'WINDFALL',
    description: 'Immediately queue one extra bonus card offer.',
    apply: (m) => m,
    onPick: (state: CoreState) => { state.bonusCallsPending += 1; },
    unique: true,
  },
  {
    id: 'meta-reroll-cache', company: 'nexus', kind: 'passive', name: 'REROLL CACHE',
    description: '+3 rerolls for the rest of this mission.',
    apply: (m) => m,
    onPick: (state: CoreState) => { state.rerollsLeft += 3; },
  },
];

// ── Synergy chains ────────────────────────────────────────────────────────────

const PIERCE_CHAIN: AbilityDefinition[] = [
  {
    id: 'pierce-lance', company: 'nexus', kind: 'passive', name: 'PIERCE LANCE',
    description: 'Shots pierce +1 enemy',
    enablerFor: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
  {
    id: 'pierce-leech', company: 'nexus', kind: 'passive', name: 'LEECH ROUNDS',
    description: 'Each enemy hit restores 2 energy',
    requiresChain: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, energyPerHit: m.energyPerHit + 2 }),
  },
  {
    id: 'pierce-shrapnel', company: 'nexus', kind: 'passive', name: 'SHRAPNEL',
    description: 'Shots pierce +1 more enemy',
    requiresChain: CHAIN_PIERCE, unique: true,
    apply: (m) => ({ ...m, extraPierce: m.extraPierce + 1 }),
  },
];

const OVERCHARGE_CHAIN: AbilityDefinition[] = [
  {
    id: 'oc-core', company: 'nexus', kind: 'passive', name: 'OVERCHARGE',
    description: 'Every 6th shot deals ×3 damage',
    enablerFor: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeEvery: 6 }),
  },
  {
    id: 'oc-refund', company: 'nexus', kind: 'passive', name: 'CAPACITOR REFUND',
    description: 'Overcharged shots refund their energy cost',
    requiresChain: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeRefund: true }),
  },
  {
    id: 'oc-super', company: 'nexus', kind: 'passive', name: 'SUPERCHARGE',
    description: 'Overcharge fires every 4th shot',
    requiresChain: CHAIN_OVERCHARGE, unique: true,
    apply: (m) => ({ ...m, overchargeEvery: 4 }),
  },
];

// Shield Resonance chain: bonus while shield is active
const RESONANCE_CHAIN: AbilityDefinition[] = [
  {
    id: 'res-sync', company: 'aegis', kind: 'passive', name: 'SHIELD SYNC',
    description: '+15% damage while shield > 0',
    enablerFor: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, shieldActiveDmgBonus: m.shieldActiveDmgBonus + 0.15 }),
  },
  {
    id: 'res-pulse-amp', company: 'aegis', kind: 'passive', name: 'PULSE AMP',
    description: '+60% shield per generator pulse',
    requiresChain: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, shieldPulseMult: m.shieldPulseMult * 1.6 }),
  },
  {
    id: 'res-pulse-nova', company: 'quantum', kind: 'passive', name: 'PULSE NOVA',
    description: 'Each shield pulse restores 8 energy',
    requiresChain: CHAIN_RESONANCE, unique: true,
    apply: (m) => ({ ...m, energyPerPulse: m.energyPerPulse + 8 }),
  },
];

// Berserker chain: embraces taking hull damage
const BERSERKER_CHAIN: AbilityDefinition[] = [
  {
    id: 'brs-adrenaline', company: 'nexus', kind: 'passive', name: 'ADRENALINE',
    description: '×2 fire rate while hull < 30%',
    enablerFor: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, lowHullFireRateMult: m.lowHullFireRateMult * 2 }),
  },
  {
    id: 'brs-spite', company: 'nexus', kind: 'passive', name: 'SPITE',
    description: '+3% damage per consecutive kill',
    requiresChain: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, momentumDmgPerKillPct: m.momentumDmgPerKillPct + 3 }),
  },
  {
    id: 'brs-frenzy', company: 'nexus', kind: 'passive', name: 'FRENZY',
    description: '×2.5 damage AND ×2 fire rate while hull < 30%',
    requiresChain: CHAIN_BERSERKER, unique: true,
    apply: (m) => ({ ...m, lowHullDmgMult: m.lowHullDmgMult * 2.5, lowHullFireRateMult: m.lowHullFireRateMult * 2 }),
  },
];

export const ALL_ABILITIES: AbilityDefinition[] = [
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

const ABILITIES_BY_ID: Record<string, AbilityDefinition> = Object.fromEntries(
  [...ALL_ABILITIES, ...ALL_NEW_ABILITIES].map((c) => [c.id, c]),
);

export function abilityById(id: string): AbilityDefinition {
  const ability = ABILITIES_BY_ID[id];
  if (ability === undefined) throw new Error(`Unknown ability id "${id}"`);
  return ability;
}

/**
 * The ability pool a loadout actually draws support-call offers from. Shared by the
 * live game (CombatScene.ts) and every simulator tool — this was previously duplicated
 * in three places, and two of the three copies (tools/simulate.ts,
 * tools/balance-sweep.ts) had silently diverged to always use the full catalog,
 * ignoring `subscriptionCardIds` entirely. Never re-duplicate this.
 *
 * An empty `subscriptionCardIds` means "no subscription owned at all" and falls back
 * to the full catalog; a non-empty list (even sub-basic's default 5 cards) restricts
 * the pool to exactly those ids. No weapon equipped excludes nexus-company cards
 * (nexus cards boost front-weapon damage, meaningless with no weapon to boost).
 */
export function abilityPoolForLoadout(loadout: LoadoutSnapshot): AbilityDefinition[] {
  const allById = new Map([...ALL_ABILITIES, ...ALL_NEW_ABILITIES].map((a) => [a.id, a]));
  const ids = loadout.subscriptionCardIds;
  const pool = ids.length > 0
    ? ids.map((id) => allById.get(id)).filter((a): a is AbilityDefinition => a !== undefined)
    : [...ALL_ABILITIES, ...ALL_NEW_ABILITIES];
  if (loadout.weapon === null) return pool.filter((a) => a.company !== 'nexus');
  return pool;
}
