// TowerMates · 挑战码：编解码纯函数（浏览器 / Node 共用，不依赖 DOM）
// v2 码里带上誓约、分数、评级，朋友贴进自己的榜单才能比同一条誓约下的分。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Challenge = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const PREFIX = 'TM2.';
  const isNode = typeof window === 'undefined' && typeof Buffer !== 'undefined';

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

  function encode(sum) {
    const s = sum || {};
    const payload = {
      v: 2,
      e: s.ending === 'true' ? 't' : s.ending === 'plain' ? 'p' : '',
      w: text(s.vow || 'none', 16),
      f: clamp(s.floor, 0, 99),
      l: clamp(s.level, 0, 99),
      k: clamp(s.steps, 0, 999999),
      t: clamp(s.time, 0, 999999),
      s: clamp(s.score, 0, 999999),
      g: text(s.grade || '', 1),
    };
    return PREFIX + b64encode(JSON.stringify(payload))
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function decode(code) {
    const raw = String(code == null ? '' : code).trim().replace(/\s+/g, '');
    if (!raw || raw.length > 400) return null;
    if (raw.indexOf(PREFIX) === 0) {
      try {
        let b = raw.slice(PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        const o = JSON.parse(b64decode(b));
        if (!o || o.v !== 2) return null;
        return {
          version: 2, legacy: false,
          ending: o.e === 't' ? 'true' : 'plain',
          vow: text(o.w || 'none', 16) || 'none',
          floor: clamp(o.f, 0, 99), level: clamp(o.l, 0, 99),
          steps: clamp(o.k, 0, 999999), time: clamp(o.t, 0, 999999),
          score: clamp(o.s, 0, 999999), grade: text(o.g || '', 1),
        };
      } catch (e) { return null; }
    }
    // v1 旧码：base64("TM" + "0.floor.level.steps.time")
    try {
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
        score: null, grade: '',
      };
    } catch (e) { return null; }
  }

  return { encode, decode, PREFIX };
});
