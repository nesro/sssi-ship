// Pure viewmodel for the three in-combat HUD components: CombatHud (bars + stat
// lines), SupplyButtons (boost buttons), and CardOverlay (dispatch-reinforcements
// modal). Zero Phaser import — CombatScene reads these objects and renders them.

import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from '../core/constants';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats } from '../core/stats';
import type { EffectiveStats } from '../core/stats';
import type { AbilityOffer, CoreState, EnemyState, SideWeaponKind } from '../core/types';
import { abilityById } from '../data/cards';
import { sideWeaponKindDisplayName } from '../data/items';
import { ABILITY_COMPANY_CHARS, ABILITY_COMPANY_COLORS } from './companyColors';
import { PALETTE } from '../view/palette';

// ADD blend over near-black makes white look grey; green stays readable — exported so
// CombatHud.ts's static row-label color matches the bar's fill color exactly (one source).
export const HULL_GREEN = 0x44ff66;
const BROWNOUT_COLOR = 0xff4400;

export interface BarViewModel {
  current: number;
  max: number;
  fraction: number; // clamp(current/max, 0, 1)
  label: string; // value text, e.g. "15/30" — matches CombatHud.ts's real (no-space) format
  color: number;
}

export interface MissionOrBossBarViewModel extends BarViewModel {
  mode: 'mission' | 'boss';
  /** The bar's fixed row name — distinct from `label`, which is the value text. */
  name: 'MISS' | 'BOSS';
}

export interface SupportMarkerViewModel {
  fraction: number; // x-position along the mission-progress bar, 0–1
}

export interface CombatHudViewModel {
  hull: BarViewModel;
  shield: BarViewModel;
  energy: BarViewModel;
  missionOrBoss: MissionOrBossBarViewModel;
  supportMarkers: SupportMarkerViewModel[]; // [] when mode === 'boss'
  dpsLine: string; // "DPS 20.0  K5" — never blank, even with no weapon (DPS 0.0)
  timeLine: string; // "T 12.3s"
  damageRangeLine: string; // "10.0–20.0" or "" when no weapon
  critLine: string; // "CRIT 25%" or "" when no weapon
}

function computeBar(current: number, max: number, color: number): BarViewModel {
  const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return { current, max, fraction, label: `${String(Math.ceil(current))}/${String(Math.ceil(max))}`, color };
}

function computeMissionOrBossBar(boss: EnemyState | null, progressFrac: number): MissionOrBossBarViewModel {
  const bar = boss !== null ? computeBar(boss.hp, boss.maxHp, PALETTE.enemyOrange) : computeBar(progressFrac, 1, PALETTE.weaponCyan);
  return { ...bar, label: `${String(Math.round(bar.fraction * 100))}%`, mode: boss !== null ? 'boss' : 'mission', name: boss !== null ? 'BOSS' : 'MISS' };
}

function computeSupportMarkers(state: CoreState): SupportMarkerViewModel[] {
  const lastEvent = state.mission.events[state.mission.events.length - 1];
  const totalTicks = lastEvent !== undefined ? lastEvent.atTimelineTick * 1.05 : 1;
  return state.mission.supportCallTicks.map((tick) => ({ fraction: Math.min(1, tick / totalTicks) }));
}

interface StatLines {
  dpsLine: string;
  timeLine: string;
  damageRangeLine: string;
  critLine: string;
}

function computeStatLines(state: CoreState, stats: EffectiveStats): StatLines {
  const dps = stats.weaponEquipped ? (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND : 0;
  const dpsLine = `DPS ${dps.toFixed(1)}  K${String(state.stats.kills)}`;
  const timeLine = `T ${(state.tick / TICKS_PER_SECOND).toFixed(1)}s`;
  if (!stats.weaponEquipped) return { dpsLine, timeLine, damageRangeLine: '', critLine: '' };
  const weapon = state.loadout.weapon;
  const critMult = stats.shipCritMultOverride ?? (weapon?.critMult ?? 2.0);
  const critPct = Math.round((weapon?.critChance ?? 0) * 100);
  const minDmg = stats.weaponDamage;
  const maxDmg = minDmg * critMult;
  return { dpsLine, timeLine, damageRangeLine: `${minDmg.toFixed(1)}–${maxDmg.toFixed(1)}`, critLine: `CRIT ${String(critPct)}%` };
}

/** Pure function, called every frame tick — matches the real CombatHud.update() call site. */
export function computeCombatHudViewModel(state: CoreState, boss: EnemyState | null, progressFrac: number): CombatHudViewModel {
  const { ship } = state;
  const stats = computeEffectiveStats(
    state.loadout, state.modifiers,
    activeDamageMult(state), activeFireRateMult(state), activeGeneratorMult(state),
  );
  const energyFrac = stats.generatorCapacity > 0 ? ship.energy / stats.generatorCapacity : 0;
  const inBrownout = energyFrac < BROWNOUT_THRESHOLD;

  return {
    hull: computeBar(ship.hull, ship.maxHull, HULL_GREEN),
    shield: computeBar(ship.shield, stats.shieldCapacity, PALETTE.shieldBlue),
    energy: computeBar(ship.energy, stats.generatorCapacity, inBrownout ? BROWNOUT_COLOR : PALETTE.generatorAmber),
    missionOrBoss: computeMissionOrBossBar(boss, progressFrac),
    supportMarkers: boss === null ? computeSupportMarkers(state) : [],
    ...computeStatLines(state, stats),
  };
}

// ── Supply buttons (in-combat boost buttons) ────────────────────────────────

export interface SupplyButtonViewModel {
  slot: number;
  label: string; // "Nano Repair  x2"
  empty: boolean;
}

export interface SupplyButtonsViewModel {
  hasSupplies: boolean; // false → renderer shows the "—" placeholder
  buttons: SupplyButtonViewModel[];
}

export function computeSupplyButtonsViewModel(state: CoreState): SupplyButtonsViewModel {
  return {
    hasSupplies: state.supplies.length > 0,
    buttons: state.supplies.map((supply, slot) => ({
      slot,
      label: `${supply.spec.name}  ×${String(supply.chargesLeft)}`,
      empty: supply.chargesLeft <= 0,
    })),
  };
}

// ── Side weapon button (manual-fire, limited-ammo — §5) ─────────────────────

export interface SideWeaponButtonViewModel {
  equipped: boolean;
  label: string; // kind display name, e.g. "Railgun" — "—" when unequipped
  chargesLabel: string; // "2/3" — "" when unequipped
  /** False when unequipped, out of charges, or the mission isn't running. */
  canFire: boolean;
}

export function computeSideWeaponButtonViewModel(state: CoreState): SideWeaponButtonViewModel {
  const sideWeapon = state.loadout.sideWeapon;
  if (sideWeapon === null) {
    return { equipped: false, label: '—', chargesLabel: '', canFire: false };
  }
  const charges = state.ship.sideWeaponCharges;
  const maxCharges = sideWeapon.maxCharges ?? 0;
  return {
    equipped: true,
    label: sideWeaponKindDisplayName(sideWeapon.kind as SideWeaponKind),
    chargesLabel: `${String(charges)}/${String(maxCharges)}`,
    canFire: charges > 0 && state.status === 'running',
  };
}

// ── Card overlay (dispatch-reinforcements in-combat modal) ──────────────────

export interface OfferCardViewModel {
  cardId: string;
  name: string;
  description: string;
  companyColor: number;
  companyChar: string;
  // no kindLabel — CardOverlay.ts renders no active/passive label on offer cards today;
  // unlike DispatchCardViewModel (hub), don't invent a field the UI doesn't show
}

export interface CardOverlayViewModel {
  cards: OfferCardViewModel[];
  showReroll: boolean;
  rerollsLeft: number;
}

export function computeCardOverlayViewModel(offer: AbilityOffer, state: CoreState): CardOverlayViewModel {
  const cards = offer.abilityIds.map((cardId) => {
    const ability = abilityById(cardId);
    return {
      cardId,
      name: ability.name,
      description: ability.description,
      companyColor: ABILITY_COMPANY_COLORS[ability.company] ?? PALETTE.hullWhite,
      companyChar: ABILITY_COMPANY_CHARS[ability.company] ?? '?',
    };
  });
  return { cards, showReroll: state.rerollsLeft > 0, rerollsLeft: state.rerollsLeft };
}
