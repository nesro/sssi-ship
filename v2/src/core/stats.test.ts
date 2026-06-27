import { describe, expect, it } from 'vitest';
import { computeEffectiveStats, defaultModifiers } from './stats';
import { createCoreState } from './state';
import { advanceTick } from './tick';
import { FIXTURE_LOADOUT, FIXTURE_MISSION } from './fixtures';

function stats(mods: Partial<ReturnType<typeof defaultModifiers>> = {}) {
  return computeEffectiveStats(FIXTURE_LOADOUT, { ...defaultModifiers(), ...mods });
}

// ── Weapon modifier deltas ────────────────────────────────────────────────────

describe('computeEffectiveStats: weapon modifiers', () => {
  it('weaponDamageMult scales weapon damage', () => {
    const base = stats().weaponDamage;
    expect(stats({ weaponDamageMult: 1.3 }).weaponDamage).toBeCloseTo(base * 1.3);
  });

  it('fireIntervalMult stretches fire interval', () => {
    const base = stats().weaponInterval;
    expect(stats({ fireIntervalMult: 0.8 }).weaponInterval).toBeCloseTo(base * 0.8);
  });

  it('weaponEnergyMult scales energy per shot', () => {
    const base = stats().weaponEnergyPerShot;
    expect(stats({ weaponEnergyMult: 0.75 }).weaponEnergyPerShot).toBeCloseTo(base * 0.75);
  });

  it('extraPierce adds to max targets', () => {
    const base = stats().weaponMaxTargets;
    expect(stats({ extraPierce: 2 }).weaponMaxTargets).toBe(base + 2);
  });
});

// ── Shield modifier deltas ────────────────────────────────────────────────────

describe('computeEffectiveStats: shield modifiers', () => {
  it('shieldCapacityBonus adds flat capacity', () => {
    const base = stats().shieldCapacity;
    expect(stats({ shieldCapacityBonus: 10 }).shieldCapacity).toBeCloseTo(base + 10);
  });

  it('shieldCapacityMult scales total capacity (applied after bonus)', () => {
    const base = stats().shieldCapacity;
    expect(stats({ shieldCapacityMult: 1.2 }).shieldCapacity).toBeCloseTo(base * 1.2);
  });

  it('shieldCapacityMult = 0 collapses capacity to zero (GLASS CANNON)', () => {
    expect(stats({ shieldCapacityMult: 0 }).shieldCapacity).toBe(0);
  });

  it('shieldPulseMult scales the pulse fraction', () => {
    const base = stats().shieldPulseFraction;
    expect(stats({ shieldPulseMult: 1.5 }).shieldPulseFraction).toBeCloseTo(base * 1.5);
  });
});

// ── Generator modifier deltas ─────────────────────────────────────────────────

describe('computeEffectiveStats: generator modifiers', () => {
  it('generatorOutputBonus adds flat output per tick', () => {
    const base = stats().generatorOutput;
    expect(stats({ generatorOutputBonus: 3 }).generatorOutput).toBeCloseTo(base + 3);
  });

  it('generatorCapacityBonus adds flat generator capacity', () => {
    const base = stats().generatorCapacity;
    expect(stats({ generatorCapacityBonus: 20 }).generatorCapacity).toBeCloseTo(base + 20);
  });

  it('generatorPulseDrain scales with effective generatorCapacity', () => {
    const base = stats().generatorPulseDrain;
    const withBonus = stats({ generatorCapacityBonus: 20 });
    // pulseDrain = pulseDrainFraction × generatorCapacity; higher capacity → higher drain
    expect(withBonus.generatorPulseDrain).toBeGreaterThan(base);
  });
});

// ── Motor modifier deltas ─────────────────────────────────────────────────────

describe('computeEffectiveStats: motor modifiers', () => {
  it('motorTimelineMult scales timeline speed', () => {
    const base = stats().motorTimelineMultiplier;
    expect(stats({ motorTimelineMult: 1.5 }).motorTimelineMultiplier).toBeCloseTo(base * 1.5);
  });

  it('motorDrawMult scales energy draw per tick', () => {
    const loadoutWithDraw = {
      ...FIXTURE_LOADOUT,
      motor: { ...FIXTURE_LOADOUT.motor, powerDrawPerTick: 2 },
    };
    const baseDraw = computeEffectiveStats(loadoutWithDraw, defaultModifiers()).motorDraw;
    const boosted = computeEffectiveStats(loadoutWithDraw, { ...defaultModifiers(), motorDrawMult: 2 }).motorDraw;
    expect(boosted).toBeCloseTo(baseDraw * 2);
  });
});

// ── No weapon equipped ────────────────────────────────────────────────────────

describe('computeEffectiveStats: no weapon', () => {
  it('all weapon fields are 0 and weaponEquipped is false when weapon is null', () => {
    const noWeapon = { ...FIXTURE_LOADOUT, weapon: null };
    const s = computeEffectiveStats(noWeapon, defaultModifiers());
    expect(s.weaponEquipped).toBe(false);
    expect(s.weaponDamage).toBe(0);
    expect(s.weaponInterval).toBe(0);
    expect(s.weaponEnergyPerShot).toBe(0);
    expect(s.weaponMaxTargets).toBe(0);
  });
});

// ── damageBoostMult / fireRateBoostMult / generatorBoostMult pass-throughs ────

describe('computeEffectiveStats: active-effect pass-through multipliers', () => {
  it('damageBoostMult multiplies weaponDamage (from active ability e.g. Overload)', () => {
    const base = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 1).weaponDamage;
    const boosted = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 2).weaponDamage;
    expect(boosted).toBeCloseTo(base * 2);
  });

  it('fireRateBoostMult divides weapon interval (>1 = faster)', () => {
    const base = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 1, 1).weaponInterval;
    const faster = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 1, 2).weaponInterval;
    expect(faster).toBeCloseTo(base / 2);
  });

  it('generatorBoostMult multiplies generator output', () => {
    const base = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 1, 1, 1).generatorOutput;
    const boosted = computeEffectiveStats(FIXTURE_LOADOUT, defaultModifiers(), 1, 1, 1.5).generatorOutput;
    expect(boosted).toBeCloseTo(base * 1.5);
  });
});

// ── pendingOffer blocks advanceTick ───────────────────────────────────────────

describe('pendingOffer blocks tick advancement', () => {
  it('tick counter does NOT advance while pendingOffer is non-null', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    const tickBefore = state.tick;
    state.pendingOffer = { abilityIds: ['a', 'b', 'c'] };
    advanceTick(state);
    expect(state.tick).toBe(tickBefore); // frozen
  });

  it('tick advances normally after the offer is cleared', () => {
    const state = createCoreState(FIXTURE_MISSION, FIXTURE_LOADOUT, 1, []);
    state.pendingOffer = { abilityIds: ['a', 'b', 'c'] };
    advanceTick(state); // blocked
    state.pendingOffer = null;
    const tickBefore = state.tick;
    advanceTick(state);
    expect(state.tick).toBe(tickBefore + 1);
  });
});
