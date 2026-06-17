import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from './constants';
import { FIXTURE_LOADOUT, FIXTURE_WEAPON } from './fixtures';
import { computeLoadoutReport } from './report';
import type { LoadoutSnapshot } from './types';

describe('computeLoadoutReport', () => {
  it('reports indefinite sustain when the generator out-produces all draws', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      generator: { id: 'big', outputPerTick: 10, capacity: 100, pulseDrainFraction: 0.5 },
    };
    const report = computeLoadoutReport(loadout);
    expect(report.netEnergyPerSecond).toBeGreaterThan(0);
    expect(report.secondsToBrownout).toBeNull();
  });

  it('estimates seconds-to-brownout when draws exceed output', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      weapon: { ...FIXTURE_WEAPON, energyPerShot: 20 },
    };
    const report = computeLoadoutReport(loadout);
    expect(report.netEnergyPerSecond).toBeLessThan(0);
    expect(report.secondsToBrownout).not.toBeNull();
    expect(report.secondsToBrownout).toBeGreaterThan(0);
  });

  it('computes single-target DPS from damage and interval', () => {
    const report = computeLoadoutReport(FIXTURE_LOADOUT);
    const weapon = FIXTURE_WEAPON;
    const expected = weapon.damagePerShot * (TICKS_PER_SECOND / weapon.ticksBetweenShots);
    expect(report.dpsSingleTarget).toBeCloseTo(expected);
  });

  it('a pierce weapon shows higher queue DPS than single-target DPS', () => {
    const loadout: LoadoutSnapshot = {
      ...FIXTURE_LOADOUT,
      weapon: { ...FIXTURE_WEAPON, maxTargets: 3, falloffPerTarget: 0.7 },
    };
    const report = computeLoadoutReport(loadout);
    expect(report.dpsQueue3).toBeGreaterThan(report.dpsSingleTarget);
  });

  it('a single-target weapon has equal queue and single DPS', () => {
    const report = computeLoadoutReport(FIXTURE_LOADOUT);
    expect(report.dpsQueue3).toBeCloseTo(report.dpsSingleTarget);
  });
});
