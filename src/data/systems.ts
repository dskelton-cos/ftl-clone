export type SystemId = 'shields' | 'engines' | 'oxygen' | 'weapons' | 'medbay' | 'piloting';

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
  piloting: { name: 'Piloting', key: '', subsystem: true, manable: true, max: 3, desc: 'Must be manned to dodge and to jump.' },
};

/** Order in which reactor power is handed out (weapons come last). */
export const POWER_ORDER: SystemId[] = ['shields', 'engines', 'oxygen', 'medbay'];

/** Evasion % by engine power. */
export const EVASION_TABLE = [0, 5, 10, 15, 20, 25, 28, 31, 35];
