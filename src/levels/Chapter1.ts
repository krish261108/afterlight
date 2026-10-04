import { Level, type Spawn } from './Level';
import type { LightingPreset } from '../core/Engine';
import type { Look } from '../entities/Rig';
import type { WeaponKind } from '../entities/weapons';
import { LOOKS } from '../entities/roster';
import { TITLE_LIGHT } from './TitleScene';

export class Chapter1 extends Level {
  readonly index = 1;
  readonly title = 'Chapter 1';
  readonly lighting: LightingPreset = TITLE_LIGHT;
  protected build() {
    this.builder.terrain({ size: 100, seg: 10, height: () => 0, color: () => new (this.builder.group.constructor as any)() as any });
  }
  spawnPoint(): Spawn {
    return { x: 0, z: 0, facing: 0 };
  }
  playerLook(): Look {
    return LOOKS.ira47;
  }
  playerWeapon(): WeaponKind {
    return 'ashvow';
  }
  protected async script() {
    await this.wait(1);
    this.game.completeChapter();
  }
}
