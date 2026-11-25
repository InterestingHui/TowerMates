// TowerMates · 对白背景场景库（js/backdrops.js，零依赖）
// ---------------------------------------------------------------------------
// 为什么存在（2026-11-24 用户报障）：序章四幕有分镜，序章之后**所有**对白都没有背景——
// 对话框底下压着的是一张被压暗的棋盘：几块看不出是什么的石头、几颗光点，读起来像「游戏卡住了」。
// 这里给每一层/每一处剧情配一张 430×900 的纯 SVG 背景，全部走同一套笔法：
//   ① 三层纵深（后墙 → 柱/拱 → 前景柱影），近黑硬边分块，不用渐变做结构；
//   ② 每屏只开一个暖光源（火盆 / 烛 / 门缝 / 桌上灯），其余全部冷调；
//   ③ 石缝、砖线、尘埃是「近读彩蛋」，缩到 430 宽仍看得见但不抢焦点；
//   ④ 底部 y>700 留给对话框，只放地面与雾，不放任何关键内容。
// 与 js/scenes.js 的分工：序章四幕（有剧情的分镜）仍归 scenes.js；
// 本文件负责「序章之后」的所有对白背景，由 scenes.js 统一挂到 .dlg-scene 上。
// 风格依据：assets/style-bibles/TowerMates.md §1（剪影优先）/§2（明度分层）/§3.5（四层加法）。
(function () {
  const INK = '#05070c';
  const INK2 = '#080b13';
  const WALL = '#0e141f';
  const WALL2 = '#0b1018';
  const LIT = '#16202e';
  const EDGE = '#1c2636';
  const WARM = '#e8c46a';
  const HI = '#ffe6a8';
  const PAL = '#d6dbe6';
  const COLD = '#9fb8d8';

  // 确定性伪随机：同一场景每次渲染的砖缝/尘埃位置一致（截图与线上不会抖）
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ---------- 共用零件 ----------
  const sky = (id, top, mid, bot) => `
    <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset=".62" stop-color="${mid}"/><stop offset="1" stop-color="${bot}"/>
    </linearGradient>`;
  const glowDef = (id, col, op) => `
    <radialGradient id="${id}" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="${col}" stop-opacity="${op}"/>
      <stop offset=".42" stop-color="${col}" stop-opacity="${op * 0.26}"/>
      <stop offset="1" stop-color="${col}" stop-opacity="0"/>
    </radialGradient>`;
  const vigDef = (id) => `
    <radialGradient id="${id}" cx=".5" cy=".4" r=".78">
      <stop offset=".52" stop-color="#04060a" stop-opacity="0"/>
      <stop offset="1" stop-color="#04060a" stop-opacity=".66"/>
    </radialGradient>`;

  // 石砌墙：横缝 + 错缝竖线，全部低对比（近读才看见，远读是「墙」而不是「条纹」）
  function courses(y0, y1, step, x0, x1, seed, op) {
    const r = rng(seed);
    let out = `<g stroke="#2b3648" stroke-width="1" opacity="${op || 0.5}">`;
    let row = 0;
    for (let y = y0; y < y1; y += step) {
      out += `<path d="M${x0} ${y}h${x1 - x0}"/>`;
      const off = row % 2 ? step * 1.1 : 0;
      for (let x = x0 + off; x < x1; x += step * 2.2) {
        if (r() < 0.18) continue;
        out += `<path d="M${x.toFixed(0)} ${y}v${step}"/>`;
      }
      row++;
    }
    return out + '</g>';
  }

  // 地面：透视砖（灭点固定在 (215, 560) 附近）
  function floorPlane(y0, seed, tone) {
    const r = rng(seed);
    let out = `<rect x="0" y="${y0}" width="430" height="${900 - y0}" fill="${tone || '#0a0f17'}"/>`;
    out += `<g stroke="${EDGE}" stroke-width="1" opacity=".22">`;
    for (let i = -6; i <= 6; i++) {
      out += `<path d="M${215 + i * 46} ${y0}L${215 + i * 132} 900"/>`;
    }
    let k = 0;
    for (let y = y0 + 26; y < 900; y += 34 + k * 5) {
      out += `<path d="M0 ${y.toFixed(0)}H430"/>`;
      k++;
    }
    out += '</g>';
    // 一块略亮的地面反光（近光源侧）
    out += `<path d="M${40 + r() * 20} ${y0}l150 0 120 ${900 - y0}-260 0z" fill="${WARM}" opacity=".028"/>`;
    return out;
  }

  // 前景柱：左右各一根，近黑，右侧一根带暖 rim
  function forePillars(lw, rw) {
    return `<path d="M0 0h${lw}v900H0z" fill="#04060b"/>
      <path d="M${lw} 0v900" stroke="${EDGE}" stroke-width="1.4" opacity=".5"/>
      <path d="M430 0h-${rw}v900h${rw}z" fill="#04060b"/>
      <path d="M${430 - rw} 0v900" stroke="${WARM}" stroke-width="1.2" opacity=".22"/>`;
  }

  // 后墙拱：一排尖拱门洞（暗），拱缘一阶亮边
  function archRow(n, y, h, w, gap, x0, tone) {
    let out = '<g>';
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (w + gap);
      out += `<path d="M${x} ${y + h}V${y + w * 0.55}q${w / 2} -${w * 0.5} ${w} 0V${y + h}z" fill="${tone || '#04070d'}"/>`;
      out += `<path d="M${x} ${y + h}V${y + w * 0.55}q${w / 2} -${w * 0.5} ${w} 0V${y + h}" fill="none" stroke="${EDGE}" stroke-width="1.6" opacity=".55"/>`;
    }
    return out + '</g>';
  }

  // 火盆 / 火把：每屏唯一暖光
  function brazier(x, y, sc) {
    const s = sc || 1;
    return `<g>
      <ellipse cx="${x}" cy="${y - 40 * s}" rx="${240 * s}" ry="${220 * s}" fill="url(#bGlow)" opacity=".16"/>
      <ellipse cx="${x}" cy="${y - 6 * s}" rx="${86 * s}" ry="${84 * s}" fill="url(#bGlow)"/>
      <path d="M${x - 13 * s} ${y}l${26 * s} 0 ${5 * s} ${22 * s}q-${18 * s} ${8 * s} -${36 * s} 0z" fill="${INK}"/>
      <path d="M${x - 15 * s} ${y - 2 * s}h${30 * s}" stroke="${EDGE}" stroke-width="1.4" opacity=".6"/>
      <g class="bd-flick">
        <path d="M${x} ${y - 34 * s}q-${10 * s} ${14 * s} -${4 * s} ${26 * s}q${4 * s} ${7 * s} ${4 * s} ${12 * s}q${10 * s} -${4 * s} ${8 * s} -${16 * s}q${9 * s} ${2 * s} ${6 * s} ${14 * s}q${11 * s} -${13 * s} 0 -${28 * s}q-${6 * s} -${10 * s} -${14 * s} -${8 * s}z" fill="${WARM}"/>
        <path d="M${x} ${y - 22 * s}q-${4 * s} ${8 * s} -${1 * s} ${13 * s}q${2 * s} ${4 * s} ${2 * s} ${8 * s}q${6 * s} -${3 * s} ${4 * s} -${10 * s}q${4 * s} ${1 * s} ${3 * s} ${9 * s}q${6 * s} -${9 * s} 0 -${19 * s}q-${4 * s} -${6 * s} -${8 * s} -${1 * s}z" fill="${HI}"/>
      </g>
      <circle class="bd-tw" cx="${x + 18 * s}" cy="${y - 46 * s}" r="${1.2 * s}" fill="${HI}" opacity=".55"/>
    </g>`;
  }

  function torch(x, y, sc) {
    const s = sc || 1;
    return `<g>
      <ellipse cx="${x}" cy="${y - 40 * s}" rx="${190 * s}" ry="${180 * s}" fill="url(#bGlow)" opacity=".14"/>
      <ellipse cx="${x}" cy="${y - 20 * s}" rx="${64 * s}" ry="${62 * s}" fill="url(#bGlow)"/>
      <path d="M${x - 3 * s} ${y - 18 * s}v${30 * s}" stroke="${INK}" stroke-width="${4 * s}"/>
      <path d="M${x - 8 * s} ${y - 20 * s}h${16 * s}" stroke="${EDGE}" stroke-width="2" opacity=".7"/>
      <g class="bd-flick">
        <path d="M${x} ${y - 46 * s}q-${8 * s} ${11 * s} -${3 * s} ${20 * s}q${3 * s} ${6 * s} ${3 * s} ${9 * s}q${8 * s} -${3 * s} ${6 * s} -${12 * s}q${7 * s} ${2 * s} ${4 * s} ${10 * s}q${9 * s} -${10 * s} 0 -${22 * s}q-${5 * s} -${8 * s} -${10 * s} -${5 * s}z" fill="${WARM}"/>
      </g>
    </g>`;
  }

  // 冷光斜柱（高窗）
  function shaft(x1, y1, w, id) {
    return `<path d="M${x1} ${y1}l${w} 0 -${w * 0.5} 330 -${w * 0.8} 0z" fill="url(#${id || 'bShaft'})"/>`;
  }

  const fog = (y, rx, ry, op, cls) => `<ellipse class="${cls || 'bd-fog'}" cx="${215 + (rx % 2 ? 40 : -30)}" cy="${y}" rx="${rx}" ry="${ry}" fill="#131a26" opacity="${op}"/>`;

  function dust(seed, n, y0, y1) {
    const r = rng(seed);
    let out = '<g fill="' + PAL + '">';
    for (let i = 0; i < n; i++) {
      const x = 20 + r() * 390;
      const y = y0 + r() * (y1 - y0);
      out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(0.6 + r() * 0.9).toFixed(1)}" opacity="${(0.08 + r() * 0.16).toFixed(2)}"/>`;
    }
    return out + '</g>';
  }

  // 统一的收尾：雾两层 + 暗角
  const finish = () => `
    ${fog(760, 250, 54, 0.5)}
    ${fog(840, 280, 60, 0.55, 'bd-fog2')}
    <rect width="430" height="900" fill="url(#bVig)"/>`;

  function wrap(id, body, extraDefs) {
    return `<svg viewBox="0 0 430 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    ${sky('bSky', '#1d2735', '#131b27', '#0a0e16')}
    <linearGradient id="bWall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b2433"/><stop offset=".55" stop-color="#141c28"/><stop offset="1" stop-color="#0d131d"/>
    </linearGradient>
    ${glowDef('bGlow', HI, 0.55)}
    ${vigDef('bVig')}
    <linearGradient id="bShaft" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLD}" stop-opacity=".12"/><stop offset="1" stop-color="${COLD}" stop-opacity="0"/>
    </linearGradient>
    ${extraDefs || ''}
  </defs>
  <g class="bd-zoom">
  <rect width="430" height="900" fill="url(#bSky)"/>
  ${body}
  ${finish()}
  </g>
</svg>`;
  }

  // =========================================================================
  // 各层场景
  // =========================================================================

  // 第 1 层 · 塔之入口：铁闸门厅，两侧火把，门缝一线光
  function gate() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(60, 700, 46, 20, 410, 11, 0.3)}
      <path d="M150 700V330q0 -96 65 -96t65 96V700z" fill="#04060b"/>
      <path d="M150 700V330q0 -96 65 -96t65 96V700" fill="none" stroke="${EDGE}" stroke-width="2" opacity=".6"/>
      <!-- 铁闸：竖栅 + 两道横梁 -->
      <g stroke="${INK}" stroke-width="4">
        <path d="M168 300v400M186 276v424M204 262v438M222 258v442M240 262v438M258 276v424M276 300v400"/>
      </g>
      <path d="M156 400h134M156 560h134" stroke="${INK}" stroke-width="7"/>
      <path d="M156 398h134M156 558h134" stroke="${EDGE}" stroke-width="1.2" opacity=".45"/>
      <!-- 门缝光（本屏唯一暖光）：从闸门中央漏进来，在地面拉出一道亮痕 -->
      <ellipse cx="222" cy="640" rx="120" ry="120" fill="url(#bGlow)" opacity=".7"/>
      <path d="M222 300v400" stroke="${HI}" stroke-width="2.4" opacity=".5"/>
      <path d="M222 700l16 0 74 92h-104z" fill="${WARM}" opacity=".1"/>
      <!-- 门洞两侧柱 -->
      <rect x="126" y="300" width="24" height="400" fill="${INK}"/>
      <rect x="296" y="300" width="24" height="400" fill="${INK}"/>
      <rect x="126" y="300" width="3" height="400" fill="${WARM}" opacity=".3"/>
      <!-- 地上散落的锁链 -->
      <path d="M262 742q22 -8 40 4t36 2" fill="none" stroke="${INK2}" stroke-width="3" stroke-dasharray="7 5"/>
      <path d="M96 786q26 -6 44 4t34 0" fill="none" stroke="${INK2}" stroke-width="2.4" stroke-dasharray="6 5"/>
      ${torch(92, 470, 0.9)}
      ${torch(342, 470, 0.9)}
      ${floorPlane(700, 21, '#0a0f17')}
      ${dust(31, 26, 320, 720)}`;
    return wrap('gate', body);
  }

  // 第 2 层 · 回廊：连续拱廊 + 右侧石阶
  function corridor() {
    let steps = '<g fill="' + INK + '">';
    for (let i = 0; i < 6; i++) {
      steps += `<rect x="${300 - i * 6}" y="${700 - i * 34}" width="${130 + i * 6}" height="34"/>`;
    }
    steps += '</g>';
    let stepRim = '<g stroke="' + EDGE + '" stroke-width="1.2" opacity=".55">';
    for (let i = 0; i < 6; i++) {
      stepRim += `<path d="M${300 - i * 6} ${700 - i * 34}h${130 + i * 6}"/>`;
    }
    stepRim += '</g>';
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(40, 700, 44, 10, 420, 7, 0.34)}
      ${archRow(3, 250, 400, 96, 26, 28, '#04060b')}
      <!-- 走廊纵深：两侧墙面各一阶暗色 -->
      <path d="M0 120h52v580H0z" fill="${INK2}"/>
      <path d="M378 120h52v580h-52z" fill="${INK2}"/>
      <path d="M52 120v580" stroke="${EDGE}" stroke-width="1.6" opacity=".4"/>
      <path d="M378 120v580" stroke="${WARM}" stroke-width="1.2" opacity=".18"/>
      ${torch(58, 430, 0.72)}
      ${steps}${stepRim}
      <!-- 阶边的旧蜡痕（有人提着灯走过） -->
      <path d="M318 640q10 12 4 26" fill="none" stroke="${WARM}" stroke-width="2" opacity=".18"/>
      ${floorPlane(700, 8, '#0a0f17')}
      ${dust(12, 22, 260, 700)}`;
    return wrap('corridor', body);
  }

  // 第 3 层 · 幽暗集市：货摊布篷 + 木箱 + 挂灯
  function market() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(60, 700, 50, 0, 430, 3, 0.3)}
      ${archRow(2, 180, 420, 110, 40, 20, '#04060b')}
      <!-- 布篷：斜挂的一块旧布（唯一大面积中调） -->
      <path d="M20 250l250 -46 128 40 -18 96 -238 34z" fill="#151a24"/>
      <path d="M20 250l250 -46 128 40" fill="none" stroke="${EDGE}" stroke-width="2" opacity=".5"/>
      <path d="M38 330l236 -34M120 226l-18 108M210 200l-14 112" stroke="#0b0f17" stroke-width="2" opacity=".85"/>
      <path d="M20 250v30l18 -4v-28z" fill="#0d121a"/>
      <!-- 货摊：台面 + 立柱 + 台下的箱 -->
      <path d="M118 560h230v18H118z" fill="${INK}"/>
      <path d="M118 560h230" stroke="${EDGE}" stroke-width="1.4" opacity=".5"/>
      <rect x="132" y="578" width="12" height="120" fill="${INK}"/>
      <rect x="322" y="578" width="12" height="120" fill="${INK}"/>
      <path d="M150 620h54v72h-54z" fill="#0a0e16" stroke="${EDGE}" stroke-width="1.2" opacity=".8"/>
      <path d="M150 642h54M174 620v72" stroke="#05080e" stroke-width="2"/>
      <path d="M292 636h40v56h-40z" fill="#0a0e16" stroke="${EDGE}" stroke-width="1.2" opacity=".7"/>
      <!-- 摊上的货：一只铜秤、两枚币 -->
      <path d="M196 556v-26M186 530h20" stroke="${WARM}" stroke-width="2" opacity=".75"/>
      <path d="M186 530l-6 10h12zM206 530l-6 10h12z" fill="none" stroke="${WARM}" stroke-width="1.4" opacity=".6"/>
      <circle cx="246" cy="552" r="4" fill="${WARM}" opacity=".55"/>
      <circle cx="258" cy="556" r="3" fill="${WARM}" opacity=".35"/>
      <!-- 挂灯（唯一暖光，悬在摊子上方） -->
      <g>
        <ellipse cx="236" cy="440" rx="96" ry="94" fill="url(#bGlow)" opacity=".8"/>
        <path d="M236 336v58" stroke="${INK}" stroke-width="2"/>
        <path d="M222 394h28l-4 34h-20z" fill="${INK}"/>
        <path d="M226 400h20l-3 22h-14z" fill="${WARM}" opacity=".85"/>
      </g>
      ${floorPlane(700, 33, '#0a0f17')}
      ${dust(41, 30, 300, 720)}`;
    return wrap('market', body);
  }

  // 第 4 层 · 密道：窄砖道，墙上一条裂缝漏冷光
  function passage() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="#090d15"/>
      ${courses(0, 700, 34, 0, 430, 17, 0.42)}
      <!-- 近墙压得更狠：左右各占 1/4，走道只剩中间 -->
      <path d="M0 0h108v900H0z" fill="#04070d"/>
      <path d="M430 0h-96v900h96z" fill="#04070d"/>
      ${courses(0, 900, 34, 0, 108, 19, 0.3)}
      <path d="M108 0v900" stroke="${EDGE}" stroke-width="1.6" opacity=".45"/>
      <path d="M334 0v900" stroke="${COLD}" stroke-width="1.2" opacity=".22"/>
      <!-- 墙缝：一条从顶裂到腰的斜缝，冷光从缝里渗出来 -->
      <path d="M300 0l-16 190 10 40 -14 120" fill="none" stroke="#04060b" stroke-width="6"/>
      <path d="M300 0l-16 190 10 40 -14 120" fill="none" stroke="${COLD}" stroke-width="1.2" opacity=".4"/>
      <path d="M292 40l-10 150 8 34 -10 100" fill="none" stroke="${COLD}" stroke-width="16" opacity=".06"/>
      <!-- 顶部塌落的横梁 -->
      <path d="M60 268l250 -18 6 16 -250 18z" fill="${INK}"/>
      <path d="M60 268l250 -18" stroke="${EDGE}" stroke-width="1.2" opacity=".4"/>
      <!-- 地上碎石 -->
      <path d="M132 742l26 -12 30 10 -8 16 -40 2z" fill="${INK2}"/>
      <path d="M258 786l18 -8 22 8 -6 12 -28 0z" fill="${INK2}"/>
      ${torch(150, 520, 0.62)}
      ${floorPlane(700, 4, '#060a10')}
      ${dust(51, 18, 240, 700)}`;
    return wrap('passage', body);
  }

  // 第 5 层 · 狼厅：低拱、墙上爪痕、地上骨堆
  function wolfhall() {
    let bones = '<g fill="#232c3b" stroke="#0a0e16" stroke-width="1">';
    const r = rng(77);
    for (let i = 0; i < 9; i++) {
      const x = 60 + r() * 300;
      const y = 720 + r() * 120;
      const w = 18 + r() * 26;
      bones += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q${(w / 2).toFixed(0)} -8 ${w.toFixed(0)} 0q-${(w / 2).toFixed(0)} 6 -${w.toFixed(0)} 0z"/>`;
    }
    bones += '</g>';
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(30, 700, 42, 0, 430, 23, 0.32)}
      <!-- 低矮的拱（压下来的天花板感） -->
      <path d="M0 210q215 -120 430 0v-40q-215 -120 -430 0z" fill="${INK}"/>
      <path d="M0 210q215 -120 430 0" fill="none" stroke="${EDGE}" stroke-width="2" opacity=".55"/>
      <path d="M0 210v490h430V210" fill="none" stroke="${INK2}" stroke-width="12"/>
      <!-- 爪痕三道（非对称，刻在右墙） -->
      <g stroke="#03050a" stroke-width="9" stroke-linecap="round">
        <path d="M330 300l-28 130M352 316l-26 128M374 336l-22 120"/>
      </g>
      <g stroke="${COLD}" stroke-width="1.6" opacity=".32">
        <path d="M330 300l-28 130M352 316l-26 128M374 336l-22 120"/>
      </g>
      <!-- 铁链从拱上垂下来 -->
      <path d="M96 190v150" stroke="${INK2}" stroke-width="4" stroke-dasharray="9 6"/>
      <path d="M96 340l-14 22 16 14" fill="none" stroke="${INK2}" stroke-width="3"/>
      ${brazier(310, 610, 0.8)}
      ${bones}
      ${floorPlane(700, 55, '#06090f')}
      ${dust(61, 20, 250, 700)}`;
    return wrap('wolfhall', body);
  }

  // 第 6 层 · 塔顶王座：高窗冷光、空王座、红毯
  function throne() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(40, 700, 48, 0, 430, 29, 0.28)}
      <!-- 三扇高窗（冷光，唯一高光源） -->
      <path d="M46 60h52v240l-26 40 -26 -40z" fill="#12233a"/>
      <path d="M186 40h58v266l-29 44 -29 -44z" fill="#152942"/>
      <path d="M330 60h52v240l-26 40 -26 -40z" fill="#12233a"/>
      <path d="M186 40h58v266l-29 44 -29 -44z" fill="url(#bShaft)" opacity=".8"/>
      ${shaft(60, 96, 34)}${shaft(200, 76, 40)}${shaft(344, 96, 34)}
      <!-- 王座（2026-11-24 重画）：高背 + 三尖冠 + 外挑扶手 + 三级台阶。
           原来是一整块黑板，读不出是椅子；现在靠「冠 → 靠背 → 扶手 → 座 → 台阶」五段分明。 -->
      <g fill="${INK}">
        <path d="M178 700V392q0 -16 12 -16h40q12 0 12 16V700z"/>
        <!-- 三尖冠（与 Boss 地图标同款形状基因） -->
        <path d="M180 392l10 -34 10 24 10 -44 10 44 10 -24 10 34z"/>
        <!-- 外挑扶手 -->
        <path d="M156 556h30v18h-30zM212 556h30v18h-30z"/>
        <path d="M152 574h6v54h-6zM240 574h6v54h-6z"/>
        <!-- 座面 -->
        <path d="M170 616h60v18h-60z"/>
        <!-- 台阶三级 -->
        <path d="M146 700v-14h98v14zM138 700v-26h114v12zM128 700v-40h134v14z"/>
      </g>
      <!-- 逆光轮廓：靠背右缘一道 brass（它挡在窗前） -->
      <path d="M240 392q0 -14 -10 -16M242 396v300" fill="none" stroke="${WARM}" stroke-width="1.8" opacity=".42"/>
      <path d="M250 392l10 -34" stroke="${WARM}" stroke-width="1.2" opacity=".3"/>
      <!-- 空王座前一只倒下的烛台 -->
      <path d="M300 686l40 10 -3 10 -40 -10z" fill="${INK}"/>
      <circle cx="300" cy="692" r="10" fill="url(#bGlow)" opacity=".55"/>
      ${floorPlane(700, 71, '#100b10')}
      ${dust(81, 24, 200, 700)}`;
    return wrap('throne', body);
  }

  // 第 7 层 · 塔脊：塌了半边的屋顶，横风，露出的梁架
  function ridge() {
    let beams = '<g fill="' + INK + '">';
    for (let i = 0; i < 4; i++) {
      const y = 120 + i * 96;
      beams += `<path d="M0 ${y}l430 -34 0 18 -430 34z"/>`;
    }
    beams += '</g>';
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="#0a1018"/>
      <!-- 塌顶：上半是夜空（比室内更亮一阶的冷调） -->
      <path d="M0 0h430v300l-430 60z" fill="url(#bSky)" opacity=".9"/>
      <path d="M0 300l430 -60v40L0 340z" fill="${INK}"/>
      <g fill="${PAL}">
        <circle cx="60" cy="70" r="1.3" opacity=".4"/><circle cx="150" cy="44" r="1" opacity=".3"/>
        <circle cx="268" cy="88" r="1.2" opacity=".35"/><circle cx="352" cy="52" r="1" opacity=".28"/>
      </g>
      ${beams}
      <!-- 断掉的梁口 -->
      <path d="M0 340l80 -12 -6 26 -74 10z" fill="#04070d"/>
      <path d="M350 300l80 -12v30l-76 8z" fill="#04070d"/>
      ${courses(360, 700, 44, 0, 430, 37, 0.3)}
      <!-- 风痕：三道极淡的横向拉丝（只有在这个高度才这么画） -->
      <g stroke="${COLD}" stroke-width="1" opacity=".13">
        <path d="M40 430q120 -14 240 0t150 6"/>
        <path d="M0 500q140 -12 250 2t180 8"/>
        <path d="M60 580q130 -10 230 4t140 4"/>
      </g>
      <!-- 守塔人的灯钩（挂在断梁上） -->
      <path d="M300 372v46" stroke="${INK2}" stroke-width="3"/>
      <path d="M300 418q-14 8 -14 24" fill="none" stroke="${INK2}" stroke-width="3"/>
      ${torch(142, 520, 0.7)}
      ${floorPlane(700, 91, '#060a10')}
      ${dust(101, 26, 300, 720)}`;
    return wrap('ridge', body);
  }

  // 第 8 层 · 空廊：一排空门洞，什么都没有
  function empty() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(50, 700, 50, 0, 430, 43, 0.34)}
      ${archRow(4, 300, 380, 74, 24, 30, '#03050a')}
      <!-- 门里各有一点不同的暗（有的深、有的浅，读得出「这些房间不一样」） -->
      <path d="M46 640V430q0 -30 37 -30t37 30v210z" fill="#05080e"/>
      <path d="M194 640V430q0 -30 37 -30t37 30v210z" fill="#080c14"/>
      <path d="M268 640V430q0 -30 37 -30t37 30v210z" fill="#04070c"/>
      <!-- 地上的一只空箱子 -->
      <path d="M96 700h64v54H96z" fill="${INK}"/>
      <path d="M96 700h64M128 700v54" stroke="${EDGE}" stroke-width="1.2" opacity=".45"/>
      ${torch(360, 500, 0.5)}
      ${floorPlane(700, 111, '#070b12')}
      ${dust(121, 20, 320, 720)}`;
    return wrap('empty', body);
  }

  // 第 9 层 · 钟楼：大钟悬在中央，钟舌断了
  function bell() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(20, 700, 46, 0, 430, 53, 0.3)}
      <!-- 钟架横梁 -->
      <path d="M20 120h390v26H20z" fill="${INK}"/>
      <path d="M20 120h390" stroke="${EDGE}" stroke-width="1.6" opacity=".5"/>
      <path d="M96 146v370M334 146v370" stroke="${INK2}" stroke-width="16"/>
      <!-- 大钟：钟形（下摆外扩）+ 顶部挂环 -->
      <path d="M215 160c-62 0-92 58-100 150l-14 108h228l-14-108c-8-92-38-150-100-150z" fill="${INK}"/>
      <path d="M215 160c-40 0-66 30-80 78 22 -18 48 -28 80 -28s58 10 80 28c-14 -48-40-78-80-78z" fill="#0b1018"/>
      <path d="M215 160c-62 0-92 58-100 150l-14 108h228l-14-108c-8-92-38-150-100-150z" fill="none" stroke="${EDGE}" stroke-width="2" opacity=".5"/>
      <circle cx="215" cy="152" r="16" fill="none" stroke="${INK}" stroke-width="6"/>
      <path d="M101 418h228" stroke="${EDGE}" stroke-width="1.6" opacity=".45"/>
      <path d="M126 360h178M140 300h150" stroke="#05080e" stroke-width="2" opacity=".8"/>
      <!-- 断掉的钟舌躺在地上 -->
      <path d="M198 690l34 -6 6 20 -32 8z" fill="${INK}"/>
      <path d="M198 690l34 -6" stroke="${EDGE}" stroke-width="1.2" opacity=".5"/>
      <!-- 钟绳（被割断，垂在半空） -->
      <path d="M300 146q6 90 -4 150" fill="none" stroke="${INK2}" stroke-width="4"/>
      ${brazier(74, 618, 0.62)}
      ${floorPlane(700, 131, '#060a10')}
      ${dust(141, 18, 260, 700)}`;
    return wrap('bell', body);
  }

  // 第 10 层 · 名墙：一整面刻满名字的墙，右下留一块空白
  function namewall() {
    const r = rng(151);
    let names = '<g stroke="#46536a" stroke-width="1.8" opacity=".9">';
    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 10; col++) {
        if (row > 7 && col > 7) continue;   // 右下那块空白：第六个名字只刻了一笔
        const x = 30 + col * 37;
        const y = 96 + row * 48;
        if (r() < 0.1) continue;
        const w = 12 + r() * 12;
        const tilt = (r() * 6 - 3).toFixed(0);
        names += `<path d="M${x} ${y}l${w.toFixed(0)} ${tilt}"/>`;
        // 每道名字中间再加一笔竖（像真刻过的字，不是一个横杠）
        if (r() < 0.7) names += `<path d="M${(x + w * 0.5).toFixed(0)} ${(y - 3).toFixed(0)}v7"/>`;
      }
    }
    names += '</g>';
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="#101823"/>
      <!-- 这一屏不许有砖缝：它是一整块被打磨过的碑面，横缝会和刻痕抢读 -->
      <path d="M18 40h394v660H18z" fill="#0d141e"/>
      <path d="M18 40h394v660H18z" fill="none" stroke="#2b3648" stroke-width="2" opacity=".8"/>
      ${names}
      <!-- 右下空白 + 一道起笔 -->
      <rect x="268" y="470" width="120" height="130" fill="#0b111a" opacity=".85"/>
      <path d="M268 470h120v130h-120z" fill="none" stroke="#4a566c" stroke-width="1.2" opacity=".45"/>
      <path d="M300 560l18 -10" stroke="${EDGE}" stroke-width="2" opacity=".5"/>
      <!-- 地上：一块刚凿下来的碎石与一把刻刀 -->
      <path d="M120 736l30 -12 26 12 -10 16 -36 0z" fill="${INK2}"/>
      <path d="M300 760l40 -8 4 8 -40 10z" fill="${INK2}"/>
      ${torch(66, 486, 0.72)}
      ${floorPlane(700, 161, '#06090f')}
      ${dust(171, 16, 300, 700)}`;
    return wrap('namewall', body);
  }

  // 第 11 层 · 刻名室：长桌、刻刀、一盏桌上的灯
  function carve() {
    const body = `
      <rect x="0" y="0" width="430" height="700" fill="url(#bWall)"/>
      ${courses(30, 700, 46, 0, 430, 67, 0.3)}
      <rect x="40" y="120" width="120" height="200" fill="#0a0f18"/>
      <rect x="40" y="120" width="120" height="200" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity=".4"/>
      <!-- 长桌 -->
      <path d="M30 560h374v22H30z" fill="${INK}"/>
      <path d="M30 560h374" stroke="#5a4a2e" stroke-width="2" opacity=".75"/>
      <path d="M30 582h374" stroke="${EDGE}" stroke-width="1" opacity=".3"/>
      <rect x="56" y="582" width="14" height="130" fill="${INK}"/>
      <rect x="366" y="582" width="14" height="130" fill="${INK}"/>
      <!-- 桌上：一块待刻的石板、两把刻刀、一盏灯 -->
      <path d="M150 500h120v58H150z" fill="#0d131d" stroke="${EDGE}" stroke-width="1.2" opacity=".8"/>
      <g stroke="#1b2331" stroke-width="1.4" opacity=".7">
        <path d="M164 522h40M164 536h26M214 522h42"/>
      </g>
      <path d="M300 556l54 -6 2 8 -54 6z" fill="${INK2}"/>
      <path d="M318 540l30 -4" stroke="${INK2}" stroke-width="3"/>
      <!-- 桌上的灯（唯一暖光，压得低，照在石板上） -->
      <g>
        <ellipse cx="250" cy="536" rx="120" ry="86" fill="url(#bGlow)" opacity=".7"/>
        <path d="M250 500v34" stroke="${INK}" stroke-width="3"/>
        <path d="M236 534h30l-4 14h-22z" fill="${INK}"/>
        <path d="M241 540h20l-2 6h-16z" fill="${WARM}" opacity=".9"/>
      </g>
      <!-- 椅子（空的，背对着门） -->
      <path d="M58 700v-90h8v90zM58 640h56v10H58zM106 640v70h8v-70z" fill="${INK}"/>
      ${floorPlane(700, 181, '#0a0f17')}
      ${dust(191, 18, 320, 720)}`;
    return wrap('carve', body);
  }

  // 第 12 层 · 塔顶·无名：断柱与云海，天色将明
  // 2026-11-24 重画：原来平台与石座都压在 y>730，正好被对话框盖住——画面剩下一片空天。
  // 现在整组抬到 y=380..700：断柱压左右两边，空石座在正中偏右，云海与天光在中段。
  function roof() {
    const body = `
      <rect width="430" height="900" fill="url(#bSky)"/>
      <!-- 天光：地平线一道暖带（本屏唯一暖光），从右侧漫上来 -->
      <ellipse cx="300" cy="600" rx="220" ry="110" fill="url(#bGlow)" opacity=".55"/>
      <path d="M0 592h430v26H0z" fill="${WARM}" opacity=".09"/>
      <!-- 云海：四层，越远越亮、越平 -->
      <path d="M0 470q120 -12 215 -2t215 2v18H0z" fill="#3d4c66" opacity=".38"/>
      <path d="M0 520q110 -20 215 -2t215 6v26H0z" fill="#2d3a52" opacity=".62"/>
      <path d="M0 580q130 -26 220 -4t210 8v34H0z" fill="#1f2a3d" opacity=".7"/>
      <path d="M0 646q120 -20 220 0t210 6v48H0z" fill="#161f2e" opacity=".8"/>
      <!-- 平台（y=700 起，给对话框留出下半屏） -->
      <path d="M0 700h430v200H0z" fill="#0a0f17"/>
      <path d="M0 700h430" stroke="${EDGE}" stroke-width="2" opacity=".6"/>
      <path d="M0 700h430" stroke="${COLD}" stroke-width="1" opacity=".18"/>
      <!-- 左断柱：齐腰断口 -->
      <path d="M46 700V392l30 -22v330z" fill="${INK}"/>
      <path d="M46 392l14 -20 8 12 8 -6v12z" fill="${INK}"/>
      <path d="M76 700V398" stroke="${COLD}" stroke-width="1.4" opacity=".22"/>
      <!-- 右断柱：高一些，带 brass 逆光边 -->
      <path d="M330 700V346l32 -24v378z" fill="${INK}"/>
      <path d="M330 346l16 -22 8 14 8 -8v12z" fill="${INK}"/>
      <path d="M330 700V346l32 -24" fill="none" stroke="${WARM}" stroke-width="1.6" opacity=".34"/>
      <!-- 中间的短柱残桩 -->
      <path d="M196 700V596h26v104z" fill="${INK}"/>
      <path d="M196 596l8 -12 10 8 8 -4v8z" fill="${INK}"/>
      <!-- 塔心石的空石座：三级台 + 中间空槽（带走/放下都在这） -->
      <path d="M158 700h110v-14H158z" fill="#0d141f"/>
      <path d="M174 686h78l-8 -20h-62z" fill="#0d141f"/>
      <path d="M190 666h46v-8h-46z" fill="#05080e"/>
      <path d="M158 686h110M174 666h78" stroke="${EDGE}" stroke-width="1.2" opacity=".5"/>
      <path d="M190 658h46" stroke="${WARM}" stroke-width="1.4" opacity=".3"/>
      <!-- 地上一块被掀翻的石板 -->
      <path d="M96 726l52 -8 6 14 -54 8z" fill="#0d141f" stroke="${EDGE}" stroke-width="1" opacity=".6"/>
      <g fill="${PAL}">
        <circle cx="60" cy="120" r="1.4" opacity=".45"/><circle cx="180" cy="80" r="1" opacity=".3"/>
        <circle cx="330" cy="140" r="1.2" opacity=".4"/><circle cx="250" cy="210" r="1" opacity=".26"/>
      </g>
      ${dust(201, 22, 280, 690)}`;
    return wrap('roof', body);
  }

  // 结局 · 塔外黎明（只在结局对白用）：海崖上的黑塔，门缝里还亮着一点
  function dawn() {
    const body = `
      <rect width="430" height="900" fill="url(#bSky)"/>
      <!-- 地平线天光：全屏唯一暖光 -->
      <path d="M0 500h430v44H0z" fill="${WARM}" opacity=".12"/>
      <ellipse cx="215" cy="516" rx="250" ry="96" fill="url(#bGlow)" opacity=".55"/>
      <!-- 海 -->
      <path d="M0 544h430v356H0z" fill="#080c14"/>
      <g stroke="${EDGE}" stroke-width="1" opacity=".3">
        <path d="M0 584q70 -6 140 0t150 0 140 0"/>
        <path d="M0 640q90 -6 170 0t180 0 80 0"/>
        <path d="M0 700q60 -5 130 0t160 0 140 0"/>
        <path d="M0 762q80 -5 150 0t160 0 120 0"/>
      </g>
      <!-- 黑塔剪影：收分塔身 + 垛口（与序章第四幕同一个形状） -->
      <path d="M258 900V418l36 -84h86l36 84v482z" fill="#04060b"/>
      <path d="M294 334h94v-14h-9v-13h-13v13h-11v-13h-13v13h-13v-13h-13v13h-13v-13h-9z" fill="#04060b"/>
      <path d="M258 900V418l36 -84" fill="none" stroke="${EDGE}" stroke-width="1.8" opacity=".45"/>
      <!-- 塔门：门缝一线暖光 -->
      <ellipse cx="337" cy="812" rx="86" ry="76" fill="url(#bGlow)" opacity=".6"/>
      <path d="M337 752v148" stroke="${HI}" stroke-width="2.4" opacity=".45"/>
      <path d="M337 752q-8 40 -6 84l4 64h5l4-64q2-46 -7-84z" fill="${HI}" opacity=".5"/>
      <!-- 崖边与礁石 -->
      <path d="M0 900v-76q120 -22 230 -6l40 8v74z" fill="${INK}"/>
      <path d="M0 824q120 -22 230 -6" fill="none" stroke="${EDGE}" stroke-width="1.4" opacity=".35"/>
      <g fill="${PAL}">
        <circle cx="70" cy="140" r="1.4" opacity=".4"/><circle cx="190" cy="90" r="1" opacity=".3"/>
        <circle cx="320" cy="170" r="1.2" opacity=".35"/>
      </g>`;
    return wrap('dawn', body);
  }

  // 钥匙 → 场景；由 scenes.js 按当前对白的 key / 楼层取
  const SCENES = {
    gate, corridor, market, passage, wolfhall, throne, ridge, empty, bell, namewall, carve, roof, dawn,
  };

  // 楼层 → 场景（0 基下标，锁芯是第 12）
  const FLOOR_SCENE = [
    'gate', 'corridor', 'market', 'passage', 'wolfhall', 'throne',
    'ridge', 'empty', 'bell', 'namewall', 'carve', 'roof', 'core',
  ];

  // 剧情键 → 场景（比楼层更准：商人在货摊，锁匠在王座厅 / 钟楼 / 名墙）
  const KEY_SCENE = {
    intro: null,                 // 序章四幕归 scenes.js
    candle1: 'gate', candle2: 'corridor', candle3: 'passage', candle4: 'ridge', candle5: 'namewall',
    solitude: 'ridge',
    merchant: 'market', merchant2: 'market', merchant3: 'market', merchant4: 'market',
    journal: 'passage', stele: 'gate',
    blockLore: 'corridor', blockLore2: 'core',
    coinBagLore: 'bell', eighthSword: 'wolfhall', wardLore: 'passage',
    bossYan: 'market', afterYan: 'market',
    bossJu: 'throne', afterJu: 'throne',
    bossDuo: 'bell', afterDuo: 'bell',
    bossHeng: 'namewall', afterHeng: 'carve',
    ch2: 'passage', ch3: 'ridge', ch4: 'namewall', core: 'core',
    heartTake: 'core', heartLeave: 'core',
    princessPlain: 'roof', princessPlainSword: 'roof', princessTrue: 'roof',
    afterChoicePlain: 'dawn', afterChoiceTrue: 'dawn',
  };

  // 2026-11-25：CG 接管。14 张背景改用本地 ComfyUI（SDXL）生成的位图（assets/cg/*.webp，430×900，合计 416KB），
  // 矢量版退为兜底：图没到/加载失败时它就是底图，不会出现黑屏。管线与提示词见 tools/cg-gen.js。
  const IMG = {
    gate: 'assets/cg/gate.webp', corridor: 'assets/cg/corridor.webp', market: 'assets/cg/market.webp',
    passage: 'assets/cg/passage.webp', wolfhall: 'assets/cg/wolfhall.webp', throne: 'assets/cg/throne.webp',
    ridge: 'assets/cg/ridge.webp', empty: 'assets/cg/empty.webp', bell: 'assets/cg/bell.webp',
    namewall: 'assets/cg/namewall.webp', carve: 'assets/cg/carve.webp', roof: 'assets/cg/roof.webp',
    core: 'assets/cg/core.webp', dawn: 'assets/cg/dawn.webp',
    // 序章四幕也用 CG（矢量分镜退为兜底）：挑一张「誓约之后第一批看到」的图最要紧
    intro1: 'assets/cg/intro1.webp', intro2: 'assets/cg/intro2.webp',
    intro3: 'assets/cg/intro3.webp', intro4: 'assets/cg/intro4.webp',
  };
  // CG 换图没有指纹（2026-11-25 叙事轮收口）：js/css 走 build 指纹，可 build 只算 html+css+js，
  // 换一张 assets/cg/dawn.webp 指纹不变 ⇒ 老玩家浏览器继续用旧图（结局那张已经换过一次了）。
  // 源码里是 'dev'，publish 那份由 tools/sync-publish.js 换成 assets/cg 的内容指纹——
  // 换图即换 URL，不靠人记得 bump。所有出图口子都必须走 cgSrc，别直接拼 IMG[k]。
  const ASSET_V = '463e930a';
  const cgSrc = (k) => { const s = IMG[k]; return s ? s + '?v=' + ASSET_V : ''; };
  // 序章用：只取图片标签（矢量分镜由 scenes.js 自己拼在下面当兜底）
  function imgTag(key) {
    const src = cgSrc(key);
    if (!src) return '';
    return `<div class="bd-shot" style="background-image:url(${src})"></div>`;
  }
  const cache = {};
  // opt.lit：锁芯专用——已得几枚锁环就点亮几道（0~4）。
  // 其余场景忽略 opt（同 key 复用同一份字符串，不重复生成）。
  function svg(key, opt) {
    if (key === 'core') {
      // 锁芯单独写：环形机关要按帧动（CSS 旋转），且要点亮几道随锁环数变
      const lit = Math.max(0, Math.min(4, (opt && opt.lit) | 0));
      const ck = 'core:' + lit;
      if (!cache[ck]) cache[ck] = coreSvg(lit);
      return cache[ck];
    }
    const fn = SCENES[key];
    if (!fn) return '';
    if (!cache[key]) cache[key] = fn();
    return cache[key];
  }

  // 上屏用：矢量打底 + CG 覆盖（图没到/没图时，露出的就是下面那张矢量）
  function layer(key, opt) {
    const base = svg(key, opt);
    if (!base) return '';
    const src = cgSrc(key);
    return src ? base + `<div class="bd-shot" style="background-image:url(${src})"></div>` : base;
  }

  // 锁芯：因为需要独立的动画层，单独拼一次。lit = 已得锁环数（0~4）。
  // 四道主环按章节上色（与 render.js drawCoreRings / 锁环卡的章色同一套），
  // 已得的实心点亮、未得的只剩一圈虚线底。
  // **这一层在 CG 接管后只是兜底**（2026-11-26 实测）：`.bd-shot` 不透明、z-index:1 压在它上面，
  // 有图时玩家一道环也看不见（无头截图里能看见，是 sceneIn 淡入被虚拟时间冻在 37% 的假象）。
  // 读数由两处承担：第 13 层开场那句旁白（`View.coreRingLine`，按真实枚数念）+ 地图上
  // `drawCoreRings` 画在塔心石四周的四段弧——别再把「抬头一看」当成这一层的职责。
  const CORE_CH = ['#b9a6ff', '#ff7d7d', '#e8c46a', '#9fd8ff'];
  function coreSvg(lit) {
    let rings = '';
    for (let i = 0; i < 4; i++) {
      const r = 90 + i * 46;
      const on = i < (lit || 0);
      rings += `<circle cx="215" cy="470" r="${r}" stroke="${on ? CORE_CH[i] : COLD}" stroke-width="${on ? 2 : 1.2}"`
        + ` opacity="${on ? 0.9 : 0.16}"${on ? '' : ' stroke-dasharray="4 7"'}/>`;
      if (on) {
        rings += `<circle cx="215" cy="470" r="${r}" stroke="${CORE_CH[i]}" stroke-width="7" opacity=".10"/>`;
      }
    }
    // 最外一道装饰环（不参与进度）
    rings += `<circle cx="215" cy="470" r="274" stroke="${COLD}" stroke-width="1" opacity=".10"/>`;
    let ticks = '';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x1 = 215 + Math.cos(a) * 208;
      const y1 = 470 + Math.sin(a) * 208;
      const x2 = 215 + Math.cos(a) * 224;
      const y2 = 470 + Math.sin(a) * 224;
      ticks += `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)}L${x2.toFixed(0)} ${y2.toFixed(0)}"/>`;
    }
    const body = `
      <rect width="430" height="900" fill="#070b12"/>
      ${courses(0, 900, 40, 0, 430, 71, 0.18)}
      <g class="bd-turn" fill="none" stroke="${COLD}">${rings}</g>
      <g stroke="${COLD}" stroke-width="2" opacity=".28">${ticks}</g>
      <path d="M176 700l12 -120h54l12 120z" fill="${INK}"/>
      <path d="M188 580h54" stroke="${EDGE}" stroke-width="1.6" opacity=".6"/>
      <path d="M196 596h38l-4 66h-30z" fill="${COLD}" opacity=".12"/>
      <ellipse cx="215" cy="470" rx="150" ry="150" fill="url(#bGlow)" opacity=".28"/>
      <g fill="${INK}">
        <path d="M34 900V300h26v600z"/><path d="M370 900V300h26v600z"/>
        <path d="M92 900V420h18v480z"/><path d="M320 900V420h18v480z"/>
      </g>
      <g stroke="${EDGE}" stroke-width="1.2" opacity=".4">
        <path d="M34 340h26M370 340h26M92 460h18M320 460h18"/>
      </g>
      ${torch(215, 640, 0.5)}
      ${dust(211, 26, 200, 780)}`;
    return wrap('core', body);
  }

  // 首帧手感（2026-11-25 焦点A）：CG 是 background-image，从来没谁预载过 —— 每一幕第一次出现时
  // 先露出下面的矢量底图，等 webp 解码完再「啪」地换上去，读起来像背景闪了一下。
  // 做法：页面 load 后空闲时把 18 张图各 new Image() 一次，序章四张排最前（最先被看到）；
  // 只是预热缓存，不挂 DOM、不改任何一屏的内容。
  function preload() {
    const keys = Object.keys(IMG).sort((a, b) => (/^intro/.test(a) ? 0 : 1) - (/^intro/.test(b) ? 0 : 1));
    keys.forEach((k) => {
      const im = new Image();
      im.decoding = 'async';
      im.src = cgSrc(k);
    });
    return keys.length;
  }

  function pick(ctx) {
    const k = ctx && ctx.key;
    if (k && Object.prototype.hasOwnProperty.call(KEY_SCENE, k)) {
      const hit = KEY_SCENE[k];
      if (hit) return hit;
      return null;
    }
    const f = ctx && typeof ctx.floor === 'number' ? ctx.floor : 0;
    return FLOOR_SCENE[Math.max(0, Math.min(FLOOR_SCENE.length - 1, f))] || 'gate';
  }

  window.Backdrops = { svg, layer, pick, imgTag, preload, cgUrl: cgSrc, assetV: ASSET_V, has: (k) => !!SCENES[k], FLOOR_SCENE, KEY_SCENE };

  // 预热只跑一次：load 已过就直接排，否则等 load（once，避免重复挂监听）。
  if (typeof document !== 'undefined' && typeof window.Image === 'function') {
    const kick = () => {
      if (window.requestIdleCallback) window.requestIdleCallback(preload, { timeout: 2500 });
      else setTimeout(preload, 400);
    };
    if (document.readyState === 'complete') kick();
    else window.addEventListener('load', kick, { once: true });
  }
})();
