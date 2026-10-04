import * as THREE from 'three';
import { Actor, type Team } from './Actor';
import type { Look } from './Rig';
import type { WeaponKind } from './weapons';
import type { AttackDef, CombatCtx } from '../combat/types';
import { angleDiff, rand } from '../core/util';

export interface AttackOption {
  def: AttackDef;
  weight: number;
  maxRange: number;
  minRange?: number;
  /** Follow-up attacks chained straight after this one. */
  chain?: AttackDef[];
}

export interface FighterType {
  id: string;
  name: string;
  look: Look;
  weapon: WeaponKind;
  off?: WeaponKind;
  hp: number;
  posture: number;
  speed: number;
  attacks: AttackOption[];
  preferred: number;
  cooldown: [number, number];
  blockChance: number;
  dodgeChance: number;
  parryChance?: number;
  ranged?: boolean;
  superArmor?: boolean;
  calmable?: boolean;
  boss?: boolean;
  aggroRange?: number;
  staggerDur?: number;
  needsToken?: boolean;
  postureRegen?: number;
}

const tmp = new THREE.Vector3();

export class Fighter extends Actor {
  readonly type: FighterType;
  target: Actor | null = null;
  private retargetT = 0;
  private cooldown = 0;
  private strafe = 1;
  private strafeT = 0;
  private hasToken = false;
  private calmT = 0;
  private reacted = false;
  private blockT = 0;
  private chainQueue: AttackDef[] = [];
  private hopT = 0;
  aggro = true;
  /** Stand still until a hostile comes within this distance. */
  guardRadius = 0;
  /** Allies stay near this actor when idle. */
  follow: Actor | null = null;
  /** Bosses hook into this to run phase changes. */
  onThink: ((self: Fighter, dt: number) => void) | null = null;
  habitReader = false;
  moveScale = 1;
  private lastPos = new THREE.Vector3();
  private blockedT = 0;
  private detourT = 0;
  private detourSide = 1;

  constructor(ctx: CombatCtx, type: FighterType, team: Team = 'enemy') {
    super(ctx, type.look, { name: type.name, team, hp: type.hp, posture: type.posture, weapon: type.weapon, offWeapon: type.off });
    this.type = type;
    this.superArmor = !!type.superArmor;
    this.staggerDur = type.staggerDur ?? 1.7;
    this.postureRegen = type.postureRegen ?? 12;
    this.cooldown = rand(0.6, 1.6);
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.showHealthBar = true;
    if (team === 'ally') {
      this.invulnerable = true;
      this.damageDealtMul = 0.55;
      this.showHealthBar = false;
    }
  }

  private releaseToken() {
    if (this.hasToken) {
      this.ctx.tokens.give(this);
      this.hasToken = false;
    }
  }

  protected endAttack() {
    super.endAttack();
    if (this.chainQueue.length && this.alive && this.target?.alive) {
      const next = this.chainQueue.shift()!;
      this.beginAttack(next);
      return;
    }
    this.releaseToken();
  }

  die(killer: Actor | null) {
    this.chainQueue.length = 0;
    this.releaseToken();
    super.die(killer);
  }

  flinch(t: number) {
    this.chainQueue.length = 0;
    super.flinch(t);
  }

  recoil() {
    this.chainQueue.length = 0;
    super.recoil();
  }

  breakPosture() {
    this.chainQueue.length = 0;
    super.breakPosture();
  }

  calm() {
    if (this.state === 'calmed' || !this.alive) return;
    this.releaseToken();
    if (this.attack) super.endAttack();
    this.state = 'calmed';
    this.team = 'neutral';
    this.blocking = false;
    this.vel.set(0, 0, 0);
    this.rig.setWeapon('none');
    this.showHealthBar = false;
    this.ctx.sfx.play('calm', { pos: this.pos });
    const p = tmp.copy(this.pos);
    p.y += 1.4;
    this.ctx.particles.burst(p, 16, '#c9b8ff', 2, 1.2, 0.14, 1);
    this.ctx.onCalm(this);
  }

  private beginAttack(def: AttackDef) {
    this.attackTarget = this.target;
    this.startAttack(def);
    if (def.unblockable) {
      this.rig.flash('#ff2a1a', def.windup * 0.9);
      this.ctx.sfx.play('unblockable', { pos: this.pos, vol: 0.8 });
    } else {
      this.rig.flash('#ffffff', 0.08);
      this.ctx.sfx.play('telegraph', { pos: this.pos, vol: 0.5 });
    }
  }

  private pickTarget() {
    let best: Actor | null = null;
    let bestD = Infinity;
    const range = this.type.aggroRange ?? 30;
    for (const o of this.ctx.actors) {
      if (!this.hostileTo(o) || o.state === 'calmed') continue;
      let d = this.distTo(o);
      if (d > range) continue;
      if (o.team === 'player') d *= 0.75;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    this.target = best;
  }

  protected think(dt: number) {
    this.onThink?.(this, dt);
    if (!this.alive || this.state === 'calmed') {
      this.vel.set(0, 0, 0);
      return;
    }
    if (this.state !== 'attack' && this.hasToken && !this.chainQueue.length) this.releaseToken();
    if (this.busy) {
      if (this.state === 'attack') this.vel.multiplyScalar(0.6);
      return;
    }

    this.retargetT -= dt;
    if (this.retargetT <= 0 || !this.target?.alive) {
      this.retargetT = 0.5;
      this.pickTarget();
    }
    const t = this.target;
    if (!t || !this.aggro) {
      this.blocking = false;
      if (this.follow && this.follow.alive) {
        const d = this.distTo(this.follow);
        if (d > 3.5) {
          tmp.copy(this.follow.pos).sub(this.pos).setY(0).normalize().multiplyScalar(Math.min(6, 2 + d * 0.6) * this.moveScale);
          this.vel.lerp(tmp, Math.min(1, 6 * dt));
          this.faceToward(this.follow.pos.x, this.follow.pos.z, dt, 8);
        } else this.vel.multiplyScalar(0.8);
      } else this.vel.multiplyScalar(0.8);
      return;
    }
    const dist = this.distTo(t);
    if (this.guardRadius > 0) {
      if (Math.hypot(dist, (t.pos.y - this.pos.y) * 1.6) > this.guardRadius) {
        this.vel.multiplyScalar(0.8);
        this.faceToward(t.pos.x, t.pos.z, dt, 3);
        return;
      }
      this.guardRadius = 0;
    }

    // A lullaby can reach the frightened.
    if (this.type.calmable && this.ctx.player && this.ctx.player.humming && this.distTo(this.ctx.player) < 9 && this.hp < this.maxHp * 0.7) {
      this.calmT += dt;
      this.vel.multiplyScalar(0.85);
      this.blocking = false;
      if (this.calmT > 2.0) {
        this.calm();
        return;
      }
      if (this.calmT > 0.6) {
        this.pose = 'hum';
        return;
      }
    } else {
      this.calmT = Math.max(0, this.calmT - dt);
      this.pose = null;
    }

    this.faceToward(t.pos.x, t.pos.z, dt, 7);
    this.cooldown -= dt;

    // Defensive reactions to the player's swings.
    if (t.state === 'attack' && t.phase === 'windup' && dist < 3.6 * t.height && t.angleTo(this) < 1.0) {
      if (!this.reacted) {
        this.reacted = true;
        let parry = this.type.parryChance ?? 0;
        if (this.habitReader && 'habit' in t) parry += (t as unknown as { habit(): number }).habit() * 0.55;
        const r = Math.random();
        if (r < parry) {
          this.blocking = true;
          this.blockStart = this.ctx.time + (t.attack ? t.attack.windup * (1 - t.phaseT) - 0.08 : 0);
          this.blockT = 0.6;
        } else if (r < parry + this.type.blockChance) {
          this.blocking = true;
          this.blockStart = this.ctx.time - 1;
          this.blockT = 0.7;
        } else if (r < parry + this.type.blockChance + this.type.dodgeChance) {
          this.hop(t);
          return;
        }
      }
    } else if (t.state !== 'attack') this.reacted = false;

    if (this.blocking) {
      this.blockT -= dt;
      if (this.blockT <= 0) this.blocking = false;
      this.vel.multiplyScalar(0.7);
      return;
    }

    if (this.hopT > 0) {
      this.hopT -= dt;
      return;
    }

    // Attack selection.
    if (this.cooldown <= 0) {
      const opts = this.type.attacks.filter((o) => dist <= o.maxRange * this.height && dist >= (o.minRange ?? 0));
      if (opts.length) {
        let take = true;
        if (this.type.needsToken !== false && this.team === 'enemy') {
          if (!this.hasToken) this.hasToken = this.ctx.tokens.take(this);
          take = this.hasToken;
        }
        if (take) {
          const total = opts.reduce((s, o) => s + o.weight, 0);
          let r = Math.random() * total;
          let pick = opts[0];
          for (const o of opts) {
            r -= o.weight;
            if (r <= 0) {
              pick = o;
              break;
            }
          }
          this.chainQueue = pick.chain ? [...pick.chain] : [];
          this.beginAttack(pick.def);
          this.cooldown = rand(this.type.cooldown[0], this.type.cooldown[1]);
          this.vel.set(0, 0, 0);
          return;
        }
      }
    }

    // Positioning.
    const pref = this.type.preferred * (this.hasToken || this.type.ranged ? 1 : 1.6);
    const sp = this.type.speed * this.moveScale;
    const dx = (t.pos.x - this.pos.x) / Math.max(0.01, dist);
    const dz = (t.pos.z - this.pos.z) / Math.max(0.01, dist);
    let vx = 0;
    let vz = 0;
    if (dist > pref + 0.8) {
      vx = dx * sp;
      vz = dz * sp;
    } else if (dist < pref - 0.8) {
      vx = -dx * sp * 0.6;
      vz = -dz * sp * 0.6;
    }
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = rand(1.2, 3);
      this.strafe = Math.random() < 0.5 ? 1 : -1;
    }
    if (dist < pref + 3) {
      vx += -dz * this.strafe * sp * 0.4;
      vz += dx * this.strafe * sp * 0.4;
    }
    // Spread out from allies so groups surround instead of stacking.
    for (const o of this.ctx.actors) {
      if (o === this || !o.alive || o.team !== this.team) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 2 && od > 0.01) {
        vx += (ox / od) * (2 - od) * 1.5;
        vz += (oz / od) * (2 - od) * 1.5;
      }
    }
    // If something solid is in the way, slide sideways around it for a moment.
    const want = Math.hypot(vx, vz);
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.copy(this.pos);
    if (want > 1 && moved < want * dt * 0.3) this.blockedT += dt;
    else this.blockedT = Math.max(0, this.blockedT - dt * 2);
    if (this.blockedT > 0.35 && this.detourT <= 0) {
      this.detourT = rand(0.7, 1.3);
      this.detourSide = Math.random() < 0.5 ? 1 : -1;
      this.blockedT = 0;
    }
    if (this.detourT > 0) {
      this.detourT -= dt;
      vx += -dz * this.detourSide * sp * 1.1;
      vz += dx * this.detourSide * sp * 1.1;
    }
    tmp.set(vx, 0, vz);
    this.vel.lerp(tmp, Math.min(1, 6 * dt));
  }

  private hop(from: Actor) {
    const a = Math.atan2(this.pos.x - from.pos.x, this.pos.z - from.pos.z) + rand(-0.6, 0.6);
    this.vel.set(Math.sin(a) * 7, 0, Math.cos(a) * 7);
    this.invuln = 0.3;
    this.hopT = 0.3;
    this.ctx.sfx.play('dodge', { pos: this.pos, vol: 0.6 });
  }

  /** Used by scripted fights: turn to face something without full AI. */
  isFacing(o: Actor) {
    return Math.abs(angleDiff(this.facing, Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z))) < 0.5;
  }
}
