// 地图校验：尺寸 / 必要元素 / 连通性
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;
let bad = 0;

function err(msg) {
  bad++;
  console.log('✗ ' + msg);
}

D.floors.forEach((f, fi) => {
  console.log(`\n== 第 ${fi + 1} 层 ${f.name} ==`);
  if (f.map.length !== SIZE) err(`行数 ${f.map.length} != ${SIZE}`);
  f.map.forEach((row, y) => {
    if (row.length !== SIZE) err(`第 ${y} 行长度 ${row.length} != ${SIZE}: "${row}"`);
  });
  const flat = f.map.join('');
  const counts = {};
  for (const ch of flat) counts[ch] = (counts[ch] || 0) + 1;
  console.log('  元素:', Object.keys(counts).sort().map((k) => `${k}:${counts[k]}`).join(' '));
  if (fi === 0 && counts['@'] !== 1) err('第一层应有且仅有 1 个 @');
  if (fi > 0 && counts['@']) err('只有第一层能有 @');
  // 每一层（除顶层）都必须有且仅有 1 个上楼，否则会卡层
  if (fi < D.floors.length - 1 && !f.hiddenGate && counts['u'] !== 1) err(`应有且仅有 1 个上楼 u（实际 ${counts['u'] || 0}）`);
  if (f.hiddenGate && counts['u']) err('隐藏门层的上楼应由脚本生成，不应写在地图里');
  if (fi > 0 && counts['n'] !== 1) err(`应有且仅有 1 个下楼 n（实际 ${counts['n'] || 0}）`);
  if (fi === D.floors.length - 1 && counts['u']) err('顶层不应有上楼');
  if (fi === 0 && counts['n']) err('第一层不应有下楼');

  // 连通性：把门/怪物都视为可通过，找物理隔离区
  const start = fi === 0 ? f.map.findIndex((r) => r.includes('@')) : f.map.findIndex((r) => r.includes('n'));
  const sx = f.map[start].indexOf(fi === 0 ? '@' : 'n');
  const seen = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const q = [[sx, start]];
  seen[start][sx] = true;
  while (q.length) {
    const [x, y] = q.shift();
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return;
      if (seen[ny][nx]) return;
      if (f.map[ny][nx] === '#') return;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    });
  }
  let isolated = 0;
  f.map.forEach((row, y) => {
    for (let x = 0; x < SIZE; x++) {
      const ch = row[x];
      if (ch === '#') continue;
      if (!seen[y][x]) {
        isolated++;
        console.log(`  ⚠ 隔离物 "${ch}" at (${x},${y})`);
      }
    }
  });
  if (isolated) err(`${isolated} 个格子不可达`);
});

// ---------- 关键通道：入口 → 上楼 ----------
// 商店 M / 祭坛 X / 路遇 ? / 剧情 J 踩上去会弹全屏遮罩并中断自动寻路。
// 一旦它成为上下层之间唯一的通道格，玩家每次点远处都被拦下，等于把这一层锁死。
// Boss 与门是设计上允许堵路的（打掉 / 开门即可），不在此列。
const OVERLAY_TILES = new Set(['M', 'X', '?', 'J', 'K', 'T']);
function bfsReach(f, from, to, ban) {
  if (!from || !to) return false;
  const seen = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const q = [from];
  seen[from[1]][from[0]] = true;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      if (seen[ny][nx] || f.map[ny][nx] === '#') continue;
      if (ban && nx === ban[0] && ny === ban[1]) continue;
      if (nx === to[0] && ny === to[1]) return true;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return false;
}
D.floors.forEach((f, fi) => {
  const entryCh = fi === 0 ? '@' : 'n';
  let from = null, to = null;
  f.map.forEach((row, y) => {
    const a = row.indexOf(entryCh), b = row.indexOf('u');
    if (a >= 0) from = [a, y];
    if (b >= 0) to = [b, y];
  });
  if (!to) return; // 顶层 / 隐藏层没有上楼
  if (!bfsReach(f, from, to)) { err(`第 ${fi + 1} 层：入口到上楼不连通`); return; }
  const choke = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ch = f.map[y][x];
      if (ch === '#' || ch === 'u' || ch === entryCh) continue;
      if (OVERLAY_TILES.has(ch) && !bfsReach(f, from, to, [x, y])) choke.push(`${ch}(${x},${y})`);
    }
  }
  if (choke.length) err(`第 ${fi + 1} 层：会弹遮罩的格子焊死在唯一通路上 ${choke.join(' ')}`);
});

// 章节结构：四章、每章三层、章末一位 Boss，Boss 必须站在该章最后一层
if (D.chapters.length !== 4) err(`章节数应为 4，实际 ${D.chapters.length}`);
D.chapters.forEach((ch) => {
  console.log(`\n== ${ch.title}｜第 ${ch.from}–${ch.to} 层｜Boss ${ch.boss} ==`);
  if (ch.to - ch.from + 1 !== 3) err(`${ch.title} 不是 3 层`);
  const bossFloor = D.floors[ch.bossFloor - 1];
  if (!bossFloor) err(`${ch.title} 的 Boss 层 ${ch.bossFloor} 不存在`);
  else if (bossFloor.boss !== ch.boss) err(`${ch.title} 的 Boss 层没有 ${ch.boss}`);
  const boss = D.monsters[ch.boss];
  if (!boss || !boss.boss) err(`${ch.title} 的 Boss ${ch.boss} 没有 boss 标记`);
  if (boss && (!boss.story || !boss.after)) err(`Boss ${ch.boss} 缺剧情键`);
  for (let i = ch.from; i <= ch.to; i++) {
    if (D.floors[i - 1].chapter !== ch.id) err(`第 ${i} 层章节标记不是 ${ch.id}`);
  }
});
// 塔规系统已移除（2026-11-12）：章末回响改为击败 Boss 必得锁环三选一

// 图例覆盖：地图里不允许出现没登记的字符
D.floors.forEach((f, fi) => {
  new Set(f.map.join('')).forEach((ch) => {
    if (!D.LEGEND[ch] && !D.monsters[ch]) err(`第 ${fi + 1} 层出现图例外的字符 "${ch}"`);
  });
});

// v2.1：章节主色、Boss 台词池、锁环构筑的数据完整性
global.STORY = global.STORY || null;
try { require('../js/story.js'); } catch (e) {}
D.chapters.forEach((ch) => {
  if (!ch.color || !ch.accent) err(`章节 ${ch.title} 缺主色 / 柔光色`);
});
Object.keys(D.monsters).forEach((ch) => {
  const m = D.monsters[ch];
  if (!m.boss) return;
  if (!m.phasePool || !m.phasePool.p2 || !m.phasePool.p3) err(`Boss ${ch} 缺 phasePool`);
  else {
    if (m.phasePool.p2.length < 2 || m.phasePool.p3.length < 2) err(`Boss ${ch} 的台词池不足 2 段`);
    m.phasePool.p2.concat(m.phasePool.p3).forEach((p) => {
      if (!p.title || !p.text || !p.n || !p.at) err(`Boss ${ch} 的阶段台词字段不全`);
    });
  }
});
Object.keys(D.rings).forEach((id) => {
  const r = D.rings[id];
  if (!r.name || !r.desc || !r.short || !r.emoji || !r.chapter) err(`锁环 ${id} 字段不全`);
  if (!D.ringPools[r.chapter] || D.ringPools[r.chapter].indexOf(id) < 0) err(`锁环 ${id} 不在第 ${r.chapter} 章的池子里`);
});
D.chapters.forEach((ch) => {
  const pool = D.ringPools[ch.id] || [];
  if (pool.length < 3) err(`${ch.title} 的锁环池不足 3 枚`);
  pool.forEach((id) => { if (D.rings[id] && D.rings[id].chapter !== ch.id) err(`锁环 ${id} 的章节标记错`); });
});
if (global.STORY && global.STORY.echoLines && global.STORY.echoLines.length !== D.chapters.length) {
  err('章末回响的旁白句数与章节数不符');
}

// 遗物与商店的数据完整性
Object.keys(D.items).forEach((ch) => {
  const it = D.items[ch];
  if (it.type === 'relic' && !D.relics[it.relic]) err(`道具 ${ch} 指向未定义的遗物 ${it.relic}`);
});
Object.keys(D.relics).forEach((id) => {
  const r = D.relics[id];
  if (!r.name || !r.desc) err(`遗物 ${id} 缺少名称或说明`);
});
D.shop.forEach((it) => {
  if (!it.id || !it.name || typeof it.price !== 'number') err(`商店商品异常：${JSON.stringify(it)}`);
});

// ---------- 跨局余烬经济：解锁线不能掐断循环 ----------
// 一局常规通关约 16 余烬（基础 5 + 击杀/回响/结局/路遇），最贵的解锁应在 3 局内够得着。
// 老分数制时代留的 60/120 要 7~20 局，PROGRESS P-1 记过这个断头问题。
const RUN_EMBER = 16;
const vowIds = Object.keys(D.vows);
const freeMax = Math.max(...vowIds.filter((id) => !D.vows[id].ember).map((id) => D.vows[id].reward || 0));
vowIds.forEach((id) => {
  const v = D.vows[id];
  if (typeof v.reward !== 'number' || v.reward < 0) err(`誓约 ${id} 缺通关额外余烬`);
  if (!v.ember) return;
  if (v.ember > RUN_EMBER * 3) err(`「${v.name}」解锁成本 ${v.ember} 超过 3 局常规通关（${RUN_EMBER}×3）`);
  if (v.reward <= freeMax) err(`「${v.name}」回报 ${v.reward} 不该低于免费誓约上限 ${freeMax}`);
});

console.log(bad === 0 ? '\n✓ 地图校验通过' : `\n✗ 共 ${bad} 个问题`);

// ---------- 仓库布局：Web 发布不许被误判成小程序 ----------
// 2026-11-12 踩过：小程序工程曾经放在仓库根（app.json + pages/），
// 发布工具把整个工作区判成小程序，Web 发布直接失败（SITES_APP_CREATE_FAILED）。
// 微信工程必须留在 wechat/ 一层，根目录不许出现小程序清单。
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
['app.json', 'app.js', 'project.config.json', 'game.json'].forEach((f) => {
  if (fs.existsSync(path.join(ROOT, f))) {
    err(`仓库根出现小程序清单 ${f}——Web 发布会被误判成小程序，请移到 wechat/`);
  }
});
['pages', 'miniprogram', 'wxgame'].forEach((d) => {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
    err(`仓库根出现小程序目录 ${d}/——Web 发布会被误判成小程序，请移到 wechat/`);
  }
});
if (fs.existsSync(path.join(ROOT, 'wechat'))) {
  console.log('✓ 微信工程收在 wechat/，根目录保持纯 Web 结构');
}

console.log(bad === 0 ? '✓ 闸门自检通过' : `✗ 共 ${bad} 个问题`);
process.exit(bad === 0 ? 0 : 1);
