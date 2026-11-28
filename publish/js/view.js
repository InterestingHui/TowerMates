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
  // ---------- 层号刻度：1..13 → 1..22（2026-11-28 三齿塔上线） ----------
  // `summary().floor` 在 11-28 11:35 从「主塔层号 1..13」换成「总进度号 1..22」
  // （齿塔 1–9 + 主塔 10–22，见 data.js 的 progressNo）。而本地名录（`towermates_board` /
  // `towermates_rivals`）里还躺着换刻度之前的记录，它们既没有版本号也**没有时间戳**。
  // 只修「能证明是老的」那一条：**有结局却只到 13 层**——结局只在塔顶成立，13 是换刻度前的塔顶
  // （新刻度下塔顶是 22）。这类记录正是社交层上最伤的一种：老玩家的通关局被读成「主塔第 4 层」、
  // 结局列被 `endOf` 判成「未竟」、排序被排到只爬了两层齿塔的新人之后。
  // 其余记录**一律不动**，只盖章：1..12 在两种刻度里都合法（老的主塔层号 / 新的齿塔层号），
  // 无时间戳就判不出来——硬 +9 会把今天爬了锈塔第 2 层的人读成 11 层（本轮第一版就是这么错的，
  // `ui-test` 的「贴自己的码」当场抓到）。开测期没有真实玩家，剩下的歧义记进 PROGRESS 待办。
  // 章的作用：这个问题只问一次——盖过戳的记录不会再被迁一遍（幂等）。
  const FLOOR_SCALE = 22;
  const FLOOR_OFFSET = 9;
  const OLD_TOP = 13;
  // 纯函数、幂等：返回新数组，不改入参（榜单每开一次都会过这里，改原地会让存档越读越偏）。
  function migrateFloorRecs(list) {
    // 脏行先丢掉（2026-11-28 自检·错误处理面）：名录是裸 JSON，手改 / 写入中断都可能留下
    // null、字符串、数字。旧写法直接 `.map(r => !r ? r : ...)` 把 null 原样带回榜单，
    // 而 `cmpBoard` 第一行就是 `b.floor` ⇒ `TypeError` 整张榜打不开（不是「少一行」是白屏）。
    // 入参本身也过一层 Array.isArray：名录被写坏时可能是 `{}` 或字符串（读的一侧已 try，这里防形状）。
    return (Array.isArray(list) ? list : [])
      .filter((r) => r && typeof r === 'object' && !Array.isArray(r))
      .map((r) => {
        if (r.fs) return r;                                       // 盖过戳：原样
        const f = Math.round(r.floor || 0);
        if (f === OLD_TOP && r.ending) {
          // 换刻度前的通关局：13 → 22（结局只在塔顶成立，所以「有结局 + 13 层」只可能是老刻度）
          return Object.assign({}, r, { floor: Math.min(FLOOR_SCALE, f + FLOOR_OFFSET), fs: FLOOR_SCALE });
        }
        return Object.assign({ fs: FLOOR_SCALE }, r);             // 判不出来：只盖章，不动层号
      });
  }

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
  // 「这一局是不是我自己打的」：贴码时用来挡自己的码。
  // 2026-11-16 之前主代码是**重新编码再比字符串**（`encodeChallenge(Object.assign({vow:'none'}, 我的最好一局))`），
  // 只跟「名录里排第一的那一局」比 —— 于是贴自己**别的**那一局（刚打完那局往往不是最好的那局）的码，
  // 会被当成朋友进榜：自己刷自己的榜，还多出一条同名的「挑战·朋友」。
  // 现在按码里带的字段逐项比：誓约 / 层 / 级 / 步 / 时 / 塔印 / 回响 / 余裕 / 日签 / 结局，全部相同才算同一局。
  const RUN_KEYS = ['vow', 'floor', 'level', 'steps', 'time', 'seal', 'goals', 'margin', 'daily', 'ending'];
  function sameRun(a, b) {
    if (!a || !b) return false;
    return RUN_KEYS.every((k) => {
      const va = k === 'vow' ? (a[k] || 'none') : (k === 'goals' ? Number(a[k] || 0) : (a[k] == null ? '' : String(a[k])));
      const vb = k === 'vow' ? (b[k] || 'none') : (k === 'goals' ? Number(b[k] || 0) : (b[k] == null ? '' : String(b[k])));
      return va === vb;
    });
  }
  function isMine(rec, mine) {
    return (mine || []).some((r) => sameRun(r, rec));
  }

  // 收下朋友那一局之后该说哪句话：「谁走得更远」是两边成绩算出来的，不能写死。
  // 旧实现（main.js 贴码那条路）无条件接一句「爬得比他更高」——朋友贴来第 12 层的码也照说，
  // 而紧跟着画出来的榜把他排在第一行；一局没打过的玩家同样被告知「比他高」。
  // 只比层数（cmpBoard 的第一关键字）：同层就是同层，不给一样深的人编胜负。
  // 「一局都没有」是旧口径：`rivalVerdict` 的 none 支判的是 `mine` 为空，而 `mine` 只收
  // **通关**那一局（`saveBoard` 只在胜利结算调）⇒ 死在第 5 层的玩家也落进这一支。
  // 旧句「你先走一局，才知道谁走得更远」对他说的是「你没玩过」，而他刚走完一局。
  // 现在说的是名录的规则本身（哪些局才记、记了才比得出），对「没玩过」与「没过」两种人都成立。
  const VERDICT_NONE = '等你走到塔顶那一局记进名录，才比得出谁更远。';
  function rivalVerdict(rec, mine) {
    const floor = (rec && rec.floor) || 0;
    const best = (mine || []).reduce((m, r) => Math.max(m, (r && r.floor) || 0), 0);
    if (!best) return { id: 'none', gap: 0, text: VERDICT_NONE };
    if (best > floor) return { id: 'higher', gap: best - floor, text: `你在第 ${best} 层——比他高 ${best - floor} 层。` };
    if (best < floor) return { id: 'lower', gap: floor - best, text: `他比你高 ${floor - best} 层（你在第 ${best} 层）——去追。` };
    return { id: 'tie', gap: 0, text: `和你一样深（第 ${floor} 层）。` };
  }

  // 档位 = 两条公共档（全部 / 今日）+ 三条主路（不立誓 / 利齿 / 重压）+ 一格「助力」（2026-11-26 三路改版后）
  // 为什么助力合成一格：三路免费、人人都会走，一格一条才比得出「同一条路上谁走得远」；
  // 五条助力要花 ✦ 买下，首月绝大多数玩家一条都没有——一格一条的话，五格里四格永远在解释价目，
  // 十格 chip 还会把面板挤成三行、可见榜单只剩七行。合成一格后六格正好两行。
  const BOARD_TABS = [
    ['all', '全部'], ['daily', '今日'], ['none', '不立誓'], ['dmg10', '利齿'],
    ['dmg20', '重压'], ['aid', '助力'],
  ];
  // 「助力」档收哪几条：凡 vows 里带 ember 价目（＝要花 ✦ 买下）的都算。
  // 不写死 id 列表——将来加第六条助力时这张表不必跟着改。
  // （11-26 之前的教训：把 `ascetic` 这类 id 抄进断言，那一刻它就从闸门变成了快照。）
  const isAid = (id, vows) => {
    const v = (vows || {})[id];
    return !!(v && v.ember);
  };
  const BOARD_CAP = 10;
  const NOTE_DAILY = '这一座塔每天零点换一次：同一天走进来的人遇到的是同一座，所以「今天谁走得远」是能比的。贴进来的朋友码只要也是今天这座，就会进这一档。';
  // 数字由影子勇者的实际层数算出来（boardModel 的 shadowBest）：写死「前五层」时换刻度后它就成了假话，
  // 而这句话与 story.js 的 shadowRivals 是同一件事的两处硬编码（同 C 段「同一阈值多处硬编码」）。
  const NOTE_CRUSHED = (deepest) => `影子勇者最远只走到第 ${deepest} 层。你已经走到他们没到过的地方。`;
  // 「榜上没有我」是一句话，不能靠玩家自己猜。它有两个人：①一局都还没通关——名录只记走到塔顶的那局
  // （`saveBoard` 只在 showEnd 调），所以榜上永远只有三位影子和贴码进来的朋友；②这一档把我的局筛掉了。
  // 前者才是多数人的第一屏：打了五局全折在半路，打开榜找不到自己，也没有一个字解释。
  // 11-18 修的是「被前十截掉」那种（offBoard），更常见的这两种一直没人说话。
  const NOTE_NO_RUN = '榜上还没有你——名录只记走到塔顶的那一局，通关一次它就在这儿了。';
  const NOTE_NO_MINE_TAB = '这一档里还没有你的局——换个档，或者再走一局。';
  const EMPTY_OTHER = '这一档还没有人。去立一条誓约，回来占第一位。';
  // 锁着的档位不能喊「去立一条誓约」——那条誓约得先花 ✦ 买下（11-26 誓约改纯增益 + 逐级买之后，
  // 首局玩家点开「无名」档，看到的是一句自己当下做不到的指路，属「看不懂下一步」的弱形态）
  const EMPTY_LOCKED = (name, cost) => `这一档还锁着：「${name}」要 ✦ ${cost} 解锁。`;
  // 「助力」是聚合档，没有单一的「这一条誓约」可报价——分成买过 / 没买过两种说法：
  // 没买过时喊「去立一条誓约」是做不到的动作（那五条只能用 ✦ 买），所以先说要花什么。
  const EMPTY_AID_OWNED = '这一档还没有人带着助力走完一局。';
  const EMPTY_AID_LOCKED = '这一档是花 ✦ 买下的助力（回血 / 金币 / 经验 / 减伤 / 刻名）。先在塔里攒 ✦。';
  // 名录里那个人怎么称呼。微信好友榜带回的是**昵称**（wxbridge.normalize 已滤过引号尖括号、截 16 字），
  // 贴码那条路码里只有成绩没有名字 → 退回「挑战·朋友」。旧实现一律写死这五个字，于是贴三位朋友
  // 就是三行同名：知道谁爬得高，不知道超过的是谁——异步竞争（E-11）的前提正是「知道超过了谁」。
  // 昵称来自存档与平台回传、渲染层又是拼标签，所以这里再洗一遍尖括号引号，并按码点截断。
  const NAME_FALLBACK = '挑战·朋友';
  const plainName = (v, n) => Array.from(
    String(v == null ? '' : v).replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim()
  ).slice(0, n || 10).join('').trim();
  const dailyEmpty = (label) => `今天还没走完一局今日一塔。<br>${label} 这座塔零点就换掉了。`;
  // 「今日」档把别的日子的挑战行筛掉时，得说清它们去了哪：一行字，不新增档位、不新增可点项。
  const NOTE_STALE = (n) => `名录里另有 ${n} 条挑战是别的日子的——「全部」档还看得见。`;
  // 一个人在这份名录里的身份键：自己 / 有名字的好友（微信昵称）/ 无名的贴码行（只能按码区分）。
  // 为什么需要它：微信好友榜每次回的是「这位好友的最新成绩」，同一个人换一次成绩就换一个 code，
  // 而名录与榜单原先只按 code 去重 —— 一位好友连爬三天就在榜上占三行，把别人挤到十名开外。
  // 11-18 那轮把「同一个人只占一行」写进了榜单，但只对自己（mine）成立，好友那半截漏了。
  function personKey(r) {
    if (!r) return '';
    if (r.mine) return '#me';
    const nm = plainName(r.name, 16);
    if (nm && nm !== NAME_FALLBACK) return 'n:' + nm;
    const code = String(r.code == null ? '' : r.code);
    return code ? 'c:' + code : ''; // 既没名字也没码：判断不了是不是同一个人，宁可不折叠
  }

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
    // 塔顶层（22 = 三座齿塔 9 层 + 主塔 13 层，与 data.js 的 progressNo 同一刻度）。
    // 结局只在这一层成立：铁与霜要打完碑魔选「带走王冠/留下」，
    // 第六个名字要念出那个名字——都发生在主塔塔顶，层列写着 3 层时不可能有结局。
    // 为什么要在读取侧拦：挑战码的线格式只有 t / p 两位（`challenge.js` 的 p = 普通结局），
    // 「没走到结局」与「普通结局」在码里是同一串 ⇒ 死在第 5 层的码解开就是 ending:'plain'，
    // 微信托管数据缺 tm_ending 时也一样，影子勇者的数据当年也是这么填的。三个写入方各自都在编，
    // 改线格式只能救新码，救不了已存在本地的名录；所以口径收在唯一读它做展示的地方。
    // 默认值就是当前刻度：2026-11-28 之前这里是 13（主塔 12 层 + 锁芯），换刻度时漏了这一处，
    // 于是不带 topFloor 的调用方（单测 / 将来的新屏）会拿老的上限去判结局。
    const top = o.topFloor || FLOOR_SCALE;
    const endOf = (r) => ((r.floor || 0) >= top ? (r.ending || '') : '');
    const mine = (o.mine || []).map((x) => Object.assign({ mine: true, vow: x.vow || 'none' }, x));
    const all = (o.shadows || []).map((x) => Object.assign({ vow: 'none' }, x))
      .concat(o.rivals || [])
      .concat(mine);
    all.sort(cmpBoard);
    const rows = filter === 'daily'
      ? all.filter((r) => r.daily === o.todayKey)
      : filter === 'all' ? all
        : filter === 'aid' ? all.filter((r) => isAid(r.vow || 'none', vows))
          : all.filter((r) => (r.vow || 'none') === filter);
    // 榜单是「人」的榜，不是「局」的榜：同一个人只占一行，取这一档里他最好那局（rows 已按 cmpBoard 排好）。
    // 旧实现把 loadBoard() 存的 30 条历史全倒进来（都是 mine），打到十几局以后前十行全是「你」，
    // 影子勇者与贴码朋友一个都看不见——社交榜退化成自己的成绩单。去重放在**筛选之后**：
    // 「今日」档要的是今天我最好那局，不是全局最好那局被筛掉。
    // 11-24：折叠的口径从「只折自己」扩到 `personKey`——好友换一次成绩就多一行，同一个人爬三天占三行。
    const people = [];
    const seenPerson = new Set();
    rows.forEach((r) => {
      const k = personKey(r);
      if (k) {
        if (seenPerson.has(k)) return;
        seenPerson.add(k);
      }
      people.push(r);
    });
    // 「你已经走到他们没到过的地方」说的是**影子勇者**（那句话自己点了名），所以只跟影子比：
    // 按「榜首是谁」判的话，我一超过影子就排到自己头上、这句话永远出不来（原实现就是这么死掉的）
    const myFloor = mine.length ? Math.max.apply(null, mine.map((x) => x.floor || 0)) : 0;
    const shadowFloors = (o.shadows || []).map((x) => x.floor || 0);
    const shadowBest = shadowFloors.length ? Math.max.apply(null, shadowFloors) : -1;
    const crushed = myFloor > 0 && shadowBest >= 0 && myFloor > shadowBest;
    // 自己被前十截掉时要当面说清：榜单第一件事是找自己，找不到又没解释，读起来就是「榜上没有我」。
    // 这种情况要十个比你深的人才凑得出（影子只有三位、都在前五层），真出现时值得一行字。
    const myIdx = people.findIndex((r) => r.mine);
    const myRank = myIdx >= 0 ? myIdx + 1 : 0;
    const offBoard = myRank > cap
      ? `你在第 ${myRank} 名（共 ${people.length} 人）——这一屏只画前十。`
      : '';
    // 「今日」档只收今天这座塔的成绩：朋友昨天贴进来的今日一塔码会整行消失，而玩家拿不到
    // 「他走的是别的日子那座」这层信息——只会以为收下的挑战丢了（同 11-26「收下了、榜上没有」那类病）。
    // 所以数一下并指明去哪还能看到；只数贴码进来的挑战行，自己的历史成绩消失是「今日」本身的意思。
    const staleRivals = filter === 'daily'
      ? new Set((o.rivals || [])
        .filter((r) => r && r.daily && r.daily !== o.todayKey)
        .map((r) => String(r.code || ''))).size
      : 0;
    // 影子的行一直在，所以「一局都没有」的玩家永远看不到空态——得有一句解释垫在行前面。
    // 只在真有行时出（空榜那屏已经有「这一档还没有人／今天还没走完一局」，别再叠一句同义的）。
    const noMineNote = rows.length
      ? (!mine.length ? NOTE_NO_RUN : (myIdx < 0 ? NOTE_NO_MINE_TAB : ''))
      : '';
    const note = filter === 'daily'
      ? NOTE_DAILY + (o.dayVowName ? `<br>今日之约：${o.dayVowName}——同一天走进塔的人守的都是这一条。` : '')
        + (staleRivals ? `<br>${NOTE_STALE(staleRivals)}` : '')
        + (offBoard ? `<br>${offBoard}` : '')
        + (noMineNote ? `<br>${noMineNote}` : '')
      : (offBoard || noMineNote || (crushed ? NOTE_CRUSHED(shadowBest) : ''));
    // 空档的说法分两种：立得起的（指路去立）／还没买下的（先说要花多少）。
    // `hasVow` 不传＝按「能立」算，老调用方（含单测）行为不变。
    const emptyFor = (id) => {
      if (id === 'aid') {
        // 不传 hasVow＝按「能立」算：老调用方（含单测）只关心有没有话，不关心买没买
        if (typeof o.hasVow !== 'function') return EMPTY_AID_OWNED;
        const owns = Object.keys(vows).some((k) => isAid(k, vows) && o.hasVow(k));
        return owns ? EMPTY_AID_OWNED : EMPTY_AID_LOCKED;
      }
      const v = vows[id];
      const paid = v && v.ember ? v.ember : 0;
      if (paid && typeof o.hasVow === 'function' && !o.hasVow(id)) return EMPTY_LOCKED(v.name, paid);
      return EMPTY_OTHER;
    };
    const out = people.slice(0, cap).map((r, i) => {
      const v = vows[r.vow] || vows.none || { name: '不立誓', tag: '' };
      const ending = endOf(r);
      return {
        rank: i + 1,
        // 幽灵行不再把楼层写进名字里：同一行的「N层」列就是那个数，写两遍只是噪音
        name: r.mine ? '你' : (plainName(r.name) || NAME_FALLBACK),
        note: (!r.mine && !r.rival && notes[r.name]) || '',
        // 徽记取 tag 的**末字**：首字会撞——「重压之誓」与「重金之誓（贪婪）」首字都是「重」，
        // 榜上一行「你 重 11层」读不出这局走的是哪条路。末字（齿/压/羽/金/行/色/名）全不相同。
        vowTag: v.name === '不立誓' ? '' : (v.tag || '').slice(-1),
        mine: !!r.mine,
        rival: !!r.rival,
        end: endName(ending),
        ended: ending === 'true',
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
      empty: rows.length ? '' : (filter === 'daily' ? dailyEmpty(o.dayLabel || '') : emptyFor(filter)),
      rows: out,
      total: people.length,
    };
  }

  // ---------- 商店：货架与「明码取舍」的每一句话 ----------
  // core 是第 3 层折叠首屏的那几件。战备罗盘（tactic）2026-11-28 进 core：
  // 它现在是「撞怪怎么打」这条规则唯一的操作入口，藏进「更多货」等于让新玩家错过整套打法。
  const SHOP_CORE = ['key', 'potion', 'atk', 'def', 'tactic'];
  // 副标题是单行区（最多两行）：写满会正好截在「承伤 −45%」这个数字上，
  // 「每层一次」与「怎么用」的关系由买下后的提示条补（「格挡已学会：每层一次，撞怪时先挑「格挡」」）
  const TIP_BLOCK = '格挡：每层一次，承伤 −45%';
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

  // 余烬的击杀单价：每 EMBER_KILL_STEP 只记 1 点。**单价只有这一个来源**——
  // emberModel 拿它算明细，结算页空态那句「还差 N 只」也拿它拼句子。
  // 此前 10 只埋在 emberModel 的算式里，渲染层想说清「差多少」只能再写一个 10（第二份单价）。
  const EMBER_KILL_STEP = 10;

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
    // 折戟（2026-11-27 自检轮）：败局原先在 main.js 另算一条 `floor(击杀/5)`——同一件事两份实现，
    // 三处跟着走偏：①击杀单价变 2 倍（胜局每 10 只 1 点、败局每 5 只 1 点 ⇒ 送死比打完更划算）
    // ②锁环（名册/墨账的击杀余烬）在败局一分不算，而那几张环的说明里没有「通关才给」
    // ③塔心碎片写着「结算时化为余烬 +8」，死在第 13 层就一分没有（承诺落空）。
    // 现在两条出口共用这一份：death 只关掉「结算/通关」那一类，局内真做过的事照算。
    const death = o.mode === 'death';
    const winOnly = (id) => !death && has(id);
    const parts = death ? [] : [{ label: '走到结局', n: 5 }];
    if (s.ending === 'true') parts.push({ label: '念出第六个名字', n: 4 });
    const kills = Math.floor((flags.killCount || 0) / EMBER_KILL_STEP);
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
    // 誓约奖励：其他誓约用「誓约名」（那是玩家主动立的），不立誓改成陈述句。
    // 只在「走到结局」时结算——否则选最难的 +20% 立刻送死就能刷 ✦（30 秒一趟）。
    if (vowDef.reward && s.ending) {
      const vowLabel = vowId === 'none' ? '无誓通关' : `「${vowDef.name}」`;
      parts.push({ label: vowLabel, n: vowDef.reward });
    }
    // 解锁誓约第一次通关：额外给解锁成本的一半，让「解锁 → 真的用它」当场回本一半。
    // 同样只在走到结局时给——折戟不算「用过」，否则每次送死都能领一次回本。
    if (vowDef.ember && s.ending && !(fx.firstWin && fx.firstWin(vowId))) {
      parts.push({ label: `首通「${vowDef.name}」`, n: Math.round(vowDef.ember / 2) });
    }
    if (has('ledger') || has('ash') || has('ledger2')) parts.push({ label: '锁环·击杀余烬翻倍', n: kills });
    // 第七格：保底 +3，一次没回头（没重来本层）再 +3——与「刻刀」的稳定 +4 形成「稳 vs 冒险」
    if (winOnly('seventh')) {
      const clean = !flags.retries;
      parts.push({ label: clean ? '锁环·第七格（一次没回头）' : '锁环·第七格', n: clean ? 6 : 3 });
    }
    // 落笔之环：保底 +2，剩下的金币每 100 再 +1（上限 6）。
    // 曾按「每 100 金 +1、上限 5」做过，sim 验证是陷阱：留 500 金会少 28 点攻，终局血量从 66.6% 掉到 48.5%，
    // 却只换到 2 余烬——保底把它拉回「稳定小收益」。
    if (winOnly('quill')) {
      const byGold = 2 + Math.min(4, Math.floor((s.gold || 0) / 100));
      parts.push({ label: `锁环·落笔（剩 ${s.gold} 金）`, n: byGold });
    }
    // 落款之环：本局第一次收录进图鉴的件数，每件 +1（上限 5，避免开局撞大运爆收益）
    if (has('signature')) {
      const nNew = Array.isArray(flags.collectNew) ? Math.min(5, flags.collectNew.length) : 0;
      if (nNew > 0) parts.push({ label: `锁环·落款（图鉴新收录 ${nNew} 件）`, n: nNew });
    }
    // 通关型锁环各有触发条件，逐条列出来源（不再是「锁环加成」一笔带过）
    if (winOnly('pace')) parts.push({ label: '锁环·更漏', n: 2 });
    if (winOnly('chisel')) parts.push({ label: '锁环·刻刀', n: 4 });
    if (winOnly('hour')) {
      const mins = Math.round(((fx.timeSec && fx.timeSec()) || 0) / 60);
      if (mins > 0 && mins <= 20) parts.push({ label: `锁环·时辰（${mins} 分钟内通关）`, n: 4 });
      else parts.push({ label: '锁环·时辰', n: 2 });
    }
    if (winOnly('oath')) {
      const withVow = (flags.vow || 'none') !== 'none';
      parts.push({ label: withVow ? `锁环·守誓（${vowDef.name || '誓约'}）` : '锁环·守誓', n: withVow ? 5 : 3 });
    }
    if (winOnly('heart') && flags.heart === 'left') parts.push({ label: '锁环·塔心（放下）', n: 3 });
    // 拾柴之环：在「击杀翻倍」之外，每击败一位锁匠再 +1（奖励推进度，不按击杀数）
    // 上面那条翻倍是 ledger / ash / ledger2 三枚共用的，不是漏改——这是这一族的档位阶梯：
    // 名册（第 1 章）只翻倍 → 拾柴（第 2 章）+ 每位锁匠 1 → 墨账（第 3 章）+ 击杀金币 15%。
    // desc 必须把这半句写出来（2026-11-27 自检第 4 面：旧 desc 只写锁匠，玩家从卡面算不出实际给了两笔）。
    if (has('ash')) {
      const bossesDown = ['N', 'Z', 'Y', 'U'].filter((c) => flags['bossKilled_' + c]).length;
      if (bossesDown > 0) parts.push({ label: `锁环·拾柴（${bossesDown} 位锁匠）`, n: bossesDown });
    }
    // 终章之环：四位锁匠全倒才给（要求把四位都打完，比拾柴更严格）
    if (winOnly('finale')) {
      const allBosses = ['N', 'Z', 'Y', 'U'].every((c) => flags['bossKilled_' + c]);
      if (allBosses) parts.push({ label: '锁环·终章（四锁匠全倒）', n: 3 });
    }
    // 净芯之环：锁芯层清掉的怪（折算在引擎，四只封顶）——最后一层「打不打角落那四只」的答案
    if (winOnly('clean')) {
      const ce = (fx.cleanEmber && fx.cleanEmber()) || 0;
      const nk = Math.min(4, flags.clean_kills || 0);
      if (ce > 0) parts.push({ label: `锁环·净芯（锁芯层清了 ${nk} 只）`, n: ce });
    }
    const list = parts.filter((p) => p.n > 0);
    // 保底 1 点：走到结局本身就值一点，0 会让「本局余烬 +0」看着像没算。
    // 折戟不给保底——「一进塔就倒」也能领 1 点的话，那就成了刷余烬的最快路径。
    const total = list.reduce((a, p) => a + p.n, 0);
    // killCount / killStep 一起带出去：空态那句「还差几只」必须与上面那条算式同源
    return {
      total: death ? total : Math.max(1, total),
      parts: list,
      killCount: flags.killCount || 0,
      killStep: EMBER_KILL_STEP,
    };
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

  // 敌名：Boss 带「· 塔的主人」兜底，章怪带「· 第 N 章」，再挂特性徽记；
  // 首遇那一战在**同一块**里补一句规则（why）——面板块数已到顶，另开一块当场撞预算
  function foeName(m, traitDef, why) {
    if (!m) return '';
    const tail = m.boss ? ' · ' + (m.title || '塔的主人') : (m.chapter ? ` · 第 ${m.chapter} 章` : '');
    const tag = traitDef ? ` <i class="bs-trait">${traitDef.icon}${traitDef.name}</i>` : '';
    const note = why ? `<em class="bs-why">${why}</em>` : '';
    return m.name + tail + tag + note;
  }

  // 首遇特性：把规则念在玩家正在看的那块面板里，而不是写进被它自己挡住的日志
  // 2026-11-20 加练美术焦点B 实测：`log()` 把「开打前它先打你一下」投到 `#log` 最下缘，
  // 而那一刻战斗遮罩正盖在上面 —— 规则投递到了被自己遮住的面，玩家只能打完之后低头找。
  // 说话人固定是烛（引导角色），不新造系统旁白；文案原文取自 data.js TRAITS[*].tip，不另写一份。
  const TRAIT_WHY = '长明：';
  function traitNote(traitDef) {
    if (!traitDef || !traitDef.tip) return '';
    return TRAIT_WHY + traitDef.tip;
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
  // 战前卡还要这两个数自己造句（`extra` 是多掉的伤、`mult` 是经验倍数），所以一并给出——
  // 卡面与战斗面板用的是同一笔账，只是句子各自写给自己的那一屏。
  function tangleModel(f) {
    const after = Math.max(0, Math.round((f.heroHp || 0) - (f.damage || 0)));
    return {
      html: `<b>🗡️ 缠斗</b><span>多挨一轮 +${f.extra} 血 · 经验 ×${f.mult}</span>`,
      title: `缠完还剩 ${after} 血：多挨这一轮是为了把它的招数看全，这一战经验 ${f.exp} → ${f.expGain}`,
      extra: f.extra, mult: f.mult,
    };
  }

  // 战前卡的四枚线刻图标（黄铜单色，currentColor）：与誓约徽记同一套语言，
  // 不用 emoji——彩色卡通贴在暗面板上会跳出来抢「这一屏只有一个焦点」的规矩。
  const PREP_ICON = {
    none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l10-10"/><path d="M13 5l6 6"/><path d="M15 3l6 6-3 3-6-6z"/><path d="M6 18l-3 3"/></svg>',
    block: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M12 7v7"/></svg>',
    guard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18v12H3z"/><path d="M3 12h18M9 6v6M15 12v6"/></svg>',
    tangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5l14 14M19 5L5 19"/><path d="M3 7l4-4M21 7l-4-4"/></svg>',
  };

  // 战前面板的提示行（2026-11-24 22:4x 加练·叙事）：首遇那一屏必须有归属。
  // 11-20 已定口径「无主语的系统文案会被读成怪自己开口，引导必须有归属（烛 / 秤 / 塔灵）」，
  // 而已有的归属做法是 `TRAIT_WHY = '长明：'`（首遇特性把规则念在玩家正在看的面板里）。
  // 战前面板是 11-24 新加的第一处战前决策，原先只有一句系统口吻，玩家只能自己猜为什么突然多一屏。
  // 只首遇那一次由烛说；之后退回通用提示行——同一句规则不再请人复述，字数也回到原样。
  const PREP_WHY = '长明：';
  const PREP_FIRST = (n) => `${PREP_WHY}撞上了就先定这一场怎么打——定下不再改 · 或按 1–${n}`;
  const PREP_HINT = (n) => `选一种打法再开打 · 或按 1–${n} · 决定之后这一场不再改`;

  // 「上次打这一种」：战前面板脚下那行记忆。只说发生过的事（打法 + 实际掉血），
  // 不给建议——建议会把这一屏从「自己算」变成「照做」。
  // 2026-11-25 16:2x 加练·叙事：这里原写「上次对这只」，而记忆是按**怪种**存的
  // （引擎 `flags['tac_' + ch]`，`ch` 是地图字符）：同一只怪被打死就从图上消失、不会再见面，
  // 所以这句话每次出现时指的**都是另一只**。最刺眼的是后半塔——无面者第 8–13 层各一只，
  // 玩家在第 12 层读到「上次对这只」，说的是第 8 层那只。这行是「塔记着你是怎么打的」这条
  // 主题唯一的出口，不能在这里说错身份 ⇒ 改成「这一种」，与引擎的键（怪种而非个体）同口径。
  const TAC_NAME = { n: '直接打', b: '格挡', g: '架盾', t: '缠斗', f: '自动挡' };
  function lastTacticLine(last) {
    if (!last || !last.p) return '';
    const name = TAC_NAME[last.p] || '直接打';
    const dmg = typeof last.d === 'number' ? ` · 掉了 ${last.d} 血` : '';
    // 走 **强调** 而不是 <b>：这行由 renderRich 渲染（与全站文案同一条管线），
    // 直接塞 HTML 标签会被转义成字面量「<b>格挡</b>」（2026-11-24 实测踩到）。
    return `上次打这一种：**${name}**${dmg}`;
  }

  // ---------- 锁芯开场：那四道弧是什么（2026-11-26 加练·叙事；03:4x 追认改口） ----------
  // 地图上四段章色弧（render.js drawCoreRings）是锁环系统**唯一**的现场读数：你带下来几道锁，
  // 塔心石周围就亮几段。但全作没有一句话说过它是什么——玩家站在石头前看见四段亮弧，
  // 只能读出「这里有点会发光的东西」。旁白补一句，把它接回「你拆掉了四道锁」。
  // 不写死「四道都亮着」：v2.0 旧档迁上来 `flags.rings` 可能是空的，那句当场成假话（自审②旧档）。
  // **为什么从「你低头看脚下」改成「石头周围」**（03:4x）：这一屏 `KEY_SCENE.core → core.webp`，
  // `.bd-shot` 不透明且 z-index:1，地面在 CG 底下——旁白让人低头的那一瞬，画面里是石阶与神龛，
  // 脚下什么都没有。改成指向「石头」（CG 与地图里都在的东西），等对白收掉、玩家走到石心前
  // 正好看见那四段弧，句子才落地。别改回去：`code-test` 有「五档不许出现脚下/低头」守着。
  const CORE_RING_LINES = [
    '石头周围有四道弧，全是暗的。四道锁你都拆开了，却一道也没带在身上。',
    '石头周围有四道弧，只有一道亮着。其余三道埋在黑里，看不出原来是什么颜色。',
    '石头周围有四道弧，亮着两道。剩下两道暗在那儿，像没点过的蜡烛。',
    '石头周围有四道弧，亮着三道。第四道还是暗的——你数了两遍，确实少带了一道锁。',
    '石头周围有四道弧：紫、红、金、蓝，四道都亮着。四道锁，你一道也没落下。',
  ];
  function coreRingLine(n) {
    const i = Math.max(0, Math.min(4, n | 0));
    return CORE_RING_LINES[i];
  }

  // ---------- 战前面板：三把打法摆成可挑的卡（2026-11-24） ----------
  // 为什么也要搬进来：这三张卡上的每个数字都是同一套算术（额度 / 比例 / 剩血 / 余场），
  // 和战斗面板里的那三块是同一笔账。文案与减法只许有一处，所以卡也走同一组模型。
  // f = { base, hp, floor, hasBlock, nonTrivial,
  //       block:{left,limit,scale,damage} | null, guard:{count,damage,scale} | null, tangle:{extra,mult,exp,expGain,damage} | null }
  function prepOptions(f) {
    const o = f || {};
    // 「只有格挡能活」的那一场（`blockSave`）：这一屏摆出来的每个选项都必须**真能被执行**。
    // 而这一档里引擎在开打时会强制替玩家挡下（`main.js` launch 的 `autoBlock`），所以——
    // ①「直接开打」写着「撑不住」，点下去却会被挡下（承伤是格挡的数，不是白打的数）：一张没有对应后果的卡；
    // ②「缠斗」也落空：结算里格挡优先于缠斗，多挨的那一轮与经验一分都拿不到。
    // 两张都撤掉，只留「格挡 / 架盾」——这两条是真能走的路（架盾更贵，但盖住本层余下的场次）。
    // 撤掉后若只剩一张（没到架盾的层），`main.js` 见「只有一张」就不弹面板，
    // 玩家读的是 2845 那条烛的明话「格挡能把你救下来」，行为与 11-24 之前一致。
    const blockSave = !!o.blockSave;
    const out = blockSave ? [] : [{
      id: 'none', ico: PREP_ICON.none, name: '直接开打',
      sub: '不花额度，按现在的攻防打', dmg: o.base || 0,
    }];
    // 杂兵小架（承伤不到血量上限 5%，且不是 Boss）不值得打断：只留一张「直接开打」，
    // main.js 见只有一张就不弹面板——这跟战斗面板当年「小架不摆格挡」是同一条口径。
    // （这一档与 blockSave 互斥：撑不住的承伤必然 ≥ 5% 上限。）
    if (!o.nonTrivial) return out;
    if (o.block && o.hasBlock) {
      const bm = blockModel({ limit: o.block.limit, left: o.block.left, scale: o.block.scale, hp: o.hp, damage: o.block.damage });
      out.push({
        id: 'block', ico: PREP_ICON.block, name: '格挡 · 只挡这一场',
        sub: `${bm.quota} · 这一场承伤压到 ${100 - bm.pct}%`,
        dmg: o.block.damage,
      });
    }
    if (o.guard && o.floor >= 3) {
      const gm = guardModel({ offer: true, count: o.guard.count, heroHp: o.hp, guardDamage: o.guard.damage, blockScale: o.block ? o.block.scale : 1 });
      out.push({
        id: 'guard', ico: PREP_ICON.guard, name: '架盾 · 盖住本层余下',
        sub: `此后 ${gm.rest} 场每场 −${Math.round((1 - (o.guard.scale || 0.85)) * 100)}% · 同样花掉一次格挡`,
        dmg: o.guard.damage,
        // 自动战备（View.autoPickTactic）要拿它跟单场格挡比「谁更省」：
        // rest 是本层这一场之外的余下场次，与卡面「此后 N 场」同一个数，不另算一份。
        rest: gm.rest,
      });
    }
    if (o.tangle && !blockSave) {
      const tm = tangleModel({ extra: o.tangle.extra, mult: o.tangle.mult, exp: o.tangle.exp, expGain: o.tangle.expGain, damage: o.tangle.damage, heroHp: o.hp });
      out.push({
        id: 'tangle', ico: PREP_ICON.tangle, name: '缠斗 · 多挨一轮',
        // 2026-11-25 06:5x 加练·游戏性焦点D：这里原先把战斗面板那一块（`tm.html`）剥掉标签直接当副标题，
        // 于是四张卡里只有这一张读作「🗡️ 缠斗多挨一轮 +40 血 · 经验 ×2 …」——三个问题同时出现：
        // ①🗡️ 与卡左边的线刻图标并存（PREP_ICON 的注释写着「不用 emoji」，用了的只有它）；
        // ②卡名「缠斗 · 多挨一轮」在副标题里又念了一遍，且剥标签把 `<b>缠斗</b><span>` 粘成「缠斗多挨一轮」；
        // ③「+57 血」是**多掉的伤**，可同一张卡右边写着「−1083」，一个面板里「+」指向伤、「−」指向伤。
        // 三张卡的其余三张都是「拿模型里的数、自己写一句」（`bm.quota` / `gm.rest`），只有它抄整句——
        // 改回同一种写法：数字取模型（同一笔账），句子归卡面（同一屏该长什么样）。
        // 长度也钉住：`po-main i` 按 430 宽只有一行（24 字，与架盾卡同档），超一个词就折成两行、卡高不齐。
        sub: `多掉 ${tm.extra} 血换经验 ×${tm.mult} · 这一场不能格挡`,
        dmg: o.tangle.damage,
      });
    }
    return out;
  }

  // ---------- 自动战备：把「战前面板」压成一个开关（2026-11-28） ----------
  // 用户要求：撞怪直接开打，不要每场选一次；买了商店的「战备罗盘」后，右侧出现一个开关，
  // 开着就由系统替他挑打法（关着就白打）。这里只负责「挑哪一张卡」——每个数都取自
  // View.prepOptions 已经算好的 dmg（与面板、战斗演出、引擎结算同一笔账），本函数不碰任何乘区。
  //
  // 规则：①「只有格挡能活」的那一场必须挡（block；引擎开打时本来也会强制挡，这里让它按玩家
  //          「自己挡」记账，而不是记成系统兜底的 'f'）；
  //       ② 额度每层只有 1–2 次，不能见怪就用：只在这场够疼（Boss，或承伤 ≥ 生命上限 8%）时动用；
  //       ③ 架盾盖住本层余下场次，余下 ≥ 4 场才比单场格挡更省（0.15×4 ≈ 0.45×1 起反超）；
  //       ④ 缠斗不自动：它明确要多掉血换经验，是「赌」不是「省」——替玩家赌，输了算谁的。
  //          （战前面板本身仍保留在截图/探针路径里，见 main.js 的 `__prepAuto === false`。）
  const AUTO_MIN_SHARE = 0.08;
  const AUTO_GUARD_REST = 4;
  function autoPickTactic(opts, f) {
    const o = f || {};
    const list = opts || [];
    const has = (id) => list.some((x) => x.id === id);
    if (o.blockSave) return has('block') ? 'block' : has('guard') ? 'guard' : 'none';
    if (!has('block') && !has('guard')) return 'none';
    const noneCard = list.find((x) => x.id === 'none');
    const base = noneCard ? noneCard.dmg : 0;
    const worth = !!o.boss || base >= (o.maxHp || 1) * AUTO_MIN_SHARE;
    if (!worth) return 'none';
    const guard = list.find((x) => x.id === 'guard');
    if (guard && (guard.rest || 0) >= AUTO_GUARD_REST) return 'guard';
    if (has('block')) return 'block';
    return 'none';
  }

  // 开关上的两行字（状态由 main.js 写进 DOM；文案只此一份，截图与探针都读它）
  const AUTO_PREP_NAME = '战备罗盘';
  const AUTO_PREP_ON = '自动战备 · 开';
  const AUTO_PREP_OFF = '自动战备 · 关';
  const AUTO_PREP_TIP = '撞怪时自动挑最省血的打法（格挡/架盾）；关掉就白打';

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
      : `「${vows[lockedVow].name}」已可解锁——下一局开局买下它`);
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
      // 已经买下、还没带着走过结局的誓约（锁着的已经在上一句里了）
      const unWon = Object.keys(vows).filter((id) => id !== 'none' && (o.hasVow && o.hasVow(id)) && !((mem.vowWins || {})[id]));
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

  // ---------- 结算摘要：顶行、余烬明细、这一局的几条账（2026-11-16 12:xx 切边界第五刀） ----------
  // 这一块此前是「模板串里嵌判断」：顶行把结局/塔心/回响/遗物/锁环五件事拼一行，
  // brief 里每一条都带一次算术（遗物件数、图鉴还差几件、上 S 的战意门槛、折叠后剩几项）。
  // 搬进这儿之后，Node 单测能直接盯「几件算超 4 件」「非 S 档才挂那句提示」「折叠后按钮写几项」。
  const BRIEF_SHOW = 4;
  const BRIEF_TIP_EDGE = '第八位勇者川的断剑，一直在你腰上。他没能走完的路，你替他走完了。';
  const BRIEF_TIP_ZEAL = (full) => `两条路都能上 S：少打怪把血留到碑魔，或打到 ${full} 只以上攒满战意（决战减伤 36%）`;
  // 图鉴新收录：只念前 4 件，多的收成「等 N 件」——摘要区是胶囊行，念全了会把面板顶长
  const NEWLY_HEAD = 4;

  // 顶行 + 那枚塔印的一句话。mode:'death' 时 meta 走「败局 · 第 N 层 · 击杀 · 用时」，
  // 胜局走「结局 · 塔心 · 回响 N/4 · 遗物 · 锁环」。两页共用同一个模型，是为了让「回响几章」只有一处定义。
  function endScoreModel(input) {
    const o = input || {};
    const name = o.sealName || '';
    const desc = o.sealDesc || '';
    if (o.mode === 'death') {
      return {
        cls: 'fall',
        name,
        meta: `${o.ending ? '' : '败局'} · 第 ${floorNo(o.floor0)} 层 · 击杀 ${o.kills || 0} · 用时 ${fmtTime(o.time || 0)}`,
        num: `✦ ${o.ember || 0}<small>余烬</small>`,
        title: `塔印「${name}」：${desc}`,
        tag: desc,
      };
    }
    const heartTxt = o.heart === 'taken' ? ' · 塔心带走' : o.heart === 'left' ? ' · 塔心留下' : '';
    return {
      cls: o.seal || 'rough',
      name,
      meta: `${o.ending === 'true' ? '真结局' : '普通结局'}${heartTxt} · 回响 ${o.echoDone || 0}/${CHAPTERS}`
        + ` · 遗物 ${o.relicCount || 0} · 锁环 ${o.ringCount || 0}`,
      num: `✦ ${o.ember || 0}<small>余烬</small>`,
      title: `塔印「${name}」：${desc}`,
      tag: desc,
    };
  }

  // 余烬明细：逐项 + 合计 + 「之前 → 现在」。余额这一句必须由 before 算，别在渲染层再加一遍
  // 2026-11-27 加练·美术焦点B：一件都没算上时（死在半路、击杀不足一档），这一行原先只剩
  // 「合计 +0」和「✦ 0 → 0」——三个没名没姓的 0 并排，玩家读不出「为什么是 0」「差多少才有一点」。
  // 空态改一句说清差多少；余额换成「余额 ✦ N」（0 → 0 这个箭头在空态没有信息量）。
  function emberDetailModel(input) {
    const o = input || {};
    const before = o.before || 0;
    const total = o.total || 0;
    const step = o.killStep || EMBER_KILL_STEP;
    const killCount = o.killCount || 0;
    const parts = (o.parts || []).map((p) => ({ label: p.label, n: p.n, html: `${p.label} <b>+${p.n}</b>` }));
    const empty = parts.length === 0;
    const note = empty
      ? (killCount > 0
        ? `每 ${step} 只记 1 点 · 本局 ${killCount} 只，还差 ${step - (killCount % step)} 只`
        : `每 ${step} 只怪记 1 点 · 本局还没打够`)
      : '';
    return {
      parts, total, empty, note,
      totalHtml: `合计 <b>+${total}</b>`,
      balance: `✦ ${before} → ${before + total}`,
      balanceNow: `余额 ✦ ${before + total}`,
    };
  }

  // 结算页那一行的 HTML：胜局与折戟共用（此前两处各拼一遍，改一句文案得记着改两处）
  function emberDetailHtml(input) {
    const m = emberDetailModel(input);
    const head = '<span class="eed-title">本局余烬</span>';
    if (m.empty) {
      return head + `<span class="eed-note">${m.note}</span>`
        + `<span class="eed-total">${m.balanceNow}</span>`;
    }
    return head
      + m.parts.map((p) => `<span>${p.html}</span>`).join('')
      + `<span class="eed-sum">${m.totalHtml}</span>`
      + `<span class="eed-total">${m.balance}</span>`;
  }

  // 胜局「这一局的几条账」：顺序就是玩家读的顺序，第一句必须是「哪座塔」（今日一塔藏着等于没写）
  // fx: { zealFull() }——战意门槛只有引擎知道，这里只负责把它写进那句提示
  function winBrief(input) {
    const o = input || {};
    const fx = o.fx || {};
    const out = [];
    if (o.dailyLabel) out.push(`今日一塔 · ${o.dailyLabel}`);
    // 跨零点：日签在结算时已经过期，这局按普通局记账。不说这一句，玩家只会读成「榜上没记上我」
    if (o.dailyCrossed) out.push('跨了零点：今日榜只收当天走完的，这局按普通局记账');
    out.push(`带走 ${o.relicCount || 0} 件遗物 · 击杀 ${o.kills || 0} 只`);
    if (o.worstHit) out.push(`最狠的一场：${o.worstName} −${o.worstHit}`);
    out.push(o.retries ? `重来本层 ${o.retries} 次` : '一次没回头');
    if (o.hint) out.push(`下一枚塔印：${o.hint}`);
    const newly = Array.isArray(o.collectNew) ? o.collectNew : [];
    if (newly.length) {
      const head = newly.slice(0, NEWLY_HEAD).join('、') + (newly.length > NEWLY_HEAD ? ` 等 ${newly.length} 件` : '');
      out.push(`图鉴新收录：${head}（还差 ${o.collectionRemain || 0} 件集齐）`);
    }
    if (o.relicEdge) out.push(`<i class="brief-tip" title="${BRIEF_TIP_EDGE}">替川走到了塔顶 ⓘ</i>`);
    // 决战余裕：S 档不挂提示（已经做到了），其余档说清还有两条路——门槛取引擎，不写死 40
    if (o.margin) {
      const m = o.margin;
      const tip = m.grade === 'S' ? '' : ` · <i class="brief-tip" title="${BRIEF_TIP_ZEAL(fx.zealFull ? fx.zealFull() : 40)}">上 S 有两条路 ⓘ</i>`;
      out.push(`决战余裕 <b>${m.grade}</b> · ${m.label}（剩 ${m.pct}%）${tip}`);
    }
    out.push(`✦ +${o.emberGain || 0}`);
    // 「下一枚塔印」是这一屏唯一的下一步行动句，它必须在展开区里。
    // 折叠线是前 4 条，而「今日一塔 · M月D日」与「跨了零点…」是**上下文**行，会把它挤到第 5 条——
    // 那一局正好是唯一有对手可比的局：玩家读到「未竟」，却看不到差什么。
    // 让位的是「最狠的一场」（纯回味），不是判据：塔印插到它前面，其余条目的相对顺序一概不动。
    const hintAt = out.findIndex((s) => s.indexOf('下一枚塔印：') === 0);
    if (hintAt >= BRIEF_SHOW) {
      const worstAt = out.findIndex((s) => s.indexOf('最狠的一场：') === 0);
      const at = worstAt >= 0 && worstAt < BRIEF_SHOW ? worstAt : BRIEF_SHOW - 1;
      out.splice(at, 0, out.splice(hintAt, 1)[0]);
    }
    return out;
  }

  // 败局「这一局的几条账」：与胜局同构，但第一句是陈述（败局也算履历），
  // 末尾挂一条「再折戟 1 次解锁成就」的预告——让「再来一局」多一个具体理由
  function deathBrief(input) {
    const o = input || {};
    const out = ['败局也算履历：击杀折成余烬带回。'];
    if (o.worstHit) out.push(`最狠的一场：${o.worstName} −${o.worstHit}`);
    const newly = Array.isArray(o.collectNew) ? o.collectNew : [];
    if (newly.length) {
      const head = newly.slice(0, NEWLY_HEAD).join('、') + (newly.length > NEWLY_HEAD ? ` 等 ${newly.length} 件` : '');
      out.push(`图鉴新收录：${head}（带走的东西不会因为倒下而丢失）`);
    }
    const falls = o.falls || 0;
    if (falls === 2) out.push('💀 再折戟 1 次，解锁成就「塔的常客」');
    else if (falls === 9) out.push('💀 再折戟 1 次，解锁成就「不死不休」');
    return out;
  }

  // 摘要区折叠：默认只铺前 4 项，其余收进「＋N 项」
  function briefModel(lines, cap) {
    const show = cap || BRIEF_SHOW;
    const items = (lines || []).map((html, i) => ({ html, extra: i >= show }));
    const hidden = Math.max(0, items.length - show);
    return { items, hidden, toggle: hidden ? `＋${hidden} 项 ▾` : '', openToggle: '收起 ▴' };
  }

  // 角色提示的排队过期（2026-11-26 06:2x 收口自检待办）：
  // 提示是「此刻该按 Q 了 / 这层还剩几只」这类**有时效**的话，排队那一侧只看「有没有面板盖着」，
  // 玩家在商店或图鉴里待多久，队列就攒多久——一关面板会一次放出一串早就不成立的话（面板里已经花掉的金币、
  // 已经换掉的楼层），而且泵（`setInterval(180ms)`）在 `canSay()` 长期为假时一直空转。
  // 这里只定一条规则：**排队超过 5 分钟的提示不再播**（丢掉比说错好）。清队列之后泵自己会停（调用侧见空就 clear）。
  // 注意别跟 `hintMs`（阅读时长 × 提示速度档）混用：过期是墙上时间，不该随「读得快」而缩短。
  const HINT_TTL = 300000;
  function hintSweep(queue, now, ttl) {
    const t = ttl == null ? HINT_TTL : ttl;
    // now 无效（漏传 / 脏值）时按「全部过期」处理：与「宁可不播」同一方向。
    // 退回 0 会让整队都算「刚入队」，过期机制静默失效——量具没给时间，不能当成现在。
    const at0 = Number(now);
    const keep = [];
    let dropped = 0;
    (Array.isArray(queue) ? queue : []).forEach((h) => {
      const at = h ? Number(h.at) : NaN;
      // 没有入队时间（老调用 / 脏数据）也按过期处理：宁可不播，不许在很久之后突然插一句
      if (!Number.isFinite(at0) || !Number.isFinite(at) || at0 - at > t) dropped++;
      else keep.push(h);
    });
    return { keep, dropped };
  }

  // ---------- 祭坛 / 回响 / 路遇：三块弹层的规则与明码 ----------
  // 这三块此前是「数据 → 模板串」直接写在 main.js 里：能验「画出来长什么样」，
  // 验不了「它说的和引擎做的是不是一回事」。搬进来以后 Node 单测能逐条核：
  // 路遇 24 个事件 52 个选项，每个选项 tip 承诺的每个数都得在 effect 里找到同一个数
  // ——本作的身份是「全明码」，这条不能只靠写的人记性。

  // 前四层是「八个人的行李」，第 5 层起换成另一堆（引擎侧同一个 `s.floor >= 4` 分界）
  const ALTAR_DESC_EARLY = '八个人留下的东西堆在墙角：卷刃的剑、干粮、泡烂的账册。<br>你只能带走一件。';
  const ALTAR_DESC_LATE = '这一堆还没人动过：一双铁腕、半瓶灯油、一本没写完的账。<br>你只能带走一件。';
  const ALTAR_EMPTY = '行李里已经空了，只剩灰。';
  function altarModel(input) {
    const o = input || {};
    const relics = o.relics || {};
    const cards = (o.choices || []).filter((id) => relics[id]).map((id) => ({
      id, emoji: relics[id].emoji, name: relics[id].name, desc: relics[id].desc,
    }));
    return {
      desc: (o.floor || 0) >= 4 ? ALTAR_DESC_LATE : ALTAR_DESC_EARLY,
      empty: cards.length === 0,
      cards,
    };
  }

  // 回响：章末锁环三选一。手里已有的环必须摆出来——第 2 章起这是
  // 「新一枚 + 已有 1~3 枚」的加法题，遮住等于让人凭记忆选。
  const ECHO_REWARD_PENDING = '锁匠倒下了 · 塔从墙上取下一枚锁环，让你挑';
  const ECHO_REWARD_TAKEN = '这一章的锁环你已经拿过了';
  const ECHO_HINT_PICK = '点一枚装上 · 也可按 1 / 2 / 3 · **选了不能换**';
  // 待选却一张卡也画不出来（池被过滤空 / 候选 id 全脏）时用这句：此时面板必须允许关，
  // 「必须选一个」的前提是至少有一个可选，否则玩家被锁在一间没有按钮的屋子里。
  const ECHO_HINT_EMPTY = '这一章没有可挑的锁环 · 关门继续';
  // 空卡时顶行也不能再说「让你挑」：一行说挑、屏上零张卡，就是文案与行为打架。
  const ECHO_REWARD_EMPTY = '这一章的锁环没能取出来 · 空手也能继续';
  function echoModel(input) {
    const o = input || {};
    const rings = o.rings || {};
    const pick = (id) => (rings[id] ? { id, emoji: rings[id].emoji, name: rings[id].name, desc: rings[id].desc } : null);
    const owned = (o.owned || []).map(pick).filter(Boolean);
    const pending = !!o.pending;
    // 已经拿过的章节不再摆候选（引擎也没给候选），面板只说一句「拿过了」
    const cards = pending ? (o.choices || []).map(pick).filter(Boolean) : [];
    // 待选但一张都画不出来：面板不许再锁（状态机死角——出不去比少拿一枚贵得多）
    const stuck = pending && !cards.length;
    return {
      kicker: `${o.title || ''} · 回响`,
      reward: stuck ? ECHO_REWARD_EMPTY : pending ? ECHO_REWARD_PENDING : ECHO_REWARD_TAKEN,
      muted: !pending,
      ownedHead: `已装 ${owned.length} 枚`,
      owned,
      cards,
      hint: pending ? (stuck ? ECHO_HINT_EMPTY : ECHO_HINT_PICK) : '',
      closable: !pending || stuck,
    };
  }

  // 路遇：付不起的时候，旧版把整句 tip 换成「还差 N 金」——最该看清取舍的一刻
  // 把「它给什么」藏了起来。现在改成「还差 N 金 · 它给什么」，两件事同屏。
  // 缺多少由引擎给（引擎侧 `eventShortfall` 是唯一判据），这里只负责写成人话。
  const KEY_NAMES = { y: '黄钥匙', r: '红钥匙' };
  function shortfallText(sh) {
    if (!sh) return '';
    if (sh.kind === 'gold') return `还差 ${sh.need} 金`;
    if (sh.kind === 'key') return `还差 ${sh.need} 把${KEY_NAMES[sh.key] || '钥匙'}`;
    // 「用掉这一层的格挡」付不起时，理由自己就是人话（没学 / 禁挡誓约 / 已用光）
    if (sh.kind === 'block') return sh.msg || '这一层的格挡不可用';
    return '';
  }
  function eventModel(input) {
    const o = input || {};
    const e = o.event || {};
    const shorts = o.shorts || [];
    return {
      emoji: e.emoji || '',
      name: e.name || '',
      text: e.text || '',
      opts: (e.options || []).map((opt, i) => {
        const why = shortfallText(shorts[i]);
        const tip = opt.tip || '';
        return {
          i,
          label: opt.label,
          note: why ? (tip ? `${why} · ${tip}` : why) : tip,
          why,
          disabled: !!why,
        };
      }),
    };
  }

  // ---------- 图鉴：顺序 / 承伤档位 / 边际收益这一行 ----------
  // 这一屏此前把三件「规则」写在渲染函数里，只能靠截图看画出来的字：
  // ①怪物顺序＝首次出现的楼层（那是玩家认识它们的顺序，手抄名单在扩层后漏过 8 只锁梁怪）；
  // ②承伤染色按「占最大生命的比例」分档（1/4 以上标红）；③边际收益那一行还要分三种写法
  // （有特性、打不过、已无伤）。搬进来之后这三条都能用 Node 单测直接盯。
  // 2026-11-28 改名：人物图鉴用真名（长明/秦权/沈砚/裴炬/顾铎/宋铭）。
  // 「魔王」单独留一格——它是玩家在第 6 层实际打的那张脸，也是镇上叫了八十年的名字。
  const CODEX_CHARS = [
    { who: '长明', role: '守灯人', cap: '长明 · 守灯人 · 塔里唯一还肯说话的人' },
    { who: '薇拉', role: '锁里的公主', cap: '薇拉 · 锁里的公主 · 王冠与面纱两种样子' },
    { who: '秦权', role: '流浪商人', cap: '秦权 · 流浪商人 · 什么都收，什么都卖' },
    { who: '裴炬', role: '守炉者', cap: '裴炬 · 第一位工匠 · 镇上叫他炎魔，后来叫他魔王' },
    { who: '魔王', role: '炉心之锁', cap: '魔王 · 裴炬被锈吃掉之后的那一面 · 第 6 层' },
    { who: '沈砚', role: '名册之锁', cap: '沈砚 · 第二位工匠 · 塔里叫他墨妖 · 第 3 层' },
    { who: '顾铎', role: '时辰之锁', cap: '顾铎 · 第四位工匠 · 塔里叫他钟妖 · 第 9 层' },
    { who: '宋铭', role: '无名之锁', cap: '宋铭 · 第五位工匠 · 塔里叫他碑魔 · 第 12 层' },
  ];
  const CODEX_BOSSES = { 魔王: 1, 沈砚: 1, 顾铎: 1, 宋铭: 1 };
  // 承伤占最大生命 1/4 以上＝这一战会要命，标红；比它轻的只提醒（warn）
  const LOSS_DANGER = 0.25;
  const NO_FIRST_FLOOR = 99;

  // 承伤这一格的唯一判据：图鉴与「怪物速查卡」两处都要显示这一格，
  // 以前两处各写一份（连「破不了防」的写法都不一样：图鉴写「无法破防」、速查卡写「攻 +N 才能破防」），
  // 于是同一个阈值 0.25 在渲染层出现两遍，改一处另一处就成了谎。
  // input: { pred, maxHp, needAtk }（needAtk = 还差几点攻才能破防，速查卡才给得出）
  // 输出：{ kind, text, cls, amount }——kind: unknown / nopen / zero / dmg
  function lossModel(input) {
    const o = input || {};
    const pred = o.pred;
    const maxHp = o.maxHp || 1000;
    if (!pred) return { kind: 'unknown', text: '??', cls: 'danger', amount: null };
    if (pred.damage == null) {
      return {
        kind: 'nopen',
        text: o.needAtk != null ? `攻 +${o.needAtk} 才能破防` : '无法破防',
        cls: 'danger',
        amount: null,
      };
    }
    if (pred.damage === 0) return { kind: 'zero', text: '无伤', cls: 'safe', amount: 0 };
    return {
      kind: 'dmg',
      text: `-${pred.damage}`,
      cls: pred.damage >= maxHp * LOSS_DANGER ? 'danger' : 'warn',
      amount: pred.damage,
    };
  }

  // input: { monsters, floors, traits, met(who), predict(ch), margin(ch), maxHp, characters }
  // 输出：{ chars, rows, metCount, total, metLine }
  //   rows 只含「画出来要用的字段」；margin 为 null 表示没有数字可给（打不过 / 没数据）
  function codexModel(input) {
    const o = input || {};
    const monsters = o.monsters || {};
    const floors = o.floors || [];
    const traits = o.traits || {};
    const met = o.met || (() => false);
    const predict = o.predict || (() => null);
    const margin = o.margin || (() => null);
    const maxHp = o.maxHp || 1000;
    const charsIn = o.characters || CODEX_CHARS;

    // 首次出现的楼层：扫全塔地图（Boss 在第 3/6/9/12 层，锁梁怪散在各层）
    const firstFloor = {};
    floors.forEach((f, fi) => {
      ((f && f.map) || []).forEach((row) => {
        for (const ch of row) {
          const m = monsters[ch];
          if (m && !m.ghost && firstFloor[ch] === undefined) firstFloor[ch] = fi;
        }
      });
    });
    const order = Object.keys(monsters)
      .filter((ch) => monsters[ch] && !monsters[ch].ghost)
      .sort((a, b) => {
        const fa = firstFloor[a] === undefined ? NO_FIRST_FLOOR : firstFloor[a];
        const fb = firstFloor[b] === undefined ? NO_FIRST_FLOOR : firstFloor[b];
        return fa - fb;
      });

    const chars = charsIn.map((c) => ({
      who: c.who,
      cap: c.cap || '',
      met: !!met(c.who),
      boss: !!CODEX_BOSSES[c.who],
      // 没相遇就不报身份（报了等于剧透），只写「尚未相遇」
      roleText: met(c.who) ? c.role : '尚未相遇',
    }));

    const rows = order.map((ch) => {
      const m = monsters[ch];
      const loss = lossModel({ pred: predict(ch), maxHp });
      const T = m.trait && traits[m.trait] ? traits[m.trait] : null;
      const mg = margin(ch);
      return {
        ch,
        name: m.name || '',
        kind: m.kind || '',
        boss: !!m.boss,
        chapter: m.chapter || 0,
        stat: `HP ${m.hp} · 攻 ${m.atk} · 防 ${m.def}`,
        loss: loss.text,
        lossCls: loss.cls,
        reward: `${m.gold}💰 ${m.exp}✨`,
        trait: T ? { icon: T.icon || '', name: T.name || '', cls: `t-${m.trait}` } : null,
        hasTrait: !!T,
        // 只给数字不给结论：该加攻还是加防仍由玩家判断
        margin: mg ? { atk: mg.atk, def: mg.def, noDamage: mg.base === 0 } : null,
        // 有特性但算不出边际（打不过）时那一行仍要出现，写「暂时打不过」
        marginEmpty: !T && !mg,
      };
    });

    const metCount = chars.filter((c) => c.met).length;
    return {
      chars, rows, metCount, total: chars.length,
      // 分母跟着人物表走（原来写死 8，加人就要回来改一次）
      metLine: `已相遇 ${metCount} / ${chars.length} · 点开看大图`,
    };
  }

  // ---------- 挑战链接：把码放进地址，朋友点开就一步收下 ----------
  // 社交面唯一的摩擦点是「50 多个字符」：复制码 → 粘到聊天 → 对方再找到榜面板 → 贴进来。
  // 关掉链路的不是没有社交功能，而是这条搬运链太长——所以发出去的应该是链接，码只是链接里的一段。
  // 三条口径：①只改 `rival` 参数，`sharecode` 等既有参数一个都不能丢（丢了打不开线上）；
  // ②码本身是 base64url（`-` `_` `.` 都在 URL 安全字符集里），不做二次转义，链接短且可读；
  // ③读参数一律走 URLSearchParams，别自己 split('&')（码里没 &，但参数多起来就会错）。
  const LINK_BASE = 'https://towermates.invalid/';
  function rivalLink(href, code) {
    const c = String(code == null ? '' : code).trim();
    const h = String(href == null ? '' : href);
    // 没有码（还没通关）或拿不到当前地址 → 不生成链接，交给调用方说人话
    if (!c || !h) return '';
    try {
      const u = new URL(h, LINK_BASE);
      u.searchParams.delete('rival'); // 连点两次不该出现两个 rival
      u.searchParams.set('rival', c);
      return u.toString();
    } catch (e) { return ''; }
  }
  // ---------- 朋友名录：上限与「挤掉谁」 ----------
  // 名录只留 12 条。这条上限原先在**两个写者**里各写了一遍（main.js 贴码 / wxwire.js 微信好友榜），
  // 而 main.js 的写法是先 push 再 `slice(0, 12)` —— 满 12 条时被切掉的正是**刚收下的那一条**
  // （新来的永远排在末尾），界面上却已经说过「收下了挑战·朋友」。玩家能看到的症状：
  // 收到第 13 位朋友的链接，提示条说收下了，榜上一条也没有；而 PROGRESS 里写的口径是「挤掉最老那条」。
  // 现在收拢成一处：名录按**收到时间从旧到新**排，上限从最旧那一端挤 —— 谁先来谁先让位。
  const RIVAL_CAP = 12;
  // 名录写盘前按「人」收一遍：同一个昵称只留最后（最新）那条——与开放数据域「每位好友一条最新成绩」同口径，
  // 也让 12 个位置留给 12 个人，而不是一个人的三次成绩。贴码行没有名字，按码区分，互不影响。
  // 榜单（boardModel）那侧留的是「最好那局」：一屏要排序，排序就该拿这个人最好的成绩去排；
  // 两个口径共用 personKey，谁都没有第二份「怎么算同一个人」的规则。
  function dedupeRivals(list) {
    const arr = Array.isArray(list) ? list : [];
    const seen = new Set();
    const out = [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const k = personKey(arr[i]);
      if (k) {
        if (seen.has(k)) continue;
        seen.add(k);
      }
      out.unshift(arr[i]);
    }
    return out;
  }
  function capRivals(list, cap) {
    const c = cap || RIVAL_CAP;
    const arr = dedupeRivals(list);
    return arr.length > c ? arr.slice(arr.length - c) : arr;
  }

  // 落地后把参数冲掉（相对地址即可，交给 replaceState）：刷新不该再收一次、也不该重复弹提示
  function withoutRival(href) {
    try {
      const u = new URL(String(href == null ? '' : href), LINK_BASE);
      u.searchParams.delete('rival');
      return `${u.pathname}${u.search || ''}${u.hash || ''}`;
    } catch (e) { return String(href == null ? '' : href); }
  }
  function rivalFromSearch(search) {
    try {
      return String(new URLSearchParams(String(search == null ? '' : search)).get('rival') || '').trim();
    } catch (e) { return ''; }
  }

  return {
    boardModel, shopModel, codexModel, lossModel, CODEX_CHARS,
    rivalLink, withoutRival, rivalFromSearch, RIVAL_CAP, capRivals, dedupeRivals, personKey,
    altarModel, echoModel, eventModel, shortfallText,
    endScoreModel, emberDetailModel, emberDetailHtml, winBrief, deathBrief, briefModel, hintSweep, HINT_TTL,
    sealOf, nextSealHint, sealTarget, emberModel,
    cmpBoard, fmtTime, endName, marginRank, sameRun, isMine, RUN_KEYS, rivalVerdict, VERDICT_NONE, NAME_FALLBACK,
    FLOOR_SCALE, FLOOR_OFFSET, migrateFloorRecs,
    deathStatsModel, winStatsModel, memModel, floorNo, migrateFloors,
    foeName, traitNote, threatModel, blockModel, guardModel, tangleModel, prepOptions, lastTacticLine, coreRingLine, PREP_FIRST, PREP_HINT,
    autoPickTactic, AUTO_PREP_NAME, AUTO_PREP_ON, AUTO_PREP_OFF, AUTO_PREP_TIP,
    hintPicked, HINT_PICK, HINT_AUTO,
    BOARD_TABS, BOARD_CAP, SHOP_CORE, SEALS, CHAPTERS, isAid,
    NOTE_DAILY, NOTE_STALE, NOTE_CRUSHED, NOTE_NO_RUN, NOTE_NO_MINE_TAB, EMPTY_OTHER, TIP_BLOCK, TIP_SHARD,
    MEM_NOTE_DEATH, MEM_NOTE_WIN, BRIEF_SHOW,
    ALTAR_DESC_EARLY, ALTAR_DESC_LATE, ALTAR_EMPTY,
    ECHO_REWARD_PENDING, ECHO_REWARD_TAKEN, ECHO_HINT_PICK, ECHO_HINT_EMPTY, ECHO_REWARD_EMPTY,
    KEY_NAMES,
  };
});
