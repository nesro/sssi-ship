import { BROWNOUT_THRESHOLD, TICKS_PER_SECOND } from './constants';
import { computeEffectiveStats, defaultModifiers } from './stats';
import type { LoadoutSnapshot } from './types';

/**
 * The shop's load calculator (V2_HANDOFF.md §3.8): what a loadout sustains under
 * continuous fire. Uses the same effective-stats pipeline as the live simulation,
 * so the preview can never disagree with the game.
 */
export interface LoadoutReport {
  /** Energy delta per second under sustained fire (no shield pulse draw). */
  netEnergyPerSecond: number;
  /** Seconds from full energy to the brownout threshold; null = indefinite sustain. */
  secondsToBrownout: number | null;
  dpsSingleTarget: number;
  /** DPS summed over a 3-deep queue — shows the pierce/single trade. */
  dpsQueue3: number;
  timelineMultiplier: number;
  shieldCapacity: number;
  generatorOutputPerSecond: number;
}

const QUEUE_DEPTH = 3;

export function computeLoadoutReport(loadout: LoadoutSnapshot): LoadoutReport {
  const stats = computeEffectiveStats(loadout, defaultModifiers());

  const shotsPerSecond = stats.weaponEquipped ? TICKS_PER_SECOND / stats.weaponInterval : 0;
  const weaponDrawPerSecond = shotsPerSecond * stats.weaponEnergyPerShot;
  const motorDrawPerSecond = stats.motorDraw * TICKS_PER_SECOND;
  const outputPerSecond = stats.generatorOutput * TICKS_PER_SECOND;
  const netEnergyPerSecond = outputPerSecond - weaponDrawPerSecond - motorDrawPerSecond;

  const usableEnergy = stats.generatorCapacity * (1 - BROWNOUT_THRESHOLD);
  const secondsToBrownout =
    netEnergyPerSecond >= 0 ? null : usableEnergy / -netEnergyPerSecond;

  let queueDamagePerShot = 0;
  for (let depth = 0; depth < Math.min(QUEUE_DEPTH, stats.weaponMaxTargets); depth++) {
    queueDamagePerShot += stats.weaponDamage * Math.pow(stats.weaponFalloff, depth);
  }

  return {
    netEnergyPerSecond,
    secondsToBrownout,
    dpsSingleTarget: stats.weaponDamage * shotsPerSecond,
    dpsQueue3: queueDamagePerShot * shotsPerSecond,
    timelineMultiplier: stats.motorTimelineMultiplier,
    shieldCapacity: stats.shieldCapacity,
    generatorOutputPerSecond: outputPerSecond,
  };
}
