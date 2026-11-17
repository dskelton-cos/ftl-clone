import type { ShipDef } from '../data/ships';
import { POWER_ORDER, SYSTEM_INFO, type SystemId } from '../data/systems';
import type { PadButton } from '../input/gamepad';
import { PadInput } from '../input/gamepad';
import { ENEMY_PANEL, Renderer, type RoomRef } from '../render/renderer';
import { RunFlow } from '../run/flow';
import { clearSave, readSave } from '../run/save';
import { Battle } from '../sim/battle';
import { Ship, type Crew, type PowerResult, type Room } from '../sim/ship';
import { Music } from './music';
import { makeRng } from './rng';
import { Sfx } from './sfx';

export type Device = 'kbm' | 'pad';
export interface MenuItem {
  label: string;
  sub?: string | (() => string);
  detail?: string; // shown below the list while this item has focus
  action: () => void;
  disabled?: () => boolean;
}
export interface Menu { title: string; body?: string; items: MenuItem[]; back?: () => void; wide?: boolean }
export type PowerItem = { kind: 'sys'; id: SystemId } | { kind: 'wpn'; i: number } | { kind: 'drone'; i: number };

const ENEMY_COLORS = ['#d9534f', '#c0703c', '#b84b8a', '#a3a03a'];
const STEP = 1 / 60;

const POWER_MSG: Partial<Record<PowerResult | 'parts', string>> = {
  reactor: 'Not enough reactor power',
  damaged: 'System damaged: send crew to repair it',
  max: 'System is at full power',
  weapons: 'Not enough system capacity: power something else down',
  parts: 'No drone parts left',
};

export class Game {
  mode: 'title' | 'map' | 'battle' | 'over' = 'title';
  player: Ship | null = null;
  battle: Battle | null = null;
  paused = false;
  device: Device = 'kbm';
  selCrew: Crew | null = null;
  armed: number | null = null;
  teleArmed = false;
  powerFocus: number | null = null;
  cursor: RoomRef | null = null;
  hover: RoomRef | null = null;
  menu: Menu | null = null;
  menuFocus = 0;
  menuVersion = 0;
  toasts: { text: string; life: number }[] = [];
  best = loadBest();
  pad = new PadInput();
  sfx = new Sfx();
  music = new Music(this.sfx);
  rand = makeRng(Date.now() & 0xffffffff);
  flow: RunFlow;
  private acc = 0;
  private padName: string | null = null;
  private saveTimer = 0;
  private lastSave = '';

  constructor(public renderer: Renderer) {
    this.flow = new RunFlow(this);
    const st = loadSettings();
    this.sfx.muted = !st.sound;
    this.music.enabled = st.music;
    this.showTitle();
  }

  // ---------- flow ----------

  showTitle() {
    this.mode = 'title';
    this.battle = null;
    this.flow.state = null;
    const save = readSave();
    const items: MenuItem[] = [];
    if (save) {
      items.push({
        label: 'Continue',
        sub: `Sector ${save.run.sector + 1} · ${save.run.map.name}`,
        action: () => this.flow.resume(save),
      });
    }
    items.push(
      { label: 'New Run', sub: save ? 'Replaces your saved run' : undefined, action: () => this.flow.hangar() },
      { label: 'Controls', action: () => this.showControls(() => this.showTitle()) },
      { label: 'Settings', action: () => this.showSettings(() => this.showTitle()) },
    );
    this.openMenu({
      title: 'DRIFT PROTOCOL',
      body: 'Command a fragile starship. Divide its power, direct its crew, and outrun the Warden fleet across five sectors.',
      items,
    });
  }

  /** Begin combat against the given enemy design. The run flow decides what happens afterwards. */
  startBattle(def: ShipDef) {
    const player = this.player!;
    player.refit();
    player.placeAt(430, 330);
    const enemy = new Ship(def, 'enemy', ['Raider'], ENEMY_COLORS);
    enemy.crew.forEach((c, i) => (c.color = ENEMY_COLORS[i % ENEMY_COLORS.length]));
    enemy.placeAt(ENEMY_PANEL.x + ENEMY_PANEL.w / 2, ENEMY_PANEL.y + ENEMY_PANEL.h / 2 + 20);
    this.battle = new Battle(player, enemy);
    this.renderer.makeBackground(Math.floor(this.rand() * 1e9));
    this.mode = 'battle';
    this.paused = false;
    this.selCrew = null;
    this.armed = null;
    this.teleArmed = false;
    this.powerFocus = null;
    this.cursor = null;
    this.closeMenu();
    this.toast(`Hostile ${enemy.def.name} engaging!`);
  }

  /** Leave combat (or any screen) and return to the sector map. */
  showMap() {
    this.battle = null;
    this.mode = 'map';
    this.paused = false;
    this.closeMenu();
    this.flow.focusDefault();
  }

  openPauseMenu() {
    if (this.mode !== 'battle' && this.mode !== 'map') return;
    this.openMenu({
      title: 'PAUSED',
      body: this.mode === 'map' ? 'Your run is saved automatically while you are on the map.' : 'Your run was last saved on the map, before this fight.',
      items: [
        { label: 'Resume', action: () => this.closeMenu() },
        { label: 'Controls', action: () => this.showControls(() => this.openPauseMenu()) },
        { label: 'Settings', action: () => this.showSettings(() => this.openPauseMenu()) },
        { label: 'Save & Quit to Title', action: () => { if (this.mode === 'map') this.flow.save(); this.showTitle(); } },
        { label: 'Abandon Run', sub: 'Deletes the save', action: () => { clearSave(); this.showTitle(); } },
      ],
      back: () => this.closeMenu(),
    });
  }

  showSettings(back: () => void) {
    const reopen = () => { saveSettings({ sound: !this.sfx.muted, music: this.music.enabled }); this.showSettings(back); };
    this.openMenu({
      title: 'SETTINGS',
      items: [
        { label: `Sound effects: ${this.sfx.muted ? 'Off' : 'On'}`, action: () => { this.sfx.muted = !this.sfx.muted; reopen(); } },
        { label: `Music: ${this.music.enabled ? 'On' : 'Off'}`, action: () => { this.music.enabled = !this.music.enabled; reopen(); } },
        { label: 'Back', action: back },
      ],
      back,
    });
  }

  showControls(back: () => void) {
    this.openMenu({ title: 'CONTROLS', wide: true, body: CONTROLS_HTML, items: [{ label: 'Back', action: back }], back });
  }

  openMenu(m: Menu) {
    this.menu = m;
    this.menuFocus = 0;
    this.menuVersion++;
  }
  closeMenu() {
    this.menu = null;
    this.menuVersion++;
  }

  // ---------- frame ----------

  update(dt: number) {
    for (const b of this.pad.poll(dt)) this.onPad(b);
    if (this.pad.connected !== this.padName) {
      if (this.pad.connected) this.toast('Controller connected');
      else if (this.padName) this.toast('Controller disconnected');
      this.padName = this.pad.connected;
    }
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    const b = this.battle;
    if (this.mode === 'battle' && b && !this.menu) {
      if (!this.paused) {
        this.acc += Math.min(dt, 0.25);
        while (this.acc >= STEP) { b.update(STEP); this.acc -= STEP; }
      }
      for (const s of b.sfx) this.sfx.play(s);
      b.sfx.length = 0;
      if (this.selCrew && !b.crewOf('player').includes(this.selCrew)) this.selCrew = null;
      if (b.result === 'fled') { this.toast('Jumped away! Choose a beacon.'); this.flow.onBattleEnd('fled'); }
      else if (b.result && b.resultTime > 1.8) this.flow.onBattleEnd(b.result);
    }

    // Autosave whenever we are idle on the map.
    if (this.mode === 'map' && !this.menu) {
      this.saveTimer -= dt;
      if (this.saveTimer <= 0) {
        this.saveTimer = 1;
        const snap = this.flow.snapshot();
        const json = snap ? JSON.stringify(snap) : '';
        if (json && json !== this.lastSave) { this.flow.save(); this.lastSave = json; }
      }
    }

    this.music.update(this.mode === 'battle' && !!b && !b.result, dt);
    this.renderer.draw(
      {
        battle: this.battle, selCrew: this.selCrew, armed: this.armed, teleArmed: this.teleArmed,
        hover: this.hover, cursor: this.cursor, paused: this.paused && !this.menu,
      },
      dt,
    );
  }

  toast(text: string) {
    this.toasts.push({ text, life: 3 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  recordBest(n: number) {
    if (n > this.best) {
      this.best = n;
      try { localStorage.setItem('drift.best', String(n)); } catch { /* storage unavailable */ }
    }
  }

  /** The player's crew wherever they are (including boarders on the enemy ship). */
  playerCrew(): Crew[] {
    if (this.battle) return this.battle.crewOf('player');
    return this.player?.ownCrew ?? [];
  }

  private crewShip(c: Crew): Ship | null {
    return this.battle?.shipOf(c) ?? this.player;
  }

  // ---------- actions (shared by every input device) ----------

  togglePause() {
    if (this.mode !== 'battle' || this.menu) return;
    this.paused = !this.paused;
  }

  selectCrew(c: Crew | null) {
    this.selCrew = c;
    this.armed = null;
    this.teleArmed = false;
    if (c) this.sfx.play('click');
    const ship = c && this.crewShip(c);
    if (c && ship && this.device === 'pad') this.cursor = { ship, room: c.room };
  }

  cycleCrew(d: number) {
    const crew = this.playerCrew();
    if (!crew.length) return;
    const i = this.selCrew ? crew.indexOf(this.selCrew) : d > 0 ? -1 : 0;
    this.powerFocus = null;
    this.selectCrew(crew[(i + d + crew.length) % crew.length]);
  }

  orderMove(room: Room, ship: Ship) {
    if (!this.selCrew) return;
    const own = this.crewShip(this.selCrew);
    if (own !== ship) { this.sfx.play('deny'); return this.toast(ship.side === 'enemy' ? 'Use the teleporter to board' : 'Recall boarders with the teleporter'); }
    if (ship.orderCrew(this.selCrew, room)) this.sfx.play('click');
    else { this.sfx.play('deny'); this.toast('That room is full'); }
  }

  powerUp(id: SystemId) { this.report(this.player?.addPower(id)); }
  powerDown(id: SystemId) { this.report(this.player?.removePower(id)); }

  private report(r: PowerResult | 'parts' | undefined) {
    if (r === 'ok') return this.sfx.play('click');
    this.sfx.play('deny');
    const msg = r && POWER_MSG[r];
    if (msg && r !== 'max') this.toast(msg);
  }

  /** Primary weapon action: power it if off, otherwise arm or disarm it for targeting. */
  weaponPrimary(i: number) {
    const p = this.player;
    const w = p?.weapons[i];
    if (!p || !w || this.mode !== 'battle') return;
    if (!w.on) {
      const r = p.weaponOn(i);
      this.report(r);
      if (r !== 'ok') return;
    }
    this.armWeapon(this.armed === i ? null : i);
  }

  weaponOff(i: number) {
    const p = this.player;
    if (!p?.weapons[i]) return;
    p.weaponOff(i);
    if (this.armed === i) this.armWeapon(null);
    this.sfx.play('click');
  }

  droneToggle(i: number) {
    const p = this.player;
    const d = p?.drones[i];
    if (!p || !d || this.mode !== 'battle') return;
    if (d.on) return this.droneOff(i);
    this.report(p.droneOn(i));
  }

  droneOff(i: number) {
    this.player?.droneOff(i);
    this.sfx.play('click');
  }

  cloak() {
    const p = this.player;
    if (!p || this.mode !== 'battle') return;
    if (!p.systems.cloaking) return this.toast('No cloaking device installed');
    if (p.cloak()) this.sfx.play('cloak');
    else { this.sfx.play('deny'); this.toast(p.cloakTime > 0 ? 'Already cloaked' : p.systems.cloaking.power <= 0 ? 'Cloaking has no power' : 'Cloak recharging'); }
  }

  armTeleport() {
    const p = this.player, b = this.battle;
    if (!p || !b) return;
    const tp = p.systems.teleporter;
    if (!tp) return this.toast('No teleporter installed');
    if (!p.canTeleport) { this.sfx.play('deny'); return this.toast(tp.power <= 0 ? 'Teleporter has no power' : 'Teleporter recharging'); }
    if (!p.crew.some((c) => c.owner === 'player' && c.room === tp.room && !c.moving)) {
      this.sfx.play('deny');
      return this.toast('Move crew into the teleporter room first');
    }
    this.armed = null;
    this.powerFocus = null;
    this.teleArmed = !this.teleArmed;
    this.sfx.play('click');
    if (this.teleArmed && this.device === 'pad') this.cursor = { ship: b.enemy, room: b.enemy.systems.weapons?.room ?? b.enemy.rooms[0] };
  }

  recall() {
    const b = this.battle;
    if (!b) return;
    const n = b.recall(b.player, b.enemy);
    if (!n) { this.sfx.play('deny'); this.toast(b.enemy.crew.some((c) => c.owner === 'player') ? 'Teleporter needs power to recall' : 'Nobody to recall'); }
  }

  armWeapon(i: number | null) {
    this.armed = i;
    this.teleArmed = false;
    const b = this.battle;
    if (!b) return;
    if (i !== null) {
      this.sfx.play('click');
      if (this.device === 'pad') {
        const w = b.player.weapons[i];
        this.cursor = { ship: b.enemy, room: w.target ?? b.enemy.systems.shields?.room ?? b.enemy.rooms[0] };
      }
    } else if (this.cursor?.ship === b.enemy && !this.selCrew) {
      this.cursor = null;
    }
  }

  targetRoom(room: Room) {
    const b = this.battle;
    if (!b) return;
    if (this.teleArmed) {
      this.teleArmed = false;
      const n = b.teleport(b.player, b.enemy, room);
      if (!n) { this.sfx.play('deny'); this.toast('Teleport failed'); }
      this.cursor = null;
      return;
    }
    if (this.armed === null) return;
    const w = b.player.weapons[this.armed];
    w.target = room;
    if (w.def.ammo && b.player.missiles <= 0) this.toast('Out of missiles');
    this.sfx.play('click');
    this.armWeapon(null);
  }

  jump() {
    const p = this.player, b = this.battle;
    if (!p || !b || b.result) return;
    if (p.jumpCharge < 1) return this.toast(p.canJump ? 'Jump drive still charging' : 'Jump drive needs a manned cockpit and powered engines');
    if (!p.canJump) return this.toast('Someone must man the cockpit to jump');
    const away = b.enemy.crew.filter((c) => c.owner === 'player');
    if (away.length && (p.systems.teleporter?.power ?? 0) > 0) return this.toast('Recall your boarding party first (R)');
    b.result = 'fled';
  }

  cancel(): boolean {
    if (this.powerFocus !== null) { this.powerFocus = null; return true; }
    if (this.teleArmed) { this.teleArmed = false; this.cursor = null; return true; }
    if (this.armed !== null) { this.armWeapon(null); return true; }
    if (this.selCrew) { this.selCrew = null; this.cursor = null; return true; }
    if (this.cursor) { this.cursor = null; return true; }
    return false;
  }

  powerItems(): PowerItem[] {
    const p = this.player;
    if (!p) return [];
    return [
      ...POWER_ORDER.filter((id) => p.systems[id]).map((id): PowerItem => ({ kind: 'sys', id })),
      ...p.weapons.map((_, i): PowerItem => ({ kind: 'wpn', i })),
      ...p.drones.map((_, i): PowerItem => ({ kind: 'drone', i })),
    ];
  }

  private powerItemUp(it: PowerItem) {
    const p = this.player!;
    if (it.kind === 'sys') this.powerUp(it.id);
    else if (it.kind === 'wpn') { if (!p.weapons[it.i].on) this.report(p.weaponOn(it.i)); }
    else if (!p.drones[it.i].on) this.report(p.droneOn(it.i));
  }

  private powerItemDown(it: PowerItem) {
    if (it.kind === 'sys') this.powerDown(it.id);
    else if (it.kind === 'wpn') this.weaponOff(it.i);
    else this.droneOff(it.i);
  }

  // ---------- gamepad ----------

  onPad(btn: PadButton) {
    this.device = 'pad';
    if (this.menu) return this.menuInput(btn);
    if (this.mode === 'map') return this.flow.padInput(btn);
    if (this.mode !== 'battle' || !this.battle) return;
    const b = this.battle;
    switch (btn) {
      case 'START': return this.togglePause();
      case 'BACK': return this.openPauseMenu();
      case 'RT': return this.jump();
      case 'LT': return this.cloak();
      case 'LS': return this.recall();
      case 'LB': return this.cycleCrew(-1);
      case 'RB': return this.cycleCrew(1);
      case 'B': this.cancel(); return;
      case 'Y':
        this.armWeapon(null);
        this.powerFocus = this.powerFocus === null ? 0 : null;
        return;
      case 'X': {
        // X cycles through powered weapons, then the teleporter (if it can fire).
        this.powerFocus = null;
        const on = b.player.weapons.map((w, i) => (w.on ? i : -1)).filter((i) => i >= 0);
        const tele = b.player.canTeleport;
        if (this.teleArmed) { this.teleArmed = false; if (on.length) return this.armWeapon(on[0]); return; }
        if (this.armed !== null && on.indexOf(this.armed) === on.length - 1 && tele) return this.armTeleport();
        if (!on.length) return tele ? this.armTeleport() : this.toast('No powered weapons: press Y to route power');
        const next = this.armed === null ? on[0] : on[(on.indexOf(this.armed) + 1) % on.length];
        return this.armWeapon(next);
      }
      case 'A': return this.padConfirm();
      case 'UP': case 'DOWN': case 'LEFT': case 'RIGHT': return this.padDir(btn);
    }
  }

  private padDir(dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') {
    const b = this.battle!;
    if (this.powerFocus !== null) {
      const items = this.powerItems();
      if (dir === 'LEFT') this.powerFocus = (this.powerFocus - 1 + items.length) % items.length;
      else if (dir === 'RIGHT') this.powerFocus = (this.powerFocus + 1) % items.length;
      else if (dir === 'UP') this.powerItemUp(items[this.powerFocus]);
      else this.powerItemDown(items[this.powerFocus]);
      return;
    }
    const ship = this.armed !== null || this.teleArmed ? b.enemy : this.selCrew ? this.crewShip(this.selCrew) ?? b.player : b.player;
    if (!this.cursor || this.cursor.ship !== ship) {
      const start = ship === b.player ? this.selCrew?.room ?? b.player.systems.piloting?.room : this.selCrew?.room ?? b.enemy.systems.shields?.room;
      this.cursor = { ship, room: start && ship.rooms.includes(start) ? start : ship.rooms[0] };
      return;
    }
    this.cursor = { ship, room: navRoom(ship, this.cursor.room, dir) };
  }

  private padConfirm() {
    const b = this.battle!;
    if (this.powerFocus !== null) {
      const it = this.powerItems()[this.powerFocus];
      const on = it.kind === 'wpn' ? b.player.weapons[it.i].on : it.kind === 'drone' ? b.player.drones[it.i].on : false;
      if (on) this.powerItemDown(it);
      else this.powerItemUp(it);
      return;
    }
    const cur = this.cursor;
    if (this.armed !== null || this.teleArmed) {
      if (cur?.ship === b.enemy) this.targetRoom(cur.room);
      return;
    }
    if (!cur) {
      if (!this.selCrew) this.cycleCrew(1);
      else { const s = this.crewShip(this.selCrew); if (s) this.cursor = { ship: s, room: this.selCrew.room }; }
      return;
    }
    const inRoom = cur.ship.crew.filter((c) => c.owner === 'player' && c.room === cur.room);
    if (this.selCrew && cur.room !== this.selCrew.room) this.orderMove(cur.room, cur.ship);
    else if (inRoom.length) {
      const i = this.selCrew ? inRoom.indexOf(this.selCrew) : -1;
      this.selectCrew(inRoom[(i + 1) % inRoom.length]);
    }
  }

  menuInput(btn: PadButton | 'ENTER' | 'ESC') {
    const m = this.menu!;
    const n = m.items.length;
    if (btn === 'UP' || btn === 'LEFT') this.menuFocus = (this.menuFocus - 1 + n) % n;
    else if (btn === 'DOWN' || btn === 'RIGHT') this.menuFocus = (this.menuFocus + 1) % n;
    else if (btn === 'A' || btn === 'ENTER') return this.activateMenu(this.menuFocus);
    else if ((btn === 'B' || btn === 'ESC' || btn === 'START') && m.back) return m.back();
    else return;
    this.menuVersion++;
  }

  activateMenu(i: number) {
    const it = this.menu?.items[i];
    if (!it) return;
    if (it.disabled?.()) return this.sfx.play('deny');
    this.sfx.play('click');
    it.action();
  }

  // ---------- keyboard & mouse ----------

  onKey(e: KeyboardEvent) {
    this.device = 'kbm';
    this.sfx.unlock();
    const k = e.key;
    if (this.menu) {
      const map: Record<string, PadButton | 'ENTER' | 'ESC'> = {
        ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', w: 'UP', s: 'DOWN',
        Enter: 'ENTER', ' ': 'ENTER', Escape: 'ESC',
      };
      if (map[k]) { e.preventDefault(); this.menuInput(map[k]); }
      return;
    }
    if (this.mode === 'map') return this.flow.keyInput(e);
    if (this.mode !== 'battle') return;
    const lower = k.toLowerCase();
    if (k === ' ' || lower === 'p') { e.preventDefault(); return this.togglePause(); }
    if (k === 'Escape') { if (!this.cancel()) this.openPauseMenu(); return; }
    if (k === 'Tab') { e.preventDefault(); return this.cycleCrew(e.shiftKey ? -1 : 1); }
    if (lower === 'j') return this.jump();
    if (lower === 'c') return this.cloak();
    if (lower === 't') return this.armTeleport();
    if (lower === 'r') return this.recall();
    if (lower === 'm') {
      this.sfx.muted = !this.sfx.muted;
      saveSettings({ sound: !this.sfx.muted, music: this.music.enabled });
      return this.toast(`Sound ${this.sfx.muted ? 'off' : 'on'}`);
    }
    const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
    if (digit >= 1 && digit <= 4) {
      return e.shiftKey || e.ctrlKey ? this.weaponOff(digit - 1) : this.weaponPrimary(digit - 1);
    }
    if (digit >= 5 && digit <= 6) {
      return e.shiftKey || e.ctrlKey ? this.droneOff(digit - 5) : this.droneToggle(digit - 5);
    }
    const sys = POWER_ORDER.find((id) => SYSTEM_INFO[id].key && SYSTEM_INFO[id].key.toLowerCase() === lower);
    if (sys) return e.shiftKey ? this.powerDown(sys) : this.powerUp(sys);
  }

  onMouseMove(x: number, y: number) {
    const b = this.battle;
    this.hover = null;
    if (!b) return;
    for (const ship of [b.player, b.enemy]) {
      if (ship.dead) continue;
      const room = ship.roomAtPixel(x, y);
      if (room) this.hover = { ship, room };
    }
  }

  onCanvasDown(x: number, y: number, button: number) {
    this.device = 'kbm';
    this.sfx.unlock();
    const b = this.battle;
    if (this.mode !== 'battle' || !b || this.menu) return;
    this.cursor = null;
    this.powerFocus = null;
    this.onMouseMove(x, y);
    const hv = this.hover;
    if (button === 2) {
      if (this.armed !== null || this.teleArmed) { this.teleArmed = false; return this.armWeapon(null); }
      if (this.selCrew && hv) this.orderMove(hv.room, hv.ship);
      return;
    }
    if (this.armed !== null || this.teleArmed) {
      if (hv?.ship === b.enemy) this.targetRoom(hv.room);
      return;
    }
    for (const ship of [b.player, b.enemy]) {
      const hit = ship.crew.find((c) => {
        if (c.owner !== 'player') return false;
        const p = ship.crewPx(c);
        return Math.hypot(p.x - x, p.y - y) < 14;
      });
      if (hit) return this.selectCrew(hit);
    }
    if (hv) {
      const inRoom = hv.ship.crew.filter((c) => c.owner === 'player' && c.room === hv.room);
      if (inRoom.length) return this.selectCrew(inRoom[0]);
    }
    this.selectCrew(null);
  }

  onHudAction(act: string, arg: string, button: number) {
    this.device = 'kbm';
    this.sfx.unlock();
    if (this.menu) return;
    if (this.mode === 'map') {
      if (act === 'node') this.flow.click(Number(arg));
      else if (act === 'upgrades') this.flow.upgrades(() => this.closeMenu());
      else if (act === 'distress') this.flow.distress();
      else if (act === 'menu') this.openPauseMenu();
      return;
    }
    if (this.mode !== 'battle') return;
    const right = button === 2;
    switch (act) {
      case 'sys': return right ? this.powerDown(arg as SystemId) : this.powerUp(arg as SystemId);
      case 'wpn': return right ? this.weaponOff(Number(arg)) : this.weaponPrimary(Number(arg));
      case 'drone': return right ? this.droneOff(Number(arg)) : this.droneToggle(Number(arg));
      case 'crew': {
        const c = this.playerCrew()[Number(arg)];
        if (c) this.selectCrew(this.selCrew === c ? null : c);
        return;
      }
      case 'cloak': return this.cloak();
      case 'tele': return this.armTeleport();
      case 'recall': return this.recall();
      case 'jump': return this.jump();
      case 'pause': return this.togglePause();
      case 'menu': return this.openPauseMenu();
    }
  }
}

/** Pick the room whose centre lies most directly in the pressed direction (cursor snapping). */
export function navRoom(ship: Ship, from: Room, dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'): Room {
  const [dx, dy] = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[dir];
  let best = from, bestScore = Infinity;
  for (const r of ship.rooms) {
    if (r === from) continue;
    const vx = r.cx - from.cx, vy = r.cy - from.cy;
    const along = vx * dx + vy * dy;
    if (along <= 0.01) continue;
    const score = along + Math.abs(vx * dy - vy * dx) * 2;
    if (score < bestScore) { bestScore = score; best = r; }
  }
  return best;
}

function loadBest(): number {
  try { return Number(localStorage.getItem('drift.best')) || 0; } catch { return 0; }
}

interface Settings { sound: boolean; music: boolean }
function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem('drift.settings') ?? '{}');
    return { sound: s.sound !== false, music: s.music !== false };
  } catch { return { sound: true, music: true }; }
}
function saveSettings(s: Settings) {
  try { localStorage.setItem('drift.settings', JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const CONTROLS_HTML = `
<table class="controls">
<tr><th></th><th>Mouse &amp; keyboard</th><th>Controller</th></tr>
<tr><td>Pause (orders still work)</td><td>Space</td><td>Start</td></tr>
<tr><td>Select crew</td><td>Click crew / Tab</td><td>LB / RB, or A on a room</td></tr>
<tr><td>Move crew</td><td>Right-click a room</td><td>D-pad / stick to a room, A</td></tr>
<tr><td>Power a system</td><td>Click its bar (right-click: less) · A S D F (+Shift: less)</td><td>Y, then ◀ ▶ pick, ▲ ▼ power</td></tr>
<tr><td>Weapons</td><td>Click card or 1–4, then click an enemy room</td><td>X (again cycles), stick to a room, A</td></tr>
<tr><td>Drones</td><td>Click card or 5–6 (right-click / Shift: off)</td><td>Y, select it, ▲ / ▼</td></tr>
<tr><td>Board (teleport crew in the teleporter room)</td><td>T, then click an enemy room</td><td>X past the last weapon, then A</td></tr>
<tr><td>Recall boarders</td><td>R</td><td>Click the left stick (L3)</td></tr>
<tr><td>Cloak</td><td>C</td><td>LT</td></tr>
<tr><td>Cancel</td><td>Right-click / Esc</td><td>B</td></tr>
<tr><td>Jump away</td><td>J or the JUMP button</td><td>RT</td></tr>
<tr><td>Menu</td><td>Esc</td><td>Back / Select</td></tr>
<tr><td>Map: choose beacon</td><td>Click a beacon (or arrows + Enter)</td><td>D-pad / stick, A</td></tr>
<tr><td>Map: ship upgrades</td><td>U or the Upgrades button</td><td>Y</td></tr>
</table>
<p class="tip">Crew in a room repair damage, put out fires and seal breaches automatically, and fight any intruders in that room. Crew at Piloting, Engines, Shields and Weapons give bonuses.</p>`;
