// TowerMates · 角色立绘剪影（SVG，零依赖）
// 半身剪影 + 统一右上 45° 暖 rim + 左下冷补光；情绪只改光色与眼神，不改构图。
// 四个锁匠（墨妖/魔王/钟妖/碑魔）各自独立轮廓——32px 纯黑下必须两两可分。
// 用法：Portraits.render('烛', 'warm') → HTML 字符串；无立绘的角色返回 ''。
(function () {
  const KEY = { 烛: 'candle', 炎魔: 'torch', 魔王: 'mowang', 薇拉: 'vera', 秤: 'scale', 墨妖: 'yan', 钟妖: 'duo', 碑魔: 'heng' };

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
    mowang: {
      base: '#ff7d7d',
      warm: '#ffb98f', sad: '#c07f7f', hard: '#ff5a4a', tired: '#9c8a86', firm: '#ff8f6b', calm: '#ff7d7d',
    },
    heng: {
      base: '#9fd8ff',
      warm: '#cfeaff', sad: '#7fa8c8', hard: '#7fb8e0', tired: '#9ab0c4', firm: '#bfe4ff', calm: '#9fd8ff',
    },
  };

  const INK = '#0a0d14';   // 主形
  const INK2 = '#05070c';  // 暗面（左下 / 内）
  const LIT = '#111722';   // 受光面（右上）
  const EDGE = '#1a2230';  // 最亮窄边（≤3px）

  const BODY = {
    // 烛：兜帽、佝偻、提灯（唯一横向突出物）
    candle: `
      <path class="pt-main" d="M60 46c-17 0-27 14-30 32l-7 72h74l-7-72c-3-18-13-32-30-32z" fill="${INK}"/>
      <path d="M60 46c-10 0-17 4-22 11 5 8 8 20 9 31l4 62H27l7-72c2-13 9-25 20-32z" fill="${INK2}"/>
      <path d="M78 62c8 9 11 23 12 40l2 48h-8l-2-47c-1-16-5-30-12-39z" fill="${LIT}"/>
      <path d="M33 104l50-1 .4 5-50 1z" fill="#03050a" opacity=".9"/>
      <circle cx="60" cy="106" r="1.7" fill="${INK2}"/>
      <path class="pt-main" d="M60 16c-14 0-23 11-23 25 0 12 7 20 16 23l7 3 7-3c9-3 16-11 16-23 0-14-9-25-23-25z" fill="${INK2}"/>
      <path d="M60 16c-8 0-14 4-18 10 4 6 6 12 7 19l5 12 4-2-2-14c-1-9 1-17 4-25z" fill="#03050a"/>
      <path d="M74 20c4 4 6 10 6 17 0 10-5 18-13 22l-2-3c6-5 9-12 9-20 0-6-1-12-3-16z" fill="${LIT}"/>
      <ellipse cx="60" cy="45" rx="13.5" ry="15.5" fill="#03050a"/>
      <path d="M41 78c-4 16-6 40-6 60" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="1.2"/>
      <ellipse cx="55" cy="44" rx="2.2" ry="1.6" fill="currentColor" opacity=".9"/>
      <ellipse cx="65" cy="44" rx="2.2" ry="1.6" fill="currentColor" opacity=".9"/>
      <path d="M85 80l7 17" stroke="${LIT}" stroke-width="5.6" stroke-linecap="round"/>
      <path d="M84 81l7 16" stroke="currentColor" stroke-opacity=".2" stroke-width="1.1" stroke-linecap="round"/>
      <rect x="83" y="95" width="19" height="25" rx="3.5" fill="${INK}" stroke="currentColor" stroke-opacity=".42" stroke-width="1.2"/>
      <circle cx="92.5" cy="107" r="11" fill="currentColor" opacity=".12"/>
      <circle cx="92.5" cy="107" r="5.2" fill="currentColor" opacity=".8"/>
      <!-- 灯笼罩条：让提灯在 68px 也读成「灯」，不是一个发光方块 -->
      <path d="M86 97v22M92.5 96v24M99 97v22" stroke="${INK2}" stroke-width="1" opacity=".85"/>
      <path d="M83 101h19M83 114h19" stroke="${INK2}" stroke-width="1" opacity=".6"/>
      <path d="M92.5 84c-4 4.5-4 8.5 0 10.5 4-2 4-6 0-10.5z" fill="currentColor" opacity=".62"/>
      <path d="M68 60c8 3 14 9 16 18" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="1.2"/>`,
    // 炎魔：宽肩 + 双角 + 胸口锈裂（非 Boss，常规怪）
    torch: `
      <path class="pt-main" d="M60 42c-25 0-41 19-45 45l-6 61h102l-6-61c-4-26-20-45-45-45z" fill="${INK}"/>
      <path d="M60 42c-13 0-23 5-31 15 6 12 9 28 10 45l3 46H15l6-61c4-26 20-45 45-45z" fill="${INK2}"/>
      <path d="M84 56c9 9 14 23 16 39l4 49h-9l-4-48c-2-16-7-30-15-39z" fill="${LIT}"/>
      <path class="pt-main" d="M60 17c-11 0-18 9-18 21 0 12 8 20 18 20s18-8 18-20c0-12-7-21-18-21z" fill="${INK2}"/>
      <path d="M60 17c-7 0-12 4-15 10 3 7 5 14 5 22l4 9h4l-2-13c0-11 1-21 4-28z" fill="#03050a"/>
      <path d="M72 20c3 4 5 10 5 17 0 9-4 16-10 20l-2-3c5-4 7-10 7-17 0-7-2-13-5-17z" fill="${LIT}"/>
      <path d="M45 25c-7-9-10-16-8-21 5 6 10 13 12 19z" fill="${INK}" stroke="currentColor" stroke-opacity=".34" stroke-width="1.2"/>
      <path d="M75 25c9-10 13-18 10-25-6 7-12 15-14 22z" fill="${INK}" stroke="currentColor" stroke-opacity=".34" stroke-width="1.2"/>
      <rect x="50" y="33" width="8.5" height="3.2" rx="1.6" fill="currentColor" opacity=".9"/>
      <rect x="61.5" y="33" width="8.5" height="3.2" rx="1.6" fill="currentColor" opacity=".9"/>
      <path d="M60 58l-6 20 9 8-8 18 6 16" fill="none" stroke="currentColor" stroke-opacity=".42" stroke-width="2"/>
      <path d="M60 58l12 14-6 18" fill="none" stroke="currentColor" stroke-opacity=".24" stroke-width="1.6"/>
      <path d="M18 96c12 8 26 10 42 10s30-2 42-10" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="2" stroke-dasharray="4 5"/>
      <path d="M24 62c-6 12-8 26-9 40" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="1.6"/>`,
    // 薇拉：垂瀑长发、宝石王冠、束腰长裙（外轮廓由长发定义）
    vera: `
      <path class="pt-main" d="M60 30c-24 0-36 20-37 44-1 26 2 48 6 66l10-2c-5-20-6-42-4-62l4-32z" fill="${INK2}"/>
      <path class="pt-main" d="M60 30c24 0 36 20 37 44 1 26-2 48-6 66l-10-2c5-20 6-42 4-62l-4-32z" fill="${INK2}"/>
      <path d="M34 92c-1 14-1 26 2 34 3 1 5 0 5-3-2-9-2-19-1-29z" fill="${INK2}"/>
      <path d="M84 34c13 6 20 22 21 40 1 24-2 46-6 64l-10-2c5-20 6-42 4-62l-3-31z" fill="${LIT}" opacity=".8"/>
      <path d="M36 46c-2 24-1 50 3 72" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/>
      <path d="M84 46c2 24 1 50-3 72" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.6"/>
      <path d="M60 74c-13 0-20 8-22 18l-7 48h58l-7-48c-2-10-9-18-22-18z" fill="${INK}"/>
      <path d="M46 78l-3 26M74 78l3 26" fill="none" stroke="currentColor" stroke-opacity=".26" stroke-width="1.5"/>
      <path d="M38 108c14 6 30 6 44 0" fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="1.4"/>
      <path d="M52 66h16v8c6 0 10 3 12 8l-20 4-20-4c2-5 6-8 12-8z" fill="${INK2}"/>
      <path d="M56 70c2.5 2 5.5 3 4 3s1.5-1 4-3" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>
      <ellipse cx="60" cy="44" rx="14" ry="15.5" fill="${INK}"/>
      <ellipse cx="60" cy="46.5" rx="10.5" ry="12" fill="#141824"/>
      <path d="M46 40c1-9 7-14 14-14s13 5 14 14c-4-5-8-7-11-6l1 4c-3-4-6-5-9-4l1 5c-3-3-6-3-10 1z" fill="${INK}"/>
      <path d="M50.5 42.5c1.6-1.6 4.4-1.8 6.2-.4" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.3" stroke-linecap="round"/>
      <path d="M63.3 42.1c1.8-1.4 4.6-1.2 6.2.4" fill="none" stroke="currentColor" stroke-opacity=".85" stroke-width="1.3" stroke-linecap="round"/>
      <ellipse cx="53.6" cy="45.4" rx="2.3" ry="2.6" fill="currentColor" opacity=".95"/>
      <ellipse cx="66.4" cy="45.4" rx="2.3" ry="2.6" fill="currentColor" opacity=".95"/>
      <circle cx="54.3" cy="44.5" r=".8" fill="#fff" opacity=".9"/>
      <circle cx="67.1" cy="44.5" r=".8" fill="#fff" opacity=".9"/>
      <path d="M60 48.5l-.9 2.2h1.8z" fill="currentColor" opacity=".4"/>
      <path d="M57.4 53.2c1.7 1.3 3.5 1.3 5.2 0" fill="none" stroke="#ff9bb4" stroke-opacity=".8" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="46.6" cy="48" r="1.1" fill="currentColor" opacity=".75"/>
      <circle cx="73.4" cy="48" r="1.1" fill="currentColor" opacity=".75"/>
      <path d="M47 31.5l4-11 5 7 4-13 4 13 5-7 4 11z" fill="none" stroke="currentColor" stroke-opacity=".9" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M60 20.5l2.6 4-2.6 4-2.6-4z" fill="currentColor" opacity=".85"/>
      <circle cx="51.5" cy="27.5" r="1.2" fill="currentColor" opacity=".7"/>
      <circle cx="68.5" cy="27.5" r="1.2" fill="currentColor" opacity=".7"/>
      <path d="M47 32l-2 8" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>
      <path d="M73 32l2 8" fill="none" stroke="currentColor" stroke-opacity=".4" stroke-width="1.2"/>`,
    // 秤：圆帽、货包、手提天平（唯一水平长线）
    scale: `
      <path class="pt-main" d="M60 44c-19 0-31 15-33 36l-4 54h74l-4-54c-2-21-14-36-33-36z" fill="${INK}"/>
      <path d="M60 44c-11 0-19 5-25 14 5 11 7 26 8 42l3 34H23l4-54c2-21 14-36 33-36z" fill="${INK2}"/>
      <path d="M84 56c7 8 11 20 12 34l4 44h-9l-4-43c-1-14-4-26-10-35z" fill="${LIT}"/>
      <path class="pt-main" d="M60 16c-12 0-17 8-17 16v2h34v-2c0-8-5-16-17-16z" fill="${INK2}"/>
      <ellipse cx="60" cy="34" rx="27" ry="6.5" fill="${INK2}"/>
      <ellipse cx="60" cy="45" rx="12.5" ry="13.5" fill="#03050a"/>
      <circle cx="55" cy="44" r="2" fill="currentColor" opacity=".85"/>
      <circle cx="65" cy="44" r="2" fill="currentColor" opacity=".85"/>
      <path d="M54 52h12" stroke="currentColor" stroke-opacity=".26" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M86 76c12 2 18 12 18 28v46H84V96c0-8-2-16 2-20z" fill="${INK2}"/>
      <path d="M86 78c8 4 12 12 13 22" fill="none" stroke="currentColor" stroke-opacity=".16" stroke-width="1.4"/>
      <path d="M36 86c-5 1-9 2-12 1" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M36 85c-5 1-9 2-12 1" stroke="currentColor" stroke-opacity=".18" stroke-width="1"/>
      <path d="M24 84v26" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6"/>
      <path d="M13 110h22" stroke="currentColor" stroke-opacity=".45" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M13 110l-5 10h10z" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2"/>
      <path d="M35 110l-5 10h10z" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.2"/>
      <circle cx="24" cy="84" r="2.6" fill="currentColor" opacity=".6"/>
      <path d="M33 118l54-2 .4 5-54 2z" fill="#03050a" opacity=".8"/>`,
    // 墨妖（第一章 Boss）：流线长袍、无硬边、墨滴垂坠；单钩子 = 左侧长袖
    yan: `
      <path class="pt-main" d="M60 20c-11 0-20 9-20 20 0 6 2 11 5 15-9 9-14 23-14 39 0 15 3 27 3 36 0 5-4 8-11 11 6 5 13 7 20 7 4 0 7 2 7 6 0-4 4-6 9-6 8 0 15-2 21-7-7-3-11-6-11-11 0-9 3-21 3-36 0-16-5-30-14-39 3-4 5-9 5-15 0-11-9-20-20-20z" fill="${INK}"/>
      <path d="M60 20c-8 0-15 5-18 12 3 3 5 8 6 13l4 18-8 22-4 34-3 10 8 4 6-52c2-16 5-30 9-39 2-7 2-14 0-22z" fill="${INK2}"/>
      <path d="M71 24c6 4 9 10 9 16 0 5-1 9-4 13 7 9 12 22 13 37l2 26-9-2-2-24c-1-15-5-27-12-36 3-4 4-8 4-13 0-6-1-12-1-17z" fill="${LIT}"/>
      <!-- 左袖：外轮廓唯一的大悬挂 -->
      <path d="M43 72c-9 6-15 17-18 30-2 9-2 16 1 20 5-3 9-9 12-17 3-9 5-19 5-33z" fill="${INK}"/>
      <path d="M43 72c-6 7-10 17-12 28 3-8 6-15 12-22z" fill="${INK2}"/>
      <!-- 下摆墨滴：三长两短 -->
      <path d="M47 128c-1 8-3 13-6 17 4 1 7 0 9-4z" fill="${INK}"/>
      <path d="M60 132c-1 7-2 12-4 16 3 1 6 0 7-4z" fill="${INK}"/>
      <path d="M71 128c0 8 1 13 4 17-4 1-6-1-7-5z" fill="${INK}"/>
      <path d="M55 127c0 5 0 8-1 11 3 1 5 0 5-3z" fill="${INK2}"/>
      <path d="M67 125c1 5 2 8 3 10-3 1-5 0-5-3z" fill="${INK2}"/>
      <!-- 眼：两点狭长光 -->
      <circle cx="53.5" cy="41" r="7" fill="currentColor" opacity=".1"/>
      <circle cx="66.5" cy="41" r="7" fill="currentColor" opacity=".1"/>
      <ellipse cx="53.5" cy="41" rx="2.5" ry="1.5" fill="currentColor" opacity="1"/>
      <ellipse cx="66.5" cy="41" rx="2.5" ry="1.5" fill="currentColor" opacity="1"/>
      <path d="M45 55c3-3 7-4 10-3" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width="1.2"/>`,
    // 钟妖（第三章 Boss）：钟形、下摆外扩、顶部挂环；单钩子 = 右侧垂链
    duo: `
      <path class="pt-main" d="M60 24c-11 0-20 8-22 19l-5 56c-9 4-15 9-15 15 0 6 7 9 16 10l52 0c9-1 16-4 16-10 0-6-6-11-15-15l-5-56c-2-11-11-19-22-19z" fill="${INK}"/>
      <path d="M60 24c-8 0-15 5-18 12l-6 60-14 9c-2 2-3 4-3 6l9 4 10-61c2-12 10-22 22-30z" fill="${INK2}"/>
      <path d="M73 26c7 4 11 10 12 17l5 56c6 3 11 6 13 9l-8-2-6-57c-1-10-7-19-16-23z" fill="${LIT}"/>
      <path d="M26 114c10 4 22 6 34 6s24-2 34-6c-1 8-4 12-8 13l-52 0c-4-1-7-5-8-13z" fill="${INK2}"/>
      <circle cx="60" cy="14" r="7.5" fill="none" stroke="${INK}" stroke-width="4.4"/>
      <circle cx="60" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-opacity=".26" stroke-width="1"/>
      <path d="M58 5c0-2.6 4-2.6 4 0v6h-4z" fill="${INK}"/>
      <path d="M78 68l-6 10 7 8-4 12" fill="none" stroke="${INK2}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M42 62h36M40 70h40" stroke="${INK2}" stroke-width="2" opacity=".85"/>
      <path d="M38 104h44" stroke="${LIT}" stroke-width="1" opacity=".5"/>
      <path d="M88 100c4 6 4 13 1 20" fill="none" stroke="${INK}" stroke-width="2.2"/>
      <circle cx="89" cy="104" r="1.8" fill="${INK}"/><circle cx="90" cy="112" r="1.8" fill="${INK}"/>
      <circle cx="54" cy="50" r="7.5" fill="currentColor" opacity=".1"/>
      <circle cx="66" cy="50" r="7.5" fill="currentColor" opacity=".1"/>
      <rect x="50" y="49" width="8" height="2.8" rx="1.4" fill="currentColor" opacity="1"/>
      <rect x="62" y="49" width="8" height="2.8" rx="1.4" fill="currentColor" opacity="1"/>`,
    // 魔王（第二章 Boss）：双角盔 + 钥匙剑 + 胸前挂锁；单钩子 = 左侧长剑
    mowang: `
      <path class="pt-main" d="M60 30c-9 0-16 6-18 15-8 4-15 10-18 20l-4 44-4 32 8 4 6-30 5 30 24 0 5-30 6 30 8-4-4-32-4-44c-3-10-10-16-18-20-2-9-9-15-18-15z" fill="${INK}"/>
      <path d="M60 30c-6 0-11 3-14 8 3 6 5 14 6 23l-6 44-6 35 8 3 6-30 6-32c1-18 2-36 0-51z" fill="${INK2}"/>
      <path d="M78 44c6 6 10 15 11 25l4 42 5 33-7 4-7-30-5-41c-1-12-2-24-1-33z" fill="${LIT}"/>
      <path class="pt-main" d="M60 14c-10 0-17 7-17 17 0 9 6 16 17 18 11-2 17-9 17-18 0-10-7-17-17-17z" fill="${INK2}"/>
      <path d="M48 22c-6-6-9-13-8-20 5 5 10 11 13 17z" fill="${INK}" stroke="currentColor" stroke-opacity=".28" stroke-width="1"/>
      <path d="M72 22c6-6 9-13 8-20-5 5-10 11-13 17z" fill="${INK}" stroke="currentColor" stroke-opacity=".28" stroke-width="1"/>
      <path d="M58 8l2-7 2 7z" fill="${INK}" stroke="currentColor" stroke-opacity=".22" stroke-width=".9"/>
      <circle cx="54" cy="30.5" r="7.5" fill="currentColor" opacity=".1"/>
      <circle cx="66" cy="30.5" r="7.5" fill="currentColor" opacity=".1"/>
      <rect x="50" y="29" width="8" height="3.4" rx="1.7" fill="currentColor" opacity="1"/>
      <rect x="62" y="29" width="8" height="3.4" rx="1.7" fill="currentColor" opacity="1"/>
      <!-- 钥匙剑：唯一直线突出物，与身体留 4px 负空间 -->
      <path d="M31 52l-8 80 6 1 8-80z" fill="${INK}"/>
      <path d="M18 62h25" stroke="${INK}" stroke-width="4.2" stroke-linecap="round"/>
      <path d="M31 44v14" stroke="${INK}" stroke-width="3.4"/>
      <circle cx="31" cy="43" r="2.6" fill="none" stroke="${INK}" stroke-width="1.8"/>
      <path d="M28 60l-4 62" stroke="${LIT}" stroke-width="1" opacity=".5"/>
      <!-- 胸前挂锁 ×5：近读彩蛋，32px 融进剪影 -->
      <circle cx="53" cy="70" r="2.6" fill="none" stroke="${INK2}" stroke-width="1.6"/>
      <circle cx="60" cy="74" r="2.6" fill="none" stroke="${INK2}" stroke-width="1.6"/>
      <circle cx="67" cy="70" r="2.6" fill="none" stroke="${INK2}" stroke-width="1.6"/>
      <circle cx="56" cy="82" r="2.4" fill="none" stroke="${INK2}" stroke-width="1.5"/>
      <circle cx="64" cy="82" r="2.4" fill="none" stroke="${INK2}" stroke-width="1.5"/>
      <path d="M52 66c6 2 10 1 16-1" fill="none" stroke="${INK2}" stroke-width="1.4"/>
      <path d="M30 93l60-4 .4 5-60 4z" fill="#03050a" opacity=".85"/>`,
    // 碑魔（第四章 Boss）：巨方块、无颈无腿、右肩崩口；单钩子 = 碑顶缺口
    heng: `
      <path class="pt-main" d="M28 134l-3-104 11-11 15 0 9-7 9 7 15 0 11 11-1 24-8 5 8 6-1 69-6 9-48 0z" fill="${INK}"/>
      <path d="M60 12l-9 7-15 0-11 11 3 104 8 9 24 0z" fill="${INK2}"/>
      <path d="M84 21l11 9-1 24-8 5 8 6-1 69-6 9h-7l1-122z" fill="${LIT}"/>
      <path d="M40 40l-4 26 7 5-5 22 6 9-3 26" fill="none" stroke="${INK2}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M76 34c-3 10-2 18 2 26" fill="none" stroke="#03050a" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M48 58h10M64 66h12M44 84h9" stroke="${INK2}" stroke-width="2" stroke-dasharray="3 2"/>
      <path d="M33 122c5-3 11-3 16 0-5 4-11 4-16 0z" fill="${LIT}" opacity=".5"/>
      <path d="M74 118c4-2 8-2 12 1-4 3-8 3-12-1z" fill="${LIT}" opacity=".4"/>
      <circle cx="50.5" cy="44.5" r="8" fill="currentColor" opacity=".1"/>
      <circle cx="68.5" cy="44.5" r="8" fill="currentColor" opacity=".1"/>
      <rect x="46" y="43" width="9" height="3" rx="1.5" fill="currentColor" opacity="1"/>
      <rect x="64" y="43" width="9" height="3" rx="1.5" fill="currentColor" opacity="1"/>
      <path d="M60 12l9 7-9 7-9-7z" fill="${INK2}" opacity=".6"/>`,
  };

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

  // 位图立绘（2026-11-13 接入）：assets/portraits/*.webp，640px 高、带透明通道。
  // 注意 KEY 里「炎魔」「魔王」都映射到 torch，所以位图必须按中文名（who）取，不能按 id。
  const IMG = {
    烛: 'candle', 炎魔: 'yanmo', 魔王: 'mowang', 薇拉: 'vera',
    秤: 'cheng', 墨妖: 'moyao', 钟妖: 'zhongyao', 碑魔: 'beimo',
  };

  // 四位锁匠：rim 2px + 眼神提亮（普通怪 1.2px）
  const BOSS = { 墨妖: 1, 魔王: 1, 钟妖: 1, 碑魔: 1 };

  // 每个 <svg> 用独立 id：同页可能同时存在 9 张立绘（对白 + 图鉴八格）
  let uid = 0;

  // 从主轮廓路径生成方向性 rim：暖光只留在右上，冷补只留在左下。
  // 用 gradient + mask 裁掉背光段，比手画 rim 更贴合真实轮廓，也不会穿模。
  function rimLayers(shape, boss, n) {
    const mains = [];
    shape.replace(/<path[^>]*class="pt-main"[^>]*>/g, (tag) => {
      const m = /\sd="([^"]+)"/.exec(tag);
      if (m) mains.push(m[1]);
      return tag;
    });
    if (!mains.length) return { defs: '', rim: '' };
    const w = boss ? 1.6 : 1.15;
    const o = boss ? 0.9 : 0.72;
    const lines = (color, width, op) => mains
      .map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${op}" stroke-linejoin="round"/>`)
      .join('');
    // 双层 mask 相乘（x 权重 × y 权重），得到真正的「右上 45°」而不是一条斜线
    const defs = `<defs>
      <linearGradient id="gx${n}" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".3" stop-color="#fff" stop-opacity=".04"/>
        <stop offset=".55" stop-color="#fff" stop-opacity=".4"/>
        <stop offset=".8" stop-color="#fff" stop-opacity=".95"/>
        <stop offset="1" stop-color="#fff" stop-opacity="1"/>
      </linearGradient>
      <linearGradient id="gy${n}" x1="0" y1="150" x2="0" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".26" stop-color="#fff" stop-opacity=".1"/>
        <stop offset=".55" stop-color="#fff" stop-opacity=".55"/>
        <stop offset=".8" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="1"/>
      </linearGradient>
      <linearGradient id="gc${n}" x1="0" y1="150" x2="64" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" stop-opacity=".85"/>
        <stop offset=".2" stop-color="#fff" stop-opacity=".4"/>
        <stop offset=".42" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask id="mx${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="150">
        <rect width="120" height="150" fill="url(#gx${n})"/>
      </mask>
      <mask id="my${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="150">
        <rect width="120" height="150" fill="url(#gy${n})"/>
      </mask>
      <mask id="mc${n}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="150">
        <rect width="120" height="150" fill="url(#gc${n})"/>
      </mask>
    </defs>`;
    const rim = `<g class="pt-rim pt-rim-warm" mask="url(#mx${n})"><g mask="url(#my${n})">${lines('#e8c46a', w, o)}</g></g>
        <g class="pt-rim pt-rim-cold" mask="url(#mc${n})">${lines('#9fd8ff', 1.1, 0.24)}</g>`;
    return { defs, rim };
  }

  function render(who, mood, variant, size) {
    const id = KEY[who];
    if (!id) return '';
    let color = colorOf(id, mood);
    let shape = BODY[id];
    if (variant === 'veiled' && id === 'vera' && BODY.veraVeiled) {
      shape = BODY.veraVeiled;
      color = (COLORS_VEILED[mood] || COLORS_VEILED.base);
    }
    const n = ++uid;
    const rim = rimLayers(shape, !!BOSS[who], n);
    const svg = `<svg class="pt-svg pt-fallback" viewBox="0 0 120 150" aria-hidden="true">
          ${rim.defs}
          <g class="pt-shape">${shape}</g>
          ${rim.rim}
        </svg>`;
    const imgName = IMG[who];
    // 默认走 SVG：对白槽只有 68–84px，位图细节不可见反而更糊。
    // 只有显式传 size='lg'（Boss 出场 / 图鉴大图等 ≥200px 的场合）才用位图，失败自动回落 SVG。
    const useImg = imgName && size === 'lg';
    const media = useImg
      ? `<img class="pt-img" src="assets/portraits/${imgName}.webp" alt="${who}" draggable="false"
             onerror="this.classList.add('is-fail')">${svg}`
      : svg;
    return `<div class="pt" data-char="${id}" data-mood="${mood || 'calm'}" style="color:${color}">
        <div class="pt-aura"></div>
        ${media}
      </div>`;
  }

  window.Portraits = { render, has: (who) => !!KEY[who], hasRaster: (who) => !!IMG[who] };
})();
