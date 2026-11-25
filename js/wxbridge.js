// TowerMates · 微信小游戏环境桥接（可选，H5 下自动降级为空实现）
// 主域不能直读好友托管数据：真正的排行榜由开放数据域绘制到 sharedCanvas。
// 这里负责三件事：上报这一局走到了哪、请求好友榜、接收开放数据域回传的好友影子。
// 非微信环境里，好友行改由「贴挑战码」注入，异步竞争的闭环不依赖平台。
(function () {
  const w = typeof window !== 'undefined' ? window : null;
  const wx = w && w.wx;
  const clean = (v, n) => String(v == null ? '' : v).replace(/[<>&"']/g, '').slice(0, n || 24);
  const num = (v) => Math.min(999999, Math.max(0, Number(v) || 0));
  // 今日一塔的日签（YYYY-MM-DD）。托管的键位多一个 tm_daily，好友行才进得了「今日」档；
  // 脏值一律清空而不是塞进榜里——一条乱码日签会把别人挤进一个不存在的日子。
  const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
  const dayKey = (v) => (DAY_RE.test(String(v == null ? '' : v)) ? String(v) : '');

  // 这里曾经有一份 `towermates_wx_friends` 缓存：onFriends / merge 都往里写，而唯一读者 `friends()`
  // 全仓零调用（好友行真正的落点是 wxwire 里那份 `towermates_rivals`）。每收到一批排行榜就往
  // localStorage 塞一份没人读的 JSON，占配额、让「存储里到底有什么」更难查 —— 11-25 收敛轮整块删掉。
  // 要恢复缓存，先给出读者；`code-test` 有一条守着「merge 不许再写存储」。

  function normalize(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 20).map((x) => ({
      name: clean(x && x.name, 16) || '塔友',
      floor: num(x && x.floor),
      time: num(x && x.time),
      steps: num(x && x.steps),
      vow: clean(x && x.vow, 16) || 'none',
      // 结局三态：'true' / 'plain' / ''（'' = 没走到塔顶）。旧实现把「不是真结局」一律补成 'plain'，
      // 于是死在第 4 层的好友在榜上写着「铁与霜」——托管数据没有这一位时不许替他编一个结局。
      ending: x && x.ending === 'true' ? 'true' : (x && x.ending === 'plain' ? 'plain' : ''),
      seal: clean(x && x.seal, 8),
      goals: num(x && x.goals), // 回响章数
      daily: dayKey(x && x.daily), // 今日一塔日签（普通局为空）
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
            // 日签：好友榜回的是托管数据，缺这一位时好友永远进不了「今日」档（两条社交线不相交）
            { key: 'tm_daily', value: dayKey(entry && entry.daily) },
            { key: 'tm_at', value: String(Date.now()) },
          ],
          fail() {},
        });
        return true;
      } catch (e) { return false; }
    },
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
          if (typeof cb === 'function') cb(list);
        });
        return true;
      } catch (e) { return false; }
    },
    // 供宿主/测试直接注入好友影子（等价于贴一批挑战码）：只去重这一批，不落存储
    merge(list) {
      const seen = new Set();
      return normalize(list).filter((x) => {
        const k = x.name + '|' + x.floor + '|' + x.time + '|' + x.vow;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
    },
    normalize,
  };

  if (w) w.WXBridge = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})();
