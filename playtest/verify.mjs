// 汤圆算算 · 试玩方独立数学校验（round 1）
// 用法：node playtest/verify.mjs            （在 tangyuan-suansuan/ 下运行）
//       node playtest/verify.mjs --verbose  （打印每条失败）
//
// 只从 app/ 导入公开接口（generate / makeProblem / signature / makeRng、SKILLS、planBasic / planExtra、judge）。
// 答案、进位"1"、退位点、竖式乘法对齐、除法竖式每一轮、口诀、提示里的算式都用本文件自己的算法重算，
// 不使用 app 里的 _internal / carriesOf / borrowsOf / koujue。
import { generate, makeProblem, signature, makeRng } from '../app/js/problems.js';
import { SKILLS } from '../app/js/skills.js';
import { planBasic, planExtra } from '../app/js/session.js';
import { judge } from '../app/js/engine.js';

const VERBOSE = process.argv.includes('--verbose');
// 与实现方测试不同的种子（实现方用了 1,2,3,7,42,99,123,2024,31337,65535）。
const SEEDS = [11, 58, 404, 777, 1357, 2468, 8080, 9001, 12345, 54321];
const PER_SEED = 10; // 每个技能 10 × 10 = 100 题
const STRESS = 600; // 另外每个技能 600 题只做范围/覆盖统计

// ------------------------------------------------------------------ helpers
const digitsR = (s) => [...s].reverse(); // right-to-left
const CN = '零一二三四五六七八九';
const cnDigit = (ch) => CN.indexOf(ch);
const PLACE_INT = ['个位', '十位', '百位', '千位', '万位'];
const placeLabel = (j, P) => (P === 1 ? (j === 0 ? '十分位' : PLACE_INT[j - 1]) : PLACE_INT[j]);
const roundHalfUp = (n, u) => Math.floor((n + u / 2) / u) * u;
const toTenths = (s) => { const [i, f = ''] = s.split('.'); return Number(i) * 10 + (f ? Number(f) : 0); };
const fmtTenths = (t) => `${Math.floor(t / 10)}.${t % 10}`;

// 表达式求值（+ − × ÷ 括号，按运算顺序），返回每一步的中间结果。
function evalExpr(src) {
  const toks = src.replace(/\s+/g, '').match(/\d+|[+−×÷()]/g);
  let i = 0; const steps = [];
  const ap = (a, op, b) => { const v = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b; steps.push({ a, op, b, v }); return v; };
  const prim = () => { const t = toks[i++]; if (t === '(') { const v = sum(); if (toks[i++] !== ')') throw new Error('paren'); return v; } return Number(t); };
  const prod = () => { let v = prim(); while (toks[i] === '×' || toks[i] === '÷') { const op = toks[i++]; v = ap(v, op, prim()); } return v; };
  const sum = () => { let v = prod(); while (toks[i] === '+' || toks[i] === '−') { const op = toks[i++]; v = ap(v, op, prod()); } return v; };
  const v = sum();
  if (i !== toks.length) throw new Error(`parse ${src}`);
  return { v, steps, nums: toks.filter((t) => /\d/.test(t)).map(Number), ops: toks.filter((t) => /[+−×÷]/.test(t)), paren: toks.includes('(') };
}

// 口诀解析：三七二十一 → {x:3, y:7, p:21}
const KJ = /([一二三四五六七八九])([一二三四五六七八九])(得[一二三四五六七八九]|[一二三四五六七八九]?十[一二三四五六七八九]?)/g;
function parseKJ(tail) {
  if (tail[0] === '得') return cnDigit(tail[1]);
  const [t, o] = tail.split('十');
  return (t ? cnDigit(t) : 1) * 10 + (o ? cnDigit(o) : 0);
}

// 自己的长除法（中国竖式约定：商从第一个够除的数位开始；商 0 的一轮不写乘积；
// 中间正好减完时 0 不写；减完后落下的 0 直接商 0 不写（最后一位除外）；最后一行就是余数）。
function myDiv(D, d) {
  const s = String(D); let k = 1;
  while (k < s.length && Number(s.slice(0, k)) < d) k += 1;
  let cur = Number(s.slice(0, k)); let pos = k - 1; let exact = false;
  const toks = []; const rounds = [];
  for (;;) {
    const last = pos === s.length - 1;
    const q = Math.floor(cur / d);
    const rd = { pos, cur, q, m: null, rest: cur, restTyped: false };
    toks.push(String(q));
    if (q > 0) {
      rd.m = q * d; toks.push(...String(rd.m)); rd.rest = cur - rd.m;
      if (rd.rest > 0 || last) { toks.push(String(rd.rest)); rd.restTyped = true; exact = false; } else exact = true;
      cur = rd.rest;
    }
    rounds.push(rd);
    if (last) break;
    pos += 1;
    const nd = Number(s[pos]);
    if (exact && nd === 0 && pos !== s.length - 1) { cur = 0; continue; }
    cur = cur * 10 + nd; exact = false;
  }
  return { toks, rounds, q: Math.floor(D / d), r: D % d };
}

// 自己的进位列（从右数第几位上方写"1"）：只在更高一位有加数数字时写。
// round 2 更正：P 位小数时按竖式里**显示出来的**数字算，"0.8" 个位上的 0 也是加数的一位
// （round 1 用 String(A) 把这个 0 丢掉了，等于约定"进到 0. 那一位不写小 1"，这是脚本的错）。
function myCarries(A, B, P = 0) {
  const a = digitsR(String(A).padStart(P + 1, '0')).map(Number); const b = digitsR(String(B).padStart(P + 1, '0')).map(Number);
  const opLen = Math.max(a.length, b.length); const out = []; let c = 0;
  for (let j = 0; j < opLen; j++) { const s = (a[j] || 0) + (b[j] || 0) + c; c = s >= 10 ? 1 : 0; if (c && j + 1 < opLen) out.push({ from: j, at: j + 1 }); }
  return out;
}
// 自己的退位点：被借的那一位上方点"·"，连续 0 借穿时每个 0 也点。
function myBorrows(A, B, P = 0) {
  const a = digitsR(String(A).padStart(P + 1, '0')).map(Number); const b = digitsR(String(B).padStart(P + 1, '0')).map(Number);
  const out = [];
  for (let j = 0; j < a.length; j++) {
    if (a[j] < (b[j] || 0)) {
      let k = j + 1; const dots = [];
      while (a[k] === 0) { a[k] = 9; dots.push(k); k += 1; }
      a[k] -= 1; dots.push(k); a[j] += 10;
      out.push({ step: j, dots });
    }
  }
  return out;
}

// ------------------------------------------------------------------ grid readers
// 小数点和个位数字共用一格（画在右下角），网格里只放数字等内容格。
const gridOf = (p) => { const g = new Map(); for (const c of p.cells) if (c.text !== '.') g.set(`${c.r},${c.c}`, c); return g; };
const cellById = (p, id) => p.cells.find((c) => c.id === id);
function rowDigits(p, r, kinds) {
  return p.cells.filter((c) => c.r === r && kinds.includes(c.kind) && /^\d$/.test(c.text)).sort((x, y) => x.c - y.c);
}
// 从 (r, c) 往左读连续的数字格（排除除数 dv）。
function readLeft(p, g, r, c) {
  let s = '';
  for (let x = c; x >= 0; x--) {
    const cell = g.get(`${r},${x}`);
    if (!cell || cell.id === 'dv' || !/^\d$/.test(cell.text) || !['given', 'input', 'auto', 'pad'].includes(cell.kind)) break;
    s = cell.text + s;
  }
  return s;
}

// ------------------------------------------------------------------ independent solver (from the displayed text)
function solve(p) {
  const t = p.text; let m;
  if ((m = t.match(/^(\d+) 可以分成 (\d+) 和 □$/))) return { v: Number(m[1]) - Number(m[2]), total: +m[1], a: +m[2] };
  if ((m = t.match(/^(\d+) 和 □ 组成 (\d+)$/))) return { v: Number(m[2]) - Number(m[1]), total: +m[2], a: +m[1] };
  if (t.includes('□') && t.includes('=')) {
    const [lhs, rhs] = t.split('=').map((x) => x.trim());
    const sols = [];
    for (let x = 0; x <= 2000; x++) { const e = evalExpr(lhs.replace('□', String(x))); if (Number.isInteger(e.v) && e.v === Number(rhs)) sols.push(x); }
    return { v: sols.length === 1 ? sols[0] : NaN, sols, rhs: Number(rhs), lhs };
  }
  if (t.endsWith('≈ □')) {
    const [, a, op, b] = t.match(/^(\d+) ([+−×]) (\d+) ≈ □$/);
    const note = p.note || '';
    let ra; let rb; let rule;
    if (/每个数四舍五入到整十/.test(note)) { ra = roundHalfUp(+a, 10); rb = roundHalfUp(+b, 10); rule = 'each10'; }
    else if (/每个数四舍五入到整百/.test(note)) { ra = roundHalfUp(+a, 100); rb = roundHalfUp(+b, 100); rule = 'each100'; }
    else if (/两位数四舍五入到整十/.test(note)) { ra = roundHalfUp(+a, 10); rb = +b; rule = 'two10'; if (String(+a).length !== 2) return { v: NaN, why: 'rule says 两位数 but a is not 2-digit' }; }
    else if (/三位数四舍五入到整百/.test(note)) { ra = roundHalfUp(+a, 100); rb = +b; rule = 'three100'; if (String(+a).length !== 3) return { v: NaN, why: 'rule says 三位数 but a is not 3-digit' }; }
    else return { v: NaN, why: `unknown note ${note}` };
    const v = op === '+' ? ra + rb : op === '−' ? ra - rb : ra * rb;
    return { v, a: +a, b: +b, op, ra, rb, rule };
  }
  if ((m = t.match(/^(\d+) 的 (\d+)\/(\d+)$/))) { const w = +m[1]; const n = +m[2]; const d = +m[3]; return { v: (w * n) / d, w, n, d }; }
  if (t.includes('/')) {
    const terms = t.split(/ ([+−]) /);
    const fr = (s) => (s.includes('/') ? s.split('/').map(Number) : [Number(s), 1]);
    const [n1, d1] = fr(terms[0]); const op = terms[1]; const [n2, d2] = fr(terms[2]);
    const d = d1 === 1 ? d2 : d1; // 1 − n/d：把 1 看成 d/d
    const N1 = d1 === 1 ? n1 * d : n1;
    if (d2 !== d) return { v: NaN, why: 'different denominators' };
    const rn = op === '+' ? N1 + n2 : N1 - n2;
    return { v: `${rn}/${d}`, rn, d, n1: N1, n2, op, one: d1 === 1 };
  }
  if (t.includes('.')) {
    const [a, op, b] = t.split(' ');
    const A = toTenths(a); const B = toTenths(b);
    const R = op === '+' ? A + B : A - B;
    return { v: fmtTenths(R), A, B, R, op, a, b };
  }
  const e = evalExpr(t);
  return { v: e.v, e };
}

// ------------------------------------------------------------------ per-skill range rules (research/shuxue.md)
const isTen = (n) => n % 10 === 0; const isHund = (n) => n % 100 === 0;
function rangeCheck(p, s) {
  const id = p.skill; const e = s.e; const t = p.text;
  const n = e ? e.nums : []; const ops = e ? e.ops : [];
  const bad = (why) => why;
  switch (id) {
    case 'g1a-compose': return s.total >= 2 && s.total <= 10 && s.a >= 0 && s.v >= 0 ? null : bad('总数应在 2～10');
    case 'g1a-add10': return ops[0] === '+' && n.every((x) => x >= 0 && x <= 9) && e.v <= 10 ? null : bad('a,b∈0～9 且和≤10');
    case 'g1a-sub10': return ops[0] === '−' && n[0] <= 10 && e.v >= 0 ? null : bad('被减数≤10');
    case 'g1a-chain10': return n.length === 3 && e.steps.every((x) => x.v >= 0 && x.v <= 10) ? null : bad('三个数、每步结果 0～10');
    case 'g1a-teen': {
      const [a, b] = n; const op = ops[0];
      if (n.length !== 2) return bad('两个数');
      if (op === '+') { const teen = a >= 10 ? a : b; const one = a >= 10 ? b : a; if (!(teen >= 10 && teen <= 19 && one >= 1 && one <= 9 && (teen % 10) + one <= 9)) return bad('十几加几不进位'); }
      else if (!(a >= 11 && a <= 19 && b >= 1 && b <= 9 && (a % 10) >= b)) return bad('十几减几不退位');
      return e.v >= 10 && e.v <= 19 ? null : bad('结果应在 10～19');
    }
    case 'g1a-carry': return ops[0] === '+' && n.every((x) => x >= 2 && x <= 9) && e.v >= 11 ? null : bad('a,b∈2～9，和≥11');
    case 'g1a-missing': return s.rhs <= 20 && s.v >= 0 && /\+/.test(t) ? null : bad('□+a=b，b≤20');
    case 'g1b-borrow': return ops[0] === '−' && n[0] >= 11 && n[0] <= 18 && n[1] >= 2 && n[1] <= 9 && (n[0] % 10) < n[1] ? null : bad('11～18 减 2～9 且个位不够减');
    case 'g1b-2d1': {
      const [a, b] = n; const op = ops[0];
      if (op === '+') { if ((a % 10) + (b % 10) > 9 || e.v > 100) return bad('不进位'); }
      else if ((a % 10) < (b % 10) || e.v < 0) return bad('不退位');
      const ok = (isTen(a) && isTen(b)) || (a >= 10 && a <= 99 && ((b >= 1 && b <= 9) || (isTen(b) && b <= 90)));
      return ok ? null : bad('形式应为整十±整十、两位数±一位数/整十数');
    }
    case 'g1b-2d1c': return ops[0] === '+' && n[0] >= 10 && n[0] <= 99 && n[1] >= 1 && n[1] <= 9 && (n[0] % 10) + n[1] >= 10 && e.v <= 100 ? null : bad('两位数+一位数且进位');
    case 'g1b-2d1b': return ops[0] === '−' && n[0] >= 10 && n[0] <= 99 && n[1] >= 1 && n[1] <= 9 && (n[0] % 10) < n[1] ? null : bad('两位数−一位数且退位');
    case 'g1b-vadd2': return ops[0] === '+' && n.every((x) => x >= 10 && x <= 99) && e.v <= 100 ? null : bad('两位数+两位数，和≤100');
    case 'g1b-vsub2': return ops[0] === '−' && n.every((x) => x >= 10 && x <= 99) && e.v >= 0 ? null : bad('两位数−两位数');
    case 'g1b-chain100': return n.length === 3 && e.steps.every((x) => x.v >= 0 && x.v <= 100) ? null : bad('三个数、结果 0～100');
    case 'g2a-kou5': return ops[0] === '×' && n.includes(5) && Math.min(...n) >= 1 && Math.max(...n) <= 5 ? null : bad('1～5 × 5');
    case 'g2a-kou234': return ops[0] === '×' && Math.max(...n) <= 4 && Math.min(...n) >= 1 ? null : bad('a≤b，b∈{1,2,3,4}');
    case 'g2a-kou6': return ops[0] === '×' && n.includes(6) && Math.max(...n) <= 6 && Math.min(...n) >= 1 ? null : bad('1～6 × 6');
    case 'g2a-div6': return ops[0] === '÷' && n[1] >= 2 && n[1] <= 6 && Number.isInteger(e.v) && e.v >= 1 && e.v <= 6 ? null : bad('除数2～6，商≤6');
    case 'g2a-kou789': return ops[0] === '×' && [7, 8, 9].includes(Math.max(...n)) && Math.min(...n) >= 1 ? null : bad('a≤b，b∈{7,8,9}');
    case 'g2a-kou-mix': return ops[0] === '×' && n.every((x) => x >= 1 && x <= 9) ? null : bad('9×9以内');
    case 'g2a-div9': return ops[0] === '÷' && n[1] >= 1 && n[1] <= 9 && Number.isInteger(e.v) && e.v >= 1 && e.v <= 9 ? null : bad('除数、商都在1～9');
    case 'g2b-rem': case 'g2b-vdivrem': {
      const [D, d] = t.split(' ÷ ').map(Number); const q = Math.floor(D / d); const r = D % d;
      if (!(d >= 2 && d <= 9 && q >= 1 && q <= 9 && r < d)) return bad('除数2～9，商一位，余数<除数');
      if (id === 'g2b-rem' && r === 0) return bad('有余数的除法却没有余数');
      if (id === 'g2b-vdivrem' && !(D >= 10 && D <= 99)) return bad('两位数÷一位数');
      return null;
    }
    case 'g2b-oral': {
      const [a, b] = n; const op = ops[0];
      const hund = isHund(a) && isHund(b) && a >= 100 && b >= 100;
      const tens = isTen(a) && isTen(b) && a >= 100 && !isHund(a) && b <= 90 && op === '+' && Math.floor(a / 10) % 10 + b / 10 <= 9;
      const two = a >= 10 && a <= 99 && b >= 10 && b <= 99 && e.v >= 0 && e.v <= 100;
      return hund || tens || two ? null : bad('整百±整百、几百几十+整十、两位数±两位数（≤100）');
    }
    case 'g2b-vadd3': return ops[0] === '+' && n[0] >= 100 && n[0] <= 999 && n[1] >= 10 && n[1] <= 999 && myCarries(n[0], n[1]).length + ((n[0] + n[1]) >= 1000 ? 1 : 0) >= 1 ? null : bad('三位数+两/三位数，含进位');
    case 'g2b-vsub3': {
      if (!(ops[0] === '−' && n[0] >= 100 && n[0] <= 999 && n[1] < n[0])) return bad('三位数减法');
      const zeroLend = myBorrows(n[0], n[1]).some((b) => b.dots.some((k) => digitsR(String(n[0])).map(Number)[k] === 0));
      return zeroLend ? null : bad('应出现隔位退位（被减数的 0 被借穿）');
    }
    case 'g2b-missing': {
      if (!(s.sols && s.sols.length === 1)) return bad('□ 解不唯一');
      if (/[×÷]/.test(t)) { const nums = [...t.matchAll(/\d+/g)].map((x) => +x[0]); const small = nums.filter((x) => x <= 9); return small.length >= 1 && s.v >= 1 ? null : bad('乘除应是表内'); }
      return Math.max(s.v, s.rhs, ...[...t.matchAll(/\d+/g)].map((x) => +x[0])) <= 100 ? null : bad('加减应在 100 以内');
    }
    case 'g3a-mix2': return e.steps.length === 2 && e.steps.every((x) => Number.isInteger(x.v) && x.v >= 0) && e.v <= 100 && (e.paren || new Set(e.ops.map((o) => '+−'.includes(o) ? 1 : 2)).size === 2 || true) ? null : bad('两步、中间结果都是整数');
    case 'g3a-oralmul': { const [a, b] = n; return ops[0] === '×' && b >= 2 && b <= 9 && ((isTen(a) && a <= 90) || (isHund(a) && a <= 900) || (a >= 11 && a <= 99)) ? null : bad('整十/整百/两位数 × 一位数'); }
    case 'g3a-vmul21': return ops[0] === '×' && n[0] >= 10 && n[0] <= 99 && n[1] >= 2 && n[1] <= 9 ? null : bad('两位数×一位数');
    case 'g3a-vmul31': return ops[0] === '×' && n[0] >= 100 && n[0] <= 999 && n[1] >= 2 && n[1] <= 9 ? null : bad('三位数×一位数');
    case 'g3a-est': return Number.isFinite(s.v) && s.v > 0 ? null : bad(s.why || '估算结果');
    case 'g3a-fsame': return s.d >= 2 && s.d <= 12 && s.rn >= 1 && s.rn <= s.d && s.n2 >= 1 ? null : bad('分母2～12，和≤1');
    case 'g3a-fof': return Number.isInteger(s.v) && s.n < s.d ? null : bad('结果为整数');
    case 'g3b-oraldiv': {
      const [D, d] = n; if (!(ops[0] === '÷' && d >= 2 && d <= 9 && Number.isInteger(e.v))) return bad('整除、除数一位');
      const ok = isHund(D) || isTen(D) || (D >= 10 && D <= 99 && Math.floor(D / 10) % d === 0 && (D % 10) % d === 0);
      return ok ? null : bad('60÷3、600÷3、42÷2、480÷4 这几类');
    }
    case 'g3b-vdiv21': { const [D, d] = n; return D >= 10 && D <= 99 && d >= 2 && d <= 9 && Math.floor(D / d) >= 10 ? null : bad('两位数÷一位数，商两位'); }
    case 'g3b-vdiv31': { const [D, d] = n; return D >= 100 && D <= 999 && d >= 2 && d <= 9 ? null : bad('三位数÷一位数'); }
    case 'g3b-dec1': {
      const ok = s.R >= 0 && s.A <= 999 && s.B <= 999 && (s.A % 10 !== 0 || !s.a.includes('.')) && s.b.includes('.');
      return ok ? null : bad('0.x～99.x，一位小数');
    }
    default: return `no range rule for ${id}`;
  }
}

// 覆盖（分类）标签，用来确认规则里要求的各档都会出现。
function category(p, s) {
  const id = p.skill; const t = p.text; const n = s.e ? s.e.nums : [];
  switch (id) {
    case 'g1b-vadd2': return myCarries(n[0], n[1]).length ? '进位' : '不进位';
    case 'g1b-vsub2': return myBorrows(n[0], n[1]).length ? '退位' : '不退位';
    case 'g2b-vadd3': { const c = myCarries(n[0], n[1]).length + (n[0] + n[1] >= 1000 ? 1 : 0); return c >= 2 ? '连续/多次进位' : '一次进位'; }
    case 'g2b-vsub3': return /^\d0\d$/.test(String(n[0])) ? (String(n[0]).endsWith('00') ? '整百减' : '中间有0') : '其他';
    case 'g3a-vmul31': { const a = String(n[0]); return a.endsWith('0') ? '末尾有0' : a[1] === '0' ? '中间有0' : '连续进位'; }
    case 'g3b-vdiv31': {
      const [D, d] = n; const q = String(Math.floor(D / d));
      if (q.endsWith('0')) return '商末尾有0';
      if (q.length === 3 && q[1] === '0') return '商中间有0';
      return Math.floor(D / 100) >= d ? '首位够除' : '首位不够除';
    }
    case 'g3b-vdiv21': return Number(t.split(' ÷ ')[0]) % Number(t.split(' ÷ ')[1]) ? '有余数' : '无余数';
    case 'g3a-fsame': return s.one ? '1−几分之几' : s.op === '+' ? '加' : '减';
    case 'g3b-dec1': return `${!s.a.includes('.') ? '整数−小数' : s.op === '+' ? '加' : '减'}${Math.min(s.A, s.B) < 10 ? '（含 0.x）' : ''}`;
    case 'g1b-2d1': return s.e.v === 100 ? '整十+整十=100' : null;
    case 'g3a-est': return s.rule;
    case 'g2b-missing': return t.replace(/\d+/g, 'n');
    case 'g3a-mix2': return t.replace(/\d+/g, 'n');
    default: return null;
  }
}

// ------------------------------------------------------------------ hint-text arithmetic
function checkHintText(text, errs, tag) {
  // 1) 连加连减 / 单个乘除：a op b (op c …) = r
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)((?:\s[+−×÷]\s\d+(?:\.\d+)?)+)\s=\s(\d+(?:\.\d+)?)/g)) {
    const expr = `${m[1]}${m[2]}`;
    const toks = expr.split(' ');
    let v = Number(toks[0]);
    for (let i = 1; i < toks.length; i += 2) { const b = Number(toks[i + 1]); const op = toks[i]; v = op === '+' ? v + b : op === '−' ? v - b : op === '×' ? v * b : v / b; }
    if (Math.abs(v - Number(m[3])) > 1e-9) errs.push(`${tag} 提示算式错：「${m[0]}」`);
  }
  // 2) 口诀本身
  for (const m of text.matchAll(KJ)) {
    const x = cnDigit(m[1]); const y = cnDigit(m[2]); const prod = parseKJ(m[3]);
    if (x > y) errs.push(`${tag} 口诀小数没在前：${m[0]}`);
    if (x * y !== prod) errs.push(`${tag} 口诀错：${m[0]}`);
    if (x * y < 10 && m[3][0] !== '得') errs.push(`${tag} 口诀一位积应读"得"：${m[0]}`);
  }
  // 3) "a × b = c（口诀）" 口诀因数要对上
  for (const m of text.matchAll(/(\d) × (\d) = (\d+)（([^）]+)）/g)) {
    const km = [...m[4].matchAll(KJ)][0];
    if (!km) { errs.push(`${tag} 缺口诀：${m[0]}`); continue; }
    const f = [cnDigit(km[1]), cnDigit(km[2])].sort(); const g = [Number(m[1]), Number(m[2])].sort();
    if (f[0] !== g[0] || f[1] !== g[1]) errs.push(`${tag} 口诀因数对不上：${m[0]}`);
  }
  // 4) 再加进位 c 得 v
  for (const m of text.matchAll(/= (\d+)（[^）]*），再加进位 (\d+) 得 (\d+)/g)) if (Number(m[1]) + Number(m[2]) !== Number(m[3])) errs.push(`${tag} 进位相加错：${m[0]}`);
  // 5) "v …，写 x，向…进 y"
  for (const m of text.matchAll(/(?:=|得) (\d+)(?:（[^）]*）)?，写 (\d)(?:，向\S+?进 (\d))?/g)) {
    const v = Number(m[1]);
    if (v % 10 !== Number(m[2])) errs.push(`${tag} "写几"错：${m[0]}`);
    if (m[3] && Math.floor(v / 10) !== Number(m[3])) errs.push(`${tag} "进几"错：${m[0]}`);
  }
  // 6) 估算：a ≈ ra
  for (const m of text.matchAll(/(\d+) ≈ (\d+)/g)) {
    const a = Number(m[1]); const r = Number(m[2]);
    const u = String(r).length >= 3 && r % 100 === 0 && String(a).length === 3 ? 100 : 10;
    if (roundHalfUp(a, u) !== r) errs.push(`${tag} 估算取整错：${m[0]}`);
  }
  // 8) 计数单位："6 个十加 3 个十是 9 个十"、"12 个百减 5 个百是 7 个百"、"1 个十和 4 个一合起来是 14"、"6 个十 ÷ 3 = 2 个十，是 20"
  for (const m of text.matchAll(/(\d+) 个([十百])([加减]) (\d+) 个[十百]是 (\d+) 个[十百]/g)) if ((m[3] === '加' ? +m[1] + +m[4] : +m[1] - +m[4]) !== +m[5]) errs.push(`${tag} 计数单位算错：${m[0]}`);
  for (const m of text.matchAll(/(\d+) 个([十一])和 (\d+) 个([十一])合起来是 (\d+)/g)) { const v = (m[2] === '十' ? 10 : 1) * +m[1] + (m[4] === '十' ? 10 : 1) * +m[3]; if (v !== +m[5]) errs.push(`${tag} 合起来算错：${m[0]}`); }
  for (const m of text.matchAll(/(\d+) 个([十百]) ÷ (\d) = (\d+) 个[十百]，是 (\d+)/g)) { const u = m[2] === '十' ? 10 : 100; if (+m[1] / +m[3] !== +m[4] || +m[4] * u !== +m[5]) errs.push(`${tag} 口算除法算错：${m[0]}`); }
  for (const m of text.matchAll(/(\d+) 比 (\d) 小，不够商 1/g)) if (!(+m[1] < +m[2])) errs.push(`${tag} "不够商 1"错：${m[0]}`);
  for (const m of text.matchAll(/(\d+) 末尾有 (\d) 个 0/g)) if ((m[1].match(/0+$/) || [''])[0].length !== +m[2]) errs.push(`${tag} 末尾 0 个数错：${m[0]}`);
  // 7) 试商："d 乘几最接近 cur 又不超过它？…商 q"
  for (const m of text.matchAll(/(\d) 乘几最接近 (\d+) 又不超过它？.*?商 (\d)/g)) {
    const d = +m[1]; const cur = +m[2]; const q = +m[3];
    if (!(q * d <= cur && (q + 1) * d > cur)) errs.push(`${tag} 试商错：${m[0]}`);
  }
}

// ------------------------------------------------------------------ one problem
function checkProblem(p, errs) {
  const tag = `[${p.skill}] ${p.text}`;
  let s;
  try { s = solve(p); } catch (err) { errs.push(`${tag} 无法解析题面：${err.message}`); return null; }
  const input = SKILLS.find((k) => k.id === p.skill).input;

  // 1. 答案
  let expAnswer;
  if (p.kind === 'div' || p.skill === 'g2b-rem') {
    const [D, d] = p.text.split(' ÷ ').map(Number); const q = Math.floor(D / d); const r = D % d;
    expAnswer = r ? `${q}……${r}` : String(q); s.D = D; s.d = d; s.q = q; s.r = r;
  } else expAnswer = String(s.v);
  if (p.answer !== expAnswer) errs.push(`${tag} 答案错：显示 ${p.answer}，应为 ${expAnswer}`);
  if (!p.answerText.replace(/\s/g, '').includes(expAnswer.replace(/\s/g, ''))) errs.push(`${tag} answerText 与答案不符：${p.answerText}`);

  // 2. 输入 token 顺序
  let expToks;
  if (input === 'h' || input === 'box') expToks = [...String(s.v)];
  else if (input === 'rem') expToks = [...String(s.q), ...String(s.r)];
  else if (input === 'frac') expToks = [...String(s.d), ...String(s.rn)];
  else if (input === 'vas') { const [a, op, b] = p.text.split(' '); expToks = digitsR(String(op === '+' ? +a + +b : +a - +b)); }
  else if (input === 'vdec') { expToks = digitsR(String(s.R).padStart(2, '0')); }
  else if (input === 'vmul') { const [a, , b] = p.text.split(' '); expToks = digitsR(String(+a * +b)); }
  else if (input === 'vdiv') expToks = myDiv(s.D, s.d).toks;
  const got = p.answers[0];
  if (p.answers.length !== 1) errs.push(`${tag} 合法答案组数 ${p.answers.length}（M1 预期 1）`);
  if (JSON.stringify(got) !== JSON.stringify(expToks)) errs.push(`${tag} 输入序列错：${got.join('')}，应为 ${expToks.join('')}`);

  // 3. 判定引擎：每一步只有正确的数字被接受，最后一步才 done
  let typed = [];
  for (let i = 0; i < got.length; i++) {
    for (let dgt = 0; dgt <= 9; dgt++) {
      const r = judge(p.answers, typed, String(dgt));
      const should = String(dgt) === expToks[i];
      if (r.ok !== should) { errs.push(`${tag} 判定错：第 ${i + 1} 步按 ${dgt} → ok=${r.ok}`); break; }
      if (r.ok && r.done !== (i === got.length - 1)) errs.push(`${tag} done 时机错：第 ${i + 1} 步`);
    }
    typed = [...typed, got[i]];
  }

  // 4. 每步格子文字 = token
  for (const st of p.steps) { const c = cellById(p, st.cell); if (!c || c.text !== st.token || c.kind !== 'input') errs.push(`${tag} 步骤格子与 token 不符 ${st.cell}`); }

  // 5. 版式
  const g = gridOf(p);
  if (p.kind === 'add' || p.kind === 'sub') {
    const P = p.text.includes('.') ? 1 : 0;
    const [aS, op, bS] = p.text.split(' ');
    const A = P ? toTenths(aS) : +aS; const B = P ? toTenths(bS) : +bS; const R = op === '+' ? A + B : A - B;
    const r1 = rowDigits(p, 1, ['given', 'pad']); const r2 = rowDigits(p, 2, ['given', 'pad']); const r3 = rowDigits(p, 3, ['input']);
    const right = Math.max(...r1.map((c) => c.c));
    const col = (j) => right - j;
    if (Number(r1.map((c) => c.text).join('')) !== A) errs.push(`${tag} 第一行读数 ≠ ${A}`);
    if (Number(r2.map((c) => c.text).join('')) !== B) errs.push(`${tag} 第二行读数 ≠ ${B}`);
    if (Number(r3.map((c) => c.text).join('')) !== R) errs.push(`${tag} 得数行读数 ≠ ${R}`);
    for (const row of [r1, r2, r3]) if (Math.max(...row.map((c) => c.c)) !== right) errs.push(`${tag} 各行末位没对齐`);
    if (!p.cells.some((c) => c.kind === 'op' && c.r === 2 && c.text === op)) errs.push(`${tag} 运算符不在第二行`);
    if (P) {
      const pts = p.cells.filter((c) => c.text === '.');
      if (pts.length !== 3 || !pts.every((c) => c.c === col(1))) errs.push(`${tag} 小数点没对齐（应都在个位右下）`);
      const auto = pts.find((c) => c.r === 3);
      const revealStep = p.steps.findIndex((st) => st.reveal.includes(auto.id));
      if (revealStep !== 0) errs.push(`${tag} 得数小数点应在十分位写完后出现（实际第 ${revealStep + 1} 步）`);
    }
    // 步骤从个位（或十分位）开始、每步在第 j 位
    p.steps.forEach((st, j) => {
      const c = cellById(p, st.cell);
      if (c.c !== col(j)) errs.push(`${tag} 第 ${j + 1} 步不在第 ${j} 位`);
      if (st.label !== placeLabel(j, P)) errs.push(`${tag} 第 ${j + 1} 步标签"${st.label}"应为"${placeLabel(j, P)}"`);
      for (const hid of st.help.ids) { const hc = cellById(p, hid); if (hc && ['given', 'pad', 'carry'].includes(hc.kind) && hc.c !== c.c) errs.push(`${tag} 第二级提示高亮了别的列 ${hid}`); }
    });
    if (p.kind === 'add') {
      const exp = myCarries(A, B, P);
      const marks = p.cells.filter((c) => c.kind === 'carry');
      const expCols = exp.map((x) => col(x.at)).sort(); const gotCols = marks.map((c) => c.c).sort();
      if (JSON.stringify(expCols) !== JSON.stringify(gotCols)) errs.push(`${tag} 进位"1"位置错：${gotCols}，应为 ${expCols}`);
      for (const m of marks) if (m.r !== 0 || m.text !== '1') errs.push(`${tag} 进位标记应在上方写小"1"`);
      for (const x of exp) {
        const mk = marks.find((c) => c.c === col(x.at)); if (!mk) continue;
        const k = p.steps.findIndex((st) => st.reveal.includes(mk.id));
        if (k !== x.from) errs.push(`${tag} 进位"1"出现时机错：应在第 ${x.from + 1} 步写完后，实际第 ${k + 1} 步`);
        if (p.steps.some((st) => st.show.includes(mk.id))) errs.push(`${tag} 进位"1"提前显示`);
      }
    } else {
      const exp = myBorrows(A, B, P);
      const dots = p.cells.filter((c) => c.kind === 'dot');
      const expCols = exp.flatMap((x) => x.dots.map(col)).sort(); const gotCols = dots.map((c) => c.c).sort();
      if (JSON.stringify(expCols) !== JSON.stringify(gotCols)) errs.push(`${tag} 退位点位置错：${gotCols}，应为 ${expCols}`);
      for (const d of dots) if (d.r !== 0 || d.text !== '·') errs.push(`${tag} 退位点应点在被减数上方`);
      for (const x of exp) for (const k of x.dots) {
        const dt = dots.find((c) => c.c === col(k)); if (!dt) continue;
        const si = p.steps.findIndex((st) => st.show.includes(dt.id));
        if (si !== x.step) errs.push(`${tag} 退位点出现时机错：应在第 ${x.step + 1} 步，实际第 ${si + 1} 步`);
        // 点在被减数数字正上方
        const under = g.get(`1,${dt.c}`);
        if (!under || !/^\d$/.test(under.text)) errs.push(`${tag} 退位点下面不是被减数的数字`);
      }
    }
  }
  if (p.kind === 'mul') {
    const [aS, , bS] = p.text.split(' '); const a = +aS; const b = +bS;
    const r0 = rowDigits(p, 0, ['given']); const r2 = rowDigits(p, 2, ['input']);
    const right = Math.max(...r0.map((c) => c.c));
    const tz = (aS.match(/0+$/) || [''])[0].length;
    const bc = cellById(p, 'b');
    if (Number(r0.map((c) => c.text).join('')) !== a) errs.push(`${tag} 被乘数行读数错`);
    if (Number(r2.map((c) => c.text).join('')) !== a * b) errs.push(`${tag} 积行读数错`);
    if (Math.max(...r2.map((c) => c.c)) !== right) errs.push(`${tag} 积与被乘数末位没对齐`);
    if (!bc || bc.text !== bS || bc.r !== 1 || bc.c !== right - tz) errs.push(`${tag} 乘数位置错：应对齐被乘数${tz ? '最后一个非 0 数字' : '个位'}`);
    p.steps.forEach((st, j) => {
      const c = cellById(p, st.cell);
      if (c.c !== right - j) errs.push(`${tag} 第 ${j + 1} 步列错`);
      if (j < tz && st.label !== '末尾的 0') errs.push(`${tag} 末尾 0 的标签错`);
      for (const hid of st.help.ids) { const hc = cellById(p, hid); if (hc && hid !== 'b' && hc.c !== c.c) errs.push(`${tag} 提示高亮了别的列`); }
    });
  }
  if (p.kind === 'div') {
    const { D, d } = s; const md = myDiv(D, d);
    const Dcells = p.cells.filter((c) => /^D\d+$/.test(c.id)).sort((x, y) => x.c - y.c);
    if (Dcells.map((c) => c.text).join('') !== String(D) || !Dcells.every((c) => c.r === 1)) errs.push(`${tag} 被除数行错`);
    const dv = cellById(p, 'dv');
    if (!dv || dv.text !== String(d) || dv.r !== 1 || dv.c >= Dcells[0].c) errs.push(`${tag} 除数应在被除数左边`);
    if (!p.bracket || p.bracket.r !== 1 || p.bracket.c0 !== Dcells[0].c || p.bracket.c1 !== Dcells.at(-1).c) errs.push(`${tag} "厂"形框没盖住被除数`);
    // 按步骤标签切分每一轮
    const rounds = []; let cur = null;
    for (const st of p.steps) {
      const c = cellById(p, st.cell);
      if (st.label === '商') { cur = { q: c, prod: [], rest: null }; rounds.push(cur); }
      else if (st.label === '积') cur.prod.push(c);
      else if (st.label === '相减' || st.label === '余数') cur.rest = { c, label: st.label };
      else errs.push(`${tag} 未知步骤标签 ${st.label}`);
    }
    const qStr = rounds.map((r) => r.q.text).join('');
    if (qStr !== String(md.q)) errs.push(`${tag} 商读数 ${qStr} ≠ ${md.q}`);
    if (qStr.length > 1 && qStr[0] === '0') errs.push(`${tag} 商有前导 0`);
    if (rounds.length !== md.rounds.length) errs.push(`${tag} 轮数 ${rounds.length} ≠ ${md.rounds.length}`);
    rounds.forEach((r, i) => {
      const m = md.rounds[i]; if (!m) return;
      const dcol = Dcells[m.pos].c;
      if (r.q.r !== 0 || r.q.c !== dcol) errs.push(`${tag} 第 ${i + 1} 轮商没写在对应数位上方`);
      if (Number(r.q.text) !== m.q) errs.push(`${tag} 第 ${i + 1} 轮商 ${r.q.text} ≠ ${m.q}`);
      if (m.q > 0) {
        const prodStr = r.prod.map((c) => c.text).join('');
        if (Number(prodStr) !== m.q * d) errs.push(`${tag} 第 ${i + 1} 轮积 ${prodStr} ≠ ${m.q}×${d}`);
        if (!r.prod.length || r.prod.at(-1).c !== dcol || new Set(r.prod.map((c) => c.r)).size !== 1) errs.push(`${tag} 第 ${i + 1} 轮积没和商对齐`);
        const pr = r.prod[0].r;
        const above = readLeft(p, g, pr - 1, dcol);
        if (Number(above) !== m.cur) errs.push(`${tag} 第 ${i + 1} 轮被减数读数 ${above} ≠ ${m.cur}`);
        if (!p.lines.some((l) => l.r === pr && l.c1 === dcol && l.c0 <= dcol - String(m.cur).length + 1)) errs.push(`${tag} 第 ${i + 1} 轮积下面缺横线`);
        const rest = m.cur - m.q * d;
        if (rest < 0 || rest >= d) errs.push(`${tag} 第 ${i + 1} 轮余数 ${rest} 不满足 0≤余数<除数`);
        if (m.restTyped) {
          if (!r.rest || Number(r.rest.c.text) !== rest || r.rest.c.c !== dcol || r.rest.c.r !== pr + 1) errs.push(`${tag} 第 ${i + 1} 轮相减结果位置/数值错`);
        } else if (r.rest) errs.push(`${tag} 第 ${i + 1} 轮中间余 0 不该写`);
      } else if (r.prod.length || r.rest) errs.push(`${tag} 第 ${i + 1} 轮商 0 却要写积/余数`);
    });
    // 最后一行就是余数
    const lastR = md.rounds.at(-1); const lastCol = Dcells.at(-1).c;
    let finalRow;
    if (lastR.q > 0) finalRow = rounds.at(-1).prod[0].r + 1;
    else finalRow = Math.max(...p.cells.filter((c) => c.c === lastCol && c.r > 1 && /^\d$/.test(c.text)).map((c) => c.r));
    const fin = g.get(`${finalRow},${lastCol}`);
    if (!fin || Number(fin.text) !== md.r) errs.push(`${tag} 最后一行不是余数 ${md.r}`);
    if (md.r >= d) errs.push(`${tag} 余数≥除数`);
    if (Math.max(...p.cells.map((c) => c.r)) !== finalRow) errs.push(`${tag} 余数下面还有东西`);
    // 落下的数字：和被除数同列同数字，且在本轮完成后才出现
    for (const c of p.cells.filter((x) => x.kind === 'auto' && x.from)) {
      const src = cellById(p, c.from);
      if (!src || src.c !== c.c || src.text !== c.text) errs.push(`${tag} 落下的数字与被除数不同列/不同数`);
      if (p.steps.some((st) => st.show.includes(c.id))) errs.push(`${tag} 落下的数字提前显示`);
    }
  }
  if (p.kind === 'h' && input !== 'frac') {
    // 横式读回来应与 answerText 一致（□ 换成答案）
    // 分数：分子在上一行、分母在下一行、同列 → 读成 n/d
    const shown = p.cells.filter((c) => c.r === 0).sort((x, y) => x.c - y.c)
      .map((c) => (c.cls === 'frac-n' ? `${c.text}/${(p.cells.find((x) => x.cls === 'frac-d' && x.c === c.c && x.r === c.r + 1) || {}).text}` : c.text)).join('').replace(/\s/g, '');
    const exp = p.answerText.replace(/，□ = \d+$/, '').replace(/□/g, String(s.v)).replace(/\s/g, '');
    if (shown !== exp) errs.push(`${tag} 横式显示「${shown}」与「${exp}」不一致`);
  }
  if (input === 'frac') {
    const dCells = p.steps.filter((st) => st.label === '分母'); const nCells = p.steps.filter((st) => st.label === '分子');
    if (p.steps.findIndex((st) => st.label === '分子') < dCells.length) errs.push(`${tag} 应先分母后分子`);
    const dr = cellById(p, dCells[0].cell).r; const nr = cellById(p, nCells[0].cell).r;
    if (!(dr > nr)) errs.push(`${tag} 分母应在分数线下面`);
  }

  // 6. 提示文字里的算式
  for (const [i, st] of p.steps.entries()) checkHintText(st.help.text, errs, `${tag} 第${i + 1}步`);
  if (p.note && p.skill !== 'g3a-est') errs.push(`${tag} 非估算题有 note`);

  // 6b. (round 2) 第三次错给的"方法"提示：算式要对，而且不能把这一步的得数直接写出来。
  for (const [i, st] of p.steps.entries()) {
    const m = st.help.method;
    if (typeof m !== 'string' || !m) { errs.push(`${tag} 第${i + 1}步 缺方法提示`); continue; }
    checkHintText(m, errs, `${tag} 第${i + 1}步(方法)`);
    // 方法提示要么把要求的数写成 □，要么是口诀 / 问句 / "直接写下来"这类不含得数的说法。
    if (!m.includes('□') && !/口诀|？|直接写|（[一二三四五六七八九十得]+）/.test(m)) errs.push(`${tag} 第${i + 1}步 方法提示没有留空：「${m}」`);
    // 横式：方法提示不能以"= 得数"结尾（中间步骤恰好等于得数不算）。
    if (p.kind === 'h' && input !== 'frac') {
      const ansVal = String(s.v ?? '');
      const givenNums = p.cells.filter((c) => c.kind === 'given').map((c) => c.text);
      if (ansVal && !givenNums.includes(ansVal) && new RegExp(`(?:=|是)\\s*${ansVal}\\s*$`).test(m)) errs.push(`${tag} 方法提示结尾就是得数 ${ansVal}：「${m}」`);
    }
  }

  // 6c. (round 2) 横式第二级提示要高亮题面里的已知数（连加连减、混合运算只要求第一步的两个数）。
  if (p.kind === 'h' && input !== 'frac') {
    const given = p.cells.filter((c) => c.kind === 'given').map((c) => c.id);
    const firstTwo = s.e && s.e.steps.length >= 2;
    for (const [i, st] of p.steps.entries()) {
      const hl = new Set(st.help.ids);
      if (firstTwo) {
        const f = s.e.steps[0];
        const texts = st.help.ids.map((id) => cellById(p, id)?.text);
        if (!(texts.includes(String(f.a)) && texts.includes(String(f.b)))) errs.push(`${tag} 第${i + 1}步 第二级提示没高亮第一步的 ${f.a} 和 ${f.b}`);
      } else if (!given.every((id) => hl.has(id))) errs.push(`${tag} 第${i + 1}步 第二级提示漏了已知数（高亮 ${st.help.ids.length}/${given.length}）`);
    }
  }

  // 7. 范围
  const rc = rangeCheck(p, s);
  if (rc) errs.push(`${tag} 范围不符：${rc}`);
  return s;
}

export { checkProblem, myDiv, myCarries, myBorrows };
const MAIN = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (MAIN) runAll();
function runAll() {
// ------------------------------------------------------------------ run per skill
const rows = [];
let totalFail = 0;
for (const sk of SKILLS) {
  const errs = []; let n = 0; let dupSets = 0;
  for (const seed of SEEDS) {
    const list = generate(sk.id, PER_SEED, seed);
    const texts = list.map((p) => p.text);
    if (new Set(texts).size !== texts.length) dupSets += 1;
    for (const p of list) { n += 1; checkProblem(p, errs); }
  }
  // 压力抽样：只统计范围和分类
  const cats = {}; const rngErr = [];
  const rng = makeRng(0xC0FFEE ^ sk.id.length);
  for (let i = 0; i < STRESS; i++) {
    const p = makeProblem(sk.id, rng);
    const e2 = [];
    const s = checkProblem(p, e2);
    if (e2.length) rngErr.push(...e2);
    const c = s && category(p, s); if (c) cats[c] = (cats[c] || 0) + 1;
  }
  const uniq = [...new Set([...errs, ...rngErr])];
  const space = new Set(); { const r2 = makeRng(7); for (let i = 0; i < 3000; i++) space.add(makeProblem(sk.id, r2).text); }
  let note = '';
  if (dupSets && space.size < PER_SEED) note = `注：题目空间只有 ${space.size} 道，一组 ${PER_SEED} 题必然重复（${dupSets}/${SEEDS.length} 组），实现方已在 NOTES 里说明`;
  else if (dupSets) uniq.push(`同一组 ${PER_SEED} 题内有重复（${dupSets}/${SEEDS.length} 组），题目空间 ${space.size}`);
  totalFail += uniq.length ? 1 : 0;
  rows.push({ id: sk.id, n, stress: STRESS, ok: uniq.length === 0, errs: uniq, cats, note, space: space.size });
}

// ------------------------------------------------------------------ session-level repeats (replicates main.js order exactly)
const sess = [];
for (const grade of [1, 2, 3]) for (const N of [6, 10, 14]) {
  let games = 0; let sigDup = 0; let textDup = 0; let textDupBasic = 0; const examples = new Map();
  for (let seed = 1; seed <= 400; seed++) {
    const rng = makeRng(seed);
    const plan = planBasic(grade, N, rng);
    const sigs = new Set(); const list = [];
    for (let i = 0; i < N; i++) { const p = makeProblem(plan[i], rng, sigs); sigs.add(signature(p)); list.push(p); }
    const basicTexts = list.map((p) => p.text);
    for (let k = 0; k < 30; k++) { const p = makeProblem(planExtra(grade, k, rng), rng, sigs); sigs.add(signature(p)); list.push(p); }
    games += 1;
    const sg = list.map(signature); const tx = list.map((p) => p.text);
    if (new Set(sg).size !== sg.length) sigDup += 1;
    if (new Set(tx).size !== tx.length) {
      textDup += 1;
      const seen = new Map();
      list.forEach((p) => { if (seen.has(p.text) && seen.get(p.text) !== p.skill) { const key = `${p.text}（${seen.get(p.text)} / ${p.skill}）`; if (!examples.has(key)) examples.set(key, seed); } seen.set(p.text, p.skill); });
    }
    if (new Set(basicTexts).size !== basicTexts.length) textDupBasic += 1;
  }
  sess.push({ grade, N, games, sigDup, textDup, textDupBasic, examples: [...examples.entries()].slice(0, 4) });
}

// ------------------------------------------------------------------ report
const out = [];
out.push('| 技能 id | 抽样数 | 结果 | 失败样例 / 覆盖 |');
out.push('|---|---|---|---|');
for (const r of rows) {
  const cov = [Object.keys(r.cats).length ? `覆盖：${Object.entries(r.cats).map(([k, v]) => `${k} ${v}`).join('，')}` : '', r.note].filter(Boolean).join('<br>');
  const fail = r.errs.slice(0, 3).join('<br>');
  out.push(`| ${r.id} | ${r.n}（+${r.stress} 压力） | ${r.ok ? '通过' : `**失败**（${r.errs.length} 类）`} | ${r.ok ? cov : fail + (cov ? `<br>${cov}` : '')} |`);
}
out.push('');
out.push(`技能总数 ${rows.length}，失败 ${totalFail}。`);
out.push('');
out.push('整局（基本题 + 30 道加时赛，完全按 main.js 的顺序消耗随机数）重复统计，每格 400 局：');
out.push('');
out.push('| 年级 | 题数 | 签名（skill+text）重复的局 | 题面文字重复的局（含加时） | 基本题内题面重复的局 | 例子（题面（技能/技能），种子） |');
out.push('|---|---|---|---|---|---|');
for (const s of sess) out.push(`| ${s.grade} | ${s.N} | ${s.sigDup}/${s.games} | ${s.textDup}/${s.games} | ${s.textDupBasic}/${s.games} | ${s.examples.map(([k, v]) => `${k} seed=${v}`).join('；') || '—'} |`);
console.log(out.join('\n'));
if (VERBOSE) for (const r of rows) if (!r.ok) { console.log(`\n## ${r.id}`); for (const e of r.errs.slice(0, 40)) console.log(`- ${e}`); }
}
