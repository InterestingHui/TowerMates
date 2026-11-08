// TowerMates · 成就系统（v2.0：27 项，含章节 Boss/遗物/结局/塔心/誓约）
// 定义 + 检测 + 通知，存储在 localStorage。与引擎解耦，由 main 喂事件。
(function () {
  const KEY = 'towermates_ach_v1';

  const DEFS = [
    { id: 'first_blood', name: '初鸣', emoji: '⚔️', desc: '击败第一只怪物' },
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
    { id: 'boss', name: '弑王', emoji: '🐉', desc: '击败塔顶的魔王' },
    { id: 'boss_yan', name: '账已两清', emoji: '📖', desc: '击败名册之锁的砚' },
    { id: 'boss_duo', name: '钟停', emoji: '🔔', desc: '击败守钟人铎' },
    { id: 'boss_heng', name: '刻刀放下', emoji: '🪶', desc: '击败刻名者衡' },
    { id: 'all_boss', name: '四把锁', emoji: '🔐', desc: '一局内击败四位章节 Boss' },
    { id: 'floor12', name: '塔顶之上', emoji: '🗼', desc: '抵达第 12 层「塔顶·无名」' },
    { id: 'end_true', name: '同伴之塔', emoji: '🕯️', desc: '达成真结局「第六个名字」' },
    { id: 'end_plain', name: '铁与霜', emoji: '⚔️', desc: '达成普通结局「铁与霜」' },
    { id: 'heart_take', name: '心跳在身', emoji: '💗', desc: '带走锁芯的塔心石' },
    { id: 'heart_leave', name: '把手放下', emoji: '🪨', desc: '把塔心石留在锁芯' },
    { id: 'core', name: '塔心', emoji: '🫀', desc: '清空隐藏层「锁芯」' },
    { id: 'vow_mercy', name: '手软的人', emoji: '🕊️', desc: '以慈悲之誓走到结局' },
    { id: 'vow_greed', name: '一分不落', emoji: '🪙', desc: '以贪婪之誓走到结局' },
    { id: 'vow_guard', name: '不必再挡', emoji: '🛡️', desc: '以铁壁之誓走到结局' },
    { id: 'vow_all', name: '三誓皆立', emoji: '📜', desc: '三条誓约各走到一次结局' },
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
  }

  function reset() {
    unlocked = {};
    persist();
  }

  window.Achievements = { DEFS, isUnlocked, unlock, count, evaluate, reset };
})();
