// Shared company → display mapping for ability/card UI. Used by both the hub's
// dispatch-reinforcements card grid and the in-combat card-offer overlay — kept in one
// place so the two never drift apart.

import { PALETTE } from '../view/palette';

export const ABILITY_COMPANY_COLORS: Record<string, number> = {
  nexus: PALETTE.weaponCyan,
  aegis: PALETTE.shieldBlue,
  quantum: PALETTE.generatorAmber,
  comet: PALETTE.motorMagenta,
};

export const ABILITY_COMPANY_CHARS: Record<string, string> = {
  nexus: 'N',
  aegis: 'A',
  quantum: 'Q',
  comet: 'C',
};
