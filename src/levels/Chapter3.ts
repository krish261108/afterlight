import * as THREE from 'three';
import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import type { Actor } from '../entities/Actor';
import type { Fighter, FighterType } from '../entities/Fighter';
import type { Game } from '../Game';
import { LOOKS, halvethAlly, halvethLook, deserter, deserterCaptain, reachArcher, reachLook } from '../entities/roster';
import { ENEMY_ATTACKS } from '../combat/types';
import { mat, PALETTE } from '../world/materials';
import { fbm, rand } from '../core/util';

const ORDER = ['start', 'village', 'captain', 'ysolde'];
const WX = 0;
const WZ = 44;

const SUN: LightingPreset = {
  sky: ['#4f6fa8', '#e2b28a', '#f3c58e'],
  fog: '#d9a676',
  fogDensity: 0.0095,
  sun: '#fff1d8',
  sunIntensity: 2.6,
  sunDir: [0.5, 0.7, 0.35],
  ambient: '#e6c0a0',
  ambientIntensity: 0.9,
  hemiGround: '#6a3a24',
  exposure: 1.0,
  bloom: 0.5,
  suns: 2,
};

const DUSK: LightingPreset = {
  sky: ['#2a2a50', '#b0607a', '#f09a5a'],
  fog: '#9a5a50',
  fogDensity: 0.011,
  sun: '#ffb070',
  sunIntensity: 1.8,
  sunDir: [-0.6, 0.25, 0.6],
  ambient: '#c09aa8',
  ambientIntensity: 0.85,
  hemiGround: '#4a2420',
  exposure: 1.05,
  bloom: 0.75,
  suns: 2,
};

function deserterArcher(i: number): FighterType {
  return { ...reachArcher(), id: 'deserterArcher', name: 'Deserter Archer', look: halvethLook(i, true), calmable: true };
}

export class Chapter3 extends Level {
  readonly index = 3;
  readonly title = "Sefir's Well";
  readonly lighting = SUN;
  readonly ambient = { wind: 0.45 };
  private squadList: Fighter[] = [];
  private mira: Fighter | null = null;
  private fires: THREE.Group[] = [];

  constructor(game: Game) {
    super(game);
  }

  protected build() {
    const b = this.builder;
    const mesa = (x: number, z: number, cx: number, cz: number, r: number, h: number) => {
      const d = Math.hypot(x - cx, z - cz);
      return d < r ? h : d < r + 6 ? h * (1 - (d - r) / 6) ** 2 : 0;
    };
    b.terrain({
      size: 320,
      seg: 130,
      cz: 0,
      height: (x, z) => {
        let h = fbm(x * 0.02, z * 0.02) * 4 + fbm(x * 0.08, z * 0.08) * 0.8;
        const village = Math.hypot(x - WX, z - WZ);
        if (village < 34) h *= Math.max(0, (village - 18) / 16);
        if (z < 8 && z > -110) {
          const d = Math.abs(x) - (10 + Math.sin(z * 0.06) * 3);
          if (d > 0) h += Math.min(24, d * 2.8);
        }
        h += mesa(x, z, -55, 60, 14, 22) + mesa(x, z, 60, 30, 18, 26) + mesa(x, z, 30, 100, 22, 18) + mesa(x, z, -40, 115, 16, 28);
        return h;
      },
      color: (x, z, h) => {
        if (h > 8) return new THREE.Color('#9c4a2c').lerp(new THREE.Color('#c2643a'), fbm(x * 0.15, z * 0.15));
        return new THREE.Color('#c0663c').lerp(new THREE.Color('#d9895a'), fbm(x * 0.1, z * 0.1));
      },
    });
    for (let z = -110; z < 8; z += 6) {
      const h = 10 + Math.sin((z + 3) * 0.06) * 3;
      this.world.addWall(-h - 1.5, z + 3, 2, 6.4, -10, 60);
      this.world.addWall(h + 1.5, z + 3, 2, 6.4, -10, 60);
    }
    this.world.addWall(0, -112, 40, 2, -10, 60);

    // Sefir's Well: a deep stone well in a ring of bone-white tents.
    const stone = mat('#b9a48a');
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 1.1, 20, 1, true), stone);
    ring.position.set(WX, 0.5, WZ);
    (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    ring.castShadow = true;
    this.group.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(2.5, 20), mat('#0a0606'));
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(WX, 0.25, WZ);
    this.group.add(hole);
    this.world.addWall(WX, WZ, 5.2, 5.2, -5, 1.2);
    b.box(0.25, 3, 0.25, mat(PALETTE.woodDark), WX - 2.2, 0, WZ);
    b.box(0.25, 3, 0.25, mat(PALETTE.woodDark), WX + 2.2, 0, WZ);
    b.box(4.8, 0.25, 0.25, mat(PALETTE.woodDark), WX, 3, WZ);
    const bone = PALETTE.bone;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const r = 13 + (i % 2) * 3;
      b.tent(WX + Math.sin(a) * r, WZ + Math.cos(a) * r, 1.1 + (i % 3) * 0.15, i % 4 === 0 ? '#d9cdb4' : bone, a);
    }
    for (const [x, z] of [
      [WX + 8, WZ - 6],
      [WX - 7, WZ + 8],
      [WX - 9, WZ - 9],
    ]) {
      b.box(2, 0.8, 1.2, mat(PALETTE.wood), x, 0, z, Math.random(), { collide: true });
    }
    b.cart(WX - 12, WZ - 2, 1.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.barrel(WX + Math.sin(a) * 5.5, WZ + Math.cos(a) * 5.5);
    }
    // Burning tents, lit by the deserters.
    for (const [x, z] of [
      [WX + 11, WZ + 9],
      [WX - 13, WZ + 2],
      [WX + 3, WZ + 15],
    ]) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const f = b.flame(x + rand(-0.8, 0.8), b.world.terrain(x, z) + 0.2, z + rand(-0.8, 0.8), '#ff8a3a', k === 0, 2 + Math.random());
        g.add(f);
      }
      this.fires.push(g);
    }
    b.scatterTrees(40, (r) => {
      const x = r.range(-120, 120);
      const z = r.range(-120, 150);
      return Math.hypot(x - WX, z - WZ) < 26 || (Math.abs(x) < 14 && z < 10) ? null : [x, z];
    }, 'dead', PALETTE.bone, '#6a4a3a');
    b.scatterRocks(90, (r) => {
      const x = r.range(-100, 100);
      const z = r.range(-110, 140);
      return Math.hypot(x - WX, z - WZ) < 20 ? null : [x, z];
    }, '#8a4a30', 0.3, 2.2, 1.0);
    b.scatterGrass(1200, (r) => {
      const x = r.range(-80, 80);
      const z = r.range(-100, 120);
      return Math.hypot(x - WX, z - WZ) < 8 ? null : [x, z];
    }, '#8a7a4a', '#b09a5a', 0.8);
    this.addWeather('ash', 260, '#e8b890');
    this.world.killY = -20;
  }

  spawnPoint(cp: string): Spawn {
    switch (cp) {
      case 'village':
        return { x: 0, z: 14, facing: 0 };
      case 'captain':
        return { x: WX, z: WZ - 10, facing: 0 };
      case 'ysolde':
        return { x: WX + 4, z: WZ - 5, facing: 0 };
      default:
        return { x: 0, z: -95, facing: 0 };
    }
  }

  playerLook(): Look {
    return LOOKS.ira47;
  }

  playerWeapon(): WeaponKind {
    return 'ashvow';
  }

  protected setupPlayer(cp: string) {
    this.squadList = [];
    this.mira = null;
    const p = this.player;
    p.canWrath = true;
    p.maxHp = 150;
    p.hp = 150;
    this.world.boundsCenter.set(0, 0);
    this.world.boundsRadius = 300;
    this.game.engine.applyLighting(cp === 'ysolde' ? DUSK : SUN);
    for (const f of this.fires) f.visible = cp !== 'ysolde';
    this.game.sfx.setAmbient('fire', cp === 'ysolde' ? 0 : 0.35);
  }

  private squad() {
    if (this.mira) return;
    const p = this.player;
    this.mira = this.spawn({ ...halvethAlly(0), name: 'Mira', look: LOOKS.mira, weapon: 'sword' }, p.pos.x - 2, p.pos.z - 2, { team: 'ally', facing: p.facing });
    this.squadList = [this.mira, this.spawn(halvethAlly(4), p.pos.x + 2, p.pos.z - 2, { team: 'ally', facing: p.facing }), this.spawn(halvethAlly(5), p.pos.x, p.pos.z - 4, { team: 'ally', facing: p.facing })];
    for (const a of this.squadList) a.follow = p;
  }

  private villagers(n: number) {
    const out: Actor[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 1.1;
      const look = { ...reachLook(), facePaint: false };
      const v = this.npc(look, WX + Math.sin(a) * 9.5, WZ + Math.cos(a) * 9.5, a + Math.PI, 'none', 'villager');
      v.pose = 'cower';
      out.push(v);
    }
    return out;
  }

  protected async script(cp: string) {
    const at = (k: string) => ORDER.indexOf(cp) <= ORDER.indexOf(k);
    if (at('start')) await this.desert();
    if (at('village')) await this.village();
    if (at('captain')) await this.captain();
    await this.ysolde();
  }

  private async desert() {
    const p = this.player;
    this.squad();
    this.music('silence');
    this.cinematic(true);
    this.shot(6, 4, -104, 0, 3, -70, Infinity);
    await this.fade(1, 0.01);
    void this.fade(0, 2.5);
    await this.card('Chapter Three', "SEFIR'S WELL", 'The Red Country. Two suns, and no shade under either of them.', 4);
    this.music('calm');
    this.twoShot(p, this.mira!, 1);
    await this.talk([
      ['mira', 'My mother said the sand here is red because a god bled on it.'],
      ['kaal', 'It is.'],
      ['ira', 'What?'],
      ['kaal', 'Nothing. Walk.'],
    ]);
    this.cinematic(false);
    this.goal('Cross the canyon toward the forge road', [0, 0, -30]);
    await this.reach(0, -52, 6, 'Cross the canyon toward the forge road');
    this.music('tension');
    this.bark('mira', 'Riders! Halveth colours... they\'re ours. What are they doing out here?');
    const scouts = [this.spawn(deserter(1), -4, -36), this.spawn(deserter(2), 4, -34), this.spawn(deserter(3), 0, -30)];
    await this.wait(1.2);
    this.bark('ira', 'They ran from the Litany Gate. Deserters.');
    this.music('combat');
    await this.wait(2.5);
    this.hint('Deserters are frightened men. Wound one, then hold {hum} nearby, and they may lay down their arms.');
    await this.allDown(scouts);
    this.music('calm');
    await this.wait(1);
    this.bark('mira', 'Smoke. North. That\'s Sefir\'s Well, a Reach village. Someone\'s burning it.');
    await this.wait(3);
    this.goal('Get to Sefir\'s Well', [0, 0, 14]);
    void this.shard(9, -14, 'ch3-canyon');
    await this.reach(0, 14, 6, 'Get to Sefir\'s Well');
  }

  private async village() {
    this.setCheckpoint('village');
    const p = this.player;
    this.squad();
    const vs = this.villagers(6);
    this.cinematic(true);
    this.music('dread');
    this.shot(10, 5, 10, WX, 1.5, WZ, 1.4);
    await this.say('narrator', 'The deserters have set the tents on fire. Reach villagers crouch around the well with nowhere left to run.');
    const raiders: Actor[] = [];
    for (let i = 0; i < 4; i++) {
      const r = this.npc(halvethLook(i, true), WX - 6 + i * 4, WZ - 4, 0, 'sword', 'raider');
      r.faceToward(vs[i].pos.x, vs[i].pos.z);
      r.pose = 'raise';
      raiders.push(r);
    }
    this.twoShot(p, this.mira!, 1);
    await this.talk([
      ['mira', 'Ira. They\'re ours.'],
      ['ira', 'Not any more.'],
    ]);
    for (const r of raiders) this.removeActor(r);
    this.cinematic(false);
    this.music('combat');
    this.goal('Drive the deserters out of the village');
    const w1 = [this.spawn(deserter(1), WX - 6, WZ - 4), this.spawn(deserter(2), WX - 2, WZ - 4), this.spawn(deserter(3), WX + 2, WZ - 4), this.spawn(deserter(4), WX + 6, WZ - 4)];
    await this.allDown(w1);
    this.bark('mira', 'More coming round the tents! Bows!');
    const w2 = [this.spawn(deserter(5), WX + 14, WZ + 4), this.spawn(deserter(6), WX - 14, WZ + 6), this.spawn(deserterArcher(7), WX + 6, WZ + 18), this.spawn(deserterArcher(8), WX - 8, WZ + 18)];
    await this.allDown(w2);
    await this.wait(1.5);
    const w3 = [this.spawn(deserter(9), WX + 10, WZ + 14), this.spawn(deserter(10), WX - 10, WZ + 14), this.spawn(deserter(11), WX, WZ + 20), this.spawn(deserter(12), WX + 16, WZ), this.spawn(deserter(13), WX - 16, WZ)];
    await this.allDown(w3);
    for (const v of vs) this.removeActor(v);
  }

  private async captain() {
    this.setCheckpoint('captain');
    const p = this.player;
    this.squad();
    const vs = this.villagers(5);
    p.place(WX, WZ - 10, 0);
    this.music('silence');
    this.cinematic(true);
    const v = this.npc(deserterCaptain().look, WX, WZ + 9, Math.PI, 'sword', 'varek');
    this.twoShot(p, v, 1);
    await this.talk([
      ['varek', 'Solen. The Forty-Seven. Come to drag us back to the Wheel?'],
      ['ira', 'Come to stop you.'],
      ['varek', 'We\'ll come back. They won\'t. That\'s the whole difference between us and them, Sergeant.'],
      ['varek', 'Why should I care what happens to things that only get one go?'],
    ]);
    this.closeUp(p, 2, 0.4);
    await this.say('ira', 'Because they only get one go.');
    const vx = v.pos.x;
    const vz = v.pos.z;
    this.removeActor(v);
    const cap = this.spawn(deserterCaptain(), vx, vz);
    cap.minHp = 1;
    this.bossBar(cap);
    this.cinematic(false);
    this.music('boss');
    this.goal(null);
    await this.until(() => cap.hp < cap.maxHp * 0.6 || !cap.alive);
    if (cap.alive) {
      this.bark('varek', 'To me! Kill the big one!');
      this.spawn(deserter(20), WX + 14, WZ + 6);
      this.spawn(deserter(21), WX - 14, WZ + 6);
    }
    await this.until(() => cap.hp < cap.maxHp * 0.3 || !cap.alive);
    if (cap.alive) {
      this.bark('varek', 'You think the Wheel loves you? It FARMS you!');
      cap.type.cooldown = [0.5, 1.1];
      cap.damageDealtMul *= 1.15;
    }
    await this.until(() => cap.hp <= 1.5 || !cap.alive);
    this.bossBar(null);
    for (const a of [...this.actors]) if (a.team === 'enemy' && a !== cap) this.removeActor(a);
    const cx = cap.pos.x;
    const cz = cap.pos.z;
    this.removeActor(cap);
    const beaten = this.npc(deserterCaptain().look, cx, cz, 0, 'none', 'varek');
    beaten.faceToward(p.pos.x, p.pos.z);
    beaten.pose = 'kneel';
    this.cinematic(true);
    this.music('tension');
    this.twoShot(p, beaten, 1);
    await this.say('varek', 'Go on, then. I\'ll be back in a week, in a better body. That\'s the joke, isn\'t it?');
    const c = await this.choose(['Execute him. Let the Wheel have him.', 'Hum. Let him walk away.']);
    this.game.save.choices.varek = c === 0 ? 'executed' : 'spared';
    if (c === 0) {
      p.faceToward(beaten.pos.x, beaten.pos.z);
      p.startAttack({ ...ENEMY_ATTACKS.swordOver, name: 'execute', damage: 0 });
      await this.wait(0.45);
      this.sfx.play('execute', { pos: beaten.pos });
      beaten.invulnerable = false;
      beaten.die(null);
      await this.say('narrator', 'His mark flickers and stays lit. Somewhere in Halveth, a tank begins to fill.');
    } else {
      this.sfx.startHum();
      await this.wait(2.5);
      this.sfx.stopHum();
      beaten.pose = null;
      await this.say('varek', '...That song. My mother used to...');
      void beaten.goTo(cx + 30, cz + 40, 2);
      await this.say('narrator', 'He doesn\'t finish. He walks out into the red country without his sword.');
      this.game.save.stats.mercy++;
    }
    for (const vv of vs) this.removeActor(vv);
    this.cinematic(false);
    await this.fade(1, 1.2);
  }

  private async ysolde() {
    this.setCheckpoint('ysolde');
    const p = this.player;
    this.game.engine.applyLighting(DUSK);
    for (const f of this.fires) f.visible = false;
    this.game.sfx.setAmbient('fire', 0);
    this.music('sorrow');
    this.squad();
    const mira = this.mira!;
    mira.place(WX - 5, WZ - 6, 0.5);
    mira.aggro = false;
    const dead: Actor[] = [];
    for (let i = 0; i < 3; i++) {
      const d = this.npc({ ...reachLook(), facePaint: false }, WX - 3 + i * 3, WZ - 6.5 + (i % 2), 0, 'none', 'dead');
      d.pose = 'lying';
      dead.push(d);
    }
    const living: Actor[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 1.4 + 2.2;
      const l = this.npc({ ...reachLook(), facePaint: false }, WX + Math.sin(a) * 8, WZ + Math.cos(a) * 8, 0, 'none', 'villager');
      l.faceToward(WX, WZ - 6);
      l.pose = i % 2 ? 'sit' : null;
      living.push(l);
    }
    p.place(WX + 4, WZ - 5, -1.2);
    await this.fade(0, 1.4);
    this.goal('Hum for the dead', [WX, 0, WZ - 6]);
    this.hint('Hold {hum} beside the bodies.');
    const start = p.humTime;
    await this.until(() => p.humTime - start > 4.5 && p.distTo(new THREE.Vector3(WX, 0, WZ - 6)) < 7);
    this.goal(null);
    this.cinematic(true);
    this.sfx.stopHum();
    const ys = this.npc(LOOKS.ysoldeOld, WX + 9, WZ + 6, 0, 'none', 'ysolde');
    void ys.goTo(WX + 2.4, WZ - 3.4, 0.9);
    this.shot(WX + 7, 2.2, WZ - 8, WX + 4, 1.4, WZ - 2, 1.2);
    await this.say('narrator', 'An old blind woman comes out of the last standing tent, one hand on the shoulder of a child, following the sound.');
    await this.until(() => !ys.scriptMove);
    ys.faceToward(p.pos.x, p.pos.z);
    p.faceToward(ys.pos.x, ys.pos.z);
    this.twoShot(p, ys, 1);
    await this.talk([
      ['ysolde', 'That song. Who taught you that song, Halveth?'],
      ['ira', 'Nobody. It\'s just always been there.'],
    ]);
    this.closeUp(ys, 1.8, 0.3);
    await this.talk([
      ['ysolde', 'When I was a girl, a Halveth soldier had me on the ground with her sword at my throat. And she let me go. She walked away humming that.'],
      ['ysolde', 'Days later I saw her again, holding a bridge at Kessel Ford. Dying. Still humming. I lowered my spear.'],
      ['ysolde', 'Eighty-two years. I never knew her name.'],
    ]);
    this.closeUp(p, 1.8, 0.4);
    await this.say('ira', 'I\'m sorry. I don\'t... I don\'t remember anything that long ago.');
    ys.pose = 'talk';
    this.twoShot(p, ys, -1);
    await this.say('narrator', 'Ysolde reaches up and finds Ira\'s face with both hands, the way the blind do.');
    await this.talk([
      ['ysolde', 'No. You wouldn\'t.'],
      ['ysolde', '...You stand the same. Left foot forward.'],
      ['ysolde', 'I hummed it to my grandson when he was small. He carries a spear for the Reach now. He hums it still, when he thinks nobody can hear. He never knew where it came from.'],
    ]);
    this.closeUp(p, 1.6, 0.2);
    await this.say('kaal', 'Ira.');
    await this.say('ira', 'What?');
    await this.say('kaal', '...Nothing. Drink the water she\'s about to give you.');
    ys.pose = null;
    this.twoShot(p, ys, 1);
    await this.talk([
      ['ysolde', 'Drink. Where are you going, Halveth?'],
      ['ira', 'The stillfire forge.'],
      ['ysolde', 'Then you are going to the one place where dying is done properly. Mind yourself.'],
    ]);
    this.cinematic(false);
    void this.shard(WX + 2.4, WZ - 2, 'ch3-ysolde');
    this.goal('Take the north road to the forge', [0, 0, 78]);
    await this.reach(0, 78, 6, 'Take the north road to the forge');
    this.cinematic(true);
    this.music('sorrow');
    await this.journal('An old woman touched my face today and told me how I stand. Kaal went very quiet. I think he knows something about her grandson. I think I don\'t want him to tell me yet.');
    await this.fade(1, 1.4);
    await this.card('End of Chapter Three', "SEFIR'S WELL", '', 2.6);
    void dead;
    void living;
    this.game.completeChapter();
  }
}
