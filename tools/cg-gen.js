// 本地 ComfyUI 出图（TowerMates 对话 CG / 角色立绘）
// 用法：node tools/cg-gen.js <场景键|all> [seed]
//       node tools/cg-gen.js portrait:勇者,portrait:烛 [seed]
// 依赖：本机 ComfyUI 已在 8188 监听（D:\personal-video-pipline\pipeline，venv-comfy，RTX 5090 D），
//       C:\pvp-models\checkpoints 里有 moodyProMix_zitV12DPO.safetensors（写实电影感 SDXL 微调）
//       + sd_xl_base_1.0.safetensors（兜底）
// 产出：tools/art-test/<场景键>_<seed>.png
//
// 2026-11-26 提升（用户反馈「不高清」「没用上 5090 管线」）：
//   ① 底模 sd_xl_base_1.0 → **FLUX.2 Klein 9B**（本机视频管线在用的主力图像模型，GGUF Q4 + qwen3-8b 文本编码器）；
//   ② 单阶段原生 896×1792（FLUX 在这个尺度上细节自足，不需要 SDXL 那种 latent 放大补救）；
//   ③ 最终资产 860×1800（原 430×900）——DPR=2 的手机上不再糊。
//   注：moodyProMix 是 Z-Image 架构（cap_embedder/context_refiner），CheckpointLoaderSimple 取不到 CLIP，
//   要单独配 text encoder + 别的采样链；本机现成的 Klein 工作流已验证可用，先用它。
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 8188;
const UNET = 'flux-2-klein-9b-Q4_K_M.gguf';
const TEXT_ENC = 'qwen_3_8b_fp8mixed.safetensors';
const VAE = 'flux2-vae.safetensors';
const OUT = path.join(__dirname, 'art-test');

// 场景：896×1792（≈0.5，裁到 430×900 的 0.478 只切掉两侧 18px）
const SCENE_W = 896;
const SCENE_H = 1792;
// 立绘：竖幅半身 768×960（4:5），点击放大时够看
const PORTRAIT_W = 768;
const PORTRAIT_H = 960;
const STEPS = 28;
const CFG = 5.0;

// 统一风格段。写作要点：先定「谁在看/在哪」，再定「光从哪来」，最后压暗部——
// SDXL 对「one light source + 具体材质」最敏感，对「cinematic」这类空词几乎不响应。
const STYLE = 'dark fantasy game background, painterly matte painting, hand-painted oil texture, '
  + 'extreme low key lighting, single warm light source, cold blue ambient fill, '
  + 'volumetric haze, floating dust motes, deep crushed blacks, strong chiaroscuro, '
  + 'wide angle establishing shot, vertical composition, foreground midground background layers, '
  + 'highly detailed stone and metal surfaces, film grain, no people, no characters, no text';

const NEG = 'people, person, character, human, figure, face, hands, text, letters, numbers, watermark, signature, '
  + 'logo, ui, hud, frame, border, bright daylight, evenly lit, flat lighting, colorful, saturated, '
  + 'cartoon, anime, illustration, cel shading, low contrast, washed out, blurry, jpeg artifacts, '
  + 'oversaturated, lens flare, multiple light sources, cluttered, busy';

const SCENES = {
  // ---------- 第 1 章：锁身（看得见的六层） ----------
  gate: 'a massive iron portcullis gate inside a stone gatehouse, heavy rusted chains, '
    + 'a burning torch in an iron bracket on the left wall casting a warm pool on wet flagstones, '
    + 'cold blue shadows behind the bars, thick stone blocks, a thin blade of light leaking through',
  corridor: 'interior of an ancient stone tower corridor, tall pointed gothic arches receding into darkness, '
    + 'worn flagstone floor with a dark central runner, damp grey stone walls with faint carved tally marks, '
    + 'a single oil lamp on the left wall as the only light, warm amber pool on the stones, cold fog low on the floor',
  market: 'an underground night market stall in a vast stone hall, heavy dark cloth awning, '
    + 'wooden counter with a brass balance scale and scattered coins, old wooden crates stacked behind, '
    + 'one hanging lantern as the only warm light, cold fog on the floor, deep arches behind',
  passage: 'a narrow brick passage deep inside a tower, cracked walls with old mortar, '
    + 'a fallen wooden beam overhead, one thin shaft of cold light from a crack in the ceiling, '
    + 'rubble and broken bricks on the floor, damp stains',
  wolfhall: 'a low vaulted stone hall, deep claw marks gouged into the walls, '
    + 'bones and a broken sword scattered on the floor, a rusted chain hanging from the arch, '
    + 'one small brazier burning low as the only light, smoke curling up',
  empty: 'an endless empty stone gallery with a row of dark doorways, nothing inside them, '
    + 'one burning torch on the far wall as the only light, long shadows stretching across the floor, '
    + 'cold air and dust, the doorways all equally dark',
  stairs: 'a spiral stone staircase winding up inside a tower shaft, worn steps, '
    + 'a narrow arrow slit letting in one thin cold shaft of moonlight, '
    + 'iron ring bolts in the wall, dust hanging in the beam, darkness above and below',

  // ---------- 第 2 章：王座 ----------
  throne: 'an empty throne room at the top of a tower, high-backed stone throne with three points, '
    + 'tall narrow windows letting in cold moonlight shafts, faded dark red carpet running to the dais, '
    + 'dust in the air, cracked flagstones, deep shadow in the corners',
  reddoor: 'a heavy red-painted iron door at the end of a stone corridor, '
    + 'flaking red paint over rust, iron bands and a large ring handle, '
    + 'one torch in a bracket beside it, cold darkness beyond, worn threshold',
  ledger: 'an old accounting room inside a tower, tall shelves packed with ledgers and scrolls, '
    + 'a heavy wooden desk with an open thick book and a dry quill, stacks of paper, '
    + 'one oil lamp on the desk as the only light, dust and cobwebs, deep shadows between shelves',

  // ---------- 第 3 章：塔脊 ----------
  ridge: 'the broken upper level of a tower, half-collapsed roof open to a starry night sky, '
    + 'exposed timber beams and shattered tiles, wind-blown dust, a single lantern hanging from a beam, '
    + 'a low broken parapet with the void beyond',
  town: 'a night view looking down from a great height onto a small harbour town, '
    + 'six tiny warm window lights scattered in the dark, black sea beyond, '
    + 'heavy clouds, cold moonlight, the town far below and very small',
  bell: 'a bell tower interior, an enormous bronze bell hanging in the centre from a massive timber frame, '
    + 'a broken clapper lying on the boards, thick ropes, one brazier burning at the base, '
    + 'dust and cold light from louvred openings high up',

  // ---------- 第 4 章：名墙与刻名 ----------
  // 第一版跑偏成「骷髅头拱门」（模型把 carved wall 读成某种地牢入口）——
  // 改成正面平墙特写，并用 no door/no arch/no skull 三个否定把门形堵死。
  namewall: 'close-up frontal view of one flat interior stone wall completely covered with thousands of '
    + 'small hand-cut names and tally marks, narrow chisel grooves catching raking torch light from the left, '
    + 'one single uncarved blank patch in the lower right corner, dust in the grooves, '
    + 'no door, no arch, no skull, no statue, no ornament',
  forge: 'an abandoned smithy deep inside a tower, a cold stone forge with rusted tools, '
    + 'an anvil covered in orange rust dust, broken chains, a pile of corroded armour on the floor, '
    + 'one dying ember glow inside the forge mouth, heavy soot-black walls',
  // 第一版出成「石室供桌 + 陶罐 + 吊灯」——桌子上没有石板也没有凿子，跟「刻名」无关。
  // 现在只讲三件东西：石板、凿子、油灯；相机压到工作台同高。
  carve: 'inside a dark stone workshop, a heavy scarred workbench seen from a low three-quarter angle, '
    + 'a half-finished flat stone tablet lying on it with fresh chisel marks, a steel chisel and a mallet '
    + 'beside the tablet, one small clay oil lamp at the edge of the bench as the only light, '
    + 'stone dust, chisels hanging on the wall behind, no jars, no vase',

  // ---------- 锁芯与塔顶 ----------
  // 第一版出成「户外圆形石亭」（有天空、有石阶、有雨）——完全不是锁芯。
  // 关键是把「室内」写死：enclosed room / no sky / no windows / no steps。
  core: 'interior of a circular stone chamber, looking slightly down at a huge ancient mechanism of '
    + 'concentric carved stone rings set flush into the floor around a low central pedestal, '
    + 'pale cold blue light glowing up from the narrow gaps between the rings, '
    + 'four massive square pillars at the corners, sealed room, no sky, no windows, no steps',
  roof: 'camera standing on the flat rooftop of a black tower, broken stone pillars and a cracked parapet '
    + 'close in the foreground, an empty stone pedestal in the centre, a sea of clouds far below the parapet, '
    + 'dark cold night sky with heavy cloud, no dawn glow, no distant tower',
  window: 'a tall narrow window in a stone tower room, shutters torn away, '
    + 'cold wind and a scrap of pale cloth caught on the sill, black sea and cliffs far below, '
    + 'moonlight through the opening, the room behind in deep shadow',
  dawn: 'almost entirely black sea and sky, a single thin horizontal slit of golden dawn light at the horizon, '
    + 'heavy black storm clouds filling the top two thirds, a black tower silhouette rising against the faint glow, '
    + 'calm black water with one thin reflection',

  // ---------- 序章四幕 ----------
  // 2026-11-26 重出：第一版只有魔王、公主没画出来（旁白说「抓走」，画面里没人被抓）。
  // 关键是把两个人的**关系**写具体：右手抓着她的小臂、她被提离地面、两个剪影。
  intro1: 'a ruined gothic throne room, a huge horned demon in black armour standing before the throne, '
    + 'rendered as a pure black silhouette, his right hand gripping the forearm of a small woman in a long dress, '
    + 'lifting her slightly off the ground, she is a second pure black silhouette beside him, '
    + 'cold moonlight behind them, dark red carpet leading forward, embers in the air, '
    + 'exactly two figures, both flat black silhouettes with no faces',
  intro2: 'a grand ruined palace hall at midnight, torn banners hanging from tall columns, '
    + 'moonlight pouring in high through broken windows near the ceiling, a low stone pedestal in the middle '
    + 'foreground with a small folded pale cloth resting on it, dark stone floor in deep shadow, dust motes',
  intro3: 'a small stone altar in a dark chapel, a single candle burning on it as the only light, '
    + 'a folded grey cloth and a short sword laid on the stone, deep shadows all around',
  intro4: 'the gate of a black tower at dawn seen from outside, one small hooded figure rendered as a pure black '
    + 'silhouette walking toward the open gate, warm light spilling from the doorway, cold mist on the ground',
};

// 角色立绘：暗底半身像（面板里叠 CSS 渐隐），一律「nobody's face issues」——
// 用「3/4 侧脸、低头、兜帽压住眼睛」这类写法，避免 AI 画正脸崩。
const PORTRAIT_STYLE = 'dark fantasy character portrait, half body, painterly oil illustration, '
  + 'strong single rim light from upper right, deep black background, '
  + 'dramatic chiaroscuro, detailed fabric and metal, muted desaturated palette, '
  + 'three-quarter view, head slightly lowered, face mostly in shadow, '
  + 'centered composition, no text, no frame, no border';

const PORTRAITS = {
  // 第一版出成十二三岁的少年（young wanderer 被读成 kid）。设定是「第九位勇者」成年人，
  // 改成 early twenties + 明确的身形与胡茬，压住年龄。
  hero: 'a young man in his early twenties, hooded wanderer cloak worn at the edges, '
    + 'tilted pointed hood pushed back enough to see the face, a short sword slung across the back, '
    + 'crossed leather straps and a rough scarf, faint stubble, warm gold eyes catching the light, '
    + 'lean weathered face, determined quiet expression',
  candle: 'a gaunt old craftsman ghost holding a small oil lamp, hunched shoulders, '
    + 'faint pale blue translucent glow, threadbare work clothes, tired kind eyes, '
    + 'the lamp is the only warm light',
  vera: 'a young princess in a dark travelling gown, long pale hair, '
    + 'a heavy royal cloak over plain cloth, calm resolute expression, cold pale light, '
    + 'a small embroidered handkerchief in her hand',
  mowang: 'a tall horned demon king in rusted armour, massive curved horns, '
    + 'cracked iron plates, embers glowing in the cracks, one hand resting on a sword hilt, '
    + 'sorrowful posture, deep red ember light',
  yanmo: 'a middle-aged craftsman with burn scars, heavy leather apron, '
    + 'soot-black hands, a hammer at his belt, warm ember glow from below, '
    + 'weary human face, no horns',
  yan: 'a gaunt scholar in layered dark robes seated behind a desk, '
    + 'a thick ledger open before him, ink-stained fingers, quill in hand, '
    + 'violet cold light, face half in shadow',
  duo: 'a bell keeper in a heavy hooded robe, a broken bronze bell clapper in his hands, '
    + 'bronze-coloured pendant, old and quiet face, warm bronze light from one side',
  heng: 'a stone-cutter in a rough work apron, holding a chisel, '
    + 'stone dust on his shoulders and hair, pale grey skin like carved granite, '
    + 'cold blue light, still and patient expression',
  cheng: 'a travelling quartermaster merchant behind a wooden stall, '
    + 'leather coat with many pockets, a brass balance scale in one hand, '
    + 'warm lantern light, shrewd friendly smile, coins on the counter',
};

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      host: HOST, port: PORT, path: '/prompt', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(out)); }
      });
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

// FLUX.2 Klein 工作流（本机 pipeline/tests/workflow_klein_t2i_api.json 的本地版）：
// UnetLoaderGGUF + qwen3-8b 文本编码器 + Flux2Scheduler/SamplerCustomAdvanced。
// 和 SDXL 的差别是「没有内置 latent 放大这一步」——FLUX 在 896×1792 上原生就够细节，
// 再叠一层放大只会把画面往「塑料」推（实测 SDXL 那套 hires 换到 FLUX 上是负收益）。
function buildWorkflow(prompt, neg, w, h, seed, prefix) {
  return {
    1: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: UNET } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: TEXT_ENC, type: 'flux2' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: neg } },
    6: { class_type: 'EmptyFlux2LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    7: { class_type: 'Flux2Scheduler', inputs: { steps: STEPS, width: w, height: h } },
    8: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    9: { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], cfg: CFG } },
    10: { class_type: 'RandomNoise', inputs: { noise_seed: seed, control_after_generate: 'fixed' } },
    11: {
      class_type: 'SamplerCustomAdvanced',
      inputs: { noise: ['10', 0], guider: ['9', 0], sampler: ['8', 0], sigmas: ['7', 0], latent_image: ['6', 0] },
    },
    12: { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    13: { class_type: 'SaveImage', inputs: { images: ['12', 0], filename_prefix: prefix } },
  };
}

async function run(wf, key, seed) {
  const r = await post({ prompt: wf, client_id: 'towermates-cg' });
  if (!r.prompt_id) throw new Error(JSON.stringify(r).slice(0, 400));
  for (let i = 0; i < 300; i++) {
    await sleep(1000);
    const h = await getJson('/history/' + r.prompt_id);
    const item = h[r.prompt_id];
    if (!item) continue;
    if (item.status && item.status.status_str === 'error') {
      throw new Error('comfy error: ' + JSON.stringify(item.status).slice(0, 400));
    }
    const outs = item.outputs || {};
    const imgs = outs['13'] && outs['13'].images;
    if (imgs && imgs.length) {
      fs.mkdirSync(OUT, { recursive: true });
      const dest = path.join(OUT, `${key}_${seed}.png`);
      await download(imgs[0].filename, imgs[0].subfolder, dest);
      return dest;
    }
  }
  throw new Error('timeout ' + key);
}

async function genScene(key, seed) {
  const text = SCENES[key];
  if (!text) throw new Error('unknown scene ' + key);
  return run(buildWorkflow(`${STYLE}, ${text}`, NEG, SCENE_W, SCENE_H, seed, 'tm_' + key), key, seed);
}

async function genPortrait(key, seed) {
  const text = PORTRAITS[key];
  if (!text) throw new Error('unknown portrait ' + key);
  const neg = NEG.replace('people, person, character, human, figure, face, hands, ', '')
    + ', full body, wide shot, busy background, extra limbs, deformed hands, distorted face';
  return run(
    buildWorkflow(`${PORTRAIT_STYLE}, ${text}`, neg, PORTRAIT_W, PORTRAIT_H, seed, 'tm_pt_' + key),
    'portrait_' + key, seed,
  );
}

if (require.main !== module) {
  module.exports = { SCENES, PORTRAITS, STYLE, NEG, PORTRAIT_STYLE, UNET, TEXT_ENC, VAE, STEPS, CFG, SCENE_W, SCENE_H };
} else (async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.log('usage: node tools/cg-gen.js <scene|all|portrait:name,...|portrait:all> [seed]');
    console.log('scenes:', Object.keys(SCENES).join(' '));
    console.log('portraits:', Object.keys(PORTRAITS).join(' '));
    return;
  }
  const seed = Number(process.argv[3]) || 20261126;
  const jobs = [];
  for (const tok of arg.split(',')) {
    if (tok === 'all') Object.keys(SCENES).forEach((k) => jobs.push(['scene', k]));
    else if (tok === 'portrait:all') Object.keys(PORTRAITS).forEach((k) => jobs.push(['pt', k]));
    else if (tok.startsWith('portrait:')) jobs.push(['pt', tok.slice(9)]);
    else jobs.push(['scene', tok]);
  }
  for (const [kind, k] of jobs) {
    const t = Date.now();
    try {
      const p = kind === 'pt' ? await genPortrait(k, seed) : await genScene(k, seed);
      console.log(`✓ ${kind === 'pt' ? 'portrait:' : ''}${k} ${((Date.now() - t) / 1000).toFixed(1)}s → ${p}`);
    } catch (e) {
      console.log(`✗ ${k} ${e.message}`);
    }
  }
})();
