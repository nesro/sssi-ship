import { describe, expect, it } from 'vitest';
import { ALL_MISSIONS, MIN_VISUAL_SPACING } from './missions';
import { TICKS_PER_SECOND } from '../core/constants';

// 2026-07-17 (playtest feedback: "some enemies are too close to each other and it
// doesn't look good") — every event's spacing was raised to MIN_VISUAL_SPACING's floor
// for its kind (missions.ts's own comment has the full derivation). This test is the
// enforcement: it's the only thing stopping a future mission-tuning edit from silently
// reintroducing a too-tight spacing value, since MIN_VISUAL_SPACING itself isn't
// checked anywhere at spawn/render time.
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

// 2026-07-18 (E-3, fable-review-fixes-2026-07-18.md, Fable's pre-implementation
// review) — `advanceTimeline` (core/timeline.ts) walks `nextEventIndex` sequentially
// and breaks at the first not-yet-due event, assuming `events` is sorted by
// `atTimelineTick`. An out-of-order insert doesn't throw — it silently fires LATE,
// bundled into whichever earlier event the walk was still stuck on (a stealth density
// spike no other test would catch, since the spacing-floor test above only checks each
// event in isolation, never cross-event ordering). This is the enforcement.
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

// 2026-07-18 (B1, docs/plans/fable-review-fixes-2026-07-18.md) — before this, T1 and
// T2 (and on m6, T3) shared literally identical thresholds on every main mission, so
// the victory screen listed the same "UNDER Ns" star text twice and two stars were
// always earned or missed together. This test is the enforcement: any future
// percentile recalibration that collapses two tiers back onto (nearly) the same value
// fails here instead of silently shipping duplicate stars.
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
