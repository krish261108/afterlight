import * as THREE from 'three';
import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Wall } from '../core/World';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { Actor } from '../entities/Actor';
import type { Fighter, FighterType } from '../entities/Fighter';
import type { Game } from '../Game';
import { LOOKS, halvethAlly, halvethLook, reachSpear, reachAxe, reachArcher, reachElite, reachBrute, sauvirBoss, reachLook } from '../entities/roster';
import { mat, glow, PALETTE } from '../world/materials';
import { fbm, rand } from '../core/util';

const ORDER = ['start', 'gate', 'courtyard', 'tower', 'duel', 'foundry', 'night'];
const TX = 14;
const TZ = 162;
const TOP = 22;
const SR = 7.2;

const DUSK: LightingPreset = {
  sky: ['#1f2440', '#6a4e66', '#c47a58'],
  fog: '#5a4652',
  fogDensity: 0.012,
  sun: '#ffb27a',
  sunIntensity: 1.9,
  sunDir: [-0.3, 0.32, -0.9],
  ambient: '#a49ab8',
  ambientIntensity: 0.9,
  hemiGround: '#3a2a26',
  exposure: 1.05,
  bloom: 0.7,
  suns: 2,
};

const STORM: LightingPreset = {
  sky: ['#151a30', '#3a3e56', '#5a5466'],
  fog: '#34364a',
  fogDensity: 0.016,
  sun: '#b4bee6',
  sunIntensity: 1.3,
  sunDir: [0.3, 0.7, 0.4],
  ambient: '#9aa2c8',
  ambientIntensity: 1.15,
  hemiGround: '#2a2a36',
  exposure: 1.25,
  bloom: 0.85,
  suns: 1,
};

const NIGHT: LightingPreset = {
  sky: ['#070914', '#1a2240', '#30324a'],
  fog: '#1a1e34',
  fogDensity: 0.017,
  sun: '#9aaad8',
  sunIntensity: 0.8,
  sunDir: [0.2, 0.8, 0.5],
  ambient: '#6a74a6',
  ambientIntensity: 1.0,
  hemiGround: '#0c0c14',
  exposure: 1.15,
  bloom: 0.95,
  suns: 1,
};

export class Chapter2 extends Level {
  readonly index = 2;
  readonly title = 'The Litany Gate';
  readonly lighting = DUSK;
  readonly ambient = { wind: 0.35, battle: 0.3 };
  private temple: THREE.Group | null = null;
  private templeLegs: THREE.Mesh[] = [];
  private templeZ = -40;
  private templeTarget = -40;
  private gateLeaves: THREE.Mesh[] = [];
  private gateWall: Wall | null = null;
  private bell: THREE.Mesh | null = null;
  private bellWall: Wall | null = null;
  private storm = false;
  private lightningT = 4;
  private rain: import('../world/Particles').Weather | null = null;
  private mira: Fighter | null = null;
  private pell: Fighter | null = null;
  private allies: Fighter[] = [];

  constructor(game: Game) {
    super(game);
  }

  protected build() {
    const b = this.builder;
    const canyonHalf = (z: number) => 12 + Math.sin(z * 0.05) * 2;
    b.terrain({
      size: 300,
      seg: 120,
      cz: 80,
      height: (x, z) => {
        if (z > 126 && z < 184 && Math.abs(x) < 30) return 0;
        const half = z < 124 ? canyonHalf(z) : 30;
        const d = Math.abs(x) - half;
        let h = fbm(x * 0.05, z * 0.05) * 1.2;
        if (d > 0) h += Math.min(28, d * 3.2) + fbm(x * 0.1, z * 0.1) * 6;
        if (z >= 124 && z <= 184) h = Math.max(h, (Math.abs(x) - 30) * 3);
        if (z > 184) h += Math.min(30, (z - 184) * 3);
        return h;
      },
      color: (x, z, h) => {
        if (h > 3) return new THREE.Color('#6e5a4a').lerp(new THREE.Color('#8a7660'), fbm(x * 0.2, z * 0.2));
        if (z > 126 && z < 184) return new THREE.Color('#7a7064').lerp(new THREE.Color('#8e8476'), fbm(x * 0.4, z * 0.4));
        return new THREE.Color('#7a6650').lerp(new THREE.Color('#5e5a40'), fbm(x * 0.15, z * 0.15) * 0.8);
      },
    });
    // Canyon walls (invisible collision following the cliffs).
    for (let z = -60; z < 124; z += 6) {
      const h = canyonHalf(z + 3);
      this.world.addWall(-h - 1.2, z + 3, 2, 6.4, -10, 60);
      this.world.addWall(h + 1.2, z + 3, 2, 6.4, -10, 60);
    }
    this.world.addWall(0, -62, 40, 2, -10, 60);
    this.world.addWall(-31, 155, 2, 60, -10, 60);
    this.world.addWall(31, 155, 2, 60, -10, 60);
    this.world.addWall(0, 185, 64, 2, -10, 60);

    const stone = mat(PALETTE.stone);
    const dark = mat(PALETTE.stoneDark);
    const cliff = mat('#6a5a4c');

    // The Litany Gate: a fortress gate carved into the cliff, under a thousand-year-old inscription.
    b.box(32, 30, 4, cliff, -21, -1, 125, 0, { collide: true });
    b.box(32, 30, 4, cliff, 21, -1, 125, 0, { collide: true });
    b.box(10, 14, 4, cliff, 0, 15, 125);
    for (let row = 0; row < 7; row++) {
      for (let i = 0; i < 18; i++) {
        if (Math.random() < 0.25) continue;
        const x = -26 + i * 3 + (row % 2) * 1.4;
        if (Math.abs(x) < 6 && row < 3) continue;
        const g = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random() * 1.4, 0.12, 0.05), glow('#e3bf74', 0.55));
        g.position.set(x, 18 + row * 1.3, 122.9);
        this.group.add(g);
      }
    }
    for (const s of [-1, 1]) {
      const leaf = b.box(5, 13, 0.7, mat(PALETTE.woodDark), s * 2.5, 0, 124.2);
      this.gateLeaves.push(leaf);
    }
    this.world.addWall(0, 124.2, 10, 1.2, -1, 13);
    this.gateWall = this.world.walls[this.world.walls.length - 1];
    b.tower(-9, 120, 5, 16, dark);
    b.tower(9, 120, 5, 16, dark);

    // Barricades and siege debris along the canyon road.
    for (const [x, z, r] of [
      [-5, 40, 0.3],
      [6, 48, -0.2],
      [-3, 70, 0.1],
      [5, 78, -0.4],
      [0, 96, 0],
    ]) {
      b.box(4, 1.4, 0.6, mat(PALETTE.wood), x, b.world.terrain(x, z) - 0.1, z, r, { collide: true });
      for (let i = 0; i < 3; i++) {
        const st = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.6, 4), mat(PALETTE.woodDark));
        st.position.set(x - 1.4 + i * 1.4, b.world.terrain(x, z) + 1.4, z - 0.4);
        st.rotation.x = -0.6;
        this.group.add(st);
      }
    }
    b.cart(-7, 20, 0.5);
    b.cart(8, 88, -0.8);
    for (const [x, z] of [
      [-8, 30],
      [8, 30],
      [-8, 60],
      [8, 62],
      [-6, 110],
      [6, 110],
    ])
      b.torch(x, z, undefined, '#ffa347', false);
    b.scatterRocks(60, (r) => [r.range(-12, 12), r.range(-50, 120)], '#7a6a58', 0.2, 1.1, 0.9);

    // The walking temple: a Halveth siege engine on four stone legs.
    const temple = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 9), mat('#8d8577'));
    body.position.y = 11;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 5, 4), mat('#4a4f5a', { metal: 0.4 }));
    roof.position.y = 16.5;
    roof.rotation.y = Math.PI / 4;
    const ram = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 9, 8).rotateX(Math.PI / 2), mat('#3b3f48', { metal: 0.7 }));
    ram.position.set(0, 8.5, 6);
    const wheelGlyph = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.18, 6, 24), glow(PALETTE.wheelBlue, 1.8));
    wheelGlyph.position.set(0, 11.5, 4.55);
    temple.add(body, roof, ram, wheelGlyph);
    for (const [x, z] of [
      [-3.6, -3.6],
      [3.6, -3.6],
      [-3.6, 3.6],
      [3.6, 3.6],
    ]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 9, 8), mat('#6d6558'));
      leg.position.set(x, 4.5, z);
      temple.add(leg);
      this.templeLegs.push(leg);
    }
    temple.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    b.banner(0, 15, -4.6, '#3f4a66', Math.PI, 3, 6);
    this.group.add(temple);
    this.temple = temple;

    // Courtyard: stores, carts, the foundry and the bell tower.
    b.box(10, 4, 7, stone, -20, 0, 140, 0, { collide: true });
    b.box(11, 0.5, 8, mat('#5a3a2a'), -20, 4, 140);
    b.box(9, 3.5, 6, stone, 21, 0, 136, 0.1, { collide: true });
    for (const [x, z] of [
      [-12, 134],
      [10, 145],
      [-5, 176],
      [22, 176],
    ])
      b.crate(x, z, 1.1, Math.random());
    // Foundry: three walls and a roof, molten bronze glowing inside.
    const FX = -14;
    const FZ = 166;
    b.box(12, 6, 0.8, dark, FX, 0, FZ + 5, 0, { collide: true });
    b.box(0.8, 6, 10, dark, FX - 6, 0, FZ, 0, { collide: true });
    b.box(0.8, 6, 10, dark, FX + 6, 0, FZ, 0, { collide: true });
    b.box(13, 0.6, 11, mat('#3a2a22'), FX, 6, FZ);
    b.cyl(1.4, 1.2, 1.0, mat('#3b3f48', { metal: 0.6 }), FX, 0, FZ + 2, 12, true);
    const molten = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.1, 16), glow('#ff8a2a', 2.2));
    molten.position.set(FX, 1.0, FZ + 2);
    this.group.add(molten);
    const fl = new THREE.PointLight('#ff8a3a', 14, 16, 2);
    fl.position.set(FX, 2.5, FZ + 1);
    this.group.add(fl);
    for (let i = 0; i < 4; i++) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 4), mat('#2a2a2a', { metal: 0.7 }));
      chain.position.set(FX - 3 + i * 2, 4, FZ - 1);
      this.group.add(chain);
    }

    // The bell tower, climbed by a wooden scaffold stair that winds twice around it.
    b.box(6, TOP, 6, stone, TX, 0, TZ, 0, { collide: true });
    for (let k = 1; k < 4; k++) b.box(6.4, 0.3, 6.4, dark, TX, (TOP / 4) * k, TZ);
    const R = SR;
    const corners = [
      [TX - R, TZ - R],
      [TX + R, TZ - R],
      [TX + R, TZ + R],
      [TX - R, TZ + R],
    ];
    const H = TOP / 8;
    const plank = mat('#7a5a3a');
    const beam = mat(PALETTE.woodDark);
    for (const [cx, cz] of corners) b.cyl(0.18, 0.22, TOP + 1, beam, cx, -0.5, cz, 6);
    for (let k = 1; k <= 8; k++) {
      const [cx, cz] = corners[k % 4];
      const y = k * H;
      b.box(2.4, 0.3, 2.4, plank, cx, y - 0.3, cz, 0, { floor: true });
      const ix = Math.sign(TX - cx);
      const iz = Math.sign(TZ - cz);
      if (k < 8) {
        this.world.addWall(cx + ix * 1.35, cz, 0.3, 2.4, y - 0.4, y + 1.3);
        this.world.addWall(cx, cz + iz * 1.35, 2.4, 0.3, y - 0.4, y + 1.3);
      }
      // Outer corner rails.
      this.world.addWall(cx - ix * 1.35, cz, 0.3, 2.7, y - 0.4, y + 1.3);
      this.world.addWall(cx, cz - iz * 1.35, 2.7, 0.3, y - 0.4, y + 1.3);
      // Struts from the tower to the landing.
      b.box(Math.abs(cx - TX) * 2 - 6, 0.25, 0.3, beam, (cx + TX) / 2, y - 0.6, cz);
    }
    for (let k = 0; k < 8; k++) {
      const [ax, az] = corners[k % 4];
      const [bx, bz] = corners[(k + 1) % 4];
      const dx = Math.sign(bx - ax);
      const dz = Math.sign(bz - az);
      const y0 = k * H;
      const y1 = (k + 1) * H;
      b.ramp(ax + dx * 1.2, y0, az + dz * 1.2, bx - dx * 1.2, y1, bz - dz * 1.2, 2.2, plank, 0.3);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const nx = Math.sign(mx - TX);
      const nz = Math.sign(mz - TZ);
      const span = 2 * R - 2.4;
      const along = dx !== 0;
      const lo = k === 0 ? 0.9 : y0 - 0.4;
      // Rails on both sides of the ramp so nobody walks off into the drop.
      this.world.addWall(mx + (along ? 0 : nx * 1.25), mz + (along ? nz * 1.25 : 0), along ? span : 0.3, along ? 0.3 : span, lo, y1 + 1.3);
      this.world.addWall(mx - (along ? 0 : nx * 1.25), mz - (along ? nz * 1.25 : 0), along ? span : 0.3, along ? 0.3 : span, k === 0 ? 0.9 : y0 - 0.4, y1 + 1.3);
      b.ramp(ax + dx * 1.2 + (along ? 0 : nx * 1.15), y0 + 0.9, az + dz * 1.2 + (along ? nz * 1.15 : 0), bx - dx * 1.2 + (along ? 0 : nx * 1.15), y1 + 0.9, bz - dz * 1.2 + (along ? nz * 1.15 : 0), 0.14, beam, 0.12);
    }
    // The roof: where Sauvir waits. The stair arrives at its south-west corner.
    b.box(12, 0.6, 12, dark, TX, TOP - 0.6, TZ, 0, { floor: true });
    b.box(3.4, 0.3, 3.4, plank, TX - 6.4, TOP - 0.3, TZ - 6.4, 0, { floor: true });
    this.world.addWall(TX - 5.6, TZ - 8.25, 3.2, 0.3, TOP - 0.4, TOP + 1.3);
    this.world.addWall(TX - 8.25, TZ - 5.6, 0.3, 3.2, TOP - 0.4, TOP + 1.3);
    b.box(10, 1.0, 0.4, stone, TX + 1, TOP, TZ - 6, 0, { collide: true });
    b.box(0.4, 1.0, 10, stone, TX - 6, TOP, TZ + 1, 0, { collide: true });
    b.box(12, 1.0, 0.4, stone, TX, TOP, TZ + 6, 0, { collide: true });
    b.box(0.4, 1.0, 12, stone, TX + 6, TOP, TZ, 0, { collide: true });
    for (const s of [-1, 1]) b.box(0.5, 5, 0.5, mat(PALETTE.woodDark), TX + s * 3, TOP, TZ + 2, 0, { collide: true });
    b.box(7, 0.5, 0.5, mat(PALETTE.woodDark), TX, TOP + 5, TZ + 2);
    const bronze = mat('#a07a3a', { metal: 0.8, rough: 0.35 });
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.3, 2.0, 14, 1, true), bronze);
    bell.position.set(TX + 1.6, TOP + 3.6, TZ + 2);
    (bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    bell.castShadow = true;
    this.group.add(bell);
    this.bell = bell;
    const bell2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.9, 1.4, 12, 1, true), bronze);
    bell2.position.set(TX - 1.6, TOP + 3.9, TZ + 2);
    this.group.add(bell2);
    // The cart where they will lay the boy, and its torches.
    b.cart(2, 156, 0.3);
    this.world.addFloor(2, 156, 1.4, 2.4, 0.78, 0.3);
    b.torch(-1, 154, undefined, '#ffa347', true);
    b.torch(5, 158, undefined, '#ffa347', false);
    b.banner(TX + 6.3, TOP - 1, TZ, PALETTE.reachRed, Math.PI / 2, 1.4, 4);
    this.world.killY = -15;
  }

  // ----------------------------------------------------------------- state

  spawnPoint(cp: string): Spawn {
    switch (cp) {
      case 'gate':
        return { x: 0, z: 58, facing: 0 };
      case 'courtyard':
        return { x: 0, z: 130, facing: 0 };
      case 'tower':
        return { x: TX - 11, z: TZ - 9, facing: 0.8 };
      case 'duel':
        return { x: TX - 3, z: TZ - 3, facing: 0.8 };
      case 'foundry':
        return { x: -14, z: 158, facing: 0 };
      case 'night':
        return { x: -2, z: 150, facing: 0.6 };
      default:
        return { x: 0, z: 2, facing: 0 };
    }
  }

  playerLook(): Look {
    return LOOKS.ira47;
  }

  playerWeapon(): WeaponKind {
    return 'ashvow';
  }

  protected setupPlayer(cp: string) {
    this.mira = this.pell = null;
    this.allies = [];
    const p = this.player;
    p.canWrath = true;
    p.maxHp = 140;
    p.hp = 140;
    const idx = ORDER.indexOf(cp);
    this.setGate(idx >= ORDER.indexOf('courtyard'));
    this.setBell(false);
    this.templeZ = this.templeTarget = idx >= ORDER.indexOf('courtyard') ? 112 : idx >= 1 ? 40 : -40;
    this.setStorm(idx >= ORDER.indexOf('tower') && idx < ORDER.indexOf('night'));
    this.game.engine.applyLighting(cp === 'night' || cp === 'foundry' ? NIGHT : idx >= ORDER.indexOf('tower') ? STORM : DUSK);
    this.world.boundsCenter.set(0, 80);
    this.world.boundsRadius = 300;
    if (cp === 'duel') p.place(TX - 3, TZ - 3, 0.8);
  }

  private setGate(open: boolean) {
    this.world.walls = this.world.walls.filter((w) => w !== this.gateWall);
    if (!open && this.gateWall) this.world.walls.push(this.gateWall);
    this.gateLeaves.forEach((l, i) => {
      l.rotation.set(open ? -Math.PI / 2 + 0.05 : 0, 0, 0);
      l.position.set(i === 0 ? -2.5 : 2.5, open ? 0.4 : 6.5, open ? 131 : 124.2);
    });
  }

  private setBell(fallen: boolean) {
    if (!this.bell) return;
    this.world.walls = this.world.walls.filter((w) => w !== this.bellWall);
    if (fallen) {
      this.bell.position.set(TX + 1.5, TOP + 0.9, TZ + 1.2);
      this.bell.rotation.set(0.3, 0, 1.2);
      this.world.addWall(TX + 1.5, TZ + 1.2, 2.2, 2.2, TOP - 1, TOP + 2);
      this.bellWall = this.world.walls[this.world.walls.length - 1];
    } else {
      this.bell.position.set(TX + 1.6, TOP + 3.6, TZ + 2);
      this.bell.rotation.set(0, 0, 0);
      this.bellWall = null;
    }
  }

  private setStorm(on: boolean) {
    this.storm = on;
    if (on && !this.rain) this.rain = this.addWeather('rain', 1400, '#a8b4d0');
    if (this.rain) this.rain.object.visible = on;
    this.game.sfx.setAmbient('rain', on ? 0.5 : 0);
  }

  protected tick(dt: number) {
    if (this.temple) {
      const moving = this.templeZ < this.templeTarget - 0.05;
      if (moving) this.templeZ = Math.min(this.templeTarget, this.templeZ + dt * 2.2);
      const t = this.time * 1.4;
      this.temple.position.set(0, moving ? Math.abs(Math.sin(t)) * 0.4 : 0, this.templeZ);
      this.templeLegs.forEach((l, i) => {
        l.position.y = 4.5 + (moving ? Math.max(0, Math.sin(t + (i % 2) * Math.PI)) * 0.8 : 0);
      });
      if (moving && Math.sin(t) > 0.98 && this.time % 1 < dt * 2) this.sfx.play('rumble', { pos: this.temple.position, vol: 0.5 });
    }
    if (this.storm) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = rand(5, 11);
        this.game.engine.flash = 0.8;
        setTimeout(() => this.sfx.play('thunder'), 300 + Math.random() * 700);
      }
    }
  }

  // ----------------------------------------------------------------- squad

  private squad(n = 3) {
    if (this.mira) return;
    const miraT: FighterType = { ...halvethAlly(0), name: 'Mira', look: LOOKS.mira, weapon: 'sword' };
    const pellT: FighterType = { ...halvethAlly(2), name: 'Pell', look: LOOKS.pell, weapon: 'spear' };
    const p = this.player;
    this.mira = this.spawn(miraT, p.pos.x - 2, p.pos.z - 2, { team: 'ally', facing: p.facing });
    this.pell = this.spawn(pellT, p.pos.x + 2, p.pos.z - 2.5, { team: 'ally', facing: p.facing });
    this.allies = [this.mira, this.pell];
    for (let i = 0; i < n; i++) this.allies.push(this.spawn(halvethAlly(i + 3), p.pos.x + rand(-4, 4), p.pos.z - 4 - i, { team: 'ally', facing: p.facing }));
    for (const a of this.allies) a.follow = p;
  }

  private group3(defs: (() => FighterType)[], zc: number, spread = 8) {
    return defs.map((fn, i) => this.spawn(fn(), rand(-spread, spread), zc + rand(-3, 3) + (i % 3) * 2));
  }

  // ----------------------------------------------------------------- script

  protected async script(cp: string) {
    const at = (k: string) => ORDER.indexOf(cp) <= ORDER.indexOf(k);
    if (at('start')) await this.approach();
    if (at('gate')) await this.gateFight();
    if (at('courtyard')) await this.courtyard();
    if (at('tower')) await this.tower();
    if (at('duel')) await this.duel();
    if (at('foundry')) await this.foundry();
    await this.night();
  }

  private async approach() {
    const p = this.player;
    this.music('silence');
    this.squad(3);
    this.cinematic(true);
    this.templeTarget = -10;
    this.shot(6, 3, -14, 0, 9, -30, Infinity);
    await this.fade(1, 0.01);
    void this.fade(0, 2.5);
    await this.card('Chapter Two', 'THE LITANY GATE', 'Dusk. A canyon road, a fortress in the cliff, and a storm building in the north.', 4);
    this.music('tension');
    this.shot(-4, 2.6, 10, 0, 4, 60, 1.2);
    await this.say('narrator', 'The Halveth march on the Litany Gate behind a walking temple. The Reach have held the gate for a month.');
    this.twoShot(p, this.mira!, 1);
    await this.talk([
      ['mira', 'Forty-six times. I\'d counted thirty-two when we met.'],
      ['ira', 'Did I count the horse?'],
      ['mira', 'You always count the horse.'],
    ]);
    this.closeUp(this.pell!, 2, 0.4);
    await this.say('pell', 'Is it true the Reach burn their dead? So they can\'t come back?');
    await this.say('ira', 'They burn ours. Stay behind me, Pell.');
    this.cinematic(false);
    this.templeTarget = 40;
    this.music('combat');
    this.goal('Push up the canyon toward the gate', [0, 0, 56]);
    this.hint('Your squad fights beside you. Stay together.');
    const w1 = this.group3([reachSpear, reachAxe, reachSpear, reachAxe], 34);
    await this.allDown(w1);
    this.bark('mira', 'More on the ridge road! Keep moving!');
    const w2 = this.group3([reachAxe, reachSpear, () => reachArcher(), reachSpear], 52);
    await this.allDown(w2);
    await this.reach(0, 56, 5, 'Push up the canyon toward the gate');
  }

  private async gateFight() {
    this.setCheckpoint('gate');
    this.squad(3);
    this.templeTarget = 80;
    this.music('combat');
    this.goal('Clear the barricades before the gate', [0, 0, 100]);
    void this.shard(-9, 84, 'ch2-canyon');
    const w1 = this.group3([() => reachArcher(), () => reachArcher(), reachSpear, reachElite], 82, 7);
    this.bark('pell', 'Archers behind the barricade!');
    await this.allDown(w1);
    const w2 = this.group3([reachAxe, reachAxe, reachSpear, reachSpear, () => reachArcher()], 100, 7);
    await this.allDown(w2);
    this.templeTarget = 112;
    this.goal('Fall back and let the temple through', [0, 0, 98]);
    await this.until(() => this.templeZ >= 111.5);
    this.cinematic(true);
    this.music('dread');
    this.shot(-14, 6, 100, 0, 9, 124, 1.5);
    await this.say('narrator', 'The walking temple lowers its head. The ram swings back.');
    for (let i = 0; i < 3; i++) {
      if (this.temple) this.temple.position.z = 110;
      await this.wait(0.5);
      if (this.temple) this.temple.position.z = 113;
      this.sfx.play('hitHeavy', { pos: new THREE.Vector3(0, 8, 124), vol: 1.5 });
      this.sfx.play('rumble');
      this.shake(0.5);
      await this.wait(0.9);
    }
    this.setGate(true);
    this.sfx.play('break');
    this.shake(0.8);
    this.particles.burst(new THREE.Vector3(0, 6, 125), 60, '#d8c0a0', 8, 1.2, 0.2);
    await this.say('mira', 'It\'s through! Go, go, go!');
    this.cinematic(false);
  }

  private async courtyard() {
    this.setCheckpoint('courtyard');
    this.squad(4);
    this.music('combat');
    this.goal('Take the courtyard');
    const w1 = [this.spawn(reachBrute(), 0, 160), this.spawn(reachSpear(), -8, 150), this.spawn(reachAxe(), 8, 152), this.spawn(reachSpear(), 2, 156)];
    this.bark('ira', 'Breaker! Watch the hammer, it goes straight through a guard.');
    await this.allDown(w1);
    await this.wait(1.5);
    const w2 = [this.spawn(reachElite(), -6, 170), this.spawn(reachElite(), 6, 172), this.spawn(reachAxe(), 0, 166), this.spawn(reachAxe(), -12, 160), this.spawn(reachArcher(true), 18, 175)];
    this.hint('A red flash means an unblockable stillfire strike. Dodge it with {dodge}.');
    await this.allDown(w2);
    this.music('tension');
    this.cinematic(true);
    this.twoShot(this.player, this.mira!, 1);
    await this.talk([
      ['mira', 'The bell tower. Their spearman\'s up there. He\'s the one calling the lines.'],
      ['ira', 'Then I\'ll go and talk to him.'],
      ['mira', 'Ira. Every time you go up a tower alone, I end up writing to your brother.'],
    ]);
    this.cinematic(false);
  }

  private async tower() {
    this.setCheckpoint('tower');
    this.setStorm(true);
    this.game.engine.applyLighting(STORM);
    this.music('dread');
    this.goal('Climb the bell tower', [TX - SR, 0, TZ - SR]);
    this.bark('kaal', 'Stairs. In a storm. With a man at the top who wants you dead. My favourite.');
    await this.reach(TX - SR, TZ - SR, 3, 'Climb the bell tower');
    const H = TOP / 8;
    const R = SR;
    const corners = [
      [TX - R, TZ - R],
      [TX + R, TZ - R],
      [TX + R, TZ + R],
      [TX - R, TZ + R],
    ];
    const guards: Fighter[] = [];
    for (const k of [2, 4, 6]) {
      const [x, z] = corners[k % 4];
      const f = this.spawn(k === 6 ? reachElite() : k === 4 ? reachAxe() : reachSpear(), x, z);
      f.pos.y = k * H;
      f.guardRadius = 7;
      guards.push(f);
    }
    this.goal('Climb the bell tower', [TX - R, TOP, TZ - R]);
    await this.until(() => this.player.pos.y > TOP - 1.5 || (guards.every((g) => !g.alive) && this.player.pos.y > TOP - 3));
  }

  private async duel() {
    this.setCheckpoint('duel');
    const p = this.player;
    this.setStorm(true);
    this.game.engine.applyLighting(STORM);
    this.goal(null);
    this.music('silence');
    const npc = this.npc(LOOKS.sauvir, TX + 2, TZ + 3.5, Math.PI, 'stillSpear', 'sauvirNpc');
    npc.pose = 'kneel';
    p.place(TX - 3.5, TZ - 3.5, 0.6);
    this.cinematic(true);
    this.shot(TX - 5, TOP + 2.2, TZ - 5.5, TX + 1.5, TOP + 1.2, TZ + 3, Infinity);
    await this.wait(0.6);
    await this.say('narrator', 'He waits on the bell frame in the rain, praying, his spear across his knees, white fire hissing on its blade. He doesn\'t turn around.');
    this.closeUp(npc, 2.8, 2.6);
    await this.say('sauvir', 'You took longer than last time.');
    this.closeUp(p, 2.2, 0.4);
    await this.say('ira', 'Have we met?');
    npc.pose = null;
    npc.faceToward(p.pos.x, p.pos.z);
    this.twoShot(p, npc, 1);
    await this.talk([
      ['sauvir', 'Twelve times.'],
      ['ira', 'I\'d remember a face like yours.'],
      ['sauvir', 'You never do. That\'s the thirteenth thing I know about you.'],
      ['ira', 'What are the other twelve?'],
    ]);
    this.closeUp(npc, 2.0, -0.2);
    await this.say('sauvir', 'How you die.');
    const sx = npc.pos.x;
    const sz = npc.pos.z;
    this.removeActor(npc);
    const s = this.spawn(sauvirBoss(), sx, sz);
    s.habitReader = true;
    s.minHp = s.maxHp * 0.22;
    s.damageTakenMul *= 0.9;
    this.bossBar(s);
    this.cinematic(false);
    this.music('boss');
    this.hint('Sauvir reads your habits. Spam the same attack and he will parry it. Mix heavies, dodges and parries.');
    this.world.boundsCenter.set(TX, TZ);
    this.world.boundsRadius = 9;

    await this.until(() => s.hp < s.maxHp * 0.62 || !s.alive);
    if (s.alive) {
      s.aggro = false;
      s.invulnerable = true;
      this.game.engine.flash = 1.4;
      this.sfx.play('thunder');
      this.shake(0.9);
      this.setBell(true);
      this.particles.burst(new THREE.Vector3(TX + 1.5, TOP + 1, TZ + 1.2), 50, '#ffe6b0', 8, 0.8, 0.16);
      this.sfx.play('bell', { pos: new THREE.Vector3(TX, TOP, TZ) });
      for (const a of [p, s]) {
        if (a.distTo(new THREE.Vector3(TX + 1.5, 0, TZ + 1.2)) < 3) a.receiveHit(s, { name: 'light1', windup: 0, active: 0, recover: 0, damage: 18, posture: 40, range: 1, arc: 7, unblockable: true });
      }
      this.bark('kaal', 'He\'s reading you. Change it up. Stop leading with the knee!');
      await this.wait(1.4);
      s.aggro = true;
      s.invulnerable = false;
      s.type.cooldown = [0.6, 1.3];
    }
    await this.until(() => s.hp <= s.minHp + 1 || !s.alive);

    // He could end it. He doesn't.
    this.bossBar(null);
    this.music('silence');
    const bx = s.pos.x;
    const bz = s.pos.z;
    this.removeActor(s);
    this.cinematic(true);
    this.playerProtected = true;
    const sv = this.npc(LOOKS.sauvir, bx, bz, 0, 'stillSpear', 'sauvir');
    p.place(TX - 1.5, TZ - 1, 0);
    sv.place(TX - 1.5, TZ + 1.0, Math.PI);
    sv.pose = 'raise';
    this.sfx.play('parry', { pos: p.pos });
    p.rig.setWeapon('none');
    p.pose = 'lying';
    this.shot(TX + 1.5, TOP + 1.6, TZ - 2.5, TX - 1.5, TOP + 0.5, TZ, 2.5);
    await this.say('narrator', 'He knocks Ashvow out of her hands. She lands on her back across the fallen bell. The spear stops a hand\'s width above her throat.');
    sv.pose = null;
    this.closeUp(sv, 2.2, 0.4);
    await this.say('sauvir', 'Left knee first. Every time. Even in that body.');
    this.closeUp(p, 1.6, 0.2);
    await this.say('ira', 'Then do it.');
    this.shot(TX - 4, TOP + 1.8, TZ + 3, TX - 1.5, TOP + 1.2, TZ + 1, 1.5);
    await this.wait(1.6);
    await this.say('sauvir', 'No. Not today.');
    void sv.goTo(TX - 5.4, TZ + 4.5, 3);
    await this.wait(1.2);
    this.sfx.play('dodge', { pos: sv.pos });
    sv.rig.root.visible = false;
    await this.say('narrator', 'He snaps open the prayer-kite on his back and steps off the edge into the storm.');
    const c = await this.choose(['Shout: "Why?"', 'Shout: "Coward!"', 'Say nothing.']);
    this.game.save.choices.sauvirShout = ['why', 'coward', 'nothing'][c];
    if (c === 0) await this.say('ira', 'Why?!');
    if (c === 1) await this.say('ira', 'Coward!');
    this.removeActor(sv);
    p.pose = null;
    p.rig.setWeapon('ashvow');
    this.playerProtected = false;
    this.world.boundsRadius = 300;
    this.world.boundsCenter.set(0, 80);
    await this.fade(1, 0.8);
  }

  private async foundry() {
    this.setCheckpoint('foundry');
    const p = this.player;
    this.setStorm(false);
    this.game.engine.applyLighting(NIGHT);
    this.game.sfx.setAmbient('fire', 0.3);
    p.place(-14, 158, 0);
    this.music('dread');
    this.cinematic(true);
    const pell = this.npc(LOOKS.pell, -10, 150, 0, 'spear', 'pell');
    const elites: Actor[] = [];
    for (let i = 0; i < 3; i++) elites.push(this.npc(reachLook(true), -17 + i * 3, 167, Math.PI, 'stillSpear', 'elite'));
    this.shot(-8, 3, 156, -14, 1.4, 164, Infinity);
    await this.fade(0, 0.8);
    await this.say('narrator', 'The bell foundry beneath the tower. Three of his warriors, faces painted white, drop from the chains toward her.');
    void pell.goTo(-12, 158.5, 5);
    await this.say('pell', 'Sergeant! Sergeant, the Marshal says—');
    const thrower = elites[2];
    thrower.faceToward(pell.pos.x, pell.pos.z);
    thrower.pose = 'raise';
    await this.wait(0.4);
    this.spawnProjectile('stillArrow', new THREE.Vector3(thrower.pos.x, 1.6, thrower.pos.z), pell.pos.clone().setY(1.2).sub(new THREE.Vector3(thrower.pos.x, 1.6, thrower.pos.z)).normalize(), thrower, { name: 'knife', windup: 0, active: 0, recover: 0, damage: 0, posture: 0, range: 1, arc: 1 });
    await this.wait(0.35);
    pell.pose = 'kneel';
    pell.rig.flash('#ffffff', 0.6);
    this.sfx.play('stillfire', { pos: pell.pos });
    this.closeUp(pell, 1.9, 0.6);
    await this.say('narrator', 'Ira watches the stillfire knife go in. She watches the boy\'s blue mark flicker, grey, and go dark.');
    pell.invulnerable = false;
    pell.keepBody = true;
    pell.die(null);
    await this.wait(1.2);
    this.closeUp(p, 2, 0.4);
    await this.say('ira', 'Pell.');
    for (const e of elites) this.removeActor(e);
    this.cinematic(false);
    this.music('boss');
    this.goal('Kill the white-faced warriors');
    const foes = [this.spawn(reachElite(), -17, 167), this.spawn(reachElite(), -14, 168), this.spawn(reachElite(), -11, 167)];
    await this.allDown(foes);
    this.music('sorrow');
    await this.wait(1);
    this.bark('ira', 'He thought he\'d come back. You could see it on his face.');
    await this.wait(3);
    await this.fade(1, 1.4);
  }

  private async night() {
    this.setCheckpoint('night');
    const p = this.player;
    this.setStorm(false);
    this.game.engine.applyLighting(NIGHT);
    this.game.engine.setStars(0.5);
    this.music('sorrow');
    const CX = 2;
    const CZ = 156;
    const pell = this.npc(LOOKS.pell, CX, CZ, 0.3, 'none', 'pellBody');
    pell.pose = 'lying';
    const mourners: Actor[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 1.6 + 0.9;
      const r = 4.2 + (i % 2) * 1.3;
      const m = this.npc(halvethLook(i), CX + Math.sin(a) * r, CZ + Math.cos(a) * r, 0, i % 3 ? 'sword' : 'spear', 'mourner');
      m.faceToward(CX, CZ);
      mourners.push(m);
    }
    const corrow = this.npc(LOOKS.corrow, CX - 4.4, CZ + 1.5, 0, 'sword', 'corrow');
    corrow.faceToward(CX, CZ);
    const mira = this.npc(LOOKS.mira, CX + 3.6, CZ - 2.4, 0, 'sword', 'mira');
    mira.faceToward(CX, CZ);
    const watcher = this.npc(LOOKS.sauvir, TX - 5.2, TZ, Math.PI, 'stillSpear', 'watcher');
    watcher.pos.y = TOP;
    watcher.faceToward(CX, CZ);
    p.place(-2, 150, 0.6);
    this.cinematic(true);
    this.shot(CX - 8, 3, CZ - 8, CX, 1.2, CZ, Infinity);
    await this.fade(0, 1.6);
    await this.say('narrator', 'The Litany Gate, taken. Night. They have laid the boy\'s body on a cart. Nobody knows what to do. Nobody in Halveth has had to bury anyone for good in a long time.');
    this.cinematic(false);
    this.goal('Hum for Pell', [CX, 0.78, CZ]);
    this.hint('Stand by the cart and hold {hum}.');
    const start = p.humTime;
    await this.until(() => p.humTime - start > 5.5 && p.distTo(new THREE.Vector3(CX, 0, CZ)) < 7);
    this.goal(null);
    this.cinematic(true);
    this.shot(CX + 7, 2.4, CZ - 5, CX, 1.2, CZ, 1.2);
    this.sfx.startHum();
    this.music('silence');
    await this.say('narrator', 'Four notes, rising. One by one, the soldiers around her join in. An old marshal with a cord of rings takes off his helmet.');
    corrow.pose = 'kneel';
    for (const m of mourners) m.pose = Math.random() < 0.4 ? 'kneel' : null;
    this.game.sfx.play('calm');
    await this.wait(3);
    this.shot(TX - 10, TOP - 4, TZ - 10, TX - 5.2, TOP + 1, TZ, 1.0);
    await this.say('narrator', 'Up in the tower, a man with braids and a spear doesn\'t move. He stays until they finish.');
    this.sfx.stopHum();
    this.closeUp(p, 2.2, 0.4);
    await this.say('kaal', '...');
    await this.say('ira', 'You can talk, you know.');
    await this.say('kaal', 'I know. I just don\'t have anything good enough to say.');
    this.music('sorrow');
    await this.journal('Pell. Seventeen. First life. His mark went grey and stayed grey. I told him dying was like missing a stair in the dark. I don\'t know where I learned that. I don\'t think it\'s true for them.');
    this.removeActor(watcher);
    await this.fade(1, 1.4);
    await this.card('End of Chapter Two', 'THE LITANY GATE', '', 2.6);
    this.game.completeChapter();
  }
}

