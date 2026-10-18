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
function sheepSVG(opt) {
  opt = opt || {};
  const v = opt.v || {};
  const sad = !!opt.sad;
  const id = 'sg' + (++svgUid);
  let wool = v.wool || '#ffffff', stroke = '#e2dabd', defs = '';
  if (v.special === 'rainbow') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb3c1"/><stop offset=".25" stop-color="#ffd9a8"/>
      <stop offset=".5" stop-color="#fff6a8"/><stop offset=".75" stop-color="#b9f5c8"/><stop offset="1" stop-color="#b5dcff"/></linearGradient>`;
    wool = `url(#${id})`; stroke = '#e6cfe8';
  } else if (v.special === 'gold') {
    defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4b0"/><stop offset=".55" stop-color="#ffd23f"/>
      <stop offset="1" stop-color="#eaa800"/></linearGradient>`;
    wool = `url(#${id})`; stroke = '#d99a00';
  } else if (v.special === 'black') { wool = '#4a4a50'; stroke = '#2c2c31'; }
  const black = v.special === 'black';
  const face = black ? '#f0e3d0' : '#3f3f3f';
  const mouthC = black ? '#7a5240' : '#fff';
  let puffs = '';
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    puffs += `<circle cx="${(110 + 58 * Math.cos(a)).toFixed(1)}" cy="${(112 + 36 * Math.sin(a)).toFixed(1)}" r="24"/>`;
  }
  // 羊毛卷纹理
  const curls = [[96, 100], [124, 96], [146, 112], [108, 126], [134, 132], [84, 122]]
    .map(([x, y]) => `<path d="M${x - 6} ${y} q6 -8 12 0" stroke="${stroke}" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".8"/>`).join('');
  const eyes = sad
    ? `<path d="M-15 3 Q-9 -2 -3 3" stroke="${black ? '#333' : '#fff'}" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M3 3 Q9 -2 15 3" stroke="${black ? '#333' : '#fff'}" stroke-width="3" fill="none" stroke-linecap="round"/>
       <path d="M-12 9 q-3.5 6 0 8.5 q3.5 -2.5 0 -8.5z" fill="#7fd3ff"/>`
    : (black
      ? `<ellipse cx="-9" cy="3" rx="4" ry="5" fill="#1a1a1a"/><ellipse cx="9" cy="3" rx="4" ry="5" fill="#1a1a1a"/>
         <circle cx="-7.6" cy="1.4" r="1.5" fill="#fff"/><circle cx="10.4" cy="1.4" r="1.5" fill="#fff"/>`
      : `<ellipse cx="-9" cy="2" rx="6.5" ry="7.5" fill="#fff"/><ellipse cx="9" cy="2" rx="6.5" ry="7.5" fill="#fff"/>
         <circle cx="-8" cy="4" r="3.8" fill="#151515"/><circle cx="10" cy="4" r="3.8" fill="#151515"/>
         <circle cx="-6.6" cy="2.4" r="1.4" fill="#fff"/><circle cx="11.4" cy="2.4" r="1.4" fill="#fff"/>`);
  const mouth = sad
    ? `<path d="M-6 25 Q0 19 6 25" stroke="${mouthC}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<path d="M-6 20 Q0 26 6 20" stroke="${mouthC}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const acc = v.acc && ACC_SVG[v.acc] ? ACC_SVG[v.acc] : '';
  const sparkle = v.special === 'rainbow' || v.special === 'gold'
    ? `<g fill="#fff" opacity=".95"><path d="M150 70 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path d="M60 150 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
       <path d="M168 140 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/></g>` : '';
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><defs>${defs}</defs>
  <ellipse cx="106" cy="188" rx="66" ry="9" fill="rgba(0,0,0,.16)"/>
  <g stroke="#3f3f3f" stroke-width="10" stroke-linecap="round" class="legs">
    <line x1="76" y1="148" x2="74" y2="182"/><line x1="98" y1="152" x2="98" y2="184"/>
    <line x1="122" y1="152" x2="122" y2="184"/><line x1="146" y1="148" x2="148" y2="182"/>
  </g>
  <g fill="${wool}" stroke="${stroke}" stroke-width="3">${puffs}</g>
  <ellipse cx="110" cy="112" rx="60" ry="38" fill="${wool}"/>
  ${curls}
  <ellipse cx="96" cy="92" rx="26" ry="10" fill="#fff" opacity=".35"/>
  <circle cx="172" cy="96" r="12" fill="${wool}" stroke="${stroke}" stroke-width="3"/>
  <g transform="translate(58 96)" class="head">
    <ellipse cx="-26" cy="-6" rx="17" ry="8" fill="${face}" transform="rotate(-28 -26 -6)"/>
    <ellipse cx="26" cy="-6" rx="17" ry="8" fill="${face}" transform="rotate(28 26 -6)"/>
    <ellipse cx="-27" cy="-5" rx="9" ry="4" fill="#ff9fb0" transform="rotate(-28 -27 -5)"/>
    <ellipse cx="27" cy="-5" rx="9" ry="4" fill="#ff9fb0" transform="rotate(28 27 -5)"/>
    <ellipse cx="0" cy="8" rx="25" ry="31" fill="${face}"/>
    <g fill="${wool}" stroke="${stroke}" stroke-width="2.5"><circle cx="-13" cy="-21" r="11"/><circle cx="13" cy="-21" r="11"/><circle cx="0" cy="-27" r="12"/></g>
    ${eyes}
    <ellipse cx="-16" cy="16" rx="5" ry="3" fill="#ff8fa3" opacity=".85"/>
    <ellipse cx="16" cy="16" rx="5" ry="3" fill="#ff8fa3" opacity=".85"/>
    ${mouth}
    ${acc}
  </g>
  ${sparkle}
</svg>`;
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
