/* 羊了个羊 · 复刻版
 * 规则：点击未被遮挡的牌放入底部 7 格卡槽，三张相同自动消除；卡槽满 7 张即失败。
 * 第 1 关为新手关，第 2 关起为“地狱难度”：16 种图案、9 层以上叠放 + 左右两组盲牌堆。
 * 关卡由“逆向生成”保证至少存在一条通关路径（与原版纯随机不同，但难度同样感人）。
 */
(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, SAFE_TOP = 0;

/* ---------------- 工具 ---------------- */
let rand = Math.random;
const ri = (n) => Math.floor(rand() * n);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function vib(ms) {
  try { if (window.AndroidBridge) window.AndroidBridge.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

/* ---------------- 存档 ---------------- */
const SAVE_KEY = 'sheep_clone_save_v1';
const save = Object.assign({ unlocked: 1, sound: true, wins: 0, tries: 0, flock: 0 }, (() => {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { return {}; }
})());
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ---------------- 音效（WebAudio 合成，无需素材） ---------------- */
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const MELODY = [76, 79, 81, 79, 76, 74, 72, 74, 76, 79, 81, 84, 81, 79, 76, 0,
                74, 76, 79, 76, 74, 72, 69, 72, 74, 0, 76, 74, 72, 0, 0, 0];
const BASS = [48, 0, 55, 0, 45, 0, 52, 0, 53, 0, 60, 0, 43, 0, 50, 0];
const Sound = {
  ac: null, master: null, bgm: null, timer: null, next: 0, step: 0,
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ac = new AC();
    this.master = this.ac.createGain(); this.master.gain.value = save.sound ? 1 : 0; this.master.connect(this.ac.destination);
    this.bgm = this.ac.createGain(); this.bgm.gain.value = 0.10; this.bgm.connect(this.master);
    this.startBgm();
  },
  setOn(on) {
    save.sound = on; persist();
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ac.currentTime, 0.05);
  },
  tone(freq, dur, type, vol, when, slide, dest) {
    if (!this.ac || !save.sound) return;
    const t = this.ac.currentTime + (when || 0);
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  tap() { this.tone(620, 0.08, 'triangle', 0.28, 0, 1.7); },
  blocked() { this.tone(170, 0.12, 'square', 0.06, 0, 0.8); },
  match() { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.22, i * 0.055)); this.tone(1568, 0.35, 'sine', 0.12, 0.17); },
  prop() { this.tone(520, 0.14, 'sine', 0.25, 0, 2); this.tone(880, 0.16, 'sine', 0.16, 0.08, 1.5); },
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.09, i * 0.16)); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.22, i * 0.11)); },
  baa() {
    if (!this.ac || !save.sound) return;
    const t = this.ac.currentTime;
    const o = this.ac.createOscillator(), lfo = this.ac.createOscillator(), lg = this.ac.createGain();
    const f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(430, t); o.frequency.linearRampToValueAtTime(350, t + 0.55);
    lfo.frequency.value = 26; lg.gain.value = 28; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
  },
  startBgm() {
    if (!this.ac || this.timer) return;
    this.next = this.ac.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 90);
  },
  stopBgm() { clearInterval(this.timer); this.timer = null; },
  schedule() {
    const stepDur = 0.19;
    while (this.next < this.ac.currentTime + 0.35) {
      const i = this.step % MELODY.length;
      const m = MELODY[i];
      if (m) this.tone(midi(m), stepDur * 1.6, 'triangle', 0.5, this.next - this.ac.currentTime, 0, this.bgm);
      const b = BASS[i % BASS.length];
      if (b) this.tone(midi(b), stepDur * 1.8, 'sine', 0.7, this.next - this.ac.currentTime, 0, this.bgm);
      this.next += stepDur; this.step++;
    }
  },
  suspend() { if (this.ac) this.ac.suspend(); },
  resume() { if (this.ac) this.ac.resume(); },
};

/* ---------------- 小羊 SVG ---------------- */
function sheepSVG(opt) {
  opt = opt || {};
  const wool = opt.wool || '#ffffff';
  const sad = !!opt.sad;
  let puffs = '';
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    puffs += `<circle cx="${(110 + 58 * Math.cos(a)).toFixed(1)}" cy="${(112 + 36 * Math.sin(a)).toFixed(1)}" r="24"/>`;
  }
  const eyes = sad
    ? `<path d="M-15 3 Q-9 -2 -3 3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M3 3 Q9 -2 15 3" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M-12 9 q-3 6 0 8 q3 -2 0 -8z" fill="#7fd3ff"/>`
    : `<ellipse cx="-9" cy="2" rx="6.5" ry="7.5" fill="#fff"/><ellipse cx="9" cy="2" rx="6.5" ry="7.5" fill="#fff"/>
       <circle cx="-8" cy="4" r="3.8" fill="#151515"/><circle cx="10" cy="4" r="3.8" fill="#151515"/>
       <circle cx="-6.6" cy="2.4" r="1.4" fill="#fff"/><circle cx="11.4" cy="2.4" r="1.4" fill="#fff"/>`;
  const mouth = sad
    ? `<path d="M-6 25 Q0 19 6 25" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<path d="M-6 20 Q0 26 6 20" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="104" cy="188" rx="66" ry="9" fill="rgba(0,0,0,.18)"/>
  <g stroke="#3f3f3f" stroke-width="10" stroke-linecap="round">
    <line x1="76" y1="148" x2="74" y2="182"/><line x1="98" y1="152" x2="98" y2="184"/>
    <line x1="122" y1="152" x2="122" y2="184"/><line x1="146" y1="148" x2="148" y2="182"/>
  </g>
  <g fill="${wool}" stroke="#e2dabd" stroke-width="3">${puffs}</g>
  <ellipse cx="110" cy="112" rx="60" ry="38" fill="${wool}"/>
  <circle cx="172" cy="96" r="12" fill="${wool}" stroke="#e2dabd" stroke-width="3"/>
  <g transform="translate(58 96)">
    <ellipse cx="-26" cy="-6" rx="17" ry="8" fill="#3f3f3f" transform="rotate(-28 -26 -6)"/>
    <ellipse cx="26" cy="-6" rx="17" ry="8" fill="#3f3f3f" transform="rotate(28 26 -6)"/>
    <ellipse cx="-27" cy="-5" rx="9" ry="4" fill="#ff9fb0" transform="rotate(-28 -27 -5)"/>
    <ellipse cx="27" cy="-5" rx="9" ry="4" fill="#ff9fb0" transform="rotate(28 27 -5)"/>
    <ellipse cx="0" cy="8" rx="25" ry="31" fill="#3f3f3f"/>
    <g fill="${wool}" stroke="#e2dabd" stroke-width="2.5">
      <circle cx="-13" cy="-21" r="11"/><circle cx="13" cy="-21" r="11"/><circle cx="0" cy="-27" r="12"/>
    </g>
    ${eyes}
    <ellipse cx="-16" cy="16" rx="5" ry="3" fill="#ff8fa3" opacity=".85"/>
    <ellipse cx="16" cy="16" rx="5" ry="3" fill="#ff8fa3" opacity=".85"/>
    ${mouth}
  </g>
</svg>`;
}
document.querySelectorAll('[data-sheep]').forEach((el) => { el.innerHTML = sheepSVG({ sad: el.classList.contains('sad') }); });

/* ---------------- 关卡生成 ---------------- */
// 坐标单位：半张牌宽。一张牌占 2×2 单位。棋盘 x∈[0,12]、y∈[0,14]。
const ICONS = ['🥕', '🌽', '🥬', '🔔', '✂️', '🧤', '🔥', '🌾', '🍄', '🌰', '🥛', '🧶', '🌻', '🥚', '🧺', '🍀', '🍓', '🍇', '🌸', '🍑'];
const PILE_Y = 16.7, TEMP_Y = 19.3, PILE_STEP = 0.3;

function levelConfig(n) {
  if (n === 1) return { n, name: '第 1 关', tag: '新手教学', fixed: true, types: 3, window: 1 };
  if (n === 2) return { n, name: '第 2 关', tag: '地狱难度', layers: 9, density: 0.56, pile: 10, types: 16, window: 3, deep: 0.55 };
  const k = n - 2;
  return {
    n, name: `第 ${n} 关`, tag: '地狱难度+', layers: Math.min(9 + k, 13), density: Math.min(0.56 + k * 0.012, 0.64),
    pile: Math.min(10 + k, 15), types: Math.min(16 + k, ICONS.length), window: 3, deep: Math.min(0.55 + k * 0.03, 0.75),
  };
}

const SHAPES = [
  () => 0.5,                                                     // 纯随机
  (cx, cy) => 1 - (Math.abs(cx) + Math.abs(cy)) * 0.75,          // 菱形
  (cx, cy) => 1 - Math.max(Math.abs(cx), Math.abs(cy)),          // 方块
  (cx, cy) => Math.abs(Math.max(Math.abs(cx), Math.abs(cy)) - 0.75) < 0.26 ? 1 : 0, // 回字
  (cx, cy) => (Math.abs(cx) < 0.3 || Math.abs(cy) < 0.25) ? 1 : 0.1,               // 十字
  (cx, cy) => Math.abs(cx) > 0.45 ? 1 : 0.15,                    // 两侧
  (cx, cy) => (Math.abs(cy) > 0.5) ? 0.95 : 0.2,                 // 上下
];

function genLayout(cfg) {
  const pos = [];
  if (cfg.fixed) {
    for (const x of [3, 5, 7, 9]) for (const y of [5, 7, 9]) pos.push({ x, y, layer: 0 });
    for (const x of [4, 6, 8]) for (const y of [6, 8]) pos.push({ x, y, layer: 1 });
    for (const x of [4, 6, 8]) for (const y of [5, 7, 9]) pos.push({ x, y, layer: 2 });
    return pos;
  }
  const ODD = [[1, 1], [1, 0], [0, 1]];
  for (let L = 0; L < cfg.layers; L++) {
    const [ox, oy] = L % 2 === 0 ? [0, 0] : ODD[ri(3)];
    const cols = ox ? 6 : 7, rows = oy ? 7 : 8;
    const shape = SHAPES[ri(SHAPES.length)];
    const half = Math.ceil(cols / 2);
    const cells = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < half; i++) {
        const cx = (i - (cols - 1) / 2) / (cols / 2), cy = (j - (rows - 1) / 2) / (rows / 2);
        cells.push({ i, j, score: shape(cx, cy) + rand() * 0.7, w: (i === cols - 1 - i) ? 1 : 2 });
      }
    }
    cells.sort((a, b) => b.score - a.score);
    const want = Math.round(cols * rows * cfg.density * (0.85 + rand() * 0.3));
    let got = 0;
    for (const c of cells) {
      if (got >= want) break;
      const xs = c.w === 1 ? [c.i] : [c.i, cols - 1 - c.i];
      for (const i of xs) pos.push({ x: ox + i * 2, y: oy + c.j * 2, layer: L });
      got += c.w;
    }
  }
  // 左右盲牌堆
  for (let p = 0; p < cfg.pile; p++) {
    pos.push({ x: p * PILE_STEP, y: PILE_Y, layer: p, pile: 'L' });
    pos.push({ x: 12 - p * PILE_STEP, y: PILE_Y, layer: p, pile: 'R' });
  }
  // 总数凑成 3 的倍数：从最顶层随机去掉
  while (pos.length % 3) {
    let top = -1; pos.forEach((p) => { if (!p.pile && p.layer > top) top = p.layer; });
    const idx = pos.map((p, i) => (!p.pile && p.layer === top) ? i : -1).filter((i) => i >= 0);
    pos.splice(idx[ri(idx.length)], 1);
  }
  return pos;
}

const overlap = (a, b) => Math.abs(a.x - b.x) < 1.98 && Math.abs(a.y - b.y) < 1.98;

// 逆向生成：模拟一条随机的“合法拆牌顺序”，每 window 组三连在顺序窗口内打乱分配图案，
// 保证按该顺序拿牌时卡槽最多 7 张且必定消除 → 至少有一个解。
function assignTypes(tiles, cfg) {
  const n = tiles.length;
  const below = tiles.map(() => []);
  const cnt = new Array(n).fill(0);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a !== b && tiles[b].layer > tiles[a].layer && overlap(tiles[a], tiles[b])) { below[b].push(a); cnt[a]++; }
  }
  const free = [];
  for (let i = 0; i < n; i++) if (!cnt[i]) free.push(i);
  const order = [];
  while (free.length) {
    // deep：偏向“刚露出来的牌”，迫使玩家往深处挖
    const k = rand() < (cfg.deep || 0) ? free.length - 1 : ri(free.length);
    const t = free.splice(k, 1)[0];
    order.push(t);
    for (const a of below[t]) if (--cnt[a] === 0) free.push(a);
  }
  const types = shuffle([...Array(cfg.types).keys()]);
  let tp = 0;
  const win = 3 * cfg.window;
  for (let c = 0; c < order.length; c += win) {
    const chunk = order.slice(c, c + win);
    const arr = [];
    for (let k = 0; k < chunk.length / 3; k++) { const ty = types[tp++ % types.length]; arr.push(ty, ty, ty); }
    shuffle(arr);
    chunk.forEach((ti, idx) => { tiles[ti].type = arr[idx]; });
  }
}

let tileId = 0;
function generate(cfg) {
  const pos = genLayout(cfg);
  const tiles = pos.map((p) => ({
    id: ++tileId, x: p.x, y: p.y, layer: p.layer, pile: p.pile || null, type: 0,
    status: 'board', covered: false, px: 0, py: 0, tx: 0, ty: 0, scale: 1, delay: 0,
    dying: false, dieAt: 0, wiggle: 0, flip: 0, prevType: 0,
  }));
  assignTypes(tiles, cfg);
  return tiles;
}

/* ---------------- 游戏状态 ---------------- */
const SLOT_MAX = 7;
const G = {
  state: 'menu', level: 1, cfg: null, tiles: [], slot: [], last: null,
  props: { out: 1, undo: 1, shuffle: 1 }, revive: 1, outUses: 0,
  particles: [], time: 0, total: 0, shake: 0, warn: 0, banner: 0,
};
let L = {}; // 布局

function liveSlot() { return G.slot.filter((t) => !t.dying); }
function boardTiles() { return G.tiles.filter((t) => t.status === 'board'); }

function computeCovered() {
  const b = boardTiles();
  for (const t of b) {
    t.covered = false;
    for (const o of b) {
      if (o !== t && o.layer > t.layer && overlap(o, t)) { t.covered = true; break; }
    }
  }
}

function startLevel(n) {
  G.level = n; G.cfg = levelConfig(n);
  G.tiles = generate(G.cfg);
  G.slot = []; G.last = null; G.particles = [];
  G.props = { out: 1, undo: 1, shuffle: 1 }; G.revive = 1; G.outUses = 0;
  G.total = G.tiles.length; G.state = 'playing'; G.banner = 2.2; G.warn = 0;
  computeCovered();
  sortTiles();
  for (const t of G.tiles) {
    target(t);
    t.px = t.tx; t.py = t.ty - H * (0.7 + rand() * 0.3);
    t.delay = (t.pile ? 0.5 + t.layer * 0.03 : t.layer * 0.07) + rand() * 0.15;
  }
  save.tries++; persist();
  hideAll(); updateHud();
}

let drawOrder = [];
function sortTiles() {
  drawOrder = G.tiles.slice().sort((a, b) => (a.layer - b.layer) || (a.y - b.y) || (a.x - b.x));
}

function target(t) {
  if (t.status === 'board') {
    t.tx = L.bx + t.x * L.u; t.ty = L.by + t.y * L.u;
  } else if (t.status === 'slot') {
    const i = G.slot.indexOf(t);
    t.tx = L.sx + i * (L.S + L.pad); t.ty = L.sy;
  }
}

function pick(t) {
  if (liveSlot().length >= SLOT_MAX) return;
  G.last = { tile: t, x: t.x, y: t.y, layer: t.layer, pile: t.pile };
  t.status = 'slot';
  let idx = -1;
  for (let i = G.slot.length - 1; i >= 0; i--) if (!G.slot[i].dying && G.slot[i].type === t.type) { idx = i; break; }
  if (idx < 0) G.slot.push(t); else G.slot.splice(idx + 1, 0, t);
  Sound.tap(); vib(8);

  const same = liveSlot().filter((s) => s.type === t.type);
  if (same.length >= 3) {
    same.slice(0, 3).forEach((s) => { s.dying = true; s.dieAt = G.time + 0.34; });
    G.last = null;
    setTimeout(() => { Sound.match(); vib(25); }, 300);
  }
  if (G.slot.length > SLOT_MAX) purgeDying();
  computeCovered();
  afterMove();
}

function afterMove() {
  const live = liveSlot().length;
  if (live >= SLOT_MAX) {
    G.state = 'failing'; G.shake = 0.45;
    setTimeout(() => { Sound.fail(); vib(220); }, 250);
    setTimeout(showFail, 900);
    return;
  }
  if (boardTiles().length === 0 && live === 0) {
    G.state = 'winning';
    setTimeout(() => { Sound.win(); Sound.baa(); }, 450);
    setTimeout(showWin, 1200);
  }
  updateHud();
}

function killTile(t) {
  t.status = 'gone'; t.dying = false;
  const i = G.slot.indexOf(t); if (i >= 0) G.slot.splice(i, 1);
  burst(t.px + L.S / 2, t.py + L.S / 2);
}
function purgeDying() { G.slot.filter((t) => t.dying).forEach(killTile); }

/* ---- 道具 ---- */
function useOut(free) {
  const live = liveSlot();
  if (!live.length) { toast('卡槽里没有牌可以移出'); return false; }
  if (!free) { if (G.props.out <= 0) { toast('「移出」道具已用完'); return false; } G.props.out--; }
  const take = live.slice(0, 3);
  take.forEach((t, i) => {
    const k = G.slot.indexOf(t); G.slot.splice(k, 1);
    t.status = 'board'; t.pile = null;
    t.x = 4 + i * 2; t.y = TEMP_Y; t.layer = 1000 + G.outUses;
  });
  G.outUses++; G.last = null;
  computeCovered(); sortTiles(); Sound.prop(); vib(15);
  updateHud();
  return true;
}
function useUndo() {
  if (G.props.undo <= 0) { toast('「撤回」道具已用完'); return; }
  const m = G.last;
  if (!m || m.tile.status !== 'slot' || m.tile.dying) { toast('没有可以撤回的牌'); return; }
  G.props.undo--;
  const t = m.tile; const k = G.slot.indexOf(t); G.slot.splice(k, 1);
  t.status = 'board'; t.x = m.x; t.y = m.y; t.layer = m.layer; t.pile = m.pile;
  G.last = null;
  computeCovered(); sortTiles(); Sound.prop(); vib(15);
  updateHud();
}
function useShuffle() {
  if (G.props.shuffle <= 0) { toast('「洗牌」道具已用完'); return; }
  const b = boardTiles(); if (b.length < 2) { toast('场上的牌太少了'); return; }
  G.props.shuffle--;
  const types = shuffle(b.map((t) => t.type));
  b.forEach((t, i) => { t.prevType = t.type; t.type = types[i]; t.flip = 0.5 + rand() * 0.15; });
  Sound.prop(); vib(15);
  updateHud();
}

function onTapBoard(x, y) {
  const order = drawOrder;
  for (let i = order.length - 1; i >= 0; i--) {
    const t = order[i];
    if (t.status !== 'board') continue;
    if (x >= t.tx && x <= t.tx + L.S && y >= t.ty && y <= t.ty + L.S) {
      if (t.covered) { t.wiggle = 0.3; Sound.blocked(); return true; }
      pick(t); return true;
    }
  }
  return false;
}

/* ---------------- 布局 ---------------- */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';
const UI_FONT = '"PingFang SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",sans-serif';
const PROPS = [
  { key: 'out', label: '移出', icon: '📤' },
  { key: 'undo', label: '撤回', icon: '↩️' },
  { key: 'shuffle', label: '洗牌', icon: '🔀' },
];
let sprites = [], backSprite = null, shadeSprite = null, bgCanvas = null;

function layout() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  SAFE_TOP = Math.max($('#safe-probe').offsetHeight || 0, 22);
  const topH = SAFE_TOP + 66;
  const btnH = 58, bottom = 22;
  const avail = H - topH - btnH - bottom - 14;
  const u = Math.max(8, Math.min(W / 15.4, avail / 25.1));
  const S = 2 * u;
  const bx = (W - 14 * u) / 2;
  const by = topH + Math.max(0, (avail - 25.1 * u) * 0.35);
  const tw = 15 * u, tx = (W - tw) / 2, pad = (tw - 7 * S) / 8;
  const ty = by + 21.9 * u, th = S + 0.9 * u + S * 0.11;
  const bw = Math.min(118, (W - 56) / 3), gap = Math.min(18, (W - bw * 3) / 4);
  const btnY = Math.min(ty + th + 16, H - bottom - btnH);
  L = { u, S, bx, by, tx, ty, tw, th, pad, sx: tx + pad, sy: ty + 0.45 * u, btnY, btnH, bw, gap, topH, d: Math.round(S * 0.11), m: Math.ceil(S * 0.16) };
  L.buttons = PROPS.map((p, i) => ({ ...p, x: W / 2 - (bw * 1.5 + gap) + i * (bw + gap), y: btnY, w: bw, h: btnH }));
  L.pause = { x: Math.max(bx, 14) + 22, y: SAFE_TOP + 30, r: 21 };
  buildSprites(); buildBg();
  for (const t of G.tiles) { if (t.status === 'gone') continue; target(t); if (t.delay <= 0) { t.px = t.tx; t.py = t.ty; } }
}

function buildSprites() {
  const { S, d, m } = L;
  const cw = Math.ceil((S + 2 * m) * DPR), ch = Math.ceil((S + d + 2 * m) * DPR);
  const r = S * 0.17;
  const mk = (drawFace) => {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d'); g.scale(DPR, DPR); g.translate(m, m);
    // 投影
    g.save(); g.shadowColor = 'rgba(25,60,10,.38)'; g.shadowBlur = S * 0.14; g.shadowOffsetY = S * 0.07;
    rr(g, 0, d, S, S, r); g.fillStyle = '#5f9330'; g.fill(); g.restore();
    // 厚度
    const gd = g.createLinearGradient(0, d, 0, S + d); gd.addColorStop(0, '#a6d465'); gd.addColorStop(1, '#5c9129');
    rr(g, 0, d, S, S, r); g.fillStyle = gd; g.fill();
    drawFace(g, S, r);
    return c;
  };
  const face = (g, S, r, c1, c2, stroke) => {
    const gf = g.createLinearGradient(0, 0, 0, S); gf.addColorStop(0, c1); gf.addColorStop(1, c2);
    rr(g, 0, 0, S, S, r); g.fillStyle = gf; g.fill();
    g.lineWidth = Math.max(1, S * 0.03); g.strokeStyle = stroke; g.stroke();
    rr(g, S * 0.07, S * 0.06, S * 0.86, S * 0.86, r * 0.75);
    g.lineWidth = Math.max(1, S * 0.025); g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
  };
  sprites = ICONS.map((icon) => mk((g, S, r) => {
    face(g, S, r, '#fffef6', '#f3ecc9', '#ded3a2');
    g.fillStyle = '#000';
    g.font = `${Math.round(S * 0.6)}px ${EMOJI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, S / 2, S * 0.54);
  }));
  backSprite = mk((g, S, r) => {
    face(g, S, r, '#8fd75f', '#5fae35', '#4c8f27');
    g.globalAlpha = 0.25; g.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(S * (0.25 + i * 0.25), S * (0.25 + j * 0.25), S * 0.06, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  });
  const sc = document.createElement('canvas'); sc.width = cw; sc.height = ch;
  const sg = sc.getContext('2d'); sg.scale(DPR, DPR); sg.translate(m, m);
  rr(sg, 0, 0, S, S + d, r); sg.fillStyle = 'rgba(28,36,22,.52)'; sg.fill();
  shadeSprite = sc;
}

function buildBg() {
  const c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
  const g = c.getContext('2d'); g.scale(DPR, DPR);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#bce985'); gr.addColorStop(0.45, '#9fdb6a'); gr.addColorStop(1, '#78bf4b');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 割草条纹
  g.save(); g.globalAlpha = 0.07; g.fillStyle = '#fff';
  const sw = 44;
  for (let x = -H; x < W + H; x += sw * 2) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + sw, 0); g.lineTo(x + sw - H * 0.45, H); g.lineTo(x - H * 0.45, H); g.closePath(); g.fill();
  }
  g.restore();
  let seed = 7;
  const sr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // 草丛
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = sr() * W, y = sr() * H, h = 6 + sr() * 9;
    g.strokeStyle = `rgba(${50 + sr() * 30},${110 + sr() * 30},${25},${0.25 + sr() * 0.2})`; g.lineWidth = 2;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 3, y); g.quadraticCurveTo(x + k * 4, y - h * 0.6, x + k * 7, y - h); g.stroke(); }
  }
  // 小花
  const FC = ['#ffffff', '#fff3a3', '#ffc2d6', '#d9f1ff'];
  for (let i = 0; i < 34; i++) {
    const x = sr() * W, y = sr() * H, r = 2.2 + sr() * 2.4;
    g.fillStyle = FC[Math.floor(sr() * FC.length)]; g.globalAlpha = 0.75;
    for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, 7); g.fill(); }
    g.fillStyle = '#ffb12b'; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill(); g.globalAlpha = 1;
  }
  // 暗角
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(30,70,10,.28)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  bgCanvas = c;
}

/* ---------------- 绘制 ---------------- */
function drawTile(t) {
  const { S, m, d } = L;
  let spr = sprites[t.type];
  let sx = 1, sc = 1, alpha = 1, ox = 0;
  if (t.flip > 0) {
    const p = 1 - t.flip / 0.5;
    sx = Math.max(0.04, Math.abs(Math.cos(clamp(p, 0, 1) * Math.PI)));
    if (p < 0.5) spr = sprites[t.prevType];
  }
  const hidden = t.status === 'board' && t.pile && t.covered;
  if (hidden) spr = backSprite;
  if (t.dying) {
    const k = clamp((G.time - (t.dieAt - 0.14)) / 0.14, 0, 1);
    sc = 1 + 0.35 * k; alpha = 1 - k;
  } else if (t.status === 'slot') {
    const dist = Math.hypot(t.tx - t.px, t.ty - t.py);
    sc = 1 + Math.min(0.18, dist / 600);
  }
  if (t.wiggle > 0) ox = Math.sin(G.time * 70) * 4 * (t.wiggle / 0.3);
  const cx = t.px + S / 2 + ox, cy = t.py + S / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (sx !== 1 || sc !== 1) ctx.scale(sx * sc, sc);
  const w = S + 2 * m, h = S + d + 2 * m;
  ctx.drawImage(spr, -S / 2 - m, -S / 2 - m, w, h);
  if (t.status === 'board' && t.covered && !hidden) ctx.drawImage(shadeSprite, -S / 2 - m, -S / 2 - m, w, h);
  ctx.restore();
}

function drawField() {
  const { u, bx, by } = L;
  // 棋盘柔光底
  ctx.save();
  rr(ctx, bx - 0.5 * u, by - 0.5 * u, 15 * u, 17.2 * u, 2 * u);
  ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.fill();
  // 盲牌堆底座
  if (G.cfg && G.cfg.pile) {
    const pw = (G.cfg.pile - 1) * PILE_STEP * u + 2 * u;
    ctx.fillStyle = 'rgba(40,90,20,.18)';
    rr(ctx, bx - 0.25 * u, by + (PILE_Y - 0.25) * u, pw + 0.5 * u, 2.7 * u, 0.6 * u); ctx.fill();
    rr(ctx, bx + 14 * u - pw - 0.25 * u, by + (PILE_Y - 0.25) * u, pw + 0.5 * u, 2.7 * u, 0.6 * u); ctx.fill();
  }
  // 移出区虚线位
  ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.45)';
  for (let i = 0; i < 3; i++) { rr(ctx, bx + (4 + i * 2) * u + 3, by + TEMP_Y * u + 3, 2 * u - 6, 2 * u - 6, 0.3 * u); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTray() {
  const { tx, ty, tw, th, u, S, pad, sx, sy } = L;
  let ox = 0;
  if (G.shake > 0) ox = Math.sin(G.time * 80) * 7 * (G.shake / 0.45);
  ctx.save(); ctx.translate(ox, 0);
  const r = 0.8 * u;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;
  rr(ctx, tx, ty + 5, tw, th, r); ctx.fillStyle = '#5a3412'; ctx.fill(); ctx.restore();
  const g1 = ctx.createLinearGradient(0, ty, 0, ty + th); g1.addColorStop(0, '#c98a47'); g1.addColorStop(1, '#94592a');
  rr(ctx, tx, ty, tw, th, r); ctx.fillStyle = g1; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,230,190,.5)'; ctx.stroke();
  const g2 = ctx.createLinearGradient(0, ty, 0, ty + th); g2.addColorStop(0, '#5b3517'); g2.addColorStop(1, '#7a4a22');
  rr(ctx, tx + 0.22 * u, ty + 0.22 * u, tw - 0.44 * u, th - 0.44 * u, r * 0.7); ctx.fillStyle = g2; ctx.fill();
  for (let i = 0; i < SLOT_MAX; i++) {
    rr(ctx, sx + i * (S + pad), sy, S, S + L.d * 0.6, S * 0.17);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.stroke();
  }
  const live = liveSlot().length;
  if (live >= 5 && G.state === 'playing' || G.state === 'failing') {
    const a = 0.45 + 0.4 * Math.sin(G.time * (live >= 6 ? 14 : 8));
    rr(ctx, tx - 2, ty - 2, tw + 4, th + 4, r + 2);
    ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,60,50,${a})`; ctx.stroke();
  }
  ctx.restore();
}

function drawButtons() {
  for (const b of L.buttons) {
    const n = G.props[b.key];
    const down = pressed === b.key && G.time - pressT < 0.12 ? 3 : 0;
    const y = b.y + down, r = 16;
    ctx.save();
    if (n <= 0) ctx.globalAlpha = 0.55;
    rr(ctx, b.x, b.y + 5, b.w, b.h, r); ctx.fillStyle = n > 0 ? '#1b62ad' : '#6c757e'; ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, y + b.h);
    if (n > 0) { g.addColorStop(0, '#76cbff'); g.addColorStop(1, '#2f8fe8'); } else { g.addColorStop(0, '#c7cdd3'); g.addColorStop(1, '#98a1aa'); }
    rr(ctx, b.x, y, b.w, b.h, r); ctx.fillStyle = g; ctx.fill();
    rr(ctx, b.x + 4, y + 3, b.w - 8, b.h * 0.42, r - 4); ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = `22px ${EMOJI_FONT}`; ctx.fillText(b.icon, b.x + b.w / 2, y + b.h * 0.36);
    ctx.font = `bold 14px ${UI_FONT}`; ctx.fillStyle = '#fff';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,60,120,.55)';
    ctx.strokeText(b.label, b.x + b.w / 2, y + b.h * 0.76); ctx.fillText(b.label, b.x + b.w / 2, y + b.h * 0.76);
    // 角标
    const bx = b.x + b.w - 6, byy = y + 4;
    ctx.beginPath(); ctx.arc(bx, byy, 11, 0, 7); ctx.fillStyle = n > 0 ? '#ff4d4f' : '#8a8f96'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${UI_FONT}`; ctx.fillText(String(n), bx, byy + 1);
    ctx.restore();
  }
}

function drawTopBar() {
  const cy = SAFE_TOP + 30;
  // 暂停
  const p = L.pause;
  ctx.save();
  ctx.beginPath(); ctx.arc(p.x, p.y + 3, p.r, 0, 7); ctx.fillStyle = 'rgba(40,90,20,.35)'; ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
  ctx.fillStyle = '#4c8f27';
  rr(ctx, p.x - 7, p.y - 8, 5, 16, 2); ctx.fill(); rr(ctx, p.x + 2, p.y - 8, 5, 16, 2); ctx.fill();
  // 标题丝带
  const tw = 136, th = 38, tx = W / 2 - tw / 2, ty = cy - th / 2 - 4;
  ctx.fillStyle = '#c56d00';
  rr(ctx, tx, ty + 4, tw, th, 19); ctx.fill();
  const g = ctx.createLinearGradient(0, ty, 0, ty + th); g.addColorStop(0, '#ffd85a'); g.addColorStop(1, '#ff9d1c');
  rr(ctx, tx, ty, tw, th, 19); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 21px ${UI_FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = '#b35f00';
  const name = G.cfg ? G.cfg.name : '';
  ctx.strokeText(name, W / 2, ty + th / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(name, W / 2, ty + th / 2 + 1);
  if (G.cfg) {
    ctx.font = `bold 11px ${UI_FONT}`;
    const tag = G.cfg.tag, tw2 = ctx.measureText(tag).width + 18;
    rr(ctx, W / 2 - tw2 / 2, ty + th + 4, tw2, 18, 9); ctx.fillStyle = G.level >= 2 ? '#e8463a' : '#3fa34d'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(tag, W / 2, ty + th + 13.5);
  }
  // 剩余
  const remain = G.tiles.filter((t) => t.status !== 'gone' && !t.dying).length;
  const txt = `剩余 ${remain}`;
  ctx.font = `bold 14px ${UI_FONT}`;
  const rw = ctx.measureText(txt).width + 24, rx = Math.min(W - 14, L.bx + 14 * L.u) - rw;
  rr(ctx, rx, cy - 14, rw, 28, 14); ctx.fillStyle = 'rgba(40,90,20,.35)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(txt, rx + rw / 2, cy + 1);
  // 进度条
  const prog = G.total ? 1 - remain / G.total : 0;
  const pw = rw, py = cy + 18;
  rr(ctx, rx, py, pw, 6, 3); ctx.fillStyle = 'rgba(40,90,20,.3)'; ctx.fill();
  if (prog > 0) { rr(ctx, rx, py, Math.max(6, pw * prog), 6, 3); ctx.fillStyle = '#ffe14d'; ctx.fill(); }
  ctx.restore();
}

function drawBanner() {
  if (G.banner <= 0 || !G.cfg) return;
  const t = 2.2 - G.banner;
  const inK = clamp(t / 0.45, 0, 1), outK = clamp((G.banner) / 0.4, 0, 1);
  const s = easeOutBack(inK);
  ctx.save();
  ctx.globalAlpha = outK;
  ctx.translate(W / 2, H * 0.42); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -W * 0.4, -52, W * 0.8, 104, 26); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 40px ${UI_FONT}`; ctx.lineWidth = 6; ctx.strokeStyle = '#3d7a1c';
  ctx.strokeText(G.cfg.name, 0, -12); ctx.fillStyle = '#fff'; ctx.fillText(G.cfg.name, 0, -12);
  ctx.font = `bold 17px ${UI_FONT}`; ctx.fillStyle = G.level >= 2 ? '#ffd0c8' : '#e6ffd0';
  ctx.fillText(G.level >= 2 ? `${G.cfg.tag} · ${G.total} 张牌 · ${G.cfg.types} 种图案` : '三张相同即可消除，卡槽满 7 张就失败', 0, 30);
  ctx.restore();
}

/* ---- 粒子 ---- */
const PC = ['#ffd54a', '#ff7eb3', '#7fe0ff', '#ffffff', '#a8ff6b', '#ffa94d'];
function burst(x, y) {
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2, v = 120 + rand() * 260;
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, age: 0, life: 0.55 + rand() * 0.35,
      size: 4 + rand() * 6, color: PC[ri(PC.length)], star: rand() < 0.55, rot: rand() * 6, vr: (rand() - 0.5) * 12 });
  }
  G.particles.push({ ring: true, x, y, age: 0, life: 0.4 });
}
function drawStar(x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r, a = rot + i * Math.PI / 5;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
function drawParticles() {
  for (const p of G.particles) {
    const k = p.age / p.life;
    ctx.globalAlpha = 1 - k;
    if (p.ring) {
      ctx.beginPath(); ctx.arc(p.x, p.y, L.S * (0.4 + k * 0.9), 0, 7);
      ctx.lineWidth = 5 * (1 - k); ctx.strokeStyle = '#fff7b0'; ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      if (p.star) drawStar(p.x, p.y, p.size, p.rot);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, 7); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  if (G.state === 'menu' || !G.cfg) return;
  drawField();
  for (const t of drawOrder) if (t.status === 'board') drawTile(t);
  drawTray();
  for (const t of G.slot) drawTile(t);
  drawButtons();
  drawParticles();
  drawTopBar();
  drawBanner();
}

function update(dt) {
  G.time += dt;
  for (const t of G.slot.slice()) if (t.dying && G.time >= t.dieAt) killTile(t);
  const k = 1 - Math.exp(-dt * 15);
  for (const t of G.tiles) {
    if (t.status === 'gone') continue;
    target(t);
    if (t.wiggle > 0) t.wiggle = Math.max(0, t.wiggle - dt);
    if (t.flip > 0) t.flip = Math.max(0, t.flip - dt);
    if (t.delay > 0) { t.delay -= dt; continue; }
    t.px += (t.tx - t.px) * k; t.py += (t.ty - t.py) * k;
  }
  for (const p of G.particles) {
    p.age += dt;
    if (!p.ring) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.985; }
  }
  G.particles = G.particles.filter((p) => p.age < p.life);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
  if (G.banner > 0) G.banner = Math.max(0, G.banner - dt);
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  update(dt); render();
  requestAnimationFrame(frame);
}

/* ---------------- 输入 ---------------- */
let pressed = null, pressT = 0;
canvas.addEventListener('pointerdown', (e) => {
  Sound.init();
  if (G.state !== 'playing') return;
  const x = e.clientX, y = e.clientY;
  const p = L.pause;
  if (Math.hypot(x - p.x, y - p.y) < p.r + 10) { showPause(); return; }
  for (const b of L.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h + 5) {
      pressed = b.key; pressT = G.time;
      if (b.key === 'out') useOut(false);
      else if (b.key === 'undo') useUndo();
      else useShuffle();
      return;
    }
  }
  if (G.banner > 0.4) G.banner = 0.4; // 点击时让关卡横幅尽快淡出
  onTapBoard(x, y);
});
window.addEventListener('resize', () => layout());
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------------- 界面 ---------------- */
const MODALS = ['#levels', '#pause', '#fail', '#win'];
function hideAll() { $('#menu').classList.remove('show'); MODALS.forEach((m) => $(m).classList.remove('show')); }
function showModal(id) { $(id).classList.add('show'); }
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1500);
}
function updateHud() {}

function renderStats() {
  $('#stats').textContent = `已加入羊群 ${save.flock} 次 · 累计挑战 ${save.tries} 次`;
  $('#btn-sound').textContent = save.sound ? '🔊' : '🔇';
}
function goMenu() {
  G.state = 'menu'; G.cfg = null; G.tiles = []; G.slot = []; drawOrder = [];
  hideAll(); $('#menu').classList.add('show'); renderStats();
}
function showPause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  $('#btn-sound2').textContent = `声音：${save.sound ? '开' : '关'}`;
  showModal('#pause');
}
function resume() { $('#pause').classList.remove('show'); G.state = 'playing'; }

function showFail() {
  G.state = 'failed';
  const remain = G.tiles.filter((t) => t.status !== 'gone').length;
  const pct = Math.floor((1 - remain / G.total) * 100);
  $('#fail-text').innerHTML = `已完成 <b>${pct}%</b>，还剩 <b>${remain}</b> 张牌<br>${G.level >= 2 ? '据说只有 0.1% 的人能通过第二关…' : '再试一次，很简单的！'}`;
  const rb = $('#btn-revive');
  rb.disabled = G.revive <= 0;
  rb.textContent = G.revive > 0 ? '复活一次（移出 3 张）' : '复活机会已用完';
  showModal('#fail');
}
function showWin() {
  G.state = 'won';
  const n = G.level;
  save.unlocked = Math.max(save.unlocked, n + 1);
  if (n >= 2) { save.flock++; save.wins++; }
  persist();
  $('#win-title').textContent = n >= 2 ? '加入羊群！' : '恭喜通关！';
  $('#win-text').innerHTML = n >= 2
    ? `你成功通过了 ${G.cfg.name}（${G.cfg.tag}）<br>已累计加入羊群 <b>${save.flock}</b> 次`
    : '热身完毕～<br>接下来的第 2 关才是真正的挑战！';
  const flock = $('#flock'); flock.innerHTML = '';
  const WOOL = ['#ffffff', '#fff3d6', '#ffe0ec', '#e3f4ff', '#f0ffe0'];
  const cnt = n >= 2 ? Math.min(8, Math.max(3, save.flock + 2)) : 1;
  for (let i = 0; i < cnt; i++) {
    const d = document.createElement('div'); d.className = 'sheep small';
    d.style.animationDelay = `${i * 0.12}s`;
    d.innerHTML = sheepSVG({ wool: WOOL[i % WOOL.length] });
    flock.appendChild(d);
  }
  $('#btn-next').textContent = `挑战第 ${n + 1} 关`;
  showModal('#win');
}

function openLevels() {
  const grid = $('#level-grid'); grid.innerHTML = '';
  const max = Math.max(12, save.unlocked + 2);
  for (let i = 1; i <= max; i++) {
    const cfg = levelConfig(i);
    const b = document.createElement('button');
    const locked = i > save.unlocked;
    b.className = 'level-cell' + (i >= 2 ? ' hard' : '') + (locked ? ' locked' : '');
    b.innerHTML = `${locked ? '🔒' : i}<small>${cfg.tag}</small>`;
    b.onclick = () => {
      if (locked) { toast('先通过前一关才能解锁哦'); return; }
      Sound.init(); startLevel(i);
    };
    grid.appendChild(b);
  }
  showModal('#levels');
}

$('#btn-start').onclick = () => { Sound.init(); Sound.baa(); startLevel(1); };
$('#btn-levels').onclick = () => { Sound.init(); openLevels(); };
$('#levels [data-close]').onclick = () => $('#levels').classList.remove('show');
$('#btn-sound').onclick = () => { Sound.init(); Sound.setOn(!save.sound); renderStats(); };
$('#btn-sound2').onclick = () => { Sound.init(); Sound.setOn(!save.sound); $('#btn-sound2').textContent = `声音：${save.sound ? '开' : '关'}`; };
$('#btn-resume').onclick = resume;
$('#btn-restart').onclick = () => startLevel(G.level);
$('#btn-home').onclick = goMenu;
$('#btn-home2').onclick = goMenu;
$('#btn-home3').onclick = goMenu;
$('#btn-retry').onclick = () => startLevel(G.level);
$('#btn-next').onclick = () => startLevel(G.level + 1);
$('#btn-revive').onclick = () => {
  if (G.revive <= 0) return;
  G.revive--;
  $('#fail').classList.remove('show');
  G.state = 'playing';
  useOut(true);
  toast('复活成功！3 张牌已移出卡槽');
};
document.querySelector('.sheep-stage').addEventListener('click', () => { Sound.init(); Sound.baa(); });

/* ---------------- Android 桥接 ---------------- */
window.onAndroidBack = () => {
  if ($('#levels').classList.contains('show')) { $('#levels').classList.remove('show'); return true; }
  if (G.state === 'playing') { showPause(); return true; }
  if (G.state === 'paused') { resume(); return true; }
  if (G.state === 'failed' || G.state === 'won') { goMenu(); return true; }
  if (G.state === 'failing' || G.state === 'winning') return true;
  return false;
};
window.onAppPause = () => { Sound.suspend(); if (G.state === 'playing') showPause(); };
window.onAppResume = () => { Sound.resume(); };

/* ---------------- 启动 ---------------- */
// 调试入口：?level=2 直接进入关卡
layout();
renderStats();
const qs = new URLSearchParams(location.search);
if (qs.get('level')) startLevel(parseInt(qs.get('level'), 10) || 1);
requestAnimationFrame(frame);
window.__G = G;
window.__dbg = { levelConfig, generate, overlap };
})();
