// TowerMates · 序章分镜场景（js/scenes.js，零依赖）
// 四幕纯 SVG 程序化画面，跟着 STORY.intro 的四行走：
//   0 abduct 魔王抓走薇拉（塔内王座厅，火盆暖光）
//   1 palace 国王授帕（王宫大厅，帕子是唯一亮色）
//   2 vow    灯下立誓（「我说：那我就做第一个」，烛光暖光）
//   3 door   天没亮推开塔门（海崖黑塔外观，门缝暖光）
// 风格约束见 assets/style-bibles/TowerMates.md §1/§4：
//   剪影优先 / 每屏一个暖光源 / 雾用径向+线性渐变（禁 blur）/ 无位图。
// 动画只用 transform/opacity（GPU 合成层），prefers-reduced-motion 下全部静止。
(function () {
  // ---- 共用色板（与圣经 §2 一致） ----
  const INK = '#05070c';    // 最暗剪影
  const INK2 = '#0a0d14';   // 次暗剪影
  const EDGE = '#1c2434';   // 剪影受光窄边
  const WARM = '#e8c46a';   // 亮黄铜
  const WARM_HI = '#ffe6a8'; // 高光金（被照亮的东西）
  const PAL = '#d6dbe6';    // 主文白（绣帕/星）
  const COLD = '#9fb8d8';   // 冷光

  // 每幕一个 <svg viewBox="0 0 430 900">，slice 铺满任意比例。
  // 底部 ~y>700 是对白框区域，只放雾和地面，不放关键内容。

  // ---------- 第一幕：王座厅（抓走） ----------
  const abduct = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scA-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#18202e"/><stop offset=".62" stop-color="#10151f"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <radialGradient id="scA-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".5"/><stop offset=".45" stop-color="${WARM}" stop-opacity=".16"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scA-vig" cx=".5" cy=".42" r=".75">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".6"/>
    </radialGradient>
    <linearGradient id="scA-shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLD}" stop-opacity=".10"/><stop offset="1" stop-color="${COLD}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scA-sky)"/>
  <!-- 高窗与冷光柱 -->
  <path d="M64 90 h34 v250 l-17 34 -17 -34 z" fill="#0c1220"/>
  <path d="M70 98 h22 v236 l-11 24 -11 -24 z" fill="url(#scA-shaft)"/>
  <path d="M332 120 h30 v220 l-15 30 -15 -30 z" fill="#0c1220"/>
  <path d="M338 128 h18 v206 l-9 22 -9 -22 z" fill="url(#scA-shaft)"/>
  <!-- 后墙暗层 -->
  <rect x="0" y="330" width="430" height="410" fill="#0d1320" opacity=".5"/>
  <!-- 地面 -->
  <rect x="0" y="738" width="430" height="162" fill="#06080f"/>
  <rect x="0" y="736" width="430" height="3" fill="${EDGE}" opacity=".35"/>
  <!-- 王座 -->
  <path d="M148 738 v-236 q0 -14 14 -14 h10 v-38 q0 -10 10 -10 h56 q10 0 10 10 v38 h10 q14 0 14 14 v236 z" fill="${INK}"/>
  <path d="M162 500 v-30 q0 -8 8 -8 h6 v-26 q0 -8 8 -8 h20" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity=".5"/>
  <!-- 魔王：坐姿剪影 + 双角 + 披风铺地 -->
  <g fill="${INK}">
    <path d="M186 262 q-20 -44 8 -66 q-4 22 10 38 q22 26 16 62 q-6 -20 -18 -26 q-12 -6 -16 -8 z"/>
    <path d="M244 262 q20 -44 -8 -66 q4 22 -10 38 q-22 26 -16 62 q6 -20 18 -26 q12 -6 16 -8 z"/>
    <path d="M215 300 q-26 0 -34 24 q-30 10 -38 52 q-10 56 6 130 q4 22 4 40 l14 6 q-6 -60 2 -108 q4 -26 16 -40 l36 -4 q26 6 40 34 q14 30 12 116 l14 -8 q6 -90 -6 -142 q-10 -44 -40 -56 q-8 -24 -26 -24 z"/>
    <path d="M175 556 q-28 44 -34 182 h148 q-8 -140 -34 -182 q-18 -22 -40 -22 q-22 0 -40 22 z"/>
  </g>
  <!-- 膝上：小薇拉被拢在披风里（只有裙摆露出来） -->
  <path d="M206 528 q14 -8 26 0 l6 34 q-20 10 -38 0 z" fill="${INK2}"/>
  <path d="M212 522 q7 -4 13 0 l2 10 q-8 4 -17 0 z" fill="${EDGE}" opacity=".55"/>
  <!-- 魔王受光窄边（右上 45°） -->
  <path d="M252 300 q26 8 34 52" fill="none" stroke="${EDGE}" stroke-width="1.6" opacity=".6"/>
  <!-- 薇拉的小脚印从门口进来（地上淡痕） -->
  <path d="M300 760 h56" stroke="${INK2}" stroke-width="2" opacity=".5"/>
  <!-- 火盆（本幕唯一暖光） -->
  <g>
    <ellipse cx="330" cy="690" rx="86" ry="86" fill="url(#scA-glow)"/>
    <path d="M318 706 l24 0 6 26 q-18 8 -36 0 z" fill="${INK}"/>
    <g class="sc-flick">
      <path d="M330 660 q-10 14 -4 26 q4 8 4 14 q10 -4 8 -16 q8 2 6 14 q10 -12 0 -28 q-6 -10 -14 -10 z" fill="${WARM}"/>
      <path d="M330 672 q-4 8 -1 14 q2 5 2 8 q5 -3 4 -9 q4 1 3 8 q5 -7 0 -15 q-4 -6 -8 -6 z" fill="${WARM_HI}"/>
    </g>
  </g>
  <!-- 雾两层（渐变，禁 blur） -->
  <ellipse class="sc-fog" cx="110" cy="700" rx="240" ry="60" fill="#151c2b" opacity=".5"/>
  <ellipse class="sc-fog2" cx="330" cy="760" rx="220" ry="48" fill="#100e1a" opacity=".45"/>
  <rect width="430" height="900" fill="url(#scA-vig)"/>
  </g>
</svg>`;

  // ---------- 第二幕：王宫授帕 ----------
  const palace = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scB-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151c29"/><stop offset=".6" stop-color="#0f141e"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <radialGradient id="scB-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${PAL}" stop-opacity=".30"/><stop offset=".5" stop-color="${PAL}" stop-opacity=".10"/><stop offset="1" stop-color="${PAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scB-vig" cx=".5" cy=".42" r=".75">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".6"/>
    </radialGradient>
    <linearGradient id="scB-shaft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLD}" stop-opacity=".09"/><stop offset="1" stop-color="${COLD}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scB-sky)"/>
  <!-- 大厅立柱 -->
  <rect x="18" y="60" width="34" height="700" fill="#0b101b"/>
  <rect x="50" y="60" width="4" height="700" fill="${EDGE}" opacity=".4"/>
  <rect x="378" y="60" width="34" height="700" fill="#0b101b"/>
  <rect x="374" y="60" width="4" height="700" fill="${EDGE}" opacity=".4"/>
  <!-- 残旧挂毯（缺角） -->
  <path d="M120 96 h74 v230 l-16 22 -12 -14 -14 18 -14 -16 -18 14 z" fill="#0c1120"/>
  <path d="M132 108 h50 v200" fill="none" stroke="${EDGE}" stroke-width="1" opacity=".35"/>
  <!-- 高窗冷光斜柱 -->
  <path d="M300 40 L430 40 L360 420 L260 420 z" fill="url(#scB-shaft)"/>
  <!-- 地面 -->
  <rect x="0" y="748" width="430" height="152" fill="#070a12"/>
  <rect x="0" y="746" width="430" height="3" fill="${EDGE}" opacity=".35"/>
  <!-- 国王：宽袍 + 锯齿冠，递帕的手臂伸向右侧 -->
  <g fill="${INK}">
    <path d="M150 470 l-9 -30 7 4 6 -14 7 12 8 -16 7 14 7 -12 6 14 7 -4 -9 32 z" transform="translate(-8 12)"/>
    <path d="M148 500 q-4 -22 20 -26 q26 -4 30 22 q4 26 -4 44 q30 10 44 30 l-8 12 q-22 -16 -40 -20 l-2 10 q24 8 40 26 l-6 10 q-24 -16 -44 -22 q-18 -6 -30 -2 q-20 8 -26 30 l-12 -4 q6 -30 24 -44 q-10 -30 6 -66 z"/>
    <path d="M130 596 q-20 40 -24 152 h96 q-2 -110 -22 -150 q-14 -18 -28 -16 q-14 2 -22 14 z"/>
  </g>
  <path d="M196 536 q30 8 44 26" fill="none" stroke="${EDGE}" stroke-width="1.5" opacity=".6"/>
  <!-- 绣帕（全屏唯一亮色焦点） -->
  <g class="sc-sway">
    <circle cx="242" cy="524" r="34" fill="url(#scB-glow)"/>
    <path d="M242 506 l16 18 -16 18 -16 -18 z" fill="${PAL}"/>
    <path d="M242 512 l10 12 -10 12 -10 -12 z" fill="#eef1f7" opacity=".8"/>
  </g>
  <!-- 勇者：小个、低头、单手前伸接帕，背剑 -->
  <g fill="${INK2}">
    <path d="M282 560 q-2 -16 14 -20 q16 -4 20 12 q4 16 -4 30 q16 8 24 24 l-10 8 q-14 -14 -26 -18 l-2 8 q14 6 22 18 l-8 8 q-16 -12 -30 -16 q-14 -4 -22 0 l-4 -10 q10 -6 20 -6 q-8 -16 6 -30 z"/>
    <path d="M272 622 q-14 34 -16 126 h72 q0 -90 -14 -124 q-10 -16 -21 -16 q-11 0 -21 14 z"/>
    <path d="M300 596 l16 -74 5 1 -12 76 z"/>
  </g>
  <path d="M296 566 q10 2 16 10" fill="none" stroke="${EDGE}" stroke-width="1.2" opacity=".5"/>
  <!-- 尘埃缓浮 -->
  <g fill="${PAL}" opacity=".14">
    <circle class="sc-fog" cx="150" cy="420" r="1.6"/>
    <circle cx="210" cy="360" r="1.2"/>
    <circle class="sc-fog2" cx="290" cy="470" r="1.5"/>
    <circle cx="250" cy="300" r="1"/>
  </g>
  <ellipse class="sc-fog" cx="120" cy="720" rx="240" ry="56" fill="#151c2b" opacity=".45"/>
  <ellipse class="sc-fog2" cx="320" cy="780" rx="220" ry="46" fill="#100e1a" opacity=".4"/>
  <rect width="430" height="900" fill="url(#scB-vig)"/>
  </g>
</svg>`;

  // ---------- 第三幕：灯下立誓 ----------
  const vow = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scC-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121824"/><stop offset=".6" stop-color="#0d1119"/><stop offset="1" stop-color="#090c13"/>
    </linearGradient>
    <radialGradient id="scC-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".55"/><stop offset=".45" stop-color="${WARM}" stop-opacity=".18"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scC-vig" cx=".5" cy=".42" r=".78">
      <stop offset=".5" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".62"/>
    </radialGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scC-sky)"/>
  <!-- 夜窗（冷环境光，极淡，不与烛争） -->
  <rect x="40" y="80" width="96" height="180" fill="#0c1422"/>
  <rect x="84" y="80" width="6" height="180" fill="${INK}"/>
  <rect x="40" y="166" width="96" height="6" fill="${INK}"/>
  <rect x="40" y="80" width="96" height="180" fill="none" stroke="#141c2c" stroke-width="3"/>
  <!-- 墙上圆盾（安静的 70%） -->
  <circle cx="290" cy="300" r="30" fill="#0a0e16"/>
  <circle cx="290" cy="300" r="30" fill="none" stroke="#141a26" stroke-width="3"/>
  <circle cx="290" cy="300" r="8" fill="#10151f"/>
  <!-- 桌与桌上物 -->
  <rect x="66" y="648" width="190" height="14" rx="3" fill="${INK}"/>
  <rect x="84" y="662" width="12" height="76" fill="${INK}"/>
  <rect x="224" y="662" width="12" height="76" fill="${INK}"/>
  <!-- 铁剑靠桌 -->
  <path d="M96 646 l26 -96 6 2 -22 96 z" fill="${INK2}"/>
  <path d="M116 570 l10 3 -3 9 -10 -3 z" fill="${INK}"/>
  <!-- 蜡烛（本幕唯一暖光） -->
  <g>
    <ellipse cx="150" cy="620" rx="88" ry="88" fill="url(#scC-glow)"/>
    <rect x="144" y="626" width="12" height="24" rx="2" fill="${INK}"/>
    <g class="sc-flick">
      <path d="M150 596 q-8 12 -3 22 q3 7 3 12 q9 -4 7 -14 q7 2 5 12 q9 -11 0 -25 q-5 -9 -12 -7 z" fill="${WARM}"/>
      <path d="M150 606 q-3 7 -1 12 q1 4 1 7 q4 -3 3 -8 q3 1 2 7 q4 -6 0 -13 q-3 -5 -5 -5 z" fill="${WARM_HI}"/>
    </g>
  </g>
  <!-- 勇者：立姿侧影，举帕对着烛光看 -->
  <g fill="${INK2}">
    <path d="M262 448 q-2 -18 15 -23 q18 -5 23 13 q5 18 -4 33 q4 4 6 10 l14 42 -10 5 -14 -38 q-10 -6 -20 -4 q-14 3 -20 16 l-11 -4 q7 -18 19 -26 q-6 -14 2 -24 z"/>
    <path d="M284 520 l-18 60 4 60 8 108 h14 l-2 -104 10 -58 14 56 10 -4 -16 -66 q-6 -22 -24 -20 z"/>
    <path d="M256 640 q-10 60 -6 108 h12 q-2 -50 6 -104 z"/>
  </g>
  <!-- 举起的绣帕（近烛，带暖边） -->
  <g class="sc-sway">
    <path d="M248 486 l13 14 -13 14 -13 -14 z" fill="${PAL}"/>
    <path d="M248 490 l8 10 -8 10 -8 -10 z" fill="#f4ecd8" opacity=".9"/>
    <path d="M236 498 h-6 M260 498 h6" stroke="${WARM_HI}" stroke-width="1.4" opacity=".6"/>
  </g>
  <path d="M272 470 q8 2 12 10" fill="none" stroke="${EDGE}" stroke-width="1.3" opacity=".55"/>
  <ellipse class="sc-fog2" cx="140" cy="800" rx="260" ry="52" fill="#100e1a" opacity=".42"/>
  <rect width="430" height="900" fill="url(#scC-vig)"/>
  </g>
</svg>`;

  // ---------- 第四幕：海崖塔门（黎明的第一道门缝光） ----------
  const door = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scD-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2636"/><stop offset=".55" stop-color="#141b28"/><stop offset=".8" stop-color="#10151f"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <linearGradient id="scD-hor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2e3a4e" stop-opacity="0"/><stop offset=".5" stop-color="#2e3a4e" stop-opacity=".38"/><stop offset="1" stop-color="#2e3a4e" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="scD-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".6"/><stop offset=".4" stop-color="${WARM}" stop-opacity=".2"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scD-vig" cx=".5" cy=".4" r=".8">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".58"/>
    </radialGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scD-sky)"/>
  <!-- 残星（黎明前正在退场） -->
  <g fill="${PAL}">
    <circle class="sc-tw" cx="52" cy="120" r="1.4" opacity=".5"/>
    <circle cx="120" cy="70" r="1" opacity=".3"/>
    <circle class="sc-tw" cx="200" cy="150" r="1.2" opacity=".4" style="animation-delay:1.2s"/>
    <circle cx="306" cy="90" r="1" opacity=".28"/>
    <circle class="sc-tw" cx="376" cy="180" r="1.3" opacity=".42" style="animation-delay:2.1s"/>
    <circle cx="86" cy="260" r="1" opacity=".2"/>
    <circle cx="350" cy="300" r="1.1" opacity=".22"/>
  </g>
  <!-- 海平线第一线天光（冷） -->
  <rect x="0" y="600" width="430" height="70" fill="url(#scD-hor)"/>
  <!-- 海 -->
  <rect x="0" y="672" width="430" height="228" fill="#070b12"/>
  <path d="M0 690 q60 -6 120 0 t120 0 t120 0 t70 0" fill="none" stroke="${EDGE}" stroke-width="1.2" opacity=".3"/>
  <path d="M0 726 q80 -5 150 0 t150 0 t130 0" fill="none" stroke="${EDGE}" stroke-width="1" opacity=".2"/>
  <!-- 海崖平台 -->
  <path d="M0 900 v-120 q90 -18 150 -12 l60 8 v-46 h226 v170 z" fill="${INK}"/>
  <!-- 黑塔（出顶格，压住画面右半） -->
  <path d="M196 730 v-560 q0 -170 20 -170 h6 q-14 60 -14 170 v560 z" fill="${EDGE}" opacity=".35"/>
  <path d="M200 900 v-560 q0 -340 8 -340 h120 q10 0 10 60 v840 z" fill="${INK}"/>
  <!-- 塔身砖缝（极少，近读彩蛋） -->
  <path d="M214 300 h116 M218 420 h112 M222 540 h108" stroke="#0d1420" stroke-width="2" opacity=".8"/>
  <path d="M330 200 v520 M338 340 v380" stroke="#0d1420" stroke-width="2" opacity=".6"/>
  <!-- 塔门（拱门 + 中缝暖光：全屏唯一暖光、唯一焦点） -->
  <path d="M228 730 v-116 q0 -34 29 -34 q29 0 29 34 v116 z" fill="#04060a"/>
  <ellipse class="sc-pulse" cx="257" cy="660" rx="96" ry="86" fill="url(#scD-glow)"/>
  <line class="sc-pulse" x1="257" y1="586" x2="257" y2="728" stroke="${WARM_HI}" stroke-width="2.6"/>
  <path d="M257 586 q-9 40 -7 88 q1 32 5 54 h6 q4 -24 5 -56 q2 -46 -9 -86 z" fill="${WARM_HI}" opacity=".85"/>
  <!-- 门内暖光洒在平台上 -->
  <path d="M228 730 l58 0 34 40 h-124 z" fill="${WARM}" opacity=".10"/>
  <!-- 勇者：小小剪影抵门 -->
  <g fill="${INK2}">
    <path d="M204 646 q-3 -14 11 -18 q15 -4 19 10 q3 13 -3 24 l16 4 -2 9 -18 -3 -4 8 6 60 h-10 l-5 -52 -6 0 -2 52 h-10 l3 -60 -6 -14 q-3 -10 1 -20 z" transform="rotate(-6 216 660)"/>
    <path d="M226 610 q8 -10 18 -6 q-6 10 -14 12 z"/>
  </g>
  <!-- 崖边雾带（两层对漂） -->
  <ellipse class="sc-fog" cx="90" cy="680" rx="230" ry="42" fill="#151c2b" opacity=".55"/>
  <ellipse class="sc-fog2" cx="330" cy="720" rx="220" ry="40" fill="#100e1a" opacity=".5"/>
  <ellipse class="sc-fog" cx="220" cy="820" rx="280" ry="56" fill="#0e131d" opacity=".5"/>
  <rect width="430" height="900" fill="url(#scD-vig)"/>
  </g>
</svg>`;

  // intro 四行 → 四幕
  const INTRO_SCENES = [abduct, palace, vow, door];
  let cur = null;   // 当前幕 id（含行号）
  let el = null;

  function node() {
    if (el && document.getElementById('dlgScene')) return el;
    el = document.getElementById('dlgScene');
    return el || null;
  }

  function paint(sceneId, svg) {
    const box = node();
    if (!box) return;
    cur = sceneId;
    // 摘 class → 换内容 → 强制 reflow → 挂回：动画同步重启，不依赖 rAF（headless 也确定）
    box.classList.remove('on');
    box.innerHTML = svg;
    void box.offsetWidth;
    box.classList.add('on');
  }

  function hide() {
    cur = null;
    const box = node();
    if (box) { box.classList.remove('on'); box.innerHTML = ''; }
    const ov = document.getElementById('dialogOverlay');
    if (ov) ov.classList.remove('scene-on');
  }

  // main.js 在 playStory / renderLine / closeDialog 三处调 sync：
  // t = typing（含 key 与 idx）；key 为 null（数组脚本/提示对白）一律隐藏。
  function sync(t) {
    const box = node();
    if (!box) return;
    const ov = document.getElementById('dialogOverlay');
    if (!t || t.key !== 'intro') { hide(); return; }
    const idx = Math.min(Math.max(t.idx | 0, 0), INTRO_SCENES.length - 1);
    const sceneId = 'intro' + idx;
    const ovOn = ov && ov.classList.contains('show');
    if (!ovOn) { hide(); return; }
    if (ov) ov.classList.add('scene-on');
    if (cur !== sceneId) paint(sceneId, INTRO_SCENES[idx]);
    else box.classList.add('on');
  }

  window.Scenes = { sync, hide };
})();
