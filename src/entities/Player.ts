import * as THREE from 'three';
import { Actor } from './Actor';
import type { Look } from './Rig';
import type { WeaponKind } from './weapons';
import type { AttackDef, CombatCtx } from '../combat/types';
import { PLAYER_ATTACKS } from '../combat/types';
import type { Input } from '../core/Input';
import { angleDiff, clamp, dampAngle } from '../core/util';

export interface PlayerHooks {
  input: Input;
  cameraYaw: () => number;
  onInteract: () => boolean;
  onHumChange: (on: boolean) => void;
  onWrath: () => void;
  onDodge: () => void;
}

export interface Perks {
  humHeal: number;
  posture: number;
  stamina: number;
  damage: number;
  parry: number;
  wrathGain: number;
}

export class Player extends Actor {
  stamina = 100;
  maxStamina = 100;
  private staminaDelay = 0;
  wrath = 0;
  canWrath = false;
  canHum = true;
  canHeavy = true;
  canDodge = true;
  canBlock = true;
  control = true;
  lockTarget: Actor | null = null;
  private comboIdx = 0;
  private comboQueued = false;
  private comboResetT = 0;
  private dodgeT = 0;
  private dodgeDir = new THREE.Vector3();
  private humT = 0;
  hooks: PlayerHooks;
  perks: Perks = { humHeal: 1, posture: 1, stamina: 1, damage: 1, parry: 1, wrathGain: 1 };
  baseParry = 0.2;
  /** Last few attack start times, used by bosses that read your habits. */
  attackLog: { t: number; kind: string }[] = [];
  humTime = 0;
  sprinting = false;
  private wantMove = new THREE.Vector3();
  respawnInvuln = 0;

  constructor(ctx: CombatCtx, look: Look, weapon: WeaponKind, hooks: PlayerHooks, hp = 100) {
    super(ctx, look, { name: 'Ira', team: 'player', hp, posture: 100, weapon });
    this.hooks = hooks;
    this.staggerDur = 1.0;
    this.postureRegen = 20;
  }

  applyPerks(p: Perks) {
    this.perks = p;
    this.maxPosture = 100 * p.posture;
    this.maxStamina = 100 * p.stamina;
    this.stamina = Math.min(this.stamina, this.maxStamina);
    this.damageDealtMul = p.damage;
  }

  private moveInput(): THREE.Vector3 {
    const m = this.hooks.input.move;
    const yaw = this.hooks.cameraYaw();
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    return this.wantMove.set(fx * m.y + rx * m.x, 0, fz * m.y + rz * m.x);
  }

  private spend(cost: number) {
    if (this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - cost);
    this.staminaDelay = 0.7;
    return true;
  }

  private softTarget(dir: THREE.Vector3): Actor | null {
    if (this.lockTarget && this.lockTarget.alive) return this.lockTarget;
    const hasDir = dir.lengthSq() > 0.01;
    const want = hasDir ? Math.atan2(dir.x, dir.z) : this.facing;
    let best: Actor | null = null;
    let bestScore = Infinity;
    for (const o of this.ctx.actors) {
      if (!this.hostileTo(o) || o.state === 'calmed') continue;
      const d = this.distTo(o);
      if (d > 5) continue;
      const ang = Math.abs(angleDiff(want, Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z)));
      if (ang > 1.4) continue;
      const score = d + ang * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  executionTarget(): Actor | null {
    for (const o of this.ctx.actors) {
      if (!this.hostileTo(o) || o.state !== 'stagger') continue;
      if (this.distTo(o) < 2.8 * this.height && this.angleTo(o) < 1.3) return o;
    }
    return null;
  }

  toggleLock() {
    if (this.lockTarget) {
      this.lockTarget = null;
      return;
    }
    this.lockTarget = this.findLockTarget();
  }

  findLockTarget(): Actor | null {
    const yaw = this.hooks.cameraYaw();
    let best: Actor | null = null;
    let bestScore = Infinity;
    for (const o of this.ctx.actors) {
      if (!this.hostileTo(o) || o.state === 'calmed') continue;
      const d = this.distTo(o);
      if (d > 24) continue;
      const ang = Math.abs(angleDiff(yaw, Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z)));
      if (ang > 1.3 && d > 5) continue;
      const score = d * 0.6 + ang * 6;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  private startAtk(name: keyof typeof PLAYER_ATTACKS, dir: THREE.Vector3) {
    const def = PLAYER_ATTACKS[name];
    if (def.stamina && !this.spend(def.stamina)) return false;
    const t = name === 'execute' ? this.executionTarget() : this.softTarget(dir);
    this.attackTarget = t;
    if (t) this.faceToward(t.pos.x, t.pos.z);
    else if (dir.lengthSq() > 0.01) this.facing = Math.atan2(dir.x, dir.z);
    this.startAttack(def);
    this.humming = false;
    this.attackLog.push({ t: this.ctx.time, kind: name });
    if (this.attackLog.length > 12) this.attackLog.shift();
    if (name === 'execute') this.invuln = 0.95;
    if (name === 'wrath') {
      this.invuln = 0.7;
      this.wrath = 0;
      this.hooks.onWrath();
    }
    return true;
  }

  protected think(dt: number) {
    const inp = this.hooks.input;
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else this.stamina = Math.min(this.maxStamina, this.stamina + 34 * dt * (this.blocking ? 0.4 : 1));
    if (this.comboResetT > 0) this.comboResetT -= dt;
    else this.comboIdx = 0;
    if (this.respawnInvuln > 0) {
      this.respawnInvuln -= dt;
      this.invuln = Math.max(this.invuln, 0.05);
    }
    this.parryWindow = this.baseParry * this.perks.parry;
    if (this.lockTarget && (!this.lockTarget.alive || this.lockTarget.state === 'calmed' || this.distTo(this.lockTarget) > 30)) {
      const prev = this.lockTarget;
      this.lockTarget = null;
      const next = this.findLockTarget();
      if (next && next !== prev && this.distTo(next) < 12) this.lockTarget = next;
    }

    if (!this.control) {
      this.vel.set(0, 0, 0);
      this.blocking = false;
      this.setHum(false);
      return;
    }

    if (inp.pressed('lock')) this.toggleLock();

    const dir = this.moveInput();
    const mag = Math.min(1, dir.length());

    if (this.state === 'dodge') {
      this.updateDodge(dt);
      return;
    }

    if (this.state === 'attack') {
      this.vel.multiplyScalar(0.7);
      const atk = this.attack!;
      if (inp.pressed('light') && atk.name.startsWith('light')) this.comboQueued = true;
      if (this.phase === 'recover') {
        if (this.comboQueued && this.phaseT > 0.15 && this.comboIdx < 3) {
          this.comboQueued = false;
          const next = (['light1', 'light2', 'light3'] as const)[this.comboIdx];
          this.comboIdx++;
          this.comboResetT = 1.0;
          this.endAttack();
          this.startAtk(next, dir);
          return;
        }
        if (this.phaseT > 0.35 && this.canDodge && inp.pressed('dodge')) {
          this.endAttack();
          this.startDodge(dir);
          return;
        }
      }
      return;
    }

    if (this.state === 'hit' || this.state === 'stagger' || this.state === 'recoil') {
      this.blocking = false;
      this.setHum(false);
      if (this.state === 'hit' && this.stateT > 0.18 && this.canDodge && inp.pressed('dodge')) this.startDodge(dir);
      return;
    }

    // ---- idle / moving
    if (this.canDodge && inp.pressed('dodge') && this.stamina > 0) {
      this.startDodge(dir);
      return;
    }
    if (inp.pressed('interact') && this.hooks.onInteract()) return;
    const exec = this.executionTarget();
    if (exec && (inp.pressed('light') || inp.pressed('interact'))) {
      this.startAtk('execute', dir);
      return;
    }
    if (inp.pressed('wrath') && this.canWrath && this.wrath >= 100) {
      this.startAtk('wrath', dir);
      return;
    }
    if (inp.pressed('light')) {
      this.comboIdx = 1;
      this.comboResetT = 1.0;
      this.comboQueued = false;
      if (this.startAtk('light1', dir)) return;
    }
    if (inp.pressed('heavy') && this.canHeavy) {
      if (this.startAtk('heavy', dir)) return;
    }

    const wantBlock = this.canBlock && inp.isDown('block');
    if (wantBlock && !this.blocking) this.blockStart = this.ctx.time;
    this.blocking = wantBlock;
    const wantHum = this.canHum && inp.isDown('hum') && !this.blocking;
    this.setHum(wantHum);

    this.sprinting = inp.isDown('sprint') && mag > 0.3 && !this.blocking && !this.humming && this.stamina > 1;
    let speed = 4.3;
    if (this.sprinting) {
      speed = 6.6;
      this.stamina = Math.max(0, this.stamina - 11 * dt);
      this.staminaDelay = 0.3;
    }
    if (this.blocking) speed = 1.7;
    if (this.humming) speed = 1.4;
    speed *= this.height;
    const tv = dir.clone().normalize().multiplyScalar(speed * mag);
    const accel = mag > 0.05 ? 14 : 18;
    this.vel.x += (tv.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (tv.z - this.vel.z) * Math.min(1, accel * dt);

    const lock = this.lockTarget;
    if (lock && !this.sprinting) {
      this.faceToward(lock.pos.x, lock.pos.z, dt, 14);
    } else if (mag > 0.1) {
      this.facing = dampAngle(this.facing, Math.atan2(dir.x, dir.z), 12, dt);
    }

    if (this.humming) {
      this.humT += dt;
      this.humTime += dt;
      if (this.humT > 0.8) this.hp = Math.min(this.maxHp, this.hp + 4.5 * this.perks.humHeal * dt);
    }
  }

  private setHum(on: boolean) {
    if (on === this.humming) return;
    this.humming = on;
    this.humT = 0;
    this.hooks.onHumChange(on);
  }

  private startDodge(dir: THREE.Vector3) {
    if (!this.spend(18)) return;
    this.setHum(false);
    this.blocking = false;
    this.state = 'dodge';
    this.stateT = 0;
    this.dodgeT = 0;
    if (dir.lengthSq() > 0.01) this.dodgeDir.copy(dir).normalize();
    else this.dodgeDir.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    if (dir.lengthSq() > 0.01 && !this.lockTarget) this.facing = Math.atan2(dir.x, dir.z);
    this.ctx.sfx.play('dodge', { pos: this.pos });
    this.hooks.onDodge();
  }

  private updateDodge(dt: number) {
    const dur = 0.56;
    this.dodgeT += dt;
    const t = this.dodgeT / dur;
    this.invuln = t > 0.03 && t < 0.62 ? 0.05 : 0;
    const back = this.dodgeDir.dot(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing))) < -0.3;
    this.roll = back ? -1 : clamp(t, 0, 0.999);
    const sp = (back ? 9 : 10.5) * (1 - t * 0.7) * this.height;
    this.vel.set(this.dodgeDir.x * sp, 0, this.dodgeDir.z * sp);
    if (back) this.pose = t < 0.9 ? 'hit' : null;
    if (t >= 1) {
      this.state = 'idle';
      this.roll = -1;
      this.pose = null;
      this.vel.multiplyScalar(0.3);
    }
  }

  receiveHit(att: Actor, atk: AttackDef, fromProjectile = false) {
    if (this.state === 'dodge' && this.invuln <= 0) this.roll = -1;
    const r = super.receiveHit(att, atk, fromProjectile);
    if (r === 'hit') this.wrath = Math.min(100, this.wrath + 4 * this.perks.wrathGain);
    if (r === 'blocked') this.stamina = Math.max(0, this.stamina - atk.damage * 0.8);
    return r;
  }

  flinch(t: number) {
    this.roll = -1;
    super.flinch(t);
  }

  breakPosture() {
    this.roll = -1;
    this.setHum(false);
    super.breakPosture();
  }

  die(killer: Actor | null) {
    this.setHum(false);
    this.lockTarget = null;
    this.roll = -1;
    super.die(killer);
  }

  addWrath(n: number) {
    if (!this.canWrath) return;
    this.wrath = Math.min(100, this.wrath + n * this.perks.wrathGain);
  }

  /** How predictable the player has been: share of recent attacks that were the same kind. */
  habit(): number {
    const recent = this.attackLog.filter((a) => this.ctx.time - a.t < 5);
    if (recent.length < 3) return 0;
    const lights = recent.filter((a) => a.kind.startsWith('light')).length;
    return lights / recent.length;
  }

  revive(hpFrac = 1) {
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.hp = this.maxHp * hpFrac;
    this.posture = 0;
    this.stamina = this.maxStamina;
    this.deadT = 0;
    this.removeMe = false;
    this.attack = null;
    this.phase = null;
    this.roll = -1;
    this.pose = null;
    this.rig.setOpacity(1);
    this.respawnInvuln = 1.5;
  }
}
