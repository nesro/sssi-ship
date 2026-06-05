# Plan: Tutorial Redesign — No Weapons, Survive 60 s

## What this changes and why

The current tutorial mission fires the front weapon and focuses on all mechanics at once.
The redesign strips weapons out entirely: no auto-fire, no XP, no card picker. The player
must survive 60 seconds by letting their shield absorb incoming shots while the generator
recharges it. This gives new players a focused, low-pressure session to understand the
core energy loop before any weapons mechanics are introduced. Only the shield + generator
tips appear; the fire, cards, and level-up tips are removed for this mission.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Auto-fire | Disabled entirely for tutorial (regardless of loadout) |
| 2 | XP & cards | Disabled — no level-up overlay in tutorial |
| 3 | Wave content | 4 slow-shooting star waves spaced 15 s apart; no boss |
| 4 | Mission end | Timer at 60 s calls `endMission(true)` |
| 5 | Star thresholds | 1★ survive · 2★ hull ≥ 70% · 3★ hull ≥ 90% |
| 6 | Rewards | 20 coins for 1★, +10 per extra star (unchanged) |
| 7 | Tutorial tips | Only 'energy' + 'shield' (+ 'dodge' if dodge fires) |
| 8 | Mission label | Card description updated: "Survive 60 s on shields alone — no weapons" |

---

## Wave schedule (tutorial)

| Time (ms) | Event |
|-----------|-------|
| 1 500 | Tooltip: SHIELDS explained |
| 2 000 | 3 battle stars (slow, HP=4, shootMs 3500–5500) |
| 5 000 | Tooltip: ENERGY explained |
| 17 000 | 3 battle stars |
| 32 000 | 4 battle stars |
| 47 000 | 3 battle stars |
| 60 000 | `endMission(true)` — mission complete |

Stars never die (no auto-fire) so they drift off screen at ~55 px/s → gone in ~15 s.
Screen feels active without becoming overwhelmed.

---

## Complexity analysis

All wave events are `time.delayedCall()` — O(1) at registration, O(1) at fire.
`checkLevelUp()` is a no-op in tutorial (XP never increases past 0). O(1).

---

## Files touched

| File | Change |
|------|--------|
| `src/data/missions.ts` | Update `tutorial` description |
| `src/scenes/GameScene.ts` | Skip `startAutoFire()` for tutorial; skip `checkLevelUp()` for tutorial; rewrite `startTutorialWaves()` with new schedule + 60s end timer; remove 'fire' and 'cards' tips from TutorialHUD |

---

## Test plan

- [ ] No lasers fire during tutorial (even if player has a weapon equipped in save)
- [ ] SHIELDS tooltip appears at 1.5 s
- [ ] ENERGY tooltip appears when GEN drops below 85 %
- [ ] Enemies appear in three waves and drift off screen without dying
- [ ] Auto-dodge still fires and shows DODGE tooltip
- [ ] At 60 s, ResultScene appears with correct star calculation
- [ ] Hull 100 % at end → 3 stars; ~75% → 2 stars; alive → 1 star
- [ ] Playing Mission 1 still auto-fires normally (no regression)
- [ ] `typecheck` passes

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] Tutorial auto-fire skip is `if (this.missionId === 'tutorial') return;` — not a save-dependent flag
- [ ] `checkLevelUp()` skip prevents phantom level-up overlays

**CI**
- [ ] `typecheck` passes
