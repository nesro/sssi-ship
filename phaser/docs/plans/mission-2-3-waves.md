# Mission 2 & 3 — Wave schedules and environmental mechanics

## What this changes and why

Mission 2 (Orbital Defense) and Mission 3 (The Swarm) are defined in `data/missions.ts`
with star thresholds, rewards, and ally event timings, but `GameScene` has no wave-spawning
code for them — both missions currently boot and immediately idle. This plan adds the wave
schedules plus two environmental mechanics: an **asteroid field** for M2 and a **speed
nebula** for M3.

No new scenes, no new data files, no save-schema changes. All changes are in `GameScene.ts`
(~80 new lines) and `textures.ts` (~15 new lines for the asteroid texture).

---

## Design decisions requiring confirmation

### 1. Asteroid field implementation

Asteroids are **not enemies** — they can't be targeted by auto-aim, can't be killed, and
bypass the shield system (direct hull damage). Two options:

| Option | Approach | Pro | Con |
|---|---|---|---|
| **A (recommended)** | Separate `asteroidGroup` physics group; new overlap callback `onAsteroidHitsPlayer` dealing 5 hull damage directly (no shield absorption) | Clean separation; auto-aim and spread shots ignore them | One more physics group |
| B | Reuse `enemyShots` group with a `shieldPiercing` flag on the sprite | No new group | Requires touching ShieldSystem, adds special-case logic |

→ **Confirm Option A.**

### 2. Asteroid field timing in M2

- Active **5 000 ms → 90 000 ms** (stops when boss spawns at 90 s to keep threat focused).
- Fire interval: every **2 500 ms**, random X in `[40, W-40]`.
- Asteroid velocity: `setVelocityY(180)` — fast enough to be threatening, slow enough to be readable.
- Visual: small 24 px procedural circle with a darker crater overlay.

### 3. Asteroid damage

- **5 hull HP** per hit (same as a regular enemy shot hitting unshielded hull).
- Shield does **not** absorb it — the overlap callback skips `ShieldSystem.absorbHit()` entirely.
- Triggers camera shake (same as hull hit from enemy shot).

### 4. Mission 2 wave schedule

| Time | Event |
|---|---|
| 0 s | Asteroid field starts (fires every 2.5 s) |
| 5 s | WAVE 1 — 4 stars |
| 18 s | WAVE 2 — 3 stars + 2 circles |
| 35 s | WAVE 3 — 5 stars |
| 50 s | WAVE 4 — 2 stars + 3 circles |
| 68 s | WAVE 5 — 6 stars + 2 circles |
| 90 s | Asteroid field stops; ⚠ BOSS — War Circle, 120 HP, shootMs 500 |

Circle HP: **20 HP** (tougher than stars at 10 HP). Circle shootMs: 2 000–3 000 ms random.

### 5. Mission 2 boss — War Circle

HP: **120**. shootMs: **500**. targetY: **110** (stops higher than M1 boss to give room
for asteroid dodge). Uses existing `spawnBoss()` shape but with `bossTex` replaced by
`circleTex` — actually: reuse the existing `spawnBoss()` for code simplicity; the boss
bar and win condition are identical. Enemy type stays `'boss'` for scoring.

Actually: spawn as a regular boss via `spawnBoss()` but override HP/shootMs inline
(`boss.hp = 120; boss.shootMs = 500`). The boss texture will be `bossTex` (it's
already hexagonal which reads as "big threat"); no new texture needed.

### 6. Mission 3 — speed nebula

A nebula modifier active for the **first 60 seconds** of the mission: all enemy spawn
velocities multiplied by **1.6×**.

Implementation: a private getter `nebulaSpeedMul(missionElapsedMs: number): number`
returns `1.6` if `missionElapsedMs < 60_000`, else `1.0`. Applied only at enemy spawn
time (not retroactively to in-flight enemies).

No visual for the nebula in this pass — just the mechanical effect.

### 7. Mission 3 wave schedule

| Time | Event |
|---|---|
| 3 s | WAVE 1 — 8 stars (nebula active, fast) |
| 14 s | WAVE 2 — 4 elite circles (20 HP each) |
| 26 s | WAVE 3 — 10 stars (nebula active) |
| 40 s | WAVE 4 — 5 elite circles |
| 55 s | WAVE 5 — 12 stars (nebula ends at 60 s) |
| 73 s | WAVE 6 — 6 elite circles + 4 stars |
| 95 s | ⚠ BOSS — 300 HP, shootMs 200 |

Star HP: **10**. Elite circle HP: **30** (vs 20 in M2). shootMs: 1 200–2 000 ms random.

### 8. End-to-end navigation fix

Both missions need `startEnemyWaves()` to dispatch to the new handlers. The existing
`if (missionId === 'tutorial')` / `if (missionId === DAILY_MISSION_ID)` chain becomes:

```
tutorial      → startTutorialWaves()
daily         → startDailyWaves()
mission_2     → startMission2Waves()
mission_3     → startMission3Waves()
default       → startMission1Waves()  (extract the existing inline schedule)
```

---

## Complexity analysis

| Operation | Big-O | Notes |
|---|---|---|
| `tickAsteroidField` timer | O(1) | Single spawn per fire |
| M2/M3 wave spawning loops | O(N) | N = wave enemy count, ≤ 12 |
| `nebulaSpeedMul()` | O(1) | Single comparison |
| `removeOffscreenObjects` | O(E + S + A) | E=enemies, S=shots, A=asteroids |

No path is O(N×M) or worse.

---

## Test plan

- [ ] `calculateStars('mission_2', ...)` — 0 stars on defeat
- [ ] `calculateStars('mission_2', ...)` — 1 star: won, shields broken
- [ ] `calculateStars('mission_2', ...)` — 2 stars: won, shields intact, <60 enemies killed
- [ ] `calculateStars('mission_2', ...)` — 3 stars: won, shields intact, ≥60 enemies killed
- [ ] `calculateStars('mission_3', ...)` — 0 stars on defeat
- [ ] `calculateStars('mission_3', ...)` — 1 star: won, hull HP < 10 remaining
- [ ] `calculateStars('mission_3', ...)` — 2 stars: won, hull HP ≥ 10, side weapons used
- [ ] `calculateStars('mission_3', ...)` — 3 stars: won, hull HP ≥ 10, no side weapons

---

## File hygiene

Files to modify:
- `src/scenes/GameScene.ts` — wave dispatching + asteroid field + new mission methods
- `src/game/textures.ts` — `buildAsteroidTex()` added to `buildGameTextures()`
- `src/__tests__/missions.test.ts` — M2 and M3 star tests added

No hardcoded paths, no TODO comments planned.

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] Blast-radius: only GameScene is affected; no save data changes; no cross-scene risk
- [ ] No swallowed exceptions — asteroid and wave callbacks are all guarded by `!this.isGameActive`

**Performance**
- [ ] All loops O(N) or better — stated above
- [ ] No DB/HTTP calls (no external calls in game loop)

**Readability**
- [ ] No function exceeds 100 lines — wave methods will be ≤40 lines each
- [ ] All magic numbers named (ASTEROID_DAMAGE, ASTEROID_SPEED, ASTEROID_INTERVAL_MS, etc.)
- [ ] No abstractions beyond what's needed for the three mission methods

**Testability**
- [ ] Star threshold tests cover all branches of `calculateStars` for M2 and M3
- [ ] Phaser-dependent wave logic not unit-tested (requires full Phaser mock — not worth it)

**File hygiene**
- [ ] No hardcoded personal paths or credentials
- [ ] No TODO/FIXME without owner

**CI**
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes with no new failures
