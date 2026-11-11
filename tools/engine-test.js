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
s.floor = 2; s.x = 4; s.y = 6; s.gold = 100;
delete s.flags.buy_atk;
ev = E.tryMove(1, 0);
ok(ev.type === 'shop', '踩到商人弹出商店');
const atk0 = s.atk;
const buy1 = E.buy('atk');
ok(buy1.type === 'buy' && s.atk === atk0 + 2 && s.gold === 40, '力量训练：攻击 +2，扣 60 金');
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 80, '同一件商品第二次涨价到 80');
const poor = E.buy('atk');
ok(poor.type === 'refuse', '金币不足时拒绝购买');

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

// ---------- 9c. 岚的账本 / 磐的灯油 / 无名之镜 ----------
E.newGame();
s = E.state();
s.flags.relic_thrift = true;
delete s.flags.buy_atk;
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 45, '岚的账本：商店价格 −25%');
delete s.flags.relic_thrift;
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 60, '没有账本时价格恢复');

E.newGame();
s = E.state();
s.flags.relic_vigor = true;
s.exp = 9; s.hp = 1000; s.maxHp = 1000;
s.x = 2; s.y = 3;
const vf = E.fight(0, -1);
ok(vf.levelUps === 1 && s.maxHp === 1210, '磐的灯油：升级额外 +80 生命');

E.newGame();
s = E.state();
E.pickRelic('scout');
ok(s.flags.codex === true, '无名之镜：直接解锁窥探之镜');

// ---------- 9d. 每层的「规矩」 ----------
E.newGame();
s = E.state();
s.hp = 5000;
E.beginFloor();
E.fight(0, -1); // 打掉 (2,2) 的蝙蝠
s.x = 8; s.y = 8;
ev = E.tryMove(0, 1); // 踩上楼
ok(ev.type === 'floor' && s.flags.goal_0 === true, '第 1 层：只杀 1 只 → 规矩达成');

E.newGame();
s = E.state();
s.floor = 2; s.x = 5; s.y = 9; s.gold = 200;
E.beginFloor();
E.buy('atk');
s.x = 2; s.y = 1;
E.tryMove(-1, 0);
ok(s.flags.goal_2 === false, '第 3 层：在秤那里花了钱 → 规矩未达成');

E.newGame();
s = E.state();
s.floor = 1; s.x = 5; s.y = 8; s.keys.y = 1;
E.beginFloor();
E.tryMove(0, -1); // 开黄门
s.x = 2; s.y = 1;
E.tryMove(-1, 0); // 上楼
ok(s.flags.goal_1 === true, '第 2 层：用黄钥匙开了内室 → 规矩达成');

E.newGame();
s = E.state();
s.floor = 5; s.hp = s.maxHp; s.won = false;
E.beginFloor();
E.finish('true');
ok(s.flags.goal_5 === true, '第 6 层：满血收尾 → 规矩达成');
const gs = E.goalStatus();
ok(gs.total === 12 && gs.list.length === 12, '塔规面板共 12 条');

// ---------- 9e. 隐藏门「锁芯」 ----------
E.newGame();
s = E.state();
s.floor = 11;
ok(E.revealCore() === false, '没打赢衡时塔顶后面没有路');
s.flags.bossKilled_U = true;
ok(E.revealCore() === false, '塔规不足时塔顶后面没有路');
for (let g = 0; g < 8; g++) s.flags['goal_' + g] = true;
ok(E.revealCore() === true && E.tile(9, 2) === 'u', '塔规 8 条后塔顶露出窄梯');
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
ok(E.vow() === 'ascetic' && !E.canBlock(), '苦行之誓：没有格挡');
s.hp = 400; s.x = 8; s.y = 8;
ev = E.tryMove(0, 1);
ok(ev.type === 'floor' && ev.at.heal === Math.round(s.maxHp * 0.10), '苦行之誓：每上一层回 10% 生命');

E.newGame('nameless');
s = E.state();
ok(!E.canBlock(), '无名之誓：没有格挡');
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
ok(!E.canBlock(), '铁壁之誓：没有格挡');
s.hp = 5000; s.x = 2; s.y = 3;
const guardRaw = E.predict('A').damage;
const gRes = E.fight(0, -1);
ok(gRes.damage === Math.round(guardRaw * 0.82), '铁壁之誓：承伤按 82% 结算');

E.newGame('greed');
s = E.state();
ok(E.priceOf(D.shop.find((x) => x.id === 'atk')) === 78, '贪婪之誓：价目 +30%（60 → 78）');
s.hp = 5000; s.x = 2; s.y = 3;
const goldBefore = s.gold;
const greedRes = E.fight(0, -1);
ok(greedRes.gold === Math.round(D.monsters.A.gold * 1.7), '贪婪之誓：击杀金币 +70%');
ok(s.gold === goldBefore + Math.round(D.monsters.A.gold * 1.7), '金币真的进了口袋');

// ---------- 9g. 每层一次的格挡 ----------
E.newGame();
s = E.state();
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
s.hp = 5000; s.x = 2; s.y = 3;
const rawDmg2 = E.predict('A').damage;
const rPlain = E.fight(0, -1);
ok(rPlain.blocked === false && rPlain.damage === rawDmg2, '不格挡时承伤不变');

// ---------- 9h. 残血格挡换命（predictOpt） ----------
// 血量撑不到打完，但挡完能活：不能再用"会要你的命"拦住玩家
E.newGame();
s = E.state();
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
    for (let g = 0; g < 8; g++) s.flags['goal_' + g] = true;
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
const need = ['intro', 'candle1', 'candle2', 'candle3', 'candle4', 'candle5', 'journal', 'merchant', 'merchant2', 'eighthSword', 'solitude', 'ch2', 'ch3', 'ch4', 'bossYan', 'afterYan', 'bossJu', 'afterJu', 'bossDuo', 'afterDuo', 'bossHeng', 'afterHeng', 'core', 'princessPlain', 'princessTrue', 'afterChoicePlain', 'afterChoiceTrue'];
ok(need.every((k) => Array.isArray(S[k]) && S[k].length), '所有剧情段都存在且非空');
ok(S.intro.length === 6, '序章 6 句（多一句「塔只有六层」的假象）');
ok(S.bossJu.some((l) => String(l[1]).includes('肩上')), '魔王提到薇拉小时候');
ok(S.merchant.some((l) => String(l[1]).includes('铜币')), '三十枚铜币移到商人台词');
ok(!!S.endingTrue.epilogue && !!S.endingPlain.epilogue, '两个结局都有后日谈');

// ---------- 18. v2.1 章末回响 / 锁环 / Boss 台词池 ----------
E.newGame();
s = E.state();
ok(Array.isArray(s.flags.rings) && s.flags.rings.length === 0, '新局锁环为空');
ok(typeof s.flags.phaseSeed === 'number', '每局有独立的 Boss 台词种子');

s.floor = 2;
s.floorEnter = { floor: 2, kills: 0, shop: 0, hp: s.hp, maxHp: s.maxHp };
s.flags.goal_0 = true; s.flags.goal_1 = true; s.flags.goal_2 = true;
const echo = E.settleChapter(1);
ok(echo && echo.done === 3 && echo.bonus === 300, '三条塔规全达成 → 章回响 +300 分');
ok(echo.pending === true, '达成两条以上才开锁环三选一');
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

E.newGame();
s = E.state();
s.floorEnter = { floor: 0, kills: 0, shop: 0, hp: s.hp, maxHp: s.maxHp };
const gp = E.goalPreview();
ok(gp && typeof gp.text === 'string' && typeof gp.ok === 'boolean', '本层规矩可实时预览');
ok(s.flags.goal_0 === undefined, '实时预览不会提前写结算标记');

// Boss 击败 → 章末回响的完整链路（不是只测结算函数）
E.newGame();
s = E.state();
s.floor = 2; s.x = 5; s.y = 6;
s.atk = 80; s.def = 40; s.hp = 6000; s.maxHp = 6000;
s.floorEnter = { floor: 2, kills: 0, shop: 0, hp: s.hp, maxHp: s.maxHp };
s.flags.boss_seen_N = true;
s.flags.goal_0 = true; s.flags.goal_1 = true;
const bossRes = E.fight(0, -1);
ok(bossRes.type === 'fight' && bossRes.boss, 'Boss 砚可正常击败');
ok(bossRes.echo && bossRes.echo.chapter === 1, 'Boss 击败会返回本章回响');
ok(bossRes.echo.done === 3 && bossRes.echo.pending === true, '章末层在 Boss 倒下时提前结算并开三选一');
ok(s.flags.goalLocked_2 === true, '章末层塔规已锁定，之后吃药不会改判');
ok(s.flags.echoScore === 300, '章回响奖分写进存档');

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

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
