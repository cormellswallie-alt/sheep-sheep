/* 界面：首页、每日挑战、关卡码、弹窗、胜负结算、回放 HUD、返回键 */
'use strict';

const MODALS = ['#levels', '#code', '#pause', '#fail', '#win', '#replay-end'];
const isShown = (s) => $(s).classList.contains('show');
const fmtTime = (s) => `${Math.floor(s / 60)}:${pad2(Math.floor(s % 60))}`;

const UI = {
  canvasActive() { return !isShown('#menu') && !isShown('#pen'); },
  hideAll() {
    $('#menu').classList.remove('show');
    Pen.close(true);
    MODALS.forEach((m) => $(m).classList.remove('show'));
    $('#replay-hud').classList.remove('show');
  },
  show(id) { $(id).classList.add('show'); },
  hide(id) { $(id).classList.remove('show'); },

  onGameStart() {
    this.hideAll();
    if (G.replay) {
      this.show('#replay-hud');
      $('#replay-step').textContent = `0/${G.solution.length}`;
      $('#replay-speed').textContent = `${G.replay.speed}×`;
    }
    $$('.code-val').forEach((e) => { e.textContent = G.code; });
  },
  onReplayStep(i, n) { $('#replay-step').textContent = `${i}/${n}`; },

  goMenu() {
    G.state = 'menu'; G.cfg = null; G.tiles = []; G.slot = []; G.replay = null; drawOrder = [];
    this.hideAll(); this.show('#menu'); this.renderMenu();
  },
  renderMenu() {
    const d = ensureDaily();
    const sub = $('#daily-sub'), btn = $('#btn-daily');
    btn.classList.toggle('done', d.cleared);
    sub.textContent = d.cleared ? `✅ ${todayLabel()} 已通关 · 可再挑战` : `${todayLabel()} · 全服同一局${d.tries ? ` · 已挑战 ${d.tries} 次` : ' · 通关必得稀有羊'}`;
    const n = save.sheep.length;
    const badge = $('#pen-badge'); badge.textContent = n; badge.classList.toggle('on', n > 0);
    $('#stats').textContent = `羊圈 ${n} 只 · 通关 ${save.wins} 次 · 挑战 ${save.tries} 次`;
    $('#btn-sound').textContent = save.sound ? '🔊' : '🔇';
    $('#btn-start').textContent = save.unlocked >= 2 ? `继续闯关 · 第 ${Math.min(save.unlocked, 30)} 关` : '开始游戏';
    // 首页羊群：展示最新的几只
    const flock = $('#menu-flock'); flock.innerHTML = '';
    const show = save.sheep.slice(-6).reverse();
    const slots = [[8, 0.62], [76, 0.66], [22, 0.5], [62, 0.52], [0, 0.42], [86, 0.44]];
    show.forEach((v, i) => {
      const e = document.createElement('div'); e.className = 'mini-sheep';
      const [left, sc] = slots[i];
      e.style.left = `${left}%`; e.style.bottom = `${(1 - sc) * 60}px`;
      e.style.width = e.style.height = `${Math.round(78 * sc + 20)}px`;
      e.style.setProperty('--f', left > 50 ? -1 : 1);
      e.style.animationDelay = `${-i * 0.5}s`; e.style.zIndex = Math.round(sc * 10);
      e.innerHTML = sheepSVG({ v });
      flock.appendChild(e);
    });
  },

  showPause() {
    if (G.state !== 'playing' || G.replay) return;
    G.state = 'paused';
    $('#btn-sound2').textContent = `声音：${save.sound ? '开' : '关'}`;
    this.show('#pause');
  },
  resume() { this.hide('#pause'); G.state = 'playing'; },

  showFail() {
    if (G.replay) return;
    G.state = 'failed';
    const remain = G.tiles.filter((t) => t.status !== 'gone').length;
    const pct = Math.floor((1 - remain / G.total) * 100);
    if (G.mode === 'daily') { const d = ensureDaily(); d.best = Math.max(d.best || 0, pct); persist(); }
    const quip = G.level >= 2
      ? (pct >= 80 ? '就差最后几步！这局一定有解～' : pct >= 50 ? '已经过半了，换个顺序试试？' : '据说只有 0.1% 的人能通过第二关…')
      : '再试一次，很简单的！';
    $('#fail-text').innerHTML = `已完成 <b>${pct}%</b>，还剩 <b>${remain}</b> 张牌<br>${quip}`;
    const rb = $('#btn-revive');
    rb.disabled = G.revive <= 0;
    rb.textContent = G.revive > 0 ? '复活一次（移出 3 张）' : '复活机会已用完';
    $('#btn-newgame').style.display = G.mode === 'daily' ? 'none' : '';
    this.show('#fail');
  },

  showWin() {
    G.state = 'won';
    if (G.replay) { this.hide('#replay-hud'); this.show('#replay-end'); return; }
    const secs = Math.max(1, G.endAt - G.startAt);
    let reward = null, note = '';
    save.wins++;
    if (G.mode === 'level') save.unlocked = Math.max(save.unlocked, G.level + 1);
    if (G.watched) note = '这局看过正解，不发放小羊哦';
    else if (G.mode === 'daily') {
      const d = ensureDaily();
      if (!d.cleared) { d.cleared = true; reward = rollSheep('daily'); } else note = '今日挑战奖励已领取';
    } else if (G.level === 1) {
      if (!save.lambDate) { save.lambDate = today(); reward = rollSheep('lamb'); } else note = '新手奖励已领取，去第 2 关领养更多小羊吧';
    } else reward = rollSheep('level');
    if (reward) { save.sheep.push(reward); save.flock++; }
    persist();
    G.reward = reward;

    $('#win-title').textContent = reward ? '加入羊群！' : '恭喜通关！';
    const rv = $('#reveal'); rv.classList.remove('on');
    const rs = $('#reveal-sheep');
    rv.querySelectorAll('.egg').forEach((e) => e.remove());
    if (reward) {
      rs.innerHTML = sheepSVG({ v: reward });
      const egg = document.createElement('div'); egg.className = 'egg'; egg.textContent = '🥚'; rv.appendChild(egg);
      const R = RARITY[reward.rar];
      rv.style.setProperty('--rc', reward.rar === 'legend' ? 'rgba(255,170,60,.65)' : reward.rar === 'epic' ? 'rgba(190,140,255,.55)' : 'rgba(255,215,90,.55)');
      $('#reveal-info').innerHTML = `<span class="rar-badge" style="background:${R.color}">${R.name}</span><span class="rar-stars">${starStr(reward.rar)}</span>
        <div class="reveal-name">「${reward.name}」· ${sheepDesc(reward)}</div>`;
      setTimeout(() => { rv.classList.add('on'); Sound.reveal(R.stars); Sound.baa(1 + (R.stars - 1) * 0.06); Native.vib(40); }, 900);
    } else {
      rs.innerHTML = sheepSVG({ v: {} });
      rv.style.setProperty('--rc', 'rgba(255,215,90,.45)');
      $('#reveal-info').innerHTML = `<div class="reveal-name">${note}</div>`;
      setTimeout(() => { rv.classList.add('on'); Sound.baa(); }, 300);
    }
    const name = G.mode === 'daily' ? '今日挑战' : G.cfg.name;
    $('#win-text').innerHTML = `<div class="win-stats"><div><b>${fmtTime(secs)}</b>用时</div><div><b>${G.propsUsed + (1 - G.revive)}</b>道具/复活</div><div><b>${G.maxCombo}</b>最高连消</div></div>`
      + (G.level === 1 && G.mode === 'level' ? '<div style="margin-top:8px">热身完毕～第 2 关才是真正的挑战！</div>' : '');
    $('#btn-next').textContent = G.mode === 'daily' ? `继续闯关 · 第 ${Math.min(save.unlocked, 30)} 关` : `挑战第 ${G.level + 1} 关`;
    G.shareText = `我在「羊了个羊·复刻」通过了${name}！用时 ${fmtTime(secs)}，最高连消 ×${G.maxCombo}${reward ? `，还领养了一只${RARITY[reward.rar].name}小羊「${reward.name}」` : ''}。关卡码 ${G.code}，敢来挑战同一局吗？`;
    this.show('#win');
  },

  openLevels() {
    const grid = $('#level-grid'); grid.innerHTML = '';
    const max = Math.min(30, Math.max(12, save.unlocked + 2));
    for (let i = 1; i <= max; i++) {
      const cfg = levelConfig(i);
      const b = document.createElement('button');
      const locked = i > save.unlocked;
      b.className = 'level-cell' + (i >= 2 ? ' hard' : '') + (locked ? ' locked' : '');
      b.innerHTML = `${locked ? '🔒' : i}<small>${cfg.tag}</small>`;
      b.onclick = () => {
        if (locked) { toast('先通过前一关才能解锁哦'); return; }
        Sound.init(); startGame({ level: i });
      };
      grid.appendChild(b);
    }
    this.show('#levels');
  },
  openCode() {
    const inp = $('#code-input'); inp.value = ''; inp.classList.remove('err');
    this.show('#code');
    setTimeout(() => inp.focus(), 250);
  },
  submitCode() {
    const inp = $('#code-input');
    const r = decodeCode(inp.value);
    if (!r) { inp.classList.remove('err'); void inp.offsetWidth; inp.classList.add('err'); toast('关卡码格式不对，例如 2-K7Q3MZ'); return; }
    inp.blur();
    Sound.init();
    startGame({ level: r.level, seed: r.seed });
  },
};

/* ---------------- 事件绑定 ---------------- */
function bind(sel, fn) { const e = $(sel); if (e) e.addEventListener('click', (ev) => { Sound.init(); fn(ev); }); }

bind('#btn-start', () => { Sound.baa(); startGame({ level: Math.min(save.unlocked, 30) }); });
bind('#btn-daily', () => { Sound.baa(1.08); startGame({ level: 2, mode: 'daily', seed: dailySeed() }); });
bind('#btn-levels', () => UI.openLevels());
bind('#btn-code', () => UI.openCode());
bind('#btn-pen', () => Pen.open());
bind('#pen-back', () => Pen.close());
bind('#btn-code-go', () => UI.submitCode());
$('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') UI.submitCode(); });
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.modal').classList.remove('show')));
bind('#btn-sound', () => { Sound.setOn(!save.sound); UI.renderMenu(); });
bind('#btn-sound2', () => { Sound.setOn(!save.sound); $('#btn-sound2').textContent = `声音：${save.sound ? '开' : '关'}`; });
bind('#btn-resume', () => UI.resume());
bind('#btn-restart', () => startGame({ level: G.level, seed: G.seed, mode: G.mode }));
bind('#btn-retry', () => startGame({ level: G.level, seed: G.seed, mode: G.mode }));
bind('#btn-newgame', () => startGame({ level: G.level }));
['#btn-home', '#btn-home2', '#btn-home3', '#btn-home4'].forEach((s) => bind(s, () => UI.goMenu()));
bind('#btn-next', () => startGame({ level: G.mode === 'daily' ? Math.min(save.unlocked, 30) : Math.min(G.level + 1, 30) }));
bind('#btn-share-win', () => { Native.share(G.shareText || ''); toast('战绩已复制，快去分享吧'); });
$$('[data-copy]').forEach((b) => b.addEventListener('click', () => { Native.copy(G.code); toast(`已复制关卡码 ${G.code}`); }));
$$('[data-share]').forEach((b) => b.addEventListener('click', () => {
  Native.share(`来「羊了个羊·复刻」挑战同一局！关卡码：${G.code}（首页 → 关卡码 输入即可）`);
}));
bind('#btn-revive', () => {
  if (G.revive <= 0) return;
  G.revive--;
  UI.hide('#fail');
  G.state = 'playing';
  useOut(true);
  toast('复活成功！3 张牌已移出卡槽');
});
bind('#btn-solution', () => { UI.hide('#fail'); startReplay(); toast('正在回放这副牌的通关路线'); });
bind('#btn-replay-retry', () => { G.replay = null; startGame({ level: G.level, seed: G.seed, mode: G.mode }); });
bind('#btn-replay-again', () => startReplay());
bind('#replay-speed', () => {
  const R = G.replay; if (!R) return;
  R.speed = R.speed >= 4 ? 1 : R.speed * 2;
  $('#replay-speed').textContent = `${R.speed}×`;
});
bind('#replay-exit', () => { G.state = 'won'; UI.hide('#replay-hud'); UI.show('#replay-end'); });
$('.sheep-stage .hero').addEventListener('click', () => { Sound.init(); Sound.baa(); });

/* ---------------- Android 桥接 ---------------- */
window.onAndroidBack = () => {
  if (Pen.cardOpen()) { Pen.hideCard(); return true; }
  if (isShown('#pen')) { Pen.close(); return true; }
  if (isShown('#code')) { UI.hide('#code'); return true; }
  if (isShown('#levels')) { UI.hide('#levels'); return true; }
  if (G.replay && G.state === 'playing') { G.state = 'won'; UI.hide('#replay-hud'); UI.show('#replay-end'); return true; }
  if (G.state === 'playing') { UI.showPause(); return true; }
  if (G.state === 'paused') { UI.resume(); return true; }
  if (['failed', 'won'].includes(G.state)) { UI.goMenu(); return true; }
  if (['failing', 'winning'].includes(G.state)) return true;
  return false;
};
window.onAppPause = () => { Sound.suspend(); paused = true; if (G.state === 'playing' && !G.replay) UI.showPause(); };
window.onAppResume = () => { Sound.resume(); paused = false; lastT = performance.now(); };

/* ---------------- 羊圈 ---------------- */
const Pen = {
  items: [], raf: 0, last: 0,
  open() {
    UI.hide('#menu'); UI.show('#pen');
    this.render();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now) => { this.tick(Math.min(0.05, (now - this.last) / 1000)); this.last = now; this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  },
  close(silent) {
    if (!isShown('#pen')) return;
    cancelAnimationFrame(this.raf);
    this.hideCard();
    UI.hide('#pen');
    if (!silent) { UI.show('#menu'); UI.renderMenu(); }
  },
  render() {
    const field = $('#pen-field'); field.innerHTML = '';
    const list = save.sheep;
    $('#pen-count').textContent = `${list.length} 只`;
    const cnt = {}; list.forEach((v) => { cnt[v.rar] = (cnt[v.rar] || 0) + 1; });
    $('#pen-rarity').innerHTML = RAR_ORDER.filter((r) => cnt[r]).map((r) => `<span style="background:${RARITY[r].color}">${RARITY[r].name} ${cnt[r]}</span>`).join('');
    this.items = [];
    if (!list.length) {
      field.innerHTML = '<div class="pen-empty"><span class="egg">🥚</span>羊圈还空空的<br>通过第 1 关领养第一只小羊<br>闯关和今日挑战能领养更稀有的羊！</div>';
      $('#pen-tip').textContent = '';
      return;
    }
    $('#pen-tip').textContent = '点点小羊，看看它是谁～';
    // 稀有的优先展示，最多 40 只
    const rank = { legend: 0, epic: 1, rare: 2, common: 3 };
    const shown = list.slice().sort((a, b) => (rank[a.rar] - rank[b.rar]) || (b.id - a.id)).slice(0, 40);
    const cols = Math.max(2, Math.ceil(Math.sqrt(shown.length * 0.8))), rows = Math.ceil(shown.length / cols);
    const cellsIdx = shuffle([...Array(cols * rows).keys()]);
    shown.forEach((v, k) => {
      const ci = cellsIdx[k], cxp = (ci % cols + 0.2 + fr() * 0.6) / cols, cyp = (Math.floor(ci / cols) + 0.2 + fr() * 0.6) / rows;
      const e = document.createElement('div'); e.className = 'pen-sheep';
      e.innerHTML = `<div class="inner">${sheepSVG({ v })}</div>` + (v.rar !== 'common' ? `<span class="tag" style="background:${RARITY[v.rar].color}">${RARITY[v.rar].name}</span>` : '');
      field.appendChild(e);
      const it = { v, e, x: 0.08 + cxp * 0.84, y: 0.12 + cyp * 0.84, tx: 0, ty: 0, mode: 'idle', timer: fr() * 2, face: fr() < 0.5 ? 1 : -1 };
      e.addEventListener('click', (ev) => { ev.stopPropagation(); this.tap(it); });
      this.items.push(it);
    });
    this.place();
  },
  tick(dt) {
    for (const it of this.items) {
      it.timer -= dt;
      if (it.mode === 'walk') {
        const dx = it.tx - it.x, dy = it.ty - it.y, dist = Math.hypot(dx, dy);
        const sp = 0.06 * dt;
        if (dist < sp) { it.mode = fr() < 0.5 ? 'eat' : 'idle'; it.timer = 1.5 + fr() * 3; }
        else { it.x += dx / dist * sp; it.y += dy / dist * sp; if (Math.abs(dx) > 0.002) it.face = dx > 0 ? -1 : 1; }
      } else if (it.timer <= 0) {
        it.mode = 'walk';
        it.tx = clamp(it.x + (fr() - 0.5) * 0.5, 0.08, 0.92); it.ty = clamp(it.y + (fr() - 0.5) * 0.4, 0.12, 0.98);
      }
    }
    this.place();
  },
  place() {
    const f = $('#pen-field'); const w = f.clientWidth, h = f.clientHeight;
    for (const it of this.items) {
      const sc = 0.72 + it.y * 0.42;
      it.e.style.left = `${it.x * w}px`; it.e.style.top = `${it.y * h}px`;
      it.e.style.zIndex = Math.round(it.y * 100);
      it.e.style.transform = `scale(${sc})`;
      it.e.querySelector('.inner').style.transform = `scaleX(${it.face})`;
      it.e.classList.toggle('walk', it.mode === 'walk');
      it.e.classList.toggle('eat', it.mode === 'eat');
    }
  },
  tap(it) {
    Sound.init(); Sound.baa(0.9 + fr() * 0.3);
    it.mode = 'idle'; it.timer = 2;
    const b = document.createElement('span'); b.className = 'baa'; b.textContent = '咩~'; it.e.appendChild(b);
    setTimeout(() => b.remove(), 1200);
    setTimeout(() => this.showCard(it.v), 220);
  },
  showCard(v) {
    const R = RARITY[v.rar];
    const c = $('#sheep-card');
    c.style.setProperty('--rc', v.rar === 'legend' ? 'rgba(255,170,60,.55)' : v.rar === 'epic' ? 'rgba(190,140,255,.45)' : v.rar === 'rare' ? 'rgba(100,190,255,.4)' : 'rgba(150,220,110,.4)');
    $('#card-sheep').innerHTML = sheepSVG({ v });
    $('#card-name').textContent = `「${v.name}」`;
    $('#card-rar').innerHTML = `<span class="rar-badge" style="background:${R.color}">${R.name}</span><span class="rar-stars">${starStr(v.rar)}</span>`;
    $('#card-desc').innerHTML = `${sheepDesc(v)}<br>No.${v.id} · ${sheepFrom(v)}`;
    c.classList.add('show'); $('#pen').classList.add('card-open');
  },
  hideCard() { $('#sheep-card').classList.remove('show'); $('#pen').classList.remove('card-open'); },
  cardOpen() { return $('#sheep-card').classList.contains('show'); },
};
$('#pen').addEventListener('click', (e) => { if (Pen.cardOpen() && !e.target.closest('.sheep-card')) Pen.hideCard(); });
$('#sheep-card').addEventListener('click', () => Pen.hideCard());

/* ---------------- 启动 ---------------- */
(function boot() {
  $$('[data-sheep]').forEach((e) => { e.innerHTML = sheepSVG({ sad: e.dataset.sheep === 'sad', v: {} }); });
  const mf = $('.meadow-flowers');
  const FL = ['🌼', '🌷', '🌸', '🌼', '🌿', '🍀'];
  for (let i = 0; i < 16; i++) {
    const e = document.createElement('i'); e.textContent = FL[i % FL.length];
    e.style.left = `${(i * 61) % 100}%`; e.style.top = `${10 + ((i * 37) % 85)}%`;
    e.style.fontSize = `${11 + (i % 4) * 3}px`; e.style.animationDelay = `${-i * 0.4}s`;
    mf.appendChild(e);
  }
  layout();
  initAmbient();
  UI.goMenu();
  const qs = new URLSearchParams(location.search);
  if (qs.get('level')) startGame({ level: parseInt(qs.get('level'), 10) || 1, seed: qs.get('seed') ? parseInt(qs.get('seed'), 10) : undefined });
  if (qs.get('pen')) Pen.open();
  requestAnimationFrame(frame);
  window.__G = G;
  window.__dbg = { levelConfig, generate, overlap, startGame, startReplay, save, rollSheep, persist, Pen, UI };
})();
