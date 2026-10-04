import { Vector3 } from 'three';
import { AudioEngine, midiToFreq } from './AudioEngine';

export type SfxName =
  | 'swing'
  | 'swingHeavy'
  | 'hit'
  | 'hitHeavy'
  | 'block'
  | 'parry'
  | 'step'
  | 'dodge'
  | 'bodyfall'
  | 'arrow'
  | 'stillfire'
  | 'bell'
  | 'thunder'
  | 'shimmer'
  | 'ui'
  | 'uiConfirm'
  | 'break'
  | 'wrath'
  | 'execute'
  | 'pickup'
  | 'telegraph'
  | 'unblockable'
  | 'calm'
  | 'splash'
  | 'rumble'
  | 'whiteout'
  | 'heartbeat'
  | 'glass';

export type AmbientName = 'rain' | 'wind' | 'river' | 'fire' | 'forge' | 'battle' | 'hall' | 'violet' | 'crowd';

interface PlayOpts {
  pos?: Vector3;
  vol?: number;
  pitch?: number;
}

interface AmbientHandle {
  gain: GainNode;
  stop: () => void;
}

export class Sfx {
  listener = new Vector3();
  listenerYaw = 0;
  private ambients = new Map<AmbientName, AmbientHandle>();
  private humNodes: { gain: GainNode; stop: () => void } | null = null;
  private lastPlay = new Map<string, number>();
  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  private out(opts?: PlayOpts): AudioNode | null {
    const a = this.audio;
    if (!a.ctx) return null;
    const ctx = a.ctx;
    const g = ctx.createGain();
    let vol = opts?.vol ?? 1;
    if (opts?.pos) {
      const dx = opts.pos.x - this.listener.x;
      const dz = opts.pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > 70) return null;
      vol *= 1 / (1 + Math.max(0, d - 2) / 7);
      const ang = Math.atan2(dx, dz) - this.listenerYaw;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.max(-0.85, Math.min(0.85, -Math.sin(ang) * Math.min(1, d / 4)));
      g.connect(pan);
      pan.connect(a.sfx);
    } else {
      g.connect(a.sfx);
    }
    g.gain.value = vol;
    return g;
  }

  private env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(dest: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, peak: number, attack = 0.005) {
    const ctx = this.audio.ctx!;
    const n = this.audio.noiseSource();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    n.connect(f).connect(g).connect(dest);
    n.start(t, Math.random() * 1.5);
    n.stop(t + attack + dur + 0.05);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.003) {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  private metal(dest: AudioNode, t: number, base: number, dur: number, peak: number) {
    const ratios = [1, 2.76, 5.4, 8.93, 13.3];
    ratios.forEach((r, i) => this.tone(dest, t, 'sine', base * r, base * r * 0.995, dur / (1 + i * 0.6), peak / (1 + i * 0.8), 0.001));
  }

  play(name: SfxName, opts?: PlayOpts) {
    const a = this.audio;
    if (!a.ctx) return;
    const nowMs = performance.now();
    const last = this.lastPlay.get(name) ?? 0;
    if (name === 'step' && nowMs - last < 60) return;
    this.lastPlay.set(name, nowMs);
    const dest = this.out(opts);
    if (!dest) return;
    const t = a.ctx.currentTime + 0.005;
    const p = opts?.pitch ?? 1;
    const rv = (amt: number) => {
      const s = a.ctx!.createGain();
      s.gain.value = amt;
      dest.connect(s);
      s.connect(a.reverbSend);
    };
    switch (name) {
      case 'swing':
        this.noiseBurst(dest, t, 'bandpass', 600 * p, 2600 * p, 1.4, 0.16, 0.5, 0.03);
        break;
      case 'swingHeavy':
        this.noiseBurst(dest, t, 'bandpass', 300 * p, 1400 * p, 1.1, 0.32, 0.65, 0.06);
        this.tone(dest, t, 'sine', 90, 50, 0.3, 0.2, 0.05);
        break;
      case 'hit':
        this.tone(dest, t, 'sine', 160 * p, 55, 0.14, 0.9);
        this.noiseBurst(dest, t, 'lowpass', 2600, 500, 0.7, 0.1, 0.6);
        break;
      case 'hitHeavy':
        this.tone(dest, t, 'sine', 120 * p, 38, 0.26, 1);
        this.noiseBurst(dest, t, 'lowpass', 3200, 300, 0.7, 0.2, 0.8);
        rv(0.25);
        break;
      case 'block':
        this.metal(dest, t, 520 * p, 0.35, 0.35);
        this.noiseBurst(dest, t, 'highpass', 3000, 2000, 0.7, 0.05, 0.4);
        rv(0.2);
        break;
      case 'parry':
        this.metal(dest, t, 780 * p, 0.9, 0.5);
        this.metal(dest, t + 0.01, 1170 * p, 0.6, 0.25);
        this.noiseBurst(dest, t, 'highpass', 5000, 3000, 0.7, 0.08, 0.5);
        rv(0.5);
        break;
      case 'step':
        this.noiseBurst(dest, t, 'bandpass', 700 * p * (0.8 + Math.random() * 0.4), 300, 1.2, 0.06, 0.18);
        break;
      case 'dodge':
        this.noiseBurst(dest, t, 'bandpass', 400, 1200, 0.9, 0.28, 0.35, 0.05);
        break;
      case 'bodyfall':
        this.tone(dest, t, 'sine', 90, 35, 0.3, 0.8);
        this.noiseBurst(dest, t, 'lowpass', 900, 200, 0.7, 0.25, 0.5);
        break;
      case 'arrow':
        this.tone(dest, t, 'triangle', 420 * p, 180, 0.12, 0.35);
        this.noiseBurst(dest, t + 0.02, 'bandpass', 2400, 1200, 2, 0.3, 0.25, 0.04);
        break;
      case 'stillfire':
        this.noiseBurst(dest, t, 'highpass', 4000, 6000, 0.6, 0.6, 0.3, 0.08);
        this.tone(dest, t, 'sine', 1800 * p, 2400, 0.5, 0.05, 0.1);
        break;
      case 'bell': {
        const ctx = a.ctx;
        const f = 196 * p;
        const car = ctx.createOscillator();
        const mod = ctx.createOscillator();
        const modG = ctx.createGain();
        car.frequency.value = f;
        mod.frequency.value = f * 1.41;
        modG.gain.setValueAtTime(f * 3, t);
        modG.gain.exponentialRampToValueAtTime(1, t + 4);
        mod.connect(modG).connect(car.frequency);
        const g = ctx.createGain();
        this.env(g, t, 0.005, 0.6, 5);
        car.connect(g).connect(dest);
        car.start(t);
        mod.start(t);
        car.stop(t + 5.2);
        mod.stop(t + 5.2);
        rv(0.8);
        break;
      }
      case 'thunder':
        this.noiseBurst(dest, t, 'lowpass', 1800, 60, 0.5, 3.2, 1.0, 0.02);
        this.noiseBurst(dest, t + 0.25, 'lowpass', 400, 50, 0.4, 2.6, 0.8, 0.3);
        rv(0.7);
        break;
      case 'shimmer':
        [88, 84, 81, 76, 72].forEach((m, i) =>
          this.tone(dest, t + i * 0.11, 'sine', midiToFreq(m), midiToFreq(m) * 0.995, 1.4, 0.18, 0.01),
        );
        rv(1.2);
        break;
      case 'ui':
        this.tone(dest, t, 'sine', 880, 860, 0.06, 0.12);
        break;
      case 'uiConfirm':
        this.tone(dest, t, 'sine', 660, 650, 0.12, 0.14);
        this.tone(dest, t + 0.07, 'sine', 990, 980, 0.18, 0.12);
        break;
      case 'break':
        this.metal(dest, t, 900, 0.5, 0.6);
        this.noiseBurst(dest, t, 'highpass', 2500, 1500, 0.8, 0.25, 0.8);
        this.tone(dest, t, 'square', 300, 120, 0.12, 0.15);
        rv(0.6);
        break;
      case 'wrath':
        this.tone(dest, t, 'sawtooth', 55, 110, 0.9, 0.35, 0.1);
        this.noiseBurst(dest, t, 'bandpass', 200, 3000, 0.8, 0.8, 0.7, 0.15);
        this.metal(dest, t + 0.15, 330, 1.2, 0.3);
        rv(0.8);
        break;
      case 'execute':
        this.tone(dest, t, 'sine', 70, 30, 0.6, 1);
        this.noiseBurst(dest, t, 'lowpass', 4000, 200, 0.8, 0.4, 0.9);
        rv(0.6);
        break;
      case 'pickup':
        [74, 79, 86].forEach((m, i) => this.tone(dest, t + i * 0.08, 'triangle', midiToFreq(m), midiToFreq(m), 0.5, 0.15, 0.01));
        rv(0.6);
        break;
      case 'telegraph':
        this.tone(dest, t, 'triangle', 1250 * p, 1250 * p, 0.12, 0.12, 0.01);
        break;
      case 'unblockable':
        this.tone(dest, t, 'sawtooth', 220, 440, 0.35, 0.22, 0.02);
        this.tone(dest, t, 'sawtooth', 223, 446, 0.35, 0.18, 0.02);
        break;
      case 'calm':
        [62, 65, 67, 69].forEach((m, i) => this.tone(dest, t + i * 0.12, 'sine', midiToFreq(m), midiToFreq(m), 0.8, 0.12, 0.02));
        rv(0.9);
        break;
      case 'splash':
        this.noiseBurst(dest, t, 'lowpass', 3000, 400, 0.6, 0.5, 0.6, 0.01);
        break;
      case 'rumble':
        this.noiseBurst(dest, t, 'lowpass', 160, 40, 0.5, 2.5, 0.9, 0.4);
        break;
      case 'whiteout':
        this.noiseBurst(dest, t, 'highpass', 1200, 9000, 0.4, 2.2, 0.35, 0.8);
        this.tone(dest, t, 'sine', midiToFreq(81), midiToFreq(93), 2.2, 0.12, 0.6);
        rv(1);
        break;
      case 'heartbeat':
        this.tone(dest, t, 'sine', 60, 40, 0.12, 0.8);
        this.tone(dest, t + 0.2, 'sine', 55, 38, 0.14, 0.6);
        break;
      case 'glass':
        this.metal(dest, t, 1600 * p, 1.6, 0.18);
        this.noiseBurst(dest, t, 'highpass', 6000, 4000, 0.6, 0.3, 0.3);
        rv(0.9);
        break;
    }
  }

  // ----------------------------------------------------------- ambience

  setAmbient(name: AmbientName, level: number, fade = 1.5) {
    const a = this.audio;
    if (!a.ctx) return;
    let h = this.ambients.get(name);
    if (level <= 0.001) {
      if (h) {
        const hh = h;
        hh.gain.gain.setTargetAtTime(0, a.ctx.currentTime, fade / 3);
        setTimeout(() => hh.stop(), fade * 1000 + 200);
        this.ambients.delete(name);
      }
      return;
    }
    if (!h) {
      h = this.makeAmbient(name);
      this.ambients.set(name, h);
    }
    h.gain.gain.setTargetAtTime(level, a.ctx.currentTime, fade / 3);
  }

  stopAllAmbient() {
    for (const name of Array.from(this.ambients.keys())) this.setAmbient(name, 0, 1);
  }

  private makeAmbient(name: AmbientName): AmbientHandle {
    const a = this.audio;
    const ctx = a.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(a.ambient);
    const nodes: AudioScheduledSourceNode[] = [];
    const timers: number[] = [];
    const noise = (type: BiquadFilterType, f: number, q: number, vol: number) => {
      const n = a.noiseSource(true);
      const flt = ctx.createBiquadFilter();
      flt.type = type;
      flt.frequency.value = f;
      flt.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      n.connect(flt).connect(g).connect(gain);
      n.start();
      nodes.push(n);
      return { flt, g };
    };
    const lfo = (target: AudioParam, rate: number, depth: number) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start();
      nodes.push(o);
    };
    const random = (every: number, fn: () => void) => {
      timers.push(window.setInterval(() => Math.random() < 0.6 && fn(), every));
    };
    switch (name) {
      case 'rain': {
        noise('highpass', 900, 0.5, 0.4);
        const b = noise('bandpass', 3500, 0.8, 0.25);
        lfo(b.g.gain, 0.2, 0.08);
        break;
      }
      case 'wind': {
        const w = noise('bandpass', 450, 0.8, 0.5);
        lfo(w.flt.frequency, 0.07, 220);
        lfo(w.g.gain, 0.11, 0.2);
        break;
      }
      case 'river': {
        const r = noise('lowpass', 520, 0.7, 0.6);
        lfo(r.g.gain, 0.3, 0.12);
        noise('bandpass', 1800, 2, 0.06);
        break;
      }
      case 'fire': {
        noise('bandpass', 900, 0.6, 0.12);
        random(140, () => {
          const t = ctx.currentTime;
          const n = a.noiseSource();
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = 1500 + Math.random() * 3000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.25 * Math.random(), t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
          n.connect(f).connect(g).connect(gain);
          n.start(t, Math.random());
          n.stop(t + 0.06);
        });
        break;
      }
      case 'forge': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 42;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 110;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        o.connect(f).connect(g).connect(gain);
        o.start();
        nodes.push(o);
        noise('lowpass', 220, 0.5, 0.3);
        break;
      }
      case 'battle': {
        const c = noise('bandpass', 500, 0.6, 0.18);
        lfo(c.g.gain, 0.5, 0.08);
        random(700, () => {
          const t = ctx.currentTime;
          const base = 400 + Math.random() * 600;
          const g = ctx.createGain();
          g.gain.value = 0.08 + Math.random() * 0.06;
          g.connect(gain);
          [1, 2.76, 5.4].forEach((r) => {
            const o = ctx.createOscillator();
            o.frequency.value = base * r;
            const e = ctx.createGain();
            e.gain.setValueAtTime(0.3, t);
            e.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
            o.connect(e).connect(g);
            o.start(t);
            o.stop(t + 0.35);
          });
        });
        break;
      }
      case 'hall': {
        [55, 110.6, 164.5].forEach((fq, i) => {
          const o = ctx.createOscillator();
          o.frequency.value = fq;
          const g = ctx.createGain();
          g.gain.value = 0.12 / (i + 1);
          o.connect(g).connect(gain);
          o.start();
          nodes.push(o);
        });
        break;
      }
      case 'violet': {
        [76, 81, 83, 88].forEach((m, i) => {
          const o = ctx.createOscillator();
          o.frequency.value = midiToFreq(m);
          const g = ctx.createGain();
          g.gain.value = 0.025;
          lfo(g.gain, 0.05 + i * 0.03, 0.022);
          o.connect(g).connect(gain);
          o.start();
          nodes.push(o);
        });
        break;
      }
      case 'crowd': {
        const c = noise('bandpass', 380, 0.9, 0.3);
        lfo(c.g.gain, 0.8, 0.1);
        const c2 = noise('bandpass', 900, 1.2, 0.12);
        lfo(c2.g.gain, 1.3, 0.06);
        break;
      }
    }
    return {
      gain,
      stop: () => {
        timers.forEach((t) => clearInterval(t));
        nodes.forEach((n) => {
          try {
            n.stop();
          } catch {
            /* already stopped */
          }
        });
        gain.disconnect();
      },
    };
  }

  // ------------------------------------------------------------- humming

  /** Ira's four rising notes, unresolved. The fifth was lost long ago. */
  startHum() {
    const a = this.audio;
    if (!a.ctx || this.humNodes) return;
    const ctx = a.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.32, ctx.currentTime, 0.15);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.connect(gain);
    gain.connect(a.sfx);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    gain.connect(send).connect(a.reverbSend);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    const o2g = ctx.createGain();
    o2g.gain.value = 0.25;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = ctx.createGain();
    vibG.gain.value = 3.5;
    vib.connect(vibG);
    vibG.connect(osc.frequency);
    vibG.connect(osc2.frequency);
    const noteG = ctx.createGain();
    noteG.gain.value = 0;
    osc.connect(noteG);
    osc2.connect(o2g).connect(noteG);
    noteG.connect(lp);
    const flat = 0.985;
    const notes = [62, 65, 67, 69];
    let t = ctx.currentTime + 0.05;
    const schedule = () => {
      const now = ctx.currentTime;
      while (t < now + 1.5) {
        notes.forEach((m, i) => {
          const st = t + i * 0.62;
          const f = midiToFreq(m) * flat;
          osc.frequency.setTargetAtTime(f, st, 0.03);
          osc2.frequency.setTargetAtTime(f * 2, st, 0.03);
          noteG.gain.setTargetAtTime(1, st, 0.05);
          noteG.gain.setTargetAtTime(0.55, st + 0.42, 0.08);
        });
        noteG.gain.setTargetAtTime(0.0, t + 4 * 0.62 + 0.1, 0.25);
        t += 4 * 0.62 + 1.1;
      }
    };
    schedule();
    const timer = window.setInterval(schedule, 400);
    osc.start();
    osc2.start();
    vib.start();
    this.humNodes = {
      gain,
      stop: () => {
        clearInterval(timer);
        const n = ctx.currentTime;
        gain.gain.cancelScheduledValues(n);
        gain.gain.setTargetAtTime(0, n, 0.12);
        setTimeout(() => {
          [osc, osc2, vib].forEach((o) => {
            try {
              o.stop();
            } catch {
              /* ignore */
            }
          });
          gain.disconnect();
        }, 700);
      },
    };
  }

  stopHum() {
    this.humNodes?.stop();
    this.humNodes = null;
  }
}
