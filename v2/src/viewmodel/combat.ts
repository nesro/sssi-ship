// Pure viewmodel for the three in-combat HUD components: CombatHud (bars + stat
// lines), SupplyButtons (boost buttons), and CardOverlay (dispatch-reinforcements
// modal). Zero Phaser import — CombatScene reads these objects and renders them.

import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from '../core/constants';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats } from '../core/stats';
import type { EffectiveStats } from '../core/stats';
import type { AbilityOffer, CoreState, EnemyState, SideWeaponKind, StarSpec } from '../core/types';
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
  /** The bar's fixed row name — distinct from `label`, which is the value text.
   * 'PROG' (not 'MISS') — a 4-char abbreviation of "mission progress" reads as
   * "miss %" in a shooter HUD next to HULL/SHLD/ENRG, which is exactly backwards. */
  name: 'PROG' | 'BOSS';
}

export interface SupportMarkerViewModel {
  fraction: number; // x-position along the mission-progress bar, 0–1
}

/** Binary pass/fail icon for an all-kills or shield-unbroken star not yet earned on a
 * prior clear — Item 3's "always-visible, cheap to read at a glance" design call. Only
 * these two families ship a live icon; hull-above/finish-time/boss-time are either
 * continuous (no clean pass/fail moment) or (finish-time on m1-m5) a synthetic tie-break
 * not worth surfacing live — see nearestUnmissedTimeThreshold for the one that does ship. */
export interface StarIndicatorViewModel {
  starId: string;
  family: 'all-kills' | 'shield-unbroken';
  onTrack: boolean;
}

export interface CombatHudViewModel {
  hull: BarViewModel;
  shield: BarViewModel;
  energy: BarViewModel;
  missionOrBoss: MissionOrBossBarViewModel;
  supportMarkers: SupportMarkerViewModel[]; // [] when mode === 'boss'
  dpsLine: string; // "DPS 20.0  KILLS 5" — never blank, even with no weapon (DPS 0.0)
  timeLine: string; // "TIME 12.3s"
  damageRangeLine: string; // "10.0–20.0" or "" when no weapon
  critLine: string; // "CRIT 25%" or "" when no weapon
  starIndicators: StarIndicatorViewModel[];
  /** Ticks remaining on the tightest still-reachable time star — m6 only (decision #15:
   * m1-m5's tiers are a synthetic ±1-2s spread, a countdown to them would visibly read as
   * broken). Null on every other mission, or when none remain reachable. */
  timeStarTicksRemaining: number | null;
}

function computeBar(current: number, max: number, color: number): BarViewModel {
  const fraction = max > 0 ? Math.max(0, Math.min(1, current / max)) : 0;
  return { current, max, fraction, label: `${String(Math.ceil(current))}/${String(Math.ceil(max))}`, color };
}

function computeMissionOrBossBar(boss: EnemyState | null, progressFrac: number): MissionOrBossBarViewModel {
  const bar = boss !== null ? computeBar(boss.hp, boss.maxHp, PALETTE.enemyOrange) : computeBar(progressFrac, 1, PALETTE.weaponCyan);
  return { ...bar, label: `${String(Math.round(bar.fraction * 100))}%`, mode: boss !== null ? 'boss' : 'mission', name: boss !== null ? 'BOSS' : 'PROG' };
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
  const dpsLine = `DPS ${dps.toFixed(1)}  KILLS ${String(state.stats.kills)}`;
  const timeLine = `TIME ${(state.tick / TICKS_PER_SECOND).toFixed(1)}s`;
  if (!stats.weaponEquipped) return { dpsLine, timeLine, damageRangeLine: '', critLine: '' };
  const weapon = state.loadout.weapon;
  const critMult = stats.shipCritMultOverride ?? (weapon?.critMult ?? 2.0);
  const critPct = Math.round((weapon?.critChance ?? 0) * 100);
  const minDmg = stats.weaponDamage;
  const maxDmg = minDmg * critMult;
  return { dpsLine, timeLine, damageRangeLine: `${minDmg.toFixed(1)}–${maxDmg.toFixed(1)}`, critLine: `CRIT ${String(critPct)}%` };
}

// ── Live star progress (fable-fun-review-followup.md Item 3) ─────────────────────
// Stars are only evaluated once at victory (src/core/stars.ts's evaluateStars) — every
// family's underlying data is already tracked live in CoreState every tick, so this
// derives an "at risk / on track" status per star each frame without touching the core
// or replay/determinism at all. Read-only, pure, same category as every other
// viewmodel function in this file.

export interface LiveStarStatus {
  starId: string;
  family: StarSpec['family'];
  /** Already permanently owned from a prior clear of this mission — never "at risk". */
  earned: boolean;
  /** Whether the star is still achievable from here. shield-unbroken/all-kills are
   * sticky-false once failed (a broken shield or a collision can't be undone this run);
   * hull-above/finish-time/boss-time reflect the current instant and can still change
   * before the run ends (e.g. a hull-recovery card). */
  onTrack: boolean;
  /** Only meaningful for finish-time/boss-time stars: ticks remaining before this
   * specific threshold is missed. Null for every other family. */
  ticksRemaining: number | null;
}

function liveStatusFor(state: CoreState, star: StarSpec): { onTrack: boolean; ticksRemaining: number | null } {
  switch (star.family) {
    case 'shield-unbroken':
      return { onTrack: !state.shieldBroke, ticksRemaining: null };
    case 'all-kills':
      // Mirrors evaluateStars' own "collisions are not kills" note — one collision
      // permanently forfeits this star, kills can never retroactively catch up.
      return { onTrack: state.stats.collisions === 0, ticksRemaining: null };
    case 'hull-above':
      return { onTrack: state.ship.hull / state.ship.maxHull >= star.threshold, ticksRemaining: null };
    case 'finish-time':
      return { onTrack: state.tick <= star.threshold, ticksRemaining: Math.max(0, star.threshold - state.tick) };
    case 'boss-time':
      return {
        onTrack: state.bossKillTick !== null ? state.bossKillTick <= star.threshold : state.tick <= star.threshold,
        ticksRemaining: Math.max(0, star.threshold - state.tick),
      };
  }
}

/** Pure function, called every frame tick — one status per star the mission defines.
 * `alreadyEarnedStarIds` should be `save.missionStars[missionId] ?? []` — a star earned
 * on a prior clear is never shown "at risk" again (it's permanently owned). */
export function liveStarProgress(state: CoreState, alreadyEarnedStarIds: string[]): LiveStarStatus[] {
  return state.mission.stars.map((star) => {
    const earned = alreadyEarnedStarIds.includes(star.id);
    if (earned) return { starId: star.id, family: star.family, earned: true, onTrack: true, ticksRemaining: null };
    return { starId: star.id, family: star.family, earned: false, ...liveStatusFor(state, star) };
  });
}

/** The tightest still-reachable time-star threshold, in ticks — a single number for a
 * live countdown display. Null if no time-based star remains reachable (all missed, all
 * already earned, or the mission has none). Callers decide which missions to render
 * this on (see the plan: m6 only, since m1-m5's tiers are a synthetic tie-break). */
export function nearestUnmissedTimeThreshold(progress: LiveStarStatus[]): number | null {
  const remaining = progress
    .filter((p) => !p.earned && p.onTrack && p.ticksRemaining !== null)
    .map((p) => p.ticksRemaining as number);
  return remaining.length > 0 ? Math.min(...remaining) : null;
}

/** Pure function, called every frame tick — matches the real CombatHud.update() call site.
 * `alreadyEarnedStarIds` should be `save.missionStars[missionId] ?? []` (same contract as
 * liveStarProgress) — the caller (CombatScene, which already loads `this.save`) passes it
 * through rather than this function reaching into save data itself. */
export function computeCombatHudViewModel(
  state: CoreState,
  boss: EnemyState | null,
  progressFrac: number,
  alreadyEarnedStarIds: string[],
): CombatHudViewModel {
  const { ship } = state;
  const stats = computeEffectiveStats(
    state.loadout, state.modifiers,
    activeDamageMult(state), activeFireRateMult(state), activeGeneratorMult(state),
  );
  const energyFrac = stats.generatorCapacity > 0 ? ship.energy / stats.generatorCapacity : 0;
  const inBrownout = energyFrac < BROWNOUT_THRESHOLD;
  const progress = liveStarProgress(state, alreadyEarnedStarIds);
  const starIndicators: StarIndicatorViewModel[] = progress
    .filter((p): p is LiveStarStatus & { family: 'all-kills' | 'shield-unbroken' } =>
      !p.earned && (p.family === 'all-kills' || p.family === 'shield-unbroken'))
    .map((p) => ({ starId: p.starId, family: p.family, onTrack: p.onTrack }));
  // m6-only per decision #15 — m1-m5's finish-time tiers are a synthetic ±1-2s spread
  // (missions.ts's own comments admit this); a live countdown to them would blow past all
  // four within a few seconds and read as broken, not motivating.
  const timeStarTicksRemaining = state.mission.id === 'm6' ? nearestUnmissedTimeThreshold(progress) : null;

  return {
    hull: computeBar(ship.hull, ship.maxHull, HULL_GREEN),
    shield: computeBar(ship.shield, stats.shieldCapacity, PALETTE.shieldBlue),
    energy: computeBar(ship.energy, stats.generatorCapacity, inBrownout ? BROWNOUT_COLOR : PALETTE.generatorAmber),
    missionOrBoss: computeMissionOrBossBar(boss, progressFrac),
    supportMarkers: boss === null ? computeSupportMarkers(state) : [],
    ...computeStatLines(state, stats),
    starIndicators,
    timeStarTicksRemaining,
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
  label: string; // kind display name, e.g. "Railgun" — "NO SIDE WEAPON" when unequipped
  chargesLabel: string; // "2/3" — "" when unequipped
  /** False when unequipped, out of charges, or the mission isn't running. */
  canFire: boolean;
}

export function computeSideWeaponButtonViewModel(state: CoreState): SideWeaponButtonViewModel {
  const sideWeapon = state.loadout.sideWeapon;
  if (sideWeapon === null) {
    return { equipped: false, label: 'NO SIDE WEAPON', chargesLabel: '', canFire: false };
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
