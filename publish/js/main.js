// TowerMates · 魔塔原型 —— 交互与 UI（v0.3：打击感分级/成就/设置/BGM）
(function () {
  const D = window.GAME_DATA;
  const S = window.STORY;
  const $ = (id) => document.getElementById(id);

  let pendingBattle = null;
  let shopOpen = false;
  let endShown = false;
  let typing = null;

  // 效果开关（减震/静音，无障碍友好）
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
    statHp: $('statHp'),
    statAtk: $('statAtk'),
    statDef: $('statDef'),
    statGold: $('statGold'),
    statLv: $('statLv'),
    statExp: $('statExp'),
    keyY: $('keyY'),
    keyB: $('keyB'),
    keyR: $('keyR'),
    log: $('log'),
    startOverlay: $('startOverlay'),
    battleOverlay: $('battleOverlay'),
    shopOverlay: $('shopOverlay'),
    endOverlay: $('endOverlay'),
    dialogOverlay: $('dialogOverlay'),
    boardOverlay: $('boardOverlay'),
    toast: $('toast'),
  };

  // ---------- 音效 ----------
  const Sound = (() => {
    let ctx = null;
    let music = null;
    let musicTimer = null;
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
    // 环境低鸣（boss 层）：两个失谐正弦慢拍频
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
    return {
      play(n) { if (map[n]) map[n](); },
      startMusic,
      stopMusic,
    };
  })();

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
      setTimeout(() => {
        toastBusy = false;
        pumpToast();
      }, 350);
    }, 2300);
  }

  // ---------- 打击感分级 ----------
  // 0 普通战斗 / 1 重击(高伤) / 2 boss / 3 boss 击杀
  function impactFX(level, tx, ty, dmg) {
    const R = Settings.reduceFx ? 0.4 : 1; // 减震模式整体强度打折
    if (level >= 3) {
      Renderer.freeze(280);
      Renderer.shake(480, 11 * R);
      Renderer.pulse();
      Renderer.ring(tx, ty, 'rgba(255,190,90,0.9)', TILE_N() * 3.4, 620);
      Renderer.burst(tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + TILE_N() / 2, {
        count: 26, colors: ['#ffd27d', '#ff9f6b', '#ffe9b0', '#ff7d5c'], speed: 150, life: [500, 1000], size: [2.5, 5],
      });
    } else if (level === 2) {
      Renderer.freeze(150);
      Renderer.shake(320, 8 * R);
      Renderer.ring(tx, ty, 'rgba(255,120,90,0.8)', TILE_N() * 2.4, 500);
      Renderer.burst(tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + TILE_N() / 2, {
        count: 16, colors: ['#ff8f6b', '#ffc98f'], speed: 120, life: [420, 850],
      });
    } else if (level === 1) {
      Renderer.freeze(90);
      Renderer.shake(220, 6 * R);
      Renderer.burst(tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + TILE_N() / 2, {
        count: 10, colors: ['#ffd27d', '#ffb07d'], speed: 100, life: [380, 700],
      });
    } else {
      Renderer.freeze(55);
      Renderer.shake(160, 4 * R);
      Renderer.burst(tx * TILE_N() + TILE_N() / 2, ty * TILE_N() + TILE_N() / 2, {
        count: 6, colors: ['#e8e8e8', '#ffd27d'], speed: 80, life: [300, 560], size: [1.5, 3],
      });
    }
  }
  const TILE_N = () => Renderer.getTile();

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
    el.floorName.textContent = `第 ${s.floor + 1} 层 · ${D.floors[s.floor].name}`;
    // 血条（旧档无 maxHp 时按 1000 估算）
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
    el.keyB.textContent = s.keys.b;
    el.keyR.textContent = s.keys.r;
    // 数值变化弹跳
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

  // ---------- 剧情对白 ----------
  function playStory(key, cb) {
    const script = S[key];
    if (!script) {
      if (cb) cb();
      return;
    }
    // 兼容两种写法：["旁白文本", ...] 或 [["角色", "台词"], ...]
    // （此前序章是纯字符串数组，被按 [who, text] 解构，导致每页只显示一个字）
    const lines = script.map((row) => {
      if (Array.isArray(row)) return { who: row[0] || '', text: row[1] || '' };
      return { who: '', text: String(row) };
    });
    el.dialogOverlay.classList.add('show');
    startTyping(lines, cb);
  }

  function startTyping(lines, cb) {
    typing = { lines, idx: 0, charIdx: 0, done: false, cb: cb || null };
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
    // 整句直接显示，不做逐字打字机
    box.textContent = line.text;
    typing.charIdx = line.text.length;
    typing.done = true;
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

  // ---------- 挑战码 ----------
  function encodeChallenge(sum) {
    const raw = [sum.ending === 'true' ? 1 : 0, sum.floor, sum.level, sum.steps, sum.time].join('.');
    try {
      return btoa(unescape(encodeURIComponent('TM' + raw))).replace(/=+$/, '');
    } catch (e) {
      return 'TM' + raw;
    }
  }

  function loadBoard() {
    let mine = [];
    try {
      mine = JSON.parse(localStorage.getItem('towermates_board') || '[]');
    } catch (e) {}
    return mine;
  }

  function saveBoard(entry) {
    const list = loadBoard();
    list.push(entry);
    list.sort((a, b) => (b.ending === 'true') - (a.ending === 'true') || b.floor - a.floor || a.steps - b.steps);
    try {
      localStorage.setItem('towermates_board', JSON.stringify(list.slice(0, 30)));
    } catch (e) {}
  }

  const fmtTime = (t) => (t >= 60 ? `${Math.floor(t / 60)}分${t % 60}秒` : `${t}秒`);
  const endName = (e) => (e === 'true' ? '第九个名字' : e === 'plain' ? '铁与霜' : '未竟');

  function openBoard() {
    const list = loadBoard();
    const rows = [];
    const all = S.shadowRivals.concat(list.map((x) => Object.assign({ mine: true }, x)));
    all.sort((a, b) => (b.ending === 'true') - (a.ending === 'true') || b.floor - a.floor || a.steps - b.steps);
    all.slice(0, 10).forEach((r, i) => {
      rows.push(`<div class="bd-row ${r.mine ? 'mine' : ''}">
        <span class="bd-rank">${i + 1}</span>
        <span class="bd-name">${r.mine ? '你' : r.name}</span>
        <span class="bd-end ${r.ending === 'true' ? 't' : ''}">${endName(r.ending)}</span>
        <span class="bd-floor">${r.floor}层</span>
        <span class="bd-steps">${r.steps}步</span>
        <span class="bd-time">${fmtTime(r.time)}</span>
      </div>`);
    });
    $('boardList').innerHTML = rows.join('');
    $('myCode').textContent = loadBoard().length ? encodeChallenge(loadBoard()[0]) : '—— 通关后生成 ——';
    // 成就计数
    $('achCount').textContent = `${Achievements.count()}/${Achievements.DEFS.length}`;
    el.boardOverlay.classList.add('show');
  }

  // ---------- 战斗预览 ----------
  function openBattle(ev) {
    pendingBattle = { dx: ev.dx, dy: ev.dy };
    const p = ev.prediction;
    const m = p.m;
    $('btEmoji').textContent = m.emoji;
    $('btName').textContent = m.name;
    $('btStats').textContent = `HP ${m.hp} · ATK ${m.atk} · DEF ${m.def}`;
    $('btOut').textContent = p.out > 0 ? `每回合 ${p.out} 点` : '—';
    $('btRounds').textContent = p.rounds ? `${p.rounds} 回合` : '—';
    $('btLoss').textContent = p.damage === null ? '无法计算' : `${p.damage} HP`;
    $('btAfter').textContent = p.damage === null ? '—' : `${Engine.state().hp - p.damage} HP`;
    $('btReward').textContent = `${m.gold} 金币 · ${m.exp} 经验`;
    const warn = $('btWarn');
    const fightBtn = $('btFight');
    if (!p.win) {
      warn.textContent = p.reason || '你打不过它';
      fightBtn.disabled = true;
    } else {
      warn.textContent = '';
      fightBtn.disabled = false;
    }
    el.battleOverlay.classList.add('show');
  }

  function closeBattle() {
    pendingBattle = null;
    el.battleOverlay.classList.remove('show');
  }

  function doFight() {
    if (!pendingBattle) return;
    const s = Engine.state();
    const tx = s.x + pendingBattle.dx;
    const ty = s.y + pendingBattle.dy;
    const res = Engine.fight(pendingBattle.dx, pendingBattle.dy);
    closeBattle();
    if (res.type === 'story') {
      Sound.play('lock');
      Renderer.flashTile(tx, ty, 'rgba(255,80,80,0.35)', 400);
      playStory(res.story, () => {
        openBattle({ dx: res.dx, dy: res.dy, prediction: res.prediction });
      });
      return;
    }
    if (res.type !== 'fight') return;

    // 打击感分级：boss 战=2，重伤(>=15% maxHp)=1，boss 击杀=3
    const isBoss = !!res.boss;
    const heavy = res.damage >= (s.maxHp || Math.max(s.hp, 1000)) * 0.15;
    const killed = !D.monsters[Engine.tile(tx, ty)] || Engine.tile(tx, ty) === '.';
    impactFX(isBoss && killed ? 3 : isBoss ? 2 : heavy ? 1 : 0, tx, ty, res.damage);
    Sound.play(isBoss || heavy ? 'hitBig' : 'hit');

    const s2 = Engine.state();
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
      Sound.startMusic(); // boss 层低鸣在 boss 死后停止 → 换成普通（此处重启会被 stopMusic 处理）
      Sound.stopMusic();
    }
    Achievements.evaluate('kill', s2, notifyAchievement);
    refreshHud();
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
      const row = document.createElement('div');
      row.className = 'shop-item';
      const afford = s.gold >= item.price;
      row.innerHTML = `
        <span class="si-emoji">${item.emoji}</span>
        <span class="si-name">${item.name}</span>
        <span class="si-price">${item.price} 金币</span>
        <button class="si-buy" data-id="${item.id}" ${afford ? '' : 'disabled'}>购买</button>
      `;
      list.appendChild(row);
    });
    list.querySelectorAll('.si-buy').forEach((b) => {
      b.addEventListener('click', () => {
        const res = Engine.buy(b.dataset.id);
        if (res.type === 'buy') {
          Sound.play('buy');
          log(res.msg, 'good');
          refreshHud();
          renderShop();
          Achievements.evaluate('buy', Engine.state(), notifyAchievement);
        } else {
          Sound.play('lock');
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
    const s = Engine.state();
    const isTrue = s.ending === 'true';
    const E = isTrue ? S.endingTrue : S.endingPlain;
    const sum = Engine.summary();

    Sound.play('win');
    if (!Settings.reduceFx) {
      Renderer.pulse();
      Renderer.shake(600, 10);
      const cx = s.x, cy = s.y;
      Renderer.burst(cx * TILE_N() + TILE_N() / 2, cy * TILE_N() + TILE_N() / 2, {
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
      // 密道发现成就
      if (s.floor === 3) s.flags.secret1 = true;
      if (s.floor === 5) s.flags.secret2 = true;
      Engine.save();
      Achievements.evaluate('floor', s, notifyAchievement);
      if (f.story) playStory(f.story);
    }
  }

  function act(dx, dy) {
    if (shopOpen || endShown) return;
    if (typing || el.dialogOverlay.classList.contains('show')) {
      advanceDialog();
      return;
    }
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
        openBattle(ev);
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
        openShop();
        break;
      case 'princess':
        playStory(ev.hasJournal ? 'princessTrue' : 'princessPlain', () => {
          refreshHud();
          showEnd();
        });
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
      if (el.battleOverlay.classList.contains('show')) {
        if (e.key === 'Escape') closeBattle();
        if (e.key === 'Enter' || e.key === ' ') doFight();
        return;
      }
      if (shopOpen) {
        if (e.key === 'Escape') closeShop();
        return;
      }
      if (el.boardOverlay.classList.contains('show')) {
        if (e.key === 'Escape') closeBoard();
        return;
      }
      const k = e.key.toLowerCase();
      let d = null;
      if (k === 'arrowup' || k === 'w') d = dirs.up;
      else if (k === 'arrowdown' || k === 's') d = dirs.down;
      else if (k === 'arrowleft' || k === 'a') d = dirs.left;
      else if (k === 'arrowright' || k === 'd') d = dirs.right;
      if (d) {
        e.preventDefault();
        act(d[0], d[1]);
      }
    });

    document.querySelectorAll('#dpad button').forEach((b) => {
      b.addEventListener('click', () => {
        const d = dirs[b.dataset.dir];
        if (d) act(d[0], d[1]);
      });
    });

    el.canvas.addEventListener('click', (e) => {
      const s = Engine.state();
      if (!s || shopOpen || endShown) return;
      const rect = el.canvas.getBoundingClientRect();
      const size = rect.width / 11;
      const x = Math.floor((e.clientX - rect.left) / size);
      const y = Math.floor((e.clientY - rect.top) / size);
      const dx = x - s.x;
      const dy = y - s.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1) return;
      act(dx, dy);
    });

    $('btCancel').addEventListener('click', closeBattle);
    $('btFight').addEventListener('click', doFight);
    $('shopClose').addEventListener('click', closeShop);
    $('btnBoard').addEventListener('click', openBoard);
    $('boardClose').addEventListener('click', closeBoard);
    $('btnCopyCode').addEventListener('click', () => {
      const code = $('myCode').textContent;
      if (!code || code.startsWith('——')) return;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => log('挑战码已复制', 'good'));
      }
    });
    $('btnCfg').addEventListener('click', () => {
      const r = Settings.toggleReduce();
      const m = Settings.toggleMute();
      // 每次点击循环三态：全开 → 减震 → 减震+静音 → 全开
      // 简化：reduce 与 mute 独立，弹提示
      $('cfgLabel').textContent = `特效:${r ? '减' : '全'} 音效:${m ? '关' : '开'}`;
      log(`设置：画面特效${r ? '减弱' : '全开'}，音效${m ? '关闭' : '开启'}`);
    });
    // 初始化按钮文案
    $('cfgLabel').textContent = `特效:${Settings.reduceFx ? '减' : '全'} 音效:${Settings.mute ? '关' : '开'}`;
  }

  function closeBoard() {
    el.boardOverlay.classList.remove('show');
  }

  // ---------- 启动 ----------
  function startGame() {
    Engine.newGame();
    endShown = false;
    el.log.innerHTML = '';
    el.startOverlay.classList.remove('show');
    el.battleOverlay.classList.remove('show');
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

    if (Engine.hasSave()) {
      $('btnContinue').style.display = 'block';
    }
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
