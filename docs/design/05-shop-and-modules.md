← [Design docs index](../../GAME_DESIGN.md) · [← Screens & Layout](04-screens-and-layout.md)

# Modules (Ship Equipment)

## Shop rule: 100% sell-back, always

Every module — including subscriptions — can be sold for exactly what the player paid: coins
and stars both refunded in full. No depreciation, no exceptions. The player is always free to
try something new.

## Kinds are situational sidegrades, not tiers

Within every system (weapon, rear weapon, side weapon, shield, generator, motor, ship), every
kind shares one identical coin/star ladder — level 3 of any kind costs exactly the same as
level 3 of any other kind in that system. Only the combat stats differ (damage profile, energy
draw, shield capacity vs. regen, etc.), never the price. This was a deliberate 2026-07-10 fix:
kinds used to be priced as a strict escalating tier (the "best" kind costing up to ~15× the
baseline for the same level), which contradicted the "no single best build" philosophy (see
[Principles](03-principles.md)). Compressing to a shared ladder also cut the overall price
ceiling roughly 10-20× to fit the ~1-hour campaign's real coin income (see
[Coins & Economy](10-economy.md)).

## Shop kind-row badge

Each kind row (weapon type, shield path, generator path, etc.) shows a cost-hint badge on the
right side. The player always has some kind equipped — the badge answers "what does it cost to
switch to this kind right now?"

| Row state | Badge text |
|-----------|------------|
| Currently equipped | *(none — row is highlighted)* |
| Not equipped, costs coins (net after trade-in) | `switching costs N coins` |
| Not equipped, net cost is zero | `switching is free` |
| Not equipped, cheaper than current (net refund) | `switching returns N coins` |
| Not equipped, free starter (price 0, nothing equipped) | *(none)* |
| Locked by stars | `★N` |

## Ship

Ships are a **strategic choice matched to the mission**. The player is expected to switch ships
between missions; no ship is universally best. Each excels in specific situations.

Each ship type has **multiple upgrade levels**. Higher levels increase hull and strengthen the
passive. Every type and level has a **distinctly different silhouette** — not recolors.

| Ship | Character | Passive |
|------|-----------|---------|
| Interceptor | Low hull, high evasion | Enemies miss more often — good vs fast swarms |
| Salvager | Medium hull | Bonus coins from kills — good for farming runs |
| Tanker | High hull | Collision damage reduced — good vs kamikaze-heavy missions |
| Reactor | Medium hull, large energy cap | Generator capacity bonus — good for energy-hungry builds |
| Warship | Medium hull | Crits deal extra damage — good vs bosses and high-HP enemies |

Five levels each, all five kinds sharing one price/star ladder (see "Kinds are situational
sidegrades" above). Exact stat tables: `v2/src/data/items.ts`'s `SHIPS`.

## Front weapon

**Single-target, high damage.** Fires automatically at the front-most enemy. The front weapon
is the primary DPS tool — strong focused damage to cut through high-HP enemies and bosses.

Four kinds, five levels each:

| Kind | Character | Energy use |
|------|-----------|------------|
| Pulse Laser | Reliable, low cost — the baseline | Low |
| Ion Lance | Very heavy hits, slow fire rate | High |
| Scatter Beam | Pierces through N targets in a column | Medium |
| Nova Wave | Hits every enemy on the lane — lowest per-enemy damage | High |

All four kinds share one price/star ladder — leveling up nova costs exactly what leveling up
pulse costs. Prices and exact stats: see `v2/src/data/items.ts`. Shop unlock: by mission
completion (TBD mapping).

## Rear weapon

**AoE — hits multiple enemies at once.** Mounted on the back of the ship, fires sideways into
the queue at a fixed interval (toggled on/off, never disabled by low energy). Where the front
weapon picks off the strongest single target, the rear weapon clears clusters. Essential
against swarms and fodder floods; less useful vs single high-HP targets. Optional slot — no
starter is auto-equipped.

Five kinds, five levels each:

| Kind | Character |
|------|-----------|
| Grenade Launcher | Balanced mid-queue burst — the baseline |
| Cluster Bomb | Widest spread, lowest per-target damage |
| Flak Turret | Wide shrapnel spray, anti-swarm specialist |
| Arc Discharger | Electric chain between two enemies |
| Plasma Cannon | Slow charge, massive blast — punishes high-HP targets |

All five kinds share one price/star ladder. Prices and exact stats: see `v2/src/data/items.ts`.

## Side weapons

**Manual-fire, limited-ammo.** The player taps a button to consume one charge for an immediate
burst — unlike auto-firing front/rear weapons, side weapons require deliberate timing, saving
them for a blocker, a swarm burst, or a boss window. Charges are set by the equipped kind/level
and refill to full at the start of every mission. Optional slot — no starter is auto-equipped.

Four kinds, five levels each:

| Kind | Character |
|------|-----------|
| Focus Beam | Single massive hit to the front-most enemy — the baseline, most charges |
| Flechette Spread | Partial-AOE burst across a front cluster |
| Railgun | Devastating single hit, fewer charges — save it for a blocker or boss |
| Orbital Strike | True AOE, hits every enemy on screen — rarest charges, top tier |

All four kinds share one price/star ladder, most charges to fewest. Prices and exact stats:
see `v2/src/data/items.ts`.

## Shield

Four kinds, five levels each, sharing one price/star ladder — "Wall" is the free starter:

| Kind | Character |
|------|-----------|
| Wall | Thick plate — survives hits, slow recharge. The baseline. |
| Reflex | Thin plate, instant snap-back — loves fast pulses |
| Flux | Balanced capacity and pulse rate — works with anything |
| Bulwark | Extreme capacity, minimal regen — true tank armour |

Prices and exact stats: see `v2/src/data/items.ts`'s `SHIELD_BASE`.

## Generator

Four kinds, five levels each, sharing one price/star ladder — "Torrent" is the free starter:

| Kind | Character |
|------|-----------|
| Torrent | High output, small buffer — feeds fast-cycling weapons |
| Reserve | Vast tank, slow trickle — feeds efficient weapons |
| Steady | Reliable mid-range — pairs well with any loadout |
| Surge | Maximum output, tiny battery — ion and nova goldmine |

Prices and exact stats: see `v2/src/data/items.ts`'s `GENERATOR_BASE`.

## Motor

Always active — not toggleable. Controls the mission timeline speed. Four kinds, five levels
each, sharing one price/star ladder — "Rush" is the free starter:

| Kind | Character |
|------|-----------|
| Rush | Fast timeline, high draw — enemies arrive faster, more coins and time-stars per minute. The "go fast, get rich" build. |
| Sentinel | Slow timeline, very low energy draw — enemies crawl, room to think |
| Tactical | Normal speed, **extra card draws + rerolls per support call** — the "build a synergy, win through depth" build |
| Overdrive | Fastest timeline, heaviest draw — maximum coins/time-stars per minute for players who can feed it |

Prices and exact stats: see `v2/src/data/items.ts`'s `MOTOR_BASE`.

## Reserve supplies

Permanent shop purchases. Charges refill before every mission.

| Supply | Effect | Price/charge |
|--------|--------|--------------|
| Shield Boost | Restore shield instantly | 120 ⬤ |
| Energy Flush | Refill energy to full instantly | 150 ⬤ |
| Rage Protocol | Double damage for 5 seconds | 200 ⬤ |

## Subscriptions

**Player-facing name: "Dispatch Reinforcements"** (the actual in-game nav label,
`HubScene.ts`'s `NAV_ITEMS` — corrected 2026-07-15). "Subscriptions" below is the design
term for the underlying mechanic (multiple can be owned, add cards to the draw pool,
etc.) — the game never actually displayed "Subscriptions" as a shop tab, so the Play
Store IAP-naming risk an earlier review flagged doesn't apply to the shipped UI; only
these design docs used the word prominently. Individual subscription names (Basic,
Offensive, Defensive, High-risk, Accumulating) are unaffected either way.

Reached via **Dispatch Reinforcements**. Unlike all other modules, **multiple subscriptions
can be owned at once**. Each active subscription adds its card pool to the support call draw
(union of all owned subscriptions at their current levels). The draw pool **replaces** the old
flat pool — only cards from owned subscriptions are offered during support calls.

Every player permanently has the **Basic subscription** for free — it cannot be sold. The
player can never have zero active subscriptions. Additional subscriptions are purchased on top.

**Basic Lv1's pool is deliberately wide (7 cards, not the original 5).** Every support call for
the first stretch of the campaign draws only from Basic Lv1 until the player affords another
subscription, so its pool has to carry real draft variance on its own — a thin default pool
made the early game's most frequent decision (the card draft) a non-decision. Widened
2026-07-10; see `v2/src/data/subscriptions.ts` and `v2/src/data/cards.ts`'s `g-hull-02` /
`m-eco-01`.

Each subscription has a type and level (1–3). Higher level = more and stronger cards in the
pool. Level prices are cumulative (you pay Lv1 price to subscribe, then upgrade prices for Lv2
and Lv3). Selling a non-Basic subscription refunds 100% of all levels paid in one action.
Stars required only for Lv3 (except High-risk which gates Lv3 at 28★).

| ID | Name | Lv1 price | Lv2 upgrade | Lv3 upgrade | Star gate (Lv3) | Theme |
|----|------|-----------|-------------|-------------|-----------------|-------|
| sub-basic | Basic | free | 600⬤ | 1 200⬤ | 18★ | Generator, motor, meta utility |
| sub-offensive | Offensive | 350⬤ | 600⬤ | 1 000⬤ | 18★ | Weapon damage, fire rate, pierce, overcharge |
| sub-defensive | Defensive | 350⬤ | 600⬤ | 1 000⬤ | 18★ | Shield, hull, resonance chain |
| sub-risk | High-risk | 400⬤ | 700⬤ | 1 100⬤ | 28★ | Trade, trap, berserker chain |
| sub-accumulating | Accumulating | 350⬤ | 600⬤ | 1 000⬤ | 18★ | Kill stacks, momentum, economy |

Each card ID is assigned to exactly one subscription. Cards unlock additively by level: owning
Lv2 gives Lv1 + Lv2 cards. Implemented in `v2/src/data/subscriptions.ts`.

**Chain enablers moved to Lv1 (2026-07-15).** The Overcharge, Pierce, and Shield Sync chain
enablers (see [Support Calls](07-support-calls.md)'s synergy chain table) previously sat at
Lv2 (950 coins cumulative to reach) — against a full campaign's real income of 4,000-8,000
coins, that put them out of reach for most of a playthrough. Moved to Lv1 (350 coins);
payoff cards stay at Lv2 as the reward for further investment. Berserker's enabler
(Adrenaline) was already at Lv1, unchanged.

---

Next: [Combat](06-combat.md)
