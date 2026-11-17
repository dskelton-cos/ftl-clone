import type { Game } from '../core/game';
import { COLS, isOverrun, type MapNode } from '../run/map';

const FIELD_W = 1036, FIELD_H = 340, PAD_X = 34, PAD_Y = 26;
const px = (n: MapNode) => ({ x: PAD_X + n.x * (FIELD_W - PAD_X * 2), y: PAD_Y + n.y * (FIELD_H - PAD_Y * 2) });

const GLYPH: Record<string, string> = { start: '◆', combat: '!', event: '?', shop: '$', empty: '·', exit: '»', boss: '★' };
const LABEL: Record<string, string> = { start: 'Sector entry', combat: 'Hostile beacon', event: 'Beacon', shop: 'Store', empty: 'Empty beacon', exit: 'Sector exit', boss: 'Warden flagship' };

export function renderMap(g: Game): string {
  const st = g.flow.state;
  if (!st) return '';
  const map = st.map, cur = st.current, p = g.player!;
  const reach = new Set(cur.links);
  const fleetW = Math.max(0, PAD_X + (map.fleet / (COLS - 1)) * (FIELD_W - PAD_X * 2));
  let lines = '';
  for (const n of map.nodes) {
    for (const id of n.links) {
      if (id < n.id) continue;
      const m = map.nodes[id], a = px(n), b = px(m);
      const hot = (n === cur && reach.has(m.id)) || (m === cur && reach.has(n.id));
      lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${hot ? 'hot' : ''}"/>`;
    }
  }
  let nodes = '';
  for (const n of map.nodes) {
    const { x, y } = px(n);
    const known = n.known || n.visited;
    const glyph = !known ? '?' : n.visited && n.type === 'combat' ? '✕' : GLYPH[n.type];
    const cls = [
      'node', known ? `t-${n.type}` : 't-unknown', n.visited ? 'visited' : '', n === cur ? 'current' : '',
      reach.has(n.id) ? 'reach' : '', g.flow.focus === n.id ? 'focus' : '', isOverrun(map, n) ? 'overrun' : '',
    ].join(' ');
    nodes += `<div class="${cls}" style="left:${x}px;top:${y}px" data-act="node" data-arg="${n.id}">${glyph}</div>`;
  }
  const here = px(cur);
  const f = g.flow.focus !== null ? map.nodes[g.flow.focus] : null;
  let info = '';
  if (f) {
    const known = f.known || f.visited;
    const label = known ? (f.visited && f.type !== 'shop' && f.type !== 'exit' && f.type !== 'boss' ? 'Visited beacon' : LABEL[f.type]) : 'Unknown beacon';
    if (f === cur) info = `<b>You are here.</b> ${cur.type === 'exit' ? (g.device === 'pad' ? 'Press A' : 'Click or press Enter') + ' to leave the sector.' : ''}`;
    else if (reach.has(f.id)) info = `<b>${label}</b> · costs 1 fuel${isOverrun(map, f) ? ' · <span class="danger">overrun by the fleet</span>' : ''}`;
    else info = `${label} · out of jump range`;
  }
  const pad = g.device === 'pad';
  const lead = map.fleet - cur.x * (COLS - 1);
  const warn = lead > -1 ? '<span class="danger">The fleet is right behind you</span>' : `Fleet ${Math.round(-lead * 10) / 10} jumps behind`;
  return `<div class="mapbox">
    <div class="maphead"><b>SECTOR ${st.sector + 1}/5 · ${map.name.toUpperCase()}</b><span>${warn}</span></div>
    <div class="mapfield">
      <div class="fleet" style="width:${fleetW}px"></div>
      <svg width="${FIELD_W}" height="${FIELD_H}">${lines}</svg>
      ${nodes}
      <div class="here" style="left:${here.x}px;top:${here.y}px"></div>
    </div>
    <div class="mapfoot"><div class="info">${info}</div>
      ${p.fuel <= 0 ? `<button class="mbtn danger" data-act="distress">Distress signal ${pad ? '<kbd>X</kbd>' : ''}</button>` : ''}
      <button class="mbtn" data-act="upgrades">Upgrades <kbd>${pad ? 'Y' : 'U'}</kbd></button></div>
  </div>`;
}
