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

// 有人物的场景专用：上面那份 STYLE 结尾硬写了 no people / no characters，
// 直接拿来画序章只会出空镜（2026-11-26 实测：intro2/intro3 两页一个人都没有，
// 旁白里国王在递绣帕、勇者在收剑，画面里只有石台）。FIG 版只去掉这一句。
const STYLE_FIG = STYLE.replace('no people, no characters, no text', 'no text');
const FIG_NEG = NEG.replace('people, person, character, human, figure, face, hands, ', '')
  + ', holding hands gently, walking together like a couple, child, teenager, extra limbs, deformed hands, distorted face';

// ---------- 柔和版（2026-11-26 用户：「为什么你的画风这么恐怖，换一个柔和一点的」）----------
// 问题不在「暗」——暗黑奇幻本来就要夜、要雾、要石头。恐怖感来自三样东西：
//   ① extreme low key + deep crushed blacks：整幅压到只剩一束光，暗部没有过渡，像惊悚片打光；
//   ② strong chiaroscuro + cold blue ambient：硬边明暗交界 + 冷蓝，人物看起来像从坟里出来的；
//   ③ 立绘的 deep black background + face mostly in shadow：背景纯黑、脸半埋，等于把人当幽灵画。
// 柔版保留叙事（还是夜、还是海崖、还是塔），只换光：大面积漫射、阴影有渐层、暖冷混色、暗部不压死。
// 第二版修正（17:1x）：第一版写了 luminous haze / warm amber，出来 meanL 82/75/103，
// 顶穿 bd-luma 的 20–50 带——手机上是一层白雾，夜间氛围全没了。
// 「柔和」是指阴影有过渡、明暗交界不硬，**不是画面亮**。这版明确写死 dark night / low key，
// 把亮度交给构图（一束光 + 大片暗部），只把光的边缘做软。
const STYLE_SOFT = 'dark fantasy game background, painterly matte painting, hand-painted oil texture, '
  + 'dark night interior, low key scene, mostly deep shadow, one soft diffused moonlight source, '
  + 'gentle shadow falloff, soft contrast, warm amber candle accents against cool blue shadow, '
  + 'soft atmospheric haze, floating dust motes, soft film grain, fine painterly brushwork, '
  + 'a soft rim light picking out the nearest edges, '
  + 'wide angle establishing shot, vertical composition, foreground midground background layers, '
  + 'highly detailed stone and metal surfaces, no people, no characters, no text';

// 柔版额外要堵的：恐怖/阴森/极硬光，以及「舞蹈语汇」——柔化之后模型极容易把「被拽住」画成「共舞」。
// 注意不能把 low contrast / washed out 一起堵掉——柔版本来就要降对比。
const SOFT_EXTRA_NEG = ', harsh shadows, hard edged light, extreme contrast, pitch black background, '
  + 'horror, macabre, gore, grotesque, scary, sinister, menacing, grimdark, '
  + 'pale corpse skin, sunken eyes, hollow cheeks, glowing eyes, red glowing eyes, demonic eyes, '
  + 'dancing, ballerina, ballet pose, waltz, pointed toes, flowing skirt, graceful leap, elegant graceful pose';

function styleFor(fig, soft) {
  const base = soft ? STYLE_SOFT : STYLE;
  return fig ? base.replace('no people, no characters, no text', 'no text') : base;
}

function negFor(fig, soft) {
  let n = NEG;
  if (fig) {
    n = n.replace('people, person, character, human, figure, face, hands, ', '')
      + ', holding hands gently, walking together like a couple, '
      + 'child, teenager, extra limbs, deformed hands, distorted face';
  }
  if (soft) n += SOFT_EXTRA_NEG;
  return n;
}

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
  //
  // 2026-11-26 二次修正（用户：「牵着公主的手，完全没有胁迫感」）：
  // 上一版 prompt 写的是 gripping the forearm，但出了「垂手递手 + 她站得笔直」。
  // 原因不是措辞不够狠，是三点：① 两人都压成纯黑剪影后，「抓」和「牵」的外轮廓同形，
  // 模型只能走最高频先验（牵手）；② slightly off the ground 在剪影里等于没离地，
  // 站直比悬空好收敛；③ 两人同高同大、各自重心落在自己脚下 = 并肩同行的视觉语法。
  // 这一版只压三件事：**手臂绷直**（剪影里唯一可靠的「被拽」信号）、
  // **双脚明确悬空 + 掉一只鞋**、**低机位让魔王吃掉三分之二画面**。
  // 公主的白丝留一道月光勾边，是整张图唯一的高光——既保住剪影张力，也让人物立得住。
  // 二次修正的二次（2026-11-26 16:5x，改柔和画风时）：柔化把动作一起带跑了——
  // 「柔和月光 + 梦幻笔触」让模型选了唯美舞蹈构图（足尖点地、裙摆扬起、另一只手优雅张开）。
  // 这次的硬约束：**她那只自由的手必须抓他手腕**（挣扎的唯一物理证据），并直接用 not dancing 封死舞蹈语汇。
  // 同时把「她是剪影」改成「她被月光照亮、魔王才是剪影」——柔版和暗版都能用，对比还更强。
  // 四修：舞姿止住了（死重语义有效），但魔王露出獠牙脸——比原来的纯黑剪影更像 B 级片。
  // 给它扣一顶封闭铁盔：体量压迫还在，五官和獠牙全部消失。
  intro1: 'an ancient ruined gothic throne room, low camera angle looking up, '
    + 'a huge horned demon in black armour on the left, his horns and heavy armour rimmed with cold light, '
    + 'a closed iron helm with no face opening, '
    + 'his arm reaching down from above, his fist clamped hard around the upper arm of a young woman, '
    + 'she hangs from his grip as dead weight, both feet off the ground, knees bent, legs hanging limp and heavy, '
    + 'one small shoe fallen onto the red carpet below her, '
    + 'her captured arm pulled perfectly straight and taut, her shoulder wrenched upward, '
    + 'her free hand clawing at his wrist, trying to pry his fingers open, '
    + 'her body twisted away, head thrown back, '
    + 'she wears a dark grey wool dress, the skirt hangs heavy and still, '
    + 'cold moonlight behind her catches her sheer white silk stockings, '
    + 'dark red carpet leading forward, embers rising in the air, exactly two figures, not dancing',
  // 旁白第 2 句：「国王把绣帕塞进我手里，他的手一直在抖，只说了一句：求你。」
  // 上一版是空镜（石台上放着一方布）——STYLE 带 no people 的锅，人是被提示词禁掉的。
  // 现在改成**勇者第一人称**：国王朝镜头递帕子。一个人 + 一只手 + 一个物件，
  // 比「两人交接」稳得多（FLUX 画多人互动的失败率很高，intro1 已经验过一次）。
  // 柔和版修正：`his eyes red` 被画成发光的红眼（恐怖片标配），第二版写 `red rimmed from weeping` 依然发光。
  // 干脆不提眼睛颜色——只写「脸上有泪痕」，发光眼直接进负向。
  intro2: 'a cold moonlit throne hall at midnight, an elderly king standing alone before his high throne, '
    + 'a heavy dark iron crown on his head, thick fur-lined robes hanging heavy on thin shoulders, '
    + 'a gaunt grief-stricken face wet with tears, wearing a long sorrowful expression, '
    + 'he holds out a small folded white embroidered handkerchief toward the camera with one trembling hand, '
    + 'his other hand half raised in a silent plea, '
    + 'shot from the eye level of the person standing in front of him, at arm\'s length, '
    + 'the white handkerchief catches the soft light, '
    + 'torn banners hanging from tall columns behind him, moonlight pouring down through broken windows high above, '
    + 'warm golden candlelight on his hands and the handkerchief, cold blue shadow behind, dust motes drifting',
  // 旁白第 3 句：「我说：那我就做第一个。」
  // 上一版也是空镜（祭坛上摆着布和短剑）。改成勇者单人背影：跪在阶下、攥紧绣帕、剑盾搁在膝边。
  // 用背影是刻意的——既不跟第 2 页的国王抢脸，也避开「正脸崩」。
  // 柔和版修正：`empty throne dais` 在柔光下被画成椅背上嵌一张巨脸浮雕（像神殿雕像），
  // 明确写成「空的高背椅 + 石阶」，把「神像」这条路堵掉。
  intro3: 'a young hooded wanderer kneeling on cold stone before an empty high-backed throne on a stone dais, '
    + 'seen from behind at a three-quarter angle, his head lifted toward the throne, '
    + 'one fist closed tight around a small white embroidered handkerchief held against his chest, '
    + 'a short iron sword and a rough wooden shield lying on the flagstones beside his knee, '
    + 'worn leather cloak, crossed straps across his back, '
    + 'cold moonlight from high broken windows, the hall enormous and empty around him, dust in the air, '
    + 'an empty seat, no statue, no idol, no carving of a face',
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

// 需要「脸必须好看、必须看得清」的角色用这一版：上面的 PORTRAIT_STYLE 把脸压进阴影里
// 是为了躲 AI 正脸崩，但放到薇拉身上就是「看不见长什么样」。
// 写法参照实测有效的路子（2026-11-26 查证）：
//   ① 不要写 beautiful / perfect / stunning——这几个词反而把脸往「千篇一律 AI 脸」推；
//   ② 改成堆具体结构：脸型、眼型、眼距、鼻头、唇形、发际线；
//   ③ 留一点不完美（泪痣、轻微不对称、真实肤质）当辨识钉；
//   ④ 镜头段写 85mm 浅景深，比写 8k/masterpiece 有用。
const PORTRAIT_STYLE_CLEAR = 'dark fantasy character portrait, three-quarter body from head to below the knee, '
  + 'painterly oil illustration, 85mm portrait lens, shallow depth of field, '
  + 'strong single rim light from upper right, deep black background, '
  + 'dramatic chiaroscuro, detailed fabric and metal, '
  + 'muted desaturated palette with one clean white accent, '
  + 'three-quarter view, head lifted, face turned into the light, features clearly visible and lit, '
  + 'centered composition, no text, no frame, no border';

// 柔版立绘：deep black background + face in shadow 是「恐怖感」的主要来源（人像被当幽灵打光）。
// 换成 soft teal-grey 雾背景 + 左上大面积柔光 + 脸上有血色，还是暗调，但不再是从坟里爬出来的观感。
const PORTRAIT_STYLE_CLEAR_SOFT = 'dark fantasy character portrait, three-quarter body from head to below the knee, '
  + 'painterly oil illustration, 85mm portrait lens, shallow depth of field, '
  + 'soft diffused key light from upper left, a soft rim light tracing the cheekbone and jaw, '
  + 'warm gentle glow, deep soft teal-grey atmospheric background, '
  + 'gentle contrast, soft shadow falloff, film like highlights, detailed fabric and metal, '
  + 'muted palette of warm skin, dusty blue and one clean white accent, '
  + 'three-quarter view, head lifted, face softly and evenly lit, features clearly visible, '
  + 'centered composition, no text, no frame, no border';

const PORTRAIT_STYLE_SOFT = 'dark fantasy character portrait, half body, painterly oil illustration, '
  + 'soft diffused key light from upper left, deep soft teal-grey atmospheric background, '
  + 'gentle contrast, detailed fabric and metal, muted desaturated palette, '
  + 'three-quarter view, head slightly lowered, face softly lit, features readable, '
  + 'centered composition, no text, no frame, no border';

// ---------- 画风档位（2026-11-26 20:1x，用户：「公主还是很丑，国王也是，感觉都很不真实，能不能换个画风」）----------
// 「丑」和「不真实」是两个不同病根，得分开治：
//   ① 丑 ⇒ 厚涂的 `oil texture` / `painterly brushwork` / `hand-painted` 会把五官揉进笔触里，
//      远看是油画近看没细节。人像要好看，笔画必须先让位于结构。
//   ② 不真实 ⇒ CFG 5.0 太高。查证结论（2026-11-26）：FLUX 人像的 CFG 该压在 2.0–3.0，
//      高于 5 会往「美颜广告脸 / 蜡像」走；同时 `glowing skin` / `dewy` 这类词会诱发塑料反光，要换 `matte`。
// 用光学语言（镜头/光圈/胶片颗粒/补光）替代空形容词；正面写微瑕（fine pores / uneven pigmentation），
// 反面写塑料（plastic skin / airbrushed / waxy）。三档用 --art= 切换。
const ART_STYLES = {
  // A. 韩系半厚涂：漫剧/卡牌主流，微笔触、皮肤干净、美型柔和。最稳的一档。
  hanban: {
    cfg: 3.0,
    style: 'Korean semi-thick paint game character illustration, semi-realistic stylized face, '
      + 'clean soft rendering with subtle visible brushwork, low saturation palette, '
      + 'refined beautiful features, clear skin with a soft matte finish, '
      + 'soft window light from upper left with clean ambient fill, '
      + 'dark desaturated teal atmospheric background, '
      + 'three-quarter view, head lifted, centered composition, no text, no frame, no border',
    neg: ', 3D render, CGI, octane render, photograph, photorealistic, realistic skin pores, '
      + 'thick oil paint, heavy impasto, muddy brushwork, flat cel shading',
  },
  // B. 韩系 3D CG：游戏过场动画质感，皮肤通透、发丝分层，最容易「精致」但容易滑向娃娃。
  cg3d: {
    cfg: 3.0,
    style: 'Korean game cinematic CG still, 3D rendered character with subsurface scattering skin, '
      + 'octane render quality, soft studio three point lighting with a clean rim light, '
      + 'individual hair strands, refined beautiful features, smooth matte skin with realistic sheen, '
      + 'dark gradient background, shallow depth of field, '
      + 'three-quarter view, head lifted, centered composition, no text, no frame, no border',
    neg: ', painterly, thick oil paint, visible brush strokes, 2D illustration, flat cel shading, '
      + 'doll, ball jointed doll, plastic toy, waxy mannequin, uncanny valley',
  },
  // C. 写实电影感：真人质感，毛孔/肤色不均/胶片颗粒全开。最「真实」，但对「好看」最不保证。
  real: {
    cfg: 2.5,
    style: 'cinematic film still, shot on ARRI Alexa with an 85mm lens at f/1.8, '
      + 'natural skin with fine visible pores and subtly uneven pigmentation, matte skin tone, '
      + 'fine vellus hair catching the light, soft directional window light with clean ambient fill, '
      + 'subtle catchlight in the eyes, 35mm film grain, shallow depth of field, '
      + 'dark neutral background, three-quarter view, centered composition, no text, no frame, no border',
    neg: ', illustration, painting, oil paint, brush strokes, 3D render, CGI, cartoon, anime, '
      + 'plastic skin, waxy skin, airbrushed, poreless, doll-like, beauty filter',
  },
  // E. 男性写实档（semi 的男性版）：同一套光影逻辑，去掉所有 beauty/妆容词，换粗粝纪实语法。
  //    2026-11-27 实测：semi 套到男性角色上会画成女人（yanmo → 亚洲老妇）、还会在前面加一个女模特（mowang、candle）。
  semiM: {
    cfg: 2.8,
    style: 'semi-realistic cinematic game portrait, gritty character study, '
      + 'realistic adult male proportions and anatomy, weathered skin with visible pores and texture, '
      + 'hard directional key light from upper left with deep shadow falloff and clean ambient fill, '
      + '85mm lens, shallow depth of field, fine film grain, '
      + 'dark stone interior behind him, '
      + 'three-quarter view, chest up, centered composition, solo, only one person in frame, '
      + 'no text, no frame, no border',
    neg: ', female, woman, girl, feminine face, makeup, lipstick, long eyelashes, soft glam, '
      + 'two people, multiple people, another person, crowd, second figure, background person, '
      // weathered skin 在暗光下会失控成黑斑/疮口（candle、yan 都中招），这几组必须堵
      + 'blemishes, dark spots on face, sores, scabs, diseased skin, corpse spots, bruises, '
      + 'anime, cartoon, cel shading, doll, plastic toy, waxy mannequin, '
      + 'thick oil paint, heavy impasto, muddy brushwork, 3D render, CGI',
  },
  // D. 半写实（推荐档，女性）：真人骨相 + 精修五官 + 电影光。
  // 实测 A 太动漫（五官缩小成符号）、B 太娃娃（大眼圆脸 BJD 感）、C 太素人（真实但不好看）。
  // 第二版（20261152/53）骨相够了但仍是「影棚素颜试装照」——纯灰背景 + 自然光 + 素颜 = 证件照。
  // 补三样：① editorial beauty 的摄影语法（beauty dish + rim light，把人从背景里剥出来）；
  // ② 淡妆（soft glam，注意不能碰负面里的 heavy makeup）；③ 背景给一点环境光斑，不要纯灰。
  semi: {
    cfg: 2.8,
    style: 'semi-realistic cinematic game portrait, editorial beauty photography, Korean MMO key art, '
      + 'realistic adult human proportions with refined idealized features, soft glam makeup with defined lashes and soft contour, '
      + 'natural skin with fine pores and subtly uneven tone, matte finish, soft sheen on the cheekbones and nose bridge, '
      + 'beauty dish key light from upper left plus a cool rim light separating her shoulder and hair from the background, '
      + 'subtle catchlight in the eyes, eyes wide open and sharply focused, '
      + '85mm lens, shallow depth of field, fine film grain, '
      + 'dark stone hall behind her with a faint warm glow and soft falloff, '
      + 'three-quarter view, head lifted, direct steady gaze into the camera, '
      + 'centered composition, no text, no frame, no border',
    neg: ', anime, cartoon, cel shading, chibi, oversized eyes, doll, ball jointed doll, '
      + 'plastic toy, waxy mannequin, heavy airbrush, beauty filter, poreless, flat studio backdrop, passport photo, '
      + 'thick oil paint, heavy impasto, muddy brushwork, 3D render, CGI',
  },
};

const ART = (() => {
  const m = process.argv.find((a) => a.startsWith('--art='));
  return m ? m.slice(6) : '';
})();

const PORTRAITS = {
  // 第一版出成十二三岁的少年（young wanderer 被读成 kid）。设定是「第九位勇者」成年人，
  // 改成 early twenties + 明确的身形与胡茬，压住年龄。
  hero: 'a young man in his early twenties, hooded wanderer cloak worn at the edges, '
    + 'tilted pointed hood pushed back enough to see the face, one single short sword slung across his back, '
    + 'crossed leather straps and a rough scarf, faint stubble, warm gold eyes catching the light, '
    + 'lean weathered face, determined quiet expression',
  // 2026-11-27 补：所有男性角色的描述都补上 male / his。上一版只写了 craftsman / scholar / merchant，
  // 模型在 beauty 语法下默认画成女性（实测 yanmo 出成亚洲老妇、candle 前面多站一个女模特）。
  candle: 'an old male craftsman ghost holding a small oil lamp, gaunt hollow cheeks, hunched shoulders, '
    + 'faint pale blue translucent glow, the stone wall faintly visible through his body, '
    + 'threadbare work clothes, tired kind eyes, '
    + 'the lamp is the only warm light',
  // 2026-11-26 重做（用户：「公主画得充分好看一点，要有白丝」）。
  // 上一版的问题：脸瘦、眼窝深、表情苦、年龄感 30+，而且长裙盖到脚——没有腿、没有丝袜。
  // 第二版（20261131）白丝和开衩对了，但脸还是 30+：法令纹、脸颊凹、两坨腮红、灰白辫子。
  // 第三版（20261132）矫枉过正成 14 岁甜妹：soft full cheeks + honey blonde braid + faint smile
  //   + 一堆「老」的负面词把她推回了少女。这一版拿掉幼态特征（饱满脸颊/甜笑），
  //   换成 slim jaw + defined cheekbones + 闭嘴 + regal bearing，才压得住 22 岁。
  // 2026-11-26 21:0x 第六版（用户定妆：「过膝白丝，公主服，胸再大点」）：
  // ① 过膝白丝必须写成 thigh-high + 明确「袜口以上露一段大腿」，否则模型一律画成连裤袜；
  // ② 裙长必须卡在 mid-thigh，不然看不到袜口那道分界，等于白写；
  // ③ 公主服用 corseted bodice + puff sleeves + 银色刺绣，束腰本身就负责「胸的形」；
  // ④ 原来的深灰羊毛旅行装整套删掉——立绘是角色标准形象，旅行装留给序章 CG 里被抓的那一幕。
  vera: 'a young woman of twenty-two, princess Vera, heart-shaped face with a soft tapered jawline and high soft cheekbones, '
    + 'striking grey-blue eyes, almond shaped with slightly upturned outer corners and long dark lashes, '
    + 'straight fine brows, a high straight nose bridge with a small delicate tip, '
    + 'full lips with a defined cupid bow, closed in a calm line, '
    + 'luminous clear skin with fine real texture, no heavy blush, one small dark beauty mark under her left eye, '
    + 'long pale honey blonde hair half braided, loose strands falling over one shoulder, '
    + 'an elegant deep midnight-blue princess gown, fitted corseted bodice with silver embroidery, '
    + 'puffed short sleeves, a full skirt ending at mid-thigh, a fuller bust, a curvy feminine figure, '
    + 'white thigh-high stockings with a visible band of bare thigh above them, '
    + 'a short fur trimmed royal cloak thrown back over one shoulder, '
    + 'dark leather ankle boots with a low heel, '
    + 'a small white embroidered handkerchief knotted around her left wrist, both hands relaxed and empty, '
    + 'head lifted, regal poised bearing, calm resolute gaze',
  mowang: 'a tall male horned demon king in rusted armour, massive curved horns, '
    + 'cracked iron plates, embers glowing in the cracks, one hand resting on a sword hilt, '
    + 'sorrowful weary posture, deep red ember light',
  yanmo: 'a middle-aged male craftsman with smooth healed burn scars, pale tight scar tissue across his face and forearms, '
    + 'heavy leather apron, '
    + 'soot-black hands, a blacksmith hammer tucked at his belt, warm ember glow from below, '
    + 'weary human face, no horns',
  yan: 'a gaunt male scholar in layered dark robes seated behind a desk, '
    + 'a thick ledger open before him, ink-stained fingers, quill in hand, '
    + 'violet cold light, face half in shadow',
  duo: 'a male bell keeper in a heavy hooded robe, a broken bronze bell clapper in his hands, '
    + 'bronze-coloured pendant, old and quiet face, warm bronze light from one side',
  heng: 'a male stone-cutter in a rough work apron, holding a chisel, '
    + 'stone dust on his shoulders and hair, pale grey skin like carved granite, '
    + 'cold blue light, still and patient expression',
  cheng: 'a male travelling quartermaster merchant behind a wooden stall, '
    + 'leather coat with many pockets, a brass balance scale in one hand, '
    + 'warm lantern light, shrewd friendly smile, coins on the counter',
  // 2026-11-27 新增：国王原先只出现在序章 CG 里，没有锚图 ⇒ 每次重画都是一张新脸。
  // 补一张锚图后，序章第二幕（递绣帕）从这张派生，以后任何国王出镜都认这张脸。
  king: 'an elderly king in his sixties, heavy dark iron crown, thick fur lined robes with an ermine collar, '
    + 'gaunt grief stricken face wet with tears, grey beard, deep set tired eyes, '
    + 'holding a small white embroidered handkerchief in one hand, '
    + 'standing in a cold moonlit throne hall',
};

// semi 那档是照女性写的（beauty dish / 淡妆 / editorial beauty），套到男性身上会直接变性。
// 这里登记女性角色，其余一律自动落到 semiM。
const PORTRAIT_FEMALE = new Set(['vera']);

// 露脸版立绘名单（其余角色继续保持低头/压阴影，别一起改）
const PORTRAIT_FACE = new Set(['vera']);

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
function buildWorkflow(prompt, neg, w, h, seed, prefix, cfg) {
  return {
    1: { class_type: 'UnetLoaderGGUF', inputs: { unet_name: UNET } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: TEXT_ENC, type: 'flux2' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: VAE } },
    4: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: neg } },
    6: { class_type: 'EmptyFlux2LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    7: { class_type: 'Flux2Scheduler', inputs: { steps: STEPS, width: w, height: h } },
    8: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    9: { class_type: 'CFGGuider', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], cfg: cfg || CFG } },
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

// 画面里必须有人物的场景——这些走 STYLE_FIG / FIG_NEG，不然空镜 STYLE 里那句
// no people 会把人直接删掉（顺序：intro4 本来就靠正文压过了 no people，一并收进来）。
const FIG_SCENES = new Set(['intro1', 'intro2', 'intro3', 'intro4']);

// 画风开关：默认沿用原暗调；命令行带 --soft 走柔和版（先出样张验收，别一次重跑 33 张）
const SOFT = process.argv.includes('--soft');

async function genScene(key, seed) {
  const text = SCENES[key];
  if (!text) throw new Error('unknown scene ' + key);
  const fig = FIG_SCENES.has(key);
  return run(
    buildWorkflow(`${styleFor(fig, SOFT)}, ${text}`, negFor(fig, SOFT), SCENE_W, SCENE_H, seed, 'tm_' + key),
    key + (SOFT ? '_soft' : ''), seed,
  );
}

async function genPortrait(key, seed) {
  const text = PORTRAITS[key];
  if (!text) throw new Error('unknown portrait ' + key);
  const clear = PORTRAIT_FACE.has(key);
  // 露脸版额外堵「老/苦/脏」这几组——实测 22 岁的写法压不住写实油画底模往 30+ 走；
  // 但堵太狠会滑到少女（20261132 就是），所以同时要堵「幼」。
  const ageNeg = clear
    ? ', gaunt, sunken cheeks, nasolabial folds, deep wrinkles, aged, middle-aged, old woman, '
      + 'grey hair, white hair, heavy blush, red cheeks, stern frown, tired eyes, '
      + 'childish, girlish, baby face, adolescent, smiling broadly, grinning'
    : '';
  let neg = NEG.replace('people, person, character, human, figure, face, hands, ', '')
    + ', full body, wide shot, busy background, extra limbs, deformed hands, distorted face, '
    // 年龄兜底：hero 曾经被画成十二三岁，这里直接把人脸相关的词堵死
    + 'child, teenager, underage, loli, '
    // 「漂亮」的反面不是丑，是塑料：这两组词是把 AI 脸拉回真人质感的关键
    + 'plastic skin, airbrushed, doll-like, over-smoothed, waxy, heavy makeup'
    + ageNeg;
  if (SOFT) neg += SOFT_EXTRA_NEG;

  // 画风档位（--art=）：单独一套基座负面。
  // 注意不能沿用 NEG——NEG 里写着 illustration / painting / cartoon，对「插画/CG」档是自相矛盾的，
  // 会一边要求画风一边把它堵掉，最后只能出成不伦不类的照片。
  if (ART && ART_STYLES[ART]) {
    // --art=semi 是女性档；男性角色自动落到 semiM，否则会被 beauty 语法画成女人
    const artKey = (ART === 'semi' && !PORTRAIT_FEMALE.has(key)) ? 'semiM' : ART;
    const a = ART_STYLES[artKey];
    const shot = clear ? 'three-quarter body, from head to mid-thigh' : 'half body';
    const artNeg = 'text, letters, numbers, watermark, signature, logo, ui, hud, frame, border, '
      + 'blurry, jpeg artifacts, oversaturated, cluttered, busy background, '
      + 'two people, multiple people, another person, crowd, second figure, '
      + 'extra limbs, deformed hands, distorted face, child, teenager, underage, '
      + 'plastic skin, airbrushed, doll-like, over-smoothed, waxy, heavy makeup'
      + (clear ? ageNeg : '')
      + a.neg;
    return run(
      buildWorkflow(`${a.style}, ${shot}, ${text}`, artNeg, PORTRAIT_W, PORTRAIT_H, seed, 'tm_pt_' + key, a.cfg),
      'portrait_' + key + '_' + artKey, seed,
    );
  }
  const style = SOFT
    ? (clear ? PORTRAIT_STYLE_CLEAR_SOFT : PORTRAIT_STYLE_SOFT)
    : (clear ? PORTRAIT_STYLE_CLEAR : PORTRAIT_STYLE);
  return run(
    buildWorkflow(`${style}, ${text}`, neg, PORTRAIT_W, PORTRAIT_H, seed, 'tm_pt_' + key),
    'portrait_' + key + (SOFT ? '_soft' : ''), seed,
  );
}

if (require.main !== module) {
  module.exports = { SCENES, PORTRAITS, STYLE, NEG, PORTRAIT_STYLE, UNET, TEXT_ENC, VAE, STEPS, CFG, SCENE_W, SCENE_H };
} else (async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.log('usage: node tools/cg-gen.js <scene|all|portrait:name,...|portrait:all> [seed] [--soft]');
    console.log('       --soft = 柔和版画风（默认仍走原来的暗调）');
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
