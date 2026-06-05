# Plan: Headless Balance Simulator

## What this changes and why

There is currently no way to verify whether a given set of enemy HP values, card
magnitudes, and shop costs produces a fair progression. Manual playtesting is too slow
and too subjective. This plan builds a pure-TypeScript headless simulator that runs
thousands of mission simulations per second — no Phaser, no DOM — and outputs clear
rates, HP distributions, and time statistics for any combination of loadout, mission,
and card-picking strategy. All future balance tuning (enemy counts, card magnitudes,
shop prices) will be validated against this tool before going into the game.

---

## Design decisions

| # | Decision | Chosen |
|---|----------|--------|
| 1 | Time model | Discrete ticks, 100 ms per step (fast; all events ≥ 300 ms) |
| 2 | Enemy targeting | Player shoots the lowest-HP active enemy (greedy kill) |
| 3 | Enemy fire model | Each enemy fires every `shootMs ± 20%` jitter |
| 4 | Dodge model | Each incoming shot has a `dodgeChance` based on energy ratio and dodge cost; probabilistic skip |
| 5 | Card draw | Uses real `CardManager.draw()` (same weighted pool) |
| 6 | Three strategies | `RandomStrategy`, `GreedyDamageStrategy`, `OptimalStrategy` |
| 7 | Output | Human-readable table + optional `--json` flag for programmatic use |
| 8 | Runtime | `npx tsx tools/simulate.ts` (tsx for zero-compile TS execution) |

---

## Target difficulty curve (confirmed)

| Mission | Random | Greedy | Optimal | Notes |
|---------|--------|--------|---------|-------|
| Tutorial | 85% | 90% | 95% | Intro only |
| M1 — no gear | 45% | 60% | 75% | First real challenge |
| M1 — basic gear | 65% | 80% | 90% | Grind pays off |
| M2 — M1 gear | 20% | 45% | 65% | Requires investment |
| M3 — full gear | 8% | 28% | 55% | Luck + skill required |
| M3 perfect (3★) | 3% | 12% | 35% | Endgame wall |

Luck impact (same loadout, best vs worst card draw): ±15–20 percentage points.
Skill gap (random vs optimal, M3): ~47 points — large and intentional.

---

## Simulator architecture

```
phaser/tools/
  simulate.ts              ← CLI entry: parses args, runs N sims, prints table
  sim/
    SimEngine.ts           ← main headless loop (~150 lines)
    SimTypes.ts            ← SimConfig, SimResult, SimEnemy interfaces
    SimCardManager.ts      ← wraps real CardManager; applies card to SimStats
    strategies/
      CardStrategy.ts      ← interface: pick(cards, stats, run) → CardDefinition
      RandomStrategy.ts    ← picks uniformly at random
      GreedyStrategy.ts    ← picks card with highest computed damage contribution
      OptimalStrategy.ts   ← synergy-aware: follows pre-defined priority tables
```

### SimEngine loop (pseudocode)

```typescript
while (time < MAX_TIME_MS && hullHp > 0 && !bossDead) {
  time += TICK_MS;
  spawnScheduled(waves, time, enemies);

  // Player fires
  if (time >= nextFireTime && enemies.length > 0) {
    if (energy.trySpend(stats.frontEnergyCost)) {
      const target = lowestHpEnemy(enemies);
      applyDamage(target, stats.frontDamage, run);  // handles overcharge, explosive
      if (target.hp <= 0) { killEnemy(target); }
    }
    nextFireTime = time + stats.frontFireMs;
  }

  // Enemy fire (each enemy)
  for (const e of enemies) {
    if (time >= e.nextShotTime) {
      const dodged = Math.random() < dodgeChance(stats, energy);
      if (!dodged) {
        const hullDmg = shields.absorbHit(SHOT_DAMAGE, energy);
        hullHp -= hullDmg;
      }
      e.nextShotTime = time + e.shootMs * (0.8 + Math.random() * 0.4);
    }
  }

  energy.update(TICK_MS);
  shields.update(TICK_MS, energy);

  checkLevelUp();  // draw 3 cards, strategy picks 1, apply
}
```

### OptimalStrategy priority tables

Pre-defined pick order per game state:
- If `explosive_rounds` in hand and `blast_radius` offered → pick `blast_radius`
- If energy ratio < 0.4 on average → prefer `energy_recovery`, `battery_boost`
- If hull < 50% → prefer `hull_armor`, `shield_surge`
- Else → prefer highest `statDelta.frontDamage` equivalent
- Fallback: `GreedyStrategy`

---

## CLI interface

```
Usage:
  npx tsx tools/simulate.ts [options]

Options:
  --mission   mission_1 | mission_2 | mission_3 | tutorial  (default: mission_1)
  --loadout   none | basic | full                           (default: none)
              none  = default save (no shop items)
              basic = laser_mk1 L1 + generator_mk1 L1
              full  = all items maxed + all talents
  --strategy  random | greedy | optimal | all               (default: all)
  --runs      number of simulated runs                      (default: 2000)
  --json      output JSON instead of table

Examples:
  npx tsx tools/simulate.ts --mission mission_1 --runs 5000
  npx tsx tools/simulate.ts --mission mission_3 --loadout full --strategy optimal
```

### Sample output

```
────────────────────────────────────────────────────────────────
  mission_1 | loadout: none | runs: 2000 per strategy
────────────────────────────────────────────────────────────────
  strategy   clear%   avg HP    avg time   3★ rate   avg cards
  random      47.3%   68 / 100  51.4 s     12.1%     3.2
  greedy      61.8%   74 / 100  48.8 s     21.4%     3.1
  optimal     76.2%   79 / 100  46.1 s     33.7%     3.0
────────────────────────────────────────────────────────────────
  luck spread (greedy): min HP 0, p25 51, p50 74, p75 91, max 100
```

---

## Complexity analysis

- 2000 runs × ~600 ticks (60 s / 100 ms) = 1.2M ticks per strategy
- Each tick: O(E) enemy iterations, E ≤ 12 active enemies
- Total: ~14M operations per strategy, all arithmetic — < 1 s on any modern machine
- No Phaser import — pure Node.js execution

---

## Files touched

| File | Change |
|------|--------|
| `tools/simulate.ts` | NEW — CLI entry |
| `tools/sim/SimEngine.ts` | NEW — headless loop |
| `tools/sim/SimTypes.ts` | NEW — types |
| `tools/sim/SimCardManager.ts` | NEW — wraps real CardManager |
| `tools/sim/strategies/*.ts` | NEW — 3 strategy files |
| `src/game/EnergyManager.ts` | Confirm no Phaser imports (already clean) |
| `src/game/ShieldSystem.ts` | Confirm no Phaser imports (already clean) |
| `package.json` | Add `"sim": "tsx tools/simulate.ts"` script; add `tsx` dev dep |

---

## Test plan

- [ ] `npm run sim` runs without error on default flags
- [ ] M1 no-gear random strategy clears in range 40–60%
- [ ] Greedy always ≥ Random clear rate for same config
- [ ] Optimal always ≥ Greedy clear rate for same config
- [ ] `--loadout full` pushes M1 clear rate ≥ 90% for all strategies
- [ ] `--json` output is valid parseable JSON
- [ ] Changing boss HP in `SimEngine.ts` MissionSpec shifts clear rate predictably
- [ ] EnergyManager and ShieldSystem import cleanly with no Phaser dependency

---

## Checklist

**Design decisions**
- [ ] Target difficulty table confirmed by user
- [ ] Three strategies approved

**Performance**
- [ ] 2000 runs < 5 s on CI machine

**Readability**
- [ ] SimEngine loop ≤ 150 lines; each concern in a named method
- [ ] MissionSpec data is a plain object, not imported from GameScene

**File hygiene**
- [ ] `tools/` does not import anything from Phaser
- [ ] All Phaser-only logic (sprite positions, tweens) stays in GameScene
