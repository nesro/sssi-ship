# v2 Cards & Shop Expansion

## What this changes and why

The current card pool is 24 cards (15 flat boosts + 2 synergy chains). With 7–8 support
calls per 5-minute mission the pool exhausts fast and every run feels the same. Goal: expand
to ~100 cards across 11 distinct categories plus add branching shop paths so gear choices
create real build identity.

---

## Card categories (design-approved, not yet implemented)

### 1. Flat boosts (keep ~15, they're the safe floor for new players)
Already in codebase. Keep them but reduce their share of the pool.

### 2. Trigger — when X happens, Y fires once
React to game events. Strong in specific moments, invisible otherwise.

| id (proposed) | Name | Description |
|---|---|---|
| trig-shield-break-shot | SHATTERED CORE | When shield breaks: next shot deals ×4 damage |
| trig-shield-break-ghost | GHOST STEP | When shield breaks: invulnerable for 2 s |
| trig-shield-full-burst | REBOUND | When shield fully recharges: free burst of 3 shots |
| trig-hull-low-restore | LAST RITES | When hull drops below 20%: one-time full shield restore (once per mission) |
| trig-wave-clear-energy | KILL SURGE | On wave clear (0 enemies): energy refills instantly |
| trig-enemy-reach-aoe | IMPACT NOVA | When an enemy reaches the ship: 30 AoE damage to all |
| trig-first-kill-free | FIRST BLOOD | First kill of each wave: next 3 shots free |
| trig-blocker-die-shield | BREAKER BONUS | When a blocker dies: restore 15 shield |
| trig-boss-spawn-invuln | BRACE | When boss spawns: 3 s invulnerability |
| trig-support-call-boost | CALL SIGN | After each support call: +30% damage for 8 s |

### 3. Duration — active for N seconds
Temporary power states. Great tension when you know they're running.

| id | Name | Description |
|---|---|---|
| dur-indestructible | INDESTRUCTIBLE | After shield break: no hull damage for 3 s |
| dur-surge-post-call | SURGE MODE | After each support call: +50% damage for 8 s |
| dur-adrenaline | ADRENALINE | When taking hull damage: ×2 fire rate for 4 s |
| dur-overclock-gen | OVERCLOCK | Every 30 s: generator outputs ×3 for 6 s |
| dur-time-warp | TIME WARP | When blocker dies: all enemies 40% slower for 5 s |
| dur-phantom-shield | PHANTOM SHIELD | Every 40 s: invulnerable for 2 s |

### 4. Counter — every Nth event, something special
Creates rhythm and anticipation. Player starts counting.

| id | Name | Description |
|---|---|---|
| cnt-5th-shot | SNIPER CYCLE | Every 5th shot: ×5 damage, no energy cost |
| cnt-3rd-kill-shield | BOUNTY | Every 3rd kill: restore 10 shield |
| cnt-2nd-call-double | DOUBLE OFFER | Every 2nd support call: pick 2 cards |
| cnt-10th-pulse-nova | RESONANCE | Every 10th shield pulse: emit AoE shockwave (30 dmg) |
| cnt-5kills-energy | SALVAGE | Every 5 kills: +20 energy |
| cnt-blocker-delay | BREATHER | Every blocker killed: next wave delayed 4 s |
| cnt-50hull-free | PAIN BANK | Every 50 hull damage taken: next 5 shots free |
| cnt-4th-wave-refill | WINDMILL | Every 4th wave clear: energy refills completely |

### 5. Conditional — bonus while a state is true
Reward positioning or resource management.

| id | Name | Description |
|---|---|---|
| cond-max-energy | FULL CHARGE | While at max energy: +25% damage |
| cond-low-hull | LAST STAND | While hull < 30%: ×2 damage |
| cond-one-enemy | FOCUS FIRE | While only 1 enemy on screen: +60% damage |
| cond-many-enemies | SWARM SENSE | While 6+ enemies on screen: shots hit 3 targets |
| cond-high-hull | PRISTINE HULL | While hull > 80%: generator output +50% |
| cond-no-shield | DESPERATE FIRE | While no shield: shots pierce all enemies |
| cond-low-energy | BROWNOUT SURGE | While energy < 30%: fire rate ×1.5 |
| cond-full-shield | OVERCHARGED | While shield at max: each shot +20% damage |
| cond-boss-alive | BOSS FOCUS | While boss alive: generator output +80% |

### 6. Accumulate — grows stronger through the run
Starts small, becomes massive. Early pick = big late payoff.

| id | Name | Description |
|---|---|---|
| acc-kill-dmg | KILLCOUNT | Each kill this mission: +0.5% damage (no cap) |
| acc-shield-break-hull | SCAR TISSUE | Each shield break: +8 max hull permanently this run |
| acc-coins-gen | COIN ENGINE | Each 100 coins earned: +1 energy/s this mission |
| acc-momentum | MOMENTUM | Consecutive kills each add +3% damage; resets on hull hit |
| acc-cards-picked | SNOWBALL | Each card picked: +2% to all future card bonuses |
| acc-dmg-taken | SPITE | Each 10 hull damage taken: +1% permanent damage this mission |

### 7. Situational — strong in specific missions only
Excellent if you know what's coming. Mediocre otherwise.

| id | Name | Description |
|---|---|---|
| sit-blocker-dmg | DEMOLISHER | +100% damage to blocker enemies |
| sit-high-hp | ARMOR PIERCE | +60% damage to enemies above 50% HP |
| sit-swarm-aoe | SWARM KILLER | Kills explode for 5 AoE damage (useless vs single tanks) |
| sit-boss-dmg | BOSS HUNTER | +80% damage to boss enemies only |
| sit-endgame | ENDGAME | Damage multiplied by mission completion % |
| sit-early | EARLY BIRD | +40% damage before seconds(60) of timeline |
| sit-late | FINAL PUSH | +40% damage after 80% of timeline |

### 8. Trade — real power for a real cost (cost is visible)
Not traps — player can see the trade and decide if it fits their build.

| id | Name | Description |
|---|---|---|
| trd-glass-cannon | GLASS CANNON | +80% damage. Shield capacity → 0. |
| trd-bloodfire | BLOODFIRE | +50% fire rate. Each shot costs 1 hull HP extra. |
| trd-warp-drive | WARP DRIVE | Motor ×2 speed. Support calls 50% rarer. |
| trd-hungry-shield | HUNGRY SHIELD | Shield recharges ×2 faster. Shots cost 50% more energy. |
| trd-dead-mans | DEAD MAN'S SWITCH | On death: all enemies take 300 damage. You still die. |
| trd-volatile-gen | VOLATILE CORE | Generator output ×2. 5% chance per pulse to lose all energy. |
| trd-berserker | BERSERKER OATH | +60% damage. Cannot use supplies rest of mission. |

### 9. Trap — seems good, cost is hidden
Punishes greedy picks. Reward players who read carefully.

| id | Name | Description |
|---|---|---|
| trap-haywire | HAYWIRE | Shots target a random enemy, not the front one. Terrible with single-target. |
| trap-unstable | UNSTABLE ROUNDS | Shots deal 5–80 damage (same average). Kills blockers with bad rolls. |
| trap-entropy | ENTROPY | +60% damage. Fire interval ±40% random each shot. |
| trap-overclock-motor | OVERCLOCK ENGINE | Generator ×2 output. Motor draws ×3 power. |
| trap-warp-reckless | RECKLESS DRIVE | Motor ×2 speed. Each wave has 30% more enemies. |

### 10. Weird — changes how you think about the game
Makes a run memorable. Not objectively better, just different.

| id | Name | Description |
|---|---|---|
| weird-pacifist | PACIFIST | Each second without firing: +3 energy. Combos with ion's slow fire rate. |
| weird-echo | ECHO | The shot that kills an enemy fires again at the next target instantly. |
| weird-mirror | MIRROR | Shield absorbing a hit fires a retaliatory shot (no energy cost). |
| weird-leech-hull | LEECH HULL | Each kill restores 1 hull HP. Kills stop being free. |
| weird-gambler | GAMBLER | Each shot randomly deals 20% or 200% damage. Same energy cost. |
| weird-phantom | PHANTOM SHOT | One shot in every 8 costs 0 energy. You don't know which. |
| weird-void | VOID ROUNDS | Shots deal 0 damage but slow hit enemies by 60% for 3 s. |

### 11. Card meta — affect drafting itself
Rare. At most 4–5 in the whole pool.

| id | Name | Description |
|---|---|---|
| meta-windfall | WINDFALL | Next support call: pick 2 cards |
| meta-hindsight | HINDSIGHT | Trade one previously-picked card for 3 new choices (once per run) |
| meta-tutor | TUTOR | Next offer guaranteed includes a synergy chain card |
| meta-rerolls | REROLL CACHE | +3 rerolls this mission |

### 12. Economy — interact with the coin loop
Bridge mission and shop. Strong in long runs.

| id | Name | Description |
|---|---|---|
| eco-blood-money | BLOOD MONEY | Each kill coin also restores 1 energy |
| eco-jackpot | JACKPOT | Next wave drops ×3 coins |
| eco-coin-dmg | COIN ENGINE | Each 200 coins earned this mission: +5% damage |
| eco-greed | GREED | +50% coins from all kills. Generator output −25%. |
| eco-bounty-hunter | BOUNTY HUNTER | Coins from blockers/boss ×4 |

### Existing synergy chains (keep, add more)

**Pierce chain** (already in code):
- PIERCE LANCE → LEECH ROUNDS → SHRAPNEL

**Overcharge chain** (already in code):
- OVERCHARGE → CAPACITOR REFUND → SUPERCHARGE

**Proposed new chains:**
- **Shield Thorns**: MIRROR COAT (shield hit fires shot) → THORNS (shot deals 2× on shield hits) → REFLECT AMP (+50% reflected damage)
- **Generator Cascade**: WARM UP (first 5 s after pulse: +40% output) → CASCADE (each pulse increases next pulse amount) → RESONANCE PEAK (every 5th pulse: massive burst)
- **Berserker**: ADRENALINE (hull hit → fire rate boost) → BLOOD PRICE (fire rate boost now +100%) → FRENZY (hull hit → also restore 10 energy)
- **Kill Economy**: BLOOD MONEY → JACKPOT ROUND (every 10th kill drops 5× coins) → DEATH TAX (coins = energy = damage, all linked)

---

## Shop branching paths (design phase)

See design discussion in conversation. Decision needed before implementation.

### Concept: T-shaped paths instead of linear tiers
Each system has Tier 1 (free, starter) then branches into two distinct playstyle paths.
Cost is the same across both branches — difference is playstyle, not power level.

---

## Implementation status

**DONE (2026-06-17)**

- 100 cards across 13 categories (flat boosts, situational, conditional, counter, accumulate,
  milestone, trade, trap, economy, meta, pierce chain, overcharge chain, resonance chain, berserker chain)
- 30 new RunModifiers fields in `types.ts` covering all new mechanics
- New CoreState fields: `consecutiveKills`, `wavesClearedThisRun`
- `combat.ts` fully rewritten with conditional damage, situational damage, kill accounting
- `energy.ts` handles PRISTINE HULL / BOSS FOCUS / VOLATILE CORE / PULSE NOVA
- `timeline.ts` handles tactical motor bonus calls
- `state.ts` initializes new fields + motor bonus rerolls
- `items.ts`: branching paths for shield (Wall / Reflex), generator (Torrent / Reserve),
  motor (Rush / Tactical) — 12 branch items total with `requires` field
- `ShopScene.ts`: locked items rendered at low alpha with ⤷ connector; BUY blocked when locked

**CI**
- [x] `pnpm build:dry` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes (100/100)
