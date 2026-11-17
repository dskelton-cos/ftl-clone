import { beforeEach, describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { PLAYER_SHIPS, makeEnemyDef } from '../src/data/ships';
import { generateSector } from '../src/run/map';
import { restoreShip, serialize } from '../src/run/save';
import { Battle } from '../src/sim/battle';
import { Ship } from '../src/sim/ship';

const names = ['A', 'B', 'C', 'D', 'E'], cols = ['#fff'];
const fight = (def = PLAYER_SHIPS[0], level = 3) => {
  const p = new Ship(def, 'player', names, cols);
  p.placeAt(430, 330);
  const e = new Ship(makeEnemyDef(level, makeRng(5)), 'enemy', ['E'], ['#f00']);
  e.placeAt(1040, 330);
  return { p, e, b: new Battle(p, e) };
};
const run = (b: Battle, secs: number) => { for (let i = 0; i < secs * 60 && !b.result; i++) b.update(1 / 60); };

describe('player ships', () => {
  it('every hangar ship starts valid, connected and fully powered', () => {
    for (const def of PLAYER_SHIPS) {
      const s = new Ship(def, 'player', names, cols);
      for (const r of s.rooms) expect(s.findPath(s.crew[0].tile, r.tiles()[0])).not.toBeNull();
      expect(s.weapons.every((w) => w.on)).toBe(true);
      expect(s.reactorFree).toBeGreaterThanOrEqual(0);
      expect(s.crew.length).toBe(def.crew);
    }
  });

  it('installs a new system into an empty room', () => {
    const s = new Ship(PLAYER_SHIPS[0], 'player', names, cols);
    const free = s.freeRooms;
    expect(s.installSystem('teleporter')).toBe(true);
    expect(s.freeRooms).toBe(free - 1);
    expect(s.systems.teleporter!.room.w * s.systems.teleporter!.room.h).toBeGreaterThanOrEqual(2);
  });
});

describe('boarding', () => {
  it('teleported crew fight enemy crew and sabotage systems', () => {
    const corsair = PLAYER_SHIPS.find((d) => d.id === 'corsair')!;
    const { p, e, b } = fight(corsair);
    const tp = p.systems.teleporter!;
    const team = p.crew.slice(0, 3);
    team.forEach((c) => p.orderCrew(c, tp.room));
    run(b, 6);
    const room = e.rooms.filter((r) => r.system).sort((a, c) => c.w * c.h - a.w * a.h)[0];
    const enemyHp = () => b.crewOf('enemy').reduce((t, c) => t + c.hp, 0);
    const hp0 = enemyHp();
    expect(b.teleport(p, e, room)).toBe(3);
    expect(e.crew.filter((c) => c.owner === 'player').length).toBe(3);
    run(b, 20);
    const wrecked = e.rooms.some((r) => r.system && (r.system.damage > 0 || r.system.sabotage > 0));
    expect(wrecked || enemyHp() < hp0 - 50 || b.result === 'win').toBe(true);
  });

  it('recall brings boarders home', () => {
    const corsair = PLAYER_SHIPS.find((d) => d.id === 'corsair')!;
    const { p, e, b } = fight(corsair);
    const c = p.crew[1];
    p.orderCrew(c, p.systems.teleporter!.room);
    run(b, 5);
    b.teleport(p, e, e.rooms[0]);
    expect(e.crew.includes(c)).toBe(true);
    expect(b.recall(p, e)).toBe(1);
    expect(p.crew.includes(c)).toBe(true);
  });
});

describe('cloaking', () => {
  it('freezes enemy weapon charge and boosts evasion', () => {
    const shade = PLAYER_SHIPS.find((d) => d.id === 'shade')!;
    const { p, e, b } = fight(shade);
    run(b, 1);
    const before = e.weapons[0].charge;
    expect(p.cloak()).toBe(true);
    run(b, 2);
    expect(e.weapons[0].charge).toBeCloseTo(before, 1);
    expect(p.evasion).toBeGreaterThanOrEqual(60);
  });
});

describe('drones', () => {
  beforeEach(() => { /* deterministic enough: guard always fires when a missile is in range */ });
  it('a guard drone shoots down incoming missiles', () => {
    const bastion = PLAYER_SHIPS.find((d) => d.id === 'bastion')!;
    const { p, e, b } = fight(bastion);
    expect(p.droneOn(0)).toBe('ok');
    expect(p.droneParts).toBe(5);
    e.weapons.forEach((w) => (w.desiredOn = false));
    e.weapons = [];
    e.addWeapon('lance');
    e.systems.weapons!.level = 3;
    e.weaponOn(0);
    e.weapons[0].charge = 99;
    e.weapons[0].target = p.systems.shields!.room;
    const hull = p.hull;
    run(b, 3);
    expect(p.hull).toBe(hull);
    expect(b.intercepts).toBeGreaterThan(0);
  });
});

describe('save', () => {
  it('round-trips the ship and run', () => {
    const s = new Ship(PLAYER_SHIPS[1], 'player', names, cols);
    s.scrap = 77; s.hull = 19; s.addWeapon('pike'); s.installSystem('teleporter');
    s.systems.shields!.level = 6;
    const map = generateSector(2, makeRng(9));
    const data = JSON.parse(JSON.stringify(serialize(s, { sector: 2, kills: 4, jumps: 9, current: map.nodes[0], map })));
    const r = restoreShip(data.ship);
    expect(r.def.id).toBe('bastion');
    expect(r.scrap).toBe(77);
    expect(r.hull).toBe(19);
    expect(r.weapons.map((w) => w.def.id)).toEqual(s.weapons.map((w) => w.def.id));
    expect(r.systems.teleporter).toBeDefined();
    expect(r.systems.shields!.level).toBe(6);
    expect(r.crew.length).toBe(s.crew.length);
    expect(data.run.map.nodes.length).toBe(map.nodes.length);
  });
});
