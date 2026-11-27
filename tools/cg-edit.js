// 编辑式出图：拿一张「锚图」当身份基准，用 Qwen-Image-Edit 改服装/场景/构图，保住同一张脸。
// 为什么需要它（2026-11-27 用户：「为什么人物角色不一致，要做好人物一致性」）：
//   cg-gen.js 走的是纯 txt2img —— seed 只能锁噪声，锁不住脸；同一个角色每次抽卡都是新人。
//   本机管线里现成有 qwen_image_2.1_turbo + qwen3vl 编码器 + 专用 VAE，就是干这个的，一直没用上。
//
// 用法：
//   node tools/cg-edit.js <参考图绝对路径> <输出名> "<改动指令>" [seed] [denoise] [w] [h]
// 例：
//   node tools/cg-edit.js tools/art-test/portrait_vera_semi_20261162.png vera_intro1 \
//     "把她放进黑塔王座厅，双手被魔王攥住小臂提起，双脚离地" 20261200 0.85 896 1792
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 8188;
const INPUT_DIR = 'D:/personal-video-pipline/pipeline/ComfyUI/input';
const OUT = path.join(__dirname, 'art-test');

// Qwen-Image-Edit 2.1 Turbo：turbo 版步数少、cfg 低（1.0），不能用 FLUX 那套 28 步 / CFG 5
const UNET = 'qwen_image_2.1_turbo_int8_convrot.safetensors';
const CLIP = 'qwen3vl_8b_int8_convrot.safetensors';
const VAE = 'qwen_image_2.1_vae_bf16.safetensors';

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: HOST, port: PORT, path: '/prompt', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(out.slice(0, 400))); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function getJson(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: HOST, port: PORT, path: p }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(out.slice(0, 200))); } });
    }).on('error', reject);
  });
}

function download(filename, subfolder, dest) {
  return new Promise((resolve, reject) => {
    const q = `/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder || '')}&type=output`;
    http.get({ host: HOST, port: PORT, path: q }, (res) => {
      if (res.statusCode !== 200) { reject(new Error('view ' + res.statusCode)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { fs.writeFileSync(dest, Buffer.concat(chunks)); resolve(dest); });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildEdit({ prompt, neg, refName, w, h, seed, denoise, steps, cfg }) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: UNET, weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: CLIP, type: 'qwen_image' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    4: { class_type: 'LoadImage', inputs: { image: refName } },
    // 参考图既进条件（保身份）也进 latent（保构图/色调），denoise 控制「改多少」
    5: { class_type: 'TextEncodeQwenImageEdit', inputs: { clip: ['2', 0], prompt, vae: ['3', 0], image: ['4', 0] } },
    6: { class_type: 'TextEncodeQwenImageEdit', inputs: { clip: ['2', 0], prompt: neg, vae: ['3', 0], image: ['4', 0] } },
    7: {
      class_type: 'ImageScale',
      inputs: { image: ['4', 0], upscale_method: 'lanczos', width: w, height: h, crop: 'center' },
    },
    8: { class_type: 'VAEEncode', inputs: { pixels: ['7', 0], vae: ['3', 0] } },
    9: {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['8', 0],
        seed, steps, cfg, sampler_name: 'euler', scheduler: 'simple', denoise,
      },
    },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
    11: { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: 'tm_edit' } },
  };
}

async function run(wf, key, seed) {
  const r = await post({ prompt: wf, client_id: 'towermates-edit' });
  if (!r.prompt_id) throw new Error(JSON.stringify(r).slice(0, 500));
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const h = await getJson('/history/' + r.prompt_id);
    const item = h[r.prompt_id];
    if (!item) continue;
    if (item.status && item.status.status_str === 'error') {
      throw new Error('comfy error: ' + JSON.stringify(item.status).slice(0, 500));
    }
    const imgs = item.outputs && item.outputs['11'] && item.outputs['11'].images;
    if (imgs && imgs.length) {
      fs.mkdirSync(OUT, { recursive: true });
      const dest = path.join(OUT, `${key}_${seed}.png`);
      await download(imgs[0].filename, imgs[0].subfolder, dest);
      return dest;
    }
  }
  throw new Error('timeout ' + key);
}

(async () => {
  const [ref, key, prompt, ...rest] = process.argv.slice(2);
  if (!ref || !key || !prompt) {
    console.log('usage: node tools/cg-edit.js <参考图> <输出名> "<改动指令>" [seed] [denoise] [w] [h]');
    return;
  }
  const seed = Number(rest[0]) || 20261200;
  const denoise = Number(rest[1]) || 0.85;
  const w = Number(rest[2]) || 768;
  const h = Number(rest[3]) || 960;

  // 复制进 ComfyUI 的 input 目录（LoadImage 只认那里）
  const ext = path.extname(ref) || '.png';
  const refName = `tm_ref_${key}${ext}`;
  fs.copyFileSync(ref, path.join(INPUT_DIR, refName));

  const t = Date.now();
  const dest = await run(buildEdit({
    prompt, neg: 'blurry, deformed, extra limbs, distorted face, watermark, text',
    refName, w, h, seed, denoise, steps: 8, cfg: 1.0,
  }), key, seed);
  console.log(`✓ ${key} ${((Date.now() - t) / 1000).toFixed(1)}s → ${dest}`);
})().catch((e) => { console.log('✗ ' + e.message); process.exit(1); });
