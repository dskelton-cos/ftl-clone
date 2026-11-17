import type { WeaponDef } from '../data/weapons';
import { boarderAI, crewAI, pickTarget } from './ai';
import { TILE, type Crew, type Drone, type Room, type Ship, type Side, type Weapon } from './ship';

export interface Projectile {
  def: WeaponDef;
  owner: Ship;
  target: Ship;
  room: Room;
  x: number; y: number;
  tx: number; ty: number;
  vx: number; vy: number;
  checked: boolean;
  miss: boolean;
  life: number;
  dead: boolean;
}

export interface Beam {
  def: WeaponDef;
  owner: Ship;
  target: Ship;
  mx: number; my: number; // emitter
  x0: number; y0: number; x1: number; y1: number; // sweep across the target
  px: number; py: number; // current beam tip
  t: number;
  dur: number;
  hit: Set<Room>;
  blocked: boolean;
}

const DRONE_SHOT: WeaponDef = {
  id: 'drone', name: 'Drone', kind: 'laser', shots: 1, damage: 1, ion: 0, power: 0, charge: 0, pierce: false, ammo: false,
  fireChance: 0.05, breachChance: 0.05, speed: 700, beamLength: 0, price: 0, desc: '',
};

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
export interface FloatText { x: number; y: number; text: string; color: string; life: number }
export type BattleResult = 'win' | 'lose' | 'fled' | null;
export type SfxName = 'laser' | 'missile' | 'ion' | 'beam' | 'teleport' | 'cloak' | 'drone' | 'alarm' | 'hit' | 'shield' | 'miss' | 'explode' | 'death';

/** One encounter between the player and an enemy ship. Pure simulation: no DOM, no rendering. */
export class Battle {
  projectiles: Projectile[] = [];
  beams: Beam[] = [];
  zaps: { x0: number; y0: number; x1: number; y1: number; life: number }[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  sfx: SfxName[] = [];
  time = 0;
  result: BattleResult = null;
  resultTime = 0;
  crewKill = false;
  intercepts = 0;
  shake = 0;
  private aiTimer = 0;
  private boomTimer = 0;

  constructor(public player: Ship, public enemy: Ship) {
    enemy.updatePower();
    crewAI(enemy);
    for (const w of enemy.weapons) w.target = pickTarget(player);
  }

  /** All living crew belonging to a side, wherever they are. */
  crewOf(side: Side): Crew[] {
    return [...this.player.crew, ...this.enemy.crew].filter((c) => c.owner === side);
  }

  shipOf(c: Crew): Ship | null {
    return this.player.crew.includes(c) ? this.player : this.enemy.crew.includes(c) ? this.enemy : null;
  }

  // ---------- teleporter ----------

  /** Beam every idle crew member standing in `from`'s teleporter room onto `room` of `to`. */
  teleport(from: Ship, to: Ship, room: Room): number {
    const tp = from.systems.teleporter;
    if (!tp || !from.canTeleport || to.dead) return 0;
    const party = from.crew.filter((c) => c.owner === from.side && c.room === tp.room && !c.moving);
    if (!party.length) return 0;
    let sent = 0;
    for (const c of party) if (this.moveCrew(c, from, to, room)) sent++;
    if (sent) {
      from.teleCharge = 0;
      this.sfx.push('teleport');
    }
    return sent;
  }

  /** Bring a side's crew home from the other ship. */
  recall(home: Ship, away: Ship, force = false): number {
    const tp = home.systems.teleporter;
    if (!force && (!tp || tp.power <= 0)) return 0;
    const party = away.crew.filter((c) => c.owner === home.side);
    const dest = tp?.room ?? home.rooms[0];
    let n = 0;
    for (const c of party) if (this.moveCrew(c, away, home, dest)) n++;
    if (n) this.sfx.push('teleport');
    return n;
  }

  private moveCrew(c: Crew, from: Ship, to: Ship, room: Room): boolean {
    const rooms = [room, ...to.rooms.filter((r) => r !== room).sort((a, b) => Math.abs(a.cx - room.cx) + Math.abs(a.cy - room.cy) - Math.abs(b.cx - room.cx) - Math.abs(b.cy - room.cy))];
    for (const r of rooms) {
      const t = to.freeTile(r, null);
      if (!t) continue;
      const p0 = from.crewPx(c);
      this.burst(p0.x, p0.y, '#c58bff', 10, 70);
      from.crew = from.crew.filter((o) => o !== c);
      c.path = [];
      c.x = t.x + 0.5;
      c.y = t.y + 0.5;
      c.room = c.goal = r;
      to.crew.push(c);
      const p1 = to.crewPx(c);
      this.burst(p1.x, p1.y, '#c58bff', 12, 70);
      return true;
    }
    return false;
  }

  // ---------- enemy abilities ----------

  private enemyAbilities() {
    const e = this.enemy, p = this.player;
    // Cloak when the player's guns are about to fire.
    if (e.canCloak && p.weapons.some((w) => w.on && w.charge >= w.def.charge - 0.5 && w.target)) {
      if (e.cloak()) this.sfx.push('cloak');
    }
    // Boarding party: two crew (never the pilot) head to the teleporter and beam over.
    const tp = e.systems.teleporter;
    if (tp && tp.power > 0 && !p.crew.some((c) => c.owner === 'enemy')) {
      const home = e.crew.filter((c) => c.owner === 'enemy');
      let party = home.filter((c) => c.boarding);
      if (!party.length && home.length >= 3 && e.teleCharge >= 1) {
        party = home.filter((c) => c.station !== 'piloting' && c.hp > 60).slice(0, 2);
        party.forEach((c) => { c.boarding = true; e.orderCrew(c, tp.room); });
      }
      if (party.length && party.every((c) => c.room === tp.room && !c.moving) && e.teleCharge >= 1) {
        const targets = p.rooms.filter((r) => r.system && ['shields', 'weapons', 'piloting', 'engines'].includes(r.system.id));
        const room = targets[Math.floor(Math.random() * targets.length)] ?? p.rooms[0];
        if (this.teleport(e, p, room)) this.text(p.center().x, p.oy - 30, 'INTRUDERS!', '#ff6b6b');
      }
    }
  }

  // ---------- drones ----------

  private updateDrones(dt: number) {
    for (const [ship, other] of [[this.player, this.enemy], [this.enemy, this.player]] as const) {
      for (const d of ship.drones) {
        if (!d.on) continue;
        d.angle += dt * (d.def.kind === 'strike' ? 0.7 : 1.1);
        d.timer -= dt;
        if (d.timer > 0) continue;
        if (d.def.kind === 'strike') {
          if (other.dead || ship.dead) continue;
          d.timer = d.def.rate;
          const from = this.dronePos(d, other);
          const room = pickTarget(other);
          const rr = other.roomRect(room);
          const tx = rr.x + rr.w / 2, ty = rr.y + rr.h / 2;
          const len = Math.hypot(tx - from.x, ty - from.y) || 1;
          const def = { ...DRONE_SHOT, damage: d.def.damage, name: d.def.name };
          this.projectiles.push({
            def, owner: ship, target: other, room, x: from.x, y: from.y, tx, ty,
            vx: ((tx - from.x) / len) * def.speed, vy: ((ty - from.y) / len) * def.speed,
            checked: false, miss: false, life: 3, dead: false,
          });
          this.sfx.push('drone');
        } else {
          const me = ship.center();
          const threat = this.projectiles.find((p) => p.target === ship && !p.dead && !p.miss && d.def.targets.includes(p.def.kind) && Math.hypot(p.x - me.x, p.y - me.y) < 360);
          if (!threat) continue;
          d.timer = d.def.rate;
          threat.dead = true;
          this.intercepts++;
          const from = this.dronePos(d, ship);
          this.zaps.push({ x0: from.x, y0: from.y, x1: threat.x, y1: threat.y, life: 0.15 });
          this.burst(threat.x, threat.y, '#9fe6ff', 10, 90);
          this.sfx.push('drone');
        }
      }
    }
    for (const z of this.zaps) z.life -= dt;
    this.zaps = this.zaps.filter((z) => z.life > 0);
  }

  /** Orbit position of a drone around the ship it circles. */
  dronePos(d: Drone, around: Ship) {
    const c = around.center(), { rx, ry } = around.shieldRadii();
    const k = d.def.kind === 'strike' ? 1.12 : 0.92;
    return { x: c.x + Math.cos(d.angle) * rx * k, y: c.y + Math.sin(d.angle) * ry * k };
  }

  update(dt: number) {
    this.time += dt;
    const active = this.result === null;
    this.player.chargeFrozen = this.enemy.cloakTime > 0;
    this.enemy.chargeFrozen = this.player.cloakTime > 0;
    const hullBefore = this.player.hull;
    this.player.update(dt);
    if (!this.enemy.dead) this.enemy.update(dt);
    for (const ship of [this.player, this.enemy]) {
      for (const c of ship.deaths) {
        const p = ship.crewPx(c);
        this.burst(p.x, p.y, '#ff4b4b', 14, 80);
        this.text(p.x, p.y - 14, c.owner === 'player' ? `${c.name} lost` : 'Enemy crew killed', c.owner === 'player' ? '#ff7b7b' : '#ffd27f');
        this.sfx.push('death');
      }
      ship.deaths.length = 0;
    }

    if (active) {
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 0.4;
        crewAI(this.enemy);
        boarderAI(this.player, 'enemy');
        this.enemyAbilities();
        for (const w of this.enemy.weapons) if (!w.target) w.target = pickTarget(this.player);
      }
      this.updateDrones(dt);
      this.fireWeapons(this.player, this.enemy, dt);
      this.fireWeapons(this.enemy, this.player, dt);
    }

    this.updateProjectiles(dt);
    this.updateBeams(dt);
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) { t.y -= 22 * dt; t.life -= dt; }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);

    if (hullBefore > this.player.maxHull * 0.3 && this.player.hull <= this.player.maxHull * 0.3) this.sfx.push('alarm');

    if (active) {
      if (this.enemy.hull <= 0 || this.crewOf('enemy').length === 0) {
        this.result = 'win';
        this.crewKill = this.enemy.hull > 0;
        // Boarders come home if the enemy crew is gone; if the ship blows up they go with it.
        if (this.crewKill) this.recall(this.player, this.enemy, true);
        else {
          for (const c of this.enemy.crew.filter((o) => o.owner === 'player')) {
            const p = this.enemy.crewPx(c);
            this.text(p.x, p.y - 14, `${c.name} lost`, '#ff7b7b');
          }
        }
        this.enemy.crew = this.enemy.crew.filter((c) => c.owner === 'enemy');
        this.player.crew = this.player.crew.filter((c) => c.owner === 'player');
        this.enemy.dead = true;
        this.sfx.push('explode');
      } else if (this.player.hull <= 0 || this.crewOf('player').length === 0) {
        this.result = 'lose';
        this.player.dead = true;
        this.sfx.push('explode');
      }
    } else {
      this.resultTime += dt;
      const loser = this.result === 'win' ? this.enemy : this.result === 'lose' ? this.player : null;
      if (loser && this.resultTime < 1.6) {
        this.boomTimer -= dt;
        if (this.boomTimer <= 0) {
          this.boomTimer = 0.09;
          const x = loser.ox + Math.random() * loser.pxW, y = loser.oy + Math.random() * loser.pxH;
          this.burst(x, y, Math.random() < 0.5 ? '#ffb347' : '#ff5e3a', 16, 160);
        }
      }
    }
  }

  private fireWeapons(ship: Ship, target: Ship, dt: number) {
    ship.weapons.forEach((w, i) => {
      if (w.burstLeft > 0) {
        w.burstTimer -= dt;
        if (w.burstTimer <= 0) {
          this.spawnShot(ship, target, w, i);
          w.burstLeft--;
          w.burstTimer = 0.18;
        }
        return;
      }
      if (!w.ready || !w.target || target.dead) return;
      if (w.def.ammo) {
        if (ship.missiles <= 0) return;
        ship.missiles--;
      }
      w.charge = 0;
      w.burstLeft = w.def.shots;
      w.burstTimer = 0;
      w.burstRoom = w.target;
      if (ship.side === 'enemy') w.target = pickTarget(target);
    });
  }

  private spawnShot(ship: Ship, target: Ship, w: Weapon, i: number) {
    const m = ship.mountPoint(i);
    const room = w.burstRoom ?? target.rooms[0];
    const rr = target.roomRect(room);
    const tx = rr.x + rr.w / 2 + (Math.random() - 0.5) * (rr.w - 14);
    const ty = rr.y + rr.h / 2 + (Math.random() - 0.5) * (rr.h - 14);
    if (w.def.kind === 'beam') {
      const dir = room.cy < target.gridH / 2 ? 1 : -1;
      const y0 = rr.y + rr.h / 2 - dir * Math.min(rr.h / 2 - 6, TILE * 0.4);
      const x = rr.x + rr.w / 2 + (Math.random() - 0.5) * (rr.w - 16);
      this.beams.push({
        def: w.def, owner: ship, target, mx: m.x, my: m.y,
        x0: x, y0, x1: x, y1: y0 + dir * w.def.beamLength * TILE, px: x, py: y0,
        t: 0, dur: 0.9, hit: new Set(), blocked: false,
      });
      this.sfx.push('beam');
      return;
    }
    const d = Math.hypot(tx - m.x, ty - m.y) || 1;
    const s = w.def.speed;
    this.projectiles.push({
      def: w.def, owner: ship, target, room, x: m.x, y: m.y, tx, ty,
      vx: ((tx - m.x) / d) * s, vy: ((ty - m.y) / d) * s,
      checked: false, miss: false, life: 4, dead: false,
    });
    this.burst(m.x, m.y, w.def.kind === 'ion' ? '#7fd8ff' : '#ffd27f', 5, 60);
    this.sfx.push(w.def.kind === 'missile' ? 'missile' : w.def.kind === 'ion' ? 'ion' : 'laser');
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.def.kind === 'missile' && Math.random() < 0.7) {
        this.particles.push({ x: p.x, y: p.y, vx: -p.vx * 0.05, vy: -p.vy * 0.05, life: 0.4, max: 0.4, color: '#c9c9c9', size: 3 });
      }
      const t = p.target;
      if (!p.checked && t.insideShield(p.x, p.y)) {
        p.checked = true;
        if (!t.dead && Math.random() * 100 < t.evasion) {
          p.miss = true;
          p.life = 1.2;
          this.text(p.x, p.y - 10, 'MISS', '#d8e2ec');
          this.sfx.push('miss');
        } else if (!t.dead && t.shieldLayers >= 1 && !p.def.pierce) {
          t.shieldLayers--;
          t.shieldCharge = 0;
          t.shieldFlash = 0.35;
          const sh = t.systems.shields;
          if (p.def.ion > 0 && sh) { sh.ion = Math.min(sh.level, sh.ion + p.def.ion); sh.ionTimer = 5; }
          this.burst(p.x, p.y, '#7fc4ff', 12, 120);
          this.sfx.push('shield');
          p.dead = true;
          continue;
        }
      }
      if (!p.miss && (p.tx - p.x) * p.vx + (p.ty - p.y) * p.vy <= 0) {
        this.applyHit(p);
        p.dead = true;
      }
      if (p.life <= 0) p.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  private updateBeams(dt: number) {
    for (const b of this.beams) {
      b.t += dt;
      const f = Math.min(1, b.t / b.dur);
      b.px = b.x0 + (b.x1 - b.x0) * f;
      b.py = b.y0 + (b.y1 - b.y0) * f;
      const t = b.target;
      if (t.dead || f >= 1) continue;
      const dmg = b.def.damage - t.shieldLayers;
      b.blocked = dmg <= 0;
      if (t.shieldLayers > 0) t.shieldFlash = Math.max(t.shieldFlash, 0.12);
      if (b.blocked) continue;
      const room = t.roomAtPixel(b.px, b.py);
      if (room && !b.hit.has(room)) {
        b.hit.add(room);
        this.damageRoom(t, room, b.def, b.px, b.py, dmg);
      }
      if (Math.random() < 0.5) this.particles.push({ x: b.px, y: b.py, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, life: 0.4, max: 0.4, color: '#ffe08a', size: 3 });
    }
    this.beams = this.beams.filter((b) => b.t < b.dur + 0.25);
  }

  private applyHit(p: Projectile) {
    this.damageRoom(p.target, p.room, p.def, p.x, p.y, p.def.damage);
  }

  private damageRoom(target: Ship, room: Room, def: WeaponDef, x: number, y: number, damage: number) {
    const p = { x, y };
    const sys = room.system;
    if (def.kind === 'ion') {
      if (sys) { sys.ion = Math.min(sys.level, sys.ion + def.ion); sys.ionTimer = 5; }
      this.burst(p.x, p.y, '#7fd8ff', 14, 110);
      this.text(p.x, p.y - 12, 'ION', '#7fd8ff');
      this.sfx.push('shield');
      return;
    }
    target.hull = Math.max(0, target.hull - damage);
    if (sys) sys.damage = Math.min(sys.level, sys.damage + damage);
    for (const c of target.crew) {
      if (c.room === room) { c.hp -= 15 * damage; c.flash = 0.3; }
    }
    if (Math.random() < def.fireChance) room.fire = Math.max(room.fire, 40);
    if (Math.random() < def.breachChance) room.breach = 100;
    this.burst(p.x, p.y, '#ffb347', 18, 170);
    this.burst(p.x, p.y, '#fff1c1', 6, 80);
    this.text(p.x, p.y - 14, `-${damage}`, '#ffcf6b');
    if (target === this.player) this.shake = 8;
    this.sfx.push('hit');
  }

  burst(x: number, y: number, color: string, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const life = 0.35 + Math.random() * 0.45;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 2 + Math.random() * 3 });
    }
  }

  text(x: number, y: number, text: string, color: string) {
    this.texts.push({ x, y, text, color, life: 1.1 });
  }
}
