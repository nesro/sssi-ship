# Plan: Welcome mission + narrator popups + branch choice

## What this changes and why

Adds a mandatory first mission (`w0`) that every new player must complete before accessing the hub. During the mission, time-based narrator popups pause the simulation and display story text explaining the world and the three paths (tutorial / main missions / dev missions). After victory, the result screen shows a branch selector. The player's soft choice is saved and used to open the right hub section on first load — but all content remains accessible.

## Design decisions confirmed (2026-06-19)

- **Narrator triggers**: time-based ticks defined in mission spec (option A). No event-based triggers.
- **Branch screen location**: on the result screen, below stars/coins (option A).
- **Branch persistence**: soft choice only — saves `firstBranchChoice` in SaveData, hub opens that section first. All paths always accessible (option A).
- **Dev path**: narrator mentions "dev missions can be unlocked in settings". Dev missions are hidden until `devMode === true`, regardless of branch choice.
- **Welcome mission mechanics**: playable combat with forced loadout; can't lose (or very easy). Many narrator pauses.

## New `MissionSpec` field

```typescript
narratorEvents?: { atTimelineTick: number; lines: string[] }[];
```

Each entry fires once when `state.timelineTick >= atTimelineTick` and has not yet fired. `lines` is an array of strings displayed one at a time with a NEXT button. The last NEXT dismisses the popup.

## New `CoreState` fields

```typescript
pendingNarrator: string[] | null;  // lines remaining in current popup (null = none)
firedNarratorTicks: number[];       // atTimelineTick values already fired (prevents re-fire)
```

`pendingNarrator` is NOT included in `hashCoreState` (visual-only, like `pendingVisualEvents`). `firedNarratorTicks` IS included in hash (it affects whether future popups fire).

## Tick behaviour

In `advanceTick`: if `state.pendingNarrator !== null`, return immediately (narrator is modal, same as `pendingOffer`). After advancing, check `mission.narratorEvents` for any unfired event whose `atTimelineTick <= state.timelineTick` and fire the first one found (set `pendingNarrator = event.lines`, push tick to `firedNarratorTicks`).

## CombatScene narrator popup

Reuses the card-overlay pattern: a dark semi-transparent backdrop + centred panel. Shows lines one at a time with a NEXT button. On last line, calls `resolveNarrator()` which clears `pendingNarrator` and resumes ticks.

`resolveNarrator(state)` in a new `src/core/narrator.ts`:
```typescript
export function resolveNarrator(state: CoreState): void {
  state.pendingNarrator = null;
}
```

## Result screen branch choice

`ResultScene` checks if `mission.id === 'w0'`. If so, renders three buttons below the normal stars/coins:

- **TUTORIAL** (amber) — sets `save.firstBranchChoice = 'tutorial'`
- **EXPLORE NEARBY SPACE** (cyan) — sets `save.firstBranchChoice = 'missions'`
- (dev only, shown only when `devMode === true`) **DEV MISSIONS** (orange)

Each button persists the save and transitions to HubScene. HubScene's `create()` opens the correct nav item based on `firstBranchChoice` on first load (when `completedMissions.includes('w0')` but no other missions done).

## Branch in HubScene

```typescript
// In HubScene.create(), after loading save:
if (this.save.firstBranchChoice && this.save.completedMissions?.length === 1) {
  const navMap = { tutorial: 'missions', missions: 'missions' };
  this.setNav(navMap[this.save.firstBranchChoice] ?? null);
  // scroll/highlight the right section
}
```

(Tutorial missions live under the missions tab filtered by `forcedLoadout !== undefined`.)

## Welcome mission spec (`w0`)

- `id: 'w0'`, `name: 'First Contact'`, `starGate: 0`
- `forcedLoadout`: starter loadout (pulse-1, basic shield/gen/motor)
- Short duration (~60s), very easy enemies (3–4 fodder waves)
- 4–5 narrator events spread across the mission
- After completing w0: mission never appears in the hub list again (filter by `id !== 'w0'` in mission list render)

## Files to change

| File | Change |
|------|--------|
| `src/core/types.ts` | Add `narratorEvents` to `MissionSpec`; add `pendingNarrator`, `firedNarratorTicks` to `CoreState` |
| `src/core/narrator.ts` | New file: `resolveNarrator(state)` |
| `src/core/tick.ts` | Check narrator events after each tick; block on `pendingNarrator` |
| `src/core/state.ts` | Init `pendingNarrator: null`, `firedNarratorTicks: []` |
| `src/core/replay.ts` | Include `firedNarratorTicks` in `hashCoreState` |
| `src/data/missions.ts` | Add `w0` mission with narrator events and forced loadout |
| `src/save/SaveManager.ts` | Add `firstBranchChoice?: 'tutorial' \| 'missions'` to `SaveData`; migration |
| `src/view/CombatScene.ts` | Render narrator popup modal; call `resolveNarrator` on NEXT/dismiss |
| `src/view/ResultScene.ts` | Branch choice buttons when `mission.id === 'w0'` |
| `src/view/HubScene.ts` | Open correct section on first post-w0 load; hide w0 from mission list |
| `src/core/fixtures.ts` | Add `firedNarratorTicks: []`, `pendingNarrator: null` to fixture state |

## Complexity analysis

- O(N) narrator event check per tick where N = `narratorEvents.length` (≤ 10). Negligible.
- `firedNarratorTicks` grows to at most N entries per run.

## Test plan

- [x] Narrator fires at correct timeline tick
- [x] Narrator blocks tick advancement while `pendingNarrator !== null`
- [x] Narrator does not re-fire after `resolveNarrator`
- [x] Multiple narrator events fire in order, not simultaneously
- [x] `firedNarratorTicks` is included in state hash
- [x] `pendingNarrator` is not included in state hash
- [x] Branch choice persists in save (w0 applyMissionResult test)
- [ ] ResultScene shows branch buttons only for w0 (view — no unit test)
- [ ] Hub opens on correct section after w0 + branch pick (view — no unit test)
- [ ] w0 does not appear in hub mission list after completion (view — no unit test)
- [ ] Dev branch button hidden when `devMode !== true` (view — no unit test)

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user (2026-06-19)
- [ ] Test plan approved by user

**Guardrails**
- [ ] `pendingNarrator` cleared on mission exit/abandon (no stuck state)
- [ ] No swallowed exceptions in narrator tick check

**File hygiene**
- [ ] No hardcoded narrator text in view layer — all strings in mission spec
