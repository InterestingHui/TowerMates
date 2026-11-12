// 贪心模拟：验证整座塔可通关、数值是否失衡
// 策略：能拿的道具全拿（含遗物）→ 打损失最小的可达怪 → 上楼
// 用法：node tools/sim.js            正常（含遗物）
//       node tools/sim.js --no-relic 关闭遗物，用于对比遗物提供了多少强度
//       node tools/sim.js --rings    上界：四章全拿回血型锁环，检查构筑不会打穿曲线
global.window = global;
// 固定随机序列（防御性）：基线必须可复现。当前 sim 不抽祭坛/路遇，
// 但引擎里的随机若将来泄漏进来，这条能防止「同一版代码跑出两种结论」
let SEED = Number((process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1]) || 20261112;
Math.random = () => {
  SEED = (SEED * 1103515245 + 12345) % 2147483648;
  return SEED / 2147483648;
};
require('../js/data.js');
const D = global.GAME_DATA;
const SIZE = 11;
const USE_RELIC = !process.argv.includes('--no-relic');
const USE_BLOCK = !process.argv.includes('--no-block');
const VOW = (process.argv.find((a) => a.startsWith('--vow=')) || '--vow=none').slice(6);
// 极限构筑：借灯 5% + 回廊 4% 每上楼、灯油 +240 上限、停钟 Boss 承伤 −8%
const USE_RINGS = process.argv.includes('--rings');
const RINGS = USE_RINGS ? ['lamp', 'vitality', 'stair', 'bell'] : [];
const hasRing = (id) => RINGS.indexOf(id) >= 0;

let s = {
  floor: 0, x: 0, y: 0,
  hp: 1000, maxHp: 1000, atk: 10, def: 10, gold: 0, exp: 0, level: 1,
  keys: { y: 1, r: 0 },
  flags: { vow: VOW },
  maps: D.floors.map((f) => f.map.map((r) => r.split(''))),
  damageTaken: 0,
};

if (VOW === 'mercy') s.atk = Math.max(1, s.atk - 3);
if (hasRing('vitality')) { s.maxHp += 240; s.hp += 240; }
const NO_EVENT = false;

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
  const tr = m.trait || '';
  const eDef = tr === 'solid' ? s.atk - 1 : m.def;
  const effAtk = hasRelic('cross') && m.kind === '亡' ? Math.round(s.atk * 1.5) : s.atk;
  if (effAtk <= eDef) return { win: false, damage: Infinity, rounds: Infinity };
  const rounds = Math.ceil(m.hp / (effAtk - eDef));
  const myDef = tr === 'magic' ? 0 : s.def;
  const per = Math.max(0, m.atk - myDef) * (tr === 'double' ? 2 : 1);
  const hits = tr === 'first' ? rounds : Math.max(0, rounds - 1);
  let damage = hits * per;
  if (damage > 0 && hasRelic('ward')) damage = Math.max(1, Math.floor(damage * 0.88));
  if (damage > 0 && hasRing('bell') && m.boss) damage = Math.round(damage * 0.92);
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

function applyEff(eff) {
  if (!eff) return;
  if (eff.gold) s.gold = Math.max(0, s.gold + eff.gold);
  if (eff.atk) s.atk = Math.max(1, s.atk + eff.atk);
  if (eff.def) s.def = Math.max(0, s.def + eff.def);
  if (eff.maxHp) { s.maxHp = Math.max(100, s.maxHp + eff.maxHp); s.hp = Math.min(s.hp, s.maxHp); }
  if (eff.healPct) s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * eff.healPct));
  if (eff.hpPct) s.hp = Math.max(1, Math.min(s.maxHp, s.hp + Math.round(s.maxHp * eff.hpPct)));
  if (eff.hp) s.hp = Math.max(1, Math.min(s.maxHp, s.hp + eff.hp));
  if (eff.keys) Object.keys(eff.keys).forEach((k) => { s.keys[k] = (s.keys[k] || 0) + eff.keys[k]; });
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
  if (it.type === 'block') { s.flags.hasBlock = true; console.log(`  ◈ ${it.name} → 学会格挡`); }
  if (it.type === 'relic' && USE_RELIC) {
    s.flags['relic_' + it.relic] = true;
    if (it.relic === 'edge') s.atk += 6;
    if (it.relic === 'steel') { s.atk += 3; s.def += 3; }
    console.log(`  ◈ 遗物 ${it.name}（${D.relics[it.relic].desc}）`);
  }
}

// 祭坛：模拟"最稳的两手"——第 3 层拿铁腕，第 5 层拿灯油
function altar(fi) {
  const key = 'altar_f' + fi;
  if (!USE_RELIC || s.flags[key]) return;
  s.flags[key] = true;
  if (fi < 4) {
    s.flags.relic_steel = true;
    s.atk += 3;
    s.def += 3;
    console.log('  ◈ 祭坛：鸦的铁腕（攻 +3 / 防 +3）');
  } else {
    s.flags.relic_vigor = true;
    console.log('  ◈ 祭坛：岩的灯油（升级额外 +80 生命）');
  }
}
// 商店：可重复商品每次购买后涨价 item.step（与引擎 priceOf 同口径）
function priceOf(item) {
  const step = item.step || 0;
  let price = item.price + (s.flags['buy_' + item.id] || 0) * step;
  if (USE_RELIC && s.flags.relic_thrift) price = Math.max(1, Math.round(price * 0.75));
  if (VOW === 'greed') price = Math.max(1, Math.round(price * 1.3));
  if (VOW === 'nameless') price = Math.max(1, Math.round(price * 1.4));
  return price;
}
// 这一层的货摊摆什么（与引擎 shopStock 同口径）：minFloor 是上架层
function shopStock(fi) {
  return D.shop.filter((x) => !x.minFloor || fi + 1 >= x.minFloor);
}
// 补药：优先大瓶（单价回血更划算），阶梯价计入
function healAtShop() {
  let log = [];
  for (;;) {
    if (s.hp >= s.maxHp * 0.9) break;
    const stock = shopStock(s.floor);
    const big = stock.find((x) => x.id === 'holywater' || x.id === 'bigpotion');
    const small = stock.find((x) => x.id === 'potion');
    // 大瓶每金回血更多才买大瓶，且必须买得起第一瓶
    const pick = big && s.gold >= priceOf(big) && priceOf(big) / big.hp < priceOf(small) / small.hp ? big : small;
    const price = priceOf(pick);
    if (s.gold < price) break;
    s.gold -= price;
    s.hp = Math.min(s.maxHp, s.hp + pick.hp);
    log.push(pick.name);
    if (log.length > 60) break;
  }
  if (log.length) {
    const cnt = {};
    log.forEach((n) => { cnt[n] = (cnt[n] || 0) + 1; });
    const detail = Object.keys(cnt).map((n) => `${cnt[n]} 瓶${n}`).join('、');
    console.log(`  补了 ${detail} → HP ${s.hp}/${s.maxHp}`);
  }
}

function shop() {
  let spent = 0;
  // 半部盾谱：没学过格挡时优先买（150 金，一次性）——能力优先于数值
  if (USE_BLOCK && !s.flags.hasBlock && s.gold >= 150) {
    s.gold -= 150;
    s.flags.hasBlock = true;
    console.log('  在秤那里买了半部盾谱 → 学会格挡');
  }
  let bought = 0;
  for (;;) {
    const atk = D.shop.find((x) => x.id === 'atk');
    const price = priceOf(atk);
    if (s.gold < price) break;
    s.gold -= price;
    spent += price;
    s.flags['buy_atk'] = (s.flags['buy_atk'] || 0) + 1;
    s.atk += atk.atk;
    bought++;
    if (bought > 40) break;
  }
  if (bought) console.log(`  在秤那里训练了 ${bought} 次（${spent} 金）→ ATK ${s.atk}，余 ${s.gold} 金`);
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
      if (D.monsters[ch] && !D.monsters[ch].ghost && !predict(ch).win) {
        const mb = D.monsters[ch];
        const canBlockBoss = mb.boss && s.flags.hasBlock && !s.flags['block_f' + s.floor] && Math.round(predict(ch).damage * 0.6) < s.hp;
        if (!canBlockBoss) continue;
      }
      if ((ch === 'y' || ch === 'r') && s.keys[ch] <= 0) continue;
      seen[ny][nx] = true;
      q.push([nx, ny]);
    }
  }
  return cells;
}

function floorLoop(fi) {
  console.log(`\n—— 第 ${fi + 1} 层 ${D.floors[fi].name} ——`);
  // 商店层（M）：低血先补药——与玩家真实行为同口径，把补给计入承伤模型
  if (D.floors[fi].map.join('').includes('M') && s.hp < s.maxHp * 0.55) healAtShop();
  let guard = 0;
  while (guard++ < 300) {
    const cells = bfs();
    let picked = 0;
    for (const [x, y] of cells) {
      const ch = s.maps[s.floor][y][x];
      if (ch === 'X') { altar(fi); s.maps[s.floor][y][x] = '.'; picked++; continue; }
      if (ch === '?') {
        if (NO_EVENT) { s.maps[s.floor][y][x] = '.'; picked++; continue; }
        // 模拟固定走"选项 0"（按层分池后轮换，保证可复现）
        const pool = D.events.filter((e) => (e.tier || 'a') === (fi >= 6 ? 'c' : fi >= 3 ? 'b' : 'a'));
        const e = pool[fi % pool.length];
        const o = e.options[0];
        const cost = o.effect.gold && o.effect.gold < 0 ? -o.effect.gold : 0;
        const keyCost = o.effect.keys && o.effect.keys.y < 0 ? -o.effect.keys.y : 0;
        if ((cost > 0 && s.gold < cost) || (keyCost > 0 && s.keys.y < keyCost)) {
          s.maps[s.floor][y][x] = '.';
          picked++;
          continue;
        }
        applyEff(o.effect);
        s.maps[s.floor][y][x] = '.';
        picked++;
        console.log(`  ◇ 路遇 ${e.name} → ${o.label}`);
        continue;
      }
      if (ch === '$' || D.items[ch]) {
        applyItem(ch);
        s.maps[s.floor][y][x] = '.';
        picked++;
      }
    }
    if (picked) {
      console.log(`  拾取 ${picked} 件 → HP ${s.hp}/${s.maxHp} ATK ${s.atk} DEF ${s.def} 金 ${s.gold} 经验 ${s.exp} Lv.${s.level}`);
      if (D.floors[fi].map.join('').includes('M')) shop();
      continue;
    }
    const targets = [];
    for (const [x, y] of cells) {
      const ch = s.maps[s.floor][y][x];
      if (!D.monsters[ch] || D.monsters[ch].ghost) continue;
      const p = predict(ch);
      if (p.win) targets.push({ x, y, ch, damage: p.damage });
    }
    if (!targets.length) {
      // 卡死自救（与玩家真实行为同口径）：商店层有金币 → 补药+训练后重试
      if (D.floors[fi].map.join('').includes('M') && s.gold >= priceOf(D.shop.find((x) => x.id === 'atk'))) {
        if (s.hp < s.maxHp * 0.5) healAtShop();
        shop();
        continue;
      }
      break;
    }
    targets.sort((a, b) => a.damage - b.damage);
    const t = targets[0];
    const m = D.monsters[t.ch];
    const isBoss = !!m.boss;
    // 格挡：Boss 层留给 Boss，普通层用在本层第一场"够疼"的战斗上
    let take = t.damage;
    if (VOW === 'guard') take = Math.round(take * 1.18);
    if (USE_BLOCK && s.flags.hasBlock && VOW !== 'guard' && VOW !== 'ascetic' && VOW !== 'nameless' && (isBoss || !D.floors[fi].boss) && !s.flags['block_f' + s.floor] && take >= s.maxHp * 0.08) {
      s.flags['block_f' + s.floor] = true;
      const scale = s.flags.hasBlock2 ? 0.45 : 0.6;
      take = Math.round(take * scale);
      if (s.flags.hasBlock2) s.exp += Math.max(1, Math.round((t.damage - take) * 0.3));
      console.log(`  ▣ 格挡：${m.name} 承伤 ${t.damage} → ${take}${s.flags.hasBlock2 ? '（反击+' + Math.max(1, Math.round((t.damage - take) * 0.3)) + ' 经验）' : ''}`);
    }
    s.hp -= take;
    s.damageTaken += take;
    s.exp += m.exp;
    s.gold += VOW === 'greed' ? Math.round(m.gold * 1.7) : m.gold;
    s.flags.killCount = (s.flags.killCount || 0) + 1;
    if (hasRelic('ember') && !m.boss) {
      const heal = Math.min(Math.max(4, Math.floor(s.maxHp * 0.02)), Math.max(0, s.maxHp - s.hp));
      s.hp += heal;
    }
    s.maps[s.floor][t.y][t.x] = '.';
    s.x = t.x; s.y = t.y;
    const before = s.level;
    levelUp();
    console.log(`  击败 ${m.name} 损失 ${take} → HP ${s.hp} 经验 ${s.exp}${s.level > before ? ` 升到 Lv.${s.level}(ATK ${s.atk}/DEF ${s.def})` : ''}`);
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
    if (VOW === 'mercy') s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.12));
    if (VOW === 'ascetic' || VOW === 'nameless') s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * 0.10));
    const ringPct = (hasRing('lamp') ? 0.05 : 0) + (hasRing('stair') ? 0.04 : 0);
    if (ringPct > 0) s.hp = Math.min(s.maxHp, s.hp + Math.round(s.maxHp * ringPct));
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
  console.log(`锁环：${RINGS.length ? RINGS.map((k) => D.rings[k].name).join(' / ') : '无'}`);
}

climb();
