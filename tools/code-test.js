// 挑战码 / 触屏 / 平台桥接单测（纯 Node，不依赖 DOM）
const C = require('../js/challenge.js');
let pass = 0, bad = 0;
// 源码契约要用到的两份源码：声明放最前面，避免后置 const 造成的 TDZ 假红
const viewSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'view.js'), 'utf8');
const mainSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
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
ok(shardRow.gap === 120, '唯一货钱不够时差额 120 进价格列（220−100）');
ok(shardRow.tip.indexOf('还差') < 0, '差额不再挤进副标题（副标题只留「这货给什么」）');
ok(shardRow.tip.indexOf('这一层还剩') < 0, '刷钱指引不再逐行重复（收到货架下方那一行）');
ok(poor.farm && poor.farm.text.indexOf('**5** 只怪可刷') >= 0 && poor.farm.count === 3, '货架下方挂一行「这一层还剩 5 只怪可刷」（三件缺钱的一次性货合计一行）');
ok(shardRow.tip.indexOf('通关余烬 +8') >= 0, '副标题仍说清这件货给什么');
const cleared = V.shopModel({ s: { gold: 100, floor: 4, flags: {} }, stock: STOCK, fx: mkFx({ floorsLeft: () => 0 }) });
ok(cleared.farm && cleared.farm.text === '这一层已经清空，回下层找钱', '本层清空时那一行改口「回下层找钱」');
const richShop = V.shopModel({ s: { gold: 9999, floor: 4, flags: {} }, stock: STOCK, fx: mkFx() });
ok(richShop.farm === null, '钱够时不挂刷钱指引（不制造噪音）');

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
const banned = ['document', 'localStorage', 'innerHTML', 'addEventListener', 'Math.random', 'Date.now', 'Renderer', 'Engine'];
const hit = banned.filter((w) => viewSrc.indexOf(w) >= 0);
ok(hit.length === 0, `view.js 必须与 DOM/引擎/时钟无关（命中：${hit.join(',') || '无'}）`);
ok(mainSrc.indexOf("const SHOP_CORE = [") < 0 && mainSrc.indexOf('const VOW_TABS = [[') < 0, '货架折叠常量与档位表只在 view.js 定义一处');

// ---------- 结算：塔印与余烬（切边界第二刀） ----------
// 这一屏的每句话都是算术：塔印档位、「下一枚还差什么」、「本局余烬 +N」。
// 原先是 main.js 里的手写文案 + 手写判据，两边各写一遍就会漂——所以除了逐个档位验，
// 还加了一条**闭环断言**：把「下一枚」的目标状态喂回判定，必须真的升到那一档。
const S = (ending, echoDone, retries) => ({ ending, echoDone, retries });

// 判定矩阵：真结局 / 普通结局 × 0–4 枚锁环 × 有没有回头
ok(V.sealOf(S('true', 4, 0)) === 'clear', '真结局 + 四章全拿 + 一次没回头 = 无痕');
ok(V.sealOf(S('true', 4, 1)) === 'ward', '回头过一次就拿不到无痕（降到守灯）');
ok(V.sealOf(S('true', 3, 0)) === 'ward', '真结局 + 3 枚 = 守灯');
ok(V.sealOf(S('true', 2, 0)) === 'name', '真结局 + 2 枚 = 留名');
ok(V.sealOf(S('true', 0, 0)) === 'rough', '真结局 + 0 枚 = 未竟');
ok(V.sealOf(S('plain', 4, 0)) === 'name', '普通结局哪怕四章全拿也上不了守灯（先看结局）');
ok(V.sealOf(S('plain', 2, 0)) === 'name', '普通结局 + 2 枚 = 留名');
ok(V.sealOf(S('plain', 1, 0)) === 'rough', '普通结局 + 1 枚仍是未竟');
ok(V.sealOf({}) === 'rough' && V.sealOf(null) === 'rough', '空状态/空输入不炸，落在最低档');
ok(V.SEALS.fall && V.SEALS.fall.name === '折戟' && !V.SEALS.fall.desc.match(/null/), '折戟那一档仍留着名分（死亡页用）');

// 提示文案：普通结局停在留名时，2 枚与 3 枚的说法必须不同——2 枚时只说「念出第六个名字」是谎
ok(V.nextSealHint('clear', S('true', 4, 0)) === null, '已经无痕就没什么可说的（不给 null 之外的废话）');
ok(V.nextSealHint('rough', S('true', 0, 0)) === '再拿到 2 枚锁环，可换「留名」', '未竟 → 报还差 2 枚');
ok(V.nextSealHint('rough', S('true', 1, 0)) === '再拿到 1 枚锁环，可换「留名」', '已有一枚时只报还差 1 枚');
ok(V.nextSealHint('name', S('true', 2, 0)) === '锁环攒到 3 枚可换「守灯」', '真结局留名 → 只差锁环');
ok(V.nextSealHint('name', S('plain', 2, 0)) === '先念出第六个名字、再把锁环攒到 3 枚，可换「守灯」', '普通结局 2 枚：两件事都得说');
ok(V.nextSealHint('name', S('plain', 4, 0)) === '念出第六个名字，可换「无痕」', '普通结局 4 枚且没回头：念出名字直接跳无痕（不谎报「守灯」）');
ok(V.nextSealHint('name', S('plain', 4, 2)) === '念出第六个名字，可换「守灯」', '普通结局 4 枚但回头过：只到守灯');
ok(V.nextSealHint('ward', S('true', 3, 2)).indexOf('回头 2 次') >= 0, '守灯档报出回头次数');

// 闭环断言：每个状态都按提示的目标去做，判档必须真的往上走一档。
// 这条是防「文案说谎」的机械证明——手写提示时它抓不到，现在提示与判据同源。
const SEAL_CHAIN = ['rough', 'name', 'ward', 'clear'];
let closureBad = 0;
['true', 'plain', ''].forEach((ending) => {
  for (let echoDone = 0; echoDone <= 4; echoDone++) {
    for (const retries of [0, 1, 3]) {
      const now = V.sealOf(S(ending, echoDone, retries));
      const t = V.sealTarget(now, S(ending, echoDone, retries));
      if (!t) continue;                              // 已封顶
      const reached = V.sealOf(S(t.ending, t.echoDone, t.retries));
      if (reached !== t.seal) closureBad++;
      // 目标必须真的比现在高（否则提示就是叫人白跑）
      if (SEAL_CHAIN.indexOf(t.seal) <= SEAL_CHAIN.indexOf(now)) closureBad++;
    }
  }
});
ok(closureBad === 0, `照着「下一枚塔印」的提示做，真的能升到那一档（失败 ${closureBad} 组）`);
ok(V.sealTarget('clear', S('true', 4, 0)) === null && V.sealTarget('fall', S('', 0, 0)) === null, '封顶与折戟没有目标状态');

// 余烬明细：每一项的算术单独验，合计必须等于明细相加（余额对不上是玩家最不能忍的那种谎）
const emberFx = (over) => Object.assign({
  hasRing: () => false,
  timeSec: () => 600,
  bareUnlocked: () => true,   // 默认当作已经领过，免得每条读数都多 5
  firstWin: () => true,
  cleanEmber: () => 0,
}, over || {});
const eBase = { ending: 'true', gold: 0, flags: { killCount: 0 } };
const ePlain = V.emberModel({ s: { ending: 'plain', flags: {} }, echoDone: 0, vowDef: {}, vowId: 'none', fx: emberFx() });
ok(ePlain.total === 5 && ePlain.parts.length === 1, '普通结局零战果 = 走到结局 5');
ok(ePlain.parts.reduce((a, p) => a + p.n, 0) === ePlain.total, '合计 = 明细相加');
const eTrue = V.emberModel({ s: eBase, echoDone: 4, vowDef: {}, vowId: 'none', fx: emberFx() });
ok(eTrue.total === 9, '真结局 = 5 + 4（念出第六个名字）');
const eKill = V.emberModel({ s: { ending: 'true', flags: { killCount: 37 } }, echoDone: 4, vowDef: {}, vowId: 'none', fx: emberFx() });
ok(eKill.total === 12 && eKill.parts.some((p) => p.label === '击杀 37 只' && p.n === 3), '击杀每 10 只 +1（37 只 → +3）');
const eLedger = V.emberModel({
  s: { ending: 'true', flags: { killCount: 40 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'ledger' }),
});
ok(eLedger.parts.some((p) => p.label === '锁环·击杀余烬翻倍' && p.n === 4), '击杀翻倍环把击杀这一项再加一遍（不是重算总数）');
const eQuill = V.emberModel({
  s: { ending: 'true', gold: 750, flags: {} }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'quill' }),
});
ok(eQuill.parts.some((p) => p.n === 6 && p.label.indexOf('剩 750 金') > 0), '落笔之环：750 金封顶 +6（2 + min(4, 7)）');
const eSeventh = V.emberModel({
  s: { ending: 'true', flags: { retries: 1 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'seventh' }),
});
ok(eSeventh.parts.some((p) => p.label === '锁环·第七格' && p.n === 3), '第七格：回头过只给保底 3');
const eHour = V.emberModel({
  s: { ending: 'true', flags: {} }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'hour', timeSec: () => 12 * 60 }),
});
ok(eHour.parts.some((p) => p.n === 4 && p.label.indexOf('12 分钟内') > 0), '时辰环：12 分钟通关给 4');
const eHourSlow = V.emberModel({
  s: { ending: 'true', flags: {} }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'hour', timeSec: () => 30 * 60 }),
});
ok(eHourSlow.parts.some((p) => p.n === 2 && p.label === '锁环·时辰'), '时辰环：超过 20 分钟只给 2');
const eVow = V.emberModel({
  s: { ending: 'true', flags: { vow: 'none' } }, echoDone: 4,
  vowDef: { name: '不立誓', reward: 1, ember: 0 }, vowId: 'none', fx: emberFx(),
});
ok(eVow.parts.some((p) => p.label === '无誓通关' && p.n === 1), '不立誓写成「无誓通关」，不写成「「不立誓」+1」');
const eFirst = V.emberModel({
  s: { ending: 'true', flags: { vow: 'ascetic' } }, echoDone: 4,
  vowDef: { name: '苦行之誓', reward: 2, ember: 40 }, vowId: 'ascetic',
  fx: emberFx({ firstWin: () => false }),
});
ok(eFirst.parts.some((p) => p.label === '首通「苦行之誓」' && p.n === 20), '解锁誓约首通给解锁成本的一半（40 → +20）');
const eFirstDone = V.emberModel({
  s: { ending: 'true', flags: { vow: 'ascetic' } }, echoDone: 4,
  vowDef: { name: '苦行之誓', reward: 2, ember: 40 }, vowId: 'ascetic', fx: emberFx(),
});
ok(!eFirstDone.parts.some((p) => p.label.indexOf('首通') === 0), '首通过就不再给（不能重复领）');
const eBare = V.emberModel({
  s: { ending: 'true', flags: { killCount: 0 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ bareUnlocked: () => false }),
});
ok(eBare.parts.some((p) => p.label === '一口空气（首次）' && p.n === 5), '一件遗物没拿走到结局：首次额外 +5');
const eRelic = V.emberModel({
  s: { ending: 'true', flags: { relic_edge: 1 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ bareUnlocked: () => false }),
});
ok(!eRelic.parts.some((p) => p.label.indexOf('一口空气') === 0), '拿过遗物就不算「一口空气」');
const eZero = V.emberModel({ s: { ending: '', flags: {} }, echoDone: 0, vowDef: {}, vowId: 'none', fx: emberFx() });
ok(eZero.total >= 1, '明细全空时也保底 1（「+0」看着像没算）');
const eClean = V.emberModel({
  s: { ending: 'true', flags: { clean_kills: 3 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'clean', cleanEmber: () => 6 }),
});
ok(eClean.parts.some((p) => p.n === 6 && p.label.indexOf('清了 3 只') > 0), '净芯环：引擎折算 6 点、文案报锁芯层清了 3 只');

// 源码契约：判定与文案只在 view.js 一处定义——main.js 里再出现一份手写门槛就会各说各话
ok(mainSrc.indexOf('function sealOf') < 0 && mainSrc.indexOf('const SEALS = {') < 0
  && mainSrc.indexOf('function emberOf(s, echoDone, vowDef) {\n    const parts') < 0,
  '塔印判定/余烬明细只在 view.js 定义（main.js 只注入事实）');
ok(mainSrc.indexOf('View.emberModel') >= 0 && mainSrc.indexOf('firstWin:') >= 0,
  'main.js 必须把首通/持环等外部事实注入余烬模型');

console.log(`挑战码 / 触控 / 桥接 / 视图模型单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);
process.exit(bad ? 1 : 0);
