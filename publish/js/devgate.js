// TowerMates · 魔塔 —— 调试入口总门（v1）
// 为什么有这个小文件：`?ads=1` 原先只判查询串，于是在**上线域名**上也能把
// `Ads` 切到桩模式——死亡页真的会出现「看视频复活」，桩里 200ms 后直接回调成功，
// 等于无限免费复活 + 结算余烬翻倍（跨局货币，直接解锁誓约）。同理 `#demo=楼层,x,y`
// 能把人一步送到第 13 层，`?dev=1` / `?vow=full` 会绕过首局的教学裁剪。
// 现在这些入口一律要求「本地预览」：localhost / 127.0.0.1 / ::1 / file://。
// 线上域名（含各环境预览子域）下一律失效，玩家侧行为零变化。
// 注意：所有截图套件（tools/shot.html）、自检（ads-check / ui-check）、regress 闸门
// 都从本地 serve 跑，所以调试能力一点没少，只是搬进了本地。
(function () {
  const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]', ''];
  // 纯函数：只吃 hostname / protocol，方便单测直接喂假域名（浏览器里没法改 location.hostname）
  function local(hostname, protocol) {
    let h = hostname;
    let p = protocol;
    if (h === undefined) { try { h = location.hostname; } catch (e) { h = ''; } }
    if (p === undefined) { try { p = location.protocol; } catch (e) { p = ''; } }
    if (String(p) === 'file:') return true; // 本机双击打开 index.html 也算本地
    return LOCAL_HOSTS.indexOf(String(h || '').toLowerCase()) >= 0;
  }
  // ?name=1
  function has(name) {
    try { return new RegExp('[?&]' + name + '=1(&|$)').test(location.search); } catch (e) { return false; }
  }
  // 本地 + 带开关参数，才算「调试入口打开」
  function allow(name) { return local() && has(name); }
  // 任意正则形态的开关（?dev=1 / ?vow=full 这种一格里两个写法的）
  function allowMatch(re) { return local() && re.test((function () { try { return location.search; } catch (e) { return ''; } })()); }
  window.DevGate = { local, has, allow, allowMatch };
})();
