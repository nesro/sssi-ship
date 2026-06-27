import type {
  GeneratorSpec,
  MotorSpec,
  ShieldSpec,
  ShipSpec,
  SupplySpec,
  WeaponKind,
  WeaponSpec,
} from '../core/types';

// The shop catalog. Starter items cost 0 and are owned from the first launch.
// Prices are demo-tuned; final tuning happens via the simulator sweep.

export type SystemKind = 'weapon' | 'shield' | 'generator' | 'motor';

export type CatalogItem =
  | { system: 'weapon'; name: string; price: number; starsRequired?: number; blurb: string; spec: WeaponSpec; requires?: string }
  | { system: 'shield'; name: string; price: number; starsRequired?: number; blurb: string; spec: ShieldSpec; requires?: string }
  | { system: 'generator'; name: string; price: number; starsRequired?: number; blurb: string; spec: GeneratorSpec; requires?: string }
  | { system: 'motor'; name: string; price: number; starsRequired?: number; blurb: string; spec: MotorSpec; requires?: string };

// ---------- Weapon level system ----------

export const WEAPON_KINDS: WeaponKind[] = ['pulse', 'ion', 'scatter', 'nova'];
export const MAX_WEAPON_LEVEL = 5;

/** Display info and base-level-1 stats for each weapon type. */
const WEAPON_BASE: Record<WeaponKind, {
  displayName: string;
  blurb: string;
  damage: number;
  ticks: number;
  energy: number;
  targets: number;
  falloff: number;
}> = {
  pulse:   { displayName: 'Pulse Laser',  blurb: 'Reliable single-target fire.',            damage: 10, ticks: 5, energy: 6,  targets: 1,        falloff: 1.0 },
  ion:     { displayName: 'Ion Lance',    blurb: 'Heavy single hits. Feed it energy.',       damage: 28, ticks: 7, energy: 14, targets: 1,        falloff: 1.0 },
  scatter: { displayName: 'Scatter Beam', blurb: 'Pierces multiple enemies. Crowd killer.',  damage: 7,  ticks: 5, energy: 9,  targets: 3,        falloff: 0.7 },
  nova:    { displayName: 'Nova Wave',    blurb: 'Hits every enemy. Swarm destroyer.',       damage: 3,  ticks: 9, energy: 16, targets: Infinity, falloff: 1.0 },
};

/** Stars required per weapon kind and level (index = level − 1). See docs/plans/star-progression.md. */
export const WEAPON_STARS: Record<WeaponKind, [number, number, number, number, number]> = {
  pulse:   [0,  4,  10, 18, 28],
  ion:     [10, 18, 28, 38, 38],
  scatter: [10, 18, 28, 38, 38],
  nova:    [18, 28, 38, 38, 38],
};

/** Coin cost per level (index = level − 1). Pulse level 1 is free (starter). */
const WEAPON_PRICES: Record<WeaponKind, [number, number, number, number, number]> = {
  pulse:   [0,    200,  500,  1000, 2000],
  ion:     [250,  500,  1000, 2000, 4000],
  scatter: [220,  440,  900,  1800, 3600],
  nova:    [280,  560,  1100, 2200, 4400],
};

/** Computes a weapon spec at a given upgrade level (1 = base, 5 = max). */
export function weaponSpecAtLevel(kind: WeaponKind, level: number): WeaponSpec {
  const base = WEAPON_BASE[kind];
  const t = level - 1; // 0 at level 1, 4 at level 5
  const maxT = kind === 'scatter' ? Math.floor(t / 2) : 0;
  return {
    id: `${kind}-${String(level)}`,
    kind,
    damagePerShot: Math.round(base.damage * Math.pow(1.22, t) * 10) / 10,
    ticksBetweenShots: Math.max(2, Math.round(base.ticks * Math.pow(0.91, t))),
    energyPerShot: Math.round(base.energy * Math.pow(1.15, t) * 10) / 10,
    maxTargets: kind === 'nova' ? Infinity : base.targets + maxT,
    falloffPerTarget: base.falloff,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
  };
}

/** Human-readable display name for a weapon type and level. */
function weaponDisplayName(kind: WeaponKind, level: number): string {
  return `${WEAPON_BASE[kind].displayName} Lv ${String(level)}`;
}

/** Returns the base display name (without level suffix) for a weapon kind. */
export function weaponKindDisplayName(kind: WeaponKind): string {
  return WEAPON_BASE[kind].displayName;
}

// Build weapon catalog entries programmatically — one entry per (kind, level) pair.
const WEAPON_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  WEAPON_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_WEAPON_LEVEL }, (_, i) => {
      const level = i + 1;
      const id = `${kind}-${String(level)}`;
      const base = WEAPON_BASE[kind];
      return [id, {
        system: 'weapon' as const,
        name: weaponDisplayName(kind, level),
        price: WEAPON_PRICES[kind][i] ?? 0,
        starsRequired: WEAPON_STARS[kind][i] ?? 0,
        blurb: base.blurb,
        spec: weaponSpecAtLevel(kind, level),
      }];
    }),
  ),
);

export const ITEMS: Record<string, CatalogItem> = {
  ...WEAPON_ITEMS,

  // ── Shield: Wall path (high capacity, expensive to recharge) ─────────────────
  'shield-1': {
    system: 'shield', name: 'Deflector I', price: 0,
    blurb: 'Thin but honest. Branch: Wall or Reflex.',
    spec: { id: 'shield-1', capacity: 30, pulseShieldFraction: 0.08 },
  },
  'shield-2': {
    system: 'shield', name: 'Barricade', price: 250, starsRequired: 4, requires: 'shield-1',
    blurb: 'Wall path. Thick cap, heavier recharge.',
    spec: { id: 'shield-2', capacity: 70, pulseShieldFraction: 0.10 },
  },
  'shield-3': {
    system: 'shield', name: 'Fortress', price: 900, starsRequired: 18, requires: 'shield-2',
    blurb: 'Wall path. Near-invulnerable cap. Recharge is a commitment.',
    spec: { id: 'shield-3', capacity: 120, pulseShieldFraction: 0.12 },
  },

  // ── Shield: Reflex path (low capacity, cheap rapid recharge) ─────────────────
  'shield-reflex-2': {
    system: 'shield', name: 'Reflex Shield', price: 200, starsRequired: 4, requires: 'shield-1',
    blurb: 'Reflex path. Breaks easily, snaps back instantly.',
    spec: { id: 'shield-reflex-2', capacity: 22, pulseShieldFraction: 0.35 },
  },
  'shield-reflex-3': {
    system: 'shield', name: 'Phase Cloak', price: 700, starsRequired: 18, requires: 'shield-reflex-2',
    blurb: 'Reflex path. Minimal cap, nearly free to maintain. Syncs with SHATTERED CORE.',
    spec: { id: 'shield-reflex-3', capacity: 18, pulseShieldFraction: 0.50 },
  },

  // ── Generator: Torrent path (high output, small battery) ─────────────────────
  'generator-1': {
    system: 'generator', name: 'Core Cell I', price: 0,
    blurb: 'Keeps the lights on. Branch: Torrent or Reserve.',
    spec: { id: 'generator-1', outputPerTick: 2, capacity: 50, pulseDrainFraction: 0.50 },
  },
  'generator-2': {
    system: 'generator', name: 'Overdrive Core', price: 300, starsRequired: 4, requires: 'generator-1',
    blurb: 'Torrent path. High output, small buffer — great for fast weapons.',
    spec: { id: 'generator-2', outputPerTick: 5, capacity: 40, pulseDrainFraction: 0.60 },
  },
  'generator-3': {
    system: 'generator', name: 'Quantum Reactor', price: 1000, starsRequired: 18, requires: 'generator-2',
    blurb: 'Torrent path. Absurd output. Battery barely matters.',
    spec: { id: 'generator-3', outputPerTick: 9, capacity: 40, pulseDrainFraction: 0.65 },
  },

  // ── Generator: Reserve path (moderate output, massive battery) ───────────────
  'generator-reserve-2': {
    system: 'generator', name: 'Reservoir', price: 280, starsRequired: 4, requires: 'generator-1',
    blurb: 'Reserve path. Steady trickle, huge tank — great for ion and nova.',
    spec: { id: 'generator-reserve-2', outputPerTick: 2.5, capacity: 130, pulseDrainFraction: 0.28 },
  },
  'generator-reserve-3': {
    system: 'generator', name: 'Singularity Bank', price: 950, starsRequired: 18, requires: 'generator-reserve-2',
    blurb: 'Reserve path. Enormous bank. Fire in bursts. Pairs perfectly with FULL CHARGE.',
    spec: { id: 'generator-reserve-3', outputPerTick: 3, capacity: 220, pulseDrainFraction: 0.22 },
  },

  // ── Motor: Speed path (compress timeline, high draw) ─────────────────────────
  'motor-1': {
    system: 'motor', name: 'Drift Motor', price: 0,
    blurb: 'Steady pace, sips power. Branch: Rush or Tactical.',
    spec: { id: 'motor-1', timelineMultiplier: 1, powerDrawPerTick: 0.3 },
  },
  'motor-2': {
    system: 'motor', name: 'Surge Motor', price: 400, starsRequired: 4, requires: 'motor-1',
    blurb: 'Rush path. Waves arrive twice as fast. Time-star goldmine — if you survive.',
    spec: { id: 'motor-2', timelineMultiplier: 2.0, powerDrawPerTick: 1.2 },
  },
  'motor-3': {
    system: 'motor', name: 'Comet Drive', price: 1100, starsRequired: 18, requires: 'motor-2',
    blurb: 'Rush path. 3.5× timeline. Enemies erupt before you breathe. You were warned.',
    spec: { id: 'motor-3', timelineMultiplier: 3.5, powerDrawPerTick: 2.5 },
  },

  // ── Motor: Tactical path (normal speed, extra card offers) ───────────────────
  'motor-tactical-2': {
    system: 'motor', name: 'Tactical Engine', price: 350, starsRequired: 4, requires: 'motor-1',
    blurb: 'Tactical path. Same pace, sips power, +1 bonus card per support call.',
    spec: { id: 'motor-tactical-2', timelineMultiplier: 1, powerDrawPerTick: 0.1, bonusCardsPerSupportCall: 1 },
  },
  'motor-tactical-3': {
    system: 'motor', name: 'Strategic Drive', price: 900, starsRequired: 18, requires: 'motor-tactical-2',
    blurb: 'Tactical path. Slight speed boost, +2 bonus cards per call, +2 rerolls/mission.',
    spec: { id: 'motor-tactical-3', timelineMultiplier: 1.1, powerDrawPerTick: 0.15, bonusCardsPerSupportCall: 2, bonusRerollsPerMission: 2 },
  },
};


export function itemById(id: string): CatalogItem {
  const item = ITEMS[id];
  if (item === undefined) throw new Error(`Unknown shop item "${id}"`);
  return item;
}

/** Returns all ancestor item IDs for a given item, walking the requires chain upward. */
export function requiresAncestors(itemId: string): string[] {
  const ancestors: string[] = [];
  let current = itemId;
  for (;;) {
    const item = ITEMS[current];
    if (item === undefined || item.requires === undefined) break;
    ancestors.push(item.requires);
    current = item.requires;
  }
  return ancestors;
}

export function weaponSpecById(id: string): WeaponSpec {
  const item = itemById(id);
  if (item.system !== 'weapon') throw new Error(`Item "${id}" is not a weapon`);
  return item.spec;
}

export function shieldSpecById(id: string): ShieldSpec {
  const item = itemById(id);
  if (item.system !== 'shield') throw new Error(`Item "${id}" is not a shield`);
  return item.spec;
}

export function generatorSpecById(id: string): GeneratorSpec {
  const item = itemById(id);
  if (item.system !== 'generator') throw new Error(`Item "${id}" is not a generator`);
  return item.spec;
}

export function motorSpecById(id: string): MotorSpec {
  const item = itemById(id);
  if (item.system !== 'motor') throw new Error(`Item "${id}" is not a motor`);
  return item.spec;
}

// ---------- Reserve supplies (§3.7): permanent purchase, charges refill every mission ----------

export interface SupplyCatalogEntry {
  spec: SupplySpec;
  pricePerCharge: number;
}

export const SUPPLIES: Record<string, SupplyCatalogEntry> = {
  'sup-shield': {
    pricePerCharge: 120,
    spec: {
      id: 'sup-shield', name: 'SHIELD BOOST', description: 'Instantly restore 20 shield',
      kind: 'shield-restore', magnitude: 20, durationTicks: 0, maxCharges: 3,
    },
  },
  'sup-energy': {
    pricePerCharge: 150,
    spec: {
      id: 'sup-energy', name: 'ENERGY FLUSH', description: 'Instantly refill energy',
      kind: 'energy-refill', magnitude: 0, durationTicks: 0, maxCharges: 2,
    },
  },
  'sup-damage': {
    pricePerCharge: 200,
    spec: {
      id: 'sup-damage', name: 'RAGE PROTOCOL', description: 'Double damage for 5 s',
      kind: 'damage-boost', magnitude: 2, durationTicks: 50, maxCharges: 2,
    },
  },
};

export function supplyById(id: string): SupplyCatalogEntry {
  const entry = SUPPLIES[id];
  if (entry === undefined) throw new Error(`Unknown supply "${id}"`);
  return entry;
}

// ---------- Ships ----------

export const DEFAULT_SHIP_ID = 'ship-interceptor';

export const SHIPS: Record<string, ShipSpec> = {
  'ship-interceptor': {
    id: 'ship-interceptor', name: 'Interceptor', hull: 80, price: 0,
    passiveKind: 'enemy-miss-bonus', passiveValue: 0.10,
    passiveDescription: 'Enemies miss +10% more often',
  },
  'ship-tanker': {
    id: 'ship-tanker', name: 'Tanker', hull: 150, price: 1200, starsRequired: 18,
    passiveKind: 'collision-reduction', passiveValue: 0.5,
    passiveDescription: 'Collision damage −50%',
  },
  'ship-salvager': {
    id: 'ship-salvager', name: 'Salvager', hull: 100, price: 900, starsRequired: 4,
    passiveKind: 'coin-bonus', passiveValue: 1.5,
    passiveDescription: '+50% coins from kills',
  },
  'ship-reactor': {
    id: 'ship-reactor', name: 'Reactor', hull: 90, price: 1000, starsRequired: 18,
    passiveKind: 'generator-capacity-bonus', passiveValue: 1.5,
    passiveDescription: 'Generator capacity +50%',
  },
  'ship-warship': {
    id: 'ship-warship', name: 'Warship', hull: 110, price: 1400, starsRequired: 38,
    passiveKind: 'crit-mult-override', passiveValue: 3.0,
    passiveDescription: 'Crits deal ×3 instead of ×2',
  },
};

export function shipById(id: string): ShipSpec {
  const ship = SHIPS[id];
  if (ship === undefined) throw new Error(`Unknown ship "${id}"`);
  return ship;
}
