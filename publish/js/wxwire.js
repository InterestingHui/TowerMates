// TowerMates · 把关系链桥接挂到现有流程上（H5 下静默空转）
// 结算 → 上报这一局的层数/用时/塔印；打开榜单 → 请开放数据域画好友榜；
// 若宿主支持回传，好友影子写进「贴码进榜」用的同一份存储，名录自然多出几行。
(function () {
  function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    const tm = window.__tm;
    const B = window.WXBridge;
    if (!tm || !B) return;

    const origEnd = tm.showEnd;
    tm.showEnd = function () {
      const r = origEnd.apply(this, arguments);
      try { if (tm.lastRun) B.submit(tm.lastRun); } catch (e) { /* 上报失败不影响结算 */ }
      return r;
    };

    // 好友榜贴图：子域把榜画进 sharedCanvas，主域每帧把它当图片贴到面板里的 canvas 上。
    // H5 没有 wx/sharedCanvas → 整块保持 hidden，玩家看到的就是原来的挑战码榜。
    function sharedCanvasOf() {
      const wx = window.wx;
      if (!wx || typeof wx.getOpenDataContext !== 'function') return null;
      try {
        const odc = wx.getOpenDataContext();
        if (odc && odc.canvas) return odc.canvas;
      } catch (e) {}
      // 部分基础库只暴露全局 sharedCanvas
      return typeof window.sharedCanvas !== 'undefined' ? window.sharedCanvas : null;
    }

    function mountWxBoard() {
      const wrap = document.getElementById('wxBoardWrap');
      const cv = document.getElementById('wxBoard');
      if (!wrap || !cv) return false;
      const shared = sharedCanvasOf();
      if (!shared) { wrap.hidden = true; return false; }
      wrap.hidden = false;
      // 面板里按实际宽度贴，避免拉伸；高度固定 420 与子域绘制比例对齐
      const w = Math.max(220, Math.round(wrap.clientWidth || 340));
      const h = 420;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      const ctx = cv.getContext('2d');
      if (!ctx) return false;
      const paint = () => {
        try {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(shared, 0, 0, w, h);
        } catch (e) { /* 子域还没画完时 drawImage 会空/抛错，忽略即可 */ }
      };
      paint();
      // 子域是异步取数据再画：多刷几帧收敛（好友榜不需要每帧重绘）
      let n = 0;
      const timer = setInterval(() => {
        paint();
        if (++n > 14) clearInterval(timer);
      }, 180);
      return true;
    }
    window.__tmWxBoard = mountWxBoard; // 供回归/联调直接触发

    const origBoard = tm.openBoard;
    tm.openBoard = function () {
      const r = origBoard.apply(this, arguments);
      try { B.request(); } catch (e) {}
      try { mountWxBoard(); } catch (e) {}
      return r;
    };

    B.onFriends(function (list) {
      if (!Array.isArray(list) || !list.length) return;
      try {
        const KEY = 'towermates_rivals';
        const mine = JSON.parse(localStorage.getItem(KEY) || '[]');
        const rows = list.map((x) => ({
          code: 'wx:' + x.name + ':' + x.floor + ':' + x.time,
          name: x.name,
          rival: true,
          ending: x.ending,
          floor: x.floor,
          level: 0,
          steps: x.steps,
          time: x.time,
          seal: x.seal,
          goals: x.goals,
          vow: x.vow,
        }));
        const seen = new Set();
        const all = rows.concat(mine).filter((x) => {
          if (seen.has(x.code)) return false;
          seen.add(x.code); return true;
        });
        localStorage.setItem(KEY, JSON.stringify(all.slice(0, 12)));
      } catch (e) { /* 无存储权限时忽略 */ }
    });
  });
})();
