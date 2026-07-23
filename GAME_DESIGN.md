# Nesro Nova — Game Design Document

> Single source of truth as of 2026-07-01, last restructured 2026-07-15. Supersedes all docs in
> `docs/design/` from before this restructure, `V2_HANDOFF.md`, and `v3_docs.md` where they
> conflict. All implemented values are drawn from `v2/src/`.

Nesro Nova is a mobile arcade roguelite space shooter for Google Play (`com.nesro.nova`), free,
offline, no ads or IAP. The player builds a ship from modules in a persistent shop, then runs
30–360-second missions where the ship fights automatically. During combat the player manages
energy by toggling modules, fires side weapons manually, and picks cards offered by support
ships. The goal is to complete a ~1-hour campaign (one sector, boss finish) by tuning the
loadout between runs — never grinding, always progressing.

**Corrected 2026-07-18** to match [Game Identity](docs/design/01-identity.md) (the
authority on this) verbatim — this intro had drifted to say "idle/roguelite" (dropped
2026-07-15: no idle/away-progression mechanics exist) and "30–300-second" (widened to
30–360s on 2026-07-15 once real mission durations, m3/m4 specifically, were measured
against it).

This file used to be one 800+ line document; it's now an index. Each topic below is its own
short file in `docs/design/` — read the ones relevant to what you're working on, not all of
them at once.

## Contents

1. [Game Identity](docs/design/01-identity.md) — the one-paragraph pitch, platform
2. [Glossary](docs/design/02-glossary.md) — every game term defined in one place
3. [Principles](docs/design/03-principles.md) — the design philosophy every decision is checked against
4. [Screens & Layout](docs/design/04-screens-and-layout.md) — canvas, panels, scenes, first-launch flow
5. [Shop & Modules](docs/design/05-shop-and-modules.md) — ship, weapons, shield, generator, motor, supplies, subscriptions
6. [Combat](docs/design/06-combat.md) — the tick loop, collision, manual controls
7. [Support Calls](docs/design/07-support-calls.md) — the card draft, synergy chains
8. [Enemies](docs/design/08-enemies.md) — the enemy roster
9. [Mission Progression](docs/design/09-mission-progression.md) — galaxy map, unlock model, tutorials, main missions, stars
10. [Coins & Economy](docs/design/10-economy.md) — how coins are earned and spent
11. [Visuals & Audio](docs/design/11-visuals-and-audio.md) — palette, neon look, audio
12. [Architecture & Tooling](docs/design/12-architecture-and-tooling.md) — core/view split, simulator, tuning tools, constitutional rules
13. [Balance & Tuning](docs/design/13-balance-and-tuning.md) — campaign time target, clear-rate targets, balance workflow
14. [Status — What's Built vs What's Planned](docs/design/14-status.md) — the current punch list
15. [New Player Experience](docs/design/15-new-player-experience.md) — the first-playthrough
    story, t1 through m1's unlock, beat by beat

## Other docs

- `docs/plans/` — active, in-progress design/engineering plans (not settled design; see each
  doc's own status header).
- `v2/CLAUDE.md` — agent orientation for the codebase itself (how to run things, conventions,
  file layout). Read this *and* this index before making changes.
