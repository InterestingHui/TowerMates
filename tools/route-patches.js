// 改造补丁的单一来源：tools/route-proposal.js（预演）与 tools/route-board.js（出图）共用。
// 每条 { f:层(1起), x, y, from, to, why }。from 必须与现状字符一致，预演会逐条校验。
const PATCHES = [
  // ---- P0 结构 ----
  { f: 3, x: 3, y: 3, from: '.', to: 'P', why: '上层左支翼尽头放蓝药（原为空地）', tag: 'P0-1' },
  { f: 3, x: 5, y: 3, from: 'D', to: '.', why: '僵尸离开零收益口袋', tag: 'P0-2' },
  { f: 3, x: 4, y: 4, from: '.', to: '#', why: '封掉口袋的第二個入口，让它成为单口内室', tag: 'P0-2' },
  { f: 3, x: 4, y: 3, from: '.', to: 'D', why: '僵尸改守内室唯一入口', tag: 'P0-2' },
  { f: 5, x: 7, y: 1, from: 'S', to: '.', why: '断剑离开顶层货架', tag: 'P0-3' },
  { f: 5, x: 5, y: 3, from: '.', to: 'S', why: '断剑放进狼厅内室（与图鉴 from 文案一致）', tag: 'P0-3' },
  { f: 7, x: 5, y: 5, from: 'R', to: '.', why: '提灯僧离开三面墙的壁龛', tag: 'P0-5' },
  { f: 7, x: 1, y: 5, from: '.', to: 'R', why: '提灯僧站上唯一走廊', tag: 'P0-5' },
  { f: 7, x: 5, y: 7, from: 'p', to: '.', why: '红药离开路口', tag: 'P0-6' },
  { f: 7, x: 5, y: 5, from: '.', to: 'p', why: '壁龛尽头补红药', tag: 'P0-6' },
  { f: 9, x: 5, y: 4, from: '2', to: '.', why: '锁虫离开 Boss 后唯一咽喉', tag: 'P0-7' },
  { f: 9, x: 6, y: 4, from: '.', to: '2', why: '锁虫改守右廊（想快就得多打一场）', tag: 'P0-7' },
  { f: 9, x: 3, y: 2, from: '#', to: '.', why: '开一条左耳室绕行：Boss 后可以零战斗离场', tag: 'P0-7' },
  { f: 10, x: 9, y: 9, from: 'k', to: 'M', why: '死钥匙换补给点：名墙脚下开秤', tag: 'P0-8' },
  // ---- P1 收益 ----
  { f: 4, x: 8, y: 7, from: 'P', to: '.', why: '蓝药离开主路', tag: 'P1-2' },
  { f: 4, x: 5, y: 4, from: 'E', to: '.', why: '石像鬼让出密室中心', tag: 'P1-1' },
  { f: 4, x: 5, y: 5, from: '.', to: 'E', why: '石像鬼改守密室唯一入口', tag: 'P1-1' },
  { f: 4, x: 5, y: 4, from: '.', to: 'P', why: '蓝药进石像鬼密室（原 16 格空房）', tag: 'P1-2' },
  { f: 11, x: 9, y: 6, from: '.', to: 'y', why: '右廊加快捷门：1 黄钥匙买下 522 点承伤', tag: 'P1-5' },
];

// 图上要标红的问题格（与报告 §4 的编号一致）。label 走图例，不压在格子上。
const ISSUES = {
  2: [{ x: 1, y: 5, label: '空走廊：整层可跳过' }],
  3: [{ x: 5, y: 3, label: '零收益僵尸口袋' }, { x: 3, y: 3, label: '红门后空死区' }],
  4: [{ x: 5, y: 4, label: '16 格空密室' }],
  5: [{ x: 5, y: 5, label: '净亏内室：3 精英换 1 红药' }],
  7: [{ x: 5, y: 5, label: '三面墙的壁龛怪' }],
  9: [{ x: 5, y: 4, label: 'Boss 后唯一咽喉' }, { x: 4, y: 1, label: 'Boss 后走廊' }],
  10: [{ x: 9, y: 9, label: '死黄钥匙' }],
};

module.exports = { PATCHES, ISSUES };
