import { describe, expect, it } from 'vitest';
import { DAILY_MISSION_ID, dailyDateKey, dailySeedForDate, generateDailyMission, timeUntilNextMidnight } from './dailyMission';

describe('dailySeedForDate', () => {
  it('is a pure function of the local calendar date', () => {
    const a = dailySeedForDate(new Date(2026, 6, 14, 0, 1));
    const b = dailySeedForDate(new Date(2026, 6, 14, 23, 58));
    expect(a).toBe(b);
  });

  it('differs across consecutive days', () => {
    const day1 = dailySeedForDate(new Date(2026, 6, 14));
    const day2 = dailySeedForDate(new Date(2026, 6, 15));
    expect(day1).not.toBe(day2);
  });

  it('produces a stable YYYY-MM-DD key', () => {
    expect(dailyDateKey(new Date(2026, 6, 3))).toBe('2026-07-03');
  });
});

describe('timeUntilNextMidnight', () => {
  it('counts down in whole minutes just before midnight', () => {
    expect(timeUntilNextMidnight(new Date(2026, 6, 14, 23, 55))).toBe('5m');
  });

  it('reports hours and minutes earlier in the day', () => {
    expect(timeUntilNextMidnight(new Date(2026, 6, 14, 21, 30))).toBe('2h 30m');
  });

  it('rolls over to a fresh 24h countdown exactly at midnight (a new day has already started)', () => {
    expect(timeUntilNextMidnight(new Date(2026, 6, 15, 0, 0, 0, 0))).toBe('24h 0m');
  });

  it('never goes negative a moment before midnight', () => {
    expect(timeUntilNextMidnight(new Date(2026, 6, 14, 23, 59, 59, 900))).toBe('1m');
  });
});

describe('generateDailyMission', () => {
  it('is deterministic — same seed produces an identical mission', () => {
    const a = generateDailyMission(12345);
    const b = generateDailyMission(12345);
    expect(a).toEqual(b);
  });

  it('produces a different mission for a different seed', () => {
    const a = generateDailyMission(1);
    const b = generateDailyMission(2);
    expect(a).not.toEqual(b);
  });

  it('always resolves to the daily mission id, uses own gear, and scores by coins', () => {
    const spec = generateDailyMission(1);
    expect(spec.id).toBe(DAILY_MISSION_ID);
    expect(spec.forcedLoadout).toBeUndefined();
    expect(spec.stars).toEqual([]);
    expect(spec.completionCoins).toBe(0);
  });

  it('events are sorted by atTimelineTick ascending (MissionSpec contract)', () => {
    const spec = generateDailyMission(7);
    for (let i = 1; i < spec.events.length; i++) {
      const prev = spec.events[i - 1];
      const curr = spec.events[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev !== undefined && curr !== undefined) {
        expect(curr.atTimelineTick).toBeGreaterThanOrEqual(prev.atTimelineTick);
      }
    }
  });

  it('every event references a kind that exists in enemyKinds', () => {
    const spec = generateDailyMission(42);
    for (const event of spec.events) {
      expect(spec.enemyKinds[event.kind]).toBeDefined();
    }
  });

  // Round 0's pool only ever contains fodder (kindPoolForRound), so 'fodder-r0' always
  // exists — but which later rounds also roll fodder is seed-dependent (the pool is
  // randomized per round), so these tests scan for the latest 'fodder-rN' key actually
  // generated rather than assuming a fixed round number.
  function latestFodderRound(enemyKinds: Record<string, { hp: number }>): { round: number; hp: number } | null {
    let best: { round: number; hp: number } | null = null;
    for (const [key, spec] of Object.entries(enemyKinds)) {
      if (!key.startsWith('fodder-r')) continue;
      const round = Number(key.slice('fodder-r'.length));
      if (best === null || round > best.round) best = { round, hp: spec.hp };
    }
    return best;
  }

  it('escalates strictly over rounds — later fodder waves have more HP than round 0', () => {
    const spec = generateDailyMission(9);
    const early = spec.enemyKinds['fodder-r0'];
    const latest = latestFodderRound(spec.enemyKinds);
    expect(early).toBeDefined();
    expect(latest).not.toBeNull();
    if (early !== undefined && latest !== null && latest.round > 0) {
      expect(latest.hp).toBeGreaterThan(early.hp);
    }
  });

  it('never stacks blocker/turret counts beyond 1 (known difficulty-cliff kinds)', () => {
    const spec = generateDailyMission(21);
    for (const event of spec.events) {
      const spec2 = spec.enemyKinds[event.kind];
      if (spec2?.kind === 'blocker' || spec2?.kind === 'turret') {
        expect(event.count).toBe(1);
      }
    }
  });
});

// Gates (blocksConveyor checkpoint enemies) carry the mode's real difficulty wall — see
// dailyMission.ts's "Gates, not a motor-timed clock" doc comment for why: a
// blocksConveyor enemy freezes state.timelineTick entirely (timeline.ts), so a gate's
// real-time cost is hp/playerDPS regardless of motor speed, unlike the flowing waves.
describe('generateDailyMission — gates', () => {
  function gateEvents(spec: ReturnType<typeof generateDailyMission>): { round: number; hp: number; blocksConveyor: boolean; isBoss: boolean | undefined }[] {
    return spec.events
      .filter((e) => e.kind.startsWith('gate-r'))
      .map((e) => {
        const enemy = spec.enemyKinds[e.kind];
        if (enemy === undefined) throw new Error(`gate event references missing kind "${e.kind}"`);
        return { round: Number(e.kind.slice('gate-r'.length)), hp: enemy.hp, blocksConveyor: enemy.blocksConveyor, isBoss: enemy.isBoss };
      });
  }

  it('appears periodically, every GATE_EVERY_N_ROUNDS rounds', () => {
    const gates = gateEvents(generateDailyMission(5));
    expect(gates.length).toBeGreaterThan(0);
    for (const gate of gates) {
      expect(gate.round % 4).toBe(0);
    }
  });

  it('always blocks the conveyor and is a single boss-flagged unit (count 1)', () => {
    const spec = generateDailyMission(5);
    const gates = gateEvents(spec);
    for (const gate of gates) {
      expect(gate.blocksConveyor).toBe(true);
      expect(gate.isBoss).toBe(true);
    }
    const gateSpawnEvents = spec.events.filter((e) => e.kind.startsWith('gate-r'));
    for (const event of gateSpawnEvents) expect(event.count).toBe(1);
  });

  it('escalates steeply enough to be effectively impossible by the final gates', () => {
    const gates = gateEvents(generateDailyMission(5)).sort((a, b) => a.round - b.round);
    expect(gates.length).toBeGreaterThan(1);
    const first = gates[0];
    const last = gates[gates.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first !== undefined && last !== undefined) {
      expect(last.hp).toBeGreaterThan(first.hp * 30);
    }
  });
});
