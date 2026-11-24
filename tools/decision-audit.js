// 决策质量读数（游戏性 焦点C）：把玩家真正能选的地方逐个量化，看有没有「摆着的死按钮」。
// 只读，不改任何东西：跑 sim 取每层入口的真实攻防 → 用引擎同一套承伤公式算每个选项的账。
//
// 用法：node tools/decision-audit.js      基线（跑一遍 sim 主路线取逐层状态）
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const { execSync } = require('child_process');
const path = require('path');

// ---------- 1. 取每层开打时的攻防 ----------
// sim 每层结尾打一行「结束：HP a/b ATK x DEF y ... Lv.n」，那是**下一层**的入口状态。
// 所以第 N 层用第 N−1 层的结尾读数；第 1 层用开局值（atk 10 / def 10 / hp 100）。
const START = { atk: 10, def: 10, hp: 100, lv: 1 };
function floorStats() {
  const out = execSync('node ' + JSON.stringify(path.join(__dirname, 'sim.js')), {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1 << 24,
  });
  const ends = [];
  let cur = null;
  for (const ln of out.split(/\r?\n/)) {
    const t = ln.match(/第\s*(\d+)\s*层\s*(.*?)\s*—/);
    if (t && !ln.includes('结束')) { cur = { floor: Number(t[1]), name: t[2] }; ends.push(cur); }
    const f = ln.match(/结束：HP\s*(\d+)\/\d+\s*ATK\s*(\d+)\s*DEF\s*(\d+).*?Lv\.(\d+)/);
    if (f && cur) { cur.hp = +f[1]; cur.atk = +f[2]; cur.def = +f[3]; cur.lv = +f[4]; }
  }
  // 先滤掉没读到结尾读数的层，再按下标取「上一层结尾」当本层入口——顺序反了会取错层
  const list = ends.filter((e) => e.atk);
  return list.map((e, i) => {
    const prev = i === 0 ? START : list[i - 1];
    return { floor: e.floor, name: e.name, atk: prev.atk, def: prev.def, hp: prev.hp, lv: prev.lv };
  });
}

// ---------- 2. 承伤公式（与 engine.js predictBase 同口径） ----------
// hits = 回合数 − 1（先攻另算），per = (怪攻 − 我防) × 连击系数，魔攻视我防为 0
function dmgOf(m, atk, def) {
  const tr = m.trait || '';
  const out = atk - m.def;
  if (out <= 0) return null;
  const rounds = Math.ceil(m.hp / out);
  const myDef = tr === 'magic' ? 0 : def;
  const per = Math.max(0, m.atk - myDef) * (tr === 'double' ? 1.7 : 1);
  const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
  return { rounds, per, dmg: hits * per, out };
}

// 这一层真有几只怪（按出现次数，不是种类数——同一种怪站在三格上就是三场仗）
function roster(fl) {
  const f = D.floors[fl - 1];
  const list = [];
  for (const row of f.map) for (const ch of row) if (D.monsters[ch] && !D.monsters[ch].ghost) list.push(ch);
  return list;
}

// ---------- 3. 打法四选的边界 ----------
// 集中挡：这一场 ×BLOCK，其余照常 → 全层承伤 = BLOCK·Di + (S − Di)
// 摊平架盾：每一场都 ×SPREAD          → 全层承伤 = SPREAD·S
// 架盾更优 ⇔ SPREAD·S < BLOCK·Di + S − Di ⇔ (1−SPREAD)·S > (1−BLOCK)·Di ⇔ S > (1−BLOCK)/(1−SPREAD)·Di
const BLOCK = 0.55, BLOCK2 = 0.42, SPREAD = 0.85;

function playStyleRows(stats) {
  const rows = [];
  for (const st of stats) {
    const chars = roster(st.floor);
    const ds = chars.map((ch) => ({ ch, name: D.monsters[ch].name, ...dmgOf(D.monsters[ch], st.atk, st.def) }))
      .filter((x) => x.dmg !== null);
    if (!ds.length) { rows.push({ floor: st.floor, name: st.name, chars, ds, note: '无可战怪' }); continue; }
    const S = ds.reduce((a, b) => a + b.dmg, 0);
    // 每只怪轮到它当「当前这一场」时，架盾比集中挡省下多少血（正 = 架盾更优）
    // 集中挡全层 = BLOCK·Di + (S − Di)；摊平架盾全层 = SPREAD·S ⇒ 差值 = S·(1−SPREAD) − Di·(1−BLOCK)
    const gains = ds.map((d) => ({ ...d, gain: Math.round((S * (1 - SPREAD)) - (d.dmg * (1 - BLOCK))) }));
    const best = gains.reduce((a, b) => (b.gain > a.gain ? b : a));
    // 换盾谱（0.42）后同一层的最优解会不会翻
    const bestWithBook = gains.map((b) => ({ ...b, gain: Math.round((S * (1 - SPREAD)) - (b.dmg * (1 - BLOCK2))) }))
      .reduce((a, b) => (b.gain > a.gain ? b : a));
    rows.push({ floor: st.floor, name: st.name, ds: gains, S, best, bestWithBook });
  }
  return rows;
}

// ---------- 4. 商店：每一档训练的每金币边际减伤 ----------
// 同一层里 +2 攻 / +2 防 分别让这层承伤掉多少，再折算成「每 60 金」
function shopRows(stats) {
  const rows = [];
  for (const st of stats) {
    const chars = roster(st.floor);
    const base = chars.reduce((a, ch) => a + (dmgOf(D.monsters[ch], st.atk, st.def)?.dmg || 0), 0);
    const up = chars.reduce((a, ch) => a + (dmgOf(D.monsters[ch], st.atk + 2, st.def)?.dmg || 0), 0);
    const df = chars.reduce((a, ch) => a + (dmgOf(D.monsters[ch], st.atk, st.def + 2)?.dmg || 0), 0);
    rows.push({ floor: st.floor, name: st.name, base: Math.round(base),
      atkCut: Math.round(base - up), defCut: Math.round(base - df) });
  }
  return rows;
}

// ---------- 4b. 缠斗：多挨一轮换这一战经验翻倍 ----------
// 兑换率 = 怪的经验 ÷ 多挨的那一轮承伤（per）。封顶后这条链断了（tangleInfo 已在引擎里滤掉）
function tangleRows(stats) {
  const rows = [];
  for (const st of stats) {
    const chars = roster(st.floor);
    const list = chars.map((ch) => ({ ch, m: D.monsters[ch] }))
      .filter((x) => x.m.exp > 0)
      .map((x) => {
        const d = dmgOf(x.m, st.atk, st.def);
        return d ? { name: x.m.name, per: Math.round(d.per), exp: x.m.exp, rate: d.per > 0 ? x.m.exp / d.per : Infinity } : null;
      })
      .filter(Boolean);
    if (!list.length) continue;
    const best = list.reduce((a, b) => (b.rate > a.rate ? b : a));
    const worst = list.reduce((a, b) => (b.rate < a.rate ? b : a));
    const need = st.lv && st.lv - 1 < D.levelExp.length ? D.levelExp[st.lv - 1] : null;
    rows.push({ floor: st.floor, name: st.name, lv: st.lv, best, worst, need });
  }
  return rows;
}

// ---------- 5. 立誓 ----------
// reward 是结算倍率档（data.js 按实测难度升序给），不是分数本身
function vowRows() {
  return Object.values(D.vows || {}).map((v) => ({ name: v.name, reward: v.reward, desc: v.desc || '' }));
}

// ---------- 输出 ----------
const stats = floorStats();
if (!stats.length) { console.log('未取到 sim 逐层状态（可用 --no-sim 走快照）'); process.exit(2); }

console.log('=== 打法：架盾 vs 集中挡（正数 = 架盾更省血）===');
console.log('层  名称        本层怪  全层承伤   架盾最优场景（当前这场）        省血   判读');
const style = playStyleRows(stats);
// 活按钮里的死按钮：引擎的 canGuard 只在「本层至少 2 只怪」时才把架盾摆出来，
// 所以单怪层的「恒劣」是设计内的隐藏，不算问题。
let guardDead = [];
for (const r of style) {
  if (r.note) { console.log(String(r.floor).padEnd(3) + r.name.padEnd(13) + '—'); continue; }
  const b = r.best;
  const offered = r.ds.length >= 2;
  if (b.gain < 0 && offered) guardDead.push(r);
  const verdict = b.gain < 0 ? (offered ? '架盾恒劣' : '架盾恒劣（单怪层，按钮本来就隐藏）')
    : b.gain === 0 ? '打平' : '架盾更优（当前这场：' + b.name + '）';
  console.log(
    String(r.floor).padEnd(3) + r.name.padEnd(14) +
    String(r.ds.length).padEnd(7) + String(r.S).padEnd(10) +
    (b.name + `(${b.ch})`).padEnd(30) +
    String(b.gain).padStart(5) + '  ' + verdict +
    (r.bestWithBook && r.bestWithBook.gain < 0 ? ' / 学了盾谱恒劣' : '')
  );
}

console.log('\n=== 商店：60 金买 2 攻 vs 2 防（本层承伤降幅）===');
const shopTbl = shopRows(stats);
for (const r of shopTbl) {
  const win = r.atkCut > r.defCut ? '攻' : r.atkCut < r.defCut ? '防' : '平';
  console.log(`第 ${String(r.floor).padStart(2)} 层 ${r.name.padEnd(12)} 本层承伤 ${String(r.base).padStart(6)}  +2攻 −${String(r.atkCut).padStart(5)}  +2防 −${String(r.defCut).padStart(5)}  → ${win}`);
}
console.log(`→ 同价 60 金：攻胜 ${shopTbl.filter((r) => r.atkCut > r.defCut).length}/${shopTbl.length} 层，防胜 ${shopTbl.filter((r) => r.defCut > r.atkCut).length} 层`);

console.log('\n=== 缠斗：多挨一轮换经验 ×2（兑换率 = 经验 ÷ 多挨的血）===');
for (const r of tangleRows(stats)) {
  console.log(`第 ${String(r.floor).padStart(2)} 层 ${r.name.padEnd(12)} Lv.${String(r.lv).padStart(2)}  最划算 ${r.best.name} 1血=${r.best.rate.toFixed(2)}经验` +
    `  最差 ${r.worst.name} 1血=${r.worst.rate.toFixed(2)}经验` + (r.need ? `  本级缺口 ${r.need}` : '  已封顶'));
}

if (vowRows().length) {
  console.log('\n=== 立誓（结算倍率档 reward，按实测难度升序）===');
  for (const v of vowRows()) console.log(`${v.name}  reward ${v.reward}  ${v.desc.slice(0, 28)}`);
}

console.log('\n=== 结论 ===');
if (guardDead.length) {
  console.log('死按钮：' + guardDead.map((r) => `第${r.floor}层(${r.ds.length}只)`).join('、') +
    ' —— 这一层的架盾在任何一场都比集中挡差，按钮摆着只有教学意义。');
} else {
  console.log('架盾在每一个「会摆出按钮的层」都有正收益场景，不构成死按钮。');
}
