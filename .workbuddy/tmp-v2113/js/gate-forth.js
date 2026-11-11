// TowerMates · 层阶之钥的一次性「往前开一层」入口
// 独立挂在跳层面板上：把代价（封印哪两件东西）写在按钮上，点两下才执行。
(function () {
  function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    const overlay = document.getElementById('gateOverlay');
    const list = document.getElementById('gateList');
    const Engine = window.Engine;
    if (!overlay || !list || !Engine || !Engine.gateForth) return;

    const style = document.createElement('style');
    style.textContent = `
      .gf-box { margin: 12px 0 2px; padding-top: 11px; border-top: 1px solid rgba(232,196,106,0.18); }
      .gf-btn { width: 100%; font-size: 12px; }
      .gf-btn:disabled { opacity: 0.42; cursor: default; }
      .gf-tip { font-size: 10.5px; line-height: 1.65; color: var(--dim); margin: 7px 0 0; }
      .gf-tip b { color: var(--gold); font-weight: 600; }
    `;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.className = 'gf-box';
    box.innerHTML = '<button class="btn gf-btn" id="gateForthBtn" type="button"></button><p class="gf-tip" id="gateForthTip"></p>';
    list.parentNode.insertBefore(box, list.nextSibling);
    const btn = box.querySelector('#gateForthBtn');
    const tip = box.querySelector('#gateForthTip');

    let armed = false, timer = null;
    function disarm() {
      clearTimeout(timer);
      armed = false;
      btn.classList.remove('armed');
      refresh();
    }
    function sealNames(r) {
      return r.seals && r.seals.length ? r.seals.map((p) => p.name).join('、') : '这一层没有可封的东西';
    }
    function refresh() {
      if (armed) return;
      const r = Engine.gateForth();
      if (r.ok) {
        btn.disabled = false;
        btn.textContent = `↥ 往前开一层 · 第 ${r.target + 1} 层（仅此一次）`;
        tip.innerHTML = `代价：封印 <b>${sealNames(r)}</b>，且跳过这一层之前的东西。点两次确认。`;
      } else {
        btn.disabled = true;
        btn.textContent = '↥ 往前开一层 · 已不可用';
        tip.textContent = r.msg || '这一次机会已经用掉了。';
      }
    }

    btn.addEventListener('click', () => {
      const r = Engine.gateForth();
      if (!r.ok) { disarm(); return; }
      if (!armed) {
        armed = true;
        btn.classList.add('armed');
        btn.textContent = `确认？将封印 ${sealNames(r)}`;
        timer = setTimeout(disarm, 4200);
        return;
      }
      disarm();
      const before = ((Engine.state().flags || {}).gateSeals || []).length;
      if (window.__tm && typeof window.__tm.jumpTo === 'function') window.__tm.jumpTo(r.target);
      const st = Engine.state();
      const seals = ((st && st.flags && st.flags.gateSeals) || []).slice(before);
      if (seals.length) {
        const logEl = document.getElementById('log');
        if (logEl) {
          const line = document.createElement('div');
          line.className = 'line gold';
          line.textContent = `层阶之钥往前开了一层 · 封住了${seals.map((x) => x.name).join('、')}`;
          logEl.appendChild(line);
          while (logEl.children.length > 7) logEl.removeChild(logEl.firstChild);
        }
      }
    });

    // 同步刷新：包装主流程的 openGate，避免等 MutationObserver 的微任务
    if (window.__tm && typeof window.__tm.openGate === 'function') {
      const origOpen = window.__tm.openGate;
      window.__tm.openGate = function () {
        const r = origOpen.apply(this, arguments);
        disarm();
        return r;
      };
    }
    // 其它打开方式（截图脚本、后续模块）兜底
    new MutationObserver(() => {
      if (overlay.classList.contains('show')) { disarm(); }
    }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    refresh();
  });
})();
