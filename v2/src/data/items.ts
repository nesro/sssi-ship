import type {
  GeneratorSpec,
  MotorSpec,
  RearWeaponKind,
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

/** Stars required per weapon kind and level (index = level − 1). Lv1 + Lv2 always 0 — star-gate starts at Lv3. */
export const WEAPON_STARS: Record<WeaponKind, [number, number, number, number, number]> = {
  pulse:   [0, 0, 10, 18, 28],
  ion:     [0, 0, 10, 18, 28],
  scatter: [0, 0, 10, 18, 28],
  nova:    [0, 0, 18, 28, 38],
};

/** Coin cost per level (index = level − 1). Pulse level 1 is free (mandatory starter). Later types cost coins from Lv1. */
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

// ---------- Rear weapon system ----------

export const REAR_WEAPON_KINDS: RearWeaponKind[] = ['grenade', 'flak', 'plasma', 'arc', 'cluster'];
export const MAX_REAR_WEAPON_LEVEL = 5;

export interface RearWeaponCatalogItem {
  system: 'rear-weapon';
  name: string;
  price: number;
  starsRequired?: number;
  blurb: string;
  spec: WeaponSpec;
}

const REAR_WEAPON_BASE: Record<RearWeaponKind, {
  displayName: string;
  blurb: string;
  damage: number;
  ticks: number;
  energy: number;
  targets: number;
  falloff: number;
}> = {
  grenade: { displayName: 'Grenade Launcher', blurb: 'Balanced mid-queue burst. Hits a cluster of 3 enemies.',   damage: 12, ticks: 10, energy: 10, targets: 3, falloff: 0.80 },
  flak:    { displayName: 'Flak Turret',      blurb: 'Wide shrapnel spray. Anti-swarm specialist.',              damage:  5, ticks:  8, energy: 12, targets: 5, falloff: 0.70 },
  plasma:  { displayName: 'Plasma Cannon',    blurb: 'Slow charge, massive blast. Punishes high-HP targets.',    damage: 25, ticks: 14, energy: 18, targets: 2, falloff: 0.60 },
  arc:     { displayName: 'Arc Discharger',   blurb: 'Electric chain between two enemies. Reliable AoE.',        damage: 15, ticks:  9, energy: 11, targets: 2, falloff: 0.85 },
  cluster: { displayName: 'Cluster Bomb',     blurb: 'Submunition scatter. Maximum spread, minimum per-target.', damage:  3, ticks:  7, energy: 11, targets: 6, falloff: 0.65 },
};

/** Stars required per rear weapon kind and level (index = level − 1). */
const REAR_WEAPON_STARS: Record<RearWeaponKind, [number, number, number, number, number]> = {
  grenade: [0, 0, 10, 18, 28],
  flak:    [0, 0, 10, 18, 28],
  plasma:  [0, 0, 10, 18, 28],
  arc:     [0, 0, 10, 18, 28],
  cluster: [0, 0, 10, 18, 28],
};

const REAR_WEAPON_PRICES: Record<RearWeaponKind, [number, number, number, number, number]> = {
  grenade: [0,    400,  800, 1600, 3200],
  flak:    [160,  320,  640, 1280, 2560],
  plasma:  [280,  560, 1100, 2200, 4400],
  arc:     [220,  440,  880, 1760, 3520],
  cluster: [150,  300,  600, 1200, 2400],
};

export function rearWeaponSpecAtLevel(kind: RearWeaponKind, level: number): WeaponSpec {
  const base = REAR_WEAPON_BASE[kind];
  const t = level - 1;
  const extraTargets =
    kind === 'grenade' && level >= 3 ? 1 :
    kind === 'cluster' && level >= 5 ? 1 : 0;
  return {
    id: `${kind}-${String(level)}`,
    kind,
    damagePerShot: Math.round(base.damage * Math.pow(1.22, t) * 10) / 10,
    ticksBetweenShots: Math.max(2, Math.round(base.ticks * Math.pow(0.91, t))),
    energyPerShot: Math.round(base.energy * Math.pow(1.15, t) * 10) / 10,
    maxTargets: base.targets + extraTargets,
    falloffPerTarget: base.falloff,
    critChance: 0,
    missChance: 0,
    critMult: 2.0,
  };
}

function rearWeaponDisplayName(kind: RearWeaponKind, level: number): string {
  return `${REAR_WEAPON_BASE[kind].displayName} Lv ${String(level)}`;
}

export function rearWeaponKindDisplayName(kind: RearWeaponKind): string {
  return REAR_WEAPON_BASE[kind].displayName;
}

export const REAR_WEAPON_ITEMS: Record<string, RearWeaponCatalogItem> = Object.fromEntries(
  REAR_WEAPON_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_REAR_WEAPON_LEVEL }, (_, i) => {
      const level = i + 1;
      const id = `${kind}-${String(level)}`;
      return [id, {
        system: 'rear-weapon' as const,
        name: rearWeaponDisplayName(kind, level),
        price: REAR_WEAPON_PRICES[kind][i] ?? 0,
        starsRequired: REAR_WEAPON_STARS[kind][i] ?? 0,
        blurb: REAR_WEAPON_BASE[kind].blurb,
        spec: rearWeaponSpecAtLevel(kind, level),
      }];
    }),
  ),
);

export function rearWeaponSpecById(id: string): WeaponSpec {
  const item = REAR_WEAPON_ITEMS[id];
  if (item === undefined) throw new Error(`Unknown rear weapon "${id}"`);
  return item.spec;
}

// ---------- Shield system ----------

export type ShieldKind = 'wall' | 'reflex' | 'bulwark' | 'flux';
export const SHIELD_KINDS: readonly ShieldKind[] = ['wall', 'reflex', 'bulwark', 'flux'];
export const MAX_SHIELD_LEVEL = 5;

const SHIELD_BASE: Record<ShieldKind, {
  displayName: string; blurb: string;
  caps: [number, number, number, number, number];
  fractions: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
}> = {
  wall:    { displayName: 'Wall',    blurb: 'Thick plate — survives hits, slow recharge.',         caps: [ 30,  60, 100, 150, 220], fractions: [0.08, 0.09, 0.10, 0.12, 0.14], prices: [   0,  300,  750, 1500, 2800], stars: [ 0,  0, 10, 18, 28] },
  reflex:  { displayName: 'Reflex',  blurb: 'Thin plate, instant snap-back. Loves fast pulses.',   caps: [ 15,  22,  30,  40,  55], fractions: [0.35, 0.42, 0.52, 0.62, 0.75], prices: [ 200,  400,  800, 1500, 2800], stars: [ 0,  0, 10, 18, 28] },
  bulwark: { displayName: 'Bulwark', blurb: 'Extreme capacity, minimal regen. True tank armour.',  caps: [ 60, 100, 155, 225, 320], fractions: [0.05, 0.06, 0.07, 0.08, 0.10], prices: [ 400,  800, 1500, 2800, 5000], stars: [10, 18, 28, 38, 50] },
  flux:    { displayName: 'Flux',    blurb: 'Balanced cap and pulse rate. Works with anything.',   caps: [ 40,  70, 105, 150, 210], fractions: [0.18, 0.22, 0.26, 0.32, 0.38], prices: [ 350,  650, 1200, 2200, 4000], stars: [10, 18, 28, 38, 50] },
};

export function shieldKindDisplayName(kind: ShieldKind): string { return SHIELD_BASE[kind].displayName; }

export function shieldSpecAtLevel(kind: ShieldKind, level: number): ShieldSpec {
  const base = SHIELD_BASE[kind];
  const i = level - 1;
  return { id: `shield-${kind}-${String(level)}`, capacity: base.caps[i] ?? 30, pulseShieldFraction: base.fractions[i] ?? 0.08 };
}

const SHIELD_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  SHIELD_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_SHIELD_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = SHIELD_BASE[kind];
      return [`shield-${kind}-${String(level)}`, {
        system: 'shield' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: shieldSpecAtLevel(kind, level),
      }];
    }),
  ),
);

// ---------- Generator system ----------

export type GeneratorKind = 'torrent' | 'reserve' | 'surge' | 'steady';
export const GENERATOR_KINDS: readonly GeneratorKind[] = ['torrent', 'reserve', 'surge', 'steady'];
export const MAX_GENERATOR_LEVEL = 5;

const GENERATOR_BASE: Record<GeneratorKind, {
  displayName: string; blurb: string;
  outputs: [number, number, number, number, number];
  caps: [number, number, number, number, number];
  drains: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
}> = {
  torrent: { displayName: 'Torrent', blurb: 'High output, small buffer. Feeds fast-cycling weapons.',        outputs: [ 2,  4,  7, 11, 16], caps: [50, 45, 40, 38, 35], drains: [0.50, 0.55, 0.60, 0.65, 0.70], prices: [   0,  300,  800, 1600, 3000], stars: [ 0,  0, 10, 18, 28] },
  reserve: { displayName: 'Reserve', blurb: 'Vast tank, slow trickle. Charge then unleash.',                 outputs: [1.5, 2.5, 3.5,  5,  7], caps: [100, 160, 240, 340, 480], drains: [0.28, 0.24, 0.20, 0.17, 0.14], prices: [ 280,  550, 1050, 2000, 3800], stars: [ 0,  0, 10, 18, 28] },
  surge:   { displayName: 'Surge',   blurb: 'Maximum output, tiny battery. Ion and nova goldmine.',          outputs: [ 3,  5,  9, 14, 20], caps: [30, 28, 26, 25, 25], drains: [0.72, 0.78, 0.83, 0.88, 0.92], prices: [ 350,  650, 1200, 2200, 4000], stars: [10, 18, 28, 38, 50] },
  steady:  { displayName: 'Steady',  blurb: 'Reliable mid-range. Pairs well with any loadout.',              outputs: [2.5,  4,  6,  9, 13], caps: [70, 82, 95, 110, 128], drains: [0.38, 0.34, 0.30, 0.26, 0.22], prices: [ 320,  600, 1100, 2000, 3600], stars: [10, 18, 28, 38, 50] },
};

export function generatorKindDisplayName(kind: GeneratorKind): string { return GENERATOR_BASE[kind].displayName; }

export function generatorSpecAtLevel(kind: GeneratorKind, level: number): GeneratorSpec {
  const base = GENERATOR_BASE[kind];
  const i = level - 1;
  return { id: `generator-${kind}-${String(level)}`, outputPerTick: base.outputs[i] ?? 2, capacity: base.caps[i] ?? 50, pulseDrainFraction: base.drains[i] ?? 0.5 };
}

const GENERATOR_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  GENERATOR_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_GENERATOR_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = GENERATOR_BASE[kind];
      return [`generator-${kind}-${String(level)}`, {
        system: 'generator' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: generatorSpecAtLevel(kind, level),
      }];
    }),
  ),
);

// ---------- Motor system ----------

export type MotorKind = 'rush' | 'tactical' | 'sentinel' | 'overdrive';
export const MOTOR_KINDS: readonly MotorKind[] = ['rush', 'tactical', 'sentinel', 'overdrive'];
export const MAX_MOTOR_LEVEL = 5;

const MOTOR_BASE: Record<MotorKind, {
  displayName: string; blurb: string;
  mults: [number, number, number, number, number];
  draws: [number, number, number, number, number];
  prices: [number, number, number, number, number];
  stars: [number, number, number, number, number];
  bonusCards?: [number, number, number, number, number];
  bonusRerolls?: [number, number, number, number, number];
}> = {
  rush:      { displayName: 'Rush',      blurb: 'Fast timeline, high draw. Time-star goldmine.',                     mults: [1.0, 2.0, 3.0, 4.2, 5.8], draws: [0.30, 1.20, 2.20, 3.80,  6.0], prices: [   0,  400, 1000, 2000, 3800], stars: [ 0,  0, 10, 18, 28] },
  tactical:  { displayName: 'Tactical',  blurb: 'Normal speed, extra card draws each support call.',                 mults: [1.0, 1.0, 1.1, 1.1, 1.2], draws: [0.30, 0.10, 0.12, 0.15, 0.18], prices: [ 350,  600, 1100, 2000, 3600], stars: [ 0,  0, 10, 18, 28], bonusCards: [0, 1, 2, 3, 4], bonusRerolls: [0, 0, 1, 2, 3] },
  sentinel:  { displayName: 'Sentinel',  blurb: 'Slow timeline — enemies crawl. Very low energy draw.',             mults: [1.0, 0.7, 0.55, 0.45, 0.35], draws: [0.30, 0.08, 0.05, 0.03, 0.01], prices: [ 300,  550, 1000, 1900, 3400], stars: [ 0,  0, 10, 18, 28] },
  overdrive: { displayName: 'Overdrive', blurb: 'Extreme speed and draw. Endgame only.',                            mults: [3.0, 5.0, 7.5, 10.5, 14.0], draws: [3.50, 7.00, 12.0, 18.0, 26.0], prices: [ 800, 1600, 3000, 5000, 8000], stars: [18, 28, 38, 50, 65] },
};

export function motorKindDisplayName(kind: MotorKind): string { return MOTOR_BASE[kind].displayName; }

export function motorSpecAtLevel(kind: MotorKind, level: number): MotorSpec {
  const base = MOTOR_BASE[kind];
  const i = level - 1;
  const spec: MotorSpec = {
    id: `motor-${kind}-${String(level)}`,
    timelineMultiplier: base.mults[i] ?? 1,
    powerDrawPerTick: base.draws[i] ?? 0.3,
  };
  const bonus = base.bonusCards?.[i] ?? 0;
  const rerolls = base.bonusRerolls?.[i] ?? 0;
  if (bonus > 0) spec.bonusCardsPerSupportCall = bonus;
  if (rerolls > 0) spec.bonusRerollsPerMission = rerolls;
  return spec;
}

const MOTOR_ITEMS: Record<string, CatalogItem> = Object.fromEntries(
  MOTOR_KINDS.flatMap((kind) =>
    Array.from({ length: MAX_MOTOR_LEVEL }, (_, i) => {
      const level = i + 1;
      const base = MOTOR_BASE[kind];
      return [`motor-${kind}-${String(level)}`, {
        system: 'motor' as const,
        name: `${base.displayName} Lv${String(level)}`,
        price: base.prices[i] ?? 0,
        starsRequired: base.stars[i] ?? 0,
        blurb: base.blurb,
        spec: motorSpecAtLevel(kind, level),
      }];
    }),
  ),
);

export const ITEMS: Record<string, CatalogItem> = {
  ...WEAPON_ITEMS,
  ...SHIELD_ITEMS,
  ...GENERATOR_ITEMS,
  ...MOTOR_ITEMS,
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

export type ShipKind = 'interceptor' | 'salvager' | 'reactor' | 'tanker' | 'warship';
export const SHIP_KINDS: readonly ShipKind[] = ['interceptor', 'salvager', 'reactor', 'tanker', 'warship'] as const;
export const MAX_SHIP_LEVEL = 5;

export const DEFAULT_SHIP_ID = 'ship-interceptor-1';

export const SHIPS: Record<string, ShipSpec> = {
  'ship-interceptor-1': { id: 'ship-interceptor-1', kind: 'interceptor', level: 1, name: 'Interceptor', hull: 80,  price: 0,    passiveKind: 'enemy-miss-bonus',        passiveValue: 0.10, passiveDescription: 'Enemies miss +10% more often' },
  'ship-interceptor-2': { id: 'ship-interceptor-2', kind: 'interceptor', level: 2, name: 'Interceptor', hull: 96,  price: 200,  passiveKind: 'enemy-miss-bonus',        passiveValue: 0.12, passiveDescription: 'Enemies miss +12% more often' },
  'ship-interceptor-3': { id: 'ship-interceptor-3', kind: 'interceptor', level: 3, name: 'Interceptor', hull: 115, price: 500,  passiveKind: 'enemy-miss-bonus',        passiveValue: 0.15, passiveDescription: 'Enemies miss +15% more often' },
  'ship-interceptor-4': { id: 'ship-interceptor-4', kind: 'interceptor', level: 4, name: 'Interceptor', hull: 140, price: 1000, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.18, passiveDescription: 'Enemies miss +18% more often' },
  'ship-interceptor-5': { id: 'ship-interceptor-5', kind: 'interceptor', level: 5, name: 'Interceptor', hull: 170, price: 1800, passiveKind: 'enemy-miss-bonus',        passiveValue: 0.22, passiveDescription: 'Enemies miss +22% more often' },

  'ship-salvager-1': { id: 'ship-salvager-1', kind: 'salvager', level: 1, name: 'Salvager', hull: 100, price: 900,  passiveKind: 'coin-bonus', passiveValue: 1.5, passiveDescription: '+50% coins from kills' },
  'ship-salvager-2': { id: 'ship-salvager-2', kind: 'salvager', level: 2, name: 'Salvager', hull: 120, price: 1200, passiveKind: 'coin-bonus', passiveValue: 1.7, passiveDescription: '+70% coins from kills' },
  'ship-salvager-3': { id: 'ship-salvager-3', kind: 'salvager', level: 3, name: 'Salvager', hull: 145, price: 1600, passiveKind: 'coin-bonus', passiveValue: 2.0, passiveDescription: '+100% coins from kills' },
  'ship-salvager-4': { id: 'ship-salvager-4', kind: 'salvager', level: 4, name: 'Salvager', hull: 175, price: 2200, passiveKind: 'coin-bonus', passiveValue: 2.4, passiveDescription: '+140% coins from kills' },
  'ship-salvager-5': { id: 'ship-salvager-5', kind: 'salvager', level: 5, name: 'Salvager', hull: 215, price: 3200, passiveKind: 'coin-bonus', passiveValue: 3.0, passiveDescription: '+200% coins from kills' },

  'ship-reactor-1': { id: 'ship-reactor-1', kind: 'reactor', level: 1, name: 'Reactor', hull: 90,  price: 1000, starsRequired: 18, passiveKind: 'generator-capacity-bonus', passiveValue: 1.5, passiveDescription: 'Generator capacity +50%' },
  'ship-reactor-2': { id: 'ship-reactor-2', kind: 'reactor', level: 2, name: 'Reactor', hull: 108, price: 1350, passiveKind: 'generator-capacity-bonus', passiveValue: 1.7, passiveDescription: 'Generator capacity +70%' },
  'ship-reactor-3': { id: 'ship-reactor-3', kind: 'reactor', level: 3, name: 'Reactor', hull: 130, price: 1800, passiveKind: 'generator-capacity-bonus', passiveValue: 2.0, passiveDescription: 'Generator capacity +100%' },
  'ship-reactor-4': { id: 'ship-reactor-4', kind: 'reactor', level: 4, name: 'Reactor', hull: 157, price: 2500, passiveKind: 'generator-capacity-bonus', passiveValue: 2.4, passiveDescription: 'Generator capacity +140%' },
  'ship-reactor-5': { id: 'ship-reactor-5', kind: 'reactor', level: 5, name: 'Reactor', hull: 190, price: 3500, passiveKind: 'generator-capacity-bonus', passiveValue: 3.0, passiveDescription: 'Generator capacity +200%' },

  'ship-tanker-1': { id: 'ship-tanker-1', kind: 'tanker', level: 1, name: 'Tanker', hull: 150, price: 1200, starsRequired: 18, passiveKind: 'collision-reduction', passiveValue: 0.50, passiveDescription: 'Collision damage −50%' },
  'ship-tanker-2': { id: 'ship-tanker-2', kind: 'tanker', level: 2, name: 'Tanker', hull: 180, price: 1650, passiveKind: 'collision-reduction', passiveValue: 0.60, passiveDescription: 'Collision damage −60%' },
  'ship-tanker-3': { id: 'ship-tanker-3', kind: 'tanker', level: 3, name: 'Tanker', hull: 218, price: 2300, passiveKind: 'collision-reduction', passiveValue: 0.70, passiveDescription: 'Collision damage −70%' },
  'ship-tanker-4': { id: 'ship-tanker-4', kind: 'tanker', level: 4, name: 'Tanker', hull: 264, price: 3200, passiveKind: 'collision-reduction', passiveValue: 0.80, passiveDescription: 'Collision damage −80%' },
  'ship-tanker-5': { id: 'ship-tanker-5', kind: 'tanker', level: 5, name: 'Tanker', hull: 320, price: 4500, passiveKind: 'collision-reduction', passiveValue: 0.90, passiveDescription: 'Collision damage −90%' },

  'ship-warship-1': { id: 'ship-warship-1', kind: 'warship', level: 1, name: 'Warship', hull: 110, price: 1400, starsRequired: 38, passiveKind: 'crit-mult-override', passiveValue: 3.0, passiveDescription: 'Crits deal ×3 instead of ×2' },
  'ship-warship-2': { id: 'ship-warship-2', kind: 'warship', level: 2, name: 'Warship', hull: 132, price: 1900, passiveKind: 'crit-mult-override', passiveValue: 3.5, passiveDescription: 'Crits deal ×3.5 instead of ×2' },
  'ship-warship-3': { id: 'ship-warship-3', kind: 'warship', level: 3, name: 'Warship', hull: 159, price: 2600, passiveKind: 'crit-mult-override', passiveValue: 4.0, passiveDescription: 'Crits deal ×4 instead of ×2' },
  'ship-warship-4': { id: 'ship-warship-4', kind: 'warship', level: 4, name: 'Warship', hull: 191, price: 3600, passiveKind: 'crit-mult-override', passiveValue: 5.0, passiveDescription: 'Crits deal ×5 instead of ×2' },
  'ship-warship-5': { id: 'ship-warship-5', kind: 'warship', level: 5, name: 'Warship', hull: 230, price: 5000, passiveKind: 'crit-mult-override', passiveValue: 6.0, passiveDescription: 'Crits deal ×6 instead of ×2' },
};

export function shipById(id: string): ShipSpec {
  const ship = SHIPS[id];
  if (ship === undefined) throw new Error(`Unknown ship "${id}"`);
  return ship;
}
