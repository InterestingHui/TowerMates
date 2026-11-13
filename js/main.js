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
  let stuckInfo = null;   // 当前卡关指引 { key, vars, floor, monster }
  let stuckSayAt = 0;     // 同一卡点重复弹对白的节流
  const hintQueue = [];
  let choiceFocus = null;
  let heartFocus = null;

  // ---------- 设置 ----------
  // 提示停留：快 / 标准 / 慢，统一乘到对白、顶栏、药丸、成就吐司的时长上
  const HINT_SCALE = { fast: 0.6, normal: 1, slow: 1.7 };
  const HINT_SPEED_NAME = { fast: '快', normal: '标准', slow: '慢' };
  // 战斗演出速度档：0.55 慢（看得清每一刀）/ 1 标准 / 1.9 快（刷层党）
  const BATTLE_SPEED = { slow: 1.55, normal: 1, fast: 0.55 };
  const BATTLE_SPEED_NAME = { slow: '慢', normal: '标准', fast: '快' };
  const Settings = (() => {
    let data = { fx: 'full', sfx: true, music: true, vib: true, fast: false, critters: true, dpad: false, hintSpeed: 'normal', battleSpeed: 'normal', fullRounds: false };
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
      get dpad() { return data.dpad === true; },
      get hintSpeed() { return HINT_SCALE[data.hintSpeed] ? data.hintSpeed : 'normal'; },
      get battleSpeed() { return BATTLE_SPEED[data.battleSpeed] ? data.battleSpeed : 'normal'; },
      get fullRounds() { return data.fullRounds === true; },
      toggleFullRounds() { data.fullRounds = !(data.fullRounds === true); save(); return data.fullRounds === true; },
      cycleBattleSpeed() {
        const order = ['slow', 'normal', 'fast'];
        data.battleSpeed = order[(order.indexOf(this.battleSpeed) + 1) % order.length];
        save();
        return data.battleSpeed;
      },
      cycleHintSpeed() {
        const order = ['normal', 'fast', 'slow'];
        data.hintSpeed = order[(order.indexOf(this.hintSpeed) + 1) % order.length];
        save();
        return data.hintSpeed;
      },
      cycleFx() { data.fx = data.fx === 'full' ? 'low' : 'full'; save(); return data.fx; },
      toggleFast() { data.fast = !data.fast; save(); return data.fast; },
      toggleSfx() { data.sfx = !data.sfx; save(); return data.sfx; },
      toggleMusic() { data.music = !data.music; save(); return data.music; },
      toggleVib() { data.vib = !data.vib; save(); return data.vib; },
      toggleCritters() { data.critters = data.critters === false; save(); return data.critters !== false; },
      toggleDpad() { data.dpad = !(data.dpad === true); save(); return data.dpad; },
    };
  })();
  const REDUCED = () => Settings.fx === 'low';
  const hintMs = (base) => Math.round(base * (HINT_SCALE[Settings.hintSpeed] || 1));
  // 走路节奏：三套基准按入口的操作方式定（点击连走 105 / 方向键长按 135 / 键盘连按 95），
  // 开「快速模式」时一起收——不然打架压到 1.1s、走路还是老速度，刷层的手感全断在移动上。
  // 走路不肯跟演出一样砍到 ×0.42（44ms/格会糊成一片），收到 ×0.65 为止。
  const WALK_FAST = 0.65;
  const walkMs = (base) => Math.round(base * (Settings.fast ? WALK_FAST : 1));

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
        // 「重点教学」走棋盘标注（高亮格子 + 虚线 + 说明卡，点击才收）；
        // 其余仍是角色台词。标注内容在 S.coach[key]，缺稿时回退台词。
        if (S.coach && S.coach[key] && typeof S.coach[key].spot === 'function') {
          seen[key] = 1;
          save();
          Coach.show(key, S.coach[key]);
          return;
        }
        const lines = (S.hints && S.hints[key]) ||
          (S.tips && S.tips[key] ? [['烛', S.tips[key], 'calm']] : null);
        if (!lines) return;
        seen[key] = 1;
        save();
        say(lines);
      },
      // 战斗中不能弹全屏对白：改用底部常驻提示条，读完 6.5s 或下一条顶替
      // 支持自定义文案（opts.text）与变量替换（vars）：Boss 名号横幅不走提示库
      banner(key, vars, opts) {
        let text = null;
        if (opts && opts.text) {
          text = String(opts.text);
        } else {
          const lines = (S.hints && S.hints[key]) ||
            (S.tips && S.tips[key] ? [['烛', S.tips[key], 'calm']] : null);
          if (!lines) return;
          text = Array.isArray(lines[0]) ? lines[0][1] : lines[0];
        }
        if (vars) text = text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
        const g = $('guide');
        renderRich($('guideText'), text);
        g.classList.add('show');
        clearTimeout(guideTimer);
        guideTimer = setTimeout(() => g.classList.remove('show'), hintMs(6500));
      },
      mark(key) { if (seen[key]) return false; seen[key] = 1; save(); return true; },
      seen(key) { return !!seen[key]; },
      // walk 教学走 banner 不走对白，但同样只出一次（与 seen 库同源）
      showWalkBanner() { if (seen.walk) return false; seen.walk = 1; save(); this.banner('walk'); return true; },
      reset() { seen = {}; try { localStorage.removeItem(KEY); } catch (e) {} },
    };
  })();

  // ---------- 音效 ----------
  // 塔的记忆：跨局保存的「余烬」，用来解锁誓约 / 点亮层灯，都只影响外观与收藏，不卖战力
  // memory 记跨局履历（结局数/誓约通关/回响满章/塔心取舍/近几局余烬/首通/层灯）
  const LAMP_COST = 20;   // 点亮一盏灯要花的余烬
  const LAMP_MAX = 13;    // 一层一盏，纯收藏，全解锁后的余烬出口
  const Meta = (() => {
    const KEY = 'towermates_meta';
    const blank = () => ({ runs: 0, endings: {}, vowWins: {}, fullChapters: 0, heartTaken: 0, heartLeft: 0, deepest: 0, fastest: 0, bestSeal: '', emberRuns: [], firstVowWin: {}, lamps: 0, seenRelics: [], seenRings: [], marginCounts: {}, marginBest: '' });
    let data = { ember: 0, unlocked: [], resets: 0, memory: blank() };
    try { data = Object.assign(data, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
    if (!data.memory) data.memory = blank();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} };
    const mem = data.memory;
    // 老档补默认值，不作废
    mem.emberRuns = Array.isArray(mem.emberRuns) ? mem.emberRuns : [];
    mem.firstVowWin = mem.firstVowWin || {};
    mem.endings = mem.endings || {};
    mem.vowWins = mem.vowWins || {};
    mem.lamps = mem.lamps || 0;
    // 折戟账：死亡次数与上一次倒下的层（老档补 0，不作废）
    mem.falls = mem.falls || 0;
    mem.lastFallFloor = mem.lastFallFloor || 0;
    // 收藏图鉴：见过的遗物/锁环跨局累计（老档补空数组，不作废）
    mem.seenRelics = Array.isArray(mem.seenRelics) ? mem.seenRelics : [];
    mem.seenRings = Array.isArray(mem.seenRings) ? mem.seenRings : [];
    // 锁环使用统计：{ id: { picks, wins } }——图鉴卡片上显示「选过 N 次 · 通关 M 次」
    mem.ringStats = (mem.ringStats && typeof mem.ringStats === 'object') ? mem.ringStats : {};
    // 决战余裕跨局统计（老档补空，不作废）
    mem.marginCounts = (mem.marginCounts && typeof mem.marginCounts === 'object') ? mem.marginCounts : {};
    mem.marginBest = mem.marginBest || '';
    return {
      get ember() { return data.ember || 0; },
      get resets() { return data.resets || 0; },
      get memory() { return mem; },
      get lamps() { return mem.lamps || 0; },
      get emberRuns() { return mem.emberRuns; },
      // 记一笔收藏：拿到过就永久留档（跨局，不与本局输赢绑定）
      seenRelic(id) {
        if (!id || mem.seenRelics.indexOf(id) >= 0) return false;
        mem.seenRelics.push(id); save(); return true;
      },
      seenRing(id) {
        if (!id || mem.seenRings.indexOf(id) >= 0) return false;
        mem.seenRings.push(id); save(); return true;
      },
      // 锁环被选中 / 带它通关各记一笔（统计只增不减，清档时才归零）
      ringPicked(id) {
        if (!id) return;
        const st = mem.ringStats[id] || (mem.ringStats[id] = { picks: 0, wins: 0 });
        st.picks += 1; save();
      },
      ringWin(ids) {
        if (!Array.isArray(ids) || !ids.length) return;
        ids.forEach((id) => {
          const st = mem.ringStats[id] || (mem.ringStats[id] = { picks: 0, wins: 0 });
          st.wins += 1;
        });
        save();
      },
      ringStat(id) { return mem.ringStats[id] || null; },
      saveMemory() { save(); },
      // 近 3 局平均，没记录时用常规通关的保守值 18
      avgEmber() {
        if (!mem.emberRuns.length) return 18;
        return Math.max(1, Math.round(mem.emberRuns.reduce((a, b) => a + b, 0) / mem.emberRuns.length));
      },
      hasFirstWin(id) { return !!mem.firstVowWin[id]; },
      claimFirstWin(id) {
        if (mem.firstVowWin[id]) return false;
        mem.firstVowWin[id] = true;
        save();
        return true;
      },
      lightLamp(cost) {
        if (mem.lamps >= LAMP_MAX) return 'full';
        if ((data.ember || 0) < cost) return 'poor';
        data.ember -= cost;
        mem.lamps += 1;
        save();
        return 'ok';
      },
      has(id) { return (data.unlocked || []).indexOf(id) >= 0; },
      add(n) { data.ember = Math.max(0, (data.ember || 0) + n); save(); },
      incReset() { data.resets = (data.resets || 0) + 1; save(); return data.resets; },
      // 结算一次跨局履历：记走了多远、用了多久、刻下哪枚塔印、这局拿了多少余烬
      recordRun(rec) {
        mem.runs = (mem.runs || 0) + 1;
        mem.endings[rec.ending] = (mem.endings[rec.ending] || 0) + 1;
        if (rec.won) mem.vowWins[rec.vow] = (mem.vowWins[rec.vow] || 0) + 1;
        // 上局誓约：立誓卡标「上局」角标——重开的人一眼认出自己那条，不用每局重新认卡
        if (rec.vow) mem.lastVow = rec.vow;
        // 折戟账：死亡局计一次数 + 记下倒在哪层（收藏感——「折戟 ×N」是履历的一部分）
        if (rec.seal === 'fall') {
          mem.falls = (mem.falls || 0) + 1;
          mem.lastFallFloor = rec.floor != null ? rec.floor : mem.lastFallFloor || 0;
        }
        mem.fullChapters = Math.max(mem.fullChapters || 0, Math.min(4, rec.fullChapters || 0));
        if (rec.heart === 'taken') mem.heartTaken = (mem.heartTaken || 0) + 1;
        if (rec.heart === 'left') mem.heartLeft = (mem.heartLeft || 0) + 1;
        mem.deepest = Math.max(mem.deepest || 0, rec.floor || 0);
        if (rec.time > 0) mem.fastest = mem.fastest ? Math.min(mem.fastest, rec.time) : rec.time;
        const rank = ['', 'fall', 'rough', 'name', 'ward', 'clear'];
        if (rank.indexOf(rec.seal) > rank.indexOf(mem.bestSeal || '')) mem.bestSeal = rec.seal;
        if (typeof rec.ember === 'number') {
          mem.emberRuns.push(rec.ember);
          if (mem.emberRuns.length > 3) mem.emberRuns.shift();
        }
        // 决战余裕：只在通关局记（败局没有 finalHp），按 S/A/B/C 累计，跨局看「打得最干净的一档」
        if (rec.won && /^[SABC]$/.test(rec.margin || '')) {
          const g = rec.margin;
          mem.marginCounts[g] = (mem.marginCounts[g] || 0) + 1;
          const rank = ['', 'C', 'B', 'A', 'S'];
          if (rank.indexOf(g) > rank.indexOf(mem.marginBest || '')) mem.marginBest = g;
        }
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
      // 小生物受惊：一声很轻的上滑啾鸣，像虫子惊飞的动静
      flit: () => { beep(720, 0.1, 'sine', 0.02, 1500); beep(1080, 0.07, 'sine', 0.012, 1900, 0.03); },
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

  // 高光时刻编排：拾取遗物（金）与 Boss 倒下（红）共用一套舞台，
  // 只换色调——星芒光柱 → 全景闪 → 顶栏金晕 → 冲击环+尘粒+freeze。
  let relicGlowTimer = null;
  let relicFadeTimer = null;
  function relicShowcase(x, y, mood) {
    const T = TN();
    const red = mood === 'boss';
    const beam = red ? ['#ff9f8f', '#ffd2c2', '#ffb09f'] : ['#fff4d6', '#ffe6a8', '#ffd27d'];
    const flash = red ? 'relicFlash red' : 'relicFlash';
    Renderer.freeze(90);
    Renderer.relicBeamFx(x, y, red ? 'boss' : 'relic');
    if (!REDUCED()) {
      Renderer.shake(red ? 220 : 160, red ? 4 : 3);
      Renderer.pulse();
      const f = el.relicFlash;
      if (f) {
        clearTimeout(relicGlowTimer);
        clearTimeout(relicFadeTimer);
        f.className = flash;
        relicGlowTimer = setTimeout(() => {
          f.classList.remove('on');
          f.classList.add('fade');
          relicFadeTimer = setTimeout(() => { f.classList.remove('fade'); f.className = 'relicFlash'; }, 650);
        }, red ? 220 : 160);
      }
      if (el.topbar) {
        el.topbar.classList.remove('relic-hit');
        void el.topbar.offsetWidth; // 重置动画
        el.topbar.classList.add(red ? 'boss-hit' : 'relic-hit');
        setTimeout(() => el.topbar.classList.remove('relic-hit', 'boss-hit'), 1150);
      }
    }
    Renderer.ring(x, y, red ? 'rgba(255,150,130,0.95)' : 'rgba(255,236,180,0.95)', T * (red ? 3.6 : 3.1), red ? 700 : 620);
    Renderer.burst(x * T + T / 2, y * T + T / 2, {
      count: REDUCED() ? 14 : red ? 42 : 34,
      colors: red ? ['#ffd8cc', '#ff9f8f', '#e87060', '#c94a52'] : beam.concat('#e8c46a'),
      speed: red ? 200 : 170, life: [600, red ? 1400 : 1250], size: [2, 5.5], grav: 130,
    });
    vibrate(red ? [18, 40, 18] : [14, 30, 14]);
  }

  function vibrate(ms) {
    if (!Settings.vib) return;
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  const el = {
    stage: $('stage'), canvas: $('game'),
    floorName: $('floorName'), floorDots: $('floorDots'),
    statAtk: $('statAtk'), statDef: $('statDef'), statGold: $('statGold'),
    statLv: $('statLv'),
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
    bsBlock: $('bsBlock'), blockPip: $('blockPip'), compassPip: $('compassPip'), scopePip: $('scopePip'),
    bsPanel: document.querySelector('.bs-panel'),
    guide: $('guide'),
    stuckBar: $('stuckBar'), stuckText: $('stuckText'),
    hintBookOverlay: $('hintBookOverlay'),
    ringRow: $('ringRow'),
    echoOverlay: $('echoOverlay'), echoKicker: $('echoKicker'), echoLine: $('echoLine'),
    echoReward: $('echoReward'), echoRings: $('echoRings'),
    echoHint: $('echoHint'), echoClose: $('echoClose'),
    resetConfirmOverlay: $('resetConfirmOverlay'),
    collectionOverlay: $('collectionOverlay'), colBody: $('colBody'), colCount: $('colCount'),
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

  // ---------- 新手标注：高亮一块真格子，虚线拉到说明卡，点击「知道了」才收 ----------
  // 不用对白、不自动消失——玩家得先看见游戏画面，才谈得上学会操作。
  const Coach = (() => {
    let active = false;
    let onResize = null;
    function layout(def) {
      const s = Engine.state();
      if (!s) return;
      const stage = el.stage;
      const rect = stage.getBoundingClientRect();
      const svg = $('coachSvg');
      const card = $('coachCard');
      svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
      svg.innerHTML = '';
      const spot = def.spot(s);
      let cx, cy, T;
      T = Renderer.getTile();
      const board = T * 11;
      const ox = (rect.width - board) / 2;   // 棋盘在 stage 里的横向起点
      const oy = (rect.height - board) / 2;
      cx = ox + spot.x * T + T / 2;
      cy = oy + spot.y * T + T / 2;
      // 卡片摆位：目标在左半→卡片放右侧；在上半→卡片放下方；反之亦然
      svg.innerHTML = `<circle class="coach-spot" cx="${cx}" cy="${cy}" r="${T * 0.62}"></circle>`;
      card.hidden = false;
      card.style.left = 'auto';
      card.style.top = 'auto';
      card.style.right = 'auto';
      card.style.bottom = 'auto';
      const cw = card.offsetWidth, chh = card.offsetHeight;
      const margin = 10;
      const onLeft = cx > rect.width / 2;
      const onTop = cy > rect.height / 2;
      const cardX = onLeft ? Math.max(margin, cx - T - cw - margin) : Math.min(rect.width - cw - margin, cx + T + margin);
      const cardY = onTop ? Math.max(margin, cy - T - chh - margin) : Math.min(rect.height - chh - margin, cy + T + margin);
      card.style.left = `${Math.round(cardX)}px`;
      card.style.top = `${Math.round(cardY)}px`;
      // 虚线：从高亮圈边缘连到卡片最近的角
      const nearX = Math.max(cardX, Math.min(cx, cardX + cw));
      const nearY = Math.max(cardY, Math.min(cy, cardY + chh));
      const ang = Math.atan2(nearY - cy, nearX - cx);
      const sx = cx + Math.cos(ang) * T * 0.66;
      const sy = cy + Math.sin(ang) * T * 0.66;
      svg.innerHTML += `<line class="coach-line" x1="${sx}" y1="${sy}" x2="${nearX}" y2="${nearY}"></line>`;
    }
    function close() {
      active = false;
      window.removeEventListener('resize', onResize);
      $('coachSvg').hidden = true;
      $('coachSvg').innerHTML = '';
      $('coachCard').hidden = true;
    }
    return {
      supported(key) { return !!(S.coach && S.coach[key] && typeof S.coach[key].spot === 'function'); },
      show(key, def) {
        const s = Engine.state();
        if (!s) return;
        active = true;
        $('coachTitle').textContent = def.title || '指引';
        renderRich($('coachText'), def.text || '');
        $('coachOk').textContent = def.okText || '知道了';
        layout(def);
        onResize = () => { if (active) layout(def); };
        window.addEventListener('resize', onResize);
        $('coachOk').onclick = () => {
          if (!active) return;
          Sound.play('buy');
          const after = def.after;
          close();
          if (after) after();
        };
      },
      closeNow: close,
      get active() { return active; },
    };
  })();

  // ---------- 顶部提示（纯操作反馈；长句给足阅读时间） ----------
  function warn(msg, ms) {
    const p = el.warnPill;
    if (!p) return;
    renderRich(p, msg);
    p.classList.add('show');
    clearTimeout(warnTimer);
    const dur = hintMs(ms || (p.textContent.length > 26 ? 4800 : 3200));
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
    const autoMs = opts && opts.autoMs != null ? opts.autoMs : hintMs(HINT_AUTO_MS);
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
    }, hintMs((def.desc || '').length > 18 ? 3200 : 2400));
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
    renderRich(div, msg);
    el.log.appendChild(div);
    while (el.log.children.length > 7) el.log.removeChild(el.log.firstChild);
  }

  // ---------- HUD ----------
  // 遗物全表顺序 = 顶栏 chip / 设置页列表 / 收藏图鉴共用一份。
  // cross 与 coin 曾漏在这张表外——玩家拿了旧十字架/幸运金币，顶栏根本不显示 chip（已修）。
  const RELIC_ORDER = ['ward', 'edge', 'ember', 'steel', 'thrift', 'vigor', 'scout', 'gate', 'heart', 'cross', 'coin'];
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
    // 触屏没有 hover：点一下就念出这件遗物的说明（gate 有自己的面板，不参与）
    el.relicRow.querySelectorAll('.relic[data-relic]').forEach((chip) => {
      const id = chip.dataset.relic;
      if (id === 'gate') return;
      chip.addEventListener('click', () => {
        const r = D.relics[id];
        if (r) warn(`${r.emoji} **${r.name}**：${r.desc}`);
      });
    });
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
    // 触屏没有 hover：点一下念出这枚锁环改了什么规则
    el.ringRow.querySelectorAll('.ring-chip[data-ring]').forEach((chip) => {
      const id = chip.dataset.ring;
      chip.addEventListener('click', () => {
        const r = D.rings[id];
        if (r) warn(`${r.emoji} **${r.name}**：${r.desc}`);
      });
    });
  }

  // ---------- 收藏图鉴：见过的遗物/锁环跨局累计 ----------
  // 记档时机放在 refreshHud：不管是祭坛、商店、跳层、事件还是回响拿到的，
  // 只要进了本局背包就自动留档——不用每个获取入口各写一遍。
  let collectSig = null;
  function rememberCollection(s) {
    if (!s) return;
    const owned = RELIC_ORDER.filter((id) => s.flags['relic_' + id]).join(',');
    const rings = Engine.rings().join(',');
    const sig = owned + '|' + rings;
    if (sig === collectSig) return; // 没变化就不写盘
    collectSig = sig;
    // 本局首次收录的，记一笔到 s.flags.collectNew —— 结算页写「本局新收录 X 件」，
    // 把「再玩一局」的动机从「通关」扩到「集齐图鉴」。
    const fresh = [];
    RELIC_ORDER.forEach((id) => {
      if (!s.flags['relic_' + id]) return;
      if (Meta.seenRelic(id)) fresh.push(D.relics[id].name);
    });
    Engine.rings().forEach((id) => { if (Meta.seenRing(id)) fresh.push(D.rings[id].name); });
    if (fresh.length) {
      s.flags.collectNew = (s.flags.collectNew || []).concat(fresh);
      // 图鉴首见：延后一点再弹，别和「获得遗物」「选锁环」的即时提示抢同一秒
      const names = fresh.slice(0, 3).join('、') + (fresh.length > 3 ? ` 等 ${fresh.length} 件` : '');
      setTimeout(() => warn(`🗂 **图鉴新收录**：${names}`), 900);
    }
  }

  function collectionText() {
    const mem = Meta.memory;
    const r = RELIC_ORDER.filter((id) => mem.seenRelics.indexOf(id) >= 0).length;
    const g = Object.keys(D.rings).filter((id) => mem.seenRings.indexOf(id) >= 0).length;
    return `遗物 ${r}/${RELIC_ORDER.length} · 锁环 ${g}/${Object.keys(D.rings).length}`;
  }
  // 行李堆随机池：from 带「随机」的遗物，一局只能见到三件里的三件，集齐靠多局碰
  const RANDOM_POOL = Object.keys(D.relics).filter((id) => (D.relics[id].from || '').indexOf('随机') >= 0);

  // 图鉴还差几件（遗物按全表算，锁环按数据表算）
  function collectionRemain() {
    const mem = Meta.memory;
    const r = RELIC_ORDER.filter((id) => mem.seenRelics.indexOf(id) >= 0).length;
    const g = Object.keys(D.rings).filter((id) => mem.seenRings.indexOf(id) >= 0).length;
    return (RELIC_ORDER.length - r) + (Object.keys(D.rings).length - g);
  }

  // 构筑档案：从 ringStats 里算「最常用的三枚」与「胜率最高的一枚」——
  // 玩家能看出自己偏爱什么、什么真的带得动，也给后续调平衡留真实样本。
  function ringStatBoard() {
    const mem = Meta.memory;
    const all = Object.keys(D.rings)
      .map((id) => {
        const st = mem.ringStats[id] || { picks: 0, wins: 0 };
        return { id, name: D.rings[id].name, emoji: D.rings[id].emoji, picks: st.picks, wins: st.wins };
      })
      .filter((r) => r.picks > 0);
    if (!all.length) {
      return '<div class="col-stat"><p class="col-group-title">构 筑 档 案</p>'
        + '<p class="cs-empty">还没选过锁环。打完章末的锁匠，会有三枚让你挑。</p></div>';
    }
    const totalPicks = all.reduce((a, r) => a + r.picks, 0);
    const totalWins = all.reduce((a, r) => a + r.wins, 0);
    const top = all.slice().sort((a, b) => b.picks - a.picks || b.wins - a.wins).slice(0, 3);
    // 胜率榜要求至少选过 2 次，避免「选 1 通 1 = 100%」的噪声
    const best = all.filter((r) => r.picks >= 2)
      .sort((a, b) => (b.wins / b.picks) - (a.wins / a.picks) || b.picks - a.picks)[0];
    return '<div class="col-stat"><p class="col-group-title">构 筑 档 案 · 共选 ' + totalPicks + ' 次</p>'
      + '<div class="col-stat-row"><span class="cs-label">最常用</span>'
      + top.map((t) => `<em>${t.emoji} ${t.name} <b>${t.picks}</b> 次</em>`).join('')
      + '</div>'
      + (best
        ? `<div class="col-stat-row"><span class="cs-label">胜率最高</span><em>${best.emoji} ${best.name} <b>${Math.round(best.wins / best.picks * 100)}%</b>（${best.wins}/${best.picks} 场通关）</em></div>`
        : '<div class="col-stat-row"><span class="cs-label">胜率最高</span><em class="cs-dim">同一枚至少选过两次才计入</em></div>')
      + (totalWins ? `<div class="col-stat-row"><span class="cs-label">带环通关</span><em>${totalWins} 次</em></div>` : '')
      + '</div>';
  }

  // 决战余裕档案：跨局累计 S/A/B/C，让「打得干净」成为可追的收藏项
  function marginStatBoard() {
    const mem = Meta.memory;
    const mc = mem.marginCounts || {};
    const total = ['S', 'A', 'B', 'C'].reduce((n, g) => n + (mc[g] || 0), 0);
    if (!total) {
      return '<div class="col-stat col-margin"><p class="col-group-title">决 战 余 裕</p>'
        + '<p class="cs-empty">还没走到结局。打完碑魔剩多少血，塔会替你记着。</p></div>';
    }
    const tally = ['S', 'A', 'B', 'C'].filter((g) => mc[g])
      .map((g) => `<em class="mg-${g}">${g} <b>${mc[g]}</b> 次</em>`).join('');
    return '<div class="col-stat col-margin"><p class="col-group-title">决 战 余 裕 · 共 ' + total + ' 次结局</p>'
      + '<div class="col-stat-row"><span class="cs-label">最好</span>'
      + `<em class="mg-${mem.marginBest || 'C'}">${mem.marginBest || '—'}</em>${tally}</div>`
      + '<div class="col-stat-row"><span class="cs-label">两条路</span><em class="cs-dim">清塔攒战意（决战减伤）· 绕道省血——塔不规定你怎么走</em></div>'
      + (mc.S ? '' : '<div class="col-stat-row"><span class="cs-label">拿 S</span><em class="cs-dim">击杀 ≥40 吃满战意，或把能绕的怪全绕开</em></div>')
      + '</div>';
  }

  // 成就墙：四区分组（战斗·收藏·誓约·折戟），亮卡与灰卡同网格——成就第一次有可浏览的家
  function achievementBoard() {
    const defs = Achievements.DEFS;
    const groups = [
      { title: '战 斗', test: (d) => ['first_blood', 'slayer10', 'slayer25', 'lv5', 'lv8', 'rich', 'shopper', 'keys3', 'boss', 'boss_yan', 'boss_duo', 'boss_heng', 'all_boss', 'floor12', 'dodger', 'sweeper'].indexOf(d.id) >= 0 },
      { title: '收 藏', test: (d) => ['secret1', 'secret2', 'journal', 'edge', 'edge_finish', 'heart_take', 'heart_leave', 'core', 'ring_first', 'ring_four', 'bare'].indexOf(d.id) >= 0 },
      { title: '誓 约', test: (d) => ['vow_mercy', 'vow_greed', 'vow_guard', 'vow_all', 'end_true', 'end_plain'].indexOf(d.id) >= 0 },
      { title: '折 戟', test: (d) => ['fall3', 'fall10'].indexOf(d.id) >= 0 },
    ];
    const got = (id) => Achievements.isUnlocked(id);
    let html = `<div class="col-group" id="colAch"><p class="col-group-title">成 就 · ${Achievements.count()}/${defs.length}</p>`;
    groups.forEach((g) => {
      const items = defs.filter(g.test);
      const n = items.filter((d) => got(d.id)).length;
      html += `<p class="ach-sub">${g.title} · ${n}/${items.length}</p><div class="col-grid">`;
      html += items.map((d) => `<button type="button" class="ach-card ${got(d.id) ? 'got' : 'off'}" data-ach="${d.id}" title="${d.desc}">
        <span class="cc-emoji">${got(d.id) ? d.emoji : '🔒'}</span>
        <span class="cc-name">${d.name}</span>
        <span class="cc-desc">${got(d.id) ? d.desc : '未解锁'}</span>
      </button>`).join('');
      html += '</div>';
    });
    return html + '</div>';
  }

  // 「下一件」：还没收录的东西里挑几件给玩家看（遗物优先——来源固定、可以计划）
  function collectionNext(max) {
    const mem = Meta.memory;
    const cap = max || 3;
    const out = [];
    // 固定来源的遗物排前面（可规划：下一局照着拿）；随机池的排后面并标注「随缘」
    RELIC_ORDER.forEach((id) => {
      if (out.length >= cap || mem.seenRelics.indexOf(id) >= 0) return;
      const rand = RANDOM_POOL.indexOf(id) >= 0;
      out.push({ kind: 'relic', id, name: D.relics[id].name, emoji: D.relics[id].emoji,
        from: rand ? D.relics[id].from + ' · 随缘' : D.relics[id].from, rand });
    });
    for (const ch of D.chapters) {
      if (out.length >= cap) break;
      Object.keys(D.rings).filter((id) => D.rings[id].chapter === ch.id).forEach((id) => {
        if (out.length >= cap || mem.seenRings.indexOf(id) >= 0) return;
        out.push({ kind: 'ring', id, name: D.rings[id].name, emoji: D.rings[id].emoji, from: `第 ${ch.id} 章 · 锁匠倒下后的三选一` });
      });
    }
    // 随机件不该占「下一件」的前三——它们没法规划，只有固定件不足时才顶上来
    out.sort((a, b) => (a.rand ? 1 : 0) - (b.rand ? 1 : 0));
    return out;
  }

  // 点卡片看详情：拿到过的给完整规则 + 来源；没拿到的给「去哪儿找」的线索
  function showColDetail(kind, id) {
    const box = $('colDetail');
    if (!box) return;
    const on = kind === 'relic'
      ? Meta.memory.seenRelics.indexOf(id) >= 0
      : Meta.memory.seenRings.indexOf(id) >= 0;
    const r = kind === 'relic' ? D.relics[id] : D.rings[id];
    if (!r) return;
    const from = kind === 'relic'
      ? (r.from || '')
      : `第 ${r.chapter} 章 · 锁匠倒下后的三选一`;
    box.innerHTML = `<span class="cd-emoji">${on ? r.emoji : '❔'}</span>
      <div class="cd-main"><b>${r.name}${on ? '' : ' · 未获得'}</b><span class="cd-desc"></span></div>
      <span class="cd-from">${from}</span>`;
    // 描述走富文本：以后有人在 desc 里写 **重点** 也不会把星号原样漏出来
    renderRich(box.querySelector('.cd-desc'), on ? r.desc : '还没拿到过——先照着下面的线索去试试。');
    box.classList.add('show');
    // 同一张卡再点一次收起；点别处也收起
    box._id = kind + ':' + id;
  }

  function openCollection() {
    const mem = Meta.memory;
    const card = (kind, id, r, on, extraCls) => `<button type="button" class="col-card ${on ? 'got' : 'off'}${extraCls ? ' ' + extraCls : ''}" data-kind="${kind}" data-id="${id}">
      <span class="cc-emoji">${on ? r.emoji : '❔'}</span>
      <span class="cc-name">${r.name}</span>
      <span class="cc-desc">${on ? r.desc : '未获得'}</span>
    </button>`;
    const next = collectionNext(3);
    let html = next.length
      ? '<div class="col-next"><p class="col-group-title">下 一 件</p><div class="col-next-row">'
        + next.map((n) => `<button type="button" class="col-next-chip" data-kind="${n.kind}" data-id="${n.id}">
            <span class="cn-emoji">${n.emoji}</span><span class="cn-name">${n.name}</span>
            <em class="cn-from">${n.from}</em></button>`).join('')
        + '</div></div>'
      : '';
    html += ringStatBoard();
    html += marginStatBoard();
    // 分区跳转签：图鉴变长后（成就墙垫底）给两个锚点，一键到藏品或成就——
    // 没有它，想看成就要从头滑到底（焦点 B 二轮实测 1973px）
    html += `<div class="col-jump">
      <button type="button" class="col-jump-btn" data-jump="relics">藏品</button>
      <button type="button" class="col-jump-btn" data-jump="ach">成就</button>
    </div>`;
    html += '<div class="col-group" id="colRelics"><p class="col-group-title">遗 物 · '
      + RELIC_ORDER.filter((id) => mem.seenRelics.indexOf(id) >= 0).length + '/' + RELIC_ORDER.length
      + '</p><div class="col-grid">';
    html += RELIC_ORDER.map((id) => card('relic', id, D.relics[id], mem.seenRelics.indexOf(id) >= 0)).join('');
    html += '</div></div>';
    D.chapters.forEach((ch) => {
      const ids = Object.keys(D.rings).filter((id) => D.rings[id].chapter === ch.id);
      const got = ids.filter((id) => mem.seenRings.indexOf(id) >= 0).length;
      html += `<div class="col-group"><p class="col-group-title">${ch.title} · ${got}/${ids.length}</p><div class="col-grid">`;
      html += ids.map((id) => {
        const st = Meta.ringStat(id);
        const use = st && st.picks ? `<em class="cc-use">选 ${st.picks}${st.wins ? ` · 通 ${st.wins}` : ''}</em>` : '';
        return card('ring', id, D.rings[id], mem.seenRings.indexOf(id) >= 0, 'ring').replace('</button>', use + '</button>');
      }).join('');
      html += '</div></div>';
    });
    // 成就墙垫底：藏品是图鉴主体（查进度第一眼要看遗物/锁环），成就属收藏附页——
    // 插在遗物前会把遗物组推到 1600px 外，每次查藏品都要滑过整面成就卡（焦点 B 实测 374→1671px）
    html += achievementBoard();
    el.colBody.innerHTML = html;
    // 跳转签：平滑滚到对应分区（body 是滚动容器）
    el.colBody.querySelectorAll('.col-jump-btn').forEach((b) => {
      b.addEventListener('click', () => {
        const target = b.dataset.jump === 'relics'
          ? el.colBody.querySelector('#colRelics')
          : el.colBody.querySelector('#colAch');
        if (!target) return;
        const box = el.colBody.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        // 瞬时跳（不用 smooth）：面板本身短，一按到位更跟手，也免掉无头回归里异步滚动的时序依赖
        el.colBody.scrollTop = el.colBody.scrollTop + (t.top - box.top) - 4;
        Sound.play('talk');
      });
    });
    el.colBody.querySelectorAll('.col-card, .col-next-chip').forEach((b) => {
      b.addEventListener('click', () => {
        const key = b.dataset.kind + ':' + b.dataset.id;
        const box = $('colDetail');
        if (box && box.classList.contains('show') && box._id === key) { box.classList.remove('show'); return; }
        showColDetail(b.dataset.kind, b.dataset.id);
        Sound.play('talk');
      });
    });
    // 成就卡点击 → 详情条复用：亮卡给完整描述，灰卡给解锁条件（desc 即条件）
    el.colBody.querySelectorAll('.ach-card').forEach((b) => {
      b.addEventListener('click', () => {
        const def = Achievements.DEFS.find((d) => d.id === b.dataset.ach);
        if (!def) return;
        const on = Achievements.isUnlocked(def.id);
        const box = $('colDetail');
        if (!box) return;
        const key = 'ach:' + def.id;
        if (box.classList.contains('show') && box._id === key) { box.classList.remove('show'); return; }
        box.innerHTML = `<span class="cd-emoji">${on ? def.emoji : '🔒'}</span>
          <div class="cd-main"><b>${def.name}${on ? '' : ' · 未解锁'}</b><span class="cd-desc"></span></div>
          <span class="cd-from">成就</span>`;
        renderRich(box.querySelector('.cd-desc'), on ? def.desc : '还没解锁——' + def.desc);
        box.classList.add('show');
        box._id = key;
        Sound.play('talk');
      });
    });
    const detail = $('colDetail');
    if (detail) { detail.classList.remove('show'); detail._id = null; }
    el.colCount.textContent = collectionText();
    const remain = collectionRemain();
    const hint = $('colHint');
    if (hint) {
      if (remain <= 0) { hint.textContent = '全部集齐了。这座塔里再没有你没见过的东西。'; }
      else {
        // 剩余构成拆开说：固定来源的（可规划，下一局照着拿）与随机池的（行李堆三选一，随缘）
        const mem2 = Meta.memory;
        const randLeft = RANDOM_POOL.filter((id) => mem2.seenRelics.indexOf(id) < 0).length;
        const fixedLeft = remain - randLeft;
        hint.textContent = `还差 ${remain} 件`
          + (fixedLeft > 0 ? ` · ${fixedLeft} 件来源固定，点「下一件」照着拿` : '')
          + (randLeft > 0 ? ` · ${randLeft} 件在行李堆随机池，三选一随缘，多爬几局总能碰上` : '')
          + '。拿过一次就记进图鉴，跨局保留。';
      }
    }
    el.collectionOverlay.classList.add('show');
    Sound.play('buy');
  }
  function closeCollection() { el.collectionOverlay.classList.remove('show'); }

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

  // ---------- 卡关指引：打不过时不让提示一闪而过 ----------
  // 条子一直挂到「攻击达标 / 离开本层 / 打赢」为止，随时点开听秤把办法说完
  function showStuck(m, pred, s) {
    if (!el.stuckBar || !m) return;
    const defBreak = pred.reason === '攻击力不足，无法破防';
    const need = (m.def || 0) + 1;
    const gap = Math.max(1, need - s.atk);
    // 防御解：把「承伤降到血量线以下要多少防」也算出来，别只说一句「先变强」
    let defNeed = null;
    if (!defBreak && pred.rounds && pred.per != null && pred.per > 0) {
      // 每回合被打 pred.per，血量 s.hp：需要 (rounds-1)*per ≤ hp → per ≤ hp/(rounds-1)
      const allowPer = Math.floor(s.hp / Math.max(1, pred.rounds - 1));
      if (pred.per > allowPer) defNeed = { from: s.def, to: s.def + (pred.per - allowPer), per: pred.per, allowPer };
    }
    const vars = { need, atk: s.atk, gap, dmg: pred.damage || 0, hp: s.hp,
      defNow: s.def, defGap: defNeed ? defNeed.to - defNeed.from : 0, per: pred.per || 0, rounds: pred.rounds || 0 };
    const key = defBreak ? 'stuckDef' : 'stuckHp';
    // 还没学格挡时，把「学格挡」作为第三个解法一起给出——尤其血量型卡关
    const blockTip = !s.flags.hasBlock && !Engine.vowForbidsBlock() && s.floor <= 4;
    renderRich(el.stuckText, defBreak
      ? `卡在${m.name}这儿？攻击还差 **${gap}** 点（要 ≥ **${need}**）`
      : `这一战预计掉 **${vars.dmg}** 血，你只有 **${vars.hp}**${defNeed ? ` · 防御再加 **${defNeed.to - defNeed.from}** 就能扛住` : ''}${blockTip ? ' · 学了**格挡**能省下三成血' : ''}`);
    el.stuckBar.hidden = false;
    stuckInfo = { key, vars, floor: s.floor, monster: m.name, blockTip };
    const now = Date.now();
    if (now - stuckSayAt > 12000) {
      stuckSayAt = now;
      if (blockTip && Tips.mark('stuckblock')) {
        say([['烛', '这一战有点疼。你**还没学格挡**——第 2 层回廊有半部盾谱，或去第 3 层找秤买。学会后每层能挡一次。', 'calm']]);
      } else sayHint(key, vars);
    }
  }
  function clearStuck() {
    if (el.stuckBar) el.stuckBar.hidden = true;
    stuckInfo = null;
  }

  function refreshHud() {
    const s = Engine.state();
    if (!s) return;
    // 卡关指引到点就撤：换了层，或攻击已经补到破防线
    if (stuckInfo && (stuckInfo.floor !== s.floor ||
        (stuckInfo.key === 'stuckDef' && s.atk >= stuckInfo.vars.need))) clearStuck();
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
    // 经验进度收进 hover 提示：顶栏少一个常驻数字，想知道差多少时悬停等级即可
    el.statLv.title = next ? `经验 ${s.exp}/${next}` : `经验 ${s.exp} · 已满级`;
    el.statLv.parentElement.title = el.statLv.title;
    el.keyY.textContent = s.keys.y;
    el.keyR.textContent = s.keys.r;
    $('btnCodex').style.display = s.flags.codex ? '' : 'none';

    Array.from(el.floorDots.children).forEach((d, i) => {
      d.className = i === s.floor ? 'now' : i < s.floor ? 'done' : '';
    });
    renderRelicRow(s);
    renderRingRow(s);
    rememberCollection(s);
    setChapterColor(s.floor);

    if (el.vowTag) {
      const v = D.vows[s.flags.vow] || D.vows.none;
      el.vowTag.hidden = v.name === '不立誓';
      el.vowTag.textContent = v.tag;
      el.vowTag.title = `${v.name}：${v.desc}`;
    }
    if (el.blockPip) {
      const owned = !!(s.flags.hasBlock);
      el.blockPip.style.display = owned ? '' : 'none';
      if (owned) {
        const used = !Engine.canBlock();
        el.blockPip.classList.toggle('used', used);
        const pct = Math.round(Engine.ringBlockScale() * 100);
        el.blockPip.title = used ? '本层格挡已用完（进下一层恢复）' : `本层还有一次格挡：战斗中可把承伤降到 ${pct}%${s.flags.hasBlock2 ? ' · 卸伤三成化为经验' : ''}`;
      }
    }

    // 罗盘之环：本层还剩几件东西没捡（不进战利品统计的剧情物不算）
    if (el.compassPip) {
      // 罗盘之环与窥探之环都给这份信息（后者是它相对「只给镜子」的补偿）
      const hasCompass = Engine.hasRing('compass') || Engine.hasRing('scout2');
      el.compassPip.hidden = !hasCompass;
      if (hasCompass) {
        const left = Engine.floorPickupCount();
        el.compassPip.textContent = `🧭 ${left}`;
        el.compassPip.title = left > 0 ? `本层还有 ${left} 件东西没捡` : '这一层能捡的都捡完了';
      }
    }

    // 明镜之环：本层还剩几只怪（幽灵 NPC 不算）
    if (el.scopePip) {
      const hasScope = Engine.hasRing('scope');
      el.scopePip.hidden = !hasScope;
      if (hasScope) {
        const left = Engine.floorMonsterCount();
        el.scopePip.textContent = `⚔ ${left}`;
        el.scopePip.title = left > 0 ? `本层还有 ${left} 只怪` : '这一层清干净了';
      }
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
  function playStory(key, cb, cue, variant) {
    // 对白期间画面暂停重绘，这里先补一帧，避免遮罩后面是空画布
    if (Engine.state() && !covered()) { try { Renderer.draw(Engine.state()); } catch (e) {} }
    const script = Array.isArray(key) ? key : S[key];
    if (!script) { if (cb) cb(); return; }
    const lines = script.map((row) => {
      if (Array.isArray(row)) return { who: row[0] || '', text: row[1] || '', mood: row[2] || '' };
      return { who: '', text: String(row), mood: '' };
    });
    // 新对白打断旧对白时，旧回调不能丢——不然「商店对白 → openShop」这类链
    // 被后来的提示对白覆盖后，商店永远不弹（玩家看到的就是'点完对话卡住'）。
    // 旧 cb 挂到新对白的 finally 链上，关闭时依次执行。
    const prevCb = typing && typing.cb;
    const chainedCb = cb || prevCb
      ? () => {
          if (cb) cb();
          if (prevCb) prevCb();
        }
      : null;
    typing = { lines, idx: 0, cb: chainedCb, cue: cue || '', variant: variant || null };
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
        : line.who === '魔王' || line.who === '炎魔' ? 'boss'
          : line.who === '墨妖' ? 'yan'
            : line.who === '钟妖' ? 'duo'
              : line.who === '碑魔' ? 'heng'
                : line.who === '秤' ? 'merchant' : '');
    $('dlgWho').style.display = line.who ? '' : 'none';
    const text = $('dlgText');
    renderRich(text, line.text);
    text.className = 'dlg-text' + (isThink ? ' think' : '');
    $('dlgBox').classList.toggle('narration', !line.who);
    $('dlgPortrait').innerHTML = window.Portraits
      ? window.Portraits.render(line.who, line.mood || 'calm', typing.variant || null)
      : '';
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
    clearTimeout(hintAuto);
    hintAuto = null;
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
      margin: d.margin || '',
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
  // 榜单排序：走到哪层 → 结局 → 决战余裕（同层同结局时，打得干净的人在前）→ 用时 → 步数
  const MARGIN_RANK = { S: 4, A: 3, B: 2, C: 1 };
  const marginRank = (r) => MARGIN_RANK[r && r.margin] || 0;
  function cmpBoard(a, b) {
    return (b.floor || 0) - (a.floor || 0)
      || (b.ending === 'true' ? 1 : 0) - (a.ending === 'true' ? 1 : 0)
      || marginRank(b) - marginRank(a)
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
    // 影子勇者的脚注：名字后面带一句他们的终点——川那句与断剑小传、薇拉台词三方互证
    const RIVAL_NOTE = {
      '第二位勇者·鸦': '停在第 2 层',
      '第五位勇者·岩': '停在第 3 层',
      '第八位勇者·川': '剑断在第五层',
    };
    $('boardList').innerHTML = (rows.length ? (crushed && boardFilter === 'all'
      ? '<div class="bd-note">影子勇者都停在前五层。你已经走到他们没到过的地方。</div>'
      : '') + rows.slice(0, 10).map((r, i) => {
      const v = D.vows[r.vow] || D.vows.none;
      const name = r.mine ? '你' : r.rival ? `挑战·朋友 第 ${r.floor} 层` : r.name;
      const note = !r.mine && !r.rival && RIVAL_NOTE[r.name] ? `<i class="bd-rnote">${RIVAL_NOTE[r.name]}</i>` : '';
      return `<div class="bd-row ${r.mine ? 'mine' : ''} ${r.rival ? 'rival' : ''}">
        <span class="bd-rank">${i + 1}</span>
        <span class="bd-name">${name}${note ? '<br>' + note : ''}${v.name === '不立誓' ? '' : `<i class="bd-vowtag">${v.tag[0]}</i>`}</span>
        <span class="bd-end ${r.ending === 'true' ? 't' : ''}">${endName(r.ending)}</span>
        ${r.margin ? `<span class="bd-margin" title="决战余裕：打完碑魔剩下多少血">${r.margin}</span>` : ''}
        <span class="bd-floor">${r.floor}层</span>
        <span class="bd-steps">${r.steps}步</span>
        <span class="bd-time">${r.time ? fmtTime(r.time) : '—'}</span>
      </div>`;
    }).join('') : '<div class="bd-empty">这一档还没有人。去立一条誓约，回来占第一位。</div>');    const codeEl = $('myCode');
    codeEl.textContent = mine.length ? encodeChallenge(mine[0]) : '—— 通关后生成 ——';
    $('achCount').textContent = `成就 ${Achievements.count()}/${Achievements.DEFS.length}`;
    // 计数即入口：点一下直跳图鉴成就墙（此前只是死数字，没人知道成就列表在图鉴里）
    const achEl = $('achCount');
    achEl.style.cursor = 'pointer';
    achEl.title = '点开图鉴看成就墙';
    if (!achEl._achJump) {
      achEl._achJump = true;
      achEl.addEventListener('click', () => {
        el.boardOverlay.classList.remove('show');
        openCollection();
      });
    }
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

  // ---------- 怪物速查卡：长按/右键怪物格子弹出（不依赖窥探之镜，人人都可用） ----------
  // 回答玩家最常问的三件事：这是谁 / 打得过吗 / 打赢给什么。
  // 没买镜子时损失一栏写「??？」——镜子仍是付费情报，速查卡只给免费的基本盘。
  function openMonsterProbe(m, tx, ty) {
    const s = Engine.state();
    if (!s) return;
    const maxHp = s.maxHp || Math.max(s.hp, 1000);
    const ch = Engine.tile(tx, ty);
    const pred = Engine.predict(ch);
    let lossHtml, lossCls;
    if (pred && pred.damage != null) {
      lossHtml = pred.damage === 0 ? '无伤' : `<b>-${pred.damage}</b> 生命`;
      lossCls = pred.damage === 0 ? 'safe' : pred.damage >= maxHp * 0.25 ? 'danger' : 'warn';
    } else if (pred) {
      lossHtml = `<b>攻 +${m.def + 1 - s.atk}</b> 才能破防`;
      lossCls = 'danger';
    } else {
      lossHtml = '??';
      lossCls = 'danger';
    }
    const bossTag = m.boss && m.title ? `<i class="cx-tag boss">${m.title}</i>` : '';
    const TR = D.TRAITS && m.trait ? D.TRAITS[m.trait] : null;
    const traitTag = TR ? `<i class="cx-tag trait">${TR.icon}${TR.name}</i>` : '';
    const card = document.createElement('div');
    card.className = 'probe-card';
    card.innerHTML = `
      <div class="pb-head"><span class="pb-emoji">${m.emoji}</span>
        <b>${m.name}</b>${bossTag}<i class="cx-tag">${m.kind}</i>${traitTag}</div>
      <div class="pb-stats">HP <b>${m.hp}</b> · 攻 <b>${m.atk}</b> · 防 <b>${m.def}</b></div>
      ${TR ? `<div class="pb-trait">${TR.icon} ${TR.tip}</div>` : ''}
      <div class="pb-loss ${lossCls}">${lossHtml}</div>
      <div class="pb-reward">打赢可得 ${m.gold}💰 ${m.exp}✨</div>
      <div class="pb-hint">点其他地方关闭</div>`;
    card.addEventListener('click', (e) => e.stopPropagation());
    const dismiss = () => { card.remove(); document.removeEventListener('click', dismiss, true); };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
    el.stage.appendChild(card);
    // 定位：贴着怪物格下方（棋盘在 stage 里居中，需要算出棋盘起点），屏幕边缘时往回缩
    const T = Renderer.getTile ? Renderer.getTile() : 48;
    const board = T * 11;
    const ox = (el.stage.clientWidth - board) / 2;
    const oy = (el.stage.clientHeight - board) / 2;
    let cx = ox + (tx + 0.5) * T;
    let cy = oy + (ty + 1.35) * T;
    requestAnimationFrame(() => {
      const cw = card.offsetWidth, chh = card.offsetHeight;
      if (cx + cw / 2 > el.stage.clientWidth - 8) cx = el.stage.clientWidth - cw / 2 - 8;
      if (cx - cw / 2 < 8) cx = cw / 2 + 8;
      if (cy + chh > el.stage.clientHeight - 8) cy = Math.max(8, oy + (ty + 0.5) * T - chh - 6);
      card.style.left = Math.round(cx) + 'px';
      card.style.top = Math.round(cy) + 'px';
      card.classList.add('show');
    });
    Sound.play('talk');
  }

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
      const T = D.TRAITS && m.trait ? D.TRAITS[m.trait] : null;
      const mg = Engine.margin(ch);
      // 特性与边际收益放在同一行副信息里：第一行留给「这是谁」，
      // 只给数字不给结论——该加攻还是加防仍由玩家判断
      const mgRow = (T || mg)
        ? `<span class="cx-margin">${T ? `<i class="cx-tag trait t-${m.trait}">${T.icon}${T.name}</i>` : ''}${mg
            ? `攻 +1 省 <b>${mg.atk}</b> 血 · 防 +1 省 <b>${mg.def}</b> 血${mg.base === 0 ? '（已无伤）' : ''}`
            : '暂时打不过，先攒属性'}</span>`
        : '';
      return `<div class="cx-row${T ? ' has-trait' : ''}">
        <span class="cx-emoji">${m.emoji}</span>
        <span class="cx-name">${m.name}${bossTag}<i class="cx-tag">${m.kind}</i></span>
        <span class="cx-stat">HP ${m.hp} · 攻 ${m.atk} · 防 ${m.def}</span>
        <span class="cx-loss ${cls}">${loss}</span>
        <span class="cx-reward">${m.gold}💰 ${m.exp}✨</span>
        ${mgRow}
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
    // 三档速度（设置里调）× 快速战斗总开关 × 测试钩子：重复刷层不必看完演出
    const speed = (window.__battleSpeed || 1) * BATTLE_SPEED[Settings.battleSpeed] * (Settings.fast ? 0.42 : 1);
    // 跳过必须当场生效：每个 wait 注册一个唤醒器，点一下战斗面板就结束「当前这一等」，
    // 而不是等这段动画/过场演完才发现点了——Boss 阶段过场原来最长白等 950ms（780+170）。
    let skipWaiter = null;
    const skipNow = () => {
      if (!skipWaiter) return;
      const w = skipWaiter;
      skipWaiter = null;
      w();
    };
    const wait = (ms) => new Promise((resolve) => {
      // 已经点过跳过：后面每一步等待都不再真的等，一口气把演出收掉
      if (skipped) { resolve(); return; }
      const finish = () => {
        clearTimeout(timer);
        if (skipWaiter === finish) skipWaiter = null;
        resolve();
      };
      const timer = setTimeout(finish, ms * speed);
      skipWaiter = finish;
    });

    const bg = Renderer.snapshot();
    if (bg) el.battleScene.style.setProperty('--bg', `url(${bg})`);

    el.bsHero.textContent = '🧙';
    el.bsFoe.textContent = m.emoji;
    // 章末 Boss 带「第 N 章」标记，玩家能看出自己在塔里的位置
    const bTrait = D.TRAITS && m.trait ? D.TRAITS[m.trait] : null;
    const nameText = m.name + (m.boss ? ' · ' + (m.title || '塔的主人') : (m.chapter ? ` · 第 ${m.chapter} 章` : ''));
    el.bsName.innerHTML = nameText + (bTrait ? ` <i class="bs-trait">${bTrait.icon}${bTrait.name}</i>` : '');
    // 第一次碰到某种特性，把规则讲一次，之后不再打扰
    if (bTrait && !s.flags['traitSeen_' + m.trait]) {
      s.flags['traitSeen_' + m.trait] = true;
      Engine.save();
      log(`【${bTrait.name}】${bTrait.tip}`, 'warn');
    }
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
    // 战意：只有最终决战会亮，把「打怪有收益」当场说给玩家看
    const zealEl = $('bsZeal');
    if (zealEl) {
      const z = info.dmgBase && info.dmgBase.zeal ? info.dmgBase.zeal : 1;
      zealEl.hidden = z >= 1;
      if (z < 1) zealEl.textContent = `⚔ 战意 −${Math.round((1 - z) * 100)}% · 已击败 ${Engine.state().flags.killCount || 0} 只`;
    }

    // 格挡：每层一次，按下后整场承伤 ×0.6（引擎按同样比例结算，数字对得上）
    let blockScale = 1;
    let blockOn = false;
    const canB = Engine.canBlock();
    // 格挡比例由引擎给出（断刃之环会把它从 0.6 改成 0.5），演出与结算不会各算各的
    const scaleWhenBlocked = info.dmgBlock && info.dmgBase.damage > 0
      ? Math.max(0.05, info.dmgBlock.damage / info.dmgBase.damage)
      : Engine.ringBlockScale();
    // 小架不值得给选项：伤害不到 5% 上限的杂兵战不显示格挡，免得每次都弹
    // 没学会格挡时也整个不显示——它不再是开局白送的能力
    const worth = s.flags.hasBlock && (m.boss || pred.damage >= heroMax * 0.05);
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

    el.battleScene.onclick = () => { skipped = true; skipNow(); };

    (async () => {
      // 演出刀数：默认压上限（普通 5 / Boss 8）保证节奏；设置「全量回合」时
      // 按真实回合数播放，每一刀都是真实伤害，长战斗不再被均摊
      const K = Settings.fullRounds ? pred.rounds : Math.min(pred.rounds, m.boss ? 8 : 5);
      // Boss 三阶段：血量跨过 66% / 33% 时插一段短过场（只改表现，不改数值）
      // 每局从 Boss 台词池抽两段：同一局固定，重开一局会听到另一组
      const PHASES = info.phases || m.phases || [
        { at: 0.66, n: 2, title: '第二道锁 · 裂', text: '别把我想成一道门。门后面还有东西。' },
        { at: 0.33, n: 3, title: '第三道锁 · 塔心', text: '再近一点，你就看得见她的名字了。' },
      ];
      let phaseIdx = 0;
      // 演出里玩家会挨的总承伤：取引擎「真实承伤」（誓约/锁环/格挡都算在内）
      let heroDamageLeft = Math.max(0, Math.round((blockOn && info.dmgBlock ? info.dmgBlock.damage : (info.dmgBase ? info.dmgBase.damage : pred.damage || 0))));
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
        // 演出回合数与真实回合数不一致时的切血策略——目标是血条「匀速落到底」：
        // 每刀切 foeMax/K（均摊），最后一刀收零头。
        // 旧逻辑两个坑：① 真实刀数 > 演出上限时前期按真实伤害打、最后一刀吃掉剩余全部，
        // 血厚的怪会「前几刀慢慢磨、最后一瞬间清空」；② 真实刀数 < 演出上限时
        // strikesReal < strikesLeft 一成立就整条清空，速杀怪也是「一闪血全没」。
        // 均摊后每刀数字与真实单刀不同（纯演出），但掉血节奏与回合推进一致。
        const per = Math.ceil(foeMax / K);
        const strikesLeft = K - i;                       // 这一刀之后还剩几刀（含本次）
        const strikesReal = Math.ceil(foeHp / Math.max(1, pred.out)); // 现在的血量还差几刀打完
        let cut;
        if (strikesLeft === 1 || strikesReal <= 1) cut = foeHp;
        else cut = Math.min(foeHp, per);
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
          // 演出里玩家挨打次数可能比真实战斗少：按剩余次数均摊，打完正好落在引擎结算值
          const take = Math.max(0, Math.round(heroDamageLeft / (K - 1 - i)));
          heroDamageLeft -= take;
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
      heroDamageLeft = 0;
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
      skipWaiter = null; // 战斗结束必须清掉唤醒器，别让下一次点击去唤醒上一场的等待
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
      // 章末锁匠倒下：与拾取遗物同级别的舞台，红色调
      relicShowcase(s2.x, s2.y, 'boss');
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
    // 战后死亡结算：誓约乘区可能让真实承伤超出预判（引擎已把血钳到 0、置 over）
    if (s2.over && s2.hp <= 0) showDeath(res.monster, res.damage);
  }

  // ---------- 死亡：塔收下了这一局 ----------
  // 败局不借用胜局的金色面板：endOverlay 挂 death-mode，整块转铁灰冷调；
  // 「折戟」塔印只在此处出现，不参与 bestSeal 竞争。履历/目标照常给出——败局也有下一局。
  let deathShown = false;
  function showDeath(monster, damage) {
    if (deathShown) return;
    deathShown = true;
    stopWalk();
    Sound.stopMusic();
    Sound.stopMotif();
    Sound.play('hitBig');
    const s = Engine.state();
    if (!REDUCED()) {
      Renderer.shake(500, 8);
      Renderer.burst(s.x * TN() + TN() / 2, s.y * TN() + TN() / 2, {
        count: 26, colors: ['#ff8f8f', '#c9524a', '#5a2020'], speed: 120, life: [500, 1100], grav: 70, size: [2, 4],
      });
    }
    const vowDef = D.vows[s.flags.vow] || D.vows.none;
    const sum = Engine.summary();
    const seal = 'fall';
    const sealDef = SEALS[seal];
    const emberGain = Math.floor((s.flags.killCount || 0) / 5);
    $('endEmoji').textContent = '💀';
    $('endTitle').textContent = '塔收下了你';
    $('endDesc').textContent = `你倒在了${monster ? monster.name : '塔里'}的手里。塔把这一局的余烬收进墙上，等下一个人。`;
    $('endBody').textContent = '';
    $('endEpi').textContent = `第 ${s.floor + 1} 层 · 挨了 ${damage} 点。塔不怪你——它只是照章办事。`;
    $('endScore').innerHTML = `<span class="es-grade fall" data-seal="fall">${sealDef.name}</span>
      <span class="es-meta">${s.ending ? '' : '败局'} · 第 ${s.floor + 1} 层 · 击杀 ${s.flags.killCount || 0} · 用时 ${fmtTime(sum.time)}</span>
      <span class="es-num">✦ ${emberGain}<small>余烬</small></span>`;
    $('endScore').title = `塔印「${sealDef.name}」：${sealDef.desc}`;
    $('endEmberDetail').innerHTML = '';
    $('endTag').textContent = sealDef.desc;
    $('endBrief').innerHTML = `<span>败局也算履历：击杀折成余烬带回。</span>`
      + (s.flags.worstHit ? `<span>最狠的一场：${s.flags.worstName} −${s.flags.worstHit}</span>` : '')
      + ((Array.isArray(s.flags.collectNew) && s.flags.collectNew.length)
        ? `<span>图鉴新收录：${s.flags.collectNew.slice(0, 4).join('、')}${s.flags.collectNew.length > 4 ? ` 等 ${s.flags.collectNew.length} 件` : ''}（带走的东西不会因为倒下而丢失）</span>`
        : '');
    Meta.recordRun({ ending: null, won: false, vow: s.flags.vow || 'none', fullChapters: 0, heart: null, floor: s.floor, time: sum.time, seal, ember: emberGain });
    Meta.add(emberGain);
    // 折戟里程碑：recordRun 之后喂事件，falls 已含本次（3 次「塔的常客」/ 10 次「不死不休」）
    const deathState = Object.assign({}, s, { flags: Object.assign({}, s.flags, { falls: Meta.memory.falls }) });
    Achievements.evaluate('dead', deathState, notifyAchievement);
    // 折戟预告钩子：差一次解锁里程碑时在败局页点一句——让「再来一局」多一个具体理由
    const fallsNow = Meta.memory.falls || 0;
    if (fallsNow === 2) $('endBrief').innerHTML += '<span>💀 再折戟 1 次，解锁成就「塔的常客」</span>';
    else if (fallsNow === 9) $('endBrief').innerHTML += '<span>💀 再折戟 1 次，解锁成就「不死不休」</span>';
    // 败局也给「塔的记忆」：同一套履历 + 下一局目标——死不是终点，是排队重来的理由
    const mem = Meta.memory;
    const memItems = [
      `进塔 ${mem.runs || 1} 次 · 最远第 ${Math.max(mem.deepest || 0, s.floor)} 层${mem.fastest ? ` · 最快 ${fmtTime(mem.fastest)}` : ''}`,
      `刻下过最好的塔印：${SEALS[mem.bestSeal] ? SEALS[mem.bestSeal].name : '尚未刻下'}`,
      `结局：铁与霜 ×${mem.endings.plain || 0} · 第六个名字 ×${mem.endings.true || 0}`,
      `满回响 ${mem.fullChapters || 0}/4 章 · 塔心 带走×${mem.heartTaken || 0} 留下×${mem.heartLeft || 0}`,
      `💀 折戟 ×${mem.falls || 0} · 上次倒在第 ${(mem.lastFallFloor || 0) + 1} 层`,
    ];
    const goals = [];
    const lockedVow = Object.keys(D.vows).find((id) => D.vows[id].ember && !Meta.has(id));
    if (lockedVow) {
      const need = Math.max(0, D.vows[lockedVow].ember - Meta.ember);
      goals.push(need > 0 ? `再攒 ${need} ✦ 解锁「${D.vows[lockedVow].name}」` : `「${D.vows[lockedVow].name}」已可解锁——下一局开局选它`);
    }
    if ((mem.fullChapters || 0) < 4) goals.push(`把回响拿满的章推进到 ${(mem.fullChapters || 0) + 1}/4`);
    if (!(mem.endings.true || 0)) goals.push('去念出第六个名字');
    else if (!(mem.endings.plain || 0)) goals.push('试试另一条路：铁与霜');
    goals.unshift(`这次倒在了第 ${s.floor + 1} 层——下一局从这里再往上`);
    const memWrap = $('endMemory');
    if (memWrap) {
      memWrap.classList.remove('open');
      memWrap.innerHTML = `<div class="mem-grid">${memItems.map((t) => `<div>${t}</div>`).join('')}</div>`
        + (goals.length ? `<div class="mem-goals">${goals.slice(0, 3).map((g) => `<span>▸ ${g}</span>`).join('')}</div><p class="mem-note">塔收起了你的名字，但位置还留着。</p>` : '');
      // 死亡页默认收起履历与目标（焦点 B：刚死的人只想立刻重开，履历是回头才看的）。
      // 胜局不折：那是值得读的时刻。按钮每次重建，避免上一局残留。
      const oldTg = el.endOverlay.querySelector('.mem-toggle');
      if (oldTg) oldTg.remove();
      const tg = document.createElement('button');
      tg.type = 'button';
      tg.className = 'mem-toggle';
      tg.textContent = '塔的记忆 ▾';
      tg.onclick = () => {
        const open = memWrap.classList.toggle('open');
        tg.textContent = open ? '收起 ▴' : '塔的记忆 ▾';
      };
      memWrap.insertAdjacentElement('beforebegin', tg);
    }
    $('endStats').innerHTML = `
      <div>倒在 <b>${monster ? monster.name : '塔里'}</b></div>
      <div>深度 <b>第 ${s.floor + 1} 层</b></div>
      <div>塔印 <b>${sealDef.name}</b></div>
      <div>击杀 <b>${s.flags.killCount || 0}</b></div>
      <div>誓约 <b>${vowDef.name}</b></div>
      <div>用时 <b>${fmtTime(sum.time)}</b></div>
    `;
    $('endCode').textContent = '—— 未达结局 ——';
    if (window.__tm) window.__tm.lastRun = {
      ending: null, vow: s.flags.vow || 'none', floor: s.floor, time: sum.time,
      steps: sum.steps, seal, goals: 0,
    };
    el.endOverlay.classList.add('show', 'death-mode');
    refreshStartBadges();
    adOfferRevive();
  }

  // ---------- 激励视频卡点（IAA）：接口在 js/ads.js，默认恒不可用 ----------
  // 提审前 Ads.available() 恒 false → 按钮不出现，玩家看到的流程一个字都没变。
  // 接 SDK 只改 ads.js；这里的领奖动作在 mock 模式下也可完整走通（回归可测）。
  function adOfferRevive() {
    if (!window.Ads || !Ads.available()) return;
    const actions = el.endOverlay.querySelector('.actions');
    if (!actions) return;
    const old = el.endOverlay.querySelector('#btnAdRevive');
    if (old) old.remove(); // 重开一局后再死：别叠第二个按钮
    const btn = document.createElement('button');
    btn.className = 'btn ad-cta';
    btn.id = 'btnAdRevive';
    btn.innerHTML = '📺 看一段视频 · 从这一层重来';
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '视频播放中…';
      Ads.show('revive', (ok) => {
        if (!ok) {
          btn.disabled = false;
          btn.innerHTML = '📺 看一段视频 · 从这一层重来';
          warn('视频没看完，这次不算——塔还在等。');
          return;
        }
        reviveFromAd();
      });
    };
    actions.insertAdjacentElement('beforebegin', btn);
  }

  // 广告复活：回到本层入口快照（这一层的怪与进度重来，是复活的代价），血量抬到四成
  function reviveFromAd() {
    const s0 = Engine.state();
    if (!s0 || !s0.over) return;
    const floor0 = s0.floor;
    const okSnap = Engine.restoreFloor();
    const s = Engine.state();
    s.over = false;
    s.won = false;
    if (!okSnap) {
      // 没有本层快照（极早期死亡）：原地起身，只回血不动进度
      s.hp = Math.max(1, Math.round((s.maxHp || 1000) * 0.4));
    } else {
      s.hp = Math.max(1, Math.round((s.maxHp || 1000) * 0.4));
    }
    s.flags.adRevived = (s.flags.adRevived || 0) + 1;
    Engine.save();
    deathShown = false;
    endShown = false;
    el.endOverlay.classList.remove('show', 'death-mode');
    Renderer.setAmbient(s.floor);
    refreshHud();
    Sound.play('level');
    warn(`**从第 ${floor0 + 1} 层重新站起来**：生命回到四成，这一层的怪也回来了。`);
  }

  // 结算页「余烬翻倍」：只在通关结算用
  function adOfferDouble(emberGain, host) {
    if (!window.Ads || !Ads.available() || !emberGain || !host) return;
    const btn = document.createElement('button');
    btn.className = 'ad-cta ad-cta-inline';
    btn.innerHTML = `📺 看一段视频 · 这一局余烬翻倍 <b>+${emberGain} ✦</b>`;
    btn.onclick = () => {
      if (btn.disabled) return;
      btn.disabled = true;
      btn.textContent = '视频播放中…';
      Ads.show('ember', (ok) => {
        if (!ok) {
          btn.disabled = false;
          btn.innerHTML = `📺 看一段视频 · 这一局余烬翻倍 <b>+${emberGain} ✦</b>`;
          return;
        }
        Meta.add(emberGain);
        const done = document.createElement('span');
        done.className = 'ad-done';
        done.textContent = `✦ 余烬翻倍 +${emberGain}（已入账）`;
        btn.replaceWith(done);
        refreshStartBadges();
      });
    };
    host.insertAdjacentElement('afterend', btn);
  }

  // ---------- 章末回响：击败章末锁匠 → 锁环三选一 ----------
  let curEcho = null;
  function openEcho(echo) {
    if (!echo) return;
    curEcho = echo;
    const s = Engine.state();
    setChapterColor(echo.chapter * 3 - 1); // 该章章末层的索引（2 / 5 / 8 / 11）
    el.echoKicker.textContent = `${echo.title} · 回响`;
    el.echoLine.textContent = (S.echoLines && S.echoLines[echo.chapter - 1]) || '';
    el.echoReward.textContent = echo.pending
      ? '锁匠倒下了 · 塔从墙上取下一枚锁环，让你挑'
      : '这一章的锁环你已经拿过了';
    el.echoReward.classList.toggle('muted', !echo.pending);
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
    Meta.ringPicked(id);
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
    const meta = D.chapters[ch - 1];
    openEcho({ chapter: ch, title: meta.title, pending: true });
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
        // 铁壁之誓打到塔顶：给专属台词——烛认得这条誓约，点明「没有格挡」的真实代价
        if (m.finalBoss && Engine.vow() === 'guard') {
          const fd = Engine.fightDamage(ch, false);
          warn(`**碑魔** · 你没有格挡，要 **${fd ? fd.damage : '?'}** 点血才接得下`);
          sayHint('tooStrongBossGuard', { n: shop, need: fd ? fd.damage + 1 : '?' });
        } else if (Tips.mark('toostrong')) sayHint('tooStrongBoss', { n: shop });
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
      // 关键：把「差多少 + 去哪儿补」钉在顶栏，别让提示一闪而过、看着像卡死
      showStuck(m, pred, s);
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

    // Boss 开战名号横幅：每次都报一遍「谁在拦你」——地图形象是剪影，名字必须由战斗开口说
    if (m.boss && m.title) {
      Tips.banner('bossIntro', { name: m.name, title: m.title }, { text: `⚔ **{name}** · {title} 拦在路上` });
    }

    clearStuck();
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
    // 卡关时在货摊上直接标「买几个能打过挡路的怪」：玩家不用自己拿纸算
    let needAtk = null;
    if (stuckInfo && stuckInfo.key === 'stuckDef') {
      const blocker = stuckInfo.monster;
      const bk = Object.keys(D.monsters).find((k) => D.monsters[k].name === blocker);
      if (bk) needAtk = { ch: bk, def: D.monsters[bk].def };
    }
    const list = $('shopList');
    list.innerHTML = '';
    Engine.shopStock().forEach((item) => {
      const owned = (item.codex && s.flags.codex) || (item.relic && Engine.hasRelic(item.relic)) || (item.block && s.flags.hasBlock) || (item.heartShard && s.flags.heartShard);
      // 铁壁/苦行/无名三条誓约不能格挡：盾谱置灰，别让人白花钱
      const forbidden = item.block && Engine.vowForbidsBlock();
      const price = Engine.priceOf(item);
      const afford = s.gold >= price;
      let tip = item.relic ? D.relics[item.relic].desc : item.key ? (item.key === 'y' ? '开黄门' : '开红门') : item.hp ? `回复 ${item.hp} 生命` : item.atk ? '攻击 +2' : item.def ? '防御 +2' : item.block ? '学会格挡：每层一次，战斗中点盾把承伤降到 55%' : item.heartShard ? '带一点塔的心跳出去：**通关余烬 +8**（唯一）' : '怪物情报';
      if (forbidden) tip = '**这条誓约不能格挡**，买了也用不上';
      // 唯一/关键品保底提示：钱不够时告诉玩家「差多少、本层还剩几只怪可刷」，
      // 别让人以为错过这一层就再也买不到了（盾谱/镜子/灯芯/碎片都算）
      if (!owned && !forbidden && !afford && (item.once || item.block)) {
        const left = Engine.floorMonsterCount();
        const what = item.block ? '学会格挡' : item.codex ? '怪物情报永久解锁' : item.heartShard ? '通关余烬 +8' : item.relic ? D.relics[item.relic].desc : '';
        tip = `${what ? what + ' · ' : ''}还差 **${price - s.gold}** 金${left ? ` · 这一层还剩 **${left}** 只怪可刷` : ' · 这一层已经清空，回下层找钱'}`;
      }
      if (item.atk && needAtk) {
        const gap = needAtk.def + 1 - s.atk;
        const times = Math.max(1, Math.ceil(gap / item.atk));
        const per = Engine.priceOf(D.shop.find((x) => x.id === 'atk')) || price;
        const total = times * per;
        tip = `攻击 +2 · **再买 ${times} 次（${total} 金）能打过${blocker}**`;
      } else if (item.def && stuckInfo && stuckInfo.key === 'stuckHp') {
        tip = '防御 +2 · **买几个能少掉不少血**';
      }
      const row = document.createElement('div');
      row.className = 'shop-item' + (owned ? ' owned' : '');
      row.innerHTML = `
        <span class="si-emoji">${item.emoji}</span>
        <span class="si-name"><b>${item.name}${item.once ? '<small class="si-tag">唯一</small>' : ''}</b><small class="si-tip"></small></span>
        <span class="si-price">${price}</span>
        <button class="si-buy" data-id="${item.id}" ${owned || forbidden || !afford ? 'disabled' : ''}>${owned ? '已拥有' : forbidden ? '不适用' : '购买'}</button>
      `;
      // 提示里的 **重点** 走 rich 渲染：直接拼 innerHTML 会把星号原样显示出来
      renderRich(row.querySelector('.si-tip'), tip);
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
          if (res.item.block) {
            Renderer.ring(before.x, before.y, 'rgba(159,216,255,0.9)', TN() * 2.4, 600);
            Tips.show('block');
            warn('**格挡已学会**：每层一次，战斗中点盾。');
          }
          if (res.item.heartShard) {
            Renderer.ring(before.x, before.y, 'rgba(255,180,200,0.9)', TN() * 2.6, 620);
            warn('**塔心碎片**已收好——结算时化为 **余烬 +8**。');
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
    // 拿起过渡：选中的卡上提发光，其余两张沉暗退后，260ms 后再收面板放高光
    const cards = el.altarCards.querySelectorAll('.altar-card');
    cards.forEach((c) => {
      c.classList.add(c.dataset.id === id ? 'picking' : 'sinking');
    });
    Sound.play('pick');
    setTimeout(() => {
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
    }, 260);
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
    // 这次选择教会了格挡：让烛把用法说完（老玩家读过的不再复读）
    if (Engine.state().flags.hasBlock && !Engine.state().flags.evBlockTaught) {
      Engine.state().flags.evBlockTaught = true;
      Engine.save();
      Tips.show('block');
    }
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
  // 折戟 = 死亡专属：不参与 bestSeal 竞争（rank 里排最低），但结算页有自己的名分。
  const SEALS = {
    clear: { name: '无痕', desc: '六盏灯全亮。这一趟，你没欠谁。' },
    ward:  { name: '守灯', desc: '灯还亮着。你没让它灭在自己手里。' },
    name:  { name: '留名', desc: '塔的墙上，多了你的一道刻痕。' },
    rough: { name: '未竟', desc: '塔记住了你的名字——仅此而已。' },
    fall:  { name: '折戟', desc: '你没能走到结局。塔替你记下倒下的地方。' },
  };
  function sealOf(s, echoDone) {
    const trueEnd = s.ending === 'true';
    const noRetry = !(s.flags && s.flags.retries);
    if (trueEnd && echoDone >= 4 && noRetry) return 'clear';
    if (trueEnd && echoDone >= 3) return 'ward';
    if (echoDone >= 2) return 'name';
    return 'rough';
  }
  function nextSealHint(seal, s, echoDone) {
    if (seal === 'clear') return null;
    if (seal === 'rough') return `再拿到 ${2 - echoDone} 枚锁环，可换「留名」`;
    if (seal === 'name') return s.ending === 'true'
      ? `锁环攒到 3 枚可换「守灯」`
      : '念出第六个名字，塔印才会再往上走';
    return `锁环 ${echoDone}/4 · 回头 ${s.flags.retries || 0} 次——四章全拿且一次不回头可换「无痕」`;
  }
  // 余烬：按这一局留下的东西逐项累加，返回明细供结局页展示（不再绕分数换算）
  function emberOf(s, echoDone, vowDef) {
    const parts = [{ label: '走到结局', n: 5 }];
    if (s.ending === 'true') parts.push({ label: '念出第六个名字', n: 4 });
    const kills = Math.floor((s.flags.killCount || 0) / 10);
    if (kills) parts.push({ label: `击杀 ${s.flags.killCount} 只`, n: kills });
    if (s.flags.heart === 'left') parts.push({ label: '塔心留在原处', n: 3 });
    // 决战余裕 S（打完碑魔还剩 70% 以上）：替「打得干净」记一笔，只此一档，其余不加
    const fhp = s.flags.finalHp;
    const fmhp = s.flags.finalMaxHp;
    if (fmhp > 0 && fhp / fmhp >= 0.7) parts.push({ label: '决战余裕 S', n: 2 });
    // 「一口空气」首解锁：一件遗物都没拿走到结局，第一次额外给 5 余烬。
    // 放在这里而不是成就回调里——结算明细要先把它算进去，余额才不会对不上
    // （此刻成就还没解锁，evaluate('finish') 在结算面板渲染之后才跑）
    const bareRun = !!s.ending && !Object.keys(s.flags).some((k) => k.indexOf('relic_') === 0);
    if (bareRun && !Achievements.isUnlocked('bare')) parts.push({ label: '一口空气（首次）', n: 5 });
    if (s.flags.eventEmber) parts.push({ label: '路遇里的选择', n: s.flags.eventEmber });
    // 锁芯买的塔心碎片：带一点塔的心跳出去，结算时化为余烬
    if (s.flags.heartShard) parts.push({ label: '塔心碎片', n: 8 });
    // 誓约奖励：其他誓约用「誓约名」（那是玩家主动立的），不立誓改成陈述句
    // 「无誓通关」——「「不立誓」+1」读起来像双重否定，结算明细里反而费解
    if (vowDef.reward) {
      const vowLabel = vowDef === D.vows.none ? '无誓通关' : `「${vowDef.name}」`;
      parts.push({ label: vowLabel, n: vowDef.reward });
    }
    // 解锁誓约第一次通关：额外给解锁成本的一半，让「解锁 → 真的用它」当场回本一半
    // 按 vowDef 反查 id，不用 s.flags.vow，避免结算与自动化取到不同口径
    const vowId = Object.keys(D.vows).find((k) => D.vows[k] === vowDef) || s.flags.vow;
    if (vowDef.ember && !Meta.hasFirstWin(vowId)) {
      parts.push({ label: `首通「${vowDef.name}」`, n: Math.round(vowDef.ember / 2) });
    }
    const has = (id) => Engine.hasRing(id);
    if (has('ledger') || has('ash') || has('ledger2')) parts.push({ label: '锁环·击杀余烬翻倍', n: kills });
    // 第七格：保底 +3，一次没回头（没重来本层）再 +3——与「刻刀」的稳定 +4 形成「稳 vs 冒险」
    if (has('seventh')) {
      const clean = !(s.flags.retries);
      parts.push({ label: clean ? '锁环·第七格（一次没回头）' : '锁环·第七格', n: clean ? 6 : 3 });
    }
    // 落笔之环：保底 +2，剩下的金币每 100 再 +1（上限 6）。
    // 曾按「每 100 金 +1、上限 5」做过，sim 验证是陷阱：留 500 金会少 28 点攻，
    // 终局血量从 66.6% 掉到 48.5%，却只换到 2 余烬——保底把它拉回「稳定小收益」。
    if (has('quill')) {
      const byGold = 2 + Math.min(4, Math.floor((s.gold || 0) / 100));
      parts.push({ label: `锁环·落笔（剩 ${s.gold} 金）`, n: byGold });
    }
    // 落款之环：本局第一次收录进图鉴的件数，每件 +1（上限 5，避免开局撞大运爆收益）
    if (has('signature')) {
      const nNew = Array.isArray(s.flags.collectNew) ? Math.min(5, s.flags.collectNew.length) : 0;
      if (nNew > 0) parts.push({ label: `锁环·落款（图鉴新收录 ${nNew} 件）`, n: nNew });
    }
    // 通关型锁环各有触发条件，逐条列出来源（不再是「锁环加成」一笔带过）
    if (has('pace')) parts.push({ label: '锁环·更漏', n: 2 });
    if (has('chisel')) parts.push({ label: '锁环·刻刀', n: 4 });
    if (has('hour')) {
      const mins = Math.round((Engine.summary().time || 0) / 60);
      if (mins > 0 && mins <= 20) parts.push({ label: `锁环·时辰（${mins} 分钟内通关）`, n: 4 });
      else parts.push({ label: '锁环·时辰', n: 2 });
    }
    if (has('oath')) {
      const withVow = (s.flags.vow || 'none') !== 'none';
      parts.push({ label: withVow ? `锁环·守誓（${(D.vows[s.flags.vow] || {}).name || '誓约'}）` : '锁环·守誓', n: withVow ? 5 : 3 });
    }
    if (has('heart') && s.flags.heart === 'left') parts.push({ label: '锁环·塔心（放下）', n: 3 });
    // 拾柴之环：每击败一位锁匠 +2（与击杀数无关，奖励推进度）
    if (has('ash')) {
      const bossesDown = ['N', 'Z', 'Y', 'U'].filter((c) => s.flags['bossKilled_' + c]).length;
      if (bossesDown > 0) parts.push({ label: `锁环·拾柴（${bossesDown} 位锁匠）`, n: bossesDown });
    }
    // 终章之环：四位锁匠全倒才给（要求把四位都打完，比拾柴更严格）
    if (has('finale')) {
      const allBosses = ['N', 'Z', 'Y', 'U'].every((c) => s.flags['bossKilled_' + c]);
      if (allBosses) parts.push({ label: '锁环·终章（四锁匠全倒）', n: 3 });
    }
    const list = parts.filter((p) => p.n > 0);
    return { total: Math.max(1, list.reduce((a, p) => a + p.n, 0)), parts: list };
  }

  // ---------- 结局 ----------
  function showEnd() {
    if (endShown) return;
    endShown = true;
    stopWalk();
    el.endOverlay.classList.remove('death-mode'); // 胜局面板不吃死亡灰调（上局死过也不串）
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
    // 盾谱集齐（前半 + 后半）的签名彩蛋：名册上那一行空格，终于有人签了
    const signed = !!(s.flags.hasBlock && s.flags.hasBlock2);
    const signLine = signed && s.ending === 'true'
      ? '名册的最后一页，你把自己的名字签在了持谱人的空位上。字迹与那半册盾谱上的转腕一样，稳。'
      : signed
        ? '你把签好的盾谱留在了塔里。名字还没有传出去，但招式会。'
        : '';
    $('endEpi').textContent = (E.epilogue || '') + (heartLine ? ' ' + heartLine : '');
    // 先清掉上一局可能插入的动态行（秤的纸条 / 断剑去处）——textContent 重写不会移除兄弟节点
    el.endOverlay.querySelectorAll('.end-epi-scale, .end-epi-sword').forEach((n) => n.remove());
    // 断剑的去处（带剑通关才有）：结局正文追加一句，剑跟着后日谈走
    // 平结局=熔剑入灯，刻上他的名字；真结局=王冠成了灯座，剑立在海崖，剑尖指着塔顶
    const swordLine = s.flags.relic_edge
      ? (s.ending === 'true'
        ? '断剑没有跟你下山。它立在海崖上，剑尖朝着塔顶——川没能走完的路，从今往后有人替他看着。'
        : '那半截断剑，你熔灯的那天一起投进了火里。灯座上多刻了一个「川」字——剑沉，灯座要厚一点才稳。')
      : '';
    if (swordLine) $('endEpi').textContent += ' ' + swordLine;
    // 秤的告别：第八位勇者的军需官跟了你一路，结局这一刻他的账清了。
    // 真结局才亮（普通结局没人替川收尾）；带过断剑时，纸条直接写给他等了八十年的人。
    const scaleNote = s.ending === 'true' && s.flags.relic_edge
      ? '下塔的时候，第三层的货摊已经空了。铜盘里压着最后一张纸条，字迹是秤的：「他说过要带我去塔顶看看。我没等到他，等到了你。——秤」'
      : s.ending === 'true'
        ? '下塔的时候，第三层的货摊已经空了。铜盘里压着最后一张纸条，字迹是秤的：「账清了。后头的路，自己走稳。——秤」'
        : '';
    if (scaleNote) {
      const epi = $('endEpi');
      const p = document.createElement('p');
      p.className = 'end-epi end-epi-scale';
      p.textContent = scaleNote;
      epi.parentNode.insertBefore(p, epi.nextSibling);
    }
    // 签名独立一行：等结算面板入场后，用「一笔写下来」的揭示动画出现（只有集齐盾谱才有）
    const signEl = $('endSign');
    if (signEl) {
      signEl.hidden = !signLine;
      signEl.classList.remove('write');
      if (signLine) {
        signEl.firstElementChild.textContent = signLine;
        // 两个 rAF 后再加类，保证动画从 0 开始（同一帧内加类浏览器会跳过过渡）
        requestAnimationFrame(() => requestAnimationFrame(() => signEl.classList.add('write')));
      }
    }
    const relicIds = Engine.ownedRelics();
    const relics = relicIds.map((id) => D.relics[id].short).join(' ') || '无';
    sum.vow = s.flags.vow || 'none';
    const vowDef = D.vows[s.flags.vow] || D.vows.none;
    const ringList = Engine.rings();
    // 回响数 = 拿到的锁环覆盖的章数（击败 Boss 即得，四章全拿 = 满回响）
    const echoDone = [1, 2, 3, 4].filter((i) => s.flags['echo_' + i]).length;
    const seal = sealOf(s, echoDone);
    const sealDef = SEALS[seal];
    const ember = emberOf(s, echoDone, vowDef);
    const emberGain = ember.total;
    sum.seal = seal;
    sum.goals = echoDone;
    // 跨局履历：这局结束了，塔替你记一笔（P-4），余烬进近 3 局滑动平均
    Meta.recordRun({
      ending: s.ending, won: true, vow: sum.vow,
      fullChapters: echoDone, heart: s.flags.heart || null,
      floor: sum.floor, time: sum.time, seal, ember: emberGain,
      // 这里比结算摘要里算余裕更早，直接问引擎，别依赖变量声明顺序
      margin: (Engine.battleMargin() || {}).grade || '',
    });
    Meta.ringWin(Engine.rings());   // 图鉴里记「带它通关过几次」
    $('endScore').innerHTML = `<span class="es-grade ${seal}" data-seal="${seal}">${sealDef.name}</span>
      <span class="es-meta">${s.ending === 'true' ? '真结局' : '普通结局'}${s.flags.heart === 'taken' ? ' · 塔心带走' : s.flags.heart === 'left' ? ' · 塔心留下' : ''} · 回响 ${echoDone}/4 · 遗物 ${relicIds.length} · 锁环 ${ringList.length}</span>
      <span class="es-num">✦ ${emberGain}<small>余烬</small></span>`;
    $('endScore').title = `塔印「${sealDef.name}」：${sealDef.desc}`;
    const ed = $('endEmberDetail');
    if (ed) {
      // 与开局立誓的余额行呼应：结算这一刻「之前 → 现在」，落袋看得见
      const before = Meta.ember;
      ed.innerHTML = `<span class="eed-title">本局余烬</span>`
        + ember.parts.map((p) => `<span>${p.label} <b>+${p.n}</b></span>`).join('')
        + `<span class="eed-sum">合计 <b>+${emberGain}</b></span>`
        + `<span class="eed-total">✦ ${before} → ${before + emberGain}</span>`;
    }
    $('endTag').textContent = sealDef.desc;
    const brief = [];
    brief.push(`带走 ${relicIds.length} 件遗物 · 击杀 ${s.flags.killCount || 0} 只`);
    if (s.flags.worstHit) brief.push(`最狠的一场：${s.flags.worstName} −${s.flags.worstHit}`);
    brief.push(s.flags.retries ? `重来本层 ${s.flags.retries} 次` : '一次没回头');
    const hint = nextSealHint(seal, s, echoDone);
    if (hint) brief.push(`下一枚塔印：${hint}`);
    // 本局首次收录进图鉴的：把「再玩一局」的动机从通关扩到集齐
    const newly = Array.isArray(s.flags.collectNew) ? s.flags.collectNew : [];
    if (newly.length) {
      const head = newly.slice(0, 4).join('、') + (newly.length > 4 ? ` 等 ${newly.length} 件` : '');
      brief.push(`图鉴新收录：${head}（还差 ${collectionRemain()} 件集齐）`);
    }
    // 带着川的断剑走到结局：给他一个名分（收集向的隐性认可，不加余烬）
    if (s.flags.relic_edge) brief.push(`<i class="brief-tip" title="第八位勇者川的断剑，一直在你腰上。他没能走完的路，你替他走完了。">替川走到了塔顶 ⓘ</i>`);
    Meta.add(emberGain);
    // IAA 卡点：余烬翻倍（Ads 未接入时按钮不出现，见 adOfferDouble）
    adOfferDouble(emberGain, ed);
    // 首通奖励只发一次：结算落袋后才标记，刷新页面也不会重发
    if (vowDef.ember) Meta.claimFirstWin(sum.vow);
    // 决战余裕：用「打完碑魔那一刻的血」给一个 S/A/B/C，和塔印并列——塔印看的是流程，这个看的是硬实力
    const margin = Engine.battleMargin();
    if (margin) {
      // 不到 S 就把话说明白，但别把整句塞进胶囊（摘要区已经很密）——短标签 + ⓘ 悬停
      const hint = margin.grade === 'S' ? '' : ' · <i class="brief-tip" title="两条路都能上 S：少打怪把血留到碑魔，或打到 40 只以上攒满战意（决战减伤 36%）">上 S 有两条路 ⓘ</i>';
      brief.push(`决战余裕 <b>${margin.grade}</b> · ${margin.label}（剩 ${margin.pct}%）${hint}`);
    }
    // 榜单排序用：同层同结局时，余裕高的排前面
    sum.margin = margin ? margin.grade : null;
    brief.push(`✦ +${emberGain}`);
    // 摘要区默认收起后半段（现在常有 6–8 枚胶囊，全铺开会把结算面板顶得很长）
    const BRIEF_SHOW = 4;
    const briefEl = $('endBrief');
    briefEl.classList.remove('open');
    briefEl.innerHTML = brief.map((t, i) => `<span${i >= BRIEF_SHOW ? ' class="brief-extra"' : ''}>${t}</span>`).join('')
      + (brief.length > BRIEF_SHOW ? `<button class="brief-toggle" type="button">＋${brief.length - BRIEF_SHOW} 项 ▾</button>` : '');
    const briefToggle = briefEl.querySelector('.brief-toggle');
    if (briefToggle) {
      briefToggle.addEventListener('click', () => {
        const open = briefEl.classList.toggle('open');
        briefToggle.textContent = open ? '收起 ▴' : `＋${brief.length - BRIEF_SHOW} 项 ▾`;
      });
    }
    const ringShorts = ringList.map((id) => D.rings[id].short).join(' ') || '无';
    // 「剩余生命」用决战结束那一刻（与难度基准同口径）；之后买药回的血另标「现」
    const fh = s.flags.finalHp;
    const fm = s.flags.finalMaxHp;
    const curHp = Math.round(s.hp);
    const hpShown = (fh != null && fh !== curHp)
      ? `${fh} / ${fm} <small>决战结束时（现 ${curHp}）</small>`
      : (fh != null ? `${fh} / ${fm} <small>决战结束时</small>` : `${curHp}`);
    $('endStats').innerHTML = `
      <div>结局 <b>${endName(s.ending)}</b></div>
      <div>塔印 <b>${sealDef.name}</b></div>
      <div>最终等级 <b>Lv.${sum.level}</b></div>
      <div>攻击 / 防御 <b>${s.atk} / ${s.def}</b></div>
      <div>剩余生命 <b>${hpShown}</b></div>
      <div>击杀 <b>${s.flags.killCount || 0}</b></div>
      <div>遗物 <b>${relics}</b></div>
      <div>锁环 <b>${ringShorts}</b></div>
      <div>章回响 <b>${echoDone}/4 章</b></div>
      <div>塔心 <b>${s.flags.heart === 'taken' ? '带走' : s.flags.heart === 'left' ? '留下' : '未至'}</b></div>
      <div>誓约 <b>${(D.vows[s.flags.vow] || D.vows.none).name}</b></div>
      ${signed ? '<div>盾谱 <b>📖+📕 已集齐 · 名册有你的签名</b></div>' : ''}
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
    if ((mem.falls || 0) > 0) memItems.push(`💀 折戟 ×${mem.falls} · 上次倒在第 ${(mem.lastFallFloor || 0) + 1} 层`);
    const mc = mem.marginCounts || {};
    const marginTally = ['S', 'A', 'B', 'C'].filter((g) => mc[g]).map((g) => `${g}×${mc[g]}`).join(' · ');
    memItems.push(`决战余裕最好 ${mem.marginBest || '尚未记录'}${marginTally ? ` · ${marginTally}` : ''}`);
    const goals = [];
    // 1) 还没解锁的誓约：差多少余烬
    const lockedVow = Object.keys(D.vows).find((id) => D.vows[id].ember && !Meta.has(id));
    if (lockedVow) {
      const v = D.vows[lockedVow];
      const need = Math.max(0, v.ember - Meta.ember);
      goals.push(need > 0
        ? `再攒 ${need} ✦ 解锁「${v.name}」`
        : `「${v.name}」已可解锁——下一局开局选它`);
    }
    // 2) 没通关过的誓约
    const unWon = Object.keys(D.vows).filter((id) => id !== 'none' && !D.vows[id].ember && !(mem.vowWins || {})[id]);
    if (unWon.length) goals.push(`带着「${D.vows[unWon[0]].name}」走到一次结局`);
    // 3) 决战余裕还没拿过 S：把「避战流」钉进前三，别让这条隐藏策略永远没人试
    if (!(mc.S || 0)) goals.splice(2, 0, '拿一次决战余裕 S：清塔攒战意，或绕道省血');
    // 4) 没满过的章回响
    if ((mem.fullChapters || 0) < 4) goals.push(`把回响拿满的章推进到 ${(mem.fullChapters || 0) + 1}/4`);
    // 5) 双结局收集
    if (!(mem.endings.true || 0)) goals.push('去念出第六个名字');
    else if (!(mem.endings.plain || 0)) goals.push('试试另一条路：铁与霜');
    // 6) 塔心还没做过另一个选择
    if (!mem.heartTaken || !mem.heartLeft) goals.push(!mem.heartTaken ? '把塔心石带走一次' : '把塔心石留下一次');
    const goalsHtml = goals.length
      ? `<div class="mem-goals">${goals.slice(0, 3).map((g) => `<span>▸ ${g}</span>`).join('')}</div><p class="mem-note">塔在等你回来——为了上面这些。</p>`
      : '';
    const memWrap = $('endMemory');
    if (memWrap) {
      // 胜局不折履历：清掉死亡页留下的折叠按钮与 open 态，免得按钮挂在一整块展开内容上
      const oldTg = el.endOverlay.querySelector('.mem-toggle');
      if (oldTg) oldTg.remove();
      memWrap.classList.remove('open');
      const paint = () => {
        // 誓约全解锁后，余烬改去点亮层灯：一层一盏，纯收藏，不加战力
        const lampRow = !lockedVow
          ? `<div class="mem-lamps"><span>✦ ${Meta.ember} · 层灯 ${Meta.lamps}/${LAMP_MAX}</span>
              <button class="lamp-btn" data-lamp="1" ${Meta.ember < LAMP_COST || Meta.lamps >= LAMP_MAX ? 'disabled' : ''}>点亮一盏（${LAMP_COST} ✦）</button></div>`
          : '';
        memWrap.innerHTML = `<div class="mem-grid">${memItems.map((t) => `<div>${t}</div>`).join('')}</div>`
          + lampRow + goalsHtml;
      };
      paint();
      memWrap.onclick = (e) => {
        if (!e.target || !e.target.dataset || !e.target.dataset.lamp) return;
        const r = Meta.lightLamp(LAMP_COST);
        if (r !== 'ok') { warn(r === 'full' ? '十三盏灯都亮了' : `余烬不够，还差 ${LAMP_COST - Meta.ember} ✦`); return; }
        Sound.play('relic');
        vibrate(12);
        paint();
        refreshStartBadges();
      };
    }
    saveBoard(sum);
    $('endCode').textContent = encodeChallenge(sum);
    // 平台桥接读这份摘要上报，不用再从 DOM 里抠数字
    if (window.__tm) window.__tm.lastRun = {
      ending: sum.ending, vow: sum.vow, floor: sum.floor, time: sum.time,
      steps: sum.steps, seal, goals: echoDone,
    };
    Achievements.evaluate('finish', s, notifyAchievement);
    el.endOverlay.classList.add('show');
    refreshStartBadges();
  }

  // ---------- 标题页 ----------
  function refreshStartBadges() {
    const plain = Achievements.isUnlocked('end_plain');
    const tru = Achievements.isUnlocked('end_true');
    // 首次进塔不显示徽章：新人先看到「开始游戏」，收藏品等玩过一局再露脸
    $('endingBadges').innerHTML = (plain || tru || Achievements.count())
      ? `
      <span class="eb ${plain ? 'on' : ''}"><i>${plain ? '🕯' : '○'}</i>铁与霜</span>
      <span class="eb ${tru ? 'on true' : ''}"><i>${tru ? '🕯' : '○'}</i>第六个名字</span>
      <span class="eb ${Achievements.count() ? 'on' : ''}"><i>✦</i>成就 ${Achievements.count()}/${Achievements.DEFS.length}</span>
    `
      : '';
    const art = $('startArt');
    art.classList.toggle('lit', plain || tru);
    art.classList.toggle('true', tru);
    const em = $('startEmber');
    if (em) {
      // 标题页只讲履历与余额；「还差多少解锁」放到立誓面板和结局页才有意义
      const mem = Meta.memory;
      const parts = [];
      if ((mem.runs || 0) > 0) parts.push(`第 ${mem.runs + 1} 次进塔 · 最远第 ${mem.deepest || 0} 层`);
      if (Meta.ember > 0) parts.push(`✦ ${Meta.ember}`);
      if (Meta.lamps > 0) parts.push(`层灯 ${Meta.lamps}/${LAMP_MAX}`);
      if ((mem.falls || 0) > 0) parts.push(`💀 折戟 ×${mem.falls} · 上次第 ${(mem.lastFallFloor || 0) + 1} 层`);
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
    const card = $('floorCard');
    card.classList.remove('show');
    void card.offsetWidth;
    card.classList.add('show');
    clearTimeout(floorCardTimer);
    floorCardTimer = setTimeout(() => card.classList.remove('show'), hintMs(2100));
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
      walkTimer = setTimeout(step, walkMs(105));
    };
    step();
  }

  // ---------- 拖动选路（touch v2）：按住格子拖向一边，方向圆盘挑最短路线 ----------
  function routeOpen(cx, cy) {
    const s = Engine.state();
    if (!s) return null;
    if (cx === s.x && cy === s.y) return null;
    const ch = Engine.tile(cx, cy);
    if (D.monsters[ch]) return null; // 点怪走 clickMonster 那套，不进选路
    const groups = Engine.pathsTo(cx, cy);
    if (!groups) return null;
    const names = ['up', 'down', 'left', 'right'];
    const avail = names.filter((d) => groups[d]);
    if (!avail.length) return null;
    // 默认路线 = 默认寻路（pathTo）的首步方向，与轻触行为一致
    const defPath = Engine.pathTo(cx, cy);
    let defaultDir = null;
    if (defPath && defPath.length) {
      const [dx, dy] = defPath[0];
      defaultDir = dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
    }
    if (!defaultDir || !groups[defaultDir]) defaultDir = avail[0];
    // 分岔前的公共段：pathsTo 已给出默认路线的格子序列（defaultCells），截到分岔口为止
    const jx = groups.junction ? groups.junction[0] : null;
    const jy = groups.junction ? groups.junction[1] : null;
    let defCells = null;
    let defCut = 0;
    if (jx != null && groups.defaultCells) {
      defCells = [];
      for (const c of groups.defaultCells) {
        defCells.push(c);
        if (c[0] === jx && c[1] === jy) { defCut = defCells.length; break; }
      }
      if (!defCut) { defCells = null; defCut = 0; }
    }
    const out = { tx: cx, ty: cy, junction: groups.junction, defaultDir };
    for (const d of names) {
      if (!groups[d]) continue;
      const cells = (defCells && defCut > 1)
        ? defCells.concat(groups[d].cells.slice(1))
        : groups[d].cells.slice();
      const path = (defCells && defCut > 1 && defPath)
        ? defPath.slice(0, defCut - 1).concat(groups[d].path)
        : groups[d].path;
      out[d] = { path, cells };
    }
    return out;
  }

  function routePick(cx, cy, routes, dir) {
    const s = Engine.state();
    if (!s || !routes || !routes[dir]) return;
    // 拖动途中局面变了（比如路线被挡）：路线走不下去时 walkAlong 会自己停下，这里只挡明显失效的
    const r = routes[dir];
    if (!r || !r.path || !r.path.length) return;
    Tips.show('walk');
    stopWalk();
    walkAlong(r.path, cx, cy);
  }

  window.__tmRouteHooks = {
    open: routeOpen,
    pick: routePick,
  };

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
    // 「怎么走」教学改为底部横幅（Tips.banner）：它以前是全屏对白，
    // 会在寻路启动的同一瞬间打断 walkAlong（step 见 typing 即停）——
    // 玩家第一次点商店就'点完对白人物不动'，看起来像卡死。
    Tips.showWalkBanner();
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
    clearStuck();
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
    // 塔顶：一件遗物都没拿的人——告诉这条路真的走得通（4.6% 极限通关），但只有一次机会
    if (s.floor === 11 && !s.flags.noRelicTip && Engine.ownedRelics().length === 0) {
      s.flags.noRelicTip = true;
      Engine.save();
      warn('**烛**：一件遗物都没拿，你也走到这儿了。碑魔不给第二次机会——把它当最后一战打。');
      log('烛：这条路走得通，我只见过一次。', 'good');
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
        log(ev.msg, ev.good === false ? 'warn' : 'good');
        // 学会格挡：先播盾谱小传，接烛的用法教学（老玩家读过的不再复读）
        if (ev.blockLearned) {
          if (ev.story) playStory(ev.story, () => Tips.show('block'));
          else Tips.show('block');
        }
        // 后半部：小传播完提一句新比例
        if (ev.blockLearned2) {
          warn('**格挡强化**：承伤降到 **42%**，卸掉的伤三成化为经验。');
          if (ev.story) playStory(ev.story);
        }
        // 一袋金币：第六位勇者留的过路费，播一行来历
        if (ev.story === 'coinBagLore') playStory(ev.story);
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
      case 'shop': {
        // 每副货摊的首次对白：层号 → 剧情键（merchant = 第 3 层起，往后每 5 层一副）
        const firstMeet = { 2: 'merchant', 7: 'merchant2', 10: 'merchant3', 12: 'merchant4' };
        const intro = firstMeet[s.floor];
        if (intro && !s.flags[intro]) {
          s.flags[intro] = true;
          Engine.save();
          playStory(intro, () => { Sound.play('buy'); openShop(); });
        } else {
          openShop();
        }
        break;
      }
      case 'princess':
        if (ev.hasJournal) playStory('princessTrue', () => showEndingChoice());
        // 带着第八位勇者的断剑走到塔顶：薇拉会认出它（变体段；没捡过剑走原段，不剧透）
        else if (Engine.hasRelic('edge')) playStory('princessPlainSword', () => completeEnding('plain', false), null, 'veiled');
        else playStory('princessPlain', () => completeEnding('plain', false), null, 'veiled');
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
      if (el.collectionOverlay.classList.contains('show')) { if (e.key === 'Escape') closeCollection(); return; }

      const k = e.key.toLowerCase();
      let d = null;
      if (k === 'arrowup' || k === 'w') d = dirs.up;
      else if (k === 'arrowdown' || k === 's') d = dirs.down;
      else if (k === 'arrowleft' || k === 'a') d = dirs.left;
      else if (k === 'arrowright' || k === 'd') d = dirs.right;
      if (d) {
        e.preventDefault();
        const now = performance.now();
        if (e.repeat && now - lastKeyAt < walkMs(95)) return; // 键盘重复降速，避免一步三格
        lastKeyAt = now;
        stopWalk();
        act(d[0], d[1]);
      }
    });

    // 方向键：长按连走（320ms 后每 135ms 一格）；整体可收起/展开，状态存设置里（默认收起）
    const dpadWrap = $('dpadWrap');
    const dpadToggle = $('dpadToggle');
    function refreshDpad() {
      const collapsed = !Settings.dpad;
      if (dpadWrap) dpadWrap.classList.toggle('dpad-hidden', collapsed);
      if (dpadToggle) {
        dpadToggle.textContent = collapsed ? '▲' : '▼';
        dpadToggle.title = collapsed ? '展开方向键' : '收起方向键';
        dpadToggle.setAttribute('aria-label', dpadToggle.title);
      }
    }
    if (dpadToggle) dpadToggle.addEventListener('click', () => { Settings.toggleDpad(); refreshDpad(); vibrate(12); });
    refreshDpad();
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
          }, walkMs(135));
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

    // ---------- 怪物速查：长按（触屏）/ 右键（鼠标）怪物格子，弹一张小卡 ----------
    // 拖动选路回退后，「了解这只怪」一直没有入口；速查卡补上——只读信息，不改变玩法
    let probeTimer = 0;
    const probeDown = (e) => {
      const s = Engine.state();
      if (!s || covered()) return;
      const rect = el.canvas.getBoundingClientRect();
      const size = rect.width / 11;
      const x = Math.floor((e.clientX - rect.left) / size);
      const y = Math.floor((e.clientY - rect.top) / size);
      if (x < 0 || y < 0 || x > 10 || y > 10) return;
      const ch = Engine.tile(x, y);
      const m = D.monsters[ch];
      if (!m || m.ghost) return;
      // 触屏长按 420ms；鼠标右键立即弹
      const delay = e.pointerType === 'mouse' ? 0 : 420;
      clearTimeout(probeTimer);
      probeTimer = setTimeout(() => {
        if (covered() || battleBusy) return;
        openMonsterProbe(m, x, y, e.clientX, e.clientY);
      }, delay);
    };
    const probeCancel = () => clearTimeout(probeTimer);
    el.canvas.addEventListener('pointerdown', probeDown);
    el.canvas.addEventListener('pointermove', probeCancel);
    el.canvas.addEventListener('pointerup', probeCancel);
    el.canvas.addEventListener('pointercancel', probeCancel);
    el.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      probeDown(e);
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
    $('cfgClearSave').addEventListener('click', () => {
      Engine.reset();
      $('btnContinue').style.display = 'none';
      refreshStartBadges();
      log('存档已清空');
      warn('存档已清空（成就、结局与余烬保留）');
    });
    $('cfgWipe').addEventListener('click', () => {
      Engine.reset();
      Achievements.reset();
      Tips.reset();
      // 收藏图鉴属于跨局履历，跟成就同级——全清时一起清，并把记档签名复位
      const wmem = Meta.memory;
      wmem.seenRelics = [];
      wmem.seenRings = [];
      wmem.ringStats = {};
      Meta.saveMemory();
      collectSig = null;
      try { localStorage.removeItem('towermates_board'); } catch (e) {}
      $('btnContinue').style.display = 'none';
      refreshStartBadges();
      refreshCfg();
      warn('已清空存档、成就、收藏与榜单');
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
    $('resetCancel').addEventListener('click', () => { el.resetConfirmOverlay.classList.remove('show'); });
    $('resetConfirm').addEventListener('click', () => {
      el.resetConfirmOverlay.classList.remove('show');
      doResetRun();
    });
    $('gateClose').addEventListener('click', () => el.gateOverlay.classList.remove('show'));
    $('btnAgain').addEventListener('click', () => {
      el.endOverlay.classList.remove('show', 'death-mode');
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
    const storyBtn = $('cfgStory');
    if (storyBtn) storyBtn.addEventListener('click', () => { closeCfg(); playStory('intro'); });
    $('cfgBattleSpeed').addEventListener('click', () => { Settings.cycleBattleSpeed(); refreshCfg(); });
    $('cfgFullRounds').addEventListener('click', () => { Settings.toggleFullRounds(); refreshCfg(); });
    $('cfgHintSpeed').addEventListener('click', () => { Settings.cycleHintSpeed(); refreshCfg(); });
    $('cfgHintBook').addEventListener('click', () => { el.cfgOverlay.classList.remove('show'); openHintBook(); });
    $('hbClose').addEventListener('click', () => el.hintBookOverlay.classList.remove('show'));
    $('cfgCollection').addEventListener('click', () => { el.cfgOverlay.classList.remove('show'); openCollection(); });
    $('colClose').addEventListener('click', closeCollection);
    if (el.stuckBar) el.stuckBar.addEventListener('click', () => {
      if (stuckInfo) sayHint(stuckInfo.key, stuckInfo.vars);
    });
  }

  function openCfg() {
    refreshCfg();
    el.cfgOverlay.classList.add('show');
  }
  // ---------- 重看提示：设置里列出全部角色台词，点一条重播 ----------
  const BOOK_VARS = { n: '3', name: '新的誓约', need: '17', atk: '11', gap: '6', dmg: '2482', hp: '1450' };
  const bookText = (t) => String(t).replace(/\{(\w+)\}/g,
    (m, k) => (BOOK_VARS[k] != null ? BOOK_VARS[k] : k));
  function richHtml(str) {
    return String(str)
      .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }
  function openHintBook() {
    const list = $('hbList');
    if (!list) return;
    // 用当前真实状态填变量：卡关台词在面板里也显示「你现在的数字」
    const s = Engine.state();
    const liveVars = s ? Object.assign({}, BOOK_VARS, {
      need: stuckInfo && stuckInfo.vars.need || BOOK_VARS.need,
      atk: s.atk, hp: s.hp, defNow: s.def, defGap: stuckInfo && stuckInfo.vars.defGap || 2,
      dmg: stuckInfo && stuckInfo.vars.dmg || BOOK_VARS.dmg, rounds: stuckInfo && stuckInfo.vars.rounds || 4,
      n: nearestShopFloor(s.floor),
    }) : BOOK_VARS;
    const fill = (t) => String(t).replace(/\{(\w+)\}/g,
      (m, k) => (liveVars[k] != null ? liveVars[k] : m));
    const groups = [
      { title: '常规提示', src: S.hints, seenFlag: true },
      { title: '关键提示', src: S.keyHints, seenFlag: false },
    ];
    let html = '';
    for (const g of groups) {
      html += `<div class="hb-group">${g.title}</div>`;
      Object.keys(g.src || {}).forEach((key) => {
        const row = (g.src[key] || [])[0];
        const who = Array.isArray(row) ? (row[0] || '旁白') : '旁白';
        const txt = fill(Array.isArray(row) ? row[1] : String(row || ''));
        const unseen = g.seenFlag && !Tips.seen(key);
        html += `<button class="hb-item${unseen ? ' unseen' : ''}" data-key="${key}" data-group="${g.title}" data-text="${txt.replace(/"/g, '&quot;')}"><span class="hb-who">${who}</span><span>${richHtml(txt)}</span></button>`;
      });
    }
    list.innerHTML = html;
    // 关键字过滤：按台词文本匹配，空组标题一并藏掉
    const filter = $('hbFilter');
    if (filter) {
      filter.value = '';
      filter.oninput = () => {
        const kw = filter.value.trim().toLowerCase();
        let lastGroup = null;
        list.querySelectorAll('.hb-item, .hb-group').forEach((n) => {
          if (n.classList.contains('hb-group')) { n.hidden = true; lastGroup = n; return; }
          const hit = !kw || (n.dataset.text || '').toLowerCase().indexOf(kw) >= 0;
          n.hidden = !hit;
          if (hit && lastGroup) lastGroup.hidden = false;
        });
      };
    }
    list.querySelectorAll('.hb-item').forEach((b) => {
      b.addEventListener('click', () => {
        const lines = (b.dataset.group === '常规提示' ? S.hints : S.keyHints)[b.dataset.key];
        el.hintBookOverlay.classList.remove('show');
        if (!lines) return;
        say(lines.map((row) => Array.isArray(row)
          ? [row[0], fill(row[1]), row[2] || '']
          : fill(row)));
      });
    });
    el.hintBookOverlay.classList.add('show');
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
    $('cfgFastVal').textContent = Settings.fast ? '开（演出 ×0.42 · 走路 ×0.65）' : '关';
    $('cfgFastVal').className = Settings.fast ? '' : 'off';
    $('cfgBattleSpeedVal').textContent = BATTLE_SPEED_NAME[Settings.battleSpeed];
    $('cfgFullRoundsVal').textContent = Settings.fullRounds ? '开（每刀真实伤害）' : '关';
    $('cfgFullRoundsVal').className = Settings.fullRounds ? '' : 'off';
    $('cfgHintSpeedVal').textContent = HINT_SPEED_NAME[Settings.hintSpeed];
    $('cfgHintBookVal').textContent = `全部 ${Object.keys(S.hints || {}).length + Object.keys(S.keyHints || {}).length} 条 ›`;
    $('cfgCollectionVal').textContent = collectionText() + ' ›';
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
    'codexOverlay', 'cfgOverlay', 'hintBookOverlay', 'choiceOverlay', 'altarOverlay', 'heartOverlay', 'vowOverlay', 'eventOverlay', 'gateOverlay', 'echoOverlay', 'endOverlay', 'resetConfirmOverlay', 'collectionOverlay'];
  function covered() {
    for (const id of FULL_OVERLAYS) {
      if (el[id] && el[id].classList.contains('show')) return true;
    }
    return false;
  }

  // ---------- 立誓 ----------
  // 首屏只回答一个问题：这局按哪条规矩走。余烬余额、还差几局、首通奖励一律不讲——
  // 想解锁的人会去点下面那排小 chip，不想的人不该开屏就被一串数字埋掉。
  function openVow() {
    const all = Object.keys(D.vows);
    const lockedIds = all.filter((id) => D.vows[id].ember && !Meta.has(id));
    const shown = all.filter((id) => lockedIds.indexOf(id) < 0);
    // 余额一行：当前有多少 ✦。锁着的才补一句「还差 N」，够换的直接写「可解锁」
    const emberLine = $('vowEmber');
    if (emberLine) {
      if (Meta.ember > 0 || lockedIds.length) {
        // 只显示数量本身，不带任何附注（用户要求：展示余烬后不加乱七八糟的文字）
        emberLine.textContent = `✦ ${Meta.ember}`;
        emberLine.hidden = false;
      } else {
        emberLine.hidden = true;
      }
    }
    // 「余烬是什么」注释：只在还没通关过时显示（Meta.memory.runs === 0），
    // 通关过的人已经从结算页见过它落袋，不再解释
    const emberNote = $('vowEmberNote');
    if (emberNote) {
      const played = (Meta.memory && Meta.memory.runs) || 0;
      emberNote.hidden = played > 0 || !lockedIds.length;
    }
    el.vowCards.innerHTML = shown.map((id) => {
      const v = D.vows[id];
      // 用户明确要求：开局不展示每局预计余烬收益——那是结算页才该出现的数字
      const tierCls = { '轻羽': 't-easy', '无名之分': 't-normal', '重金': 't-hard', '铁色': 't-nightmare' }[v.tag] || '';
      const tier = `<span class="vc-tier ${tierCls}">${v.tag}</span>`;
      // 上局用的誓约标角标：重开的人一眼认出自己那条（焦点 B：重复认卡是纯劳动）
      const lastMark = (Meta.memory.lastVow || '') === id ? '<span class="vc-last">上局</span>' : '';
      // 代价高亮：desc 里「不能 / −N」这类负面词挑出来染红，选之前先看见失去什么
      const costRe = /不能[^；;]*|攻击 −\d+|物价 \+\d+%|(?:秤的)?价目 \+\d+%/g;
      const cost = (v.desc.match(costRe) || []).join(' · ');
      const rest = cost ? v.desc.split(costRe).map((p) => p.replace(/^[；;、]+|[；;、]+$/g, '').trim()).filter(Boolean).join('；') : v.desc;
      return `<button class="vow-card ${id === 'none' ? 'hero' : ''}" data-vow="${id}">
        <span class="vc-head"><span class="vc-emoji">${v.emoji}</span>${tier}${lastMark}</span>
        <span class="vc-name">${v.name}</span>
        <span class="vc-desc">${rest}</span>
        ${cost ? `<span class="vc-cost">${cost}</span>` : ''}
      </button>`;
    }).join('');
    const lockBox = $('vowLocked');
    if (lockBox) {
      lockBox.hidden = !lockedIds.length;
      lockBox.innerHTML = lockedIds.map((id) => {
        const v = D.vows[id];
        const short = Math.max(0, v.ember - Meta.ember);
        return `<button class="vow-chip ${short > 0 ? 'poor' : ''}" data-lock="${id}" title="${v.desc}">🔒 ${v.name} · ${short > 0 ? `还差 ${short} ✦` : `可解锁 ${v.ember} ✦`}</button>`;
      }).join('');
      lockBox.querySelectorAll('.vow-chip').forEach((b) => {
        b.addEventListener('click', () => chooseVow(b.dataset.lock));
      });
    }
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
    deathShown = false; // 新一局要能重新弹死亡结算：上一局置的 true 必须清掉
    // 收藏去重签名也要清：新局如果恰好又拿到上一局那批遗物，签名相同会让「图鉴新收录」漏记
    collectSig = null;
    el.endOverlay.classList.remove('death-mode', 'show');
    el.log.innerHTML = '';
    el.startOverlay.classList.remove('show');
    el.shopOverlay.classList.remove('show');
    el.endOverlay.classList.remove('show');
    el.choiceOverlay.classList.remove('show');
    refreshHud();
    const vs = D.vows[Engine.vow()] || D.vows.none;
    // 序章只在第一次进塔时播：第 N 次重开还被迫读同一段，是纯粹的空等（焦点 B 无聊点）。
    // 想回看走设置里的「重看序章」，不占开局时间。
    const seenIntro = (Meta.memory.runs || 0) > 0;
    const begin = () => {
      enterFloor(true);
      if (Engine.vow() !== 'none') log(`你立下了${vs.name}：${vs.desc}`, 'gold');
      log('你踏入了魔塔。塔顶传来极轻的、像铃声一样的声音。', 'gold');
      if (seenIntro) log('序章在读过了——设置里可以重看。', 'dim');
      // 开局教学：不再走对白——棋盘标注（高亮格子 + 虚线 + 说明卡），点击「知道了」才收。
      // 用 setTimeout 避开对白关闭的同步栈：等遮罩过渡完、布局稳定后再量尺寸定位。
      setTimeout(() => Tips.show('opening'), 350);
    };
    if (seenIntro) begin();
    else playStory('intro', begin);
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
    // 小生物受惊：一声轻啾（冷却 3.5s，避免连环惊飞时吵）
    // 钩子是可选能力：渲染器没带上它时静默降级，绝不让 boot 在这里中断
    let lastFlit = 0;
    if (typeof Renderer.onScare === 'function') Renderer.onScare(() => {
      const now = performance.now();
      if (now - lastFlit < 3500) return;
      lastFlit = now;
      Sound.play('flit');
    });
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

    // 渲染异常兜底：draw() 抛错（如特效参数异常）只丢当前帧，绝不炸掉 rAF 主循环——
    // 否则画面从此冻结、只能刷新。连续报错时压噪（同一异常每秒最多记一次）。
    let lastRenderErrAt = 0;
    window.__tmRenderErrors = [];
    function loop() {
      const s = Engine.state();
      // 遮罩完全盖住画布时不重绘：省电，也避免后台空转掉帧
      const force = Renderer.needsDraw && Renderer.needsDraw();
      if (s && !document.hidden && (!covered() || force)) {
        try {
          Renderer.draw(s);
        } catch (err) {
          const now = performance.now();
          if (now - lastRenderErrAt > 1000) {
            lastRenderErrAt = now;
            const rec = { at: Date.now(), msg: String(err && err.message || err), stack: String(err && err.stack || '').split('\n')[1] || '' };
            window.__tmRenderErrors.push(rec);
            if (window.__tmRenderErrors.length > 10) window.__tmRenderErrors.shift();
            if (typeof console !== 'undefined' && console.warn) console.warn('[render]', rec.msg);
          }
        }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  // 开发/自动化用：暴露少量内部入口，便于截图与回归（不影响正常玩法）
  window.__tm = {
    playStory, showEnd, openShop, openCodex, openBoard, openCfg, closeCfg,
    showFloorCard, showEndingChoice, completeEnding, setChoiceFocus, openHeart, chooseHeart, setHeartFocus, openVow, chooseVow, openEvent, chooseEvent, openGate, jumpTo: (i) => doJump(i), Meta,
    resolveBattle, act, clickMove, emberOf, refreshHud, refreshStartBadges,
    testRelicShowcase: () => { const st = Engine.state(); if (st) relicShowcase(st.x, st.y); },
    openEcho, chooseRing, closeEcho, resumePendingRing, setChapterColor, refreshCfg,
    // 提示系统：自动化可验证「加粗渲染 + 角色提示对白」
    richInto: renderRich, say, sayHint, warn, Tips,
    Settings, hintMs, openHintBook, showStuck, clearStuck,
    openMonsterProbe, showDeath, reviveFromAd, adOfferRevive, adOfferDouble,
    // 自动化专用：清死亡防重入标记再重弹——shot.html 折戟成就链路要连死多次
    deathAgain: (m, dmg) => { deathShown = false; showDeath(m, dmg); },
    resetDeath: () => { deathShown = false; },
    // 测试专用：showEnd 有 endShown 单次门，自动化要重播结算页时先解开门（玩家路径不经过它）
    resetEndShown: () => { endShown = false; },
    openCollection, closeCollection, collectionText, rememberCollection, collectionRemain, collectionNext, showColDetail, ringStatBoard,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
