// TowerMates · 魔塔原型 —— 核心逻辑（不依赖 DOM，可在 Node 里跑平衡性模拟）
(function () {
  const D = window.GAME_DATA;
  const SAVE_KEY = 'towermates_save_v1';
  const SIZE = 11;

  let s = null;

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
      steps: 0,
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
    } catch (e) {
      /* 隐私模式等场景忽略 */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.maps || parsed.maps.length !== D.floors.length) return null;
      s = parsed;
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

  function changeFloor(dir) {
    const target = s.floor + dir;
    if (target < 0 || target >= D.floors.length) return false;
    s.floor = target;
    const map = s.maps[target];
    const mark = dir > 0 ? 'n' : 'u';
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === mark) {
          s.x = x;
          s.y = y;
          return true;
        }
      }
    }
    // 兜底：找不到对应楼梯就待在原点
    return false;
  }

  function predict(ch) {
    const m = D.monsters[ch];
    if (!m) return null;
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

  function tryMove(dx, dy) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return { type: 'blocked' };
    const ch = tile(nx, ny);
    if (ch === '#') return { type: 'blocked', msg: '石墙挡住了去路' };

    if (D.monsters[ch]) {
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
      changeFloor(ch === 'u' ? 1 : -1);
      save();
      return { type: 'floor', msg: `来到第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}` };
    }

    if (ch === 'T') {
      moveTo(nx, ny);
      s.won = true;
      save();
      return { type: 'win' };
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
      return res;
    }
    save();
    return { type: 'move' };
  }

  function fight(dx, dy) {
    if (!s || s.over || s.won) return { type: 'idle' };
    const nx = s.x + dx;
    const ny = s.y + dy;
    const ch = tile(nx, ny);
    const m = D.monsters[ch];
    if (!m) return { type: 'idle' };
    const p = predict(ch);
    if (!p.win) return { type: 'refuse', msg: p.reason || '无法战胜' };

    s.hp -= p.damage;
    setTile(nx, ny, '.');
    moveTo(nx, ny);
    s.gold += m.gold;
    s.exp += m.exp;
    const ups = levelUp();
    save();
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
    save();
    return { type: 'buy', item, msg: `购买了${item.name}` };
  }

  function nextLevelExp() {
    if (!s) return null;
    if (s.level > D.levelExp.length) return null;
    return D.levelExp[s.level - 1];
  }

  window.Engine = {
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
  };
})();
