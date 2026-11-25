// tools/sync-publish.js
// 同步源码到 publish/，并把静态资源版本号替换为「内容指纹」。
// 效果：入口链接永久不变，但每次代码有改动，index.html 里的资源 URL 都会自动变化，
// 浏览器必然拉到新代码；内容没变时指纹不变，缓存照常生效。
// 用法：node tools/sync-publish.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'publish');
// 自动收齐 js/ 下所有模块：新增独立模块（手势、挑战码、平台桥接等）不用再改这张清单
const JS_FILES = fs.readdirSync(path.join(ROOT, 'js'))
  .filter((f) => f.endsWith('.js'))
  .sort();

const js = Object.fromEntries(JS_FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, 'js', f))]));
const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 指纹不能自引用：直接拿含旧 build/v= 的 html 算 md5，每次 sync 都会得到新指纹，
// 于是源码 index.html 永远处于「已修改」、线上与本地也永远对不上（排查部署状态时全是假信号）。
// 先把旧指纹抹成空再哈希——hash 只由真实内容决定，同样源码重复 sync 必须同指纹。
const htmlForHash = html
  .replace(/(\?v=)[^"']+/g, '$1')
  .replace(/(<meta name="build" content=")[^"]*(")/, '$1$2');
const all = crypto.createHash('md5');
all.update(htmlForHash);
all.update(css);
JS_FILES.forEach((f) => all.update(js[f]));
const build = all.digest('hex').slice(0, 10);

const outHtml = html
  .replace(/(\?v=)[^"']+/g, '$1' + build)
  .replace(/(<meta name="build" content=")[^"]*(")/, '$1' + build + '$2');

fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
JS_FILES.forEach((f) => fs.writeFileSync(path.join(OUT, 'js', f), js[f]));
fs.writeFileSync(path.join(OUT, 'css', 'style.css'), css);
fs.writeFileSync(path.join(OUT, 'index.html'), outHtml);

// CG 的指纹单走一套（2026-11-25）：上面的 build 只算 html+css+js，换一张 assets/cg/*.webp
// 指纹一字不变 ⇒ 老玩家浏览器继续用缓存里的旧图（结局那张 dawn 已经换过一次）。
// 把 assets/cg 的内容指纹写进 publish 那份 backdrops.js：换图即换 URL，不靠人记得 bump。
const CG_DIR = path.join(ROOT, 'assets', 'cg');
const cgFiles = fs.existsSync(CG_DIR)
  ? fs.readdirSync(CG_DIR).filter((f) => /\.(webp|png|jpg)$/.test(f)).sort()
  : [];
const ah = crypto.createHash('md5');
cgFiles.forEach((f) => { ah.update(f); ah.update(fs.readFileSync(path.join(CG_DIR, f))); });
const assetV = ah.digest('hex').slice(0, 8);
const bdSrcText = js['backdrops.js'].toString('utf8');
const bdOut = bdSrcText.replace(/const ASSET_V = '[^']*';/, `const ASSET_V = '${assetV}';`);
if (bdOut === bdSrcText) throw new Error('asset version injection failed: ASSET_V 那行不见了');
fs.writeFileSync(path.join(OUT, 'js', 'backdrops.js'), bdOut);

// 静态资产（立绘等）：整目录同步，避免 publish/ 缺图导致回落成 SVG
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
// 源码 index.html 同步指纹：本地/无头工具吃的是源码，指纹不跟就会加载旧 js
// （并发写回旧指纹会互相踩，这里每次 sync 都强制刷成最新 build）
fs.writeFileSync(path.join(ROOT, 'index.html'), outHtml);

const refs = outHtml.match(/\?v=[^"']+/g) || [];
console.log('build:', build);
console.log('assetV:', assetV, `(${cgFiles.length} 张 CG)`);
console.log('versioned refs:', refs.length);
console.log('synced files:', JS_FILES.length + 2);
if (refs.some((r) => !r.includes(build))) throw new Error('version injection failed');
