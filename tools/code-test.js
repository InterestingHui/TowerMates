// 挑战码 / 触屏 / 平台桥接单测（纯 Node，不依赖 DOM）
const C = require('../js/challenge.js');
let pass = 0, bad = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { bad++; console.log('✗ ' + label); }
}

const sum = { ending: 'true', vow: 'ascetic', floor: 13, level: 18, steps: 640, time: 512, seal: 'clear', goals: 13, margin: 'A' };
const code = C.encode(sum);
ok(code.indexOf(C.PREFIX) === 0 && C.PREFIX === 'TM4.', '新码带 v4 版本前缀');
const d = C.decode(code);
ok(!!d && d.version === 4 && !d.legacy, '新码可解');
ok(d.vow === 'ascetic', '誓约写入');
ok(d.seal === 'clear' && d.goals === 13, '塔印与塔规数写入');
ok(d.margin === 'A', '决战余裕写入');
ok(d.score === undefined && d.grade === undefined, '码里已无结算分与评级字段');
ok(d.ending === 'true' && d.floor === 13 && d.level === 18 && d.steps === 640 && d.time === 512, '层数/用时/步数往返一致');
ok(C.decode(' ' + code + '\n').seal === 'clear', '容忍首尾空白/换行');

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

console.log(`挑战码 / 触控 / 桥接单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);
process.exit(bad ? 1 : 0);
