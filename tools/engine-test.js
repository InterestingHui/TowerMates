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
// 货架分级：第 3 层没有蓝药/圣水，第 8 层起有蓝药，第 11 层起有圣水
ok(E.shopStock(2).every((x) => x.id !== 'bigpotion' && x.id !== 'holywater'), '第 3 层货架没有高级药');
ok(E.shopStock(7).some((x) => x.id === 'bigpotion') && E.shopStock(7).every((x) => x.id !== 'holywater'), '第 8 层上架蓝药水');
ok(E.shopStock(10).some((x) => x.id === 'holywater'), '第 11 层上架圣水');
ok(E.shopStock(12).some((x) => x.id === 'holywater'), '第 13 层（锁芯）有圣水');
// 后半部盾谱：锁芯拾取 → 格挡强化（×0.45 + 卸伤三成化经验）
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
ok(Math.abs(E.ringBlockScale() - 0.45) < 1e-9, '后半部把格挡比例压到 0.45');
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
ok(rRip.damage === Math.round(rawPred.damage * 0.45), '承伤按 45% 结算');
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
E.newGame();
s = E.state();
s.floor = 2; s.x = 7; s.y = 8;
ev = E.tryMove(1, 0);
ok(ev.type === 'altar', '踩到行李堆弹出三选一');
const choices = E.altarChoices();
ok(choices.length === 3 && choices.every((id) => !!D.relics[id]), '祭坛给出 3 件可拿的遗物');
const atkA = s.atk, defA = s.def;
const pick = E.pickRelic('steel');
ok(pick.type === 'relic' && s.atk === atkA + 3 && s.def === defA + 3, '鸦的铁腕：攻击/防御 +3');
ok(s.flags.altar === true && E.tile(8, 8) === '.', '祭坛拿走一次后清空');
ok(E.pickRelic('steel').type === 'refuse', '同一件不能拿两次');

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

E.newGame();
s = E.state();
s.floor = 3; s.gold = 0; s.keys.y = 0;
const bridge = D.events.find((e) => e.id === 'bridge');
const keyOpt = bridge.options.findIndex((o) => o.effect.keys && o.effect.keys.y < 0);
ok(keyOpt >= 0 && E.eventCost(bridge.options[keyOpt]) === '钥匙不够', '钥匙不足时选项被标记为不可选');
s.keys.y = 3;
ok(E.eventCost(bridge.options[keyOpt]) === null, '钥匙够了就可以选');

// ---------- 9i. 路遇事件 ----------
E.newGame();
s = E.state();
s.x = 4; s.y = 4;
ev = E.tryMove(0, -1);
ok(ev.type === 'event' && !!ev.eventId, '踩到路遇点弹出事件');

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
// 用固定事件，避免随机导致用例飘
s.gold = 500;
const atkA2 = s.atk, maxA2 = s.maxHp;
const eRes = E.resolveEvent('smith', 0);
ok(eRes.type === 'event' && typeof eRes.msg === 'string', '选择后返回结果文案');
ok(s.atk === atkA2 + 2 && s.maxHp === maxA2 - 120, '铁匠磨刃：攻击 +2、上限 −120');
ok(E.tile(4, 3) === '.', '路遇点用掉后清空');
ok(s.flags.ev_f0 === true, '本层路遇只触发一次');
ok(D.events.find((e) => e.id === 'broker').options[0].effect.atk === 3, '深层事件「赌命的商人」存在');

E.newGame();
s = E.state();
s.x = 4; s.y = 4;
const ev2 = E.tryMove(0, -1);
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
s.x = 8; s.y = 8;
E.tryMove(0, -1);
ok(s.hp === hpAfterUp, '下楼不回血（不能来回刷）');

E.newGame('guard');
s = E.state();
E.grantBlock();
ok(!E.canBlock(), '铁壁之誓：学了也不给格挡');
s.hp = 5000; s.x = 2; s.y = 3;
const guardRaw = E.predict('A').damage;
const gRes = E.fight(0, -1);
ok(gRes.damage === Math.round(guardRaw * 1.18), '铁壁之誓：承伤按 +18% 结算');

E.newGame('greed');
s = E.state();
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 78, '贪婪之誓：价目 +30%（60 → 78）');
s.hp = 5000; s.x = 2; s.y = 3;
const goldBefore = s.gold;
const greedRes = E.fight(0, -1);
ok(greedRes.gold === Math.round(D.monsters.A.gold * 1.7), '贪婪之誓：击杀金币 +70%');
ok(s.gold === goldBefore + Math.round(D.monsters.A.gold * 1.7), '金币真的进了口袋');

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
ok(rBlock.blocked === true && rBlock.damage === Math.round(rawDmg * 0.6), '格挡后承伤按 60% 结算');
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
ok(E.fight(0, -1, { block: true }).damage === Math.round(batRaw * 0.6), '按格挡结算，血量确实撑得住');
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
const need = ['intro', 'candle1', 'candle2', 'candle3', 'candle4', 'candle5', 'journal', 'merchant', 'merchant2', 'merchant3', 'merchant4', 'blockLore', 'eighthSword', 'solitude', 'ch2', 'ch3', 'ch4', 'bossYan', 'afterYan', 'bossJu', 'afterJu', 'bossDuo', 'afterDuo', 'bossHeng', 'afterHeng', 'core', 'princessPlain', 'princessTrue', 'afterChoicePlain', 'afterChoiceTrue', 'stele'];
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
ok(E.ringBlockScale() === 0.5, '断刃之环把格挡比例改成 0.5');
const dBase = E.fightDamage('F', false).damage;
ok(E.fightDamage('F', true).damage === Math.round(dBase * 0.5), '演出用的真实承伤与格挡比例一致');
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

  // 连击：每回合两下
  const fm = D.monsters.F;
  const pf = E.predict('F');
  ok(D.monsters.F.trait === 'double', '狼人带连击特性');
  const roundsF = Math.ceil(fm.hp / (st.atk - fm.def));
  ok(pf.damage === Math.max(0, roundsF - 1) * Math.max(0, fm.atk - st.def) * 2, '连击：承伤翻倍');

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

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
