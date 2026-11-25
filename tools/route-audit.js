// 路线审计（游戏性 焦点C）：把「全清拿余烬」与「避战拿决战余裕 S」这两条长期激励放在同一张表上，
// 回答一个挂了很久的问题——它们是不是**必须二选一**。
//
// 为什么要有这个工具：2026-11-25 13:2x 的诊断只凭一条读法（默认全清 68.4% = A 档、避战 76.7% = S 档）
// 就写下「两个目标在同一次通关里互斥」，待办挂了 12 天没人敢动数值。真相是 sim 有多种加点口味，
// 只看一档会把「这一条策略拿不到 S」误读成「这条路拿不到 S」。
//
// 口径（只算与路线相关的两项，其余余烬项与路线无关）：
//   击杀项 = floor(kills / 10)        —— 引擎 emberModel 的「击杀 N 只」
//   余裕项 = 终局血 ≥70% ? +2 : 0      —— 引擎 emberModel 的「决战余裕 S」
// 用法：node tools/route-audit.js            （只读，不改任何东西）
//       node tools/route-audit.js --assert   给闸门用：四条断言，失败退出码 1
global.window = global;
const { execSync } = require('child_process');
const path = require('path');
const ASSERT = process.argv.includes('--assert');

const ROUTES = [
  { id: 'clear-atk', label: '全清·全攻', args: [], note: '默认基线' },
  { id: 'clear-mixed', label: '全清·均衡', args: ['--train=mixed'], note: '攻防 2:1 轮换' },
  { id: 'clear-def', label: '全清·全防', args: ['--train=def'], note: '极端口味' },
  { id: 'skip', label: '避战', args: ['--skip-fights'], note: '只打必经的怪' },
];

// sim 的末段读数：「真实终局（打完碑魔）：4490/6562（68.4%）」+「… 击杀 52」
// 注意：总承伤那行里的百分比是「买药之后」的口径，与难度基准不同源，别拿来判档。
function runSim(args) {
  const cmd = 'node ' + JSON.stringify(path.join(__dirname, 'sim.js')) + ' ' + args.join(' ');
  const out = execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 24 });
  const won = /通关成功/.test(out);
  const m = out.match(/真实终局（打完碑魔）：\d+\/\d+（([\d.]+)%）/);
  const k = out.match(/击杀\s*(\d+)/);
  if (!m || !k) return { won, pct: null, kills: null };
  return { won, pct: Number(m[1]), kills: Number(k[1]) };
}

// 门槛只有这一处：S 档 ≥70% 与引擎 battleMargin 同源；「满击杀项」按 emberModel 的 floor(kills/10) 反推
// ——要拿到 5 项就得 50 杀，别用 48 这种顺手数（写的时候就从「51 杀减一点」拍了个 48，正好是错的）。
const S_PCT = 70;
const FULL_KILL_EMBER = 5;
const FULL_KILLS = FULL_KILL_EMBER * 10;
const grade = (pct) => (pct >= S_PCT ? 'S' : pct >= 50 ? 'A' : pct >= 30 ? 'B' : 'C');
const rows = ROUTES.map((r) => {
  const s = runSim(r.args);
  return Object.assign({}, r, s, {
    killEmber: s.kills == null ? 0 : Math.floor(s.kills / 10),
    marginEmber: s.pct != null && s.pct >= S_PCT ? 2 : 0,
  });
});

const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));
console.log('=== 路线：全清拿余烬 vs 避战拿决战余裕 S（路线相关余烬 = 击杀项 + 余裕项）===');
console.log(pad('路线', 12) + pad('通关', 6) + pad('击杀', 6) + pad('终局血%', 9) + pad('余裕', 6) + pad('击杀项', 8) + pad('余裕项', 8) + pad('路线余烬', 9) + '备注');
for (const r of rows) {
  const read = r.pct == null || r.kills == null;
  console.log(pad(r.label, 12) + pad(r.won ? '✓' : '✗', 6) + pad(read ? '—' : r.kills, 6)
    + pad(read ? '读数失败' : r.pct + '%', 9) + pad(read ? '—' : grade(r.pct), 6)
    + pad(read ? '—' : '+' + r.killEmber, 8) + pad(read ? '—' : '+' + r.marginEmber, 8)
    + pad(read ? '—' : '+' + (r.killEmber + r.marginEmber), 9) + r.note);
}

const both = rows.filter((r) => r.kills != null && r.kills >= FULL_KILLS && r.pct >= S_PCT);
const lost = rows.filter((r) => !r.won);
const clear = rows.filter((r) => r.id.indexOf('clear-') === 0);
const clearKills = new Set(clear.map((r) => r.kills));
const skipRow = rows.find((r) => r.id === 'skip');

if (!ASSERT) {
  console.log('\n=== 结论 ===');
  if (lost.length) {
    console.log('✗ 未通关的路线：' + lost.map((r) => r.label).join('、') + ' —— 先查数值，不要拿去比余烬。');
  }
  if (both.length) {
    console.log(`两条激励**不互斥**：${both.map((r) => `${r.label}（${r.kills} 杀 · ${r.pct}% · 余烬 +${r.killEmber + r.marginEmber}）`).join('、')}`
      + ' 在同一次通关里同时拿到了满击杀项与决战余裕 S。');
    console.log('⇒ 待办「余烬按击杀 / S 档按避战互斥」按此读数关闭；改数值没有依据。');
  } else {
    console.log(`两条激励**确实互斥**：没有任何一种加点口味能同时拿到「击杀项满（≥${FULL_KILLS} 杀）」与「余裕 S」。`
      + ' 处置见 PROGRESS 待办里的三档修法。');
  }
  process.exit(0);
}

// ---- 断言模式（闸门用）：每一条都要能独立回答「凭什么」 ----
const checks = [
  ['四条路线都通关', lost.length === 0, lost.map((r) => r.label).join('、') || '全部通关'],
  ['存在一条路线同局兼得满击杀项与余裕 S', both.length > 0,
    both.map((r) => `${r.label} ${r.kills}杀/${r.pct}%`).join('、') || '没有任何路线兼得'],
  // 加点只改战力，不该改路线：三种加点若击杀数不一，说明 sim 的路线本身被战力牵着跑，
  // 那「全清」就不是一个可以用加点调味的固定策略，下面两条断言的说服力也得重算。
  ['三种「全清」加点的击杀数一致', clearKills.size === 1, [...clearKills].join(' / ')],
  ['避战确实少打（击杀数明显低于全清）', !!skipRow && skipRow.kills < Math.min.apply(null, clear.map((r) => r.kills)),
    `避战 ${skipRow ? skipRow.kills : '?'} 杀 vs 全清 ${[...clearKills].join('/')} 杀`],
];
let bad = 0;
for (const [name, pass, detail] of checks) {
  if (!pass) bad++;
  console.log((pass ? '✓' : '✗') + ' ' + name + '：' + detail);
}
if (bad) {
  console.log(`\n✗ 路线审计 ${bad}/${checks.length} 条不通过`);
  process.exit(1);
}
console.log(`\n✓ 路线审计 ${checks.length}/${checks.length} 条通过`);
