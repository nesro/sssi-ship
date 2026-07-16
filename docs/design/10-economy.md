← [Design docs index](../../GAME_DESIGN.md) · [← Mission Progression](09-mission-progression.md)

# Coins & Economy

Coins are earned three ways:

1. **Per kill** — every enemy has a `coinReward`. Earned even on a failed run.
2. **Mission completion bonus** — flat reward for finishing. Lost on defeat.
3. **Star award** — coin bonus the first time each star is earned. Not repeatable.

Coins persist across sessions (localStorage). No coin decay.

Every module is sold at 100% of its coin and star cost. Switching to a different item costs
only the price difference (net cost model). The player can never permanently lose coins by
experimenting with gear.

**Confirmed edge case (2026-07-09):** the refund/switch-cost model always uses the item's
*current listed price*, not what the player actually paid. This is a no-op in almost every case
(price paid == current price), but starter/default equipment was never actually purchased, so
unequipping it once nets its listed price in coins. Decided: keep this as a small, one-time,
bounded "welcome gift" — no per-item purchase-price ("cost basis") tracking. See
`v2/src/save/SaveManager.ts`'s `switchCost`/`unequipShield`/`unequipWeapon`.

**Price ladder must fit the campaign's real income (fixed 2026-07-10).** Fable's design review
found the shop's price ladder (up to 175,000 coins per system, some systems' top item costing
~15× more than a same-tier sidegrade) was anchored to a ~1,000,000-coin endgame budget, while
the campaign simulator (`pnpm campaign`) showed a real full playthrough earning roughly
4,000-8,000 coins total across all six missions. Owning one fully-maxed kind in every one of
the 7 shop systems plus every subscription at max level now costs **≈100,000 coins** — still an
aspirational completionist target above what one playthrough earns (by design — there's always
something to save toward), but within reach of a few campaign replays rather than off by two
orders of magnitude.

---

Next: [Visuals & Audio](11-visuals-and-audio.md)
