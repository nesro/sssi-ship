// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyMissionResult,
  buildLoadout,
  buyItem,
  buySupplyCharge,
  defaultSave,
  equipItem,
  isMissionUnlocked,
  loadSave,
  persistSave,
  resetSave,
  totalStars,
} from './SaveManager';
import type { MissionResult } from '../core/result';

function victoryResult(overrides: Partial<MissionResult> = {}): MissionResult {
  return {
    missionId: 'm1',
    status: 'victory',
    durationTicks: 300,
    earnedStarIds: ['m1-hull-50', 'm1-shield'],
    coins: 100,
    hullFraction: 0.8,
    weaponKills: 10,
    spawned: 10,
    collisions: 0,
    ...overrides,
  };
}

beforeEach(() => {
  resetSave();
});

describe('loadSave', () => {
  it('returns defaults when nothing is stored', () => {
    const save = loadSave();
    expect(save.coins).toBe(0);
    expect(save.ownedItemIds).toContain('pulse-1');
  });

  it('round-trips through localStorage', () => {
    const save = { ...defaultSave(), coins: 123 };
    persistSave(save);
    expect(loadSave().coins).toBe(123);
  });

  it('falls back to defaults on corrupt data', () => {
    localStorage.setItem('nesro-nova-v2-save', '{not json');
    expect(loadSave().coins).toBe(0);
  });

  it('falls back to defaults on a version mismatch', () => {
    localStorage.setItem('nesro-nova-v2-save', JSON.stringify({ version: 99, coins: 5000 }));
    expect(loadSave().coins).toBe(0);
  });
});

describe('applyMissionResult', () => {
  it('adds coins and new stars', () => {
    const { save, newStarIds } = applyMissionResult(defaultSave(), victoryResult());
    expect(save.coins).toBe(100);
    expect(newStarIds).toEqual(['m1-hull-50', 'm1-shield']);
    expect(totalStars(save)).toBe(2);
  });

  it('replays pay full coins but only newly earned stars count', () => {
    const first = applyMissionResult(defaultSave(), victoryResult()).save;
    const { save, newStarIds } = applyMissionResult(first, victoryResult());
    expect(save.coins).toBe(200);
    expect(newStarIds).toEqual([]);
    expect(totalStars(save)).toBe(2);
  });
});

describe('mission gating', () => {
  it('m1 is open from the start; m3 needs stars', () => {
    const save = defaultSave();
    expect(isMissionUnlocked(save, 'm1')).toBe(true);
    expect(isMissionUnlocked(save, 'm3')).toBe(false);
  });
});

describe('shop transactions', () => {
  it('buying deducts coins and adds ownership; equipping switches the slot', () => {
    let save = { ...defaultSave(), coins: 500 };
    save = buyItem(save, 'shield-2');
    expect(save.coins).toBe(250);
    save = equipItem(save, 'shield-2');
    expect(buildLoadout(save).shield.id).toBe('shield-2');
  });

  it('refuses purchases without enough coins', () => {
    expect(() => buyItem(defaultSave(), 'shield-2')).toThrow(/Not enough coins/);
  });

  it('refuses equipping unowned items', () => {
    expect(() => equipItem(defaultSave(), 'shield-3')).toThrow(/unowned/);
  });

  it('supply charges cap at maxCharges and appear in the loadout', () => {
    let save = { ...defaultSave(), coins: 10000 };
    save = buySupplyCharge(save, 'sup-shield');
    save = buySupplyCharge(save, 'sup-shield');
    save = buySupplyCharge(save, 'sup-shield');
    expect(() => buySupplyCharge(save, 'sup-shield')).toThrow(/max charges/);
    const loadout = buildLoadout(save);
    expect(loadout.supplies).toEqual([
      expect.objectContaining({ charges: 3 }),
    ]);
  });
});
