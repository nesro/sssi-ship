# Nesro Nova — Game Design & Implementation Plan

> **Name history:** This game was originally built in 2010 as *SSSI Ship*, a browser-based
> space shooter created by Tomáš Nesrovnal as a school project. It is being rebuilt from
> scratch under the name **Nesro Nova** as a mobile idle/roguelite. The Phaser 3 prototype
> lives in `phaser/` and the original source is preserved in the repo root.

---

## What this is and why we are building it

Nesro Nova is a portrait-mode mobile space shooter where the player's ship fights
autonomously — it aims and dodges on its own — while the player focuses on a strategic
layer: buying and equipping hardware in the Shop, spending stars in the Talent Tree, and
making card-draft choices when the ship levels up mid-mission. Two manually-activated
side weapons keep the player's hands engaged during combat without requiring precision
controls. The game is built with Phaser 3 + Vite for fast browser development and
wrapped with Capacitor for Android/iOS distribution.

---

## Screen map and navigation

```
MainMenuScene
  ├── MissionSelectScene
  │     └── GameScene
  │           ├── LevelUpOverlay    (in-scene modal, pauses combat)
  │           └── ResultScene       (post-mission: stars, coins, summary)
  ├── ShopScene
  └── TalentScene
```

All non-combat scenes share a **persistent nav bar** at the bottom
(Menu | Missions | Shop | Talents). The nav bar is hidden during GameScene.

---

## Design decisions — confirmed

### Energy system

The generator produces energy continuously (energy/sec). Energy is consumed by
discrete events, not continuous drains:

| Event | Energy cost |
|---|---|
| Shield absorbs a hit | flat cost per hit (scales with incoming damage) |
| Auto-dodge executes one manoeuvre | burst cost, held until manoeuvre completes |
| Front weapon fires one shot | cost per shot (see weapon trade-off below) |
| Left side weapon activates | burst cost |
| Right side weapon activates | burst cost |

**Shield HP pool:** Shields have their own HP pool (e.g. 100 at base). Incoming damage
is absorbed by shield HP first. The generator continuously converts energy into shield HP
regen. If energy is empty, shield HP does not regenerate. If shield HP reaches 0, damage
hits the ship's hull HP directly.

**Auto-dodge:** The system detects threatening incoming projectiles and executes a
lateral dodge. Each dodge consumes a burst of energy. If energy is below the dodge cost,
no dodge occurs and the ship holds its current position.

**Weapon energy trade-off (key mechanic):** Each weapon level increases both damage per
shot AND energy cost per shot. A higher-level weapon has greater raw DPS but is more
energy-hungry. If the generator cannot sustain the shot frequency, the weapon fires less
often, reducing effective DPS. A lower-level weapon with full shot frequency can
therefore outperform a higher-level weapon that is energy-starved. Players must balance
weapon level against generator level.

```
Example (front laser):
  Level 1: 10 dmg/shot,  5 energy/shot  → 2.0 dmg/energy  (efficient)
  Level 2: 18 dmg/shot, 12 energy/shot  → 1.5 dmg/energy
  Level 3: 28 dmg/shot, 22 energy/shot  → 1.27 dmg/energy (raw power, energy hungry)
```

**Priority when energy runs low:** Shield regen pauses first (shield HP freezes),
then auto-dodge deactivates, then weapons reduce to minimum fire rate. The ship never
fully stops shooting.

### Shields

- Separate HP pool. Regenerates using generator energy.
- When shield HP = 0, hull HP takes damage directly.
- Higher shield tier = larger HP pool + faster regen (lower energy cost per HP restored).

### Side weapons

Both the left slot and the right slot can hold **any** side weapon type. Buying two
of the same weapon (e.g. two Spread Shots) is valid. Available types:

| Name | Behaviour | Burst energy cost |
|---|---|---|
| Spread Shot | 5 projectiles in a 90° arc, good vs clusters | 20 |
| Heavy Beam | Single high-damage beam, good vs bosses and tanky enemies | 30 |

More types can be added in later phases. Both slots are triggered by dedicated
on-screen buttons at the bottom corners of the screen (≥ 80 px tap targets).

### In-mission level-up cards

- XP is earned per enemy kill.
- On level-up: combat pauses, player sees **3 randomly drawn cards** from the
  mission card pool, picks one, combat resumes.
- The same card cannot appear twice in one run (drawn cards are removed from the
  pool for that mission).
- The pool has ~100 cards split across three categories:
  - **Enablers** — activate a mechanic: *"Lasers have 15% chance to explode an enemy"*
  - **Payoffs** — require an enabler to be useful: *"Exploded enemies deal 30 AoE damage"*
  - **General boosts** — standalone stat improvements: *"+20% fire rate this mission"*
- Payoffs are weighted lower in the draw if the matching enabler has not been picked yet.
- All cards reset when the mission ends.
- **Rerolls:** The player has **5 rerolls per mission** (shared across all level-up
  events, not 5 per event). A reroll discards the current 3 cards and draws 3 new ones.
  Rerolls are tracked in the GameScene state and displayed as a counter.

### Ally ships (card drop events)

Friendly ships appear during missions as periodic automatic events (not tied to
player action). When one appears:
1. The ally ship flies across or near the screen (small animation, a few seconds).
2. It always survives and always drops a card reward.
3. The card drop uses the same draw mechanic as level-up (1 card shown, but with
   a "skip" option instead of a mandatory pick — the player can decline the card).
4. Ally ships do not fight and cannot be destroyed.
5. Trigger timing is defined per-mission in the mission config (e.g. at 30s, 70s, 110s).

### Shop rules

- Items are purchased once (unlock) and upgraded with coins.
- Items can be **sold back for 100% of their purchase price** (the upgrade cost
  of each individual level is also refunded fully).
- Upgrades are per-level: you buy Level 1, then Level 2, then Level 3 separately.
  Selling refunds all tiers paid.

### Talent tree rules

- Stars are the talent currency. **Spending stars on talents does not reduce the
  total-stars-earned counter** used for mission unlock gates. Both numbers are tracked
  separately: `totalStarsEarned` and `spendableStars`.
- Free, unlimited **respec**: the player can reclaim all spent stars at any time
  from the Talent Tree screen. Restores full `spendableStars`.
- Unlock gates for the next mission set are based on **quality** of completions,
  not just quantity. Example: "To unlock Set 2, all Set 1 missions must be ≥ 2★."
  This prevents grinding 1★ completions to bypass content.

### Star economy in full

```
Player earns 3★ on Mission 1 (first time):
  → totalStarsEarned  += 3   (used for unlock gates, never decreases)
  → spendableStars    += 3   (used for talent purchases, can be spent)

Player spends 2 stars on a talent:
  → totalStarsEarned  = 3    (unchanged)
  → spendableStars    = 1

Player respeccs the talent tree:
  → spendableStars    += 2   (refunded)
  → spendableStars    = 3

Mission 2 unlock gate checks totalStarsEarned (3), not spendableStars.
```

---

## Data model

Designed for localStorage now, API-compatible later. All fields are plain JSON.

```typescript
interface SaveData {
  version: number;          // schema version for future migrations

  coins: number;
  totalStarsEarned: number; // never decreases — used for unlock gates
  spendableStars: number;   // talent currency

  ship: ShipLoadout;
  inventory: Record<ItemId, OwnedItem>;
  talents: Record<TalentId, number>;       // level purchased (0 = none)
  missions: Record<MissionId, MissionRecord>;
}

interface ShipLoadout {
  frontWeapon:  ItemId | null;
  leftWeapon:   ItemId | null;
  rightWeapon:  ItemId | null;
  generator:    ItemId | null;
  shields:      ItemId | null;
}

interface OwnedItem {
  level: number;   // current upgrade tier (1 = base)
}

interface MissionRecord {
  unlocked:  boolean;
  bestStars: 0 | 1 | 2 | 3;
}
```

### Ship stats — computed at mission start, never stored

All ship stats are derived fresh from loadout + talents at the start of each mission.
Nothing is stored mid-mission except for card picks and reroll count.

```
// Energy
energyCapacity   = generator.capacity  + talent(battery)   * 15
energyRegen      = generator.regen     + talent(efficiency) * 3    [energy/sec]

// Front weapon
frontDamage      = weapon.damage       * (1 + talent(damage) * 0.08)
frontEnergyCost  = weapon.energyCost   * (1 - talent(weaponEff) * 0.04) [energy/shot]
frontFireRate    = weapon.shotsPerSec                                    [shots/sec]
// effective fire rate is capped by energy availability:
// actualRate = min(frontFireRate, energyRegen / frontEnergyCost)

// Shields
shieldCapacity   = shield.capacity     + talent(shieldCap)  * 25
shieldRegen      = shield.regenRate    + talent(shieldRegen) * 2    [shield HP/sec]
// shield regen costs: 1 energy per 1 shield HP restored

// Auto-dodge
dodgeCost        = 10                  - talent(dodgeEff)   * 1    [energy/dodge]
dodgeSensitivity = 1.0                 + talent(dodgeSense) * 0.2

// Side weapons (burst costs per activation)
spreadShotCost   = 20                  - talent(sideEff)    * 1
heavyBeamCost    = 30                  - talent(sideEff)    * 1
```

### Energy baseline at base loadout

| Scenario | Net energy/sec |
|---|---|
| Idle (no hits, no dodge, no shots) | +regen |
| Shooting only (lvl 1 weapon, 1 shot/sec) | regen − 5 |
| Shooting + shield regen (taking hits) | regen − 5 − regen_to_shield |
| All systems stressed (dense combat) | may go negative temporarily |

The player feels the trade-off naturally without any energy bar management UI —
they see the side weapon buttons dim when energy is low.

---

## Mission definitions — v1 (3 missions)

### Set 1

#### Mission 1 — "First Contact"
- **Enemies:** Battle Stars only. 5 escalating waves (5→6→7→8→10 enemies).
  Final boss: Boss Battle Star (20 HP).
- **Modifier:** None.
- **Objective:** Defeat the boss.
- **Ally ship events:** At 25s and 60s.
- **Stars:**
  - 1★ — Defeat the boss
  - 2★ — Defeat the boss with hull HP ≥ 50%
  - 3★ — Defeat the boss in under 75 seconds
- **Unlock gate:** Available from start (0 stars required).
- **Coin reward:** 80 base + 40 per extra star (max 160).

#### Mission 2 — "Orbital Defense"
- **Enemies:** Battle Stars + War Circles. Mini-boss War Circle (30 HP) appears at 120s.
- **Modifier:** **Asteroid field** — rocks periodically cross the screen horizontally.
  Hitting one deals 5 hull damage (bypasses shields). Auto-dodge does not avoid asteroids.
- **Objective:** Survive 120 seconds, then defeat the mini-boss.
- **Ally ship events:** At 40s and 90s.
- **Stars:**
  - 1★ — Complete the mission
  - 2★ — Complete + shields never fully depleted (shield HP never reached 0)
  - 3★ — Complete + at least 60 enemies killed
- **Unlock gate:** Mission 1 ≥ 1★.
- **Coin reward:** 150 base + 60 per extra star (max 270).

#### Mission 3 — "The Swarm"
- **Enemies:** Dense Battle Star swarms, 2 elite War Circles (15 HP each), Boss Battle
  Star (40 HP, 50% faster fire rate than Mission 1 boss).
- **Modifier:** **Speed nebula** — all enemies move 60% faster for the first 60 seconds.
- **Objective:** Defeat the boss.
- **Ally ship events:** At 20s, 55s, and 100s.
- **Stars:**
  - 1★ — Defeat the boss
  - 2★ — Defeat the boss with hull HP ≥ 10
  - 3★ — Defeat the boss without using either side weapon
- **Unlock gate:** Mission 1 ≥ 2★ AND Mission 2 ≥ 2★  (quality gate, not just count).
- **Coin reward:** 250 base + 100 per extra star (max 450).

---

## Talent tree — 5 branches

Each branch has 3–5 nodes. Each node has 3–5 levels. Star cost increases per level.

| Branch | Nodes (examples) | Flavour |
|---|---|---|
| **Weapons** | Damage, fire rate, weapon efficiency | Raw combat power |
| **Shields** | Shield capacity, regen rate, shield efficiency | Survivability |
| **Generator** | Energy capacity, regen rate | Sustain |
| **Automation** | Dodge sensitivity, dodge efficiency, targeting priority | AI quality |
| **Chain** | Unlocks enabler cards, payoff cards permanently into the card pool | Build diversity |

The Chain branch is how rarer and more synergistic cards enter the level-up pool.
Without investing in Chain, only basic boosts and a small set of starter enablers appear.

---

## Level-up card pool — categories

### Enablers (activates a new mechanic for this run)
Examples:
- *Explosive Rounds* — lasers have 15% chance to explode on hit
- *Chain Lightning* — side weapons have 10% chance to arc to a second target
- *Shockwave Shields* — when shields take a hit, emit a small pulse that pushes projectiles
- *Overcharge* — every 10th shot deals 3× damage

### Payoffs (only useful if the matching enabler is active)
Examples (paired with Explosive Rounds):
- *Blast Radius* — explosions deal damage in a larger area
- *Chain Reaction* — explosions can trigger other explosions (up to 2 hops)
- *Energy Recovery* — explosions restore 5 energy

### General boosts (standalone, always useful)
Examples:
- *+20% fire rate this mission*
- *+30 shield HP*
- *+15 energy regen this mission*
- *Side weapons recharge 25% faster*

---

## Complexity analysis

| Loop | Variables | Big-O | Risk |
|---|---|---|---|
| Enemy update per frame | E enemies | O(E) | Low. E ≤ 30 in practice. |
| Auto-dodge repulsion | P projectiles | O(P) | Low. P ≤ 50 in practice. |
| Laser-enemy collision | L lasers × E enemies | O(L × E) | Medium. Phaser broadphase reduces constant factor. Bounded at ~20 × 30 = 600 pairs/frame. |
| Shot-player collision | P projectiles | O(P) | Low. Single target. |
| Card pool draw | C cards | O(C) | Negligible. Runs only on level-up. |
| Stat computation | T talents | O(T) | Negligible. Runs once at mission start. |
| Ally ship card draw | C cards | O(C) | Negligible. Runs on event trigger only. |

No path is O(N×M) or worse in steady state. All per-frame loops are O(n)
over one collection only.

---

## Implementation phases

### Phase 1 — Fix + Foundation
- [ ] Fix ship visibility bug (depth / origin issue in current prototype)
- [ ] Rename to Nesro Nova throughout (index.html title, MenuScene)
- [ ] Implement `SaveManager` (localStorage, versioned, API-swap-ready)
- [ ] Implement all 5 scenes with correct navigation (stub content for Shop, Talent)
- [ ] Implement `ResultScene` — show earned stars, coins, update save
- [ ] Implement nav bar shared component

### Phase 2 — Combat system
- [ ] `AutoAim` — threat scoring, beam direction toward target
- [ ] `AutoDodge` — projectile repulsion field, ship stays in bottom 30%
- [ ] Energy system — generator regen, event-based costs, priority shutoff
- [ ] Shield HP pool — regen from energy, hull damage on depletion
- [ ] Energy HUD — generator bar, shield bar, side weapon cooldown bars
- [ ] Side weapon buttons — left + right, large tap targets, dimmed when energy low
- [ ] In-mission XP + level-up card picker — pause, draw, pick, resume
- [ ] Reroll mechanic — 5 per mission, counter shown in card picker UI
- [ ] Ally ship events — appear, animate, drop a card, leave
- [ ] Mission 1 complete with full star tracking

### Phase 3 — Progression
- [ ] `ShopScene` — item catalogue, buy, upgrade, sell (100% refund), equip to slots
- [ ] `TalentScene` — 5-branch visual node graph, spend stars, free respec
- [ ] `ComputedStats` — derive ship stats from loadout + talents at mission start
- [ ] Star award flow — update `totalStarsEarned` and `spendableStars` on new star
- [ ] Coin flow — award coins post-mission, deduct in shop, add on sell

### Phase 4 — Mission variety + polish
- [ ] Mission 2 — asteroid field modifier, survival objective, mini-boss
- [ ] Mission 3 — speed nebula modifier, dense swarm, elite enemies, 40 HP boss
- [ ] `MissionSelectScene` — star display, quality unlock gates, coin counter
- [ ] Card pool — full set of enablers, payoffs, general boosts (~40 cards for v1)
- [ ] Chain talent branch — unlocks additional cards into pool

---

## File structure

```
phaser/src/
  main.js

  SaveManager.js          # read / write / migrate localStorage save

  data/
    items.js              # shop catalogue: stats, costs, formulas per level
    talents.js            # talent node definitions: costs, stat effects
    cards.js              # all ~100 level-up card definitions
    missions.js           # mission configs: waves, modifiers, star thresholds,
                          # ally event timings, coin rewards

  scenes/
    MenuScene.js
    MissionSelectScene.js
    GameScene.js
    ResultScene.js
    ShopScene.js
    TalentScene.js

  ui/                     # reusable UI components (not game objects)
    NavBar.js
    EnergyHUD.js
    LevelUpOverlay.js     # card picker: draw, display, pick, reroll
    SideWeaponButton.js   # button + cooldown + energy-check logic

  game/                   # combat-only logic
    Ship.js               # position, energy draw, fire timing, apply card effects
    AutoAim.js            # target selection, threat scoring
    AutoDodge.js          # repulsion field, lateral movement
    EnergyManager.js      # regen loop, cost API, priority shutoff logic
    ShieldSystem.js       # shield HP pool, regen from energy, hull damage
    EnemyManager.js       # wave timeline, mission event scheduling
    AllyShipEvent.js      # ally flyby animation + card drop trigger
    CardManager.js        # pool management, draw, dedup, reroll counter

    enemies/
      BattleStar.js
      WarCircle.js
      Boss.js

    projectiles/
      Laser.js
      EnemyShot.js
      SpreadShot.js       # 5-projectile arc
      HeavyBeam.js        # single high-damage projectile
```

---

## Open questions before starting Phase 2

These do not block Phase 1 but need answers before building combat:

- [ ] How fast should the auto-dodge move the ship? Instant snap or smooth slide?
- [ ] Should the ally ship be an animated sprite or a procedural graphic like the enemies?
- [ ] Should the reroll counter be visible at all times during a mission, or only during the card picker?

---

## Test plan

### Phase 1
- [ ] `SaveManager.write()` then `SaveManager.read()` returns identical data
- [ ] `SaveManager` detects old schema version and migrates without crash
- [ ] All navigation routes are reachable and return correctly
- [ ] `ResultScene`: 1★, 2★, 3★ thresholds compute correctly at boundary values
- [ ] `ResultScene`: `totalStarsEarned` increases only on new best, not on repeat
- [ ] `ResultScene`: `spendableStars` increases by same delta as `totalStarsEarned`

### Phase 2
- [ ] `AutoAim` targets nearest enemy when multiple present
- [ ] `AutoAim` fires straight up when no enemies on screen (no crash)
- [ ] `AutoDodge` does not move ship outside bottom 30% zone
- [ ] `EnergyManager` regen is frame-rate independent (delta-based)
- [ ] `EnergyManager` priority shutoff: shields pause before dodge before weapon throttle
- [ ] `ShieldSystem` hull damage only when shield HP = 0
- [ ] Level-up picker pauses physics, resumes on card pick
- [ ] Same card does not appear twice in one mission
- [ ] Payoff cards have reduced weight without matching enabler
- [ ] Reroll counter starts at 5, decrements on each reroll, disables at 0
- [ ] Ally ship event fires at configured time, shows card, allows skip

### Phase 3
- [ ] Shop: buying deducts coins; cannot go below 0
- [ ] Shop: sell returns 100% of all coins paid for that item and all its upgrades
- [ ] Shop: cannot equip an item not owned
- [ ] Talents: spending star reduces `spendableStars`, does not touch `totalStarsEarned`
- [ ] Talents: respec restores all `spendableStars` and resets all talent levels to 0
- [ ] `ComputedStats`: front DPS reflects `talent(damage)` level correctly at each level
- [ ] Mission unlock gate: Mission 3 locked until M1 ≥ 2★ AND M2 ≥ 2★

---

## Checklist

**Design decisions**
- [x] Energy system: event-based costs (not continuous drains)
- [x] Shield HP pool separate from hull HP; energy regens shield HP
- [x] Weapon trade-off: higher level = higher dmg AND higher energy/shot
- [x] Both side weapon slots accept any weapon type (including duplicates)
- [x] Sell at 100% price; free talent respec
- [x] 5 rerolls per mission, shared across all level-up events
- [x] Ally ships: automatic, always drop a card, player can skip
- [x] Stars: `totalStarsEarned` (gates) separate from `spendableStars` (talent currency)
- [x] Unlock gates are quality-based (need ≥ 2★ on missions)
- [x] Chain talent branch adds cards permanently to the level-up pool

**Guardrails**
- [ ] All energy costs and stat formulas live in `data/` files — no magic numbers in game logic
- [ ] Energy delta is always multiplied by `delta` (ms) — never per-frame fixed values
- [ ] `totalStarsEarned` never decreases — guard this in `SaveManager`
- [ ] Selling an item that is currently equipped removes it from the loadout first

**Performance**
- [ ] Per-frame loops are O(E) or O(P) — never O(E × P)
- [ ] Stat computation runs once at mission start and is cached on `this`
- [ ] Card pool draw runs only on level-up / ally event — not per frame

**Readability**
- [ ] Each file has a single clear responsibility (see file structure above)
- [ ] No function exceeds 100 lines
- [ ] No function has more than 5 positional parameters
- [ ] Comments explain *why*, not *what*

**CI**
- [ ] `npm run build` passes before each phase begins
