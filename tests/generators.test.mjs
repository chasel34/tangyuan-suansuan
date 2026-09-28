// Every generator: answers are mathematically right, layouts are well formed, carry "1" / 退位点 /
// long-division layouts follow the Chinese written method, ranges match research/shuxue.md,
// and a set from one seed has no repeats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, makeProblem, signature, makeRng, _internal } from '../app/js/problems.js';
import { SKILLS, SKILL } from '../app/js/skills.js';

const SEEDS = [1, 2, 3, 7, 42, 99, 123, 2024, 31337, 65535];
const PER_SEED = 25;
const all = (id) => SEEDS.flatMap((s) => generate(id, PER_SEED, s));
const typed = (p) => p.steps.map((s) => s.token).join('');
const cellOf = (p, id) => p.cells.find((c) => c.id === id);
const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };

// ---------------------------------------------------------------- tiny expression evaluator (precedence + brackets)
function evalExpr(src) {
  const toks = src.replace(/\s+/g, '').match(/\d+|[+−×÷()]/g);
  let i = 0; const mids = [];
  const prim = () => { const t = toks[i++]; if (t === '(') { const v = sum(); assert.equal(toks[i++], ')'); mids.push(v); return v; } return Number(t); };
  const prod = () => { let v = prim(); while (toks[i] === '×' || toks[i] === '÷') { const op = toks[i++]; v = OPS[op](v, prim()); mids.push(v); } return v; };
  const sum = () => { let v = prod(); while (toks[i] === '+' || toks[i] === '−') { const op = toks[i++]; v = OPS[op](v, prod()); mids.push(v); } return v; };
  const v = sum();
  assert.equal(i, toks.length, `parse ${src}`);
  return { v, mids };
}

// ---------------------------------------------------------------- structure
function checkStructure(p) {
  const tag = `${p.skill} ${p.text}`;
  assert.ok(p.steps.length >= 1, tag);
  assert.ok(Array.isArray(p.answers) && p.answers.length >= 1, tag);
  for (const a of p.answers) {
    assert.equal(a.length, p.steps.length, `${tag}: answer length`);
    for (const t of a) assert.match(t, /^\d$/, `${tag}: token ${t}`);
  }
  assert.deepEqual(p.answers[0], p.steps.map((s) => s.token), tag);
  const ids = new Set(p.cells.map((c) => c.id));
  const lineIds = new Set((p.lines || []).filter((l) => l.id).map((l) => l.id));
  assert.equal(ids.size, p.cells.length, `${tag}: duplicate cell ids`);
  for (const st of p.steps) {
    const c = cellOf(p, st.cell);
    assert.ok(c, `${tag}: step cell ${st.cell}`);
    assert.equal(c.kind, 'input', `${tag}: step cell kind`);
    assert.equal(c.text, st.token, `${tag}: cell text vs token`);
    assert.ok(st.label, `${tag}: label`);
    for (const id of [...st.show, ...st.reveal]) assert.ok(ids.has(id) || lineIds.has(id), `${tag}: ref ${id}`);
    for (const id of st.help.ids) assert.ok(ids.has(id), `${tag}: help ref ${id}`);
    assert.ok(typeof st.help.text === 'string' && st.help.text.length > 0, `${tag}: help text`);
  }
  // Every input cell is a step, exactly once.
  const inputs = p.cells.filter((c) => c.kind === 'input').map((c) => c.id).sort();
  assert.deepEqual(inputs, p.steps.map((s) => s.cell).sort(), `${tag}: inputs vs steps`);
  // No two cells overlap (decimal points sit on a digit's corner and are excluded).
  const occ = new Map();
  for (const c of p.cells) {
    assert.ok(c.r >= 0 && c.r + (c.rs || 1) <= p.rows && c.c >= 0 && c.c + (c.cs || 1) <= p.cols, `${tag}: ${c.id} outside grid`);
    if (c.kind === 'point' || (c.kind === 'auto' && c.text === '.')) continue;
    for (let dr = 0; dr < (c.rs || 1); dr++) for (let dc = 0; dc < (c.cs || 1); dc++) {
      const k = `${c.r + dr},${c.c + dc}`;
      assert.ok(!occ.has(k), `${tag}: overlap at ${k} (${occ.get(k)} / ${c.id})`);
      occ.set(k, c.id);
    }
  }
  assert.equal(p.rowH.length, p.rows, `${tag}: rowH`);
  assert.ok(p.cols <= 16 && p.rows <= 10, `${tag}: grid ${p.cols}x${p.rows}`);
}

// ---------------------------------------------------------------- vertical layouts
function colDigits(n, len) { return String(n).padStart(len, '0').split('').reverse().map(Number); }

function checkAdd(p) {
  const { A, B, P, sum } = p.data;
  assert.equal(A + B, sum);
  const cols = p.cols;
  // Result typed right to left: reversing the tokens gives the sum's digits.
  assert.equal([...typed(p)].reverse().join(''), String(sum).padStart(P + 1, '0'), `${p.text}`);
  // Expected 进位 marks: above column c-1 when column c sums to 10+ and column c-1 still has
  // digits on the paper (the 0 of "0.8" is a written digit).
  const opLen = Math.max(String(A).padStart(P + 1, '0').length, String(B).padStart(P + 1, '0').length);
  const ad = colDigits(A, opLen); const bd = colDigits(B, opLen);
  const want = []; let carry = 0;
  for (let i = 0; i < opLen; i++) {
    const s = ad[i] + bd[i] + carry; carry = s >= 10 ? 1 : 0;
    if (carry && i + 1 < opLen) want.push(cols - 1 - i - 1);
  }
  const got = p.cells.filter((c) => c.kind === 'carry');
  assert.deepEqual(got.map((c) => c.c).sort((x, y) => x - y), want.sort((x, y) => x - y), `${p.text}: carry columns`);
  for (const c of got) {
    assert.equal(c.r, 0); assert.equal(c.text, '1');
    // Revealed right after the digit of the column to its right.
    const st = p.steps.find((s) => s.reveal.includes(c.id));
    assert.equal(st.cell, `s${c.c + 1}`, `${p.text}: carry reveal`);
  }
}

function checkSub(p) {
  const { A, B, P, diff } = p.data;
  assert.equal(A - B, diff); assert.ok(diff > 0);
  assert.equal([...typed(p)].reverse().join(''), String(diff).padStart(P + 1, '0'), p.text);
  // Independent 退位 simulation: every lender column (including zeros lending through) gets a dot.
  const as = String(A).padStart(P + 1, '0'); const cols = as.length + 1;
  const cur = [null, ...as.split('').map(Number)];
  const bs = String(B).padStart(P + 1, '0');
  const bcol = (c) => { const i = c - (cols - bs.length); return i >= 0 ? Number(bs[i]) : 0; };
  const want = [];
  for (let c = cols - 1; c >= 1; c--) {
    if (cur[c] < bcol(c)) { let k = c - 1; while (cur[k] === 0) { cur[k] = 9; want.push(k); k--; } cur[k] -= 1; want.push(k); cur[c] += 10; }
  }
  const dots = p.cells.filter((c) => c.kind === 'dot');
  assert.deepEqual(dots.map((c) => c.c).sort((x, y) => x - y), want.sort((x, y) => x - y), `${p.text}: 退位点 columns`);
  for (const d of dots) {
    assert.equal(d.r, 0);
    const top = p.cells.find((c) => c.r === 1 && c.c === d.c);
    assert.ok(top && /\d/.test(top.text), `${p.text}: dot above a digit`);
    // Shown when the column that needs the borrow becomes active (to the right of the dot).
    const st = p.steps.find((s) => s.show.includes(d.id));
    assert.ok(st && Number(st.cell.slice(1)) > d.c, `${p.text}: dot shown by a column on its right`);
  }
}

function checkMul(p) {
  const { a, b, tz, prod, bCol } = p.data;
  assert.equal(a * b, prod);
  assert.equal([...typed(p)].reverse().join(''), String(prod), p.text);
  // Multiplier under the last non-zero digit of a.
  const aCells = p.cells.filter((c) => c.id.startsWith('a')).sort((x, y) => x.c - y.c);
  const lastNonZero = aCells.filter((c) => c.text !== '0').pop();
  assert.equal(bCol, lastNonZero.c, `${p.text}: multiplier column`);
  assert.equal(cellOf(p, 'b').c, bCol);
  // Trailing zeros are typed first.
  for (let j = 0; j < tz; j++) assert.equal(p.steps[j].token, '0');
  assert.equal(String(a).length - String(a).replace(/0+$/, '').length, tz);
}

// Independent long division, Chinese layout rules.
function expectDiv(D, d) {
  const Ds = String(D); const off = 1;
  let k = 1; while (Number(Ds.slice(0, k)) < d && k < Ds.length) k++;
  let cur = Number(Ds.slice(0, k)); let col = off + k - 1;
  const out = [];
  for (;;) { const qd = Math.floor(cur / d); out.push({ col, cur, qd }); const r = cur - qd * d; if (col === off + Ds.length - 1) break; col++; cur = r * 10 + Number(Ds[col - off]); }
  return out;
}

function checkDiv(p) {
  const { D, d, q, rem, rounds, firstCol } = p.data;
  assert.equal(q, Math.floor(D / d)); assert.equal(rem, D % d); assert.ok(rem < d);
  const exp = expectDiv(D, d);
  // Quotient digits sit above the last digit of each partial dividend; no leading zero.
  const qs = p.cells.filter((c) => c.r === 0).sort((x, y) => x.c - y.c);
  assert.equal(qs.map((c) => c.text).join(''), String(q), `${p.text}: quotient`);
  assert.notEqual(qs[0].text, '0');
  assert.equal(qs[0].c, firstCol);
  assert.deepEqual(qs.map((c) => c.c), exp.map((e) => e.col), `${p.text}: quotient columns`);
  assert.equal(rounds.length, exp.length);
  const divisor = cellOf(p, 'dv'); assert.equal(divisor.text, String(d)); assert.equal(divisor.c, 0);
  assert.deepEqual(p.bracket, { r: 1, c0: 1, c1: p.cols - 1 });
  rounds.forEach((rd, i) => {
    assert.equal(rd.col, exp[i].col); assert.equal(rd.qd, exp[i].qd); assert.equal(rd.cur, exp[i].cur, `${p.text}: partial dividend ${i}`);
    if (rd.qd === 0) { assert.equal(rd.product, null, `${p.text}: 商0 has no product row`); return; }
    // Product row = qd × d, right-aligned under the quotient digit.
    const row = p.cells.filter((c) => c.r === rd.productRow).sort((x, y) => x.c - y.c);
    assert.equal(Number(row.map((c) => c.text).join('')), rd.qd * d, `${p.text}: product ${i}`);
    assert.equal(row[row.length - 1].c, rd.col, `${p.text}: product aligned`);
    assert.equal(rd.rest, rd.cur - rd.qd * d);
    assert.ok(rd.rest < d, `${p.text}: partial remainder < divisor`);
  });
  // The final remainder is on the paper at the bottom row, under the last quotient digit.
  const lastRow = Math.max(...p.cells.map((c) => c.r));
  const bottom = p.cells.filter((c) => c.r === lastRow && c.kind !== 'point').sort((x, y) => x.c - y.c);
  assert.equal(Number(bottom.map((c) => c.text).join('')), rem, `${p.text}: bottom row is the remainder`);
  assert.equal(bottom[bottom.length - 1].c, p.cols - 1);
  // Typed order per round: 商 before 积 before 相减.
  const order = { 商: 0, 积: 1, 相减: 2, 余数: 2 };
  let prev = -1; let lastCol = -1;
  for (const st of p.steps) {
    const c = cellOf(p, st.cell);
    if (st.label === '商') { assert.ok(c.c > lastCol); lastCol = c.c; prev = 0; continue; }
    assert.ok(order[st.label] >= prev, `${p.text}: step order`); prev = order[st.label];
  }
}

// ---------------------------------------------------------------- horizontal math
function checkH(p) {
  const t = typed(p);
  const d = p.data || {};
  if (d.op && d.a !== undefined && d.b !== undefined && d.res !== undefined && !p.note) {
    assert.equal(OPS[d.op](d.a, d.b), d.res, p.text);
    assert.equal(t, String(d.res), p.text);
    assert.equal(p.text, `${d.a} ${d.op} ${d.b}`);
  }
}

const range = (v, lo, hi, tag) => assert.ok(v >= lo && v <= hi, `${tag}: ${v} not in [${lo}, ${hi}]`);
const parse2 = (text) => { const m = text.match(/^(\d+) ([+−×÷]) (\d+)$/); assert.ok(m, text); return [Number(m[1]), m[2], Number(m[3])]; };
const noCarry = (a, b) => (a % 10) + (b % 10) < 10 && (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) < 10;

// Skill-specific checks (ranges from research/shuxue.md).
const SPEC = {
  'g1a-compose'(p) { const { total, a, x } = p.data; assert.equal(a + x, total); range(total, 2, 10, p.text); assert.ok(a >= 1 && x >= 1); assert.equal(typed(p), String(x)); },
  'g1a-add10'(p) { const [a, , b] = parse2(p.text); range(a, 0, 9, p.text); range(b, 0, 9, p.text); range(a + b, 1, 10, p.text); },
  'g1a-sub10'(p) { const [a, , b] = parse2(p.text); range(a, 1, 10, p.text); range(a - b, 0, 10, p.text); },
  'g1a-chain10'(p) { const { nums, ops, mid, res } = p.data; assert.equal(OPS[ops[0]](nums[0], nums[1]), mid); assert.equal(OPS[ops[1]](mid, nums[2]), res); range(mid, 0, 10, p.text); range(res, 0, 10, p.text); assert.equal(typed(p), String(res)); },
  'g1a-teen'(p) { const [a, op, b] = parse2(p.text); const r = OPS[op](a, b); range(r, 10, 19, p.text); range(Math.max(a, b), 10, 19, p.text); if (op === '+') assert.ok(noCarry(a, b), p.text); else assert.ok(a % 10 >= b % 10 || b === 10, p.text); },
  'g1a-carry'(p) { const [a, , b] = parse2(p.text); range(a, 2, 9, p.text); range(b, 2, 9, p.text); range(a + b, 11, 18, p.text); },
  'g1a-missing'(p) { const { a, b, x } = p.data; assert.equal(a + x, b); range(b, 2, 20, p.text); assert.equal(typed(p), String(x)); assert.ok(p.text.includes('□')); },
  'g1b-borrow'(p) { const [a, , b] = parse2(p.text); range(a, 11, 18, p.text); range(b, 2, 9, p.text); assert.ok(a % 10 < b, p.text); },
  'g1b-2d1'(p) { const [a, op, b] = parse2(p.text); const r = OPS[op](a, b); range(r, 0, 100, p.text); if (op === '+') assert.ok(noCarry(a, b) || a + b === 100, p.text); else assert.ok(a % 10 >= b % 10, p.text); },
  'g1b-2d1c'(p) { const [a, , b] = parse2(p.text); range(a, 11, 99, p.text); range(b, 2, 9, p.text); assert.ok((a % 10) + b >= 10); range(a + b, 20, 100, p.text); },
  'g1b-2d1b'(p) { const [a, , b] = parse2(p.text); range(a, 20, 99, p.text); range(b, 2, 9, p.text); assert.ok(a % 10 < b); },
  'g1b-vadd2'(p) { range(p.data.A, 10, 99, p.text); range(p.data.B, 10, 99, p.text); range(p.data.sum, 20, 100, p.text); },
  'g1b-vsub2'(p) { range(p.data.A, 10, 99, p.text); range(p.data.B, 10, 99, p.text); },
  'g1b-chain100'(p) { const { nums, ops, mid, res } = p.data; assert.equal(OPS[ops[1]](OPS[ops[0]](nums[0], nums[1]), nums[2]), res); range(mid, 0, 100, p.text); range(res, 1, 100, p.text); },
  'g2a-kou5'(p) { const [a, op, b] = parse2(p.text); assert.equal(op, '×'); assert.ok(Math.max(a, b) === 5, p.text); range(Math.min(a, b), 1, 5, p.text); },
  'g2a-kou234'(p) { const [a, , b] = parse2(p.text); range(Math.max(a, b), 1, 4, p.text); },
  'g2a-kou6'(p) { const [a, , b] = parse2(p.text); assert.equal(Math.max(a, b), 6, p.text); },
  'g2a-div6'(p) { const [D, op, d] = parse2(p.text); assert.equal(op, '÷'); range(d, 2, 6, p.text); range(D / d, 1, 6, p.text); assert.ok(Number.isInteger(D / d)); },
  'g2a-kou789'(p) { const [a, , b] = parse2(p.text); range(Math.max(a, b), 7, 9, p.text); },
  'g2a-kou-mix'(p) { const [a, , b] = parse2(p.text); range(a, 1, 9, p.text); range(b, 1, 9, p.text); },
  'g2a-div9'(p) { const [D, , d] = parse2(p.text); range(d, 1, 9, p.text); range(D / d, 1, 9, p.text); assert.ok(Number.isInteger(D / d)); },
  'g2b-rem'(p) {
    const { D, d, q, r } = p.data;
    assert.equal(q * d + r, D); range(d, 2, 9, p.text); range(q, 1, 9, p.text); assert.ok(r >= 1 && r < d, `${p.text}: remainder < divisor`);
    assert.equal(typed(p), `${q}${r}`); assert.equal(p.answerText, `${D} ÷ ${d} = ${q}……${r}`);
    assert.deepEqual(p.steps.map((s) => s.label), [...String(q)].map(() => '商').concat([...String(r)].map(() => '余数')));
  },
  'g2b-vdivrem'(p) { const { D, d, q } = p.data; range(D, 10, 99, p.text); range(q, 1, 9, p.text); range(d, 2, 9, p.text); assert.equal(p.data.rounds.length, 1); },
  'g2b-oral'(p) { const [a, op, b] = parse2(p.text); range(OPS[op](a, b), 1, 10000, p.text); },
  'g2b-vadd3'(p) { range(p.data.A, 100, 999, p.text); range(p.data.B, 10, 999, p.text); assert.ok(p.cells.some((c) => c.kind === 'carry') || String(p.data.sum).length > 3, p.text); },
  'g2b-vsub3'(p) {
    range(p.data.A, 100, 999, p.text);
    const zeroLent = p.data.dotCols.some((c) => p.cells.find((x) => x.r === 1 && x.c === c).text === '0');
    assert.ok(zeroLent, `${p.text}: 隔位退位`);
  },
  'g2b-missing'(p) {
    const x = Number(typed(p));
    const src = p.text.replace('□', String(x));
    const [lhs, rhs] = src.split('=');
    assert.equal(evalExpr(lhs).v, Number(rhs), p.text);
  },
  'g3a-mix2'(p) {
    const { v, mids } = evalExpr(p.text);
    assert.equal(v, Number(typed(p)), p.text); range(v, 0, 100, p.text);
    for (const m of mids) assert.ok(Number.isInteger(m) && m >= 0, `${p.text}: intermediate ${m}`);
    assert.ok(/[×÷]/.test(p.text) && /[+−]/.test(p.text), `${p.text}: two levels or brackets`);
  },
  'g3a-oralmul'(p) { const [a, op, b] = parse2(p.text); assert.equal(op, '×'); range(b, 2, 9, p.text); assert.ok(a % 10 === 0 || a < 100); },
  'g3a-vmul21'(p) { range(p.data.a, 10, 99, p.text); range(p.data.b, 2, 9, p.text); },
  'g3a-vmul31'(p) { range(p.data.a, 100, 999, p.text); range(p.data.b, 2, 9, p.text); },
  'g3a-est'(p) {
    // Recompute from the rule printed on the card.
    assert.ok(p.note && p.note.startsWith('估算规则：'), p.text);
    const m = p.text.match(/^(\d+) ([+−×]) (\d+) ≈ □$/); assert.ok(m, p.text);
    const a = Number(m[1]); const b = Number(m[3]); const op = m[2];
    const unit = p.note.includes('整百') ? 100 : 10;
    const rnd = (n) => Math.round(n / unit) * unit;
    let want;
    if (p.note.includes('每个数')) want = OPS[op](rnd(a), rnd(b));
    else { assert.equal(op, '×'); const digits = p.note.includes('三位数') ? 3 : 2; assert.equal(String(a).length, digits); want = rnd(a) * b; }
    assert.equal(Number(typed(p)), want, `${p.text} (${p.note})`);
    assert.ok(want >= 0);
  },
  'g3a-fsame'(p) {
    const m = p.text.match(/^(?:(\d+)\/(\d+)|1) ([+−]) (\d+)\/(\d+)$/); assert.ok(m, p.text);
    const d = Number(m[5]); const n1 = m[1] ? Number(m[1]) : d; if (m[2]) assert.equal(Number(m[2]), d);
    const n2 = Number(m[4]); const rn = m[3] === '+' ? n1 + n2 : n1 - n2;
    range(d, 3, 12, p.text); assert.ok(rn > 0 && rn < d, `${p.text}: result within (0, 1)`);
    // 分母 first, then 分子.
    assert.equal(typed(p), `${d}${rn}`, p.text);
    assert.deepEqual([...new Set(p.steps.map((s) => s.label))], ['分母', '分子']);
  },
  'g3a-fof'(p) { const m = p.text.match(/^(\d+) 的 (\d+)\/(\d+)$/); assert.ok(m); const w = Number(m[1]); const n = Number(m[2]); const d = Number(m[3]); assert.ok(n < d); assert.equal((w * n) % d, 0); assert.equal(Number(typed(p)), (w * n) / d); },
  'g3b-oraldiv'(p) { const [D, op, d] = parse2(p.text); assert.equal(op, '÷'); assert.ok(Number.isInteger(D / d), p.text); range(d, 2, 9, p.text); assert.equal(Number(typed(p)), D / d); },
  'g3b-vdiv21'(p) { const { D, d, q } = p.data; range(D, 10, 99, p.text); range(q, 10, 49, p.text); range(d, 2, 9, p.text); },
  'g3b-vdiv31'(p) { const { D, d } = p.data; range(D, 100, 999, p.text); range(d, 2, 9, p.text); },
  'g3b-dec1'(p) {
    const m = p.text.match(/^([\d.]+) ([+−]) ([\d.]+)$/); assert.ok(m, p.text);
    const a = Math.round(Number(m[1]) * 10); const b = Math.round(Number(m[3]) * 10);
    const want = m[2] === '+' ? a + b : a - b;
    assert.ok(want > 0 && want % 10 !== 0, p.text);
    assert.equal(Number(p.answer) * 10, want); assert.equal(p.data.P, 1);
    assert.ok(/\.\d$/.test(m[3]), `${p.text}: subtrahend/addend has one decimal place`);
    range(Math.max(a, b), 1, 999, p.text);
  },
};

test('38 grade 1-3 skills, prerequisites resolve, one generator check each', () => {
  assert.equal(SKILLS.length, 38);
  for (const s of SKILLS) {
    assert.ok(s.grade >= 1 && s.grade <= 3);
    for (const r of s.req) assert.ok(SKILL[r], `${s.id} requires unknown ${r}`);
    assert.ok(SPEC[s.id], `missing spec test for ${s.id}`);
  }
});

for (const s of SKILLS) {
  test(`generator ${s.id} (${s.name})`, () => {
    for (const p of all(s.id)) {
      checkStructure(p);
      assert.equal(p.skill, s.id);
      if (p.kind === 'add') checkAdd(p);
      else if (p.kind === 'sub') checkSub(p);
      else if (p.kind === 'mul') checkMul(p);
      else if (p.kind === 'div') checkDiv(p);
      else checkH(p);
      SPEC[s.id](p);
    }
  });
}

test('no repeats within one generated set', () => {
  for (const s of SKILLS) {
    for (const seed of [5, 17, 256]) {
      const list = generate(s.id, 8, seed);
      const sigs = list.map(signature);
      assert.equal(new Set(sigs).size, sigs.length, `${s.id} seed ${seed}: ${sigs.join(', ')}`);
    }
  }
});

test('input forms match the research table', () => {
  const kinds = { h: ['h'], box: ['h'], rem: ['h'], frac: ['h'], vas: ['add', 'sub'], vdec: ['add', 'sub'], vmul: ['mul'], vdiv: ['div'] };
  for (const s of SKILLS) for (const p of generate(s.id, 6, 11)) assert.ok(kinds[s.input].includes(p.kind), `${s.id}: ${p.kind}`);
});

test('fixed cases: carry "1", 退位点, 竖式乘法, 除法竖式', () => {
  const { buildAdd, buildSub, buildMul, buildDiv } = _internal;
  // 27 + 35: 7 + 5 = 12 -> "1" above the tens.
  const a = buildAdd(27, 35);
  assert.deepEqual(a.cells.filter((c) => c.kind === 'carry').map((c) => [c.r, c.c]), [[0, 1]]);
  // 95 + 27 = 122: the hundreds 1 is typed, not a small mark.
  const a2 = buildAdd(95, 27);
  assert.deepEqual(a2.cells.filter((c) => c.kind === 'carry').map((c) => c.c), [2]);
  assert.equal(a2.steps.map((s) => s.token).reverse().join(''), '122');
  // 503 − 178: dots on the 0 (tens) and the 5 (hundreds), nowhere else.
  const s = buildSub(503, 178);
  const dots = s.cells.filter((c) => c.kind === 'dot').map((c) => s.cells.find((x) => x.r === 1 && x.c === c.c).text).sort();
  assert.deepEqual(dots, ['0', '5']);
  assert.equal(s.steps.map((x) => x.token).reverse().join(''), '325');
  // 350 × 6: 6 under the 5; the trailing 0 is typed first; 2100.
  const m = buildMul(350, 6);
  assert.equal(m.cells.find((c) => c.id === 'b').c, m.cells.find((c) => c.id.startsWith('a') && c.text === '5').c);
  assert.equal(m.steps[0].token, '0'); assert.equal(m.steps[0].label, '末尾的 0');
  assert.equal(m.steps.map((x) => x.token).reverse().join(''), '2100');
  // 17 ÷ 5 = 3……2: 商 above the 7, 积 15, 余数 2.
  const d = buildDiv(17, 5);
  assert.deepEqual(d.steps.map((x) => [x.label, x.token]), [['商', '3'], ['积', '1'], ['积', '5'], ['余数', '2']]);
  assert.equal(d.cells.find((c) => c.id === 'q2').c, 2);
  // 612 ÷ 3 = 204: 商中间有 0, no product row for the 0.
  const d2 = buildDiv(612, 3);
  assert.deepEqual(d2.steps.filter((x) => x.label === '商').map((x) => x.token), ['2', '0', '4']);
  assert.equal(d2.data.rounds[1].product, null);
  // 630 ÷ 3 = 210: 商末尾有 0, the last row shows 0.
  const d3 = buildDiv(630, 3);
  assert.deepEqual(d3.steps.filter((x) => x.label === '商').map((x) => x.token), ['2', '1', '0']);
  // 306 ÷ 3 = 102: the 0 that comes down after an exact subtraction is not written.
  const d4 = buildDiv(306, 3);
  assert.ok(!d4.cells.some((c) => c.kind === 'auto' && c.text === '0'));
  assert.deepEqual(d4.steps.filter((x) => x.label === '商').map((x) => x.token), ['1', '0', '2']);
  // 156 ÷ 4: 首位不够除, 商 starts above the 5.
  const d5 = buildDiv(156, 4);
  assert.equal(d5.data.firstCol, 2);
});

test('g3b-vdiv31 covers 首位够除 / 不够除 / 商中间有0 / 商末尾有0', () => {
  const seen = new Set();
  for (const p of SEEDS.flatMap((sd) => generate('g3b-vdiv31', 40, sd))) {
    const { D, d, q } = p.data; const qs = String(q);
    if (Math.floor(D / 100) >= d && !qs.includes('0')) seen.add('enough');
    if (Math.floor(D / 100) < d && !qs.includes('0')) seen.add('notEnough');
    if (qs.length === 3 && qs[1] === '0') seen.add('midZero');
    if (qs.endsWith('0')) seen.add('endZero');
  }
  assert.deepEqual([...seen].sort(), ['endZero', 'enough', 'midZero', 'notEnough']);
});

test('g3a-vmul31 covers 连续进位 / 中间有0 / 末尾有0', () => {
  const seen = new Set();
  for (const p of generate('g3a-vmul31', 200, 9)) {
    const s = String(p.data.a);
    if (s.endsWith('0')) seen.add('end'); else if (s[1] === '0') seen.add('mid'); else seen.add('carry');
  }
  assert.deepEqual([...seen].sort(), ['carry', 'end', 'mid']);
});

test('makeProblem honours the avoid set', () => {
  const rng = makeRng(8);
  const avoid = new Set();
  for (let i = 0; i < 8; i++) { const p = makeProblem('g2a-kou5', rng, avoid); assert.ok(!avoid.has(signature(p)), `repeat ${p.text}`); avoid.add(signature(p)); }
});

test('second-level hint highlights the given numbers of a horizontal problem (first step for 连加连减 / 混合运算)', () => {
  const firstStepOnly = new Set(['g3a-mix2', 'g1a-chain10', 'g1b-chain100']);
  for (const s of SKILLS) for (const p of generate(s.id, 12, 5)) {
    if (p.kind !== 'h') continue;
    if (s.id === 'g3a-fsame') {
      // 分母 steps light the denominators, 分子 steps the numerators (and the 1 of "1 − n/d").
      for (const st of p.steps) {
        const cls = st.help.ids.map((id) => p.cells.find((c) => c.id === id)).map((c) => (c.cls || (c.text === '1' ? 'one' : '')));
        if (st.label === '分母') assert.ok(cls.length >= 1 && cls.every((k) => k === 'frac-d'), `${p.text} 分母`);
        else assert.ok(cls.length >= 1 && cls.every((k) => k === 'frac-n' || k === 'one'), `${p.text} 分子`);
      }
      continue;
    }
    const given = p.cells.filter((c) => c.kind === 'given').map((c) => c.id);
    for (const st of p.steps) {
      if (firstStepOnly.has(s.id)) { assert.equal(st.help.ids.length, 2, `${p.text}: two numbers of the first step`); continue; }
      for (const id of given) assert.ok(st.help.ids.includes(id), `${s.id} ${p.text}: ${id} not highlighted`);
    }
  }
  // Numbers to the right of the answer box are highlighted too.
  const p = generate('g1a-missing', 20, 3).find((x) => x.text.startsWith('□'));
  assert.equal(p.steps[0].help.ids.length, 2, p.text);
});

test('third-level hint gives the method with the result blank; the fourth level gives the result', () => {
  const skipNumberCheck = new Set(['g3a-mix2', 'g1a-chain10', 'g1b-chain100']);
  for (const s of SKILLS) for (const p of generate(s.id, 12, 21)) {
    for (const st of p.steps) {
      assert.ok(typeof st.help.method === 'string' && st.help.method.length > 0, `${s.id} ${p.text}: method`);
      assert.notEqual(st.help.method, st.help.text, `${s.id} ${p.text}: method must differ from the worked hint`);
    }
    if (p.kind === 'h' && /^\d+$/.test(p.answer) && !skipNumberCheck.has(s.id)) {
      // Skip when the answer is also one of the given numbers (then it appears in the method anyway).
      const re = new RegExp(`(?<![\\d.])${p.answer}(?![\\d.])`);
      if (!re.test(p.text)) for (const st of p.steps) assert.ok(!re.test(st.help.method), `${s.id} ${p.text}: method shows the answer: ${st.help.method}`);
    }
  }
});

test('hint wording: no "1 = 1", zero borrowed through is explained', () => {
  for (const s of SKILLS) for (const p of generate(s.id, 12, 8)) for (const st of p.steps) {
    assert.ok(!/(^|[：，])(\d+) = \2(，|$)/.test(st.help.text), `${p.text}: ${st.help.text}`);
  }
  const { buildSub, buildAdd } = _internal;
  const s = buildSub(700, 167);
  assert.match(s.steps[1].help.text, /^十位是 0，先从百位退 1 当作 10，再退 1 给个位，还剩 9：9 − 6 = 3$/);
  const a = buildAdd(134, 16);
  assert.equal(a.steps[2].help.text, '百位只有 1，直接写 1');
});

test('g3b-dec1 also uses 0.x operands, and 0.8 + 0.4 writes the carry "1" above the ones 0', () => {
  const list = SEEDS.flatMap((sd) => generate('g3b-dec1', 30, sd));
  assert.ok(list.some((p) => /^0\.\d \+/.test(p.text) || /\+ 0\.\d$/.test(p.text)), 'addition with 0.x');
  const p = _internal.buildAdd(8, 4, 1, 1);
  const marks = p.cells.filter((c) => c.kind === 'carry');
  assert.equal(marks.length, 1);
  assert.equal(marks[0].c, p.cols - 2);
  assert.equal(p.steps[0].help.method, '8 + 4 满十了：这一格只写得数的末位 □，向个位进 1');
  assert.equal(p.steps[1].help.text, '0 + 0 + 1 = 1');
  assert.equal(p.steps[1].help.method, '0 + 0 + 1 = □');
  assert.equal([...p.steps.map((x) => x.token)].reverse().join(''), '12');
});

test('a column that reaches ten: the method says only the ones digit goes in this box', () => {
  for (const id of ['g1b-vadd2', 'g2b-vadd3', 'g3a-vmul21', 'g3a-vmul31', 'g3b-dec1']) for (const p of generate(id, 40, 13)) {
    for (const st of p.steps) {
      if (!/，写 \d/.test(st.help.text)) continue;
      assert.match(st.help.method, /这一格只写(个位|得数的末位) □，向\S*进 \d/, `${p.text}: ${st.help.method}`);
    }
  }
});

test('signature is the problem text, so the same 题面 from two skills is a repeat', () => {
  const a = makeProblem('g2a-div6', makeRng(3)); const b = { ...a, skill: 'g2a-div9' };
  assert.equal(signature(a), signature(b));
});
