// Narrator lines (V2_HANDOFF.md §3.10): typewriter text bar, ~20 scripted lines.
// Triggers fire in CombatScene and MenuScene. No branching, no portraits.

export type NarratorTrigger =
  | 'mission-start'
  | 'first-support-call'
  | 'boss-appear';

interface NarratorLine {
  trigger: NarratorTrigger;
  text: string;
}

/** Lines keyed by mission id. A mission may have lines for multiple triggers. */
const STORY_LINES: Record<string, NarratorLine[]> = {
  t1: [
    {
      trigger: 'mission-start',
      text: 'NOVAK COMMAND: Systems nominal. Your generator powers weapons and shields — watch that energy bar.',
    },
    {
      trigger: 'first-support-call',
      text: "NOVAK COMMAND: Support flight inbound. Pick a card — effects last this mission only.",
    },
  ],
  t2: [
    {
      trigger: 'mission-start',
      text: 'NOVAK COMMAND: Anomaly detected. Hull integrity confirmed. Wait for our support window.',
    },
    {
      trigger: 'first-support-call',
      text: "NOVAK COMMAND: Fire support available. That thing's regenerating faster than your baseline DPS — pick a damage boost.",
    },
  ],
  t3: [
    {
      trigger: 'mission-start',
      text: 'NOVAK COMMAND: Wall formation incoming. Single-target weapons will be buried. Check the OUTFITTER for pierce options.',
    },
    {
      trigger: 'first-support-call',
      text: 'NOVAK COMMAND: Support call live. Pierce cards hit every enemy in the column — worth picking.',
    },
  ],
  t4: [
    {
      trigger: 'mission-start',
      text: 'NOVAK COMMAND: Heavy traffic on all lanes. If your generator falls behind, weapons slow down. Watch the budget.',
    },
    {
      trigger: 'first-support-call',
      text: 'NOVAK COMMAND: Power support inbound. A generator card will stabilise your energy margin — take it.',
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
