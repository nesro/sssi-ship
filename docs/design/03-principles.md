← [Design docs index](../../GAME_DESIGN.md) · [← Glossary](02-glossary.md)

# Game Philosophy / Principles

**The player is never stuck.** Every completed mission is always replayable for full coin
rewards. There is always an action that earns coins or advances progression. Dead ends are a
design failure.

**No single best build.** Subscriptions and weapons are two equally valid paths to success. A
player with weak weapons but strong subscriptions should clear missions. A player with great
weapons and the basic subscription should also clear missions. Every module's kinds (weapon,
rear weapon, side weapon, shield, generator, motor, ship) are **situational sidegrades, not a
tier ladder** — each kind costs the same coins and stars to reach a given level (see
[Shop & Modules](05-shop-and-modules.md)), so no kind is ever a strictly worse purchase than
another. The player is expected to switch kinds between missions to match the challenge. No
module is universally best.

**Experiment freely.** Everything in the shop can be sold for exactly 100% of what was paid —
coins and stars both. No depreciation, no penalty. The player is never punished for trying
something new.

**Allocate, don't accumulate.** The generator is a literal power budget. The best weapon on a
weak generator performs worse than a mid weapon on a healthy power margin. Manual toggles
(front weapon, rear weapon, shield recharge) let the player actively manage this budget
mid-combat.

**Slopes, not cliffs.** Every resource mechanic degrades gracefully. The brownout rule exists
because v1's binary "no energy = no firing" produced an unrecoverable death spiral. This
principle applies to every new resource mechanic.

**The simulator is the truth.** The headless simulator (`pnpm sim`) runs the same core as the
live game. Balance numbers produced by the simulator are exactly what players experience.

---

Next: [Screens & Layout](04-screens-and-layout.md)
