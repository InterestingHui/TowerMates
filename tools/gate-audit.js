// 门禁审计：每一扇门/红门是否真的挡在「主路」或「值得拿的东西」前面。
// 判据（与 check.js 内联的同名断言同源）：
//   ① 把该色门当成墙时，从入口仍能走到上楼 → 这扇门不在主路上（只是绕路代价）；
//   ② 若不在主路，门后必须还有「非门自身」的收益格（道具/怪/遗物/路遇），
//      否则这扇门后面什么都没有 —— 玩家花一把钥匙开了个空气。
// 用法：node tools/gate-audit.js   （有问题退出码 1）
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;
const DOORS = { y: '黄门', r: '红门' };
const REWARD = new Set(['p', 'P', 's', 'd', 'm', 'a', 'b', 'c', 'h', 'k', 'L', '$', 'O', 'S', 'X', 'K', 'Q', 'j', 'v', 'o', '!', '?',
  'M', 'T', 'J', 'u', 'n', '@']);

function bfs(f, from, ban) {
  const seen = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const q = [from];
  seen[from[1]][from[0]] = true;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      if (seen[ny][nx]) continue;
      if (f.map[ny][nx] === '#') continue;
      if (ban && ban.has(nx + ',' + ny)) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return seen;
}

let bad = 0;
D.floors.forEach((f, fi) => {
  const entryCh = fi === 0 ? '@' : 'n';
  let entry = null; let up = null;
  f.map.forEach((row, y) => {
    const a = row.indexOf(entryCh); const b = row.indexOf('u');
    if (a >= 0) entry = [a, y];
    if (b >= 0) up = [b, y];
  });
  if (!entry) return;
  const doors = [];
  f.map.forEach((row, y) => {
    for (let x = 0; x < SIZE; x++) if (DOORS[row[x]]) doors.push({ ch: row[x], x, y });
  });
  if (!doors.length) return;
  const base = bfs(f, entry);
  const keys = { y: 0, r: 0 };
  f.map.forEach((row) => { for (const ch of row) { if (ch === 'k') keys.y++; if (ch === 'L') keys.r++; } });
  console.log(`\n== 第 ${fi + 1} 层 ${f.name} == 门 ${doors.map((d) => d.ch + '(' + d.x + ',' + d.y + ')').join(' ')} 图内钥匙 黄${keys.y}/红${keys.r}`);
  doors.forEach((d) => {
    const ban = new Set([d.x + ',' + d.y]);
    const seen = bfs(f, entry, ban);
    const upOk = up ? !!seen[up[1]][up[0]] : true;
    // 门后（不含门本身）的可达收益
    const behind = [];
    f.map.forEach((row, y) => {
      for (let x = 0; x < SIZE; x++) {
        if (x === d.x && y === d.y) continue;
        if (seen[y][x]) continue;
        const ch = row[x];
        if (ch !== '#') behind.push(ch + '(' + x + ',' + y + ')');
      }
    });
    const loot = behind.filter((s) => REWARD.has(s[0]));
    const onPath = !upOk;
    const ok = onPath || loot.length > 0;
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${DOORS[d.ch]}(${d.x},${d.y}) ${onPath ? '挡在上楼唯一通路上' : '可绕过'} · 门后 ${behind.length} 格（收益 ${loot.length}）：${behind.join(' ') || '—'}`);
  });
});
console.log(bad === 0 ? '\n✓ 门禁审计通过' : `\n✗ ${bad} 扇门后面什么都没有`);
process.exit(bad === 0 ? 0 : 1);
