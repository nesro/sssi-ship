# Feature roadmap — Phase 5+

All new features discussed, with design decisions and rough implementation notes.
Each section has an effort estimate (S/M/L/XL) and a dependency list.

---

## Feature 1 — Story layer (S)
**Effort:** Small — pure content wiring, no new mechanics.

Story content lives in `src/data/story.ts` (already written).
Needs wiring into 4 places:

### 1a. Mission briefing screen
Before a mission starts, show 2–4 dialogue lines with character names.
- **Where:** `MissionSelectScene.ts` — after tapping PLAY, before `scene.start('GameScene')`.
- **UI:** Dark overlay, character name in accent colour, text below. Tap anywhere to advance.
- **Data:** `MISSION_BRIEFINGS[missionId]` from `story.ts`.

### 1b. Boss encounter dialogue
When `spawnBoss()` is called, show 1–2 lines before boss appears.
- **Where:** `GameScene.ts` → `spawnBoss()`.
- **UI:** Same overlay as briefing but briefer — 1.5 s auto-advance, don't pause combat.
- **Data:** `BOSS_ENCOUNTER_LINES[missionId]`.
- **Important:** Don't pause physics. Just overlay text that fades out.

### 1c. Boss death dialogue
After boss dies, 1.2 s pause, show 1–2 lines, then ResultScene.
- **Where:** `GameScene.ts` → `endMission(true)` — insert between physics pause and the
  `delayedCall(800, ...)` that starts ResultScene.
- **Data:** `BOSS_DEATH_LINES[missionId]`.

### 1d. Ally ship lines
When ally flies across, show the associated `ALLY_SHIP_LINES` entry before card drop.
- **Where:** `AllyShipEvent.ts` → callback. Or wire through `GameScene.onAllyDrop()`.

### Boss name on the health bar
- **Where:** `GameScene.ts` → `buildBossHealthBar()`. Replace hardcoded `'BOSS'` label with
  `BOSS_NAMES[this.missionId] ?? 'BOSS'`.

---

## Feature 2 — Active boost buttons (M)
**Effort:** Medium — new UI buttons, energy cost, visual effect.
**Depends on:** Nothing. Independent of other features.

Two new tap buttons sit above the existing side-weapon buttons:

| Button | Name | Effect | Cost | Cooldown |
|---|---|---|---|---|
| Left-centre | OVERDRIVE | Fire rate ×2.5 for 8 s | 25 energy | 45 s |
| Right-centre | FORTRESS | Shield regen ×4 for 8 s | 25 energy | 45 s |

These are **always available** (not equipment-dependent) but disappear if energy is below 25.

### Implementation notes

**`src/ui/ActiveBoostButton.ts`** — new class, similar to `SideWeaponButton` but:
- Circular, 56 × 56 px
- Shows cooldown ring (arc, not fill bar)
- Greyed out when energy < cost or on cooldown
- Name label above, cooldown timer below when active

**`GameScene.ts` changes:**
```typescript
// Fields
private overdriveButton: ActiveBoostButton | null = null;
private fortressButton:  ActiveBoostButton | null = null;
private overdriveUntil  = 0;
private fortressUntil   = 0;

// In create():
this.overdriveButton = new ActiveBoostButton(this, W/2 - 60, btnY, 'OVERDRIVE', 45000,
  () => this.activateOverdrive());
this.fortressButton  = new ActiveBoostButton(this, W/2 + 60, btnY, 'FORTRESS',  45000,
  () => this.activateFortress());

// Activate methods:
private activateOverdrive(): void {
  if (!this.energy.trySpend(25)) return;
  this.overdriveUntil = this.time.now + 8000;
  this.restartAutoFireTimer();   // fires at 2.5× speed while overdrive active
}
private activateFortress(): void {
  if (!this.energy.trySpend(25)) return;
  this.fortressUntil = this.time.now + 8000;
}

// In firePlayerLaser():
const fireMs = this.time.now < this.overdriveUntil
  ? this.stats.frontFireMs / 2.5
  : this.stats.frontFireMs;
// (use fireMs for next scheduled shot instead of the timer — restartAutoFireTimer handles this)

// In shields.update() call — pass a regen multiplier:
const shieldRegenMul = this.time.now < this.fortressUntil ? 4.0 : 1.0;
// ShieldSystem.update() needs a new optional multiplier parameter.
```

**Visual indicator:** While active, the boost button glows and a countdown arc depletes.
A brief screen-edge flash (green for Fortress, orange for Overdrive) on activation.

---

## Feature 3 — Pause / restart button (S)
**Effort:** Small — one button, one overlay.
**Depends on:** Nothing.

A small pause icon (⏸) in the top-right corner during GameScene.

### Implementation

**`src/scenes/GameScene.ts`:**
```typescript
private buildPauseButton(): void {
  const btn = this.add.text(this.W - 12, 12, '⏸', {
    fontSize: '16px', color: '#666666', fontFamily: 'monospace',
  }).setOrigin(1, 0).setDepth(20).setInteractive({ useHandCursor: true });

  btn.on('pointerdown', () => this.openPauseMenu());
}

private openPauseMenu(): void {
  this.pauseCombat();
  // Show overlay with: RESUME | RESTART | ABANDON
  // RESUME → this.resumeCombat()
  // RESTART → this.scene.restart()
  // ABANDON → this.scene.start('MissionSelectScene')
}
```

The pause menu is a simple rectangle overlay with three text buttons.
No new scene needed — build it inline like `LevelUpOverlay`.

---

## Feature 4 — Close call decision screen (M)
**Effort:** Medium — new overlay, save mutation (coin deduction), support ship logic.
**Depends on:** Feature 1 (uses close_call story lines). Optionally Feature 5 (ally ship visual).

Triggered when hull drops below **20%** for the first time in a mission.
Only triggers **once per mission** — no second close-call screen.

### Flow
```
hull < 20% → pauseCombat() → show CloseCallOverlay
  Option 1: PUSH THROUGH  → resumeCombat()
  Option 2: CALL SUPPORT (60 coins) → deduct coins → spawnSupportShip() → resumeCombat()
  Option 3: ABANDON MISSION → endMission(false) with a special 'abandoned' flag
```

### Implementation notes

**`GameScene.ts` new fields:**
```typescript
private closeCallTriggered = false;   // ensures it only fires once
```

**In `onShotHitsPlayer()` and `onAsteroidHitsPlayer()`, after hull damage:**
```typescript
if (this.hullHp > 0 && this.hullHp <= this.hullMaxHp * 0.20 && !this.closeCallTriggered) {
  this.closeCallTriggered = true;
  this.triggerCloseCall();
}
```

**`triggerCloseCall()`:**
- Pause combat
- Camera flash (red)
- Show `CloseCallOverlay` with options from `story.ts → CLOSE_CALL_OPTIONS`
- Coin check: disable CALL SUPPORT if player can't afford it

**`spawnSupportShip()`:**
- Tween an ally ship across the screen (reuse `allyShipTex`)
- During the tween, heal player by `SUPPORT_SHIP_HEAL_HP` (40 HP)
- During the tween, spawn burst of spread shots toward nearest enemies every 500 ms
- After `SUPPORT_SHIP_DURATION_MS` (10 s), stop shooting, finish tween off-screen

**`src/ui/CloseCallOverlay.ts`** — new class, similar structure to `LevelUpOverlay`:
- Dark red tint overlay
- "⚠ HULL CRITICAL" header in red
- One random line from `CLOSE_CALL_LINES`
- Three option buttons (always all three; grey out CALL SUPPORT if can't afford)
- Coin display next to CALL SUPPORT button

---

## Feature 5 — Composite animated player ship (XL)
**Effort:** Extra Large — architectural change to how the player ship is rendered.
**Depends on:** Nothing (isolated to ship rendering).

This is the biggest change. Instead of a single sprite from a static texture,
the ship becomes a **`PlayerShip` class** that owns multiple `Graphics` layers.

### Architecture

**`src/game/PlayerShip.ts`** — new file, owns all ship visuals:
```typescript
export class PlayerShip {
  readonly sprite: Phaser.Physics.Arcade.Sprite;  // physics body (invisible 1×1 px)

  // Visual layers (no physics)
  private hullGfx:     Phaser.GameObjects.Graphics;  // depth 5
  private cockpitGfx:  Phaser.GameObjects.Graphics;  // depth 6
  private engineGfx:   Phaser.GameObjects.Graphics;  // depth 4  (behind hull)
  private weaponGfx:   Phaser.GameObjects.Graphics;  // depth 7  (front)
  private shieldEmitter: Phaser.GameObjects.Graphics; // depth 3  (behind engines)

  // Animation state
  private engineFlicker = 0;  // 0–1, cycles via sine wave
  private weaponCharge  = 0;  // 0–1, builds up between shots, releases on fire

  constructor(scene: Phaser.Scene, x: number, y: number, stats: ComputedStats) { ... }

  update(delta: number, energyRatio: number, shieldRatio: number, isFiring: boolean): void {
    this.engineFlicker = (Math.sin(Date.now() / 80) + 1) / 2;
    this.weaponCharge  = Math.min(1, this.weaponCharge + delta / stats.frontFireMs);
    this.redrawEngine(energyRatio);
    this.redrawWeapon(stats);
    this.redrawShieldEmitter(shieldRatio);
    // Sync all graphics positions to sprite.x, sprite.y
  }

  onFire(): void {
    this.weaponCharge = 0;  // reset charge flash
  }

  applyLoadout(stats: ComputedStats): void {
    // Redraw weapon mounts based on what's equipped
    this.redrawWeapon(stats);
    this.redrawShieldEmitter(stats);
  }
}
```

### Visual design (all procedural Graphics)

**Hull (64×88):**
- Keep the existing delta-wing silhouette as the base
- Add panel line engravings (thin lines across wing roots, visible at depth 6)
- Add a canopy that glows with cockpit colour (tied to shield status)

**Weapon mounts (show when equipped):**
- `laser_mk1`: a single barrel extending from the nose — 4 px wide, 20 px long, glows cyan
- `laser_mk2+`: barrel widens + gains a secondary emitter ring
- `spread_shot` (left slot): two angled pods on the port wing, orange tips
- `heavy_beam` (right slot): a thick rectangular mount on starboard wing, white core

**Engine pods (always present, animate with energy level):**
- Two circular pods at the base
- Inner glow colour: orange at full energy → dim red at low energy
- Glow radius pulses with `engineFlicker` sine wave
- At `energyRatio < 0.2`: pods visibly flicker (random alpha drops)

**Shield emitter (show when shield equipped):**
- A hexagonal rim drawn around the hull, `strokeColor` matching shield health
- Pulses slowly when shields are full
- Shrinks and dims as shield HP drops
- Flashes white when `ShieldVisual.onHit()` is called

### Impact on GameScene
- `this.player` stays as the physics sprite (1×1 invisible hitbox)
- `this.playerShip = new PlayerShip(...)` created in `create()`
- `this.playerShip.update(delta, energy.ratio, shields.ratio, ...)` called in `update()`
- `this.playerShip.onFire()` called from `firePlayerLaser()`
- Laser spawn X/Y reads from `this.player.x, this.player.y` (physics body position), unchanged

### Why it's worth it
A ship that visibly shows its laser, shield ring, and generator glow is the best
"sense of progress" feedback the game can have. When the player buys laser_mk1 and
suddenly sees a glowing barrel appear on their ship — that moment is the entire
shop loop made visible.

---

## Feature 6 — XP threshold tuning (S)
**Effort:** Small — change 5 numbers, validate with simulator.
**Depends on:** Nothing.

Current thresholds: `[80, 200, 380, 600, 900]`

Target: first pick at ~10–12 s into the mission, slowing to every 20–25 s later.

At base stats (10 dmg, 350 ms fire rate): ~2.85 shots/s. Each star enemy = 15 XP.
Killing one enemy every 2–3 s ≈ ~5–7 XP/s at the start.

Suggested new thresholds: `[60, 140, 280, 480, 750]`

Run simulator on all 3 missions with old and new thresholds and compare clear rates.
If clear rates rise by more than 5 pp, bring one or two thresholds back up.

**File:** `src/scenes/GameScene.ts` → `const XP_THRESHOLDS = [60, 140, 280, 480, 750];`

---

## Suggested implementation order

1. **Pause button** (Feature 3) — 1 hour, critical QoL for playtesting
2. **Story wiring** (Feature 1) — 2–3 hours, no risk, immediate payoff
3. **XP tuning** (Feature 6) — 30 min, run simulator first
4. **Boost buttons** (Feature 2) — 4–6 hours, fills passive gap
5. **Close call screen** (Feature 4) — 4–6 hours, best "wow" moment
6. **Composite ship** (Feature 5) — 2–3 days, biggest visual impact; do when content is locked

---

## Open design questions (decide before implementing)

- [ ] Do boost buttons always appear, or only when the right item is equipped?
       (Always-available is simpler and better for new players)
- [ ] OVERDRIVE: does it only speed up auto-fire, or also side weapons?
       (Just auto-fire for now — keeps it readable)
- [ ] CALL SUPPORT close-call option: does it apply even on tutorial and daily?
       (Yes, but the support ship doesn't drop a card on daily)
- [ ] Can Patch appear as a support ship AND as a mid-mission ally event in the same run?
       (Yes — they're different systems. Patch can be busy.)
- [ ] Does the composite ship redraw happen every frame or only on stat change?
       (Engine animation = every frame; weapon/shield layout = only on loadout change)
- [ ] On the composite ship: how do you show an empty slot vs an equipped item?
       (Empty weapon slot = a small dark nub/hardpoint. Shield slot = no emitter ring.)
