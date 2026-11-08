// TowerMates · 魔塔 —— 游戏数据（v0.4）
// 所有数值都在这里改，改完刷新页面生效。
// 地图 11x11，图例见下方 LEGEND。剧情文本在 story.js，立绘在 portraits.js。

window.GAME_DATA = (function () {
  const LEGEND = {
    '#': '墙', '.': '地面', '@': '起点',
    u: '上楼', n: '下楼',
    y: '黄门', r: '红门',
    p: '红药水', P: '蓝药水', s: '铁剑', d: '铁盾', m: '力量宝石',
    k: '黄钥匙', L: '红钥匙', $: '金币', M: '商人', T: '公主', J: '工匠手记',
    O: '守誓之盾', S: '断裂佩剑', X: '八个人的行李',
  };

  // 统一色板：CSS 与 Canvas 共用同一套语义色
  const PALETTE = {
    ink: '#07090f',
    stone: '#2b3140',
    stone2: '#232837',
    gold: '#e8c46a',
    ember: '#ff9f6b',
    flame: '#ffd27d',
    cyan: '#9fd8ff',
    blood: '#c94a52',
    vera: '#ffc4e0',
    green: '#6fe3a0',
    mist: '#8f7bff',
  };

  // 怪物按「类」统一配色：同一族的怪在地图上用同一种底光，便于一眼分辨威胁类型
  const kindColor = {
    兽: 'rgba(255, 176, 110, 0.16)',
    亡: 'rgba(140, 200, 255, 0.15)',
    构: 'rgba(176, 184, 200, 0.14)',
    异: 'rgba(150, 220, 150, 0.14)',
    锁: 'rgba(255, 80, 70, 0.2)',
    魂: 'rgba(159, 216, 255, 0.2)',
  };

  const monsters = {
    A: { name: '蝙蝠', emoji: '🦇', hp: 42, atk: 20, def: 1, gold: 3, exp: 2, kind: '兽' },
    B: { name: '史莱姆', emoji: '🦠', hp: 78, atk: 25, def: 4, gold: 5, exp: 4, kind: '异' },
    C: { name: '骷髅兵', emoji: '💀', hp: 110, atk: 31, def: 6, gold: 8, exp: 6, kind: '亡' },
    D: { name: '僵尸', emoji: '🧟', hp: 148, atk: 39, def: 9, gold: 12, exp: 10, kind: '亡' },
    E: { name: '石像鬼', emoji: '🗿', hp: 210, atk: 51, def: 15, gold: 20, exp: 16, kind: '构' },
    W: { name: '怨灵', emoji: '👻', hp: 126, atk: 49, def: 6, gold: 16, exp: 16, kind: '亡' },
    F: { name: '狼人', emoji: '🐺', hp: 265, atk: 61, def: 19, gold: 30, exp: 24, kind: '兽' },
    H: { name: '骷髅队长', emoji: '🪖', hp: 340, atk: 69, def: 25, gold: 40, exp: 30, kind: '亡' },
    V: { name: '吸血鬼', emoji: '🧛', hp: 360, atk: 69, def: 21, gold: 45, exp: 34, kind: '亡' },
    Z: { name: '魔王', emoji: '🐉', hp: 480, atk: 90, def: 22, gold: 0, exp: 0, boss: true, kind: '锁' },
    G: { name: '烛', emoji: '🕯️', hp: 50, atk: 0, def: 5, gold: 0, exp: 0, ghost: true, kind: '魂' },
  };

  const items = {
    p: { name: '红药水', emoji: '🧪', type: 'hp', value: 160 },
    P: { name: '蓝药水', emoji: '💧', type: 'hp', value: 420 },
    s: { name: '铁剑', emoji: '🗡️', type: 'atk', value: 2 },
    d: { name: '铁盾', emoji: '🛡️', type: 'def', value: 2 },
    m: { name: '力量宝石', emoji: '💎', type: 'both', value: 2 },
    k: { name: '黄钥匙', emoji: '🔑', type: 'key', key: 'y' },
    L: { name: '红钥匙', emoji: '🗝️', type: 'key', key: 'r' },
    J: { name: '工匠手记', emoji: '📜', type: 'story', flag: 'journal', story: 'journal' },
    // 遗物：一次性、永久生效，构成每局的取舍
    O: { name: '守誓之盾', emoji: '🛡️', type: 'relic', relic: 'ward' },
    S: { name: '断裂佩剑', emoji: '⚔️', type: 'relic', relic: 'edge', story: 'eighthSword' },
  };

  // 遗物说明（HUD / 设置页 / 结算都用它）
  const relics = {
    ward: { name: '守誓之盾', emoji: '🛡️', short: '盾', desc: '每场战斗承伤 −12%' },
    edge: { name: '断刃之锋', emoji: '⚔️', short: '刃', desc: '攻击 +6（拾取时结算）' },
    ember: { name: '余烬灯芯', emoji: '🔥', short: '烬', desc: '每次击杀回复 2% 生命（至少 4）' },
    // 前八位勇者留下的行李：在第 3 层的祭坛三选一
    steel: { name: '鸦的铁腕', emoji: '🦾', short: '腕', desc: '攻击 +3、防御 +3' },
    thrift: { name: '岚的账本', emoji: '📒', short: '账', desc: '商店价格 −25%' },
    vigor: { name: '磐的灯油', emoji: '🏺', short: '油', desc: '每次升级额外 +80 生命' },
    scout: { name: '无名之镜', emoji: '🔍', short: '镜', desc: '直接获得窥探之镜' },
  };

  // 祭坛的可选池（不含剧情固定的守誓之盾/断刃之锋）
  const altarPool = ['steel', 'thrift', 'vigor', 'scout', 'ember'];

  // 升到下一级所需经验（索引 = 当前等级-1）
  const levelExp = [10, 24, 42, 64, 92, 125, 165, 205];

  const floors = [
    {
      name: '塔之入口',
      tip: '塔里的空气不流动。墙上的刻痕很新——有人一直在数着进来的人。',
      map: [
        '###########',
        '#....#....#',
        '#.A..#.k..#',
        '#....#..G.#',
        '#..###....#',
        '#.@...B...#',
        '#..###....#',
        '#....#..p.#',
        '#.s..#....#',
        '#....#.$u.#',
        '###########',
      ],
    },
    {
      name: '回廊',
      tip: '楼梯被反复修过。蜡油还是温的，像刚有人提着灯走过。',
      map: [
        '###########',
        '#u.......$#',
        '#.#######.#',
        '#.#.....#.#',
        '#.#.C.C.#.#',
        '#.#..d..#.#',
        '#.#.#$#.#.#',
        '#.#.#y#.#.#',
        '#...#.#k..#',
        '#n..p...C.#',
        '###########',
      ],
    },
    {
      name: '幽暗集市',
      tip: '空荡的大厅里只有一副货摊。商人说，他在等「像你一样傻的人」。',
      map: [
        '###########',
        '#u...D...$#',
        '#.#######.#',
        '#.#..M..#.#',
        '#.#L....#.#',
        '#.#..D..#.#',
        '#.###.###.#',
        '#....k...y#',
        '#.p.....X$#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '密道',
      tip: '这一层不在图纸上。造它的人，把答案折进一页纸，压在砖缝里。',
      map: [
        '###########',
        '#n.......O#',
        '#.#######r#',
        '#.#.....#.#',
        '#.#..E..#.#',
        '#.#.....#.#',
        '#.###.###.#',
        '#.J.....P.#',
        '#.W....k..#',
        '#.......u.#',
        '###########',
      ],
    },
    {
      name: '狼厅',
      tip: '狼群不饿，它们在守着什么。角落里有半截剑，刃口全是往上砍的崩口。',
      map: [
        '###########',
        '#u.G...S.X#',
        '#.#######.#',
        '#.#.....#.#',
        '#.#.H.V.#.#',
        '#.#..p.W#.#',
        '#.###y###.#',
        '#..W.F.D.P#',
        '#.k..s..d.#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '塔顶王座',
      tip: '塔顶没有想象中的黑暗。王座空着，烛台灭着；有人替你把路让开了。',
      map: [
        '###########',
        '#....T....#',
        '#.........#',
        '#.........#',
        '#####Z#####',
        '#.........#',
        '#.........#',
        '#.........#',
        '#.P.....$.#',
        '#....n....#',
        '###########',
      ],
    },
  ];

  const shop = [
    { id: 'key', name: '黄钥匙', emoji: '🔑', price: 20, key: 'y' },
    { id: 'rkey', name: '红钥匙', emoji: '🗝️', price: 45, key: 'r' },
    { id: 'potion', name: '红药水', emoji: '🧪', price: 30, hp: 160 },
    { id: 'atk', name: '力量训练', emoji: '⚔️', price: 60, atk: 2 },
    { id: 'def', name: '护甲强化', emoji: '🛡️', price: 60, def: 2 },
    { id: 'ember', name: '余烬灯芯', emoji: '🔥', price: 120, relic: 'ember', once: true },
    { id: 'codex', name: '窥探之镜', emoji: '🔮', price: 100, codex: true, once: true },
  ];

  return { LEGEND, PALETTE, kindColor, monsters, items, relics, altarPool, levelExp, floors, shop };
})();
