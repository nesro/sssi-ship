# Cards (Support Calls)

## How they work

Support ships appear at `mission.supportCallTicks`. Each appearance offers 3
cards from a weighted pool. Player picks 1, rerolls (limited), or skips.
Effects fold into `RunModifiers` and last until the mission ends.

Unique cards (enablers, payoffs) are never offered twice per run.
Chain payoffs are weight-suppressed until their enabler is picked.

## Flat boost cards

One-line modifier cards. No special logic.

| ID | Name | Effect |
|----|------|--------|
| w-dmg-15 | FOCUS LENS | +15% weapon damage |
| w-dmg-30 | PRISM CORE | +30% weapon damage |
| w-dmg-50 | SNIPER CORE | +50% weapon damage |
| w-rate-13 | RAPID CYCLER | 13% faster firing |
| w-rate-20 | TWIN ACTUATOR | 20% faster firing |
| w-rate-30 | TRIPLE ACTUATOR | 30% faster firing |
| w-cost-25 | COOL BARREL | Shots cost 25% less energy |
| w-cost-40 | ICE BARREL | Shots cost 40% less energy |
| s-pulse-25 | HARMONIC TUNER | +25% shield per generator pulse |
| s-pulse-40 | FIELD WEAVER | +40% shield per generator pulse |
| s-pulse-60 | RESONANCE WEAVER | +60% shield per generator pulse |
| s-cap-15 | WIDE PROJECTOR | +15 max shield |
| s-cap-20 | HEAVY PLATING | +20 max shield |
| s-cap-30 | MEGA PLATING | +30 max shield |
| g-out-04 | SPARE CELL | +4 energy/s output |
| g-out-08 | FUSION TAP | +8 energy/s output |
| g-out-12 | PLASMA TAP | +12 energy/s output |
| g-cap-15 | BUFFER BANK | +15 energy capacity |
| g-cap-30 | DEEP CELL | +30 energy capacity |
| m-over-20 | OVERDRIVE | +20% mission speed |
| m-over-35 | AFTERBURNER | +35% mission speed |
| m-eff-50 | FRICTIONLESS HUB | Motor draws 50% less power |

## Situational cards

Apply only when a condition is met.

| ID | Name | Effect |
|----|------|--------|
| sit-demolisher | DEMOLISHER | +100% damage to blockers |
| sit-boss-hunter | BOSS HUNTER | +80% damage to bosses |
| sit-armor-pierce | ARMOR PIERCE | +60% damage to enemies above 50% HP |
| sit-swarm-killer | SWARM KILLER | Each kill deals 5 AoE damage to all others |
| sit-early-bird | EARLY BIRD | +40% damage in first 25% of mission |
| sit-final-push | FINAL PUSH | +40% damage in last 25% of mission |

## Meta-action cards

| ID | Name | Effect |
|----|------|--------|
| meta-windfall | WINDFALL | Gain 50 coins on pick (onPick) |
| meta-reroll-cache | REROLL CACHE | +2 rerolls on pick (onPick) |

## Synergy chains

### PIERCE chain (weapon)

Enables multi-target pierce builds. Enabler unlocks payoffs.

1. **PIERCE LANCE** (enabler) — +1 max targets; enables chain
2. **LEECH ROUNDS** (payoff) — restore 2 energy per enemy hit
3. **SHRAPNEL** (payoff) — each kill deals 10 AoE damage

### OVERCHARGE chain (weapon)

Every Nth shot is overcharged (2× damage). Enabler + two payoffs.

1. **OVERCHARGE** (enabler) — every 5th shot deals 2× damage
2. **CAPACITOR REFUND** (payoff) — overcharged shots cost 0 energy
3. **SUPERCHARGE** (payoff) — overcharged shots deal 3× instead of 2×

### RESONANCE chain (shield/generator)

Shield sync — links shield state to damage output.

1. **SHIELD SYNC** (enabler) — +30% weapon damage while shield > 0
2. **PULSE AMP** (payoff) — +50% shield per generator pulse
3. **PULSE NOVA** (payoff) — each generator pulse gives +5 energy

### BERSERKER chain (weapon)

Low-HP power spike. The player's hull degrading unlocks escalating bonuses.

1. **ADRENALINE** (enabler) — +50% weapon damage at hull < 30%
2. **SPITE** (payoff) — +25% weapon damage per shield break (stacks)
3. **FRENZY** (payoff) — 50% faster firing at hull < 30%

## Conditional / misc cards

| ID | Name | Effect |
|----|------|--------|
| cond-focus-fire | FOCUS FIRE | +40% damage with 1 enemy on screen |
| cond-full-charge | FULL CHARGE | +35% damage at max energy |
| cond-last-stand | LAST STAND | 2× damage at hull < 30% |
| cond-haywire | HAYWIRE | Shots hit a random enemy (not front-most) |
| cond-glass-cannon | GLASS CANNON | Shield capacity → 0; +60% damage |
| cond-bloodfire | BLOODFIRE | Each shot burns 1 hull HP; +100% damage |
| cond-volatile | VOLATILE CORE | Each generator pulse: 20% chance energy → 0; +80% generator output |
| cond-momentum | MOMENTUM | +10% damage per consecutive kill; resets on hull hit |
| cond-killcount | KILLCOUNT | +2% damage per total kill (stacks forever) |
| cond-swarm-sense | SWARM SENSE | +2 extra targets when 6+ enemies on screen |
| cond-desperate | DESPERATE FIRE | Pierce all enemies while shield = 0 |
| cond-no-shield | NO SHIELD | Remove all shield capacity; +50% damage |
| cond-leech-hull | LEECH HULL | Restore 3 hull HP per kill |
| cond-bounty | BOUNTY | Every 10 kills restore 20 shield |
| cond-drain-cycle | DRAIN CYCLE | Every 5 shots restore 15 shield |
| cond-windmill | WINDMILL | Every 3 wave clears: refill energy |
| cond-blood-money | BLOOD MONEY | Each coin earned: restore 1 energy |
| cond-phantom | PHANTOM SHOT | Every 4th shot costs 0 energy |
| cond-breaker | BREAKER BONUS | Killing a blocker grants +30 energy |
| cond-bounty-hunter | BOUNTY HUNTER | 2× coins from blocker kills |
| cond-boss-focus | BOSS FOCUS | +30% generator output while boss is alive |
| cond-pristine | PRISTINE HULL | +20% generator output at hull > 80% |
| cond-gambler | GAMBLER | Each shot deals 1 ± 0.8× (random factor) |

## GAMBLER and damage variance

GAMBLER's `shotRandomnessFraction` is independent of the new crit/miss system.
When damage variance is implemented:
- Miss → GAMBLER does not apply (no damage to randomise)
- Crit → GAMBLER applies to the already-multiplied crit damage
- Normal → GAMBLER applies as before
