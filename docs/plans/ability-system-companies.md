# Ability System & Support Companies Redesign

## What this changes and why

Replaces the passive card system with a two-tier ability system built around energy
management as the core skill loop. The slot-machine feel of "pick the best of 3 random
stat buffs" is replaced by: (1) a shop-layer where buying equipment from a company unlocks
that company's ability pool, (2) mid-mission offers of *active* abilities that charge when
you toggle auto-fire off, and (3) passive abilities (traditional stat modifiers) as the
complementary second tier. The "helper ship" courier drone already in the game becomes the
company's delivery vessel — the narrative fits naturally. Design settled in grilling session
2026-06-26; no design decisions need re-litigating here.

## Design decisions confirmed

- **4 companies**: Nexus Armaments (weapon), Aegis Defense (shield), Quantum Power
  (generator), Comet Drive (motor). Each equipment purchase links to a company, which
  gates its ability pool for mid-mission offers.
- **Active abilities** sit in an ability bar (max 3 slots). Energy cost paid on activation.
  Charges via auto-fire-off energy accumulation. No cooldown on charge; per-ability
  cooldown (in ticks) after activation.
- **Passive abilities** still use RunModifiers (apply on pick, last the mission).
- **autoFireEnabled / autoShieldEnabled** are CoreState booleans; view sends toggle commands
  like supply taps. Deterministic — included in hash.
- **`CardDefinition` → `AbilityDefinition`** (rename + extend). `pickedCardIds` →
  `pickedAbilityIds`. `cardPool` → `abilityPool`. Old `cards.ts` data migrated.
- **`ActiveEffect`** becomes a discriminated union supporting: `damage-mult`, `invulnerable`,
  `generator-mult`, `fire-rate-mult`.

## Complexity analysis

- `tick.ts` orchestrates: O(1) toggle checks; O(A) ability cooldown decrement where A ≤ 3.
- `combat.ts` ability activation: O(1).
- `timeline.ts` support call fire: unchanged O(1); offer draws from filtered pool O(P)
  where P = ability pool size.
- `hashCoreState` in `replay.ts`: O(|CoreState fields|) — unchanged asymptote, +3 new fields.

## Files changed

| File | Change |
|------|--------|
| `src/core/types.ts` | Add CompanyId, AbilityDefinition, EquippedAbility; extend ActiveEffect; update CoreState |
| `src/data/companies.ts` | NEW — 4 company specs with color + equipment links |
| `src/data/abilities.ts` | NEW — 20 abilities (5/company, mix active/passive) |
| `src/data/items.ts` | Add `companyId` to each CatalogItem |
| `src/data/loadouts.ts` | Update imports (CardDefinition → AbilityDefinition) |
| `src/core/state.ts` | Add autoFireEnabled, autoShieldEnabled, equippedAbilities, pickedAbilityIds |
| `src/core/combat.ts` | Gate fireShipWeapon on autoFireEnabled; add activateAbility() |
| `src/core/energy.ts` | Gate pulseShield on autoShieldEnabled |
| `src/core/tick.ts` | Decrement ability cooldowns; import abilities |
| `src/core/replay.ts` | Include new CoreState fields in hash |
| `src/core/stats.ts` | Handle new ActiveEffect union kinds |
| `src/view/CombatScene.ts` | Ability bar UI, toggle buttons, update overlay |

## Test plan

- [x] autoFire=false → weapon does not fire → energy accumulates
- [x] autoShield=false → pulse does not fire → energy stays at capacity
- [x] activateAbility() drains correct energy, sets cooldown
- [x] passive ability picked → modifiers updated immediately (existing behavior preserved)
- [x] active ability activated → ActiveEffect added to state with correct duration
- [x] replay hash includes autoFireEnabled, autoShieldEnabled, equippedAbilities
- [x] all existing 100 tests still pass (core determinism unbroken — 141 total passing)

## File hygiene

No hardcoded paths or credentials in any file touched. `cards.ts` kept for reference;
`ALL_CARDS` export updated to re-export from `abilities.ts`.

## Checklist

**Design decisions**
- [x] Design decisions confirmed by user (2026-06-26 grilling session)
- [x] Test plan approved by user

**Guardrails**
- [x] No opt-out guards introduced (abilities are opt-in)
- [x] No throttle keys — abilities are player-triggered, not timer-triggered
- [x] Blast radius: autoFire=false mid-combat → ship stops shooting → player dies faster if they forget to re-enable. Intentional risk.
- [x] No swallowed exceptions

**Performance**
- [x] All new loops are O(A) where A ≤ 3 (ability bar size)
- [x] No DB/HTTP calls

**Readability**
- [x] AbilityDefinition is a clean extension of CardDefinition shape
- [x] toggle functions are one-liners in the view, boolean flips in core

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes with no new failures
