import { describe, expect, it } from 'vitest';
import { CARD_ACTION_REROLL } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { hashCoreState, runMission, verifyReplay } from './replay';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { ALL_CARDS } from '../data/cards';
import type { MissionSpec, SupplyLoadout } from './types';

const MISSION_WITH_CALLS: MissionSpec = {
  ...FIXTURE_MISSION,
  id: 'fixture-calls',
  supportCallTicks: [30, 120],
};

const TEST_SUPPLIES: SupplyLoadout[] = [
  {
    spec: {
      id: 'fix-sup-damage', name: 'RAGE', description: 'x2 damage 5 s',
      kind: 'damage-boost', magnitude: 2, durationTicks: 50, maxCharges: 2,
    },
    charges: 2,
  },
];

describe('runMission', () => {
  it('finishes the fixture mission with a definite outcome', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 1);
    expect(['victory', 'defeat']).toContain(state.status);
    expect(state.tick).toBeGreaterThan(0);
  });

  it('is deterministic: same seed produces an identical resultHash', () => {
    const a = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 1234);
    const b = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 1234);
    expect(a.replay.resultHash).toBe(b.replay.resultHash);
    expect(a.state.tick).toBe(b.state.tick);
    expect(a.state.stats).toEqual(b.state.stats);
  });

  it('different seeds diverge mid-run (spawn jitter consumed the PRNG)', () => {
    // Final hashes can legitimately match across seeds (the weapon has no range, so
    // jitter only shifts positions) — divergence is guaranteed in live enemy positions.
    const TICKS_INTO_FIRST_WAVE = 30;
    const positions = [1, 2].map((seed) => {
      const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, seed);
      for (let i = 0; i < TICKS_INTO_FIRST_WAVE; i++) advanceTick(state);
      return state.enemies.map((e) => e.distance);
    });
    expect(positions[0]).not.toEqual(positions[1]);
    expect(positions[0]?.length).toBeGreaterThan(0);
  });

  it('throws with context when a mission cannot finish', () => {
    expect(() => runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, { maxTicks: 3 })).toThrow(
      /did not finish in 3 ticks/,
    );
  });
});

describe('verifyReplay with cards and boosts', () => {
  const loadout = { ...FIXTURE_LOADOUT, supplies: TEST_SUPPLIES };
  const policies = {
    cardPool: ALL_CARDS,
    // Reroll the first offer, then always pick the first card.
    pickCard: (state: { cardActions: number[] }) =>
      state.cardActions.length === 0 ? CARD_ACTION_REROLL : 0,
    // Tap the damage boost at tick 60.
    useBoost: (state: { tick: number }) => (state.tick === 60 ? 0 : null),
  };

  it('records picks, rerolls, and taps, and re-simulates to the same hash', () => {
    const { state, replay } = runMission(MISSION_WITH_CALLS, loadout, 99, policies);
    expect(replay.cardPicks).toContain(CARD_ACTION_REROLL);
    expect(replay.cardPicks.filter((a) => a >= 0).length).toBeGreaterThan(0);
    expect(replay.boostTaps).toEqual([{ tick: 60, slot: 0 }]);
    expect(state.pickedCardIds.length).toBeGreaterThan(0);
    expect(verifyReplay(replay, MISSION_WITH_CALLS, ALL_CARDS)).toBe(true);
  });

  it('a tampered hash fails verification', () => {
    const { replay } = runMission(MISSION_WITH_CALLS, loadout, 99, policies);
    expect(verifyReplay({ ...replay, resultHash: 'deadbeef' }, MISSION_WITH_CALLS, ALL_CARDS)).toBe(
      false,
    );
  });

  it('rejects a mission id mismatch', () => {
    const { replay } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 99);
    expect(() => verifyReplay({ ...replay, missionId: 'other' }, FIXTURE_MISSION)).toThrow(/other/);
  });
});

describe('hashCoreState', () => {
  it('changes when the state changes', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    const before = hashCoreState(state);
    state.ship.hull -= 1;
    expect(hashCoreState(state)).not.toBe(before);
  });
});
