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

  function newGame(vow) {
    const v = D.vows[vow] ? vow : 'none';
    s = {
      floor: 0, x: 1, y: 1,
      hp: 1000, maxHp: 1000, atk: 10, def: 10,
      gold: 0, exp: 0, level: 1,
      keys: { y: 1, r: 0 },
      maps: floorMaps(),
      over: false, won: false, ending: null,
      flags: { vow: v, rings: [], phaseSeed: (Math.random() * 1e9) | 0, echoMarks: 0 },
      ver: 5,
      steps: 0,
      startedAt: Date.now(),
      snap: null,
      floorEnter: null,
    };
    if (v === 'mercy') s.atk = Math.max(1, s.atk - 3);
    
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
      // 旧档里的 echoScore 是加分制，按每 300 分一枚章印折算，不让它凭空消失
      if (typeof s.flags.echoMarks !== 'number') {
        s.flags.echoMarks = Math.round((s.flags.echoScore || 0) / 300);
        delete s.flags.echoScore;
      }
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
  const ringBlockScale = () => (hasRing('parry') ? 0.5 : 0.6);

  // 战斗的「真实承伤」：格挡、誓约、锁环都在这里算一次，演出与结算共用同一份
  function fightDamage(ch, blocked) {
    const p = predict(ch);
    if (!p || p.damage === null) return null;
    const m = D.monsters[ch];
    let dmg = p.damage;
    if (vow() === 'guard') dmg = Math.round(dmg * 0.82);
    if (hasRing('ward2')) dmg = Math.round(dmg * 0.94);
    if (hasRing('bell') && m && m.boss) dmg = Math.round(dmg * 0.92);
    if (blocked) dmg = Math.round(dmg * ringBlockScale());
    return { damage: dmg, raw: p.damage, per: p.per, rounds: p.rounds, out: p.out, blockScale: blocked ? ringBlockScale() : 1 };
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

  // 章末结算：三条塔规定成绩；≥2 条才开锁环三选一
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
    const last = meta.to - 1;
    // Boss 刚倒下时的血量就是这一章的最终血量：提前结算章末层并锁住，避免之后吃药改判
    settleFloor();
    if (s.floor === last) s.flags['goalLocked_' + last] = true;
    const list = [];
    for (let i = meta.from - 1; i <= last; i++) {
      list.push({ floor: i, text: D.floorGoals[i] ? D.floorGoals[i].text : '', done: !!s.flags['goal_' + i] });
    }
    const done = list.filter((x) => x.done).length;
    // 章印：一章三条规矩做到两条以上就留一枚，是塔印与余烬的依据，不再是加分
    const marks = done >= 2 ? 1 : 0;
    if (s.flags['echo_' + ch] === undefined) {
      s.flags.echoMarks = (s.flags.echoMarks || 0) + marks;
      s.flags['echoMark_' + ch] = marks;
      s.flags['echo_' + ch] = done;
    }
    const pending = done >= 2 && !hasRingChapter(ch) && !s.flags['ringDone_' + ch];
    if (pending && !s.flags['ringChoices_' + ch]) s.flags['ringChoices_' + ch] = ringChoices(ch);
    if (pending) s.flags['ringPending_' + ch] = true;
    save();
    return {
      chapter: ch, title: meta.title, theme: meta.theme, color: meta.color,
      list, done, marks, pending,
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

  function moveTo(x, y) { s.x = x; s.y = y; s.steps++; }

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
    settleFloor();
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
    // 慈悲之誓：往上走一层回 12% 生命（下楼不触发，免得来回刷）
    let heal = 0;
    const gain = (pct) => {
      const v = Math.min(Math.round((s.maxHp || s.hp) * pct), Math.max(0, s.maxHp - s.hp));
      s.hp += v; heal += v;
    };
    if (dir > 0 && vow() === 'mercy') gain(0.12);
    // 苦行 / 无名：没有格挡，但每上一层塔会补给你 10% 生命
    if (dir > 0 && (vow() === 'ascetic' || vow() === 'nameless')) gain(0.10);
    // 锁环「借灯 / 回廊 / 长明」：只在往上走时生效，跳层不回血，防止来回刷
    if (dir > 0) {
      const pct = (hasRing('lamp') ? 0.05 : 0) + (hasRing('stair') ? 0.04 : 0) + (hasRing('lamp2') ? 0.04 : 0);
      if (pct > 0) gain(pct);
    }
    return { floor: target, x: nx, y: ny, heal };
  }

  function predict(ch) {
    return predictBase(ch);
  }

  // 基础预测（不含格挡视角）
  function predictBase(ch) {
    const m = D.monsters[ch];
    if (!m || m.ghost) return null;
    const out = s.atk - m.def;
    if (out <= 0) return { win: false, reason: '攻击力不足，无法破防', damage: null, rounds: null, m };
    const rounds = Math.ceil(m.hp / out);
    const per = Math.max(0, m.atk - s.def);
    let damage = (rounds - 1) * per; // 先手：最后一击不会挨打
    if (damage > 0 && hasRelic('ward')) damage = Math.max(1, Math.floor(damage * 0.88));
    return {
      win: s.hp > damage,
      reason: s.hp > damage ? '' : '生命不足，这场战斗会要你的命',
      damage, rounds, per, out, m,
    };
  }

  // 带格挡视角的预测：残血玩家可以用"这一层还没用过的格挡"换命——
  // 以前 win 判定不含格挡，会被"这场战斗会要你的命"拦住，玩家明明算得出活路
  function predictOpt(ch, allowBlock) {
    const p = predictBase(ch);
    if (!p || p.damage === null || p.win) return p;
    if (allowBlock && canBlock()) {
      const b = fightDamage(ch, true);
      if (b && s.hp > b.damage) {
        return Object.assign({}, p, { win: true, reason: '', blockSave: true, blockDamage: b.damage });
      }
    }
    return p;
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
      s.hp += it.value;
      if (s.hp > s.maxHp) s.maxHp = s.hp;
      return { type: 'pickup', msg: `拾取${it.name}，生命 +${it.value}`, short: `+${it.value}❤`, good: true };
    }
    if (it.type === 'atk') { s.atk += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击 +${it.value}`, short: `+${it.value}⚔`, good: true }; }
    if (it.type === 'def') { s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，防御 +${it.value}`, short: `+${it.value}🛡`, good: true }; }
    if (it.type === 'both') { s.atk += it.value; s.def += it.value; return { type: 'pickup', msg: `拾取${it.name}，攻击/防御 +${it.value}`, short: `+${it.value}/+${it.value}`, good: true }; }
    if (it.type === 'key') { s.keys[it.key]++; return { type: 'pickup', msg: `拾取${it.name}`, short: '+钥匙', good: true }; }
    return null;
  }

  function finish(ending) {
    settleFloor();
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

  // ---------- 每层的「规矩」 ----------
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

  function goalResult(g, kills, shop) {
    if (g.type === 'killsMax') return kills <= g.v;
    if (g.type === 'openDoor') return !!s.flags['door_f' + s.floor];
    if (g.type === 'noShop') return shop === 0;
    if (g.type === 'killKind') return !!s.flags['kill_' + g.v];
    if (g.type === 'clear') return !floorHasMonster();
    if (g.type === 'hpAbove') return s.hp >= (s.maxHp || 1) * g.v;
    return false;
  }

  function settleFloor() {
    if (!s) return;
    const fe = s.floorEnter;
    if (!fe || fe.floor !== s.floor) return;
    // 章末层在 Boss 倒下时已提前结算并锁住，之后吃药/清怪不再改判
    if (s.flags['goalLocked_' + s.floor]) return;
    const g = D.floorGoals[s.floor];
    if (!g) return;
    const kills = (s.flags.killCount || 0) - fe.kills;
    const shop = (s.flags.shopCount || 0) - fe.shop;
    s.flags['goal_' + s.floor] = goalResult(g, kills, shop);
    s.flags['goalKills_' + s.floor] = kills;
  }

  // HUD 实时显示「本层规矩」是否达成（只读，不写档）
  function goalPreview() {
    if (!s) return null;
    const g = D.floorGoals[s.floor];
    if (!g) return null;
    if (s.flags['goalLocked_' + s.floor]) {
      return { text: g.text, ok: !!s.flags['goal_' + s.floor], locked: true };
    }
    const fe = s.floorEnter;
    if (!fe || fe.floor !== s.floor) return { text: g.text, ok: false, locked: false };
    const kills = (s.flags.killCount || 0) - fe.kills;
    const shop = (s.flags.shopCount || 0) - fe.shop;
    return { text: g.text, ok: goalResult(g, kills, shop), locked: false };
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
    settleFloor();
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
    s.flags['ev_f' + s.floor] = true;
    if (tile(s.x, s.y) === '?') setTile(s.x, s.y, '.');
    save();
    return { type: 'event', msg: o.msg, label: o.label };
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

  // 塔规达成 8 条以上时，击败衡后塔顶露出窄梯
  function revealCore() {
    if (!s) return false;
    const f = D.floors[s.floor];
    if (!f || !f.hiddenGate) return false;
    if (!s.flags.bossKilled_U) return false;
    settleFloor();
    const need = hasRing('seventh') ? 7 : 8;
    if (goalStatus().done < need) return false;
    if (tile(9, 2) === 'u') return true;
    setTile(9, 2, 'u');
    save();
    return true;
  }

  function goalStatus() {
    const list = D.floorGoals.map((g, i) => ({
      floor: i,
      text: g.text,
      done: !!(s && s.flags['goal_' + i]),
    }));
    return { list, done: list.filter((x) => x.done).length, total: list.length };
  }

  // 幽灵按层给对白：第 1、5、7、11 层各一段
  function ghostStory() {
    return ({ 0: 'candle1', 4: 'candle3', 6: 'candle4', 10: 'candle5' })[s.floor] || 'candle1';
  }

  function vow() {
    return (s && s.flags && D.vows[s.flags.vow]) ? s.flags.vow : 'none';
  }

  // 每层一次「格挡」：这一战的承伤降到 60%（铁壁之誓放弃它）
  function canBlock() {
    if (!s || s.over || s.won) return false;
    if (vow() === 'guard' || vow() === 'ascetic' || vow() === 'nameless') return false;
    return !s.flags['block_f' + s.floor];
  }

  function fight(dx, dy, opt) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    const ch = tile(nx, ny);
    const m = D.monsters[ch];
    if (!m || m.ghost) return { type: 'idle' };
    const p = predict(ch);
    // 残血换命：请求格挡、且挡完能活时放行（与 predictOpt 的口径一致）
    let allowed = p.win;
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
    const dmg = fightDamage(ch, blocked).damage;
    s.hp -= dmg;
    setTile(nx, ny, '.');
    moveTo(nx, ny);
    const goldGain = vow() === 'greed' ? Math.round(m.gold * 1.7) : m.gold;
    s.gold += goldGain;
    s.exp += m.exp;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    s.flags['kill_' + ch] = true;
    let echo = null;
    if (m.boss) {
      s.flags['bossKilled_' + ch] = true;
      if (ch === 'Z') s.flags.bossKilled = true;
      if (m.chapter) {
        s.flags['chap_' + m.chapter] = true;
        echo = settleChapter(m.chapter);
      }
      if (m.finalBoss) s.flags.finalBossKilled = true;
    }

    let heal = 0;
    if (!m.boss) {
      if (hasRelic('ember')) {
        const h = Math.min(Math.max(4, Math.floor((s.maxHp || s.hp) * 0.02)), Math.max(0, s.maxHp - s.hp));
        s.hp += h; heal += h;
      }
      if (hasRing('cinder')) {
        const h = Math.min(Math.max(3, Math.floor((s.maxHp || s.hp) * 0.01)), Math.max(0, s.maxHp - s.hp));
        s.hp += h; heal += h;
      }
    }
    if (s.floor === D.floors.length - 1 && !floorHasMonster()) s.flags.coreClear = true;
    const ups = levelUp();
    save();
    emit('kill', { name: m.name, boss: !!m.boss });
    return {
      type: 'fight', damage: dmg, raw: p.damage, blocked, rounds: p.rounds,
      gold: goldGain, exp: m.exp, heal, levelUps: ups,
      monster: m, boss: !!m.boss, chapter: m.chapter || 0,
      after: m.after || null, finalBoss: !!m.finalBoss, echo,
    };
  }

  // 价格：成长类每次购买 +20，避免后期金币变无限攻防
  function priceOf(item) {
    if (!s) return item.price;
    const step = item.id === 'atk' || item.id === 'def' ? 20 : 0;
    let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
    if (hasRelic('thrift')) price = Math.max(1, Math.round(price * 0.75));
    if (hasRing('thrift2')) price = Math.max(1, Math.round(price * 0.85));
    if (vow() === 'greed') price = Math.max(1, Math.round(price * 1.3));
    if (vow() === 'nameless') price = Math.max(1, Math.round(price * 1.4));
    return price;
  }

  function buy(id) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    const item = D.shop.find((x) => x.id === id);
    if (!item) return { type: 'refuse', msg: '商品不存在' };
    if (item.codex && s.flags.codex) return { type: 'refuse', msg: '已经拥有窥探之镜' };
    if (item.relic && hasRelic(item.relic)) return { type: 'refuse', msg: '这条灯芯已经在你胸口了' };
    const price = priceOf(item);
    if (s.gold < price) return { type: 'refuse', msg: '金币不够' };
    s.gold -= price;
    s.flags['buy_' + item.id] = (s.flags['buy_' + item.id] || 0) + 1;
    if (item.key) s.keys[item.key]++;
    if (item.hp) {
      s.hp += item.hp;
      if (s.hp > s.maxHp) s.maxHp = s.hp;
    }
    if (item.atk) s.atk += item.atk;
    if (item.def) s.def += item.def;
    if (item.relic) s.flags['relic_' + item.relic] = true;
    if (item.codex) s.flags.codex = true;
    s.flags.shopCount = (s.flags.shopCount || 0) + 1;
    save();
    const msg = item.codex
      ? '获得「窥探之镜」：怪物情报已解锁'
      : item.relic
        ? `获得遗物「${item.name}」· ${D.relics[item.relic].desc}`
        : `购买了${item.name}`;
    return { type: 'buy', item, price, msg };
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
    if (ch === '#') return false;
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
    if (targetCh === '#' || D.monsters[targetCh]) return null;
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
    if (targetCh === '#' || D.monsters[targetCh]) return null;
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
    setHooks, newGame, load, reset, hasSave, save, state, tile, predict, predictOpt,
    predictAt(dx, dy) {
      if (!s) return null;
      const ch = tile(s.x + dx, s.y + dy);
      return D.monsters[ch] ? predict(ch) : null;
    },
    tryMove, fight, canBlock, buy, priceOf, finish, altarChoices, pickRelic, pathTo, pathThrough, pathToNear, pathsTo,
    nextLevelExp, keyName, summary, hasRelic, ownedRelics, beginFloor, restoreFloor, goalStatus, settleFloor, goalPreview, revealCore, heartState, heartTake, heartLeave, vow, pickEvent, eventPool, eventCost, resolveEvent, applyEffect, jumpTo, visitedMax, gateForth, sealPlan,
    rings, hasRing, ringBlockScale, fightDamage, bossPhases, settleChapter, ringChoices, pendingRing, pickRing,
  };
})();
