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
  let choiceFocus = null;

  // ---------- 设置 ----------
  const Settings = (() => {
    let data = { fx: 'full', sfx: true, vib: true };
    try {
      const old = JSON.parse(localStorage.getItem('towermates_cfg') || 'null');
      const cur = JSON.parse(localStorage.getItem('towermates_cfg_v2') || 'null');
      if (cur) data = Object.assign(data, cur);
      else if (old) data = { fx: old.reduceFx ? 'low' : 'full', sfx: !old.mute, vib: true };
    } catch (e) {}
    const save = () => {
      try { localStorage.setItem('towermates_cfg_v2', JSON.stringify(data)); } catch (e) {}
    };
    return {
      get fx() { return data.fx; },
      get sfx() { return data.sfx; },
      get vib() { return data.vib; },
      cycleFx() { data.fx = data.fx === 'full' ? 'low' : 'full'; save(); return data.fx; },
      toggleSfx() { data.sfx = !data.sfx; save(); return data.sfx; },
      toggleVib() { data.vib = !data.vib; save(); return data.vib; },
    };
  })();
  const REDUCED = () => Settings.fx === 'low';

  // ---------- 引导 ----------
  const Tips = (() => {
    let seen = {};
    try { seen = JSON.parse(localStorage.getItem('towermates_tips_v1') || '{}'); } catch (e) {}
    return {
      show(key) {
        if (seen[key]) return;
        seen[key] = 1;
        try { localStorage.setItem('towermates_tips_v1', JSON.stringify(seen)); } catch (e) {}
        const g = $('guide');
        $('guideText').textContent = S.tips[key] || key;
        g.classList.add('show');
        clearTimeout(guideTimer);
        guideTimer = setTimeout(() => g.classList.remove('show'), 5200);
      },
      reset() { seen = {}; try { localStorage.removeItem('towermates_tips_v1'); } catch (e) {} },
    };
  })();

  // ---------- 音效 ----------
  const Sound = (() => {
    let actx = null;
    let music = null;
    function ensure() {
      if (!Settings.sfx) return null;
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    }
    function beep(freq, dur, type, gain, slide, delay) {
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
    // 深层垫音：越往上基频越低，塔顶最沉
    function setPad(floor) {
      const f = { 3: 55, 4: 49, 5: 43.65 }[floor] || 0;
      if (!Settings.sfx || !f) { stopPad(); return; }
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

    const map = {
      step: () => beep(200 + Math.random() * 30, 0.04, 'sine', 0.014),
      hit: () => { beep(180, 0.09, 'sawtooth', 0.045, 80); beep(90, 0.12, 'square', 0.035, 60); },
      hitBig: () => { beep(140, 0.17, 'sawtooth', 0.055, 50); beep(70, 0.22, 'square', 0.045, 40); beep(460, 0.09, 'triangle', 0.035, 180); },
      pick: () => { beep(660, 0.06, 'triangle', 0.04); beep(990, 0.1, 'triangle', 0.032, null, 0.05); },
      relic: () => { beep(523, 0.12, 'sine', 0.045); beep(784, 0.14, 'sine', 0.04, null, 0.09); beep(1047, 0.22, 'triangle', 0.035, null, 0.19); },
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
    return { play(n) { if (map[n]) map[n](); }, startMusic, stopMusic, setPad };
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
    altarOverlay: $('altarOverlay'), altarCards: $('altarCards'),
    hitFlash: $('hitFlash'), hpGhost: $('hpGhost'), endScore: $('endScore'),
    toast: $('toast'), warnPill: $('warnPill'),
    battleScene: $('battleScene'),
    bsHero: $('bsHero'), bsFoe: $('bsFoe'),
    bsHeroBar: $('bsHeroBar'), bsFoeBar: $('bsFoeBar'),
    bsHeroHp: $('bsHeroHp'), bsFoeHp: $('bsFoeHp'),
    bsName: $('bsName'), bsRounds: $('bsRounds'), bsNumbers: $('bsNumbers'),
    guide: $('guide'),
  };

  // ---------- 顶部提示 ----------
  function warn(msg) {
    const p = el.warnPill;
    if (!p) return;
    p.textContent = msg;
    p.classList.add('show');
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => p.classList.remove('show'), 1800);
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
  const RELIC_ORDER = ['ward', 'edge', 'ember', 'steel', 'thrift', 'vigor', 'scout'];
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
  }
  function buildFloorDots() {
    el.floorDots.innerHTML = D.floors.map(() => '<i></i>').join('');
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
  function playStory(key, cb) {
    // 对白期间画面暂停重绘，这里先补一帧，避免遮罩后面是空画布
    if (Engine.state() && !covered()) { try { Renderer.draw(Engine.state()); } catch (e) {} }
    const script = Array.isArray(key) ? key : S[key];
    if (!script) { if (cb) cb(); return; }
    const lines = script.map((row) => {
      if (Array.isArray(row)) return { who: row[0] || '', text: row[1] || '', mood: row[2] || '' };
      return { who: '', text: String(row), mood: '' };
    });
    typing = { lines, idx: 0, cb: cb || null };
    el.dialogOverlay.classList.add('show');
    renderLine();
  }

  function renderLine() {
    if (!typing) return;
    const line = typing.lines[typing.idx];
    const isThink = line.mood === 'think';
    $('dlgWho').textContent = line.who;
    $('dlgWho').className = 'dlg-who ' + (line.who === '烛' ? 'ghost'
      : line.who === '薇拉' ? 'vera'
        : line.who === '魔王' || line.who === '炬' ? 'boss'
          : line.who === '秤' ? 'merchant' : '');
    $('dlgWho').style.display = line.who ? '' : 'none';
    const text = $('dlgText');
    text.textContent = line.text;
    text.className = 'dlg-text' + (isThink ? ' think' : '');
    $('dlgBox').classList.toggle('narration', !line.who);
    $('dlgPortrait').innerHTML = window.Portraits ? window.Portraits.render(line.who, line.mood || 'calm') : '';
    $('dlgCue').textContent = typing.idx >= typing.lines.length - 1 ? '点击结束' : '▼';
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
    el.dialogOverlay.classList.remove('show');
    const cb = typing && typing.cb;
    typing = null;
    $('dlgPortrait').innerHTML = '';
    if (cb) cb();
  }

  // ---------- 挑战码 / 榜单 ----------
  function encodeChallenge(sum) {
    const raw = [sum.ending === 'true' ? 1 : 0, sum.floor, sum.level, sum.steps, sum.time].join('.');
    try {
      return btoa(unescape(encodeURIComponent('TM' + raw))).replace(/=+$/, '');
    } catch (e) {
      return 'TM' + raw;
    }
  }
  function loadBoard() {
    try { return JSON.parse(localStorage.getItem('towermates_board') || '[]'); } catch (e) { return []; }
  }
  function saveBoard(entry) {
    const list = loadBoard();
    list.push(entry);
    list.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.ending === 'true') - (a.ending === 'true'));
    try { localStorage.setItem('towermates_board', JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }
  const fmtTime = (t) => (t >= 60 ? `${Math.floor(t / 60)}分${t % 60}秒` : `${t}秒`);
  const endName = (e) => (e === 'true' ? '第六个名字' : e === 'plain' ? '铁与霜' : '未竟');

  function openBoard() {
    const mine = loadBoard().map((x) => Object.assign({ mine: true }, x));
    const all = S.shadowRivals.concat(mine);
    all.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.ending === 'true') - (a.ending === 'true'));
    $('boardList').innerHTML = all.slice(0, 10).map((r, i) => `<div class="bd-row ${r.mine ? 'mine' : ''}">
        <span class="bd-rank">${i + 1}</span>
        <span class="bd-name">${r.mine ? '你' : r.name}</span>
        <span class="bd-end ${r.ending === 'true' ? 't' : ''}">${endName(r.ending)}</span>
        <span class="bd-floor">${r.floor}层</span>
        <span class="bd-steps">${r.steps}步</span>
        <span class="bd-time">${r.score || 0}分</span>
      </div>`).join('');
    const codeEl = $('myCode');
    codeEl.textContent = mine.length ? encodeChallenge(mine[0]) : '—— 通关后生成 ——';
    $('achCount').textContent = `成就 ${Achievements.count()}/${Achievements.DEFS.length}`;
    el.boardOverlay.classList.add('show');
  }
  function closeBoard() { el.boardOverlay.classList.remove('show'); }

  // ---------- 图鉴 ----------
  function openCodex() {
    const s = Engine.state();
    if (!s || !s.flags.codex) return;
    const maxHp = s.maxHp || Math.max(s.hp, 1000);
    const order = ['A', 'B', 'C', 'D', 'E', 'W', 'F', 'H', 'V', 'Z'];
    $('codexList').innerHTML = order.map((ch) => {
      const m = D.monsters[ch];
      const p = Engine.predict(ch);
      let loss = '无法破防';
      let cls = 'danger';
      if (p && p.damage != null) {
        loss = p.damage === 0 ? '无伤' : `-${p.damage}`;
        cls = p.damage === 0 ? 'safe' : p.damage >= maxHp * 0.25 ? 'danger' : 'warn';
      }
      return `<div class="cx-row">
        <span class="cx-emoji">${m.emoji}</span>
        <span class="cx-name">${m.name}<i class="cx-tag">${m.kind}</i></span>
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
    const speed = window.__battleSpeed || 1;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));

    const bg = Renderer.snapshot();
    if (bg) el.battleScene.style.setProperty('--bg', `url(${bg})`);

    el.bsHero.textContent = '🧙';
    el.bsFoe.textContent = m.emoji;
    el.bsName.textContent = m.name + (m.boss ? ' · 塔的主人' : '');
    el.bsRounds.textContent = `回合 1 / ${pred.rounds}`;
    el.bsHeroHp.textContent = Math.round(heroHp);
    el.bsFoeHp.textContent = Math.round(foeHp);
    el.bsHeroBar.style.width = '100%';
    el.bsFoeBar.style.width = '100%';
    el.bsNumbers.innerHTML = '';
    el.battleScene.classList.add('show');
    el.battleScene.classList.remove('hero-win');

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
        if (i < K - 1 && !skipped) {
          el.bsFoe.classList.add('lunge-l');
          await wait(130);
          el.bsFoe.classList.remove('lunge-l');
          heroHp = Math.max(1, heroHp - pred.per);
          bars();
          if (pred.per > 0) dmgNum(el.bsHero, '-' + pred.per, '#ff8f8f');
          el.bsHero.classList.add('hit');
          vibrate(12);
          await wait(95);
          el.bsHero.classList.remove('hit');
        }
      }
      foeHp = 0;
      heroHp = Math.max(1, s.hp - pred.damage);
      bars();
      el.bsFoe.classList.add('ko');
      el.battleScene.classList.add('hero-win');
      Sound.play(m.boss ? 'hitBig' : 'hit');
      await wait(370);
      el.battleScene.classList.remove('show');
      el.battleScene.classList.remove('hero-win');
      el.bsFoe.classList.remove('ko', 'hit');
      el.bsHero.classList.remove('hit', 'lunge-r', 'lunge-l');
      el.battleScene.onclick = null;
      done();
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
      log(`升级！Lv.${s2.level}　攻击+${3 * res.levelUps}　防御+${3 * res.levelUps}　生命+${150 * res.levelUps}`, 'gold');
    }
    if (res.boss) {
      log('魔王散成六盏灯，一层一层落了下去。', 'gold');
      s2.flags.bossKilled = true;
      Engine.save();
      Sound.stopMusic();
    }
    if (res.damage > 0 && (!s2.flags.worstHit || res.damage > s2.flags.worstHit)) {
      s2.flags.worstHit = res.damage;
      s2.flags.worstName = res.monster.name;
      Engine.save();
    }
    Achievements.evaluate('kill', s2, notifyAchievement);
    refreshHud();
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
    const pred = Engine.predict(ch);
    if (!m || !pred) return;

    if (!pred.win) {
      Sound.play('lock');
      vibrate(20);
      Renderer.flashTile(tx, ty, 'rgba(255,80,80,0.35)', 260);
      Renderer.shake(130, 2.5);
      if (m.boss) {
        warn('打不过。回第 3 层找秤，把金币换成力量。');
        log('魔王太强了。塔里还有没清完的怪，或者回第 3 层找秤。', 'warn');
      } else {
        warn(pred.reason === '攻击力不足，无法破防' ? '攻击力不足，无法破防' : '这一战会要你的命，先变强吧');
        log(`无法战胜${m.name}：${pred.reason}`, 'warn');
      }
      return;
    }

    Tips.show('fight');

    if (m.boss && !s.flags.boss) {
      s.flags.boss = true;
      Engine.save();
      playStory('boss', () => resolveBattle(dx, dy));
      return;
    }

    battleBusy = true;
    playBattleScene({ monster: m, pred }, () => {
      const res = Engine.fight(dx, dy);
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
            warn('窥探之镜已解锁：地图上会标出每只怪的预计伤害');
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
    Sound.play('relic');
    vibrate(20);
    const T = TN();
    Renderer.ring(s.x, s.y, 'rgba(255,225,150,0.9)', T * 2.6, 640);
    Renderer.burst(s.x * T + T / 2, s.y * T + T / 2, {
      count: 18, colors: ['#ffe6a8', '#ffd27d', '#fff4d6'], speed: 120, life: [450, 900],
    });
    log(res.msg, 'gold');
    warn(res.msg);
    Tips.show('relic');
    Achievements.evaluate('relic', s, notifyAchievement);
    refreshHud();
    const lore = S.relicLore && S.relicLore[id];
    if (lore) setTimeout(() => { if (!typing) playStory(lore); }, 260);
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

  // ---------- 评分 ----------
  function scoreOf(s, sum, relicCount) {
    const maxHp = s.maxHp || 1;
    let sc = 300;
    sc += s.ending === 'true' ? 700 : 250;
    sc += Math.round((Math.max(0, s.hp) / maxHp) * 400);
    sc += (s.flags.killCount || 0) * 20;
    sc += relicCount * 80;
    sc -= Math.round(sum.steps * 0.25);
    sc -= Math.round(sum.time * 0.15);
    sc -= (s.flags.retries || 0) * 80;
    return Math.max(0, Math.round(sc));
  }
  const gradeOf = (sc) => (sc >= 1550 ? 'S' : sc >= 1200 ? 'A' : sc >= 850 ? 'B' : 'C');

  // ---------- 结局 ----------
  function showEnd() {
    if (endShown) return;
    endShown = true;
    stopWalk();
    const s = Engine.state();
    const E = s.ending === 'true' ? S.endingTrue : S.endingPlain;
    const sum = Engine.summary();

    Sound.play('win');
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
    const relicIds = Engine.ownedRelics();
    const relics = relicIds.map((id) => D.relics[id].short).join(' ') || '无';
    const sc = scoreOf(s, sum, relicIds.length);
    const grade = gradeOf(sc);
    sum.score = sc;
    const hpPct = Math.max(0, Math.round((s.hp / (s.maxHp || 1)) * 100));
    $('endScore').innerHTML = `<span class="es-grade ${grade}">${grade}</span>
      <span class="es-meta">${s.ending === 'true' ? '真结局' : '普通结局'} · 残血 ${hpPct}% · 击杀 ${s.flags.killCount || 0} · 遗物 ${relicIds.length}</span>
      <span class="es-num">${sc}<small>分</small></span>`;
    const TAG = {
      S: '六盏灯全亮。这一趟，你没欠谁。',
      A: '活得不算漂亮。但你活着下来了。',
      B: '你带走了塔的一半秘密。',
      C: '塔记住了你的名字——仅此而已。',
    };
    $('endTag').textContent = TAG[grade] || '';
    const brief = [];
    brief.push(`带走 ${relicIds.length} 件遗物 · 击杀 ${s.flags.killCount || 0} 只`);
    if (s.flags.worstHit) brief.push(`最狠的一场：${s.flags.worstName} −${s.flags.worstHit}`);
    brief.push(s.flags.retries ? `重来本层 ${s.flags.retries} 次` : '一次没回头');
    $('endBrief').innerHTML = brief.map((t) => `<span>${t}</span>`).join('');
    $('endStats').innerHTML = `
      <div>结局 <b>${endName(s.ending)}</b></div>
      <div>最终等级 <b>Lv.${sum.level}</b></div>
      <div>攻击 / 防御 <b>${s.atk} / ${s.def}</b></div>
      <div>剩余生命 <b>${Math.round(s.hp)}</b></div>
      <div>击杀 <b>${s.flags.killCount || 0}</b></div>
      <div>遗物 <b>${relics}</b></div>
      <div>步数 <b>${sum.steps} 步</b></div>
      <div>用时 <b>${fmtTime(sum.time)}</b></div>
    `;
    saveBoard(sum);
    $('endCode').textContent = encodeChallenge(sum);
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
  }

  // ---------- 楼层卡片 ----------
  let floorCardTimer = null;
  function showFloorCard(floor) {
    const f = D.floors[floor];
    $('fcNum').textContent = `第 ${floor + 1} 层 / 共 ${D.floors.length} 层`;
    $('fcName').textContent = f.name;
    $('fcTip').textContent = f.tip;
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
        // 路被怪挡着：走到跟前直接开打（打不过就停下）
        const s0 = Engine.state();
        const ch = Engine.tile(s0.x + dx, s0.y + dy);
        const m = D.monsters[ch];
        if (m && !m.ghost) {
          stopWalk();
          const pred = Engine.predict(ch);
          if (pred && pred.win) resolveBattle(dx, dy);
          else warn(`前面是${m.name}，打不过，先变强`);
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
    if (D.monsters[ch]) {
      let best = null;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
        const p = Engine.pathTo(cx + ox, cy + oy);
        if (p && p.length && (!best || p.length < best.length)) best = p;
      });
      if (best) { stopWalk(); walkAlong(best, cx, cy); return; }
      const near = Engine.pathToNear(cx, cy);
      if (near) { stopWalk(); walkAlong(near.path, near.x, near.y); warn('就近靠过去，前面有怪挡路'); return; }
      warn('没有能靠近它的路');
      return;
    }
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

  function enterFloor(first) {
    const s = Engine.state();
    const f = D.floors[s.floor];
    Renderer.fade(first ? 420 : 320);
    Renderer.setAmbient(s.floor);
    if (s.floor === 5 && !s.flags.bossKilled) Sound.startMusic();
    else Sound.stopMusic();
    Sound.setPad(s.floor);

    if (!first) log(`来到第 ${s.floor + 1} 层 · ${f.name}`, 'gold');
    log(f.tip);
    if (!first) showFloorCard(s.floor);

    Engine.beginFloor();

    // 剧情触发：密道的烛、狼厅的独白
    if (s.floor === 3 && !s.flags.candle2) {
      s.flags.candle2 = true;
      s.flags.secret1 = true;
      Engine.save();
      Achievements.evaluate('floor', s, notifyAchievement);
      playStory('candle2');
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
        Sound.play('relic');
        vibrate(18);
        Renderer.ring(Engine.state().x, Engine.state().y, 'rgba(255,225,150,0.9)', T * 2.6, 600);
        Renderer.burst(Engine.state().x * T + T / 2, Engine.state().y * T + T / 2, {
          count: 16, colors: ['#ffe6a8', '#ffd27d', '#fff4d6'], speed: 120, life: [450, 900],
        });
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
      case 'shop':
        if (!Engine.state().flags.merchant) {
          Engine.state().flags.merchant = true;
          Engine.save();
          playStory('merchant', () => { Sound.play('buy'); openShop(); });
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

    window.addEventListener('keydown', (e) => {
      if (el.startOverlay.classList.contains('show')) return;
      if (el.dialogOverlay.classList.contains('show') || typing) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advanceDialog(); }
        else if (e.key === 'Escape') skipDialog();
        else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); prevDialog(); }
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
          el.cfgOverlay.classList.contains('show') || el.choiceOverlay.classList.contains('show')) return;
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
    $('btnBoard').addEventListener('click', openBoard);
    $('btnBoard2').addEventListener('click', openBoard);
    $('boardClose').addEventListener('click', closeBoard);
    $('btnCodex').addEventListener('click', openCodex);
    $('codexClose').addEventListener('click', () => el.codexOverlay.classList.remove('show'));
    $('btnCopyCode').addEventListener('click', () => {
      const code = $('myCode').textContent;
      if (!code || code.startsWith('——')) return;
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => log('挑战码已复制', 'good'));
    });
    $('btnCfg').addEventListener('click', openCfg);
    $('cfgClose').addEventListener('click', closeCfg);
    $('btnHelp').addEventListener('click', () => { openCfg(); });
    $('btnReset').addEventListener('click', () => {
      Engine.reset();
      $('btnContinue').style.display = 'none';
      log('存档已清空');
      warn('存档已清空（成就与结局记录保留）');
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
    $('btnAgain').addEventListener('click', () => {
      el.endOverlay.classList.remove('show');
      Engine.reset();
      startGame();
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
      if (!Settings.sfx) { Sound.stopMusic(); Sound.setPad(-1); }
      else { const st = Engine.state(); if (st) Sound.setPad(st.floor); }
      refreshCfg();
    });
    $('cfgVib').addEventListener('click', () => { Settings.toggleVib(); refreshCfg(); vibrate(12); });
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
    $('cfgVibVal').textContent = Settings.vib ? '开' : '关';
    $('cfgVibVal').className = Settings.vib ? '' : 'off';
    const s = Engine.state();
    $('cfgRelics').innerHTML = RELIC_ORDER.map((id) => {
      const r = D.relics[id];
      const on = s && s.flags['relic_' + id];
      return `<div class="cfg-relic ${on ? 'on' : ''}"><i>${on ? r.emoji : '○'}</i>${r.name}<span>${on ? r.desc : '未获得'}</span></div>`;
    }).join('');
  }

  // 遮罩是否完全盖住画布（盖住时暂停重绘）
  const FULL_OVERLAYS = ['startOverlay', 'dialogOverlay', 'shopOverlay', 'boardOverlay',
    'codexOverlay', 'cfgOverlay', 'choiceOverlay', 'altarOverlay', 'endOverlay'];
  function covered() {
    for (const id of FULL_OVERLAYS) {
      if (el[id] && el[id].classList.contains('show')) return true;
    }
    return false;
  }

  // ---------- 启动 ----------
  function startGame() {
    Engine.newGame();
    stopWalk();
    endShown = false;
    el.log.innerHTML = '';
    el.startOverlay.classList.remove('show');
    el.shopOverlay.classList.remove('show');
    el.endOverlay.classList.remove('show');
    el.choiceOverlay.classList.remove('show');
    refreshHud();
    playStory('intro', () => {
      enterFloor(true);
      log('你踏入了魔塔。塔顶传来极轻的、像铃声一样的声音。', 'gold');
      Tips.show('walk');
    });
  }

  function continueGame() {
    const s = Engine.load();
    if (!s) return startGame();
    el.startOverlay.classList.remove('show');
    endShown = false;
    el.log.innerHTML = '';
    log(`继续冒险 · 第 ${s.floor + 1} 层`, 'gold');
    Renderer.setAmbient(s.floor);
    Renderer.fade(400);
    refreshHud();
    if (s.won) showEnd();
    if (s.floor === 5 && !s.flags.bossKilled) Sound.startMusic();
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
    $('btnNew').addEventListener('click', startGame);
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
    showFloorCard, showEndingChoice, completeEnding, setChoiceFocus,
    resolveBattle, act, refreshHud, refreshStartBadges,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
