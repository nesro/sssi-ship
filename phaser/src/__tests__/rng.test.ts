import { describe, it, expect } from 'vitest';
import { mulberry32, utcDateInt, utcDateString } from '../utils/rng.js';

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const rngA = mulberry32(12345);
    const rngB = mulberry32(12345);
    for (let i = 0; i < 20; i++) {
      expect(rngA()).toBeCloseTo(rngB(), 10);
    }
  });

  it('produces different sequences for different seeds', () => {
    const rngA = mulberry32(111);
    const rngB = mulberry32(222);
    const seqA = Array.from({ length: 10 }, () => rngA());
    const seqB = Array.from({ length: 10 }, () => rngB());
    expect(seqA).not.toEqual(seqB);
  });

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(99999);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('utcDateInt', () => {
  it('returns a positive integer', () => {
    expect(utcDateInt()).toBeGreaterThan(20240101);
  });

  it('is consistent with utcDateString', () => {
    const str = utcDateString();  // "YYYY-MM-DD"
    const expected = parseInt(str.replace(/-/g, ''), 10);
    expect(utcDateInt()).toBe(expected);
  });
});

describe('utcDateString', () => {
  it('matches YYYY-MM-DD format', () => {
    expect(utcDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
