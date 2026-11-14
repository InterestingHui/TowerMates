// 一条命令跑完全部质量闸门：数据校验 → 平衡模拟 → 单测 → 无头截图
// 用法：node tools/regress.js [--no-shot]
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

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
const SCENES = ['start', 'play', 'bossintro', 'codexzoom', 'critters', 'dialog', 'hint', 'stuck', 'battle', 'battleblock', 'bossphase', 'bossyan', 'bossdef', 'probecard', 'altar', 'choice', 'end', 'board', 'codex', 'cfg', 'hud', 'tower', 'core', 'heart', 'stoneidle', 'vow', 'event', 'eventdeep', 'gate', 'echo', 'goal', 'flow', 'showcase', 'death', 'death1', 'collection', 'adsdeath', 'adsend', 'sword', 'daily', 'dailyboard', 'dailyend', 'floor2', 'floor3', 'shop', 'echo2', 'battletwice', 'zeal', 'rushbattle'];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('== 1/6 地图与数据校验 ==');
const check = run(process.execPath, ['tools/check.js']);
const okCheck = check.code === 0;
console.log((okCheck ? '✓' : '✗') + ' check.js' + (okCheck ? '' : '\n' + check.out));

console.log('== 2/6 平衡模拟 ==');
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

console.log('== 3/6 引擎单测 ==');
const test = run(process.execPath, ['tools/engine-test.js']);
const passed = (test.out.match(/^✓/gm) || []).length;
const okTest = test.code === 0;
console.log((okTest ? '✓' : '✗') + ` engine-test.js ${passed} 项`);

console.log('== 4/6 挑战码与触控单测 ==');
const code = run(process.execPath, ['tools/code-test.js']);
const codePassed = (code.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okCode = code.code === 0;
console.log((okCode ? '✓' : '✗') + ` code-test.js ${codePassed} 项` + (okCode ? '' : '\n' + code.out));

console.log('== 5/6 战斗演出分摊单测 ==');
const bsim = run(process.execPath, ['tools/battle-sim-test.js']);
const bsimPassed = (bsim.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okBsim = bsim.code === 0;
console.log((okBsim ? '✓' : '✗') + ` battle-sim-test.js ${bsimPassed} 项` + (okBsim ? '' : '\n' + bsim.out));

console.log('== 6/6 开放数据域榜单单测 ==');
const od = run(process.execPath, ['tools/opendata-test.js']);
const odPassed = (od.out.match(/(\d+) 项通过/) || [])[1] || 0;
const okOd = od.code === 0;
console.log((okOd ? '✓' : '✗') + ` opendata-test.js ${odPassed} 项` + (okOd ? '' : '\n' + od.out));

let okShots = true;

// 微信工程静态校验：清单能被开发者工具接受、页面文件齐、壳里不许藏游戏源码副本
console.log('== 附加 · 微信工程静态校验 ==');
const wx = run(process.execPath, ['tools/wechat-check.js']);
const okWx = wx.code === 0;
console.log((okWx ? '✓' : '✗') + ' wechat-check.js' + (okWx ? '' : '\n' + wx.out));
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
        if (!r.bits) r = read();
        okIntro = r.pass;
        introLine = r.bits ? `${(r.bits.match(/1/g) || []).length}/${r.bits.length} 项` : '读数失败';
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
            modals: mm ? Number(mm[1]) : -1, hud: hm ? Number(hm[1]) : -1, firstFight: fm ? Number(fm[1]) : -1 };
        };
        let r = readPace();
        if (r.vow < 0 || r.floor1 < 0 || r.modals < 0 || r.hud < 0) r = readPace(); // 偶发空 DOM 重试一次
        // 立誓屏首局只留 1 张确认卡；第 1 层（教练卡态）≤4（含画布）；可操作态 ≤3；
        // 前 3 分钟教学弹窗（教练卡 + 盾谱小传）≤2——超过就是同一机制/同一句话在重复打断
        // 首战 ≤70s：60 秒是「1 个核心动词」预算，探针含 10 秒模拟犹豫，留 10 秒余量
        const ffOk = r.firstFight > 0 && r.firstFight <= 70;
        okPace = r.start >= 0 && r.start <= 1 && r.hud === 1
          && r.vow >= 0 && r.vow <= 1 && r.floor1 >= 0 && r.floor1 <= 4 && r.ready >= 0 && r.ready <= 3
          && r.modals >= 0 && r.modals <= 2 && ffOk;
        paceLine = `首屏 ${r.start} / HUD隐藏 ${r.hud} / 立誓 ${r.vow} / 首层 ${r.floor1} / 可操作 ${r.ready} / 教学弹窗 ${r.modals} / 首战 ${r.firstFight < 0 ? '—' : r.firstFight + 's'}`;
        console.log((okPace ? '✓' : '✗') + ' 首局节奏 ' + paceLine + '（预算 1 / 1 / 4 / 3 / ≤2 / ≤70s）');
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
        let outD = readShot('daily', 30000);
        if (outD.indexOf('dailyBtn=') < 0) outD = readShot('daily', 30000);
        const btnOk = /dailyBtn=.*今日一塔/.test(outD) && /@block/.test(outD);
        let outB = readShot('dailyboard', 30000);
        if (outB.indexOf('dailyRows=') < 0) outB = readShot('dailyboard', 30000);
        const bm = /dailyRows=(\d+) empty=(\d)/.exec(outB);
        // 预置了 3 条：今天那条 + 元旦那条 + 无日签的普通局 → 「今日」档只能剩 1 条
        const boardOk = !!bm && Number(bm[1]) === 1;
        let outE = readShot('dailyend', 45000);
        if (outE.indexOf('briefDaily=') < 0) outE = readShot('dailyend', 45000);
        const km = /dailyKey=([^\s]+)/.exec(outE);
        const endOk = !!km && km[1].indexOf('NONE') < 0 && /briefDaily=in/.test(outE);
        okDaily = !!btnOk && boardOk && endOk;
        dailyLine = `入口 ${btnOk ? '在' : '缺'} / 今日档 ${bm ? bm[1] + ' 条' : '读数失败'} / 结算日签 ${endOk ? '在' : '缺'}`;
        console.log((okDaily ? '✓' : '✗') + ' 今日一塔 ' + dailyLine);
      }
      // 过手之环（第 3 章）：顶栏那一格说的进度必须与引擎门槛同源（不然 HUD 会说谎）
      console.log('== 附加 · 过手之环顶栏自检 ==');
      let okZeal = true, zealLine = '';
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
        okZeal = pipOk && nextOk;
        zealLine = `徽记 ${pipOk ? '🎯 12/20' : '不符'} / 下一档 ${nextOk ? '20' : '不符'}`;
        console.log((okZeal ? '✓' : '✗') + ' 过手之环顶栏 ' + zealLine);
      }
      // 抢攻（第 2 章起的第二个战斗内决策）：面板上的数字必须与引擎同源
      console.log('== 附加 · 抢攻面板自检 ==');
      let okRush = true, rushLine = '';
      {
        const os = require('os');
        const readR = () => {
          const args = [
            '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--disable-extensions',
            '--user-data-dir=' + path.join(os.tmpdir(), 'tm-rush-' + process.pid),
            '--virtual-time-budget=30000',
            '--dump-dom', `http://127.0.0.1:${PORT}/tools/shot.html?scene=rushbattle`,
          ];
          const q = spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
          const m = /<pre id="err">([\s\S]*?)<\/pre>/.exec(q.stdout || '');
          return m ? m[1] : '';
        };
        let outR = readR();
        if (outR.indexOf('bsRush=') < 0) outR = readR();
        const shown = outR.indexOf('bsRush=') >= 0 && outR.indexOf('HIDDEN') < 0 && outR.indexOf('抢攻') >= 0;
        const saved = /"save":(\d+)/.exec(outR);
        const saveOk = !!saved && outR.indexOf('承伤 −' + saved[1]) >= 0;
        const costOk = outR.indexOf('这战没经验') >= 0;
        // 本层威胁读数（同一次面板）：还剩 N 只的数字必须与引擎读到的一致
        const thM = /bsThreat=([\s\S]*?) threat=/.exec(outR);
        const thTxt = thM ? thM[1].trim() : '';
        const thCount = /"count":(\d+)/.exec(outR);
        const thNum = /这一层还剩 (\d+) 只/.exec(thTxt);
        const thOk = !!thNum && !!thCount && thNum[1] === thCount[1] && /(最贵|打不穿)/.test(thTxt);
        okRush = shown && saveOk && costOk && thOk;
        rushLine = `面板 ${shown ? '在' : '缺'} / 承伤与引擎同源 ${saveOk ? saved[1] : '不符'} / 代价写明 ${costOk ? '是' : '否'} / 威胁行 ${thOk ? '对得上' : '缺或对不上'}（${thTxt || '无'}）`;
        console.log((okRush ? '✓' : '✗') + ' 抢攻面板 ' + rushLine);
      }
      server.kill();      console.log(bad === 0 ? `\n✓ 截图全部生成（${SCENES.length} 张，见 tools/out/）` : `\n✗ ${bad} 张截图异常`);

      console.log('== 浏览器 UI 自检 ==');
      const ui = run(process.execPath, ['tools/ui-test.js']);
      const okUi = ui.code === 0;
      console.log((okUi ? '✓' : '✗') + ' ui-test.js' + (okUi ? '' : '\n' + ui.out));
      const all = okCheck && okSim && okSkip && okTest && okCode && okBsim && okOd && okUi && okProbe && okAds && okIntro && okWxb && okNew && okWx && okSwordGate && okPace && okDaily && okZeal && okRush && bad === 0;
      if (!all) console.log('  闸门明细:', JSON.stringify({ okCheck, okSim, okSkip, okTest, okCode, okBsim, okOd, okUi, okProbe, probeA3, okAds, adsLine, okIntro, introLine, okWxb, wxbLine, okNew, newLine, okWx, okSwordGate, okPace, paceLine, okDaily, dailyLine, okZeal, zealLine, okRush, rushLine, bad }));
      console.log(all ? '✓ 质量闸门通过' : '✗ 质量闸门有失败项');
      process.exit(all ? 0 : 1);
    })();
    return;
  }
}
const okNoShot = okCheck && okSim && okTest && okCode && okBsim && okOd && okWx;
console.log(okNoShot ? "\n✓ 质量闸门通过" : "\n✗ 有失败项");
process.exit(okNoShot ? 0 : 1);
