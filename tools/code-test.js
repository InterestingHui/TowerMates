// 挑战码 / 触屏 / 平台桥接单测（纯 Node，不依赖 DOM）
const C = require('../js/challenge.js');
let pass = 0, bad = 0;
// 源码契约要用到的两份源码：声明放最前面，避免后置 const 造成的 TDZ 假红
const viewSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'view.js'), 'utf8');
const mainSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8');
const cssSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
const htmlSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const storySrcTop = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'story.js'), 'utf8');
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
// 结局三态：托管数据没有 tm_ending 时不许替他编「普通结局」——旧实现补成 'plain'，
// 死在第 4 层的好友在榜上就成了「铁与霜」（打完碑魔才有的那个结局）。
{
  const n = W.normalize([
    { name: '死了的', floor: 4, time: 300 },
    { name: '普通结局', floor: 13, time: 300, ending: 'plain' },
    { name: '真结局', floor: 13, time: 300, ending: 'true' },
  ]);
  ok(n[0].ending === '' && n[1].ending === 'plain' && n[2].ending === 'true', '结局三态原样透传：缺结局的留空，不补 plain');
}
let stored = null;
global.localStorage = { getItem: () => null, setItem: (k, v) => { stored = v; } };
const merged = W.merge([{ name: 'A', floor: 7, time: 300 }, { name: 'A', floor: 7, time: 300 }]);
ok(merged.length === 1 && stored === null, '同一人同一趟只留一条，且不再往存储里写一份没人读的缓存');
// 只写不读的缓存（`towermates_wx_friends` + `friends()`）11-25 整块删除：要恢复它，先给出读者，
// 并把这条断言改成「谁在读」；直接加回写入会红在这里。
ok(typeof W.friends === 'undefined', '只写不读的 friends() 已删除（好友行真正的落点是 wxwire 的 towermates_rivals）');

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

// 空档的两种说法（2026-11-26 12:5x 自动轮 · 变体1 诊断发现）：锁着的档不能喊「去立一条誓约」——
// 那条要花 ✦ 买下，喊了就是让玩家去做一件当下做不到的事。四态：锁着 / 已买 / 老调用方不传 / 不立誓档。
{
  const VV = {
    none: { name: '不立誓', tag: '无誓' },
    nameless: { name: '无名之誓', tag: '无名', ember: 48 },
  };
  const base = { mine: [], rivals: [], shadows: [], filter: 'nameless', todayKey: '2026-11-16', vows: VV };
  const locked = V.boardModel(Object.assign({ hasVow: () => false }, base));
  ok(/还锁着/.test(locked.empty) && /✦ 48/.test(locked.empty) && locked.empty !== V.EMPTY_OTHER,
    `锁着的档说清价目（实测「${locked.empty}」）`);
  const bought = V.boardModel(Object.assign({ hasVow: (id) => id === 'nameless' }, base));
  ok(bought.empty === V.EMPTY_OTHER, '已买下、只是还没人跑 → 仍指路去立');
  const legacy = V.boardModel(base);
  ok(legacy.empty === V.EMPTY_OTHER, '不传 hasVow 的老调用方行为不变（不许凭空说锁着）');
  const freeTab = V.boardModel({ mine: [], rivals: [], shadows: [], filter: 'none', todayKey: '2026-11-16', vows: VV, hasVow: () => false });
  ok(freeTab.empty === V.EMPTY_OTHER, '「不立誓」档没有价目，hasVow 说没有也不许说锁着');
  // 接线也要咬住：`boardModel` 本身能分辨，但只有把 Meta.has 注进去才分得出锁没锁。
  // 断言必须限定在 `View.boardModel({...})` 那次调用里——`hasVow` 在 main.js 另有一处（誓约面板），
  // 全库搜一遍会「匹配到别人」而永远绿（本条第一版就是这么假绿的）。
  const bmCall = (mainSrc.match(/View\.boardModel\(\{([\s\S]{0,700}?)\}\)/) || [])[1] || '';
  ok(bmCall.length > 100 && /hasVow: \(id\) => Meta\.has\(id\)/.test(bmCall),
    'main.js 把 Meta.has 注进 boardModel 那次调用（不然空态永远说「去立」）');
}

// 每局 8 层 > 影子最高 3 层 → 「你已经走到他们没到过的地方」那句必须出，且自己排第一
const crushed = V.boardModel({
  mine: [{ floor: 8, steps: 300, time: 600, vow: 'mercy' }], rivals: [], shadows,
  filter: 'all', todayKey: '2026-11-16', vows: VOWS, rivalNotes: notes,
});
ok(crushed.rows[0].name === '你' && crushed.rows[0].rank === 1, '自己的局按层数排到第一');
ok(crushed.note === V.NOTE_CRUSHED, '压过全部影子时才出「走到他们没到过的地方」');
ok(crushed.rows[1].name === '第五位勇者·岩' && crushed.rows[2].name === '第二位勇者·鸦', '影子按层数从深到浅');
ok(crushed.rows[2].note === '停在第 2 层', '影子脚注挂在对应名字上');
ok(crushed.rows[0].vowTag === '羽', '誓约徽记取 tag 末字（首字会撞：重压/重金）');
ok(crushed.rows[2].vowTag === '' || crushed.rows[2].vowTag, '不立誓行不挂徽记（影子强制 none）');

// 「榜上没有我」这两种情况都要有一句话（2026-11-27 加练社交）。
// 影子勇者的行一直在，所以「一局都没通关」的玩家**永远看不到空态**：他看见三位影子 + 贴码朋友，
// 找不到自己、也没有一个字解释——第一次打开塔友榜的人多数正处在这个状态（名录只记通关那局）。
// 11-18 修的是「被前十截掉」那种（offBoard），这两种更常见的沉默一直没修。
{
  const noRun = V.boardModel({ mine: [], rivals: [], shadows, filter: 'all', todayKey: '2026-11-16', vows: VOWS });
  ok(noRun.rows.length > 0 && noRun.note === V.NOTE_NO_RUN,
    `一局都没有时说清「榜上还没有你」（实测「${noRun.note}」）`);
  ok(/通关/.test(V.NOTE_NO_RUN), '那句必须说明怎么才能上榜（通关一次），不是只报「没有」');
  const mineOtherVow = { mine: [{ floor: 8, steps: 300, time: 600, vow: 'mercy' }], rivals: [], shadows, todayKey: '2026-11-16', vows: VOWS };
  const tabbed = V.boardModel(Object.assign({ filter: 'none' }, mineOtherVow));
  ok(tabbed.rows.length > 0 && tabbed.note === V.NOTE_NO_MINE_TAB,
    '档位把我的局筛掉时说「这一档里还没有你的局」，不是留一片沉默');
  const onBoard = V.boardModel(Object.assign({ filter: 'all' }, mineOtherVow));
  ok(onBoard.note !== V.NOTE_NO_RUN && onBoard.note !== V.NOTE_NO_MINE_TAB, '我在榜上时不许说「还没有你」');
  const dailyRival = V.boardModel({
    mine: [], rivals: [{ code: 'c1', name: '阿箬', floor: 5, time: 300, rival: true, daily: '2026-11-16' }],
    shadows: [], filter: 'daily', todayKey: '2026-11-16', vows: VOWS,
  });
  ok(dailyRival.note.indexOf(V.NOTE_NO_RUN) >= 0, '「今日」档同样要解释为什么没有我');
  ok(V.NOTE_NO_RUN !== V.NOTE_NO_MINE_TAB, '两句不许写成同一句（一个是没通关，一个是这一档没有）');
}

// 排序口径：同层先看结局，再看决战余裕，最后才是用时
// 用 rivals 而不是 mine 来测：榜单上一人一行（见「同一个人只占一行」那条），
// 三条 mine 会被折叠成一行——排序口径就只能拿三位朋友来验了。
// 层必须是塔顶层（13）：结局只在塔顶成立，写 5 层的话三行全被归一成「未竟」，这条口径就没得验了。
const tie = V.boardModel({
  mine: [],
  rivals: [
    { code: 'c1', rival: true, floor: 13, ending: 'plain', margin: 'C', time: 100, steps: 10 },
    { code: 'c2', rival: true, floor: 13, ending: 'true', margin: 'C', time: 900, steps: 20 },
    { code: 'c3', rival: true, floor: 13, ending: 'plain', margin: 'A', time: 500, steps: 30 },
  ], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
});
ok(tie.rows[0].ended === true, '同层时真结局排在前面（哪怕用时更久）');
ok(tie.rows[1].margin === 'A' && tie.rows[2].margin === 'C', '结局相同再比决战余裕');
ok(tie.rows[2].time === '1分40秒', '用时 100 秒渲染成 1分40秒');

// 结局列只在塔顶层成立：社交榜上「这个人是什么结局」是给别人的第一印象，
// 而死在第 N 层的码 / 缺 tm_ending 的好友行 / 影子勇者的旧数据都带着 'plain' 进来。
// 层列写着 5 层、结局列写着「铁与霜」，就是同一行里两个字段互相打脸。
{
  const endRows = V.boardModel({
    mine: [],
    rivals: [
      { code: 'e5', rival: true, floor: 5, ending: 'plain', time: 100, steps: 10 },
      { code: 'e13p', rival: true, floor: 13, ending: 'plain', time: 200, steps: 20 },
      { code: 'e13t', rival: true, floor: 13, ending: 'true', time: 300, steps: 30 },
      { code: 'e12', rival: true, floor: 12, ending: 'true', time: 400, steps: 40 },
    ], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
  });
  // rows 不带 code（只留画出来要用的字段），按层数取
  const r5 = endRows.rows.find((r) => r.floor === 5);
  const r12 = endRows.rows.find((r) => r.floor === 12);
  const r13 = endRows.rows.filter((r) => r.floor === 13);
  ok(r5.end === '未竟' && r5.ended === false, '5 层的行不写结局（码里那位 ' + "'plain'" + ' 是线格式没有第三态导致的）');
  ok(r12.end === '未竟' && r12.ended === false, '12 层（塔顶却没选结局/码里编的）也不写结局');
  ok(r13.some((r) => r.end === '铁与霜') && r13.some((r) => r.end === '第六个名字' && r.ended === true),
    '13 层的两行照写：普通结局 / 真结局分得开');
  ok(r13.every((r) => r.end !== '未竟'), '塔顶层的行不会出现「未竟」以外的降级');
}

// 影子勇者是榜单上唯一的「内置的人」：他们的层数与结局必须是同一件事。
// 11-25 之前三人 ended 全是 'plain'，于是「停在第 3 层」的岩在结局列写着「铁与霜」。
{
  const top = 13;
  const sh = [
    { name: '第二位勇者·鸦', ending: '', floor: 2 },
    { name: '第五位勇者·岩', ending: '', floor: 3 },
    { name: '第八位勇者·川', ending: '', floor: 5 },
  ];
  const m = V.boardModel({ mine: [], rivals: [], shadows: sh, filter: 'all', todayKey: '2026-11-16', vows: VOWS, topFloor: top });
  ok(m.rows.every((r) => r.end === '未竟' && r.ended === false), '影子勇者都写「未竟」（他们都没走到塔顶）');
  const sloppy = V.boardModel({ mine: [], rivals: [], shadows: [{ name: 'X', ending: 'plain', floor: 3 }], filter: 'all', todayKey: '2026-11-16', vows: VOWS, topFloor: top });
  ok(sloppy.rows[0].end === '未竟', '数据就算填错（3 层 + plain），读取侧也不许把它画成通关');
  // 默认 13 只是 Node 单测的兜底：线上必须由 openBoard 注入真实塔层数，
  // 否则将来加一层（结局改在第 14 层发生）时，所有通关行会被一律判成「未竟」——一个静默的、全榜级别的假话。
  ok(mainSrc.indexOf('topFloor: D.floors.length') >= 0, '塔友榜拿真实塔层数（默认 13 只在单测兜底）');
}

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
ok(byVow.rows.length === 1 && byVow.rows[0].vowTag === '行', '苦行档只出苦行局');
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
ok(today.note.indexOf(V.NOTE_DAILY) === 0, '今日档带「零点换塔」那句解释');
// 朋友昨天贴进来的「今日一塔」码会在今日档整行消失——得说清它去了哪，否则读作「收下的挑战丢了」
ok(today.note.indexOf(V.NOTE_STALE(1)) >= 0, `今日档报出别的日子的挑战行数（实测「${today.note}」）`);
const todaySame = V.boardModel({
  mine: [], rivals: [{ code: 'TM5.sameday', floor: 9, daily: '2026-11-16' }],
  shadows: [], filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS,
});
ok(todaySame.rows.length === 1 && todaySame.note.indexOf('别的日子') < 0,
  '同一天的挑战行进今日档，且不触发「别的日子」那句（没丢就不必说）');
const todayNoTag = V.boardModel({
  mine: [], rivals: [{ code: 'TM4.old', floor: 9, daily: '' }],
  shadows: [], filter: 'all', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS,
});
ok(todayNoTag.note.indexOf('别的日子') < 0, '「全部」档不说这句（那一档没有筛掉任何人）');
const todayDup = V.boardModel({
  mine: [], rivals: [{ code: 'TM5.dup', floor: 5, daily: '2026-11-10' }, { code: 'TM5.dup', floor: 5, daily: '2026-11-10' }],
  shadows: [], filter: 'daily', todayKey: '2026-11-16', dayLabel: '11月16日', vows: VOWS,
});
ok(todayDup.note.indexOf(V.NOTE_STALE(1)) >= 0, '同一条挑战重复存也只报一条（按码去重）');
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

// 档位表：全集合唯一来源。右值从**真实数据表**现算（vm 里跑一遍 data.js，取 GAME_DATA.vows）——
// 免费主路（无 ember 价目）各一档、付费助力合并进「aid」。
// 以前这里抄了 8 个 id 作字面量：誓约从 4→6 条、再从 6 条改成三路，断言都「看起来是绿的」。
const REAL_VOWS = (() => {
  const vm = require('vm');
  const w = {};
  vm.runInNewContext(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'data.js'), 'utf8'), { window: w });
  return (w.GAME_DATA || {}).vows || {};
})();
{
  const tabIds = V.BOARD_TABS.map((t) => t[0]);
  const freeIds = Object.keys(REAL_VOWS).filter((k) => !REAL_VOWS[k].ember);
  const paidIds = Object.keys(REAL_VOWS).filter((k) => !!REAL_VOWS[k].ember);
  ok(freeIds.length > 0 && freeIds.every((id) => tabIds.indexOf(id) >= 0),
    `每条免费主路都有自己的档（数据 ${freeIds.join('/')} → 表 ${tabIds.join('/')}）`);
  ok(paidIds.length > 0 && paidIds.every((id) => V.isAid(id, REAL_VOWS)) && !V.isAid('none', REAL_VOWS),
    `「助力」覆盖集＝带价目的那几条（${paidIds.join('/')}）`);
  ok(tabIds.length === 2 + freeIds.length + (paidIds.length ? 1 : 0),
    `档位数由数据算出：全部/今日 2 + 主路 ${freeIds.length} + 助力 ${paidIds.length ? 1 : 0}（实测 ${tabIds.length}）`);
  // 徽记只放一个字，所以这一个字必须能把所有誓约分开。11-26 实测：「重压」与「重金」首字都是「重」，
  // 榜上「你 重 11层」读不出走的是哪条路——取末字（齿/压/羽/金/行/色/名）才互不相同。
  const marks = Object.keys(REAL_VOWS)
    .map((k) => ({ id: k, m: String(REAL_VOWS[k].tag || '').slice(-1) }))
    .filter((x) => x.m);
  ok(new Set(marks.map((x) => x.m)).size === marks.length,
    `徽记一个字就能分开所有誓约（${marks.map((x) => x.id + '=' + x.m).join('/')}）`);
}
// 「助力」档的行为要用能分出免费/付费的样本（上面那份 VOWS 是三条精简样本，既没有三路也没有价目）
{
  const paid = {
    none: { name: '不立誓', tag: '' },
    dmg10: { name: '利齿之誓', tag: '利齿' },
    ascetic: { name: '苦行之誓', tag: '苦行', ember: 24 },
  };
  const aidBoard = V.boardModel({
    mine: [{ floor: 5, vow: 'ascetic' }, { floor: 4, vow: 'dmg10' }, { floor: 3, vow: 'none' }],
    rivals: [], shadows: [], filter: 'aid', todayKey: '2026-11-16', vows: paid,
  });
  ok(aidBoard.rows.length === 1 && aidBoard.rows[0].vowTag === '行', '助力档只出买下的那几条誓约的局');
  // 一条助力都没买时不能喊「去立一条誓约」（那是做不到的动作）
  const aidLocked = V.boardModel({
    mine: [], rivals: [], shadows: [], filter: 'aid', todayKey: '2026-11-16', vows: paid,
    hasVow: () => false,
  });
  ok(/✦/.test(aidLocked.empty) && aidLocked.empty.indexOf('去立一条誓约') < 0,
    `没买过助力时空档说清要花 ✦（实测「${aidLocked.empty.slice(0, 20)}」）`);
  const aidOwned = V.boardModel({
    mine: [], rivals: [], shadows: [], filter: 'aid', todayKey: '2026-11-16', vows: paid,
    hasVow: (id) => id === 'ascetic',
  });
  ok(aidOwned.empty.indexOf('这一档还没有人') >= 0, '买过助力但还没走过：空档指路去走一局');
}
ok(V.BOARD_TABS.filter((t) => t.on).length === 0 && V.boardModel({ filter: 'dmg10', vows: VOWS, mine: [], shadows: [] }).tabs.filter((t) => t.on)[0].id === 'dmg10', '当前档位标记唯一');

// 立誓页首局的锁卡是「展柜」（2026-11-27 自动轮）：内容照旧全看得见（用户 11-26 定稿），
// 但第一局的余烬必为 0，点它只会各弹一句同义的「余烬不够」⇒ 不接点击、价目旁写清出处。
{
  const vowFn = mainSrc.slice(mainSrc.indexOf('function renderVowPanel'), mainSrc.indexOf('function openVow'));
  ok(vowFn.indexOf('const firstRun = isFirstRun();') >= 0 && vowFn.indexOf('const shelf = locked && firstRun;') >= 0,
    '首局锁卡走 shelf 分支（isFirstRun 同源，别另造一份首局判定）');
  ok(vowFn.indexOf("classList.contains('shelf')") > 0 && vowFn.indexOf("b.addEventListener('click'") > vowFn.indexOf("classList.contains('shelf')"),
    '展柜卡不接点击事件（先判 shelf 再绑 click）');
  ok(/打完这局攒/.test(vowFn), '展柜卡的价目旁要写清「打完这局攒」，不能只有一把锁');
  // 键盘 Enter 绕开点击绑定，守卫必须落在 chooseVow 里
  const chooseFn = mainSrc.slice(mainSrc.indexOf('function chooseVow'));
  ok(chooseFn.indexOf('if (isFirstRun()) { warn(') >= 0 && chooseFn.indexOf('if (isFirstRun()) { warn(') < chooseFn.indexOf('Meta.buy('),
    'chooseVow 在花 ✦ 之前拦下首局（键盘 Enter 也走这里）');
  ok(/\.vow-card\.locked\.shelf \{ cursor: default; \}/.test(cssSrc), '展柜卡不给手型（能亮的才是能点的）');
}

// 纯函数：不该把调用方传进来的记录改写（原实现 map 时就地套了 mine:true）
const rawRec = { floor: 7, steps: 10, time: 90 };
V.boardModel({ mine: [rawRec], rivals: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(rawRec.mine === undefined, '模型不改写入参记录');

// ---------- 收码后那句话：谁走得更远只能由两边成绩算，不能写死 ----------
// 旧实现无条件接「爬得比他更高」：朋友贴来更深的码，紧跟着画出来的榜却把他排第一行。
const vNone = V.rivalVerdict({ floor: 9 }, []);
ok(vNone.id === 'none' && V.rivalVerdict({ floor: 9 }, null).id === 'none' && vNone.text === V.VERDICT_NONE,
  '自己名录里还没有通关那局：不判胜负，只说名录规则');
// 这一支的判据是 `mine` 为空，而 `mine` 只收通关局 ⇒ 死在第 5 层的玩家也在这里。
// 所以那句话不许假设「他没玩过」——它必须对「没玩过」与「走过但没过」两种人都成立。
ok(vNone.text.indexOf('你先走一局') < 0, `不许再说「你先走一局」（死过一次的人也在这一支）：${vNone.text}`);
ok(/名录/.test(vNone.text) && /塔顶|通关/.test(vNone.text),
  `那句话说清的是名录规则（哪局才记 / 记了才比得出）：${vNone.text}`);
const vHi = V.rivalVerdict({ floor: 3 }, [{ floor: 5 }, { floor: 9 }]);
ok(vHi.id === 'higher' && vHi.gap === 6 && vHi.text.indexOf('比他高 6 层') >= 0,
  '自己更深：说「比他高 N 层」并报出差值（取自己最好那局，不是最后那局）');
const vLo = V.rivalVerdict({ floor: 12 }, [{ floor: 4 }]);
ok(vLo.id === 'lower' && vLo.gap === 8 && /他比你高 8 层/.test(vLo.text) && vLo.text.indexOf('去追') >= 0,
  '朋友更深：照实说「他比你高 N 层」，不许说成自己领先');
const vTie = V.rivalVerdict({ floor: 7 }, [{ floor: 7 }]);
ok(vTie.id === 'tie' && /一样深/.test(vTie.text), '同层就说同层，不给一样深的人编胜负');
ok([vNone, vHi, vLo, vTie].every((v) => v.text.length <= 24), '判定句一律 ≤24 字（与战前卡副标题同一档单行上限）');
ok(!/比他高/.test(vNone.text) && !/比他高|爬得比/.test(vLo.text), '无语境（无自己成绩 / 自己落后）时不许出现「比他高」');
// 源码契约（「不许写死」与「两条入口都走它」）挪到 stripComments 之后，见下方同名小节

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

// ---------- 一位好友换一次成绩，就在榜上多占一行（2026-11-24 加练·社交） ----------
// 微信好友榜每次回的是「这位好友的最新成绩」，同一个人换一次成绩就换一个 code（`wx:名字:层:时`），
// 而名录与榜单原先只按 code 去重。于是：一位好友连爬三天 = 榜上三行同名，十行榜只装得下三个人。
// 11-18 那轮把「同一个人只占一行」写进了榜单，但只对自己（mine）成立，好友那半截漏了——注释在说谎。
const repeatRuns = [
  { code: 'wx:阿岩:9:600', name: '阿岩', rival: true, floor: 9, time: 600, steps: 300 },
  { code: 'wx:阿岩:7:700', name: '阿岩', rival: true, floor: 7, time: 700, steps: 320 },
  { code: 'wx:阿岩:5:800', name: '阿岩', rival: true, floor: 5, time: 800, steps: 340 },
];
const onePerson = V.boardModel({ mine: [], rivals: repeatRuns, shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS });
ok(onePerson.rows.length === 1 && onePerson.rows[0].floor === 9 && onePerson.total === 1,
  '同一位好友的三次成绩在榜上只占一行，且留的是最好那局');
const pastedTwo = V.boardModel({
  mine: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
  rivals: [
    { code: 'TM5.aa', name: '挑战·朋友', rival: true, floor: 8, time: 400 },
    { code: 'TM5.bb', name: '挑战·朋友', rival: true, floor: 6, time: 500 },
  ],
});
ok(pastedTwo.rows.length === 2, '两个不同的贴码朋友（都退回「挑战·朋友」）不被折成一行');
const noId = V.boardModel({
  mine: [], shadows: [], filter: 'all', todayKey: '2026-11-16', vows: VOWS,
  rivals: [{ floor: 4, time: 100 }, { floor: 3, time: 100 }],
});
ok(noId.rows.length === 2, '既没名字也没码的行不折叠（判断不了是不是同一个人）');
const cappedRepeat = V.capRivals(repeatRuns.concat([{ code: 'TM5.仅此一码', rival: true, floor: 6 }]));
ok(cappedRepeat.length === 2 && cappedRepeat[0].floor === 5,
  `名录里同一位好友只占一个位（12 个位置留给 12 个人），且留最新那条（实测 ${cappedRepeat.map((x) => x.floor).join(',')}）`);
ok(V.personKey({ mine: true }) === '#me' && V.personKey(null) === '', '身份键：自己是固定键，空记录不参与折叠');
ok(V.personKey({ name: '阿岩', code: 'wx:阿岩:5:1' }) === V.personKey({ name: '阿岩', code: 'wx:阿岩:9:2' }),
  '身份键认名字不认码（好友换成绩，人还是那个人）');
ok(V.personKey({ name: '挑战·朋友', code: 'TM5.x' }) !== V.personKey({ name: '挑战·朋友', code: 'TM5.y' }),
  '贴码行没有名字，按码区分（两个朋友不许被折成一个）');
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
// 收码那句「谁更远」只有一处定义（view.js 的 rivalVerdict），一条渲染出口（main.js 的 rivalHint），
// 而它必须**每次开榜重算**：判定比的是「你此刻的成绩」，收码时算一次就冻住，玩家爬得更高后那行会当场说错
//（2026-11-26 01:2x 加练·社交修的就是这个——旧写法两条入口各写一次 textContent）。
const mainCode = stripComments(mainSrc);
ok(!/爬得比他更高|爬得比他深/.test(mainCode), 'main.js 不许再写死「爬得比他更高」（注释里提到不算）');
ok(/function rivalHint\(/.test(mainCode) && (mainCode.match(/View\.rivalVerdict\(/g) || []).length === 1,
  '判定句只在 rivalHint 里取一次，别处不许自造一份「谁更远」');
ok(/function refreshBoardHint\(/.test(mainCode) && (mainCode.match(/rivalHint\(/g) || []).length === 2,
  '判定句只在 refreshBoardHint 一处生成（两条入口只记「收到了哪一局」）');
ok(/function openBoard\([\s\S]{0,6000}?refreshBoardHint\(\)/.test(mainCode),
  '每次开榜都按当前最好成绩重算那行（否则玩家超过他之后还是旧读数）');
ok((mainCode.match(/\$\('boardHint'\)/g) || []).length === 1 && (mainCode.match(/lastRival = \{/g) || []).length === 2,
  '两条入口（贴码 / 落地）都不许把判定句钉在收码那一刻（只有 refreshBoardHint 碰那行）');
ok(/function refreshBoardHint\([\s\S]{0,600}?mine: loadBoard\(\)/.test(mainCode),
  '重算用的必须是当前成绩（loadBoard），不是收码时的快照');
// 顶部提示条 #warnPill 是 nowrap + 92vw + ellipsis：实测 45 字 = 431px，430 屏可用 364px、320 屏只有 262px。
// 所以判定句与「名录满」这类尾巴只能落在榜面板那行（会换行），提示条只报「层 + 用时」。
const landWarn = mainCode.match(/`收下了挑战[^`]*`/g) || [];
ok(landWarn.length === 2 && landWarn.every((s) => !/今天这座|比他高|去追|rivalVerdict|sameDay/.test(s)),
  '落地提示条只报层/用时/挤人（判定与今日标归面板那行，提示条放不下会被省略号吃掉）');
ok(landWarn.some((s) => /挤掉最早那条/.test(s)), '挤掉名录里别人时提示条当面说清');
// 字数上限按实测校准：同样写法 26 字 = 227px、23 字（挤人那句）= 241px；320 屏可用 262px ⇒ 上限 26 字
ok(landWarn.length === 2 && landWarn.every((s) => s.replace(/\$\{[^}]*\}/g, '12').length <= 26),
  `落地提示条 ≤26 字（320 屏 262px 的实测上限；实得 ${landWarn.map((s) => s.replace(/\$\{[^}]*\}/g, '12').length).join('/')} 字）`);
// 首局落地是「别人把链接发给你」这条漏斗的唯一落点（2026-11-27 19:xx 加练 社交）：
// 塔友榜第 2 局起才露脸，所以这一刻除了这条提示，玩家拿不到任何关于「挑战」的信息。
// 旧句一律说「收下了挑战·朋友：第 N 层 · 用时 X」——一个此刻还不存在的名词（榜上那个名字）
// 加一组没有比较对象的数字（层 / 用时，他连塔都没进过），而他的眼睛正在开场三行上。
// 契约：① 首局那支必须自己给落点（打完这局就能比）；② 不许用它此刻读不懂的榜上术语；
// ③ 停留要比默认长（默认 readMs 对 20 字只有 ~2.6s）；④ 首局不许顺手把榜打开（首屏 ≤1 个可点项）。
{
  const fb = /if \(firstRunLanding\) \{([\s\S]*?)\} else warn\(/.exec(mainCode);
  const body = fb ? fb[1] : '';
  const lits = (body.match(/`[^`]*`/g) || []).map((s) => s.slice(1, -1));
  ok(!!body && lits.length === 2, `首局落地有自己的一句（现 ${lits.length} 条，应为 2：挤人 / 不挤人）`);
  const plain = lits.filter((s) => !/挤掉最早那条/.test(s));
  ok(plain.length === 1 && /打完这局/.test(plain[0] || ''),
    `首局那句必须给出落点（现：${plain[0] || '缺'}）`);
  ok(lits.every((s) => !/挑战·朋友/.test(s)),
    '首局那两句都不许用「挑战·朋友」（榜还没露脸，这个词对他是凭空的名词）');
  ok(/挤掉最早那条/.test(body), '首局也不许把「挤掉别人」吞掉（名录满与首局无关）');
  ok(/,\s*3[0-9]{3}\)/.test(body), '首局那句的停留 ≥3000ms（默认 readMs 对 20 字只有 ~2.6s）');
  const longLit = lits.map((s) => s.replace(/\$\{[^}]*\}/g, '12')).sort((a, b) => b.length - a.length)[0] || '';
  ok(!!longLit && longLit.length <= 26, `首局那两句同样 ≤26 字（320 屏 262px 上限；最长 ${longLit.length} 字：${longLit}）`);
  ok(/if \(!firstRunLanding\) openBoard\(\)/.test(mainCode),
    '首局不替玩家开榜（首屏只留 1 个可点项）');
}

const pasteWarn = mainCode.match(/warn\(dup \?[^\n]*?\);/g) || [];
ok(pasteWarn.length === 1 && !/名录满|evictTag/.test(pasteWarn[0]), '贴码提示条同样不带长尾（名录满那句在面板里说）');

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

// 战前面板 → 战斗层的交接（2026-11-24 加练美术焦点C）：两块都是暗场，中间不许闪一帧亮棋盘。
// 面板收起是瞬时的，战斗层若还走通用 0.18s 淡入，会先露一帧棋盘再压暗（实测交接后 30ms 遮幕 opacity 0）。
// 这条契约盯的是「两边都写了」：JS 打了 nofade、CSS 没人接（或规则被删）时，闪帧会静默回来。
{
  const cssPrep = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const jsHandoff = /classList\.toggle\('nofade', fromPrep\)/.test(stripComments(mainSrc))
    && /prepHandoff = true/.test(stripComments(mainSrc));
  const cssHandoff = /\.overlay\.battle-scene\.nofade\.show\s*\{[^}]*animation:\s*none/.test(cssPrep);
  ok(jsHandoff, '战前面板收起时打了交接标记（战斗层据此跳过淡入）');
  ok(cssHandoff, 'CSS 接了那边的标记：nofade 时遮幕同帧就位（否则又要闪一帧棋盘）');
}

// ---------- 打法的入口只有「战前」一处（2026-11-24 加练·游戏性焦点D） ----------
// 11-24 把格挡 / 架盾 / 缠斗从战斗面板搬到「战前」面板之后，战斗面板那三块按钮一律 hidden。
// 可全作还有 7 处在教「战斗中点盾」——新玩家照做会去战斗面板找那个盾，而它按设计不在了。
// 契约两半：①战斗面板确实不再摆按钮；②没有任何一处文案还把打法指到战斗中（注释不算）。
{
  const fs2 = require('fs'), p2 = require('path');
  const read2 = (rel) => fs2.readFileSync(p2.join(__dirname, '..', rel), 'utf8');
  const noCmt2 = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const staleWords = ['战斗中点盾', '战斗中可把', '战斗中点一下'];
  const sources = ['js/story.js', 'js/main.js', 'js/data.js', 'js/view.js', 'index.html']
    .map((rel) => [rel, noCmt2(read2(rel))]);
  const stale = sources
    .filter(([, s]) => staleWords.some((w) => s.indexOf(w) >= 0))
    .map(([rel]) => rel);
  ok(stale.length === 0, `没有一处把打法指到「战斗中」（命中：${stale.join(',') || '无'}）`);
  const count = (rel, w) => noCmt2(read2(rel)).split(w).length - 1;
  ok(count('js/story.js', '撞怪时先挑「格挡」') >= 2, '盾谱小传与「还没学格挡」两处都改口到战前');
  ok(count('js/main.js', '撞怪时先挑「格挡」') >= 2, '格挡 pip 与「格挡已学会」提示条都改口到战前');
  ok(count('js/data.js', '撞怪时先挑「格挡」') >= 1 && count('index.html', '撞怪时在战前挑「格挡」') >= 1,
    '老兵明码与玩法说明同口径');
  const mainNoCmt2 = noCmt2(read2('js/main.js'));
  ok(/\[el\.bsBlock, el\.bsGuard, el\.bsTangle\]\.forEach/.test(mainNoCmt2) && /b\.hidden = true/.test(mainNoCmt2),
    '战斗面板三块打法按钮开战即收起（所以「战斗中」这类说法必须删干净）');
}

// ---------- 线稿是同一支笔：黄铜亮档只有一个值（2026-11-24 加练·美术焦点D） ----------
// 全作有两套线稿：誓约徽记（`vow-icons.js`，线色**硬编码** #e8c46a，因为要支持运行时的 hi 替换）
// 与战前卡四枚图标（`view.js` PREP_ICON，走 `stroke="currentColor"` + CSS `var(--gold)`）。
// 两套并排读作同一支笔，靠的是「数值相同」——而这是个两处存值的隐患：改 `--gold` 忘了改 vow-icons，
// 或者反过来，界面就分成两支笔，且没有任何闸门会红（截图看不出 8 位色差）。
{
  const fs3 = require('fs'), p3 = require('path');
  const cssSrc = fs3.readFileSync(p3.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const vowSrc = fs3.readFileSync(p3.join(__dirname, '..', 'js', 'vow-icons.js'), 'utf8');
  const goldVar = (/--gold:\s*(#[0-9a-fA-F]{3,6})/.exec(cssSrc) || [])[1];
  const vowGold = (/stroke="(#[0-9a-fA-F]{3,6})"/.exec(vowSrc) || [])[1];
  ok(!!goldVar && !!vowGold && goldVar.toLowerCase() === vowGold.toLowerCase(),
    `誓约徽记的线色与 --gold 同值（css ${goldVar} / vow-icons ${vowGold}）`);
  const prepBlock = (/const PREP_ICON = \{([\s\S]*?)\n  \};/.exec(viewSrc) || [])[1] || '';
  const prepIcos = (prepBlock.match(/<svg /g) || []).length;
  ok(prepIcos === 4, `战前卡四枚线刻图标都在（实得 ${prepIcos}）`);
  ok(prepBlock.indexOf('stroke="currentColor"') >= 0 && prepBlock.indexOf('#') < 0,
    '战前图标不写死颜色，一律 currentColor 交给 CSS（换色只改一处）');
  ok((prepBlock.match(/viewBox="0 0 24 24"/g) || []).length === prepIcos
    && (prepBlock.match(/stroke-width="1\.6"/g) || []).length === prepIcos,
    '四枚图标的画布与粗细同一档（24×24 / 1.6，与誓约徽记的大形同笔）');
}

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
// 折戟走同一份模型（2026-11-27 自检轮）：main.js 原先另算 `floor(击杀/5)`，三处跟着偏。
// 四条契约：击杀单价与胜局同源 / 通关专属锁环不给 / 局内做过的事照算 / 零战果不给保底。
const dBase = (flags) => V.emberModel({
  s: { ending: null, gold: 0, flags: flags || {} },
  echoDone: 0, mode: 'death', vowDef: { name: '不立誓', reward: 3 }, vowId: 'none', fx: emberFx(),
});
const dKill40 = dBase({ killCount: 40 });
ok(dKill40.total === 4 && dKill40.parts.some((p) => p.label === '击杀 40 只' && p.n === 4),
  `折戟击杀与胜局同价（40 只 → +4，实测 ${dKill40.total}）`);
ok(dBase({ killCount: 0 }).total === 0, '折戟零战果 = 0（不给保底，否则「一进塔就倒」成了刷余烬的最快路径）');
ok(dBase({ killCount: 0 }).parts.length === 0, '折戟零战果时明细为空（不许留一行「走到结局 +0」）');
ok(!dBase({ killCount: 40 }).parts.some((p) => p.label === '走到结局'), '折戟不给「走到结局」那 5 点');
const dShard = V.emberModel({
  s: { ending: null, gold: 0, flags: { killCount: 10, heartShard: true } },
  echoDone: 0, mode: 'death', vowDef: { name: '不立誓' }, vowId: 'none', fx: emberFx(),
});
ok(dShard.total === 9 && dShard.parts.some((p) => p.n === 8), '塔心碎片「结算时 +8」在折戟也兑现（实测合计 ' + dShard.total + '）');
const dRing = (id) => V.emberModel({
  s: { ending: null, gold: 300, flags: { killCount: 30, retries: 0 } },
  echoDone: 0, mode: 'death', vowDef: { name: '不立誓' }, vowId: 'none',
  fx: emberFx({ hasRing: (k) => k === id }),
});
ok(dRing('ledger').total === 6, '名册之环（击杀翻倍）在折戟照算（30 只 → 3 + 3）');
['quill', 'seventh', 'hour', 'oath', 'pace', 'chisel', 'finale', 'clean'].forEach((id) => {
  ok(dRing(id).total === 3, `通关型锁环 ${id} 在折戟不给（只留击杀那 3 点）`);
});
// 源码契约：败局出口不许再长出第二份「击杀 ÷ N」的实现（这次漂移就是这么来的）
{
  const i = mainSrc.indexOf('function showDeath(');
  const body = i < 0 ? '' : mainSrc.slice(i, i + 2200);
  ok(i > 0 && /emberOf\(s, 0, vowDef, 'death'\)/.test(body), '败局余烬走 emberOf(..., death)');
  ok(!/killCount \|\| 0\) \/ 5/.test(body), '败局不许再手算 floor(击杀/5)');
}
const eKill = V.emberModel({ s: { ending: 'true', flags: { killCount: 37 } }, echoDone: 4, vowDef: {}, vowId: 'none', fx: emberFx() });
ok(eKill.total === 12 && eKill.parts.some((p) => p.label === '击杀 37 只' && p.n === 3), '击杀每 10 只 +1（37 只 → +3）');
const eLedger = V.emberModel({
  s: { ending: 'true', flags: { killCount: 40 } }, echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'ledger' }),
});
ok(eLedger.parts.some((p) => p.label === '锁环·击杀余烬翻倍' && p.n === 4), '击杀翻倍环把击杀这一项再加一遍（不是重算总数）');
// 拾柴之环（第 2 章）是「名册 + 每位锁匠 1」两笔，不是只给锁匠那一笔。
// 2026-11-27 自检第 4 面发现：代码一直在给两笔，desc 只写了锁匠那半句 ⇒ 玩家读卡算不出实际收益，
// 而平衡文档把它记成「每位锁匠 +1 的偏强环」，说明连读文档的人也被 desc 带偏过。
// 这条断言守两件事：明细里两笔都在；desc 必须同时提到「10 只」与「锁匠」。
const eAsh = V.emberModel({
  s: { ending: 'true', flags: { killCount: 40, bossKilled_N: true, bossKilled_Z: true } },
  echoDone: 4, vowDef: {}, vowId: 'none',
  fx: emberFx({ hasRing: (id) => id === 'ash' }),
});
ok(eAsh.parts.some((p) => p.label === '锁环·击杀余烬翻倍' && p.n === 4)
  && eAsh.parts.some((p) => p.label === '锁环·拾柴（2 位锁匠）' && p.n === 2),
  '拾柴之环给两笔：击杀翻倍 + 每位锁匠 1（实测 ' + eAsh.parts.map((p) => p.label + '=' + p.n).join(' / ') + '）');
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
const eDeathVow = V.emberModel({
  s: { over: true, hp: 0, ending: null, flags: { killCount: 3 } }, echoDone: 0,
  vowDef: { name: '重压之誓', reward: 12, ember: 0 }, vowId: 'dmg20', fx: emberFx(),
});
ok(!eDeathVow.parts.some((p) => p.label === '「重压之誓」' && p.n === 12), '折戟不结算誓约奖励（否则高难誓约送死就能刷 ✦）');
const eDeathFirst = V.emberModel({
  s: { over: true, hp: 0, ending: null, flags: {} }, echoDone: 0,
  vowDef: { name: '无名之誓', reward: 0, ember: 48 }, vowId: 'nameless',
  fx: emberFx({ firstWin: () => false }),
});
ok(!eDeathFirst.parts.some((p) => p.label.indexOf('首通') === 0), '折戟也不领「首通」回本（解锁成本只退给真的走完一局的人）');
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
  && mainSrc.indexOf('function emberModel') < 0,
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
// 2026-11-25 06:5x：这条守的是**战斗面板那块**（`tangleModel.html`，11-24 起开战即收起、玩家看不到），
// 战前卡不再抄这句话了——卡上写「多掉 N 血换经验 ×2」（见下方 prep 卡四条）。
// 两块屏的句子各自归各自，别再合流：合流正是这张卡原先带 emoji、重复卡名的原因。
ok(tm.html.indexOf('多挨一轮 +40 血 · 经验 ×2') > 0, '战斗面板那块仍写「+N 血」（不与格挡的「省下 N%」共用一个符号）');
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
ok(prep[3].sub.indexOf('多掉 40 血换经验 ×2') >= 0,
  `缠斗卡写清多掉多少、换到什么（实测「${prep[3].sub}」）`);
// 卡片副标题的统一口径（2026-11-25 06:5x 加练·游戏性焦点D）：四张卡里只有缠斗那张此前是
// 「把战斗面板那一块剥掉标签当副标题」，于是它同时踩了三件事——emoji 与左侧线刻图标并存、
// 卡名在副标题里又念一遍（剥标签还把 `<b>缠斗</b><span>多挨一轮` 粘成「缠斗多挨一轮」）、
// 「+40 血」用加号指向**掉的血**（同一张卡右边写着「−360」）。三条各钉一条，谁再抄整句就红。
const prepSubs = prep.map((x) => x.sub);
ok(!prepSubs.some((s) => /[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(s)),
  '战前卡副标题里不出现 emoji（图标只走左边那枚线刻，彩色卡通会抢焦点）');
ok(!prepSubs.some((s, i) => s.indexOf(prep[i].name.split(' · ')[0]) >= 0),
  '副标题不重复卡名（卡名已经说了「缠斗 / 格挡 / 架盾」，副标题只补账）');
ok(!prepSubs.some((s) => /[+＋]\s*\d+\s*血/.test(s)),
  '掉血的数不许用加号（同一张卡右边是「−N」，加号读起来像回血）');
ok(prep[3].sub.indexOf('多挨一轮') < 0, '副标题不重复卡名的后半句（卡名已经是「缠斗 · 多挨一轮」）');
// 副标题一行放得下：430 宽下 `.po-main i` 是单行（架盾卡 24 字是实测上限），
// 多一个词就折成两行、四张卡高度不齐——长度也算契约，不然「写清楚」会一路写到折行为止。
ok(prepSubs.every((s) => s.length <= 24),
  `四张卡的副标题都单行放得下（最长 ${Math.max.apply(null, prepSubs.map((s) => s.length))} 字 / 上限 24）`);
ok(V.prepOptions(Object.assign({}, prepF, { hasBlock: false })).length === 3, '不会格挡时不摆格挡卡');
// 战前面板的「上次打这一种」：只说发生过的事（打法 + 实际掉血），没有就不出现
ok(V.lastTacticLine(null) === '', '没有上次记录时不写记忆行');
const lastB = V.lastTacticLine({ p: 'b', d: 176 });
ok(lastB.indexOf('格挡') >= 0 && lastB.indexOf('176') >= 0, '记忆行写出上次的打法与掉血');
ok(V.lastTacticLine({ p: 'n' }).indexOf('直接打') >= 0, '没有掉血数时只写打法');
// 记忆行的身份口径（2026-11-25 16:2x 加练·叙事）：引擎按**怪种**存 `flags['tac_' + ch]`，
// 而同一只怪被打死就从图上消失、永远不会再遇见 ⇒「上次对这只」每次出现时指的都是**另一只**，
// 最刺眼的是后半塔（无面者第 8–13 层各一只，玩家在第 12 层读到的却是第 8 层那只的成绩）。
// 这行是「塔记着你是怎么打的」这条主题唯一的出口，说错身份比不说更糟。
ok(lastB.indexOf('这一种') >= 0 && !/这一?只/.test(lastB),
  `记忆行说的是「这一种」而不是「这只」（实测「${lastB}」）`);
ok(stripComments(viewSrc).indexOf('上次对这只') < 0,
  'view.js 里不再出现「上次对这只」（说错身份的那份文案）');
ok(V.prepOptions(Object.assign({}, prepF, { nonTrivial: false, floor: 0 })).length === 1, '杂兵小架只留「直接开打」');
// 锁芯开场那一句读数（2026-11-26 加练·叙事）：地图上四段章色弧是锁环系统唯一的现场读数，
// 而这一屏是锁环篇的收口。三件事各钉一条：数要说对、旧档不许说谎、文案只许有一份。
const CHN = ['零', '一', '两', '三', '四'];
ok([0, 1, 2, 3, 4].every((n) => typeof V.coreRingLine(n) === 'string' && V.coreRingLine(n).length > 10),
  '锁环 0~4 五档都有话（不出现空白旁白）');
ok(new Set([0, 1, 2, 3, 4].map((n) => V.coreRingLine(n))).size === 5, '五档文案互不相同（数不同就念不同的话）');
ok([1, 2, 3, 4].every((n) => V.coreRingLine(n).indexOf(CHN[n] + '道') >= 0),
  '每一档都念出真实数目（一道/两道/三道/四道）');
ok(V.coreRingLine(4).indexOf('都亮着') >= 0 && V.coreRingLine(0).indexOf('全是暗的') >= 0,
  '满环说「都亮着」、零环说「全是暗的」');
ok(V.coreRingLine(0).indexOf('都亮着') < 0,
  '旧档零锁环时不写「四道都亮着」（v2.0 存档迁上来 rings=[] 会当场成假话）');
// 2026-11-26 03:4x 追认（第二节「新零件追认」）：上一轮那句旁白让人「低头看脚下」，
// 而这一屏是 `KEY_SCENE.core → core.webp` 的不透明 CG（`.bd-shot` z-index:1）——那一刻画面上
// 只有石阶与神龛，脚下什么也没有。两条钉住：①不许再指地面；②必须指向画面上真有的东西（石头）。
{
  const RING = [0, 1, 2, 3, 4].map((n) => V.coreRingLine(n));
  ok(RING.every((t) => !/脚下|低头|地面|脚边/.test(t)),
    '锁环五档都不许让人低头看地面（锁芯那一屏是不透明 CG，地面被盖住——说了玩家也看不到）');
  ok(RING.every((t) => t.indexOf('石头') >= 0),
    '锁环五档都从石头说起（CG 与地图上都在的东西；指向画面里没有的位置就是假话）');
}
ok(V.coreRingLine(9) === V.coreRingLine(4) && V.coreRingLine(-3) === V.coreRingLine(0)
  && V.coreRingLine(undefined) === V.coreRingLine(0) && V.coreRingLine('2') === V.coreRingLine(2),
  '越界/负数/未定义/字符串都收到 0~4 之间（数组末位与首档不越界）');
ok(/View\.coreRingLine\(Engine\.rings\(\)\.length\)/.test(mainSrc),
  '锁芯开场按 Engine.rings() 的真实枚数取句（不许写死一句）');
ok(stripComments(mainSrc).indexOf("playStory('core')") < 0,
  '锁芯不再直接 playStory(\'core\')（那样就绕开了读数那一句）');
ok(storySrcTop.indexOf('四道弧') < 0,
  'story.js 的静态稿里不出现「四道弧」（读数只许有一份实现）');
// 「只有格挡能活」的那一场（blockSave）：这一档里引擎会强制替玩家挡（main 的 autoBlock），
// 所以「直接开打」写着「撑不住」却没有对应后果、「缠斗」的多挨一轮与经验也拿不到（格挡优先）。
// 两张撤掉，只留真能走的两条路——焦点A：卡上承诺的后果必须是真的发生的那一个。
const prepSave = V.prepOptions(Object.assign({}, prepF, { blockSave: true, hp: 200 }));
ok(prepSave.length === 2 && prepSave[0].id === 'block' && prepSave[1].id === 'guard',
  `残血那一场只摆格挡/架盾（实得 ${prepSave.map((x) => x.id).join(',')}）——不摆点了也不会照做的「直接开打」「缠斗」`);
ok(prepSave[0].dmg === 176 && prepSave[0].dmg < 200, '残血那一场格挡卡写的承伤是真实会发生的那个数（不是撑不住的白打数）');
ok(V.prepOptions(Object.assign({}, prepF, { blockSave: true, guard: null })).length === 1,
  '残血且还没到架盾的层：只剩一张卡 → main 见「只有一张」就不弹面板（读烛那句明话直接开打）');
ok(/blockSave:\s*!!pred\.blockSave/.test(stripComments(mainSrc)),
  'main.js 把 pred.blockSave 传进 View.prepOptions（不传则上面两条分支永远走不到＝死代码）');
// 2026-11-26 04:0x 自检轮：战前面板是「必须选一个」的屏（路遇 / 祭坛 / 锁芯门同类），Esc 故意不响应；
// 而全站其它浮层的 Esc 一律是「关掉」。原先这里把 Esc 绑成第一张卡（直接开打 = 承伤最大），
// 等于在「取消」的肌肉记忆上挂了最贵的动作，且面板上从不写这个键。两条钉住。
ok(stripComments(mainSrc).indexOf('pickPrepByKey(1)') < 0,
  '战前面板不再把 Esc 等同第一张卡（取消键不许绑定「直接开打」这个最贵的打法）');
{
  const branch = (stripComments(mainSrc).match(/prepOverlay\.classList\.contains\('show'\)\)\s*\{[\s\S]{0,200}?\n      \}/) || [''])[0];
  ok(branch.length > 0 && branch.indexOf('Escape') < 0,
    '战前面板的键盘分支里没有 Escape（必须选择的屏与路遇 / 祭坛 / 锁芯门同一条口径）');
}
// 节奏预算的执行点（2026-11-25 变体 6 节奏审计）：这张面板是**每场战斗**都要过的一屏，
// 「只有一种打法就不弹」是它不挤占前 3 分钟的唯一开关。写成 >=1 就等于每场杂兵前都插一屏
// 只有一个按钮的确认页——首局节奏预算是「教学弹窗 ≤2」，而这类屏不在那个计数口径里，
// 属于「闸门看不见的加屏」。这条断言守的就是那个 `> 1`。
ok(/\bif\s*\(\s*opts\.length\s*>\s*1\s*\)/.test(stripComments(mainSrc)),
  '战前面板只在「不止一种打法」时弹出（opts.length > 1）——改成 >=1 就是每场杂兵前多一屏单按钮确认');
// 前提（2026-11-24 焦点A 第 2 段）：战前卡里不会出现「点了必死」的一张——这是 openPrep 里
// 把「撑不住 / disabled」那一档删掉的前提。三条各由一处保证：①「直接开打」只在白打能活时出现
// （blockSave 时 View 撤卡，上面两条守着）②格挡/架盾永远比白打便宜 ③缠斗在引擎 tangleInfo 里
// 就把「缠完会死」滤掉（engine-test「缠完会死时不给缠斗选项」）。任一处破了这条先红，
// 那时必须把红字与 disabled 补回来——不许摆一张点了必死、又没有二次确认的卡。
ok(prep[1].dmg < prep[0].dmg && prep[2].dmg < prep[0].dmg,
  '格挡/架盾永远比白打便宜（比例 <1 破了，面板就会摆出一张会致死的卡）');

// 战前面板的提示行：首遇必须有归属（2026-11-24 22:4x 加练·叙事）
// 11-20 定的口径是「无主语的系统文案会被读成怪自己开口，引导必须有归属（烛 / 秤 / 塔灵）」，
// 而战前面板原先只有一句系统口吻。这里守两件事：首遇那版由烛开口、键位上限两版都随卡片数走。
const prepFirst4 = V.PREP_FIRST(4);
ok(prepFirst4.indexOf('烛：') === 0, `首遇那一次由烛开口（实测「${prepFirst4}」）`);
ok(prepFirst4.indexOf('1–4') >= 0 && V.PREP_FIRST(2).indexOf('1–2') >= 0,
  '首遇那版也带键盘入口，且上限随卡片数走（写死 1–4 会在两张卡时教出按不动的键）');
ok(prepFirst4.indexOf('不再改') >= 0, '首遇那版仍说清「定下就不能改」（规则不许只在第二版里）');
ok(V.PREP_HINT(4).indexOf('烛：') < 0 && V.PREP_HINT(4).indexOf('1–4') >= 0,
  '之后那版退回通用提示行（不再请人复述同一句），键盘入口仍在');
ok(stripComments(mainSrc).indexOf('选一种打法再开打') < 0
  && mainSrc.indexOf('View.PREP_FIRST') >= 0 && mainSrc.indexOf('View.PREP_HINT') >= 0
  && mainSrc.indexOf("Tips.mark('prepfirst')") >= 0,
  '提示行两版只在 view.js 定义（装配段不许再抄一份文案），首遇标记走 Tips.mark 一次性');

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
// 顶行排版契约：定性句必须独占整行。三件事挤一行（塔印 + 定性 + 余烬）时定性只剩 ~160px，
// 胜局折成「…遗物 2 ·／锁环 0」的孤儿行、败局把「用时 0秒」从数字中间劈开（tools/out/adsdeath.png 为证）。
// 这两条盯的是「结构」而不是像素：像素靠 6 张结算截图目检，结构在这里锁死，免得下次又被顺手改回一行。
ok((mainSrc.match(/class="es-top"><span class="es-grade/g) || []).length === 2, '两页（胜/败）都把塔印名与余烬收进 .es-top，定性另起一行');
ok(mainSrc.indexOf('<span class="es-meta">${score.meta}</span>\n      <span class="es-num">') < 0, '定性句不再夹在塔印名与余烬之间');
const endScoreCss = (cssSrc.match(/\.end-score \{[\s\S]*?\n\}/) || [''])[0];
ok(/flex-direction: column/.test(endScoreCss), '.end-score 竖排（上行塔印名+余烬，下行定性）');
ok(/\.es-top \{[^}]*justify-content: space-between/.test(cssSrc), '.es-top 把塔印名与余烬分到两头');
ok(/\.es-meta \{[^}]*word-break: keep-all/.test(cssSrc) && !/\.es-meta \{[^}]*flex: 1/.test(cssSrc),
  '.es-meta 独占整行且只在「 · 」处断行（数字不许跟单位分家）');
// 节奏守门（2026-11-26 06:5x 变体 6）：结算页是「≤4 个可交互元素」的顶格屏，
// 顶行这条定性句是**唯一还在长的**地方——从「结局 · 回响」一路加塔心、遗物、锁环长到 5 段，
// 才把 430 屏挤到折行。段数封顶后，下一件想上这行东西必须先挤掉一段，不能再靠换行解决。
ok(wScore.meta.split(' · ').length <= 5, '胜局顶行 ≤5 段（4/4 顶格屏，加东西只能换，不能靠折行）');
ok(dScore.meta.split(' · ').length <= 4, '败局顶行 ≤4 段');

// 余烬明细：合计与余额都由 before 算出来，渲染层不许再加一遍
const edm = V.emberDetailModel({ parts: [{ label: '走到结局', n: 5 }, { label: '念出第六个名字', n: 4 }], total: 9, before: 30 });
ok(edm.parts.length === 2 && edm.parts[1].html === '念出第六个名字 <b>+4</b>', '明细逐项带增量');
ok(edm.totalHtml === '合计 <b>+9</b>' && edm.balance === '✦ 30 → 39', '余额 = 落袋前 + 本局（不是随手拼两个数）');

// 空态（2026-11-27 加练·美术焦点B）：一件都没算上时，原来整行只剩「合计 +0」与「✦ 0 → 0」——
// 三个没名没姓的 0，玩家读不出「为什么是 0、差多少」。改成一句说清差几只，阈值与 emberModel 同源。
const edEmpty = V.emberDetailModel({ parts: [], total: 0, before: 12, killCount: 7, killStep: 10 });
ok(edEmpty.empty === true && edEmpty.note.indexOf('还差 3 只') > 0, '空态说清「还差几只才有一点」');
ok(edEmpty.balanceNow === '余额 ✦ 12' && edEmpty.balance.indexOf('✦ 12 → 12') === 0, '空态余额只报现值（0 → 0 那个箭头没有信息量）');
const edEmpty0 = V.emberDetailModel({ parts: [], total: 0, before: 0, killCount: 0, killStep: 10 });
ok(edEmpty0.note.indexOf('还没打够') > 0 && edEmpty0.note.indexOf('还差') < 0, '一只没打时不说「还差」（那会读成差一步就到手）');
const edHtmlEmpty = V.emberDetailHtml({ parts: [], total: 0, before: 12, killCount: 7, killStep: 10 });
ok(edHtmlEmpty.indexOf('eed-note') > 0 && edHtmlEmpty.indexOf('合计') < 0, '空态不出现「合计 +0」（那是把空态画成读数）');
ok(V.emberDetailHtml({ parts: edm.parts, total: 9, before: 30 }).indexOf('eed-sum') > 0, '非空态仍给合计与「之前 → 现在」');
// 单价只许一个来源：emberModel 算它、空态句子拼它也用它；view.js 里出现第二个 `/ 10` 即红
const vSrc = viewSrc;
ok(/EMBER_KILL_STEP\s*=\s*10/.test(vSrc), '击杀单价有唯一常量 EMBER_KILL_STEP');
ok(!/killCount \|\| 0\) \/ 10/.test(vSrc), '算式里不许再写死 10（改单价漏一处就漂）');
const edmBody = vSrc.slice(vSrc.indexOf('function emberDetailModel'), vSrc.indexOf('function emberDetailHtml'));
ok(edmBody.indexOf('10') < 0, '空态句子不许自带一个 10（单价走参数）');

// 胜局摘要：顺序、条件项、门槛
const briefOf = (o) => V.winBrief(Object.assign({ fx: { zealFull: () => 40 } }, o));const b1 = briefOf({ relicCount: 1, kills: 33, retries: 0, emberGain: 12 });
ok(b1[0] === '带走 1 件遗物 · 击杀 33 只', '没有今日一塔时第一句是「带走 N 件遗物」');
ok(b1[1] === '一次没回头' && b1[b1.length - 1] === '✦ +12', '没回头写陈述句，余烬收尾');
ok(briefOf({ relicCount: 0, kills: 0, retries: 3 })[1] === '重来本层 3 次', '重来过几次就报几次');
// 提示排队过期（2026-11-26 06:2x 收口自检待办）：面板开着时攒下的提示到关面板早就不成立了。
// 规则只有一处（View.hintSweep），泵每跳先扫；队列扫空就停泵 —— canSay() 长期为假不再空转。
const TTL = V.HINT_TTL;
ok(V.hintSweep([{ at: 1000 }, { at: 200000 }], TTL + 1001).dropped === 1, '排队超 TTL 的那条被丢掉');
ok(V.hintSweep([{ at: 0 }], TTL).keep.length === 1, '正好 TTL 还播（边界是「超过」才算过期）');
ok(V.hintSweep([{ at: 0 }], TTL + 1).dropped === 1, '过 1 毫秒就丢');
ok(V.hintSweep([{ at: 10 }, { at: 0 }, { at: 8 }], 12, 5).keep.map((x) => x.at).join(',') === '10,8',
  '留下那几条的相对顺序不变（不许把队列倒序）');
ok(V.hintSweep([{}, { at: 'x' }, { at: NaN }], 0).dropped === 3, '没入队时间的按过期处理（宁可不播，不许很久以后突然插一句）');
ok(V.hintSweep(null, 0).keep.length === 0 && V.hintSweep([]).dropped === 0, '空队列 / 脏入参不炸');
// now 漏传时不许整队放行：退回 0 会把所有提示都算成「刚入队」，过期机制静默失效
ok(V.hintSweep([{ at: Date.now() }], undefined).dropped === 1, '没给 now 按全部过期（与「宁可不播」同向）');
ok(V.hintSweep([{ at: 1 }], 'x').dropped === 1, 'now 是脏值同样按过期处理');
ok(TTL >= 60000 && TTL <= 600000, 'TTL 在 1~10 分钟之间（太短会吞掉正常排队，太长等于没有）');
ok(mainSrc.includes('View.hintSweep(hintQueue'), '泵每跳先扫过期（不是只判空）');
ok(/hintQueue\.push\(\{[^}]*at: Date\.now\(\)/.test(mainSrc), '入队时间由 say() 一处盖戳，队列里不许各写各的');
ok(briefOf({ dailyLabel: '11月16日', relicCount: 0, kills: 0 })[0] === '今日一塔 · 11月16日', '今日一塔排第一（藏着等于没写）');
// 跨零点：摘要要把「这局算普通局」说清楚，否则玩家只会读成「今日榜没记上我」
const crossed = briefOf({ dailyCrossed: true, relicCount: 0, kills: 0 });
ok(crossed[0] === '跨了零点：今日榜只收当天走完的，这局按普通局记账', '跨零点的那一局在摘要里明说按普通局记账');
ok(!crossed.some((t) => t.indexOf('今日一塔') === 0), '跨零点的局不再挂「今日一塔」标签（标签与记账口径同源）');
ok(!briefOf({ relicCount: 0, kills: 0 }).some((t) => t.indexOf('跨了零点') === 0), '没跨零点就不提这一条');
ok(briefOf({ worstHit: 126, worstName: '怨灵', relicCount: 0, kills: 1 }).some((t) => t === '最狠的一场：怨灵 −126'), '最狠的一场');
ok(!briefOf({ relicCount: 0, kills: 1 }).some((t) => t.indexOf('最狠') === 0), '没挨过大打就不提这一条');
ok(briefOf({ hint: '锁环攒到 3 枚可换「守灯」', relicCount: 0, kills: 1 }).some((t) => t.indexOf('下一枚塔印：') === 0), '下一枚塔印的提示原样进摘要');
ok(!briefOf({ relicCount: 0, kills: 1 }).some((t) => t.indexOf('下一枚塔印') === 0), '已经刻满（hint 为 null）时不挂这一条');
// 折叠线是前 4 条，而「今日一塔 · 日期」「跨了零点…」是**上下文**行、会把塔印提示挤到第 5 条。
// 那一局正好是唯一有对手可比的局——玩家读到「未竟」却看不到差什么，所以塔印必须钉进最后一个展开位。
const pinOne = briefOf({ dailyLabel: '11月26日', hint: '再拿到 2 枚锁环，可换「留名」', relicCount: 0, kills: 5, worstHit: 30, worstName: '锁虫' });
const pinOneM = V.briefModel(pinOne);
ok(pinOneM.items.slice(0, V.BRIEF_SHOW).some((x) => x.html.indexOf('下一枚塔印：') === 0),
  '今日一塔那一局：塔印提示留在展开区（不是折进「＋N 项」）');
const pinTwo = briefOf({ dailyLabel: '11月26日', dailyCrossed: true, hint: 'h', relicCount: 1, kills: 5, worstHit: 30, worstName: '锁虫' });
const pinTwoBase = briefOf({ dailyLabel: '11月26日', dailyCrossed: true, relicCount: 1, kills: 5, worstHit: 30, worstName: '锁虫' });
ok(V.briefModel(pinTwo).items.slice(0, V.BRIEF_SHOW).some((x) => x.html.indexOf('下一枚塔印：') === 0)
  && pinTwo.length === pinTwoBase.length + 1,
  '两条上下文行也把塔印留在展开区，且条目一条不丢（只换位不删条）');
ok(pinTwo[0] === '今日一塔 · 11月26日' && pinTwo[1].indexOf('跨了零点') === 0 && pinTwo[2].indexOf('带走 1 件遗物') === 0,
  '钉位只动塔印与最狠一场：上下文行与「这一局的账」首句的顺序一概不变');
ok(briefOf({ hint: 'h2', relicCount: 1, kills: 2, worstHit: 9, worstName: '锁虫' })[3] === '下一枚塔印：h2', '没有上下文行时它原本就在第 4 条（不因这条规则被提前）');
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
const sumCalls = ['View.endScoreModel', 'View.emberDetailHtml', 'View.briefModel', 'View.winBrief', 'View.deathBrief'];
ok(sumCalls.every((w) => mainSrc.indexOf(w) >= 0), 'main.js 必须走这五个入口（不许绕过）');
// 余烬明细那一行的 span 也只许在 view.js 拼：胜局 / 折戟两处此前各拼一遍，空态文案一改就得改两处
ok(mainSrc.indexOf('eed-') < 0, 'main.js 不许自己拼余烬明细的 span（走 View.emberDetailHtml）');
ok(mainSrc.split('View.emberDetailHtml').length - 1 === 2, '结算两处（胜 / 折戟）都走同一个拼装函数');
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

// 「这一种」不是保险说法（同上：战前记忆行的身份口径）——同种怪跨层重复才是常态，
// 无面者第 8–13 层各一只、锁虫 8/9/10/13、灰烬祭司 8/10/11/13。哪天地图真的改成
// 「每种只出现一次」，那句话才该改回「这只」；在那之前这条数据锚必须绿。
const _speciesFloors = {};
GD.floors.forEach((f) => {
  const seen = new Set();
  f.map.join('').split('').forEach((ch) => {
    const m = GD.monsters[ch];
    if (m && !m.boss && !m.ghost) seen.add(ch);
  });
  seen.forEach((ch) => { _speciesFloors[ch] = (_speciesFloors[ch] || 0) + 1; });
});
const _spread = Object.keys(_speciesFloors).filter((ch) => _speciesFloors[ch] >= 2);
ok(_spread.length >= 6,
  `同种怪跨层重复是常态（实测 ${_spread.length} 种出现在 ≥2 层）——「这一种」有数据支撑`);

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
// 锁环 desc 与 emberModel 的实际算法同字（2026-11-27 自检第 4 面）：
// 拾柴同时给「击杀翻倍」与「每位锁匠 +1」，desc 少写一半 ⇒ 卡面读不出真实收益。
ok(/10 只/.test(GD.rings.ash.desc) && /锁匠/.test(GD.rings.ash.desc),
  '拾柴之环 desc 同时写明击杀翻倍与锁匠奖励（实际：' + GD.rings.ash.desc + '）');
ok(/10 只/.test(GD.rings.ledger.desc) && !/锁匠/.test(GD.rings.ledger.desc),
  '名册之环 desc 只写击杀（第 1 章那档不该冒出锁匠）');
ok(echoPend.ownedHead === '已装 1 枚' && echoPend.owned.length === 1, '已装枚数按真实持有算');
ok(echoPend.hint === V.ECHO_HINT_PICK && echoPend.closable === false, '待选时不能关面板（否则等于放弃这一章的空环）');
const echoDone = V.echoModel({ title: '墨妖', pending: false, choices: ['spare'], owned: [], rings: GD.rings });
ok(echoDone.reward === V.ECHO_REWARD_TAKEN && echoDone.muted && echoDone.cards.length === 0, '拿过的章节不摆候选，只说一句');
ok(echoDone.hint === '' && echoDone.closable === true, '拿过的章节可以关');
ok(V.echoModel({ title: '墨妖', pending: true, choices: ['脏 id'], owned: [], rings: GD.rings }).cards.length === 0, '脏候选 id 不画成空卡');
// 状态机死角（09:0x 自检六面 · 第一面）：待选 + 一张卡都画不出来时，面板必须能关。
// 「必须选一个」的前提是至少有一个可选；否则玩家被锁在无按钮的屏上（Esc 也不响应）。
const echoEmpty = V.echoModel({ title: '墨妖', pending: true, choices: ['脏 id'], owned: [], rings: GD.rings });
ok(echoEmpty.closable === true, '没有可挑的卡时面板必须能关（否则卡死）');
ok(echoEmpty.hint === V.ECHO_HINT_EMPTY, '空卡时提示行改说「没有可挑的锁环」，不许还教玩家点卡');
ok(echoEmpty.reward === V.ECHO_REWARD_EMPTY && echoEmpty.reward !== V.ECHO_REWARD_PENDING,
  '空卡时顶行不许再说「让你挑」（一行说挑、屏上零张卡）');
ok(V.echoModel({ title: '墨妖', pending: true, choices: ['spare', 'twice'], owned: [], rings: GD.rings }).closable === false,
  '有卡时仍不许关（这条不许被上面的兜底放宽）');

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

// 名墙上的每个名字都必须有戏份（2026-11-24 19:3x 加练 · 叙事）：
// 名墙那句原本是全塔唯一提到锤魔的地方（另有两条源码注释写着他的名字）。玩家读到五个名字、
// 塔里只遇到四个锁匠，收到的是一个永远不回收的问号——本作唯一一处「埋了钩子没收」（对照：第八位勇者川
// 有断剑小传 / 执剑者成就 / 结算两版 / 影子脚注四方互证）。判据不看「有没有写」，看「除了名墙那句
// 还能不能在别处见到他」；注释不算戏份，否则注释写得越全越容易骗过闸门。
{
  const fs = require('fs'), p = require('path');
  const src = stripComments(fs.readFileSync(p.join(__dirname, '..', 'js', 'story.js'), 'utf8'));
  const wm = /'(炎魔[^']*?)。五道刻完的名字。'/.exec(src);
  ok(!!wm, '名墙那句还在（下面两条以它列的名字为准，读不到就是假绿）');
  const wall = wm ? wm[1].split('。').filter(Boolean) : [];
  const mute = wall.filter((n) => (src.match(new RegExp(n, 'g')) || []).length < 2);
  ok(wall.length === 5 && mute.length === 0,
    `名墙上的每个名字都另有戏份（只刻在墙上＝埋了钩子不回收；没下文的：${mute.join(' / ') || '无'}）`);
  ok(/第三道[^']{0,8}锤魔|锤魔[^']{0,20}第三道/.test(src),
    '锤魔的第三道锁有人交代（五个名字四个锁匠，缺的那位得在塔里说清去哪了）');
  // 战前面板的键盘入口（2026-11-24 19:5x 加练·美术焦点B）：`pickPrepByKey` 一直收 1–9，
  // 面板却一个字没写——同一作里立誓页写「或 ← → 切换、Enter 确认」、回响写「也可按 1 / 2 / 3」，
  // 只有这屏把键盘当暗能力。键位上限必须随卡片数走：写死 1–4 时只摆两张卡会教出按不动的键。
  const mainNoCmt = stripComments(mainSrc);
  // 2026-11-24 22:4x：文案两版搬进 view.js（PREP_FIRST / PREP_HINT），装配段只剩选择；
  // 所以这条改盯 view.js 的模板串——写死数字仍会让它红，顺手也守住了「不许在装配段抄第二份文案」。
  ok(stripComments(viewSrc).indexOf('或按 1–${n}') > 0 && mainNoCmt.indexOf('View.PREP_HINT') > 0,
    '战前面板提示行写明键盘入口，且键位上限与卡片数同源（写死数字会教出一个按不出反应的键）');
}

// 塔心石「放下」那一屏的灯不许无因变化（2026-11-27 加练·叙事）。
// 原句「三盏灯重新亮起来的时候」——可这三盏灯从 `core` 第一句起就一直亮着，全篇没有一处写它们灭过；
// 「重新」需要一个「灭」当前提，玩家读到的是一个没发生过的动作（自审第⑦项「文案与代码/画面一致」）。
// 判据不抄整句（抄句子＝把闸门变成快照），只问两件事：①这半段还交代灯的状态吗（画面元素不许凭空消失）
// ②有没有「重新亮」这类要求前置动作的词。注释先剥掉，否则注释里解释这件事的句子本身会把闸门骗过去。
{
  const src = stripComments(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'story.js'), 'utf8'));
  const seg = /heartLeave: \[([\s\S]*?)\n  \],/.exec(src);
  ok(!!seg, '读得到塔心石「放下」那一段（读不到就是假绿，下面两条跟着失效）');
  const body = seg ? seg[1] : '';
  ok(/灯/.test(body), '「放下」段仍交代灯的状态（石头的光落回去时，房间不是黑的、也不是没人提）');
  ok(!/重新亮/.test(body), '「重新亮」要以「灭」为前提，而这一屏的灯从没灭过');
}

// 真结局那一支认的是「那页手记」，不是「见过烛」（2026-11-27 加练·叙事 · A-14 机制与叙事是否拆台）。
// 这一支的判据是 `flags.journal`（第 4 层捡到工匠手记），而烛在第 1 层就自报家门、一路跟着说话——
// 台词写「你见过烛了」时，玩家读到的是「我早就见过他，为什么非要那张纸」。
// 手记给的从来不是「认识烛」，是**知道第六个名字该写谁**（「本来该是我。我没敢签，把它藏在这页的角落」）。
// 判据不抄整句：①这一支要认得出那页纸；②不许把「捡到手记」说成「见过烛」。
{
  const src = stripComments(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'story.js'), 'utf8'));
  const seg = /princessTrue: \[([\s\S]*?)\n  \],/.exec(src);
  ok(!!seg, '读得到真结局那一支（princessTrue，读不到就是假绿）');
  const body = seg ? seg[1] : '';
  ok(/手记|纸/.test(body), '真结局那一支认得出玩家带来的是那页手记（不是「他来过」这类空话）');
  ok(!/见过烛/.test(body), '「见过烛」不是这一支的前提——玩家第 1 层就见过他，前提是手记里那行小字');
}

// 世界观术语不许只抛一次（2026-11-25 加练 · 叙事）：
// 「六道锚」此前在全库叙事里只出现一次——手记把它和「六道锁环」并列抛出来，之后再没有任何一处
// 提到它，玩家读到的是一个永远不回收的问号（与 11-24 名墙锤魔同型：埋了钩子不收）。
// 判据比「有没有写」硬一档：术语要么别用，要么在叙事里被用到第二次——第二次就是回收
// （另一处提到它，或当场把它解释清楚）。注释不算，`stripComments` 之后数，否则注释越全越容易骗过闸门。
{
  const fs = require('fs'), p = require('path');
  const src = stripComments(fs.readFileSync(p.join(__dirname, '..', 'js', 'story.js'), 'utf8'));
  const count = (t) => src.split(t).length - 1;
  const TERMS = ['锁环', '锁梁', '锁身', '锁芯', '锚', '名册', '续锁', '第六个名字', '刻名'];
  const once = TERMS.filter((t) => count(t) < 2);
  ok(once.length === 0,
    `世界观术语在叙事里都至少出现两次（只抛一次＝问号没人收：${once.join(' / ') || '无'}）`);
  // 而且「第二次」必须是把话说完：锚要么别出现，要么当场说清它和锁环的差别（谁靠名字守着）
  ok(/锚[^']{0,14}名字/.test(src),
    '「六道锚」被当场解释（锚不比锁环——它不靠名字守着），不是换个地方再提一次');
  // 手记那句仍是一屏读完的句子：补解释只许在同一句里，不许把它拆成两屏朗读会。
  // 上限 68 字＝同一段手记里最长、且已经上线读了几周的那句（薇拉/密档那条）——不是拍脑袋的整数，
  // 而是这屏已证明读得完的上限；新补的这半句 59 字，留了 9 字余量。
  const jm = /'塔不是魔王[^']*'/.exec(src);
  ok(!!jm && jm[0].length - 2 <= 68,
    `手记那句不超过同屏最长句（≤68 字，实得 ${jm ? jm[0].length - 2 : 'N/A'}）`);
}

// 微信好友行进不了「今日」档（2026-11-25 01:5x 加练 · 社交）：好友榜回的是微信托管数据，
// 原先上报的七位里没有日签 ⇒ 好友行只有楼层/用时，`boardModel` 的「今日」档按 `r.daily === todayKey`
// 筛，好友永远筛不进来——「今日一塔」与「微信好友榜」这两条社交线从上线起就没相交过。
// 判据不看注释，看四个环节是否真的带着这一位：上报 tm_daily → 子域解析 → 桥接 normalize → 名录行。
{
  const fs = require('fs'), p = require('path');
  const stub = { sent: null };
  global.window = { wx: { setUserCloudStorage(o) { stub.sent = o; } } };
  // 文件顶部已经 require 过一次（那时没有 window，wx 被捕获成 null）——这里清缓存重载，
  // 否则测的是一份「永远不会上报」的实例，三条断言全假红。
  delete require.cache[require.resolve('../js/wxbridge.js')];
  const WB = require('../js/wxbridge.js');
  ok(WB.submit({ floor: 9, time: 640, daily: '2026-11-25' }) === true, '上报走通（桩宿主收得到）');
  const kvOf = (o) => ((o && o.KVDataList) || []);
  ok(kvOf(stub.sent).some((k) => k.key === 'tm_daily' && k.value === '2026-11-25'),
    '上报带着日签 tm_daily（缺这一位好友永远进不了今日档）');
  WB.submit({ floor: 9, time: 640 });
  ok(kvOf(stub.sent).some((k) => k.key === 'tm_daily' && k.value === ''),
    '普通局上报空日签（不能凭空把自己塞进今日档）');
  const rows = WB.normalize([
    { name: '阿岩', floor: 9, time: 640, daily: '2026-11-25' },
    { name: '乱码', floor: 9, time: 640, daily: '今天' },
  ]);
  ok(rows.length === 2 && rows[0].daily === '2026-11-25', '桥接把日签递给主域');
  ok(rows.length === 2 && rows[1].daily === '', '乱码日签被清空（不把人挤进不存在的日子）');
  delete global.window;
  const ODsrc = fs.readFileSync(p.join(__dirname, '..', 'wechat', 'wxgame', 'openDataContext', 'index.js'), 'utf8');
  const WXsrc = fs.readFileSync(p.join(__dirname, '..', 'js', 'wxwire.js'), 'utf8');
  ok(/keyList:\s*\[[^\]]*'tm_daily'/.test(stripComments(ODsrc)),
    '子域请求的字段里带日签（不请求这一位，回传里也不会有）');
  ok(/daily: DAY_RE\.test/.test(stripComments(ODsrc)), '子域解析出日签');
  ok(stripComments(WXsrc).indexOf('daily: x.daily') > 0, '名录行透传日签');
  // 微信真机上好友数据只以画布形式出现（子域不能回传行），所以「今日」标必须画在子域榜上；
  // 子域的日期键是**抄**的一份，抄的东西必须有闸门钉住，否则跨天一处改了另一处没改。
  const OD = require('../wechat/wxgame/openDataContext/index.js');
  const Daily = require('../js/daily.js');
  // 取单数字月/日（3 月 5 日）：用 11-25 量不出补零缺失——两位数月份本来就对
  const now = new Date(2026, 2, 5, 12, 0, 0).getTime();
  ok(OD.todayKey(now) === Daily.keyOf(now) && OD.todayKey(now) === '2026-03-05',
    '子域的日期键与主域 Daily.keyOf 同口径（补零也要一模一样）');
  ok(stripComments(ODsrc).indexOf('rowTags(r)') > 0, '子域榜把「今日」标画进第二行（真机上唯一能说清的地方）');
  // 只挂 showEnd 时，绝大多数局（死在第 5–8 层）从不上报，好友榜永远停在「上次通关」
  ok(/wrapReport\('showEnd'\)/.test(stripComments(WXsrc)) && /wrapReport\('showDeath'\)/.test(stripComments(WXsrc)),
    '胜局与败局都上报（漏了败局，好友榜就只剩通关记录）');
  // 胜局与败局各有一份 lastRun（败局那条最容易被漏——它走的是另一个函数）
  ok((stripComments(mainSrc).match(/lastRun = \{[\s\S]{0,260}?daily:/g) || []).length === 2,
    '胜局与败局两份 lastRun 都带日签');
  // 日签是**开局**落档的：23:59 开今日一塔、00:05 结算时它已经是昨天的键。
  // 榜单「今日」档按今天的键筛 ⇒ 那局既进不了今天也回不到昨天，玩家读成「榜上没记上我」。
  // 判据收在 Daily.tagAtSettle 一处，胜局落榜与败局上报都走它（下面那条源码断言守着「别绕过去」）。
  ok(Daily.tagAtSettle('2026-03-05', now) === '2026-03-05', '当天的日签结算时保留');
  ok(Daily.tagAtSettle('2026-03-04', now) === '', '跨了零点：昨天的日签结算时清掉');
  ok(Daily.tagAtSettle('', now) === '' && Daily.tagAtSettle(null, now) === '', '普通局（空/缺日签）不受影响');
  const lateOpen = new Date(2026, 2, 5, 23, 59, 0).getTime();
  const afterMid = new Date(2026, 2, 6, 0, 5, 0).getTime();
  ok(Daily.tagAtSettle(Daily.keyOf(lateOpen), afterMid) === '',
    '23:59 开的今日局在 00:05 结算时按普通局记账');
  ok((stripComments(mainSrc).match(/Daily\.tagAtSettle\(/g) || []).length === 2,
    '结算两条路（胜局落榜 / 败局上报）都过 tagAtSettle，没有哪条直写 flags.daily');
  // `sum` 整份塞进榜单存档（`saveBoard(sum)` 直接 push）：任何只为摘要服务的标记都不许挂上去，
  // 否则每次落榜都往 localStorage 多存一个没人读的字段——与同轮删掉的好友缓存同一个毛病。
  ok(stripComments(mainSrc).indexOf('sum.dailyCrossed') < 0,
    '跨零点标记是局部变量，没挂进 sum（榜单存档里不许混入摘要专用字段）');
}

// 动效契约（2026-11-25 加练 美术 焦点C）：21 个浮层与图鉴详情条都有进场，只有结算页两块是硬切。
// 浏览器侧的 motion-check 逐元素量；这里补一条**不依赖 Chrome** 的源码契约，
// 顺带把「循环动效必须被 prefers-reduced-motion 豁免」也静态钉住（那条探针要开浏览器，静态这条永远跑）。
{
  const cssSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const nc = stripComments(cssSrc);
  const r1 = nc.match(/\.end-brief\.open \.brief-extra\s*\{([^}]*)\}/);
  ok(!!r1, 'css 里找得到 .end-brief.open .brief-extra 规则');
  ok(!!r1 && /animation:\s*fadeIn/.test(r1[1]),
    `结算摘要展开有进场（此前是一帧蹦出来的胶囊）：${r1 ? r1[1].trim() : '—'}`);
  const r2 = nc.match(/#endOverlay\.death-mode #endMemory\.open\s*\{([^}]*)\}/);
  ok(!!r2, 'css 里找得到死亡页 #endMemory.open 规则');
  ok(!!r2 && /animation:\s*fadeIn/.test(r2[1]),
    `塔的记忆展开有进场（一整块要读的履历硬切）：${r2 ? r2[1].trim() : '—'}`);
  // 两块都只做透明度、不做位移：它们紧贴上一行文字，translateY 会让两行字短暂叠在一起
  const noShift = (s) => !/animation:\s*popIn/.test(s || '');
  ok(noShift(r1 && r1[1]) && noShift(r2 && r2[1]), '两块只用 fadeIn（位移会压到上一行字）');

  // 静态版 reduced-motion 覆盖：所有带 infinite 的 animation 选择器，都必须出现在某条
  // `@media (prefers-reduced-motion: reduce)` 的 `animation: none` 里。
  const mediaBlocks = [];
  {
    const re = /@media[^{]*prefers-reduced-motion[^{]*\{/g;
    let m;
    while ((m = re.exec(nc))) {
      let i = m.index + m[0].length, depth = 1, start = i;
      while (i < nc.length && depth > 0) {
        if (nc[i] === '{') depth++;
        else if (nc[i] === '}') depth--;
        i++;
      }
      mediaBlocks.push(nc.slice(start, i - 1));
    }
  }
  const silenced = new Set();
  for (const b of mediaBlocks) {
    for (const mm of b.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (/animation[^;]*none/.test(mm[2])) {
        mm[1].split(',').forEach((s) => silenced.add(s.trim().replace(/\s+/g, ' ')));
      }
    }
  }
  ok(mediaBlocks.length >= 3 && silenced.size >= 15,
    `读到 ${mediaBlocks.length} 条 reduced-motion 块 / ${silenced.size} 个选择器（读不到下面那条就是假绿）`);
  const uncovered = [];
  let infCount = 0;
  for (const mm of nc.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = mm[2];
    if (!/^[^@]*$/.test(mm[1]) || !/animation[^;]*infinite/.test(body)) continue;
    infCount++;
    for (const s of mm[1].split(',')) {
      const k = s.trim().replace(/\s+/g, ' ');
      if (!k || k[0] === '0' || k[0] === '1') continue;   // 跳过 @keyframes 里的 0%/100% 分帧
      if (!silenced.has(k)) uncovered.push(k);
    }
  }
  ok(infCount >= 18, `静态扫到 ${infCount} 条循环动效（少于 18 条说明扫漏了）`);
  ok(uncovered.length === 0,
    `每条循环动效都被 reduced-motion 关掉（漏：${uncovered.join(', ') || '无'}）`);

  // 关键帧孤儿：@keyframes 定义了一堆没人用 = 死代码，也可能是「本来想做动效、忘了挂」。
  const kfNames = Array.from(nc.matchAll(/@keyframes\s+([\w-]+)/g)).map((m) => m[1]);
  const used = new Set();
  for (const mm of nc.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const tok of mm[1].split(/[,\s]+/)) {
      if (/^[A-Za-z_][\w-]*$/.test(tok)) used.add(tok);
    }
  }
  const orphan = kfNames.filter((n) => !used.has(n));
  ok(kfNames.length >= 39, `读到 ${kfNames.length} 个 @keyframes（读不到下面那条就是假绿）`);
  ok(orphan.length === 0, `没有孤儿关键帧（未引用：${orphan.join(', ') || '无'}）`);

  // 展开块登记：CSS 里每出现一条新的「.show/.on/.open + display」规则，必须在名单里登记，
  // 否则就是一条绕过上面进场面体检的新硬切（浏览器探针 motion-check 只认名单里的那几块）。
  // 对白背景层在名单里但不在探针登记表里：它容器只管显隐，内容动效挂在子 svg 上（下一条守着）。
  const ALLOW = [
    '.overlay.show',
    '.dlg-scene.on',
    '#endOverlay.death-mode #endMemory.open',
    '.end-brief.open .brief-extra',
    '.col-detail.show',
  ];
  const toggle = [];
  for (const mm of nc.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/^[^@]*$/.test(mm[1]) && /(^|;)\s*display\s*:/.test(';' + mm[2]) && /\.(show|on|open)\b/.test(mm[1])) {
      toggle.push(mm[1].trim().replace(/\s+/g, ' '));
    }
  }
  const unreg = toggle.filter((s) => ALLOW.indexOf(s) < 0);
  ok(toggle.length >= 5, `读到 ${toggle.length} 条展开/显示的切换规则（少于 5 条说明扫漏了）`);
  ok(unreg.length === 0, `展开块都已登记（未登记：${unreg.join(' | ') || '无'}）`);
  // 对白背景层的进场在子 svg 上，容器本身只切 display —— 这条别让谁顺手删了
  ok(/\.dlg-scene[^{}]*\{[^{}]*animation:\s*sceneIn/.test(nc),
    '对白背景层的内容动效（.dlg-scene svg → sceneIn）还在');
}

// ---------- 立誓屏档位色阶：每条誓约各有各的颜色，不许静默降级成基础灰 ----------
// 病根（2026-11-25 11:0x 发现）：main.js 里是 4 条 tag→类名映射，苦行 / 无名的 tag 不在表里，
// `|| ''` 把它们落到 .vc-tier 的基础灰 #9aa4b5 —— 而这两条恰好是唯一要余烬解锁、实测最难的两档。
{
  const cssVow = require('fs').readFileSync(require('path').join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const ids = Object.keys(GD.vows);
  ok(ids.length === 8, `誓约表读到 ${ids.length} 条（少于 8 条说明扫漏了）`);
  const noTier = ids.filter((k) => !GD.vows[k].tier);
  ok(noTier.length === 0, `每条誓约都自带档位类名（缺：${noTier.join(' / ') || '无'}）`);
  const tiers = ids.map((k) => GD.vows[k].tier);
  const noRule = [...new Set(tiers)].filter((t) => cssVow.indexOf('.vc-tier.' + t) < 0);
  ok(noRule.length === 0, `档位类名在 style.css 里真有规则（缺：${noRule.join(' / ') || '无'}）`);
  ok(new Set(tiers).size === tiers.length, '八条誓约的档位色互不重复（两条同色等于把难度说成一样）');
  ok(mainSrc.replace(/\/\/[^\n]*/g, '').indexOf("'轻羽': 't-easy'") < 0,
    'main.js 里不许再有写死的 tag→类名映射（改回去就红）');
}

// ---------- 立誓屏：三路的难度百分比与 dmgMul 同源 + 灰卡/全解锁两句交代 ----------
// 2026-11-26 三路定稿：难度只由一个数控制（vows[].dmgMul＝怪物伤害乘区），描述里那个百分比
// 是玩家唯一能读到的「这条路难多少」——两处各写一遍，改一边就会静默说谎。
{
  const paths = Object.keys(GD.vows).filter((k) => k === 'none' || GD.vows[k].path);
  ok(paths.length === 3, `开局三路读到 ${paths.length} 条（不是 3 条说明表被改了）`);
  const badPct = paths.filter((k) => {
    const v = GD.vows[k];
    if (!v.dmgMul) return false;   // 不立誓没有乘区
    return v.desc.indexOf(`+${Math.round((v.dmgMul - 1) * 100)}%`) < 0;
  });
  ok(badPct.length === 0,
    `三路描述的百分比与 dmgMul 同源（对不上：${badPct.map((k) => k + ' dmgMul=' + GD.vows[k].dmgMul + ' desc=' + GD.vows[k].desc).join(' / ') || '无'}）`);
  // 首局就摆 5 张灰卡：提示行若只说「点一张开始」，点在灰卡上得到的是「余烬不够」——
  // 说法与行为对不上（自审第⑦条）。灰卡必须在提示里被交代一次，且不另开教学弹窗。
  // 断言必须限定在 openVow 函数体内：全库还有别的 hint.textContent（图鉴集齐那句），
  // 只搜文案会读到别人的提示——第一版就这么假绿了一轮。
  const vowHint = (/function openVow\([\s\S]{0,500}?hint\.textContent\s*=\s*'([^']*)'/.exec(mainSrc) || [])[1] || '';
  ok(vowHint.indexOf('灰卡') >= 0, `立誓页提示行交代灰卡（现文：${vowHint || '读不到'}）`);
  // 五条助力全买下后，「用 ✦ 解锁」就是过期说法（空态要交代）：标题必须随解锁进度换词，
  // 且「全解锁」的判据是 pool.length，不是写死的 5（加第六条助力时这条不许变成快照）。
  ok(mainSrc.indexOf("'已全解锁'") > 0 && /owned === pool\.length/.test(mainSrc),
    '分节标题随解锁进度换词（全解锁后不再写「用 ✦ 解锁」）');
}

// ---------- 立誓屏：买下与开局不许落在同一次连击里 ----------
// 2026-11-26 22:0x 自检（逻辑六问 · 连点重复结算）：买下那一下 renderVowPanel 换掉整块 innerHTML，
// 于是连击的第二下点中的是**新**节点——它已经解锁，chooseVow 直接 startGame。一次双击花掉 ✦ 并立刻
// 开局，正是「点一下买下、再点一下立誓」想防的误触。headless 复现：修前 runAfter=true（开局了），
// 修后 runAfter=false（只买下）；隔 800ms 故意再点一下仍能开局（VOW_BUY_HOLD 只盖同一手势）。
// 这条按源码顺序钉：守卫必须**在 startGame 之前**、时间戳必须在买下成功那一支里落。
{
  const body = (/function chooseVow\(id\) \{([\s\S]*?)\n  \}/.exec(mainSrc) || [])[1] || '';
  const holdDef = /const VOW_BUY_HOLD = (\d+);/.exec(mainSrc);
  const holdMs = holdDef ? Number(holdDef[1]) : 0;
  ok(holdMs > 0 && holdMs <= 600, `立誓连击守卫有一个 ≤600ms 的窗口（读到 ${holdMs || '无'}）`);
  ok(/vowBoughtAt = Date\.now\(\);/.test(body), '买下成功那一支落时间戳（不是每一下都落）');
  const guardAt = body.indexOf('Date.now() - vowBoughtAt < VOW_BUY_HOLD');
  const startAt = body.indexOf('startGame(');
  ok(guardAt > 0 && startAt > guardAt, '连击守卫排在 startGame 之前（否则吞晚了等于没吞）');
  ok(/Meta\.buy\(id, v\.ember\)/.test(body), '买下仍走 Meta.buy（守卫不是把买下这条路一起关掉）');
}


// 漏同步到 publish/ 的后果是线上静默回落到矢量图，没有任何报错——所以按文件系统量，不按注释量。
{
  const fs2 = require('fs');
  const path2 = require('path');
  const bdSrc = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'backdrops.js'), 'utf8');
  const cg = [...new Set((bdSrc.match(/assets\/cg\/[a-z0-9-]+\.webp/g) || []))];
  ok(cg.length >= 18, `backdrops.js 里读到 ${cg.length} 张 CG（少于 18 张说明表被拆了）`);
  const missSrc = cg.filter((p) => !fs2.existsSync(path2.join(__dirname, '..', p)));
  ok(missSrc.length === 0, `CG 源文件都在 assets/（缺：${missSrc.join(' / ') || '无'}）`);
  const missPub = cg.filter((p) => !fs2.existsSync(path2.join(__dirname, '..', 'publish', p)));
  ok(missPub.length === 0, `CG 都已同步到 publish/（缺：${missPub.join(' / ') || '无'}——漏同步线上会静默回落矢量）`);
  ok(/function preload\(\)[\s\S]{0,200}Object\.keys\(IMG\)/.test(bdSrc), '预热遍历的是 IMG 表本身（不是另抄一份名单）');
  ok(/addEventListener\('load', kick, \{ once: true \}\)/.test(bdSrc) && /preload,/.test(bdSrc),
    '预热挂在 load 后且只挂一次（不预热＝每幕第一次出现先露矢量再啪地换图）');
}

// ---------- publish 镜像的孤儿（2026-11-26 22:5x 自动轮）----------
// 上面那组只量「表 → 源目录 → 镜像」这条**正向**链：表里有的，三处都得有。反过来不成立——
// 镜像里比仓库多出来的文件不落在任何集合里，谁也看不见。实测 publish/assets 多 5 个死文件
// （297KB：2 张 FLUX 调试残留 + 3 张立绘换 id 之后的孤儿），全都在 git 里，跟着包体一起发上线。
// 部署目录是仓库根，所以「镜像干净」不是洁癖，是包体预算的一部分。这里改成双向闭合。
{
  const fs5 = require('fs');
  const path5 = require('path');
  const root = path5.join(__dirname, '..');
  const walk = (dir, base) => fs5.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path5.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path5.relative(base, p).split(path5.sep).join('/')];
  });
  const pubFiles = walk(path5.join(root, 'publish', 'assets'), path5.join(root, 'publish', 'assets'));
  const srcFiles = new Set(walk(path5.join(root, 'assets'), path5.join(root, 'assets')));
  const orphans = pubFiles.filter((p) => !srcFiles.has(p));
  ok(orphans.length === 0,
    `publish/assets 无孤儿（仓库里不存在却会发上线的：${orphans.join(' / ') || '无'}）`);
}

// ---------- 句级取景表（2026-11-26）----------
// 用户报障「对话和背景板不相称」：段级映射让「帕子飘下海崖」配着塔顶的图。
// 修法是 LINE_SCENE（每段逐句配景）。这张表最大的风险是**改剧本后错位**——
// 少写一行，第 3 句就会拿到第 4 句的画，而且不会报错。所以这里按行数硬对。
{
  const fs4 = require('fs');
  const path4 = require('path');
  const win = global.window || (global.window = {});
  require(path4.join(__dirname, '..', 'js', 'story.js'));
  require(path4.join(__dirname, '..', 'js', 'backdrops.js'));
  const S4 = win.STORY;
  const B4 = win.Backdrops;
  const L4 = B4.LINE_SCENE || {};
  const keys4 = Object.keys(L4);
  ok(keys4.length >= 30, `句级取景表覆盖 ${keys4.length} 段（少于 30 段说明表被拆了）`);
  const wrong = keys4.filter((k) => !Array.isArray(S4[k]) || S4[k].length !== L4[k].length);
  ok(wrong.length === 0, `句级表长度与剧本逐段一致（错位：${wrong.map((k) => k + ' ' + (S4[k] || []).length + '/' + L4[k].length).join(', ') || '无'}）`);
  const badScene = [];
  keys4.forEach((k) => {
    L4[k].forEach((sc, i) => { if (sc && !B4.has(sc)) badScene.push(k + '#' + i + '→' + sc); });
  });
  ok(badScene.length === 0, `句级表引用的场景都有图（缺：${badScene.join(', ') || '无'}）`);
  // 逐句配景必须真的生效：同段不同句要能取到不同场景（回退到段级就说明 pick 没读 idx）
  const p1 = B4.pick({ key: 'princessPlain', floor: 11, idx: 3 });
  const p2 = B4.pick({ key: 'princessPlain', floor: 11, idx: 0 });
  ok(p1 === 'window' && p2 === 'roof', `pick 按行号取景（实测 ${p2} / ${p1}）`);
}

// ---------- 塔心石抉择卡：代价要写在卡上（2026-11-27 07:4x 加练·叙事）----------
// 这一屏是情感高点，也是全作唯一「纯叙事」的二选一（锁芯之后已无战可打）。
// 三处会被文案改坏的坑：①「带走」只写 `+300 生命上限`、不交代拿走了什么；
// ②「放下」写「什么都不带走」，下一行又说「+3 余烬」——同一张卡自己打自己；
// ③把 `+3 余烬` 写成「通关余烬」——`emberModel` 里 heart==='left' 在胜/败两条出口都算，
//   没有「通关」这个条件，写了就是给玩家一个不存在的门槛（04:0x 折戟余烬统一后的口径）。
{
  const iTake = htmlSrc.indexOf('id="heartTake"');
  const iLeave = htmlSrc.indexOf('id="heartLeave"');
  const iChoice = htmlSrc.indexOf('id="heartOverlay"');
  ok(iChoice > 0 && iTake > iChoice && iLeave > iTake, '塔心石两张抉择卡都在页面上（顺序 心跳石→带走/放下）');
  const takeCard = iTake < 0 ? '' : htmlSrc.slice(iTake, iLeave);
  const leaveCard = iLeave < 0 ? '' : htmlSrc.slice(iLeave, htmlSrc.indexOf('</div>', iLeave));
  ok(/心跳/.test(takeCard) && /没有/.test(takeCard), '「带走」卡交代拿走了什么（塔里从此没有心跳）');
  ok(leaveCard.indexOf('什么都不带走') < 0, '「放下」卡不再写「什么都不带走」（与下一行 +3 余烬自相矛盾）');
  ok(takeCard.indexOf('通关余烬') < 0 && leaveCard.indexOf('通关余烬') < 0, '两张卡都不写「通关余烬」（余烬不看胜负）');
  // 誓约屏那句在 index.html 与 main.js 各有一份：只改一处会让开屏文字与开面板时覆盖的文字打架
  const descHtml = (htmlSrc.match(/class="vow-desc">([^<]*)</) || [])[1] || '';
  const descMain = (mainSrc.match(/desc\.textContent = '([^']*)'/) || [])[1] || '';
  ok(descHtml && descHtml === descMain, `立誓页说明两处同字（页面「${descHtml}」/ 面板「${descMain}」）`);
}

// ---------- CG 换图必须能击穿缓存（2026-11-25 叙事轮）----------
// 病根：build 指纹只算 html+css+js，换一张 assets/cg/*.webp 指纹一字不变 ⇒ 老玩家浏览器继续用旧图
// （结局那张 dawn 已经换过一次，改的人以为上线了，回来的人看到的还是旧海崖）。
// 修法：所有出图口子过 cgSrc（带 ?v=<ASSET_V>），publish 那份由 sync-publish 换成 assets/cg 的内容指纹。
{
  const fs3 = require('fs');
  const path3 = require('path');
  const crypto3 = require('crypto');
  const bd = fs3.readFileSync(path3.join(__dirname, '..', 'js', 'backdrops.js'), 'utf8');
  const noComment = bd.replace(/\/\/[^\n]*/g, '');
  ok(/const ASSET_V = '[^']*';/.test(bd) && /const cgSrc = \(k\) => \{[^}]*'\?v=' \+ ASSET_V/.test(noComment),
    'CG 的 URL 带资产指纹（cgSrc 拼 ?v=ASSET_V）');
  // 四个出图口子：序章 imgTag / 上屏 layer / 预热 preload / 对外 cgUrl（量图工具读它）
  const sites = [
    [/return `<div class="bd-shot" style="background-image:url\(\$\{src\}\)"><\/div>`;/, 'imgTag'],
    [/const src = cgSrc\(key\);/, 'layer'],
    [/im\.src = cgSrc\(k\);/, 'preload'],
    [/cgUrl: cgSrc,/, 'cgUrl 导出'],
  ];
  const missed = sites.filter(([re]) => !re.test(noComment)).map(([, n]) => n);
  ok(missed.length === 0, `四处出图口子都过 cgSrc（漏：${missed.join(' / ') || '无'}）`);
  // 反例护栏：不许再出现「直接把 IMG[...] 拼进 URL / 塞进 Image.src」的裸用法
  ok(!/url\(\$\{IMG\[/.test(noComment) && !/\.src = IMG\[/.test(noComment),
    '没有裸拼 IMG[...] 的 URL（那样换图不会换地址，缓存永远不击穿）');
  // 真实效果：**线上服务的是仓库根那份**（部署目录＝根），所以源码的 ASSET_V 必须等于此刻
  // assets/cg 的内容指纹；publish 那份同步跟。改了图却忘了 sync，这两条会红，比任何注释都可靠
  const cgDir = path3.join(__dirname, '..', 'assets', 'cg');
  const cgFiles = fs3.readdirSync(cgDir).filter((f) => /\.(webp|png|jpg)$/.test(f)).sort();
  const ah = crypto3.createHash('md5');
  cgFiles.forEach((f) => { ah.update(f); ah.update(fs3.readFileSync(path3.join(cgDir, f))); });
  const want = ah.digest('hex').slice(0, 8);
  const gotSrc = (bd.match(/const ASSET_V = '([^']*)';/) || [])[1];
  ok(gotSrc === want, `源码的资产指纹与 assets/cg 现内容一致（${gotSrc} / 应为 ${want}——换图后没跑 sync-publish）`);
  const pubBd = fs3.readFileSync(path3.join(__dirname, '..', 'publish', 'js', 'backdrops.js'), 'utf8');
  const got = (pubBd.match(/const ASSET_V = '([^']*)';/) || [])[1];
  ok(got === want, `publish 的资产指纹与 assets/cg 现内容一致（${got} / 应为 ${want}）`);
  const pubAt = fs3.readFileSync(path3.join(__dirname, '..', 'tools', 'sync-publish.js'), 'utf8');
  ok(/asset version injection failed/.test(pubAt) && /assets', 'cg'/.test(pubAt),
    'sync-publish 负责把资产指纹写进 publish（注入失败要抛错，不许静默发旧图）');
}

// ---------- 素材接线闭合（2026-11-26 12:5x 自动轮·加练叙事收尾的「一笔活」）----------
// 病根：换图 / 换立绘永远是「改一张表 + 拷一个文件」两件事，任一半漏做都**静默降级**，
// 而静默降级的现场看起来「没什么不对」——这正是它能在树上活很久的原因：
//   · 表里有键、盘上没文件 → 每屏吃一次 404 再回落矢量（`onerror` 吞掉，只有换图的人以为换好了）；
//   · 盘上有文件、表里没键 → 新图永远不上场（11-26 那批 moyao/zhongyao/beimo 就是这么成孤儿的）；
//   · 场景键既不在 SCENES 又不在 IMG → `layer()` 垫一块 #070a10，整屏纯黑（10:3x 在 town/forge/window 上实测）。
// 三条都是「改的人不会看画面」才漏的，所以必须由闸门咬住，不靠记性。
{
  const fs5 = require('fs');
  const path5 = require('path');
  const root = path5.join(__dirname, '..');
  const bd = fs5.readFileSync(path5.join(root, 'js', 'backdrops.js'), 'utf8');
  const pt = fs5.readFileSync(path5.join(root, 'js', 'portraits.js'), 'utf8');

  // ① CG 表 ↔ assets/cg 双向闭合
  const imgBlock = (bd.match(/const IMG = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  const imgPairs = [...imgBlock.matchAll(/(\w+):\s*'assets\/cg\/([\w-]+\.webp)'/g)];
  const cgOnDisk = fs5.readdirSync(path5.join(root, 'assets', 'cg')).filter((f) => /\.webp$/.test(f));
  const imgFiles = imgPairs.map((m) => m[2]);
  const missCg = imgFiles.filter((f) => !cgOnDisk.includes(f));
  ok(imgPairs.length >= 20 && missCg.length === 0,
    `IMG 表里每张 CG 都在盘上（${imgPairs.length} 键，缺：${missCg.join('/') || '无'}）`);
  const orphanCg = cgOnDisk.filter((f) => !imgFiles.includes(f));
  ok(orphanCg.length === 0, `assets/cg 里没有上不了场的孤儿图（${orphanCg.join('/') || '无'}）`);

  // ② 立绘表 ↔ assets/portraits 双向闭合（按中文名取 id，两表同键不同名，别按 KEY 反查）
  const ptBlock = (pt.match(/const IMG = \{([\s\S]*?)\};/) || [])[1] || '';
  const ptIds = [...ptBlock.matchAll(/([\u4e00-\u9fa5]+):\s*'([\w-]+)'/g)].map((m) => m[2]);
  const ptOnDisk = fs5.readdirSync(path5.join(root, 'assets', 'portraits')).filter((f) => /\.webp$/.test(f));
  const missPt = ptIds.filter((id) => !ptOnDisk.includes(id + '.webp'));
  ok(ptIds.length >= 9 && missPt.length === 0,
    `立绘表里每个人物都有图（${ptIds.length} 键，缺：${missPt.join('/') || '无'}——缺了会静默回落剪影）`);
  const orphanPt = ptOnDisk.map((f) => f.replace(/\.webp$/, '')).filter((id) => !ptIds.includes(id));
  ok(orphanPt.length === 0, `assets/portraits 里没有成孤儿的图（${orphanPt.join('/') || '无'}）`);

  // ③ 每个上屏的场景键都必须至少有一个底（矢量 SCENES 或 CG IMG），否则整屏纯黑
  const vecBlock = (bd.match(/const SCENES = \{([\s\S]*?)\};/) || [])[1] || '';
  const vecKeys = vecBlock.split(',').map((s) => s.trim()).filter(Boolean);
  // 取景表的整段（FLOOR_SCENE 起到 IMG 声明前）：这区间里的引号串只有场景键
  const i0 = bd.indexOf('const FLOOR_SCENE');
  const i1 = bd.indexOf('const IMG = {');
  const sceneRegion = i0 >= 0 && i1 > i0 ? bd.slice(i0, i1) : '';
  ok(sceneRegion.length > 800, '取景表可解析（FLOOR_SCENE→IMG 区间）');
  const usedKeys = [...new Set([...sceneRegion.matchAll(/['"]([a-zA-Z][\w-]{0,14})['"]/g)].map((m) => m[1]))].sort();
  const noBed = usedKeys.filter((k) => !vecKeys.includes(k) && !imgPairs.some((m) => m[1] === k));
  ok(usedKeys.length >= 18 && noBed.length === 0,
    `每个场景键都有底（用了 ${usedKeys.length} 个，无底：${noBed.join('/') || '无'}——无底=整屏纯黑）`);
}

// ---------- 风格复现基线 & 闸门遍历表（2026-11-27 加练美术焦点D）----------
// 病根两条，同一种形状——「表」和「真源」不是同一份，于是没人发现它们分叉了：
//   ① `assets/cg/manifest.json` 是手写的，停在 SDXL 那一版（18 条 / `model: sd_xl_base_1.0` /
//      generatedAt 2026-11-25），而盘上 24 张全是 FLUX 860×1800。风格圣经 §10.2 写着「参数留痕见 manifest」，
//      于是唯一的复现基线指向一个已经不用了的模型，新加的 6 个场景连条目都没有。
//      处置：改成派生文件（`node tools/cg-manifest.js`，从 cg-gen.js 的 SCENES/PORTRAITS + 盘上文件生成）。
//   ② `tools/bd-luma.html` 的 `KEYS` 是硬编码的 20 个 + 序章 4 个。今天刚好等于 IMG 的 24 个，
//      但没有任何断言锁住这件事——下次加一个场景（IMG 加了、KEYS 忘了）那张图**不进亮度闸门**，
//      而闸门照样全绿。§9.5 已经吃过一次同款（序章四幕带着「焦点被对话框压住」上线一整天）。
{
  const fs6 = require('fs');
  const path6 = require('path');
  const root6 = path6.join(__dirname, '..');
  const bd6 = fs6.readFileSync(path6.join(root6, 'js', 'backdrops.js'), 'utf8');
  const imgBlock6 = (bd6.match(/const IMG = \{([\s\S]*?)\n  \};/) || [])[1] || '';
  const imgKeys6 = [...imgBlock6.matchAll(/(\w+):\s*'assets\/cg\/([\w-]+\.webp)'/g)].map((m) => m[1]);

  // ① 亮度闸门的遍历表 = 上场的图（现算两边集合，任一侧加键都红）
  const bl = fs6.readFileSync(path6.join(root6, 'tools', 'bd-luma.html'), 'utf8');
  const keysBlock = (bl.match(/const KEYS = \[([\s\S]*?)\];/) || [])[1] || '';
  const gateKeys = [...keysBlock.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
  const introBlock = (bl.match(/KEYS\.concat\(\[([\s\S]*?)\]\)/) || [])[1] || '';
  const gateAll = gateKeys.concat([...introBlock.matchAll(/'([\w-]+)'/g)].map((m) => m[1]));
  ok(gateKeys.length >= 20, `bd-luma 的 KEYS 可解析（${gateKeys.length} 项 + 序章 ${gateAll.length - gateKeys.length} 项）`);
  const notGated = imgKeys6.filter((k) => !gateAll.includes(k));
  const gone = gateAll.filter((k) => !imgKeys6.includes(k));
  ok(notGated.length === 0 && gone.length === 0,
    `亮度闸门遍历的正是上场的那批图（上场 ${imgKeys6.length} / 闸门 ${gateAll.length}`
    + `${notGated.length ? '，漏测 ' + notGated.join('/') : ''}${gone.length ? '，多测 ' + gone.join('/') : ''}）`);

  // ② manifest 是派生文件：场景集合 == 盘上集合，且管线声明是现在这条（不是 SDXL 时代的残留）
  const mf = JSON.parse(fs6.readFileSync(path6.join(root6, 'assets', 'cg', 'manifest.json'), 'utf8'));
  const cgDisk = fs6.readdirSync(path6.join(root6, 'assets', 'cg')).filter((f) => /\.webp$/.test(f)).map((f) => f.replace(/\.webp$/, '')).sort();
  const ptDisk = fs6.readdirSync(path6.join(root6, 'assets', 'portraits')).filter((f) => /\.webp$/.test(f)).map((f) => f.replace(/\.webp$/, '')).sort();
  const mfScenes = (mf.images || []).map((i) => i.scene).sort();
  const mfPts = (mf.portraits || []).map((i) => i.id).sort();
  ok(mfScenes.join() === cgDisk.join(), `manifest 的 CG 条目与盘上一致（${mfScenes.length}/${cgDisk.length}${mfScenes.join() === cgDisk.join() ? '' : '——改了图没跑 node tools/cg-manifest.js'}）`);
  ok(mfPts.join() === ptDisk.join(), `manifest 的立绘条目与盘上一致（${mfPts.length}/${ptDisk.length}）`);
  ok(/flux/i.test(mf.model || '') && !/sd_xl/i.test(JSON.stringify(mf)),
    `manifest 的管线声明是现在这条（model=${mf.model}）`);
  const noPrompt = (mf.images || []).filter((i) => !i.prompt || i.prompt.length < 20);
  ok(noPrompt.length === 0, `manifest 每张图都带主体提示词（缺：${noPrompt.map((i) => i.scene).join('/') || '无'}）`);
}

// ---------- 分享卡（og:image）此前没有任何闸门（2026-11-26 加练·社交）----------
// 病根：`assets/share-card.png` 是「分享出去的第一眼」，但它不在 build 指纹里、不在任何探针里，
// 换掉整批美术后卡片仍是 11-17 那张纯黑底纯文字（11-26 重出时才被发现）。三条都要能咬住：
// 图丢了 / 尺寸不是 1:1 / URL 没版本串（微信与浏览器会一直用缓存里的旧卡，改的人以为上线了）。
{
  const fs4 = require('fs');
  const path4 = require('path');
  const idxSrc = fs4.readFileSync(path4.join(__dirname, '..', 'index.html'), 'utf8');
  const m = idxSrc.match(/<meta property="og:image" content="([^"]+)"/);
  ok(!!m, 'index.html 有 og:image（分享落地卡）');
  const url = m ? m[1] : '';
  ok(/sharecode=/.test(url), 'og:image 带 sharecode（裸域 403，卡片会裂成空图）');
  ok(/[?&]v=/.test(url), 'og:image 带版本串（换卡不换地址＝微信继续用旧卡）');
  const card = path4.join(__dirname, '..', 'assets', 'share-card.png');
  ok(fs4.existsSync(card), '分享卡文件在（assets/share-card.png）');
  if (fs4.existsSync(card)) {
    const head = fs4.readFileSync(card).subarray(0, 24);
    const w = head.readUInt32BE(16);   // PNG IHDR：宽高固定在第 16–23 字节
    const h = head.readUInt32BE(20);
    ok(w === 1200 && h === 1200, `分享卡是 1200×1200 正方（实测 ${w}×${h}——1:1 居中裁切不丢字的唯一尺寸）`);
    const kb = Math.round(fs4.statSync(card).size / 1024);
    ok(kb > 200, `分享卡不是空图/旧纯字卡（${kb}KB）`);
  }
  // 2026-11-26 22:5x 补洞：上面五条都咬不住「换了 CG 却没重出卡」——那张卡是**手动**截的
  // （chrome --headless --screenshot），不在 build 指纹里、也不在任何同步流程里。
  // 所以让卡自己记着底图指纹：换图不重出 ⇒ 指纹对不上，这里先红，别等分享出去才发现。
  const shSrc = fs4.readFileSync(path4.join(__dirname, '..', 'tools', 'sharecard.html'), 'utf8');
  const bgTag = (shSrc.match(/<img class="bg"[\s\S]{0,400}?>/) || [''])[0];
  const bgSrc = (bgTag.match(/src="([^"]+)"/) || [])[1] || '';
  const bgSha = (bgTag.match(/data-bg-sha="([0-9a-f]{64})"/) || [])[1] || '';
  ok(bgSrc === '../assets/cg/gate.webp', `分享卡底图仍是塔门 CG（现为 ${bgSrc || '无'}）`);
  ok(bgSha.length === 64, '分享卡在 sharecard.html 里记着自己的底图指纹（data-bg-sha）');
  if (bgSrc && bgSha) {
    const realSha = require('crypto').createHash('sha256')
      .update(fs4.readFileSync(path4.join(__dirname, '..', 'assets', 'cg', 'gate.webp'))).digest('hex');
    ok(realSha === bgSha,
      '分享卡底图指纹与 gate.webp 现内容一致（换图后要重出卡并更新 data-bg-sha）');
  }
  // 卡是 og:image 直读的那张；漏同步 = 分享出去全是旧脸，而源文件改动在本地看不出来
  const pubCard = path4.join(__dirname, '..', 'publish', 'assets', 'share-card.png');
  ok(fs4.existsSync(pubCard) && fs4.existsSync(card)
    && Buffer.compare(fs4.readFileSync(pubCard), fs4.readFileSync(card)) === 0,
    'publish 的分享卡与源逐字节一致（og:image 读的是线上这一份）');
}

// 榜单表头（2026-11-26 加练·美术 焦点B）：六列里有三列玩家读不出来——「未竟」是什么、第三到第六列// 哪一列是耗时。补表头之后最容易坏的不是表头本身，而是「表头与数据行各写一份列宽/列序」：
// 改宽只改一处就错位，改序只改一处就串列。分四件事量：列序同源 / 列宽同源 / 空榜不挂 / 表头不在滚动容器里。
{
  const CELLS = ['bd-rank', 'bd-name', 'bd-end', 'bd-floor', 'bd-steps', 'bd-time'];
  const headSrc2 = (mainSrc.match(/const BOARD_HEAD = \[([\s\S]*?)\];/) || [])[1] || '';
  const headCols = (headSrc2.match(/\['(bd-[a-z]+)'/g) || []).map((s) => s.slice(2, -1));
  const rowSrc2 = (mainSrc.match(/const boardRowHtml[\s\S]*?\n  function openBoard/) || [''])[0];
  const rowCols = [];
  for (const m of rowSrc2.matchAll(/class="(bd-[a-z]+)/g)) {
    if (CELLS.includes(m[1]) && !rowCols.includes(m[1])) rowCols.push(m[1]);
  }
  ok(headCols.length === CELLS.length && headCols.join(',') === rowCols.join(','),
    `表头列序与数据行一致（头 ${headCols.join('/') || '缺'} ｜ 行 ${rowCols.join('/') || '缺'}）`);
  // 列宽只有一处来源：head 与 row 都得读 --bd-cols，标题与数字才会竖着对齐
  const headBlock = (cssSrc.match(/\.bd-head \{([\s\S]*?)\}/) || [])[1] || '';
  const rowBlock = (cssSrc.match(/\n\.bd-row \{([\s\S]*?)\}/) || [])[1] || '';
  ok(/grid-template-columns: var\(--bd-cols\)/.test(headBlock) && /grid-template-columns: var\(--bd-cols\)/.test(rowBlock),
    '表头与数据行共用一份列宽（--bd-cols）');
  ok(/--bd-cols:[^;}]+;/.test((cssSrc.match(/\.board-panel \{[^}]*\}/) || [''])[0])
    && !/grid-template-columns: \d/.test(headBlock) && !/grid-template-columns: \d/.test(rowBlock),
    '列宽只在一处定义（表头或数据行里再写死一份 = 缩屏时两排错位）');
  // 同框：表头与行必须是同一个内容盒（同 1px 透明边 + 同左右内边距），否则右对齐的层/步/用时整体偏
  const rowPad = (rowBlock.match(/padding:\s*([^;]+);/) || [])[1] || '';
  ok(/border:\s*1px solid transparent/.test(headBlock) && /border:\s*1px solid transparent/.test(rowBlock)
    && /padding:\s*0 8px/.test(headBlock) && / 8px/.test(rowPad),
    `表头与行同内容盒（head padding 0 8px / row padding ${rowPad.trim() || '缺'}）`);
  // 表头必须挂在 #boardList 的 innerHTML 里、且排在行之前：放外面会被列表的滚动条挤偏 23px（实测四档视口）
  ok(!/\$\('boardHead'\)/.test(mainSrc) && /boardHeadHtml\(\)\s*\n\s*\+ m\.rows\.map\(boardRowHtml\)/.test(mainSrc),
    '表头与数据行同容器（放列表外面时滚动条会把右四列挤偏）');
  // 只有一处渲染：多出来的调用点 = 空榜也挂表头 / 两份表头各写一遍
  const headCalls = (mainSrc.match(/boardHeadHtml\(\)/g) || []).length;
  ok(headCalls === 1 && htmlSrc.indexOf('id="boardHead"') < 0,
    `表头只在一处渲染（调用 ${headCalls} 处；index.html 里没有独立表头容器）`);
}

// 语义色只走 token（style.css 顶部铁律②，2026-11-26 加练·美术 焦点D 首次上尺）。
// 病根：--warn / --info / --success / 亮金 这些色在 CSS 里被抄了十几处裸值，
// 改 token 改不到它们 —— 于是「同一级颜色」在两张卡上是两个值，且从此再也不会一起变。
// 量法：色值在 style.css 里出现的次数必须正好等于它的定义处（:root 那一条），注释里也不许写。
{
  const count = (re) => (cssSrc.match(re) || []).length;
  const tokens = [
    ['--warn', '#ffd27d'],
    ['--info', '#9fd8ff'],
    ['--success', '#6fe3a0'],
    ['--gold-bright', '#ffe6a8'],
  ];
  const drift = tokens.filter(([, hex]) => count(new RegExp(hex, 'gi')) > 1).map(([name, hex]) => `${hex}(${name})×${count(new RegExp(hex, 'gi'))}`);
  ok(drift.length === 0, `语义色裸值只留在 :root 定义处（越界的：${drift.join(' / ') || '无'}）`);
  ok(tokens.every(([name, hex]) => new RegExp(`${name}:\\s*${hex}`, 'i').test(cssSrc)),
    '四个 token 都真在 :root 里定义（别只改了引用、定义写错一个字符）');
  // 弱文灰（#9aa4b5 一族）**故意不收敛**：2026-11-17 焦点D 拍板「Δ≤14 在暗底不可辨，批量改要重跑
  // 25 屏对比度 + 全量截图，收益近零」。这里只锁「有名字的语义色」必须走 token，别顺手把灰也改了。
  // 誓约卡名色：六卡按 --vy 染，唯一例外是 .hero（推荐那条固定亮金）—— 那句只许出现一次，
  // 两份同值声明会让人以为漏改了一处（2026-11-26 去重）
  const heroName = (cssSrc.match(/\.vow-card\.hero \.vc-name\s*\{[^}]*\}/g) || []);
  ok(heroName.length === 1 && /var\(--gold-bright\)/.test(heroName[0] || ''),
    `誓约卡名色例外只有一句（实测 ${heroName.length} 句，且走 --gold-bright）`);
  ok(/\.vow-card \.vc-name\s*\{\s*color:\s*var\(--vy/.test(cssSrc),
    '誓约卡名色默认跟 --vy（身份色），不是写死金色');
}

// 首屏那句操作教学必须点明「屏幕上真有的那个控件」：方向键默认收起（Settings.dpad=false），
// 只说「方向键」等于教一个新手看不见的东西（2026-11-26 变体1 诊断改的）。
{
  const startHint = (htmlSrc.match(/<p class="hint">([^<]*)<\/p>/) || [])[1] || '';
  ok(startHint.length > 0 && (!startHint.includes('方向键') || startHint.includes('▲')),
    `首屏操作教学提到方向键时必须同时说清 ▲ 在哪（现文：${startHint || '缺'}）`);
  ok(/dpad:\s*false/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'main.js'), 'utf8')),
    '方向键默认收起这条前提仍在（若改成默认展开，上面那句就该恢复成「方向键 / 点击格子」）');
}

// 方向键长按的定时器只在按钮自己的指针事件里清（2026-11-26 自检面2 · 低 → 本轮修）：
// 浮层（商店/祭坛/对白）盖住按钮那一刻，按钮既收不到 pointerup 也收不到 pointerleave
//（hover 目标只在指针移动时重算）⇒ 320ms 后的 setInterval 会一直替玩家走，
// 手指一抬、浮层一关人自己就往前挪。act() 的守卫只挡住浮层开着那几秒，挡不住这个定时器。
{
  ok(/const dpadEnds = \[\];[\s\S]{0,200}?const endDpadHolds = \(\) =>/.test(mainSrc),
    '长按收尾有一份统一清单（不是每颗键各管各的）');
  ok(/document\.addEventListener\('pointerup', endDpadHolds, true\)/.test(mainSrc),
    '指针在别处抬起也收长按（document 级 pointerup）');
  ok(/document\.addEventListener\('pointercancel', endDpadHolds, true\)/.test(mainSrc),
    '指针被系统取消也收（pointercancel）');
  ok(/window\.addEventListener\('blur', endDpadHolds\)/.test(mainSrc), '切走窗口就收（blur）');
  ok(/visibilitychange[\s\S]{0,120}?endDpadHolds\(\)/.test(mainSrc), '切到后台就收（visibilitychange）');
  const pushAt = mainSrc.indexOf('dpadEnds.push(end)');
  const loopAt = mainSrc.indexOf("document.querySelectorAll('#dpad button').forEach");
  ok(pushAt > 0 && loopAt > 0 && pushAt > loopAt,
    '每颗方向键在 forEach 里把 end 交进清单（少交一颗＝那颗键没被修到）');
}

// 誓约的回声（2026-11-27 加练·叙事）：玩家开局十一秒立的那条誓，必须在叙事上有回音。
// 此前全塔只有 NPC 有——守誓之盾那句「立过的誓，我守到了」是别人的誓，玩家自己那条
// 走到结算连一句都没被认下（「誓」这条母题有回音，回音却没落在玩家身上）。
// 六条一起守：八条都有 / 单句 ≤30 字 / 互不相同 / 不写数值 / 胜败两个出口都念且只念一处。
{
  const ids = Object.keys(GD.vows);
  const text = (id) => String((GD.vows[id] || {}).echo || '').trim();
  const missing = ids.filter((id) => !text(id));
  ok(ids.length === 8 && missing.length === 0, `八条誓约都有结算回声（缺：${missing.join('/') || '无'}）`);
  const chars = (t) => Array.from(t).length;
  const long = ids.filter((id) => chars(text(id)) > 30);
  ok(long.length === 0, `回声单句 ≤30 字，后日谈末尾挂得住（超的：${long.join('/') || '无'}）`);
  ok(new Set(ids.map(text)).size === ids.length, '八条回声互不相同（复制粘贴同一句＝只有一条誓约被认下）');
  // 数值只许写在 desc 一处：echo 里再写一遍必然与 dmgMul / 回血比例漂（11-19 起的老账）
  const numbered = ids.filter((id) => /[0-9０-９%％]/.test(text(id)));
  ok(numbered.length === 0, `回声不写具体数值（越界：${numbered.join('/') || '无'}）`);
  const fnBody = (name) => {
    const i = mainSrc.indexOf(`function ${name}(`);
    if (i < 0) return '';
    const rest = mainSrc.slice(i + 10);
    const j = rest.indexOf('\n  function ');
    return rest.slice(0, j < 0 ? rest.length : j);
  };
  const winBody = fnBody('showEnd');
  const deathBody = fnBody('showDeath');
  // 数「行」不数「次」：同一行里写 `cond ? ' '+x : ''` 会命中两次，那是拼接不是两次念
  const echoLines = (src) => src.split('\n').filter((l) => /vowDef( && vowDef)?\.echo/.test(l)).length;
  ok(echoLines(winBody) === 1 && winBody.includes('vowLine'),
    `胜局出口：回声只在 showEnd 定义一次并接进后日谈（实测 ${echoLines(winBody)} 行）`);
  ok(echoLines(deathBody) === 1,
    `败局出口：同一句照念且只念一处（实测 ${echoLines(deathBody)} 行）`);
}

// 层灯满 13 盏＝收集到底，那一格不许再画一个永远 disabled 的按钮（2026-11-27 变体1 诊断）。
// 老玩家的最后一屏留着一个点不动的控件，属「点了没反应」的弱形态；同族的 warn('十三盏灯都亮了')
// 因按钮 disabled 而不可达——写了没人听。两条契约：满灯时不渲染 lamp-btn / 必须有一句终态交代。
{
  const i = mainSrc.indexOf('const lampRow = !memView.lockedVow');
  const seg = i < 0 ? '' : mainSrc.slice(i, i + 900);
  ok(i > 0 && /lampFull/.test(seg), '层灯那一格得有满灯判据（lampFull）');
  ok(seg.indexOf('Meta.lamps >= LAMP_MAX') < 0 || seg.indexOf("'disabled'") < 0,
    '满灯不许再用 disabled 按钮糊过去（disabled 只留给「余烬不够」）');
  ok(/十三盏都亮了/.test(seg), '满灯后必须有一句终态交代（不是留个点不动的控件）');
}

// 浮层 ⇄ 「盖住整屏就别走人」名单（2026-11-27 自检第 1 面）。
// 这一类 bug 在本项目反复出现（速查卡 / 重置确认 / 祭坛都漏过）：整屏浮层开着，方向键照旧把人带走，
// 而那一页可能已经停止保存（「另一页在玩」）⇒ 走了的路全丢。名单在 main.js，浮层在 index.html，
// 两边各写一份就一定会漂。这里**从源码现算两边**，只留两条有真分支的例外（它们自己接管键盘）。
{
  const htmlIds = (htmlSrc.match(/id="([A-Za-z]+Overlay)"/g) || [])
    .map((t) => t.slice(4, -1));
  const uniq = htmlIds.filter((v, i) => htmlIds.indexOf(v) === i);
  const i0 = mainSrc.indexOf('const FULL_OVERLAYS = [');
  const i1 = i0 < 0 ? -1 : mainSrc.indexOf('];', i0);
  const listSrc = i0 < 0 || i1 < 0 ? '' : mainSrc.slice(i0, i1);
  const listed = (listSrc.match(/'([A-Za-z]+Overlay)'/g) || []).map((t) => t.slice(1, -1));
  // 例外：Boss 登场字幕与立绘放大——它们叠在对白之上，键盘在 keydown 开头就整段 return
  const EXEMPT = ['bossIntroOverlay', 'portraitOverlay'];
  ok(uniq.length >= 18 && listed.length >= 18, `浮层名单与页面都能读出来（页面 ${uniq.length} / 名单 ${listed.length}）`);
  const missing = uniq.filter((id) => listed.indexOf(id) < 0 && EXEMPT.indexOf(id) < 0);
  ok(missing.length === 0, `每个整屏浮层都在「别走人」名单里（漏登记：${missing.join(' / ') || '无'}）`);
  const ghost = listed.filter((id) => uniq.indexOf(id) < 0);
  ok(ghost.length === 0, `名单里没有页面已删的浮层（多余：${ghost.join(' / ') || '无'}）`);
  const noGuard = EXEMPT.filter((id) => mainSrc.indexOf(`if (el.${id}.classList.contains('show'))`) < 0);
  ok(noGuard.length === 0, `免登记的两条必须自己接管键盘（缺分支：${noGuard.join(' / ') || '无'}）`);
}

// CG 在手时，垫在下面的矢量层循环动效必须停（2026-11-27 10:4x 加练美术焦点C）。
// 起因：`.bd-shot` 不透明、z-index:1 整块盖住 `.dlg-scene` 的矢量层，火光呼吸 / 双雾对漂 / 星点闪 /
// 锁芯转环 / 镜头缓推这 13 个动效类玩家一帧也看不见，却常驻同等数量的合成层空转（移动端发热 / 耗电）。
// 这条此前量不到：`rm-check` 只问「减弱模式停没停」，不问「该不该跑」。契约三条——
// ①CSS 那一族规则必须把**每一处**挂了 animation 的 bd-/sc- 类都收住（现算两边，将来加动效忘了登记会红）
// ②切类判据必须看渲染完的 DOM 里有没有 .bd-shot（而不是拼串时的入参：序章与其余场景两条路径）
// ③图挂掉要能摘类，否则兜底矢量图亮出来时是静止画面。
{
  const scenesSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'scenes.js'), 'utf8');
  const i0 = cssSrc.indexOf('.dlg-scene.has-cg ');
  const i1 = i0 < 0 ? -1 : cssSrc.indexOf('}', i0);
  const rule = i0 < 0 || i1 < 0 ? '' : cssSrc.slice(i0, i1);
  ok(i0 > 0 && /animation:\s*none/.test(rule), 'CSS 有「CG 在手停矢量动效」这一族规则');
  const animated = [];
  (cssSrc.match(/^\.(?:bd|sc)-[a-z0-9]+ \{[^}]*\}/gm) || []).forEach((blk) => {
    const cls = blk.slice(1, blk.indexOf(' '));
    // `.bd-shot` 是**看得见的**那一层（缓推 + 进场淡入挂在它自己身上），必须照跑——
    // 它由 rm-check 第 6 组守，不在这一族的排除对象里。
    if (cls === 'bd-shot') return;
    const anim = /animation:\s*([^;]+)/.exec(blk);
    if (anim && anim[1].trim() !== 'none') animated.push(cls);
  });
  const miss = animated.filter((c) => rule.indexOf('.' + c) < 0);
  ok(animated.length >= 12, `CSS 里读得出矢量层动效类（实测 ${animated.length} 个，应 ≥12）`);
  ok(miss.length === 0, `每一处循环动效都被 has-cg 规则收住（漏的：${miss.join('/') || '无'}）`);
  ok(/box\.querySelector\('\.bd-shot'\)/.test(scenesSrc)
    && /classList\.toggle\('has-cg', !!shot\)/.test(scenesSrc),
    'paint() 按渲染完的 DOM 里有没有 .bd-shot 切 has-cg（不看拼串入参）');
  ok((scenesSrc.split("classList.toggle('has-cg'").length - 1) === 1,
    '切类只有一处（序章与其余场景共用 paint，不许各判一次）');
  ok(/probe\.onerror = \(\) => box\.classList\.remove\('has-cg'\)/.test(scenesSrc),
    'CG 图挂掉要摘掉 has-cg（否则兜底矢量图亮出来是静止的）');
}

// 输入框字号 ≥16px（2026-11-27 加练·社交）。
// 病根：iOS Safari / 微信 WKWebView 聚焦 font-size <16px 的控件会**自动放大整页**，而本页
// `viewport` 写了 `user-scalable=no` —— 那条从 iOS 10 起只挡双指缩放，挡不住聚焦缩放。
// 于是玩家点「贴朋友的挑战码」→ 面板被放大到出屏、pinch 又禁着，只能收起键盘才退回来；
// 而这条链正是本作社交的主干（拿朋友的码 → 进榜 → 比谁走得远）。
// 此前 `.code-input` 是 11px、`.hb-search input` 是 12px，两者都踩线；`tap-check` 只量命中区、
// 从不问字号，`contrast-check` 只管对比度 —— 这个阈值从来没被任何闸门看过。
// 契约：凡选择器里带 input 的规则，font-size 必须是 ≥16 的**字面 px**（写 var(--fs-tag) 这类
// 令牌同样算红：令牌哪天被调小，这里不会有人记得回来改）。
{
  const blocks = cssSrc.match(/^[^\n{}]*input[^\n{}]*\{[^}]*\}/gm) || [];
  const selOf = (b) => b.slice(0, b.indexOf('{')).trim();
  const has = (s) => blocks.some((b) => selOf(b).indexOf(s) >= 0);
  ok(has('.code-input') && has('.hb-search input'),
    `两个输入框的规则都读得到（${blocks.map(selOf).join(' / ') || '一个都没有'}）`);
  const badFs = blocks.map((b) => {
    const m = /font-size:\s*([^;]+)/.exec(b);
    if (!m) return ''; // 没声明字号（`::placeholder`、只调色）不归这条管
    const v = m[1].trim();
    const px = /^([0-9.]+)px$/.exec(v);
    if (!px) return selOf(b) + ' → ' + v;
    return parseFloat(px[1]) >= 16 ? '' : selOf(b) + ' → ' + v;
  }).filter(Boolean);
  ok(badFs.length === 0,
    `凡输入框字号 ≥16px 字面 px（iOS 聚焦不缩放；不合格：${badFs.join(' / ') || '无'}）`);
}

// 撞墙这一步必须「说出口」（2026-11-27 13:2x 加练·游戏性 焦点B）。
// 病根：`act()` 的 'blocked' 分支只 `Sound.play('lock')` 就 return，而 `Engine.tryMove()` 在这条路上
// 一直带着 msg（墙＝「石墙挡住了去路」／读过的碑＝「碑上的字你已经读过了」）——话在引擎里生成了，
// 到渲染层被整条丢掉。手机拨到静音时，按方向键撞墙＝屏幕上没有任何变化；而这恰好是新玩家第一分钟
// 最可能做的事（先按一下方向键试试）。全作唯一零反馈的操作，长期没人发现是因为没有闸门问过它。
// 契约：① 该分支必须读 `ev.msg`；② 必须过节流（键盘连发最短 ~95ms，裸 log 会 7 行日志刷满）；
// ③ 引擎那两条 blocked 必须继续带 msg——引擎哪天把话删了，这里就成了一个永远为假的 if。
{
  const blockedCase = /case 'blocked':([\s\S]*?)case 'battle':/.exec(mainSrc);
  const body = blockedCase ? blockedCase[1] : '';
  ok(!!body, 'act() 里读得到 blocked 分支');
  ok(/log\(ev\.msg/.test(body), `撞墙要把引擎那句话说出来（现读：${body ? body.replace(/\s+/g, ' ').trim().slice(0, 46) : '空'}）`);
  ok(/BUMP_SAY_GAP/.test(body), '撞墙提示过节流常量（长按连发不许把日志刷满）');
  const gapDecl = /const BUMP_SAY_GAP = (\d+)/.exec(mainSrc);
  ok(!!gapDecl && Number(gapDecl[1]) >= 400, `节流间隔 ≥400ms（现 ${gapDecl ? gapDecl[1] + 'ms' : '无'}）`);
  const engSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'engine.js'), 'utf8');
  ok(/return \{ type: 'blocked', msg: '石墙挡住了去路' \}/.test(engSrc)
    && /return \{ type: 'blocked', msg: '碑上的字你已经读过了' \}/.test(engSrc),
    '引擎的墙 / 读过的碑两条 blocked 仍带 msg（这里的话源不能断）');
}

// 日志行的 class 必须真有样式（2026-11-27 13:2x 变体 3 收敛轮）。
// 病根：`log(msg, cls)` 的 cls 从没有人校验过——CSS 里只有 `.line.good/.warn/.gold`，
// 而调用点写过 `'dim'`（序章「读过了」那句），这个类不存在 ⇒ 参数等于没传，改的人以为
// 「这行会弱化」。同型的旧账已有好几件（战斗面板三颗死按钮、`pb-emoji` 死字号），
// 都是「写了一个看起来生效、实际什么都不做的东西」。
// 契约：凡 `log(..., 'x')` 的字面类名，CSS 里必须有 `#log .line.x`；新增类要去写规则，
// 不写就别传（不传就是普通行，最新一行本来就全额不透明）。
{
  const used = new Set();
  const re = /\blog\((?:[^()]|\([^()]*\))*,\s*'([a-z]+)'\s*\)/g;
  let m;
  while ((m = re.exec(mainSrc))) used.add(m[1]);
  const missing = [...used].filter((c) => !new RegExp('\\.line\\.' + c + '\\b').test(cssSrc));
  ok(used.size > 0, `读得到日志行用到的类（${[...used].join('/') || '无'}）`);
  ok(missing.length === 0, `每个日志类都有样式（没样式的：${missing.join('/') || '无'}）`);
}

// 剪贴板出口只有一份、且防住「挂起」（2026-11-27 加练 社交）。
// 病根：挑战码/挑战链接/结算分享走 `copyText`（异步写 + 拒绝兜底，**没有超时**），
// 导出 JSON 自己另写了一份（异步写 + 350ms 超时 + execCommand）——两份实现，只有后者防住
// 「writeText 既不 resolve 也不 reject」：iOS WKWebView 在非用户手势 / 权限被拒又没弹窗时
// promise 会一直挂着，按钮文案永远不变、日志和提示条都不动 = 手机上「点了没反应」，
// 而这是把成绩发出去的唯一入口。真机探针实测：摘掉超时后按钮停在「复制」、提示条为空。
{
  const writeSites = (mainSrc.match(/\.writeText\(/g) || []).length;
  ok(writeSites === 1, `异步剪贴板只有一处调用点（现 ${writeSites} 处——多出来的那份就是漏了兜底的那份）`);
  const m = mainSrc.match(/const CLIP_TIMEOUT = (\d+);/);
  ok(!!m && Number(m[1]) > 0 && Number(m[1]) <= 1000,
    `剪贴板超时有明确上限（CLIP_TIMEOUT = ${m ? m[1] : '缺'}ms，取值域 (0,1000]）`);
  const fnAt = mainSrc.indexOf('function writeClipboard(');
  const fn = fnAt < 0 ? '' : mainSrc.slice(fnAt, fnAt + 1200);
  ok(/setTimeout\(\(\) => done\(\(\) => tryFallback\(ok\)\), CLIP_TIMEOUT\)/.test(fn),
    '超时到点必须落到 execCommand 兜底（只 reject 不超时 = WKWebView 上照样没反应）');
  ok(/writeClipboard\(t, ok, fail\)/.test(mainSrc) && /writeClipboard\(JSON\.stringify\(rows\)/.test(mainSrc),
    '挑战码与导出两条出口都走这一处（不许再长出第二份实现）');
  ok(/function fallbackCopy\(text\)/.test(mainSrc) && /return ok;/.test(mainSrc),
    '兜底层返回布尔、不自己 warn（否则同一次失败出两条提示）');
}

console.log(`挑战码 / 触控 / 桥接 / 视图模型单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);

process.exit(bad ? 1 : 0);
