import { describe, expect, it } from 'vitest';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';
import { resolveNarrator } from './narrator';
import { hashCoreState } from './replay';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import type { CoreState, MissionSpec } from './types';

function freshState(narratorEvents?: MissionSpec['narratorEvents']): CoreState {
  const mission: MissionSpec = narratorEvents !== undefined
    ? { ...FIXTURE_MISSION, narratorEvents }
    : FIXTURE_MISSION;
  return createCoreState(mission, FIXTURE_LOADOUT, 1);
}

function advanceTicks(state: CoreState, n: number): void {
  for (let i = 0; i < n; i++) advanceTick(state);
}

describe('narrator events', () => {
  it('fires at the correct timeline tick', () => {
    const state = freshState([{ atTimelineTick: 2, lines: ['Hello'] }]);
    advanceTicks(state, 2);
    expect(state.pendingNarrator).toEqual(['Hello']);
    expect(state.firedNarratorTicks).toContain(2);
  });

  it('blocks tick advancement while pendingNarrator is set', () => {
    const state = freshState([{ atTimelineTick: 1, lines: ['Pause'] }]);
    advanceTicks(state, 1);
    expect(state.pendingNarrator).not.toBeNull();
    const tickBefore = state.tick;
    advanceTick(state);
    expect(state.tick).toBe(tickBefore);
  });

  it('does not re-fire after resolveNarrator', () => {
    const state = freshState([{ atTimelineTick: 1, lines: ['Once'] }]);
    advanceTicks(state, 1);
    resolveNarrator(state);
    advanceTicks(state, 10);
    expect(state.pendingNarrator).toBeNull();
    expect(state.firedNarratorTicks).toEqual([1]);
  });

  it('fires multiple events in order, one at a time', () => {
    const state = freshState([
      { atTimelineTick: 2, lines: ['First'] },
      { atTimelineTick: 5, lines: ['Second'] },
    ]);
    advanceTicks(state, 2);
    expect(state.pendingNarrator).toEqual(['First']);
    expect(state.firedNarratorTicks).toEqual([2]);

    resolveNarrator(state);
    advanceTicks(state, 3);
    expect(state.pendingNarrator).toEqual(['Second']);
    expect(state.firedNarratorTicks).toEqual([2, 5]);
  });
});

describe('narrator hash behaviour', () => {
  it('firedNarratorTicks changes the state hash', () => {
    const state = freshState();
    const before = hashCoreState(state);
    state.firedNarratorTicks = [42];
    expect(hashCoreState(state)).not.toBe(before);
  });

  it('pendingNarrator does not change the state hash', () => {
    const state = freshState();
    const before = hashCoreState(state);
    state.pendingNarrator = ['popup text'];
    expect(hashCoreState(state)).toBe(before);
  });
});
