# Nesro Nova — Design notes & open questions

This file captures design analysis, concerns, and suggestions accumulated during
implementation. It is a living document — update it as you playtest and iterate.

---

## ★ Core design philosophy (canonical — never violate)

> **The player must never feel stuck.**
>
> There must always be at least one action that earns coins or advances progression.
> Every completed mission is re-playable at any time; replays award full coin rewards.
> Star bonuses only increase when the new run beats the previous best — the balance
> implication is that grinding for coins is always available without inflating talent
> currency.
>
> Dead ends — "I can't do anything until I get X" — are a design failure.
> Any feature that can trap the player behind a gate they cannot currently pass must
> provide an alternative path or a grind loop that eventually gets them through.

---

## What's working well

**Energy system tension** is the best design decision in the game. The fact that
firing, dodging, and shielding all compete for the same pool creates meaningful
trade-offs on every card pick. Cards that feel similar on paper (power_shot vs
extra_energy) feel completely different in play depending on your loadout — that's
the sign of a well-designed resource system.

**Card pick on level-up** (pausing combat) is correct. The pause is what makes
the choice feel weighty. Don't ever move to "cards auto-apply" — that would
eliminate the best decision moment in the game.

**Daily mission** is a strong retention hook. One-attempt-per-day with a depth
score creates healthy FOMO and a reason to open the app tomorrow.

**The meta layers (shop + talents) interact correctly.** Talents that reduce energy
cost make shop items feel more powerful without being strictly additive. Good.

---

## Concerns to address before soft-launch

### 1. The passive gap — most critical

Between card picks, the player watches the ship fight for 15–20 seconds with
nothing to do. On mobile this is the "open Instagram" moment. 

**Fix:** Tighten XP thresholds so the first pick comes at ~10–12 s and subsequent
picks come every 8–12 s early in the mission. The current thresholds (80, 200, 380…)
were not designed with session feel in mind — only with balance. Run the simulator
with tighter thresholds and check that clear rates don't change dramatically.

Target cadence: 5 picks in the first minute, 1–2 more before the boss.

### 2. The tutorial teaches the wrong thing first

The current tutorial is "survive 60 seconds on shields alone." This means the
player's first 60 seconds is a slow, fragile ship taking damage. That's the
*worst-case* gameplay experience presented as the introduction.

**Recommended redesign:**
```
0–15 s:  2 slow enemies, laser fires automatically. Player watches auto-aim work.
          Tutorial tip: "Your laser auto-aims. No input needed."
15–30 s: Enemies get a bit faster. Player takes a hit. Shield absorbs it.
          Tutorial tip: "Your shield absorbed that. It recharges from energy."
30–45 s: First card pick (guaranteed: choose between +damage and +shield).
          Tutorial tip: "Pick a card. Physics are paused."
45–60 s: A few more enemies. Boss with low HP. Player wins.
Result:   1 star = always. 2 star = hull ≥ 60%. 3 star = shields never broke.
```

The current "no weapons, shields only" mode is a good HARD MODE challenge (maybe
a 3-star condition on a later mission) but a terrible introduction.

### 3. The death moment needs a cause

When the player loses, ResultScene shows stats but not a diagnosis. The player
doesn't know what to buy to do better next time.

**Simple fix — add a "MAIN CAUSE OF DEATH" line to ResultScene:**
- Shield broke N times → "SHIELDS OVERWHELMED — consider upgrading generator or shield"
- Took N asteroid hits → "ASTEROID FIELD — auto-dodge doesn't help; clear waves faster"
- Died before level 3 → "OUTGUNNED — consider laser_mk1 upgrade before this mission"

This requires tracking a few counters during the mission (shieldBreakCount, asteroidHits).

### 4. Chain card discoverability

The 6 chain cards (explosive_rounds, blast_radius, chain_reaction, energy_recovery,
chain_lightning, storm_chains) require:
- 2 specific talent unlocks (chain_pool_1, chain_pool_2)
- Getting the enabler card first (explosive_rounds or chain_lightning)
- Then getting the payoff cards in subsequent picks

A player who gets `blast_radius` without having picked `explosive_rounds` first
sees a card that does nothing observable. This feels broken.

**Fix:** When an enabler card is picked, show a 2-second overlay: "EXPLOSIVE ROUNDS
ARMED — 20% chance of AoE on each laser hit." Make the effect immediately obvious
on the next enemy death (bigger burst particles for explosion hits).

### 5. Mission 3 balance

12 nebula-speed stars + elite circles before the boss is aggressive. Run the balance
simulator before shipping M3 and verify:
- Random clear% should be above 15%
- Optimal clear% should be above 45%

If either is out of range, reduce the nebula multiplier (1.4× instead of 1.6×) or
trim wave 5 from 12 to 9 stars.

---

## Story & character — low effort, high impact

The game has a personal dimension (Nesro Nova, the welcome message from the creator)
that is currently underused after the WelcomeScene. Ideas that cost almost nothing
to implement:

**Mission briefings** — A 3-line text box before each mission starts (replace the
"tap to start" screen):
```
MISSION 1 — FIRST CONTACT
"Long-range scanners picked up a scouting formation. 
 This is what we've been training for. Don't embarrass me."
                                            — Nova Command
```

**Ally ship flavor** — Ally ships that cross the screen mid-mission currently just
drop a card. Adding a name + one-liner makes them memorable:
```
"AJAX-7 passing through. Catch!" [drops card]
"Nesro's old wingman. They say he never misses a drop."
```

**Boss death moment** — After the boss dies, a 2-second pause before result:
```
[screen flash]
"Target neutralised. Hull integrity: 78%. Not bad."
```

All of this is static strings — no new mechanics, no new scenes. Just text constants
in a `data/story.ts` file.

**Suggested `src/data/story.ts` structure:**
```typescript
export const MISSION_BRIEFINGS: Record<string, string[]> = {
  tutorial:  ["Run the diagnostics. Your shields will do the work."],
  mission_1: ["Long-range contact. A scouting force. Engage and report back."],
  mission_2: ["Asteroid field at grid 7-Alpha. Command circle is in there somewhere."],
  mission_3: ["The nebula is accelerating them. All of them. Good luck."],
};

export const ALLY_SHIPS = [
  { name: 'AJAX-7',    line: 'Passing through. Catch!' },
  { name: 'Vera',      line: 'Make it count.' },
  { name: 'Old Patch', line: 'Don\'t tell command I was here.' },
];

export const BOSS_DEATHS: Record<string, string> = {
  mission_1: 'Scouting force eliminated. They know we\'re here now.',
  mission_2: 'Command circle down. The asteroid field is quiet.',
  mission_3: 'The swarm is broken. For now.',
};
```

---

## Suggested priority order for next work session

1. **XP threshold tuning** — Tighten early picks. Run simulator to validate balance.
   Files: `src/scenes/GameScene.ts` (XP_THRESHOLDS constant), `tools/simulate.ts`.

2. **Tutorial redesign** — The current one teaches the wrong thing first.
   Files: `src/scenes/GameScene.ts` → `startTutorialWaves()`, `TutorialHUD.ts`.

3. **Story layer** — Create `src/data/story.ts`, wire briefings into MissionSelectScene
   (show before game starts), wire boss death lines into GameScene's `endMission(true)`.
   Files: new `src/data/story.ts`, `src/scenes/MissionSelectScene.ts`, `src/scenes/GameScene.ts`.

4. **Card discoverability** — Flash overlay when enabler cards are picked.
   Files: `src/scenes/GameScene.ts` → `onCardPicked()`.

5. **Death diagnosis** — Track shieldBreakCount + add a cause line to ResultScene.
   Files: `src/scenes/GameScene.ts` (add counter), `src/scenes/ResultScene.ts`.

6. **Full card pool** — Design 20–30 more cards in the editor. Use the 5 build
   archetypes from `FLIGHT_READING.md` as your guide — each build should have 4–6
   supportive cards.

---

## Card design checklist (for each new card)

Before adding any card, answer:
- [ ] What situation makes this card obviously right?
- [ ] What situation makes this card obviously wrong?
- [ ] Does it create a visible effect the player can attribute to their choice?
- [ ] Does it pair with at least one other card for a satisfying combo?
- [ ] Can the player read what it does in 2 seconds?
- [ ] Is it balanced at both min and max loadout? (run simulator)
- [ ] If it's an enabler: does it do something immediately visible on pick?
- [ ] If it's a payoff: is the enabler available in a reasonable % of runs?

---

## Mission template (copy-paste to add a new mission)

### In `src/data/missions.ts`

```typescript
mission_X: {
  id:          'mission_X',
  name:        'Mission Name',
  description: 'One sentence flavour.',
  unlockRequires: { mission_prev: 1 },   // or: null for always unlocked
  allyEventTimes: [30000, 70000],         // ms into mission; pick 2–3
  rewards: {
    baseCoins:          150,             // between 80 (M1) and 250 (M3)
    coinsPerExtraStar:   60,
  },
  starThresholds: {
    one:   { type: 'beat_boss' },
    two:   { type: 'beat_boss_hull_percent_min', value: 50 },   // or shields_never_broken
    three: { type: 'beat_boss_within_seconds',   value: 90 },   // or enemies_killed_min
  },
},
```

### In `src/scenes/GameScene.ts`

```typescript
// Add dispatch in startEnemyWaves():
if (this.missionId === 'mission_X') { this.startMissionXWaves(); return; }

// Add the wave method:
private startMissionXWaves(): void {
  this.at(5000,  () => this.spawnStarWave(4, 'WAVE 1'));
  this.at(20000, () => this.spawnCircleWave(2, 20, 'WAVE 2'));
  // ... more waves ...
  this.at(90000, () => this.spawnBoss(150, 400));
}
```

### In `tools/sim/SimEngine.ts`

```typescript
mission_X: {
  id: 'mission_X',
  waves: [
    { atMs: 5000,  count: 4, enemySpec: { hp: 10, shootMs: 2500, xp: XP_STAR_ENEMY } },
    { atMs: 20000, count: 2, enemySpec: { hp: 20, shootMs: 2500, xp: XP_CIRCLE_ENEMY } },
    // ...
  ],
  bossSpec: { hp: 150, shootMs: 400, xp: XP_BOSS_KILL },
},
```

### Tests to add in `src/__tests__/missions.test.ts`

```typescript
describe('calculateStars — mission_X', () => {
  it('returns 0 on defeat', () => { ... });
  it('returns 1 star on bare win', () => { ... });
  it('returns 2 stars when threshold 2 met', () => { ... });
  it('returns 3 stars when both thresholds met', () => { ... });
});
```

Run `npm test` to confirm, then `npx tsx tools/simulate.ts --mission mission_X --runs 2000`
to verify balance targets.

---

## Balance simulator quick reference

```bash
cd phaser/

# Test a mission with default loadout
npx tsx tools/simulate.ts --mission mission_1 --runs 2000

# Test with full gear
npx tsx tools/simulate.ts --mission mission_3 --loadout full --runs 2000

# Test a specific strategy
npx tsx tools/simulate.ts --mission mission_2 --strategy optimal --runs 2000
```

Target clear rates (from CLAUDE.md):

| Mission | Random | Greedy | Optimal |
|---------|--------|--------|---------|
| Tutorial | 85% | 90% | 95% |
| M1 — no gear | 45% | 60% | 75% |
| M1 — basic gear | 65% | 80% | 90% |
| M2 — M1 gear | 20% | 45% | 65% |
| M3 — full gear | 8% | 28% | 55% |

If a mission is outside range: adjust enemy HP (±20%), fire rate (±300 ms), or
wave count before touching card stats.
