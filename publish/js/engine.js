// TowerMates · 魔塔原型 —— 核心逻辑（不依赖 DOM，可在 Node 里跑平衡性模拟）
(function () {
  const D = window.GAME_DATA;
  const SAVE_KEY = 'towermates_save_v2';
  const SIZE = 11;

  let s = null;
  let hooks = {}; // UI 钩子：onEvent(type, payload)

  function setHooks(h) {
    hooks = h || {};
  }
  function emit(type, payload) {
    if (hooks.onEvent) hooks.onEvent(type, payload);
  }

  const floorMaps = () => D.floors.map((f) => f.map.map((row) => row.split('')));

  function newGame() {
    s = {
      floor: 0,
      x: 1,
      y: 1,
      hp: 1000,
      atk: 10,
      def: 10,
      gold: 0,
      exp: 0,
      level: 1,
      keys: { y: 1, b: 0, r: 0 },
      maps: floorMaps(),
      over: false,
      won: false,
      ending: null, // 'plain' | 'true'
      flags: {},    // 剧情标记：candle1/candle2/candle3/journal/boss/…/shopCount/killCount
      steps: 0,
      startedAt: Date.now(),
    };
    const map = s.maps[0];
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === '@') {
          s.x = x;
          s.y = y;
          map[y][x] = '.';
          break outer;
        }
      }
    }
    save();
    emit('newgame');
    return s;
  }

  function hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch (e) {
      return false;
    }
  }

  function save() {
    if (!s) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch (e) {}
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.maps || parsed.maps.length !== D.floors.length) return null;
      s = parsed;
      if (!s.flags) s.flags = {};
      if (!s.ending) s.ending = null;
      return s;
    } catch (e) {
      return null;
    }
  }

  function reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {}
    s = null;
  }

  const state = () => s;
  const tile = (x, y) => (s && s.maps[s.floor][y] ? s.maps[s.floor][y][x] : '#');
  const setTile = (x, y, ch) => {
    s.maps[s.floor][y][x] = ch;
  };

  function keyName(k) {
    return k === 'y' ? '黄钥匙' : k === 'b' ? '蓝钥匙' : '红钥匙';
  }

  function moveTo(x, y) {
    s.x = x;
    s.y = y;
    s.steps++;
  }

  // 换层；返回 { floor, x, y }
  function changeFloor(dir) {
    const target = s.floor + dir;
    if (target < 0 || target >= D.floors.length) return null;
    s.floor = target;
    const map = s.maps[target];
    const mark = dir > 0 ? 'n' : 'u';
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === mark) {
          s.x = x;
          s.y = y;
          return { floor: target, x, y };
        }
      }
    }
    return { floor: target, x: s.x, y: s.y };
  }

  function predict(ch) {
    const m = D.monsters[ch];
    if (!m || m.ghost) return null;
    const out = s.atk - m.def;
    if (out <= 0) {
      return { win: false, reason: '攻击力不足，无法破防', damage: null, rounds: null, m };
    }
    const rounds = Math.ceil(m.hp / out);
    const per = Math.max(0, m.atk - s.def);
    const damage = (rounds - 1) * per; // 先手：最后一击不会挨打
    return {
      win: s.hp > damage,
      reason: s.hp > damage ? '' : '生命不足，这场战斗会要你的命',
      damage,
      rounds,
      per,
      out,
      m,
    };
  }

  function levelUp() {
    let ups = 0;
    while (s.level < D.levelExp.length + 1 && s.exp >= D.levelExp[s.level - 1]) {
      s.level++;
      s.atk += 3;
      s.def += 3;
      s.hp += 150;
      ups++;
    }
    return ups;
  }

  function pickup(ch) {
    if (ch === '$') {
      s.gold += 50;
      return { type: 'pickup', msg: '拾取金币 ×50', good: true };
    }
    const it = D.items[ch];
    if (!it) return null;
    if (it.type === 'story') {
      // 剧情道具：工匠手记
      if (!s.flags.journal) s.flags.journal = true;
      return { type: 'story', story: 'journal', msg: '拾取了一本泛黄的手记', good: true };
    }
    if (it.type === 'hp') {
      s.hp += it.value;
      return { type: 'pickup', msg: `拾取${it.name}，生命 +${it.value}`, good: true };
    }
    if (it.type === 'atk') {
      s.atk += it.value;
      return { type: 'pickup', msg: `拾取${it.name}，攻击 +${it.value}`, good: true };
    }
    if (it.type === 'def') {
      s.def += it.value;
      return { type: 'pickup', msg: `拾取${it.name}，防御 +${it.value}`, good: true };
    }
    if (it.type === 'both') {
      s.atk += it.value;
      s.def += it.value;
      return { type: 'pickup', msg: `拾取${it.name}，攻击/防御 +${it.value}`, good: true };
    }
    if (it.type === 'key') {
      s.keys[it.key]++;
      return { type: 'pickup', msg: `拾取${it.name}`, good: true };
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

    if (D.monsters[ch]) {
      const m = D.monsters[ch];
      if (m.ghost) {
        // 剧情幽灵：站上去触发对白，不战斗
        setTile(nx, ny, '.');
        moveTo(nx, ny);
        save();
        return { type: 'story', story: m.storyKey || ghostStory(ch), good: true };
      }
      return { type: 'battle', ch, dx, dy, prediction: predict(ch) };
    }

    if (ch === 'y' || ch === 'b' || ch === 'r') {
      if (s.keys[ch] > 0) {
        s.keys[ch]--;
        setTile(nx, ny, '.');
        moveTo(nx, ny);
        save();
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
      const hasJournal = !!s.flags.journal;
      finish(hasJournal ? 'true' : 'plain');
      return { type: 'princess', hasJournal };
    }

    if (ch === 'M') {
      moveTo(nx, ny);
      save();
      return { type: 'shop' };
    }

    if (ch === '.') {
      moveTo(nx, ny);
      save();
      return { type: 'move' };
    }

    // 道具
    moveTo(nx, ny);
    const res = pickup(ch);
    if (res) {
      setTile(nx, ny, '.');
      save();
      if (res.type === 'story') emit('story', res.story);
      return res;
    }
    save();
    return { type: 'move' };
  }

  function ghostStory(ch) {
    // 幽灵所在层决定对白段
    return 'candle' + (ch === 'G' ? (s.floor === 0 ? 1 : s.floor === 3 ? 2 : 3) : 1);
  }

  function fight(dx, dy) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    const ch = tile(nx, ny);
    const m = D.monsters[ch];
    if (!m || m.ghost) return { type: 'idle' };
    const p = predict(ch);
    if (!p.win) return { type: 'refuse', msg: p.reason || '无法战胜' };

    // 首次挑战魔王：先触发战前对白，地图与玩家位置都不动
    if (m.boss && !s.flags.boss) {
      s.flags.boss = true;
      save();
      return { type: 'story', story: 'boss', dx, dy, prediction: p };
    }

    s.hp -= p.damage;
    setTile(nx, ny, '.');
    moveTo(nx, ny);
    s.gold += m.gold;
    s.exp += m.exp;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    const ups = levelUp();
    save();
    emit('kill', { name: m.name, boss: !!m.boss });
    return {
      type: 'fight',
      damage: p.damage,
      rounds: p.rounds,
      gold: m.gold,
      exp: m.exp,
      levelUps: ups,
      monster: m,
      boss: !!m.boss,
    };
  }

  function buy(id) {
    if (!s) return { type: 'refuse', msg: '没有进行游戏' };
    const item = D.shop.find((x) => x.id === id);
    if (!item) return { type: 'refuse', msg: '商品不存在' };
    if (s.gold < item.price) return { type: 'refuse', msg: '金币不够' };
    s.gold -= item.price;
    if (item.id === 'key') s.keys.y++;
    if (item.hp) s.hp += item.hp;
    if (item.atk) s.atk += item.atk;
    if (item.def) s.def += item.def;
    s.flags.shopCount = (s.flags.shopCount || 0) + 1;
    save();
    return { type: 'buy', item, msg: `购买了${item.name}` };
  }

  function nextLevelExp() {
    if (!s) return null;
    if (s.level > D.levelExp.length) return null;
    return D.levelExp[s.level - 1];
  }

  // 用于排行榜的摘要
  function summary() {
    if (!s) return null;
    const time = Math.round(((s.finishedAt || Date.now()) - s.startedAt) / 1000);
    return {
      ending: s.ending,
      floor: s.floor + 1,
      level: s.level,
      steps: s.steps,
      time,
    };
  }

  window.Engine = {
    setHooks,
    newGame,
    load,
    reset,
    hasSave,
    save,
    state,
    tile,
    predict,
    predictAt(dx, dy) {
      if (!s) return null;
      const ch = tile(s.x + dx, s.y + dy);
      return D.monsters[ch] ? predict(ch) : null;
    },
    tryMove,
    fight,
    buy,
    nextLevelExp,
    keyName,
    summary,
  };
})();
