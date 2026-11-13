// TowerMates · 今日一塔：日期键 + 每日种子（纯函数，浏览器 / Node 共用，不依赖 DOM）
// 同一台设备、同一天、任何人打开「今日一塔」拿到的都是同一座塔（同一份地图换位 / 同一串路遇 /
// 同一句 Boss 台词），所以「今天谁走得远」是可比的；跨天自动换种子，明天又是一座新塔。
// 只决定「看到什么」，不碰任何数值——难度与平衡读数和普通局完全一致。
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

  // 距离下一座塔（本地零点）还有多久：给面板写「还 N 小时 N 分」用
  function msLeft(key, now) {
    const t = typeof now === 'number' ? now : Date.now();
    if (!isToday(key, t)) return 0;
    const d = new Date(t);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    return Math.max(0, next - t);
  }

  return { keyOf, seedOf, label, isToday, msLeft, DAY };
});
