# v2 Mission Layouts — Make Combat Missions 5+ Minutes

## What this changes and why

Every combat mission (m1–m6) currently ends in 45–120 seconds of real gameplay — too
short to feel like a meaningful run. The fix is to extend the `events` arrays in
`v2/src/data/missions.ts`, spreading waves over 140–260 seconds of timeline clock and
scaling support calls proportionally. Tutorials (t1–t4) are teaching sequences and stay
short. No structural changes: this is a pure data expansion in one file.

---

## Design decisions requiring confirmation

**1. Per-mission targets (motor-1, no card upgrades baseline)**

| Mission | Current est. | Target | How |
|---------|-------------|--------|-----|
| m1 First Contact | ~45s | ~3 min | 15 fodder waves over 166s |
| m2 Picket Line | ~65s | ~3.5–4 min | 15 waves over 153s + 1 blocker |
| m3 The Wall | ~80s | ~4–5 min | 15 waves over 166s + 2 blockers |
| m4 Blockade | ~90s | ~5–6 min | 13 waves over 148s + 6 blockers |
| m5 Asteroid Run | ~95s | ~5 min | 17 waves over 165s + 2 blockers |
| m6 Leviathan | ~120s | ~7–8 min | 21 waves over 250s + 3 blockers + boss |

Motors speed up the timeline: motor-3 (1.7×) compresses a 3-minute run to ~1.8 min.
This is the intentional motor tradeoff (V2_HANDOFF §3.2).

**2. Blockers in m2 (currently none)**
m2 currently teaches fodder+striker. Proposal: add **1 blocker at seconds(66)**,
mid-mission, as a soft DPS gate. This makes m2 the first real DPS test before m4
(the dedicated blockade mission). Alternative: keep m2 blocker-free and let m4 remain
the first blocker encounter.

> ✅ or ❌? Add 1 blocker to m2?

**3. m6 boss spawn time and time-star thresholds**
Boss currently spawns at seconds(38). Proposal: spawn at **seconds(250)** so the boss is
a climactic ending to a full multi-minute run.

Boss time-star thresholds (absolute tick from mission start, measured as `bossKillTick`):

| Star | New threshold | Implied time after boss spawn |
|------|--------------|-------------------------------|
| Easy | seconds(290) | ~40s of fire after spawn |
| Medium | seconds(270) | ~20s of fire after spawn |
| Hard | seconds(260) | ~10s of fire after spawn |

These assume ~60–80 DPS at mid-game. They **need sim calibration** — listed here
as starting values.

> ✅ or ❌? Boss spawns at seconds(250)?

**4. Completion coin rewards**
Longer missions have more enemies and thus more kill-coins. completionCoins scales
proportionally:

| Mission | Old | New |
|---------|-----|-----|
| m1 | 60 | 120 |
| m2 | 90 | 180 |
| m3 | 120 | 200 |
| m4 | 160 | 260 |
| m5 | 180 | 300 |
| m6 | 300 | 500 |

**5. Support call frequency**
One call per ~25–30 seconds of timeline feels right for longer missions (4–8 calls total
vs the current 1–3). Each call is a meaningful decision point; more calls = more card
build depth per run.

---

## Proposed wave data

> These are the specific arrays I will write into missions.ts upon approval.
> Spacing is the lane-distance gap between consecutive enemies of the same wave.
> A spacing of 0 means a lone enemy (boss, blocker).

### m1 — First Contact (pure fodder, ~3 min)

```
enemyKinds: { fodder: FODDER }  ← unchanged

seconds(2):   fodder×3,  spacing 14
seconds(13):  fodder×4,  spacing 13
seconds(24):  fodder×5,  spacing 12
seconds(35):  fodder×5,  spacing 11
seconds(46):  fodder×6,  spacing 11
seconds(58):  fodder×6,  spacing 10
seconds(70):  fodder×7,  spacing 10
seconds(82):  fodder×7,  spacing 9
seconds(94):  fodder×8,  spacing 9
seconds(106): fodder×8,  spacing 8
seconds(118): fodder×9,  spacing 8
seconds(130): fodder×9,  spacing 7
seconds(142): fodder×10, spacing 7
seconds(154): fodder×10, spacing 6
seconds(166): fodder×11, spacing 6

supportCallTicks: [seconds(25), seconds(60), seconds(100), seconds(140)]
completionCoins: 120
```

### m2 — Picket Line (fodder + strikers + optional 1 blocker, ~3.5 min)

```
enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER }  ← blocker added if approved

seconds(2):   fodder×4,  spacing 13
seconds(12):  fodder×4,  spacing 12
seconds(22):  striker×2, spacing 18
seconds(33):  fodder×5,  spacing 11
seconds(44):  striker×3, spacing 17
seconds(55):  fodder×6,  spacing 11
seconds(66):  blocker×1, spacing 0   ← only if blocker confirmed above
seconds(76):  fodder×6,  spacing 10
seconds(87):  striker×4, spacing 15
seconds(98):  fodder×7,  spacing 9
seconds(109): striker×4, spacing 14
seconds(120): fodder×8,  spacing 8
seconds(131): striker×5, spacing 13
seconds(142): fodder×8,  spacing 7
seconds(153): striker×5, spacing 12

supportCallTicks: [seconds(18), seconds(45), seconds(75), seconds(110), seconds(145)]
completionCoins: 180
```

### m3 — The Wall (dense fodder + tanks + 2 blockers, ~4.5 min)

```
enemyKinds: { fodder: FODDER, tank: TANK, blocker: BLOCKER }  ← blocker added

seconds(2):   fodder×6,  spacing 9
seconds(13):  fodder×8,  spacing 8
seconds(24):  tank×1,    spacing 0
seconds(35):  fodder×9,  spacing 7
seconds(46):  fodder×10, spacing 7
seconds(58):  blocker×1, spacing 0
seconds(70):  fodder×10, spacing 6
seconds(82):  tank×2,    spacing 22
seconds(94):  fodder×11, spacing 6
seconds(106): fodder×12, spacing 5
seconds(118): blocker×1, spacing 0
seconds(130): fodder×12, spacing 5
seconds(142): tank×3,    spacing 20
seconds(154): fodder×13, spacing 4
seconds(166): fodder×14, spacing 4

supportCallTicks: [seconds(20), seconds(50), seconds(85), seconds(115), seconds(145), seconds(170)]
completionCoins: 200
```

### m4 — Blockade (blocker gauntlet, ~5.5 min)

```
enemyKinds: { fodder: FODDER, striker: STRIKER, blocker: BLOCKER }  ← unchanged

seconds(2):   fodder×4,  spacing 12
seconds(12):  fodder×5,  spacing 11
seconds(22):  blocker×1, spacing 0    ← first DPS check
seconds(35):  striker×3, spacing 15
seconds(45):  fodder×6,  spacing 10
seconds(55):  blocker×1, spacing 0    ← second check
seconds(68):  striker×4, spacing 14
seconds(80):  blocker×2, spacing 20   ← two at once
seconds(95):  fodder×7,  spacing 9
seconds(108): striker×5, spacing 13
seconds(120): blocker×2, spacing 22   ← final double
seconds(135): fodder×8,  spacing 8
seconds(148): striker×5, spacing 12

supportCallTicks: [seconds(15), seconds(40), seconds(65), seconds(90), seconds(115), seconds(140), seconds(160)]
completionCoins: 260
```

### m5 — Asteroid Run (swarm flood + strikers + 2 blockers, ~5 min)

```
enemyKinds: { swarm: SWARM, striker: STRIKER, blocker: BLOCKER }  ← blocker added

seconds(2):   swarm×10,  spacing 5
seconds(10):  swarm×12,  spacing 4
seconds(18):  swarm×14,  spacing 4
seconds(27):  striker×3, spacing 15
seconds(36):  swarm×15,  spacing 4
seconds(45):  swarm×16,  spacing 3
seconds(55):  striker×4, spacing 14
seconds(65):  blocker×1, spacing 0
seconds(76):  swarm×18,  spacing 3
seconds(86):  swarm×20,  spacing 3
seconds(96):  striker×5, spacing 13
seconds(107): swarm×20,  spacing 3
seconds(118): striker×5, spacing 12
seconds(129): blocker×1, spacing 0
seconds(141): swarm×22,  spacing 3
seconds(153): swarm×22,  spacing 3
seconds(165): striker×6, spacing 12

supportCallTicks: [seconds(20), seconds(50), seconds(80), seconds(110), seconds(140), seconds(165)]
completionCoins: 300
```

### m6 — Leviathan (full gauntlet + boss, ~7–8 min)

```
enemyKinds: { fodder: FODDER, striker: STRIKER, swarm: SWARM, tank: TANK,
              blocker: BLOCKER, boss: BOSS }  ← swarm + tank added

seconds(2):   fodder×4,  spacing 12
seconds(10):  striker×3, spacing 15
seconds(20):  fodder×5,  spacing 11
seconds(30):  blocker×1, spacing 0
seconds(42):  striker×4, spacing 14
seconds(53):  fodder×6,  spacing 10
seconds(65):  swarm×10,  spacing 5
seconds(76):  striker×4, spacing 13
seconds(88):  blocker×1, spacing 0
seconds(100): fodder×7,  spacing 9
seconds(112): swarm×12,  spacing 4
seconds(124): striker×5, spacing 12
seconds(136): tank×2,    spacing 20
seconds(148): blocker×2, spacing 18  ← double blocker
seconds(165): fodder×8,  spacing 8
seconds(177): striker×6, spacing 11
seconds(190): swarm×15,  spacing 4
seconds(205): tank×3,    spacing 18
seconds(220): striker×6, spacing 10
seconds(235): fodder×10, spacing 7
seconds(250): boss×1,    spacing 0

supportCallTicks: [seconds(15), seconds(40), seconds(70), seconds(100), seconds(130),
                   seconds(165), seconds(200), seconds(235)]
completionCoins: 500

stars:
  { id: 'm6-boss-290', family: 'boss-time', threshold: seconds(290) }  ← easy
  { id: 'm6-boss-270', family: 'boss-time', threshold: seconds(270) }  ← medium
  { id: 'm6-boss-260', family: 'boss-time', threshold: seconds(260) }  ← hard
  ...standardStars('m6').slice(0, 2)  ← hull-50, hull-90
  { id: 'm6-all-kills', family: 'all-kills', threshold: 0 }
  { id: 'm6-shield', family: 'shield-unbroken', threshold: 0 }
```

---

## Complexity analysis

`timeline.ts` O(1) per tick (binary/linear scan of sorted events — at most one event
consumed per tick). Total enemy count N increases from ~20–46 per mission to ~80–200.
No loop complexity change; pure data volume increase.

---

## Test plan

- [ ] `pnpm build:dry` passes after edit
- [ ] `pnpm lint` passes after edit
- [ ] `pnpm test` — all 100 tests still green (no mission unit tests; existing tests
      validate core tick logic, not wave counts)
- [ ] Dev smoke-test m1 start: confirm wave count feels right
- [ ] Dev smoke-test m6: confirm boss arrives late, feels climactic
- [ ] (Deferred to user) `pnpm sim --mission m1 --runs 100 --strategy greedy`
      to check winrate and actual clock time

---

## File hygiene

- Only `v2/src/data/missions.ts` changes
- No hardcoded paths, credentials, or TODO comments in that file
- `missionById()` function unchanged

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user (blockers in m2, boss spawn time, coin rewards)
- [ ] Test plan approved by user

**Guardrails**
- [ ] No new opt-out guards introduced
- [ ] No new throttle keys introduced
- [ ] Blast-radius: if a wrong wave is added, the run simply ends at defeat — no data corruption
- [ ] No exceptions possible from data-only change

**Performance**
- [ ] All loops remain O(1) per tick
- [ ] Enemy count increase (×4–5) is well within tick budget (no DB/HTTP)

**Readability**
- [ ] Constants used for time (`seconds(n)` helper already exists)
- [ ] No magic numbers — all spacings are named patterns

**Testability**
- [ ] Data-only change; existing core tests cover tick behaviour
- [ ] Sim verification deferred to user per agreement

**File hygiene**
- [ ] No hardcoded paths or credentials
- [ ] No TODO comments

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures
