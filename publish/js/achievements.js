// TowerMates · 成就系统
// 定义 + 检测 + 通知，存储在 localStorage。与引擎解耦，由 main 喂事件。
(function () {
  const KEY = 'towermates_ach_v1';

  const DEFS = [
    { id: 'first_blood', name: '初鸣', emoji: '⚔️', desc: '击败第一只怪物' },
    { id: 'slayer10', name: '屠塔人', emoji: '🗡️', desc: '累计击败 10 只怪物' },
    { id: 'slayer25', name: '塔中传说', emoji: '☠️', desc: '累计击败 25 只怪物' },
    { id: 'lv5', name: '小有名气', emoji: '⭐', desc: '等级达到 Lv.5' },
    { id: 'lv8', name: '身经百战', emoji: '🌟', desc: '等级达到 Lv.8' },
    { id: 'rich', name: '小金库', emoji: '💰', desc: '同时持有 500 金币' },
    { id: 'shopper', name: '商人旧友', emoji: '🏪', desc: '累计在商店消费 5 次' },
    { id: 'keys3', name: '开锁匠', emoji: '🔑', desc: '同时持有 3 把以上钥匙' },
    { id: 'secret1', name: '墙后的房间', emoji: '🕳️', desc: '发现第一层密道' },
    { id: 'secret2', name: '图纸之外', emoji: '🧩', desc: '到达密道深处' },
    { id: 'journal', name: '第九个名字', emoji: '📜', desc: '找到工匠手记' },
    { id: 'boss', name: '弑王', emoji: '🐉', desc: '击败魔王' },
    { id: 'end_true', name: '同伴之塔', emoji: '🕯️', desc: '达成真结局' },
    { id: 'end_plain', name: '铁与霜', emoji: '⚔️', desc: '达成普通结局' },
  ];

  let unlocked = {};
  try {
    unlocked = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {}

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(unlocked));
    } catch (e) {}
  }

  function isUnlocked(id) {
    return !!unlocked[id];
  }

  function unlock(id, notify) {
    if (unlocked[id]) return false;
    const def = DEFS.find((d) => d.id === id);
    if (!def) return false;
    unlocked[id] = Math.floor(Date.now() / 1000);
    persist();
    if (notify) notify(def);
    return true;
  }

  function count() {
    return Object.keys(unlocked).length;
  }

  // 由 main 在事件后调用：喂当前状态快照 + 事件名
  function evaluate(ev, s, notify) {
    if (!s) return;
    if (ev === 'kill') {
      const kills = s.flags.killCount || 0;
      if (kills >= 1) unlock('first_blood', notify);
      if (kills >= 10) unlock('slayer10', notify);
      if (kills >= 25) unlock('slayer25', notify);
    }
    if (s.level >= 5) unlock('lv5', notify);
    if (s.level >= 8) unlock('lv8', notify);
    if (s.gold >= 500) unlock('rich', notify);
    if ((s.flags.shopCount || 0) >= 5) unlock('shopper', notify);
    if (s.keys.y + s.keys.r >= 3) unlock('keys3', notify);
    if (s.flags.secret1) unlock('secret1', notify);
    if (s.flags.secret2) unlock('secret2', notify);
    if (s.flags.journal) unlock('journal', notify);
    if (s.flags.bossKilled) unlock('boss', notify);
    if (s.ending === 'true') unlock('end_true', notify);
    if (s.ending === 'plain') unlock('end_plain', notify);
  }

  function reset() {
    unlocked = {};
    persist();
  }

  window.Achievements = { DEFS, isUnlocked, unlock, count, evaluate, reset };
})();
