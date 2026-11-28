// 一次性改名脚本（2026-11-28）
// 角色真名替换：烛→长明 / 秤→秦权 / 炎魔→裴炬 / after 段锁匠换真名
// 只跑一次；留档用，不是构建步骤。
const fs = require('fs');
const p = (f) => 'js/' + f;

// ---------- story.js ----------
let s = fs.readFileSync(p('story.js'), 'utf8');

// 段内换真名（先把 after 段的 speaker 精确换掉，再全局换塔名外的词）
const pairs = [
  // afterYan：墨妖倒下，名字回来
  ["['墨妖', '划掉了也没用。塔记名字，不记人。', 'sad'],", "['沈砚', '……沈砚。八十年没人这么叫过我了。', 'sad'],\n    ['沈砚', '划掉了也没用。塔记名字，不记人。', 'sad'],"],
  ["['墨妖', '王座不是顶。王座后面，还有六层。', 'calm'],", "['沈砚', '王座不是顶。王座后面，还有六层。', 'calm'],"],
  // afterDuo
  ["['钟妖', '钟停了，账还在。上面有人会来收。', 'tired'],", "['顾铎', '钟停了，账还在。上面有人会来收。', 'tired'],"],
  ["['钟妖', '碑魔在刻名室。他等这一天，等了很久。', 'calm'],", "['顾铎', '宋铭在刻名室。他等这一天，等了很久。', 'calm'],"],
  // afterHeng
  ["['碑魔', '刀给你。写谁，由你。', 'calm'],", "['宋铭', '刀给你。写谁，由你。', 'calm'],"],
  ["['碑魔', '锁芯在塔顶后面。她也在那里。', 'sad'],", "['宋铭', '锁芯在塔顶后面。她也在那里。', 'sad'],"],
];
for (const [a, b] of pairs) {
  if (s.indexOf(a) < 0) throw new Error('missing: ' + a.slice(0, 40));
  s = s.replace(a, b);
}

// 名墙：墙上刻的是真名；补一句「塔只叫活计」的规矩
const wallOld = "    ['', '炎魔。墨妖。锤魔。钟妖。碑魔。五道刻完的名字。'],\n    ['烛', '第三道锁是锤魔的。锈吃他比吃炎魔还早一步，人形都没剩下——那道锁现在自己合着，你不必去敲。', 'sad'],";
const wallNew = "    ['', '裴炬。沈砚。程冶。顾铎。宋铭。五道刻完的名字。'],\n    ['烛', '塔不叫人的名字，只叫活计——守炉的、抄名的、打铁的、看钟的、刻碑的。叫久了，人就成了那个活计。', 'sad'],\n    ['烛', '第三道锁是程冶的。锈吃他比吃裴炬还早一步，人形都没剩下——那道锁现在自己合着，你不必去敲。', 'sad'],";
if (s.indexOf(wallOld) < 0) throw new Error('missing wall');
s = s.replace(wallOld, wallNew);

// 自我介绍：把「没刻完名字 ⇒ 塔拿不走」的规则说清
const introOld = "['烛', '别怕，我伤不了人。我叫烛，造塔的工匠，六个人里唯一没把名字刻完的那个。现在只剩一盏灯的分量。', 'calm'],";
const introNew = "['烛', '别怕，我伤不了人。我叫长明，造塔的工匠。六个人里只有我没把名字刻完——塔拿不走它。现在只剩一盏灯的分量。', 'calm'],";
if (s.indexOf(introOld) < 0) throw new Error('missing intro');
s = s.replace(introOld, introNew);

// 商人自我介绍：真名 + 外号
const merOld = "['秤', '我叫秤，第八位勇者的军需官。他往上走的时候，我留在了这一层。', 'calm'],";
const merNew = "['秤', '我叫秦权，第八位勇者的军需官。管秤的——叫久了，塔里塔外都只叫我秤。', 'calm'],";
if (s.indexOf(merOld) < 0) throw new Error('missing merchant');
s = s.replace(merOld, merNew);

// 魔王：镇上叫法越叫越远
const juOld = "['烛', '王座上那个东西，是炎魔。他还记得多少，我不知道。你先听他说完，再决定要不要拔剑。', 'sad'],";
const juNew = "['烛', '王座上那个东西，是裴炬。镇上后来叫他炎魔，再后来叫他魔王——名字越叫越远，人也越走越远。', 'sad'],";
if (s.indexOf(juOld) < 0) throw new Error('missing ju');
s = s.replace(juOld, juNew);

// 钟妖位次（原写「排第五」，名墙上他是第四位）
const duoOld = "['烛', '钟楼那位叫钟妖，排第五。他耳朵不好，心却最软。', 'sad'],";
const duoNew = "['烛', '钟楼那位，塔里叫他钟妖。他叫顾铎，排第四。耳朵不好，心却最软。', 'sad'],";
if (s.indexOf(duoOld) < 0) throw new Error('missing duo');
s = s.replace(duoOld, duoNew);

// 碑魔预告
const hengOld = "['烛', '上面就是碑魔的房间了。', 'calm'],";
const hengNew = "['烛', '上面就是宋铭的房间了。塔里叫他碑魔。', 'calm'],";
if (s.indexOf(hengOld) < 0) throw new Error('missing heng');
s = s.replace(hengOld, hengNew);

// 全局：烛→长明、秤→秦权、炎魔→裴炬
s = s.replace(/烛/g, '长明').replace(/秤/g, '秦权').replace(/炎魔/g, '裴炬');

// 头部角色表重写
s = s.replace(
  /^\/\/ 角色：.*$/m,
  '// 角色：勇者（公主被抓后独自进塔救人的人）、长明（第六位工匠，未签名的那个，塔拿不走他的名字）、\n//       裴炬（第一位工匠/炎魔/魔王）、薇拉（公主/续锁者）、秦权（第八位勇者的军需官/商人）、\n//       沈砚（第二位工匠/墨妖）、程冶（第三位工匠/锤魔）、顾铎（第四位工匠/钟妖）、宋铭（第五位工匠/碑魔）'
);
fs.writeFileSync(p('story.js'), s);
console.log('story.js ok');

// ---------- 其余文件：只做「作为角色名」的精确替换 ----------
const simple = [
  ['js/main.js', [["'烛'", "'长明'"], ["烛：", "长明："], ["**烛**", "**长明**"], ["'秤'", "'秦权'"], ["找秤", "找秦权"]]],
  ['js/view.js', [["'烛：'", "'长明：'"], ["'秤'", "'秦权'"]]],
  ['js/engine.js', [["秤把盾谱", "秦权把盾谱"], ["秤用绒布", "秦权用绒布"]]],
  ['js/achievements.js', [["在秤那里", "在秦权那里"]]],
];
for (const [f, rs] of simple) {
  let t = fs.readFileSync(f, 'utf8');
  for (const [a, b] of rs) t = t.split(a).join(b);
  fs.writeFileSync(f, t);
  console.log(f + ' ok');
}
