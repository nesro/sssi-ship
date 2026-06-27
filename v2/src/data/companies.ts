import type { CompanyId } from '../core/types';

export interface CompanySpec {
  id: CompanyId;
  name: string;
  tagline: string;
  /** Hex color matching palette: weapon=0x00ffff, shield=0x4488ff, generator=0xffaa00, motor=0xff44ff */
  color: number;
  system: 'weapon' | 'shield' | 'generator' | 'motor';
}

export const ALL_COMPANIES: CompanySpec[] = [
  { id: 'nexus',   name: 'Nexus Armaments', tagline: 'Maximum firepower, minimum mercy.',          color: 0x00ffff, system: 'weapon' },
  { id: 'aegis',   name: 'Aegis Defense',   tagline: 'The shield that never breaks.',              color: 0x4488ff, system: 'shield' },
  { id: 'quantum', name: 'Quantum Power',   tagline: 'Energy is the only currency that matters.',  color: 0xffaa00, system: 'generator' },
  { id: 'comet',   name: 'Comet Drive',     tagline: 'Speed is your only advantage.',              color: 0xff44ff, system: 'motor' },
];

const COMPANIES_BY_ID: Record<string, CompanySpec> = Object.fromEntries(
  ALL_COMPANIES.map((c) => [c.id, c]),
);

export function companyById(id: CompanyId): CompanySpec {
  const company = COMPANIES_BY_ID[id];
  if (company === undefined) throw new Error(`Unknown company id "${id}"`);
  return company;
}

export function companyForSystem(system: 'weapon' | 'shield' | 'generator' | 'motor'): CompanyId {
  const map: Record<string, CompanyId> = {
    weapon: 'nexus', shield: 'aegis', generator: 'quantum', motor: 'comet',
  };
  return map[system] as CompanyId;
}
