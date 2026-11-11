// TowerMates · 微信小游戏环境桥接（可选，H5 下自动降级为空实现）
// 主域不能直读好友托管数据：真正的排行榜由开放数据域绘制到 sharedCanvas。
// 这里负责三件事：上报自己的分数、请求好友榜、接收开放数据域回传的好友影子。
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
      score: num(x && x.score),
      vow: clean(x && x.vow, 16) || 'none',
      ending: x && x.ending === 'true' ? 'true' : 'plain',
      floor: num(x && x.floor),
      steps: num(x && x.steps),
      grade: clean(x && x.grade, 1),
    })).filter((x) => x.score > 0);
  }

  const api = {
    available() { return !!(wx && typeof wx.setUserCloudStorage === 'function'); },
    // 通关/结算时上报：微信托管数据只收字符串
    submit(entry) {
      if (!this.available()) return false;
      try {
        wx.setUserCloudStorage({
          KVDataList: [
            { key: 'tm_score', value: String(num(entry && entry.score)) },
            { key: 'tm_vow', value: clean(entry && entry.vow, 16) || 'none' },
            { key: 'tm_ending', value: String((entry && entry.ending) || '') },
            { key: 'tm_grade', value: clean(entry && entry.grade, 1) },
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
        const k = x.name + '|' + x.score + '|' + x.vow;
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
