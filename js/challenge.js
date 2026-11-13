// TowerMates · 挑战码：编解码纯函数（浏览器 / Node 共用，不依赖 DOM）
// v3 码带层数、用时、塔印与回响章数，朋友贴进自己的名录就能比「爬到多深、走得多快」。
// v5 再加一段今日一塔日签：贴进来的朋友码能判出「他走的是不是今天这座」，才进得了「今日」档。
// 结算分已取消：v2 码里的分数字段会被忽略，v1 老码照常能贴。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Challenge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PREFIX = 'TM5.';
  const PREFIX4 = 'TM4.';
  const PREFIX3 = 'TM3.';
  const isNode = typeof window === 'undefined' && typeof Buffer !== 'undefined';
  const SEAL_CODE = { clear: 'c', ward: 'w', name: 'n', rough: 'r' };
  const CODE_SEAL = { c: 'clear', w: 'ward', n: 'name', r: 'rough', S: 'clear', A: 'ward', B: 'name', C: 'rough' };
  const MARGIN_CODE = { S: 'S', A: 'A', B: 'B', C: 'C' };

  function b64encode(str) {
    if (isNode) return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(str) {
    if (isNode) return Buffer.from(str, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(str)));
  }
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0));
  const text = (v, n) => String(v == null ? '' : v).replace(/[<>&"']/g, '').slice(0, n);
  const base = (code, prefix) => {
    let b = code.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return b64decode(b).split('.');
  };

  // 日签在码里只占 8 位数字（20261114），比带横线短 2 个字符、也不用转义分隔符
  const dayCode = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v == null ? '' : v));
    return m ? m[1] + m[2] + m[3] : '';
  };
  const dayKey = (v) => {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text(v, 8));
    if (!m) return '';
    const mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return `${m[1]}-${m[2]}-${m[3]}`;
  };

  // 紧凑点分格式，码长约 50 字符：面板放得下、输入框也不会截断
  // v4 = v3 + 末段决战余裕（S/A/B/C，空表示那局没记录）
  // v5 = v4 + 再末段今日一塔日签（YYYYMMDD，普通局留空）
  function encode(sum) {
    const s = sum || {};
    const raw = [
      5,
      s.ending === 'true' ? 't' : 'p',
      text(s.vow || 'none', 16).replace(/\./g, ''),
      clamp(s.floor, 0, 99),
      clamp(s.level, 0, 99),
      clamp(s.steps, 0, 999999),
      clamp(s.time, 0, 999999),
      SEAL_CODE[s.seal] || '',
      clamp(s.goals, 0, 99),
      MARGIN_CODE[s.margin] || '',
      dayCode(s.daily),
    ].join('.');
    return PREFIX + b64encode(raw)
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function decode(code) {
    const raw = String(code == null ? '' : code).trim().replace(/\s+/g, '');
    if (!raw || raw.length > 400) return null;
    try {
      // v5：v4 + 第 11 段今日一塔日签
      if (raw.indexOf(PREFIX) === 0) {
        const p = base(raw, PREFIX);
        if (p.length !== 11 || Number(p[0]) !== 5) return null;
        return {
          version: 5, legacy: false,
          ending: p[1] === 't' ? 'true' : 'plain',
          vow: text(p[2], 16) || 'none',
          floor: clamp(p[3], 0, 99), level: clamp(p[4], 0, 99),
          steps: clamp(p[5], 0, 999999), time: clamp(p[6], 0, 999999),
          seal: CODE_SEAL[text(p[7], 1)] || '', goals: clamp(p[8], 0, 99),
          margin: MARGIN_CODE[text(p[9], 1)] || '', daily: dayKey(p[10]),
        };
      }
      // v4：v3 + 第 10 段决战余裕（S/A/B/C）；没有日签，按普通局处理
      if (raw.indexOf(PREFIX4) === 0) {
        const p = base(raw, PREFIX4);
        if (p.length !== 10 || Number(p[0]) !== 4) return null;
        return {
          version: 4, legacy: false,
          ending: p[1] === 't' ? 'true' : 'plain',
          vow: text(p[2], 16) || 'none',
          floor: clamp(p[3], 0, 99), level: clamp(p[4], 0, 99),
          steps: clamp(p[5], 0, 999999), time: clamp(p[6], 0, 999999),
          seal: CODE_SEAL[text(p[7], 1)] || '', goals: clamp(p[8], 0, 99),
          margin: MARGIN_CODE[text(p[9], 1)] || '', daily: '',
        };
      }
      // v3：塔印 + 回响章数（旧码里的塔规数按 0 处理，不影响展示）
      if (raw.indexOf(PREFIX3) === 0) {
        const p = base(raw, PREFIX3);
        if (p.length !== 9 || Number(p[0]) !== 3) return null;
        return {
          version: 3, legacy: false,
          ending: p[1] === 't' ? 'true' : 'plain',
          vow: text(p[2], 16) || 'none',
          floor: clamp(p[3], 0, 99), level: clamp(p[4], 0, 99),
          steps: clamp(p[5], 0, 999999), time: clamp(p[6], 0, 999999),
          seal: CODE_SEAL[text(p[7], 1)] || '', goals: clamp(p[8], 0, 99),
          margin: '', daily: '',
        };
      }
      // v2 旧码：第 8 段是已废弃的结算分，直接忽略；第 9 段是 S/A/B/C，折算成塔印
      if (raw.indexOf('TM2.') === 0) {
        const p = base(raw, 'TM2.');
        if (p.length !== 9 || Number(p[0]) !== 2) return null;
        return {
          version: 2, legacy: true,
          ending: p[1] === 't' ? 'true' : 'plain',
          vow: text(p[2], 16) || 'none',
          floor: clamp(p[3], 0, 99), level: clamp(p[4], 0, 99),
          steps: clamp(p[5], 0, 999999), time: clamp(p[6], 0, 999999),
          seal: CODE_SEAL[text(p[8], 1)] || '', goals: 0, daily: '',
        };
      }
      // v1 旧码：base64("TM" + "0.floor.level.steps.time")
      let b = raw;
      while (b.length % 4) b += '=';
      const txt = b64decode(b);
      if (txt.indexOf('TM') !== 0) return null;
      const p = txt.slice(2).split('.').map(Number);
      if (p.length < 5 || p.some((n) => !isFinite(n))) return null;
      return {
        version: 1, legacy: true,
        ending: p[0] === 1 ? 'true' : 'plain',
        vow: 'none', floor: clamp(p[1], 0, 99), level: clamp(p[2], 0, 99),
        steps: clamp(p[3], 0, 999999), time: clamp(p[4], 0, 999999),
        seal: '', goals: 0, daily: '',
      };
    } catch (e) { return null; }
  }

  return { encode, decode, PREFIX, SEAL_CODE, CODE_SEAL };
});
