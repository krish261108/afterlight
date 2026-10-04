import * as THREE from 'three';
import { glow, PALETTE } from '../world/materials';
import { makeWeapon, Trail, type WeaponKind, type WeaponModel } from './weapons';
import { clamp, damp } from '../core/util';

export interface Look {
  skin: string;
  cloth: string;
  cloth2: string;
  armor?: string;
  hair: string;
  hairStyle: 'short' | 'braids' | 'long' | 'bald' | 'cropped' | 'bun' | 'shaved';
  height: number;
  build: number;
  helmet?: string;
  cape?: string;
  scarf?: string;
  mark?: 'blue' | 'grey' | null;
  facePaint?: boolean;
  glasses?: boolean;
  rings?: boolean;
  glass?: boolean;
  beard?: string;
  kite?: boolean;
  robe?: string;
  pauldrons?: boolean;
}

type J =
  | 'spine'
  | 'chest'
  | 'neck'
  | 'shL'
  | 'elL'
  | 'shR'
  | 'elR'
  | 'hipL'
  | 'knL'
  | 'hipR'
  | 'knR'
  | 'handR'
  | 'handL';
const JOINTS: J[] = ['spine', 'chest', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR', 'handR', 'handL'];

type V3 = [number, number, number];
export type Pose = Partial<Record<J, V3>> & { bodyY?: number; bodyRotX?: number; bodyRotZ?: number; bodyRotY?: number };

export type WeaponStyle = 'sword' | 'spear' | 'axes' | 'bow' | 'hammer' | 'none';

export interface RigState {
  speed: number;
  action: string | null;
  phase: 'windup' | 'active' | 'recover' | 'hold' | null;
  phaseT: number;
  block: boolean;
  hum: boolean;
  stagger: boolean;
  dead: boolean;
  pose: string | null;
  roll: number;
  hit: number;
  airborne: boolean;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

// Windup (W) and strike (S) key poses for each attack.
const ACTIONS: Record<string, { W: Pose; S: Pose }> = {
  light1: {
    W: { shR: [-2.0, 0, -1.1], elR: [-0.9, 0, 0], chest: [0, 0.7, 0], spine: [0.05, 0.2, 0], shL: [-0.4, 0, 0.5] },
    S: { shR: [-1.35, 0, 0.95], elR: [-0.15, 0, 0], chest: [0.15, -0.75, 0], spine: [0.1, -0.25, 0], hipL: [-0.55, 0, 0], knL: [0.5, 0, 0], hipR: [0.35, 0, 0], knR: [0.2, 0, 0], bodyY: -0.06, shL: [0.2, 0, 0.6] },
  },
  light2: {
    W: { shR: [-1.4, 0, 1.0], elR: [-0.3, 0, 0], chest: [0.1, -0.7, 0], spine: [0.08, -0.2, 0] },
    S: { shR: [-1.5, 0, -1.35], elR: [-0.2, 0, 0], chest: [0.12, 0.75, 0], spine: [0.1, 0.25, 0], hipR: [-0.5, 0, 0], knR: [0.45, 0, 0], hipL: [0.3, 0, 0], bodyY: -0.05 },
  },
  light3: {
    W: { shR: [-2.95, 0, -0.25], elR: [-0.8, 0, 0], chest: [-0.25, 0.1, 0], spine: [-0.1, 0, 0], shL: [-2.6, 0, 0.3], elL: [-0.9, 0, 0] },
    S: { shR: [-0.95, 0, -0.1], elR: [-0.1, 0, 0], chest: [0.45, 0, 0], spine: [0.25, 0, 0], shL: [-0.9, 0, 0.1], hipL: [-0.75, 0, 0], knL: [0.95, 0, 0], hipR: [0.45, 0, 0], knR: [0.3, 0, 0], bodyY: -0.13 },
  },
  heavy: {
    W: { shR: [-3.0, 0, -0.45], shL: [-2.7, 0, 0.45], elR: [-1.05, 0, 0], elL: [-1.05, 0, 0], chest: [-0.35, 0.45, 0], spine: [-0.15, 0.2, 0], knL: [0.3, 0, 0], knR: [0.3, 0, 0], bodyY: -0.04 },
    S: { shR: [-0.7, 0, 0.25], shL: [-0.8, 0, -0.2], elR: [-0.05, 0, 0], elL: [-0.1, 0, 0], chest: [0.6, -0.35, 0], spine: [0.32, -0.1, 0], hipL: [-0.95, 0, 0], knL: [1.1, 0, 0], hipR: [0.5, 0, 0], knR: [0.35, 0, 0], bodyY: -0.2 },
  },
  thrust: {
    W: { shR: [-0.55, 0, -0.1], elR: [-1.85, 0, 0], chest: [0, 0.85, 0], shL: [-1.1, 0, 0.4], elL: [-0.9, 0, 0], hipR: [0.2, 0, 0], knL: [0.25, 0, 0] },
    S: { shR: [-1.55, 0, 0.12], elR: [-0.05, 0, 0], chest: [0.12, -0.45, 0], shL: [-1.3, 0, 0.1], elL: [-0.3, 0, 0], hipL: [-0.65, 0, 0], knL: [0.6, 0, 0], hipR: [0.45, 0, 0], bodyY: -0.08 },
  },
  sweep: {
    W: { shR: [-1.45, 0, -1.45], elR: [-0.3, 0, 0], chest: [0, 1.05, 0], spine: [0, 0.3, 0], knL: [0.35, 0, 0], knR: [0.35, 0, 0] },
    S: { shR: [-1.4, 0, 1.25], elR: [-0.1, 0, 0], chest: [0.1, -1.05, 0], spine: [0.05, -0.35, 0], knL: [0.4, 0, 0], knR: [0.4, 0, 0], bodyY: -0.1 },
  },
  axeL: {
    W: { shL: [-2.2, 0, 1.0], elL: [-0.8, 0, 0], chest: [0, -0.6, 0], shR: [-0.6, 0, -0.3] },
    S: { shL: [-1.3, 0, -0.9], elL: [-0.2, 0, 0], chest: [0.15, 0.6, 0], hipL: [-0.4, 0, 0], knL: [0.4, 0, 0] },
  },
  slam: {
    W: { shR: [-3.05, 0, -0.2], shL: [-3.0, 0, 0.2], elR: [-0.5, 0, 0], elL: [-0.5, 0, 0], chest: [-0.4, 0, 0], spine: [-0.2, 0, 0], bodyY: 0.04 },
    S: { shR: [-0.5, 0, 0.1], shL: [-0.55, 0, -0.1], elR: [0, 0, 0], elL: [0, 0, 0], chest: [0.7, 0, 0], spine: [0.4, 0, 0], hipL: [-1.0, 0, 0], knL: [1.3, 0, 0], hipR: [0.6, 0, 0], knR: [0.6, 0, 0], bodyY: -0.28 },
  },
  shoot: {
    W: { shL: [-1.55, 0, 0.1], elL: [0, 0, 0], shR: [-1.5, 0, -0.3], elR: [-2.3, 0, 0], chest: [0, 0.9, 0] },
    S: { shL: [-1.55, 0, 0.1], elL: [0, 0, 0], shR: [-1.3, 0, -0.7], elR: [-1.0, 0, 0], chest: [0, 0.8, 0] },
  },
  wrath: {
    W: { shR: [-2.4, 0, -1.3], elR: [-0.6, 0, 0], chest: [0, 1.3, 0], spine: [0.1, 0.5, 0], knL: [0.6, 0, 0], knR: [0.6, 0, 0], bodyY: -0.18 },
    S: { shR: [-1.4, 0, 1.45], elR: [-0.05, 0, 0], chest: [0.1, -1.4, 0], spine: [0.15, -0.6, 0], hipL: [-0.6, 0, 0], knL: [0.7, 0, 0], hipR: [0.4, 0, 0], bodyY: -0.14 },
  },
  execute: {
    W: { shR: [-2.9, 0, -0.1], shL: [-2.9, 0, 0.1], elR: [-0.4, 0, 0], elL: [-0.4, 0, 0], chest: [-0.3, 0, 0] },
    S: { shR: [-0.3, 0, 0.05], shL: [-0.35, 0, -0.05], elR: [-0.2, 0, 0], elL: [-0.2, 0, 0], chest: [0.8, 0, 0], spine: [0.5, 0, 0], hipL: [-1.2, 0, 0], knL: [1.6, 0, 0], hipR: [0.3, 0, 0], knR: [1.0, 0, 0], bodyY: -0.38 },
  },
  kick: {
    W: { hipR: [0.4, 0, 0], knR: [1.4, 0, 0], chest: [-0.1, 0, 0], shL: [-0.6, 0, 0.4] },
    S: { hipR: [-1.5, 0, 0], knR: [0.05, 0, 0], chest: [-0.3, 0, 0], spine: [-0.2, 0, 0], bodyY: -0.05, shL: [-0.3, 0, 0.6] },
  },
};

const POSES: Record<string, Pose> = {
  block: { shR: [-1.25, 0, 0.6], elR: [-1.3, 0, 0], shL: [-1.0, 0, 0.25], elL: [-1.5, 0, 0], chest: [0.1, -0.25, 0], knL: [0.28, 0, 0], knR: [0.28, 0, 0], hipL: [-0.15, 0, 0], bodyY: -0.06 },
  hit: { chest: [-0.35, 0, 0], neck: [-0.35, 0, 0], spine: [-0.12, 0, 0], shR: [-0.2, 0, -0.45], shL: [-0.2, 0, 0.45] },
  stagger: { spine: [0.55, 0, 0], chest: [0.2, 0.2, 0], neck: [0.35, 0, 0], shR: [0.15, 0, -0.25], shL: [0.15, 0, 0.25], elR: [-0.2, 0, 0], elL: [-0.2, 0, 0], hipL: [-0.25, 0, 0], knL: [0.65, 0, 0], hipR: [-0.1, 0, 0], knR: [0.5, 0, 0], bodyY: -0.14 },
  hum: { neck: [0.28, 0, 0], shL: [-0.55, 0, 0.45], elL: [-2.0, 0, 0], handL: [0, 0, 0] },
  kneel: { hipR: [-1.5, 0, 0], knR: [1.55, 0, 0], hipL: [0.2, 0, 0], knL: [2.25, 0, 0], spine: [0.15, 0, 0], neck: [0.25, 0, 0], bodyY: -0.5, shR: [-0.3, 0, -0.1], shL: [-0.2, 0, 0.2] },
  kneelBlade: { hipR: [-1.5, 0, 0], knR: [1.55, 0, 0], hipL: [0.2, 0, 0], knL: [2.25, 0, 0], spine: [0.25, 0, 0], neck: [0.4, 0, 0], bodyY: -0.5, shR: [-0.9, 0, -0.1], elR: [-0.6, 0, 0], shL: [-0.9, 0, 0.1], elL: [-0.6, 0, 0] },
  sit: { hipL: [-1.5, 0, 0.1], hipR: [-1.5, 0, -0.1], knL: [1.5, 0, 0], knR: [1.5, 0, 0], bodyY: -0.52, spine: [0.1, 0, 0], shL: [-0.5, 0, 0.1], shR: [-0.5, 0, -0.1], elL: [-0.8, 0, 0], elR: [-0.8, 0, 0] },
  cower: { hipR: [-1.4, 0, 0], knR: [1.8, 0, 0], hipL: [-1.3, 0, 0], knL: [1.9, 0, 0], spine: [0.7, 0, 0], neck: [0.5, 0, 0], shL: [-1.2, 0, 0.6], shR: [-1.2, 0, -0.6], elL: [-1.8, 0, 0], elR: [-1.8, 0, 0], bodyY: -0.55 },
  dead: { bodyRotX: -1.5, bodyY: -0.78, shL: [-0.4, 0, 1.3], shR: [-0.3, 0, -1.2], elL: [-0.4, 0, 0], elR: [-0.3, 0, 0], hipL: [-0.15, 0, 0.18], hipR: [-0.1, 0, -0.12], knL: [0.25, 0, 0], neck: [-0.3, 0, 0] },
  deadFront: { bodyRotX: 1.45, bodyY: -0.8, shL: [-2.6, 0, 0.5], shR: [-2.8, 0, -0.4], elL: [-0.3, 0, 0], hipL: [0.1, 0, 0.1], knR: [0.3, 0, 0], neck: [0.4, 0, 0] },
  lift: { spine: [0.85, 0, 0], chest: [0.2, 0, 0], hipL: [-0.75, 0, 0], knL: [1.1, 0, 0], hipR: [-0.3, 0, 0], knR: [1.3, 0, 0], bodyY: -0.35, shR: [-1.3, 0, 0], elR: [-0.3, 0, 0], shL: [-1.1, 0, 0.2] },
  raise: { shR: [-2.6, 0, -0.2], elR: [-0.4, 0, 0], chest: [-0.15, 0, 0], neck: [-0.25, 0, 0], shL: [-0.3, 0, 0.3] },
  point: { shR: [-1.55, 0.2, 0], elR: [-0.05, 0, 0] },
  armsCrossed: { shL: [-0.7, 0, 0.6], elL: [-2.0, 0, 0], shR: [-0.7, 0, -0.6], elR: [-2.0, 0, 0] },
  wristsOut: { shL: [-1.1, 0, -0.2], elL: [-0.4, 0, 0], shR: [-1.1, 0, 0.2], elR: [-0.4, 0, 0], neck: [0.2, 0, 0] },
  lying: { bodyRotX: -1.55, bodyY: -0.82, shL: [-0.1, 0, 0.2], shR: [-0.1, 0, -0.2], neck: [-0.1, 0, 0] },
  tank: { shL: [-0.1, 0, 0.15], shR: [-0.1, 0, -0.15], neck: [0.35, 0, 0], spine: [0.05, 0, 0], knL: [0.2, 0, 0], knR: [0.15, 0, 0] },
  wave: { shR: [-2.8, 0, -0.5], elR: [-0.6, 0, 0] },
  talk: { shR: [-0.6, 0, -0.2], elR: [-1.0, 0, 0] },
};

interface Mats {
  skin: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  cloth2: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
}

export class Rig {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly joints = {} as Record<J, THREE.Group>;
  readonly look: Look;
  weapon: WeaponModel | null = null;
  offWeapon: WeaponModel | null = null;
  weaponKind: WeaponKind = 'none';
  style: WeaponStyle = 'none';
  trail: Trail | null = null;
  private mats: Mats;
  private allMats: THREE.MeshStandardMaterial[] = [];
  private cur = new Map<string, number>();
  private cycle = 0;
  private time = Math.random() * 10;
  private flashT = 0;
  private flashColor = new THREE.Color();
  private cape: THREE.Mesh | null = null;
  private scarfTail: THREE.Mesh | null = null;
  readonly headTop: THREE.Object3D;
  private faceLine: THREE.Mesh | null = null;
  footstep: ((foot: 'L' | 'R') => void) | null = null;
  private lastStepSign = 0;

  constructor(look: Look) {
    this.look = look;
    const glass = !!look.glass;
    const m = (c: string, rough = 0.85, metal = 0.05) => {
      const mm = new THREE.MeshStandardMaterial({
        color: c,
        roughness: glass ? 0.1 : rough,
        metalness: glass ? 0.2 : metal,
        flatShading: true,
        transparent: glass,
        opacity: glass ? 0.55 : 1,
        emissive: glass ? new THREE.Color('#5a2f9a') : new THREE.Color(0),
        emissiveIntensity: glass ? 0.6 : 1,
      });
      this.allMats.push(mm);
      return mm;
    };
    this.mats = {
      skin: m(look.skin),
      cloth: m(look.cloth),
      cloth2: m(look.cloth2),
      armor: m(look.armor ?? look.cloth2, 0.45, 0.6),
      hair: m(look.hair, 0.95),
      dark: m('#2a211b'),
    };
    const M = this.mats;
    const b = look.build;

    this.root.add(this.body);
    this.body.position.y = 0.95;
    const mk = (name: J, parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    const mesh = (geo: THREE.BufferGeometry, mt: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
      const me = new THREE.Mesh(geo, mt);
      me.position.set(x, y, z);
      me.scale.set(sx, sy, sz);
      me.castShadow = true;
      me.receiveShadow = true;
      parent.add(me);
      return me;
    };

    const spine = mk('spine', this.body, 0, 0, 0);
    mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.2, 7), M.cloth2, spine, 0, 0.02, 0, b, 1, 0.75);
    mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.06, 7), M.dark, spine, 0, 0.13, 0, b * 1.02, 1, 0.78);
    const chest = mk('chest', spine, 0, 0.16, 0);
    mesh(new THREE.CylinderGeometry(0.2, 0.165, 0.34, 7), M.cloth, chest, 0, 0.16, 0, b, 1, 0.68);
    if (look.armor) mesh(new THREE.CylinderGeometry(0.215, 0.19, 0.22, 7), M.armor, chest, 0, 0.22, 0.005, b, 1, 0.7);
    if (look.pauldrons) {
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.1, 6, 4), M.armor, chest, s * 0.22 * b, 0.33, 0, 1.2, 0.7, 1);
    }
    if (look.robe) {
      const robe = mesh(new THREE.CylinderGeometry(0.2, 0.34, 0.85, 8, 1, true), m(look.robe), spine, 0, -0.38, 0, b, 1, 0.8);
      robe.material = (robe.material as THREE.MeshStandardMaterial).clone();
      (robe.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      this.allMats.push(robe.material as THREE.MeshStandardMaterial);
    }

    const neck = mk('neck', chest, 0, 0.36, 0);
    mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 6), M.skin, neck, 0, 0.03, 0);
    const head = mesh(new THREE.IcosahedronGeometry(0.125, 1), M.skin, neck, 0, 0.17, 0.01, 0.92, 1.1, 1);
    this.headTop = new THREE.Object3D();
    this.headTop.position.set(0, 0.34, 0);
    neck.add(this.headTop);
    if (!glass) {
      for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.025, 0.018, 0.01), M.dark, head, s * 0.045, 0.02, 0.118);
    }
    if (look.glass) {
      this.faceLine = mesh(new THREE.BoxGeometry(0.012, 0.22, 0.01), glow(PALETTE.violet, 3), head, 0, 0, 0.125);
    }
    if (look.facePaint) mesh(new THREE.BoxGeometry(0.24, 0.04, 0.02), glow('#f1efe8', 0.9), head, 0, 0.02, 0.105);
    if (look.glasses) {
      for (const s of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 10), M.dark, head, s * 0.045, 0.02, 0.125);
        ring.rotation.y = 0;
      }
    }
    if (look.beard) mesh(new THREE.BoxGeometry(0.16, 0.1, 0.08), m(look.beard), head, 0, -0.09, 0.07);
    this.buildHair(head, look, M.hair, mesh);
    if (look.helmet) {
      const hm = m(look.helmet, 0.4, 0.7);
      mesh(new THREE.SphereGeometry(0.145, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), hm, head, 0, 0.02, 0, 1, 1.05, 1.05);
      mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 10), hm, head, 0, 0.02, 0);
    }
    if (look.scarf) {
      const sm = m(look.scarf);
      mesh(new THREE.TorusGeometry(0.085, 0.04, 5, 10), sm, neck, 0, 0.0, 0, 1, 1, 1).rotation.x = Math.PI / 2;
      const tailGeo = new THREE.BoxGeometry(0.08, 0.36, 0.02);
      tailGeo.translate(0, -0.18, 0);
      this.scarfTail = mesh(tailGeo, sm, neck, 0.05, 0.0, -0.08);
    }
    if (look.rings) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI - Math.PI / 2;
        mesh(new THREE.TorusGeometry(0.018, 0.005, 4, 8), m('#d8b25a', 0.3, 0.9), chest, Math.sin(a) * 0.12, 0.3 - Math.cos(a) * 0.06, 0.13);
      }
    }
    if (look.cape) {
      const capeGeo = new THREE.PlaneGeometry(0.42 * b, 0.95, 1, 4);
      capeGeo.translate(0, -0.47, 0);
      const cm = m(look.cape);
      cm.side = THREE.DoubleSide;
      this.cape = mesh(capeGeo, cm, chest, 0, 0.33, -0.13);
    }
    if (look.kite) {
      const k = mesh(new THREE.BoxGeometry(0.34, 0.6, 0.04), m('#d9c7a1'), chest, 0, 0.12, -0.17);
      k.rotation.z = Math.PI / 4;
      const rib = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.01), m('#b8231c'), chest, 0.12, -0.15, -0.19);
      rib.rotation.z = 0.2;
    }

    for (const s of [-1, 1] as const) {
      const L = s < 0 ? 'L' : 'R';
      const sh = mk(('sh' + L) as J, chest, s * 0.21 * b, 0.3, 0);
      mesh(new THREE.CapsuleGeometry(0.055 * Math.sqrt(b), 0.2, 3, 6), M.cloth, sh, 0, -0.13, 0);
      const elb = mk(('el' + L) as J, sh, 0, -0.28, 0);
      mesh(new THREE.CapsuleGeometry(0.048 * Math.sqrt(b), 0.18, 3, 6), look.armor ? M.armor : M.skin, elb, 0, -0.12, 0);
      const hand = mk(('hand' + L) as J, elb, 0, -0.27, 0);
      mesh(new THREE.BoxGeometry(0.075, 0.09, 0.075), M.skin, hand, 0, -0.02, 0);
      if (L === 'L' && look.mark) {
        mesh(new THREE.BoxGeometry(0.085, 0.025, 0.085), glow(look.mark === 'blue' ? PALETTE.wheelBlue : '#8a8f99', look.mark === 'blue' ? 2.2 : 0.8), elb, 0, -0.22, 0);
      }
      const hip = mk(('hip' + L) as J, this.body, s * 0.095 * b, -0.04, 0);
      mesh(new THREE.CapsuleGeometry(0.075 * Math.sqrt(b), 0.3, 3, 6), M.cloth2, hip, 0, -0.21, 0);
      const knee = mk(('kn' + L) as J, hip, 0, -0.44, 0);
      mesh(new THREE.CapsuleGeometry(0.062 * Math.sqrt(b), 0.3, 3, 6), M.cloth2, knee, 0, -0.2, 0);
      mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), M.dark, knee, 0, -0.43, 0.04);
    }

    this.root.scale.setScalar(look.height);
    this.root.traverse((o) => (o.userData.rig = this));
  }

  private buildHair(head: THREE.Object3D, look: Look, hm: THREE.Material, mesh: (geo: THREE.BufferGeometry, mt: THREE.Material, parent: THREE.Object3D, x?: number, y?: number, z?: number, sx?: number, sy?: number, sz?: number) => THREE.Mesh) {
    if (look.helmet || look.hairStyle === 'bald') return;
    const cap = (scaleY: number) => mesh(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), hm, head, 0, 0.015, -0.01, 1, scaleY, 1.05);
    switch (look.hairStyle) {
      case 'shaved':
        cap(0.6);
        break;
      case 'cropped':
        cap(0.85);
        break;
      case 'short':
        cap(1.0);
        mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), hm, head, 0, -0.02, -0.09);
        break;
      case 'bun':
        cap(1.0);
        mesh(new THREE.SphereGeometry(0.06, 6, 5), hm, head, 0, 0.06, -0.15);
        break;
      case 'long':
        cap(1.0);
        mesh(new THREE.BoxGeometry(0.24, 0.32, 0.07), hm, head, 0, -0.12, -0.1);
        break;
      case 'braids':
        cap(0.95);
        for (const s of [-1, 1]) {
          const br = mesh(new THREE.CylinderGeometry(0.022, 0.018, 0.42, 5), hm, head, s * 0.06, -0.2, -0.11);
          br.rotation.x = 0.15;
        }
        break;
    }
  }

  setWeapon(kind: WeaponKind, off: WeaponKind = 'none') {
    if (this.weapon) this.joints.handR.remove(this.weapon.group);
    if (this.offWeapon) this.joints.handL.remove(this.offWeapon.group);
    this.weaponKind = kind;
    this.weapon = makeWeapon(kind);
    this.offWeapon = makeWeapon(off);
    if (this.weapon) {
      this.weapon.group.position.set(0, -0.05, 0.01);
      this.joints.handR.add(this.weapon.group);
      if (!this.trail) this.trail = new Trail(this.weapon.trailColor);
      else (this.trail.mesh.material as THREE.ShaderMaterial).uniforms.color.value.set(this.weapon.trailColor);
    }
    if (this.offWeapon) {
      this.offWeapon.group.position.set(0, -0.05, 0.01);
      this.joints.handL.add(this.offWeapon.group);
    }
    this.style =
      kind === 'spear' || kind === 'stillSpear'
        ? 'spear'
        : kind === 'axe'
          ? 'axes'
          : kind === 'bow'
            ? 'bow'
            : kind === 'hammer'
              ? 'hammer'
              : kind === 'none'
                ? 'none'
                : 'sword';
    if (kind === 'bow' && this.weapon) {
      // Bow lives in the left hand.
      this.joints.handR.remove(this.weapon.group);
      this.joints.handL.add(this.weapon.group);
    }
  }

  flash(color: string, dur = 0.12) {
    this.flashColor.set(color);
    this.flashT = dur;
  }

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  weaponWorldPoints(outBase: THREE.Vector3, outTip: THREE.Vector3) {
    if (!this.weapon) return false;
    outBase.copy(this.weapon.trailBase);
    outTip.copy(this.weapon.trailTip);
    this.weapon.group.localToWorld(outBase);
    this.weapon.group.localToWorld(outTip);
    return true;
  }

  private basePose(s: RigState): Pose {
    const amp = clamp(s.speed / 4.5, 0, 1.25);
    const c = this.cycle;
    const sn = Math.sin(c);
    const breathe = Math.sin(this.time * 1.8) * 0.025;
    const p: Pose = {
      hipL: [-sn * 0.7 * amp, 0, 0.02],
      hipR: [sn * 0.7 * amp, 0, -0.02],
      knL: [Math.max(0, Math.sin(c + 1.7)) * 1.1 * amp + 0.06, 0, 0],
      knR: [Math.max(0, Math.sin(c + Math.PI + 1.7)) * 1.1 * amp + 0.06, 0, 0],
      spine: [0.06 * amp + (amp > 1 ? 0.12 : 0), Math.sin(c) * 0.08 * amp, 0],
      chest: [breathe, Math.sin(c) * 0.12 * amp, 0],
      neck: [-0.04 * amp, 0, 0],
      shL: [sn * 0.55 * amp, 0, 0.12],
      elL: [-0.25 - 0.3 * amp, 0, 0],
      shR: [-sn * 0.55 * amp, 0, -0.12],
      elR: [-0.25 - 0.3 * amp, 0, 0],
      bodyY: Math.abs(Math.cos(c)) * 0.045 * amp - 0.02 * amp,
    };
    switch (this.style) {
      case 'sword':
        p.shR = [-0.35 - sn * 0.22 * amp, 0, -0.18];
        p.elR = [-0.75, 0, 0];
        p.handR = [0.2, 0, 0];
        break;
      case 'spear':
        p.shR = [-0.4 - sn * 0.15 * amp, 0, -0.15];
        p.elR = [-1.25, 0, 0];
        p.shL = [-0.85, 0, 0.35];
        p.elL = [-0.65, 0, 0];
        p.handR = [0.35, 0, 0];
        break;
      case 'axes':
        p.shR = [-0.3 - sn * 0.3 * amp, 0, -0.2];
        p.elR = [-0.9, 0, 0];
        p.shL = [-0.3 + sn * 0.3 * amp, 0, 0.2];
        p.elL = [-0.9, 0, 0];
        break;
      case 'hammer':
        p.shR = [-0.5, 0, -0.1];
        p.elR = [-1.1, 0, 0];
        p.shL = [-0.6, 0, 0.3];
        p.elL = [-1.0, 0, 0];
        p.handR = [0.6, 0, 0];
        break;
      case 'bow':
        p.shL = [-0.5, 0, 0.15];
        p.elL = [-0.4, 0, 0];
        break;
    }
    if (s.airborne) {
      p.hipL = [-0.6, 0, 0];
      p.knL = [1.0, 0, 0];
      p.hipR = [0.2, 0, 0];
      p.knR = [0.6, 0, 0];
    }
    return p;
  }

  private target(s: RigState): Pose {
    if (s.dead) return POSES[s.pose === 'deadFront' ? 'deadFront' : 'dead'];
    const base = this.basePose(s);
    let out: Pose = base;
    if (s.pose && POSES[s.pose]) {
      out = { ...base, ...POSES[s.pose] };
      if (s.pose === 'hum' || s.pose === 'talk' || s.pose === 'point' || s.pose === 'raise' || s.pose === 'wave') {
        out = { ...base, ...POSES[s.pose] };
      }
    }
    if (s.stagger) out = { ...base, ...POSES.stagger };
    if (s.block) out = { ...out, ...POSES.block };
    if (s.hum && !s.action) out = { ...out, ...POSES.hum };
    if (s.action && ACTIONS[s.action]) {
      const A = ACTIONS[s.action];
      const t = s.phaseT;
      if (s.phase === 'windup') out = mix(base, A.W, ease(t));
      else if (s.phase === 'active') out = mix(A.W, A.S, easeOut(t));
      else if (s.phase === 'hold') out = mix(base, A.S, 1);
      else if (s.phase === 'recover') out = mix(A.S, base, ease(t));
    }
    if (s.hit > 0) out = mix(out, { ...out, ...POSES.hit }, Math.min(1, s.hit * 3));
    if (s.roll >= 0) {
      const r = s.roll;
      out = {
        ...out,
        bodyRotX: r * Math.PI * 2,
        bodyY: -0.42 * Math.sin(Math.PI * r),
        hipL: [-1.5, 0, 0],
        hipR: [-1.4, 0, 0],
        knL: [2.0, 0, 0],
        knR: [2.0, 0, 0],
        chest: [0.5, 0, 0],
        spine: [0.4, 0, 0],
        shL: [-1.2, 0, 0.3],
        shR: [-1.2, 0, -0.3],
        elL: [-1.6, 0, 0],
        elR: [-1.6, 0, 0],
      };
    }
    return out;
  }

  update(dt: number, s: RigState) {
    this.time += dt;
    const stepRate = s.speed > 5 ? 1.25 : 1.75;
    this.cycle += dt * s.speed * stepRate;
    if (s.speed > 0.4 && !s.airborne && s.roll < 0 && !s.dead) {
      const sign = Math.sign(Math.sin(this.cycle));
      if (sign !== this.lastStepSign && sign !== 0) {
        this.footstep?.(sign > 0 ? 'L' : 'R');
        this.lastStepSign = sign;
      }
    } else if (s.speed < 0.2) {
      this.cycle = damp(this.cycle, Math.round(this.cycle / Math.PI) * Math.PI, 6, dt);
    }

    const tgt = this.target(s);
    const fast = s.action && (s.phase === 'active' || s.phase === 'windup');
    const lambda = s.roll >= 0 ? 60 : fast ? 32 : s.dead ? 7 : 14;
    for (const j of JOINTS) {
      const v = tgt[j] ?? [0, 0, 0];
      const jo = this.joints[j];
      for (let i = 0; i < 3; i++) {
        const key = j + i;
        const cur = this.cur.get(key) ?? 0;
        const nv = damp(cur, v[i], lambda, dt);
        this.cur.set(key, nv);
      }
      jo.rotation.set(this.cur.get(j + 0)!, this.cur.get(j + 1)!, this.cur.get(j + 2)!);
    }
    const bk = (k: string, v: number, l = lambda) => {
      const c = this.cur.get(k) ?? 0;
      const n = k === 'bodyRotX' && s.roll >= 0 ? v : damp(c, v, l, dt);
      this.cur.set(k, n);
      return n;
    };
    this.body.position.y = 0.95 + bk('bodyY', tgt.bodyY ?? 0);
    this.body.rotation.x = bk('bodyRotX', s.roll >= 0 ? (tgt.bodyRotX ?? 0) : (tgt.bodyRotX ?? 0) % (Math.PI * 2));
    if (s.roll < 0 && Math.abs(this.body.rotation.x) > Math.PI * 1.5) {
      this.cur.set('bodyRotX', 0);
      this.body.rotation.x = 0;
    }
    this.body.rotation.z = bk('bodyRotZ', tgt.bodyRotZ ?? 0);
    this.body.rotation.y = bk('bodyRotY', tgt.bodyRotY ?? 0);

    if (this.cape) this.cape.rotation.x = 0.12 + Math.min(0.9, s.speed * 0.12) + Math.sin(this.time * 3) * 0.04;
    if (this.scarfTail) this.scarfTail.rotation.x = 0.25 + Math.min(1.1, s.speed * 0.18) + Math.sin(this.time * 4.2) * 0.08;
    if (this.faceLine) (this.faceLine.scale.y = 0.85 + Math.sin(this.time * 2) * 0.15);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT) * 8;
      for (const mm of this.allMats) mm.emissive.copy(this.flashColor).multiplyScalar(k);
      if (this.flashT <= 0) for (const mm of this.allMats) mm.emissive.set(this.look.glass ? '#5a2f9a' : 0x000000);
    }

    if (this.trail && this.weapon) {
      this.weaponWorldPoints(this.tmpA, this.tmpB);
      this.trail.update(dt, this.tmpA, this.tmpB);
    }
  }

  setOpacity(o: number) {
    for (const mm of this.allMats) {
      mm.transparent = o < 1 || !!this.look.glass;
      mm.opacity = this.look.glass ? 0.55 * o : o;
      mm.depthWrite = o > 0.5;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.geometry) me.geometry.dispose();
    });
    for (const mm of this.allMats) mm.dispose();
    this.trail?.dispose();
  }
}

function mix(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = {};
  for (const j of JOINTS) {
    const va = a[j] ?? [0, 0, 0];
    const vb = b[j] ?? a[j] ?? [0, 0, 0];
    out[j] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t];
  }
  for (const k of ['bodyY', 'bodyRotX', 'bodyRotZ', 'bodyRotY'] as const) {
    const va = a[k] ?? 0;
    const vb = b[k] ?? a[k] ?? 0;
    out[k] = va + (vb - va) * t;
  }
  return out;
}
