export type SideWeaponType = 'spread' | 'beam';

export type ItemSlot = 'front' | 'left' | 'right' | 'generator' | 'shields';

export interface ItemLevelStats {
  // Front weapon
  damage?:          number;
  energyCost?:      number;
  fireMs?:          number;
  // Generator
  energyCapacity?:  number;
  energyRegenSec?:  number;
  // Shields
  shieldCapacity?:  number;
  shieldRegenSec?:  number;
}

export interface ItemLevel {
  cost:  number;          // coins to purchase this specific level
  stats: ItemLevelStats;
}

export interface ItemDefinition {
  id:          string;
  name:        string;
  description: string;
  slot:        ItemSlot;
  weaponType?: SideWeaponType; // set only for side-weapon items
  levels:      ItemLevel[];
}

export const ITEMS: Record<string, ItemDefinition> = {
  laser_mk1: {
    id:          'laser_mk1',
    name:        'Laser MkI',
    description: 'Standard front-mounted laser cannon.',
    slot:        'front',
    levels: [
      { cost: 50,  stats: { damage: 10, energyCost: 5,  fireMs: 350 } },
      { cost: 80,  stats: { damage: 18, energyCost: 12, fireMs: 300 } },
      { cost: 130, stats: { damage: 28, energyCost: 22, fireMs: 260 } },
    ],
  },

  spread_shot: {
    id:          'spread_shot',
    name:        'Spread Shot',
    description: '5-projectile arc. Good vs clusters.',
    slot:        'left',
    weaponType:  'spread',
    levels: [
      { cost: 60, stats: {} },
    ],
  },

  heavy_beam: {
    id:          'heavy_beam',
    name:        'Heavy Beam',
    description: 'High-damage beam. Good vs bosses.',
    slot:        'left',
    weaponType:  'beam',
    levels: [
      { cost: 80, stats: {} },
    ],
  },

  generator_mk1: {
    id:          'generator_mk1',
    name:        'Generator MkI',
    description: 'Powers all ship systems.',
    slot:        'generator',
    levels: [
      { cost: 40,  stats: { energyCapacity: 100, energyRegenSec: 15 } },
      { cost: 70,  stats: { energyCapacity: 130, energyRegenSec: 22 } },
      { cost: 120, stats: { energyCapacity: 170, energyRegenSec: 32 } },
    ],
  },

  shield_mk1: {
    id:          'shield_mk1',
    name:        'Shield MkI',
    description: 'Absorbs incoming damage before hull is hit.',
    slot:        'shields',
    levels: [
      { cost: 50,  stats: { shieldCapacity: 50,  shieldRegenSec: 5  } },
      { cost: 90,  stats: { shieldCapacity: 90,  shieldRegenSec: 10 } },
      { cost: 150, stats: { shieldCapacity: 140, shieldRegenSec: 18 } },
    ],
  },
};

// Items that can occupy the right weapon slot (any side weapon can go in either slot).
// Used in ShopScene to determine equip-slot options.
export const SIDE_WEAPON_IDS = new Set(['spread_shot', 'heavy_beam']);

// Returns the total coins paid for all levels up to and including currentLevel.
export function totalCostPaid(item: ItemDefinition, currentLevel: number): number {
  return item.levels.slice(0, currentLevel).reduce((sum, l) => sum + l.cost, 0);
}
