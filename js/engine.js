// TowerMates · 魔塔 —— 核心逻辑（不依赖 DOM，可在 Node 里跑平衡性模拟）
// v0.4：遗物 / 动态价格 / 本层快照 / 存档节流 / 剧情道具通用化
(function () {
  const D = window.GAME_DATA;
  const SAVE_KEY = 'towermates_save_v3';
  const LEGACY_KEY = 'towermates_save_v2';
  const SIZE = 11;

  let s = null;
  let hooks = {};
  let saveTimer = null;

  // ---------- 同一浏览器开两页：谁在写这一档 ----------
  // 2026-11-15 实测（tools/tab-check.html）：两页各自把整份状态揣在内存里、各自每 350ms 自动存档，
  // 于是「谁后写谁说话」——A 页停在半小时前，B 页在另一页玩到第 5 层，A 走一步就把 B 的半小时
  // 静默抹掉，两边都没有一句提示（连漏斗里都查不出）。存档里记一个写者页 id（s.w），
  // 只有自己还是写者时才允许落盘；被别人顶掉就停写 + 交给 UI 说清（引擎不依赖 DOM）。
  const TAB_ID = 't' + Math.random().toString(36).slice(2, 8);
  const tabId = () => TAB_ID;
  let saveConflict = false;   // 本页是否已被别的页面顶掉（停写中）
  let conflictCb = null;      // main 注册：负责弹面板 / 记漏斗
  let forceNextWrite = false; // 「开局 / 继续 / 夺回」是玩家的明确选择，那一次写必须放行
  let foreignSaveAt = 0;      // 最近一次「收到另一页写档」的时刻（storage 事件）
  let foreignSaveWriter = '';

  function setHooks(h) { hooks = h || {}; }
  function emit(type, payload) { if (hooks.onEvent) hooks.onEvent(type, payload); }

  const floorMaps = () => D.floors.map((f) => f.map.map((row) => row.split('')));

  // ---------- 开局微变（P-A / 打 S-D1「前 3 层每局逐格相同」）----------
  // 只挪「散落的拾取物」（红药水 / 金币），地图骨架、怪物、门、商店、祭坛、楼梯、总道具量全部不动：
  // 改的是「先走哪边、先捡什么」，第二局开局不再是逐格照抄已知解，且不碰任何数值。
  // 种子 0 = 保持原版布局（需要可复现读数的工具场景用它要回原图）。
  const FREE_PICKUPS = ['p', '$'];
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 「今日一塔」要的是「同一天谁抽到的东西一样」，所以这类抽取必须能按种子复现；
  // 普通局没有 rngSeed，原样走 Math.random（行为一字不改）。
  // 计数 rngN 跟着存档走：中途刷新/续玩，后续抽取仍接在同一条序列上，不会整段重摇。
  function nextRand() {
    if (!s || !s.flags || typeof s.flags.rngSeed !== 'number') return Math.random();
    s.flags.rngN = (s.flags.rngN || 0) + 1;
    const r = mulberry32((s.flags.rngSeed ^ Math.imul(s.flags.rngN, 0x9E3779B1)) | 0);
    return r();
  }

  function shufflePickups(map, seed) {
    if (!seed || !map) return false;
    // 有起点的那层（第 1 层）起点周围 3×3 保持原样：开局 60 秒的教学节奏（教练卡→首战）不跟着变。
    // 第 2–3 层没有 '@'，把排除中心放到图外，等于不排除——否则左上角会被白白扣掉 9 格候选。
    let sx = -9, sy = -9;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (map[y][x] === '@') { sx = x; sy = y; }
    const cells = [];
    for (let y = 1; y < SIZE - 1; y++) {
      for (let x = 1; x < SIZE - 1; x++) {
        if (map[y][x] !== '.') continue;
        if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
        cells.push([x, y]);
      }
    }
    const from = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (FREE_PICKUPS.indexOf(map[y][x]) >= 0) from.push({ x: x, y: y, ch: map[y][x] });
      }
    }
    if (!from.length || from.length > cells.length) return false;
    const rnd = mulberry32(seed);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    }
    // 先清空原位再摆：两件物件不会落到同一格（候选位已洗牌，逐个取头部）
    from.forEach((o) => { map[o.y][o.x] = '.'; });
    from.forEach((o, i) => { map[cells[i][1]][cells[i][0]] = o.ch; });
    return true;
  }
  // 旧名保留：工具/单测里还叫它 shuffleFloor1
  function shuffleFloor1(map, seed) { return shufflePickups(map, seed); }

  // 第 2–3 层：各派生一颗子种子，三层布局互不牵连（又不是同一个洗牌结果）
  const SUBSEED_F2 = 0x5BF03635, SUBSEED_F3 = 0x1B56C4E9;
  function subSeed(base, x) { const v = (base ^ x) | 0; return v === 0 ? 1 : v; }

  function newGame(vow, opts) {
    const v = D.vows[vow] ? vow : 'none';
    const mapSeed = opts && typeof opts.seed === 'number' ? opts.seed : (Math.random() * 1e9) | 0;
    // 今日一塔：带着日期键进来，本局的地图换位 / 路遇 / 锁环与祭坛候选 / Boss 台词全部按同一颗种子复现
    const daily = opts && typeof opts.daily === 'string' && opts.daily ? opts.daily : null;
    // 2026-11-28 多塔：新局从第一座齿塔（锈塔）开始，属性取该塔的起始值。
    // 主塔的 12 层索引没有动，齿塔接在末尾（13–21），所以这里只是把起点从 0 换成 13。
    // opts.tower：工具/单测可以直接从主塔开局（默认仍是玩家路径：第一座齿塔）。
    // opts.carry：玩家从「打过的小塔」直接开局时，把它前面的塔视为已拔齿——齿印一并带上。
    //   这样从灰塔开局是 16/14/1350（14/12/1200 + 锈印），和文档里的成长曲线同一条线；
    //   工具不传 carry，从主塔开局仍是 10/10/1000 的裸基线（单测与 sim --main 要的是原始数值）。
    const first = (opts && opts.tower && D.towers.find((t) => t.id === opts.tower)) || D.towers[0];
    const pre = (opts && opts.carry)
      ? D.towers.slice(0, Math.max(0, D.towers.indexOf(first)))
      : [];
    s = {
      floor: first.floors[0], x: 1, y: 1,
      hp: first.start.hp, maxHp: first.start.maxHp, atk: first.start.atk, def: first.start.def,
      gold: 0, exp: 0, level: 1,
      keys: { y: 1, r: 0 },
      maps: floorMaps(),
      over: false, won: false, ending: null,
      flags: {
        vow: v, rings: [], phaseSeed: daily ? mapSeed : (Math.random() * 1e9) | 0,
        hasBlock: false, mapSeed: mapSeed,
        rngSeed: daily ? mapSeed : null, rngN: daily ? 0 : null,
        daily: daily,
        // 塔群进度：当前塔 / 已通关的齿塔 / 已带走的齿印
        tower: first.id,
        towersCleared: first.main ? ['rust', 'ash', 'bell'] : pre.map((t) => t.id),
        marks: pre.map((t) => t.mark.id),
      },
      ver: 5,
      steps: 0,
      startedAt: Date.now(),
      activeMs: 0,
      snap: null,
      floorEnter: null,
      w: TAB_ID,        // 这一档由本页写（另一页拿到它会停写并提示）
      savedAt: 0,
    };
    // 开新局是玩家的明确选择：这一页从此拥有这一档，哪怕另一页刚写过（那次写会把它顶掉）
    saveConflict = false;
    forceNextWrite = true;
    // 主塔前 3 层「先走哪边、先捡什么」每局都不同（今日一塔=同一天同一座塔）：
    // 第 1 层用主种子（工具场景传 seed 0 即原版布局），第 2/3 层各派生一颗子种子。
    // 齿塔不洗牌：三座小塔是教学，每局同一张图才教得会。
    shufflePickups(s.maps[0], mapSeed);
    shufflePickups(s.maps[1], subSeed(mapSeed, SUBSEED_F2));
    shufflePickups(s.maps[2], subSeed(mapSeed, SUBSEED_F3));
    const map = s.maps[s.floor];
    const entryCh = first.main ? '@' : 'n';
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === entryCh) { s.x = x; s.y = y; map[y][x] = '.'; break outer; }
      }
    }
    save();
    emit('newgame');
    return s;
  }

  // ---------- 塔群 ----------
  // 齿塔独立成长：进塔时属性回到该塔的 start，只带走已获得的齿印。
  // 这样新手不会在塔一攒的属性把塔三打穿，也不会因为「换塔」觉得自己忽然变弱——
  // 每座塔的起始值本身在递增，齿印是额外的、明写在结算页上的那一份。
  const towerById = (id) => D.towers.find((t) => t.id === id) || null;
  function markBonus() {
    const ids = (s && s.flags && s.flags.marks) || [];
    let atk = 0, def = 0, maxHp = 0;
    D.towers.forEach((t) => {
      if (t.mark && ids.indexOf(t.mark.id) >= 0) {
        atk += t.mark.atk; def += t.mark.def; maxHp += t.mark.maxHp;
      }
    });
    return { atk, def, maxHp };
  }
  function canEnterTower(id) {
    const t = towerById(id);
    if (!t) return { ok: false, msg: '没有这座塔' };
    const cleared = (s && s.flags && s.flags.towersCleared) || [];
    if (t.main) {
      const need = D.towers.filter((x) => !x.main).map((x) => x.id);
      if (!need.every((x) => cleared.indexOf(x) >= 0)) {
        return { ok: false, msg: '三枚齿还没拔完，主塔的门不认你' };
      }
      return { ok: true };
    }
    const idx = D.towers.indexOf(t);
    if (idx <= 0) return { ok: true };
    const prev = D.towers[idx - 1];
    if (cleared.indexOf(prev.id) >= 0) return { ok: true };
    return { ok: false, msg: `先拔掉「${prev.name}」的那枚齿` };
  }
  function enterTower(id) {
    const r = canEnterTower(id);
    if (!r.ok) return r;
    const t = towerById(id);
    const b = markBonus();
    s.floor = t.floors[0];
    s.hp = s.maxHp = t.start.maxHp + b.maxHp;
    s.atk = t.start.atk + b.atk;
    s.def = t.start.def + b.def;
    s.gold = 0; s.exp = 0; s.level = 1;
    s.keys = { y: t.main ? 1 : 0, r: 0 };
    s.flags.tower = id;
    s.flags.towerMax = s.flags.towerMax || {};
    s.flags.towerMax[id] = t.floors[0];
    s.flags.hasBlock = false;
    s.flags.rings = [];
    // 每座塔自己的一份账：遗物、商店涨价记录、格挡/祭坛/路遇的按层标记都不跨塔。
    // 只清这两类前缀 + 本塔的按层标记，别把成就/塔群进度清掉。
    Object.keys(s.flags).forEach((k) => {
      if (k.indexOf('relic_') === 0 || k.indexOf('buy_') === 0) delete s.flags[k];
    });
    t.floors.forEach((fi) => {
      Object.keys(s.flags).forEach((k) => {
        if (k.endsWith('_f' + fi)) delete s.flags[k];
      });
      s.maps[fi] = D.floors[fi].map.map((row) => row.split(''));
    });
    const entryCh = t.main ? '@' : 'n';
    let found = false;
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        // 入口砖要清掉：人已经站在门厅里了，脚下再留一块 `n` 就等于「退出塔的机关」
        // 就在脚下——走开一格再走回来，整座塔会被当成「你自己走出去的」而重置
        // （与 newGame 那条同一段逻辑，两份实现不许一份清一份不清）。
        if (s.maps[s.floor][y][x] === entryCh) { s.x = x; s.y = y; s.maps[s.floor][y][x] = '.'; found = true; break outer; }
      }
    }
    if (!found) { s.x = 1; s.y = 1; }
    s.over = false; s.won = false; s.ending = null;
    s.snap = null;
    s.floorEnter = null;
    save();
    emit('newgame');
    return { ok: true, tower: t, marks: b };
  }
  // 踩上塔门：记通关、发齿印。重复进已通关的塔不会再发一次。
  function towerClear() {
    const t = s ? D.towerOf(s.floor) : null;
    if (!t || t.main) return null;
    const cleared = s.flags.towersCleared || (s.flags.towersCleared = []);
    const first = cleared.indexOf(t.id) < 0;
    if (first) {
      cleared.push(t.id);
      const marks = s.flags.marks || (s.flags.marks = []);
      if (marks.indexOf(t.mark.id) < 0) marks.push(t.mark.id);
    }
    save();
    return { tower: t, first, mark: t.mark, cleared: cleared.slice() };
  }
  function towerExit() {
    const t = s ? D.towerOf(s.floor) : null;
    if (!t || t.main) return null;
    save();
    return { tower: t };
  }
  function marks() {
    return ((s && s.flags && s.flags.marks) || []).map((id) => {
      const t = D.towers.find((x) => x.mark && x.mark.id === id);
      return t ? t.mark : null;
    }).filter(Boolean);
  }

  // ---------- 存档校验：坏档一律挡在「进游戏」之前 ----------
  // 玩家本地的 v5 存档会被三件事弄坏：跨版本字段增删、写入中途被关掉（JSON 半截）、
  // 以及手改 localStorage（改血/改余烬是常见玩法）。旧实现只核 ver 与层数，坏字段直接进游戏——
  // 实测 floor=99 会让 tile() 抛错（渲染白屏）、hp 变 null 会让角色一进层就死、snap 残缺会让
  // 「从这一层重来」一点就崩。所以校验分两级：
  //   **档本身不可信**（结构/关键数值坏了）→ 拒绝读取并隔离，让玩家开新局；
  //   **只是缺字段或越界**（老版本没这些字段、手改出负数）→ 就地归一，不轻易让人丢进度。
  const isFiniteNum = (v) => typeof v === 'number' && isFinite(v);
  // 这四项缺失/非数 = 这档不可信（血量与攻防决定一切，楼层绑死地图）；
  // 其余数值（金币/经验/等级/步数/生命上限）缺失按默认补齐即可，不因此丢档。
  const NEED_NUM = ['hp', 'atk', 'def', 'floor'];

  // maps 是三层结构：[楼层][y][x]，每格一个字符
  function okMaps(maps) {
    if (!Array.isArray(maps) || maps.length !== D.floors.length) return false;
    for (let i = 0; i < maps.length; i++) {
      const grid = maps[i];
      if (!Array.isArray(grid) || grid.length !== SIZE) return false;
      for (let y = 0; y < grid.length; y++) {
        const row = grid[y];
        if (!Array.isArray(row) || row.length !== SIZE) return false;
        for (let x = 0; x < row.length; x++) {
          if (typeof row[x] !== 'string' || row[x].length !== 1) return false;
        }
      }
    }
    return true;
  }

  function sanitizeSave(p) {
    if (!p || typeof p !== 'object') return null;
    if (p.ver !== 5) return null;
    // 2026-11-28 多塔：floors 从 13 扩到 22，老档的地图只有 13 层。
    // 不判坏档——把新增的 9 层初始地图补在后面，老玩家接着玩（塔群进度按「主塔已开」算）。
    if (Array.isArray(p.maps) && p.maps.length === 13) {
      p.maps = p.maps.concat(D.floors.slice(13).map((f) => f.map.map((row) => row.split(''))));
    }
    if (!okMaps(p.maps)) return null;
    for (let i = 0; i < NEED_NUM.length; i++) if (!isFiniteNum(p[NEED_NUM[i]])) return null;
    if (p.atk < 0 || p.def < 0 || p.hp < 0) return null;
    // ---- 以下都是「可归一」，不是「不可信」 ----
    if (!isFiniteNum(p.gold) || p.gold < 0) p.gold = 0;
    if (!isFiniteNum(p.exp) || p.exp < 0) p.exp = 0;
    if (!isFiniteNum(p.level)) p.level = 1;
    if (!isFiniteNum(p.steps)) p.steps = 0;
    if (!isFiniteNum(p.maxHp) || p.maxHp <= 0) p.maxHp = Math.max(p.hp, 1000);
    p.floor = Math.min(D.floors.length - 1, Math.max(0, Math.floor(p.floor)));
    p.steps = Math.max(0, Math.floor(p.steps));
    p.level = Math.max(1, Math.floor(p.level));
    p.hp = Math.round(p.hp);
    p.maxHp = Math.max(p.hp, Math.round(p.maxHp));
    if (!p.flags || typeof p.flags !== 'object') p.flags = {};
    const f = p.flags;
    if (!Array.isArray(f.rings)) f.rings = [];
    else f.rings = f.rings.filter((x) => typeof x === 'string');
    // 塔群进度：老档没有这三个字段 = 已经在主塔里的人（按已通关三座齿塔补），
    // 这样老玩家读档不会被扔回锈塔第 1 层。
    const towerIds = D.towers.map((t) => t.id);
    if (typeof f.tower !== 'string' || towerIds.indexOf(f.tower) < 0) f.tower = 'main';
    if (!Array.isArray(f.towersCleared)) f.towersCleared = ['rust', 'ash', 'bell'];
    else f.towersCleared = f.towersCleared.filter((x) => towerIds.indexOf(x) >= 0 && x !== 'main');
    if (!Array.isArray(f.marks)) f.marks = ['rust', 'ash', 'bell'];
    else f.marks = f.marks.filter((x) => towerIds.indexOf(x) >= 0 && x !== 'main');
    if (!Array.isArray(f.fr)) f.fr = [];
    if (typeof f.hasBlock !== 'boolean') f.hasBlock = false;   // 格挡要学：老档缺字段＝未学会
    if (!isFiniteNum(f.eventEmber)) f.eventEmber = 0;
    if (!isFiniteNum(f.phaseSeed)) f.phaseSeed = (Math.random() * 1e9) | 0;
    if (!isFiniteNum(f.mapSeed)) f.mapSeed = (Math.random() * 1e9) | 0;
    if (!isFiniteNum(f.clean_kills)) f.clean_kills = 0;
    if (!isFiniteNum(f.rngSeed)) f.rngSeed = null;
    if (!isFiniteNum(f.rngN)) f.rngN = 0;
    // 窥探之镜 2026-11-18 起同时是遗物「无名之镜」。老档里已经买过镜子的（f.codex 为真）
    // 却没记 relic_scout——图鉴那一格不该因为存档的早晚而空着。纯粹补齐，镜子本来就不加数值。
    if (f.codex && !f.relic_scout) f.relic_scout = true;
    // 钥匙：老档的 b（蓝）并进 r；负数/非数夹回 0（手改出负钥匙＝免费开门）
    if (p.keys && typeof p.keys === 'object' && p.keys.b !== undefined) {
      p.keys.r = (p.keys.r || 0) + (p.keys.b || 0);
      delete p.keys.b;
    }
    if (!p.keys || typeof p.keys !== 'object') p.keys = { y: 0, r: 0 };
    p.keys.y = Math.max(0, Math.floor(isFiniteNum(p.keys.y) ? p.keys.y : 0));
    p.keys.r = Math.max(0, Math.floor(isFiniteNum(p.keys.r) ? p.keys.r : 0));
    // 站位：越界或落在墙里就挪到本层第一块空地（否则渲染与寻路都从坏坐标出发）。
    // 判据是「人能站在上面」，不是「这块地是空的」——玩家合法站位不只有 '.'：
    // 上下楼后脚在楼梯格（u/n）、逛完商店在摊位上（M）、选完祭坛（X）、路遇（?）、
    // 石座（K）、公主格（T）。早先只认 '.'，于是**在这些格子上存档、下次进来人物被挪到
    // 本层左上角**（上楼后关掉页面＝几乎必然发生）。实测：站 (8,9) 楼梯存档，读档落到 (1,1)。
    const map = p.maps[p.floor];
    const STANDABLE = '.unMX?TK@';
    const stand = (x, y) => Number.isInteger(x) && Number.isInteger(y)
      && x >= 0 && y >= 0 && x < SIZE && y < SIZE && STANDABLE.indexOf(map[y][x]) >= 0;
    if (!stand(p.x, p.y)) {
      let found = false;
      for (let y = 0; y < SIZE && !found; y++) {
        for (let x = 0; x < SIZE && !found; x++) {
          if (map[y][x] === '.') { p.x = x; p.y = y; found = true; }
        }
      }
      if (!found) return null;   // 整层没有一块空地：这档已经废了
    }
    if (p.ending !== 'true' && p.ending !== 'plain') p.ending = null;
    p.over = !!p.over;
    p.won = !!p.won;
    // 写者标记：哪一页写的这一档（同一浏览器开两页时用它判「这份档还是我手上这份吗」）。
    // 老档没有这个字段 → 空串＝无主，谁先写谁领（行为与从前一致，不做数据迁移）。
    p.w = typeof p.w === 'string' && p.w.length <= 16 ? p.w : '';
    if (!isFiniteNum(p.savedAt) || p.savedAt < 0) p.savedAt = 0;
    if (!p.floorEnter || typeof p.floorEnter !== 'object') p.floorEnter = null;
    if (!isFiniteNum(p.startedAt)) p.startedAt = Date.now();
    // 活跃用时（真在玩的毫秒数）：老档没有这个字段，或被人手改成负数/非数 → 0（读档后 summary 退回墙钟差）
    p.activeMs = isFiniteNum(p.activeMs) && p.activeMs > 0 ? Math.round(p.activeMs) : 0;
    // 本层快照：「从这一层重来」直接读它，字段缺一个就会抛错 → 残缺就整份丢掉
    if (!p.snap || typeof p.snap !== 'object') p.snap = null;
    else {
      const k = p.snap;
      const okSnap = isFiniteNum(k.floor) && k.floor >= 0 && k.floor < D.floors.length
        && isFiniteNum(k.hp) && isFiniteNum(k.maxHp) && isFiniteNum(k.atk) && isFiniteNum(k.def)
        && isFiniteNum(k.gold) && isFiniteNum(k.exp) && isFiniteNum(k.level) && isFiniteNum(k.steps)
        && k.keys && isFiniteNum(k.keys.y) && isFiniteNum(k.keys.r)
        && k.flags && typeof k.flags === 'object' && okMaps(k.maps);
      if (!okSnap) p.snap = null;
    }
    return p;
  }

  function hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      return !!sanitizeSave(JSON.parse(raw));
    } catch (e) { return false; }
  }

  // 上次 load 是不是「有档但读不出来」——UI 用它区分「没有存档」与「存档坏了」
  let lastBroken = false;
  const brokenSave = () => lastBroken;
  // 磁盘上有个档，但校验不过：首页要说一句，别让玩家以为进度凭空消失
  function brokenSaveOnDisk() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      return !sanitizeSave(JSON.parse(raw));
    } catch (e) { return true; }
  }

  // ---------- 存档：save() 立即落盘；移动用 saveSoon() 节流 ----------
  // 2026-11-15：写入失败原先被 `catch (e) {}` 整条吞掉——存储被占满 / 设备禁用存储 /
  // 无痕模式下，玩家看到的一切都正常，刷新后进度却凭空退回上一次成功保存的地方，一句提示都没有。
  // 现在三层口径：①先自救一次（`*_broken` 只是备查副本，占的地方最该让出来）；②仍失败就置
  // storageErr 并通知一次 UI（60 秒限流，别每 350ms 抖一次）；③save() 返回布尔，调用方想核就核。
  let storageErr = null;      // null = 正常；否则是异常名（QuotaExceededError / SecurityError …）
  let storageFailAt = 0;      // 上次通知 UI 的时刻（限流用；成功也不重置窗口＝一次会话只弹一次提示）
  let storageFailCb = null;   // main 注册：负责弹提示条 / 记漏斗（引擎不依赖 DOM）
  function markStorageFail(e) {
    storageErr = (e && e.name) || 'Error';
    const now = Date.now();
    if (now - storageFailAt < 60000) return;
    const first = !storageFailAt;   // 第一次失败：允许弹提示条 + 记漏斗；之后只留日志
    storageFailAt = now;
    if (typeof storageFailCb === 'function') {
      try { storageFailCb(storageErr, first); } catch (err) {}
    }
  }
  function persist(force) {
    if (!s) return true;
    // 老档（无写者标记）：谁先写谁领，不打断
    if (!s.w) s.w = TAB_ID;
    s.savedAt = Date.now();
    const raw = JSON.stringify(s);
    // 写前先看磁盘上这份档还是不是我手上这份。不是 → 停写：
    // 我内存里的进度比磁盘旧，写下去就是拿旧进度盖掉另一页刚走的路。
    // 例外只有两种：玩家明确接手（claim 传 force），或「开局那一次」还没落地（forceNextWrite）——
    // 后者一旦中途被别人顶掉（saveConflict），也要作废，否则会把开局那一下的授权一直留着。
    if (!force && !(forceNextWrite && !saveConflict)) {
      let cur = null;
      try { cur = localStorage.getItem(SAVE_KEY); } catch (e) { cur = null; }
      const w = writerOf(cur);
      if (w && w !== s.w) { markConflict(w); return false; }
    }
    forceNextWrite = false;
    try {
      localStorage.setItem(SAVE_KEY, raw);
      storageErr = null;
      return true;
    } catch (e) {
      // 一次自救：坏档备查副本是纯留档，先删它腾地方再写一次
      try {
        localStorage.removeItem(SAVE_KEY + '_broken');
        localStorage.setItem(SAVE_KEY, raw);
        storageErr = null;
        return true;
      } catch (e2) {
        markStorageFail(e2);
        return false;
      }
    }
  }
  // 磁盘上那份档的写者（读不出来／没有标记 → 空串＝无主）
  function writerOf(raw) {
    if (!raw) return '';
    try {
      const p = JSON.parse(raw);
      return p && typeof p.w === 'string' ? p.w : '';
    } catch (e) { return ''; }
  }
  // 被别人顶掉：只通知一次（持续通知会把提示刷成噪音），等 UI 让玩家选
  function markConflict(writer) {
    if (saveConflict) return;
    saveConflict = true;
    forceNextWrite = false;
    if (typeof conflictCb === 'function') {
      try { conflictCb(writer || ''); } catch (e) {}
    }
  }
  // 另一页写了档（main 从 storage 事件转进来）：本页若已不是写者，立刻停写，
  // 不必等下一次自动存档——否则中间这段时间里本页还在往旧档上加东西。
  function noteStorageWrite(raw) {
    const w = writerOf(raw);
    if (w && w !== TAB_ID) { foreignSaveAt = Date.now(); foreignSaveWriter = w; }
    if (!s || !s.w) return;
    if (w && w !== s.w) markConflict(w);
  }
  // 夺回：玩家的明确选择（在这页接着玩）——改回自己写，并强制写一次把手上的进度顶上去
  function claim() {
    if (!s) return false;
    s.w = TAB_ID;
    saveConflict = false;
    forceNextWrite = true;
    const ok = persist(true);
    forceNextWrite = false;
    return ok;
  }
  // 「另一页现在还在玩吗」——判据是**收到过它的存档事件**，而不是磁盘上那份档有多新。
  // 用磁盘时间会误报：玩家按 F5 刷新（同一页、留下刚写的档）就会被问「另一页在玩」。
  // storage 事件是活的：只有在对面真的写了东西、且这一页当场收到了，才说明对面在跑。
  function foreignOwnerFresh(ms) {
    if (!foreignSaveAt) return null;
    const age = Date.now() - foreignSaveAt;
    if (age > (ms || 60000)) return null;
    return { writer: foreignSaveWriter, age: Math.max(0, Math.round(age / 1000)) };
  }
  function save() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return persist();
  }
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 350);
  }

  function load(key) {
    lastBroken = false;
    const k = key || SAVE_KEY;
    let raw = null;
    try { raw = localStorage.getItem(k); } catch (e) { return null; }
    if (!raw) return null;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    const clean = sanitizeSave(parsed);
    if (!clean) {
      lastBroken = true;
      // 隔离而不是删除：主键清掉（首页不再给「继续游戏」），原档留一份备查
      try {
        localStorage.setItem(k + '_broken', raw);
        localStorage.removeItem(k);
      } catch (e) {}
      return null;
    }
    s = clean;
    // 读进来的是「磁盘上那一档」，写者是别的页或已无标记：本页在明确接手前不认这个身份，
    // 否则两页都自称同一个写者，保护等于没有
    s.w = '';
    return s;
  }

  function reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
    s = null;
    storageErr = null;
    saveConflict = false;
    forceNextWrite = false;
  }

  const state = () => s;
  const tile = (x, y) => (s && s.maps[s.floor][y] ? s.maps[s.floor][y][x] : '#');
  const setTile = (x, y, ch) => { s.maps[s.floor][y][x] = ch; };
  const hasRelic = (id) => !!(s && s.flags && s.flags['relic_' + id]);
  const ownedRelics = () => (s ? Object.keys(D.relics).filter(hasRelic) : []);

  // ---------- 锁环：章末回响给的构筑，改规则不改攻防 ----------
  const rings = () => (s && Array.isArray(s.flags.rings) ? s.flags.rings : []);
  const hasRing = (id) => rings().indexOf(id) >= 0;
  // 格挡比例：基础 0.55（省下将近一半）；后半部盾谱压到 0.42；断刃之环再收 0.1
  // 两个基数各留一个名字：教程 / 路遇 / 小传里写的「承伤 −45%」要跟这里同一个数
  // （engine-test 有源码契约盯着，改了这个数不更新文案就红）
  const BLOCK_BASE = 0.55;
  const BLOCK_BASE2 = 0.42;
  const ringBlockScale = () => {
    const base = s && s.flags.hasBlock2 ? BLOCK_BASE2 : BLOCK_BASE;
    return hasRing('parry') ? base - 0.1 : base;
  };
  // 架盾（格挡的第二种用法）：把这一层的盾一次性架开，本层余下每一场都吃 −15%。
  // 与「挡这一场 −45%」构成集中／摊平的取舍：单只特别贵（Boss、连击怪）就集中挡，
  // 本层还有一堆中等怪要清就摊平——两个选项谁更好取决于「我到底会不会打完这层」，
  // 只有玩家自己知道，这正是它要补的决策厚度。
  // 固定 0.85、不随盾谱/断刃加成：那两件是「单场手艺」，架开只护个大概，
  // 否则格挡一升级架盾就变成无脑更优，取舍又没了。
  const BLOCK_SPREAD = 0.85;
  const blockSpreadScale = () => BLOCK_SPREAD;
  // 按层读「这一层盾是不是已经架开了」——架盾是每层独立的，换层自动失效
  function blockSpreadAt(f) {
    return !!(s && s.flags && s.flags['guard_f' + f]);
  }
  const blockSpreadActive = () => (s ? blockSpreadAt(s.floor) : false);
  // 后半部学到手：格挡反击——挡下的那场，被卸掉的伤的三成化为经验
  const blockRiposte = () => !!(s && s.flags.hasBlock2);

  // 战意：打得越多越懂碑魔。只在最终决战生效，是「清塔路线」的独占收益——
  // 绕路省血、清塔减伤，两条路都能走到 S，但走法不同。普通怪/章节 Boss 不吃这个。
  // 过手之环把两道门槛整体前移一档（25/40 → 20/33）：最后一程「再清几只才值」变成明账
  // 两道门槛只在这一个函数里定义，战意/HUD/结算提示都读它（避免三处各写一份数字对不上）
  const zealNeed = () => (hasRing('merit') ? { mid: 20, full: 33 } : { mid: 25, full: 40 });
  function zealScale(m) {
    if (!m || !m.finalBoss || !s) return 1;
    const k = s.flags.killCount || 0;
    const n = zealNeed();
    return k >= n.full ? 0.64 : k >= n.mid ? 0.84 : 1;
  }
  // 下一档还差几只（HUD 用；没装过手之环时给 null，顶栏不显示这一格）
  function zealNext() {
    if (!s || !hasRing('merit')) return null;
    const k = s.flags.killCount || 0;
    const n = zealNeed();
    if (k >= n.full) return { kills: k, need: 0, cut: 36 };
    if (k >= n.mid) return { kills: k, need: n.full, cut: 16 };
    return { kills: k, need: n.mid, cut: 0 };
  }

  // 塔顶的账（纯读，一个数值都不改）：决战前把「这一场要挨多少」先算出来。
  // 全明码是这一作的身份——手边每只怪在开打前都能读出承伤，楼上的碑魔凭什么不行？
  // 它补的是「战斗外的取舍」缺的那半边：名墙（第 10 层）那一层清到什么程度，
  // 原来只能凭感觉（战意看不见、碑魔多重也不知道），现在两头都是数。
  // white 已经是「含誓约 / 锁环 / 战意乘区」的真实白打（fightDamage 同源），
  // block 是「这一场的格挡还留着」时能压到的数（没盾谱 / 已用光 → null）。
  const FINAL_KEY = (function () {
    const k = Object.keys(D.monsters).find((kk) => D.monsters[kk].finalBoss);
    return k || 'U';
  })();
  function finalLedger() {
    if (!s) return null;
    const m = D.monsters[FINAL_KEY];
    if (!m) return null;
    const n = zealNeed();
    const kills = s.flags.killCount || 0;
    // 破不了防也是要说的账：这时谈「掉多少血」是空话，得先告诉玩家差在哪
    const base = predictBase(FINAL_KEY, false);
    if (!base) return null;
    const out = {
      key: FINAL_KEY, name: m.name, emoji: m.emoji,
      kills, mid: n.mid, full: n.full,
      toFull: Math.max(0, n.full - kills),
      hp: s.hp, maxHp: s.maxHp,
      wall: base.damage === null,
      white: base.damage, block: null, zeal: 1,
      survive: false, blockSave: false,
    };
    if (out.wall) return out;
    const w = fightDamage(FINAL_KEY, false);
    out.white = w.damage;
    out.zeal = w.zeal;
    out.survive = s.hp > w.damage;
    // 「还有别的打法能救」也是账的一部分：只报白打、不说格挡，
    // 一句「撑不过」会把本来能过关的玩家劝退。
    // 缠斗不在这份账里：它多挨一轮，只会让这一场更贵——把它排进「最省的一招」
    // 是老版本「抢攻」留下的错误口径（那个按钮当时是省血的），别再加回来。
    // 格挡只在「这一场真能用」时给数：没学、用光都不给，否则就是画饼
    if (canBlock()) {
      const b = fightDamage(FINAL_KEY, true);
      if (b && b.damage !== null) {
        out.block = b.damage;
        out.blockSave = s.hp > b.damage;
      }
    }
    return out;
  }

  // 净芯之环：锁芯层清掉的怪折成余烬（每只 2，四只封顶）。
  // 计数在战斗结算里累加（flags.clean_kills），折算只在这一个函数，
  // 结算明细与收藏页都读它——同一个数字写在两处必有一处说谎。
  const CLEAN_PER = 2;
  const CLEAN_CAP = 4;
  function cleanEmber() {
    if (!s || !hasRing('clean')) return 0;
    return Math.min(CLEAN_CAP, s.flags.clean_kills || 0) * CLEAN_PER;
  }

  // 战斗的「真实承伤」：格挡、誓约、锁环都在这里算一次，演出与结算共用同一份
  // tangle：缠斗视角（多挨一轮，这一战经验翻倍）。与格挡互斥——挡是省血，缠是拿血换成长，同一场只能选一种打法
  // blocked：false（白打）｜true（单场格挡）｜'all'（架盾的那一场）。
  // 架盾一旦在某层生效，本层此后每一场都自动吃 0.85；若这层还剩格挡次数，
  // 同一场可以再补一记单场格挡（0.85 × 0.55）——双挡之环的第二种用法。
  function fightDamage(ch, blocked, tangle) {
    const p = predictBase(ch, tangle);
    if (!p || p.damage === null) return null;
    const m = D.monsters[ch];
    let dmg = p.damage;
    if (hasRing('ward2')) dmg = Math.round(dmg * 0.94);
    if (hasRing('bell') && m && m.boss) dmg = Math.round(dmg * 0.85);
    const spread = blockSpreadActive();
    let bs = spread ? blockSpreadScale() : 1;
    if (blocked === 'all') bs = blockSpreadScale();
    else if (blocked) bs = (spread ? blockSpreadScale() : 1) * ringBlockScale();
    if (bs !== 1) dmg = Math.round(dmg * bs);
    const zeal = zealScale(m);
    if (zeal < 1) dmg = Math.round(dmg * zeal);
    return { damage: dmg, raw: p.damage, per: p.per, rounds: p.rounds, out: p.out, blockScale: bs, zeal, tangled: !!tangle };
  }

  // 缠斗的账：多挨多少血 / 换来多少经验。
  // 只在「这笔交易成立」时给数——四种情况不给：
  // ①对方打不到你（多挨一轮也不疼，那就成了白拿经验）；②这怪没经验（白挨）；
  // ③缠完这一场会死（面板摆出来就是劝人去死）；
  // ④等级已经封顶（经验这条链到此为止，多挨的那一轮换不回任何东西）。
  const TANGLE_EXP = 2;
  function tangleInfo(ch) {
    if (!s) return null;
    const m = D.monsters[ch];
    if (!m || m.ghost) return null;
    if (!m.exp) return null;            // 没有经验可翻倍：白挨一轮
    if (s.level >= D.levelExp.length + 1) return null;   // 经验已封顶：翻倍也没处放
    const plain = fightDamage(ch, false, false);
    const deep = fightDamage(ch, false, true);
    if (!plain || !deep || plain.damage === null || deep.damage === null) return null;
    const extra = deep.damage - plain.damage;
    if (extra <= 0) return null;        // 打不动你：缠着也换不到代价，那就是白送
    if (s.hp <= deep.damage) return null;
    return {
      damage: deep.damage, plain: plain.damage, extra, rounds: plain.rounds,
      exp: m.exp, expGain: m.exp * TANGLE_EXP, mult: TANGLE_EXP,
    };
  }

  // 战中一句（2026-11-28 用户口径：一场最多说一次）。
  // 原来按血量 66% / 33% 各插一段过场——小塔之齿那种几刀就打完的仗，两段横幅几乎连着出，
  // 读起来是「刚掉一点血就开口，还没喘气又开口」。现在整场只挑一句，压在血条过半时开口；
  // 台词池四句，每局抽一句：同一局重进这一战不变，换一局听到别的。
  function bossLine(ch) {
    if (!s) return null;
    const key = 'bossLine_' + ch;
    if (s.flags[key]) return s.flags[key];
    const m = D.monsters[ch];
    if (!m || !m.midLines || !m.midLines.length) return null;
    const seed = (s.flags.phaseSeed || 1) + ch.charCodeAt(0) * 7919;
    const hit = m.midLines[Math.abs(seed) % m.midLines.length];
    s.flags[key] = { title: hit.title, text: hit.text };
    save();
    return s.flags[key];
  }

  // 章末回响：击败 Boss 必得，直接开锁环三选一（塔规已移除，不再设门槛）
  // 没学盾谱时「惜挡之环」是废卡（它奖励的是「忍住不挡」，而你根本挡不了）：直接不进候选池
  function ringChoices(ch) {
    const owned = rings();
    const noShield = !s.flags.hasBlock;
    const pool = (D.ringPools[ch] || []).filter((id) => owned.indexOf(id) < 0
      && !(id === 'spare' && noShield));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (nextRand() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return spreadRings(pool.slice(0, 3), pool);
  }

  // 三选一防错配（扩展轮 · 候选池 #10「1+2 选择」）
  // 纯随机抽样时，一次回响约 10.6% 会给出三道同一道题（第 4 章池 7/10 是余烬环 → 29%），
  // 那不是取舍而是同一笔账算三遍。规则：抽完若三枚同一 cat，把最后一枚换成
  // 「cat 没出现过」的一枚（随机）；只要已经有两个 cat 就不动——保留「2+1」的天然手感，
  // 也不去强行凑「三类齐」（那会把稀有小类的那一枚变成必现）。
  const ringCat = (id) => (D.rings[id] && D.rings[id].cat) || '';
  function spreadRings(picked, pool) {
    if (picked.length < 3) return picked;
    const cats = picked.map(ringCat);
    if (new Set(cats).size > 1) return picked;
    const others = pool.filter((id) => cats.indexOf(ringCat(id)) < 0);
    // 整章只有一类环（或可用池已被清空）时无解，保持原样而不是给一枚废卡
    if (!others.length) return picked;
    const out = picked.slice();
    out[out.length - 1] = others[(nextRand() * others.length) | 0];
    return out;
  }

  function settleChapter(ch) {
    if (!s || !D.chapters[ch - 1]) return null;
    const meta = D.chapters[ch - 1];
    let pending = !hasRingChapter(ch) && !s.flags['ringDone_' + ch];
    if (pending) {
      if (!s.flags['ringChoices_' + ch]) s.flags['ringChoices_' + ch] = ringChoices(ch);
      const choices = s.flags['ringChoices_' + ch];
      // 候选被过滤空（没学盾谱能把某章池滤到 0 / 环表缺数据）：这一章没有可挑的环。
      // 直接记为已结算，不挂 pending——否则每次进塔都弹一张一张卡都没有、也关不掉的空面板。
      if (!choices || !choices.length) { s.flags['ringDone_' + ch] = 1; pending = false; }
    }
    if (pending) s.flags['ringPending_' + ch] = true;
    s.flags['echo_' + ch] = 1;
    save();
    return {
      chapter: ch, title: meta.title, theme: meta.theme, color: meta.color,
      pending,
    };
  }

  function hasRingChapter(ch) {
    return rings().some((id) => D.rings[id] && D.rings[id].chapter === ch);
  }

  // 刷新/退出后回来，未选完的锁环仍要能选
  function pendingRing() {
    if (!s) return null;
    for (let ch = 1; ch <= D.chapters.length; ch++) {
      if (!s.flags['ringPending_' + ch]) continue;
      const choices = s.flags['ringChoices_' + ch];
      // 旧档里可能留着「挂了 pending、但候选是空数组」的章（新档已在 settleChapter 收口）：
      // 这里跳过而不是弹一张空面板。不改存档——读档路径只读不写。
      if (!choices || !choices.length) continue;
      return ch;
    }
    return null;
  }

  function pickRing(id) {
    if (!s || !D.rings[id]) return { type: 'refuse', msg: '没有这枚锁环' };
    const ch = D.rings[id].chapter;
    if (!s.flags['ringPending_' + ch]) return { type: 'refuse', msg: '这一章的锁环已经选过了' };
    const choices = s.flags['ringChoices_' + ch] || [];
    if (choices.indexOf(id) < 0) return { type: 'refuse', msg: '这枚锁环不在候选里' };
    if (hasRing(id)) return { type: 'refuse', msg: '已经装上了' };
    s.flags.rings = rings().concat(id);
    if (id === 'coin') s.gold += 200;
    if (id === 'coin2') s.gold += 300;
    if (id === 'keyring') { s.keys.y += 2; s.keys.r += 1; }
    if (id === 'vitality') { s.maxHp += 240; s.hp += 240; }
    if (id === 'vitality2') { s.maxHp += 200; s.hp += 200; }
    if (id === 'scope' || id === 'scout2') s.flags.codex = true;
    delete s.flags['ringPending_' + ch];
    s.flags['ringDone_' + ch] = true;
    save();
    const r = D.rings[id];
    return { type: 'ring', ring: id, name: r.name, chapter: ch, msg: `装入「${r.name}」· ${r.desc}` };
  }

  const keyName = (k) => (k === 'y' ? '黄钥匙' : '红钥匙');

  function moveTo(x, y) {
    s.x = x; s.y = y; s.steps++;
    // 刻数之环：按总步数走，每满 100 步给 30 金（爬完全塔约 500 步 ≈ 150 金）
    if (hasRing('notch') && s.steps > 0 && s.steps % 100 === 0) s.gold += 30;
  }

  // ---------- 本层快照：软锁兜底 ----------
  function beginFloor() {
    if (!s) return;
    s.floorEnter = {
      floor: s.floor,
      kills: s.flags.killCount || 0,
      shop: s.flags.shopCount || 0,
      hp: s.hp,
      maxHp: s.maxHp,
    };
    s.snap = {
      floor: s.floor, x: s.x, y: s.y,
      hp: s.hp, maxHp: s.maxHp, atk: s.atk, def: s.def,
      gold: s.gold, exp: s.exp, level: s.level,
      keys: { y: s.keys.y, r: s.keys.r },
      flags: JSON.parse(JSON.stringify(s.flags)),
      maps: JSON.parse(JSON.stringify(s.maps)),
      steps: s.steps,
      floorEnter: JSON.parse(JSON.stringify(s.floorEnter)),
    };
    save();
  }

  function restoreFloor() {
    if (!s || !s.snap) return false;
    const k = s.snap;
    s.floor = k.floor; s.x = k.x; s.y = k.y;
    s.hp = k.hp; s.maxHp = k.maxHp; s.atk = k.atk; s.def = k.def;
    s.gold = k.gold; s.exp = k.exp; s.level = k.level;
    s.keys = { y: k.keys.y, r: k.keys.r };
    s.flags = JSON.parse(JSON.stringify(k.flags));
    s.maps = JSON.parse(JSON.stringify(k.maps));
    s.steps = k.steps;
    s.floorEnter = k.floorEnter || null;
    s.won = false;
    save();
    return true;
  }

  // 塔内连续、塔间断开：齿塔接在主塔之后（13–21），所以「上一层」不再等于 floor+1。
  // 塔的最后一层不出这个函数——那里是塔门，由 changeFloor 拦下走结算。
  function nextFloorOf(f) {
    const tw = D.towerOf(f);
    const i = tw.floors.indexOf(f);
    if (i >= 0 && i < tw.floors.length - 1) return tw.floors[i + 1];
    const ti = D.towers.indexOf(tw);
    if (ti >= 0 && ti < D.towers.length - 1) return D.towers[ti + 1].floors[0];
    return f + 1;
  }
  function prevFloorOf(f) {
    const tw = D.towerOf(f);
    const i = tw.floors.indexOf(f);
    if (i > 0) return tw.floors[i - 1];
    const ti = D.towers.indexOf(tw);
    if (ti > 0) return D.towers[ti - 1].floors[D.towers[ti - 1].floors.length - 1];
    return f - 1;
  }

  function changeFloor(dir) {
    const from = s.floor;
    const fromTower = D.towerOf(from);
    // 齿塔的最后一层：u 是「塔门」，不是楼梯——不换层，交给 UI 结算齿印并回塔群。
    if (dir > 0 && !fromTower.main && from === fromTower.floors[fromTower.floors.length - 1]) {
      return { towerClear: fromTower.id, floor: from, x: s.x, y: s.y, heal: 0, gold: 0 };
    }
    // 齿塔的第一层：往下走＝退出这座塔（回塔群），进度从本塔第 1 层重来。
    if (dir < 0 && !fromTower.main && from === fromTower.floors[0]) {
      return { towerExit: fromTower.id, floor: from, x: s.x, y: s.y, heal: 0, gold: 0 };
    }
    const target = dir > 0 ? nextFloorOf(from) : prevFloorOf(from);
    if (target < 0 || target >= D.floors.length) return null;
    s.floor = target;
    const map = s.maps[target];
    const mark = dir > 0 ? 'n' : 'u';
    let nx = s.x, ny = s.y;
    let found = false;
    for (let y = 0; y < SIZE && !found; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === mark) { nx = x; ny = y; found = true; break; }
      }
    }
    // 目标层没有对应楼梯（隐藏层的 u 还没生成、主塔第 1 层只有 @）：不能沿用源层坐标——
    // 那边可能正好站着一只怪（fuzz 实测从锁芯下楼踩到第 12 层的「3」）。找一块能站的地。
    if (!found) {
      nx = -1; ny = -1;
      for (let y = 0; y < SIZE && nx < 0; y++) {
        for (let x = 0; x < SIZE; x++) {
          if ('.unMX?TK@'.indexOf(map[y][x]) >= 0) { nx = x; ny = y; break; }
        }
      }
      if (nx < 0) { nx = s.x; ny = s.y; }
    }
    s.x = nx; s.y = ny;
    s.flags.maxFloor = Math.max(s.flags.maxFloor || 0, target);
    // 每座塔自己的足迹：层阶之钥只认这份，不认全局 maxFloor（见 visitedMax）
    const tw = D.towerOf(target);
    s.flags.towerMax = s.flags.towerMax || {};
    s.flags.towerMax[tw.id] = Math.max(
      s.flags.towerMax[tw.id] === undefined ? tw.floors[0] : s.flags.towerMax[tw.id], target);
    // 誓约/锁环的「每上一层回复」只在**第一次踏上这一层**时结算（floor_healed_f{n} 标记）：
    // 否则残血玩家在两层楼之间来回走楼梯，每趟上楼都回一口——无限刷血。
    // 标记按楼层记录，同一层只能吃一次；跳层（jumpTo）不走这里，不受影响。
    let heal = 0;
    const healedKey = 'floor_healed_f' + target;
    const firstVisit = !(s.flags[healedKey]);
    if (firstVisit) s.flags[healedKey] = true;
    const gain = (pct) => {
      const v = Math.min(Math.round((s.maxHp || s.hp) * pct), Math.max(0, s.maxHp - s.hp));
      s.hp += v; heal += v;
    };
    if (dir > 0 && firstVisit && vow() === 'mercy') gain(0.12);
    // 锁环「借灯 / 回廊 / 长明」：只在往上走时生效，跳层不回血，防止来回刷
    if (dir > 0 && firstVisit) {
      const pct = (hasRing('lamp') ? 0.05 : 0) + (hasRing('stair') ? 0.04 : 0) + (hasRing('lamp2') ? 0.04 : 0);
      if (pct > 0) gain(pct);
    }
    // 基石之环：残血进新层才触发（30% 以下回 15%），是「救命」不是「续航」，与借灯类不冲突
    if (dir > 0 && firstVisit && hasRing('bulwark') && s.maxHp > 0 && s.hp / s.maxHp < 0.3) gain(0.15);
    // 惜挡之环：这一层一次格挡都没动，离开时补 90 金——盾成了「保命还是换钱」的一笔账。
    // 每层只结一次（spare_f<层>），上下楼来回走刷不到；没学盾谱拿不到这笔钱，
    // 否则它就成了无条件发钱的老好人环。
    let gold = 0;
    const spareKey = 'spare_f' + from;
    if (dir > 0 && hasRing('spare') && s.flags.hasBlock
        && !s.flags[spareKey] && blockUsedAt(from) === 0) {
      s.flags[spareKey] = true;
      gold = SPARE_GOLD;
      s.gold += gold;
    }
    return { floor: target, x: nx, y: ny, heal, gold };
  }

  function predict(ch) {
    return predictBase(ch);
  }

  // 基础预测（不含格挡视角）
  // 怪物特性：first 先攻 / magic 魔攻 / double 连击 / solid 坚固
  // 这四种属性决定「该加攻还是该加防」——魔塔数值解谜的核心
  // tangle=true 是「缠斗」视角：不急着收招，一个回合来回多磨一轮——
  // 多挨一轮（先攻怪也一样），换来这一战看得更清：经验翻倍（TANGLE_EXP）。
  function predictBase(ch, tangle) {
    const m = D.monsters[ch];
    if (!m || m.ghost) return null;
    const tr = m.trait || '';
    // 坚固：敌人防御视为我攻 −1，回合数恒等于血量
    const eDef = tr === 'solid' ? s.atk - 1 : m.def;
    // 旧十字架：对亡灵的每一次攻击按攻击力 ×1.5 结算
    const effAtk = hasRelic('cross') && m.kind === '亡' ? Math.round(s.atk * 1.5) : s.atk;
    const out = effAtk - eDef;
    if (out <= 0) return { win: false, reason: '攻击力不足，无法破防', damage: null, rounds: null, m, trait: tr };
    const rounds = Math.ceil(m.hp / out);
    // 魔攻：你的防御视作 0，堆防在这里没有意义
    const myDef = tr === 'magic' ? 0 : s.def;
    // 连击：每回合打两下——但第二下是收招的余劲，只有七成力
    // （无遗物线在特性上线后被拦在 9 层，这里给全体玩家一刀软减免）
    const doubleMult = tr === 'double' ? 1.7 : 1;
    const per = Math.max(0, m.atk - myDef) * doubleMult;
    // 先攻：连最后一击之前也要先挨一下，残血时不能碰
    const hitsBase = tr === 'first' ? rounds : Math.max(0, rounds - 1);
    // 缠斗：故意拖长这一场，让对方多一次出手机会（多挨一轮）
    const hits = tangle ? hitsBase + 1 : hitsBase;
    let damage = hits * per;
    if (damage > 0 && hasRelic('ward')) damage = Math.max(1, Math.floor(damage * 0.88));
    // 铁壁之誓：每场承伤 −12%。写进基础承伤，预测 / 实战 / 缠斗账读的是同一个数
    if (damage > 0 && vow() === 'guard') damage = Math.max(1, Math.round(damage * 0.88));
    // 开局三路的难度乘区（利齿 +10% / 重压 +20%）：只加怪物伤害，同样写进基础承伤
    const vd = D.vows[vow()];
    if (damage > 0 && vd && vd.dmgMul && vd.dmgMul !== 1) damage = Math.max(1, Math.round(damage * vd.dmgMul));
    return {
      win: s.hp > damage,
      reason: s.hp > damage ? '' : '生命不足，这场战斗会要你的命',
      damage, rounds, per, out, m, trait: tr,
    };
  }

  // 带格挡视角的预测：残血玩家可以用"这一层还没用过的格挡"换命——
  // 以前 win 判定不含格挡，会被"这场战斗会要你的命"拦住，玩家明明算得出活路
  // 生死口径与 fight 一致：用「真实承伤」（誓约/锁环乘区在内）判定，
  // 避免出现「预判能赢、开打被拒」的演出落差（铁壁 ×1.18 下会出现）
  function predictOpt(ch, allowBlock) {
    const p = predictBase(ch);
    if (!p || p.damage === null) return p;
    const fd = fightDamage(ch, false);
    if (fd && s.hp > fd.damage) return p;
    if (allowBlock && canBlock()) {
      const b = fightDamage(ch, true);
      if (b && s.hp > b.damage) {
        return Object.assign({}, p, { win: true, reason: '', blockSave: true, blockDamage: b.damage });
      }
    }
    return Object.assign({}, p, { win: false, reason: p.reason || '生命不足，这场战斗会要你的命' });
  }

  // 图鉴用：加 1 点攻 / 1 点防，各能少挨多少血（含十字架、守誓之盾等乘区）
  // 只给边际收益，不给结论——「该加什么」仍然留给玩家判断
  function margin(ch) {
    const m = D.monsters[ch];
    if (!m || m.ghost || !s) return null;
    const tr = m.trait || '';
    const cross = hasRelic('cross') && m.kind === '亡';
    const calc = (atk, def) => {
      const eDef = tr === 'solid' ? atk - 1 : m.def;
      const eff = cross ? Math.round(atk * 1.5) : atk;
      const out = eff - eDef;
      if (out <= 0) return null;
      const rounds = Math.ceil(m.hp / out);
      const myDef = tr === 'magic' ? 0 : def;
      const per = Math.max(0, m.atk - myDef) * (tr === 'double' ? 1.7 : 1);
      const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
      let dmg = hits * per;
      if (dmg > 0 && hasRelic('ward')) dmg = Math.max(1, Math.floor(dmg * 0.88));
      if (dmg > 0 && vow() === 'guard') dmg = Math.max(1, Math.round(dmg * 0.88));
      const vdm = D.vows[vow()];
      if (dmg > 0 && vdm && vdm.dmgMul && vdm.dmgMul !== 1) dmg = Math.max(1, Math.round(dmg * vdm.dmgMul));
      return dmg;
    };
    const base = calc(s.atk, s.def);
    if (base == null) return null;
    const up = calc(s.atk + 1, s.def);
    const dp = calc(s.atk, s.def + 1);
    return {
      atk: up == null ? 0 : Math.max(0, base - up),
      def: dp == null ? 0 : Math.max(0, base - dp),
      base,
    };
  }

  function levelUp() {
    let ups = 0;
    while (s.level < D.levelExp.length + 1 && s.exp >= D.levelExp[s.level - 1]) {
      s.level++;
      s.atk += 3;
      s.def += 2;
      const gain = 130 + (hasRelic('vigor') ? 80 : 0);
      s.hp += gain;
      s.maxHp += gain;
      ups++;
    }
    return ups;
  }

  function pickup(ch) {
    if (ch === '$') {
      s.gold += 50;
      return { type: 'pickup', msg: '拾取金币 ×50', short: '+50💰', good: true };
    }
    const it = D.items[ch];
    if (!it) return null;
    if (it.type === 'story') {
      if (it.flag && !s.flags[it.flag]) s.flags[it.flag] = true;
      return { type: 'story', story: it.story, msg: '拾取了一本泛黄的手记', good: true };
    }
    if (it.type === 'gold') {
      s.gold += it.value;
      return { type: 'pickup', msg: `拾取${it.name}，金币 +${it.value}`, short: `+${it.value}💰`, good: true, story: it.story || null };
    }
    if (it.type === 'relic') {
      s.flags['relic_' + it.relic] = true;
      if (it.relic === 'edge') s.atk += 6;
      const r = D.relics[it.relic];
      return {
        type: 'relic', relic: it.relic, story: it.story || null, name: it.name,
        msg: `获得遗物「${it.name}」· ${r ? r.desc : ''}`, good: true,
      };
    }
    if (it.type === 'hp') {
      // 干粮之环（ration）：药水回复量 +30%，地图上的和商店买的同口径
      const heal = potionHeal(it.value);
      s.hp += heal;
      if (s.hp > s.maxHp) s.maxHp = s.hp;
      return { type: 'pickup', msg: `拾取${it.name}，生命 +${heal}`, short: `+${heal}❤`, good: true };
    }
    if (it.type === 'atk') { s.atk += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击 +${it.value}`, short: `+${it.value}🗡️`, good: true }; }
    if (it.type === 'def') { s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，防御 +${it.value}`, short: `+${it.value}🛡`, good: true }; }
    if (it.type === 'both') { s.atk += it.value; s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击/防御 +${it.value}`, short: `+${it.value}/+${it.value}`, good: true }; }
    if (it.type === 'key') { s.keys[it.key]++; return { type: 'pickup', msg: `拾取${it.name}`, short: '+钥匙', good: true }; }
    if (it.type === 'block') {
      const first = grantBlock();
      if (!first) return { type: 'pickup', msg: `盾谱的残页你早就读过了`, short: '已学', good: false };
      return { type: 'pickup', msg: `拾取${it.name}，你学会了格挡`, short: '+🛡格挡', good: true, blockLearned: true, story: it.story || null };
    }
    if (it.type === 'block2') {
      // 后半部：以学会前半部为前提——没学过时读不透，先记住位置
      if (!s.flags.hasBlock) return { type: 'pickup', msg: '后半部全是口诀，你连「起手」都还没学——先去找前半部', short: '读不懂', good: false };
      if (s.flags.hasBlock2) return { type: 'pickup', msg: '后半部你已经背下来了', short: '已学', good: false };
      s.flags.hasBlock2 = true;
      save();
      return { type: 'pickup', msg: `拾取${it.name}：格挡承伤降到 42%，卸掉的伤三成化为经验`, short: '+🛡后半', good: true, blockLearned2: true, story: it.story || null };
    }
    return null;
  }

  function finish(ending) {
    s.won = true;
    s.ending = ending;
    s.finishedAt = Date.now();
    save();
    emit('finish', { ending });
  }

  function tryMove(dx, dy) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return { type: 'blocked' };
    const ch = tile(nx, ny);
    if (ch === '#') return { type: 'blocked', msg: '石墙挡住了去路' };

    // 塔的碑文：立在路边的石碑，不可通行；走到旁边（撞它）读一遍
    if (ch === '!') {
      if (!s.flags.steleRead) {
        s.flags.steleRead = true;
        save();
        return { type: 'story', story: 'stele', good: true };
      }
      return { type: 'blocked', msg: '碑上的字你已经读过了' };
    }

    if (D.monsters[ch]) {
      const m = D.monsters[ch];
      if (m.ghost) {
        setTile(nx, ny, '.');
        moveTo(nx, ny);
        saveSoon();
        return { type: 'story', story: ghostStory(), good: true };
      }
      return { type: 'battle', ch, dx, dy, prediction: predict(ch) };
    }

    if (ch === 'y' || ch === 'r') {
      if (s.keys[ch] > 0) {
        s.keys[ch]--;
        setTile(nx, ny, '.');
        moveTo(nx, ny);
        s.flags['door_f' + s.floor] = true;
        s.flags['door_' + ch] = true;
        saveSoon();
        return { type: 'open', msg: `用${keyName(ch)}打开了门`, good: true };
      }
      return { type: 'locked', msg: `需要${keyName(ch)}才能打开` };
    }

    if (ch === 'u' || ch === 'n') {
      moveTo(nx, ny);
      const r = changeFloor(ch === 'u' ? 1 : -1);
      save();
      return { type: 'floor', msg: `来到第 ${D.floorNo(s.floor)} 层 · ${D.floors[s.floor].name}`, dir: ch === 'u' ? 1 : -1, at: r };
    }

    if (ch === 'T') {
      moveTo(nx, ny);
      save();
      return { type: 'princess', hasJournal: !!s.flags.journal };
    }

    if (ch === 'M') {
      moveTo(nx, ny);
      save();
      return { type: 'shop' };
    }

    if (ch === 'X') {
      moveTo(nx, ny);
      if (s.flags['altar_f' + s.floor]) { saveSoon(); return { type: 'move' }; }
      save();
      return { type: 'altar' };
    }

    if (ch === '?') {
      moveTo(nx, ny);
      if (s.flags['ev_f' + s.floor]) {
        saveSoon();
        return { type: 'move' };
      }
      save();
      return { type: 'event', eventId: pickEvent() };
    }

    if (ch === 'K') {
      moveTo(nx, ny);
      if (s.flags.heart) { saveSoon(); return { type: 'move', msg: '石头还在跳' }; }
      save();
      return { type: 'heart' };
    }

    if (ch === '.') {
      moveTo(nx, ny);
      saveSoon();
      return { type: 'move' };
    }

    moveTo(nx, ny);
    const res = pickup(ch);
    if (res) {
      setTile(nx, ny, '.');
      save();
      if (res.type === 'story') emit('story', res.story);
      return res;
    }
    saveSoon();
    return { type: 'move' };
  }

  // ---------- 本层快照：软锁兜底 ----------

  function floorHasMonster() {
    const map = s.maps[s.floor];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const m = D.monsters[map[y][x]];
        if (m && !m.ghost) return true;
      }
    }
    return false;
  }

  // ---------- 层阶之钥：在走过的楼层之间跳 ----------
  // 2026-11-28 多塔：进度按「当前这座塔」记，不按全局平铺索引。
  // 旧实现读 maxFloor（全局最高），玩家拔完三枚齿后进主塔，行囊里的 Q 会把
  // 主塔 13 层全算成「走过」——能从第 1 层直接跳到碑魔面前，也能跳进别的塔。
  // towerMax 是每座塔自己的一份足迹；旧档没有这份字段时按塔的入口层算。
  function towerMaxOf(t) {
    if (!s || !s.flags || !t) return 0;
    const m = s.flags.towerMax && s.flags.towerMax[t.id];
    return typeof m === 'number' ? m : t.floors[0];
  }
  function visitedMax() {
    if (!s) return 0;
    const t = D.towerOf(s.floor);
    return Math.max(towerMaxOf(t), s.floor);
  }

  // 往前开一层的代价：封掉目标层最值钱的两件消耗品/装备。
  // 只挑普通道具，剧情物、遗物、商人、楼梯、Boss 门闩一律不动。
  const SEAL_ORDER = ['h', 'c', 'a', 'b', 'm', 'P', 's', 'd', 'L', 'p', 'k'];
  const SEALABLE = ['hp', 'atk', 'def', 'both', 'key'];
  function sealPlan(target) {
    if (!s || !s.maps[target]) return [];
    const map = s.maps[target];
    const found = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = map[y][x];
        const it = D.items[ch];
        if (!it || SEALABLE.indexOf(it.type) < 0) continue;
        const rank = SEAL_ORDER.indexOf(ch);
        found.push({ x, y, ch, name: it.name, rank: rank < 0 ? 99 : rank });
      }
    }
    found.sort((a, b) => a.rank - b.rank || a.y - b.y || a.x - b.x);
    return found.slice(0, 2);
  }

  // 一次性「往前开一层」：明码取舍，UI 用这个对象把代价写在按钮上
  function gateForth() {
    if (!s) return { ok: false, msg: '没有进行游戏' };
    if (!hasRelic('gate')) return { ok: false, msg: '你没有层阶之钥' };
    if (s.flags.gateForth) return { ok: false, msg: '钥匙只能往前开一次' };
    const t = D.towerOf(s.floor);
    const target = visitedMax() + 1;
    if (target > t.floors[t.floors.length - 1]) return { ok: false, msg: '这座塔的顶已经在你脚下了' };
    if (s.floor !== visitedMax()) return { ok: false, msg: '先回到你走过的最高层' };
    // 锁匠守着的章末层不能绕过去，否则四个 Boss 与章节叙事会被一脚跨掉
    if (D.floors[target].boss) return { ok: false, msg: '锁匠守着那一层，钥匙绕不过去' };
    return { ok: true, target, seals: sealPlan(target), msg: '' };
  }

  function sealTiles(target, plan) {
    const sealed = [];
    plan.forEach((p) => {
      if (s.maps[target][p.y][p.x] !== p.ch) return;
      s.maps[target][p.y][p.x] = '.';
      sealed.push({ floor: target, x: p.x, y: p.y, name: p.name });
    });
    s.flags.gateSeals = (s.flags.gateSeals || []).concat(sealed);
    return sealed;
  }

  function jumpTo(target) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    if (!hasRelic('gate')) return { type: 'refuse', msg: '你没有层阶之钥' };
    if (target < 0 || target >= D.floors.length) return { type: 'refuse', msg: '没有那一层' };
    if (D.towerOf(target).id !== D.towerOf(s.floor).id) return { type: 'refuse', msg: '层阶之钥只认当前这座塔' };
    if (target === s.floor) return { type: 'refuse', msg: '你就在这一层' };
    const max = visitedMax();
    const forth = target > max ? gateForth() : null;
    if (forth) {
      if (!forth.ok) return { type: 'refuse', msg: forth.msg };
      if (target !== forth.target) return { type: 'refuse', msg: '钥匙一次只能往前开一层' };
    }
    const sealed = forth ? sealTiles(target, forth.seals) : [];
    if (forth) {
      s.flags.gateForth = true;
      s.flags.maxFloor = Math.max(s.flags.maxFloor || 0, target);
    }
    s.floor = target;
    const tid = D.towerOf(target);
    s.flags.towerMax = s.flags.towerMax || {};
    s.flags.towerMax[tid.id] = Math.max(towerMaxOf(tid), target);
    const map = s.maps[target];
    let pos = null;
    for (let y = 0; y < SIZE && !pos; y++) {
      for (let x = 0; x < SIZE; x++) if (map[y][x] === 'n') { pos = { x, y }; break; }
    }
    if (!pos) {
      for (let y = 0; y < SIZE && !pos; y++) {
        for (let x = 0; x < SIZE; x++) if (map[y][x] === 'u') { pos = { x, y }; break; }
      }
    }
    // 主塔第 1 层既没有 n 也没有 u（只有 @）：跳过去时必须另找一块能站的地，
    // 否则人物保留原坐标，可能正好落在怪物格上（fuzz 实测踩到「3」）。
    if (!pos) {
      for (let y = 0; y < SIZE && !pos; y++) {
        for (let x = 0; x < SIZE; x++) if (map[y][x] === '@') { pos = { x, y }; break; }
      }
    }
    if (!pos) {
      for (let y = 0; y < SIZE && !pos; y++) {
        for (let x = 0; x < SIZE; x++) if ('.unMX?TK'.indexOf(map[y][x]) >= 0) { pos = { x, y }; break; }
      }
    }
    if (pos) { s.x = pos.x; s.y = pos.y; }
    save();
    const sealMsg = sealed.length
      ? ` · 封住了${sealed.map((x) => x.name).join('、')}`
      : '';
    return {
      type: 'floor', dir: 0, jump: true, forth: !!forth,
      sealed: sealed.map((x) => x.name),
      msg: `层阶之钥：第 ${D.floorNo(target)} 层 · ${D.floors[target].name}${sealMsg}`,
      at: { floor: target, x: s.x, y: s.y, heal: 0 },
    };
  }

  // ---------- 路遇：踩到 '?' 从池子里随机抽一个 ----------
  // 浅层温和；第 4 层起换「换命」的深层；第 7 层起换与名字/时间有关的锁梁事件
  function eventPool(floor) {
    const tier = floor >= 6 ? 'c' : floor >= 3 ? 'b' : 'a';
    const pool = D.events.filter((e) => (e.tier || 'a') === tier);
    return pool.length ? pool : D.events;
  }

  function pickEvent(floor) {
    const pool = eventPool(floor === undefined ? (s ? s.floor : 0) : floor);
    return pool[(nextRand() * pool.length) | 0].id;
  }

  function applyEffect(eff) {
    if (!eff) return;
    if (eff.gold) s.gold = Math.max(0, s.gold + eff.gold);
    if (eff.atk) s.atk = Math.max(1, s.atk + eff.atk);
    if (eff.def) s.def = Math.max(0, s.def + eff.def);
    if (eff.maxHp) {
      s.maxHp = Math.max(100, s.maxHp + eff.maxHp);
      s.hp = Math.min(s.hp, s.maxHp);
    }
    if (eff.healPct) s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * eff.healPct));
    if (eff.hpPct) s.hp = Math.max(1, Math.min(s.maxHp, s.hp + Math.round(s.maxHp * eff.hpPct)));
    if (eff.hp) s.hp = Math.max(1, Math.min(s.maxHp, s.hp + eff.hp));
    if (eff.keys) Object.keys(eff.keys).forEach((k) => { s.keys[k] = (s.keys[k] || 0) + eff.keys[k]; });
    // 路遇里「刻个名字 / 放回去」这类选择，留下的是通关时的余烬，不是结算分
    if (eff.ember) s.flags.eventEmber = (s.flags.eventEmber || 0) + eff.ember;
    // 路遇里「跟老兵讨教」：授予格挡（已学过则什么都不发生）
    if (eff.block) grantBlock();
    // 路遇里「用掉这一层的格挡」：与战斗里挡一次记同一本账
    // （惜挡之环的 spare_f、顶栏 🛡剩N、决战账的最省一招都读这同一个计数）
    if (eff.useBlock) s.flags['block_n' + s.floor] = blockUsed() + Math.abs(eff.useBlock);
  }

  // 选项的「付不起」判定：这是**唯一**判据，`eventCost`（给旧调用点的字符串）
  // 与展示层（「还差 N 金」）都从这里取，否则两处口径迟早各说各话。
  function eventShortfall(o) {
    if (!s || !o || !o.effect) return null;
    const e = o.effect;
    if (e.gold && e.gold < 0 && s.gold < -e.gold) return { kind: 'gold', need: -e.gold - s.gold, msg: '金币不够' };
    if (e.keys) {
      for (const k of Object.keys(e.keys)) {
        if (e.keys[k] < 0 && (s.keys[k] || 0) < -e.keys[k]) {
          return { kind: 'key', key: k, need: -e.keys[k] - (s.keys[k] || 0), msg: '钥匙不够' };
        }
      }
    }
    // 「用掉这一层的格挡」也是付不起的一种：两种情形各说各的话，别一律写「不能格挡」
    if (e.useBlock) {
      if (!s.flags.hasBlock) return { kind: 'block', why: 'unlearned', need: 1, msg: '还没学会格挡' };
      if (blockLeft() < e.useBlock) return { kind: 'block', why: 'used', need: 1, msg: '这一层的格挡已经用掉了' };
    }
    return null;
  }
  function eventCost(o) {
    const f = eventShortfall(o);
    return f ? f.msg : null;
  }

  function resolveEvent(id, idx) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    const e = D.events.find((x) => x.id === id);
    const o = e && e.options[idx];
    if (!o) return { type: 'refuse', msg: '没有这个选项' };
    const blocked = eventCost(o);
    if (blocked) return { type: 'refuse', msg: blocked };
    applyEffect(o.effect);
    // 过路之环：路遇结算后额外 40 金币（走哪条路都给，代价照付）
    const tollGold = hasRing('toll') ? 40 : 0;
    if (tollGold) s.gold += tollGold;
    s.flags['ev_f' + s.floor] = true;
    if (tile(s.x, s.y) === '?') setTile(s.x, s.y, '.');
    save();
    return { type: 'event', msg: o.msg, label: o.label, tollGold };
  }

  // ---------- 塔心石：带走，或者放下 ----------
  function heartState() {
    return s && s.flags.heart ? s.flags.heart : null;
  }

  function heartTake() {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    if (s.flags.heart) return { type: 'refuse', msg: '你已经做过决定了' };
    s.flags.heart = 'taken';
    s.flags.relic_heart = true;
    s.flags.heartAt = [s.x, s.y];
    const bonus = hasRing('heart') ? 100 : 0;
    s.maxHp += 300 + bonus;
    s.hp += 300 + bonus;
    if (tile(s.x, s.y) === 'K') setTile(s.x, s.y, '.');
    save();
    return { type: 'heart', choice: 'taken', name: '塔心石', msg: `你带走了塔心石 · 生命上限 +${300 + bonus}` };
  }

  function heartLeave() {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    if (s.flags.heart) return { type: 'refuse', msg: '你已经做过决定了' };
    s.flags.heart = 'left';
    save();
    return { type: 'heart', choice: 'left', name: '塔心石', msg: '你把手收了回来 · 石头还在那儿跳' };
  }

  // 击败碑魔后塔顶露出窄梯（塔规门槛已移除：四个锁匠全倒即可进）
  function revealCore() {
    if (!s) return false;
    const f = D.floors[s.floor];
    if (!f || !f.hiddenGate) return false;
    if (!s.flags.bossKilled_U) return false;
    if (tile(9, 2) === 'u') return true;
    setTile(9, 2, 'u');
    save();
    return true;
  }

  // 幽灵按层给对白：第 1、5、7、11 层各一段
  function ghostStory() {
    return ({ 0: 'candle1', 4: 'candle3', 6: 'candle4', 10: 'candle5' })[s.floor] || 'candle1';
  }

  function vow() {
    return (s && s.flags && D.vows[s.flags.vow]) ? s.flags.vow : 'none';
  }

  // 每层一次「格挡」：这一战的承伤降到 55%（铁壁之誓放弃它）
  // 格挡不再是开局白送：要先学到「半部盾谱」（地图拾取 / 商店购买 / 老兵讨教）才会
  // 双挡之环把每层次数抬到 2；次数用「计数」而不是布尔记，老档只有布尔就按 1 次算
  // 惜挡之环：一整层没动格挡，上楼时补多少金（唯一数值出口，改价只改这里）
  const SPARE_GOLD = 90;
  const blockLimit = () => (hasRing('twice') ? 2 : 1);
  // 按层读「这一层已经挡过几次」：count 字段优先，老档只有布尔时按 1 次算。
  // 拆成按楼层参数，是因为换层后 s.floor 已经指向新层，结算上一层必须显式指定。
  function blockUsedAt(f) {
    if (!s) return 0;
    const n = s.flags['block_n' + f];
    if (typeof n === 'number') return n;
    return s.flags['block_f' + f] ? 1 : 0;
  }
  function blockUsed() {
    return s ? blockUsedAt(s.floor) : 0;
  }
  // 还剩几次：没学盾谱时恒为 0，界面与战斗入口都靠它
  function blockLeft() {
    if (!s || s.over || s.won) return 0;
    if (!s.flags.hasBlock) return 0;
    return Math.max(0, blockLimit() - blockUsed());
  }
  function canBlock() {
    return blockLeft() > 0;
  }

  // 架盾的入口条件：这一层还有格挡次数、还没架开过、本层余下至少 2 只怪。
  // 「只剩最后一只」时架盾必然不如单场格挡（0.85 > 0.55 且只剩一场），
  // 与其在面板上摆一个永远更差的按钮，不如不出现——这是取舍，不是摆设。
  function canGuard() {
    if (!canBlock() || blockSpreadActive()) return false;
    return floorMonsterCount() >= 2;
  }

  // 授予格挡（三路获取的统一出口）：已学过时安静返回，不重复发
  function grantBlock() {
    if (!s) return false;
    if (s.flags.hasBlock) return false;
    s.flags.hasBlock = true;
    save();
    return true;
  }

  // 战前面板用：上一次打这只怪的打法与承伤（没有就是 null）
  function lastTactic(ch) {
    if (!s || !ch) return null;
    const v = s.flags['tac_' + ch];
    return v && v.p ? v : null;
  }

  function fight(dx, dy, opt) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    const ch = tile(nx, ny);
    const m = D.monsters[ch];
    if (!m || m.ghost) return { type: 'idle' };
    const p = predict(ch);
    // 生死判定用「真实承伤」：誓约/锁环乘区都在内（铁壁 ×1.18 会比基础预判更疼），
    // 残血换命：请求格挡、且挡完能活时放行（与 predictOpt 的口径一致）
    // opt.block: true = 挡这一场｜'all' = 架盾（花掉一次格挡，本层此后每场都吃 0.85）
    const canB = canBlock();
    let mode = false;
    if (opt && opt.block && canB) mode = (opt.block === 'all' && !blockSpreadActive()) ? 'all' : true;
    const fdPlain = fightDamage(ch, false);
    let allowed = !!(fdPlain && s.hp > fdPlain.damage);
    if (!allowed && mode) {
      const b = fightDamage(ch, mode);
      allowed = !!(b && s.hp > b.damage);
    }
    if (!allowed) return { type: 'refuse', msg: p.reason || '无法战胜' };

    if (m.boss && !s.flags['boss_seen_' + ch]) {
      s.flags['boss_seen_' + ch] = true;
      save();
      return { type: 'story', story: m.story || 'boss', dx, dy, prediction: p };
    }

    const blocked = !!mode;
    // 缠斗与格挡互斥：挡下整场就不存在「多磨一轮」这回事，格挡优先。
    // 缠斗按「缠之后」的口径判生死——多挨那一轮可能就是要命的那一轮，
    // 面板不会把它摆出来（tangleInfo 已经滤过），这里再兜一层：
    // 缠不起就退成白打，绝不因为按钮按错把人打死。
    let tangled = false;
    if (!blocked && opt && opt.tangle) {
      const td = fightDamage(ch, false, true);
      tangled = !!(td && td.damage !== null && s.hp > td.damage);
    }
    if (blocked) {
      s.flags['block_n' + s.floor] = blockUsed() + 1;
      s.flags['block_f' + s.floor] = true;   // 老字段留着：旧工具与旧档都还认它
      if (mode === 'all') s.flags['guard_f' + s.floor] = true;   // 架盾：本层余下每场都算
    }
    const fd = fightDamage(ch, mode, tangled);
    const dmg = fd.damage;
    s.hp -= dmg;
    s.damageTaken = (s.damageTaken || 0) + dmg;   // 跨局漏斗/结算统计用；老档缺省按 0
    // 誓约/锁环乘区可能让真实承伤超出预判（如铁壁 ×1.18）：扣到 0 以下就是死，
    // 钳住并置 over，主循环据此弹死亡结算——绝不允许负血继续走塔
    if (s.hp <= 0) {
      s.hp = 0;
      s.over = true;
      save();
      emit('dead', { name: m.name, damage: dmg });
    }
    setTile(nx, ny, '.');
    moveTo(nx, ny);
    const goldMul = (vow() === 'greed' ? 1.5 : 1) * (hasRelic('coin') ? 2 : 1) * (hasRing('ledger2') ? 1.15 : 1);
    const goldGain = Math.round(m.gold * goldMul);
    s.gold += goldGain;
    // 后半部盾谱的「格挡反击」：挡下的那场，被卸掉的伤的三成化为经验
    let riposte = 0;
    if (blocked && blockRiposte()) {
      riposte = Math.max(1, Math.round((p.damage - dmg) * 0.3));
      s.exp += riposte;
    }
    // 缠斗的收益：拖长这一场、把对方的招数看全——这一战经验翻倍。
    // 苦行之誓：这一战的经验整体 +40%（与缠斗乘算，不走两套账）
    // 击杀计数与战意照常（人确实倒了），掉金/遗物/锁环也不受影响
    const expMul = vow() === 'ascetic' ? 1.4 : 1;
    // 齿塔系数：三座齿塔每层怪少、经验密度低，按 ×1.5 结算（见 data.js towers 注释）
    const towerMul = (D.towerOf(s.floor) || {}).expMul || 1;
    const expGain = Math.round((tangled ? m.exp * TANGLE_EXP : m.exp) * expMul * towerMul);
    s.exp += expGain;
    s.flags.killCount = (s.flags.killCount || 0) + 1;    s.flags['kill_' + ch] = true;
    // 净芯之环：锁芯层（第 13 层，s.floor 12）每倒一只都记着，结算按 2 余烬/只 换（上限 4）
    if (hasRing('clean') && s.floor === 12) s.flags.clean_kills = (s.flags.clean_kills || 0) + 1;
    // 刻痕之环：每 8 只怪额外一把黄钥匙（按累计击杀数走 8 的倍数）
    let tallyKey = false;
    if (hasRing('tally') && s.flags.killCount % 8 === 0) { s.keys.y++; tallyKey = true; }
    let echo = null;
    let tomeKey = false;
    let heal = 0;
    if (m.boss) {
      s.flags['bossKilled_' + ch] = true;
      if (ch === 'Z') s.flags.bossKilled = true;
      if (m.chapter) {
        s.flags['chap_' + m.chapter] = true;
        echo = settleChapter(m.chapter);
        // 名录之环：每倒一位锁匠，额外一黄一红
        if (hasRing('tome')) { s.keys.y++; tomeKey = true; }
      }
      if (m.finalBoss) {
        s.flags.finalBossKilled = true;
        // 决战结束这一刻的血量：结算页用它当「剩余生命」，与难度基准同一口径
        // （玩家之后把余钱换成药水，不该让结算页看起来像「轻松通关」）
        s.flags.finalHp = Math.round(s.hp);
        s.flags.finalMaxHp = Math.round(s.maxHp);
      }
      // 无名之誓：每倒一位锁匠，塔把你的名字刻得更深（攻防 +2、上限 +200、回 25%）
      if (m.chapter && vow() === 'nameless') {
        s.atk += 2; s.def += 2;
        s.maxHp += 200;
        const h = Math.min(Math.round(s.maxHp * 0.25), Math.max(0, s.maxHp - s.hp));
        s.hp += h; heal += h;
      }
    }

    if (!m.boss) {
      if (hasRelic('ember')) {
        const h = Math.min(Math.max(4, Math.floor((s.maxHp || s.hp) * 0.02)), Math.max(0, s.maxHp - s.hp));
        s.hp += h; heal += h;
      }
      if (hasRing('cinder')) {
        const h = Math.min(Math.max(2, Math.floor((s.maxHp || s.hp) * 0.007)), Math.max(0, s.maxHp - s.hp));
        s.hp += h; heal += h;
      }
    }
    if (s.floor === 12 && !floorHasMonster()) s.flags.coreClear = true;   // 锁芯仍是主塔末层（索引 12）；齿塔接在它后面，不能用数组末位
    const ups = levelUp();
    save();
    emit('kill', { name: m.name, boss: !!m.boss });
    // 打法归属（漏斗 dec 的唯一口径）：这一场算哪一种「打法」。
    // 以引擎真发生的事为准（mode / tangled），不以面板意图为准——意图可能被拒（血不够、盾用完），
    // 记账要记真的那次。opt.auto＝这一记挡是系统替他举的（玩家没选任何打法），单记 'f'，别混进格挡率。
    // 次序＝结算优先级：架盾 > 单场格挡 > 自动挡 > 缠斗 > 直接打。
    const pick = !blocked ? (tangled ? 't' : 'n')
      : (mode === 'all' ? 'g' : (opt && opt.auto ? 'f' : 'b'));
    // 战前面板的记忆：这一只上一次用了哪种打法、掉了多少血（本局内跨层保留）。
    // 只记「实际发生的」，不记意图——面板上写错了比不写更糟。
    s.flags['tac_' + ch] = { p: pick, d: dmg };

    return {
      type: 'fight', damage: dmg, raw: p.damage, blocked, tangled, rounds: p.rounds,
      pick,
      guard: mode === 'all', guardOn: blockSpreadActive(),
      gold: goldGain, exp: expGain, heal, levelUps: ups, riposte,
      monster: m, boss: !!m.boss, chapter: m.chapter || 0,
      after: m.after || null, finalBoss: !!m.finalBoss, echo,
      tallyKey, tomeKey,
    };
  }

  // 商店行情：每层摊主挑一件「可重复货」让价（七折）。
  // 选哪件由「本局种子 + 楼层」派生（mulberry32），不消耗 nextRand——不挤占路遇/锁环/祭坛的抽取序列。
  // 结果落进 flags['deal_<层>']：反复进出商店、重来本层都不会重摇（否则能刷到攻防打折）。
  // 一次性货（盾谱/镜子/灯芯/碎片）永不让价：那是「能不能补学格挡」「拿不拿得到碎片」的硬门槛。
  const DEAL_FACTOR = 0.7;
  // 摊主开口才报价：行情在这一层的商店被打开后才落定（flags.shop_f<层>）。
  // 好处有二：①「没进过店」的地方（结算/提示/纯引擎调用）拿到的永远是原价，不会凭空冒出折扣；
  // ② 老单测里的买卖断言不受影响——它们不打开商店，价格口径与从前一字不差。
  function openShopAt(floor) {
    if (!s) return false;
    const f = floor === undefined ? s.floor : floor;
    s.flags['shop_f' + f] = true;
    return true;
  }
  function dealOf(floor) {
    if (!s || !s.flags) return null;
    const f = floor === undefined ? s.floor : floor;
    if (!s.flags['shop_f' + f]) return null;
    const key = 'deal_' + f;
    if (s.flags[key] !== undefined) return s.flags[key] || null;
    const pool = shopStock(f).filter((x) => !x.once && !x.block && !x.heartShard);
    if (!pool.length) { s.flags[key] = ''; return null; }
    const seed = ((s.flags.mapSeed || 1) ^ Math.imul(f + 1, 0x85EBCA6B)) | 0;
    const id = pool[(mulberry32(seed)() * pool.length) | 0].id;
    s.flags[key] = id;
    return id;
  }

  // 价格：可重复商品每次购买后涨价 item.step（越买越贵）；once 商品固定价
  // opts.noDeal：算「不让价的话多少钱」，只给界面画划掉的原价用，不影响结算
  function priceOf(item, opts) {
    if (!s) return item.price;
    const skipDeal = !!(opts && opts.noDeal);
    const step = (hasRing('chain') && (item.id === 'atk' || item.id === 'def')) ? 0 : (item.step || 0);
    let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
    // 行情：整层最便宜的那件，与遗物/锁环/誓约的折扣叠乘
    if (!skipDeal && !item.once && dealOf() === item.id) price = Math.max(1, Math.round(price * DEAL_FACTOR));
    if (hasRelic('thrift')) price = Math.max(1, Math.round(price * 0.75));
    if (hasRing('thrift2')) price = Math.max(1, Math.round(price * 0.75));
    // 秤砣之环（bargain）：钥匙价目再 −25%（只影响钥匙，药水与训练照旧）
    if (item.key && hasRing('bargain')) price = Math.max(1, Math.round(price * 0.5));
    return price;
  }

  // 药水回复量：干粮之环 +30%。地图药水与商店药水共用，避免两套口径
  function potionHeal(base) {
    const v = Number(base) || 0;
    return hasRing('ration') ? Math.round(v * 1.3) : v;
  }

  // 决战余裕：打完最终 Boss 那一刻还剩多少血（S/A/B/C）。
  // 与难度基准同口径——用 finalHp（不含随后买药/升级的回血），老档没有就回落到当前值。
  function battleMargin() {
    if (!s) return null;
    const hp = s.flags.finalHp != null ? s.flags.finalHp : s.hp;
    const mx = s.flags.finalMaxHp != null ? s.flags.finalMaxHp : s.maxHp;
    if (!(mx > 0)) return null;
    const pct = hp / mx;
    const grade = pct >= 0.7 ? 'S' : pct >= 0.5 ? 'A' : pct >= 0.3 ? 'B' : 'C';
    const label = { S: '毫发无伤', A: '从容', B: '险胜', C: '一线' }[grade];
    return { grade, pct: Math.round(pct * 100), label };
  }

  // 这一层的货摊摆什么：minFloor 是上架层——秤走一步，货跟一步
  function shopStock(floor) {
    const f = floor === undefined ? (s ? s.floor : 0) : floor;
    return D.shop.filter((x) => !x.minFloor || f + 1 >= x.minFloor);
  }

  // 本层还剩几只怪（商店的「还差多少金、还能刷几只」提示用；幽灵 NPC 不算）
  function floorMonsterCount(floor) {
    if (!s) return 0;
    const f = floor === undefined ? s.floor : floor;
    const map = s.maps[f];
    if (!map) return 0;
    let n = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const m = D.monsters[map[y][x]];
        if (m && !m.ghost) n++;
      }
    }
    return n;
  }

  // 本层还剩几只怪、其中「最硬的一只」白打要掉多少血（战斗面板那一行读数）。
  // 只给账、不给建议——「先打哪只、要不要绕过去」仍由玩家自己判断；
  // 数值走 fightDamage 的白打视角（誓约/锁环乘区在内、不含格挡），
  // 与战斗面板上的「承伤 −N」是同一个数，不会各算各的。
  // skip：战斗中传当前目标那一格——它马上就要倒，算进「还剩几只 / 最贵」只会让读数
  // 变成「我在打的这只就是最贵的」，白占一行。
  // 打不穿（攻击力不够破防）的那只单独报：它比「掉血多」更该先知道——
  // 破不了防时谈掉多少血都是空话。
  function floorThreat(floor, skip) {
    if (!s) return null;
    const f = floor === undefined ? s.floor : floor;
    const map = s.maps[f];
    if (!map) return null;
    let count = 0;
    let worst = null;   // 白打承伤最高的那只
    let wall = null;    // 第一只打不穿的
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (skip && skip.x === x && skip.y === y) continue;
        const ch = map[y][x];
        const m = D.monsters[ch];
        if (!m || m.ghost) continue;
        count++;
        const p = predictBase(ch);
        if (!p || p.damage === null) {
          if (!wall) wall = { ch, name: m.name };
          continue;
        }
        const fd = fightDamage(ch, false);
        const dmg = fd && fd.damage !== null ? fd.damage : p.damage;
        if (!worst || dmg > worst.damage) worst = { ch, name: m.name, damage: dmg };
      }
    }
    // spread：本层盾已经架开时，这里的数是「架盾后」而不是「白打」——
    // 面板文案必须跟着变，否则读数是打过折的、标签还写白打（同一个数字两套说法）
    return { count, worst, wall, spread: blockSpreadAt(f) };
  }

  // 本层还剩几件「能捡的东西」（罗盘之环用）：道具与金币都算，
  // 门 / 怪 / 楼梯 / 商店 / 祭坛这些「踩上去是交互」的不算——罗盘回答的是「还有没有漏拿的收益」。
  function floorPickupCount(floor) {
    if (!s) return 0;
    const f = floor === undefined ? s.floor : floor;
    const map = s.maps[f];
    if (!map) return 0;
    let n = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = map[y][x];
        if (ch === '$') { n++; continue; }
        const it = D.items[ch];
        if (it && it.type !== 'story') n++;
      }
    }
    return n;
  }

  function buy(id) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    let healed = 0;
    const item = D.shop.find((x) => x.id === id);
    if (!item) return { type: 'refuse', msg: '商品不存在' };
    if (item.codex && s.flags.codex) return { type: 'refuse', msg: '已经拥有窥探之镜' };
    if (item.relic && hasRelic(item.relic)) return { type: 'refuse', msg: '这件东西已经在你身上了' };
    if (item.block && s.flags.hasBlock) return { type: 'refuse', msg: '你已经学过格挡了' };
    if (item.heartShard && s.flags.heartShard) return { type: 'refuse', msg: '塔心碎片一枚就够——它认主' };
    const price = priceOf(item);
    if (s.gold < price) return { type: 'refuse', msg: '金币不够' };
    s.gold -= price;
    s.flags['buy_' + item.id] = (s.flags['buy_' + item.id] || 0) + 1;
    if (item.key) s.keys[item.key]++;
    if (item.hp) {
      const heal = potionHeal(item.hp);
      s.hp += heal;
      if (s.hp > s.maxHp) s.maxHp = s.hp;
      healed = heal; // 供 UI 显示实际回复量（含干粮之环加成）
    }
    if (item.atk) s.atk += item.atk;
    if (item.def) s.def += item.def;
    if (item.relic) s.flags['relic_' + item.relic] = true;
    if (item.codex) s.flags.codex = true;
    if (item.block) grantBlock();
    if (item.heartShard) s.flags.heartShard = true;
    s.flags.shopCount = (s.flags.shopCount || 0) + 1;
    save();
    const msg = item.codex
      ? '获得遗物「无名之镜」：怪物情报已解锁，图鉴记下这一件'
      : item.relic
        ? `获得遗物「${item.name}」· ${D.relics[item.relic].desc}`
        : item.block
          ? '秦权把盾谱后半卷摊开：「学不会就再来。」——你学会了**格挡**'
          : item.heartShard
            ? '秦权用绒布包起那枚碎片：「塔的心跳，带一点出去也无妨。」——通关时它会化为余烬'
            : `购买了${item.name}`;
    return { type: 'buy', item, price, healed, msg };
  }

  // ---------- 祭坛：前八位勇者的行李，三选一 ----------
  function altarChoices(count) {
    if (!s) return [];
    const pool = D.altarPool.filter((id) => !hasRelic(id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (nextRand() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, Math.max(1, count || 3));
  }

  function pickRelic(id) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    if (!D.relics[id]) return { type: 'refuse', msg: '没有这件东西' };
    if (hasRelic(id)) return { type: 'refuse', msg: '已经拿了' };
    s.flags['relic_' + id] = true;
    if (id === 'steel') { s.atk += 3; s.def += 3; }
    if (id === 'scout') s.flags.codex = true;
    s.flags.altar = true;
    s.flags['altar_f' + s.floor] = true;
    if (tile(s.x, s.y) === 'X') setTile(s.x, s.y, '.');
    save();
    const r = D.relics[id];
    return { type: 'relic', relic: id, name: r.name, msg: `取走「${r.name}」· ${r.desc}` };
  }

  function nextLevelExp() {
    if (!s) return null;
    if (s.level > D.levelExp.length) return null;
    return D.levelExp[s.level - 1];
  }

  // ---------- 寻路 ----------
  function passableForPath(x, y) {
    const ch = tile(x, y);
    if (ch === '#' || ch === '!') return false;
    if (D.monsters[ch]) return false;
    // 商店会弹全屏遮罩并打断自动寻路：只许玩家主动点它，路过一律绕开
    if (ch === 'M') return false;
    if (ch === 'y' || ch === 'r') return s.keys[ch] > 0;
    if (ch === 'u' || ch === 'n') return false;
    return true;
  }

  function pathTo(tx, ty) {
    if (!s || s.over || s.won) return null;
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return null;
    if (tx === s.x && ty === s.y) return [];
    const targetCh = tile(tx, ty);
    if (targetCh === '#' || targetCh === '!' || D.monsters[targetCh]) return null;
    if ((targetCh === 'y' || targetCh === 'r') && s.keys[targetCh] <= 0) return null;

    const prev = new Map();
    prev.set(s.x + ',' + s.y, null);
    const q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = nx + ',' + ny;
        if (prev.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const isTarget = nx === tx && ny === ty;
        if (!isTarget && !passableForPath(nx, ny)) continue;
        if (isTarget && tile(nx, ny) === '#') continue;
        prev.set(key, [x, y]);
        q.push([nx, ny]);
        if (isTarget) {
          const path = [];
          let cur = [nx, ny];
          while (!(cur[0] === s.x && cur[1] === s.y)) {
            const p = prev.get(cur.join(','));
            if (!p) return null;
            path.push([cur[0] - p[0], cur[1] - p[1]]);
            cur = p;
          }
          return path.reverse();
        }
      }
    }
    return null;
  }

  // 把怪物当成可通行，用来判断"路被哪只怪挡住"
  function pathThrough(tx, ty) {
    if (!s || s.over || s.won) return null;
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return null;
    if (tx === s.x && ty === s.y) return [];
    if (tile(tx, ty) === '#') return null;
    const prev = new Map();
    prev.set(s.x + ',' + s.y, null);
    const q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = nx + ',' + ny;
        if (prev.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        const ch = tile(nx, ny);
        if (ch === '#') continue;
        if (ch === 'M') continue; // 同上：不把商店塞进自动寻路的途经格
        if (ch === '!') continue; // 石碑不可通行，寻路绕开
        if (ch === 'y' || ch === 'r') { if (s.keys[ch] <= 0) continue; }
        if ((ch === 'u' || ch === 'n') && !(nx === tx && ny === ty)) continue;
        prev.set(key, [x, y]);
        q.push([nx, ny]);
        if (nx === tx && ny === ty) {
          const path = [];
          let cur = [nx, ny];
          while (!(cur[0] === s.x && cur[1] === s.y)) {
            const p = prev.get(cur.join(','));
            if (!p) return null;
            path.push([cur[0] - p[0], cur[1] - p[1]]);
            cur = p;
          }
          return path.reverse();
        }
      }
    }
    return null;
  }

  function pathToNear(tx, ty) {
    if (!s || s.over || s.won) return null;
    const visited = new Map();
    visited.set(s.x + ',' + s.y, { prev: null, depth: 0 });
    const q = [[s.x, s.y]];
    let best = { x: s.x, y: s.y, d: Math.abs(s.x - tx) + Math.abs(s.y - ty), depth: 0 };
    while (q.length) {
      const [x, y] = q.shift();
      const info = visited.get(x + ',' + y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        if (!passableForPath(nx, ny)) continue;
        visited.set(key, { prev: [x, y], depth: info.depth + 1 });
        q.push([nx, ny]);
        const d = Math.abs(nx - tx) + Math.abs(ny - ty);
        if (d < best.d || (d === best.d && info.depth + 1 < best.depth)) {
          best = { x: nx, y: ny, d, depth: info.depth + 1 };
        }
      }
    }
    if (best.x === s.x && best.y === s.y) return null;
    const path = [];
    let cur = [best.x, best.y];
    while (!(cur[0] === s.x && cur[1] === s.y)) {
      const rec = visited.get(cur.join(','));
      if (!rec || !rec.prev) return null;
      path.push([cur[0] - rec.prev[0], cur[1] - rec.prev[1]]);
      cur = rec.prev;
    }
    return { path: path.reverse(), x: best.x, y: best.y };
  }

  // 枚举到目标格的多条最短路线，按「第一个分岔口的走向」分组（拖动选路用）。
  // 返回 { junction:[x,y]|null, up/down/left/right: {path, cells}|null }。
  // 目标非法（墙/怪/没钥匙的门）返回 null；最短路唯一时四个方向里恰有一个非空。
  function pathsTo(tx, ty) {
    if (!s || s.over || s.won) return null;
    if (tx < 0 || ty < 0 || tx >= SIZE || ty >= SIZE) return null;
    if (tx === s.x && ty === s.y) return { junction: null, up: null, down: null, left: null, right: null };
    const targetCh = tile(tx, ty);
    if (targetCh === '#' || targetCh === '!' || D.monsters[targetCh]) return null;
    if ((targetCh === 'y' || targetCh === 'r') && s.keys[targetCh] <= 0) return null;

    // BFS 距离场：从玩家出发
    const dist = new Map();
    dist.set(s.x + ',' + s.y, 0);
    const q = [[s.x, s.y]];
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist.get(x + ',' + y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const key = nx + ',' + ny;
        if (dist.has(key)) continue;
        if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
        // 楼梯不能当中间格，但可以当目标（与 pathTo 口径一致）
        if (!passableForPath(nx, ny) && !(nx === tx && ny === ty)) continue;
        dist.set(key, d + 1);
        q.push([nx, ny]);
      }
    }
    if (dist.get(tx + ',' + ty) === undefined) return null;

    const ORDER = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const nameOf = (dx, dy) => dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';

    // 沿最短路 DAG 贪心下降走默认路线，顺路记下第一个分岔（≥2 个等长续路）
    let junction = null;
    const defaultCells = [[s.x, s.y]];
    let cx = s.x, cy = s.y;
    for (let guard = SIZE * SIZE; guard-- > 0 && !(cx === tx && cy === ty);) {
      const cur = dist.get(cx + ',' + cy);
      const opts = [];
      for (const [dx, dy] of ORDER) {
        if (dist.get((cx + dx) + ',' + (cy + dy)) === cur + 1) opts.push([dx, dy]);
      }
      if (!opts.length) break;
      if (!junction && opts.length >= 2) junction = { x: cx, y: cy, opts };
      cx += opts[0][0];
      cy += opts[0][1];
      defaultCells.push([cx, cy]);
    }

    // 从某格沿某方向出发，先走一步再贪心下降到目标，得到一条完整路线
    function buildRoute(x, y, dx0, dy0) {
      const cells = [[x, y]];
      let px = x + dx0, py = y + dy0;
      for (let guard = SIZE * SIZE; guard-- > 0;) {
        if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return null;
        cells.push([px, py]);
        if (px === tx && py === ty) break;
        const cur = dist.get(px + ',' + py);
        let nxt = null;
        for (const [dx, dy] of ORDER) {
          if (dist.get((px + dx) + ',' + (py + dy)) === cur + 1) { nxt = [px + dx, py + dy]; break; }
        }
        if (!nxt) return null;
        px = nxt[0]; py = nxt[1];
      }
      const path = [];
      for (let i = 1; i < cells.length; i++) path.push([cells[i][0] - cells[i - 1][0], cells[i][1] - cells[i - 1][1]]);
      return { path, cells };
    }

    // 没有分岔 = 最短路唯一：分组退化为默认路线的首步方向
    const j = junction || { x: s.x, y: s.y, opts: [[defaultCells[1][0] - defaultCells[0][0], defaultCells[1][1] - defaultCells[0][1]]] };
    const out = { junction: junction ? [junction.x, junction.y] : null, defaultCells, up: null, down: null, left: null, right: null };
    for (const [dx, dy] of j.opts) {
      const r = buildRoute(j.x, j.y, dx, dy);
      if (r) out[nameOf(dx, dy)] = r;
    }
    return out;
  }

  // 单帧最多记 250ms：切后台回来 / 长卡顿时 rAF 的时间差会是一大段（几分钟甚至几小时），
  // 那段不是「在玩」。正常一帧 16ms，连打 15 帧才够得着这个上限，落不到正常手感上。
  const ACTIVE_CAP = 250;
  function accrueActive(ms) {
    if (!s) return 0;
    if (!isFiniteNum(s.activeMs) || s.activeMs < 0) s.activeMs = 0;
    const d = isFiniteNum(ms) ? Math.min(Math.max(0, ms), ACTIVE_CAP) : 0;
    s.activeMs += d;
    return s.activeMs;
  }

  function summary() {
    if (!s) return null;
    // 用时＝玩家真在的时间（activeMs 累计），不是墙钟差：
    // 墙钟把「切后台接个电话」那十分钟也记进这一局——而榜单同层按用时升序排，等于挂机就掉名次；
    // 系统时间被往回调整时墙钟还会算出负数（老实现钳到 0，于是显示「0 秒通关」）。
    // 老档没有 activeMs（或为 0：开局第一帧就结束）→ 退回墙钟差，读数与从前一字不差。
    let time;
    if (isFiniteNum(s.activeMs) && s.activeMs > 0) {
      time = Math.max(0, Math.round(s.activeMs / 1000));
    } else {
      time = Math.max(0, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000));
    }
    // 榜单/结算里的「第几层」＝总进度号（三座齿塔 1–9 + 主塔 10–22），
    // 不能用 floor+1：齿塔索引是 13 起，直接加一会记成「第 14 层」。
    return { ending: s.ending, floor: D.progressNo(s.floor), level: s.level, steps: s.steps, time };
  }

  window.Engine = {
    setHooks, newGame, load, reset, hasSave, brokenSave, brokenSaveOnDisk, save, storageError: () => storageErr, setStorageFailHook: (fn) => { storageFailCb = fn || null; }, state, tile, predict, predictOpt, shuffleFloor1, shufflePickups, nextRand,
    tabId, claim, noteStorageWrite, foreignOwnerFresh, saveConflict: () => saveConflict, setConflictHook: (fn) => { conflictCb = fn || null; }, saveKey: SAVE_KEY,
    predictAt(dx, dy) {
      if (!s) return null;
      const ch = tile(s.x + dx, s.y + dy);
      return D.monsters[ch] ? predict(ch) : null;
    },
    tryMove, fight, lastTactic, canBlock, canGuard, blockLimit, blockLeft, blockUsedAt, grantBlock, blockSpreadAt, blockSpreadActive, blockSpreadScale, BLOCK_SPREAD, BLOCK_BASE, BLOCK_BASE2, buy, priceOf, shopStock, dealOf, openShopAt, floorMonsterCount, floorPickupCount, floorThreat, battleMargin, potionHeal, finish, altarChoices, pickRelic, pathTo, pathThrough, pathToNear, pathsTo,
    nextLevelExp, margin, keyName, summary, accrueActive, ACTIVE_CAP, hasRelic, ownedRelics, beginFloor, restoreFloor, revealCore, heartState, heartTake, heartLeave, vow, pickEvent, eventPool, eventCost, eventShortfall, resolveEvent, applyEffect, jumpTo, visitedMax, gateForth, sealPlan,
    enterTower, canEnterTower, towerClear, towerExit, marks, markBonus, towerById, nextFloorOf, prevFloorOf,
    rings, hasRing, ringBlockScale, zealScale, zealNext, zealNeed, finalLedger, cleanEmber, fightDamage, tangleInfo, bossLine, settleChapter, ringChoices, pendingRing, pickRing,
  };
})();
