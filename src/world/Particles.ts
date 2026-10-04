import * as THREE from 'three';
import { softCircleTexture } from './Builder';

/** Pooled additive point particles for sparks, embers, motes and blood-less hit flashes. */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private baseCol: Float32Array;
  private next = 0;
  private max: number;

  constructor(max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.baseCol = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { tex: { value: softCircleTexture() }, scale: { value: 300 } },
      vertexShader: /* glsl */ `
        attribute float size; varying vec3 vCol; uniform float scale;
        void main(){ vCol = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tex; varying vec3 vCol;
        void main(){ vec4 t = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(vCol * t.a, t.a); }`,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, m);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, life: number, size: number, gravity = 0, drag = 0) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.baseCol[i * 3] = color.r;
    this.baseCol[i * 3 + 1] = color.g;
    this.baseCol[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.grav[i] = gravity;
    this.drag[i] = drag;
  }

  private tv = new THREE.Vector3();
  private tc = new THREE.Color();

  burst(p: THREE.Vector3, count: number, color: string | THREE.Color, speed = 4, life = 0.5, size = 0.12, gravity = -9) {
    const c = typeof color === 'string' ? this.tc.set(color) : color;
    for (let i = 0; i < count; i++) {
      this.tv.set(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.emit(p, this.tv, c, life * (0.6 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.8), gravity, 1.5);
    }
  }

  ring(p: THREE.Vector3, count: number, color: string, radius: number, life = 0.6, size = 0.2) {
    const c = this.tc.set(color);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.tv.set(Math.sin(a) * radius, 0.4, Math.cos(a) * radius);
      this.emit(p, this.tv, c, life, size, 0, 2);
    }
  }

  update(dt: number) {
    const { pos, vel, life, maxLife, col, baseCol, grav, drag } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        pos[i * 3 + 1] = -9999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      const k = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= k;
      vel[i * 3 + 2] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k + grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = Math.min(1, life[i] / maxLife[i] * 2);
      col[i * 3] = baseCol[i * 3] * f;
      col[i * 3 + 1] = baseCol[i * 3 + 1] * f;
      col[i * 3 + 2] = baseCol[i * 3 + 2] * f;
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    for (let i = 0; i < this.max; i++) this.pos[i * 3 + 1] = -9999;
    this.col.fill(0);
  }
}

/** Weather that follows the camera: rain streaks or snow/ash flakes. */
export class Weather {
  readonly object: THREE.Object3D;
  private pos: Float32Array;
  private speed: Float32Array;
  private count: number;
  private kind: 'rain' | 'snow' | 'ash' | 'motes';
  private area = 30;
  wind = new THREE.Vector2(0, 0);

  constructor(kind: 'rain' | 'snow' | 'ash' | 'motes', count: number, color: string) {
    this.kind = kind;
    this.count = count;
    const geo = new THREE.BufferGeometry();
    if (kind === 'rain') {
      this.pos = new Float32Array(count * 6);
      this.speed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * this.area * 2;
        const y = Math.random() * 25;
        const z = (Math.random() - 0.5) * this.area * 2;
        this.pos.set([x, y, z, x, y - 0.6, z], i * 6);
        this.speed[i] = 22 + Math.random() * 10;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.object = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
      );
    } else {
      this.pos = new Float32Array(count * 3);
      this.speed = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        this.pos.set([(Math.random() - 0.5) * this.area * 2, Math.random() * 20, (Math.random() - 0.5) * this.area * 2], i * 3);
        this.speed[i] = kind === 'motes' ? 0.2 + Math.random() * 0.4 : 1 + Math.random() * 1.5;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.object = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          color,
          size: kind === 'motes' ? 0.12 : kind === 'ash' ? 0.08 : 0.1,
          map: softCircleTexture(),
          transparent: true,
          depthWrite: false,
          blending: kind === 'motes' ? THREE.AdditiveBlending : THREE.NormalBlending,
          opacity: kind === 'motes' ? 0.9 : 0.85,
        }),
      );
    }
    this.object.frustumCulled = false;
  }

  update(dt: number, center: THREE.Vector3, t: number) {
    const a = this.area;
    const p = this.pos;
    if (this.kind === 'rain') {
      for (let i = 0; i < this.count; i++) {
        const o = i * 6;
        const dy = this.speed[i] * dt;
        p[o + 1] -= dy;
        p[o + 4] -= dy;
        p[o] += this.wind.x * dt;
        p[o + 3] += this.wind.x * dt;
        if (p[o + 1] < center.y - 2) {
          const x = center.x + (Math.random() - 0.5) * a * 2;
          const z = center.z + (Math.random() - 0.5) * a * 2;
          const y = center.y + 15 + Math.random() * 10;
          p[o] = x;
          p[o + 1] = y;
          p[o + 2] = z;
          p[o + 3] = x - this.wind.x * 0.03;
          p[o + 4] = y - 0.7;
          p[o + 5] = z;
        }
      }
    } else {
      for (let i = 0; i < this.count; i++) {
        const o = i * 3;
        if (this.kind === 'motes') {
          p[o] += Math.sin(t * 0.5 + i) * 0.3 * dt;
          p[o + 1] += this.speed[i] * dt * 0.5;
          p[o + 2] += Math.cos(t * 0.4 + i * 1.3) * 0.3 * dt;
        } else {
          p[o] += (Math.sin(t + i) * 0.5 + this.wind.x) * dt;
          p[o + 1] -= this.speed[i] * dt;
          p[o + 2] += (Math.cos(t * 0.7 + i) * 0.5 + this.wind.y) * dt;
        }
        const dx = p[o] - center.x;
        const dz = p[o + 2] - center.z;
        if (p[o + 1] < center.y - 3 || p[o + 1] > center.y + 22 || Math.abs(dx) > a || Math.abs(dz) > a) {
          p[o] = center.x + (Math.random() - 0.5) * a * 2;
          p[o + 2] = center.z + (Math.random() - 0.5) * a * 2;
          p[o + 1] = this.kind === 'motes' ? center.y - 1 + Math.random() * 6 : center.y + 12 + Math.random() * 8;
        }
      }
    }
    ((this.object as THREE.Points).geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
