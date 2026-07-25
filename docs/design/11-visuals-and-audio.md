← [Design docs index](../../GAME_DESIGN.md) · [← Coins & Economy](10-economy.md)

# Visuals & Audio

**Palette:** weapon = cyan, shield = blue, generator = amber, motor = magenta, hull/UI = white,
enemies = red/orange, background = near-black. HUD bar colors match the system they describe.

**Neon look ("lines that shine"):** baked glow via multi-pass `generateTexture()` (3–4 passes,
decreasing alpha) + `ADD` blend mode over a near-black background. Glowing outlines, weapon
fire trails, and stat bars all use this technique. Never PostFX per object. All visuals are
procedural — no PNG/SVG assets.

**Ship:** each type has a distinctly different silhouette. Current default: upward-pointing
triangle body with wing stubs; additive thruster particle emitter (amber, ~12/sec, 200 ms
lifespan); slow scale pulse (0.96–1.04) for heartbeat feel.

**Audio — procedural SFX + licensed music.** The **SFX** are synthesised at runtime in
`v2/src/audio/synthVoices.ts` (rendered into Phaser's audio cache by `synth.ts`'s
`buildGameSounds`) — the audible counterpart to the procedural textures, so no SFX file is
fetched or shipped. Voices: three laser zaps (per-weapon-kind detune/level, also reused
pitched for rear/side weapons), a subtle UI-click tick, a bell `ding` (card-pick confirm), a
kill explosion, a hull-collision impact, a shield-pulse shimmer, a boss-arrival alarm sting,
a rocket/boost whoosh, and a resolving victory jingle. Every SFX is tunable live in the
soundboard dev tool (`/soundboard.html`). The **music** stays the licensed track
("Swim below as Leviathans" by Fireproof Babies, CC BY — attribution required in the Credits
screen); it's loaded from a file (`preloadMusic` in BootScene, provisioned into
`public/audio/` by `tools/provision-audio.ts`). Persisted music + SFX mute toggles. See
`v2/docs/plans/generated-audio-and-richer-sprites.md`.

---

Next: [Architecture & Tooling](12-architecture-and-tooling.md)
