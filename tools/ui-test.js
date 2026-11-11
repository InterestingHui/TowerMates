// 无头浏览器 UI 自检：跳层神器的明码取舍、新模块加载、挑战码贴码进榜闭环
// 用法：node tools/ui-test.js（需要 Chrome/Edge；没有时跳过，不算失败）
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.log('! 没找到 Chrome/Edge，跳过 UI 检查');
  process.exit(0);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ui-'));

(async function () {
  // 让系统分配空闲端口：多个会话同时跑回归时不会互相抢占
  const probe = net.createServer();
  const PORT = await new Promise((resolve) => {
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });
  const server = spawn(process.execPath, ['tools/serve.js', String(PORT), ROOT], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=16000', '--dump-dom',
    `http://127.0.0.1:${PORT}/tools/ui-check.html`,
  ];
  const dump = () => spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const preOf = (txt) => /<pre[^>]*id="out"[^>]*>([\s\S]*?)<\/pre>/.exec(txt || '');
  let r = dump();
  let m = preOf(r.stdout);
  // 无头 Chrome 偶发拿到空 DOM、或 iframe 的 run 还没跑完（多会话并发时更常见），重试一次
  if (r.status !== 0 || !m || m[1] === 'pending') {
    r = dump();
    m = preOf(r.stdout);
  }
  server.kill();
  if (!m) {
    console.log('✗ 没拿到 UI 检查输出');
    process.exit(1);
  }
  const txt = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  let out;
  try { out = JSON.parse(txt); } catch (e) {
    console.log('✗ UI 输出不是 JSON：' + txt.slice(0, 200));
    process.exit(1);
  }
  if (out.error) console.log('  iframe 报错：' + out.error.slice(0, 300));

  let bad = 0;
  function ok(cond, label) {
    if (cond) console.log('✓ ' + label);
    else { bad++; console.log('✗ ' + label); }
  }
  ok(out.booted === true, '?play=1 后引擎就绪');
  ok(out.modules && out.modules.touch && out.modules.challenge && out.modules.wx, '触控 / 挑战码 / 平台桥接模块已加载');
  ok(out.gateEnabled === true, '首层拿到钥匙时「往前开一层」可用');
  ok(typeof out.gateBtn === 'string' && out.gateBtn.indexOf('往前开一层') >= 0, '按钮写明目标层与一次性');
  ok(typeof out.gateTip === 'string' && out.gateTip.indexOf('封印') >= 0, '代价在按钮下方明码列出');
  ok(out.afterFloor === 1 && out.gateForthUsed === true, '点两次确认后真的跳到第 2 层');
  ok(out.sealCount === 2, '两件宝物被封印并写进存档');
  ok(out.codeLen > 0 && out.codeLen <= 80, '挑战码短到能直接贴进输入框');
  ok(out.codeFloor === 9 && out.codeSeal === 'ward' && out.codeGoals === 3 && out.noScore === true, '挑战码还原层数/塔印/塔规，且不含结算分');
  ok(out.pasteMax >= 45, '贴码输入框容得下新码');
  ok(out.rivalFloor === true, '贴码后名录出现朋友的层数');
  ok(out.clickTarget !== null && out.clickDist >= 2, '找到一只不相邻的怪物作点击目标');
  ok(out.clickKills === 1, '只点一次怪物就自动走到跟前并完成战斗');
  ok(out.clickCleared === true && out.clickOnTile === true, '战斗后怪物消失、人物站上它的格子');
  ok(out.f3Ledge === '.' && out.f3ReachLedge === true, '第 3 层打砚的立足格可直达');
  ok(out.f3ShopOnPath === false, '通往砚的自动寻路不再踩到商店');
  ok(out.f3UpPath === true, '砚倒下后入口到上楼有通路');
  ok(out.firstWinBonus === 12, '解锁誓约首通额外 +12，第二次不再给');
  ok(out.avgEmber === 20 && out.avgFallback === 18, '余烬估算走近 3 局平均，无记录回退 18');
  ok(out.emberDetail === true, '结局页逐项展示本局余烬来源');
  ok(out.lampBtn === true && out.lampLit === true, '全解锁后余烬可点亮层灯（扣 20、灯 +1）');
  ok(out.richBold === true && out.richNoHtml === true, '提示加粗生效且文案不会被当 HTML 执行');
  ok(out.hintScripts === true, '九条角色提示台词就位（含加粗重点）');
  ok(out.warnBold === true, '操作反馈里的重点也加粗');
  ok(out.hintDialog === true, '关键提示改走角色对白，点击可提前收起');
  ok(out.hintAutoClose === true, '角色提示悬挂到时自己收起，不会一直占着画面');
  ok(out.goalCollapsed === true && out.goalReopen === true, '顶栏「本层规矩」挂够时间收起，点一下可再展开');
  ok(out.stuckBar === true, '打不过时顶栏钉住「还差多少攻击」的指引且重点加粗');
  ok(out.hintSpeed === true && out.hintMsScaled === true, '提示停留档位可切换且时长跟着变');
  ok(out.hintBook === true, '设置里可重看全部角色提示台词');

  if (bad) console.log('  诊断：' + JSON.stringify(out).slice(0, 700));
  console.log(bad === 0 ? '✓ UI 自检通过' : `✗ UI 自检 ${bad} 项失败`);
  process.exit(bad ? 1 : 0);
})();
