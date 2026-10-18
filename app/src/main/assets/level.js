/* 关卡生成：无尽难度曲线、种子化、逆向构造保证有解，并记录一条通关路线（用于“看看正解”回放） */
'use strict';

// 坐标单位：半张牌宽。一张牌占 2×2 单位。棋盘 x∈[0,12]、y∈[0,14]。
const PILE_Y = 16.7, TEMP_Y = 19.3, PILE_STEP = 0.3;
const MAX_TYPES = (typeof ICON_COUNT !== 'undefined') ? ICON_COUNT : 25;

/* ---------------- 无尽难度曲线 ----------------
 * 1~10 关：每关大幅跃升（牌数、图案种类、层数、盲牌堆、牌面盲牌、交错窗口、深挖倾向全部加码）
 * 11 关起：每关小幅递增，逐步逼近上限
 * 参数含义：
 *   layers  棋盘层数          density 每层铺牌密度
 *   pile    左右盲牌堆各多少张  types   图案种类
 *   hold    正解路线里卡槽最多悬空的张数（1=顺序成组 … 5=极限交错）
 *   spread  卡槽未满时开新图案的概率（越大三连在顺序里拉得越开）
 *   deep    正解偏向“刚翻出的深层牌”的概率（越大越需要往深处挖）
 *   blind   棋盘牌被压住时背面朝上的比例（看不到下面是什么）
 */
const CURVE = [
  null,
  { fixed: true, types: 3, hold: 1, spread: 0, deep: 0, blind: 0 },                                   // 1 教学
  { layers: 3, density: 0.50, pile: 0, types: 7, hold: 2, spread: 0.6, deep: 0.15, blind: 0 },          // 2
  { layers: 4, density: 0.50, pile: 3, types: 9, hold: 3, spread: 0.55, deep: 0.25, blind: 0 },          // 3
  { layers: 5, density: 0.50, pile: 4, types: 10, hold: 3, spread: 0.55, deep: 0.3, blind: 0.05 },     // 4
  { layers: 6, density: 0.52, pile: 6, types: 11, hold: 4, spread: 0.55, deep: 0.4, blind: 0.10 },     // 5
  { layers: 7, density: 0.54, pile: 7, types: 12, hold: 4, spread: 0.7, deep: 0.5, blind: 0.15 },      // 6
  { layers: 8, density: 0.55, pile: 8, types: 13, hold: 5, spread: 0.7, deep: 0.6, blind: 0.20 },      // 7
  { layers: 9, density: 0.56, pile: 9, types: 14, hold: 5, spread: 0.8, deep: 0.7, blind: 0.25 },      // 8
  { layers: 10, density: 0.57, pile: 10, types: 15, hold: 5, spread: 0.88, deep: 0.8, blind: 0.30 },   // 9
  { layers: 11, density: 0.58, pile: 11, types: 16, hold: 5, spread: 0.94, deep: 0.88, blind: 0.35 },  // 10
];

function curveParams(n) {
  if (n <= 10) return Object.assign({ anti: clamp((n - 3) / 7, 0, 1) }, CURVE[Math.max(1, n)]);
  const k = n - 10; // 小幅递增：每关只动一点点，逐步逼近上限
  return {
    layers: Math.min(11 + Math.floor(k / 5), 18),
    density: Math.min(0.58 + k * 0.002, 0.66),
    pile: Math.min(11 + Math.floor(k / 3), 20),
    types: Math.min(16 + Math.floor(k / 4), MAX_TYPES),
    hold: 5, anti: 1,
    spread: Math.min(0.94 + k * 0.002, 1),
    deep: Math.min(0.88 + k * 0.003, 0.98),
    blind: Math.min(0.35 + k * 0.006, 0.65),
  };
}

const DAILY_LEVEL = 10;
function levelConfig(n, mode) {
  if (mode === 'daily') {
    return Object.assign(curveParams(DAILY_LEVEL), { n: DAILY_LEVEL, mode, name: '今日挑战', daily: true });
  }
  n = Math.max(1, n | 0);
  return Object.assign(curveParams(n), { n, name: `第 ${n} 关` });
}

/* ---------------- 难度量化 ----------------
 * 由 tools/calibrate.js 离线让两种 AI（“高手”会算翻牌收益、“大众”只看眼前）各打 60 局/关，
 * raw = 1 − 0.2×高手通关率 − 0.2×高手清牌比例 − 0.3×大众通关率 − 0.3×大众清牌比例，
 * 保序回归后映射为难度指数 = 100 × (1 − (1 − raw)^1.8)。40 关以后按渐近曲线外推（上限 99.9）。
 */
const DIFF_TAU = 15.0;  // 10 关后渐近曲线时间常数
const DIFF_TABLE = [0, 1.8, 6.8, 12.7, 17.7, 30.7, 35.7, 46.1, 53.5, 60.3, 68.7, 70.7, 72.6, 74.4, 76.0, 77.5, 79.0, 80.3, 81.6, 82.8, 83.9, 84.9, 85.9, 86.8, 87.6, 88.4, 89.2, 89.9, 90.5, 91.1, 91.7, 92.2, 92.7, 93.2, 93.6, 94.0, 94.4, 94.7, 95.1, 95.4, 95.7];  // tools/fit_diff.py 生成
const PASS_TABLE = [0, 100, 100, 100, 100, 95.85, 95.85, 88.3, 81.7, 75, 66.7, 63.867, 63.867, 63.867, 52.5, 52.5, 45, 43.3, 38.3, 36.7, 33.35, 33.35, 26.65, 26.65, 21.7, 21.7, 12.5, 12.5, 7.5, 7.5, 4.15, 4.15, 3.3, 3.3, 1.7, 0.85, 0.85, 0.609, 0.436, 0.313, 0.224];  // AI 高手通关率 %
const CASUAL_TABLE = [0, 100, 95, 81.7, 81.7, 53.3, 43.3, 25, 13.3, 11.7, 3.3, 2.5, 2.5, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.2436, 0.1746, 0.1251, 0.0896, 0.0642, 0.046, 0.033, 0.0236, 0.0169, 0.0121, 0.0087, 0.0062, 0.0045, 0.0032, 0.0023, 0.0016, 0.0012, 0.0008];  // AI 大众通关率 %
const TILES_TABLE = [0, 27, 39, 60, 105, 138, 213, 264, 279, 312, 348, 354, 351, 375, 357, 396, 402, 393, 396, 405, 438, 441, 426, 447, 435, 492, 474, 489, 492, 501, 528, 516, 531, 525, 531, 552, 570, 576, 588, 597, 612];  // 每关牌数（种子 = 关卡号）
const TIERS = [
  { min: 0, name: '入门', color: '#5cc96b', stars: 1 },
  { min: 10, name: '简单', color: '#3fb7a6', stars: 1.5 },
  { min: 25, name: '普通', color: '#3e9bea', stars: 2 },
  { min: 40, name: '困难', color: '#6f7cf2', stars: 2.5 },
  { min: 55, name: '噩梦', color: '#a35fe6', stars: 3 },
  { min: 68, name: '地狱', color: '#e2549a', stars: 3.5 },
  { min: 80, name: '炼狱', color: '#f0573c', stars: 4 },
  { min: 90, name: '深渊', color: '#c23a24', stars: 4.5 },
  { min: 96, name: '混沌', color: '#2b2140', stars: 5 },
]
function difficultyOf(n, mode) {
  if (mode === 'daily') n = DAILY_LEVEL;
  n = Math.max(1, n | 0);
  const last = DIFF_TABLE.length - 1;
  let score;
  if (n <= last) score = DIFF_TABLE[n];
  else {
    // 之后每关小幅递增，渐近 99.9
    const base = DIFF_TABLE[10];
    score = base + (99.9 - base) * (1 - Math.exp(-(n - 10) / DIFF_TAU));
  }
  const tail = (tb) => tb[tb.length - 1] * Math.exp(-(n - tb.length + 1) / 4);
  const pass = n < PASS_TABLE.length ? PASS_TABLE[n] : tail(PASS_TABLE);
  const casual = n < CASUAL_TABLE.length ? CASUAL_TABLE[n] : tail(CASUAL_TABLE);
  let tier = TIERS[0], ti = 0;
  TIERS.forEach((t, i) => { if (score >= t.min) { tier = t; ti = i; } });
  const prev = n > 1 ? difficultyScore(n - 1) : 0;
  return { n, score: Math.round(score * 10) / 10, tier, tierIdx: ti, pass, casual, delta: Math.round((score - prev) * 10) / 10 };
}
function difficultyScore(n) {
  const last = DIFF_TABLE.length - 1;
  if (n <= last) return DIFF_TABLE[Math.max(0, n)];
  const base = DIFF_TABLE[10];
  return base + (99.9 - base) * (1 - Math.exp(-(n - 10) / DIFF_TAU));
}
// 预计牌数：校准表里有就用，否则按参数估算
function tilesOf(n) {
  if (n < TILES_TABLE.length) return TILES_TABLE[n];
  const c = curveParams(n);
  return Math.round((c.layers * 49 * c.density + c.pile * 2) / 3) * 3;
}
function starHTML(stars) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += stars >= i ? '★' : (stars >= i - 0.5 ? '<span class="half">★</span>' : '<span class="off">★</span>');
  return h;
}
function passStr(p) {
  if (p >= 10) return Math.round(p) + '%';
  if (p >= 1) return p.toFixed(1) + '%';
  if (p >= 0.01) return p.toFixed(2) + '%';
  return '<0.01%';
}

/* ---------------- 布局 ---------------- */
const SHAPES = [
  () => 0.5,
  (cx, cy) => 1 - (Math.abs(cx) + Math.abs(cy)) * 0.75,
  (cx, cy) => 1 - Math.max(Math.abs(cx), Math.abs(cy)),
  (cx, cy) => Math.abs(Math.max(Math.abs(cx), Math.abs(cy)) - 0.75) < 0.26 ? 1 : 0,
  (cx, cy) => (Math.abs(cx) < 0.3 || Math.abs(cy) < 0.25) ? 1 : 0.1,
  (cx) => Math.abs(cx) > 0.45 ? 1 : 0.15,
  (cx, cy) => (Math.abs(cy) > 0.5) ? 0.95 : 0.2,
  (cx, cy) => 1 - Math.hypot(cx, cy) * 0.8,                                     // 圆
  (cx, cy) => (Math.abs(cx) + Math.abs(cy) > 0.7) ? 1 : 0.15,                   // 菱形环
  (cx, cy) => ((Math.round(cx * 3) + Math.round(cy * 3)) % 2 === 0) ? 0.9 : 0.1, // 棋盘格
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
  // 低层数时只铺中间区域，让前几关更紧凑
  const spanX = cfg.layers <= 4 ? 0.72 : cfg.layers <= 6 ? 0.88 : 1;
  for (let Lr = 0; Lr < cfg.layers; Lr++) {
    const [ox, oy] = Lr % 2 === 0 ? [0, 0] : ODD[ri(3)];
    const cols = ox ? 6 : 7, rows = oy ? 7 : 8;
    const shape = SHAPES[ri(SHAPES.length)];
    const half = Math.ceil(cols / 2);
    const cells = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < half; i++) {
        const cx = (i - (cols - 1) / 2) / (cols / 2), cy = (j - (rows - 1) / 2) / (rows / 2);
        if (Math.abs(cx) > spanX + 0.01 || Math.abs(cy) > spanX + 0.08) continue;
        cells.push({ i, j, score: shape(cx, cy) + rand() * 0.7, w: (i === cols - 1 - i) ? 1 : 2 });
      }
    }
    cells.sort((a, b) => b.score - a.score);
    const want = Math.round(cols * rows * cfg.density * spanX * spanX * (0.85 + rand() * 0.3));
    let got = 0;
    for (const c of cells) {
      if (got >= want) break;
      const xs = c.w === 1 ? [c.i] : [c.i, cols - 1 - c.i];
      for (const i of xs) pos.push({ x: ox + i * 2, y: oy + c.j * 2, layer: Lr });
      got += c.w;
    }
  }
  for (let p = 0; p < (cfg.pile || 0); p++) {
    pos.push({ x: p * PILE_STEP, y: PILE_Y, layer: p, pile: 'L' });
    pos.push({ x: 12 - p * PILE_STEP, y: PILE_Y, layer: p, pile: 'R' });
  }
  while (pos.length % 3) {
    let top = -1; pos.forEach((p) => { if (!p.pile && p.layer > top) top = p.layer; });
    const idx = pos.map((p, i) => (!p.pile && p.layer === top) ? i : -1).filter((i) => i >= 0);
    pos.splice(idx[ri(idx.length)], 1);
  }
  return pos;
}

const overlap = (a, b) => Math.abs(a.x - b.x) < 1.98 && Math.abs(a.y - b.y) < 1.98;

// 逆向构造：随机模拟一条合法拆牌顺序，再在每 window 组三连的窗口里打乱分配图案。
// 按该顺序拿牌，卡槽最多同时 7 张且第 7 张必定凑成三连 → 一定有解。返回该顺序（tile 下标）。
function assignTypes(tiles, cfg) {
  const n = tiles.length;
  const below = tiles.map(() => []);
  const cnt = new Array(n).fill(0);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a !== b && tiles[b].layer > tiles[a].layer && overlap(tiles[a], tiles[b])) { below[b].push(a); cnt[a]++; }
  }
  const free = [];
  const initCovered = cnt.map((c) => c > 0);
  for (let i = 0; i < n; i++) if (!cnt[i]) free.push(i);
  const order = [];
  const freeAt = new Array(n).fill(0);
  while (free.length) {
    const k = rand() < (cfg.deep || 0) ? free.length - 1 : ri(free.length);
    const t = free.splice(k, 1)[0];
    order.push(t);
    for (const a of below[t]) if (--cnt[a] === 0) { free.push(a); freeAt[a] = order.length; }
  }
  cfg._freeAt = freeAt;
  assignAlongOrder(tiles, order, cfg);
  // 牌面盲牌：一部分初始被压住的棋盘牌背面朝上
  if (cfg.blind > 0) {
    for (let i = 0; i < n; i++) {
      const t = tiles[i];
      if (!t.pile && initCovered[i] && rand() < cfg.blind) t.blind = true;
    }
  }
  return order;
}

// 沿正解顺序分配图案。hold = 正解路线里卡槽最多“悬而未决”的张数（≤5，保证第 7 张前必能消除），
// spread = 卡槽未满 hold 时“开新图案”的概率。两者越大，同一组三连在顺序里拉得越开，越难凑。
function assignAlongOrder(tiles, order, cfg) {
  const freeAt = cfg._freeAt;
  tiles.forEach((t) => { t.type = -1; });
  const T = Math.min(cfg.types, MAX_TYPES);
  const used = new Array(T).fill(0);
  const hold = Math.min(5, cfg.hold || 2), spread = cfg.spread || 0;
  let open = []; // [{ty, c}]
  let live = 0;
  const n = order.length;
  for (let pos = 0; pos < n; pos++) {
    const left = n - pos; // 含当前
    const need = open.reduce((a, o) => a + 3 - o.c, 0);
    let o = null;
    const canOpen = live < hold && left - 3 >= need; // 新开一组还剩足够位置收尾
    if (open.length && (!canOpen || rand() >= spread)) {
      // 优先收尾最老 / 已有两张的组
      const twos = open.filter((x) => x.c === 2);
      if (live >= hold && twos.length) o = twos[0];
      else o = rand() < 0.65 ? open[0] : open[ri(open.length)];
    }
    if (!o) {
      // 选“当前同时露在外面的牌里最少见”的图案，避免玩家靠巧合凑出三连
      const me = order[pos], fa = freeAt ? freeAt[me] : 0;
      const conf = new Array(T).fill(0);
      if (cfg.anti) {
        for (let q = 0; q < pos; q++) { const tq = order[q]; if (q >= fa && tiles[tq].type >= 0) conf[tiles[tq].type]++; }
        for (const x of open) conf[x.ty] += 99;
      }
      let best = Infinity; const cand = [];
      for (let i = 0; i < T; i++) {
        if (open.some((x) => x.ty === i)) continue;
        const sc = conf[i] * (cfg.anti || 0) * 10 + used[i] + rand() * 0.5;
        if (sc < best - 1e-9) { best = sc; cand.length = 0; cand.push(i); }
      }
      const ty = cand.length ? cand[0] : ri(T);
      used[ty]++;
      o = { ty, c: 0 }; open.push(o);
    }
    o.c++; live++;
    tiles[order[pos]].type = o.ty;
    if (o.c === 3) { open = open.filter((x) => x !== o); live -= 3; }
  }
}

let tileId = 0;
function generate(cfg, seed) {
  const prev = rand;
  rand = mulberry32(seed);
  try {
    const pos = genLayout(cfg);
    const tiles = pos.map((p) => ({
      id: ++tileId, x: p.x, y: p.y, layer: p.layer, pile: p.pile || null, type: 0, blind: false,
      status: 'board', covered: false, lit: 1,
      px: 0, py: 0, tx: 0, ty: 0, an: null, delay: 0,
      dying: false, dieAt: 0, wiggle: 0, flip: 0, prevType: 0, rot: 0,
    }));
    const order = assignTypes(tiles, cfg);
    return { tiles, solution: order.map((i) => tiles[i]) };
  } finally {
    rand = prev;
  }
}
