# Nesro Nova v2 — Design Decisions & Work Backlog

## Decisions settled (implement any time)

### Shop
- [x] Drop EXPLORE nav tab and all galaxy animation code from HubScene.ts
- [x] Shop tabs: replace abbreviations — WPN→WEAPON, SHD→SHIELD, GEN→GENERATOR, MTR→MOTOR, SUP→SUPPLIES (vertical text, rotated -90°)
- [x] Shop stat labels: remove abbreviated suffixes (HUL/SHD/NRG) — now HULL/SHIELD/ENERGY, rotated vertically along each bar
- [x] Increase global text size — main menu 18→22, HUD values 7→9
- [x] Remove SKIP button on support call overlay in CombatScene
- [x] Support call overlay: add a distinct icon per card type (neon glow circle + system letter W/S/G/M, ADD blend)
- [x] Mission enemy density: t1 doubled guardians (1+1+2 → 2+2+3); m1 wave spacing 16s→10s so screen never empties
- [x] Shop supplies/boosts not visible in gameplay HUD — SupplyButtons now always shows "BOOST" header + "—" placeholder when no supplies loaded
- [x] Shop redesign: remove ownedItemIds; single `switchItem` (pay price diff, auto-equip); no sell button
- [x] Shop weapons: ▲ UPGRADE / ▼ DOWNGRADE buttons when same kind equipped; switching kinds → Lv1 of new kind

### Damage & enemies
- [x] Damage variance system: critChance / missChance / critMult per spec; rolled per-target via rollShotOutcome()
- [x] New enemy types: TURRET (speed 0, blocksConveyor, high fire rate) and KAMIKAZE (speed 2.8, high shotDamage)
- [x] Turret/Kamikaze added to m6 (Leviathan) events

### Dev tooling
- [x] Dev mode toggle in Settings; ADD 999999 COINS button shown only when devMode is on

---

## Pending — need implementation (decisions confirmed)

- [x] **#4 Remove ▶ arrow from selected items in shop** — selection shown by row background + cyan text color only
  - Affects: HubScene.ts lines 453, 531–532; ShopScene.ts lines 225, 312
  - Decision: remove `▶` prefix entirely; selected row already has a background highlight

- [x] **#6 Rename main menu nav labels** — MISSIONS→EXPLORE NEARBY SPACE, SHOP→SHIP CONFIGURATION (button + panel title)

- [x] **#3 Weapon kind switch: keep same level (or max affordable)**
  - Defaults to same level as currently equipped weapon
  - Steps down to highest affordable level; greys row if can't afford even Lv1
  - Decision: can't-afford-Lv1 → row greyed/non-interactive (option A)

- [x] **#2 Remove vertical text in shop** — removed `.setAngle(-90)` from tab labels; 82px tab width fits horizontal text at font 8

---

## Pending — needs implementation (decisions confirmed)

- [x] **#1 Ship type in shop** — see `docs/plans/ship-slot.md`
- [x] **#5 Welcome mission + branching** — see `docs/plans/welcome-mission.md`
