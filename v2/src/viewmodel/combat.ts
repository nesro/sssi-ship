// Pure viewmodel for the three in-combat HUD components: CombatHud (bars + stat
// lines), SupplyButtons (boost buttons), and CardOverlay (dispatch-reinforcements
// modal). Zero Phaser import — CombatScene reads these objects and renders them.

import { BROWNOUT_THRESHOLD, LANE_LENGTH, TICKS_PER_SECOND } from '../core/constants';
import { activeDamageMult, activeFireRateMult, activeGeneratorMult, computeEffectiveStats } from '../core/stats';
import type { EffectiveStats } from '../core/stats';
import type { AbilityOffer, CoreState, EnemyState, MissionSpec, SideWeaponKind, SpawnEvent, StarSpec } from '../core/types';
import { abilityById } from '../data/cards';
import { sideWeaponKindDisplayName } from '../data/items';
import { ABILITY_COMPANY_CHARS, ABILITY_COMPANY_COLORS } from './companyColors';
import { PALETTE } from '../view/palette';

// ADD blend over near-black makes white look grey; green stays readable — exported so
// CombatHud.ts's static row-label color matches the bar's fill color exactly (one source).
export const HULL_GREEN = 0x44ff66;
const BROWNOUT_COLOR = 0xff4400;
// A mission's last scheduled event tick isn't quite the real end of the mission
// (enemies from that event still have to reach the ship/die after it fires), so both
// the progress bar's own total (progressTotalTicks) and the support-call markers
// (computeSupportMarkers) measure against a slightly padded denominator rather than
// the literal last event/arrival tick.
const TIMELINE_TAIL_FRACTION = 1.05;

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
  /** "DPS 20.0  KILLS 5" — or just "KILLS 5" with no weapon equipped (t1's forced
   * loadout): a permanent "DPS 0.0" reads as a broken stat, while KILLS stays live even
   * weaponless — shield-burst kills are real credited kills (conveyor.ts). */
  dpsLine: string;
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

/** The tick at which this event's farthest-spaced enemy (the last one, since `spacing`
 * pushes each subsequent spawn back) would reach the ship if never killed — null for
 * stationary kinds (`speed <= 0`, e.g. turret), which never travel and so have no
 * arrival tick of their own; a mission's real clear timing is bounded by whichever
 * other, mobile events it also has. */
function eventArrivalTick(event: SpawnEvent, mission: MissionSpec): number | null {
  const spec = mission.enemyKinds[event.kind];
  if (spec === undefined || spec.speed <= 0) return null;
  const farthestDistance = LANE_LENGTH + (event.count - 1) * event.spacing;
  return event.atTimelineTick + farthestDistance / spec.speed;
}

/** Worst-case total duration for the progress bar: the latest arrival tick across
 * every event that has one (stationary-only events excluded — see eventArrivalTick),
 * padded like computeSupportMarkers's own denominator. Falls back to the mission's
 * last event tick if every event is stationary (no mobile event to measure against at
 * all — not a real mission shape today, but keeps this total well-defined). 1 (not 0)
 * when the mission has no events at all, matching the pre-Phase-C fallback exactly. */
function progressTotalTicks(state: CoreState): number {
  const arrivals = state.mission.events
    .map((event) => eventArrivalTick(event, state.mission))
    .filter((tick): tick is number => tick !== null);
  if (arrivals.length > 0) return Math.max(...arrivals) * TIMELINE_TAIL_FRACTION;
  const lastEvent = state.mission.events[state.mission.events.length - 1];
  return lastEvent !== undefined ? lastEvent.atTimelineTick * TIMELINE_TAIL_FRACTION : 1;
}

/** Single source for the mission-progress bar's fraction: 0 while a boss is up (the bar
 * switches to showing boss HP instead — see computeMissionOrBossBar), else how far
 * through the worst-case mission duration `state.timelineTick` currently is.
 *
 * `timelineTick` already freezes on its own while a `blocksConveyor` enemy is alive
 * (`timeline.ts`), so this reads as smooth, continuous progress that pauses exactly
 * while something is genuinely holding the mission up — no extra logic needed for
 * that part. A plain last-event-tick estimate broke down for a mission whose whole
 * wave fires in one early event (t1: everything at tick 1, with the real fight —
 * shield vs. generator — still entirely ahead): the bar reached its ceiling within the
 * first second, then sat there for the rest of the mission. progressTotalTicks fixes
 * that by estimating from real travel time instead of scheduling time alone. Capped
 * below 1 while running (a worst-case estimate can still undershoot if enemies die
 * before reaching the ship, which is the common case — the true 100% only shows once
 * the mission has actually resolved). */
function computeProgressFrac(state: CoreState, boss: EnemyState | null): number {
  if (boss !== null) return 0;
  const cap = state.status === 'running' ? 0.99 : 1;
  return Math.min(cap, state.timelineTick / progressTotalTicks(state));
}

function computeSupportMarkers(state: CoreState): SupportMarkerViewModel[] {
  const totalTicks = progressTotalTicks(state);
  return state.mission.supportCallTicks.map((tick) => ({ fraction: Math.min(1, tick / totalTicks) }));
}

interface StatLines {
  dpsLine: string;
  timeLine: string;
  damageRangeLine: string;
  critLine: string;
}

function computeStatLines(state: CoreState, stats: EffectiveStats): StatLines {
  const killsPart = `KILLS ${String(state.stats.kills)}`;
  const timeLine = `TIME ${(state.tick / TICKS_PER_SECOND).toFixed(1)}s`;
  if (!stats.weaponEquipped) {
    // No weapon (t1's forced loadout): drop the DPS stat instead of printing a
    // permanent "DPS 0.0" that reads as a broken HUD through the whole tutorial.
    return { dpsLine: killsPart, timeLine, damageRangeLine: '', critLine: '' };
  }
  const dps = (stats.weaponDamage / stats.weaponInterval) * TICKS_PER_SECOND;
  const dpsLine = `DPS ${dps.toFixed(1)}  ${killsPart}`;
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
  alreadyEarnedStarIds: string[],
): CombatHudViewModel {
  const { ship } = state;
  const progressFrac = computeProgressFrac(state, boss);
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
