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

const all = crypto.createHash('md5');
all.update(html);
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
// 源码 index.html 同步指纹：本地/无头工具吃的是源码，指纹不跟就会加载旧 js
// （并发写回旧指纹会互相踩，这里每次 sync 都强制刷成最新 build）
fs.writeFileSync(path.join(ROOT, 'index.html'), outHtml);

const refs = outHtml.match(/\?v=[^"']+/g) || [];
console.log('build:', build);
console.log('versioned refs:', refs.length);
console.log('synced files:', JS_FILES.length + 2);
if (refs.some((r) => !r.includes(build))) throw new Error('version injection failed');
