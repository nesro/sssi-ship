import { describe, expect, it } from 'vitest';
import { advanceTimeline } from './timeline';
import { FIXTURE_BLOCKER, FIXTURE_FODDER, FIXTURE_LOADOUT } from './fixtures';
import { computeEffectiveStats } from './stats';
import { createCoreState } from './state';
import type { CoreState, MissionSpec } from './types';

const TEST_MISSION: MissionSpec = {
  id: 'timeline-test',
  name: 'Timeline Test',
  blurb: '',
  enemyKinds: { fodder: FIXTURE_FODDER, blocker: FIXTURE_BLOCKER },
  events: [
    { atTimelineTick: 5, kind: 'blocker', count: 1, spacing: 0 },
    { atTimelineTick: 10, kind: 'fodder', count: 2, spacing: 10 },
  ],
  supportCallTicks: [],
  stars: [],
  completionCoins: 0,
};

function stateWithMotor(timelineMultiplier: number): CoreState {
  const loadout = {
    ...FIXTURE_LOADOUT,
    motor: { ...FIXTURE_LOADOUT.motor, timelineMultiplier },
  };
  return createCoreState(TEST_MISSION, loadout, 7);
}

function advance(state: CoreState): void {
  advanceTimeline(state, computeEffectiveStats(state.loadout, state.modifiers));
}

describe('advanceTimeline', () => {
  it('spawns events when the timeline reaches them', () => {
    const state = stateWithMotor(1);
    for (let i = 0; i < 5; i++) advance(state);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]?.kind).toBe('blocker');
    expect(state.spawnedCount).toBe(1);
  });

  it('a faster motor reaches events in fewer ticks', () => {
    const state = stateWithMotor(2);
    for (let i = 0; i < 3; i++) advance(state);
    expect(state.enemies).toHaveLength(1);
  });

  it('a living blocker stalls the timeline until killed', () => {
    const state = stateWithMotor(1);
    for (let i = 0; i < 30; i++) advance(state);
    // Timeline froze at the blocker spawn — the fodder event never fired.
    expect(state.enemies.every((e) => e.kind === 'blocker')).toBe(true);
    expect(state.timelineTick).toBe(5);

    state.enemies = [];
    for (let i = 0; i < 5; i++) advance(state);
    expect(state.enemies.filter((e) => e.kind === 'fodder')).toHaveLength(2);
  });

  it('throws with context on an unknown enemy kind', () => {
    const state = stateWithMotor(1);
    state.mission = {
      ...TEST_MISSION,
      events: [{ atTimelineTick: 1, kind: 'ghost', count: 1, spacing: 0 }],
    };
    expect(() => { advance(state); }).toThrow(/unknown enemy kind "ghost"/);
  });

  it('spawned enemies carry seeded jitter — same seed, same distances', () => {
    const a = stateWithMotor(1);
    const b = stateWithMotor(1);
    for (let i = 0; i < 5; i++) { advance(a); advance(b); }
    expect(a.enemies.map((e) => e.distance)).toEqual(b.enemies.map((e) => e.distance));
  });
});
