import type { Crew, Room, Ship } from './ship';

const PRIORITY: Record<string, number> = { shields: 0, weapons: 1, piloting: 2, engines: 3, oxygen: 4, medbay: 5 };

const isEmergency = (r: Room) => r.fire > 0 || r.breach > 0 || (!!r.system && r.system.damage > 0);
const urgency = (r: Room) => (r.system ? PRIORITY[r.system.id] : 6) - (r.fire > 0 ? 0.5 : 0) - (r.breach > 0 ? 0.3 : 0);
const dist = (c: Crew, r: Room) => Math.abs(c.x - r.cx) + Math.abs(c.y - r.cy);

/** Crew orders for AI-controlled ships: heal, fight hazards, repair, then man stations. */
export function crewAI(ship: Ship) {
  const busy = new Set<Crew>();
  const medbay = ship.systems.medbay;

  if (medbay && medbay.power > 0) {
    for (const c of ship.crew) {
      if (c.goal === medbay.room && c.hp < c.maxHp) { busy.add(c); continue; }
      if (c.hp < 35 && ship.orderCrew(c, medbay.room)) busy.add(c);
    }
  }

  const emergencies = ship.rooms.filter(isEmergency).sort((a, b) => urgency(a) - urgency(b));
  for (const em of emergencies) {
    const need = em.fire > 50 ? 2 : 1;
    const here = ship.crew.filter((c) => c.goal === em && !busy.has(c));
    here.forEach((c) => busy.add(c));
    let have = here.length;
    while (have < need) {
      const cand = ship.crew
        .filter((c) => !busy.has(c) && !isEmergency(c.goal))
        .sort((a, b) => dist(a, em) - dist(b, em))[0];
      if (!cand || !ship.orderCrew(cand, em)) break;
      busy.add(cand);
      have++;
    }
  }

  for (const c of ship.crew) {
    if (busy.has(c) || isEmergency(c.goal)) continue;
    const sr = c.station ? ship.systems[c.station]?.room : undefined;
    if (sr && c.goal !== sr) ship.orderCrew(c, sr);
  }
}

/** Weighted random target room, favouring shields and weapons. */
export function pickTarget(target: Ship): Room {
  const weight = (r: Room) => {
    if (!r.system) return 0.4;
    return { shields: 4, weapons: 3, piloting: 2, engines: 2, oxygen: 1, medbay: 1 }[r.system.id] ?? 1;
  };
  const total = target.rooms.reduce((s, r) => s + weight(r), 0);
  let roll = Math.random() * total;
  for (const r of target.rooms) {
    roll -= weight(r);
    if (roll <= 0) return r;
  }
  return target.rooms[0];
}
