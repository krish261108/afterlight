import * as THREE from 'three';
import { World } from '../core/World';
import { RNG, clamp } from '../core/util';
import { mat, glow, additive, PALETTE } from './materials';

export type Updater = (dt: number, t: number) => void;

interface BoxOpts {
  collide?: boolean;
  floor?: boolean;
  cast?: boolean;
  receive?: boolean;
}

let softTex: THREE.Texture | null = null;
export function softCircleTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

export class Builder {
  readonly group: THREE.Group;
  readonly world: World;
  readonly updaters: Updater[] = [];
  readonly rng: RNG;
  quality: 'low' | 'medium' | 'high';
  private terrainGrid: { size: number; seg: number; h: Float32Array; ox: number; oz: number } | null = null;

  constructor(group: THREE.Group, world: World, seed: number, quality: 'low' | 'medium' | 'high') {
    this.group = group;
    this.world = world;
    this.rng = new RNG(seed);
    this.quality = quality;
  }

  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.group): T {
    parent.add(o);
    return o;
  }

  /** Box with its base at y. */
  box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, rot = 0, o: BoxOpts = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rot;
    m.castShadow = o.cast ?? true;
    m.receiveShadow = o.receive ?? true;
    this.add(m);
    if (o.collide) this.world.addWall(x, z, w, d, y, y + h, rot);
    if (o.floor) this.world.addFloor(x, z, w, d, y + h, rot);
    return m;
  }

  cyl(rt: number, rb: number, h: number, material: THREE.Material, x: number, y: number, z: number, seg = 8, collide = false) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    if (collide) this.world.addWall(x, z, rb * 1.6, rb * 1.6, y, y + h);
    return m;
  }

  // ------------------------------------------------------------ terrain

  terrain(opts: {
    size: number;
    seg: number;
    cx?: number;
    cz?: number;
    height: (x: number, z: number) => number;
    color: (x: number, z: number, h: number) => THREE.Color;
  }) {
    const { size, seg } = opts;
    const ox = opts.cx ?? 0;
    const oz = opts.cz ?? 0;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const grid = new Float32Array((seg + 1) * (seg + 1));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox;
      const z = pos.getZ(i) + oz;
      const h = opts.height(x, z);
      pos.setY(i, h);
      pos.setX(i, x);
      pos.setZ(i, z);
      grid[i] = h;
      const c = opts.color(x, z, h);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true }),
    );
    m.receiveShadow = true;
    this.add(m);
    this.terrainGrid = { size, seg, h: grid, ox, oz };
    const tg = this.terrainGrid;
    this.world.terrain = (x, z) => {
      const half = tg.size / 2;
      if (Math.abs(x - tg.ox) > half || Math.abs(z - tg.oz) > half) return -50;
      const fx = ((x - tg.ox + half) / tg.size) * tg.seg;
      const fz = ((z - tg.oz + half) / tg.size) * tg.seg;
      const ix = clamp(Math.floor(fx), 0, tg.seg - 1);
      const iz = clamp(Math.floor(fz), 0, tg.seg - 1);
      const tx = clamp(fx - ix, 0, 1);
      const tz = clamp(fz - iz, 0, 1);
      const row = tg.seg + 1;
      const a = tg.h[iz * row + ix];
      const b = tg.h[iz * row + ix + 1];
      const c = tg.h[(iz + 1) * row + ix];
      const d = tg.h[(iz + 1) * row + ix + 1];
      // Match the plane's triangulation (a-c-b / c-d-b).
      if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
      return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
    };
    return m;
  }

  // ------------------------------------------------------------ water

  water(x: number, z: number, w: number, d: number, y: number, color: string, flowSpeed = 0.15, rot = 0) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = '#808080';
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 120; i++) {
      const lx = Math.random() * 128;
      const ly = Math.random() * 256;
      g.strokeStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.18})`;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(lx, ly);
      g.bezierCurveTo(lx + 6, ly + 12, lx - 6, ly + 24, lx + 2, ly + 30 + Math.random() * 30);
      g.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(w / 6, d / 6);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d, 1, 1),
      new THREE.MeshStandardMaterial({
        color,
        map: tex,
        roughness: 0.3,
        metalness: 0,
        transparent: true,
        opacity: 0.82,
        emissive: new THREE.Color(color).multiplyScalar(0.18),
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    this.add(m);
    this.updaters.push((dt) => {
      tex.offset.y += dt * flowSpeed;
    });
    return m;
  }

  // ------------------------------------------------------------ nature

  scatterGrass(count: number, area: (r: RNG) => [number, number] | null, colorA: string, colorB: string, scale = 1) {
    const n = Math.floor(count * (this.quality === 'high' ? 1 : this.quality === 'medium' ? 0.6 : 0.3));
    if (n <= 0) return;
    const blade = new THREE.ConeGeometry(0.05 * scale, 0.5 * scale, 3, 1);
    blade.translate(0, 0.25 * scale, 0);
    const m = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), n);
    const dummy = new THREE.Object3D();
    const ca = new THREE.Color(colorA);
    const cb = new THREE.Color(colorB);
    const tmp = new THREE.Color();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const p = area(this.rng);
      if (!p) continue;
      const [x, z] = p;
      dummy.position.set(x, this.world.terrain(x, z), z);
      dummy.rotation.set(this.rng.range(-0.3, 0.3), this.rng.range(0, Math.PI * 2), this.rng.range(-0.3, 0.3));
      dummy.scale.setScalar(this.rng.range(0.6, 1.5));
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      m.setColorAt(k, tmp.copy(ca).lerp(cb, this.rng.next()));
      k++;
    }
    m.count = k;
    m.receiveShadow = true;
    this.add(m);
  }

  scatterRocks(count: number, area: (r: RNG) => [number, number] | null, color: string, minS = 0.3, maxS = 1.4, collideAbove = 1.1) {
    const geo = new THREE.DodecahedronGeometry(1, 0);
    const m = new THREE.InstancedMesh(geo, mat(color), count);
    const dummy = new THREE.Object3D();
    let k = 0;
    for (let i = 0; i < count * 3 && k < count; i++) {
      const p = area(this.rng);
      if (!p) continue;
      const [x, z] = p;
      const s = this.rng.range(minS, maxS);
      dummy.position.set(x, this.world.terrain(x, z) + s * 0.3, z);
      dummy.rotation.set(this.rng.range(0, 3), this.rng.range(0, 3), this.rng.range(0, 3));
      dummy.scale.set(s * this.rng.range(0.8, 1.4), s * this.rng.range(0.6, 1), s * this.rng.range(0.8, 1.3));
      dummy.updateMatrix();
      m.setMatrixAt(k, dummy.matrix);
      if (s > collideAbove) this.world.addWall(x, z, s * 1.6, s * 1.6, -50, dummy.position.y + s * 0.6);
      k++;
    }
    m.count = k;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
  }

  scatterTrees(count: number, area: (r: RNG) => [number, number] | null, kind: 'pine' | 'round' | 'dead', leaf: string, trunk = PALETTE.woodDark) {
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    let leafGeo: THREE.BufferGeometry;
    if (kind === 'pine') {
      const parts = [0, 1, 2].map((i) => {
        const g = new THREE.ConeGeometry(1.5 - i * 0.35, 1.9, 7);
        g.translate(0, 2.2 + i * 1.05, 0);
        return g;
      });
      leafGeo = mergeGeos(parts);
    } else if (kind === 'round') {
      const g = new THREE.IcosahedronGeometry(1.5, 0);
      g.translate(0, 3.2, 0);
      leafGeo = g;
    } else {
      const parts = [0, 1, 2, 3].map((i) => {
        const g = new THREE.CylinderGeometry(0.03, 0.07, 1.4, 4);
        g.translate(0, 0.7, 0);
        g.rotateZ(0.7 * (i % 2 ? 1 : -1));
        g.rotateY(i * 1.6);
        g.translate(0, 1.6 + i * 0.25, 0);
        return g;
      });
      leafGeo = mergeGeos(parts);
    }
    const tm = new THREE.InstancedMesh(trunkGeo, mat(trunk), count);
    const lm = new THREE.InstancedMesh(leafGeo, mat(kind === 'dead' ? trunk : leaf), count);
    const dummy = new THREE.Object3D();
    const tmp = new THREE.Color();
    let k = 0;
    for (let i = 0; i < count * 3 && k < count; i++) {
      const p = area(this.rng);
      if (!p) continue;
      const [x, z] = p;
      const s = this.rng.range(0.8, 1.5);
      dummy.position.set(x, this.world.terrain(x, z) - 0.1, z);
      dummy.rotation.set(0, this.rng.range(0, Math.PI * 2), 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      tm.setMatrixAt(k, dummy.matrix);
      lm.setMatrixAt(k, dummy.matrix);
      lm.setColorAt(k, tmp.set(kind === 'dead' ? trunk : leaf).multiplyScalar(this.rng.range(0.8, 1.15)));
      this.world.addWall(x, z, 0.5 * s, 0.5 * s, -50, 50);
      k++;
    }
    tm.count = lm.count = k;
    for (const m of [tm, lm]) {
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
    }
  }

  // ------------------------------------------------------------ structures

  stoneWall(x0: number, z0: number, x1: number, z1: number, h: number, thick: number, material: THREE.Material, crenels = true, baseY?: number) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const y = baseY ?? Math.min(this.world.terrain(x0, z0), this.world.terrain(x1, z1)) - 0.5;
    this.box(thick, h + 0.5, len, material, cx, y, cz, rot, { collide: true });
    if (crenels) {
      const n = Math.floor(len / 1.4);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        if (i % 2) continue;
        this.box(thick * 1.05, 0.6, 0.7, material, cx + Math.sin(rot) * t * len, y + h + 0.5, cz + Math.cos(rot) * t * len, rot);
      }
    }
  }

  tower(x: number, z: number, w: number, h: number, material: THREE.Material, roof?: THREE.Material) {
    const y = this.world.terrain(x, z) - 0.5;
    this.box(w, h, w, material, x, y, z, 0, { collide: true });
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      this.box(w * 0.3, 0.8, 0.5, material, x + Math.sin(a) * (w / 2 - 0.25), y + h, z + Math.cos(a) * (w / 2 - 0.25), a);
    }
    if (roof) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, w * 0.9, 4), roof);
      r.position.set(x, y + h + 0.8 + w * 0.45, z);
      r.rotation.y = Math.PI / 4;
      r.castShadow = true;
      this.add(r);
    }
  }

  tent(x: number, z: number, s: number, color: string, rot = 0) {
    const y = this.world.terrain(x, z);
    const g = new THREE.ConeGeometry(1.6 * s, 2.4 * s, 6, 1, true);
    const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide }));
    m.position.set(x, y + 1.2 * s, z);
    m.rotation.y = rot;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    this.cyl(0.04, 0.04, 2.7 * s, mat(PALETTE.wood), x, y, z, 5);
    this.world.addWall(x, z, 2.2 * s, 2.2 * s, -10, y + 2.4 * s);
    return m;
  }

  crate(x: number, z: number, s = 1, rot = 0) {
    const y = this.world.terrain(x, z);
    return this.box(0.9 * s, 0.9 * s, 0.9 * s, mat(PALETTE.wood), x, y, z, rot, { collide: true });
  }

  barrel(x: number, z: number) {
    const y = this.world.terrain(x, z);
    return this.cyl(0.38, 0.34, 1, mat(PALETTE.woodDark), x, y, z, 8, true);
  }

  cart(x: number, z: number, rot: number) {
    const y = this.world.terrain(x, z);
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = rot;
    const wood = mat(PALETTE.wood);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 2.4), wood);
    bed.position.y = 0.7;
    g.add(bed);
    for (const sx of [-0.75, 0.75]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 2.4), wood);
      side.position.set(sx, 0.95, 0);
      g.add(side);
      for (const sz of [-0.7, 0.7]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10), mat(PALETTE.woodDark));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx * 1.05, 0.42, sz);
        g.add(wheel);
      }
    }
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    this.add(g);
    this.world.addWall(x, z, 1.6, 2.6, y - 1, y + 1.2, rot);
    return g;
  }

  /** Torch with flickering flame. Optionally casts real light (expensive; use sparingly). */
  torch(x: number, z: number, y?: number, color = '#ffa347', light = false, flameScale = 1) {
    const gy = y ?? this.world.terrain(x, z);
    if (y === undefined) this.cyl(0.05, 0.07, 1.8, mat(PALETTE.woodDark), x, gy, z, 5);
    const top = y === undefined ? gy + 1.85 : gy;
    return this.flame(x, top, z, color, light, flameScale);
  }

  flame(x: number, y: number, z: number, color: string, light = false, s = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 0.55 * s, 6), additive(color, 0.75));
    outer.position.y = 0.25 * s;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.08 * s, 0.32 * s, 6), glow('#fff4d0', 1.5));
    inner.position.y = 0.16 * s;
    g.add(outer, inner);
    let pl: THREE.PointLight | null = null;
    if (light && this.quality !== 'low') {
      pl = new THREE.PointLight(color, 28 * s, 11 * s, 2);
      pl.position.y = 0.4;
      g.add(pl);
    }
    this.add(g);
    const phase = Math.random() * 10;
    this.updaters.push((_dt, t) => {
      const f = 0.85 + Math.sin(t * 13 + phase) * 0.08 + Math.sin(t * 23 + phase * 2) * 0.06;
      outer.scale.set(1, f, 1);
      outer.rotation.y = t * 2 + phase;
      if (pl) pl.intensity = 28 * s * f;
    });
    return g;
  }

  banner(x: number, y: number, z: number, color: string, rot = 0, w = 1, h = 2.2) {
    const geo = new THREE.PlaneGeometry(w, h, 4, 8);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.rotation.y = rot;
    m.castShadow = true;
    this.add(m);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const base = Float32Array.from(pos.array as Float32Array);
    const phase = Math.random() * 5;
    this.updaters.push((_dt, t) => {
      for (let i = 0; i < pos.count; i++) {
        const by = base[i * 3 + 1];
        const k = -by / h;
        pos.setZ(i, Math.sin(t * 2.4 + by * 2 + phase) * 0.12 * k);
      }
      pos.needsUpdate = true;
    });
    return m;
  }

  /** A ramp mesh plus walkable floor, from (x0,y0,z0) to (x1,y1,z1). */
  ramp(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, width: number, material: THREE.Material, thickness = 0.4) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const rise = y1 - y0;
    const slope = Math.atan2(rise, len);
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, Math.hypot(len, rise)), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2 - thickness / 2, (z0 + z1) / 2);
    m.rotation.order = 'YXZ';
    m.rotation.y = rot;
    m.rotation.x = -slope;
    m.castShadow = true;
    m.receiveShadow = true;
    this.add(m);
    this.world.addFloor((x0 + x1) / 2, (z0 + z1) / 2, width, len, y0, rot, y1);
    return m;
  }

  /** Visual step blocks for stairs, with a single smooth ramp floor underneath for movement. */
  stairs(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, width: number, material: THREE.Material) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const steps = Math.max(2, Math.round((y1 - y0) / 0.28));
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const h = (y1 - y0) * ((i + 1) / steps);
      this.box(width, Math.max(0.05, h), len / steps + 0.02, material, x0 + dx * t, y0, z0 + dz * t, rot);
    }
    this.world.addFloor((x0 + x1) / 2, (z0 + z1) / 2, width, len, y0, rot, y1);
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}

export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let off = 0;
  for (const g of nonIndexed) {
    g.computeVertexNormals();
    pos.set(g.attributes.position.array as Float32Array, off * 3);
    nor.set(g.attributes.normal.array as Float32Array, off * 3);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
