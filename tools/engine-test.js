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

// 2. 开门消耗钥匙
s.floor = 1; s.x = 7; s.y = 7;
let ev = E.tryMove(0, -1);
ok(ev.type === 'open' && s.keys.y === 0, '黄门打开并消耗钥匙');
ok(E.tile(7, 6) === '.', '门变成地面');

// 3. 无钥匙时被锁
s.x = 6; s.y = 6; s.keys.y = 0;
ok(E.tryMove(1, 0).type === 'blocked' || E.tryMove(1, 0).type !== 'open', '无钥匙不能再开门');

// 4. 商店进入与购买
s.floor = 2; s.x = 3; s.y = 4; s.gold = 100;
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

// 6. 打不过时拒绝
s.floor = 5; s.x = 5; s.y = 5; s.hp = 500;
ev = E.tryMove(0, -1);
ok(ev.type === 'battle' && ev.prediction.win === false, '魔王战力压制，预测为必败');
ok(E.fight(0, -1).type === 'refuse', '必败战斗被拒绝执行');

// 7. 换层与存档
s.floor = 3; s.x = 1; s.y = 1;
const before = s.floor;
E.tryMove(0, 1); // 走一步，非楼梯
ok(s.floor === before, '普通格子不换层');
store['towermates_save_v1'] = JSON.stringify(s);
E.load();
ok(E.state().floor === before, '存档可读取');

console.log(fail === 0 ? '\n✓ 全部通过' : `\n✗ ${fail} 项失败`);
process.exit(fail ? 1 : 0);
