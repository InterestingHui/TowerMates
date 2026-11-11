// TowerMates · 触屏手势 v2
// 两种意图并存：
//   快滑（按下后很快划出）→ 走一格，连续快滑可连走（老行为）
//   按住不动 / 慢拖     → 在落点格子浮出「方向圆盘」，往一边拖预览那条路，松手走它
// 鼠标不受影响：仍是点击寻路。独立模块，自己找画布、自己判断遮罩。
(function () {
  const THRESHOLD = 26;   // 快滑触发一格的最小距离（CSS 像素）
  const HOLD_MS = 220;    // 按住多久进入「选路」模式
  const STEP_GAP = 105;   // 连续快滑两格之间的最小间隔
  const HOT_DEAD = 12;    // 圆盘死区：拖回圆心附近恢复默认路线
  const DIR_NAMES = ['up', 'down', 'left', 'right'];
  const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  function direction(dx, dy, threshold) {
    const t = threshold || THRESHOLD;
    if (Math.sqrt(dx * dx + dy * dy) < t) return null;
    return Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? dirs.right : dirs.left)
      : (dy > 0 ? dirs.down : dirs.up);
  }
  function dirName(d) {
    if (!d) return null;
    return d[1] === -1 ? 'up' : d[1] === 1 ? 'down' : d[0] === 1 ? 'right' : 'left';
  }

  // 一条候选路线的完整格子序列（Engine.pathsTo 已把分岔前的公共段拼好）
  function fullCells(routes, name) {
    const r = routes && routes[name];
    if (!r || !r.cells) return null;
    return r.cells.slice();
  }

  const api = { direction, dirName, fullCells, THRESHOLD, STEP_GAP, HOLD_MS, attach };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.TouchGestures = api;

  function attach(canvas, act, hooks) {
    if (!canvas || typeof act !== 'function') return false;
    canvas.style.touchAction = 'none';  // 交给我们处理，避免页面跟着滚/缩放
    let press = null;        // { id, sx, sy, tx, ty, t, steps }
    let pad = null;          // 圆盘圆心（画布 CSS 坐标）
    let mode = 'idle';       // idle | press | swipe | route
    let routes = null;       // Engine.pathsTo 结果（hooks.open 给出）
    let hotDir = null;       // 当前选中的方向
    let holdTimer = 0;
    let lastStep = 0;
    let suppressClick = false;

    function covered() {
      // 任何全屏遮罩（含开始页、对白、战斗、结算）打开时不接收手势
      return !!document.querySelector('.overlay.show');
    }
    function renderer() { return (typeof window !== 'undefined') ? window.Renderer : null; }
    function clearPreview() {
      const R = renderer();
      if (R) {
        if (typeof R.setRoutePreview === 'function') R.setRoutePreview(null);
        R.setTarget(null);
      }
      routes = null;
      hotDir = null;
      pad = null;
    }

    // 按当前 hotDir 刷新预览（圆盘 + 各候选路线的点串）
    function updatePreview() {
      const R = renderer();
      if (!routes || !R || typeof R.setRoutePreview !== 'function') return;
      const TILE = (typeof R.getTile === 'function') ? R.getTile() : 48;
      const W = TILE * 11;
      const RAD = TILE * 1.42;
      const cx = Math.max(RAD + 4, Math.min(W - RAD - 4, pad ? pad.x : W / 2));
      const cy = Math.max(RAD + 4, Math.min(W - RAD - 4, pad ? pad.y : W / 2));
      const now = performance.now();
      const avail = {};
      const groups = [];
      let hotIdx = -1;
      DIR_NAMES.forEach((d) => { if (routes[d]) avail[d] = true; });
      DIR_NAMES.forEach((d, i) => {
        if (!routes[d]) return;
        const cells = fullCells(routes, d);
        if (!cells) return;
        if (d === hotDir) hotIdx = groups.length;
        groups.push({ pts: cells, start: now + i * 240 });
      });
      R.setRoutePreview({ pad: true, cx, cy, radius: RAD, dirs: avail, hot: hotDir, cells: groups, hotIdx });
    }

    // 进入选路模式：圆盘 + 候选路线铺底，默认路线先亮着
    function enterRoute() {
      if (!hooks || typeof hooks.open !== 'function') return false;
      routes = hooks.open(press ? press.tx : 5, press ? press.ty : 5);
      if (!routes) return false;
      mode = 'route';
      hotDir = routes.defaultDir || DIR_NAMES.find((d) => routes[d]) || null;
      const R = renderer();
      if (R) R.setTarget(routes.tx != null ? routes.tx : (press ? press.tx : 5), routes.ty != null ? routes.ty : (press ? press.ty : 5));
      updatePreview();
      return true;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || covered()) return;
      if (press) return; // 已有一根手指在处理
      const rect = canvas.getBoundingClientRect();
      const size = rect.width / 11;
      const tx = Math.floor((e.clientX - rect.left) / size);
      const ty = Math.floor((e.clientY - rect.top) / size);
      if (tx < 0 || ty < 0 || tx > 10 || ty > 10) return;
      press = {
        id: e.pointerId, sx: e.clientX, sy: e.clientY,
        tx, ty, t: performance.now(), steps: 0,
      };
      pad = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      mode = 'press';
      holdTimer = setTimeout(() => {
        if (press && mode === 'press') enterRoute();
      }, HOLD_MS);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!press || e.pointerId !== press.id || covered()) return;
      const dx = e.clientX - press.sx;
      const dy = e.clientY - press.sy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (mode === 'route') {
        // 圆盘锚定在按下点不跟着漂；拖动只负责选方向
        // 拖回圆心附近恢复默认；拖向没有路的方向则保持原选中
        if (dist < HOT_DEAD) {
          if (routes.defaultDir && routes[routes.defaultDir]) hotDir = routes.defaultDir;
        } else {
          const name = dirName(direction(dx, dy, HOT_DEAD * 1.2));
          if (name && routes[name] && name !== hotDir) {
            hotDir = name;
            updatePreview();
          }
        }
        return;
      }

      if (mode === 'swipe') {
        const d = direction(dx, dy);
        if (!d) return;
        const now = performance.now();
        if (now - lastStep < STEP_GAP) return;
        lastStep = now;
        suppressClick = true;
        press.sx = e.clientX;
        press.sy = e.clientY;
        act(d[0], d[1]);
        return;
      }

      // mode === 'press'：还没定性。拖出阈值时看是否已过按住时限
      if (dist < THRESHOLD) return;
      clearTimeout(holdTimer);
      if (performance.now() - press.t >= HOLD_MS) {
        // 按住之后的慢拖：进选路模式（定时器多半已触发，这里兜底）
        if (enterRoute()) return;
        mode = 'idle';
        return;
      }
      // 快滑：走一格并进入连滑模式
      const d = direction(dx, dy);
      if (!d) return;
      mode = 'swipe';
      lastStep = performance.now();
      suppressClick = true;
      press.steps++;
      press.sx = e.clientX;
      press.sy = e.clientY;
      act(d[0], d[1]);
    });

    const end = (e) => {
      if (!press || (e && e.pointerId !== press.id)) return;
      clearTimeout(holdTimer);
      const wasRoute = mode === 'route';
      const dragDist = press ? Math.sqrt(Math.pow(e.clientX - press.sx, 2) + Math.pow(e.clientY - press.sy, 2)) : 0;
      const pickDir = hotDir;
      const tx = press.tx;
      const ty = press.ty;
      const rts = routes;
      press = null;
      mode = 'idle';
      clearPreview();
      if (wasRoute) {
        // 选路模式吞掉这次手势：别让浏览器补发的 click 再走一次默认寻路
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 80);
        // 按住但没拖（原地松手）= 取消，不走路
        if (dragDist >= HOT_DEAD && rts && pickDir && hooks && typeof hooks.pick === 'function' && !covered()) {
          hooks.pick(tx, ty, rts, pickDir);
        }
      }
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

    // 调试/截图：不派发真实指针事件也能摆出「圆盘 + 路线」画面（挂在 api 上供外部调用）
    api.__debugRoute = function (tx, ty, dir, px, py) {
      press = { id: -1, sx: 0, sy: 0, tx, ty, t: performance.now(), steps: 0 };
      pad = (px != null && py != null) ? { x: px, y: py } : null;
      mode = 'press';
      if (!enterRoute()) { press = null; mode = 'idle'; return 'no-route'; }
      if (dir && routes[dir]) { hotDir = dir; updatePreview(); }
      return { junction: routes.junction, hot: hotDir,
        avail: DIR_NAMES.filter((d) => !!routes[d]),
        lens: DIR_NAMES.reduce((o, d) => { if (routes[d]) o[d] = routes[d].path.length; return o; }, {}) };
    };
    api.__releaseRoute = function () {
      const was = { mode, hot: hotDir, routes };
      press = null;
      mode = 'idle';
      clearPreview();
      return was.mode === 'route' ? { was: 'route', hot: was.hot } : null;
    };
    return true;
  }

  // 调试入口在 attach 成功后才可用；未 attach 前是占位
  api.__debugRoute = null;
  api.__releaseRoute = null;

  function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(function () {
    const canvas = document.getElementById('game');
    const tm = window.__tm;
    const hooks = window.__tmRouteHooks || (tm && tm.routeHooks);
    if (canvas && tm && typeof tm.act === 'function') {
      attach(canvas, tm.act, hooks);
    }
  });
})();
