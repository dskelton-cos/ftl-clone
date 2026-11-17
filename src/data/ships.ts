import type { SystemId } from './systems';
import { WEAPONS } from './weapons';

export interface RoomDef { x: number; y: number; w: number; h: number; system?: SystemId }
export type HullStyle = 'cruiser' | 'raider' | 'cutter' | 'bulwark';

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

const NAMES = ['Rust Corsair', 'Toll Collector', 'Ashen Cutter', 'Scav Hauler', 'Rift Marauder', 'Grey Warden', 'Hollow Pike'];

export function makeEnemyDef(sector: number, rand: () => number): ShipDef {
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  const tpl = sector >= 4 && rand() < 0.5 ? TEMPLATES[2] : pick(TEMPLATES.slice(0, 2));
  const tier1 = ['needle', 'volley', 'ion'];
  const tier2 = ['scatter', 'slug', 'lance', 'volley'];
  const count = sector < 3 ? 1 : sector < 7 ? 2 : 3;
  const weapons: string[] = [];
  for (let i = 0; i < count; i++) weapons.push(pick(sector >= 4 && rand() < 0.15 * sector ? tier2 : tier1));
  const wPower = weapons.reduce((s, id) => s + WEAPONS[id].power, 0);
  const shields = sector >= 9 ? 6 : sector >= 5 ? 4 : 2;
  const engines = 1 + Math.min(3, Math.floor(sector / 3));
  const systems = { shields, engines, oxygen: 1, medbay: 1, weapons: wPower, piloting: 1 };
  return {
    name: pick(NAMES),
    style: tpl.style,
    hull: 8 + Math.round(sector * 1.5),
    reactor: shields + engines + 2 + wPower,
    rooms: tpl.rooms,
    systems,
    power: { shields, engines, oxygen: 1, medbay: 1 },
    weapons,
    crew: Math.min(4, 2 + Math.floor(sector / 3)),
    missiles: 6,
  };
}
