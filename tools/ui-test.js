// 无头浏览器 UI 自检：跳层神器的明码取舍、新模块加载、挑战码贴码进榜闭环
// 用法：node tools/ui-test.js（需要 Chrome/Edge；没有时跳过，不算失败）
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.log('! 没找到 Chrome/Edge，跳过 UI 检查');
  process.exit(0);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-ui-'));

(async function () {
  // 让系统分配空闲端口：多个会话同时跑回归时不会互相抢占
  const probe = net.createServer();
  const PORT = await new Promise((resolve) => {
    probe.listen(0, '127.0.0.1', () => {
      const p = probe.address().port;
      probe.close(() => resolve(p));
    });
  });
  const server = spawn(process.execPath, ['tools/serve.js', String(PORT), ROOT], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=120000', '--dump-dom',
    `http://127.0.0.1:${PORT}/tools/ui-check.html`,
  ];
  const dump = () => spawnSync(chrome, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const preOf = (txt) => /<pre[^>]*id="out"[^>]*>([\s\S]*?)<\/pre>/.exec(txt || '');
  let r = dump();
  let m = preOf(r.stdout);
  // 无头 Chrome 偶发拿到空 DOM、或 iframe 的 run 还没跑完（多会话并发时更常见），重试一次
  if (r.status !== 0 || !m || m[1] === 'pending') {
    r = dump();
    m = preOf(r.stdout);
  }
  server.kill();
  if (!m) {
    console.log('✗ 没拿到 UI 检查输出');
    process.exit(1);
  }
  const txt = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  let out;
  try { out = JSON.parse(txt); } catch (e) {
    console.log('✗ UI 输出不是 JSON：' + txt.slice(0, 200));
    process.exit(1);
  }
  if (out.error) console.log('  iframe 报错：' + out.error.slice(0, 300));

  let bad = 0;
  function ok(cond, label) {
    if (cond) console.log('✓ ' + label);
    else { bad++; console.log('✗ ' + label); }
  }
  ok(out.booted === true, '?play=1 后引擎就绪');
  ok(out.modules && out.modules.touch && out.modules.challenge && out.modules.wx, '触控 / 挑战码 / 平台桥接模块已加载');
  ok(out.gateEnabled === true, '首层拿到钥匙时「往前开一层」可用');
  ok(typeof out.gateBtn === 'string' && out.gateBtn.indexOf('往前开一层') >= 0, '按钮写明目标层与一次性');
  ok(typeof out.gateTip === 'string' && out.gateTip.indexOf('封印') >= 0, '代价在按钮下方明码列出');
  ok(out.afterFloor === 1 && out.gateForthUsed === true, '点两次确认后真的跳到第 2 层');
  ok(out.sealCount === 2, '两件宝物被封印并写进存档');
  ok(out.codeLen > 0 && out.codeLen <= 80, '挑战码短到能直接贴进输入框');
  ok(out.codeFloor === 9 && out.codeSeal === 'ward' && out.codeGoals === 3 && out.noScore === true, '挑战码还原层数/塔印/塔规，且不含结算分');
  ok(out.pasteMax >= 45, '贴码输入框容得下新码');
  ok(out.rivalFloor === true, '贴码后名录出现朋友的层数');
  ok(out.rivalFloorCell === '9层' && out.rivalNameNoFloor === true,
    `朋友行同一个数只说一遍：楼层交给「N层」列（${out.rivalFloorCell}），名字列不再重复（${out.rivalNameCell}）`);
  ok(out.tabIds === 'all,daily,none,mercy,greed,ascetic,guard,nameless' && out.tabCount === 8,
    `榜单档位覆盖全部六条誓约 + 全部 / 今日（实测 ${out.tabIds}）`);
  ok(out.hasAscTab === true && out.ascOnly === true,
    `「苦行」档只筛出苦行的局（实测 ${out.ascRows} 行）`);
  ok(out.hasNamelessTab === true && out.namelessRows === 0 && out.namelessEmpty === true,
    `没走过的誓约档给出「这一档还没有人」而不是空白（实测 ${out.namelessRows} 行）`);
  ok(out.allRowsAfterVowTabs >= 4, `「全部」档仍列全部行（实测 ${out.allRowsAfterVowTabs} 行）`);
  // 自己贴自己的码：这条判据原先按「重编码比字符串」写（誓约写死成 none），誓约不是 none 时会漏
  ok(out.selfWarn.indexOf('自己') >= 0, `贴自己的码 → 明说这是自己的成绩（实测「${out.selfWarn}」）`);
  // 存档里两局自己（12 层 + 11 层），榜上只该有一个「你」：旧实现把自己的历史全倒进榜，
  // 打到十几局后前十行全是「你」，朋友与影子一个都看不见（社交榜退化成成绩单）
  ok(out.mineRows === 1 && String(out.mineRowFloor).indexOf('12') >= 0,
    `榜单上自己只占一行、且是最好那局（实测 ${out.mineRows} 行 / ${out.mineRowFloor}）`);
  ok(out.selfBoardRows === 0 && out.selfRivalRows === 0,
    `贴自己的码既不新增行也不生成「挑战·朋友」行（命中 ${out.selfBoardRows} 行 / 幽灵 ${out.selfRivalRows}）`);
  ok(out.dailyCodeDay === true && out.dailyCodeLen <= 80, '今日一塔的码带日签（v5）且仍在输入框上限内');
  ok(out.dailyRows === 1 && out.dailyRival === true, '朋友贴的今日码进「今日」档（同塔才可比）');
  ok(out.plainDay === true && out.dailyRowsAfterPlain === 1, '没有日签的普通码进不了「今日」档');
  // 挑战链接（社交面）：发出去的是链接而不是 50 多个字符——复制的内容必须带码、且还落在同一个页面
  ok(out.rivalBtn === true, '榜面板有「复制挑战链接」按钮且真的占位');
  ok(out.rivalCopiedHasCode === true, `复制出去的链接里带着这一局的码（实测 ${out.rivalCopiedLen} 字符）`);
  ok(out.rivalCopiedSamePage === true, '链接指向同一个页面（不是空白页或别的站）');
  ok(typeof out.rivalLog === 'string' && out.rivalLog.indexOf('挑战链接已复制') >= 0,
    `点完说清复制了什么（实测「${out.rivalLog}」）`);
  // 复制的反馈必须落在按钮自己身上：榜单是整屏浮层，日志被压在下面看不见（2026-11-17 焦点A）
  ok(out.rivalBtnDone === true && out.rivalBtnDoneClass === true && out.rivalBtnDoneSame >= 34,
    `点完按钮就地换成「已复制」（高 ${out.rivalBtnDoneSame}px，不挪版）`);
  ok(out.rivalPill.indexOf('挑战链接已复制') >= 0, `顶部提示同时说清复制了什么（实测「${out.rivalPill}」）`);
  ok(out.rivalBtnRestored === '复制挑战链接' && out.rivalBtnRestoredClass === false,
    `1.4 秒后按钮文案自己回到原样（实测「${out.rivalBtnRestored}」）`);
  ok(out.rivalCodeCopied === true && out.rivalCodeBtnDone === true, '「复制码」那颗走同一个出口，同样就地反馈');
  ok(out.rivalLandTaken === true && out.rivalLandFloor === 7,
    `带 ?rival= 的链接开门即收下（名录里第 ${out.rivalLandFloor} 层那条）`);
  ok(String(out.rivalLandParam).indexOf('rival=') < 0, `收下后地址栏里的 rival 参数被冲掉（实测「${out.rivalLandParam}」）`);
  ok(out.rivalStrip === '/?sharecode=AAA#demo=1,2,3',
    `冲参数只去 rival，sharecode 与 hash 一个不动（实测「${out.rivalStrip}」）`);
  // 名录满 12 条时再收一位：挤掉的是最早那条，不是刚收下的这条（旧实现的切片方向是反的）
  ok(out.rivalCapLen === 12 && out.rivalCapKept === true,
    `满员时收下第 13 位，名录仍是 12 条且新那条在（实测 ${out.rivalCapLen} 条 / 新条在=${out.rivalCapKept}）`);
  ok(out.rivalCapEvictedOldest === true,
    `被挤掉的是最早那条（seed11 在 / seed0 不在 = ${out.rivalCapEvictedOldest}）`);
  ok(String(out.rivalCapWarn).indexOf('名录满') >= 0,
    `挤掉别人的时候当面说清（实测「${out.rivalCapWarn}」）`);
  ok(out.rivalNoCodeCopied === null && String(out.rivalNoCodePill).indexOf('先打完一局') >= 0 && out.rivalNoCodeBtn === true,
    `还没通关时不拼垃圾链接，提示条 + 按钮都说清原因（复制到「${out.rivalNoCodeCopied}」/ 提示「${out.rivalNoCodePill}」）`);
  // 结算页的分享出口：刚通关那一刻码就在屏幕上，搬不走等于没有
  ok(out.endActsInDom === true, '结算页有「把这一局发给朋友」一颗出口');
  ok(out.endActsShown === true && /^\d+x\d+$/.test(out.endBtnSize || ''),
    `胜利局面板里它真的看得见、有尺寸（实测 ${out.endBtnSize}）`);
  ok(out.endLinkHasCode === true && out.endBtnDone === true,
    '复制出去的是**屏幕上这串码**拼的链接（不是榜单里「历史最好一局」那份），按钮就地换字');
  ok(out.endActsDeadHidden === true && out.endDeadNoCopy === null,
    '死亡局没有码：整块藏起来，也不拼垃圾链接');
  // 摘要里的 ⓘ：整句不能只活在 title 里（触屏没有 hover，等于把那两句话锁了）
  ok(out.briefTipCount === 2 && out.briefTipHasTitle === true,
    `摘要里两处 ⓘ 都带着整句（实得 ${out.briefTipCount} 处）`);
  ok(out.briefTipSaid === true && out.briefTipFull === true,
    `点 ⓘ 弹提示条并念出整句（实测「${out.briefTipText}」）`);
  ok(out.briefTipHit >= 30, `ⓘ 的命中区高度 ≥30（实测 ${out.briefTipHit}px——行内竖直内边距不改行高，只撑命中区）`);
  ok(out.clickTarget !== null && out.clickDist >= 2, '找到一只不相邻的怪物作点击目标');
  ok(out.clickKills === 1, '只点一次怪物就自动走到跟前并完成战斗');
  ok(out.clickCleared === true && out.clickOnTile === true, '战斗后怪物消失、人物站上它的格子');
  // 打法归属（漏斗 dec）：归属由引擎给（Engine.fight 的 pick），UI 只负责计数
  ok(out.clickDecN === 1, '打法归属接线：点怪打完那一场记 n');
  const da = out.decAuto || {};
  ok(da.predBlockSave === true && da.panelUp === true, '造出「白打必死」的一场：战斗面板确实开了出来');
  ok(da.f === 1 && da.b === 0 && da.n === 0, `自动挡单记 f、不混进玩家格挡率（实测 f=${da.f} b=${da.b} n=${da.n}）`);
  ok(typeof da.hpLeft === 'number' && da.hpLeft > 0 && da.hpLeft < da.white,
    `自动挡真的救下这一场（剩 ${da.hpLeft} 血 < 白打 ${da.white}）`);
  // 演出抛错兜底（2026-11-17 自检）：抛错不许把「战斗忙」留在 true 上，也不许把战斗层留在屏幕上
  const ab = out.battleAbort || {};
  ok(ab.syncStuck === false, '装配段抛错：战斗层没留在屏幕上（否则没有关闭按钮 = 只能刷新）');
  ok(ab.syncAborts === 1 && ab.asyncAborts === 1, `两条抛错路径都走到兜底出口（装配段 ${ab.syncAborts} / 演出中段 ${ab.asyncAborts} 次）`);
  ok(ab.asyncClosed === true, '演出中段抛错后战斗层面板自己收掉');
  ok(ab.syncKills === 0 && ab.asyncKills === 0, `抛错的那两场都没算打赢（实测 ${ab.syncKills}/${ab.asyncKills} 只）`);
  ok(ab.retryKills === 1 && ab.retryCleared === true && ab.retryAborts === 0, '抛错之后输入立刻解锁：同一次运行里再点那只怪能正常打完');
  // 结算本体抛错（Engine.fight 自己炸）：演出已收场，锁必须跟着放，否则是空屏点不动
  ok(ab.doneClosed === true, '结算本体抛错：战斗层收掉后锁没有再留着（否则空屏点不动）');
  ok(ab.doneKills === 0 && ab.doneMonster === true, `结算失败的怪留在原地、没算打赢（实测击杀 +${ab.doneKills}）`);
  ok(ab.doneMoved === true, '结算抛错后输入立刻解锁：再走一格真的动了');
  ok(out.f3Walkable === true && out.f3ReachLedge === true, '第 3 层打墨妖的立足格可直达');
  ok(Array.isArray(out.shopChain) && out.shopChain.length === 3, '三层商人（8/11/13）都跑过单击流程');
  ok(out.shopChain.every((r) => r.hasM && r.hasStart), '每层商人与可走到的起点都找得到');
  ok(out.shopChain.every((r) => r.reached), '单击商店格一次就走到商人跟前（不再被教学对白打断寻路）');
  ok(out.shopChain.every((r) => r.dialog && r.shop && r.rows >= 9), '首会对白后商店面板打开且货架满列（回调不再被覆盖丢弃）');
  ok(out.shard && out.shard.poorGap === true, '锁芯碎片：钱不够时报「还差多少金」');
  ok(out.shard && out.shard.poorFarm === true, '锁芯碎片：告诉玩家本层还剩几只怪可刷（清空时指路下层）');
  ok(out.shard && out.shard.poorNoRawMark === true && out.shard.poorDisabled === true, '商店小字加粗真渲染（无裸星号）且买不起时按钮置灰');
  ok(out.shard && out.shard.anyRawMark === false, '整张货架的小字都不漏裸星号（重点走富文本渲染）');
  ok(out.shard && out.shard.richEnabled === true && out.shard.bought === true && out.shard.goldAfter === 40, '钱够可以买下碎片并扣 260（唯一）');
  ok(out.shard && out.shard.ownedDisabled === true && out.shard.emptyHint === true, '买完变「已拥有」置灰；清空层提示回下层找钱');
  ok(out.f3ShopOnPath === false, '通往墨妖的自动寻路不再踩到商店');
  ok(out.f3UpPath === true, '墨妖倒下后入口到上楼有通路');
  ok(out.firstWinBonus > 0 && out.firstWinBonus === Math.round(out.asceticEmber / 2), '解锁誓约首通额外 = 解锁成本一半（第二次不再给）');
  ok(out.avgEmber === 20 && out.avgFallback === 18, '余烬估算走近 3 局平均，无记录回退 18');
  ok(out.emberDetail === true, '结局页逐项展示本局余烬来源');
  ok(out.cleanEmber === true, '净芯之环：锁芯清 3 只 → 结算明细 +6 余烬（折算与引擎同源）');
  ok(out.lampBtn === true && out.lampLit === true, '全解锁后余烬可点亮层灯（扣 20、灯 +1）');
  ok(out.richBold === true && out.richNoHtml === true, '提示加粗生效且文案不会被当 HTML 执行');
  ok(out.hintScripts === true, '九条角色提示台词就位（含加粗重点）');
  ok(out.warnBold === true, '操作反馈里的重点也加粗');
  ok(out.hintDialog === true, '关键提示改走角色对白，点击可提前收起');
  ok(out.hintAutoClose === true, '角色提示悬挂到时自己收起，不会一直占着画面');
  ok(out.stuckBar === true, '打不过时顶栏钉住「还差多少攻击」的指引且重点加粗');
  ok(out.hintSpeed === true && out.hintMsScaled === true, '提示停留档位可切换且时长跟着变');
  ok(out.hintBook === true, '设置里可重看全部角色提示台词');
  ok(out.colMemory === true, '收藏图鉴：拿过的遗物/锁环写进跨局记忆');
  const totR = out.colTotalRelics, totG = out.colTotalRings;
  const totAll = totR + totG;
  ok(typeof out.colText === 'string' && new RegExp(`遗物 \\d+/${totR} · 锁环 \\d+/${totG}`).test(out.colText), '收藏收集度按全表计数');
  ok(out.colShown === true && out.colClosed === true, '收藏图鉴能打开也能关掉');
  ok(out.colCards === totAll && out.colGroups === 6, `收藏面板渲染全部藏品（${totR} 遗物 + ${totG} 锁环，4 章分组 + 成就墙 1 组）`);
  ok(out.colRelicTop >= 0 && out.colAchTop >= 0 && out.colRelicTop < out.colAchTop,
    `藏品在前、成就墙垫底（遗物组 ${out.colRelicTop}px < 成就组 ${out.colAchTop}px）`);
  ok(out.colJumpBtns === 2 && out.colJumped === true, '分区跳转签：点「成就」直达成就墙（滚动容器实滚）');
  ok(out.colGot >= 2 && out.colGot <= 4, '已获得的卡片高亮，其余置灰');
  ok(out.colHudChips === 2, 'HUD 遗物栏显示全部已获遗物（含旧十字架/幸运金币）');
  ok(Array.isArray(out.colNew) && out.colNew.length >= 2, '本局首次拿到的东西记进 collectNew（结算页「图鉴新收录」）');
  ok(out.colRemain === totAll - 4, '收藏剩余件数按全表算（全表 − 已收录 4）');
  ok(out.colDetail === true && out.colDetailHasFrom === true, '点卡片弹详情，带获取途径');
  ok(out.colDetailOff === true, '没拿到的卡片给「未获得」与去处线索');
  ok(out.colDetailAnim === 'popIn 0.16s', `详情条有进场动效（实得 ${out.colDetailAnim}——零过渡就是硬切）`);
  ok(out.colNextCount === 3, '收藏面板顶部给「下一件」三件待补');
  ok(out.colNextHasFrom === true, '「下一件」带去处线索');
  ok(out.colNextDetail === true, '点「下一件」也能看详情');
  ok(out.ringStat === true, '锁环使用统计：选中与通关各记一笔');
  ok(out.ringStatCard === true, '图鉴卡片上显示「选过几次」');
  ok(out.statBoard === true, '构筑档案：共选次数 / 最常用 / 胜率最高都在');
  // 图鉴剪影（11-17 收敛轮抓到的闸门盲点：paintIcon 失败会把 canvas remove，整列留白却全绿）
  ok(out.codexRows > 20 && out.codexIcons === out.codexRows,
    `图鉴每一行都有剪影图标（行 ${out.codexRows} / 图标 ${out.codexIcons}——少一块就是 paintIcon 没画出来）`);
  ok(Array.isArray(out.codexDark) && out.codexDark.length === out.codexRows && out.codexDark.every((p) => p >= 8 && p <= 92),
    `每格剪影本体真的画在画布上（近黑占比 ${(out.codexDark || []).slice(0, 6).join('% / ')}%…，全 ${(out.codexDark || []).length} 格都在 8–92%）`);
  // 无名之镜点开图鉴（2026-11-18 焦点D）：它自带面板，chip 点下去要翻开图鉴而不是念说明书
  ok(out.scoutChip === true && out.scoutOpensCodex === true, '点顶栏的无名之镜会直接翻开怪物图鉴');
  ok(out.scoutChipGone === true, '（探针自检）撤掉 relic_scout 后 chip 真的消失，说明上一条测的是它');
  // 守誓之盾（2026-11-18 叙事体检）：密道最里侧那面盾是八件剧情遗物里唯一一件哑的——
  // 名字里有「誓」，与开局立誓同词根，拿到手却只有一行数值 toast。这里守的是「玩家真走上去会对白」。
  ok(out.wardGot === true && out.wardStepped === true, '走到密道那面盾上真的拿到守誓之盾');
  ok(out.wardDialog === true, '拿盾的同时对白自己开（不是只弹一行数值 toast）');
  const wardText = (out.wardSnaps || []).join(' ');
  ok(wardText.indexOf('誓') >= 0, `对白里写出了这个名字的词根「誓」（快照 ${(out.wardSnaps || []).length} 张）`);
  ok((out.wardSnaps || []).filter((t, i, a) => t && t !== a[i - 1]).length >= 2,
    `至少两句不同的话（只有一句就成了标语，不是碎片）——实得「${(out.wardSnaps || []).filter(Boolean).slice(-1)[0] || ''}」`);
  ok(out.wardClosed === true, '跳过之后对白真的收起（别把玩家按在这一屏）');
  // 激励视频（IAA 红线）：默认关闭是硬要求——线上不允许出现任何广告按钮
  ok(out.adDefaultOff === true, '激励视频接口默认恒不可用（提审前不接 SDK）');
  ok(Array.isArray(out.adSlots) && out.adSlots.length === 2 && out.adSlots.indexOf('revive') >= 0 && out.adSlots.indexOf('ember') >= 0, '只留两个卡点槽位（复活 / 余烬翻倍），不做插屏横幅');
  ok(out.adImmediateFalse === true && out.adBadSlot === true, '不可用或非法槽位时立刻回调 false，不挂起调用方');
  ok(out.adNoBtn === true, '默认状态下死亡页不出现广告按钮');
  ok(out.adBtnShown === true && out.adBtnPending === true, '桩模式下按钮显形且点击后进入等待态');
  ok(out.adRevived === true && out.adRevivedHp > 0 && out.adReviveFlag === true, '看完视频原地复活：血回四成、over 复位、次数入档');
  // 调试入口总门（js/devgate.js）：上线域名下一律失效，否则一个 ?ads=1 就能白拿复活
  ok(out.devGateLoaded === true, '调试总门已加载（js/devgate.js）');
  ok(out.devGateLocal === true, '本地预览（localhost / 127.0.0.1 / file://）判为可调试');
  ok(out.devGateProd === true, '上线域名 / 相似域名 / 反代域名一律判为不可调试');
  ok(out.devGateHere === true, '本机探针自身跑在本地（门没把自家闸门关掉）');
  ok(out.renderErrors === 0, '整轮 UI 自检零渲染异常（rAF 兜底探针）');
  // 顶栏徽记预算（规格卡「顶栏徽记预算」行）：一组读数格最多 3 格同场，且不许把钥匙挤变形
  const hb = out.hudBudget || {};
  const hbKeys = Object.keys(hb);
  ok(hbKeys.length === 6, '顶栏徽记预算：六组满载组合都量到了');
  ok(hbKeys.every((k) => hb[k].pips <= 3), `可见徽记 ≤ 3 格（实测 ${hbKeys.map((k) => k + '=' + hb[k].pips).join(' ')}）`);
  ok(hbKeys.every((k) => hb[k].clipped.length === 0), '徽记一格都没被裁到内边距外');
  ok(hbKeys.every((k) => hb[k].over <= 0), `徽记区不横向溢出（实测 over ${hbKeys.map((k) => hb[k].over).join('/')}）`);
  ok((hb.base && hb.base.rowH <= 24) && (hb.rings3 && hb.rings3.rowH <= 24),
    `三枚锁环 + 三件遗物仍是一行（${hb.base && hb.base.rowH}px / ${hb.rings3 && hb.rings3.rowH}px）`);
  ok(hb.full && hb.full.rowH <= 46, `决战线满载最多两行（${hb.full && hb.full.rowH}px，上限 46）`);
  ok(hb.full && hb.full.kids.every((s) => !/^keytag/.test(s) || /x21$/.test(s)),
    '钥匙不被挤扁（仍是 39×21，文字不折行）');
  // 遗物全表（11 件，比一局真实上限 9 件更狠）+ 三锁环 + 三徽记：顶栏宽度预算此前只按三件遗物量过
  ok(hb.relicmax && hb.relicmax.over <= 0,
    `遗物全表满载不横向溢出（over ${hb.relicmax && hb.relicmax.over} / 行高 ${hb.relicmax && hb.relicmax.rowH}px / kids ${hb.relicmax && hb.relicmax.kids.join(' ')}）`);
  // 战斗面板提示行（三把打法互斥）：按下任一把之后，面板上不许再有任何能点的打法，
  // 提示行也不许再说「可点下面的打法」——那是叫人点一块已经点不动的东西
  const bh = out.bsHint || {};
  ok(bh.panelUp === true, '提示行探针：第 5 层那一战的面板真的开了');
  ok(bh.threeButtons === true, '三把打法同屏（格挡 / 架盾 / 缠斗，第 5 层起）');
  ok(bh.liveAfter === 0, `按下一把之后面板上再没有能点的打法（实测 ${bh.liveAfter}）`);
  ok(/按「格挡」打/.test(bh.after || ''), `按下格挡后提示行改口（实测：${bh.after}）`);
  ok(!/可点下面的打法/.test(bh.after || ''), '选完不再说「可点下面的打法」');
  // 键盘面（2026-11-16 21:xx）：立誓页可键盘 / 浮层挡走人 / Esc 覆盖 / 输入框隔离
  const kb = out.kbd || {};
  ok(kb.cards >= 4, `立誓页出全量卡（实测 ${kb.cards} 张）`);
  ok(kb.focus0 === 0 && kb.focus1 === 1 && kb.focusNoDup === 1,
    `立誓页 ← → 移动高亮且只亮一格（实测 ${kb.focus0} / ${kb.focus1} / 亮 ${kb.focusNoDup} 格）`);
  ok(kb.wrap === kb.cards - 1, `高亮在首尾循环（← 两次落到第 ${(kb.wrap || 0) + 1} 张）`);
  ok(kb.enterVow === kb.enterWant && kb.enterClosed === true,
    `Enter 真的选了高亮那张（${kb.enterVow} / 页已关：${kb.enterClosed}）`);
  ok(kb.digitVow === kb.digitWant, `数字键直选（按 2 → ${kb.digitVow}）`);
  ok(/← → 切换/.test(kb.hint || ''), `立誓页写明键盘操作（实测「${kb.hint}」）`);
  ok(kb.stayHintBook === true && kb.stayReset === true && kb.stayCollection === true,
    `整屏浮层开着时方向键走不动人（速查卡 ${kb.stayHintBook} / 重置确认 ${kb.stayReset} / 图鉴 ${kb.stayCollection}）`);
  ok(kb.escHintBook === true && kb.escReset === true && kb.escBoard === true && kb.escCollection === true,
    `Esc 覆盖所有可取消浮层（速查卡 ${kb.escHintBook} / 重置确认 ${kb.escReset} / 榜单 ${kb.escBoard} / 图鉴 ${kb.escCollection}）`);
  ok(kb.fieldDPrevented === false && kb.fieldArrowPrevented === false,
    '过滤框里打字不被移动分支吃掉（d / ← 都不 preventDefault）');

  if (bad) console.log('  诊断：' + JSON.stringify(out).slice(0, 700));
  console.log(bad === 0 ? '✓ UI 自检通过' : `✗ UI 自检 ${bad} 项失败`);
  process.exit(bad ? 1 : 0);
})();
