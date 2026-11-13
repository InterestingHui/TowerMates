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

  function setHooks(h) { hooks = h || {}; }
  function emit(type, payload) { if (hooks.onEvent) hooks.onEvent(type, payload); }

  const floorMaps = () => D.floors.map((f) => f.map.map((row) => row.split('')));

  // ---------- 开局微变（P-A / 打 S-D1「前 3 层每局逐格相同」）----------
  // 只挪第 1 层「散落的拾取物」（红药水 / 金币），地图骨架、怪物、门、总道具量全部不动：
  // 改的是「先走哪边、先捡什么」，第二局开局不再是逐格照抄已知解，且不碰任何数值。
  // 种子 0 = 保持原版布局（需要可复现读数的工具场景用它要回原图）。
  const FLOOR1_FREE = ['p', '$'];
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffleFloor1(map, seed) {
    if (!seed || !map) return false;
    // 起点周围 3×3 保持原样：开局 60 秒的教学节奏（教练卡→首战）不跟着变
    let sx = 1, sy = 1;
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
        if (FLOOR1_FREE.indexOf(map[y][x]) >= 0) from.push({ x: x, y: y, ch: map[y][x] });
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

  function newGame(vow, opts) {
    const v = D.vows[vow] ? vow : 'none';
    const mapSeed = opts && typeof opts.seed === 'number' ? opts.seed : (Math.random() * 1e9) | 0;
    s = {
      floor: 0, x: 1, y: 1,
      hp: 1000, maxHp: 1000, atk: 10, def: 10,
      gold: 0, exp: 0, level: 1,
      keys: { y: 1, r: 0 },
      maps: floorMaps(),
      over: false, won: false, ending: null,
      flags: { vow: v, rings: [], phaseSeed: (Math.random() * 1e9) | 0, hasBlock: false, mapSeed: mapSeed },
      ver: 5,
      steps: 0,
      startedAt: Date.now(),
      snap: null,
      floorEnter: null,
    };
    if (v === 'mercy') s.atk = Math.max(1, s.atk - 3);
    shuffleFloor1(s.maps[0], mapSeed);
    
    const map = s.maps[0];
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === '@') { s.x = x; s.y = y; map[y][x] = '.'; break outer; }
      }
    }
    save();
    emit('newgame');
    return s;
  }

  function hasSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return !!parsed && parsed.ver === 5 && parsed.maps && parsed.maps.length === D.floors.length;
    } catch (e) { return false; }
  }

  // ---------- 存档：save() 立即落盘；移动用 saveSoon() 节流 ----------
  function persist() {
    if (!s) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function save() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    persist();
  }
  function saveSoon() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; persist(); }, 350);
  }

  function load(key) {
    try {
      const raw = localStorage.getItem(key || SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // 旧版本的存档（地图里没有遗物格）一律作废，避免读到半新半旧的世界
      if (!parsed || parsed.ver !== 5 || !parsed.maps || parsed.maps.length !== D.floors.length) return null;
      s = parsed;
      if (!s.flags) s.flags = {};
      // v2.1 新增字段：老存档补齐默认值即可继续玩，不需要作废
      if (!Array.isArray(s.flags.rings)) s.flags.rings = [];
      if (typeof s.flags.phaseSeed !== 'number') s.flags.phaseSeed = (Math.random() * 1e9) | 0;
      // 格挡改为「要学」的能力：老档也按新规，缺字段即未学会（回第 2 层捡盾谱 / 第 3 层买）
      if (typeof s.flags.hasBlock !== 'boolean') s.flags.hasBlock = false;
      if (typeof s.flags.eventEmber !== 'number') s.flags.eventEmber = 0;
      if (!s.ending) s.ending = null;
      if (s.keys && s.keys.b !== undefined) { s.keys.r = (s.keys.r || 0) + (s.keys.b || 0); delete s.keys.b; }
      if (!s.keys) s.keys = { y: 0, r: 0 };
      if (!s.maxHp) s.maxHp = Math.max(s.hp, 1000);
      if (!s.snap) s.snap = null;
      if (!s.steps) s.steps = 0;
      if (!s.startedAt) s.startedAt = Date.now();
      return s;
    } catch (e) { return null; }
  }

  function reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) {}
    s = null;
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
  const ringBlockScale = () => {
    const base = s && s.flags.hasBlock2 ? 0.42 : 0.55;
    return hasRing('parry') ? base - 0.1 : base;
  };
  // 后半部学到手：格挡反击——挡下的那场，被卸掉的伤的三成化为经验
  const blockRiposte = () => !!(s && s.flags.hasBlock2);

  // 战意：打得越多越懂碑魔。只在最终决战生效，是「清塔路线」的独占收益——
  // 绕路省血、清塔减伤，两条路都能走到 S，但走法不同。普通怪/章节 Boss 不吃这个。
  function zealScale(m) {
    if (!m || !m.finalBoss || !s) return 1;
    const k = s.flags.killCount || 0;
    return k >= 40 ? 0.64 : k >= 25 ? 0.84 : 1;
  }

  // 战斗的「真实承伤」：格挡、誓约、锁环都在这里算一次，演出与结算共用同一份
  function fightDamage(ch, blocked) {
    const p = predict(ch);
    if (!p || p.damage === null) return null;
    const m = D.monsters[ch];
    let dmg = p.damage;
    if (vow() === 'guard') dmg = Math.round(dmg * 1.18);
    if (hasRing('ward2')) dmg = Math.round(dmg * 0.94);
    if (hasRing('bell') && m && m.boss) dmg = Math.round(dmg * 0.85);
    if (blocked) dmg = Math.round(dmg * ringBlockScale());
    const zeal = zealScale(m);
    if (zeal < 1) dmg = Math.round(dmg * zeal);
    return { damage: dmg, raw: p.damage, per: p.per, rounds: p.rounds, out: p.out, blockScale: blocked ? ringBlockScale() : 1, zeal };
  }

  // 每局从 Boss 的两个台词池各抽一段；结果写进存档，同一局重进战斗不会变
  function bossPhases(ch) {
    if (!s) return null;
    const key = 'phases_' + ch;
    if (s.flags[key]) return s.flags[key];
    const m = D.monsters[ch];
    if (!m) return null;
    if (!m.phasePool) return m.phases || null;
    const seed = (s.flags.phaseSeed || 1) + ch.charCodeAt(0) * 7919;
    const pool = m.phasePool;
    const picked = [
      pool.p2[Math.abs(seed) % pool.p2.length],
      pool.p3[Math.abs(seed >> 3) % pool.p3.length],
    ];
    s.flags[key] = picked;
    save();
    return picked;
  }

  // 章末回响：击败 Boss 必得，直接开锁环三选一（塔规已移除，不再设门槛）
  function ringChoices(ch) {
    const owned = rings();
    const pool = (D.ringPools[ch] || []).filter((id) => owned.indexOf(id) < 0);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, 3);
  }

  function settleChapter(ch) {
    if (!s || !D.chapters[ch - 1]) return null;
    const meta = D.chapters[ch - 1];
    const pending = !hasRingChapter(ch) && !s.flags['ringDone_' + ch];
    if (pending && !s.flags['ringChoices_' + ch]) s.flags['ringChoices_' + ch] = ringChoices(ch);
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
      if (s.flags['ringPending_' + ch]) return ch;
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

  function changeFloor(dir) {
    const target = s.floor + dir;
    if (target < 0 || target >= D.floors.length) return null;
    s.floor = target;
    const map = s.maps[target];
    const mark = dir > 0 ? 'n' : 'u';
    let nx = s.x, ny = s.y;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === mark) { nx = x; ny = y; y = SIZE; break; }
      }
    }
    s.x = nx; s.y = ny;
    s.flags.maxFloor = Math.max(s.flags.maxFloor || 0, target);
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
    // 苦行 / 无名：没有格挡，但每上一层塔会补给你 10% 生命
    if (dir > 0 && firstVisit && (vow() === 'ascetic' || vow() === 'nameless')) gain(0.10);
    // 锁环「借灯 / 回廊 / 长明」：只在往上走时生效，跳层不回血，防止来回刷
    if (dir > 0 && firstVisit) {
      const pct = (hasRing('lamp') ? 0.05 : 0) + (hasRing('stair') ? 0.04 : 0) + (hasRing('lamp2') ? 0.04 : 0);
      if (pct > 0) gain(pct);
    }
    // 基石之环：残血进新层才触发（30% 以下回 15%），是「救命」不是「续航」，与借灯类不冲突
    if (dir > 0 && firstVisit && hasRing('bulwark') && s.maxHp > 0 && s.hp / s.maxHp < 0.3) gain(0.15);
    return { floor: target, x: nx, y: ny, heal };
  }

  function predict(ch) {
    return predictBase(ch);
  }

  // 基础预测（不含格挡视角）
  // 怪物特性：first 先攻 / magic 魔攻 / double 连击 / solid 坚固
  // 这四种属性决定「该加攻还是该加防」——魔塔数值解谜的核心
  function predictBase(ch) {
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
    const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
    let damage = hits * per;
    if (damage > 0 && hasRelic('ward')) damage = Math.max(1, Math.floor(damage * 0.88));
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
    if (it.type === 'atk') { s.atk += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击 +${it.value}`, short: `+${it.value}⚔`, good: true }; }
    if (it.type === 'def') { s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，防御 +${it.value}`, short: `+${it.value}🛡`, good: true }; }
    if (it.type === 'both') { s.atk += it.value; s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击/防御 +${it.value}`, short: `+${it.value}/+${it.value}`, good: true }; }
    if (it.type === 'key') { s.keys[it.key]++; return { type: 'pickup', msg: `拾取${it.name}`, short: '+钥匙', good: true }; }
    if (it.type === 'block') {
      // 禁格挡的三条誓约：读了也学不会，东西不消失，留个明确说法
      if (vowForbidsBlock()) return { type: 'pickup', msg: '盾谱上的招式，这条誓约不许你用', short: '不能格挡', good: false };
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
      return { type: 'floor', msg: `来到第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}`, dir: ch === 'u' ? 1 : -1, at: r };
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
  function visitedMax() {
    if (!s) return 0;
    return Math.max(s.flags.maxFloor || 0, s.floor);
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
    const target = visitedMax() + 1;
    if (target >= D.floors.length) return { ok: false, msg: '前面已经没有楼层了' };
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
    if (pos) { s.x = pos.x; s.y = pos.y; }
    save();
    const sealMsg = sealed.length
      ? ` · 封住了${sealed.map((x) => x.name).join('、')}`
      : '';
    return {
      type: 'floor', dir: 0, jump: true, forth: !!forth,
      sealed: sealed.map((x) => x.name),
      msg: `层阶之钥：第 ${target + 1} 层 · ${D.floors[target].name}${sealMsg}`,
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
    return pool[(Math.random() * pool.length) | 0].id;
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
  }

  // 选项的"付不起"判定：金币或钥匙不足时返回原因
  function eventCost(o) {
    if (!o || !o.effect) return null;
    if (o.effect.gold && o.effect.gold < 0 && s.gold < -o.effect.gold) return '金币不够';
    if (o.effect.keys) {
      for (const k of Object.keys(o.effect.keys)) {
        if (o.effect.keys[k] < 0 && (s.keys[k] || 0) < -o.effect.keys[k]) return '钥匙不够';
      }
    }
    return null;
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
  function canBlock() {
    if (!s || s.over || s.won) return false;
    if (!s.flags.hasBlock) return false;
    if (vow() === 'guard' || vow() === 'ascetic' || vow() === 'nameless') return false;
    return !s.flags['block_f' + s.floor];
  }

  // 授予格挡（三路获取的统一出口）：已学过时安静返回，不重复发
  function grantBlock() {
    if (!s) return false;
    if (s.flags.hasBlock) return false;
    s.flags.hasBlock = true;
    save();
    return true;
  }

  // 铁壁 / 苦行 / 无名三条誓约写明「不能格挡」：给它们一个共用的判定，
  // 商店和拾取都靠它，免得玩家花钱买了用不上的盾谱
  function vowForbidsBlock() {
    return vow() === 'guard' || vow() === 'ascetic' || vow() === 'nameless';
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
    const fdPlain = fightDamage(ch, false);
    let allowed = !!(fdPlain && s.hp > fdPlain.damage);
    if (!allowed && opt && opt.block && canBlock()) {
      const b = fightDamage(ch, true);
      allowed = !!(b && s.hp > b.damage);
    }
    if (!allowed) return { type: 'refuse', msg: p.reason || '无法战胜' };

    if (m.boss && !s.flags['boss_seen_' + ch]) {
      s.flags['boss_seen_' + ch] = true;
      save();
      return { type: 'story', story: m.story || 'boss', dx, dy, prediction: p };
    }

    const blocked = !!(opt && opt.block) && canBlock();
    if (blocked) s.flags['block_f' + s.floor] = true;
    const fd = fightDamage(ch, blocked);
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
    s.exp += m.exp;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    s.flags['kill_' + ch] = true;
    // 刻痕之环：每 8 只怪额外一把黄钥匙（按累计击杀数走 8 的倍数）
    let tallyKey = false;
    if (hasRing('tally') && s.flags.killCount % 8 === 0) { s.keys.y++; tallyKey = true; }
    let echo = null;
    let tomeKey = false;
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
    }

    let heal = 0;
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
    if (s.floor === D.floors.length - 1 && !floorHasMonster()) s.flags.coreClear = true;
    const ups = levelUp();
    save();
    emit('kill', { name: m.name, boss: !!m.boss });
    return {
      type: 'fight', damage: dmg, raw: p.damage, blocked, rounds: p.rounds,
      gold: goldGain, exp: m.exp, heal, levelUps: ups, riposte,
      monster: m, boss: !!m.boss, chapter: m.chapter || 0,
      after: m.after || null, finalBoss: !!m.finalBoss, echo,
      tallyKey, tomeKey,
    };
  }

  // 价格：可重复商品每次购买后涨价 item.step（越买越贵）；once 商品固定价
  function priceOf(item) {
    if (!s) return item.price;
    const step = (hasRing('chain') && (item.id === 'atk' || item.id === 'def')) ? 0 : (item.step || 0);
    let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
    if (hasRelic('thrift')) price = Math.max(1, Math.round(price * 0.75));
    if (hasRing('thrift2')) price = Math.max(1, Math.round(price * 0.75));
    // 秤砣之环（bargain）：钥匙价目再 −25%（只影响钥匙，药水与训练照旧）
    if (item.key && hasRing('bargain')) price = Math.max(1, Math.round(price * 0.5));
    if (vow() === 'greed') price = Math.max(1, Math.round(price * 1.45));
    if (vow() === 'nameless') price = Math.max(1, Math.round(price * 1.4));
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
    if (item.relic && hasRelic(item.relic)) return { type: 'refuse', msg: '这条灯芯已经在你胸口了' };
    if (item.block && s.flags.hasBlock) return { type: 'refuse', msg: '你已经学过格挡了' };
    if (item.block && vowForbidsBlock()) return { type: 'refuse', msg: '这条誓约不能格挡，买它没用' };
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
      ? '获得「窥探之镜」：怪物情报已解锁'
      : item.relic
        ? `获得遗物「${item.name}」· ${D.relics[item.relic].desc}`
        : item.block
          ? '秤把盾谱后半卷摊开：「学不会就再来。」——你学会了**格挡**'
          : item.heartShard
            ? '秤用绒布包起那枚碎片：「塔的心跳，带一点出去也无妨。」——通关时它会化为余烬'
            : `购买了${item.name}`;
    return { type: 'buy', item, price, healed, msg };
  }

  // ---------- 祭坛：前八位勇者的行李，三选一 ----------
  function altarChoices(count) {
    if (!s) return [];
    const pool = D.altarPool.filter((id) => !hasRelic(id));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
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

  function summary() {
    if (!s) return null;
    // 系统时间被往回调整时可能为负：钳到 0，否则会出现「-360 秒」并把通关用时写坏
    const time = Math.max(0, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000));
    return { ending: s.ending, floor: s.floor + 1, level: s.level, steps: s.steps, time };
  }

  window.Engine = {
    setHooks, newGame, load, reset, hasSave, save, state, tile, predict, predictOpt, shuffleFloor1,
    predictAt(dx, dy) {
      if (!s) return null;
      const ch = tile(s.x + dx, s.y + dy);
      return D.monsters[ch] ? predict(ch) : null;
    },
    tryMove, fight, canBlock, grantBlock, vowForbidsBlock, buy, priceOf, shopStock, floorMonsterCount, floorPickupCount, battleMargin, potionHeal, finish, altarChoices, pickRelic, pathTo, pathThrough, pathToNear, pathsTo,
    nextLevelExp, margin, keyName, summary, hasRelic, ownedRelics, beginFloor, restoreFloor, revealCore, heartState, heartTake, heartLeave, vow, pickEvent, eventPool, eventCost, resolveEvent, applyEffect, jumpTo, visitedMax, gateForth, sealPlan,
    rings, hasRing, ringBlockScale, zealScale, fightDamage, bossPhases, settleChapter, ringChoices, pendingRing, pickRing,
  };
})();
