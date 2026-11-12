# TowerMates 微信小游戏（A 路线骨架）

## 现在能跑的

- `game.json`：竖屏、隐藏状态栏、声明 `openDataContext: "openDataContext"`（好友榜子域）
- `game.js`：建主画布 + 画占位页 + 拉一次子域通道（验证结构通）
- `openDataContext/index.js`：**完整可用**的好友榜绘制（读托管数据 → 排序 → 画榜）

## 现在不能跑的（这是重点）

**游戏本体跑不起来。** 现有 H5 的 UI 层（HUD / 面板 / 对白 / 商店 / 结算 / 提示）
全是 DOM 节点 + CSS 动画，小游戏没有 `document`。只有 `js/render.js` 那套画布绘制能直接复用。

## 走完 A 路线要做的四件事

1. **UI 改 canvas 自绘**（大头，3–5 天）：HUD 顶栏、各种面板、对白框、结算页，
   一套「矩形 + 文本 + 圆角 + 缓动」的小工具箱，然后把 main.js 里的 DOM 操作逐个替换。
2. **切分交互层与绘制层**：现在交互挂在 DOM 事件上（click/pointerdown），
   小游戏只有 `wx.onTouchStart` 这一条通路，需要一个坐标命中的抽象。
3. **音频**：`AudioContext` → `wx.createInnerAudioContext`（`main.js` 的 Sound 模块要重写一遍）。
4. **存档**：`localStorage` → `wx.setStorageSync`（`Meta` / `Engine.save` 两处入口）。

## 两条路线的取舍（见 ../docs/wechat-port-plan.md）

- A 小游戏（本目录）：能用开放数据域好友榜，但 UI 要重写，3–5 天。
- B 小程序 web-view（../miniprogram/）：近乎零改造，但要自有备案域名，且拿不到关系链。

没量之前别投 A——关系链红利只在有玩家时兑现。
