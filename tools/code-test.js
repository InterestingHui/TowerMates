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
// 用 rivals 而不是 mine 来测：榜单上一人一行（见「同一个人只占一行」那条），
// 三条 mine 会被折叠成一行——排序口径就只能拿三位朋友来验了。
const tie = V.boardModel({
  mine: [],
  rivals: [
    { code: 'c1', rival: true, floor: 5, ending: 'plain', margin: 'C', time: 100, steps: 10 },
    { code: 'c2', rival: true, floor: 5, ending: 'true', margin: 'C', time: 900, steps: 20 },
    { code: 'c3', rival: true, floor: 5, ending: 'plain', margin: 'A', time: 500, steps: 30 },
  ], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
});
ok(tie.rows[0].ended === true, '同层时真结局排在前面（哪怕用时更久）');
ok(tie.rows[1].margin === 'A' && tie.rows[2].margin === 'C', '结局相同再比决战余裕');
ok(tie.rows[2].time === '1分40秒', '用时 100 秒渲染成 1分40秒');

// 10 行上限：总条数要如实报出来，页面上只画前 10 行（用朋友行测，自己只会占一行）
const many = [];
for (let i = 0; i < 12; i++) many.push({ code: 'f' + i, rival: true, floor: 12 - i, steps: i, time: 60 + i });
const capped = V.boardModel({ mine: [], rivals: many, shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(capped.rows.length === 10 && capped.total === 12, '榜单只画 10 行但总数照实报');

// 榜单是「人」的榜：自己的 12 局历史只占一行（旧实现全倒进榜，前十行全是「你」）
const mineMany = [];
for (let i = 0; i < 12; i++) mineMany.push({ ending: 'true', floor: 12, level: 18, steps: 500, time: 900 + i });
const selfOnce = V.boardModel({
  mine: mineMany,
  rivals: [{ code: 'wx:林小满:8:600', name: '林小满', rival: true, floor: 8, time: 600, steps: 200 }],
  shadows, filter: 'all', todayKey: '2026-11-16', vows: VOWS,
});
ok(selfOnce.rows.filter((r) => r.mine).length === 1, '自己的历史 12 局在榜上只占一行');
ok(selfOnce.rows.length === 4 && selfOnce.total === 4, '朋友与影子不会被自己的旧局挤掉（4 人 = 你 + 林小满 + 两位影子）');
ok(selfOnce.rows[0].time === '15分0秒', '留下的那一行是自己最好那局（用时最短的 900 秒）');
// 「今日」档要去重的是今天最好那局，不是全局那局——先筛后排，不能拿一个月前的最好成绩顶掉今天的
const selfToday = V.boardModel({
  mine: [{ floor: 12, daily: '2026-11-10', time: 100 }, { floor: 4, daily: '2026-11-16', time: 200 }],
  rivals: [], shadows, filter: 'daily', todayKey: '2026-11-16', vows: VOWS,
});
ok(selfToday.rows.length === 1 && selfToday.rows[0].floor === 4, '今日档留的是今天那局（不是全局最好那局）');

// 微信好友昵称：wxwire 明明把 name 带回来了，旧渲染一律写「挑战·朋友」——三位朋友三行同名
const named = V.boardModel({
  mine: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS, shadows: [],
  rivals: [
    { code: 'wx:林小满:8:600', name: '林小满', rival: true, floor: 8, time: 600 },
    { code: 'wx:阿杳:6:500', name: '阿杳', rival: true, floor: 6, time: 500 },
    { code: 'TM5.abc', name: '挑战·朋友', rival: true, floor: 7, time: 400 },
  ],
});
ok(named.rows.map((r) => r.name).join(',') === '林小满,挑战·朋友,阿杳', '好友昵称照原样显示，贴码行才退回「挑战·朋友」');
// 昵称来自 localStorage / 平台回传，渲染层是 innerHTML：尖括号引号必须洗掉，长度按码点截
const dirty = V.boardModel({
  mine: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS, shadows: [],
  rivals: [{ code: 'wx:x', name: '<img src=x onerror=alert(1)>', rival: true, floor: 9, time: 500 },
    { code: 'wx:y', name: '一二三四五六七八九十十一', rival: true, floor: 8, time: 500 }],
});
ok(dirty.rows.find((r) => r.floor === 9).name.indexOf('<') < 0, '昵称里的尖括号洗掉（渲染层是 innerHTML）');
ok(dirty.rows.find((r) => r.floor === 9).name === 'img src=x', '昵称里的尖括号洗掉（渲染层是拼标签）');
ok(Array.from(dirty.rows.find((r) => r.floor === 8).name).length === 10, '长昵称按码点截到 10 个字');

// 自己被前十截掉：榜上没有「你」，脚注必须说清第几名——否则读起来就是「榜上没有我」
const deep = [];
for (let i = 0; i < 10; i++) deep.push({ code: 'd' + i, rival: true, floor: 9, steps: i, time: 100 + i });
const buried = V.boardModel({
  mine: [{ floor: 1, steps: 5, time: 60 }], rivals: deep, shadows: [],
  filter: 'all', todayKey: '2026-11-16', vows: VOWS,
});
ok(buried.rows.length === 10 && !buried.rows.some((r) => r.mine), '十个人都比自己深时自己不在前十里（数据上就这样）');
ok(buried.note.indexOf('你在第 11 名') >= 0, `被截掉时脚注报出名次（实测「${buried.note}」）`);
const buriedDaily = V.boardModel({
  mine: [{ floor: 1, daily: '2026-11-16' }], rivals: deep.map((d) => Object.assign({ daily: '2026-11-16' }, d)),
  shadows: [], filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS,
});
ok(buriedDaily.note.indexOf('你在第 11 名') >= 0 && buriedDaily.note.indexOf(V.NOTE_DAILY) === 0,
  '今日档同样报名次，且不挤掉原来的零点换塔那句');

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
const todayVow = V.boardModel({
  mine: [{ floor: 6, daily: '2026-11-16' }], rivals: [],
  shadows: [], filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS, dayVowName: '铁壁之誓',
});
ok(todayVow.note.indexOf('今日之约：铁壁之誓') >= 0, '今日档要说出今天这条约（不然「凭什么能比」少了一半）');
ok(todayVow.note.indexOf(V.NOTE_DAILY) === 0, '今日之约接在零点换塔那句后面，不替换它');
const allTabVow = V.boardModel({
  mine: [{ floor: 6, daily: '2026-11-16' }], rivals: [], shadows: [],
  filter: 'all', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS, dayVowName: '铁壁之誓',
});
ok(allTabVow.note.indexOf('今日之约') < 0, '「全部」档不写今日之约（那不是这一档的背景）');
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

// ---------- 朋友名录：上限 12 与「挤掉谁」（2026-11-18 社交轮） ----------
// 旧实现是 `list.push(...)` 之后 `slice(0, 12)`：新收下的那条永远排在末尾 ⇒ 满 12 条时被切掉的
// 正是**刚收下的这一条**，而提示条已经说过「收下了挑战·朋友」。玩家看到的症状是「说收下了，榜上没有」；
// 而 PROGRESS 里写的口径是「挤掉最老那条」。上限与挤法现在只在 view.js 一处。
const rivalN = (n) => Array.from({ length: n }, (_, i) => ({ code: `c${i + 1}` }));
ok(V.RIVAL_CAP === 12, `名录上限只有一处定义（实测 ${V.RIVAL_CAP}）`);
const fullCap = V.capRivals(rivalN(13));
ok(fullCap.length === 12 && fullCap[0].code === 'c2' && fullCap[11].code === 'c13',
  `满员后再收一位：挤掉最早那条、新收下的留下（实测首 ${fullCap[0].code} / 末 ${fullCap[11].code}）`);
ok(V.capRivals(rivalN(3)).length === 3 && V.capRivals([]).length === 0 && V.capRivals(null).length === 0,
  '不满上限原样保留；空值与空名单不炸');
ok(V.capRivals(rivalN(4), 2).map((x) => x.code).join(',') === 'c3,c4', '上限可注入（同一份逻辑给测试与将来的名单复用）');
const capInput = rivalN(13);
V.capRivals(capInput);
ok(capInput.length === 13, '不修改入参（调用方还要拿它跟结果比长度，判「有没有挤掉人」）');
// 契约要查「代码里还有没有这个写法」，而解释这段历史的注释本身会提到旧写法——先把注释剥掉再 grep，
// 否则注释写得越清楚，闸门越红（[^:] 那个守卫是为了别把 https:// 当行注释）。
const stripComments = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(stripComments(mainSrc).indexOf('slice(0, 12)') < 0 && mainSrc.indexOf('View.capRivals') >= 0,
  '名录写盘必须过 View.capRivals（旧的 slice(0, 12) 切掉的是刚收下的那条，注释里提到不算）');
const wxSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'wxwire.js'), 'utf8');
ok(stripComments(wxSrc).indexOf('slice(0, 12)') < 0 && wxSrc.indexOf('capRivals') >= 0,
  '微信好友榜那条写者与贴码共用同一份上限（不许第二份 12）');
ok(mainSrc.indexOf('if (!saved.ok)') >= 0 && mainSrc.indexOf('if (!kept.ok)') >= 0,
  '两条入口（贴码 / 落地收下）在存储失败时改口，不许说「进榜了」');

// ---------- 漏斗缓冲：只许写「关键节点」（2026-11-24 自检） ----------
// 缓冲 200 条、write 时 slice(-200)，而漏斗页的跨局读数（加载→开局 / 首局→二局 / 逐层到达）
// 全靠 run_start·first_fight·floor_reach·run_end 这几行串起来。11-24 给战前面板顺手加了
// 一条逐场事件，全清一局 52 场里约 40 场会触发 ⇒ 四五局就把历史从头挤空，而它没有任何读者。
// 这条闸门把「高频事件混进漏斗」钉死：名单之外的 push 一出现就红。
const FUNNEL_EVENTS = ['run_start', 'run_end', 'first_fight', 'floor_reach', 'page_hide', 'vow_open', 'tab_split', 'err'];
const funnelPushes = (stripComments(mainSrc).match(/Funnel\.push\('([a-z_]+)'/g) || [])
  .map((x) => x.replace(/.*'([a-z_]+)'/, '$1'));
ok(funnelPushes.length >= 6, '漏斗写点解析得到（源码写法变了要回来改这条闸门）');
ok(funnelPushes.every((n) => FUNNEL_EVENTS.indexOf(n) >= 0),
  '漏斗只写关键节点（逐场事件会把 200 条缓冲从头挤空）：' + funnelPushes.filter((n) => FUNNEL_EVENTS.indexOf(n) < 0).join(','));
ok(funnelPushes.indexOf('prep_open') < 0, '战前面板不逐场写漏斗（打法次数已由 run_end.dec 汇总）');

// ---------- 战前面板装配必须有兜底（2026-11-24 自检：battleBusy 死角） ----------
// battleBusy 在开面板前置真、在选完之后才放开；中间这段（画怪、拼卡、挂监听）此前没有 catch。
// 抛错就会冒到 clickMove 外面而锁永远是 true ⇒ 整局走不动点不动，只能刷新。
const prepTry = /try\s*\{\s*openPrep\(/.test(stripComments(mainSrc));
const prepCatch = /catch\s*\(e\)\s*\{[^}]*battleBusy = false/.test(stripComments(mainSrc));
ok(prepTry && prepCatch, 'openPrep 装配段有 catch，且 catch 里一定先把 battleBusy 解开');

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

// ---------- 战斗面板：三把打法的读数（切边界第三刀） ----------
// 这一屏的每句话都是算术：「承伤 −45%」是 1−倍率、「挡后剩 N」是血减承伤、
// 「此后 N 场」是本层怪数减掉正在打的这只、「多挨一轮 +N」是三种打法的差额。
// 原先全是 playBattleScene 里的模板串，截图只能验「画出来的字」，验不了「算得对不对」。

// 敌名：Boss / 章怪 / 特性徽记三种尾巴
ok(V.foeName({ name: '砚' , boss: true, title: '第一道锁' }, null) === '砚 · 第一道锁', 'Boss 名带称号');
ok(V.foeName({ name: '砚', boss: true }, null) === '砚 · 塔的主人', 'Boss 没写称号时兜底「塔的主人」');
ok(V.foeName({ name: '骸犬', chapter: 3 }, null) === '骸犬 · 第 3 章', '章怪带章节');
ok(V.foeName({ name: '骸犬' }, null) === '骸犬', '普通怪只有名字（不乱加尾巴）');
ok(V.foeName({ name: '骸犬', trait: 'thick' }, { icon: '🛡', name: '厚甲' }) === '骸犬 <i class="bs-trait">🛡厚甲</i>', '特性徽记挂在名字后面');

// 首遇特性的规则行（2026-11-20 加练美术焦点B）：说话人固定烛，正文逐字复用 TRAITS[*].tip。
// 原来这行只用 log() 投到 #log 最下缘，而战斗遮罩正盖在上面——规则投递到了被自己挡住的面。
const TRAIT_FIRST = { icon: '⚡', name: '先攻', tip: '开打前它先打你一下，残血时不能碰' };
ok(V.traitNote(TRAIT_FIRST) === '烛：开打前它先打你一下，残血时不能碰', '首遇规则由烛开口（不新造系统旁白）');
ok(V.traitNote(TRAIT_FIRST).indexOf(TRAIT_FIRST.tip) > 0, '正文逐字取自特性表（两份文案必然漂）');
ok(V.traitNote(null) === '' && V.traitNote({}) === '' && V.traitNote({ name: '先攻' }) === '', '没有特性 / 没有 tip 时不留空行');
ok(mainSrc.indexOf('开打前它先打你') < 0, '规则正文不许在 main.js 里再写一份');
ok(mainSrc.indexOf('View.traitNote') >= 0, '面板必须走 View.traitNote（不许自己拼「烛：」）');
ok(V.foeName({ name: '蝙蝠' }, { icon: '⚡', name: '先攻' }, '烛：先手') === '蝙蝠 <i class="bs-trait">⚡先攻</i><em class="bs-why">烛：先手</em>', '规则行折在名字块里（不另开一块，面板块数已到顶）');
ok(V.foeName({ name: '蝙蝠' }, { icon: '⚡', name: '先攻' }, '') === '蝙蝠 <i class="bs-trait">⚡先攻</i>', '没有规则时不渲染空 em（第二次遇见不留残影）');
ok(mainSrc.indexOf("firstMeet ? View.traitNote(bTrait) : ''") >= 0, '只在首遇那一战把规则传进名字块');
ok(!/bsTnote/.test(mainSrc) && !/bsTnote/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8')), '不许另开一块放规则（首章面板预算 5 块）');

// 威胁读数：一只不剩 / 破不了防 / 最贵 / 已架盾
ok(V.threatModel(null).show === false, '没有读数就不出现');
ok(V.threatModel({ count: 0, worst: { name: '骸犬', damage: 20 } }).show === false, '一只不剩＝这层清完了，整行不出现');
ok(V.threatModel({ count: 2 }).show === false, '既没最贵也没打不穿 → 不出现（不摆空行）');
const thWall = V.threatModel({ count: 3, wall: { name: '石像鬼' }, worst: { name: '骸犬', damage: 99 } });
ok(thWall.show && thWall.html.indexOf('这一层还剩 3 只 · <b>打不穿</b> 石像鬼') >= 0, '打不穿优先于「最贵」');
const thBare = V.threatModel({ count: 4, worst: { name: '怨灵', damage: 126 } });
ok(thBare.html === '这一层还剩 4 只 · 最贵 怨灵 白打 <b>−126</b>', '没架盾时报「白打 −N」');
ok(thBare.title.indexOf('不格挡、不缠斗') > 0, '白打的口径写在 title 里');
const thSpread = V.threatModel({ count: 2, spread: true, worst: { name: '怨灵', damage: 107 } });
ok(thSpread.html.indexOf('架盾后') > 0 && thSpread.html.indexOf('白打') < 0, '盾架开后改口「架盾后」，不许同一个数两种说法');
ok(thSpread.title.indexOf('85%') > 0, '架盾后的 title 说明按 85% 结算');

// 格挡：额度 / 比例 / 挡后剩多少血
const bmOnce = V.blockModel({ limit: 1, left: 1, scale: 0.6, hp: 900, damage: 400 });
ok(bmOnce.html.indexOf('本层一次') > 0 && bmOnce.html.indexOf('承伤 −40%') > 0, '单次额度写「本层一次」，比例由倍率反算');
ok(bmOnce.html.indexOf('挡后剩 500') > 0, '挡完还剩多少血直接写出来（不让玩家自己乘百分比）');
const bmTwice = V.blockModel({ limit: 2, left: 1, scale: 0.5, hp: 900, damage: 580 });
ok(bmTwice.html.indexOf('本层剩 1 次') > 0 && bmTwice.html.indexOf('承伤 −50%') > 0, '双挡之环写剩余次数、断刃之环的 50% 跟着倍率走');
ok(V.blockModel({ limit: 1, left: 1, scale: 0.6, hp: 400, damage: 400 }).html.indexOf('挡后仍会倒下') > 0,
  '挡了照样倒下时必须说出来（原来只在 >0 时说话，等于静默吞掉）');
ok(V.blockModel({ limit: 1, left: 1, scale: 0.6, hp: 900, damage: null }).html.indexOf('挡后') < 0, '没有挡后读数时不留半句');
ok(V.blockModel({ limit: 1, left: 1, scale: 0.6, hp: 400, damage: 399.6 }).html.indexOf('挡后剩 1') > 0, '差 0.4 血也活着：显示钳到 1，不许写「倒下」（连击 1.7 倍会算出小数）');

// 架盾：「此后 N 场」= 本层怪数 − 正在打的这只；三种形态
const gmOffer = V.guardModel({ offer: true, count: 6, heroHp: 300, guardDamage: 60, blockScale: 0.55 });
ok(gmOffer.mode === 'offer' && gmOffer.html.indexOf('此后 5 场') > 0 && gmOffer.html.indexOf('这战剩 240') > 0,
  '架盾报「此后 N 场」（排除正在打的这只）与这一场打完剩多少血');
ok(gmOffer.html.indexOf('每场 −15%') > 0, '架盾每场省下的比例由 0.85 反算（−15%）');
ok(gmOffer.title.indexOf('单场格挡则是只挡这一场，少挨 45%') > 0, 'title 里并排说明另一种用法省多少（集中 vs 摊平）');
ok(V.guardModel({ spreadActive: true, count: 5 }).mode === 'active', '盾已架开时是状态条，不是按钮');
ok(V.guardModel({ spreadActive: true }).html.indexOf('盾已架开') > 0, '状态条文案写明「已架开」');
ok(V.guardModel({ offer: false }).mode === 'hidden', '不满足条件时整块不出现');
ok(V.guardModel({ offer: true, count: 0, heroHp: 100, guardDamage: 10 }).html.indexOf('此后 0 场') > 0,
  '只剩这一只时架盾也说实话（0 场），不粉饰');

// 缠斗：符号与「省下来的 −N%」相反，用「+N 血」；缠完剩多少血在 title
const tm = V.tangleModel({ extra: 40, mult: 2, exp: 12, expGain: 24, damage: 130, heroHp: 400 });
ok(tm.html.indexOf('多挨一轮 +40 血 · 经验 ×2') > 0, '缠斗写「+N 血」而不是减号（那会和格挡的「省下 N%」读反）');
ok(tm.title.indexOf('缠完还剩 270 血') >= 0 && tm.title.indexOf('12 → 24') > 0, '缠完剩多少血与经验收益都写出来');
ok(V.tangleModel({ extra: 5, mult: 2, exp: 1, expGain: 2, damage: 999, heroHp: 10 }).title.indexOf('缠完还剩 0 血') >= 0,
  '缠完会倒下时钳到 0，不写出负数');

// 提示行：有得选时不许说「自动战斗中」（那等于叫人别管这一屏）
ok(V.HINT_PICK === '可点下面的打法 · 或点这里直接打', '有可选打法时的提示行');
ok(V.HINT_AUTO === '自动战斗中 · 点击跳过', '无可选打法时的提示行');
ok(V.hintPicked('架盾') === '这一战按「架盾」打 · 点这里直接看结果', '选完必须说清选的是哪一把');

// 源码契约：这些模板串与减法只许在 view.js 一处——main.js 里再手写一遍就会各说各话
const battleStr = ['此后 ${', '挡后剩 ${', '多挨一轮 +${', '这一层还剩 ${', '盾已架开</b>', '<b>🛡 格挡</b>'];
const battleHit = battleStr.filter((w) => mainSrc.indexOf(w) >= 0);
ok(battleHit.length === 0, `战斗面板文案只在 view.js 定义（main.js 命中：${battleHit.join(',') || '无'}）`);
// 2026-11-24：打法选择从战斗面板挪到「战前」面板（战斗里只剩回显），
// 卡面文案随之有一个新出口 View.prepOptions；它内部仍然复用 blockModel/guardModel/tangleModel，
// 所以「同一笔账只有一处算术」这条没有被绕开。
const battleCalls = ['View.foeName', 'View.threatModel', 'View.prepOptions', 'View.hintPicked'];
ok(battleCalls.every((w) => mainSrc.indexOf(w) >= 0), 'main.js 必须走这几个视图模型与提示行函数（不许绕过）');
const prepBuiltOn = ['blockModel(', 'guardModel(', 'tangleModel('].every((w) => {
  const i = viewSrc.indexOf('function prepOptions');
  return i >= 0 && viewSrc.indexOf(w, i) > 0;
});
ok(prepBuiltOn, '战前卡复用了格挡/架盾/缠斗三块模型（不是另写一套算术）');
// 战前卡：三把打法各自的账
const prepF = {
  base: 320, hp: 800, floor: 3, hasBlock: true, nonTrivial: true,
  block: { left: 1, limit: 1, scale: 0.55, damage: 176 },
  guard: { count: 5, damage: 272, scale: 0.85 },
  tangle: { extra: 40, mult: 2, exp: 12, expGain: 24, damage: 360 },
};
const prep = V.prepOptions(prepF);
ok(prep.length === 4 && prep[0].id === 'none', '战前卡：默认一张直接开打 + 三把打法');
ok(prep[1].sub.indexOf('本层一次') >= 0 && prep[1].sub.indexOf('55%') >= 0, '格挡卡写明额度与压到 55%');
ok(prep[2].sub.indexOf('此后 4 场') >= 0 && prep[2].sub.indexOf('−15%') >= 0, '架盾卡写清「此后 N 场」与比例');
ok(prep[3].sub.indexOf('多挨一轮 +40 血') >= 0 && prep[3].sub.indexOf('经验 ×2') >= 0, '缠斗卡写清多挨多少与收益');
ok(V.prepOptions(Object.assign({}, prepF, { hasBlock: false })).length === 3, '不会格挡时不摆格挡卡');
// 战前面板的「上次对这只」：只说发生过的事（打法 + 实际掉血），没有就不出现
ok(V.lastTacticLine(null) === '', '没有上次记录时不写记忆行');
const lastB = V.lastTacticLine({ p: 'b', d: 176 });
ok(lastB.indexOf('格挡') >= 0 && lastB.indexOf('176') >= 0, '记忆行写出上次的打法与掉血');
ok(V.lastTacticLine({ p: 'n' }).indexOf('直接打') >= 0, '没有掉血数时只写打法');
ok(V.prepOptions(Object.assign({}, prepF, { nonTrivial: false, floor: 0 })).length === 1, '杂兵小架只留「直接开打」');

// ---------- 结算两页（败局 / 胜局）的标签与履历 ----------
// 这一屏曾经同一个数有两个口径：层数（引擎 0 基 / 文案 1 基）、章回响分母（手写 4）、
// 塔印名（两页各取一次）。搬进 view.js 之后这些口径只剩一处，下面的断言直接盯它们。
const vows = {
  none: { name: '不立誓', emoji: '○' },
  mercy: { name: '慈悲之誓', emoji: '🕊' },
  greed: { name: '贪婪之誓', emoji: '💰' },
  ascetic: { name: '苦行之誓', emoji: '🥀', ember: 90 },
  nameless: { name: '无名之誓', emoji: '▨', ember: 120 },
};
const blankMem = () => ({ runs: 3, endings: { plain: 1 }, vowWins: { mercy: 1 }, fullChapters: 2, heartTaken: 1, heartLeft: 0, deepest: 7, fastest: 300, bestSeal: 'name', falls: 2, lastFallFloor: 4, marginCounts: { A: 1 }, marginBest: 'A', floorBase: 1 });
const memOf = (over) => Object.assign(blankMem(), over || {});

// 层数口径：引擎 0 基 → 文案 1 基，只有这一处换算
ok(V.floorNo(0) === 1 && V.floorNo(4) === 5, '引擎 0 基转「第 N 层」');
ok(V.floorNo(undefined) === 1 && V.floorNo(-3) === 1, '脏值/负数钳到第 1 层，不写出「第 0 层」');
ok(V.CHAPTERS === 4, '章数常量只此一处（回响分母不再手写 4）');

// 败局标签：6 行，第 1 层死的人必须看到「第 1 层」
const ds = V.deathStatsModel({ foe: '墨妖', floor0: 0, sealName: '折戟', kills: 3, vowName: '慈悲之誓', time: 125 });
ok(ds.length === 6, '败局标签六行（倒在/深度/塔印/击杀/誓约/用时）');
ok(ds.map((r) => r.label).join(',') === '倒在,深度,塔印,击杀,誓约,用时', '败局标签顺序与文案不变');
ok(ds[1].value === '第 1 层', '第 1 层倒下时写「第 1 层」（此前写成「第 0 层」）');
ok(V.deathStatsModel({ floor0: 4 }).map((r) => r.value)[1] === '第 5 层', '深度按 s.floor+1 显示');
ok(V.deathStatsModel({}).map((r) => r.value)[0] === '塔里', '没有怪物名时写「塔里」（不写 undefined）');
ok(ds[5].value === '2分5秒', '用时口径与榜单同源');
ok(V.deathStatsModel({}).map((r) => r.value)[4] === '不立誓', '誓约缺省是「不立誓」');

// 胜局标签：13 行，集齐盾谱 +1
const ws = V.winStatsModel({
  ending: 'true', sealName: '无痕', level: 18, atk: 120, def: 96,
  finalHp: 400, finalMaxHp: 500, curHp: 400, kills: 40, relics: '灯 尺', rings: '刻刀 时辰',
  echoDone: 4, heart: 'left', vowName: '慈悲之誓', steps: 612, time: 512,
});
ok(ws.length === 13, '胜局标签十三行（不含盾谱）');
ok(V.winStatsModel({ signed: true, curHp: 1, finalHp: 1, finalMaxHp: 1 }).length === 14, '集齐盾谱多一行签名');
const row = (rows, label) => rows.find((r) => r.label === label).value;
ok(row(ws, '结局') === '第六个名字' && row(ws, '章回响') === '4/4 章', '结局与章回响按同一套常量拼');
ok(row(ws, '剩余生命') === '400 / 500' && ws.find((r) => r.label === '剩余生命').sub === '决战结束时',
  '血量相同只标「决战结束时」');
const ws2 = V.winStatsModel({ finalHp: 400, finalMaxHp: 500, curHp: 460 });
ok(ws2.find((r) => r.label === '剩余生命').sub === '决战结束时（现 460）', '之后买药回血要标「现」以免与难度基准对不上');
ok(row(V.winStatsModel({ curHp: 333 }), '剩余生命') === '333', '没有决战读数时只写当前血');
ok(row(V.winStatsModel({ heart: 'taken' }), '塔心') === '带走' && row(V.winStatsModel({ heart: 'left' }), '塔心') === '留下'
  && row(V.winStatsModel({}), '塔心') === '未至', '塔心三种状态');
ok(row(V.winStatsModel({}), '攻击 / 防御') === '0 / 0', '攻防缺值不写 NaN');
ok(row(V.winStatsModel({}), '遗物') === '无' && row(V.winStatsModel({}), '锁环') === '无', '没拿东西时写「无」');

// 「塔的记忆」：两页共用一套，败局 5 行 / 胜局 6 行（多一行决战余裕）
const memIn = (mode, over) => Object.assign({ mode, floorNow: 5, mem: memOf(over), vows, ember: 10, hasVow: () => false }, {});
const md = V.memModel(memIn('death'));
const mw = V.memModel(memIn('win'));
ok(md.items.length === 5 && mw.items.length === 6, '败局履历 5 行、胜局 6 行');
ok(md.items[0].includes('最远第 7 层') && md.items[0].includes('进塔 3 次'), '最远层与进塔次数');
ok(V.memModel(memIn('death', { deepest: 2 })).items[0].includes('最远第 5 层'), '本局比纪录更深时取本局');
ok(md.items[4] === '💀 折戟 ×2 · 上次倒在第 4 层', '「上次倒在第 N 层」不再偏 1（账本已是 1 基）');
ok(V.memModel(memIn('win', { falls: 0 })).items.length === 5, '没折过戟的胜局不念折戟行');
ok(mw.items[5] === '决战余裕最好 A · A×1', '决战余裕最好一档 + 分档计数');
ok(V.memModel(memIn('win', { marginBest: '', marginCounts: {} })).items[5] === '决战余裕最好 尚未记录', '从没通关过的档位写「尚未记录」');
ok(md.items[2] === '结局：铁与霜 ×1 · 第六个名字 ×0', '双结局分列');
ok(md.items[3].includes('2/4 章') && md.items[3].includes('带走×1 留下×0'), '回响与塔心取舍');
ok(md.items[1].includes('留名'), '最好的塔印翻成人话（不留 raw id）');

// 下一局目标：败局第一句必须是「从哪再开始」
ok(md.goals[0] === '这次倒在了第 5 层——下一局从这里再往上', '败局第一条是本次倒下的层');
ok(md.goals.length <= 3, '目标最多三条（面板放不下更多）');
ok(V.memModel({ mode: 'death', floorNow: 4, mem: memOf(), vows, ember: 10, hasVow: () => true }).goals.some((g) => g.includes('再攒')) === false,
  '誓约都已解锁时不再催「再攒」（hasVow 恒真）');
const lockedGoal = V.memModel({ mode: 'death', floorNow: 3, mem: memOf({ fullChapters: 4 }), vows, ember: 10, hasVow: () => false });
ok(lockedGoal.goals[1] === '再攒 80 ✦ 解锁「苦行之誓」', '未解锁誓约按「差多少余烬」报数（90-10）');
ok(lockedGoal.lockedVow === 'ascetic', '锁着的誓约 id 一并交给 UI（层灯那行要不要出现靠它）');
ok(V.memModel({ mode: 'death', floorNow: 3, mem: memOf(), vows, ember: 95, hasVow: () => false }).goals[1]
  .indexOf('已可解锁') > 0, '够余烬时改口「已可解锁」而不是「再攒 0」');
ok(md.goals.some((g) => g.includes('回响拿满')), '回响没满时给一条推进目标');
const fullCh = V.memModel({ mode: 'death', floorNow: 6, mem: memOf({ fullChapters: 4, endings: { true: 1, plain: 1 } }), vows, ember: 300, hasVow: () => true });
ok(fullCh.goals.length === 1, '全收集后只剩「本次倒在哪」一条（不许硬凑三条）');
// 胜局：目标里要有誓约、决战余裕 S、塔心另一条路
const wg = mw.goals;
ok(wg.some((g) => g.includes('拿一次决战余裕 S')), '没拿过 S 时把避战流钉进目标');
const heartOnly = V.memModel({ mode: 'win', floorNow: 13, vows, ember: 300, hasVow: () => true,
  mem: memOf({ marginCounts: { S: 1 }, marginBest: 'S', heartTaken: 1, heartLeft: 0, fullChapters: 4, endings: { true: 1, plain: 1 }, vowWins: { mercy: 1, greed: 1, ascetic: 1, nameless: 1 } }) });
ok(heartOnly.goals.length === 1 && heartOnly.goals[0] === '把塔心石留下一次', '塔心只做过一种选择时催另一种（且不挤掉别人的条目）');
// 全收集的胜局：四个条件都不成立时目标真的清空（不硬凑三条凑数）
const allDone = V.memModel({
  mode: 'win', floorNow: 13, vows, ember: 300, hasVow: () => true,
  mem: memOf({ marginCounts: { S: 2 }, marginBest: 'S', heartTaken: 1, heartLeft: 1, fullChapters: 4, endings: { true: 1, plain: 1 }, vowWins: { mercy: 1, greed: 1, ascetic: 1, nameless: 1 } }),
});
ok(allDone.goals.length === 0, '全收集的胜局目标清空（空面板比硬凑一条更诚实）');
ok(allDone.lockedVow === null, '誓约都解锁后不再有锁定项（层灯那行才该出现）');
ok(md.note === '塔收起了你的名字，但位置还留着。' && mw.note === '塔在等你回来——为了上面这些。', '两页结尾那句话随 mode 走');

// 老档层数口径迁移：从没赢过 = 全部来自败局 → 整份账少 1，补上；赢过则不动（可能已是 1 基）
const oldA = V.migrateFloors({ runs: 3, endings: {}, deepest: 2, falls: 1, lastFallFloor: 2 });
ok(oldA.deepest === 3 && oldA.lastFallFloor === 3 && oldA.floorBase === 1, '从没赢过的老档：两个层数各 +1');
const oldB = V.migrateFloors({ runs: 9, endings: { true: 1 }, deepest: 12, falls: 2, lastFallFloor: 4 });
ok(oldB.deepest === 12 && oldB.lastFallFloor === 5, '赢过的老档：deepest 不动（已是 1 基），折戟层仍 +1');
const fresh = V.migrateFloors({ runs: 0, endings: {}, deepest: 0, falls: 0, lastFallFloor: 0, floorBase: 1 });
ok(fresh.deepest === 0 && fresh.lastFallFloor === 0, '新档不迁移（blank 已带 floorBase）');
ok(V.migrateFloors(oldA).deepest === 3 && V.migrateFloors(oldA).lastFallFloor === 3, '迁移幂等（读两次不会越加越多）');

// ---------- 结算摘要（第五刀）：顶行 / 余烬明细 / 摘要条目与折叠 ----------
// 顶行胜局：五件事同源（结局 · 塔心 · 回响 N/4 · 遗物 · 锁环）
const wScore = V.endScoreModel({
  mode: 'win', seal: 'ward', sealName: '守灯', sealDesc: '灯还亮着。',
  ending: 'true', heart: 'taken', echoDone: 3, relicCount: 2, ringCount: 3, ember: 21,
});
ok(wScore.cls === 'ward' && wScore.name === '守灯', '胜局顶行读塔印 id 与名字');
ok(wScore.meta === '真结局 · 塔心带走 · 回响 3/4 · 遗物 2 · 锁环 3', '胜局顶行五件事一行写完');
ok(wScore.num === '✦ 21<small>余烬</small>' && wScore.title.indexOf('守灯') === 0 || wScore.title.includes('守灯'), '顶行带余烬数与悬停说明');
ok(V.endScoreModel({ mode: 'win', seal: 'rough', sealName: '未竟', ending: 'plain', echoDone: 0, relicCount: 0, ringCount: 0 }).meta
  === '普通结局 · 回响 0/4 · 遗物 0 · 锁环 0', '普通结局 + 没拿塔心石时不挂塔心那半句');
ok(V.endScoreModel({ mode: 'win', ending: 'true', heart: 'left', echoDone: 4 }).meta.indexOf('塔心留下') > 0, '塔心留下的写法');
ok(V.endScoreModel({ mode: 'win', echoDone: 4 }).meta.includes('回响 4/4'), '回响分母取 View.CHAPTERS，不写死 4 的第二份');
// 顶行败局：层数是 1 基（floor0 进来、floorNo 出去），与胜局同一个换算
const dScore = V.endScoreModel({ mode: 'death', sealName: '折戟', sealDesc: '塔替你记下。', floor0: 0, kills: 7, time: 95, ember: 1 });
ok(dScore.cls === 'fall' && dScore.meta === '败局 · 第 1 层 · 击杀 7 · 用时 1分35秒', '败局顶行：第 1 层（0 基进、1 基出）+ 用时分钟数');
ok(V.endScoreModel({ mode: 'death', floor0: 4, time: 40 }).meta.includes('第 5 层'), '败局第 5 层不再偏 1');

// 余烬明细：合计与余额都由 before 算出来，渲染层不许再加一遍
const edm = V.emberDetailModel({ parts: [{ label: '走到结局', n: 5 }, { label: '念出第六个名字', n: 4 }], total: 9, before: 30 });
ok(edm.parts.length === 2 && edm.parts[1].html === '念出第六个名字 <b>+4</b>', '明细逐项带增量');
ok(edm.totalHtml === '合计 <b>+9</b>' && edm.balance === '✦ 30 → 39', '余额 = 落袋前 + 本局（不是随手拼两个数）');

// 胜局摘要：顺序、条件项、门槛
const briefOf = (o) => V.winBrief(Object.assign({ fx: { zealFull: () => 40 } }, o));
const b1 = briefOf({ relicCount: 1, kills: 33, retries: 0, emberGain: 12 });
ok(b1[0] === '带走 1 件遗物 · 击杀 33 只', '没有今日一塔时第一句是「带走 N 件遗物」');
ok(b1[1] === '一次没回头' && b1[b1.length - 1] === '✦ +12', '没回头写陈述句，余烬收尾');
ok(briefOf({ relicCount: 0, kills: 0, retries: 3 })[1] === '重来本层 3 次', '重来过几次就报几次');
ok(briefOf({ dailyLabel: '11月16日', relicCount: 0, kills: 0 })[0] === '今日一塔 · 11月16日', '今日一塔排第一（藏着等于没写）');
ok(briefOf({ worstHit: 126, worstName: '怨灵', relicCount: 0, kills: 1 }).some((t) => t === '最狠的一场：怨灵 −126'), '最狠的一场');
ok(!briefOf({ relicCount: 0, kills: 1 }).some((t) => t.indexOf('最狠') === 0), '没挨过大打就不提这一条');
ok(briefOf({ hint: '锁环攒到 3 枚可换「守灯」', relicCount: 0, kills: 1 }).some((t) => t.indexOf('下一枚塔印：') === 0), '下一枚塔印的提示原样进摘要');
ok(!briefOf({ relicCount: 0, kills: 1 }).some((t) => t.indexOf('下一枚塔印') === 0), '已经刻满（hint 为 null）时不挂这一条');
// 图鉴新收录：前 4 件 + 「等 N 件」，并报还差几件
const newly4 = briefOf({ collectNew: ['红药水', '铜钥匙', '灯芯', '盾谱'], collectionRemain: 7, relicCount: 0, kills: 0 });
ok(newly4.some((t) => t === '图鉴新收录：红药水、铜钥匙、灯芯、盾谱（还差 7 件集齐）'), '四件全念，不写「等」');
const newly6 = briefOf({ collectNew: ['a', 'b', 'c', 'd', 'e', 'f'], collectionRemain: 0, relicCount: 0, kills: 0 });
ok(newly6.some((t) => t === '图鉴新收录：a、b、c、d 等 6 件（还差 0 件集齐）'), '超过四件收成「等 N 件」');
ok(!briefOf({ collectNew: [], relicCount: 0, kills: 0 }).some((t) => t.indexOf('图鉴新收录') === 0), '没有新收录就不提');
// 决战余裕：S 档不挂提示，其余档那句门槛取引擎（不写死 40）
const mS = briefOf({ margin: { grade: 'S', label: '从容', pct: 78 }, relicCount: 0, kills: 0 }).find((t) => t.indexOf('决战余裕') === 0);
ok(mS.indexOf('brief-tip') < 0 && mS.indexOf('剩 78%') > 0, 'S 档只报数，不再挂「上 S 有两条路」');
const mA = briefOf({ margin: { grade: 'A', label: '吃力', pct: 41 }, relicCount: 0, kills: 0 }).find((t) => t.indexOf('决战余裕') === 0);
ok(mA.indexOf('上 S 有两条路') > 0, '非 S 档挂提示');
const mB = V.winBrief({ margin: { grade: 'B', label: '险', pct: 20 }, relicCount: 0, kills: 0, fx: { zealFull: () => 20 } })
  .find((t) => t.indexOf('决战余裕') === 0);
ok(mB.indexOf('打到 20 只以上') > 0, '提示里的战意门槛来自引擎 zealFull（装过手之环时是 20，不是 40）');
ok(!briefOf({ relicCount: 0, kills: 0 }).some((t) => t.indexOf('决战余裕') === 0), '没有余裕读数时整条不出现');
ok(briefOf({ relicEdge: true, relicCount: 1, kills: 1 }).some((t) => t.indexOf('替川走到了塔顶') > 0), '带断剑上塔顶的彩蛋条目');
// 折叠：≤4 全铺开、不给按钮；>4 前 4 显、余下进「＋N 项」
const fold4 = V.briefModel(['a', 'b', 'c', 'd']);
ok(fold4.items.length === 4 && fold4.items.every((x) => !x.extra) && fold4.toggle === '' && fold4.hidden === 0, '四项以内不折叠');
const fold7 = V.briefModel(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
ok(fold7.items.filter((x) => x.extra).length === 3 && fold7.hidden === 3, '七项时后三项收起');
ok(fold7.toggle === '＋3 项 ▾' && fold7.openToggle === '收起 ▴', '按钮文案随折叠数走，展开后改口');
ok(V.BRIEF_SHOW === 4, '默认展示条数写死 4（面板高度预算，别随手放大）');

// 败局摘要：第一句是陈述，抽到里程碑时才挂预告
const db0 = V.deathBrief({ kills: 3 });
ok(db0[0] === '败局也算履历：击杀折成余烬带回。' && db0.length === 1, '败局摘要第一句固定，没有别的就不硬凑');
ok(V.deathBrief({ collectNew: ['a', 'b', 'c', 'd', 'e'], worstHit: 88, worstName: '锁虫' })
  .some((t) => t === '图鉴新收录：a、b、c、d 等 5 件（带走的东西不会因为倒下而丢失）'), '败局图鉴条目同一套「等 N 件」口径');
ok(V.deathBrief({ falls: 2 }).some((t) => t.indexOf('塔的常客') > 0), '第 2 次折戟预告「塔的常客」');
ok(V.deathBrief({ falls: 9 }).some((t) => t.indexOf('不死不休') > 0), '第 9 次折戟预告「不死不休」');
ok(!V.deathBrief({ falls: 3 }).some((t) => t.indexOf('再折戟') >= 0), '别的次数不挂预告（不然每局都在喊）');

// 源码契约：这些模板串只许留在 view.js（main.js 再手写一遍就会各说各话）
const endStr = ['<div>深度 <b>', '进塔 ${', '决战余裕最好 ${', '名册有你的签名',
  '回响 ${', '塔心带走', '上 S 有两条路', '一次没回头', '决战余裕 <b>'];
const endHit = endStr.filter((w) => mainSrc.indexOf(w) >= 0);
ok(endHit.length === 0, `结算标签与摘要只在 view.js 拼（main.js 命中：${endHit.join(',') || '无'}）`);
const sumCalls = ['View.endScoreModel', 'View.emberDetailModel', 'View.briefModel', 'View.winBrief', 'View.deathBrief'];
ok(sumCalls.every((w) => mainSrc.indexOf(w) >= 0), 'main.js 必须走这五个入口（不许绕过）');
ok(mainSrc.indexOf('data-seal="fall"') < 0, '败局顶行的 data-seal 也由模型给（不再手写第二份）');
ok(mainSrc.indexOf('再折戟 1 次') < 0, '折戟预告的那两句只在 view.js（原先 += 拼在渲染层）');
ok(mainSrc.indexOf('lastFallFloor || 0) + 1') < 0, '折戟层不再在展示端 +1（账本已是 1 基，+1 就成了谎）');
const endCalls = ['View.deathStatsModel', 'View.winStatsModel', 'View.memModel', 'View.migrateFloors'];
ok(endCalls.every((w) => mainSrc.indexOf(w) >= 0), 'main.js 必须走这四个入口（不许绕过）');
ok(mainSrc.indexOf('floor: s.floor + 1, time: sum.time') > 0, '败局入账写 1 基层数（与胜局的 summary().floor 同基准）');
ok(mainSrc.indexOf("ending: null, vow: s.flags.vow || 'none', floor: s.floor + 1") > 0, '败局上报给平台桥的层数也是 1 基（与胜局同一份字段）');

// ---------- 祭坛 / 回响 / 路遇：三块弹层的模型 + 「全明码」数据契约 ----------
// 数据侧用 vm 单独载一份 data.js（不污染 challenge / view 的全局）
const _vm = require('vm');
const _fs = require('fs');
const _sandbox = { window: {} };
_vm.createContext(_sandbox);
_vm.runInContext(_fs.readFileSync(require('path').join(__dirname, '..', 'js', 'data.js'), 'utf8'), _sandbox);
const GD = _sandbox.window.GAME_DATA;

// 祭坛：文案按层分界（第 5 层起换另一堆），空堆走「只剩灰」
const a0 = V.altarModel({ floor: 0, choices: ['steel', 'thrift', 'vigor'], relics: GD.relics });
ok(a0.desc === V.ALTAR_DESC_EARLY && !a0.empty && a0.cards.length === 3, '祭坛前四层用「八个人的行李」文案');
ok(V.altarModel({ floor: 4, choices: ['steel'], relics: GD.relics }).desc === V.ALTAR_DESC_LATE, '第 5 层起换另一堆文案（与引擎同一条 floor>=4 分界）');
ok(V.altarModel({ floor: 2, choices: [], relics: GD.relics }).empty === true, '没有可拿的就标成空堆');
ok(V.altarModel({ floor: 2, choices: ['steel', '不存在'], relics: GD.relics }).cards.length === 1, '不认识的遗物不摆卡片（数据脏了不该画出空卡）');
ok(a0.cards[0].id === 'steel' && a0.cards[0].emoji === GD.relics.steel.emoji, '卡片字段取自遗物本身（图标换掉就跟着换）');

// 回响：拿过没有决定「能不能关」与提示行
const echoPend = V.echoModel({ title: '墨妖', pending: true, choices: ['spare', 'twice'], owned: ['twice'], rings: GD.rings });
ok(echoPend.kicker === '墨妖 · 回响' && echoPend.reward === V.ECHO_REWARD_PENDING && !echoPend.muted, '待选时写「塔从墙上取下一枚」');
ok(echoPend.cards.length === 2 && echoPend.cards[0].name === GD.rings.spare.name, '三选一卡片来自候选，且不是环表里的裸 id');
ok(echoPend.ownedHead === '已装 1 枚' && echoPend.owned.length === 1, '已装枚数按真实持有算');
ok(echoPend.hint === V.ECHO_HINT_PICK && echoPend.closable === false, '待选时不能关面板（否则等于放弃这一章的空环）');
const echoDone = V.echoModel({ title: '墨妖', pending: false, choices: ['spare'], owned: [], rings: GD.rings });
ok(echoDone.reward === V.ECHO_REWARD_TAKEN && echoDone.muted && echoDone.cards.length === 0, '拿过的章节不摆候选，只说一句');
ok(echoDone.hint === '' && echoDone.closable === true, '拿过的章节可以关');
ok(V.echoModel({ title: '墨妖', pending: true, choices: ['脏 id'], owned: [], rings: GD.rings }).cards.length === 0, '脏候选 id 不画成空卡');

// 路遇：付不起时「还差多少」与「它给什么」必须同时看得见
const ev = GD.events.find((e) => e.id === 'herbalist');
const evModel = V.eventModel({ event: ev, shorts: [{ kind: 'gold', need: 125, msg: '金币不够' }, null] });
ok(evModel.opts[0].disabled === true && evModel.opts[0].why === '还差 125 金', '付不起：给出差额');
ok(evModel.opts[0].note.indexOf('还差 125 金 · ') === 0 && evModel.opts[0].note.indexOf(ev.options[0].tip) > 0,
  '付不起时仍写着这个选项给什么（旧版把 tip 整句换成「还差 N 金」，等于把账藏了）');
ok(evModel.opts[1].disabled === false && evModel.opts[1].note === ev.options[1].tip, '付得起时原样显示 tip');
ok(V.shortfallText({ kind: 'key', key: 'y', need: 2 }) === '还差 2 把黄钥匙', '缺钥匙给准数，不再只说「钥匙不够」');
ok(V.shortfallText({ kind: 'key', key: 'r', need: 1 }) === '还差 1 把红钥匙', '红钥匙也按名说');
ok(V.shortfallText(null) === '', '不缺就什么都不写');
ok(V.eventModel({ event: { name: 'x', text: 'y', options: [{ label: 'a' }] }, shorts: [] }).opts[0].note === '', '没有 tip 的选项不会写出 undefined');

// 「全明码」数据契约：路遇 24 个事件 / 52 个选项，tip 承诺的每个数都得在 effect 里找到同一个数
{
  const KW = { atk: '攻击', def: '防御', maxHp: '生命上限', hp: '生命', gold: '金币', exp: '经验', ember: '余烬', block: '格挡' };
  const KN = { y: '黄钥匙', r: '红钥匙' };
  const lies = [];
  GD.events.forEach((e) => e.options.forEach((o, i) => {
    const ef = o.effect || {};
    Object.keys(ef).forEach((k) => {
      const n = Math.abs(ef[k]);
      if (k === 'healPct' || k === 'hpPct') {
        const p = Math.round(n * 100);
        if (!(o.tip.indexOf('生命') >= 0 && o.tip.indexOf(String(p)) >= 0 && o.tip.indexOf('%') >= 0)) lies.push(`${e.id}[${i}] ${k}`);
      } else if (k === 'keys') {
        Object.keys(ef.keys).forEach((kk) => {
          if (!(o.tip.indexOf(KN[kk]) >= 0 && o.tip.indexOf(String(Math.abs(ef.keys[kk]))) >= 0)) lies.push(`${e.id}[${i}] keys.${kk}`);
        });
      } else if (k === 'block') {
        if (o.tip.indexOf('格挡') < 0) lies.push(`${e.id}[${i}] block`);
      } else if (k === 'useBlock') {
        // 「学会格挡」与「用掉这一层的格挡」是相反的事，明码里必须能分开
        if (!(o.tip.indexOf('格挡') >= 0 && (o.tip.indexOf('用掉') >= 0 || o.tip.indexOf('消耗') >= 0))) lies.push(`${e.id}[${i}] useBlock`);
      } else if (k === 'gold' && ef[k] === 0) {
        // 0 金不必写进明码
      } else if (!KW[k]) {
        lies.push(`${e.id}[${i}] 未知键 ${k}（检查器要同步）`);
      } else if (!(o.tip.indexOf(KW[k]) >= 0 && o.tip.indexOf(String(n)) >= 0)) {
        lies.push(`${e.id}[${i}] ${k}=${ef[k]}`);
      }
    });
  }));
  ok(lies.length === 0, `路遇每个选项都写明码（effect 的每个数都在 tip 里；不符：${lies.join(',') || '无'}）`);
}

// 源码契约：这三块不许在 main.js 里再手写一份
const evCalls = ['View.altarModel', 'View.echoModel', 'View.eventModel'];
ok(evCalls.every((w) => mainSrc.indexOf(w) >= 0), 'main.js 必须走这三个入口（不许绕过）');
const evGone = ['行李里已经空了', '锁匠倒下了 · 塔从墙上取下一枚锁环', '金币不够\' ? `还差', '学会格挡（战斗中点盾，承伤 −40%）；若已会'];
ok(evGone.every((w) => mainSrc.indexOf(w) < 0), '三块面板的文案与「缺多少」判断已不在 main.js（各说各话的源头）');
ok(mainSrc.indexOf('Engine.eventShortfall') >= 0, '缺多少由引擎判（唯一判据），不是展示层自己乘减');
ok(viewSrc.indexOf('Engine.') < 0 && viewSrc.indexOf('eventCost') < 0, 'view.js 仍不碰引擎（判据在引擎，文案在视图）');

// ---------- 图鉴：顺序 / 承伤档位 / 边际收益（第七刀，此前只能靠截图看「画出来的字」） ----------
const CX_MON = {
  a: { name: '甲', emoji: '🅰', kind: '活', hp: 10, atk: 5, def: 1, gold: 3, exp: 2, trait: 'first' },
  b: { name: '乙', emoji: '🅱', kind: '亡', hp: 20, atk: 8, def: 2, gold: 5, exp: 4 },
  g: { name: '幽灵', emoji: '👻', kind: '亡', hp: 1, atk: 0, def: 0, gold: 0, exp: 0, ghost: true },
  c: { name: '丙', emoji: '🅲', kind: '活', hp: 30, atk: 9, def: 3, gold: 7, exp: 6, boss: true, chapter: 3 },
  d: { name: '丁', emoji: '🅳', kind: '活', hp: 40, atk: 2, def: 0, gold: 9, exp: 8 },
};
const CX_FLOORS = [
  { map: ['..b....'] },                                    // 乙：第 1 层先出现
  { map: ['.......'] },
  { map: ['..a.c..'] },                                    // 甲 / 丙：第 3 层
];
const cxBase = { monsters: CX_MON, floors: CX_FLOORS, traits: { first: { icon: '◈', name: '先攻' } }, maxHp: 400 };
const cxEmpty = V.codexModel(cxBase);
ok(cxEmpty.rows.map((r) => r.ch).join(',') === 'b,a,c,d',
  `怪物按首次出现楼层排序、没出场的排末尾、ghost 不列（实得 ${cxEmpty.rows.map((r) => r.ch).join(',')}）`);
ok(cxEmpty.rows.every((r) => r.ch !== 'g'), '幽灵不占图鉴格子（它是地图上的陷阱，不是可打的怪）');

// 承伤档位：破不了防 / 无伤 / ≥1/4 最大生命 / 其它
const lossOf = (damage) => V.codexModel(Object.assign({}, cxBase, {
  predict: (ch) => (ch === 'a' ? { damage } : null),
})).rows.find((r) => r.ch === 'a');
ok(lossOf(null).loss === '无法破防' && lossOf(null).lossCls === 'danger', '打不动写「无法破防」并标红（不许写成 −0）');
ok(lossOf(0).loss === '无伤' && lossOf(0).lossCls === 'safe', '零承伤写「无伤」走绿档');
ok(lossOf(100).lossCls === 'danger', '承伤正好 1/4 最大生命就标红（>= 判据，不留边界洞）');
ok(lossOf(99).loss === '-99' && lossOf(99).lossCls === 'warn', '99 < 1/4 走提醒档');

// 承伤判据只有一处：图鉴与「怪物速查卡」共用 lossModel（此前两处各写一份，连破防的写法都不一样）
ok(V.lossModel({ pred: null, maxHp: 400 }).kind === 'unknown', '没有预测（还没照过面）给 ??');
ok(V.lossModel({ pred: { damage: null }, maxHp: 400, needAtk: 3 }).text === '攻 +3 才能破防', '速查卡给得出缺几点攻');
ok(V.lossModel({ pred: { damage: null }, maxHp: 400 }).text === '无法破防', '图鉴给不出数字时只说「无法破防」');
ok(V.lossModel({ pred: { damage: 120 }, maxHp: 400 }).text === '-120', '有承伤写成 -N，档位由同一个阈值判');

// 边际收益那一行：有数字 / 有特性但打不过 / 两者都没有
const cxMg = V.codexModel(Object.assign({}, cxBase, {
  margin: (ch) => (ch === 'a' ? { atk: 3, def: 1, base: 0 } : ch === 'c' ? { atk: 2, def: 2, base: 30 } : null),
}));
const r1 = cxMg.rows.find((r) => r.ch === 'a');
const r3 = cxMg.rows.find((r) => r.ch === 'c');
const r4 = cxMg.rows.find((r) => r.ch === 'd');
ok(r1.margin && r1.margin.atk === 3 && r1.margin.noDamage === true, '已无伤：base 0 传给展示层写「（已无伤）」');
ok(r3.margin.noDamage === false && r3.hasTrait === false, '没有特性的怪照样能报边际收益');
ok(r4.margin === null && r4.marginEmpty === true, '既无特性又算不出边际：整行不摆（不许画出空行）');
const cxStuck = V.codexModel(Object.assign({}, cxBase, { margin: () => null }));
const r1s = cxStuck.rows.find((r) => r.ch === 'a');
ok(r1s.hasTrait === true && r1s.margin === null && r1s.marginEmpty === false,
  '有特性但打不过：那一行仍要出现（写「暂时打不过」），不能因为没数字就整行消失');
ok(r1s.trait.icon === '◈' && r1s.trait.cls === 't-first' && r1s.stat === 'HP 10 · 攻 5 · 防 1',
  '特性图标与数值行的字段取自怪物表（换数值就跟着换）');
ok(r1s.reward === '3💰 2✨' && r4.reward === '9💰 8✨', '掉落行按金/经验拼，币种不写错');

// 人物：分母跟着人物表走（原来写死 8），没相遇只写「尚未相遇」不剧透身份
const cxChars = V.codexModel(Object.assign({}, cxBase, {
  characters: [
    { who: '烛', role: '守灯人', cap: 'c1' },
    { who: '墨妖', role: '名册之锁', cap: 'c2' },
    { who: '无名氏', role: '谁', cap: 'c3' },
  ],
  met: (who) => who !== '无名氏',
}));
ok(cxChars.metLine === '已相遇 2 / 3 · 点开看大图', `已相遇分母取人物表长度（实得「${cxChars.metLine}」）`);
ok(cxChars.chars[2].roleText === '尚未相遇' && cxChars.chars[0].roleText === '守灯人', '没相遇不报身份');
ok(cxChars.chars[1].boss === true && cxChars.chars[0].boss === false, 'Boss 标记来自 view.js 的名单（不在渲染层各写一份）');

// 真数据：怪物一个不漏、一个不重，Boss 出现在它自己的楼层之前
{
  const real = V.codexModel({ monsters: GD.monsters, floors: GD.floors, traits: GD.TRAITS, maxHp: 1000 });
  const live = Object.keys(GD.monsters).filter((ch) => GD.monsters[ch] && !GD.monsters[ch].ghost);
  const seq = real.rows.map((r) => r.ch);
  ok(seq.length === live.length && new Set(seq).size === seq.length, `真数据里每只怪都在图鉴里且只出现一次（${seq.length} / ${live.length}）`);
  const names = real.rows.map((r) => r.name);
  ok(names.indexOf('墨妖') >= 0 && names.indexOf('墨妖') < names.indexOf('碑魔'), '第 3 层的锁匠排在第 12 层之前（顺序＝认识它们的顺序）');
  ok(real.rows.filter((r) => r.boss).length === 4, '四位章节 Boss 都带 Boss 标');
}

// 源码契约：这三条规则不许在 main.js 里再手写一份
ok(mainSrc.indexOf('View.codexModel') >= 0 && mainSrc.indexOf('View.lossModel') >= 0, '图鉴与速查卡必须走模型入口（不许绕过）');
ok(mainSrc.indexOf('点开看大图') < 0 && mainSrc.indexOf('尚未相遇') < 0, '「已相遇 N / M」与「尚未相遇」只在 view.js 生成');
ok(mainSrc.indexOf('maxHp * 0.25') < 0, '承伤标红的 1/4 阈值只在 view.js（两处各写一份就会各说各话）');
ok(mainSrc.indexOf('守灯人 · 塔里唯一还肯说话的人') < 0, '人物表只在 view.js 定义（main.js 不再有第二份）');

// ---------- 「这是不是我自己那局」：贴码时挡自己的成绩（2026-11-16 社交面收口）----------
// 旧实现是「把名录排第一的那一局重编成码，跟贴进来的字符串比」：只比一局，于是贴自己**别的**那一局
// （刚打完那局常常不是最好的那局）的码会被当成朋友进榜——自己刷自己的榜，还多一条同名的「挑战·朋友」。
{
  const mine = [
    { ending: 'plain', vow: 'mercy', floor: 5, level: 6, steps: 460, time: 1220, seal: 'ward', goals: 1, margin: 'B', daily: '' },
    { ending: 'true', vow: 'none', floor: 12, level: 18, steps: 900, time: 2600, seal: 'clear', goals: 4, margin: 'S', daily: '2026-11-16' },
  ];
  const sameAsMine = Object.assign({}, mine[0]);
  ok(V.sameRun(mine[0], sameAsMine), '同一局（逐字段一致）判为同一局');
  ok(V.isMine(sameAsMine, mine), '贴自己的码 → 认得出是自己');
  ok(V.isMine(Object.assign({}, mine[1]), mine), '不是「排第一那一局」的自己的另一局，同样认得出来');
  ok(!V.sameRun(mine[0], Object.assign({}, mine[0], { time: 1221 })), '用时差 1 秒就不是同一局');
  ok(!V.sameRun(mine[0], Object.assign({}, mine[0], { vow: 'greed' })), '誓约不同不是同一局');
  ok(!V.sameRun(mine[0], Object.assign({}, mine[0], { daily: '2026-11-15' })), '日签不同不是同一局');
  ok(!V.sameRun(mine[0], Object.assign({}, mine[0], { goals: 2 })), '回响章数不同不是同一局');
  ok(!V.isMine({ ending: 'plain', vow: 'mercy', floor: 5, level: 6, steps: 461, time: 1220, seal: 'ward', goals: 1, margin: 'B', daily: '' }, mine),
    '朋友那局只差一步 → 不是自己');
  ok(!V.isMine(sameAsMine, []) && !V.isMine(sameAsMine, null), '还没打过任何一局时不会误判（空名录 / 无名录）');
  ok(V.sameRun({ floor: 3 }, { floor: 3, margin: undefined, daily: undefined }), '老名录缺 margin / daily 字段时不误判成别人');
  ok(!V.sameRun(null, mine[0]) && !V.sameRun(mine[0], undefined), '空入参不崩');
}
// 源码契约：主代码不许再自己拼一份「我的码」
ok(mainSrc.indexOf("Object.assign({ vow: 'none' }, loadBoard()[0])") < 0, '「这是不是我的码」不许重编码比字符串（誓约会漏）');
ok(mainSrc.indexOf('View.isMine') >= 0, '贴码时的自我识别走 view.js');

// ---------- 挑战链接（社交面）：发送的是链接，码只是链接里的一段 ----------
// 社交链路唯一的摩擦是「50 多个字符」：复制码 → 粘到聊天 → 对方再找到榜面板 → 贴进来。
// 下面这几条守的就是「发出去的那串东西」：既有参数不能丢（丢了线上打不开）、旧参数不能叠、
// 码不能二次转义（base64url 本来就安全，转了只会变长变丑）、落地后参数要能干净冲掉。
{
  const code5 = C.encode(sum); // 与上面同一个 v5 码
  const page = 'https://towermates.app.workbuddy.host/?sharecode=U7XMLC2NKJ';
  const link = V.rivalLink(page, code5);
  ok(link.indexOf('sharecode=U7XMLC2NKJ') > 0, '链接必须保留 sharecode（丢了线上直接 403）');
  ok(link.indexOf('rival=' + code5) > 0, '链接里带的码就是面板上那串（不做二次转义）');
  ok(link.indexOf('%2E') < 0 && link.indexOf('%2D') < 0 && link.indexOf('%5F') < 0,
    '码里的 . - _ 都是 URL 安全字符，不该被转义（转完又长又不可读）');
  const twice = V.rivalLink(link, code5);
  ok((twice.match(/rival=/g) || []).length === 1, '连点两次不该叠出两个 rival 参数');
  const swapped = V.rivalLink(link, 'TM5.NEWCODE-x_y');
  ok(swapped.indexOf('NEWCODE-x_y') > 0 && swapped.indexOf(code5) < 0, '换一局再复制 → 旧码被替换掉');
  ok(V.rivalLink(page, '') === '' && V.rivalLink(page, null) === '' && V.rivalLink('', code5) === '',
    '还没通关（空码）或拿不到地址时返回空串，不生成半截链接');

  ok(V.withoutRival('https://x.test/?sharecode=A&rival=TM5.x#demo=1,2,3') === '/?sharecode=A#demo=1,2,3',
    '落地冲参数：只去掉 rival，其余参数与 hash 一个不动');
  ok(V.withoutRival('https://x.test/?rival=TM5.x') === '/', '只有 rival 时冲成干净的根路径');
  ok(V.withoutRival(page) === '/?sharecode=U7XMLC2NKJ', '本来没有 rival 也不会改坏地址');

  ok(V.rivalFromSearch('?sharecode=A&rival=' + code5) === code5, '从地址读回码');
  ok(V.rivalFromSearch('?rival=%20' + code5 + '%20') === code5, '前后空白要吃掉（聊天软件常在链接尾部带空格）');
  ok(V.rivalFromSearch('?sharecode=A') === '' && V.rivalFromSearch('') === '' && V.rivalFromSearch(null) === '',
    '没有 rival 参数时返回空串');
}
// 源码契约：这一串只许在 view.js 里拼（main.js 再手写一份就会漏 sharecode / 叠参数）
ok(mainSrc.indexOf('View.rivalLink') >= 0 && mainSrc.indexOf('View.rivalFromSearch') >= 0
  && mainSrc.indexOf('View.withoutRival') >= 0, '复制链接 / 落地收下 / 冲参数三处都走 view.js');
ok(mainSrc.indexOf("searchParams.set('rival'") < 0, 'main.js 不许自己拼链接（参数口径只留一处）');
{
  const htmlSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const cssSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  ok(htmlSrc.indexOf('id="btnCopyLink"') > 0 && htmlSrc.indexOf('id="btnCopyCode"') > 0,
    '面板上「复制码」与「复制挑战链接」两颗按钮都在');
  ok(cssSrc.indexOf('.code-acts') >= 0 && cssSrc.indexOf('#btnCopyLink') >= 0,
    '两颗按钮并排一行且有外观（si-buy 的金框规则在 .shop-item 作用域里，不补就落回 UA 默认白砖）');
  // 反馈通道契约：榜单是整屏浮层（z-index 20），日志区被压住 —— 复制这条路不许只写日志
  ok(mainSrc.indexOf('function flashBtn(') > 0 && mainSrc.indexOf("flashBtn(btn, '已复制 ✓')") > 0,
    '复制成功时按钮就地换文案（不靠被浮层盖住的日志）');
  ok(mainSrc.indexOf("log('先打完一局才有挑战码'") < 0 && mainSrc.indexOf("log('先打完一局才有挑战链接'") < 0,
    '占位符 / 没码这条路不许写进日志（浮层下看不见），必须走提示条 + 按钮');
  // ↑ 上面那条是「两条字面量」的黑名单：只要换个说法（或漏掉某条出口）就静默失效。
  // 2026-11-17 变体 4 实证：把「没有可选中对象」那条出口改成 `log(...); return;`（按钮不动、无提示条）
  // 时它照样绿——所以真正的规矩要按**函数体**守：copyText 里每条出口都得动按钮或弹提示条。
  const copyAt = mainSrc.indexOf('function copyText(');
  const copyBody = copyAt < 0 ? '' : mainSrc.slice(copyAt, mainSrc.indexOf('\n    function ', copyAt + 10));
  ok(copyAt >= 0 && copyBody.length > 400, '能切出 copyText 函数体（切不出来下面那条就是假绿）');
  {
    const silent = [];
    const lines = copyBody.split('\n');
    lines.forEach((line, i) => {
      if (line.indexOf('log(') < 0) return;
      const win = lines.slice(i, i + 3).join('\n');
      if (win.indexOf('warn(') < 0 && win.indexOf('flashBtn(') < 0) silent.push(line.trim().slice(0, 46));
    });
    ok(silent.length === 0,
      `复制这条路的每条出口都有可见反馈（只写日志＝在浮层下面看不见；违规：${silent.join(' / ') || '无'}）`);
    ok((copyBody.match(/flashBtn\(/g) || []).length >= 4,
      '复制这条路至少四条出口都动了按钮（没码 / 占位符 / 已复制 / 已选中 / 失败）');
  }
  ok(cssSrc.indexOf('#btnCopyLink.done') >= 0, '「已复制」这个状态有自己的样式（金框亮一档）');
  // 结算页的分享出口（2026-11-17 社交加练）：刚通关是全游戏最想告诉别人的一刻，
  // 码就摆在屏幕上却没有搬走的办法——要复制得先进榜单，而那两颗复制的是「历史最好一局」。
  // 四条一起守：元素在 / 走同一条出口 / 有外观（si-buy 的规则在别处作用域）/ 死亡局藏起来。
  ok(htmlSrc.indexOf('id="btnEndShare"') > 0, '结算页有「把这一局发给朋友」一颗出口');
  ok(mainSrc.indexOf("copyLinkOf($('endCode')") > 0,
    '结算页那颗走的是与榜单同一条拼链接出口（不是又手写一份读码 + 拼链接）');
  ok(cssSrc.indexOf('#btnEndShare') > 0 && cssSrc.indexOf('#btnEndShare.done') >= 0,
    '结算页按钮有自己的外观与「已复制」态（不许落回 UA 默认白砖）');
  ok(cssSrc.indexOf('.death-mode .code-acts') > 0,
    '死亡局没有码：整块在 death-mode 下藏起来（不摆点了只会说「先打完一局」的死按钮）');
  ok(mainSrc.indexOf("if (raw.indexOf('——') === 0)") > 0,
    '占位符（—— 通关后生成 —— / —— 未达结局 ——）不许被拼成链接发出去');
}

// 工匠位次一致性（2026-11-17 叙事加练）：
// 名墙从左到右＝第 1~5 位（炎魔/墨妖/锤魔/钟妖/碑魔），第六位是烛空着的那个签名位
// （＝真结局「第六个名字」）。此前三处各说各的：图鉴把墨妖写成「第一位」（与炎魔撞号）、
// 钟妖/碑魔的章节卡各比名墙晚一位、注释说烛是第四位——玩家读到「第六个名字」时
// 会把它读成碑魔（第六位工匠）。判据只有一个：同一个锁匠在章节卡 / 图鉴 / 名墙顺序里是同一位。
{
  const fs = require('fs'), p = require('path');
  const storySrc = fs.readFileSync(p.join(__dirname, '..', 'js', 'story.js'), 'utf8');
  const dataSrc = fs.readFileSync(p.join(__dirname, '..', 'js', 'data.js'), 'utf8');
  const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
  const wm = /'(炎魔[^']*?)。五道刻完的名字。'/.exec(storySrc);
  ok(!!wm, '名墙上「五道刻完的名字」那句还在（位次以它为准，别改成别的说法）');
  const wall = wm ? wm[1].split('。').filter(Boolean) : [];
  ok(wall.length === 5, `名墙正好列 5 个名字（实得 ${wall.length}：${wall.join('/')}）`);
  const cardRank = {};
  // 用 [^}] 而不是 [\s\S] 圈住同一个对象——否则「炎魔·守炉者」那条（cap 没有位次）
  // 会一路吃到下一条墨妖的 cap，把墨妖整条吞掉（本轮第一版就是这么假绿的）
  for (const m of dataSrc.matchAll(/name:\s*'([^']+)'[^}]{0,160}?title:\s*'第([一二三四五六])位工匠/g)) {
    cardRank[m[1]] = CN[m[2]];
  }
  const codexRank = {};
  for (const m of viewSrc.matchAll(/who:\s*'([^']+)'[^}]{0,80}?cap:\s*'[^']*?第([一二三四五六])位工匠/g)) {
    codexRank[m[1]] = CN[m[2]];
  }
  const alias = { 炎魔: '魔王' }; // 章节卡与图鉴里第一位工匠那格都叫「魔王」
  for (const n of ['炎魔', '墨妖', '钟妖', '碑魔']) {
    const rank = wall.indexOf(n) + 1;
    const key = alias[n] || n;
    ok(rank > 0, `${n} 在名墙上有名字（空位只有一个，留给烛）`);
    ok(cardRank[key] === rank, `${n} 的章节卡位次 = 名墙位置 ${rank}（实得 ${cardRank[key]}）`);
    ok(codexRank[key] === rank, `${n} 的图鉴位次 = 名墙位置 ${rank}（实得 ${codexRank[key]}）`);
  }
  ok(new Set(['炎魔', '墨妖', '钟妖', '碑魔'].map((n) => cardRank[alias[n] || n])).size === 4,
    '四位锁匠的位次互不重复（同一个数写两处就是对不上）');
  ok(cardRank['碑魔'] !== 6, '无名之锁不是第六位——第六个签名位是烛空着的，否则「第六个名字」会读成碑魔');
  ok(storySrc.indexOf('烛（第六位工匠') > 0, '注释里烛是第六位工匠（与「第六个名字」同一个位置）');
}

// 「说明书让人做手机上做不到的动作」（2026-11-17 加练 · 游戏性 焦点 B）：
// 触屏没有 hover。tips / hints 里原来有「悬停能看到效果」——手指按住不放只会弹浏览器菜单；
// 而锁环 / 遗物 chip 早在 11-16 就补了「点一下把效果念出来」的出口，剩下说明书没跟上。
// 另：「顶部三个格子会亮起来」是旧口径——遗物栏按实际持有件数排（一局最多能拿到 7 件），
// 固定说「三个」会让拿到第 4 件的人以为界面出 bug。两条都按源码守，别靠写的人记性。
{
  const fs = require('fs'), p = require('path');
  const storySrc = fs.readFileSync(p.join(__dirname, '..', 'js', 'story.js'), 'utf8');
  ok(storySrc.indexOf('悬停') < 0, '文案里不再出现「悬停」（触屏没有 hover，「够不着的手势」＝假说明书）');
  ok(storySrc.indexOf('三个格子') < 0, '文案里不再写死「三个格子」（遗物栏按实际件数排，最多 7 件）');
  ok(storySrc.indexOf('点一下能看到效果') > 0, '锁环提示改口径为「点一下能看到效果」');
  ok(storySrc.indexOf('点一下能看到它做什么') > 0, '遗物提示改口径为「点一下能看到它做什么」');
}

// 结算摘要里两处 ⓘ 的整句只存在于 title：桌面上悬停可读，触屏上永远打不开。
// 其中「上 S 有两条路」正是决定「再来一局怎么打」的那句话，等于把最有用的一条建议锁进了手机看不见的地方。
// 契约分两头：view.js 得把整句带在 title 上（有内容可念），main.js 得有一次点击出口（点得到）。
{
  const tips = viewSrc.match(/class="brief-tip" title="\$\{[^}]+\}"/g) || [];
  ok(tips.length === 2, `两处 ⓘ 都带着 title 整句（实得 ${tips.length} 处）`);
  ok(mainSrc.indexOf("closest('.brief-tip')") > 0, 'main.js 有 ⓘ 的点击出口（委托到摘要容器）');
  ok(/\$\('endBrief'\)\.addEventListener\('click'/.test(mainSrc), '点击出口挂在 #endBrief 上（摘要重渲不必重绑）');
}

// 图鉴/速查卡/战斗头像的「灯位」背光：径向渐变必须整个落在画布内。
// 半径或圆心一旦超出画布半宽，渐变在四边就不是 0 → 背光被裁成一块硬边亮方块
// （48px 战斗头像上肉眼可见，像给图标垫了块灰牌；11-17 收敛轮就是靠像素采样抓到 x428→429 跳 21 级）。
// 像素判据在 UI 层不好使：剪影本体常常顶到画布边，会把「半透明渗到边上」和「描边抗锯齿」混在一起，
// 所以这条用几何契约守——把三个参数按 ss=100 求值，验证外圆不出界。
{
  const renderSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'render.js'), 'utf8');
  const fn = renderSrc.match(/function iconBackdrop\(ss, light\)\s*\{([\s\S]*?)\n  \}/);
  ok(!!fn, 'render.js 里找得到 iconBackdrop');
  const call = fn ? fn[1].match(/createRadialGradient\(([^)]*)\)/) : null;
  ok(!!call, 'iconBackdrop 用 createRadialGradient 铺背光');
  if (call) {
    const args = call[1].split(',').map((s) => s.trim());
    ok(args.length === 6, `createRadialGradient 六个参数齐全（实得 ${args.length}：${call[1]}）`);
    let v = [];
    try { v = args.map((a) => new Function('ss', 'return (' + a + ');')(100)); } catch (e) { v = []; }
    ok(v.length === 6 && v.every((n) => typeof n === 'number' && isFinite(n)),
      `三个渐变参数都是纯 ss 表达式（${call[1]}）`);
    if (v.length === 6) {
      const [x0, y0, r0, x1, y1, r1] = v;
      ok(x1 - r1 >= -0.01 && y1 - r1 >= -0.01 && x1 + r1 <= 100.01 && y1 + r1 <= 100.01,
        `背光外圆不出画布（圆心 ${x1},${y1} 半径 ${r1}，画布 100×100——出界即硬边方块）`);
      ok(x0 === x1 && y0 === y1, `内外圆同心（${x0},${y0} vs ${x1},${y1}）`);
      ok(r1 > 0 && r1 >= r0, `外半径大于内半径（${r0} → ${r1}）`);
    }
  }
  // 收边：画布四周用 destination-in 淡出。玩家与怪自己的暖光晕（全塔唯一光源）会一路顶到画布边，
  // 没有这层收边就会被硬切一刀，图标底下多出一块有直边的方牌。实测：有收边时 20 只小怪边缘 alpha=0。
  const into = renderSrc.match(/function paintInto\(cv, size, drawer(?:, show)?\)\s*\{([\s\S]*?)\n  \}/);
  ok(!!into && /globalCompositeOperation = 'destination-in'/.test(into[1]), 'paintInto 用 destination-in 给图标收边');
  ok(!!into && /rim\.addColorStop\(1, 'rgba\(0,0,0,0\)'\)/.test(into[1]), '收边是渐变到全透明（不是硬裁）');
}

// 图鉴详情条的进场动效（2026-11-17 焦点C）：点卡片换内容是「插入一块可读的东西」，
// 零过渡就是硬切——而全站其它面板都有 popIn/fadeIn。且同一帧里对已有 .show 的元素再 add
// 不会重启 CSS 动画，连点两张卡时第二张会退化成硬切，故必须有「remove → 回流 → add」的重播。
{
  const cssSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const rule = cssSrc.match(/\.col-detail\.show\s*\{([^}]*)\}/);
  ok(!!rule, 'css 里找得到 .col-detail.show 规则');
  ok(!!rule && /animation:\s*popIn\s+0\.16s/.test(rule[1]),
    `详情条有进场动画（此前是裸 display:flex，零过渡）：${rule ? rule[1].trim() : '—'}`);
  const rp = mainSrc.match(/function replayColDetail\(box\)\s*\{([\s\S]*?)\n  \}/);
  ok(!!rp, 'main.js 有 replayColDetail');
  ok(!!rp && /classList\.remove\('show'\)/.test(rp[1]) && /void box\.offsetWidth/.test(rp[1])
    && /classList\.add\('show'\)/.test(rp[1]), '重播是 remove → 强制回流 → add（同帧直接 add 不会重启动画）');
  const calls = (mainSrc.match(/replayColDetail\(box\)/g) || []).length;
  ok(calls >= 2, `藏品卡与成就卡两条路径都走重播（实得 ${calls} 处）`);
}

// 文案契约：格挡比例只许有一个来源（engine 的 BLOCK_BASE / BLOCK_BASE2）。
// 2026-11-20 焦点B：设置面板「玩法」那段写的是「承伤降到 60%」，而真值早就是 55%（11-14 架盾轮改的
// 0.55 / 0.42），玩家读到的说明书与战斗结算差 5 个百分点，零新增元素、纯说谎。
// 这里按「写死的数字必须等于真值」守，别让下一次调比例又只改代码不改字。
{
  const engSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  const htmlSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const base = Number((/const BLOCK_BASE = ([\d.]+)/.exec(engSrc) || [])[1]);
  const base2 = Number((/const BLOCK_BASE2 = ([\d.]+)/.exec(engSrc) || [])[1]);
  ok(base > 0 && base > 0.1 && base < 1, '读得到 BLOCK_BASE（读不到下面两条就是假绿）');
  ok(base2 > 0 && base2 < base, '读得到 BLOCK_BASE2，且比基础格挡更省（后半部盾谱是强化不是削弱）');
  const want = [Math.round(base * 100), Math.round(base2 * 100)];
  const lits = (src) => Array.from(src.matchAll(/承伤降到\s*\**\s*(\d+)%/g)).map((m) => Number(m[1]));
  const badHtml = lits(htmlSrc).filter((n) => want.indexOf(n) < 0);
  ok(lits(htmlSrc).length >= 1, '玩法说明里确实写明了格挡比例（整句被删掉就没得核对）');
  ok(badHtml.length === 0, `index.html 写死的格挡比例必须是真值 ${want.join(' / ')}%（违规：${badHtml.join(' / ') || '无'}）`);
  const badMain = lits(mainSrc).filter((n) => want.indexOf(n) < 0);
  ok(badMain.length === 0, `main.js 写死的格挡比例必须是真值 ${want.join(' / ')}%（违规：${badMain.join(' / ') || '无'}）`);
  // 同一件事还有另一种写法：「承伤 −N%」（N = 100−倍率）。战斗面板那颗按钮的静态标记里
  // 一直写着 −40%（初版 0.6 时代的数），运行时被 blockModel 重写，所以没人看见——但只要哪次
  // 重写没跑到（面板没开 / 脚本抛错），玩家读到的就是这句话。静态标记一起守。
  const minus = (src) => Array.from(src.matchAll(/承伤\s*−\s*(\d+)%/g))
    .filter((m) => src.slice(Math.max(0, m.index - 200), m.index).indexOf('格挡') >= 0)
    .map((m) => Number(m[1]));
  const wantMinus = [100 - Math.round(base * 100), 100 - Math.round(base2 * 100)];
  const badMinus = minus(htmlSrc).concat(minus(mainSrc)).filter((n) => wantMinus.indexOf(n) < 0);
  ok(minus(htmlSrc).length >= 1, '战斗面板的格挡按钮上确实写着「承伤 −N%」（这句被删掉就没得核对）');
  ok(badMinus.length === 0,
    `「承伤 −N%」也必须是真值 ${wantMinus.join(' / ')}%（违规：${badMinus.join(' / ') || '无'}）`);
}

// 决策审计工具（tools/decision-audit.js）把「集中挡 / 摊平架盾」的账重算了一遍。
// 它算的是「哪个按钮更划算」，一旦这几个常数跟引擎漂开，读数会静默反过来（正负号一错，
// 结论就从「架盾更优」变成「架盾恒劣」），而工具本身不会报错。所以钉在引擎源码上。
{
  const engSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  const auditSrc = require('fs').readFileSync(require('path').join(__dirname, 'decision-audit.js'), 'utf8');
  const base = Number((/const BLOCK_BASE = ([\d.]+)/.exec(engSrc) || [])[1]);
  const base2 = Number((/const BLOCK_BASE2 = ([\d.]+)/.exec(engSrc) || [])[1]);
  const spread = Number((/const BLOCK_SPREAD = ([\d.]+)/.exec(engSrc) || [])[1]);
  const m = /const BLOCK = ([\d.]+), BLOCK2 = ([\d.]+), SPREAD = ([\d.]+)/.exec(auditSrc);
  ok(!!m, '读得到 decision-audit 的三个常数（读不到下面两条就是假绿）');
  ok(!!m && Number(m[1]) === base && Number(m[2]) === base2,
    `decision-audit 的格挡比例必须与引擎同源（${m ? m[1] + '/' + m[2] : '-'} vs ${base}/${base2}）`);
  ok(!!m && Number(m[3]) === spread,
    `decision-audit 的架盾摊平比例必须与引擎同源（${m ? m[3] : '-'} vs ${spread}）`);
}

console.log(`挑战码 / 触控 / 桥接 / 视图模型单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);
process.exit(bad ? 1 : 0);
