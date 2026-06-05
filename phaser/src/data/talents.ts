export interface TalentLevel {
  starCost:    number;
  description: string;
}

export interface TalentNode {
  id:            string;
  name:          string;
  isKeystone:    boolean;   // true = major payoff node, false = travel node
  col:           number;    // grid column (0-based, rendered at col * COL_STRIDE + ORIGIN_X)
  row:           number;    // grid row (0-based, rendered at row * ROW_STRIDE + ORIGIN_Y)
  requiresNode?: string;   // id of predecessor node — must be unlocked first
  levels:        TalentLevel[];
}

export interface TalentBranch {
  id:    string;
  name:  string;
  nodes: TalentNode[];
}

export const TALENT_TREE: TalentBranch[] = [
  {
    id: 'weapons',
    name: 'Weapons',
    nodes: [
      {
        id: 'dmg_boost',
        name: 'Hot Rounds',
        isKeystone: false,
        col: 0, row: 0,
        levels: [
          { starCost: 1, description: '+4% laser damage' },
        ],
      },
      {
        id: 'damage',
        name: 'Combat Mastery',
        isKeystone: true,
        col: 1, row: 0,
        requiresNode: 'dmg_boost',
        levels: [
          { starCost: 2, description: '+8% laser damage' },
          { starCost: 3, description: '+16% laser damage' },
          { starCost: 4, description: '+24% laser damage' },
        ],
      },
      {
        id: 'fire_boost',
        name: 'Barrel Lube',
        isKeystone: false,
        col: 0, row: 1,
        levels: [
          { starCost: 1, description: '−3% fire interval' },
        ],
      },
      {
        id: 'fire_rate',
        name: 'Burst Protocol',
        isKeystone: true,
        col: 1, row: 1,
        requiresNode: 'fire_boost',
        levels: [
          { starCost: 2, description: '−5% fire interval' },
          { starCost: 2, description: '−10% fire interval' },
          { starCost: 3, description: '−15% fire interval' },
        ],
      },
      {
        id: 'weapon_eff',
        name: 'Focused Discharge',
        isKeystone: false,
        col: 0, row: 2,
        levels: [
          { starCost: 1, description: '−4% energy per laser' },
          { starCost: 2, description: '−8% energy per laser' },
        ],
      },
      {
        id: 'side_eff',
        name: 'Rapid Reload',
        isKeystone: true,
        col: 1, row: 2,
        requiresNode: 'weapon_eff',
        levels: [
          { starCost: 2, description: '−1 energy per side weapon' },
          { starCost: 3, description: '−2 energy per side weapon' },
          { starCost: 4, description: '−3 energy per side weapon' },
        ],
      },
    ],
  },
  {
    id: 'shields',
    name: 'Shields',
    nodes: [
      {
        id: 'shd_boost',
        name: 'Extra Plating',
        isKeystone: false,
        col: 0, row: 0,
        levels: [
          { starCost: 1, description: '+15 shield HP' },
        ],
      },
      {
        id: 'shield_cap',
        name: 'Thick Plating',
        isKeystone: true,
        col: 1, row: 0,
        requiresNode: 'shd_boost',
        levels: [
          { starCost: 2, description: '+25 shield HP' },
          { starCost: 3, description: '+50 shield HP' },
          { starCost: 3, description: '+75 shield HP' },
        ],
      },
      {
        id: 'shd_regen_boost',
        name: 'Trickle Charge',
        isKeystone: false,
        col: 0, row: 1,
        levels: [
          { starCost: 1, description: '+1 shield HP/sec' },
        ],
      },
      {
        id: 'shield_regen',
        name: 'Capacitor Banks',
        isKeystone: true,
        col: 1, row: 1,
        requiresNode: 'shd_regen_boost',
        levels: [
          { starCost: 2, description: '+2 shield HP/sec' },
          { starCost: 2, description: '+4 shield HP/sec' },
          { starCost: 3, description: '+6 shield HP/sec' },
        ],
      },
    ],
  },
  {
    id: 'generator',
    name: 'Generator',
    nodes: [
      {
        id: 'bat_boost',
        name: 'Aux Cell',
        isKeystone: false,
        col: 0, row: 0,
        levels: [
          { starCost: 1, description: '+10 energy capacity' },
        ],
      },
      {
        id: 'battery',
        name: 'Power Cell',
        isKeystone: true,
        col: 1, row: 0,
        requiresNode: 'bat_boost',
        levels: [
          { starCost: 2, description: '+15 energy capacity' },
          { starCost: 2, description: '+30 energy capacity' },
          { starCost: 3, description: '+45 energy capacity' },
        ],
      },
      {
        id: 'eff_boost',
        name: 'Flux Primer',
        isKeystone: false,
        col: 0, row: 1,
        levels: [
          { starCost: 1, description: '+2 energy/sec' },
        ],
      },
      {
        id: 'efficiency',
        name: 'Flux Coils',
        isKeystone: true,
        col: 1, row: 1,
        requiresNode: 'eff_boost',
        levels: [
          { starCost: 2, description: '+3 energy/sec' },
          { starCost: 2, description: '+6 energy/sec' },
          { starCost: 3, description: '+9 energy/sec' },
        ],
      },
    ],
  },
  {
    id: 'automation',
    name: 'Automation',
    nodes: [
      {
        id: 'dodge_boost',
        name: 'Reflex Oil',
        isKeystone: false,
        col: 0, row: 0,
        levels: [
          { starCost: 1, description: '−1 energy per dodge' },
        ],
      },
      {
        id: 'dodge_eff',
        name: 'Reflex Dampeners',
        isKeystone: true,
        col: 1, row: 0,
        requiresNode: 'dodge_boost',
        levels: [
          { starCost: 2, description: '−1 energy per dodge' },
          { starCost: 3, description: '−2 energy per dodge' },
          { starCost: 4, description: '−3 energy per dodge' },
        ],
      },
      {
        id: 'dodge_sense',
        name: 'Threat Matrix',
        isKeystone: false,
        col: 0, row: 1,
        levels: [
          { starCost: 1, description: 'Dodge reacts slightly earlier' },
        ],
      },
    ],
  },
  {
    id: 'chain',
    name: 'Chain',
    nodes: [
      {
        id: 'chain_pool_1',
        name: 'Syndicate Contracts',
        isKeystone: true,
        col: 0, row: 0,
        levels: [
          { starCost: 2, description: 'Unlocks Explosive Rounds cards' },
        ],
      },
      {
        id: 'chain_pool_2',
        name: 'Storm Protocol',
        isKeystone: true,
        col: 1, row: 0,
        requiresNode: 'chain_pool_1',
        levels: [
          { starCost: 3, description: 'Unlocks Overcharge + Chain Lightning cards' },
        ],
      },
    ],
  },
];

// Returns how many levels the player has purchased for a given node.
export function talentLevel(talents: Record<string, number>, nodeId: string): number {
  return talents[nodeId] ?? 0;
}

// Returns the star cost to purchase the next level of a node, or null if maxed.
export function nextLevelCost(
  node: { levels: { starCost: number }[] },
  currentLevel: number,
): number | null {
  if (currentLevel >= node.levels.length) return null;
  return node.levels[currentLevel].starCost;
}

// Total stars that were spent on a given node across all owned levels.
export function starsSpentOnNode(
  node: { levels: { starCost: number }[] },
  currentLevel: number,
): number {
  return node.levels.slice(0, currentLevel).reduce((sum, l) => sum + l.starCost, 0);
}

// Total spendable stars consumed across the entire talent tree.
// fallow-ignore-next-line unused-export
export function totalStarsSpent(
  branches: TalentBranch[],
  talents: Record<string, number>,
): number {
  let total = 0;
  for (const branch of branches) {
    for (const node of branch.nodes) {
      total += starsSpentOnNode(node, talentLevel(talents, node.id));
    }
  }
  return total;
}
