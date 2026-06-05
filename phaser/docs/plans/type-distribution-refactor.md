# Type distribution & file structure refactor

## What this changes and why

The current codebase centralises every shared interface in `src/types/index.ts`, a
240-line file that touches everything and explains nothing. Types are most useful when
they live next to the code they describe: a reader of `data/cards.ts` shouldn't need
to open a separate file to understand what a `CardDefinition` is. This refactor moves
each type to the module it naturally belongs to, eliminates `types/index.ts`, breaks
`GameScene.ts` (1 085 lines) into focused sub-modules, extracts `ItemPreviewPanel`
from `ShopScene.ts`, and adds a Vitest suite for all pure-function logic.
Zero functionality changes — only structure.

---

## Type → target file mapping

| Type(s) | New home |
|---|---|
| `SaveData`, `ShipLoadout`, `OwnedItem`, `MissionRecord`, `DailyRecord` | `SaveManager.ts` |
| `MissionDefinition`, `MissionResult`, `StarThreshold`, `MissionRewards` | `data/missions.ts` |
| `CardDefinition`, `StatDelta`, `RunFlag`, `CardCategory` | `data/cards.ts` |
| `SideWeaponType`, `ItemDefinition`, `ItemLevel`, `ItemLevelStats`, `ItemSlot` | `data/items.ts` |
| `TalentNode`, `TalentBranch`, `TalentLevel` | `data/talents.ts` |
| `ComputedStats` | `game/computeStats.ts` |
| `RunState` | `game/CardManager.ts` |
| `EnemyType`, `EnemySprite` | `game/enemy.ts` (new) |
| `DebugStats` | `debug/DebugOverlay.ts` |

`SideWeaponType` goes to `data/items.ts` (not `computeStats.ts`) to break the
potential cycle: `computeStats.ts` imports from `items.ts`; if `SideWeaponType` lived
in `computeStats.ts`, `items.ts` would import back — circular.

---

## New files to create

| File | Contents | Est. lines |
|---|---|---|
| `src/game/enemy.ts` | `EnemyType` + `EnemySprite` types | ~20 |
| `src/game/TutorialHUD.ts` | `TutorialHUD` class + `TUTORIAL_TIPS` | ~45 |
| `src/game/textures.ts` | `buildGameTextures`, `drawShipShape`, `traceStar` | ~110 |
| `src/game/Starfield.ts` | `StarParticle` + `Starfield` class | ~40 |
| `src/hud/CombatHUD.ts` | Bottom panel build + update, XP bar | ~100 |
| `src/hud/ShieldVisual.ts` | `ShieldVisual` class, `lerpColor` | ~50 |
| `src/hud/EnemyHpBars.ts` | `EnemyHpBars` class | ~35 |
| `src/ui/ItemPreviewPanel.ts` | Extracted from `ShopScene.ts` | ~175 |

---

## Import dependency graph (no cycles)

```
SaveManager.ts          ← data/missions.ts, scenes/*, game/computeStats.ts
data/items.ts           ← game/computeStats.ts, scenes/ShopScene.ts
data/missions.ts        ← scenes/GameScene.ts, MissionSelectScene.ts, ResultScene.ts
data/cards.ts           ← game/CardManager.ts, game/AllyShipEvent.ts, ui/LevelUpOverlay.ts
data/talents.ts         ← game/computeStats.ts, scenes/TalentScene.ts
game/computeStats.ts    ← game/EnergyManager.ts, ShieldSystem.ts, CardManager.ts, scenes/GameScene.ts
game/enemy.ts           ← game/AutoAim.ts, scenes/GameScene.ts
game/CardManager.ts     ← game/AllyShipEvent.ts, scenes/GameScene.ts
debug/DebugOverlay.ts   ← scenes/GameScene.ts
```

---

## Test plan

- [x] `rng.ts` — mulberry32 produces deterministic sequence for given seed
- [x] `rng.ts` — different seeds produce different sequences
- [x] `data/daily.ts` — generateDailyWaves returns exactly 50 specs for any seed
- [x] `data/daily.ts` — same seed → identical wave sequence; different seed → different
- [x] `data/daily.ts` — dailyCoins(0) = 0, dailyCoins(10) matches formula
- [x] `data/missions.ts` — calculateStars: 0 stars on defeat
- [x] `data/missions.ts` — calculateStars: 1/2/3 stars for mission_1 at various HP/time
- [x] `data/missions.ts` — calculateCoins: baseCoins + extras for star count
- [x] `data/missions.ts` — isMissionUnlocked: tutorial/mission_1 always unlocked; mission_2 requires star
- [x] `game/computeStats.ts` — no-gear save returns fallback values
- [x] `game/computeStats.ts` — basic gear save returns item stats
- [x] `game/computeStats.ts` — damage talent increases frontDamage correctly
- [x] `game/EnergyManager.ts` — update() regenerates energy up to capacity
- [x] `game/EnergyManager.ts` — trySpend() returns false when insufficient energy

---

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user ("yes please, refactor it as I said")
- [x] Test plan approved by user (implicit in "add some tests")

**Guardrails**
- [x] No opt-out guards in this refactor — only structural changes
- [x] Blast-radius: only import paths change; zero runtime behaviour changes
- [x] No exceptions swallowed — all existing error handling preserved

**Performance**
- [x] No loops changed — only file structure

**Readability**
- [x] No function exceeds 100 lines
- [x] All magic numbers/strings remain in existing named constants
- [x] No new abstractions introduced (extracted classes existed inline before)

**File hygiene**
- [x] `types/index.ts` deleted after all imports are updated
- [x] No TODO comments introduced

**CI**
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm test` passes
