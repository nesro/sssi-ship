// Per-system configuration for the six equippable-kind shop systems (weapon, rear
// weapon, shield, generator, motor, ship). One generic computeKindRows() in hub.ts
// is parameterised by these configs instead of six bespoke per-tab builders — this
// is what makes the six systems provably consistent with each other.
//
// Lives in src/viewmodel/, not src/data/items.ts: configs depend on SaveData (save
// layer) and icon-key lookups (view-adjacent), which would create a layering
// violation if pulled into the data layer. Icon keys come from src/view/textureKeys.ts
// only — never src/view/textures.ts, which imports Phaser.

import {
  GENERATOR_KINDS, generatorKindDisplayName, itemById, MAX_GENERATOR_LEVEL,
  MAX_MOTOR_LEVEL, MAX_REAR_WEAPON_LEVEL, MAX_SHIELD_LEVEL, MAX_SHIP_LEVEL,
  MAX_SIDE_WEAPON_LEVEL, MAX_WEAPON_LEVEL,
  MOTOR_KINDS, motorKindDisplayName, REAR_WEAPON_ITEMS, REAR_WEAPON_KINDS,
  rearWeaponKindDisplayName, rearWeaponSpecAtLevel, SHIELD_KINDS, shieldKindDisplayName,
  SHIP_KINDS, shipKindDisplayName, SHIPS, SIDE_WEAPON_ITEMS, SIDE_WEAPON_KINDS,
  sideWeaponKindDisplayName, sideWeaponSpecAtLevel, WEAPON_KINDS, weaponKindDisplayName, weaponSpecAtLevel,
} from '../data/items';
import type { GeneratorKind, MotorKind, ShieldKind, ShipKind } from '../data/items';
import type { RearWeaponKind, SideWeaponKind, WeaponKind } from '../core/types';
import type { SaveData } from '../save/SaveManager';
import {
  iconTextureForGeneratorKind, iconTextureForMotorKind, iconTextureForRearWeaponId,
  iconTextureForShieldKind, iconTextureForShipKind, iconTextureForSideWeaponId, iconTextureForWeaponId,
} from '../view/textureKeys';

export type ShopTab = 'loadout' | 'ship' | 'weapon' | 'rear-weapon' | 'side-weapon' | 'shield' | 'generator' | 'motor' | 'supplies';

export interface ShopSystemConfig {
  systemKey: ShopTab;
  kinds: readonly string[];
  maxLevel: number;
  hasNoneOption: boolean;

  itemId: (kind: string, level: number) => string;
  kindDisplayName: (kind: string) => string;
  itemPrice: (kind: string, level: number) => number;
  itemStarsRequired: (kind: string, level: number) => number;
  /** Price of whatever is currently equipped in this system; 0 if nothing is equipped. */
  equippedPrice: (save: SaveData) => number;
  /** Equipped level of `kind` specifically; 0 if a different kind (or nothing) is equipped. */
  equippedLevelForKind: (save: SaveData, kind: string) => number;
  iconKey: (kind: string, level: number) => string;
  iconScale: (displayLevel: number) => number;
  /** Stat/blurb lines shown for the equipped level of the selected kind; [] if level is 0. */
  detailLines: (kind: string, equippedLevel: number) => string[];
}

/** Parses the trailing `-N` level off an id whose prefix matches `kind`; 0 if it doesn't. */
function levelIfPrefixMatches(id: string | null, prefix: string): number {
  if (id === null || !id.startsWith(prefix)) return 0;
  const level = parseInt(id.slice(prefix.length), 10);
  return isNaN(level) ? 0 : level;
}

/** Shared icon-growth curve for every system except ship (which uses a fixed scale). */
function standardIconScale(displayLevel: number): number {
  return 1.2 + Math.max(0, displayLevel - 1) * 0.07;
}

export const WEAPON_SYSTEM: ShopSystemConfig = {
  systemKey: 'weapon',
  kinds: WEAPON_KINDS,
  maxLevel: MAX_WEAPON_LEVEL,
  hasNoneOption: true,
  itemId: (kind, level) => `${kind}-${String(level)}`,
  kindDisplayName: (kind) => weaponKindDisplayName(kind as WeaponKind),
  itemPrice: (kind, level) => itemById(`${kind}-${String(level)}`).price,
  itemStarsRequired: (kind, level) => itemById(`${kind}-${String(level)}`).starsRequired ?? 0,
  equippedPrice: (save) => (save.equipped.weapon !== null ? itemById(save.equipped.weapon).price : 0),
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.weapon, `${kind}-`),
  iconKey: (kind, level) => iconTextureForWeaponId(`${kind}-${String(level)}`),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    const spec = weaponSpecAtLevel(kind as WeaponKind, equippedLevel);
    const targets = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    return [
      itemById(`${kind}-${String(equippedLevel)}`).blurb,
      `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`,
      `${targets} targets  ${String(spec.energyPerShot)} energy`,
    ];
  },
};

export const REAR_WEAPON_SYSTEM: ShopSystemConfig = {
  systemKey: 'rear-weapon',
  kinds: REAR_WEAPON_KINDS,
  maxLevel: MAX_REAR_WEAPON_LEVEL,
  hasNoneOption: true,
  itemId: (kind, level) => `${kind}-${String(level)}`,
  kindDisplayName: (kind) => rearWeaponKindDisplayName(kind as RearWeaponKind),
  itemPrice: (kind, level) => REAR_WEAPON_ITEMS[`${kind}-${String(level)}`]?.price ?? 0,
  itemStarsRequired: (kind, level) => REAR_WEAPON_ITEMS[`${kind}-${String(level)}`]?.starsRequired ?? 0,
  equippedPrice: (save) => (save.equipped.rearWeapon !== null ? (REAR_WEAPON_ITEMS[save.equipped.rearWeapon]?.price ?? 0) : 0),
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.rearWeapon, `${kind}-`),
  iconKey: (kind, level) => iconTextureForRearWeaponId(`${kind}-${String(level)}`),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    const spec = rearWeaponSpecAtLevel(kind as RearWeaponKind, equippedLevel);
    return [
      REAR_WEAPON_ITEMS[`${kind}-${String(equippedLevel)}`]?.blurb ?? '',
      `${String(spec.damagePerShot)}dmg  ${String(spec.ticksBetweenShots)}t`,
      `${String(spec.maxTargets)} targets  ${String(spec.energyPerShot)} energy`,
    ];
  },
};

export const SIDE_WEAPON_SYSTEM: ShopSystemConfig = {
  systemKey: 'side-weapon',
  kinds: SIDE_WEAPON_KINDS,
  maxLevel: MAX_SIDE_WEAPON_LEVEL,
  hasNoneOption: true,
  itemId: (kind, level) => `${kind}-${String(level)}`,
  kindDisplayName: (kind) => sideWeaponKindDisplayName(kind as SideWeaponKind),
  itemPrice: (kind, level) => SIDE_WEAPON_ITEMS[`${kind}-${String(level)}`]?.price ?? 0,
  itemStarsRequired: (kind, level) => SIDE_WEAPON_ITEMS[`${kind}-${String(level)}`]?.starsRequired ?? 0,
  equippedPrice: (save) => (save.equipped.sideWeapon !== null ? (SIDE_WEAPON_ITEMS[save.equipped.sideWeapon]?.price ?? 0) : 0),
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.sideWeapon, `${kind}-`),
  iconKey: (kind, level) => iconTextureForSideWeaponId(`${kind}-${String(level)}`),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    const spec = sideWeaponSpecAtLevel(kind as SideWeaponKind, equippedLevel);
    const targets = spec.maxTargets === Infinity ? '∞' : String(spec.maxTargets);
    return [
      SIDE_WEAPON_ITEMS[`${kind}-${String(equippedLevel)}`]?.blurb ?? '',
      `${String(spec.damagePerShot)}dmg  ${String(spec.maxCharges ?? 0)} charges/mission`,
      `${targets} targets`,
    ];
  },
};

export const SHIELD_SYSTEM: ShopSystemConfig = {
  systemKey: 'shield',
  kinds: SHIELD_KINDS,
  maxLevel: MAX_SHIELD_LEVEL,
  hasNoneOption: true,
  itemId: (kind, level) => `shield-${kind}-${String(level)}`,
  kindDisplayName: (kind) => shieldKindDisplayName(kind as ShieldKind),
  itemPrice: (kind, level) => itemById(`shield-${kind}-${String(level)}`).price,
  itemStarsRequired: (kind, level) => itemById(`shield-${kind}-${String(level)}`).starsRequired ?? 0,
  equippedPrice: (save) => (save.equipped.shield !== null ? itemById(save.equipped.shield).price : 0),
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.shield, `shield-${kind}-`),
  iconKey: (kind) => iconTextureForShieldKind(kind),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    return [itemById(`shield-${kind}-${String(equippedLevel)}`).blurb];
  },
};

export const GENERATOR_SYSTEM: ShopSystemConfig = {
  systemKey: 'generator',
  kinds: GENERATOR_KINDS,
  maxLevel: MAX_GENERATOR_LEVEL,
  hasNoneOption: false,
  itemId: (kind, level) => `generator-${kind}-${String(level)}`,
  kindDisplayName: (kind) => generatorKindDisplayName(kind as GeneratorKind),
  itemPrice: (kind, level) => itemById(`generator-${kind}-${String(level)}`).price,
  itemStarsRequired: (kind, level) => itemById(`generator-${kind}-${String(level)}`).starsRequired ?? 0,
  equippedPrice: (save) => itemById(save.equipped.generator).price,
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.generator, `generator-${kind}-`),
  iconKey: (kind) => iconTextureForGeneratorKind(kind),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    return [itemById(`generator-${kind}-${String(equippedLevel)}`).blurb];
  },
};

export const MOTOR_SYSTEM: ShopSystemConfig = {
  systemKey: 'motor',
  kinds: MOTOR_KINDS,
  maxLevel: MAX_MOTOR_LEVEL,
  hasNoneOption: false,
  itemId: (kind, level) => `motor-${kind}-${String(level)}`,
  kindDisplayName: (kind) => motorKindDisplayName(kind as MotorKind),
  itemPrice: (kind, level) => itemById(`motor-${kind}-${String(level)}`).price,
  itemStarsRequired: (kind, level) => itemById(`motor-${kind}-${String(level)}`).starsRequired ?? 0,
  equippedPrice: (save) => itemById(save.equipped.motor).price,
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.motor, `motor-${kind}-`),
  iconKey: (kind) => iconTextureForMotorKind(kind),
  iconScale: standardIconScale,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    return [itemById(`motor-${kind}-${String(equippedLevel)}`).blurb];
  },
};

export const SHIP_SYSTEM: ShopSystemConfig = {
  systemKey: 'ship',
  kinds: SHIP_KINDS,
  maxLevel: MAX_SHIP_LEVEL,
  hasNoneOption: false,
  itemId: (kind, level) => `ship-${kind}-${String(level)}`,
  kindDisplayName: (kind) => shipKindDisplayName(kind as ShipKind),
  itemPrice: (kind, level) => SHIPS[`ship-${kind}-${String(level)}`]?.price ?? 0,
  itemStarsRequired: (kind, level) => SHIPS[`ship-${kind}-${String(level)}`]?.starsRequired ?? 0,
  equippedPrice: (save) => SHIPS[save.equipped.ship]?.price ?? 0,
  equippedLevelForKind: (save, kind) => levelIfPrefixMatches(save.equipped.ship, `ship-${kind}-`),
  iconKey: (kind) => iconTextureForShipKind(kind),
  // Ships keep a fixed 0.6 scale at every level — an intentional visual choice
  // (larger ship icons read worse in the row), not unified with the other systems.
  iconScale: () => 0.6,
  detailLines: (kind, equippedLevel) => {
    if (equippedLevel <= 0) return [];
    const ship = SHIPS[`ship-${kind}-${String(equippedLevel)}`];
    if (ship === undefined) return [];
    return [ship.blurb, `♥${String(ship.hull)}  ${ship.passiveDescription}`];
  },
};

/** All seven kind-row shop systems, in tab display order. */
const SHOP_SYSTEMS: readonly ShopSystemConfig[] = [
  SHIP_SYSTEM, WEAPON_SYSTEM, REAR_WEAPON_SYSTEM, SIDE_WEAPON_SYSTEM, SHIELD_SYSTEM, GENERATOR_SYSTEM, MOTOR_SYSTEM,
];

export function shopSystemFor(tab: ShopTab): ShopSystemConfig | null {
  return SHOP_SYSTEMS.find((s) => s.systemKey === tab) ?? null;
}
