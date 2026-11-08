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
      flags: { vow: v },
      ver: 4,
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
      return !!parsed && parsed.ver === 4 && parsed.maps && parsed.maps.length === D.floors.length;
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
      if (!parsed || parsed.ver !== 4 || !parsed.maps || parsed.maps.length !== D.floors.length) return null;
      s = parsed;
      if (!s.flags) s.flags = {};
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
    // 慈悲之誓：往上走一层回 12% 生命（下楼不触发，免得来回刷）
    let heal = 0;
    if (dir > 0 && vow() === 'mercy') {
      heal = Math.min(Math.round((s.maxHp || s.hp) * 0.12), Math.max(0, s.maxHp - s.hp));
      s.hp += heal;
    }
    return { floor: target, x: nx, y: ny, heal };
  }

  function predict(ch) {
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

  function settleFloor() {
    const fe = s.floorEnter;
    if (!s || !fe || fe.floor !== s.floor) return;
    const g = D.floorGoals[s.floor];
    if (!g) return;
    const kills = (s.flags.killCount || 0) - fe.kills;
    const shop = (s.flags.shopCount || 0) - fe.shop;
    let ok = false;
    if (g.type === 'killsMax') ok = kills <= g.v;
    else if (g.type === 'openDoor') ok = !!s.flags['door_f' + s.floor];
    else if (g.type === 'noShop') ok = shop === 0;
    else if (g.type === 'killKind') ok = !!s.flags['kill_' + g.v];
    else if (g.type === 'clear') ok = !floorHasMonster();
    else if (g.type === 'hpAbove') ok = s.hp >= (s.maxHp || 1) * g.v;
    s.flags['goal_' + s.floor] = ok;
    s.flags['goalKills_' + s.floor] = kills;
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
    s.maxHp += 300;
    s.hp += 300;
    if (tile(s.x, s.y) === 'K') setTile(s.x, s.y, '.');
    save();
    return { type: 'heart', choice: 'taken', name: '塔心石', msg: '你带走了塔心石 · 生命上限 +300' };
  }

  function heartLeave() {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    if (s.flags.heart) return { type: 'refuse', msg: '你已经做过决定了' };
    s.flags.heart = 'left';
    save();
    return { type: 'heart', choice: 'left', name: '塔心石', msg: '你把手收了回来 · 石头还在那儿跳' };
  }

  // 塔规达成 5 条以上时，击败魔王后王座后露出窄梯
  function revealCore() {
    if (!s || s.floor !== 5) return false;
    if (goalStatus().done < 5) return false;
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

  // 幽灵按层给对白：第 1 层、第 5 层各一段
  function ghostStory() {
    return ({ 0: 'candle1', 4: 'candle3' })[s.floor] || 'candle1';
  }

  function vow() {
    return (s && s.flags && D.vows[s.flags.vow]) ? s.flags.vow : 'none';
  }

  // 每层一次「格挡」：这一战的承伤降到 60%（铁壁之誓放弃它）
  function canBlock() {
    if (!s || s.over || s.won) return false;
    if (vow() === 'guard') return false;
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
    if (!p.win) return { type: 'refuse', msg: p.reason || '无法战胜' };

    if (m.boss && !s.flags.boss) {
      s.flags.boss = true;
      save();
      return { type: 'story', story: 'boss', dx, dy, prediction: p };
    }

    const blocked = !!(opt && opt.block) && canBlock();
    if (blocked) s.flags['block_f' + s.floor] = true;
    let dmg = p.damage;
    if (vow() === 'guard') dmg = Math.round(dmg * 0.82);
    if (blocked) dmg = Math.round(dmg * 0.6);
    s.hp -= dmg;
    setTile(nx, ny, '.');
    moveTo(nx, ny);
    const goldGain = vow() === 'greed' ? Math.round(m.gold * 1.7) : m.gold;
    s.gold += goldGain;
    s.exp += m.exp;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    s.flags['kill_' + ch] = true;

    let heal = 0;
    if (hasRelic('ember') && !m.boss) {
      heal = Math.min(Math.max(4, Math.floor((s.maxHp || s.hp) * 0.02)), Math.max(0, s.maxHp - s.hp));
      s.hp += heal;
    }
    if (s.floor === D.floors.length - 1 && !floorHasMonster()) s.flags.coreClear = true;
    const ups = levelUp();
    save();
    emit('kill', { name: m.name, boss: !!m.boss });
    return {
      type: 'fight', damage: dmg, raw: p.damage, blocked, rounds: p.rounds,
      gold: goldGain, exp: m.exp, heal, levelUps: ups,
      monster: m, boss: !!m.boss,
    };
  }

  // 价格：成长类每次购买 +20，避免后期金币变无限攻防
  function priceOf(item) {
    if (!s) return item.price;
    const step = item.id === 'atk' || item.id === 'def' ? 20 : 0;
    let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
    if (hasRelic('thrift')) price = Math.max(1, Math.round(price * 0.75));
    if (vow() === 'greed') price = Math.max(1, Math.round(price * 1.3));
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

  function summary() {
    if (!s) return null;
    // 系统时间被往回调整时可能为负：钳到 0，否则会出现「-360 秒」并在评分里反向加分
    const time = Math.max(0, Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000));
    return { ending: s.ending, floor: s.floor + 1, level: s.level, steps: s.steps, time };
  }

  window.Engine = {
    setHooks, newGame, load, reset, hasSave, save, state, tile, predict,
    predictAt(dx, dy) {
      if (!s) return null;
      const ch = tile(s.x + dx, s.y + dy);
      return D.monsters[ch] ? predict(ch) : null;
    },
    tryMove, fight, canBlock, buy, priceOf, finish, altarChoices, pickRelic, pathTo, pathThrough, pathToNear,
    nextLevelExp, keyName, summary, hasRelic, ownedRelics, beginFloor, restoreFloor, goalStatus, settleFloor, revealCore, heartState, heartTake, heartLeave, vow,
  };
})();
