import { describe, expect, it } from 'vitest';
import { makeRng } from '../src/core/rng';
import { PLAYER_SHIP, makeBossDef, makeEnemyDef } from '../src/data/ships';
import { WEAPONS } from '../src/data/weapons';
import { EVENTS } from '../src/run/events';
import { COLS, generateSector } from '../src/run/map';
import { Battle } from '../src/sim/battle';
import { Ship } from '../src/sim/ship';

describe('sector map', () => {
  it('always connects the start to the exit', () => {
    for (let seed = 1; seed < 200; seed++) {
      const map = generateSector(seed % 5, makeRng(seed));
      const seen = new Set([0]);
      const q = [0];
      while (q.length) for (const id of map.nodes[q.shift()!].links) if (!seen.has(id)) { seen.add(id); q.push(id); }
      expect(seen.size).toBe(map.nodes.length);
      const exit = map.nodes.find((n) => n.col === COLS - 1)!;
      expect(exit.type).toBe(seed % 5 === 4 ? 'boss' : 'exit');
      expect(map.nodes.some((n) => n.type === 'shop')).toBe(true);
    }
  });
});

describe('content', () => {
  it('every enemy and boss design is valid and fully connected', () => {
    const designs = [makeBossDef(), ...Array.from({ length: 60 }, (_, i) => makeEnemyDef(1 + (i % 12), makeRng(i)))];
    for (const def of designs) {
      const s = new Ship(def, 'enemy', ['E'], ['#f00']);
      for (const w of def.weapons) expect(WEAPONS[w]).toBeDefined();
      expect(s.weapons.every((w) => w.on)).toBe(true);
      for (const r of s.rooms) expect(s.findPath(s.rooms[0].tiles()[0], r.tiles()[0])).not.toBeNull();
    }
  });

  it('every event has choices and outcomes', () => {
    for (const e of EVENTS) {
      expect(e.choices.length).toBeGreaterThan(0);
      for (const c of e.choices) expect(c.outcomes.length).toBeGreaterThan(0);
    }
  });
});

describe('beams', () => {
  const setup = (shields: number) => {
    const p = new Ship(PLAYER_SHIP, 'player', ['A'], ['#fff']);
    p.placeAt(430, 330);
    const def = makeEnemyDef(1, makeRng(3));
    def.systems.shields = shields;
    def.power.shields = shields;
    def.reactor += shields;
    const e = new Ship(def, 'enemy', ['E'], ['#f00']);
    e.placeAt(1040, 330);
    e.weapons.forEach((w) => (w.desiredOn = false));
    p.weapons = [];
    p.addWeapon('cleaver');
    p.systems.weapons!.level = 3;
    p.weaponOn(0);
    p.weapons[0].charge = 99;
    p.weapons[0].target = e.systems.weapons!.room;
    const b = new Battle(p, e);
    for (let i = 0; i < 120; i++) b.update(1 / 60);
    return e;
  };
  it('cuts through rooms when shields are down', () => {
    const e = setup(0);
    expect(e.hull).toBeLessThan(e.maxHull - 2);
  });
  it('is fully blocked by enough shield layers', () => {
    const e = setup(4);
    expect(e.hull).toBe(e.maxHull);
  });
});
