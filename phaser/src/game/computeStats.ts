// computeStats.ts
// Pure function: derives ComputedStats from a save's loadout + talent levels.
// Called once at mission start and cached for the duration of the run.

import type { SaveData } from '../SaveManager.js';
import type { SideWeaponType } from '../data/items.js';
import { ITEMS } from '../data/items.js';
import { talentLevel } from '../data/talents.js';

export interface ComputedStats {
  // Energy
  energyCapacity:       number;  // max energy pool
  energyRegenSec:       number;  // energy gained per second
  // Front weapon
  hasFrontWeapon:       boolean; // true when any front laser is equipped
  frontDamage:          number;  // HP removed per laser hit
  frontEnergyCost:      number;  // energy consumed per shot
  frontFireMs:          number;  // ms between shots (lower = faster)
  // Shields
  hasShield:            boolean; // true when any shield module is equipped
  shieldCapacity:       number;  // max shield HP
  shieldRegenSec:       number;  // shield HP/sec (costs 1 energy per HP restored)
  // Auto-dodge
  dodgeCost:            number;  // energy consumed per dodge activation
  dodgeLookaheadMs:     number;  // ms ahead to classify a shot as a threat (dodge_sense talent)
  // Side weapons
  leftWeapon:           SideWeaponType | null;
  rightWeapon:          SideWeaponType | null;
  spreadShotCost:       number;  // energy per Spread Shot activation
  heavyBeamCost:        number;  // energy per Heavy Beam activation
  sideWeaponCooldownMs: number;  // recharge time per side weapon button
}

// Fallback stats when no equipment is equipped in a slot.
const FALLBACK_ENERGY_CAPACITY  = 60;
const FALLBACK_ENERGY_REGEN     = 8;
const FALLBACK_FRONT_DAMAGE     = 8;
const FALLBACK_FRONT_ENERGY     = 4;
const FALLBACK_FRONT_FIRE_MS    = 400;
const BASE_DODGE_COST           = 10;
const BASE_SPREAD_COST          = 20;
const BASE_BEAM_COST            = 30;
const BASE_SIDE_COOLDOWN_MS     = 5000;

export function computeStats(save: SaveData): ComputedStats {
  const { ship, inventory, talents } = save;

  // ─── generator ───────────────────────────────────────────────────────────────
  let energyCapacity  = FALLBACK_ENERGY_CAPACITY;
  let energyRegenSec  = FALLBACK_ENERGY_REGEN;

  if (ship.generator) {
    const item  = ITEMS[ship.generator];
    const level = inventory[ship.generator]?.level ?? 0;
    const stats = item?.levels[level - 1]?.stats;
    if (stats) {
      energyCapacity = stats.energyCapacity ?? FALLBACK_ENERGY_CAPACITY;
      energyRegenSec = stats.energyRegenSec ?? FALLBACK_ENERGY_REGEN;
    }
  }

  energyCapacity += talentLevel(talents, 'bat_boost')  * 10;
  energyCapacity += talentLevel(talents, 'battery')    * 15;
  energyRegenSec += talentLevel(talents, 'eff_boost')  * 2;
  energyRegenSec += talentLevel(talents, 'efficiency') * 3;

  // ─── front weapon ────────────────────────────────────────────────────────────
  let frontDamage     = FALLBACK_FRONT_DAMAGE;
  let frontEnergyCost = FALLBACK_FRONT_ENERGY;
  let frontFireMs     = FALLBACK_FRONT_FIRE_MS;

  if (ship.frontWeapon) {
    const item  = ITEMS[ship.frontWeapon];
    const level = inventory[ship.frontWeapon]?.level ?? 0;
    const stats = item?.levels[level - 1]?.stats;
    if (stats) {
      frontDamage     = stats.damage     ?? FALLBACK_FRONT_DAMAGE;
      frontEnergyCost = stats.energyCost ?? FALLBACK_FRONT_ENERGY;
      frontFireMs     = stats.fireMs     ?? FALLBACK_FRONT_FIRE_MS;
    }
  }

  const dmgTalent     = talentLevel(talents, 'damage');
  const rateTalent    = talentLevel(talents, 'fire_rate');
  const weapEffTalent = talentLevel(talents, 'weapon_eff');

  // Travel node bonuses applied before keystone multipliers
  if (talentLevel(talents, 'dmg_boost') > 0)  frontDamage  = frontDamage  * 1.04;
  if (talentLevel(talents, 'fire_boost') > 0) frontFireMs  = frontFireMs  * 0.97;

  frontDamage     = frontDamage     * (1 + dmgTalent     * 0.08);
  frontEnergyCost = frontEnergyCost * (1 - weapEffTalent * 0.04);
  frontFireMs     = frontFireMs     * (1 - rateTalent    * 0.05);

  // ─── shields ─────────────────────────────────────────────────────────────────
  let shieldCapacity = 0;
  let shieldRegenSec = 0;

  if (ship.shields) {
    const item  = ITEMS[ship.shields];
    const level = inventory[ship.shields]?.level ?? 0;
    const stats = item?.levels[level - 1]?.stats;
    if (stats) {
      shieldCapacity = stats.shieldCapacity ?? 0;
      shieldRegenSec = stats.shieldRegenSec ?? 0;
    }
  }

  shieldCapacity += talentLevel(talents, 'shd_boost')       * 15;
  shieldCapacity += talentLevel(talents, 'shield_cap')      * 25;
  shieldRegenSec += talentLevel(talents, 'shd_regen_boost') * 1;
  shieldRegenSec += talentLevel(talents, 'shield_regen')    * 2;

  // ─── side weapons ────────────────────────────────────────────────────────────
  const leftWeapon:  SideWeaponType | null = resolveWeaponType(ship.leftWeapon,  inventory);
  const rightWeapon: SideWeaponType | null = resolveWeaponType(ship.rightWeapon, inventory);

  const sideEffTalent = talentLevel(talents, 'side_eff');
  const spreadShotCost  = Math.max(1, BASE_SPREAD_COST - sideEffTalent);
  const heavyBeamCost   = Math.max(1, BASE_BEAM_COST   - sideEffTalent);

  // ─── auto-dodge ───────────────────────────────────────────────────────────────
  const dodgeCost = Math.max(
    1,
    BASE_DODGE_COST - talentLevel(talents, 'dodge_boost') - talentLevel(talents, 'dodge_eff'),
  );
  // Each level of dodge_sense extends the threat-detection window by 50 ms.
  const dodgeLookaheadMs = 350 + talentLevel(talents, 'dodge_sense') * 50;

  return {
    energyCapacity,
    energyRegenSec,
    hasFrontWeapon: ship.frontWeapon !== null,
    frontDamage,
    frontEnergyCost,
    frontFireMs,
    hasShield: ship.shields !== null,
    shieldCapacity,
    shieldRegenSec,
    dodgeCost,
    dodgeLookaheadMs,
    leftWeapon,
    rightWeapon,
    spreadShotCost,
    heavyBeamCost,
    sideWeaponCooldownMs: BASE_SIDE_COOLDOWN_MS,
  };
}

function resolveWeaponType(
  itemId: string | null,
  inventory: Record<string, { level: number }>,
): SideWeaponType | null {
  if (!itemId || !inventory[itemId]) return null;
  const item = ITEMS[itemId];
  return item?.weaponType ?? null;
}
