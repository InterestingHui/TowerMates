// TowerMates · 视图模型层（纯函数：不碰 DOM、不读引擎全局、不掷骰、不读时钟）
// 为什么要这一层：榜单与商店这两块屏的**规则**（排序 / 筛选 / 行数上限 / 折叠哪些货 /
// 「还差 N 金」「再买 N 次能打过」这些算术）原本和拼标签的模板揉在 main.js 里，
// 只能靠浏览器探针验「画出来的字长什么样」，验不了「这个数算得对不对」。
// 搬到这儿之后是纯数据进、纯数据出：Node 单测能直接盯规则，将来换壳（canvas UI）
// 也只需要换「怎么画」，不用重新推导「这一屏该长什么样」。
// 依赖一律由调用方注入（fx.*），本文件不 require 任何东西。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.View = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ---------- 榜单：排序口径（走到哪层 → 结局 → 决战余裕 → 用时 → 步数） ----------
  const MARGIN_RANK = { S: 4, A: 3, B: 2, C: 1 };
  const marginRank = (r) => MARGIN_RANK[r && r.margin] || 0;
  function cmpBoard(a, b) {
    return (b.floor || 0) - (a.floor || 0)
      || (b.ending === 'true' ? 1 : 0) - (a.ending === 'true' ? 1 : 0)
      || marginRank(b) - marginRank(a)
      || (a.time || 999999) - (b.time || 999999)
      || (a.steps || 0) - (b.steps || 0);
  }
  const fmtTime = (t) => (t >= 60 ? `${Math.floor(t / 60)}分${t % 60}秒` : `${t}秒`);
  const endName = (e) => (e === 'true' ? '第六个名字' : e === 'plain' ? '铁与霜' : '未竟');

  // 档位按誓约难度序排（不立誓 → 慈悲 → 贪婪 → 苦行 → 铁壁 → 无名）；
  // 这张表是全集合的唯一来源——加一条誓约必须同时加一档，否则那批局只能淹在「全部」里
  const BOARD_TABS = [
    ['all', '全部'], ['daily', '今日'], ['none', '不立誓'], ['mercy', '慈悲'],
    ['greed', '贪婪'], ['ascetic', '苦行'], ['guard', '铁壁'], ['nameless', '无名'],
  ];
  const BOARD_CAP = 10;
  const NOTE_DAILY = '这一座塔每天零点换一次：同一天走进来的人遇到的是同一座，所以「今天谁走得远」是能比的。贴进来的朋友码只要也是今天这座，就会进这一档。';
  const NOTE_CRUSHED = '影子勇者都停在前五层。你已经走到他们没到过的地方。';
  const EMPTY_OTHER = '这一档还没有人。去立一条誓约，回来占第一位。';
  const dailyEmpty = (label) => `今天还没走完一局今日一塔。<br>${label} 这座塔零点就换掉了。`;

  // 榜单模型
  // input: { mine, rivals, shadows, filter, todayKey, dayLabel, vows, rivalNotes, cap }
  //   mine / rivals / shadows 都是存档里的原始记录（对象），filter 是当前档位 id
  // 输出：{ filter, tabs, note, empty, rows, total }，rows 只含「画出来要用的字段」
  function boardModel(input) {
    const o = input || {};
    const vows = o.vows || {};
    const notes = o.rivalNotes || {};
    const cap = o.cap || BOARD_CAP;
    const filter = o.filter || 'all';
    const mine = (o.mine || []).map((x) => Object.assign({ mine: true, vow: x.vow || 'none' }, x));
    const all = (o.shadows || []).map((x) => Object.assign({ vow: 'none' }, x))
      .concat(o.rivals || [])
      .concat(mine);
    all.sort(cmpBoard);
    const rows = filter === 'daily'
      ? all.filter((r) => r.daily === o.todayKey)
      : filter === 'all' ? all : all.filter((r) => (r.vow || 'none') === filter);
    // 「你已经走到他们没到过的地方」说的是**影子勇者**（那句话自己点了名），所以只跟影子比：
    // 按「榜首是谁」判的话，我一超过影子就排到自己头上、这句话永远出不来（原实现就是这么死掉的）
    const myFloor = mine.length ? Math.max.apply(null, mine.map((x) => x.floor || 0)) : 0;
    const shadowFloors = (o.shadows || []).map((x) => x.floor || 0);
    const shadowBest = shadowFloors.length ? Math.max.apply(null, shadowFloors) : -1;
    const crushed = myFloor > 0 && shadowBest >= 0 && myFloor > shadowBest;
    const note = filter === 'daily'
      ? NOTE_DAILY
      : (crushed && filter === 'all' ? NOTE_CRUSHED : '');
    const out = rows.slice(0, cap).map((r, i) => {
      const v = vows[r.vow] || vows.none || { name: '不立誓', tag: '' };
      return {
        rank: i + 1,
        // 幽灵行不再把楼层写进名字里：同一行的「N层」列就是那个数，写两遍只是噪音
        name: r.mine ? '你' : r.rival ? '挑战·朋友' : r.name,
        note: (!r.mine && !r.rival && notes[r.name]) || '',
        vowTag: v.name === '不立誓' ? '' : (v.tag || '').charAt(0),
        mine: !!r.mine,
        rival: !!r.rival,
        end: endName(r.ending),
        ended: r.ending === 'true',
        margin: r.margin || '',
        floor: r.floor || 0,
        steps: r.steps || 0,
        time: r.time ? fmtTime(r.time) : '—',
      };
    });
    return {
      filter,
      tabs: BOARD_TABS.map(([id, label]) => ({ id, label, on: id === filter })),
      note,
      empty: rows.length ? '' : (filter === 'daily' ? dailyEmpty(o.dayLabel || '') : EMPTY_OTHER),
      rows: out,
      total: rows.length,
    };
  }

  // ---------- 商店：货架与「明码取舍」的每一句话 ----------
  const SHOP_CORE = ['key', 'potion', 'atk', 'def'];
  const TIP_BLOCK = '学会格挡：每层一次，战斗中点盾把承伤降到 55%';
  const TIP_SHARD = '带一点塔的心跳出去：**通关余烬 +8**（唯一）';
  // 货架上写的数必须和「买完真到手」的增量同源：
  // 药水回复量会被干粮之环 ×1.3（引擎 potionHeal 是唯一出口），所以这里也不许写死价目表里的原值——
  // 否则戴着环的玩家看到「回复 160」，实际到手 208，明码取舍当场变成猜。
  const baseTip = (item, fx) => (item.relic ? fx.relicDesc(item.relic)
    : item.key ? (item.key === 'y' ? '开黄门' : '开红门')
      : item.hp ? `回复 ${fx.potionHeal ? fx.potionHeal(item.hp) : item.hp} 生命`
        : item.atk ? `攻击 +${item.atk}`
          : item.def ? `防御 +${item.def}`
            : item.block ? TIP_BLOCK
              : item.heartShard ? TIP_SHARD
                : '怪物情报');

  // 商店模型
  // input: { s, stock, dealId, stuck, core, atkItem, fx }
  //   fx: { price(item), listPrice(item), owned(item), relicDesc(id),
  //         forbidsBlock(), floorsLeft(), monsterDefByName(name) }
  // 输出：{ gold, deal, rows, more }——rows 里的 tip 仍带 `**重点**` 标记，渲染层照旧走 renderRich
  function shopModel(input) {
    const o = input || {};
    const s = o.s || {};
    const fx = o.fx || {};
    const stock = o.stock || [];
    const core = o.core || SHOP_CORE;
    const gold = s.gold || 0;
    const flags = s.flags || {};
    const dealId = o.dealId || null;
    // 行情：这一层摊主让价的那一件（按「本局种子 + 楼层」定，重进 / 重来都不重摇）
    const dealItem = dealId ? stock.find((i) => i.id === dealId) : null;
    const deal = dealItem
      ? { name: dealItem.name, was: fx.listPrice(dealItem), now: fx.price(dealItem) }
      : null;
    // 折叠不是藏能力：还没学格挡的人盾谱必须留在首屏（第 3 层是唯一补学机会）
    const foldFirst = !!o.foldFirst;
    const needBlockBook = !flags.hasBlock && !fx.forbidsBlock();
    const rowsIn = foldFirst
      ? stock.filter((i) => core.indexOf(i.id) >= 0 || (i.id === 'blockbook' && needBlockBook))
      : stock;
    // 卡关指引：挡住去路的那只怪是谁、够不够打
    const stuck = o.stuck || null;
    let needAtk = null;
    if (stuck && stuck.key === 'stuckDef') {
      const def = fx.monsterDefByName(stuck.monster);
      if (def != null) needAtk = { name: stuck.monster, def };
    }
    const rows = rowsIn.map((item) => {
      const owned = !!fx.owned(item);
      // 铁壁 / 苦行 / 无名三条誓约不能格挡：盾谱置灰，别让人白花钱
      const forbidden = !!(item.block && fx.forbidsBlock());
      const price = fx.price(item);
      const afford = gold >= price;
      let tip = baseTip(item, fx);
      if (forbidden) tip = '**这条誓约不能格挡**，买了也用不上';
      // 唯一 / 关键品保底：钱不够时说清「差多少、本层还剩几只怪可刷」
      if (!owned && !forbidden && !afford && (item.once || item.block)) {
        const left = fx.floorsLeft();
        const what = item.block ? '学会格挡' : item.codex ? '怪物情报永久解锁' : item.heartShard ? '通关余烬 +8' : item.relic ? fx.relicDesc(item.relic) : '';
        tip = `${what ? what + ' · ' : ''}还差 **${price - gold}** 金${left ? ` · 这一层还剩 **${left}** 只怪可刷` : ' · 这一层已经清空，回下层找钱'}`;
      }
      if (item.atk && needAtk) {
        const gap = needAtk.def + 1 - (s.atk || 0);
        const times = Math.max(1, Math.ceil(gap / item.atk));
        const per = (o.atkItem ? fx.price(o.atkItem) : 0) || price;
        tip = `攻击 +${item.atk} · **再买 ${times} 次（${times * per} 金）能打过${needAtk.name}**`;
      } else if (item.def && stuck && stuck.key === 'stuckHp') {
        tip = `防御 +${item.def} · **买几个能少掉不少血**`;
      }
      return {
        id: item.id,
        emoji: item.emoji || '',
        name: item.name || '',
        tags: []
          .concat(item.once ? [{ text: '唯一', cls: '' }] : [])
          .concat(item.id === dealId ? [{ text: '让价', cls: 'deal' }] : []),
        price,
        owned,
        forbidden,
        disabled: owned || forbidden || !afford,
        label: owned ? '已拥有' : forbidden ? '不适用' : '购买',
        tip,
      };
    });
    // 「更多货」摘要按这一层实际折进去的货生成：买过的盾谱 / 镜子不该再被念一遍
    const folded = rowsIn === stock ? [] : stock.filter((i) => rowsIn.indexOf(i) < 0);
    const more = folded.length
      ? { count: folded.length, names: folded.slice(0, 3).map((i) => i.name).join(' / ') }
      : null;
    return { gold, deal, rows, more, foldFirst, needBlockBook };
  }

  return {
    boardModel, shopModel,
    cmpBoard, fmtTime, endName, marginRank,
    BOARD_TABS, BOARD_CAP, SHOP_CORE,
    NOTE_DAILY, NOTE_CRUSHED, EMPTY_OTHER, TIP_BLOCK, TIP_SHARD,
  };
});
