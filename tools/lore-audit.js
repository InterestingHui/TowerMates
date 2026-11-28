#!/usr/bin/env node
// 叙事可达性审计（2026-11-24 加练·叙事）
//
// 目的：story.js 里的每一段叙事都必须「有人播」。此前 check.js 只断言了
// 「引用的键必须存在」（拼错键名 → playStory 静默跳过），反向没人管：
// 写好的稿子没有任何触发点 → 玩家永远读不到，而所有闸门全绿。
// 这就是 `floorTips` 藏了 13 段环境叙事的原因（2026-11-24 查出并删除）。
//
// 三类读数：
//   ① 孤儿叙事 — story.js 顶层有键，代码侧（data.js 除外）零引用、也没被 data 字段声明
//   ② 有键无稿 — 代码/data 引用了的键，story.js 没这段稿
//   ③ 弱引用 — 只被 data.js 的 story:/after: 声明（引擎按字段播），属正常，列出备查
//
// 用法：node tools/lore-audit.js          报告 + 退出码（① 或 ② 非空 → 1）
//       node tools/lore-audit.js --json   机读
//       require('./lore-audit.js').audit() 供 check.js 复用（单一实现）
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let cache = null;
function audit() {
  if (cache) return cache;
  const storySrc = read('js/story.js');
  const dataSrc = read('js/data.js');
  // 代码侧 = 真正「播」的地方；data.js 只算声明
  const codeFiles = fs.readdirSync(path.join(ROOT, 'js'))
    .filter((f) => f.endsWith('.js') && f !== 'story.js' && f !== 'data.js');
  const code = codeFiles.map((f) => read('js/' + f)).join('\n');

  // ---------- story.js 顶层键 ----------
  const keys = [...storySrc.matchAll(/^  ([A-Za-z_][A-Za-z0-9_]*):/gm)].map((m) => m[1]);

  // ---------- 子表（hints / keyHints / coach 的键在对象里） ----------
  function subKeys(name) {
    const re = new RegExp('^  ' + name + ':\\s*\\{', 'm');
    const m = re.exec(storySrc);
    if (!m) return [];
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < storySrc.length && depth > 0) {
      const c = storySrc[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      i++;
    }
    const body = storySrc.slice(start, i - 1);
    return [...body.matchAll(/^    '?([A-Za-z_][A-Za-z0-9_]*)'?:/gm)].map((x) => x[1]);
  }
  const hintKeys = subKeys('hints');
  const keyHintKeys = subKeys('keyHints');
  const coachKeys = subKeys('coach');

  // ---------- data.js 声明的剧情字段 ----------
  const declared = new Set();
  // 2026-11-28 多塔：塔群的 enter / clear 也是 data 字段代播（main.js 按 tw.enter / tw.clear 取），
  // 和 Boss 的 story/after 同一种弱引用，别把它们误判成孤儿。
  for (const m of dataSrc.matchAll(/\b(?:story|after|enter|clear):\s*'([A-Za-z_][A-Za-z0-9_]*)'/g)) declared.add(m[1]);

  function refsOf(k) {
    const pats = [
      new RegExp('\\bS\\.' + k + '\\b', 'g'),
      new RegExp('\\bSTORY\\.' + k + '\\b', 'g'),
      new RegExp("['\"]" + k + "['\"]", 'g'),
    ];
    let n = 0;
    for (const re of pats) n += (code.match(re) || []).length;
    return n;
  }

  const orphan = [];
  const weak = [];
  for (const k of keys) {
    const n = refsOf(k);
    if (n > 0) continue;
    if (declared.has(k)) weak.push(k);
    else orphan.push(k);
  }

  // ---------- 反向：引用/声明了但没稿 ----------
  const missing = [...declared].filter((k) => !keys.includes(k));
  const called = new Set();
  for (const m of code.matchAll(/playStory\(\s*(?:S\.)?['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) called.add(m[1]);
  const hintCalled = new Set();
  for (const m of code.matchAll(/sayHint\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g)) hintCalled.add(m[1]);
  const missingCalled = [...called].filter((k) => !keys.includes(k));
  // sayHint 先查 hints、再查 keyHints（main.js 两条分支同源）
  const missingHints = [...hintCalled].filter((k) => !hintKeys.includes(k) && !keyHintKeys.includes(k));

  cache = {
    keys: keys.length,
    declared: declared.size,
    hints: hintKeys.length,
    keyHints: keyHintKeys.length,
    coach: coachKeys.length,
    files: codeFiles.length,
    orphan,
    weak,
    missingDeclared: missing,
    missingCalled,
    missingHints,
  };
  return cache;
}

module.exports = { audit };

if (require.main === module) {
  const r = audit();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`叙事键 ${r.keys} 段（hints ${r.hints} / keyHints ${r.keyHints} / coach ${r.coach}）`
      + ` · data 声明 ${r.declared} 个 · 代码面 ${r.files} 个文件`);
    console.log(`① 孤儿叙事（写了没人播）：${r.orphan.length ? r.orphan.join(', ') : '0'}`);
    const miss = [...r.missingDeclared, ...r.missingCalled, ...r.missingHints];
    console.log(`② 有键无稿（播了没稿子）：${miss.length ? miss.join(', ') : '0'}`);
    console.log(`③ 弱引用（仅 data 字段声明，引擎代播）：${r.weak.length ? r.weak.join(', ') : '0'}`);
  }
  const bad = r.orphan.length + r.missingDeclared.length + r.missingCalled.length + r.missingHints.length;
  process.exit(bad ? 1 : 0);
}
