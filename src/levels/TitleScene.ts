import * as THREE from 'three';
import { World } from '../core/World';
import { Builder } from '../world/Builder';
import { mat, glow, PALETTE } from '../world/materials';
import { Weather } from '../world/Particles';
import { fbm } from '../core/util';
import type { LightingPreset } from '../core/Engine';

export const TITLE_LIGHT: LightingPreset = {
  sky: ['#120d22', '#4a3466', '#c98a6a'],
  fog: '#3b2d4d',
  fogDensity: 0.03,
  sun: '#ffc79a',
  sunIntensity: 1.2,
  sunDir: [-0.6, 0.12, -1],
  ambient: '#8a74b0',
  ambientIntensity: 0.55,
  hemiGround: '#1d1424',
  exposure: 1.05,
  bloom: 0.9,
  suns: 2,
};

/** A quiet riverbank at dusk with a black blade standing in the silt. */
export class TitleScene {
  readonly group = new THREE.Group();
  private world = new World();
  private builder: Builder;
  private motes: Weather;
  private t = 0;

  constructor(quality: 'low' | 'medium' | 'high') {
    this.builder = new Builder(this.group, this.world, 77, quality);
    const b = this.builder;
    b.terrain({
      size: 140,
      seg: 70,
      height: (x, z) => {
        const river = Math.exp(-((x * 0.12) ** 2)) * 2.2;
        return fbm(x * 0.04, z * 0.04) * 3 - river + Math.abs(x) * 0.05;
      },
      color: (x, z, h) => {
        const c = new THREE.Color(h < -0.8 ? '#3a3026' : '#3f4a2c');
        return c.lerp(new THREE.Color('#5a5a3a'), fbm(x * 0.2, z * 0.2) * 0.6);
      },
    });
    b.water(0, 0, 14, 140, -1.0, '#4a3b2a', 0.08);
    // The bridge, far off.
    const stone = mat(PALETTE.stone);
    b.box(3.2, 0.5, 18, stone, 0, 0.2, -26, Math.PI / 2);
    for (const x of [-6, 0, 6]) b.box(1.2, 2.2, 1.6, stone, x, -1.5, -26);
    for (const s of [-1, 1]) b.box(18, 0.6, 0.3, stone, 0, 0.7, -26 + s * 1.5);
    // The blade in the silt.
    const blade = new THREE.Group();
    const black = mat('#120f17', { metal: 0.9, rough: 0.2 });
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.1), black);
    bl.position.y = 0.6;
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.3, 0.02), glow(PALETTE.violet, 3));
    vein.position.y = 0.62;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.06), black);
    guard.position.y = 1.34;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), mat('#1d1824'));
    grip.position.y = 1.5;
    blade.add(bl, vein, guard, grip);
    blade.position.set(3.4, -0.85, 4);
    blade.rotation.z = 0.12;
    blade.rotation.x = -0.08;
    this.group.add(blade);
    const pl = new THREE.PointLight('#b98cff', 14, 9, 2);
    pl.position.set(3.4, 0.3, 4);
    this.group.add(pl);
    b.scatterGrass(1500, (r) => {
      const x = r.range(-50, 50);
      const z = r.range(-50, 50);
      return Math.abs(x) < 6 ? null : [x, z];
    }, '#4d5a33', '#7a7a48');
    b.scatterTrees(40, (r) => {
      const x = r.range(-60, 60);
      const z = r.range(-60, 20);
      return Math.abs(x) < 12 ? null : [x, z];
    }, 'pine', '#2a3a2a');
    b.scatterRocks(30, (r) => [r.range(-8, 8), r.range(-30, 30)], '#5a5248', 0.2, 0.8, 99);
    this.motes = new Weather('motes', quality === 'low' ? 60 : 180, '#c9a6ff');
    this.group.add(this.motes.object);
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    this.t += dt;
    const a = this.t * 0.04;
    camera.position.set(3.4 + Math.sin(a) * 7, 1.2 + Math.sin(this.t * 0.2) * 0.2, 4 + Math.cos(a) * 7 + 2);
    camera.lookAt(3.4, 0.2, 2);
    for (const u of this.builder.updaters) u(dt, this.t);
    this.motes.update(dt, new THREE.Vector3(3.4, -1, 4), this.t);
  }

  dispose() {
    this.builder.dispose();
  }
}
