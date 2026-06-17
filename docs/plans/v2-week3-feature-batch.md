# v2 Feature Batch: Tutorials, Weapons, Missions UI, Shield Pulse

## What this changes and why

This batch covers six interconnected features designed around a single principle: teach the player every core mechanic through unavoidable experience before the game lets them loose. The shield/generator relationship gets a new discrete-pulse recharge mechanic (visible, legible, teachable), four new tutorial missions replace t1–t4 using forced loadouts so each mechanic is the only tool available, two new AOE weapon items join the roster with distinct colours and visuals, weapons in the shop show a per-weapon gun-shape thumbnail, the mission detail panel replaces instant-launch rows with star explanations and an opt-in strategy hint, and enemy animations become more dynamic (continuous spin + brighter glow).

---

## Design decisions confirmed

### 1. Shield recharge — discrete pulse (replaces smooth regen)

**Mechanic:** When the generator reaches 100% of its capacity, it fires a single pulse:
- Shield gains `pulseShieldFraction × shieldCapacity` HP (clamped to remaining need)
- Generator drops by `pulseDrainFraction × generatorCapacity`

This replaces `shieldRegenPerTick` and `shieldEnergyPerHp` on `ShieldSpec`. The pulse fires last in the tick phase (after weapon fire and enemy fire), consistent with "shield regen goes last."

**Per-item values (initial, to be swept by simulator):**

| Item | `pulseShieldFraction` | notes |
|---|---|---|
| Deflector I | 0.08 | slow, cheap starter |
| Deflector II | 0.12 | |
| Aegis Field | 0.18 | premium |

| Item | `pulseDrainFraction` | notes |
|---|---|---|
| Core Cell I | 0.50 | drops to 50% after pulse |
| Core Cell II | 0.42 | |
| Fusion Heart | 0.34 | fires more frequently |

**Removed from specs:** `shieldRegenPerTick`, `shieldEnergyPerHp` — delete from `ShieldSpec` and all items.

**Trigger condition:** `state.ship.energy >= stats.generatorCapacity` at end of tick (after all drains). No partial-tick accumulation needed.

**Shop preview:** Already resets `simShield = 0` and `simEnergy = 0` on `show()`. The `stepSim()` speedup (4×) continues; the pulse fires when `simEnergy >= stats.generatorCapacity`.

---

### 2. Tutorials — replace t1–t4 with four forced-loadout missions

`MissionSpec` gets `forcedLoadout?: ForcedLoadout` where:

```typescript
interface ForcedLoadout {
  weaponId: string | null;  // null = no weapon equipped
  shieldId: string | null;
  generatorId: string;      // always required
  motorId: string;
  suppliesGifted?: Record<string, number>; // supplyId → charge count
}
```

When `forcedLoadout` is present:
- `CombatScene` builds stats from `forcedLoadout` instead of `save.equipped`
- Save is not mutated; real loadout restored after mission
- Supply buttons hidden unless `suppliesGifted` is present
- Mission detail panel shows **"TRAINING MISSION — loadout is preloaded"** banner instead of shop button

#### Tutorial 1 — Shield Basics
- **Goal:** player discovers shield burst is the only way to damage enemies
- **Forced loadout:** no weapon (`weaponId: null`), Deflector I, Core Cell I, Drift Motor
- **Enemies:** single Guardian (hp 40, regen 3.5/tick, speed 0.15) spawns at second 4 — crawls slowly while generator fills and shield charges. A second Guardian at second 20.
- **Why it works:** weapon is absent so shield burst is the only damage tool. Slow crawl gives 3–4 generator pulses before first contact.

#### Tutorial 2 — Weapons + Energy
- **Goal:** player feels brownout, learns pierce vs single-target, gets first card
- **Forced loadout:** Pulse Laser I, Deflector I, Core Cell I, Drift Motor
- **Enemies:** sparse fodder wave at sec 4 (teaches basic firing + energy bar movement), dense fodder wall at sec 14 (12 fodder, spacing 5 — triggers brownout), support call at sec 12 offering Scatter Beam I
- **Why it works:** weapon fires visibly drain energy → dense wall slows weapon → card solves wall

#### Tutorial 3 — Support Cards
- **Goal:** player learns cards are mission-critical, not optional
- **Forced loadout:** Pulse Laser I, Deflector I, Core Cell I, Drift Motor
- **Enemies:** normal fodder at sec 3, then Guardian (hp 80, regen 2.2/tick) at sec 10 — unkillable with base DPS. Support call at sec 8 offers `w-dmg-30` (+30% damage, makes Guardian killable), `g-out-08` (+8% generator output), `s-cap-20` (+20% shield cap). Player must pick the damage card.
- **Why it works:** Guardian is physically unkillable without the card. Player is stuck until support call fires.

#### Tutorial 4 — Shop Supplies
- **Goal:** player activates supplies mid-mission for the first time
- **Forced loadout:** Pulse Laser I, Deflector I, Core Cell I, Drift Motor. `suppliesGifted: { 'rage-protocol': 1, 'shield-boost': 1 }`
- **Enemies:** medium mixed wave (fodder + strikers) requiring either Rage Protocol burst to clear fast or Shield Boost to survive. Designed so using neither results in hull dropping to near-zero.
- **Why it works:** supplies are pre-loaded, player just needs to tap the button. Natural pressure to use them.

---

### 3. New weapon family — Nova Wave

| Field | Nova Wave I | Nova Wave II |
|---|---|---|
| `price` | 500 | 1200 |
| `damage` | 4 | 7 |
| `maxTargets` | Infinity | Infinity |
| `falloffPerTarget` | 1.0 | 1.0 |
| `energyPerShot` | 18 | 26 |
| `intervalTicks` | 8 | 7 |
| colour | orange-gold `0xffcc44` | white-gold `0xffeeaa` |
| projectile visual | expanding ring from ship centre | wider expanding ring |
| gun visual | ring/dish emitter centred on hull | wider dish |

Nova is the swarm-counter (m5) and general AOE cleaner. Against 1–2 enemies it's the worst DPS; against 10+ swarms it dominates.

---

### 4. Per-weapon visuals

**Gun overlay:** separate `Graphics` object drawn each frame in `CombatScene` and `ShopPreviewPanel`, driven by `stats.weaponKind`. Not baked into the ship texture — hull stays constant, guns swap.

**Projectile textures:** one texture key per weapon family + tier.

| Weapon | Colour | Gun shape | Projectile |
|---|---|---|---|
| Pulse Laser I | Cyan `0x00eeff` | Twin thin barrels (current) | Thin vertical bolt |
| Pulse Laser II | White-cyan `0xaaffff` | Twin thin barrels, brighter | Brighter bolt with white core |
| Ion Lance | Violet `0x9933ff` | Single wide centred cannon | Slow fat orb |
| Scatter Beam I | Green `0x33ff88` | Three short fanned barrels | 3 small bolts in spread |
| Scatter Beam II | Lime `0x99ff44` | Three longer fanned barrels | 4 bolts, wider spread |
| Nova Wave I | Orange-gold `0xffcc44` | Ring/dish centred | Expanding ring |
| Nova Wave II | White-gold `0xffeeaa` | Wide dish | Wide expanding ring |

**Shop thumbnail:** a 24×24 logical icon baked per weapon type, drawn left of the item name in the list. Same `bake()` utility, new texture keys `wep-icon-pulse-1` etc.

**`WeaponSpec` gets `kind: WeaponKind`** (`'pulse' | 'ion' | 'scatter' | 'nova'`) so the view can look up colour + gun shape without string-matching item names.

---

### 5. Missions tab — detail panel

**Flow:** tap mission row → full-screen detail panel slides up → shows name, locked/unlocked state, star list, START button, ⓘ button.

**Detail panel layout (540px wide):**
- Mission name (large)
- Star list: each star on its own row, `✦ / ★` earned indicator + description computed from `StarSpec`
- `[ⓘ HINT]` button — tapping reveals the blurb (strategy hint). Not shown by default.
- `[START]` button (bottom). Greyed out + "need N★ to unlock" if locked.
- "TRAINING MISSION — loadout is preloaded" banner for forced-loadout missions.

**Star descriptions computed at runtime from `StarSpec`:**

| family | description |
|---|---|
| `hull-above` | `Finish with hull above ${threshold * 100}%` |
| `all-kills` | `No enemy reaches your ship` |
| `shield-unbroken` | `Shield never breaks` |
| `boss-time` | `Destroy the boss within ${ticks / TICKS_PER_SECOND}s` |

No new fields needed on `StarSpec`.

---

### 6. Enemy animation — rotation + brighter glow

**Rotation tweens (replace current `addEnemyAnimTween` logic):**

| Enemy | Tween |
|---|---|
| Swarm | Continuous spin 360°/800ms |
| Fodder | Continuous spin 360°/2400ms |
| Tank | Continuous spin 360°/3200ms |
| Blocker | Continuous spin 360°/5000ms |
| Boss | Scale pulse 1.0→1.18 / 1400ms + continuous spin 360°/4000ms (both active) |
| Striker | Keep angle wobble ±15° / 280ms (directional, spin breaks the arrowhead read) |

**Glow passes** in `textures.ts` — change `GLOW_PASSES`:

```typescript
const GLOW_PASSES = [
  { widthMultiplier: 4,   alpha: 0.14 },  // was 0.08
  { widthMultiplier: 2.6, alpha: 0.25 },  // was 0.16
  { widthMultiplier: 1.6, alpha: 0.45 },  // was 0.35
  { widthMultiplier: 1,   alpha: 1    },
];
```

---

## Complexity analysis

- Pulse check in `energy.ts`: O(1) per tick — single comparision and two multiplications.
- `forcedLoadout` in `CombatScene.create()`: O(1) — stat lookup, no loop.
- Gun overlay in `CombatScene.update()`: O(1) — 2–5 `lineBetween` calls per frame.
- Star descriptions in detail panel: O(S) where S = stars per mission (max 7) — computed once on panel open.
- Enemy spin tweens: O(E) at spawn time where E = enemies on screen (max ~14). No per-frame computation — Phaser tween engine handles it.

No path is O(N×M) or worse.

---

## File changes

| File | Change |
|---|---|
| `src/core/types.ts` | Add `WeaponKind`, `ForcedLoadout`; update `WeaponSpec` (add `kind`), `ShieldSpec` (remove regen fields, add `pulseShieldFraction`), `GeneratorSpec` (add `pulseDrainFraction`), `MissionSpec` (add `forcedLoadout?`) |
| `src/core/energy.ts` | Replace `regenerateShield` with `pulseShield` — fires when energy === capacity |
| `src/core/combat.ts` | Guard `fireShipWeapon` for null weapon |
| `src/core/tick.ts` | Replace `regenerateShield` call with `pulseShield`; confirm phase order |
| `src/core/stats.ts` | Remove `shieldRegenPerTick` / `shieldEnergyPerHp` derived fields; add pulse-related fields |
| `src/data/items.ts` | Update all `ShieldSpec` and `GeneratorSpec` entries; add Nova Wave I/II; add `kind` to all `WeaponSpec`; remove old regen fields |
| `src/data/missions.ts` | Replace t1–t4 with new tutorial missions; add `forcedLoadout` to each |
| `src/view/textures.ts` | Bump `GLOW_PASSES`; add per-weapon projectile textures; add weapon icon textures |
| `src/view/palette.ts` | Add per-weapon colour constants |
| `src/view/layout.ts` | Add weapon gun-shape constants if needed |
| `src/view/CombatScene.ts` | Gun overlay Graphics object; null-weapon guard; spin tweens; shield pulse visual cue |
| `src/view/ShopPreviewPanel.ts` | Gun overlay; per-weapon projectile; `stepSim` pulse logic |
| `src/view/ShopScene.ts` | Weapon icon thumbnails in item rows |
| `src/view/MenuScene.ts` | `addMissionRow` → detail panel on tap; star description renderer; hint button |

---

## Test plan

- [ ] Pulse fires exactly when energy reaches `generatorCapacity`, not before
- [ ] Pulse does not fire when shield is already at capacity
- [ ] `pulseDrainFraction` is applied correctly (energy drops, not shield)
- [ ] `pulseShieldFraction` is clamped so shield never exceeds capacity
- [ ] Shop preview: changing selection resets both simEnergy and simShield to 0
- [ ] Shop preview: pulse cycle is visually visible (energy fills → drops, shield steps up)
- [ ] t1: mission is completable (shield burst kills enemies)
- [ ] t1: no weapon → `fireShipWeapon` is skipped, no errors
- [ ] t2: brownout visible when dense wall arrives
- [ ] t3: Guardian is unkillable without damage card; mission is softlocked without right pick
- [ ] t4: gifted supplies appear in UI; activating one produces visible effect
- [ ] `forcedLoadout` never mutates `SaveData`
- [ ] Nova Wave I/II: `maxTargets = Infinity` hits all live enemies
- [ ] Nova Wave I/II: `falloffPerTarget = 1.0` (no decay — all enemies take equal damage)
- [ ] Mission detail panel opens on tap, not instant combat start
- [ ] Star descriptions render correctly for all 4 families
- [ ] ⓘ hint is hidden by default, visible after tap
- [ ] Locked mission shows gate requirement, START button disabled
- [ ] Training mission banner appears for t1–t4
- [ ] All enemy types spin at correct durations
- [ ] Striker still wobbles (no spin)
- [ ] Boss has both scale pulse and spin simultaneously
- [ ] Glow pass bump makes textures visibly brighter (visual check)
- [ ] `pnpm lint` passes
- [ ] `pnpm build:dry` passes
- [ ] `pnpm test` passes with no new failures

---

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user
- [ ] Test plan approved by user

**Guardrails**
- [ ] Every opt-out guard uses `=== false`, not `!value`
- [ ] Blast-radius: `forcedLoadout` can only affect CombatScene startup — save is read-only during tutorials
- [ ] No swallowed exceptions; null weapon guard throws in non-tutorial context

**Performance**
- [ ] Pulse check: O(1) per tick — confirmed
- [ ] No repeated DB or HTTP calls (no DB in game)

**Readability**
- [ ] No function exceeds 100 lines or 5 positional parameters
- [ ] `WeaponKind` enum replaces string comparisons in view layer

**Testability**
- [ ] Null-weapon state is exercised by t1
- [ ] Pulse mechanic tested with edge cases: shield already full, generator capacity 0

**File hygiene**
- [ ] Remove `shieldRegenPerTick` and `shieldEnergyPerHp` from all specs and derived stats
- [ ] No TODO/FIXME without owner

**CI**
- [ ] `pnpm build:dry` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes with no new failures
