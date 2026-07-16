← [Design docs index](../../GAME_DESIGN.md) · [← Combat](06-combat.md)

# Support Calls

Support calls are scheduled in each mission's `supportCallTicks`. A bonus call is granted when
a blocker is killed. The Tactical motor path grants additional cards per call.

Each call offers **3 cards** drawn from the player's active subscription pools (union of all
owned subscriptions). The player picks 1, rerolls (limited per mission), or skips. Effects
last for the duration of the run.

**Balance target:** calls per mission and pool sizes must be tuned so that a subscription-heavy
player gets meaningful advantage without making weapon upgrades feel pointless. Pool sizes range
from 7 cards (Basic Lv1, widened 2026-07-10 — see `05-shop-and-modules.md`'s Subscriptions
section) to 35+ cards (Offensive Lv3). Exact balance via simulator sweeps.

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
