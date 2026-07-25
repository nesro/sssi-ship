# Generated audio + richer sprites

Status: iterating. Two related view-layer goals — no `src/core/` changes, no determinism
impact. Worked in small verified passes; each pass ends green on
lint / lint:comments / build:dry / test / screenshot (0 failures, no page exceptions).

## Progress log

- **Goal 1 — DONE.** All SFX + music synthesised in `src/audio/synth.ts`
  (`buildGameSounds`), registered into Phaser's audio cache at boot; file loading and the
  `public/audio/` dependency removed. Verified: 6 buffers present, correct durations,
  non-silent, non-clipping (rocket clamped); 77/77 screenshots with zero page exceptions;
  the old missing-asset `HubScene` crash is now structurally impossible.
- **Goal 2 — in progress:**
  - Pass 1 (enemies) DONE — all 10 enemy kinds + boss carry layered internal detail
    (nested hulls, cores, rivets, ring notches, boss spokes/antennae) via module-scope
    painters + a new `radialTicks` helper. Dimensions unchanged (ENEMY_VISUAL_RADIUS
    coupling preserved). Verified in tank/blocker/turret/booster/boss shots.
  - Pass 2 (ships) DONE — 5 hulls refactored to module-scope painters and enriched with
    canopies, spines, panel/cargo ribs, reactor ring-bolts, missile-pod tips. 48×52 size
    and shared gun mounts preserved. Verified in shop ship tab + in-combat player ship.
  - Pass 3 (projectiles) DONE — pulse lasers gained white-hot cores + tip glints, ion
    got a cross-glint core, scatter gained trailing sub-pellets, nova gained a bright
    detonation core (+ a 3rd ring on nova2). Dimensions unchanged (bolt scaling preserved).
  - Pass 4 (audio breadth) DONE — added a dedicated kill `explosion` pop and a `victory`
    bell jingle (were both reusing `ding`); wired into SoundManager. 8 buffers now,
    all verified present / correct length / non-clipping, no page exceptions across the
    batch (kills + result scenes exercise the new sounds).
  - Pass 5 (music) DONE — enriched the loop (on-beat kick + half-beat sparkle line) and
    replaced the saw pad with a band-limited additive-sine pad, making the 8s loop
    genuinely seamless (seam gap 0.0076 < typical sample delta 0.0128, down from 0.116).
  - Pass 6 (starfield) DONE — extracted a shared `src/view/starfield.ts` used by Hub +
    Combat: colour-tinted stars (faint blue/cyan/amber/violet), 3 size tiers, and per-star
    twinkle (phase-advanced, ~40% animated). Both scenes wired; flat-white fields retired.
  - Pass 7 (enemy animation) DONE — every enemy now also idle-"breathes" (per-kind
    scale-pulse via an `enemyAnimSpec` lookup) on top of its rotation; kamikaze twitches
    fast, tank/blocker breathe slow. Cosmetic scale only, no core/collision impact.
  - Pass 8 (audio breadth + richness) DONE — laser attack-click transient for punch;
    dedicated shield-pulse `shimmer` (was reusing ding) and a boss-arrival `bossAlarm`
    sting (wired at the boss-spawn hook); music is now **stereo** (Haas circular-shift,
    still seamless). 10 buffers total, all verified, no page exceptions.
  - Pass 9 (kill bursts) DONE — burst particles now render as fading white-hot
    motion-streaks (over ADD blend) instead of flat squares.
  - Pass 10 (card-pick sound) DONE — rewired the now-orphaned `ding` to a card-pick
    confirmation chime (`Sound.select()`), an event that was previously silent.
  - Pass 11 (ship renderers) DONE — muzzle flash is now halo + white core + fire-direction
    streak + cross spark; generator core is a layered glow/body/white-hot-centre + two
    containment rings (both in `shipRenderers.ts`, shared with the shop preview).
  - Pass 12 (death shockwave) DONE — every enemy kill now emits an expanding additive ring
    (`spawnShockwave`) as its blast front, on top of the spark streaks.
  - Pass 13 (per-weapon fire character) DONE — `Sound.fire(weaponKind)` now detunes/levels
    the shared laser samples per weapon (ion deep, scatter light/quick, nova heavy boom,
    y2010 thin retro), wired from the live loadout.
  - Pass 14 (player-death drama) DONE — death sequence adds staged shockwaves and its
    burst dots are now additive circles that shrink as they fly, not flat rectangles.

## Round 3 (continue-to-100% goal)

- Pass 15 (enemy hit-flash) DONE — enemies flash solid white on taking damage
  (`flashEnemyHit`, self-clearing tint), added to the existing hit-detection hook.
- Pass 16 (ship hit-flash) DONE — player ship flashes red on hull damage (`flashShipHit`),
  complementing the pre-existing camera shake.
- Pass 17 (weapon-coloured muzzle flash) DONE — `MuzzleFlash` now carries a colour; front
  gun uses the weapon-kind hue, rear gun a warm amber (was always cyan).
- Pass 18 (rear-weapon audio character) DONE — `Sound.rearFire(kind)` detunes/levels per
  rear kind (grenade heavy, flak/arc quick, etc.), all below the front weapon.
- Pass 19 (victory jingle) DONE — arpeggio now resolves into a sustained full C-major
  chord (1.5s).
- Pass 20 (weapon shop icons) DONE — pulse/ion/nova icons gained hot muzzle tips / charged
  cores, consistent with their enriched projectiles.
- Pass 21 (side-weapon audio) DONE — `Sound.sideWeaponFire(kind)` gives focus/flechette/
  railgun/orbital distinct detune/level.
- Pass 22 (doc correctness) DONE — the Goal-1 switch to procedural audio removed the CC-BY
  "Leviathans" + freesound attribution obligation; updated `docs/design/11-visuals-and-audio.md`
  (the design SoT) to describe the procedural audio instead of the retired licensed assets.
- Pass 23 (music variety) DONE — extended the loop to a 16s / 16-beat melodic phrase (still
  stereo, still seamless: seam gap 0.0085) over the constant pad, reducing repetition.

- Pass 24 (damage-number juice) DONE — floating damage numbers now spawn with a quick
  overshoot scale-pop (`Back.easeOut`) before the fade.
- Pass 25 (UI tap feedback) DONE — `addTextButton` plays a soft click on every button, so
  hub/shop/menus feel responsive (one central wiring, all buttons).
- Pass 26 (equipment shop icons) DONE — shield/generator/motor icons each gained a bright
  focal accent (cores, flow dots, chevron tips), completing shop-icon coverage.

- Pass 27 (result-screen starfield) DONE — the post-mission summary was plain black; now
  shares the animated starfield backdrop for depth/consistency.
- Pass 28 (alpha-notice starfield) DONE — the every-launch dev-notice screen also gains the
  starfield, so every persistent scene (alpha/hub/combat/result) now shares the backdrop.

- Pass 29 (collision impact sound) DONE — new synthesised `impact` voice (heavy low thud +
  crunch, deeper/slower than the kill pop) wired to hull collisions, which were previously
  silent (only shake + sparks). 11 audio buffers now, all verified non-clipping.
- Pass 30 (collision shockwave) DONE — hull collisions now also emit an additive shockwave
  ring at the impact point, matching the kill/death blast-front language.

## Round 4 (user feedback: keep OG music, subtler click, dev consoles)

- **OG music restored** — the synthesised music loop is gone; music is once again the
  licensed track ("Swim below as Leviathans", CC BY), loaded from a file via
  `preloadMusic` (BootScene). SFX stay procedural. `tools/provision-audio.ts` copies the
  track from `../sounds/` into `public/audio/` on `predev`/`prebuild`, so the fresh-clone
  404/crash footgun is gone. `startMusic()` now also guards a missing track instead of
  throwing. Design doc §11 corrected; music attribution added to the Credits screen.
- **Subtle UI click** — button taps were an annoying bell (`ding`); added a dedicated,
  quiet `ui-click` tick voice and wired `addTextButton` to it. Card-pick keeps the `ding`.
- **Soundboard dev console** (`/soundboard.html`) — auditions every SFX and tunes it live:
  per-sound Play + gain/detune + character-param sliders, Play-all, OG-music preview, and
  an EXPORT-values JSON dump to feed tuned numbers back for baking.
- **Visuals gallery dev console** (`/gallery.html`) — bakes every texture via the real
  `buildGameTextures` and lays all 96 out in a labelled, scrollable/zoomable grid (wheel
  scroll, +/- zoom, R to spin) over the game's own near-black + ADD look.
- **Refactor** — SFX synthesis extracted to a pure, data-driven `src/audio/synthVoices.ts`
  (`SFX_SPECS`: key, seconds, seed, gain, tunable params + slider ranges, `fill`); `synth.ts`
  now just renders those into Phaser's cache, and the soundboard renders the same specs
  live. Dev pages are dev-only (not in the build input); registered as fallow entries.

## Round 5 (user feedback: enemy bolts + repetitive/harsh SFX)

- **Enemy missiles much more visible** — the incoming enemy bolt was a thin orange rect
  (glow 9×22 + core 5×13). Rebuilt as three additive layers — a wide soft glow (18×40),
  a bright coloured body (10×26), and a white-hot core (4×14) — brighter colour and a
  slightly slower 360ms travel, so shots read clearly against the starfield.
- **Repetitive / harsh SFX softened for a space vibe:**
  - Shield-recharge sound was firing on every small recharge step (many/sec). Now
    throttled to at most once per 1.4s (`SHIELD_SOUND_MIN_MS`; the ring visual still
    pulses each time), and the `shimmer` voice was reworked from a chirpy bell-gliss into a
    soft, airy upward swell at ~half the level (gain 0.4→0.25, play 0.4→0.22).
  - UI click reworked into a quiet, airy blip (sub-octave body, eased attack) and dropped
    further in level (play 0.3→0.18).
  - Laser fire's sharp attack-click transient cut (click 0.3→0.12) so rapid auto-fire is a
    smooth "pew", not a machine-gun clicking.
  All still tunable in the soundboard (`/soundboard.html`).

## Round 6 (in-game links to the dev boards)

The soundboard/gallery were standalone pages with no in-game entry. Added **♪ SOUNDBOARD**
and **▦ GALLERY** buttons to the hub's Settings → DEV TOOLS section (one side-by-side row,
RESET shifted down a pitch), each opening its page via `openExternalLink`. Guarded to dev
builds (`import.meta.env.DEV`) so they never appear in a shipped build where the pages 404.
Verified: renders without overlap, tap-audit clean (21 states), clicking opens the page.

## Round-2 status

All 14 passes green on test (763) / lint / lint:comments / build:dry / full screenshot
(77/77, no page exceptions) / fallow (no new dead code; only the pre-existing
`balance-report.json` unresolved imports remain). Sounds and visuals were each revisited
several times and made materially richer, per the round-2 goal.

## Notes / follow-ups

- Documented an orthogonal, pre-existing test-flakiness gap surfaced while running the
  batches: `combat-m6-boss` runs on a fresh random seed and intermittently dies before
  the boss spawns → ~50% full-batch failure on that one shot. See
  `../docs/known-issues.md` ("Open"). Not caused by this work (view/audio only never touch
  the core); real fix is a fixed seed for that shot.

## Goal 1 — Synthesize every sound at runtime (like textures)

Today all SFX + music are fetched files in `public/audio/` (`SoundManager.preloadAudio`).
That directory is `.gitignore`d and has no provisioning step, so a fresh clone 404s every
asset and `startMusic()` throws an uncaught error that kills `HubScene`. Mirror what
`src/view/textures.ts` does for visuals: **generate all audio procedurally** via the Web
Audio API and register the resulting `AudioBuffer`s into Phaser's audio cache under the
existing keys — then delete the file loading entirely.

- New `src/audio/synth.ts`: `buildGameSounds(scene)` fills `AudioBuffer`s (via the
  WebAudio `context`, same pattern as `bake()` filling a texture) and calls
  `scene.cache.audio.add(key, buffer)` for `laser1/2/3`, `ding`, `rocket`, `music-main`.
- Sounds to synth: 3 laser zaps (pitch/wave variants), a metallic `ding` bell, a `rocket`
  noise-whoosh, and a seamlessly-looping ambient `music-main` pad+arp.
- No `Math.random` (ESLint-enforced repo-wide) — use a small local seeded PRNG for noise.
- `BootScene`: drop `preloadAudio`, call `buildGameSounds` in `create()` before `scene.start`.
- Net wins: zero audio files to ship, no fresh-clone footgun, no missing-asset crash.

## Goal 2 — Make every sprite's visuals/animation more complex

Walk every procedural sprite in `textures.ts` (ships ×5, enemies ×10, boss, all
projectile/icon textures) and add detail: extra structural lines, cockpit/engine/core
accents, multi-ring/layered shapes. Then add **runtime animation** in the view layer
(rotation, pulse, thruster flicker, boss idle) where these sprites are drawn
(`CombatScene`/`combatEffects`), keeping the baked-glow + ADD-blend look and the fixed
logical sizes / gun-mount offsets that combat code depends on.

## Verification

`pnpm lint`, `pnpm lint:comments`, `pnpm build:dry`, `pnpm test`, then `pnpm screenshot`
(0 failures, no `[page error]`/`[page exception]` — the combat shots fire weapons, so a
broken synth/playback surfaces as a page exception exactly like the missing files did).
Visually diff key shots before/after for the sprite work.
