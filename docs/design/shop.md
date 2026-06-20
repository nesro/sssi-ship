# Shop Design

## Model: switchItem (own = equip)

The old dual own/equip system is gone. There is one action: **switch**.

`switchItem(save, itemId)`:
- `netCost = newItem.price - currentlyEquipped.price`
- Deducts `netCost` from coins (negative = refund)
- Immediately equips the new item
- Throws `Error` if `coins < netCost`

There is no ownership tracking (`ownedItemIds` removed in SaveData v3).
The player's equipped item IS their ownership.

## No gates, no locks

All items are always visible and purchaseable (if affordable). No star-gating
in the shop. No "unlock first, then equip" flow. The price difference is the
only gate.

## No sell button

Items cannot be sold. You can only switch: upward (costs) or downward (refunds
the difference). This avoids exploitable sell-back loops.

## Non-weapon items (shield, generator, motor)

One row per item. Status display:
- `EQUIPPED` (cyan) — currently active
- `−N⬤` (blue) — switching here gives a refund
- `N⬤` (amber) — costs N coins
- Dimmed if can't afford

Single SWITCH button in the action area. Shows cost or refund.

## Weapons: upgrade / downgrade within kind

Weapon items are `{kind}-{level}` (e.g. `pulse-1`, `pulse-2`, ...). The player
has exactly one weapon kind equipped at any level.

**Weapon rows**: one row per kind. Shows level dots (●●●○○) for the equipped
kind; all-hollow dots for unequipped kinds.

**Actions for equipped kind**: ▲ UPGRADE and ▼ DOWNGRADE buttons.
- UPGRADE: `switchItem(save, kind-N+1)` — costs `price[N+1] - price[N]`
- DOWNGRADE: `switchItem(save, kind-N-1)` — refunds `price[N] - price[N-1]`
- No downgrade button at Lv 1; no upgrade button at MAX_WEAPON_LEVEL.

**Actions for other kinds**: SWITCH button that switches to Lv 1 of that kind.
Net cost = `kind-1.price - currentWeapon.price` (can be a refund).

## Supplies

Separate buy/sell per charge. Not affected by switchItem.
- BUY: +1 charge, costs `pricePerCharge`
- SELL: -1 charge, refunds `pricePerCharge`
- Capped at `maxCharges`
- Charges auto-refill to owned count before each mission

## Live preview panel

The shop shows a live preview panel with the current loadout's stats and DPS.
Selecting an item updates the preview to show what would happen if switched.
Preview uses `prospectiveLoadout()` which hypothetically applies the selection
without mutating save.
