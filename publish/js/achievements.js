// TowerMates · 成就系统（29 项，含章节 Boss/遗物/结局/塔心/誓约/锁环）
// 定义 + 检测 + 通知，存储在 localStorage。与引擎解耦，由 main 喂事件。
(function () {
  const KEY = 'towermates_ach_v1';

  const DEFS = [
    { id: 'first_blood', name: '初鸣', emoji: '🗡️', desc: '击败第一只怪物' },
    { id: 'slayer10', name: '屠塔人', emoji: '🗡️', desc: '单局击败 10 只怪物' },
    { id: 'slayer25', name: '塔中传说', emoji: '☠️', desc: '单局击败 25 只怪物' },
    { id: 'lv5', name: '小有名气', emoji: '⭐', desc: '等级达到 Lv.5' },
    { id: 'lv8', name: '身经百战', emoji: '🌟', desc: '等级达到 Lv.8' },
    { id: 'rich', name: '小金库', emoji: '💰', desc: '同时持有 500 金币' },
    { id: 'shopper', name: '商人旧友', emoji: '🏪', desc: '在秤那里消费 5 次' },
    { id: 'keys3', name: '开锁匠', emoji: '🔑', desc: '同时持有 3 把以上钥匙' },
    { id: 'secret1', name: '墙后的房间', emoji: '🕳️', desc: '走进不在图纸上的密道' },
    { id: 'secret2', name: '守誓者', emoji: '🛡️', desc: '打开密道红门，取回守誓之盾' },
    { id: 'journal', name: '工匠手记', emoji: '📜', desc: '找到压在砖缝里的手记' },
    { id: 'edge', name: '接过断剑', emoji: '🗡️', desc: '拾起第八位勇者的断裂佩剑' },
    { id: 'edge_finish', name: '执剑者', emoji: '🤺', desc: '带着川的断剑走到塔顶——他没能走完的路，你替他走完了' },
    { id: 'boss', name: '弑王', emoji: '🐉', desc: '击败塔顶的魔王' },
    { id: 'boss_yan', name: '账已两清', emoji: '📖', desc: '击败名册之锁的墨妖' },
    { id: 'boss_duo', name: '钟停', emoji: '🔔', desc: '击败守钟人钟妖' },
    { id: 'boss_heng', name: '刻刀放下', emoji: '🪶', desc: '击败刻名者碑魔' },
    { id: 'all_boss', name: '四把锁', emoji: '🔐', desc: '一局内击败四位章节 Boss' },
    { id: 'floor12', name: '塔顶之上', emoji: '🗼', desc: '抵达第 12 层「塔顶·无名」' },
    { id: 'end_true', name: '同伴之塔', emoji: '🕯️', desc: '达成真结局「第六个名字」' },
    { id: 'end_plain', name: '铁与霜', emoji: '🗡️', desc: '达成普通结局「铁与霜」' },
    { id: 'heart_take', name: '心跳在身', emoji: '💗', desc: '带走锁芯的塔心石' },
    { id: 'heart_leave', name: '把手放下', emoji: '🪨', desc: '把塔心石留在锁芯' },
    { id: 'core', name: '塔心', emoji: '🫀', desc: '清空隐藏层「锁芯」' },
    { id: 'vow_mercy', name: '手软的人', emoji: '🕊️', desc: '以慈悲之誓走到结局' },
    { id: 'vow_greed', name: '一分不落', emoji: '🪙', desc: '以贪婪之誓走到结局' },
    { id: 'vow_guard', name: '不必再挡', emoji: '🛡️', desc: '以铁壁之誓走到结局' },
    { id: 'vow_all', name: '三誓皆立', emoji: '📜', desc: '三条誓约各走到一次结局' },
    { id: 'ring_first', name: '第一道环', emoji: '⭕', desc: '装上第一枚锁环' },
    { id: 'ring_four', name: '四环齐备', emoji: '🔗', desc: '一局内四章各装上一枚锁环' },
    { id: 'bare', name: '一口空气', emoji: '🌬️', desc: '一件遗物都不拿，走到结局' },
    { id: 'dodger', name: '绕道者', emoji: '💨', desc: '击败不超过 10 只怪，走到结局' },
    { id: 'sweeper', name: '清塔者', emoji: '🗡️', desc: '击败至少 50 只怪，走到结局' },
    { id: 'fall3', name: '塔的常客', emoji: '💀', desc: '累计折戟 3 次——塔记住了你倒下的地方' },
    { id: 'fall10', name: '不死不休', emoji: '⚰️', desc: '累计折戟 10 次——每一层都留过你的名字' },
  ];

  let unlocked = {};
  try {
    unlocked = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {}

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(unlocked)); } catch (e) {}
  }
  function isUnlocked(id) { return !!unlocked[id]; }
  function unlock(id, notify) {
    if (unlocked[id]) return false;
    const def = DEFS.find((d) => d.id === id);
    if (!def) return false;
    unlocked[id] = Math.floor(Date.now() / 1000);
    persist();
    if (notify) notify(def);
    return true;
  }
  function count() { return Object.keys(unlocked).length; }

  // 由 main 在事件后调用：喂当前状态快照 + 事件名
  function evaluate(ev, s, notify) {
    if (!s) return;
    const f = s.flags || {};
    if (ev === 'kill') {
      const kills = f.killCount || 0;
      if (kills >= 1) unlock('first_blood', notify);
      if (kills >= 10) unlock('slayer10', notify);
      if (kills >= 25) unlock('slayer25', notify);
    }
    if (s.level >= 5) unlock('lv5', notify);
    if (s.level >= 8) unlock('lv8', notify);
    if (s.gold >= 500) unlock('rich', notify);
    if ((f.shopCount || 0) >= 5) unlock('shopper', notify);
    if ((s.keys ? s.keys.y + s.keys.r : 0) >= 3) unlock('keys3', notify);
    if (f.secret1) unlock('secret1', notify);
    if (f.relic_ward) unlock('secret2', notify);
    if (f.journal) unlock('journal', notify);
    if (f.relic_edge) unlock('edge', notify);
    if (f.bossKilled) unlock('boss', notify);
    if (f.bossKilled_N) unlock('boss_yan', notify);
    if (f.bossKilled_Y) unlock('boss_duo', notify);
    if (f.bossKilled_U) unlock('boss_heng', notify);
    if (f.bossKilled_N && f.bossKilled_Z && f.bossKilled_Y && f.bossKilled_U) unlock('all_boss', notify);
    if (s.floor >= 11) unlock('floor12', notify);
    if (s.ending === 'true') unlock('end_true', notify);
    if (s.ending === 'plain') unlock('end_plain', notify);
    if (f.heart === 'taken') unlock('heart_take', notify);
    if (f.heart === 'left') unlock('heart_leave', notify);
    if (f.coreClear) unlock('core', notify);
    if (s.ending) {
      if (f.vow === 'mercy') unlock('vow_mercy', notify);
      if (f.vow === 'greed') unlock('vow_greed', notify);
      if (f.vow === 'guard') unlock('vow_guard', notify);
      if (isUnlocked('vow_mercy') && isUnlocked('vow_greed') && isUnlocked('vow_guard')) unlock('vow_all', notify);
    }
    // 章末回响与锁环（通用判定，任何事件后都会过一遍）
    const rings = Array.isArray(f.rings) ? f.rings : [];
    if (rings.length >= 1) unlock('ring_first', notify);
    const chapters = new Set(rings.map((id) => (window.GAME_DATA.rings[id] || {}).chapter));
    if (chapters.size >= 4) unlock('ring_four', notify);
    // 一口空气：一件遗物都没拿，走到结局（4.6% 的那种打法）
    if (s.ending && !Object.keys(f).some((k) => k.indexOf('relic_') === 0)) unlock('bare', notify);
    // 两条路线各有勋章：绕道者靠省血、清塔者靠战意（战意只在最终决战生效）
    if (s.ending && (f.killCount || 0) <= 10) unlock('dodger', notify);
    if (s.ending && (f.killCount || 0) >= 50) unlock('sweeper', notify);
    // 执剑者：带着川的断剑走到结局（第八勇者线的正式收藏格）
    if (s.ending && f.relic_edge) unlock('edge_finish', notify);
    // 折戟里程碑：ev === 'dead' 由死亡结算喂入，f.falls 是跨局累计（Meta.memory.falls）
    if (ev === 'dead') {
      if ((f.falls || 0) >= 3) unlock('fall3', notify);
      if ((f.falls || 0) >= 10) unlock('fall10', notify);
    }
  }

  function reset() {
    unlocked = {};
    persist();
  }

  window.Achievements = { DEFS, isUnlocked, unlock, count, evaluate, reset };
})();
