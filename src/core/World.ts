import * as THREE from 'three';

/** A walkable surface: an oriented rectangle that is flat or a ramp along its local Z axis. */
export interface Floor {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rot: number;
  y0: number;
  y1: number;
}

/** A blocking volume: an oriented rectangle extruded between yMin and yMax. */
export interface Wall {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  rot: number;
  yMin: number;
  yMax: number;
}

const STEP_UP = 0.55;

export class World {
  floors: Floor[] = [];
  walls: Wall[] = [];
  terrain: (x: number, z: number) => number = () => 0;
  /** Circular play area; actors are kept inside it. */
  boundsCenter = new THREE.Vector2(0, 0);
  boundsRadius = 200;
  killY = -30;

  addFloor(cx: number, cz: number, w: number, d: number, y: number, rot = 0, y1?: number) {
    this.floors.push({ cx, cz, hw: w / 2, hd: d / 2, rot, y0: y, y1: y1 ?? y });
  }

  addWall(cx: number, cz: number, w: number, d: number, yMin: number, yMax: number, rot = 0) {
    this.walls.push({ cx, cz, hw: w / 2, hd: d / 2, rot, yMin, yMax });
  }

  private local(r: { cx: number; cz: number; rot: number }, x: number, z: number) {
    const dx = x - r.cx;
    const dz = z - r.cz;
    const c = Math.cos(-r.rot);
    const s = Math.sin(-r.rot);
    return { lx: dx * c + dz * s, lz: -dx * s + dz * c };
  }

  floorHeightAt(f: Floor, x: number, z: number): number | null {
    const { lx, lz } = this.local(f, x, z);
    if (Math.abs(lx) > f.hw || Math.abs(lz) > f.hd) return null;
    if (f.y0 === f.y1) return f.y0;
    const t = (lz + f.hd) / (2 * f.hd);
    return f.y0 + (f.y1 - f.y0) * t;
  }

  /** Highest walkable surface at (x,z) that an actor standing at height y can reach. */
  groundAt(x: number, z: number, y: number): number {
    let best = this.terrain(x, z);
    for (const f of this.floors) {
      const h = this.floorHeightAt(f, x, z);
      if (h !== null && h <= y + STEP_UP && h > best) best = h;
    }
    return best;
  }

  /** Pushes a circle out of walls. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number, bounded = true) {
    for (const w of this.walls) {
      if (pos.y + 1.6 < w.yMin || pos.y > w.yMax - 0.05) continue;
      const { lx, lz } = this.local(w, pos.x, pos.z);
      const cx = Math.max(-w.hw, Math.min(w.hw, lx));
      const cz = Math.max(-w.hd, Math.min(w.hd, lz));
      let nx = lx - cx;
      let nz = lz - cz;
      let d = Math.hypot(nx, nz);
      let push = 0;
      if (d < 1e-5) {
        // Centre is inside the box: escape along the shallowest axis.
        const px = w.hw - Math.abs(lx);
        const pz = w.hd - Math.abs(lz);
        if (px < pz) {
          nx = Math.sign(lx) || 1;
          nz = 0;
          push = px + radius;
        } else {
          nx = 0;
          nz = Math.sign(lz) || 1;
          push = pz + radius;
        }
        d = 1;
      } else if (d < radius) {
        push = radius - d;
        nx /= d;
        nz /= d;
      } else continue;
      const c = Math.cos(w.rot);
      const s = Math.sin(w.rot);
      const wx = nx * c + nz * s;
      const wz = -nx * s + nz * c;
      pos.x += wx * push;
      pos.z += wz * push;
    }
    if (!bounded) return;
    const dx = pos.x - this.boundsCenter.x;
    const dz = pos.z - this.boundsCenter.y;
    const d = Math.hypot(dx, dz);
    if (d > this.boundsRadius - radius) {
      const k = (this.boundsRadius - radius) / d;
      pos.x = this.boundsCenter.x + dx * k;
      pos.z = this.boundsCenter.y + dz * k;
    }
  }

  /** True if a point is inside any wall volume. Used to keep the camera out of geometry. */
  pointBlocked(x: number, y: number, z: number, pad = 0.2) {
    for (const w of this.walls) {
      if (y < w.yMin - pad || y > w.yMax + pad) continue;
      const { lx, lz } = this.local(w, x, z);
      if (Math.abs(lx) < w.hw + pad && Math.abs(lz) < w.hd + pad) return true;
    }
    return false;
  }

  clear() {
    this.floors.length = 0;
    this.walls.length = 0;
    this.terrain = () => 0;
    this.boundsCenter.set(0, 0);
    this.boundsRadius = 200;
    this.killY = -30;
  }
}
