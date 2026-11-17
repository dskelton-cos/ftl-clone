import type { SystemId } from '../data/systems';

/** 24x24 stroke icons shared by the canvas (Path2D) and the HTML HUD (inline SVG). */
export const ICON_PATHS: Record<SystemId, string> = {
  shields: 'M12 2 L20 5 V11 C20 16 16.5 20 12 22 C7.5 20 4 16 4 11 V5 Z',
  engines: 'M4 6 L11 12 L4 18 M12 6 L19 12 L12 18',
  oxygen: 'M8.5 7 a5 5 0 1 0 0.01 0 Z M15.5 14 a2.2 2.2 0 1 1 3.8 1.5 L15.5 20 H20',
  medbay: 'M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z',
  weapons: 'M3 9 H15 L21 12 L15 15 H3 Z M6 15 V19 H10 V15',
  cloaking: 'M2 12 C6 6 18 6 22 12 C18 18 6 18 2 12 Z M4 20 L20 4',
  teleporter: 'M6 4 H18 M6 20 H18 M9 8 V16 M15 8 V16 M12 7 V17',
  drones: 'M12 9 L15 12 L12 15 L9 12 Z M5 5 L9 9 M19 5 L15 9 M5 19 L9 15 M19 19 L15 15 M3 5 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M17 5 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0',
  piloting: 'M12 4 a8 8 0 1 0 0.01 0 Z M12 4 V20 M4 12 H20 M12 9 a3 3 0 1 0 0.01 0 Z',
};

export function svgIcon(id: SystemId) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="${ICON_PATHS[id]}"/></svg>`;
}
