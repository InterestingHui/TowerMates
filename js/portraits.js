// TowerMates · 角色立绘剪影（SVG，零依赖）
// 半身剪影 + 边缘受光，情绪只改光色与眼神，不改构图。
// 用法：Portraits.render('烛', 'warm') → HTML 字符串；无立绘的角色返回 ''。
(function () {
  const KEY = { 烛: 'candle', 炬: 'torch', 魔王: 'torch', 薇拉: 'vera', 秤: 'scale', 砚: 'yan', 铎: 'duo', 衡: 'heng' };

  // 每个角色的基准光色 + 情绪偏移
  const COLORS = {
    candle: {
      base: '#9fd8ff',
      warm: '#ffd8a0', sad: '#6f9ec8', hard: '#cfd8e8', tired: '#93a6bd', firm: '#bfe4ff', calm: '#9fd8ff',
    },
    torch: {
      base: '#ff7d7d',
      warm: '#ffb98f', sad: '#c07f7f', hard: '#ff5a4a', tired: '#9c8a86', firm: '#ff8f6b', calm: '#ff7d7d',
    },
    vera: {
      base: '#ffc4e0',
      warm: '#ffd6c8', sad: '#c79bc0', hard: '#ff8fb0', tired: '#cba8bb', firm: '#ff9ec4', calm: '#ffc4e0',
    },
    scale: {
      base: '#e8c46a',
      warm: '#ffd88a', sad: '#c9b07a', hard: '#e0a85a', tired: '#b6a58a', firm: '#f0d08a', calm: '#e8c46a',
    },
    yan: {
      base: '#b9a6ff',
      warm: '#d8c9ff', sad: '#8d7fc0', hard: '#9a7bff', tired: '#a99cc4', firm: '#cbb8ff', calm: '#b9a6ff',
    },
    duo: {
      base: '#e8c46a',
      warm: '#ffd88a', sad: '#c9a96a', hard: '#ffb347', tired: '#b6a06a', firm: '#ffd27d', calm: '#e8c46a',
    },
    heng: {
      base: '#9fd8ff',
      warm: '#cfeaff', sad: '#7fa8c8', hard: '#7fb8e0', tired: '#9ab0c4', firm: '#bfe4ff', calm: '#9fd8ff',
    },
  };

  const INK = '#0a0d14';
  const INK2 = '#05070c';

  const BODY = {
    // 烛：兜帽、佝偻、提灯
    candle: `
      <path d="M60 46c-17 0-27 14-30 32l-7 72h74l-7-72c-3-18-13-32-30-32z" fill="${INK}"/>
      <path d="M60 16c-14 0-23 11-23 25 0 12 7 20 16 23l7 3 7-3c9-3 16-11 16-23 0-14-9-25-23-25z" fill="${INK2}"/>
      <ellipse cx="60" cy="45" rx="13.5" ry="15.5" fill="#03050a"/>
      <path d="M60 16c-14 0-23 11-23 25" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M41 78c-4 16-6 40-6 60" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.4"/>
      <ellipse cx="55" cy="44" rx="2.3" ry="1.7" fill="currentColor" opacity=".92"/>
      <ellipse cx="65" cy="44" rx="2.3" ry="1.7" fill="currentColor" opacity=".92"/>
      <path d="M85 80l7 17" stroke="${INK}" stroke-width="5.5" stroke-linecap="round"/>
      <rect x="83" y="95" width="19" height="25" rx="3.5" fill="${INK}" stroke="currentColor" stroke-opacity=".42" stroke-width="1.2"/>
      <circle cx="92.5" cy="107" r="11" fill="currentColor" opacity=".12"/>
      <circle cx="92.5" cy="107" r="5.2" fill="currentColor" opacity=".8"/>
      <path d="M92.5 84c-4 4.5-4 8.5 0 10.5 4-2 4-6 0-10.5z" fill="currentColor" opacity=".62"/>
      <path d="M68 60c8 3 14 9 16 18" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="1.2"/>`,
    // 炬：宽肩、双角、胸口锈裂
    torch: `
      <path d="M60 42c-25 0-41 19-45 45l-6 61h102l-6-61c-4-26-20-45-45-45z" fill="${INK}"/>
      <path d="M60 17c-11 0-18 9-18 21 0 12 8 20 18 20s18-8 18-20c0-12-7-21-18-21z" fill="${INK2}"/>
      <path d="M45 25c-9-10-13-18-10-25 6 7 12 15 14 22z" fill="${INK}" stroke="currentColor" stroke-opacity=".38" stroke-width="1.2"/>
      <path d="M75 25c9-10 13-18 10-25-6 7-12 15-14 22z" fill="${INK}" stroke="currentColor" stroke-opacity=".38" stroke-width="1.2"/>
      <rect x="50" y="33" width="8.5" height="3.2" rx="1.6" fill="currentColor" opacity=".9"/>
      <rect x="61.5" y="33" width="8.5" height="3.2" rx="1.6" fill="currentColor" opacity=".9"/>
      <path d="M60 58l-6 20 9 8-8 18 6 16" fill="none" stroke="currentColor" stroke-opacity=".48" stroke-width="2"/>
      <path d="M60 58l12 14-6 18" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.6"/>
      <path d="M18 96c12 8 26 10 42 10s30-2 42-10" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="2" stroke-dasharray="4 5"/>
      <path d="M24 62c-6 12-8 26-9 40" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="1.6"/>`,
    // 薇拉：长发、王冠、披风
    vera: `
      <path d="M60 62c-19 2-31 20-34 44l-5 44h78l-5-44c-3-24-15-42-34-44z" fill="${INK}"/>
      <path d="M38 40c-9 24-9 60-5 94h12c-4-30-3-58 0-74z" fill="${INK2}"/>
      <path d="M82 40c9 24 9 60 5 94H75c4-30 3-58 0-74z" fill="${INK2}"/>
      <ellipse cx="60" cy="44" rx="14.5" ry="16.5" fill="#06080d"/>
      <path d="M46 30l4-13 5 9 5-14 5 14 5-9 4 13z" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.8" stroke-linejoin="round"/>
      <ellipse cx="54.5" cy="45" rx="2.2" ry="1.7" fill="currentColor" opacity=".85"/>
      <ellipse cx="65.5" cy="45" rx="2.2" ry="1.7" fill="currentColor" opacity=".85"/>
      <path d="M56 52c2.5 1.6 5.5 1.6 8 0" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M40 44c-7 22-8 46-6 70" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.4"/>
      <path d="M80 44c7 22 8 46 6 70" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.4"/>
      <path d="M32 118c18 8 38 8 56 0" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="1.4"/>`,
    // 秤：圆帽、货包、手提秤
    scale: `
      <path d="M60 44c-19 0-31 15-33 36l-4 54h74l-4-54c-2-21-14-36-33-36z" fill="${INK}"/>
      <path d="M60 16c-12 0-17 8-17 16v2h34v-2c0-8-5-16-17-16z" fill="${INK2}"/>
      <ellipse cx="60" cy="34" rx="27" ry="6.5" fill="${INK2}"/>
      <ellipse cx="60" cy="45" rx="12.5" ry="13.5" fill="#06080d"/>
      <circle cx="55" cy="44" r="2" fill="currentColor" opacity=".85"/>
      <circle cx="65" cy="44" r="2" fill="currentColor" opacity=".85"/>
      <path d="M54 52h12" stroke="currentColor" stroke-opacity=".3" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M86 76c12 2 18 12 18 28v46H84V96c0-8-2-16 2-20z" fill="${INK2}"/>
      <path d="M86 78c8 4 12 12 13 22" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="1.4"/>
      <path d="M24 84v26" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6"/>
      <path d="M13 110h22" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M13 110l-5 10h10z" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2"/>
      <path d="M35 110l-5 10h10z" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2"/>
      <circle cx="24" cy="84" r="2.6" fill="currentColor" opacity=".6"/>`,
  };

  // 三位锁匠共用炬的剪影，只换光色：他们本来就是一炉里出来的
  BODY.yan = BODY.torch;
  BODY.duo = BODY.torch;
  BODY.heng = BODY.torch;

  function colorOf(id, mood) {
    const c = COLORS[id];
    if (!c) return '#9fd8ff';
    return c[mood] || c.base;
  }

  function render(who, mood) {
    const id = KEY[who];
    if (!id) return '';
    const color = colorOf(id, mood);
    return `<div class="pt" data-char="${id}" style="color:${color}">
        <div class="pt-aura"></div>
        <svg class="pt-svg" viewBox="0 0 120 150" aria-hidden="true">
          <g class="pt-shape">${BODY[id]}</g>
        </svg>
      </div>`;
  }

  window.Portraits = { render, has: (who) => !!KEY[who] };
})();
