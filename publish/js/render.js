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
  let fadeUntil = 0, fadeDur = 260;
  let pulseStart = -9999;
  // 遗物拾取高光：一道从拾取点冲天的十字星芒（竖轴冲出画面顶、横轴扫过全屏）
  let relicBeam = null;

  const disp = { x: 1, y: 1 };
  let lastFloor = -1;
  let face = 1;
  // 图标模式（图鉴 / 速查卡 / 战斗头像）：画布就是整格，Boss 的「左上角名字小签」在这里
  // 只有 8px 且与卡片上的名字重复 ⇒ 一团糊，索性不画。
  let iconMode = false;

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

  let lastBox = { w: 0, h: 0 };
  function layout(container) {
    if (!canvas) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    // 尺寸只由容器决定。原先是 Math.max(240, min(w,h))——那个 240 下限在矮容器里会把画布
    // 撑出容器（手机横屏实测 stage 只有 110 高，画布仍做 231，直接压住顶栏和日志区）。
    // 下限本来是为了防「容器还没定型时算出 0 尺寸」，改成提前返回更准：保留上一次的尺寸。
    if (w < 60 || h < 60) return;
    lastBox = { w: w, h: h };
    const size = Math.min(w, h);
    const px = Math.max(1, Math.floor(size / SIZE));
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

  // 布局自愈：容器尺寸变了但没收到 resize / ResizeObserver 时（实测 320×568 下首帧按
  // 未定型的容器算出 242，之后 stage 长到 300 却一直不重排，棋盘白白小一圈），
  // 由主循环隔几帧喊一次。尺寸没变时只读两个数、不做任何绘制，代价可以忽略。
  function ensureLayout(container) {
    if (!canvas || !container) return false;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === lastBox.w && h === lastBox.h) return false;
    layout(container);
    return true;
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
  function fade(ms) { fadeDur = ms || 260; fadeUntil = performance.now() + fadeDur; }
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
  // 2026-11-28：末尾 9 位是三座齿塔（13–21）。齿塔在主塔脚下，光比主塔入口更浅，
  // 不参与「越爬越深」那条单调线——它们是同一座塔的三枚齿，不是主塔的楼层。
  const FLOOR_MOOD = [0.13, 0.16, 0.19, 0.22, 0.25, 0.28, 0.31, 0.34, 0.36, 0.38, 0.40, 0.42, 0.44,
    0.15, 0.17, 0.19, 0.16, 0.18, 0.20, 0.17, 0.19, 0.21];
  const WALL_MAT = ['brick', 'brick', 'stone', 'wet', 'stone', 'charred', 'wet', 'stone', 'wet', 'stone', 'charred', 'stone', 'wet',
    'brick', 'wet', 'brick', 'stone', 'brick', 'stone', 'wet', 'stone', 'charred'];
  // 每层地砖底色：锁梁六层各有自己的温度
  const FLOOR_TINT = [
    null, null, null, ['#12101c', '#0f0d18'], null, ['#1a1016', '#160e13'],
    ['#101a22', '#0d161d'], ['#1a1712', '#161310'], ['#1b1510', '#17110d'],
    ['#191a20', '#15161b'], ['#15131a', '#111016'], ['#1c1014', '#170d10'], ['#0d1420', '#0a111a'],
    // 齿塔：锈 / 灰 / 钟，各一层温度
    ['#1a1510', '#16120e'], ['#1a1712', '#161310'], ['#1b1410', '#17100c'],
    ['#1a1816', '#161412'], ['#191715', '#151311'], ['#1b1815', '#171410'],
    ['#12161c', '#0f1218'], ['#141820', '#111519'], ['#161a22', '#13161d'],
  ];

  // 塔皮肤（2026-11-28 主题轮）：塔对象上的 paint 决定这一层的墙 / 地 / 火光 / 地纹。
  // 主塔没有 paint，继续走上面那三张按层的表（四章各有温度）；
  // 齿塔三座此前只有布局不同、材质是同一套石灰，远远看仍是同一座塔。
  function paintOf(floor) {
    const tw = D.towerOf ? D.towerOf(floor) : null;
    return (tw && tw.paint) || null;
  }

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
    const paint = paintOf(lastFloor);
    const tint = (paint && paint.floor) || FLOOR_TINT[lastFloor];
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
    const paint = paintOf(lastFloor);
    const mat = (paint && paint.wall) || WALL_MAT[lastFloor] || 'stone';
    const plates = mat === 'iron';           // 铁板墙：不画砖缝，画拼板与铆钉
    const h = hash(x, y);
    let face = C.stone, edge = '#1b2130', deep = C.stone2;
    if (mat === 'brick') { face = '#2f3b4d'; edge = '#1d2634'; deep = '#26313f'; }
    else if (mat === 'wet') { face = '#232a38'; edge = '#141a24'; deep = '#1a2029'; }
    else if (mat === 'charred') { face = '#241d1e'; edge = '#120e10'; deep = '#191314'; }
    // 齿塔三套材质：锈=铆铁板、灰=焦砖、钟=磨光石
    else if (mat === 'iron') { face = '#3c332c'; edge = '#171310'; deep = '#2a231d'; }
    else if (mat === 'soot') { face = '#2c2831'; edge = '#15131a'; deep = '#221f27'; }
    else if (mat === 'cut') { face = '#3b4653'; edge = '#1a2029'; deep = '#2b323d'; }

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

    // 砖缝（铁板墙走拼板，不画砖缝）
    if (!plates) {
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
    }

    // 上缘高光
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(px + 2, py + 2, TILE - 4, 1);

    // 材质细节（齿塔三套）：一张墙就能读出「这是哪座塔」
    if (mat === 'iron') {
      // 竖拼缝 + 四颗铆钉 + 顺着缝往下淌的锈迹
      ctx.strokeStyle = 'rgba(0,0,0,0.46)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + TILE * 0.5, py + 2);
      ctx.lineTo(px + TILE * 0.5, py + TILE - 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(16, 12, 9, 0.8)';
      [[0.2, 0.18], [0.8, 0.18], [0.2, 0.82], [0.8, 0.82]].forEach(([rx, ry]) => {
        ctx.beginPath();
        ctx.arc(px + TILE * rx, py + TILE * ry, Math.max(1, TILE * 0.035), 0, Math.PI * 2);
        ctx.fill();
      });
      if (h % 3 === 0) {
        const rg = ctx.createLinearGradient(px, py, px + TILE * 0.6, py + TILE);
        rg.addColorStop(0, 'rgba(196, 112, 52, 0.16)');
        rg.addColorStop(1, 'rgba(196, 112, 52, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      }
    } else if (mat === 'soot') {
      // 焦砖：缝里没熄的一点火，墙面上压一层冷灰
      ctx.fillStyle = 'rgba(150, 140, 190, 0.05)';
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE * 0.34);
      if (h % 5 === 0) {
        ctx.fillStyle = 'rgba(255, 96, 48, 0.12)';
        ctx.fillRect(px + TILE * 0.2, py + TILE * 0.64, TILE * 0.36, 1.5);
      }
    } else if (mat === 'cut') {
      // 磨光石：一道冷色亮边，缝比石头细
      ctx.fillStyle = 'rgba(190, 225, 255, 0.085)';
      ctx.fillRect(px + 2, py + 2, TILE - 4, 1.5);
      ctx.fillStyle = 'rgba(150, 200, 235, 0.04)';
      ctx.fillRect(px + 2, py + 2, TILE - 4, TILE * 0.22);
    }

    // 裂纹：焦砖/焦墙更多
    const crackChance = mat === 'charred' || mat === 'soot' ? 0.55
      : mat === 'wet' ? 0.18 : mat === 'iron' ? 0.1 : mat === 'cut' ? 0.06 : 0.13;
    if ((h % 100) / 100 < crackChance) {
      ctx.strokeStyle = mat === 'charred' || mat === 'soot' ? 'rgba(255,120,60,0.16)' : 'rgba(0,0,0,0.4)';
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
    // 焦砖 / 焦墙：余烬
    if ((mat === 'charred' || mat === 'soot') && h % 13 === 0) {
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

  // ---------- 塔的地纹 ----------
  // 三座齿塔各刻一种「机器」的痕迹，只落在可走的地面上（墙后不画，免得从墙缝里透出来）：
  // 锈=齿环、灰=炉栅、钟=钟面刻度与停住的指针。透明度压得很低（0.05~0.08），
  // 它只负责让三座塔在截图上就能被认出来，不抢怪、道具与数字。
  function drawTowerMotif(map) {
    const paint = paintOf(lastFloor);
    if (!paint || !paint.motif) return;
    const W = TILE * SIZE;
    const cx = W / 2, cy = W / 2;
    const col = paint.motifColor || 'rgba(255,255,255,0.06)';
    ctx.save();
    ctx.beginPath();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] !== '#') ctx.rect(x * TILE, y * TILE, TILE, TILE);
      }
    }
    ctx.clip();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1, TILE * 0.05);

    if (paint.motif === 'gear') {
      const rIn = TILE * 1.5, rOut = TILE * 1.72;
      ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, rOut + TILE * 0.3, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        ctx.save();
        ctx.translate(cx + Math.cos(a) * (rOut + TILE * 0.14), cy + Math.sin(a) * (rOut + TILE * 0.14));
        ctx.rotate(a);
        ctx.fillRect(-TILE * 0.1, -TILE * 0.17, TILE * 0.2, TILE * 0.34);
        ctx.restore();
      }
    } else if (paint.motif === 'grate') {
      for (let i = 0; i < 9; i++) {
        ctx.fillRect(TILE, TILE * (1 + i), TILE * 9, Math.max(1, TILE * 0.05));
      }
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(TILE * (1 + i * 2), TILE, Math.max(1, TILE * 0.04), TILE * 9);
      }
    } else if (paint.motif === 'clock') {
      // 钟面顺着外圈走廊画成一个方盘（这张图的外圈本来就是方的）：
      // 方框压在走道中线上，十二个刻度朝里指——圆盘在方走廊里会被墙吃掉大半，
      // 只剩下四段孤弧，读不出「钟」。
      const r = TILE * 4;                       // 走道中线：中心到边距 4 格
      const half = r;
      ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        const k = half / Math.max(Math.abs(dx), Math.abs(dy));   // 投到方框上
        const px2 = cx + dx * k, py2 = cy + dy * k;
        const long = i % 3 === 0;
        const len = long ? TILE * 0.42 : TILE * 0.22;
        ctx.lineWidth = long ? TILE * 0.085 : TILE * 0.045;
        ctx.beginPath();
        ctx.moveTo(px2, py2);
        ctx.lineTo(cx + dx * (k - len), cy + dy * (k - len));
        ctx.stroke();
      }
      ctx.lineWidth = Math.max(1, TILE * 0.05);
    }
    ctx.restore();
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
    drawTowerMotif(map);
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
    // 2026-11-20：去掉道具格的底色圆盘（用户反馈「很多 buff 道具外有一圈，很丑」）——
    // 原先 tint 实心圆 + shadowBlur 光晕把 emoji 框进一个色圈，剪影世界里像贴纸。
    // 可读性交给接地阴影 + 上下浮动 + 遗物金环（仅遗物保留），够了。
    const isRelic = it && it.type === 'relic';
    drawEmoji(ch === '$' ? '💰' : ch === 'k' ? '🔑' : ch === 'L' ? '🗝️' : it ? it.emoji : '❓', px, py + bob, isRelic ? 0.62 : 0.56);
    if (isRelic) {
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

  // ---------- 小怪剪影库 v2（美术管线介入，2026-11-17）----------
  // 旧版整格 emoji（🦇🦠💀…）与全局 Noir Silhouette 画风严重打架——彩色系统贴纸
  // 贴在暗色剪影世界里，观感廉价。新版按风格圣经 §3（三层结构 + 单焦点）逐只手工造型：
  //   ① 剪影层：近黑形状，远看一整块；② 亮边：kind 族色（兽=琥珀/亡=霜蓝/构=石灰/异=苔绿）
  //   右上 45° 勾边；③ 焦点层：1–2 粒亮瞳或单点发光部件。
  // 形状语言对齐 portraits.js 八角色（圆=亲和/方=稳固/三角=危险），48px 下必须两两可辨。
  // ghost 烛（G）同属此库。未被收录的怪字符走 emoji 兜底（测试注入的怪不炸渲染）。
  const MINION_INK = '#0a0d14';
  const MINION_KIND_COLOR = {
    '兽': ['#ffb06e', 'rgba(255,176,110,'],   // 琥珀
    '亡': ['#8cc8ff', 'rgba(140,200,255,'],   // 霜蓝
    '构': ['#b0b8c8', 'rgba(176,184,200,'],   // 石灰
    '异': ['#96dc96', 'rgba(150,220,150,'],   // 苔绿
    '魂': ['#9fd8ff', 'rgba(159,216,255,'],   // 魂蓝（烛）
  };
  // 后半塔（第 7 层起）的「深色变体」：**同色相、压明度、提饱和**，不是第六族色。
  // 为什么这么做（2026-11-24）：族色是威胁类型编码（兽/亡/构/异/魂），加新色相会把编码搅乱；
  // 但后半塔的怪和前半塔同族同色时，玩家在棋盘上分不出「这只是第 3 层的骷髅，还是第 10 层的」。
  // 只压明度＋脚下一圈双环，就多出一档「这一只更靠后」的读数，族色仍然是那一个色相。
  const MINION_KIND_COLOR_DEEP = {
    '兽': ['#e08a45', 'rgba(224,138,69,'],
    '亡': ['#6fa6d8', 'rgba(111,166,216,'],
    '构': ['#8e97a8', 'rgba(142,151,168,'],
    '异': ['#6fbd78', 'rgba(111,189,120,'],
    '魂': ['#7fb6d8', 'rgba(127,182,216,'],
  };
  // 造型约定：f(ctx, s, light) 以格中心为原点、s=TILE/48 缩放；y 向下为正，
  // 身体大致落在 y∈[-14,12]。每只一个「一眼特征」，禁堆零件。
  // noRim: true 的造型以描边为主（rim 底版会重影），由 drawMinion 跳过亮边层。
  const MINION_ART = {
    A: { c: '兽', f: batShape },          // 蝙蝠：双翼三角
    B: { c: '异', f: slimeShape },        // 史莱姆：半圆水滴
    C: { c: '亡', f: skullShape },        // 骷髅兵：圆颅
    D: { c: '亡', f: zombieShape },       // 僵尸：方肩歪头
    E: { c: '构', f: gargoyleShape },     // 石像鬼：蹲兽方翼
    W: { c: '亡', f: wraithShape },       // 怨灵：波浪下摆
    F: { c: '兽', f: wolfShape },         // 狼人：立耳尖吻
    H: { c: '亡', f: captainShape },      // 骷髅队长：颅+盔缨
    V: { c: '亡', f: vampireShape },      // 吸血鬼：立领披风
    I: { c: '兽', f: houndShape },        // 锈犬：低身猎犬
    R: { c: '亡', f: lanternMonkShape },  // 提灯僧：灯钩僧身
    '1': { c: '构', f: shieldShape },     // 空甲：立盾
    '2': { c: '异', f: wormShape, noRim: true },      // 锁虫：环节弓身
    '3': { c: '魂', f: facelessShape },   // 无面者：垂纱直影
    '4': { c: '亡', f: priestShape },     // 灰烬祭司：尖帽长袍
    '5': { c: '兽', f: rustKingShape },   // 锈王：宽体 + 王冠
    '6': { c: '构', f: wardenShape },     // 守名人：巨碑方身
    G: { c: '魂', f: candleShape },       // 烛：烛台光焰（ghost 不画瞳）
  };
  function batShape(c, s, L) {
    c.beginPath();
    c.moveTo(0, 2);                       // 身体中缝
    c.quadraticCurveTo(-2 * s, -2 * s, -4 * s, -6 * s);
    c.quadraticCurveTo(-11 * s, -9 * s, -15 * s, -4 * s);   // 左翼上缘
    c.quadraticCurveTo(-12 * s, -1 * s, -13 * s, 3 * s);
    c.quadraticCurveTo(-10 * s, 5 * s, -7.5 * s, 2.5 * s);  // 左翼破口
    c.quadraticCurveTo(-5 * s, 6 * s, -2.5 * s, 5 * s);
    c.quadraticCurveTo(0, 7 * s, 2.5 * s, 5 * s);           // 下缘波浪
    c.quadraticCurveTo(5 * s, 6 * s, 7.5 * s, 2.5 * s);
    c.quadraticCurveTo(10 * s, 5 * s, 13 * s, 3 * s);
    c.quadraticCurveTo(12 * s, -1 * s, 15 * s, -4 * s);     // 右翼上缘
    c.quadraticCurveTo(11 * s, -9 * s, 4 * s, -6 * s);
    c.quadraticCurveTo(2 * s, -2 * s, 0, 2);
    c.closePath(); c.fill();
    eyes(c, -2.6, 2.6, -3.4, 1.35, L);
    // 左耳尖（非对称锚点）
    c.strokeStyle = L[1] + '0.7)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-1.5 * s, -6.5 * s); c.lineTo(-3 * s, -10 * s); c.stroke();
  }
  function slimeShape(c, s, L) {
    // 软体：半圆顶 + 两侧滴落 + 底缘三滴（"在流"是它的形状语言，不是装饰）
    blob(c, s, L, 11, 8.5);
    c.beginPath();
    c.moveTo(-9.5 * s, 7.5 * s); c.quadraticCurveTo(-12 * s, 10 * s, -10.5 * s, 12.5 * s);
    c.quadraticCurveTo(-8.6 * s, 11 * s, -8 * s, 8.5 * s); c.closePath(); c.fill();
    c.beginPath();
    c.moveTo(6.5 * s, 8 * s); c.quadraticCurveTo(5.6 * s, 12 * s, 7.6 * s, 12.6 * s);
    c.quadraticCurveTo(9 * s, 10.5 * s, 8.6 * s, 8 * s); c.closePath(); c.fill();
    // 两粒眼 + 一条嘴缝：软体也要有脸，不然只是块石头
    eyes(c, -3.4, 3.4, -1.2, 1.5, L);
    c.strokeStyle = 'rgba(0,0,0,0.7)';
    c.lineWidth = 1.4 * s;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-3 * s, 4.2 * s); c.quadraticCurveTo(0, 6.2 * s, 3 * s, 4.2 * s);
    c.stroke();
  }
  function skullShape(c, s, L) {
    c.beginPath();
    c.arc(0, -2.5 * s, 8 * s, Math.PI * 0.95, Math.PI * 0.05, false);  // 颅顶
    c.quadraticCurveTo(8.6 * s, 2.5 * s, 5 * s, 4 * s);                // 右颊
    c.lineTo(4.2 * s, 8 * s); c.lineTo(1.8 * s, 8 * s); c.lineTo(1.8 * s, 5.5 * s);
    c.lineTo(-1.8 * s, 5.5 * s); c.lineTo(-1.8 * s, 8 * s); c.lineTo(-4.2 * s, 8 * s); // 齿列
    c.lineTo(-5 * s, 4 * s);
    c.quadraticCurveTo(-8.6 * s, 2.5 * s, -8 * s, -2.5 * s);
    c.closePath(); c.fill();
    eyeSocket(c, s, -3.6, -2.5, 2.5, 2.9, L);
    eyeSocket(c, s, 3.6, -2.5, 2.5, 2.9, L);
    noseDot(c, s, L);
  }
  function zombieShape(c, s, L) {
    // 歪头 + 两只前伸的手 + 拖在后面的一条腿（非对称锚点都在左边）
    c.save(); c.rotate(-0.13);
    c.fillRect(-8.5 * s, -3 * s, 17 * s, 13 * s);   // 方肩躯干
    c.restore();
    roundBlob(c, s, -3.4 * s, -9.5 * s, 5.4 * s, 5 * s, -0.13);
    // 双臂前伸（一高一低）：僵尸的招牌姿势，比任何细节都先被读到
    c.save(); c.rotate(0.16);
    c.fillRect(4 * s, -4.2 * s, 11.5 * s, 3.2 * s);
    c.fillRect(5 * s, 0.4 * s, 10.5 * s, 3 * s);
    c.restore();
    // 前腿直立、后腿拖成一截破布
    c.fillRect(-3.5 * s, 9 * s, 4 * s, 5.5 * s);
    c.beginPath();
    c.moveTo(-7.5 * s, 9.5 * s); c.lineTo(-11 * s, 13.5 * s);
    c.lineTo(-8.5 * s, 14.2 * s); c.lineTo(-4.5 * s, 10.5 * s); c.closePath(); c.fill();
    // 眼窝：长在歪头（头心 -3.4,-9.5）上，挖洞再点光
    eyeSocket(c, s, -5.2, -10, 1.4, 1.6, L);
    eyeSocket(c, s, -1.4, -9.2, 1.4, 1.6, L);
  }
  function gargoyleShape(c, s, L) {
    // 蹲姿：宽方底座 + 小头 + 折角翼
    c.fillRect(-11 * s, 2 * s, 22 * s, 9 * s);
    c.beginPath();
    c.moveTo(-11 * s, 3 * s);
    c.lineTo(-15 * s, -7 * s); c.lineTo(-7 * s, -2 * s);   // 左折翼
    c.lineTo(0, -6 * s);
    c.lineTo(7 * s, -2 * s);
    c.lineTo(15 * s, -7 * s); c.lineTo(11 * s, 3 * s);     // 右折翼
    c.closePath(); c.fill();
    roundBlob(c, s, 0, -8.5 * s, 4.6 * s, 3.6 * s, 0);
    // 单角
    c.beginPath(); c.moveTo(0, -12 * s); c.lineTo(2.2 * s, -16 * s); c.lineTo(3.4 * s, -11.5 * s); c.closePath(); c.fill();
    eyes(c, -1.7, 1.7, -9, 1.1, L);
  }
  function wraithShape(c, s, L) {
    c.beginPath();
    c.moveTo(-8 * s, 10 * s);
    c.quadraticCurveTo(-9.5 * s, -2 * s, -6 * s, -9 * s);
    c.arc(0, -9 * s, 6 * s, Math.PI, 0, false);
    c.quadraticCurveTo(9.5 * s, -2 * s, 8 * s, 10 * s);
    c.quadraticCurveTo(5.5 * s, 7 * s, 3.5 * s, 10.5 * s);   // 波浪下摆
    c.quadraticCurveTo(1.5 * s, 7 * s, 0, 10.5 * s);
    c.quadraticCurveTo(-1.5 * s, 7 * s, -3.5 * s, 10.5 * s);
    c.quadraticCurveTo(-5.5 * s, 7 * s, -8 * s, 10 * s);
    c.closePath(); c.fill();
    eyes(c, -2.1, 2.1, -9.5, 1.2, L);
  }
  function wolfShape(c, s, L) {
    // 正面立耳狼头
    c.beginPath();
    c.moveTo(-7 * s, 8 * s);
    c.lineTo(-8.5 * s, -2 * s);
    c.lineTo(-9.5 * s, -13 * s); c.lineTo(-4 * s, -7.5 * s);   // 左立耳
    c.quadraticCurveTo(0, -9.5 * s, 4 * s, -7.5 * s);
    c.lineTo(9.5 * s, -13 * s); c.lineTo(8.5 * s, -2 * s);     // 右立耳
    c.lineTo(7 * s, 8 * s);
    c.closePath(); c.fill();
    eyes(c, -3.2, 3.2, -4.5, 1.3, L);
    noseDot(c, s, L);
  }
  function captainShape(c, s, L) {
    skullCap(c, s, L);
    // 盔冠 + 肩甲（v3）：原来是"族色小撮毛"，画在剪影之外、又不是墨色 ——
    // 32px 下骷髅兵与队长近黑剪影 IoU **0.95**、48px 0.99：两者数值完全不同（队长是精英），
    // 玩家在图鉴格与棋盘上却分不出。圣经 §1「任何角色先过纯黑形状测试」、
    // §3.5「每处细节必须改变轮廓才算数」——族色毛不算数。改成两处**轮廓级**差异：
    // 墨色三尖羽冠（头顶变高变破）+ 方肩甲（体宽出一圈），32px 也读得出"这只更壮"。
    c.fillStyle = MINION_INK;                    // eyeSocket 会把 fillStyle 改成亮色，这里必须显式压回墨色
    c.beginPath();
    c.moveTo(-4.6 * s, -8.4 * s);
    c.lineTo(-5.6 * s, -14.2 * s);               // 左羽尖
    c.lineTo(-2.2 * s, -12.4 * s);
    c.lineTo(0, -17.8 * s);                      // 中羽尖（最高，仍在格里）
    c.lineTo(2.2 * s, -12.4 * s);
    c.lineTo(5.6 * s, -14.2 * s);                // 右羽尖
    c.lineTo(4.6 * s, -8.4 * s);
    c.closePath(); c.fill();
    c.beginPath();                                // 左肩甲
    c.moveTo(-11.2 * s, 3.2 * s); c.lineTo(-11.2 * s, 7.4 * s);
    c.lineTo(-4.6 * s, 7.4 * s); c.lineTo(-4.6 * s, 3.2 * s);
    c.closePath(); c.fill();
    c.beginPath();                                // 右肩甲
    c.moveTo(11.2 * s, 3.2 * s); c.lineTo(11.2 * s, 7.4 * s);
    c.lineTo(4.6 * s, 7.4 * s); c.lineTo(4.6 * s, 3.2 * s);
    c.closePath(); c.fill();
    eyeSocket(c, s, -3.4, -2.5, 2.2, 2.6, L);
    eyeSocket(c, s, 3.4, -2.5, 2.2, 2.6, L);
  }
  function vampireShape(c, s, L) {
    // 高立领披风剪影：领尖高过头，人脸凹在领口中
    c.beginPath();
    c.moveTo(-13.5 * s, 11 * s);
    c.quadraticCurveTo(-13 * s, -4 * s, -10.5 * s, -12 * s);
    c.lineTo(-7 * s, -14.5 * s);                                // 左领尖
    c.quadraticCurveTo(-5 * s, -10 * s, -3.5 * s, -8.5 * s);
    c.quadraticCurveTo(0, -11.5 * s, 3.5 * s, -8.5 * s);
    c.lineTo(7 * s, -14.5 * s);                                 // 右领尖
    c.quadraticCurveTo(10.5 * s, -12 * s, 13.5 * s, -4 * s);
    c.lineTo(13.5 * s, 11 * s);
    c.closePath(); c.fill();
    eyes(c, -2.4, 2.4, -6.5, 1.2, L);
  }
  function houndShape(c, s, L) {
    // 低身猎犬：横长体 + 立耳 + 前探吻
    c.save(); c.rotate(-0.06);
    c.beginPath();
    c.ellipse(0, 1.5 * s, 12 * s, 6.5 * s, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    roundBlob(c, s, -6.5 * s, -5.5 * s, 5 * s, 4.2 * s, 0);     // 头
    c.beginPath(); c.moveTo(-10.5 * s, -6 * s); c.lineTo(-14.5 * s, -9 * s); c.lineTo(-10.5 * s, -10.5 * s); c.closePath(); c.fill(); // 吻
    c.beginPath(); c.moveTo(-4.5 * s, -8 * s); c.lineTo(-3 * s, -12.5 * s); c.lineTo(-0.5 * s, -8.5 * s); c.closePath(); c.fill();   // 耳
    eyes(c, -8.4, -4.6, -6.4, 1.05, L);
  }
  function lanternMonkShape(c, s, L) {
    // 僧袍 + 提灯。2026-11-24：32px 下与「灰烬祭司」（同族、同为宽摆长袍）撞到 IoU 0.83，
    // 两只都靠「宽底 + 圆头」读形。这里把区分点做成**轮廓级**：
    //   ① 袍摆收窄成直筒（祭司是 A 字铺开）；
    //   ② 灯放大成一整块挂在身侧、伸出轮廓外（祭司的尖帽在上方，侧向没有凸出）。
    c.beginPath();
    c.moveTo(-6 * s, 12 * s);
    c.quadraticCurveTo(-6.6 * s, -3 * s, -5 * s, -11 * s);
    c.arc(0, -11 * s, 5 * s, Math.PI, 0, false);
    c.quadraticCurveTo(6.6 * s, -3 * s, 6 * s, 12 * s);
    c.closePath(); c.fill();
    // 灯：钩线 + 大灯体（唯一横向凸出物）
    c.strokeStyle = L[1] + '0.8)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(5.5 * s, -8 * s); c.quadraticCurveTo(10 * s, -7 * s, 11.5 * s, -4 * s); c.stroke();
    c.fillStyle = L[1] + '0.95)';
    roundRectPath(c, 9.4 * s, -4.2 * s, 7 * s, 8 * s, 1.8 * s); c.fill();
    c.fillStyle = 'rgba(255,240,200,0.95)';
    c.fillRect(10.8 * s, -2.6 * s, 4.2 * s, 4.6 * s);
    eyes(c, -1.8, 1.8, -12, 1.05, L);
  }
  function shieldShape(c, s, L) {
    // 立起的塔盾：盾面一道竖亮缝（眼睛位），盾缘亮边
    c.beginPath();
    c.moveTo(-9 * s, -12 * s);
    c.lineTo(9 * s, -12 * s);
    c.quadraticCurveTo(11.5 * s, 2 * s, 0, 13 * s);
    c.quadraticCurveTo(-11.5 * s, 2 * s, -9 * s, -12 * s);
    c.closePath(); c.fill();
    // 横箍两道（结构，不算装饰零件——这是盾的语言）
    c.strokeStyle = L[1] + '0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-8.2 * s, -4 * s); c.lineTo(8.2 * s, -4 * s);
    c.moveTo(-6.5 * s, 3 * s); c.lineTo(6.5 * s, 3 * s);
    c.stroke();
    // 竖缝亮瞳
    c.fillStyle = L[1] + '1)';
    roundRectPath(c, -1.1 * s, -8 * s, 2.2 * s, 7 * s, 1.1 * s); c.fill();
  }
  function wormShape(c, s, L) {
    // 弓身环节虫：三段弧体，头端一点绿光
    c.lineCap = 'round';
    c.strokeStyle = MINION_INK;
    c.lineWidth = 7.5 * s;
    c.beginPath();
    c.moveTo(-11 * s, 7 * s);
    c.quadraticCurveTo(-4 * s, -9 * s, 3 * s, -3 * s);
    c.quadraticCurveTo(8 * s, 1 * s, 12 * s, -4 * s);
    c.stroke();
    // 环节亮边：沿背脊三条短弧
    c.strokeStyle = L[1] + '0.65)';
    c.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc((-5 + i * 5.5) * s, (1.5 - i * 3.2) * s, 4.5 * s, Math.PI * 1.15, Math.PI * 1.75);
      c.stroke();
    }
    // 头部亮点
    c.fillStyle = L[1] + '1)';
    c.beginPath(); c.arc(12 * s, -4 * s, 2 * s, 0, Math.PI * 2); c.fill();
  }
  function facelessShape(c, s, L) {
    // 无面者：细长直影 + 垂纱白纹（脸的位置一道竖缝，不画瞳）
    c.beginPath();
    c.moveTo(-7 * s, 12 * s);
    c.quadraticCurveTo(-7.5 * s, -6 * s, -4 * s, -12 * s);
    c.arc(0, -12 * s, 4 * s, Math.PI, 0, false);
    c.quadraticCurveTo(7.5 * s, -6 * s, 7 * s, 12 * s);
    c.closePath(); c.fill();
    c.strokeStyle = L[1] + '0.85)';
    c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(0, -9 * s); c.lineTo(0, -2 * s); c.stroke();
    // 垂纱两道浅纹
    c.strokeStyle = L[1] + '0.3)';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-3.2 * s, -7 * s); c.lineTo(-3.2 * s, 4 * s);
    c.moveTo(3.2 * s, -7 * s); c.lineTo(3.2 * s, 4 * s);
    c.stroke();
  }
  function priestShape(c, s, L) {
    // 尖帽长袍祭司：A 字铺开的袍摆 + 高尖帽（与提灯僧的直筒袍/侧挂灯正相反）
    c.beginPath();
    c.moveTo(-10 * s, 12 * s);
    c.quadraticCurveTo(-10.5 * s, -2 * s, -5.5 * s, -8.5 * s);
    c.lineTo(-5.5 * s, -11.5 * s);
    c.quadraticCurveTo(-2 * s, -14 * s, 1.5 * s, -17.5 * s);   // 帽尖右弯
    c.lineTo(2.5 * s, -13.5 * s);
    c.lineTo(5.5 * s, -11.5 * s);
    c.lineTo(5.5 * s, -8.5 * s);
    c.quadraticCurveTo(10.5 * s, -2 * s, 10 * s, 12 * s);
    c.closePath(); c.fill();
    // 帽檐亮边
    c.strokeStyle = L[1] + '0.6)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(-6.2 * s, -11.2 * s); c.lineTo(6.2 * s, -11.2 * s); c.stroke();
    // 胸前余烬（单焦点）
    c.fillStyle = L[1] + '0.95)';
    c.beginPath(); c.arc(0, -1 * s, 1.7 * s, 0, Math.PI * 2); c.fill();
  }
  function rustKingShape(c, s, L) {
    // 宽体王：矮胖身形 + 三尖锈冠（光色实心，冠是唯一亮部 + 眼）
    c.beginPath();
    c.moveTo(-11 * s, 11 * s);
    c.quadraticCurveTo(-12.5 * s, -6 * s, -7 * s, -11 * s);
    c.quadraticCurveTo(0, -14 * s, 7 * s, -11 * s);
    c.quadraticCurveTo(12.5 * s, -6 * s, 11 * s, 11 * s);
    c.closePath(); c.fill();
    crown(c, s, L, 5.5, -12, -15.5);
    eyes(c, -3, 3, -7.5, 1.3, L);
  }
  function wardenShape(c, s, L) {
    // 巨碑守卫：整块方碑 + 顶部两粒横距很宽的亮瞳 + 碑面裂纹
    c.fillRect(-10 * s, -13 * s, 20 * s, 24 * s);
    // 顶部削角
    c.beginPath();
    c.moveTo(-10 * s, -13 * s); c.lineTo(-6.5 * s, -16.5 * s); c.lineTo(6.5 * s, -16.5 * s); c.lineTo(10 * s, -13 * s);
    c.closePath(); c.fill();
    // 碑面裂纹（暗缝，让石头有岁数）
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-4 * s, -8 * s); c.lineTo(-1.5 * s, -3 * s); c.lineTo(-3.5 * s, 2 * s);
    c.stroke();
    eyes(c, -3.8, 3.8, -10.5, 1.3, L);
  }
  function candleShape(c, s, L) {
    // 烛（ghost，NPC）：细烛台 + 摇曳焰。不画瞳，光就是它的脸
    c.fillRect(-2.2 * s, -1 * s, 4.4 * s, 12 * s);            // 烛身
    c.fillRect(-6 * s, 9.5 * s, 12 * s, 2.6 * s);            // 托盘
    // 焰：双层光焰，随时间轻摆
    const sway = Math.sin(simT / 260) * 1.6 * s;
    c.fillStyle = L[1] + '0.55)';
    c.beginPath();
    c.moveTo(0, -3 * s);
    c.quadraticCurveTo(-4.2 * s + sway, -8 * s, sway, -14 * s);
    c.quadraticCurveTo(4.2 * s + sway, -8 * s, 0, -3 * s);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,240,200,0.95)';
    c.beginPath();
    c.moveTo(0, -4 * s);
    c.quadraticCurveTo(-2 * s + sway * 0.6, -7.5 * s, sway * 0.6, -11 * s);
    c.quadraticCurveTo(2 * s + sway * 0.6, -7.5 * s, 0, -4 * s);
    c.closePath(); c.fill();
  }

  // ---- 剪影基元 ----
  // 圆亮瞳两粒（x1/x2 各自定位，支持不对称布局），满亮 + 白芯
  function eyes(c, x1, x2, y, r, L) {
    // 瞳外一圈柔光（2026-11-24）：缩到 30px 时，两粒亮点的「有生物感」比形状本身更早被读到。
    // 只加在瞳上、不加在身体上——身体一亮就从剪影变成贴图了。
    c.fillStyle = L[1] + '0.20)';
    c.beginPath();
    c.arc(x1, y, r * 2.6, 0, Math.PI * 2);
    c.arc(x2, y, r * 2.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = L[1] + '1)';
    c.beginPath();
    c.arc(x1, y, r, 0, Math.PI * 2);
    c.arc(x2, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.arc(x1, y - r * 0.3, r * 0.34, 0, Math.PI * 2);
    c.arc(x2, y - r * 0.3, r * 0.34, 0, Math.PI * 2);
    c.fill();
  }
  // 眼窝：先挖深洞再点光——骷髅族专用的「洞里有光」
  function eyeSocket(c, s, x, y, rx, ry, L) {
    c.fillStyle = '#04060b';
    c.beginPath();
    c.ellipse(x * s, y * s, rx * s, ry * s, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = L[1] + '0.95)';
    c.beginPath();
    c.arc(x * s, y * s, Math.min(rx, ry) * s * 0.52, 0, Math.PI * 2);
    c.fill();
  }
  function noseDot(c, s, L) {
    c.fillStyle = '#04060b';
    c.beginPath();
    c.moveTo(0, 0.5 * s); c.lineTo(1.1 * s, 3 * s); c.lineTo(-1.1 * s, 3 * s);
    c.closePath(); c.fill();
    c.fillStyle = L[1] + '0.5)';
    c.beginPath();
    c.moveTo(0, 1.2 * s); c.lineTo(0.6 * s, 2.6 * s); c.lineTo(-0.6 * s, 2.6 * s);
    c.closePath(); c.fill();
  }
  // 圆润软体（史莱姆用）：扁半圆 + 亮边
  function blob(c, s, L, rx, ry) {
    c.beginPath();
    c.moveTo(-rx * s, 8 * s);
    c.quadraticCurveTo(-rx * 1.06 * s, -ry * 1.6 * s, 0, -ry * 1.7 * s);
    c.quadraticCurveTo(rx * 1.06 * s, -ry * 1.6 * s, rx * s, 8 * s);
    c.quadraticCurveTo(0, 10 * s, -rx * s, 8 * s);
    c.closePath(); c.fill();
  }
  // 圆角方（歪头/圆颅部件）
  function roundBlob(c, s, x, y, rx, ry, rot) {
    c.save();
    c.translate(x * s, y * s);
    if (rot) c.rotate(rot);
    c.beginPath();
    c.ellipse(0, 0, rx * s, ry * s, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function crown(c, s, L, w, yTop, yTip) {
    c.fillStyle = L[1] + '0.9)';
    c.beginPath();
    c.moveTo(-w * 0.8 * s, yTop * s);
    c.lineTo(-w * 0.55 * s, yTip * 0.82 * s);
    c.lineTo(-w * 0.28 * s, (yTop - 1) * s);
    c.lineTo(0, yTip * s);
    c.lineTo(w * 0.28 * s, (yTop - 1) * s);
    c.lineTo(w * 0.55 * s, yTip * 0.82 * s);
    c.lineTo(w * 0.8 * s, yTop * s);
    c.closePath(); c.fill();
  }
  // 骷髅头基元（兵/队长共用造型，队长另加盔缨）
  function skullCap(c, s, L) {
    c.beginPath();
    c.arc(0, -2.5 * s, 8 * s, Math.PI * 0.95, Math.PI * 0.05, false);
    c.quadraticCurveTo(8.6 * s, 2.5 * s, 5 * s, 4 * s);
    c.lineTo(4.2 * s, 8 * s); c.lineTo(1.8 * s, 8 * s); c.lineTo(1.8 * s, 5.5 * s);
    c.lineTo(-1.8 * s, 5.5 * s); c.lineTo(-1.8 * s, 8 * s); c.lineTo(-4.2 * s, 8 * s);
    c.lineTo(-5 * s, 4 * s);
    c.quadraticCurveTo(-8.6 * s, 2.5 * s, -8 * s, -2.5 * s);
    c.closePath(); c.fill();
  }

  // 小怪统一画法：族色底光（保留旧版「一眼分辨威胁类型」）→ 亮边底版 → 近黑剪影 → 焦点层
  function drawMinion(ch, m, px, py, t) {
    const art = MINION_ART[ch];
    const pal = m.deep ? MINION_KIND_COLOR_DEEP : MINION_KIND_COLOR;
    const L = pal[art.c] || pal['构'];
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const s = TILE / 48;
    const bob = Math.sin(t / 420 + px * 0.11) * TILE * 0.035;
    const breathe = 1 + Math.sin(t / 560 + py * 0.09) * 0.02;

    groundShadow(px, py, TILE * 0.3, 0.4);
    // 族色底光（沿用旧 kindColor 语义：同族同色，威胁类型一眼分）
    const kg = ctx.createRadialGradient(cx, py + TILE * 0.6, 1, cx, py + TILE * 0.6, TILE * 0.56);
    kg.addColorStop(0, L[1] + '0.24)');
    kg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(cx, py + TILE * 0.6, TILE * 0.52, 0, Math.PI * 2);
    ctx.fill();
    // 深色变体：脚下一圈细环（同族同色，只是多一道「更靠后」的读数）
    if (m.deep) {
      ctx.strokeStyle = L[1] + '0.55)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, py + TILE * 0.6, TILE * 0.44, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(cx, cy + bob);
    // 2026-11-24 用户报障「看不出是怪物」：18 只的造型本身没错，问题是**太小**——
    // 原来造型只占格子高度的 55%（48 单位里 y∈[-14,12]），棋盘上一格 30px，
    // 落到屏幕上每只只有 16px 高，眼睛和角全糊成暗点。
    // 这里统一放大 1.24 倍（占格 ~68%），并把 rim 加粗到 1.7px、族色底光提一档；
    // 造型坐标一个没动——放大不改变任何两只之间的形状关系（minion-check 的 IoU 口径不变）。
    const GROW = 1.24;
    ctx.scale(s * breathe * GROW, s * breathe * GROW);
    if (m.ghost) ctx.globalAlpha = 0.92;   // 烛是灵体，微透明
    // ① 亮边底版：同形状外扩 1.7px 画一遍族色，再盖近黑本体 → 右上 rim 的暗色等效实现
    //    （描边为主的造型 noRim，避免重影）
    if (!art.noRim) {
      ctx.fillStyle = L[1] + '0.95)';
      ctx.save();
      ctx.translate(1.7, -1.7);
      art.f(ctx, 1, L);
      ctx.restore();
    }
    // ② 剪影本体：棋盘上用近黑（要浮在石板上）；图标档（图鉴 / 战前卡）背后是纯黑面板，
    //    近黑会糊成一块，所以提一阶到 #151b28——只改图标档，不改棋盘上的形体关系。
    ctx.fillStyle = iconMode ? '#151b28' : MINION_INK;
    art.f(ctx, 1, L);
    ctx.restore();

    // ghost 烛保留旧版呼吸光环（灵体语言）
    if (m.ghost) {
      const p = 0.5 + Math.sin(t / 300) * 0.5;
      ctx.strokeStyle = 'rgba(159,216,255,' + (0.14 + p * 0.2).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, TILE * (0.34 + p * 0.05), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 章节 Boss 地图标 identity：四位锁匠共用「炎魔」的剪影，只换光色（与 portraits.js 同源）
  const BOSS_LIGHT = {
    N: ['#b9a6ff', 'rgba(185,166,255,'], // 墨妖：紫
    Z: ['#ff7d7d', 'rgba(255,125,125,'], // 炎魔/魔王：红
    Y: ['#e8c46a', 'rgba(232,196,106,'], // 钟妖：金
    U: ['#9fd8ff', 'rgba(159,216,255,'], // 碑魔：蓝
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
    // （图标模式下不画：画布只有 30–48px，签会缩到 8px 并和卡片上的名字重复）
    const tag = iconMode ? '' : (m.name || '');
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
    // v2 小怪剪影：库里有造型的走剪影（与 Boss 同一画风语言），
    // 没收录的（测试注入的临时怪）保留 emoji 兜底，不让渲染炸裂。
    if (MINION_ART[ch]) { drawMinion(ch, m, px, py, t); return; }
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

  // 锁芯的四道环：已得的环实心点亮、未得的只剩极淡的虚线底。
  // 圆心取塔心石（带走后仍画在空石座上），不与任何格子重叠，只做氛围读数。
  function drawCoreRings(state, map) {
    let kx = 5;
    let ky = 5;
    let found = false;
    for (let y = 0; y < SIZE && !found; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (map[y][x] === 'K') { kx = x; ky = y; found = true; break; }
      }
    }
    const hp = state.flags && state.flags.heartAt;
    if (!found && hp) { kx = hp[0]; ky = hp[1]; }
    const cx = kx * TILE + TILE / 2;
    const cy = ky * TILE + TILE / 2;
    const owned = (state.flags && state.flags.rings) || [];
    const CH = ['#b9a6ff', '#ff7d7d', '#e8c46a', '#9fd8ff'];
    for (let i = 0; i < 4; i++) {
      const r = TILE * (0.74 + i * 0.17);
      const a0 = -Math.PI / 2 + i * (Math.PI / 2) + 0.18;
      const lit = i < owned.length;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + 0.92, false);
      ctx.lineWidth = lit ? 2 : 1;
      ctx.strokeStyle = lit
        ? CH[i]
        : 'rgba(159,216,255,0.12)';
      if (lit) {
        ctx.shadowColor = CH[i];
        ctx.shadowBlur = 6;
        ctx.globalAlpha = 0.75 + Math.sin(simT / 700 + i) * 0.18;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      if (!lit) {
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, a0, a0 + 0.92, false);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // 玩家 v2 剪影（2026-11-17 美术管线介入）：旧的 🧙 emoji 与剪影世界打架。
  // 勇者 = 全塔唯一暖光源：烛金 rim + 兜帽尖角 + 侧挎短剑。形状与 Boss/小怪同一语言。
  const PLAYER_LIGHT = ['#ffd778', 'rgba(255,215,120,'];
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
    const s = TILE / 48;
    const PL = PLAYER_LIGHT;
    const ink = '#0b0e16';
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2 + bob);
    ctx.scale(sx * face * s, sy * s);

    // 斗篷： hem 有开衩（负空间，打破呆板对称）
    const body = (gr) => {
      ctx.beginPath();
      ctx.moveTo(-9 - gr, 12);
      ctx.quadraticCurveTo(-10.5 - gr, 0, -7 - gr, -7);
      ctx.quadraticCurveTo(-5 - gr, -10.5, 0, -10.5);
      ctx.quadraticCurveTo(5 + gr, -10.5, 7 + gr, -7);
      ctx.quadraticCurveTo(10.5 + gr, 0, 9 + gr, 12);
      ctx.lineTo(4 + gr, 12);
      ctx.lineTo(2.5 + gr, 8.5);
      ctx.lineTo(1 + gr, 12);
      ctx.closePath();
      ctx.fill();
    };
    // 兜帽：圆颅 + 歪向左的尖角（非对称锚点）
    const hood = (gr) => {
      ctx.beginPath();
      ctx.ellipse(0, -14, 5.6 + gr, 5.2 + gr, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-4.5 - gr, -17);
      ctx.lineTo(-2.5 - gr, -22.5);
      ctx.lineTo(0.5 + gr, -18);
      ctx.closePath();
      ctx.fill();
    };
    // ① 金 rim 底版（右上偏移 1.2px）② 近黑本体
    ctx.fillStyle = PL[1] + '0.8)';
    ctx.save(); ctx.translate(1.2, -1.2); body(0); hood(0); ctx.restore();
    ctx.fillStyle = ink;
    body(0); hood(0);

    // 脸洞 + 金瞳
    ctx.fillStyle = '#04060b';
    ctx.beginPath();
    ctx.ellipse(0, -14, 3.6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PL[1] + '1)';
    ctx.beginPath();
    ctx.arc(-1.6, -14.4, 1.15, 0, Math.PI * 2);
    ctx.arc(1.6, -14.4, 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(-1.6, -14.7, 0.4, 0, Math.PI * 2);
    ctx.arc(1.6, -14.7, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // 侧挎短剑：金描一圈再盖墨（勾勒独立于斗篷的轮廓）
    ctx.strokeStyle = PL[1] + '0.75)';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(6, 4); ctx.lineTo(12.5, -7);
    ctx.moveTo(4.8, 1.2); ctx.lineTo(8.2, 3.2);
    ctx.stroke();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(6, 4); ctx.lineTo(12.5, -7);
    ctx.moveTo(4.8, 1.2); ctx.lineTo(8.2, 3.2);
    ctx.stroke();
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
    // 塔的常驻色（2026-11-28 主题轮）：整屏压一层极淡的塔色，跟着呼吸缓慢起伏。
    // 它只在暗部起作用——亮处的道具与数字不受影响，但三座塔的「空气」是三种温度。
    const paint = paintOf(lastFloor);
    if (paint && paint.overlay) {
      const m = /rgba?\(([^)]+)\)/.exec(paint.overlay);
      if (m) {
        const p = m[1].split(',').map(Number);
        const a = (p[3] || 0.05) * (0.82 + Math.sin(performance.now() / 2600) * 0.18);
        ctx.fillStyle = `rgba(${p[0]},${p[1]},${p[2]},${a.toFixed(3)})`;
        ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
      }
    }
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
      // 延迟环（relicBeamFx 的 start=simT+N）年龄为负时跳过；
      // 负 age 会算出负半径，arc() 直接抛 IndexSizeError——主循环每帧死在同一环上，画面永久冻结
      const p = (simT - r.start) / r.dur;
      if (p <= 0) continue;
      const ease = 1 - Math.pow(1 - p, 2.2);
      ctx.globalAlpha = Math.max(0, 1 - p);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath();
      const cx = r.px != null ? r.px : r.tx * TILE + TILE / 2;
      const cy = r.py != null ? r.py : r.ty * TILE + TILE / 2;
      // 半径硬保证非负：特效参数异常时最多不画，绝不让 arc() 抛异常炸掉整帧
      const rad = (r.px != null ? 2 : 6) + ease * r.maxR;
      if (rad > 0) {
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
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
    // 火光按塔换色（2026-11-28 主题轮）：锈塔炉火橙 / 灰塔余火红 / 钟塔冷青灯，主塔仍是烛金
    const L = (paintOf(lastFloor) || {}).lamp || [255, 196, 120];
    const ca = (a) => `rgba(${L[0]},${L[1]},${L[2]},${a})`;
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
      g.addColorStop(0, ca(0.34));
      g.addColorStop(0.4, ca(0.115));
      g.addColorStop(1, ca(0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, R, 0, Math.PI * 2);
      ctx.fill();
      // 灯托
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(38,30,24,0.9)';
      ctx.fillRect(fx - TILE * 0.03, fy + TILE * 0.02, TILE * 0.06, TILE * 0.15);
      ctx.globalCompositeOperation = 'lighter';
      // 火焰：芯偏白，外焰取塔色
      const fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, TILE * 0.17);
      fg.addColorStop(0, 'rgba(255,246,222,0.95)');
      fg.addColorStop(0.5, ca((0.5 + fl * 0.22).toFixed(2)));
      fg.addColorStop(1, ca(0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy - TILE * 0.02, TILE * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeam() {
    // 第 6 层是中点王座，第 12 层才是真正的塔顶：两处都有天光，
    // 塔顶那束收短一点，只落在公主与石板上，不越过碑魔所在的门闩行。
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
    // 锁芯：塔心石四周的锁环按「已得几枚」点亮（2026-11-24）。
    // 这是本层唯一的进度可视化——四个锁匠各一枚环，走到这里的人一眼能看出自己带了几道锁。
    if (state.floor === D.floors.length - 1) drawCoreRings(state, map);
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

    // 换层淡入：斜坡必须用调用方给的时长（写死 280 会让 fade(420) 前 140ms 纯黑）
    if (now < fadeUntil) {
      const p = (fadeUntil - now) / fadeDur;
      ctx.fillStyle = `rgba(5,7,12,${Math.min(1, p)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    ctx.restore();
  }

  // ---------- 图标：把棋盘上的同一套剪影画进任意 canvas ----------
  // 为什么要有这条出口：11-17 起棋盘上的怪与勇者都是手绘剪影，而图鉴 / 怪物速查卡 / 战斗演出
  // 三处仍是整格 emoji —— 同一只怪在两屏里长成两种东西，正是「格子上的 emoji 太丑」那条反馈的残留。
  // 做法：临时把模块级 ctx/TILE 指向目标画布（同步调用、单线程，画完立刻换回），
  // 复用 drawMonster / drawPlayer 本体——绝不复制第二份造型，否则下次改造型又要改两处。
  // show：CSS 显示尺寸（可小于 ss）。图标要在 48px 的槽里看清，得用 96 的背板再缩到 48——
  // 否则 48 的背板上剪影只占 30px，缩略档的角/齿全糊。
  function paintInto(cv, size, drawer, show) {
    if (!cv || typeof cv.getContext !== 'function') return false;
    const ss = Math.max(16, Math.round(size || 40));
    const disp = Math.max(16, Math.round(show || ss));
    const d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(ss * d);
    cv.height = Math.round(ss * d);
    cv.style.width = disp + 'px';
    cv.style.height = disp + 'px';
    const c2 = cv.getContext('2d');
    c2.setTransform(d, 0, 0, d, 0, 0);
    c2.clearRect(0, 0, ss, ss);
    const oldCtx = ctx, oldTile = TILE, oldFace = face, oldIcon = iconMode;
    ctx = c2; TILE = ss; face = 1; iconMode = true; // 图标一律朝右：棋盘上的转身状态不该漏进静态卡片
    try { drawer(ss); } finally { ctx = oldCtx; TILE = oldTile; face = oldFace; iconMode = oldIcon; }
    // 收边：画布四周 8% 用 alpha 淡出，把「背光尾巴 + 剪影自身的光晕」在出画布之前收干净。
    // 不这样做的话，玩家与怪自己的暖色光晕（全塔唯一光源）会一路顶到画布边被硬切一刀，
    // 图标底下就多出一块有直边的方牌——这正是「格子上像垫了灰牌」的观感来源。
    c2.globalCompositeOperation = 'destination-in';
    const rim = c2.createRadialGradient(ss / 2, ss / 2, ss * 0.42, ss / 2, ss / 2, ss * 0.5);
    rim.addColorStop(0, 'rgba(0,0,0,1)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    c2.fillStyle = rim;
    c2.fillRect(0, 0, ss, ss);
    c2.globalCompositeOperation = 'source-over';
    return true;
  }

  // 卡片没有地板：纯近黑剪影摆在深色面板上会糊成一团（实测 30px 只剩一个黑块），
  // 所以先铺一层族色（Boss 用锁匠光色）柔光当"灯位"——顺带保住「同族同色」这条语义。
  // 半径与圆心必须落在画布半宽（ss/2）之内——超出去渐变在四边就不是 0，
  // 背光会被裁成一块硬边亮方块（48px 上看像给图标垫了块灰牌）。
  function iconBackdrop(ss, light) {
    const g = ctx.createRadialGradient(ss / 2, ss / 2, 1, ss / 2, ss / 2, ss * 0.5);
    g.addColorStop(0, light + '0.42)');
    g.addColorStop(0.6, light + '0.14)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ss, ss);
  }

  // 怪物图标：小怪走剪影、Boss 走站姿锁匠、未收录的字符仍由 drawMonster 自己兜 emoji
  function paintIcon(cv, ch, size, show) {
    const m = D.monsters && D.monsters[ch];
    if (!m) return false;
    const pal = m.deep ? MINION_KIND_COLOR_DEEP : MINION_KIND_COLOR;
    const light = m.boss
      ? (BOSS_LIGHT[ch] || BOSS_LIGHT.Z)[1]
      : (pal[(MINION_ART[ch] || {}).c] || pal['构'])[1];
    return paintInto(cv, size, (ss) => {
      iconBackdrop(ss, light);
      drawMonster(ch, 0, 0, simT);
    }, show);
  }

  function paintHeroIcon(cv, size) {
    return paintInto(cv, size, (ss) => {
      iconBackdrop(ss, PLAYER_LIGHT[1]);
      drawPlayer(0, 0, simT);
    });
  }

  window.Renderer = {
    onScare(fn) { scareCb = typeof fn === 'function' ? fn : null; },
    init, layout, ensureLayout, draw, snapshot, paintIcon, paintHeroIcon,
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
