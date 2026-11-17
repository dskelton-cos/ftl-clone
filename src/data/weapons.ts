export type WeaponKind = 'laser' | 'missile' | 'ion';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  shots: number;
  damage: number;
  ion: number;
  power: number;
  charge: number; // seconds
  pierce: boolean; // ignores shields
  ammo: boolean; // consumes a missile per volley
  fireChance: number;
  breachChance: number;
  speed: number; // px / s
  desc: string;
}

const base = { ion: 0, pierce: false, ammo: false, fireChance: 0.1, breachChance: 0.05, speed: 780 };

export const WEAPONS: Record<string, WeaponDef> = {
  needle: { ...base, id: 'needle', name: 'Needle Laser', kind: 'laser', shots: 1, damage: 1, power: 1, charge: 8, desc: 'Single cheap laser bolt.' },
  volley: { ...base, id: 'volley', name: 'Volley Laser', kind: 'laser', shots: 2, damage: 1, power: 2, charge: 10, desc: 'Two bolts. The first strips a shield, the second gets through.' },
  scatter: { ...base, id: 'scatter', name: 'Scatter Laser', kind: 'laser', shots: 3, damage: 1, power: 2, charge: 12, desc: 'Three bolts per volley.' },
  slug: { ...base, id: 'slug', name: 'Slug Cannon', kind: 'laser', shots: 1, damage: 2, power: 1, charge: 10, fireChance: 0.2, breachChance: 0.2, desc: 'Heavy bolt that often breaches hulls.' },
  lance: { ...base, id: 'lance', name: 'Lance Missile', kind: 'missile', shots: 1, damage: 2, power: 1, charge: 11, pierce: true, ammo: true, fireChance: 0.3, breachChance: 0.25, speed: 480, desc: 'Goes straight through shields. Uses 1 missile.' },
  ion: { ...base, id: 'ion', name: 'Ion Pulse', kind: 'ion', shots: 1, damage: 0, ion: 1, power: 1, charge: 8, fireChance: 0, breachChance: 0, speed: 620, desc: 'No hull damage. Knocks out a shield layer and jams the system it hits.' },
};
