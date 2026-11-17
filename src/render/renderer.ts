import { makeRng } from '../core/rng';
import type { Battle } from '../sim/battle';
import { TILE, type Crew, type Room, type Ship } from '../sim/ship';
import { ICON_PATHS } from '../ui/icons';

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const ENEMY_PANEL = { x: 812, y: 58, w: 452, h: 500 };

export interface RoomRef { ship: Ship; room: Room }
export interface View {
  battle: Battle | null;
  selCrew: Crew | null;
  armed: number | null;
  hover: RoomRef | null;
  cursor: RoomRef | null;
  paused: boolean;
}

interface Palette { base: string; dark: string; light: string; accent: string; floor: string }
const PLAYER_PAL: Palette = { base: '#a3acb6', dark: '#5d6670', light: '#cdd4da', accent: '#e07b39', floor: '#d5d9dc' };
const ENEMY_PAL: Palette = { base: '#857a92', dark: '#4a4157', light: '#ada2b9', accent: '#c8414f', floor: '#c9c3cf' };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement;
  private stars: { x: number; y: number; z: number }[] = [];
  private icons: Record<string, Path2D> = {};
  private seed = 1;
  private scale = 1;
  private t = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.bg = document.createElement('canvas');
    for (const [k, d] of Object.entries(ICON_PATHS)) this.icons[k] = new Path2D(d);
    this.resize(1);
  }

  /** pixelScale = on-screen scale * devicePixelRatio, so the canvas stays sharp at any size. */
  resize(pixelScale: number) {
    this.scale = Math.min(pixelScale, 3);
    this.canvas.width = Math.round(VIEW_W * this.scale);
    this.canvas.height = Math.round(VIEW_H * this.scale);
    this.makeBackground(this.seed);
  }

  makeBackground(seed: number) {
    this.seed = seed;
    const rand = makeRng(seed);
    const s = this.scale;
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    const g = this.bg.getContext('2d')!;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = '#04050b';
    g.fillRect(0, 0, VIEW_W, VIEW_H);
    const hues = [200, 260, 300, 180, 330, 20];
    for (let i = 0; i < 5; i++) {
      const x = rand() * VIEW_W, y = rand() * VIEW_H, r = 200 + rand() * 380;
      const h = hues[Math.floor(rand() * hues.length)];
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `hsla(${h},60%,35%,0.28)`);
      grad.addColorStop(1, `hsla(${h},60%,20%,0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.5})`;
      const sz = rand() < 0.1 ? 1.6 : 0.9;
      g.fillRect(rand() * VIEW_W, rand() * VIEW_H, sz, sz);
    }
    // planet
    const px = 560 + rand() * 260, py = 60 + rand() * 120, pr = 50 + rand() * 70;
    const ph = Math.floor(rand() * 360);
    const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    pg.addColorStop(0, `hsl(${ph},45%,62%)`);
    pg.addColorStop(0.7, `hsl(${ph},40%,32%)`);
    pg.addColorStop(1, `hsl(${ph},40%,12%)`);
    g.fillStyle = pg;
    g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
    g.strokeStyle = `hsla(${ph},70%,75%,0.25)`;
    g.lineWidth = 3;
    g.stroke();
    this.stars = Array.from({ length: 70 }, () => ({ x: rand() * VIEW_W, y: rand() * VIEW_H, z: 0.3 + rand() }));
  }

  draw(view: View, dt: number) {
    this.t += dt;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.drawImage(this.bg, 0, 0, VIEW_W, VIEW_H);
    if (!view.paused) for (const s of this.stars) { s.x -= s.z * 14 * dt; if (s.x < 0) s.x += VIEW_W; }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const s of this.stars) ctx.fillRect(s.x, s.y, s.z * 1.4, s.z * 1.4);

    const b = view.battle;
    if (!b) return;
    ctx.save();
    if (b.shake > 0) ctx.translate((Math.random() - 0.5) * b.shake, (Math.random() - 0.5) * b.shake);

    this.drawEnemyPanel();
    this.drawShip(b.player, PLAYER_PAL, view, b);
    this.drawShip(b.enemy, ENEMY_PAL, view, b);
    this.drawTargets(view, b);
    this.drawProjectiles(b);
    for (const p of b.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    for (const t of b.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, t.x + 1, t.y + 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (view.paused) {
      ctx.strokeStyle = 'rgba(255,200,80,0.55)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, VIEW_W - 6, VIEW_H - 6);
    }
  }

  private drawEnemyPanel() {
    const ctx = this.ctx, p = ENEMY_PANEL;
    ctx.fillStyle = 'rgba(40,10,20,0.35)';
    ctx.strokeStyle = 'rgba(255,120,120,0.35)';
    ctx.lineWidth = 2;
    roundRect(ctx, p.x, p.y, p.w, p.h, 10);
    ctx.fill();
    ctx.stroke();
  }

  // ---------- ships ----------

  private drawShip(ship: Ship, pal: Palette, view: View, b: Battle) {
    const ctx = this.ctx;
    const deadFor = ship.dead ? b.resultTime : 0;
    if (ship.dead && deadFor > 1.6) return;
    ctx.save();
    if (ship.dead) ctx.globalAlpha = Math.max(0, 1 - deadFor / 1.6);

    // shields
    if (ship.shieldLayers > 0 || ship.shieldFlash > 0) {
      const c = ship.center(), { rx, ry } = ship.shieldRadii();
      const a = 0.07 + ship.shieldLayers * 0.05 + ship.shieldFlash;
      ctx.fillStyle = `rgba(70,150,255,${a})`;
      ctx.strokeStyle = `rgba(140,200,255,${0.35 + ship.shieldFlash})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      for (let i = 1; i < ship.shieldLayers; i++) {
        ctx.beginPath(); ctx.ellipse(c.x, c.y, rx + i * 7, ry + i * 7, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    this.drawHull(ship, pal);

    // weapon mounts
    ship.weapons.forEach((w, i) => {
      const m = ship.mountPoint(i);
      const dir = ship.side === 'player' ? 1 : -1;
      ctx.fillStyle = w.on ? pal.dark : '#3a3f45';
      ctx.fillRect(m.x - 10, m.y - 5, 20, 10);
      ctx.fillStyle = w.ready ? '#ffd27f' : w.on ? pal.light : '#666';
      ctx.fillRect(m.x + (dir > 0 ? 8 : -22), m.y - 2.5, 14, 5);
    });

    // rooms
    for (const r of ship.rooms) {
      const rr = ship.roomRect(r);
      const lack = 1 - r.oxygen / 100;
      ctx.fillStyle = mix(pal.floor, '#e8768c', Math.min(1, lack * 1.1));
      ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.09)';
      ctx.lineWidth = 1;
      for (let i = 1; i < r.w; i++) line(ctx, rr.x + i * TILE, rr.y, rr.x + i * TILE, rr.y + rr.h);
      for (let j = 1; j < r.h; j++) line(ctx, rr.x, rr.y + j * TILE, rr.x + rr.w, rr.y + j * TILE);
    }
    ctx.strokeStyle = '#1e2229';
    ctx.lineWidth = 3;
    for (const r of ship.rooms) {
      const rr = ship.roomRect(r);
      ctx.strokeRect(rr.x, rr.y, rr.w, rr.h);
    }
    // doors
    for (const d of ship.doors) {
      const open = d.open > 0;
      ctx.fillStyle = open ? '#6b4b1f' : '#e9a23b';
      if (d.vertical) {
        const x = ship.ox + Math.max(d.a.x, d.b.x) * TILE, y = ship.oy + d.a.y * TILE + TILE / 2;
        if (open) { ctx.fillRect(x - 3, y - 10, 6, 4); ctx.fillRect(x - 3, y + 6, 6, 4); }
        else ctx.fillRect(x - 3, y - 10, 6, 20);
      } else {
        const y = ship.oy + Math.max(d.a.y, d.b.y) * TILE, x = ship.ox + d.a.x * TILE + TILE / 2;
        if (open) { ctx.fillRect(x - 10, y - 3, 4, 6); ctx.fillRect(x + 6, y - 3, 4, 6); }
        else ctx.fillRect(x - 10, y - 3, 20, 6);
      }
    }
    // systems + hazards
    for (const r of ship.rooms) {
      const rr = ship.roomRect(r);
      const s = r.system;
      if (s) {
        let col = '#7a8088';
        if (s.ion > 0) col = '#3fa9ff';
        else if (s.damage >= s.level) col = '#e0333f';
        else if (s.damage > 0) col = '#f08a24';
        else if (s.power > 0) col = '#2fa36b';
        this.icon(s.id, rr.x + rr.w / 2, rr.y + rr.h / 2, r.w === 1 && r.h === 1 ? 20 : 26, col);
        if (s.damage > 0 && s.repair > 0) {
          ctx.fillStyle = '#222';
          ctx.fillRect(rr.x + 4, rr.y + rr.h - 8, rr.w - 8, 4);
          ctx.fillStyle = '#f0c040';
          ctx.fillRect(rr.x + 4, rr.y + rr.h - 8, (rr.w - 8) * s.repair, 4);
        }
      }
      if (r.breach > 0) {
        const x = rr.x + rr.w * 0.3, y = rr.y + rr.h * 0.35;
        ctx.fillStyle = '#0b0d12';
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2, rad = i % 2 ? 4 : 9;
          ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        }
        ctx.fill();
      }
      if (r.fire > 0) {
        const tiles = r.tiles();
        const n = Math.max(1, Math.ceil((r.fire / 100) * tiles.length));
        for (let i = 0; i < n; i++) {
          const tx = ship.ox + tiles[i].x * TILE + TILE / 2, ty = ship.oy + tiles[i].y * TILE + TILE / 2;
          for (let k = 0; k < 3; k++) {
            const f = Math.sin(this.t * 9 + k * 2.1 + i) * 0.5 + 0.5;
            ctx.fillStyle = k === 2 ? 'rgba(255,230,120,0.9)' : 'rgba(255,110,30,0.75)';
            ctx.beginPath();
            ctx.arc(tx + (k - 1) * 7, ty + 4 - f * 6, (k === 2 ? 5 : 8) * (0.7 + f * 0.4), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // room highlight for move orders
    const hv = view.hover;
    if (ship.side === 'player' && view.selCrew && view.armed === null && hv && hv.ship === ship) {
      const rr = ship.roomRect(hv.room);
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 2;
      ctx.strokeRect(rr.x + 3, rr.y + 3, rr.w - 6, rr.h - 6);
    }

    for (const c of ship.crew) this.drawCrew(ship, c, c === view.selCrew);

    if (view.cursor && view.cursor.ship === ship) {
      const rr = ship.roomRect(view.cursor.room);
      this.brackets(rr.x, rr.y, rr.w, rr.h, ship.side === 'player' ? '#62f3ff' : '#ffd84a');
    }
    ctx.restore();
  }

  private drawHull(ship: Ship, pal: Palette) {
    const ctx = this.ctx;
    const x = ship.ox, y = ship.oy, W = ship.pxW, H = ship.pxH;
    ctx.save();
    if (ship.side === 'enemy') { ctx.translate(2 * x + W, 0); ctx.scale(-1, 1); }
    const flick = 0.7 + Math.sin(this.t * 20) * 0.15 + Math.random() * 0.15;
    const engineGlow = (ex: number, ey: number, r: number) => {
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, r * 2.4);
      g.addColorStop(0, `rgba(255,220,120,${flick})`);
      g.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, ey, r * 2.4, 0, Math.PI * 2); ctx.fill();
    };
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.dark;
    ctx.fillStyle = pal.base;
    const style = ship.def.style;
    if (style === 'cruiser' || style === 'bulwark') {
      // engine pods
      const podW = W * 0.5, podH = 34;
      for (const py of [y - podH - 6, y + H + 6]) {
        engineGlow(x - 30, py + podH / 2, 9);
        ctx.fillStyle = pal.base;
        roundRect(ctx, x - 28, py, podW, podH, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = pal.accent;
        ctx.fillRect(x - 28 + podW * 0.45, py + 2, 8, podH - 4);
      }
      ctx.fillStyle = pal.base;
      roundRect(ctx, x - 24, y - 16, W + 48, H + 32, style === 'bulwark' ? 30 : 16); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + W + 20, y - 8); ctx.lineTo(x + W + 74, y + H / 2); ctx.lineTo(x + W + 20, y + H + 8);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.light;
      ctx.fillRect(x - 10, y - 12, W + 20, 4);
      ctx.fillRect(x - 10, y + H + 8, W + 20, 4);
    } else if (style === 'raider') {
      engineGlow(x - 34, y + H / 2, 12);
      ctx.beginPath();
      ctx.moveTo(x - 30, y - 20); ctx.lineTo(x + W * 0.7, y - 46); ctx.lineTo(x + W + 60, y + H / 2);
      ctx.lineTo(x + W * 0.7, y + H + 46); ctx.lineTo(x - 30, y + H + 20); ctx.lineTo(x - 18, y + H / 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x + W * 0.35, y - 30, 10, 14);
      ctx.fillRect(x + W * 0.35, y + H + 16, 10, 14);
    } else {
      engineGlow(x - 28, y + H * 0.25, 8);
      engineGlow(x - 28, y + H * 0.75, 8);
      ctx.beginPath();
      ctx.moveTo(x - 24, y - 14); ctx.lineTo(x + W + 10, y - 14); ctx.lineTo(x + W + 90, y + H / 2);
      ctx.lineTo(x + W + 10, y + H + 14); ctx.lineTo(x - 24, y + H + 14);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x + W + 10, y + H / 2 - 3, 50, 6);
    }
    ctx.restore();
  }

  private drawCrew(ship: Ship, c: Crew, selected: boolean) {
    const ctx = this.ctx;
    const p = ship.crewPx(c);
    const working = c.task === 'repair' || c.task === 'fire' || c.task === 'breach';
    const bob = c.moving ? Math.sin(c.anim * 14) * 1.5 : working ? Math.sin(c.anim * 20) * 1.2 : 0;
    const x = p.x + (working ? bob : 0), y = p.y + (c.moving ? bob : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
    if (selected) {
      ctx.strokeStyle = '#7dffb0';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = c.flash > 0 ? '#ffffff' : c.color;
    ctx.strokeStyle = '#1b1d22';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(200,240,255,0.9)';
    ctx.fillRect(x + (c.facing > 0 ? 1 : -7), y - 4, 6, 4);
    if (c.task === 'man') {
      ctx.fillStyle = '#2fa36b';
      ctx.beginPath(); ctx.arc(x + 8, y - 8, 3, 0, Math.PI * 2); ctx.fill();
    }
    if (c.hp < c.maxHp || selected) {
      const f = Math.max(0, c.hp / c.maxHp);
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 11, y - 17, 22, 4);
      ctx.fillStyle = f > 0.6 ? '#4ee07a' : f > 0.3 ? '#f2c94c' : '#ff4d4d';
      ctx.fillRect(x - 11, y - 17, 22 * f, 4);
    }
  }

  private drawTargets(view: View, b: Battle) {
    const ctx = this.ctx;
    b.player.weapons.forEach((w, i) => {
      if (!w.target || b.enemy.dead) return;
      const rr = b.enemy.roomRect(w.target);
      const cx = rr.x + rr.w / 2 + (i - (b.player.weapons.length - 1) / 2) * 12, cy = rr.y + rr.h / 2;
      this.reticle(cx, cy, 11, w.on ? '#ffd84a' : '#8a8a8a', String(i + 1));
    });
    if (view.armed !== null) {
      const ref = view.hover?.ship === b.enemy ? view.hover : view.cursor?.ship === b.enemy ? view.cursor : null;
      if (ref) {
        const rr = b.enemy.roomRect(ref.room);
        ctx.fillStyle = 'rgba(255,216,74,0.18)';
        ctx.fillRect(rr.x, rr.y, rr.w, rr.h);
        const pulse = 15 + Math.sin(this.t * 8) * 2;
        this.reticle(rr.x + rr.w / 2, rr.y + rr.h / 2, pulse, '#ffd84a', String(view.armed + 1));
      }
    }
  }

  private drawProjectiles(b: Battle) {
    const ctx = this.ctx;
    for (const p of b.projectiles) {
      const sp = Math.hypot(p.vx, p.vy), nx = p.vx / sp, ny = p.vy / sp;
      ctx.save();
      if (p.miss) ctx.globalAlpha = Math.max(0, p.life / 1.2);
      if (p.def.kind === 'laser') {
        const col = p.owner.side === 'player' ? '#ff6a3d' : '#ff3d8b';
        ctx.strokeStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 4;
        line(ctx, p.x - nx * 20, p.y - ny * 20, p.x, p.y);
        ctx.strokeStyle = '#fff4d6';
        ctx.lineWidth = 1.5;
        line(ctx, p.x - nx * 16, p.y - ny * 16, p.x, p.y);
      } else if (p.def.kind === 'ion') {
        ctx.fillStyle = '#7fd8ff';
        ctx.shadowColor = '#7fd8ff';
        ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(p.x, p.y, 6 + Math.sin(this.t * 30) * 1.5, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(ny, nx));
        ctx.fillStyle = '#d7d7d7';
        ctx.fillRect(-10, -3, 16, 6);
        ctx.fillStyle = '#e04848';
        ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(12, 0); ctx.lineTo(6, 3); ctx.fill();
        ctx.fillStyle = '#ffcf6b';
        ctx.fillRect(-14, -2, 4, 4);
      }
      ctx.restore();
    }
  }

  // ---------- helpers ----------

  private icon(id: string, x: number, y: number, size: number, color: string) {
    const ctx = this.ctx, p = this.icons[id];
    if (!p) return;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(size / 24, size / 24);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 4.5;
    ctx.stroke(p);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.stroke(p);
    ctx.restore();
  }

  private reticle(x: number, y: number, r: number, color: string, label: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    line(ctx, x - r - 4, y, x - r + 4, y); line(ctx, x + r - 4, y, x + r + 4, y);
    line(ctx, x, y - r - 4, x, y - r + 4); line(ctx, x, y + r - 4, x, y + r + 4);
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(label, x, y + 4);
  }

  private brackets(x: number, y: number, w: number, h: number, color: string) {
    const ctx = this.ctx, k = 9, o = 3 + Math.sin(this.t * 6) * 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const X0 = x - o, Y0 = y - o, X1 = x + w + o, Y1 = y + h + o;
    for (const [cx, cy, dx, dy] of [[X0, Y0, 1, 1], [X1, Y0, -1, 1], [X0, Y1, 1, -1], [X1, Y1, -1, -1]]) {
      ctx.beginPath(); ctx.moveTo(cx + dx * k, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * k); ctx.stroke();
    }
  }
}

function line(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
