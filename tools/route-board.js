// 生成 docs/route-board.html：13 层地图体检板（现状 / 改后 可切换）
// 用法：node tools/route-board.js
const fs = require('fs');
const path = require('path');
global.window = global;
require('../js/data.js');
const { PATCHES, ISSUES } = require('./route-patches.js');
const D = global.GAME_DATA;
const SIZE = 11;

const NOTES = {
  1: '教学层：一条必经史莱姆 + 两侧支翼，结构合格。',
  2: '空走廊 + 梳齿房：主路 8 步 0 战斗，房间可整块跳过。',
  3: 'Boss 卡口 + 红门：红门后只有空走廊和零收益僵尸口袋。',
  4: '迷宫 + 红门：石像鬼独守 16 格空房。',
  5: '狼厅：黄门内室 3 精英换 1 瓶红药，净亏。',
  6: '空王座：剧场层，一个 Boss + 两件拾取，空是氛围。',
  7: '双走廊 + 梳状口袋：5 只精英全在死路，提灯僧被封在墙洞。',
  8: '枢纽层：商店 + 祭坛 + 精钢剑，0 割点是对的。',
  9: 'Boss 后置税：钟妖倒下后还有 2 只必经精英。',
  10: '最低谷底：3,006 承伤、420 回血、没有商店。',
  11: '双走廊：右廊 0 战斗，左廊守名人白站。',
  12: '最终 Boss：上下半厅，Boss 后仍有拾取，收束正确。',
  13: '锁芯：4 只角落怪 + 中央塔心石，打不打只影响余烬。',
};

const CH = { u: '↑', n: '↓', y: '黄', r: '红', M: '秤', X: '坛', '?': '?', '!': '碑', T: '👸', K: '💗', Q: '🗝️' };

const maps = D.floors.map((f) => f.map.map((r) => r.split('')));
const before = maps.map((g) => g.map((r) => r.slice()));
const after = maps.map((g) => g.map((r) => r.slice()));
PATCHES.forEach((p) => {
  if (after[p.f - 1][p.y][p.x] !== p.from) throw new Error(`补丁失配：第 ${p.f} 层 (${p.x},${p.y}) 期望 ${p.from}`);
  after[p.f - 1][p.y][p.x] = p.to;
});

function find(g, ch) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] === ch) return [x, y];
  return null;
}
function pathOf(g, fi) {
  const a = find(g, fi === 0 ? '@' : 'n');
  const b = find(g, 'u') || find(g, 'T') || find(g, 'K');
  if (!a || !b) return new Set();
  const prev = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const d = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  d[a[1]][a[0]] = 0;
  const q = [a];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      if (d[ny][nx] >= 0 || g[ny][nx] === '#') continue;
      d[ny][nx] = d[y][x] + 1;
      prev[ny][nx] = [x, y];
      q.push([nx, ny]);
    }
  }
  if (d[b[1]][b[0]] < 0) return new Set();
  const set = new Set();
  let cur = b;
  while (cur) { set.add(cur[1] * SIZE + cur[0]); cur = prev[cur[1]][cur[0]]; }
  return set;
}

const kindClass = (m) => ({ 兽: 'k-beast', 亡: 'k-dead', 构: 'k-construct', 异: 'k-alien', 锁: 'k-lock', 魂: 'k-soul' }[m.kind] || '');

function cellHtml(ch, x, y, changed, onPath) {
  const cls = ['c'];
  let txt = '';
  let title = '';
  if (ch === '#') { cls.push('wall'); }
  else if (D.monsters[ch]) {
    const m = D.monsters[ch];
    cls.push('mon', kindClass(m), m.boss ? 'boss' : '');
    txt = m.emoji;
    title = `${m.name} · ${m.hp}HP ${m.atk}攻 ${m.def}防`;
  } else if (ch === '$') { cls.push('gold'); txt = '💰'; title = '金币 +50'; }
  else if (D.items[ch]) {
    const it = D.items[ch];
    cls.push('item');
    txt = it.emoji;
    title = it.name;
  } else if (CH[ch]) {
    cls.push(ch === 'y' ? 'door-y' : ch === 'r' ? 'door-r' : ch === 'M' ? 'shop' : ch === 'X' ? 'altar' : ch === 'T' ? 'princess' : ch === 'K' ? 'heart' : 'mark');
    txt = CH[ch];
    title = { u: '上楼', n: '下楼', y: '黄门', r: '红门', M: '秤 · 商店', X: '祭坛（三选一）', '?': '路遇', '!': '碑文', T: '公主', K: '塔心石', Q: '层阶之钥' }[ch] || '';
  }
  if (onPath) cls.push('path');
  if (changed) cls.push('changed');
  return `<i class="${cls.filter(Boolean).join(' ')}" title="${title || ''}">${txt}</i>`;
}

function gridHtml(g, fi, mode) {
  const p = pathOf(g, fi);
  const changed = new Set(mode === 'after'
    ? PATCHES.filter((x) => x.f === fi + 1).map((x) => x.y * SIZE + x.x)
    : []);
  let out = '';
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    out += cellHtml(g[y][x], x, y, changed.has(y * SIZE + x), p.has(y * SIZE + x));
  }
  return `<div class="grid ${mode}">${out}</div>`;
}

const cards = D.floors.map((f, fi) => {
  const g0 = before[fi], g1 = after[fi];
  const iss = ISSUES[fi + 1] || [];
  const issueList = iss.length
    ? `<ol class="issues">${iss.map((it) => `<li><b>${it.label}</b><span>(${it.x},${it.y})</span></li>`).join('')}</ol>`
    : '<p class="clean">本层无结构性问题。</p>';
  const head = `第 ${String(fi + 1).padStart(2, '0')} 层 · ${f.name}`;
  return `<section class="floor">
    <h2>${head}<span class="ch">${f.chapter ? '第 ' + f.chapter + ' 章' : '隐藏层'}</span></h2>
    <div class="grids">${gridHtml(g0, fi, 'before')}${gridHtml(g1, fi, 'after')}</div>
    <p class="note">${NOTES[fi + 1]}</p>
    ${issueList}
  </section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TowerMates 逐层路线体检</title>
<style>
:root{--ink:#1d2330;--mute:#6b7485;--line:#dfe3ec;--bg:#f6f7fb;--card:#fff;
--wall:#e3e7f0;--wall2:#d5dae6;--gold:#f4c95d;--door-y:#f5c542;--door-r:#e0675e;
--mon:#eef1f8;--path:#3b6fe0;--bad:#d94b4b;--good:#2f9e6a;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 "PingFang SC","Microsoft YaHei",system-ui,sans-serif}
header{padding:28px 32px 10px}
h1{margin:0 0 6px;font-size:22px;letter-spacing:.5px}
header p{margin:0;color:var(--mute);font-size:13px}
.controls{display:flex;gap:10px;align-items:center;margin:16px 0 10px}
button{border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:999px;padding:7px 16px;font-size:13px;cursor:pointer}
button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.legend{display:flex;flex-wrap:wrap;gap:12px 18px;margin:6px 0 0;padding:0;list-style:none;font-size:12px;color:var(--mute)}
.legend i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px;border:1px solid rgba(0,0,0,.1)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;padding:18px 32px 40px}
.floor{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 16px 14px}
h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;justify-content:space-between}
.ch{font-size:11px;font-weight:400;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.grids{position:relative}
.grid{display:grid;grid-template-columns:repeat(11,1fr);gap:2px;background:#f0f2f8;padding:6px;border-radius:10px}
.grid.after{display:none}
body[data-mode="after"] .grid.before{display:none}
body[data-mode="after"] .grid.after{display:grid}
.c{position:relative;aspect-ratio:1;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:11px;font-style:normal;background:#fff;color:var(--ink);border:1px solid transparent;overflow:hidden}
.c.wall{background:repeating-linear-gradient(135deg,var(--wall) 0 3px,var(--wall2) 3px 4px)}
.c.mon{background:var(--mon);font-size:13px;border-color:#dbe0ea}
.k-beast{background:#fdeee2}.k-dead{background:#e6f0fb}.k-construct{background:#eef0f4}
.k-alien{background:#e7f6ea}.k-lock{background:#fbe7e6}.k-soul{background:#e8f4fb}
.c.boss{border-color:#d3a0a0;box-shadow:inset 0 0 0 1px #d3a0a0}
.c.item{background:#fff8e2;border-color:#f0dfae}
.c.gold{background:#fff3cf;border-color:#efdca6}
.c.door-y{background:var(--door-y);color:#4a3600;font-weight:700}
.c.door-r{background:var(--door-r);color:#fff;font-weight:700}
.c.shop{background:#ddf2e4;color:#1f6b43;font-weight:700}
.c.altar{background:#ece5fb;color:#5b3fa8;font-weight:700}
.c.mark{background:#eef1f8;color:#5a6478;font-weight:700}
.c.princess{background:#ffe6f0}
.c.heart{background:#ffe1ea}
.c.path::after{content:"";position:absolute;inset:1px;border:2px solid rgba(59,111,224,.30);border-radius:4px}
.c.changed{outline:2px solid var(--good);outline-offset:-1px}
.note{margin:10px 0 0;font-size:12.5px;color:var(--mute)}
.issues{margin:8px 0 0;padding-left:18px;font-size:12px;color:var(--bad)}
.issues span{color:var(--mute);margin-left:4px}
.clean{margin:8px 0 0;font-size:12px;color:var(--good)}
footer{padding:0 32px 36px;color:var(--mute);font-size:12px}
@media(max-width:520px){header,main,footer{padding-left:16px;padding-right:16px}}
</style></head>
<body data-mode="before">
<header>
  <h1>TowerMates · 逐层路线体检</h1>
  <p>2026-11-26 · 13 层 · 蓝框为入口→出口最短主路；绿框为本次改造的格子。数据源 <code>js/data.js</code>，未改动。</p>
  <div class="controls">
    <button id="b-before" class="on">现状</button>
    <button id="b-after">改后</button>
  </div>
  <ul class="legend">
    <li><i style="background:repeating-linear-gradient(135deg,#e3e7f0 0 3px,#d5dae6 3px 4px)"></i>墙</li>
    <li><i style="background:#fff;border-color:#dbe0ea"></i>地面</li>
    <li><i style="background:#fdeee2"></i>怪物（按族色）</li>
    <li><i style="background:#f5c542"></i>黄门</li>
    <li><i style="background:#e0675e"></i>红门</li>
    <li><i style="background:#fff8e2"></i>道具</li>
    <li><i style="background:#ddf2e4"></i>商店</li>
    <li><i style="background:#ece5fb"></i>祭坛</li>
    <li><i style="border:2px solid #3b6fe0;border-radius:3px"></i>主路</li>
    <li><i style="outline:2px solid #2f9e6a;outline-offset:-2px"></i>本次改动</li>
  </ul>
</header>
<main>
${cards}
</main>
<footer>报告全文：<code>docs/route-review-2026-11-26.md</code>　·　预演：<code>node tools/route-proposal.js</code>　·　体检：<code>node tools/route-map-audit.js</code></footer>
<script>
const bb = document.getElementById('b-before'), ba = document.getElementById('b-after');
bb.onclick = () => { document.body.dataset.mode = 'before'; bb.classList.add('on'); ba.classList.remove('on'); };
ba.onclick = () => { document.body.dataset.mode = 'after'; ba.classList.add('on'); bb.classList.remove('on'); };
if (location.hash === '#after') ba.onclick();
</script>
</body></html>`;

const out = path.join(__dirname, '..', 'docs', 'route-board.html');
fs.writeFileSync(out, html, 'utf8');
console.log('✓ 写出 ' + out + '（' + (html.length / 1024).toFixed(0) + ' KB）');
