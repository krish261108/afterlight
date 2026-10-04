import type { Look } from './Rig';
import type { FighterType } from './Fighter';
import { ENEMY_ATTACKS as E } from '../combat/types';
import { PALETTE } from '../world/materials';
import { choice } from '../core/util';

// ----------------------------------------------------------------- the cast

export const LOOKS: Record<string, Look> = {
  ira1: { skin: '#d9b08c', cloth: '#6b5a3e', cloth2: '#4a3f30', hair: '#2b1d14', hairStyle: 'short', height: 0.95, build: 0.82, mark: null },
  ira47: { skin: '#b07a55', cloth: '#596070', cloth2: '#363a44', armor: '#7c828c', hair: '#3a2a20', hairStyle: 'cropped', height: 1.16, build: 1.22, scarf: '#b8231c', mark: 'blue', pauldrons: true },
  ira47Tank: { skin: '#b07a55', cloth: '#9a8f80', cloth2: '#7d7366', hair: '#3a2a20', hairStyle: 'shaved', height: 1.16, build: 1.22, mark: 'blue' },
  kaal: { skin: '#b58cff', cloth: '#a27cf0', cloth2: '#8a63db', hair: '#a27cf0', hairStyle: 'bald', height: 1.32, build: 0.78, glass: true },
  elias: { skin: '#e2c4a8', cloth: '#7a7f88', cloth2: '#5f646d', hair: '#3a3a3a', hairStyle: 'bald', height: 0.96, build: 0.78, glasses: true, robe: '#6c717a', mark: 'blue' },
  corrow: { skin: '#a8785a', cloth: '#4f5560', cloth2: '#353a43', armor: '#6d727c', hair: '#777777', hairStyle: 'shaved', beard: '#9a9a9a', height: 1.1, build: 1.35, rings: true, mark: 'blue', pauldrons: true },
  pell: { skin: '#e8c3a0', cloth: '#5e6470', cloth2: '#41454f', hair: '#6b4a2a', hairStyle: 'short', height: 0.9, build: 0.74, helmet: '#868c96', mark: 'blue' },
  mira: { skin: '#f0cfb0', cloth: '#5e6470', cloth2: '#41454f', armor: '#7c828c', hair: '#c45a2a', hairStyle: 'bun', height: 0.97, build: 0.86, mark: 'blue' },
  sauvir: { skin: '#8a5a3a', cloth: PALETTE.reachRed, cloth2: '#5a2f1f', armor: '#7a5a3a', hair: '#1d1410', hairStyle: 'braids', height: 1.08, build: 1.1, kite: true },
  ama: { skin: '#7d5034', cloth: '#7d2e1c', cloth2: '#4a2416', armor: '#6b4a2e', hair: '#1d1410', hairStyle: 'shaved', height: 1.04, build: 1.05, facePaint: true },
  ysoldeYoung: { skin: '#8a5a3a', cloth: PALETTE.reachOchre, cloth2: '#6b3f1f', hair: '#1d1410', hairStyle: 'shaved', height: 0.92, build: 0.8 },
  ysoldeOld: { skin: '#7d5236', cloth: '#9b3a2a', cloth2: '#6f2a1f', hair: '#e8e4dc', hairStyle: 'long', height: 0.86, build: 0.82, robe: '#8f3a2a' },
  marta: { skin: '#c99a78', cloth: '#7a5a3a', cloth2: '#5a4128', hair: '#5a4a3a', hairStyle: 'bun', height: 0.94, build: 0.9 },
  priest: { skin: '#e2c4a8', cloth: '#d9d4ca', cloth2: '#b8b2a6', hair: '#3a3a3a', hairStyle: 'bald', height: 0.98, build: 0.85, robe: '#cfc8bb', mark: 'blue' },
};

const conscriptSkins = ['#d9b08c', '#c99a78', '#8d5a3b', '#e2b896', '#a8785a'];
const hairs = ['#2b1d14', '#5a3a22', '#1a1410', '#7a5a3a', '#c0a070'];

export function recruitLook(i: number): Look {
  return {
    skin: conscriptSkins[i % conscriptSkins.length],
    cloth: i % 3 === 0 ? '#6b5a3e' : i % 3 === 1 ? '#5f5238' : '#74613f',
    cloth2: '#4a3f30',
    hair: hairs[(i * 3) % hairs.length],
    hairStyle: (['short', 'cropped', 'bun', 'short', 'long'] as const)[i % 5],
    height: 0.9 + ((i * 37) % 13) / 100,
    build: 0.8 + ((i * 17) % 20) / 100,
    helmet: i % 4 === 0 ? '#6f6a5e' : undefined,
    mark: i % 6 === 0 ? null : 'blue',
  };
}

export function halvethLook(i: number, deserter = false): Look {
  return {
    skin: choice(conscriptSkins),
    cloth: deserter ? '#4d525c' : '#5e6470',
    cloth2: deserter ? '#2f333b' : '#41454f',
    armor: i % 2 ? '#7c828c' : undefined,
    hair: choice(hairs),
    hairStyle: choice(['short', 'cropped', 'bun', 'shaved'] as const),
    height: 1 + Math.random() * 0.08,
    build: 0.95 + Math.random() * 0.2,
    helmet: i % 3 === 0 ? '#80868f' : undefined,
    mark: 'blue',
    cape: deserter && i % 3 === 1 ? '#3a2a24' : undefined,
  };
}

export function reachLook(elite = false): Look {
  return {
    skin: choice(['#8a5a3a', '#7d5034', '#6b4128', '#9a6a48']),
    cloth: elite ? '#7d2e1c' : choice([PALETTE.reachRed, PALETTE.reachOchre, '#a5512c']),
    cloth2: choice(['#5a2f1f', '#6b3f1f', '#4a2416']),
    armor: elite ? '#6b4a2e' : undefined,
    hair: '#1d1410',
    hairStyle: choice(['braids', 'shaved', 'braids', 'long'] as const),
    height: 1 + Math.random() * 0.1,
    build: 0.95 + Math.random() * 0.25,
    facePaint: elite || Math.random() < 0.25,
    mark: null,
  };
}

// ----------------------------------------------------------------- enemies

export function reachSpear(): FighterType {
  return {
    id: 'reachSpear',
    name: 'Reach Spear',
    look: reachLook(),
    weapon: 'spear',
    hp: 50,
    posture: 45,
    speed: 3.6,
    preferred: 2.8,
    cooldown: [1.4, 2.8],
    blockChance: 0.15,
    dodgeChance: 0.1,
    attacks: [
      { def: E.spearThrust, weight: 3, maxRange: 3.4 },
      { def: E.spearSweep, weight: 1.4, maxRange: 3.0 },
      { def: E.kick, weight: 0.8, maxRange: 1.8 },
    ],
  };
}

export function reachAxe(): FighterType {
  return {
    id: 'reachAxe',
    name: 'Reach Raider',
    look: reachLook(),
    weapon: 'axe',
    off: 'axe',
    hp: 46,
    posture: 40,
    speed: 4.3,
    preferred: 1.9,
    cooldown: [1.2, 2.4],
    blockChance: 0.05,
    dodgeChance: 0.22,
    attacks: [
      { def: E.axeL, weight: 3, maxRange: 2.1, chain: [E.axeR] },
      { def: E.axeR, weight: 1.5, maxRange: 2.1 },
      { def: E.kick, weight: 0.7, maxRange: 1.8 },
    ],
  };
}

export function reachArcher(still = false): FighterType {
  return {
    id: 'reachArcher',
    name: still ? 'Stillfire Archer' : 'Reach Archer',
    look: reachLook(still),
    weapon: 'bow',
    hp: 30,
    posture: 25,
    speed: 3.4,
    preferred: 13,
    cooldown: [2.0, 3.4],
    blockChance: 0,
    dodgeChance: 0.25,
    ranged: true,
    needsToken: false,
    attacks: [
      { def: still ? E.stillArrow : E.arrow, weight: 3, maxRange: 28, minRange: 4 },
      { def: E.kick, weight: 2, maxRange: 1.9 },
    ],
  };
}

export function reachElite(): FighterType {
  return {
    id: 'reachElite',
    name: 'Stillfire Warden',
    look: reachLook(true),
    weapon: 'stillSpear',
    hp: 95,
    posture: 75,
    speed: 3.8,
    preferred: 2.9,
    cooldown: [1.1, 2.1],
    blockChance: 0.28,
    dodgeChance: 0.08,
    parryChance: 0.1,
    attacks: [
      { def: E.spearThrust, weight: 2, maxRange: 3.4, chain: [E.spearThrust] },
      { def: E.stillThrust, weight: 1.2, maxRange: 3.5 },
      { def: E.spearSweep, weight: 1.5, maxRange: 3.0 },
    ],
  };
}

export function reachBrute(): FighterType {
  const look = reachLook(true);
  look.height = 1.22;
  look.build = 1.5;
  return {
    id: 'reachBrute',
    name: 'Reach Breaker',
    look,
    weapon: 'hammer',
    hp: 150,
    posture: 120,
    speed: 2.9,
    preferred: 2.3,
    cooldown: [1.7, 2.9],
    blockChance: 0,
    dodgeChance: 0,
    superArmor: true,
    staggerDur: 2.2,
    attacks: [
      { def: E.hammerSlam, weight: 2, maxRange: 2.9 },
      { def: E.hammerSweep, weight: 1.6, maxRange: 2.8 },
      { def: E.kick, weight: 0.8, maxRange: 1.9 },
    ],
  };
}

export function deserter(i: number): FighterType {
  return {
    id: 'deserter',
    name: 'Deserter',
    look: halvethLook(i, true),
    weapon: 'sword',
    hp: 55,
    posture: 46,
    speed: 3.9,
    preferred: 2.0,
    cooldown: [1.2, 2.4],
    blockChance: 0.25,
    dodgeChance: 0.1,
    calmable: true,
    attacks: [
      { def: E.swordSlash, weight: 3, maxRange: 2.4, chain: [E.swordBack] },
      { def: E.swordOver, weight: 1.4, maxRange: 2.5 },
      { def: E.kick, weight: 0.6, maxRange: 1.8 },
    ],
  };
}

export function halvethAlly(i: number): FighterType {
  return {
    id: 'halveth',
    name: 'Halveth Soldier',
    look: halvethLook(i),
    weapon: i % 3 === 2 ? 'spear' : 'sword',
    hp: 80,
    posture: 60,
    speed: 4.2,
    preferred: 2.1,
    cooldown: [1.6, 3.0],
    blockChance: 0.3,
    dodgeChance: 0,
    needsToken: false,
    attacks: i % 3 === 2 ? [{ def: E.spearThrust, weight: 1, maxRange: 3.3 }] : [{ def: E.swordSlash, weight: 1, maxRange: 2.4, chain: [E.swordBack] }],
  };
}

export function glassEcho(): FighterType {
  return {
    id: 'echo',
    name: 'Glass Echo',
    look: { ...LOOKS.kaal, height: 1.05, build: 1, hairStyle: 'cropped' },
    weapon: 'sword',
    hp: 34,
    posture: 30,
    speed: 3.2,
    preferred: 2.2,
    cooldown: [2.0, 3.2],
    blockChance: 0.1,
    dodgeChance: 0,
    attacks: [
      { def: { ...E.swordSlash, windup: 0.75, damage: 7 }, weight: 2, maxRange: 2.4 },
      { def: { ...E.swordOver, windup: 0.95, damage: 10 }, weight: 1, maxRange: 2.5 },
    ],
  };
}

// ----------------------------------------------------------------- bosses and named

export function corrowSpar(): FighterType {
  return {
    id: 'corrow',
    name: 'Marshal Dace Corrow',
    look: LOOKS.corrow,
    weapon: 'sword',
    hp: 240,
    posture: 110,
    speed: 3.8,
    preferred: 2.2,
    cooldown: [1.1, 2.0],
    blockChance: 0.35,
    dodgeChance: 0,
    parryChance: 0.08,
    boss: true,
    aggroRange: 90,
    needsToken: false,
    attacks: [
      { def: { ...E.swordSlash, damage: 6 }, weight: 3, maxRange: 2.5, chain: [{ ...E.swordBack, damage: 6 }] },
      { def: { ...E.swordOver, damage: 9 }, weight: 1.5, maxRange: 2.6 },
      { def: { ...E.kick, damage: 3 }, weight: 1, maxRange: 1.9 },
    ],
  };
}

export function sauvirBoss(): FighterType {
  return {
    id: 'sauvir',
    name: 'Sauvir of the Hollow Reach',
    look: LOOKS.sauvir,
    weapon: 'stillSpear',
    hp: 560,
    posture: 210,
    speed: 4.7,
    preferred: 3.0,
    cooldown: [0.8, 1.6],
    blockChance: 0.18,
    dodgeChance: 0.16,
    parryChance: 0.14,
    boss: true,
    aggroRange: 90,
    needsToken: false,
    staggerDur: 1.5,
    postureRegen: 18,
    attacks: [
      { def: { ...E.spearThrust, damage: 15, windup: 0.5 }, weight: 3, maxRange: 3.5, chain: [{ ...E.spearThrust, damage: 15, windup: 0.32 }] },
      { def: { ...E.spearSweep, damage: 16 }, weight: 2, maxRange: 3.1, chain: [{ ...E.stillThrust, damage: 22 }] },
      { def: { ...E.stillThrust, damage: 24 }, weight: 1.4, maxRange: 3.6 },
      { def: { ...E.kick, damage: 6 }, weight: 1, maxRange: 1.9, chain: [{ ...E.spearThrust, damage: 15, windup: 0.3 }] },
    ],
  };
}

export function deserterCaptain(): FighterType {
  const look = halvethLook(0, true);
  look.height = 1.12;
  look.build = 1.3;
  look.cape = '#5a1f1a';
  look.armor = '#5c616b';
  look.helmet = undefined;
  look.hairStyle = 'shaved';
  look.beard = '#3a2a20';
  return {
    id: 'varek',
    name: 'Varek Thorne, Deserter Captain',
    look,
    weapon: 'sword',
    hp: 430,
    posture: 170,
    speed: 4.1,
    preferred: 2.2,
    cooldown: [0.9, 1.8],
    blockChance: 0.3,
    dodgeChance: 0.05,
    parryChance: 0.12,
    boss: true,
    aggroRange: 90,
    needsToken: false,
    attacks: [
      { def: { ...E.swordSlash, damage: 14 }, weight: 3, maxRange: 2.6, chain: [{ ...E.swordBack, damage: 14 }, { ...E.swordOver, damage: 20 }] },
      { def: { ...E.swordOver, damage: 22, windup: 0.6 }, weight: 1.5, maxRange: 2.7 },
      { def: { ...E.kick, damage: 6 }, weight: 1.2, maxRange: 1.9, chain: [{ ...E.swordOver, damage: 20, windup: 0.45 }] },
    ],
  };
}

export function forgeMaster(): FighterType {
  return {
    id: 'forgemaster',
    name: 'Orsk, Master of the Stillfire',
    look: { skin: '#6b4128', cloth: '#3a1f16', cloth2: '#24130d', armor: '#4a3a30', hair: '#e8e4dc', hairStyle: 'long', beard: '#e8e4dc', height: 1.25, build: 1.45, robe: '#2e1a12', facePaint: true },
    weapon: 'stillSpear',
    hp: 680,
    posture: 240,
    speed: 3.6,
    preferred: 3.2,
    cooldown: [1.0, 1.9],
    blockChance: 0.2,
    dodgeChance: 0,
    parryChance: 0.08,
    boss: true,
    aggroRange: 90,
    needsToken: false,
    superArmor: true,
    staggerDur: 2.0,
    attacks: [
      { def: { ...E.stillThrust, damage: 26 }, weight: 2, maxRange: 3.8 },
      { def: { ...E.spearSweep, damage: 20 }, weight: 2, maxRange: 3.4, chain: [{ ...E.spearSweep, damage: 20, windup: 0.5 }] },
      { def: { ...E.hammerSlam, name: 'slam', damage: 30 }, weight: 1.2, maxRange: 3.0 },
      { def: { ...E.javelin, damage: 18 }, weight: 1.5, maxRange: 20, minRange: 7 },
    ],
  };
}
