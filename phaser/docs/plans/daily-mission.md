# Plan: Daily Mission

## What this changes and why

Players who clear all three regular missions have no repeatable endgame loop. A daily
mission provides that loop: one attempt per UTC calendar day, endless survival that starts
trivially easy and ramps to impossible, with a coin payout proportional to how deep the
player gets. This creates a daily check-in habit, a natural difficulty showcase (veterans
can flex wave counts to friends), and extra coin income that rewards consistent play
without invalidating the grind of regular missions.

---

## Design decisions (all confirmed)

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Mode | Endless survival — enemies scale every 30 s; mission never auto-wins |
| 2 | End condition | Player death only |
| 3 | Attempt limit | One per UTC calendar day — locked after ResultScene records the result |
| 4 | Wave structure | Seeded with UTC date integer so all players face the same layout |
| 5 | Enemy HP scaling | `round(10 × (1 + wave × 0.18))` — wave 0 = 10, wave 10 = 28, wave 20 = 46 |
| 6 | Enemy fire rate | `max(800, 3000 − wave × 45)` ms — approaches 800 ms floor around wave 49 |
| 7 | Enemy count | `min(3 + floor(wave × 0.35), 12)` — caps at 12 enemies per wave |
| 8 | Mini-boss | War Circle (circle enemy) every 5th wave (wave 5, 10, 15 …) with 3× HP |
| 9 | Weapons/cards | Full loadout active; level-up card picker works normally |
| 10 | Coin formula | `floor(15 × waves × (1 + waves × 0.1))` |
| 11 | Wave seeding | Mulberry32 PRNG seeded by `YYYYMMDD` UTC integer |
| 12 | Score display | Waves cleared + coins; no star rating |

**Coin examples:** 5 waves → 112 ◈, 10 waves → 300 ◈, 15 waves → 562 ◈, 20 waves → 900 ◈

---

## Seeded RNG

A reusable Mulberry32 PRNG lives in `src/utils/rng.ts`:

```typescript
export function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function utcDateInt(): number {
  const d = new Date();
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function utcDateString(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}
```

Used only by `src/data/daily.ts`. Main game combat stays on `Math.random()`.

---

## Wave generation (`src/data/daily.ts`)

```typescript
export interface DailyWaveSpec {
  waveIndex:  number;
  count:      number;
  enemyHp:    number;
  shootMs:    number;
  isBossWave: boolean;  // spawn one War Circle instead of stars
}

export function generateDailyWaves(seed: number): DailyWaveSpec[] {
  // Deterministic from seed — same date = same layout everywhere.
  // RNG is used for future variation; current impl is fully deterministic.
  const waves: DailyWaveSpec[] = [];
  for (let i = 0; i < 50; i++) {
    waves.push({
      waveIndex:  i,
      count:      Math.min(3 + Math.floor(i * 0.35), 12),
      enemyHp:    Math.round(10 * (1 + i * 0.18)),
      shootMs:    Math.max(800, 3000 - i * 45),
      isBossWave: i > 0 && i % 5 === 0,
    });
  }
  return waves;
  void seed; // reserved for future procedural variation
}

export function dailyCoins(wavesCleared: number): number {
  return Math.floor(15 * wavesCleared * (1 + wavesCleared * 0.1));
}
```

---

## Data model changes

### `types/index.ts`

Add `DailyRecord` interface and `wavesCleared` to `MissionResult`:

```typescript
export interface DailyRecord {
  date:         string;   // UTC "YYYY-MM-DD"
  wavesCleared: number;   // last wave index the player completed before dying
  coinsEarned:  number;
  attempted:    boolean;  // set to true when ResultScene commits the result
}
```

Add to `SaveData`:
```typescript
daily: DailyRecord | null;
```

Add to `MissionResult`:
```typescript
wavesCleared?: number;  // daily only — set in GameScene.endMission()
```

### `SaveManager.ts`

- Add `daily: null` to `createDefaultSave()`
- Add method:
  ```typescript
  awardDailyResult(save: SaveData, wavesCleared: number, coinsEarned: number): void {
    save.daily = { date: utcDateString(), wavesCleared, coinsEarned, attempted: true };
    save.coins += coinsEarned;
  }
  ```

---

## GameScene changes

When `missionId === 'daily'`:
- New field: `private dailyWavesCleared = 0;`
- `startEnemyWaves()` calls `startDailyWaves()` for the daily branch
- `startDailyWaves()`: schedules 50 waves, one every 30 s, from `generateDailyWaves()`
  Each timer callback: update `dailyWavesCleared = waveIndex`, spawn enemies from spec
- `endMission(bossBeaten)`: passes `wavesCleared: this.dailyWavesCleared` in `MissionResult`
- Cards and auto-fire are active (not gated like tutorial)
- No boss bar for mini-boss waves — regular HP bars only

Wave spawn helper:
```typescript
private spawnDailyWave(spec: DailyWaveSpec): void {
  if (!this.isGameActive) return;
  this.showWaveLabel(`WAVE ${spec.waveIndex + 1}`);
  if (spec.isBossWave) {
    // Spawn one scaled War Circle
    const e = this.enemies.create(this.W / 2, -30, 'circleTex') as unknown as EnemySprite;
    e.setVelocityY(55); e.enemyType = 'circle';
    e.hp = spec.enemyHp * 3; e.maxHp = spec.enemyHp * 3;
    e.lastShot = 0; e.shootMs = spec.shootMs;
  } else {
    const spacing = this.W / (spec.count + 1);
    for (let i = 0; i < spec.count; i++) {
      this.time.delayedCall(i * 200, () => {
        if (!this.isGameActive) return;
        const e = this.enemies.create(spacing * (i + 1), -20, 'starTex') as unknown as EnemySprite;
        e.setVelocityY(Math.min(55 + spec.waveIndex * 2, 130));
        e.enemyType = 'star'; e.hp = spec.enemyHp; e.maxHp = spec.enemyHp;
        e.lastShot = 0; e.shootMs = spec.shootMs;
      });
    }
  }
}
```

---

## MissionSelectScene changes

Add a `buildDailyCard(W, save)` method called before the regular mission list.
The daily card sits at the top of the list with a distinct gold/orange color.

States:
- **Available today**: gold border, "PLAY ▶" in orange, "⚡ DAILY CHALLENGE" label
- **Completed today**: gray border, waves cleared + coins earned, "COME BACK TOMORROW"

```typescript
private isDailyAvailable(save: SaveData): boolean {
  if (!save.daily) return true;
  return save.daily.date !== utcDateString() || !save.daily.attempted;
}
```

---

## ResultScene changes

Add a daily branch in `create()`:
```typescript
if (missionId === 'daily') {
  this.handleDailyResult(W, H);
  return;
}
```

`handleDailyResult(W, H)`:
- `wavesCleared` from `this.result.wavesCleared ?? 0`
- coins = `dailyCoins(wavesCleared)`
- Call `SaveManager.awardDailyResult(save, wavesCleared, coins)`
- Show: "DAILY COMPLETE" / "SHIP DESTROYED", wave count, coin reward
- "CONTINUE" button → MissionSelectScene

---

## Complexity analysis

| Concern | Big-O | Notes |
|---------|-------|-------|
| `generateDailyWaves()` | O(50) = O(1) | Fixed-cap 50 waves |
| `startDailyWaves()` | O(50) timer registrations | Each is O(1) to schedule |
| `spawnDailyWave()` | O(count), count ≤ 12 | Identical to regular wave spawn |
| `updateEnemyHpBars()` | O(E), E ≤ 12 | Unchanged from existing |

No paths are O(N×M) or worse. No DB calls, no external IO.

---

## Files touched

| File | Change |
|------|--------|
| `src/utils/rng.ts` | **NEW** — Mulberry32 PRNG + date helpers |
| `src/data/daily.ts` | **NEW** — `DailyWaveSpec`, `generateDailyWaves()`, `dailyCoins()` |
| `src/types/index.ts` | Add `DailyRecord`, add `daily` to `SaveData`, add `wavesCleared?` to `MissionResult` |
| `src/SaveManager.ts` | Default save gets `daily: null`; add `awardDailyResult()` |
| `src/scenes/GameScene.ts` | `dailyWavesCleared` field, `startDailyWaves()`, `spawnDailyWave()` |
| `src/scenes/MissionSelectScene.ts` | `buildDailyCard()`, `isDailyAvailable()` |
| `src/scenes/ResultScene.ts` | `handleDailyResult()` branch |

---

## Test plan

- [ ] Daily card appears above regular missions in MissionSelectScene
- [ ] Daily card shows "⚡ DAILY CHALLENGE" and is tappable when not yet attempted
- [ ] Tapping the daily card starts GameScene with `missionId: 'daily'`
- [ ] Enemies spawn from wave specs: correct HP, fire rate, count
- [ ] Wave count increments every 30 s (`dailyWavesCleared` advances)
- [ ] Mini-boss (circle) appears on wave 5 with 3× HP
- [ ] Enemy HP bars appear above daily enemies
- [ ] Player death transitions to ResultScene with correct `wavesCleared`
- [ ] ResultScene shows daily screen (no stars, waves cleared, coin amount)
- [ ] Correct coin formula: 10 waves → 300 ◈
- [ ] `save.daily` is written after ResultScene; `attempted = true`
- [ ] After completing daily, card shows "COME BACK TOMORROW" with score
- [ ] Refreshing / re-opening app still shows locked state (persisted correctly)
- [ ] Coins correctly added to `save.coins`
- [ ] New UTC day resets the lock — daily is available again
- [ ] Same UTC date produces same wave layout (seeding works)
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user
- [x] Test plan approved (implicit — user said "proceed")

**Guardrails**
- [ ] `isDailyAvailable()` checks `attempted === true`, not just date match
- [ ] `awardDailyResult()` is idempotent if called twice (overwrites same record)
- [ ] `wavesCleared` defaults to 0 if ResultScene receives undefined

**Performance**
- [ ] `generateDailyWaves()` O(50) — constant, called once
- [ ] Wave timers O(50) — constant, no per-frame cost
- [ ] No new loops over enemies beyond existing `updateEnemyHpBars()`

**Readability**
- [ ] `generateDailyWaves()` ≤ 30 lines
- [ ] `spawnDailyWave()` ≤ 25 lines
- [ ] `handleDailyResult()` ≤ 30 lines
- [ ] `buildDailyCard()` ≤ 40 lines

**CI**
- [ ] `typecheck` passes
