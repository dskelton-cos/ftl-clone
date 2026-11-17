import { SYSTEM_INFO, POWER_ORDER, EVASION_TABLE, type SystemId } from '../data/systems';
import { WEAPONS, type WeaponDef } from '../data/weapons';
import type { ShipDef } from '../data/ships';

export const TILE = 38;
export const CREW_SPEED = 2.4; // tiles per second
const REPAIR_RATE = 0.28; // system bars per second per crew
const FIRE_FIGHT = 22; // fire intensity removed per second per crew
const BREACH_FIX = 26; // breach points repaired per second per crew
const STATIONS: SystemId[] = ['piloting', 'weapons', 'shields', 'engines'];

export interface Tile { x: number; y: number }
export const tkey = (x: number, y: number) => `${x},${y}`;

export class Room {
  oxygen = 100;
  fire = 0; // 0..100 intensity
  breach = 0; // 0..100, >0 means an open hull breach
  fireAcc = 0;
  system: ShipSystem | null = null;
  constructor(public id: number, public x: number, public y: number, public w: number, public h: number) {}
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  tiles(): Tile[] {
    const t: Tile[] = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) t.push({ x: this.x + i, y: this.y + j });
    return t;
  }
  contains(tx: number, ty: number) {
    return tx >= this.x && tx < this.x + this.w && ty >= this.y && ty < this.y + this.h;
  }
}

export class ShipSystem {
  damage = 0;
  ion = 0;
  ionTimer = 0;
  repair = 0;
  desired = 0; // power the player asked for
  power = 0; // power actually delivered this tick
  constructor(public id: SystemId, public level: number, public room: Room) {}
  get info() { return SYSTEM_INFO[this.id]; }
  /** Bars that can currently receive power. */
  get cap() { return Math.max(0, this.level - this.damage - this.ion); }
}

export class Weapon {
  desiredOn = false;
  on = false;
  charge = 0;
  target: Room | null = null;
  burstLeft = 0;
  burstTimer = 0;
  burstRoom: Room | null = null;
  constructor(public def: WeaponDef) {}
  get ready() { return this.on && this.charge >= this.def.charge; }
}

export type CrewTask = 'idle' | 'man' | 'repair' | 'fire' | 'breach' | 'walk';

export class Crew {
  hp = 100;
  maxHp = 100;
  path: Tile[] = [];
  task: CrewTask = 'idle';
  goal: Room;
  station: SystemId | null = null;
  anim = Math.random() * 10;
  flash = 0;
  facing = 1;
  constructor(public name: string, public color: string, public x: number, public y: number, public room: Room) {
    this.goal = room;
  }
  get tile(): Tile { return { x: Math.floor(this.x), y: Math.floor(this.y) }; }
  get moving() { return this.path.length > 0; }
}

export class Door {
  open = 0; // seconds remaining open
  constructor(public a: Tile, public b: Tile, public ra: Room, public rb: Room) {}
  /** True when the door sits in a vertical wall (rooms side by side). */
  get vertical() { return this.a.x !== this.b.x; }
  other(r: Room) { return r === this.ra ? this.rb : this.ra; }
}

export type PowerResult = 'ok' | 'reactor' | 'max' | 'damaged' | 'none' | 'weapons';

export class Ship {
  rooms: Room[];
  doors: Door[] = [];
  systems: Partial<Record<SystemId, ShipSystem>> = {};
  weapons: Weapon[];
  crew: Crew[] = [];
  deaths: Crew[] = [];
  hull: number;
  maxHull: number;
  reactor: number;
  reactorFree = 0;
  missiles: number;
  scrap = 0;
  shieldLayers = 0;
  shieldCharge = 0;
  shieldFlash = 0;
  jumpCharge = 0;
  evasion = 0;
  ox = 0;
  oy = 0;
  gridW: number;
  gridH: number;
  dead = false;
  private tileRoom = new Map<string, Room>();
  private doorMap = new Map<string, Door>();

  constructor(public def: ShipDef, public side: 'player' | 'enemy', crewNames: string[], crewColors: string[]) {
    this.rooms = def.rooms.map((r, i) => new Room(i, r.x, r.y, r.w, r.h));
    for (const r of this.rooms) for (const t of r.tiles()) this.tileRoom.set(tkey(t.x, t.y), r);
    this.gridW = Math.max(...this.rooms.map((r) => r.x + r.w));
    this.gridH = Math.max(...this.rooms.map((r) => r.y + r.h));
    def.rooms.forEach((rd, i) => {
      if (!rd.system) return;
      const s = new ShipSystem(rd.system, def.systems[rd.system] ?? 1, this.rooms[i]);
      this.rooms[i].system = s;
      this.systems[rd.system] = s;
    });
    for (const id of POWER_ORDER) {
      const s = this.systems[id];
      if (s) s.desired = def.power[id] ?? 0;
    }
    this.weapons = def.weapons.map((id) => {
      const w = new Weapon(WEAPONS[id]);
      w.desiredOn = true;
      return w;
    });
    this.hull = this.maxHull = def.hull;
    this.reactor = def.reactor;
    this.missiles = def.missiles;
    this.buildDoors();

    const stations = STATIONS.filter((s) => this.systems[s]);
    for (let i = 0; i < def.crew; i++) {
      const station = stations[i] ?? null;
      const room = station ? this.systems[station]!.room : this.rooms.find((r) => !r.system) ?? this.rooms[0];
      const t = this.freeTile(room, null) ?? room.tiles()[0];
      const c = new Crew(crewNames[i % crewNames.length], crewColors[i % crewColors.length], t.x + 0.5, t.y + 0.5, room);
      c.station = station;
      this.crew.push(c);
    }
    this.updatePower();
    const sh = this.systems.shields;
    this.shieldLayers = sh ? Math.floor(sh.power / 2) : 0;
  }

  // ---------- layout ----------

  private buildDoors() {
    for (const r1 of this.rooms) {
      for (const r2 of this.rooms) {
        if (r1 === r2) continue;
        if (r1.x + r1.w === r2.x) {
          const lo = Math.max(r1.y, r2.y), hi = Math.min(r1.y + r1.h, r2.y + r2.h);
          if (hi - lo >= 1) {
            const ty = Math.floor((lo + hi - 1) / 2);
            this.addDoor({ x: r1.x + r1.w - 1, y: ty }, { x: r2.x, y: ty }, r1, r2);
          }
        }
        if (r1.y + r1.h === r2.y) {
          const lo = Math.max(r1.x, r2.x), hi = Math.min(r1.x + r1.w, r2.x + r2.w);
          if (hi - lo >= 1) {
            const tx = Math.floor((lo + hi - 1) / 2);
            this.addDoor({ x: tx, y: r1.y + r1.h - 1 }, { x: tx, y: r2.y }, r1, r2);
          }
        }
      }
    }
  }

  private addDoor(a: Tile, b: Tile, ra: Room, rb: Room) {
    const d = new Door(a, b, ra, rb);
    this.doors.push(d);
    this.doorMap.set(`${tkey(a.x, a.y)}|${tkey(b.x, b.y)}`, d);
    this.doorMap.set(`${tkey(b.x, b.y)}|${tkey(a.x, a.y)}`, d);
  }

  roomAtTile(x: number, y: number) { return this.tileRoom.get(tkey(x, y)) ?? null; }
  doorBetween(a: Tile, b: Tile) { return this.doorMap.get(`${tkey(a.x, a.y)}|${tkey(b.x, b.y)}`) ?? null; }

  neighbors(t: Tile): Tile[] {
    const out: Tile[] = [];
    const here = this.roomAtTile(t.x, t.y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      const r = this.roomAtTile(n.x, n.y);
      if (!r) continue;
      if (r === here || this.doorBetween(t, n)) out.push(n);
    }
    return out;
  }

  /** BFS over tiles. Returns the path excluding the start tile, or null. */
  findPath(start: Tile, goal: Tile): Tile[] | null {
    const sk = tkey(start.x, start.y), gk = tkey(goal.x, goal.y);
    if (sk === gk) return [];
    const prev = new Map<string, Tile | null>([[sk, null]]);
    const q: Tile[] = [start];
    while (q.length) {
      const t = q.shift()!;
      for (const n of this.neighbors(t)) {
        const k = tkey(n.x, n.y);
        if (prev.has(k)) continue;
        prev.set(k, t);
        if (k === gk) {
          const path: Tile[] = [n];
          let p = t;
          while (tkey(p.x, p.y) !== sk) { path.unshift(p); p = prev.get(tkey(p.x, p.y))!; }
          return path;
        }
        q.push(n);
      }
    }
    return null;
  }

  freeTile(room: Room, who: Crew | null): Tile | null {
    if (who && who.goal === room && !who.moving && room.contains(who.x, who.y)) return who.tile;
    const occ = new Set(
      this.crew.filter((c) => c !== who).map((c) => {
        const d = c.moving ? c.path[c.path.length - 1] : c.tile;
        return tkey(d.x, d.y);
      }),
    );
    return room.tiles().find((t) => !occ.has(tkey(t.x, t.y))) ?? null;
  }

  /** Send a crew member to a room. Returns false if the room is full or unreachable. */
  orderCrew(c: Crew, room: Room): boolean {
    const dest = this.freeTile(room, c);
    if (!dest) return false;
    const start = c.moving ? c.path[0] : c.tile;
    const p = this.findPath(start, dest);
    if (!p) return false;
    c.path = c.moving ? [c.path[0], ...p] : p;
    c.goal = room;
    return true;
  }

  // ---------- power ----------

  updatePower() {
    let remaining = this.reactor;
    for (const id of POWER_ORDER) {
      const s = this.systems[id];
      if (!s) continue;
      s.power = Math.max(0, Math.min(s.desired, s.cap, remaining));
      remaining -= s.power;
    }
    const ws = this.systems.weapons;
    const wcap = ws ? ws.cap : 0;
    let used = 0;
    for (const w of this.weapons) {
      const c = w.def.power;
      w.on = w.desiredOn && used + c <= wcap && c <= remaining;
      // A weapon knocked offline by damage or ions stays off until repowered.
      if (!w.on) w.desiredOn = false;
      else { used += c; remaining -= c; }
    }
    if (ws) ws.power = used;
    const p = this.systems.piloting;
    if (p) p.power = p.cap;
    this.reactorFree = remaining;
  }

  addPower(id: SystemId): PowerResult {
    const s = this.systems[id];
    if (!s || s.info.subsystem || id === 'weapons') return 'none';
    this.updatePower();
    if (s.power >= s.cap) return s.cap < s.level ? 'damaged' : 'max';
    if (this.reactorFree <= 0) return 'reactor';
    s.desired = s.power + 1;
    this.updatePower();
    return 'ok';
  }

  removePower(id: SystemId): PowerResult {
    const s = this.systems[id];
    if (!s || s.info.subsystem || id === 'weapons') return 'none';
    this.updatePower();
    if (s.power <= 0) return 'max';
    s.desired = s.power - 1;
    this.updatePower();
    return 'ok';
  }

  weaponOn(i: number): PowerResult {
    const w = this.weapons[i];
    const ws = this.systems.weapons;
    if (!w || !ws) return 'none';
    this.updatePower();
    if (w.on) return 'ok';
    if (ws.power + w.def.power > ws.cap) return ws.cap < ws.level ? 'damaged' : 'weapons';
    if (this.reactorFree < w.def.power) return 'reactor';
    w.desiredOn = true;
    this.updatePower();
    return w.on ? 'ok' : 'reactor';
  }

  weaponOff(i: number) {
    const w = this.weapons[i];
    if (!w) return;
    w.desiredOn = false;
    this.updatePower();
  }

  isManned(s: ShipSystem | undefined): boolean {
    return !!s && this.crew.some((c) => c.room === s.room && c.task === 'man');
  }

  get canJump() {
    const eng = this.systems.engines;
    return this.isManned(this.systems.piloting) && !!eng && eng.power > 0;
  }

  // ---------- simulation ----------

  update(dt: number) {
    this.updatePower();
    for (const s of Object.values(this.systems)) {
      if (s.ion > 0) {
        s.ionTimer -= dt;
        if (s.ionTimer <= 0) { s.ion--; s.ionTimer = s.ion > 0 ? 5 : 0; }
      }
    }
    this.updateCrew(dt);
    this.updateRooms(dt);
    this.updatePower();

    const sh = this.systems.shields;
    const maxL = sh ? Math.floor(sh.power / 2) : 0;
    if (this.shieldLayers > maxL) this.shieldLayers = maxL;
    if (this.shieldLayers < maxL) {
      this.shieldCharge += dt / (this.isManned(sh) ? 1.7 : 2.0);
      if (this.shieldCharge >= 1) { this.shieldLayers++; this.shieldCharge = 0; }
    } else this.shieldCharge = 0;
    this.shieldFlash = Math.max(0, this.shieldFlash - dt);

    const wm = this.isManned(this.systems.weapons) ? 1.1 : 1;
    for (const w of this.weapons) {
      if (w.on) w.charge = Math.min(w.def.charge, w.charge + dt * wm);
      else w.charge = Math.max(0, w.charge - (dt * w.def.charge) / 2);
    }

    const eng = this.systems.engines, pil = this.systems.piloting;
    if (!eng || !pil || pil.power <= 0 || eng.power <= 0) this.evasion = 0;
    else {
      const pm = this.isManned(pil);
      if (!pm && pil.level < 2) this.evasion = 0;
      else {
        let ev = EVASION_TABLE[Math.min(eng.power, 8)] + (this.isManned(eng) ? 5 : 0) + (pm ? 5 : 0);
        if (!pm) ev = Math.floor(ev / 2);
        this.evasion = ev;
      }
    }
    if (this.side === 'player' && this.canJump) {
      this.jumpCharge = Math.min(1, this.jumpCharge + dt * (0.022 + 0.011 * eng!.power));
    }
  }

  private updateCrew(dt: number) {
    const manned = new Set<Room>();
    const medbay = this.systems.medbay;
    for (const c of this.crew) {
      c.anim += dt;
      c.flash = Math.max(0, c.flash - dt);
      if (c.moving) {
        c.task = 'walk';
        const t = c.path[0];
        const cur = c.tile;
        if (t.x !== cur.x || t.y !== cur.y) {
          const d = this.doorBetween(cur, t);
          if (d) d.open = 0.6;
        }
        const tx = t.x + 0.5, ty = t.y + 0.5;
        const dx = tx - c.x, dy = ty - c.y;
        const dist = Math.hypot(dx, dy);
        const step = CREW_SPEED * dt;
        if (dx) c.facing = Math.sign(dx);
        if (dist <= step) {
          c.x = tx; c.y = ty;
          c.path.shift();
          c.room = this.roomAtTile(t.x, t.y) ?? c.room;
        } else {
          c.x += (dx / dist) * step;
          c.y += (dy / dist) * step;
        }
      } else {
        const r = c.room;
        if (r.fire > 0) { c.task = 'fire'; r.fire = Math.max(0, r.fire - FIRE_FIGHT * dt); }
        else if (r.breach > 0) { c.task = 'breach'; r.breach = Math.max(0, r.breach - BREACH_FIX * dt); }
        else if (r.system && r.system.damage > 0) {
          c.task = 'repair';
          r.system.repair += dt * REPAIR_RATE;
          if (r.system.repair >= 1) { r.system.damage--; r.system.repair = 0; }
        } else if (r.system && r.system.info.manable && !manned.has(r)) { c.task = 'man'; manned.add(r); }
        else c.task = 'idle';
      }
      // hazards and healing
      const r = c.room;
      if (r.oxygen < 5) c.hp -= 6 * dt;
      if (r.fire > 0) c.hp -= 9 * dt * (r.fire / 100);
      if (medbay && r === medbay.room && medbay.power > 0) c.hp = Math.min(c.maxHp, c.hp + 9 * medbay.power * dt);
    }
    const alive: Crew[] = [];
    for (const c of this.crew) (c.hp > 0 ? alive : this.deaths).push(c);
    this.crew = alive;
  }

  private updateRooms(dt: number) {
    const o2 = this.systems.oxygen;
    const op = o2 ? o2.power : 0;
    for (const r of this.rooms) {
      r.oxygen += op > 0 ? op * 3 * dt : -0.6 * dt;
      if (r.breach > 0) r.oxygen -= 16 * dt;
      if (r.fire > 0) {
        r.oxygen -= 4 * dt * (r.fire / 100);
        if (r.oxygen > 15) r.fire = Math.min(100, r.fire + 6 * dt);
        else r.fire = Math.max(0, r.fire - 25 * dt);
        if (r.system) {
          r.fireAcc += (dt * r.fire) / 100;
          if (r.fireAcc >= 5) {
            r.fireAcc = 0;
            if (r.system.damage < r.system.level) r.system.damage++;
          }
        }
        if (r.fire > 60) {
          for (const d of this.doors) {
            if (d.ra !== r && d.rb !== r) continue;
            const o = d.other(r);
            if (o.fire <= 0 && Math.random() < 0.05 * dt) o.fire = 25;
          }
        }
      }
      r.oxygen = Math.max(0, Math.min(100, r.oxygen));
    }
    for (const d of this.doors) {
      if (d.open <= 0) continue;
      d.open -= dt;
      const diff = (d.ra.oxygen - d.rb.oxygen) * Math.min(1, dt * 3) * 0.5;
      d.ra.oxygen -= diff;
      d.rb.oxygen += diff;
    }
  }

  /** Patch the ship up between encounters (hull damage stays). */
  refit() {
    for (const s of Object.values(this.systems)) { s.damage = 0; s.ion = 0; s.ionTimer = 0; s.repair = 0; }
    for (const r of this.rooms) { r.oxygen = 100; r.fire = 0; r.breach = 0; r.fireAcc = 0; }
    for (const w of this.weapons) { w.charge = 0; w.target = null; w.burstLeft = 0; w.burstRoom = null; }
    this.jumpCharge = 0;
    this.updatePower();
    const sh = this.systems.shields;
    this.shieldLayers = sh ? Math.floor(sh.power / 2) : 0;
    this.shieldCharge = 0;
    this.dead = false;
  }

  // ---------- geometry (pixels) ----------

  get pxW() { return this.gridW * TILE; }
  get pxH() { return this.gridH * TILE; }
  placeAt(cx: number, cy: number) {
    this.ox = Math.round(cx - this.pxW / 2);
    this.oy = Math.round(cy - this.pxH / 2);
  }
  center() { return { x: this.ox + this.pxW / 2, y: this.oy + this.pxH / 2 }; }
  shieldRadii() { return { rx: this.pxW / 2 + 62, ry: this.pxH / 2 + 54 }; }
  insideShield(x: number, y: number) {
    const c = this.center(), { rx, ry } = this.shieldRadii();
    return ((x - c.x) / rx) ** 2 + ((y - c.y) / ry) ** 2 <= 1;
  }
  roomRect(r: Room) {
    return { x: this.ox + r.x * TILE, y: this.oy + r.y * TILE, w: r.w * TILE, h: r.h * TILE };
  }
  roomAtPixel(x: number, y: number): Room | null {
    const tx = (x - this.ox) / TILE, ty = (y - this.oy) / TILE;
    return this.rooms.find((r) => r.contains(tx, ty)) ?? null;
  }
  crewPx(c: Crew) { return { x: this.ox + c.x * TILE, y: this.oy + c.y * TILE }; }
  mountPoint(i: number) {
    const top = i % 2 === 0;
    const x = this.side === 'player' ? this.ox + this.pxW * 0.74 : this.ox + this.pxW * 0.26;
    return { x, y: top ? this.oy - 16 : this.oy + this.pxH + 16 };
  }
}
