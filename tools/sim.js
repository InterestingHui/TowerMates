// 贪心模拟：验证整座塔可通关、数值是否失衡
// 策略：能拿的道具全拿（含遗物）→ 打损失最小的可达怪 → 上楼
// 用法：node tools/sim.js            正常（含遗物）
//       node tools/sim.js --no-relic 关闭遗物，用于对比遗物提供了多少强度
global.window = global;
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;
const USE_RELIC = !process.argv.includes('--no-relic');

let s = {
  floor: 0, x: 0, y: 0,
  hp: 1000, maxHp: 1000, atk: 10, def: 10, gold: 0, exp: 0, level: 1,
  keys: { y: 1, r: 0 },
  flags: {},
  maps: D.floors.map((f) => f.map.map((r) => r.split(''))),
  damageTaken: 0,
};

(function place() {
  const m = s.maps[0];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (m[y][x] === '@') { s.x = x; s.y = y; m[y][x] = '.'; return; }
  }
})();

const hasRelic = (id) => USE_RELIC && !!s.flags['relic_' + id];

function predict(ch) {
  const m = D.monsters[ch];
  if (!m || m.ghost) return { win: false, damage: Infinity, rounds: Infinity };
  if (s.atk <= m.def) return { win: false, damage: Infinity, rounds: Infinity };
  const rounds = Math.ceil(m.hp / (s.atk - m.def));
  const per = Math.max(0, m.atk - s.def);
  let damage = (rounds - 1) * per;
  if (damage > 0 && hasRelic('ward')) damage = Math.max(1, Math.floor(damage * 0.88));
  return { win: s.hp > damage, damage, rounds };
}

function levelUp() {
  while (s.level <= D.levelExp.length && s.exp >= D.levelExp[s.level - 1]) {
    s.level++;
    s.atk += 3; s.def += 2;
    const gain = 130 + (USE_RELIC && s.flags.relic_vigor ? 80 : 0);
    s.hp += gain; s.maxHp += gain;
  }
}

function applyItem(ch) {
  if (ch === '$') { s.gold += 50; return; }
  const it = D.items[ch];
  if (!it) return;
  if (it.type === 'hp') { s.hp += it.value; if (s.hp > s.maxHp) s.maxHp = s.hp; }
  if (it.type === 'atk') s.atk += it.value;
  if (it.type === 'def') s.def += it.value;
  if (it.type === 'both') { s.atk += it.value; s.def += it.value; }
  if (it.type === 'key') s.keys[it.key]++;
  if (it.type === 'relic' && USE_RELIC) {
    s.flags['relic_' + it.relic] = true;
    if (it.relic === 'edge') s.atk += 6;
    console.log(`  ◈ 遗物 ${it.name}（${D.relics[it.relic].desc}）`);
  }
}

// 祭坛：模拟"最稳的一手"——拿鸦的铁腕（+3 攻 +3 防）
function altar() {
  if (!USE_RELIC || s.flags.altar) return;
  s.flags.altar = true;
  s.flags.relic_steel = true;
  s.atk += 3;
  s.def += 3;
  console.log('  ◈ 祭坛：鸦的铁腕（攻 +3 / 防 +3）');
}

// 商店：只在有商人的层（第 3 层）把金币换成成长
function priceOf(item) {
  const step = item.id === 'atk' || item.id === 'def' ? 20 : 0;
  let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
  if (USE_RELIC && s.flags.relic_thrift) price = Math.max(1, Math.round(price * 0.75));
  return price;
}
function shop() {
  let bought = 0;
  for (;;) {
    const atk = D.shop.find((x) => x.id === 'atk');
    const price = priceOf(atk);
    if (s.gold < price) break;
    s.gold -= price;
    s.flags['buy_atk'] = (s.flags['buy_atk'] || 0) + 1;
    s.atk += atk.atk;
    bought++;
    if (bought > 40) break;
  }
  if (bought) console.log(`  在秤那里训练了 ${bought} 次 → ATK ${s.atk}，余 ${s.gold} 金`);
}

function bfs() {
  const map = s.maps[s.floor];
  const seen = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false));
  const q = [[s.x, s.y]];
  seen[s.y][s.x] = true;
  const cells = [];
  while (q.length) {
    const [x, y] = q.shift();
    cells.push([x, y]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE || seen[ny][nx]) continue;
      const ch = map[ny][nx];
      if (ch === '#') continue;
      if (D.monsters[ch] && !D.monsters[ch].ghost && !predict(ch).win) continue;
      if ((ch === 'y' || ch === 'r') && s.keys[ch] <= 0) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return cells;
}

function floorLoop(fi) {
  console.log(`\n—— 第 ${fi + 1} 层 ${D.floors[fi].name} ——`);
  let guard = 0;
  while (guard++ < 300) {
    const cells = bfs();
    let picked = 0;
    for (const [x, y] of cells) {
      const ch = s.maps[s.floor][y][x];
      if (ch === 'X') { altar(); s.maps[s.floor][y][x] = '.'; picked++; continue; }
      if (ch === '$' || D.items[ch]) {
        applyItem(ch);
        s.maps[s.floor][y][x] = '.';
        picked++;
      }
    }
    if (picked) {
      console.log(`  拾取 ${picked} 件 → HP ${s.hp}/${s.maxHp} ATK ${s.atk} DEF ${s.def} 金 ${s.gold} 经验 ${s.exp} Lv.${s.level}`);
      if (fi === 2) shop();
      continue;
    }
    const targets = [];
    for (const [x, y] of cells) {
      const ch = s.maps[s.floor][y][x];
      if (!D.monsters[ch] || D.monsters[ch].ghost) continue;
      const p = predict(ch);
      if (p.win) targets.push({ x, y, ch, damage: p.damage });
    }
    if (!targets.length) break;
    targets.sort((a, b) => a.damage - b.damage);
    const t = targets[0];
    const m = D.monsters[t.ch];
    s.hp -= t.damage;
    s.damageTaken += t.damage;
    s.exp += m.exp;
    s.gold += m.gold;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    if (hasRelic('ember') && !m.boss) {
      const heal = Math.min(Math.max(4, Math.floor(s.maxHp * 0.02)), Math.max(0, s.maxHp - s.hp));
      s.hp += heal;
    }
    s.maps[s.floor][t.y][t.x] = '.';
    s.x = t.x; s.y = t.y;
    const before = s.level;
    levelUp();
    console.log(`  击败 ${m.name} 损失 ${t.damage} → HP ${s.hp} 经验 ${s.exp}${s.level > before ? ` 升到 Lv.${s.level}(ATK ${s.atk}/DEF ${s.def})` : ''}`);
    if (s.hp <= 0) { console.log('  ☠ 死亡'); return false; }
  }
  const cells = bfs();
  const hasUp = cells.some(([x, y]) => s.maps[s.floor][y][x] === 'u');
  const hasWin = cells.some(([x, y]) => s.maps[s.floor][y][x] === 'T');
  console.log(`  结束：HP ${s.hp}/${s.maxHp} ATK ${s.atk} DEF ${s.def} 金 ${s.gold} Lv.${s.level} keys=${JSON.stringify(s.keys)}`);
  if (hasWin) { console.log('  ✓ 到达公主，通关'); return 'win'; }
  if (!hasUp) { console.log('  ✗ 到不了上楼'); return false; }
  return true;
}

function climb() {
  for (let fi = 0; fi < D.floors.length; fi++) {
    s.floor = fi;
    const r = floorLoop(fi);
    if (r === false) { console.log('\n✗ 卡住'); return; }
    if (r === 'win') { console.log('\n✓ 通关成功'); report(); return; }
    const next = s.maps[fi + 1];
    outer: for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (next[y][x] === 'n') { s.x = x; s.y = y; break outer; }
      }
    }
  }
  console.log('\n✗ 未通关');
}

function report() {
  const pct = (s.hp / s.maxHp * 100).toFixed(1);
  console.log(`\n总承伤 ${s.damageTaken}，最终 HP ${s.hp}/${s.maxHp}（${pct}%），Lv.${s.level}，ATK ${s.atk}，DEF ${s.def}，金币剩余 ${s.gold}，击杀 ${s.flags.killCount || 0}`);
  console.log(`遗物：${USE_RELIC ? Object.keys(D.relics).filter((k) => s.flags['relic_' + k]).join(' ') || '无' : '（已关闭）'}`);
}

climb();
