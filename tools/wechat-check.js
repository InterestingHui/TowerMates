// 微信工程静态校验：配置能不能被开发者工具接受、页面文件齐不齐、主包会不会超限
// 用法：node tools/wechat-check.js
// 说明：这里只做**静态**校验（不装开发者工具、不调 wx API）；真机编译仍需人工过一遍。
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WX = path.join(ROOT, 'wechat');
const MP = path.join(WX, 'miniprogram');
const GAME = path.join(WX, 'wxgame');

let bad = 0;
let warn = 0;
function err(msg) { bad++; console.log('  ✗ ' + msg); }
function note(msg) { warn++; console.log('  ! ' + msg); }
function okk(msg) { console.log('  ✓ ' + msg); }

function readJson(p, label) {
  if (!fs.existsSync(p)) { err(`${label} 不存在：${path.relative(ROOT, p)}`); return null; }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    err(`${label} 不是合法 JSON：${e.message}`);
    return null;
  }
}

function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else total += fs.statSync(p).size;
    }
  };
  walk(dir);
  return total;
}

// ---------- 1. 小程序壳（web-view 嵌 H5） ----------
console.log('== 小程序壳 wechat/miniprogram ==');
if (!fs.existsSync(MP)) {
  err('wechat/miniprogram 不存在');
} else {
  const appJson = readJson(path.join(MP, 'app.json'), 'app.json');
  const proj = readJson(path.join(MP, 'project.config.json'), 'project.config.json');
  if (appJson) {
    const pages = Array.isArray(appJson.pages) ? appJson.pages : [];
    if (!pages.length) err('app.json 的 pages 为空，开发者工具会打不开');
    pages.forEach((pg) => {
      // 小程序页面：.js 与 .wxml 必需，.json/.wxss 可选
      ['.js', '.wxml'].forEach((ext) => {
        if (!fs.existsSync(path.join(MP, pg + ext))) err(`页面 ${pg} 缺 ${ext}`);
      });
      if (!fs.existsSync(path.join(MP, pg + '.json'))) note(`页面 ${pg} 没有 .json（可选，但建议显式关掉导航栏）`);
    });
    if (appJson.sitemapLocation && !fs.existsSync(path.join(MP, appJson.sitemapLocation))) {
      err(`app.json 指向的 ${appJson.sitemapLocation} 不存在`);
    }
    okk(`app.json 声明 ${pages.length} 个页面，文件齐全`);
  }
  if (proj) {
    if (proj.compileType !== 'miniprogram') err(`project.config.json 的 compileType 是 ${proj.compileType}，应为 miniprogram`);
    const root = proj.miniprogramRoot || './';
    if (!fs.existsSync(path.resolve(MP, root))) err(`miniprogramRoot（${root}）指不到目录`);
    if (!proj.appid) note('project.config.json 没有 appid——真机预览/上传要你填自己的小程序 appid（工具仍可本地编译）');
    else okk('appid 已填');
  }
  const size = dirSize(MP);
  const MB = 1024 * 1024;
  if (size > 2 * MB) err(`主包 ${(size / MB).toFixed(2)}MB 超过小程序 2MB 上限`);
  else okk(`主包 ${(size / 1024).toFixed(1)}KB（上限 2MB）`);
}

// ---------- 2. 小游戏骨架 ----------
console.log('== 小游戏骨架 wechat/wxgame ==');
if (!fs.existsSync(GAME)) {
  err('wechat/wxgame 不存在');
} else {
  const gameJson = readJson(path.join(GAME, 'game.json'), 'game.json');
  const proj = readJson(path.join(GAME, 'project.config.json'), 'project.config.json');
  if (!fs.existsSync(path.join(GAME, 'game.js'))) err('缺 game.js（小游戏入口必需）');
  if (gameJson) {
    if (gameJson.openDataContext) {
      const od = path.join(GAME, gameJson.openDataContext);
      if (!fs.existsSync(path.join(od, 'index.js'))) err(`openDataContext 指向 ${gameJson.openDataContext}，但缺 index.js`);
      else okk(`开放数据域在 ${gameJson.openDataContext}/index.js`);
    }
    if (!gameJson.deviceOrientation) note('game.json 没写 deviceOrientation（默认竖屏，建议显式声明）');
  }
  if (proj && proj.compileType && proj.compileType !== 'game') {
    err(`wxgame/project.config.json 的 compileType 是 ${proj.compileType}，应为 game`);
  }
  const size = dirSize(GAME);
  if (size > 4 * 1024 * 1024) err(`小游戏包 ${(size / 1024 / 1024).toFixed(2)}MB 超过 4MB 主包上限`);
  else okk(`小游戏包 ${(size / 1024).toFixed(1)}KB（上限 4MB）`);
}

// ---------- 3. 不许在 wechat/ 里养一份游戏源码 ----------
// web 版源码是 js/ 那一份唯一真相；微信壳要么 web-view 引 H5，要么另写 canvas 版。
// 如果这里出现 data.js / engine.js / main.js 的副本，两边必然漂移——直接判红。
console.log('== 源码单一真相 ==');
const GAME_SRC = ['data.js', 'engine.js', 'main.js', 'render.js', 'story.js', 'achievements.js'];
const dupes = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (GAME_SRC.indexOf(e.name) >= 0) dupes.push(path.relative(ROOT, p));
  }
})(WX);
if (dupes.length) err(`wechat/ 里出现游戏源码副本（会和 js/ 漂移）：${dupes.join('、')}`);
else okk('wechat/ 只放壳与开放数据域，游戏源码仍以 js/ 为唯一真相');

console.log(
  bad === 0
    ? `\n✓ 微信工程静态校验通过${warn ? `（${warn} 条提醒）` : ''}`
    : `\n✗ 共 ${bad} 个问题${warn ? `、${warn} 条提醒` : ''}`
);
process.exit(bad === 0 ? 0 : 1);
