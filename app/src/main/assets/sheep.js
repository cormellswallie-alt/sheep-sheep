/* 小羊：SVG 绘制、稀有度、随机领养 */
'use strict';

const RARITY = {
  common: { name: '普通', color: '#6fb33a', stars: 1 },
  rare: { name: '稀有', color: '#2f9bf0', stars: 2 },
  epic: { name: '史诗', color: '#9b51e0', stars: 3 },
  legend: { name: '传说', color: '#ff9800', stars: 4 },
};
const RAR_ORDER = ['legend', 'epic', 'rare', 'common'];
const WOOLS = [['#ffffff', '雪白'], ['#fff3d6', '奶油'], ['#ffe0ec', '樱花粉'], ['#e1f2ff', '天空蓝'],
  ['#e3fbe6', '薄荷绿'], ['#efe6ff', '薰衣草'], ['#fff8c2', '柠檬黄'], ['#ffe6d5', '蜜桃']];
const ACCS = [['hat', '草帽'], ['party', '派对帽'], ['bow', '蝴蝶结'], ['scarf', '红围巾'], ['glasses', '圆眼镜'], ['flower', '花环']];
const NAMES = ['咩咩', '棉花糖', '小云朵', '团子', '布丁', '豆包', '奶糖', '雪球', '毛毛', '阿绵', '芝麻', '汤圆', '可颂', '麻薯',
  '栗子', '泡芙', '米糕', '绒绒', '果冻', '年糕', '软糖', '糯米', '奶昔', '小卷', '棉棉', '蓬蓬', '馒头', '云吞'];

const ACC_SVG = {
  hat: `<ellipse cx="0" cy="-33" rx="31" ry="7.5" fill="#e3ad3f"/><path d="M-16 -33 Q-16 -56 0 -56 Q16 -56 16 -33 Z" fill="#f2c95c"/>
        <rect x="-16" y="-41" width="32" height="6" fill="#e0533d"/><path d="M-26 -34 Q0 -27 26 -34" stroke="#c99530" stroke-width="2" fill="none"/>`,
  party: `<path d="M-14 -32 L14 -32 L0 -70 Z" fill="#7fc8ff"/><path d="M-10 -43 L10 -43 L7.6 -50 L-7.6 -50 Z" fill="#ff6fa3"/>
          <path d="M-5.4 -57 L5.4 -57 L3.2 -63 L-3.2 -63 Z" fill="#ffd23f"/><circle cx="0" cy="-71" r="5.5" fill="#ffd23f"/>`,
  crown: `<path d="M-18 -31 L-18 -51 L-9 -41 L0 -57 L9 -41 L18 -51 L18 -31 Z" fill="#ffd23f" stroke="#d99a00" stroke-width="2.5" stroke-linejoin="round"/>
          <circle cx="0" cy="-39" r="3.5" fill="#ff4d6d"/><circle cx="-11" cy="-37" r="2.5" fill="#4dc3ff"/><circle cx="11" cy="-37" r="2.5" fill="#4dc3ff"/>`,
  bow: `<g transform="translate(18 -30) rotate(18)"><path d="M0 0 L-13 -9 Q-16 0 -13 9 Z" fill="#ff7eb3"/><path d="M0 0 L13 -9 Q16 0 13 9 Z" fill="#ff7eb3"/>
        <circle r="4.5" fill="#ff3d84"/></g>`,
  scarf: `<path d="M-25 29 Q0 42 25 29 L25 38 Q0 51 -25 38 Z" fill="#e8453c"/><path d="M9 41 L16 62 L5 62 L1 43 Z" fill="#c9372f"/>
          <path d="M-20 33 L-20 38 M-10 36 L-10 42 M0 37 L0 43 M10 36 L10 42 M20 33 L20 38" stroke="#ff8a80" stroke-width="2"/>`,
  glasses: `<g fill="rgba(190,235,255,.35)" stroke="#222" stroke-width="2.6"><circle cx="-10" cy="3" r="8.5"/><circle cx="10" cy="3" r="8.5"/></g>
            <path d="M-1.5 2 Q0 0 1.5 2" stroke="#222" stroke-width="2.6" fill="none"/>`,
  flower: [[-19, -27, '#ff7eb3'], [-10, -35, '#ffd23f'], [0, -38, '#7fc8ff'], [10, -35, '#ff9f43'], [19, -27, '#b388ff']]
    .map(([x, y, c]) => `<g transform="translate(${x} ${y})"><circle cx="-3" r="3.4" fill="${c}"/><circle cx="3" r="3.4" fill="${c}"/>
      <circle cy="-3" r="3.4" fill="${c}"/><circle cy="3" r="3.4" fill="${c}"/><circle r="2.4" fill="#fff6a8"/></g>`).join(''),
};

let svgUid = 0;
/* 小羊建模：体积感羊毛（多层径向渐变绒球 + 底部环境光遮蔽 + 顶部轮廓光）、
 * 带蹄的四肢、立体头部（面部渐变 + 鼻吻 + 高光大眼 + 内耳）、尾巴、地面接触阴影 */
function sheepSVG(opt) {
  opt = opt || {};
  const v = opt.v || {};
  const sad = !!opt.sad;
  const id = 'sg' + (++svgUid);
  const black = v.special === 'black';
  // 毛色：亮部 / 基色 / 暗部
  let hi = '#ffffff', base = v.wool || '#ffffff', lo = null, edge = null;
  if (v.special === 'gold') { hi = '#fff7c4'; base = '#ffd23f'; lo = '#d99000'; edge = '#b87700'; }
  else if (black) { hi = '#7a7a86'; base = '#4a4a54'; lo = '#2a2a31'; edge = '#1f1f25'; }
  else if (v.special === 'rainbow') { hi = '#ffffff'; base = '#fff0f6'; lo = '#d9c3ef'; edge = '#c9b0e6'; }
  lo = lo || mixHex(base, '#b9a98a', 0.42);
  edge = edge || mixHex(base, '#8f7f60', 0.45);
  const face = black ? '#f3e6d3' : '#3d3a40', faceHi = black ? '#fff8ec' : '#5b5760', faceLo = black ? '#d6c3a6' : '#252328';
  const legC = black ? '#2b2930' : '#3d3a40';
  let defs = `
  <radialGradient id="${id}w" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="${hi}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
  <radialGradient id="${id}b" cx=".42" cy=".28" r=".85"><stop offset="0" stop-color="${hi}"/><stop offset=".6" stop-color="${base}"/><stop offset="1" stop-color="${lo}"/></radialGradient>
  <radialGradient id="${id}f" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="${faceHi}"/><stop offset=".7" stop-color="${face}"/><stop offset="1" stop-color="${faceLo}"/></radialGradient>
  <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${legC}"/><stop offset=".45" stop-color="${mixHex(legC, '#ffffff', 0.18)}"/><stop offset="1" stop-color="${legC}"/></linearGradient>
  <radialGradient id="${id}s" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(30,50,10,.32)"/><stop offset="1" stop-color="rgba(30,50,10,0)"/></radialGradient>`;
  if (v.special === 'rainbow') {
    defs += `<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c8"/><stop offset=".25" stop-color="#ffd7a1"/>
      <stop offset=".5" stop-color="#fff3a0"/><stop offset=".75" stop-color="#b6f2c8"/><stop offset="1" stop-color="#aed6ff"/></linearGradient>`;
  }
  const W1 = `url(#${id}w)`;
  // 身体绒球：外圈 14 个 + 内层 7 个，大小错落
  const puffs = [], inner = [];
  for (let k = 0; k < 14; k++) {
    const a = k / 14 * Math.PI * 2 + 0.1;
    const r = 21 + ((k * 7) % 5) * 1.6;
    puffs.push([110 + 60 * Math.cos(a), 110 + 37 * Math.sin(a), r]);
  }
  [[92, 96, 24], [122, 92, 25], [148, 106, 22], [80, 116, 22], [108, 120, 26], [136, 124, 23], [112, 102, 24]].forEach((p) => inner.push(p));
  const c = (p, extra) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${p[2].toFixed(1)}" ${extra || ''}/>`;
  const rainbowTint = v.special === 'rainbow' ? `<ellipse cx="112" cy="110" rx="70" ry="44" fill="url(#${id}r)" opacity=".55" style="mix-blend-mode:multiply"/>` : '';
  // 腿：带关节锥度 + 蹄
  const leg = (x, y1, y2, back) => `<g opacity="${back ? 0.85 : 1}">
      <path d="M${x - 5.5} ${y1} L${x - 4.5} ${y2 - 6} Q${x} ${y2 - 3} ${x + 4.5} ${y2 - 6} L${x + 5.5} ${y1} Z" fill="url(#${id}l)"/>
      <rect x="${x - 6}" y="${y2 - 7}" width="12" height="8" rx="3.5" fill="${black ? '#141418' : '#1d1b20'}"/>
      <rect x="${x - 4}" y="${y2 - 6}" width="4" height="2.2" rx="1" fill="rgba(255,255,255,.25)"/></g>`;
  const eyes = sad
    ? `<path d="M-15 4 Q-9 -1 -3 4" stroke="${black ? '#3a2a20' : '#fff'}" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M3 4 Q9 -1 15 4" stroke="${black ? '#3a2a20' : '#fff'}" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M-12 10 q-3.5 6 0 8.5 q3.5 -2.5 0 -8.5z" fill="#8fd8ff"/>`
    : `<g>
        <ellipse cx="-9.5" cy="2" rx="7.2" ry="8.4" fill="#fff"/><ellipse cx="9.5" cy="2" rx="7.2" ry="8.4" fill="#fff"/>
        <ellipse cx="-8.6" cy="3.6" rx="4.6" ry="5.4" fill="#2a1d14"/><ellipse cx="10.4" cy="3.6" rx="4.6" ry="5.4" fill="#2a1d14"/>
        <ellipse cx="-8.6" cy="4.6" rx="2.6" ry="3" fill="#000"/><ellipse cx="10.4" cy="4.6" rx="2.6" ry="3" fill="#000"/>
        <circle cx="-6.8" cy="1.2" r="2" fill="#fff"/><circle cx="12.2" cy="1.2" r="2" fill="#fff"/>
        <circle cx="-10.2" cy="6.4" r=".9" fill="#fff" opacity=".8"/><circle cx="8.8" cy="6.4" r=".9" fill="#fff" opacity=".8"/>
        <path d="M-15.5 -6 Q-10 -9.5 -4 -6.5" stroke="${black ? '#a58a6c' : '#1c1a1f'}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
        <path d="M15.5 -6 Q10 -9.5 4 -6.5" stroke="${black ? '#a58a6c' : '#1c1a1f'}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>
      </g>`;
  const muzzleC = black ? '#e7d4b8' : '#4d4950';
  const mouth = sad
    ? `<path d="M-5 26 Q0 21.5 5 26" stroke="${black ? '#7a5240' : '#f2e9ea'}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : `<path d="M-5.5 21.5 Q-2.6 25 0 22 Q2.6 25 5.5 21.5" stroke="${black ? '#7a5240' : '#f2e9ea'}" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const acc = v.acc && ACC_SVG[v.acc] ? ACC_SVG[v.acc] : '';
  const sparkle = v.special === 'rainbow' || v.special === 'gold'
    ? `<g fill="#fff" class="sparkle"><path d="M150 66 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M56 150 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
       <path d="M170 142 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g>` : '';
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>
  <ellipse cx="110" cy="186" rx="74" ry="11" fill="url(#${id}s)"/>
  <g class="legs">${leg(84, 140, 182, true)}${leg(140, 140, 182, true)}${leg(96, 146, 185)}${leg(126, 146, 185)}</g>
  <g fill="${edge}">${puffs.map((p) => c([p[0], p[1] + 2.5, p[2] + 1.5])).join('')}</g>
  <g fill="url(#${id}b)">${puffs.map((p) => c(p)).join('')}</g>
  <ellipse cx="110" cy="110" rx="62" ry="38" fill="url(#${id}b)"/>
  <g fill="${W1}">${inner.map((p) => c(p)).join('')}</g>
  ${rainbowTint}
  <ellipse cx="112" cy="136" rx="54" ry="12" fill="${lo}" opacity=".35"/>
  <g fill="#fff" opacity=".55"><ellipse cx="92" cy="84" rx="16" ry="6"/><ellipse cx="124" cy="80" rx="12" ry="4.5"/><circle cx="72" cy="96" r="4"/></g>
  <g transform="translate(174 98) rotate(15)"><circle r="12" fill="${edge}" cy="1.5"/><circle r="12" fill="${W1}"/><circle cx="-3" cy="-4" r="4" fill="#fff" opacity=".5"/></g>
  <g transform="translate(58 96)" class="head">
    <g transform="rotate(-30 -24 -6)"><ellipse cx="-26" cy="-6" rx="17" ry="8.5" fill="url(#${id}f)"/><ellipse cx="-27" cy="-5" rx="10" ry="4.2" fill="#ffa3b5"/></g>
    <g transform="rotate(30 24 -6)"><ellipse cx="26" cy="-6" rx="17" ry="8.5" fill="url(#${id}f)"/><ellipse cx="27" cy="-5" rx="10" ry="4.2" fill="#ffa3b5"/></g>
    <path d="M-25 2 Q-27 -24 0 -24 Q27 -24 25 2 Q24 32 0 39 Q-24 32 -25 2 Z" fill="url(#${id}f)"/>
    <ellipse cx="0" cy="22" rx="13" ry="10" fill="${muzzleC}" opacity=".9"/>
    <path d="M-3.4 16.5 Q0 14.5 3.4 16.5 Q2 19.5 0 19.6 Q-2 19.5 -3.4 16.5Z" fill="${black ? '#b68f74' : '#1a181c'}"/>
    <ellipse cx="-8" cy="-12" rx="7" ry="3" fill="#fff" opacity="${black ? 0.35 : 0.12}"/>
    <g>
      <circle cx="-14" cy="-20" r="11.5" fill="${edge}"/><circle cx="14" cy="-20" r="11.5" fill="${edge}"/><circle cx="0" cy="-26" r="12.5" fill="${edge}"/>
      <circle cx="-14" cy="-21.5" r="11" fill="${W1}"/><circle cx="14" cy="-21.5" r="11" fill="${W1}"/><circle cx="0" cy="-27.5" r="12" fill="${W1}"/>
      <circle cx="-4" cy="-31" r="4" fill="#fff" opacity=".6"/>
    </g>
    ${eyes}
    <ellipse cx="-17" cy="15" rx="5.2" ry="3.2" fill="#ff8fa3" opacity=".7"/>
    <ellipse cx="17" cy="15" rx="5.2" ry="3.2" fill="#ff8fa3" opacity=".7"/>
    ${mouth}
    ${acc}
  </g>
  ${sparkle}
</svg>`;
}
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return '#' + [16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('');
}

function rollSheep(src) {
  const r = Math.random();
  let rar;
  if (src === 'lamb') rar = 'common';
  else if (src === 'daily') rar = r < 0.06 ? 'legend' : r < 0.30 ? 'epic' : 'rare';
  else rar = r < 0.02 ? 'legend' : r < 0.13 ? 'epic' : r < 0.45 ? 'rare' : 'common';
  const w = fpick(WOOLS);
  const v = { rar, wool: w[0], woolName: w[1] };
  if (rar === 'rare') { const a = fpick(ACCS); v.acc = a[0]; v.accName = a[1]; }
  if (rar === 'epic') {
    v.special = Math.random() < 0.5 ? 'black' : 'gold'; v.woolName = v.special === 'black' ? '小黑羊' : '黄金羊';
    if (Math.random() < 0.7) { const a = fpick(ACCS); v.acc = a[0]; v.accName = a[1]; }
  }
  if (rar === 'legend') { v.special = 'rainbow'; v.acc = 'crown'; v.accName = '王冠'; v.woolName = '彩虹羊'; }
  v.name = fpick(NAMES);
  v.id = ++save.sheepSeq;
  v.date = today();
  v.src = src;
  return v;
}
function sheepDesc(v) {
  return v.woolName + (v.accName ? ' · ' + v.accName : '');
}
function sheepFrom(v) {
  const m = { lamb: '第 1 关通关奖励', level: '闯关成功领养', daily: '今日挑战通关奖励' };
  return `${m[v.src] || '领养'} · ${v.date}`;
}
function starStr(rar) { return '★'.repeat(RARITY[rar].stars) + '☆'.repeat(4 - RARITY[rar].stars); }
