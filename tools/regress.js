// 一条命令跑完全部质量闸门：数据校验 → 平衡模拟 → 单测 → 无头截图
// 用法：node tools/regress.js [--no-shot]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const PORT = 8899;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const SCENES = ['start', 'play', 'critters', 'dialog', 'battle', 'battleblock', 'bossphase', 'altar', 'choice', 'end', 'board', 'codex', 'cfg', 'hud', 'tower', 'core', 'heart', 'stoneidle', 'vow', 'event', 'eventdeep', 'gate', 'echo', 'goal', 'flow'];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('== 1/4 地图与数据校验 ==');
const check = run(process.execPath, ['tools/check.js']);
const okCheck = check.code === 0;
console.log((okCheck ? '✓' : '✗') + ' check.js' + (okCheck ? '' : '\n' + check.out));

console.log('== 2/4 平衡模拟 ==');
const sim = run(process.execPath, ['tools/sim.js']);
const simLine = sim.out.split('\n').filter((l) => l.includes('总承伤')).pop() || '';
const okSim = sim.code === 0 && sim.out.includes('通关成功');
console.log((okSim ? '✓' : '✗') + ' sim.js ' + simLine.trim());

console.log('== 3/4 引擎单测 ==');
const test = run(process.execPath, ['tools/engine-test.js']);
const passed = (test.out.match(/^✓/gm) || []).length;
const okTest = test.code === 0;
console.log((okTest ? '✓' : '✗') + ` engine-test.js ${passed} 项`);

console.log('== 4/4 挑战码与触控单测 ==');
const code = run(process.execPath, ['tools/code-test.js']);
const codePassed = (code.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okCode = code.code === 0;
console.log((okCode ? '✓' : '✗') + ` code-test.js ${codePassed} 项` + (okCode ? '' : '\n' + code.out));

let okShots = true;
if (!process.argv.includes('--no-shot')) {
  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.log('! 没找到 Chrome/Edge，跳过截图');
  } else {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
    const server = spawn(process.execPath, ['tools/serve.js', String(PORT), ROOT], { cwd: ROOT, stdio: 'ignore' });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      await wait(900);
      let bad = 0;
      for (const scene of SCENES) {
        const file = path.join(OUT, scene + '.png');
        const args = [
          '--headless=new', '--disable-gpu', '--hide-scrollbars',
          '--window-size=430,900', '--virtual-time-budget=7000',
          '--screenshot=' + file,
          `http://127.0.0.1:${PORT}/tools/shot.html?scene=${scene}`,
        ];
        let r = spawnSync(chrome, args, { encoding: 'utf8' });
        let size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        if (r.status !== 0 || size <= 8000) {
          r = spawnSync(chrome, args, { encoding: 'utf8' });
          size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        }
        const good = size > 8000;
        if (!good) bad++;
        console.log((good ? '✓' : '✗') + ` scene ${scene} ${(size / 1024).toFixed(0)}KB`);
      }
      server.kill();
      console.log(bad === 0 ? `\n✓ 截图全部生成（${SCENES.length} 张，见 tools/out/）` : `\n✗ ${bad} 张截图异常`);

      console.log('== 浏览器 UI 自检 ==');
      const ui = run(process.execPath, ['tools/ui-test.js']);
      const okUi = ui.code === 0;
      console.log((okUi ? '✓' : '✗') + ' ui-test.js' + (okUi ? '' : '\n' + ui.out));
      const all = okCheck && okSim && okTest && okCode && okUi && bad === 0;
      console.log(all ? '✓ 质量闸门通过' : '✗ 质量闸门有失败项');
      process.exit(all ? 0 : 1);
    })();
    return;
  }
}
console.log(okCheck && okSim && okTest && okCode ? '\n✓ 质量闸门通过' : '\n✗ 有失败项');
process.exit(okCheck && okSim && okTest && okCode ? 0 : 1);
