// TowerMates · 序章分镜场景（js/scenes.js，零依赖）
// 四幕纯 SVG 程序化画面，跟着 STORY.intro 的四行走：
//   0 abduct 魔王抓走薇拉（塔内王座厅，火盆暖光）
//   1 palace 国王授帕（王宫大厅，帕子是唯一亮色）
//   2 vow    灯下立誓（「我说：那我就做第一个」，烛光暖光）
//   3 door   天没亮推开塔门（海崖黑塔外观，门缝暖光）
// 风格约束见 assets/style-bibles/TowerMates.md §1/§3.5/§4：
//   剪影优先 / 每屏一个暖光源 / 雾用径向+线性渐变（禁 blur）/ 无位图。
// 2026-11-20 全量重绘（用户裁定旧版「太丑」）——按圣经 §3.5 四层加法施工：
//   ① 形内 4 阶近黑分块（#05070c→#1a2230，硬边不渐变）；
//   ② 轮廓破口/撕边 6–10 处（上部密、腰腹疏、下摆密）；
//   ③ 双色 rim（暖金主、冷蓝补 ≤30%）；④ AO 接触阴影 + 近读彩蛋。
// 角色口径（用户 2026-11-20 拍板）：魔王要威风伶俐、公主漂亮端庄但显得可怜、
//   国王恳求动人、勇者上路的背影要帅气。
// 动画只用 transform/opacity（GPU 合成层），prefers-reduced-motion 下全部静止。
(function () {
  // ---- 共用色板（与圣经 §2 一致） ----
  const INK = '#05070c';    // 最暗剪影（躯干核心）
  const INK2 = '#0a0d14';   // 主形
  const LIT = '#111722';    // 受光面（右上）
  const EDGE = '#1a2230';   // 边缘高光面 / 结构亮一阶
  const WARM = '#e8c46a';   // 亮黄铜
  const WARM_HI = '#ffe6a8'; // 高光金（被照亮的东西）
  const PAL = '#d6dbe6';    // 主文白（绣帕/星）
  const COLD = '#9fb8d8';   // 冷光

  // 每幕一个 <svg viewBox="0 0 430 900">，slice 铺满任意比例。
  // 底部 ~y>700 是对白框区域，只放雾和地面，不放关键内容。

  // ---------- 第一幕：王座厅（抓走） ----------
  // 2026-11-20 重绘 v3：v2 的魔王还是一团黑斑、薇拉是悬空浅块。v3 按 §3.5 施工——
  // 魔王立姿（威风）：弯月双角外扬可读、宽肩披风大轮廓带撕口、单手前伸拎着薇拉（力量感）；
  // 薇拉（漂亮端庄+可怜）：完整小人形——垂发、束腰长裙、裙摆撕边、双手拢在胸前，
  //   被拎离地面（脚尖离地 + 裙摆下垂坠感），发间一圈微光当「王女」的身份符码；
  // 王座压亮一阶当背板，火盆仍是本幕唯一暖光。
  const abduct = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scA-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#18202e"/><stop offset=".62" stop-color="#10151f"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <linearGradient id="scA-thr" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#141c2a"/><stop offset="1" stop-color="#0a0e16"/>
    </linearGradient>
    <radialGradient id="scA-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".55"/><stop offset=".45" stop-color="${WARM}" stop-opacity=".16"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scA-vig" cx=".5" cy=".42" r=".75">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".6"/>
    </radialGradient>
    <linearGradient id="scA-shaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLD}" stop-opacity=".11"/><stop offset="1" stop-color="${COLD}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scA-sky)"/>
  <!-- 高窗与冷光柱（左右两扇，第三扇只露半个——殿堂的进深） -->
  <path d="M56 86 h36 v256 l-18 36 -18 -36 z" fill="#0c1220"/>
  <path d="M63 96 h22 v238 l-11 24 -11 -24 z" fill="url(#scA-shaft)"/>
  <path d="M336 112 h32 v228 l-16 32 -16 -32 z" fill="#0c1220"/>
  <path d="M343 122 h18 v210 l-9 22 -9 -22 z" fill="url(#scA-shaft)"/>
  <path d="M150 60 h26 v180 l-13 26 -13 -26 z" fill="#0b1120"/>
  <!-- 后墙暗层与侧柱 -->
  <rect x="0" y="330" width="430" height="410" fill="#0d1320" opacity=".5"/>
  <rect x="118" y="360" width="14" height="378" fill="#0b101b"/>
  <rect x="300" y="352" width="12" height="386" fill="#0b101b"/>
  <!-- 地面 -->
  <rect x="0" y="738" width="430" height="162" fill="#06080f"/>
  <rect x="0" y="736" width="430" height="3" fill="${EDGE}" opacity=".35"/>
  <!-- 王座：高背 + 三尖中冠 + 双侧尖饰 + 外伸扶手 + 台阶（亮一阶背板，让魔王的黑浮出来） -->
  <path d="M142 738 V338 q0 -16 15 -16 h116 q15 0 15 16 V738 z" fill="url(#scA-thr)"/>
  <path d="M142 338 q0 -16 15 -16 h116 q15 0 15 16" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity=".5"/>
  <path d="M192 322 l23 -32 23 32 z" fill="#10151f"/>
  <path d="M142 338 l10 -26 10 26 z" fill="#10151f"/>
  <path d="M268 338 l10 -26 10 26 z" fill="#10151f"/>
  <rect x="112" y="470" width="42" height="15" rx="6" fill="#0e1420"/>
  <rect x="276" y="470" width="42" height="15" rx="6" fill="#0e1420"/>
  <rect x="117" y="485" width="10" height="253" fill="#0a0e16"/>
  <rect x="303" y="485" width="10" height="253" fill="#0a0e16"/>
  <!-- 王座台阶三级 -->
  <rect x="106" y="712" width="218" height="10" fill="#0b101a"/>
  <rect x="96" y="722" width="238" height="10" fill="#090e17"/>
  <rect x="86" y="732" width="258" height="8" fill="#070b12"/>
  <!-- 魔王 v3（威风）：占格更高的立姿——弯月双角 / 兜帽下亮瞳 / 宽肩披风撕口 / 前伸手拎薇拉 -->
  <g fill="${INK}">
    <!-- 冠饰定稿：与游戏内 Boss 地图标（render.js drawBossFigure）同款「三尖冠」——
         场景/立绘/棋盘三层同一形状基因，不再自创。三尖竖冠+两侧短角刺，威严且绝不误读。 -->
    <path d="M188 262 L192 236 L200 254 L215 222 L230 254 L238 236 L242 262 Z"/>
    <path d="M184 262 q31 -12 62 0 l-2 8 q-29 -10 -58 0 z"/>
    <path d="M176 258 l-10 -22 12 6 z"/>
    <path d="M254 258 l10 -22 -12 6 z"/>
    <!-- 角根环箍 -->
    <path d="M200 258 q15 -8 30 0 l-2 8 q-13 -6 -26 0 z"/>
    <!-- 兜帽头：上圆下宽，比脸大一圈 -->
    <path d="M188 300 q-4 -44 27 -46 q31 2 27 46 l-3 12 h-48 z"/>
    <!-- 躯干+宽肩披风：右肩单侧尖角肩甲（非对称第二锚点） -->
    <path d="M170 348 q10 -34 45 -36 q35 2 45 36 l6 74 q2 52 -4 108 l-6 40 -92 0 -6 -40 q-6 -56 -4 -108 z"/>
    <!-- 右肩甲尖 -->
    <path d="M246 318 l22 -10 -6 26 -18 6 z"/>
    <!-- 披风主体垂到地，侧缘撕口 -->
    <path d="M162 560 q-16 78 -12 178 h130 q4 -100 -12 -178 q-53 -14 -106 0 z"/>
    <!-- 披风下摆撕边（5 个不等长三角缺口） -->
    <path d="M150 738 l12 -26 10 26 z M186 738 l14 -20 12 20 z M226 738 l10 -30 14 30 z M262 738 l8 -18 10 18 z"/>
    <!-- 垂褶近读 -->
    <path d="M186 600 q-6 54 -4 96 M215 592 v112 M244 600 q6 54 4 96" fill="none" stroke="#0e1520" stroke-width="2"/>
  </g>
  <!-- 魔王受光层：右缘 LIT 一阶 + 胸甲分块（4 阶近黑，硬边） -->
  <path d="M258 348 q10 34 8 84 l-4 66 h-10 l4 -66 q2 -50 -6 -80 z" fill="${LIT}"/>
  <path d="M196 360 q19 -10 38 0 l-4 44 q-15 -8 -30 0 z" fill="${LIT}"/>
  <path d="M199 366 q16 -8 32 0 l-3 32 q-13 -6 -26 0 z" fill="${EDGE}" opacity=".8"/>
  <!-- 双色 rim：暖金右缘（主）+ 冷补左下（≤30% 强度） -->
  <path d="M260 350 q9 36 8 86 l-4 62" fill="none" stroke="${WARM}" stroke-width="1.8" opacity=".5"/>
  <path d="M224 252 C232 233 244 221 262 213" fill="none" stroke="${EDGE}" stroke-width="1.2" opacity=".55"/>
  <path d="M164 570 q-14 74 -11 164" fill="none" stroke="${COLD}" stroke-width="1.2" opacity=".16"/>
  <!-- 亮瞳（焦点层，两粒）+ 瞳内白点 -->
  <circle cx="206" cy="282" r="2.1" fill="${WARM_HI}"/>
  <circle cx="224" cy="282" r="2.1" fill="${WARM_HI}"/>
  <circle cx="206.7" cy="281.3" r=".7" fill="#fff" opacity=".8"/>
  <circle cx="224.7" cy="281.3" r=".7" fill="#fff" opacity=".8"/>
  <!-- 薇拉 v3（漂亮端庄 · 可怜）：完整小人形，被拎在魔王左手外侧的空中、脚尖离地。
       剪影世界里「同色叠同色」读不出来，所以她整体走「背光透」的处理：
       身体近黑、四周一圈 PAL 轮廓光（1.2px 实描），发间微光环是王女符码。
       构图上她悬在魔王左臂外（x≈170），与魔王黑披风错位，轮廓光贴着暗天空读得清。 -->
    <!-- 魔王拎着她的那只手：从魔王左肩垂下的手臂 + 收拢的手（抓着薇拉的发/领） -->
    <path d="M176 352 q-10 16 -8 40 q1 10 8 14 l6 -6 q-5 -22 2 -42 z" fill="${INK}"/>
    <path d="M172 404 q8 -6 18 -2 l4 6 q-4 8 -13 8 q-9 0 -11 -12 z" fill="${INK}"/>
  <g>
    <g class="sc-sway">
      <!-- 垂发：两侧分缕，末端收尖 -->
      <path d="M162 420 q-8 16 -7 34 l2 14 3 -2 -1 -14 q-1 -16 5 -30 z" fill="#141c2a"/>
      <path d="M176 420 q8 16 7 34 l-2 14 -3 -2 1 -14 q1 -16 -5 -30 z" fill="#141c2a"/>
      <!-- 头：圆脸庞 -->
      <circle cx="169" cy="413" r="8.5" fill="#141c2a"/>
      <!-- 发间微光环 -->
      <circle cx="169" cy="403" r="2" fill="${PAL}" opacity=".65"/>
      <circle cx="169" cy="403" r="3.8" fill="none" stroke="${PAL}" stroke-width=".7" opacity=".28"/>
      <!-- 上身：束腰（双手拢在胸前——可怜：缩着） -->
      <path d="M169 422 q-9 2 -10 13 l-2 12 h24 l-2 -12 q-1 -11 -10 -13 z" fill="#141c2a"/>
      <path d="M160 432 q-5 2 -6 8 l6 3 2 -7 z" fill="#141c2a"/>
      <path d="M178 432 q5 2 6 8 l-6 3 -2 -7 z" fill="#141c2a"/>
      <!-- 长裙：A 字铺开 + 下摆撕边（裙摆垂坠不整齐） -->
      <path d="M157 447 q-9 23 -11 46 q11 6 23 6 q12 0 23 -6 q-2 -23 -11 -46 q-12 -5 -24 0 z" fill="#141c2a"/>
      <path d="M146 493 l6 -10 5 10 6 -8 5 8 6 -10 6 10 q-11 5 -14 5 q-3 0 -14 -5 z" fill="#141c2a"/>
      <!-- 薇拉受光层：右缘 LIT 一阶 -->
      <path d="M177 450 q8 21 9 43 l-4 0 q-2 -22 -9 -41 z" fill="${LIT}"/>
      <!-- 全身 PAL 轮廓光：贴形一圈 1.2px（近黑身体在暗天空上靠它读形） -->
      <circle cx="169" cy="413" r="8.5" fill="none" stroke="${PAL}" stroke-width="1.4" opacity=".72"/>
      <path d="M159 424 q-9 2 -10 13 l-2 12 h3 l2 -11 q1 -10 8 -12 z" fill="${PAL}" opacity=".38"/>
      <path d="M157 448 q-9 23 -11 45 q11 6 11 6 q-8 -20 -3 -50 z" fill="${PAL}" opacity=".3"/>
      <path d="M181 450 q9 22 10 43" fill="none" stroke="${PAL}" stroke-width="1.4" opacity=".62"/>
      <path d="M176 406 q3 3 3 7" fill="none" stroke="${PAL}" stroke-width="1" opacity=".5"/>
    </g>
  </g>
  <!-- 火盆（本幕唯一暖光） -->
  <g>
    <ellipse cx="334" cy="688" rx="92" ry="90" fill="url(#scA-glow)"/>
    <path d="M320 706 l28 0 7 28 q-21 9 -42 0 z" fill="${INK}"/>
    <path d="M318 704 h32" stroke="${EDGE}" stroke-width="1.2" opacity=".5"/>
    <g class="sc-flick">
      <path d="M334 656 q-11 15 -4 28 q4 8 4 14 q11 -4 9 -17 q9 2 6 15 q11 -13 0 -30 q-6 -10 -15 -10 z" fill="${WARM}"/>
      <path d="M334 668 q-4 9 -1 15 q2 5 2 9 q6 -3 4 -10 q4 1 3 9 q6 -8 0 -16 q-4 -7 -8 -7 z" fill="${WARM_HI}"/>
    </g>
    <!-- 火星两粒（近读彩蛋） -->
    <circle class="sc-tw" cx="352" cy="640" r="1.1" fill="${WARM_HI}" opacity=".5"/>
    <circle cx="322" cy="630" r=".8" fill="${WARM}" opacity=".35"/>
  </g>
  <!-- 雾两层（渐变，禁 blur） -->
  <ellipse class="sc-fog" cx="110" cy="700" rx="240" ry="60" fill="#151c2b" opacity=".5"/>
  <ellipse class="sc-fog2" cx="330" cy="760" rx="220" ry="48" fill="#100e1a" opacity=".45"/>
  <rect width="430" height="900" fill="url(#scA-vig)"/>
  </g>
</svg>`;

  // ---------- 第二幕：王宫授帕 ----------
  // 2026-11-20 重绘 v3：v2 的国王是一坨、勇者是团、帕子小得像图标。v3——
  // 国王（恳求动人）：大幅前倾弯腰、双手捧帕递出、冠冕三尖可读、披风拖地、头低垂；
  // 勇者（接帕）：单膝点地低头双手接——「受命」的郑重感；背剑轮廓在背后可读；
  // 绣帕放大到 44px（全屏唯一亮焦点），帕上绣纹近读可辨（塔形一针）。
  const palace = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scB-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151c29"/><stop offset=".6" stop-color="#0f141e"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <radialGradient id="scB-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${PAL}" stop-opacity=".38"/><stop offset=".5" stop-color="${PAL}" stop-opacity=".12"/><stop offset="1" stop-color="${PAL}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scB-vig" cx=".5" cy=".42" r=".75">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".6"/>
    </radialGradient>
    <linearGradient id="scB-shaft" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLD}" stop-opacity=".10"/><stop offset="1" stop-color="${COLD}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g class="sc-zoom">
  <rect width="430" height="900" fill="url(#scB-sky)"/>
  <!-- 大厅立柱三根（第三根只在远端，进深） -->
  <rect x="14" y="56" width="36" height="706" fill="#0b101b"/>
  <rect x="46" y="56" width="4" height="706" fill="${EDGE}" opacity=".4"/>
  <rect x="380" y="56" width="36" height="706" fill="#0b101b"/>
  <rect x="378" y="56" width="4" height="706" fill="${EDGE}" opacity=".4"/>
  <rect x="210" y="120" width="16" height="300" fill="#0b111d" opacity=".8"/>
  <!-- 柱头 -->
  <rect x="8" y="48" width="48" height="12" rx="3" fill="#0d1320"/>
  <rect x="374" y="48" width="48" height="12" rx="3" fill="#0d1320"/>
  <!-- 残旧挂毯（缺角 + 绣纹近读） -->
  <path d="M120 92 h80 v234 l-17 24 -13 -15 -14 19 -15 -17 -21 15 z" fill="#0c1120"/>
  <path d="M133 105 h54 v204" fill="none" stroke="${EDGE}" stroke-width="1" opacity=".35"/>
  <path d="M146 150 l18 -22 18 22 M146 200 h36" fill="none" stroke="#131a28" stroke-width="2" opacity=".9"/>
  <!-- 高窗冷光斜柱 -->
  <path d="M300 36 L430 36 L360 420 L256 420 z" fill="url(#scB-shaft)"/>
  <!-- 王座台阶残影（国王从王座走下来了——台阶空着） -->
  <rect x="150" y="700" width="130" height="10" fill="#0b101a"/>
  <rect x="140" y="710" width="150" height="10" fill="#090e17"/>
  <!-- 地面 -->
  <rect x="0" y="748" width="430" height="152" fill="#070a12"/>
  <rect x="0" y="746" width="430" height="3" fill="${EDGE}" opacity=".35"/>
  <!-- 国王 v3（恳求动人）：从王座走下、大幅前倾弯腰、双手捧帕递向右侧、头低垂 -->
  <g fill="${INK}">
    <!-- 冠冕三尖（压在头上，随弯腰前倾） -->
    <path d="M148 498 l-10 -26 8 4 6 -13 8 11 8 -15 8 13 6 -12 8 5 6 13 -10 26 z"/>
    <!-- 头：低垂（前倾 30°，冠后仰） -->
    <path d="M150 528 q2 -24 24 -26 q22 2 24 24 l-2 14 q-22 10 -44 0 z"/>
    <!-- 躯干：弯腰前倾，背部拱起 -->
    <path d="M128 560 q10 -26 44 -28 q34 2 44 28 l10 40 -14 6 -12 -30 q-26 -10 -54 0 l-10 30 -12 -6 z"/>
    <!-- 双臂前伸捧帕（两只手都伸向右前方的帕） -->
    <path d="M204 552 q28 6 44 24 l-8 12 q-16 -14 -40 -20 z"/>
    <path d="M196 574 q30 6 48 22 l-7 12 q-20 -14 -44 -18 z"/>
    <!-- 大袍+拖地披风：下摆撕边 -->
    <path d="M118 600 q-14 60 -10 148 h104 q4 -88 -10 -148 q-40 -16 -84 0 z"/>
    <path d="M108 748 l10 -22 9 22 z M140 748 l11 -16 10 16 z M176 748 l9 -24 12 24 z M204 748 l7 -14 9 14 z"/>
    <path d="M138 620 q-4 52 -3 96 M168 612 v106 M196 622 q4 50 3 92" fill="none" stroke="#0e1520" stroke-width="2"/>
  </g>
  <!-- 国王受光层：拱背右缘 + 冠亮一阶 -->
  <path d="M216 534 q6 10 8 26 l-6 2 q-2 -14 -6 -24 z" fill="${LIT}"/>
  <path d="M186 480 l6 8 -2 8 -8 -8 z" fill="${LIT}" opacity=".8"/>
  <path d="M216 560 q28 8 42 24" fill="none" stroke="${EDGE}" stroke-width="1.6" opacity=".6"/>
  <path d="M150 522 q4 -18 20 -22" fill="none" stroke="${WARM}" stroke-width="1.4" opacity=".3"/>
  <!-- 绣帕 v3（全屏唯一亮焦点）：放大 + 绣塔纹 + 光晕 -->
  <g class="sc-sway">
    <circle cx="266" cy="546" r="44" fill="url(#scB-glow)"/>
    <path d="M266 520 l24 26 -24 26 -24 -26 z" fill="${PAL}"/>
    <path d="M266 528 l15 18 -15 18 -15 -18 z" fill="#eef1f7" opacity=".85"/>
    <!-- 帕上绣纹：小塔一针（近读彩蛋） -->
    <path d="M266 538 l5 8 h-10 z M264 546 h4 v6 h-4 z" fill="#8a92a6" opacity=".7"/>
    <!-- 帕角流苏两根 -->
    <path d="M244 546 l-5 3 M288 546 l5 3" stroke="${PAL}" stroke-width="1.4" opacity=".6"/>
  </g>
  <!-- 国王捧帕的手（压在帕下沿） -->
  <path d="M244 566 q10 2 16 8 l-4 8 q-8 -4 -14 -6 z" fill="${INK}"/>
  <!-- 勇者 v3：单膝点地、低头、双手接帕，背后铁剑+木盾轮廓可读 -->
  <g fill="${INK2}">
    <!-- 头低垂 -->
    <path d="M300 584 q0 -18 16 -21 q17 3 17 21 l-2 10 q-15 8 -29 0 z"/>
    <!-- 躯干：微躬 -->
    <path d="M288 612 q6 -18 28 -20 q22 2 28 20 l4 30 -10 3 -6 -24 q-16 -8 -32 0 l-6 24 -10 -3 z"/>
    <!-- 双臂前伸接帕 -->
    <path d="M300 600 q-14 6 -20 20 l8 6 q6 -12 16 -16 z"/>
    <!-- 前腿弓、后腿膝点地 -->
    <path d="M296 642 q-12 30 -14 106 h20 q0 -72 8 -100 z"/>
    <path d="M330 642 q14 10 18 34 l14 30 q-8 6 -14 2 l-14 -26 q-6 -22 -10 -30 z"/>
    <!-- 后膝与脚 -->
    <path d="M356 700 q10 2 12 10 l-2 8 h-16 z"/>
  </g>
  <!-- 背后铁剑（剑柄露在肩上）与木盾（背后圆盾露一弧） -->
  <path d="M338 540 l14 -66 5 1 -11 68 z" fill="${INK2}"/>
  <path d="M350 546 l9 4 -3 10 -9 -4 z" fill="${INK2}"/>
  <path d="M290 600 a26 26 0 0 1 8 -14" fill="none" stroke="${INK2}" stroke-width="5"/>
  <!-- 勇者受光层 -->
  <path d="M318 566 q6 8 8 24 l-5 2 q-2 -14 -6 -22 z" fill="${LIT}"/>
  <path d="M312 590 q8 4 12 12" fill="none" stroke="${EDGE}" stroke-width="1.2" opacity=".5"/>
  <!-- 尘埃缓浮 -->
  <g fill="${PAL}" opacity=".14">
    <circle class="sc-fog" cx="150" cy="420" r="1.6"/>
    <circle cx="210" cy="360" r="1.2"/>
    <circle class="sc-fog2" cx="290" cy="470" r="1.5"/>
    <circle cx="250" cy="300" r="1"/>
    <circle cx="330" cy="380" r="1.1"/>
  </g>
  <ellipse class="sc-fog" cx="120" cy="720" rx="240" ry="56" fill="#151c2b" opacity=".45"/>
  <ellipse class="sc-fog2" cx="320" cy="780" rx="220" ry="46" fill="#100e1a" opacity=".4"/>
  <rect width="430" height="900" fill="url(#scB-vig)"/>
  </g>
</svg>`;

  // ---------- 第三幕：灯下立誓 ----------
  // 2026-11-20 重绘 v3：v2 人形太散、烛太弱。v3——
  // 勇者（帅气）：站姿挺拔侧影、一手举帕对烛光端详、一手按在剑柄上（即将上路的不回头）；
  //   肩线/腰线/腿部分块（4 阶近黑），轮廓破口在披风与下摆；
  // 烛台换成黄铜烛台（有足有碟），光晕更聚焦；桌上多一把短匕与绣帕的针线卷（近读彩蛋）。
  const vow = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scC-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121824"/><stop offset=".6" stop-color="#0d1119"/><stop offset="1" stop-color="#090c13"/>
    </linearGradient>
    <radialGradient id="scC-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".6"/><stop offset=".45" stop-color="${WARM}" stop-opacity=".18"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
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
  <!-- 窗外残星一粒（呼应第四幕的黎明前） -->
  <circle class="sc-tw" cx="66" cy="120" r="1.2" fill="${PAL}" opacity=".4"/>
  <!-- 墙上圆盾 + 挂钩（安静的 70%） -->
  <circle cx="290" cy="296" r="32" fill="#0a0e16"/>
  <circle cx="290" cy="296" r="32" fill="none" stroke="#141a26" stroke-width="3"/>
  <circle cx="290" cy="296" r="8" fill="#10151f"/>
  <path d="M290 264 l3 8 h-6 z" fill="#141a26"/>
  <!-- 桌与桌腿 -->
  <rect x="60" y="648" width="196" height="15" rx="3" fill="${INK}"/>
  <rect x="80" y="663" width="12" height="75" fill="${INK}"/>
  <rect x="226" y="663" width="12" height="75" fill="${INK}"/>
  <!-- 桌沿受光线（烛光近侧） -->
  <rect x="60" y="648" width="70" height="2.4" fill="${WARM}" opacity=".28"/>
  <!-- 铁剑靠桌（即将带走的剑） -->
  <path d="M94 646 l26 -98 6 2 -22 98 z" fill="${INK2}"/>
  <path d="M114 568 l10 3 -3 9 -10 -3 z" fill="${INK}"/>
  <!-- 桌上近读彩蛋：短匕 + 针线卷（绣帕是妹妹辈的人缝的） -->
  <path d="M196 640 l18 -12 3 4 -18 12 z" fill="${INK2}"/>
  <rect x="216" y="636" width="14" height="8" rx="3" fill="${INK2}"/>
  <!-- 黄铜烛台 v3（有足有碟）+ 蜡烛（本幕唯一暖光） -->
  <g>
    <ellipse cx="146" cy="616" rx="92" ry="92" fill="url(#scC-glow)"/>
    <ellipse cx="146" cy="648" rx="20" ry="5" fill="${INK}"/>
    <path d="M138 648 l3 -14 h10 l3 14 z" fill="${INK}"/>
    <ellipse cx="146" cy="633" rx="12" ry="3.4" fill="${EDGE}"/>
    <rect x="141" y="606" width="10" height="26" rx="2" fill="${EDGE}"/>
    <g class="sc-flick">
      <path d="M146 578 q-9 13 -3 24 q3 7 3 12 q10 -4 8 -15 q8 2 5 13 q10 -12 0 -27 q-5 -10 -13 -7 z" fill="${WARM}"/>
      <path d="M146 590 q-4 8 -1 13 q1 4 1 7 q5 -3 3 -8 q4 1 2 7 q5 -7 0 -14 q-3 -5 -5 -5 z" fill="${WARM_HI}"/>
    </g>
    <!-- 烛泪一道（近读） -->
    <path d="M141 612 q-2 8 0 14" fill="none" stroke="${WARM_HI}" stroke-width="1" opacity=".4"/>
  </g>
  <!-- 勇者 v4（帅气）：站在桌右，侧身对烛，把帕举到烛光边端详——一手举帕、一手按剑柄。
       他的左缘迎着烛光（暖 rim 1.6px），所以从暗底里读得出轮廓；身体走 LIT/INK 分块，
       不再用 INK2 整块（v3 在暗背景上几乎不可见）。 -->
  <g>
    <!-- 头：侧影朝向左侧烛光，鼻梁一道、发尾一缕 -->
    <path d="M258 464 q-2 -24 18 -28 q20 3 22 26 l-2 16 q-16 9 -34 1 z" fill="${INK}"/>
    <path d="M258 454 q-4 6 -3 14 l4 2 q-1 -8 1 -14 z" fill="${INK}"/>
    <path d="M276 440 q10 -4 15 2 q-5 7 -13 8 z" fill="${INK}"/>
    <!-- 躯干：肩宽腰收 + 长外套下摆（撕口 3 处） -->
    <path d="M252 500 q6 -18 22 -20 q18 2 24 20 l3 38 q2 24 -2 50 l-4 32 -40 0 -5 -32 q-4 -26 -2 -50 z" fill="${INK}"/>
    <path d="M248 614 l8 -14 6 14 z M266 614 l7 -10 7 10 z M284 614 l6 -16 8 16 z" fill="${INK}"/>
    <!-- 左臂：从肩伸向烛焰上沿，手托着帕（袖子比手臂宽）——帕要落在光里 -->
    <path d="M252 502 q-16 -2 -30 -8 l-5 20 q16 8 32 8 z" fill="${INK}"/>
    <path d="M222 494 q-8 -3 -13 -8 l6 -8 q7 5 11 7 z" fill="${INK}"/>
    <!-- 右臂：垂到腰侧按剑柄 -->
    <path d="M298 502 q8 12 9 28 l-9 3 q-2 -14 -8 -24 z" fill="${INK}"/>
    <!-- 双腿：站姿开立，前脚略出（腿长收短、加深色靴，避免高跷感） -->
    <path d="M254 616 q-8 44 -6 88 l-2 14 h20 l-1 -14 q-4 -44 2 -88 z" fill="${INK}"/>
    <path d="M282 616 q8 46 10 88 l1 14 h20 l-3 -14 q-5 -46 -12 -88 z" fill="${INK}"/>
    <!-- 左缘受光（烛光侧）：LIT 面 + 暖 rim -->
    <path d="M256 468 q-6 10 -6 26 l4 0 q1 -14 6 -22 z" fill="${LIT}"/>
    <path d="M252 502 q-16 -6 -30 -14" fill="none" stroke="${WARM}" stroke-width="1.7" opacity=".55"/>
    <path d="M258 470 q-6 12 -6 30 l-4 34 q-3 26 0 52" fill="none" stroke="${WARM}" stroke-width="1.5" opacity=".4"/>
    <path d="M264 620 q-5 40 -4 92" fill="none" stroke="${COLD}" stroke-width="1.1" opacity=".16"/>
    <!-- 腰间剑：柄朝上、首圆扣，鞘垂到腿侧 -->
    <path d="M302 540 l-5 20 -9 -3 5 -20 z" fill="${INK}"/>
    <circle cx="295" cy="562" r="3.6" fill="${INK}"/>
    <path d="M293 566 q-3 36 -6 62" fill="none" stroke="${INK}" stroke-width="5" opacity=".95"/>
  </g>
  <!-- 举起的绣帕：正在烛焰上方——托在左手，帕角朝下垂（被举着看的样子），帕面吃满烛光 -->
  <g class="sc-sway">
    <circle cx="198" cy="492" r="30" fill="url(#scC-glow)" opacity=".6"/>
    <path d="M198 476 l16 16 -16 17 -16 -17 z" fill="${PAL}"/>
    <path d="M198 481 l10 11 -10 12 -10 -12 z" fill="#f4ecd8" opacity=".94"/>
    <!-- 帕上绣塔一针（近读） -->
    <path d="M198 485 l4 6 h-8 z" fill="#8a92a6" opacity=".7"/>
    <path d="M183 493 h-6 M213 493 h6" stroke="${WARM_HI}" stroke-width="1.6" opacity=".75"/>
  </g>
  <!-- 脚下接触影（AO） -->
  <ellipse cx="276" cy="734" rx="36" ry="6" fill="#000" opacity=".5"/>
  <ellipse class="sc-fog2" cx="140" cy="800" rx="260" ry="52" fill="#100e1a" opacity=".42"/>
  <rect width="430" height="900" fill="url(#scC-vig)"/>
  </g>
</svg>`;

  // ---------- 第四幕：海崖塔门（黎明的第一道门缝光） ----------
  // 2026-11-20 重绘 v3：v2 的塔是一条抽象黑柱、勇者小到看不出。v3——
  // 黑塔（威压感）：真塔身——收分轮廓、垛口齿、两层亮窗点、砖缝近读；塔基占画面右半；
  // 勇者（帅气背影）：推门姿势加大——前腿弓后腿蹬、披风被海风掀起、剑悬腰侧、盾挂背；
  // 门缝光更强（本幕唯一暖光），光洒在门前的石台上拉出长影。
  const door = `
<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="scD-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1d2636"/><stop offset=".55" stop-color="#141b28"/><stop offset=".8" stop-color="#10151f"/><stop offset="1" stop-color="#0a0e15"/>
    </linearGradient>
    <linearGradient id="scD-hor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2e3a4e" stop-opacity="0"/><stop offset=".5" stop-color="#2e3a4e" stop-opacity=".4"/><stop offset="1" stop-color="#2e3a4e" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="scD-glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${WARM_HI}" stop-opacity=".65"/><stop offset=".4" stop-color="${WARM}" stop-opacity=".22"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="scD-vig" cx=".5" cy=".4" r=".8">
      <stop offset=".55" stop-color="#04060a" stop-opacity="0"/><stop offset="1" stop-color="#04060a" stop-opacity=".58"/>
    </radialGradient>
    <linearGradient id="scD-tower" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0d1420"/><stop offset=".7" stop-color="#070a12"/><stop offset="1" stop-color="#04060a"/>
    </linearGradient>
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
  <path d="M40 762 q50 -4 90 0" fill="none" stroke="${EDGE}" stroke-width=".8" opacity=".14"/>
  <!-- 海崖平台 -->
  <path d="M0 900 v-118 q92 -18 152 -12 l58 8 v-44 h226 v166 z" fill="${INK}"/>
  <!-- 黑塔 v6：经典城塔结构——直斜收分塔身（底 174–340 → 肩 212–302）+ 直颈 + 外挑垛口檐。
       三段各是硬边多边形，拼接严丝合缝；轮廓不再出现圆弧「潜艇头」。 -->
  <path d="M174 900 V420 L212 330 H302 L340 420 V900 Z" fill="url(#scD-tower)"/>
  <rect x="212" y="286" width="90" height="46" fill="url(#scD-tower)"/>
  <!-- 垛口檐（外挑 8px，5 齿一体成型） -->
  <path d="M204 286 V272 h6 v-14 h12 v14 h10 v-14 h12 v14 h10 v-14 h12 v14 h10 v-14 h12 v14 h10 v-14 h12 v14 h6 v14 z" fill="#0b111d"/>
  <rect x="204" y="284" width="112" height="4" fill="#060a12" opacity=".9"/>
  <!-- 塔身左缘受光线（黎明冷光侧） -->
  <path d="M178 900 V420 L214 334" fill="none" stroke="${EDGE}" stroke-width="1.6" opacity=".4"/>
  <!-- 两层亮窗（微光点：塔里有人？） -->
  <rect x="240" y="400" width="12" height="20" rx="4" fill="#0c1422"/>
  <rect x="243" y="404" width="6" height="12" rx="2" fill="${WARM}" opacity=".22"/>
  <rect x="284" y="500" width="12" height="20" rx="4" fill="#0c1422"/>
  <rect x="287" y="504" width="6" height="12" rx="2" fill="${WARM}" opacity=".14"/>
  <!-- 砖缝近读（极少） -->
  <path d="M210 450 h100 M214 560 h92 M218 670 h84" stroke="#0d1420" stroke-width="2" opacity=".8"/>
  <path d="M306 380 v500 M314 480 v400" stroke="#0d1420" stroke-width="2" opacity=".6"/>
  <!-- 塔门（拱门 + 中缝暖光：全屏唯一暖光、唯一焦点） -->
  <path d="M228 732 v-118 q0 -36 30 -36 q30 0 30 36 v118 z" fill="#04060a"/>
  <ellipse class="sc-pulse" cx="258" cy="658" rx="102" ry="92" fill="url(#scD-glow)"/>
  <line class="sc-pulse" x1="258" y1="582" x2="258" y2="730" stroke="${WARM_HI}" stroke-width="3"/>
  <path d="M258 582 q-10 42 -8 92 q1 34 6 56 h7 q5 -26 6 -58 q2 -48 -11 -90 z" fill="${WARM_HI}" opacity=".88"/>
  <!-- 门内暖光洒在石台上，拉出朝向观者的长影 -->
  <path d="M228 732 l60 0 44 52 h-148 z" fill="${WARM}" opacity=".12"/>
  <path d="M258 732 l8 0 60 66 h-20 z" fill="${WARM}" opacity=".07"/>
  <!-- 勇者 v5（帅气背影，形状块面化）：侧身抵门——前倾、双臂撑在门缝边、前腿弓后腿蹬。
       所有部件用大块连贯形状（不再用细碎小路径），远读剪影干净。 -->
  <g fill="${INK}">
    <!-- 头（低头抵风）：圆颅 + 束发短髻贴在后脑（不伸出轮廓） -->
    <path d="M206 618 q-3 -17 14 -20 q17 2 18 20 l-2 11 q-14 8 -28 0 z"/>
    <!-- 躯干：前倾的整块（肩往门的方向压） -->
    <path d="M188 646 q7 -16 26 -17 q20 1 26 17 l6 30 -8 30 -44 0 -9 -30 z"/>
    <!-- 前臂（近侧）：从肩直撑到门边，粗前臂 + 拳 -->
    <path d="M232 642 q16 2 24 9 l-3 12 q-11 -7 -23 -7 z"/>
    <!-- 后臂（远侧）：略低，也撑在门边 -->
    <path d="M214 652 q16 4 26 12 l-4 11 q-10 -8 -24 -11 z"/>
    <!-- 前腿：弓步（膝朝门） -->
    <path d="M212 686 q10 10 14 24 l2 22 h-15 l-1 -20 q-2 -14 -8 -20 z"/>
    <!-- 后腿：蹬直向后（脚跟抬起） -->
    <path d="M196 686 q-14 14 -20 34 l-4 14 h14 l3 -12 q5 -18 15 -28 z"/>
    <!-- 披风：被海风掀向左后方，整块大三角 + 下摆两处撕口 -->
    <path d="M190 644 q-30 4 -48 28 q-9 12 -11 26 l10 3 q4 -13 13 -22 q16 -16 38 -21 z"/>
    <path d="M134 694 l9 -5 2 9 z M150 706 l8 -4 2 8 z"/>
  </g>
  <!-- 背上木盾：贴在左肩后（半藏进躯干，只露一弧 + 盾心） -->
  <path d="M186 646 a14 14 0 1 0 2 26" fill="none" stroke="${INK}" stroke-width="9"/>
  <circle cx="184" cy="659" r="2.2" fill="${EDGE}" opacity=".7"/>
  <!-- 腰侧剑（鞘斜垂） -->
  <path d="M212 676 l10 30 -8 3 -9 -30 z" fill="${INK}"/>
  <!-- 逆光 rim：门缝暖光打在他右缘（靠门那侧） -->
  <path d="M238 622 q7 10 8 26 l-5 2 q-2 -14 -7 -22 z" fill="${LIT}"/>
  <path d="M236 646 q14 3 20 9" fill="none" stroke="${WARM}" stroke-width="1.6" opacity=".5"/>
  <path d="M192 648 q-26 6 -42 24" fill="none" stroke="${WARM}" stroke-width="1.2" opacity=".26"/>
  <!-- 脚下接触影 -->
  <ellipse cx="206" cy="734" rx="30" ry="5" fill="#000" opacity=".45"/>
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
  // t = typing（含 key / idx / floor）。
  //   · 序章（key==='intro'）→ 本文件的四幕分镜；
  //   · 其余所有对白 → js/backdrops.js 按「剧情键 → 楼层」取一张该层背景。
  // 2026-11-24 之前这里只认 intro，序章之后的对白全压在压暗的棋盘上（用户报障「观感很差」）。
  function sync(t) {
    const box = node();
    if (!box) return;
    const ov = document.getElementById('dialogOverlay');
    if (!t) { hide(); return; }
    const ovOn = ov && ov.classList.contains('show');
    if (!ovOn) { hide(); return; }
    if (t.key === 'intro') {
      const idx = Math.min(Math.max(t.idx | 0, 0), INTRO_SCENES.length - 1);
      const sceneId = 'intro' + idx;
      if (ov) ov.classList.add('scene-on');
      if (cur !== sceneId) {
        // 2026-11-25：CG 接管序章四幕——矢量分镜留在下面当兜底（图挂了就露出来）
        const tag = window.Backdrops && Backdrops.imgTag ? Backdrops.imgTag('intro' + (idx + 1)) : '';
        paint(sceneId, INTRO_SCENES[idx] + tag);
      } else box.classList.add('on');
      return;
    }
    if (!window.Backdrops || typeof t.floor !== 'number') { hide(); return; }
    const bid = Backdrops.pick({ key: t.key, floor: t.floor });
    if (!bid) { hide(); return; }
    // 锁芯场景多一个参数：已得几枚锁环就点亮几道（其余场景忽略）
    let opt = null;
    let idTail = '';
    if (bid === 'core') {
      const st = window.Engine && Engine.state ? Engine.state() : null;
      const n = st && st.flags && st.flags.rings ? st.flags.rings.length : 0;
      opt = { lit: n };
      idTail = ':' + n;
    }
    if (ov) ov.classList.add('scene-on');
    if (cur !== 'bd:' + bid + idTail) paint('bd:' + bid + idTail, Backdrops.layer(bid, opt));
    else box.classList.add('on');
  }

  window.Scenes = { sync, hide };
})();
