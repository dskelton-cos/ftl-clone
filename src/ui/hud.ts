import { SYSTEM_INFO } from '../data/systems';
import type { Game } from '../core/game';
import type { ShipSystem } from '../sim/ship';
import { svgIcon } from './icons';

/**
 * HTML overlay. Each section is rebuilt as a string and only written to the DOM when it changes.
 * Clicks use event delegation on [data-act] so rebuilt elements never lose handlers.
 */
export class Hud {
  private cache = new Map<HTMLElement, string>();
  private els: Record<string, HTMLElement> = {};
  private menuVersion = -1;

  constructor(private root: HTMLElement, private overlay: HTMLElement, private game: Game) {
    for (const id of ['status', 'crew', 'ftl', 'enemy', 'power', 'hints', 'toasts', 'banner']) {
      const el = document.createElement('div');
      el.id = `hud-${id}`;
      root.appendChild(el);
      this.els[id] = el;
    }
    root.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      game.onHudAction(t.dataset.act!, t.dataset.arg ?? '', e.button);
    });
    overlay.addEventListener('pointerdown', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-mi]');
      if (!t) return;
      game.device = 'kbm';
      game.sfx.unlock();
      game.activateMenu(Number(t.dataset.mi));
    });
    overlay.addEventListener('pointermove', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-mi]');
      if (t && Number(t.dataset.mi) !== game.menuFocus) { game.menuFocus = Number(t.dataset.mi); game.menuVersion++; }
    });
  }

  private set(el: HTMLElement, html: string) {
    if (this.cache.get(el) === html) return;
    this.cache.set(el, html);
    el.innerHTML = html;
  }

  update() {
    const g = this.game;
    this.renderMenu();
    const b = g.battle;
    this.root.style.display = b ? '' : 'none';
    this.set(this.els.toasts, g.toasts.map((t) => `<div class="toast" style="opacity:${Math.min(1, t.life)}">${t.text}</div>`).join(''));
    if (!b) return;
    const p = b.player, e = b.enemy;

    // --- status: hull, shields, evasion
    const hullSegs = segs(p.hull, p.maxHull);
    const sh = p.systems.shields;
    const maxL = sh ? Math.floor(sh.power / 2) : 0;
    let pips = '';
    for (let i = 0; i < Math.max(maxL, 1); i++) pips += `<i class="pip ${i < p.shieldLayers ? 'on' : ''}"></i>`;
    const avgO2 = Math.round(p.rooms.reduce((s, r) => s + r.oxygen, 0) / p.rooms.length);
    this.set(this.els.status, `
      <div class="label">HULL <span>${p.hull}/${p.maxHull}</span></div>
      <div class="hull">${hullSegs}</div>
      <div class="row"><div class="label">SHIELDS</div><div class="pips">${pips}</div>
        <div class="mini"><div style="width:${Math.round(p.shieldCharge * 100)}%"></div></div></div>
      <div class="stats"><span>EVADE <b>${p.evasion}%</b></span><span class="${avgO2 < 40 ? 'warn' : ''}">O₂ <b>${avgO2}%</b></span></div>`);

    // --- crew list
    this.set(this.els.crew, p.crew.map((c, i) => {
      const f = Math.max(0, c.hp / c.maxHp);
      const col = f > 0.6 ? '#4ee07a' : f > 0.3 ? '#f2c94c' : '#ff4d4d';
      const task = c.task === 'walk' ? 'moving' : c.task === 'idle' ? '' : c.task === 'man' ? `manning ${c.room.system ? SYSTEM_INFO[c.room.system.id].name.toLowerCase() : ''}` : c.task === 'fire' ? 'firefighting' : c.task === 'breach' ? 'sealing breach' : 'repairing';
      return `<div class="crew ${c === g.selCrew ? 'sel' : ''}" data-act="crew" data-arg="${i}">
        <i class="dot" style="background:${c.color}"></i><div class="cn">${c.name}<small>${task}</small></div>
        <div class="hp"><div style="width:${f * 100}%;background:${col}"></div></div></div>`;
    }).join(''));

    // --- jump drive and resources
    const ready = p.jumpCharge >= 1 && p.canJump;
    this.set(this.els.ftl, `
      <div class="res"><span title="Scrap">⬢ <b>${p.scrap}</b></span><span title="Missiles">➤ <b>${p.missiles}</b></span><span>BEACON <b>${g.sector}</b></span></div>
      <div class="ftl-row"><div class="ftlbar"><div style="width:${Math.round(p.jumpCharge * 100)}%"></div></div>
      <button class="jump ${ready ? 'ready' : ''}" data-act="jump">JUMP${g.device === 'pad' ? ' <kbd>RT</kbd>' : ' <kbd>J</kbd>'}</button>
      <button class="iconbtn" data-act="menu" title="Menu">☰</button></div>`);

    // --- enemy summary
    const esh = e.systems.shields;
    const emax = esh ? Math.floor(esh.power / 2) : 0;
    let epips = '';
    for (let i = 0; i < Math.max(emax, 1); i++) epips += `<i class="pip ${i < e.shieldLayers ? 'on' : ''}"></i>`;
    this.set(this.els.enemy, `<div class="ename">${e.def.name.toUpperCase()}<span>HOSTILE</span></div>
      <div class="hull enemy">${segs(e.hull, e.maxHull)}</div>
      <div class="row"><div class="pips">${epips}</div><div class="stats"><span>EVADE <b>${e.evasion}%</b></span></div></div>`);

    // --- power: reactor, systems, weapons
    const items = g.powerItems();
    const focus = g.powerFocus !== null ? items[g.powerFocus] : null;
    let reactor = '';
    for (let i = 0; i < p.reactor; i++) reactor += `<i class="${i < p.reactorFree ? 'free' : ''}"></i>`;
    let html = `<div class="reactor" title="Reactor: unused power">${reactor}</div><div class="systems">`;
    for (const it of items) {
      if (it.kind !== 'sys') continue;
      const s = p.systems[it.id]!;
      const f = focus?.kind === 'sys' && focus.id === it.id;
      html += `<div class="sys ${f ? 'focus' : ''} ${state(s)}" data-act="sys" data-arg="${s.id}" title="${SYSTEM_INFO[s.id].name}: ${SYSTEM_INFO[s.id].desc}">
        <div class="bars">${bars(s)}</div><div class="ico">${svgIcon(s.id)}</div>
        <kbd>${g.device === 'pad' ? '' : SYSTEM_INFO[s.id].key}</kbd></div>`;
    }
    const pil = p.systems.piloting;
    if (pil) html += `<div class="sys sub ${state(pil)}" title="Piloting: ${SYSTEM_INFO.piloting.desc}"><div class="bars">${bars(pil)}</div><div class="ico">${svgIcon('piloting')}</div><kbd>${p.isManned(pil) ? 'crew' : 'empty'}</kbd></div>`;
    html += `</div>`;
    const ws = p.systems.weapons;
    html += `<div class="weapons"><div class="sys wsys ${ws ? state(ws) : ''}" title="Weapons system capacity"><div class="bars">${ws ? bars(ws) : ''}</div><div class="ico">${svgIcon('weapons')}</div></div>`;
    p.weapons.forEach((w, i) => {
      const f = focus?.kind === 'wpn' && focus.i === i;
      const pct = Math.round((w.charge / w.def.charge) * 100);
      let pw = '';
      for (let k = 0; k < w.def.power; k++) pw += `<i class="${w.on ? 'on' : ''}"></i>`;
      const status = !w.on ? 'OFFLINE' : w.def.ammo && p.missiles <= 0 ? 'NO AMMO' : w.ready ? (w.target ? 'FIRING' : 'READY') : 'CHARGING';
      html += `<div class="wpn ${w.on ? 'on' : ''} ${w.ready ? 'ready' : ''} ${g.armed === i ? 'armed' : ''} ${f ? 'focus' : ''}" data-act="wpn" data-arg="${i}" title="${w.def.desc}">
        <div class="wtop"><div class="pw">${pw}</div><kbd>${g.device === 'pad' ? '' : i + 1}</kbd></div>
        <div class="wname">${w.def.name}</div>
        <div class="charge"><div style="width:${pct}%"></div></div>
        <div class="wstat">${status}${w.target ? ' · ◎' : ''}</div></div>`;
    });
    html += `</div>`;
    this.set(this.els.power, html);

    this.set(this.els.hints, hints(g));
    this.set(this.els.banner, g.paused ? `<div class="paused">PAUSED · ${g.device === 'pad' ? 'Start' : 'Space'} to resume</div>` : '');
  }

  private renderMenu() {
    const g = this.game;
    if (g.menuVersion === this.menuVersion && !g.menu) return;
    const m = g.menu;
    if (!m) {
      this.overlay.innerHTML = '';
      this.overlay.className = '';
      this.menuVersion = g.menuVersion;
      return;
    }
    const html = `<div class="menu ${m.wide ? 'wide' : ''}"><h1>${m.title}</h1>${m.body ? `<div class="body">${m.body}</div>` : ''}
      <div class="items">${m.items.map((it, i) => {
        const sub = typeof it.sub === 'function' ? it.sub() : it.sub;
        return `<button class="mi ${i === g.menuFocus ? 'focus' : ''} ${it.disabled?.() ? 'disabled' : ''}" data-mi="${i}"><span>${it.label}</span>${sub ? `<small>${sub}</small>` : ''}</button>`;
      }).join('')}</div>
      <div class="menuhint">${g.device === 'pad' ? 'D-pad to choose · A to select' + (m.back ? ' · B back' : '') : 'Click, or arrows + Enter' + (m.back ? ' · Esc back' : '')}</div></div>`;
    this.overlay.className = 'show';
    if (this.cache.get(this.overlay) !== html) { this.cache.set(this.overlay, html); this.overlay.innerHTML = html; }
    this.menuVersion = g.menuVersion;
  }
}

function segs(v: number, max: number) {
  const f = v / max;
  const cls = f > 0.5 ? 'g' : f > 0.25 ? 'y' : 'r';
  let s = '';
  for (let i = 0; i < max; i++) s += `<i class="${i < v ? cls : ''}"></i>`;
  return s;
}

function bars(s: ShipSystem) {
  let out = '';
  for (let i = 0; i < s.level; i++) {
    const c = i >= s.level - s.damage ? 'dmg' : i >= s.level - s.damage - s.ion ? 'ion' : i < s.power ? 'on' : '';
    out += `<i class="${c}"></i>`;
  }
  return out;
}

function state(s: ShipSystem) {
  if (s.ion > 0) return 'st-ion';
  if (s.damage > 0) return 'st-dmg';
  return s.power > 0 ? 'st-on' : 'st-off';
}

function hints(g: Game) {
  const pad = g.device === 'pad';
  const k = (s: string) => `<kbd>${s}</kbd>`;
  if (pad) {
    if (g.powerFocus !== null) return `${k('◀ ▶')} choose ${k('▲')} more power ${k('▼')} less ${k('Y')}/${k('B')} done`;
    if (g.armed !== null) return `${k('Stick')} pick enemy room ${k('A')} target ${k('X')} next weapon ${k('B')} cancel`;
    if (g.selCrew) return `${k('Stick')} pick room ${k('A')} send ${g.selCrew.name} ${k('LB')}${k('RB')} crew ${k('B')} deselect`;
    return `${k('Start')} pause ${k('LB')}${k('RB')} crew ${k('X')} weapons ${k('Y')} power ${k('RT')} jump ${k('Back')} menu`;
  }
  if (g.armed !== null) return `Click an enemy room to target · ${k('Right-click')} cancel`;
  if (g.selCrew) return `${k('Right-click')} a room to send ${g.selCrew.name} · ${k('Tab')} next crew · ${k('Esc')} deselect`;
  return `${k('Space')} pause · Click crew, ${k('Right-click')} to move · ${k('1')}–${k('4')} weapons · ${k('A')}${k('S')}${k('D')}${k('F')} power (${k('Shift')} less) · ${k('J')} jump`;
}
