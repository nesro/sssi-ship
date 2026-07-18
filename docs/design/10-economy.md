← [Design docs index](../../GAME_DESIGN.md) · [← Mission Progression](09-mission-progression.md)

# Coins & Economy

Coins are earned four ways:

1. **Per kill** — every enemy has a `coinReward`. Earned even on a failed run.
2. **Mission completion bonus** — flat reward for finishing. Lost on defeat.
3. **Star award** — coin bonus the first time each star is earned. Not repeatable.
4. **Daily Mission** — a once-per-day endless run (see
   [Mission Progression](09-mission-progression.md)), paid out at a fixed multiplier over the
   run's own kill-coin total. Deliberately the highest-yield source in the game, and the only
   one that scales with the player's *current* gear tier rather than being fixed per mission —
   see below.

Coins persist across sessions (localStorage). No coin decay.

Every module is sold at 100% of its coin cost. Switching to a different item costs only the
price difference (net cost model). The player can never permanently lose coins by
experimenting with gear. **Corrected 2026-07-18:** stars are never part of this exchange —
`starsRequired` is an earned-total threshold gate a high-tier item checks against, not
something the shop ever deducts or refunds (this line previously said "coin and star
cost," describing a spend/refund mechanic the shop code never implemented).

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

## Daily Mission payout (added 2026-07-17)

`DAILY_COIN_MULT = 4.0` (`v2/src/save/SaveManager.ts`) multiplies the run's raw kill-coin
score before it's deposited. Tuned against `pnpm sim -- --daily-seed 1 --runs 300 --strategy
greedy --loadout <tier>` so a starter-gear run (~700 coins) clearly beats a starter-gear m1
clear (~555 coins, including its completion bonus) — the confirmed "motivating" requirement —
while a maxed loadout nets **~11,600 coins in a single ~7-9 minute run**, more than a full
campaign playthrough's total income (~4,000-8,000 coins, above) in one sitting. This is
deliberate, not an oversight: the Daily Mission is explicitly meant to be *the* coin source
once the campaign is done and progress toward the ~100,000-coin completionist target has
slowed — see [Mission Progression](09-mission-progression.md) and
[Balance & Tuning](13-balance-and-tuning.md) for the difficulty curve that makes reaching
that tier require real gear, not just showing up.

---

Next: [Visuals & Audio](11-visuals-and-audio.md)
