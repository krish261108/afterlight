import * as THREE from 'three';
import type { Input } from './Input';
import type { World } from './World';
import type { Actor } from '../entities/Actor';
import { clamp, damp, dampAngle } from './util';

export class CameraRig {
  yaw = Math.PI;
  pitch = 0.28;
  dist = 4.8;
  private curDist = 4.8;
  private focus = new THREE.Vector3();
  private shakeAmt = 0;
  sensitivity = 1;
  invertY = false;
  mode: 'follow' | 'cinematic' = 'follow';
  private cinPos = new THREE.Vector3();
  private cinLook = new THREE.Vector3();
  private cinCurPos = new THREE.Vector3();
  private cinCurLook = new THREE.Vector3();
  private cinSpeed = 2;
  private lookTmp = new THREE.Vector3();
  readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  shake(a: number) {
    this.shakeAmt = Math.min(1, this.shakeAmt + a);
  }

  snapBehind(a: Actor) {
    this.yaw = a.facing;
    this.pitch = 0.28;
    this.focus.copy(a.pos).y += 1.55 * a.height;
    this.mode = 'follow';
  }

  /** Move the camera to a shot. speed controls how quickly it glides there (Infinity = cut). */
  shot(pos: THREE.Vector3, look: THREE.Vector3, speed = 2.5) {
    const wasCin = this.mode === 'cinematic';
    this.mode = 'cinematic';
    this.cinPos.copy(pos);
    this.cinLook.copy(look);
    this.cinSpeed = speed;
    if (!wasCin || speed === Infinity) {
      if (speed === Infinity) {
        this.cinCurPos.copy(pos);
        this.cinCurLook.copy(look);
      } else {
        this.cinCurPos.copy(this.camera.position);
        this.camera.getWorldDirection(this.lookTmp);
        this.cinCurLook.copy(this.camera.position).addScaledVector(this.lookTmp, 6);
      }
    }
  }

  release(player?: Actor) {
    if (this.mode === 'cinematic' && player) {
      const dx = player.pos.x - this.camera.position.x;
      const dz = player.pos.z - this.camera.position.z;
      this.yaw = Math.atan2(dx, dz);
    }
    this.mode = 'follow';
  }

  update(dt: number, player: Actor | null, lock: Actor | null, input: Input | null, world: World) {
    const cam = this.camera;
    if (this.mode === 'cinematic' || !player) {
      const k = this.cinSpeed === Infinity ? 1 : 1 - Math.exp(-this.cinSpeed * dt);
      this.cinCurPos.lerp(this.cinPos, k);
      this.cinCurLook.lerp(this.cinLook, k);
      cam.position.copy(this.cinCurPos);
      this.applyShake(dt);
      cam.lookAt(this.cinCurLook);
      return;
    }
    if (input) {
      const s = this.sensitivity;
      this.yaw -= input.lookDelta.x * 0.0026 * s;
      this.pitch += input.lookDelta.y * 0.0022 * s * (this.invertY ? -1 : 1);
      this.yaw -= input.lookStick.x * 2.6 * dt * s;
      this.pitch += input.lookStick.y * 1.7 * dt * s * (this.invertY ? -1 : 1);
    }
    const h = player.height;
    if (lock && lock.alive) {
      const want = Math.atan2(lock.pos.x - player.pos.x, lock.pos.z - player.pos.z);
      this.yaw = dampAngle(this.yaw, want, 7, dt);
      const d = player.distTo(lock);
      this.pitch = damp(this.pitch, clamp(0.32 - d * 0.01, 0.12, 0.32), 3, dt);
    }
    this.pitch = clamp(this.pitch, -0.45, 1.15);
    const target = this.lookTmp.copy(player.pos);
    target.y += 1.55 * h;
    this.focus.x = damp(this.focus.x, target.x, 14, dt);
    this.focus.z = damp(this.focus.z, target.z, 14, dt);
    this.focus.y = damp(this.focus.y, target.y, 8, dt);

    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const shoulder = 0.45 * h;
    const want = this.dist * (0.85 + h * 0.15);
    let allowed = want;
    for (let i = 1; i <= 12; i++) {
      const d = (want * i) / 12;
      const px = this.focus.x - dir.x * d + right.x * shoulder;
      const py = this.focus.y - dir.y * d;
      const pz = this.focus.z - dir.z * d + right.z * shoulder;
      if (world.pointBlocked(px, py, pz, 0.25) || py < world.terrain(px, pz) + 0.25) {
        allowed = Math.max(0.8, d - 0.35);
        break;
      }
    }
    this.curDist = allowed < this.curDist ? damp(this.curDist, allowed, 25, dt) : damp(this.curDist, allowed, 4, dt);
    cam.position.set(
      this.focus.x - dir.x * this.curDist + right.x * shoulder,
      this.focus.y - dir.y * this.curDist,
      this.focus.z - dir.z * this.curDist + right.z * shoulder,
    );
    this.applyShake(dt);
    const look = this.lookTmp.copy(this.focus).addScaledVector(right, shoulder);
    if (lock && lock.alive) {
      const lp = lock.pos.clone();
      lp.y += 1.2 * lock.height;
      look.lerp(lp, 0.3);
    }
    cam.lookAt(look);
  }

  private applyShake(dt: number) {
    if (this.shakeAmt <= 0.001) return;
    const s = this.shakeAmt * this.shakeAmt * 0.35;
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.position.z += (Math.random() - 0.5) * s;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.2);
  }
}
