# TowerMates · 魔塔原型 v0.1

一个可直接在浏览器里玩的魔塔（固定数值 RPG）原型。纯前端、零依赖、数据驱动，后续可以整体搬进微信小游戏容器。

## 运行

直接双击 `index.html` 即可（`file://` 也能跑）。
或者起个静态服务：

```bash
python -m http.server 8777
# 打开 http://127.0.0.1:8777/index.html
```

操作：`↑↓←→` / `WASD` 移动，点相邻格子也能走；撞到怪物弹出战斗预览，`Enter` 确认、`Esc` 取消。

## 目录

```
index.html        页面与各种弹层
css/style.css     样式（暗色塔内风格，手机竖屏优先）
js/data.js        ★ 全部数值与地图都在这里
js/engine.js      核心规则（无 DOM 依赖，可在 Node 里跑测试）
js/render.js      Canvas 渲染
js/main.js        输入、UI、存档
tools/check.js    地图校验（尺寸/元素/连通性）
tools/sim.js      贪心模拟通关，检查数值是否可通
tools/engine-test.js  规则单元测试
tools/test.html   无头浏览器自动开局截图用
```

## 核心规则

- 战斗先手：`回合数 = ceil(怪物HP / (我方攻击 - 怪物防御))`，我方承伤 `= (回合数 - 1) × max(0, 怪物攻击 - 我方防御)`。
- `我方攻击 <= 怪物防御` 时无法破防，战斗按钮禁用。
- 升级：`攻/防 +3，生命 +150`，经验阈值见 `data.js` 的 `levelExp`。
- 只有 `生命 > 预计承伤` 才允许开战，避免误点送死。

## 改地图

`data.js` 里每个楼层是 11×11 字符串数组，图例：

```
# 墙   . 地面   @ 起点
u 上楼  n 下楼
y/b/r  黄/蓝/红门        k/K/L 黄/蓝/红钥匙
A 蝙蝠  B 史莱姆  C 骷髅兵  D 僵尸  E 石像鬼  F 狼人  Z 魔王
p 红药水  P 蓝药水  s 铁剑  d 铁盾  m 力量宝石  $ 金币  M 商人  T 公主
```

改完跑一遍校验：

```bash
node tools/check.js      # 地图尺寸/连通性
node tools/sim.js        # 贪心模拟能否通关、承伤是否合理
node tools/engine-test.js
```

## 下一步可加的东西

- 商店扩展（钥匙/属性/技能）
- 装备与技能、异常状态
- 多结局 / 隐藏层
- 好友排行、造塔分享（TowerMates 的社交方向）
