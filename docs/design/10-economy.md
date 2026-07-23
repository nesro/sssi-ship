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

**Kind-unlock star gate (added 2026-07-19, extended to generator 2026-07-21).** Front
weapon, rear weapon, and generator each have a free starter pair plus kinds gated behind
stars even at level 1 — pulse/scatter free, ion 4★/nova 8★; grenade/flak free, arc
3★/cluster 5★/plasma 8★; torrent/surge free, reserve 3★/steady 5★
(`v2/src/data/items.ts`'s `WEAPON_KIND_UNLOCK_STARS`/`REAR_WEAPON_KIND_UNLOCK_STARS`/
`GENERATOR_KIND_UNLOCK_STARS`). Before the first of these, every kind shared one
price/star ladder with no kind-level gate at all, so once a player bought their
mandatory starter Lv1 weapon, every other kind's Lv1 was a free switch (same price, 0
stars) — no kind ever felt unlocked. The gate is a floor across each gated kind's whole
ladder (`max(sharedLadder, gate)`), not just level 1, since the shop's switch-cost
economy has no star check of its own — a level-1-only gate would be bypassable by
buying straight into a gated kind's higher level. Generator's free pair is deliberately
`torrent`/`surge`, not an arbitrary pick: `torrent` is `defaultSave()`'s real starter
generator, and `surge` is t1's ("Shield Basics") one sim-verified shop-fix — gating
either would strand a first-time, 0-star player. Shield/motor/side-weapon/ship remain
unaffected; neither has a "pick the right kind" puzzle attached to any tutorial the way
weapon (t2) and generator (t1) do.

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
