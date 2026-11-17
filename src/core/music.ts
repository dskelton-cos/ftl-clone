import type { Sfx } from './sfx';

// Chord roots (Hz) for a slow, minor-key progression; each chord is root, fifth, ninth-ish.
const PROGRESSION = [110, 87.31, 130.81, 98];
const CHORD = [1, 1.5, 2.245, 3];

/**
 * Generated ambient soundtrack. A soft pad drifts through four chords; in combat a pulsing bass
 * and ticking percussion fade in. Notes are scheduled slightly ahead using the audio clock.
 */
export class Music {
  enabled = true;
  private bus: GainNode | null = null;
  private combatBus: GainNode | null = null;
  private next = 0;
  private step = 0;
  private combat = 0;

  constructor(private sfx: Sfx) {}

  update(inCombat: boolean, dt: number) {
    const ctx = this.sfx.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.connect(ctx.destination);
      this.combatBus = ctx.createGain();
      this.combatBus.gain.value = 0;
      this.combatBus.connect(this.bus);
      this.next = ctx.currentTime + 0.1;
    }
    const vol = this.enabled ? 0.5 : 0;
    this.bus.gain.setTargetAtTime(vol, ctx.currentTime, 0.4);
    this.combat += ((inCombat ? 1 : 0) - this.combat) * Math.min(1, dt * 0.8);
    this.combatBus!.gain.setTargetAtTime(this.combat, ctx.currentTime, 0.3);
    if (!this.enabled) { this.next = ctx.currentTime + 0.1; return; }

    // Schedule one eighth-note step at a time, 0.3 s ahead.
    const eighth = 0.32;
    while (this.next < ctx.currentTime + 0.3) {
      const bar = Math.floor(this.step / 16);
      const root = PROGRESSION[bar % PROGRESSION.length];
      const inBar = this.step % 16;
      if (inBar === 0) for (const m of CHORD) this.pad(root * m, this.next, eighth * 16);
      if (inBar % 2 === 0) this.bass(root / 2, this.next, eighth * 0.9);
      if (inBar % 4 === 2) this.tick(this.next);
      if (inBar === 6 || inBar === 11) this.pluck(root * (inBar === 6 ? 4 : 3), this.next);
      this.next += eighth;
      this.step++;
    }
  }

  private pad(f: number, t: number, dur: number) {
    const ctx = this.sfx.ctx!;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'sine';
    o.frequency.value = f; o2.frequency.value = f * 1.004;
    lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.bus!);
    o.start(t); o2.start(t); o.stop(t + dur * 1.1); o2.stop(t + dur * 1.1);
  }

  private bass(f: number, t: number, dur: number) {
    const ctx = this.sfx.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.combatBus!);
    o.start(t); o.stop(t + dur);
  }

  private tick(t: number) {
    const ctx = this.sfx.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; hp.type = 'highpass'; hp.frequency.value = 6000; g.gain.value = 0.05;
    src.connect(hp).connect(g).connect(this.combatBus!);
    src.start(t);
  }

  private pluck(f: number, t: number) {
    const ctx = this.sfx.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.025, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(this.bus!);
    o.start(t); o.stop(t + 1.2);
  }
}
