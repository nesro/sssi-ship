// Narrator lines (V2_HANDOFF.md §3.10): typewriter text bar, ~20 scripted lines.
// Triggers fire in CombatScene only. No branching, no portraits.

export type NarratorTrigger =
  | 'mission-start'
  | 'first-support-call'
  | 'boss-appear'
  | 'first-booster-appear';

interface NarratorLine {
  trigger: NarratorTrigger;
  text: string;
}

/** Lines keyed by mission id. A mission may have lines for multiple triggers. */
const STORY_LINES: Record<string, NarratorLine[]> = {
  // t1-t4's opening lines live in the blocking modal instead (missions.ts's
  // T1-T4_NARRATOR_EVENTS), not here — showing both would be duplicate, conflicting UI.
  // t3/t4 used to also have a 'first-support-call' entry here, shown in the passive
  // bottom bar alongside the still-open card offer; both moved into their own
  // T3/T4_NARRATOR_EVENTS as a second blocking modal event instead, timed to land just
  // before the support call opens. t2 has no entry — it has no support call at all
  // (its fix is a shop visit between attempts, not a mid-run card pick).
  m3b: [
    {
      trigger: 'first-booster-appear',
      text: 'NOVAK COMMAND: That escort is feeding regen to the ship ahead of it. Mark the booster — your forward battery will do the rest.',
    },
  ],
  m6: [
    {
      trigger: 'boss-appear',
      text: 'NOVAK COMMAND: LEVIATHAN SIGHTED. All power to weapons. Kill it fast — time-stars are on the line.',
    },
  ],
};

/** Returns the narrator line for a mission + trigger, or undefined if none is scripted. */
export function getStoryLine(
  missionId: string,
  trigger: NarratorTrigger,
): string | undefined {
  const lines = STORY_LINES[missionId];
  if (lines === undefined) return undefined;
  return lines.find((l) => l.trigger === trigger)?.text;
}
