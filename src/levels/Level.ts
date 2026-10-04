import * as THREE from 'three';
import { World } from '../core/World';
import { Builder } from '../world/Builder';
import { Particles, Weather } from '../world/Particles';
import { additive } from '../world/materials';
import { Actor } from '../entities/Actor';
import { Player } from '../entities/Player';
import { Fighter, type FighterType } from '../entities/Fighter';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { AttackDef, CombatCtx, HitResult, TokenPool } from '../combat/types';
import type { LightingPreset } from '../core/Engine';
import type { AmbientName } from '../audio/Sfx';
import type { Mood } from '../audio/Music';
import { SPEAKERS } from '../story/cast';
import { CancelError, clamp } from '../core/util';
import type { Game } from '../Game';

interface Wait {
  until?: number;
  cond?: () => boolean;
  resolve: () => void;
  reject: (e: unknown) => void;
}

interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: string;
  resolve: () => void;
}

class Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  owner: Actor;
  atk: AttackDef;
  life = 4;
  dead = false;
  kind: string;
  constructor(mesh: THREE.Mesh, vel: THREE.Vector3, owner: Actor, atk: AttackDef, kind: string) {
    this.mesh = mesh;
    this.vel = vel;
    this.owner = owner;
    this.atk = atk;
    this.kind = kind;
  }
}

export interface Spawn {
  x: number;
  z: number;
  facing: number;
}

const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();

export abstract class Level implements CombatCtx {
  abstract readonly index: number;
  abstract readonly title: string;
  abstract readonly lighting: LightingPreset;
  readonly ambient: Partial<Record<AmbientName, number>> = {};
  readonly game: Game;
  readonly group = new THREE.Group();
  readonly world = new World();
  readonly builder: Builder;
  readonly particles = new Particles(1600);
  actors: Actor[] = [];
  player!: Player;
  weather: Weather[] = [];
  private projectiles: Projectile[] = [];
  private interactables: Interactable[] = [];
  private waits: Wait[] = [];
  time = 0;
  objective: { text: string; pos: THREE.Vector3 | null } | null = null;
  counter: { n: string; label: string } | null = null;
  boss: Fighter | null = null;
  checkpoint = 'start';
  private runId = 0;
  cine = false;
  firstLife = false;
  private lineActive = false;
  private lineT = 0;
  private skipLine = false;
  private beam: THREE.Mesh;
  private attackers = new Set<Actor>();
  private hurtPulse = 0;
  readonly tokens: TokenPool;
  /** Stops the player dying (used during scripted beats). */
  playerProtected = false;
  private built = false;
  completed = false;

  constructor(game: Game) {
    this.game = game;
    this.builder = new Builder(this.group, this.world, 1234 + Math.floor(Math.random() * 0), game.settings.quality);
    this.group.add(this.particles.points);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 40, 8, 1, true), additive('#b98cff', 0.18));
    this.beam.visible = false;
    this.group.add(this.beam);
    this.tokens = {
      take: (a) => {
        const max = this.difficulty === 'story' ? 1 : this.difficulty === 'soldier' ? 2 : 3;
        for (const x of this.attackers) if (!x.alive || x.state !== 'attack') this.attackers.delete(x);
        if (this.attackers.has(a)) return true;
        if (this.attackers.size >= max) return false;
        this.attackers.add(a);
        return true;
      },
      give: (a) => {
        this.attackers.delete(a);
      },
    };
  }

  // ------------------------------------------------------------- abstract

  protected abstract build(): void;
  protected abstract script(checkpoint: string): Promise<void>;
  abstract spawnPoint(checkpoint: string): Spawn;
  abstract playerLook(checkpoint: string): Look;
  abstract playerWeapon(checkpoint: string): WeaponKind;
  /** Per-frame chapter logic. */
  protected tick(_dt: number) {}
  /** Called after the player is created/respawned at a checkpoint. */
  protected setupPlayer(_cp: string) {}

  // ------------------------------------------------------------- CombatCtx

  get sfx() {
    return this.game.sfx;
  }
  get difficulty() {
    return this.game.settings.difficulty;
  }
  shake(a: number) {
    this.game.camera.shake(a);
  }
  hitstop(t: number) {
    this.game.hitstop(t);
  }
  onKill(victim: Actor, killer: Actor | null) {
    if (victim === this.player) {
      if (this.playerProtected) return;
      this.game.onPlayerDeath();
      return;
    }
    if (victim.team === 'enemy' || victim instanceof Fighter) {
      this.game.save.stats.kills++;
      if (killer === this.player) this.player.addWrath(10);
    }
  }
  onParry(defender: Actor) {
    if (defender === this.player) {
      this.game.save.stats.parries++;
      this.player.addWrath(16);
      if (this.game.save.stats.parries === 1) this.game.ui.toast('Parried. Their posture cracks.', 'gold');
    }
  }
  onCalm() {
    this.game.save.stats.mercy++;
    this.game.ui.toast('They lay down their arms.', 'gold');
  }
  onHit(target: Actor, attacker: Actor, result: HitResult) {
    if (attacker === this.player && (result === 'hit' || result === 'killed' || result === 'broken')) this.player.addWrath(result === 'hit' ? 6 : 3);
    if (target === this.player && result === 'hit') this.hurtPulse = 0.55;
    if (target === this.player && this.playerProtected && this.player.hp < 1) this.player.hp = 1;
  }
  spawnProjectile(kind: 'arrow' | 'stillArrow' | 'javelin', from: THREE.Vector3, dir: THREE.Vector3, owner: Actor, atk: AttackDef) {
    const len = kind === 'javelin' ? 1.6 : 0.8;
    const geo = new THREE.CylinderGeometry(0.015, 0.015, len, 4);
    geo.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(geo, kind === 'arrow' ? new THREE.MeshStandardMaterial({ color: '#d8c8a8' }) : additive('#ffffff', 0.95));
    m.position.copy(from);
    m.lookAt(from.clone().add(dir));
    this.group.add(m);
    const speed = kind === 'javelin' ? 22 : 28;
    this.projectiles.push(new Projectile(m, dir.clone().multiplyScalar(speed), owner, atk, kind));
  }

  // ------------------------------------------------------------- lifecycle

  start(cp: string) {
    if (!this.built) {
      this.build();
      this.built = true;
      this.game.engine.scene.add(this.group);
    }
    this.game.engine.applyLighting(this.lighting);
    this.game.sfx.stopAllAmbient();
    for (const [k, v] of Object.entries(this.ambient)) this.game.sfx.setAmbient(k as AmbientName, v ?? 0);
    this.restart(cp);
  }

  restart(cp: string) {
    this.runId++;
    const pending = this.waits;
    this.waits = [];
    for (const w of pending) w.reject(new CancelError());
    this.interactables = [];
    for (const a of this.actors) if (a !== this.player) a.dispose();
    this.actors = this.player ? [this.player] : [];
    for (const p of this.projectiles) this.disposeProjectile(p);
    this.projectiles = [];
    this.particles.clear();
    this.attackers.clear();
    this.boss = null;
    this.counter = null;
    this.objective = null;
    this.cine = false;
    this.playerProtected = false;
    this.game.ui.setLetterbox(false);
    this.game.ui.clearSubtitle();
    this.game.voice.cancel();
    this.game.sfx.stopHum();
    this.checkpoint = cp;
    this.spawnPlayer(cp);
    const id = this.runId;
    void this.runScript(cp, id);
  }

  private async runScript(cp: string, id: number) {
    try {
      await this.script(cp);
    } catch (e) {
      if (!(e instanceof CancelError)) {
        console.error(e);
        throw e;
      }
      return;
    }
    if (id === this.runId) this.completed = true;
  }

  private spawnPlayer(cp: string) {
    const sp = this.spawnPoint(cp);
    const g = this.game;
    if (!this.player) {
      this.player = new Player(this, this.playerLook(cp), this.playerWeapon(cp), {
        input: g.input,
        cameraYaw: () => g.camera.yaw,
        onInteract: () => this.tryInteract(),
        onHumChange: (on) => (on ? g.sfx.startHum() : g.sfx.stopHum()),
        onWrath: () => this.onWrath(),
        onDodge: () => {},
      });
      this.group.add(this.player.rig.root);
      if (this.player.rig.trail) this.group.add(this.player.rig.trail.mesh);
      this.actors.push(this.player);
    } else {
      this.player.revive(1);
      this.player.respawnInvuln = 0;
      if (this.player.rig.weaponKind !== this.playerWeapon(cp)) this.player.rig.setWeapon(this.playerWeapon(cp));
    }
    const p = this.player;
    p.place(sp.x, sp.z, sp.facing);
    p.rig.root.visible = true;
    p.humming = false;
    p.blocking = false;
    p.pose = null;
    p.minHp = 0;
    p.control = true;
    p.lockTarget = null;
    p.hp = p.maxHp;
    p.stamina = p.maxStamina;
    p.wrath = 0;
    const diffMul = this.difficulty === 'story' ? 0.5 : this.difficulty === 'soldier' ? 1 : 1.45;
    p.damageTakenMul = diffMul;
    p.baseParry = this.difficulty === 'story' ? 0.3 : this.difficulty === 'soldier' ? 0.2 : 0.15;
    this.game.applyPerks(p);
    this.setupPlayer(cp);
    g.camera.snapBehind(p);
  }

  dispose() {
    this.runId++;
    for (const w of this.waits) w.reject(new CancelError());
    this.waits = [];
    for (const a of this.actors) a.dispose();
    this.actors = [];
    for (const p of this.projectiles) this.disposeProjectile(p);
    this.builder.dispose();
    this.game.engine.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const w of this.weather) this.group.remove(w.object);
    this.game.sfx.stopAllAmbient();
  }

  private disposeProjectile(p: Projectile) {
    this.group.remove(p.mesh);
    p.mesh.geometry.dispose();
  }

  // ------------------------------------------------------------- update

  update(dt: number) {
    this.time += dt;
    if (this.player.alive) this.player.minHp = this.playerProtected ? 1 : 0;
    const inp = this.game.input;
    if (this.lineActive) {
      this.lineT += dt;
      if (this.cine && this.lineT > 0.3 && inp.pressed('confirm')) this.skipLine = true;
    }
    for (const a of this.actors) a.update(dt);
    this.separate();
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (a.removeMe && a !== this.player) {
        a.dispose();
        this.actors.splice(i, 1);
      }
    }
    this.updateProjectiles(dt);
    this.particles.update(dt);
    const cam = this.game.engine.camera.position;
    for (const w of this.weather) w.update(dt, cam, this.time);
    for (const u of this.builder.updaters) u(dt, this.time);
    this.tick(dt);
    if (this.player.alive && this.player.pos.y < this.world.killY) this.player.die(null);
    const t = this.time;
    if (this.waits.length) {
      const ready = this.waits.filter((w) => (w.until !== undefined && t >= w.until) || (w.cond && w.cond()));
      if (ready.length) {
        this.waits = this.waits.filter((w) => !ready.includes(w));
        for (const w of ready) w.resolve();
      }
    }
    if (this.objective?.pos) {
      this.beam.visible = !this.cine;
      this.beam.position.set(this.objective.pos.x, this.objective.pos.y + 20, this.objective.pos.z);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + Math.sin(t * 3) * 0.05;
    } else this.beam.visible = false;
    this.game.engine.followShadow(this.player.pos);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt * 1.4);
  }

  private separate() {
    const as = this.actors;
    for (let i = 0; i < as.length; i++) {
      const a = as[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < as.length; j++) {
        const b = as[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        const aw = a.state === 'dodge' ? 0.2 : 1;
        const bw = b.state === 'dodge' ? 0.2 : 1;
        a.pos.x -= nx * push * aw;
        a.pos.z -= nz * push * aw;
        b.pos.x += nx * push * bw;
        b.pos.z += nz * push * bw;
      }
    }
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.life -= dt;
      p.vel.y -= (p.kind === 'javelin' ? 4 : 2.5) * dt;
      tv.copy(p.mesh.position);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.lookAt(tv2.copy(p.mesh.position).add(p.vel));
      if (p.kind !== 'arrow' && Math.random() < 0.5) this.particles.emit(p.mesh.position, tv2.set(0, 0.3, 0), new THREE.Color('#ffffff'), 0.3, 0.08);
      for (const a of this.actors) {
        if (!p.owner.hostileTo(a)) continue;
        const dx = a.pos.x - p.mesh.position.x;
        const dz = a.pos.z - p.mesh.position.z;
        const dy = p.mesh.position.y - a.pos.y;
        if (dx * dx + dz * dz < (a.radius + 0.25) ** 2 && dy > 0 && dy < 1.9 * a.height) {
          const r = a.receiveHit(p.owner, p.atk, true);
          if (r !== 'dodged') {
            p.dead = true;
            break;
          }
        }
      }
      const g = this.world.terrain(p.mesh.position.x, p.mesh.position.z);
      if (p.mesh.position.y < g || this.world.pointBlocked(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, 0)) {
        p.dead = true;
        this.particles.burst(p.mesh.position, 5, p.kind === 'arrow' ? '#c8b89a' : '#ffffff', 2, 0.3, 0.06);
      }
      if (p.life <= 0) p.dead = true;
    }
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      if (p.dead) this.disposeProjectile(p);
      else keep.push(p);
    }
    this.projectiles = keep;
  }

  private onWrath() {
    const p = tv.copy(this.player.pos);
    p.y += 1;
    this.particles.ring(p, 48, '#b98cff', 9, 0.7, 0.25);
    this.particles.burst(p, 40, '#d8b8ff', 6, 0.8, 0.14, 0);
    this.game.engine.flash = 0.5;
    this.shake(0.4);
  }

  // ------------------------------------------------------------- HUD feed

  interactPrompt(): { key: string; text: string } | null {
    if (!this.player.alive || !this.player.control || this.cine) return null;
    const exec = this.player.executionTarget();
    const key = this.game.interactKey();
    if (exec) return { key: this.game.input.lastDevice === 'touch' ? 'Use' : key, text: 'Execute' };
    const it = this.nearestInteractable();
    return it ? { key, text: it.label } : null;
  }

  private nearestInteractable(): Interactable | null {
    let best: Interactable | null = null;
    let bd = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(it.pos.x - this.player.pos.x, it.pos.z - this.player.pos.z);
      if (d < it.radius && d < bd && Math.abs(it.pos.y - this.player.pos.y) < 2.5) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private tryInteract(): boolean {
    if (this.cine) return false;
    const it = this.nearestInteractable();
    if (!it) return false;
    this.interactables = this.interactables.filter((x) => x !== it);
    this.game.sfx.play('uiConfirm');
    it.resolve();
    return true;
  }

  vignette() {
    const lowHp = this.player.alive ? clamp(1 - this.player.hp / this.player.maxHp / 0.35, 0, 1) * 0.6 : 0;
    return Math.max(lowHp, this.hurtPulse);
  }

  // ------------------------------------------------------------- script helpers

  private check(id: number) {
    if (id !== this.runId) throw new CancelError();
  }

  private addWait(w: Omit<Wait, 'resolve' | 'reject'>): Promise<void> {
    const id = this.runId;
    return new Promise<void>((resolve, reject) => {
      this.waits.push({ ...w, resolve, reject });
    }).then(() => this.check(id));
  }

  wait(sec: number) {
    return this.addWait({ until: this.time + sec });
  }

  until(cond: () => boolean) {
    if (cond()) return this.addWait({ until: this.time });
    return this.addWait({ cond });
  }

  async say(who: string, text: string, extra = 0) {
    const id = this.runId;
    const sp = SPEAKERS[who] ?? SPEAKERS.narrator;
    const g = this.game;
    const skippable = this.cine;
    const hint = skippable ? (g.input.lastDevice === 'touch' ? 'Tap to continue' : g.input.lastDevice === 'gamepad' ? 'Ⓐ continue' : 'F / Click: continue') : '';
    g.ui.subtitle(who, text, this.cine, hint);
    g.audio.duck(0.4);
    this.lineActive = true;
    this.lineT = 0;
    this.skipLine = false;
    let voiceDone = false;
    const useVoice = g.settings.voice && g.voice.available;
    if (useVoice) void g.voice.speak(text, sp.voice).then(() => (voiceDone = true));
    const read = clamp(1.2 + text.length * 0.05, 1.8, 8);
    let clicked = false;
    if (skippable) void g.ui.waitClickAdvance().then(() => (clicked = true));
    try {
      await this.until(() => this.skipLine || clicked || (useVoice ? voiceDone && this.lineT > 0.8 : this.lineT > read) || this.lineT > 14);
      if (extra > 0) await this.wait(extra);
    } finally {
      if (id === this.runId) {
        this.lineActive = false;
        g.ui.cancelAdvance();
        if (this.skipLine || clicked) g.voice.cancel();
        g.ui.clearSubtitle();
        g.audio.duck(1);
      }
    }
  }

  async talk(lines: [string, string][]) {
    for (const [who, text] of lines) await this.say(who, text);
  }

  /** Non-blocking line during gameplay. */
  bark(who: string, text: string) {
    const id = this.runId;
    void this.say(who, text).catch(() => {
      if (id === this.runId) this.game.ui.clearSubtitle();
    });
  }

  async choose(options: string[]): Promise<number> {
    const id = this.runId;
    const r = await this.game.choose(options);
    this.check(id);
    return r;
  }

  cinematic(on: boolean) {
    this.cine = on;
    this.player.control = !on;
    if (on) {
      this.player.vel.set(0, 0, 0);
      this.player.blocking = false;
      if (this.player.state === 'attack' || this.player.state === 'dodge') {
        this.player.state = 'idle';
        this.player.attack = null;
        this.player.phase = null;
        this.player.roll = -1;
      }
    }
    this.game.ui.setLetterbox(on);
    if (!on) this.game.camera.release(this.player);
  }

  shot(px: number, py: number, pz: number, lx: number, ly: number, lz: number, speed = 2.2) {
    this.game.camera.shot(new THREE.Vector3(px, py, pz), new THREE.Vector3(lx, ly, lz), speed);
  }

  /** Over-the-shoulder shot framing two actors. */
  twoShot(a: Actor, b: Actor, side = 1, speed = 2.5) {
    const mx = (a.pos.x + b.pos.x) / 2;
    const mz = (a.pos.z + b.pos.z) / 2;
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const px = -dz / d;
    const pz = dx / d;
    const dist = Math.max(3.2, d * 1.3);
    const y = Math.max(a.pos.y, b.pos.y) + 1.6;
    this.shot(mx + px * dist * side - (dx / d) * 1.2, y, mz + pz * dist * side - (dz / d) * 1.2, mx, y - 0.1, mz, speed);
  }

  closeUp(a: Actor, dist = 2.2, angle = 0.4, speed = 2.5) {
    const f = a.facing + angle;
    const y = a.pos.y + 1.55 * a.height;
    this.shot(a.pos.x + Math.sin(f) * dist, y + 0.1, a.pos.z + Math.cos(f) * dist, a.pos.x, y, a.pos.z, speed);
  }

  goal(text: string | null, pos?: THREE.Vector3 | [number, number, number]) {
    if (!text) {
      this.objective = null;
      return;
    }
    const p = pos ? (Array.isArray(pos) ? new THREE.Vector3(...pos) : pos) : null;
    this.objective = { text, pos: p };
  }

  reach(x: number, z: number, r: number, text?: string, y?: number) {
    const pos = new THREE.Vector3(x, y ?? this.world.groundAt(x, z, 999), z);
    if (text) this.goal(text, pos);
    return this.until(() => Math.hypot(this.player.pos.x - x, this.player.pos.z - z) < r && (y === undefined || Math.abs(this.player.pos.y - y) < 3)).then(() => {
      if (text && this.objective?.text === text) this.objective = null;
    });
  }

  interact(x: number, z: number, label: string, radius = 2.2, y?: number): Promise<void> {
    const id = this.runId;
    const pos = new THREE.Vector3(x, y ?? this.world.groundAt(x, z, 999), z);
    return new Promise<void>((resolve, reject) => {
      const w: Wait = { cond: () => false, resolve: () => {}, reject };
      this.waits.push(w);
      this.interactables.push({
        pos,
        radius,
        label,
        resolve: () => {
          this.waits = this.waits.filter((x) => x !== w);
          resolve();
        },
      });
    }).then(() => this.check(id));
  }

  spawn(type: FighterType, x: number, z: number, opts: { team?: 'enemy' | 'ally'; facing?: number; guard?: number } = {}): Fighter {
    const f = new Fighter(this, type, opts.team ?? 'enemy');
    if (f.team === 'enemy') {
      f.damageTakenMul = this.difficulty === 'story' ? 1.35 : this.difficulty === 'soldier' ? 1 : 0.85;
      if (this.difficulty === 'story') f.damageDealtMul = 0.85;
    }
    f.place(x, z, opts.facing ?? Math.atan2(this.player.pos.x - x, this.player.pos.z - z));
    if (opts.guard) f.guardRadius = opts.guard;
    this.addActor(f);
    return f;
  }

  npc(look: Look, x: number, z: number, facing = 0, weapon: WeaponKind = 'none', name = 'npc'): Actor {
    const a = new Actor(this, look, { name, team: 'neutral', hp: 100, posture: 100, weapon });
    a.keepBody = true;
    a.invulnerable = true;
    a.bounded = false;
    a.place(x, z, facing);
    this.addActor(a);
    return a;
  }

  addActor(a: Actor) {
    this.group.add(a.rig.root);
    if (a.rig.trail) this.group.add(a.rig.trail.mesh);
    this.actors.push(a);
  }

  removeActor(a: Actor) {
    this.actors = this.actors.filter((x) => x !== a);
    a.dispose();
  }

  allDown(list: Actor[]) {
    return this.until(() => list.every((a) => !a.alive || a.state === 'calmed' || a.team !== 'enemy'));
  }

  enemiesLeft() {
    return this.actors.filter((a) => a.team === 'enemy' && a.alive).length;
  }

  async wave(spawns: [() => FighterType, number, number][], opts: { stagger?: number } = {}) {
    const list: Fighter[] = [];
    for (const [fn, x, z] of spawns) {
      list.push(this.spawn(fn(), x, z));
      if (opts.stagger) await this.wait(opts.stagger);
    }
    await this.allDown(list);
    return list;
  }

  setCheckpoint(id: string) {
    if (this.checkpoint === id) return;
    this.checkpoint = id;
    this.game.onCheckpoint(this.index, id);
  }

  music(m: Mood) {
    this.game.music.setMood(m);
  }

  async card(kicker: string, title: string, sub = '', hold = 3.2) {
    const id = this.runId;
    await this.game.ui.card(kicker, title, sub, hold);
    this.check(id);
  }

  async journal(text: string, label = 'Journal', hold?: number) {
    const id = this.runId;
    const h = hold ?? clamp(text.length * 0.055, 4, 11);
    const voice = this.game.settings.voice && this.game.voice.available;
    if (voice) void this.game.voice.speak(text, SPEAKERS.ira.voice);
    this.game.audio.duck(0.5);
    await this.game.ui.journal(label, text, h);
    this.game.audio.duck(1);
    this.check(id);
  }

  async fade(to: number, dur = 0.8, white = false) {
    const id = this.runId;
    await this.game.ui.fade(to, dur, white);
    this.check(id);
  }

  /** Toast a tutorial hint. {light}, {block} etc. become the right button for the current device. */
  hint(text: string) {
    this.game.ui.toast(text.replace(/\{(\w+)\}/g, (_m, k: string) => this.game.keyLabel(k)), 'gold');
  }

  async openBook() {
    const id = this.runId;
    if (this.game.debug && this.game.autopilot) return;
    await this.game.showBookOverlay();
    this.check(id);
  }

  bossBar(f: Fighter | null) {
    this.boss = f;
  }

  addWeather(kind: 'rain' | 'snow' | 'ash' | 'motes', count: number, color: string) {
    const n = Math.floor(count * (this.game.settings.quality === 'high' ? 1 : this.game.settings.quality === 'medium' ? 0.6 : 0.35));
    const w = new Weather(kind, n, color);
    this.weather.push(w);
    this.group.add(w.object);
    return w;
  }

  /** Memory shard: a pickup that restores one lost memory. */
  async shard(x: number, z: number, id: string) {
    if (this.game.save.shards.includes(id) || this.firstLife) return;
    const y = this.world.groundAt(x, z, 999) + 1.1;
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), additive('#c9a6ff', 0.9));
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), additive('#ffffff', 1));
    g.add(crystal, core);
    g.position.set(x, y, z);
    this.group.add(g);
    const spin = (dt: number, t: number) => {
      g.rotation.y += dt * 1.5;
      g.position.y = y + Math.sin(t * 2) * 0.12;
    };
    this.builder.updaters.push(spin);
    try {
      await this.interact(x, z, 'Take the memory shard', 2);
      this.game.collectShard(id);
      this.particles.burst(g.position, 30, '#c9a6ff', 3, 1, 0.14, 0);
    } catch (e) {
      if (!(e instanceof CancelError)) throw e;
    } finally {
      this.group.remove(g);
      const i = this.builder.updaters.indexOf(spin);
      if (i >= 0) this.builder.updaters.splice(i, 1);
    }
  }

  /** Test autopilot: skips dialogue, completes objectives and clears fights so every script path can be exercised. */
  autopilot() {
    if (this.lineActive && this.lineT > 0.2) this.skipLine = true;
    if (this.game.ui.choosing) this.game.ui.resolveChoice(0);
    const p = this.player;
    if (!p.alive) return;
    p.humTime += 0.5;
    for (const a of this.actors) {
      if (a.team === 'enemy' && a.alive && a !== p && this.time - a.lastDamagedAt > 0.3) {
        a.lastDamagedAt = this.time;
        a.minHp = 0;
        a.hp = 0;
        a.die(p);
      }
    }
    if (this.cine) return;
    const it = this.interactables[0];
    if (it) {
      p.place(it.pos.x + 0.5, it.pos.z + 0.5);
      p.pos.y = Math.max(p.pos.y, it.pos.y);
      this.tryInteract();
      return;
    }
    if (this.objective?.pos) {
      const o = this.objective.pos;
      if (Math.hypot(o.x - p.pos.x, o.z - p.pos.z) > 1.5) {
        p.place(o.x, o.z);
        if (o.y > p.pos.y + 1) p.pos.y = o.y;
      }
    }
  }

  /** Debug only: stop the story script so a test can move the player freely. */
  debugFreeze() {
    this.runId++;
    const pending = this.waits;
    this.waits = [];
    for (const w of pending) w.reject(new CancelError());
    for (const a of [...this.actors]) if (a !== this.player) this.removeActor(a);
    this.cine = false;
    this.player.control = true;
    this.playerProtected = true;
    this.game.ui.setLetterbox(false);
    this.game.camera.release(this.player);
  }

  get liveRunId() {
    return this.runId;
  }
}
