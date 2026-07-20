import { describe, expect, it } from 'vitest';
import { ALL_MISSIONS, MIN_VISUAL_SPACING } from './missions';
import { TUTORIAL_MISSION_IDS } from '../save/SaveManager';
import { TICKS_PER_SECOND } from '../core/constants';

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
