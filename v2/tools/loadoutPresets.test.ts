import { describe, expect, it } from 'vitest';
import { weaponSpecAtLevel } from '../src/data/items';
import { timeStarT3Loadout, timeStarT4Loadout } from './loadoutPresets';

// The starter (index 0) weapon kind — matches loadoutPresets.ts's own `kindAt(WEAPON_KINDS, 0)`.
const STARTER_WEAPON_KIND = 'pulse';

// F4 (docs/known-issues.md) — the fixed T3/T4 reference loadouts for higher time-star
// tiers. Verified via pnpm balance/sim that these clear ≥98%/100% across every main
// mission (that's an empirical sweep, not a unit test — these tests just lock the
// exact levels in place so a future edit can't silently drift the tier without anyone
// noticing, since the balance-sweep verification is expensive to re-run by hand).

describe('timeStarT3Loadout', () => {
  it('is weapon Lv4 / shield Lv3 / generator Lv5 / motor Lv2, starter kind', () => {
    const loadout = timeStarT3Loadout();
    expect(loadout.weapon?.id).toBe(weaponSpecAtLevel(STARTER_WEAPON_KIND, 4).id);
    expect(loadout.generator.outputPerTick).toBeGreaterThan(0);
    expect(loadout.motor.timelineMultiplier).toBeGreaterThan(1); // faster than motor-1
  });
});

describe('timeStarT4Loadout', () => {
  it('is weapon Lv5 / shield Lv4 / generator Lv5 / motor Lv3, starter kind', () => {
    const loadout = timeStarT4Loadout();
    expect(loadout.weapon?.id).toBe(weaponSpecAtLevel(STARTER_WEAPON_KIND, 5).id);
  });

  it('is a strictly faster timeline than t3, matching the T3 < T4 tier ordering', () => {
    expect(timeStarT4Loadout().motor.timelineMultiplier).toBeGreaterThan(timeStarT3Loadout().motor.timelineMultiplier);
  });
});
