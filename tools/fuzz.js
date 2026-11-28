// 随机操作序列的不变量 fuzz（Node 环境，无需浏览器）
// 为什么要有它：此前每一条测试都是「设计好的场景」——想得到的写到，想不到的永远测不到。
// 这里用固定种子的随机操作序列（走 / 打 / 打法的四种选项 / 买 / 祭坛 / 路遇 / 塔心石 / 锁环 /
// 重来本层 / 存档读档往返）连跑几千步，每一步都检查一组不变量。种子固定 ⇒ 可复现。
// 跑法：node tools/fuzz.js [步数] [种子数]
global.window = global;
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
require('../js/data.js');
require('../js/story.js');
require('../js/engine.js');
require('../js/achievements.js');

const D = global.GAME_DATA;
const E = window.Engine;
const STEPS = Number(process.argv[2] || 3000);
const SEEDS = Number(process.argv[3] || 4);

// mulberry32：同一 seed 每次跑出同一条操作序列
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let fail = 0;
const seen = new Set();
function bad(msg, seed, step) {
  const k = msg.replace(/\d+/g, 'N');
  if (seen.has(k)) return;           // 同一个病只报一次，避免刷屏
  seen.add(k);
  fail++;
  console.log(`✗ [seed ${seed} step ${step}] ${msg}`);
  if (global.__hist) console.log('   最近几步:\n' + global.__hist.join('\n'));
}

const fin = (v) => typeof v === 'number' && isFinite(v);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// 地图里第一个指定字符的坐标（fuzz 用它找上楼楼梯）
function findTile(map, ch) {
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (map[y][x] === ch) return [x, y];
  return null;
}

// 每一步都要成立的东西：数值有限、资源不为负、位置与地图自洽
function invariants(s, seed, step, where) {
  const tag = where || '';
  for (const k of ['hp', 'maxHp', 'atk', 'def', 'gold', 'exp', 'level']) {
    if (!fin(s[k])) return bad(`${tag}${k} 不是有限数：${s[k]}`, seed, step);
  }
  if (!fin(s.keys.y) || !fin(s.keys.r)) return bad(`${tag}钥匙不是有限数`, seed, step);
  if (s.hp <= 0 && !s.over && !s.won) return bad(`${tag}活着但 hp=${s.hp}`, seed, step);
  if (s.hp > s.maxHp) return bad(`${tag}hp ${s.hp} > maxHp ${s.maxHp}`, seed, step);
  if (s.gold < 0) return bad(`${tag}金币为负 ${s.gold}`, seed, step);
  if (s.keys.y < 0 || s.keys.r < 0) return bad(`${tag}钥匙为负 ${s.keys.y}/${s.keys.r}`, seed, step);
  if (s.atk < 1 || s.def < 0) return bad(`${tag}攻防异常 ${s.atk}/${s.def}`, seed, step);
  if (s.level < 1 || s.exp < 0) return bad(`${tag}等级/经验异常 ${s.level}/${s.exp}`, seed, step);
  if (s.floor < 0 || s.floor >= D.floors.length) return bad(`${tag}楼层越界 ${s.floor}`, seed, step);
  if (s.x < 0 || s.x > 10 || s.y < 0 || s.y > 10) return bad(`${tag}坐标越界 ${s.x},${s.y}`, seed, step);
  const map = s.maps[s.floor];
  if (!map) return bad(`${tag}第 ${s.floor} 层地图缺失`, seed, step);
  // 站位必须是「人能站的格子」——'.'、楼梯、货摊、祭坛、路遇、石座、公主格。
  // （'@' 是起始标记，newGame 读完就抹成 '.'；这里一并放行，老档可能还带着它）
  if ('.unMX?TK@'.indexOf(map[s.y][s.x]) < 0) {
    return bad(`${tag}脚踩在非法格子「${map[s.y][s.x]}」上（${s.x},${s.y}）floor=${s.floor} tower=${s.flags.tower}`, seed, step);
  }
}

function run(seed) {
  const R = rng(seed);
  const pick = (a) => a[(R() * a.length) | 0];
  E.reset();
  E.newGame(pick(['none', 'mercy', 'greed', 'ascetic', 'guard', 'nameless']));
  // 一半的局带上「层阶之钥」：不带它，随机走位几乎出不了前 3 层，第 4–13 层的
  // 章末锁环 / 决战账 / 锁芯怪根本测不到（跳层是引擎的正规入口，不是偷改状态）
  if (R() < 0.5) E.pickRelic('gate');
  let s = E.state();
  // 给一局「撑得住」的底子：随机走位不做战前评估，原始数值在第 2 层就会送命，
  // 后面 11 层（章末锁环 / 决战账 / 锁芯）一步都走不到。只抬数值，不改结构。
  s.hp = s.maxHp = 20000; s.atk = 220; s.def = 140; s.gold = 800;
  s.keys.y = 6; s.keys.r = 4;
  let maxFloor = s.floor;
  let still = 0, lastPos = '';
  const hist = [];
  for (let step = 0; step < STEPS; step++) {
    if (!s || s.over || s.won) {
      E.reset();
      E.newGame(pick(['none', 'mercy', 'greed', 'ascetic', 'guard', 'nameless']));
      s = E.state();
    }
    const before = `${s.floor},${s.x},${s.y}`;
    let act = '?';
    let r = null;
    try {
      const roll = R();
      act = roll.toFixed(3);
      const stepTo = (dx, dy) => {
        const res = E.tryMove(dx, dy);
        if (res && res.type === 'battle') {
          const opt = pick([null, { block: true }, { block: 'all' }, { tangle: true }]);
          act += ' fight(' + dx + ',' + dy + ')';
          const fr = E.fight(dx, dy, opt) || res;
          act += '->' + (fr && fr.type);
          return fr;
        }
        return res;
      };
      if (roll < 0.55) {
        // 随便走一步（门 / 城砖 / 拾取 / 楼层切换都在 tryMove 里）
        const d = pick(DIRS);
        r = stepTo(d[0], d[1]);
      } else if (roll < 0.74) {
        // 朝上楼楼梯走一步（只取路径第一步，遇怪照样随机打法）——不带这个，走位全在前两层打转
        const up = findTile(s.maps[s.floor], 'u');
        const path = up ? E.pathTo(up[0], up[1]) : null;
        r = path && path.length ? stepTo(path[0][0], path[0][1]) : null;
        if (!r) { const d = pick(DIRS); r = stepTo(d[0], d[1]); }
      } else if (roll < 0.80) {
        // 商店：站在商人格上开张、买一件买得起的
        E.openShopAt(s.floor);
        const stock = E.shopStock().filter((id) => E.priceOf(id) <= s.gold);
        if (stock.length) E.buy(pick(stock));
      } else if (roll < 0.83) {
        // 祭坛：三选一
        const c = E.altarChoices(3);
        if (c && c.length) E.pickRelic(pick(c));
      } else if (roll < 0.87) {
        // 路遇：随机一个选项
        const id = E.pickEvent();
        const ev = D.events.find((x) => x.id === id);
        if (ev) E.resolveEvent(id, (R() * ev.options.length) | 0);
      } else if (roll < 0.90) {
        // 塔心石
        R() < 0.5 ? E.heartTake() : E.heartLeave();
      } else if (roll < 0.94) {
        // 章末锁环
        const ch = E.pendingRing();
        if (ch) { const c = E.ringChoices(ch); if (c && c.length) E.pickRing(pick(c)); }
      } else if (roll < 0.97) {
        // 存档往返：写盘 → 读回 → 关键字段必须一字不差
        const snap = { hp: s.hp, atk: s.atk, def: s.def, gold: s.gold, level: s.level, exp: s.exp,
          floor: s.floor, x: s.x, y: s.y, keys: { y: s.keys.y, r: s.keys.r } };
        const wrote = E.save();
        if (!wrote) bad('save() 返回 false（写盘失败）', seed, step);
        if (!E.hasSave()) bad('刚存完 hasSave() 却是 false', seed, step);
        E.load();
        const t = E.state();
        for (const k of ['hp', 'atk', 'def', 'gold', 'level', 'exp', 'floor', 'x', 'y']) {
          if (t[k] !== snap[k]) bad(`读档后 ${k} 变了：${snap[k]} → ${t[k]}`, seed, step);
        }
        if (t.keys.y !== snap.keys.y || t.keys.r !== snap.keys.r) bad('读档后钥匙变了', seed, step);
        s = t;
      } else if (roll < 0.97) {
        // 重来本层（存档快照）
        if (E.restoreFloor()) s = E.state();
      } else {
        // 层阶之钥跳层：一次只能往前开一层（引擎这么写的），所以按 visitedMax+1 走，
        // 偶尔回跳。没有遗物时会被拒，正好一起测拒绝路径。
        const vm = E.visitedMax();
        const tgt = Math.min(D.floors.length - 1, R() < 0.75 ? vm + 1 : (R() * (vm + 1)) | 0);
        E.jumpTo(tgt);
      }
      // 派生读数不许算成 NaN / Infinity（面板会照原样显示出来）——每 25 步抽一次
      if (step % 25 === 0) {
        const probes = {
          floorThreat: () => E.floorThreat(s.floor),
          finalLedger: () => E.finalLedger(),
          summary: () => E.summary(),
          zealNeed: () => E.zealNeed(),
          blockLim: () => E.blockLimit(),
        };
        for (const name of Object.keys(probes)) {
          let v = null;
          try { v = probes[name](); } catch (e) { bad(`${name}() 抛异常：${String(e && e.message || e)}`, seed, step); continue; }
          const dirty = [];
          (function walk(o, path) {
            if (typeof o === 'number') { if (!isFinite(o)) dirty.push(path + '=' + o); return; }
            if (!o || typeof o !== 'object') return;
            for (const k of Object.keys(o)) walk(o[k], path ? path + '.' + k : k);
          })(v, '');
          if (dirty.length) bad(`${name}() 读数里有非有限数：${dirty.slice(0, 3).join(' / ')}`, seed, step);
        }
      }
    } catch (e) {
      bad(`动作抛异常：${String(e && e.message || e)}`, seed, step);
    }
    hist.push(`${step}: ${before} ${act} => ${s.floor},${s.x},${s.y}`);
    global.__hist = hist;
    if (hist.length > 8) hist.shift();
    invariants(s, seed, step, '');
    // 卡住（门没钥匙 / 全方向堵死）时补几把钥匙，让探索继续；只补资源，不改结构
    const now2 = `${s.floor},${s.x},${s.y}`;
    if (now2 === lastPos) still++; else { still = 0; lastPos = now2; }
    if (s.floor > maxFloor) maxFloor = s.floor;
    if (still > 80) {
      s.keys.y = Math.max(s.keys.y, 4);
      s.keys.r = Math.max(s.keys.r, 2);
      s.gold = Math.max(s.gold, 400);
      still = 0;
    }
    void before;
  }
  return { floor: maxFloor, level: s.level, hp: s.hp, maxHp: s.maxHp };
}

console.log(`== 随机操作 fuzz：${SEEDS} 个种子 × ${STEPS} 步 ==`);
for (let i = 0; i < SEEDS; i++) {
  const seed = 20261116 + i * 7919;
  const res = run(seed);
  if (!fail) console.log(`✓ seed ${seed} 走完 ${STEPS} 步 · 最深第 ${res.floor + 1} 层 · Lv.${res.level} · 末局 ${res.hp}/${res.maxHp}`);
}
console.log(fail ? `✗ 共 ${fail} 类不变量被打破` : '✓ 全部不变量成立');
process.exit(fail ? 1 : 0);
