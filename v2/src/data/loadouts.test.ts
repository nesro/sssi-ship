import { describe, expect, it } from 'vitest';
import { GENERATOR_KINDS, generatorSpecAtLevel, generatorSpecById, motorSpecAtLevel, motorSpecById, MOTOR_KINDS, rearWeaponSpecById, sideWeaponSpecById } from './items';
import { applyDisableAuxWeapons, applyGeneratorOverride, neutralizeMotorForDaily, STARTER_LOADOUT } from './loadouts';
import { missionById } from './missions';

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

// t2's generator-carryover fix (docs/known-issues.md): a generator picked to fix t1
// (generator-surge-1) carries into t2 on real gear and clears its wall regardless of
// weapon, since the ship's weapon and shield draw from one shared energy pool. Locks
// in that applyGeneratorOverride always pins to the requested item regardless of what
// was really equipped, and that t2's own MissionSpec actually requests it.
describe('applyGeneratorOverride', () => {
  it('replaces the generator with the requested catalog item, regardless of what was equipped', () => {
    for (const kind of GENERATOR_KINDS) {
      for (let level = 1; level <= 5; level++) {
        const loadout = { ...STARTER_LOADOUT, generator: generatorSpecAtLevel(kind, level) };
        const overridden = applyGeneratorOverride(loadout, 'generator-torrent-1');
        expect(overridden.generator).toEqual(generatorSpecById('generator-torrent-1'));
      }
    }
  });

  it('leaves every other loadout field untouched', () => {
    const loadout = { ...STARTER_LOADOUT, generator: generatorSpecById('generator-surge-3') };
    const overridden = applyGeneratorOverride(loadout, 'generator-torrent-1');
    expect({ ...overridden, generator: loadout.generator }).toEqual(loadout);
  });

  it('t2 requests generator-torrent-1 specifically — the real starter default its own clear-rate numbers were tuned against', () => {
    expect(missionById('t2').neutralizeGeneratorId).toBe('generator-torrent-1');
  });
});

// A rear weapon shares the same energy pool the generator confound above describes and
// adds independent damage — the cheapest opportunistic purchase in the whole shop, so it
// carries into t2 the moment a player has any spare coins at all (docs/known-issues.md).
// Locks in that applyDisableAuxWeapons always strips both slots, and that t2 requests it.
describe('applyDisableAuxWeapons', () => {
  it('strips both rear and side weapon regardless of what was equipped', () => {
    const loadout = { ...STARTER_LOADOUT, rearWeapon: rearWeaponSpecById('grenade-1'), sideWeapon: sideWeaponSpecById('focus-1') };
    const stripped = applyDisableAuxWeapons(loadout);
    expect(stripped.rearWeapon).toBeNull();
    expect(stripped.sideWeapon).toBeNull();
  });

  it('leaves every other loadout field untouched', () => {
    const loadout = { ...STARTER_LOADOUT, rearWeapon: rearWeaponSpecById('grenade-1') };
    const stripped = applyDisableAuxWeapons(loadout);
    expect({ ...stripped, rearWeapon: loadout.rearWeapon }).toEqual(loadout);
  });

  it('t2 requests it', () => {
    expect(missionById('t2').disableAuxWeapons).toBe(true);
  });
});
