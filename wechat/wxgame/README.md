# TowerMates 微信小游戏（A 路线骨架 · **已降级为备案期预备，当前主线是 B**）

> **2026-11-17 校准轮改口径**：本目录在 2026-11-16 已被自主拍板为「A 路线降级为预备」——
> 路线 B（小程序 web-view 嵌现有 H5，见 `../miniprogram/`）优先，因为它是唯一低成本拿到真人数据
> 的路；A 要在留存未验证前投 18–28 人日。**本文件早先写的「3–5 天」是没量过的估数，已作废。**
> 权威判断见 `docs/wechat-port-plan.md` §七 与 `PROGRESS.md` 待办「微信版：路线已定 B」。

## 现在能跑的

- `game.json`：竖屏、隐藏状态栏、声明 `openDataContext: "openDataContext"`（好友榜子域）
- `game.js`：建主画布 + 画占位页 + 拉一次子域通道（验证结构通）
- `openDataContext/index.js`：**完整可用**的好友榜绘制（读托管数据 → 排序 → 画榜）

## 现在不能跑的（这是重点）

**游戏本体跑不起来。** 现有 H5 的 UI 层（HUD / 面板 / 对白 / 商店 / 结算 / 提示）
全是 DOM 节点 + CSS 动画，小游戏没有 `document`。只有 `js/render.js` 那套画布绘制能直接复用。

## 真开工 A 路线要做的四件事（成本已量，不再是「3–5 天」）

1. **UI 改 canvas 自绘**（大头，**≈18–28 人日**）：21 个 overlay 屏（16 普通面板 + 5 特殊层）
   + 主界面 + HUD，每屏 0.7–1.2 人日 + 通用控件层 3–4 人日 + 联调 2 人日。
   实测依据：`main.js` 里真碰 DOM 的只有 11.3%（565/5001 行、82/171 个函数），
   `engine / story / data / achievements / daily / challenge / ads / devgate / portraits`
   **全部零 DOM**，`render.js` 本身就是 canvas——所以不是从零写，是把已有 canvas 能力扩到 UI 层。
2. **切分交互层与绘制层**：**已完成大半**（`js/view.js` 纯函数层，2026-11-16 起切了七刀——
   榜单 / 商店 / 结算判定 / 战斗面板读数 / 结算标签 / 路遇祭坛回响 / 图鉴）。剩下的是 DOM 事件
   到 `wx.onTouchStart` 的坐标命中抽象，属第 1 步的一部分。
3. **音频**：`AudioContext` → `wx.createInnerAudioContext`（`main.js` 的 Sound 模块要重写一遍）。
4. **存档**：`localStorage` → `wx.setStorageSync`（`Meta` / `Engine.save` 两处入口）。

## 两条路线的取舍（见 ../../docs/wechat-port-plan.md）

- **B 小程序 web-view（`../miniprogram/`，当前主线）**：外壳已备好，只差 AppID + 一个已备案域名；
  拿不到关系链，社交退回挑战码（`js/challenge.js` 已写完）。
- A 小游戏（本目录）：能用开放数据域好友榜，但 UI 要重写 **18–28 人日**，
  且留存未验证前不该投——关系链红利只在有玩家时兑现。

**结论：不要在没有真人留存数据的前提下开工 A。**
