import * as THREE from 'three';
import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { Actor } from '../entities/Actor';
import type { Game } from '../Game';
import { LOOKS, halvethLook, glassEcho, corrowSpar } from '../entities/roster';
import { mat, glow, additive, PALETTE } from '../world/materials';
import { fbm } from '../core/util';

const ORDER = ['start', 'courtyard', 'blade', 'spar'];
const VIOLET_X = 600;

const DAY: LightingPreset = {
  sky: ['#5f7096', '#c9c0b4', '#e6d8c2'],
  fog: '#c4baa8',
  fogDensity: 0.011,
  sun: '#fff0d6',
  sunIntensity: 2.0,
  sunDir: [0.45, 0.62, 0.5],
  ambient: '#c0c4d8',
  ambientIntensity: 0.95,
  hemiGround: '#4a4238',
  exposure: 1.0,
  bloom: 0.6,
  suns: 2,
};

const VIOLET: LightingPreset = {
  sky: ['#0c0618', '#3b1d6e', '#8f62d8'],
  fog: '#2a1450',
  fogDensity: 0.018,
  sun: '#d9c2ff',
  sunIntensity: 1.4,
  sunDir: [0.2, 0.8, 0.3],
  ambient: '#9a7ae0',
  ambientIntensity: 1.1,
  hemiGround: '#1a0d33',
  exposure: 1.1,
  bloom: 1.1,
  suns: 1,
};

export class Chapter1 extends Level {
  readonly index = 1;
  readonly title = 'Instance Forty-Seven';
  readonly lighting = DAY;
  readonly ambient = { hall: 0.5, wind: 0.15 };
  private wheel: THREE.Group | null = null;
  private fluid: THREE.Mesh | null = null;

  constructor(game: Game) {
    super(game);
  }

  protected build() {
    const b = this.builder;
    b.terrain({
      size: 220,
      seg: 80,
      cz: 30,
      height: (x, z) => {
        const inFort = Math.abs(x) < 34 && z > -20 && z < 72;
        if (inFort) return 0;
        return fbm(x * 0.03, z * 0.03) * 6 + Math.max(0, Math.abs(x) - 34) * 0.08;
      },
      color: (x, z) => {
        const inFort = Math.abs(x) < 34 && z > -20 && z < 72;
        if (inFort) return new THREE.Color('#8a8070').lerp(new THREE.Color('#9d927e'), fbm(x * 0.3, z * 0.3));
        return new THREE.Color('#6b6f48').lerp(new THREE.Color('#8b8656'), fbm(x * 0.1, z * 0.1));
      },
    });
    const stone = mat(PALETTE.stone);
    const dark = mat(PALETTE.stoneDark);
    const light = mat(PALETTE.stoneLight);

    // ---- The Wheel hall: a long stone room of amber tanks.
    b.box(20, 0.2, 32, mat('#5d564d'), 0, -0.1, 0);
    b.box(1, 9, 32, stone, -10.5, 0, 0, 0, { collide: true });
    b.box(1, 9, 32, stone, 10.5, 0, 0, 0, { collide: true });
    b.box(22, 9, 1, stone, 0, 0, -16.5, 0, { collide: true });
    b.box(8.5, 9, 1, stone, -6.25, 0, 16.5, 0, { collide: true });
    b.box(8.5, 9, 1, stone, 6.25, 0, 16.5, 0, { collide: true });
    b.box(4, 3, 1, stone, 0, 6, 16.5);
    b.box(22, 0.6, 34, dark, 0, 9, 0, 0, { cast: true });
    for (let i = -3; i <= 3; i++) {
      b.box(1.2, 9, 1.2, light, -9.6, 0, i * 4.6);
      b.box(1.2, 9, 1.2, light, 9.6, 0, i * 4.6);
    }
    const tankGlass = mat('#ffcf7a', { transparent: true, opacity: 0.35, rough: 0.1, emissive: '#ff9a2a', emissiveIntensity: 0.6 });
    const fluid = additive('#ffb04a', 0.35);
    const brass = mat('#b08a4a', { metal: 0.8, rough: 0.35 });
    for (let i = -3; i <= 3; i++) {
      for (const s of [-1, 1]) {
        const x = s * 7;
        const z = i * 4.4;
        b.cyl(0.95, 1.05, 0.4, brass, x, 0, z, 12, true);
        const tg = b.cyl(0.85, 0.85, 2.8, tankGlass, x, 0.4, z, 12);
        tg.castShadow = false;
        const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 12), fluid);
        fl.position.set(x, 1.7, z);
        this.group.add(fl);
        b.cyl(0.95, 0.95, 0.3, brass, x, 3.2, z, 12);
        if ((i + s) % 3 === 0) {
          const shape = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), mat('#8a5a3a', { transparent: true, opacity: 0.55 }));
          shape.position.set(x, 1.7, z);
          this.group.add(shape);
        }
      }
    }
    // Ira's tank at the far end.
    b.cyl(1.2, 1.3, 0.4, brass, 0, 0, -12, 14, true);
    this.world.addFloor(0, -12, 2.2, 2.2, 0.4);
    const it = b.cyl(1.05, 1.05, 3.0, tankGlass, 0, 0.4, -12, 14);
    it.castShadow = false;
    this.fluid = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.9, 14), fluid);
    this.fluid.position.set(0, 1.85, -12);
    this.group.add(this.fluid);
    b.cyl(1.2, 1.2, 0.3, brass, 0, 3.4, -12, 14);
    for (const [x, z] of [
      [-5, -10],
      [5, -10],
      [-5, 8],
      [5, 8],
    ]) {
      const pl = new THREE.PointLight('#ffae5a', 8, 14, 2);
      pl.position.set(x, 3, z);
      this.group.add(pl);
    }
    // The great brass Wheel on the far wall.
    const wheel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 6, 40), brass);
    wheel.add(ring);
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 6.6, 0.12), brass);
      sp.rotation.z = (i / 12) * Math.PI;
      wheel.add(sp);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(PALETTE.wheelBlue, 2));
      const a = (i / 12) * Math.PI * 2;
      gem.position.set(Math.cos(a) * 3.4, Math.sin(a) * 3.4, 0.2);
      wheel.add(gem);
    }
    wheel.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 16).rotateX(Math.PI / 2), brass));
    wheel.position.set(0, 5.2, -15.7);
    this.group.add(wheel);
    this.wheel = wheel;
    b.banner(-4.5, 8, -15.9, '#3f4a66', 0, 1.4, 4);
    b.banner(4.5, 8, -15.9, '#3f4a66', 0, 1.4, 4);
    b.box(3, 0.9, 1.2, mat(PALETTE.wood), 4, 0, -7, 0.2, { collide: true });
    b.box(0.5, 0.05, 0.4, mat('#e6dcc6'), 4, 0.9, -7, 0.4);

    // ---- The courtyard of Kessel fortress.
    b.stoneWall(-30, 18, -30, 70, 7, 2, stone);
    b.stoneWall(30, 18, 30, 70, 7, 2, stone);
    b.stoneWall(-30, 18, -11, 18, 7, 2, stone);
    b.stoneWall(11, 18, 30, 18, 7, 2, stone);
    b.stoneWall(-30, 70, -5, 70, 7, 2, stone);
    b.stoneWall(5, 70, 30, 70, 7, 2, stone);
    b.tower(-30, 18, 6, 11, dark, mat('#5a3a2a'));
    b.tower(30, 18, 6, 11, dark, mat('#5a3a2a'));
    b.tower(-30, 70, 6, 11, dark, mat('#5a3a2a'));
    b.tower(30, 70, 6, 11, dark, mat('#5a3a2a'));
    b.tower(-7, 70, 5, 10, dark);
    b.tower(7, 70, 5, 10, dark);
    this.gate = b.box(9, 7, 0.6, mat(PALETTE.woodDark), 0, 0, 70, 0, { collide: true });
    // Barracks and stores.
    b.box(14, 5, 8, light, -20, 0, 34, 0, { collide: true });
    b.box(15, 0.5, 9, mat('#5a3a2a'), -20, 5, 34);
    b.box(12, 4.5, 7, light, 21, 0, 58, 0, { collide: true });
    b.box(13, 0.5, 8, mat('#5a3a2a'), 21, 4.5, 58);
    // Armoury rack.
    b.box(4, 0.2, 1, mat(PALETTE.wood), -12, 1.6, 28);
    b.box(0.2, 2, 0.2, mat(PALETTE.wood), -13.9, 0, 28);
    b.box(0.2, 2, 0.2, mat(PALETTE.wood), -10.1, 0, 28);
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), mat(PALETTE.wood));
      sp.position.set(-13.4 + i * 0.5, 1.2, 28.3);
      sp.rotation.z = 0.1;
      this.group.add(sp);
    }
    const ash = new THREE.Group();
    const ab = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.08), mat('#120f17', { metal: 0.9, rough: 0.25 }));
    const av = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.3, 0.015), glow(PALETTE.violet, 2.5));
    ash.add(ab, av);
    ash.position.set(-11, 1.0, 28.3);
    ash.rotation.z = -0.15;
    this.group.add(ash);
    this.ashRack = ash;
    // Training yard.
    for (const [x, z] of [
      [10, 36],
      [14, 34],
      [18, 38],
      [12, 42],
    ]) {
      b.cyl(0.08, 0.1, 1.8, mat(PALETTE.wood), x, 0, z, 6, true);
      b.box(1.0, 0.1, 0.1, mat(PALETTE.wood), x, 1.4, z);
      b.cyl(0.25, 0.25, 0.7, mat('#c9b88a'), x, 0.8, z, 8);
    }
    b.box(16, 0.08, 14, mat('#a08a6a'), 14, 0, 38);
    for (const [x, z] of [
      [-8, 20],
      [8, 20],
      [-24, 46],
      [24, 46],
      [-8, 66],
      [8, 66],
    ])
      b.torch(x, z, undefined, '#ffa347', false);
    b.banner(-10, 9, 19.2, '#3f4a66', Math.PI, 1.6, 4.5);
    b.banner(10, 9, 19.2, '#3f4a66', Math.PI, 1.6, 4.5);
    b.cart(-6, 50, 0.4);
    b.crate(-4, 52);
    b.crate(-3.2, 53, 0.8);
    b.barrel(5, 30);
    b.barrel(5.8, 30.8);
    b.scatterTrees(50, (r) => {
      const x = r.range(-110, 110);
      const z = r.range(-80, 140);
      return Math.abs(x) < 40 && z > -25 && z < 80 ? null : [x, z];
    }, 'pine', '#3d5233');

    // ---- Inside the blade: the violet plain.
    const glass = new THREE.Mesh(new THREE.CircleGeometry(80, 48), mat('#2a1650', { rough: 0.12, metal: 0.4, emissive: '#3a1a70', emissiveIntensity: 0.35 }));
    glass.rotation.x = -Math.PI / 2;
    glass.position.set(VIOLET_X, 0.02, 0);
    glass.receiveShadow = true;
    this.group.add(glass);
    this.world.addFloor(VIOLET_X, 0, 160, 160, 0.02);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 10 + Math.random() * 60;
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 2 + Math.random() * 6), glow('#c9a6ff', 1.5));
      crack.position.set(VIOLET_X + Math.cos(a) * r, 0.04, Math.sin(a) * r);
      crack.rotation.y = Math.random() * Math.PI;
      this.group.add(crack);
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(1.5 + Math.random() * 2, 0), mat('#5a34a8', { transparent: true, opacity: 0.6, emissive: '#5a2f9a', emissiveIntensity: 0.6 }));
      shard.position.set(VIOLET_X + Math.cos(a) * 45, 2 + Math.random() * 6, Math.sin(a) * 45);
      shard.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(shard);
      const spin = Math.random() * 0.4;
      b.updaters.push((dt) => (shard.rotation.y += dt * spin));
    }
  }

  private gate: THREE.Mesh | null = null;
  private ashRack: THREE.Group | null = null;

  spawnPoint(cp: string): Spawn {
    switch (cp) {
      case 'courtyard':
        return { x: 0, z: 20, facing: 0 };
      case 'blade':
        return { x: VIOLET_X, z: 8, facing: Math.PI };
      case 'spar':
        return { x: 10, z: 34, facing: 0.6 };
      default:
        return { x: 0, z: -9.5, facing: 0 };
    }
  }

  playerLook(): Look {
    return LOOKS.ira47;
  }

  playerWeapon(cp: string): WeaponKind {
    return cp === 'blade' || cp === 'spar' ? 'ashvow' : 'none';
  }

  protected setupPlayer(cp: string) {
    this.corrow = this.mira = this.pell = null;
    const p = this.player;
    p.canWrath = cp === 'spar' || cp === 'blade';
    p.maxHp = 130;
    p.hp = 130;
    this.world.boundsCenter.set(0, 20);
    this.world.boundsRadius = 200;
    if (this.ashRack) this.ashRack.visible = cp === 'start' || cp === 'courtyard';
    this.setViolet(cp === 'blade');
  }

  private setViolet(on: boolean) {
    this.game.engine.applyLighting(on ? VIOLET : DAY);
    this.game.engine.setStars(on ? 1 : 0);
    this.game.sfx.setAmbient('violet', on ? 0.6 : 0);
    this.game.sfx.setAmbient('hall', on ? 0 : 0.5);
  }

  protected tick(dt: number) {
    if (this.wheel) this.wheel.rotation.z += dt * 0.12;
  }

  protected async script(cp: string) {
    const at = (k: string) => ORDER.indexOf(cp) <= ORDER.indexOf(k);
    if (at('start')) await this.waking();
    if (at('courtyard')) await this.courtyard();
    if (at('blade')) await this.insideTheBlade();
    if (at('spar')) await this.spar();
  }

  private async waking() {
    const p = this.player;
    this.music('silence');
    this.cinematic(true);
    p.place(0, -12);
    p.rig.root.visible = false;
    const tankIra = this.npc(LOOKS.ira47Tank, 0, -12, 0, 'none', 'tankIra');
    tankIra.pose = 'tank';
    tankIra.pos.y = 0.45;
    const elias = this.npc(LOOKS.elias, 0.9, -8.8, Math.PI + 0.2, 'none', 'elias');
    const priest = this.npc(LOOKS.priest, -2.4, -9.5, Math.PI - 0.6, 'none', 'priest');
    priest.pose = 'talk';
    this.shot(0, 2.2, -8.2, 0, 1.9, -12, Infinity);
    await this.fade(1, 0.01);
    await this.wait(0.4);
    void this.fade(0, 3);
    this.sfx.play('heartbeat');
    await this.wait(1.4);
    this.sfx.play('heartbeat');
    await this.card('Eighty-two years later', 'INSTANCE FORTY-SEVEN', 'Kessel. The Wheel hall.', 3.6);
    this.music('dread');
    await this.say('priest', 'Instance confirmed. The mark holds. Draining now.');
    this.sfx.play('rumble', { pos: tankIra.pos });
    for (let i = 0; i < 40; i++) {
      if (this.fluid) {
        this.fluid.scale.y = Math.max(0.02, 1 - i / 40);
        this.fluid.position.y = 0.4 + 1.45 * this.fluid.scale.y;
      }
      await this.wait(0.05);
    }
    tankIra.pose = null;
    this.sfx.play('splash', { pos: tankIra.pos });
    this.closeUp(tankIra, 2.4, 0.2, 1.5);
    await this.wait(0.8);
    void tankIra.goTo(0, -9.6, 1.2);
    await this.wait(1.5);
    this.music('calm');
    this.twoShot(tankIra, elias, 1);
    await this.talk([
      ['elias', 'Welcome back.'],
      ['ira', 'Have we met?'],
      ['elias', 'Every time.'],
    ]);
    this.closeUp(elias, 2, -0.3);
    await this.talk([
      ['elias', 'I\'m your brother. Elias. You won\'t remember that either, and that\'s all right. It\'s written down.'],
      ['elias', 'You fell off a wall at Kessel. Life forty-six. You hit the ground before you finished swearing.'],
    ]);
    this.closeUp(tankIra, 2, 0.4);
    await this.talk([
      ['ira', 'That sounds like me.'],
      ['ira', '...Does it?'],
    ]);
    this.twoShot(tankIra, elias, -1);
    await this.say('elias', 'Here. Your book. Everything you lose, I keep. Read it when you can.');
    await this.say('ira', 'Forty-six.');
    await this.say('elias', 'Forty-seven now. Get dressed. Corrow\'s waiting in the yard, and he hates waiting.');
    await this.fade(1, 0.6);
    this.removeActor(tankIra);
    this.removeActor(priest);
    p.rig.root.visible = true;
    p.place(0, -9.6, 0);
    elias.place(1.6, -7.6, Math.PI + 0.6);
    this.cinematic(false);
    await this.fade(0, 0.8);
    this.hint('Your Memory Book is always one press away: {book}. Every death costs one memory, and the perk it grants.');
    await this.openBook();
    this.goal('Find Marshal Corrow in the courtyard', [0, 0, 24]);
    void this.shard(-8.2, 13.5, 'ch1-hall');
    void (async () => {
      await this.interact(0, -14, 'Look at the Wheel', 3.2);
      await this.say('ira', 'It\'s turning. Like it\'s waiting for something.');
      await this.say('elias', 'It always turns. It turned the day you were born and it\'ll turn the day the last of us stops.');
    })().catch(() => {});
    void (async () => {
      await this.interact(7, 4.4, 'Look into the tank', 2.2);
      await this.say('ira', 'Someone\'s growing in there.');
      await this.say('elias', 'Someone\'s always growing in there. Don\'t tap the glass. They can hear it.');
    })().catch(() => {});
    await this.reach(0, 24, 4, 'Find Marshal Corrow in the courtyard');
    this.removeActor(elias);
  }

  private corrow: Actor | null = null;
  private mira: Actor | null = null;
  private pell: Actor | null = null;

  private cast() {
    if (!this.corrow) {
      this.corrow = this.npc(LOOKS.corrow, 3, 30, Math.PI, 'sword', 'corrow');
      this.mira = this.npc(LOOKS.mira, 5.4, 31, Math.PI + 0.5, 'sword', 'mira');
      this.pell = this.npc(LOOKS.pell, 1.2, 31.6, Math.PI - 0.4, 'spear', 'pell');
      for (let i = 0; i < 6; i++) {
        const s = this.npc(halvethLook(i), -6 + (i % 3) * 3, 44 + Math.floor(i / 3) * 3, Math.PI * (i % 2), i % 2 ? 'spear' : 'sword', 'soldier');
        s.pose = i % 3 === 0 ? 'talk' : null;
      }
    }
    return { corrow: this.corrow!, mira: this.mira!, pell: this.pell! };
  }

  private async courtyard() {
    this.setCheckpoint('courtyard');
    const p = this.player;
    const { corrow, mira, pell } = this.cast();
    this.music('calm');
    this.cinematic(true);
    p.faceToward(corrow.pos.x, corrow.pos.z);
    this.twoShot(p, corrow, 1);
    corrow.faceToward(p.pos.x, p.pos.z);
    await this.talk([
      ['corrow', 'Solen. Look at the size of you. Who did they pour you into, a bear?'],
      ['ira', 'Do I know you?'],
      ['corrow', 'Dace Corrow. Marshal, these days. I\'ve known you longer than you\'ve known you.'],
    ]);
    this.closeUp(corrow, 1.8, 0.4);
    await this.say('corrow', 'Thirty-one rings. One for every time I came back. You taught me how to stand, once. Don\'t look at me like that. You did.');
    mira.faceToward(p.pos.x, p.pos.z);
    this.closeUp(mira, 2, -0.3);
    await this.talk([
      ['mira', 'Mira Kade! We were partners in the... you don\'t remember. That\'s fine! I remember enough for both of us.'],
      ['mira', 'And you\'ve got your scarf back. You always end up with that stupid scarf.'],
    ]);
    pell.faceToward(p.pos.x, p.pos.z);
    this.closeUp(pell, 1.8, 0.3);
    await this.talk([
      ['pell', 'P-Pell, Sergeant. First posting. First... life.'],
      ['ira', 'First life? Then stay behind me.'],
    ]);
    this.twoShot(p, corrow, -1);
    await this.say('corrow', 'Your sword\'s in the armoury. The black one. Nobody else will touch it. Says it hums at them.');
    this.cinematic(false);
    this.goal('Take your sword from the armoury rack', [-11, 0, 29]);
    await this.interact(-11.2, 29.4, 'Take the black sword', 2.4);
    if (this.ashRack) this.ashRack.visible = false;
    p.rig.setWeapon('ashvow');
    this.sfx.play('pickup');
    this.cinematic(true);
    this.closeUp(p, 2, 0.5);
    p.pose = 'raise';
    await this.wait(0.8);
    this.sfx.play('glass', { pos: p.pos });
    p.rig.flash('#b98cff', 1.0);
    this.game.engine.flash = 0.5;
    await this.say('narrator', 'Her hand closes around the hilt. The violet line along the blade wakes, and the world goes the colour of a bruise.');
    p.pose = null;
    await this.fade(1, 0.8, true);
  }

  private async insideTheBlade() {
    this.setCheckpoint('blade');
    const p = this.player;
    this.setViolet(true);
    p.place(VIOLET_X, 8, Math.PI);
    p.canWrath = false;
    const kaal = this.npc(LOOKS.kaal, VIOLET_X, -2, 0, 'none', 'kaal');
    kaal.pose = 'armsCrossed';
    this.music('wonder');
    this.cinematic(true);
    this.shot(VIOLET_X + 6, 2.5, 12, VIOLET_X, 1.6, 2, Infinity);
    await this.fade(0, 1.6, true);
    await this.say('kaal', 'You hum flat.');
    this.closeUp(p, 2.2, 0.4);
    await this.say('ira', '...Who said that?');
    this.twoShot(p, kaal, 1);
    await this.talk([
      ['kaal', 'Over here. I\'m the sword. Well. I\'m in the sword. This is the inside of it. Mind the cracks.'],
      ['ira', 'Swords don\'t talk.'],
      ['kaal', 'This one does. Only to you. You have carried me for eighty-two years and you have never once let me finish a sentence.'],
      ['ira', 'Eighty-two years.'],
      ['kaal', 'Forty-seven lives. I\'ve been with you for every one. Name\'s Kaal. You won\'t remember it, so I\'ll keep saying it.'],
    ]);
    this.closeUp(kaal, 2.4, -0.3);
    await this.say('kaal', 'Let\'s see what this body remembers. They\'re only echoes. They can\'t really hurt you in here. Well. Not much.');
    this.cinematic(false);

    this.goal('Fight the glass echoes');
    this.hint('Heavy attack with {heavy}. Slower, but it cracks posture and armour.');
    const w1 = [this.spawn(glassEcho(), VIOLET_X - 6, -8), this.spawn(glassEcho(), VIOLET_X + 6, -8)];
    await this.wait(3);
    this.hint('Lock on with {lock} so you never lose track of a target.');
    await this.allDown(w1);
    this.bark('kaal', 'Good. Again. This one won\'t fall over so easily.');
    await this.wait(1.5);
    const big = this.spawn({ ...glassEcho(), name: 'Glass Sentinel', hp: 90, posture: 50, look: { ...LOOKS.kaal, height: 1.25, build: 1.4, hairStyle: 'cropped' } }, VIOLET_X, -10);
    this.hint('Parry with a well-timed {block}, or land heavies, to fill the white posture bar. When it breaks, press {interact} to EXECUTE.');
    await this.allDown([big]);
    this.bark('kaal', 'There. You still lead with your left knee. Everyone who has ever wanted to kill you knows that.');
    await this.wait(3);
    this.bark('ira', 'Has anyone? Wanted to kill me?');
    await this.wait(2.2);
    this.bark('kaal', 'Let\'s just say you\'ve died on the same spear twelve times.');
    await this.wait(3.5);
    p.canWrath = true;
    p.wrath = 100;
    this.hint('Landing hits and parries fills Kaal\'s Wrath. It is full. Press {wrath} when they surround you.');
    const w3 = [
      this.spawn(glassEcho(), VIOLET_X - 7, -6),
      this.spawn(glassEcho(), VIOLET_X + 7, -6),
      this.spawn(glassEcho(), VIOLET_X - 5, 6),
      this.spawn(glassEcho(), VIOLET_X + 5, 6),
    ];
    await this.allDown(w3);
    this.goal(null);
    this.cinematic(true);
    this.twoShot(p, kaal, -1);
    await this.talk([
      ['kaal', 'Better. Go on, then. Corrow will want to knock you over a few times before tomorrow.'],
      ['ira', 'What happens tomorrow?'],
      ['kaal', 'A gate. A bell tower. A man with a spear who knows exactly how you stand.'],
      ['ira', 'How do you know that?'],
    ]);
    this.closeUp(kaal, 2.2, 0.2);
    await this.say('kaal', 'Lucky guess.');
    await this.say('narrator', 'Outside, in the real yard, the violet vein along the blade flickers once. It does that when he lies.');
    await this.fade(1, 0.8, true);
    this.removeActor(kaal);
    this.setViolet(false);
  }

  private async spar() {
    this.setCheckpoint('spar');
    const p = this.player;
    const { corrow, mira, pell } = this.cast();
    p.place(10, 34, 0.6);
    this.setViolet(false);
    corrow.place(15, 40, Math.PI + 0.6);
    mira.place(6, 42, 1.2);
    pell.place(7, 44, 1.6);
    void this.fade(0, 1, true);
    this.music('tension');
    this.cinematic(true);
    this.twoShot(p, corrow, 1);
    await this.talk([
      ['corrow', 'You went somewhere. You always go somewhere when you pick that thing up.'],
      ['corrow', 'Training yard. Show me you still stand right. Blunted edges, and I\'ll go easy on the big new body.'],
    ]);
    this.cinematic(false);
    this.removeActor(corrow);
    const spar = this.spawn(corrowSpar(), 15, 40);
    spar.damageTakenMul = 1;
    this.bossBar(spar);
    this.playerProtected = true;
    this.goal('Spar with Corrow: break his guard');
    this.music('combat');
    this.hint('Corrow blocks a lot. Parry his swings with {block} to crack his posture.');
    const minHp = spar.maxHp * 0.3;
    spar.minHp = minHp;
    await this.until(() => spar.state === 'stagger' || spar.hp <= minHp + 1 || !spar.alive);
    this.bossBar(null);
    this.playerProtected = false;
    p.hp = p.maxHp;
    const cx = spar.pos.x;
    const cz = spar.pos.z;
    this.removeActor(spar);
    const c2 = this.npc(LOOKS.corrow, cx, cz, 0, 'sword', 'corrow');
    this.corrow = c2;
    c2.faceToward(p.pos.x, p.pos.z);
    this.music('calm');
    this.cinematic(true);
    this.twoShot(p, c2, 1);
    await this.talk([
      ['corrow', 'Ha! There. Weight forward. You always lead with the left. Always did.'],
      ['corrow', 'The Litany Gate. Tomorrow, at dusk. The Reach have held it for a month and the Empress wants it back.'],
      ['corrow', 'Get some sleep. Kade, Pell: you\'re with Solen.'],
    ]);
    this.cinematic(false);

    this.goal('Join Pell at the gate', [2, 0, 64]);
    void pell.goTo(1.5, 64, 2.2);
    void mira.goTo(-2.5, 63, 2.2);
    await this.reach(2, 63, 4, 'Join Pell at the gate');
    this.cinematic(true);
    pell.faceToward(p.pos.x, p.pos.z);
    this.twoShot(p, pell, 1);
    await this.talk([
      ['pell', 'Sergeant? Can I ask you something? What\'s it like? Dying?'],
      ['ira', 'It\'s like missing a stair in the dark. You lurch, and then you\'re somewhere else.'],
      ['pell', 'That doesn\'t sound so bad.'],
      ['ira', 'It isn\'t. The coming back is the hard part.'],
    ]);
    this.closeUp(p, 1.8, 0.4);
    await this.say('kaal', 'You don\'t know where that phrase came from.');
    await this.say('ira', 'Neither does he.');
    await this.say('narrator', 'Pell\'s mark glows a clean, steady blue. First life. He has never been anywhere but here.');
    this.music('title');
    if (this.gate) this.gate.position.y = 6.5;
    this.sfx.play('rumble');
    await this.fade(1, 1.4);
    await this.card('End of Chapter One', 'INSTANCE FORTY-SEVEN', '', 2.6);
    this.game.completeChapter();
  }
}
