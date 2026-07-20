import { describe, expect, it } from 'vitest';
import { ALL_NEW_ABILITIES } from './abilities';
import { ALL_ABILITIES, abilityById } from './cards';
import { defaultModifiers } from '../core/stats';
import type { RunModifiers } from '../core/types';

function applyAbility(id: string) {
  const ability = abilityById(id);
  if (ability.apply === undefined) throw new Error(`${id} has no apply function`);
  return ability.apply(defaultModifiers());
}

// ── abilityById covers ALL_NEW_ABILITIES after the cards.ts fix ────────────────

describe('abilityById: covers new company abilities', () => {
  it('looks up every new ability without throwing', () => {
    for (const ability of ALL_NEW_ABILITIES) {
      expect(() => abilityById(ability.id)).not.toThrow();
      expect(abilityById(ability.id).id).toBe(ability.id);
    }
  });
});

// ── Fractional-bonus sanity check ───────────────────────────────────────────────
// combat.ts applies these five fields as `mult *= 1 + bonus` (computeStateDmgMult,
// computeProgressDmgMult) — a card writing an absolute-looking number instead of a
// fraction silently becomes a multi-hundred-percent damage multiplier. This guards
// against that mistake in any card.
const MULTIPLICATIVE_BONUS_FIELDS: (keyof RunModifiers)[] = [
  'fullEnergyDmgBonus', 'singleEnemyDmgBonus', 'shieldActiveDmgBonus',
  'earlyBirdDmgBonus', 'finalPushDmgBonus',
];
const MAX_SANE_BONUS = 1; // no shipped card exceeds +0.6 today; 1 leaves headroom without allowing a unit slip

describe('Passive abilities: multiplicative damage bonuses stay in a sane fractional range', () => {
  for (const ability of [...ALL_ABILITIES, ...ALL_NEW_ABILITIES]) {
    const apply = ability.apply;
    if (apply === undefined) continue;
    it(`${ability.id} keeps every multiplicative bonus field <= ${String(MAX_SANE_BONUS)}`, () => {
      const result = apply(defaultModifiers());
      for (const field of MULTIPLICATIVE_BONUS_FIELDS) {
        expect(result[field]).toBeLessThanOrEqual(MAX_SANE_BONUS);
      }
    });
  }
});

// ── Nexus passives ─────────────────────────────────────────────────────────────

describe('Nexus passive abilities: apply() modifies correct modifier', () => {
  it('armourBreaker: highHpEnemyDamageMult × 1.5', () => {
    const base = defaultModifiers().highHpEnemyDamageMult;
    expect(applyAbility('nexus-armour-breaker').highHpEnemyDamageMult).toBeCloseTo(base * 1.5);
  });

  it('blockerBane: blockerDamageMult × 1.6', () => {
    const base = defaultModifiers().blockerDamageMult;
    expect(applyAbility('nexus-blocker-bane').blockerDamageMult).toBeCloseTo(base * 1.6);
  });

  it('shrapnelKill: killExplosionDamage + 8', () => {
    const base = defaultModifiers().killExplosionDamage;
    expect(applyAbility('nexus-shrapnel').killExplosionDamage).toBeCloseTo(base + 8);
  });
});

// ── Aegis passives ─────────────────────────────────────────────────────────────

describe('Aegis passive abilities: apply() modifies correct modifier', () => {
  it('hullRecovery: hullPerKill + 1', () => {
    const base = defaultModifiers().hullPerKill;
    expect(applyAbility('aegis-hull-recovery').hullPerKill).toBeCloseTo(base + 1);
  });

  it('shieldResonance: shieldPulseMult × 1.4', () => {
    const base = defaultModifiers().shieldPulseMult;
    expect(applyAbility('aegis-shield-resonance').shieldPulseMult).toBeCloseTo(base * 1.4);
  });

  it('guardianSync: shieldActiveDmgBonus + 0.25', () => {
    const base = defaultModifiers().shieldActiveDmgBonus;
    expect(applyAbility('aegis-guardian-sync').shieldActiveDmgBonus).toBeCloseTo(base + 0.25);
  });
});

// ── Quantum passives ───────────────────────────────────────────────────────────

describe('Quantum passive abilities: apply() modifies correct modifier', () => {
  it('efficiencyCore: weaponEnergyMult × 0.8', () => {
    const base = defaultModifiers().weaponEnergyMult;
    expect(applyAbility('quantum-efficiency-core').weaponEnergyMult).toBeCloseTo(base * 0.8);
  });

  it('pulseAmplifier: energyPerPulse + 5', () => {
    const base = defaultModifiers().energyPerPulse;
    expect(applyAbility('quantum-pulse-amplifier').energyPerPulse).toBeCloseTo(base + 5);
  });

  it('fullChargeBonus: fullEnergyDmgBonus + 0.3', () => {
    const base = defaultModifiers().fullEnergyDmgBonus;
    expect(applyAbility('quantum-full-charge').fullEnergyDmgBonus).toBeCloseTo(base + 0.3);
  });
});

// ── Comet passives ─────────────────────────────────────────────────────────────

describe('Comet passive abilities: apply() modifies correct modifier', () => {
  it('motorEfficiency: motorDrawMult × 0.75', () => {
    const base = defaultModifiers().motorDrawMult;
    expect(applyAbility('comet-motor-efficiency').motorDrawMult).toBeCloseTo(base * 0.75);
  });

  it('earlyAssault: earlyBirdDmgBonus + 0.35', () => {
    const base = defaultModifiers().earlyBirdDmgBonus;
    expect(applyAbility('comet-early-assault').earlyBirdDmgBonus).toBeCloseTo(base + 0.35);
  });

  it('lastLapPush: finalPushDmgBonus + 0.4', () => {
    const base = defaultModifiers().finalPushDmgBonus;
    expect(applyAbility('comet-last-lap').finalPushDmgBonus).toBeCloseTo(base + 0.4);
  });
});

// ── Active abilities: no apply function ────────────────────────────────────────

describe('Active abilities: no apply function, have activate', () => {
  const ACTIVE_IDS = [
    'nexus-overload', 'nexus-barrage',
    'aegis-barrier', 'aegis-resonance-pulse',
    'quantum-power-surge', 'quantum-energy-overdrive',
    'comet-speed-burst', 'comet-timeline-rush',
  ];

  for (const id of ACTIVE_IDS) {
    it(`${id}: apply is undefined, activate is defined`, () => {
      const ability = abilityById(id);
      expect(ability.apply).toBeUndefined();
      expect(ability.activate).toBeTypeOf('function');
    });
  }
});
