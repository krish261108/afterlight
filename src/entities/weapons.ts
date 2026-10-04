import * as THREE from 'three';
import { mat, glow, PALETTE } from '../world/materials';

export type WeaponKind = 'conscript' | 'ashvow' | 'brokenSword' | 'spear' | 'stillSpear' | 'axe' | 'bow' | 'hammer' | 'sword' | 'knife' | 'none';

export interface WeaponModel {
  group: THREE.Group;
  /** Local points used for the swing trail (base and tip of the striking edge). */
  trailBase: THREE.Vector3;
  trailTip: THREE.Vector3;
  trailColor: string;
  glowParts: THREE.Mesh[];
}

/** Weapons are modelled with the grip at the origin and the business end along +Z. */
export function makeWeapon(kind: WeaponKind): WeaponModel | null {
  const g = new THREE.Group();
  const glowParts: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const steel = mat('#b9bcc4', { metal: 0.85, rough: 0.3 });
  const darkSteel = mat('#3b3f48', { metal: 0.8, rough: 0.35 });
  const leather = mat('#3a2a1e');
  const wood = mat(PALETTE.wood);
  let tip = new THREE.Vector3(0, 0, 1);
  let base = new THREE.Vector3(0, 0, 0.2);
  let trailColor = '#ffffff';

  switch (kind) {
    case 'none':
      return null;
    case 'conscript':
    case 'sword': {
      add(new THREE.BoxGeometry(0.035, 0.035, 0.18), leather, 0, 0, -0.02);
      add(new THREE.BoxGeometry(0.22, 0.04, 0.04), darkSteel, 0, 0, 0.09);
      const blade = new THREE.BoxGeometry(0.012, 0.06, 0.82);
      add(blade, kind === 'conscript' ? mat('#9a9ca2', { metal: 0.7, rough: 0.45 }) : steel, 0, 0, 0.52);
      add(new THREE.ConeGeometry(0.03, 0.1, 4), steel, 0, 0, 0.98).rotation.x = Math.PI / 2;
      base = new THREE.Vector3(0, 0, 0.2);
      tip = new THREE.Vector3(0, 0, 1.0);
      trailColor = '#dfe6ff';
      break;
    }
    case 'brokenSword': {
      add(new THREE.BoxGeometry(0.035, 0.035, 0.18), leather, 0, 0, -0.02);
      add(new THREE.BoxGeometry(0.22, 0.04, 0.04), darkSteel, 0, 0, 0.09);
      add(new THREE.BoxGeometry(0.012, 0.06, 0.26), mat('#9a9ca2', { metal: 0.7, rough: 0.45 }), 0, 0, 0.24);
      tip = new THREE.Vector3(0, 0, 0.36);
      break;
    }
    case 'ashvow': {
      // Black god-metal, a single violet vein down the blade.
      const black = mat('#120f17', { metal: 0.9, rough: 0.22 });
      add(new THREE.CylinderGeometry(0.024, 0.026, 0.26, 6).rotateX(Math.PI / 2), mat('#1d1824'), 0, 0, -0.05);
      add(new THREE.BoxGeometry(0.16, 0.035, 0.05), black, 0, 0, 0.1);
      add(new THREE.BoxGeometry(0.018, 0.075, 1.12), black, 0, 0, 0.7);
      const tipMesh = add(new THREE.ConeGeometry(0.04, 0.16, 4), black, 0, 0, 1.33);
      tipMesh.rotation.x = Math.PI / 2;
      const vein = add(new THREE.BoxGeometry(0.022, 0.012, 1.08), glow(PALETTE.violet, 3), 0, 0, 0.7);
      glowParts.push(vein);
      add(new THREE.SphereGeometry(0.03, 6, 4), glow(PALETTE.violet, 2), 0, 0, -0.19);
      base = new THREE.Vector3(0, 0, 0.25);
      tip = new THREE.Vector3(0, 0, 1.4);
      trailColor = '#b98cff';
      break;
    }
    case 'spear':
    case 'stillSpear': {
      add(new THREE.CylinderGeometry(0.022, 0.025, 2.3, 6).rotateX(Math.PI / 2), wood, 0, 0, 0.35);
      const head = add(new THREE.ConeGeometry(0.05, 0.32, 4), kind === 'stillSpear' ? mat('#e8ecf5', { metal: 0.6, rough: 0.3 }) : steel, 0, 0, 1.62);
      head.rotation.x = Math.PI / 2;
      if (kind === 'stillSpear') {
        const fire = add(new THREE.ConeGeometry(0.07, 0.5, 6), glow(PALETTE.stillfire, 2.4), 0, 0, 1.66);
        fire.rotation.x = Math.PI / 2;
        (fire.material as THREE.Material).transparent = true;
        glowParts.push(fire);
      }
      add(new THREE.BoxGeometry(0.06, 0.06, 0.08), leather, 0, 0, 1.44);
      base = new THREE.Vector3(0, 0, 1.1);
      tip = new THREE.Vector3(0, 0, 1.8);
      trailColor = kind === 'stillSpear' ? '#ffffff' : '#ffe9c9';
      break;
    }
    case 'axe': {
      add(new THREE.CylinderGeometry(0.02, 0.024, 0.7, 6).rotateX(Math.PI / 2), wood, 0, 0, 0.22);
      add(new THREE.BoxGeometry(0.02, 0.24, 0.18), steel, 0, 0.1, 0.52);
      const edge = add(new THREE.BoxGeometry(0.015, 0.08, 0.18), glow(PALETTE.stillfire, 1.4), 0, 0.24, 0.52);
      glowParts.push(edge);
      base = new THREE.Vector3(0, 0.15, 0.4);
      tip = new THREE.Vector3(0, 0.25, 0.6);
      trailColor = '#ffffff';
      break;
    }
    case 'hammer': {
      add(new THREE.CylinderGeometry(0.03, 0.035, 1.3, 6).rotateX(Math.PI / 2), wood, 0, 0, 0.45);
      add(new THREE.BoxGeometry(0.22, 0.22, 0.38), darkSteel, 0, 0, 1.1);
      base = new THREE.Vector3(0, 0, 0.8);
      tip = new THREE.Vector3(0, 0, 1.25);
      trailColor = '#ffd8a8';
      break;
    }
    case 'bow': {
      const curve = new THREE.TorusGeometry(0.55, 0.02, 4, 12, Math.PI * 0.9);
      const bow = add(curve, wood, 0, 0, 0.05);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2 + Math.PI * 0.05);
      add(new THREE.CylinderGeometry(0.004, 0.004, 1.05, 3), mat('#ddd'), 0, 0, -0.12);
      tip = new THREE.Vector3(0, 0, 0.5);
      break;
    }
    case 'knife': {
      add(new THREE.BoxGeometry(0.03, 0.03, 0.12), leather, 0, 0, 0);
      const k = add(new THREE.BoxGeometry(0.01, 0.04, 0.26), glow(PALETTE.stillfire, 1.6), 0, 0, 0.19);
      glowParts.push(k);
      tip = new THREE.Vector3(0, 0, 0.32);
      break;
    }
  }
  return { group: g, trailBase: base, trailTip: tip, trailColor, glowParts };
}

/** Additive ribbon that follows a weapon edge while swinging. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private pts: { a: THREE.Vector3; b: THREE.Vector3; t: number }[] = [];
  private pos: Float32Array;
  private alpha: Float32Array;
  private max = 18;
  active = false;
  private life = 0.16;

  constructor(color: string) {
    this.pos = new Float32Array(this.max * 2 * 3);
    this.alpha = new Float32Array(this.max * 2);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx: number[] = [];
    for (let i = 0; i < this.max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const c = new THREE.Color(color);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { color: { value: c } },
        vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 color; varying float vA; void main(){ gl_FragColor = vec4(color * vA * 1.6, vA); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  update(dt: number, base: THREE.Vector3, tip: THREE.Vector3) {
    for (const p of this.pts) p.t -= dt;
    this.pts = this.pts.filter((p) => p.t > 0);
    if (this.active) {
      this.pts.unshift({ a: base.clone(), b: tip.clone(), t: this.life });
      if (this.pts.length > this.max) this.pts.length = this.max;
    }
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      if (!p) {
        this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0;
        continue;
      }
      this.pos.set([p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z], i * 6);
      const al = i < n ? (p.t / this.life) * 0.55 : 0;
      this.alpha[i * 2] = al * 0.15;
      this.alpha[i * 2 + 1] = al;
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = n > 1;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
