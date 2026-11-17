export type SystemId = 'shields' | 'engines' | 'oxygen' | 'weapons' | 'medbay' | 'piloting' | 'cloaking' | 'teleporter' | 'drones';

export interface SystemInfo {
  name: string;
  key: string; // keyboard power hotkey ('' = none)
  subsystem: boolean; // subsystems run on their own power, not the reactor
  manable: boolean;
  max: number;
  desc: string;
}

export const SYSTEM_INFO: Record<SystemId, SystemInfo> = {
  shields: { name: 'Shields', key: 'A', subsystem: false, manable: true, max: 8, desc: 'Every 2 power raises one shield layer. Each layer blocks one shot.' },
  engines: { name: 'Engines', key: 'S', subsystem: false, manable: true, max: 8, desc: 'Power raises evasion and charges the jump drive.' },
  oxygen: { name: 'Oxygen', key: 'D', subsystem: false, manable: false, max: 3, desc: 'Refills the air in every room.' },
  medbay: { name: 'Medbay', key: 'F', subsystem: false, manable: false, max: 3, desc: 'Heals crew standing inside it.' },
  weapons: { name: 'Weapons', key: '', subsystem: false, manable: true, max: 8, desc: 'Powers your weapons. Manned: faster charging.' },
  cloaking: { name: 'Cloaking', key: '', subsystem: false, manable: false, max: 3, desc: 'Press to cloak: big evasion boost and enemy weapons stop charging. More power, longer cloak.' },
  teleporter: { name: 'Teleporter', key: '', subsystem: false, manable: false, max: 3, desc: 'Beams crew standing in this room onto the enemy ship. Recall them any time.' },
  drones: { name: 'Drone Control', key: '', subsystem: false, manable: false, max: 8, desc: 'Powers drones. Each launch costs a drone part.' },
  piloting: { name: 'Piloting', key: '', subsystem: true, manable: true, max: 3, desc: 'Must be manned to dodge and to jump.' },
};

/** Order in which reactor power is handed out (weapons come last). */
export const POWER_ORDER: SystemId[] = ['shields', 'engines', 'oxygen', 'medbay', 'cloaking', 'teleporter'];

/** Systems a store can install into an empty room. */
export const INSTALLABLE: { id: SystemId; price: number }[] = [
  { id: 'teleporter', price: 60 },
  { id: 'cloaking', price: 70 },
  { id: 'drones', price: 55 },
];

/** Evasion % by engine power. */
export const EVASION_TABLE = [0, 5, 10, 15, 20, 25, 28, 31, 35];
