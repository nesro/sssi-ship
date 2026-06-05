# Plan: Tutorial Mission

## What this changes and why

New players have no idea that the ship fires automatically, that energy is shared between
weapons and shields, or that level-up cards are the main progression lever. A light
tutorial mission sits alongside Mission 1 on the select screen (optional, not a gate)
and explains each mechanic via a small non-blocking tooltip that appears the first time
each system activates. The mission uses a simplified enemy wave so the player can absorb
text without dying.

---

## Design decisions requiring confirmation

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Gating | Tutorial is optional — available from the start alongside M1 |
| 2 | Blocking | Tooltips appear and fade on their own; no "tap to continue" required |
| 3 | Repeat show | Tooltips appear once per run (in-memory flag, not persisted) |
| 4 | Wave difficulty | 3 weak battle-stars → pause → 4 stars → mini-boss (10 HP) |
| 5 | Rewards | 20 coins for 1★; no extra stars for speed/hull — keep focus on learning |
| 6 | Star thresholds | 1★ beat boss · 2★ hull ≥ 70% · 3★ hull ≥ 90% |
| 7 | Tooltip style | Small pill at centre-screen, dark bg, white text, fades after 3 s |

---

## Tooltip triggers

| Trigger | Delay after trigger | Text |
|---------|--------------------|---------------------------------------------------------|
| Scene starts | 1 s | `AUTO-FIRE — Your ship aims and shoots automatically` |
| Energy drops below 85 % | immediate | `ENERGY — ⚡ powers your weapons. It recharges over time.` |
| First hit taken (hull OR shield) | immediate | `SHIELDS — Absorb hits, recharge from energy` |
| First level-up overlay opens | immediate | `CARDS — Pick one upgrade per level-up` |
| First auto-dodge fires | immediate | `AUTO-DODGE — Your ship evades threats automatically` |

All triggers are one-shot: after firing, a `Set<string>` of shown IDs prevents repeat.

---

## Wave schedule

| Time (ms) | Event |
|-----------|-------|
| 2 000 | 3× battle star (very slow shots, 1 HP) |
| 10 000 | 4× battle star |
| 20 000 | Wave label "MINI-BOSS" |
| 22 000 | 1× war circle boss (10 HP, slow, telegraphed shots) |

No ally events (keeps tutorial clean). Mission ends on boss death or hull = 0.

---

## Complexity analysis

- Tooltip rendering: `Set<string>` lookup is O(1). No loops over external data.
- Energy threshold check in `update()`: one float comparison per frame — O(1).
- Wave schedule: 4 `time.delayedCall()` entries — same pattern as existing missions.

---

## Files touched

| File | Change |
|------|--------|
| `src/data/missions.ts` | Add `tutorial` entry to `MISSIONS` map |
| `src/scenes/GameScene.ts` | Add `TutorialOverlay` draw calls; add energy-threshold check in `update()` for tutorial; add `isTutorial` flag from `init()` |
| `src/scenes/MissionSelectScene.ts` | Ensure `tutorial` card renders (order: tutorial first) |

No new files. Wave schedule lives inline in `GameScene.startEnemyWaves()` alongside
`mission_1` — same pattern already used.

---

## Tooltip implementation detail

A `TutorialHUD` private class (≤60 lines) inside `GameScene.ts`:

```typescript
// Sketch only — not final
class TutorialHUD {
  private shown = new Set<string>();
  private text!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, W: number) {
    this.text = scene.add.text(W / 2, 120, '', { ... }).setOrigin(0.5).setDepth(20).setAlpha(0);
  }

  show(id: string, message: string, scene: Phaser.Scene): void {
    if (this.shown.has(id)) return;
    this.shown.add(id);
    this.text.setText(message);
    scene.tweens.add({ targets: this.text, alpha: 1, duration: 300, yoyo: true, hold: 3000 });
  }
}
```

`TutorialHUD` is instantiated only when `missionId === 'tutorial'`. All tooltip trigger
logic is guarded by `if (this.tutorial)` so non-tutorial missions have zero overhead.

---

## Test plan

- [ ] Tutorial card appears first on MissionSelectScene; M1 appears below it
- [ ] "AUTO-FIRE" tooltip appears ~1 s after scene starts
- [ ] "ENERGY" tooltip appears when energy first drops below 85 %
- [ ] "SHIELDS" tooltip appears on first hit (not repeated on subsequent hits)
- [ ] "CARDS" tooltip appears when level-up overlay opens
- [ ] "AUTO-DODGE" tooltip appears when dodge first fires
- [ ] Each tooltip appears only once per run (even if trigger fires again)
- [ ] Boss dies → ResultScene with star calculation works normally
- [ ] Playing M1 shows zero tooltip UI (no overhead from tutorial code)
- [ ] `typecheck` passes

---

## File hygiene

No hardcoded paths or credentials. One design debt: wave schedules are currently
hardcoded inside `startEnemyWaves()` switch blocks. This plan adds another case to
that switch. A follow-up (`extract-wave-data.md`) should move waves to `data/waves.ts`.

---

## Checklist

**Design decisions**
- [ ] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] `if (this.tutorial)` guard on all tooltip-trigger paths — zero cost for real missions
- [ ] No swallowed exceptions in tooltip tween callbacks

**Performance**
- [ ] All per-frame checks are O(1) — one Set lookup + one float comparison

**Readability**
- [ ] `TutorialHUD` is a private inner class, ≤60 lines, single responsibility
- [ ] Tooltip IDs are string constants, not magic strings

**Testability**
- [ ] Manual test checklist above covers all five tooltip triggers + the zero-overhead case

**File hygiene**
- [ ] No TODO/FIXME left in new code
- [ ] Wave constants extracted to named variables, not magic numbers

**CI**
- [ ] `pnpm typecheck` passes
