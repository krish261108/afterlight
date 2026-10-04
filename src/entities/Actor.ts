import * as THREE from 'three';
import { Rig, type Look, type RigState } from './Rig';
import type { WeaponKind } from './weapons';
import type { AttackDef, CombatCtx, HitResult } from '../combat/types';
import { angleDiff, dampAngle } from '../core/util';

export type Team = 'player' | 'enemy' | 'ally' | 'neutral';
export type ActorState = 'idle' | 'attack' | 'dodge' | 'hit' | 'stagger' | 'dead' | 'calmed' | 'recoil';

export interface ActorOpts {
  name: string;
  team: Team;
  hp: number;
  posture: number;
  weapon?: WeaponKind;
  offWeapon?: WeaponKind;
}

interface ScriptMove {
  x: number;
  z: number;
  speed: number;
  resolve: () => void;
}

const tmpV = new THREE.Vector3();
const tmpB = new THREE.Vector3();

export class Actor {
  readonly rig: Rig;
  readonly pos: THREE.Vector3;
  readonly vel = new THREE.Vector3();
  readonly ctx: CombatCtx;
  name: string;
  team: Team;
  yVel = 0;
  grounded = true;
  facing = 0;
  radius: number;
  hp: number;
  maxHp: number;
  posture = 0;
  maxPosture: number;
  postureDelay = 0;
  postureRegen = 14;
  alive = true;
  state: ActorState = 'idle';
  stateT = 0;
  attack: AttackDef | null = null;
  phase: 'windup' | 'active' | 'recover' | null = null;
  phaseT = 0;
  protected hitSet = new Set<Actor>();
  invuln = 0;
  superArmor = false;
  blocking = false;
  blockStart = -10;
  parryWindow = 0.2;
  hitT = 0;
  staggerDur = 1.6;
  pose: string | null = null;
  animSpeed = 0;
  deadT = 0;
  removeMe = false;
  damageTakenMul = 1;
  damageDealtMul = 1;
  invulnerable = false;
  humming = false;
  scriptMove: ScriptMove | null = null;
  attackTarget: Actor | null = null;
  roll = -1;
  showHealthBar = false;
  lastDamagedAt = -10;
  lastHitBy: Actor | null = null;
  deathPose: 'dead' | 'deadFront' = 'dead';
  /** When true the actor keeps its body after death (story characters). */
  keepBody = false;
  private projectileFired = false;
  private soundPlayed = false;
  onDeath: (() => void) | null = null;

  constructor(ctx: CombatCtx, look: Look, o: ActorOpts) {
    this.ctx = ctx;
    this.rig = new Rig(look);
    this.rig.setWeapon(o.weapon ?? 'none', o.offWeapon ?? 'none');
    this.pos = this.rig.root.position;
    this.name = o.name;
    this.team = o.team;
    this.hp = this.maxHp = o.hp;
    this.maxPosture = o.posture;
    this.radius = 0.38 * look.height * Math.sqrt(look.build);
    this.rig.footstep = () => {
      if (this.ctx.sfx.listener.distanceToSquared(this.pos) < 400) this.ctx.sfx.play('step', { pos: this.pos, vol: 0.6 * look.height });
    };
  }

  get height() {
    return this.rig.look.height;
  }

  get busy() {
    return this.state === 'attack' || this.state === 'dodge' || this.state === 'hit' || this.state === 'stagger' || this.state === 'recoil' || this.state === 'dead';
  }

  hostileTo(o: Actor) {
    if (!o.alive || o === this) return false;
    if (this.team === 'neutral' || o.team === 'neutral') return false;
    if (this.team === 'enemy') return o.team === 'player' || o.team === 'ally';
    return o.team === 'enemy';
  }

  place(x: number, z: number, facing = this.facing) {
    this.pos.set(x, this.ctx.world.groundAt(x, z, 999), z);
    this.facing = facing;
    this.rig.root.rotation.y = facing;
    this.vel.set(0, 0, 0);
    this.yVel = 0;
  }

  faceToward(x: number, z: number, dt?: number, rate = 10) {
    const ang = Math.atan2(x - this.pos.x, z - this.pos.z);
    this.facing = dt === undefined ? ang : dampAngle(this.facing, ang, rate, dt);
  }

  distTo(o: Actor | THREE.Vector3) {
    const p = o instanceof Actor ? o.pos : o;
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  angleTo(o: Actor | THREE.Vector3) {
    const p = o instanceof Actor ? o.pos : o;
    return Math.abs(angleDiff(this.facing, Math.atan2(p.x - this.pos.x, p.z - this.pos.z)));
  }

  goTo(x: number, z: number, speed = 2.2): Promise<void> {
    this.scriptMove?.resolve();
    return new Promise((resolve) => {
      this.scriptMove = { x, z, speed, resolve };
    });
  }

  stopScript() {
    if (this.scriptMove) {
      const r = this.scriptMove.resolve;
      this.scriptMove = null;
      r();
    }
  }

  // ----------------------------------------------------------------- combat

  startAttack(def: AttackDef) {
    if (!this.alive) return false;
    this.state = 'attack';
    this.stateT = 0;
    this.attack = def;
    this.phase = 'windup';
    this.phaseT = 0;
    this.hitSet.clear();
    this.projectileFired = false;
    this.soundPlayed = false;
    this.blocking = false;
    return true;
  }

  protected endAttack() {
    this.attack = null;
    this.phase = null;
    this.state = 'idle';
    if (this.rig.trail) this.rig.trail.active = false;
  }

  protected updateAttack(dt: number) {
    const atk = this.attack!;
    const dur = this.phase === 'windup' ? atk.windup : this.phase === 'active' ? atk.active : atk.recover;
    this.phaseT += dt / Math.max(0.01, dur);
    const tgt = this.attackTarget;
    if (this.phase === 'windup') {
      if (tgt && tgt.alive && atk.tracking) this.faceToward(tgt.pos.x, tgt.pos.z, dt, atk.tracking);
      if (atk.lunge && this.phaseT > 0.6) {
        const close = tgt && this.distTo(tgt) < this.radius + tgt.radius + 0.5;
        if (!close) this.moveForward((atk.lunge * 0.4 * dt) / (atk.windup * 0.4));
      }
    } else if (this.phase === 'active') {
      if (!this.soundPlayed) {
        this.soundPlayed = true;
        if (atk.sound) this.ctx.sfx.play(atk.sound, { pos: this.pos, pitch: 0.9 + Math.random() * 0.2 });
        if (this.rig.trail) this.rig.trail.active = !atk.projectile;
      }
      if (atk.lunge) {
        const close = tgt && this.distTo(tgt) < this.radius + tgt.radius + 0.4;
        if (!close) this.moveForward((atk.lunge * 0.6 * dt) / atk.active);
      }
      if (atk.projectile) {
        if (!this.projectileFired) {
          this.projectileFired = true;
          this.fireProjectile(atk);
        }
      } else this.performHits(atk);
    }
    if (this.phaseT >= 1) {
      this.phaseT = 0;
      if (this.phase === 'windup') this.phase = 'active';
      else if (this.phase === 'active') {
        this.phase = 'recover';
        if (this.rig.trail) this.rig.trail.active = false;
      } else this.endAttack();
    }
  }

  protected fireProjectile(atk: AttackDef) {
    const from = tmpV.copy(this.pos);
    from.y += 1.45 * this.height;
    const dir = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    const t = this.attackTarget;
    if (t && t.alive) {
      const aim = tmpB.copy(t.pos);
      aim.y += 1.1 * t.height;
      const flight = from.distanceTo(aim) / 26;
      aim.addScaledVector(t.vel, flight * 0.6);
      dir.copy(aim).sub(from).normalize();
    }
    this.ctx.spawnProjectile(atk.projectile!, from.clone(), dir, this, atk);
  }

  protected moveForward(d: number) {
    this.pos.x += Math.sin(this.facing) * d;
    this.pos.z += Math.cos(this.facing) * d;
  }

  protected performHits(atk: AttackDef) {
    const range = atk.range * this.height;
    for (const o of this.ctx.actors) {
      if (!this.hostileTo(o) || this.hitSet.has(o)) continue;
      const d = this.distTo(o) - o.radius;
      if (d > range) continue;
      if (Math.abs(o.pos.y - this.pos.y) > 1.8) continue;
      if (!atk.aoe && this.angleTo(o) > atk.arc / 2 + Math.atan2(o.radius, Math.max(0.3, d))) continue;
      this.hitSet.add(o);
      o.receiveHit(this, atk);
      if (!atk.hitsMany && !atk.aoe) {
        // Most swings can still clip a second target, but only once per swing per target.
      }
    }
  }

  receiveHit(att: Actor, atk: AttackDef, fromProjectile = false): HitResult {
    if (!this.alive) return 'none';
    const ctx = this.ctx;
    if (this.invuln > 0) {
      ctx.onHit(this, att, 'dodged', 0);
      return 'dodged';
    }
    const toAtt = Math.atan2(att.pos.x - this.pos.x, att.pos.z - this.pos.z);
    const facingAtt = Math.abs(angleDiff(this.facing, toAtt)) < 1.8;
    const hitPos = tmpV.copy(this.pos);
    hitPos.y += 1.2 * this.height;
    if (this.blocking && facingAtt && !atk.unblockable) {
      const parried = ctx.time - this.blockStart < this.parryWindow;
      if (parried) {
        ctx.sfx.play('parry', { pos: this.pos });
        ctx.particles.burst(hitPos, 26, '#fff1c2', 7, 0.45, 0.13);
        ctx.hitstop(0.09);
        ctx.shake(0.25);
        this.rig.flash('#ffffff', 0.15);
        if (!fromProjectile) {
          att.posture += atk.posture * 2.2 + 22;
          att.postureDelay = 1.6;
          if (att.posture >= att.maxPosture) att.breakPosture();
          else att.recoil();
        }
        ctx.onParry(this, att);
        ctx.onHit(this, att, 'parried', 0);
        return 'parried';
      }
      ctx.sfx.play('block', { pos: this.pos, pitch: 0.9 + Math.random() * 0.2 });
      ctx.particles.burst(hitPos, 10, '#ffd9a0', 4, 0.3, 0.09);
      this.posture += atk.posture * 0.85;
      this.postureDelay = 1.2;
      const chip = atk.damage * 0.12 * att.damageDealtMul;
      this.hp -= chip * this.damageTakenMul * (this.invulnerable ? 0 : 1);
      this.pushBack(att, 0.25);
      ctx.shake(0.06);
      if (this.posture >= this.maxPosture) {
        this.breakPosture();
        ctx.onHit(this, att, 'broken', chip);
        return 'broken';
      }
      ctx.onHit(this, att, 'blocked', chip);
      return 'blocked';
    }
    const dmg = atk.damage * att.damageDealtMul * this.damageTakenMul * (this.state === 'stagger' ? 1.35 : 1);
    if (!this.invulnerable) this.hp -= dmg;
    this.lastDamagedAt = ctx.time;
    this.lastHitBy = att;
    this.posture += atk.posture * (this.state === 'stagger' ? 0 : 1);
    this.postureDelay = 1.5;
    this.rig.flash(atk.unblockable && atk.sound === 'stillfire' ? '#ffffff' : '#ffb39a', 0.14);
    ctx.sfx.play(atk.heavy ? 'hitHeavy' : 'hit', { pos: this.pos, pitch: 0.9 + Math.random() * 0.25 });
    ctx.particles.burst(hitPos, atk.heavy ? 18 : 10, atk.sound === 'stillfire' ? '#ffffff' : '#ffcf8a', 5, 0.35, 0.1);
    ctx.hitstop(atk.heavy ? 0.085 : 0.05);
    ctx.shake(atk.heavy ? 0.22 : 0.1);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(att);
      ctx.onHit(this, att, 'killed', dmg);
      return 'killed';
    }
    if (atk.knockback) this.pushBack(att, atk.knockback * 0.25);
    if (this.posture >= this.maxPosture) {
      this.breakPosture();
    } else if (!this.superArmor || atk.heavy) {
      if (this.state !== 'stagger' && this.state !== 'dodge') this.flinch(atk.heavy ? 0.5 : 0.32);
    }
    ctx.onHit(this, att, 'hit', dmg);
    return 'hit';
  }

  pushBack(from: Actor, amount: number) {
    const dx = this.pos.x - from.pos.x;
    const dz = this.pos.z - from.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * amount;
    this.pos.z += (dz / d) * amount;
  }

  flinch(t: number) {
    if (this.attack) this.endAttack();
    this.state = 'hit';
    this.stateT = 0;
    this.hitT = t;
    this.blocking = false;
  }

  recoil() {
    if (this.attack) this.endAttack();
    this.state = 'recoil';
    this.stateT = 0;
    this.hitT = 0.55;
  }

  breakPosture() {
    if (this.attack) this.endAttack();
    this.state = 'stagger';
    this.stateT = 0;
    this.posture = this.maxPosture;
    this.blocking = false;
    this.ctx.sfx.play('break', { pos: this.pos, vol: 0.6 });
    const p = tmpV.copy(this.pos);
    p.y += 1.6 * this.height;
    this.ctx.particles.ring(p, 18, '#ffe6a8', 2.2, 0.5, 0.15);
  }

  die(killer: Actor | null) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    this.blocking = false;
    this.humming = false;
    if (this.attack) this.endAttack();
    this.scriptMove?.resolve();
    this.scriptMove = null;
    this.ctx.sfx.play('bodyfall', { pos: this.pos });
    this.ctx.onKill(this, killer);
    this.onDeath?.();
  }

  // ----------------------------------------------------------------- update

  /** Subclasses decide what to do this frame. */
  protected think(_dt: number) {}

  update(dt: number) {
    this.stateT += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.postureDelay > 0) this.postureDelay -= dt;
    else if (this.state !== 'stagger') this.posture = Math.max(0, this.posture - this.postureRegen * dt * (this.blocking ? 1.6 : 1));

    if (!this.alive) {
      this.deadT += dt;
      this.vel.set(0, 0, 0);
      if (!this.keepBody && this.deadT > 3.5) {
        const k = 1 - (this.deadT - 3.5) / 1.2;
        this.rig.setOpacity(Math.max(0, k));
        if (k <= 0) this.removeMe = true;
      }
    } else {
      switch (this.state) {
        case 'attack':
          this.updateAttack(dt);
          break;
        case 'hit':
        case 'recoil':
          this.vel.multiplyScalar(0.8);
          if (this.stateT >= this.hitT) this.state = 'idle';
          break;
        case 'stagger':
          this.vel.set(0, 0, 0);
          if (this.stateT >= this.staggerDur) {
            this.state = 'idle';
            this.posture = this.maxPosture * 0.35;
          }
          break;
      }
      if (this.scriptMove && !this.busy) this.updateScriptMove(dt);
      else this.think(dt);
    }
    this.updatePhysics(dt);
    this.updateRig(dt);
  }

  private updateScriptMove(dt: number) {
    const m = this.scriptMove!;
    const dx = m.x - this.pos.x;
    const dz = m.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      this.vel.set(0, 0, 0);
      this.scriptMove = null;
      m.resolve();
      return;
    }
    const sp = Math.min(m.speed, d * 3 + 0.4);
    this.vel.set((dx / d) * sp, 0, (dz / d) * sp);
    this.faceToward(m.x, m.z, dt, 8);
  }

  protected updatePhysics(dt: number) {
    const w = this.ctx.world;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    w.resolve(this.pos, this.radius);
    const g = w.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded && this.pos.y - g < 0.6 && this.pos.y >= g - 0.6) {
      this.pos.y = g;
      this.yVel = 0;
    } else {
      this.yVel -= 28 * dt;
      this.pos.y += this.yVel * dt;
      if (this.pos.y <= g) {
        this.pos.y = g;
        if (this.yVel < -12) this.ctx.sfx.play('bodyfall', { pos: this.pos, vol: 0.6 });
        this.yVel = 0;
        this.grounded = true;
      } else this.grounded = false;
    }
    if (this.grounded && this.pos.y - g > 0.05) this.grounded = false;
    this.animSpeed = Math.hypot(this.vel.x, this.vel.z) / this.height;
  }

  protected rigState(): RigState {
    return {
      speed: this.state === 'attack' || !this.alive ? 0 : this.animSpeed,
      action: this.attack ? this.attack.name : null,
      phase: this.phase,
      phaseT: Math.min(1, this.phaseT),
      block: this.blocking,
      hum: this.humming,
      stagger: this.state === 'stagger',
      dead: !this.alive,
      pose: !this.alive ? this.deathPose : this.state === 'calmed' ? 'cower' : this.pose,
      roll: this.roll,
      hit: this.state === 'hit' || this.state === 'recoil' ? Math.max(0, this.hitT - this.stateT) : 0,
      airborne: !this.grounded && this.yVel < -2,
    };
  }

  protected updateRig(dt: number) {
    this.rig.root.rotation.y = this.facing;
    this.rig.update(dt, this.rigState());
  }

  dispose() {
    this.rig.root.parent?.remove(this.rig.root);
    if (this.rig.trail) this.rig.trail.mesh.parent?.remove(this.rig.trail.mesh);
    this.rig.dispose();
  }
}
