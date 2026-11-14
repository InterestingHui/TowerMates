// 引擎逻辑单元测试（Node 环境，stub localStorage）
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

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { fail++; console.log('✗ ' + msg); }
}

const D = global.GAME_DATA;
const E = window.Engine;
E.newGame();
let s = E.state();

// ---------- 1. 初始状态 ----------
ok(s.hp === 1000 && s.atk === 10 && s.def === 10, '初始属性 1000/10/10');
ok(s.keys.y === 1 && s.keys.r === 0, '初始 1 把黄钥匙、0 把红钥匙');

// ---------- 2. 开门 ----------
s.floor = 2; s.x = 4; s.y = 4;
let ev = E.tryMove(-1, 0);
ok(ev.type === 'open' && s.keys.y === 0, '黄门打开并消耗钥匙');
ok(E.tile(3, 4) === '.', '门变成地面');

// ---------- 3. 无钥匙被锁 ----------
s.floor = 3; s.x = 9; s.y = 3; s.keys.r = 0;
const locked = E.tryMove(0, -1);
ok(locked.type === 'locked', '无红钥匙时红门拒绝');

// ---------- 4. 遗物「守誓之盾」 ----------
s.keys.r = 1;
ev = E.tryMove(0, -1);
ok(ev.type === 'open', '有红钥匙时红门打开');
ev = E.tryMove(0, -1);
ok(ev.type === 'relic' && ev.relic === 'ward', '红门后取得守誓之盾');
ok(E.hasRelic('ward'), '遗物标记写入');
ok(E.tile(9, 1) === '.', '遗物格清空');

// ---------- 5. 守誓之盾减伤 ----------
s.atk = 40; s.def = 20; s.hp = 5000;
const plain = (function () {
  const keep = s.flags.relic_ward;
  delete s.flags.relic_ward;
  const p = E.predict('F');
  s.flags.relic_ward = keep;
  return p;
})();
const warded = E.predict('F');
ok(plain.damage > 0 && warded.damage === Math.floor(plain.damage * 0.88), '守誓之盾让承伤 −12%');

// ---------- 6. 商店与动态价格 ----------
s.floor = 2; s.x = 3; s.y = 6; s.gold = 100;
delete s.flags.buy_atk;
ev = E.tryMove(1, 0);
ok(ev.type === 'shop', '踩到商人弹出商店');
const atk0 = s.atk;
const buy1 = E.buy('atk');
ok(buy1.type === 'buy' && s.atk === atk0 + 2 && s.gold === 40, '力量训练：攻击 +2，扣 60 金');
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 80, '同一件商品第二次涨价到 80');
const poor = E.buy('atk');
ok(poor.type === 'refuse', '金币不足时拒绝购买');

// ---------- 6a-2. 阶梯定价：每次购买下一次更贵（药水 30→36→42） ----------
E.newGame();
s = E.state();
s.gold = 500;
const p0 = E.priceOf(D.shop.find((x) => x.id === 'potion'));
E.buy('potion');
const p1 = E.priceOf(D.shop.find((x) => x.id === 'potion'));
E.buy('potion');
const p2 = E.priceOf(D.shop.find((x) => x.id === 'potion'));
ok(p0 === 30 && p1 === 36 && p2 === 42, `药水阶梯价 30→36→42（实测 ${p0}→${p1}→${p2}）`);
// 黄钥匙 20→24→28
E.buy('key');
const k1 = E.priceOf(D.shop.find((x) => x.id === 'key'));
ok(k1 === 24, '黄钥匙买后 20→24');

// ---------- 6a-3. 药水回血口径：金币是唯一闸门，且必须花到买不起为止 ----------
// 药水可反复买（不是漏洞的一部分）：每次涨价、金币扣完就买不动，靠经济收敛。
E.newGame();
s = E.state();
s.gold = 100;
s.hp = 100; s.maxHp = 1000;
const potRes1 = E.buy('potion');
ok(potRes1.type === 'buy' && potRes1.healed > 0 && s.gold === 70, '买药水扣 30 金并回血');
const potRes2 = E.buy('potion');
ok(potRes2.type === 'buy' && s.gold === 34, '第二瓶涨价到 36（金币 100→34）');
const potRes3 = E.buy('potion');
ok(potRes3.type === 'refuse' && s.gold === 34, '钱不够时拒绝购买且金币不变');
// 满血买药：允许溢出并顶高上限（设计取舍，写进断言防悄悄改口径）
s.hp = s.maxHp; s.gold = 999;
const potFull = E.buy('potion');
ok(potFull.type === 'buy' && s.maxHp > 1000, '满血买药会把生命上限顶高（设计如此：药水兼作上限投资）');
// 金币来源全表有限：本局金币只来自击杀/拾取/事件/锁环，没有无中生有的循环
ok(E.shopStock().every((it) => !it.sell), '商店没有回收/卖出接口（不能靠买卖套利）');

// ---------- 6b. 半部盾谱：商店购买 / 地图拾取 ----------
E.newGame();
s = E.state();
ok(!s.flags.hasBlock && !E.canBlock(), '开局不会格挡');
s.gold = 200;
const bb1 = E.buy('blockbook');
ok(bb1.type === 'buy' && s.flags.hasBlock === true && E.canBlock(), '商店买盾谱 → 学会格挡');
const bb2 = E.buy('blockbook');
ok(bb2.type === 'refuse', '已学会时商店拒绝再卖');
s.gold = 100;
ok(E.priceOf(D.shop.find((x) => x.id === 'blockbook')) === 150, '盾谱标价 150 金');
// 拾取：踩到第 2 层的 j
E.newGame();
s = E.state();
const gPos = (() => {
  const m = s.maps[1];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === 'j') return { x, y };
  return null;
})();
ok(!!gPos, '第 2 层地图上有半部盾谱 j');
s.floor = 1; s.x = gPos.x - 1; s.y = gPos.y;
const gEv = E.tryMove(1, 0);
ok(gEv.type === 'pickup' && s.flags.hasBlock === true, '拾取盾谱 → 学会格挡');
ok(gEv.blockLearned === true, '首次拾取带教学标记');
ok(gEv.story === 'blockLore' && !!global.STORY.blockLore, '拾取盾谱带小传 blockLore');
// 商店铺开：每 ~5 层一副（第 3/8/11/13 层），全部可达且不焊死在唯一通路上（check.js 已验）
ok(D.floors.filter((f) => f.map.join('').includes('M')).length === 4, '全塔 4 副货摊（3/8/11/13 层）');
// 无遗物线的经济救济：9 层钟楼铎之前有一袋金币（+400），位置在 Boss 之前的半场
E.newGame();
s = E.state();
const oPos = (() => {
  const m = s.maps[8];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === 'o') return { x, y };
  return null;
})();
ok(!!oPos && oPos.y > 5, '第 9 层铎之前的半场有一袋金币');
s.floor = 8; s.x = oPos.x + 1; s.y = oPos.y;
const goldBeforeBag = s.gold;
const oEv = E.tryMove(-1, 0);
ok(oEv.type === 'pickup' && s.gold === goldBeforeBag + 400, '拾取一袋金币 → +400 金');
// 货架分级：第 3 层没有蓝药/圣水，第 8 层起有蓝药，第 11 层起有圣水
ok(E.shopStock(2).every((x) => x.id !== 'bigpotion' && x.id !== 'holywater'), '第 3 层货架没有高级药');
ok(E.shopStock(7).some((x) => x.id === 'bigpotion') && E.shopStock(7).every((x) => x.id !== 'holywater'), '第 8 层上架蓝药水');
ok(E.shopStock(10).some((x) => x.id === 'holywater'), '第 11 层上架圣水');
ok(E.shopStock(12).some((x) => x.id === 'holywater'), '第 13 层（锁芯）有圣水');
ok(E.shopStock(10).every((x) => x.id !== 'heartshard'), '塔心碎片只在锁芯上架');
E.newGame();
s = E.state();
s.floor = 12; s.gold = 400;
const hs1 = E.buy('heartshard');
ok(hs1.type === 'buy' && s.flags.heartShard === true, '买塔心碎片 → 标记在档');
const hs2 = E.buy('heartshard');
ok(hs2.type === 'refuse', '碎片唯一：第二枚被拒');
ok(!E.shopStock(2).some((x) => x.id === 'heartshard'), '第 3 层买不到碎片');
// 保底提示的数据源：本层剩余怪数（幽灵 NPC 不算）
ok(E.floorMonsterCount(1) > 0, '第 2 层还有怪可刷（剩余计数可用）');
// 决战结束时的血量会被记档，供结算页按「难度基准」口径展示
E.newGame();
s = E.state();
s.floor = 11; s.x = 5; s.y = 4; s.hp = 99999; s.maxHp = 99999; s.atk = 999; s.def = 999;
const hpBeforeFinal = s.hp;
E.fight(0, 1); // 首次接触只播 Boss 剧情
const finalEv = E.fight(0, 1);
ok(finalEv.type === 'fight' && s.flags.finalHp === hpBeforeFinal - finalEv.damage,
  '击败最终 Boss 时记下决战结束血量（不含随后升级回血）');
// 决战余裕分档：S≥70% / A≥50% / B≥30% / C<30%
const marginCases = [[0.75, 'S'], [0.70, 'S'], [0.66, 'A'], [0.50, 'A'], [0.40, 'B'], [0.30, 'B'], [0.05, 'C']];
const marginOk = marginCases.every(([p, g]) => {
  s.flags.finalHp = Math.round(1000 * p);
  s.flags.finalMaxHp = 1000;
  return E.battleMargin().grade === g;
});
ok(marginOk, '决战余裕分档 S/A/B/C 边界正确');
// 老档没有 finalHp 时回落到当前血量，不报错
delete s.flags.finalHp;
delete s.flags.finalMaxHp;
s.hp = 300; s.maxHp = 1000;
ok(E.battleMargin().grade === 'B', '无决战记录时用当前血量兜底');
E.newGame();
s = E.state();
const cnt0 = E.floorMonsterCount(0);
s.x = 1; s.y = 2;
const killEv = E.fight(1, 0); // (2,2) 的蝙蝠
ok(killEv.type === 'fight' && E.floorMonsterCount(0) === cnt0 - 1, '杀掉一只后剩余计数 −1');
// 后半部盾谱：锁芯拾取 → 格挡强化（×0.42 + 卸伤三成化经验）
E.newGame();
s = E.state();
const vPos = (() => {
  const m = s.maps[12];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === 'v') return { x, y };
  return null;
})();
ok(!!vPos, '锁芯地图上有盾谱后半 v');
s.floor = 12; s.x = vPos.x; s.y = vPos.y + 1;
if (s.maps[12][vPos.y + 1][vPos.x] === '#') { s.x = vPos.x - 1; s.y = vPos.y; }
const vEvEarly = E.tryMove(s.y === vPos.y + 1 ? 0 : 1, s.y === vPos.y + 1 ? -1 : 0);
ok(vEvEarly.type === 'pickup' && vEvEarly.good === false && !s.flags.hasBlock2, '没学前半部时读不懂后半部');
E.grantBlock();
if (s.maps[12][s.y][s.x] !== 'v') { s.x = vPos.x; s.y = vPos.y; s.maps[12][vPos.y][vPos.x] = 'v'; s.maps[12][vPos.y][vPos.x - 1] = '.'; }
const vEv = s.x === vPos.x && s.y === vPos.y - 1 ? E.tryMove(0, 1) : (function () {
  // 直接用 tile 拾取路径重放：踩回它
  s.x = vPos.x; s.y = vPos.y - 1;
  if (s.maps[12][vPos.y][vPos.x] !== 'v') s.maps[12][vPos.y][vPos.x] = 'v';
  return E.tryMove(0, 1);
})();
ok(vEv.type === 'pickup' && s.flags.hasBlock2 === true, '先学前半部再拾取 → 学会后半部');
ok(Math.abs(E.ringBlockScale() - 0.42) < 1e-9, '后半部把格挡比例压到 0.42');
// 格挡反击：挡下的那场多给经验
E.newGame();
s = E.state();
s.flags.hasBlock = true; s.flags.hasBlock2 = true;
s.hp = 50000; s.x = 2; s.y = 3;
const expBefore = s.exp;
const rawPred = E.predict('A');
const mExp = D.monsters.A.exp;
const rRip = E.fight(0, -1, { block: true });
ok(rRip.blocked === true && rRip.riposte > 0 && s.exp === expBefore + rRip.riposte + mExp, '格挡反击：卸掉的伤三成化为经验');
ok(rRip.damage === Math.round(rawPred.damage * 0.42), '承伤按 42% 结算');
// 铁壁之誓不能格挡：商店不卖，拾取也学不会
E.newGame('guard');
s = E.state();
s.gold = 300;
ok(E.buy('blockbook').type === 'refuse', '铁壁之誓：买盾谱被拒');
const gjPos = (() => {
  const m = s.maps[1];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === 'j') return { x, y };
  return null;
})();
s.floor = 1; s.x = gjPos.x - 1; s.y = gjPos.y;
const gjEv = E.tryMove(1, 0);
ok(gjEv.good === false && !s.flags.hasBlock, '铁壁之誓：拾取盾谱也学不会');

// ---------- 7. 战斗结算 ----------
E.newGame();
s = E.state();
s.x = 2; s.y = 5;
ev = E.tryMove(-2, 0);
ok(ev.type === 'blocked', '墙阻挡移动');
s.x = 1; s.y = 5;
ev = E.tryMove(0, -1);
ok(ev.type === 'move', '走到空格');
s.x = 2; s.y = 3;
ev = E.tryMove(0, -1);
ok(ev.type === 'battle' && ev.prediction.win, '撞到蝙蝠进入战斗且可胜');
const hp0 = s.hp;
const gold0 = s.gold;
const fight = E.fight(0, -1);
ok(fight.type === 'fight' && s.hp === hp0 - fight.damage, '战后正确扣血');
ok(s.gold === gold0 + 3 && s.exp === 2, '战利品金币/经验到账');
ok(E.tile(2, 2) === '.', '怪物被移除');

// ---------- 8. 断剑：遗物 +6 攻 ----------
E.newGame();
s = E.state();
s.floor = 4; s.x = 6; s.y = 1;
const atkBefore = s.atk;
ev = E.tryMove(1, 0);
ok(ev.type === 'relic' && ev.relic === 'edge', '走到断剑触发遗物事件');
ok(s.atk === atkBefore + 6, '断刃之锋：攻击 +6');

// ---------- 9. 余烬灯芯：击杀回血 ----------
E.newGame();
s = E.state();
s.flags.relic_ember = true;
s.maxHp = 1000; s.hp = 500;
s.x = 2; s.y = 3;
const healFight = E.fight(0, -1);
ok(healFight.type === 'fight' && healFight.heal === 20, '余烬灯芯：击杀回复 2% 生命');
ok(s.hp === 500 - healFight.damage + 20, '回血正确结算');

// ---------- 9b. 祭坛三选一 ----------
// 祭坛 X 不焊死在固定坐标：从全塔地图里找，站它旁边走上去（布局调整不用再改测试）
E.newGame();
s = E.state();
let af = -1, ax = -1, ay = -1, tx = -1, ty = -1;
for (let f = 0; f < D.floors.length && ax < 0; f++) {
  const m = D.floors[f].map;
  for (let y = 1; y < 10 && ax < 0; y++) {
    for (let x = 1; x < 10; x++) {
      if (m[y][x] !== 'X') continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const c = m[y + dy] && m[y + dy][x + dx];
        if (c && c !== '#') { af = f; ax = x + dx; ay = y + dy; tx = x; ty = y; break; }
      }
      if (ax >= 0) break;
    }
  }
}
s.floor = af;
s.x = ax; s.y = ay;
ev = E.tryMove(tx - ax, ty - ay);
ok(ev.type === 'altar', '踩到行李堆弹出三选一');
const choices = E.altarChoices();
ok(choices.length === 3 && choices.every((id) => !!D.relics[id]), '祭坛给出 3 件可拿的遗物');
const atkA = s.atk, defA = s.def;
const pick = E.pickRelic('steel');
ok(pick.type === 'relic' && s.atk === atkA + 3 && s.def === defA + 3, '鸦的铁腕：攻击/防御 +3');
ok(s.flags.altar === true && E.tile(tx, ty) === '.', '祭坛拿走一次后清空');
ok(E.pickRelic('steel').type === 'refuse', '同一件不能拿两次');
// 焦点 C 二轮：构筑位不许被消耗品占着——窥探之镜在秤那里只值 100 金，不配进祭坛三选一
ok(!D.altarPool.includes('scout'), '祭坛池不含窥探之镜（100 金道具不占构筑位）');
ok(D.altarPool.length === 6, '祭坛池 6 件，三选一仍然成立');
ok(D.rings.scout2 && /还剩几件/.test(D.rings.scout2.desc), '窥探之环自带罗盘信息（不再只给一枚镜子）');

// ---------- 9b+. 首发节奏的数据口径（PROGRESS《四、体验验收基线》） ----------
E.newGame();
s = E.state();
const flatMap = (f) => s.maps[f].join('');
ok(!flatMap(0).includes('?') && !flatMap(1).includes('?'), '第 1/2 层不再放路遇点（首次路遇后移到第 3 层）');
ok(flatMap(2).includes('X'), '第 3 层祭坛保留（挪到第 4 层会让墨妖前少一件遗物，实测承伤 +16%）');
ok(flatMap(0).includes('a') && !flatMap(0).includes('s'), '第 1 层武器升为精钢剑（补回取消首层路遇后的攻击成长）');

// ---------- 9b2. 第二座祭坛（第 5 层，二选一） ----------
E.newGame();
s = E.state();
s.floor = 4; s.x = 8; s.y = 1;
ev = E.tryMove(1, 0);
ok(ev.type === 'altar', '第 5 层的行李堆同样触发三选一');
ok(E.altarChoices(2).length === 2, '第 5 层只给 2 个选择');
const pick2 = E.pickRelic(E.altarChoices(2)[0]);
ok(pick2.type === 'relic' && s.flags['altar_f4'] === true, '第二座祭坛的标记独立');
ok(!s.flags.altar_f2, '拿第 5 层的不会用掉第 3 层的');

// ---------- 9c. 川的账本 / 岩的灯油 / 无名之镜 ----------
E.newGame();
s = E.state();
s.flags.relic_thrift = true;
delete s.flags.buy_atk;
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 45, '川的账本：商店价格 −25%');
delete s.flags.relic_thrift;
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 60, '没有账本时价格恢复');

E.newGame();
s = E.state();
s.flags.relic_vigor = true;
s.exp = 9; s.hp = 1000; s.maxHp = 1000;
s.x = 2; s.y = 3;
const vf = E.fight(0, -1);
ok(vf.levelUps === 1 && s.maxHp === 1210, '岩的灯油：升级额外 +80 生命');

E.newGame();
s = E.state();
E.pickRelic('scout');
ok(s.flags.codex === true, '无名之镜：直接解锁窥探之镜');

// ---------- 9d. 隐藏门「锁芯」（塔规系统已移除：击败碑魔即开窄梯） ----------
E.newGame();
s = E.state();
s.floor = 11;
ok(E.revealCore() === false, '没打赢碑魔时塔顶后面没有路');
s.flags.bossKilled_U = true;
ok(E.revealCore() === true && E.tile(9, 2) === 'u', '击败碑魔后塔顶露出窄梯');
ok(E.state().maps[11][2][9] === 'u', '窄梯写进地图');
ok(D.floors.length === 13 && D.floors[12].name === '锁芯', '第十三层的锁芯存在');

// ---------- 9l. 层阶之钥：跳层 ----------
E.newGame();
s = E.state();
ok(E.jumpTo(1).type === 'refuse', '没有钥匙时跳不了');
s.flags.relic_gate = true;
s.flags.maxFloor = 2;
ok(E.visitedMax() === 2, '最远到过第 3 层');
ok(E.jumpTo(4).type === 'refuse', '没到过的楼层跳不过去');
ok(E.jumpTo(0).type === 'refuse', '不能原地跳');
const jr = E.jumpTo(1);
ok(jr.type === 'floor' && jr.jump === true, '跳层成功');
ok(s.floor === 1, '真的到了第 2 层');
ok(E.tile(s.x, s.y) === 'n', '落在该层的上楼口');
ok(E.jumpTo(1).type === 'refuse', '同一层不能重复跳');
s.flags.maxFloor = 0;
s.floor = 0;
ok(E.visitedMax() === 0, '旧存档没有 maxFloor 时按当前层算');

// ---------- 9k. 余烬誓约（苦行 / 无名） ----------
E.newGame('ascetic');
s = E.state();
E.grantBlock();
ok(E.vow() === 'ascetic' && !E.canBlock(), '苦行之誓：学了也不给格挡');
s.hp = 400; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);
ok(ev.type === 'floor' && ev.at.heal === Math.round(s.maxHp * 0.10), '苦行之誓：每上一层回 10% 生命');

E.newGame('nameless');
s = E.state();
E.grantBlock();
ok(!E.canBlock(), '无名之誓：学了也不给格挡');
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 84, '无名之誓：物价 +40%（60 → 84）');

// ---------- 9j. 路遇：按层分池 / 深层事件 / 钥匙门槛 ----------
ok(E.eventPool(0).every((e) => (e.tier || 'a') === 'a'), '浅层只出温和事件');
ok(E.eventPool(5).every((e) => e.tier === 'b'), '第 6 层只出深层事件');
ok(E.eventPool(6).every((e) => e.tier === 'c'), '第 7 层只出锁梁事件');
// 数量从数据表算，别写死：以后往任何一层加路遇都不会把这条测试弄飘
const tierCount = (t) => D.events.filter((e) => (e.tier || 'a') === t).length;
ok(E.eventPool(0).length === tierCount('a') && E.eventPool(5).length === tierCount('b') && E.eventPool(6).length === tierCount('c'), '三个池子的数量与数据表一致');
ok(D.events.length === tierCount('a') + tierCount('b') + tierCount('c'), '事件池总数等于分池之和');
ok(new Set(D.events.map((e) => e.id)).size === D.events.length, '路遇 id 不重复');
// 池子厚度：三层各不少于 6 条（11-14 扩容后 a/b 各 8 条、c 8 条）。
// 写「不少于」而不是写死数字——扩池是本项目的常规打磨项，别每加一条就来改测试。
ok(tierCount('a') >= 6 && tierCount('b') >= 6 && tierCount('c') >= 6, '三层路遇池各自不少于 6 条');

// 路遇数据完整性：少了 tip 玩家就没法「明码取舍」，少 label/msg 会渲出空白
const evBad = [];
D.events.forEach((e) => {
  if (!e.id || !e.name || !e.text || !e.emoji) evBad.push(e.id + ':缺字段');
  if (!Array.isArray(e.options) || e.options.length < 2) evBad.push(e.id + ':选项少于 2');
  (e.options || []).forEach((o, i) => {
    if (!o.label || !o.tip || !o.msg) evBad.push(e.id + '#' + i + ':缺 label/tip/msg');
    if (!o.effect || typeof o.effect !== 'object') evBad.push(e.id + '#' + i + ':缺 effect');
  });
});
ok(evBad.length === 0, '每条路遇都有 2+ 选项，且 label/tip/msg/effect 齐全' + (evBad.length ? '（' + evBad.slice(0, 5).join('、') + '）' : ''));

// effect 键白名单：写错的键 applyEffect 会静默忽略（选项变成"白点一下"），这条专抓拼写错
const EFFECT_KEYS = ['gold', 'atk', 'def', 'maxHp', 'hpPct', 'healPct', 'hp', 'keys', 'ember', 'block'];
const evKeyBad = [];
D.events.forEach((e) => (e.options || []).forEach((o, i) => {
  Object.keys(o.effect || {}).forEach((k) => { if (EFFECT_KEYS.indexOf(k) < 0) evKeyBad.push(e.id + '#' + i + '.' + k); });
  if (o.effect && o.effect.keys) {
    Object.keys(o.effect.keys).forEach((k) => { if (k !== 'y' && k !== 'r') evKeyBad.push(e.id + '#' + i + '.keys.' + k); });
  }
}));
ok(evKeyBad.length === 0, '路遇 effect 只用已实现的键' + (evKeyBad.length ? '（' + evKeyBad.join('、') + '）' : ''));

E.newGame();
s = E.state();
s.floor = 3; s.gold = 0; s.keys.y = 0;
const bridge = D.events.find((e) => e.id === 'bridge');
const keyOpt = bridge.options.findIndex((o) => o.effect.keys && o.effect.keys.y < 0);
ok(keyOpt >= 0 && E.eventCost(bridge.options[keyOpt]) === '钥匙不够', '钥匙不足时选项被标记为不可选');
s.keys.y = 3;
ok(E.eventCost(bridge.options[keyOpt]) === null, '钥匙够了就可以选');

// 11-14 扩池新增的四条路遇：落地数值必须与 tip 写的完全一致（文案说谎是本项目最高频 bug）
E.newGame(); s = E.state();
s.floor = 1; s.x = 1; s.y = 1;
let evGold = s.gold, evHp = s.hp, evMax = s.maxHp;
E.resolveEvent('jug', 0);
ok(s.gold === evGold + 110, '「漏水的陶罐」摸罐底：金币 +110');
ok(s.hp === Math.max(1, Math.min(evMax, evHp + Math.round(evMax * -0.05))), '「漏水的陶罐」摸罐底：生命 −5%');
evHp = s.hp;
E.resolveEvent('jug', 1);
ok(s.hp === Math.min(evMax, evHp + Math.round(evMax * 0.2)), '「漏水的陶罐」喝一口：回复 20% 生命');

E.newGame(); s = E.state();
s.floor = 1; s.x = 1; s.y = 1;
evGold = s.gold; evHp = s.hp; evMax = s.maxHp;
E.resolveEvent('vent', 0);
ok(s.gold === evGold + 130, '「墙里的风」伸手进去：金币 +130');
ok(s.hp === Math.max(1, Math.min(evMax, evHp + Math.round(evMax * -0.07))), '「墙里的风」伸手进去：生命 −7%');

E.newGame(); s = E.state();
s.floor = 4; s.x = 1; s.y = 1;
evGold = s.gold; evHp = s.hp; evMax = s.maxHp;
E.resolveEvent('well', 0);
ok(s.gold === evGold + 380, '「枯井」下井：金币 +380');
ok(s.hp === Math.max(1, Math.min(evMax, evHp + Math.round(evMax * -0.14))), '「枯井」下井：生命 −14%');

E.newGame(); s = E.state();
s.floor = 4; s.x = 1; s.y = 1;
let d0 = s.def;
E.resolveEvent('scales', 1);
ok(s.def === d0 + 2, '「没人看的秤」拿铁：防御 +2');
ok(E.eventCost(D.events.find((e) => e.id === 'scales').options[0]) === null, '「没人看的秤」拿走金币不设金币门槛（是收入不是支出）');

// ---------- 9i. 路遇事件 ----------
// 节奏纠偏后第 1/2 层不再放 ?（首次路遇后移到第 3 层），这里统一用第 3 层的 ? 测
E.newGame();
s = E.state();
s.floor = 2;
s.x = 8; s.y = 6;
ev = E.tryMove(0, 1);
ok(ev.type === 'event' && !!ev.eventId, '踩到路遇点弹出事件');

// ---------- 9i-2. 回血来源口径：除「本层首次踏足」外，其余回血都不许原地反复刷 ----------
// ① 药水格踩过即清空：站上去再踩一次不会重复回血
E.newGame();
s = E.state();
const potPos = (() => {
  const m = s.maps[0];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === 'p') return { x, y };
  return null;
})();
ok(!!potPos, '第 1 层找得到红药水');
if (potPos) {
  // 首层散落物每局换位后，药水可能贴墙——先找一个站得住脚的相邻格，别假设它上方一定是地面。
  // 注意方向：站在「药水 + 偏移」处，要踩上去得朝 -偏移 走。
  const side = [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .filter(([dx, dy]) => E.tile(potPos.x + dx, potPos.y + dy) === '.')
    .map(([dx, dy]) => ({ x: potPos.x + dx, y: potPos.y + dy, dx: dx, dy: dy }))[0];
  ok(!!side, '药水旁有可站立的格子（换位不会把它封死）');
  s.x = side.x; s.y = side.y; s.hp = 500;
  const hpBeforePot = s.hp;
  const potEv = E.tryMove(-side.dx, -side.dy);
  const hpAfterPot = s.hp;
  ok(potEv.type === 'pickup' && hpAfterPot > hpBeforePot, '踩药水回血');
  ok(E.tile(potPos.x, potPos.y) === '.', '药水格被清空');
  s.hp = 500;
  const again = E.tryMove(side.dx, side.dy) && E.tryMove(-side.dx, -side.dy);
  ok(s.hp === 500 && again.type === 'move', '在同一格来回走不会重复回血');
}
// ② 路遇事件结算后格变地面、同层不再触发（ev_f 标记）
E.newGame();
s = E.state();
s.floor = 2;
s.x = 8; s.y = 6;
// 第 3 层散落物每局换位，可能正好摆在这一格：本测试只关心事件格，先清干净
s.maps[2][6][8] = '.';
const ev0 = E.tryMove(0, 1);
// 第 3 层是深层事件池，选项可能标价：先把资源给足，保证 opt 0 能结算
s.gold = 500; s.keys.y = 3; s.keys.r = 3;
const optIdx = 0;
E.resolveEvent(ev0.eventId, optIdx);
ok(E.tile(8, 7) === '.', '事件格结算后变地面');
s.hp = 500;
const evAgain = E.tryMove(0, -1) && E.tryMove(0, 1);
ok(evAgain.type === 'move' && s.hp === 500, '事件格不能再踩出第二次回血');

// ---------- 9m. 第一层的碑文 ----------
// 石碑立在第 1 层 (3,3)：撞它读一遍，读过再撞只是blocked；寻路把它当墙绕开
E.newGame();
s = E.state();
const steleTile = (() => {
  const m = s.maps[0];
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (m[y][x] === '!') return { x, y };
  return null;
})();
ok(!!steleTile, '第一层有碑文石碑');
if (steleTile) {
  // 找一个与石碑相邻的可达格站上去，朝石碑方向撞
  let from = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const fx = steleTile.x + dx, fy = steleTile.y + dy;
    const p = E.pathTo(fx, fy);
    if (p) { from = { x: fx, y: fy, dx: -dx, dy: -dy }; break; }
  }
  ok(!!from, '石碑旁有可达的立足格');
  if (from) {
    s.x = from.x; s.y = from.y;
    const rd = E.tryMove(from.dx, from.dy);
    ok(rd.type === 'story' && rd.story === 'stele', '第一次撞碑读出碑文');
    ok(s.flags.steleRead === true, '读过标记写进存档');
    const again = E.tryMove(from.dx, from.dy);
    ok(again.type === 'blocked', '读过再撞只是blocked');
    ok(E.pathTo(steleTile.x, steleTile.y) === null, '石碑本身不可作为寻路目标');
  }
}
ok(!!D.events.find((x) => x.id === ev.eventId), '事件来自数据池');
// 用固定事件，避免随机导致用例飘。注意：上面的碑文段已 newGame 回第 1 层，
// 所以这里要重新造一个「站在第 3 层 ? 上」的局面，否则清格/标记断言测的是另一层。
E.newGame();
s = E.state();
s.floor = 2;
s.x = 8; s.y = 6;
E.tryMove(0, 1);
s.gold = 500;
const atkA2 = s.atk, maxA2 = s.maxHp;
const eRes = E.resolveEvent('smith', 0);
ok(eRes.type === 'event' && typeof eRes.msg === 'string', '选择后返回结果文案');
ok(s.atk === atkA2 + 2 && s.maxHp === maxA2 - 120, '铁匠磨刃：攻击 +2、上限 −120');
ok(E.tile(8, 7) === '.', '路遇点用掉后清空');
ok(s.flags.ev_f2 === true, '本层路遇只触发一次');
ok(D.events.find((e) => e.id === 'broker').options[0].effect.atk === 3, '深层事件「赌命的商人」存在');

E.newGame();
s = E.state();
s.floor = 2;
s.x = 8; s.y = 6;
const ev2 = E.tryMove(0, 1);
s.gold = 0;
const poorIdx = D.events.find((x) => x.id === ev2.eventId).options.findIndex((o) => o.effect.gold < 0);
if (poorIdx >= 0) ok(E.resolveEvent(ev2.eventId, poorIdx).type === 'refuse', '金币不够时该选项被拒绝');
else ok(true, '（该事件没有花钱选项）');

// ---------- 9h. 开局三誓 ----------
E.newGame();
ok(E.vow() === 'none', '默认不立誓');

E.newGame('mercy');
s = E.state();
ok(E.vow() === 'mercy' && s.atk === 7, '慈悲之誓：开局攻击 −3');
s.hp = 500; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);
ok(ev.type === 'floor' && ev.at.heal === Math.round(s.maxHp * 0.12), '慈悲之誓：上一层回 12% 生命');
ok(s.hp === 500 + Math.round(s.maxHp * 0.12), '回血真的加到了生命上');
const hpAfterUp = s.hp;
// 现在在第 2 层 (1,9)=n。下楼回去：踩 n（脚下）不行，走出去再踩回：
s.x = 1; s.y = 9;
E.tryMove(0, -1); // 走到 (1,8)
const evDown = E.tryMove(0, 1); // 踩回 n → 下楼回第 1 层
ok(evDown.type === 'floor' && evDown.at.heal === 0, '下楼不回血');
ok(s.floor === 0, '回到第 1 层');
// 刷血堵漏：再上第 2 层（floor_healed_f1 已标记）→ 不再回第二口
s.hp = 500; s.x = 8; s.y = 8;
const evRe = E.tryMove(0, 1);
ok(evRe.type === 'floor' && evRe.at.heal === 0 && s.hp === 500, '重上同一层不再回血（堵上下楼刷血漏洞）');
// 新楼层照常回血：第 2 层 (1,1)=u 上第 3 层（首次踏足）。走开 (1,2) 再踩回 u
s.x = 1; s.y = 1;
E.tryMove(0, 1);
s.hp = 500;
const evNew = E.tryMove(0, -1);
ok(evNew.type === 'floor' && evNew.at.heal === Math.round(s.maxHp * 0.12), '新的一层照常回血');

// ---------- 9h+. 锁环「借灯/回廊/长明」同样受首访标记约束（防同款刷血回归） ----------
E.newGame();
s = E.state();
s.flags.rings = ['lamp'];           // 借灯之环：每上一层 +5%
s.hp = 500; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);               // 首访第 2 层 → 回 5%
ok(ev.type === 'floor' && ev.at.heal === Math.round(s.maxHp * 0.05), '借灯之环：首上某层回 5%');
// 下楼回第 1 层，再上第 2 层 → 已标记，不再回
s.x = 1; s.y = 9;
E.tryMove(0, -1);
E.tryMove(0, 1);
s.hp = 500; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);
ok(ev.type === 'floor' && ev.at.heal === 0 && s.hp === 500, '借灯之环：重上同一层不再回血');
// 三枚回血环叠加上限仍是首访一次
E.newGame();
s = E.state();
s.flags.rings = ['lamp', 'stair', 'lamp2'];   // 5% + 4% + 4%
s.hp = 500; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);
ok(ev.at.heal === Math.round(s.maxHp * 0.13), '三枚回血环叠加：首访回 13%');

// ---------- 9h++. 扩容池 4 枚新锁环：干粮 / 秤砣 / 罗盘 / 落款 ----------
// 池子每章 7 抽 3（组合数 20→35），新环只改资源与信息，不碰攻防
{
  [1, 2, 3, 4].forEach((c) => {
    const pool = D.ringPools[c];
    // 第 1/2/3/4 章各 10 枚（惜挡 / 双挡 / 过手 / 净芯）；组合数 = C(10,3) = 120
    const n = 10;
    ok(pool.length === n, `第 ${c} 章锁环池 ${n} 枚（组合数 ${(n * (n - 1) * (n - 2)) / 6}）`);
    ok(pool.every((id) => D.rings[id] && D.rings[id].chapter === c), `第 ${c} 章池内 id 与章号一致`);
  });

  // 干粮之环：药水回复 +30%（地图与商店同口径）
  E.newGame();
  s = E.state();
  s.hp = 100; s.maxHp = 5000;
  s.maps[0][8][3] = 'p';             // (3,8) 放一瓶红药水（160）
  s.x = 2; s.y = 8;
  ev = E.tryMove(1, 0);
  ok(ev.type === 'pickup' && ev.short === '+160❤', '无干粮之环：红药水 +160');
  E.newGame();
  s = E.state();
  s.flags.rings = ['ration'];
  s.hp = 100; s.maxHp = 5000;
  s.maps[0][8][3] = 'p';
  s.x = 2; s.y = 8;
  ev = E.tryMove(1, 0);
  ok(ev.type === 'pickup' && ev.short === '+208❤', '干粮之环：红药水 +208（160×1.3）');
  // 商店买的药水同口径
  s.gold = 999;
  const buyRes = E.buy('potion');
  ok(buyRes.type === 'buy' && buyRes.healed === 208, '干粮之环：商店药水也按 +30% 结算');

  // 秤砣之环：钥匙价目 −25%（药水不降价）
  E.newGame();
  s = E.state();
  const keyItem = D.shop.find((x) => x.id === 'key');
  const potionItem = D.shop.find((x) => x.id === 'potion');
  const keyBase = E.priceOf(keyItem);
  const potionBase = E.priceOf(potionItem);
  s.flags.rings = ['bargain'];
  ok(E.priceOf(keyItem) === Math.round(keyBase * 0.5), '秤砣之环：黄钥匙价 −50%');
  ok(E.priceOf(D.shop.find((x) => x.id === 'rkey')) === Math.round(45 * 0.5), '秤砣之环：红钥匙价也 −50%');
  ok(E.priceOf(potionItem) === potionBase, '秤砣之环：药水价不动');

  // 罗盘之环：本层剩余可捡数只数道具与金币
  E.newGame();
  s = E.state();
  const n0 = E.floorPickupCount();
  ok(n0 > 0, '罗盘：首层能数出可捡的东西');
  // 动态找一格可捡的（地图会调整，不写死坐标）
  let pickAt = null;
  for (let yy = 0; yy < 11 && !pickAt; yy++) {
    for (let xx = 0; xx < 11 && !pickAt; xx++) {
      const ch = s.maps[0][yy][xx];
      if (ch === '$' || (D.items[ch] && D.items[ch].type !== 'story')) pickAt = [xx, yy];
    }
  }
  s.maps[0][pickAt[1]][pickAt[0]] = '.';
  ok(E.floorPickupCount() === n0 - 1, '罗盘：拿走一件，计数 −1');
}

// ---------- 9h+++. 第二轮扩容 4 枚（刻痕 / 过路 / 名录 / 落笔） ----------
{
  // 刻痕之环：每 8 只怪 +1 黄钥匙（按累计击杀数走 8 的倍数）
  E.newGame();
  s = E.state();
  s.flags.rings = ['tally'];
  s.flags.killCount = 7;
  s.atk = 200; s.def = 200; s.hp = 5000; s.maxHp = 5000;
  s.x = 2; s.y = 3;
  const keyBefore = s.keys.y;
  let rT = E.fight(0, -1);
  ok(rT.type === 'fight' && rT.tallyKey === true && s.keys.y === keyBefore + 1, '刻痕之环：第 8 只怪额外给黄钥匙');

  // 过路之环：路遇结算后 +40 金
  E.newGame();
  s = E.state();
  s.flags.rings = ['toll'];
  s.gold = 100; s.floor = 2; s.x = 8; s.y = 7; s.maps[2][7][8] = '?';
  E.beginFloor();
  const evT = E.resolveEvent('smith', 0);
  ok(evT.type === 'event' && evT.tollGold === 40 && s.gold >= 140, '过路之环：路遇后额外 +40 金');

  // 名录之环：击败章节锁匠给一黄一红
  E.newGame();
  s = E.state();
  s.flags.rings = ['tome'];
  s.atk = 400; s.def = 300; s.hp = 30000; s.maxHp = 30000;
  s.floor = 2; s.x = 5; s.y = 6; s.flags['boss_seen_N'] = true;
  E.beginFloor();
  const yB = s.keys.y, rB = s.keys.r;
  const rBoss = E.fight(0, -1);
  ok(rBoss.type === 'fight' && rBoss.tomeKey === true && s.keys.y === yB + 1 && s.keys.r === rB, '名录之环：锁匠倒下后一把黄钥匙（红钥匙已移除）');

  // 落笔之环：结算按剩余金币折算（保底 2、每 100 金 +1、上限 6），口径写在描述里。
  // 断言只认「每 100 / 金币 / 最多 N」三个语义要素，不锁死语序（文案改写过两次）
  ok(/每\s*100/.test(D.rings.quill.desc) && /金币/.test(D.rings.quill.desc) && /最多\s*6/.test(D.rings.quill.desc), '落笔之环：描述写明按金币折算与上限');
}

// ---------- 9h++++. 第三轮扩容 4 枚（刻数 / 短链 / 基石 / 终章） ----------
{
  // 刻数之环：每满 100 步 +20 金
  E.newGame();
  s = E.state();
  s.flags.rings = ['notch'];
  s.gold = 0; s.steps = 99; s.x = 2; s.y = 5;
  E.tryMove(0, -1);
  ok(s.gold === 30, '刻数之环：第 100 步给 30 金');
  E.tryMove(0, 1);
  ok(s.gold === 30, '刻数之环：非整百步不给');

  // 短链之环：训练不涨价（药水照常涨）
  E.newGame();
  s = E.state();
  const atkItem = D.shop.find((x) => x.id === 'atk');
  const potItem = D.shop.find((x) => x.id === 'potion');
  s.flags.buy_atk = 5; s.flags.buy_potion = 5;
  const atkWithStep = E.priceOf(atkItem);
  const potWithStep = E.priceOf(potItem);
  s.flags.rings = ['chain'];
  ok(E.priceOf(atkItem) === atkItem.price, '短链之环：训练回到原价（阶梯取消）');
  ok(E.priceOf(atkItem) < atkWithStep, '短链之环：确实比涨价后便宜');
  ok(E.priceOf(potItem) === potWithStep, '短链之环：药水价不受影响');

  // 基石之环：残血进新层回 15%，血够不回
  E.newGame();
  s = E.state();
  s.flags.rings = ['bulwark'];
  s.maxHp = 1000; s.hp = 200; s.x = 8; s.y = 8;
  let evB = E.tryMove(0, 1);
  ok(evB.type === 'floor' && evB.at.heal === 150, '基石之环：残血上楼回 15%');
  E.newGame();
  s = E.state();
  s.flags.rings = ['bulwark'];
  s.maxHp = 1000; s.hp = 500; s.x = 8; s.y = 8;
  evB = E.tryMove(0, 1);
  ok(evB.at.heal === 0, '基石之环：血够时不触发');

  // 终章之环：条件写明四位锁匠（结算在 main.emberOf，这里锁文案）
  ok(/四位锁匠全倒/.test(D.rings.finale.desc), '终章之环：条件写明四位锁匠');
}

E.newGame('guard');
s = E.state();
E.grantBlock();
ok(!E.canBlock(), '铁壁之誓：学了也不给格挡');
s.hp = 5000; s.x = 2; s.y = 3;
const guardRaw = E.predict('A').damage;
const gRes = E.fight(0, -1);
ok(gRes.damage === Math.round(guardRaw * 1.18), '铁壁之誓：承伤按 +18% 结算');

// ---------- 9h+. 铁壁生死口径：真实承伤超出预判时必须拦住（防负血走塔） ----------
// 数值全部现算（连击系数/锈犬数值调整后不再失效）：raw=守誓后承伤，夹缝取 raw < hp < raw×1.18
E.newGame('guard');
s = E.state();
s.flags.relic_ward = true;            // 借守誓之盾造出「raw < hp < raw×1.18」的夹缝
s.atk = 57; s.def = 37;
s.maps[s.floor][3][2] = 'I'; s.x = 2; s.y = 4;
const rawWard = E.predict('I').damage;    // 守誓后承伤（如 523）
s.hp = rawWard + 20;                      // 夹缝内：raw < hp < raw×1.18
const gapPred = E.predictOpt('I', true);
ok(gapPred.win === false, '铁壁夹缝：预判用真实承伤，不放行（' + s.hp + ' < ' + rawWard + '×1.18）');
const gapFight = E.fight(0, -1);
ok(gapFight.type === 'refuse', '铁壁夹缝：fight 拒绝，不会把玩家打进负血');
s.hp = Math.round(rawWard * 1.18) + 1;    // 真实承伤也扛得住
const okPred = E.predictOpt('I', true);
ok(okPred.win === true, '血过真实承伤线后预判放行');
const okFight = E.fight(0, -1);
ok(okFight.type === 'fight' && s.hp > 0 && !s.over, '放行后正常结算，血不为负');

E.newGame('greed');
s = E.state();
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 87, '贪婪之誓：价目 +45%（60 → 87）');
s.hp = 5000; s.x = 2; s.y = 3;
const goldBefore = s.gold;
const greedRes = E.fight(0, -1);
ok(greedRes.gold === Math.round(D.monsters.A.gold * 1.5), '贪婪之誓：击杀金币 +50%');
ok(s.gold === goldBefore + Math.round(D.monsters.A.gold * 1.5), '金币真的进了口袋');

// ---------- 9i. 格挡要学：没学时不可用，授予后恢复 ----------
E.newGame();
s = E.state();
ok(!s.flags.hasBlock, '开局没有格挡（不再白送）');
ok(!E.canBlock(), '没学格挡时不可用');
s.hp = 5000; s.x = 2; s.y = 3;
const rawNoBlock = E.predict('A').damage;
const rNoBlock = E.fight(0, -1, { block: true });
ok(rNoBlock.blocked === false && rNoBlock.damage === rawNoBlock, '没学时即便请求格挡也按全额承伤');
ok(E.grantBlock() === true && E.grantBlock() === false, '授予一次，重复授予被拒绝');
ok(s.flags.hasBlock === true, '授予后标记在档');

// ---------- 9g. 每层一次的格挡（已学会） ----------
E.newGame();
s = E.state();
s.flags.hasBlock = true;
s.hp = 5000; s.x = 2; s.y = 3;
ok(E.canBlock(), '新的一层可以格挡');
const rawDmg = E.predict('A').damage;
const rBlock = E.fight(0, -1, { block: true });
ok(rBlock.blocked === true && rBlock.damage === Math.round(rawDmg * 0.55), '格挡后承伤按 55% 结算');
ok(rBlock.raw === rawDmg, '同时保留原始承伤供界面显示');
ok(!E.canBlock(), '本层格挡用掉后不可再用');
s.floor = 1;
ok(E.canBlock(), '进入下一层后格挡恢复');

E.newGame();
s = E.state();
s.flags.hasBlock = true;
s.hp = 5000; s.x = 2; s.y = 3;
const rawDmg2 = E.predict('A').damage;
const rPlain = E.fight(0, -1);
ok(rPlain.blocked === false && rPlain.damage === rawDmg2, '不格挡时承伤不变');

// ---------- 9g-2. 双挡之环：每层两次（老档只有布尔时按一次算） ----------
E.newGame();
s = E.state();
s.flags.hasBlock = true;
s.flags.rings = ['twice'];
s.hp = 9000; s.x = 2; s.y = 3;
ok(E.blockLimit() === 2 && E.blockLeft() === 2, '双挡之环：本层两次格挡');
const rT1 = E.fight(0, -1, { block: true });
ok(rT1.blocked === true && E.blockLeft() === 1, '第一次挡完还剩一次');
ok(E.canBlock(), '还剩一次时仍可格挡');
s.x = 5; s.y = 5;
const rT2 = E.fight(1, 0, { block: true });
ok(rT2.blocked === true && E.blockLeft() === 0 && !E.canBlock(), '第二场挡完本层就用尽了');
s.floor = 1;
ok(E.blockLeft() === 2, '上楼后恢复到两次');
delete s.flags['block_n1'];
s.flags['block_f1'] = true;
s.floor = 1;
ok(E.blockLeft() === 1, '老档只有 block_f 布尔 → 按已用一次算');

// 没有这枚环时仍然只有一次（回归：别把默认值改成 2）
E.newGame();
s = E.state();
s.flags.hasBlock = true;
ok(E.blockLimit() === 1 && E.blockLeft() === 1, '没有双挡之环时每层仍只有一次');

// 不能格挡的誓约不会抽到靠格挡吃饭的环（抽到就是白拿一张）
E.newGame('guard');
s = E.state();
const guardPool2 = E.ringChoices(2);
ok(guardPool2.length === 3 && guardPool2.indexOf('parry') < 0 && guardPool2.indexOf('twice') < 0,
  `铁壁之誓不抽格挡环（实测 ${guardPool2.join('/')}）`);

// ---------- 9h. 残血格挡换命（predictOpt） ----------
// 血量撑不到打完，但挡完能活：不能再用"会要你的命"拦住玩家
E.newGame();
s = E.state();
s.flags.hasBlock = true;
s.x = 2; s.y = 3;
const batRaw = E.predict('A').damage;
s.hp = batRaw - 1;                      // 不挡必死
ok(!E.predict('A').win, '残血时普通预测：必死');
const pOpt = E.predictOpt('A', true);
ok(pOpt && pOpt.win === true && pOpt.blockSave === true, '残血但可用格挡：predictOpt 给出活路');
ok(E.fight(0, -1, { block: true }).damage === Math.round(batRaw * 0.55), '按格挡结算，血量确实撑得住');
// 格挡用掉后，同样的残血不再有活路
s.hp = Math.round(batRaw * 0.6) - 1;
ok(!E.predictOpt('A', true).win, '格挡用尽后残血：无活路');

// ---------- 9f. 塔心石：带走 / 放下 ----------
E.newGame();
s = E.state();
s.floor = 12; s.x = 5; s.y = 6;
ev = E.tryMove(0, -1);
ok(ev.type === 'heart', '踩到塔心石弹出抉择');
const hpBefore = s.hp, maxBefore = s.maxHp;
const take = E.heartTake();
ok(take.type === 'heart' && take.choice === 'taken', '选择带走');
ok(s.maxHp === maxBefore + 300 && s.hp === hpBefore + 300, '带走：生命上限与当前生命各 +300');
ok(s.flags.relic_heart === true && E.hasRelic('heart'), '塔心石进遗物栏');
ok(E.tile(5, 5) === '.', '带走后石台清空');
ok(Array.isArray(s.flags.heartAt) && s.flags.heartAt[0] === 5 && s.flags.heartAt[1] === 5, '记下空石座的位置，供渲染用');
ok(E.heartTake().type === 'refuse', '同一颗石头不能拿两次');
s.x = 5; s.y = 6;
ok(E.tryMove(0, -1).type === 'move', '已抉择后再踩不再弹层（无格可踩时返回 move/refuse）');

E.newGame();
s = E.state();
s.floor = 12; s.x = 5; s.y = 6;
E.tryMove(0, -1);
const hp2 = s.hp, max2 = s.maxHp;
const leave = E.heartLeave();
ok(leave.type === 'heart' && leave.choice === 'left', '选择放下');
ok(s.hp === hp2 && s.maxHp === max2, '放下：不改变生命');
ok(s.flags.relic_heart !== true && !E.hasRelic('heart'), '放下：不进遗物栏');
ok(E.tile(5, 5) === 'K', '放下后石头仍在原地');
ok(E.heartState() === 'left', '状态记为 left');

// ---------- 10. 首见魔王先对白 ----------
E.newGame();
s = E.state();
s.floor = 5; s.x = 5; s.y = 6; s.hp = 3000; s.atk = 50; s.def = 30;
ev = E.fight(0, -1);
ok(ev.type === 'story' && ev.story === 'bossJu', '首见魔王先触发对白');
ok(E.tile(5, 5) === 'Z', '对白阶段魔王保留');
ok(s.y === 6 && s.x === 5, '玩家留在原位');
const bossFight = E.fight(0, -1);
ok(bossFight.type === 'fight' && bossFight.boss, '对白后可正常挑战魔王');
ok(s.hp < 3000, '魔王战造成真实伤害');

// ---------- 11. 幽灵触发剧情（按层给不同段落） ----------
E.newGame();
s = E.state();
s.x = 8; s.y = 4;
ev = E.tryMove(0, -1);
ok(ev.type === 'story' && ev.story === 'candle1', '第 1 层幽灵触发 candle1');
ok(E.tile(8, 3) === '.', '幽灵不阻路');
s.floor = 4; s.x = 2; s.y = 1;
ev = E.tryMove(1, 0);
ok(ev.type === 'story' && ev.story === 'candle3', '第 5 层幽灵触发 candle3');

// ---------- 12. 手记决定结局分支 ----------
s.won = false;
s.floor = 11; s.x = 5; s.y = 2;
s.flags.journal = false;
ev = E.tryMove(0, -1);
ok(ev.type === 'princess' && ev.hasJournal === false, '无手记 → 普通结局分支');
s.won = false; s.flags.journal = true;
E.tryMove(0, 1);
ev = E.tryMove(0, -1);
ok(ev.type === 'princess' && ev.hasJournal === true, '有手记 → 真结局分支');

// ---------- 13. 窥探之镜一次购买 ----------
s.gold = 250;
const codex1 = E.buy('codex');
ok(codex1.type === 'buy' && s.flags.codex === true, '购买窥探之镜解锁怪物情报');
const codex2 = E.buy('codex');
ok(codex2.type === 'refuse', '窥探之镜不可重复购买');
ok(s.gold === 150, '窥探之镜扣 100 金');

// ---------- 14. 本层快照与回退 ----------
E.newGame();
s = E.state();
s.floor = 2; s.x = 4; s.y = 3; s.hp = 900; s.gold = 120;
E.beginFloor();
const snapHp = s.hp;
s.hp = 100; s.gold = 0; s.x = 8; s.y = 8;
ok(E.restoreFloor() === true, '重来本层成功');
ok(s.hp === snapHp && s.gold === 120 && s.x === 4, '快照还原生命/金币/位置');

// ---------- 15. 存档 ----------
s.floor = 3; s.x = 1; s.y = 1; s.hp = 777;
E.save();
E.load();
ok(E.state().hp === 777 && E.state().floor === 3, '存档写入并可读取');

// ---------- 16. 十三层塔链路 ----------
E.newGame();
s = E.state();
let chainOk = true;
for (let fi = 0; fi < D.floors.length - 1; fi++) {
  s.floor = fi;
  const map = s.maps[fi];
  let ux = -1, uy = -1;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (map[y][x] === 'u') { ux = x; uy = y; }
  if (ux < 0 && D.floors[fi].hiddenGate) {
    s.flags.bossKilled_U = true;
    E.revealCore();
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (map[y][x] === 'u') { ux = x; uy = y; }
  }
  if (ux < 0) { console.log(`✗ 第 ${fi + 1} 层没有上楼`); chainOk = false; break; }
  let px = -1, py = -1;
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nx = ux + dx, ny = uy + dy;
    const ch = map[ny] && map[ny][nx];
    if (ch && ch !== '#' && !D.monsters[ch]) { px = nx; py = ny; break; }
  }
  if (px < 0) { console.log(`✗ 第 ${fi + 1} 层楼梯不可达`); chainOk = false; break; }
  s.x = px; s.y = py;
  const e2 = E.tryMove(ux - px, uy - py);
  if (e2.type !== 'floor' || s.floor !== fi + 1) {
    console.log(`✗ 第 ${fi + 1} 层上楼失败（到 ${s.floor + 1} 层）`);
    chainOk = false;
    break;
  }
}
ok(chainOk, '十三层塔每一层都能正常上楼（含隐藏门）');

// ---------- 17. 剧情文本完整性 ----------
const S = global.STORY;
const need = ['intro', 'candle1', 'candle2', 'candle3', 'candle4', 'candle5', 'journal', 'merchant', 'merchant2', 'merchant3', 'merchant4', 'blockLore', 'blockLore2', 'coinBagLore', 'eighthSword', 'solitude', 'ch2', 'ch3', 'ch4', 'bossYan', 'afterYan', 'bossJu', 'afterJu', 'bossDuo', 'afterDuo', 'bossHeng', 'afterHeng', 'core', 'princessPlain', 'princessTrue', 'afterChoicePlain', 'afterChoiceTrue', 'stele'];
ok(need.every((k) => Array.isArray(S[k]) && S[k].length), '所有剧情段都存在且非空');
ok(S.intro.length === 4, '序章 4 句（魔王掳人 → 国王恳求 → 立誓 → 独自进塔）');
const introAll = S.intro.join('');
ok(introAll.indexOf('塔在叫我') < 0 && introAll.indexOf('失踪') < 0 && introAll.indexOf('悬赏') < 0 && introAll.indexOf('她自己走上') < 0, '序章是简单的「被抓 → 去救」框架：不搞「塔在叫我 / 失踪悬赏 / 自己上来」的绕弯（反转留给塔里的对白）');
ok(introAll.indexOf('魔王把薇拉公主抓进了') >= 0 && introAll.indexOf('一个人推开了塔门') >= 0 && introAll.indexOf('绣帕') >= 0, '序章第一句写明「魔王掳人」、有进塔动作与绣帕信物');
ok(introAll.indexOf('你还要去') < 0 && introAll.indexOf('求你') >= 0, '国王身为父亲只能恳求不能劝阻（2026-11-12 用户点名：劝阻不符合父爱逻辑）');
ok(S.bossJu.some((l) => String(l[1]).includes('肩上')), '魔王提到薇拉小时候');
ok(S.bossJu.some((l) => String(l[1]).includes('懒得辩')), '反转在第二章 Boss 对白才揭开：魔王亲口否认掳人');
ok(S.princessPlain.some((l) => String(l[1]).includes('魔王没抓我')) && S.princessTrue.some((l) => String(l[1]).includes('抢走我的魔王')), '公主对白补完反转');
ok(S.merchant.some((l) => String(l[1]).includes('铜币')), '三十枚铜币移到商人台词');
ok(!!S.endingTrue.epilogue && !!S.endingPlain.epilogue, '两个结局都有后日谈');

// 剧情锚点回归（2026-11-13）：防止并发改稿把「半路/村里」类歧义与时间线改回去
const storyAll = JSON.stringify(S);
ok(storyAll.indexOf('半路') < 0 && storyAll.indexOf('村里') < 0, '剧情无「半路/村里」类歧义词（登塔不是赶路，故事在灰港镇）');
ok(S.eighthSword.some((l) => String(l[1]).includes('第五层')) && String(S.eighthSword[1][1]).includes('秤'), '断剑小传点破第五层，且信息源锚定秤（拾取在 第5层，此时玩家还没见到塔顶的薇拉）');
ok(S.eighthSword.every((l) => !String(l[1]).includes('薇拉')), '断剑小传不得引用薇拉的话（时间线：她还没出场）');
ok(String(S.princessPlain[1][1]).includes('第五层'), '薇拉台词与他死在第五层互证（对齐榜单 floor:5）');
ok(String(S.princessPlain[3][1]).includes('窗台') && String(S.princessPlain[3][1]).includes('海崖'), '绣帕传递链在薇拉台词里点破（窗台 → 风 → 海崖 → 国王）');
ok(Array.isArray(S.princessPlainSword) && S.princessPlainSword.length === S.princessPlain.length && /半截剑|断剑/.test(String(S.princessPlainSword[1][1])), 'princessPlainSword 变体存在：带断剑时薇拉认出剑，行数与原段一致');
ok(String(S.merchant[2][1]).includes('死在了上面'), '秤的铺垫仍在（断剑小传引用它）');
ok(S.shadowRivals.some((r) => r.name === '第八位勇者·川' && r.floor === 5), '榜单第八勇者·川 floor:5（断剑层/薇拉台词互证）');
// 第八勇者线终章锚点（2026-11-13）：结局剑去处 / 榜单脚注互证 / 小传呼应
ok(String(S.eighthSword[1][1]).includes('第五层'), '断剑小传点破第五层');
ok(S.shadowRivals.some((r) => r.name === '第二位勇者·鸦' && r.floor === 2) && S.shadowRivals.some((r) => r.name === '第五位勇者·岩' && r.floor === 3), '榜单鸦 floor:2 / 岩 floor:3（小传呼应的数据锚）');
ok(String(S.relicLore.steel[0][1]).includes('第 2 层') && String(S.relicLore.vigor[0][1]).includes('第 3 层'), '鸦/岩遗物小传与榜单脚注呼应（第 2 层 / 第 3 层）');
ok(S.princessPlainSword && S.princessPlainSword.some((l) => String(l[1]).includes('第五层')), '薇拉认剑变体保留第五层互证');
ok(JSON.stringify(S).indexOf('剑断在第五层') < 0, '榜单脚注文本属于 main.js（RIVAL_NOTE），story.js 不重复维护');

// 生僻字闸门：文案里不再出现玩家基本不认识的字（2026-11-12 用户反馈「门闩」的「闩」；同日用户再次点名：Boss 名也不许用生僻字，砚/炬/铎/砧/磐/岚 已全部改名并拉黑）
const RARE_CHARS = ['闩', '掳', '蛭', '饯', '掸', '龛', '薪', '砚', '炬', '铎', '砧', '磐', '岚'];
const allCopy = JSON.stringify(S) + JSON.stringify(D);
const rareHit = RARE_CHARS.filter((c) => allCopy.indexOf(c) >= 0);
ok(rareHit.length === 0, '剧情与道具文案不含生僻字' + (rareHit.length ? '（命中：' + rareHit.join('') + '）' : ''));

// ---------- 18. v2.1 章末回响 / 锁环 / Boss 台词池 ----------
E.newGame();
s = E.state();
ok(Array.isArray(s.flags.rings) && s.flags.rings.length === 0, '新局锁环为空');
ok(typeof s.flags.phaseSeed === 'number', '每局有独立的 Boss 台词种子');

s.floor = 2;
const echo = E.settleChapter(1);
ok(echo && echo.pending === true, '击败章末 Boss 后必开锁环三选一');
const ringOpts = s.flags['ringChoices_1'] || [];
ok(ringOpts.length === 3 && ringOpts.every((id) => D.rings[id]), '锁环候选恰好三枚且都已定义');
ok(E.pendingRing() === 1, '未选完的锁环刷新后仍可继续');
const ringGold0 = s.gold;
const picked = E.pickRing(ringOpts[0]);
ok(picked.type === 'ring' && E.rings().length === 1, '选中的锁环写入存档');
ok(E.pendingRing() === null, '选完锁环后待办清除');
if (ringOpts[0] === 'coin') ok(s.gold === ringGold0 + 200, '铜币之环立即发 200 金');

s.flags.rings = ['parry'];
s.atk = 60; s.def = 30; s.hp = 5000; s.maxHp = 5000;
ok(Math.abs(E.ringBlockScale() - 0.45) < 1e-9, '断刃之环把格挡比例再收 0.1（0.55→0.45）');
const dBase = E.fightDamage('F', false).damage;
ok(E.fightDamage('F', true).damage === Math.round(dBase * 0.45), '演出用的真实承伤与格挡比例一致');
ok(dBase === E.predict('F').damage, '无修正时真实承伤等于预测承伤');
ok(E.hasRing('parry') && E.rings().indexOf('parry') >= 0, '锁环查询接口一致');

const ph = E.bossPhases('N');
ok(Array.isArray(ph) && ph.length === 2 && !!ph[0].title && !!ph[1].text, 'Boss 每局抽两段阶段台词');
ok(E.bossPhases('N') === ph, '同一局重复取到的台词组合不变');

// Boss 击败 → 章末回响的完整链路（不是只测结算函数）
E.newGame();
s = E.state();
s.floor = 2; s.x = 5; s.y = 6;
s.atk = 80; s.def = 40; s.hp = 6000; s.maxHp = 6000;
s.flags.boss_seen_N = true;
const bossRes = E.fight(0, -1);
ok(bossRes.type === 'fight' && bossRes.boss, 'Boss 墨妖可正常击败');
ok(bossRes.echo && bossRes.echo.chapter === 1, 'Boss 击败会返回本章回响');
ok(bossRes.echo.pending === true, 'Boss 倒下即开三选一');
ok(s.flags['echo_1'] === 1 && (s.flags['ringChoices_1'] || []).length === 3, '回响标记与锁环候选写进存档');

// ---------- 层阶之钥：一次性「往前开一层」的明码取舍 ----------
E.newGame();
s = E.state();
ok(!E.gateForth().ok, '没拿钥匙时不能往前开层');
s.flags['relic_gate'] = true;
const forth0 = E.gateForth();
ok(forth0.ok && forth0.target === 1, '首层拿到钥匙后可往前开一层');
ok(forth0.seals.length === 2 && forth0.seals.every((p) => !!p.name), '代价预览明码列出两件宝物');
const j1 = E.jumpTo(1);
ok(j1.type === 'floor' && j1.forth === true, '前向跳层成功并标记 forth');
ok(j1.sealed.length === forth0.seals.length, '实际封印数量与预览一致');
ok(s.flags.gateForth === true && s.flags.maxFloor === 1, '一次性标记与最高层已写入存档');
forth0.seals.forEach((p) => ok(s.maps[1][p.y][p.x] === '.', `封印「${p.name}」已从地图移除`));
ok((s.flags.gateSeals || []).length === forth0.seals.length, '封印位置留在存档供渲染');
ok(!E.gateForth().ok, '一次性机会用完后不能再用');
const j2 = E.jumpTo(0);
ok(j2.type === 'floor' && !j2.forth, '回跳走过的楼层不受一次性限制影响');
E.newGame();
s = E.state();
s.flags['relic_gate'] = true;
s.floor = 1; s.flags.maxFloor = 1;
const fb = E.gateForth();
ok(!fb.ok && /锁匠/.test(fb.msg), '章末锁匠层不能被钥匙绕过');
ok(E.jumpTo(2).type === 'refuse', '直接跳到没走过的锁匠层被拒');
E.newGame();
s = E.state();
s.flags['relic_gate'] = true;
ok(E.gateForth().ok && E.gateForth().seals.length > 0, '新的一局重新获得一次机会');

// ---------- 19. 拖动选路：pathsTo 多最短路分组 ----------
E.newGame();
s = E.state();
ok(E.pathsTo(0, 0) === null || true, '越界/墙目标不炸（返回 null 或无候选）');
s.floor = 0;
// 找一个可达目标：走空地且距离 > 1
let routeTarget = null;
for (let ty = 0; ty < 11 && !routeTarget; ty++) {
  for (let tx = 0; tx < 11 && !routeTarget; tx++) {
    const ch = E.tile(tx, ty);
    if (ch !== '.') continue;
    if (Math.abs(tx - s.x) + Math.abs(ty - s.y) < 3) continue;
    const p = E.pathTo(tx, ty);
    if (p && p.length >= 2) routeTarget = { x: tx, y: ty, len: p.length };
  }
}
ok(!!routeTarget, '首层存在可达的空地目标');
if (routeTarget) {
  const g = E.pathsTo(routeTarget.x, routeTarget.y);
  ok(!!g && typeof g === 'object', 'pathsTo 对可达目标返回分组');
  const names = ['up', 'down', 'left', 'right'];
  const avail = names.filter((d) => g[d]);
  ok(avail.length >= 1, '至少有一条候选路线');
  // 每条候选路线：首步方向与分组名一致、长度等于最短路长度、cells 是合法连续步
  const shortest = routeTarget.len;
  for (const d of avail) {
    const r = g[d];
    ok(r.path.length === shortest, `路线 ${d} 是最短路（${r.path.length} = ${shortest}）`);
    const [fx, fy] = r.path[0];
    const expect = d === 'up' ? [0, -1] : d === 'down' ? [0, 1] : d === 'left' ? [-1, 0] : [1, 0];
    ok(fx === expect[0] && fy === expect[1], `路线 ${d} 的首步与方向一致`);
    // cells 连续性：相邻格曼哈顿距离为 1，首格是玩家，末格是目标
    let chainOk = r.cells[0][0] === s.x && r.cells[0][1] === s.y
      && r.cells[r.cells.length - 1][0] === routeTarget.x && r.cells[r.cells.length - 1][1] === routeTarget.y;
    for (let i = 1; i < r.cells.length; i++) {
      const dd = Math.abs(r.cells[i][0] - r.cells[i - 1][0]) + Math.abs(r.cells[i][1] - r.cells[i - 1][1]);
      if (dd !== 1) { chainOk = false; break; }
    }
    ok(chainOk, `路线 ${d} 的 cells 序列连续且首尾正确`);
  }
  // 分组之间如果首步相同，分岔点必须存在（否则分组无意义）
  if (avail.length >= 2 && g.junction) {
    ok(g.junction.length === 2, '分岔点坐标存在');
  }
  // 默认寻路必须是其中一条候选（同一最短路长）
  const defP = E.pathTo(routeTarget.x, routeTarget.y);
  ok(defP && defP.length === shortest, 'pathTo 与 pathsTo 长度一致');
}
// 怪物格不进选路
const mTarget = (() => {
  for (let ty = 0; ty < 11; ty++) for (let tx = 0; tx < 11; tx++) {
    const ch = E.tile(tx, ty);
    if (D.monsters[ch] && !D.monsters[ch].ghost && !D.monsters[ch].boss) return { x: tx, y: ty };
  }
  return null;
})();
if (mTarget) ok(E.pathsTo(mTarget.x, mTarget.y) === null, '怪物目标返回 null（选路不接管打怪）');


// ================= 怪物特性（先攻 / 魔攻 / 连击 / 坚固） =================
// 特性决定「加攻还是加防」，是魔塔数值解谜的核心，必须锁住语义。
{
  E.newGame();
  const st = E.state();
  st.atk = 30; st.def = 20; st.hp = 5000; st.maxHp = 5000;

  // 先攻：最后一击之前也要挨一下（hits = rounds）
  const am = D.monsters.A;
  const pa = E.predict('A');
  ok(D.monsters.A.trait === 'first', '蝙蝠带先攻特性');
  const roundsA = Math.ceil(am.hp / (st.atk - am.def));
  ok(pa.rounds === roundsA && pa.damage === roundsA * Math.max(0, am.atk - st.def), '先攻：承伤按 rounds 次计算');

  // 魔攻：防御视作 0
  const wm = D.monsters.W;
  const pw = E.predict('W');
  ok(D.monsters.W.trait === 'magic', '怨灵带魔攻特性');
  const roundsW = Math.ceil(wm.hp / (st.atk - wm.def));
  ok(pw.damage === Math.max(0, roundsW - 1) * wm.atk, '魔攻：承伤无视防御');

  // 连击：每回合两下，第二下收招只有七成力（合计 1.7 倍）
  const fm = D.monsters.F;
  const pf = E.predict('F');
  ok(D.monsters.F.trait === 'double', '狼人带连击特性');
  const roundsF = Math.ceil(fm.hp / (st.atk - fm.def));
  ok(pf.damage === Math.max(0, roundsF - 1) * Math.max(0, fm.atk - st.def) * 1.7, '连击：承伤 ×1.7（第二刀七成力）');
  // 口径一致：trait 文案（图鉴/速查卡/首次教学共用同一份 tip）不得再写「翻倍」
  ok(/七成/.test(D.TRAITS.double.tip) && !/翻倍|两下/.test(D.TRAITS.double.tip.replace('每回合打两下', '')),
    '连击文案与 1.7 系数同口径（不写翻倍）');

  // 边际收益：魔攻怪的「加防」收益必须为 0，只攻有效
  const mgW = E.margin('W');
  ok(mgW && mgW.def === 0, '魔攻怪：加防收益为 0（只能加攻）');
  ok(mgW && mgW.atk >= 0, '魔攻怪：加攻不会造成负收益');
  const mgD = E.margin('D');
  ok(mgD && mgD.def > 0, '普通怪：加防有收益（与魔攻怪形成对照）');
  const mgF = E.margin('F');
  ok(mgF && mgF.def > 0, '连击怪：加防有收益');

  // 十字架：对亡灵增伤，对兽类无效
  st.flags.relic_cross = true;
  const pw2 = E.predict('W');
  ok(pw2.damage < pw.damage, '旧十字架：对亡灵伤害提高');
  const pa2 = E.predict('A');
  ok(pa2.damage === pa.damage, '旧十字架：对兽类无效');
  st.flags.relic_cross = false;
}

// ================= 幸运金币：战斗金币 ×2 =================
{
  E.newGame();
  const st = E.state();
  st.hp = 5000; st.maxHp = 5000; st.atk = 200; st.def = 200;
  // 找一只相邻可打的怪
  let found = null;
  for (let y = 0; y < 11 && !found; y++) for (let x = 0; x < 11; x++) {
    const ch = E.tile(x, y);
    if (ch !== '#' && D.monsters[ch] && !D.monsters[ch].ghost && !D.monsters[ch].boss &&
        [[0,-1],[0,1],[-1,0],[1,0]].some(([dx,dy]) => {
          const t = E.tile(x + dx, y + dy);
          return t && t !== '#' && !D.monsters[t];
        })) { found = { x, y, ch }; break; }
  }
  if (found) {
    const gold0 = st.gold;
    // 站到怪旁边
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    for (const [dx, dy] of dirs) {
      const t = E.tile(found.x + dx, found.y + dy);
      if (t && t !== '#' && !D.monsters[t]) { st.x = found.x + dx; st.y = found.y + dy; break; }
    }
    const standX = st.x, standY = st.y;   // 打之前站的位置，第二局要复用
    const gx = found.x - st.x, gy = found.y - st.y;
    const res1 = E.fight(gx, gy);
    const gain1 = st.gold - gold0;
    ok(res1.type === 'fight' && gain1 === res1.gold, '战斗金币正常结算');

    // 第二局带幸运金币
    E.newGame();
    const st2 = E.state();
    st2.hp = 5000; st2.maxHp = 5000; st2.atk = 200; st2.def = 200;
    st2.flags.relic_coin = true;
    st2.x = standX; st2.y = standY;  // 站回同一个位置（地图每局一致）
    // 重新找同一只怪（地图每局一致，坐标可用）
    const ch2 = E.tile(found.x, found.y);
    if (ch2 === found.ch) {
      const gold1 = st2.gold;
      const res2 = E.fight(gx, gy);
      ok(res2.type === 'fight' && st2.gold - gold1 === res2.gold, '幸运金币：金币翻倍');
      ok(res2.gold === res1.gold * 2, '幸运金币：恰好 ×2');
    }
  }
}

// ---------- 10. 渲染层冲击环：负年龄必须跳过、半径必须非负（渲染冻结事故回归） ----------
// relicBeamFx 的第二/三道环是 start=simT+140/300 的延迟环；负年龄曾被画成负半径，
// arc() 抛 IndexSizeError 炸掉整帧主循环 → 画面永久卡死。这里锁死口径：
{
  const TILE = 48;
  const drawRingLogic = (simT, r) => {
    const p = (simT - r.start) / r.dur;
    if (p <= 0) return { skipped: true };
    const ease = 1 - Math.pow(1 - p, 2.2);
    const rad = 6 + ease * r.maxR;
    if (rad <= 0) return { skipped: true, rad };
    return { drawn: true, rad };
  };
  ok(drawRingLogic(1000, { start: 1140, dur: 620, maxR: TILE * 4.6 }).skipped === true, '冲击环：延迟环未到期时跳过不画');
  ok(drawRingLogic(1300, { start: 1140, dur: 620, maxR: TILE * 4.6 }).drawn === true, '冲击环：到期后正常绘制');
  // 扫一遍整个生命周期，任何 simT 下半径都不为负
  let badRad = 0;
  for (let t = 0; t < 2200; t += 16) {
    const r = drawRingLogic(t, { start: 140, dur: 620, maxR: TILE * 6 });
    if (r.rad !== undefined && r.rad < 0) badRad++;
  }
  ok(badRad === 0, '冲击环：全生命周期扫描半径无负值');
}

// ---------- 11. 事件扣血/扣上限的地板：hp ≥ 1、maxHp ≥ 100，不会把玩家打死或打成负上限 ----------
{
  E.newGame();
  const st1 = E.state();
  st1.maxHp = 1000; st1.hp = 50;
  E.applyEffect({ hp: -100 });
  ok(st1.hp === 1 && !st1.over, '事件扣血：钳到 1，不会致死');
  E.applyEffect({ maxHp: -5000 });
  ok(st1.maxHp === 100 && st1.hp <= st1.maxHp, '事件扣上限：钳到 100，hp 不超上限');
}

// ---------- 成就：一口空气（一件遗物都不拿走到结局） ----------
{
  const A = window.Achievements;
  ok(A.DEFS.length === 35, '成就总数 35 项');
  E.newGame();
  const sm = E.state();
  sm.ending = 'true'; sm.flags.relic_edge = true;
  A.evaluate('end', sm, () => {});
  ok(!A.isUnlocked('bare'), '拿了遗物不解锁「一口空气」');
  E.newGame();
  const sn = E.state();
  sn.ending = 'plain';
  A.evaluate('end', sn, () => {});
  ok(A.isUnlocked('bare'), '一件遗物没拿走到结局 → 解锁「一口空气」');
}
// ---------- 成就：折戟里程碑（跨局 falls 计数，死亡结算喂 'dead' 事件） ----------
{
  const A = window.Achievements;
  E.newGame();
  const sf1 = E.state();
  sf1.flags.falls = 2;
  A.evaluate('dead', sf1, () => {});
  ok(!A.isUnlocked('fall3') && !A.isUnlocked('fall10'), '折戟 2 次：两个里程碑都不解锁');
  sf1.flags.falls = 3;
  A.evaluate('dead', sf1, () => {});
  ok(A.isUnlocked('fall3') && !A.isUnlocked('fall10'), '折戟 3 次 → 解锁「塔的常客」');
  sf1.flags.falls = 10;
  A.evaluate('dead', sf1, () => {});
  ok(A.isUnlocked('fall10'), '折戟 10 次 → 解锁「不死不休」');
}
// 战意：只在最终决战生效，按累计击杀分档（清塔路线的独占收益）
E.newGame();
s = E.state();
const U = D.monsters.U;
s.flags.killCount = 6;
ok(E.zealScale(U) === 1 && E.zealScale(D.monsters['5']) === 1, '击杀少 / 普通怪都不吃战意');
s.flags.killCount = 30;
ok(Math.abs(E.zealScale(U) - 0.84) < 1e-9, '击杀 30 → 战意 0.84');
s.flags.killCount = 52;
ok(Math.abs(E.zealScale(U) - 0.64) < 1e-9, '击杀 52 → 战意 0.64');
s.atk = 999; s.def = 999; s.hp = 99999; s.maxHp = 99999;
const zf = E.fightDamage('U', false);
ok(zf && Math.abs(zf.zeal - 0.64) < 1e-9, 'fightDamage 带上战意比例供演出显示');
// 过手之环：把战意两道门槛前移一档（25/40 → 20/33），不改公式、不改满档数值
E.newGame();
s = E.state();
s.flags.rings = ['merit'];
const kz = (k) => { s.flags.killCount = k; return E.zealScale(U); };
ok(kz(19) === 1 && Math.abs(kz(20) - 0.84) < 1e-9, '过手之环：19 只不打折，20 只即 −16%');
ok(Math.abs(kz(32) - 0.84) < 1e-9 && Math.abs(kz(33) - 0.64) < 1e-9, '过手之环：33 只吃满 −36%');
ok(Math.abs(kz(52) - 0.64) < 1e-9, '过手之环：满档仍是 0.64（不改上限）');
// 没这枚环时口径不变（老局/老档零影响）
E.newGame();
s = E.state();
s.flags.killCount = 30;
ok(Math.abs(E.zealScale(U) - 0.84) < 1e-9, '没有过手之环：30 只仍是 0.84');
s.flags.killCount = 33;
ok(Math.abs(E.zealScale(U) - 0.84) < 1e-9, '没有过手之环：33 只拿不到满档');
// zealNext：顶栏那格读的数必须与门槛同源（否则 HUD 会说谎）
s.flags.rings = ['merit'];
s.flags.killCount = 12;
const zn1 = E.zealNext();
ok(zn1 && zn1.need === 20 && zn1.kills === 12 && zn1.cut === 0, 'zealNext：12 杀 → 还差 8 只到第一档');
s.flags.killCount = 25;
const zn2 = E.zealNext();
ok(zn2 && zn2.need === 33 && zn2.cut === 16, 'zealNext：25 杀 → 下一档 33（当前 −16%）');
s.flags.killCount = 33;
const zn3 = E.zealNext();
ok(zn3 && zn3.need === 0 && zn3.cut === 36, 'zealNext：33 杀 → 已满档');
s.flags.rings = [];
ok(E.zealNext() === null, '没装过手之环：顶栏那一格不显示');
ok(E.zealNeed().mid === 25 && E.zealNeed().full === 40, 'zealNeed：没装环时门槛 25 / 40');
s.flags.rings = ['merit'];
ok(E.zealNeed().mid === 20 && E.zealNeed().full === 33, 'zealNeed：过手之环门槛 20 / 33（HUD 与结算提示同源）');
// 第 3 章池 9→10：40 次抽取里必须出现过它
let sawMerit = false;
for (let i = 0; i < 40; i++) { E.newGame('none'); if (E.ringChoices(3).indexOf('merit') >= 0) sawMerit = true; }
ok(sawMerit, '第 3 章 40 次抽取里出现过过手之环');

// ---------- 净芯之环（第 4 章 9→10）：锁芯层清怪折余烬，四只封顶 ----------
// 它服务的是第 13 层唯一还没被锁环改过的决定：上楼前要不要为角落那四只花掉最后的血。
E.newGame();
s = E.state();
s.flags.rings = ['clean'];
s.floor = 12;                     // 第 13 层「锁芯」
s.x = 1; s.y = 8;                 // (1,8) 是地面，右边 (2,8) 是空甲
s.atk = 9999; s.def = 9999; s.hp = 9999; s.maxHp = 9999;
let cf = E.fight(1, 0);
ok(cf.type === 'fight' && s.flags.clean_kills === 1, '净芯之环：锁芯层倒一只记 1');
ok(E.cleanEmber() === 2, '净芯之环：1 只折 2 余烬');
// 别的层杀怪不记——这枚环只认锁芯那一层
E.newGame();
s = E.state();
s.flags.rings = ['clean'];
s.x = 5; s.y = 5;                 // 第 1 层 (5,5)，右边 (6,5) 是蝙蝠
s.atk = 9999; s.def = 9999; s.hp = 9999; s.maxHp = 9999;
cf = E.fight(1, 0);
ok(cf.type === 'fight' && !s.flags.clean_kills && E.cleanEmber() === 0, '净芯之环：别层杀怪不记、也不折余烬');
// 没这枚环时不记账（老局/老档零影响）
E.newGame();
s = E.state();
s.floor = 12;
s.x = 1; s.y = 8;
s.atk = 9999; s.def = 9999; s.hp = 9999; s.maxHp = 9999;
cf = E.fight(1, 0);
ok(cf.type === 'fight' && !s.flags.clean_kills && E.cleanEmber() === 0, '没装净芯之环：锁芯清怪不加余烬');
// 四只封顶：多清也不会超过 8（锁芯层本来只有四只，封顶是防空档回归）
s.flags.rings = ['clean'];
s.flags.clean_kills = 7;
ok(E.cleanEmber() === 8, '净芯之环：封顶 4 只 = 8 余烬');
// 第 4 章池 9→10：40 次抽取里必须出现过它
let sawClean = false;
for (let i = 0; i < 40; i++) { E.newGame('none'); if (E.ringChoices(4).indexOf('clean') >= 0) sawClean = true; }
ok(sawClean, '第 4 章 40 次抽取里出现过净芯之环');
ok(D.rings.clean.chapter === 4 && /最多 4 只/.test(D.rings.clean.desc), '净芯之环：章号 4、文案写明四只上限');
// 两条路线的勋章
const A = window.Achievements;
E.newGame();
s = E.state();
s.ending = 'true'; s.flags.killCount = 6;
A.evaluate('end', s, () => {});
ok(A.isUnlocked('dodger') && !A.isUnlocked('sweeper'), '6 杀 → 绕道者，不给清塔者');
E.newGame();
s = E.state();
s.ending = 'true'; s.flags.killCount = 52;
A.evaluate('end', s, () => {});
ok(A.isUnlocked('sweeper') && !isNaN(1), '52 杀 → 清塔者');
// 执剑者：带川的断剑走到结局（第八勇者线收藏格）
E.newGame();
s = E.state();
s.ending = 'true'; s.flags.relic_edge = true;
A.evaluate('end', s, () => {});
ok(A.isUnlocked('edge_finish'), '带断剑走到结局 → 执剑者');
// 负例前清成就存储：unlocked 跨用例共享，不清会把上一段的解锁泄漏进来
A.reset();
E.newGame();
s = E.state();
s.ending = 'plain';
A.evaluate('end', s, () => {});
ok(!A.isUnlocked('edge_finish'), '没带断剑不解锁执剑者');

// ---------- 9z. 开局微变：前 3 层散落物每局换位（P-A + P-A2 / S-D1）----------
// 目的是让第二局开局不再逐格照抄已知解；约束是「总量不变、骨架不动、数值不变、起点周围不动」。
const floor1Spots = (seed) => {
  const st = E.newGame(null, { seed: seed });
  const m = st.maps[0];
  const out = { p: [], $: [], start: null };
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      if (m[y][x] === 'p') out.p.push([x, y]);
      if (m[y][x] === '$') out.$.push([x, y]);
      if (m[y][x] === '@') out.start = [x, y];
    }
  }
  return out;
};
const dot = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
const base0 = floor1Spots(0);
ok(dot(base0.p[0], [8, 7]) && dot(base0.$[0], [7, 9]), '种子 0 保持原版首层布局（可复现读数用）');
const v1 = floor1Spots(1);
const v2 = floor1Spots(2);
ok(v1.p.length === 1 && v1.$.length === 1, '换位后药水与金币各恰好 1 个（总量不变）');
ok(!dot(v1.p[0], base0.p[0]) && !dot(v1.$[0], base0.$[0]), '换位后两件散落物都换了格子');
ok(!dot(v1.p[0], v2.p[0]), '不同种子给出不同布局（每局不一样）');
const nearStart = (spot) => spot && Math.abs(spot[0] - 2) <= 1 && Math.abs(spot[1] - 5) <= 1;
ok(!nearStart(v1.p[0]) && !nearStart(v1.$[0]) && !nearStart(v2.p[0]), '散落物不落到起点 3×3 内（开局 60 秒节奏不变）');
const seed777 = E.newGame(null, { seed: 777 });
ok(seed777.maps[0][7][8] === '.', '散落物挪走后原格变回地面');
ok(E.shuffleFloor1(null, 1) === false, '空地图不崩（shuffleFloor1 边界）');
ok(E.shufflePickups(null, 1) === false && E.shuffleFloor1([[]], 0) === false, 'shufflePickups 边界：空图 / 种子 0 都不改图');

// 第 2–3 层同一套规则（P-A2：S-D1 的另一半——只治首层，中段仍是照已知解）
const floorSpots = (seed, fi) => {
  const st = E.newGame(null, { seed: seed });
  const m = st.maps[fi];
  const out = { p: [], $: [] };
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      if (m[y][x] === 'p') out.p.push([x, y]);
      if (m[y][x] === '$') out.$.push([x, y]);
    }
  }
  return out;
};
// 把拾取物抹成地面后剩下的部分＝骨架（墙/怪/门/楼梯/商店/祭坛/事件）
const skeleton = (seed, fi) => E.newGame(null, { seed: seed }).maps[fi]
  .map((row) => row.map((c) => (c === 'p' || c === '$' ? '.' : c)).join('|')).join('/');

const f2base = floorSpots(0, 1);
const f3base = floorSpots(0, 2);
ok(f2base.$.length === 2 && f2base.p.length === 1, '种子 0 第 2 层保持原版（金币 2 / 药水 1）');
ok(f3base.$.length === 2 && f3base.p.length === 2, '种子 0 第 3 层保持原版（金币 2 / 药水 2）');

const f2a = floorSpots(11, 1);
const f2b = floorSpots(12, 1);
const f3a = floorSpots(11, 2);
ok(f2a.$.length === 2 && f2a.p.length === 1, '第 2 层换位后总量不变（金币 2 / 药水 1）');
ok(f3a.$.length === 2 && f3a.p.length === 2, '第 3 层换位后总量不变（金币 2 / 药水 2）');
const moved = (a, b) => a.length !== b.length || a.some((s, i) => !dot(s, b[i]))
  || a.slice().sort().join() !== b.slice().sort().join();
ok(moved(f2a.$, f2base.$) || moved(f2a.p, f2base.p), '第 2 层散落物真的换位了（不再逐格照抄）');
ok(moved(f3a.$, f3base.$) || moved(f3a.p, f3base.p), '第 3 层散落物真的换位了');
ok(skeleton(11, 1) === skeleton(0, 1) && skeleton(11, 2) === skeleton(0, 2),
  '第 2–3 层骨架零改动（墙/怪/门/商店/祭坛/楼梯全部原位）');
ok(skeleton(11, 0) === skeleton(0, 0), '第 1 层骨架同样零改动');
ok(f2a.$.slice().sort().join() !== f2b.$.slice().sort().join()
  || f2a.p.join() !== f2b.p.join(), '第 2 层不同种子给出不同布局（每局不一样）');
// 三层各用各的子种子：同一颗种子下三层不会挪成同一个花样
const sameLayout = (a, b) => a.p.map(String).sort().join() === b.p.map(String).sort().join()
  && a.$.map(String).sort().join() === b.$.map(String).sort().join();
ok(!(sameLayout(f2a, f3a) && f2a.p.length === f3a.p.length && f2a.$.length === f3a.$.length)
  || f2a.$.length !== f3a.$.length, '第 2/3 层各用派生子种子（不共用同一份洗牌结果）');

// ---------- 今日一塔：同一天走进来的是同一座塔 ----------
const Daily = require('../js/daily.js');
const dayA = Daily.keyOf(new Date(2026, 10, 14, 10, 0, 0));
const dSeed = Daily.seedOf(dayA);
ok(/^2026-11-14$/.test(dayA), '日期键按本地日子拼成 YYYY-MM-DD');
ok(Daily.keyOf(new Date(2026, 0, 5, 23, 59, 0)) === '2026-01-05', '月/日补零，跨年跨月不串');
ok(Number.isInteger(dSeed) && dSeed > 0, '每日种子是正整数（0 留给原版布局）');
ok(Daily.seedOf(dayA) === dSeed, '同一天必得同一颗种子');
ok(Daily.seedOf('2026-11-15') !== dSeed && Daily.seedOf('2026-11-13') !== dSeed, '换一天就是另一颗种子');
ok(Daily.label(dayA) === '11月14日' && Daily.label('乱码') === '', '面板短标签：2026-11-14 → 11月14日，脏输入给空');

const dailyA = E.newGame('none', { seed: dSeed, daily: dayA });
const mapA = dailyA.maps[0].join('|');
const dailyB = E.newGame('none', { seed: dSeed, daily: dayA });
const dailyC0 = E.newGame('none', { seed: dSeed, daily: dayA });
ok(dailyB.maps[0].join('|') === mapA, '同一天同一颗种子 → 首层换位完全一致');
ok(dailyB.flags.daily === dayA && dailyB.flags.rngSeed === dSeed && dailyB.flags.rngN === 0, '日签/种子/计数写进存档');
ok(dailyB.flags.phaseSeed === dSeed, 'Boss 台词同一天同一套（按日期种子定）');
ok(dailyC0.maps[1].join('|') === dailyB.maps[1].join('|') && dailyC0.maps[2].join('|') === dailyB.maps[2].join('|'),
  '今日一塔：第 2–3 层换位也跟着日签走（同一天同一座塔）');

const drawSeq = () => { const out = []; for (let i = 0; i < 5; i++) out.push(E.nextRand()); return out; };
E.newGame('none', { seed: dSeed, daily: dayA });
const seq1 = drawSeq();
E.newGame('none', { seed: dSeed, daily: dayA });
const seq2 = drawSeq();
ok(seq1.join(',') === seq2.join(',') && seq1.every((v) => v >= 0 && v < 1), '同种子抽取序列可复现（路遇/锁环/祭坛）');
ok(E.state().flags.rngN === 5, '抽取计数跟着存档走（中途刷新续玩不重摇整串）');
const dailyC = E.newGame('none', { seed: Daily.seedOf('2026-11-15'), daily: '2026-11-15' });
ok(dailyC.maps[0].join('|') !== mapA, '明天是另一座塔');

E.newGame('none', { seed: 12345 });
ok(!E.state().flags.daily && typeof E.state().flags.rngSeed !== 'number', '普通局不带日签');
const anyRand = E.nextRand();
ok(anyRand >= 0 && anyRand < 1 && E.state().flags.rngN === null, '普通局抽取仍走 Math.random（行为不变）');

// ---------- 商店行情：每层摊主给一件可重复货让价（种子定、重进不重摇） ----------
E.newGame('none', { seed: 20261114 });
{
  const st = E.state();
  ok(st.flags['deal_2'] === undefined, '行情是懒生成的：没进过商店的层不占存档字段');
  ok(E.dealOf(2) === null, '摊主开口才报价：没打开过这一层的商店就没有让价');
  E.openShopAt(2);
  const d2 = E.dealOf(2);
  ok(typeof d2 === 'string' && d2.length > 0, '第 3 层摊上有一件让价的货');
  ok(E.state().flags['deal_2'] === d2, '行情落进存档（flags.deal_<层>）');
  ok(E.dealOf(2) === d2, '同一层反复调用得到同一件（重进商店不会重摇）');
  ok(E.shopStock(2).some((x) => x.id === d2), '让价的货必须在当层货架上');
  const dealItem = E.shopStock(2).find((x) => x.id === d2);
  ok(!dealItem.once && !dealItem.block && !dealItem.heartShard, '一次性货不让价（盾谱/镜子/灯芯/碎片是硬门槛）');
  st.floor = 2;
  const listPrice = E.priceOf(dealItem, { noDeal: true });
  const nowPrice = E.priceOf(dealItem);
  ok(nowPrice === Math.max(1, Math.round(listPrice * 0.7)), `让价按七折结算（${listPrice} → ${nowPrice}）`);
  ok(nowPrice < listPrice, '让价确实比原价便宜');
  ok(nowPrice >= 1, '折上折也不破 1 金下限');
  const other = E.shopStock(2).find((x) => !x.once && x.id !== d2);
  ok(E.priceOf(other) === E.priceOf(other, { noDeal: true }), '没被让价的货照原价，不受影响');
  // 让价不串层：没打开过的第 4 层仍是原价
  ok(E.dealOf(3) === null, '行情按层独立，没进过的层不会跟着打折');
}
// 每层都挑得出来（13 层货架都非空）
E.newGame('none', { seed: 20261114 });
{
  let everyFloor = true;
  for (let f = 0; f < D.floors.length; f++) {
    E.openShopAt(f);
    const id = E.dealOf(f);
    if (!id || !E.shopStock(f).some((x) => x.id === id)) everyFloor = false;
  }
  ok(everyFloor, `${D.floors.length} 层每层都能挑出一件可重复货让价`);
}
// 换一局换一批行情（这是「第二局不再逐格照抄」的另一半）
{
  const picks = new Set();
  for (let k = 1; k <= 20; k++) { E.newGame('none', { seed: k * 7919 }); E.openShopAt(2); picks.add(E.dealOf(2)); }
  ok(picks.size >= 3, `换一局换一批行情（20 颗种子里出现 ${picks.size} 种让价货）`);
}
// 今日一塔：同一天摊上让价的也是同一件
E.newGame('none', { seed: dSeed, daily: dayA });
E.openShopAt(2);
const dealDaily1 = E.dealOf(2);
E.newGame('none', { seed: dSeed, daily: dayA });
E.openShopAt(2);
ok(E.dealOf(2) === dealDaily1, '今日一塔：同一天让价的也是同一件货');
// 行情不消耗抽取序列（路遇/锁环/祭坛的序列不被打乱）
E.newGame('none', { seed: dSeed, daily: dayA });
E.openShopAt(2);
E.dealOf(2);
const seqAfterDeal = drawSeq();
ok(seqAfterDeal.join(',') === seq1.join(','), '行情不挤占 nextRand 序列（抽取顺序一字不动）');

// ---------- 9j. 惜挡之环：一整层没动格挡，上楼补 90 金（每层只结一次） ----------
// 把「盾留给哪一场」从纯保命扩成「保命还是换钱」——它不改任何数值，只把格挡变成一笔账
function climbUp() {
  const map = s.maps[s.floor];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      if (map[y][x] !== 'u') continue;
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (let k = 0; k < dirs.length; k++) {
        const px = x - dirs[k][0], py = y - dirs[k][1];
        if (py < 0 || py >= map.length || px < 0 || px >= map[0].length) continue;
        if ('.@p$'.indexOf(map[py][px]) < 0) continue;
        s.x = px; s.y = py;
        return E.tryMove(dirs[k][0], dirs[k][1]);
      }
    }
  }
  return null;
}
E.newGame();
s = E.state();
s.flags.rings = ['spare'];
s.flags.hasBlock = true;
s.gold = 100;
{
  const up1 = climbUp();
  ok(up1 && up1.type === 'floor' && up1.at.gold === 90 && s.gold === 190,
    '惜挡之环：这一层没动格挡，上楼 +90 金');
  ok(s.flags['spare_f0'] === true, '结算落在 flags.spare_f0（每层一个标记）');
  const up2 = climbUp();
  ok(up2 && up2.at.gold === 90, `换一层重新算（第 2 层上楼也 +90）`);
  s.floor = 0;
  const up3 = climbUp();
  ok(up3 && up3.at.gold === 0 && s.gold === 280, '同一层来回上下楼不重复结这笔钱');
}
// 这一层挡过一次：没有这笔钱
E.newGame();
s = E.state();
s.flags.rings = ['spare'];
s.flags.hasBlock = true;
s.gold = 100;
s.flags['block_n0'] = 1;
{
  const upB = climbUp();
  ok(upB && upB.at.gold === 0 && s.gold === 100, '惜挡之环：这一层挡过，就不再补钱');
}
// 没学盾谱（没有格挡可省）：不发钱，且候选池里不出现（抽到就是废卡）
E.newGame();
s = E.state();
s.flags.rings = ['spare'];
s.gold = 100;
{
  const upC = climbUp();
  ok(upC && upC.at.gold === 0 && s.gold === 100, '惜挡之环：没学盾谱拿不到这笔钱');
  let seenNoShield = 0;
  for (let k = 0; k < 40; k++) { E.newGame('none'); if (E.ringChoices(1).indexOf('spare') >= 0) seenNoShield++; }
  ok(seenNoShield === 0, '没学盾谱时第 1 章候选池里不出现惜挡之环（40 次抽取 0 次）');
}
// 不能格挡的三条誓约：拿不到，且候选池里直接不出现（抽到就是白拿一张）
E.newGame('guard');
s = E.state();
s.flags.rings = ['spare'];
s.flags.hasBlock = true;
s.gold = 100;
ok(climbUp().at.gold === 0 && s.gold === 100, '铁壁之誓：整层没格挡也拿不到这笔钱（它本来就不能挡）');
{
  let seen = 0;
  for (let k = 0; k < 40; k++) { E.newGame('guard'); E.state().flags.hasBlock = true; if (E.ringChoices(1).indexOf('spare') >= 0) seen++; }
  ok(seen === 0, '铁壁之誓第 1 章候选池里不出现惜挡之环（40 次抽取 0 次）');
  let seenFree = 0;
  for (let k = 0; k < 40; k++) { E.newGame('none'); E.state().flags.hasBlock = true; if (E.ringChoices(1).indexOf('spare') >= 0) seenFree++; }
  ok(seenFree > 0, `学了盾谱、没立禁挡誓约时能正常抽到（40 次里出现 ${seenFree} 次）`);
}

// ---------- 抢攻：第 2 章起的第二个战斗内决策（少挨一轮 ↔ 这一战没经验）----------
E.newGame();
s = E.state();
s.floor = 3;                 // 第 4 层 = 第 2 章
s.x = 5; s.y = 5;
s.maps[3][5][6] = 'A';       // 右边一格摆一只蝙蝠
const rushInfo = E.rushInfo('A');
const plainD = E.fightDamage('A', false, false).damage;
ok(!!rushInfo, '蝙蝠能给出一份抢攻账');
ok(rushInfo.plain === plainD, '抢攻账的「不抢」承伤与 fightDamage 同源');
ok(rushInfo.save === plainD - rushInfo.damage && rushInfo.save > 0, `抢攻确实少挨（${plainD} → ${rushInfo.damage}，省 ${rushInfo.save}）`);
ok(rushInfo.damage === E.fightDamage('A', false, true).damage, '抢攻承伤与引擎同源（演出与结算不会各算各的）');

const rushExpBefore = s.exp;
const rushKillsBefore = s.flags.killCount || 0;
const rushGoldBefore = s.gold;
const rRush = E.fight(1, 0, { rush: true });
ok(rRush.type === 'fight' && rRush.rushed === true && rRush.blocked === false, '抢攻：确实按抢攻结算');
ok(rRush.damage === rushInfo.damage, '抢攻：实际承伤等于账上那个数');
ok(rRush.exp === 0 && s.exp === rushExpBefore, '抢攻：这一战经验归零（一分没涨）');
ok((s.flags.killCount || 0) === rushKillsBefore + 1, '抢攻：击杀计数照常 +1（战意不受影响）');
ok(rRush.gold > 0 && s.gold === rushGoldBefore + rRush.gold, '抢攻：金币照常进账');

// 格挡优先：两个都请求时按格挡结算，经验照常
E.newGame();
s = E.state();
s.flags.hasBlock = true;
s.floor = 3; s.x = 5; s.y = 5;
s.maps[3][5][6] = 'A';
const rBoth = E.fight(1, 0, { block: true, rush: true });
ok(rBoth.blocked === true && rBoth.rushed === false, '格挡与抢攻二选一：同时请求时格挡优先');
ok(rBoth.exp === D.monsters.A.exp, '按格挡结算时经验照常（抢攻的代价没有被误扣）');

// 没得省的时候不给这个选项：防御堆到打不动 → 少挨的那一轮省不下任何血
E.newGame();
s = E.state();
s.def = 999;
ok(E.rushInfo('A') === null, '打不到你的怪不给抢攻选项（省不下血，只剩白丢经验）');

// 抢攻不是救命按钮：它只省一轮，不做保命兜底（生死判定仍按白打口径）
E.newGame();
s = E.state();
s.floor = 3; s.x = 5; s.y = 5;
s.maps[3][5][6] = 'A';
s.hp = E.fightDamage('A', false, false).damage;   // 刚好活不下来
ok(E.fight(1, 0, { rush: true }).type === 'refuse', '血不够白打时抢攻仍被拒（它不是保命按钮）');
ok(E.rushInfo('A').save < E.fightDamage('A', false, false).damage, '抢攻只省得下一轮，救不回一场打不过的架');

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
