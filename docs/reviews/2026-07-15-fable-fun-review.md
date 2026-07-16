# Independent fun-focused design review — Fable, 2026-07-15

> Requested by Tomáš immediately after the `docs/design/` restructure, explicitly as an
> outside, unprimed reviewer whose only mandate was "is this going to be fun." No context
> beyond the design docs themselves and the game's genre/platform was given — this is a
> genuinely independent read, not a continuation of any prior session's findings. Saved here
> verbatim (unedited) so it can be referenced while building the follow-up plan; do not edit
> this file to "resolve" its points — track resolutions in the plan/backlog instead.

## Verdict up front

This is one of the most honestly documented, best-instrumented indie designs I've read — and the instrumentation is exactly what convicts it. Your own balance doc (`13-balance-and-tuning.md`, workflow point 5) reports that both simulated player archetypes clear m1–m5 with **median hull at 100%, mean retries ≈1.00, and near-misses only appearing at m6**. That means roughly 45 of the promised 60 minutes contain no tension, no meaningful decisions, and no reason to touch the "core skill loop" that `06-combat.md` says the game is built on. You've labeled this "accepted as designed." I think it's the single biggest threat to the game being fun, and most of this review orbits it.

## 1. First impression / hook

The pitch in `01-identity.md` — one-hour campaign, offline, no ads/IAP, never grinding — is genuinely appealing as a *promise*. The most compelling single idea in the whole document set is **"Allocate, don't accumulate"** (`03-principles.md`): the generator as a literal power budget, brownout as a slope not a cliff, and toggling systems off to bank energy for a side-weapon burst. That's a real, ownable mechanical identity. The shield burst-return (60% of absorbed collision damage reflected as AoE, `06-combat.md`) is the other standout — "the shield is a weapon" (t1's lesson) is a lovely inversion.

But would I play it for an hour? Reading combat + enemies + progression together: the full player verb set is three toggles, a card pick, and two kinds of button tap. No aiming, no movement, no targeting. That can work — bullet-heavens prove minimal verbs can carry a game — but they compensate with **constant escalation and a decision drip every 20–30 seconds** (level-ups, on-screen chaos, near-death scrambles). Nesro Nova's analog is the support call, which is *scheduled*, sparse, and (per your own data) arrives while the player is at full hull with nothing to fix. What's missing versus the genre neighbors:

- **No mid-run escalation curve the player feels in their hands.** Waves arrive on a timeline; the player's power doesn't visibly snowball within a run except via 2–3 card picks.
- **No endless mode.** For an idle/arcade hybrid on Google Play, this is the retention feature, and it's absent from every doc.
- **No actual idle mechanics.** The word "idle" in the identity is wrong. The ship auto-fires, but there is no away-progression, no accumulation, nothing idle-genre players expect. This is an *auto-battler with manual overrides*. Players who install it for "idle" will be confused; players who'd love the energy-juggling won't find it from that label.

## 2. Where the fun is thin

**The skill loop is never demanded.** `06-combat.md` calls toggle management "the core skill loop: read the situation, deprioritize the right thing, act at the right moment." But `13-balance-and-tuning.md` proves the situation never needs reading before m6: the "average" archetype — which never switches kinds and uses supplies naively — clears 100% of campaigns. Worse, your own `brownoutAwareToggles` finding (`12-architecture-and-tooling.md`) showed toggle management is *sometimes net-negative*. So the game's signature mechanic is optional for 5 of 6 missions and occasionally a trap when used. A skill loop the game never tests isn't a skill loop; it's a fidget toy. The rationalization in balance point 5 ("a campaign that never forces a grind... is the identity as written") conflates two different things: *never grinding* is about the meta loop; it does not require *never being threatened* inside a mission. You can honor "the player is never stuck" while still making m3 scare them.

**The enemy roster doesn't create decisions — and one entry contradicts the control scheme.** `08-enemies.md` says booster "must be prioritized" and turret "prioritize to stop chip damage." Prioritized *how*? Per `06-combat.md`, the front weapon auto-targets the front-most enemy, the rear weapon fires at fixed mid-queue depth, and side weapons (per `05-shop-and-modules.md`) hit the front-most enemy or AoE. **The player has no targeting mechanism whatsoever.** The booster sits *behind* other enemies by design, in the exact spot nothing can deliberately reach. Either the docs are describing an AI-facing priority the player can't express, or a mechanic is missing. As written, the two most tactically interesting enemies are decision-proof.

**The roguelite layer is too short to breathe.** Synergy chains (`07-support-calls.md`) need an enabler plus payoff — at minimum two picks, realistically three — within one run, and cards die at mission end. In a 45–120-second early mission with (unspecified, but presumably 1–3) support calls, chains mathematically can't assemble. The chains are the best card design in the doc and the campaign structure starves them. Only in m5/m6 (and only with the Tactical motor) do they plausibly fire.

**The economy has no trade-offs, only a fill bar.** 100% sell-back + identical price ladders across kinds + net-cost switching means the shop is functionally a free loadout menu behind one global "total coins" gate. That's great for experimentation (genuinely — see section 5), but it means there is exactly one purchase decision in the game: which system to level next. Your expert archetype "rebuilds toward the mathematically best affordable build before every mission" at zero cost — that's the proof that buying is never a choice, just a progress bar. Combined with the frictionless midgame, the loop is: win effortlessly → fill bar → win effortlessly.

**Post-campaign is a void.** `10-economy.md`: one playthrough earns 4,000–8,000 coins; the completionist target is ~100,000, described as "within reach of a few campaign replays." That's 13–25 full replays of the same six missions — the doc's own math contradicts its "a few," and both numbers contradict "never grinding." After the m6 boss there is nothing new to point that money at except stars you've mostly earned.

## 3. Internal inconsistencies and confusions

1. **Mission length:** `01-identity.md` says 30–300-second missions; `13-balance-and-tuning.md` budgets m3/m4 at ~7 min each and m6 at ~15 min. One of these is wrong by 3×.
2. **Basic Lv1 pool size:** `05-shop-and-modules.md` says it was widened to 7 cards (2026-07-10); `07-support-calls.md` still says "Pool sizes range from 5 cards (Basic Lv1)." Doc 07 wasn't updated.
3. **Targeting:** `08-enemies.md`'s "must be prioritized" vs. `06-combat.md`'s zero targeting controls (detailed above).
4. **"Idle"** in the identity vs. no idle mechanics anywhere in 14 files.
5. **1D queue physics undefined:** the conveyor is single-file (`02-glossary.md`), but turrets are stationary and swarms are "very fast" while tanks are "slow." Can enemies pass each other? Do they stack behind a turret? No doc says, and it materially changes what rear/side weapons hit.
6. **Rear weapon energy:** glossary says front/rear weapons draw energy per shot; `05-shop` says the rear weapon is "never disabled by low energy"; `06-combat` applies brownout only to the front weapon. I *think* the intent is "rear costs energy but ignores brownout," but I had to triangulate three docs to guess.
7. **"Subscriptions."** In a free mobile game, a shop tab literally named **Subscriptions** reads as real-money IAP to anyone skimming the store listing or the shop. The mechanic (buying card pools) is one of your most original ideas; the name will actively hurt you on Google Play. Rename it — Contracts, Allies, Fleet Channels, Supply Lines, anything.
8. **Ion dominance** (`13-balance`, point 6) is acknowledged and unfixed — an open wound against the load-bearing "no single best build" principle. Credit for documenting it; it still needs the systematic sweep you describe and never built.

## 4. Top suggestions, in priority order

1. **Make stars the live, felt game in m1–m5.** You've accepted that clears are near-guaranteed; fine — then performance must be the game. Put star progress *in the combat HUD*: "Shield unbroken," "All kills," the T1 timer ticking. The instant a swarm threatens the all-kills star or a pulse gap threatens "shield never broke," the frictionless midgame becomes a score-attack game with real micro-stakes, no difficulty retune, no violation of "never stuck." This is the cheapest possible fix to your biggest problem, and stars are already designed (`09-mission-progression.md`) — they're just invisible during the one time they'd create tension.
2. **Add one targeting verb: tap an enemy to mark it as the front weapon's priority target.** Fixes the booster/turret contradiction, gives the game field (currently a passive movie) a reason to be touched, and adds the moment-to-moment decision layer the toggle system alone can't carry. One verb, huge return.
3. **Build an endless/siege mode after m6.** Waves scale forever, motor kind multiplies coin rate, Salvager/Overdrive finally have a home, the 100,000-coin target becomes meaningful, and Google Play retention stops depending on replaying m3. Your wave-timeline architecture makes this nearly free.
4. **Let players pull risk levers mid-run.** Everything risky is chosen pre-mission (motor kind). Add one in-run gamble — e.g., blockers become opt-in elites (kill for a bonus call, or wait them out safely), or calling a support ship early costs a shield pulse. The blocker → bonus-call loop is already 80% of this idea; push it to a choice instead of an automatic reward.
5. **Guarantee chain enablers can appear early.** If a player owns a subscription containing a chain, weight its enabler up in the first call of a mission. Chains that can't complete in a 90-second mission are dead content; this makes your best card design reachable without lengthening anything.

## 5. What's genuinely good

- **The tooling discipline is elite.** Simulator-as-truth, `pnpm tune`'s no-trap-kind invariant, the pacing report flagging MONOTONY/ANTICLIMAX, replay determinism, the five constitutional rules (`12-architecture-and-tooling.md`) — this is better engineering rigor than most funded studios apply to balance. The Overdrive-trap and nova-trap catches prove the tools work.
- **Brownout as a slope** is textbook-correct design with a documented rationale (v1's death spiral). Keep the "slopes, not cliffs" principle sacred.
- **Shield burst-return** is the game's most original combat idea — defense as offense creates the kamikaze/Tanker/Bulwark decision space almost by itself.
- **100% sell-back** is a brave, player-respecting rule, and the "welcome gift" edge-case resolution (`10-economy.md`) shows good judgment about when not to over-engineer.
- **Tactical motor granting extra card draws** is the smartest item in the shop — it makes the speed slot a *build identity* slot and links two unrelated systems.
- **Tutorials completing on defeat** (`09-mission-progression.md`) — "a destroyed ship is a valid teaching moment" is a genuinely wise call almost nobody makes.
- **The personal framing** — the 2010 maturita story, Captain Nesro, the developer message — is disarming and exactly right for a solo passion project's store presence. Don't cut it.

The bones here are strong and the honesty of the docs (documenting ion dominance, the fake time-stars, the flat-then-cliff finding instead of hiding them) gives me real confidence the problems are fixable. But right now the design's own telemetry says a player feels nothing between the tutorial and the final boss. Fix what the player *feels* in m1–m5 — visible stars, one targeting verb, one risk lever — before adding any more content, and this becomes a game I'd actually recommend.
