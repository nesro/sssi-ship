import { CARD_ACTION_SKIP } from './constants';
import { resolveAbilityAction } from './cards';
import { fireSideWeapon, setPriorityTarget } from './combat';
import { resolveNarrator } from './narrator';
import { createCoreState } from './state';
import { applyBoost } from './supplies';
import { advanceTick } from './tick';
import type {
  AbilityDefinition,
  AbilityOffer,
  CoreState,
  LoadoutSnapshot,
  MissionSpec,
} from './types';

/** The replay file format (V2_HANDOFF.md §2.2). */
export interface ReplayRecord {
  version: number;
  missionId: string;
  seed: number;
  loadout: LoadoutSnapshot;
  /** Ordered action stream: -2 = reroll, -1 = skip, 0..2 = pick index. */
  cardPicks: number[];
  boostTaps: { tick: number; slot: number }[];
  /** Ticks at which the side weapon was manually fired. */
  sideWeaponTaps: number[];
  /** Ticks at which the front-weapon priority target was set or cleared. */
  priorityTargetTaps: { tick: number; enemyId: number | null }[];
  resultHash: string;
}

const REPLAY_VERSION = 2;

/** Safety valve for headless runs; 10 minutes of simulated time, far above mission length. */
const DEFAULT_MAX_TICKS = 6000;

/** Decides one card action per pending offer; defaults to skipping every offer. */
export type PickPolicy = (state: CoreState, offer: AbilityOffer) => number;

/** Returns a supply slot to tap before the next tick, or null. Defaults to never. */
export type BoostPolicy = (state: CoreState) => number | null;

/** Returns true to fire the side weapon before the next tick. Defaults to never. */
export type SideWeaponPolicy = (state: CoreState) => boolean;

/**
 * May flip `autoFireEnabled`/`rearWeaponEnabled`/`autoShieldEnabled` via the
 * `toggle*` mutators in `combat.ts` before the next tick — models a player managing
 * energy mid-combat (GAME_DESIGN.md §6's core skill loop). Defaults to never touching
 * any toggle, i.e. today's always-on behavior. Like every other policy, sees only the
 * current `CoreState` — no lookahead.
 */
export type TogglePolicy = (state: CoreState) => void;

/**
 * Read-only observer, called once per tick actually advanced (never during a paused
 * narrator/offer resolution loop). Must not mutate `state` — it exists purely so
 * external tooling (pacing/fun metrics) can accumulate per-tick history that
 * `CoreState` itself doesn't retain, without adding any history array to the core.
 * Never included in `hashCoreState`; cannot affect determinism.
 */
export type TickSampler = (state: CoreState) => void;

/**
 * Returns the enemy id to mark as the front weapon's priority target, `null` to clear
 * the current mark, or `undefined` to leave it unchanged this tick (the common case —
 * a policy only needs to act when it actually wants to change the mark, not every
 * tick). Front weapon only (fable-fun-review-followup.md Item 4). Sees only the
 * current `CoreState` — no lookahead, same constraint as every other policy.
 */
export type TargetPolicy = (state: CoreState) => number | null | undefined;

export interface RunPolicies {
  pickAbility?: PickPolicy;
  useBoost?: BoostPolicy;
  useSideWeapon?: SideWeaponPolicy;
  manageToggles?: TogglePolicy;
  chooseTarget?: TargetPolicy;
  sampleTick?: TickSampler;
  abilityPool?: AbilityDefinition[];
  maxTicks?: number;
}

export interface MissionRunResult {
  state: CoreState;
  replay: ReplayRecord;
}

/** Runs a mission headlessly to completion. The simulator and the live game share this core. */
export function runMission(
  mission: MissionSpec,
  loadout: LoadoutSnapshot,
  seed: number,
  policies: RunPolicies = {},
): MissionRunResult {
  const maxTicks = policies.maxTicks ?? DEFAULT_MAX_TICKS;
  const pickAbility = policies.pickAbility ?? (() => CARD_ACTION_SKIP);
  const useBoost = policies.useBoost ?? (() => null);
  const useSideWeapon = policies.useSideWeapon ?? (() => false);
  const manageToggles = policies.manageToggles ?? (() => {});
  const chooseTarget = policies.chooseTarget ?? (() => undefined);
  const sampleTick = policies.sampleTick ?? (() => {});
  const state = createCoreState(mission, loadout, seed, policies.abilityPool ?? []);

  while (state.status === 'running' && state.tick < maxTicks) {
    if (state.pendingNarrator !== null) { resolveNarrator(state); continue; }
    if (state.pendingOffer !== null) {
      resolveAbilityAction(state, pickAbility(state, state.pendingOffer));
      continue;
    }
    const slot = useBoost(state);
    if (slot !== null) applyBoost(state, slot);
    if (useSideWeapon(state)) fireSideWeapon(state);
    manageToggles(state);
    const target = chooseTarget(state);
    if (target !== undefined) setPriorityTarget(state, target);
    advanceTick(state);
    sampleTick(state);
  }
  if (state.status === 'running') {
    throw new Error(
      `Mission ${mission.id} (seed ${String(seed)}) did not finish in ${String(maxTicks)} ticks`,
    );
  }
  return { state, replay: buildReplayRecord(state) };
}

function buildReplayRecord(state: CoreState): ReplayRecord {
  return {
    version: REPLAY_VERSION,
    missionId: state.mission.id,
    seed: state.seed,
    loadout: state.loadout,
    cardPicks: [...state.abilityActions],
    boostTaps: [...state.boostTaps],
    sideWeaponTaps: [...state.sideWeaponTaps],
    priorityTargetTaps: [...state.priorityTargetTaps],
    resultHash: hashCoreState(state),
  };
}

/** Re-simulates a record and checks the final state matches. The watch-replay / validation path. */
export function verifyReplay(
  record: ReplayRecord,
  mission: MissionSpec,
  abilityPool: AbilityDefinition[] = [],
): boolean {
  if (record.missionId !== mission.id) {
    throw new Error(`Replay is for mission "${record.missionId}", got "${mission.id}"`);
  }
  const rerun = runMission(mission, record.loadout, record.seed, {
    abilityPool,
    pickAbility: replayCardPolicy(record),
    useBoost: replayBoostPolicy(record),
    useSideWeapon: replaySideWeaponPolicy(record),
    chooseTarget: replayTargetPolicy(record),
  });
  return rerun.replay.resultHash === record.resultHash;
}

/** Replays the recorded card-action stream in order; skips if the record runs dry. */
function replayCardPolicy(record: ReplayRecord): PickPolicy {
  let cursor = 0;
  return () => record.cardPicks[cursor++] ?? CARD_ACTION_SKIP;
}

/** Re-applies recorded boost taps at their original ticks (one per tick, in order). */
function replayBoostPolicy(record: ReplayRecord): BoostPolicy {
  let cursor = 0;
  return (state) => {
    const tap = record.boostTaps[cursor];
    if (tap !== undefined && tap.tick === state.tick) {
      cursor += 1;
      return tap.slot;
    }
    return null;
  };
}

/** Re-fires the side weapon at its originally recorded ticks, in order. */
function replaySideWeaponPolicy(record: ReplayRecord): SideWeaponPolicy {
  let cursor = 0;
  return (state) => {
    if (record.sideWeaponTaps[cursor] === state.tick) {
      cursor += 1;
      return true;
    }
    return false;
  };
}

/** Re-applies recorded priority-target taps at their original ticks, in order. */
function replayTargetPolicy(record: ReplayRecord): TargetPolicy {
  let cursor = 0;
  return (state) => {
    const tap = record.priorityTargetTaps[cursor];
    if (tap !== undefined && tap.tick === state.tick) {
      cursor += 1;
      return tap.enemyId;
    }
    return undefined;
  };
}

/**
 * FNV-1a over the determinism-relevant fields of the final state — every field that can
 * affect a FUTURE tick's outcome. Deliberately excludes: `loadout`/`mission`/`seed`/
 * `abilityPool` (run INPUTS, not evolving state — already pinned by the replay record
 * itself); `abilityActions`/`boostTaps`/`sideWeaponTaps`/`priorityTargetTaps` (the
 * recorded action LOG replayed to reproduce the run, not state to verify against);
 * `pendingOffer`/`pendingNarrator`/`pendingVisualEvents` (transient pause/view-only
 * state, explicitly not meaningful once a run has finished).
 *
 * Also covers the RNG cursor, `modifiers`, `activeEffects`, `rerollsLeft`, supply
 * `chargesLeft`, `shotCounter`, `consecutiveKills`, `wavesClearedThisRun`,
 * `nextEventIndex`, `nextEnemyId`, `supportCallsDone`, and `bonusCallsPending` — all
 * live, run-evolving state that a divergence could otherwise hide behind (e.g. two runs
 * disagreeing only on `rerollsLeft` or `modifiers` would hash identically if only
 * `ship`/`stats`/`enemies` were checked).
 */
export function hashCoreState(state: CoreState): string {
  const snapshot = JSON.stringify({
    tick: state.tick,
    timelineTick: state.timelineTick,
    nextEventIndex: state.nextEventIndex,
    nextEnemyId: state.nextEnemyId,
    status: state.status,
    ship: state.ship,
    stats: state.stats,
    rngCursor: state.rng.cursor,
    modifiers: state.modifiers,
    pickedAbilityIds: state.pickedAbilityIds,
    autoFireEnabled: state.autoFireEnabled,
    rearWeaponEnabled: state.rearWeaponEnabled,
    autoShieldEnabled: state.autoShieldEnabled,
    priorityTargetId: state.priorityTargetId,
    equippedAbilities: state.equippedAbilities,
    rerollsLeft: state.rerollsLeft,
    supportCallsDone: state.supportCallsDone,
    bonusCallsPending: state.bonusCallsPending,
    shotCounter: state.shotCounter,
    supplies: state.supplies.map((s) => ({ id: s.spec.id, chargesLeft: s.chargesLeft })),
    activeEffects: state.activeEffects,
    shieldBroke: state.shieldBroke,
    spawnedCount: state.spawnedCount,
    consecutiveKills: state.consecutiveKills,
    wavesClearedThisRun: state.wavesClearedThisRun,
    firedNarratorTicks: state.firedNarratorTicks,
    enemies: state.enemies.map((e) => ({
      id: e.id, distance: e.distance, hp: e.hp, holdChargeTicks: e.holdChargeTicks, aliveTicks: e.aliveTicks,
    })),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i++) {
    hash ^= snapshot.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
