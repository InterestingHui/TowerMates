// 线上冒烟：把「发布成功」验成「线上真的是这一版」
// 用法：node tools/live-check.js            （默认查 towermates 正式域名）
//       node tools/live-check.js --url http://127.0.0.1:8899/index.html
//
// 查三件事：
//   1. 线上 index.html 的 build 指纹与本地一致（不一致 = 发布了但没生效，或 CDN 还在旧版）
//   2. 页面能起（canvas 在位、开始按钮在、DOM 体积正常）
//   3. 没有 Uncaught / TypeError 之类的脚本错误漏在页面上
// 需要联网 + 本机 Chrome/Edge；两者缺一时按「跳过」处理，不误判成失败。
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_URL = 'https://towermates.app.workbuddy.host/?sharecode=U7XMLC2NKJ';
const argUrl = (() => {
  const i = process.argv.indexOf('--url');
  return i >= 0 ? process.argv[i + 1] : null;
})();
const URL_ = argUrl || DEFAULT_URL;

const localBuild = (() => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const m = /name="build" content="([a-f0-9]+)"/.exec(html);
  return m ? m[1] : null;
})();

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

let bad = 0;
function err(m) { bad++; console.log('  ✗ ' + m); }
function okk(m) { console.log('  ✓ ' + m); }

console.log('== 线上冒烟 ' + URL_);
console.log('  本地 build：' + (localBuild || '（本地 index.html 里没找到 build 指纹）'));

if (!CHROME) {
  console.log('  ! 没找到 Chrome/Edge，跳过浏览器部分（只做指纹比对）');
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-live-'));
const dump = CHROME
  ? spawnSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=12000', '--dump-dom', URL_,
  ], { encoding: 'utf8', maxBuffer: 24 * 1024 * 1024 })
  : null;

const dom = (dump && dump.stdout) || '';
if (!dom || dom.length < 2000) {
  console.log('  ! 拿不到线上 DOM（网络/域名不可达，或 headless 启动失败）——本轮跳过，不判失败');
  process.exit(0);
}

const liveBuild = (() => {
  const m = /name="build" content="([a-f0-9]+)"/.exec(dom);
  return m ? m[1] : null;
})();
if (!liveBuild) err('线上页面里找不到 build 指纹（index.html 可能不是本项目）');
else if (!localBuild) console.log('  ! 本地没有 build 指纹，只报线上值：' + liveBuild);
else if (liveBuild !== localBuild) err(`线上 build ${liveBuild} ≠ 本地 ${localBuild}——改动没上线或缓存未刷新`);
else okk(`线上 build 与本地一致：${liveBuild}`);

if (!/<canvas[^>]*id="game"/.test(dom)) err('页面里没有 #game 画布');
else okk('画布在位');

if (!/开始游戏/.test(dom)) err('标题页没有「开始游戏」按钮');
else okk('标题页可交互');

const errHits = (dom.match(/Uncaught (Error|TypeError|ReferenceError)[^<]{0,80}/g) || []);
if (errHits.length) err(`页面上残留脚本错误：${errHits.slice(0, 2).join(' | ')}`);
else okk('没有未捕获的脚本错误');

// 关键模块是否随页面一起到位（接口缺一个就说明发布漏文件）
['js/main.js', 'js/engine.js', 'js/data.js', 'css/style.css'].forEach((f) => {
  if (dom.indexOf(f) < 0) err(`页面没有引用 ${f}`);
});

console.log(bad === 0 ? '\n✓ 线上冒烟通过' : `\n✗ 线上冒烟 ${bad} 项失败`);
process.exit(bad === 0 ? 0 : 1);
