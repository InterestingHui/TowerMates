# 魔塔美术管线 · 默认生图方式

> 2026-11-27 用户拍板：「记忆一下这种生图方式，魔塔都用这种方式」。
> **本项目所有角色图、剧情 CG、场景图，默认走本文档的配方**，除非用户当轮另行指定。
> 换画风不是换工具，是换 `--art=` 档位；换角色不是重新抽卡，是换锚图。

---

## 一、默认画风：日系二次元（`--art=anime`）

| 项 | 值 |
|---|---|
| 底模 | `flux-2-klein-9b-Q4_K_M.gguf`（FLUX.2 Klein 9B GGUF） |
| 文本编码器 | `qwen_3_8b_fp8mixed.safetensors`，`CLIPLoader type=flux2` |
| VAE | `flux2-vae.safetensors` |
| **LoRA** | **`klein9b_anime_v3_refined.safetensors`，强度 `0.9`**（关键，画风全靠它） |
| 采样 | `Flux2Scheduler` / 28 步 / `euler` / **CFG 3.0** |
| 立绘尺寸 | 768×960 |
| 场景尺寸 | 896×1792 |

**为什么用这套**：写实档每次都在跟「平均脸」对抗（AI 的「真实」= 路人脸），要堆五官、还要压显老显幼，反复六七轮才勉强能看。
二次元的「美型」本身就是 LoRA 训练数据里的强先验，不需要补结构；毛孔、次表面散射这些写实档最容易翻车的环节在平涂里根本不存在。

**命令**
```bash
# 立绘
node tools/cg-gen.js portrait:vera 20261210 --art=anime --lora=klein9b_anime_v3_refined.safetensors:0.9
# 场景（空镜）
node tools/cg-gen.js corridor 20261210 --art=anime --lora=klein9b_anime_v3_refined.safetensors:0.9
```

---

## 二、人物一致性：锚图 → 编辑派生

### 铁律

**同一个角色的所有图，必须来自同一张锚图。禁止为了「换构图」重新抽卡。**

抽卡（txt2img）的 seed 只锁噪声、锁不住脸——这是 2026-11-27 之前所有「人物不一致」的唯一根因。

### 锚图库

`tools/masters/<角色>.png`，随仓库走（丢了就复现不出同一张脸，别删）。

| 角色 | 锚图 | 说明 |
|---|---|---|
| vera | `vera_anime.png` | 二次元定妆版（2026-11-27 用户验收） |
| hero / mowang / candle / yanmo / yan / duo / heng / cheng | `<角色>.png` | 写实档时期生成，**待按 anime 重出** |
| king | `king.png` | 只作锚图，不进游戏资产（`cg-post` 的 `MASTER_ONLY`） |

### 派生链路

```bash
node tools/cg-edit.js tools/masters/vera_anime.png intro1_anime \
  "same anime illustration style with clean cel shading and lineart, <新场景/新服装描述>, keep the exact same face and hairstyle" \
  20261220 0.90 896 1792
```

| 参数 | 含义 | 实测结论 |
|---|---|---|
| `denoise 0.55` | 轻微重绘 | **指令不执行**（衣服都不换），别用 |
| `denoise 0.90` | 换装 + 换背景 | 保脸，指令执行到位 |
| `denoise 0.95` | 加人物做双人场景 | 保脸，能加第二个人 |

**Qwen-Image-Edit 2.1 Turbo**：`steps 8 / cfg 1.0 / euler / simple`，**7–18 秒一张**，比 txt2img 快。
关键：**它保得住二次元画风**（2026-11-27 实测，prompt 里写 `same anime illustration style, clean cel shading, lineart`）。

---

## 三、踩过的坑（都别再踩）

### 提示词

1. **`solo, only one person in frame`** 必须写进正向，并把 `two people / another person / background person` 写进负向。漏了就会凭空多一个「同伴」。
2. **性别要写死**：`craftsman` / `scholar` / `merchant` 不带性别，在 beauty 语法下会画成女人（yanmo 出成亚洲老妇）。全部写 `male` + `his`。
3. **白丝**必须 `thigh-high stockings with a visible band of bare thigh above them`，光写「白丝」一律画成连裤袜；且**裙长必须卡 `mid-thigh`**，否则袜口被盖住等于白写。
4. **手帕**这类小道具写 `in one hand` 会画成两只手各一块，改成 `knotted around her left wrist`。
5. **「提起」不是「环抱」**：写 `lifts her by her upper arm` 会画成从背后拥抱，必须补 `grips from the side, his arm extended away from her body, not an embrace`。
6. **暖光写 `warm golden candlelight`**，只写 `warm ember` 会落到 21°（黄铜族要求 26–50°），整张偏红。
7. **画风档位互相打架**：anime 档要主动堵 `photorealistic / photograph / 3D render / oil paint / skin pores`；写实档要堵 `anime / cartoon / cel shading`。

### 工具

8. `cg-post.js` 只认 `SCENES` / `PORTRAITS` 里声明过的 key（白名单）。art-test 里的孤儿图（ComfyUI 默认前缀那种）不会被误写进资产。
9. `cg-post.js` 的亮度系数分两张表：`DIM`（暗版）/ `DIM_SOFT`（柔版）。**`soft` 标志必须跟候选一起存**（`cands[key] = (p, soft)`），写成循环变量会被最后一个文件覆盖。
10. **立绘有独立缓存指纹 `PT_V`**（`js/portraits.js`），由 `sync-publish.js` 按目录内容注入。换图不跑 sync ⇒ 老玩家永远看旧图。

---

## 四、发布前闸门

```bash
node tools/check.js        # 地图 / 叙事可达性 / 微信工程
node tools/code-test.js    # 单测
node tools/regress.js      # 59 图 / backdrop-luma / 可读性 / 触控 / 弹层
node tools/live-check.js   # 线上 build 一致性 + 无脚本错误
```

`regress` 的 `backdrop-luma` 会咬两件事：**序章四幕与 20 张背景亮度差 ≤ 6**、**暖光色相 26–50°**。改图后必须重跑 `sync-publish`，否则「资产指纹与现内容不一致」也会红。

---

## 五、其它可用但当前不用的资源

| 资源 | 状态 |
|---|---|
| `flux3-image-klein-int8-convrot.safetensors` | FLUX.3，比 FLUX.2 新一代，**未接入**（换底模要重校全部参数） |
| `qwen_image_2.1_turbo` + `qwen3vl_8b` + `qwen_image_2.1_vae` | 编辑链路，已用（`cg-edit.js`） |
| `moodyProMix_zitV12DPO` / `sd_xl_base_1.0` | SDXL 老架构，备用 |
| `fasth3_omniref_qad_nvfp4` | 未验证 |
| `TrainLoraNode` + `MakeTrainingDataset` | 本地可训 LoRA，一致性终极方案（当前未用） |
| `SeedVR2` 系列 | 放大 / 修复，可用于 CG 提清晰度 |
| `hanban` / `cg3d` / `real` / `semi` / `semiM` | 其它画风档位，保留备用 |
