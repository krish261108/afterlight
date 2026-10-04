import * as THREE from 'three';
import { Engine } from './core/Engine';
import { Input } from './core/Input';
import { CameraRig } from './core/CameraRig';
import { AudioEngine } from './audio/AudioEngine';
import { Music } from './audio/Music';
import { Sfx } from './audio/Sfx';
import { Voice } from './audio/Voice';
import { UI, CHAPTERS, type HUDState, type MarkerState } from './ui/UI';
import { loadSave, loadSettings, newSave, saveSettings, writeSave, clearSave, type SaveData, type Settings } from './core/Save';
import { LOSABLE, MEMORIES, perksFrom } from './story/cast';
import { isTouchDevice } from './core/util';
import type { Level } from './levels/Level';
import type { Player } from './entities/Player';
import { Fighter } from './entities/Fighter';
import { TitleScene, TITLE_LIGHT } from './levels/TitleScene';
import { Prologue } from './levels/Prologue';
import { Chapter1 } from './levels/Chapter1';
import { Chapter2 } from './levels/Chapter2';
import { Chapter3 } from './levels/Chapter3';
import { Chapter4 } from './levels/Chapter4';

type State = 'title' | 'playing' | 'paused' | 'dead' | 'loading' | 'credits';

const LEVELS = [Prologue, Chapter1, Chapter2, Chapter3, Chapter4];

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly camera: CameraRig;
  readonly audio = new AudioEngine();
  readonly music: Music;
  readonly sfx: Sfx;
  readonly voice = new Voice();
  readonly ui: UI;
  settings: Settings;
  save: SaveData;
  state: State = 'title';
  level: Level | null = null;
  private title: TitleScene | null = null;
  private hitstopT = 0;
  private last = performance.now();
  private hasSave: boolean;
  private deathToken = 0;
  private ignoreUnlock = false;
  private proj = new THREE.Vector3();
  fps = 60;
  /** Debug only (?debug in the URL): fast-forward and autopilot for automated play-throughs. */
  debug = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');
  timeScale = 1;
  autopilot = false;
  frames = 0;
  errors: string[] = [];

  constructor(root: HTMLElement) {
    const touch = isTouchDevice();
    this.settings = loadSettings(touch);
    const existing = loadSave(MEMORIES.length);
    this.hasSave = !!existing && !existing.finished && !(existing.chapter === 0 && existing.checkpoint === 'start');
    this.save = existing ?? newSave(MEMORIES.length);
    this.engine = new Engine(root);
    this.input = new Input(this.engine.canvas);
    this.camera = new CameraRig(this.engine.camera);
    this.music = new Music(this.audio);
    this.sfx = new Sfx(this.audio);
    this.ui = new UI(
      root,
      {
        onNewGame: () => this.newGame(),
        onContinue: () => this.continueGame(),
        onChapter: (i) => this.startChapter(i, 'start'),
        onResume: () => this.resume(),
        onQuitToTitle: () => this.toTitle(),
        onRestartCheckpoint: () => this.restartCheckpoint(),
        onSettings: (s) => this.applySettings(s),
        click: () => this.sfx.play('ui'),
      },
      this.settings,
    );
    this.input.buildTouch(root);
    this.input.onPointerUnlock = () => {
      if (this.state === 'playing' && !this.ui.choosing && !this.ignoreUnlock) this.pause();
      this.ignoreUnlock = false;
    };
    this.applySettings(this.settings);
    const unlock = () => {
      this.audio.unlock();
      if (this.state === 'title') this.music.setMood('title');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('error', (e) => this.errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => this.errors.push(String(e.reason)));
    this.toTitle();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------- flow

  toTitle() {
    this.voice.cancel();
    this.sfx.stopHum();
    this.input.exitLock();
    this.input.gameplayActive = false;
    this.input.setTouchVisible(false);
    this.level?.dispose();
    this.level = null;
    this.state = 'title';
    this.ui.setHUDVisible(false);
    this.ui.setLetterbox(false);
    this.ui.clearSubtitle();
    void this.ui.fade(0, 0.6);
    if (!this.title) {
      this.title = new TitleScene(this.settings.quality);
      this.engine.scene.add(this.title.group);
    }
    this.engine.applyLighting(TITLE_LIGHT);
    this.engine.setStars(0.6);
    this.sfx.stopAllAmbient();
    this.sfx.setAmbient('river', 0.35);
    this.sfx.setAmbient('wind', 0.2);
    this.music.setMood('title');
    const s = loadSave(MEMORIES.length);
    this.hasSave = !!s && !s.finished && !(s.chapter === 0 && s.checkpoint === 'start');
    this.ui.showTitle(this.hasSave, this.save.unlocked, this.save.finished);
  }

  private disposeTitle() {
    if (this.title) {
      this.engine.scene.remove(this.title.group);
      this.title.dispose();
      this.title = null;
    }
    this.engine.setStars(0);
  }

  newGame() {
    const keepUnlock = this.save.unlocked;
    const finished = this.save.finished;
    clearSave();
    this.save = newSave(MEMORIES.length);
    this.save.unlocked = keepUnlock;
    this.save.finished = finished;
    this.ui.showControls(() => this.startChapter(0, 'start'));
  }

  continueGame() {
    const s = loadSave(MEMORIES.length);
    if (s) this.save = s;
    this.startChapter(this.save.chapter, this.save.checkpoint);
  }

  async startChapter(i: number, cp: string) {
    this.state = 'loading';
    this.ui.clearScreens();
    this.input.setTouchVisible(false);
    await this.ui.fade(1, 0.7);
    this.disposeTitle();
    this.level?.dispose();
    this.level = null;
    this.save.chapter = i;
    this.save.checkpoint = cp;
    if (i >= 1 && this.save.life < 47) this.save.life = 47;
    writeSave(this.save);
    const L = LEVELS[i];
    const level = new L(this);
    this.level = level;
    this.ui.showLoading(CHAPTERS[i].t.toUpperCase());
    await new Promise((r) => setTimeout(r, 30));
    level.start(cp);
    this.ui.clearScreens();
    this.ui.setHUDVisible(true);
    this.state = 'playing';
    this.input.gameplayActive = true;
    this.input.releaseAll();
    this.updateTouchVisibility();
    void this.ui.fade(0, 1.2);
  }

  completeChapter() {
    const i = this.level?.index ?? 0;
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(LEVELS.length - 1, i + 1));
    if (i + 1 < LEVELS.length) {
      void this.startChapter(i + 1, 'start');
    } else {
      this.save.finished = true;
      writeSave(this.save);
      this.showCredits();
    }
  }

  private showCredits() {
    this.state = 'credits';
    this.input.exitLock();
    this.input.gameplayActive = false;
    this.input.setTouchVisible(false);
    this.ui.setHUDVisible(false);
    this.ui.setLetterbox(false);
    this.music.setMood('title');
    const kept = this.save.memories.filter((k, idx) => k && !MEMORIES[idx].sealed).length;
    this.ui.showCredits(this.save.stats, this.save.life, kept, () => this.toTitle());
    void this.ui.fade(0, 1.5);
  }

  pause() {
    if (this.state !== 'playing' || !this.level) return;
    this.state = 'paused';
    this.ignoreUnlock = true;
    this.input.exitLock();
    this.input.flush();
    this.input.setTouchVisible(false);
    this.voice.pause();
    this.sfx.stopHum();
    if (this.level.player) this.level.player.humming = false;
    this.audio.duck(0.35);
    this.showPauseMenu();
  }

  private showPauseMenu() {
    const lvl = this.level!;
    this.ui.showPause(
      `${CHAPTERS[lvl.index].n}: ${CHAPTERS[lvl.index].t}`,
      () => this.ui.showBook(this.save.memories, lvl.firstLife ? null : this.save.life, () => this.showPauseMenu(), lvl.firstLife),
      () => this.ui.showControls(() => this.showPauseMenu(), 'Back'),
    );
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ignoreUnlock = false;
    this.input.flush();
    this.ui.clearScreens();
    this.state = 'playing';
    this.voice.resume();
    this.audio.duck(1);
    this.input.releaseAll();
    this.updateTouchVisibility();
  }

  restartCheckpoint() {
    if (!this.level) return;
    this.ui.clearScreens();
    this.state = 'playing';
    this.audio.duck(1);
    this.level.restart(this.save.checkpoint);
    this.input.releaseAll();
    this.updateTouchVisibility();
  }

  onCheckpoint(chapter: number, cp: string) {
    this.save.chapter = chapter;
    this.save.checkpoint = cp;
    writeSave(this.save);
    if (this.level && this.level.time > 3) this.ui.toast('Checkpoint reached.');
  }

  async onPlayerDeath() {
    if (this.state !== 'playing' || !this.level) return;
    const level = this.level;
    this.state = 'dead';
    const token = ++this.deathToken;
    this.save.stats.deaths++;
    this.input.setTouchVisible(false);
    this.ui.setHUDVisible(false);
    this.sfx.stopHum();
    this.voice.cancel();
    this.ui.clearSubtitle();
    this.music.stinger('death');
    this.audio.duck(0.25, 1);
    await new Promise((r) => setTimeout(r, 1400));
    if (token !== this.deathToken || this.level !== level) return;
    let screen: HTMLElement;
    if (level.firstLife) {
      this.sfx.play('whiteout');
      await this.ui.fade(1, 1.2, true);
      screen = this.ui.death('No. That\'s not how it happened.', '', '');
      await this.ui.fade(0.85, 0.4, true);
    } else {
      this.save.life++;
      const keptIdx = LOSABLE.filter((i) => this.save.memories[i]);
      let lostText = 'There was nothing left to take.';
      if (keptIdx.length) {
        const i = keptIdx[Math.floor(Math.random() * keptIdx.length)];
        this.save.memories[i] = false;
        lostText = `A memory fades: ${MEMORIES[i].title}`;
      }
      writeSave(this.save);
      this.sfx.play('shimmer');
      await this.ui.fade(1, 1.2);
      screen = this.ui.death(lostText, 'The Wheel turns.', `LIFE ${this.save.life}`);
      await this.ui.fade(0.6, 0.4);
    }
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        if (token !== this.deathToken) return resolve();
        const el = performance.now() - start;
        if (el > (level.firstLife ? 2600 : 5200) || (el > 1500 && (this.input.pressed('confirm') || this.input.pressed('light')))) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
      screen.addEventListener('click', () => performance.now() - start > 1200 && resolve());
    });
    if (token !== this.deathToken || this.level !== level) return;
    this.ui.clearScreens();
    this.audio.duck(1);
    level.restart(this.save.checkpoint);
    this.state = 'playing';
    this.input.releaseAll();
    this.updateTouchVisibility();
    void this.ui.fade(0, 1.0, level.firstLife);
    if (!level.firstLife) this.ui.toast(`Life ${this.save.life}. ${this.memoriesLeft()} memories remain.`, 'red');
  }

  memoriesLeft() {
    return LOSABLE.filter((i) => this.save.memories[i]).length;
  }

  applyPerks(p: Player) {
    if (this.level?.firstLife) {
      p.applyPerks({ humHeal: 1, posture: 1, stamina: 1, damage: 1, parry: 1, wrathGain: 1 });
      return;
    }
    p.applyPerks(perksFrom(this.save.memories));
  }

  /** Opens the memory book over the game and resolves when it is closed. */
  showBookOverlay(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.level) return resolve();
      this.state = 'paused';
      this.input.exitLock();
      this.input.setTouchVisible(false);
      this.ignoreUnlock = true;
      this.input.flush();
      this.ui.showBook(this.save.memories, this.save.life, () => {
        this.ignoreUnlock = false;
        this.input.flush();
        this.ui.clearScreens();
        this.state = 'playing';
        this.input.releaseAll();
        this.updateTouchVisibility();
        resolve();
      });
    });
  }

  collectShard(id: string) {
    if (!this.save.shards.includes(id)) this.save.shards.push(id);
    const lost = LOSABLE.filter((i) => !this.save.memories[i]);
    this.sfx.play('pickup');
    if (lost.length) {
      const i = lost[0];
      this.save.memories[i] = true;
      this.ui.toast(`A memory returns: ${MEMORIES[i].title}`, 'gold');
    } else {
      this.ui.toast('The shard hums. You already hold everything it could give back.', 'gold');
    }
    writeSave(this.save);
    if (this.level?.player) this.applyPerks(this.level.player);
  }

  async choose(options: string[]): Promise<number> {
    this.ignoreUnlock = true;
    this.input.exitLock();
    this.input.flush();
    return this.ui.choice(options);
  }

  keyLabel(a: string): string {
    const d = this.input.lastDevice;
    const KB: Record<string, string> = { move: 'WASD', look: 'the mouse (click the game to capture it)', light: 'Left Click / J', heavy: 'E / K', block: 'Right Click / L', dodge: 'Space', sprint: 'Shift', hum: 'H', wrath: 'Q', interact: 'F', lock: 'Tab', book: 'B' };
    const PAD: Record<string, string> = { move: 'the left stick', look: 'the right stick', light: 'X / Square', heavy: 'Y / Triangle', block: 'LB / L1', dodge: 'A / Cross', sprint: 'LT / L3', hum: 'RB / R1', wrath: 'RT / R2', interact: 'B / Circle', lock: 'R3', book: 'View / Share' };
    const TOUCH: Record<string, string> = { move: 'the left-side stick', look: 'a drag on the right side', light: 'Attack', heavy: 'Heavy', block: 'Block', dodge: 'Dodge', sprint: 'the stick pushed all the way', hum: 'Hum', wrath: 'Wrath', interact: 'Use', lock: 'Lock', book: 'Book' };
    const map = d === 'gamepad' ? PAD : d === 'touch' ? TOUCH : KB;
    return map[a] ?? a;
  }

  interactKey() {
    return this.input.lastDevice === 'gamepad' ? 'B' : this.input.lastDevice === 'touch' ? 'Use' : 'F';
  }

  hitstop(t: number) {
    this.hitstopT = Math.max(this.hitstopT, t);
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.ui.settings = s;
    saveSettings(s);
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.voice.enabled = s.voice;
    this.voice.volume = s.voiceVolume;
    this.camera.sensitivity = s.sensitivity;
    this.camera.invertY = s.invertY;
    if (this.engine.quality !== s.quality) this.engine.setQuality(s.quality);
    this.updateTouchVisibility();
  }

  private updateTouchVisibility() {
    const want = this.settings.touchControls === 'on' || (this.settings.touchControls === 'auto' && isTouchDevice());
    this.input.setTouchVisible(want && this.state === 'playing');
    document.body.classList.toggle('touch', want);
  }

  // ------------------------------------------------------------- loop

  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (dt <= 0) dt = 0.016;
    this.fps = this.fps * 0.95 + (1 / dt) * 0.05;
    this.frames++;
    this.input.update(dt);
    this.music.update();

    if (this.ui.menuOpen || this.ui.choosing) this.menuInput();

    if (this.state === 'playing' && this.level) {
      if (this.input.pressed('pause') && !this.ui.choosing) {
        this.pause();
      } else if (this.input.pressed('book') && !this.ui.choosing) {
        this.pause();
        const lvl = this.level;
        this.ui.showBook(this.save.memories, lvl.firstLife ? null : this.save.life, () => this.resume(), lvl.firstLife);
      }
    }

    if (this.state === 'playing' || this.state === 'dead') {
      const lvl = this.level;
      if (lvl) {
        let gdt = dt;
        if (this.hitstopT > 0) {
          this.hitstopT -= dt;
          gdt = dt * 0.08;
        }
        if (this.state === 'playing') this.save.stats.playTime += dt;
        const steps = this.debug ? Math.max(1, Math.round(this.timeScale)) : 1;
        for (let k = 0; k < steps && this.level === lvl; k++) {
          if (this.debug && this.autopilot && this.state === 'playing') lvl.autopilot();
          lvl.update(gdt);
        }
        const lock = lvl.player.lockTarget;
        this.camera.update(dt, lvl.player, lock, lvl.cine || !lvl.player.control ? null : this.input, lvl.world);
        this.sfx.listener.copy(this.engine.camera.position);
        this.sfx.listenerYaw = this.camera.yaw;
        if (this.state === 'playing') {
          this.updateHud(lvl);
          if (lvl.player.canWrath) this.input.setTouchButtonVisible('wrath', true);
          else this.input.setTouchButtonVisible('wrath', false);
        }
      }
    } else if (this.state === 'title' && this.title) {
      this.title.update(dt, this.engine.camera);
    } else if (this.state === 'paused' && this.level) {
      this.camera.update(0, this.level.player, null, null, this.level.world);
    }
    this.engine.render(now / 1000);
    this.input.endFrame();
  }

  private menuInput() {
    const i = this.input;
    if (i.pressed('up')) this.ui.nav(-1);
    if (i.pressed('down')) this.ui.nav(1);
    if (i.pressed('confirm')) this.ui.activate();
    if (i.pressed('back') && !this.ui.choosing && this.state !== 'playing') {
      if (!this.ui.back() && this.state === 'paused') this.resume();
    }
  }

  private updateHud(lvl: Level) {
    const p = lvl.player;
    this.ui.setHUDVisible(!lvl.cine);
    const boss = lvl.boss;
    const objPos = lvl.objective?.pos ?? null;
    const h: HUDState = {
      hp: p.hp,
      maxHp: p.maxHp,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      posture: p.posture,
      maxPosture: p.maxPosture,
      wrath: p.wrath,
      showWrath: p.canWrath,
      life: lvl.firstLife ? 1 : this.save.life,
      memories: lvl.firstLife ? 'First life' : `${this.memoriesLeft()} memories`,
      objective: lvl.cine ? null : (lvl.objective?.text ?? null),
      objectiveDist: objPos ? Math.hypot(objPos.x - p.pos.x, objPos.z - p.pos.z) : null,
      counter: lvl.counter,
      boss: boss && boss.alive ? { name: boss.name, hp: boss.hp, maxHp: boss.maxHp, posture: boss.posture, maxPosture: boss.maxPosture } : null,
      prompt: lvl.interactPrompt(),
      vignette: lvl.vignette(),
    };
    this.ui.updateHUD(h);
    const cam = this.engine.camera;
    const w = window.innerWidth;
    const hh = window.innerHeight;
    const project = (v: THREE.Vector3) => {
      this.proj.copy(v).project(cam);
      if (this.proj.z > 1 || this.proj.z < -1) return null;
      return { x: (this.proj.x * 0.5 + 0.5) * w, y: (-this.proj.y * 0.5 + 0.5) * hh };
    };
    const m: MarkerState = { bars: [], reticle: null, waypoint: null };
    if (!lvl.cine) {
      for (const a of lvl.actors) {
        if (!(a instanceof Fighter) || !a.alive || a.team !== 'enemy' || !a.showHealthBar || a === boss) continue;
        if (lvl.time - a.lastDamagedAt > 6 && a !== p.lockTarget && a.posture < a.maxPosture * 0.4) continue;
        if (a.distTo(p) > 26) continue;
        const pos = this.proj.copy(a.pos);
        pos.y += 2.15 * a.height;
        const s = project(pos);
        if (s) m.bars.push({ x: s.x, y: s.y, hp: a.hp / a.maxHp, posture: a.posture / a.maxPosture });
      }
      const exec = p.executionTarget();
      const t = exec ?? p.lockTarget;
      if (t && t.alive) {
        const pos = new THREE.Vector3(t.pos.x, t.pos.y + 1.25 * t.height, t.pos.z);
        const s = project(pos);
        if (s) m.reticle = { x: s.x, y: s.y, exec: !!exec };
      }
      if (objPos) {
        const s = project(new THREE.Vector3(objPos.x, objPos.y + 2.2, objPos.z));
        const d = Math.hypot(objPos.x - p.pos.x, objPos.z - p.pos.z);
        if (s && d > 3) m.waypoint = { x: Math.max(20, Math.min(w - 20, s.x)), y: Math.max(60, Math.min(hh - 40, s.y)), dist: d };
      }
    }
    this.ui.updateMarkers(m);
  }
}
