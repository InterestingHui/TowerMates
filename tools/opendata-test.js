// 开放数据域榜单：纯函数单测（normalize / sortRows），不依赖 canvas
// 跑法：node tools/opendata-test.js
const OD = require('../wechat/wxgame/openDataContext/index.js');
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('✓ ' + name); }
  catch (e) { fail++; console.log('✗ ' + name + ' — ' + e.message); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error((msg || '') + ' 期望 ' + JSON.stringify(b) + '，实得 ' + JSON.stringify(a)); };

// ---- normalize：微信原始 KVDataList → 内部字段 ----
t('解析 KVDataList 形状', () => {
  const r = OD.normalize([{ nickname: '阿箬', KVDataList: [
    { key: 'tm_floor', value: '12' }, { key: 'tm_time', value: '1340' },
    { key: 'tm_vow', value: 'mercy' }, { key: 'tm_ending', value: 'plain' },
    { key: 'tm_seal', value: 'ward' }, { key: 'tm_goals', value: '2' }] }]);
  eq(r.length, 1, '条数');
  eq(r[0].name, '阿箬', '名字');
  eq(r[0].floor, 12, '层数');
  eq(r[0].time, 1340, '用时');
  eq(r[0].vow, 'mercy', '誓约');
  eq(r[0].seal, 'ward', '塔印');
});

t('也接受已解析的对象（H5 调试路径）', () => {
  const r = OD.normalize([{ name: '蜡', floor: 6, time: 540, vow: 'none', seal: '' }]);
  eq(r[0].floor, 6);
  eq(r[0].vow, 'none');
});

t('层数 0 的名录不占榜位', () => {
  const r = OD.normalize([
    { nickname: '路过', KVDataList: [{ key: 'tm_floor', value: '0' }] },
    { nickname: '进过塔', KVDataList: [{ key: 'tm_floor', value: '3' }] },
  ]);
  eq(r.length, 1, '只剩进过塔的');
  eq(r[0].name, '进过塔');
});

t('脏值不炸：非法层数钳到 0 被过滤，名字缺省为塔友', () => {
  const r = OD.normalize([{ KVDataList: [{ key: 'tm_floor', value: 'abc' }] }, null, 'x']);
  eq(r.length, 0, '全被过滤');
});

t('名字截断到 16 字、去标签字符', () => {
  const r = OD.normalize([{ nickname: '<b>' + '很长的名字'.repeat(10), KVDataList: [{ key: 'tm_floor', value: '5' }] }]);
  eq(r[0].name.length <= 16, true, '长度');
  eq(/[<>]/.test(r[0].name), false, '不含标签字符');
});

t('非数组输入返回空数组', () => {
  eq(OD.normalize(null).length, 0);
  eq(OD.normalize(undefined).length, 0);
});

// ---- sortRows：先比高度，同层比用时 ----
t('层数降序优先', () => {
  const s = OD.sortRows([{ name: 'a', floor: 3, time: 100 }, { name: 'b', floor: 12, time: 999 }]);
  eq(s[0].name, 'b');
});

t('同层用时升序', () => {
  const s = OD.sortRows([{ name: '慢', floor: 12, time: 1340 }, { name: '快', floor: 12, time: 980 }]);
  eq(s[0].name, '快');
});

t('同层同用时按名字稳定排序', () => {
  const s = OD.sortRows([{ name: '乙', floor: 5, time: 100 }, { name: '甲', floor: 5, time: 100 }]);
  eq(s.length, 2);
  eq(s[0].name, String(s[0].name));
});

t('不改原数组', () => {
  const src = [{ name: 'a', floor: 1, time: 1 }];
  OD.sortRows(src);
  eq(src.length, 1);
});

console.log('\n' + (fail ? '✗ ' : '✓ ') + `${pass} 项通过` + (fail ? `，${fail} 项失败` : ''));
process.exit(fail ? 1 : 0);
