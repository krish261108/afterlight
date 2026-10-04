export interface VoiceProfile {
  gender: 'f' | 'm';
  pitch: number;
  rate: number;
  /** Index into the matching-gender voice list, so characters sound distinct. */
  slot?: number;
}

const FEMALE_HINTS = [
  'female', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'zira', 'susan', 'hazel',
  'serena', 'allison', 'ava', 'kate', 'libby', 'sonia', 'jenny', 'aria', 'emma', 'natasha', 'catherine',
  'google uk english female', 'google us english', 'microsoft zira', 'microsoft hazel',
];
const MALE_HINTS = [
  'male', 'daniel', 'alex', 'fred', 'david', 'mark', 'george', 'james', 'rishi', 'tom', 'oliver',
  'arthur', 'ryan', 'guy', 'thomas', 'aaron', 'gordon', 'lee', 'reed', 'ralph', 'albert',
  'google uk english male', 'microsoft david', 'microsoft mark', 'microsoft george',
];

export class Voice {
  enabled = true;
  volume = 1;
  private female: SpeechSynthesisVoice[] = [];
  private male: SpeechSynthesisVoice[] = [];
  private any: SpeechSynthesisVoice[] = [];
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private current: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (!this.supported) return;
    const load = () => this.loadVoices();
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  get available() {
    return this.supported && this.any.length > 0;
  }

  private loadVoices() {
    const all = window.speechSynthesis.getVoices();
    const en = all.filter((v) => /^en(-|_|$)/i.test(v.lang));
    const pool = en.length ? en : all;
    this.any = pool;
    const has = (v: SpeechSynthesisVoice, hints: string[]) => hints.some((h) => v.name.toLowerCase().includes(h));
    this.female = pool.filter((v) => has(v, FEMALE_HINTS) && !/\bmale\b/i.test(v.name.replace(/female/i, '')));
    this.male = pool.filter((v) => has(v, MALE_HINTS) && !/female/i.test(v.name));
    // Prefer local voices (lower latency, no network).
    const localFirst = (a: SpeechSynthesisVoice, b: SpeechSynthesisVoice) => Number(b.localService) - Number(a.localService);
    this.female.sort(localFirst);
    this.male.sort(localFirst);
  }

  private pick(p: VoiceProfile): SpeechSynthesisVoice | null {
    const list = p.gender === 'f' ? this.female : this.male;
    const src = list.length ? list : this.any;
    if (!src.length) return null;
    return src[(p.slot ?? 0) % src.length];
  }

  /** Speaks a line. Resolves when finished, or after a sensible timeout if the engine never reports back. */
  speak(text: string, p: VoiceProfile): Promise<void> {
    const words = text.split(/\s+/).length;
    const estimate = Math.max(1.2, (words * 0.42) / p.rate) + 0.6;
    if (!this.enabled || !this.supported || this.volume <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        const v = this.pick(p);
        if (v) u.voice = v;
        // If the voice list lacked the right gender, lean on pitch to separate characters.
        const genderMissing = p.gender === 'f' ? !this.female.length : !this.male.length;
        const pitchShift = genderMissing ? (p.gender === 'f' ? 0.25 : -0.25) : 0;
        u.pitch = Math.max(0, Math.min(2, p.pitch + pitchShift));
        u.rate = Math.max(0.5, Math.min(1.6, p.rate));
        u.volume = this.volume;
        u.onend = finish;
        u.onerror = finish;
        this.current = u;
        window.speechSynthesis.speak(u);
        setTimeout(finish, estimate * 1000 + 2500);
      } catch {
        finish();
      }
    });
  }

  cancel() {
    if (!this.supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    this.current = null;
  }

  pause() {
    if (this.supported && this.current) window.speechSynthesis.pause();
  }

  resume() {
    if (this.supported && this.current) window.speechSynthesis.resume();
  }
}
