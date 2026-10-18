/* 关卡生成：种子化、逆向构造保证有解，并记录一条通关路线（用于“看看正解”回放） */
'use strict';

// 坐标单位：半张牌宽。一张牌占 2×2 单位。棋盘 x∈[0,12]、y∈[0,14]。
const ICONS = ['🥕', '🌽', '🥬', '🔔', '✂️', '🧤', '🔥', '🌾', '🍄', '🌰', '🥛', '🧶', '🌻', '🥚', '🧺', '🍀', '🍓', '🍇', '🌸', '🍑'];
const PILE_Y = 16.7, TEMP_Y = 19.3, PILE_STEP = 0.3;

function levelConfig(n, mode) {
  if (mode === 'daily') {
    return { n: 2, mode, name: '今日挑战', tag: todayLabel() + ' · 全服同局', layers: 9, density: 0.56, pile: 10, types: 16, window: 3, deep: 0.55 };
  }
  if (n === 1) return { n, name: '第 1 关', tag: '新手教学', fixed: true, types: 3, window: 1, deep: 0 };
  if (n === 2) return { n, name: '第 2 关', tag: '地狱难度', layers: 9, density: 0.56, pile: 10, types: 16, window: 3, deep: 0.55 };
  const k = n - 2;
  return {
    n, name: `第 ${n} 关`, tag: '地狱难度+', layers: Math.min(9 + k, 13), density: Math.min(0.56 + k * 0.012, 0.64),
    pile: Math.min(10 + k, 15), types: Math.min(16 + k, ICONS.length), window: 3, deep: Math.min(0.55 + k * 0.03, 0.75),
  };
}

const SHAPES = [
  () => 0.5,
  (cx, cy) => 1 - (Math.abs(cx) + Math.abs(cy)) * 0.75,
  (cx, cy) => 1 - Math.max(Math.abs(cx), Math.abs(cy)),
  (cx, cy) => Math.abs(Math.max(Math.abs(cx), Math.abs(cy)) - 0.75) < 0.26 ? 1 : 0,
  (cx, cy) => (Math.abs(cx) < 0.3 || Math.abs(cy) < 0.25) ? 1 : 0.1,
  (cx) => Math.abs(cx) > 0.45 ? 1 : 0.15,
  (cx, cy) => (Math.abs(cy) > 0.5) ? 0.95 : 0.2,
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
  for (let Lr = 0; Lr < cfg.layers; Lr++) {
    const [ox, oy] = Lr % 2 === 0 ? [0, 0] : ODD[ri(3)];
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
      for (const i of xs) pos.push({ x: ox + i * 2, y: oy + c.j * 2, layer: Lr });
      got += c.w;
    }
  }
  for (let p = 0; p < cfg.pile; p++) {
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
  for (let i = 0; i < n; i++) if (!cnt[i]) free.push(i);
  const order = [];
  while (free.length) {
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
  return order;
}

let tileId = 0;
function generate(cfg, seed) {
  const prev = rand;
  rand = mulberry32(seed);
  try {
    const pos = genLayout(cfg);
    const tiles = pos.map((p) => ({
      id: ++tileId, x: p.x, y: p.y, layer: p.layer, pile: p.pile || null, type: 0,
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
