// story.ts
// All narrative content: character dialogue, mission briefings, boss names, event lines.
// Pure data — no Phaser imports. Wire into scenes as needed.

// ─── characters ───────────────────────────────────────────────────────────────

export const CHARACTERS = {
  nova:    'NOVA',          // ship AI — dry, precise, faintly sarcastic
  nesro:   'NESRO',         // Captain Veron Nesro — the player; written as second-person voice
  voss:    'CMD. VOSS',     // Commander Arlen Voss — the authority, reluctant to trust Nesro
  patch:   'PATCH',         // Mira "Patch" Delacour — ally ship pilot, owe Nesro a favour
} as const;

export type CharacterId = keyof typeof CHARACTERS;

export interface DialogueLine {
  speaker: CharacterId;
  text:    string;
}

// ─── boss names ───────────────────────────────────────────────────────────────

export const BOSS_NAMES: Record<string, string> = {
  mission_1: 'SPEARHEAD-7',     // automated probe controller — no personality, pure threat
  mission_2: 'THE WARDEN',      // orbital fortress AI protecting Station Kappa
  mission_3: 'KORRETH',         // the swarm's hive-node; first enemy that talks back
};

// ─── mission briefings (shown before mission starts) ──────────────────────────

export const MISSION_BRIEFINGS: Record<string, DialogueLine[]> = {

  tutorial: [
    { speaker: 'nova',  text: "All systems nominal. Weapons hot. Running you through combat protocols." },
    { speaker: 'nova',  text: "Your shields absorb incoming fire. Energy recharges them. Don't let both run dry." },
    { speaker: 'nova',  text: "Sixty seconds. Survive. That's it." },
  ],

  mission_1: [
    { speaker: 'voss',  text: "Nesro. Long-range sensors picked up a probe formation at grid 4-Delta." },
    { speaker: 'voss',  text: "Treat it as a skirmish. Take them down, report back. Try not to make it interesting." },
    { speaker: 'nova',  text: "He means 'don't die.' I'll translate if he does it again." },
  ],

  mission_2: [
    { speaker: 'voss',  text: "Station Kappa has gone dark. The Warden has locked us out of the override grid." },
    { speaker: 'voss',  text: "You're the only privateer with a hull small enough to run the asteroid field. Get in there." },
    { speaker: 'nova',  text: "He still hasn't said please. I'm keeping count." },
    { speaker: 'nesro', text: "What's the Warden's threat level?" },
    { speaker: 'nova',  text: "High. But you've been in worse." },
    { speaker: 'nesro', text: "When?" },
    { speaker: 'nova',  text: "...I'll get back to you." },
  ],

  mission_3: [
    { speaker: 'nova',  text: "KORRETH has been broadcasting on open channels for six hours." },
    { speaker: 'nova',  text: "The message repeats. Want to hear it?" },
    { speaker: 'nesro', text: "No." },
    { speaker: 'nova',  text: "It says: 'We remember the First Contact.' That's us, Nesro. We're the first contact." },
    { speaker: 'voss',  text: "The swarm is mobilising. Every ship we have is committed elsewhere. It's you." },
    { speaker: 'nesro', text: "Of course it is." },
  ],

  daily: [
    { speaker: 'nova',  text: "Shadow run. Voss wants no records, no witnesses. Just a depth score." },
    { speaker: 'nova',  text: "Survive as long as you can. I'll time you." },
  ],
};

// ─── in-mission events ────────────────────────────────────────────────────────

// Triggered by AllyShipEvent when the ally flies across the screen.
export const ALLY_SHIP_LINES: DialogueLine[][] = [
  [
    { speaker: 'patch', text: "AJAX squadron passing through. Catch!" },
  ],
  [
    { speaker: 'patch', text: "Voss doesn't know I'm here. Keep it that way." },
  ],
  [
    { speaker: 'patch', text: "You still owe me from Callisto. Consider this partial payment." },
  ],
  [
    { speaker: 'nova',  text: "Unregistered contact. Transmitting on a private frequency." },
    { speaker: 'patch', text: "It's Patch. Don't make a thing of it." },
  ],
];

// ─── boss encounter lines (shown when boss spawns) ────────────────────────────

export const BOSS_ENCOUNTER_LINES: Record<string, DialogueLine[]> = {
  mission_1: [
    { speaker: 'nova',  text: "Contact: SPEARHEAD-7. Automated probe controller. No crew. No mercy." },
  ],
  mission_2: [
    { speaker: 'nova',  text: "THE WARDEN is online. It's been guarding this station for eleven years." },
    { speaker: 'nova',  text: "Let's make it twelve seconds." },
  ],
  mission_3: [
    { speaker: 'nova',   text: "KORRETH is broadcasting again." },
    { speaker: 'nova',   text: "This time it's just coordinates. Our coordinates." },
    { speaker: 'nesro',  text: "Then let's give it something to remember us by." },
  ],
};

// ─── boss death lines (shown after boss is destroyed) ─────────────────────────

export const BOSS_DEATH_LINES: Record<string, DialogueLine[]> = {
  mission_1: [
    { speaker: 'nova',  text: "SPEARHEAD-7 offline. They sent a scout. We sent it back in pieces." },
    { speaker: 'nova',  text: "Someone received the telemetry. They know we're here now." },
  ],
  mission_2: [
    { speaker: 'nova',  text: "The Warden is down. Station Kappa is ours." },
    { speaker: 'nova',  text: "Voss is already taking credit in the after-action report. I've saved the comms log." },
  ],
  mission_3: [
    { speaker: 'nova',  text: "KORRETH signal lost." },
    { speaker: 'nova',  text: "Last broadcast before shutdown: 'We remember—'" },
    { speaker: 'nesro', text: "Good. Let it forget." },
  ],
};

// ─── close call lines (shown when hull drops below 20%) ──────────────────────

export const CLOSE_CALL_LINES: DialogueLine[][] = [
  [
    { speaker: 'nova', text: "Hull at critical. Recommend evasive action. Or any action, really." },
  ],
  [
    { speaker: 'nova', text: "Hull integrity failing. I'd like to file a formal complaint about this situation." },
  ],
  [
    { speaker: 'nova', text: "One more hit and we're debris. Your call, Captain." },
  ],
];

// ─── win/loss result lines ────────────────────────────────────────────────────

export const VICTORY_LINES: Record<string, DialogueLine[]> = {
  mission_1: [
    { speaker: 'nova', text: "Sector clear. Transmission sent. Get some rest — something tells me Voss has a follow-up." },
  ],
  mission_2: [
    { speaker: 'voss', text: "Kappa Station is back online. Good work, Nesro. Don't let it go to your head." },
    { speaker: 'nova', text: "Too late." },
  ],
  mission_3: [
    { speaker: 'voss', text: "The swarm is broken. You have... my personal commendation." },
    { speaker: 'nesro', text: "I want it in writing." },
    { speaker: 'nova',  text: "I already have it. I intercepted the draft." },
  ],
};

export const DEFEAT_LINES: DialogueLine[][] = [
  [{ speaker: 'nova', text: "Emergency stop engaged. We'll try again." }],
  [{ speaker: 'nova', text: "Hull failure. Mission aborted. Diagnostics running." }],
  [{ speaker: 'nova', text: "We didn't die. We made a tactical withdrawal. That's my story." }],
];

// ─── close call decision overlay ─────────────────────────────────────────────

// These are the options shown on the close-call decision screen.
// Costs are in coins; 0 = free option.
export interface CloseCallOption {
  label:       string;
  sublabel:    string;
  coinCost:    number;
  action:      'continue' | 'support_ship' | 'abandon';
}

export const CLOSE_CALL_OPTIONS: CloseCallOption[] = [
  {
    label:    'PUSH THROUGH',
    sublabel: 'Resume at critical hull',
    coinCost: 0,
    action:   'continue',
  },
  {
    label:    'CALL SUPPORT',
    sublabel: 'Patch deploys — heals 40 HP, fires for 10 s',
    coinCost: 60,
    action:   'support_ship',
  },
  {
    label:    'ABANDON MISSION',
    sublabel: 'No stars, no coins',
    coinCost: 0,
    action:   'abandon',
  },
];

// Support ship behaviour constants — used by GameScene when player picks support_ship.
export const SUPPORT_SHIP_HEAL_HP   = 40;
export const SUPPORT_SHIP_DURATION_MS = 10_000;
