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

    const origBoard = tm.openBoard;
    tm.openBoard = function () {
      const r = origBoard.apply(this, arguments);
      try { B.request(); } catch (e) {}
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
