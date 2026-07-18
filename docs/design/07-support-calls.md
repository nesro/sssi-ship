← [Design docs index](../../GAME_DESIGN.md) · [← Combat](06-combat.md)

# Support Calls

Support calls are scheduled in each mission's `supportCallTicks`. A bonus call is granted when
a blocker is killed. The Tactical motor path grants additional cards per call.

**Blocker hold-charge tiers (added 2026-07-18 to this doc — shipped, previously
undocumented).** A blocker's bonus-call payout scales with how long it stayed alive
under pressure before dying, not a flat one call per kill: 1 bonus call normally, 2 if
it held for ~6s (`HOLD_CHARGE_TIER_2_TICKS`), 3 if it held for ~14s
(`HOLD_CHARGE_TIER_3_TICKS`) — tiers, not a smooth curve, so the player gets a clear
"held long enough for the next tier" signal instead of a continuously scaling number
that's hard to read mid-combat (`core/combat.ts`'s `bonusCallsForHoldCharge`). Charge
only accrues while at least one other enemy is also alive on the conveyor (`tick.ts`'s
`accrueHoldCharge`) — a lone blocker with nothing else on the lane can't farm tiers by
just sitting there.

Each call offers **3 cards** drawn from the player's active subscription pools (union of all
owned subscriptions). The player picks 1, rerolls (limited per mission), or skips. Effects
last for the duration of the run.

**Balance target:** calls per mission and pool sizes must be tuned so that a subscription-heavy
player gets meaningful advantage without making weapon upgrades feel pointless. Pool sizes range
from 7 cards (Basic Lv1, widened 2026-07-10 — see `05-shop-and-modules.md`'s Subscriptions
section) to 35+ cards (Offensive Lv3). Exact balance via simulator sweeps.

## Active abilities

**Added 2026-07-18** (shipped but previously undocumented — this section only ever
described passive cards). A support call can also offer an **active ability** card
instead of a passive one — picking it fills one of up to **3 ability-bar slots** rather
than applying a passive modifier. Each active ability has its own energy cost and
cooldown (e.g. NEXUS OVERLOAD: ×2 damage for 5s, 40 energy, 5s cooldown; BARRAGE MODE:
×2 fire rate for 4s, 30 energy, 8s cooldown — see `v2/src/data/abilities.ts` for the
full roster). The player taps a ready ability bar slot mid-combat to trigger it
manually — it does nothing on its own until tapped, unlike a passive card's continuous
effect. Tapping a slot that's still on cooldown, or costs more energy than currently
available, is a no-op (`core/combat.ts`'s `activateAbility`).

## Synergy chains

Payoff cards are weight-suppressed until the enabler is picked in the same run:

| Chain | Enabler | Payoffs |
|-------|---------|---------|
| **Pierce** | PIERCE LANCE (+1 max targets) | LEECH ROUNDS (2 energy per hit), SHRAPNEL (10 AoE on kill) |
| **Overcharge** | OVERCHARGE (every 5th shot ×3 dmg) | CAPACITOR REFUND (overcharged shots free), SUPERCHARGE (×3→×4) |
| **Resonance** | SHIELD SYNC (+30% dmg while shield > 0) | PULSE AMP (+50% shield/pulse), PULSE NOVA (+5 energy/pulse) |
| **Berserker** | ADRENALINE (+50% dmg at hull < 30%) | SPITE (+25% dmg per shield break, stacks), FRENZY (×1.5 fire rate at hull < 30%) |

---

Next: [Enemies](08-enemies.md)
