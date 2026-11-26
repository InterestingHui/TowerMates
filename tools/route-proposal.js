// 改造方案的「预演」（只读，不动 js/data.js）：
// 把 docs/route-review 里的补丁打在一份内存副本上，重算主路 / 必经怪 / 钥匙预算，
// 用来证明「改完不会卡层、主路确实经过内容」。
// 用法：node tools/route-proposal.js
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;

// 补丁的单一来源在 tools/route-patches.js（出图工具也用同一份）
const { PATCHES } = require('./route-patches.js');

const maps = D.floors.map((f) => f.map.map((r) => r.split('')));
let bad = 0;
PATCHES.forEach((p) => {
  const g = maps[p.f - 1];
  if (!g) { console.log(`✗ 补丁指向不存在的层 ${p.f}`); bad++; return; }
  const cur = g[p.y][p.x];
  if (cur !== p.from) { console.log(`✗ 第 ${p.f} 层 (${p.x},${p.y}) 期望 '${p.from}'，实际 '${cur}'`); bad++; return; }
  g[p.y][p.x] = p.to;
});

const isMon = (ch) => !!D.monsters[ch] && !D.monsters[ch].ghost;
function neighbors(x, y) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => [x + dx, y + dy])
    .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < SIZE && ny < SIZE);
}
function find(g, ch) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (g[y][x] === ch) return [x, y];
  return null;
}
function bfs(g, sx, sy, ban) {
  const d = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  d[sy][sx] = 0;
  const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of neighbors(x, y)) {
      if (d[ny][nx] >= 0 || g[ny][nx] === '#') continue;
      if (ban && ban.x === nx && ban.y === ny) continue;
      d[ny][nx] = d[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}
function path(g, a, b) {
  const prev = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const d = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  d[a[1]][a[0]] = 0;
  const q = [a];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of neighbors(x, y)) {
      if (d[ny][nx] >= 0 || g[ny][nx] === '#') continue;
      d[ny][nx] = d[y][x] + 1; prev[ny][nx] = [x, y]; q.push([nx, ny]);
    }
  }
  if (d[b[1]][b[0]] < 0) return null;
  const out = [];
  let cur = b;
  while (cur) { out.unshift(cur); cur = prev[cur[1]][cur[0]]; }
  return out;
}
function damage(ch, st) {
  const m = D.monsters[ch];
  if (!m || m.ghost) return 0;
  const tr = m.trait || '';
  const eDef = tr === 'solid' ? st.atk - 1 : m.def;
  if (st.atk <= eDef) return Infinity;
  const rounds = Math.ceil(m.hp / (st.atk - eDef));
  const per = Math.max(0, m.atk - st.def) * (tr === 'double' ? 1.7 : 1);
  const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
  let dmg = hits * per;
  if (dmg > 0) dmg = Math.max(1, Math.floor(dmg * 0.88)); // 按「拿到守誓之盾」的标准线
  return dmg;
}
const ENTER = [
  { atk: 10, def: 10 }, { atk: 14, def: 10 }, { atk: 20, def: 16 }, { atk: 41, def: 27 },
  { atk: 45, def: 30 }, { atk: 58, def: 34 }, { atk: 67, def: 36 }, { atk: 72, def: 40 },
  { atk: 82, def: 42 }, { atk: 94, def: 50 }, { atk: 105, def: 61 }, { atk: 118, def: 68 },
  { atk: 130, def: 73 },
];

function audit(g, fi) {
  const entryCh = fi === 0 ? '@' : 'n';
  const entry = find(g, entryCh);
  const exit = find(g, 'u') || find(g, 'T') || find(g, 'K');
  if (!entry || !exit) return null;
  const p = path(g, entry, exit);
  const d0 = bfs(g, entry[0], entry[1]);
  const direct = d0[exit[1]][exit[0]];
  const mons = p ? p.filter(([x, y]) => isMon(g[y][x])) : [];
  const keys = p ? p.filter(([x, y]) => g[y][x] === 'y' || g[y][x] === 'r') : [];
  const dmg = mons.reduce((s, [x, y]) => s + damage(g[y][x], ENTER[fi]), 0);
  const must = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!isMon(g[y][x])) continue;
    const d = bfs(g, entry[0], entry[1], { x, y });
    if (d[exit[1]][exit[0]] < 0) must.push(D.monsters[g[y][x]].name);
  }
  return { direct, len: p ? p.length : -1, reach: !!p, mons: mons.map(([x, y]) => D.monsters[g[y][x]].name), dmg, keys: keys.length, must };
}

if (bad) { console.log(`\n✗ 补丁自检 ${bad} 条不通过`); process.exit(1); }

console.log('=== 改后主路复核（进层属性按当前基线；伤害按「有守誓之盾」）===');
console.log('层  名称        直达  主路  主路怪（伤害）                          主路门  必经怪');
let total = 0;
maps.forEach((g, fi) => {
  const a = audit(g, fi);
  if (!a) return;
  total += a.keys;
  const label = `第${fi + 1}层 ${D.floors[fi].name}`;
  const monTxt = a.mons.length ? a.mons.join('+') + `（${a.dmg}）` : '—';
  console.log(`${String(fi + 1).padStart(2)}  ${(D.floors[fi].name + '　　　　').slice(0, 8)}  ${String(a.direct).padStart(3)}  ${String(a.len).padStart(4)}  ${monTxt.padEnd(38)}  ${String(a.keys).padStart(5)}   ${a.must.join('+') || '—'}${a.reach ? '' : '  ✗ 不可达'}`);
  if (!a.reach) bad++;
});
console.log(`\n主路门合计 ${total} 扇（黄 4 / 红 2 的目标见文档）`);
console.log(bad ? `✗ ${bad} 处不可达` : '✓ 13 层全部可达，无卡层');
