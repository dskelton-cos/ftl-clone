import { PLAYER_SHIP, makeEnemyDef } from '../data/ships';
import { POWER_ORDER, SYSTEM_INFO, type SystemId } from '../data/systems';
import type { PadButton } from '../input/gamepad';
import { PadInput } from '../input/gamepad';
import { ENEMY_PANEL, Renderer, type RoomRef } from '../render/renderer';
import { Battle } from '../sim/battle';
import { Ship, type Crew, type PowerResult, type Room } from '../sim/ship';
import { makeRng } from './rng';
import { Sfx } from './sfx';

export type Device = 'kbm' | 'pad';
export interface MenuItem { label: string; sub?: string | (() => string); action: () => void; disabled?: () => boolean }
export interface Menu { title: string; body?: string; items: MenuItem[]; back?: () => void; wide?: boolean }
export type PowerItem = { kind: 'sys'; id: SystemId } | { kind: 'wpn'; i: number };

const CREW_NAMES = ['Vesk', 'Orin', 'Juno', 'Kade', 'Mira', 'Tal'];
const CREW_COLORS = ['#f2b84b', '#5ec8e5', '#9b7cf0', '#7fd36b', '#f07ca0', '#e8e8e8'];
const ENEMY_COLORS = ['#d9534f', '#c0703c', '#b84b8a', '#a3a03a'];
const STEP = 1 / 60;

const POWER_MSG: Partial<Record<PowerResult, string>> = {
  reactor: 'Not enough reactor power',
  damaged: 'System damaged: send crew to repair it',
  max: 'System is at full power',
  weapons: 'Weapons system lacks capacity: power down another weapon',
};

export class Game {
  mode: 'title' | 'battle' | 'over' = 'title';
  player: Ship | null = null;
  battle: Battle | null = null;
  sector = 0;
  paused = false;
  device: Device = 'kbm';
  selCrew: Crew | null = null;
  armed: number | null = null;
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
  private acc = 0;
  private padName: string | null = null;
  private rand = makeRng(Date.now() & 0xffffffff);

  constructor(public renderer: Renderer) {
    this.showTitle();
  }

  // ---------- flow ----------

  showTitle() {
    this.mode = 'title';
    this.battle = null;
    this.openMenu({
      title: 'DRIFT PROTOCOL',
      body: 'Command a fragile starship. Divide its power, direct its crew, and outlast the ships hunting you.',
      items: [
        { label: 'New Run', action: () => this.startRun() },
        { label: 'Controls', action: () => this.showControls(() => this.showTitle()) },
      ],
    });
  }

  startRun() {
    this.player = new Ship(PLAYER_SHIP, 'player', CREW_NAMES, CREW_COLORS);
    this.player.scrap = 10;
    this.sector = 0;
    this.nextEncounter();
  }

  nextEncounter() {
    const player = this.player!;
    this.sector++;
    player.refit();
    player.placeAt(430, 330);
    const enemy = new Ship(makeEnemyDef(this.sector, this.rand), 'enemy', ['Raider'], ENEMY_COLORS);
    enemy.crew.forEach((c, i) => (c.color = ENEMY_COLORS[i % ENEMY_COLORS.length]));
    enemy.placeAt(ENEMY_PANEL.x + ENEMY_PANEL.w / 2, ENEMY_PANEL.y + ENEMY_PANEL.h / 2 + 20);
    this.battle = new Battle(player, enemy);
    this.renderer.makeBackground(Math.floor(this.rand() * 1e9));
    this.mode = 'battle';
    this.paused = false;
    this.selCrew = null;
    this.armed = null;
    this.powerFocus = null;
    this.cursor = null;
    this.menu = null;
    this.menuVersion++;
    this.toast(`Beacon ${this.sector}: hostile ${enemy.def.name} engaging!`);
  }

  private showVictory() {
    const b = this.battle!, p = this.player!;
    const reward = 12 + this.sector * 4 + Math.floor(this.rand() * 10) + (b.crewKill ? 15 : 0);
    const missiles = this.rand() < 0.5 ? 1 + Math.floor(this.rand() * 2) : 0;
    p.scrap += reward;
    p.missiles += missiles;
    this.recordBest(this.sector);
    const upgrade = (id: SystemId, cost: () => number): MenuItem => ({
      label: `Upgrade ${SYSTEM_INFO[id].name}`,
      sub: () => `${cost()} scrap`,
      action: () => this.buy(cost(), () => { p.systems[id]!.level++; }),
      disabled: () => p.scrap < cost() || p.systems[id]!.level >= SYSTEM_INFO[id].max,
    });
    const items: MenuItem[] = [
      { label: 'Continue', sub: 'Jump to the next beacon', action: () => this.nextEncounter() },
      { label: 'Repair hull +5', sub: '10 scrap', action: () => this.buy(10, () => (p.hull = Math.min(p.maxHull, p.hull + 5))), disabled: () => p.scrap < 10 || p.hull >= p.maxHull },
      { label: 'Buy 3 missiles', sub: '8 scrap', action: () => this.buy(8, () => (p.missiles += 3)), disabled: () => p.scrap < 8 },
      { label: 'Expand reactor +1', sub: `${20 + p.reactor * 3} scrap`, action: () => this.buy(20 + p.reactor * 3, () => p.reactor++), disabled: () => p.scrap < 20 + p.reactor * 3 },
      upgrade('shields', () => 20 + p.systems.shields!.level * 8),
      upgrade('engines', () => 12 + p.systems.engines!.level * 5),
      upgrade('weapons', () => 18 + p.systems.weapons!.level * 6),
    ];
    this.openMenu({
      title: b.crewKill ? 'ENEMY CREW ELIMINATED' : 'HOSTILE DESTROYED',
      body: `Salvaged <b>${reward} scrap</b>${missiles ? ` and <b>${missiles} missile${missiles > 1 ? 's' : ''}</b>` : ''}. Spend it before you jump.`,
      items,
      wide: true,
    });
  }

  private buy(cost: number, fn: () => void) {
    const p = this.player!;
    if (p.scrap < cost) return this.sfx.play('deny');
    p.scrap -= cost;
    fn();
    p.updatePower();
    this.sfx.play('click');
    this.menuVersion++;
  }

  private showGameOver() {
    this.mode = 'over';
    this.recordBest(this.sector - 1);
    this.openMenu({
      title: 'SHIP LOST',
      body: `Your ship was destroyed at beacon ${this.sector}.<br>Hostiles defeated: <b>${this.sector - 1}</b> · Best run: <b>${this.best}</b>`,
      items: [
        { label: 'New Run', action: () => this.startRun() },
        { label: 'Title Screen', action: () => this.showTitle() },
      ],
    });
  }

  openPauseMenu() {
    if (this.mode !== 'battle') return;
    this.openMenu({
      title: 'PAUSED',
      items: [
        { label: 'Resume', action: () => this.closeMenu() },
        { label: 'Controls', action: () => this.showControls(() => this.openPauseMenu()) },
        { label: `Sound: ${this.sfx.muted ? 'Off' : 'On'}`, action: () => { this.sfx.muted = !this.sfx.muted; this.openPauseMenu(); } },
        { label: 'Abandon Run', action: () => this.showTitle() },
      ],
      back: () => this.closeMenu(),
    });
  }

  showControls(back: () => void) {
    this.openMenu({
      title: 'CONTROLS',
      wide: true,
      body: CONTROLS_HTML,
      items: [{ label: 'Back', action: back }],
      back,
    });
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
      if (this.selCrew && !b.player.crew.includes(this.selCrew)) this.selCrew = null;
      if (b.result === 'fled') { this.toast('Jumped away!'); this.nextEncounter(); }
      else if (b.result === 'win' && b.resultTime > 1.8) this.showVictory();
      else if (b.result === 'lose' && b.resultTime > 1.8) this.showGameOver();
    }
    this.renderer.draw(
      { battle: this.battle, selCrew: this.selCrew, armed: this.armed, hover: this.hover, cursor: this.cursor, paused: this.paused && !this.menu },
      dt,
    );
  }

  toast(text: string) {
    this.toasts.push({ text, life: 3 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  private recordBest(n: number) {
    if (n > this.best) {
      this.best = n;
      try { localStorage.setItem('drift.best', String(n)); } catch { /* storage unavailable */ }
    }
  }

  // ---------- actions (shared by every input device) ----------

  togglePause() {
    if (this.mode !== 'battle' || this.menu) return;
    this.paused = !this.paused;
  }

  selectCrew(c: Crew | null) {
    this.selCrew = c;
    this.armed = null;
    if (c) this.sfx.play('click');
    if (c && this.device === 'pad') this.cursor = { ship: this.player!, room: c.room };
  }

  cycleCrew(d: number) {
    const crew = this.player?.crew ?? [];
    if (!crew.length) return;
    const i = this.selCrew ? crew.indexOf(this.selCrew) : d > 0 ? -1 : 0;
    this.powerFocus = null;
    this.selectCrew(crew[(i + d + crew.length) % crew.length]);
  }

  orderMove(room: Room) {
    if (!this.selCrew || !this.player) return;
    if (this.player.orderCrew(this.selCrew, room)) this.sfx.play('click');
    else { this.sfx.play('deny'); this.toast('That room is full'); }
  }

  powerUp(id: SystemId) { this.report(this.player?.addPower(id)); }
  powerDown(id: SystemId) { this.report(this.player?.removePower(id)); }

  private report(r: PowerResult | undefined) {
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

  armWeapon(i: number | null) {
    this.armed = i;
    const b = this.battle;
    if (!b) return;
    if (i !== null) {
      this.sfx.play('click');
      if (this.device === 'pad') {
        const w = b.player.weapons[i];
        this.cursor = { ship: b.enemy, room: w.target ?? b.enemy.systems.shields?.room ?? b.enemy.rooms[0] };
      }
    } else if (this.cursor?.ship === b.enemy) {
      this.cursor = this.selCrew ? { ship: b.player, room: this.selCrew.room } : null;
    }
  }

  targetRoom(room: Room) {
    const b = this.battle;
    if (this.armed === null || !b) return;
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
    b.result = 'fled';
  }

  cancel(): boolean {
    if (this.powerFocus !== null) { this.powerFocus = null; return true; }
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
    ];
  }

  // ---------- gamepad ----------

  onPad(btn: PadButton) {
    this.device = 'pad';
    if (this.menu) return this.menuInput(btn);
    if (this.mode !== 'battle' || !this.battle) return;
    const b = this.battle;
    switch (btn) {
      case 'START': return this.togglePause();
      case 'BACK': return this.openPauseMenu();
      case 'RT': return this.jump();
      case 'LB': return this.cycleCrew(-1);
      case 'RB': return this.cycleCrew(1);
      case 'B': this.cancel(); return;
      case 'Y':
        this.armWeapon(null);
        this.powerFocus = this.powerFocus === null ? 0 : null;
        return;
      case 'X': {
        this.powerFocus = null;
        const on = b.player.weapons.map((w, i) => (w.on ? i : -1)).filter((i) => i >= 0);
        if (!on.length) return this.toast('No powered weapons: press Y to route power');
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
      else {
        const it = items[this.powerFocus];
        if (it.kind === 'sys') (dir === 'UP' ? this.powerUp(it.id) : this.powerDown(it.id));
        else if (dir === 'UP') { if (!b.player.weapons[it.i].on) this.report(b.player.weaponOn(it.i)); }
        else this.weaponOff(it.i);
      }
      return;
    }
    const ship = this.armed !== null ? b.enemy : b.player;
    if (!this.cursor || this.cursor.ship !== ship) {
      const start = ship === b.player ? this.selCrew?.room ?? b.player.systems.piloting?.room : b.enemy.systems.shields?.room;
      this.cursor = { ship, room: start ?? ship.rooms[0] };
      return;
    }
    this.cursor = { ship, room: navRoom(ship, this.cursor.room, dir) };
  }

  private padConfirm() {
    const b = this.battle!;
    if (this.powerFocus !== null) {
      const it = this.powerItems()[this.powerFocus];
      if (it.kind === 'sys') this.powerUp(it.id);
      else if (b.player.weapons[it.i].on) this.weaponOff(it.i);
      else this.report(b.player.weaponOn(it.i));
      return;
    }
    const cur = this.cursor;
    if (this.armed !== null) {
      if (cur?.ship === b.enemy) this.targetRoom(cur.room);
      return;
    }
    if (!cur || cur.ship !== b.player) {
      if (!this.selCrew) this.cycleCrew(1);
      else this.cursor = { ship: b.player, room: this.selCrew.room };
      return;
    }
    const inRoom = b.player.crew.filter((c) => c.room === cur.room);
    if (this.selCrew && cur.room !== this.selCrew.room) this.orderMove(cur.room);
    else if (inRoom.length) {
      const i = this.selCrew ? inRoom.indexOf(this.selCrew) : -1;
      this.selectCrew(inRoom[(i + 1) % inRoom.length]);
    }
  }

  private menuInput(btn: PadButton | 'ENTER' | 'ESC') {
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
    if (this.mode !== 'battle') return;
    const lower = k.toLowerCase();
    if (k === ' ' || lower === 'p') { e.preventDefault(); return this.togglePause(); }
    if (k === 'Escape') { if (!this.cancel()) this.openPauseMenu(); return; }
    if (k === 'Tab') { e.preventDefault(); return this.cycleCrew(e.shiftKey ? -1 : 1); }
    if (lower === 'j') return this.jump();
    if (lower === 'm') { this.sfx.muted = !this.sfx.muted; return this.toast(`Sound ${this.sfx.muted ? 'off' : 'on'}`); }
    const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : NaN;
    if (digit >= 1 && digit <= 4) {
      return e.shiftKey || e.ctrlKey ? this.weaponOff(digit - 1) : this.weaponPrimary(digit - 1);
    }
    const sys = POWER_ORDER.find((id) => SYSTEM_INFO[id].key.toLowerCase() === lower);
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
      if (this.armed !== null) return this.armWeapon(null);
      if (this.selCrew && hv?.ship === b.player) this.orderMove(hv.room);
      return;
    }
    if (this.armed !== null) {
      if (hv?.ship === b.enemy) this.targetRoom(hv.room);
      return;
    }
    const hit = b.player.crew.find((c) => {
      const p = b.player.crewPx(c);
      return Math.hypot(p.x - x, p.y - y) < 14;
    });
    if (hit) return this.selectCrew(hit);
    if (hv?.ship === b.player) {
      const inRoom = b.player.crew.filter((c) => c.room === hv.room);
      if (inRoom.length) return this.selectCrew(inRoom[0]);
    }
    this.selectCrew(null);
  }

  onHudAction(act: string, arg: string, button: number) {
    this.device = 'kbm';
    this.sfx.unlock();
    if (this.mode !== 'battle' || this.menu) return;
    const right = button === 2;
    switch (act) {
      case 'sys': return right ? this.powerDown(arg as SystemId) : this.powerUp(arg as SystemId);
      case 'wpn': return right ? this.weaponOff(Number(arg)) : this.weaponPrimary(Number(arg));
      case 'crew': {
        const c = this.player?.crew[Number(arg)];
        if (c) this.selectCrew(this.selCrew === c ? null : c);
        return;
      }
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

const CONTROLS_HTML = `
<table class="controls">
<tr><th></th><th>Mouse &amp; keyboard</th><th>Controller</th></tr>
<tr><td>Pause (orders still work)</td><td>Space</td><td>Start</td></tr>
<tr><td>Select crew</td><td>Click crew / Tab</td><td>LB / RB, or A on a room</td></tr>
<tr><td>Move crew</td><td>Right-click a room</td><td>D-pad / stick to a room, A</td></tr>
<tr><td>Power a system</td><td>Click its bar (right-click: less) · A S D F (+Shift: less)</td><td>Y, then ◀ ▶ pick, ▲ ▼ power</td></tr>
<tr><td>Weapons</td><td>Click card or 1–4, then click an enemy room</td><td>X (again cycles), stick to a room, A</td></tr>
<tr><td>Power a weapon off</td><td>Right-click card / Shift+1–4</td><td>Y, select it, ▼</td></tr>
<tr><td>Cancel</td><td>Right-click / Esc</td><td>B</td></tr>
<tr><td>Jump away</td><td>J or the JUMP button</td><td>RT</td></tr>
<tr><td>Menu</td><td>Esc</td><td>Back / Select</td></tr>
</table>
<p class="tip">Crew standing in a room repair damage, put out fires and seal breaches automatically. Crew at Piloting, Engines, Shields and Weapons give bonuses.</p>`;
