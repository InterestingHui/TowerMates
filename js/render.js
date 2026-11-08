// TowerMates · Canvas 渲染（v0.4）
// 结构：静态层（地板/墙/AO/红毯，离屏预渲染）→ 实体层 → 光照/火把/天光 → 徽章 → 特效 → 暗角
// 时间体系：simT 只在非冻结时前进，所有年龄型特效用它（hit-stop 不打断缓动）
(function () {
  const D = window.GAME_DATA;
  const C = D.PALETTE;
  const SIZE = 11;
  let canvas, ctx, TILE = 48, dpr = 1;

  let simT = 0;
  let freezeUntil = 0;

  const floats = [];
  const particles = [];
  const flashes = [];
  const rings = [];
  let shakeUntil = 0, shakeMag = 6, shakeDur = 200;
  let fadeUntil = 0;
  let pulseStart = -9999;

  const disp = { x: 1, y: 1 };
  let lastFloor = -1;
  let face = 1;

  let ambient = { mode: 'torch', embers: [], spawnAcc: 0 };
  let torchList = [];
  let bgCanvas = null, bgKey = '';
  let beamCanvas = null, beamKey = '';

  const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Microsoft YaHei",sans-serif';

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
  }

  function layout(container) {
    if (!canvas) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    const size = Math.max(240, Math.min(w, h));
    const px = Math.floor(size / SIZE);
    TILE = px;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(px * SIZE * dpr);
    canvas.height = Math.floor(px * SIZE * dpr);
    canvas.style.width = px * SIZE + 'px';
    canvas.style.height = px * SIZE + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgKey = '';
    beamKey = '';
  }

  // ---------- 对外特效接口 ----------
  function freeze(ms) {
    if (ms <= 0) return;
    freezeUntil = Math.max(freezeUntil, performance.now() + ms);
  }
  function shake(ms, mag) {
    shakeUntil = performance.now() + (ms || 200);
    shakeDur = ms || 200;
    shakeMag = mag || 6;
  }
  function fade(ms) { fadeUntil = performance.now() + (ms || 260); }
  function pulse() { pulseStart = performance.now(); }

  function addFloat(text, x, y, color, big) {
    floats.push({ text, x: x + (Math.random() * 10 - 5), y, color, start: simT, dur: big ? 1250 : 900, big: !!big });
    if (floats.length > 14) floats.shift();
  }
  function flashTile(tx, ty, color, dur) {
    flashes.push({ tx, ty, start: simT, dur: dur || 130, color: color || '#ffffff' });
  }
  function ring(tx, ty, color, maxR, dur) {
    rings.push({ tx, ty, start: simT, dur: dur || 420, color, maxR: maxR || TILE * 2.2 });
  }
  function burst(px, py, opts) {
    const o = Object.assign({ count: 10, colors: ['#ffd27d', '#ff9f6b'], speed: 90, life: [400, 750], grav: 220, size: [2, 4], spread: Math.PI * 2, angle: -Math.PI / 2 }, opts);
    for (let i = 0; i < o.count; i++) {
      if (particles.length > 160) particles.shift();
      const a = o.angle + (Math.random() - 0.5) * o.spread;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      particles.push({
        x: px, y: py,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        grav: o.grav,
        size: o.size[0] + Math.random() * (o.size[1] - o.size[0]),
        color: o.colors[(Math.random() * o.colors.length) | 0],
        start: simT,
        life: o.life[0] + Math.random() * (o.life[1] - o.life[0]),
      });
    }
  }

  // 战斗演出的背景：把当前画面缩成一张小图给 CSS 用
  function snapshot() {
    try {
      return canvas.toDataURL('image/jpeg', 0.55);
    } catch (e) {
      return '';
    }
  }

  // ---------- 楼层配置 ----------
  const FLOOR_MOOD = [0.13, 0.16, 0.19, 0.25, 0.29, 0.37];
  const WALL_MAT = ['brick', 'brick', 'stone', 'wet', 'stone', 'charred'];

  function setAmbient(floorIndex, map) {
    ambient = { mode: floorIndex === 5 ? 'boss' : floorIndex === 3 ? 'mist' : 'torch', embers: [], spawnAcc: 0 };
    lastFloor = floorIndex;
    torchList = [];
    if (!map && window.Engine && window.Engine.state()) {
      const st = window.Engine.state();
      map = st.maps[floorIndex];
    }
    if (!map) return;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] !== '#') continue;
        const nearFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const ch = map[y + dy] && map[y + dy][x + dx];
          return ch && ch !== '#';
        });
        if (!nearFloor) continue;
        if ((x * 5 + y * 7) % 8 === 0) {
          let sx = 0, sy = 0;
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const ch = map[y + dy] && map[y + dy][x + dx];
            if (ch && ch !== '#') { sx = dx; sy = dy; break; }
          }
          torchList.push({ x, y, sx, sy, seed: (x * 31 + y * 17) % 100 });
        }
      }
    }
    bgKey = '';
  }

  // ---------- 基元 ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hash(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return Math.abs(h ^ (h >> 16)) % 1000;
  }

  // ---------- 地板 ----------
  function drawFloorTile(px, py, x, y) {
    const h = hash(x, y);
    let base = (x + y) % 2 === 0 ? '#101622' : '#0d121c';
    if (lastFloor === 5) base = (x + y) % 2 === 0 ? '#1a1016' : '#160e13';
    else if (lastFloor === 3) base = (x + y) % 2 === 0 ? '#12101c' : '#0f0d18';
    ctx.fillStyle = base;
    ctx.fillRect(px, py, TILE, TILE);

    // 砖缝：2x2 分块，错缝
    ctx.strokeStyle = 'rgba(255,255,255,0.028)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py + TILE * 0.5);
    ctx.lineTo(px + TILE, py + TILE * 0.5);
    ctx.moveTo(px + (h % 2 ? TILE * 0.5 : TILE * 0.25), py);
    ctx.lineTo(px + (h % 2 ? TILE * 0.5 : TILE * 0.25), py + TILE * 0.5);
    ctx.moveTo(px + (h % 2 ? TILE * 0.25 : TILE * 0.5), py + TILE * 0.5);
    ctx.lineTo(px + (h % 2 ? TILE * 0.25 : TILE * 0.5), py + TILE);
    ctx.stroke();

    // 磨损点
    if (h % 7 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(px + TILE * (0.3 + (h % 5) * 0.08), py + TILE * 0.62, 2, 2);
    }
    if (h % 11 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(px + TILE * 0.66, py + TILE * 0.36, TILE * 0.11, TILE * 0.06, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 墙 ----------
  function drawWall(px, py, x, y) {
    const mat = WALL_MAT[lastFloor] || 'stone';
    const h = hash(x, y);
    let face = C.stone, edge = '#1b2130', deep = C.stone2;
    if (mat === 'brick') { face = '#2f3b4d'; edge = '#1d2634'; deep = '#26313f'; }
    else if (mat === 'wet') { face = '#232a38'; edge = '#141a24'; deep = '#1a2029'; }
    else if (mat === 'charred') { face = '#241d1e'; edge = '#120e10'; deep = '#191314'; }

    ctx.fillStyle = edge;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = deep;
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);

    // 立体感：上缘受光 / 下缘投影
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, face);
    g.addColorStop(0.55, deep);
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);

    // 砖缝
    ctx.strokeStyle = 'rgba(0,0,0,0.34)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const rows = 2;
    for (let r = 1; r < rows; r++) {
      ctx.moveTo(px + 2, py + (TILE / rows) * r);
      ctx.lineTo(px + TILE - 2, py + (TILE / rows) * r);
    }
    for (let r = 0; r < rows; r++) {
      const off = (r % 2 ? 0.5 : 0.28) * TILE;
      for (let c = 0; c < 2; c++) {
        const cx = px + off + c * TILE * 0.5;
        if (cx > px + 3 && cx < px + TILE - 3) {
          ctx.moveTo(cx, py + (TILE / rows) * r + 2);
          ctx.lineTo(cx, py + (TILE / rows) * (r + 1) - 2);
        }
      }
    }
    ctx.stroke();

    // 上缘高光
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(px + 2, py + 2, TILE - 4, 1);

    // 裂纹：焦砖更多
    const crackChance = mat === 'charred' ? 0.55 : mat === 'wet' ? 0.18 : 0.13;
    if ((h % 100) / 100 < crackChance) {
      ctx.strokeStyle = mat === 'charred' ? 'rgba(255,120,60,0.16)' : 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = px + TILE * (0.22 + (h % 5) * 0.09);
      ctx.moveTo(sx, py + 4);
      ctx.lineTo(sx + TILE * 0.13, py + TILE * 0.4);
      ctx.lineTo(sx - TILE * 0.04, py + TILE * 0.58);
      ctx.lineTo(sx + TILE * 0.1, py + TILE - 5);
      ctx.stroke();
    }

    // 湿墙：水光与滴痕
    if (mat === 'wet') {
      const wg = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
      wg.addColorStop(0, 'rgba(120,170,220,0.07)');
      wg.addColorStop(0.42, 'rgba(120,170,220,0.015)');
      wg.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = wg;
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      if (h % 9 === 0) {
        ctx.strokeStyle = 'rgba(150,200,255,0.16)';
        ctx.beginPath();
        ctx.moveTo(px + TILE * (0.3 + (h % 4) * 0.1), py + TILE * 0.1);
        ctx.lineTo(px + TILE * (0.34 + (h % 4) * 0.1), py + TILE * 0.46);
        ctx.stroke();
      }
    }
    // 焦砖：余烬
    if (mat === 'charred' && h % 13 === 0) {
      ctx.fillStyle = 'rgba(255,110,50,0.14)';
      ctx.beginPath();
      ctx.arc(px + TILE * 0.5, py + TILE * 0.58, TILE * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- 环境光遮蔽：地面贴墙处压暗 ----------
  function drawAO(px, py, map, x, y) {
    const dirs = [[0, -1, 't'], [0, 1, 'b'], [-1, 0, 'l'], [1, 0, 'r']];
    for (const [dx, dy, side] of dirs) {
      const ch = map[y + dy] && map[y + dy][x + dx];
      if (ch !== '#') continue;
      const d = TILE * 0.42;
      let g;
      if (side === 't') g = ctx.createLinearGradient(px, py, px, py + d);
      else if (side === 'b') g = ctx.createLinearGradient(px, py + TILE, px, py + TILE - d);
      else if (side === 'l') g = ctx.createLinearGradient(px, py, px + d, py);
      else g = ctx.createLinearGradient(px + TILE, py, px + TILE - d, py);
      g.addColorStop(0, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      if (side === 't') ctx.fillRect(px, py, TILE, d);
      else if (side === 'b') ctx.fillRect(px, py + TILE - d, TILE, d);
      else if (side === 'l') ctx.fillRect(px, py, d, TILE);
      else ctx.fillRect(px + TILE - d, py, d, TILE);
    }
  }

  function drawCarpet(map) {
    if (lastFloor !== 5) return;
    for (let y = 1; y < SIZE; y++) {
      for (let x = 4; x <= 6; x++) {
        if (map[y][x] === '#') continue;
        const edge = x === 4 || x === 6;
        const g = ctx.createLinearGradient(x * TILE, 0, (x + 1) * TILE, 0);
        g.addColorStop(0, edge ? 'rgba(108,22,28,0.62)' : 'rgba(84,17,23,0.46)');
        g.addColorStop(0.5, edge ? 'rgba(152,34,40,0.55)' : 'rgba(112,24,30,0.4)');
        g.addColorStop(1, edge ? 'rgba(108,22,28,0.62)' : 'rgba(84,17,23,0.46)');
        ctx.fillStyle = g;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (edge) {
          ctx.fillStyle = 'rgba(200,160,80,0.26)';
          ctx.fillRect(x * TILE + (x === 4 ? 0 : TILE - 1), y * TILE, 1, TILE);
        }
      }
    }
  }

  // ---------- 静态层 ----------
  function buildStatic(state) {
    const map = state.maps[state.floor];
    const key = state.floor + '|' + TILE + '|' + dpr;
    if (key === bgKey && bgCanvas) return;
    if (!bgCanvas) bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.floor(TILE * SIZE * dpr);
    bgCanvas.height = Math.floor(TILE * SIZE * dpr);
    const prev = ctx;
    ctx = bgCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, TILE * SIZE, TILE * SIZE);

    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        drawFloorTile(x * TILE, y * TILE, x, y);
      }
    }
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === '#') drawWall(x * TILE, y * TILE, x, y);
        else drawAO(x * TILE, y * TILE, map, x, y);
      }
    }
    drawCarpet(map);
    ctx = prev;
    bgKey = key;
  }

  // 天光光柱（左右羽化 + 纵向衰减）：预渲染一次，之后只调透明度
  function buildBeam() {
    const key = TILE + '|' + dpr;
    if (key === beamKey && beamCanvas) return;
    const w = TILE * 4, h = TILE * 5;
    beamCanvas = beamCanvas || document.createElement('canvas');
    beamCanvas.width = Math.floor(w * dpr);
    beamCanvas.height = Math.floor(h * dpr);
    const bctx = beamCanvas.getContext('2d');
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, w, h);
    const hg = bctx.createLinearGradient(0, 0, w, 0);
    hg.addColorStop(0, 'rgba(255,240,200,0)');
    hg.addColorStop(0.2, 'rgba(255,240,200,0.5)');
    hg.addColorStop(0.5, 'rgba(255,243,214,1)');
    hg.addColorStop(0.8, 'rgba(255,240,200,0.5)');
    hg.addColorStop(1, 'rgba(255,240,200,0)');
    bctx.fillStyle = hg;
    bctx.fillRect(0, 0, w, h);
    // 纵向衰减
    bctx.globalCompositeOperation = 'destination-in';
    const vg = bctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0.95)');
    vg.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    vg.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = vg;
    bctx.fillRect(0, 0, w, h);
    bctx.globalCompositeOperation = 'source-over';
    beamKey = key;
  }

  // ---------- 实体 ----------
  function drawEmoji(ch, px, py, scale) {
    ctx.font = `${Math.floor(TILE * (scale || 0.62))}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, px + TILE / 2, py + TILE / 2 + TILE * 0.04);
  }

  function glow(color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  function noGlow() {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  // 接地阴影：让所有实体"站"在地上
  function groundShadow(px, py, w, alpha) {
    const cx = px + TILE / 2;
    const cy = py + TILE * 0.78;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, w);
    g.addColorStop(0, `rgba(0,0,0,${alpha == null ? 0.42 : alpha})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, w * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawDoor(ch, px, py) {
    const color = ch === 'y' ? ['#8a6a18', '#d8b04a'] : ['#7a1f24', '#d2535b'];
    // 门框
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    roundRect(px + TILE * 0.1, py + TILE * 0.06, TILE * 0.8, TILE * 0.88, TILE * 0.08);
    ctx.fill();
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, color[1]);
    g.addColorStop(0.55, color[0]);
    g.addColorStop(1, '#241408');
    ctx.fillStyle = g;
    roundRect(px + TILE * 0.15, py + TILE * 0.11, TILE * 0.7, TILE * 0.78, TILE * 0.07);
    ctx.fill();
    // 铁条
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + TILE * 0.22, py + TILE * 0.32);
    ctx.lineTo(px + TILE * 0.78, py + TILE * 0.32);
    ctx.moveTo(px + TILE * 0.22, py + TILE * 0.66);
    ctx.lineTo(px + TILE * 0.78, py + TILE * 0.66);
    ctx.stroke();
    // 锁孔
    ctx.fillStyle = 'rgba(255,235,190,0.75)';
    ctx.beginPath();
    ctx.arc(px + TILE * 0.5, py + TILE * 0.5, TILE * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color[1];
    ctx.font = `${Math.floor(TILE * 0.2)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.85;
    ctx.fillText(ch === 'y' ? '🔑' : '🗝️', px + TILE * 0.5, py + TILE * 0.78);
    ctx.globalAlpha = 1;
  }

  function drawStairs(ch, px, py) {
    const up = ch === 'u';
    ctx.fillStyle = up ? 'rgba(120,200,255,0.09)' : 'rgba(255,190,90,0.08)';
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    // 三级台阶
    ctx.fillStyle = up ? 'rgba(140,210,255,0.2)' : 'rgba(255,196,107,0.18)';
    for (let i = 0; i < 3; i++) {
      const w = TILE * (0.62 - i * 0.14);
      ctx.fillRect(px + (TILE - w) / 2, py + TILE * (0.34 + i * 0.16), w, TILE * 0.08);
    }
    ctx.fillStyle = up ? 'rgba(160,220,255,0.95)' : 'rgba(255,200,120,0.95)';
    ctx.font = `${Math.floor(TILE * 0.3)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(up ? '▲' : '▼', px + TILE * 0.5, py + TILE * 0.2);
  }

  function drawItem(ch, px, py, t) {
    const it = D.items[ch];
    const bob = Math.sin(t / 520 + px * 0.07 + py * 0.05) * TILE * 0.035;
    groundShadow(px, py, TILE * 0.24, 0.32);
    let tint = 'rgba(150,220,255,0.3)';
    if (ch === '$') tint = 'rgba(250,205,80,0.34)';
    else if (ch === 'k' || ch === 'L') tint = ch === 'k' ? 'rgba(240,200,70,0.32)' : 'rgba(255,90,90,0.32)';
    else if (it && it.type === 'hp') tint = 'rgba(255,110,110,0.34)';
    else if (it && it.type === 'atk') tint = 'rgba(255,190,110,0.32)';
    else if (it && it.type === 'def') tint = 'rgba(130,190,255,0.32)';
    else if (it && it.type === 'both') tint = 'rgba(200,150,255,0.36)';
    else if (it && it.type === 'relic') tint = 'rgba(255,225,150,0.4)';

    glow(tint, TILE * 0.32);
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(px + TILE / 2, py + TILE / 2 + bob, TILE * 0.25, 0, Math.PI * 2);
    ctx.fill();
    noGlow();
    drawEmoji(ch === '$' ? '💰' : ch === 'k' ? '🔑' : ch === 'L' ? '🗝️' : it ? it.emoji : '❓', px, py + bob, it && it.type === 'relic' ? 0.62 : 0.56);
    if (it && it.type === 'relic') {
      // 遗物：外圈金环，一眼可辨
      ctx.strokeStyle = 'rgba(255,225,150,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2 + bob, TILE * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBadge(px, py, text, color) {
    const fs = Math.max(9, Math.floor(TILE * 0.2));
    ctx.font = `700 ${fs}px "Microsoft YaHei",sans-serif`;
    const w = ctx.measureText(text).width + 6;
    const h = fs + 5;
    ctx.fillStyle = 'rgba(6,8,13,0.84)';
    roundRect(px + TILE - w - 2, py + 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px + TILE - w / 2 - 2, py + 2 + h / 2 + 0.5);
  }

  function drawMonster(ch, px, py, t) {
    const m = D.monsters[ch];
    const bob = Math.sin(t / 420 + px * 0.11) * TILE * 0.035;
    groundShadow(px, py, TILE * (m.boss ? 0.4 : 0.3), 0.4);
    if (m.boss) {
      const g = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE * 0.66);
      g.addColorStop(0, 'rgba(255,60,60,0.26)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px - TILE * 0.2, py - TILE * 0.2, TILE * 1.4, TILE * 1.4);
    }
    if (m.ghost) {
      const p = 0.5 + Math.sin(t / 300) * 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(159,216,255,' + (0.16 + p * 0.24).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2, TILE * (0.3 + p * 0.06), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      glow('rgba(159,216,255,' + (0.2 + p * 0.28).toFixed(2) + ')', TILE * 0.5);
      ctx.globalAlpha = 0.92;
      drawEmoji(m.emoji, px, py + bob * 1.8, 0.58);
      ctx.globalAlpha = 1;
      noGlow();
      return;
    }
    drawEmoji(m.emoji, px, py + bob, m.boss ? 0.76 : 0.6);
  }

  function drawPlayer(px, py, t) {
    const bob = Math.sin(t / 380) * 1.6;
    const g = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE * 0.7);
    g.addColorStop(0, 'rgba(255,215,120,0.26)');
    g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - TILE * 0.2, py - TILE * 0.2, TILE * 1.4, TILE * 1.4);
    groundShadow(px, py, TILE * 0.28, 0.45);

    let sx = 1, sy = 1;
    const dx = Math.abs(disp.x - (disp._tx || disp.x));
    const dy = Math.abs(disp.y - (disp._ty || disp.y));
    if (dx > 0.05) { sx = 1.08; sy = 0.94; }
    else if (dy > 0.05) { sx = 0.94; sy = 1.08; }
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2 + bob);
    ctx.scale(sx * face, sy);
    ctx.font = `${Math.floor(TILE * 0.62)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧙', 0, 0);
    ctx.restore();
  }

  // ---------- 氛围 ----------
  function updateAmbient(dt) {
    const rate = ambient.mode === 'boss' ? 340 : ambient.mode === 'mist' ? 620 : 480;
    ambient.spawnAcc += dt;
    if (ambient.spawnAcc > rate && ambient.embers.length < 16) {
      ambient.spawnAcc = 0;
      ambient.embers.push({
        x: Math.random() * TILE * SIZE,
        y: TILE * SIZE + 6,
        vy: -(14 + Math.random() * 20),
        vx: (Math.random() - 0.5) * 8,
        size: ambient.mode === 'mist' ? 2.5 + Math.random() * 3 : 1.5 + Math.random() * 2,
        start: simT,
        life: 5200 + Math.random() * 3000,
        flick: Math.random() * 10,
      });
    }
    const colors = ambient.mode === 'boss' ? ['255,90,70'] : ambient.mode === 'mist' ? ['170,140,255'] : ['255,180,90', '255,200,120'];
    for (let i = ambient.embers.length - 1; i >= 0; i--) {
      const e = ambient.embers[i];
      const age = simT - e.start;
      if (age > e.life || e.y < -8) { ambient.embers.splice(i, 1); continue; }
      e.y += e.vy * dt / 1000;
      e.x += (e.vx + Math.sin(simT / 700 + e.flick) * 6) * dt / 1000;
      const p = age / e.life;
      const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
      const c = colors[(e.flick | 0) % colors.length];
      ctx.fillStyle = `rgba(${c},${(alpha * 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawAmbientOverlay() {
    if (ambient.mode === 'boss') {
      const a = 0.05 + Math.sin(performance.now() / 900) * 0.03;
      const g = ctx.createRadialGradient(TILE * SIZE / 2, TILE * SIZE / 2, TILE * 2, TILE * SIZE / 2, TILE * SIZE / 2, TILE * SIZE * 0.75);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,30,30,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
    } else if (ambient.mode === 'mist') {
      const g = ctx.createRadialGradient(TILE * SIZE / 2, TILE * SIZE / 2, TILE * 2, TILE * SIZE / 2, TILE * SIZE / 2, TILE * SIZE * 0.72);
      g.addColorStop(0, 'rgba(120,90,255,0)');
      g.addColorStop(1, 'rgba(120,90,255,0.07)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
    }
  }

  // ---------- 特效 ----------
  let lastDt = 16;
  let lastNow = 0;

  function updateFx() {
    for (let i = flashes.length - 1; i >= 0; i--) if (simT - flashes[i].start > flashes[i].dur) flashes.splice(i, 1);
    for (let i = rings.length - 1; i >= 0; i--) if (simT - rings[i].start > rings[i].dur) rings.splice(i, 1);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (simT - p.start > p.life) { particles.splice(i, 1); continue; }
      p.vy += p.grav * lastDt / 1000;
      p.x += p.vx * lastDt / 1000;
      p.y += p.vy * lastDt / 1000;
    }
    for (let i = floats.length - 1; i >= 0; i--) if (simT - floats[i].start > floats[i].dur) floats.splice(i, 1);
  }

  function drawFx() {
    for (const r of rings) {
      const p = (simT - r.start) / r.dur;
      const ease = 1 - Math.pow(1 - p, 2.2);
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(r.tx * TILE + TILE / 2, r.ty * TILE + TILE / 2, 6 + ease * r.maxR, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of flashes) {
      const p = (simT - f.start) / f.dur;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.fillStyle = f.color;
      ctx.fillRect(f.tx * TILE, f.ty * TILE, TILE, TILE);
    }
    for (const p of particles) {
      const age = simT - p.start;
      const k = 1 - age / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * (1 + Math.min(1.2, Math.abs(p.vy) / 220)));
    }
    for (const e of floats) {
      const p = (simT - e.start) / e.dur;
      const rise = (1 - Math.pow(1 - Math.min(1, p * 1.15), 2.4)) * TILE * 1.1;
      const pop = e.big ? 1 + 0.5 * Math.pow(1 - Math.min(1, p * 3.4), 2) * Math.exp(-p * 4) : 1 + 0.22 * Math.pow(1 - Math.min(1, p * 4), 2);
      ctx.globalAlpha = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
      ctx.fillStyle = e.color;
      ctx.font = `700 ${Math.floor(TILE * (e.big ? 0.5 : 0.36) * pop)}px "Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, e.x, e.y - rise);
    }
    ctx.globalAlpha = 1;
    noGlow();
  }

  // 自动寻路目标标记
  let targetMarker = null;
  function setTarget(tx, ty) {
    targetMarker = tx == null ? null : { tx, ty, start: performance.now() };
  }
  function drawTargetMarker() {
    if (!targetMarker) return;
    const p = ((performance.now() - targetMarker.start) % 900) / 900;
    const a = 0.32 + 0.32 * (1 - p);
    ctx.save();
    ctx.strokeStyle = `rgba(232,196,106,${a.toFixed(2)})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -p * 18;
    const inset = 3 + p * 2;
    roundRect(targetMarker.tx * TILE + inset, targetMarker.ty * TILE + inset, TILE - inset * 2, TILE - inset * 2, 5);
    ctx.stroke();
    ctx.restore();
  }

  // ---------- 光照 ----------
  function drawLighting() {
    const mood = FLOOR_MOOD[lastFloor] || 0.24;
    const cx = disp.x * TILE + TILE / 2;
    const cy = disp.y * TILE + TILE / 2;
    const r0 = TILE * 0.75;
    const r1 = Math.max(r0 + TILE, TILE * (3.9 - mood * 3.1));
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(4,6,10,0)');
    g.addColorStop(0.55, `rgba(4,6,10,${(mood * 0.55).toFixed(3)})`);
    g.addColorStop(1, `rgba(3,5,9,${mood})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
  }

  function drawTorches() {
    if (!torchList.length) return;
    // 8 秒一次的呼吸
    const breath = 0.86 + 0.14 * Math.sin((simT / 8000) * Math.PI * 2 - Math.PI / 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of torchList) {
      const fl = (0.82 + Math.sin(simT / 150 + tr.seed) * 0.12 + Math.sin(simT / 47 + tr.seed) * 0.06) * breath;
      const fx = tr.x * TILE + TILE / 2 + (tr.sx || 0) * TILE * 0.34;
      const fy = tr.y * TILE + TILE / 2 + (tr.sy || 0) * TILE * 0.34;
      const R = TILE * 1.75 * fl;
      const g = ctx.createRadialGradient(fx, fy, 1, fx, fy, R);
      g.addColorStop(0, 'rgba(255,196,120,0.34)');
      g.addColorStop(0.4, 'rgba(255,150,70,0.115)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, R, 0, Math.PI * 2);
      ctx.fill();
      // 灯托
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(38,30,24,0.9)';
      ctx.fillRect(fx - TILE * 0.03, fy + TILE * 0.02, TILE * 0.06, TILE * 0.15);
      ctx.globalCompositeOperation = 'lighter';
      // 火焰
      const fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, TILE * 0.17);
      fg.addColorStop(0, 'rgba(255,242,196,0.95)');
      fg.addColorStop(0.5, 'rgba(255,170,80,' + (0.5 + fl * 0.22).toFixed(2) + ')');
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy - TILE * 0.02, TILE * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeam() {
    if (lastFloor !== 5) return;
    if (!beamCanvas) buildBeam();
    if (!beamCanvas) return;
    const w = TILE * 4;
    const x = TILE * 5 - w / 2 + TILE / 2;
    const pulse = 0.82 + Math.sin(simT / 5200) * 0.18;
    ctx.globalAlpha = pulse;
    ctx.drawImage(beamCanvas, x, -TILE * 0.2, w, TILE * 5);
    ctx.globalAlpha = 1;
  }

  // 暗角 + 低血脉冲
  function drawVignette(state) {
    const W = TILE * SIZE;
    const g = ctx.createRadialGradient(W / 2, W * 0.46, W * 0.34, W / 2, W * 0.5, W * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.52)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, W);

    if (!state) return;
    const maxHp = state.maxHp || Math.max(state.hp, 1);
    const ratio = state.hp / maxHp;
    if (ratio > 0.25) return;
    const beat = 0.5 + 0.5 * Math.sin(performance.now() / 320);
    const a = (0.1 + beat * 0.16) * (1 - ratio / 0.25);
    const rg = ctx.createRadialGradient(W / 2, W / 2, W * 0.22, W / 2, W / 2, W * 0.72);
    rg.addColorStop(0, 'rgba(140,10,16,0)');
    rg.addColorStop(1, `rgba(150,12,18,${a.toFixed(3)})`);
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, W);
  }

  function drawBadges(state) {
    if (!state.flags || !state.flags.codex || !window.Engine) return;
    const maxHp = state.maxHp || Math.max(state.hp, 1000);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = state.maps[state.floor][y][x];
        if (!D.monsters[ch] || D.monsters[ch].ghost) continue;
        const pred = window.Engine.predict(ch);
        if (!pred || pred.damage == null) continue;
        const color = pred.damage === 0 ? '#6fe3a0' : pred.damage >= maxHp * 0.25 ? '#ff6b6b' : '#ffd27d';
        drawBadge(x * TILE, y * TILE, pred.damage === 0 ? '无伤' : '-' + pred.damage, color);
      }
    }
  }

  function drawMerchant(px, py) {
    groundShadow(px, py, TILE * 0.3, 0.35);
    ctx.fillStyle = 'rgba(120,255,170,0.06)';
    ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
    glow('rgba(120,255,170,0.3)', TILE * 0.3);
    drawEmoji('🏪', px, py, 0.54);
    noGlow();
  }

  // ---------- 主绘制 ----------
  function draw(state) {
    if (!state) return;
    const now = performance.now();
    lastDt = Math.min(50, now - (lastNow || now));
    lastNow = now;

    if (now >= freezeUntil) simT += lastDt;

    if (state.floor !== lastFloor) {
      setAmbient(state.floor, state.maps[state.floor]);
      disp.x = state.x;
      disp.y = state.y;
    }

    updateFx();

    ctx.clearRect(0, 0, TILE * SIZE, TILE * SIZE);
    ctx.save();

    if (performance.now() < shakeUntil) {
      const remain = (shakeUntil - now) / shakeDur;
      const k = TILE * 0.05 * shakeMag / 6 * remain * remain;
      ctx.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
    }

    // 静态层
    buildStatic(state);
    ctx.drawImage(bgCanvas, 0, 0, TILE * SIZE, TILE * SIZE);

    // 实体层
    const map = state.maps[state.floor];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = map[y][x];
        if (ch === '#') continue;
        const px = x * TILE;
        const py = y * TILE;
        if (ch === 'y' || ch === 'r') drawDoor(ch, px, py);
        else if (ch === 'u' || ch === 'n') drawStairs(ch, px, py);
        else if (ch === 'M') drawMerchant(px, py);
        else if (ch === 'T') {
          groundShadow(px, py, TILE * 0.26, 0.35);
          glow('rgba(255,240,150,0.5)', TILE * 0.52);
          drawEmoji('👸', px, py, 0.64);
          noGlow();
        } else if (ch === 'J') {
          groundShadow(px, py, TILE * 0.22, 0.3);
          glow('rgba(200,160,255,0.42)', TILE * 0.42);
          drawEmoji('📜', px, py + Math.sin(simT / 500) * TILE * 0.03, 0.56);
          noGlow();
        } else if (D.monsters[ch]) drawMonster(ch, px, py, simT);
        else if (D.items[ch] || ch === '$') drawItem(ch, px, py, simT);
      }
    }

    updateAmbient(lastDt);
    drawAmbientOverlay();
    drawTargetMarker();

    // 玩家
    const k = 1 - Math.pow(0.0008, lastDt / 1000);
    disp._tx = state.x;
    disp._ty = state.y;
    const nx = state.x;
    if (nx > disp.x + 0.02) face = 1;
    else if (nx < disp.x - 0.02) face = -1;
    disp.x += (state.x - disp.x) * k;
    disp.y += (state.y - disp.y) * k;
    if (Math.abs(state.x - disp.x) < 0.02) disp.x = state.x;
    if (Math.abs(state.y - disp.y) < 0.02) disp.y = state.y;
    drawPlayer(disp.x * TILE, disp.y * TILE, simT);

    // 光照
    drawLighting();
    drawTorches();
    drawBeam();
    drawBadges(state);
    drawFx();
    drawVignette(state);

    // 全屏白脉冲
    const pp = (now - pulseStart) / 430;
    if (pp >= 0 && pp < 1) {
      ctx.fillStyle = `rgba(255,244,214,${(0.72 * (1 - pp)).toFixed(3)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    // 换层淡入
    if (now < fadeUntil) {
      const p = (fadeUntil - now) / 280;
      ctx.fillStyle = `rgba(5,7,12,${Math.min(1, p)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    ctx.restore();
  }

  window.Renderer = {
    init, layout, draw, snapshot,
    addFloat, shake, fade, freeze, pulse, flashTile, ring, burst,
    setAmbient, setTarget,
    getTile: () => TILE,
  };
})();
