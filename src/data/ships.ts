import type { SystemId } from './systems';
import { WEAPONS } from './weapons';
import { DRONES } from './drones';

export interface RoomDef { x: number; y: number; w: number; h: number; system?: SystemId }
export type HullStyle = 'cruiser' | 'raider' | 'cutter' | 'bulwark' | 'wedge' | 'citadel';

export interface ShipDef {
  id?: string;
  name: string;
  tagline?: string;
  desc?: string;
  drones?: string[];
  droneParts?: number;
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

const WAYFARER_ROOMS: RoomDef[] = [
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
];

export const PLAYER_SHIP: ShipDef = {
  id: 'wayfarer',
  name: 'Wayfarer',
  tagline: 'Balanced all-rounder',
  desc: 'Volley Laser and Lance Missile, 4 crew. Room to install new systems later.',
  style: 'cruiser',
  hull: 30,
  reactor: 8,
  crew: 4,
  missiles: 8,
  rooms: WAYFARER_ROOMS,
  systems: { shields: 2, engines: 2, oxygen: 1, medbay: 1, weapons: 3, piloting: 1 },
  power: { shields: 2, engines: 2, oxygen: 1, medbay: 0 },
  weapons: ['volley', 'lance'],
};

const BASTION: ShipDef = {
  id: 'bastion',
  name: 'Bastion',
  tagline: 'Slow fortress with a guard drone',
  desc: 'Two shield layers from the start and a Guard Drone that swats missiles. Ion Pulse plus Slug Cannon, only 3 crew.',
  style: 'bulwark',
  hull: 32,
  reactor: 10,
  crew: 3,
  missiles: 4,
  droneParts: 6,
  rooms: [
    { x: 0, y: 1, w: 2, h: 2, system: 'engines' },
    { x: 2, y: 0, w: 2, h: 2, system: 'shields' },
    { x: 2, y: 2, w: 2, h: 2, system: 'drones' },
    { x: 4, y: 0, w: 2, h: 1, system: 'oxygen' },
    { x: 4, y: 1, w: 2, h: 2 },
    { x: 4, y: 3, w: 2, h: 1, system: 'medbay' },
    { x: 6, y: 0, w: 2, h: 1 },
    { x: 6, y: 1, w: 2, h: 2, system: 'weapons' },
    { x: 6, y: 3, w: 2, h: 1 },
    { x: 8, y: 1, w: 1, h: 2, system: 'piloting' },
  ],
  systems: { shields: 4, engines: 1, oxygen: 1, medbay: 1, weapons: 2, drones: 2, piloting: 1 },
  power: { shields: 4, engines: 1, oxygen: 1, medbay: 0 },
  weapons: ['ion', 'slug'],
  drones: ['guard'],
};

const CORSAIR: ShipDef = {
  id: 'corsair',
  name: 'Corsair',
  tagline: 'Boarding specialist',
  desc: 'A 4-person teleporter and 5 crew. Beam a team over, wreck the enemy from inside, and take their ship apart.',
  style: 'raider',
  hull: 28,
  reactor: 9,
  crew: 5,
  missiles: 6,
  rooms: WAYFARER_ROOMS.map((r, i) => (i === 2 ? { ...r, system: 'teleporter' as const } : r)),
  systems: { shields: 2, engines: 2, oxygen: 1, medbay: 1, weapons: 3, piloting: 1, teleporter: 1 },
  power: { shields: 2, engines: 1, oxygen: 1, medbay: 0, teleporter: 1 },
  weapons: ['ion', 'volley'],
};

const SHADE: ShipDef = {
  id: 'shade',
  name: 'Shade',
  tagline: 'Cloaked hit-and-run',
  desc: 'Fast engines, a cloaking device, and an Ion Pulse to open shields for its Pike Beam. Fragile: one shield layer and 3 crew.',
  style: 'cutter',
  hull: 26,
  reactor: 10,
  crew: 3,
  missiles: 4,
  rooms: [
    { x: 0, y: 0, w: 2, h: 2, system: 'engines' },
    { x: 0, y: 2, w: 2, h: 1, system: 'oxygen' },
    { x: 2, y: 0, w: 2, h: 1, system: 'cloaking' },
    { x: 2, y: 1, w: 2, h: 1 },
    { x: 2, y: 2, w: 2, h: 1, system: 'medbay' },
    { x: 4, y: 0, w: 2, h: 2, system: 'shields' },
    { x: 4, y: 2, w: 2, h: 1 },
    { x: 6, y: 0, w: 2, h: 2, system: 'weapons' },
    { x: 6, y: 2, w: 2, h: 1 },
    { x: 8, y: 1, w: 1, h: 1, system: 'piloting' },
  ],
  systems: { shields: 2, engines: 3, oxygen: 1, medbay: 1, weapons: 3, piloting: 1, cloaking: 1 },
  power: { shields: 2, engines: 3, oxygen: 1, medbay: 0, cloaking: 1 },
  weapons: ['ion', 'pike'],
};

export const PLAYER_SHIPS: ShipDef[] = [PLAYER_SHIP, BASTION, CORSAIR, SHADE];

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

/** Put an extra system into an empty room of the design (if there is one). */
export function addSystemToDef(def: ShipDef, id: SystemId, level: number): boolean {
  const i = def.rooms.findIndex((r) => !r.system && (id !== 'teleporter' || r.w * r.h >= 2));
  if (i < 0) return false;
  def.rooms = def.rooms.map((r, j) => (j === i ? { ...r, system: id } : r));
  def.systems = { ...def.systems, [id]: level };
  def.power = { ...def.power, [id]: level };
  def.reactor += level;
  return true;
}

/** A hostile ship for a given threat level (1 = first beacon, ~11 = last sector). */
export function makeEnemyDef(level: number, rand: () => number): ShipDef {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const tpl = level >= 4 ? pick(TEMPLATES) : pick(TEMPLATES.slice(0, 3));
  const tier = Math.min(LOADOUTS.length - 1, Math.floor((level - 1) / 2));
  const def = build(pick(NAMES), tpl.style, tpl.rooms, level, pick(LOADOUTS[tier]), 8 + Math.round(level * 1.5), Math.min(5, 2 + Math.floor(level / 3)));
  // Later enemies bring drones, boarding parties and cloaking devices.
  if (level >= 3 && rand() < 0.3) {
    const d = pick(level >= 7 ? ['strike', 'guard', 'lancer', 'aegis'] : ['strike', 'guard']);
    const pw = DRONES[d].power;
    if (addSystemToDef(def, 'drones', pw)) { def.drones = [d]; def.droneParts = 99; def.power.drones = 0; }
  }
  if (level >= 5 && def.crew >= 3 && rand() < 0.3) {
    if (addSystemToDef(def, 'teleporter', level >= 9 ? 2 : 1)) def.crew++;
  } else if (level >= 6 && rand() < 0.25) {
    addSystemToDef(def, 'cloaking', level >= 9 ? 2 : 1);
  }
  return def;
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
