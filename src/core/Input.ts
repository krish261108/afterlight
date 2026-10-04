import { el } from './util';

export type Action =
  | 'light'
  | 'heavy'
  | 'block'
  | 'dodge'
  | 'sprint'
  | 'hum'
  | 'wrath'
  | 'interact'
  | 'lock'
  | 'book'
  | 'pause'
  | 'confirm'
  | 'back'
  | 'up'
  | 'down';

const KEYMAP: Record<string, Action> = {
  KeyJ: 'light',
  KeyK: 'heavy',
  KeyE: 'heavy',
  KeyL: 'block',
  Space: 'dodge',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyH: 'hum',
  KeyQ: 'wrath',
  KeyF: 'interact',
  Tab: 'lock',
  KeyB: 'book',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
};

// Standard gamepad layout indices.
const PADMAP: Record<number, Action> = {
  0: 'dodge',
  1: 'interact',
  2: 'light',
  3: 'heavy',
  4: 'block',
  5: 'hum',
  7: 'wrath',
  6: 'sprint',
  10: 'sprint',
  11: 'lock',
  8: 'book',
  9: 'pause',
};

export type Device = 'keyboard' | 'gamepad' | 'touch';

export class Input {
  readonly move = { x: 0, y: 0 };
  readonly lookDelta = { x: 0, y: 0 };
  readonly lookStick = { x: 0, y: 0 };
  lastDevice: Device = 'keyboard';
  pointerLocked = false;
  lockSupported = true;
  gameplayActive = false;
  onPointerUnlock: (() => void) | null = null;

  private keysDown = new Set<string>();
  private down = new Set<Action>();
  private pressedSet = new Set<Action>();
  private releasedSet = new Set<Action>();
  private sources = new Map<Action, Set<string>>();
  private padPrev: boolean[] = [];
  private padNavCooldown = 0;
  private touchRoot: HTMLElement | null = null;
  private touchVisible = false;
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyKnob: HTMLElement | null = null;
  private joyBase: HTMLElement | null = null;
  private lookTouchId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private touchMove = { x: 0, y: 0 };
  private canvas: HTMLElement;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('mousedown', (e) => this.onMouse(e, true));
    window.addEventListener('mouseup', (e) => this.onMouse(e, false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.lookDelta.x += e.movementX;
        this.lookDelta.y += e.movementY;
        this.lastDevice = 'keyboard';
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (was && !this.pointerLocked) {
        this.releaseAll();
        if (this.gameplayActive) this.onPointerUnlock?.();
      }
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockSupported = false;
    });
    this.lockSupported = 'requestPointerLock' in canvas;
  }

  requestLock() {
    if (!this.lockSupported || this.pointerLocked || this.lastDevice === 'touch') return;
    try {
      const r = (this.canvas as HTMLElement & { requestPointerLock: () => unknown }).requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => (this.lockSupported = false));
      }
    } catch {
      this.lockSupported = false;
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private setAction(a: Action, src: string, isDown: boolean) {
    let s = this.sources.get(a);
    if (!s) {
      s = new Set();
      this.sources.set(a, s);
    }
    if (isDown) {
      if (s.size === 0 && !this.down.has(a)) {
        this.down.add(a);
        this.pressedSet.add(a);
      }
      s.add(src);
    } else {
      s.delete(src);
      if (s.size === 0 && this.down.has(a)) {
        this.down.delete(a);
        this.releasedSet.add(a);
      }
    }
  }

  private onKey(e: KeyboardEvent, isDown: boolean) {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT')) return;
    this.lastDevice = 'keyboard';
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (isDown && e.repeat) return;
    if (isDown) this.keysDown.add(e.code);
    else this.keysDown.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) this.setAction(a, 'k:' + e.code, isDown);
    if (e.code === 'ArrowUp' || e.code === 'KeyW') this.setAction('up', 'k:' + e.code, isDown);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') this.setAction('down', 'k:' + e.code, isDown);
    if (e.code === 'Space') this.setAction('confirm', 'k:space', isDown);
    if (e.code === 'KeyF') this.setAction('confirm', 'k:f', isDown);
    if (e.code === 'Escape' || e.code === 'Backspace') this.setAction('back', 'k:' + e.code, isDown);
  }

  private onMouse(e: MouseEvent, isDown: boolean) {
    if (this.lastDevice === 'touch' && (e as PointerEvent).pointerType === 'touch') return;
    if (isDown && e.target !== this.canvas) return;
    this.lastDevice = 'keyboard';
    if (isDown && this.gameplayActive && this.lockSupported && !this.pointerLocked) {
      this.requestLock();
      return;
    }
    if (e.button === 0) this.setAction('light', 'm0', isDown);
    if (e.button === 2) this.setAction('block', 'm2', isDown);
    if (e.button === 1) {
      e.preventDefault();
      this.setAction('lock', 'm1', isDown);
    }
    if (e.button === 0) this.setAction('confirm', 'm0c', isDown);
  }

  releaseAll() {
    for (const a of Array.from(this.down)) this.releasedSet.add(a);
    this.down.clear();
    this.sources.clear();
    this.keysDown.clear();
    this.touchMove.x = this.touchMove.y = 0;
  }

  isDown(a: Action) {
    return this.down.has(a);
  }
  pressed(a: Action) {
    return this.pressedSet.has(a);
  }
  released(a: Action) {
    return this.releasedSet.has(a);
  }
  consume(a: Action) {
    this.pressedSet.delete(a);
  }

  /** Called once per frame before game logic. */
  update(dt: number) {
    let mx = 0;
    let my = 0;
    const k = this.keysDown;
    if (k.has('KeyW')) my += 1;
    if (k.has('KeyS')) my -= 1;
    if (k.has('KeyD')) mx += 1;
    if (k.has('KeyA')) mx -= 1;
    let lx = 0;
    let ly = 0;
    if (k.has('ArrowLeft')) lx -= 1;
    if (k.has('ArrowRight')) lx += 1;
    if (k.has('ArrowUp')) ly -= 1;
    if (k.has('ArrowDown')) ly += 1;

    mx += this.touchMove.x;
    my += this.touchMove.y;

    this.pollGamepad(dt, (gx, gy, rx, ry) => {
      mx += gx;
      my += gy;
      lx += rx;
      ly += ry;
    });

    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.move.x = mx;
    this.move.y = my;
    this.lookStick.x = Math.max(-1, Math.min(1, lx));
    this.lookStick.y = Math.max(-1, Math.min(1, ly));
  }

  /** Called once per frame after game logic. */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.lookDelta.x = this.lookDelta.y = 0;
  }

  private pollGamepad(dt: number, out: (mx: number, my: number, lx: number, ly: number) => void) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) {
      pad = p;
      break;
    }
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const ax = pad.axes;
    const mx = dz(ax[0] ?? 0);
    const my = -dz(ax[1] ?? 0);
    const rx = dz(ax[2] ?? 0);
    const ry = dz(ax[3] ?? 0);
    let active = Math.abs(mx) + Math.abs(my) + Math.abs(rx) + Math.abs(ry) > 0;
    pad.buttons.forEach((b, i) => {
      const pressed = b.pressed || b.value > 0.5;
      if (pressed) active = true;
      if (pressed !== !!this.padPrev[i]) {
        const a = PADMAP[i];
        if (a) this.setAction(a, 'p' + i, pressed);
        if (i === 0) this.setAction('confirm', 'p0c', pressed);
        if (i === 1) this.setAction('back', 'p1b', pressed);
        if (i === 12) this.setAction('up', 'p12', pressed);
        if (i === 13) this.setAction('down', 'p13', pressed);
      }
      this.padPrev[i] = pressed;
    });
    this.padNavCooldown -= dt;
    if (Math.abs(my) > 0.6 && this.padNavCooldown <= 0) {
      const a: Action = my > 0 ? 'up' : 'down';
      this.pressedSet.add(a);
      this.padNavCooldown = 0.25;
    }
    if (active) this.lastDevice = 'gamepad';
    out(mx, my, rx, ry);
  }

  // ---------------------------------------------------------------- touch

  buildTouch(parent: HTMLElement) {
    const root = el('div', 'touch-root hidden');
    const joyZone = el('div', 'touch-joyzone');
    const base = el('div', 'touch-joybase');
    const knob = el('div', 'touch-joyknob');
    base.appendChild(knob);
    joyZone.appendChild(base);
    root.appendChild(joyZone);
    this.joyBase = base;
    this.joyKnob = knob;

    const lookZone = el('div', 'touch-lookzone');
    root.appendChild(lookZone);

    const btns: [Action, string, string][] = [
      ['light', 'Attack', 'tb-light'],
      ['heavy', 'Heavy', 'tb-heavy'],
      ['dodge', 'Dodge', 'tb-dodge'],
      ['block', 'Block', 'tb-block'],
      ['hum', 'Hum', 'tb-hum'],
      ['wrath', 'Wrath', 'tb-wrath'],
      ['interact', 'Use', 'tb-interact'],
      ['lock', 'Lock', 'tb-lock'],
      ['pause', 'II', 'tb-pause'],
      ['book', 'Book', 'tb-book'],
    ];
    for (const [action, label, cls] of btns) {
      const b = el('button', 'touch-btn ' + cls, label);
      b.dataset.action = action;
      const start = (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.lastDevice = 'touch';
        b.classList.add('down');
        this.setAction(action, 't:' + action, true);
        if (action === 'interact' || action === 'light') this.setAction('confirm', 't:c' + action, true);
      };
      const end = (e: TouchEvent) => {
        e.preventDefault();
        b.classList.remove('down');
        this.setAction(action, 't:' + action, false);
        if (action === 'interact' || action === 'light') this.setAction('confirm', 't:c' + action, false);
      };
      b.addEventListener('touchstart', start, { passive: false });
      b.addEventListener('touchend', end, { passive: false });
      b.addEventListener('touchcancel', end, { passive: false });
      root.appendChild(b);
    }

    joyZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.lastDevice = 'touch';
        if (this.joyId !== null) return;
        const t = e.changedTouches[0];
        this.joyId = t.identifier;
        this.joyOrigin = { x: t.clientX, y: t.clientY };
        base.style.left = t.clientX + 'px';
        base.style.top = t.clientY + 'px';
        base.classList.add('active');
      },
      { passive: false },
    );
    const joyMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          e.preventDefault();
          const r = 56;
          let dx = t.clientX - this.joyOrigin.x;
          let dy = t.clientY - this.joyOrigin.y;
          const d = Math.hypot(dx, dy);
          if (d > r) {
            dx = (dx / d) * r;
            dy = (dy / d) * r;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.touchMove.x = dx / r;
          this.touchMove.y = -dy / r;
          const mag = Math.hypot(this.touchMove.x, this.touchMove.y);
          this.setAction('sprint', 't:joy', mag > 0.95);
        }
      }
    };
    const joyEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.touchMove.x = this.touchMove.y = 0;
          knob.style.transform = '';
          base.classList.remove('active');
          this.setAction('sprint', 't:joy', false);
        }
      }
    };
    joyZone.addEventListener('touchmove', joyMove, { passive: false });
    joyZone.addEventListener('touchend', joyEnd);
    joyZone.addEventListener('touchcancel', joyEnd);

    lookZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.lastDevice = 'touch';
        if (this.lookTouchId !== null) return;
        const t = e.changedTouches[0];
        this.lookTouchId = t.identifier;
        this.lookLast = { x: t.clientX, y: t.clientY };
      },
      { passive: false },
    );
    lookZone.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === this.lookTouchId) {
            e.preventDefault();
            this.lookDelta.x += (t.clientX - this.lookLast.x) * 1.6;
            this.lookDelta.y += (t.clientY - this.lookLast.y) * 1.6;
            this.lookLast = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );
    const lookEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.lookTouchId) this.lookTouchId = null;
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    parent.appendChild(root);
    this.touchRoot = root;
    window.addEventListener('touchstart', () => (this.lastDevice = 'touch'), { passive: true });
  }

  setTouchVisible(v: boolean) {
    if (!this.touchRoot || v === this.touchVisible) return;
    this.touchVisible = v;
    this.touchRoot.classList.toggle('hidden', !v);
    if (!v) {
      this.joyId = null;
      this.lookTouchId = null;
      this.touchMove.x = this.touchMove.y = 0;
      if (this.joyKnob) this.joyKnob.style.transform = '';
      this.joyBase?.classList.remove('active');
    }
  }

  setTouchButtonVisible(action: Action, v: boolean) {
    const b = this.touchRoot?.querySelector<HTMLElement>(`[data-action="${action}"]`);
    if (b) b.style.display = v ? '' : 'none';
  }
}
