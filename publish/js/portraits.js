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
    // 薇拉：精细立绘——垂瀑长发、宝石王冠、束腰长裙、睫毛与唇色
    vera: `
      <!-- 披在身后的长发（最底层） -->
      <path d="M60 30c-24 0-36 20-37 44-1 26 2 48 6 66l10-2c-5-20-6-42-4-62l4-32z" fill="${INK2}"/>
      <path d="M60 30c24 0 36 20 37 44 1 26-2 48-6 66l-10-2c5-20 6-42 4-62l-4-32z" fill="${INK2}"/>
      <path d="M36 46c-2 24-1 50 3 72" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/>
      <path d="M84 46c2 24 1 50-3 72" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/>
      <!-- 长裙：束腰 + 裙摆 + 裙褶 -->
      <path d="M60 74c-13 0-20 8-22 18l-7 48h58l-7-48c-2-10-9-18-22-18z" fill="${INK}"/>
      <path d="M46 78l-3 26M74 78l3 26" fill="none" stroke="currentColor" stroke-opacity=".28" stroke-width="1.5"/>
      <path d="M38 108c14 6 30 6 44 0" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="1.4"/>
      <!-- 肩颈与胸口 -->
      <path d="M52 66h16v8c6 0 10 3 12 8l-20 4-20-4c2-5 6-8 12-8z" fill="${INK2}"/>
      <path d="M56 70c2.5 2 5.5 3 4 3s1.5-1 4-3" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>
      <!-- 脸 -->
      <ellipse cx="60" cy="44" rx="14" ry="15.5" fill="#0a0d14"/>
      <ellipse cx="60" cy="46.5" rx="10.5" ry="12" fill="#141824"/>
      <!-- 刘海：中分两缕 -->
      <path d="M46 40c1-9 7-14 14-14s13 5 14 14c-4-5-8-7-11-6l1 4c-3-4-6-5-9-4l1 5c-3-3-6-3-10 1z" fill="${INK}"/>
      <!-- 眼睛：睫毛 + 高光 -->
      <path d="M50.5 42.5c1.6-1.6 4.4-1.8 6.2-.4" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M63.3 42.1c1.8-1.4 4.6-1.2 6.2.4" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="53.6" cy="45.4" rx="2.3" ry="2.6" fill="currentColor" opacity=".95"/>
      <ellipse cx="66.4" cy="45.4" rx="2.3" ry="2.6" fill="currentColor" opacity=".95"/>
      <circle cx="54.3" cy="44.5" r=".8" fill="#fff" opacity=".9"/>
      <circle cx="67.1" cy="44.5" r=".8" fill="#fff" opacity=".9"/>
      <!-- 鼻与唇 -->
      <path d="M60 48.5l-.9 2.2h1.8z" fill="currentColor" opacity=".4"/>
      <path d="M57.4 53.2c1.7 1.3 3.5 1.3 5.2 0" fill="none" stroke="#ff9bb4" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>
      <!-- 耳坠 -->
      <circle cx="46.6" cy="48" r="1.1" fill="currentColor" opacity=".75"/>
      <circle cx="73.4" cy="48" r="1.1" fill="currentColor" opacity=".75"/>
      <!-- 宝石王冠：三尖 + 中央菱形宝石 -->
      <path d="M47 31.5l4-11 5 7 4-13 4 13 5-7 4 11z" fill="none" stroke="currentColor" stroke-opacity=".9" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M60 20.5l2.6 4-2.6 4-2.6-4z" fill="currentColor" opacity=".85"/>
      <circle cx="51.5" cy="27.5" r="1.2" fill="currentColor" opacity=".7"/>
      <circle cx="68.5" cy="27.5" r="1.2" fill="currentColor" opacity=".7"/>
      <!-- 冠侧垂链 -->
      <path d="M47 32l-2 8" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>
      <path d="M73 32l2 8" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>`,
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

  // 薇拉的「锁中」形态：王冠换成垂纱，光色转雾紫冷调（plain 线对白用）
  // 做法：在标准立绘上叠一层半透明纱幕 + 换头饰，其余不动
  function veiledVera() {
    const base = BODY.vera
      // 摘掉王冠三尖与宝石（按路径起点特征整段裁掉）
      .replace(/<path d="M47 31\.5l4-11[^/]*\/>/, '')
      .replace(/<path d="M60 20\.5[^/]*\/>/, '')
      .replace(/<circle cx="51\.5" cy="27\.5"[^/]*\/>/, '')
      .replace(/<circle cx="68\.5" cy="27\.5"[^/]*\/>/, '');
    return base + `
      <!-- 头纱：从头顶垂到肩，边缘波浪 -->
      <path d="M43 34c0-10 8-17 17-17s17 7 17 17l3 26c-6 5-13 7-20 7s-14-2-20-7z" fill="currentColor" opacity=".14"/>
      <path d="M43 34c0-10 8-17 17-17s17 7 17 17" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.4"/>
      <path d="M43 34l-3 26c6 5 13 7 20 7" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.2"/>
      <path d="M77 34l3 26c-6 5-13 7-20 7" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.2"/>
      <!-- 纱下的额饰：一枚垂坠宝石 -->
      <path d="M60 36l2.4 3.6L60 43l-2.4-3.4z" fill="currentColor" opacity=".8"/>
      <path d="M60 43v4" stroke="currentColor" stroke-opacity=".5" stroke-width="1.1"/>`;
  }
  BODY.veraVeiled = veiledVera();

  function colorOf(id, mood) {
    const c = COLORS[id];
    if (!c) return '#9fd8ff';
    return c[mood] || c.base;
  }

  // veiled 用的冷调色板：锁里的薇拉更淡、更紫
  const COLORS_VEILED = {
    base: '#c9b8e8', calm: '#c9b8e8', sad: '#9d8cc4', hard: '#c794c9',
    tired: '#b0a2c4', firm: '#d4a8d8', warm: '#cab8d8',
  };

  function render(who, mood, variant) {
    const id = KEY[who];
    if (!id) return '';
    let color = colorOf(id, mood);
    let shape = BODY[id];
    if (variant === 'veiled' && id === 'vera' && BODY.veraVeiled) {
      shape = BODY.veraVeiled;
      color = (COLORS_VEILED[mood] || COLORS_VEILED.base);
    }
    return `<div class="pt" data-char="${id}" style="color:${color}">
        <div class="pt-aura"></div>
        <svg class="pt-svg" viewBox="0 0 120 150" aria-hidden="true">
          <g class="pt-shape">${shape}</g>
        </svg>
      </div>`;
  }

  window.Portraits = { render, has: (who) => !!KEY[who] };
})();
