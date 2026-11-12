// TowerMates · 开放数据域（小游戏子域）：把好友的托管数据画成一张「塔友榜」
//
// 为什么必须在这里画：主域不允许直读好友托管数据（平台限制），只有子域能
// wx.getFriendCloudStorage，且子域不能碰 DOM、只能画到 sharedCanvas；
// 主域再把这个 canvas 当纹理贴到游戏画面上。
//
// 同一份代码也能在 H5 里跑（见 tools/opendata-check.html 注入假数据），
// 排版调完再进微信，不用每次真机试。
//
// 字段口径与 js/wxbridge.js 完全一致：tm_floor / tm_time / tm_vow / tm_ending / tm_seal / tm_goals
(function (root) {
  // 色板取 DESIGN-NOTES.md 的全局基底，子域没有 CSS 变量，只能硬编码同一批 hex
  const C = {
    ink: '#07090f', panel: '#111722', stone: '#2b3140',
    text: '#eaedf4', muted: '#8b93a5', dim: '#5d6577',
    gold: '#e8c46a', flame: '#ffd27d', cyan: '#9fd8ff', green: '#6fe3a0',
  };
  const FONT = '"PingFang SC", system-ui, -apple-system, "Microsoft YaHei", sans-serif';
  const SEAL_NAME = { clear: '破晓', ward: '守誓', name: '留名', rough: '折戟', fall: '折戟' };
  const VOW_NAME = { none: '不立誓', mercy: '慈悲', greed: '贪婪', guard: '铁壁', ascetic: '苦行', nameless: '无名' };

  const clean = (v, n) => String(v == null ? '' : v).replace(/[<>&"']/g, '').slice(0, n || 24);
  const num = (v) => Math.min(999999, Math.max(0, Number(v) || 0));

  // 两种输入都收：微信原始 [{nickname, KVDataList:[{key,value}]}] / 已解析的对象
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function (x) {
      if (!x || typeof x !== 'object') return null;
      const kv = {};
      if (Array.isArray(x.KVDataList)) {
        x.KVDataList.forEach(function (p) {
          if (p && p.key) kv[String(p.key).replace(/^tm_/, '')] = p.value;
        });
      }
      const pick = (k) => (kv[k] !== undefined ? kv[k] : x[k]);
      const row = {
        name: clean(x.nickname || x.name, 16) || '塔友',
        floor: num(pick('floor')),
        time: num(pick('time')),
        vow: clean(pick('vow'), 12) || 'none',
        ending: pick('ending') === 'true' ? 'true' : 'plain',
        seal: clean(pick('seal'), 8),
        goals: num(pick('goals')),
      };
      return row.floor > 0 ? row : null; // 没进过塔的名录不占榜位
    }).filter(Boolean).slice(0, 30);
  }

  // 排名口径与游戏内一致：先比爬到的高度（层数降序），同层比用时（升序）
  function sortRows(rows) {
    return rows.slice().sort(function (a, b) {
      if (b.floor !== a.floor) return b.floor - a.floor;
      if (a.time !== b.time) return a.time - b.time;
      return String(a.name).localeCompare(String(b.name));
    });
  }

  function fmtTime(t) {
    if (!t) return '—';
    return t >= 60 ? Math.floor(t / 60) + '分' + (t % 60) + '秒' : t + '秒';
  }

  // 主绘制：canvas 的 width/height 由调用方按 dpr 设好，这里只按逻辑尺寸画
  // opts: { w, h, dpr, loading, error, empty }
  function draw(canvas, rawRows, opts) {
    if (!canvas || !canvas.getContext) return null;
    const o = opts || {};
    const dpr = o.dpr || 1;
    const w = Math.round(o.w || 430);
    const h = Math.round(o.h || 620);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 底：竖向渐变更接近游戏内面板，避免大片死黑
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(17,23,34,0.98)');
    bg.addColorStop(1, 'rgba(7,9,15,0.98)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 标题
    ctx.textAlign = 'center';
    ctx.fillStyle = C.gold;
    ctx.font = '700 19px ' + FONT;
    ctx.fillText('塔 友 榜', w / 2, 44);
    ctx.fillStyle = C.dim;
    ctx.font = '11px ' + FONT;
    ctx.fillText('先比爬到的高度，同层比用时', w / 2, 64);
    ctx.strokeStyle = 'rgba(232,196,106,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, 76.5);
    ctx.lineTo(w - 28, 76.5);
    ctx.stroke();

    const rows = sortRows(normalize(rawRows));
    const top = 92;
    const rowH = 58;

    if (!rows.length) {
      const msg = o.error ? '好友榜没取回来' : o.loading ? '正在问塔里还有谁…' : '还没有塔友进塔';
      ctx.fillStyle = C.muted;
      ctx.font = '13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(msg, w / 2, top + 96);
      if (!o.loading && !o.error) {
        ctx.fillStyle = C.dim;
        ctx.font = '11.5px ' + FONT;
        ctx.fillText('把挑战码发给朋友，或等他先爬一趟', w / 2, top + 120);
      }
      return { rows: rows, shown: 0 };
    }

    const maxRows = Math.max(1, Math.floor((h - top - 34) / rowH));
    const shown = rows.slice(0, maxRows);
    ctx.textAlign = 'left';
    shown.forEach(function (r, i) {
      const y = top + i * rowH;
      const isTop3 = i < 3;
      // 行底：前三名淡淡金底，其余交替深底
      if (isTop3) {
        ctx.fillStyle = 'rgba(232,196,106,0.07)';
        ctx.fillRect(18, y, w - 36, rowH - 8);
      } else if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.022)';
        ctx.fillRect(18, y, w - 36, rowH - 8);
      }
      // 名次徽章
      const bx = 40, by = y + (rowH - 8) / 2;
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI * 2);
      ctx.fillStyle = isTop3 ? 'rgba(232,196,106,0.2)' : 'rgba(255,255,255,0.05)';
      ctx.fill();
      ctx.fillStyle = isTop3 ? C.flame : C.dim;
      ctx.font = '700 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), bx, by + 4);
      ctx.textAlign = 'left';

      // 名字（截断到 8 个字，避免撞到右侧数字）
      ctx.fillStyle = isTop3 ? C.text : '#c7cdda';
      ctx.font = '600 14px ' + FONT;
      const name = r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name;
      ctx.fillText(name, 60, y + 23);

      // 第二行：誓约 · 塔印（塔印只在有值时显示）
      const tags = [];
      if (r.vow && r.vow !== 'none') tags.push(VOW_NAME[r.vow] || r.vow);
      if (r.seal && SEAL_NAME[r.seal]) tags.push(SEAL_NAME[r.seal]);
      if (r.ending === 'true') tags.push('真结局');
      ctx.fillStyle = C.dim;
      ctx.font = '11px ' + FONT;
      ctx.fillText(tags.join(' · ') || '—', 60, y + 39);

      // 右侧：层数（主）/ 用时（次）
      ctx.textAlign = 'right';
      ctx.fillStyle = isTop3 ? C.gold : C.muted;
      ctx.font = '700 15px ' + FONT;
      ctx.fillText('第 ' + r.floor + ' 层', w - 22, y + 23);
      ctx.fillStyle = C.dim;
      ctx.font = '11px ' + FONT;
      ctx.fillText(fmtTime(r.time), w - 22, y + 39);
      ctx.textAlign = 'left';
    });

    if (rows.length > shown.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = C.dim;
      ctx.font = '11px ' + FONT;
      ctx.fillText('还有 ' + (rows.length - shown.length) + ' 位塔友', w / 2, h - 16);
    }
    return { rows: rows, shown: shown.length };
  }

  const api = { draw: draw, normalize: normalize, sortRows: sortRows, C: C };

  // ---- 微信子域自动启动：只有真正跑在子域里才挂（H5 调试时手动调 draw）----
  const wx = root.wx;
  const isSubDomain = !!(wx && typeof wx.onMessage === 'function' && root.sharedCanvas);
  if (isSubDomain) {
    let lastAt = 0;
    const paint = (rows, extra) => {
      const canvas = root.sharedCanvas;
      draw(canvas, rows, Object.assign({ w: canvas.width, h: canvas.height, dpr: 1 }, extra || {}));
    };
    paint([], { loading: true });
    wx.onMessage(function (msg) {
      if (!msg || msg.type !== 'tm_rank') return;
      const now = Date.now();
      if (now - lastAt < 800) return; // 连点开榜不重复打请求
      lastAt = now;
      paint([], { loading: true });
      wx.getFriendCloudStorage({
        keyList: ['tm_floor', 'tm_time', 'tm_vow', 'tm_ending', 'tm_seal', 'tm_goals'],
        success: function (res) { paint(res && res.data); },
        fail: function () { paint([], { error: true }); },
      });
    });
    // 子域拿不到主域尺寸，首帧按 sharedCanvas 当前尺寸画；主域 resize 后再发一次 tm_rank 即可
  }

  root.TMOpenData = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
