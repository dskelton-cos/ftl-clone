import type { SfxName } from '../sim/battle';

/** Tiny synthesized sound effects (no audio files needed). */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock() {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { /* audio unavailable */ }
  }

  play(name: SfxName | 'click' | 'deny') {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    switch (name) {
      case 'laser': return this.tone(900, 180, 0.12, 'square', 0.05);
      case 'missile': this.noise(0.35, 0.08, 900); return this.tone(220, 90, 0.3, 'sawtooth', 0.04);
      case 'beam': return this.tone(140, 260, 0.9, 'sawtooth', 0.05);
      case 'ion': return this.tone(1400, 500, 0.18, 'sine', 0.07);
      case 'hit': return this.noise(0.3, 0.16, 600);
      case 'shield': return this.tone(500, 1200, 0.15, 'triangle', 0.06);
      case 'miss': return this.tone(700, 650, 0.08, 'sine', 0.03);
      case 'explode': return this.noise(1.2, 0.25, 300);
      case 'death': return this.tone(400, 80, 0.5, 'sawtooth', 0.05);
      case 'click': return this.tone(1200, 1200, 0.03, 'square', 0.03);
      case 'deny': return this.tone(160, 120, 0.12, 'square', 0.05);
    }
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
    const ctx = this.ctx!, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur);
  }

  private noise(dur: number, vol: number, cutoff: number) {
    const ctx = this.ctx!, t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(t);
  }
}
