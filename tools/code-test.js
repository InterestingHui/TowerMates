// 挑战码编解码单测（纯 Node，不依赖 DOM）
const C = require('../js/challenge.js');
let pass = 0, bad = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { bad++; console.log('✗ ' + label); }
}

const sum = { ending: 'true', vow: 'ascetic', floor: 13, level: 18, steps: 640, time: 512, score: 4380, grade: 'S' };
const code = C.encode(sum);
ok(code.indexOf(C.PREFIX) === 0, '新码带版本前缀');
const d = C.decode(code);
ok(!!d && d.version === 2 && !d.legacy, '新码可解');
ok(d.vow === 'ascetic', '誓约写入');
ok(d.score === 4380 && d.grade === 'S', '分数与评级写入');
ok(d.ending === 'true' && d.floor === 13 && d.level === 18 && d.steps === 640 && d.time === 512, '其余字段往返一致');
ok(C.decode(' ' + code + '\n').score === 4380, '容忍首尾空白/换行');

// 旧码（v1）必须还能贴进来
function legacyEncode(raw) {
  const b = Buffer.from('TM' + raw, 'utf8').toString('base64').replace(/=+$/, '');
  return b;
}
const old = C.decode(legacyEncode('1.13.18.640.512'));
ok(!!old && old.legacy && old.version === 1, '旧码可解并标记 legacy');
ok(old.ending === 'true' && old.floor === 13 && old.steps === 640, '旧码字段还原');
ok(old.vow === 'none' && old.score === null, '旧码缺失字段给中性默认');

// 恶意 / 脏输入不能进榜单
ok(C.decode('') === null, '空串拒绝');
ok(C.decode('TM2.@@@@') === null, '非法 base64 拒绝');
ok(C.decode('随便一串汉字') === null, '乱码拒绝');
ok(C.decode('TM2.' + 'A'.repeat(500)) === null, '超长拒绝');
ok(C.decode(C.PREFIX + Buffer.from(JSON.stringify({ v: 3, s: 999 })).toString('base64')) === null, '未知版本拒绝');
const injected = C.encode({ vow: '<img src=x>', grade: 'S', score: -10, floor: 999, steps: -3 });
const di = C.decode(injected);
ok(di.vow.indexOf('<') < 0 && di.grade === 'S', '标签字符被剔除');
ok(di.score === 0 && di.floor === 99 && di.steps === 0, '数值被钳到合法区间');

console.log(`挑战码单测：${pass} 项通过${bad ? `，${bad} 项失败` : ''}`);
process.exit(bad ? 1 : 0);
