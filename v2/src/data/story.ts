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
  // 'first-support-call' stays here: that beat is a non-blocking aside while the card
  // overlay is already the main focus, not a "here's what's about to happen" moment
  // that needs a full pause.
  t2: [
    {
      trigger: 'first-support-call',
      text: 'NOVAK COMMAND: Support window open. A rate or damage card clears a wall faster — your call.',
    },
  ],
  t3: [
    {
      trigger: 'first-support-call',
      text: 'NOVAK COMMAND: Support window open. A damage boost is what breaks its regen — take it.',
    },
  ],
  t4: [
    {
      trigger: 'first-support-call',
      text: "NOVAK COMMAND: Support window open. Pick whatever helps — and don't forget those reserves are sitting ready too.",
    },
  ],
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
