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
  MISSION_ROUTE, PATIENCE_CAP, applyPurchasePolicy, computeFunScore, isStarLocked,
  pacingShapeScore, runOneCampaign, timeFitScore,
} from './campaign-simulate';
import type { CampaignRecord } from './campaign-simulate';

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
  // 20s, not vitest's 5s default: each of these runs 30 FULL campaigns (~10-15
  // missions × retries each) — ~3-4s alone, but over 5s whenever the suite shares the
  // machine with a dev server or a Playwright batch (measured 6.3s, 2026-07-18), which
  // made exactly this pair the suite's only load-flaky tests.
  it('average (starter-kind, never switches) always completes the campaign — never stuck', () => {
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const record = runOneCampaign('average', seed);
      expect(record.stuckAt).toBeNull();
    }
  }, 20_000);

  it('expert also always completes the campaign', () => {
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      const record = runOneCampaign('expert', seed);
      expect(record.stuckAt).toBeNull();
    }
  }, 20_000);
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

describe('timeFitScore', () => {
  it('scores 100 anywhere inside the 60-75min target band', () => {
    expect(timeFitScore(60)).toBe(100);
    expect(timeFitScore(67)).toBe(100);
    expect(timeFitScore(75)).toBe(100);
  });

  it('decays linearly below the band', () => {
    expect(timeFitScore(45)).toBeCloseTo(100 - 15 * 1.5, 5); // 15min short
  });

  it('decays linearly above the band', () => {
    expect(timeFitScore(90)).toBeCloseTo(100 - 15 * 1.5, 5); // 15min over
  });

  it('clamps at 0 for a run far outside the band, never goes negative', () => {
    expect(timeFitScore(200)).toBe(0); // 125min over the 75min ceiling
  });
});

describe('pacingShapeScore', () => {
  const MAIN_MISSIONS = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];

  /** One synthetic completed campaign with a given hull-at-clear per main mission. */
  function fixtureCampaign(hullPctByMission: Record<string, number>): CampaignRecord {
    return {
      archetype: 'expert',
      stuckAt: null,
      combatTicks: 0,
      finalCoins: 0,
      finalStars: 0,
      trajectory: [],
      missionLog: MAIN_MISSIONS.map((missionId) => ({
        missionId,
        attempts: 1,
        cleared: true,
        hullFractionAtClear: (hullPctByMission[missionId] ?? 100) / 100,
      })),
    };
  }

  it('scores low for a flat campaign (same hull margin at every mission)', () => {
    const flat = fixtureCampaign({ m1: 100, m2: 100, m3: 100, m4: 100, m5: 100, m6: 100 });
    expect(pacingShapeScore([flat])).toBeLessThan(40);
  });

  it('scores high for a real curve where the finale is the hardest point', () => {
    const goodCurve = fixtureCampaign({ m1: 100, m2: 95, m3: 85, m4: 70, m5: 60, m6: 40 });
    expect(pacingShapeScore([goodCurve])).toBeGreaterThan(90);
  });

  it('penalizes a mid-campaign spike that leaves the finale comparatively easy', () => {
    const midSpike = fixtureCampaign({ m1: 100, m2: 100, m3: 40, m4: 100, m5: 100, m6: 90 });
    const goodCurve = fixtureCampaign({ m1: 100, m2: 95, m3: 85, m4: 70, m5: 60, m6: 40 });
    expect(pacingShapeScore([midSpike])).toBeLessThan(pacingShapeScore([goodCurve]));
  });

  it('returns 0 when there is not enough data to have a shape', () => {
    const onlyOneMission: CampaignRecord = {
      ...fixtureCampaign({}),
      missionLog: [{ missionId: 'm1', attempts: 1, cleared: true, hullFractionAtClear: 1 }],
    };
    expect(pacingShapeScore([onlyOneMission])).toBe(0);
  });

  it('excludes missions with zero recorded clears rather than treating them as 0% hull', () => {
    // m3 (not m5) is the real hardest point here — if m6 is correctly excluded (no
    // data), m5 is the finale and only partial-credit as "hardest." If m6 were wrongly
    // defaulted to 0%, it would become both the fake finale AND the fake hardest
    // point, scoring full finale credit it shouldn't get.
    const withM6Data = fixtureCampaign({ m1: 100, m2: 90, m3: 40, m4: 70, m5: 60 });
    const noM6Data: CampaignRecord = {
      ...withM6Data,
      missionLog: withM6Data.missionLog.filter((m) => m.missionId !== 'm6'),
    };
    const ifM6WereWronglyZero = fixtureCampaign({ m1: 100, m2: 90, m3: 40, m4: 70, m5: 60, m6: 0 });
    expect(pacingShapeScore([noM6Data])).not.toBeCloseTo(pacingShapeScore([ifM6WereWronglyZero]), 0);
  });
});

describe('computeFunScore', () => {
  it('combines the three sub-scores via geometric mean, not an average', () => {
    const campaign: CampaignRecord = {
      archetype: 'average',
      stuckAt: null,
      combatTicks: 60 * 10 * 10, // 10 ticks/sec * 60s * 10min of combat
      finalCoins: 0,
      finalStars: 0,
      trajectory: [],
      missionLog: [
        't1', 't2', 't3', 't4', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
      ].map((missionId) => ({ missionId, attempts: 1, cleared: true, hullFractionAtClear: 1 })),
    };
    const score = computeFunScore([campaign]);
    expect(score.completion).toBe(100);
    expect(score.overall).toBeCloseTo(Math.cbrt(score.completion * score.timeFit * score.pacingShape), 5);
    // Geometric mean check: a single weak dimension pulls the overall well below a
    // plain average of the three (proves it's not just averaging).
    const plainAverage = (score.completion + score.timeFit + score.pacingShape) / 3;
    if (Math.min(score.completion, score.timeFit, score.pacingShape) < 50) {
      expect(score.overall).toBeLessThan(plainAverage);
    }
  });

  it('scores 0 completion when every campaign is stuck', () => {
    const stuck: CampaignRecord = {
      archetype: 'average',
      stuckAt: 'm3',
      combatTicks: 1000,
      finalCoins: 0,
      finalStars: 0,
      trajectory: [],
      missionLog: [{ missionId: 'm3', attempts: PATIENCE_CAP, cleared: false }],
    };
    const score = computeFunScore([stuck]);
    expect(score.completion).toBe(0);
    expect(score.overall).toBe(0); // geometric mean with a 0 factor is always 0
  });
});
