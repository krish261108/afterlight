export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  ambient!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  compressor!: DynamicsCompressorNode;
  noise!: AudioBuffer;
  private vol = { master: 0.85, music: 0.6, sfx: 0.85 };

  get ready() {
    return !!this.ctx;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.004;
      this.compressor.release.value = 0.2;
      this.master = ctx.createGain();
      this.master.connect(this.compressor);
      this.compressor.connect(ctx.destination);
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.ambient = ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      this.ambient.connect(this.master);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(3.2, 2.4);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 1;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
      this.noise = this.makeNoise(2);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.ambient.gain.setTargetAtTime(this.vol.sfx * 0.8, t, 0.05);
  }

  /** Duck the music under dialogue or dramatic beats. */
  duck(amount: number, time = 0.4) {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(this.vol.music * 0.55 * amount, this.ctx.currentTime, time);
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  noiseSource(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }
}

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
