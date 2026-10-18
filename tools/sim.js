const { levelConfig, generate, overlap } = window.__dbg;
function play(level) {
  const cfg = levelConfig(level);
  const tiles = generate(cfg, Math.floor(Math.random() * 1e9)).tiles;
  const slot = [];
  let removed = 0;
  const board = () => tiles.filter((t) => t.status === 'board');
  function covered(t, b) { for (const o of b) if (o !== t && o.layer > t.layer && overlap(o, t)) return true; return false; }
  while (true) {
    const b = board();
    if (!b.length && !slot.length) return { win: true, pct: 1 };
    const free = b.filter((t) => !covered(t, b));
    if (!free.length) return { win: false, pct: removed / tiles.length };
    const sc = {}; slot.forEach((ty) => sc[ty] = (sc[ty] || 0) + 1);
    const fc = {}; free.forEach((t) => fc[t.type] = (fc[t.type] || 0) + 1);
    let pick = free.find((t) => sc[t.type] === 2)
      || free.find((t) => sc[t.type] === 1 && fc[t.type] >= 2)
      || free.find((t) => !sc[t.type] && fc[t.type] >= 3)
      || free.find((t) => sc[t.type] === 1)
      || free.slice().sort((a, c) => (fc[c.type] - fc[a.type]))[0];
    pick.status = 'slot';
    slot.push(pick.type);
    const n = slot.filter((x) => x === pick.type).length;
    if (n === 3) { for (let k = 0; k < 3; k++) slot.splice(slot.indexOf(pick.type), 1); removed += 3; }
    if (slot.length >= 7) return { win: false, pct: removed / tiles.length };
  }
}
const out = {};
for (const lv of [1, 2, 3]) {
  let wins = 0, pct = 0, N = lv === 1 ? 20 : 40, cnt = 0;
  for (let i = 0; i < N; i++) { const r = play(lv); wins += r.win ? 1 : 0; pct += r.pct; }
  out['L' + lv] = { winRate: wins / N, avgProgress: +(pct / N).toFixed(3), tiles: generate(levelConfig(lv), 1).tiles.length };
}
return out;
