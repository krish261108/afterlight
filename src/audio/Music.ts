import { AudioEngine, midiToFreq } from './AudioEngine';

export type Mood = 'silence' | 'title' | 'calm' | 'tension' | 'combat' | 'boss' | 'sorrow' | 'wonder' | 'dread';

type Layer = 'pad' | 'bass' | 'arp' | 'drums' | 'choir' | 'strings' | 'brass' | 'bells' | 'lullaby';
const LAYERS: Layer[] = ['pad', 'bass', 'arp', 'drums', 'choir', 'strings', 'brass', 'bells', 'lullaby'];

// D minor family. Each chord is a list of MIDI notes around middle C.
const Dm = [50, 53, 57];
const Bb = [46, 50, 53];
const F = [53, 57, 60];
const C = [48, 52, 55];
const Gm = [55, 58, 62];
const A = [49, 52, 57];
const Eb = [51, 55, 58];

interface MoodDef {
  tempo: number;
  prog: number[][];
  gains: Partial<Record<Layer, number>>;
  bassStyle: 'whole' | 'pulse' | 'drive';
  drumStyle: 'none' | 'low' | 'battle' | 'taiko';
}

const MOODS: Record<Mood, MoodDef> = {
  silence: { tempo: 70, prog: [Dm], gains: {}, bassStyle: 'whole', drumStyle: 'none' },
  title: {
    tempo: 64,
    prog: [Dm, Bb, F, C],
    gains: { pad: 0.5, lullaby: 0.45, choir: 0.18 },
    bassStyle: 'whole',
    drumStyle: 'none',
  },
  calm: {
    tempo: 72,
    prog: [Dm, Bb, F, C],
    gains: { pad: 0.42, arp: 0.24, bass: 0.22 },
    bassStyle: 'whole',
    drumStyle: 'none',
  },
  tension: {
    tempo: 92,
    prog: [Dm, Bb, Gm, A],
    gains: { pad: 0.32, bass: 0.4, strings: 0.22, drums: 0.3 },
    bassStyle: 'pulse',
    drumStyle: 'low',
  },
  combat: {
    tempo: 128,
    prog: [Dm, C, Bb, C],
    gains: { drums: 0.72, bass: 0.5, pad: 0.26, brass: 0.32, strings: 0.22 },
    bassStyle: 'drive',
    drumStyle: 'battle',
  },
  boss: {
    tempo: 138,
    prog: [Dm, Bb, Gm, A],
    gains: { drums: 0.8, bass: 0.55, choir: 0.42, brass: 0.42, strings: 0.28, bells: 0.18 },
    bassStyle: 'drive',
    drumStyle: 'taiko',
  },
  sorrow: {
    tempo: 58,
    prog: [Dm, Gm, Bb, A],
    gains: { choir: 0.45, pad: 0.32, lullaby: 0.36 },
    bassStyle: 'whole',
    drumStyle: 'none',
  },
  wonder: {
    tempo: 76,
    prog: [F, C, Dm, Bb],
    gains: { arp: 0.32, choir: 0.28, pad: 0.38, bells: 0.24 },
    bassStyle: 'whole',
    drumStyle: 'none',
  },
  dread: {
    tempo: 68,
    prog: [Dm, Eb, Dm, A],
    gains: { pad: 0.34, strings: 0.2, bass: 0.3, drums: 0.18 },
    bassStyle: 'whole',
    drumStyle: 'low',
  },
};

export class Music {
  mood: Mood = 'silence';
  private def: MoodDef = MOODS.silence;
  private gains = new Map<Layer, GainNode>();
  private targets = new Map<Layer, number>();
  private activeUntil = new Map<Layer, number>();
  private step = 0;
  private nextTime = 0;
  private started = false;
  private audio: AudioEngine;

  constructor(audio: AudioEngine) {
    this.audio = audio;
  }

  private ensure() {
    const ctx = this.audio.ctx;
    if (!ctx || this.started) return !!ctx;
    for (const l of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.audio.music);
      if (l === 'choir' || l === 'lullaby' || l === 'bells' || l === 'pad' || l === 'strings') {
        const s = ctx.createGain();
        s.gain.value = l === 'pad' ? 0.25 : 0.5;
        g.connect(s).connect(this.audio.reverbSend);
      }
      this.gains.set(l, g);
      this.targets.set(l, 0);
    }
    this.nextTime = ctx.currentTime + 0.1;
    this.started = true;
    return true;
  }

  setMood(m: Mood) {
    if (!this.ensure()) {
      this.mood = m;
      this.def = MOODS[m];
      return;
    }
    if (m === this.mood && this.started) {
      this.applyGains(1.5);
      return;
    }
    const ctx = this.audio.ctx!;
    const fromCalm = this.def.drumStyle === 'none';
    this.mood = m;
    this.def = MOODS[m];
    // Restart the progression on the downbeat so the change lands musically.
    this.step = 0;
    if (fromCalm || this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.08;
    this.applyGains(m === 'combat' || m === 'boss' ? 0.6 : 2.0);
  }

  private applyGains(fade: number) {
    const ctx = this.audio.ctx!;
    for (const l of LAYERS) {
      const target = this.def.gains[l] ?? 0;
      this.targets.set(l, target);
      this.gains.get(l)!.gain.setTargetAtTime(target, ctx.currentTime, fade / 3);
      if (target > 0) this.activeUntil.set(l, Infinity);
      else this.activeUntil.set(l, ctx.currentTime + fade * 2);
    }
  }

  private isActive(l: Layer) {
    const ctx = this.audio.ctx!;
    return (this.activeUntil.get(l) ?? 0) > ctx.currentTime;
  }

  update() {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    if (!this.started) {
      this.ensure();
      this.applyGains(1.5);
    }
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.05;
    const stepDur = 60 / this.def.tempo / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private scheduleStep(step: number, t: number, sd: number) {
    const d = this.def;
    const chord = d.prog[Math.floor(step / 32) % d.prog.length];
    const inBar = step % 16;
    const chordStart = step % 32 === 0;
    const root = chord[0];

    if (chordStart && this.isActive('pad')) for (const n of chord) this.pad(n, t, sd * 32);
    if (chordStart && this.isActive('choir')) for (const n of chord) this.choir(n + 12, t, sd * 32);
    if (chordStart && this.isActive('strings')) for (const n of chord) this.strings(n + 24, t, sd * 32);

    if (this.isActive('bass')) {
      if (d.bassStyle === 'whole' && (step % 32 === 0 || step % 32 === 16)) this.bass(root - 12, t, sd * 15, 0.7);
      if (d.bassStyle === 'pulse' && step % 2 === 0) this.bass(root - 12, t, sd * 1.6, step % 8 === 0 ? 0.9 : 0.55);
      if (d.bassStyle === 'drive') {
        const pat = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1];
        if (pat[inBar]) this.bass(root - 12 + (inBar === 14 ? 7 : 0), t, sd * 0.9, inBar % 4 === 0 ? 1 : 0.6);
      }
    }

    if (this.isActive('arp') && step % 2 === 0) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const idx = seq[(step / 2) % seq.length];
      if (this.def.drumStyle !== 'none' || Math.random() < 0.75) this.arp(chord[idx] + 12 + (step % 16 >= 8 ? 12 : 0), t);
    }

    if (this.isActive('drums')) this.drums(inBar, step, t, sd);

    if (this.isActive('brass') && (step % 32 === 0 || step % 32 === 3 || step % 32 === 6)) {
      for (const n of chord) this.brass(n, t, sd * (step % 32 === 6 ? 6 : 2));
    }

    if (this.isActive('bells') && step % 8 === 4) {
      this.bell(chord[Math.floor(Math.random() * 3)] + 24, t);
    }

    // The lullaby: four rising notes. It never resolves.
    if (this.isActive('lullaby') && step % 64 === 16) {
      [62, 65, 67, 69].forEach((m, i) => this.lull(m + 12, t + i * sd * 4, sd * 3.6));
    }
  }

  // ----------------------------------------------------------- instruments

  private envGain(t: number, a: number, peak: number, hold: number, r: number) {
    const g = this.audio.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
    return g;
  }

  private osc(type: OscillatorType, f: number, t: number, end: number, detune = 0) {
    const o = this.audio.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    o.start(t);
    o.stop(end);
    return o;
  }

  private pad(m: number, t: number, dur: number) {
    const ctx = this.audio.ctx!;
    const f = midiToFreq(m);
    const end = t + dur + 2;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = this.envGain(t, 1.4, 0.07, Math.max(0.1, dur - 1.4), 1.8);
    for (const dt of [-8, 7]) this.osc('sawtooth', f, t, end, dt).connect(lp);
    lp.connect(g).connect(this.gains.get('pad')!);
  }

  private choir(m: number, t: number, dur: number) {
    const ctx = this.audio.ctx!;
    const f = midiToFreq(m);
    const end = t + dur + 2.5;
    const g = this.envGain(t, 1.6, 0.05, Math.max(0.1, dur - 1.6), 2.2);
    const src = ctx.createGain();
    for (const dt of [-6, 5]) this.osc('sawtooth', f, t, end, dt).connect(src);
    const vib = this.osc('sine', 4.8, t, end);
    const vg = ctx.createGain();
    vg.gain.value = 2.5;
    vib.connect(vg);
    for (const [fq, q, amp] of [
      [800, 6, 1],
      [1150, 8, 0.6],
      [2900, 10, 0.25],
    ]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = q;
      const a = ctx.createGain();
      a.gain.value = amp;
      src.connect(bp).connect(a).connect(g);
    }
    g.connect(this.gains.get('choir')!);
  }

  private strings(m: number, t: number, dur: number) {
    const ctx = this.audio.ctx!;
    const end = t + dur + 1.2;
    const o = this.osc('sawtooth', midiToFreq(m), t, end);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = this.osc('sine', 11, t, end);
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg).connect(trem.gain);
    const g = this.envGain(t, 0.6, 0.025, Math.max(0.1, dur - 0.6), 1);
    o.connect(lp).connect(trem).connect(g).connect(this.gains.get('strings')!);
  }

  private bass(m: number, t: number, dur: number, vel: number) {
    const ctx = this.audio.ctx!;
    const o = this.osc('sawtooth', midiToFreq(m), t, t + dur + 0.4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + Math.min(0.4, dur));
    const g = this.envGain(t, 0.01, 0.22 * vel, Math.max(0.02, dur * 0.6), 0.25);
    o.connect(lp).connect(g).connect(this.gains.get('bass')!);
  }

  private arp(m: number, t: number) {
    const o = this.osc('triangle', midiToFreq(m), t, t + 0.9);
    const g = this.envGain(t, 0.005, 0.09, 0.02, 0.7);
    o.connect(g).connect(this.gains.get('arp')!);
  }

  private brass(m: number, t: number, dur: number) {
    const ctx = this.audio.ctx!;
    const o1 = this.osc('sawtooth', midiToFreq(m), t, t + dur + 0.4, -5);
    const o2 = this.osc('sawtooth', midiToFreq(m), t, t + dur + 0.4, 6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(250, t);
    lp.frequency.linearRampToValueAtTime(1800, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = this.envGain(t, 0.03, 0.06, dur * 0.5, dur * 0.5 + 0.2);
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.gains.get('brass')!);
  }

  private bell(m: number, t: number) {
    const ctx = this.audio.ctx!;
    const f = midiToFreq(m);
    const car = this.osc('sine', f, t, t + 3);
    const mod = this.osc('sine', f * 3.5, t, t + 3);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.5, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 2);
    mod.connect(mg).connect(car.frequency);
    const g = this.envGain(t, 0.003, 0.06, 0.01, 2.6);
    car.connect(g).connect(this.gains.get('bells')!);
  }

  private lull(m: number, t: number, dur: number) {
    const ctx = this.audio.ctx!;
    const f = midiToFreq(m);
    const o = this.osc('sine', f, t, t + dur + 1.5);
    const o2 = this.osc('sine', f * 2, t, t + dur + 1.5);
    const o2g = ctx.createGain();
    o2g.gain.value = 0.18;
    o2.connect(o2g);
    const g = this.envGain(t, 0.08, 0.12, dur * 0.5, dur * 0.5 + 1.2);
    o.connect(g);
    o2g.connect(g);
    g.connect(this.gains.get('lullaby')!);
  }

  private drums(inBar: number, step: number, t: number, sd: number) {
    const style = this.def.drumStyle;
    if (style === 'none') return;
    const bar = Math.floor(step / 16);
    if (style === 'low') {
      if (inBar === 0) this.tom(70, t, 0.9);
      if (inBar === 10 && bar % 2 === 1) this.tom(62, t, 0.6);
      return;
    }
    if (style === 'battle' || style === 'taiko') {
      if (inBar === 0 || inBar === 8 || (inBar === 10 && style === 'battle')) this.kick(t, 1);
      if (inBar === 4 || inBar === 12) this.snare(t, 0.8);
      if (inBar % 2 === 0) this.hat(t, inBar % 4 === 0 ? 0.35 : 0.2);
      if (bar % 4 === 3 && inBar >= 12) this.tom(90 - (inBar - 12) * 8, t, 0.7);
      if (style === 'taiko') {
        if (inBar === 0) this.tom(48, t, 1.2);
        if (inBar % 4 === 2) this.tom(75, t, 0.45);
      }
    }
    void sd;
  }

  private kick(t: number, vel: number) {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = this.envGain(t, 0.002, 0.7 * vel, 0.02, 0.28);
    o.connect(g).connect(this.gains.get('drums')!);
    o.start(t);
    o.stop(t + 0.4);
  }

  private tom(f: number, t: number, vel: number) {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(f * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    const g = this.envGain(t, 0.002, 0.55 * vel, 0.03, 0.5);
    o.connect(g).connect(this.gains.get('drums')!);
    o.start(t);
    o.stop(t + 0.7);
    const n = this.audio.noiseSource();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const ng = this.envGain(t, 0.001, 0.25 * vel, 0.005, 0.12);
    n.connect(lp).connect(ng).connect(this.gains.get('drums')!);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  private snare(t: number, vel: number) {
    const ctx = this.audio.ctx!;
    const n = this.audio.noiseSource();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const g = this.envGain(t, 0.001, 0.4 * vel, 0.01, 0.16);
    n.connect(bp).connect(g).connect(this.gains.get('drums')!);
    n.start(t, Math.random());
    n.stop(t + 0.25);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 185;
    const og = this.envGain(t, 0.001, 0.25 * vel, 0.01, 0.08);
    o.connect(og).connect(this.gains.get('drums')!);
    o.start(t);
    o.stop(t + 0.15);
  }

  private hat(t: number, vel: number) {
    const ctx = this.audio.ctx!;
    const n = this.audio.noiseSource();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = this.envGain(t, 0.001, 0.12 * vel, 0.005, 0.04);
    n.connect(hp).connect(g).connect(this.gains.get('drums')!);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }

  stinger(kind: 'death' | 'reveal' | 'victory') {
    const ctx = this.audio.ctx;
    if (!ctx || !this.ensure()) return;
    const t = ctx.currentTime + 0.02;
    const dest = this.audio.music;
    const send = this.audio.reverbSend;
    const chordTone = (m: number, start: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiToFreq(m);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      const g = this.envGain(start, 0.4, vol, dur * 0.4, dur * 0.6);
      o.connect(lp).connect(g);
      g.connect(dest);
      g.connect(send);
      o.start(start);
      o.stop(start + dur + 1);
    };
    if (kind === 'death') {
      [38, 45, 50, 53].forEach((m) => chordTone(m, t, 4, 'sawtooth', 0.05));
      [74, 72, 69].forEach((m, i) => chordTone(m, t + 0.6 + i * 0.5, 2.2, 'sine', 0.06));
    } else if (kind === 'reveal') {
      [62, 69, 74, 77].forEach((m, i) => chordTone(m, t + i * 0.15, 3.5, 'triangle', 0.05));
    } else {
      [50, 54, 57, 62, 66].forEach((m) => chordTone(m, t, 5, 'sawtooth', 0.045));
    }
  }
}
