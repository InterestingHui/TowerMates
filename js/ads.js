// TowerMates · 激励视频广告位（IAA 通道）
// 提审前只留接口、不接 SDK：available() 恒 false → 两个卡点的按钮都不会出现，
// 玩家侧流程、平衡与评分零变化。接 SDK 时只改这个文件三处：
//   ① available()：判 wx.createRewardedVideoAd 是否可用（且已预加载成功）
//   ② show()：建实例 → ad.show() → onClose(res) 按 res.isEnded 回调
//   ③ 加失败重试与频控（同一卡点每日上限，EXP-01 H-02 只嵌卡点不做插屏/Banner）
// 挂着它的两处：死亡结算「从这一层重来」（main.js reviveFromAd）、
// 通关结算「余烬翻倍」（main.js adOfferDouble）。
(function () {
  const SLOTS = {
    revive: { unit: '', label: '从这一层重来' },
    ember: { unit: '', label: '这一局余烬翻倍' },
  };
  let enabled = false; // 接 SDK 前恒 false：线上永远不会出现按钮
  let mock = false;    // ?ads=1 打开，供截图与回归核对按钮位置、领奖流程
  const api = {
    SLOTS,
    available() { return enabled || mock; },
    // done(ok)：ok=true 表示看完（可以发奖）；false 表示没看完/不可用，流程照旧
    show(slot, done) {
      const cb = typeof done === 'function' ? done : function () {};
      if (!api.available() || !SLOTS[slot]) { cb(false); return; }
      if (mock) { setTimeout(() => cb(true), 200); return; } // 桩：真实实现走广告回调
      cb(false);
    },
    // 仅供开发/回归：显式调用才让按钮显形（同样只限本地预览，线上调不出东西）
    debug() {
      if (window.DevGate && !DevGate.local()) return false;
      mock = true;
      return true;
    },
    slots() { return Object.keys(SLOTS); },
  };
  window.Ads = api;
  // ?ads=1 只在本地预览（js/devgate.js）生效：上线域名上这个参数不再能打开桩模式，
  // 否则任何人都能免费复活 / 余烬翻倍。截图与广告自检都从本地 serve 跑，能力不受影响。
  try {
    if (window.DevGate ? DevGate.allow('ads') : false) mock = true;
  } catch (e) {}
})();
