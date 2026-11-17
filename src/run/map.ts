import type { SystemId } from '../data/systems';
import { EVENTS } from './events';

export type NodeType = 'start' | 'combat' | 'event' | 'shop' | 'empty' | 'exit' | 'boss';

export interface ShopStock { weapons: string[]; crew: boolean; sold: string[]; drones?: string[]; system?: SystemId }

export interface MapNode {
  id: number;
  col: number;
  x: number; // 0..1 across the sector
  y: number; // 0..1 down the sector
  type: NodeType;
  links: number[];
  visited: boolean;
  known: boolean; // type is shown on the map
  eventId?: string;
  shop?: ShopStock;
}

export interface SectorMap { index: number; name: string; blurb: string; nodes: MapNode[]; fleet: number; fleetSpeed: number }

export const COLS = 7;
export const SECTOR_COUNT = 5;
export const SECTORS = [
  { name: 'Ember Verge', blurb: 'Scattered mining claims on the edge of settled space. Raiders pick at the stragglers.' },
  { name: 'The Shoals', blurb: 'A shallow sea of rock and ice. Smugglers hide their caches here.' },
  { name: 'Saltglass Expanse', blurb: 'Crystalline dust fields that scatter sensors. The Warden patrols grow bolder.' },
  { name: 'Hollow Drift', blurb: 'Dead stations and the hulls that killed them. Everything here is armed.' },
  { name: 'Warden\'s Gate', blurb: 'The last blockade before the free colonies. The flagship waits at the gate.' },
];

export function generateSector(index: number, rand: () => number): SectorMap {
  const nodes: MapNode[] = [];
  const cols: MapNode[][] = [];
  const last = index === SECTOR_COUNT - 1;
  for (let c = 0; c < COLS; c++) {
    const end = c === 0 || c === COLS - 1;
    const n = end ? 1 : 2 + (rand() < 0.55 ? 1 : 0);
    const col: MapNode[] = [];
    for (let i = 0; i < n; i++) {
      const y = end ? 0.5 : Math.min(0.92, Math.max(0.08, (i + 0.5) / n + (rand() - 0.5) * 0.16));
      const x = end ? c / (COLS - 1) : c / (COLS - 1) + (rand() - 0.5) * 0.06;
      const node: MapNode = { id: nodes.length, col: c, x, y, type: 'empty', links: [], visited: false, known: false };
      nodes.push(node);
      col.push(node);
    }
    cols.push(col);
  }
  const link = (a: MapNode, b: MapNode) => {
    if (a === b || a.links.includes(b.id)) return;
    a.links.push(b.id);
    b.links.push(a.id);
  };
  for (let c = 0; c < COLS - 1; c++) {
    const next = cols[c + 1];
    for (const a of cols[c]) {
      const byDist = [...next].sort((p, q) => Math.abs(p.y - a.y) - Math.abs(q.y - a.y));
      link(a, byDist[0]);
      if (byDist[1] && rand() < 0.5) link(a, byDist[1]);
    }
    for (const b of next) {
      if (!b.links.some((id) => nodes[id].col === c)) {
        link(b, [...cols[c]].sort((p, q) => Math.abs(p.y - b.y) - Math.abs(q.y - b.y))[0]);
      }
    }
    const col = cols[c];
    for (let i = 0; i + 1 < col.length; i++) if (c > 0 && rand() < 0.35) link(col[i], col[i + 1]);
  }

  // node contents
  const shopCol = cols[2 + Math.floor(rand() * 3)];
  const shopNode = shopCol[Math.floor(rand() * shopCol.length)];
  const eventIds = EVENTS.map((e) => e.id);
  for (const n of nodes) {
    if (n.col === 0) { n.type = 'start'; n.visited = n.known = true; continue; }
    if (n.col === COLS - 1) { n.type = last ? 'boss' : 'exit'; n.known = true; continue; }
    if (n === shopNode) { n.type = 'shop'; n.known = true; continue; }
    const r = rand();
    n.type = r < 0.46 ? 'combat' : r < 0.86 ? 'event' : r < 0.93 ? 'shop' : 'empty';
    if (n.type === 'shop') n.known = true;
    if (n.type === 'event') n.eventId = eventIds[Math.floor(rand() * eventIds.length)];
  }
  return { index, name: SECTORS[index].name, blurb: SECTORS[index].blurb, nodes, fleet: -1.4, fleetSpeed: 0.7 + index * 0.04 };
}

/** True once the pursuing fleet has swept past this beacon. */
export function isOverrun(map: SectorMap, n: MapNode) {
  return n.x * (COLS - 1) <= map.fleet && n.type !== 'exit' && n.type !== 'boss';
}
