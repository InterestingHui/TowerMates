// 战斗演出伤害分摊单测（纯逻辑复演，不依赖 DOM）
// 保证：怪血逐刀递减、最后一刀正好归零；玩家承伤逐次均摊、演出结束落在引擎真实值附近。
let pass = 0, bad = 0;
function ok(cond, label) {
  if (cond) { pass++; } else { bad++; console.log('✗ ' + label); }
}

function sim(m, panel, blocked) {
  const out = panel.atk - m.def;
  if (out <= 0) return null;
  const rounds = Math.ceil(m.hp / out);
  const per = Math.max(0, m.atk - panel.def);
  const blockScale = blocked ? 0.6 : 1;
  const totalDamage = Math.max(0, Math.round((rounds - 1) * per * blockScale));
  let foeHp = m.hp, heroDmgLeft = totalDamage, foeSum = 0, heroSum = 0;
  const K = Math.min(rounds, 5);
  for (let i = 0; i < K; i++) {
    const strikesLeft = K - i;
    const strikesReal = Math.ceil(foeHp / out);
    let cut;
    if (strikesLeft === 1 || strikesReal < strikesLeft) cut = foeHp;
    else cut = Math.min(foeHp, out);
    foeHp = Math.max(0, foeHp - cut);
    foeSum += cut;
    if (foeHp <= 0) break;
    if (i < K - 1) {
      const take = Math.max(0, Math.round(heroDmgLeft / (K - 1 - i)));
      heroDmgLeft -= take;
      heroSum += take;
    }
  }
  return { rounds, K, foeOk: foeHp === 0 && foeSum === m.hp, heroSum, totalDamage, heroDmgLeft };
}

const cases = [
  ['蝙蝠(开局)', { hp: 42, atk: 20, def: 1 }, { atk: 10, def: 10 }, false],
  ['史莱姆(开局)', { hp: 78, atk: 25, def: 4 }, { atk: 10, def: 10 }, false],
  ['骷髅兵(中期)', { hp: 110, atk: 37, def: 6 }, { atk: 24, def: 16 }, false],
  ['空甲(锁梁)', { hp: 560, atk: 96, def: 34 }, { atk: 40, def: 30 }, false],
  ['灰烬祭司(锁梁,格挡)', { hp: 640, atk: 106, def: 36 }, { atk: 60, def: 40 }, true],
  ['碑魔(Boss)', { hp: 1400, atk: 158, def: 52 }, { atk: 107, def: 72 }, false],
];
for (const [name, m, panel, blocked] of cases) {
  const r = sim(m, panel, blocked);
  ok(r && r.foeOk, name + ' 怪血逐刀掉完、最后一刀正好归零（' + (r ? r.foeSum + '/' + m.hp : '-') + '）');
  if (r) ok(r.heroDmgLeft === 0, name + ' 玩家承伤均摊到演出结束余量为 0（演出内 ' + r.heroSum + '/真实 ' + r.totalDamage + '）');
}

// 回合数少于演出上限时，行为应与旧版一致：每刀真实伤害，最后一刀正好打完
const fast = sim({ hp: 30, atk: 8, def: 2 }, { atk: 10, def: 10 }, false);
ok(fast && fast.K === 4 && fast.foeOk, '短战斗（4 回合）按真实节奏逐刀打完、正好归零');

console.log('战斗演出分摊单测：' + pass + ' 项通过' + (bad ? '，' + bad + ' 项失败' : ''));
process.exit(bad ? 1 : 0);
