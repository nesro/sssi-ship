← [Design docs index](../../GAME_DESIGN.md) · [← Shop & Modules](05-shop-and-modules.md)

# Combat

A mission is a sequence of wave events on a timeline (in ticks). The motor's
`timelineMultiplier` compresses or expands the timeline.

**Tick loop (100 ms / tick, 10 ticks/sec):**
1. Move enemies — each advances by `speed` distance units.
2. Fire enemy weapons at the ship.
3. Front weapon fires at the front-most enemy (brownout stretches interval if energy < 30%).
4. Rear weapon fires sideways at mid-queue depth (if toggled on).
5. Generator produces energy; if a pulse fires, restore `shield × pulseShieldFraction`.
6. Motor draws `powerDrawPerTick` from energy.
7. Advance the timeline; spawn new wave events as they become due.
8. Check support call triggers; evaluate star benchmarks; check victory/defeat.

**Collision:** when an enemy reaches distance 0, it dies and deals `shotDamage × 3` to the ship
(shield-first). The shield absorbs what it can; 60% of the absorbed amount bursts back as AoE
damage to all remaining enemies.

**Victory:** all events complete and the conveyor empties. **Defeat:** hull reaches 0.

**Two clarifications, confirmed 2026-07-15:**
- **Rear weapon energy vs. brownout.** The rear weapon costs energy per shot like the front
  weapon, but its fire interval never stretches under brownout — it fires on a fixed schedule
  regardless of energy level, so the player can rely on it as a predictable AoE tool. Only the
  front weapon's fire rate responds to brownout (line 3 of the tick loop above).
- **Enemies never interact with each other.** The conveyor is a set of independent distance
  values, not a physical queue — enemies never block, collide with, or pass around each other.
  `blocksConveyor` (the blocker/turret/boss/booster flag) only freezes *new spawns* from the
  mission's event list; it has no effect on enemies already on the lane, which keep moving at
  their own speed regardless.

## Manual controls

The ship fires automatically. The player actively manages energy by toggling:

| Toggle | Effect when OFF |
|--------|----------------|
| Front weapon | Stops firing; saves energy-per-shot |
| Rear weapon | Stops firing; saves energy-per-shot |
| Shield recharge | Generator pulses no longer restore shield; saves pulse energy drain |

Turning a system off lets energy accumulate — for a side weapon burst, recovering from
brownout, or saving up before a blocker. This is the core skill loop: read the situation,
deprioritize the right thing, act at the right moment.

**Full player action set:**
- Toggle front weapon / rear weapon / shield recharge on or off.
- Pick a card at a support call.
- Tap a side weapon.
- Tap a reserve supply.
- Tap an enemy to mark it as the front weapon's priority target (added 2026-07-15).

## Tap-to-target (front weapon only)

Tap an enemy in the game field to mark it as the front weapon's priority target. **Soft
priority:** the front weapon fires at the marked enemy whenever it's still alive and
present, falling back to the normal front-most rule otherwise — never wastes a shot on a
target that no longer exists. Free and instant, no cooldown, no limit on re-marking.
Front weapon only; the rear weapon keeps firing its predictable mid-queue AoE regardless,
and side weapons are already player-timed by their own manual-fire button.

This is a real trade-off, not a free upgrade: ignoring the front-most enemies to chase a
priority target elsewhere in the queue measurably increases collision risk (front-most
enemies reach the ship while attention is elsewhere) — confirmed by simulation, not just
asserted. It gives enemies described as "must be prioritized" (turret, booster — see
[Enemies](08-enemies.md)) a real mechanism to act on, where previously none existed.

---

Next: [Support Calls](07-support-calls.md)
