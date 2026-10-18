/* 羊了个羊 · 复刻版 —— 基础工具 / 随机数 / 存档 / 原生桥 / 音效 */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ---------------- 数学 & 随机 ---------------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
let rand = Math.random;                     // 关卡生成用（可种子化）
const ri = (n) => Math.floor(rand() * n);
const fr = () => Math.random();              // 特效用
const fpick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) & 0x3fffffff;
}
const randomSeed = () => Math.floor(Math.random() * 0x40000000);

/* ---------------- 关卡码 ---------------- */
// 形如 “2-K7Q3MZ”：关卡号 + 6 位 Crockford Base32 种子（30 bit）
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function encodeCode(level, seed) {
  let v = seed & 0x3fffffff, s = '';
  for (let i = 0; i < 6; i++) { s = B32[v & 31] + s; v >>>= 5; }
  return `${level}-${s}`;
}
function decodeCode(str) {
  const s = String(str || '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V').replace(/[^0-9A-Z-]/g, '');
  const m = s.match(/^(\d{1,2})-?([0-9A-Z]{6})$/);
  if (!m) return null;
  let v = 0;
  for (const ch of m[2]) { const k = B32.indexOf(ch); if (k < 0) return null; v = v * 32 + k; }
  const level = parseInt(m[1], 10);
  if (!(level >= 1 && level <= 30)) return null;
  return { level, seed: v };
}

/* ---------------- 日期 ---------------- */
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function today() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function todayLabel() { const d = new Date(); return `${d.getMonth() + 1}月${d.getDate()}日`; }
const dailySeed = () => hashStr('sheep-daily-' + today());

/* ---------------- 存档 ---------------- */
const SAVE_KEY = 'sheep_clone_save_v1';
const save = Object.assign({
  unlocked: 1, sound: true, wins: 0, tries: 0, flock: 0,
  sheep: [], sheepSeq: 0, lambDate: '', watched: [],
  daily: { date: '', tries: 0, cleared: false, best: 0 },
}, (() => { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); } catch (e) { return {}; } })());
if (!Array.isArray(save.sheep)) save.sheep = [];
if (!Array.isArray(save.watched)) save.watched = [];
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function ensureDaily() {
  if (!save.daily || save.daily.date !== today()) save.daily = { date: today(), tries: 0, cleared: false, best: 0 };
  return save.daily;
}

/* ---------------- 原生桥 ---------------- */
const Native = {
  vib(ms) { try { if (window.AndroidBridge) window.AndroidBridge.vibrate(ms); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} },
  copy(text) {
    try { if (window.AndroidBridge && window.AndroidBridge.copy) { window.AndroidBridge.copy(text); return true; } } catch (e) {}
    try {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); return true;
    } catch (e) { return false; }
  },
  share(text) {
    try { if (window.AndroidBridge && window.AndroidBridge.share) { window.AndroidBridge.share(text); return true; } } catch (e) {}
    try { if (navigator.share) { navigator.share({ text }); return true; } } catch (e) {}
    return this.copy(text);
  },
};

/* ---------------- 音效（WebAudio 实时合成） ---------------- */
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
    this.bgm = this.ac.createGain(); this.bgm.gain.value = 0.09; this.bgm.connect(this.master);
    this.startBgm();
  },
  setOn(on) { save.sound = on; persist(); if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ac.currentTime, 0.05); },
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
  tap() { this.tone(620, 0.08, 'triangle', 0.26, 0, 1.7); },
  blocked() { this.tone(170, 0.12, 'square', 0.05, 0, 0.8); },
  match(combo) {
    const k = Math.pow(2, Math.min(combo - 1, 8) / 12);
    [784, 988, 1319].forEach((f, i) => this.tone(f * k, 0.18, 'triangle', 0.22, i * 0.05));
    this.tone(1568 * k, 0.35, 'sine', 0.12, 0.16);
  },
  prop() { this.tone(520, 0.14, 'sine', 0.25, 0, 2); this.tone(880, 0.16, 'sine', 0.16, 0.08, 1.5); },
  fail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.08, i * 0.16)); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.22, i * 0.11)); },
  reveal(stars) {
    const base = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i < 2 + stars; i++) this.tone(base[i], 0.3, 'triangle', 0.2, i * 0.09);
    this.tone(2093, 0.6, 'sine', 0.1, (2 + stars) * 0.09);
  },
  baa(pitch) {
    if (!this.ac || !save.sound) return;
    const p = pitch || 1, t = this.ac.currentTime;
    const o = this.ac.createOscillator(), lfo = this.ac.createOscillator(), lg = this.ac.createGain();
    const f = this.ac.createBiquadFilter(), g = this.ac.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(430 * p, t); o.frequency.linearRampToValueAtTime(350 * p, t + 0.55);
    lfo.frequency.value = 26; lg.gain.value = 28 * p; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 1300 * p; f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f); f.connect(g); g.connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 0.65); lfo.stop(t + 0.65);
  },
  startBgm() { if (!this.ac || this.timer) return; this.next = this.ac.currentTime + 0.15; this.timer = setInterval(() => this.schedule(), 90); },
  schedule() {
    const sd = 0.19;
    while (this.next < this.ac.currentTime + 0.35) {
      const i = this.step % MELODY.length, m = MELODY[i], b = BASS[i % BASS.length];
      if (m) this.tone(midi(m), sd * 1.6, 'triangle', 0.5, this.next - this.ac.currentTime, 0, this.bgm);
      if (b) this.tone(midi(b), sd * 1.8, 'sine', 0.7, this.next - this.ac.currentTime, 0, this.bgm);
      this.next += sd; this.step++;
    }
  },
  suspend() { if (this.ac) this.ac.suspend(); },
  resume() { if (this.ac) this.ac.resume(); },
};

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
