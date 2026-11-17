import type { Game, Menu, MenuItem } from '../core/game';
import { CREW_COLORS, CREW_NAMES } from '../data/crew';
import { PLAYER_SHIPS, makeBossDef, makeEnemyDef, type ShipDef } from '../data/ships';
import { DRONES } from '../data/drones';
import { INSTALLABLE, SYSTEM_INFO, type SystemId } from '../data/systems';
import { WEAPONS } from '../data/weapons';
import type { PadButton } from '../input/gamepad';
import type { BattleResult } from '../sim/battle';
import { Ship } from '../sim/ship';
import { EVENTS, type Choice, type Effects, type EventDef } from './events';
import { clearSave, restoreShip, serialize, writeSave, type SaveData } from './save';
import { SECTORS, SECTOR_COUNT, generateSector, isOverrun, type MapNode, type SectorMap } from './map';

export interface RunState {
  sector: number;
  map: SectorMap;
  current: MapNode;
  kills: number;
  jumps: number;
  battleKind: 'normal' | 'fleet' | 'boss';
}

const UPGRADE_COST: Record<SystemId, (lvl: number) => number> = {
  shields: (l) => 20 + l * 8,
  engines: (l) => 12 + l * 5,
  weapons: (l) => 18 + l * 6,
  oxygen: (l) => 25 * l,
  medbay: (l) => 25 * l,
  piloting: (l) => 20 * l,
  cloaking: (l) => 30 + 20 * l,
  teleporter: (l) => 30 + 20 * l,
  drones: (l) => 15 + l * 6,
};
const MAX_REACTOR = 25;

/** Everything between fights: the sector map, jumping, beacons, events, stores, loot and upgrades. */
export class RunFlow {
  state: RunState | null = null;
  focus: number | null = null;

  constructor(private g: Game) {}

  private get p() { return this.g.player!; }
  private get s() { return this.state!; }
  private rnd() { return this.g.rand(); }

  // ---------- run lifecycle ----------

  /** Ship selection before a run. */
  hangar() {
    const g = this.g;
    const wname = (id: string) => WEAPONS[id].name;
    g.openMenu({
      title: 'HANGAR',
      body: 'Choose your ship.',
      items: [
        ...PLAYER_SHIPS.map((d): MenuItem => {
          const systems = Object.keys(d.systems).map((k) => SYSTEM_INFO[k as SystemId].name).join(', ');
          return {
            label: d.name,
            sub: d.tagline,
            detail: `${d.desc}<br><span class="stats-line">Hull ${d.hull} · Reactor ${d.reactor} · Crew ${d.crew} · Weapons: ${d.weapons.map(wname).join(', ')}${d.drones?.length ? ` · Drones: ${d.drones.map((x) => DRONES[x].name).join(', ')}` : ''}<br>Systems: ${systems}</span>`,
            action: () => this.start(d),
          };
        }),
        { label: 'Back', action: () => g.showTitle() },
      ],
      back: () => g.showTitle(),
    });
  }

  start(def: ShipDef = PLAYER_SHIPS[0]) {
    const g = this.g;
    clearSave();
    g.player = new Ship(def, 'player', CREW_NAMES, CREW_COLORS);
    g.player.scrap = 20;
    g.player.fuel = 12;
    const map = generateSector(0, g.rand);
    this.state = { sector: 0, map, current: map.nodes[0], kills: 0, jumps: 0, battleKind: 'normal' };
    g.renderer.makeBackground(Math.floor(this.rnd() * 1e9));
    g.showMap();
    this.sectorIntro();
  }

  resume(data: SaveData) {
    const g = this.g;
    g.player = restoreShip(data.ship);
    const map = data.run.map;
    this.state = {
      sector: data.run.sector, map, current: map.nodes[data.run.current] ?? map.nodes[0],
      kills: data.run.kills, jumps: data.run.jumps, battleKind: 'normal',
    };
    g.renderer.makeBackground(Math.floor(this.rnd() * 1e9));
    g.showMap();
    g.toast(`Resumed: sector ${data.run.sector + 1}, ${map.name}`);
  }

  /** Snapshot the run for saving (only called on the map, between beacons). */
  snapshot(): SaveData | null {
    if (!this.state || !this.g.player) return null;
    return serialize(this.g.player, this.state);
  }

  save() {
    const d = this.snapshot();
    if (d) writeSave(d);
  }

  private sectorIntro() {
    const s = this.s;
    const story = s.sector === 0
      ? `<br><br>You carry the last intact copy of the Charter Archive. The Warden fleet wants it back. Cross ${SECTOR_COUNT} sectors and break through the gate.<br><br>Each jump burns <b>1 fuel</b>. The red tide on the map is the fleet: it advances every time you jump, and any beacon it covers is crawling with Warden ships.`
      : '';
    this.g.openMenu({
      title: `SECTOR ${s.sector + 1}: ${s.map.name.toUpperCase()}`,
      body: s.map.blurb + story,
      items: [{ label: 'Set course', action: () => this.g.closeMenu() }],
      back: () => this.g.closeMenu(),
    });
  }

  private nextSector() {
    const s = this.s;
    s.sector++;
    s.map = generateSector(s.sector, this.g.rand);
    s.current = s.map.nodes[0];
    this.g.renderer.makeBackground(Math.floor(this.rnd() * 1e9));
    this.g.showMap();
    this.sectorIntro();
  }

  private gameOver() {
    const g = this.g, s = this.s;
    g.mode = 'over';
    g.battle = null;
    clearSave();
    g.recordBest(s.sector + 1);
    g.openMenu({
      title: 'SHIP LOST',
      body: `Your ship was destroyed in sector ${s.sector + 1}, ${s.map.name}.<br>Hostiles defeated: <b>${s.kills}</b> · Jumps: <b>${s.jumps}</b> · Furthest sector reached: <b>${Math.min(g.best, SECTOR_COUNT)}</b>`,
      items: [
        { label: 'New Run', action: () => this.start() },
        { label: 'Title Screen', action: () => g.showTitle() },
      ],
    });
  }

  private victory() {
    const g = this.g, s = this.s;
    g.mode = 'over';
    g.battle = null;
    clearSave();
    g.recordBest(SECTOR_COUNT + 1);
    g.openMenu({
      title: 'THE GATE IS OPEN',
      body: `The Warden flagship breaks apart behind you. The Charter Archive reaches the free colonies intact.<br><br>Hostiles defeated: <b>${s.kills}</b> · Jumps: <b>${s.jumps}</b> · Crew surviving: <b>${this.p.crew.length}</b>`,
      items: [
        { label: 'New Run', action: () => this.start() },
        { label: 'Title Screen', action: () => g.showTitle() },
      ],
    });
  }

  // ---------- map ----------

  reachable(): MapNode[] {
    const s = this.s;
    return s.current.links.map((id) => s.map.nodes[id]);
  }

  focusDefault() {
    if (!this.state) return;
    const r = this.reachable().sort((a, b) => b.x - a.x);
    this.focus = (r[0] ?? this.s.current).id;
  }

  /** Threat level of combat at the current beacon. */
  level() {
    return 1 + this.s.sector * 2 + Math.floor(this.s.current.col / 3);
  }

  jumpTo(n: MapNode) {
    const s = this.s, p = this.p, g = this.g;
    if (n === s.current) {
      if (n.type === 'exit') this.exitPrompt();
      return;
    }
    if (!s.current.links.includes(n.id)) { g.sfx.play('deny'); return g.toast('Out of jump range'); }
    if (p.fuel < 1) { g.sfx.play('deny'); return g.toast('Out of fuel! Send a distress signal.'); }
    p.fuel--;
    s.jumps++;
    s.map.fleet += s.map.fleetSpeed;
    s.current = n;
    for (const c of p.crew) c.hp = Math.min(c.maxHp, c.hp + 30);
    p.refit();
    g.renderer.makeBackground(Math.floor(this.rnd() * 1e9));
    g.sfx.play('jump');
    this.focusDefault();
    this.arrive(n);
  }

  private arrive(n: MapNode) {
    const s = this.s, g = this.g;
    const first = !n.visited;
    n.visited = n.known = true;
    if (isOverrun(s.map, n)) {
      return g.openMenu({
        title: 'FLEET CONTACT',
        body: 'The Warden fleet has overrun this beacon. A pursuit cruiser breaks formation and locks on.',
        items: [{ label: 'Battle stations', action: () => this.fight('fleet') }],
      });
    }
    if (!first && n.type !== 'shop' && n.type !== 'exit' && n.type !== 'boss') return g.toast('Nothing left at this beacon.');
    switch (n.type) {
      case 'combat': return this.fight('normal');
      case 'event': return this.runEvent(EVENTS.find((e) => e.id === n.eventId) ?? EVENTS[0]);
      case 'shop': return this.openShop(n);
      case 'exit': return this.exitPrompt();
      case 'boss':
        return g.openMenu({
          title: 'THE WARDEN FLAGSHIP',
          body: 'The gate looms ahead, and between you and it hangs the Warden flagship: heavy shields, a full battery and a crew of six. There is no going around it.',
          items: [
            { label: 'Engage', action: () => this.fight('boss') },
            { label: 'Prepare first', sub: 'Back to the map', action: () => g.closeMenu() },
          ],
        });
      default: return g.toast('A quiet beacon. Nothing but cold stars.');
    }
  }

  private exitPrompt() {
    const g = this.g;
    g.openMenu({
      title: 'SECTOR EXIT',
      body: `A jump to <b>${SECTORS[this.s.sector + 1]?.name ?? 'the gate'}</b> is plotted. Once you leave, you can't come back to this sector.`,
      items: [
        { label: 'Jump to the next sector', action: () => this.nextSector() },
        { label: 'Not yet', action: () => g.closeMenu() },
      ],
      back: () => g.closeMenu(),
    });
  }

  distress() {
    const g = this.g, p = this.p, s = this.s;
    if (p.fuel > 0) return g.toast('You still have fuel');
    g.openMenu({
      title: 'DISTRESS SIGNAL',
      body: 'Broadcast for help? Anyone could answer, and the fleet will hear it too.',
      items: [
        {
          label: 'Broadcast', action: () => {
            s.map.fleet += s.map.fleetSpeed;
            if (this.rnd() < 0.55) {
              p.fuel += 3;
              g.openMenu({ title: 'DISTRESS SIGNAL', body: 'A passing hauler answers and transfers <b>3 fuel</b>.', items: [{ label: 'Continue', action: () => g.closeMenu() }] });
            } else {
              g.openMenu({ title: 'DISTRESS SIGNAL', body: 'Raiders answer the call. They are not here to help.', items: [{ label: 'Battle stations', action: () => this.fight('normal') }] });
            }
          },
        },
        { label: 'Cancel', action: () => g.closeMenu() },
      ],
      back: () => g.closeMenu(),
    });
  }

  // ---------- combat ----------

  private fight(kind: RunState['battleKind']) {
    const s = this.s;
    s.battleKind = kind;
    if (kind === 'boss') return this.g.startBattle(makeBossDef());
    const def = makeEnemyDef(this.level() + (kind === 'fleet' ? 2 : 0), this.g.rand);
    if (kind === 'fleet') def.name = 'Warden Pursuer';
    this.g.startBattle(def);
  }

  onBattleEnd(result: BattleResult) {
    if (result === 'fled') return this.g.showMap();
    if (result === 'lose') return this.gameOver();
    this.s.kills++;
    if (this.s.battleKind === 'boss') return this.victory();
    this.loot();
  }

  private loot() {
    const g = this.g, s = this.s, p = this.p;
    const b = g.battle!;
    const lvl = this.level();
    let scrap = 10 + lvl * 3 + Math.floor(this.rnd() * 8) + (b.crewKill ? 15 : 0);
    if (s.battleKind === 'fleet') scrap = Math.floor(scrap / 2);
    const fx: Effects = { scrap };
    if (this.rnd() < 0.65) fx.fuel = 1 + Math.floor(this.rnd() * 3);
    if (this.rnd() < 0.4) fx.missiles = 1 + Math.floor(this.rnd() * 2);
    if (this.rnd() < 0.12) fx.weapon = true;
    if (this.rnd() < (p.systems.drones ? 0.5 : 0.15)) fx.droneParts = 1 + Math.floor(this.rnd() * 2);
    const lines = this.apply(fx);
    g.mode = 'map';
    g.battle = null;
    const menu: Menu = {
      title: b.crewKill ? 'ENEMY CREW ELIMINATED' : 'HOSTILE DESTROYED',
      body: `Salvage recovered: ${lines.join(' · ')}`,
      items: [
        { label: 'Continue', sub: 'Back to the map', action: () => g.showMap() },
        { label: 'Ship upgrades', action: () => this.upgrades(() => g.openMenu(menu)) },
      ],
      back: () => g.showMap(),
    };
    g.openMenu(menu);
  }

  // ---------- events ----------

  private runEvent(ev: EventDef) {
    const g = this.g;
    g.openMenu({
      title: ev.title.toUpperCase(),
      body: ev.text,
      wide: ev.choices.length > 2,
      items: ev.choices.map((c): MenuItem => ({
        label: c.label,
        sub: this.requireText(c),
        disabled: () => !this.affordable(c),
        action: () => this.choose(ev, c),
      })),
    });
  }

  private requireText(c: Choice) {
    const r = c.require;
    if (!r) return undefined;
    return Object.entries(r).map(([k, v]) => `needs ${v} ${k}`).join(', ');
  }

  private affordable(c: Choice) {
    const r = c.require, p = this.p;
    if (!r) return true;
    return (r.scrap ?? 0) <= p.scrap && (r.fuel ?? 0) <= p.fuel && (r.missiles ?? 0) <= p.missiles;
  }

  private choose(ev: EventDef, c: Choice) {
    const g = this.g;
    const total = c.outcomes.reduce((t, o) => t + (o.weight ?? 1), 0);
    let roll = this.rnd() * total;
    const o = c.outcomes.find((x) => (roll -= x.weight ?? 1) <= 0) ?? c.outcomes[0];
    const lines = o.effects ? this.apply(o.effects) : [];
    g.openMenu({
      title: ev.title.toUpperCase(),
      body: `${o.text}${lines.length ? `<br><br>${lines.join(' · ')}` : ''}`,
      items: o.fight
        ? [{ label: 'Battle stations', action: () => this.fight('normal') }]
        : [{ label: 'Continue', action: () => g.closeMenu() }],
    });
  }

  /** Apply event or loot effects; returns a readable summary. */
  private apply(e: Effects): string[] {
    const p = this.p, s = this.s, out: string[] = [];
    const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    if (e.scrap) { p.scrap = Math.max(0, p.scrap + e.scrap); out.push(`<b>${sign(e.scrap)} scrap</b>`); }
    if (e.fuel) { p.fuel = Math.max(0, p.fuel + e.fuel); out.push(`<b>${sign(e.fuel)} fuel</b>`); }
    if (e.droneParts) { p.droneParts = Math.max(0, p.droneParts + e.droneParts); out.push(`<b>${sign(e.droneParts)} drone parts</b>`); }
    if (e.missiles) { p.missiles = Math.max(0, p.missiles + e.missiles); out.push(`<b>${sign(e.missiles)} missiles</b>`); }
    if (e.hull) { p.hull = Math.max(1, Math.min(p.maxHull, p.hull + e.hull)); out.push(`<b>${sign(e.hull)} hull</b>`); }
    if (e.crewHp) {
      for (const c of p.crew) c.hp = Math.max(1, Math.min(c.maxHp, c.hp + e.crewHp));
      out.push(e.crewHp > 0 ? '<b>crew healed</b>' : `<b>crew injured</b>`);
    }
    if (e.newCrew) {
      const name = CREW_NAMES.find((n) => !p.crew.some((c) => c.name === n)) ?? 'Recruit';
      const c = p.addCrew(name, CREW_COLORS[Math.floor(this.rnd() * CREW_COLORS.length)]);
      out.push(c ? `<b>${name} joins the crew</b>` : 'no room aboard for another crew member');
    }
    if (e.weapon) out.push(this.giveWeapon(this.randomWeapon()));
    if (e.upgrade) {
      const opts = Object.values(p.systems).filter((sy) => sy.level < SYSTEM_INFO[sy.id].max);
      const sy = opts[Math.floor(this.rnd() * opts.length)];
      if (sy) { sy.level++; out.push(`<b>${SYSTEM_INFO[sy.id].name} upgraded</b>`); }
    }
    if (e.fleet) { s.map.fleet += e.fleet; out.push(e.fleet < 0 ? '<b>the fleet falls behind</b>' : '<b>the fleet gains on you</b>'); }
    return out;
  }

  private randomWeapon() {
    const ids = Object.keys(WEAPONS);
    return ids[Math.floor(this.rnd() * ids.length)];
  }

  private giveWeapon(id: string) {
    const p = this.p, w = WEAPONS[id];
    if (p.addWeapon(id)) return `<b>new weapon: ${w.name}</b>`;
    const val = Math.floor(w.price / 2);
    p.scrap += val;
    return `${w.name} found, but no free slot: sold for <b>${val} scrap</b>`;
  }

  // ---------- store & upgrades ----------

  private openShop(n: MapNode) {
    if (!n.shop) {
      const ids = Object.keys(WEAPONS).sort(() => this.rnd() - 0.5).slice(0, 3);
      const drones = Object.keys(DRONES).sort(() => this.rnd() - 0.5).slice(0, 1 + Math.floor(this.rnd() * 2));
      const sys = INSTALLABLE[Math.floor(this.rnd() * INSTALLABLE.length)].id;
      n.shop = { weapons: ids, crew: this.rnd() < 0.65, sold: [], drones, system: sys };
    }
    this.showShop(n);
  }

  private showShop(n: MapNode, focus = 0) {
    const g = this.g, p = this.p, shop = n.shop!;
    const buy = (cost: number, fn: () => void) => () => {
      if (p.scrap < cost) return g.sfx.play('deny');
      p.scrap -= cost;
      fn();
      p.updatePower();
      this.showShop(n, g.menuFocus);
    };
    const fullRepair = 2 * (p.maxHull - p.hull);
    const items: MenuItem[] = [
      { label: 'Leave store', sub: 'Back to the map', action: () => g.closeMenu() },
      { label: 'Fuel +1', sub: '3 scrap', action: buy(3, () => p.fuel++), disabled: () => p.scrap < 3 },
      { label: 'Missiles +3', sub: '8 scrap', action: buy(8, () => (p.missiles += 3)), disabled: () => p.scrap < 8 },
      { label: 'Repair hull +5', sub: '9 scrap', action: buy(9, () => (p.hull = Math.min(p.maxHull, p.hull + 5))), disabled: () => p.scrap < 9 || p.hull >= p.maxHull },
      { label: 'Repair all hull', sub: fullRepair ? `${fullRepair} scrap` : 'hull is full', action: buy(fullRepair, () => (p.hull = p.maxHull)), disabled: () => p.scrap < fullRepair || p.hull >= p.maxHull },
    ];
    for (const id of shop.weapons) {
      if (shop.sold.includes(id)) continue;
      const w = WEAPONS[id];
      items.push({
        label: `Buy ${w.name}`,
        sub: `${w.price} scrap · ${w.power} power`,
        detail: w.desc,
        action: buy(w.price, () => { p.addWeapon(id); shop.sold.push(id); }),
        disabled: () => p.scrap < w.price || p.weapons.length >= Ship.MAX_WEAPONS,
      });
    }
    if (shop.drones) {
      for (const id of shop.drones) {
        if (shop.sold.includes(id)) continue;
        const d = DRONES[id];
        items.push({
          label: `Buy ${d.name}`, sub: `${d.price} scrap · ${d.power} power`, detail: `${d.desc} Needs Drone Control.`,
          action: buy(d.price, () => { p.addDrone(id); shop.sold.push(id); }),
          disabled: () => p.scrap < d.price || p.drones.length >= Ship.MAX_DRONES || !p.systems.drones,
        });
      }
    }
    if (shop.system && !p.systems[shop.system]) {
      const inst = INSTALLABLE.find((x) => x.id === shop.system)!;
      const info = SYSTEM_INFO[inst.id];
      items.push({
        label: `Install ${info.name}`, sub: `${inst.price} scrap`, detail: `${info.desc} Needs an empty room (you have ${p.freeRooms}).`,
        action: buy(inst.price, () => p.installSystem(inst.id)),
        disabled: () => p.scrap < inst.price || p.freeRooms === 0,
      });
    }
    items.push({ label: 'Drone parts +2', sub: '8 scrap', action: buy(8, () => (p.droneParts += 2)), disabled: () => p.scrap < 8 });
    if (shop.crew) {
      items.push({
        label: 'Hire crew', sub: '35 scrap',
        action: buy(35, () => { this.apply({ newCrew: true }); shop.crew = false; }),
        disabled: () => p.scrap < 35 || p.crew.length >= Ship.MAX_CREW,
      });
    }
    items.push({ label: 'Sell gear', action: () => this.sellMenu(n), disabled: () => p.weapons.length <= 1 && !p.drones.length });
    items.push({ label: 'Ship upgrades', action: () => this.upgrades(() => this.showShop(n)) });
    g.openMenu({
      title: 'STORE',
      body: `A trading post bolted to an old relay. You have <b>${p.scrap} scrap</b>, ${p.fuel} fuel, ${p.missiles} missiles, ${p.droneParts} drone parts. Weapons ${p.weapons.length}/${Ship.MAX_WEAPONS}, drones ${p.drones.length}/${Ship.MAX_DRONES}.`,
      items,
      wide: true,
      back: () => g.closeMenu(),
    });
    g.menuFocus = Math.min(focus, items.length - 1);
  }

  private sellMenu(n: MapNode) {
    const g = this.g, p = this.p;
    g.openMenu({
      title: 'SELL GEAR',
      body: 'Stores pay half price.',
      items: [
        ...p.weapons.map((w, i): MenuItem => ({
          label: `Sell ${w.def.name}`,
          sub: `+${Math.floor(w.def.price / 2)} scrap`,
          action: () => { p.scrap += Math.floor(w.def.price / 2); p.removeWeapon(i); g.sfx.play('click'); this.showShop(n); },
          disabled: () => p.weapons.length <= 1,
        })),
        ...p.drones.map((d, i): MenuItem => ({
          label: `Sell ${d.def.name}`,
          sub: `+${Math.floor(d.def.price / 2)} scrap`,
          action: () => { p.scrap += Math.floor(d.def.price / 2); p.removeDrone(i); g.sfx.play('click'); this.showShop(n); },
        })),
        { label: 'Back', action: () => this.showShop(n) },
      ],
      back: () => this.showShop(n),
    });
  }

  upgrades(back: () => void, focus = 0) {
    const g = this.g, p = this.p;
    const reactorCost = 20 + p.reactor * 3;
    const items: MenuItem[] = [
      { label: 'Done', action: back },
      {
        label: `Reactor ${p.reactor} → ${p.reactor + 1}`, sub: `${reactorCost} scrap`,
        disabled: () => p.scrap < reactorCost || p.reactor >= MAX_REACTOR,
        action: () => { p.scrap -= reactorCost; p.reactor++; p.updatePower(); g.sfx.play('click'); this.upgrades(back, g.menuFocus); },
      },
    ];
    for (const sy of Object.values(p.systems)) {
      const info = SYSTEM_INFO[sy.id];
      const cost = UPGRADE_COST[sy.id](sy.level);
      const maxed = sy.level >= info.max;
      items.push({
        label: `${info.name} ${sy.level}${maxed ? ' (max)' : ` → ${sy.level + 1}`}`,
        sub: maxed ? '' : `${cost} scrap`,
        disabled: () => maxed || p.scrap < cost,
        action: () => { p.scrap -= cost; sy.level++; p.updatePower(); g.sfx.play('click'); this.upgrades(back, g.menuFocus); },
      });
    }
    g.openMenu({
      title: 'SHIP UPGRADES',
      body: `You have <b>${p.scrap} scrap</b>. Upgrades raise a system's maximum power. Remember to route power to it in combat.`,
      items,
      wide: true,
      back,
    });
    g.menuFocus = Math.min(focus, items.length - 1);
  }

  // ---------- map input ----------

  padInput(btn: PadButton) {
    const g = this.g;
    switch (btn) {
      case 'UP': case 'DOWN': case 'LEFT': case 'RIGHT': return this.moveFocus(btn);
      case 'A': return this.activateFocus();
      case 'Y': return this.upgrades(() => g.closeMenu());
      case 'X': return this.distress();
      case 'BACK': case 'START': return g.openPauseMenu();
    }
  }

  keyInput(e: KeyboardEvent) {
    const map: Record<string, PadButton> = {
      ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
      Enter: 'A', ' ': 'A', u: 'Y', U: 'Y', Escape: 'BACK',
    };
    const b = map[e.key];
    if (b) { e.preventDefault(); this.padInput(b); }
  }

  click(id: number) {
    const n = this.state?.map.nodes[id];
    if (!n) return;
    this.focus = id;
    this.jumpTo(n);
  }

  private activateFocus() {
    const n = this.focus !== null ? this.s.map.nodes[this.focus] : null;
    if (n) this.jumpTo(n);
  }

  private moveFocus(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
    const s = this.s;
    const cands = [s.current, ...this.reachable()];
    const from = s.map.nodes[this.focus ?? s.current.id];
    const [dx, dy] = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[dir];
    let best: MapNode | null = null, bestScore = Infinity;
    for (const n of cands) {
      if (n === from) continue;
      const vx = (n.x - from.x) * 1000, vy = (n.y - from.y) * 350;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const score = along + Math.abs(vx * dy - vy * dx) * 2;
      if (score < bestScore) { bestScore = score; best = n; }
    }
    if (best) { this.focus = best.id; this.g.sfx.play('click'); }
  }
}
