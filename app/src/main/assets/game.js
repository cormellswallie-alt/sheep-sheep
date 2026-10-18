/* 游戏核心：状态、规则、道具、回放驱动 */
'use strict';

const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, SAFE_TOP = 0;

const SLOT_MAX = 7;
const G = {
  state: 'menu', mode: 'level', level: 1, seed: 0, code: '', cfg: null,
  tiles: [], solution: [], slot: [], last: null,
  props: { out: 1, undo: 1, shuffle: 1 }, revive: 1, outUses: 0, propsUsed: 0,
  particles: [], floaters: [], confetti: [],
  time: 0, total: 0, shake: 0, banner: 0, startAt: 0, endAt: 0,
  combo: 0, lastMatchT: -9, maxCombo: 0,
  watched: false, replay: null, reward: null,
};
let L = {};
let drawOrder = [];

const liveSlot = () => G.slot.filter((t) => !t.dying);
const boardTiles = () => G.tiles.filter((t) => t.status === 'board');
const remainCount = () => G.tiles.filter((t) => t.status !== 'gone' && !t.dying).length;

function computeCovered() {
  const b = boardTiles();
  for (const t of b) {
    t.covered = false;
    for (const o of b) if (o !== t && o.layer > t.layer && overlap(o, t)) { t.covered = true; break; }
  }
}
function sortTiles() {
  drawOrder = G.tiles.slice().sort((a, b) => (a.layer - b.layer) || (a.y - b.y) || (a.x - b.x));
}

/* opts: { level, seed, mode: 'level'|'daily', replay: bool } */
function startGame(opts) {
  const mode = opts.mode || 'level';
  const cfg = levelConfig(opts.level || 1, mode);
  const seed = opts.seed != null ? opts.seed : randomSeed();
  const gen = generate(cfg, seed);
  Object.assign(G, {
    mode, level: cfg.n, seed, cfg, code: encodeCode(cfg.n, seed),
    tiles: gen.tiles, solution: gen.solution, slot: [], last: null,
    props: { out: 1, undo: 1, shuffle: 1 }, revive: 1, outUses: 0, propsUsed: 0,
    particles: [], floaters: [], confetti: [], total: gen.tiles.length,
    state: 'playing', banner: opts.replay ? 0 : 2.2, shake: 0, combo: 0, lastMatchT: -9, maxCombo: 0,
    startAt: G.time, endAt: 0, reward: null,
    replay: opts.replay ? { idx: 0, speed: G.replay ? G.replay.speed : 1, wait: 1.2 } : null,
  });
  G.watched = !!opts.replay || save.watched.includes(G.code);
  computeCovered(); sortTiles();
  for (const t of G.tiles) {
    target(t);
    t.lit = t.covered ? 0 : 1;
    const delay = opts.replay ? t.layer * 0.02 : (t.pile ? 0.55 + t.layer * 0.035 : t.layer * 0.075) + fr() * 0.18;
    t.px = t.tx; t.py = t.ty - H * (0.75 + fr() * 0.3);
    t.an = { sx: t.px, sy: t.py, ex: t.tx, ey: t.ty, t: 0, dur: 0.6, delay, kind: 'drop', arc: 0 };
  }
  if (!opts.replay) {
    save.tries++;
    if (mode === 'daily') ensureDaily().tries++;
    persist();
  }
  UI.onGameStart();
}

function target(t) {
  if (t.status === 'board') { t.tx = L.bx + t.x * L.u; t.ty = L.by + t.y * L.u; }
  else if (t.status === 'slot') { const i = G.slot.indexOf(t); t.tx = L.sx + i * (L.S + L.pad); t.ty = L.sy; }
}

function pick(t) {
  if (liveSlot().length >= SLOT_MAX) return;
  G.last = { tile: t, x: t.x, y: t.y, layer: t.layer, pile: t.pile };
  t.status = 'slot';
  let idx = -1;
  for (let i = G.slot.length - 1; i >= 0; i--) if (!G.slot[i].dying && G.slot[i].type === t.type) { idx = i; break; }
  if (idx < 0) G.slot.push(t); else G.slot.splice(idx + 1, 0, t);
  Sound.tap(); Native.vib(8);

  const same = liveSlot().filter((s) => s.type === t.type);
  if (same.length >= 3) {
    const three = same.slice(0, 3);
    const mid = three[1];
    three.forEach((s) => { s.dying = true; s.dieAt = G.time + 0.5; s.mergeTo = mid; });
    G.last = null;
    G.combo = (G.time - G.lastMatchT < 3.2) ? G.combo + 1 : 1;
    G.lastMatchT = G.time;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    const combo = G.combo;
    setTimeout(() => { Sound.match(combo); Native.vib(25); }, 420);
  }
  if (G.slot.length > SLOT_MAX) purgeDying();
  computeCovered();
  afterMove();
}

function afterMove() {
  const live = liveSlot().length;
  if (live >= SLOT_MAX) {
    G.state = 'failing'; G.endAt = G.time;
    setTimeout(() => { G.shake = 0.5; Sound.fail(); Native.vib(220); }, 300);
    setTimeout(() => UI.showFail(), 1000);
    return;
  }
  if (boardTiles().length === 0 && live === 0) {
    G.state = 'winning'; G.endAt = G.time;
    setTimeout(() => { Sound.win(); spawnConfetti(); }, 550);
    setTimeout(() => UI.showWin(), G.replay ? 1500 : 1900);
  }
}

function killTile(t) {
  t.status = 'gone'; t.dying = false;
  const i = G.slot.indexOf(t); if (i >= 0) G.slot.splice(i, 1);
  if (t.mergeTo === t) {
    burst(t.px + L.S / 2, t.py + L.S / 2);
    if (G.combo >= 2) floater(t.px + L.S / 2, t.py - 6, `连消 ×${G.combo}`, '#ffe14d', 22);
    else floater(t.px + L.S / 2, t.py - 6, '+3', '#ffffff', 18);
  }
}
function purgeDying() { G.slot.filter((t) => t.dying).forEach(killTile); }

/* ---------------- 道具 ---------------- */
function useOut(free) {
  const live = liveSlot();
  if (!live.length) { toast('卡槽里没有牌可以移出'); return false; }
  if (!free) { if (G.props.out <= 0) { toast('「移出」道具已用完'); return false; } G.props.out--; G.propsUsed++; }
  live.slice(0, 3).forEach((t, i) => {
    G.slot.splice(G.slot.indexOf(t), 1);
    t.status = 'board'; t.pile = null;
    t.x = 4 + i * 2; t.y = TEMP_Y; t.layer = 1000 + G.outUses;
  });
  G.outUses++; G.last = null;
  computeCovered(); sortTiles(); Sound.prop(); Native.vib(15);
  return true;
}
function useUndo() {
  if (G.props.undo <= 0) { toast('「撤回」道具已用完'); return; }
  const m = G.last;
  if (!m || m.tile.status !== 'slot' || m.tile.dying) { toast('没有可以撤回的牌'); return; }
  G.props.undo--; G.propsUsed++;
  const t = m.tile; G.slot.splice(G.slot.indexOf(t), 1);
  t.status = 'board'; t.x = m.x; t.y = m.y; t.layer = m.layer; t.pile = m.pile;
  G.last = null;
  computeCovered(); sortTiles(); Sound.prop(); Native.vib(15);
}
function useShuffle() {
  if (G.props.shuffle <= 0) { toast('「洗牌」道具已用完'); return; }
  const b = boardTiles(); if (b.length < 2) { toast('场上的牌太少了'); return; }
  G.props.shuffle--; G.propsUsed++;
  const types = b.map((t) => t.type);
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
  b.forEach((t, i) => { t.prevType = t.type; t.type = types[i]; t.flip = 0.5 + fr() * 0.2; t.flipFromBack = false; });
  Sound.prop(); Native.vib(15);
}

function onTapBoard(x, y) {
  for (let i = drawOrder.length - 1; i >= 0; i--) {
    const t = drawOrder[i];
    if (t.status !== 'board') continue;
    if (x >= t.tx && x <= t.tx + L.S && y >= t.ty && y <= t.ty + L.S) {
      if (t.covered) { t.wiggle = 0.3; Sound.blocked(); return true; }
      pick(t); return true;
    }
  }
  return false;
}

/* ---------------- 正解回放 ---------------- */
function startReplay() {
  if (!G.replay) G.replay = { speed: 1 };
  startGame({ level: G.level, seed: G.seed, mode: G.mode, replay: true });
  if (!save.watched.includes(G.code)) { save.watched.push(G.code); if (save.watched.length > 60) save.watched.shift(); persist(); }
}
function updateReplay(dt) {
  const R = G.replay;
  if (!R || G.state !== 'playing') return;
  R.wait -= dt * R.speed;
  if (R.wait > 0) return;
  const t = G.solution[R.idx];
  if (!t) return;
  if (t.status !== 'board' || t.covered) { R.idx++; return; }
  t.hint = 0.35;
  pick(t);
  R.idx++;
  R.wait = 0.5;
  UI.onReplayStep(R.idx, G.solution.length);
}

/* ---------------- 布局 & 预渲染 ---------------- */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Android Emoji",sans-serif';
const UI_FONT = '"PingFang SC","Noto Sans SC","Source Han Sans SC","Microsoft YaHei",sans-serif';
const PROPS = [
  { key: 'out', label: '移出', icon: '📤' },
  { key: 'undo', label: '撤回', icon: '↩️' },
  { key: 'shuffle', label: '洗牌', icon: '🔀' },
];
let sprites = [], dimSprites = [], backSprite = null, bgCanvas = null, trayCanvas = null;
const HAS_FILTER = typeof ctx.filter === 'string';

function layout() {
  W = window.innerWidth; H = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  SAFE_TOP = Math.max($('#safe-probe').offsetHeight || 0, 22);
  const topH = SAFE_TOP + 70;
  const btnH = 60, bottom = 20;
  const avail = H - topH - btnH - bottom - 14;
  const u = Math.max(8, Math.min(W / 15.4, avail / 25.2));
  const S = 2 * u;
  const bx = (W - 14 * u) / 2;
  const by = topH + Math.max(0, (avail - 25.2 * u) * 0.35);
  const tw = 15 * u, tx = (W - tw) / 2, pad = (tw - 7 * S) / 8;
  const ty = by + 21.9 * u, th = S + 0.95 * u + S * 0.12;
  const bw = Math.min(118, (W - 56) / 3), gap = Math.min(18, (W - bw * 3) / 4);
  const btnY = Math.min(ty + th + 16, H - bottom - btnH);
  L = { u, S, bx, by, tx, ty, tw, th, pad, sx: tx + pad, sy: ty + 0.48 * u, btnY, btnH, bw, gap, topH,
    d: Math.round(S * 0.12), m: Math.ceil(S * 0.2) };
  L.buttons = PROPS.map((p, i) => ({ ...p, x: W / 2 - (bw * 1.5 + gap) + i * (bw + gap), y: btnY, w: bw, h: btnH }));
  L.pause = { x: Math.max(bx, 14) + 22, y: SAFE_TOP + 30, r: 21 };
  buildSprites(); buildBg(); buildTray();
  for (const t of G.tiles) {
    if (t.status === 'gone') continue;
    target(t);
    if (!t.an || t.an.kind !== 'drop' || t.an.t >= t.an.dur) { t.px = t.tx; t.py = t.ty; t.an = null; }
  }
}

function newLayer(w, h) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * DPR); c.height = Math.ceil(h * DPR);
  const g = c.getContext('2d'); g.scale(DPR, DPR); return [c, g];
}

function buildSprites() {
  const { S, d, m } = L;
  const r = S * 0.18;
  const mk = (drawFace) => {
    const [c, g] = newLayer(S + 2 * m, S + d + 2 * m);
    g.translate(m, m);
    // 软投影
    g.save(); g.shadowColor = 'rgba(20,55,8,.42)'; g.shadowBlur = S * 0.16; g.shadowOffsetY = S * 0.09;
    rr(g, 1, d, S - 2, S, r); g.fillStyle = '#4f8a25'; g.fill(); g.restore();
    // 侧面厚度
    const gd = g.createLinearGradient(0, S * 0.5, 0, S + d);
    gd.addColorStop(0, '#b4dd73'); gd.addColorStop(0.55, '#7db544'); gd.addColorStop(1, '#4f8a25');
    rr(g, 0, d, S, S, r); g.fillStyle = gd; g.fill();
    rr(g, 0, d, S, S, r); g.lineWidth = 1; g.strokeStyle = 'rgba(40,80,15,.5)'; g.stroke();
    drawFace(g, S, r);
    return c;
  };
  const face = (g, S, r, c1, c2, edge) => {
    const gf = g.createLinearGradient(0, 0, S * 0.3, S);
    gf.addColorStop(0, c1); gf.addColorStop(1, c2);
    rr(g, 0, 0, S, S, r); g.fillStyle = gf; g.fill();
    // 左上高光
    g.save(); rr(g, 0, 0, S, S, r); g.clip();
    const hl = g.createRadialGradient(S * 0.22, S * 0.12, 0, S * 0.22, S * 0.12, S * 0.85);
    hl.addColorStop(0, 'rgba(255,255,255,.75)'); hl.addColorStop(0.5, 'rgba(255,255,255,.12)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, S, S);
    // 底部暗边（斜面）
    const bv = g.createLinearGradient(0, S * 0.78, 0, S);
    bv.addColorStop(0, 'rgba(0,0,0,0)'); bv.addColorStop(1, 'rgba(110,90,30,.16)');
    g.fillStyle = bv; g.fillRect(0, 0, S, S);
    g.restore();
    rr(g, 0, 0, S, S, r); g.lineWidth = Math.max(1, S * 0.028); g.strokeStyle = edge; g.stroke();
    rr(g, S * 0.065, S * 0.06, S * 0.87, S * 0.87, r * 0.72);
    g.lineWidth = Math.max(1, S * 0.022); g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
  };
  sprites = ICONS.map((icon) => mk((g, S, r) => {
    face(g, S, r, '#fffef8', '#efe5bd', '#d4c58d');
    g.save();
    g.shadowColor = 'rgba(80,60,10,.28)'; g.shadowBlur = S * 0.05; g.shadowOffsetY = S * 0.035;
    g.fillStyle = '#000';
    g.font = `${Math.round(S * 0.58)}px ${EMOJI_FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(icon, S / 2, S * 0.53);
    g.restore();
  }));
  // 被遮挡版本：降饱和 + 压暗
  dimSprites = sprites.map((src) => {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    if (HAS_FILTER) { g.filter = 'saturate(0.35) brightness(0.58) contrast(0.95)'; g.drawImage(src, 0, 0); }
    else {
      g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(28,36,22,.5)'; g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  });
  backSprite = mk((g, S, r) => {
    face(g, S, r, '#9bdc6a', '#5aa832', '#3f8220');
    g.save(); rr(g, S * 0.1, S * 0.1, S * 0.8, S * 0.8, r * 0.6); g.clip();
    g.globalAlpha = 0.18; g.fillStyle = '#fff';
    for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(i * S * 0.2, 0); g.lineTo(i * S * 0.2 + S * 0.1, 0); g.lineTo(i * S * 0.2 - S * 0.4, S); g.lineTo(i * S * 0.2 - S * 0.5, S); g.fill(); }
    g.restore();
    // 云朵羊徽
    g.globalAlpha = 0.9; g.fillStyle = '#fff';
    [[0.38, 0.47, 0.13], [0.5, 0.4, 0.15], [0.62, 0.47, 0.13], [0.44, 0.57, 0.12], [0.57, 0.57, 0.12]]
      .forEach(([x, y, rr2]) => { g.beginPath(); g.arc(S * x, S * y, S * rr2, 0, 7); g.fill(); });
    g.fillStyle = '#3f6b2a'; g.beginPath(); g.ellipse(S * 0.31, S * 0.5, S * 0.07, S * 0.09, 0, 0, 7); g.fill();
    g.globalAlpha = 1;
  });
}

function buildBg() {
  const [c, g] = newLayer(W, H);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#c4ee8e'); gr.addColorStop(0.4, '#a3de6c'); gr.addColorStop(1, '#73b947');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 顶部光束
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x0 = W * (0.1 + i * 0.22);
    const lg = g.createLinearGradient(0, 0, 0, H * 0.75);
    lg.addColorStop(0, 'rgba(255,255,220,.12)'); lg.addColorStop(1, 'rgba(255,255,220,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + W * 0.08, 0); g.lineTo(x0 - W * 0.12, H * 0.75); g.lineTo(x0 - W * 0.3, H * 0.75); g.fill();
  }
  g.restore();
  // 割草条纹
  g.save(); g.globalAlpha = 0.06; g.fillStyle = '#fff';
  const sw = 46;
  for (let x = -H; x < W + H; x += sw * 2) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + sw, 0); g.lineTo(x + sw - H * 0.45, H); g.lineTo(x - H * 0.45, H); g.closePath(); g.fill();
  }
  g.restore();
  let seed = 7;
  const sr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // 散景光斑
  for (let i = 0; i < 14; i++) {
    const x = sr() * W, y = sr() * H * 0.7, r = 10 + sr() * 30;
    const bg = g.createRadialGradient(x, y, 0, x, y, r);
    bg.addColorStop(0, 'rgba(255,255,230,.16)'); bg.addColorStop(1, 'rgba(255,255,230,0)');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // 草丛
  g.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    const x = sr() * W, y = sr() * H, h = 6 + sr() * 10;
    g.strokeStyle = `rgba(${45 + sr() * 30},${105 + sr() * 35},25,${0.22 + sr() * 0.2})`; g.lineWidth = 2;
    for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(x + k * 3, y); g.quadraticCurveTo(x + k * 4, y - h * 0.6, x + k * 7, y - h); g.stroke(); }
  }
  // 小花
  const FC = ['#ffffff', '#fff3a3', '#ffc2d6', '#d9f1ff', '#ffd6a5'];
  for (let i = 0; i < 40; i++) {
    const x = sr() * W, y = sr() * H, r = 2.2 + sr() * 2.6;
    g.fillStyle = FC[Math.floor(sr() * FC.length)]; g.globalAlpha = 0.8;
    for (let p = 0; p < 5; p++) { const a = p / 5 * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, 7); g.fill(); }
    g.fillStyle = '#ffb12b'; g.beginPath(); g.arc(x, y, r * 0.6, 0, 7); g.fill(); g.globalAlpha = 1;
  }
  // 牌桌（柔和的草地垫）
  if (L.u) {
    const { u, bx, by } = L;
    g.save();
    g.shadowColor = 'rgba(30,70,10,.25)'; g.shadowBlur = 24; g.shadowOffsetY = 6;
    rr(g, bx - 0.6 * u, by - 0.6 * u, 15.2 * u, 17.3 * u, 1.6 * u);
    const mg = g.createLinearGradient(0, by, 0, by + 17 * u);
    mg.addColorStop(0, 'rgba(255,255,255,.22)'); mg.addColorStop(1, 'rgba(255,255,255,.1)');
    g.fillStyle = mg; g.fill();
    g.restore();
    rr(g, bx - 0.6 * u, by - 0.6 * u, 15.2 * u, 17.3 * u, 1.6 * u);
    g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke(); g.setLineDash([]);
  }
  // 暗角
  const vg = g.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.3, W / 2, H * 0.45, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(25,60,8,.32)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  bgCanvas = c;
}

function buildTray() {
  const { tw, th, u, S, pad, d } = L;
  const P = 12;
  const [c, g] = newLayer(tw + P * 2, th + P * 2 + 8);
  g.translate(P, P);
  const r = 0.85 * u;
  g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 14; g.shadowOffsetY = 6;
  rr(g, 0, 6, tw, th, r); g.fillStyle = '#4a2a0e'; g.fill(); g.restore();
  rr(g, 0, 6, tw, th, r); g.fillStyle = '#5b3414'; g.fill();
  const g1 = g.createLinearGradient(0, 0, 0, th);
  g1.addColorStop(0, '#d9995a'); g1.addColorStop(0.5, '#b8773c'); g1.addColorStop(1, '#93582a');
  rr(g, 0, 0, tw, th, r); g.fillStyle = g1; g.fill();
  // 木纹
  g.save(); rr(g, 0, 0, tw, th, r); g.clip();
  let s = 3; const sr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 16; i++) {
    const y0 = sr() * th, amp = 1 + sr() * 3, fq = 0.01 + sr() * 0.03, ph = sr() * 6;
    g.beginPath();
    for (let x = 0; x <= tw; x += 6) g.lineTo(x, y0 + Math.sin(x * fq + ph) * amp);
    g.lineWidth = 1 + sr() * 1.5; g.strokeStyle = `rgba(90,45,10,${0.1 + sr() * 0.15})`; g.stroke();
  }
  g.restore();
  rr(g, 1, 1, tw - 2, th - 2, r); g.lineWidth = 2; g.strokeStyle = 'rgba(255,225,170,.55)'; g.stroke();
  // 钉子
  [[0.45, 0.45], [tw / u - 0.45, 0.45], [0.45, th / u - 0.45], [tw / u - 0.45, th / u - 0.45]].forEach(([x, y]) => {
    const nx = x * u, ny = y * u, nr = Math.max(2.5, u * 0.16);
    const ng = g.createRadialGradient(nx - nr * 0.3, ny - nr * 0.3, 0, nx, ny, nr);
    ng.addColorStop(0, '#fff3d0'); ng.addColorStop(1, '#8a6a3a');
    g.fillStyle = ng; g.beginPath(); g.arc(nx, ny, nr, 0, 7); g.fill();
  });
  // 内槽
  const ix = 0.24 * u, iy = 0.24 * u, iw = tw - 0.48 * u, ih = th - 0.48 * u;
  const g2 = g.createLinearGradient(0, iy, 0, iy + ih);
  g2.addColorStop(0, '#3e220c'); g2.addColorStop(1, '#6d4019');
  rr(g, ix, iy, iw, ih, r * 0.7); g.fillStyle = g2; g.fill();
  g.save(); rr(g, ix, iy, iw, ih, r * 0.7); g.clip();
  g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  rr(g, ix - 20, iy - 20, iw + 40, 20, 0); g.fillStyle = '#000'; g.fill();
  g.restore();
  // 七个格位
  for (let i = 0; i < SLOT_MAX; i++) {
    const cx = pad + i * (S + pad), cy = 0.48 * u;
    rr(g, cx, cy, S, S + d * 0.7, S * 0.18);
    const cg = g.createLinearGradient(0, cy, 0, cy + S);
    cg.addColorStop(0, 'rgba(0,0,0,.28)'); cg.addColorStop(1, 'rgba(255,255,255,.07)');
    g.fillStyle = cg; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(255,220,160,.18)'; g.stroke();
  }
  trayCanvas = c; L.trayPad = P;
}

/* ---------------- 绘制 ---------------- */
function drawTile(t) {
  const { S, m, d } = L;
  let spr = sprites[t.type], dim = dimSprites[t.type];
  let sx = 1, sc = 1, alpha = 1, ox = 0, oy = 0, rot = 0;
  if (t.flip > 0) {
    const p = 1 - t.flip / 0.5;
    sx = Math.max(0.04, Math.abs(Math.cos(clamp(p, 0, 1) * Math.PI)));
    if (p < 0.5) { if (t.flipFromBack) spr = backSprite; else { spr = sprites[t.prevType]; dim = dimSprites[t.prevType]; } }
  }
  const hidden = t.status === 'board' && t.pile && t.covered;
  if (hidden) spr = backSprite;
  if (t.an && t.an.kind === 'fly' && t.an.delay <= 0) {
    const p = clamp(t.an.t / t.an.dur, 0, 1);
    sc = 1 + 0.16 * Math.sin(p * Math.PI);
    rot = Math.sin(p * Math.PI) * 0.12 * (t.an.ex > t.an.sx ? 1 : -1);
  }
  if (t.dying) {
    const k1 = clamp((G.time - (t.dieAt - 0.28)) / 0.16, 0, 1);
    const k2 = clamp((G.time - (t.dieAt - 0.12)) / 0.12, 0, 1);
    if (t.mergeTo && t.mergeTo !== t) { const e = easeInOut(k1); ox = (t.mergeTo.px - t.px) * e; oy = (t.mergeTo.py - t.py) * e; }
    sc = 1 + 0.12 * k1 + 0.35 * k2; alpha = 1 - k2;
  }
  if (t.wiggle > 0) ox += Math.sin(G.time * 70) * 4 * (t.wiggle / 0.3);
  const cx = t.px + S / 2 + ox, cy = t.py + S / 2 + oy;
  const w = S + 2 * m, h = S + d + 2 * m;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sc !== 1) ctx.scale(sx * sc, sc);
  ctx.drawImage(spr, -S / 2 - m, -S / 2 - m, w, h);
  if (!hidden && t.status === 'board' && t.lit < 1 && spr !== backSprite) {
    ctx.globalAlpha = alpha * (1 - t.lit);
    ctx.drawImage(dim, -S / 2 - m, -S / 2 - m, w, h);
  }
  if (t.dying && alpha > 0) {
    const k1 = clamp((G.time - (t.dieAt - 0.28)) / 0.16, 0, 1);
    if (k1 > 0) { ctx.globalAlpha = 0.55 * k1 * alpha; ctx.fillStyle = '#fffbe0'; rr(ctx, -S / 2, -S / 2, S, S, S * 0.18); ctx.fill(); }
  }
  if (t.hint > 0) {
    ctx.globalAlpha = Math.min(1, t.hint / 0.2);
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 14;
    rr(ctx, -S / 2 - 3, -S / 2 - 3, S + 6, S + 6, S * 0.22); ctx.stroke();
  }
  ctx.restore();
}

function drawField() {
  const { u, bx, by } = L;
  ctx.save();
  if (G.cfg && G.cfg.pile) {
    const pw = (G.cfg.pile - 1) * PILE_STEP * u + 2 * u;
    ctx.fillStyle = 'rgba(40,90,20,.2)';
    rr(ctx, bx - 0.25 * u, by + (PILE_Y - 0.25) * u, pw + 0.5 * u, 2.75 * u, 0.6 * u); ctx.fill();
    rr(ctx, bx + 14 * u - pw - 0.25 * u, by + (PILE_Y - 0.25) * u, pw + 0.5 * u, 2.75 * u, 0.6 * u); ctx.fill();
    // 剩余张数角标
    const cntL = G.tiles.filter((t) => t.pile === 'L' && t.status === 'board').length;
    const cntR = G.tiles.filter((t) => t.pile === 'R' && t.status === 'board').length;
    ctx.font = `bold 11px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [[cntL, bx + pw / 2], [cntR, bx + 14 * u - pw / 2]].forEach(([n, x]) => {
      if (!n) return;
      const y = by + (PILE_Y + 2.75) * u + 6;
      rr(ctx, x - 17, y - 8, 34, 16, 8); ctx.fillStyle = 'rgba(30,70,10,.45)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(`×${n}`, x, y + 0.5);
    });
  }
  ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.4)';
  for (let i = 0; i < 3; i++) { rr(ctx, bx + (4 + i * 2) * u + 3, by + TEMP_Y * u + 3, 2 * u - 6, 2 * u - 6, 0.3 * u); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawTray() {
  const { tx, ty, tw, th, u } = L;
  let ox = 0;
  if (G.shake > 0) ox = Math.sin(G.time * 80) * 8 * (G.shake / 0.5);
  ctx.save(); ctx.translate(ox, 0);
  ctx.drawImage(trayCanvas, tx - L.trayPad, ty - L.trayPad, trayCanvas.width / DPR, trayCanvas.height / DPR);
  const live = liveSlot().length;
  if ((live >= 5 && G.state === 'playing') || G.state === 'failing') {
    const a = 0.45 + 0.4 * Math.sin(G.time * (live >= 6 ? 14 : 8));
    ctx.save(); ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 16;
    rr(ctx, tx - 2, ty - 2, tw + 4, th + 4, 0.85 * u + 2);
    ctx.lineWidth = 4; ctx.strokeStyle = `rgba(255,60,50,${a})`; ctx.stroke(); ctx.restore();
  }
  // 卡槽计数
  ctx.font = `bold 11px ${UI_FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = live >= 6 ? '#ffdddd' : 'rgba(255,255,255,.75)';
  ctx.fillText(`${live}/7`, tx + tw - 6, ty - 3);
  ctx.restore();
}

function drawButtons() {
  for (const b of L.buttons) {
    const n = G.props[b.key];
    const on = n > 0 && !G.replay;
    const down = pressed === b.key && G.time - pressT < 0.12 ? 4 : 0;
    const y = b.y + down, r = 18;
    ctx.save();
    if (!on) ctx.globalAlpha = 0.55;
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    rr(ctx, b.x, b.y + 6, b.w, b.h, r); ctx.fillStyle = on ? '#1857a0' : '#666d75'; ctx.fill();
    ctx.shadowColor = 'transparent';
    const g = ctx.createLinearGradient(0, y, 0, y + b.h);
    if (on) { g.addColorStop(0, '#86d3ff'); g.addColorStop(0.5, '#4aa6f5'); g.addColorStop(1, '#2a7fdc'); }
    else { g.addColorStop(0, '#cdd2d8'); g.addColorStop(1, '#98a1aa'); }
    rr(ctx, b.x, y, b.w, b.h, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke();
    rr(ctx, b.x + 5, y + 4, b.w - 10, b.h * 0.4, r - 6); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.font = `22px ${EMOJI_FONT}`;
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.fillText(b.icon, b.x + b.w / 2, y + b.h * 0.37);
    ctx.shadowColor = 'transparent';
    ctx.font = `bold 14px ${UI_FONT}`;
    ctx.lineWidth = 3.5; ctx.strokeStyle = on ? 'rgba(10,60,130,.6)' : 'rgba(60,60,60,.5)';
    ctx.strokeText(b.label, b.x + b.w / 2, y + b.h * 0.76); ctx.fillText(b.label, b.x + b.w / 2, y + b.h * 0.76);
    const bx = b.x + b.w - 7, byy = y + 5;
    ctx.beginPath(); ctx.arc(bx, byy, 11, 0, 7); ctx.fillStyle = n > 0 ? '#ff4d4f' : '#8a8f96'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `bold 12px ${UI_FONT}`; ctx.fillText(String(n), bx, byy + 1);
    ctx.restore();
  }
}

function drawTopBar() {
  const cy = SAFE_TOP + 30;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!G.replay) {
    const p = L.pause;
    ctx.beginPath(); ctx.arc(p.x, p.y + 3, p.r, 0, 7); ctx.fillStyle = 'rgba(40,90,20,.35)'; ctx.fill();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.fill();
    ctx.fillStyle = '#4c8f27';
    rr(ctx, p.x - 7, p.y - 8, 5, 16, 2); ctx.fill(); rr(ctx, p.x + 2, p.y - 8, 5, 16, 2); ctx.fill();
  }
  // 标题丝带（带燕尾）
  const name = G.cfg ? G.cfg.name : '';
  ctx.font = `900 21px ${UI_FONT}`;
  const tw = Math.max(128, ctx.measureText(name).width + 48), th = 38, tx = W / 2 - tw / 2, ty = cy - th / 2 - 4;
  const tail = (dir) => {
    const x0 = dir < 0 ? tx + 10 : tx + tw - 10;
    ctx.beginPath();
    ctx.moveTo(x0, ty + 10); ctx.lineTo(x0 + dir * 30, ty + 12); ctx.lineTo(x0 + dir * 20, ty + 25);
    ctx.lineTo(x0 + dir * 30, ty + th + 6); ctx.lineTo(x0, ty + th + 4); ctx.closePath();
    ctx.fillStyle = '#e07b00'; ctx.fill();
  };
  tail(-1); tail(1);
  ctx.fillStyle = '#b85f00'; rr(ctx, tx, ty + 4, tw, th, 19); ctx.fill();
  const g = ctx.createLinearGradient(0, ty, 0, ty + th); g.addColorStop(0, '#ffe07a'); g.addColorStop(1, '#ff9a1a');
  rr(ctx, tx, ty, tw, th, 19); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
  rr(ctx, tx + 8, ty + 4, tw - 16, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = '#b35f00';
  ctx.strokeText(name, W / 2, ty + th / 2 + 1); ctx.fillStyle = '#fff'; ctx.fillText(name, W / 2, ty + th / 2 + 1);
  if (G.cfg) {
    ctx.font = `bold 11px ${UI_FONT}`;
    const tag = G.cfg.tag, tw2 = ctx.measureText(tag).width + 18;
    rr(ctx, W / 2 - tw2 / 2, ty + th + 5, tw2, 18, 9);
    ctx.fillStyle = G.mode === 'daily' ? '#ff7a1a' : G.level >= 2 ? '#e8463a' : '#3fa34d'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(tag, W / 2, ty + th + 14.5);
  }
  // 剩余 + 进度
  const remain = remainCount();
  const txt = `剩余 ${remain}`;
  ctx.font = `bold 14px ${UI_FONT}`;
  const rw = Math.max(84, ctx.measureText(txt).width + 24), rx = Math.min(W - 14, L.bx + 14 * L.u) - rw;
  rr(ctx, rx, cy - 15, rw, 28, 14); ctx.fillStyle = 'rgba(30,75,12,.4)'; ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(txt, rx + rw / 2, cy - 0.5);
  const prog = G.total ? 1 - remain / G.total : 0;
  const py = cy + 19;
  rr(ctx, rx, py, rw, 7, 3.5); ctx.fillStyle = 'rgba(30,75,12,.35)'; ctx.fill();
  if (prog > 0) {
    const pg = ctx.createLinearGradient(rx, 0, rx + rw, 0); pg.addColorStop(0, '#fff176'); pg.addColorStop(1, '#ffb300');
    rr(ctx, rx, py, Math.max(7, rw * prog), 7, 3.5); ctx.fillStyle = pg; ctx.fill();
  }
  ctx.font = `14px ${EMOJI_FONT}`; ctx.fillText('🐑', rx + clamp(rw * prog, 7, rw - 7), py + 3 + Math.sin(G.time * 10) * (prog > 0 ? 1.2 : 0));
  // 关卡码
  if (G.code) {
    ctx.font = `bold 10px ${UI_FONT}`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'left';
    ctx.fillText(`#${G.code}`, L.pause.x - L.pause.r, cy + 34);
  }
  ctx.restore();
}

function drawBanner() {
  if (G.banner <= 0 || !G.cfg) return;
  const t = 2.2 - G.banner;
  const inK = clamp(t / 0.45, 0, 1), outK = clamp(G.banner / 0.4, 0, 1);
  const s = easeOutBack(inK);
  ctx.save();
  ctx.globalAlpha = outK;
  ctx.translate(W / 2, H * 0.42); ctx.scale(s, s);
  const bw = Math.min(W * 0.84, 340);
  ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 20;
  ctx.fillStyle = 'rgba(30,50,20,.62)'; rr(ctx, -bw / 2, -56, bw, 112, 28); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 40px ${UI_FONT}`; ctx.lineWidth = 7; ctx.strokeStyle = '#3d7a1c';
  ctx.strokeText(G.cfg.name, 0, -14); ctx.fillStyle = '#fff'; ctx.fillText(G.cfg.name, 0, -14);
  ctx.font = `bold 15px ${UI_FONT}`; ctx.fillStyle = G.level >= 2 ? '#ffd0c8' : '#e6ffd0';
  ctx.fillText(G.level >= 2 ? `${G.cfg.tag} · ${G.total} 张牌 · ${G.cfg.types} 种图案` : '三张相同即可消除，卡槽满 7 张就失败', 0, 28);
  ctx.restore();
}

/* ---- 粒子 / 飘字 / 彩带 / 环境 ---- */
const PC = ['#ffd54a', '#ff7eb3', '#7fe0ff', '#ffffff', '#a8ff6b', '#ffa94d'];
function burst(x, y) {
  for (let i = 0; i < 22; i++) {
    const a = fr() * Math.PI * 2, v = 120 + fr() * 300;
    G.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, age: 0, life: 0.6 + fr() * 0.4,
      size: 4 + fr() * 6, color: fpick(PC), star: fr() < 0.6, rot: fr() * 6, vr: (fr() - 0.5) * 12 });
  }
  G.particles.push({ ring: true, x, y, age: 0, life: 0.45 });
  G.particles.push({ flash: true, x, y, age: 0, life: 0.25 });
}
function floater(x, y, text, color, size) {
  // 只保留最新的一条，避免快速连消时文字叠在一起
  G.floaters = G.floaters.filter((f) => f.age > 0.45 || Math.abs(f.x - x) > 120);
  G.floaters.push({ x, y, text, color, size, age: 0, life: 0.95 });
}
function spawnConfetti() {
  const C = ['#ff5a5f', '#ffd23f', '#3ec1ff', '#7be07b', '#ff8ad8', '#b18cff', '#ffffff'];
  for (let i = 0; i < 140; i++) {
    G.confetti.push({ x: fr() * W, y: -20 - fr() * H * 0.6, vx: (fr() - 0.5) * 80, vy: 120 + fr() * 160,
      rot: fr() * 6, vr: (fr() - 0.5) * 10, w: 6 + fr() * 6, h: 3 + fr() * 4, color: fpick(C), ph: fr() * 6, age: 0 });
  }
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
      ctx.beginPath(); ctx.arc(p.x, p.y, L.S * (0.4 + k * 1.0), 0, 7);
      ctx.lineWidth = 6 * (1 - k); ctx.strokeStyle = '#fff7b0'; ctx.stroke();
    } else if (p.flash) {
      const r = L.S * (0.6 + k * 0.8);
      const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, 'rgba(255,255,230,.9)'); gr.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      if (p.star) drawStar(p.x, p.y, p.size, p.rot);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, 7); ctx.fill(); }
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of G.floaters) {
    const k = f.age / f.life;
    const s = k < 0.2 ? easeOutBack(k / 0.2) : 1;
    ctx.save(); ctx.globalAlpha = 1 - Math.max(0, (k - 0.6) / 0.4);
    ctx.translate(f.x, f.y - k * 46); ctx.scale(s, s);
    ctx.font = `900 ${f.size}px ${UI_FONT}`; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(120,60,0,.85)';
    ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
    ctx.restore();
  }
  for (const c of G.confetti) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(Math.cos(c.ph + c.age * 8), 1);
    ctx.fillStyle = c.color; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
  }
}

const AMB = { seeds: [], flies: [] };
function initAmbient() {
  AMB.seeds = []; AMB.flies = [];
  for (let i = 0; i < 12; i++) AMB.seeds.push({ x: fr() * W, y: fr() * H, vx: 8 + fr() * 14, vy: -4 - fr() * 8, r: 1.5 + fr() * 2.2, ph: fr() * 6 });
  const FC = [['#ffb3d1', '#ff7eb3'], ['#bfe6ff', '#6cc4ff'], ['#fff2a8', '#ffcf3f']];
  for (let i = 0; i < 2; i++) AMB.flies.push({ x: fr() * W, y: H * (0.2 + fr() * 0.6), ph: fr() * 6, sp: 18 + fr() * 16, dir: fr() < 0.5 ? 1 : -1, c: FC[i % 3] });
}
function updateAmbient(dt) {
  for (const s of AMB.seeds) {
    s.ph += dt; s.x += (s.vx + Math.sin(s.ph * 1.3) * 10) * dt; s.y += (s.vy + Math.cos(s.ph) * 6) * dt;
    if (s.x > W + 10) s.x = -10; if (s.y < -10) s.y = H + 10;
  }
  for (const f of AMB.flies) {
    f.ph += dt; f.x += f.dir * f.sp * dt; f.y += Math.sin(f.ph * 1.7) * 18 * dt;
    if (f.x > W + 30) { f.x = -30; f.y = H * (0.15 + fr() * 0.7); } if (f.x < -30) { f.x = W + 30; f.y = H * (0.15 + fr() * 0.7); }
  }
}
function drawAmbient() {
  ctx.save();
  for (const s of AMB.seeds) {
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(s.ph * 2);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.8;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + s.ph * 0.3; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(a) * s.r * 2.6, s.y + Math.sin(a) * s.r * 2.6); ctx.stroke(); }
  }
  ctx.globalAlpha = 0.9;
  for (const f of AMB.flies) {
    const flap = Math.abs(Math.sin(f.ph * 14));
    ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.dir, 1);
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.scale(1, sgn * (0.25 + 0.75 * flap));
      ctx.fillStyle = f.c[0]; ctx.beginPath(); ctx.ellipse(-2, -6, 6, 6, -0.4, 0, 7); ctx.fill();
      ctx.fillStyle = f.c[1]; ctx.beginPath(); ctx.ellipse(-5, -3, 3.5, 3.5, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#5a3d1e'; ctx.beginPath(); ctx.ellipse(0, 0, 4.5, 1.6, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawDanger() {
  const live = liveSlot().length;
  if (!(live >= 6 && G.state === 'playing') && G.state !== 'failing') return;
  const a = (G.state === 'failing' ? 0.5 : 0.28) * (0.6 + 0.4 * Math.sin(G.time * 9));
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(220,20,20,${a})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/* ---------------- 主循环 ---------------- */
const easeDrop = (t) => { const c1 = 1.1, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };

function startAnim(t) {
  const dist = Math.hypot(t.tx - t.px, t.ty - t.py);
  if (dist < 0.5) { t.px = t.tx; t.py = t.ty; t.an = null; return; }
  const fly = dist > L.S * 1.2;
  t.an = { sx: t.px, sy: t.py, ex: t.tx, ey: t.ty, t: 0, delay: 0,
    kind: fly ? 'fly' : 'slide', dur: fly ? clamp(0.22 + dist / 2200, 0.24, 0.42) : 0.16, arc: fly ? Math.min(90, dist * 0.28) : 0 };
}
function stepAnim(t, dt) {
  const a = t.an;
  if (a.ex !== t.tx || a.ey !== t.ty) { startAnim(t); if (!t.an) return; }
  const an = t.an;
  if (an.delay > 0) { an.delay -= dt; t.px = an.sx; t.py = an.sy; return; }
  an.t += dt;
  const p = clamp(an.t / an.dur, 0, 1);
  const e = an.kind === 'drop' ? easeDrop(p) : an.kind === 'fly' ? easeInOut(p) : easeOutCubic(p);
  t.px = lerp(an.sx, an.ex, e);
  t.py = lerp(an.sy, an.ey, e) - an.arc * Math.sin(p * Math.PI);
  if (p >= 1) { t.px = an.ex; t.py = an.ey; t.an = null; }
}

let flying = [];
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0, W, H);
  drawAmbient();
  if (!G.cfg) return;
  let sh = 0;
  if (G.shake > 0) sh = Math.sin(G.time * 90) * 5 * (G.shake / 0.5);
  ctx.save(); ctx.translate(sh, 0);
  drawField();
  flying = [];
  for (const t of drawOrder) {
    if (t.status !== 'board') continue;
    if (t.an && t.an.kind === 'fly') flying.push(t); else drawTile(t);
  }
  drawTray();
  for (const t of G.slot) { if (t.an && t.an.kind === 'fly') flying.push(t); else drawTile(t); }
  for (const t of flying) drawTile(t);
  ctx.restore();
  drawButtons();
  drawParticles();
  drawTopBar();
  drawDanger();
  drawBanner();
}

function update(dt) {
  G.time += dt;
  updateAmbient(dt);
  if (!G.cfg) return;
  updateReplay(dt);
  for (const t of G.slot.slice()) if (t.dying && G.time >= t.dieAt) killTile(t);
  for (const t of G.tiles) {
    if (t.status === 'gone') continue;
    target(t);
    if (t.wiggle > 0) t.wiggle = Math.max(0, t.wiggle - dt);
    if (t.flip > 0) t.flip = Math.max(0, t.flip - dt);
    if (t.hint > 0) t.hint = Math.max(0, t.hint - dt);
    if (t.status === 'board') {
      const want = t.covered ? 0 : 1;
      t.lit += (want - t.lit) * Math.min(1, dt * 7);
      if (t.pile) {
        if (t.prevCovered && !t.covered) { t.flip = 0.5; t.flipFromBack = true; }
        t.prevCovered = t.covered;
      }
    } else t.lit = 1;
    if (t.an) stepAnim(t, dt);
    else if (t.px !== t.tx || t.py !== t.ty) startAnim(t);
  }
  for (const p of G.particles) {
    p.age += dt;
    if (!p.ring && !p.flash) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.vx *= 0.985; }
  }
  G.particles = G.particles.filter((p) => p.age < p.life);
  for (const f of G.floaters) f.age += dt;
  G.floaters = G.floaters.filter((f) => f.age < f.life);
  for (const c of G.confetti) { c.age += dt; c.x += (c.vx + Math.sin(c.age * 3 + c.ph) * 40) * dt; c.y += c.vy * dt; c.rot += c.vr * dt; }
  G.confetti = G.confetti.filter((c) => c.y < H + 30);
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
  if (G.banner > 0) G.banner = Math.max(0, G.banner - dt);
}

let lastT = performance.now();
let paused = false;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (!paused && UI.canvasActive()) { update(dt); render(); }
  requestAnimationFrame(frame);
}

/* ---------------- 输入 ---------------- */
let pressed = null, pressT = 0;
canvas.addEventListener('pointerdown', (e) => {
  Sound.init();
  if (G.state !== 'playing' || G.replay) return;
  const x = e.clientX, y = e.clientY;
  const p = L.pause;
  if (Math.hypot(x - p.x, y - p.y) < p.r + 12) { UI.showPause(); return; }
  for (const b of L.buttons) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h + 6) {
      pressed = b.key; pressT = G.time;
      if (b.key === 'out') useOut(false);
      else if (b.key === 'undo') useUndo();
      else useShuffle();
      return;
    }
  }
  if (G.banner > 0.4) G.banner = 0.4;
  onTapBoard(x, y);
});
window.addEventListener('resize', () => { layout(); initAmbient(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
