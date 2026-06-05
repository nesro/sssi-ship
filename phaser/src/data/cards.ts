export type CardCategory = 'enabler' | 'payoff' | 'boost';

// Flat numeric deltas applied additively to ComputedStats when a card is picked.
export interface StatDelta {
  energyCapacity?:       number;
  energyRegenSec?:       number;
  frontDamage?:          number;
  frontEnergyCost?:      number;
  frontFireMs?:          number;
  shieldCapacity?:       number;
  shieldRegenSec?:       number;
  dodgeCost?:            number;
  spreadShotCost?:       number;
  heavyBeamCost?:        number;
  sideWeaponCooldownMs?: number;
}

export type RunFlag = 'explosiveRounds' | 'chainLightning' | 'overcharge';

export interface CardDefinition {
  id:            string;
  name:          string;
  description:   string;
  category:      CardCategory;
  requiresId?:   string;    // payoff: drawn at lower weight until this enabler is active
  requiresChain?: 1 | 2;   // 1 = needs chain_pool_1 talent; 2 = needs chain_pool_2 talent
  statDelta?:    StatDelta; // applied to ComputedStats when picked
  enables?:      RunFlag;   // enabler: sets this flag in RunState
}

export const ALL_CARDS: CardDefinition[] = [
  {
    id: 'rapid_fire',
    name: 'Rapid Fire',
    description: '+30% fire rate this mission',
    category: 'boost',
    statDelta: { frontFireMs: -100 },
  },
  {
    id: 'extra_energy',
    name: 'Energy Cache',
    description: '+30 energy capacity',
    category: 'boost',
    statDelta: { energyCapacity: 30 },
  },
  {
    id: 'fast_regen',
    name: 'Efficient Generator',
    description: '+8 energy regen/sec',
    category: 'boost',
    statDelta: { energyRegenSec: 8 },
  },
  {
    id: 'shield_boost',
    name: 'Reinforced Shields',
    description: '+30 shield HP',
    category: 'boost',
    statDelta: { shieldCapacity: 30 },
  },
  {
    id: 'fast_shields',
    name: 'Shield Capacitors',
    description: '+4 shield regen/sec',
    category: 'boost',
    statDelta: { shieldRegenSec: 4 },
  },
  {
    id: 'side_recharge',
    name: 'Quick Reload',
    description: 'Side weapons recharge 30% faster',
    category: 'boost',
    statDelta: { sideWeaponCooldownMs: -1500 },
  },
  {
    id: 'power_shot',
    name: 'Power Cells',
    description: '+5 damage per laser',
    category: 'boost',
    statDelta: { frontDamage: 5 },
  },
  {
    id: 'lean_shots',
    name: 'Efficient Barrels',
    description: '-2 energy cost per laser',
    category: 'boost',
    statDelta: { frontEnergyCost: -2 },
  },
  {
    id: 'dodge_training',
    name: 'Dodge Training',
    description: '-3 energy cost per dodge',
    category: 'boost',
    statDelta: { dodgeCost: -3 },
  },
  {
    id:            'explosive_rounds',
    name:          'Explosive Rounds',
    description:   'Lasers have 20% chance to explode on hit (40px AoE)',
    category:      'enabler',
    requiresChain: 1,
    enables:       'explosiveRounds',
  },
  {
    id:            'chain_lightning',
    name:          'Chain Lightning',
    description:   'Side weapons 15% chance to arc to a second target',
    category:      'enabler',
    requiresChain: 2,
    enables:       'chainLightning',
  },
  {
    id:            'overcharge',
    name:          'Overcharge Protocol',
    description:   'Every 8th laser shot deals 3× damage',
    category:      'enabler',
    requiresChain: 2,
    enables:       'overcharge',
  },
  {
    id:            'blast_radius',
    name:          'Blast Radius',
    description:   'Explosions deal damage in larger area (+30px radius)',
    category:      'payoff',
    requiresId:    'explosive_rounds',
    requiresChain: 1,
  },
  {
    id:            'chain_reaction',
    name:          'Chain Reaction',
    description:   'Explosions can trigger secondary explosions',
    category:      'payoff',
    requiresId:    'explosive_rounds',
    requiresChain: 1,
  },
  {
    id:            'energy_recovery',
    name:          'Energy Recovery',
    description:   'Explosions restore 8 energy',
    category:      'payoff',
    requiresId:    'explosive_rounds',
    requiresChain: 1,
  },
  {
    id:            'overcharge_regen',
    name:          'Capacitor Discharge',
    description:   'Overcharge shots restore 5 energy',
    category:      'payoff',
    requiresId:    'overcharge',
    requiresChain: 2,
  },
  {
    id:            'storm_chains',
    name:          'Storm Chains',
    description:   'Chain Lightning arcs to 2 additional targets',
    category:      'payoff',
    requiresId:    'chain_lightning',
    requiresChain: 2,
  },
];
