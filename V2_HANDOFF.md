# Nesro Nova v2 — Restart Handoff Document

**Read this entire document before writing any code.** It is the single source of truth
for the v2 rebuild. Every decision below was explicitly confirmed by Tomáš (the owner) in a
design interview on 2026-06-06. Do not re-litigate settled decisions; do ask when something
is genuinely not covered here.

---

## 1. What this is and why we're restarting

Nesro Nova is a mobile idle/roguelite space shooter, a spiritual remake of Tomáš's 2010
school project "SSSI Ship". A full v1 was built in `phaser/` — it works, but it accumulated
mechanics (auto-aim, auto-dodge, lateral movement, talent tree, daily missions) faster than
they could be polished, and the code grew harder to maintain than to rewrite.

**v2 is a fresh start in the `v2/` directory of this same repo.** Port *knowledge*, not
code: this document carries the design and the hard-won lessons; the old `phaser/` tree
stays in place as a read-only reference corpus until v2 ships.

**The goal: publish to Google Play as soon as possible** (closed-testing track, free, no
monetization), with a first version that is *really fun for about one hour of gameplay*.

**Code quality is the stated reason for the restart.** Small files, small functions,
readable names, strict types, tests from day one. When in doubt, simpler.

### Core design philosophy (canonical, from v1, unchanged)

> The player must never feel stuck. Every completed mission is always replayable for full
> coin rewards. There must always be an action that earns coins or advances progression.
> Dead ends are a design failure.

---

## 2. Non-negotiable architecture

These are constitutional. They exist because v1 violated them and paid for it.

### 2.1 Deterministic fixed-tick game core

- The entire game simulation runs in **pure TypeScript with zero Phaser imports**, advanced
  by a **fixed timestep** (10 ticks/sec, 100 ms — same cadence the v1 simulator validated).
- **All randomness flows through one seeded PRNG** (Mulberry32 — copy the algorithm from
  `phaser/src/utils/rng.ts`, it's 5 lines). `Math.random()` is forbidden inside the core.
- Phaser is a **view layer only**: it interpolates entity positions between ticks for
  smooth animation and forwards player input (card picks, boost taps) into the core as
  tick-stamped commands.
- **The balance simulator and the live game run the same core module.** Not a parallel
  approximation like v1's SimEngine — literally the same code, headless. Balance numbers
  can never lie again.

### 2.2 Replay files

A finished mission produces a tiny, exact replay record:

```ts
interface ReplayRecord {
  version:    number;
  missionId:  string;
  seed:       number;
  loadout:    LoadoutSnapshot;        // every equipped item + supplies at mission start
  cardPicks:  number[];               // index chosen at each support call (or -1 = skip)
  boostTaps:  { tick: number; slot: number }[];
  resultHash: string;                 // hash of final core state, for validation
}
```

Re-running the core with the same record reproduces the run exactly — that is the watch-replay
feature, and later, server-side validation (re-simulate, compare `resultHash`). Mission
replays are the **only** replay type in v1 (shop-session replay was considered and cut; the
campaign simulator covers "verify the whole game loop works").

### 2.3 Project layout

```
v2/
  src/
    core/        # pure deterministic simulation — no Phaser anywhere
    data/        # missions, cards, items, story lines (typed TS data files)
    view/        # Phaser scenes, rendering, HUD, input → command translation
    audio/       # sound manager (files live in /sounds at repo root)
  tools/         # simulator CLI (imports src/core directly)
  test/          # Vitest (or colocated *.test.ts — pick one, stay consistent)
```

Toolchain: **pnpm**, Vite, TypeScript strict, Vitest, **ESLint flat config from the first
commit**. Capacitor is initialized in **week 1** (not at the end), app id `com.nesro.nova`,
and the neon renderer must be smoke-tested on a real Android device early (see §6).

---

## 3. Game design specification

### 3.1 Combat: the conveyor

Maximal simplification, confirmed explicitly:

- **The ship does not move.** It sits at the left edge of a landscape screen.
- **Enemies arrive in a single-file line** (a conveyor) streaming from the right toward the
  ship. Each enemy is just `{distance, hp, shootTimer, kind}` — the game state is
  one-dimensional.
- The ship **auto-fires at the front-most enemy**. No aiming, no dodging, no targeting choice.
- Enemies **shoot back while descending the lane**, so shields matter even when winning.
- An enemy that **reaches the ship collides**: the enemy dies, the ship takes chunky hull
  damage through the shield (~3× a normal shot).
- **Blocker enemies** (`blocksConveyor: true`): tougher non-boss enemies that **pause the
  conveyor timeline** until killed. They are the DPS-check that prevents pure-speed builds
  from skipping content.
- Mission = a timeline of wave events ending in a boss (or survival window). Failure = hull
  reaches 0. The fail condition is legible: *if your DPS can't chew through the queue,
  enemies reach you and grind you down.*

### 3.2 The power budget (the heart of the game)

Tomáš's stated goal: *"I don't want the player to buy the best of everything. I want the
player to think about the whole ship functioning correctly."*

The mechanism: **the generator is a literal power budget.**

- Generator output: energy/sec.
- Every component draws from it: weapon energy-per-shot, shield energy-per-HP-regenerated,
  motor constant draw.
- **Brownout rule:** when energy runs low, the weapon **never fully stops** — below ~30%
  energy the fire interval stretches smoothly (up to ~2× as energy approaches zero). This is
  critical: v1's binary "no energy = no firing" created an unrecoverable death spiral with a
  ~60 ms balance cliff (see §8 lessons). Brownout turns the cliff into a slope a player can
  climb out of with a card pick or a boost tap.
- Consequence: the best gun on a weak generator performs *worse* than a mid gun on a healthy
  power margin. "Buy the best everything" is never optimal — you allocate.

### 3.3 Ship systems (four slots)

| System | What it does | Power relationship |
|---|---|---|
| **Weapon** | Damage, fire rate. Two families: **single-target** (high damage to front enemy) vs **AoE/pierce** (shot passes through first N enemies, less damage each, higher energy cost per shot) | draws per shot |
| **Shield** | HP pool in front of hull; regenerates | draws per HP regenerated |
| **Generator** | Energy output + capacity | produces |
| **Motor** | Scales the **mission wave timeline** — faster motor = waves arrive sooner = more overlap = more danger, but the mission completes faster (time-stars). Stalls at blockers. | constant draw |

The AoE-vs-single choice is a **shop loadout decision** (which gun you equip), balanced by
energy cost. Dense walls of fodder want pierce; a tanky elite wants focus. (A mid-fight
weapon toggle was considered and parked for v1.1.)

Motor design comes from Tomáš's own notes (`phaser/nesro_plane_notes.md`): fast motor on
easy levels to farm time-stars quickly, slow motor on hard levels to survive. Motor tiers
are two numbers each: `{timelineMultiplier, powerDraw}`. 2–3 tiers in v1.

### 3.4 Stars: benchmark families

Every mission carries **~7 stars** from benchmark families, all evaluated per run, and a run
can earn several at once:

- **Boss-by-time** ×3 tiers (e.g., kill boss by 2:00 / 1:30 / 1:00)
- **Hull-above** ×2 tiers (e.g., finish with ≥50% / ≥90% hull)
- **100% kills** ×1 (in tension with fast-motor builds that endure rather than kill)
- **Shield never broke** ×1

Stars are **never spent** (no talent tree in v1) — they only gate mission-tree edges.
Replays always pay full coins; new stars only on beating a previous best benchmark.

### 3.5 Economy

- **Stars** gate the mission tree. Total only, never decreases, never spent.
- **Coins** (from kills + mission completion, full reward on every replay) buy everything in
  the shop: weapons, shields, generators, motors, reserve supplies.

### 3.6 Support calls (the card system)

Cards arrive via **scheduled support calls** — there is **no XP, no level-ups** (v1's
kill-XP system is deleted; it double-rewarded DPS builds and made card pacing build-dependent).

- A helper ship flies by at **designed timeline points** (e.g., 0:20, 0:50, 1:20), plus one
  bonus call when a blocker dies. The helper ship *is* the card system — this is how
  "keep the helping ships" is honored, as one mechanic instead of two.
- Each call: pick 1 of 3 cards, reroll button (suggest 2 rerolls/mission, tunable), skippable.
- Fixed picks per mission = tractable balance; the simulator compares strategies on equal
  decision counts.
- Card effects last for the current mission only.

**Card pool (~20 cards):**
- ~14 flat boosts covering all four systems — including motor cards ("OVERDRIVE: +20%
  mission speed" is a spicy pick chasing a time-star).
- **Exactly 2 synergy chains** (v1's sim proved synergy cards are where the skill spread
  comes from — flat-boost-only pools collapse the optimal-vs-random gap to ~10 pp):
  - *Pierce chain:* enabler "shots pierce +1 enemy" → payoffs rewarding multi-hits
    (e.g., "each enemy hit restores 2 energy").
  - *Overcharge chain:* enabler "every 6th shot ×3 damage" → payoffs keyed to it
    (e.g., "overcharged shots refund their energy cost").
- Payoff cards are weight-suppressed (~15%) until their enabler is picked (v1 rule, kept).

### 3.7 Reserve supplies (active combat buttons)

Tomáš's answer to "card picks are passive": shop-purchased **active boosts** the player
fires mid-combat by tapping.

- Examples: "shield boost 10 s", "double damage for next 5 shots", "instant energy refill".
- **Permanent purchase, charges auto-refill every mission** (confirmed: NOT consumables —
  consumables cause hoarding paralysis and restock chores). Buy "Shield Boost ×3" once, own
  it forever, every mission starts with 3 charges, use-it-or-lose-it within the run.
- Coin sinks: more charge slots, new boost types, potency upgrades (10 s → 15 s).
- Boost taps are recorded in the replay (`{tick, slot}`).
- UI: 2–3 buttons in thumb reach on the dashboard.

### 3.8 The shop with live preview (star feature)

The shop preview is **a load calculator**, not just a stat sheet. When the player selects a
prospective purchase, show the ship with it hypothetically equipped and:

- net energy balance under sustained fire: "+1.4/s → indefinite sustain" or
  "−2.1/s → brownout at 24 s ⚠"
- DPS vs single target and vs a 3-deep queue (shows the pierce/single trade)
- mission timeline speed (motor)
- before → after rows with ▲/▼ deltas (v1's `ShipPreviewPanel` did this well — reference it)

This is the screen where "balance the whole ship" becomes visible. Build it early, not last.

### 3.9 Mission tree (~14 nodes, 2 sectors)

- **4 tutorial missions** (from Tomáš's notes, step 5 cut with the talent tree):
  1. Front gun only — learn generator/shield/motor basics by watching energy drain per shot.
  2. Support calls — an unkillable regenerating enemy until a support call delivers the
     damage boost that pushes you over the edge. Narrator explains support.
  3. AoE weapon + **shop unlocks** — player is guided to buy an AoE gun, which trivializes
     a fodder-wall level.
  4. **The power-budget lesson** — player is told to buy a better motor; the generator
     can't feed it; weapons barely fire (brownout made visible); a support generator card
     saves the run. Narrator explains the budget. This teaches the core mechanic as a story beat.
- **Sector 1:** 5 missions introducing mechanics one at a time (blockers, asteroid field
  variant, first boss). **Star-gate wall** (need N total stars). **Sector 2:** 4–5 missions
  combining mechanics with time-tiers that demand fast-motor builds.
- Mission length 60–120 s. One-hour fun target ≈ 25–35 runs: the fun comes from
  **re-running missions with retuned rigs to harvest more benchmark stars**, not from raw
  mission count. Endgame = speed-farming Sector 1 with endgame rigs (dual-use per Tomáš's notes).
- NavBar gates from v1 carry over in spirit: SHOP unlocks at tutorial 3, mission tree
  gates by stars.

### 3.10 Narrator

A single reusable **typewriter text bar** (styled to the neon HUD), ~20 scripted lines in
one data file (`data/story.ts`): the 4 tutorial missions, one line per sector unlock, one
line on first boss kill. No portraits, no branching, no voice. It is load-bearing for the
tutorial; it is not a story system.

---

## 4. Presentation

### 4.1 Orientation and layout

**Landscape, locked.** The conveyor runs **horizontally**: enemies stream in from the
right, the ship sits on the left. This gives 600+ px of visible queue — the player sees doom
approaching from far away. The remaining screen is the **cockpit dashboard**: live system
gauges (energy net flow, shield, hull, motor speed) on one side, reserve-supply buttons in
thumb reach on the other. The game's identity is "ship systems control room."

Per Tomáš's notes: key stats are **always visible** during combat (weapon DPS, generator
flow, motor speed), and the **pause screen shows deep detail** (enemy HP/damage, wave
progress, current card effects). The pause panel doubles as the debugging/inspection tool.

### 4.2 Sharp text (v1 bug, root-caused)

v1 rendered at a fixed 800×480 logical canvas and `Phaser.Scale.FIT` upscaled it — blurry on
every high-DPI screen. v2 must render at native resolution:

```
width: logicalW * devicePixelRatio, height: logicalH * devicePixelRatio,
zoom: 1 / devicePixelRatio, roundPixels: true
```

Plus a crisp monospace font at integer pixel sizes. Verify sharpness on device in week 1.

### 4.3 Neon look ("lots of thin lines with neon glow that move fast")

**Baked glow + additive blending** — NOT per-object PostFX glow (a render pass per object
melts mid-tier Android WebViews exactly when the screen is busiest):

- Paint glow into each texture once at startup: draw each line 3–4× with increasing
  thickness and decreasing alpha (`generateTexture()` pipeline, as v1 did).
- Every combat sprite uses `ADD` blend mode over a near-black background — overlapping
  lights sum to white-hot, which *is* the neon look, and it's free on GPUs.
- Fast movement → trails via ghost sprites or one `Graphics` ribbon per mover.
- Optional polish, behind a settings toggle and tested on a real device: **one** camera-level
  bloom pass (single pass regardless of object count).
- All visuals remain procedural — no image assets.

**Palette** (system-coded, so HUD stats color-match the ship part they describe):
weapon **cyan**, shield **blue**, generator **amber**, motor **magenta**, enemies
**red/orange**, background near-black.

### 4.4 Audio

Real files already exist in `/sounds` at the repo root — use them, don't synthesize:

- SFX: `LaserShot1–3`, `Rocket`, `Ding` (.mp3 + .ogg pairs).
- Music: **"Swim below as Leviathans" by Fireproof Babies** (`Leviathan.ogg/.mp3`),
  **CC BY 2.5, ccmixter.org — attribution is legally required**: keep the credit block
  (already written in v1's `WelcomeScene.ts` `addCredits()`) in the v2 credits screen.
- Add a mute button. Cover at minimum: laser, hit, shield break, brownout warning, card
  pick, boss death, star earned.

---

## 5. Tooling (confirmed scope)

1. **Simulator CLI** (`v2/tools/`) — imports the real core. Three subcommands, all proven
   in v1 (reference `phaser/tools/simulate.ts`):
   - **`balance:ci`** — runs every mission × strategy, checks against target bands,
     **expressed in star yields per benchmark family**, not just clear rate. Exits 1 out of
     band. Run before every merge.
   - **`--sweep param --range min:max:step`** — vary any spec parameter, print the
     star/clear table per step, mark rows that hit CI targets. This is how missions are
     tuned — v1's M1–M3 were each tuned in minutes from sweep tables.
   - **`campaign`** — headless full-progression run (tutorial → shop purchases → sectors)
     per strategy; reports grind time, where stars stall, runs-to-complete. **This is the
     instrument for "really fun for ~1 hour"** — target: optimal strategy completes the
     tree in 45–75 min of simulated mission time.
   - Strategies: random / greedy / optimal (port the *concepts* from
     `phaser/tools/sim/strategies/`), each crossed with a boost-usage policy (never / smart).
2. **Graphics workbench** — a dev-only Phaser scene rendering ship/enemies/lasers/explosions
   on a loop with on-screen sliders for every neon parameter (glow layers, alpha, trail
   length, animation speed) and a "copy values" button emitting the constants block. The
   only GUI tool worth building; graphics can't be tuned headlessly.
3. **Missions and cards are typed TS data files** — no GUI editor (v1's `editor/index.html`
   is dead). The simulator is the mission editor.
4. **Pause panel + F1-style debug overlay** for live inspection.

---

## 6. Google Play (the actual goal)

- Tomáš **already has a Play developer account**. v1 release is **free, no ads, no IAP** —
  keeps the data-safety form and content rating trivial ("no data collected"; the game is
  fully offline, localStorage saves).
- Package id: **`com.nesro.nova`** — immutable forever once uploaded; confirmed.
- App name: **Nesro Nova**.
- **Closed testing is the WIP release channel.** Note: personal accounts registered after
  Nov 2023 must run a closed test with 12+ testers for 14 continuous days before production
  access — check whether his account predates this; either way closed testing is the plan.
- Use **Play App Signing** (Google holds the release key). Keep the upload keystore backed up.
- A one-page privacy policy URL is required even for offline games — a static GitHub Pages
  page ("no data collected") suffices.
- **Capacitor in week 1:** `pnpm build` → `npx cap sync android` → Android Studio →
  signed AAB → Play Console internal/closed track. Smoke-test the additive-blend renderer
  on a real device before building the whole visual layer on it.

---

## 7. Explicitly cut from v1 (do not rebuild these)

| Cut | Reason |
|---|---|
| Talent tree (all 21 nodes, respec, spendable stars) | v1 scope decision; stars become pure gates |
| Auto-aim, auto-dodge, lateral movement | ship is stationary |
| Kill-XP / level-up card system | replaced by scheduled support calls |
| Side weapon buttons (spread/beam L/R slots) | replaced by reserve supplies |
| Daily missions | post-launch candidate |
| Shop-session replay | covered by campaign simulator |
| `editor/index.html` GUI editor | simulator + data files instead |
| Per-object PostFX glow | baked glow + additive (perf) |
| Mid-fight weapon toggle | parked for v1.1 |

---

## 8. Lessons from v1 (paid for in days of work — do not relearn)

1. **The energy death spiral is real.** Binary "can't afford shot = don't fire" produced an
   unrecoverable spiral with a ~60 ms cliff in boss fire rate between "everyone wins" and
   "everyone dies". The brownout rule (§3.2) exists specifically to fix this. Design every
   resource mechanic as a slope, never a cliff.
2. **Strategy spread comes from synergy chains, not flat boosts.** With only stat-delta
   cards, optimal vs random collapses to ~10 pp; with enabler→payoff chains it reaches
   ~20 pp. The spread is your measurement of "does skill matter" — protect the two chains.
3. **A simulator that approximates the game lies.** v1's SimEngine drifted from GameScene
   (hardcoded chain level, unmodeled AoE) and produced misleading balance data until fixed.
   v2's shared-core rule (§2.1) makes this class of bug impossible.
4. **Sweep tables beat guess-and-check.** Tuning by editing a value and re-running wastes
   hours; `--sweep` found correct boss HP for three missions in minutes each.
5. **Balance targets must be achievable before they're targets.** v1's original M3 targets
   (8/28/55%) demanded a 47 pp spread when mechanics could deliver ~20 pp. Measure the
   achievable spread first (sweep), then set bands inside it.
6. **Luck spread is ±15–20 pp** between best and worst card draws at equal skill — keep CI
   bands at least that wide, and use ≥1000 runs per cell (~3 pp noise).
7. **Blurry text** was `Scale.FIT` upscaling a small canvas (§4.2). Fixed by dpr-sized canvas.
8. **Tick determinism enables everything** — replays, validation, CI, campaign sim. v1's
   sim already ran 100 ms ticks successfully; keep that cadence.

---

## 9. Reference reading (old tree, read-only)

| Path | What it holds |
|---|---|
| `phaser/nesro_plane_notes.md` | **Tomáš's raw design notes — the motor/speedrun/benchmark-stars vision and the 5-step tutorial. Read first.** |
| `phaser/docs/DESIGN_NOTES.md` | v1 design decisions and card-pool checklist |
| `phaser/docs/plans/sssi-ship-mobile-redesign.md` | the original full design spec |
| `phaser/CLAUDE.md` | v1 orientation, final balance tables |
| `phaser/src/utils/rng.ts` | Mulberry32 — copy verbatim |
| `phaser/src/game/computeStats.ts` | stat-pipeline shape worth imitating |
| `phaser/src/ui/ShipPreviewPanel.ts` | the live shop preview v1 got right |
| `phaser/tools/simulate.ts` | CI + sweep CLI patterns to port |
| `phaser/src/scenes/WelcomeScene.ts` | credits block with required music attribution |
| `/sounds/*` | all audio assets |

---

## 10. Suggested build order

1. **Week 1 — skeleton + proof of risk:** repo scaffolding (`v2/`, pnpm, Vite, TS strict,
   ESLint, Vitest), Capacitor init (`com.nesro.nova`), deterministic core with conveyor +
   energy budget + brownout (tested), minimal Phaser view, **neon additive renderer
   smoke-tested on a real Android phone**, dpr-sharp text verified.
2. **Week 2 — the loop:** support calls + card pool, reserve supplies, benchmark stars,
   one real mission tuned via sweep, replay record + watch-replay.
3. **Week 3 — the meta:** shop with load-calculator preview, mission tree UI, motor tiers,
   blockers, Sector 1 missions, tutorial 1–4 + narrator bar.
4. **Week 4 — fun-tuning + ship:** campaign simulator, balance:ci green across the tree,
   Sector 2, audio wiring, credits, signed AAB, closed-testing upload.

Definition of done for v1: a stranger installs from the closed track, plays ~1 hour,
completes Sector 1, hits the star wall, retunes their rig in the shop, and gets through —
without ever being stuck, confused, or at 25 fps.
