← [Design docs index](../../GAME_DESIGN.md) · [← Architecture & Tooling](12-architecture-and-tooling.md)

# Balance & Tuning

## 1-hour campaign target

The full campaign — tutorials + all seven main missions (m3b added 2026-07-15, see
[Mission Progression](09-mission-progression.md)) — should take a **focused first-time
player roughly 60 minutes** including shop time between missions. Breakdown:

| Phase | Content | Combat time | Shop / planning |
|-------|---------|-------------|-----------------|
| Tutorials | t1 – t4 | ~4 × 45 s = 3 min | ~2 min (forced loadout; nothing to buy) |
| Early sector | m1, m2 | ~3 + 5 = 8 min | ~4 min |
| Mid sector | m3, m3b, m4 | ~5 + 4 + 6 = 15 min | ~8 min |
| Late sector | m5, m6 | ~10 + 15 = 25 min | ~8 min |
| **Total** | | **~51 min combat** | **~22 min** |

Target total: **≈ 60–75 min** (some players faster, some slower; the shop time budget absorbs
most variance). This table is a rough per-mission mental model, not the authoritative
number — `pnpm campaign`'s own measured combat-time-to-clear-m6 (median ~31-38 min across
both archetypes as of 2026-07-15) already accounts for real retry/purchase behavior and
supersedes it when the two disagree. If the simulator shows average mission times drifting
above these targets, compress the timeline multiplier; if below, expand it.

## Clear-rate targets per mission

These are the acceptance criteria for a balanced build. Run `pnpm sim --mission <id> --runs 2000`
with the intended loadout (see `v2/src/data/loadouts.ts` for reference loadouts):

| Mission | Intended loadout | Target clear rate |
|---------|-----------------|-------------------|
| t1 – t4 | Forced (built in) | See note below — "clear rate" is no longer quite the right frame |
| m1 | Pulse Laser Lv1, starter modules | ≥ 85% |
| m2 | Pulse Laser Lv1, Barricade or Reflex Shield | ≥ 75% |
| m3 | Pulse Laser Lv2, Generator Lv2 | ≥ 65% |
| m3b | Pulse Laser Lv2, Reflex Shield Lv2, Generator Lv2 | ≥ 60% |
| m4 | Any Lv2 weapon + Lv2 shield + Lv2 generator | ≥ 55% |
| m5 | Lv3 weapon + full Lv2 set | ≥ 50% |
| m6 | Lv4+ weapon + Lv3 shield + Lv3 generator | ≥ 45% |

A clear rate that is too **high** (> 90% except tutorials) means the mission is trivially easy
and should be made harder. Too **low** means the player will hit a wall — adjust enemy HP,
coin economy, or enemy count before touching loadout stats.

**t1-t4 note:** since `completesOnDefeat` (see [Mission Progression](09-mission-progression.md))
makes a tutorial defeat pay the same reward as a victory, "clear rate" no longer maps directly
to player-facing success the way it does for m1-m6. Measured numbers as of 2026-07-10: **greedy
strategy is a literal 100.0%** (0/2000 losses) on all four; **random strategy plateaus at
~99.1-99.3%** on t4 specifically (t1-t3 are 100%), after two independent fix attempts (a
reactive supply-usage policy, an added support call) failed to close the residual further.
Whether that ~99% is acceptable, and whether it's still worth chasing now that a
tutorial "loss" is a valid completion anyway, is an open call — see
`docs/plans/tutorial-balance-and-doc-cleanup.md`.

## Two-tier player model, not smart-vs-dumb

The campaign simulator (`pnpm campaign`) models two purchase archetypes, **expert** and
**average** — confirmed by Tomáš via `/grill-me` (2026-07-11) as explicitly **not** a
smart-vs-dumb split. Both are genuinely competent players; a deliberately bad archetype was
rejected as wasted effort, since "even if you try to make them smart, real people will
outsmart this." They differ only in *optimization depth*:

- **Expert** exploits the "100% sell-back, always" rule (see
  [Shop & Modules](05-shop-and-modules.md)) to its logical conclusion: before
  every mission, it rebuilds toward the mathematically best affordable build for that
  specific mission — the tuned kind per system (`pnpm tune`'s
  `RECOMMENDED_KIND_PER_MISSION`) at that mission's own intended level, full kind-switching,
  no attachment to what it already owns. It also fires side weapons on high-value targets
  only and uses supplies with judgment (shield-restore only when actually low, damage-boost
  only when a real wave is on screen).
- **Average** is equally sensible but commits to the free starter kind (Pulse Laser / Wall /
  Torrent / Rush) for weapon/shield/generator/motor for the *entire* campaign and never
  switches — a completely normal way to play, not a mistake. It still fires side weapons (a
  simpler "enemies on screen" trigger) and still uses supplies (the instant a charge is
  available), just without expert's precision.

**Measured result (2026-07-11, `pnpm campaign --runs 500`):** both complete 100% of campaigns
— average committing to the starter kind never risks getting stuck (a real risk that was
checked: committing to some *other* kinds, like Ion Lance, would leave a campaign stuck at
m5's swarm gauntlet under the patience cap — starter-kind commitment was chosen specifically
because it's safe). Expert measurably outperforms average at the one real test in the game,
the m6 finale (mean retries 1.89 vs. 2.87) — full kind-switching plus using every equipped
slot properly earns a real, measurable edge there. Through m1-m5, both stay close to
frictionless (median hull ≈100% at clear for both), matching the finding below.

## Balance workflow

1. **After any change to enemy stats, weapon stats, or economy:** run
   `pnpm sim --mission <affected> --runs 2000` and verify the clear rate stays within target.
2. **After adding a new module or card:** run a `--sweep` across all missions to catch
   knock-on effects from new power budget.
3. **Coin economy check:** the player should be able to afford the "intended loadout" for each
   mission by the time they first reach it, assuming they replayed the previous mission once
   after failing. If the economy makes that impossible, either lower prices or increase kill
   rewards before touching mission difficulty.
4. **Do not balance by feel alone.** The simulator is the truth — if it says 30% clear rate,
   the mission is too hard regardless of whether a skilled player can beat it.
5. **Isolated per-mission clear rates are not enough — also check the campaign-sim retry
   distribution and margin at clear.** Fable's design review found that meeting every
   mission's own clear-rate target still produced a flat-then-cliff experience:
   `pnpm campaign` showed both purchase archetypes clearing m1-m5 in essentially one
   attempt each (mean retries ≈1.00), with all real challenge concentrated at m6. m2-m5
   were retuned 2026-07-10 (harder striker/swarm waves — see `v2/src/data/missions.ts`'s
   wave-count comments) and the isolated clear-rate targets in the table above still hold,
   but the retune did not move the campaign-sim retry means at all (still ≈1.00 through
   m1-m5).

   **Investigated further and resolved as accepted design, 2026-07-11** (not a bug to keep
   chasing): retry count is a threshold metric — it reads ~1.00 until per-attempt clear
   probability drops below roughly 90%, then jumps, so it structurally cannot show a
   gradual ramp. `pnpm campaign` now also reports **margin at clear** (median hull% and
   near-miss rate, hull < 20%, per mission — see `tools/campaign-simulate.ts`). This
   independently confirms the same shape rather than revealing hidden gradual tension:
   median hull sits at **100%** through m1-m5 for both archetypes, with near-miss rates
   only appearing at m6 (9-12%) — a well-equipped player's shield genuinely never comes
   under real pressure before the finale, by hull margin as much as by retry count. A much
   larger, cliff-aware difficulty swing (see the two known count-based cliffs noted in
   `missions.ts`) or a structural change to gear accumulation (soft reset, difficulty
   scaled to actual gear) could still close this gap, but per the "never stuck," "no single
   best build" principles (see [Principles](03-principles.md)) a frictionless m1-m5 for a
   well-optimized player, with the campaign's one real test saved for its final boss, is
   being accepted as the current design rather than fought further — revisit only if
   hands-on playtesting says the mid-campaign genuinely feels tensionless in practice, not
   just on paper.

   **Re-confirmed 2026-07-11 with the real expert/average archetypes** (not the
   informed-saver/impulse-spender pair the original finding used — see "Two-tier player
   model" above): building genuinely competent purchase logic (tuned kind-switching,
   real side-weapon/supply usage) didn't change this shape either. `expert` improves
   meaningfully at m6 (mean retries 2.61→1.89) but m1-m5 stay just as frictionless as
   before for both tiers. This is now good evidence the flat shape is a property of the
   *missions and economy*, not of under-modeled purchase policies — reconciling the
   "never grinding, always progressing" identity line with the desire for a felt
   difficulty ramp: **a campaign that never forces a grind through its first five
   missions and saves its one real test for the finale is the identity as written, not
   a gap in it.** If playtesting says the mid-campaign should have more texture, the
   right lever is mission/economy design (a deliberate, scoped change), not tuning the
   simulator's players to be worse.

6. **Weapon×generator spread in `pnpm tune`'s report is expected, but the underlying
   kind dominance behind it is only partially fixed — don't mistake this for a new
   regression.** `tune-report.md` ranks weapon and generator jointly (their
   energy/brownout interaction is real, per
   [Architecture & Tooling](12-architecture-and-tooling.md)), so a 60-100pp spread there is
   normal — it is not itself a "no dominant kind" violation the way a same-system spread
   would be. But the 2026-07-11 investigation that produced this framing (`nova`'s
   0%-clear trap, now fixed — see `items.ts`'s `WEAPON_BASE.nova` comment) also found the
   broader pattern underneath it: **ion outperforms every other front-weapon kind on
   nearly every mission**, and pulse (the calibration baseline) is the *worst* non-nova
   kind on m1/m2. Only nova's specific trap got a targeted fix; ion's broader edge was
   never addressed, and the recommended fix — a standing kind×mission balance-sweep
   artifact to catch this systemically instead of one crisis at a time — was never built.
   Flagging this here so it's found once, not rediscovered from a fresh `tune-report.md`
   every few sessions.

## Time-star thresholds

Time-star thresholds (T1–T4 per mission) are set by the simulator: run 2000 clears and use
the **10th, 25th, 50th, and 75th percentile** completion times as T4–T1 respectively. This
ensures the fastest quarter of players earn all four time-stars on a good run, while the
median player earns T2/T3. Recalibrate whenever mission timeline changes.

---

Next: [Status — What's Built vs What's Planned](14-status.md)
