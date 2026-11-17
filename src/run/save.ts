import { CREW_COLORS, CREW_NAMES } from '../data/crew';
import { DRONES } from '../data/drones';
import { PLAYER_SHIPS } from '../data/ships';
import type { SystemId } from '../data/systems';
import { WEAPONS } from '../data/weapons';
import { Crew, Drone, Ship, ShipSystem, Weapon } from '../sim/ship';
import type { SectorMap } from './map';

const KEY = 'drift.save.v1';

interface SavedShip {
  defId: string;
  hull: number; maxHull: number; reactor: number;
  scrap: number; fuel: number; missiles: number; droneParts: number;
  systems: { id: SystemId; level: number; desired: number; room: number }[];
  weapons: { id: string; on: boolean }[];
  drones: string[];
  crew: { name: string; color: string; hp: number; maxHp: number; station: SystemId | null; x: number; y: number }[];
}

export interface SaveData {
  v: 1;
  ship: SavedShip;
  run: { sector: number; kills: number; jumps: number; current: number; map: SectorMap };
}

export function serialize(ship: Ship, run: { sector: number; kills: number; jumps: number; current: { id: number }; map: SectorMap }): SaveData {
  return {
    v: 1,
    ship: {
      defId: ship.def.id ?? 'wayfarer',
      hull: ship.hull, maxHull: ship.maxHull, reactor: ship.reactor,
      scrap: ship.scrap, fuel: ship.fuel, missiles: ship.missiles, droneParts: ship.droneParts,
      systems: Object.values(ship.systems).map((s) => ({ id: s.id, level: s.level, desired: s.desired, room: s.room.id })),
      weapons: ship.weapons.map((w) => ({ id: w.def.id, on: w.desiredOn })),
      drones: ship.drones.map((d) => d.def.id),
      crew: ship.ownCrew.map((c) => ({ name: c.name, color: c.color, hp: c.hp, maxHp: c.maxHp, station: c.station, x: c.x, y: c.y })),
    },
    run: { sector: run.sector, kills: run.kills, jumps: run.jumps, current: run.current.id, map: run.map },
  };
}

export function restoreShip(s: SavedShip): Ship {
  const def = PLAYER_SHIPS.find((d) => d.id === s.defId) ?? PLAYER_SHIPS[0];
  const ship = new Ship(def, 'player', CREW_NAMES, CREW_COLORS);
  Object.assign(ship, {
    hull: s.hull, maxHull: s.maxHull, reactor: s.reactor, scrap: s.scrap, fuel: s.fuel, missiles: s.missiles, droneParts: s.droneParts,
  });
  for (const r of ship.rooms) r.system = null;
  ship.systems = {};
  for (const sv of s.systems) {
    const room = ship.rooms[sv.room] ?? ship.rooms[0];
    const sys = new ShipSystem(sv.id, sv.level, room);
    sys.desired = sv.desired;
    room.system = sys;
    ship.systems[sv.id] = sys;
  }
  ship.weapons = s.weapons.filter((w) => WEAPONS[w.id]).map((w) => {
    const wp = new Weapon(WEAPONS[w.id]);
    wp.desiredOn = w.on;
    return wp;
  });
  ship.drones = s.drones.filter((id) => DRONES[id]).map((id) => new Drone(DRONES[id]));
  ship.crew = s.crew.map((c) => {
    const room = ship.roomAtTile(Math.floor(c.x), Math.floor(c.y)) ?? ship.rooms[0];
    const crew = new Crew(c.name, c.color, c.x, c.y, room, 'player');
    crew.hp = c.hp;
    crew.maxHp = c.maxHp;
    crew.station = c.station;
    return crew;
  });
  ship.updatePower();
  return ship;
}

export function writeSave(data: SaveData): string | null {
  try {
    const json = JSON.stringify(data);
    localStorage.setItem(KEY, json);
    return json;
  } catch { return null; }
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    return d?.v === 1 ? d : null;
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}
