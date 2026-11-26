# 输入收口清单（C 批迁移前置，2026-11-26 15:5x 自动轮）

> 用途：方案第 4 节给 C 批（纯 DOM 重）定的第一笔活是「先做输入收口，再做渲染」。
> 本轮只盘点、不改代码（迁移期冻结玩法/数值/美术；且 `js/*` 正被并行会话改）。
> 基线：`main.js` 108 条 `addEventListener`、`index.html` 零 inline `onclick`（实测 grep 无命中）。

## 一、现状分布

| 类别 | 数量 | 绑在什么节点 | 迁移成本 |
|---|---|---|---|
| 棋盘触控（`js/touch.js`） | 7（pointerdown/move/up/cancel/leave + click + DOMContentLoaded） | **单个 `canvas`** | **低**——已经是目标形态：单点委托 + 命中坐标自己算，wxadapter 只需把 touch 桥成同一套坐标 |
| 一次性 UI 接线（`bindInput()`） | 52 条 click | `index.html` 里的静态节点 | 中——需「节点 → 命中矩形」一张表 |
| 面板内重绑（15 个 render/open 函数） | ~30 条 click | 每次 `innerHTML` 新建出来的节点 | **高**——`main.js` 66 处 `innerHTML`，渲染即重建节点 |
| 懒绑徽记（`_tipBound` 守卫） | 4（🧭 / 🗡️ / 🎯 / 💀） | 4 个静态 pip 节点 | 低——已是一次绑定，`_tipBound` 防重复（**已核：不是监听器叠加 bug**） |
| 全局通道 | 12（keydown×2 / resize×2 / visibilitychange×2 / pointer 系×4 / storage / pagehide / beforeunload / error / unhandledrejection / contextmenu） | `document` / `window` | 低——wxadapter 有对应生命周期钩子 |
| `el.onclick =` 赋值 | 15 | 动态节点 | 低（与 addEventListener 同路径可一次性换掉） |
| 键盘 | `keydown` 1 处统一入口（`main.js:4151`）+ 粘贴框 1 处 | window | 不迁移——小游戏无键盘，**已有等价点击入口**（点格子 / 点按钮 / 右下角 ▲ 方向键），整组降级即可 |

`hover` / `active` 面：`style.css` 有 37 处 `:hover`、30 处 `:active`。手机 H5 现在已经能玩（`touch.js` 对 `pointerType === 'mouse'` 直接 return），说明 hover 只是装饰、不承载信息 → **迁移不阻塞**，但 `:active` 那 30 处是「按下去的反馈」，canvas 侧要显式保留（否则手机上点哪儿都没反应感）。

## 二、改造顺序（C 批起跑后按此走）

1. **先做表**：把 52 个静态 click 节点 + 30 个面板内 click 节点列成「选择器 → 命中矩形 → 动作 id」。这是唯一必须手写的活，其余都能机械替换。
2. **面板内改委托**：`innerHTML` 字符串里给每个可点项加 `data-act="…"`，整屏只留一个 click 委托，按 `data-act` 分发。这样 66 处 `innerHTML` 里的可点项**不需要逐个 bind**，命中区随渲染自然生成。
3. **保留 `touch.js` 不动**（它已经是目标形态），只把 `pointerdown/up` 换成 wxadapter 的 touch 回调。
4. **键盘整组降级**，不桥接；`pasteCode`（挑战码粘贴）在小游戏侧改「从剪贴板读」或直接去掉输入框（挑战码仍可从分享卡片落地）。
5. **`_tipBound` 那 4 个徽记**：迁移时并入第 2 步的委托表，别保留 DOM 节点级布尔标记（canvas 侧没有「节点」这个容器）。

## 三、风险与待实测

- **`innerHTML` 是最大不确定项**：C 批若走 wxadapter 的 DOM shim，`innerHTML` 的解析/布局是否可用必须**先实测一次再排期**（66 处都在 `main.js`，改造成本与 shim 能力成正比）。这是本轮唯一「没量过」的结论，写明在此，别当已知。
- **面板内重绑带来的隐性成本**：DOM 侧靠「节点被替换 → 旧监听器随之消失」，canvas 侧没有这个免费清理，委托表必须自己管生命周期（`has-cg` 那类「状态挂在容器上」的做法要一并想清楚）。
