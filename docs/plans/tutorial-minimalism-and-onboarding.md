# Onboarding: skip-tutorials prompt — done

> Original plan covered five decisions. Decisions 1-4 (all 4 tutorials get
> `completesOnDefeat: true`, `w0` excluded, full reward on allowed-defeat, per-mission
> content trims) shipped earlier and were trimmed from this doc. Decision 5 — the
> onboarding/skip-tutorials prompt — shipped 2026-07-16 as part of
> `docs/plans/first-open-and-tutorial-tour.md` (read that doc for the full design,
> including the hub button tour built alongside it). This doc now just records where
> the final implementation diverged from what was originally sketched here.

## What shipped

`OnboardingScene` (`v2/src/view/OnboardingScene.ts`), inserted between `BootScene` and
`HubScene`, offers "START WITH TUTORIALS" / "SKIP TUTORIALS". Both hand off to
`HubScene` with the hub button tour showing. `SaveManager.ts` gained
`acceptOnboarding(save)` (marks the prompt seen, no other mutation) and
`skipTutorials(save)` (marks t1-t4 completed with zero coins, same as originally
specced, plus marks the prompt seen).

## Divergence from the original sketch: a new `onboardingSeen` field was needed

This doc originally recommended **no new save field** — deriving "show the prompt" from
existing fresh-save signals (`completedMissionIds.length === 0 && coins === 0 &&
!w0Completed`), reasoning "once a choice is made, the save is no longer fresh, so the
prompt naturally never reappears."

That reasoning was wrong for the "start with tutorials" branch, caught during planning
(not after shipping): that choice mutates nothing else, so a player who picks it and
closes the tab before finishing a mission or earning a coin would still match the
fresh-save check on their next launch and see the full prompt again. Fixed by adding
`SaveData.onboardingSeen?: boolean` (optional, absent on every pre-existing save — no
`SAVE_VERSION` bump, same pattern as `w0Completed?: boolean`), set by both buttons
immediately. The routing check in `BootScene.ts` is simply `!save.onboardingSeen`.

## Verification

`pnpm test` (new `onboarding` describe block in `SaveManager.test.ts`: seen-flag
behavior, `skipTutorials`'s unlock/coins/idempotency), `pnpm lint` / `pnpm build:dry`
clean, `pnpm audit-taps` and `pnpm screenshot` both cover the onboarding prompt and the
tour (see `first-open-and-tutorial-tour.md`'s verification section for the full list) —
all confirmed via real screenshots, not just passing exit codes.
