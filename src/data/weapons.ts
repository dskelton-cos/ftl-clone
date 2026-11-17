export type WeaponKind = 'laser' | 'missile' | 'ion' | 'beam';

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
  beamLength: number; // tiles swept by a beam
  price: number; // scrap at a shop
  desc: string;
}

const base = { ion: 0, pierce: false, ammo: false, fireChance: 0.1, breachChance: 0.05, speed: 780, beamLength: 0 };

export const WEAPONS: Record<string, WeaponDef> = {
  needle: { ...base, id: 'needle', name: 'Needle Laser', kind: 'laser', shots: 1, damage: 1, power: 1, charge: 8, price: 25, desc: 'Single cheap laser bolt.' },
  volley: { ...base, id: 'volley', name: 'Volley Laser', kind: 'laser', shots: 2, damage: 1, power: 2, charge: 10, price: 45, desc: 'Two bolts. The first strips a shield, the second gets through.' },
  scatter: { ...base, id: 'scatter', name: 'Scatter Laser', kind: 'laser', shots: 3, damage: 1, power: 2, charge: 12, price: 65, desc: 'Three bolts per volley.' },
  slug: { ...base, id: 'slug', name: 'Slug Cannon', kind: 'laser', shots: 1, damage: 2, power: 1, charge: 10, fireChance: 0.2, breachChance: 0.2, price: 45, desc: 'Heavy bolt that often breaches hulls.' },
  lance: { ...base, id: 'lance', name: 'Lance Missile', kind: 'missile', shots: 1, damage: 2, power: 1, charge: 11, pierce: true, ammo: true, fireChance: 0.3, breachChance: 0.25, speed: 480, price: 45, desc: 'Goes straight through shields. Uses 1 missile.' },
  swarm: { ...base, id: 'swarm', name: 'Swarm Rack', kind: 'missile', shots: 2, damage: 1, power: 2, charge: 13, pierce: true, ammo: true, fireChance: 0.15, breachChance: 0.1, speed: 520, price: 55, desc: 'Two small missiles that ignore shields. Uses 1 missile per volley.' },
  ion: { ...base, id: 'ion', name: 'Ion Pulse', kind: 'ion', shots: 1, damage: 0, ion: 1, power: 1, charge: 8, fireChance: 0, breachChance: 0, speed: 620, price: 35, desc: 'No hull damage. Knocks out a shield layer and jams the system it hits.' },
  surge: { ...base, id: 'surge', name: 'Surge Ion', kind: 'ion', shots: 1, damage: 0, ion: 2, power: 3, charge: 13, fireChance: 0, breachChance: 0, speed: 600, price: 60, desc: 'Double ion charge: jams a system for longer.' },
  pike: { ...base, id: 'pike', name: 'Pike Beam', kind: 'beam', shots: 1, damage: 1, power: 2, charge: 12, beamLength: 3, fireChance: 0.15, breachChance: 0, price: 50, desc: 'Sweeps across 3 tiles. Each shield layer cuts 1 damage per room. Never misses.' },
  cleaver: { ...base, id: 'cleaver', name: 'Cleaver Beam', kind: 'beam', shots: 1, damage: 2, power: 3, charge: 16, beamLength: 3.5, fireChance: 0.3, breachChance: 0, price: 80, desc: 'Heavy beam. Wrecks every room it crosses once shields are down.' },
};
