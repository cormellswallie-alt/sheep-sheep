// 离线难度校准：node tools/calibrate.js [maxLevel] [runs]
// 用一个带启发式的 AI（会用 1 次「移出」）在每关跑 N 局，统计通关率与平均清牌比例，换算难度指数。
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const A = path.join(__dirname, '../app/src/main/assets/');
const stub = `var window = {}; var document = { querySelector(){return null}, querySelectorAll(){return []} };
var localStorage = { getItem(){return null}, setItem(){} }; var navigator = {}; var ICON_COUNT = 24;`;
const code = stub + fs.readFileSync(A + 'core.js', 'utf8') + '\n' + fs.readFileSync(A + 'level.js', 'utf8') +
  '\n;globalThis.__api = { levelConfig, generate, overlap, TEMP_Y };';
const ctx = vm.createContext({ console, Math, JSON, Date });
vm.runInContext(code, ctx);
const { levelConfig, generate, overlap, TEMP_Y } = ctx.__api;

function play(level, seed, expert) {
  const cfg = levelConfig(level);
  const { tiles } = generate(cfg, seed);
  const n = tiles.length;
  const on = new Array(n).fill(true);
  const above = tiles.map(() => []);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++)
    if (a !== b && tiles[b].layer > tiles[a].layer && overlap(tiles[a], tiles[b])) above[a].push(b);
  const isFree = (i) => on[i] && above[i].every((b) => !on[b]);
  const slot = [];
  let removed = 0, outLeft = 1, temp = [];
  const reveals = (i) => { // 拿走 i 后会新露出多少张
    let c = 0;
    for (let a = 0; a < n; a++) if (on[a] && a !== i && above[a].includes(i) && above[a].every((b) => b === i || !on[b])) c++;
    return c;
  };
  for (let guard = 0; guard < 5000; guard++) {
    if (!on.some(Boolean) && !temp.length && !slot.length) return { win: true, p: 1 };
    const free = [];
    for (let i = 0; i < n; i++) if (isFree(i)) free.push({ i, ty: tiles[i].type, blind: tiles[i].blind && false });
    temp.forEach((ty, k) => free.push({ temp: k, ty }));
    if (!free.length) return { win: false, p: removed / n };
    const sc = {}; slot.forEach((t) => { sc[t] = (sc[t] || 0) + 1; });
    const fc = {}; free.forEach((f) => { fc[f.ty] = (fc[f.ty] || 0) + 1; });
    let best = null, bs = -1e9;
    for (const f of free) {
      const s = sc[f.ty] || 0;
      let v = 0;
      if (s === 2) v = 1000;
      else if (s === 1 && fc[f.ty] >= 2) v = 500;
      else if (s === 0 && fc[f.ty] >= 3) v = 300;
      else if (s === 1) v = 120 - slot.length * 15;
      else v = 40 - slot.length * 25;
      if (expert && f.temp === undefined) v += reveals(f.i) * 18;
      v += Math.random() * 4;
      if (v > bs) { bs = v; best = f; }
    }
    // 危险：卡槽已 5 张且没有能直接凑成三连的，先用掉「移出」
    if (bs < 500 && slot.length >= 5 && outLeft > 0) {
      outLeft--; temp = temp.concat(slot.splice(0, 3)); continue;
    }
    if (best.temp !== undefined) temp.splice(best.temp, 1); else on[best.i] = false;
    // 同类靠拢插入
    slot.push(best.ty);
    if (slot.filter((t) => t === best.ty).length === 3) {
      for (let k = 0; k < 3; k++) slot.splice(slot.indexOf(best.ty), 1);
      removed += 3;
    }
    if (slot.length >= 7) return { win: false, p: removed / n };
  }
  return { win: false, p: removed / n };
}

const maxL = parseInt(process.argv[2] || '30', 10), runs = parseInt(process.argv[3] || '120', 10);
const rows = [];
for (let lv = 1; lv <= maxL; lv++) {
  const cfg = levelConfig(lv);
  const nt = generate(cfg, lv).tiles.length;
  const st = { e: [0, 0], c: [0, 0] };
  for (let r = 0; r < runs; r++) {
    const seed = (lv * 7919 + r * 104729) >>> 0;
    const e = play(lv, seed, true), c = play(lv, seed, false);
    st.e[0] += e.win ? 1 : 0; st.e[1] += e.p; st.c[0] += c.win ? 1 : 0; st.c[1] += c.p;
  }
  const row = { lv, tiles: nt, types: cfg.types, layers: cfg.layers || 3,
    expertPass: +(st.e[0] / runs * 100).toFixed(1), expertProg: +(st.e[1] / runs * 100).toFixed(1),
    casualPass: +(st.c[0] / runs * 100).toFixed(1), casualProg: +(st.c[1] / runs * 100).toFixed(1) };
  rows.push(row);
  console.error(JSON.stringify(row));
}
fs.writeFileSync(path.join(__dirname, 'calibration.json'), JSON.stringify(rows, null, 1));
