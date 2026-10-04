import { el, escapeHtml, formatTime, isMac, isTouchDevice } from '../core/util';
import type { Settings, Stats } from '../core/Save';
import { MEMORIES, SPEAKERS } from '../story/cast';

export interface UIHooks {
  onNewGame(): void;
  onContinue(): void;
  onChapter(i: number): void;
  onResume(): void;
  onQuitToTitle(): void;
  onRestartCheckpoint(): void;
  onSettings(s: Settings): void;
  click(): void;
}

export interface HUDState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  posture: number;
  maxPosture: number;
  wrath: number;
  showWrath: boolean;
  life: number | null;
  memories: string;
  objective: string | null;
  objectiveDist: number | null;
  counter: { n: string; label: string } | null;
  boss: { name: string; hp: number; maxHp: number; posture: number; maxPosture: number } | null;
  prompt: { key: string; text: string } | null;
  vignette: number;
}

export interface MarkerState {
  bars: { x: number; y: number; hp: number; posture: number }[];
  reticle: { x: number; y: number; exec: boolean } | null;
  waypoint: { x: number; y: number; dist: number } | null;
}

export const CHAPTERS = [
  { n: 'Prologue', t: 'Kessel Ford', d: 'Eighty-two years ago. Forty-one recruits, one narrow bridge, and the first life of Ira Solen.' },
  { n: 'Chapter One', t: 'Instance Forty-Seven', d: 'A tank of amber fluid. A brother who has never aged. A sword that talks.' },
  { n: 'Chapter Two', t: 'The Litany Gate', d: 'A siege, a bell tower in a storm, and a spearman who has killed you twelve times.' },
  { n: 'Chapter Three', t: "Sefir's Well", d: 'Your own deserters. A Reach village. An old blind woman who knows your song.' },
  { n: 'Chapter Four', t: 'The Stillfire Forge', d: 'The fire that ends every life it touches, and the glass plate with your name on it.' },
];

type Ctl = [string, string[]];
const KB: Ctl[] = [
  ['Move', ['W', 'A', 'S', 'D']],
  ['Look around', ['Mouse', '← ↑ → ↓']],
  ['Light attack (tap again to combo)', ['Left Click', 'J']],
  ['Heavy attack', ['E', 'K']],
  ['Block · tap just before a hit to Parry', ['Right Click', 'L']],
  ['Dodge roll (invulnerable mid-roll)', ['Space']],
  ['Sprint (hold)', ['Shift']],
  ['Hum (hold) · heals, calms the frightened', ['H']],
  ["Kaal's Wrath (when the violet bar is full)", ['Q']],
  ['Interact · Execute a staggered enemy', ['F']],
  ['Lock on to target', ['Tab', 'Middle Click']],
  ['Memory Book', ['B']],
  ['Pause', ['Esc', 'P']],
  ['Advance dialogue', ['F', 'Enter', 'Space', 'Click']],
];
const PAD: Ctl[] = [
  ['Move', ['Left Stick']],
  ['Camera', ['Right Stick']],
  ['Light attack', ['X', '▢ Square']],
  ['Heavy attack', ['Y', '△ Triangle']],
  ['Block / Parry', ['LB', 'L1']],
  ['Dodge roll', ['A', '✕ Cross']],
  ['Sprint', ['LT', 'L2', 'L3']],
  ['Hum (hold)', ['RB', 'R1']],
  ["Kaal's Wrath", ['RT', 'R2']],
  ['Interact · Execute', ['B', '◯ Circle']],
  ['Lock on', ['R3']],
  ['Memory Book', ['View', 'Share']],
  ['Pause', ['Menu', 'Options']],
  ['Advance dialogue', ['A', '✕ Cross']],
];
const TOUCH: Ctl[] = [
  ['Move', ['Left side: drag the stick']],
  ['Sprint', ['Push the stick all the way']],
  ['Camera', ['Drag on the right side']],
  ['Light attack', ['Attack']],
  ['Heavy attack', ['Heavy']],
  ['Block / Parry', ['Block (hold)']],
  ['Dodge roll', ['Dodge']],
  ['Hum', ['Hum (hold)']],
  ["Kaal's Wrath", ['Wrath']],
  ['Interact · Execute', ['Use']],
  ['Lock on', ['Lock']],
  ['Pause · Memory Book', ['II', 'Book (top right)']],
  ['Advance dialogue', ['Tap Use or Attack']],
];

export class UI {
  readonly root: HTMLElement;
  private screens: HTMLElement;
  private hud: HTMLElement;
  private hudBars!: { hp: HTMLElement; hpLag: HTMLElement; st: HTMLElement; po: HTMLElement; wr: HTMLElement; wrBar: HTMLElement; wrLabel: HTMLElement };
  private lifeEl!: HTMLElement;
  private memEl!: HTMLElement;
  private objEl!: HTMLElement;
  private objText!: HTMLElement;
  private objDist!: HTMLElement;
  private counterEl!: HTMLElement;
  private bossEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private subEl: HTMLElement;
  private choiceEl: HTMLElement;
  private toastEl: HTMLElement;
  private fadeEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private letterboxEl: HTMLElement;
  private cardLayer: HTMLElement;
  private markerLayer: HTMLElement;
  private barPool: HTMLElement[] = [];
  private reticleEl: HTMLElement;
  private waypointEl: HTMLElement;
  private hooks: UIHooks;
  private focusIdx = 0;
  private backAction: (() => void) | null = null;
  current: string | null = null;
  private lastHud = '';
  private choiceResolve: ((i: number) => void) | null = null;
  private advanceResolve: (() => void) | null = null;
  settings: Settings;

  constructor(parent: HTMLElement, hooks: UIHooks, settings: Settings) {
    this.hooks = hooks;
    this.settings = settings;
    this.root = el('div', 'ui-root');
    parent.appendChild(this.root);
    this.markerLayer = el('div', 'markers');
    this.reticleEl = el('div', 'reticle hidden');
    this.waypointEl = el('div', 'waypoint hidden', '◆<span class="wd"></span>');
    this.markerLayer.append(this.reticleEl, this.waypointEl);
    this.hud = el('div', 'hud hidden');
    this.buildHud();
    this.letterboxEl = el('div', 'letterbox');
    this.letterboxEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.vignetteEl = el('div', 'vignette');
    this.subEl = el('div', 'subtitles clickable');
    this.subEl.addEventListener('click', () => this.advanceResolve?.());
    this.choiceEl = el('div', 'choices hidden');
    this.toastEl = el('div', 'toast');
    this.cardLayer = el('div');
    this.cardLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.screens = el('div');
    this.screens.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.fadeEl = el('div', 'fade');
    this.root.append(this.markerLayer, this.vignetteEl, this.hud, this.letterboxEl, this.subEl, this.choiceEl, this.toastEl, this.cardLayer, this.screens, this.fadeEl);
    if (isTouchDevice()) document.body.classList.add('touch');
  }

  // ------------------------------------------------------------ helpers

  private screen(cls = 'dim') {
    this.clearScreens();
    const s = el('div', 'screen ' + cls);
    this.screens.appendChild(s);
    this.focusIdx = 0;
    return s;
  }

  clearScreens() {
    this.screens.innerHTML = '';
    this.current = null;
    this.backAction = null;
  }

  private button(label: string, onClick: () => void, cls = 'btn') {
    const b = el('button', cls, escapeHtml(label));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hooks.click();
      onClick();
    });
    return b;
  }

  private buttons(): HTMLButtonElement[] {
    if (this.choiceResolve) return Array.from(this.choiceEl.querySelectorAll('button'));
    const top = this.screens.lastElementChild;
    if (!top) return [];
    return Array.from(top.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter((b) => b.offsetParent !== null);
  }

  /** Gamepad / keyboard menu navigation. */
  nav(dir: 1 | -1) {
    const bs = this.buttons();
    if (!bs.length) return;
    this.focusIdx = (this.focusIdx + dir + bs.length) % bs.length;
    bs.forEach((b, i) => b.classList.toggle('focus', i === this.focusIdx));
    bs[this.focusIdx].scrollIntoView({ block: 'nearest' });
    this.hooks.click();
  }

  activate() {
    const bs = this.buttons();
    if (!bs.length) return false;
    const b = bs[Math.min(this.focusIdx, bs.length - 1)];
    b.click();
    return true;
  }

  back() {
    if (this.backAction) {
      this.hooks.click();
      this.backAction();
      return true;
    }
    return false;
  }

  get menuOpen() {
    return this.screens.childElementCount > 0 || !!this.choiceResolve;
  }

  private markFocus() {
    const bs = this.buttons();
    bs.forEach((b, i) => b.classList.toggle('focus', i === this.focusIdx));
  }

  // ------------------------------------------------------------ screens

  showLoading(text = 'AFTERLIGHT') {
    const s = this.screen('solid');
    s.appendChild(el('div', 'loading', escapeHtml(text)));
  }

  showTitle(hasSave: boolean, unlocked: number, finished: boolean) {
    const s = this.screen('');
    s.style.background = 'radial-gradient(ellipse at center, rgba(11,8,18,0.15), rgba(11,8,18,0.75))';
    this.current = 'title';
    const wrap = el('div', 'title-wrap');
    wrap.innerHTML = `<h1 class="title-logo">AFTERLIGHT</h1><div class="title-line"></div><div class="title-sub">Act I · The Forty-Seventh Life</div>`;
    s.appendChild(wrap);
    const m = el('div', 'menu');
    if (hasSave) m.appendChild(this.button('Continue', () => this.hooks.onContinue(), 'btn primary'));
    m.appendChild(this.button('New Game', () => this.hooks.onNewGame(), hasSave ? 'btn' : 'btn primary'));
    if (unlocked > 0 || finished) m.appendChild(this.button('Chapters', () => this.showChapters(unlocked, () => this.showTitle(hasSave, unlocked, finished))));
    m.appendChild(this.button('Controls', () => this.showControls(() => this.showTitle(hasSave, unlocked, finished), 'Back')));
    m.appendChild(this.button('Settings', () => this.showSettings(() => this.showTitle(hasSave, unlocked, finished))));
    s.appendChild(m);
    s.appendChild(el('div', 'footer-note', 'Every death costs a memory. · Best with headphones.'));
    this.markFocus();
  }

  showChapters(unlocked: number, onBack: () => void) {
    const s = this.screen();
    this.current = 'chapters';
    const p = el('div', 'panel');
    p.innerHTML = `<h2>Chapters</h2><p>Replay any chapter you have reached. Your memories and life count carry over.</p>`;
    const g = el('div', 'chapters');
    CHAPTERS.forEach((c, i) => {
      const card = el('button', 'chapter-card' + (i > unlocked ? ' locked' : ''));
      card.innerHTML = `<div class="n">${c.n}</div><div class="t">${c.t}</div><div class="d">${i > unlocked ? 'Not yet reached.' : c.d}</div>`;
      card.addEventListener('click', () => {
        this.hooks.click();
        this.hooks.onChapter(i);
      });
      g.appendChild(card);
    });
    p.appendChild(g);
    const row = el('div', 'row');
    row.appendChild(this.button('Back', onBack));
    p.appendChild(row);
    s.appendChild(p);
    this.backAction = onBack;
    this.markFocus();
  }

  showControls(onDone: () => void, doneLabel = 'Begin') {
    const s = this.screen();
    this.current = 'controls';
    const p = el('div', 'panel');
    p.innerHTML = `<h2>How to Play</h2><p>Afterlight plays on PC, Mac, with a gamepad, or on a phone or tablet. Pick your device to see its controls.</p>`;
    const touch = isTouchDevice();
    const mac = isMac() && !touch;
    const tabs = el('div', 'tabs');
    const body = el('div');
    const defs: { id: string; label: string; detected: boolean }[] = [
      { id: 'pc', label: 'PC · Keyboard & Mouse', detected: !touch && !mac },
      { id: 'mac', label: 'Mac', detected: mac },
      { id: 'pad', label: 'Gamepad', detected: false },
      { id: 'touch', label: 'Phone / Tablet', detected: touch },
    ];
    const render = (id: string) => {
      tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', (t as HTMLElement).dataset.id === id));
      const list = id === 'pad' ? PAD : id === 'touch' ? TOUCH : KB;
      let html = '<div class="controls-grid">';
      for (const [what, keys] of list) html += `<div class="ctl"><span class="what">${escapeHtml(what)}</span><span class="keys">${keys.map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join('')}</span></div>`;
      html += '</div>';
      if (id === 'pc') html += `<div class="tip"><b>Click the game once</b> to capture the mouse for camera control. Press <kbd>Esc</kbd> to release it and pause.</div>`;
      if (id === 'mac')
        html += `<div class="tip"><b>On a trackpad:</b> click = light attack, two-finger click = block. Many players prefer <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> for light / heavy / block, with the trackpad or arrow keys to look. Click the game once to capture the cursor; <kbd>Esc</kbd> releases it.</div>`;
      if (id === 'pad') html += `<div class="tip">Xbox, PlayStation and most Bluetooth controllers work in Chrome, Edge, Firefox and Safari. <b>Press any button</b> after connecting so the browser notices it.</div>`;
      if (id === 'touch')
        html += `<div class="tip"><b>Turn your phone sideways</b> for the best view. Graphics default to Low on phones; you can raise them in Settings if your device keeps up. Voice lines use your device's built-in speech.</div>`;
      html += `<h3>Survival</h3>
        <div class="tip"><b>Death costs a memory.</b> Each memory in your book grants a perk; lose the memory, lose the perk. Memory shards hidden in the world bring them back.</div>
        <div class="tip"><b>Parry</b> by pressing Block just as a blow lands. Parries and heavy hits fill an enemy's <b>posture</b> (the white bar). When it breaks they stagger: press Interact or Attack to <b>Execute</b>.</div>
        <div class="tip">A <b style="color:#ff6a50">red flash</b> means an unblockable stillfire strike. Dodge it. <b>Hum</b> to slowly heal. Some frightened enemies lay down their arms if they hear it.</div>`;
      body.innerHTML = html;
    };
    for (const d of defs) {
      const t = el('button', 'tab' + (d.detected ? ' active' : ''), escapeHtml(d.label) + (d.detected ? '<span class="badge">● detected</span>' : ''));
      t.dataset.id = d.id;
      t.addEventListener('click', () => {
        this.hooks.click();
        render(d.id);
      });
      tabs.appendChild(t);
    }
    p.append(tabs, body);
    render(defs.find((d) => d.detected)?.id ?? 'pc');
    const row = el('div', 'row');
    row.appendChild(this.button(doneLabel, onDone, 'btn primary'));
    p.appendChild(row);
    s.appendChild(p);
    this.backAction = doneLabel === 'Begin' ? null : onDone;
    this.focusIdx = this.buttons().length - 1;
    this.markFocus();
  }

  showSettings(onBack: () => void) {
    const s = this.screen();
    this.current = 'settings';
    const p = el('div', 'panel');
    p.innerHTML = '<h2>Settings</h2>';
    const st = this.settings;
    const apply = () => this.hooks.onSettings(st);
    const slider = (label: string, key: 'master' | 'music' | 'sfx' | 'voiceVolume' | 'sensitivity', min = 0, max = 1, step = 0.05) => {
      const r = el('div', 'set-row');
      r.innerHTML = `<label>${label}</label>`;
      const i = el('input');
      i.type = 'range';
      i.min = String(min);
      i.max = String(max);
      i.step = String(step);
      i.value = String(st[key]);
      i.addEventListener('input', () => {
        st[key] = parseFloat(i.value);
        apply();
      });
      r.appendChild(i);
      p.appendChild(r);
    };
    const check = (label: string, key: 'voice' | 'subtitles' | 'invertY') => {
      const r = el('div', 'set-row');
      r.innerHTML = `<label>${label}</label>`;
      const i = el('input');
      i.type = 'checkbox';
      i.checked = st[key];
      i.addEventListener('change', () => {
        st[key] = i.checked;
        apply();
      });
      r.appendChild(i);
      p.appendChild(r);
    };
    const select = <K extends 'quality' | 'difficulty' | 'touchControls'>(label: string, key: K, opts: [Settings[K], string][]) => {
      const r = el('div', 'set-row');
      r.innerHTML = `<label>${label}</label>`;
      const sel = el('select');
      for (const [v, l] of opts) {
        const o = el('option', undefined, l);
        o.value = String(v);
        if (st[key] === v) o.selected = true;
        sel.appendChild(o);
      }
      sel.addEventListener('change', () => {
        st[key] = sel.value as Settings[K];
        apply();
      });
      r.appendChild(sel);
      p.appendChild(r);
    };
    p.appendChild(el('h3', undefined, 'Audio'));
    slider('Master volume', 'master');
    slider('Music', 'music');
    slider('Effects', 'sfx');
    check('Spoken dialogue (device speech)', 'voice');
    slider('Voice volume', 'voiceVolume');
    check('Subtitles', 'subtitles');
    p.appendChild(el('h3', undefined, 'Game'));
    select('Difficulty', 'difficulty', [
      ['story', 'Story: for the tale'],
      ['soldier', 'Soldier: balanced'],
      ['fortyseven', 'Forty-Seven: unforgiving'],
    ]);
    slider('Camera sensitivity', 'sensitivity', 0.3, 2.5, 0.05);
    check('Invert camera Y', 'invertY');
    p.appendChild(el('h3', undefined, 'Display'));
    select('Graphics quality', 'quality', [
      ['low', 'Low (phones, older laptops)'],
      ['medium', 'Medium'],
      ['high', 'High'],
    ]);
    select('Touch controls', 'touchControls', [
      ['auto', 'Automatic'],
      ['on', 'Always show'],
      ['off', 'Never show'],
    ]);
    const row = el('div', 'row');
    row.appendChild(this.button('Back', onBack, 'btn primary'));
    p.appendChild(row);
    s.appendChild(p);
    this.backAction = onBack;
    this.focusIdx = this.buttons().length - 1;
    this.markFocus();
  }

  showPause(chapterTitle: string, onBook: () => void, onControls: () => void) {
    const s = this.screen();
    this.current = 'pause';
    const wrap = el('div', 'title-wrap');
    wrap.innerHTML = `<div class="title-sub" style="font-size:16px;letter-spacing:.3em;text-transform:uppercase;font-style:normal;font-family:var(--ui);color:var(--gold)">Paused</div><div class="title-sub">${escapeHtml(chapterTitle)}</div>`;
    s.appendChild(wrap);
    const m = el('div', 'menu');
    m.appendChild(this.button('Resume', () => this.hooks.onResume(), 'btn primary'));
    m.appendChild(this.button('Memory Book', onBook));
    m.appendChild(this.button('Controls', onControls));
    m.appendChild(this.button('Settings', () => this.showSettings(() => this.showPause(chapterTitle, onBook, onControls))));
    m.appendChild(this.button('Restart from Checkpoint', () => this.hooks.onRestartCheckpoint()));
    m.appendChild(this.button('Quit to Title', () => this.hooks.onQuitToTitle()));
    s.appendChild(m);
    this.backAction = () => this.hooks.onResume();
    this.markFocus();
  }

  showBook(kept: boolean[], life: number | null, onBack: () => void, firstLife = false) {
    const s = this.screen();
    this.current = 'book';
    const p = el('div', 'panel book');
    if (firstLife) {
      p.innerHTML = `<h2>No Book Yet</h2><p>This is a first life. Nothing has been lost, so nothing has been written down.</p><p>In eighty-two years, someone will start keeping it for you.</p>`;
    } else {
      const lost = kept.filter((k, i) => !k && !MEMORIES[i].permanent).length;
      p.innerHTML = `<h2>Memory Book</h2><p>Kept by Elias Solen, in a careful priest's hand. ${life ? `Life ${life}.` : ''} ${lost ? `${lost} ${lost === 1 ? 'page has' : 'pages have'} gone blank.` : 'Every page is still legible.'}</p>`;
      const g = el('div', 'book-grid');
      MEMORIES.forEach((m, i) => {
        const keptM = kept[i];
        const c = el('div', 'mem-card' + (keptM ? '' : ' lost') + (m.sealed ? ' sealed' : ''));
        c.innerHTML = keptM
          ? `<div class="mt">${escapeHtml(m.title)}</div><div class="mx">${escapeHtml(m.text)}</div><div class="mp">${escapeHtml(m.perk)}</div>`
          : `<div class="mt">${escapeHtml(m.title)}</div><div class="mx">The page is blank. You know something was written here because the paper is softer, as if it was read often.</div><div class="mp">Perk lost</div>`;
        g.appendChild(c);
      });
      p.appendChild(g);
    }
    const row = el('div', 'row');
    row.appendChild(this.button('Close', onBack, 'btn primary'));
    p.appendChild(row);
    s.appendChild(p);
    this.backAction = onBack;
    this.focusIdx = this.buttons().length - 1;
    this.markFocus();
  }

  showCredits(stats: Stats, life: number, memoriesKept: number, onDone: () => void) {
    const s = this.screen('solid');
    this.current = 'credits';
    const c = el('div', 'credits');
    c.innerHTML = `
      <h2>AFTERLIGHT</h2>
      <div class="title-sub" style="margin-bottom:26px">End of Act I · The Forty-Seventh Life</div>
      <div class="stat"><span>Time played</span><span>${formatTime(stats.playTime)}</span></div>
      <div class="stat"><span>Life at the end of the act</span><span>${life}</span></div>
      <div class="stat"><span>Deaths</span><span>${stats.deaths}</span></div>
      <div class="stat"><span>Memories still in the book</span><span>${memoriesKept}</span></div>
      <div class="stat"><span>Enemies defeated</span><span>${stats.kills}</span></div>
      <div class="stat"><span>Spared by the hum</span><span>${stats.mercy}</span></div>
      <div class="stat"><span>Parries</span><span>${stats.parries}</span></div>
      <p style="color:var(--muted);margin-top:28px;line-height:1.6;font-family:var(--display);font-size:19px;font-style:italic">Story, world and characters by Krish.<br/>Built in code with Claude: every model, sound and note is generated at runtime.</p>
      <p style="color:var(--muted);font-size:13px">Act II: <i>Ashkar</i> · The salt remembers the sea.</p>`;
    const row = el('div', 'row');
    row.appendChild(this.button('Return to Title', onDone, 'btn primary'));
    c.appendChild(row);
    s.appendChild(c);
    this.markFocus();
  }

  // ------------------------------------------------------------ HUD

  private buildHud() {
    const bars = el('div', 'hud-bars');
    const mk = (cls: string, lag = false) => {
      const b = el('div', 'bar ' + cls);
      const l = lag ? el('div', 'lag') : null;
      const f = el('div', 'fill');
      if (l) b.appendChild(l);
      b.appendChild(f);
      bars.appendChild(b);
      return { b, f, l };
    };
    const hp = mk('hp', true);
    const st = mk('stam');
    const po = mk('posture');
    const wrLabel = el('div', 'bar-label', "Kaal's Wrath");
    bars.appendChild(wrLabel);
    const wr = mk('wrath');
    this.hudBars = { hp: hp.f, hpLag: hp.l!, st: st.f, po: po.f, wr: wr.f, wrBar: wr.b, wrLabel };
    const life = el('div', 'hud-life');
    this.lifeEl = el('div', 'life');
    this.memEl = el('div', 'mem');
    life.append(this.lifeEl, this.memEl);
    this.objEl = el('div', 'hud-objective hidden');
    this.objEl.appendChild(el('div', 'o-label', 'Objective'));
    this.objText = el('div', 'o-text');
    this.objDist = el('div', 'o-dist');
    this.objEl.append(this.objText, this.objDist);
    this.counterEl = el('div', 'hud-counter hidden');
    this.bossEl = el('div', 'boss hidden');
    this.bossEl.innerHTML = `<div class="b-name"></div><div class="bar hp"><div class="lag"></div><div class="fill"></div></div><div class="bar posture"><div class="fill"></div></div>`;
    this.promptEl = el('div', 'prompt hidden');
    this.hud.append(bars, life, this.objEl, this.counterEl, this.bossEl, this.promptEl);
  }

  setHUDVisible(v: boolean) {
    this.hud.classList.toggle('hidden', !v);
    this.markerLayer.classList.toggle('hidden', !v);
  }

  updateHUD(h: HUDState) {
    const sc = (e: HTMLElement, v: number) => (e.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`);
    sc(this.hudBars.hp, h.hp / h.maxHp);
    sc(this.hudBars.hpLag, h.hp / h.maxHp);
    sc(this.hudBars.st, h.stamina / h.maxStamina);
    sc(this.hudBars.po, h.posture / h.maxPosture);
    this.hudBars.wrBar.classList.toggle('hidden', !h.showWrath);
    this.hudBars.wrLabel.classList.toggle('hidden', !h.showWrath);
    sc(this.hudBars.wr, h.wrath / 100);
    this.hudBars.wrBar.classList.toggle('full', h.wrath >= 100);
    const key = `${h.life}|${h.memories}|${h.objective}|${h.counter?.n}|${h.counter?.label}|${h.prompt?.text}|${h.prompt?.key}|${h.boss?.name}`;
    if (key !== this.lastHud) {
      this.lastHud = key;
      this.lifeEl.textContent = h.life !== null ? `LIFE ${h.life}` : '';
      this.memEl.textContent = h.memories;
      this.objEl.classList.toggle('hidden', !h.objective);
      this.objText.textContent = h.objective ?? '';
      this.counterEl.classList.toggle('hidden', !h.counter);
      if (h.counter) this.counterEl.innerHTML = `<div class="c-n">${escapeHtml(h.counter.n)}</div><div class="c-l">${escapeHtml(h.counter.label)}</div>`;
      this.promptEl.classList.toggle('hidden', !h.prompt);
      if (h.prompt) this.promptEl.innerHTML = `<kbd>${escapeHtml(h.prompt.key)}</kbd>${escapeHtml(h.prompt.text)}`;
      this.bossEl.classList.toggle('hidden', !h.boss);
      if (h.boss) (this.bossEl.querySelector('.b-name') as HTMLElement).textContent = h.boss.name;
    }
    this.objDist.textContent = h.objectiveDist !== null && h.objectiveDist > 4 ? `${Math.round(h.objectiveDist)} m` : '';
    if (h.boss) {
      const [lag, fill] = Array.from(this.bossEl.querySelectorAll('.bar.hp > div')) as HTMLElement[];
      sc(lag, h.boss.hp / h.boss.maxHp);
      sc(fill, h.boss.hp / h.boss.maxHp);
      sc(this.bossEl.querySelector('.bar.posture .fill') as HTMLElement, h.boss.posture / h.boss.maxPosture);
    }
    this.vignetteEl.style.opacity = String(h.vignette);
  }

  updateMarkers(m: MarkerState) {
    while (this.barPool.length < m.bars.length) {
      const b = el('div', 'ebar', '<i></i><b></b>');
      this.markerLayer.appendChild(b);
      this.barPool.push(b);
    }
    this.barPool.forEach((b, i) => {
      const d = m.bars[i];
      if (!d) {
        b.style.display = 'none';
        return;
      }
      b.style.display = '';
      b.style.left = d.x + 'px';
      b.style.top = d.y + 'px';
      (b.firstChild as HTMLElement).style.width = Math.max(0, d.hp * 100) + '%';
      (b.lastChild as HTMLElement).style.transform = `scaleX(${Math.max(0, Math.min(1, d.posture))})`;
    });
    if (m.reticle) {
      this.reticleEl.classList.remove('hidden');
      this.reticleEl.classList.toggle('exec', m.reticle.exec);
      this.reticleEl.style.left = m.reticle.x + 'px';
      this.reticleEl.style.top = m.reticle.y + 'px';
    } else this.reticleEl.classList.add('hidden');
    if (m.waypoint) {
      this.waypointEl.classList.remove('hidden');
      this.waypointEl.style.left = m.waypoint.x + 'px';
      this.waypointEl.style.top = m.waypoint.y + 'px';
      (this.waypointEl.querySelector('.wd') as HTMLElement).textContent = m.waypoint.dist > 4 ? `${Math.round(m.waypoint.dist)}m` : '';
    } else this.waypointEl.classList.add('hidden');
  }

  // ------------------------------------------------------------ story presentation

  subtitle(speakerId: string | null, text: string, cine = false, hint = '') {
    if (!this.settings.subtitles && speakerId !== 'narrator' && speakerId !== null) {
      this.subEl.innerHTML = hint ? `<div class="line"><span class="next">${escapeHtml(hint)}</span></div>` : '';
      return;
    }
    const sp = speakerId ? SPEAKERS[speakerId] : null;
    const who = sp && sp.name ? `<span class="who" style="color:${sp.color}">${escapeHtml(sp.name)}</span>` : '';
    const italic = speakerId === 'narrator' ? ' style="font-style:italic;font-family:var(--display);font-size:1.15em"' : '';
    this.subEl.className = 'subtitles clickable' + (cine ? ' cine' : '');
    this.subEl.innerHTML = `<div class="line"${italic}>${who}${escapeHtml(text)}${hint ? `<span class="next">${escapeHtml(hint)}</span>` : ''}</div>`;
  }

  clearSubtitle() {
    this.subEl.innerHTML = '';
  }

  /** Resolves when the player clicks the subtitle box. */
  waitClickAdvance(): Promise<void> {
    return new Promise((r) => (this.advanceResolve = r));
  }

  cancelAdvance() {
    this.advanceResolve = null;
  }

  choice(options: string[]): Promise<number> {
    this.choiceEl.innerHTML = '';
    this.choiceEl.classList.remove('hidden');
    this.focusIdx = 0;
    return new Promise((resolve) => {
      this.choiceResolve = resolve;
      options.forEach((o, i) => {
        const b = this.button(`${i + 1}. ${o}`, () => this.resolveChoice(i));
        this.choiceEl.appendChild(b);
      });
      this.markFocus();
    });
  }

  resolveChoice(i: number) {
    const r = this.choiceResolve;
    if (!r) return;
    this.choiceResolve = null;
    this.choiceEl.classList.add('hidden');
    this.choiceEl.innerHTML = '';
    r(i);
  }

  get choosing() {
    return !!this.choiceResolve;
  }

  toast(text: string, cls = '') {
    const t = el('div', 't ' + cls, escapeHtml(text));
    this.toastEl.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .6s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 700);
    }, 4200);
  }

  setLetterbox(on: boolean) {
    this.letterboxEl.classList.toggle('on', on);
  }

  fade(to: number, dur = 0.8, white = false): Promise<void> {
    this.fadeEl.classList.toggle('white', white);
    this.fadeEl.style.transition = `opacity ${dur}s ease`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((r) => setTimeout(r, dur * 1000));
  }

  get fadeLevel() {
    return parseFloat(this.fadeEl.style.opacity || '0');
  }

  card(kicker: string, title: string, sub: string, hold: number): Promise<void> {
    const c = el('div', 'card');
    c.innerHTML = `<div class="k">${escapeHtml(kicker)}</div><div class="h">${escapeHtml(title)}</div>${sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''}`;
    this.cardLayer.appendChild(c);
    return new Promise((r) =>
      setTimeout(() => {
        c.classList.add('out');
        setTimeout(() => {
          c.remove();
          r();
        }, 1000);
      }, hold * 1000),
    );
  }

  journal(label: string, text: string, hold: number): Promise<void> {
    const c = el('div', 'card');
    c.style.background = 'rgba(8,6,12,0.82)';
    c.innerHTML = `<div class="journal"><span class="jl">${escapeHtml(label)}</span>${escapeHtml(text)}</div>`;
    this.cardLayer.appendChild(c);
    return new Promise((r) =>
      setTimeout(() => {
        c.classList.add('out');
        setTimeout(() => {
          c.remove();
          r();
        }, 1000);
      }, hold * 1000),
    );
  }

  death(l1: string, l2: string, l3: string): HTMLElement {
    const s = this.screen('');
    this.current = 'death';
    s.style.background = 'transparent';
    const d = el('div', 'death');
    d.innerHTML = `<div class="d1">${escapeHtml(l1)}</div>${l2 ? `<div class="d2">${escapeHtml(l2)}</div>` : ''}${l3 ? `<div class="d3">${escapeHtml(l3)}</div>` : ''}`;
    s.appendChild(d);
    return s;
  }
}
