import { describe, expect, it } from 'vitest';
import { PLAYER_SHIP, makeEnemyDef } from '../src/data/ships';
import { makeRng } from '../src/core/rng';
import { Battle } from '../src/sim/battle';
import { Ship } from '../src/sim/ship';
import { navRoom } from '../src/core/game';

const mkPlayer = () => new Ship(PLAYER_SHIP, 'player', ['A', 'B', 'C', 'D'], ['#fff']);

describe('ship layout', () => {
  it('connects every room by doors', () => {
    const s = mkPlayer();
    for (const r of s.rooms) {
      const p = s.findPath({ x: 0, y: 1 }, r.tiles()[0]);
      expect(p).not.toBeNull();
    }
  });

  it('starts crew at their stations', () => {
    const s = mkPlayer();
    expect(s.crew.map((c) => c.room.system?.id)).toEqual(['piloting', 'weapons', 'shields', 'engines']);
  });

  it('moves crew to an ordered room', () => {
    const s = mkPlayer();
    const c = s.crew[0];
    const med = s.systems.medbay!.room;
    expect(s.orderCrew(c, med)).toBe(true);
    for (let i = 0; i < 600; i++) s.update(1 / 60);
    expect(c.room).toBe(med);
    expect(c.moving).toBe(false);
  });
});

describe('power', () => {
  it('respects the reactor limit', () => {
    const s = mkPlayer();
    expect(s.reactorFree).toBe(0);
    expect(s.addPower('medbay')).toBe('reactor');
    expect(s.removePower('engines')).toBe('ok');
    expect(s.addPower('medbay')).toBe('ok');
    expect(s.systems.medbay!.power).toBe(1);
  });

  it('drops power from damaged systems and restores it after repair', () => {
    const s = mkPlayer();
    const sh = s.systems.shields!;
    sh.damage = 1;
    s.updatePower();
    expect(sh.power).toBe(1);
    sh.damage = 0;
    s.updatePower();
    expect(sh.power).toBe(2);
  });

  it('powers weapons down when the weapons system is damaged', () => {
    const s = mkPlayer();
    expect(s.weapons.every((w) => w.on)).toBe(true);
    s.systems.weapons!.damage = 2;
    s.updatePower();
    expect(s.weapons[0].on).toBe(false);
    expect(s.weapons[1].on).toBe(true);
  });
});

describe('battle', () => {
  it('runs a full encounter to a result', () => {
    const rand = makeRng(42);
    const player = mkPlayer();
    player.placeAt(430, 330);
    const enemy = new Ship(makeEnemyDef(1, rand), 'enemy', ['E'], ['#f00']);
    enemy.placeAt(1040, 330);
    const b = new Battle(player, enemy);
    player.weapons.forEach((w) => (w.target = enemy.systems.shields!.room));
    for (let i = 0; i < 60 * 300 && !b.result; i++) b.update(1 / 60);
    expect(b.result).not.toBeNull();
  });
});

describe('cursor navigation', () => {
  it('snaps to the room in the pressed direction', () => {
    const s = mkPlayer();
    const weapons = s.systems.weapons!.room;
    expect(navRoom(s, weapons, 'RIGHT')).toBe(s.systems.piloting!.room);
    expect(navRoom(s, s.systems.piloting!.room, 'LEFT')).toBe(weapons);
  });
});
