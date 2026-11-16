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
  // 副标题是单行区（最多两行）：写满会正好截在「承伤降到 55%」这个数字上，
  // 「每层一次」与「战斗中点盾」的关系由买下后的提示条补（「格挡已学会：每层一次，战斗中点盾」）
  const TIP_BLOCK = '格挡：每层一次，承伤降到 55%';
  const TIP_SHARD = '带一点塔的心跳出去：**通关余烬 +8**（唯一）';
  // 缺钱时那句「这一层还剩 N 只怪可刷」每件货都一样，逐行重复既啰嗦又把副标题撑成三四行；
  // 收成货架下方一行（见 shopModel 返回的 farm）
  const farmLine = (left) => (left ? `这一层还剩 **${left}** 只怪可刷` : '这一层已经清空，回下层找钱');
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
    // 有几件「差钱的一次性货」——有才在货架下方挂一行刷钱指引
    let needGold = 0;
    const rows = rowsIn.map((item) => {      const owned = !!fx.owned(item);
      // 铁壁 / 苦行 / 无名三条誓约不能格挡：盾谱置灰，别让人白花钱
      const forbidden = !!(item.block && fx.forbidsBlock());
      const price = fx.price(item);
      const afford = gold >= price;
      let tip = baseTip(item, fx);
      if (forbidden) tip = '**这条誓约不能格挡**，买了也用不上';
      // 钱不够：差额挪到价格列（「120 / 还差 110」），不再挤占副标题——
      // 副标题只有一行宽（360 宽下 98px），塞下「还差 N 金」就会把 55%、+8 这类真数字挤成省略号
      const gap = (!owned && !forbidden && !afford) ? price - gold : 0;
      if (gap > 0 && (item.once || item.block)) needGold++;
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
        gap,
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
    return {
      gold, deal, rows, more, foldFirst, needBlockBook,
      // 缺钱时才有的那一行：把「本层还剩几只可刷」从每件货的副标题里收上来
      farm: needGold > 0 ? { text: farmLine(fx.floorsLeft()), count: needGold } : null,
    };
  }

  // ---------- 结算：塔印与余烬（这一屏每一句都是算术） ----------
  // 塔印不看分数，只看这一局真的做到了什么。搬进来的是「判定」与「还差什么」这一对——
  // 它们必须同源：提示说「再拿到 2 枚锁环可换留名」，就真的得能换到，否则玩家照做一局白费。
  const SEALS = {
    clear: { name: '无痕', desc: '六盏灯全亮。这一趟，你没欠谁。' },
    ward:  { name: '守灯', desc: '灯还亮着。你没让它灭在自己手里。' },
    name:  { name: '留名', desc: '塔的墙上，多了你的一道刻痕。' },
    rough: { name: '未竟', desc: '塔记住了你的名字——仅此而已。' },
    fall:  { name: '折戟', desc: '你没能走到结局。塔替你记下倒下的地方。' },
  };
  // input: { ending, echoDone, retries }——折戟（fall）不参与竞争，由死亡页单独取用
  function sealOf(input) {
    const o = input || {};
    const echoDone = o.echoDone || 0;
    const trueEnd = o.ending === 'true';
    const noRetry = !o.retries;
    if (trueEnd && echoDone >= 4 && noRetry) return 'clear';
    if (trueEnd && echoDone >= 3) return 'ward';
    if (echoDone >= 2) return 'name';
    return 'rough';
  }
  // 「下一枚塔印」的目标状态：把「还差什么」从一句话变成一份可验证的条件。
  // 为什么要有这一层：这句话原本是手写的文案 + 手写的判据，两边各写一遍就必然会漂——
  // 实测普通结局停在「留名」时提示只写「念出第六个名字，塔印才会再往上走」，
  // 可 sealOf 要求真结局**且** 3 枚锁环，照做（2 枚 + 真结局）仍停在留名，白打一局。
  // 现在提示由 target 反推，单测直接验「把 target 喂回 sealOf，真的升到下一档」。
  function sealTarget(seal, input) {
    const o = input || {};
    const echoDone = o.echoDone || 0;
    const retries = o.retries || 0;
    if (seal === 'clear' || seal === 'fall') return null;
    // 目标档位不手写，一律由「最小一步之后的状态」反查——
    // 手写过一次就吃到过教训：手里已有 4 枚锁环、一次没回头的人，念出第六个名字会直接跳到「无痕」，
    // 而手写的目标写的是「守灯」（少报一档，玩家照做反而像被骗）。
    const step = (st) => {
      const s2 = sealOf(st);
      return s2 === seal ? null : { seal: s2, ending: st.ending, echoDone: st.echoDone, retries: st.retries };
    };
    if (seal === 'rough') return step({ ending: o.ending, echoDone: 2, retries });
    if (seal === 'name') return step({ ending: 'true', echoDone: Math.max(3, echoDone), retries });
    return step({ ending: 'true', echoDone: 4, retries: 0 });
  }
  // 「下一枚塔印还差什么」：每一句都只报 target 与当前状态的差，不再自己另写一套门槛
  function nextSealHint(seal, input) {
    const o = input || {};
    const echoDone = o.echoDone || 0;
    const retries = o.retries || 0;
    const trueEnd = o.ending === 'true';
    const t = sealTarget(seal, o);
    if (!t) return null;
    const target = SEALS[t.seal] ? SEALS[t.seal].name : '';
    const need = t.echoDone - echoDone;
    if (seal === 'rough') return `再拿到 ${need} 枚锁环，可换「${target}」`;
    if (seal === 'name') {
      // 已经念出第六个名字的，只差锁环；还没念的，两件事都得做（顺序随意）
      if (trueEnd) return `锁环攒到 ${t.echoDone} 枚可换「${target}」`;
      return need > 0
        ? `先念出第六个名字、再把锁环攒到 ${t.echoDone} 枚，可换「${target}」`
        : `念出第六个名字，可换「${target}」`;
    }
    return `锁环 ${echoDone}/4 · 回头 ${retries} 次——四章全拿且一次不回头可换「${target}」`;
  }

  // 余烬明细：按这一局留下的东西逐项累加（不再绕分数换算）。
  // 全部外部事实都由调用方注入——「带着哪枚环」「某誓约首通了没」这些只有引擎/Meta 知道；
  // 搬进来的是「哪些条目算、各算多少、合计多少」这套规则。
  // input: { s, echoDone, vowDef, vowId, fx }
  //   fx: { hasRing(id), timeSec(), bareUnlocked(), firstWin(vowId), cleanEmber() }
  function emberModel(input) {
    const o = input || {};
    const s = o.s || {};
    const flags = s.flags || {};
    const vowDef = o.vowDef || { name: '不立誓' };
    const vowId = o.vowId || 'none';
    const fx = o.fx || {};
    const has = (id) => !!fx.hasRing && fx.hasRing(id);
    const parts = [{ label: '走到结局', n: 5 }];
    if (s.ending === 'true') parts.push({ label: '念出第六个名字', n: 4 });
    const kills = Math.floor((flags.killCount || 0) / 10);
    if (kills) parts.push({ label: `击杀 ${flags.killCount} 只`, n: kills });
    if (flags.heart === 'left') parts.push({ label: '塔心留在原处', n: 3 });
    // 决战余裕 S（打完碑魔还剩 70% 以上）：替「打得干净」记一笔，只此一档
    const fhp = flags.finalHp;
    const fmhp = flags.finalMaxHp;
    if (fmhp > 0 && fhp / fmhp >= 0.7) parts.push({ label: '决战余裕 S', n: 2 });
    // 「一口空气」首解锁：一件遗物都没拿走到结局，第一次额外给 5 余烬。
    // 必须在结算明细里算进去——成就解锁发生在面板渲染之后，余额才不会对不上
    const bareRun = !!s.ending && !Object.keys(flags).some((k) => k.indexOf('relic_') === 0);
    if (bareRun && !(fx.bareUnlocked && fx.bareUnlocked())) parts.push({ label: '一口空气（首次）', n: 5 });
    if (flags.eventEmber) parts.push({ label: '路遇里的选择', n: flags.eventEmber });
    if (flags.heartShard) parts.push({ label: '塔心碎片', n: 8 });
    // 誓约奖励：其他誓约用「誓约名」（那是玩家主动立的），不立誓改成陈述句
    if (vowDef.reward) {
      const vowLabel = vowId === 'none' ? '无誓通关' : `「${vowDef.name}」`;
      parts.push({ label: vowLabel, n: vowDef.reward });
    }
    // 解锁誓约第一次通关：额外给解锁成本的一半，让「解锁 → 真的用它」当场回本一半
    if (vowDef.ember && !(fx.firstWin && fx.firstWin(vowId))) {
      parts.push({ label: `首通「${vowDef.name}」`, n: Math.round(vowDef.ember / 2) });
    }
    if (has('ledger') || has('ash') || has('ledger2')) parts.push({ label: '锁环·击杀余烬翻倍', n: kills });
    // 第七格：保底 +3，一次没回头（没重来本层）再 +3——与「刻刀」的稳定 +4 形成「稳 vs 冒险」
    if (has('seventh')) {
      const clean = !flags.retries;
      parts.push({ label: clean ? '锁环·第七格（一次没回头）' : '锁环·第七格', n: clean ? 6 : 3 });
    }
    // 落笔之环：保底 +2，剩下的金币每 100 再 +1（上限 6）。
    // 曾按「每 100 金 +1、上限 5」做过，sim 验证是陷阱：留 500 金会少 28 点攻，终局血量从 66.6% 掉到 48.5%，
    // 却只换到 2 余烬——保底把它拉回「稳定小收益」。
    if (has('quill')) {
      const byGold = 2 + Math.min(4, Math.floor((s.gold || 0) / 100));
      parts.push({ label: `锁环·落笔（剩 ${s.gold} 金）`, n: byGold });
    }
    // 落款之环：本局第一次收录进图鉴的件数，每件 +1（上限 5，避免开局撞大运爆收益）
    if (has('signature')) {
      const nNew = Array.isArray(flags.collectNew) ? Math.min(5, flags.collectNew.length) : 0;
      if (nNew > 0) parts.push({ label: `锁环·落款（图鉴新收录 ${nNew} 件）`, n: nNew });
    }
    // 通关型锁环各有触发条件，逐条列出来源（不再是「锁环加成」一笔带过）
    if (has('pace')) parts.push({ label: '锁环·更漏', n: 2 });
    if (has('chisel')) parts.push({ label: '锁环·刻刀', n: 4 });
    if (has('hour')) {
      const mins = Math.round(((fx.timeSec && fx.timeSec()) || 0) / 60);
      if (mins > 0 && mins <= 20) parts.push({ label: `锁环·时辰（${mins} 分钟内通关）`, n: 4 });
      else parts.push({ label: '锁环·时辰', n: 2 });
    }
    if (has('oath')) {
      const withVow = (flags.vow || 'none') !== 'none';
      parts.push({ label: withVow ? `锁环·守誓（${vowDef.name || '誓约'}）` : '锁环·守誓', n: withVow ? 5 : 3 });
    }
    if (has('heart') && flags.heart === 'left') parts.push({ label: '锁环·塔心（放下）', n: 3 });
    // 拾柴之环：每击败一位锁匠 +2（与击杀数无关，奖励推进度）
    if (has('ash')) {
      const bossesDown = ['N', 'Z', 'Y', 'U'].filter((c) => flags['bossKilled_' + c]).length;
      if (bossesDown > 0) parts.push({ label: `锁环·拾柴（${bossesDown} 位锁匠）`, n: bossesDown });
    }
    // 终章之环：四位锁匠全倒才给（要求把四位都打完，比拾柴更严格）
    if (has('finale')) {
      const allBosses = ['N', 'Z', 'Y', 'U'].every((c) => flags['bossKilled_' + c]);
      if (allBosses) parts.push({ label: '锁环·终章（四锁匠全倒）', n: 3 });
    }
    // 净芯之环：锁芯层清掉的怪（折算在引擎，四只封顶）——最后一层「打不打角落那四只」的答案
    if (has('clean')) {
      const ce = (fx.cleanEmber && fx.cleanEmber()) || 0;
      const nk = Math.min(4, flags.clean_kills || 0);
      if (ce > 0) parts.push({ label: `锁环·净芯（锁芯层清了 ${nk} 只）`, n: ce });
    }
    const list = parts.filter((p) => p.n > 0);
    // 保底 1 点：走到结局本身就值一点，0 会让「本局余烬 +0」看着像没算
    return { total: Math.max(1, list.reduce((a, p) => a + p.n, 0)), parts: list };
  }

  // ---------- 战斗面板：三把打法各自的读数（2026-11-16 09:xx 切边界第三刀） ----------
  // 这一屏的每一行都嵌着算术：「承伤 −45%」是 1−倍率、「挡后剩 N」是血减承伤、
  // 「此后 N 场」是本层怪数减掉正在打的这只、「多挨一轮 +N」是三种打法的差额。
  // 原来它们只以模板串的形式活在 playBattleScene 里，验收只能靠截图看「画出来的字」，
  // 看一眼看不出「这个数算得对不对」。搬到这儿之后是数据进、数据出，Node 单测直接盯算术。
  // 文案与口径保持一字不差：任何一句改口都必须同时改断言（截图闸门护着这几行字）。

  // 提示行随状态改口：有得选时不许说「自动战斗中」（那等于叫人别管这一屏）
  const HINT_PICK = '可点下面的打法 · 或点这里直接打';
  const HINT_AUTO = '自动战斗中 · 点击跳过';
  const hintPicked = (name) => `这一战按「${name}」打 · 点这里直接看结果`;

  // 敌名：Boss 带「· 塔的主人」兜底，章怪带「· 第 N 章」，再挂特性徽记
  function foeName(m, traitDef) {
    if (!m) return '';
    const tail = m.boss ? ' · ' + (m.title || '塔的主人') : (m.chapter ? ` · 第 ${m.chapter} 章` : '');
    const tag = traitDef ? ` <i class="bs-trait">${traitDef.icon}${traitDef.name}</i>` : '';
    return m.name + tail + tag;
  }

  // 本层威胁读数（第 6 层起）：还剩几只、最贵的那只白打要掉多少血
  // th 是引擎 floorThreat 的原样结果（已经排除正在打的这只），这里只做措辞与取舍
  const THREAT_TITLE_BARE = '白打这一只要掉多少血（不格挡、不缠斗）——破不了防的另算';
  const THREAT_TITLE_SPREAD = '盾已经架开：这一层此后每场都按 85% 结算，数字是架盾后的实际承伤';
  function threatModel(th) {
    // 一只不剩＝这一层清完了，没得选，整行不出现
    if (!th || !(th.count >= 1) || !(th.wall || th.worst)) return { show: false };
    // 盾架开之后每场都在减，标签必须叫「架盾后」——否则标「白打」、数字却是打折的
    const label = th.spread ? '架盾后' : '白打';
    const html = th.wall
      ? `这一层还剩 ${th.count} 只 · <b>打不穿</b> ${th.wall.name}`
      : `这一层还剩 ${th.count} 只 · 最贵 ${th.worst.name} ${label} <b>−${th.worst.damage}</b>`;
    return { show: true, html, title: th.spread ? THREAT_TITLE_SPREAD : THREAT_TITLE_BARE };
  }

  // 格挡：本层额度 + 承伤比例 + 挡完还剩多少血
  // 剩多少血直接由「当前血量 − 引擎承伤」算：判死用原始差值（引擎也是 `hp > damage` 才算活），
  // 显示才取整并把存活钳到 1——先取整再比会把 0.4 血写成「倒下」（连击 1.7 倍会出小数）
  function blockModel(f) {
    const pct = Math.round((1 - (f && f.scale ? f.scale : 1)) * 100);
    const quota = f && f.limit > 1 ? `本层剩 ${f.left} 次` : '本层一次';
    let tail = '';
    if (f && typeof f.hp === 'number' && typeof f.damage === 'number') {
      const left = f.hp - f.damage;
      // 原来这里只在「剩 > 0」时说话，于是「挡了照样死」这件事被静默吞掉
      tail = left <= 0 ? ' · 挡后仍会倒下' : ` · 挡后剩 ${Math.max(1, Math.round(left))}`;
    }
    return { pct, quota, html: `<b>🛡 格挡</b><span>${quota} · 承伤 −${pct}%${tail}</span>` };
  }

  // 架盾：状态条（已架开）/ 可点（摊平整层）/ 不出现
  function guardModel(f) {
    const pct = Math.round((1 - (f && f.spreadScale ? f.spreadScale : 0.85)) * 100);
    if (f && f.spreadActive) {
      return { mode: 'active', html: `<b>🧱 盾已架开</b><span>本层每场承伤 −${pct}%</span>` };
    }
    if (!f || !f.offer) return { mode: 'hidden' };
    // 「此后 N 场」＝本层怪数减掉正在打的这只：这一场的账由「这战剩」交代，
    // 两处并排时口径必须对齐（威胁读数「这一层还剩 N 只」也是同一个减法）
    const rest = Math.max(0, (f.count || 0) - 1);
    const after = Math.max(0, Math.round((f.heroHp || 0) - (f.guardDamage || 0)));
    const blockPct = Math.round((1 - (f.blockScale ? f.blockScale : 1)) * 100);
    return {
      mode: 'offer',
      rest,
      html: `<b>🧱 架盾</b><span>此后 ${rest} 场 · 每场 −${pct}% · 这战剩 ${after}</span>`,
      title: `花掉一次格挡：这一场先按 ${100 - pct}% 结算（见「这战剩」），此后 ${rest} 场每场都少挨 ${pct}%（单场格挡则是只挡这一场，少挨 ${blockPct}%）`,
    };
  }

  // 缠斗：多挨一轮换这一战经验翻倍。符号不能跟格挡/架盾共用「−」（那两处是「省下来的」）
  function tangleModel(f) {
    const after = Math.max(0, Math.round((f.heroHp || 0) - (f.damage || 0)));
    return {
      html: `<b>🗡️ 缠斗</b><span>多挨一轮 +${f.extra} 血 · 经验 ×${f.mult}</span>`,
      title: `缠完还剩 ${after} 血：多挨这一轮是为了把它的招数看全，这一战经验 ${f.exp} → ${f.expGain}`,
    };
  }

  // ---------- 结算页：两块面板的标签与履历（2026-11-16 11:xx 切边界第四刀） ----------
  // 这一屏有两块面板（败局 / 胜局），同一件事各写了一遍，于是同一件事有两个口径：
  // 塔印名、章回响分母、层数基准都各写过两次。层数这一处已经真的说错过话——见 floorNo。
  const CHAPTERS = 4;

  // 引擎的 floor 是 0 基（第 1 层 = 0），玩家嘴里与所有文案都是 1 基。
  // 此前败局把 s.floor（0 基）直接当「第 N 层」显示：第一次死在第 1 层的人读到「最远第 0 层」；
  // 而胜局写的是 summary().floor（1 基）——同一份跨局账里混着两种基准（见 migrateFloors）。
  const floorNo = (f0) => Math.max(1, Math.round(f0 || 0) + 1);

  // 老档的层数口径迁移：deepest 可能来自胜局（1 基）也可能来自败局（0 基），无法逐条区分，
  // 只能按「从没赢过 = 全部来自败局」判——那种情况整份账都少 1，补上即可。
  // lastFallFloor 只有败局写，一律 0 基 → 直接 +1。跑两次结果相同（幂等）。
  function migrateFloors(mem) {
    if (!mem || mem.floorBase) return mem;
    if ((mem.falls || 0) > 0) mem.lastFallFloor = Math.max(1, (mem.lastFallFloor || 0) + 1);
    const won = ((mem.endings && (mem.endings.true || 0)) || 0) + ((mem.endings && (mem.endings.plain || 0)) || 0);
    if (!won && (mem.runs || 0) > 0) mem.deepest = Math.max(1, (mem.deepest || 0) + 1);
    mem.floorBase = 1;
    return mem;
  }

  // 败局标签（6 行）。深度口径与胜局共用 floorNo——两页说同一个数就得是同一个数。
  function deathStatsModel(input) {
    const o = input || {};
    return [
      { label: '倒在', value: o.foe || '塔里' },
      { label: '深度', value: `第 ${floorNo(o.floor0)} 层` },
      { label: '塔印', value: o.sealName || SEALS.fall.name },
      { label: '击杀', value: String(o.kills || 0) },
      { label: '誓约', value: o.vowName || '不立誓' },
      { label: '用时', value: fmtTime(o.time || 0) },
    ];
  }

  // 胜局标签（12–13 行，「盾谱」一行只在集齐两半时出现）。
  // 「剩余生命」要标明是哪个时刻的血：决战结束时与现在（之后可能又买药）不是同一个数，
  // 只写一个数会让「剩 40% 血」这种读数对不上难度基准。
  function winStatsModel(input) {
    const o = input || {};
    const fh = o.finalHp;
    const fm = o.finalMaxHp;
    const cur = Math.round(o.curHp || 0);
    let hp;
    if (fh != null && fh !== cur) hp = { value: `${fh} / ${fm}`, sub: `决战结束时（现 ${cur}）` };
    else if (fh != null) hp = { value: `${fh} / ${fm}`, sub: '决战结束时' };
    else hp = { value: String(cur) };
    const rows = [
      { label: '结局', value: endName(o.ending) },
      { label: '塔印', value: o.sealName || '' },
      { label: '最终等级', value: `Lv.${o.level || 1}` },
      { label: '攻击 / 防御', value: `${o.atk || 0} / ${o.def || 0}` },
      { label: '剩余生命', value: hp.value, sub: hp.sub },
      { label: '击杀', value: String(o.kills || 0) },
      { label: '遗物', value: o.relics || '无' },
      { label: '锁环', value: o.rings || '无' },
      { label: '章回响', value: `${o.echoDone || 0}/${CHAPTERS} 章` },
      { label: '塔心', value: o.heart === 'taken' ? '带走' : o.heart === 'left' ? '留下' : '未至' },
      { label: '誓约', value: o.vowName || '不立誓' },
    ];
    // 集齐前半 + 后半盾谱才有这一行：名册上那格签名是结局彩蛋，结算里得有一行认下它
    if (o.signed) rows.push({ label: '盾谱', value: '📖+📕 已集齐 · 名册有你的签名' });
    rows.push({ label: '步数', value: `${o.steps || 0} 步` });
    rows.push({ label: '用时', value: fmtTime(o.time || 0) });
    return rows;
  }

  const MEM_NOTE_DEATH = '塔收起了你的名字，但位置还留着。';
  const MEM_NOTE_WIN = '塔在等你回来——为了上面这些。';

  // 「塔的记忆」：跨局履历 + 下一局目标。两页共用模型，差别只在 mode 决定的几行：
  // 败局每次都念「折戟 ×N」（刚刚发生的事），胜局只在真折过戟时念；「决战余裕」只对胜局有意义。
  // input: { mode:'death'|'win', mem, floorNow, vows, ember, hasVow(id) }
  function memModel(input) {
    const o = input || {};
    const mem = o.mem || {};
    const mode = o.mode === 'win' ? 'win' : 'death';
    const endings = mem.endings || {};
    const mc = mem.marginCounts || {};
    const nowFloor = Math.max(1, Math.round(o.floorNow || 1));
    const items = [];
    // 「最远第 N 层」取自己的最高纪录与本局谁更深——只能有一个判据，两页各写一遍必漂
    items.push(`进塔 ${mem.runs || 1} 次 · 最远第 ${Math.max(mem.deepest || 0, nowFloor)} 层${mem.fastest ? ` · 最快 ${fmtTime(mem.fastest)}` : ''}`);
    items.push(`刻下过最好的塔印：${SEALS[mem.bestSeal] ? SEALS[mem.bestSeal].name : '尚未刻下'}`);
    items.push(`结局：铁与霜 ×${endings.plain || 0} · 第六个名字 ×${endings.true || 0}`);
    items.push(`满回响 ${mem.fullChapters || 0}/${CHAPTERS} 章 · 塔心 带走×${mem.heartTaken || 0} 留下×${mem.heartLeft || 0}`);
    if (mode === 'death' || (mem.falls || 0) > 0) {
      items.push(`💀 折戟 ×${mem.falls || 0} · 上次倒在第 ${mem.lastFallFloor || 0} 层`);
    }
    if (mode === 'win') {
      const tally = ['S', 'A', 'B', 'C'].filter((g) => mc[g]).map((g) => `${g}×${mc[g]}`).join(' · ');
      items.push(`决战余裕最好 ${mem.marginBest || '尚未记录'}${tally ? ` · ${tally}` : ''}`);
    }
    // 还没解锁的誓约：差多少余烬（两页共用，也是「层灯」那行要不要出现的前提）
    const vows = o.vows || {};
    const lockedVow = Object.keys(vows).find((id) => vows[id].ember && !(o.hasVow && o.hasVow(id))) || null;
    const need = lockedVow ? Math.max(0, (vows[lockedVow].ember || 0) - (o.ember || 0)) : 0;
    const vowGoal = () => (need > 0
      ? `再攒 ${need} ✦ 解锁「${vows[lockedVow].name}」`
      : `「${vows[lockedVow].name}」已可解锁——下一局开局选它`);
    const chapterGoal = `把回响拿满的章推进到 ${(mem.fullChapters || 0) + 1}/${CHAPTERS}`;
    const endGoal = () => (!(endings.true || 0) ? '去念出第六个名字'
      : (!(endings.plain || 0) ? '试试另一条路：铁与霜' : null));
    const goals = [];
    if (mode === 'death') {
      // 败局的第一句必须是「下一步从哪开始」：刚倒下的人只想知道离刚才多远
      goals.push(`这次倒在了第 ${nowFloor} 层——下一局从这里再往上`);
      if (lockedVow) goals.push(vowGoal());
      if ((mem.fullChapters || 0) < CHAPTERS) goals.push(chapterGoal);
      const eg = endGoal();
      if (eg) goals.push(eg);
    } else {
      if (lockedVow) goals.push(vowGoal());
      // 还没带着走过结局的誓约（解锁过的才算——锁着的已经在上一句里了）
      const unWon = Object.keys(vows).filter((id) => id !== 'none' && !vows[id].ember && !((mem.vowWins || {})[id]));
      if (unWon.length) goals.push(`带着「${vows[unWon[0]].name}」走到一次结局`);
      // 决战余裕还没拿过 S：把「避战流」钉进前三，别让这条隐藏策略永远没人试
      if (!(mc.S || 0)) goals.splice(2, 0, '拿一次决战余裕 S：清塔攒战意，或绕道省血');
      if ((mem.fullChapters || 0) < CHAPTERS) goals.push(chapterGoal);
      const eg = endGoal();
      if (eg) goals.push(eg);
      // 塔心还没做过另一个选择：两条都要走一遍，才谈得上「看全这座塔」
      if (!mem.heartTaken || !mem.heartLeft) goals.push(!mem.heartTaken ? '把塔心石带走一次' : '把塔心石留下一次');
    }
    return {
      items,
      goals: goals.slice(0, 3),
      note: mode === 'death' ? MEM_NOTE_DEATH : MEM_NOTE_WIN,
      lockedVow,
      need,
    };
  }

  return {
    boardModel, shopModel,
    sealOf, nextSealHint, sealTarget, emberModel,
    cmpBoard, fmtTime, endName, marginRank,
    deathStatsModel, winStatsModel, memModel, floorNo, migrateFloors,
    foeName, threatModel, blockModel, guardModel, tangleModel,
    hintPicked, HINT_PICK, HINT_AUTO,
    BOARD_TABS, BOARD_CAP, SHOP_CORE, SEALS, CHAPTERS,
    NOTE_DAILY, NOTE_CRUSHED, EMPTY_OTHER, TIP_BLOCK, TIP_SHARD,
    MEM_NOTE_DEATH, MEM_NOTE_WIN,
  };
});
