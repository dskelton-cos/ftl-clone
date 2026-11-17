import type { SystemId } from './systems';
import { WEAPONS } from './weapons';

export interface RoomDef { x: number; y: number; w: number; h: number; system?: SystemId }
export type HullStyle = 'cruiser' | 'raider' | 'cutter' | 'bulwark' | 'wedge' | 'citadel';

export interface ShipDef {
  name: string;
  style: HullStyle;
  hull: number;
  reactor: number;
  rooms: RoomDef[];
  systems: Partial<Record<SystemId, number>>; // system level (max power)
  power: Partial<Record<SystemId, number>>; // starting power
  weapons: string[];
  crew: number;
  missiles: number;
}

export const PLAYER_SHIP: ShipDef = {
  name: 'Wayfarer',
  style: 'cruiser',
  hull: 30,
  reactor: 8,
  crew: 4,
  missiles: 8,
  rooms: [
    { x: 0, y: 1, w: 2, h: 2, system: 'engines' },
    { x: 2, y: 0, w: 2, h: 1, system: 'oxygen' },
    { x: 2, y: 1, w: 2, h: 2 },
    { x: 2, y: 3, w: 2, h: 1 },
    { x: 4, y: 0, w: 2, h: 2, system: 'medbay' },
    { x: 4, y: 2, w: 2, h: 2, system: 'shields' },
    { x: 6, y: 0, w: 2, h: 1 },
    { x: 6, y: 1, w: 2, h: 2, system: 'weapons' },
    { x: 6, y: 3, w: 2, h: 1 },
    { x: 8, y: 1, w: 1, h: 2, system: 'piloting' },
  ],
  systems: { shields: 2, engines: 2, oxygen: 1, medbay: 1, weapons: 3, piloting: 1 },
  power: { shields: 2, engines: 2, oxygen: 1, medbay: 0 },
  weapons: ['volley', 'lance'],
};

// Enemy layouts are drawn with the bow on the left (they face the player).
const TEMPLATES: { style: HullStyle; rooms: RoomDef[] }[] = [
  {
    style: 'raider',
    rooms: [
      { x: 0, y: 1, w: 1, h: 2, system: 'piloting' },
      { x: 1, y: 0, w: 2, h: 2, system: 'weapons' },
      { x: 1, y: 2, w: 2, h: 2, system: 'shields' },
      { x: 3, y: 0, w: 2, h: 1, system: 'oxygen' },
      { x: 3, y: 1, w: 2, h: 2 },
      { x: 3, y: 3, w: 2, h: 1, system: 'medbay' },
      { x: 5, y: 1, w: 2, h: 2, system: 'engines' },
    ],
  },
  {
    style: 'cutter',
    rooms: [
      { x: 0, y: 1, w: 1, h: 1, system: 'piloting' },
      { x: 1, y: 0, w: 2, h: 1, system: 'weapons' },
      { x: 1, y: 1, w: 2, h: 1 },
      { x: 1, y: 2, w: 2, h: 1, system: 'shields' },
      { x: 3, y: 0, w: 1, h: 1, system: 'oxygen' },
      { x: 3, y: 1, w: 2, h: 1, system: 'engines' },
      { x: 3, y: 2, w: 1, h: 1, system: 'medbay' },
    ],
  },
  {
    style: 'wedge',
    rooms: [
      { x: 0, y: 2, w: 1, h: 1, system: 'piloting' },
      { x: 1, y: 1, w: 2, h: 1, system: 'weapons' },
      { x: 1, y: 2, w: 2, h: 1 },
      { x: 1, y: 3, w: 2, h: 1, system: 'shields' },
      { x: 3, y: 0, w: 2, h: 2, system: 'engines' },
      { x: 3, y: 2, w: 1, h: 1, system: 'oxygen' },
      { x: 4, y: 2, w: 1, h: 1 },
      { x: 3, y: 3, w: 2, h: 2, system: 'medbay' },
    ],
  },
  {
    style: 'bulwark',
    rooms: [
      { x: 0, y: 1, w: 1, h: 2, system: 'piloting' },
      { x: 1, y: 0, w: 2, h: 2, system: 'weapons' },
      { x: 1, y: 2, w: 2, h: 2, system: 'shields' },
      { x: 3, y: 0, w: 1, h: 2, system: 'oxygen' },
      { x: 3, y: 2, w: 1, h: 2, system: 'medbay' },
      { x: 4, y: 0, w: 2, h: 2 },
      { x: 4, y: 2, w: 2, h: 2, system: 'engines' },
      { x: 6, y: 1, w: 1, h: 2 },
    ],
  },
];

const BOSS_ROOMS: RoomDef[] = [
  { x: 0, y: 1, w: 1, h: 3, system: 'piloting' },
  { x: 1, y: 0, w: 2, h: 2, system: 'weapons' },
  { x: 1, y: 2, w: 2, h: 1 },
  { x: 1, y: 3, w: 2, h: 2, system: 'shields' },
  { x: 3, y: 0, w: 2, h: 1, system: 'oxygen' },
  { x: 3, y: 1, w: 2, h: 3 },
  { x: 3, y: 4, w: 2, h: 1, system: 'medbay' },
  { x: 5, y: 0, w: 2, h: 2 },
  { x: 5, y: 3, w: 2, h: 2 },
  { x: 5, y: 2, w: 3, h: 1, system: 'engines' },
];

const NAMES = ['Rust Corsair', 'Toll Collector', 'Ashen Cutter', 'Scav Hauler', 'Rift Marauder', 'Grey Warden', 'Hollow Pike', 'Cinder Wasp', 'Bleak Tern'];

// Weapon loadouts by threat tier (index = tier).
const LOADOUTS: string[][][] = [
  [['needle'], ['volley'], ['slug']],
  [['needle', 'ion'], ['pike'], ['volley'], ['needle', 'needle']],
  [['volley', 'ion'], ['lance', 'needle'], ['pike', 'needle'], ['scatter'], ['slug', 'ion']],
  [['volley', 'lance'], ['ion', 'pike'], ['scatter', 'ion'], ['swarm', 'needle'], ['slug', 'volley']],
  [['volley', 'cleaver'], ['surge', 'volley', 'needle'], ['scatter', 'lance', 'ion'], ['swarm', 'pike', 'needle'], ['cleaver', 'ion', 'needle']],
];

function build(name: string, style: HullStyle, rooms: RoomDef[], level: number, weapons: string[], hull: number, crew: number): ShipDef {
  const wPower = weapons.reduce((s, id) => s + WEAPONS[id].power, 0);
  const shields = level >= 12 ? 6 : level >= 5 ? 4 : 2;
  const engines = 1 + Math.min(3, Math.floor(level / 3));
  return {
    name, style, hull, rooms, weapons, crew,
    reactor: shields + engines + 2 + wPower,
    systems: { shields, engines, oxygen: 1, medbay: 1, weapons: wPower, piloting: 1 },
    power: { shields, engines, oxygen: 1, medbay: 1 },
    missiles: 8,
  };
}

/** A hostile ship for a given threat level (1 = first beacon, ~11 = last sector). */
export function makeEnemyDef(level: number, rand: () => number): ShipDef {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const tpl = level >= 4 ? pick(TEMPLATES) : pick(TEMPLATES.slice(0, 3));
  const tier = Math.min(LOADOUTS.length - 1, Math.floor((level - 1) / 2));
  return build(pick(NAMES), tpl.style, tpl.rooms, level, pick(LOADOUTS[tier]), 8 + Math.round(level * 1.5), Math.min(5, 2 + Math.floor(level / 3)));
}

/** The flagship guarding the final beacon. */
export function makeBossDef(): ShipDef {
  const def = build('Warden Flagship', 'citadel', BOSS_ROOMS, 9, ['volley', 'lance', 'ion', 'pike'], 28, 6);
  def.missiles = 20;
  // Slow and heavy: a big target that relies on its armour rather than dodging.
  def.reactor -= def.systems.engines! - 2;
  def.systems.engines = def.power.engines = 2;
  return def;
}
