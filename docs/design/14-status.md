← [Design docs index](../../GAME_DESIGN.md) · [← Balance & Tuning](13-balance-and-tuning.md)

# What's Built vs What's Planned

## Built (as of 2026-07-01)

| Area | Status |
|------|--------|
| Deterministic core (conveyor, energy, brownout, blockers, timeline, replay + hash) | ✓ |
| Front weapon: 4 kinds × 5 levels; branching shields, generators, motors | ✓ |
| 5 ships, 3 reserve supply types | ✓ |
| 1 welcome mission, 4 tutorials, 6 main missions | ✓ |
| ~100 cards, 4 synergy chains | ✓ |
| Shop with live preview, branch item gates | ✓ |
| Support call card overlay, supply buttons, narrator typewriter bar | ✓ |
| Neon baked-glow textures, additive blend, starfield, thruster particles | ✓ |
| Audio: looping music + SFX + persisted mute | ✓ |
| Headless simulator CLI | ✓ |
| 100 passing unit tests including replay determinism | ✓ |
| Capacitor Android platform | ✓ (no on-device test yet) |

## Needs redesign or implementation

| Item | Notes |
|------|-------|
| **Landscape layout** | ✓ Implemented — 960×540, three-panel combat split, HubScene shop two-column layout |
| **Rear weapon** | ✓ Implemented — 5 kinds × 5 levels, auto-fire toggle, shop tab, save model |
| **Side weapons** | ✓ Implemented — 4 kinds × 5 levels, manual-fire button + per-mission charges, shop tab, save model, replay-recorded |
| **Subscriptions** | ✓ Implemented — 5 subscription types × 3 levels, shop tab, save model, card pool wired |
| **Motor toggles removed** | ✓ Done — motor is always-on, no toggle code exists |
| **Three manual toggles** | Front weapon, rear weapon, shield recharge as button-panel toggles |
| **Left-handed mode** | Panel swap setting not yet implemented |
| **Mission-completion shop gates** | ✓ Implemented — completion-gated, not star-gated (see Sequential mission unlock below); this row's original "to be replaced" plan was superseded, not carried out |
| **Stars as secondary currency (spend/refund)** | Not built and not currently planned — stars shipped as an earned-total *threshold gate* instead (`starsRequired`, never spent or refunded; see [Glossary](02-glossary.md)/[Shop & Modules](05-shop-and-modules.md)). Corrected 2026-07-18: this row previously read as an in-progress feature; several other docs had drifted to describe the never-built spend/refund model as already shipped — all fixed the same day. If a real star-spending economy is ever wanted, it needs its own plan (save-model changes, not just docs). |
| **Sequential mission unlock** | ✓ Implemented 2026-07-10 — completion-gated per [Mission Progression](09-mission-progression.md)'s `MISSION_UNLOCK_EDGES` graph (`v2/src/data/missions.ts`), stars never required |
| **Booster enemy** | New enemy type not yet in data or core |
| **Debuffer enemy** | Deferred to future update |
| **WelcomeScene** | Captain Nesro portrait + developer message + story intro — scene structure exists in v1 (`phaser/src/scenes/WelcomeScene.ts`); content not written yet |
| **Story content** | Developer message (2010 origin), Captain Nesro intro, story briefings — content tasks for Tomáš |
| **Settings / Credits scenes** | Settings implemented. Credits **✓ implemented 2026-07-17** — not a separate `Scene` class, a 5th `HubScene` nav panel (`buildCreditsContent()`) rendering the developer note moved out of Settings' right column (playtest feedback: "the message in settings should be somewhere else, maybe some credits menu") |
| **Onboarding / skip-tutorials prompt** | ✓ Implemented 2026-07-16, **redesigned 2026-07-17** (real-playtest feedback: the separate full-screen prompt "looked weird") — the standalone `OnboardingScene` is gone. Every save boots to `AlphaNoticeScene` (see below), which forwards straight to `HubScene`; the missions screen itself shows a one-time "skip tutorials" link (visible only while none of t1-t4 are completed) right where a new player's eye already lands, next to the always-unlocked, always-glowing t1 node. "Skip" still marks t1-t4 completed with zero coins, matching real-play unlock rules — same `skipTutorials()` mutator, just relocated. The one-time hub button tour still fires on a save's first-ever launch (`BootScene`), now decoupled from the tutorial question entirely rather than only via `OnboardingScene`'s hand-off. |
| **Hub button tour** | ✓ Implemented 2026-07-16 — a coach-mark overlay (`HubTour.ts`) highlights each of the hub's 4 main-menu buttons in turn with a caption (the 5th, CREDITS, isn't tour-covered — supplementary content, same as DAILY MISSION's node); shown once automatically right after onboarding, replayable any time via Settings' "HOW TO PLAY" button. Combat-panel tour (AUTO-FIRE/AUTO-SHIELD/BOOST/EXIT) deliberately deferred — t1-t4's own narrator content already explains those contextually (mission-start beats moved from the bottom bar to a blocking modal 2026-07-17; see below). Plan: `docs/plans/first-open-and-tutorial-tour.md` |
| **Alpha / dev-build notice screen** | ✓ Implemented 2026-07-17 (playtest feedback: "can we make a screen on the start that this is the dev version and have a button with reset progress here") — `AlphaNoticeScene`, shown on every launch (no save-flag gate, unlike the onboarding tour), sits between `BootScene` and `HubScene`. Explains the build is early/alpha and progress may reset, with its own two-tap RESET PROGRESS button (same pattern as Settings'). Real gameplay returns to `HubScene` directly and never pass back through this screen — see `v2/src/view/*.ts`'s `scene.start('HubScene', ...)` call sites. |
| **Tutorial mission-start narration: modal, not bottom bar** | ✓ Implemented 2026-07-17 (playtest feedback: "it takes cca 15 second until the first enemy hits the ship... I would also prefer if the game would pause and a popup window with narrator message would show up rather than the bottom screen") — all four tutorials' opening lines now use the same blocking `narratorEvents` modal `w0` already had (`v2/src/data/missions.ts`'s `T1-T4_NARRATOR_EVENTS`); the passive bottom-bar `NarratorBar` still carries `first-support-call` lines for t2/t3/t4 (t1 has no support calls). t1's guardian approach was also sped up (spawn `seconds(3)`→`seconds(1)`, speed `0.55`→`2.2`) so first collision now lands ~5.5s after the popup closes, down from ~15-19s. `pnpm pacing`'s new `SLOW_START` metric (first shot-fired-or-collision tick, flags >3s) tracks this going forward — t1/w0 still flag at ~5-5.5s, a known, accepted residual (see `docs/known-issues.md`). |
| **Mission pacing & fun polish** | 3 of 6 findings fixed 2026-07-15 (enemy-roster distribution, m1's monotone opening, t3 pacing regression). Boss anticlimax investigated and reverted — the data-only fix breaks other invariants, needs a real core-engine change. Fake time-stars still open — re-anchoring to motor tiers hit a real methodology blocker (see doc). t2/t4 length is a playtest-only call. Plan: `docs/plans/mission-fun-review.md` |
| **Daily Mission** | ✓ Implemented 2026-07-17 — once-per-day endless run, own gear, own galaxy node, coins-as-score (no stars). Generated as a normal finite `MissionSpec` from a date-derived seed (`v2/src/data/dailyMission.ts`) — zero core changes. See [Mission Progression](09-mission-progression.md), [Coins & Economy](10-economy.md), and [Balance & Tuning](13-balance-and-tuning.md)'s tuning log for the motor-timeline-inversion bug found and fixed via `pnpm sim -- --daily-seed` before the numeric tuning pass. |

## Known technical debt

| Item | Notes |
|------|-------|
| Ship renderer duplication | ✓ Resolved — shared logic lives in `src/view/shipRenderers.ts`, used by both `CombatScene.ts` and `ShopPreviewPanel.ts` |
| Balance sweep for time thresholds | ✓ Done — all of m1-m6 recalibrated 2026-07-10 from 2000-run percentile data against each mission's intended loadout |
| On-device Android smoke test | Hard exit criterion before Play submission |
| Manual playtest of m1/m3/m5 reshape | Simulator-verified only (0 flags) — nobody has played the 2026-07-10 aggression-tier reshape yet. `docs/plans/mission-design-and-testing.md` |
| Privacy policy, app icon, Play listing assets | Required for Play Console submission |
| Replay playback UI | Record exists; playback scene not built |

## Fable's 2026-07-10 design review findings

| Finding | Resolution |
|---------|-----------|
| nova-5 / warship-5 required 46★ against a real 44★ ceiling — unpurchasable | ✓ Fixed — both now require 26★ (see [Shop & Modules](05-shop-and-modules.md)'s shared price/star ladder) |
| Shop price ladder (~175,000 coin ceiling per system) vastly exceeds real campaign income (~4,000-8,000 coins/playthrough) | ✓ Fixed — ladder compressed ~10-20× to a ~100,000-coin completionist endgame (see [Coins & Economy](10-economy.md)) |
| Branching kinds were priced as a strict tier ladder (up to ~15× kind-to-kind), contradicting the "no single best build" principle | ✓ Fixed — every system's kinds now share one identical price/star ladder (see [Shop & Modules](05-shop-and-modules.md)) |
| Default early card pool (`sub-basic` Lv1) was 5 cards with no real draft variance | ✓ Fixed — widened to 7 cards 2026-07-10 (see [Shop & Modules](05-shop-and-modules.md)'s Subscriptions section) |
| Flat-then-cliff difficulty: isolated per-mission clear-rate targets met, but campaign-sim retries stayed ≈1.00 through m1-m5 with all challenge at m6 | Investigated further 2026-07-11 (`docs/plans/nova-weapon-and-campaign-tension-review.md`, Fable's review) — accepted as designed rather than kept as an open bug; see [Balance & Tuning](13-balance-and-tuning.md)'s balance workflow point 5 for the full resolution and the new margin-at-clear metric that confirms it |
| Nova (one of the front weapon's 4 kinds) cleared 0% on m1/m2/m3/m4 at its own intended level despite sharing the repriced ladder — a "trap" purchase, not a working sidegrade | ✓ Fixed 2026-07-11 (`docs/plans/nova-weapon-and-campaign-tension-review.md`) — rebalanced base damage/fire-rate/energy cost (see `items.ts`'s `WEAPON_BASE.nova` comment); now viable on m1/m2/m4/m5/m6, deliberately still weak on m3 (the hardest pure-blocker mission), mirroring ion's own accepted weakness on m5 |
| `pnpm tune`'s "no trap kind" invariant check flagged Overdrive motor at a 100pp clear-rate spread on m1-m5 — a free (0 coins, 0★), unmarked trap: its energy draw exceeded every generator's max output at every level, permanently locking the ship into max brownout with a shield that never pulses | ✓ Fixed 2026-07-11 (`docs/plans/overdrive-and-reserve-trap-fixes.md`, Fable's investigation) — Overdrive Lv1 now matches rush/sentinel/tactical's safe Lv1 stats (the existing pattern), scaling to a real speed/coin premium above Lv1 while staying below every generator's output; two new regression tests (`items.test.ts`) lock in both invariants. Reserve generator's blurb also rewritten — "Charge then unleash" recommended the exact heavy-weapon pairing the brownout punishes hardest (reserve+nova measured 0.0% clear) |

---

← Back to [Design docs index](../../GAME_DESIGN.md)
