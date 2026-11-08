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
    O: '守誓之盾', S: '断裂佩剑', X: '八个人的行李', K: '塔心石', '?': '路遇', Q: '层阶之钥',
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
    C: { name: '骷髅兵', emoji: '💀', hp: 110, atk: 37, def: 6, gold: 8, exp: 6, kind: '亡' },
    D: { name: '僵尸', emoji: '🧟', hp: 148, atk: 47, def: 9, gold: 12, exp: 10, kind: '亡' },
    E: { name: '石像鬼', emoji: '🗿', hp: 210, atk: 60, def: 15, gold: 20, exp: 16, kind: '构' },
    W: { name: '怨灵', emoji: '👻', hp: 126, atk: 57, def: 6, gold: 16, exp: 16, kind: '亡' },
    F: { name: '狼人', emoji: '🐺', hp: 265, atk: 71, def: 19, gold: 30, exp: 24, kind: '兽' },
    H: { name: '骷髅队长', emoji: '🪖', hp: 340, atk: 77, def: 25, gold: 40, exp: 30, kind: '亡' },
    V: { name: '吸血鬼', emoji: '🧛', hp: 360, atk: 77, def: 21, gold: 45, exp: 34, kind: '亡' },
    Z: { name: '魔王', emoji: '🐉', hp: 480, atk: 99, def: 22, gold: 0, exp: 0, boss: true, kind: '锁' },
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
    K: { name: '塔心石', emoji: '💗', type: 'heart' },
    Q: { name: '层阶之钥', emoji: '🗝️', type: 'relic', relic: 'gate', story: 'gateLore' },
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
    heart: { name: '塔心石', emoji: '💗', short: '心', desc: '生命上限 +300（带走时结算）' },
    gate: { name: '层阶之钥', emoji: '🗝️', short: '钥', desc: '点遗物栏的它，就能跳到走过的楼层' },
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
        '#...?#..G.#',
        '#..###....#',
        '#.@...B...#',
        '#..###....#',
        '#Q...#..p.#',
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
        '#u..?....$#',
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
        '#....k..?y#',
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
        '#.W..?..k.#',
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
        '#.k..s.?d.#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '塔顶王座',
      tip: '塔顶没有想象中的黑暗。王座空着，烛台灭着；有人替你把路让开了。',
      hiddenGate: true,
      map: [
        '###########',
        '#....T....#',
        '#.........#',
        '#.........#',
        '#####Z#####',
        '#.........#',
        '#.........#',
        '#.........#',
        '#.P..?..$.#',
        '#....n....#',
        '###########',
      ],
    },
    {
      // 隐藏层：塔规达成 5 条以上、击败魔王后，王座后露出一段窄梯
      name: '锁芯',
      tip: '王座后面是一段窄梯。塔把最要紧的东西，放在最高的地方。',
      map: [
        '###########',
        '#....#....#',
        '#.H..#..V.#',
        '#....#....#',
        '#.##...##.#',
        '#....K....#',
        '#.##...##.#',
        '#....#....#',
        '#.m.?#..F.#',
        '#....n....#',
        '###########',
      ],
    },
  ];

  // 每层的「规矩」：离开该层时结算，达成 +1，结算加分（不影响战斗数值）
  const floorGoals = [
    { type: 'killsMax', v: 1, text: '只打挡路的那一只（击杀 ≤ 1）' },
    { type: 'openDoor', text: '用黄钥匙打开内室' },
    { type: 'noShop', text: '不在秤那里花一枚金币' },
    { type: 'killKind', v: 'E', text: '打倒密道的石像鬼' },
    { type: 'clear', text: '把狼厅的怪清空' },
    { type: 'hpAbove', v: 0.5, text: '半血以上打赢魔王' },
  ];

  // 开局三誓：给整局换一套规则，不同誓约的结算分倍率不同（难的那条分更高）
  const vows = {
    none: {
      name: '不立誓', emoji: '○', tag: '如常',
      desc: '什么都不改。第一次爬塔就选它。', mul: 1,
    },
    mercy: {
      name: '慈悲之誓', emoji: '🕊️', tag: '手软',
      desc: '攻击 −3；每上一层回复 12% 生命', mul: 0.94,
    },
    greed: {
      name: '贪婪之誓', emoji: '🪙', tag: '贪财',
      desc: '击杀金币 +70%；秤的价目 +30%', mul: 1.1,
    },
    guard: {
      name: '铁壁之誓', emoji: '🛡️', tag: '死守',
      desc: '不能格挡；每场战斗承伤 −18%', mul: 1.02,
    },
    // 以下两条要用余烬解锁（塔的记忆）
    ascetic: {
      name: '苦行之誓', emoji: '🪵', tag: '苦行',
      desc: '不能格挡；每上一层回复 10% 生命', mul: 1.05, ember: 60,
    },
    nameless: {
      name: '无名之誓', emoji: '🕳️', tag: '无名',
      desc: '不能格挡、物价 +40%；每上一层回复 10% 生命', mul: 1.2, ember: 120,
    },
  };

  // 路遇：每局从池子里随机抽，踩到 '?' 才出现——这是「每局不一样」的主要来源
  const events = [
    {
      id: 'smith', tier: 'a', name: '流浪铁匠', emoji: '🔨',
      text: '铁匠把锤子架在石头上：「磨刃伤身。」他说完就不再开口。',
      options: [
        { label: '磨刃', tip: '攻击 +2，生命上限 −120', effect: { atk: 2, maxHp: -120 }, msg: '刃口亮了一线。你的手腕到现在还在抖。' },
        { label: '把旧铁卖他', tip: '金币 +120', effect: { gold: 120 }, msg: '他把你的旧铁收进袋里，没还价。' },
      ],
    },
    {
      id: 'drunk', tier: 'a', name: '醉汉', emoji: '🍺',
      text: '墙根坐着一个醉汉，酒壶递到你面前。',
      options: [
        { label: '喝一口', tip: '回复 18% 生命，防御 −1', effect: { healPct: 0.18, def: -1 }, msg: '烧得喉咙发疼，力气却回来一点。' },
        { label: '给他一枚金币', tip: '金币 −1，随他哼的歌回 8% 生命', effect: { gold: -1, healPct: 0.08 }, msg: '他哼了半支曲子。你居然听懂了。' },
        { label: '走开', tip: '什么也不发生', effect: {}, msg: '你绕过他，他没抬头。' },
      ],
    },
    {
      id: 'shrine', tier: 'a', name: '旧神龛', emoji: '🕯️',
      text: '神龛早就不亮了，供台上还摆着没烂完的蜜饯。',
      options: [
        { label: '把蜜饯吃了', tip: '生命上限 +160', effect: { maxHp: 160 }, msg: '甜得发苦，你却吃完了。' },
        { label: '连供盘一起拿走', tip: '金币 +90，防御 −1', effect: { gold: 90, def: -1 }, msg: '你没敢回头。' },
      ],
    },
    {
      id: 'veteran', tier: 'a', name: '独臂老兵', emoji: '🪖',
      text: '老兵靠在楼梯口。他只剩一条手臂，却还在磨盾。',
      options: [
        { label: '跟他学举盾', tip: '防御 +2，攻击 −1', effect: { def: 2, atk: -1 }, msg: '他没说名字，只教了你姿势。' },
        { label: '听他说完', tip: '回复 10% 生命', effect: { healPct: 0.1 }, msg: '你听了很久。他说的其实是另一座塔。' },
      ],
    },
    {
      id: 'herbalist', tier: 'a', name: '卖药的', emoji: '🌿',
      text: '她摊开一包草：「能救命的，也能卖钱的。」',
      options: [
        { label: '当场喝掉', tip: '回复 30% 生命', effect: { healPct: 0.3 }, msg: '苦得能看见星星。' },
        { label: '买一把红钥匙', tip: '金币 −130，红钥匙 +1', effect: { gold: -130, keys: { r: 1 } }, msg: '她把钥匙系在布条上递给你。' },
      ],
    },
    {
      id: 'carve', tier: 'a', name: '墙上的名字', emoji: '✍️',
      text: '这面墙上刻满了名字。最后一个刻到一半就停了。',
      options: [
        { label: '刻上自己的', tip: '结算 +180 分', effect: { score: 180 }, msg: '刻痕很浅，像怕被人看见。' },
        { label: '摸一摸就上楼', tip: '回复 8% 生命', effect: { healPct: 0.08 }, msg: '石头上还是温的。' },
      ],
    },
    // ---- 深层（第 4 层起）才有的事件：更狠，多是"换"而不是"给" ----
    {
      id: 'broker', tier: 'b', name: '赌命的商人', emoji: '🎩',
      text: '他掀开大衣，里面挂满别人的东西：「挑一件。价钱我们慢慢谈。」',
      options: [
        { label: '用一只手换', tip: '攻击 +3，防御 −1', effect: { atk: 3, def: -1 }, msg: '他把你的护腕收进内袋。' },
        { label: '花钱买平安', tip: '金币 −300，防御 +2', effect: { gold: -300, def: 2 }, msg: '他数钱的样子很认真。' },
        { label: '不换', tip: '什么也不发生', effect: {}, msg: '他耸耸肩，衣襟合上了。' },
      ],
    },
    {
      id: 'bridge', tier: 'b', name: '断桥', emoji: '🌉',
      text: '石桥断了一半，对面就是下一层。栏杆上还留着别人的手印。',
      options: [
        { label: '硬跳过去', tip: '生命 −10%，结算 +180 分', effect: { hpPct: -0.1, score: 180 }, msg: '你落地时膝盖一软，但过去了。' },
        { label: '绕远路', tip: '黄钥匙 −2', effect: { gold: 0, keys: { y: -2 } }, msg: '你绕了很远，鞋底磨薄了一层。' },
      ],
    },
    {
      id: 'prisoner', tier: 'b', name: '锁着的囚徒', emoji: '⛓️',
      text: '栅栏后面有人。他不喊救命，只是看着你腰上的钥匙。',
      options: [
        { label: '放他出来', tip: '黄钥匙 +2', effect: { keys: { y: 2 } }, msg: '他没道谢，把两把钥匙塞进你手里就走了。' },
        { label: '拿走他的东西', tip: '金币 +260，防御 −2', effect: { gold: 260, def: -2 }, msg: '他一直到你走远都没有出声。' },
      ],
    },
    {
      id: 'mirror', tier: 'b', name: '镜中的自己', emoji: '🪞',
      text: '镜子里的你比你先一步抬手。它看起来比你更熟悉这座塔。',
      options: [
        { label: '伸手碰它', tip: '攻击 +1、防御 +1，生命上限 −150', effect: { atk: 1, def: 1, maxHp: -150 }, msg: '镜子碎了。碎的那一半，比你轻。' },
        { label: '绕开', tip: '回复 8% 生命', effect: { healPct: 0.08 }, msg: '你从镜框边上挤过去。' },
      ],
    },
    {
      id: 'watch', tier: 'b', name: '守夜人', emoji: '🕯️',
      text: '他坐在台阶上守着一盏灯：「替我看一会儿。就一会儿。」',
      options: [
        { label: '替他守夜', tip: '回复 35% 生命', effect: { healPct: 0.35 }, msg: '你坐了很久。灯没灭，你也没睡。' },
        { label: '摇头上楼', tip: '生命 −60，结算 +150 分', effect: { hp: -60, score: 150 }, msg: '走出十几步，你听见灯灭了。' },
      ],
    },
    {
      id: 'crack', tier: 'b', name: '塔基的裂缝', emoji: '🕳️',
      text: '砖缝下面有东西在反光。伸手进去，能摸到不止一件。',
      options: [
        { label: '伸手进去', tip: '金币 +320，生命 −12%', effect: { gold: 320, hpPct: -0.12 }, msg: '你摸到一枚戒指，也摸到了别的东西。' },
        { label: '记下位置就走', tip: '结算 +150 分', effect: { score: 150 }, msg: '你在墙上刻了个记号。' },
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

  return { LEGEND, PALETTE, kindColor, monsters, items, relics, altarPool, levelExp, floors, floorGoals, vows, events, shop };
})();
