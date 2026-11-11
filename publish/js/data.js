// TowerMates · 魔塔 —— 游戏数据（v0.4）
// 所有数值都在这里改，改完刷新页面生效。
// 地图 11x11，图例见下方 LEGEND。剧情文本在 story.js，立绘在 portraits.js。

window.GAME_DATA = (function () {
  const LEGEND = {
    '#': '墙', '.': '地面', '@': '起点',
    u: '上楼', n: '下楼',
    y: '黄门', r: '红门',
    p: '红药水', P: '蓝药水', s: '铁剑', d: '铁盾', m: '力量宝石',
    a: '精钢剑', b: '秘银甲', c: '魂晶', h: '圣水',
    k: '黄钥匙', L: '红钥匙', $: '金币', M: '商人', T: '公主', J: '工匠手记',
    O: '守誓之盾', S: '断裂佩剑', X: '八个人的行李', K: '塔心石', '?': '路遇', Q: '层阶之钥', j: '半部盾谱',
    '!': '塔的碑文',
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
    // ---- 锁梁（第 7 层起）：被名字遗弃的东西 ----
    I: { name: '锈犬', emoji: '🐕', hp: 360, atk: 92, def: 24, gold: 50, exp: 55, kind: '兽' },
    R: { name: '提灯僧', emoji: '🏮', hp: 480, atk: 100, def: 30, gold: 58, exp: 65, kind: '亡' },
    1: { name: '空甲', emoji: '🛡️', hp: 560, atk: 96, def: 34, gold: 62, exp: 72, kind: '构' },
    2: { name: '锁虫', emoji: '🪱', hp: 420, atk: 102, def: 26, gold: 55, exp: 60, kind: '异' },
    3: { name: '无面者', emoji: '👤', hp: 520, atk: 106, def: 32, gold: 66, exp: 70, kind: '魂' },
    4: { name: '灰烬祭司', emoji: '🧙', hp: 640, atk: 106, def: 36, gold: 72, exp: 80, kind: '亡' },
    5: { name: '锈王', emoji: '👑', hp: 760, atk: 126, def: 42, gold: 90, exp: 95, kind: '兽' },
    6: { name: '守名人', emoji: '🗿', hp: 820, atk: 132, def: 44, gold: 96, exp: 105, kind: '构' },
    // ---- 章节 Boss：每位守一道锁，也守着上楼的唯一一条路 ----
    N: {
      name: '砚', emoji: '📖', hp: 300, atk: 42, def: 16, gold: 200, exp: 90, boss: true, kind: '锁',
      title: '第二位工匠 · 名册之锁', story: 'bossYan', after: 'afterYan', chapter: 1,
      defeat: '名册合上了。纸页自己翻到最后一页，又慢慢停住。',
      phases: [
        { at: 0.66, n: 2, title: '第二页 · 名字', text: '砚：这一页写的是你。别急着看结尾。' },
        { at: 0.33, n: 3, title: '第三页 · 空行', text: '砚：空着的那一行，本来该是我。' },
      ],
      // 每局从两个池各抽一段：同一局固定，换一局台词组合不同
      phasePool: {
        p2: [
          { at: 0.66, n: 2, title: '第二页 · 名字', text: '砚：这一页写的是你。别急着看结尾。' },
          { at: 0.66, n: 2, title: '第二页 · 墨', text: '砚：墨还没干。你来得比账期早了三天。' },
        ],
        p3: [
          { at: 0.33, n: 3, title: '第三页 · 空行', text: '砚：空着的那一行，本来该是我。' },
          { at: 0.33, n: 3, title: '第三页 · 划掉', text: '砚：划掉一个名字，塔就会再索一条命。' },
        ],
      },
    },
    Z: {
      name: '魔王', emoji: '🐉', hp: 480, atk: 99, def: 22, gold: 300, exp: 180, boss: true, kind: '锁',
      title: '第一位工匠 · 炉心之锁', story: 'bossJu', after: 'afterJu', chapter: 2,
      defeat: '魔王散成六盏灯，一层一层落了下去。',
      phases: [
        { at: 0.66, n: 2, title: '第二道锁 · 裂', text: '魔王：别把我想成一道门。门后面还有东西。' },
        { at: 0.33, n: 3, title: '第三道锁 · 塔心', text: '魔王：再近一点，你就看得见她的名字了。' },
      ],
      phasePool: {
        p2: [
          { at: 0.66, n: 2, title: '第二道锁 · 裂', text: '魔王：别把我想成一道门。门后面还有东西。' },
          { at: 0.66, n: 2, title: '第二道锁 · 锈', text: '魔王：锈是从名字开始的。先是笔迹，然后是人。' },
        ],
        p3: [
          { at: 0.33, n: 3, title: '第三道锁 · 塔心', text: '魔王：再近一点，你就看得见她的名字了。' },
          { at: 0.33, n: 3, title: '第三道锁 · 放手', text: '魔王：别替我难过。我只是先一步被用完了。' },
        ],
      },
    },
    Y: {
      name: '铎', emoji: '🔔', hp: 780, atk: 120, def: 40, gold: 420, exp: 200, boss: true, kind: '锁',
      title: '第五位工匠 · 时辰之锁', story: 'bossDuo', after: 'afterDuo', chapter: 3,
      defeat: '钟声停了。整座塔安静得能听见灰尘落下。',
      phases: [
        { at: 0.66, n: 2, title: '第二声 · 钟', text: '铎：钟响第二声，镇上就该点灯了。' },
        { at: 0.33, n: 3, title: '第三声 · 停', text: '铎：你听——停了。八十年第一次停。' },
      ],
      phasePool: {
        p2: [
          { at: 0.66, n: 2, title: '第二声 · 钟', text: '铎：钟响第二声，镇上就该点灯了。' },
          { at: 0.66, n: 2, title: '第二声 · 数', text: '铎：我数过。每一次，都比上一次短一点。' },
        ],
        p3: [
          { at: 0.33, n: 3, title: '第三声 · 停', text: '铎：你听——停了。八十年第一次停。' },
          { at: 0.33, n: 3, title: '第三声 · 债', text: '铎：钟可以停。欠下的那些年，不会自己回来。' },
        ],
      },
    },
    U: {
      name: '衡', emoji: '🪶', hp: 1400, atk: 158, def: 52, gold: 600, exp: 260, boss: true, kind: '锁',
      title: '第六位工匠 · 无名之锁', story: 'bossHeng', after: 'afterHeng', chapter: 4, finalBoss: true,
      defeat: '刻刀落在桌上。刀刃还是朝着门。',
      phases: [
        { at: 0.66, n: 2, title: '第二刀 · 深', text: '衡：刻深一点。八十年就磨平了。' },
        { at: 0.33, n: 3, title: '第三刀 · 名', text: '衡：最后一行，你打算写谁？' },
      ],
      phasePool: {
        p2: [
          { at: 0.66, n: 2, title: '第二刀 · 深', text: '衡：刻深一点。八十年就磨平了。' },
          { at: 0.66, n: 2, title: '第二刀 · 空', text: '衡：那一笔停了八十年。我每天替它擦一次灰。' },
        ],
        p3: [
          { at: 0.33, n: 3, title: '第三刀 · 名', text: '衡：最后一行，你打算写谁？' },
          { at: 0.33, n: 3, title: '第三刀 · 交', text: '衡：刀快，石头软。难的从来不是刻，是选。' },
        ],
      },
    },
    G: { name: '烛', emoji: '🕯️', hp: 50, atk: 0, def: 5, gold: 0, exp: 0, ghost: true, kind: '魂' },
  };

  const items = {
    p: { name: '红药水', emoji: '🧪', type: 'hp', value: 160 },
    P: { name: '蓝药水', emoji: '💧', type: 'hp', value: 420 },
    h: { name: '圣水', emoji: '🍶', type: 'hp', value: 900 },
    s: { name: '铁剑', emoji: '🗡️', type: 'atk', value: 2 },
    d: { name: '铁盾', emoji: '🛡️', type: 'def', value: 2 },
    a: { name: '精钢剑', emoji: '⚔️', type: 'atk', value: 4 },
    b: { name: '秘银甲', emoji: '🛡️', type: 'def', value: 4 },
    m: { name: '力量宝石', emoji: '💎', type: 'both', value: 2 },
    c: { name: '魂晶', emoji: '💠', type: 'both', value: 3 },
    k: { name: '黄钥匙', emoji: '🔑', type: 'key', key: 'y' },
    L: { name: '红钥匙', emoji: '🗝️', type: 'key', key: 'r' },
    J: { name: '工匠手记', emoji: '📜', type: 'story', flag: 'journal', story: 'journal' },
    // 遗物：一次性、永久生效，构成每局的取舍
    O: { name: '守誓之盾', emoji: '🛡️', type: 'relic', relic: 'ward' },
    S: { name: '断裂佩剑', emoji: '⚔️', type: 'relic', relic: 'edge', story: 'eighthSword' },
    K: { name: '塔心石', emoji: '💗', type: 'heart' },
    Q: { name: '层阶之钥', emoji: '🗝️', type: 'relic', relic: 'gate', story: 'gateLore' },
    j: { name: '半部盾谱', emoji: '📖', type: 'block' },
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
    gate: { name: '层阶之钥', emoji: '🗝️', short: '钥', desc: '在走过的楼层间跳；头一次还能往前开一层，代价是那层两件最好的东西被封住' },
  };

  // 祭坛的可选池（不含剧情固定的守誓之盾/断刃之锋）
  const altarPool = ['steel', 'thrift', 'vigor', 'scout', 'ember'];

  // ---------- 锁环：章末回响的构筑奖励 ----------
  // 规则：击败章末 Boss 必得一次三选一。
  // 刻意不做「直接 +攻防」：这座塔的余量极小，加战力会打穿曲线；
  // 锁环改的是规则、资源与信息，让每一章的选择拼出不同的构筑。
  const rings = {
    ledger:   { name: '名册之环', emoji: '📖', short: '册', chapter: 1, desc: '每击败 10 只怪额外 +1 余烬' },
    lamp:     { name: '借灯之环', emoji: '🕯️', short: '灯', chapter: 1, desc: '每上一层回复 5% 生命' },
    coin:     { name: '铜币之环', emoji: '🪙', short: '币', chapter: 1, desc: '立刻获得 200 金币' },
    keyring:  { name: '钥匙之环', emoji: '🔑', short: '钥', chapter: 1, desc: '立刻获得 2 黄钥匙、1 红钥匙' },

    parry:    { name: '断刃之环', emoji: '⚔️', short: '刃', chapter: 2, desc: '格挡时承伤 ×0.5（原 ×0.6）' },
    cinder:   { name: '灰烬之环', emoji: '🔥', short: '烬', chapter: 2, desc: '每次击杀回复 1% 生命（至少 3）' },
    thrift2:  { name: '账期之环', emoji: '📒', short: '账', chapter: 2, desc: '商店价格再 −15%' },
    vitality: { name: '灯油之环', emoji: '🏺', short: '油', chapter: 2, desc: '生命上限 +240，并回复 240' },

    bell:     { name: '停钟之环', emoji: '🔔', short: '钟', chapter: 3, desc: 'Boss 战承伤 −8%' },
    stair:    { name: '回廊之环', emoji: '🪜', short: '廊', chapter: 3, desc: '每上一层额外回复 4% 生命' },
    scope:    { name: '明镜之环', emoji: '🔍', short: '镜', chapter: 3, desc: '立刻获得窥探之镜' },
    hour:     { name: '时辰之环', emoji: '⏳', short: '时', chapter: 3, desc: '通关额外 +2 余烬' },

    seventh:  { name: '第七格之环', emoji: '✍️', short: '格', chapter: 4, desc: '名字刻得更深：通关额外 +3 余烬' },
    chisel:   { name: '刻刀之环', emoji: '🪶', short: '刀', chapter: 4, desc: '通关额外 +4 余烬' },
    heart:    { name: '塔心之环', emoji: '💗', short: '心', chapter: 4, desc: '带走塔心石多 +100 上限；放下再多 +3 余烬' },
    oath:     { name: '守誓之环', emoji: '🕊️', short: '誓', chapter: 4, desc: '通关额外 +3 余烬' },

    // ---- 扩容池（P-3）：每章 4→6 枚，每局抽 3，同一条锁配出不同的构筑 ----
    pace:     { name: '更漏之环', emoji: '⏱️', short: '漏', chapter: 1, desc: '通关额外 +2 余烬' },
    ward2:    { name: '旧誓之环', emoji: '💫', short: '誓', chapter: 1, desc: '每场战斗承伤 −6%' },

    ash:      { name: '拾柴之环', emoji: '🪵', short: '柴', chapter: 2, desc: '每击败 10 只怪额外 +1 余烬' },
    scout2:   { name: '窥探之环', emoji: '👁️', short: '窥', chapter: 2, desc: '立刻获得窥探之镜' },

    ledger2:  { name: '墨账之环', emoji: '🖋️', short: '墨', chapter: 3, desc: '每击败 10 只怪额外 +1 余烬' },
    vitality2:{ name: '深井之环', emoji: '🫗', short: '井', chapter: 3, desc: '生命上限 +200，并回复 200' },

    coin2:    { name: '夜市之环', emoji: '🪙', short: '市', chapter: 4, desc: '立刻获得 300 金币' },
    lamp2:    { name: '长明之环', emoji: '🕯️', short: '明', chapter: 4, desc: '每上一层回复 4% 生命' },
  };

  // 每章抽 3 个给玩家选（池 6 个 → 每局的构筑起点不同）
  const ringPools = {
    1: ['ledger', 'lamp', 'coin', 'keyring', 'pace', 'ward2'],
    2: ['parry', 'cinder', 'thrift2', 'vitality', 'ash', 'scout2'],
    3: ['bell', 'stair', 'scope', 'hour', 'ledger2', 'vitality2'],
    4: ['seventh', 'chisel', 'heart', 'oath', 'coin2', 'lamp2'],
  };

  // 升到下一级所需经验（索引 = 当前等级-1）
  // 前 9 级沿用原曲线；锁梁六层把上限抬到 Lv.19，后 10 级每级约 +300 经验。
  const levelExp = [10, 24, 42, 64, 92, 125, 165, 205, 450, 740, 1030, 1320, 1610, 1900, 2190, 2480, 2770, 3060];

  const floors = [
    {
      name: '塔之入口', chapter: 1,
      tip: '塔里的空气不流动。墙上的刻痕很新——有人一直在数着进来的人。',
      map: [
        '###########',
        '#....#....#',
        '#.A..#.k..#',
        '#..!?#..G.#',
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
      name: '回廊', chapter: 1,
      tip: '楼梯被反复修过。蜡油还是温的——像有人提着灯，在你之前先去追过什么人。',
      map: [
        '###########',
        '#u..?..j.$#',
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
      name: '幽暗集市', chapter: 1, boss: 'N',
      tip: '空荡的大厅里只有一副货摊。商人说，他在等「像你一样傻的人」。',
      map: [
        '###########',
        '#u.......$#',
        '#.#######.#',
        '#.#..D..#.#',
        '#.#y......#',
        '#####N#####',
        '#...M.....#',
        '#.p..k..?.#',
        '#.L.D...X$#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '密道', chapter: 2, ambient: 'mist',
      tip: '这一层不在图纸上。造它的人，把答案折进一页纸，压在砖缝里。',
      map: [
        '###########',
        '#n....Q..O#',
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
      name: '狼厅', chapter: 2,
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
      name: '塔顶王座', chapter: 2, boss: 'Z', ambient: 'boss',
      tip: '塔顶没有想象中的黑暗。王座空着，烛台灭着；有人替你把路让开了。',
      map: [
        '###########',
        '#.........#',
        '#.........#',
        '#....u....#',
        '#.........#',
        '#####Z#####',
        '#.........#',
        '#.........#',
        '#.P..?..$.#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '塔脊', chapter: 3, ambient: 'mist',
      tip: '锁梁上的风是横着走的。墙缝里没有灰——这里太久没有人呼吸。',
      map: [
        '###########',
        '#u...#...$#',
        '#.##.#.##.#',
        '#.#..I..#.#',
        '#.#.###.#.#',
        '#...#R#...#',
        '#.###.###.#',
        '#.I.Gp#.k.#',
        '#.R.?.1.#.#',
        '#....n....#',
        '###########',
      ],
    },
    {
      name: '空廊', chapter: 3,
      tip: '一整层都是空房间。塔把你用不着的东西收在这里，包括别人的名字。',
      map: [
        '###########',
        '#u..M...a.#',
        '#.#######.#',
        '#.#..X.4#.#',
        '#.#.###.4.#',
        '#.#.2.#.#.#',
        '#...#.#p.3#',
        '#.###.###.#',
        '#.h..?..k.#',
        '#..3.2.n..#',
        '###########',
      ],
    },
    {
      name: '钟楼', chapter: 3, boss: 'Y', ambient: 'boss',
      tip: '钟挂着，钟舌是断的。可你上楼时，它响了一下。',
      map: [
        '###########',
        '#u..R....$#',
        '#.#######.#',
        '#.#.....#.#',
        '#.#..2....#',
        '#####Y#####',
        '#.........#',
        '#.b..p..h.#',
        '#.I.?.3.k.#',
        '#....3.n..#',
        '###########',
      ],
    },
    {
      name: '名墙', chapter: 4, ambient: 'mist',
      tip: '墙上五道刻完的名字，第六道只刻了一个起笔。旁边那一格还空着，石灰是新的。',
      map: [
        '###########',
        '#u..4....$#',
        '#.#######.#',
        '#.#..5..#.#',
        '#.#.6...#.#',
        '#.#..#..#.#',
        '#.#..#..#.#',
        '#.#..#.4#.#',
        '#.c..P..b.#',
        '#.2.3.n..k#',
        '###########',
      ],
    },
    {
      name: '刻名室', chapter: 4, ambient: 'mist',
      tip: '刻刀摆在桌上，刀刃朝着门。有人刚刚离开，或者一直没走。',
      map: [
        '###########',
        '#u..a...$.#',
        '#.#######.#',
        '#.#..G..5.#',
        '#.#.###.#.#',
        '#.#..4..3.#',
        '#...#.#...#',
        '#6###.###.#',
        '#.h.p?..c.#',
        '#.5.3..n.6#',
        '###########',
      ],
    },
    {
      name: '塔顶·无名', chapter: 4, boss: 'U', hiddenGate: true, ambient: 'boss',
      tip: '塔顶比你想的矮。云在脚下，名字在头顶。',
      map: [
        '###########',
        '#....T....#',
        '#.........#',
        '#....#....#',
        '#.P.....$.#',
        '#####U#####',
        '#.........#',
        '#....5..6.#',
        '#.h..?..c.#',
        '#.6..3.n..#',
        '###########',
      ],
    },
    {
      // 隐藏层：击败衡后，塔顶后露出一段窄梯
      name: '锁芯', chapter: 0, ambient: 'core',
      tip: '塔顶后面是一段窄梯。塔把最要紧的东西，放在最高的地方。',
      map: [
        '###########',
        '#....#....#',
        '#.3..#..4.#',
        '#....#....#',
        '#.##...##.#',
        '#....K....#',
        '#.##...##.#',
        '#....#....#',
        '#.1.?#..2.#',
        '#....n....#',
        '###########',
      ],
    },
  ];

  // 四章结构：每章三层、章末一 Boss；Boss 站在上楼唯一的路上。
  const chapters = [
    {
      id: 1, title: '第一章 · 刻痕', theme: '规矩与计数', from: 1, to: 3, boss: 'N', bossFloor: 3,
      color: '#e8c46a', accent: 'rgba(232,196,106,0.20)',
      blurb: '塔每十年向镇上索一条命。今年它带走了公主——名册上第九道刻痕，是你自己划的。',
    },
    {
      id: 2, title: '第二章 · 明塔', theme: '真相与代价', from: 4, to: 6, boss: 'Z', bossFloor: 6,
      color: '#ff9f6b', accent: 'rgba(255,159,107,0.20)',
      blurb: '六层塔身，六道锁环。你以为走到塔顶就到头了——直到王座后面露出一段向上的窄梯。',
    },
    {
      id: 3, title: '第三章 · 塔脊', theme: '被删掉的六层', from: 7, to: 9, boss: 'Y', bossFloor: 9,
      color: '#9fd8ff', accent: 'rgba(159,216,255,0.20)',
      blurb: '锁梁上的六层不在任何图纸里。钟每十年响一次，塔就向镇上索一个人——那不是村里的规矩，是钟的账期。',
    },
    {
      id: 4, title: '第四章 · 无名', theme: '名字的重量', from: 10, to: 12, boss: 'U', bossFloor: 12,
      color: '#b9a4ff', accent: 'rgba(185,164,255,0.20)',
      blurb: '墙上五道刻完，第六道只刻了一个起笔。刻名的人还在等，有人把那一笔写完。',
    },
  ];

  // 开局六誓：给整局换一套规则。越难走的那条，通关时留下的余烬越多
  // reward = 每局通关「额外」余烬（跨局解锁用，不加战力）；ember = 解锁这条誓约要花的余烬
  // 解锁线按单局实测量级定：常规一局约 18~30 余烬，两条解锁分别约 1~2 局 / 再 2 局，
  // 不再是老分数制时代遗留的 60/120（那条线要 7~20 局，等于把跨局循环掐断）。
  const vows = {
    none: {
      name: '不立誓', emoji: '○', tag: '如常',
      desc: '什么都不改。第一次爬塔就选它。', reward: 0,
    },
    mercy: {
      name: '慈悲之誓', emoji: '🕊️', tag: '手软',
      desc: '攻击 −3；每上一层回复 12% 生命', reward: 3,
    },
    greed: {
      name: '贪婪之誓', emoji: '🪙', tag: '贪财',
      desc: '击杀金币 +70%；秤的价目 +30%', reward: 4,
    },
    guard: {
      name: '铁壁之誓', emoji: '🛡️', tag: '死守',
      desc: '不能格挡；每场战斗承伤 −18%', reward: 5,
    },
    // 以下两条要用余烬解锁（塔的记忆）
    ascetic: {
      name: '苦行之誓', emoji: '🪵', tag: '苦行',
      desc: '不能格挡；每上一层回复 10% 生命', reward: 8, ember: 24,
    },
    nameless: {
      name: '无名之誓', emoji: '🕳️', tag: '无名',
      desc: '不能格挡、物价 +40%；每上一层回复 10% 生命', reward: 14, ember: 48,
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
      id: 'shrine', tier: 'a', name: '旧供桌', emoji: '🕯️',
      text: '供桌上的烛早就不点了，台上还摆着没烂完的干果。',
      options: [
        { label: '把干果吃了', tip: '生命上限 +160', effect: { maxHp: 160 }, msg: '甜得发苦，你却吃完了。' },
        { label: '连供盘一起拿走', tip: '金币 +90，防御 −1', effect: { gold: 90, def: -1 }, msg: '你没敢回头。' },
      ],
    },
    {
      id: 'veteran', tier: 'a', name: '独臂老兵', emoji: '🪖',
      text: '老兵靠在楼梯口。他只剩一条手臂，却还在磨盾。',
      options: [
        { label: '跟他学举盾', tip: '防御 +2，攻击 −1', effect: { def: 2, atk: -1 }, msg: '他没说名字，只教了你姿势。' },
        { label: '讨教格挡', tip: '学会格挡（战斗中点盾，承伤 −40%）；若已会，防御 +1', effect: { block: true, def: 1 }, msg: '「盾不是拿来硬扛的。」他抬了一下手臂——你学会了**格挡**。' },
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
        { label: '刻上自己的', tip: '通关余烬 +2', effect: { ember: 2 }, msg: '刻痕很浅，像怕被人看见。' },
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
        { label: '硬跳过去', tip: '生命 −10%，通关余烬 +2', effect: { hpPct: -0.1, ember: 2 }, msg: '你落地时膝盖一软，但过去了。' },
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
        { label: '摇头上楼', tip: '生命 −60，通关余烬 +2', effect: { hp: -60, ember: 2 }, msg: '走出十几步，你听见灯灭了。' },
      ],
    },
    {
      id: 'crack', tier: 'b', name: '塔基的裂缝', emoji: '🕳️',
      text: '砖缝下面有东西在反光。伸手进去，能摸到不止一件。',
      options: [
        { label: '伸手进去', tip: '金币 +320，生命 −12%', effect: { gold: 320, hpPct: -0.12 }, msg: '你摸到一枚戒指，也摸到了别的东西。' },
        { label: '记下位置就走', tip: '通关余烬 +2', effect: { ember: 2 }, msg: '你在墙上刻了个记号。' },
      ],
    },
    // ---- 锁梁（第 7 层起）才有的事件：这里的东西都跟「名字」和「时间」有关 ----
    {
      id: 'bell', tier: 'c', name: '断钟', emoji: '🔔',
      text: '钟舌掉在你脚边，断口是新的。钟还挂着，像一个张着嘴的人。',
      options: [
        { label: '敲一下', tip: '生命 −8%，通关余烬 +3', effect: { hpPct: -0.08, ember: 3 }, msg: '钟声没有传出去。它在你胸腔里响。' },
        { label: '把钟舌带走', tip: '金币 +280，防御 −2', effect: { gold: 280, def: -2 }, msg: '铜很沉。你走了两步，听见钟自己响了一下。' },
      ],
    },
    {
      id: 'names', tier: 'c', name: '第七个名字', emoji: '✍️',
      text: '墙上空着一格，石灰还是新的。旁边放着半截粉笔。',
      options: [
        { label: '刻一个假名', tip: '防御 +2，生命上限 −120', effect: { def: 2, maxHp: -120 }, msg: '你刻了一个谁也不是的名字。墙没有反应。' },
        { label: '什么也不刻', tip: '回复 12% 生命', effect: { healPct: 0.12 }, msg: '你把粉笔放回原处，指尖白了一层。' },
      ],
    },
    {
      id: 'debt', tier: 'c', name: '秤的欠条', emoji: '📜',
      text: '一张欠条压在砖下，落款是「岚」。金额那一栏空着，像故意留给后来的人。',
      options: [
        { label: '替他还上', tip: '金币 −400，攻击 +3', effect: { gold: -400, atk: 3 }, msg: '你把金币压在欠条上。风把它们一起吹走了。' },
        { label: '把欠条烧掉', tip: '通关余烬 +3', effect: { ember: 3 }, msg: '纸烧得很快。你听见楼上有人叹了口气。' },
      ],
    },
    {
      id: 'lantern', tier: 'c', name: '提灯僧的灯', emoji: '🏮',
      text: '提灯僧坐在台阶上，灯里的火比他人还高。他把灯递过来，没说话。',
      options: [
        { label: '接过来', tip: '生命上限 +200，生命 −10%', effect: { maxHp: 200, hpPct: -0.1 }, msg: '灯很烫。你的影子在墙上多留了一会儿。' },
        { label: '替他吹灭', tip: '回复 40% 生命', effect: { healPct: 0.4 }, msg: '灯灭的一瞬，他的肩膀塌了下去，像终于睡着了。' },
      ],
    },
    {
      id: 'chisel', tier: 'c', name: '桌上的刻刀', emoji: '🪶',
      text: '刻刀摆在桌上，刀刃朝着门。刀柄上缠着六圈旧布，每一圈都写着一个名字。',
      options: [
        { label: '拿起来', tip: '攻击 +4，防御 −2', effect: { atk: 4, def: -2 }, msg: '刀比看上去重。你握住它时，六圈布同时松了一点。' },
        { label: '放回原处', tip: '通关余烬 +3', effect: { ember: 3 }, msg: '你把刀摆正，刀刃仍然朝着门。' },
      ],
    },
    {
      id: 'ledger2', tier: 'c', name: '名册的残页', emoji: '📄',
      text: '一页名册卡在锁梁的砖缝里，纸很白。上面列着九个名字，最后一个被墨涂掉了。',
      options: [
        { label: '读出声', tip: '通关余烬 +4，生命 −60', effect: { ember: 4, hp: -60 }, msg: '读到第八个，风停了一拍。第九个你没敢念。' },
        { label: '把残页叠好收起', tip: '金币 +300', effect: { gold: 300 }, msg: '纸很轻，比三百枚金币还轻。' },
      ],
    },
    {
      id: 'clockwork', tier: 'c', name: '钟的心脏', emoji: '⚙️',
      text: '一整箱齿轮堆在墙角，每只都停在同一格。箱子上写着：余弦十年，勿动。',
      options: [
        { label: '拨快一格', tip: '攻击 +2，防御 +2，生命 −10%', effect: { atk: 2, def: 2, hpPct: -0.1 }, msg: '齿轮咬合的声音从脚底传上来。塔比刚才年轻了一点。' },
        { label: '依着字条放下', tip: '回复 25% 生命', effect: { healPct: 0.25 }, msg: '你松开手。箱盖合上时，有一只齿轮自己转了半圈。' },
      ],
    },
    {
      id: 'mirror2', tier: 'c', name: '第六面镜子', emoji: '🪞',
      text: '六面镜子靠墙立着，前五面都蒙着布。第六面干净得能照出你身后的楼梯。',
      options: [
        { label: '掀开第一面', tip: '攻击 +3，生命上限 −180', effect: { atk: 3, maxHp: -180 }, msg: '镜子里的你不肯跟你一起抬手。你们对视了一会儿。' },
        { label: '把布重新盖好', tip: '防御 +3', effect: { def: 3 }, msg: '布落下的声音很轻。玻璃后面有人松了口气。' },
      ],
    },
  ];

  const shop = [
    { id: 'key', name: '黄钥匙', emoji: '🔑', price: 20, key: 'y' },
    { id: 'rkey', name: '红钥匙', emoji: '🗝️', price: 45, key: 'r' },
    { id: 'potion', name: '红药水', emoji: '🧪', price: 30, hp: 160 },
    { id: 'atk', name: '力量训练', emoji: '⚔️', price: 60, atk: 2 },
    { id: 'def', name: '护甲强化', emoji: '🛡️', price: 60, def: 2 },
    { id: 'blockbook', name: '半部盾谱', emoji: '📖', price: 150, block: true, once: true },
    { id: 'ember', name: '余烬灯芯', emoji: '🔥', price: 120, relic: 'ember', once: true },
    { id: 'codex', name: '窥探之镜', emoji: '🔮', price: 100, codex: true, once: true },
  ];

  return { LEGEND, PALETTE, kindColor, monsters, items, relics, altarPool, rings, ringPools, levelExp, floors, chapters, vows, events, shop };
})();
