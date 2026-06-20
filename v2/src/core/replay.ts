import { CARD_ACTION_SKIP } from './constants';
import { resolveCardAction } from './cards';
import { resolveNarrator } from './narrator';
import { createCoreState } from './state';
import { applyBoost } from './supplies';
import { advanceTick } from './tick';
import type {
  CardDefinition,
  CardOffer,
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
  resultHash: string;
}

const REPLAY_VERSION = 1;

/** Safety valve for headless runs; 10 minutes of simulated time, far above mission length. */
const DEFAULT_MAX_TICKS = 6000;

/** Decides one card action per pending offer; defaults to skipping every offer. */
export type CardPolicy = (state: CoreState, offer: CardOffer) => number;

/** Returns a supply slot to tap before the next tick, or null. Defaults to never. */
export type BoostPolicy = (state: CoreState) => number | null;

export interface RunPolicies {
  pickCard?: CardPolicy;
  useBoost?: BoostPolicy;
  cardPool?: CardDefinition[];
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
  const pickCard = policies.pickCard ?? (() => CARD_ACTION_SKIP);
  const useBoost = policies.useBoost ?? (() => null);
  const state = createCoreState(mission, loadout, seed, policies.cardPool ?? []);

  while (state.status === 'running' && state.tick < maxTicks) {
    if (state.pendingNarrator !== null) { resolveNarrator(state); continue; }
    if (state.pendingOffer !== null) {
      resolveCardAction(state, pickCard(state, state.pendingOffer));
      continue;
    }
    const slot = useBoost(state);
    if (slot !== null) applyBoost(state, slot);
    advanceTick(state);
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
    cardPicks: [...state.cardActions],
    boostTaps: [...state.boostTaps],
    resultHash: hashCoreState(state),
  };
}

/** Re-simulates a record and checks the final state matches. The watch-replay / validation path. */
export function verifyReplay(
  record: ReplayRecord,
  mission: MissionSpec,
  cardPool: CardDefinition[] = [],
): boolean {
  if (record.missionId !== mission.id) {
    throw new Error(`Replay is for mission "${record.missionId}", got "${mission.id}"`);
  }
  const rerun = runMission(mission, record.loadout, record.seed, {
    cardPool,
    pickCard: replayCardPolicy(record),
    useBoost: replayBoostPolicy(record),
  });
  return rerun.replay.resultHash === record.resultHash;
}

/** Replays the recorded card-action stream in order; skips if the record runs dry. */
function replayCardPolicy(record: ReplayRecord): CardPolicy {
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

/** FNV-1a over the determinism-relevant fields of the final state. */
export function hashCoreState(state: CoreState): string {
  const snapshot = JSON.stringify({
    tick: state.tick,
    timelineTick: state.timelineTick,
    status: state.status,
    ship: state.ship,
    stats: state.stats,
    pickedCardIds: state.pickedCardIds,
    shieldBroke: state.shieldBroke,
    bossKillTick: state.bossKillTick,
    spawnedCount: state.spawnedCount,
    firedNarratorTicks: state.firedNarratorTicks,
    enemies: state.enemies.map((e) => ({ id: e.id, distance: e.distance, hp: e.hp })),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < snapshot.length; i++) {
    hash ^= snapshot.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
