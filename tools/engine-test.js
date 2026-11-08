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
s.floor = 2; s.x = 8; s.y = 7;
let ev = E.tryMove(1, 0);
ok(ev.type === 'open' && s.keys.y === 0, '黄门打开并消耗钥匙');
ok(E.tile(9, 7) === '.', '门变成地面');

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
s.floor = 2; s.x = 4; s.y = 3; s.gold = 100;
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
ok(gs.total === 6 && gs.list.length === 6, '塔规面板共 6 条');

// ---------- 9e. 隐藏门「锁芯」 ----------
E.newGame();
s = E.state();
s.floor = 5;
ok(E.revealCore() === false, '塔规不足时王座后面没有路');
for (let g = 0; g < 5; g++) s.flags['goal_' + g] = true;
ok(E.revealCore() === true && E.tile(9, 2) === 'u', '塔规 5 条后王座后露出窄梯');
ok(E.state().maps[5][2][9] === 'u', '窄梯写进地图');
ok(D.floors.length === 7 && D.floors[6].name === '锁芯', '第七层存在');

// ---------- 9f. 塔心石：带走 / 放下 ----------
E.newGame();
s = E.state();
s.floor = 6; s.x = 5; s.y = 6;
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
s.floor = 6; s.x = 5; s.y = 6;
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
s.floor = 5; s.x = 5; s.y = 5; s.hp = 3000; s.atk = 50; s.def = 30; s.flags.boss = false;
ev = E.fight(0, -1);
ok(ev.type === 'story' && ev.story === 'boss', '首见魔王先触发对白');
ok(E.tile(5, 4) === 'Z', '对白阶段魔王保留');
ok(s.y === 5 && s.x === 5, '玩家留在原位');
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
s.floor = 5; s.x = 5; s.y = 2;
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

// ---------- 16. 六层塔链路 ----------
E.newGame();
s = E.state();
let chainOk = true;
for (let fi = 0; fi < D.floors.length - 1; fi++) {
  s.floor = fi;
  const map = s.maps[fi];
  let ux = -1, uy = -1;
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) if (map[y][x] === 'u') { ux = x; uy = y; }
  if (ux < 0 && D.floors[fi].hiddenGate) {
    for (let g = 0; g < 5; g++) s.flags['goal_' + g] = true;
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
ok(chainOk, '七层塔每一层都能正常上楼（含隐藏门）');

// ---------- 17. 剧情文本完整性 ----------
const S = global.STORY;
const need = ['intro', 'candle1', 'candle2', 'candle3', 'journal', 'merchant', 'eighthSword', 'solitude', 'boss', 'princessPlain', 'princessTrue', 'afterChoicePlain', 'afterChoiceTrue'];
ok(need.every((k) => Array.isArray(S[k]) && S[k].length), '所有剧情段都存在且非空');
ok(S.intro.length === 5, '序章压缩为 5 句');
ok(S.boss.some((l) => String(l[1]).includes('肩上')), '魔王提到薇拉小时候');
ok(S.merchant.some((l) => String(l[1]).includes('铜币')), '三十枚铜币移到商人台词');
ok(!!S.endingTrue.epilogue && !!S.endingPlain.epilogue, '两个结局都有后日谈');

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
