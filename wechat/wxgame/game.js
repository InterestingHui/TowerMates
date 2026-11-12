// TowerMates · 微信小游戏主域入口（骨架）
//
// 现状：**这里是空的**。不是偷懒——现有 H5 的 UI 层（HUD/面板/对白/商店/结算）
// 全部是 DOM 节点，小游戏环境没有 document，一行都跑不起来。能直接复用的只有
// js/render.js 那套 canvas 绘制。
//
// 所以这个入口目前只做一件事：证明工程结构对（能起 canvas、能拉起子域），
// 并把「下一步要写什么」写在屏幕上，避免有人以为它已经能玩。
//
// 要走 A 路线，依次需要：
//   1. 把 index.html 里的 HUD/面板改成 canvas 自绘（这是 3–5 天的大头）
//   2. 把 main.js 的交互层与 render.js 的绘制层再切一刀（现在耦合在 DOM 事件上）
//   3. 用 wx.createCanvas 建主画布，用 wx.getOpenDataContext() 拉起子域好友榜
//   4. 音频换 wx.createInnerAudioContext，存档换 wx.setStorageSync
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

function paint() {
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8c46a';
  ctx.font = '700 26px sans-serif';
  ctx.fillText('TowerMates', W / 2, H * 0.42);
  ctx.fillStyle = '#8b93a5';
  ctx.font = '13px sans-serif';
  ctx.fillText('微信版施工中', W / 2, H * 0.42 + 34);
  ctx.fillStyle = '#5d6577';
  ctx.font = '11px sans-serif';
  ctx.fillText('UI 层待从 DOM 改为 canvas 自绘', W / 2, H * 0.42 + 66);
  ctx.fillText('工程结构与开放数据域已就绪', W / 2, H * 0.42 + 86);
}
paint();

// 子域已声明在 game.json 的 openDataContext；这里先拉一次，验证通道通
try {
  const odc = wx.getOpenDataContext();
  if (odc && odc.postMessage) odc.postMessage({ type: 'tm_rank', at: Date.now() });
} catch (e) { /* 通道没通不影响占位画面 */ }
