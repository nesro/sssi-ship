# Nesro Nova — Implementation progress

This file tracks what is done, what is in progress, and what is left to build.
Update the checkboxes as each item is completed. The full design spec is in
`docs/plans/sssi-ship-mobile-redesign.md`.

---

## Phase 0 — Project setup ✅

- [x] Phaser 3 + Vite project scaffolded
- [x] TypeScript configured (`tsconfig.json`, strict mode, moduleResolution=bundler)
- [x] All source files converted from JS to TS (old `.js` files deleted)
- [x] Shared type definitions in `src/types/index.ts`
- [x] Debug overlay (`src/debug/DebugConfig.ts`, `src/debug/DebugOverlay.ts`)
  - Toggle with F1 or `window.__debug.toggle()`
  - Shows: FPS, enemy count, laser count, shot count, HP, mission time
  - State persists in localStorage
- [x] `CLAUDE.md` orientation guide
- [x] `docs/PROGRESS.md` (this file)

---

## Phase 1 — Core scene skeleton ✅

All scenes exist and navigate between each other correctly.

- [x] `SaveManager.ts` — localStorage read/write, versioned schema, dual star counters
- [x] `data/missions.ts` — `MissionDefinition[]`, `calculateStars()`, `calculateCoins()`,
      `isMissionUnlocked()`
- [x] `ui/NavBar.ts` — shared bottom nav bar (MENU / MISSIONS / SHOP / TALENTS)
- [x] `WelcomeScene` — first-launch screen with Nesro's personal message; skipped on return
- [x] `MenuScene` — Nesro Nova title, live `★ X/9` counter, PLAY + ABOUT
- [x] `MissionSelectScene` — mission cards with lock gate display and best-star rows
- [x] `GameScene` (Phase 1 combat) — see detail below
- [x] `ResultScene` — post-mission star calc, coin display, stat rows, return to menu
- [x] `ShopScene` — placeholder stub
- [x] `TalentScene` — placeholder stub

### GameScene Phase 1 detail

- [x] Procedural textures for ship, laser, enemy shot, battle star, war circle, boss
- [x] Scrolling starfield background
- [x] Player ship auto-fires every 350 ms
- [x] Enemy waves on a fixed timer (Mission 1 only)
  - Wave 1 @ 2 s — 5 battle stars
  - Wave 2 @ 8 s — 7 battle stars
  - Wave 3 @ 14 s — 3 war circles
  - Mixed wave @ 22–24 s
  - Boss @ 32 s — 20 HP, fast shooting, boss health bar
- [x] Enemy AI: rotation, stop-at-targetY, shoot-at-player with spread
- [x] Collision: laser hits enemy (burst effect), shot hits player (shake, HP loss)
- [x] HUD: score (top-left), HP bar (bottom-right), energy bar (cosmetic, always full)
- [x] Wave label flash (centre screen, fades out)
- [x] Mission ends on boss death (win) or player HP → 0 (lose)
- [x] Transitions to ResultScene with full `MissionResult` payload

---

## Phase 2 — Core mechanics ✅

### Energy system
- [x] `EnergyManager.ts` — energy pool, delta-based regen, `trySpend()`, `ratio` getter
- [x] Energy drains on front weapon fire (`frontEnergyCost` per shot)
- [x] Energy drains when shield absorbs a hit (2 energy per shield HP absorbed)
- [x] Energy regenerates over time (`energyRegenSec` from `ComputedStats`)
- [x] Shield HP pool separate from hull HP (`ShieldSystem.ts`)
- [x] Shield breaks when HP hits 0; hull takes overflow damage; regens from energy
- [x] `shieldBroken` result flag toggled correctly

### Auto-aim & auto-dodge
- [x] `AutoAim.ts` — `findNearestEnemy()` + `aimVelocity()` pure functions
- [x] Player laser targets nearest enemy (diagonal angle, not straight up)
- [x] `AutoDodge.ts` — threat detection on incoming shots, lateral dodge movement
- [x] Auto-dodge costs energy (`dodgeCost` from stats); cooldown prevents spam

### Side weapon buttons
- [x] `SideWeaponButton.ts` — 80×80 tap button with cooldown bar
- [x] Left button fires spread shot; right button fires heavy beam (if equipped)
- [x] Cooldown bar fills bottom-to-top; button dims at low energy
- [x] `sideWeaponsUsed` result flag

### In-mission roguelite cards
- [x] XP bar (top of screen, purple) fills as enemies are killed
- [x] On level-up: physics paused, `LevelUpOverlay` shows 3 weighted-random cards
- [x] Player taps a card to apply `StatDelta` or set `RunFlag`; physics resumes
- [x] Reroll button (5 uses per mission); `CardManager.reroll()` handles it
- [x] `data/cards.ts` — 17 cards: 9 boosts, 3 enablers, 5 payoffs
- [x] Payoff cards suppressed to 15% weight unless their enabler is picked

### Ally ship events
- [x] `AllyShipEvent.ts` — `scheduleAll()` registers Phaser timers from `allyEventTimes`
- [x] Ally ship tweens across screen; on exit triggers a card-drop offer
- [x] Card-drop uses `LevelUpOverlay` with skip option (no reroll)
- [x] `pendingAllyCard` queue handles drops that arrive while picker is already open

---

## Phase 3 — Meta-progression ✅

### Shop
- [x] `data/items.ts` — 5 item definitions: laser_mk1, generator_mk1, shield_mk1, spread_shot, heavy_beam
- [x] `ShopScene` — full implementation: buy, upgrade, sell (100% refund), equip, auto-equip on buy
- [x] Coins displayed in header; deducted on purchase, refunded on sell
- [x] Slot tags per item (FRONT / GENERATOR / SHIELDS / LEFT)
- [x] EQUIPPED badge on currently-loaded items; side weapons show L/R toggle buttons
- [x] NavBar "SHOP" tab active and underlined

### Talent tree
- [x] `data/talents.ts` — 5 branches: Weapons, Shields, Generator, Automation, Chain
- [x] 11 nodes total, each with 2–4 levels and defined star costs
- [x] Chain branch: chain_pool_1 (unlocks explosive cards), chain_pool_2 (unlocks overcharge/lightning)
- [x] `TalentScene` — tab-per-branch UI; UNLOCK button per node; RESPEC button (refunds all stars)
- [x] `spendableStars` decremented on unlock; `totalStarsEarned` never touched
- [x] NavBar "TALENTS" tab active and underlined

### Computed stats pipeline
- [x] `game/computeStats.ts` — pure function: `computeStats(save) → ComputedStats`
- [x] Derives front weapon stats, generator stats, shield stats, side weapon types from loadout
- [x] Applies all 8 talent bonuses (damage, fire_rate, weapon_eff, side_eff, shield_cap, shield_regen, battery, efficiency, dodge_eff)
- [x] Graceful fallback values when slots are empty
- [x] `CardManager` receives `chainLevel` from save talents; filters pool accordingly
- [x] GameScene reads `computeStats(save)` instead of hardcoded `BASE_STATS`
- [x] Verified: laser_mk1 L1 + generator_mk1 L1 + shield_mk1 L1 → correct stats (10/5/350ms/100/15/50/5)
- [x] Verified: `damage` talent L2 → `frontDamage = 11.6` (matches design doc formula)

---

## Phase 3.5 — Polish & UX (IN PROGRESS)

- [x] Bottom HUD panel — full-width status strip with HP / GEN / SHD bars + current/max numbers
- [x] Tutorial mission — optional first mission with 5 non-blocking mechanic tooltips
- [x] AutoDodge crash fix — null-guard on `player.body` during scene teardown
- [x] Dodge return-to-centre — RETURN_SPEED doubled; ship snaps back after each dodge
- [x] No firing without targets — front weapon skips shot cycle when no active enemies
- [x] Ship position above HUD — player sprite placed clear of the bottom panel
- [x] Ship visual redesign — delta-wing 64×88 shape: swept wings, hex canopy, dual engine pods (plan: `ship-visual-redesign.md`)
- [x] Animated ship FX — `PlayerShipFx.ts`; two Graphics layers (engine glow depth 4, weapon mounts depth 6); sine-wave engine pulse; front barrel, spread pod, beam mount drawn to match `ComputedStats`; fades out on death
- [x] Enemy body collision — enemy overlap with player kills the enemy and deals `ENEMY_COLLISION_DAMAGE = 20` to hull (through shield); camera shake on hull hit
- [x] Death animation — camera flash + shake, three staggered burst rings, alpha tween on ship and FX layers
- [x] Shop ship preview — `ShipPreviewPanel.ts` replaces `ItemPreviewPanel`; shows real animated ship with item hypothetically equipped; full-brightness mount highlight for the selected item, dimmed for existing loadout; before→after stat comparison with ▲/▼ arrows
- [x] Enemy HP bars + floating damage numbers — `enemyHpGfx` redrawn per frame; crit numbers in yellow (plan: `enemy-hp-damage-numbers.md`)
- [x] Shield visual — glowing ring at depth 4, fades with shield ratio, flashes white on hit (plan: `shield-visual.md`)
- [x] Tutorial redesign — no weapons, survive 60 s on shields alone (plan: `tutorial-no-weapons.md`)
- [x] Talent tree redesign — 21 nodes, travel + keystones, grid layout with connector lines (plan: `talent-tree-redesign.md`)
- [x] Balance simulator — `tools/simulate.ts`, 3 strategies, 4 missions, headless 100ms-tick loop (plan: `balance-simulator.md`)

## Phase 3.6 — Daily mission ✅

- [x] `src/utils/rng.ts` — Mulberry32 seeded PRNG + `utcDateInt()`, `utcDateString()`
- [x] `src/data/daily.ts` — `generateDailyWaves(seed)`, `dailyCoins()`, `todayDailySeed()`
- [x] `DailyRecord` type + `daily: DailyRecord | null` in `SaveData`; `wavesCleared?` in `MissionResult`
- [x] `SaveManager.awardDailyResult()` — records result, marks attempt used for today
- [x] `GameScene` daily mode — `startDailyWaves()` + `spawnDailyWave()`, tracks `dailyWavesCleared`
- [x] `MissionSelectScene` — daily card above regular missions; shows today's status / lock
- [x] `ResultScene` — `handleDailyResult()`: waves cleared, coins earned, no stars
- Plan: `docs/plans/daily-mission.md`

## Phase 3.7 — Structural refactor ✅

- [x] Type distribution — eliminated `types/index.ts`; each type now lives in its natural module
  - `SaveData`, `ShipLoadout`, `OwnedItem`, `MissionRecord`, `DailyRecord` → `SaveManager.ts`
  - `MissionDefinition`, `MissionResult`, `StarThreshold`, `MissionRewards` → `data/missions.ts`
  - `CardDefinition`, `StatDelta`, `RunFlag`, `CardCategory` → `data/cards.ts`
  - `SideWeaponType`, `ItemDefinition`, `ItemLevel`, `ItemLevelStats`, `ItemSlot` → `data/items.ts`
  - `TalentNode`, `TalentBranch`, `TalentLevel` → `data/talents.ts`
  - `ComputedStats` → `game/computeStats.ts`
  - `RunState` → `game/CardManager.ts`
  - `EnemyType`, `EnemySprite` → new `game/enemy.ts`
  - `DebugStats` → `debug/DebugOverlay.ts`
- [x] GameScene split (1085 → 762 lines) — extracted focused modules:
  - `src/game/TutorialHUD.ts` — tutorial tooltip class
  - `src/game/textures.ts` — all procedural texture building
  - `src/game/Starfield.ts` — scrolling star background
  - `src/hud/CombatHUD.ts` — bottom status panel + XP bar
  - `src/hud/ShieldVisual.ts` — shield glow ring + flash effect
  - `src/hud/EnemyHpBars.ts` — per-enemy HP bars
- [x] `ItemPreviewPanel` extracted from `ShopScene.ts` → `src/ui/ItemPreviewPanel.ts` (later replaced by `ShipPreviewPanel.ts`)
- [x] Vitest test suite added (`npm test`): 61 tests covering rng, daily, missions, computeStats, EnergyManager, ShieldSystem
- Plan: `docs/plans/type-distribution-refactor.md`

## Phase 4 — Content & polish

- [x] Mission 2 definition + wave schedule (plan: `mission-2-3-waves.md`)
  - 5 waves of stars + circles over 90 s, War Circle boss (120 HP, shootMs 500)
  - Asteroid field active 0–90 s: spawns every 2.5 s, bypasses shields, 5 direct hull damage
  - Circle enemies park at a random targetY (90–160 px) and shoot from there
- [x] Mission 3 definition + wave schedule (plan: `mission-2-3-waves.md`)
  - 6 waves (max 12 stars + elite circles at 30 HP), boss at 300 HP / shootMs 200
  - Speed nebula: all enemies in waves 1–5 (≤55 s) spawn at 1.6× base velocity
- [x] Environmental modifiers — asteroid field (M2) + speed nebula (M3)
- [ ] Full card pool (~100 cards in design; ~40 for v1 ship)
- [ ] Sound effects (Phaser audio, no external files — use Web Audio API tones)
- [ ] Android packaging via Capacitor

## Future — Simulator & tooling

- [ ] Seeded RNG in simulator — per-run reproducible results (plan: `seeded-rng.md`)
- [ ] Campaign simulation mode — `--mode campaign` simulates full player progression

---

## Phase 3.8 — Bug fixes ✅

- [x] Explosive rounds AoE implemented — `triggerExplosion()` in `GameScene.ts`; 20% proc
      on laser hit, radius 40 px (70 with `blast_radius`), restores 8 energy with
      `energy_recovery`, secondary explosions with `chain_reaction`
- [x] Chain lightning implemented — `triggerChainLightning()` in `GameScene.ts`; 15% proc
      on spread hit, 1 arc (2 with `storm_chains`), each arc at 60% of previous damage
- [x] `rapid_fire` timer bug fixed — `autoFireTimer` field stored; `restartAutoFireTimer()`
      called by `onCardPicked()` whenever a card carries a `frontFireMs` delta
- [x] `dodge_sense` talent wired up — `dodgeLookaheadMs` added to `ComputedStats`;
      computed as `350 + level × 50`; passed to `AutoDodge.update()` as `lookaheadMs`
- [x] Simulator tutorial boss removed — `bossSpec` is now optional in `MissionSpec`;
      tutorial uses `autoWinAtMs: 60_000` instead
- [x] Simulator `makeInitialRun()` corrected — `rerollsLeft: 1 → 5`, `level: 0 → 1`;
      `isReadyToLevelUp` index corrected to `XP_THRESHOLDS[run.level - 1]`

## Phase 3.9 — Known issue fixes ✅

- [x] `ResultScene` `secondsTaken` — `formatTime()` already formats as `1m 35s` / `45s`;
      confirmed correct, item closed.
- [x] `window.__game` dev guard — wrapped in `if (import.meta.env.DEV)` in `main.ts`;
      Vite strips it from production bundles automatically.
- [x] TalentScene keystone level display — replaced `'☆'.repeat()` with `lv N/M` text
      (☆ U+2606 renders as ★ in monospace); maxed nodes show `★ MAX`.

## Phase 4 — remaining items

- [ ] XP threshold tuning — tighten early picks to ~12 s intervals; validate with simulator
- [ ] Tutorial redesign — teach laser first, then shields (see `DESIGN_NOTES.md §2`)
- [ ] Story layer — `src/data/story.ts` with briefings, ally lines, boss death lines
- [ ] Card discoverability — flash overlay on enabler card pick ("EXPLOSIVE ROUNDS ARMED")
- [ ] Death diagnosis — track shieldBreakCount/asteroidHits; show cause in ResultScene
- [ ] Full card pool (~40 cards for v1; design guide in `DESIGN_NOTES.md §card checklist`)
- [ ] Sound effects (Phaser audio, no external files — use Web Audio API tones)
- [ ] Android packaging via Capacitor

## Known issues / debt

- Normal navigation path (PLAY → Mission Select → Game → Result → Menu) has not been
  verified end-to-end; all cross-scene testing was done via `window.__game.scene.start()`.
- No escape hatch from GameScene mid-mission (pause menu, long-press); only exit is
  through ResultScene.
