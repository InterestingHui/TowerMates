# CG 后处理：ComfyUI 原图 → 上屏那张 webp
# ---------------------------------------------------------------------------
# 2026-11-25 焦点D 补的缺口：11-25 那批 18 张 CG 的「裁切 + 压暗 + 转 webp」这一步
# 只写在日志里，仓库里没有脚本 ⇒ bible §9.2 写「`node tools/cg-gen.js all` 可复现」其实是半句，
# 重跑只能拿到 832×1216 的 PNG，落到 assets/cg/ 的那一步无迹可寻。
# 现在这一步唯一实现就是本文件：
#     python tools/cg-post.py <scene> <src.png> [factor]
#     factor 缺省 0.86；天空类（roof/dawn/intro4）用 0.78
# 顺序不可换：先居中裁 430×900 再压暗——先压暗再缩会在缩放时被重采样拉回来。
import sys, os, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 430, 900
SKY = {'roof', 'dawn', 'intro4'}     # 天空占比高的整批压得更狠（见 bible §9.2）


def luma(im):
    g = im.convert('L')
    px = list(g.getdata())
    return sum(px) / len(px), sum(1 for v in px if v >= 90) / len(px) * 100


def main():
    if len(sys.argv) < 3:
        print('usage: python tools/cg-post.py <scene> <src.png> [factor] [--tight=<cropH>]')
        return 2
    key, src = sys.argv[1], sys.argv[2]
    args = [a for a in sys.argv[3:] if not a.startswith('--')]
    factor = float(args[0]) if args else (0.78 if key in SKY else 0.86)
    tight = None
    for a in sys.argv[3:]:
        if a.startswith('--tight='):
            tight = int(a.split('=')[1])
    im = Image.open(src).convert('RGB')
    sw, sh = im.size
    box_h = min(tight, sh) if tight else sh          # 收窄取景：把多余的下缘裁掉（对白框下的亮斑别占焦点）
    cw = round(box_h * W / H)
    if cw > sw:
        cw = sw
        box_h = round(cw * H / W)
    im = im.crop(((sw - cw) // 2, 0, (sw - cw) // 2 + cw, box_h))
    im = im.resize((W, H), Image.LANCZOS)
    im = im.point(lambda v: int(v * factor))
    dest = os.path.join(ROOT, 'assets', 'cg', key + '.webp')
    im.save(dest, 'WEBP', quality=82, method=6)
    meanL, lit = luma(im)
    print(f'✓ {key} → assets/cg/{key}.webp  {sw}x{sh} → {W}x{H}  x{factor}  '
          f'meanL {meanL:.1f}  lit {lit:.2f}%  {os.path.getsize(dest) // 1024}KB')
    # 闸门要的是 20–50 / lit ≤16；这里先自报，越界就别等 regress 了
    if not (20 <= meanL <= 50):
        print(f'✗ meanL {meanL:.1f} 出带（20–50）：换 factor 重跑')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
