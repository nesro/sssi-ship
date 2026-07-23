import { describe, expect, it } from 'vitest';
import { ALL_MISSIONS, MIN_VISUAL_SPACING, missionById, narratorEventsForAttempt } from './missions';
import { TUTORIAL_MISSION_IDS } from '../save/SaveManager';
import { TICKS_PER_SECOND } from '../core/constants';
import { ALL_ABILITIES } from './cards';
import { FIXTURE_LOADOUT } from '../core/fixtures';
import { createCoreState } from '../core/state';
import { resolveAbilityAction } from '../core/cards';
import { resolveNarrator } from '../core/narrator';
import { advanceTick } from '../core/tick';

// Every event's spacing must clear MIN_VISUAL_SPACING's floor for its kind
// (missions.ts's own comment has the full derivation) — this is the only thing
// stopping a future mission-tuning edit from silently reintroducing a too-tight
// spacing value, since MIN_VISUAL_SPACING itself isn't checked anywhere at
// spawn/render time.
describe('mission wave events never spawn a kind tighter than its no-overlap floor', () => {
  for (const mission of ALL_MISSIONS) {
    it(`${mission.id}: every event's spacing clears MIN_VISUAL_SPACING for its kind`, () => {
      for (const event of mission.events) {
        if (event.spacing === 0) continue; // count:1 singleton events — spacing irrelevant
        const min = MIN_VISUAL_SPACING[event.kind];
        if (min === undefined) continue; // kind not in the visual-overlap table
        expect(event.spacing, `${mission.id} @ tick ${String(event.atTimelineTick)}: ${event.kind} spacing`).toBeGreaterThanOrEqual(min);
      }
    });
  }
});

// The static spacing-floor check above assumes enemies land exactly `spacing` apart —
// timeline.ts's spawnEnemy actually multiplies each one's whole cumulative spawn
// distance (LANE_LENGTH + i*spacing) by an independent ±10% SPAWN_JITTER, so the
// jitter's absolute size grows with an enemy's index within its event regardless of
// how generous `spacing` looks in isolation. Found the hard way: t1's old 12-guardian/
// spacing-18 wave passed the static check but produced two guardians 0.47 units apart
// in a real run (missions.ts's t1 comment has the fix). This runs the REAL spawn path
// (createCoreState/advanceTick, not a re-derivation of the jitter formula) across
// several seeds and checks live post-spawn gaps, catching what the static check
// structurally can't.
//
// Scoped to t1 only, not every mission: a broader run of this same check found the
// SAME latent risk across nearly every fodder-based wave in the game (m1-m6, t2, t4,
// w0 — their spacing=14 sits right at MIN_VISUAL_SPACING's floor, and live gaps there
// can dip to ~7 once jitter is applied, per docs/known-issues.md). That's a real,
// pre-existing, game-wide gap worth its own dedicated balance pass — not something to
// silently re-tune as a side effect of this mission's own fix, so it's flagged there
// rather than enforced here.
describe('mission wave events stay visually separated once real spawn jitter is applied', () => {
  const SEEDS_PER_MISSION = 20;
  const CHECKED_MISSION_IDS = new Set(['t1']);
  // Relative gaps between same-kind enemies from one event don't change as they move
  // (they all share that event's kind's speed, ticking down together) until one
  // collides — so one pass per seed, checking right after each qualifying event's own
  // tick, is equivalent to re-running per event but far cheaper.
  for (const mission of ALL_MISSIONS) {
    if (!CHECKED_MISSION_IDS.has(mission.id)) continue;
    const checkedEvents = mission.events.filter((e) => e.count > 1 && MIN_VISUAL_SPACING[e.kind] !== undefined);
    if (checkedEvents.length === 0) continue;
    it(`${mission.id}: live post-jitter gaps clear MIN_VISUAL_SPACING at every multi-enemy event`, () => {
      const lastTick = checkedEvents[checkedEvents.length - 1]?.atTimelineTick ?? 0;
      for (let seed = 0; seed < SEEDS_PER_MISSION; seed++) {
        const state = createCoreState(mission, FIXTURE_LOADOUT, seed, ALL_ABILITIES);
        let nextEventIdx = 0;
        while (state.tick <= lastTick) {
          if (state.pendingNarrator !== null) resolveNarrator(state);
          else if (state.pendingOffer !== null) resolveAbilityAction(state, 0);
          else advanceTick(state);
          while (nextEventIdx < checkedEvents.length && state.tick === checkedEvents[nextEventIdx]?.atTimelineTick) {
            const event = checkedEvents[nextEventIdx];
            if (event === undefined) break;
            const min = MIN_VISUAL_SPACING[event.kind] ?? 0;
            const distances = state.enemies
              .filter((e) => e.kind === event.kind)
              .map((e) => e.distance)
              .sort((a, b) => a - b);
            for (let i = 1; i < distances.length; i++) {
              const gap = (distances[i] ?? 0) - (distances[i - 1] ?? 0);
              expect(gap, `${mission.id} @ tick ${String(event.atTimelineTick)}, seed ${String(seed)}: gap between adjacent ${event.kind}s`).toBeGreaterThanOrEqual(min);
            }
            nextEventIdx += 1;
          }
        }
      }
    });
  }
});

// `advanceTimeline` (core/timeline.ts) walks `nextEventIndex` sequentially and breaks
// at the first not-yet-due event, assuming `events` is sorted by `atTimelineTick`. An
// out-of-order insert doesn't throw — it silently fires LATE, bundled into whichever
// earlier event the walk was still stuck on (a stealth density spike no other test
// would catch, since the spacing-floor test above only checks each event in
// isolation, never cross-event ordering).
describe('mission wave events are sorted by atTimelineTick', () => {
  for (const mission of ALL_MISSIONS) {
    it(`${mission.id}: every event's atTimelineTick is >= the previous event's`, () => {
      for (let i = 1; i < mission.events.length; i++) {
        const prev = mission.events[i - 1];
        const curr = mission.events[i];
        if (prev === undefined || curr === undefined) throw new Error('event index out of range');
        expect(curr.atTimelineTick, `${mission.id}: event ${String(i)} (tick ${String(curr.atTimelineTick)}) is out of order after tick ${String(prev.atTimelineTick)}`).toBeGreaterThanOrEqual(prev.atTimelineTick);
      }
    });
  }
});

// T1/T2 (and on m6, T3) must never share literally identical thresholds on a main
// mission — that would list the same "UNDER Ns" star text twice on the victory
// screen, with two stars always earned or missed together. This test is the
// enforcement: any future percentile recalibration that collapses two tiers back onto
// (nearly) the same value fails here instead of silently shipping duplicate stars.
describe('time-star tiers within one mission are genuinely distinct thresholds', () => {
  const MIN_TIER_GAP_TICKS = 1 * TICKS_PER_SECOND; // 1s — well under any real tier gap
  for (const mission of ALL_MISSIONS) {
    const timeStars = mission.stars.filter(
      (s) => s.family === 'finish-time' || s.family === 'boss-time',
    );
    if (timeStars.length < 2) continue;
    it(`${mission.id}: no two time-star thresholds within 1s of each other`, () => {
      for (let i = 0; i < timeStars.length; i++) {
        for (let j = i + 1; j < timeStars.length; j++) {
          const a = timeStars[i];
          const b = timeStars[j];
          if (a === undefined || b === undefined) throw new Error('star index out of range');
          const gap = Math.abs(a.threshold - b.threshold);
          expect(gap, `${a.id} (${String(a.threshold)}) vs ${b.id} (${String(b.threshold)})`).toBeGreaterThanOrEqual(MIN_TIER_GAP_TICKS);
        }
      }
    });
  }
});

describe('every mission belongs to exactly the right campaign', () => {
  const ACT1_IDS = new Set(['m1', 'm2', 'm3', 'm3b', 'm4', 'm5', 'm6']);
  for (const mission of ALL_MISSIONS) {
    if (mission.id === 'w0') continue; // outside both groupings by design
    it(`${mission.id}: campaign matches TUTORIAL_MISSION_IDS/the act1 set`, () => {
      const expected = TUTORIAL_MISSION_IDS.includes(mission.id) ? 'tutorial' : ACT1_IDS.has(mission.id) ? 'act1' : undefined;
      expect(mission.campaign).toBe(expected);
    });
  }
});

describe('narratorEventsForAttempt', () => {
  const NO_FAILURES = { t1: undefined, t2: undefined, t3: undefined };

  it('t1/t2/t3 use their first-attempt script when the matching FailedOnce flag is unset', () => {
    for (const id of ['t1', 't2', 't3']) {
      const mission = missionById(id);
      expect(narratorEventsForAttempt(mission, NO_FAILURES)).toBe(mission.narratorEvents);
    }
  });

  it('t1/t2/t3 switch to a different (shorter) script once their own FailedOnce flag is set', () => {
    const t1 = missionById('t1');
    const retryT1 = narratorEventsForAttempt(t1, { ...NO_FAILURES, t1: true });
    expect(retryT1).not.toBe(t1.narratorEvents);
    expect(retryT1).toBeDefined();

    const t2 = missionById('t2');
    const retryT2 = narratorEventsForAttempt(t2, { ...NO_FAILURES, t2: true });
    expect(retryT2).not.toBe(t2.narratorEvents);

    const t3 = missionById('t3');
    const retryT3 = narratorEventsForAttempt(t3, { ...NO_FAILURES, t3: true });
    expect(retryT3).not.toBe(t3.narratorEvents);
  });

  it('a FailedOnce flag for a DIFFERENT mission has no effect', () => {
    const t2 = missionById('t2');
    expect(narratorEventsForAttempt(t2, { ...NO_FAILURES, t1: true, t3: true })).toBe(t2.narratorEvents);
  });

  it('t4 (no retry variant) always uses its own script regardless of any flag', () => {
    const t4 = missionById('t4');
    expect(narratorEventsForAttempt(t4, { t1: true, t2: true, t3: true })).toBe(t4.narratorEvents);
  });
});
