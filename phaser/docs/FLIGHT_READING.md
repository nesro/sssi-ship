# Nesro Nova — 6-Hour Flight Reading Guide

You're on a plane, no internet, and you want to deeply understand this codebase and design great content.
Here's a structured plan for the 6 hours. Open this file alongside the source code.

---

## Hour 1 — Architecture (understand how everything connects)

Read these files in order. Don't skim — each one is short.

### 1. Key type files (~10 min)

Types are co-located in the file they naturally belong to — there is no central `types/index.ts`.

| Type | Lives in |
|---|---|
| `ComputedStats` | `src/game/computeStats.ts` |
| `RunState` | `src/game/CardManager.ts` |
| `CardDefinition`, `StatDelta`, `RunFlag` | `src/data/cards.ts` |
| `SaveData`, `ShipLoadout`, `OwnedItem` | `src/SaveManager.ts` |
| `MissionDefinition`, `MissionResult` | `src/data/missions.ts` |
| `ItemDefinition`, `SideWeaponType` | `src/data/items.ts` |
| `TalentNode`, `TalentBranch` | `src/data/talents.ts` |
| `EnemySprite`, `EnemyType` | `src/game/enemy.ts` |

Key things to internalize:
- **`ComputedStats`** — the 12 numbers that fully describe your ship for one mission. Every card, talent, and item ultimately modifies one of these.
- **`RunState`** — what changes *inside* a mission (XP, cards picked, flags). Resets on mission start.
- **`CardDefinition`** — the card structure. Notice `statDelta` is additive and `enables` sets a boolean flag. That's it. No special cases.
- **`SaveData`** — what persists between sessions. The separation of `totalStarsEarned` (gate) vs `spendableStars` (talent currency) is intentional and important.

**Question to think about:** What stats are missing from `ComputedStats` that would enable new card types?  
(e.g., `hullMaxHp`, `dodgeRange`, `laserPiercing`, `explosionRadius`, `chainArcCount`)

---

### 2. `game/computeStats.ts` (~10 min)

This is where loadout + talents → ship numbers. It's a pure function with no side effects.

Notice the structure:
1. Start from item stats (or fallback if slot is empty)
2. Apply talent multipliers on top

**The talent formulas:**
```
frontDamage     = weapon.damage * (1 + talent(damage) * 0.08)
frontEnergyCost = weapon.energyCost * (1 - talent(weapon_eff) * 0.04)
energyCapacity  = generator.capacity + talent(battery) * 15
shieldCapacity  = shield.capacity + talent(shield_cap) * 25
dodgeCost       = 10 - talent(dodge_eff)   ← note: additive, not multiplicative
```

**Question:** Why is `dodgeCost` additive while `frontDamage` is multiplicative?  
Answer: Because dodge cost is already small (10), and % reductions would barely matter at low talent levels. Linear feels better for small numbers.

---

### 3. `data/cards.ts` (~10 min)

17 cards currently. Read each one. Notice the patterns:
- Boosts are pure `statDelta` (no runtime state needed)
- Enablers set a `enables` flag in RunState, which GameScene checks in the update loop
- Payoffs are mechanically implemented in GameScene already — `requiresId` only affects draw weight, not functionality

**The explosive_rounds chain in GameScene:**
```
onLaserHitsEnemy() checks run.explosiveRounds → 20% chance → triggerExplosion()
blast_radius card → radius 40 → 70 px
chain_reaction card → secondary explosions at hit positions (once, no recursion)
energy_recovery card → +8 energy on primary explosion
```

**The overcharge chain in GameScene:**
```
run.shotsSinceOvercharge++ each laser
when >= run.overchargeEvery → 3x damage hit
if overcharge_regen is picked → +5 energy on overcharge hit
```

---

### 4. `scenes/GameScene.ts` (~30 min — the biggest file)

Read the full file. Pay attention to:

**The update loop structure:**
```
update(time, delta):
  if paused → skip game logic (overlay is showing)
  energy.update(delta)          ← regen
  shields.update(delta, energy) ← regen shields from energy
  autoDodge.update(...)         ← lateral movement
  tickEnemy(e, time)            ← each enemy: rotate, stop, shoot
  checkLevelUp()                ← XP threshold check
```

**Where card effects plug in:**
- `statDelta` cards → applied to `this.stats` in `cardManager.pick()` → immediately used
- `enables` cards → set `run.explosiveRounds = true` etc → GameScene checks these flags
- The fire timer is stored as `this.autoFireTimer`. When a card with `frontFireMs` delta is picked, `onCardPicked()` calls `restartAutoFireTimer()` which removes the old event and starts a new one at the updated rate. Fire rate cards work correctly.

---

### 5. `data/missions.ts` (~10 min)

Understand `calculateStars()`. The threshold types are:
- `beat_boss` — binary win/loss
- `beat_boss_hull_percent_min` — finish with HP% ≥ value
- `beat_boss_within_seconds` — speed run
- `shields_never_broken` — shield survival
- `enemies_killed_min` — kill count
- `beat_boss_hull_hp_min` — raw HP remaining (used in M3)
- `no_side_weapons_used` — self-restriction challenge

**Question:** What other threshold types would make for interesting star conditions?
- `no_cards_picked` — pacifist run  
- `rerolls_left_min` — resource conservation
- `level_reached_min` — card economy
- `ally_cards_all_picked` — never skip an ally drop

---

## Hour 2 — Card Design Workshop

### The card design space

The 11 `StatDelta` fields define the READY design space:

| Field | Current range | Room to explore |
|---|---|---|
| `frontDamage` | +5 to +10 | negative trade-offs, large bursts |
| `frontFireMs` | -100 (BUG: no effect yet) | — fix first |
| `frontEnergyCost` | -2 | trade-offs with damage |
| `energyCapacity` | +30 to +40 | |
| `energyRegenSec` | +8 | diminishing return territory |
| `shieldCapacity` | +30 to +50 | large values risky |
| `shieldRegenSec` | +4 | |
| `dodgeCost` | -3 | min at 1, watch for negative |
| `spreadShotCost` | -1500ms cooldown | |
| `heavyBeamCost` | (unused) | |
| `sideWeaponCooldownMs` | -1500ms | |

### The NEEDS CODE design space

New `RunFlag` values you could add:
- `homingRounds` — lasers curve toward nearest enemy each frame
- `teslaField` — every Nth hit triggers AoE lightning
- `phaseShift` — dodge leaves a damage trail
- `vortexCore` — 10% chance laser pulls enemy on hit

New card effects that need new data fields in `ComputedStats`:
- `hullMaxHp` — hull capacity (currently hardcoded to 100)
- `explosionRadius` — radius of explosive_rounds AoE
- `chainArcCount` — how many arcs chain_lightning creates
- `overchargeEvery` — frequency of overcharge (currently card sets to 8)
- `laserPiercing` — number of enemies a laser can pass through

### The 5 signature builds

Think about what 5 distinct playstyles you want to be possible. Each should have:
- A clear identity (fast/bursty/tanky/efficient/control)
- At least 2-3 cards that support it
- A talent path that enables it
- A weakness

Sketch these on paper or in the editor:

**Build 1: Glass Cannon** — maximum damage, fragile
```
Cards: precision_fire, power_shot, explosive_rounds, blast_radius, overcharge
Talents: damage×3, fire_rate×3, weapon_eff×1
Weakness: dies to sustained fire before shields regen
```

**Build 2: Fortress** — maximum defense, slow damage
```
Cards: shield_wall, fast_shields, extra_energy, overcapacity, shield_nova
Talents: shield_cap×3, shield_regen×3, battery×2
Weakness: boss fights take forever, 3★ time runs nearly impossible
```

**Build 3: Sustain** — energy efficiency, sustained fire
```
Cards: lean_shots, laser_siphon, fast_regen, dodge_training, energy_recovery
Talents: weapon_eff×3, efficiency×3, dodge_eff×2
Weakness: low burst, struggles with elite enemies before they shoot
```

**Build 4: Chain Mage** — explosive_rounds + payoffs
```
Cards: explosive_rounds, blast_radius, chain_reaction, energy_recovery, blast_amplifier
Talents: chain_pool_1, damage×2, fire_rate×2
Weakness: depends on lucky card draws, weak without the enabler
```

**Build 5: Side Weapon Specialist** — maximize side weapon usage
```
Cards: side_recharge, side_mastery, spread_ammo, beam_focus, lucky_draw
Talents: side_eff×3, rapid_reload (weapons branch)
Weakness: front laser is neglected, energy-hungry if side weapons spam
```

---

## Hour 3 — Mission Design (including Daily)

### Daily Mission — Endless Survival: confirmed design

The daily is a **single very long level** that starts easy and becomes impossible near the end.
One attempt per UTC calendar day. Big coin payout proportional to depth reached.

**Key invariants (all confirmed):**
- Enemies scale every 30 seconds: HP `= round(10 × (1 + wave × 0.18))`, fire rate `= max(800, 3000 − wave × 45) ms`
- Enemy count per wave: `min(3 + floor(wave × 0.35), 12)` — grows but caps at 12
- War Circle mini-boss every 5th wave (scaled HP)
- Full loadout active — player uses weapons, cards, all systems
- Mission never auto-wins — only ends on player death
- One attempt per UTC day, locked after ResultScene saves the result
- Waves seeded by UTC date integer (`YYYYMMDD`) so all players get the same layout

**Coin formula:** `Math.floor(15 × waves × (1 + waves × 0.1))`
- 5 waves → 112 coins, 10 waves → 300 coins, 15 waves → 562 coins, 20 waves → 900 coins

**Date seeding (Mulberry32 PRNG):**
```typescript
function mulberry32(seed: number): () => number {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Seed: new Date().getUTCFullYear() * 10000 + month * 100 + day
```

**Files involved:** `src/utils/rng.ts`, `src/data/daily.ts`, `GameScene.ts`,
`MissionSelectScene.ts`, `ResultScene.ts`, `SaveManager.ts` (all implemented and shipped)

---

### Mission 2 — Orbital Defense: design decisions

The asteroid field is the key mechanic. Important choices:

**Asteroid design:**
- Auto-dodge does NOT avoid asteroids (confirmed in design doc)
- Asteroids bypass shields and hit hull directly (5 damage each)
- This creates a tension: player must learn the asteroid rhythm

**Wave pacing for M2:**
The wave schedule is in `editor/index.html` → Missions tab. Key principles:
- Introduce circles gradually (M1 has none)
- Let the player breathe between hazards
- Boss at 120s means the mission runs ~2-3 minutes total

**Why War Circle is the boss:**
- War Circle is slower and tankier — good for a "sustained fire" test
- 30 HP at base laser (10 dmg/shot) = 30 shots minimum
- With level 2+ laser: 18 dmg → ~17 shots

**Balance check:** At base stats, how long does M2 boss take?
```
Energy: 100 capacity, 15 regen/sec
Fire rate: 350ms per shot
Energy cost: 5 per shot
Shots per second: ~2.85 shots/sec (before energy runs out)
Boss dies in: 30 HP / 10 dmg = 3 shots... wait, that's too fast.
```
**Problem:** Boss HP needs to scale. With 10 dmg/shot, 30 HP = 3 shots. Need ~100-150 HP.
Revise: War Circle boss at 120 HP (realistic target: 10-15 seconds of focused fire).

### Mission 3 — The Swarm: design decisions

**Speed nebula implementation:**
The nebula is a *modifier* — enemies spawn at 160% velocity for the first 60s.
How to implement: in `spawnStarWave()` and enemy spawn functions, check `missionElapsedMs < 60000` and multiply spawn velocity.

Or cleaner: a `getEnemySpeedMultiplier(time)` function in GameScene that missions can override.

**Elite War Circles:**
15 HP (vs normal circles which have unknown HP in current code — check GameScene).
Elite circles should have a different visual: brighter stroke color.

**The swarm count problem:**
15 stars in one wave is a LOT. At 200ms spawn spacing, that's 3 seconds of spawning.
Spread across more area so they don't clump at top.

---

## Hour 4 — Talent Tree Design (REDESIGNED)

### New tree structure: travel nodes + keystones

The talent tree is being rebuilt as a proper tree where cheap travel nodes (○, 1 star)
form paths between expensive keystones (◎, 3–4 stars). You must unlock a predecessor
before accessing the next node. This creates real strategic choices.

**Data model key additions:**
```typescript
interface TalentNode {
  isKeystone:   boolean;   // true = major node; false = travel node
  col:          number;    // grid column (90px stride)
  row:          number;    // 0 = main path, 1 = fork
  requiresNode?: string;  // predecessor id — gate check in TalentScene
  levels:       TalentLevel[];
}
```

**WEAPONS branch layout:**
```
col 0       col 1        col 2
dmg_1 ────  dmg_2 ────── dmg_mastery  ◎   (+5%/+10%/Combat Mastery)
              └──  rate_1 ── rate_mastery ◎  (−5% / Burst Protocol)
weap_eff ○  (independent: −4% front energy cost)
```

**Star economy (3 missions, max 9 stars):**
- Travel node: 1 star each → player can afford 4–6 travel nodes on 6 stars
- Keystone: 3–4 stars → 1–2 keystones reachable per playthrough
- Design rule: hitting your first keystone should feel like a meaningful moment

**Think about this on the plane:** What combination of 3 travel nodes + 1 keystone makes
the most satisfying "first playthrough" investment for each branch?

### TalentScene rendering approach

Nodes are drawn at `(col * COL_STRIDE + ORIGIN_X, row * ROW_STRIDE + ORIGIN_Y)`.
Lines are drawn between nodes where `requiresNode` matches, colored by unlock state.
Tapping a node selects it; bottom info panel shows description + UNLOCK button.
A locked predecessor shows "Requires [name]" instead of UNLOCK.

### Star economy math

```
3 missions × 3 stars = 9 stars maximum
Average player (2★ avg) = 6 stars from 3 missions
Path to first keystone: 2–3 travel nodes (2–3★) + 1 keystone (3–4★) = 5–7 stars
→ Average player can hit 1 keystone with a run or two of grinding
```

---

## Hour 5 — Content Brainstorm in the Editor

Open `phaser/editor/index.html` in your browser.

**Session goals:**
1. Review all 42 pre-generated cards. Delete ones you hate. Edit ones that need work.
2. Add 10-20 new cards you'd genuinely be excited to pick mid-mission.
3. Edit the M2 wave schedule — adjust timing, counts, hazard frequency.
4. Draft M3 wave schedule adjustments.
5. Design 1 new talent branch (write it directly in the editor notes field).

**Questions for each new card:**
- What situation makes this card obviously the right pick?
- What situation makes this card obviously wrong?
- Does it pair with existing cards to create a satisfying combo?
- Is the description clear in 1-2 seconds of reading?
- Is the category honest? (enablers should DO something immediately, not just enable)

**Red flags in card design:**
- Cards that are always picked (no interesting tradeoff)
- Cards that are never picked (requires too many conditions)
- Cards that need the player to understand hidden mechanics
- Cards with negative effects that aren't clearly communicated

---

## Hour 5.5 — Balance Design

### Why automated balance matters

You cannot balance a roguelite by feel alone. A run takes 2–5 minutes, the card pool
has 17+ options, and luck can swing clear rates by ±20 points on identical loadouts.
The headless simulator (`npx tsx tools/simulate.ts`) runs 2000 simulated missions in
under a second. Run it after every stat or card change.

### Three player archetypes (strategies in the sim)

| Strategy | Models | Logic |
|---|---|---|
| `random` | Pure luck, new player | Picks a card at random from the 3 offered |
| `greedy` | Casual player | Picks card with highest direct damage contribution |
| `optimal` | Veteran, synergy-aware | Follows priority tables: enabler → payoffs, low energy → regen first, low HP → defense first |

The luck spread is the **difference between random's best and worst run** at the same
loadout. Target: ±15–20 percentage points. If spread is wider, individual cards are too
swingy. If narrower, player choices don't matter.

### Confirmed difficulty targets

| Mission | Random | Greedy | Optimal |
|---|---|---|---|
| Tutorial | 85% | 90% | 95% |
| M1 — no gear | 45% | 60% | 75% |
| M1 — basic gear | 65% | 80% | 90% |
| M2 — M1 gear | 20% | 45% | 65% |
| M3 — full gear | 8% | 28% | 55% |

The **35–40 point gap between Random and Optimal on hard missions** is intentional.
It represents skill. The **40–50 point gap between no-gear and full-gear** is grind.

### Simulator architecture (files in `tools/`)

```
tools/simulate.ts              ← CLI: --mission --loadout --strategy --runs --json
tools/sim/SimEngine.ts         ← headless 100ms-tick loop
tools/sim/SimTypes.ts          ← SimConfig, SimResult, SimEnemy
tools/sim/SimCardManager.ts    ← wraps real CardManager for headless use
tools/sim/strategies/
  CardStrategy.ts              ← interface: pick(cards, stats, run) → CardDefinition
  RandomStrategy.ts            ← uniform random
  GreedyStrategy.ts            ← highest damage-equivalent contribution
  OptimalStrategy.ts           ← synergy-aware priority tables
```

The sim reuses `EnergyManager`, `ShieldSystem`, and `CardManager` directly — no mocks.
Enemy fire is stochastic (`shootMs ± 20%`). Dodge is probabilistic (`dodgeChance`
based on energy ratio). Card draws use the real weighted pool.

### Reading the simulator output

```
────────────────────────────────────────────────────────────
  mission_1 | loadout: none | runs: 2000 per strategy
────────────────────────────────────────────────────────────
  strategy   clear%   avg HP   avg time   3★ rate   avg cards
  random      47.3%   68/100   51.4 s     12.1%     3.2
  greedy      61.8%   74/100   48.8 s     21.4%     3.1
  optimal     76.2%   79/100   46.1 s     33.7%     3.0
────────────────────────────────────────────────────────────
  luck spread (greedy): p25 51, p50 74, p75 91
```

**Red flags to act on:**
- `random clear% > 70%` on any mission → too easy, increase enemy HP
- `optimal clear% < 40%` on M1 → too hard, reduce enemy HP or fire rate
- `optimal - random > 50pp` → choices matter too much, reduce variance
- `avg time > 90s` on M1 → mission is dragging, add more enemies earlier

---

## Hour 6 — Implementation Priorities

When you land, implement in this order. Each item has an approved plan in `docs/plans/`.

### Priority 1: Balance simulator (`tools/`)

Create the full `tools/` directory structure. No Phaser imports anywhere in `tools/`.
The sim reuses game logic classes from `src/game/` directly.

Key invariant: `SimEngine.ts` must stay ≤ 150 lines. Push helpers into named methods.

Run target: `npx tsx tools/simulate.ts` completes M1 × 2000 runs in under 5 seconds.

### Priority 2: Enemy HP bars + floating damage numbers

One persistent `enemyHpGfx: Graphics` object, cleared and redrawn every frame.
One `Text` object per damage hit, tweened 40 px upward, destroyed on completion.

Every enemy spawn needs `e.maxHp = e.hp` (boss already has this).

Key: call `spawnDamageNumber()` from `damageEnemy()`. The boss bar that already exists
must NOT get a second bar — guard with `if (e.enemyType === 'boss') continue`.

### Priority 3: Shield visual

`shieldGfx: Graphics` at depth 4. Every frame: clear, draw filled circle (alpha =
`ratio × 0.22`) + rim circle (alpha = `ratio × 0.75`).

`shieldFlash` scalar (field on GameScene): set to 1.0 when shield absorbs a hit,
decays at `1.8 × delta/1000` per frame. Color lerps cyan → white based on flash.

```typescript
private lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8)  |
    Math.round(ab + (bb - ab) * t)
  );
}
```

### Priority 4: Tutorial — no weapons, shields only

Gate `startAutoFire()` and `checkLevelUp()` behind `if (this.missionId !== 'tutorial')`.
Four slow-firing star waves over 60 seconds. Mission ends on `this.at(60000, ...)` win.
Only `'energy'` and `'shield'` tutorial tips — remove `'fire'` and `'cards'`.

Update `missions.ts` tutorial description: "Shields absorb hits and recharge from
energy. Survive 60 seconds."

### Priority 5: Ship visual redesign

Target texture: 64 × 88. Delta wing silhouette — swept polygon body, dual engine pods
at rear, elongated hex canopy at front. Engine glow dots. Panel lines on wing roots.

Update laser spawn y-offset to match new nose position (roughly `−44` from centre).

### Priority 6: Talent tree redesign ✅

`TalentNode` in `src/data/talents.ts` already has:
```typescript
isKeystone:    boolean;
col:           number;
row:           number;
requiresNode?: string;
```

21 nodes across 5 branches. Travel nodes: 1 star, small bonus. Keystones: 3–4 stars,
big bonus + unlock label. TalentScene grid rendering + connecting lines + bottom info
panel is implemented. `computeStats.ts` maps all current node IDs.

### On seeded RNG

The game currently uses `Math.random()` everywhere. Three distinct concerns were discussed:

| Where | Approach | Rationale |
|---|---|---|
| Daily mission wave gen | Date-seeded Mulberry32 | All players same layout same day |
| Balance simulator | Per-run seeded PRNG | Reproducible, debuggable outliers |
| Main game combat | Keep `Math.random()` | Low benefit, high refactor risk |

The Mulberry32 PRNG lives in `src/utils/rng.ts` and is used by `src/data/daily.ts`.
The simulator gets its own seeding when that work lands.

### On campaign simulation

The simulator (`tools/simulate.ts`) currently runs single missions with fixed loadouts.
A `--mode campaign` could simulate a full player progression:
1. Start with empty save
2. Simulate tutorial (always clears)
3. Auto-spend coins on cheapest available item
4. Repeat M1 until it clears; track runs needed
5. Report: total runs to beat all 3 missions, optimal buy order, time estimate

This answers "does grind feel rewarding or like a wall?" Run it before adjusting coin
economy or item prices.

### Priority 7: Shop item preview

`ItemPreviewPanel` class in `ShopScene.ts`. Bottom drawer slides up (200 px) when an
item card is tapped. Shows item texture preview + animated projectile demo. Re-tap
toggles it closed. The panel is inside ShopScene, not a separate scene.

---

## Quick Reference Card

### Key formulas to remember

```
Energy per second from laser:  frontEnergyCost / (frontFireMs / 1000)
  Base: 5 / 0.35 = 14.3 energy/sec spent on firing
  Generator regen: 15 energy/sec
  Net: +0.7/sec (tight!)

Shield regen cost:  shieldRegenSec energy per second (1:1 ratio)
  Base: 5 energy/sec for shield regen
  Combined with laser: 14.3 + 5 = 19.3/sec spent, 15/sec regen → slow drain

Dodge energy cost: 10 per dodge
  Dodge cooldown: 600ms, duration: 380ms
  Max dodges/sec: ~1.2 → 12 energy/sec if dodging constantly
  All systems stressed: 14.3 + 5 + 12 = 31.3/sec drain vs 15/sec regen → fast drain
```

### Stat delta cheat sheet

```
Fire rate:   -100ms frontFireMs = ~30% faster fire rate
Damage:      +5 frontDamage = 50% more damage (base is 10)
Energy/shot: -2 frontEnergyCost = 40% cheaper per shot (base is 5)
Energy cap:  +30 energyCapacity = 30% more reserve
Energy regen:+8 energyRegenSec = 53% faster regen
Shield HP:   +30 shieldCapacity = 60% more shield buffer
Shield regen:+4 shieldRegenSec = 80% faster shield regen
Dodge cost:  -3 dodgeCost = 30% cheaper dodges
Side weapon: -1500ms sideWeaponCooldownMs = 30% faster cooldown
```

### Files to open when you land

| Task | File |
|---|---|
| Balance sim | `tools/simulate.ts`, `tools/sim/SimEngine.ts` |
| Add new cards | `src/data/cards.ts`, `src/scenes/GameScene.ts` |
| Add hullMaxHp stat | `src/game/computeStats.ts`, `src/scenes/GameScene.ts` |
| Add new RunFlags | `src/data/cards.ts` (RunFlag type), `src/game/CardManager.ts` |
| New enemy types | `src/game/enemy.ts`, `src/scenes/GameScene.ts` |
| Mission 2 waves | `src/scenes/GameScene.ts` → `startEnemyWaves()` |
| Implement homing | `src/game/AutoAim.ts` + `src/scenes/GameScene.ts` |
| Shop item preview | `src/ui/ItemPreviewPanel.ts` |
| Talent tree | `src/data/talents.ts`, `src/scenes/TalentScene.ts` |
