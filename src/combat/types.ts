import type * as THREE from 'three';
import type { SfxName, Sfx } from '../audio/Sfx';
import type { Particles } from '../world/Particles';
import type { World } from '../core/World';
import type { Difficulty } from '../core/Save';
import type { Actor } from '../entities/Actor';

export interface AttackDef {
  name: string;
  windup: number;
  active: number;
  recover: number;
  damage: number;
  posture: number;
  range: number;
  arc: number;
  lunge?: number;
  unblockable?: boolean;
  heavy?: boolean;
  sound?: SfxName;
  aoe?: boolean;
  knockback?: number;
  tracking?: number;
  stamina?: number;
  /** Fires a projectile at the start of the active window instead of a melee sweep. */
  projectile?: 'arrow' | 'stillArrow' | 'javelin';
  hitsMany?: boolean;
}

export type HitResult = 'hit' | 'blocked' | 'parried' | 'dodged' | 'none' | 'killed' | 'broken';

export interface TokenPool {
  take(a: Actor): boolean;
  give(a: Actor): void;
}

export interface CombatCtx {
  actors: Actor[];
  sfx: Sfx;
  particles: Particles;
  world: World;
  difficulty: Difficulty;
  time: number;
  tokens: TokenPool;
  shake(amount: number): void;
  hitstop(t: number): void;
  onKill(victim: Actor, killer: Actor | null): void;
  onParry(defender: Actor, attacker: Actor): void;
  onCalm(a: Actor): void;
  player: Actor | null;
  onHit(target: Actor, attacker: Actor, result: HitResult, dmg: number): void;
  spawnProjectile(kind: 'arrow' | 'stillArrow' | 'javelin', from: THREE.Vector3, dir: THREE.Vector3, owner: Actor, atk: AttackDef): void;
}

// --------------------------------------------------------------- player moves

export const PLAYER_ATTACKS: Record<string, AttackDef> = {
  light1: { name: 'light1', windup: 0.13, active: 0.12, recover: 0.26, damage: 14, posture: 10, range: 2.3, arc: 2.2, lunge: 0.9, sound: 'swing', stamina: 11, tracking: 8 },
  light2: { name: 'light2', windup: 0.11, active: 0.12, recover: 0.26, damage: 15, posture: 11, range: 2.3, arc: 2.2, lunge: 0.8, sound: 'swing', stamina: 11, tracking: 8 },
  light3: { name: 'light3', windup: 0.2, active: 0.13, recover: 0.42, damage: 24, posture: 20, range: 2.5, arc: 1.4, lunge: 1.2, sound: 'swingHeavy', stamina: 14, tracking: 6 },
  heavy: { name: 'heavy', windup: 0.42, active: 0.14, recover: 0.5, damage: 34, posture: 38, range: 2.7, arc: 1.6, lunge: 1.0, heavy: true, sound: 'swingHeavy', stamina: 26, tracking: 5 },
  wrath: { name: 'wrath', windup: 0.32, active: 0.22, recover: 0.5, damage: 55, posture: 80, range: 5.5, arc: Math.PI * 2, aoe: true, heavy: true, unblockable: true, hitsMany: true, sound: 'wrath', knockback: 6 },
  execute: { name: 'execute', windup: 0.3, active: 0.1, recover: 0.55, damage: 120, posture: 0, range: 3, arc: 1.2, heavy: true, unblockable: true, sound: 'execute', lunge: 0.6 },
};

// --------------------------------------------------------------- enemy moves

const a = (o: Partial<AttackDef> & Pick<AttackDef, 'name' | 'damage'>): AttackDef => ({
  windup: 0.55,
  active: 0.14,
  recover: 0.55,
  posture: 14,
  range: 2.4,
  arc: 1.6,
  lunge: 0.6,
  sound: 'swing',
  tracking: 4,
  ...o,
});

export const ENEMY_ATTACKS = {
  swordSlash: a({ name: 'light1', damage: 11, windup: 0.5 }),
  swordBack: a({ name: 'light2', damage: 11, windup: 0.38 }),
  swordOver: a({ name: 'light3', damage: 17, windup: 0.7, posture: 22, sound: 'swingHeavy' }),
  spearThrust: a({ name: 'thrust', damage: 12, range: 3.3, arc: 0.7, windup: 0.6, lunge: 1.0 }),
  spearSweep: a({ name: 'sweep', damage: 12, range: 3.0, arc: 2.6, windup: 0.75, posture: 18, sound: 'swingHeavy' }),
  stillThrust: a({ name: 'thrust', damage: 18, range: 3.4, arc: 0.6, windup: 0.85, lunge: 1.6, unblockable: true, posture: 30, sound: 'stillfire' }),
  axeL: a({ name: 'axeL', damage: 9, windup: 0.32, recover: 0.3, range: 2.0 }),
  axeR: a({ name: 'light1', damage: 9, windup: 0.3, recover: 0.4, range: 2.0 }),
  hammerSlam: a({ name: 'slam', damage: 26, windup: 1.0, range: 2.9, arc: 1.2, posture: 40, heavy: true, sound: 'swingHeavy', lunge: 0.4, recover: 0.9 }),
  hammerSweep: a({ name: 'sweep', damage: 18, windup: 0.85, range: 2.8, arc: 3.0, posture: 26, heavy: true, sound: 'swingHeavy', recover: 0.8 }),
  kick: a({ name: 'kick', damage: 6, windup: 0.4, range: 1.8, arc: 1.2, posture: 26, unblockable: true, lunge: 0.3 }),
  arrow: a({ name: 'shoot', damage: 10, windup: 1.0, recover: 0.7, range: 30, arc: 0.5, projectile: 'arrow', sound: 'arrow', lunge: 0, tracking: 6 }),
  stillArrow: a({ name: 'shoot', damage: 16, windup: 1.3, recover: 0.8, range: 30, arc: 0.5, projectile: 'stillArrow', sound: 'arrow', lunge: 0, unblockable: true, tracking: 6 }),
  javelin: a({ name: 'thrust', damage: 14, windup: 0.9, recover: 0.7, range: 22, arc: 0.6, projectile: 'javelin', sound: 'swingHeavy', lunge: 0, tracking: 5 }),
  knife: a({ name: 'thrust', damage: 10, windup: 0.35, range: 1.9, arc: 0.9, lunge: 1.3, recover: 0.35 }),
} satisfies Record<string, AttackDef>;
