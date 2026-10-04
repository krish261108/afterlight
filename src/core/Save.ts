export type Difficulty = 'story' | 'soldier' | 'fortyseven';
export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  voice: boolean;
  voiceVolume: number;
  subtitles: boolean;
  sensitivity: number;
  invertY: boolean;
  quality: Quality;
  difficulty: Difficulty;
  touchControls: 'auto' | 'on' | 'off';
}

export interface Stats {
  deaths: number;
  kills: number;
  mercy: number;
  parries: number;
  playTime: number;
}

export interface SaveData {
  version: 1;
  chapter: number;
  checkpoint: string;
  life: number;
  memories: boolean[];
  shards: string[];
  choices: Record<string, string>;
  stats: Stats;
  unlocked: number;
  finished: boolean;
}

const SETTINGS_KEY = 'afterlight.settings.v1';
const SAVE_KEY = 'afterlight.save.v1';

export function defaultSettings(touch: boolean): Settings {
  return {
    master: 0.85,
    music: 0.6,
    sfx: 0.85,
    voice: true,
    voiceVolume: 1,
    subtitles: true,
    sensitivity: 1,
    invertY: false,
    quality: touch ? 'low' : 'high',
    difficulty: 'soldier',
    touchControls: 'auto',
  };
}

export function newSave(memoryCount: number): SaveData {
  return {
    version: 1,
    chapter: 0,
    checkpoint: 'start',
    life: 1,
    memories: new Array(memoryCount).fill(true),
    shards: [],
    choices: {},
    stats: { deaths: 0, kills: 0, mercy: 0, parries: 0, playTime: 0 },
    unlocked: 0,
    finished: false,
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable: progress lives only in memory this session */
  }
}

export function loadSettings(touch: boolean): Settings {
  return { ...defaultSettings(touch), ...(read<Partial<Settings>>(SETTINGS_KEY) ?? {}) };
}

export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

export function loadSave(memoryCount: number): SaveData | null {
  const s = read<SaveData>(SAVE_KEY);
  if (!s || s.version !== 1) return null;
  const base = newSave(memoryCount);
  const merged: SaveData = { ...base, ...s, stats: { ...base.stats, ...s.stats } };
  if (!Array.isArray(merged.memories) || merged.memories.length !== memoryCount) {
    merged.memories = base.memories;
  }
  return merged;
}

export const writeSave = (s: SaveData) => write(SAVE_KEY, s);

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
