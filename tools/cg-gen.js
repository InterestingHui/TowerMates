// 本地 ComfyUI 出图（TowerMates 对话 CG）
// 用法：node tools/cg-gen.js <场景键> [seed]
//       node tools/cg-gen.js all            # 批量出 tools/cg-scenes.json 里全部
// 依赖：本机 ComfyUI 已在 8188 监听（D:\personal-video-pipline\pipeline），
//       C:\pvp-models\checkpoints 里有 sd_xl_base_1.0.safetensors。
// 产出：tools/art-test/<场景键>_<seed>.png（原始 832×1216，裁切交给游戏里的 object-fit）
const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 8188;
const CKPT = 'sd_xl_base_1.0.safetensors';
const OUT = path.join(__dirname, 'art-test');

const STYLE = 'dark fantasy game background, matte painting, extreme low key lighting, chiaroscuro, '
  + 'nearly black shadows swallowing the edges, ONE small warm light source, cold blue ambient, '
  + 'volumetric fog, deep blacks, high contrast, painterly texture, vertical composition, '
  + 'dim underexposed, no people, no characters';
const NEG = 'people, person, character, figure, text, letters, watermark, signature, ui, hud, '
  + 'bright daylight, evenly lit, well lit, colorful, cartoon, anime, low contrast, blurry, '
  + 'oversaturated, multiple light sources, lens flare, frame, border';

const SCENES = {
  corridor: 'interior of an ancient stone tower corridor, tall pointed gothic arches receding into darkness, '
    + 'worn flagstone floor, damp grey stone walls with faint carved tally marks, '
    + 'a single oil lamp on the left wall as the only light, warm amber pool on the stones',
  market: 'an underground night market stall in a vast stone hall, heavy dark cloth awning, '
    + 'wooden counter with a brass balance scale and scattered coins, old crates, '
    + 'one hanging lantern as the only warm light, cold fog on the floor',
  throne: 'an empty throne room at the top of a tower, high-backed stone throne with three points, '
    + 'tall narrow windows letting in cold moonlight shafts, faded dark red carpet, dust in the air',
  gate: 'a massive iron portcullis gate inside a stone gatehouse, heavy chains, '
    + 'a burning torch in an iron bracket on the left wall casting a warm pool of light, '
    + 'cold blue shadows, a thin blade of light leaking through the bars',
  passage: 'a narrow brick passage deep inside a tower, cracked walls, a fallen wooden beam overhead, '
    + 'one thin shaft of cold light from a crack in the ceiling, rubble on the floor',
  wolfhall: 'a low vaulted stone hall with claw marks gouged into the walls, bones scattered on the floor, '
    + 'a rusted chain hanging from the arch, one small brazier burning low',
  ridge: 'the broken upper level of a tower, half-collapsed roof open to a starry night sky, '
    + 'exposed timber beams, wind-blown dust, a single lantern hanging from a beam',
  empty: 'an endless empty stone gallery with a row of dark doorways, nothing inside them, '
    + 'one burning torch on the far wall as the only light, long shadows across the floor',
  bell: 'a bell tower interior, an enormous bronze bell hanging in the centre, broken clapper, '
    + 'thick bell frame beams, one brazier burning at the base',
  namewall: 'a huge polished stone wall covered with thousands of carved names, '
    + 'one blank patch in the lower right, a single torch lighting the carvings from the left',
  carve: 'a stone carving room, a long work table with chisels and a half-finished stone tablet, '
    + 'an empty chair, one low oil lamp on the table',
  // 2026-11-25 焦点D：原提示词「the very top of a black tower above a sea of clouds」被模型读成
  // 「从外面远看一座塔」——塔身占满画面、没有石台，与 `dawn`（结局从外面看塔）几乎同构。
  // 而 princessPlain 的台词是「一个人，追到塔顶」——玩家此刻站在塔顶，不该看见塔的外立面。
  roof: 'camera standing on the flat rooftop of a black tower, broken stone pillars and a cracked parapet close in '
    + 'the foreground, an empty stone pedestal in the centre of the roof, a sea of clouds far below the parapet, '
    + 'dark cold night sky with heavy cloud and no dawn glow, no distant tower, no building exterior',
  core: 'the hidden heart of a tower, a circular stone mechanism of concentric rings around a stone pedestal, '
    + 'cold blue light rising from below, four tall lock columns at the corners',
  dawn: 'a black tower on a sea cliff at dawn seen from outside, a thin warm light in its doorway, '
    + 'calm dark sea below, cold sky',
  // 序章四幕（2026-11-25 补）：人物一律做成逆光剪影，避免 AI 画脸
  intro1: 'a ruined throne room, a huge horned demon rendered as a pure black silhouette stands before the throne, '
    + 'holding a small woman silhouette by the arm, cold moonlight behind them, dark red carpet, embers in the air, '
    + 'figures are flat black silhouettes only',
  // 2026-11-25 焦点D：原图（空荡拱廊 + 底部一片亮地板）有两个问题——② 第二幕的「帕」根本没画出来，
  // 而这一幕就是授帕；③ 最亮处在 y≈87%，正好被对白框压住（量尺此前不查序章四幕，所以一直全绿）。
  // 改成：光从高处破窗进来、帕放在中景矮石台上、地板留在暗里。
  intro2: 'a grand ruined palace hall at midnight, torn banners hanging from tall columns, '
    + 'moonlight pouring in high through broken windows near the ceiling, a low stone pedestal in the middle '
    + 'foreground with a small folded pale cloth resting on it, dark stone floor in deep shadow, dust motes',
  intro3: 'a small stone altar in a dark chapel, a single candle burning on it as the only light, '
    + 'a folded grey cloth and a short sword laid on the stone, deep shadows all around',
  intro4: 'the gate of a black tower at dawn seen from outside, one small hooded figure rendered as a pure black '
    + 'silhouette walking toward the open gate, warm light spilling from the doorway, cold mist on the ground',
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

async function gen(key, seed) {
  const text = SCENES[key];
  if (!text) throw new Error('unknown scene ' + key);
  const wf = {
    1: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    2: { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: `${STYLE}, ${text}` } },
    3: { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: NEG } },
    4: { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
    5: {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
        seed, steps: 30, cfg: 5.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1,
      },
    },
    6: { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    7: { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'tm_' + key } },
  };
  const r = await post({ prompt: wf, client_id: 'towermates-cg' });
  if (!r.prompt_id) throw new Error(JSON.stringify(r).slice(0, 300));
  for (let i = 0; i < 240; i++) {
    await sleep(1000);
    const h = await getJson('/history/' + r.prompt_id);
    const item = h[r.prompt_id];
    if (!item) continue;
    if (item.status && item.status.status_str === 'error') throw new Error('comfy error: ' + JSON.stringify(item.status).slice(0, 300));
    const outs = item.outputs || {};
    const imgs = outs['7'] && outs['7'].images;
    if (imgs && imgs.length) {
      fs.mkdirSync(OUT, { recursive: true });
      const dest = path.join(OUT, `${key}_${seed}.png`);
      await download(imgs[0].filename, imgs[0].subfolder, dest);
      return dest;
    }
  }
  throw new Error('timeout ' + key);
}

if (require.main !== module) {
  // 被 require 时只导出参数（manifest 生成器要用同一份提示词，避免抄第二遍）
  module.exports = { SCENES, STYLE, NEG, CKPT };
} else (async () => {
  const key = process.argv[2];
  if (!key) {
    console.log('usage: node tools/cg-gen.js <scene|all> [seed]');
    console.log('scenes:', Object.keys(SCENES).join(' '));
    return;
  }
  const seed = Number(process.argv[3]) || 20261125;
  const list = key === 'all' ? Object.keys(SCENES) : key.split(',');
  for (const k of list) {
    const t = Date.now();
    try {
      const p = await gen(k, seed);
      console.log(`✓ ${k} ${((Date.now() - t) / 1000).toFixed(1)}s → ${p}`);
    } catch (e) {
      console.log(`✗ ${k} ${e.message}`);
    }
  }
})();
