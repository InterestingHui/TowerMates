// TowerMates · 魔塔原型 —— 交互与 UI（v0.3.3：撞怪即战 / 窥探之镜 / 成就 / 特效开关）
(function () {
  const D = window.GAME_DATA;
  const S = window.STORY;
  const $ = (id) => document.getElementById(id);

  let shopOpen = false;
  let endShown = false;
  let typing = null;
  let warnTimer = null;
  let battleBusy = false;

  const Settings = (() => {
    let data = { reduceFx: false, mute: false };
    try {
      data = Object.assign(data, JSON.parse(localStorage.getItem('towermates_cfg') || '{}'));
    } catch (e) {}
    function save() {
      try { localStorage.setItem('towermates_cfg', JSON.stringify(data)); } catch (e) {}
    }
    return {
      get reduceFx() { return data.reduceFx; },
      get mute() { return data.mute; },
      toggleReduce() { data.reduceFx = !data.reduceFx; save(); return data.reduceFx; },
      toggleMute() { data.mute = !data.mute; save(); return data.mute; },
    };
  })();

  const el = {
    stage: $('stage'),
    canvas: $('game'),
    floorName: $('floorName'),
    statAtk: $('statAtk'),
    statDef: $('statDef'),
    statGold: $('statGold'),
    statLv: $('statLv'),
    statExp: $('statExp'),
    keyY: $('keyY'),
    keyR: $('keyR'),
    log: $('log'),
    startOverlay: $('startOverlay'),
    shopOverlay: $('shopOverlay'),
    endOverlay: $('endOverlay'),
    dialogOverlay: $('dialogOverlay'),
    boardOverlay: $('boardOverlay'),
    codexOverlay: $('codexOverlay'),
    toast: $('toast'),
    warnPill: $('warnPill'),
    battleScene: $('battleScene'),
    bsHero: $('bsHero'),
    bsFoe: $('bsFoe'),
    bsHeroBar: $('bsHeroBar'),
    bsFoeBar: $('bsFoeBar'),
    bsHeroHp: $('bsHeroHp'),
    bsFoeHp: $('bsFoeHp'),
    bsName: $('bsName'),
    bsRounds: $('bsRounds'),
    bsNumbers: $('bsNumbers'),
  };

  // ---------- 音效 ----------
  const Sound = (() => {
    let ctx = null;
    let music = null;
    function ensure() {
      if (Settings.mute) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function beep(freq, dur, type, gain, slide) {
      const c = ensure();
      if (!c) return;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, c.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + dur);
      g.gain.setValueAtTime(gain || 0.035, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g).connect(c.destination);
      o.start();
      o.stop(c.currentTime + dur + 0.02);
    }
    function startMusic() {
      stopMusic();
      const c = ensure();
      if (!c) return;
      music = { oscs: [] };
      [55, 55.7].forEach((f) => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.value = 0.012;
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
    const map = {
      step: () => beep(220, 0.045, 'sine', 0.018),
      hit: () => { beep(180, 0.09, 'sawtooth', 0.05, 80); beep(90, 0.12, 'square', 0.04, 60); },
      hitBig: () => { beep(140, 0.16, 'sawtooth', 0.06, 50); beep(70, 0.2, 'square', 0.05, 40); beep(460, 0.08, 'triangle', 0.04, 180); },
      pick: () => { beep(660, 0.07, 'triangle', 0.05); beep(990, 0.1, 'triangle', 0.04); },
      door: () => beep(340, 0.16, 'sine', 0.05, 520),
      level: () => { beep(523, 0.1, 'triangle', 0.05); beep(659, 0.1, 'triangle', 0.05); beep(784, 0.18, 'triangle', 0.05); },
      buy: () => beep(880, 0.07, 'triangle', 0.04),
      talk: () => beep(420, 0.05, 'sine', 0.03),
      ach: () => { beep(784, 0.09, 'triangle', 0.05); beep(1047, 0.14, 'triangle', 0.05); },
      win: () => { beep(523, 0.12, 'triangle', 0.05); beep(659, 0.12, 'triangle', 0.05); beep(784, 0.12, 'triangle', 0.05); beep(1047, 0.3, 'triangle', 0.05); },
      lock: () => beep(140, 0.12, 'square', 0.04),
    };
    return { play(n) { if (map[n]) map[n](); }, startMusic, stopMusic };
  })();

  // ---------- 顶部提示 ----------
  function warn(msg) {
    const p = el.warnPill;
    if (!p) return;
    p.textContent = msg;
    p.classList.add('show');
    clearTimeout(warnTimer);
    warnTimer = setTimeout(() => p.classList.remove('show'), 1700);
  }

  // ---------- 成就吐司 ----------
  let toastQueue = [];
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
      setTimeout(() => { toastBusy = false; pumpToast(); }, 350);
    }, 2300);
  }

  // ---------- 打击感分级 ----------
  const TILE_N = () => Renderer.getTile();
  function impactFX(level, tx, ty) {
    const R = Settings.reduceFx ? 0.4 : 1;
    const cx = tx * TILE_N() + TILE_N() / 2;
    const cy = ty * TILE_N() + TILE_N() / 2;
    if (level >= 3) {
      Renderer.freeze(280);
      Renderer.shake(480, 11 * R);
      Renderer.pulse();
      Renderer.ring(tx, ty, 'rgba(255,190,90,0.9)', TILE_N() * 3.4, 620);
      Renderer.burst(cx, cy, { count: 26, colors: ['#ffd27d', '#ff9f6b', '#ffe9b0', '#ff7d5c'], speed: 150, life: [500, 1000], size: [2.5, 5] });
    } else if (level === 2) {
      Renderer.freeze(150);
      Renderer.shake(320, 8 * R);
      Renderer.ring(tx, ty, 'rgba(255,120,90,0.8)', TILE_N() * 2.4, 500);
      Renderer.burst(cx, cy, { count: 16, colors: ['#ff8f6b', '#ffc98f'], speed: 120, life: [420, 850] });
    } else if (level === 1) {
      Renderer.freeze(90);
      Renderer.shake(220, 6 * R);
      Renderer.burst(cx, cy, { count: 10, colors: ['#ffd27d', '#ffb07d'], speed: 100, life: [380, 700] });
    } else {
      Renderer.freeze(55);
      Renderer.shake(160, 4 * R);
      Renderer.burst(cx, cy, { count: 6, colors: ['#e8e8e8', '#ffd27d'], speed: 80, life: [300, 560], size: [1.5, 3] });
    }
  }

  // ---------- 消息 ----------
  function log(msg, cls) {
    if (!msg) return;
    const div = document.createElement('div');
    div.className = 'line' + (cls ? ' ' + cls : '');
    div.textContent = msg;
    el.log.appendChild(div);
    while (el.log.children.length > 7) el.log.removeChild(el.log.firstChild);
  }

  // ---------- HUD ----------
  function refreshHud() {
    const s = Engine.state();
    if (!s) return;
    const next = Engine.nextLevelExp();
    const unlocked = !!s.flags.codex;
    el.floorName.textContent = `第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}`;
    const maxHp = s.maxHp || Math.max(s.hp, 1000);
    const pct = Math.max(0, Math.min(100, (s.hp / maxHp) * 100));
    $('hpBar').style.width = pct + '%';
    $('hpText').textContent = s.hp;
    el.statAtk.textContent = s.atk;
    el.statDef.textContent = s.def;
    el.statGold.textContent = s.gold;
    el.statLv.textContent = 'Lv.' + s.level;
    el.statExp.textContent = next ? `${s.exp}/${next}` : `${s.exp} · MAX`;
    el.keyY.textContent = s.keys.y;
    el.keyR.textContent = s.keys.r;
    $('btnCodex').style.display = unlocked ? '' : 'none';
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
  }

  // ---------- 剧情 ----------
  function playStory(key, cb) {
    const script = S[key];
    if (!script) { if (cb) cb(); return; }
    // 兼容两种格式：["旁白", ...] 或 [["角色", "台词"], ...]
    const lines = script.map((row) => (Array.isArray(row) ? { who: row[0] || '', text: row[1] || '' } : { who: '', text: String(row) }));
    el.dialogOverlay.classList.add('show');
    startTyping(lines, cb);
  }

  function startTyping(lines, cb) {
    typing = { lines, idx: 0, cb: cb || null };
    renderLine();
  }

  function renderLine() {
    if (!typing) return;
    const line = typing.lines[typing.idx];
    const box = $('dlgText');
    const who = $('dlgWho');
    const cue = $('dlgCue');
    who.textContent = line.who;
    who.className = 'dlg-who ' + (line.who === '烛' ? 'ghost' : line.who === '薇拉' ? 'vera' : line.who === '魔王' ? 'boss' : '');
    who.style.display = line.who ? '' : 'none';
    box.textContent = line.text;
    Sound.play('talk');
    cue.style.visibility = 'visible';
    cue.textContent = typing.idx >= typing.lines.length - 1 ? '— 点击结束 —' : '▼';
  }

  function advanceDialog() {
    if (!typing) return;
    if (typing.idx < typing.lines.length - 1) {
      typing.idx++;
      renderLine();
      return;
    }
    el.dialogOverlay.classList.remove('show');
    const cb = typing.cb;
    typing = null;
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
    list.sort((a, b) => (b.ending === 'true') - (a.ending === 'true') || b.floor - a.floor || a.steps - b.steps);
    try { localStorage.setItem('towermates_board', JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }
  const fmtTime = (t) => (t >= 60 ? `${Math.floor(t / 60)}分${t % 60}秒` : `${t}秒`);
  const endName = (e) => (e === 'true' ? '第九个名字' : e === 'plain' ? '铁与霜' : '未竟');

  function openBoard() {
    const list = loadBoard();
    const all = S.shadowRivals.concat(list.map((x) => Object.assign({ mine: true }, x)));
    all.sort((a, b) => (b.ending === 'true') - (a.ending === 'true') || b.floor - a.floor || a.steps - b.steps);
    $('boardList').innerHTML = all.slice(0, 10).map((r, i) => `<div class="bd-row ${r.mine ? 'mine' : ''}">
        <span class="bd-rank">${i + 1}</span>
        <span class="bd-name">${r.mine ? '你' : r.name}</span>
        <span class="bd-end ${r.ending === 'true' ? 't' : ''}">${endName(r.ending)}</span>
        <span class="bd-floor">${r.floor}层</span>
        <span class="bd-steps">${r.steps}步</span>
        <span class="bd-time">${fmtTime(r.time)}</span>
      </div>`).join('');
    $('myCode').textContent = loadBoard().length ? encodeChallenge(loadBoard()[0]) : '—— 通关后生成 ——';
    $('achCount').textContent = `${Achievements.count()}/${Achievements.DEFS.length}`;
    el.boardOverlay.classList.add('show');
  }

  // ---------- 怪物图鉴（窥探之镜） ----------
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
        <span class="cx-name">${m.name}</span>
        <span class="cx-stat">HP ${m.hp} · 攻 ${m.atk} · 防 ${m.def}</span>
        <span class="cx-loss ${cls}">${loss}</span>
        <span class="cx-reward">${m.gold}💰 ${m.exp}✨</span>
      </div>`;
    }).join('');
    el.codexOverlay.classList.add('show');
  }

  function closeCodex() {
    el.codexOverlay.classList.remove('show');
  }

  // ---------- 自动战斗演出 ----------
  // 真实伤害仍由 engine 结算；这里只演「你来我往」的过程
  function playBattleScene(info, done) {
    const s = Engine.state();
    const m = info.monster;
    const pred = info.pred;
    const heroMax = s.maxHp || Math.max(s.hp, 1000);
    const foeMax = m.hp;
    let heroHp = s.hp;
    let foeHp = foeMax;
    let skipped = false;
    const speed = window.__battleSpeed || 1; // 测试用减速
    const wait = (ms) => new Promise((r) => setTimeout(r, ms * speed));

    el.bsHero.textContent = '🧙';
    el.bsFoe.textContent = m.emoji;
    el.bsName.textContent = m.name + (m.boss ? ' · 塔的主人' : '');
    el.bsRounds.textContent = `${pred.rounds} 回合`;
    el.bsHeroHp.textContent = heroHp;
    el.bsFoeHp.textContent = foeHp;
    el.bsHeroBar.style.width = '100%';
    el.bsFoeBar.style.width = '100%';
    el.bsNumbers.innerHTML = '';
    el.battleScene.classList.add('show');
    el.battleScene.classList.toggle('hero-win', false);

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
      setTimeout(() => d.remove(), 800 * speed);
    }

    el.battleScene.onclick = () => { skipped = true; };

    (async () => {
      const K = Math.min(pred.rounds, m.boss ? 8 : 5);
      for (let i = 0; i < K && !skipped; i++) {
        // 我方出手
        el.bsHero.classList.add('lunge-r');
        await wait(120);
        el.bsHero.classList.remove('lunge-r');
        const cut = pred.out;
        foeHp = Math.max(0, foeHp - cut);
        bars();
        dmgNum(el.bsFoe, '-' + cut, '#ffd27d');
        el.bsFoe.classList.add('hit');
        await wait(90);
        el.bsFoe.classList.remove('hit');
        if (foeHp <= 0) break;
        // 敌方反击（最后一回合不反击）
        if (i < K - 1 && !skipped) {
          el.bsFoe.classList.add('lunge-l');
          await wait(120);
          el.bsFoe.classList.remove('lunge-l');
          heroHp = Math.max(1, heroHp - pred.per);
          bars();
          if (pred.per > 0) dmgNum(el.bsHero, '-' + pred.per, '#ff8f8f');
          el.bsHero.classList.add('hit');
          await wait(90);
          el.bsHero.classList.remove('hit');
        }
      }
      // 收尾：对齐真实结果
      foeHp = 0;
      heroHp = Math.max(1, s.hp - pred.damage);
      bars();
      el.bsFoe.classList.add('ko');
      el.battleScene.classList.add('hero-win');
      await wait(360);
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
    impactFX(isBoss ? 3 : heavy ? 1 : 0, tx, ty);
    Sound.play(isBoss || heavy ? 'hitBig' : 'hit');

    Renderer.addFloat(`-${res.damage}`, tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + 6, '#ff8f8f', heavy || isBoss);
    Renderer.addFloat(`+${res.gold}💰`, tx * TILE_N() + TILE_N() / 2 - 14, ty * TILE_N() + 16, '#e8c46a');
    if (res.exp > 0) Renderer.addFloat(`+${res.exp}✨`, tx * TILE_N() + TILE_N() / 2 + 14, ty * TILE_N() + 16, '#9fd8ff');
    log(`击败${res.monster.name}，损失 ${res.damage} 生命，获得 ${res.gold} 金币 / ${res.exp} 经验`, 'good');

    if (res.levelUps > 0) {
      Sound.play('level');
      Renderer.ring(s2.x, s2.y, 'rgba(255,224,138,0.9)', TILE_N() * 2.6, 560);
      Renderer.addFloat('LEVEL UP', s2.x * TILE_N() + TILE_N() / 2, s2.y * TILE_N() - 8, '#ffe08a', true);
      log(`升级！Lv.${s2.level}　攻击+${3 * res.levelUps}　防御+${3 * res.levelUps}　生命+${150 * res.levelUps}`, 'gold');
    }
    if (res.boss) {
      log('魔王散成九盏灯，一层一层落了下去。', 'gold');
      s2.flags.bossKilled = true;
      Engine.save();
      Sound.stopMusic();
    }
    Achievements.evaluate('kill', s2, notifyAchievement);
    refreshHud();
  }

  // ---------- 战斗入口（撞上即演，自动打完） ----------
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

    // 打不过：原地不动，给警告
    if (!pred.win) {
      Sound.play('lock');
      Renderer.flashTile(tx, ty, 'rgba(255,80,80,0.35)', 260);
      Renderer.shake(120, 2.5);
      warn(pred.reason === '攻击力不足，无法破防' ? '攻击力不足，无法破防' : '这一战会要你的命，先变强吧');
      log(`无法战胜${m.name}：${pred.reason}`, 'warn');
      return;
    }

    // 首见魔王：先对白，再自动开打
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

  function renderShop() {
    const s = Engine.state();
    $('shopGold').textContent = s.gold;
    const list = $('shopList');
    list.innerHTML = '';
    D.shop.forEach((item) => {
      const owned = item.codex && s.flags.codex;
      const afford = s.gold >= item.price;
      const row = document.createElement('div');
      row.className = 'shop-item' + (owned ? ' owned' : '');
      row.innerHTML = `
        <span class="si-emoji">${item.emoji}</span>
        <span class="si-name">${item.name}${item.codex ? '<small class="si-tag">神器</small>' : ''}</span>
        <span class="si-price">${item.price} 金币</span>
        <button class="si-buy" data-id="${item.id}" ${owned || !afford ? 'disabled' : ''}>${owned ? '已拥有' : '购买'}</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.si-buy').forEach((b) => {
      b.addEventListener('click', () => {
        const res = Engine.buy(b.dataset.id);
        if (res.type === 'buy') {
          Sound.play('buy');
          log(res.msg, 'good');
          if (res.item.codex) {
            Renderer.ring(Engine.state().x, Engine.state().y, 'rgba(180,160,255,0.9)', TILE_N() * 2.4, 600);
            warn('窥探之镜已解锁：地图上会标出每个怪物的预计伤害');
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

  function closeShop() {
    shopOpen = false;
    el.shopOverlay.classList.remove('show');
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
    if (!Settings.reduceFx) {
      Renderer.pulse();
      Renderer.shake(600, 10);
      Renderer.burst(s.x * TILE_N() + TILE_N() / 2, s.y * TILE_N() + TILE_N() / 2, {
        count: 40, colors: ['#ffe08a', '#9fd8ff', '#ffc4e0', '#fff4d6'], speed: 170, life: [600, 1400], grav: 90, size: [2, 4.5],
      });
    }
    $('endEmoji').textContent = E.emoji;
    $('endTitle').textContent = E.title;
    $('endDesc').textContent = E.desc;
    $('endBody').textContent = E.body;
    $('endStats').innerHTML = `
      <div>结局 <b>${endName(s.ending)}</b></div>
      <div>最终等级 <b>Lv.${sum.level}</b></div>
      <div>攻击 / 防御 <b>${s.atk} / ${s.def}</b></div>
      <div>剩余生命 <b>${s.hp}</b></div>
      <div>击杀 <b>${s.flags.killCount || 0}</b></div>
      <div>用时/步数 <b>${fmtTime(sum.time)} / ${sum.steps}步</b></div>
    `;
    saveBoard(sum);
    $('endCode').textContent = encodeChallenge(sum);
    Achievements.evaluate('finish', s, notifyAchievement);
    el.endOverlay.classList.add('show');
  }

  // ---------- 点击寻路 ----------
  let walkTimer = null;

  function stopWalk() {
    if (walkTimer) {
      clearTimeout(walkTimer);
      walkTimer = null;
    }
    Renderer.setTarget(null);
  }

  function walkAlong(path, tx, ty) {
    if (!path || !path.length) return;
    Renderer.setTarget(tx, ty);
    let i = 0;
    const step = () => {
      walkTimer = null;
      if (i >= path.length) {
        stopWalk();
        return;
      }
      const [dx, dy] = path[i++];
      const s0 = Engine.state();
      const floor0 = s0 ? s0.floor : -1;
      const px0 = s0 ? s0.x : -1;
      const py0 = s0 ? s0.y : -1;
      act(dx, dy);
      const s1 = Engine.state();
      // 遇到战斗 / 对话 / 商店 / 换层 / 结局 / 原地没动（被门或墙挡住），立即中断
      if (!s1 || s1.over || s1.won || battleBusy || typing ||
          el.dialogOverlay.classList.contains('show') || shopOpen ||
          el.codexOverlay.classList.contains('show') || s1.floor !== floor0 ||
          (s1.x === px0 && s1.y === py0)) {
        stopWalk();
        return;
      }
      walkTimer = setTimeout(step, 110);
    };
    step();
  }

  // 点击地面格子：能走就一路走过去
  function clickMove(cx, cy) {
    const s = Engine.state();
    if (!s) return;
    if (cx === s.x && cy === s.y) {
      stopWalk();
      return;
    }
    const dx = cx - s.x;
    const dy = cy - s.y;
    // 相邻一格：保留原手感，直接走/打
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      stopWalk();
      act(dx, dy);
      return;
    }
    const ch = Engine.tile(cx, cy);
    // 远处怪物：走到它旁边最近的空格
    if (D.monsters[ch]) {
      let best = null;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
        const p = Engine.pathTo(cx + ox, cy + oy);
        if (p && p.length && (!best || p.length < best.length)) best = p;
      });
      if (best) {
        stopWalk();
        walkAlong(best, cx, cy);
        return;
      }
      const near = Engine.pathToNear(cx, cy);
      if (near) {
        stopWalk();
        walkAlong(near.path, near.x, near.y);
        warn('就近靠过去，前面有怪挡路');
        return;
      }
      warn('没有能靠近它的路');
      return;
    }
    const path = Engine.pathTo(cx, cy);
    if (path) {
      stopWalk();
      walkAlong(path, cx, cy);
      return;
    }
    // 不可直达（多半是怪挡走廊）：走到最近的可达点
    const near = Engine.pathToNear(cx, cy);
    if (near) {
      stopWalk();
      walkAlong(near.path, near.x, near.y);
      return;
    }
    warn('走不过去');
  }

  // ---------- 行动 ----------
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function enterFloor(first) {
    const s = Engine.state();
    const f = D.floors[s.floor];
    Renderer.fade(first ? 400 : 300);
    Renderer.setAmbient(s.floor);
    if (s.floor === 8) Sound.startMusic();
    else Sound.stopMusic();
    if (!first) log(`来到第 ${s.floor + 1} 层 · ${f.name}`, 'gold');
    log(f.tip);
    if (s.flags['story_f' + s.floor] !== true) {
      s.flags['story_f' + s.floor] = true;
      if (s.floor === 3) s.flags.secret1 = true;
      if (s.floor === 5) s.flags.secret2 = true;
      Engine.save();
      Achievements.evaluate('floor', s, notifyAchievement);
      if (f.story) playStory(f.story);
    }
  }

  function act(dx, dy) {
    if (battleBusy) return;
    if (shopOpen || endShown) return;
    if (typing || el.dialogOverlay.classList.contains('show')) { advanceDialog(); return; }
    const s = Engine.state();
    if (!s || s.over || s.won) return;
    const ev = Engine.tryMove(dx, dy);
    switch (ev.type) {
      case 'idle':
        return;
      case 'blocked':
        Sound.play('lock');
        return;
      case 'battle':
        // 撞上怪物 → 直接开打
        resolveBattle(dx, dy);
        return;
      case 'locked':
        Sound.play('lock');
        Renderer.flashTile(s.x + dx, s.y + dy, 'rgba(255,255,255,0.25)', 200);
        log(ev.msg, 'warn');
        return;
      case 'open':
        Sound.play('door');
        {
          const tx = s.x + dx, ty = s.y + dy;
          Renderer.burst(tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + TILE_N() / 2, {
            count: 8, colors: ['#c9a23a', '#e8d27d'], speed: 90, life: [300, 600], size: [1.5, 3],
          });
        }
        log(ev.msg, 'good');
        break;
      case 'floor':
        Sound.play('door');
        enterFloor(false);
        break;
      case 'story':
        Sound.play('pick');
        if (ev.msg) log(ev.msg, 'good');
        Renderer.ring(Engine.state().x, Engine.state().y, 'rgba(159,216,255,0.8)', TILE_N() * 2, 480);
        playStory(ev.story);
        break;
      case 'pickup':
        Sound.play('pick');
        {
          const s2 = Engine.state();
          Renderer.addFloat(ev.msg.replace('拾取', '+').replace('，', ' '), s2.x * TILE_N() + TILE_N() / 2, s2.y * TILE_N(), '#9fe8b0');
        }
        log(ev.msg, 'good');
        break;
      case 'shop':
        // 首次遇到商人：先说明背景与货品，讲完才开购买界面
        if (!Engine.state().flags.merchant) {
          Engine.state().flags.merchant = true;
          Engine.save();
          playStory('merchant', () => {
            Sound.play('buy');
            openShop();
          });
        } else {
          openShop();
        }
        break;
      case 'princess':
        playStory(ev.hasJournal ? 'princessTrue' : 'princessPlain', () => { refreshHud(); showEnd(); });
        return;
      case 'move':
        Sound.play('step');
        break;
    }
    refreshHud();
  }

  // ---------- 输入 ----------
  function bindInput() {
    el.dialogOverlay.addEventListener('click', advanceDialog);

    window.addEventListener('keydown', (e) => {
      if (el.startOverlay.classList.contains('show')) return;
      if (el.dialogOverlay.classList.contains('show') || typing) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') advanceDialog();
        return;
      }
      if (endShown) return;
      if (shopOpen) {
        if (e.key === 'Escape') closeShop();
        return;
      }
      if (el.boardOverlay.classList.contains('show')) {
        if (e.key === 'Escape') closeBoard();
        return;
      }
      if (el.codexOverlay.classList.contains('show')) {
        if (e.key === 'Escape') closeCodex();
        return;
      }
      const k = e.key.toLowerCase();
      let d = null;
      if (k === 'arrowup' || k === 'w') d = dirs.up;
      else if (k === 'arrowdown' || k === 's') d = dirs.down;
      else if (k === 'arrowleft' || k === 'a') d = dirs.left;
      else if (k === 'arrowright' || k === 'd') d = dirs.right;
      if (d) { e.preventDefault(); stopWalk(); act(d[0], d[1]); }
    });

    document.querySelectorAll('#dpad button').forEach((b) => {
      b.addEventListener('click', () => {
        const d = dirs[b.dataset.dir];
        if (d) { stopWalk(); act(d[0], d[1]); }
      });
    });

    el.canvas.addEventListener('click', (e) => {
      const s = Engine.state();
      if (!s || shopOpen || endShown || battleBusy) return;
      if (el.dialogOverlay.classList.contains('show') || el.codexOverlay.classList.contains('show')) return;
      const rect = el.canvas.getBoundingClientRect();
      const size = rect.width / 11;
      const x = Math.floor((e.clientX - rect.left) / size);
      const y = Math.floor((e.clientY - rect.top) / size);
      if (x < 0 || y < 0 || x > 10 || y > 10) return;
      clickMove(x, y);
    });

    $('shopClose').addEventListener('click', closeShop);
    $('btnBoard').addEventListener('click', openBoard);
    $('boardClose').addEventListener('click', closeBoard);
    $('btnCodex').addEventListener('click', openCodex);
    $('codexClose').addEventListener('click', closeCodex);
    $('btnCopyCode').addEventListener('click', () => {
      const code = $('myCode').textContent;
      if (!code || code.startsWith('——')) return;
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => log('挑战码已复制', 'good'));
    });
    $('btnCfg').addEventListener('click', () => {
      const r = Settings.toggleReduce();
      const m = Settings.toggleMute();
      $('cfgLabel').textContent = `特效:${r ? '减' : '全'} 音效:${m ? '关' : '开'}`;
      log(`设置：画面特效${r ? '减弱' : '全开'}，音效${m ? '关闭' : '开启'}`);
    });
    $('cfgLabel').textContent = `特效:${Settings.reduceFx ? '减' : '全'} 音效:${Settings.mute ? '关' : '开'}`;
  }

  function closeBoard() {
    el.boardOverlay.classList.remove('show');
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
    refreshHud();
    playStory('intro', () => {
      enterFloor(true);
      log('你踏入了魔塔。塔顶传来极轻的、像铃声一样的声音。', 'gold');
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
    refreshHud();
    if (s.won) showEnd();
  }

  function boot() {
    Renderer.init(el.canvas);
    Renderer.layout(el.stage);
    window.addEventListener('resize', () => Renderer.layout(el.stage));
    if (window.ResizeObserver) new ResizeObserver(() => Renderer.layout(el.stage)).observe(el.stage);
    bindInput();

    if (Engine.hasSave()) $('btnContinue').style.display = 'block';
    $('btnNew').addEventListener('click', startGame);
    $('btnContinue').addEventListener('click', continueGame);
    $('btnReset').addEventListener('click', () => {
      Engine.reset();
      $('btnContinue').style.display = 'none';
      log('存档已清空');
    });
    $('btnAgain').addEventListener('click', () => {
      el.endOverlay.classList.remove('show');
      Engine.reset();
      startGame();
    });

    function loop(t) {
      const s = Engine.state();
      if (s) Renderer.draw(s, t);
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
