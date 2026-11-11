// TowerMates · 触屏手势：在画布上滑动走一格，连续滑动可连走
// 独立模块，自己找画布、自己判断遮罩；不改主流程，也不影响鼠标点击寻路。
(function () {
  const THRESHOLD = 26;   // 触发一格的最小滑动距离（CSS 像素）
  const STEP_GAP = 105;   // 连续滑动两格之间的最小间隔，防止一划穿过整层
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function direction(dx, dy, threshold) {
    const t = threshold || THRESHOLD;
    if (Math.sqrt(dx * dx + dy * dy) < t) return null;
    return Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? dirs.right : dirs.left)
      : (dy > 0 ? dirs.down : dirs.up);
  }

  const api = { direction, THRESHOLD, STEP_GAP, attach };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TouchGestures = api;

  function attach(canvas, act) {
    if (!canvas || typeof act !== 'function') return false;
    canvas.style.touchAction = 'none';  // 交给我们处理，避免页面跟着滚/缩放
    let start = null, lastStep = 0, suppressClick = false;

    function covered() {
      // 任何全屏遮罩（含开始页、对白、战斗、结算）打开时不接收手势
      return !!document.querySelector('.overlay.show');
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || covered()) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id || covered()) return;
      const d = direction(e.clientX - start.x, e.clientY - start.y);
      if (!d) return;
      const now = performance.now();
      if (now - lastStep < STEP_GAP) return;
      lastStep = now;
      suppressClick = true;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      act(d[0], d[1]);
    });
    const end = (e) => {
      if (!start || (e && e.pointerId !== start.id)) return;
      start = null;
      // 滑动结束后浏览器还会补一个 click，别让它再触发一次点击寻路
      setTimeout(() => { suppressClick = false; }, 80);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener('click', (e) => {
      if (!suppressClick) return;
      suppressClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    return true;
  }

  function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    const canvas = document.getElementById('game');
    const tm = window.__tm;
    if (canvas && tm && typeof tm.act === 'function') attach(canvas, tm.act);
  });
})();
