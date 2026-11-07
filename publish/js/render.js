// TowerMates · 魔塔原型 —— Canvas 渲染（v0.3：粒子/冻结/闪白/氛围/缓动）
(function () {
  const D = window.GAME_DATA;
  const SIZE = 11;
  let canvas, ctx, TILE = 48, dpr = 1;

  // 时间体系：simT 只在非冻结时前进，所有年龄型特效用它
  let simT = 0;
  let freezeUntil = 0, frozenAt = 0;

  const floats = [];     // 伤害/拾取飘字
  const particles = [];  // 粒子
  const flashes = [];    // 命中闪白 {x,y,start,dur,color}
  const rings = [];      // 扩散光环 {x,y,start,dur,color,maxR}
  let shakeUntil = 0, shakeMag = 6, shakeDur = 200;
  let fadeUntil = 0;
  let pulseStart = -9999; // 白色全屏脉冲（boss 击杀等）

  // 玩家显示坐标（平滑跟随逻辑坐标）
  const disp = { x: 1, y: 1 };
  let lastFloor = -1;

  // 楼层氛围
  let ambient = { mode: 'torch', embers: [], spawnAcc: 0 };

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
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(px * SIZE * dpr);
    canvas.height = Math.floor(px * SIZE * dpr);
    canvas.style.width = px * SIZE + 'px';
    canvas.style.height = px * SIZE + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- 对外特效接口 ----------
  function freeze(ms) {
    if (ms <= 0) return;
    const now = performance.now();
    if (now >= freezeUntil) frozenAt = now; // 只在非冻结态记录冻结起点
    freezeUntil = Math.max(freezeUntil, now + ms);
  }

  function shake(ms, mag) {
    shakeUntil = performance.now() + (ms || 200);
    shakeDur = ms || 200;
    shakeMag = mag || 6;
  }

  function fade(ms) {
    fadeUntil = performance.now() + (ms || 260);
  }

  function pulse() {
    pulseStart = performance.now();
  }

  // 像素坐标
  function addFloat(text, x, y, color, big) {
    floats.push({ text, x: x + (Math.random() * 10 - 5), y, color, start: simT, dur: big ? 1200 : 900, big: !!big });
    if (floats.length > 14) floats.shift();
  }

  function flashTile(tx, ty, color, dur) {
    flashes.push({ tx, ty, start: simT, dur: dur || 130, color: color || '#ffffff' });
  }

  function ring(tx, ty, color, maxR, dur) {
    rings.push({ tx, ty, start: simT, dur: dur || 420, color, maxR: maxR || TILE * 2.2 });
  }

  // 粒子爆发。opts: {count, colors[], speed, life, grav, size, spread, angle, arc}
  function burst(px, py, opts) {
    const o = Object.assign({ count: 10, colors: ['#ffd27d', '#ff9f6b'], speed: 90, life: [400, 750], grav: 220, size: [2, 4], spread: Math.PI * 2, angle: -Math.PI / 2 }, opts);
    for (let i = 0; i < o.count; i++) {
      if (particles.length > 150) particles.shift();
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

  // 各层暗度：越往上越黑，塔顶几乎无光
  const FLOOR_MOOD = [0.14, 0.17, 0.2, 0.26, 0.3, 0.38];
  let torchList = [];

  function setAmbient(floorIndex, map) {
    const mode = floorIndex === 5 ? 'boss' : floorIndex === 3 ? 'mist' : 'torch';
    ambient = { mode, embers: [], spawnAcc: 0 };
    lastFloor = floorIndex;
    torchList = [];
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
          // 找靠地面的方向，火焰朝那一侧
          let sx = 0, sy = 0;
          for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const ch = map[y + dy] && map[y + dy][x + dx];
            if (ch && ch !== '#') { sx = dx; sy = dy; break; }
          }
          torchList.push({ x, y, sx, sy, seed: (x * 31 + y * 17) % 100 });
        }
      }
    }
  }

  // ---------- 绘制基元 ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawWall(px, py) {
    ctx.fillStyle = '#2b3140';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.fillStyle = '#232837';
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + 2, py + TILE / 2);
    ctx.lineTo(px + TILE - 2, py + TILE / 2);
    ctx.moveTo(px + TILE / 2, py + TILE - 2);
    ctx.lineTo(px + TILE / 2, py + TILE / 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 2, py + TILE - 4, TILE - 4, 2);
    // 部分墙面加裂纹，避免整片墙过于整齐
    const seed = (px * 13 + py * 7) % 97;
    if (seed % 7 === 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const sx = px + TILE * (0.25 + (seed % 5) * 0.08);
      ctx.moveTo(sx, py + 4);
      ctx.lineTo(sx + TILE * 0.12, py + TILE * 0.42);
      ctx.lineTo(sx - TILE * 0.05, py + TILE * 0.62);
      ctx.lineTo(sx + TILE * 0.08, py + TILE - 5);
      ctx.stroke();
    }
  }

  function drawFloor(px, py, x, y) {
    let base = (x + y) % 2 === 0 ? '#101521' : '#0e131e';
    if (ambient.mode === 'boss') base = (x + y) % 2 === 0 ? '#1a1016' : '#170e13';
    else if (ambient.mode === 'mist') base = (x + y) % 2 === 0 ? '#12101c' : '#100e19';
    ctx.fillStyle = base;
    ctx.fillRect(px, py, TILE, TILE);
    if ((x * 7 + y * 13) % 11 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(px + TILE * 0.44, py + TILE * 0.44, 2, 2);
    }
  }

  function glow(color, blur) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }
  function noGlow() {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function drawEmoji(ch, px, py, scale) {
    ctx.font = `${Math.floor(TILE * (scale || 0.62))}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, px + TILE / 2, py + TILE / 2 + TILE * 0.04);
  }

  function drawDoor(ch, px, py) {
    const color = ch === 'y' ? ['#8a6a18', '#c9a23a'] : ['#7a1f24', '#c94a52'];
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, color[1]);
    g.addColorStop(1, color[0]);
    ctx.fillStyle = g;
    roundRect(px + TILE * 0.14, py + TILE * 0.1, TILE * 0.72, TILE * 0.8, TILE * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(px + TILE * 0.2, py + TILE * 0.42, TILE * 0.6, 2);
    ctx.font = `${Math.floor(TILE * 0.36)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔒', px + TILE / 2, py + TILE / 2 + 1);
  }

  function drawStairs(ch, px, py) {
    ctx.fillStyle = ch === 'u' ? 'rgba(120,200,255,0.12)' : 'rgba(255,190,90,0.1)';
    ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = ch === 'u' ? '#7fc9ff' : '#ffc46b';
    ctx.font = `${Math.floor(TILE * 0.52)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch === 'u' ? '⬆️' : '⬇️', px + TILE / 2, py + TILE / 2);
  }

  function drawItem(ch, px, py, t) {
    const it = D.items[ch];
    const bob = Math.sin(t / 520 + px * 0.07 + py * 0.05) * TILE * 0.03;
    if (ch === 'k' || ch === 'K' || ch === 'L') {
      const c = ch === 'k' ? 'rgba(240,200,70,0.30)' : ch === 'K' ? 'rgba(80,160,255,0.30)' : 'rgba(255,90,90,0.30)';
      glow(c, TILE * 0.34);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.3, 0, Math.PI * 2);
      ctx.fill();
      noGlow();
      drawEmoji('🔑', px, py + bob, 0.5);
      return;
    }
    if (ch === '$') {
      glow('rgba(250,205,80,0.35)', TILE * 0.3);
      drawEmoji('💰', px, py + bob, 0.56);
      noGlow();
      return;
    }
    let tint = 'rgba(150,220,255,0.28)';
    if (it && it.type === 'hp') tint = 'rgba(255,110,110,0.32)';
    else if (it && it.type === 'atk') tint = 'rgba(255,190,110,0.30)';
    else if (it && it.type === 'def') tint = 'rgba(130,190,255,0.30)';
    else if (it && it.type === 'both') tint = 'rgba(200,150,255,0.34)';
    glow(tint, TILE * 0.3);
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(px + TILE / 2, py + TILE / 2, TILE * 0.26, 0, Math.PI * 2);
    ctx.fill();
    noGlow();
    drawEmoji(it ? it.emoji : '❓', px, py + bob, 0.58);
  }

  function drawBadge(px, py, text, color) {
    const fs = Math.max(9, Math.floor(TILE * 0.2));
    ctx.font = `700 ${fs}px "Microsoft YaHei",sans-serif`;
    const w = ctx.measureText(text).width + 6;
    const h = fs + 5;
    ctx.fillStyle = 'rgba(6,8,13,0.82)';
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
    if (m.boss) {
      const g = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE * 0.62);
      g.addColorStop(0, 'rgba(255,60,60,0.28)');
      g.addColorStop(1, 'rgba(255,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, TILE, TILE);
    }
    if (m.ghost) {
      const pulse = 0.5 + Math.sin(t / 300) * 0.5;
      ctx.save();
      ctx.strokeStyle = 'rgba(159,216,255,' + (0.18 + pulse * 0.22).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2, TILE * (0.3 + pulse * 0.06), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      glow('rgba(159,216,255,' + (0.2 + pulse * 0.25) + ')', TILE * 0.45);
      ctx.globalAlpha = 0.9;
      drawEmoji(m.emoji, px, py + bob * 1.6, 0.58);
      ctx.globalAlpha = 1;
      noGlow();
      return;
    }
    drawEmoji(m.emoji, px, py + bob, m.boss ? 0.72 : 0.6);
  }

  function drawPlayer(px, py, t) {
    const bob = Math.sin(t / 380) * 2;
    const g = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE * 0.62);
    g.addColorStop(0, 'rgba(255,215,120,0.30)');
    g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    // 挤压拉伸：水平移动时轻微横拉，垂直移动纵拉
    let sx = 1, sy = 1;
    const dx = Math.abs(disp.x - (disp._tx || disp.x));
    const dy = Math.abs(disp.y - (disp._ty || disp.y));
    if (dx > 0.05) { sx = 1.08; sy = 0.94; }
    else if (dy > 0.05) { sx = 0.94; sy = 1.08; }
    ctx.save();
    ctx.translate(px + TILE / 2, py + TILE / 2 + bob);
    ctx.scale(sx, sy);
    ctx.font = `${Math.floor(TILE * 0.62)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧙', 0, 0);
    ctx.restore();
  }

  // ---------- 氛围粒子 ----------
  function updateAmbient(dt, now) {
    const rate = ambient.mode === 'boss' ? 340 : ambient.mode === 'mist' ? 620 : 460;
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
    const colors = ambient.mode === 'boss'
      ? ['255,90,70']
      : ambient.mode === 'mist'
        ? ['170,140,255']
        : ['255,180,90', '255,200,120'];
    ctx.save();
    for (let i = ambient.embers.length - 1; i >= 0; i--) {
      const e = ambient.embers[i];
      const age = simT - e.start;
      if (age > e.life || e.y < -8) {
        ambient.embers.splice(i, 1);
        continue;
      }
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
    ctx.restore();
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
      g.addColorStop(1, 'rgba(120,90,255,0.06)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
    }
  }

  // ---------- 特效更新 ----------
  function updateFx(now) {
    // 闪白
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      if (simT - f.start > f.dur) flashes.splice(i, 1);
    }
    // 光环
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (simT - r.start > r.dur) rings.splice(i, 1);
    }
    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (simT - p.start > p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.grav * lastDt / 1000;
      p.x += p.vx * lastDt / 1000;
      p.y += p.vy * lastDt / 1000;
    }
    // 飘字
    for (let i = floats.length - 1; i >= 0; i--) {
      if (simT - floats[i].start > floats[i].dur) floats.splice(i, 1);
    }
  }

  function drawFx() {
    // 光环
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
    // 闪白（覆盖格子）
    for (const f of flashes) {
      const p = (simT - f.start) / f.dur;
      ctx.globalAlpha = 0.85 * (1 - p);
      ctx.fillStyle = f.color;
      ctx.fillRect(f.tx * TILE, f.ty * TILE, TILE, TILE);
    }
    // 粒子
    for (const p of particles) {
      const age = simT - p.start;
      const k = 1 - age / p.life;
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size * (1 + Math.min(1.2, Math.abs(p.vy) / 220)));
    }
    // 飘字（弹跳缩放 + 缓出上升）
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

  // ---------- 场景光影 ----------
  function drawCarpet(map) {
    if (lastFloor !== 5) return;
    ctx.save();
    for (let y = 1; y < SIZE; y++) {
      for (let x = 4; x <= 6; x++) {
        if (map[y][x] === '#') continue;
        const edge = x === 4 || x === 6;
        const g = ctx.createLinearGradient(x * TILE, 0, (x + 1) * TILE, 0);
        g.addColorStop(0, edge ? 'rgba(110,24,30,0.55)' : 'rgba(86,18,24,0.40)');
        g.addColorStop(0.5, edge ? 'rgba(150,34,40,0.5)' : 'rgba(112,24,30,0.36)');
        g.addColorStop(1, edge ? 'rgba(110,24,30,0.55)' : 'rgba(86,18,24,0.40)');
        ctx.fillStyle = g;
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        if (edge) {
          ctx.fillStyle = 'rgba(200,160,80,0.22)';
          ctx.fillRect(x * TILE + (x === 4 ? 0 : TILE - 1), y * TILE, 1, TILE);
        }
      }
    }
    ctx.restore();
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

  function drawLighting() {
    const mood = FLOOR_MOOD[lastFloor] || 0.24;
    const cx = disp.x * TILE + TILE / 2;
    const cy = disp.y * TILE + TILE / 2;
    const r0 = TILE * 0.7;
    const r1 = Math.max(r0 + TILE, TILE * (3.9 - mood * 3.2));
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, 'rgba(4,6,10,0)');
    g.addColorStop(0.55, `rgba(4,6,10,${(mood * 0.5).toFixed(3)})`);
    g.addColorStop(1, `rgba(3,5,9,${mood})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TILE * SIZE, TILE * SIZE);
  }

  function drawTorches() {
    if (!torchList.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of torchList) {
      const fl = 0.8 + Math.sin(simT / 150 + tr.seed) * 0.14 + Math.sin(simT / 47 + tr.seed) * 0.06;
      // 火焰落在靠近地面的那一侧
      const fx = tr.x * TILE + TILE / 2 + (tr.sx || 0) * TILE * 0.34;
      const fy = tr.y * TILE + TILE / 2 + (tr.sy || 0) * TILE * 0.34;
      const R = TILE * 1.7 * fl;
      const g = ctx.createRadialGradient(fx, fy, 1, fx, fy, R);
      g.addColorStop(0, 'rgba(255,196,120,0.34)');
      g.addColorStop(0.4, 'rgba(255,150,70,0.12)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, R, 0, Math.PI * 2);
      ctx.fill();
      // 灯托
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(38,30,24,0.9)';
      ctx.fillRect(fx - TILE * 0.035, fy + TILE * 0.02, TILE * 0.07, TILE * 0.16);
      ctx.globalCompositeOperation = 'lighter';
      // 火焰
      const fg = ctx.createRadialGradient(fx, fy, 1, fx, fy, TILE * 0.16);
      fg.addColorStop(0, 'rgba(255,240,190,0.95)');
      fg.addColorStop(0.5, 'rgba(255,170,80,' + (0.55 + fl * 0.2).toFixed(2) + ')');
      fg.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(fx, fy - TILE * 0.02, TILE * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBeam() {
    if (lastFloor !== 5) return;
    const x0 = 5 * TILE;
    const g = ctx.createLinearGradient(0, 0, 0, TILE * 4.2);
    g.addColorStop(0, 'rgba(255,240,200,0.15)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 + TILE * 0.18, 0);
    ctx.lineTo(x0 + TILE * 0.82, 0);
    ctx.lineTo(x0 + TILE * 1.5, TILE * 4.2);
    ctx.lineTo(x0 - TILE * 0.5, TILE * 4.2);
    ctx.closePath();
    ctx.fill();
  }

  function drawTargetMarker() {
    if (!targetMarker) return;
    const p = ((performance.now() - targetMarker.start) % 900) / 900;
    const a = 0.35 + 0.35 * (1 - p);
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

  // ---------- 主绘制 ----------
  let lastDt = 16;
  let lastNow = 0;

  function draw(state, t) {
    if (!state) return;
    const now = performance.now();
    lastDt = Math.min(50, now - (lastNow || now));
    lastNow = now;

    // 冻结（hit-stop）：simT 停走
    if (now >= freezeUntil) {
      simT += lastDt;
    }

    // 楼层切换 → 重置氛围与显示坐标
    if (state.floor !== lastFloor) {
      setAmbient(state.floor, state.maps[state.floor]);
      disp.x = state.x;
      disp.y = state.y;
    }

    updateFx(now);
    const tt = simT;

    ctx.clearRect(0, 0, TILE * SIZE, TILE * SIZE);
    ctx.save();

    // 屏幕震动（真实时间驱动，衰减）
    if (now < shakeUntil) {
      const remain = (shakeUntil - now) / shakeDur;
      const k = TILE * 0.05 * shakeMag / 6 * remain * remain;
      ctx.translate((Math.random() - 0.5) * 2 * k, (Math.random() - 0.5) * 2 * k);
    }

    // 地图
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = state.maps[state.floor][y][x];
        const px = x * TILE;
        const py = y * TILE;
        drawFloor(px, py, x, y);
        if (ch === '#') drawWall(px, py);
        else if (ch === 'y' || ch === 'r') drawDoor(ch, px, py);
        else if (ch === 'u' || ch === 'n') drawStairs(ch, px, py);
        else if (D.monsters[ch]) drawMonster(ch, px, py, tt);
        else if (ch === 'M') {
          ctx.fillStyle = 'rgba(120,255,170,0.08)';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          drawEmoji('🏪', px, py, 0.56);
        } else if (ch === 'T') {
          glow('rgba(255,240,150,0.5)', TILE * 0.5);
          drawEmoji('👸', px, py, 0.66);
          noGlow();
        } else if (ch === 'J') {
          glow('rgba(200,160,255,0.4)', TILE * 0.4);
          drawEmoji('📜', px, py + Math.sin(tt / 500) * TILE * 0.03, 0.58);
          noGlow();
        } else if (D.items[ch] || ch === '$') drawItem(ch, px, py, tt);
      }
    }

    // 王座层红毯（在实体之下）
    drawCarpet(state.maps[state.floor]);

    // 氛围粒子在角色层下
    updateAmbient(lastDt, now);
    drawAmbientOverlay();
    drawTargetMarker();

    // 玩家（平滑跟随 + 挤压拉伸）
    const k = 1 - Math.pow(0.0008, lastDt / 1000);
    disp._tx = state.x;
    disp._ty = state.y;
    disp.x += (state.x - disp.x) * k;
    disp.y += (state.y - disp.y) * k;
    if (Math.abs(state.x - disp.x) < 0.02) disp.x = state.x;
    if (Math.abs(state.y - disp.y) < 0.02) disp.y = state.y;
    drawPlayer(disp.x * TILE, disp.y * TILE, tt);

    // 光照：越往上越暗，火把透出暖光
    drawLighting();
    drawTorches();
    drawBeam();
    drawBadges(state);

    drawFx();

    // 全屏白脉冲
    const pp = (now - pulseStart) / 420;
    if (pp >= 0 && pp < 1) {
      ctx.fillStyle = `rgba(255,244,214,${(0.75 * (1 - pp)).toFixed(3)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    // 换层淡入
    if (now < fadeUntil) {
      const p = (fadeUntil - now) / 260;
      ctx.fillStyle = `rgba(5,7,12,${Math.min(1, p)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    ctx.restore();
  }

  window.Renderer = {
    init, layout, draw,
    addFloat, shake, fade, getTile: () => TILE,
    freeze, pulse, flashTile, ring, burst, setAmbient, setTarget,
  };
})();
