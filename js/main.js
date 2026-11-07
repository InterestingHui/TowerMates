// TowerMates · 魔塔原型 —— 交互与 UI
(function () {
  const D = window.GAME_DATA;
  const S = window.STORY;
  const $ = (id) => document.getElementById(id);

  let pendingBattle = null;
  let shopOpen = false;
  let endShown = false;
  let typing = null; // 打字机状态 { lines, idx, charIdx, done, cb }

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
  };

  // ---------- 音效 ----------
  const Sound = (() => {
    let ctx = null;
    let muted = false;
    try {
      muted = localStorage.getItem('towermates_mute') === '1';
    } catch (e) {}
    function ensure() {
      if (muted) return null;
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
    const map = {
      step: () => beep(220, 0.045, 'sine', 0.018),
      hit: () => { beep(180, 0.09, 'sawtooth', 0.05, 80); beep(90, 0.12, 'square', 0.04, 60); },
      pick: () => { beep(660, 0.07, 'triangle', 0.05); beep(990, 0.1, 'triangle', 0.04); },
      door: () => beep(340, 0.16, 'sine', 0.05, 520),
      level: () => { beep(523, 0.1, 'triangle', 0.05); beep(659, 0.1, 'triangle', 0.05); beep(784, 0.18, 'triangle', 0.05); },
      buy: () => beep(880, 0.07, 'triangle', 0.04),
      talk: () => beep(420, 0.05, 'sine', 0.03),
      win: () => { beep(523, 0.12, 'triangle', 0.05); beep(659, 0.12, 'triangle', 0.05); beep(784, 0.12, 'triangle', 0.05); beep(1047, 0.3, 'triangle', 0.05); },
      lock: () => beep(140, 0.12, 'square', 0.04),
    };
    return {
      play(n) { if (map[n]) map[n](); },
      toggle() {
        muted = !muted;
        try { localStorage.setItem('towermates_mute', muted ? '1' : '0'); } catch (e) {}
        return muted;
      },
      isMuted: () => muted,
    };
  })();

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
    el.statHp.textContent = s.hp;
    el.statAtk.textContent = s.atk;
    el.statDef.textContent = s.def;
    el.statGold.textContent = s.gold;
    el.statLv.textContent = 'Lv.' + s.level;
    el.statExp.textContent = next ? `${s.exp}/${next}` : `${s.exp} · MAX`;
    el.keyY.textContent = s.keys.y;
    el.keyB.textContent = s.keys.b;
    el.keyR.textContent = s.keys.r;
  }

  // ---------- 剧情对白 ----------
  function playStory(key, cb) {
    const script = S[key];
    if (!script) {
      if (cb) cb();
      return;
    }
    const lines = script.map(([who, text]) => ({ who, text }));
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
    cue.style.visibility = 'hidden';
    typing.timer = setInterval(() => {
      typing.charIdx++;
      const doneTyping = typing.charIdx >= line.text.length;
      box.textContent = line.text.slice(0, typing.charIdx);
      if (typing.charIdx % 3 === 0) Sound.play('talk');
      if (doneTyping) {
        clearInterval(typing.timer);
        typing.done = true;
        cue.style.visibility = 'visible';
        cue.textContent = typing.idx >= typing.lines.length - 1 ? '— 点击结束 —' : '▼';
      }
    }, 28);
  }

  function advanceDialog() {
    if (!typing) return;
    const line = typing.lines[typing.idx];
    if (!typing.done) {
      // 快进当前句
      clearInterval(typing.timer);
      $('dlgText').textContent = line.text;
      typing.charIdx = line.text.length;
      typing.done = true;
      $('dlgCue').style.visibility = 'visible';
      $('dlgCue').textContent = typing.idx >= typing.lines.length - 1 ? '— 点击结束 —' : '▼';
      return;
    }
    if (typing.idx < typing.lines.length - 1) {
      typing.idx++;
      typing.charIdx = 0;
      typing.done = false;
      renderLine();
      return;
    }
    // 结束
    el.dialogOverlay.classList.remove('show');
    const cb = typing.cb;
    typing = null;
    if (cb) cb();
  }

  // ---------- 挑战码 ----------
  function encodeChallenge(sum) {
    // 朴素 Base64 摘要：结局|层|级|步|秒
    const raw = [sum.ending === 'true' ? 1 : 0, sum.floor, sum.level, sum.steps, sum.time].join('.');
    try {
      return btoa(unescape(encodeURIComponent('TM' + raw))).replace(/=+$/, '');
    } catch (e) {
      return 'TM' + raw;
    }
  }

  function decodeChallenge(code) {
    try {
      const raw = decodeURIComponent(escape(atob(code)));
      if (!raw.startsWith('TM')) return null;
      const p = raw.slice(2).split('.').map(Number);
      if (p.length !== 5 || p.some(isNaN)) return null;
      return { ending: p[0] ? 'true' : 'plain', floor: p[1], level: p[2], steps: p[3], time: p[4] };
    } catch (e) {
      return null;
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
    const res = Engine.fight(pendingBattle.dx, pendingBattle.dy);
    closeBattle();
    if (res.type === 'story') {
      // 首见魔王：先对白，再回到战斗状态
      playStory(res.story, () => {
        openBattle({ dx: res.dx, dy: res.dy, prediction: res.prediction });
      });
      return;
    }
    if (res.type !== 'fight') return;
    Sound.play('hit');
    Renderer.shake(res.damage > 0 ? 260 : 120);
    const s = Engine.state();
    Renderer.addFloat(`-${res.damage}`, s.x * Renderer.getTile() + Renderer.getTile() / 2, s.y * Renderer.getTile(), '#ff8f8f');
    Renderer.addFloat(`+${res.gold}💰`, s.x * Renderer.getTile() + Renderer.getTile() / 2, s.y * Renderer.getTile() + 10, '#e8c46a');
    log(`击败${res.monster.name}，损失 ${res.damage} 生命，获得 ${res.gold} 金币 / ${res.exp} 经验`, 'good');
    if (res.levelUps > 0) {
      Sound.play('level');
      log(`升级！Lv.${s.level}　攻击+${3 * res.levelUps}　防御+${3 * res.levelUps}　生命+${150 * res.levelUps}`, 'gold');
      Renderer.addFloat('LEVEL UP', s.x * Renderer.getTile() + Renderer.getTile() / 2, s.y * Renderer.getTile() - 14, '#ffe08a');
    }
    if (res.boss) log('魔王散成九盏灯，一层一层落了下去。', 'gold');
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
    $('endEmoji').textContent = E.emoji;
    $('endTitle').textContent = E.title;
    $('endDesc').textContent = E.desc;
    $('endBody').textContent = E.body;
    $('endStats').innerHTML = `
      <div>通关层数 <b>${sum.floor}/${D.floors.length}</b></div>
      <div>最终等级 <b>Lv.${sum.level}</b></div>
      <div>攻击 <b>${s.atk}</b></div>
      <div>防御 <b>${s.def}</b></div>
      <div>剩余生命 <b>${s.hp}</b></div>
      <div>用时/步数 <b>${fmtTime(sum.time)} / ${sum.steps}步</b></div>
    `;
    // 记入塔友榜 + 生成挑战码
    saveBoard(sum);
    $('endCode').textContent = encodeChallenge(sum);

    el.endOverlay.classList.add('show');
  }

  // ---------- 行动 ----------
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function enterFloor(first) {
    const s = Engine.state();
    const f = D.floors[s.floor];
    Renderer.fade(first ? 400 : 300);
    if (!first) log(`${ev0 || ''}来到第 ${s.floor + 1} 层 · ${f.name}`, 'gold');
    log(f.tip);
    if (s.flags['story_f' + s.floor] !== true) {
      s.flags['story_f' + s.floor] = true;
      Engine.save();
      if (f.story) {
        playStory(f.story);
      }
    }
  }

  let ev0 = '';

  function act(dx, dy) {
    if (shopOpen || endShown) return;
    if (typing) {
      advanceDialog();
      return;
    }
    if (el.dialogOverlay.classList.contains('show')) {
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
        log(ev.msg, 'warn');
        return;
      case 'open':
        Sound.play('door');
        log(ev.msg, 'good');
        break;
      case 'floor': {
        Sound.play('door');
        ev0 = ev.msg + '　';
        enterFloor(false);
        break;
      }
      case 'story':
        Sound.play('pick');
        if (ev.msg) log(ev.msg, 'good');
        playStory(ev.story);
        break;
      case 'pickup':
        Sound.play('pick');
        log(ev.msg, 'good');
        break;
      case 'shop':
        openShop();
        break;
      case 'princess': {
        // 公主对白 → 对应结局
        playStory(ev.hasJournal ? 'princessTrue' : 'princessPlain', () => {
          refreshHud();
          showEnd();
        });
        return;
      }
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
    // 序章 → 第一层引导
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
    refreshHud();
    if (s.won) showEnd();
  }

  function boot() {
    Engine.setHooks({
      onEvent(type) {
        if (type === 'newgame') {
          // 新档时清空本地榜（可选：保留历史，这里保留）
        }
      },
    });
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

    // 主循环
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
