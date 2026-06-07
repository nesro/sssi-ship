// story.ts
// Flavour text shown on mission cards and at mission end.
// One line per mission — keep them short and punchy.

export const MISSION_BRIEFINGS: Record<string, string> = {
  tutorial:  'Run the diagnostics. Shields will do the heavy lifting today.',
  mission_1: 'Long-range contact. Scouting force inbound. Engage and report back.',
  mission_2: 'Asteroid field at grid 7-Alpha. Command circle is in there somewhere.',
  mission_3: 'The nebula is accelerating them. All of them. Good luck.',
};

export const BOSS_NAMES: Record<string, string> = {
  mission_1: 'SCOUT COMMAND',
  mission_2: 'WAR CIRCLE ALPHA',
  mission_3: 'NEBULA LORD',
};

export const BOSS_ENCOUNTER_LINES: Record<string, string> = {
  mission_1: 'Their command unit just powered up.',
  mission_2: 'That thing is huge. Focus fire.',
  mission_3: 'It came out of the nebula. How fast is it?',
};

export const BOSS_DEATH_LINES: Record<string, string> = {
  tutorial:  'Target down. Not bad for a first run.',
  mission_1: "Scouting force eliminated. They know we're here now.",
  mission_2: 'Command circle down. The asteroid field is quiet.',
  mission_3: 'The swarm is broken. For now.',
};

export const ALLY_SHIPS: { name: string; line: string }[] = [
  { name: 'AJAX-7',    line: 'Passing through. Catch!' },
  { name: 'Vera',      line: 'Make it count.' },
  { name: 'Old Patch', line: "Don't tell command I was here." },
];
