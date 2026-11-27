// 生成 assets/cg/manifest.json（风格复现基线）
// 用法：node tools/cg-manifest.js
//
// 为什么要有这个脚本（2026-11-27 加练 美术 焦点D）：
//   manifest.json 是手写的，于是它停在 SDXL 那一版——18 条、`model: sd_xl_base_1.0`、`generatedAt: 2026-11-25`，
//   而盘上 24 张 CG 全是 FLUX 860×1800（11-27 11:21）。风格圣经 §10.2 写着「资产参数留痕见 manifest.json」，
//   于是唯一的复现基线指向一个已经不用了的模型，新加的 6 个场景（town/forge/window/stairs/reddoor/ledger）
//   连条目都没有。手写留痕必漂，所以改成从**出图脚本本身**派生：
//     · 参数（模型 / 编码器 / VAE / 步数 / CFG / 尺寸）读 tools/cg-gen.js 的导出常量；
//     · 每张的提示词读 cg-gen.js 的 SCENES / PORTRAITS（这是它唯一的真源）；
//     · 尺寸 / 字节 / 短哈希读盘上的文件。
//   盘上有的场景缺提示词 = 报错退出（不写半份 manifest）。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const g = require('./cg-gen.js');
const { SCENES, PORTRAITS } = g;

const ROOT = path.join(__dirname, '..');
const CG_DIR = path.join(ROOT, 'assets', 'cg');
const PT_DIR = path.join(ROOT, 'assets', 'portraits');
const OUT = path.join(CG_DIR, 'manifest.json');

const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 10);
const info = (p) => {
  const b = fs.statSync(p);
  const img = fs.readFileSync(p);
  // webp 头：VP8X/VP8L/VP8 里取宽高（不引第三方依赖）
  let w = 0, h = 0;
  const tag = img.slice(12, 16).toString('ascii');
  if (tag === 'VP8X') { w = 1 + img.readUIntLE(24, 3); h = 1 + img.readUIntLE(27, 3); }
  else if (tag === 'VP8L') {
    const b0 = img[21] | (img[22] << 8) | (img[23] << 16) | (img[24] << 24);
    w = (b0 & 0x3fff) + 1; h = ((b0 >> 14) & 0x3fff) + 1;
  } else if (tag === 'VP8 ') { w = img.readUInt16LE(26) & 0x3fff; h = img.readUInt16LE(28) & 0x3fff; }
  return { size: w + 'x' + h, bytes: b.size, sha1: sha(p), mtime: b.mtime.toISOString().slice(0, 10) };
};

const scenes = fs.readdirSync(CG_DIR).filter((f) => /\.webp$/.test(f)).map((f) => f.replace(/\.webp$/, '')).sort();
const pts = fs.readdirSync(PT_DIR).filter((f) => /\.webp$/.test(f)).map((f) => f.replace(/\.webp$/, '')).sort();

const noPrompt = scenes.filter((k) => !SCENES[k]);
if (noPrompt.length) {
  console.error('✗ 这些 CG 在盘上但没有提示词（cg-gen.js SCENES 缺键）：' + noPrompt.join(', '));
  process.exit(1);
}
const noPtPrompt = pts.filter((k) => !PORTRAITS[k]);
if (noPtPrompt.length) {
  console.error('✗ 这些立绘在盘上但没有提示词（cg-gen.js PORTRAITS 缺键）：' + noPtPrompt.join(', '));
  process.exit(1);
}

const latest = [...scenes.map((k) => path.join(CG_DIR, k + '.webp')), ...pts.map((k) => path.join(PT_DIR, k + '.webp'))]
  .map((p) => fs.statSync(p).mtime).sort((a, b) => b - a)[0];

const manifest = {
  generatedAt: latest.toISOString().slice(0, 10),
  generatedBy: 'node tools/cg-manifest.js（本文件为派生文件，勿手改；改提示词/参数请改 tools/cg-gen.js 后重跑）',
  pipeline: 'local ComfyUI 0.42.0 @ 127.0.0.1:8188 (D:/personal-video-pipline/pipeline, venv-comfy, RTX 5090 D)',
  model: g.UNET,
  textEncoder: g.TEXT_ENC,
  vae: g.VAE,
  params: {
    width: g.SCENE_W, height: g.SCENE_H, steps: g.STEPS, cfg: g.CFG,
    sampler: 'euler', scheduler: 'Flux2Scheduler(28)',
    portraitWidth: 768, portraitHeight: 960,
    seed: '20261126 起，逐张见 cg-gen.js 调用参数',
  },
  post: 'tools/cg-post.js：按场景 DIM 系数压暗/提亮 → 居中裁 860×1800 → webp q88 method=6；立绘 768×960 + 四周 alpha 渐隐',
  style: g.STYLE,
  negative: g.NEG,
  portraitStyle: g.PORTRAIT_STYLE,
  note: '每张的 prompt 只是主体句；完整提示词 = style + 主体句（人物场景另有 STYLE_FIG / 柔版，见 cg-gen.js）',
  images: scenes.map((k) => ({ file: 'assets/cg/' + k + '.webp', scene: k, prompt: SCENES[k].replace(/\s+/g, ' ').trim(), ...info(path.join(CG_DIR, k + '.webp')) })),
  portraits: pts.map((k) => ({ file: 'assets/portraits/' + k + '.webp', id: k, prompt: PORTRAITS[k].replace(/\s+/g, ' ').trim(), ...info(path.join(PT_DIR, k + '.webp')) })),
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ manifest: ${scenes.length} 张 CG + ${pts.length} 张立绘，generatedAt ${manifest.generatedAt}`);
