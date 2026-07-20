import { describe, expect, it } from 'vitest';
import { MOTOR_KINDS, motorSpecAtLevel, motorSpecById } from './items';
import { neutralizeMotorForDaily, STARTER_LOADOUT } from './loadouts';

// The Daily Mission's motor-tier inversion (docs/known-issues.md) is fixed by making
// motor level score-neutral there — this locks in that neutralizeMotorForDaily always
// collapses to the loadout's own kind's Lv1 spec, regardless of the level equipped.
describe('neutralizeMotorForDaily', () => {
  it('replaces every motor level with its own kind\'s Lv1 spec', () => {
    for (const kind of MOTOR_KINDS) {
      for (let level = 1; level <= 5; level++) {
        const loadout = { ...STARTER_LOADOUT, motor: motorSpecAtLevel(kind, level) };
        const neutralized = neutralizeMotorForDaily(loadout);
        expect(neutralized.motor).toEqual(motorSpecAtLevel(kind, 1));
      }
    }
  });

  it('leaves every other loadout field untouched', () => {
    const loadout = { ...STARTER_LOADOUT, motor: motorSpecById('motor-sentinel-4') };
    const neutralized = neutralizeMotorForDaily(loadout);
    expect({ ...neutralized, motor: loadout.motor }).toEqual(loadout);
  });
});
