// TowerMates · 魔塔原型 —— Canvas 渲染
(function () {
  const D = window.GAME_DATA;
  const SIZE = 11;
  let canvas, ctx, TILE = 48, dpr = 1;
  const effects = [];
  let shakeUntil = 0;
  let fadeUntil = 0;

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

  function addFloat(text, x, y, color) {
    effects.push({ text, x, y, color, start: performance.now(), dur: 900 });
  }

  function shake(ms) {
    shakeUntil = performance.now() + (ms || 220);
  }

  function fade(ms) {
    fadeUntil = performance.now() + (ms || 260);
  }

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
  }

  function drawFloor(px, py, x, y) {
    ctx.fillStyle = (x + y) % 2 === 0 ? '#101521' : '#0e131e';
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
    const color = ch === 'y' ? ['#8a6a18', '#c9a23a'] : ch === 'b' ? ['#1d4a7a', '#3f87c9'] : ['#7a1f24', '#c94a52'];
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
    // 按道具类型给不同色调的光，避免 emoji 本身颜色误导（比如红药水画成绿色瓶子）
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
    drawEmoji(m.emoji, px, py + bob, m.boss ? 0.72 : 0.6);
  }

  function drawPlayer(px, py, t) {
    const bob = Math.sin(t / 380) * 2;
    const g = ctx.createRadialGradient(px + TILE / 2, py + TILE / 2, 1, px + TILE / 2, py + TILE / 2, TILE * 0.62);
    g.addColorStop(0, 'rgba(255,215,120,0.30)');
    g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.font = `${Math.floor(TILE * 0.62)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🧙', px + TILE / 2, py + TILE / 2 + bob);
  }

  function draw(state, t) {
    if (!state) return;
    const now = performance.now();
    ctx.clearRect(0, 0, TILE * SIZE, TILE * SIZE);
    ctx.save();

    if (now < shakeUntil) {
      const k = TILE * 0.06;
      ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    }

    // 地面 + 物件
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const ch = state.maps[state.floor][y][x];
        const px = x * TILE;
        const py = y * TILE;
        drawFloor(px, py, x, y);
        if (ch === '#') drawWall(px, py);
        else if (ch === 'y' || ch === 'b' || ch === 'r') drawDoor(ch, px, py);
        else if (ch === 'u' || ch === 'n') drawStairs(ch, px, py);
        else if (D.monsters[ch]) drawMonster(ch, px, py, t);
        else if (ch === 'M') {
          ctx.fillStyle = 'rgba(120,255,170,0.08)';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          drawEmoji('🏪', px, py, 0.56);
        } else if (ch === 'T') {
          glow('rgba(255,240,150,0.5)', TILE * 0.5);
          drawEmoji('👸', px, py, 0.66);
          noGlow();
        } else if (D.items[ch] || ch === '$') drawItem(ch, px, py, t);
      }
    }

    // 玩家
    drawPlayer(state.x * TILE, state.y * TILE, t);

    // 飘字
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const p = (now - e.start) / e.dur;
      if (p >= 1) {
        effects.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = e.color;
      ctx.font = `600 ${Math.floor(TILE * 0.36)}px "Microsoft YaHei",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.text, e.x, e.y - p * TILE * 0.9);
      ctx.globalAlpha = 1;
    }

    // 换层淡入
    if (now < fadeUntil) {
      const p = (fadeUntil - now) / 260;
      ctx.fillStyle = `rgba(5,7,12,${Math.min(1, p)})`;
      ctx.fillRect(-TILE, -TILE, TILE * (SIZE + 2), TILE * (SIZE + 2));
    }

    ctx.restore();
  }

  window.Renderer = { init, layout, draw, addFloat, shake, fade, getTile: () => TILE };
})();
