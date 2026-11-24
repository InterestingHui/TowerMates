// TowerMates · 今日一塔：日期键 + 每日种子（纯函数，浏览器 / Node 共用，不依赖 DOM）
// 同一台设备、同一天、任何人打开「今日一塔」拿到的都是同一座塔（同一份地图换位 / 同一串路遇 /
// 同一句 Boss 台词），所以「今天谁走得远」是可比的；跨天自动换种子，明天又是一座新塔。
// 「今日之约」再多一层：每条日期还钉一条固定誓约（`vowOf`），同一天所有人守同一条 → 榜单仍然可比，
// 跨天难度不同 → 这座塔不再只是换皮。地图那一层只决定「看到什么」，一个数值都不动；
// 难度变化全部来自誓约——那是**已经模拟过、已经打通过**的规则，不引入新的平衡面。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Daily = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const DAY = 86400000;
  const pad2 = (n) => (n < 10 ? '0' : '') + n;

  // 本地日期键（YYYY-MM-DD）：按玩家自己的「今天」算，不跟服务器时区走
  function keyOf(d) {
    const t = d instanceof Date ? d : new Date(typeof d === 'number' ? d : Date.now());
    if (isNaN(t.getTime())) return keyOf(Date.now());
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  }

  // FNV-1a 32 位：同键必同种子、不同日期必不同种子；0 留给「原版布局」，1 起步
  function seedOf(key) {
    const s = String(key == null ? '' : key);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) | 0;
    }
    const v = Math.abs(h) % 2147483646;
    return v + 1;
  }

  // 面板上的短标签：2026-11-14 → 11月14日
  function label(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key == null ? '' : key));
    if (!m) return '';
    return `${Number(m[2])}月${Number(m[3])}日`;
  }

  function isToday(key, now) {
    return key === keyOf(now === undefined ? Date.now() : now);
  }

  // 结算时的日签：只有仍是「今天」才留下。
  // 日签是**开局**落档的，23:59 开今日一塔、00:05 结算的那局带的是昨天的键——
  // 榜单「今日」档按今天的键筛，那局既进不了今天、也回不到昨天，等于榜上凭空少一局，
  // 而玩家只会读成「我打了今日一塔，榜上却没有我」。过期就按普通局记账（判据全库只此一处，
  // 胜局落榜与败局上报都走它）。
  function tagAtSettle(key, now) {
    const k = String(key == null ? '' : key);
    if (!k) return '';
    return isToday(k, now) ? k : '';
  }

  // 今日之约：日期种子挑一条基础誓约。
  // 池子只有不需要余烬解锁的四条——不能把「还没解锁的规则」塞给玩家当今日任务；
  // 苦行(10 余烬)/无名(20 余烬) 因此不在池内。难度按 reward 升序：无誓 2 < 慈悲 3 < 贪婪 5 < 铁壁 12。
  const VOW_POOL = ['none', 'mercy', 'greed', 'guard'];
  function vowOf(key) {
    const s = seedOf(key);
    return VOW_POOL[s % VOW_POOL.length];
  }

  return { keyOf, seedOf, label, isToday, tagAtSettle, vowOf, VOW_POOL, DAY };
});
