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
  let scareCb = null;   // 小生物受惊时通知表现层（播一声轻啾）

  const floats = [];
  const particles = [];
  const flashes = [];
  const rings = [];
  let shakeUntil = 0, shakeMag = 6, shakeDur = 200;
  let fadeUntil = 0;
  let pulseStart = -9999;
  // 遗物拾取高光：一道从拾取点冲天的十字星芒（竖轴冲出画面顶、横轴扫过全屏）
  let relicBeam = null;

  const disp = { x: 1, y: 1 };
  let lastFloor = -1;
  let face = 1;

  let ambient = { mode: 'torch', critters: [], spawnAcc: 0 };
  let torchList = [];
  let bgCanvas = null, bgKey = '';
  let dirty = true; // 画布尺寸/楼层变化后需要补一帧
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
    dirty = true;
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
  // 像素坐标版（小生物受惊用）：不落在格心，直接给屏幕坐标
  function ringPx(px, py, color, maxR, dur) {
    rings.push({ px, py, start: simT, dur: dur || 380, color, maxR: maxR || TILE * 0.6 });
  }
  // 遗物高光：十字星芒 + 三重冲击环。竖光柱从拾取点冲出画面顶，横光带扫过全屏
  function relicBeamFx(tx, ty, mood) {
    const red = mood === 'boss';
    relicBeam = { tx, ty, start: performance.now(), red };
    rings.push({ tx, ty, start: simT, dur: 520, color: red ? 'rgba(255,160,140,0.95)' : 'rgba(255,236,180,0.95)', maxR: TILE * 3.2 });
    rings.push({ tx, ty, start: simT + 140, dur: 620, color: red ? 'rgba(255,140,120,0.7)' : 'rgba(255,215,130,0.7)', maxR: TILE * 4.6 });
    rings.push({ tx, ty, start: simT + 300, dur: 720, color: red ? 'rgba(201,74,82,0.55)' : 'rgba(232,196,106,0.5)', maxR: TILE * 6 });
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
  // 光照明暗：沿塔身单调加深（6 层时代的数据在 12 层扩层后出现锯齿——
  // 第 8 层比第 7 层亮、第 12 层突然最深，破坏"越爬越深"的心理暗示）
  const FLOOR_MOOD = [0.13, 0.16, 0.19, 0.22, 0.25, 0.28, 0.31, 0.34, 0.36, 0.38, 0.40, 0.42, 0.44];
  const WALL_MAT = ['brick', 'brick', 'stone', 'wet', 'stone', 'charred', 'wet', 'stone', 'wet', 'stone', 'charred', 'stone', 'wet'];
  // 每层地砖底色：锁梁六层各有自己的温度
  const FLOOR_TINT = [
    null, null, null, ['#12101c', '#0f0d18'], null, ['#1a1016', '#160e13'],
    ['#101a22', '#0d161d'], ['#1a1712', '#161310'], ['#1b1510', '#17110d'],
    ['#191a20', '#15161b'], ['#15131a', '#111016'], ['#1c1014', '#170d10'], ['#0d1420', '#0a111a'],
  ];

  function setAmbient(floorIndex, map) {
    const fdef = window.GAME_DATA && window.GAME_DATA.floors[floorIndex];
    const mode = (fdef && fdef.ambient) || 'torch';
    ambient = { mode, critters: [], spawnAcc: 0 };
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
    const tint = FLOOR_TINT[lastFloor];
    let base = (x + y) % 2 === 0 ? (tint ? tint[0] : '#101622') : (tint ? tint[1] : '#0d121c');
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
    const isMid = lastFloor === 5;
    const isTop = lastFloor === 11;
    if (!isMid && !isTop) return;
    for (let y = 1; y < SIZE; y++) {
      for (let x = 4; x <= 6; x++) {
        if (map[y][x] === '#') continue;
        const edge = x === 4 || x === 6;
        const g = ctx.createLinearGradient(x * TILE, 0, (x + 1) * TILE, 0);
        if (isTop) {
          // 第四章塔顶：冷灰石道 + 紫色细线，呼应本章主色，不与中点王座的红毯撞语义
          g.addColorStop(0, edge ? 'rgba(86,76,124,0.34)' : 'rgba(46,42,64,0.30)');
          g.addColorStop(0.5, edge ? 'rgba(120,104,168,0.30)' : 'rgba(70,62,96,0.26)');
          g.addColorStop(1, edge ? 'rgba(86,76,124,0.34)' : 'rgba(46,42,64,0.30)');
        } else {
          g.addColorStop(0, edge ? 'rgba(108,22,28,0.62)' : 'rgba(84,17,23,0.46)');
          g.addColorStop(0.5, edge ? 'rgba(152,34,40,0.55)' : 'rgba(112,24,30,0.4)');
          g.addColorStop(1, edge ? 'rgba(108,22,28,0.62)' : 'rgba(84,17,23,0.46)');
        }
        ctx.fillStyle = g;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (edge) {
          ctx.fillStyle = isTop ? 'rgba(185,164,255,0.24)' : 'rgba(200,160,80,0.26)';
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
    else if (it && (it.type === 'block' || it.type === 'block2')) tint = it.type === 'block2' ? 'rgba(255,120,120,0.42)' : 'rgba(159,216,255,0.4)';
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

  // 章节 Boss 地图标 identity：四位锁匠共用「炬」的剪影，只换光色（与 portraits.js 同源）
  const BOSS_LIGHT = {
    N: ['#b9a6ff', 'rgba(185,166,255,'], // 砚：紫
    Z: ['#ff7d7d', 'rgba(255,125,125,'], // 炬/魔王：红
    Y: ['#e8c46a', 'rgba(232,196,106,'], // 铎：金
    U: ['#9fd8ff', 'rgba(159,216,255,'], // 衡：蓝
  };

  // 章节 Boss 画法 v2：**站姿**持物锁匠。v1 的坐姿剪影+膝上书被用户评「丑、还是像书」——
  // 小 emoji 摆在格中反而成了视觉主体。v2 把人占满整格、道具缩到角色手里/脚边，
  // 加王冠/帽冠让「这是个人物」一眼可读；威胁度用脚下红环表达。
  function drawBossFigure(m, ch, px, py, t) {
    const cx = px + TILE / 2;
    const light = BOSS_LIGHT[ch] || BOSS_LIGHT.Z;
    const s = TILE / 48;
    const breathe = Math.sin(t / 620 + px * 0.07);
    const sway = Math.sin(t / 900 + px * 0.05) * 1.2; // 身体轻微摇曳

    groundShadow(px, py, TILE * 0.4, 0.42);

    // 脚下红色威胁环：双层脉动椭圆，沿用全塔「红 = 危险」的语言
    const ringP = 0.86 + Math.sin(t / 430) * 0.14;
    ctx.strokeStyle = 'rgba(255,80,70,' + (0.42 + Math.sin(t / 430) * 0.16).toFixed(2) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE * 0.82, TILE * 0.4 * ringP, TILE * 0.15 * ringP, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,90,' + (0.18 + Math.sin(t / 430 + 1) * 0.1).toFixed(2) + ')';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(cx, py + TILE * 0.82, TILE * 0.48 * ringP, TILE * 0.19 * ringP, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 身后光晕：该锁匠的立绘光色，两层渐变把角色从暗墙上衬出来
    const haloY = py + TILE * 0.4;
    let halo = ctx.createRadialGradient(cx, haloY, 1, cx, haloY, TILE * 0.62);
    halo.addColorStop(0, light[1] + '0.38)');
    halo.addColorStop(0.55, light[1] + '0.13)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(px - TILE * 0.18, py - TILE * 0.25, TILE * 1.36, TILE * 1.45);

    // ===== 站姿人物（坐标：脚底 = 0，头顶 ≈ -40；整格高 TILE≈48*s）=====
    ctx.save();
    ctx.translate(cx + sway * s * 0.4, py + TILE * 0.8);
    ctx.scale(s, s);
    const ink = '#0b0e16';

    // 躯干：宽肩→腰收→袍摆（斗篷感），先画光色轮廓底版再盖黑
    const body = (grow, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-8.5 - grow, 0);                       // 袍摆左
      ctx.bezierCurveTo(-10 - grow, -8, -9.5 - grow, -16, -7.5 - grow, -21);
      ctx.bezierCurveTo(-6 - grow, -25, -4 - grow, -27, 0, -27);
      ctx.bezierCurveTo(4 + grow, -27, 6 + grow, -25, 7.5 + grow, -21);
      ctx.bezierCurveTo(9.5 + grow, -16, 10 + grow, -8, 8.5 + grow, 0); // 袍摆右
      ctx.closePath();
      ctx.fill();
    };
    body(1.2, light[1] + '0.8)');   // 亮边底版
    body(0, ink);                   // 黑色本体

    // 肩甲亮线：左右肩各一道高光，勾出「肩膀」的结构
    ctx.strokeStyle = light[1] + '0.9)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7.5, -20.5);
    ctx.quadraticCurveTo(-5, -24.5, -1.5, -25.5);
    ctx.moveTo(7.5, -20.5);
    ctx.quadraticCurveTo(5, -24.5, 1.5, -25.5);
    ctx.stroke();

    // 头（兜帽轮廓：上圆下宽，兜帽比脸大一圈才有包着的感觉）
    const hood = (grow, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, -32.5, 6.2 + grow, 7 + grow, 0, 0, Math.PI * 2);
      ctx.fill();
    };
    hood(1.2, light[1] + '0.8)');
    hood(0, ink);
    // 兜帽开口：脸部一块更深的洞，眼睛在里面发亮
    ctx.fillStyle = '#04060b';
    ctx.beginPath();
    ctx.ellipse(0, -31.5, 5.2, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // 冠饰：三尖冠（锁匠身份感），光色实心，随呼吸微亮
    ctx.fillStyle = light[1] + (0.78 + breathe * 0.18).toFixed(2) + ')';
    ctx.beginPath();
    ctx.moveTo(-4.6, -38.2);
    ctx.lineTo(-3.1, -42.5);
    ctx.lineTo(-1.6, -38.8);
    ctx.lineTo(0, -43.6);
    ctx.lineTo(1.6, -38.8);
    ctx.lineTo(3.1, -42.5);
    ctx.lineTo(4.6, -38.2);
    ctx.closePath();
    ctx.fill();

    // 亮瞳：两粒大而亮的眼睛——「有人在看路过的你」（画大，缩小后也要可读）
    ctx.fillStyle = light[1] + '1)';
    ctx.beginPath();
    ctx.ellipse(-2.3, -31.4, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(2.3, -31.4, 2.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // 瞳孔辉光
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(-2.3, -32.2, 0.8, 0, Math.PI * 2);
    ctx.arc(2.3, -32.2, 0.8, 0, Math.PI * 2);
    ctx.fill();

    // 手臂：一只手在身前托着锁物
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-7, -18);
    ctx.quadraticCurveTo(-6.5, -11, -2.5, -7.5);
    ctx.moveTo(7, -18);
    ctx.quadraticCurveTo(6.5, -11, 2.5, -7.5);
    ctx.stroke();
    ctx.restore();

    // ===== 锁物：捧在胸前（手臂托着的位置），发光但只是配角 =====
    const itemY = py + TILE * 0.46;
    ctx.save();
    glow(light[1] + '0.55)', TILE * 0.3);
    ctx.globalAlpha = 0.96;
    drawEmoji(m.emoji, px, itemY - py, 0.3);
    ctx.globalAlpha = 1;
    noGlow();
    ctx.restore();

    // 名字小签：挂在格子**左上角**，绝不遮住脸；彻底杜绝「这是道具」的误读
    const tag = m.name || '';
    if (tag) {
      ctx.font = `700 ${Math.max(8, Math.floor(TILE * 0.16))}px "Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(tag).width;
      const th = TILE * 0.2;
      const tx = px + TILE * 0.06;            // 左上角内侧
      const ty = py + TILE * 0.03;
      ctx.fillStyle = 'rgba(5,7,12,0.78)';
      roundRect(tx - TILE * 0.04, ty, tw + TILE * 0.08, th, th * 0.4);
      ctx.fill();
      ctx.strokeStyle = light[1] + '0.5)';
      ctx.lineWidth = 1;
      roundRect(tx - TILE * 0.04, ty, tw + TILE * 0.08, th, th * 0.4);
      ctx.stroke();
      ctx.fillStyle = light[0];
      ctx.fillText(tag, tx, ty + th / 2 + 0.5);
    }
  }

  function drawMonster(ch, px, py, t) {
    const m = D.monsters[ch];
    if (m.boss) { drawBossFigure(m, ch, px, py, t); return; }
    const bob = Math.sin(t / 420 + px * 0.11) * TILE * 0.035;
    groundShadow(px, py, TILE * 0.3, 0.4);
    // 同族底光：兽=琥珀 / 亡=霜蓝 / 构=石灰 / 异=苔绿
    const tint = !m.ghost && D.kindColor && D.kindColor[m.kind];
    if (tint) {
      const kg = ctx.createRadialGradient(px + TILE / 2, py + TILE * 0.6, 1, px + TILE / 2, py + TILE * 0.6, TILE * 0.52);
      kg.addColorStop(0, tint);
      kg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = kg;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE * 0.6, TILE * 0.52, 0, Math.PI * 2);
      ctx.fill();
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
    drawEmoji(m.emoji, px, py + bob, 0.6);
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

  // ---------- 氛围：低频小生物（萤火虫/飞蛾/蝙蝠/锁芯尘埃） ----------
  // 取代旧「余烬粒子」：那是每 0.5s 一颗的静止黄点，看着像屏幕脏了。
  // 现在：同屏最多 2~3 只、十几秒才来一只；进场 → 悬停漫游 → 离场；
  // 玩家走近 1.7 格内、或正在移动，就近的会受惊加速飞走（蝙蝠是快速掠过的剪影，不停留、不受惊）。
  // Settings.critters = false 时不再出生（已有的自然飞完）。
  let crittersEnabled = () => !(window.__tmCfg && window.__tmCfg.critters === false);
  function pickEdgeTarget(x, y) {
    // 选一个屏幕外的离场点，返回归一化方向
    const S = TILE * SIZE;
    const edge = (Math.random() * 4) | 0;
    const tx = edge === 0 ? -TILE : edge === 1 ? S + TILE : x;
    const ty = edge === 2 ? -TILE : edge === 3 ? S + TILE : y;
    const d = Math.max(1, Math.hypot(tx - x, ty - y));
    return [(tx - x) / d, (ty - y) / d];
  }

  function spawnCritter(kindForce) {
    const S = TILE * SIZE;
    const mode = ambient.mode;
    let kind = 'firefly';
    if (mode === 'core') kind = 'wisp'; // 锁芯：逆时针慢转的尘埃幽灵
    else if (mode === 'mist') kind = 'moth';
    else if (mode === 'boss') kind = Math.random() < 0.6 ? 'bat' : 'ember';
    else if (Math.random() < 0.2) kind = 'ember'; // 火把层偶尔一颗真火星，压低频
    if (kindForce) kind = kindForce;
    const edge = (Math.random() * 4) | 0;
    const m = TILE * 0.4;
    const c = {
      kind,
      x: edge === 0 ? -m : edge === 1 ? S + m : Math.random() * S,
      y: edge === 0 || edge === 1 ? Math.random() * S : (edge === 2 ? -m : S + m),
      vx: 0, vy: 0,
      born: simT,
      seed: Math.random() * 100,
      state: 'fly', // fly（进场）→ hover（悬停漫游）→ leave（离场）/ scare（受惊离场）
      hoverT: 0,
      hoverDur: kind === 'bat' || kind === 'ember' ? 0 : 6 + Math.random() * 7,
      wing: Math.random() * Math.PI * 2,
      glowT: Math.random() * 3, // 萤火虫的呼吸明灭
      spin: 0, // wisp 的逆时针相位
      speed: kind === 'bat' ? 150 : kind === 'moth' ? 40 : kind === 'wisp' ? 14 : 24,
    };
    // 朝屏幕内一个随机点飞
    const tx = S * (0.2 + Math.random() * 0.6), ty = S * (0.2 + Math.random() * 0.6);
    const d = Math.max(1, Math.hypot(tx - c.x, ty - c.y));
    c.vx = (tx - c.x) / d; c.vy = (ty - c.y) / d;
    ambient.critters.push(c);
  }

  // 受惊涟漪的配色：按生物种类取同色系
  function scareColor(kind) {
    return kind === 'moth' ? 'rgba(198,176,255,0.75)' : kind === 'wisp' ? 'rgba(160,232,220,0.75)' : 'rgba(255,232,150,0.8)';
  }

  function updateAmbient(dt) {
    // 出生节奏：比旧余烬慢一个量级——约 11~15s 一只，同屏上限 2~3
    if (crittersEnabled()) {
      const rate = ambient.mode === 'boss' ? 15000 : ambient.mode === 'mist' ? 13000 : ambient.mode === 'core' ? 16000 : 11000;
      ambient.spawnAcc += dt;
      const cap = ambient.mode === 'boss' ? 2 : 3;
      if (ambient.spawnAcc > rate && ambient.critters.length < cap) {
        ambient.spawnAcc = 0;
        spawnCritter();
      }
    }
    const S = TILE * SIZE;
    const px = (disp._tx != null ? disp._tx : disp.x) * TILE + TILE / 2;
    const py = (disp._ty != null ? disp._ty : disp.y) * TILE + TILE / 2;
    const moving = disp._moving === true; // 玩家正在走路 → 附近生物立刻惊飞
    const s = dt / 1000;
    for (let i = ambient.critters.length - 1; i >= 0; i--) {
      const c = ambient.critters[i];
      // 翅膀频率：蝙蝠约 12Hz、飞蛾约 5Hz（firefly/wisp 不用翅膀，靠 glowT 呼吸）
      c.wing += dt * (c.kind === 'bat' ? 0.012 : c.kind === 'moth' ? 0.01 : 0.004);
      if (c.kind === 'wisp') c.spin += dt / 1400;

      // 玩家靠近 1.7 格、或正在移动且在 2.2 格内 → 受惊飞走（蝙蝠/火星不停留，不受惊）
      if (c.state === 'fly' || c.state === 'hover') {
        const dd = Math.hypot(px - c.x, py - c.y);
        const near = dd < TILE * 1.7 || (moving && dd < TILE * 2.2);
        if (near && (c.state === 'hover' || c.hoverDur > 0)) {
          const d = Math.max(1, dd);
          c.vx = (c.x - px) / d; c.vy = (c.y - py) / d;
          c.state = 'scare';
          // 受惊瞬间一圈同色涟漪：让「飞走」有可见的起跳点
          ringPx(c.x, c.y, scareColor(c.kind));
          if (scareCb) scareCb();
        }
      }

      if (c.state === 'fly') {
        // 进场：朝目标点飞，速度略快；进入屏幕腹地后转悬停（蝙蝠/火星直接转离场）
        const sp = c.speed * 1.6;
        c.x += c.vx * sp * s;
        c.y += c.vy * sp * s;
        const inner = c.x > TILE && c.x < S - TILE && c.y > TILE && c.y < S - TILE;
        if (inner) {
          if (c.hoverDur > 0) { c.state = 'hover'; c.hoverT = 0; }
          else { const [dx2, dy2] = pickEdgeTarget(c.x, c.y); c.vx = dx2; c.vy = dy2; c.state = 'leave'; }
        }
        if (c.x < -TILE * 1.5 || c.x > S + TILE * 1.5 || c.y < -TILE * 1.5 || c.y > S + TILE * 1.5) {
          ambient.critters.splice(i, 1); continue;
        }
      } else if (c.state === 'hover') {
        // 悬停漫游：缓慢蛇形转向，像生物在原地打转
        c.hoverT += dt;
        const baseA = Math.atan2(c.vy, c.vx);
        const wa = baseA + Math.sin(simT / 800 + c.seed) * 0.02 * (dt / 16.7);
        const sp = c.speed * (0.6 + 0.4 * Math.sin(simT / 1300 + c.seed * 2));
        c.vx = Math.cos(wa); c.vy = Math.sin(wa);
        c.x += c.vx * sp * s;
        c.y += c.vy * sp * s;
        // 停留时间到或漂到屏幕边缘 → 离场
        if (c.hoverT > c.hoverDur * 1000 || c.x < TILE * 0.4 || c.x > S - TILE * 0.4 || c.y < TILE * 0.4 || c.y > S - TILE * 0.4) {
          const [dx2, dy2] = pickEdgeTarget(c.x, c.y);
          c.vx = dx2; c.vy = dy2; c.state = 'leave';
        }
      } else { // leave / scare：径直飞出屏幕，scare 会加速，像被惊到
        const boost = c.state === 'scare' ? Math.min(2.6, 1 + (simT - (c.scareAt || simT)) / 600) : 1;
        if (c.state === 'scare' && !c.scareAt) c.scareAt = simT;
        const sp = c.speed * (c.kind === 'bat' ? 1.4 : 2.2) * boost;
        c.x += c.vx * sp * s;
        c.y += c.vy * sp * s;
        if (c.x < -TILE * 1.5 || c.x > S + TILE * 1.5 || c.y < -TILE * 1.5 || c.y > S + TILE * 1.5) {
          ambient.critters.splice(i, 1); continue;
        }
      }

      // ---- 绘制 ----
      ctx.save();
      if (c.kind === 'firefly') {
        // 呼吸明灭的光点 + 一小段尾迹
        c.glowT += dt / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(c.glowT * 2.1 + c.seed);
        const a = 0.35 + pulse * 0.65;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, TILE * 0.34);
        g.addColorStop(0, 'rgba(255,238,150,' + (a * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(255,238,150,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x - TILE * 0.34, c.y - TILE * 0.34, TILE * 0.68, TILE * 0.68);
        const tr = 0.55 + 0.45 * Math.sin(c.glowT * 2.1 + c.seed);
        ctx.fillStyle = 'rgba(255,246,190,' + (a * tr).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(c.x, c.y, Math.max(1, TILE * 0.035), 0, Math.PI * 2);
        ctx.fill();
        const bx = c.x - c.vx * TILE * 0.22, by = c.y - c.vy * TILE * 0.22;
        ctx.fillStyle = 'rgba(255,240,160,' + (a * 0.35).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(0.5, TILE * 0.02), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (c.kind === 'moth') {
        // 雾层飞蛾：两只扑动的小翅膀，淡紫，头朝移动方向
        const fl = Math.sin(c.wing * Math.PI);
        const wingA = 0.55 + fl * 0.45;
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.atan2(c.vy, c.vx) + Math.PI / 2);
        ctx.fillStyle = 'rgba(196,176,255,' + (0.62 + fl * 0.2).toFixed(2) + ')';
        for (const sgn of [-1, 1]) {
          ctx.save();
          ctx.scale(sgn, 1);
          ctx.rotate(wingA * 0.9);
          ctx.beginPath();
          ctx.ellipse(TILE * 0.13, -TILE * 0.02, TILE * 0.14, TILE * 0.068, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = 'rgba(222,210,255,0.9)';
        ctx.beginPath();
        ctx.ellipse(0, 0, TILE * 0.038, TILE * 0.062, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (c.kind === 'bat') {
        // Boss 层蝙蝠：灰紫剪影快速掠过，红眼两点（比地板亮半档才看得见）
        const fl = Math.sin(c.wing * Math.PI * 2);
        const ws = TILE * 0.19;
        ctx.translate(c.x, c.y);
        ctx.rotate(Math.atan2(c.vy, c.vx) + Math.PI / 2);
        ctx.fillStyle = 'rgba(74,62,98,0.95)';
        ctx.beginPath();
        ctx.moveTo(0, TILE * 0.06);
        ctx.quadraticCurveTo(-ws * 0.5, -TILE * 0.02 - fl * ws * 0.8, -ws, fl * ws * 0.55);
        ctx.quadraticCurveTo(-ws * 0.4, TILE * 0.02, 0, TILE * 0.02);
        ctx.quadraticCurveTo(ws * 0.4, TILE * 0.02, ws, fl * ws * 0.55);
        ctx.quadraticCurveTo(ws * 0.5, -TILE * 0.02 - fl * ws * 0.8, 0, TILE * 0.06);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,110,80,0.6)';
        ctx.beginPath();
        ctx.arc(-TILE * 0.026, -TILE * 0.006, TILE * 0.016, 0, Math.PI * 2);
        ctx.arc(TILE * 0.026, -TILE * 0.006, TILE * 0.016, 0, Math.PI * 2);
        ctx.fill();
      } else if (c.kind === 'wisp') {
        // 锁芯尘埃幽灵：一粒淡青光晕裹着微尘，绕着自己的中心逆时针慢转
        c.glowT += dt / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(c.glowT * 1.4 + c.seed);
        const ox = Math.cos(c.spin * Math.PI * 2) * TILE * 0.1;
        const oy = Math.sin(c.spin * Math.PI * 2) * TILE * 0.1;
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(c.x + ox, c.y + oy, 0, c.x + ox, c.y + oy, TILE * 0.4);
        g.addColorStop(0, 'rgba(178,232,255,' + (0.3 + pulse * 0.3).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(178,232,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x - TILE * 0.4, c.y - TILE * 0.4, TILE * 0.8, TILE * 0.8);
        // 两粒绕转的微尘，一明一暗
        for (let k = 0; k < 2; k++) {
          const ph = c.spin * Math.PI * 2 + k * Math.PI;
          const dx = Math.cos(ph) * TILE * 0.12, dy = Math.sin(ph) * TILE * 0.12;
          ctx.fillStyle = 'rgba(214,244,255,' + (0.4 + pulse * 0.4).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(c.x + dx, c.y + dy, Math.max(0.8, TILE * 0.02), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      } else { // ember：压低频的真火星，偶尔一颗，微升微灭
        const age = simT - c.born;
        const p = Math.min(1, age / 5000);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,180,90,' + (0.42 * (1 - p)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 1.6 + TILE * 0.012, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
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
      const cx = r.px != null ? r.px : r.tx * TILE + TILE / 2;
      const cy = r.py != null ? r.py : r.ty * TILE + TILE / 2;
      ctx.arc(cx, cy, (r.px != null ? 2 : 6) + ease * r.maxR, 0, Math.PI * 2);
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

  // ---------- 拖动选路：路线预览 + 方向圆盘 ----------
  // 路线预览：touch.js 在拖动时把「候选路线集合 + 当前高亮」推进来，逐帧画
  let routePreview = null;
  function setRoutePreview(preview) {
    routePreview = preview; // null = 收起；{ pad, cx, cy, dirs, hot, cells, hotIdx, radius }
    dirty = true;
  }
  function drawRoutePreview() {
    if (!routePreview) return;
    const now = performance.now();
    // 1) 候选路线点串：高亮那条最亮，其余候选暗铺
    const cells = routePreview.cells || [];
    const hotIdx = routePreview.hotIdx;
    for (let gi = 0; gi < cells.length; gi++) {
      const grp = cells[gi];
      const isHot = gi === hotIdx;
      const pts = grp.pts || [];
      const t0 = grp.start || 0;
      const phase = ((now - t0) % 1000) / 1000;
      for (let i = 0; i < pts.length; i++) {
        const k = phase + i * 0.14;
        const tw = k - Math.floor(k);
        const a = isHot ? 0.32 + 0.55 * (1 - tw) : 0.16;
        const r = isHot ? TILE * (0.07 + 0.055 * (1 - tw)) : TILE * 0.05;
        ctx.fillStyle = isHot ? `rgba(159,216,255,${a.toFixed(2)})` : 'rgba(159,216,255,0.16)';
        ctx.beginPath();
        ctx.arc(pts[i][0] * TILE + TILE / 2, pts[i][1] * TILE + TILE / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 2) 方向圆盘：以手指落点为圆心，四个可用方向画扇面 + 箭头
    if (!routePreview.pad) return;
    const cx = routePreview.cx;
    const cy = routePreview.cy;
    const R = routePreview.radius || TILE * 1.5;
    const ANG = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 };
    ctx.save();
    // 底盘
    ctx.fillStyle = 'rgba(8,11,18,0.62)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(159,216,255,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    // 中心：当前锁定的目标格
    ctx.fillStyle = 'rgba(232,196,106,0.22)';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232,196,106,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, TILE * 0.2, 0, Math.PI * 2);
    ctx.stroke();
    // 四个方向的可用扇面 + 箭头；选中的方向整块提亮
    for (const name of ['up', 'down', 'left', 'right']) {
      if (!routePreview.dirs || !routePreview.dirs[name]) continue;
      const active = routePreview.hot === name;
      const a0 = ANG[name] - Math.PI / 4;
      const a1 = ANG[name] + Math.PI / 4;
      const r0 = TILE * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0);
      ctx.arc(cx, cy, R * 0.92, a0, a1);
      ctx.lineTo(cx + Math.cos(a1) * r0, cy + Math.sin(a1) * r0);
      ctx.arc(cx, cy, r0, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = active ? 'rgba(159,216,255,0.35)' : 'rgba(159,216,255,0.1)';
      ctx.fill();
      if (active) {
        ctx.strokeStyle = 'rgba(200,232,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const ang = ANG[name];
      const tipR = R * 0.72;
      const bx = cx + Math.cos(ang) * tipR;
      const by = cy + Math.sin(ang) * tipR;
      const s = TILE * (active ? 0.2 : 0.14);
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(ang);
      ctx.fillStyle = active ? 'rgba(214,238,255,0.95)' : 'rgba(159,216,255,0.42)';
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.6, s * 0.7);
      ctx.lineTo(-s * 0.6, -s * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
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
    // 第 6 层是中点王座，第 12 层才是真正的塔顶：两处都有天光，
    // 塔顶那束收短一点，只落在公主与石板上，不越过衡所在的门闩行。
    const isMid = lastFloor === 5;
    const isTop = lastFloor === 11;
    if (!isMid && !isTop) return;
    if (!beamCanvas) buildBeam();
    if (!beamCanvas) return;
    const w = TILE * 4;
    const x = TILE * 5 - w / 2 + TILE / 2;
    const h = isTop ? TILE * 3.6 : TILE * 5;
    const pulse = 0.82 + Math.sin(simT / 5200) * 0.18;
    ctx.globalAlpha = (isTop ? 0.78 : 1) * pulse;
    ctx.drawImage(beamCanvas, x, -TILE * 0.2, w, h);
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
        const m = D.monsters[ch];
        if (!m || m.ghost) continue;
        const pred = window.Engine.predict(ch);
        if (!pred) continue;
        if (pred.damage == null) {
          // 破不了防：窥探之镜也必须说话——显示「还差几点攻击」，别让格子空着
          const gap = m.def + 1 - state.atk;
          drawBadge(x * TILE, y * TILE, '攻 +' + gap, '#ff6b6b');
          continue;
        }
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
    dirty = false;
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
        // 石头被带走后，原地只剩一座空石座（不改地图也能表现状态）
        const hp = state.flags && state.flags.heartAt;
        if (ch === '.' && state.flags && state.flags.heart === 'taken' && hp && x === hp[0] && y === hp[1]) {
          groundShadow(px, py, TILE * 0.3, 0.35);
          ctx.fillStyle = 'rgba(48,42,52,0.95)';
          roundRect(px + TILE * 0.2, py + TILE * 0.52, TILE * 0.6, TILE * 0.3, TILE * 0.05);
          ctx.fill();
          ctx.strokeStyle = 'rgba(186,166,190,0.3)';
          ctx.lineWidth = 1;
          roundRect(px + TILE * 0.2, py + TILE * 0.52, TILE * 0.6, TILE * 0.3, TILE * 0.05);
          ctx.stroke();
          ctx.fillStyle = 'rgba(206,186,210,0.22)';
          ctx.fillRect(px + TILE * 0.22, py + TILE * 0.53, TILE * 0.56, 1.4);
          // 中间的空槽
          ctx.fillStyle = 'rgba(9,7,11,0.96)';
          ctx.beginPath();
          ctx.ellipse(px + TILE / 2, py + TILE * 0.65, TILE * 0.15, TILE * 0.065, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,140,165,0.16)';
          ctx.beginPath();
          ctx.ellipse(px + TILE / 2, py + TILE * 0.65, TILE * 0.15, TILE * 0.065, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (ch === 'y' || ch === 'r') drawDoor(ch, px, py);
        else if (ch === 'u' || ch === 'n') drawStairs(ch, px, py);
        else if (ch === 'M') drawMerchant(px, py);
        else if (ch === 'T') {
          groundShadow(px, py, TILE * 0.26, 0.35);
          glow('rgba(255,240,150,0.5)', TILE * 0.52);
          drawEmoji('👸', px, py, 0.64);
          noGlow();
        } else if (ch === 'X') {
          // 祭坛：石台 + 三盏未燃尽的灯
          groundShadow(px, py, TILE * 0.3, 0.4);
          ctx.fillStyle = 'rgba(20,16,12,0.9)';
          roundRect(px + TILE * 0.2, py + TILE * 0.46, TILE * 0.6, TILE * 0.4, TILE * 0.06);
          ctx.fill();
          ctx.fillStyle = 'rgba(232,196,106,0.16)';
          ctx.fillRect(px + TILE * 0.22, py + TILE * 0.46, TILE * 0.56, 2);
          const gl = 0.55 + Math.sin(simT / 620) * 0.45;
          glow('rgba(255,210,130,' + (0.25 + gl * 0.25).toFixed(2) + ')', TILE * 0.4);
          for (let k = 0; k < 3; k++) {
            const cx = px + TILE * (0.34 + k * 0.16);
            const cy = py + TILE * 0.36 + Math.sin(simT / 380 + k) * TILE * 0.02;
            ctx.fillStyle = 'rgba(255,225,160,' + (0.35 + gl * 0.4).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(cx, cy, TILE * 0.05, 0, Math.PI * 2);
            ctx.fill();
          }
          noGlow();
        } else if (ch === '?') {
          // 路遇：一盏挂在钉子上的灯，下面站着一个看不清的人
          groundShadow(px, py, TILE * 0.26, 0.35);
          const pg = 0.5 + Math.sin(simT / 900) * 0.5;
          glow('rgba(255,214,150,' + (0.16 + pg * 0.14).toFixed(2) + ')', TILE * 0.5);
          // 灯
          ctx.fillStyle = 'rgba(255,226,168,' + (0.55 + pg * 0.4).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(px + TILE * 0.62, py + TILE * 0.3, TILE * 0.055, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,226,168,0.22)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + TILE * 0.62, py + TILE * 0.3);
          ctx.lineTo(px + TILE * 0.62, py + TILE * 0.14);
          ctx.stroke();
          // 人影
          ctx.fillStyle = 'rgba(16,14,20,0.82)';
          ctx.beginPath();
          ctx.moveTo(px + TILE * 0.34, py + TILE * 0.8);
          ctx.quadraticCurveTo(px + TILE * 0.34, py + TILE * 0.42, px + TILE * 0.48, py + TILE * 0.42);
          ctx.quadraticCurveTo(px + TILE * 0.62, py + TILE * 0.42, px + TILE * 0.62, py + TILE * 0.8);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = 'rgba(255,226,168,' + (0.35 + pg * 0.35).toFixed(2) + ')';
          ctx.font = Math.round(TILE * 0.34) + 'px Georgia, serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', px + TILE * 0.48, py + TILE * 0.3);
          noGlow();
        } else if (ch === 'K') {
          // 塔心石：石台 + 三盏灯 + 一颗会跳的心
          const beat = Math.pow(Math.max(0, Math.sin(simT / 700)), 3);
          const g2 = ctx.createRadialGradient(px + TILE / 2, py + TILE * 0.5, 1, px + TILE / 2, py + TILE * 0.5, TILE * 0.62);
          g2.addColorStop(0, 'rgba(255,110,140,' + (0.26 + beat * 0.4).toFixed(3) + ')');
          g2.addColorStop(1, 'rgba(255,110,140,0)');
          ctx.fillStyle = g2;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE * 0.5, TILE * 0.62, 0, Math.PI * 2);
          ctx.fill();
          // 石台
          ctx.fillStyle = 'rgba(26,22,26,0.94)';
          roundRect(px + TILE * 0.18, py + TILE * 0.58, TILE * 0.64, TILE * 0.26, TILE * 0.05);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,150,175,0.22)';
          ctx.lineWidth = 1;
          roundRect(px + TILE * 0.18, py + TILE * 0.58, TILE * 0.64, TILE * 0.26, TILE * 0.05);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,150,175,0.3)';
          ctx.fillRect(px + TILE * 0.2, py + TILE * 0.58, TILE * 0.6, 1.5);
          // 三盏灯
          for (let k = 0; k < 3; k++) {
            const a = -Math.PI / 2 + (k - 1) * 0.85;
            const lx = px + TILE / 2 + Math.cos(a) * TILE * 0.3;
            const ly = py + TILE * 0.52 + Math.sin(a) * TILE * 0.22;
            const fl = 0.4 + Math.abs(Math.sin(simT / 300 + k * 1.7)) * 0.5;
            ctx.fillStyle = 'rgba(255,228,170,' + fl.toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(lx, ly, TILE * 0.045, 0, Math.PI * 2);
            ctx.fill();
          }
          // 心：一颗嵌在暗石里的红核，随节拍胀缩
          ctx.fillStyle = 'rgba(10,7,11,0.92)';
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE * 0.54, TILE * 0.29, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,140,165,' + (0.18 + beat * 0.3).toFixed(2) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE * 0.54, TILE * 0.29, 0, Math.PI * 2);
          ctx.stroke();
          const hs = TILE * (0.225 + beat * 0.055);
          ctx.save();
          ctx.translate(px + TILE / 2, py + TILE * 0.56);
          ctx.fillStyle = 'rgba(255,120,150,' + (0.72 + beat * 0.28).toFixed(2) + ')';
          ctx.beginPath();
          ctx.moveTo(0, hs * 0.9);
          ctx.bezierCurveTo(-hs * 1.5, -hs * 0.2, -hs * 0.6, -hs * 1.2, 0, -hs * 0.42);
          ctx.bezierCurveTo(hs * 0.6, -hs * 1.2, hs * 1.5, -hs * 0.2, 0, hs * 0.9);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,225,235,' + (0.35 + beat * 0.4).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(-hs * 0.42, -hs * 0.42, hs * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (ch === 'J') {
          groundShadow(px, py, TILE * 0.22, 0.3);
          glow('rgba(200,160,255,0.42)', TILE * 0.42);
          drawEmoji('📜', px, py + Math.sin(simT / 500) * TILE * 0.03, 0.56);
          noGlow();
        } else if (ch === '!') {
          // 塔的碑文：立在路边的矮石碑，字面泛着极轻的光，读过之后光熄
          const read = state.flags && state.flags.steleRead;
          groundShadow(px, py, TILE * 0.3, 0.42);
          // 碑身
          ctx.fillStyle = 'rgba(40, 46, 58, 0.96)';
          roundRect(px + TILE * 0.24, py + TILE * 0.3, TILE * 0.52, TILE * 0.56, TILE * 0.07);
          ctx.fill();
          ctx.strokeStyle = 'rgba(159, 216, 255, ' + (read ? 0.14 : 0.32) + ')';
          ctx.lineWidth = 1;
          roundRect(px + TILE * 0.24, py + TILE * 0.3, TILE * 0.52, TILE * 0.56, TILE * 0.07);
          ctx.stroke();
          // 碑顶
          ctx.fillStyle = 'rgba(52, 60, 74, 0.96)';
          roundRect(px + TILE * 0.2, py + TILE * 0.24, TILE * 0.6, TILE * 0.12, TILE * 0.05);
          ctx.fill();
          // 刻痕：三行短横，未读时微微发亮
          ctx.fillStyle = 'rgba(159, 216, 255, ' + (read ? 0.16 : 0.3 + Math.sin(simT / 700) * 0.1) + ')';
          for (let ln = 0; ln < 3; ln++) {
            const lw = TILE * (ln === 1 ? 0.3 : 0.36);
            ctx.fillRect(px + TILE * 0.32, py + TILE * (0.42 + ln * 0.11), lw, TILE * 0.032);
          }
          if (!read) glow('rgba(159, 216, 255, 0.16)', TILE * 0.5);
        } else if (D.monsters[ch]) drawMonster(ch, px, py, simT);
        else if (D.items[ch] || ch === '$') drawItem(ch, px, py, simT);
      }
    }

    // 层阶之钥往前开一层留下的封印：物件已被拿走，原地只余一道锁印
    const seals = state.flags && state.flags.gateSeals;
    if (seals && seals.length) {
      for (const q of seals) {
        if (q.floor !== state.floor) continue;
        const px = q.x * TILE;
        const py = q.y * TILE;
        groundShadow(px, py, TILE * 0.26, 0.42);
        ctx.save();
        ctx.strokeStyle = 'rgba(201,74,82,0.55)';
        ctx.lineWidth = Math.max(1, TILE * 0.035);
        ctx.setLineDash([TILE * 0.09, TILE * 0.07]);
        ctx.beginPath();
        ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.31, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        drawEmoji('🔒', px, py, 0.42);
      }
    }

    updateAmbient(lastDt);
    drawAmbientOverlay();
    drawTargetMarker();
    drawRoutePreview();

    // 玩家（disp._moving 给小生物的受惊判定用：目标格与显示格没重合 = 正在走）
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
    disp._moving = Math.abs(state.x - disp.x) > 0.04 || Math.abs(state.y - disp.y) > 0.04;
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

    // 高光星芒：十字光束（竖光柱冲天 + 横光带扫屏 + 收束光斑），1.15 秒
    // 金色 = 拾取遗物；红色 = 章末 Boss 倒下
    if (relicBeam) {
      const rp = (now - relicBeam.start) / 1150;
      if (rp >= 1) {
        relicBeam = null;
      } else {
        const red = !!relicBeam.red;
        const bx = relicBeam.tx * TILE + TILE / 2;
        const by = relicBeam.ty * TILE + TILE / 2;
        const H = TILE * SIZE;
        const fadeIn = Math.min(1, rp / 0.12);
        const fadeOut = rp < 0.55 ? 1 : 1 - (rp - 0.55) / 0.45;
        const a = fadeIn * fadeOut;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // 竖光柱：中段最亮、上下端羽化，顶部直接冲出画面
        const vw = TILE * (0.34 + 0.5 * Math.sin(Math.min(1, rp * 1.25) * Math.PI));
        const gv = ctx.createLinearGradient(0, 0, 0, by);
        if (red) {
          gv.addColorStop(0, 'rgba(255,200,180,0)');
          gv.addColorStop(0.55, `rgba(255,150,125,${(0.5 * a).toFixed(3)})`);
          gv.addColorStop(1, `rgba(255,215,195,${(0.9 * a).toFixed(3)})`);
        } else {
          gv.addColorStop(0, 'rgba(255,240,200,0)');
          gv.addColorStop(0.55, `rgba(255,236,180,${(0.5 * a).toFixed(3)})`);
          gv.addColorStop(1, `rgba(255,246,214,${(0.9 * a).toFixed(3)})`);
        }
        ctx.fillStyle = gv;
        ctx.fillRect(bx - vw / 2, -TILE, vw, by + TILE);
        // 横光带：沿拾取点高度向两侧展开
        const hw = TILE * SIZE * Math.min(1, rp * 2.1);
        const hh = TILE * (0.2 + 0.32 * Math.sin(Math.min(1, rp * 1.2) * Math.PI));
        const gh = ctx.createRadialGradient(bx, by, 1, bx, by, Math.max(1, hw / 2));
        if (red) {
          gh.addColorStop(0, `rgba(255,205,185,${(0.85 * a).toFixed(3)})`);
          gh.addColorStop(0.5, `rgba(232,110,95,${(0.34 * a).toFixed(3)})`);
          gh.addColorStop(1, 'rgba(201,74,82,0)');
        } else {
          gh.addColorStop(0, `rgba(255,244,210,${(0.85 * a).toFixed(3)})`);
          gh.addColorStop(0.5, `rgba(255,220,140,${(0.34 * a).toFixed(3)})`);
          gh.addColorStop(1, 'rgba(255,210,120,0)');
        }
        ctx.fillStyle = gh;
        ctx.fillRect(bx - hw / 2, by - hh / 2, hw, hh);
        ctx.restore();
        // 收束光斑：拾取点上一颗先胀后缩的亮核
        const coreT = Math.sin(rp * Math.PI);
        const coreR = TILE * (0.28 + coreT * 0.62);
        const gc = ctx.createRadialGradient(bx, by, 1, bx, by, coreR);
        if (red) {
          gc.addColorStop(0, `rgba(255,235,220,${(0.95 * a).toFixed(3)})`);
          gc.addColorStop(0.6, `rgba(255,150,130,${(0.5 * a).toFixed(3)})`);
          gc.addColorStop(1, 'rgba(201,74,82,0)');
        } else {
          gc.addColorStop(0, `rgba(255,250,230,${(0.95 * a).toFixed(3)})`);
          gc.addColorStop(0.6, `rgba(255,224,150,${(0.5 * a).toFixed(3)})`);
          gc.addColorStop(1, 'rgba(255,210,120,0)');
        }
        ctx.fillStyle = gc;
        ctx.beginPath();
        ctx.arc(bx, by, coreR, 0, Math.PI * 2);
        ctx.fill();
      }
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
    onScare(fn) { scareCb = typeof fn === 'function' ? fn : null; },
    init, layout, draw, snapshot,
    addFloat, shake, fade, freeze, pulse, flashTile, ring, ringPx, burst, relicBeamFx,
    setAmbient, setTarget, setRoutePreview,
    needsDraw: () => dirty,
    getTile: () => TILE,
    __debugRoute: () => routePreview,
    // 调试/测试：强制生成一只指定种类的小生物并放慢出生节奏
    __spawnCritter(kind) {
      if (kind === 'slow') { ambient.spawnAcc = -99999; return 'spawn slowed'; }
      return spawnCritter(kind);
    },
    __critters: () => ambient.critters.map((c) => ({ kind: c.kind, state: c.state, x: Math.round(c.x), y: Math.round(c.y) })),
    __rings: () => rings.map((r) => ({ px: r.px == null ? null : Math.round(r.px), py: r.py == null ? null : Math.round(r.py), color: r.color })),
    // 调试/测试：强制场上小生物立刻受惊（验证涟漪 + 音效钩子）
    __scareAll() {
      let n = 0;
      for (const c of ambient.critters) {
        if (c.state === 'scare') continue;
        c.state = 'scare';
        c.scareBoost = 1.8;
        ringPx(c.x, c.y, scareColor(c.kind));
        if (scareCb) scareCb();
        n++;
      }
      return n;
    },
    // 调试/截图：清场后把三只小生物固定摆在画面中部（悬停态），便于确定性验证
    __placeCritters() {
      ambient.critters.length = 0;
      ambient.spawnAcc = -99999;
      const S = TILE * SIZE;
      const mk = (kind, fx, fy) => {
        const c = {
          kind, x: S * fx, y: S * fy,
          vx: 0.7, vy: -0.3,
          born: simT, seed: 42, state: 'hover', hoverT: 0,
          hoverDur: 999, wing: 1.2, glowT: 0.8, speed: kind === 'bat' ? 150 : kind === 'moth' ? 40 : 24,
        };
        ambient.critters.push(c);
      };
      mk('firefly', 0.3, 0.3);
      mk('moth', 0.62, 0.42);
      mk('bat', 0.42, 0.68);
      return 'placed 3';
    },
  };
})();
