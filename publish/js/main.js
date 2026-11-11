// TowerMates · 交互与 UI（v0.4）
// 职责：输入 / 对白（立绘·跳过·回看）/ 战斗演出 / 商店 / 图鉴 / 榜单 / 设置 / 引导 / HUD
// 规则一律走 Engine，表现一律走 Renderer；本文件只做编排。
(function () {
  const D = window.GAME_DATA;
  const S = window.STORY;
  const $ = (id) => document.getElementById(id);

  let shopOpen = false;
  let endShown = false;
  let typing = null;
  let warnTimer = null;
  let battleBusy = false;
  let guideTimer = null;
  let hintPump = null;
  let hintAuto = null;
  let hintSeq = 0;
  const HINT_AUTO_MS = 7000; // 角色提示悬挂时长：够读完，也像成就吐司一样自己收起
  const hintQueue = [];
  let choiceFocus = null;
  let heartFocus = null;

  // ---------- 设置 ----------
  const Settings = (() => {
    let data = { fx: 'full', sfx: true, music: true, vib: true, fast: false, critters: true };
    try {
      const old = JSON.parse(localStorage.getItem('towermates_cfg') || 'null');
      const cur = JSON.parse(localStorage.getItem('towermates_cfg_v2') || 'null');
      if (cur) data = Object.assign(data, cur);
      else if (old) data = { fx: old.reduceFx ? 'low' : 'full', sfx: !old.mute, music: !old.mute, vib: true };
    } catch (e) {}
    const save = () => {
      try { localStorage.setItem('towermates_cfg_v2', JSON.stringify(data)); } catch (e) {}
      window.__tmCfg = data; // 渲染层读开关用（critters）
    };
    save();
    return {
      get fx() { return data.fx; },
      get sfx() { return data.sfx; },
      get music() { return data.music; },
      get vib() { return data.vib; },
      get fast() { return !!data.fast; },
      get critters() { return data.critters !== false; },
      cycleFx() { data.fx = data.fx === 'full' ? 'low' : 'full'; save(); return data.fx; },
      toggleFast() { data.fast = !data.fast; save(); return data.fast; },
      toggleSfx() { data.sfx = !data.sfx; save(); return data.sfx; },
      toggleMusic() { data.music = !data.music; save(); return data.music; },
      toggleVib() { data.vib = !data.vib; save(); return data.vib; },
      toggleCritters() { data.critters = data.critters === false; save(); return data.critters !== false; },
    };
  })();
  const REDUCED = () => Settings.fx === 'low';

  // ---------- 引导：关键提示改由角色对白播放 ----------
  const Tips = (() => {
    // v2：提示换成角色台词后重新发一遍，老玩家也能读到加粗过的重点
    const KEY = 'towermates_tips_v2';
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {} };
    return {
      show(key) {
        if (seen[key]) return;
        const lines = (S.hints && S.hints[key]) ||
          (S.tips && S.tips[key] ? [['烛', S.tips[key], 'calm']] : null);
        if (!lines) return;
        seen[key] = 1;
        save();
        say(lines);
      },
      // 战斗中不能弹全屏对白：改用底部常驻提示条，读完 6.5s 或下一条顶替
      banner(key) {
        const lines = (S.hints && S.hints[key]) ||
          (S.tips && S.tips[key] ? [['烛', S.tips[key], 'calm']] : null);
        if (!lines) return;
        const g = $('guide');
        renderRich($('guideText'), Array.isArray(lines[0]) ? lines[0][1] : lines[0]);
        g.classList.add('show');
        clearTimeout(guideTimer);
        guideTimer = setTimeout(() => g.classList.remove('show'), 6500);
      },
      mark(key) { if (seen[key]) return false; seen[key] = 1; save(); return true; },
      seen(key) { return !!seen[key]; },
      reset() { seen = {}; try { localStorage.removeItem(KEY); } catch (e) {} },
    };
  })();

  // ---------- 音效 ----------
  // 塔的记忆：跨局保存的「余烬」，只用来解锁誓约，不卖战力
  // memory 记跨局履历（结局数/誓约通关/塔规满章/塔心取舍），结局页用它生成「下一局目标」
  const Meta = (() => {
    const KEY = 'towermates_meta';
    let data = { ember: 0, unlocked: [], resets: 0, memory: { runs: 0, endings: {}, vowWins: {}, fullChapters: 0, heartTaken: 0, heartLeft: 0, deepest: 0, fastest: 0, bestSeal: '' } };
    try { data = Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
    if (!data.memory) data.memory = { runs: 0, endings: {}, vowWins: {}, fullChapters: 0, heartTaken: 0, heartLeft: 0, deepest: 0, fastest: 0, bestSeal: '' };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
    const mem = data.memory;
    return {
      get ember() { return data.ember || 0; },
      get resets() { return data.resets || 0; },
      get memory() { return mem; },
      has(id) { return (data.unlocked || []).indexOf(id) >= 0; },
      add(n) { data.ember = Math.max(0, (data.ember || 0) + n); save(); },
      incReset() { data.resets = (data.resets || 0) + 1; save(); return data.resets; },
      // 结算一次跨局履历：记走了多远、用了多久、刻下哪枚塔印
      recordRun(rec) {
        mem.runs = (mem.runs || 0) + 1;
        mem.endings = mem.endings || {};
        mem.endings[rec.ending] = (mem.endings[rec.ending] || 0) + 1;
        mem.vowWins = mem.vowWins || {};
        if (rec.won) mem.vowWins[rec.vow] = (mem.vowWins[rec.vow] || 0) + 1;
        mem.fullChapters = Math.max(mem.fullChapters || 0, rec.fullChapters || 0);
        if (rec.heart === 'taken') mem.heartTaken = (mem.heartTaken || 0) + 1;
        if (rec.heart === 'left') mem.heartLeft = (mem.heartLeft || 0) + 1;
        mem.deepest = Math.max(mem.deepest || 0, rec.floor || 0);
        if (rec.time > 0) mem.fastest = mem.fastest ? Math.min(mem.fastest, rec.time) : rec.time;
        const rank = ['', 'rough', 'name', 'ward', 'clear'];
        if (rank.indexOf(rec.seal) > rank.indexOf(mem.bestSeal || '')) mem.bestSeal = rec.seal;
        save();
      },
      buy(id, cost) {
        if (this.has(id)) return 'owned';
        if ((data.ember || 0) < cost) return 'poor';
        data.ember -= cost;
        data.unlocked = (data.unlocked || []).concat(id);
        save();
        return 'ok';
      },
    };
  })();

  const Sound = (() => {
    let actx = null;
    let music = null;
    function ctxOnly() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') { try { actx.resume(); } catch (e) {} }
      return actx;
    }
    // 音效与音乐各有开关，任何一边开着都需要一个 AudioContext
    function ensure() {
      if (!Settings.sfx && !Settings.music) return null;
      return ctxOnly();
    }
    function beep(freq, dur, type, gain, slide, delay) {
      if (!Settings.sfx) return;
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.035, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    }
    function startMusic() {
      stopMusic();
      if (!Settings.music) return;
      const c = ensure();
      if (!c) return;
      music = { oscs: [] };
      [55, 55.7, 82.5].forEach((f, i) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.value = i === 2 ? 0.006 : 0.011;
        o.connect(g).connect(c.destination);
        o.start();
        music.oscs.push(o);
      });
    }
    function stopMusic() {
      if (music) {
        music.oscs.forEach((o) => { try { o.stop(); } catch (e) {} });
        music = null;
      }
    }
    let pad = null;
    function stopPad() {
      if (!pad) return;
      const cur = pad;
      pad = null;
      try {
        cur.g.gain.cancelScheduledValues(actx.currentTime);
        cur.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.35);
        setTimeout(() => cur.o.forEach((x) => { try { x.stop(); } catch (e) {} }), 1400);
      } catch (e) {}
    }
    // 深层垫音：越往上基频越低，锁梁最沉
    const PAD = [0, 0, 0, 55, 49, 43.65, 41.2, 38.9, 36.7, 34.65, 32.7, 30.87, 29.14];
    function setPad(floor) {
      const f = PAD[floor] || 0;
      if (!Settings.music || !f) { stopPad(); return; }
      if (pad && pad.freq === f) return;
      stopPad();
      const c = ensure();
      if (!c) return;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.014, c.currentTime + 2.6);
      g.connect(c.destination);
      const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.5;
      const g2 = c.createGain(); g2.gain.value = 0.3;
      o1.connect(g);
      o2.connect(g2).connect(g);
      o1.start(); o2.start();
      pad = { freq: f, o: [o1, o2], g };
    }

    // ---------- 每层的旋律动机 ----------
    // 只用几个音：越往上越少、越慢；集市是大调，密道是弗里几亚，塔顶只留纯五度
    const MOTIFS = {
      0: { root: 220, gap: 4600, steps: [[0, 0.7], [3, 0.55], [7, 1.0], [5, 0.6]] },
      1: { root: 220, gap: 5000, steps: [[0, 0.8], [5, 0.6], [3, 0.9], [10, 1.1]] },
      2: { root: 261.63, gap: 4200, steps: [[0, 0.5], [4, 0.5], [7, 0.8], [9, 0.6], [7, 0.9]] },
      3: { root: 207.65, gap: 5600, steps: [[0, 1.0], [1, 0.7], [6, 1.2], [5, 0.9]] },
      4: { root: 196, gap: 5800, steps: [[0, 0.9], [3, 0.6], [10, 1.0], [7, 1.3]] },
      5: { root: 174.61, gap: 6800, steps: [[0, 1.4], [7, 1.8], [3, 1.2], [12, 2.2]] },
      6: { root: 146.83, gap: 5200, steps: [[0, 1.1], [6, 0.9], [1, 1.4], [0, 1.8]] },
      // 锁梁：动机更短、间隔更长，像有人在很远的地方数数
      7: { root: 164.81, gap: 6200, steps: [[0, 1.2], [5, 0.8], [10, 1.4], [3, 1.0]] },
      8: { root: 196, gap: 5000, steps: [[0, 0.7], [3, 0.6], [7, 0.9], [12, 0.5]] },
      9: { root: 146.83, gap: 7200, steps: [[0, 1.6], [7, 2.0], [5, 1.4], [0, 2.4]] },
      10: { root: 138.59, gap: 6600, steps: [[0, 1.2], [1, 0.9], [6, 1.5], [8, 1.8]] },
      11: { root: 130.81, gap: 7400, steps: [[0, 1.5], [3, 1.2], [10, 1.8], [0, 2.2]] },
      12: { root: 123.47, gap: 8400, steps: [[0, 2.0], [7, 2.4], [5, 1.6], [12, 2.8]] },
    };
    let motif = null;

    function stopMotif() {
      if (!motif) return;
      clearTimeout(motif.timer);
      motif = null;
    }

    function setMotif(floor) {
      if (motif && motif.floor === floor) return;
      stopMotif();
      const cfg = MOTIFS[floor];
      if (!Settings.music || !cfg) return;
      const cur = { floor, timer: null };
      motif = cur;
      const once = () => {
        if (motif !== cur) return;
        let acc = 0;
        cfg.steps.forEach(([semi, dur]) => {
          const f = cfg.root * Math.pow(2, semi / 12);
          beepTone(f, dur, 0.013, acc);
          beepTone(f * 2, dur * 0.8, 0.0035, acc + 0.02);
          acc += dur * 0.92;
        });
        cur.timer = setTimeout(once, cfg.gap + acc * 1000);
      };
      cur.timer = setTimeout(once, cfg.gap * 0.45);
    }

    // 动机用的音色：慢起、慢落，像远处有人在敲钟
    function beepTone(freq, dur, gain, delay) {
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + (delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.22, dur * 0.35));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    }

    const map = {
      step: () => beep(200 + Math.random() * 30, 0.04, 'sine', 0.014),
      hit: () => { beep(180, 0.09, 'sawtooth', 0.045, 80); beep(90, 0.12, 'square', 0.035, 60); },
      hitBig: () => { beep(140, 0.17, 'sawtooth', 0.055, 50); beep(70, 0.22, 'square', 0.045, 40); beep(460, 0.09, 'triangle', 0.035, 180); },
      pick: () => { beep(660, 0.06, 'triangle', 0.04); beep(990, 0.1, 'triangle', 0.032, null, 0.05); },
      relic: () => {
        // 三层上行动机：C5 → G5 → C6，尾音带一点亮泽（triangle），像塔在应答
        beep(523, 0.14, 'sine', 0.05);
        beep(784, 0.16, 'sine', 0.045, null, 0.09);
        beep(1047, 0.26, 'triangle', 0.04, null, 0.2);
        beep(1568, 0.3, 'sine', 0.02, null, 0.34); // 高泛音闪光
      },
      door: () => beep(320, 0.16, 'sine', 0.045, 520),
      level: () => { beep(523, 0.1, 'triangle', 0.045); beep(659, 0.1, 'triangle', 0.045, null, 0.1); beep(784, 0.2, 'triangle', 0.045, null, 0.2); },
      buy: () => beep(880, 0.06, 'triangle', 0.035),
      talk: () => beep(400, 0.04, 'sine', 0.022),
      ach: () => { beep(784, 0.09, 'triangle', 0.045); beep(1047, 0.15, 'triangle', 0.045, null, 0.09); },
      win: () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, i === 3 ? 0.34 : 0.12, 'triangle', 0.045, null, i * 0.13)); },
      lock: () => beep(130, 0.12, 'square', 0.035),
      skip: () => beep(500, 0.08, 'sine', 0.03, 240),
      heal: () => { beep(440, 0.1, 'sine', 0.035); beep(660, 0.16, 'sine', 0.03, null, 0.08); },
    };
    return { play(n) { if (map[n]) map[n](); }, startMusic, stopMusic, setPad, setMotif, stopMotif };
  })();

  let flashTimer = null;
  function flashEdge() {
    if (REDUCED()) return;
    const f = el.hitFlash;
    if (!f) return;
    f.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => f.classList.remove('on'), 190);
  }

  // 遗物拾取的高光时刻：星芒光柱 → 金色全景闪 → 顶栏金晕 → 冲击环+金尘+freeze。
  // 一局只有两三次，值得给它一整秒的舞台。
  let relicGlowTimer = null;
  let relicFadeTimer = null;
  function relicShowcase(x, y) {
    const T = TN();
    Renderer.freeze(90);
    Renderer.relicBeamFx(x, y);
    if (!REDUCED()) {
      Renderer.shake(160, 3);
      Renderer.pulse();
      const f = el.relicFlash;
      if (f) {
        clearTimeout(relicGlowTimer);
        clearTimeout(relicFadeTimer);
        f.classList.remove('fade');
        f.classList.add('on');
        relicGlowTimer = setTimeout(() => {
          f.classList.remove('on');
          f.classList.add('fade');
          relicFadeTimer = setTimeout(() => f.classList.remove('fade'), 650);
        }, 160);
      }
      if (el.topbar) {
        el.topbar.classList.remove('relic-hit');
        void el.topbar.offsetWidth; // 重置动画
        el.topbar.classList.add('relic-hit');
        setTimeout(() => el.topbar.classList.remove('relic-hit'), 1150);
      }
    }
    Renderer.ring(x, y, 'rgba(255,236,180,0.95)', T * 3.1, 620);
    Renderer.burst(x * T + T / 2, y * T + T / 2, {
      count: REDUCED() ? 14 : 34, colors: ['#fff4d6', '#ffe6a8', '#ffd27d', '#e8c46a'], speed: 170, life: [600, 1250], size: [2, 5.5], grav: 130,
    });
    vibrate([14, 30, 14]);
  }

  function vibrate(ms) {
    if (!Settings.vib) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  const el = {
    stage: $('stage'), canvas: $('game'),
    floorName: $('floorName'), floorDots: $('floorDots'),
    statAtk: $('statAtk'), statDef: $('statDef'), statGold: $('statGold'),
    statLv: $('statLv'), statExp: $('statExp'),
    keyY: $('keyY'), keyR: $('keyR'), relicRow: $('relicRow'),
    log: $('log'),
    startOverlay: $('startOverlay'), shopOverlay: $('shopOverlay'),
    endOverlay: $('endOverlay'), dialogOverlay: $('dialogOverlay'),
    boardOverlay: $('boardOverlay'), codexOverlay: $('codexOverlay'),
    cfgOverlay: $('cfgOverlay'), choiceOverlay: $('choiceOverlay'),
    heartOverlay: $('heartOverlay'), heartTake: $('heartTake'), heartLeave: $('heartLeave'),
    vowOverlay: $('vowOverlay'), vowCards: $('vowCards'), vowTag: $('vowTag'),
    eventOverlay: $('eventOverlay'), evEmoji: $('evEmoji'), evName: $('evName'), evText: $('evText'), evOpts: $('evOpts'),
    gateOverlay: $('gateOverlay'), gateList: $('gateList'),
    altarOverlay: $('altarOverlay'), altarCards: $('altarCards'),
    hitFlash: $('hitFlash'), relicFlash: $('relicFlash'), topbar: $('topbar'), hpGhost: $('hpGhost'), endScore: $('endScore'),
    toast: $('toast'), warnPill: $('warnPill'),
    battleScene: $('battleScene'),
    bsHero: $('bsHero'), bsFoe: $('bsFoe'),
    bsHeroBar: $('bsHeroBar'), bsFoeBar: $('bsFoeBar'),
    bsHeroHp: $('bsHeroHp'), bsFoeHp: $('bsFoeHp'),
    bsName: $('bsName'), bsRounds: $('bsRounds'), bsNumbers: $('bsNumbers'),
    bsPhase: $('bsPhase'), bsPhaseTitle: $('bsPhaseTitle'), bsPhaseText: $('bsPhaseText'),
    bsBlock: $('bsBlock'), blockPip: $('blockPip'),
    bsPanel: document.querySelector('.bs-panel'),
    guide: $('guide'),
    goalRow: $('goalRow'), goalText: $('goalText'), goalState: $('goalState'),
    ringRow: $('ringRow'),
    echoOverlay: $('echoOverlay'), echoKicker: $('echoKicker'), echoLine: $('echoLine'),
    echoGoals: $('echoGoals'), echoReward: $('echoReward'), echoRings: $('echoRings'),
    echoHint: $('echoHint'), echoClose: $('echoClose'),
    resetConfirmOverlay: $('resetConfirmOverlay'),
  };

  // ---------- 富文本：把 **重点** 渲染成加粗 ----------
  // 只建文本节点，不走 innerHTML：提示里带尖括号也不会被当成 HTML 执行
  function renderRich(node, str) {
    node.textContent = '';
    const parts = String(str == null ? '' : str).split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.length > 4 && part.slice(0, 2) === '**' && part.slice(-2) === '**') {
        const b = document.createElement('strong');
        b.textContent = part.slice(2, -2);
        node.appendChild(b);
      } else {
        node.appendChild(document.createTextNode(part));
      }
    }
  }

  // ---------- 顶部提示（纯操作反馈；长句给足阅读时间） ----------
  function warn(msg, ms) {
    const p = el.warnPill;
    if (!p) return;
    renderRich(p, msg);
    p.classList.add('show');
    clearTimeout(warnTimer);
    const dur = ms || (p.textContent.length > 26 ? 4800 : 3200);
    warnTimer = setTimeout(() => p.classList.remove('show'), dur);
  }

  // ---------- 角色提示：关键消息走对白，悬挂数秒后自己收起 ----------
  // 排队 + 等空闲：剧情对白、战斗、商店/抉择面板开着时不硬插，避免盖住正在做的事
  // 自动收起是兜底：玩家没点也不会一直挂着；想提前关，点一下或按「跳过」即可
  function canSay() {
    return !!(Engine.state && Engine.state()) && !typing && !battleBusy && !shopOpen && !covered();
  }

  function scheduleHint() {
    if (!hintQueue.length || hintPump) return;
    hintPump = setInterval(() => {
      if (!hintQueue.length) { clearInterval(hintPump); hintPump = null; return; }
      if (!canSay()) return;
      const h = hintQueue.shift();
      clearInterval(hintPump);
      hintPump = null;
      const id = ++hintSeq;
      playStory(h.script, () => {
        el.dialogOverlay.classList.remove('hint-mode');
        if (hintQueue.length) scheduleHint();
      }, h.cue);
      el.dialogOverlay.classList.add('hint-mode');
      if (typing) typing.hintId = id;
      // 到点只关这一条：hintId 对不上说明已经换了对白，绝不误关剧情台词
      if (h.autoMs > 0) {
        clearTimeout(hintAuto);
        hintAuto = setTimeout(() => {
          if (typing && typing.hintId === id && el.dialogOverlay.classList.contains('hint-mode')) closeDialog();
        }, h.autoMs);
      }
    }, 180);
  }

  function say(lines, opts) {
    const script = (Array.isArray(lines) ? lines : [lines]).map((row) =>
      Array.isArray(row) ? row : ['', String(row), '']);
    const autoMs = opts && opts.autoMs != null ? opts.autoMs : HINT_AUTO_MS;
    hintQueue.push({ script, autoMs, cue: (opts && opts.cue) || '点击收起 · 稍后自动关闭' });
    scheduleHint();
  }

  function sayHint(key, vars) {
    const script = S.keyHints && S.keyHints[key];
    if (!script) return;
    const fill = (t) => String(t).replace(/\{(\w+)\}/g,
      (m, k) => (vars && vars[k] != null ? vars[k] : m));
    say(script.map((row) => Array.isArray(row)
      ? [row[0], fill(row[1]), row[2] || '']
      : fill(row)));
  }

  // ---------- 成就吐司 ----------
  const toastQueue = [];
  let toastBusy = false;
  function notifyAchievement(def) {
    toastQueue.push(def);
    pumpToast();
  }
  function pumpToast() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    const def = toastQueue.shift();
    $('toastEmoji').textContent = def.emoji;
    $('toastName').textContent = def.name;
    $('toastDesc').textContent = def.desc;
    $('toastCount').textContent = `${Achievements.count()}/${Achievements.DEFS.length}`;
    el.toast.classList.add('show');
    Sound.play('ach');
    setTimeout(() => {
      el.toast.classList.remove('show');
      setTimeout(() => { toastBusy = false; pumpToast(); }, 340);
    }, 2400);
  }

  // ---------- 打击感分级 ----------
  const TN = () => Renderer.getTile();
  function impactFX(level, tx, ty) {
    const R = REDUCED() ? 0.45 : 1;
    const T = TN();
    const cx = tx * T + T / 2;
    const cy = ty * T + T / 2;
    if (level >= 3) {
      Renderer.freeze(REDUCED() ? 120 : 280);
      Renderer.shake(480, 11 * R);
      Renderer.pulse();
      Renderer.ring(tx, ty, 'rgba(255,190,90,0.9)', T * 3.4, 620);
      Renderer.burst(cx, cy, { count: REDUCED() ? 10 : 26, colors: ['#ffd27d', '#ff9f6b', '#ffe9b0', '#ff7d5c'], speed: 150, life: [500, 1000], size: [2.5, 5] });
      vibrate([30, 40, 60]);
    } else if (level === 2) {
      Renderer.freeze(REDUCED() ? 70 : 150);
      Renderer.shake(320, 8 * R);
      flashEdge();
      Renderer.ring(tx, ty, 'rgba(255,120,90,0.8)', T * 2.4, 500);
      Renderer.burst(cx, cy, { count: REDUCED() ? 6 : 16, colors: ['#ff8f6b', '#ffc98f'], speed: 120, life: [420, 850] });
      vibrate(24);
    } else if (level === 1) {
      Renderer.freeze(REDUCED() ? 40 : 90);
      Renderer.shake(220, 6 * R);
      Renderer.burst(cx, cy, { count: REDUCED() ? 4 : 10, colors: ['#ffd27d', '#ffb07d'], speed: 100, life: [380, 700] });
      vibrate(16);
    } else {
      Renderer.freeze(REDUCED() ? 20 : 55);
      Renderer.shake(160, 4 * R);
      Renderer.burst(cx, cy, { count: REDUCED() ? 3 : 6, colors: ['#e8e8e8', '#ffd27d'], speed: 80, life: [300, 560], size: [1.5, 3] });
    }
  }

  // ---------- 日志 ----------
  function log(msg, cls) {
    if (!msg) return;
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = msg;
    el.log.appendChild(div);
    while (el.log.children.length > 7) el.log.removeChild(el.log.firstChild);
  }

  // ---------- HUD ----------
  const RELIC_ORDER = ['ward', 'edge', 'ember', 'steel', 'thrift', 'vigor', 'scout', 'gate', 'heart'];
  let relicSig = null;
  function renderRelicRow(s) {
    const owned = RELIC_ORDER.filter((id) => s && s.flags['relic_' + id]);
    const sig = owned.join(',');
    if (sig === relicSig) return;
    relicSig = sig;
    if (!owned.length) {
      el.relicRow.innerHTML = '<span class="relic empty">＋</span><span class="relic empty">＋</span><span class="relic empty">＋</span>';
      return;
    }
    el.relicRow.innerHTML = owned.map((id) => {
      const r = D.relics[id];
      return `<span class="relic on" data-relic="${id}" title="${r.name}：${r.desc}">${r.emoji}</span>`;
    }).join('');
    const gateChip = el.relicRow.querySelector('.relic[data-relic="gate"]');
    if (gateChip) gateChip.addEventListener('click', openGate);
  }

  // 锁环：圆形 chip，与方形遗物一眼分开
  let ringSig = null;
  function renderRingRow(s) {
    const owned = Engine.rings();
    const sig = owned.join(',');
    if (sig === ringSig) return;
    ringSig = sig;
    el.ringRow.innerHTML = owned.map((id) => {
      const r = D.rings[id];
      return `<span class="ring-chip" data-ring="${id}" title="${r.name}：${r.desc}">${r.emoji}</span>`;
    }).join('');
  }

  // 章节主色只在这里注入一次，四章共用同一套组件
  function setChapterColor(floor) {
    const f = D.floors[floor];
    const ch = f && f.chapter ? D.chapters[f.chapter - 1] : null;
    const root = document.documentElement.style;
    root.setProperty('--chapter', ch ? ch.color : D.PALETTE.gold);
    root.setProperty('--chapter-soft', ch ? ch.accent : 'rgba(232,196,106,0.20)');
  }

  function buildFloorDots() {
    el.floorDots.innerHTML = D.floors.map((f, i) => `<i data-ch="${f.chapter || 0}" title="第 ${i + 1} 层"></i>`).join('');
  }

  function refreshHud() {
    const s = Engine.state();
    if (!s) return;
    const next = Engine.nextLevelExp();
    const maxHp = s.maxHp || Math.max(s.hp, 1000);
    const pct = Math.max(0, Math.min(100, (s.hp / maxHp) * 100));
    const wrap = $('hpBar').parentElement;
    $('hpBar').style.width = pct + '%';
    if (pct > lastPct) {
      // 回血：残影直接跟上，不拖影
      el.hpGhost.style.transition = 'none';
      el.hpGhost.style.width = pct + '%';
      requestAnimationFrame(() => { el.hpGhost.style.transition = ''; });
    } else {
      el.hpGhost.style.width = pct + '%';
    }
    lastPct = pct;
    $('hpText').textContent = `${Math.max(0, Math.round(s.hp))} / ${Math.round(maxHp)}`;
    wrap.classList.toggle('low', pct <= 25);
    el.floorName.textContent = `第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}`;
    el.statAtk.textContent = s.atk;
    el.statDef.textContent = s.def;
    el.statGold.textContent = s.gold;
    el.statLv.textContent = 'Lv.' + s.level;
    el.statExp.textContent = next ? `${s.exp}/${next}` : `${s.exp} · MAX`;
    el.keyY.textContent = s.keys.y;
    el.keyR.textContent = s.keys.r;
    $('btnCodex').style.display = s.flags.codex ? '' : 'none';

    Array.from(el.floorDots.children).forEach((d, i) => {
      d.className = i === s.floor ? 'now' : i < s.floor ? 'done' : '';
    });
    renderRelicRow(s);
    renderRingRow(s);
    setChapterColor(s.floor);

    // 本层规矩实时反馈：以前只有离开楼层才知道做没做到
    const gp = Engine.goalPreview();
    if (el.goalRow) {
      el.goalRow.hidden = !gp;
      if (gp) {
        el.goalText.textContent = gp.text;
        el.goalState.textContent = gp.locked ? (gp.ok ? '已结算' : '未达成') : (gp.ok ? '已达成' : '进行中');
        el.goalRow.classList.toggle('ok', !!gp.ok);
        el.goalRow.classList.toggle('locked', !!gp.locked);
        el.goalRow.title = `第 ${s.floor + 1} 层的额外目标 · 离开本层时结算，达成后计入塔印与通关余烬${gp.locked ? '（本章已结算）' : ''}`;
      }
    }
    if (el.vowTag) {
      const v = D.vows[s.flags.vow] || D.vows.none;
      el.vowTag.hidden = v.name === '不立誓';
      el.vowTag.textContent = v.tag;
      el.vowTag.title = `${v.name}：${v.desc}（通关余烬 +${v.reward || 0}）`;
    }
    if (el.blockPip) {
      const used = !Engine.canBlock();
      el.blockPip.classList.toggle('used', used);
      el.blockPip.title = used ? '本层格挡已用完（进下一层恢复）' : '本层还有一次格挡：战斗中可把承伤降到 60%';
    }

    ['statAtk', 'statDef', 'statGold'].forEach((id) => {
      const node = $(id);
      const v = node.textContent;
      if (node._last !== undefined && node._last !== v) {
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
      }
      node._last = v;
    });

    if (pct <= 25 && s.hp > 0) Tips.show('low');
  }

  let lastPct = 100;

  function shakeHp() {
    const wrap = $('hpBar').parentElement;
    wrap.classList.remove('shake');
    void wrap.offsetWidth;
    wrap.classList.add('shake');
  }

  // ---------- 对白 ----------
  function playStory(key, cb, cue) {
    // 对白期间画面暂停重绘，这里先补一帧，避免遮罩后面是空画布
    if (Engine.state() && !covered()) { try { Renderer.draw(Engine.state()); } catch (e) {} }
    const script = Array.isArray(key) ? key : S[key];
    if (!script) { if (cb) cb(); return; }
    const lines = script.map((row) => {
      if (Array.isArray(row)) return { who: row[0] || '', text: row[1] || '', mood: row[2] || '' };
      return { who: '', text: String(row), mood: '' };
    });
    typing = { lines, idx: 0, cb: cb || null, cue: cue || '' };
    el.dialogOverlay.classList.add('show');
    renderLine();
  }

  // 连续播几段对白：一段读完自动接下一段
  function playSequence(keys) {
    const next = () => {
      const k = keys.shift();
      if (!k) return;
      playStory(k, next);
    };
    next();
  }

  function renderLine() {
    if (!typing) return;
    const line = typing.lines[typing.idx];
    const isThink = line.mood === 'think';
    $('dlgWho').textContent = line.who;
    $('dlgWho').className = 'dlg-who ' + (line.who === '烛' ? 'ghost'
      : line.who === '薇拉' ? 'vera'
        : line.who === '魔王' || line.who === '炬' ? 'boss'
          : line.who === '砚' ? 'yan'
            : line.who === '铎' ? 'duo'
              : line.who === '衡' ? 'heng'
                : line.who === '秤' ? 'merchant' : '');
    $('dlgWho').style.display = line.who ? '' : 'none';
    const text = $('dlgText');
    renderRich(text, line.text);
    text.className = 'dlg-text' + (isThink ? ' think' : '');
    $('dlgBox').classList.toggle('narration', !line.who);
    $('dlgPortrait').innerHTML = window.Portraits ? window.Portraits.render(line.who, line.mood || 'calm') : '';
    $('dlgCue').textContent = typing.cue || (typing.idx >= typing.lines.length - 1 ? '点击结束' : '▼');
    const prev = $('dlgPrev');
    prev.disabled = typing.idx === 0;
    prev.style.visibility = typing.idx === 0 ? 'hidden' : 'visible';
    Sound.play('talk');
  }

  function advanceDialog() {
    if (!typing) return;
    if (typing.idx < typing.lines.length - 1) {
      typing.idx++;
      renderLine();
      return;
    }
    closeDialog();
  }

  function prevDialog() {
    if (!typing || typing.idx === 0) return;
    typing.idx--;
    renderLine();
  }

  function skipDialog() {
    if (!typing) return;
    Sound.play('skip');
    closeDialog();
  }

  function closeDialog() {
    el.dialogOverlay.classList.remove('show', 'hint-mode');
    const cb = typing && typing.cb;
    typing = null;
    $('dlgPortrait').innerHTML = '';
    if (cb) cb();
  }

  // ---------- 挑战码 / 塔友名录 ----------
  // 编解码在 challenge.js 里：纯函数、可单测；v1/v2 旧码也能贴进来，旧码里的分数直接忽略
  function encodeChallenge(sum) {
    return window.Challenge.encode(sum);
  }
  function decodeChallenge(code) {
    const d = window.Challenge.decode(code);
    if (!d) return null;
    const rec = {
      ending: d.ending,
      floor: d.floor,
      level: d.level,
      steps: d.steps,
      time: d.time,
      seal: d.seal || '',
      goals: d.goals || 0,
      vow: D.vows[d.vow] ? d.vow : 'none',
    };
    if (!rec.floor || rec.floor > D.floors.length) return null;
    return rec;
  }
  // 贴进来的码去重：同一个码只留一条幽灵行
  function loadRivals() {
    try { return JSON.parse(localStorage.getItem('towermates_rivals') || '[]'); } catch (e) { return []; }
  }
  function saveRival(code, rec) {
    const list = loadRivals().filter((x) => x.code !== code);
    list.push(Object.assign({ code, name: '挑战·朋友', rival: true }, rec));
    try { localStorage.setItem('towermates_rivals', JSON.stringify(list.slice(0, 12))); } catch (e) {}
  }
  function loadBoard() {
    try { return JSON.parse(localStorage.getItem('towermates_board') || '[]'); } catch (e) { return []; }
  }
  // 名录按「爬到多深 → 有没有走到真结局 → 谁更快」排，不再比一个算出来的分数
  function cmpBoard(a, b) {
    return (b.floor || 0) - (a.floor || 0)
      || (b.ending === 'true' ? 1 : 0) - (a.ending === 'true' ? 1 : 0)
      || (a.time || 999999) - (b.time || 999999)
      || (a.steps || 0) - (b.steps || 0);
  }
  function saveBoard(entry) {
    const list = loadBoard();
    list.push(entry);
    list.sort(cmpBoard);
    try { localStorage.setItem('towermates_board', JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }
  const fmtTime = (t) => (t >= 60 ? `${Math.floor(t / 60)}分${t % 60}秒` : `${t}秒`);
  const endName = (e) => (e === 'true' ? '第六个名字' : e === 'plain' ? '铁与霜' : '未竟');

  let boardFilter = 'all';
  const VOW_TABS = [['all', '全部'], ['none', '不立誓'], ['mercy', '慈悲'], ['greed', '贪婪'], ['guard', '铁壁']];

  function openBoard() {
    const mine = loadBoard().map((x) => Object.assign({ mine: true, vow: x.vow || 'none' }, x));
    const all = S.shadowRivals.map((x) => Object.assign({ vow: 'none' }, x))
      .concat(loadRivals())
      .concat(mine);
    all.sort(cmpBoard);
    $('boardTabs').innerHTML = VOW_TABS.map(([id, label]) =>
      `<button class="btab ${boardFilter === id ? 'on' : ''}" data-f="${id}">${label}</button>`).join('');
    $('boardTabs').querySelectorAll('.btab').forEach((b) => {
      b.addEventListener('click', () => { boardFilter = b.dataset.f; openBoard(); });
    });
    const rows = boardFilter === 'all' ? all : all.filter((r) => (r.vow || 'none') === boardFilter);
    const myFloor = mine.length ? Math.max.apply(null, mine.map((x) => x.floor || 0)) : 0;
    const crushed = myFloor > 0 && all[0] && all[0].mine !== true && (all[0].floor || 0) < myFloor;
    $('boardList').innerHTML = (rows.length ? (crushed && boardFilter === 'all'
      ? '<div class="bd-note">影子勇者都停在前五层。你已经走到他们没到过的地方。</div>'
      : '') + rows.slice(0, 10).map((r, i) => {
      const v = D.vows[r.vow] || D.vows.none;
      const name = r.mine ? '你' : r.rival ? `挑战·朋友 第 ${r.floor} 层` : r.name;
      return `<div class="bd-row ${r.mine ? 'mine' : ''} ${r.rival ? 'rival' : ''}">
        <span class="bd-rank">${i + 1}</span>
        <span class="bd-name">${name}${v.name === '不立誓' ? '' : `<i class="bd-vowtag">${v.tag[0]}</i>`}</span>
        <span class="bd-end ${r.ending === 'true' ? 't' : ''}">${endName(r.ending)}</span>
        <span class="bd-floor">${r.floor}层</span>
        <span class="bd-steps">${r.steps}步</span>
        <span class="bd-time">${r.time ? fmtTime(r.time) : '—'}</span>
      </div>`;
    }).join('') : '<div class="bd-empty">这一档还没有人。去立一条誓约，回来占第一位。</div>');    const codeEl = $('myCode');
    codeEl.textContent = mine.length ? encodeChallenge(mine[0]) : '—— 通关后生成 ——';
    $('achCount').textContent = `成就 ${Achievements.count()}/${Achievements.DEFS.length}`;
    el.boardOverlay.classList.add('show');
  }
  // 贴码：解码 → 查重 → 以幽灵行进榜
  function pasteChallenge() {
    const input = $('pasteCode');
    const code = (input.value || '').trim();
    const hint = $('pasteCode') && input.closest('.board-panel').querySelector('.code-hint');
    if (!code) { warn('先贴进一个挑战码'); return; }
    const rec = decodeChallenge(code);
    if (!rec) { warn('这个码读不出来——让朋友复制完整的挑战码'); return; }
    const myCode = loadBoard().length ? encodeChallenge(Object.assign({ vow: 'none' }, loadBoard()[0])) : '';
    if (code === myCode) { warn('这是你自己的码'); return; }
    const dup = loadRivals().some((x) => x.code === code);
    saveRival(code, rec);
    input.value = '';
    if (hint) hint.textContent = dup
      ? `已更新「挑战·朋友」：第 ${rec.floor} 层 · 用时 ${fmtTime(rec.time)}`
      : `「挑战·朋友」进榜：第 ${rec.floor} 层 · 用时 ${fmtTime(rec.time)}。爬得比他更高。`;
    warn(dup ? '朋友的最新成绩已更新' : `挑战·朋友 第 ${rec.floor} 层，进榜了`);
    Sound.play('ach');
    boardFilter = 'all';
    openBoard();
  }
  function closeBoard() { el.boardOverlay.classList.remove('show'); }

  // ---------- 图鉴 ----------
  // 自动遍历全部怪物（v0.4 的手抄名单在扩层后丢了 8 只锁梁怪和 4 位 Boss），
  // 按「首次出现的楼层」排序——那是玩家认识它们的顺序
  function openCodex() {
    const s = Engine.state();
    if (!s || !s.flags.codex) return;
    const maxHp = s.maxHp || Math.max(s.hp, 1000);
    const firstFloor = {};
    D.floors.forEach((f, fi) => {
      f.map.forEach((row) => {
        for (const ch of row) {
          const m = D.monsters[ch];
          if (m && !m.ghost && firstFloor[ch] === undefined) firstFloor[ch] = fi;
        }
      });
    });
    const order = Object.keys(D.monsters).filter((ch) => D.monsters[ch] && !D.monsters[ch].ghost)
      .sort((a, b) => (firstFloor[a] ?? 99) - (firstFloor[b] ?? 99));
    $('codexList').innerHTML = order.map((ch) => {
      const m = D.monsters[ch];
      const p = Engine.predict(ch);
      let loss = '无法破防';
      let cls = 'danger';
      if (p && p.damage != null) {
        loss = p.damage === 0 ? '无伤' : `-${p.damage}`;
        cls = p.damage === 0 ? 'safe' : p.damage >= maxHp * 0.25 ? 'danger' : 'warn';
      }
      const bossTag = m.boss ? `<i class="cx-tag boss">${m.chapter || 0}章</i>` : '';
      return `<div class="cx-row">
        <span class="cx-emoji">${m.emoji}</span>
        <span class="cx-name">${m.name}${bossTag}<i class="cx-tag">${m.kind}</i></span>
        <span class="cx-stat">HP ${m.hp} · 攻 ${m.atk} · 防 ${m.def}</span>
        <span class="cx-loss ${cls}">${loss}</span>
        <span class="cx-reward">${m.gold}💰 ${m.exp}✨</span>
      </div>`;
    }).join('');
    el.codexOverlay.classList.add('show');
  }

  // ---------- 战斗演出 ----------
  function playBattleScene(info, done) {
    const s = Engine.state();
    const m = info.monster;
    const pred = info.pred;
    const heroMax = s.maxHp || Math.max(s.hp, 1000);
    const foeMax = m.hp;
    let heroHp = s.hp;
    let foeHp = foeMax;
    let skipped = false;
    // 「快速战斗」把整段演出压到 42%，重复刷层时不再被迫看完
    const speed = (window.__battleSpeed || 1) * (Settings.fast ? 0.42 : 1);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));

    const bg = Renderer.snapshot();
    if (bg) el.battleScene.style.setProperty('--bg', `url(${bg})`);

    el.bsHero.textContent = '🧙';
    el.bsFoe.textContent = m.emoji;
    // 章末 Boss 带「第 N 章」标记：玩家要据此规划"半血以上打赢"这类塔规
    el.bsName.textContent = m.name + (m.boss ? ' · ' + (m.title || '塔的主人') : (m.chapter ? ` · 第 ${m.chapter} 章` : ''));
    el.bsRounds.textContent = `回合 1 / ${pred.rounds}`;
    el.bsHeroHp.textContent = Math.round(heroHp);
    el.bsFoeHp.textContent = Math.round(foeHp);
    el.bsHeroBar.style.width = '100%';
    el.bsFoeBar.style.width = '100%';
    el.bsNumbers.innerHTML = '';
    el.battleScene.classList.add('show');
    el.battleScene.classList.remove('hero-win');
    el.bsPhase.classList.remove('show');
    el.bsPanel.classList.remove('p2', 'p3');

    // 格挡：每层一次，按下后整场承伤 ×0.6（引擎按同样比例结算，数字对得上）
    let blockScale = 1;
    let blockOn = false;
    const canB = Engine.canBlock();
    // 格挡比例由引擎给出（断刃之环会把它从 0.6 改成 0.5），演出与结算不会各算各的
    const scaleWhenBlocked = info.dmgBlock && info.dmgBase.damage > 0
      ? Math.max(0.05, info.dmgBlock.damage / info.dmgBase.damage)
      : Engine.ringBlockScale();
    // 小架不值得给选项：伤害不到 5% 上限的杂兵战不显示格挡，免得每次都弹
    const worth = m.boss || pred.damage >= heroMax * 0.05;
    el.bsBlock.style.display = worth ? '' : 'none';
    el.bsBlock.classList.remove('done');
    el.bsBlock.disabled = !canB;
    el.bsBlock.innerHTML = `<b>🛡 格挡</b><span>本层一次 · 承伤 −${Math.round((1 - scaleWhenBlocked) * 100)}%</span>`;
    if (worth && Tips.mark('block')) Tips.banner('block');
    el.bsBlock.onclick = (e) => {
      e.stopPropagation();
      if (!canB || blockOn) return;
      blockOn = true;
      blockScale = scaleWhenBlocked;
      el.bsBlock.classList.add('done');
      el.bsBlock.disabled = true;
      Sound.play('level');
      vibrate([12, 20, 8]);
      warn(`**格挡**：这一战的承伤降到 **${Math.round(blockScale * 100)}%**`);
    };

    function bars() {
      el.bsHeroBar.style.width = Math.max(0, Math.min(100, (heroHp / heroMax) * 100)) + '%';
      el.bsFoeBar.style.width = Math.max(0, Math.min(100, (foeHp / foeMax) * 100)) + '%';
      el.bsHeroHp.textContent = Math.max(0, Math.round(heroHp));
      el.bsFoeHp.textContent = Math.max(0, Math.round(foeHp));
    }
    function dmgNum(anchor, text, color) {
      const r = anchor.getBoundingClientRect();
      const d = document.createElement('div');
      d.className = 'bs-dmg';
      d.textContent = text;
      d.style.color = color;
      d.style.left = r.left + r.width / 2 + (Math.random() * 26 - 13) + 'px';
      d.style.top = r.top + r.height * 0.35 + 'px';
      el.bsNumbers.appendChild(d);
      setTimeout(() => d.remove(), 820 * speed);
    }

    el.battleScene.onclick = () => { skipped = true; };

    (async () => {
      const K = Math.min(pred.rounds, m.boss ? 8 : 5);
      // Boss 三阶段：血量跨过 66% / 33% 时插一段短过场（只改表现，不改数值）
      // 每局从 Boss 台词池抽两段：同一局固定，重开一局会听到另一组
      const PHASES = info.phases || m.phases || [
        { at: 0.66, n: 2, title: '第二道锁 · 裂', text: '别把我想成一道门。门后面还有东西。' },
        { at: 0.33, n: 3, title: '第三道锁 · 塔心', text: '再近一点，你就看得见她的名字了。' },
      ];
      let phaseIdx = 0;
      const showPhase = async (ph) => {
        el.bsPhaseTitle.textContent = ph.title;
        el.bsPhaseText.textContent = ph.text;
        el.bsPhase.classList.add('show');
        el.battleScene.classList.add('phasing');
        el.bsPanel.classList.add('p' + ph.n);
        Sound.play('hitBig');
        vibrate([24, 36, 24]);
        await wait(780);
        el.bsPhase.classList.remove('show');
        el.battleScene.classList.remove('phasing');
        await wait(170);
      };

      for (let i = 0; i < K && !skipped; i++) {
        el.bsRounds.textContent = `回合 ${Math.min(i + 1, pred.rounds)} / ${pred.rounds}`;
        el.bsHero.classList.add('lunge-r');
        await wait(130);
        el.bsHero.classList.remove('lunge-r');
        const cut = pred.out;
        foeHp = Math.max(0, foeHp - cut);
        bars();
        dmgNum(el.bsFoe, '-' + cut, '#ffd27d');
        el.bsFoe.classList.add('hit');
        Sound.play(cut > heroMax * 0.06 ? 'hitBig' : 'hit');
        await wait(95);
        el.bsFoe.classList.remove('hit');
        if (foeHp <= 0) break;
        if (m.boss && phaseIdx < PHASES.length && !skipped && foeHp / foeMax <= PHASES[phaseIdx].at) {
          await showPhase(PHASES[phaseIdx]);
          phaseIdx++;
        }
        if (i < K - 1 && !skipped) {
          el.bsFoe.classList.add('lunge-l');
          await wait(130);
          el.bsFoe.classList.remove('lunge-l');
          const take = Math.round(pred.per * blockScale);
          heroHp = Math.max(1, heroHp - take);
          bars();
          if (take > 0) dmgNum(el.bsHero, '-' + take, blockOn ? '#9fd8ff' : '#ff8f8f');
          el.bsHero.classList.add('hit');
          vibrate(12);
          await wait(95);
          el.bsHero.classList.remove('hit');
        }
      }
      foeHp = 0;
      // 血条落点直接取引擎的「真实承伤」，誓约减伤/锁环减伤/格挡都算在内
      heroHp = Math.max(1, s.hp - (blockOn && info.dmgBlock ? info.dmgBlock.damage : info.dmgBase.damage));
      bars();
      el.bsFoe.classList.add('ko');
      el.battleScene.classList.add('hero-win');
      Sound.play(m.boss ? 'hitBig' : 'hit');
      await wait(370);
      el.battleScene.classList.remove('show');
      el.battleScene.classList.remove('hero-win', 'phasing');
      el.bsFoe.classList.remove('ko', 'hit');
      el.bsHero.classList.remove('hit', 'lunge-r', 'lunge-l');
      el.battleScene.onclick = null;
      el.bsBlock.onclick = null;
      done(blockOn);
    })();
  }

  function applyFightResult(res, tx, ty) {
    const s2 = Engine.state();
    const isBoss = !!res.boss;
    const heavy = res.damage >= (s2.maxHp || Math.max(s2.hp, 1000)) * 0.15;
    impactFX(isBoss ? 3 : heavy ? 2 : res.damage > 0 ? 1 : 0, tx, ty);
    Sound.play(isBoss || heavy ? 'hitBig' : 'hit');
    shakeHp();

    const T = TN();
    Renderer.addFloat(`-${res.damage}`, tx * T + T / 2, ty * T + 6, '#ff8f8f', heavy || isBoss);
    Renderer.addFloat(`+${res.gold}💰`, tx * T + T / 2 - 14, ty * T + 16, '#e8c46a');
    if (res.exp > 0) Renderer.addFloat(`+${res.exp}✨`, tx * T + T / 2 + 14, ty * T + 16, '#9fd8ff');
    if (res.heal > 0) Renderer.addFloat(`+${res.heal}❤`, tx * T + T / 2, ty * T + 26, '#6fe3a0');
    log(`击败${res.monster.name}，损失 ${res.damage} 生命，获得 ${res.gold} 金币 / ${res.exp} 经验`, 'good');
    if (res.heal > 0) log(`余烬灯芯亮了一下，回复 ${res.heal} 生命`, 'good');

    if (res.levelUps > 0) {
      Sound.play('level');
      Renderer.ring(s2.x, s2.y, 'rgba(255,224,138,0.9)', TN() * 2.6, 560);
      Renderer.addFloat('LEVEL UP', s2.x * TN() + TN() / 2, s2.y * TN() - 8, '#ffe08a', true);
      const gain = 130 + (Engine.hasRelic('vigor') ? 80 : 0);
      log(`升级！Lv.${s2.level}　攻击+${3 * res.levelUps}　防御+${2 * res.levelUps}　生命+${gain * res.levelUps}`, 'gold');
    }
    if (res.boss) {
      const m = res.monster;
      log(m.defeat || `${m.name}倒下了。`, 'gold');
      Engine.save();
      Sound.stopMusic();
      if (res.chapter) {
        const ch = D.chapters[res.chapter - 1];
        if (ch) {
          log(`${ch.title} 完成 · ${ch.theme}`, 'gold');
          warn(`**${ch.title} · 完**`);
        }
      }
      if (res.finalBoss) {
        if (Engine.revealCore()) {
          log('塔顶后面露出一段窄梯，往上还有一层。', 'gold');
          sayHint('coreReveal');
          Renderer.ring(9, 2, 'rgba(255,225,150,0.9)', TN() * 2.4, 720);
          Renderer.burst(9 * TN() + TN() / 2, 2 * TN() + TN() / 2, {
            count: 16, colors: ['#ffe6a8', '#ffd27d'], speed: 110, life: [500, 900],
          });
          Sound.play('relic');
        } else {
          log('塔顶后面像是有一道缝，但你看不出门道。', 'warn');
        }
      }
      // 战后对白读完，再结算这一章：三条规矩 + 锁环三选一
      if (res.after) playStory(res.after, () => { if (res.echo) openEcho(res.echo); });
      else if (res.echo) setTimeout(() => openEcho(res.echo), 240);
    }
    if (res.damage > 0 && (!s2.flags.worstHit || res.damage > s2.flags.worstHit)) {
      s2.flags.worstHit = res.damage;
      s2.flags.worstName = res.monster.name;
      Engine.save();
    }
    if (s2.flags.coreClear && !s2.flags.heart) {
      log('锁芯空了。那颗石头还在跳——你可以带走它，也可以让它留在这儿。', 'gold');
    }
    Achievements.evaluate('kill', s2, notifyAchievement);
    refreshHud();
  }

  // ---------- 章末回响：结算三条塔规 + 锁环三选一 ----------
  let curEcho = null;
  function openEcho(echo) {
    if (!echo) return;
    curEcho = echo;
    const s = Engine.state();
    setChapterColor(echo.chapter * 3 - 1); // 该章章末层的索引（2 / 5 / 8 / 11）
    el.echoKicker.textContent = `${echo.title} · 回响`;
    el.echoLine.textContent = (S.echoLines && S.echoLines[echo.chapter - 1]) || '';
    el.echoGoals.innerHTML = echo.list.map((g) => `
      <div class="echo-goal ${g.done ? 'done' : ''}">
        <span class="eg-mark">${g.done ? '✓' : '·'}</span>
        <span class="eg-floor">${g.floor + 1}F</span>
        <span class="eg-text">${g.text}</span>
      </div>`).join('');
    el.echoReward.textContent = echo.pending
      ? `本章规矩 ${echo.done}/3 · 留下章印 ×${echo.marks || 0} · 挑一枚锁环`
      : echo.done > 0
        ? `本章规矩 ${echo.done}/3 · 再做到 ${Math.max(0, 2 - echo.done)} 条就能留章印、挑锁环`
        : '本章规矩 0/3 · 这一章没有留下回响';
    el.echoReward.classList.toggle('muted', echo.done === 0);
    const choices = echo.pending ? (s.flags['ringChoices_' + echo.chapter] || []) : [];
    el.echoRings.innerHTML = choices.map((id) => {
      const r = D.rings[id];
      return `<button class="echo-ring" data-id="${id}">
        <span class="er-emoji">${r.emoji}</span>
        <span class="er-name">${r.name}</span>
        <span class="er-desc">${r.desc}</span>
      </button>`;
    }).join('');
    el.echoRings.querySelectorAll('.echo-ring').forEach((b) => {
      b.addEventListener('click', () => chooseRing(b.dataset.id));
    });
    renderRich(el.echoHint, echo.pending
      ? '点一枚装上 · 也可按 1 / 2 / 3 · **选了不能换**'
      : '');
    el.echoClose.hidden = !!echo.pending;
    el.echoOverlay.classList.add('show');
    Sound.play('relic');
    vibrate([10, 20, 10]);
    Achievements.evaluate('echo', s, notifyAchievement);
    if (!REDUCED()) {
      Renderer.pulse();
      Renderer.ring(s.x, s.y, 'rgba(255,225,150,0.8)', TN() * 3, 700);
    }
    refreshHud();
  }

  function chooseRing(id) {
    if (!curEcho) return;
    const res = Engine.pickRing(id);
    if (res.type !== 'ring') { warn(res.msg || '装不上'); return; }
    const s = Engine.state();
    el.echoOverlay.classList.remove('show');
    curEcho = null;
    Sound.play('relic');
    vibrate([12, 26, 12]);
    if (!REDUCED()) {
      Renderer.ring(s.x, s.y, 'rgba(255,225,150,0.9)', TN() * 2.8, 640);
      Renderer.burst(s.x * TN() + TN() / 2, s.y * TN() + TN() / 2, {
        count: 20, colors: ['#ffe6a8', '#ffd27d', '#fff4d6'], speed: 120, life: [450, 900],
      });
    }
    log(res.msg, 'gold');
    warn(res.msg);
    Tips.show('ring');
    Achievements.evaluate('ring', s, notifyAchievement);
    refreshHud();
  }

  function closeEcho() {
    el.echoOverlay.classList.remove('show');
    curEcho = null;
    refreshHud();
  }

  // 刷新/退出回来时，没选完的锁环仍要能选
  function resumePendingRing() {
    const ch = Engine.pendingRing();
    if (!ch) return;
    const s = Engine.state();
    const meta = D.chapters[ch - 1];
    openEcho({
      chapter: ch, title: meta.title,
      done: s.flags['echo_' + ch] || 0,
      marks: s.flags['echoMark_' + ch] || 0,
      pending: true,
      list: [meta.from - 1, meta.from, meta.to - 1].map((i) => ({
        floor: i, text: D.floorGoals[i] ? D.floorGoals[i].text : '', done: !!s.flags['goal_' + i],
      })),
    });
  }

  // ---------- 战斗入口 ----------
  function resolveBattle(dx, dy) {
    if (battleBusy) return;
    const s = Engine.state();
    if (!s) return;
    const tx = s.x + dx;
    const ty = s.y + dy;
    const ch = Engine.tile(tx, ty);
    const m = D.monsters[ch];
    if (!m) return;
    // 用"带格挡视角"的预测：残血玩家可以用本层的格挡换命，而不是被拦在外面
    const pred = Engine.predictOpt(ch, true) || Engine.predict(ch);
    if (!pred) return;

    if (!pred.win) {
      Sound.play('lock');
      vibrate(20);
      Renderer.flashTile(tx, ty, 'rgba(255,80,80,0.35)', 260);
      Renderer.shake(130, 2.5);
      if (m.boss) {
        const shop = nearestShopFloor(s.floor);
        if (Tips.mark('toostrong')) sayHint('tooStrongBoss', { n: shop });
        else warn(`打不过 · **回第 ${shop} 层找秤**`);
        log(`${m.name}太强了。塔里还有没清完的怪，或者回第 ${shop} 层找秤。`, 'warn');
      } else {
        const shop2 = nearestShopFloor(s.floor);
        if (Tips.mark('toostrong')) sayHint('tooStrong', { n: shop2 });
        else warn(pred.reason === '攻击力不足，无法破防' ? '**攻击力不足，无法破防**' : '这一战会要你的命，**先变强吧**');
        log(`无法战胜${m.name}：${pred.reason}`, 'warn');
      }
      // 破不了防时给出可操作的数字：还差几点攻击、去哪儿补
      if (pred.reason === '攻击力不足，无法破防') {
        log(`破防要攻击 ≥ ${m.def + 1}（当前 ${s.atk}，还差 ${m.def + 1 - s.atk}）：去这一层/第 ${nearestShopFloor(s.floor)} 层的货摊买力量训练，或先拿遗物。`, 'warn');
      }
      return;
    }

    // 用格挡才打得过的战斗：开战前直接由烛把话说明白，玩家读完再打
    // 不走提示队列——这条必须赶在开战前，排队会等到战斗结束，就失去意义了
    if (pred.blockSave && Tips.mark('blocksave')) {
      playStory(S.hints.blocksave, () => resolveBattle(dx, dy), '知道了 · 点击开打');
      el.dialogOverlay.classList.add('hint-mode');
      return;
    }

    if (m.boss && !s.flags['boss_seen_' + ch]) {
      s.flags['boss_seen_' + ch] = true;
      Engine.save();
      playStory(m.story || 'boss', () => resolveBattle(dx, dy));
      return;
    }

    battleBusy = true;
    const dmgBase = Engine.fightDamage(ch, false);
    const dmgBlock = Engine.canBlock() ? Engine.fightDamage(ch, true) : null;
    playBattleScene({
      monster: m, pred, dmgBase, dmgBlock,
      phases: m.boss ? Engine.bossPhases(ch) : null,
    }, (blocked) => {
      // 这一战只有格挡才能活：玩家撞上去就是求战，结算时自动带上格挡
      const res = Engine.fight(dx, dy, { block: blocked || !!pred.blockSave });
      battleBusy = false;
      if (res.type === 'fight') applyFightResult(res, tx, ty);
      else { warn(res.msg || '战斗中断'); refreshHud(); }
    });
  }

  // ---------- 商店 ----------
  function openShop() {
    shopOpen = true;
    renderShop();
    el.shopOverlay.classList.add('show');
  }
  function closeShop() {
    shopOpen = false;
    el.shopOverlay.classList.remove('show');
  }
  function renderShop() {
    const s = Engine.state();
    $('shopGold').textContent = s.gold;
    const list = $('shopList');
    list.innerHTML = '';
    D.shop.forEach((item) => {
      const owned = (item.codex && s.flags.codex) || (item.relic && Engine.hasRelic(item.relic));
      const price = Engine.priceOf(item);
      const afford = s.gold >= price;
      const tip = item.relic ? D.relics[item.relic].desc : item.key ? (item.key === 'y' ? '开黄门' : '开红门') : item.hp ? `回复 ${item.hp} 生命` : item.atk ? '攻击 +2' : item.def ? '防御 +2' : '怪物情报';
      const row = document.createElement('div');
      row.className = 'shop-item' + (owned ? ' owned' : '');
      row.innerHTML = `
        <span class="si-emoji">${item.emoji}</span>
        <span class="si-name"><b>${item.name}${item.once ? '<small class="si-tag">唯一</small>' : ''}</b><small>${tip}</small></span>
        <span class="si-price">${price}</span>
        <button class="si-buy" data-id="${item.id}" ${owned || !afford ? 'disabled' : ''}>${owned ? '已拥有' : '购买'}</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.si-buy').forEach((b) => {
      b.addEventListener('click', () => {
        const before = Engine.state();
        const res = Engine.buy(b.dataset.id);
        if (res.type === 'buy') {
          Sound.play(res.item.relic ? 'relic' : 'buy');
          if (res.item.hp) Sound.play('heal');
          log(res.msg, 'good');
          if (res.item.codex) {
            Renderer.ring(before.x, before.y, 'rgba(180,160,255,0.9)', TN() * 2.4, 600);
            sayHint('codex');
          }
          if (res.item.relic) {
            Renderer.ring(before.x, before.y, 'rgba(255,225,150,0.9)', TN() * 2.6, 620);
            Renderer.burst(before.x * TN() + TN() / 2, before.y * TN() + TN() / 2, { count: 14, colors: ['#ffe6a8', '#ffd27d'], speed: 110, life: [400, 800] });
            warn(res.msg);
            Tips.show('relic');
          }
          refreshHud();
          renderShop();
          Achievements.evaluate('buy', Engine.state(), notifyAchievement);
        } else {
          Sound.play('lock');
          log(res.msg, 'warn');
        }
      });
    });
  }

  // ---------- 祭坛：三选一 ----------
  function openAltar() {
    const s = Engine.state();
    const choices = Engine.altarChoices(s.floor >= 4 ? 2 : 3);
    if (!choices.length) {
      s.flags.altar = true;
      s.flags['altar_f' + s.floor] = true;
      if (Engine.tile(s.x, s.y) === 'X') Engine.state().maps[s.floor][s.y][s.x] = '.';
      Engine.save();
      log('行李里已经空了，只剩灰。');
      refreshHud();
      return;
    }
    document.querySelector('#altarOverlay .altar-desc').innerHTML = s.floor >= 4
      ? '这一堆还没人动过：一双铁腕、半瓶灯油、一本没写完的账。<br>你只能带走一件。'
      : '八个人留下的东西堆在墙角：卷刃的剑、干粮、泡烂的账册。<br>你只能带走一件。';
    el.altarCards.innerHTML = choices.map((id) => {
      const r = D.relics[id];
      return `<button class="altar-card" data-id="${id}">
        <span class="ac-emoji">${r.emoji}</span>
        <span class="ac-name">${r.name}</span>
        <span class="ac-desc">${r.desc}</span>
      </button>`;
    }).join('');
    el.altarCards.querySelectorAll('.altar-card').forEach((b) => {
      b.addEventListener('click', () => chooseAltar(b.dataset.id));
    });
    el.altarOverlay.classList.add('show');
  }

  function chooseAltar(id) {
    const s = Engine.state();
    const res = Engine.pickRelic(id);
    if (res.type !== 'relic') { warn(res.msg || '拿不了'); return; }
    el.altarOverlay.classList.remove('show');
    relicShowcase(s.x, s.y);
    Sound.play('relic');
    log(res.msg, 'gold');
    warn(res.msg);
    Tips.show('relic');
    Achievements.evaluate('relic', s, notifyAchievement);
    refreshHud();
    const lore = S.relicLore && S.relicLore[id];
    if (lore) setTimeout(() => { if (!typing) playStory(lore); }, 700);
  }

  // ---------- 层阶之钥：跳层 ----------
  function openGate() {
    const s = Engine.state();
    if (!s || !Engine.hasRelic('gate')) return;
    const max = Engine.visitedMax();
    el.gateList.innerHTML = D.floors.map((f, i) => {
      const here = i === s.floor;
      const locked = i > max;
      const tip = here ? '你在这里' : locked ? '没到过' : '跳过去';
      return `<button class="gate-row ${here ? 'here' : ''}" data-f="${i}" ${here || locked ? 'disabled' : ''}>
        <b>${i + 1}</b><span>${f.name}</span><small>${tip}</small>
      </button>`;
    }).join('');
    el.gateList.querySelectorAll('.gate-row').forEach((b) => {
      b.addEventListener('click', () => doJump(Number(b.dataset.f)));
    });
    el.gateOverlay.classList.add('show');
  }

  function doJump(target) {
    const res = Engine.jumpTo(target);
    if (res.type !== 'floor') { warn(res.msg || '跳不了'); return; }
    el.gateOverlay.classList.remove('show');
    stopWalk();
    Sound.play('door');
    vibrate([8, 18, 8]);
    enterFloor(false);
  }

  // ---------- 路遇 ----------
  let curEvent = null;

  function openEvent(id) {
    const e = D.events.find((x) => x.id === id);
    if (!e) return;
    curEvent = e;
    const s = Engine.state();
    el.evEmoji.textContent = e.emoji;
    el.evName.textContent = e.name;
    el.evText.textContent = e.text;
    el.evOpts.innerHTML = e.options.map((o, i) => {
      const block = Engine.eventCost(o);
      const cost = o.effect.gold && o.effect.gold < 0 ? -o.effect.gold : 0;
      const why = block === '金币不够' ? `还差 ${cost - s.gold} 金` : block || '';
      return `<button class="ev-opt" data-i="${i}" ${block ? 'disabled' : ''}>
        <b>${o.label}</b><small>${block ? why : o.tip}</small>
      </button>`;
    }).join('');
    el.evOpts.querySelectorAll('.ev-opt').forEach((b) => {
      b.addEventListener('click', () => chooseEvent(Number(b.dataset.i)));
    });
    el.eventOverlay.classList.add('show');
  }

  function chooseEvent(idx) {
    if (!curEvent) return;
    const res = Engine.resolveEvent(curEvent.id, idx);
    if (res.type !== 'event') { warn(res.msg || '做不了'); return; }
    el.eventOverlay.classList.remove('show');
    curEvent = null;
    Sound.play('relic');
    vibrate(14);
    log(`${res.label} · ${res.msg}`, 'gold');
    warn(res.msg);
    refreshHud();
  }

  // ---------- 塔心石：带走 / 放下 ----------
  function openHeart() {
    heartFocus = null;
    document.querySelectorAll('#heartOverlay .choice-card').forEach((c) => c.classList.remove('focus'));
    el.heartOverlay.classList.add('show');
    warn('石头在跳。**带走它**，或者**让它留在这儿**——这一下会写进结局。');
  }

  function setHeartFocus(which) {
    heartFocus = which;
    document.querySelectorAll('#heartOverlay .choice-card').forEach((c) => c.classList.remove('focus'));
    (which === 'take' ? el.heartTake : el.heartLeave).classList.add('focus');
  }

  function chooseHeart(which) {
    if (!heartFocus) return;
    const s = Engine.state();
    const res = which === 'take' ? Engine.heartTake() : Engine.heartLeave();
    if (res.type !== 'heart') { warn(res.msg || '拿不了'); return; }
    el.heartOverlay.classList.remove('show');
    heartFocus = null;
    const T = TN();
    if (which === 'take') {
      Sound.play('relic');
      vibrate([18, 40, 18]);
      Renderer.ring(s.x, s.y, 'rgba(255,140,170,0.9)', T * 2.8, 720);
      Renderer.burst(s.x * T + T / 2, s.y * T + T / 2, {
        count: 22, colors: ['#ffb6c8', '#ffd9e2', '#fff0f4'], speed: 130, life: [480, 1000],
      });
    } else {
      Sound.play('open');
      Renderer.ring(s.x, s.y, 'rgba(150,215,225,0.85)', T * 2.4, 640);
    }
    log(res.msg, 'gold');
    warn(res.msg);
    refreshHud();
    Achievements.evaluate('heart', s, notifyAchievement);
    setTimeout(() => { if (!typing) playStory(which === 'take' ? 'heartTake' : 'heartLeave'); }, 240);
  }

  // ---------- 结局抉择 ----------
  function showEndingChoice() {
    choiceFocus = null;
    document.querySelectorAll('.choice-card').forEach((c) => c.classList.remove('focus'));
    el.choiceOverlay.classList.add('show');
  }
  function setChoiceFocus(which) {
    choiceFocus = which;
    document.querySelectorAll('.choice-card').forEach((c) => c.classList.remove('focus'));
    $(which === 'true' ? 'choiceTrue' : 'choicePlain').classList.add('focus');
  }
  function chooseEnding(id) {
    el.choiceOverlay.classList.remove('show');
    if (id === 'true') playStory('afterChoiceTrue', () => completeEnding('true', true));
    else playStory('afterChoicePlain', () => completeEnding('plain', false));
  }
  function completeEnding(id, announce) {
    Engine.finish(id);
    refreshHud();
    showEnd();
    if (announce) Sound.play('win');
  }

  // ---------- 塔印：不看分数，只看这一局真的做到了什么 ----------
  // 四档塔印由明确条件判定；结算页会直接写出「还差什么」，玩家知道下一局该做什么。
  const SEALS = {
    clear: { name: '无痕', desc: '六盏灯全亮。这一趟，你没欠谁。' },
    ward:  { name: '守灯', desc: '灯还亮着。你没让它灭在自己手里。' },
    name:  { name: '留名', desc: '塔的墙上，多了你的一道刻痕。' },
    rough: { name: '未竟', desc: '塔记住了你的名字——仅此而已。' },
  };
  function sealOf(s, gs, echoDone) {
    const total = gs.total || 1;
    const goals = gs.done || 0;
    const trueEnd = s.ending === 'true';
    const noRetry = !(s.flags && s.flags.retries);
    if (trueEnd && goals >= total && echoDone >= 4 && noRetry) return 'clear';
    if (trueEnd && (goals >= total - 2 || echoDone >= 3)) return 'ward';
    if (goals >= Math.ceil(total / 2)) return 'name';
    return 'rough';
  }
  function nextSealHint(seal, s, gs, echoDone) {
    const total = gs.total || 1;
    const goals = gs.done || 0;
    if (seal === 'clear') return null;
    if (seal === 'rough') return `再做到 ${Math.max(1, Math.ceil(total / 2) - goals)} 条塔规，可换「留名」`;
    if (seal === 'name') return s.ending === 'true'
      ? `塔规做到 ${total - 2} 条、或章印攒到 3 枚，可换「守灯」`
      : '念出第六个名字，塔印才会再往上走';
    return `塔规 ${goals}/${total} · 章印 ${echoDone}/4 · 回头 ${s.flags.retries || 0} 次——全满且一次不回头可换「无痕」`;
  }
  // 余烬：直接按这一局留下的东西累加，不再绕一层分数换算
  function emberOf(s, gs, echoDone, vowDef) {
    let n = 5;                              // 走到结局本身
    if (s.ending === 'true') n += 4;        // 念出第六个名字
    n += gs.done || 0;                     // 每条塔规
    n += echoDone * 2;                     // 每枚章印
    if (s.flags.heart === 'left') n += 3;   // 把塔心留在原处
    n += s.flags.eventEmber || 0;           // 路遇里刻下的选择
    n += vowDef.reward || 0;                // 誓约：越难走得越多
    const has = (id) => Engine.hasRing(id);
    if (has('ledger') || has('ash') || has('ledger2')) n += gs.done || 0;
    if (has('hour') || has('pace')) n += 2;
    if (has('chisel')) n += 4;
    if (has('oath')) n += 3;
    if (has('heart') && s.flags.heart === 'left') n += 3;
    return Math.max(1, n);
  }

  // ---------- 结局 ----------
  function showEnd() {
    if (endShown) return;
    endShown = true;
    stopWalk();
    const s = Engine.state();
    const E = s.ending === 'true' ? S.endingTrue : S.endingPlain;
    const sum = Engine.summary();

    Sound.play('win');
    Sound.stopMotif();
    Sound.setPad(-1);
    Sound.stopMusic();
    if (!REDUCED()) {
      Renderer.pulse();
      Renderer.shake(600, 10);
      Renderer.burst(s.x * TN() + TN() / 2, s.y * TN() + TN() / 2, {
        count: 40, colors: ['#ffe08a', '#9fd8ff', '#ffc4e0', '#fff4d6'], speed: 170, life: [600, 1400], grav: 90, size: [2, 4.5],
      });
    }
    $('endEmoji').textContent = E.emoji;
    $('endTitle').textContent = E.title;
    $('endDesc').textContent = E.desc;
    $('endBody').textContent = E.body;
    const heartLine = s.flags.heart === 'taken' ? E.coreTake : s.flags.heart === 'left' ? E.coreLeave : (s.flags.coreClear ? E.core : '');
    $('endEpi').textContent = (E.epilogue || '') + (heartLine ? ' ' + heartLine : '');
    const relicIds = Engine.ownedRelics();
    const relics = relicIds.map((id) => D.relics[id].short).join(' ') || '无';
    const gs = Engine.goalStatus();
    sum.vow = s.flags.vow || 'none';
    const vowDef = D.vows[s.flags.vow] || D.vows.none;
    const ringList = Engine.rings();
    const echoDone = [1, 2, 3, 4].filter((i) => (s.flags['echo_' + i] || 0) >= 2).length;
    const seal = sealOf(s, gs, echoDone);
    const sealDef = SEALS[seal];
    const emberGain = emberOf(s, gs, echoDone, vowDef);
    sum.seal = seal;
    sum.goals = gs.done;
    // 跨局履历：这局结束了，塔替你记一笔（P-4）
    Meta.recordRun({
      ending: s.ending, won: true, vow: sum.vow,
      fullChapters: echoDone, heart: s.flags.heart || null,
      floor: sum.floor, time: sum.time, seal,
    });
    $('endScore').innerHTML = `<span class="es-grade ${seal}" data-seal="${seal}">${sealDef.name}</span>
      <span class="es-meta">${s.ending === 'true' ? '真结局' : '普通结局'}${s.flags.heart === 'taken' ? ' · 塔心带走' : s.flags.heart === 'left' ? ' · 塔心留下' : ''} · 塔规 ${gs.done}/${gs.total} · 章印 ${echoDone}/4 · 遗物 ${relicIds.length} · 锁环 ${ringList.length}</span>
      <span class="es-num">✦ ${emberGain}<small>余烬</small></span>`;
    $('endScore').title = `塔印「${sealDef.name}」：${sealDef.desc}`;
    $('endTag').textContent = sealDef.desc;
    const brief = [];
    brief.push(`带走 ${relicIds.length} 件遗物 · 击杀 ${s.flags.killCount || 0} 只`);
    if (s.flags.worstHit) brief.push(`最狠的一场：${s.flags.worstName} −${s.flags.worstHit}`);
    brief.push(`塔规 ${gs.done}/${gs.total} · 章印 ${echoDone}/4 · 锁环 ${ringList.length} 枚`);
    brief.push(s.flags.retries ? `重来本层 ${s.flags.retries} 次` : '一次没回头');
    const hint = nextSealHint(seal, s, gs, echoDone);
    if (hint) brief.push(`下一枚塔印：${hint}`);
    Meta.add(emberGain);
    brief.push(`✦ 余烬 +${emberGain}`);
    const vowTotal = Object.keys(D.vows).length;
    const vowUnlocked = Object.keys(D.vows).filter((id) => !D.vows[id].ember || Meta.has(id)).length;
    brief.push(`刷新 塔的记忆 · 重来 ${Meta.resets} 次 · 誓约 ${vowUnlocked}/${vowTotal} 解锁`);
    $('endBrief').innerHTML = brief.map((t) => `<span>${t}</span>`).join('');
    const ringShorts = ringList.map((id) => D.rings[id].short).join(' ') || '无';
    $('endStats').innerHTML = `
      <div>结局 <b>${endName(s.ending)}</b></div>
      <div>塔印 <b>${sealDef.name}</b></div>
      <div>最终等级 <b>Lv.${sum.level}</b></div>
      <div>攻击 / 防御 <b>${s.atk} / ${s.def}</b></div>
      <div>剩余生命 <b>${Math.round(s.hp)}</b></div>
      <div>击杀 <b>${s.flags.killCount || 0}</b></div>
      <div>遗物 <b>${relics}</b></div>
      <div>锁环 <b>${ringShorts}</b></div>
      <div>章回响 <b>${echoDone}/4 章</b></div>
      <div>塔心 <b>${s.flags.heart === 'taken' ? '带走' : s.flags.heart === 'left' ? '留下' : '未至'}</b></div>
      <div>誓约 <b>${(D.vows[s.flags.vow] || D.vows.none).name}</b></div>
      <div>步数 <b>${sum.steps} 步</b></div>
      <div>用时 <b>${fmtTime(sum.time)}</b></div>
    `;
    // 「塔的记忆」：跨局履历 + 下一局目标（P-4）——把"再来一局"变成"再来一局是为了 X"
    const mem = Meta.memory;
    const memItems = [];
    memItems.push(`进塔 ${mem.runs || 1} 次 · 最远第 ${Math.max(mem.deepest || 0, sum.floor)} 层${mem.fastest ? ` · 最快 ${fmtTime(mem.fastest)}` : ''}`);
    memItems.push(`刻下过最好的塔印：${SEALS[mem.bestSeal] ? SEALS[mem.bestSeal].name : '尚未刻下'}`);
    memItems.push(`结局：铁与霜 ×${mem.endings.plain || 0} · 第六个名字 ×${mem.endings.true || 0}`);
    memItems.push(`满回响 ${mem.fullChapters || 0}/4 章 · 塔心 带走×${mem.heartTaken || 0} 留下×${mem.heartLeft || 0}`);
    const goals = [];
    // 1) 还没解锁的誓约：差多少余烬
    const lockedVow = Object.keys(D.vows).find((id) => D.vows[id].ember && !Meta.has(id));
    if (lockedVow) {
      const v = D.vows[lockedVow];
      const need = Math.max(0, v.ember - Meta.ember);
      goals.push(need > 0
        ? `再攒 ${need} ✦ 解锁「${v.name}」（现在 ${Meta.ember}）`
        : `「${v.name}」已可解锁——下一局开局选它`);
    }
    // 2) 没通关过的誓约
    const unWon = Object.keys(D.vows).filter((id) => id !== 'none' && !D.vows[id].ember && !(mem.vowWins || {})[id]);
    if (unWon.length) goals.push(`带着「${D.vows[unWon[0]].name}」走到一次结局`);
    // 3) 没满过的章回响
    if ((mem.fullChapters || 0) < 4) goals.push(`把回响打满的章推进到 ${(mem.fullChapters || 0) + 1}/4`);
    // 4) 双结局收集
    if (!(mem.endings.true || 0)) goals.push('去念出第六个名字');
    else if (!(mem.endings.plain || 0)) goals.push('试试另一条路：铁与霜');
    // 5) 塔心还没做过另一个选择
    if (!mem.heartTaken || !mem.heartLeft) goals.push(!mem.heartTaken ? '把塔心石带走一次' : '把塔心石留下一次');
    const memHtml = `<div class="mem-grid">${memItems.map((t) => `<div>${t}</div>`).join('')}</div>`
      + (goals.length ? `<div class="mem-goals">${goals.slice(0, 3).map((g) => `<span>▸ ${g}</span>`).join('')}</div><p class="mem-note">塔在等你回来——为了上面这些。</p>` : '');
    const memWrap = $('endMemory');
    if (memWrap) memWrap.innerHTML = memHtml;
    saveBoard(sum);
    $('endCode').textContent = encodeChallenge(sum);
    // 平台桥接读这份摘要上报，不用再从 DOM 里抠数字
    if (window.__tm) window.__tm.lastRun = {
      ending: sum.ending, vow: sum.vow, floor: sum.floor, time: sum.time,
      steps: sum.steps, seal, goals: gs.done,
    };
    Achievements.evaluate('finish', s, notifyAchievement);
    el.endOverlay.classList.add('show');
    refreshStartBadges();
  }

  // ---------- 标题页 ----------
  function refreshStartBadges() {
    const plain = Achievements.isUnlocked('end_plain');
    const tru = Achievements.isUnlocked('end_true');
    $('endingBadges').innerHTML = `
      <span class="eb ${plain ? 'on' : ''}"><i>${plain ? '🕯' : '○'}</i>铁与霜</span>
      <span class="eb ${tru ? 'on true' : ''}"><i>${tru ? '🕯' : '○'}</i>第六个名字</span>
      <span class="eb ${Achievements.count() ? 'on' : ''}"><i>✦</i>成就 ${Achievements.count()}/${Achievements.DEFS.length}</span>
    `;
    const art = $('startArt');
    art.classList.toggle('lit', plain || tru);
    art.classList.toggle('true', tru);
    const em = $('startEmber');
    if (em) {
      // 标题页也讲「塔的记忆」：第 N 次进塔 + 离下一局目标最近的一条
      const mem = Meta.memory;
      const lockedVow = Object.keys(D.vows).find((id) => D.vows[id].ember && !Meta.has(id));
      const parts = [];
      if ((mem.runs || 0) > 0) parts.push(`第 ${mem.runs + 1} 次进塔 · 最远第 ${mem.deepest || 0} 层`);
      if (lockedVow) {
        const need = Math.max(0, D.vows[lockedVow].ember - Meta.ember);
        parts.push(need > 0 ? `再 ${need} ✦ 解锁「${D.vows[lockedVow].name}」` : `「${D.vows[lockedVow].name}」已可解锁`);
      } else if (Meta.ember > 0 || (mem.runs || 0) > 0) {
        parts.push(Meta.ember > 0 ? `✦ 余烬 ${Meta.ember} · 誓约已全解锁` : '✦ 誓约已全解锁');
      }
      em.textContent = parts.length ? parts.join(' · ') : '';
    }
  }

  // ---------- 楼层卡片 ----------
  let floorCardTimer = null;
  function showFloorCard(floor) {
    const f = D.floors[floor];
    setChapterColor(floor);
    const ch = f.chapter ? D.chapters[f.chapter - 1] : null;
    $('fcNum').textContent = ch
      ? `${ch.title} · ${floor + 1}/${D.floors.length} 层`
      : `第 ${floor + 1} 层 / 共 ${D.floors.length} 层`;
    $('fcName').textContent = f.name;
    $('fcTip').textContent = f.tip;
    const goal = D.floorGoals && D.floorGoals[floor];
    $('fcGoal').textContent = goal ? `这一层的规矩 · ${goal.text}` : '';
    const card = $('floorCard');
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    clearTimeout(floorCardTimer);
    floorCardTimer = setTimeout(() => card.classList.remove('show'), 2100);
  }

  // ---------- 点击寻路 ----------
  let walkTimer = null;
  function stopWalk() {
    if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
    Renderer.setTarget(null);
  }
  function walkAlong(path, tx, ty, through) {
    if (!path || !path.length) return;
    Renderer.setTarget(tx, ty);
    let i = 0;
    const step = () => {
      walkTimer = null;
      if (i >= path.length) { stopWalk(); return; }
      const [dx, dy] = path[i++];
      if (through) {
        // 走到跟前 / 沿路撞上怪物：统一交给战斗入口（打不过时与直接撞怪给同样的提示）
        const s0 = Engine.state();
        const ch = Engine.tile(s0.x + dx, s0.y + dy);
        const m = D.monsters[ch];
        if (m && !m.ghost) {
          stopWalk();
          resolveBattle(dx, dy);
          return;
        }
      }
      const s0 = Engine.state();
      const floor0 = s0 ? s0.floor : -1;
      const px0 = s0 ? s0.x : -1;
      const py0 = s0 ? s0.y : -1;
      act(dx, dy);
      const s1 = Engine.state();
      if (!s1 || s1.over || s1.won || battleBusy || typing ||
          el.dialogOverlay.classList.contains('show') || shopOpen ||
          el.codexOverlay.classList.contains('show') || s1.floor !== floor0 ||
          (s1.x === px0 && s1.y === py0)) {
        stopWalk();
        return;
      }
      walkTimer = setTimeout(step, 105);
    };
    step();
  }

  // 点怪物：一次点击走到它跟前并直接开打，不用再点第二下
  function clickMonster(cx, cy) {
    const m = D.monsters[Engine.tile(cx, cy)];
    let best = null;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
      const p = Engine.pathTo(cx + ox, cy + oy);
      if (p && p.length && (!best || p.length < best.path.length)) {
        best = { path: p, x: cx + ox, y: cy + oy };
      }
    });
    if (!best) {
      const near = Engine.pathToNear(cx, cy);
      if (near) best = { path: near.path, x: near.x, y: near.y };
    }
    if (!best) { warn('没有能靠近它的路'); return; }
    const dx = cx - best.x;
    const dy = cy - best.y;
    const adjacent = Math.abs(dx) + Math.abs(dy) === 1;
    // 补上「从相邻格撞向怪物」的最后一步，交给 walkAlong 的 through 分支开打
    const path = adjacent ? best.path.concat([[dx, dy]]) : best.path;
    stopWalk();
    walkAlong(path, adjacent ? cx : best.x, adjacent ? cy : best.y, adjacent);
    if (!adjacent) warn(`走到${m.name}附近，但被挡住了，先清开别的路`);
  }

  function clickMove(cx, cy) {
    const s = Engine.state();
    if (!s) return;
    Tips.show('walk');
    if (cx === s.x && cy === s.y) { stopWalk(); return; }
    const dx = cx - s.x;
    const dy = cy - s.y;
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      stopWalk();
      act(dx, dy);
      return;
    }
    const ch = Engine.tile(cx, cy);
    if (D.monsters[ch]) { clickMonster(cx, cy); return; }
    const path = Engine.pathTo(cx, cy);
    if (path) { stopWalk(); walkAlong(path, cx, cy); return; }
    // 被怪物截断的路线：沿"怪物可通行"的路径走到它跟前，撞上去开打
    const through = Engine.pathThrough(cx, cy);
    if (through && through.length) {
      let sx = s.x, sy = s.y;
      let cut = through.length;
      for (let i = 0; i < through.length; i++) {
        const nx = sx + through[i][0];
        const ny = sy + through[i][1];
        const ch2 = Engine.tile(nx, ny);
        if (D.monsters[ch2] && !D.monsters[ch2].ghost) { cut = i + 1; break; }
        sx = nx; sy = ny;
      }
      if (cut > 1) {
        stopWalk();
        walkAlong(through.slice(0, cut), cx, cy, true);
        return;
      }
    }
    const near = Engine.pathToNear(cx, cy);
    if (near) { stopWalk(); walkAlong(near.path, near.x, near.y); return; }
    warn('走不过去');
  }

  // ---------- 行动 ----------
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // 这一层还有活着的 Boss 吗（Boss 层才播 BGM）
  function floorBossAlive(s) {
    const f = D.floors[s.floor];
    if (!f || !f.boss) return null;
    return s.flags['bossKilled_' + f.boss] ? null : D.monsters[f.boss];
  }

  // 最近的有商人的楼层（打不过时的提示）
  function nearestShopFloor(floor) {
    const list = D.floors.map((f, i) => (f.map.join('').includes('M') ? i + 1 : 0)).filter(Boolean);
    const below = list.filter((n) => n <= floor + 1);
    return below.length ? below[below.length - 1] : (list[0] || 3);
  }

  function enterFloor(first) {
    const s = Engine.state();
    const f = D.floors[s.floor];
    Renderer.fade(first ? 420 : 320);
    Renderer.setAmbient(s.floor);
    if (floorBossAlive(s)) Sound.startMusic();
    else Sound.stopMusic();
    Sound.setPad(s.floor);
    Sound.setMotif(s.floor);

    if (!first) log(`来到第 ${s.floor + 1} 层 · ${f.name}`, 'gold');
    log(f.tip);
    showFloorCard(s.floor);

    Engine.beginFloor();

    // 章节入口 + 关键剧情。F4 是第二章开头，接烛的第二段。
    const seq = [];
    if (s.floor === 3) {
      if (!s.flags.ch2) { s.flags.ch2 = true; seq.push('ch2'); }
      if (!s.flags.candle2) { s.flags.candle2 = true; s.flags.secret1 = true; seq.push('candle2'); }
      if (seq.length) {
        Engine.save();
        Achievements.evaluate('floor', s, notifyAchievement);
        playSequence(seq);
        return;
      }
    }
    if (s.floor === 6 && !s.flags.ch3) {
      s.flags.ch3 = true;
      Engine.save();
      playStory('ch3');
      return;
    }
    if (s.floor === 9 && !s.flags.ch4) {
      s.flags.ch4 = true;
      Engine.save();
      playStory('ch4');
      return;
    }
    if (s.floor === 12 && !s.flags.core) {
      s.flags.core = true;
      Engine.save();
      playStory('core');
      return;
    }
    if (s.floor === 4 && !s.flags.solo5) {
      s.flags.solo5 = true;
      Engine.save();
      playStory('solitude');
    }
  }

  function act(dx, dy) {
    if (battleBusy) return;
    if (shopOpen || endShown) return;
    if (typing || el.dialogOverlay.classList.contains('show')) { advanceDialog(); return; }
    const s = Engine.state();
    if (!s || s.over || s.won) return;
    const ev = Engine.tryMove(dx, dy);
    const T = TN();
    switch (ev.type) {
      case 'idle':
        return;
      case 'blocked':
        Sound.play('lock');
        return;
      case 'battle':
        resolveBattle(dx, dy);
        return;
      case 'locked':
        Sound.play('lock');
        Renderer.flashTile(s.x + dx, s.y + dy, 'rgba(255,255,255,0.25)', 200);
        log(ev.msg, 'warn');
        return;
      case 'open':
        Sound.play('door');
        Renderer.burst((s.x + dx) * T + T / 2, (s.y + dy) * T + T / 2, {
          count: 9, colors: ['#c9a23a', '#e8d27d', '#8a6a18'], speed: 90, life: [300, 620], size: [1.5, 3],
        });
        log(ev.msg, 'good');
        break;
      case 'floor':
        Sound.play('door');
        enterFloor(false);
        break;
      case 'story':
        Sound.play('pick');
        if (ev.msg) log(ev.msg, 'good');
        Renderer.ring(Engine.state().x, Engine.state().y, 'rgba(159,216,255,0.8)', T * 2, 480);
        playStory(ev.story);
        break;
      case 'relic':
        relicShowcase(Engine.state().x, Engine.state().y);
        Sound.play('relic');
        log(ev.msg, 'gold');
        warn(ev.msg);
        Tips.show('relic');
        Achievements.evaluate('relic', Engine.state(), notifyAchievement);
        if (ev.story) playStory(ev.story);
        break;
      case 'pickup':
        Sound.play('pick');
        Renderer.addFloat(ev.short || ev.msg, Engine.state().x * T + T / 2, Engine.state().y * T, '#9fe8b0');
        log(ev.msg, 'good');
        break;
      case 'altar':
        openAltar();
        break;
      case 'heart':
        openHeart();
        break;
      case 'event':
        openEvent(ev.eventId);
        break;
      case 'shop':
        if (s.floor === 2 && !s.flags.merchant) {
          s.flags.merchant = true;
          Engine.save();
          playStory('merchant', () => { Sound.play('buy'); openShop(); });
        } else if (s.floor === 7 && !s.flags.merchant2) {
          s.flags.merchant2 = true;
          Engine.save();
          playStory('merchant2', () => { Sound.play('buy'); openShop(); });
        } else {
          openShop();
        }
        break;
      case 'princess':
        if (ev.hasJournal) playStory('princessTrue', () => showEndingChoice());
        else playStory('princessPlain', () => completeEnding('plain', false));
        return;
      case 'move':
        Sound.play('step');
        if (Math.random() < 0.5) {
          Renderer.burst(Engine.state().x * T + T / 2, Engine.state().y * T + T * 0.8, {
            count: 2, colors: ['#5a6478', '#464f61'], speed: 30, life: [240, 420], grav: 60, size: [1, 2], spread: Math.PI,
          });
        }
        break;
    }
    refreshHud();
  }

  // ---------- 输入 ----------
  let lastKeyAt = 0;
  function bindInput() {
    el.dialogOverlay.addEventListener('click', advanceDialog);
    $('dlgSkip').addEventListener('click', (e) => { e.stopPropagation(); skipDialog(); });
    $('dlgPrev').addEventListener('click', (e) => { e.stopPropagation(); prevDialog(); });

    // 切回标签页时音频上下文可能被系统挂起：恢复并重排一次音乐
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { Sound.stopMotif(); return; }
      const st = Engine.state();
      if (!st || !Settings.music) return;
      Sound.setPad(st.floor);
      Sound.setMotif(st.floor);
      if (floorBossAlive(st)) Sound.startMusic();
    });

    window.addEventListener('keydown', (e) => {
      if (el.startOverlay.classList.contains('show')) return;
      if (el.dialogOverlay.classList.contains('show') || typing) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceDialog(); }
        else if (e.key === 'Escape') skipDialog();
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); prevDialog(); }
        return;
      }
      if (el.echoOverlay.classList.contains('show')) {
        if (e.key >= '1' && e.key <= '3') {
          e.preventDefault();
          const b = el.echoRings.children[Number(e.key) - 1];
          if (b) chooseRing(b.dataset.id);
        } else if ((e.key === 'Enter' || e.key === ' ') && el.echoClose.hidden === false) {
          e.preventDefault();
          closeEcho();
        }
        return;
      }
      if (el.heartOverlay.classList.contains('show')) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setHeartFocus('take'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setHeartFocus('leave'); }
        else if (e.key === 'Enter' && heartFocus) { e.preventDefault(); chooseHeart(heartFocus); }
        return;
      }
      if (el.choiceOverlay.classList.contains('show')) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setChoiceFocus('plain'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setChoiceFocus('true'); }
        else if (e.key === 'Enter' && choiceFocus) { e.preventDefault(); chooseEnding(choiceFocus); }
        return;
      }
      if (endShown) return;
      if (shopOpen) { if (e.key === 'Escape') closeShop(); return; }
      if (el.cfgOverlay.classList.contains('show')) { if (e.key === 'Escape') closeCfg(); return; }
      if (el.boardOverlay.classList.contains('show')) { if (e.key === 'Escape') closeBoard(); return; }
      if (el.codexOverlay.classList.contains('show')) { if (e.key === 'Escape') el.codexOverlay.classList.remove('show'); return; }

      const k = e.key.toLowerCase();
      let d = null;
      if (k === 'arrowup' || k === 'w') d = dirs.up;
      else if (k === 'arrowdown' || k === 's') d = dirs.down;
      else if (k === 'arrowleft' || k === 'a') d = dirs.left;
      else if (k === 'arrowright' || k === 'd') d = dirs.right;
      if (d) {
        e.preventDefault();
        const now = performance.now();
        if (e.repeat && now - lastKeyAt < 95) return; // 键盘重复降速，避免一步三格
        lastKeyAt = now;
        stopWalk();
        act(d[0], d[1]);
      }
    });

    // 方向键：长按连走（320ms 后每 135ms 一格）
    document.querySelectorAll('#dpad button').forEach((b) => {
      let holdDelay = null, holdTimer = null;
      const start = (e) => {
        e.preventDefault();
        if (holdDelay || holdTimer) return;
        const d = dirs[b.dataset.dir];
        if (!d) return;
        stopWalk();
        act(d[0], d[1]);
        holdDelay = setTimeout(() => {
          holdDelay = null;
          holdTimer = setInterval(() => {
            const d2 = dirs[b.dataset.dir];
            if (d2) act(d2[0], d2[1]);
          }, 135);
        }, 320);
      };
      const end = () => {
        clearTimeout(holdDelay); holdDelay = null;
        clearInterval(holdTimer); holdTimer = null;
      };
      b.addEventListener('pointerdown', start);
      b.addEventListener('pointerup', end);
      b.addEventListener('pointerleave', end);
      b.addEventListener('pointercancel', end);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    el.canvas.addEventListener('click', (e) => {
      const s = Engine.state();
      if (!s || shopOpen || endShown || battleBusy) return;
      if (el.dialogOverlay.classList.contains('show') || el.codexOverlay.classList.contains('show') ||
          el.cfgOverlay.classList.contains('show') || el.choiceOverlay.classList.contains('show') ||
          el.echoOverlay.classList.contains('show')) return;
      const rect = el.canvas.getBoundingClientRect();
      const size = rect.width / 11;
      const x = Math.floor((e.clientX - rect.left) / size);
      const y = Math.floor((e.clientY - rect.top) / size);
      if (x < 0 || y < 0 || x > 10 || y > 10) return;
      clickMove(x, y);
    });

    $('shopClose').addEventListener('click', closeShop);
    $('choicePlain').addEventListener('click', () => chooseEnding('plain'));
    $('choiceTrue').addEventListener('click', () => chooseEnding('true'));
    el.heartTake.addEventListener('click', () => { setHeartFocus('take'); chooseHeart('take'); });
    el.heartLeave.addEventListener('click', () => { setHeartFocus('leave'); chooseHeart('leave'); });
    $('btnBoard').addEventListener('click', openBoard);
    $('btnBoard2').addEventListener('click', openBoard);
    $('btnBoard3').addEventListener('click', openBoard);
    $('echoClose').addEventListener('click', closeEcho);
    el.echoOverlay.addEventListener('click', (e) => {
      if (e.target === el.echoOverlay && curEcho && !curEcho.pending) closeEcho();
    });
    $('boardClose').addEventListener('click', closeBoard);
    $('btnPasteCode').addEventListener('click', pasteChallenge);
    $('pasteCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.stopPropagation(); pasteChallenge(); }
    });
    $('btnCodex').addEventListener('click', openCodex);
    $('codexClose').addEventListener('click', () => el.codexOverlay.classList.remove('show'));
    $('btnCopyCode').addEventListener('click', () => {
      const codeEl2 = $('myCode');
      const code = codeEl2.textContent;
      if (!code || code.startsWith('——')) return;
      const fallback = () => {
        // 剪贴板不可用（file://、部分 WebView）：选中文本让用户自己复制
        try {
          const range = document.createRange();
          range.selectNodeContents(codeEl2);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          log('已选中挑战码，长按/Ctrl+C 复制', 'good');
        } catch (e) { log('复制失败，请手动复制', 'warn'); }
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => log('挑战码已复制', 'good'), fallback);
      } else fallback();
    });
    $('btnCfg').addEventListener('click', openCfg);
    $('cfgClose').addEventListener('click', closeCfg);
    $('btnHelp').addEventListener('click', () => { openCfg(); });
    $('btnReset').addEventListener('click', () => {
      Engine.reset();
      $('btnContinue').style.display = 'none';
      log('存档已清空');
      warn('存档已清空（成就、结局与余烬保留）');
    });
    $('cfgWipe').addEventListener('click', () => {
      Engine.reset();
      Achievements.reset();
      Tips.reset();
      try { localStorage.removeItem('towermates_board'); } catch (e) {}
      $('btnContinue').style.display = 'none';
      refreshStartBadges();
      refreshCfg();
      warn('已清空存档、成就与榜单');
    });
    // 重置游戏：放弃当前这一局并从头开始（保留成就、余烬与解锁）。统一走二次确认弹层
    function doResetRun() {
      Sound.stopMotif();
      Sound.setPad(-1);
      Sound.stopMusic();
      const n = Meta.incReset();
      Engine.reset();
      $('btnContinue').style.display = 'none';
      closeCfg();
      openVow();
      log('已重置本局 · 从头开始', 'gold');
      warn(`本局已重置（成就、余烬与解锁保留）· 第 ${n} 次重来`);
    }
    $('cfgReset').addEventListener('click', () => { el.resetConfirmOverlay.classList.add('show'); });
    $('btnResetRun').addEventListener('click', () => { el.resetConfirmOverlay.classList.add('show'); });
    $('resetCancel').addEventListener('click', () => { el.resetConfirmOverlay.classList.remove('show'); });
    $('resetConfirm').addEventListener('click', () => {
      el.resetConfirmOverlay.classList.remove('show');
      doResetRun();
    });
    $('gateClose').addEventListener('click', () => el.gateOverlay.classList.remove('show'));
    $('btnAgain').addEventListener('click', () => {
      el.endOverlay.classList.remove('show');
      Engine.reset();
      openVow();
    });
    $('cfgRetry').addEventListener('click', () => {
      const ok = Engine.restoreFloor();
      closeCfg();
      if (!ok) { warn('没有可回到的本层起点'); return; }
      const s = Engine.state();
      Renderer.setAmbient(s.floor);
      Renderer.fade(420);
      refreshHud();
      s.flags.retries = (s.flags.retries || 0) + 1;
      Engine.save();
      log(`退回第 ${s.floor + 1} 层入口`, 'gold');
      warn('已退回本层入口');
    });

    // 设置行
    $('cfgFx').addEventListener('click', () => { Settings.cycleFx(); refreshCfg(); });
    $('cfgSfx').addEventListener('click', () => {
      Settings.toggleSfx();
      refreshCfg();
    });
    $('cfgMusic').addEventListener('click', () => {
      Settings.toggleMusic();
      const st = Engine.state();
      if (!Settings.music) { Sound.stopMusic(); Sound.setPad(-1); Sound.stopMotif(); }
      else if (st) { Sound.setPad(st.floor); Sound.setMotif(st.floor); if (floorBossAlive(st)) Sound.startMusic(); }
      refreshCfg();
    });
    $('cfgVib').addEventListener('click', () => { Settings.toggleVib(); refreshCfg(); vibrate(12); });
    $('cfgCritters').addEventListener('click', () => { Settings.toggleCritters(); refreshCfg(); });
    $('cfgFast').addEventListener('click', () => { Settings.toggleFast(); refreshCfg(); });
  }

  function openCfg() {
    refreshCfg();
    el.cfgOverlay.classList.add('show');
  }
  function closeCfg() { el.cfgOverlay.classList.remove('show'); }
  function refreshCfg() {
    $('cfgFxVal').textContent = Settings.fx === 'low' ? '减弱' : '全开';
    $('cfgFxVal').className = Settings.fx === 'low' ? 'off' : '';
    $('cfgSfxVal').textContent = Settings.sfx ? '开' : '关';
    $('cfgSfxVal').className = Settings.sfx ? '' : 'off';
    $('cfgMusicVal').textContent = Settings.music ? '开' : '关';
    $('cfgMusicVal').className = Settings.music ? '' : 'off';
    $('cfgVibVal').textContent = Settings.vib ? '开' : '关';
    $('cfgVibVal').className = Settings.vib ? '' : 'off';
    $('cfgCrittersVal').textContent = Settings.critters ? '开' : '关';
    $('cfgCrittersVal').className = Settings.critters ? '' : 'off';
    $('cfgFastVal').textContent = Settings.fast ? '开（演出 ×0.42）' : '关';
    $('cfgFastVal').className = Settings.fast ? '' : 'off';
    const s = Engine.state();
    $('cfgRelics').innerHTML = RELIC_ORDER.map((id) => {
      const r = D.relics[id];
      const on = s && s.flags['relic_' + id];
      return `<div class="cfg-relic ${on ? 'on' : ''}"><i>${on ? r.emoji : '○'}</i>${r.name}<span>${on ? r.desc : '未获得'}</span></div>`;
    }).join('') + Engine.rings().map((id) => {
      const r = D.rings[id];
      return `<div class="cfg-relic on ring"><i>${r.emoji}</i>${r.name}<span>${r.desc}</span></div>`;
    }).join('');
  }

  // 遮罩是否完全盖住画布（盖住时暂停重绘）
  const FULL_OVERLAYS = ['startOverlay', 'dialogOverlay', 'shopOverlay', 'boardOverlay',
    'codexOverlay', 'cfgOverlay', 'choiceOverlay', 'altarOverlay', 'heartOverlay', 'vowOverlay', 'eventOverlay', 'gateOverlay', 'echoOverlay', 'endOverlay', 'resetConfirmOverlay'];
  function covered() {
    for (const id of FULL_OVERLAYS) {
      if (el[id] && el[id].classList.contains('show')) return true;
    }
    return false;
  }

  // ---------- 立誓 ----------
  function openVow() {
    // 面板上明示当前余烬：锁着的誓约要花它，不写数量玩家只能瞎猜
    const emberLine = $('vowEmber');
    if (emberLine) {
      const locked = Object.keys(D.vows).filter((id) => D.vows[id].ember && !Meta.has(id));
      emberLine.textContent = locked.length
        ? `✦ 余烬 ${Meta.ember}${locked.length ? ` · 解锁下一条誓约还差 ${Math.max(0, D.vows[locked[0]].ember - Meta.ember)}` : ''}`
        : Meta.ember > 0 ? `✦ 余烬 ${Meta.ember} · 誓约已全解锁` : '';
      emberLine.hidden = !emberLine.textContent;
    }
    el.vowCards.innerHTML = Object.keys(D.vows).map((id) => {
      const v = D.vows[id];
      const locked = !!v.ember && !Meta.has(id);
      // 回报写成「通关余烬 +N」：看得见能拿什么，不用先懂倍率
      const rewardWord = v.reward >= 5 ? `<small>吃苦的那条，留下的最多</small>` : v.reward === 0 ? `<small>不加余烬</small>` : '';
      // 锁着的卡写明「有多少 / 要多少 / 还差多少」，和面板顶部的余烬数对得上
      const lockText = locked ? `🔒 ${v.ember} 余烬（有 ${Meta.ember} · 还差 ${Math.max(0, v.ember - Meta.ember)}）` : '';
      return `<button class="vow-card ${id === 'none' ? 'hero' : ''} ${locked ? 'locked' : ''}" data-vow="${id}">
        <span class="vc-emoji">${v.emoji}</span>
        <span class="vc-name">${v.name}</span>
        <span class="vc-desc">${v.desc}</span>
        ${locked
          ? `<span class="vc-lock">${lockText}</span>`
          : `<span class="vc-mul">通关余烬 +${v.reward || 0}${rewardWord}</span>`}
      </button>`;
    }).join('');
    el.vowCards.querySelectorAll('.vow-card').forEach((b) => {
      b.addEventListener('click', () => chooseVow(b.dataset.vow));
    });
    el.vowOverlay.classList.add('show');
  }

  function chooseVow(id) {
    const v = D.vows[id];
    if (v && v.ember && !Meta.has(id)) {
      const r = Meta.buy(id, v.ember);
      if (r === 'poor') { warn(`余烬不够：还差 ${v.ember - Meta.ember} 点`); return; }
      if (r === 'ok') {
        Sound.play('relic');
        vibrate([10, 24, 10]);
        warn(`**塔记住了你**：解锁「**${v.name}**」`, 5200);
      }
      openVow();
      return;
    }
    el.vowOverlay.classList.remove('show');
    startGame(id);
  }

  // ---------- 启动 ----------
  function startGame(vow) {
    Engine.newGame(vow);
    stopWalk();
    endShown = false;
    el.log.innerHTML = '';
    el.startOverlay.classList.remove('show');
    el.shopOverlay.classList.remove('show');
    el.endOverlay.classList.remove('show');
    el.choiceOverlay.classList.remove('show');
    refreshHud();
    const vs = D.vows[Engine.vow()] || D.vows.none;
    playStory('intro', () => {
      enterFloor(true);
      if (Engine.vow() !== 'none') log(`你立下了${vs.name}：${vs.desc}`, 'gold');
      log('你踏入了魔塔。塔顶传来极轻的、像铃声一样的声音。', 'gold');
      Tips.show('walk');
      setTimeout(() => Tips.show('goal'), 5600);
    });
  }

  function continueGame() {
    const s = Engine.load();
    if (!s) { openVow(); return; }
    el.startOverlay.classList.remove('show');
    endShown = false;
    el.log.innerHTML = '';
    log(`继续冒险 · 第 ${s.floor + 1} 层`, 'gold');
    Renderer.setAmbient(s.floor);
    Renderer.fade(400);
    refreshHud();
    if (s.won) showEnd();
    else resumePendingRing();
    if (floorBossAlive(s)) Sound.startMusic();
  }

  function boot() {
    Renderer.init(el.canvas);
    Renderer.layout(el.stage);
    window.addEventListener('resize', () => Renderer.layout(el.stage));
    if (window.ResizeObserver) new ResizeObserver(() => Renderer.layout(el.stage)).observe(el.stage);
    renderRelicRow(null);
    buildFloorDots();
    bindInput();
    refreshStartBadges();

    if (Engine.hasSave()) $('btnContinue').style.display = 'block';
    $('btnNew').addEventListener('click', openVow);
    $('btnContinue').addEventListener('click', continueGame);

    // 开发用：index.html#demo=楼层,x,y 直接进游戏（不播序章）
    const demo = /demo=(\d+),(\d+),(\d+)/.exec(location.hash || '');
    if (demo) {
      Engine.newGame();
      const st = Engine.state();
      st.floor = +demo[1];
      st.x = +demo[2];
      st.y = +demo[3];
      el.startOverlay.classList.remove('show');
      RefreshFloorDirect();
    }

    // 分享直达：?play=1 自动开局并跳过序章，落地即是可操作的地图
    // 不带此参数时仍走正常流程（开始界面 → 四选一誓约 → 序章）
    const qs = new URLSearchParams(location.search);
    if (!demo && qs.get('play') === '1') {
      startGame('none');
      skipDialog();
    }

    function RefreshFloorDirect() {
      const s = Engine.state();
      Renderer.setAmbient(s.floor);
      Engine.beginFloor();
      refreshHud();
      log(`第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}`, 'gold');
    }

    window.addEventListener('beforeunload', () => Engine.save());

    function loop() {
      const s = Engine.state();
      // 遮罩完全盖住画布时不重绘：省电，也避免后台空转掉帧
      const force = Renderer.needsDraw && Renderer.needsDraw();
      if (s && !document.hidden && (!covered() || force)) Renderer.draw(s);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // 开发/自动化用：暴露少量内部入口，便于截图与回归（不影响正常玩法）
  window.__tm = {
    playStory, showEnd, openShop, openCodex, openBoard, openCfg, closeCfg,
    showFloorCard, showEndingChoice, completeEnding, setChoiceFocus, openHeart, chooseHeart, setHeartFocus, openVow, chooseVow, openEvent, chooseEvent, openGate, jumpTo: (i) => doJump(i), Meta,
    resolveBattle, act, clickMove, refreshHud, refreshStartBadges,
    testRelicShowcase: () => { const st = Engine.state(); if (st) relicShowcase(st.x, st.y); },
    openEcho, chooseRing, closeEcho, resumePendingRing, setChapterColor, refreshCfg,
    // 提示系统：自动化可验证「加粗渲染 + 角色提示对白」
    richInto: renderRich, say, sayHint, warn, Tips,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
