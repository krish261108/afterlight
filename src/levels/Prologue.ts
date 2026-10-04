import * as THREE from 'three';
import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { Actor } from '../entities/Actor';
import type { Fighter, FighterType } from '../entities/Fighter';
import { LOOKS, recruitLook, reachSpear, reachAxe, reachArcher, reachElite, reachBrute, reachLook } from '../entities/roster';
import { mat, PALETTE } from '../world/materials';
import { fbm, smoothstep, rand } from '../core/util';

const ORDER = ['start', 'bridge', 'blade', 'hold2'];
const BRIDGE_X0 = -12.5;
const BLADE = new THREE.Vector3(-4.5, 0, 5.5);

export class Prologue extends Level {
  readonly index = 0;
  readonly title = 'Kessel Ford';
  readonly lighting: LightingPreset = {
    sky: ['#4a5d92', '#e6b088', '#f6d3a3'],
    fog: '#d9c2a4',
    fogDensity: 0.0085,
    sun: '#ffd9ae',
    sunIntensity: 2.3,
    sunDir: [0.62, 0.5, 0.42],
    ambient: '#c7b8d8',
    ambientIntensity: 0.95,
    hemiGround: '#4a3b28',
    exposure: 1.05,
    bloom: 0.55,
    suns: 1,
  };
  readonly ambient = { river: 0.45, wind: 0.25 };
  private crossed = 0;
  private crossCap = 0;
  private crossing = false;
  private inFlight = 0;
  private crossT = 0;
  private recruitIdx = 0;
  private bladeGlint: THREE.PointLight | null = null;
  private bladeMesh: THREE.Group | null = null;

  constructor(game: import('../Game').Game) {
    super(game);
    this.firstLife = true;
  }

  private riverCenter(z: number) {
    return Math.sin(z * 0.018) * 5 * smoothstep(14, 50, Math.abs(z));
  }

  protected build() {
    const b = this.builder;
    const hill = (x: number, z: number, cx: number, cz: number, r: number, h: number) => h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
    b.terrain({
      size: 260,
      seg: 130,
      cz: -30,
      height: (x, z) => {
        const d = Math.abs(x - this.riverCenter(z));
        let h = fbm(x * 0.025 + 3, z * 0.025) * 2.4 - 0.6;
        if (d < 10) h = Math.min(h, -1.85 + (d / 10) ** 2 * 1.75);
        else h += Math.max(0, d - 12) * 0.03;
        h += hill(x, z, -48, -28, 20, 7) + hill(x, z, 30, -60, 30, 9) + hill(x, z, -80, -110, 40, 14) + hill(x, z, 60, 30, 26, 6);
        const road = Math.abs(x - (-22 + Math.sin(z * 0.05) * 3));
        if (road < 2.2 && z < -2 && z > -95) h -= 0.05;
        // Level ground where the bridge meets each bank.
        const ax = Math.abs(x);
        if (Math.abs(z) < 9 && ax > 10.5 && ax < 28) {
          const k = smoothstep(9, 5, Math.abs(z)) * smoothstep(28, 22, ax) * smoothstep(10.5, 12, ax);
          h = h * (1 - k) - 0.12 * k;
        }
        return h;
      },
      color: (x, z, h) => {
        const d = Math.abs(x - this.riverCenter(z));
        if (d < 9.5) return new THREE.Color('#5c4a34').lerp(new THREE.Color('#7a6648'), Math.random() * 0.3);
        const road = Math.abs(x - (-22 + Math.sin(z * 0.05) * 3));
        if (road < 2.2 && z < -2 && z > -95) return new THREE.Color('#8a7556');
        const c = new THREE.Color('#6f7a3c').lerp(new THREE.Color('#a39a52'), fbm(x * 0.08, z * 0.08));
        if (h > 5) c.lerp(new THREE.Color('#7d7a5a'), 0.4);
        return c;
      },
    });
    b.water(0, -30, 30, 260, -0.95, '#8a7656', 0.22);

    // The bridge: one cart wide.
    const stone = mat(PALETTE.stone);
    const dark = mat(PALETTE.stoneDark);
    const deckY = 0.3;
    b.box(26, 0.5, 3.2, stone, 0, deckY - 0.5, 0, 0, { floor: true });
    for (const s of [-1, 1]) {
      b.box(24, 0.85, 0.32, stone, 0, deckY, s * 1.76, 0, { collide: true });
      for (let i = -5; i <= 5; i++) b.box(0.42, 0.25, 0.42, dark, i * 2.3, deckY + 0.85, s * 1.76);
    }
    for (const x of [-7.5, 0, 7.5]) {
      b.box(2.2, 2.6, 3.6, dark, x, -2.3, 0, 0, { collide: true });
      b.box(2.6, 0.4, 4.0, stone, x, -0.3, 0);
    }
    for (const s of [-1, 1]) {
      b.box(2.5, 0.6, 4.6, dark, s * 13.6, deckY - 0.6, 0, 0, { floor: true });
    }
    // Bridgehead flagstones on the west bank.
    b.box(9, 0.2, 8, mat('#9a8f7b'), -18, -0.05, 0, 0, { floor: true });

    // Camp in the north, where the recruits slept.
    const tentC = ['#8a7a5c', '#7a6a4c', '#94845e', '#6c5e44'];
    [
      [-46, -88],
      [-40, -94],
      [-33, -90],
      [-50, -80],
      [-30, -80],
      [-44, -74],
    ].forEach(([x, z], i) => b.tent(x, z, 0.85 + (i % 3) * 0.1, tentC[i % 4], i));
    b.flame(-39, b.world.terrain(-39, -84) + 0.1, -84, '#ffa04a', true, 1.6);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.box(0.3, 0.2, 0.3, dark, -39 + Math.sin(a) * 0.9, b.world.terrain(-39, -84) - 0.05, -84 + Math.cos(a) * 0.9);
    }
    b.cart(-34, -76, 0.6);
    b.crate(-32.5, -75, 0.9, 0.3);
    b.barrel(-33, -78);
    b.banner(-36, b.world.terrain(-36, -86) + 3.4, -86, '#6d7280', 0.4);
    b.cyl(0.05, 0.05, 3.5, mat(PALETTE.woodDark), -36, b.world.terrain(-36, -86), -86, 5);

    // Nature.
    const outside = (x: number, z: number) => Math.abs(x - this.riverCenter(z)) > 11 && !(Math.abs(x + 18) < 7 && Math.abs(z) < 6) && Math.abs(x - (-22 + Math.sin(z * 0.05) * 3)) > 3.5;
    b.scatterGrass(5000, (r) => {
      const x = r.range(-90, 70);
      const z = r.range(-120, 50);
      return outside(x, z) ? [x, z] : null;
    }, '#6d7a38', '#b4a95a');
    b.scatterTrees(80, (r) => {
      const x = r.range(-110, 100);
      const z = r.range(-150, 80);
      const near = Math.hypot(x + 20, z) < 30 || Math.hypot(x + 40, z + 84) < 16;
      return outside(x, z) && !near && Math.abs(x + 22) > 8 ? [x, z] : null;
    }, 'round', '#5d7038');
    b.scatterTrees(50, (r) => {
      const x = r.range(-140, 140);
      const z = r.range(-170, 110);
      return Math.hypot(x + 10, z + 20) > 70 ? [x, z] : null;
    }, 'pine', '#3d5233');
    b.scatterRocks(60, (r) => {
      const x = r.range(-60, 50);
      const z = r.range(-100, 40);
      return outside(x, z) ? [x, z] : null;
    }, '#8a8070', 0.3, 1.6, 1.0);
    b.scatterRocks(40, (r) => {
      const z = r.range(-120, 60);
      return [this.riverCenter(z) + r.range(-9, 9), z];
    }, '#6a5e50', 0.2, 0.7, 99);

    // The black blade, waiting in the silt for eighty-two years... no, for a thousand.
    const g = new THREE.Group();
    const black = mat('#120f17', { metal: 0.9, rough: 0.25 });
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.9, 0.09), black);
    bl.position.y = 0.2;
    bl.rotation.z = 0.4;
    g.add(bl);
    g.position.set(BLADE.x, this.world.terrain(BLADE.x, BLADE.z), BLADE.z);
    this.group.add(g);
    this.bladeMesh = g;
    this.bladeGlint = new THREE.PointLight('#b98cff', 0, 5, 2);
    this.bladeGlint.position.set(BLADE.x, g.position.y + 0.4, BLADE.z);
    this.group.add(this.bladeGlint);

    this.world.killY = -20;
  }

  spawnPoint(cp: string): Spawn {
    switch (cp) {
      case 'bridge':
        return { x: -16, z: 0, facing: -Math.PI / 2 };
      case 'blade':
        return { x: -6.5, z: 6.5, facing: Math.PI / 2 };
      case 'hold2':
        return { x: -16, z: 0, facing: -Math.PI / 2 };
      default:
        return { x: -41, z: -82, facing: Math.PI * 0.8 };
    }
  }

  playerLook(): Look {
    return LOOKS.ira1;
  }

  playerWeapon(cp: string): WeaponKind {
    return cp === 'hold2' ? 'ashvow' : cp === 'blade' ? 'brokenSword' : 'conscript';
  }

  protected setupPlayer(cp: string) {
    const p = this.player;
    p.canWrath = cp === 'hold2';
    p.canHum = true;
    p.maxHp = 100;
    p.hp = 100;
    this.world.boundsRadius = 200;
    this.world.boundsCenter.set(0, 0);
    if (this.bladeMesh) this.bladeMesh.visible = cp !== 'hold2';
    if (this.bladeGlint) this.bladeGlint.intensity = 0;
  }

  protected tick(dt: number) {
    if (this.bladeGlint && this.bladeGlint.intensity > 0) this.bladeGlint.intensity = 2.5 + Math.sin(this.time * 4) * 1.2;
    if (!this.crossing) return;
    this.crossT -= dt;
    if (this.crossT <= 0 && this.crossed + this.inFlight < this.crossCap && this.inFlight < 5) {
      this.crossT = rand(2.4, 3.6);
      this.sendRecruit();
    }
    this.counter = { n: `${this.crossed} / 41`, label: 'Recruits across the bridge' };
  }

  private sendRecruit() {
    const i = this.recruitIdx++;
    const side = i % 2 ? 1 : -1;
    const r = this.npc(recruitLook(i), BRIDGE_X0 - 3, side * 3.2, Math.PI / 2, 'none', 'recruit');
    this.inFlight++;
    const run = async () => {
      await r.goTo(BRIDGE_X0 - 1.6, side * 0.55, 4.6);
      await r.goTo(13, side * 0.55, 4.8);
      await r.goTo(22, side * 3 + rand(-2, 2), 4.2);
      this.inFlight--;
      this.crossed = Math.min(41, this.crossed + 1);
      this.removeActor(r);
    };
    void run();
  }

  // ----------------------------------------------------------------- script

  protected async script(cp: string) {
    const at = (k: string) => ORDER.indexOf(cp) <= ORDER.indexOf(k);
    if (at('start')) await this.camp();
    if (at('bridge')) await this.holdOne(cp === 'bridge');
    if (at('blade')) await this.theBlade();
    if (at('hold2')) await this.holdTwo();
    await this.ending();
  }

  private async camp() {
    const p = this.player;
    this.music('silence');
    const corrow = this.npc(LOOKS.corrow, -38.2, -80.6, -2.2, 'sword', 'corrow');
    corrow.rig.root.scale.setScalar(1.08);
    const nell = this.npc(recruitLook(1), -43, -86.5, 0.6, 'none', 'nell');
    const bryn = this.npc(recruitLook(2), -43.8, -85.6, 0.8, 'none', 'bryn');
    const tam = this.npc(recruitLook(3), -36.5, -86, -0.8, 'none', 'tam');
    const hob = this.npc(recruitLook(4), -40.5, -82.2, 2.6, 'none', 'hob');
    const sitters: Actor[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      const s = this.npc(recruitLook(10 + i), -39 + Math.sin(a) * 2.4, -84 + Math.cos(a) * 2.4, a + Math.PI, 'none', 'sitter');
      s.pose = 'sit';
      sitters.push(s);
    }
    nell.pose = 'talk';
    p.pose = 'sit';

    this.cinematic(true);
    this.shot(-30, 6, -96, -40, 0.5, -83, Infinity);
    await this.fade(1, 0.01);
    await this.fade(0, 2.5);
    await this.card('Eighty-two years before Afterlight', 'KESSEL FORD', 'The First Border War. A conscript camp beside a brown river. First light.', 4.2);
    this.music('calm');
    this.shot(-36, 2.8, -78, -40, 1.0, -82.5, 1.6);
    await this.say('narrator', 'Forty-one recruits woke cold and frightened in a camp they were never meant to be in. Somewhere between them and home: a Reach war-band.');
    this.closeUp(p, 2.4, 0.6);
    await this.talk([
      ['corrow', 'Solen. Maps won\'t get us home.'],
      ['ira1', 'They might, Sergeant. There\'s a bridge two hours downstream. Narrow. One cart wide.'],
      ['ira1', 'If we get across it, they can\'t follow us in numbers.'],
      ['corrow', 'Where\'d you learn to do that?'],
      ['ira1', 'Nowhere. I just like knowing where things are.'],
    ]);
    this.twoShot(p, corrow, 1);
    await this.say('corrow', 'Then show me. Up. Everyone up! We march in ten.');
    p.pose = null;
    for (const s of sitters) s.pose = null;
    this.cinematic(false);
    this.hint('Move with {move}. Look around with {look}.');

    // Optional: the letter, and the recruits' names.
    this.goal('Fold up your letter home', [-41.6, 0, -83.2]);
    void (async () => {
      await this.interact(-36.5, -86, 'Talk to the farm boy', 2.2);
      await this.talk([
        ['tam', 'I\'ve never seen a city. Is Halcyra really built on a giant?'],
        ['ira1', 'On his back. The hills are his spine. You\'ll see it.'],
        ['tam', 'You promise?'],
        ['ira1', 'I don\'t make promises before breakfast.'],
      ]);
    })().catch(() => {});
    void (async () => {
      await this.interact(-43.4, -86, 'Talk to the twins', 2.4);
      await this.talk([
        ['nell', 'Bryn says the Reach eat their prisoners.'],
        ['bryn', 'I said they BURN them. With white fire. So they can\'t come back.'],
        ['ira1', 'Then don\'t get caught. Either of you.'],
      ]);
    })().catch(() => {});
    void (async () => {
      await this.interact(-40.5, -82.2, 'Talk to the baker', 2.2);
      await this.talk([
        ['hob', 'Bread? It\'s only a little stale. Fourth day.'],
        ['ira1', 'Hob, it\'s a weapon at this point.'],
        ['hob', 'Then I\'m the best-armed man in the company.'],
      ]);
    })().catch(() => {});
    await this.interact(-41.6, -83.2, 'Read your letter home', 2.0);
    this.goal(null);
    await this.journal('Study hard. Eat something green. And if anything happens to me, Elias, don\'t you dare.', 'A letter to her brother, folded small');

    // March.
    this.goal('March with Corrow to the bridge', [-22, 0, -40]);
    const column: Actor[] = [nell, bryn, tam, hob, ...sitters.slice(0, 3)];
    void corrow.goTo(-24, -60, 2.6).then(() => corrow.goTo(-22, -42, 2.6));
    column.forEach((a, i) => void a.goTo(-23 + (i % 2) * 1.5, -64 - i * 1.6, 2.5).then(() => a.goTo(-22.5 + (i % 2) * 1.4, -47 - i * 1.6, 2.5)));
    for (const s of sitters.slice(3)) this.removeActor(s);
    await this.until(() => p.pos.z > -70 || this.time > 9999);
    this.bark('corrow', 'The quartermaster says you signed Stilled papers. No Wheel. One life.');
    await this.wait(4);
    this.bark('ira1', 'I did.');
    await this.wait(2.5);
    this.bark('corrow', 'You\'re missing out. I\'ve had nineteen. It gets easier.');
    await this.wait(4);
    this.bark('ira1', 'That\'s what I\'m afraid of. My mother said one life is enough, if you spend it on something.');
    await this.wait(5.5);
    this.bark('corrow', 'And what are you spending yours on?');
    await this.wait(3);
    this.bark('ira1', 'I\'ll let you know.');
    await this.reach(-22, -45, 5, 'March with Corrow to the bridge');

    // Ambush.
    this.music('tension');
    this.bark('corrow', 'Down! Reach scouts in the reeds!');
    for (const a of column) a.pose = 'cower';
    corrow.pose = 'block';
    const scouts = [this.spawn(reachSpear(), -30, -36), this.spawn(reachSpear(), -14, -34), this.spawn(reachAxe(), -24, -28)];
    for (const s of scouts) s.maxHp = s.hp = 38;
    await this.wait(0.6);
    this.music('combat');
    this.hint('Attack with {light}. Tap it again quickly to chain a combo.');
    await this.wait(5);
    this.hint('Hold {block} to block. Tap it just as a blow lands to PARRY.');
    await this.wait(6);
    this.hint('Dodge roll with {dodge}. You cannot be hurt mid-roll.');
    await this.allDown(scouts);
    this.music('calm');
    corrow.pose = null;
    for (const a of column) a.pose = null;
    await this.wait(1);
    this.bark('corrow', 'Not bad, Solen. Not bad at all. Keep moving.');
    this.hint('Hum by holding {hum}. It steadies you and slowly heals.');
    void this.shardFake();
    this.goal('Reach the bridge', [-18, 0, 0]);
    void corrow.goTo(-20, -12, 3);
    column.forEach((a, i) => void a.goTo(-19 - (i % 3), -16 - i * 1.4, 3));
    await this.reach(-18, -3, 5, 'Reach the bridge');

    // The bridge.
    this.cinematic(true);
    this.music('dread');
    this.shot(-8, 3.5, 7, -20, 1.4, -4, 1.8);
    await this.say('narrator', 'The bridge was exactly as narrow as she drew it. The war-band came over the hill behind them just as they reached it.');
    const raiders: Actor[] = [];
    for (let i = 0; i < 7; i++) {
      const r = this.npc(reachLook(i === 0), -50 + (i % 4) * 2, -26 - Math.floor(i / 4) * 2, Math.PI * 0.35, i % 2 ? 'axe' : 'spear', 'raider');
      raiders.push(r);
      void r.goTo(-40 + (i % 4) * 1.6, -16 - Math.floor(i / 4) * 2, 3.5);
    }
    this.shot(-26, 4, -10, -44, 3, -24, 1.4);
    await this.wait(2.2);
    this.sfx.play('arrow', { pos: corrow.pos });
    await this.wait(0.3);
    corrow.pose = 'kneel';
    corrow.rig.flash('#ffffff', 0.3);
    this.sfx.play('hitHeavy', { pos: corrow.pos });
    this.closeUp(corrow, 2.4, 0.5);
    await this.say('narrator', 'A stillfire arrow took Corrow in the leg. He went down hard, and the recruits panicked.');
    this.twoShot(p, nell, 1);
    await this.say('ira1', 'You two. Get the sergeant across. Carry him. Everyone else, across, now. Don\'t stop. Don\'t look back.');
    this.closeUp(corrow, 2.0, -0.6);
    await this.say('corrow', 'Solen, you can\'t hold that alone—');
    this.closeUp(p, 2.2, 0.3);
    await this.say('ira1', 'One cart wide, Sergeant. I can hold one cart.');
    for (const r of raiders) this.removeActor(r);
    for (const a of [corrow, nell, bryn, tam, hob, ...column]) if (this.actors.includes(a)) this.removeActor(a);
    this.cinematic(false);
  }

  private async shardFake() {
    // No memory shards in a first life; nothing has been lost yet.
  }

  private holdWaves(phase: 1 | 2): (() => FighterType)[][] {
    if (phase === 1)
      return [
        [reachSpear, reachSpear, reachAxe],
        [reachAxe, reachSpear, reachAxe, () => reachArcher()],
        [reachSpear, reachAxe, reachSpear, reachAxe],
      ];
    return [
      [reachSpear, reachAxe, reachSpear, () => reachArcher(), reachAxe],
      [reachElite, reachAxe, reachSpear, reachAxe],
      [reachBrute, reachSpear, () => reachArcher(true), reachAxe],
      [reachElite, reachSpear, reachAxe, reachSpear, reachElite],
    ];
  }

  private spawnPoints = [
    [-44, -12],
    [-46, 6],
    [-40, -24],
    [-48, -2],
    [-38, 14],
    [-42, 18],
  ];

  private async runWaves(phase: 1 | 2) {
    const waves = this.holdWaves(phase);
    for (let w = 0; w < waves.length; w++) {
      const list: Fighter[] = [];
      waves[w].forEach((fn, i) => {
        const [x, z] = this.spawnPoints[(i + w * 2) % this.spawnPoints.length];
        const f = this.spawn(fn(), x + rand(-2, 2), z + rand(-2, 2));
        if (phase === 1) f.damageDealtMul *= 0.85;
        list.push(f);
      });
      if (w === 0) this.bark('ira1', phase === 1 ? 'Come on, then.' : 'Again.');
      await this.allDown(list);
      await this.wait(phase === 1 ? 3 : 2.2);
    }
  }

  private async holdOne(fresh: boolean) {
    this.setCheckpoint('bridge');
    this.crossed = 0;
    this.inFlight = 0;
    this.crossCap = 20;
    this.crossing = true;
    this.crossT = 0.5;
    this.world.boundsCenter.set(-20, 0);
    this.world.boundsRadius = 24;
    this.music('combat');
    this.goal('Hold the bridge until the recruits are across');
    if (fresh) this.hint('Lock on to a target with {lock}. Fill an enemy\'s white posture bar to stagger them, then press {interact} to execute.');
    await this.runWaves(1);
    await this.until(() => this.crossed >= 20);
    this.crossing = false;

    // The sword breaks.
    const p = this.player;
    this.cinematic(true);
    this.music('dread');
    const brute = this.npc(reachLook(true), p.pos.x - 2.6, p.pos.z, Math.PI / 2, 'hammer', 'breaker');
    brute.rig.root.scale.setScalar(1.25);
    p.faceToward(brute.pos.x, brute.pos.z);
    this.twoShot(p, brute, 1, 3);
    await this.wait(0.6);
    p.blocking = true;
    brute.pose = 'raise';
    await this.wait(0.5);
    brute.pose = null;
    this.sfx.play('break', { pos: p.pos });
    this.particles.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z), 30, '#ffffff', 6, 0.5, 0.12);
    p.rig.setWeapon('brokenSword');
    this.shake(0.5);
    p.blocking = false;
    await this.say('narrator', 'Halfway through, her sword broke.');
    await this.fade(1, 0.35);
    this.removeActor(brute);
    p.place(-6.5, 6.5, Math.PI / 2);
    this.sfx.play('splash', { pos: p.pos });
    this.closeUp(p, 3, 0.8, Infinity);
    await this.fade(0, 0.5);
    this.cinematic(false);
  }

  private async theBlade() {
    this.setCheckpoint('blade');
    const p = this.player;
    this.crossed = 20;
    this.counter = { n: '20 / 41', label: 'Recruits across the bridge' };
    this.world.boundsCenter.set(-12, 2);
    this.world.boundsRadius = 18;
    this.music('silence');
    if (this.bladeGlint) this.bladeGlint.intensity = 2.5;
    if (this.bladeMesh) this.bladeMesh.visible = true;
    this.goal('Find something to fight with', [BLADE.x, this.world.terrain(BLADE.x, BLADE.z), BLADE.z]);
    this.bark('ira1', 'No. No, no, no—');
    await this.interact(BLADE.x, BLADE.z, 'Lift the black blade from the silt', 2.0);
    this.goal(null);
    this.cinematic(true);
    p.faceToward(BLADE.x, BLADE.z);
    p.pose = 'lift';
    this.closeUp(p, 2.2, 0.9);
    await this.wait(1);
    if (this.bladeMesh) this.bladeMesh.visible = false;
    if (this.bladeGlint) this.bladeGlint.intensity = 0;
    p.rig.setWeapon('ashvow');
    p.pose = 'raise';
    this.sfx.play('splash', { pos: p.pos });
    await this.say('narrator', 'Her hand closed on something cold under the water: a long black blade, half-buried in the silt. She didn\'t know what it was. She didn\'t care.');
    p.pose = null;
    this.cinematic(false);
    this.goal('Hum, the way you always do when you\'re frightened');
    this.hint('Hold {hum} to hum.');
    const start = p.humTime;
    await this.until(() => p.humTime - start > 2.6);
    this.cinematic(true);
    this.music('wonder');
    p.rig.flash('#b98cff', 1.2);
    this.sfx.play('glass', { pos: p.pos });
    this.game.engine.flash = 0.35;
    this.closeUp(p, 1.8, 0.2);
    await this.say('narrator', 'The violet line along the blade flickered awake. A voice, younger and less tired than it will be:');
    await this.say('kaal', 'That song.');
    await this.wait(0.6);
    await this.say('kaal', 'Hold the bridge, then.');
    p.canWrath = true;
    p.wrath = 100;
    this.sfx.stopHum();
    p.humming = false;
    this.cinematic(false);
    this.hint('Your Wrath bar is full. Press {wrath} to unleash Kaal\'s Wrath.');
    this.goal('Climb back up to the bridge', [-16, 0, 0]);
    await this.reach(-16, 0, 4, 'Climb back up to the bridge');
  }

  private async holdTwo() {
    this.setCheckpoint('hold2');
    this.crossed = 20;
    this.inFlight = 0;
    this.crossCap = 40;
    this.crossing = true;
    this.crossT = 0.5;
    this.player.canWrath = true;
    this.world.boundsCenter.set(-20, 0);
    this.world.boundsRadius = 24;
    this.music('boss');
    this.goal('Hold the bridge');
    await this.runWaves(2);
    await this.until(() => this.crossed >= 40 && this.inFlight === 0);
    this.crossCap = 41;
    this.crossed = 41;
    this.crossing = false;
    this.counter = { n: '41 / 41', label: 'Recruits across the bridge' };
  }

  private async ending() {
    const p = this.player;
    this.playerProtected = true;
    this.goal(null);
    this.cinematic(true);
    this.music('sorrow');
    for (const a of [...this.actors]) if (a !== p && a.team === 'enemy') this.removeActor(a);
    p.place(BRIDGE_X0 + 0.6, 0, -Math.PI / 2);
    const tam = this.npc(recruitLook(3), 11, 0.3, Math.PI / 2, 'none', 'tam');
    const corrow = this.npc(LOOKS.corrow, 17, -2.2, -Math.PI / 2, 'none', 'corrow');
    corrow.pose = 'kneel';
    this.npc(recruitLook(1), 16.2, -3.2, -Math.PI / 2, 'none', 'nell');
    this.npc(recruitLook(2), 17.8, -1.2, -Math.PI / 2, 'none', 'bryn');
    this.shot(20, 2.5, 5, 14, 1, 0, Infinity);
    void tam.goTo(16, 1.5, 3).then(() => (tam.pose = 'sit'));
    await this.say('narrator', 'The counter reached forty-one. The last recruit, the farm boy, stumbled off the far end of the bridge and fell into the grass, sobbing.');
    this.shot(19, 2.2, -5, 16, 1.2, -2, 1.6);
    await this.say('narrator', 'On the far bank, the twins held Corrow up between them. He was looking back.');
    p.pose = 'kneelBlade';
    this.shot(BRIDGE_X0 - 3, 1.2, 2.6, BRIDGE_X0 + 0.6, 0.9, 0, 1.4);
    await this.say('narrator', 'She went down on one knee at the near end of the bridge. Left knee first.');
    const ys = this.npc(LOOKS.ysoldeYoung, -26, -1, Math.PI / 2, 'stillSpear', 'ysolde');
    const ws: Actor[] = [];
    for (let i = 0; i < 4; i++) ws.push(this.npc(reachLook(i === 0), -28 - i, 2 - i * 1.6, Math.PI / 2, i % 2 ? 'axe' : 'spear', 'w'));
    void ys.goTo(-18, -0.6, 2.4);
    ws.forEach((w, i) => void w.goTo(-20 - i * 0.8, 2.2 - i * 1.4, 2.4));
    this.shot(-14, 1.6, 4.5, -19, 1.3, -0.5, 1.2);
    await this.wait(3.2);
    await this.say('narrator', 'The Reach warriors stopped at the edge of the bridge. One of them, a girl of eighteen with a shaved head and a stillfire spear, lowered it slowly.');
    ys.pose = 'kneel';
    this.sfx.startHum();
    this.closeUp(p, 1.9, 0.35);
    await this.wait(4.5);
    this.sfx.stopHum();
    await this.say('narrator', 'Days ago, a Halveth soldier spared her on a hillside and walked away humming. She recognised the tune.');
    this.closeUp(p, 1.4, 0.1);
    await this.say('ira1', 'Elias, don\'t—', 0.8);
    p.die(null);
    this.sfx.play('whiteout');
    this.shot(BRIDGE_X0 + 8, 2, -4, BRIDGE_X0 + 0.6, 0.6, 0, 0.6);
    await this.say('narrator', 'And that\'s all. On the far bank, Sergeant Corrow memorised exactly how she knelt. He would know it in any body, for eighty-two years.');
    await this.fade(1, 2.2, true);
    this.game.ui.setLetterbox(false);
    await this.card('', 'Life 1.', '', 2.5);
    this.music('title');
    await this.card('Eighty-two years later', 'AFTERLIGHT', 'Every death costs a memory.', 3.5);
    this.game.completeChapter();
  }
}
