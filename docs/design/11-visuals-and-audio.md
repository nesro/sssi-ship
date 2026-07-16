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

**Audio:** looping music ("Swim below as Leviathans" by Fireproof Babies, CC BY 2.5 —
attribution required in Credits screen). SFX: LaserShot1–3, Rocket, Ding. Persisted mute
toggle.

---

Next: [Architecture & Tooling](12-architecture-and-tooling.md)
