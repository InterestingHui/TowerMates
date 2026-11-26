// TowerMates · 誓约徽记（js/vow-icons.js，零依赖）
// 为什么存在：誓约卡原先贴整颗 emoji（🚪🕊️🪙🪵🛡️🕳️）——彩色卡通贴在暗金卡上，
// 与全站的 Noir Silhouette 黄铜线刻语言完全脱节（2026-11-17 用户反馈「丑的想吐」）。
// 这里给六条誓约 + 首局「先进塔看看」各画一枚 24×24 线刻徽记：
//   线色走黄铜亮档 #e8c46a，粗细 1.6（大形）/1.2（细部），fill 极少——
//   按 style-bibles/TowerMates.md §6：形状承载语义，颜色只做强调。
// 唯一 fill：徽记中央的小焦点（蜡/币心/盾面），亮度高于线，保证 32px 下读得清。
// 旧的 v.emoji 字段保留（成就墙 / 结算 chip 仍引用），本模块只管誓约卡与「下一局预告」chip。
(function () {
  // 线/焦点色默认黄铜；2026-11-24 起 icon() 支持传主色（六条誓约各有自己的主色，
  // 立誓卡与「誓约已立」回执靠它一眼分开，线刻形状仍然共用一套语言）。
  // viewBox 24×24，图形主体落在 3..21，安全边 3px（§3.3 同款纪律）
  const S = 'stroke="#e8c46a" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const F = 'fill="#ffe6a8"';
  // viewBox 24×24，图形主体落在 3..21，安全边 3px（§3.3 同款纪律）
  const GLYPHS = {
    // 不立誓：一枚素环——塔是什么样就什么样，不加任何修饰
    none: `<circle cx="12" cy="12" r="7.2" ${S} stroke-width="1.6"/>
           <circle cx="12" cy="12" r="2.1" ${F} opacity=".9"/>`,
    // 利齿之誓（怪物伤害 +10%）：一颗尖牙——塔开始咬人
    dmg10: `<path d="M6.6 6 C9.2 7.8 9 12.4 12 19 C15 12.4 14.8 7.8 17.4 6 C13.4 8.4 10.6 8.4 6.6 6 Z" ${S} stroke-width="1.6"/>
            <path d="M9.4 9.4 L12 13.2 L14.6 9.4" ${S} stroke-width="1.2" opacity=".55"/>`,
    // 重压之誓（怪物伤害 +20%）：两道下压的箭脊，压在裂开的地面上
    dmg20: `<path d="M6 4.8 L12 8.4 L18 4.8" ${S} stroke-width="1.6"/>
            <path d="M6 9.6 L12 13.2 L18 9.6" ${S} stroke-width="1.6"/>
            <path d="M4.8 18.4 H19.2" ${S} stroke-width="1.6"/>
            <path d="M9 18.4 l1.6 2.2 M15 18.4 l-1.6 2.2" ${S} stroke-width="1.2" opacity=".6"/>
            <circle cx="12" cy="16.4" r="1" ${F} opacity=".85"/>`,
    // 慈悲之誓：衔枝的鸽颈收成一条弧，枝是唯一 fill
    mercy: `<path d="M6 17 C6 10.5 10 6.5 15.5 6.5 C17.5 6.5 19 7.5 19 7.5 C19 7.5 17 9 15 9 C12 9 9.5 11.5 9.5 15 C9.5 15.8 9.7 16.6 10 17.3 L8.5 19 C7.2 18.6 6 18 6 17 Z" ${S} stroke-width="1.6"/>
            <path d="M15.5 6.5 C17 5.8 18.2 5.6 19.4 5.9" ${S} stroke-width="1.2"/>
            <circle cx="16.6" cy="7.6" r=".9" ${F}/>
            <path d="M11.5 15.5 l3.4 -1.7 3.4 1.7 -3.4 -1" ${S} stroke-width="1.2"/>`,
    // 贪婪之誓：一枚币，内方孔——塔的账房记号
    greed: `<circle cx="12" cy="12" r="7.2" ${S} stroke-width="1.6"/>
            <circle cx="12" cy="12" r="6" ${S} stroke-width=".8" opacity=".45"/>
            <path d="M10.4 10.4 h3.2 v3.2 h-3.2 z" ${F}/>`,
    // 苦行之誓：一截缠枝木杖——杖身三圈缠痕
    ascetic: `<path d="M9 20 L13.4 4.6" ${S} stroke-width="1.6"/>
              <path d="M13.4 4.6 l2.8 -1.2" ${S} stroke-width="1.6"/>
              <path d="M9.8 16.6 q3 -1.4 5.6 .4 M10.8 13 q3 -1.4 5.6 .4 M11.9 9.4 q3 -1.4 5.6 .4" ${S} stroke-width="1.2"/>
              <circle cx="13.2" cy="9.2" r="1" ${F} opacity=".85"/>`,
    // 铁壁之誓：塔盾——上平下尖，中脊一条竖线
    guard: `<path d="M6 6.5 H18 V12 C18 16 15.6 18.8 12 20.2 C8.4 18.8 6 16 6 12 Z" ${S} stroke-width="1.6"/>
            <path d="M12 6.5 V17.5" ${S} stroke-width="1.1" opacity=".6"/>
            <path d="M12 9.2 l2.6 1.7 v2.4 L12 14.4 9.4 13.3 v-2.4 z" ${F} opacity=".85"/>`,
    // 无名之誓：一枚井口/锁孔——吞名字的洞
    nameless: `<circle cx="12" cy="10" r="4.6" ${S} stroke-width="1.6"/>
               <path d="M10.6 13.8 L9.4 19 H14.6 L13.4 13.8" ${S} stroke-width="1.6"/>
               <ellipse cx="12" cy="10" rx="1.6" ry="2" ${F} opacity=".9"/>`,
    // 首局「先进塔看看」：半开的塔门 + 门缝一线光
    door: `<path d="M5 20 V8.5 L12 4.5 V20" ${S} stroke-width="1.6"/>
           <path d="M12 20 H19 V8.5" ${S} stroke-width="1.6"/>
           <path d="M19 8.5 C19 5.6 16.8 4 15.5 4" ${S} stroke-width="1.2"/>
           <path d="M9.2 20 V8.9" ${S} stroke-width="1.2"/>
           <path d="M14.2 20 V9.4 L12 8.9 V20" fill="#ffe6a8" opacity=".55"/>
           <circle cx="16.6" cy="14" r=".9" ${F}/>`,
  };
  // 尺寸档：卡上 30px，chip 里 14px。line-height 由外部容器管，svg 垂直对齐走 CSS。
  // col：主色（可选）。传入时把线色换成主色、焦点色换成同色提亮——形状不变，只换颜色语言。
  function icon(id, size, col) {
    let g = GLYPHS[id] || GLYPHS.none;
    if (col) {
      const hi = col;
      g = g.split('#e8c46a').join(hi).split('#ffe6a8').join(hi);
    }
    const s = size || 24;
    return '<svg class="vow-glyph" viewBox="0 0 24 24" width="' + s + '" height="' + s
      + '" aria-hidden="true" focusable="false" style="' + (col ? 'filter:drop-shadow(0 0 6px ' + col + '55)' : '') + '">' + g + '</svg>';
  }
  window.VowIcons = { icon, has: (id) => !!GLYPHS[id] };
})();
