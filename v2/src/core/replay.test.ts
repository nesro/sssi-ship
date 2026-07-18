import { describe, expect, it } from 'vitest';
import { CARD_ACTION_REROLL } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { hashCoreState, runMission, verifyReplay } from './replay';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { ALL_ABILITIES } from '../data/cards';
import { weaponSpecAtLevel } from '../data/items';
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
    abilityPool: ALL_ABILITIES,
    // Reroll the first offer, then always pick the first ability.
    pickAbility: (state: { abilityActions: number[] }) =>
      state.abilityActions.length === 0 ? CARD_ACTION_REROLL : 0,
    // Tap the damage boost at tick 60.
    useBoost: (state: { tick: number }) => (state.tick === 60 ? 0 : null),
  };

  it('records picks, rerolls, and taps, and re-simulates to the same hash', () => {
    const { state, replay } = runMission(MISSION_WITH_CALLS, loadout, 99, policies);
    expect(replay.cardPicks).toContain(CARD_ACTION_REROLL);
    expect(replay.cardPicks.filter((a) => a >= 0).length).toBeGreaterThan(0);
    expect(replay.boostTaps).toEqual([{ tick: 60, slot: 0 }]);
    expect(state.pickedAbilityIds.length).toBeGreaterThan(0);
    expect(verifyReplay(replay, MISSION_WITH_CALLS, ALL_ABILITIES)).toBe(true);
  });

  it('a tampered hash fails verification', () => {
    const { replay } = runMission(MISSION_WITH_CALLS, loadout, 99, policies);
    expect(verifyReplay({ ...replay, resultHash: 'deadbeef' }, MISSION_WITH_CALLS, ALL_ABILITIES)).toBe(
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

  it('changes when priorityTargetId changes — a targeting divergence must be caught', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    const before = hashCoreState(state);
    state.priorityTargetId = 999;
    expect(hashCoreState(state)).not.toBe(before);
  });

  it('changes when an enemy\'s holdChargeTicks changes — a hold-charge divergence must be caught (Item 6)', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    state.enemies.push({
      id: 9999, kind: 'blocker', distance: 50, hp: 100, maxHp: 100, shootTimer: 10,
      speed: 0.5, shotDamage: 4, ticksBetweenShots: 15, blocksConveyor: true, coinReward: 25,
      isBoss: false, regenPerTick: 0, critChance: 0, missChance: 0, critMult: 2, holdChargeTicks: 0,
      aliveTicks: 0,
    });
    const before = hashCoreState(state);
    const enemy = state.enemies.find((e) => e.id === 9999);
    if (enemy === undefined) throw new Error('test enemy not found');
    enemy.holdChargeTicks = 42;
    expect(hashCoreState(state)).not.toBe(before);
  });

  // 2026-07-18 fix: hashCoreState used to omit a dozen run-evolving fields — two runs
  // diverging ONLY on one of these previously still hashed identically. Spot-checks 3
  // representative newly-covered fields (one per field "family": RNG/replay-input state,
  // a plain counter, and a nested array).
  it('changes when rerollsLeft changes', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    const before = hashCoreState(state);
    state.rerollsLeft -= 1;
    expect(hashCoreState(state)).not.toBe(before);
  });

  it('changes when nextEventIndex changes', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    const before = hashCoreState(state);
    state.nextEventIndex += 1;
    expect(hashCoreState(state)).not.toBe(before);
  });

  it('changes when a supply\'s chargesLeft changes', () => {
    const { state } = runMission(FIXTURE_MISSION, {
      ...FIXTURE_LOADOUT,
      supplies: [{
        spec: {
          id: 'fix-sup-shield', name: 'SHIELD BOOST', description: 'restore shield',
          kind: 'shield-restore', magnitude: 20, durationTicks: 0, maxCharges: 2,
        },
        charges: 2,
      }],
    }, 5);
    const before = hashCoreState(state);
    const supply = state.supplies[0];
    if (supply === undefined) throw new Error('test supply not found');
    supply.chargesLeft -= 1;
    expect(hashCoreState(state)).not.toBe(before);
  });

  it('changes when the RNG cursor changes (same tick count, different draws consumed)', () => {
    const { state } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 5);
    const before = hashCoreState(state);
    state.rng(); // consumes one more draw without changing any other field
    expect(hashCoreState(state)).not.toBe(before);
  });
});

describe('verifyReplay with priority-target taps', () => {
  it('records taps and re-simulates to the same hash', () => {
    // FIXTURE_MISSION's first wave spawns at tick 20 (seconds(2)); mark the front-most
    // enemy once it exists (tick 25), clear the mark at tick 50 — exercises both a set
    // and a clear through the real chooseTarget policy seam.
    const policies = {
      chooseTarget: (state: { tick: number; enemies: { id: number }[] }) => {
        if (state.tick === 25) return state.enemies[0]?.id ?? null;
        if (state.tick === 50) return null;
        return undefined;
      },
    };
    const { state, replay } = runMission(FIXTURE_MISSION, FIXTURE_LOADOUT, 7, policies);
    expect(replay.priorityTargetTaps.length).toBeGreaterThanOrEqual(1);
    expect(replay.priorityTargetTaps.some((t) => t.tick === 25 && t.enemyId !== null)).toBe(true);
    expect(state.priorityTargetId).toBeNull(); // cleared at tick 50, never re-set after
    expect(verifyReplay(replay, FIXTURE_MISSION)).toBe(true);
  });
});

// 2026-07-18 fix: a record's loadout used to be able to embed `maxTargets: Infinity`
// (nova/y2010/orbital), and JSON.stringify(Infinity) === "null" — a persisted/shared
// replay would silently lose its "hit everyone" targeting on reload. HIT_ALL_TARGETS
// (Number.MAX_SAFE_INTEGER) must survive the exact round-trip a real persistence layer
// would perform.
describe('verifyReplay survives a JSON round-trip (nova\'s "hit everyone" targeting)', () => {
  it('a JSON.parse(JSON.stringify(record)) replay still re-simulates to the same hash', () => {
    const novaLoadout = { ...FIXTURE_LOADOUT, weapon: weaponSpecAtLevel('nova', 1) };
    const { replay } = runMission(FIXTURE_MISSION, novaLoadout, 3);
    const roundTripped = JSON.parse(JSON.stringify(replay)) as typeof replay;
    expect(roundTripped.loadout.weapon?.maxTargets).toBe(novaLoadout.weapon.maxTargets);
    expect(verifyReplay(roundTripped, FIXTURE_MISSION)).toBe(true);
  });
});
