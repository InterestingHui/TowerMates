// 引擎逻辑单元测试（Node 环境，stub localStorage）
global.window = global;
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
require('../js/data.js');
require('../js/engine.js');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('✓ ' + msg);
  else { fail++; console.log('✗ ' + msg); }
}

const E = window.Engine;
E.newGame();
let s = E.state();

// 1. 初始状态
ok(s.hp === 1000 && s.atk === 10 && s.def === 10, '初始属性 1000/10/10');
ok(s.keys.y === 1, '初始 1 把黄钥匙');

// 2. 开门消耗钥匙（第 2 层内室黄门在 (5,7)，需从下方 (5,8)? 不——(5,8) 是 #。
// 布局：row7 = #.#.#y#.#.#，y 在 (5,7)；row8 = #...#.#k..#，(5,8)=#。(5,6)='#'。
// 该门只能从上下？(5,6)=#,(5,8)=#，左右 (4,7)=#,(6,7)=# → 四面墙，不可达？
// 修正地图后此处应可达：改测第 3 层右下角的黄门 (9,7)，从 (8,7) 走入
s.floor = 2; s.x = 8; s.y = 7;
let ev = E.tryMove(1, 0);
ok(ev.type === 'open' && s.keys.y === 0, '黄门打开并消耗钥匙');
ok(E.tile(9, 7) === '.', '门变成地面');

// 3. 无钥匙时被锁（第 3 层蓝门 (9,6)? 不存在；用第 4 层蓝门 (9,2)）
s.floor = 3; s.x = 8; s.y = 2; s.keys.b = 0;
const locked = E.tryMove(1, 0);
ok(locked.type === 'locked', '无钥匙不能开门');

// 4. 商店进入与购买（第 3 层商人在 (5,3)，从 (4,3) 走入）
s.floor = 2; s.x = 4; s.y = 3; s.gold = 100;
ev = E.tryMove(1, 0);
ok(ev.type === 'shop', '踩到商人弹出商店');
const atk0 = s.atk;
const buy = E.buy('atk');
ok(buy.type === 'buy' && s.atk === atk0 + 2 && s.gold === 40, '购买力量训练：攻击+2，扣 60 金币');
const poor = E.buy('atk');
ok(poor.type === 'refuse', '金币不足时拒绝购买');

// 5. 战斗结算
s.floor = 0; s.x = 2; s.y = 4;
E.tryMove(0, -1);
ev = E.tryMove(0, -1);
ok(ev.type === 'battle' && ev.prediction.win, '撞到蝙蝠弹出战斗且可战胜');
const hp0 = s.hp;
const gold0 = s.gold;
const fight = E.fight(0, -1);
ok(fight.type === 'fight' && s.hp === hp0 - fight.damage, '战后正确扣血');
ok(s.gold === gold0 + 3 && s.exp === 2, '战利品金币/经验到账');
ok(E.tile(2, 2) === '.', '怪物被移除');

// 6. 首见魔王触发对白（怪物保留、玩家退回），再战正常结算
// 第 9 层魔王 Z 在 (5,4)，从 (5,5) 发起战斗（给足攻击破防）
s.floor = 8; s.x = 5; s.y = 5; s.hp = 4000; s.atk = 42; s.flags.boss = false;
ev = E.fight(0, -1);
ok(ev.type === 'story' && ev.story === 'boss', '首见魔王先触发对白');
ok(E.tile(5, 4) === 'Z', '对白阶段魔王保留');
ok(s.y === 5 && s.x === 5, '玩家退回原位');
const bossFight = E.fight(0, -1);
ok(bossFight.type === 'fight' && bossFight.boss, '对白后可正常挑战魔王');
ok(s.hp < 3000, '魔王战造成真实伤害');

// 7. 幽灵触发剧情对白而非战斗（第 1 层幽灵 G 在 (8,3)，从 (8,4) 向上走入）
s.floor = 0; s.x = 8; s.y = 4; s.flags = {};
ev = E.tryMove(0, -1);
ok(ev.type === 'story' && ev.story === 'candle1', '踩到幽灵触发对白');
ok(E.tile(8, 3) === '.', '幽灵不阻路');

// 8. 手记决定结局分支（公主 T 在 (5,1)，从 (5,2) 走入）
s.flags.journal = false;
s.won = false;
s.floor = 8; s.x = 5; s.y = 2;
ev = E.tryMove(0, -1);
ok(ev.type === 'princess' && ev.hasJournal === false, '无手记 → 普通结局');
s.won = false; s.flags.journal = true;
ev = E.tryMove(0, 1); // 走回原位
ev = E.tryMove(0, -1);
ok(ev.type === 'princess' && ev.hasJournal === true, '有手记 → 真结局');

// 9. 换层与存档
s.floor = 3; s.x = 1; s.y = 1;
const before = s.floor;
E.tryMove(0, 1); // 走一步，非楼梯
ok(s.floor === before, '普通格子不换层');
store['towermates_save_v2'] = JSON.stringify(s);
E.load();
ok(E.state().floor === before, '存档可读取');

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
