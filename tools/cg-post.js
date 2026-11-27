// 出图后处理：裁切 / 压暗 / 转 webp
// 用法：node tools/cg-post.js [seed]
//
// 为什么需要这一步（2026-11-26）：
//   ① 尺寸：出图 896×1792（0.5），游戏用 430×900（0.478）——按 DPR=2 出 860×1800，
//      否则在手机上永远只有一半物理像素，这就是用户说的「不高清」；
//   ② 亮度：FLUX 出的暗调图仍比暗色 UI 亮，不压暗的话对话框像贴在别人的截图上面；
//      bd-luma 闸门要求整批 meanL 落在同一带里，这里按场景给系数；
//   ③ 立绘：出图背景不是纯黑（模型会自己加墙面/雾），四周做 alpha 渐隐，
//      叠在面板上才像「站在暗处的人」而不是「一张贴纸」。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'tools', 'art-test');
const OUT_CG = path.join(ROOT, 'assets', 'cg');
const OUT_PT = path.join(ROOT, 'assets', 'portraits');
const SEED = process.argv[2] || '20261126';

// 只处理 cg-gen 里真的声明过的场景键。
// 2026-11-26 踩到两次：art-test 里躺着一张 11-25 的孤儿图（ComfyUI 默认前缀
// `Cinematic_dark_fantasy_game_ba_2026-11-25T02-57-57.png`，尺寸正好过筛），
// 全目录扫描把它当场景处理，assets/cg 里就凭空多出一张谁都不引用的 webp，
// 还把 assetV 指纹带偏了。这里改成白名单：不在 SCENES/PORTRAITS 里的文件名一律跳过。
const { SCENES, PORTRAITS } = require('./cg-gen.js');
// king 只是锚图（序章第二幕从这里派生），游戏里没有「国王」这个对话角色，
// 落盘成 assets/portraits/king.webp 会被闸门的「孤儿资产」咬住 ⇒ 生成但不产出。
const MASTER_ONLY = new Set(['portrait_king']);
const KNOWN = Object.keys(SCENES).map((k) => k)
  .concat(Object.keys(PORTRAITS).map((k) => 'portrait_' + k))
  .filter((k) => !MASTER_ONLY.has(k));

const W = 860;
const H = 1800;

// 每个场景的压暗系数：默认 0.92（FLUX 的暗部本身就压得住，不需要再狠砍），
// 天空/黎明类要更狠——它们自带大面积中间调，会顶到「亮部糊满屏」的红线。
// 实测（第一批 19 张，meanL 为压暗前）：roof 62.7 / dawn 57.9 / intro4 55.2 / core 48.3。
// bd-luma 的带是 20–50，上面几张必须更狠；其余 0.92 就够（FLUX 的暗部本来就压得实）。
// 2026-11-26 重标（FLUX 换掉 SDXL 后实测）：新图本身比 SDXL 暗一大截，
// 原来那套 0.58–0.92 的系数是给 SDXL 的，套到 FLUX 上会把 roof 压到 19、
// dawn 直接压成 9.6（几乎全黑，只剩一道地平线）。现在：
//   · roof 几乎不压（0.95）：塔顶夜空本来就在带的下缘；
//   · dawn 反而要**提亮**（1.30）：黑海占九成，不提就掉出 20 以下；
//   · 其余按各自 raw 值微调，目标都落在 meanL 22–38。
const DIM = {
  dawn: 1.15, roof: 0.95, town: 0.86, ridge: 0.86, window: 0.90,
  intro4: 0.88, intro2: 0.92, intro1: 0.90, intro3: 0.94,
  core: 0.90, corridor: 0.88, gate: 0.90, market: 0.94, namewall: 0.92,
  stairs: 0.90, reddoor: 0.90, ledger: 0.92, forge: 0.94,
};

// 2026-11-26 柔版：出图脚本带 --soft 时文件名是 <key>_soft_<seed>.png，落盘要覆盖同名正式资产，
// 但亮度系数得走柔版那套——柔版整体更亮，沿用暗版系数会顶穿 bd-luma 的上带（20–50）。
// 21:0x 二次校准：regress 的「序章四幕与 20 张背景亮度差 ≤ 6」咬出来了——
// 柔版序章 38.2 vs 背景 31.7（差 6.5，超 0.5）。系数整体再降 0.05，把序章压回 36 上下。
const DIM_SOFT = {
  intro1: 0.75, intro2: 0.73, intro3: 0.75, intro4: 0.77,
  dawn: 0.95, roof: 0.86, town: 0.80, ridge: 0.80, window: 0.84,
  core: 0.84, corridor: 0.82, gate: 0.84, market: 0.86, namewall: 0.84,
  stairs: 0.84, reddoor: 0.84, ledger: 0.86, forge: 0.86, bell: 0.84,
};

const py = String.raw`
import sys, os, json
from PIL import Image, ImageFilter
ImSize = Image
import numpy as np

src, out_cg, out_pt, seed = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
W, H = int(sys.argv[5]), int(sys.argv[6])
dim_json = sys.argv[7]
DIM = json.loads(dim_json)
DIM_SOFT = json.loads(sys.argv[8]) if len(sys.argv) > 8 else {}
KNOWN = set(json.loads(sys.argv[9])) if len(sys.argv) > 9 else None

os.makedirs(out_cg, exist_ok=True)
os.makedirs(out_pt, exist_ok=True)
report = []

def fit_crop(im, tw, th):
    w, h = im.size
    scale = max(tw / w, th / h)
    im2 = im.resize((max(tw, int(round(w * scale))), max(th, int(round(h * scale)))), Image.LANCZOS)
    w2, h2 = im2.size
    x0 = (w2 - tw) // 2
    # 垂直方向偏上取景：下部留给对话框
    y0 = int(round((h2 - th) * 0.36))
    return im2.crop((x0, y0, x0 + tw, y0 + th))

def mean_l(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    # 感知亮度（Rec.709），和 bd-luma 的口径一致
    return float((a[:,:,0]*0.2126 + a[:,:,1]*0.7152 + a[:,:,2]*0.0722).mean())

# 同一场景可能有多份（换 seed / 换模型重出）。**按修改时间取最新**，不按文件名——
# 2026-11-26 踩到：dawn_20261128 是 11-25 用 SDXL 出的旧图，按名字排序会把新的 FLUX 版覆盖掉。
# 只认「这一代」的图：场景 896×1792、立绘 768×960。旧 SDXL 那批是 832×1216，
# 尺寸不同 ⇒ 直接排除。不这么筛的话，某个 key 今天没重出，就会静默沿用旧图
#（2026-11-26 实际踩到：roof/dawn/intro1-4 六张还是昨天的 SDXL 版，肉眼看不出来，
#  因为文件名一样、都被裁成 860×1800）。
cands = {}
for fn in os.listdir(src):
    if not fn.endswith('.png'):
        continue
    key = fn[:-4]
    if '_' in key:
        key = key.rsplit('_', 1)[0]     # 去掉 _<seed>
    # 柔版样张 <key>_soft 与暗版 <key> 共用同一个产物名，按 mtime 自然挑最新（谁最后跑用谁）
    soft = key.endswith('_soft')
    if soft:
        key = key[:-5]
    # 画风档位样张 <key>_<art> 同理：剥掉档位后缀当正式 key 用，
    # 否则会被下面的白名单当成「未声明的场景」直接跳过（2026-11-26 实测踩到）。
    for suf in ('_hanban', '_cg3d', '_semiM', '_semi', '_real'):
        if key.endswith(suf):
            key = key[:-len(suf)]
            break
    if KNOWN is not None and key not in KNOWN:
        continue       # 不在 cg-gen 声明里的图（默认前缀的孤儿图）一律不进资产目录
    p = os.path.join(src, fn)
    try:
        w, h = ImSize.open(p).size
    except Exception:
        continue
    ok_size = (w >= 896 and h >= 1500) or (w == 768 and h == 960)
    if not ok_size:
        continue
    # soft 必须随候选一起存。原先它是循环变量，等真正处理时早被遍历的最后一个文件覆盖了——
    # 结果柔版一律按暗版系数压暗（2026-11-26 实测：intro1 算出来 35.8，本该是 40.3×0.75=30.2）。
    if key not in cands or os.path.getmtime(p) > os.path.getmtime(cands[key][0]):
        cands[key] = (p, soft)

for key, (p, soft) in sorted(cands.items()):
    im = Image.open(p).convert('RGB')

    if key.startswith('portrait_'):
        who = key[len('portrait_'):]
        im2 = fit_crop(im, 768, 960)
        a = np.asarray(im2).astype(np.float32)
        # 边缘 alpha 渐隐：左右各 9%、上 6%、下 12%（人物基本在中间，吃不到）
        hh, ww = a.shape[:2]
        yy, xx = np.mgrid[0:hh, 0:ww]
        m = np.ones((hh, ww), dtype=np.float32)
        mx = int(ww * 0.09); my_t = int(hh * 0.06); my_b = int(hh * 0.12)
        ramp = lambda d, n: np.clip(d / max(1, n), 0, 1)
        m = np.minimum(m, ramp(xx, mx))
        m = np.minimum(m, ramp(ww - 1 - xx, mx))
        m = np.minimum(m, ramp(yy, my_t))
        m = np.minimum(m, ramp(hh - 1 - yy, my_b))
        alpha = (np.clip(m, 0, 1) ** 1.4 * 255).astype(np.uint8)
        rgba = np.dstack([np.asarray(im2).astype(np.uint8), alpha])
        dst = os.path.join(out_pt, who + '.webp')
        Image.fromarray(rgba, 'RGBA').save(dst, 'WEBP', quality=90, method=6)
        report.append((who, 'pt', 0, os.path.getsize(dst) // 1024))
        continue

    im2 = fit_crop(im, W, H)
    before = mean_l(im2)
    k = (DIM_SOFT.get(key, 0.84) if soft else DIM.get(key, 0.92))
    a = np.clip(np.asarray(im2).astype(np.float32) * k, 0, 255)
    a = np.where(a < 6, 0, a)      # 死黑，避免 webp 把暗部糊成灰雾
    out = Image.fromarray(a.astype(np.uint8))
    dst = os.path.join(out_cg, key + '.webp')
    out.save(dst, 'WEBP', quality=88, method=6)
    report.append((key, 'cg', round(before, 1), os.path.getsize(dst) // 1024))

tot = sum(r[3] for r in report)
for r in report:
    print('%-14s %-3s meanL=%-6s %5d KB' % (r[0], r[1], r[2], r[3]))
print('---', len(report), 'files', tot, 'KB total')
`;

const tmp = path.join(ROOT, 'tools', '_cg_post.py');
fs.writeFileSync(tmp, py.replace(/^\n/, ''), 'utf8');
try {
  const out = execFileSync('python', [tmp, SRC, OUT_CG, OUT_PT, SEED, String(W), String(H), JSON.stringify(DIM), JSON.stringify(DIM_SOFT), JSON.stringify(KNOWN)], {
    encoding: 'utf8',
  });
  process.stdout.write(out);
} finally {
  try { fs.unlinkSync(tmp); } catch (e) { /* keep */ }
}
