import type { Crew, Room, Ship } from './ship';

const PRIORITY: Record<string, number> = {
  shields: 0, weapons: 1, piloting: 2, engines: 3, teleporter: 4, cloaking: 4, drones: 4, oxygen: 5, medbay: 6,
};

const intruders = (ship: Ship, r: Room) => ship.crew.filter((c) => c.owner !== ship.side && c.room === r).length;
const isEmergency = (ship: Ship, r: Room) =>
  r.fire > 0 || r.breach > 0 || (!!r.system && r.system.damage > 0) || intruders(ship, r) > 0;
const urgency = (ship: Ship, r: Room) =>
  (r.system ? PRIORITY[r.system.id] ?? 6 : 7) - (r.fire > 0 ? 0.5 : 0) - (r.breach > 0 ? 0.3 : 0) - intruders(ship, r) * 2;
const dist = (c: Crew, r: Room) => Math.abs(c.x - r.cx) + Math.abs(c.y - r.cy);

/** Orders for an AI ship's own crew: heal, repel boarders, fight hazards, repair, then man stations. */
export function crewAI(ship: Ship) {
  const home = ship.crew.filter((c) => c.owner === ship.side && !c.boarding);
  const busy = new Set<Crew>();
  const medbay = ship.systems.medbay;

  if (medbay && medbay.power > 0 && intruders(ship, medbay.room) === 0) {
    for (const c of home) {
      if (c.goal === medbay.room && c.hp < c.maxHp) { busy.add(c); continue; }
      if (c.hp < 35 && ship.orderCrew(c, medbay.room)) busy.add(c);
    }
  }

  const emergencies = ship.rooms.filter((r) => isEmergency(ship, r)).sort((a, b) => urgency(ship, a) - urgency(ship, b));
  for (const em of emergencies) {
    const need = Math.max(em.fire > 50 ? 2 : 1, intruders(ship, em) + 1);
    const here = home.filter((c) => c.goal === em && !busy.has(c));
    here.forEach((c) => busy.add(c));
    let have = here.length;
    while (have < need) {
      const cand = home
        .filter((c) => !busy.has(c) && !isEmergency(ship, c.goal))
        .sort((a, b) => dist(a, em) - dist(b, em))[0];
      if (!cand || !ship.orderCrew(cand, em)) break;
      busy.add(cand);
      have++;
    }
  }

  for (const c of home) {
    if (busy.has(c) || isEmergency(ship, c.goal)) continue;
    const sr = c.station ? ship.systems[c.station]?.room : undefined;
    if (sr && c.goal !== sr) ship.orderCrew(c, sr);
  }
}

/** AI boarders aboard someone else's ship: hold while fighting, else move on to the next intact system. */
export function boarderAI(host: Ship, owner: 'player' | 'enemy') {
  for (const c of host.crew) {
    if (c.owner !== owner || c.moving) continue;
    const fighting = host.crew.some((o) => o.owner !== owner && o.room === c.room);
    const s = c.room.system;
    if (fighting || (s && s.damage < s.level)) continue;
    const next = host.rooms
      .filter((r) => r.system && r.system.damage < r.system.level)
      .sort((a, b) => (PRIORITY[a.system!.id] ?? 6) - (PRIORITY[b.system!.id] ?? 6) + (dist(c, a) - dist(c, b)) * 0.2)[0];
    if (next) host.orderCrew(c, next);
  }
}

/** Weighted random target room, favouring shields and weapons. */
export function pickTarget(target: Ship): Room {
  const W: Record<string, number> = { shields: 4, weapons: 3, piloting: 2, engines: 2, oxygen: 1, medbay: 1, cloaking: 2, teleporter: 1, drones: 2 };
  const weight = (r: Room) => (r.system ? W[r.system.id] ?? 1 : 0.4);
  const total = target.rooms.reduce((s, r) => s + weight(r), 0);
  let roll = Math.random() * total;
  for (const r of target.rooms) {
    roll -= weight(r);
    if (roll <= 0) return r;
  }
  return target.rooms[0];
}
