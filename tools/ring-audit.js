// 锁环收益体检：把每枚环折算成「一局典型收益」，找出重复效果与强弱断层。
// 不参与 regress 闸门（估值模型是粗略换算，靠人读表判断），改锁环后手动跑一次：
//   node tools/ring-audit.js
// 基准来自 sim 标准局：52 杀 / 13 层 / 4 锁匠 / 承伤 19401 / 上限 6779 / 剩 95 金
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;

const B = { kills: 52, floors: 13, bosses: 4, maxHp: 6779, dmg: 19401, events: 8, shops: 5, gold: 95 };
const EMBER_W = 400; // 1 余烬 ≈ 400 等效血（对下一局的投资，粗估）

const rows = [];
const add = (id, type, v, note) => rows.push({ id, name: D.rings[id].name, ch: D.rings[id].chapter, type, v, note });

Object.keys(D.rings).forEach((id) => {
  const d = D.rings[id].desc;
  if (/每击败 10 只怪额外 \+1 余烬，且击杀金币/.test(d)) {
    add(id, '混合', Math.floor(B.kills / 10) * EMBER_W + 200, '5 余烬 + 击杀金币 +15%');
  } else if (/每击败 10 只怪额外 \+1 余烬/.test(d)) {
    add(id, '余烬', Math.floor(B.kills / 10) * EMBER_W, '52 杀 → 5 余烬');
  } else if (/每击败一位章节锁匠，额外 \+2 余烬/.test(d)) {
    add(id, '余烬', B.bosses * 2 * EMBER_W, '4 锁匠 × 2');
  } else if (/每击败一位章节锁匠/.test(d)) {
    add(id, '钥匙', B.bosses * 300, '4 锁匠 × 1 黄');
  } else if (/每击败 8 只怪/.test(d)) {
    add(id, '钥匙', Math.floor(B.kills / 8) * 300, '52 杀 → 6 把黄钥匙');
  } else if (/每上一层额外回复 (\d+)%/.test(d)) {
    const pct = Number(/每上一层额外回复 (\d+)%/.exec(d)[1]);
    add(id, '血量', Math.round(B.floors * pct / 100 * B.maxHp * 0.55), `13 层 × ${pct}%（上限约束取 55%）`);
  } else if (/每上一层回复 (\d+)% 生命/.test(d)) {
    const pct = Number(/每上一层回复 (\d+)% 生命/.exec(d)[1]);
    add(id, '血量', Math.round(B.floors * pct / 100 * B.maxHp * 0.55), `13 层 × ${pct}%（上限约束取 55%）`);
  } else if (/立刻获得 (\d+) 金币/.test(d)) {
    add(id, '金币', Math.round(Number(/立刻获得 (\d+) 金币/.exec(d)[1]) * 1.5), '金币 ≈ 1.5 血/金（换训练）');
  } else if (/2 黄钥匙、1 红钥匙/.test(d)) {
    add(id, '钥匙', 2 * 300 + 1 * 700, '黄 ≈ 300 血、红 ≈ 700 血');
  } else if (/格挡时承伤 ×0\.45/.test(d)) {
    add(id, '减伤', Math.round(B.dmg * 0.10 * 0.30), '每层一次格挡，按差额 10% × 实际用上 30%');
  } else if (/每次击杀回复 ([\d.]+)% 生命/.test(d)) {
    const pct = Number(/每次击杀回复 ([\d.]+)% 生命/.exec(d)[1]) / 100;
    add(id, '血量', Math.round(B.kills * Math.max(2, B.maxHp * pct) * 0.8), `52 杀 × ${(pct * 100).toFixed(1)}%`);
  } else if (/商店价格再 −(\d+)%/.test(d)) {
    add(id, '金币', Math.round(1300 * Number(/−(\d+)%/.exec(d)[1]) / 100), '5 次商店约花 1300 金');
  } else if (/生命上限 \+(\d+)/.test(d)) {
    const v = Number(/生命上限 \+(\d+)/.exec(d)[1]);
    add(id, '血量', v * 2, '上限 + 回血双份');
  } else if (/Boss 战承伤 −(\d+)%/.test(d)) {
    add(id, '减伤', Math.round(B.bosses * 900 * Number(/−(\d+)%/.exec(d)[1]) / 100), '4 场 Boss');
  } else if (/立刻获得窥探之镜/.test(d)) {
    add(id, '信息', 500, '镜的信息价值（估）');
  } else if (/顶栏显示本层还剩几只怪/.test(d)) {
    add(id, '信息', 600, '少走回头路（估）');
  } else if (/顶栏显示本层还剩几件东西没捡/.test(d)) {
    add(id, '信息', 400, '防漏拿（估）');
  } else if (/通关额外 \+(\d+) 余烬/.test(d)) {
    add(id, '余烬', Number(/通关额外 \+(\d+) 余烬/.exec(d)[1]) * EMBER_W, '通关结算（条件奖励按基础值算）');
  } else if (/带走塔心石多 \+100 上限/.test(d)) {
    add(id, '混合', 100 * 2 + 3 * EMBER_W / 2, '二选一');
  } else if (/承伤 −(\d+)%/.test(d)) {
    add(id, '减伤', Math.round(B.dmg * Number(/承伤 −(\d+)%/.exec(d)[1]) / 100), '全场承伤');
  } else if (/药水回复量 \+(\d+)%/.test(d)) {
    const pct = Number(/\+(\d+)%/.exec(d)[1]);
    add(id, '血量', Math.round(10 * 160 * pct / 100), '约 10 瓶 × 160');
  } else if (/钥匙价目 −(\d+)%/.test(d)) {
    add(id, '金币', Math.round(6 * 56 * Number(/−(\d+)%/.exec(d)[1]) / 100), '约 6 把钥匙 × 折扣');
  } else if (/图鉴每新收录 1 件/.test(d)) {
    add(id, '余烬', 2.5 * EMBER_W, '首周目约 3 件');
  } else if (/每次路遇结算后/.test(d)) {
    add(id, '金币', Math.round(B.events * 40 * 1.5), '约 8 个可达路遇');
  } else if (/剩的金币每 100/.test(d)) {
    add(id, '余烬', 2.5 * EMBER_W, '保底 2 + 余钱约 0.5');
  } else if (/每走 100 步，额外获得 (\d+) 金币/.test(d)) {
    const per = Number(/额外获得 (\d+) 金币/.exec(d)[1]);
    add(id, '金币', Math.round(500 / 100 * per * 1.5), '全塔约 500 步 × 1.5 换算');
  } else if (/训练不再越买越贵/.test(d)) {
    add(id, '金币', Math.round(900 * 1.5), '买 10 次训练：阶梯总价 1500 → 600，省 900 金');
  } else if (/生命低于三成，自动回复 (\d+)%/.test(d)) {
    const pct = Number(/自动回复 (\d+)%/.exec(d)[1]) / 100;
    add(id, '血量', Math.round(1.5 * B.maxHp * pct), '一局约触发 1-2 次');
  } else if (/四位锁匠全倒时/.test(d)) {
    add(id, '余烬', 3 * EMBER_W, '四锁匠全倒才给');
  } else if (/每层可以格挡两次/.test(d)) {
    // 第二挡按「整塔约 8 层各多挡一场」估：每场平均承伤 × 45%
    add(id, '减伤', Math.round(8 * (B.dmg / B.kills) * 0.45), '8 层 × 每场均伤 × 45%');
  } else if (/一整层没动用格挡，上楼时 \+(\d+) 金币/.test(d)) {
    // 9 层可结算（第 13 层没有上楼）；实务上后期很难整层不挡，按一半兑现
    const per = Number(/上楼时 \+(\d+) 金币/.exec(d)[1]);
    add(id, '金币', Math.round(9 * 0.5 * per * 1.5), `9 段上楼 × 约五成兑现 × ${per} 金`);
  } else {
    add(id, '?', 0, '未识别：' + d);
  }
});

rows.sort((a, b) => a.v - b.v);
const max = rows[rows.length - 1].v || 1;
console.log('等效收益（血）  环名            章   类型   强度');
rows.forEach((r) => {
  const bar = '█'.repeat(Math.max(1, Math.round(r.v / max * 28)));
  console.log(String(r.v).padStart(6), ' ', r.name.padEnd(7, '　'), 'ch' + r.ch, r.type.padEnd(3, '　'), bar, r.note);
});

// 重复检测：去掉数字后同构的 desc（同效果不同数值 = 档位设计，看是否跨章）
const norm = (s) => String(s).replace(/\d+/g, 'N');
const groups = {};
rows.forEach((r) => { const k = norm(D.rings[r.id].desc); (groups[k] = groups[k] || []).push(r.id); });
const dup = Object.entries(groups).filter(([, ids]) => ids.length > 1);
console.log('\n同构效果组（去数字后相同）：');
if (!dup.length) console.log('  （无）');
dup.forEach(([, ids]) => console.log('  ' + ids.join(' / ') + '  ← ' + D.rings[ids[0]].desc));

const avg = rows.reduce((a, r) => a + r.v, 0) / rows.length;
const weak = rows.filter((r) => r.v < avg * 0.45);
const strong = rows.filter((r) => r.v > avg * 1.9);
console.log(`\n均值 ${Math.round(avg)}`);
console.log(`偏弱(<45%)：${weak.map((r) => `${r.name}(${r.v})`).join('、') || '无'}`);
console.log(`偏强(>190%)：${strong.map((r) => `${r.name}(${r.v})`).join('、') || '无'}`);
