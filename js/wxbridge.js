// TowerMates · 微信小游戏环境桥接（可选，H5 下自动降级为空实现）
// 主域不能直读好友托管数据：真正的排行榜由开放数据域绘制到 sharedCanvas。
// 这里负责三件事：上报这一局走到了哪、请求好友榜、接收开放数据域回传的好友影子。
// 非微信环境里，好友行改由「贴挑战码」注入，异步竞争的闭环不依赖平台。
(function () {
  const w = typeof window !== 'undefined' ? window : null;
  const wx = w && w.wx;
  const CACHE = 'towermates_wx_friends';
  const clean = (v, n) => String(v == null ? '' : v).replace(/[<>&"']/g, '').slice(0, n || 24);
  const num = (v) => Math.min(999999, Math.max(0, Number(v) || 0));

  function read() {
    try { return JSON.parse(localStorage.getItem(CACHE) || '[]'); } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(CACHE, JSON.stringify(list.slice(0, 20))); } catch (e) {}
  }
  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 20).map((x) => ({
      name: clean(x && x.name, 16) || '塔友',
      floor: num(x && x.floor),
      time: num(x && x.time),
      steps: num(x && x.steps),
      vow: clean(x && x.vow, 16) || 'none',
      ending: x && x.ending === 'true' ? 'true' : 'plain',
      seal: clean(x && x.seal, 8),
      goals: num(x && x.goals), // 回响章数
    })).filter((x) => x.floor > 0);
  }

  const api = {
    available() { return !!(wx && typeof wx.setUserCloudStorage === 'function'); },
    // 通关/结算时上报：微信托管数据只收字符串；比的是层数与用时，不是分数
    submit(entry) {
      if (!this.available()) return false;
      try {
        wx.setUserCloudStorage({
          KVDataList: [
            { key: 'tm_floor', value: String(num(entry && entry.floor)) },
            { key: 'tm_time', value: String(num(entry && entry.time)) },
            { key: 'tm_vow', value: clean(entry && entry.vow, 16) || 'none' },
            { key: 'tm_ending', value: String((entry && entry.ending) || '') },
            { key: 'tm_seal', value: clean(entry && entry.seal, 8) },
            { key: 'tm_goals', value: String(num(entry && entry.goals)) },
            { key: 'tm_at', value: String(Date.now()) },
          ],
          fail() {},
        });
        return true;
      } catch (e) { return false; }
    },
    friends() { return read(); },
    // 请开放数据域把好友托管数据画到 sharedCanvas；支持回传的宿主会把结果送回来
    request() {
      if (!wx || typeof wx.getOpenDataContext !== 'function') return false;
      try {
        wx.getOpenDataContext().postMessage({ type: 'tm_rank', at: Date.now() });
        return true;
      } catch (e) { return false; }
    },
    onFriends(cb) {
      if (!wx || typeof wx.onMessage !== 'function') return false;
      try {
        wx.onMessage((msg) => {
          if (!msg || msg.type !== 'tm_rank_result') return;
          const list = normalize(msg.friends);
          if (list.length) write(list);
          if (typeof cb === 'function') cb(list);
        });
        return true;
      } catch (e) { return false; }
    },
    // 供宿主/测试直接注入好友影子（等价于贴一批挑战码）
    merge(list) {
      const all = normalize(list).concat(read());
      const seen = new Set();
      const uniq = all.filter((x) => {
        const k = x.name + '|' + x.floor + '|' + x.time + '|' + x.vow;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      write(uniq);
      return uniq;
    },
    normalize,
  };

  if (w) w.WXBridge = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
