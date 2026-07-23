← [Design docs index](../../GAME_DESIGN.md) · [← Mission Progression](09-mission-progression.md)

# New Player Experience

The beat-by-beat walkthrough of a fresh player's first ~10-15 minutes: launch, the forced
tutorial chain (`t1`→`t2`→`t3`→`t4`), then `m1` unlocking. This is the shipped behavior,
not a proposal — every number below is sim-verified (`docs/known-issues.md` has the full
tuning history) and every claim is checked by `pnpm onboarding`
(`v2/tools/onboarding-audit.ts`), which plays through this exact sequence in the real app.
`09-mission-progression.md`'s "Tutorial missions" section stays the terse reference table
(forced-loadout/completes-on-defeat/etc.); this doc carries the narrative.

**The pattern, once, so each section below doesn't repeat it:** t1, t2, and t3 are secretly
the same shape — real equipped gear (not a scripted preset), a wave or decision tuned to
beat that gear specifically, a real defeat, a free fix in the shop or a second card pick,
and a shorter narration on retry that acknowledges the first attempt instead of repeating
the intro. t4 is deliberately the odd one out — a no-fail practice round, and it says so.

## First launch

Alpha/dev-build notice → (first-ever save) a coach-mark tour of the hub's main menu →
galaxy map. Only `t1` is unlocked; every other node (including the Daily Mission) shows
`???`. The main menu's SHIP CONFIGURATION (shop) button is dimmed and labeled `(LOCKED)`
(`isShopNavLocked`, `viewmodel/hub.ts`) — there is nothing to shop for yet, and this stays
locked through t1 into t2 (see t2's own section below for why it unlocks exactly when it
does, not before).

## t1 — Shield Basics

**Blurb:** "No weapon. Your shield is the only defense — and this generator can't keep it
charged." No weapon is loaded (`disableWeapon: true` — the player's real equipped weapon
is stripped for this run only; everything else is real gear, not a forced preset).
Tick-0 narration introduces all four ship modules (WEAPON/SHIELD/GENERATOR/MOTOR) and
explains the shield/generator relationship — the player's first look at any of this.

**First attempt fails, deterministically.** A fresh save's real generator
(`generator-torrent-1`) cannot refill the shield fast enough against 5 incoming
guardians — **0.00% clear rate**, confirmed over thousands of simulated runs. The
guardians are spaced to still read clearly on screen (a jitter-safety constraint, not a
difficulty one — see `missions.ts`'s own comment on `t1`'s `events` field), and the
ship's own hull/shield bars (rendered under the ship, same style as an enemy's hp bar)
visibly show the shield failing to keep up before hull starts dropping. A real defeat
nets **0 coins** — there is no weapon, so no possible kill-coin, and the game does not
invent a consolation payout for this; a real loss here works exactly like any other
mission where the ship dies before a kill lands.

**The defeat screen redirects straight to the shop.** t1's defeat is a
`defeat-shop-redirect` (`MissionSpec.defeatHint`): no RETRY/MISSIONS/SHOP row, just the
hint text and a single GO TO SHOP button. The hint: "Your generator can't refill the
shield fast enough to keep up with these hits. Look for a generator built for rapid
output over capacity — it's a free switch at this level." (Deliberately doesn't name the
kind — same restraint as t3's own hint below.)

**The shop's GENERATOR tab is now legible, not a wall of four identical options.**
`generator-torrent-1` (equipped) and `generator-surge-1` are free to switch to; `reserve`
and `steady` show `★3`/`★5` lock badges (`GENERATOR_KIND_UNLOCK_STARS`, `items.ts`) — a
fresh 0-star save can only reach torrent and surge. Switching torrent→surge costs
nothing (both priced 0 at level 1). Surge ("maximum output, tiny battery") is the one
kind whose fast, small-batch refill keeps the shield topped up against this specific
wave — **100.00% clear, ~42% avg hull remaining**, comfortable margin. (`steady` also
technically clears about half the time — a real but unhinted coin-flip, not the intended
fix; `reserve` still fails.)

**Retrying shows different narration.** Once `t1FailedOnce` is set, the mission opens
with a single short line instead of the full intro: *"Same wave, new generator. Let's see
if it can keep the shield charged this time."* The player already knows what the four
modules are — this attempt is framed as "does the fix work," not another lesson. This
win also earns a real kill (shield-burst finally finishes off a guardian once the shield
is actually absorbing hits properly) — **+15 coins on top of the 30 completion bonus,
45 total** — the same universal per-kill path every mission uses, not a special case.

t1 completes, unlocking t2.

## t2 — Weapon Systems

**Blurb:** "Your real gear, a real wall. If it beats you, the fix is a free switch away
in the shop." Real equipped gear again — under the forced chain, that's always exactly
the starter loadout (`pulse-1`/`wall-1`/`torrent-1`/`rush-1`) on a genuinely first
attempt, since t1's 30-coin reward can't afford any tier change.

**The generator runs at a fixed baseline here, on purpose.** The ship has exactly one
shared energy pool — the shield's own auto-recharge draws from and gates on the same
number the weapon does (`core/energy.ts`'s `pulseShield`) — so whatever generator a
player switched to while fixing t1 would otherwise carry straight into t2 and quietly
do half of t2's own job for them. `MissionSpec.neutralizeGeneratorId` pins t2 to
`generator-torrent-1` regardless of what's really equipped, so this mission stays a
clean, single-variable test of the WEAPON specifically — its own reason for existing.
Tick-0 narration says so directly ("This generator runs at a fixed baseline for this
fight — it's your WEAPON that decides if this wall goes down"), not a forward
reference to the GENERATOR shop tab the way it used to before this was pinned.

**Rear and side weapons are stripped here too, for the same reason.** A rear weapon
draws from that same shared energy pool and adds independent damage on top — and it's
the single cheapest purchase in the entire shop, so a player who spends t1's
completion coins on anything at all before reaching t2 (an ordinary thing to do, not
an edge case) carries it straight in and quietly does part of t2's job for them, same
shape as the generator above. `MissionSpec.disableAuxWeapons` strips both slots
regardless of what's bought.

**First attempt fails, most of the time.** A dense fodder wall beats single-target pulse
fire — **~10.1% clear rate** on `pulse-1` (not deterministic like t1; a real player could
get lucky), regardless of which generator they're really carrying in from t1.

**The shop's main-menu button unlocks here, not before.** `isShopNavLocked` stays true
until t2 is failed once or completed — before that, there is nothing to shop for (t1's
own fix routes through its own redirect, which bypasses this lock directly) and nothing
stops a player from browsing early otherwise. The moment t2 is lost for real, the SHIP
CONFIGURATION button un-dims for good.

**Same redirect shape as t1.** Defeat hint: "Your weapon hits one target at a time — this
wall needs more spread than that. The shop has a same-level switch that fixes it, and it
costs nothing." Switching `pulse-1`→`scatter-1` (or any spread-hitting kind) is a free
same-level trade. **Scatter clears ~98.9% of the time, ~12% avg hull remaining** — real
margin, not razor-thin, and unaffected by which generator is really equipped (the
whole point of pinning it above).

**Retry narration:** *"New weapon loaded. Let's see if it breaks through this wall."*
Real weapon kills mean t2 (like t1's retry) earns real, performance-scaled coins on this
attempt regardless of win or loss — this was never t1's special case, t1 was the odd one
out for lacking it on a first attempt.

t2 completes, unlocking t3.

## t3 — Support Cards

**Blurb:** "It heals faster than you shoot. You need the right card to break through."
Real weapon (forced `pulse-1`, the only tutorial that still forces a preset loadout —
there is no gear-switch fix here, the fix is a card pick). One regenerating guardian; a
scripted 3-card offer opens immediately.

**The decision has real stakes.** Three cards are offered (`firstOfferIds: ['w-dmg-30',
's-cap-20', 'g-out-08']`); only `w-dmg-30` (a damage-boost) actually breaks the
guardian's regen. `s-cap-20`/`g-out-08` (and skipping the offer) leave it unkillable,
and its own fire is what ends the mission. Tick-0 narration hints at the right
*category* of answer ("you will not out-shoot it alone, wait for support") without
naming the specific card — same restraint as t1/t2's hints, so the puzzle isn't spoiled.

**A wrong pick is a real, intended failure** — `completesOnDefeat: false`, same as t1/t2.
A right pick clears **100% of the time**; a wrong pick (or skipping) clears **~0%**.

**Retry narration:** *"Different pick this time — that guardian's regen still won't wait
for you."* No shop trip needed here — the fix is choosing differently on the very same
retry, not gear to switch beforehand.

t3 completes, unlocking t4.

## t4 — Battle Supplies

**Blurb:** "Two supplies are preloaded. No wrong pick this time — just try them and see
what they do." After three missions that just taught "if you fail, there's a real fix,"
t4 says explicitly that this one is different: `completesOnDefeat: true`, a real weapon,
and two gifted reserve supplies (`sup-damage`, `sup-shield`) to experiment with — a
spectrum (use them well, use them badly, or not at all), not a right/wrong pick. The
result screen is `standard` (RETRY/MISSIONS/SHOP), never a redirect — there is nothing to
redirect to, because there is nothing to fix.

t4 completes regardless of outcome, unlocking `m1` — the first main mission, and the end
of the forced tutorial chain.

## Why this all lines up

Every fail-capable tutorial (t1/t2/t3) shares the same shape (real gear or a real
decision → a wave/pick tuned to beat the naive default → a real defeat → a fix → shorter
retry narration that acknowledges the first attempt) so a player who's been through one
already knows what a defeat screen or a second attempt means for the next one. t4 breaks
the pattern on purpose, and says so in its own copy, rather than silently changing rules
a player has just learned to expect.
