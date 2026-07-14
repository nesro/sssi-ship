import { beforeEach, describe, expect, it } from 'vitest';
import './localStorageShim';
import { runMission } from '../src/core/replay';
import { buildMissionResult } from '../src/core/result';
import { STARTER_LOADOUT } from '../src/data/loadouts';
import { MISSION_UNLOCK_EDGES, missionById } from '../src/data/missions';
import { abilityPoolForLoadout } from '../src/data/cards';
import { itemById, sideWeaponSpecAtLevel, weaponSpecAtLevel } from '../src/data/items';
import {
  buildLoadout, defaultSave, resetSave, switchItem, upgradeSubscription,
} from '../src/save/SaveManager';
import {
  crowdSideWeaponPolicy, greedyPick, highValueTargetSideWeaponPolicy,
} from './policies';
import {
  MISSION_ROUTE, PATIENCE_CAP, applyPurchasePolicy, isStarLocked, runOneCampaign,
} from './campaign-simulate';

beforeEach(() => {
  resetSave();
});

describe('localStorage shim', () => {
  it('round-trips a purchase through SaveManager without crashing', () => {
    const save = { ...defaultSave(), coins: 10_000 };
    const next = switchItem(save, 'pulse-2');
    expect(next.equipped.weapon).toBe('pulse-2');
    expect(buildLoadout(next).weapon?.id).toBe('pulse-2');
  });
});

describe('buildLoadout(defaultSave())', () => {
  it('matches STARTER_LOADOUT exactly', () => {
    expect(buildLoadout(defaultSave())).toEqual(STARTER_LOADOUT);
  });
});

describe('MISSION_ROUTE', () => {
  it('respects MISSION_UNLOCK_EDGES — every mission appears after all its prerequisites', () => {
    const positionOf = (id: string): number => MISSION_ROUTE.indexOf(id);
    for (const [fromId, toId] of MISSION_UNLOCK_EDGES) {
      if (positionOf(fromId) === -1 || positionOf(toId) === -1) continue; // w0 not in the route
      expect(positionOf(fromId)).toBeLessThan(positionOf(toId));
    }
  });

  it('unlocks a mission on completion regardless of star count — t1 has no prerequisite stars', () => {
    const t1 = missionById('t1');
    expect(t1.forcedLoadout).toBeDefined();
    const incoming = MISSION_UNLOCK_EDGES.filter(([, toId]) => toId === 't1');
    expect(incoming).toHaveLength(0);
  });
});

describe('runOneCampaign', () => {
  it('is deterministic for the same seed and archetype', () => {
    const a = runOneCampaign('expert', 42);
    const b = runOneCampaign('expert', 42);
    expect(a.missionLog).toEqual(b.missionLog);
    expect(a.stuckAt).toBe(b.stuckAt);
    expect(a.finalCoins).toBe(b.finalCoins);
    expect(a.combatTicks).toBe(b.combatTicks);
  });

  it('never exceeds the patience cap for any single mission', () => {
    const record = runOneCampaign('average', 7);
    for (const entry of record.missionLog) {
      expect(entry.attempts).toBeLessThanOrEqual(PATIENCE_CAP);
    }
  });

  it('recomputes the ability pool fresh per attempt — a mid-campaign subscription change is reflected next attempt', () => {
    let save = defaultSave();
    const before = abilityPoolForLoadout(buildLoadout(save));
    save = { ...save, coins: 10_000 };
    save = upgradeSubscription(save, 'sub-basic');
    const after = abilityPoolForLoadout(buildLoadout(save));
    expect(after.length).toBeGreaterThan(before.length);
  });

  // Fable's review (docs/plans/expert-average-campaign-tuning.md): committing to the
  // WRONG starter kind could risk a permanently-stuck campaign under the patience cap
  // (e.g. ion clears m5 at ~0.7%) — this is the concrete regression test for that risk,
  // confirming `average`'s free-starter-kind choice (pulse/wall/torrent/rush) never
  // triggers it, matching §3's "never stuck" invariant.
  it('average (starter-kind, never switches) always completes the campaign — never stuck', () => {
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const record = runOneCampaign('average', seed);
      expect(record.stuckAt).toBeNull();
    }
  });

  it('expert also always completes the campaign', () => {
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const record = runOneCampaign('expert', seed);
      expect(record.stuckAt).toBeNull();
    }
  });
});

describe('applyPurchasePolicy', () => {
  it('never buys a purchase the player does not have enough stars for', () => {
    // sub-basic Lv3 gates at ★18 (src/data/subscriptions.ts) — a save with 0 stars
    // and enough coins to afford it must still not upgrade past what stars allow.
    const rich = { ...defaultSave(), coins: 100_000 };
    const next = applyPurchasePolicy(rich, 'average', null);
    expect(next.ownedSubscriptions['sub-basic']).toBeLessThanOrEqual(2);
  });

  it('isStarLocked matches hub.ts semantics: locked iff starsRequired exceeds totalStars', () => {
    const save = defaultSave();
    expect(isStarLocked(0, save)).toBe(false);
    expect(isStarLocked(1, save)).toBe(true);
  });

  it('does nothing when no candidate is affordable', () => {
    const broke = defaultSave();
    const next = applyPurchasePolicy(broke, 'average', null);
    expect(next).toBe(broke);
  });

  // Both archetypes must handle t1-t4 (no RECOMMENDED_KIND_PER_MISSION or
  // INTENDED_LOADOUT_LEVELS entry exists for tutorials) the same way the original
  // informed-saver/impulse-spender did: fall back to the opportunistic systems,
  // never throw.
  it('expert falls back to opportunistic purchases during the tutorial phase (no tuning table entry)', () => {
    const rich = { ...defaultSave(), coins: 5000 };
    expect(() => applyPurchasePolicy(rich, 'expert', 't2')).not.toThrow();
  });

  it('average never switches its committed core kind, even fully maxed', () => {
    // Cheapest-core-first means weapon (the priciest ladder) is bought last — iterate
    // until the save stops changing (or a safety cap) rather than a fixed small count.
    // Stars seeded so no level's star gate (weapon lv5 = 26★) blocks the climb — this
    // test is about kind commitment, not star-gate feasibility.
    const missionStars: Record<string, string[]> = { synthetic: Array.from({ length: 30 }, (_, i) => `s${String(i)}`) };
    let save = { ...defaultSave(), coins: 1_000_000, missionStars };
    for (let i = 0; i < 60; i++) {
      const next = applyPurchasePolicy(save, 'average', null);
      if (next === save) break;
      save = next;
    }
    expect(save.equipped.weapon).toBe(weaponSpecAtLevel('pulse', 5).id);
  });

  // expert exploits the 100% sell-back rule (GAME_DESIGN.md §5) — switching to a
  // different kind at the SAME level must cost exactly 0, or the "free rebuild" premise
  // (Fable's review, point 3) doesn't hold.
  it('expert-style same-level kind switches cost exactly 0 (100% refund invariant)', () => {
    const save = { ...defaultSave(), coins: 5000, equipped: { ...defaultSave().equipped, weapon: 'pulse-3' } };
    const scatterId = weaponSpecAtLevel('scatter', 3).id;
    expect(itemById('pulse-3').price).toBe(itemById(scatterId).price);
    const next = switchItem(save, scatterId);
    expect(next.coins).toBe(save.coins);
    expect(next.equipped.weapon).toBe(scatterId);
  });
});

describe('side-weapon policies actually fire (tools/policies.ts)', () => {
  it('highValueTargetSideWeaponPolicy fires at least once on a mission with high-value targets (m4, blocker-heavy)', () => {
    const mission = missionById('m4');
    const loadout = {
      ...buildLoadout(defaultSave()),
      sideWeapon: sideWeaponSpecAtLevel('railgun', 2),
    };
    const { state } = runMission(mission, loadout, 1, {
      abilityPool: abilityPoolForLoadout(loadout), pickAbility: greedyPick,
      useSideWeapon: highValueTargetSideWeaponPolicy(),
    });
    buildMissionResult(state);
    expect(state.stats.sideShotsFired).toBeGreaterThan(0);
  });

  it('crowdSideWeaponPolicy fires at least once on a mission with several enemies on screen (m5, swarm-heavy)', () => {
    const mission = missionById('m5');
    const loadout = {
      ...buildLoadout(defaultSave()),
      sideWeapon: sideWeaponSpecAtLevel('flechette', 2),
    };
    const { state } = runMission(mission, loadout, 1, {
      abilityPool: abilityPoolForLoadout(loadout), pickAbility: greedyPick,
      useSideWeapon: crowdSideWeaponPolicy(),
    });
    buildMissionResult(state);
    expect(state.stats.sideShotsFired).toBeGreaterThan(0);
  });

  it('never fires with zero charges left (guards against a policy bug draining past zero)', () => {
    const mission = missionById('m1');
    const loadout = {
      ...buildLoadout(defaultSave()),
      sideWeapon: sideWeaponSpecAtLevel('focus', 1),
    };
    const { state } = runMission(mission, loadout, 1, {
      abilityPool: abilityPoolForLoadout(loadout), pickAbility: greedyPick,
      useSideWeapon: highValueTargetSideWeaponPolicy(),
    });
    expect(state.ship.sideWeaponCharges).toBeGreaterThanOrEqual(0);
  });
});
