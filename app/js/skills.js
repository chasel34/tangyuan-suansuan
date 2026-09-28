// Grade 1-3 calculation skills (M1), following research/shuxue.md.
// Each skill: id, name (full), short (chip on the card), grade, sem ('a' 上册 / 'b' 下册),
// sys (加减 / 乘除 / 小数分数 / 其他), req (prerequisite ids), input (输入形式), gen [generator, params].

export const INPUT = {
  h: '横式',
  box: '□ 填空',
  vas: '竖式加减',
  vmul: '竖式乘法',
  rem: '商……余',
  vdiv: '除法竖式',
  vdec: '一位小数竖式',
  frac: '同分母分数',
};

export const SKILLS = [
  // ---------------------------------------------------------------- 一年级上册
  { id: 'g1a-compose', name: '10以内的分与合', short: '分与合', grade: 1, sem: 'a', sys: '加减', req: [], input: 'box', gen: ['compose', {}] },
  { id: 'g1a-add10', name: '10以内加法', short: '10以内加法', grade: 1, sem: 'a', sys: '加减', req: [], input: 'h', gen: ['add10', {}] },
  { id: 'g1a-sub10', name: '10以内减法', short: '10以内减法', grade: 1, sem: 'a', sys: '加减', req: ['g1a-add10'], input: 'h', gen: ['sub10', {}] },
  { id: 'g1a-chain10', name: '连加、连减、加减混合', short: '连加连减', grade: 1, sem: 'a', sys: '加减', req: ['g1a-sub10'], input: 'h', gen: ['chain', { max: 10, small: true }] },
  { id: 'g1a-teen', name: '十几加几、十几减几', short: '十几加减几', grade: 1, sem: 'a', sys: '加减', req: ['g1a-sub10'], input: 'h', gen: ['teen', {}] },
  { id: 'g1a-carry', name: '20以内进位加法', short: '进位加法', grade: 1, sem: 'a', sys: '加减', req: ['g1a-compose', 'g1a-add10'], input: 'h', gen: ['carry20', {}] },
  { id: 'g1a-missing', name: '逆向求□', short: '求□', grade: 1, sem: 'a', sys: '其他', req: ['g1a-carry'], input: 'box', gen: ['missing20', {}] },

  // ---------------------------------------------------------------- 一年级下册
  { id: 'g1b-borrow', name: '20以内退位减法', short: '退位减法', grade: 1, sem: 'b', sys: '加减', req: ['g1a-carry', 'g1a-teen'], input: 'h', gen: ['borrow20', {}] },
  { id: 'g1b-2d1', name: '两位数加减一位数、整十数（不进位不退位）', short: '两位数加减', grade: 1, sem: 'b', sys: '加减', req: ['g1a-teen'], input: 'h', gen: ['twoDigitSimple', {}] },
  { id: 'g1b-2d1c', name: '两位数加一位数（进位）', short: '进位加法', grade: 1, sem: 'b', sys: '加减', req: ['g1b-2d1', 'g1a-carry'], input: 'h', gen: ['add2d1carry', {}] },
  { id: 'g1b-2d1b', name: '两位数减一位数（退位）', short: '退位减法', grade: 1, sem: 'b', sys: '加减', req: ['g1b-2d1c', 'g1b-borrow'], input: 'h', gen: ['sub2d1borrow', {}] },
  { id: 'g1b-vadd2', name: '两位数加两位数笔算', short: '竖式加法', grade: 1, sem: 'b', sys: '加减', req: ['g1b-2d1c'], input: 'vas', gen: ['vadd', { da: 2, db: 2, max: 100 }] },
  { id: 'g1b-vsub2', name: '两位数减两位数笔算', short: '竖式减法', grade: 1, sem: 'b', sys: '加减', req: ['g1b-2d1b', 'g1b-vadd2'], input: 'vas', gen: ['vsub', { da: 2, db: 2 }] },
  { id: 'g1b-chain100', name: '100以内连加、连减、加减混合', short: '连加连减', grade: 1, sem: 'b', sys: '加减', req: ['g1b-vsub2'], input: 'h', gen: ['chain', { max: 100 }] },

  // ---------------------------------------------------------------- 二年级上册
  { id: 'g2a-kou5', name: '5的乘法口诀', short: '乘法口诀', grade: 2, sem: 'a', sys: '乘除', req: ['g1a-carry'], input: 'h', gen: ['kou', { tables: [5] }] },
  { id: 'g2a-kou234', name: '2、3、4的乘法口诀（含1）', short: '乘法口诀', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-kou5'], input: 'h', gen: ['kou', { tables: [1, 2, 3, 4] }] },
  { id: 'g2a-kou6', name: '6的乘法口诀', short: '乘法口诀', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-kou234'], input: 'h', gen: ['kou', { tables: [6] }] },
  { id: 'g2a-div6', name: '用2～6的乘法口诀求商', short: '表内除法', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-kou6'], input: 'h', gen: ['divTable', { divisors: [2, 3, 4, 5, 6], qmax: 6 }] },
  { id: 'g2a-kou789', name: '7、8、9的乘法口诀', short: '乘法口诀', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-kou6'], input: 'h', gen: ['kou', { tables: [7, 8, 9] }] },
  { id: 'g2a-kou-mix', name: '表内乘法综合', short: '乘法口诀', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-kou789'], input: 'h', gen: ['kouMix', {}] },
  { id: 'g2a-div9', name: '表内除法综合', short: '表内除法', grade: 2, sem: 'a', sys: '乘除', req: ['g2a-div6', 'g2a-kou-mix'], input: 'h', gen: ['divTable', { divisors: [1, 2, 3, 4, 5, 6, 7, 8, 9], qmax: 9 }] },

  // ---------------------------------------------------------------- 二年级下册
  { id: 'g2b-rem', name: '有余数的除法', short: '有余数的除法', grade: 2, sem: 'b', sys: '乘除', req: ['g2a-div9'], input: 'rem', gen: ['divRem', {}] },
  { id: 'g2b-vdivrem', name: '有余数除法竖式', short: '除法竖式', grade: 2, sem: 'b', sys: '乘除', req: ['g2b-rem', 'g1b-vsub2'], input: 'vdiv', gen: ['vdiv', { mode: 'rem1' }] },
  { id: 'g2b-oral', name: '整百整十数加减、两位数加减两位数口算', short: '口算加减', grade: 2, sem: 'b', sys: '加减', req: ['g1b-chain100'], input: 'h', gen: ['oralAddSub', {}] },
  { id: 'g2b-vadd3', name: '三位数加法笔算', short: '竖式加法', grade: 2, sem: 'b', sys: '加减', req: ['g1b-vadd2'], input: 'vas', gen: ['vadd', { da: 3, db: [2, 3], max: 1998, minCarries: 1 }] },
  { id: 'g2b-vsub3', name: '三位数减法笔算（隔位退位）', short: '竖式减法', grade: 2, sem: 'b', sys: '加减', req: ['g1b-vsub2', 'g2b-vadd3'], input: 'vas', gen: ['vsubZero', {}] },
  { id: 'g2b-missing', name: '求□（加减乘除各部分间的关系）', short: '求□', grade: 2, sem: 'b', sys: '其他', req: ['g1a-missing', 'g2b-oral', 'g2a-div9'], input: 'box', gen: ['missingAll', {}] },

  // ---------------------------------------------------------------- 三年级上册
  { id: 'g3a-mix2', name: '两步混合运算', short: '混合运算', grade: 3, sem: 'a', sys: '其他', req: ['g1b-chain100', 'g2a-div9'], input: 'h', gen: ['mix2', {}] },
  { id: 'g3a-oralmul', name: '整十、整百数乘一位数，两位数乘一位数口算', short: '口算乘法', grade: 3, sem: 'a', sys: '乘除', req: ['g2a-kou-mix'], input: 'h', gen: ['oralMul', {}] },
  { id: 'g3a-vmul21', name: '两位数乘一位数笔算', short: '竖式乘法', grade: 3, sem: 'a', sys: '乘除', req: ['g3a-oralmul', 'g1b-vadd2'], input: 'vmul', gen: ['vmul', { da: 2 }] },
  { id: 'g3a-vmul31', name: '三位数乘一位数笔算', short: '竖式乘法', grade: 3, sem: 'a', sys: '乘除', req: ['g3a-vmul21', 'g2b-vadd3'], input: 'vmul', gen: ['vmul', { da: 3 }] },
  { id: 'g3a-est', name: '估算', short: '估算', grade: 3, sem: 'a', sys: '其他', req: ['g3a-oralmul', 'g2b-oral'], input: 'h', gen: ['estimate', {}] },
  { id: 'g3a-fsame', name: '同分母分数加减（1以内）', short: '分数加减', grade: 3, sem: 'a', sys: '小数分数', req: ['g1a-chain10'], input: 'frac', gen: ['fracSame', {}] },
  { id: 'g3a-fof', name: '求一个数的几分之几是多少', short: '几分之几', grade: 3, sem: 'a', sys: '小数分数', req: ['g3a-fsame', 'g2a-div9'], input: 'h', gen: ['fracOf', {}] },

  // ---------------------------------------------------------------- 三年级下册
  { id: 'g3b-oraldiv', name: '口算除法', short: '口算除法', grade: 3, sem: 'b', sys: '乘除', req: ['g3a-oralmul'], input: 'h', gen: ['oralDiv', {}] },
  { id: 'g3b-vdiv21', name: '两位数除以一位数笔算', short: '除法竖式', grade: 3, sem: 'b', sys: '乘除', req: ['g3b-oraldiv', 'g2b-vdivrem'], input: 'vdiv', gen: ['vdiv', { mode: 'd21' }] },
  { id: 'g3b-vdiv31', name: '三位数除以一位数笔算', short: '除法竖式', grade: 3, sem: 'b', sys: '乘除', req: ['g3b-vdiv21', 'g2b-vsub3'], input: 'vdiv', gen: ['vdiv', { mode: 'd31' }] },
  { id: 'g3b-dec1', name: '一位小数加减', short: '小数加减', grade: 3, sem: 'b', sys: '小数分数', req: ['g1b-vadd2', 'g1b-vsub2'], input: 'vdec', gen: ['vdec', {}] },
];

export const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Depth in the prerequisite graph (0 = no prerequisites).
export const DEPTH = {};
for (const s of SKILLS) DEPTH[s.id] = depthOf(s.id);
function depthOf(id, seen = new Set()) {
  if (DEPTH[id] !== undefined) return DEPTH[id];
  if (seen.has(id)) throw new Error(`cycle at ${id}`);
  seen.add(id);
  const s = SKILL[id];
  if (!s) throw new Error(`unknown skill ${id}`);
  return s.req.length ? 1 + Math.max(...s.req.map((r) => depthOf(r, seen))) : 0;
}

// Textbook order: grade, then 上册 before 下册, then prerequisite depth, then definition order.
export const ORDER = SKILLS
  .map((s, i) => ({ s, i }))
  .sort((x, y) => x.s.grade - y.s.grade || x.s.sem.localeCompare(y.s.sem) || DEPTH[x.s.id] - DEPTH[y.s.id] || x.i - y.i)
  .map((x) => x.s.id);
export const ORDER_INDEX = Object.fromEntries(ORDER.map((id, i) => [id, i]));

export const skillsOfGrade = (g) => ORDER.filter((id) => SKILL[id].grade === g);
