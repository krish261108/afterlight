import * as THREE from 'three';
import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { Actor } from '../entities/Actor';
import type { Fighter } from '../entities/Fighter';
import type { Game } from '../Game';
import { LOOKS, halvethAlly, reachSpear, reachAxe, reachArcher, reachElite, reachBrute, forgeMaster, reachLook } from '../entities/roster';
import { mat, glow, additive, PALETTE } from '../world/materials';
import { fbm, rand } from '../core/util';

const ORDER = ['start', 'gate', 'hall', 'archive', 'capture'];

const SNOW: LightingPreset = {
  sky: ['#3a4a70', '#a8b4cc', '#dcdfe8'],
  fog: '#c9d0de',
  fogDensity: 0.014,
  sun: '#f2f4ff',
  sunIntensity: 1.8,
  sunDir: [0.4, 0.55, -0.6],
  ambient: '#c8d0e8',
  ambientIntensity: 1.0,
  hemiGround: '#6a6e7a',
  exposure: 1.0,
  bloom: 0.6,
  suns: 2,
};

const FORGE: LightingPreset = {
  sky: ['#0a0a12', '#1c1a28', '#262434'],
  fog: '#2a2738',
  fogDensity: 0.014,
  sun: '#c8ccdf',
  sunIntensity: 0.5,
  sunDir: [0.2, 0.9, 0.2],
  ambient: '#a0a8cc',
  ambientIntensity: 1.25,
  hemiGround: '#24222e',
  exposure: 1.3,
  bloom: 1.0,
  suns: 1,
};

const DUSK_SNOW: LightingPreset = {
  sky: ['#1a1e3a', '#6a5a7e', '#c48a78'],
  fog: '#8a7a8e',
  fogDensity: 0.016,
  sun: '#ffb89a',
  sunIntensity: 1.4,
  sunDir: [-0.5, 0.2, -0.8],
  ambient: '#a8a0c0',
  ambientIntensity: 0.9,
  hemiGround: '#4a4458',
  exposure: 1.05,
  bloom: 0.8,
  suns: 2,
};

interface Vent {
  x: number;
  z: number;
  r: number;
  t: number;
  phase: 'idle' | 'warn' | 'erupt';
  ring: THREE.Mesh;
  column: THREE.Mesh;
  hit: Set<Actor>;
  active: boolean;
  zone: 'road' | 'hall';
}

export class Chapter4 extends Level {
  readonly index = 4;
  readonly title = 'The Stillfire Forge';
  readonly lighting = SNOW;
  readonly ambient = { wind: 0.5 };
  private vents: Vent[] = [];
  private mira: Fighter | null = null;
  private plates: THREE.Mesh[] = [];
  private hallVentsOn = false;
  private droppedBlade: THREE.Object3D[] = [];

  constructor(game: Game) {
    super(game);
  }

  protected build() {
    const b = this.builder;
    b.terrain({
      size: 300,
      seg: 120,
      cz: 10,
      height: (x, z) => {
        // A pass climbing north to a plateau, mountains rising on both sides.
        if (z > 30 && z < 112 && Math.abs(x) < 26) return 10.7;
        const road = Math.abs(x - Math.sin(z * 0.04) * 6);
        let base = z < 30 ? Math.max(0, (z + 90) * 0.09) : 10.8;
        if (z > 30) base = 10.8;
        let h = base + fbm(x * 0.04, z * 0.04) * 1.5;
        const side = z < 36 ? road - 11 : Math.abs(x) - 26;
        if (side > 0) h += Math.min(40, side * 2.6) + fbm(x * 0.08, z * 0.08) * 8;
        if (z > 112) h += (z - 112) * 3;
        return h;
      },
      color: (x, z, h) => {
        const c = new THREE.Color('#e8ecf4').lerp(new THREE.Color('#c4cad8'), fbm(x * 0.12, z * 0.12));
        if (h > 18) c.lerp(new THREE.Color('#5a5a66'), 0.35);
        return c;
      },
    });
    for (let z = -92; z < 36; z += 5) {
      const cx = Math.sin((z + 2.5) * 0.04) * 6;
      this.world.addWall(cx - 12.2, z + 2.5, 2, 5.4, -10, 80);
      this.world.addWall(cx + 12.2, z + 2.5, 2, 5.4, -10, 80);
    }
    this.world.addWall(0, -94, 40, 2, -10, 80);
    this.world.addWall(-27, 74, 2, 80, -10, 80);
    this.world.addWall(27, 74, 2, 80, -10, 80);

    const black = mat('#24222a', { rough: 0.7 });
    const black2 = mat('#34303c', { rough: 0.6 });
    const Y = 10.8;
    // The forge: black stone built into the mountain.
    b.box(18, 16, 4, black, -16, Y - 1, 40, 0, { collide: true });
    b.box(18, 16, 4, black, 16, Y - 1, 40, 0, { collide: true });
    b.box(14, 6, 4, black, 0, Y + 9, 40);
    this.gateDoor = b.box(14, 9.5, 0.8, mat('#1a1418', { metal: 0.5 }), 0, Y, 38.5);
    this.world.addWall(0, 38.5, 14, 1.4, Y - 1, Y + 9.5);
    this.gateWall = this.world.walls[this.world.walls.length - 1];
    for (const s of [-1, 1]) {
      b.cyl(1.2, 1.4, 2.4, black2, s * 9, Y, 35, 10, true);
      const f = new THREE.Mesh(new THREE.ConeGeometry(1.0, 3, 8), additive(PALETTE.stillfire, 0.85));
      f.position.set(s * 9, Y + 3.8, 35);
      this.group.add(f);
      const l = new THREE.PointLight('#e8eeff', 140, 22, 2);
      l.position.set(s * 9, Y + 4, 35);
      this.group.add(l);
      b.updaters.push((_dt, t) => f.scale.set(1, 0.85 + Math.sin(t * 9 + s) * 0.15, 1));
    }
    // Great hall interior.
    b.box(52, 0.3, 70, mat('#1c1a20'), 0, Y - 0.3, 75, 0, { floor: true });
    b.box(52, 1.4, 70, black, 0, Y + 18, 75);
    for (let i = 0; i < 6; i++) {
      for (const s of [-1, 1]) b.cyl(1.1, 1.3, 18, black2, s * 13, Y, 50 + i * 9, 8, true);
    }
    for (const s of [-1, 1]) {
      b.box(1.5, 18, 70, black, s * 25.5, Y, 75, 0, { collide: true });
    }
    b.box(52, 18, 1.5, black, 0, Y, 111, 0, { collide: true });
    // A channel of white fire down the middle of the hall, under iron grates.
    const trench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 30), glow(PALETTE.stillfire, 1.8));
    trench.position.set(0, Y + 0.01, 72);
    this.group.add(trench);
    const iron = mat('#2a2830', { metal: 0.8, rough: 0.4 });
    for (let i = 0; i < 31; i++) b.box(3.2, 0.06, 0.12, iron, 0, Y, 57 + i, 0, { cast: false });
    for (const s of [-1, 1]) b.box(0.15, 0.08, 30, iron, s * 1.55, Y, 72, 0, { cast: false });
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 5), additive(PALETTE.stillfire, 0.5));
      f.position.set(rand(-1, 1), Y + 0.3, 58 + i * 2.1);
      this.group.add(f);
      b.updaters.push((_dt, t) => f.scale.set(1, 0.6 + Math.sin(t * 7 + i) * 0.4, 1));
    }
    for (const [x, z] of [
      [-10, 60],
      [10, 60],
      [-10, 86],
      [10, 86],
    ]) {
      const l = new THREE.PointLight('#e6ecff', 260, 30, 2);
      l.position.set(x, Y + 5, z);
      this.group.add(l);
    }
    // Anvils and racks of spears.
    for (const [x, z] of [
      [-18, 55],
      [18, 58],
      [-19, 92],
      [19, 90],
    ]) {
      b.box(1.6, 0.9, 0.8, mat('#2a2830', { metal: 0.8 }), x, Y, z, 0, { collide: true });
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), mat(PALETTE.wood));
        sp.position.set(x + (x < 0 ? 2.5 : -2.5), Y + 1.2, z - 1 + k * 0.6);
        sp.rotation.x = 0.15;
        this.group.add(sp);
      }
    }
    b.banner(-12.5, Y + 15, 110, PALETTE.reachRed, 0, 3, 8);
    b.banner(12.5, Y + 15, 110, PALETTE.reachRed, 0, 3, 8);
    // The archive alcove: stolen Wheel records on glass plates.
    b.box(16, 0.3, 10, mat('#2a2632'), 0, Y, 104);
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 7; i++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.04), mat('#9ecfff', { transparent: true, opacity: 0.55, emissive: '#5fb8ff', emissiveIntensity: 0.5, rough: 0.1 }));
        plate.position.set(-6 + i * 2, Y + 1 + r * 1.5, 108.8);
        this.group.add(plate);
        this.plates.push(plate);
      }
    }
    const al = new THREE.PointLight('#8ac8ff', 90, 16, 2);
    al.position.set(0, Y + 3, 105);
    this.group.add(al);

    // Stillfire vents on the road and in the hall.
    const road: [number, number][] = [
      [3, -40],
      [-4, -28],
      [5, -12],
      [-3, 2],
      [2, 16],
    ];
    for (const [z0, i] of road.map((p, i) => [p, i] as const)) this.addVent(z0[0], z0[1], 1.6, 'road', i * 1.3);
    const hallV: [number, number][] = [
      [-8, 54],
      [8, 54],
      [-8, 66],
      [8, 66],
      [-8, 78],
      [8, 78],
      [-8, 90],
      [8, 90],
      [-17, 72],
      [17, 72],
    ];
    hallV.forEach(([x, z], i) => this.addVent(x, z, 2.0, 'hall', i * 0.7));
    b.scatterRocks(60, (r) => {
      const z = r.range(-90, 34);
      const off = r.range(5.5, 10) * (r.next() < 0.5 ? -1 : 1);
      return [Math.sin(z * 0.04) * 6 + off, z];
    }, '#6a6a76', 0.25, 1.0, 0.8);
    b.scatterTrees(60, (r) => {
      const x = r.range(-90, 90);
      const z = r.range(-100, 40);
      return Math.abs(x - Math.sin(z * 0.04) * 6) < 16 ? null : [x, z];
    }, 'pine', '#3a4a40');
    this.addWeather('snow', 900, '#ffffff');
    this.world.killY = -20;
  }

  private gateDoor: THREE.Mesh | null = null;
  private gateWall: import('../core/World').Wall | null = null;

  private addVent(x: number, z: number, r: number, zone: 'road' | 'hall', offset: number) {
    const y = this.world.terrain(x, z) + 0.05;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r, 24), additive('#ffffff', 0.0));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, zone === 'hall' ? 10.85 : y, z);
    ring.material = (ring.material as THREE.Material).clone();
    const column = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.6, r, 6, 12, 1, true), additive(PALETTE.stillfire, 0.75));
    column.position.set(x, (zone === 'hall' ? 10.8 : y) + 3, z);
    column.visible = false;
    const crack = new THREE.Mesh(new THREE.CircleGeometry(r * 0.35, 8), mat('#3a3a44'));
    crack.rotation.x = -Math.PI / 2;
    crack.position.set(x, (zone === 'hall' ? 10.82 : y) - 0.01, z);
    this.group.add(ring, column, crack);
    this.vents.push({ x, z, r, t: 2 + offset, phase: 'idle', ring, column, hit: new Set(), active: zone === 'road', zone });
  }

  spawnPoint(cp: string): Spawn {
    switch (cp) {
      case 'gate':
        return { x: 0, z: 20, facing: 0 };
      case 'hall':
        return { x: 0, z: 46, facing: 0 };
      case 'archive':
        return { x: 0, z: 96, facing: 0 };
      case 'capture':
        return { x: 0, z: 34, facing: Math.PI };
      default:
        return { x: 0, z: -84, facing: 0 };
    }
  }

  playerLook(): Look {
    return LOOKS.ira47;
  }

  playerWeapon(): WeaponKind {
    return 'ashvow';
  }

  protected setupPlayer(cp: string) {
    this.mira = null;
    for (const o of this.droppedBlade) this.group.remove(o);
    this.droppedBlade = [];
    const p = this.player;
    p.canWrath = true;
    p.maxHp = 160;
    p.hp = 160;
    const idx = ORDER.indexOf(cp);
    const inside = cp === 'hall' || cp === 'archive';
    this.game.engine.applyLighting(inside ? FORGE : cp === 'capture' ? DUSK_SNOW : SNOW);
    this.game.sfx.setAmbient('forge', inside ? 0.45 : 0);
    this.game.sfx.setAmbient('wind', inside ? 0.1 : 0.5);
    this.hallVentsOn = false;
    for (const v of this.vents) {
      v.active = v.zone === 'road' && idx < ORDER.indexOf('hall');
      v.phase = 'idle';
      v.column.visible = false;
      (v.ring.material as THREE.MeshBasicMaterial).opacity = 0;
    }
    this.setGateOpen(idx >= ORDER.indexOf('hall'));
    this.world.boundsCenter.set(0, 10);
    this.world.boundsRadius = 145;
  }

  private setGateOpen(open: boolean) {
    this.world.walls = this.world.walls.filter((w) => w !== this.gateWall);
    if (!open && this.gateWall) this.world.walls.push(this.gateWall);
    if (this.gateDoor) this.gateDoor.position.y = open ? 10.8 + 9.2 + 4.75 : 10.8 + 4.75;
  }

  protected tick(dt: number) {
    for (const v of this.vents) {
      if (!v.active && v.phase === 'idle') continue;
      v.t -= dt;
      const ringMat = v.ring.material as THREE.MeshBasicMaterial;
      if (v.phase === 'idle') {
        ringMat.opacity = Math.max(0, ringMat.opacity - dt);
        if (v.t <= 0 && v.active) {
          v.phase = 'warn';
          v.t = 1.1;
          this.sfx.play('stillfire', { pos: new THREE.Vector3(v.x, 0, v.z), vol: 0.35 });
        }
      } else if (v.phase === 'warn') {
        ringMat.opacity = 0.25 + Math.abs(Math.sin(this.time * 14)) * 0.45;
        if (v.t <= 0) {
          v.phase = 'erupt';
          v.t = 0.9;
          v.hit.clear();
          v.column.visible = true;
          this.sfx.play('stillfire', { pos: new THREE.Vector3(v.x, 0, v.z), vol: 0.9 });
        }
      } else {
        ringMat.opacity = 0.8;
        v.column.scale.set(1, 0.6 + Math.random() * 0.5, 1);
        for (const a of this.actors) {
          if (!a.alive || v.hit.has(a) || a.team === 'neutral') continue;
          if (Math.hypot(a.pos.x - v.x, a.pos.z - v.z) < v.r + a.radius * 0.5 && Math.abs(a.pos.y - v.column.position.y + 3) < 3) {
            v.hit.add(a);
            this.burn(a, a === this.player ? 34 : 60);
          }
        }
        if (v.t <= 0) {
          v.phase = 'idle';
          v.column.visible = false;
          v.t = v.zone === 'hall' ? rand(2.5, 4.5) : rand(3, 5);
        }
      }
    }
    for (let i = 0; i < this.plates.length; i++) {
      const m = this.plates[i].material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = 0.4 + Math.sin(this.time * 1.5 + i * 0.7) * 0.15;
    }
  }

  /** Stillfire does not care about a Wheel-mark. */
  private burn(a: Actor, dmg: number) {
    if (a.invuln > 0 || a.invulnerable) return;
    a.hp = Math.max(a.minHp, a.hp - dmg * a.damageTakenMul);
    a.rig.flash('#ffffff', 0.25);
    a.lastDamagedAt = this.time;
    this.sfx.play('hitHeavy', { pos: a.pos });
    this.particles.burst(new THREE.Vector3(a.pos.x, a.pos.y + 1, a.pos.z), 20, '#ffffff', 4, 0.5, 0.12);
    if (a === this.player) this.shake(0.3);
    if (a.hp <= 0 && a.minHp <= 0) a.die(null);
    else if (a.state !== 'stagger') a.flinch(0.4);
  }

  private squad() {
    if (this.mira) return;
    const p = this.player;
    this.mira = this.spawn({ ...halvethAlly(0), name: 'Mira', look: LOOKS.mira, weapon: 'sword' }, p.pos.x - 2, p.pos.z - 2, { team: 'ally', facing: p.facing });
    this.mira.follow = p;
    const s = this.spawn(halvethAlly(6), p.pos.x + 2, p.pos.z - 2, { team: 'ally', facing: p.facing });
    s.follow = p;
  }

  protected async script(cp: string) {
    const at = (k: string) => ORDER.indexOf(cp) <= ORDER.indexOf(k);
    if (at('start')) await this.pass();
    if (at('gate')) await this.gate();
    if (at('hall')) await this.hall();
    if (at('archive')) await this.archive();
    await this.capture();
  }

  private async pass() {
    const p = this.player;
    this.squad();
    this.music('silence');
    this.cinematic(true);
    this.shot(8, 3, -94, 0, 8, -50, Infinity);
    await this.fade(1, 0.01);
    void this.game.ui.fade(0, 2.5);
    await this.card('Chapter Four', 'THE STILLFIRE FORGE', 'High in the Red Country, where the snow never melts. The Reach make their white fire here.', 4.2);
    this.music('tension');
    this.twoShot(p, this.mira!, 1);
    await this.talk([
      ['mira', 'What do you even want in there?'],
      ['ira', 'The plates. The Reach raided a Halveth archive years ago and stole the Wheel\'s records. Glass plates. Elias says mine are among them.'],
      ['kaal', 'You don\'t want to read those.'],
      ['ira', 'Why not?'],
      ['kaal', 'Because then you\'ll want to understand them.'],
    ]);
    this.cinematic(false);
    this.goal('Climb the pass to the forge', [0, 0, 22]);
    this.hint('White rings on the ground are stillfire vents. When one flashes, get out. That fire ends any life it touches.');
    await this.until(() => p.pos.z > -40);
    this.music('combat');
    const w1 = [this.spawn(reachSpear(), -4, -20), this.spawn(reachAxe(), 4, -18), this.spawn(reachArcher(true), 0, -6), this.spawn(reachSpear(), 6, -10)];
    await this.allDown(w1);
    this.music('tension');
    void this.shard(-7, -2, 'ch4-pass');
    await this.reach(0, 16, 6, 'Climb the pass to the forge');
  }

  private async gate() {
    this.setCheckpoint('gate');
    this.squad();
    this.music('combat');
    this.goal('Break through the forge gate');
    const w1 = [this.spawn(reachElite(), -5, 32), this.spawn(reachBrute(), 3, 33), this.spawn(reachArcher(true), -9, 30), this.spawn(reachArcher(true), 9, 30)];
    await this.allDown(w1);
    const w2 = [this.spawn(reachElite(), 0, 34), this.spawn(reachAxe(), -6, 30), this.spawn(reachAxe(), 6, 30), this.spawn(reachSpear(), 2, 28)];
    await this.allDown(w2);
    this.cinematic(true);
    this.shot(10, 14, 22, 0, 14, 38, 1.5);
    this.sfx.play('rumble');
    await this.say('mira', 'The doors! Someone inside is opening them.');
    this.setGateOpen(true);
    await this.say('kaal', 'That\'s an invitation. I hate invitations.');
    this.cinematic(false);
    this.goal('Enter the forge', [0, 10.8, 46]);
    await this.reach(0, 46, 4, 'Enter the forge');
  }

  private async hall() {
    this.setCheckpoint('hall');
    const p = this.player;
    this.squad();
    this.game.engine.applyLighting(FORGE);
    this.game.sfx.setAmbient('forge', 0.45);
    this.game.sfx.setAmbient('wind', 0.1);
    for (const v of this.vents) v.active = false;
    this.music('dread');
    const orskNpc = this.npc(forgeMaster().look, 0, 98, Math.PI, 'stillSpear', 'orsk');
    this.cinematic(true);
    this.shot(6, 13.5, 48, 0, 12.5, 90, 1.2);
    await this.say('narrator', 'Inside, the forge is a hall of black stone and white fire. At the far end, an old man waits beside the trench, spear upright, beard to his belt.');
    void orskNpc.goTo(0, 91, 2);
    this.closeUp(orskNpc, 3, 0.3, 1);
    await this.talk([
      ['orsk', 'So. The Forty-Seven comes to the fire herself.'],
      ['orsk', 'I handed a boy his first spear in this hall, sixteen years ago. I told him: stillfire is mercy. It gives the only true end.'],
      ['orsk', 'The Halveth steal their dead back, again and again, and call it life. We give an ending.'],
    ]);
    this.twoShot(p, orskNpc, 1);
    await this.say('ira', 'You gave one to a boy of seventeen at the Litany Gate.');
    await this.say('orsk', 'Then he is free. And you are not. Come, let me fix that.');
    const ox = orskNpc.pos.x;
    const oz = orskNpc.pos.z;
    this.removeActor(orskNpc);
    const orsk = this.spawn(forgeMaster(), ox, oz);
    orsk.minHp = 1;
    this.bossBar(orsk);
    this.cinematic(false);
    this.music('boss');
    this.hint('Orsk shrugs off light blows. Parry his spear and land heavies to break his posture.');
    await this.until(() => orsk.hp < orsk.maxHp * 0.6 || !orsk.alive);
    if (orsk.alive) {
      this.bark('orsk', 'Burn, then!');
      this.hallVentsOn = true;
      for (const v of this.vents) if (v.zone === 'hall') {
        v.active = true;
        v.t = rand(0.5, 2.5);
      }
      this.hint('The vents are waking. Keep moving.');
      const adds = [this.spawn(reachElite(), -18, 60), this.spawn(reachElite(), 18, 88)];
      void adds;
    }
    await this.until(() => orsk.hp < orsk.maxHp * 0.3 || !orsk.alive);
    if (orsk.alive) {
      this.bark('orsk', 'You fight like a woman who has never had to stay dead!');
      orsk.type.cooldown = [0.6, 1.2];
    }
    await this.until(() => orsk.hp <= 1.5 || !orsk.alive);
    this.bossBar(null);
    for (const v of this.vents) v.active = false;
    this.hallVentsOn = false;
    for (const a of [...this.actors]) if (a.team === 'enemy' && a !== orsk) this.removeActor(a);
    const cx = orsk.pos.x;
    const cz = orsk.pos.z;
    this.removeActor(orsk);
    const fallen = this.npc(forgeMaster().look, cx, cz, 0, 'none', 'orsk');
    fallen.faceToward(p.pos.x, p.pos.z);
    fallen.pose = 'kneel';
    this.cinematic(true);
    this.music('sorrow');
    this.twoShot(p, fallen, 1);
    await this.talk([
      ['orsk', 'Do it with the fire. Not that black thing. Please.'],
      ['ira', 'I\'m not going to do it at all.'],
      ['orsk', '...Then you are crueller than I thought.'],
    ]);
    await this.say('narrator', 'He is still kneeling there when she walks past him, toward the blue light at the back of the hall.');
    this.cinematic(false);
    this.goal('Find the glass plates', [0, 10.8, 104]);
    await this.reach(0, 102, 4, 'Find the glass plates');
    void this.hallVentsOn;
  }

  private async archive() {
    this.setCheckpoint('archive');
    const p = this.player;
    this.game.engine.applyLighting(FORGE);
    this.game.sfx.setAmbient('forge', 0.45);
    this.squad();
    this.music('dread');
    this.goal('Find your plate among the records', [2, 10.8, 108]);
    await this.interact(2, 108, 'Read the plate with your name on it', 2.4, 10.8);
    this.goal(null);
    this.cinematic(true);
    p.faceToward(2, 109);
    this.shot(2.8, 12.6, 106.2, 2, 12.2, 108.8, 1.2);
    this.sfx.play('glass', { pos: p.pos });
    await this.say('narrator', 'Most of the plates are cracked. The script is Halveth: a priest\'s careful hand, etched into the glass and lit from within.');
    this.music('silence');

    await this.game.ui.journal('A Wheel record · glass, cracked', 'SOLEN, IRA  ·  INSTANCE 47  ·  SOURCE: INSTANCE 46  ·  SOURCE: INST—', 5.5);
    this.game.music.stinger('reveal');
    this.closeUp(p, 1.6, 0.3);
    await this.say('ira', 'Instance.');
    await this.say('ira', 'Kaal. What\'s an instance?');
    await this.say('kaal', 'It\'s nothing. Old priest-words. It means a life.');
    this.game.engine.flash = 0.3;
    p.rig.flash('#b98cff', 0.5);
    await this.say('narrator', 'The violet line along the blade flickers. It does that when he lies.');
    const mira = this.mira;
    if (mira) {
      mira.aggro = false;
      mira.place(-1, 104, 0.4);
      this.twoShot(p, mira, -1);
      await this.say('mira', 'Ira? What does it say?');
    }
    await this.say('ira', 'It says forty-seven.');
    this.cinematic(false);
    this.goal('Leave the forge', [0, 10.8, 36]);
    this.music('tension');
    await this.reach(0, 37, 4, 'Leave the forge');
  }

  private async capture() {
    this.setCheckpoint('capture');
    const p = this.player;
    this.game.engine.applyLighting(DUSK_SNOW);
    this.game.sfx.setAmbient('forge', 0);
    this.game.sfx.setAmbient('wind', 0.5);
    this.squad();
    const mira = this.mira!;
    mira.aggro = false;
    this.music('silence');
    p.place(0, 33, Math.PI);
    mira.place(-1.8, 34, Math.PI);
    const sauvir = this.npc(LOOKS.sauvir, 0, 22, 0, 'stillSpear', 'sauvir');
    const ama = this.npc(LOOKS.ama, -4, 21, 0.2, 'axe', 'ama');
    const ws: Actor[] = [];
    for (let i = 0; i < 6; i++) ws.push(this.npc(reachLook(true), -9 + i * 3.6, 19 - (i % 2) * 2, 0, i % 2 ? 'axe' : 'stillSpear', 'warrior'));
    this.cinematic(true);
    this.shot(7, 13.5, 30, 0, 12, 23, Infinity);
    await this.fade(0, 1.2);
    await this.say('narrator', 'Dusk. The snow outside the forge gates is full of Reach warriors. At their head, a man with braids and a spear with a red ribbon tied to the shaft.');
    this.twoShot(p, sauvir, 1);
    await this.talk([
      ['sauvir', 'You read them.'],
      ['ira', 'You knew they were here.'],
      ['sauvir', 'I wanted you to see what we\'ve seen.'],
    ]);
    this.closeUp(ama, 2, 0.4);
    await this.say('ama', 'Alive, brother. You said alive. I still say burn her.');
    this.closeUp(p, 2, 0.3);
    await this.say('narrator', 'Ira looks at the warriors. At Mira. At the snow. Then she lays the black sword down in front of her.');
    p.pose = 'kneelBlade';
    await this.wait(1.2);
    p.rig.setWeapon('none');
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 1.4), mat('#120f17', { metal: 0.9 }));
    blade.position.set(p.pos.x, p.pos.y + 0.05, p.pos.z - 1.2);
    blade.rotation.y = 0.3;
    this.group.add(blade);
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.02, 1.3), glow(PALETTE.violet, 2.5));
    vein.position.copy(blade.position);
    vein.position.y += 0.04;
    vein.rotation.y = 0.3;
    this.group.add(vein);
    this.droppedBlade = [blade, vein];
    p.pose = null;
    void sauvir.goTo(0, 30, 1.6);
    await this.wait(2.2);
    this.twoShot(p, sauvir, -1);
    await this.say('sauvir', 'Not that. I won\'t touch that thing. Bring it yourself.');
    p.faceToward(mira.pos.x, mira.pos.z);
    this.twoShot(p, mira, 1);
    await this.say('narrator', 'She takes the memory book out of her coat and puts it in Mira\'s hands.');
    await this.talk([
      ['ira', 'Tell my brother I\'m reading.'],
      ['mira', 'Ira—'],
      ['ira', 'Tell him.'],
    ]);
    p.faceToward(sauvir.pos.x, sauvir.pos.z);
    p.pose = 'wristsOut';
    this.closeUp(p, 2.4, 0.6);
    await this.say('narrator', 'Then she walks over to him and holds out her wrists.');
    this.music('title');
    this.shot(0, 16, 44, 0, 12, 28, 0.5);
    await this.say('kaal', 'Well. This is new.');
    await this.fade(1, 2.2);
    this.group.remove(blade, vein);
    this.game.ui.setLetterbox(false);
    await this.card('End of Act I', 'AFTERLIGHT', 'Act II: Ashkar. The salt remembers the sea.', 4.5);
    this.game.completeChapter();
  }
}
