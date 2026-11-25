// 一条命令跑完全部质量闸门：数据校验 → 平衡模拟 → 单测 → 无头截图
// 用法：node tools/regress.js [--no-shot]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
// 按进程号错开端口：多个会话同时跑回归不会互相抢占
const PORT = 8800 + (process.pid % 300);
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const SCENES = ['start', 'play', 'bossintro', 'codexzoom', 'critters', 'minions', 'dialog', 'hint', 'stuck', 'battle', 'battleblock', 'prep', 'prep4', 'bossphase', 'bossyan', 'bossdef', 'probecard', 'altar', 'choice', 'end', 'board', 'codex', 'cfg', 'hud', 'tower', 'core', 'heart', 'stoneidle', 'vow', 'vowfirst', 'vowflash', 'event', 'eventdeep', 'gate', 'echo', 'goal', 'flow', 'showcase', 'death', 'death1', 'collection', 'adsdeath', 'adsend', 'sword', 'daily', 'dailyboard', 'dailyend', 'floor2', 'floor3', 'shop', 'echo2', 'battletwice', 'zeal', 'final', 'tanglebattle', 'guardbattle', 'threatbattle', 'hudmax'];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('== 1/7 地图与数据校验 ==');
const check = run(process.execPath, ['tools/check.js']);
const okCheck = check.code === 0;
console.log((okCheck ? '✓' : '✗') + ' check.js' + (okCheck ? '' : '\n' + check.out));

console.log('== 2/7 平衡模拟 ==');
const sim = run(process.execPath, ['tools/sim.js']);
const simLine = sim.out.split('\n').filter((l) => l.includes('总承伤')).pop() || '';
const okSim = sim.code === 0 && sim.out.includes('通关成功');
console.log((okSim ? '✓' : '✗') + ' sim.js ' + simLine.trim());
// 避战流是决战余裕 S 档的唯一现有路线；它必须仍然可达，
// 否则「S 档 +2 余烬」「图鉴里拿一次 S」「结算提示避战可上 S」全是空话
const skipSim = run(process.execPath, ['tools/sim.js', '--skip-fights']);
const skipPct = /真实终局[^\n]*（([\d.]+)%）/.exec(skipSim.out || '');
const okSkip = skipSim.code === 0 && skipSim.out.includes('通关成功') && skipPct && Number(skipPct[1]) >= 70;
console.log((okSkip ? '✓' : '✗') + ` 避战流 S 档可达 ${skipPct ? skipPct[1] + '%' : '读数失败'}（阈值 ≥70%）`);

console.log('== 3/7 引擎单测 ==');
const test = run(process.execPath, ['tools/engine-test.js']);
// 计数只数「断言」，不数结尾那行 `✓ 全部通过`——它也是以 ✓ 开头，一直被算成第 636 条，
// 于是同一个套件有时报 635（少读到最后一行）有时报 636，PROGRESS 里还留了句「实际是 635」的注。
// 现在口径唯一：行数 = 断言数，且与文档里的基线同源。
const passed = (test.out.match(/^✓ (?!全部通过)/gm) || []).length;
const okTest = test.code === 0;
console.log((okTest ? '✓' : '✗') + ` engine-test.js ${passed} 项`);

console.log('== 4/7 挑战码与触控单测 ==');
const code = run(process.execPath, ['tools/code-test.js']);
const codePassed = (code.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okCode = code.code === 0;
console.log((okCode ? '✓' : '✗') + ` code-test.js ${codePassed} 项` + (okCode ? '' : '\n' + code.out));

console.log('== 5/7 战斗演出分摊单测 ==');
const bsim = run(process.execPath, ['tools/battle-sim-test.js']);
const bsimPassed = (bsim.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okBsim = bsim.code === 0;
console.log((okBsim ? '✓' : '✗') + ` battle-sim-test.js ${bsimPassed} 项` + (okBsim ? '' : '\n' + bsim.out));

console.log('== 6/7 开放数据域榜单单测 ==');
const od = run(process.execPath, ['tools/opendata-test.js']);
const odPassed = (od.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okOd = od.code === 0;
console.log((okOd ? '✓' : '✗') + ` opendata-test.js ${odPassed} 项` + (okOd ? '' : '\n' + od.out));

// 随机操作序列的不变量 fuzz（种子固定 ⇒ 可复现）：走 / 打（四种打法）/ 买 / 祭坛 / 路遇 /
// 塔心石 / 锁环 / 重来本层 / 存档读档往返，每一步都查一组不变量。设计好的场景测不到的东西靠它。
console.log('== 7/7 随机操作不变量 fuzz ==');
const fz = run(process.execPath, ['tools/fuzz.js', '12000', '6']);
const okFuzz = fz.code === 0;
const fzDeep = (fz.out.match(/最深第 (\d+) 层/g) || []).map((m) => Number(m.replace(/\D+/g, '')));
const fzMax = fzDeep.length ? Math.max.apply(null, fzDeep) : 0;
const fzBad = (fz.out.match(/^✗/gm) || []).length;
console.log((okFuzz ? '✓' : '✗') + ` fuzz.js 6 种子 × 12000 步 · 最深第 ${fzMax} 层 · 不变量违规 ${fzBad} 类`
  + (okFuzz ? '' : '\n' + fz.out));

let okShots = true;

// 微信工程静态校验：清单能被开发者工具接受、页面文件齐、壳里不许藏游戏源码副本
console.log('== 附加 · 微信工程静态校验 ==');
const wx = run(process.execPath, ['tools/wechat-check.js']);
const okWx = wx.code === 0;
console.log((okWx ? '✓' : '✗') + ' wechat-check.js' + (okWx ? '' : '\n' + wx.out));

// 可读性契约（源码侧）：这六个灰值曾是「同一族暗字」的复制源头（实测 1.6~2.9:1，都低于 3:1 底线），
// 2026-11-16 已统一收口到 --text / --muted / --dim。探针只能测「今天这些屏」，抄回旧值是「以后某屏才犯」的错，
// 所以另立一条源码契约：color 声明里再出现这些值就红。同理禁止拿描边色当文字色
// （--line-* 是画在背景上的线，最亮档 rgba(255,255,255,.16) 当字色只有 1.6:1）。
{
  const cssTxt = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const BAD = ['#555d6d', '#4e5666', '#5d6577', '#5d6675', '#7a8496', '#7d8698'];
  const declared = Array.from(cssTxt.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{3,6})/g)).map((m) => m[1].toLowerCase());
  const hits = BAD.filter((b) => declared.includes(b));
  // 只看真正的文字色：border-color / background-color 里出现 --line-* 是正常的
  const lineAsText = /(?<![-\w])color:\s*var\(--line-/.test(cssTxt);
  const okCss = hits.length === 0 && !lineAsText;
  console.log((okCss ? '✓' : '✗') + ' 可读性契约（css 里不许再出现旧暗字 / 描边色当字色）'
    + (okCss ? '' : ` · 命中 ${hits.join(' ') || ''}${lineAsText ? ' 描边色当字色' : ''}`));
}
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
        const budget = scene === 'sword' ? 20000 : 7000;   // sword 全链路要跑「踩剑→对白→平结局」
        const args = [
          '--headless=new', '--disable-gpu', '--hide-scrollbars',
          '--window-size=430,900', '--virtual-time-budget=' + budget,
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
      // 第八勇者线全链路：踩断剑 → 认剑变体 → 平结局三件（熔灯句/替川胶囊/执剑者成就）
      console.log('== 附加 · 第八勇者线全链路 ==');
      {
        const os = require('os');
        const swArgs = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-sword-' + process.pid),
          '--virtual-time-budget=30000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=sword`,
        ];
        const readSword = () => {
          const p = spawnSync(chrome, swArgs, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(t);
          return m ? m[1] : '';
        };
        let swOut = readSword();
        if (!swOut.includes('achFinish')) swOut = readSword();   // 偶发空 DOM：重试一次
        const need = ['edge=true', 'achEdge=in', 'swordVariant=in', 'plainSwordLine=in', 'zealChip=in', 'achFinish=in'];
        const okSword = need.every((k) => swOut.includes(k));
        console.log((okSword ? '✓' : '✗') + ' 第八勇者线 ' + need.filter((k) => swOut.includes(k)).length + '/' + need.length + ' 项'
          + (okSword ? '' : '\n' + swOut.slice(0, 400)));
        var okSwordGate = okSword;
      }
      // 开放数据域榜单：三态排版截图（子域代码与 H5 调试页共用同一份绘制实现）
      for (const cs of ['full', 'empty', 'loading']) {
        const file = path.join(OUT, 'od-' + cs + '.png');
        const r = spawnSync(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars',
          '--window-size=430,620', '--virtual-time-budget=4000',
          '--screenshot=' + file,
          `http://127.0.0.1:${PORT}/tools/opendata-check.html?case=${cs}`,
        ], { encoding: 'utf8' });
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        const good = r.status === 0 && size > 8000;
        if (!good) bad++;
        console.log((good ? '✓' : '✗') + ` opendata ${cs} ${(size / 1024).toFixed(0)}KB`);
      }
      // 序章分镜四幕：21 项断言（幕在播/幕序/路径属性无粘连/帕心唯一/暖光/清场/非序章无场景）+ 四幕截图
      console.log('== 附加 · 序章分镜 ==');
      {
        const readScene = () => {
          const p = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-scene-' + process.pid),
            '--virtual-time-budget=20000', '--dump-dom',
            `http://127.0.0.1:${PORT}/tools/scene-check.html`,
          ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let scOut = readScene();
        if (!scOut.includes('ALL PASS') && !scOut.includes('HAS FAIL')) scOut = readScene(); // 偶发空 DOM 重试
        const okScene = scOut.includes('ALL PASS');
        const n = (scOut.match(/✓/g) || []).length;
        console.log((okScene ? '✓' : '✗') + ` scene-check ${n} 项` + (okScene ? '' : '\n' + scOut.slice(0, 400)));
        if (!okScene) bad++;
        for (let i = 0; i < 4; i++) {
          const file = path.join(OUT, 'scene-act' + i + '.png');
          spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--hide-scrollbars',
            '--window-size=430,900', '--virtual-time-budget=9000',
            '--screenshot=' + file,
            `http://127.0.0.1:${PORT}/tools/scene-check.html?stay=${i}`,
          ], { encoding: 'utf8' });
          const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
          const good = size > 20000;   // 场景铺满全屏的画面远大于纯面板截图
          if (!good) bad++;
          console.log((good ? '✓' : '✗') + ` scene-act${i} ${(size / 1024).toFixed(0)}KB`);
        }
      }
      // 对白背景一致性：14 张（序章之后）+ 序章四幕放进同一把尺子量明度/亮面积/焦点位置
      // （2026-11-25 加练美术焦点A：backdrops.js 新增 718 行，此前只有一张肉眼网格页，零度量）
      console.log('== 附加 · 对白背景一致性 ==');
      {
        const readBd = () => {
          const p = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-bdluma-' + process.pid),
            '--virtual-time-budget=30000', '--dump-dom',
            `http://127.0.0.1:${PORT}/tools/bd-luma.html`,
          ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let bdOut = readBd();
        if (!bdOut.includes('ALL PASS') && !bdOut.includes('HAS FAIL')) bdOut = readBd();   // 偶发空 DOM 重试
        const okBd = bdOut.includes('ALL PASS');
        const bdN = (bdOut.match(/✓/g) || []).length;
        console.log((okBd ? '✓' : '✗') + ` backdrop-luma ${bdN} 项` + (okBd ? '' : '\n' + bdOut.slice(0, 400)));
        if (!okBd) bad++;
      }
      // 「打不过」预警归属：撞墨妖（打不过）时，说话人必须是引导者（烛/秤），
      // 不许 Boss 自己开口，也不许战前剧本串场（2026-11-20 用户反馈：逻辑要严谨）
      console.log('== 附加 · 打不过预警归属 ==');
      {
        const os = require('os');
        const readStuck = () => {
          const p = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-stuck-' + process.pid),
            '--virtual-time-budget=40000', '--dump-dom',
            `http://127.0.0.1:${PORT}/tools/stuck-check.html`,
          ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let skOut = readStuck();
        if (!skOut.includes('ALL PASS') && !skOut.includes('HAS FAIL')) skOut = readStuck();
        const okStuck = skOut.includes('ALL PASS');
        const skN = (skOut.match(/✓/g) || []).length;
        console.log((okStuck ? '✓' : '✗') + ` stuck-check ${skN} 项` + (okStuck ? '' : '\n' + skOut.slice(0, 400)));
        if (!okStuck) bad++;
      }
      // 首遇特性规则：怪名旁挂着「⚡先攻」，规则原来只用 log() 投到 #log 最下缘，
      // 而那一刻战斗遮罩正盖在上面——规则投递到了被自己挡住的面（2026-11-20 加练美术焦点B）。
      // 现在面板内念一遍（烛开口，正文逐字取自 TRAITS.tip），并且留够读完的时间。
      console.log('== 附加 · 首遇特性规则归属 ==');
      {
        const os = require('os');
        const readTrait = () => {
          const p = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-trait-' + process.pid),
            '--virtual-time-budget=60000', '--dump-dom',
            `http://127.0.0.1:${PORT}/tools/trait-check.html`,
          ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let trOut = readTrait();
        if (!trOut.includes('ALL PASS') && !trOut.includes('HAS FAIL')) trOut = readTrait();
        const okTrait = trOut.includes('ALL PASS');
        const trN = (trOut.match(/✓/g) || []).length;
        console.log((okTrait ? '✓' : '✗') + ` trait-check ${trN} 项` + (okTrait ? '' : '\n' + trOut.slice(0, 500)));
        if (!okTrait) bad++;
      }
      // 手感探针：跳过必须当场生效（曾经点一下要白等 528ms / Boss 过场 950ms）
      console.log('== 附加 · 手感探针（战斗跳过延迟）==');
      let okProbe = true, probeA3 = -1;
      {
        // 独立 user-data-dir：紧跟在 33 张截图之后复用默认 profile 会被锁住，
        // 探针会静默跑出一个空 DOM（表现为「读数失败」而不是红）
        const os = require('os');
        const probeArgs = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-probe-' + process.pid),
          '--virtual-time-budget=90000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/fx-probe.html?gate=1`,
        ];
        const readA3 = () => {
          const p = spawnSync(chrome, probeArgs, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /A3=(\d+)/.exec(p.stdout || '');
          return m ? Number(m[1]) : -1;
        };
        probeA3 = readA3();
        if (probeA3 < 0) probeA3 = readA3(); // 偶发空 DOM：重试一次再判红
        okProbe = probeA3 >= 0 && probeA3 < 150;
        console.log((okProbe ? '✓' : '✗') + ` 点跳过→面板消失 ${probeA3 < 0 ? '读数失败' : probeA3 + 'ms'}（阈值 <150ms）`);
      }

      // 广告卡点：默认不可用（线上零变化）+ ?ads=1 时两个卡点能走通
      console.log('== 附加 · 激励视频卡点自检 ==');
      let okAds = true, adsLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-ads-' + process.pid),
          '--virtual-time-budget=60000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/ads-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const pass = /ALLPASS\|1+/.test(t);
          const failBits = /(?:ALLPASS|HASFAIL|ERR)\|([01]+)/.exec(t);
          return { pass, bits: failBits ? failBits[1] : '' };
        };
        let r = read();
        if (!r.bits) r = read();
        okAds = r.pass;
        adsLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okAds ? '✓' : '✗') + ` 广告卡点 ${adsLine}`);
      }
      // 序章只播一次：首次必播、老玩家跳过、设置里能重看
      console.log('== 附加 · 序章重播自检 ==');
      let okIntro = true, introLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-intro-' + process.pid),
          '--virtual-time-budget=60000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/intro-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const pass = /ALLPASS\|1+/.test(t);
          const bits = /(?:ALLPASS|HASFAIL|ERR)\|([01]+)/.exec(t);
          return { pass, bits: bits ? bits[1] : '' };
        };
        let r = read();
        // 「7/9」这种「bits 读到了但没满」的形态，是虚拟时间预算被并发负载吃掉的典型结果
        // （2026-11-17 连跑两次全量回归时命中过一次：同一台机器一次全绿、一次掉 2 位，单独跑又 9/9）。
        // 与「完全没读到」同等对待：重跑一次；重跑才对的在行尾标出来，免得以后把假红当真相、把真红当抖动。
        let introRetried = false;
        if (!r.pass) { introRetried = true; r = read(); }
        okIntro = r.pass;
        introLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        if (introRetried) introLine += okIntro ? '（重跑一次才满）' : '（重跑仍未满）';
        console.log((okIntro ? '✓' : '✗') + ` 序章重播 ${introLine}`);
      }
      // 好友榜接线：H5 隐藏、注入 sharedCanvas 后能贴到榜单面板
      console.log('== 附加 · 好友榜接线自检 ==');
      let okWxb = true, wxbLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-wxb-' + process.pid),
          '--virtual-time-budget=40000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/wxboard-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const bits = /(?:ALLPASS|HASFAIL|ERR)\|([01]+)/.exec(t);
          return { pass: /ALLPASS\|1+/.test(t), bits: bits ? bits[1] : '' };
        };
        let r = read();
        if (!r.bits) r = read();
        okWxb = r.pass;
        wxbLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okWxb ? '✓' : '✗') + ` 好友榜接线 ${wxbLine}`);
      }
      // 小怪缩略可辨：风格圣经 §3.2 的硬门槛以前只对 8 个有名角色量过，18 只小怪是 Canvas 画的、零度量。
      // 这里按真实图标绘制路径（Renderer.paintIcon）在 32/48/96 三档出图，二值化取近黑本体，
      // 归一化（保长宽比）后两两算 IoU：同族 ≤0.80/0.86、跨族 ≤0.86/0.90。
      console.log('== 附加 · 小怪缩略可辨 ==');
      let okMinion = true, minionLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-minion-' + process.pid),
          '--virtual-time-budget=30000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/minion-check.html`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(t);
          const body = m ? m[1] : '';
          const hitLines = body.split('\n').filter((l) => /^✓|^✗/.test(l.trim()));
          return { pass: /ALL PASS/.test(body), lines: hitLines };
        };
        let r = read();
        if (!r.lines.length) r = read();      // 偶发空 DOM（并发负载下 boot 慢）
        okMinion = r.pass;
        minionLine = r.lines.length ? `${r.lines.filter((l) => l.trim().startsWith('✓')).length}/${r.lines.length} 项` : '读数失败';
        console.log((okMinion ? '✓' : '✗') + ` 小怪 18 只三档可辨 ${minionLine}`
          + (okMinion ? '' : '\n' + r.lines.map((l) => '   ' + l.trim()).join('\n')));
      }
      // 焦点 D · 新玩家可理解性：新内容只靠游戏内信息能否自解释（成就墙入口/折戟行等）
      console.log('== 附加 · 新玩家可理解性自检 ==');
      let okNew = true, newLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-newp-' + process.pid),
          '--virtual-time-budget=120000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/newplayer-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const bits = /(?:ALLPASS|HASFAIL|ERR)\|([01]+)/.exec(t);
          return { pass: /ALLPASS\|1+/.test(t), bits: bits ? bits[1] : '' };
        };
        let r = read();
        if (!r.bits) r = read();
        okNew = r.pass;
        newLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okNew ? '✓' : '✗') + ` 新玩家可理解性 ${newLine}`);
      }
      // 节奏预算守门：首局 60 秒窗口不许再堆元素（PROGRESS《四、体验验收基线》）
      console.log('== 附加 · 首局节奏预算 ==');
      let okPace = true, paceLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-pace-' + process.pid),
          '--virtual-time-budget=150000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/pace-audit.html`,
        ];
        const readPace = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const pick = (tag) => {
            const m = new RegExp('\\[' + tag + '[^\\]]*\\][\\s\\S]*?可交互 (\\d+)').exec(t);
            return m ? Number(m[1]) : -1;
          };
          const mm = /MODALS=(\d+)/.exec(t);
          const hm = /HUDHIDDEN=(\d+)/.exec(t);
          // 首战时间：探针按正常阅读节奏走首局，记录第一场战斗发生在第几秒
          const fm = /\[G 第一次战斗\]\s*([\d.]+)s/.exec(t);
          return { start: pick('A'), vow: pick('B'), floor1: pick('D'), ready: pick('E'),
            modals: mm ? Number(mm[1]) : -1, hud: hm ? Number(hm[1]) : -1, firstFight: fm ? Number(fm[1]) : -1,
            // 全屏元素预算（探针自己算，这里只读结果）：3–10 分钟窗口四层/商店/祭坛/回响/楼钥，
            // 外加 2026-11-15 补的返回玩家首屏 / 结算页 / 图鉴首屏
            bits: (/PACEGATE-ALLPASS\|([01]+)/.exec(t) || [])[1] || '',
            gfail: Array.from(t.matchAll(/PACE-GATE\|([^|<\n]+)\|0/g)).map((m) => m[1]) };
        };
        let r = readPace();
        if (r.vow < 0 || r.floor1 < 0 || r.modals < 0 || r.hud < 0 || !r.bits) r = readPace(); // 偶发空 DOM 重试一次
        // 立誓屏：2026-11-24 用户要求首局就摆出全部可选誓约（4 条可选 + 2 条锁着 = 6 个可点项），
        // 这条预算随之从 1 放到 6——它改的是「开局有没有得选」，不是新增机制。
        // 第 1 层（教练卡态）≤4（含画布）；可操作态 ≤3；
        // 前 3 分钟教学弹窗（教练卡 + 盾谱小传）≤2——超过就是同一机制/同一句话在重复打断
        // 首战 ≤70s：60 秒是「1 个核心动词」预算，探针含 10 秒模拟犹豫，留 10 秒余量
        const ffOk = r.firstFight > 0 && r.firstFight <= 70;
        const gateOk = /^1+$/.test(r.bits || '');
        okPace = r.start >= 0 && r.start <= 1 && r.hud === 1
          && r.vow >= 0 && r.vow <= 6 && r.floor1 >= 0 && r.floor1 <= 4 && r.ready >= 0 && r.ready <= 3
          && r.modals >= 0 && r.modals <= 2 && ffOk && gateOk;
        paceLine = `首屏 ${r.start} / HUD隐藏 ${r.hud} / 立誓 ${r.vow} / 首层 ${r.floor1} / 可操作 ${r.ready} / 教学弹窗 ${r.modals} / 首战 ${r.firstFight < 0 ? '—' : r.firstFight + 's'}`;
        console.log((okPace ? '✓' : '✗') + ' 首局节奏 ' + paceLine + '（预算 1 / 1 / ≤6 / 4 / 3 / ≤2 / ≤70s）');
        const gBits = r.bits || '';
        console.log((gateOk ? '✓' : '✗') + ` 全屏元素预算 ${(gBits.match(/1/g) || []).length}/${gBits.length || 0} 项`
          + (gateOk ? '' : '\n   超预算：' + (r.gfail.length ? r.gfail.join(' / ') : '读数失败（探针没跑到断言行）')));
      }
      // 今日一塔（P-B）：入口带日期 / 「今日」档只收当天 / 结算标出是哪天的塔
      console.log('== 附加 · 今日一塔自检 ==');
      let okDaily = true, dailyLine = '';
      {
        const os = require('os');
        const readShot = (sceneName, budget) => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-daily-' + sceneName + '-' + process.pid),
            '--virtual-time-budget=' + budget,
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=${sceneName}`,
          ];
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        // 「今日之约」：入口那行必须写出今天这条誓约（同一天同一条，跨天换），
        // 结算里的 vow 也必须真的是这一条——只写日期等于把「今天更难」藏起来。
        // 期望值由探针按页面数据自己算一遍（`dailyVow=<id>:<名>`），不拿入口的文案验它自己。
        let outD = readShot('daily', 30000);
        if (outD.indexOf('dailyBtn=') < 0) outD = readShot('daily', 30000);
        const dv = /dailyVow=(\w+):([^\s@<]+)/.exec(outD);
        const dayVowId = dv ? dv[1] : '';
        const dayVowName = dv ? dv[2] : '';
        const btnOk = /dailyBtn=.*今日一塔/.test(outD) && /@block/.test(outD)
          && !!dayVowName && outD.indexOf('· ' + dayVowName) >= 0;
        // 誓约名字不解释规则：那一行必须把这条约的规矩写出来（不立誓时写「今天不立誓」）
        const hm = /dailyHint=(\w+)\|([^\n<]*)/.exec(outD);
        const hintOk = !!hm && hm[1] === 'block' && dayVowName !== ''
          && (hm[2].indexOf(dayVowName) >= 0 || hm[2].indexOf('今天不立誓') >= 0)
          && hm[2].indexOf('零点换下一座') >= 0;
        let outB = readShot('dailyboard', 30000);
        if (outB.indexOf('dailyRows=') < 0) outB = readShot('dailyboard', 30000);
        const bm = /dailyRows=(\d+) empty=(\d)/.exec(outB);
        // 预置了 3 条：今天那条 + 元旦那条 + 无日签的普通局 → 「今日」档只能剩 1 条
        const boardOk = !!bm && Number(bm[1]) === 1;
        let outE = readShot('dailyend', 45000);
        if (outE.indexOf('briefDaily=') < 0) outE = readShot('dailyend', 45000);
        const km = /dailyKey=([^\s]+)/.exec(outE);
        const vm = /vow=(\w+)/.exec(outE);
        const endOk = !!km && km[1].indexOf('NONE') < 0 && /briefDaily=in/.test(outE)
          && !!vm && !!dayVowId && vm[1] === dayVowId;
        okDaily = !!btnOk && hintOk && boardOk && endOk;
        dailyLine = `入口 ${btnOk ? '在' : '缺'}（今日之约 ${dayVowName || '读数失败'}）`
          + ` / 规矩 ${hintOk ? '写明' : '缺'}`
          + ` / 今日档 ${bm ? bm[1] + ' 条' : '读数失败'}`
          + ` / 结算日签 ${endOk ? '在' : '缺'}${vm && dayVowId && vm[1] !== dayVowId ? '（誓约对不上 ' + vm[1] + '）' : ''}`;
        console.log((okDaily ? '✓' : '✗') + ' 今日一塔 ' + dailyLine);
      }
      // 首局立誓页（2026-11-24）：runs=0 也摆全部可选誓约（≥4 张，各有主色），
      // 不再是「只有一张确认卡」——用户要求开局就有多个可区分的选项。
      console.log('== 附加 · 首局立誓页自检 ==');
      let okVowFirst = false, vowFirstLine = '读数失败';
      {
        const os = require('os');
        const readV = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-vowfirst-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=vowfirst`,
          ];
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let outV = readV();
        if (outV.indexOf('VOWFIRST') < 0) outV = readV();
        const fm = /VOWFIRST cards=(\d+) uniqAccent=(\d+) kicker=([^<\n]+)/.exec(outV);
        if (fm) {
          // 首局至少 4 条可选誓约；每条卡有自己的主色（可区分），标题仍是「立誓」
          okVowFirst = Number(fm[1]) >= 4 && Number(fm[2]) >= 4 && fm[3].indexOf('立誓') >= 0;
          vowFirstLine = `${fm[1]} 张卡 / ${fm[2]} 种主色 / 标题 ${fm[3]}`;
        }
        console.log((okVowFirst ? '✓' : '✗') + ' 首局立誓页 ' + vowFirstLine);
      }
      // 过手之环（第 3 章）：顶栏那一格说的进度必须与引擎门槛同源（不然 HUD 会说谎）
      console.log('== 附加 · 过手之环顶栏自检 ==');
      let okZeal = true, zealLine = '';
      let okFinal = true, finalLine = '';
      {
        const os = require('os');
        const readZ = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-zeal-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=zeal`,
          ];
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(p.stdout || '');
          return m ? m[1] : '';
        };
        let outZ = readZ();
        if (outZ.indexOf('zealPip=') < 0) outZ = readZ();
        const pipOk = /zealPip=🎯 12\/20/.test(outZ);
        const nextOk = /"kills":12[^}]*"need":20/.test(outZ) || /"need":20[^}]*"kills":12/.test(outZ);
        // 塔顶的账（同帧第 10 层）：徽记要在，且点开念的白打数必须就是引擎那一份
        const finPipOk = /finalPip=💀 决战/.test(outZ);
        const finW = /"white":(\d+)/.exec(outZ);
        const refW = /"damage":(\d+)/.exec(outZ.slice(outZ.indexOf('wref=')));
        const finDataOk = /"name":"碑魔"/.test(outZ) && !!finW && !!refW && finW[1] === refW[1];
        okFinal = finPipOk && finDataOk;
        finalLine = `徽记 ${finPipOk ? '💀 决战' : '缺'} / 白打 ${finW ? finW[1] : '缺'} vs 引擎 ${refW ? refW[1] : '缺'}`;
        console.log((okFinal ? '✓' : '✗') + ' 塔顶的账 ' + finalLine);
        okZeal = pipOk && nextOk;
        zealLine = `徽记 ${pipOk ? '🎯 12/20' : '不符'} / 下一档 ${nextOk ? '20' : '不符'}`;
        console.log((okZeal ? '✓' : '✗') + ' 过手之环顶栏 ' + zealLine);
      }
      // 缠斗（第 2 章起的第三把打法）：面板上的数字必须与引擎同源
      console.log('== 附加 · 缠斗面板自检 ==');
      let okTangle = true, tangleLine = '';
      {
        const os = require('os');
        const readR = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-tangle-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=tanglebattle`,
          ];
          const q = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(q.stdout || '');
          return m ? m[1] : '';
        };
        let outR = readR();
        if (outR.indexOf('bsTangle=') < 0) outR = readR();
        const shown = outR.indexOf('bsTangle=') >= 0 && outR.indexOf('HIDDEN') < 0 && outR.indexOf('缠斗') >= 0;
        const saved = /"extra":(\d+)/.exec(outR);
        // 2026-11-24：战前卡的缠斗文案是「多掉 N 血换经验 ×2」（差额 + 换到什么，一句说完）
        // 2026-11-25 06:5x 焦点D 前它是「多挨一轮 +N 血」——加号指向**掉的血**、且与卡右边的「−N」反向
        const saveOk = !!saved && outR.indexOf('多掉 ' + saved[1] + ' 血') >= 0;
        const multM = /"mult":(\d+)/.exec(outR);
        const costOk = !!multM && outR.indexOf('经验 ×' + multM[1]) >= 0;
        // 节奏守门（2026-11-15 21:5x）：缠斗在第 5 层，威胁读数在第 6 层——
        // 第 5 层这一战不许一次冒出两块，否则第 4 层拆出来的那块又塞回来了
        const paceOk = /threatAt5=off/.test(outR);
        // 战斗面板元素预算（2026-11-15 21:5x）：第 5 层的实测上界——块 ≤ 8 / 按钮 = 3 / 字 ≤ 120。
        // 这屏此前从没进过任何预算，涨到 9 块 3 按钮 119 字也没人管
        // 2026-11-24：打法按钮搬去战前面板，战斗内按钮数应为 0（不再靠抢点）
        const pb5 = /panelBlocks=(\d+) panelButtons=(\d+) panelChars=(\d+)/.exec(outR);
        const budgetOk = !!pb5 && Number(pb5[1]) <= 7 && Number(pb5[2]) === 0 && Number(pb5[3]) <= 120;
        // 首章那一战（还没学盾谱）：不许出现「架盾/缠斗」——点了没反应的死按钮
        // （.bs-block 的 display:flex 会盖掉 [hidden]，这条守着「首章只有一个按钮」）
        const readFirst = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-first-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=battle`,
          ];
          const q = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(q.stdout || '');
          return m ? m[1] : '';
        };
        const outF = readFirst();
        const fbM = /firstPanel=(\{[^}]*\})/.exec(outF);
        let fb = null;
        try { fb = fbM ? JSON.parse(fbM[1]) : null; } catch (e) { fb = null; }
        const firstOk = !!fb && Array.isArray(fb.picks)
          && ['block', 'guard', 'tangle'].every((k) => fb.picks.indexOf(k) < 0);
        // 第 1 层首战那一屏的预算：块 ≤ 5 / 按钮 0（0 按钮＝还没学盾谱，不该有任何打法）
        const pb1 = /firstPanelBudget=panelBlocks=(\d+) panelButtons=(\d+) panelChars=(\d+)/.exec(outF)
          || /panelBlocks=(\d+) panelButtons=(\d+) panelChars=(\d+)/.exec(outF);
        const firstBudgetOk = !!pb1 && Number(pb1[1]) <= 5 && Number(pb1[2]) === 0;
        okTangle = shown && saveOk && costOk && paceOk && budgetOk && firstOk && firstBudgetOk;
        tangleLine = `面板 ${shown ? '在' : '缺'} / 多挨一轮与引擎同源 ${saveOk ? saved[1] : '不符'} / 收益写明 ${costOk ? '是' : '否'} / 第 5 层不带威胁读数 ${paceOk ? '是' : '否（又塞回来一块）'} / 预算 ${budgetOk ? pb5[1] + '块·' + pb5[2] + '钮·' + pb5[3] + '字' : '超或缺'} / 首章只一格 ${firstOk ? '是' : '否（' + JSON.stringify(fb) + '）'} / 首章预算 ${firstBudgetOk ? pb1[1] + '块·' + pb1[2] + '钮' : '超或缺'}`;
        console.log((okTangle ? '✓' : '✗') + ' 缠斗面板 ' + tangleLine);
      }
      // 架盾（格挡的第二种用法：摊平整层 vs 集中挡一场）：面板数字必须与引擎同源
      console.log('== 附加 · 架盾面板自检 ==');
      let okGuard = true, guardLine = '';
      {
        const os = require('os');
        const readG = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-guard-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=guardbattle`,
          ];
          const q = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(q.stdout || '');
          return m ? m[1] : '';
        };
        const outG = readG();
        const shown = outG.indexOf('bsGuard=') >= 0 && outG.indexOf('HIDDEN') < 0 && outG.indexOf('架盾') >= 0;
        const txtM = /bsGuard=([\s\S]*?) guard=/.exec(outG);
        const txt = txtM ? txtM[1].trim() : '';
        const gDmg = /guard=(\d+)/.exec(outG);
        const gPlain = /plain=(\d+)/.exec(outG);
        const gCnt = /count=(\d+)/.exec(outG);
        const gCan = /can=(true|false)/.exec(outG);
        const n = /此后 (\d+) 场/.exec(txt);
        // 「此后 N 场」＝本层怪数 − 正在打的这只（这一场的账由「这战剩」交代）——
        // 与威胁读数「这一层还剩 N 只」同一个口径，两处并列时不许差 1
        const countOk = !!n && !!gCnt && n[1] === String(Number(gCnt[1]) - 1);
        const pctOk = txt.indexOf('每场 −15%') >= 0;
        // 架盾那一场必须正好是白打的 85%——差一点就是面板在说谎
        const mathOk = !!gDmg && !!gPlain && Number(gDmg[1]) === Math.round(Number(gPlain[1]) * 0.85);
        const canOk = !!gCan && gCan[1] === 'true';
        // 节奏守门（2026-11-15 21:5x）：第 4 层只教架盾——缠斗与威胁读数这时都不许露脸
        const paceG = /tangleAt4=off/.test(outG) && /threatAt4=off/.test(outG);
        // 第 4 层的实测上界（改完的量法）：块 ≤ 7 / 按钮 = 2 / 字 ≤ 100
        const pb4 = /panelBlocks=(\d+) panelButtons=(\d+) panelChars=(\d+)/.exec(outG);
        const budgetG = !!pb4 && Number(pb4[1]) <= 6 && Number(pb4[2]) === 0 && Number(pb4[3]) <= 100;
        okGuard = shown && countOk && pctOk && mathOk && canOk && paceG && budgetG;
        guardLine = `面板 ${shown ? '在' : '缺'} / 余场数与引擎同源 ${countOk ? n[1] : '不符'} / 比例写明 ${pctOk ? '−15%' : '否'} / 承伤=白打×0.85 ${mathOk ? gDmg[1] : '不符'} / 入口条件 ${canOk ? '可架' : '不符'} / 第 4 层只此一块 ${paceG ? '是' : '否'} / 预算 ${budgetG ? pb4[1] + '块·' + pb4[2] + '钮·' + pb4[3] + '字' : '超或缺'}（${txt || '无'}）`;
        console.log((okGuard ? '✓' : '✗') + ' 架盾面板 ' + guardLine);
      }
      // 本层威胁读数（第 6 层起）：还剩 N 只的数字必须与引擎读到的一致
      console.log('== 附加 · 本层威胁读数自检 ==');
      let okThreat = true, threatLine = '';
      {
        const os = require('os');
        const readTh = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-threat-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=threatbattle`,
          ];
          const q = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(q.stdout || '');
          return m ? m[1] : '';
        };
        let outT = readTh();
        if (outT.indexOf('bsThreat=') < 0) outT = readTh();
        const thM = /bsThreat=([\s\S]*?) threat=/.exec(outT);
        const thTxt = thM ? thM[1].trim() : '';
        const thCount = /"count":(\d+)/.exec(outT);
        const thNum = /这一层还剩 (\d+) 只/.exec(thTxt);
        const countOkT = !!thNum && !!thCount && thNum[1] === thCount[1] && /(最贵|打不穿)/.test(thTxt);
        // 第 6 层是三块全在的最满载屏：块 ≤ 9 / 按钮 ≤ 3 / 字 ≤ 140（这是「一屏最多能有多少」的上界）
        const pb6 = /panelBlocks=(\d+) panelButtons=(\d+) panelChars=(\d+)/.exec(outT);
        const budgetT = !!pb6 && Number(pb6[1]) <= 8 && Number(pb6[2]) === 0 && Number(pb6[3]) <= 140;
        // 同屏口径：架盾「此后 N 场」必须等于威胁读数「这一层还剩 N 只」——
        // 两个数差 1 并排摆着，玩家只会读成「面板算错了」（2026-11-15 21:5x 加练修的正是这个）
        const gSame = /bsGuardSame=([\s\S]*?)(?: panelBlocks=|$)/.exec(outT);
        const gSameTxt = gSame ? gSame[1].trim() : '';
        const gSameNum = /此后 (\d+) 场/.exec(gSameTxt);
        const sameOk = !!gSameNum && !!thNum && gSameNum[1] === thNum[1];
        okThreat = countOkT && budgetT && sameOk;
        threatLine = `面板 ${thTxt ? '在' : '缺'} / 还剩几只与引擎同源 ${countOkT ? thNum[1] : '不符'} / 与架盾「此后 N 场」同口径 ${sameOk ? gSameNum[1] : '不符（' + gSameTxt + '）'} / 满载预算 ${budgetT ? pb6[1] + '块·' + pb6[2] + '钮·' + pb6[3] + '字' : '超或缺'}（${thTxt || '无'}）`;
        console.log((okThreat ? '✓' : '✗') + ' 本层威胁读数 ' + threatLine);
      }
      // 横屏留一张目视证据（闸门里只有数字断言，排版错乱还得看眼睛）
      {
        const os = require('os');
        const file = path.join(OUT, 'landscape.png');
        const r = spawnSync(chrome, [
          '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--no-first-run',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-land-' + process.pid),
          '--window-size=844,390', '--virtual-time-budget=9000',
          '--screenshot=' + file,
          `http://127.0.0.1:${PORT}/index.html?dev=1#demo=3,5,5`,
        ], { encoding: 'utf8' });
        const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
        const ok = r.status === 0 && size > 8000;
        if (!ok) bad++;
        console.log((ok ? '✓' : '✗') + ` scene landscape(844x390) ${(size / 1024).toFixed(0)}KB`);
      }
      // 多视口适配：手机横屏 / 小屏 / 极矮横屏下的画布与顶栏数值
      // （2026-11-15 实测：横屏画布撑出容器压住顶栏、390 宽血条数字被裁成「00/10」）
      console.log('== 附加 · 多视口适配自检 ==');
      let okVp = true, vpLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-vp-' + process.pid),
          '--virtual-time-budget=90000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/vp-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(t);
          const fails = (t.match(/^✗ .*$/gm) || []).map((s) => s.replace(/^✗\s*/, ''));
          return { pass: /ALLPASS\|1+/.test(t), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        okVp = r.pass;
        vpLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okVp ? '✓' : '✗') + ` 多视口适配 ${vpLine}` + (okVp ? '' : '\n   ' + r.fails.slice(0, 4).join('\n   ')));
      }

      // 弹层多视口：主界面量过了，弹层这一层没量过——「按钮在不在视野里」才是玩家会卡住的地方
      // （2026-11-15 实测：844×390 榜单关闭按钮 top 406 / 视口 390；结算页「再来一局」在竖屏也要滚过整份账）
      console.log('== 附加 · 弹层多视口自检 ==');
      let okVm = true, vmLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-vm-' + process.pid),
          '--virtual-time-budget=120000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/vp-modal-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(t);
          const fails = (t.match(/^✗ .*$/gm) || []).map((s) => s.replace(/^✗\s*/, ''));
          return { pass: /ALLPASS\|1+/.test(t), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        okVm = r.pass;
        vmLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okVm ? '✓' : '✗') + ` 弹层多视口 ${vmLine}` + (okVm ? '' : '\n   ' + r.fails.slice(0, 5).join('\n   ')));
      }

      // 触控目标尺寸：此前所有闸门量的都是「元素在不在、会不会溢出」，没有一条量「手指点不点得中」。
      // 2026-11-15 首次实测：10 类可点元素里 6 类短边不足 30px（最小的「展开方向键」34×22、
      // 「贴朋友的挑战码」输入框 17px 高）。这里用射线实测命中区（不读 rect：视觉尺寸与可点范围是两件事）。
      console.log('== 附加 · 触控目标尺寸自检 ==');
      let okTap = true, tapLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-tap-' + process.pid),
          '--virtual-time-budget=150000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/tap-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(t);
          const fails = (t.match(/^✗ .*$/gm) || []).map((s) => s.replace(/^✗\s*/, ''));
          return { pass: /ALLPASS\|1+/.test(t), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        okTap = r.pass;
        tapLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okTap ? '✓' : '✗') + ` 触控目标尺寸 ${tapLine}` + (okTap ? '' : '\n   ' + r.fails.slice(0, 6).join('\n   ')));
      }

      // 文字可读性：逐屏枚举所有可见文字节点，算「前景（含 alpha）叠在真实底色（逐层合成 + 渐变取各停靠点）」
      // 的 WCAG 对比度。此前两轮各碰巧撞见一处（.choice-hint 2.7:1 / .bs-hint 2.90:1），从没整屏扫过；
      // 本轮扫出的是同一族病散在多个选择器里：弱文档落到带白薄底的行上只有 2.46:1、5 个 hint 类还写着
      // #555d6d / #4e5666、图鉴「尚未相遇」拿描边色 rgba(255,255,255,.16) 当文字色（1.6:1）、
      // 复制/贴码两颗按钮压根没套上 .si-buy 的外观（落回浏览器默认浅灰底 = 深色面板里两块白砖）。
      let okContrast = true, contrastLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-contrast-' + process.pid),
          '--virtual-time-budget=240000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/contrast-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const num = (k) => {
            const m = new RegExp(k + '=(\\d+)').exec(t);
            return m ? Number(m[1]) : -1;
          };
          const bits = /(?:ALLPASS|DUMP)\|([01]+)/.exec(t);
          const fails = (t.match(/^C\|[^<\n]+$/gm) || []).slice(0, 6).map((s) => s.replace(/^C\|/, ''));
          return { bits: bits ? bits[1] : '', scenes: num('SCENES'), texts: num('TEXTNODES'),
            below: num('BELOW'), ua: num('UADEFAULT'), fails };
        };
        let r = read();
        if (!r.bits || r.scenes < 0) r = read();
        // 三条：①一项都不许低于门槛 ②表单控件不许落回浏览器默认外观 ③探针必须真跑到 40 屏 / 1500+ 文字节点
        // （屏数或节点数掉下来 = 探针静默空跑或有人把屏删掉，那种「全绿」是假绿）。
        // 2026-11-25：屏数 26→40。原来那 26 屏把「玩家真正反复看的那几屏」漏在外面——prep 是每场战斗
        // 必经的决策屏、bossintro 每次章末必看，三种打法战斗 / 日榜 / 终局 / 满 HUD 也都是高频界面。
        // 量过的屏必须等于玩家反复看的屏，否则「可读性合格」只是抽样合格。
        okContrast = /^1+$/.test(r.bits || '') && r.ua === 0 && r.scenes >= 40 && r.texts >= 1500;
        contrastLine = r.scenes < 0 ? '读数失败'
          : `${r.texts} 个文字节点 / ${r.scenes} 屏 · 低于门槛 ${r.below} · 表单默认外观 ${r.ua}`;
        console.log((okContrast ? '✓' : '✗') + ' 文字可读性 ' + contrastLine
          + (okContrast ? '' : (r.fails.length ? '\n   ' + r.fails.join('\n   ') : '')));
      }

      // 动效进场自检：动效此前只在 11-17 被人眼读过一遍，结论只活在日志里；11-24 又进了四样新界面
      // （战前面板 / 面板场景 / 锁芯 / 深色变体怪），没人回头看过。这里量「只有浏览器能答」的那一半：
      // 21 个浮层与已知展开块，被插入视野的那一刻有没有真在跑的 animation。
      // 纯 CSS 的那一半（孤儿关键帧 / reduced-motion 豁免 / 展开块登记）在 code-test 里，不重复实现。
      let okMotion = true, motionLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-motion-' + process.pid),
          '--virtual-time-budget=60000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/motion-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const num = (k) => {
            const m = new RegExp(k + '=(\\d+)').exec(t);
            return m ? Number(m[1]) : -1;
          };
          const bits = /(?:ALLPASS|DUMP)\|([01]+)/.exec(t);
          const fails = (t.match(/^✗[^<\n]+$/gm) || []).slice(0, 6).map((s) => s.replace(/^✗\s*/, ''));
          return { bits: bits ? bits[1] : '', ov: num('OVERLAY'), blk: num('BLOCK'),
            ovMiss: num('OVMISS'), blkMiss: num('BLOCKMISS'), fails };
        };
        let r = read();
        if (!r.bits || r.ov < 0) r = read();
        // 三条：①一位都不许是 0 ②浮层 / 展开块的**条数下限**跟着内容走
        // （21 个浮层、4 个展开块——少了就是有人删了，或探针静默空跑）
        okMotion = /^1+$/.test(r.bits || '') && r.ov >= 21 && r.blk >= 4;
        motionLine = r.ov < 0 ? '读数失败'
          : `${r.ov} 浮层 / ${r.blk} 展开块 · 硬切 浮层 ${r.ovMiss} · 展开块 ${r.blkMiss}`;
        console.log((okMotion ? '✓' : '✗') + ' 动效进场 ' + motionLine
          + (okMotion ? '' : (r.fails.length ? '\n   ' + r.fails.join('\n   ') : '')));
      }

      // 音效自检：源码里出现的每个音效名都必须在预置表内（写错就是一个永久静音），
      // 外加「每个预置真发声 / 关掉开关真不响 / 三条关键路径点的名字对不对」
      let okSfx = true, sfxLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-sfx-' + process.pid),
          '--virtual-time-budget=30000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/sfx-check.html?gate=1`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          // 只认 <title> 里的读数：dump 的正文里也含脚本源码（'PASS|' / 'FAIL|' 字面量），
          // 整篇扫会把「页内脚本」误当成失败标记——第一版就是这么把自己判红的
          const tt = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || '';
          const bits = /(?:PASS|FAIL)\|([01]+)/.exec(tt);
          const fails = (t.match(/^✗ .*$/gm) || []).map((s) => s.replace(/^✗\s*/, ''));
          return { pass: /^PASS\|1+$/.test(tt.trim()), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        okSfx = r.pass;
        sfxLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okSfx ? '✓' : '✗') + ` 音效自检 ${sfxLine}` + (okSfx ? '' : '\n   ' + r.fails.slice(0, 5).join('\n   ')));
      }

      // 减弱动效（prefers-reduced-motion）：跑两遍——默认模式循环动效必须在，减弱模式必须停，
      // 且两遍都不许误伤一次性进场（popIn/fadeIn）。第二遍必须 REDUCE=1，旗标没生效就是假绿。
      let okRm = true, rmLine = '';
      {
        const os = require('os');
        const one = (extra, tag) => {
          const p = spawnSync(chrome, [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-rm-' + tag + '-' + process.pid),
            '--virtual-time-budget=20000', ...extra,
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/rm-check.html`,
          ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const tt = (/<title>([^<]*)<\/title>/.exec(p.stdout || '') || [])[1] || '';
          const m = /(ALLPASS|HASFAIL)\|([01]+)\|R([01])/.exec(tt.trim());
          return { ok: tt.trim().indexOf('ALLPASS') === 0, bits: m ? m[2] : '', reduce: m ? m[3] : '' };
        };
        const a = one([], 'default');
        const b = one(['--force-prefers-reduced-motion'], 'reduce');
        const cnt = (x) => (x ? (x.match(/1/g) || []).length + '/' + x.length : '—');
        okRm = a.ok && b.ok && a.reduce === '0' && b.reduce === '1';
        rmLine = `默认 ${cnt(a.bits)} · 减弱 ${cnt(b.bits)}` + (b.reduce === '1' ? '' : '（旗标未生效）');
        console.log((okRm ? '✓' : '✗') + ` 减弱动效 ${rmLine}`);
      }

      // 错误通道：三类未捕获异常（脚本 / 未处理拒绝 / 资源）必须留痕，且不接管输入。
      // 这一面此前一条都不记——玩家侧完全静默（2026-11-15 实测：注入三个异常，漏斗仍是空的）。
      let okErr = true, errLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-err-' + process.pid),
          '--virtual-time-budget=20000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/err-check.html`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          // 只认 <title>：dump 正文含页内脚本源码（'FAIL|' 字面量），整篇扫会自己判红
          const tt = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(tt);
          const fails = (t.match(/^FAIL\|.*$/gm) || []).map((s) => s.replace(/^FAIL\|\s*/, ''));
          return { pass: /^ALLPASS\|1+$/.test(tt.trim()), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        // 源码契约放在 Node 侧（探针页取 /js/main.js 在 headless 下偶发 NetworkError）：
        // 整帧在 try 里 / 续命在 finally / loop 段里只有一个 try（不再单独护 draw）
        const msrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
        const tryFirst = /function loop\(\)\s*\{\s*try\s*\{/.test(msrc);
        const finallyRaf = /finally\s*\{[\s\S]{0,160}?requestAnimationFrame\(loop\)/.test(msrc);
        const loopHead = (msrc.match(/function loop\(\)[\s\S]*?finally\s*\{/) || [''])[0];
        const tryCount = (loopHead.match(/\btry\s*\{/g) || []).length;
        const okSrc = tryFirst && finallyRaf && tryCount === 1;
        if (!okSrc) r.pass = false;
        r.bits = (r.bits || '') + (tryFirst ? 1 : 0) + (finallyRaf ? 1 : 0) + (tryCount === 1 ? 1 : 0);
        if (!tryFirst) r.fails.push('E9a loop 开头不是 try');
        if (!finallyRaf) r.fails.push('E9b 续命不在 finally（异常会冻结画面）');
        if (tryCount !== 1) r.fails.push('E9c loop 段里 try 数=' + tryCount + '（又单独护 draw 了）');
        okErr = r.pass;
        errLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okErr ? '✓' : '✗') + ` 错误通道 ${errLine}` + (okErr ? '' : '\n   ' + r.fails.slice(0, 6).join('\n   ')));
      }

      // 存档写失败：配额满 / 设备禁用存储 / 无痕模式下，写失败必须可查、可见、进漏斗，且不打断游戏。
      // 这一面此前被 `catch (e) {}` 整条吞掉（2026-11-15 实测）：玩家刷新后进度退回上一次成功保存处，零提示。
      let okSto = true, stoLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-sto-' + process.pid),
          '--virtual-time-budget=20000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/storage-check.html`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          // 只认 <title>：dump 正文含页内脚本源码（'FAIL|' 字面量），整篇扫会自己判红
          const tt = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(tt);
          const fails = (t.match(/^FAIL\|[^\n<]*/gm) || []).map((x) => x.replace(/^FAIL\|\s*/, ''));
          return { pass: /ALLPASS\|1+$/.test(tt.trim()), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        // 源码契约（放 Node 侧：探针页在 headless 下取 /js/* 偶发 NetworkError）
        const msrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
        const esrc = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
        const okHook = /Engine\.setStorageFailHook\(\(name, first\)/.test(msrc);
        const okNoStore = /noStoreHint/.test(msrc) && /towermates_probe/.test(msrc);
        // persist 现在带一个 force 参数（并发面加的），这里只认「函数体里有 return false 的失败分支」
        const okPersist = /function persist\([^)]*\)[\s\S]{0,900}?return false;/.test(esrc);
        if (!okHook) r.fails.push('ST 引擎回调没接（写失败没人知道）');
        if (!okNoStore) r.fails.push('ST 首页没有「存不了」那行（整块不可用时零提示）');
        if (!okPersist) r.fails.push('ST persist() 没有失败分支（又退回静默吞错）');
        if (!okHook || !okNoStore || !okPersist) r.pass = false;
        r.bits = (r.bits || '') + (okHook ? 1 : 0) + (okNoStore ? 1 : 0) + (okPersist ? 1 : 0);
        okSto = r.pass;
        stoLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okSto ? '✓' : '✗') + ` 存档写失败 ${stoLine}` + (okSto ? '' : '\n   ' + r.fails.slice(0, 6).join('\n   ')));
      }

      // 时间面：局内用时＝活跃时间（不是墙钟差）+ 跨零点刷新。
      // 此前「结束时刻 − 开局时刻」把切后台接电话那十分钟也算进这一局，而榜单同层按用时排；
      // 开始页「今日一塔 · M月D日」也会一直写着昨天（点下去进的是新一天的塔）。
      let okTime = true, timeLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-time-' + process.pid),
          '--virtual-time-budget=20000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/time-check.html`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const tt = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(tt);
          const fails = (t.match(/^FAIL\|[^\n<]*/gm) || []).map((x) => x.replace(/^FAIL\|\s*/, ''));
          return { pass: /ALLPASS\|1+$/.test(tt.trim()), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        // 源码契约（放 Node 侧）：无头 --dump-dom 下 rAF 一帧都不跑，探针里量不到主循环，
        // 「真循环每帧喂 delta」只能在这里守——删掉接线就红，而不是悄悄退回墙钟差。
        const msrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
        const esrc = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
        const loopHead = (msrc.match(/function loop\(\)[\s\S]*?\n    \}/) || [''])[0];
        const okAccrue = /Engine\.accrueActive\(now - frameAt\)/.test(loopHead);
        const okDayCheck = /checkDayRollover\(\)/.test(loopHead);
        const okSum = /activeMs/.test((esrc.match(/function summary\(\)[\s\S]*?\n  \}/) || [''])[0]);
        const okCap = /ACTIVE_CAP\s*=\s*250/.test(esrc) && /Math\.min\(Math\.max\(0, ms\), ACTIVE_CAP\)/.test(esrc);
        if (!okAccrue) r.fails.push('TM loop 没在喂活跃时间（用时又退回墙钟差）');
        if (!okDayCheck) r.fails.push('TM loop 没有跨零点检查（开始页会一直写昨天）');
        if (!okSum) r.fails.push('TM summary 没读 activeMs');
        if (!okCap) r.fails.push('TM 活跃时间没有单帧封顶（后台回来那一大段会记账）');
        if (!okAccrue || !okDayCheck || !okSum || !okCap) r.pass = false;
        r.bits = (r.bits || '') + (okAccrue ? 1 : 0) + (okDayCheck ? 1 : 0) + (okSum ? 1 : 0) + (okCap ? 1 : 0);
        okTime = r.pass;
        timeLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okTime ? '✓' : '✗') + ` 时间面 ${timeLine}` + (okTime ? '' : '\n   ' + r.fails.slice(0, 6).join('\n   ')));
      }

      // 并发面：同一浏览器开两页时，一份档只认一个写者。
      // 实测（2026-11-15）：A 页停在半小时前、B 页在另一页玩到第 5 层，A 走一步就把 B 的半小时静默抹掉。
      let okTab = true, tabLine = '';
      {
        const os = require('os');
        const args = [
          '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
          '--user-data-dir=' + path.join(os.tmpdir(), 'tm-tab-' + process.pid),
          '--virtual-time-budget=20000',
          '--dump-dom', `http://127.0.0.1:${PORT}/tools/tab-check.html`,
        ];
        const read = () => {
          const p = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const t = p.stdout || '';
          const tt = (/<title>([^<]*)<\/title>/.exec(t) || [])[1] || '';
          const bits = /(?:ALLPASS|HASFAIL)\|([01]+)/.exec(tt);
          const fails = (t.match(/^FAIL\|[^\n<]*/gm) || []).map((x) => x.replace(/^FAIL\|\s*/, ''));
          return { pass: /ALLPASS\|1+$/.test(tt.trim()), bits: bits ? bits[1] : '', fails: fails };
        };
        let r = read();
        if (!r.bits) r = read();
        // 源码契约：谁把写前校验删了、谁把 storage 事件断开，都在这里红（探针只测行为，测不到接线）
        const msrc = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
        const esrc = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');
        const okGuard = /if \(w && w !== s\.w\) \{ markConflict\(w\); return false; \}/.test(esrc);
        const okEvt = /addEventListener\('storage'/.test(msrc) && /Engine\.noteStorageWrite\(/.test(msrc);
        const okClaim = /Engine\.claim\(\)/.test(msrc) && /foreignOwnerFresh\(60000\)/.test(msrc);
        if (!okGuard) r.fails.push('TB 存档写前没有写者校验（又退回「谁后写谁说话」）');
        if (!okEvt) r.fails.push('TB 没接 storage 事件（另一页写了也不立刻停手）');
        if (!okClaim) r.fails.push('TB 继续游戏不认写者（会一进来就把那边顶掉）');
        if (!okGuard || !okEvt || !okClaim) r.pass = false;
        r.bits = (r.bits || '') + (okGuard ? 1 : 0) + (okEvt ? 1 : 0) + (okClaim ? 1 : 0);
        okTab = r.pass;
        tabLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
        console.log((okTab ? '✓' : '✗') + ` 并发面 ${tabLine}` + (okTab ? '' : '\n   ' + r.fails.slice(0, 6).join('\n   ')));
      }

      server.kill();      console.log(bad === 0 ? `\n✓ 截图全部生成（${SCENES.length} 张，见 tools/out/）` : `\n✗ ${bad} 张截图异常`);

      console.log('== 浏览器 UI 自检 ==');
      const ui = run(process.execPath, ['tools/ui-test.js']);
      const okUi = ui.code === 0;
      console.log((okUi ? '✓' : '✗') + ' ui-test.js' + (okUi ? '' : '\n' + ui.out));
      const all = okFuzz && okCheck && okSim && okSkip && okTest && okCode && okBsim && okOd && okUi && okProbe && okAds && okIntro && okWxb && okNew && okWx && okSwordGate && okPace && okDaily && okVowFirst && okZeal && okFinal && okTangle && okGuard && okThreat && okVp && okVm && okTap && okContrast && okMotion && okSfx && okRm && okErr && okSto && okTime && okTab && bad === 0;
      if (!all) console.log('  闸门明细:', JSON.stringify({ okCheck, okSim, okSkip, okTest, okCode, okBsim, okOd, okUi, okProbe, probeA3, okAds, adsLine, okIntro, introLine, okWxb, wxbLine, okNew, newLine, okWx, okSwordGate, okPace, paceLine, okDaily, dailyLine, okVowFirst, vowFirstLine, okZeal, zealLine, okFinal, finalLine, okTangle, tangleLine, okGuard, guardLine, okThreat, threatLine, okVp, vpLine, okVm, vmLine, okTap, tapLine, okContrast, contrastLine, okMotion, motionLine, okSfx, sfxLine, okRm, rmLine, okErr, errLine, okSto, stoLine, okTime, timeLine, okTab, tabLine, okFuzz, fzMax, bad }));
      console.log(all ? '✓ 质量闸门通过' : '✗ 质量闸门有失败项');
      process.exit(all ? 0 : 1);
    })();
    return;
  }
}
const okNoShot = okFuzz && okCheck && okSim && okTest && okCode && okBsim && okOd && okWx;
console.log(okNoShot ? "\n✓ 质量闸门通过" : "\n✗ 有失败项");
process.exit(okNoShot ? 0 : 1);
