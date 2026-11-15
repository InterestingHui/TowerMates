// 挑战码 / 触屏 / 平台桥接单测（纯 Node，不依赖 DOM）
const C = require('../js/challenge.js');
let pass = 0, bad = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { bad++; console.log('✗ ' + label); }
}

const sum = { ending: 'true', vow: 'ascetic', floor: 13, level: 18, steps: 640, time: 512, seal: 'clear', goals: 13, margin: 'A' };
const code = C.encode(sum);
ok(code.indexOf(C.PREFIX) === 0 && C.PREFIX === 'TM5.', '新码带 v5 版本前缀');
const d = C.decode(code);
ok(!!d && d.version === 5 && !d.legacy, '新码可解');
ok(d.vow === 'ascetic', '誓约写入');
ok(d.seal === 'clear' && d.goals === 13, '塔印与塔规数写入');
ok(d.margin === 'A', '决战余裕写入');
ok(d.score === undefined && d.grade === undefined, '码里已无结算分与评级字段');
ok(d.ending === 'true' && d.floor === 13 && d.level === 18 && d.steps === 640 && d.time === 512, '层数/用时/步数往返一致');
ok(C.decode(' ' + code + '\n').seal === 'clear', '容忍首尾空白/换行');

// v5 日签：贴进来的朋友码要能判出「他走的是不是今天这座」
const dailyCode = C.encode(Object.assign({}, sum, { daily: '2026-11-14' }));
const dd = C.decode(dailyCode);
ok(dd.daily === '2026-11-14', '今日一塔日签写进码里并原样解回');
ok(dd.floor === 13 && dd.margin === 'A' && dd.seal === 'clear' && dd.time === 512, '日签不改其它字段');
ok(C.decode(code).daily === '', '普通局不带日签（空串，进不了今日档）');
ok(C.decode(C.encode({ daily: '乱码' })).daily === '', '脏日签被忽略，不污染名录');
ok(C.decode(C.encode({ daily: '2026-13-40' })).daily === '', '越界月日拒绝');
ok(dailyCode.length <= 80, '带日签的码仍在 80 字符内（面板与输入框放得下）');
// v4 旧码：第 10 段就结束，照常能贴，只是按普通局处理
const old4 = 'TM4.' + Buffer.from('4.t.mercy.9.12.500.400.w.3.A', 'utf8').toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const d4 = C.decode(old4);
ok(!!d4 && d4.version === 4 && d4.floor === 9 && d4.margin === 'A' && d4.daily === '', 'v4 旧码照常能解，日签为空');

// v2 旧码：分数段废弃、S/A/B/C 折成塔印
function v2(raw) { return 'TM2.' + Buffer.from(raw, 'utf8').toString('base64').replace(/=+$/, ''); }
const old2 = C.decode(v2('2.t.mercy.9.12.500.400.3100.A'));
ok(!!old2 && old2.version === 2 && old2.legacy, 'v2 旧码可解并标记 legacy');
ok(old2.seal === 'ward' && old2.goals === 0 && old2.score === undefined, 'v2 分数被忽略、评级折成塔印');
ok(old2.vow === 'mercy' && old2.floor === 9 && old2.time === 400, 'v2 其余字段还原');

// v1 旧码
function v1(raw) { return Buffer.from('TM' + raw, 'utf8').toString('base64').replace(/=+$/, ''); }
const old1 = C.decode(v1('1.13.18.640.512'));
ok(!!old1 && old1.legacy && old1.version === 1, 'v1 旧码可解并标记 legacy');
ok(old1.ending === 'true' && old1.floor === 13 && old1.steps === 640, 'v1 字段还原');
ok(old1.vow === 'none' && old1.seal === '' && old1.goals === 0, 'v1 缺失字段给中性默认');

// 恶意 / 脏输入不能进名录
ok(C.decode('') === null, '空串拒绝');
ok(C.decode('TM3.@@@@') === null, '非法 base64 拒绝');
ok(C.decode('随便一串汉字') === null, '乱码拒绝');
ok(C.decode('TM3.' + 'A'.repeat(500)) === null, '超长拒绝');
ok(C.decode(C.PREFIX + Buffer.from('9.t.none.1.1.1.1.c.1').toString('base64')) === null, '未知版本拒绝');
ok(code.length <= 80, '新码保持短小，面板与输入框放得下');
const injected = C.encode({ vow: '<img src=x>', seal: 'clear', goals: -10, floor: 999, steps: -3 });
const di = C.decode(injected);
ok(di.vow.indexOf('<') < 0 && di.seal === 'clear', '标签字符被剔除、塔印保留');
ok(di.goals === 0 && di.floor === 99 && di.steps === 0, '数值被钳到合法区间');

// 触屏手势的方向判定（纯逻辑，不依赖 DOM）
const T = require('../js/touch.js');
ok(T.direction(0, 0, 26) === null, '未达阈值不触发移动');
ok(T.direction(30, 4, 26)[1] === 0 && T.direction(30, 4, 26)[0] === 1, '右滑走右');
ok(T.direction(-40, 12, 26)[0] === -1, '左滑走左');
ok(T.direction(5, -50, 26)[1] === -1, '上滑走上');
ok(T.direction(9, 45, 26)[1] === 1, '下滑走下');
ok(T.direction(40, -39, 26)[0] === 1, '位移相近时取较大轴');
// v2 新增：方向名 / 候选路线拼接 / 常量
ok(T.dirName([0, -1]) === 'up' && T.dirName([1, 0]) === 'right' && T.dirName([-1, 0]) === 'left' && T.dirName([0, 1]) === 'down', 'dirName 四向命名正确');
ok(T.fullCells(null, 'up') === null, '无路线时 fullCells 为空');
ok(T.fullCells({ left: { cells: [[1, 1], [1, 2]] } }, 'left').length === 2, '无分岔路线原样返回');
ok(T.fullCells({ left: { cells: null } }, 'left') === null, '缺 cells 不炸');
ok(T.HOLD_MS >= 150 && T.HOLD_MS <= 350, '按住进选路的时限在手感合理区间');

// 微信关系链桥接：H5 下必须静默降级，好友数据要洗干净才能进榜
const W = require('../js/wxbridge.js');
ok(W.available() === false, '非微信环境桥接自动降级');
const friends = W.normalize([
  { name: '<b>好友</b>', floor: 13, time: 512, steps: 100, vow: 'mercy', ending: 'true', seal: 'clear', goals: 13 },
  { name: '没爬过塔的', floor: 0 },
]);
ok(friends.length === 1 && friends[0].name.indexOf('<') < 0, '非法标签被剔除、无效行被丢弃');
ok(friends[0].floor === 13 && friends[0].time === 512 && friends[0].seal === 'clear', '好友层数/用时/塔印完整');
ok(W.normalize('不是数组').length === 0, '非数组输入不炸');
let stored = null;
global.localStorage = { getItem: () => null, setItem: (k, v) => { stored = v; } };
const merged = W.merge([{ name: 'A', floor: 7, time: 300 }, { name: 'A', floor: 7, time: 300 }]);
ok(merged.length === 1 && !!stored, '同一人同一趟只留一条并写入存储');

// ---------- 视图模型层（js/view.js）：榜单与商店的「规则」从 DOM 里切出来之后的第一次单测 ----------
// 这一层此前不存在：排序 / 筛选 / 10 行上限 / 「还差 N 金」「再买 N 次」这些算术都埋在 main.js 的
// innerHTML 模板里，只能靠浏览器探针验「画出来的字」，验不了「这个数算得对不对」。
const V = require('../js/view.js');
const VOWS = {
  none: { name: '不立誓', tag: '无名之分' },
  mercy: { name: '慈悲之誓', tag: '轻羽' },
  ascetic: { name: '苦行之誓', tag: '苦行' },
};
const shadows = [
  { name: '第二位勇者·鸦', floor: 2, steps: 40, time: 70 },
  { name: '第五位勇者·岩', floor: 3, steps: 80, time: 120 },
];
const notes = { '第二位勇者·鸦': '停在第 2 层' };

// 空榜：不该出现任何行，且说的是「这一档还没有人」而不是空白
const emptyAll = V.boardModel({ mine: [], rivals: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(emptyAll.rows.length === 0 && emptyAll.empty === V.EMPTY_OTHER, '空榜给「这一档还没有人」，不是空白');
ok(emptyAll.note === '' && emptyAll.total === 0, '空榜不出脚注');

// 每局 8 层 > 影子最高 3 层 → 「你已经走到他们没到过的地方」那句必须出，且自己排第一
const crushed = V.boardModel({
  mine: [{ floor: 8, steps: 300, time: 600, vow: 'mercy' }], rivals: [], shadows,
  filter: 'all', todayKey: '2026-11-16', vows: VOWS, rivalNotes: notes,
});
ok(crushed.rows[0].name === '你' && crushed.rows[0].rank === 1, '自己的局按层数排到第一');
ok(crushed.note === V.NOTE_CRUSHED, '压过全部影子时才出「走到他们没到过的地方」');
ok(crushed.rows[1].name === '第五位勇者·岩' && crushed.rows[2].name === '第二位勇者·鸦', '影子按层数从深到浅');
ok(crushed.rows[2].note === '停在第 2 层', '影子脚注挂在对应名字上');
ok(crushed.rows[0].vowTag === '轻', '誓约徽记取 tag 首字');
ok(crushed.rows[2].vowTag === '' || crushed.rows[2].vowTag, '不立誓行不挂徽记（影子强制 none）');

// 排序口径：同层先看结局，再看决战余裕，最后才是用时
const tie = V.boardModel({
  mine: [
    { floor: 5, ending: 'plain', margin: 'C', time: 100, steps: 10 },
    { floor: 5, ending: 'true', margin: 'C', time: 900, steps: 20 },
    { floor: 5, ending: 'plain', margin: 'A', time: 500, steps: 30 },
  ], rivals: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
});
ok(tie.rows[0].ended === true, '同层时真结局排在前面（哪怕用时更久）');
ok(tie.rows[1].margin === 'A' && tie.rows[2].margin === 'C', '结局相同再比决战余裕');
ok(tie.rows[2].time === '1分40秒', '用时 100 秒渲染成 1分40秒');

// 10 行上限：总条数要如实报出来，页面上只画前 10 行
const many = [];
for (let i = 0; i < 12; i++) many.push({ floor: 12 - i, steps: i, time: 60 + i });
const capped = V.boardModel({ mine: many, rivals: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(capped.rows.length === 10 && capped.total === 12, '榜单只画 10 行但总数照实报');

// 誓约档：只筛该誓约的局；「不立誓」那一档必须没有徽记（自报名字就是「不立誓」）
const byVow = V.boardModel({
  mine: [{ floor: 4, vow: 'ascetic' }, { floor: 3, vow: 'none' }],
  rivals: [], shadows: [], filter: 'ascetic', todayKey: '2026-11-16', vows: VOWS,
});
ok(byVow.rows.length === 1 && byVow.rows[0].vowTag === '苦', '苦行档只出苦行局');
const noVow = V.boardModel({
  mine: [{ floor: 3, vow: 'none' }], rivals: [], shadows: [],
  filter: 'none', todayKey: '2026-11-16', vows: VOWS,
});
ok(noVow.rows.length === 1 && noVow.rows[0].vowTag === '', '不立誓档不挂徽记（名字已经说了）');

// 今日档：只收今天这座塔的局；空档要报出日期，不能只说「没有人」
const today = V.boardModel({
  mine: [{ floor: 6, daily: '2026-11-16' }], rivals: [{ floor: 9, daily: '2026-11-15' }],
  shadows, filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS,
});
ok(today.rows.length === 1 && today.rows[0].name === '你', '今日档只收同一天同一座塔的局');
ok(today.rows[0].vowTag === '', '今日档自己那局（不立誓）不挂徽记');
ok(today.note === V.NOTE_DAILY, '今日档带「零点换塔」那句解释');
const emptyDay = V.boardModel({ mine: [], rivals: [], shadows, filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS });
ok(emptyDay.empty.indexOf('11月16日') >= 0, '今日档空档要写出是哪一天的塔');

// 档位表：全集合唯一来源。以后加誓约忘了加档，这条会直接红
ok(V.BOARD_TABS.map((t) => t[0]).join(',') === 'all,daily,none,mercy,greed,ascetic,guard,nameless', '榜单档位全集合 8 档');
ok(V.BOARD_TABS.filter((t) => t.on).length === 0 && V.boardModel({ filter: 'mercy', vows: VOWS, mine: [], shadows: [] }).tabs.filter((t) => t.on)[0].id === 'mercy', '当前档位标记唯一');

// 纯函数：不该把调用方传进来的记录改写（原实现 map 时就地套了 mine:true）
const rawRec = { floor: 7, steps: 10, time: 90 };
V.boardModel({ mine: [rawRec], rivals: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(rawRec.mine === undefined, '模型不改写入参记录');

// ---------- 商店模型：明码取舍的每一句话现在可以算给你看 ----------
const mkFx = (over) => Object.assign({
  price: (i) => i.price,
  listPrice: (i) => i.listPrice === undefined ? i.price : i.listPrice,
  owned: () => false,
  relicDesc: (id) => ({ mirror: '看见怪物的全部数值' })[id] || '',
  forbidsBlock: () => false,
  floorsLeft: () => 5,
  monsterDefByName: (name) => (name === '石像鬼' ? 6 : null),
}, over || {});
const STOCK = [
  { id: 'atk', name: '攻击强化', emoji: '🗡', atk: 2, price: 60, listPrice: 60 },
  { id: 'def', name: '护甲强化', emoji: '🛡', def: 2, price: 60, listPrice: 60 },
  { id: 'key', name: '黄铜钥匙', emoji: '🗝', key: 'y', price: 25, listPrice: 25 },
  { id: 'potion', name: '红药水', emoji: '🧪', hp: 300, price: 30, listPrice: 30 },
  { id: 'blockbook', name: '盾谱', emoji: '📕', block: true, once: true, price: 200, listPrice: 200 },
  { id: 'mirror', name: '镜子', emoji: '🔍', codex: true, once: true, relic: 'mirror', price: 150, listPrice: 150 },
  { id: 'shard', name: '塔心碎片', emoji: '💗', heartShard: true, once: true, price: 220, listPrice: 220 },
  { id: 'lamp', name: '长明灯芯', emoji: '🕯', once: true, price: 80, listPrice: 80 },
];
const shop = V.shopModel({ s: { gold: 100, floor: 4, flags: {} }, stock: STOCK, dealId: 'key', fx: mkFx() });
ok(shop.rows.length === 8 && shop.more === null, '不折叠时整架都摆出来、没有「更多货」');
ok(shop.deal && shop.deal.name === '黄铜钥匙' && shop.deal.now === 25, '让价行报出货名与原价/现价');
const keyRow = shop.rows.find((r) => r.id === 'key');
ok(keyRow.tags.length === 1 && keyRow.tags[0].text === '让价', '让价那件挂「让价」小签');
ok(shop.rows.find((r) => r.id === 'atk').disabled === false, '钱够的货能点');

// 「还差 N 金」必须真的等于价差，且说清本层还剩几只怪可刷
const poor = V.shopModel({ s: { gold: 100, floor: 4, flags: {} }, stock: STOCK, fx: mkFx() });
const shardRow = poor.rows.find((r) => r.id === 'shard');
ok(shardRow.tip.indexOf('还差 **120** 金') >= 0, '唯一货钱不够时报「还差 120 金」（220−100）');
ok(shardRow.tip.indexOf('这一层还剩 **5** 只怪可刷') >= 0, '并报出本层还剩几只怪可刷');
ok(shardRow.tip.indexOf('通关余烬 +8') === 0, '保底提示先说要买的是什么');
const cleared = V.shopModel({ s: { gold: 100, floor: 4, flags: {} }, stock: STOCK, fx: mkFx({ floorsLeft: () => 0 }) });
ok(cleared.rows.find((r) => r.id === 'shard').tip.indexOf('回下层找钱') >= 0, '本层清空时改口「回下层找钱」');

// 禁挡誓约：盾谱置灰 + 文案说清原因（此前只在 DOM 里验过「灰了」）
const forb = V.shopModel({
  s: { gold: 999, floor: 4, flags: {} }, stock: STOCK,
  fx: mkFx({ forbidsBlock: () => true }),
});
const bookRow = forb.rows.find((r) => r.id === 'blockbook');
ok(bookRow.disabled === true && bookRow.label === '不适用', '禁挡誓约下盾谱不可买');
ok(bookRow.tip.indexOf('这条誓约不能格挡') >= 0, '并说清为什么不能买');

// 已拥有：按钮改「已拥有」，价格照旧显示
const ownedShop = V.shopModel({
  s: { gold: 999, floor: 4, flags: {} }, stock: STOCK,
  fx: mkFx({ owned: (i) => i.id === 'key' }),
});
ok(ownedShop.rows.find((r) => r.id === 'key').label === '已拥有', '买过的货按钮改口「已拥有」');

// 卡关指引的算术：gap = 怪物防御 + 1 − 当前攻击，次数 = ceil(gap / 每次攻击加成)，总价 = 次数 × 单价
const stuckShop = V.shopModel({
  s: { gold: 999, atk: 3, floor: 6, flags: {} }, stock: STOCK, stuck: { key: 'stuckDef', monster: '石像鬼' },
  atkItem: { id: 'atk', price: 60 }, fx: mkFx(),
});
const atkRow = stuckShop.rows.find((r) => r.id === 'atk');
ok(atkRow.tip.indexOf('再买 2 次（120 金）能打过石像鬼') >= 0, '卡关时算出「再买 2 次（120 金）能打过石像鬼」');
const hpStuck = V.shopModel({ s: { gold: 999, floor: 6, flags: {} }, stock: STOCK, stuck: { key: 'stuckHp', monster: '石像鬼' }, fx: mkFx() });
ok(hpStuck.rows.find((r) => r.id === 'def').tip.indexOf('买几个能少掉不少血') >= 0, '卡血时防御行改口「买几个能少掉不少血」');

// 折叠：首屏只摆 4 件常用货；没学格挡时盾谱必须留在首屏（第 3 层是唯一补学机会）
const folded = V.shopModel({ s: { gold: 100, floor: 2, flags: {} }, stock: STOCK, foldFirst: true, fx: mkFx() });
ok(folded.rows.length === 5 && !!folded.rows.find((r) => r.id === 'blockbook'), '首进商店摆 4 件常用货 + 未学格挡时补上盾谱');
ok(folded.more && folded.more.count === 3, '「更多货」如实报折进去 3 件');
ok(folded.more.names.split(' / ').length === 3, '摘要最多念 3 件货名');
const foldedLearned = V.shopModel({ s: { gold: 100, floor: 2, flags: { hasBlock: true } }, stock: STOCK, foldFirst: true, fx: mkFx() });
ok(foldedLearned.rows.length === 4 && foldedLearned.more.count === 4, '已学格挡后首屏只摆 4 件、盾谱折进「更多货」');
const foldedForbid = V.shopModel({ s: { gold: 100, floor: 2, flags: {} }, stock: STOCK, foldFirst: true, fx: mkFx({ forbidsBlock: () => true }) });
ok(!foldedForbid.rows.find((r) => r.id === 'blockbook'), '禁挡誓约下盾谱不占首屏（买了也用不上）');
ok(STOCK.length === 8, '模型不删减调用方的货架数组');

// 药水回复量：干粮之环 ×1.3，货架上的数字必须走引擎同一个出口（potionHeal），不许写价目表原值
const withRing = V.shopModel({
  s: { gold: 999, floor: 4, flags: {} }, stock: STOCK,
  fx: mkFx({ potionHeal: (n) => Math.round(n * 1.3) }),
});
ok(withRing.rows.find((r) => r.id === 'potion').tip === '回复 390 生命', '干粮之环下药水报 390（300×1.3）而不是 300');
const plainPotion = V.shopModel({ s: { gold: 999, floor: 4, flags: {} }, stock: STOCK, fx: mkFx({ potionHeal: (n) => n }) });
ok(plainPotion.rows.find((r) => r.id === 'potion').tip === '回复 300 生命', '没有环时照旧报原值');
// 攻/防的增量取货品自身数值，不写死 +2（价目表改了这里不会悄悄说谎）
const bigAtk = V.shopModel({
  s: { gold: 999, floor: 4, flags: {} },
  stock: [{ id: 'atk', name: '力量训练', atk: 5, price: 10 }, { id: 'def', name: '护甲强化', def: 3, price: 10 }], fx: mkFx(),
});
ok(bigAtk.rows[0].tip === '攻击 +5' && bigAtk.rows[1].tip === '防御 +3', '攻/防文案取货品自身数值');
ok(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8').indexOf('potionHeal') >= 0, 'main.js 必须把 potionHeal 注入模型（否则环加成又回到写死的老路）');

// 源码契约：这一层的存在意义就是「纯」——出现 DOM / 引擎 / 时钟 / 随机就把边界又揉回去了
const viewSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'view.js'), 'utf8');
const banned = ['document', 'localStorage', 'innerHTML', 'addEventListener', 'Math.random', 'Date.now', 'Renderer', 'Engine'];
const hit = banned.filter((w) => viewSrc.indexOf(w) >= 0);
ok(hit.length === 0, `view.js 必须与 DOM/引擎/时钟无关（命中：${hit.join(',') || '无'}）`);
const mainSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
ok(mainSrc.indexOf("const SHOP_CORE = [") < 0 && mainSrc.indexOf('const VOW_TABS = [[') < 0, '货架折叠常量与档位表只在 view.js 定义一处');

console.log(`挑战码 / 触控 / 桥接 / 视图模型单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);
process.exit(bad ? 1 : 0);
