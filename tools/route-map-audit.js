// 路线/地图体检（只读）：把「绕路、死路、无效门、钥匙卡死、清层收支」变成可计算的数。
// 用法：node tools/route-map-audit.js          人读报告
//       node tools/route-map-audit.js --json   给文档/脚本用
// 口径：
//   ① 结构指标（环性 / 死路 / 割点）把门与怪都当可通行——量的是「地图骨架」，
//      与 check.js 的物理连通性同一口径，不掺数值。
//   ② 钥匙预算用状态 BFS（x, y, 黄钥匙, 红钥匙），门要真扣钥匙——这是 sim.js 缺的一环
//      （sim 把门当免费通道，所以「钥匙够不够」从来没被模拟验证过）。
//   ③ 清层收支用 sim 的逐层读数当「进层属性」，与引擎 predictBase 同公式。
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;
const JSON_OUT = process.argv.includes('--json');

const PASS = (ch) => ch !== '#';
const isMonster = (ch) => !!D.monsters[ch] && !D.monsters[ch].ghost;
const isPickup = (ch) => ch === '$' || (!!D.items[ch] && D.items[ch].type !== 'story');
const LOOT = new Set(['p', 'P', 'h', 's', 'd', 'a', 'b', 'm', 'c', 'k', 'L', '$', 'O', 'S', 'X', 'K', 'Q', 'j', 'v', 'o', 'J', 'T']);
const DOOR = { y: '黄门', r: '红门' };

function find(f, ch) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (f.map[y][x] === ch) return [x, y];
  return null;
}
function neighbors(x, y) {
  const out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
    out.push([nx, ny]);
  }
  return out;
}
function bfsDist(map, sx, sy, ban) {
  const d = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  if (map[sy][sx] === '#') return d;
  const q = [[sx, sy]];
  d[sy][sx] = 0;
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [nx, ny] of neighbors(x, y)) {
      if (d[ny][nx] >= 0 || map[ny][nx] === '#') continue;
      if (ban && ban.x === nx && ban.y === ny) continue;
      d[ny][nx] = d[y][x] + 1;
      q.push([nx, ny]);
    }
  }
  return d;
}

// 状态 BFS：门必须真有钥匙才开（并扣掉）。钥匙上限按 9 截断——够用即可。
function keyReach(map, sx, sy) {
  const seen = new Set();
  const q = [[sx, sy, 0, 0]];
  seen.add(`${sx},${sy},0,0`);
  const cells = new Set();
  let maxKeys = { y: 0, r: 0 };
  for (let i = 0; i < q.length; i++) {
    const [x, y, ky, kr] = q[i];
    cells.add(y * SIZE + x);
    maxKeys.y = Math.max(maxKeys.y, ky);
    maxKeys.r = Math.max(maxKeys.r, kr);
    for (const [nx, ny] of neighbors(x, y)) {
      const ch = map[ny][nx];
      if (ch === '#') continue;
      let ny2 = ky, nr = kr;
      if (ch === 'y') { if (ky <= 0) continue; ny2 = ky - 1; }
      if (ch === 'r') { if (kr <= 0) continue; nr = kr - 1; }
      let gainY = 0, gainR = 0;
      if (ch === 'k') gainY = 1;
      if (ch === 'L') gainR = 1;
      const capY = Math.min(9, ny2 + gainY), capR = Math.min(9, nr + gainR);
      const key = `${nx},${ny},${capY},${capR}`;
      if (seen.has(key)) continue;
      seen.add(key);
      q.push([nx, ny, capY, capR]);
    }
  }
  return { cells, maxKeys };
}

function articulation(map) {
  // Tarjan 割点：返回割点集合
  const idx = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  const low = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  const cuts = new Set();
  let timer = 0;
  function dfs(x, y, px, py) {
    idx[y][x] = low[y][x] = timer++;
    let child = 0;
    for (const [nx, ny] of neighbors(x, y)) {
      if (map[ny][nx] === '#') continue;
      if (nx === px && ny === py) continue;
      if (idx[ny][nx] >= 0) { low[y][x] = Math.min(low[y][x], idx[ny][nx]); continue; }
      dfs(nx, ny, x, y);
      child++;
      low[y][x] = Math.min(low[y][x], low[ny][nx]);
      if (px >= 0 && low[ny][nx] >= idx[y][x]) cuts.add(y * SIZE + x);
    }
    if (px < 0 && child > 1) cuts.add(y * SIZE + x);
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (map[y][x] !== '#' && idx[y][x] < 0) dfs(x, y, -1, -1);
  }
  return cuts;
}

// ---- 引擎公式的只读复刻（与 engine.predictBase 同序）----
function predict(ch, st, flags) {
  const m = D.monsters[ch];
  if (!m || m.ghost) return null;
  const tr = m.trait || '';
  const eDef = tr === 'solid' ? st.atk - 1 : m.def;
  const effAtk = flags.cross && m.kind === '亡' ? Math.round(st.atk * 1.5) : st.atk;
  const out = effAtk - eDef;
  if (out <= 0) return { wall: true, m };
  const rounds = Math.ceil(m.hp / out);
  const myDef = tr === 'magic' ? 0 : st.def;
  const per = Math.max(0, m.atk - myDef) * (tr === 'double' ? 1.7 : 1);
  const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
  let dmg = hits * per;
  if (dmg > 0 && flags.ward) dmg = Math.max(1, Math.floor(dmg * 0.88));
  return { damage: dmg, rounds, per, out, m, wall: false };
}

// 进层属性：从 sim 的逐层读数里取（第 N 层末尾 = 第 N+1 层进层）
const ENTER = [
  { hp: 1000, maxHp: 1000, atk: 10, def: 10 },
  { hp: 1015, maxHp: 1160, atk: 14, def: 10 },
  { hp: 1322, maxHp: 1435, atk: 20, def: 16 },
  { hp: 1471, maxHp: 2162, atk: 41, def: 27 },
  { hp: 1714, maxHp: 2142, atk: 45, def: 30 },
  { hp: 1920, maxHp: 2932, atk: 58, def: 34 },
  { hp: 2909, maxHp: 3142, atk: 67, def: 36 },
  { hp: 2124, maxHp: 3352, atk: 72, def: 40 },
  { hp: 2271, maxHp: 3394, atk: 82, def: 42 },
  { hp: 4291, maxHp: 4579, atk: 94, def: 50 },
  { hp: 4672, maxHp: 5131, atk: 105, def: 61 },
  { hp: 5586, maxHp: 6152, atk: 118, def: 68 },
  { hp: 4490, maxHp: 6562, atk: 130, def: 73 },
];

const ITEM_VALUE = { p: 160, P: 420, h: 900, s: 60, d: 60, a: 120, b: 120, m: 120, c: 180, k: 20, L: 45, $: 50, o: 400 };
const ITEM_NAME = (ch) => (ch === '$' ? '金50' : (D.items[ch] ? D.items[ch].name : ch));
// 最短主路：入口 → 出口（门/怪都当可通行，量骨架）
function shortestPath(map, sx, sy, tx, ty) {
  const prev = Array.from({ length: SIZE }, () => new Array(SIZE).fill(null));
  const d = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1));
  d[sy][sx] = 0;
  const q = [[sx, sy]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    if (x === tx && y === ty) break;
    for (const [nx, ny] of neighbors(x, y)) {
      if (d[ny][nx] >= 0 || map[ny][nx] === '#') continue;
      d[ny][nx] = d[y][x] + 1;
      prev[ny][nx] = [x, y];
      q.push([nx, ny]);
    }
  }
  if (d[ty][tx] < 0) return null;
  const path = [];
  let cur = [tx, ty];
  while (cur) { path.unshift(cur); cur = prev[cur[1]][cur[0]]; }
  return path;
}
const rows = [];

D.floors.forEach((f, fi) => {
  const map = f.map.map((r) => r.split(''));
  const entryCh = fi === 0 ? '@' : 'n';
  const entry = find(f, entryCh);
  const up = find(f, 'u');
  const exit = up || find(f, 'T') || find(f, 'K');
  const exitName = up ? 'u' : (find(f, 'T') ? 'T' : 'K');

  // --- 结构 ---
  let V = 0, E = 0, deg1 = [];
  const deg = Array.from({ length: SIZE }, () => new Array(SIZE).fill(0));
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (map[y][x] === '#') continue;
    V++;
    for (const [nx, ny] of neighbors(x, y)) if (map[ny][nx] !== '#') deg[y][x]++;
    if (deg[y][x] === 1) deg1.push([x, y]);
  }
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (map[y][x] === '#') continue;
    for (const [nx, ny] of neighbors(x, y)) if (map[ny][nx] !== '#') E++;
  }
  E /= 2;
  const cyclomatic = E - V + 1;
  const cuts = articulation(map);
  const d0 = entry ? bfsDist(map, entry[0], entry[1]) : null;
  const direct = entry && exit ? d0[exit[1]][exit[0]] : -1;

  // --- 割点是否卡在主路上（去掉它入口到不了上楼）---
  const mainCuts = [];
  if (entry && exit) {
    cuts.forEach((k) => {
      const x = k % SIZE, y = (k / SIZE) | 0;
      if (map[y][x] === entryCh) return;
      const d = bfsDist(map, entry[0], entry[1], { x, y });
      if (d[exit[1]][exit[0]] < 0) mainCuts.push([x, y, map[y][x]]);
    });
  }

  // --- 门 ---
  const doors = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const ch = map[y][x];
    if (!DOOR[ch]) continue;
    const d = bfsDist(map, entry[0], entry[1], { x, y });
    const onPath = exit ? d[exit[1]][exit[0]] < 0 : false;
    let loot = 0, mons = 0, cells = 0, items = [];
    for (let yy = 0; yy < SIZE; yy++) for (let xx = 0; xx < SIZE; xx++) {
      if (d[yy][xx] >= 0 || map[yy][xx] === '#' || (xx === x && yy === y)) continue;
      const c = map[yy][xx];
      cells++;
      if (LOOT.has(c)) { loot += ITEM_VALUE[c] || 0; items.push(ITEM_NAME(c)); }
      if (isMonster(c)) { mons++; items.push(D.monsters[c].name); }
    }
    doors.push({ x, y, ch, name: DOOR[ch], onPath, loot, cells, mons, items });
  }

  // --- 主路 + 支翼：把「最短入口→出口」当主干，剩下的连通块就是每层要绕的岔路 ---
  const mainPath = entry && exit ? shortestPath(map, entry[0], entry[1], exit[0], exit[1]) : null;
  const onMain = new Set((mainPath || []).map((p) => p[1] * SIZE + p[0]));
  const wings = [];
  if (mainPath) {
    const seen = new Set(onMain);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x;
      if (seen.has(k) || map[y][x] === '#') continue;
      // 从这个格子泛洪，得到一个支翼
      const comp = [];
      const q = [[x, y]];
      seen.add(k);
      for (let i = 0; i < q.length; i++) {
        const [cx, cy] = q[i];
        comp.push([cx, cy]);
        for (const [nx, ny] of neighbors(cx, cy)) {
          const nk = ny * SIZE + nx;
          if (seen.has(nk) || map[ny][nx] === '#') continue;
          seen.add(nk);
          q.push([nx, ny]);
        }
      }
      // 支翼挂点：与主路相邻的格子
      const attach = [];
      comp.forEach(([cx, cy]) => {
        for (const [nx, ny] of neighbors(cx, cy)) if (onMain.has(ny * SIZE + nx)) attach.push([nx, ny]);
      });
      let loot = 0, mons = 0, heal = 0, exp = 0, gold = 0, names = [];
      comp.forEach(([cx, cy]) => {
        const c = map[cy][cx];
        if (LOOT.has(c)) { loot += ITEM_VALUE[c] || 0; names.push(ITEM_NAME(c)); }
        const it = D.items[c];
        if (it && it.type === 'hp') heal += it.value;
        if (isMonster(c)) {
          mons++; names.push(D.monsters[c].name);
          exp += D.monsters[c].exp || 0;
          gold += D.monsters[c].gold || 0;
        }
      });
      // 绕路步数：从挂点走到支翼最深处再回来（2×）
      let far = 0;
      attach.slice(0, 3).forEach(([ax, ay]) => {
        comp.forEach(([cx, cy]) => {
          // 曼哈顿下界足够做取舍判断；精确值用 BFS 太贵，且同层最多 3 个挂点
          far = Math.max(far, Math.abs(cx - ax) + Math.abs(cy - ay));
        });
      });
      wings.push({ cells: comp.length, attach: attach[0] || null, detour: far * 2, loot, mons, heal, exp, gold, names });
    }
    wings.sort((a, b) => b.detour - a.detour);
  }

  // --- 必经怪（去掉它入口到不了上楼）---
  const mustMons = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!isMonster(map[y][x])) continue;
    const d = bfsDist(map, entry[0], entry[1], { x, y });
    if (exit && d[exit[1]][exit[0]] < 0) mustMons.push([x, y, map[y][x], D.monsters[map[y][x]].name]);
  }

  // --- 钥匙状态可达 ---
  const kr = keyReach(map, entry[0], entry[1]);
  const exitReach = exit ? kr.cells.has(exit[1] * SIZE + exit[0]) : true;
  const unreachable = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (map[y][x] !== '#' && !kr.cells.has(y * SIZE + x)) unreachable.push([x, y, map[y][x]]);
  }

  // --- 清层收支（用进层属性）---
  const st = ENTER[fi] || ENTER[ENTER.length - 1];
  const flags = { ward: true, cross: false };
  let dmg = 0, exp = 0, gold = 0, mCount = 0, wall = [];
  let heal = 0, atkUp = 0, defUp = 0;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const ch = map[y][x];
    if (isMonster(ch)) {
      mCount++;
      const p = predict(ch, st, flags);
      if (!p || p.wall) { wall.push(D.monsters[ch].name); continue; }
      dmg += p.damage;
      exp += D.monsters[ch].exp || 0;
      gold += D.monsters[ch].gold || 0;
    }
    const it = D.items[ch];
    if (ch === '$') gold += 50;
    if (!it) continue;
    if (it.type === 'hp') heal += it.value;
    if (it.type === 'atk') atkUp += it.value;
    if (it.type === 'def') defUp += it.value;
    if (it.type === 'both') { atkUp += it.value; defUp += it.value; }
    if (it.type === 'gold') gold += it.value;
  }

  // --- 攻击临界：每只怪「回合数下降」所需的攻击值 ---
  const breakpoints = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const ch = map[y][x];
    if (!isMonster(ch)) continue;
    const m = D.monsters[ch];
    const tr = m.trait || '';
    const eDef = tr === 'solid' ? st.atk - 1 : m.def;
    if (st.atk <= eDef) continue;
    const r0 = Math.ceil(m.hp / (st.atk - eDef));
    // 找到让回合数变少 1 的最小攻击值
    for (let a = st.atk + 1; a <= st.atk + 20; a++) {
      const e2 = tr === 'solid' ? a - 1 : m.def;
      const r = Math.ceil(m.hp / (a - e2));
      if (r < r0) { breakpoints.push({ name: m.name, need: a, from: r0, to: r }); break; }
    }
  }
  const nearBp = breakpoints.filter((b) => b.need - st.atk <= 3).length;

  // --- 全清步数估计：终点集合（拾取 + 上楼）上的 MST ---
  const terms = [];
  if (entry) terms.push(entry);
  if (exit) terms.push(exit);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (isPickup(map[y][x]) || map[y][x] === 'X' || map[y][x] === '?') terms.push([x, y]);
  }
  // 去重
  const uniq = [];
  const seenT = new Set();
  terms.forEach((t) => { const k = t[0] + ',' + t[1]; if (!seenT.has(k)) { seenT.add(k); uniq.push(t); } });
  const dists = uniq.map((t) => bfsDist(map, t[0], t[1]));
  const n = uniq.length;
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  let mst = 0;
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    let k = -1;
    for (let j = 0; j < n; j++) if (!inTree[j] && (k < 0 || best[j] < best[k])) k = j;
    if (k < 0 || best[k] === Infinity) break;
    inTree[k] = true;
    mst += best[k];
    for (let j = 0; j < n; j++) {
      if (inTree[j]) continue;
      const d = dists[k][uniq[j][1]][uniq[j][0]];
      if (d >= 0 && d < best[j]) best[j] = d;
    }
  }
  const tour = Math.max(0, 2 * mst - (direct > 0 ? direct : 0));

  const row = {
    floor: fi + 1, name: f.name, chapter: f.chapter,
    entry, exit: exit ? { x: exit[0], y: exit[1], ch: exitName } : null,
    direct, V, E, cyclomatic, deadEnds: deg1, cutCount: cuts.size, mainCuts,
    doors, mustMons, keyMax: kr.maxKeys, exitReach, unreachable,
    stats: st, clearDmg: dmg, clearExp: exp, clearGold: gold, monsterCount: mCount,
    wall, heal, atkUp, defUp, breakpoints, nearBp, terms: n, tour,
    mainPath, wings,
  };
  rows.push(row);

  if (JSON_OUT) return;
  const pad = (v, w) => String(v) + ' '.repeat(Math.max(0, w - String(v).length));
  console.log(`\n===== 第 ${fi + 1} 层 ${f.name}（第 ${f.chapter} 章）=====`);
  console.log(`  入口 ${entry ? '(' + entry + ')' : '—'} → 出口 ${exit ? exitName + '(' + exit + ')' : '—'}`
    + `  | 直线 ${direct} 步 | 全清估计 ${tour} 步（放大 ${direct > 0 ? (tour / direct).toFixed(1) : '?'}×）`);
  console.log(`  骨架：${V} 格 / ${E} 边 / 环性 ${cyclomatic} | 死路 ${deg1.length} 个 ${deg1.slice(0, 8).map((p) => '(' + p + ')').join('')}`);
  console.log(`  割点 ${cuts.size} 个 | 卡主路 ${mainCuts.length} 个 ${mainCuts.slice(0, 8).map((p) => '(' + p[0] + ',' + p[1] + ')' + p[2]).join(' ')}`);
  console.log(`  门：${doors.length ? doors.map((d) => `${d.name}(${d.x},${d.y})${d.onPath ? '[主路]' : ''} 门后${d.cells}格/${d.loot}值/${d.mons}怪 ${d.items.join('+') || '空'}`).join('；') : '无'}`);
  console.log(`  必经怪：${mustMons.length ? mustMons.map((m) => m[3] + '(' + m[0] + ',' + m[1] + ')').join(' ') : '无'}`);
  console.log(`  钥匙状态可达：出口${exitReach ? '可达' : '不可达'}（最多同时持 y${kr.maxKeys.y}/r${kr.maxKeys.r}）| 不可达格 ${unreachable.length}`
    + (unreachable.length ? ' ' + unreachable.slice(0, 10).map((u) => u[2] + '(' + u[0] + ',' + u[1] + ')').join('') : ''));
  console.log(`  清层收支（进层 ${st.atk}/${st.def} ${st.hp}hp）：${mCount} 怪 承伤 ${dmg} / 层内回血 ${heal}`
    + ` ⇒ 净 ${dmg - heal >= 0 ? '-' : '+'}${Math.abs(dmg - heal)}（占进层血 ${(dmg / st.hp * 100).toFixed(0)}%）`);
  console.log(`  收益：攻 +${atkUp} 防 +${defUp} 经验 ${exp} 金币 ${gold}${wall.length ? ' | 破不了防：' + wall.join('、') : ''}`);
  console.log(`  攻击临界：${breakpoints.length} 个，最近 3 点内 ${nearBp} 个 `
    + breakpoints.slice(0, 4).map((b) => `${b.name}需${b.need}攻(${b.from}→${b.to}回合)`).join(' '));
  console.log(`  主路 ${mainPath ? mainPath.length : 0} 格：${mainPath ? mainPath.map((p, i) => (i === 0 || i === mainPath.length - 1 ? p.join(',') : '')).filter(Boolean).join(' → ') : '—'}`);
  console.log(`  支翼 ${wings.length} 个：`);
  wings.slice(0, 6).forEach((w) => {
    console.log(`    · 挂(${w.attach ? w.attach.join(',') : '?'}) ${w.cells}格 绕${w.detour}步 → 值${w.loot} ${w.mons}怪 heal${w.heal} exp${w.exp} 金${w.gold} [${w.names.join('+')}]`);
  });
});

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
}
