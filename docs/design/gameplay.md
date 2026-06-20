# Gameplay Mechanics

## The conveyor belt

Enemies spawn at a fixed distance and move toward the ship each tick. When an
enemy reaches distance 0 it collides: it dies, deals `shotDamage ×
COLLISION_DAMAGE_MULTIPLIER` to the ship (shield-first), and the shield bursts
back — dealing a fraction of absorbed damage to all remaining enemies.

**Blockers** (`blocksConveyor: true`) pause the wave timeline while alive.
This is the DPS check: you must kill the blocker before the next wave spawns.
Killing a blocker grants a bonus support call.

## Ship systems

| System | What it does |
|--------|-------------|
| Weapon | Auto-fires at the front enemy on a timer; brownout stretches the interval |
| Shield | Absorbs all incoming damage first; refilled by generator pulse |
| Generator | Drains energy; when it fires a pulse it restores shield × `pulseShieldFraction` |
| Motor | Scales wave timeline speed; draws power continuously |

## Power budget (brownout)

When energy drops below 30% of capacity, the weapon fire interval stretches
proportionally — up to 2× at near-zero. It never stops firing entirely.
Motor continues drawing power even at zero energy (the draw is already
accounted for). This is intentional: the slope prevents death spirals.

## Weapon firing

1. Fire timer counts down each tick.
2. When it hits 0: apply conditional & situational modifiers, select targets,
   apply per-target randomness, deal damage.
3. Energy is spent; brownout factor determines the next interval.
4. Cards modify `RunModifiers` — never directly modify weapon stats.

## Support calls (card system)

The helper ship flies by at `mission.supportCallTicks`. Each fly-by offers 3
cards; player picks 1 (or rerolls / skips). Cards fold effects into
`RunModifiers`, lasting one mission. Rerolls are limited; the motor can grant
extras. Blockers killed mid-run grant bonus calls.

## Reserve supplies

Persistent purchases. Charges auto-refill to `ownedSupplyCharges[id]` before
each mission. Three kinds: `shield-restore`, `energy-refill`, `damage-boost`
(timed multiplier). Player activates manually during combat via supply buttons.

## Economy

- Coins: earned by completing missions (flat `completionCoins`) and killing
  enemies (`coinReward` per enemy).
- Stars: benchmark awards (0–4 per mission). Used to unlock later missions
  (`starGate`).
- Coins persist forever; stars persist forever; card picks are per-run only.

## Tick budget (100 ms per tick)

All simulation runs at 10 ticks/second. The view interpolates visuals between
ticks. Mission durations are in ticks (`TICKS_PER_SECOND = 10`).
