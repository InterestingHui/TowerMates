// TowerMates · 小程序壳（B 路线：web-view 嵌现有 H5）
// 这一层只做一件事：把已经上线的 H5 装进微信里，不改玩法、不改数值。
// 前置条件见 README.md —— 缺任何一个，这个壳都跑不起来。
App({
  onLaunch() {
    // 记录一次进入，便于后续判断「从微信来」的留存（埋点接自家统计时用）
    this.globalData.enterAt = Date.now();
  },
  globalData: { enterAt: 0 },
});
