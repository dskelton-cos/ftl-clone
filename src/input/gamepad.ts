export type PadButton =
  | 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'BACK' | 'START' | 'LS'
  | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

// Standard Gamepad API mapping (Xbox / PlayStation / Switch Pro in "standard" mode).
const BUTTONS: [number, PadButton][] = [
  [0, 'A'], [1, 'B'], [2, 'X'], [3, 'Y'], [4, 'LB'], [5, 'RB'], [6, 'LT'], [7, 'RT'], [8, 'BACK'], [9, 'START'], [10, 'LS'],
];
const DIRS: [number, PadButton][] = [[12, 'UP'], [13, 'DOWN'], [14, 'LEFT'], [15, 'RIGHT']];

/**
 * Polls every connected controller and turns it into edge-triggered button presses.
 * Directions (d-pad or left stick) auto-repeat while held, for snapping a cursor between rooms.
 */
export class PadInput {
  private prev = new Set<PadButton>();
  private dir: PadButton | null = null;
  private repeat = 0;
  connected: string | null = null;

  poll(dt: number): PadButton[] {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const held = new Set<PadButton>();
    let dir: PadButton | null = null;
    let name: string | null = null;
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      name ??= gp.id;
      for (const [i, b] of BUTTONS) if (gp.buttons[i]?.pressed || (gp.buttons[i]?.value ?? 0) > 0.5) held.add(b);
      for (const [i, b] of DIRS) if (gp.buttons[i]?.pressed) dir = b;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      if (!dir && Math.hypot(ax, ay) > 0.55) {
        dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'RIGHT' : 'LEFT') : ay > 0 ? 'DOWN' : 'UP';
      }
    }
    this.connected = name;
    const out: PadButton[] = [];
    for (const b of held) if (!this.prev.has(b)) out.push(b);
    this.prev = held;

    if (dir !== this.dir) {
      this.dir = dir;
      this.repeat = 0.35;
      if (dir) out.push(dir);
    } else if (dir) {
      this.repeat -= dt;
      if (this.repeat <= 0) { this.repeat = 0.13; out.push(dir); }
    }
    return out;
  }
}
