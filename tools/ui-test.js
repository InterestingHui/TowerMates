// 无头浏览器 UI 自检：跳层神器的明码取舍、新模块加载、挑战码贴码进榜闭环
// 用法：node tools/ui-test.js（需要 Chrome/Edge；没有时跳过，不算失败）
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8907;
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
const server = spawn(process.execPath, ['tools/serve.js', String(PORT), ROOT], { cwd: ROOT, stdio: 'ignore' });

(async function () {
  await new Promise((r) => setTimeout(r, 800));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=10000', '--dump-dom',
    `http://127.0.0.1:${PORT}/tools/ui-check.html`,
  ];
  const r = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  server.kill();

  const m = /<pre[^>]*id="out"[^>]*>([\s\S]*?)<\/pre>/.exec(r.stdout || '');
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
  ok(out.codeScore === 3100, '挑战码里的分数可还原');
  ok(out.pasteMax >= 45, '贴码输入框容得下新码');
  ok(out.rivalScore === true, '贴码后榜单出现朋友的幽灵行');

  if (bad) console.log('  诊断：' + JSON.stringify(out).slice(0, 700));
  console.log(bad === 0 ? '✓ UI 自检通过' : `✗ UI 自检 ${bad} 项失败`);
  process.exit(bad ? 1 : 0);
})();
