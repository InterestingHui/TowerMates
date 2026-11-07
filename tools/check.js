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
  // 密道层（3、5，0 起）是支线：只有 n 没有 u，进入后回头下楼返回第 4 层
  const isSide = fi === 3 || fi === 5;
  if (!isSide && fi < D.floors.length - 1 && counts['u'] !== 1) err(`应有且仅有 1 个上楼 u（实际 ${counts['u'] || 0}）`);
  if (isSide && counts['u']) err('密道层不应有上楼');
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

console.log(bad === 0 ? '\n✓ 地图校验通过' : `\n✗ 共 ${bad} 个问题`);
process.exit(bad === 0 ? 0 : 1);
