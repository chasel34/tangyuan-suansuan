// Problem generation and layout. Pure (no DOM): imported by the game and by node tests.
//
// A problem is a small grid of cells plus an ordered list of input steps:
//   cells  [{ id, r, c, cs?, rs?, text, kind }]
//          kind: given | op | word | input | carry (进位 "1", hidden until revealed)
//                | dot (退位点, hidden until shown) | auto (hidden until revealed: 下落数字, 得数的小数点)
//                | point (visible 小数点) | pad (补的 0, shown light)
//   lines  [{ id?, r, c0, c1, kind: 'rule' | 'frac', hidden? }]   a line along the bottom of row r
//   steps  [{ cell, token, label, show: [ids], reveal: [ids], help: { ids, text } }]
//          show: revealed when the step becomes active; reveal: revealed once the step is answered.
//   answers  [[token, ...], ...]  every legal answer, one token per step (M1: single digits).
// Layout kinds: 'h' (横式/□/商……余/分数), 'add', 'sub', 'mul', 'div'.
import { makeRng, int, pickOne, chance } from './rng.js';
import { SKILL } from './skills.js';
import { koujue, placeName } from './cn.js';

export { makeRng };

export const SYM = { add: '+', sub: '−', mul: '×', div: '÷', eq: '=', approx: '≈' };
const OPS = { '+': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };

const digitsOf = (n, minLen = 1) => String(n).padStart(minLen, '0').split('');
const decStr = (n, p) => { if (!p) return String(n); const s = String(n).padStart(p + 1, '0'); return `${s.slice(0, -p)}.${s.slice(-p)}`; };
const nDigit = (rng, n) => int(rng, 10 ** (n - 1), 10 ** n - 1);
const range = (rng, v) => (Array.isArray(v) ? int(rng, v[0], v[1]) : v);
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const trailingZeros = (n) => { let z = 0; while (n > 0 && n % 10 === 0) { z += 1; n /= 10; } return z; };

// Column-wise carries of a + b (count).
export function carriesOf(a, b) {
  let c = 0; let n = 0;
  while (a > 0 || b > 0) { const s = (a % 10) + (b % 10) + c; c = s >= 10 ? 1 : 0; n += c; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return n;
}
// Column-wise borrows of a − b (count).
export function borrowsOf(a, b) {
  let br = 0; let n = 0;
  while (a > 0) { const t = (a % 10) - br - (b % 10); br = t < 0 ? 1 : 0; n += br; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return n;
}

// ================================================================ horizontal layout
// tokens: { n, key? } given number · { op } · { w } word · { ans, label?, key? } answer digits typed left to right
//         { f: [n, d] } given fraction · { fa: [n, d] } answer fraction (分母 first, then 分子) · { br: true } new line
function buildH(tokens, meta) {
  const hasFrac = tokens.some((t) => t.f || t.fa);
  const rowH = hasFrac ? 2 : 1;
  const cells = []; const lines = []; const steps = [];
  const keyIds = {};
  let r = 0; let c = 0; let maxC = 0; let uid = 0;
  const nid = (p) => `${p}${uid++}`;
  const span = hasFrac ? { rs: 2 } : {};
  // help.ids are resolved after the loop, so numbers to the right of the answer are included too.
  const method = meta.method || blankLast(meta.help || '', meta.answer);
  const help = (keys = null) => ({ ids: [], keys, text: meta.help || '', method });
  for (const t of tokens) {
    if (t.br) { maxC = Math.max(maxC, c); c = 0; r += rowH; continue; }
    if (t.n !== undefined || t.op !== undefined || t.w !== undefined) {
      const text = String(t.n ?? t.op ?? t.w);
      const kind = t.n !== undefined ? 'given' : t.op !== undefined ? 'op' : 'word';
      const w = kind === 'word' ? Math.max(1, Math.ceil(text.length * 0.6)) : kind === 'given' ? text.length : 1;
      const id = nid(kind[0]);
      cells.push({ id, r, c, cs: w, ...span, text, kind });
      if (t.key) (keyIds[t.key] ||= []).push(id);
      c += w;
    } else if (t.ans !== undefined) {
      const ids = [];
      for (const ch of String(t.ans)) {
        const id = nid('x');
        cells.push({ id, r, c, ...span, text: ch, kind: 'input', box: t.box ? 1 : 0 });
        steps.push({ cell: id, token: ch, label: t.label || '答案', show: [], reveal: [], help: help() });
        ids.push(id);
        c += 1;
      }
      if (t.key) keyIds[t.key] = ids;
    } else if (t.f || t.fa) {
      const [n, d] = t.f || t.fa;
      const ns = String(n); const ds = String(d);
      const w = Math.max(ns.length, ds.length);
      lines.push({ r, c0: c, c1: c + w - 1, kind: 'frac' });
      if (t.f) {
        const a = nid('n'); const b = nid('d');
        cells.push({ id: a, r, c, cs: w, text: ns, kind: 'given', cls: 'frac-n' });
        cells.push({ id: b, r: r + 1, c, cs: w, text: ds, kind: 'given', cls: 'frac-d' });
        if (t.key) (keyIds[t.key] ||= []).push(a, b);
        if (t.keyN) (keyIds[t.keyN] ||= []).push(a);
        if (t.keyD) (keyIds[t.keyD] ||= []).push(b);
      } else {
        const put = (str, row, label, cls, keys) => [...str].forEach((ch, i) => {
          const id = nid('x');
          cells.push({ id, r: row, c: c + w - str.length + i, text: ch, kind: 'input', cls });
          steps.push({ cell: id, token: ch, label, show: [], reveal: [], help: help(keys || null) });
        });
        put(ds, r + 1, '分母', 'frac-d', t.keysD);
        put(ns, r, '分子', 'frac-n', t.keysN);
      }
      c += w;
    }
    maxC = Math.max(maxC, c);
  }
  const rows = r + rowH;
  const resolve = (keys) => (keys || []).flatMap((k) => keyIds[k] || []);
  for (const st of steps) { st.help.ids = resolve(st.help.keys || meta.helpKeys); delete st.help.keys; }
  return finish({ kind: 'h', rows, cols: Math.max(maxC, c), rowH: Array(rows).fill(1), cells, lines, steps, bracket: null, ...meta });
}

function finish(p) {
  p.answers = [p.steps.map((s) => s.token)];
  delete p.helpKeys;
  delete p.method;
  return p;
}

// Third-level hint = the method with the result left blank: the last standalone occurrence of
// the answer in the worked hint becomes □ (the full worked hint is the fourth level).
export function blankLast(text, value) {
  if (!text || value === undefined || value === null) return text;
  const v = String(value).replace('.', '\\.');
  const re = new RegExp(`(?<![\\d.])${v}(?![\\d.])`, 'g');
  let last = -1; let m;
  while ((m = re.exec(text))) last = m.index;
  if (last < 0) return text;
  return `${text.slice(0, last)}□${text.slice(last + String(value).length)}`;
}

// ================================================================ vertical addition
// a, b are integers scaled by 10^pa / 10^pb (decimal points aligned). Row 0 holds the small 进位 "1".
function buildAdd(a, b, pa = 0, pb = 0) {
  const P = Math.max(pa, pb);
  const A = a * 10 ** (P - pa); const B = b * 10 ** (P - pb); const S = A + B;
  const as = digitsOf(A, P + 1); const bs = digitsOf(B, P + 1); const ss = digitsOf(S, P + 1);
  const W = Math.max(as.length, bs.length, ss.length);
  const cols = W + 1;
  const cells = []; const steps = [];
  const opLen = Math.max(as.length, bs.length);
  as.forEach((d, i) => { const c = cols - as.length + i; cells.push({ id: `a${c}`, r: 1, c, text: d, kind: i >= as.length - (P - pa) ? 'pad' : 'given' }); });
  bs.forEach((d, i) => { const c = cols - bs.length + i; cells.push({ id: `b${c}`, r: 2, c, text: d, kind: i >= bs.length - (P - pb) ? 'pad' : 'given' }); });
  cells.push({ id: 'op', r: 2, c: 0, text: SYM.add, kind: 'op' });
  if (P) {
    cells.push({ id: 'pt1', r: 1, c: cols - 1 - P, text: '.', kind: 'point' });
    cells.push({ id: 'pt2', r: 2, c: cols - 1 - P, text: '.', kind: 'point' });
    cells.push({ id: 'pt3', r: 3, c: cols - 1 - P, text: '.', kind: 'auto' });
  }
  const ad = as.slice().reverse().map(Number); const bd = bs.slice().reverse().map(Number);
  const carries = [];
  let carry = 0;
  for (let i = 0; i < ss.length; i++) {
    const c = cols - 1 - i;
    const x = ad[i]; const y = bd[i];
    const s = (x || 0) + (y || 0) + carry;
    const carryIn = carry;
    carry = s >= 10 ? 1 : 0;
    const digit = ss[ss.length - 1 - i];
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const reveal = [];
    // Carries follow the digits shown on the paper: the 0 of "0.8" is a written digit too.
    const nextHasDigits = i + 1 < opLen;
    if (carry && nextHasDigits) {
      cells.push({ id: `k${c - 1}`, r: 0, c: c - 1, text: '1', kind: 'carry' });
      reveal.push(`k${c - 1}`);
      carries.push(c - 1);
    }
    if (P && i === P - 1) reveal.push('pt3');
    let text; let method;
    const name = placeName(i, P);
    if (i >= opLen) { text = `${placeName(i - 1, P)}进上来的 1，直接写 1`; method = `${placeName(i - 1, P)}进上来的 1，直接写下来`; } else {
      const terms = [x, y].filter((v) => v !== undefined);
      if (terms.length === 1 && !carryIn) { text = `${name}只有 ${terms[0]}，直接写 ${terms[0]}`; method = `${name}只有一个数，直接写下来`; } else {
        const expr = `${terms.join(' + ')}${carryIn ? ' + 1' : ''}`;
        text = `${expr} = ${s}`;
        if (s >= 10) text += nextHasDigits ? `，写 ${s % 10}，向${placeName(i + 1, P)}进 1` : `，写 ${s % 10}，1 写在${placeName(i + 1, P)}`;
        // In the 十分位 column the carry goes to 个位, so "只写个位" would read as a contradiction there.
        const into = placeName(i + 1, P); const keep = into === '个位' ? '得数的末位' : '个位';
        method = s >= 10 ? `${expr} 满十了：这一格只写${keep} □，向${into}进 1` : `${expr} = □`;
      }
    }
    const ids = [`a${c}`, `b${c}`, carryIn ? `k${c}` : null].filter(Boolean);
    steps.push({ cell: `s${c}`, token: digit, label: name, show: [], reveal, help: { ids, text, method } });
  }
  const have = new Set(cells.map((x) => x.id));
  for (const st of steps) st.help.ids = st.help.ids.filter((id) => have.has(id));
  return { kind: 'add', rows: 4, cols, rowH: [0.5, 1, 1, 1], cells, lines: [{ r: 2, c0: 0, c1: cols - 1, kind: 'rule' }], steps, bracket: null,
    data: { A, B, P, sum: S, carryCols: carries } };
}

// ================================================================ vertical subtraction
// Row 0 holds 退位点: a dot above every digit that lends 1 (including a 0 that lends through).
function buildSub(a, b, pa = 0, pb = 0) {
  const P = Math.max(pa, pb);
  const A = a * 10 ** (P - pa); const B = b * 10 ** (P - pb); const R = A - B;
  if (R < 0) throw new Error('negative difference');
  const as = digitsOf(A, P + 1); const bs = digitsOf(B, P + 1); const rs = digitsOf(R, P + 1);
  const cols = as.length + 1;
  const cells = []; const steps = [];
  as.forEach((d, i) => { const c = i + 1; cells.push({ id: `a${c}`, r: 1, c, text: d, kind: i >= as.length - (P - pa) ? 'pad' : 'given' }); });
  bs.forEach((d, i) => { const c = cols - bs.length + i; cells.push({ id: `b${c}`, r: 2, c, text: d, kind: i >= bs.length - (P - pb) ? 'pad' : 'given' }); });
  cells.push({ id: 'op', r: 2, c: 0, text: SYM.sub, kind: 'op' });
  if (P) {
    cells.push({ id: 'pt1', r: 1, c: cols - 1 - P, text: '.', kind: 'point' });
    cells.push({ id: 'pt2', r: 2, c: cols - 1 - P, text: '.', kind: 'point' });
    cells.push({ id: 'pt3', r: 3, c: cols - 1 - P, text: '.', kind: 'auto' });
  }
  const orig = [null, ...as.map(Number)];
  const cur = orig.slice();
  const bcol = (c) => { const i = c - (cols - bs.length); return i >= 0 ? Number(bs[i]) : null; };
  const dotted = [];
  for (let i = 0; i < rs.length; i++) {
    const c = cols - 1 - i;
    const show = [];
    const before = cur[c];
    const bd = bcol(c) ?? 0;
    const borrowed = before < bd;
    if (borrowed) {
      let k = c - 1;
      while (cur[k] === 0) { cur[k] = 9; show.push(`d${k}`); cells.push({ id: `d${k}`, r: 0, c: k, text: '·', kind: 'dot' }); dotted.push(k); k -= 1; }
      cur[k] -= 1; show.push(`d${k}`); cells.push({ id: `d${k}`, r: 0, c: k, text: '·', kind: 'dot' }); dotted.push(k);
      cur[c] += 10;
    }
    const digit = rs[rs.length - 1 - i];
    if (cur[c] - bd !== Number(digit)) throw new Error(`sub column mismatch ${A}-${B}`);
    cells.push({ id: `s${c}`, r: 3, c, text: digit, kind: 'input' });
    const lent = before !== orig[c];
    const name = placeName(i, P);
    let text; let method;
    // A 0 that was borrowed through: it first became 10, then lent 1 on, leaving 9.
    const through = lent && orig[c] === 0;
    const start = through ? `${name}是 0，先从${placeName(i + 1, P)}退 1 当作 10，再退 1 给${placeName(i - 1, P)}，还剩 9`
      : lent ? `${name}被退走 1 后是 ${before}` : '';
    if (borrowed) {
      text = `${start ? `${start}，` : `${name} `}${before} 不够减 ${bd}，从${placeName(i + 1, P)}退 1：${before + 10} − ${bd} = ${digit}`;
      method = `${start ? `${start}，` : `${name} `}${before} 不够减 ${bd}，从${placeName(i + 1, P)}退 1：${before + 10} − ${bd} = □`;
    } else if (bcol(c) === null) {
      text = `${start || `${name}是 ${before}`}，直接写 ${digit}`;
      method = `${start || `${name}下面没有数`}，直接写下来`;
    } else {
      text = `${start ? `${start}：` : ''}${before} − ${bd} = ${digit}`;
      method = `${start ? `${start}：` : ''}${before} − ${bd} = □`;
    }
    const ids = [`a${c}`, `b${c}`, dotted.includes(c) ? `d${c}` : null, ...show].filter((id) => id && (id.startsWith('d') || cells.some((x) => x.id === id)));
    steps.push({ cell: `s${c}`, token: digit, label: name, show, reveal: P && i === P - 1 ? ['pt3'] : [], help: { ids: [...new Set(ids)], text, method } });
  }
  return { kind: 'sub', rows: 4, cols, rowH: [0.5, 1, 1, 1], cells, lines: [{ r: 2, c0: 0, c1: cols - 1, kind: 'rule' }], steps, bracket: null,
    data: { A, B, P, diff: R, dotCols: dotted.slice().sort((x, y) => x - y) } };
}

// ================================================================ vertical multiplication (multi-digit × one digit)
// With trailing zeros in a (350 × 6) the multiplier sits under the last non-zero digit and the
// zeros are written straight down at the end of the product first (末尾的 0 不参与计算).
function buildMul(a, b) {
  const tz = trailingZeros(a);
  const core = a / 10 ** tz;
  const prod = a * b; const coreProd = core * b;
  const as = String(a); const ps = String(prod);
  const cols = Math.max(as.length, ps.length) + 1;
  const bc = cols - 1 - tz;
  const cells = []; const steps = [];
  [...as].forEach((d, i) => { const c = cols - as.length + i; cells.push({ id: `a${c}`, r: 0, c, text: d, kind: 'given' }); });
  cells.push({ id: 'b', r: 1, c: bc, text: String(b), kind: 'given' });
  cells.push({ id: 'op', r: 1, c: 0, text: SYM.mul, kind: 'op' });
  [...ps].forEach((d, i) => { const c = cols - ps.length + i; cells.push({ id: `p${c}`, r: 2, c, text: d, kind: 'input' }); });
  for (let j = 0; j < tz; j++) {
    const c = cols - 1 - j;
    steps.push({ cell: `p${c}`, token: '0', label: '末尾的 0', show: [], reveal: [],
      help: { ids: [`a${c}`], text: `${a} 末尾有 ${tz} 个 0，先把 0 直接写在积的末尾，再算 ${core} × ${b}`, method: `${a} 末尾有 ${tz} 个 0，先把 0 直接写在积的末尾` } });
  }
  const cd = String(core).split('').reverse().map(Number);
  const cps = String(coreProd);
  let carry = 0;
  for (let i = 0; i < cps.length; i++) {
    const c = cols - 1 - tz - i;
    const x = cd[i];
    const digit = cps[cps.length - 1 - i];
    let text; let ids; let method;
    if (x === undefined) { text = `进上来的 ${carry}，直接写 ${carry}`; method = '前一位进上来的数，直接写下来'; ids = []; carry = 0; } else {
      const v = x * b + carry;
      text = `${x} × ${b} = ${x * b}${x ? `（${koujue(x, b)}）` : ''}${carry ? `，再加进位 ${carry} 得 ${v}` : ''}`;
      if (v >= 10) text += i < cd.length - 1 ? `，写 ${v % 10}，向前一位进 ${Math.floor(v / 10)}` : `，写 ${v % 10}，${Math.floor(v / 10)} 写在前一位`;
      const how = `${x} × ${b}${x ? `（${koujue(x, b)}）` : ''}${carry ? `，再加进位 ${carry}` : ''}`;
      // A product of ten or more fills two places: this box takes only its ones digit.
      method = v >= 10 ? `${how}，满十了：这一格只写个位 □，向前一位进 ${Math.floor(v / 10)}` : `${how}，得 □`;
      ids = [`a${c}`, 'b'];
      carry = Math.floor(v / 10);
    }
    steps.push({ cell: `p${c}`, token: digit, label: placeName(i + tz), show: [], reveal: [], help: { ids, text, method } });
  }
  return { kind: 'mul', rows: 3, cols, rowH: [1, 1, 1], cells, lines: [{ r: 1, c0: 0, c1: cols - 1, kind: 'rule' }], steps, bracket: null,
    data: { a, b, tz, prod, bCol: bc } };
}

// ================================================================ long division (厂 shape), one-digit divisor
// Typed per round: 商 → 积 (left to right) → 相减的结果. The next digit comes down by itself.
// A zero remainder in the middle is not written; the last remainder is always written
// unless it is already on the paper (商末尾有 0 的情况).
function buildDiv(D, d) {
  const Ds = String(D); const off = 1; const cols = off + Ds.length;
  const cells = []; const steps = []; const lines = []; const rounds = [];
  cells.push({ id: 'dv', r: 1, c: 0, text: String(d), kind: 'given' });
  [...Ds].forEach((x, j) => cells.push({ id: `D${j}`, r: 1, c: off + j, text: x, kind: 'given' }));
  let k = 1;
  while (Number(Ds.slice(0, k)) < d && k < Ds.length) k += 1;
  let cur = Number(Ds.slice(0, k));
  let col = off + k - 1;
  let curIds = Array.from({ length: k }, (_, j) => `D${j}`);
  let rowCur = 1; let nextRow = 2; let rowEmpty = false;
  const pushStep = (st) => { steps.push(st); return st; };
  for (;;) {
    const last = col === cols - 1;
    const qd = Math.floor(cur / d);
    const qid = `q${col}`;
    cells.push({ id: qid, r: 0, c: col, text: String(qd), kind: 'input' });
    const round = { col, cur, qd, product: null, productRow: null, rest: null, restRow: null, restTyped: false };
    const qText = qd > 0
      ? `想：${d} 乘几最接近 ${cur} 又不超过它？${koujue(qd, d)}，商 ${qd}`
      : cur === 0 ? `这一位是 0，0 ÷ ${d} 商 0` : `${cur} 比 ${d} 小，不够商 1，商 0`;
    const qMethod = qd > 0 ? `想：${d} 乘几最接近 ${cur} 又不超过它？用 ${d} 的乘法口诀试一试`
      : cur === 0 ? `这一位是 0，0 ÷ ${d} 商几？` : `${cur} 和 ${d} 比一比：够不够商 1？`;
    let lastStep = pushStep({ cell: qid, token: String(qd), label: '商', show: [], reveal: [], help: { ids: ['dv', ...curIds], text: qText, method: qMethod } });
    let r = cur;
    if (qd > 0) {
      const m = qd * d; const ms = String(m);
      const pr = nextRow;
      const mids = [];
      [...ms].forEach((x, i) => {
        const c = col - (ms.length - 1 - i);
        const id = `m${pr}_${c}`;
        cells.push({ id, r: pr, c, text: x, kind: 'input' });
        mids.push(id);
        lastStep = pushStep({ cell: id, token: x, label: '积', show: [], reveal: [], help: { ids: [qid, 'dv'], text: `${qd} × ${d} = ${m}（${koujue(qd, d)}）`, method: `商 × 除数：${qd} × ${d}（${koujue(qd, d)}）` } });
      });
      const width = Math.max(ms.length, String(cur).length);
      const lid = `L${pr}`;
      lines.push({ id: lid, r: pr, c0: col - width + 1, c1: col, kind: 'rule', hidden: true });
      lastStep.reveal.push(lid);
      r = cur - m;
      round.product = m; round.productRow = pr; round.rest = r; round.restRow = pr + 1;
      const rr = pr + 1; nextRow = pr + 2;
      if (last || r > 0) {
        const rid = `r${rr}_${col}`;
        cells.push({ id: rid, r: rr, c: col, text: String(r), kind: 'input' });
        lastStep = pushStep({ cell: rid, token: String(r), label: last ? '余数' : '相减', show: [], reveal: [], help: { ids: [...curIds, ...mids], text: `${cur} − ${m} = ${r}`, method: `${cur} − ${m} = □` } });
        round.restTyped = true;
        curIds = [rid]; rowEmpty = false;
      } else { curIds = []; rowEmpty = true; }
      rowCur = rr;
    } else {
      round.rest = cur; round.restRow = rowCur;
    }
    rounds.push(round);
    if (last) break;
    col += 1;
    const nd = Ds[col - off];
    if (rowEmpty && nd === '0' && col !== cols - 1) {
      // A zero coming down after an exact subtraction is not written: 商 0 goes straight up.
      cur = 0;
      continue;
    }
    const bid = `bd${rowCur}_${col}`;
    cells.push({ id: bid, r: rowCur, c: col, text: nd, kind: 'auto', from: `D${col - off}` });
    lastStep.reveal.push(bid);
    curIds.push(bid);
    cur = r * 10 + Number(nd);
    rowEmpty = false;
  }
  const rows = Math.max(nextRow, rowCur + 1);
  const q = Math.floor(D / d); const rem = D % d;
  return { kind: 'div', rows, cols, rowH: Array(rows).fill(1), cells, lines, steps, bracket: { r: 1, c0: off, c1: cols - 1 },
    data: { D, d, q, rem, rounds, firstCol: off + k - 1 } };
}

// ================================================================ generators
// Each returns a partial problem: layout + { title?, text, answer, answerText, note?, data }.
const hExpr = (parts) => parts.join(' ');
const tokOf = (x) => (typeof x === 'number' ? { n: x } : { op: x });

function hArith(a, op, b, res, help, helpKeys = ['a', 'b'], method = null) {
  return buildH([{ n: a, key: 'a' }, { op }, { n: b, key: 'b' }, { op: SYM.eq }, { ans: res }], {
    text: hExpr([a, op, b]), answer: String(res), answerText: `${a} ${op} ${b} = ${res}`, help, helpKeys, method, data: { a, op, b, res },
  });
}

const GEN = {
  compose(rng) {
    const total = int(rng, 2, 10); const a = int(rng, 1, total - 1); const x = total - a;
    if (chance(rng, 0.5)) {
      return buildH([{ n: total, key: 't' }, { w: '可以分成' }, { n: a, key: 'a' }, { w: '和' }, { ans: x, label: '填空' }], {
        text: `${total} 可以分成 ${a} 和 □`, answer: String(x), answerText: `${total} 可以分成 ${a} 和 ${x}`,
        help: `${a} 和几合起来是 ${total}？${a} + ${x} = ${total}`, method: `${a} 和几合起来是 ${total}？${a} + □ = ${total}`, helpKeys: ['t', 'a'], data: { form: 'split', total, a, x },
      });
    }
    return buildH([{ n: a, key: 'a' }, { w: '和' }, { ans: x, label: '填空' }, { w: '组成' }, { n: total, key: 't' }], {
      text: `${a} 和 □ 组成 ${total}`, answer: String(x), answerText: `${a} 和 ${x} 组成 ${total}`,
      help: `${a} 和几合起来是 ${total}？${a} + ${x} = ${total}`, method: `${a} 和几合起来是 ${total}？${a} + □ = ${total}`, helpKeys: ['a', 't'], data: { form: 'join', total, a, x },
    });
  },
  add10(rng) {
    for (;;) {
      const a = int(rng, 0, 9); const b = int(rng, 0, 9);
      if (a + b > 10 || (a === 0 && b === 0) || ((a === 0 || b === 0) && chance(rng, 0.7))) continue;
      return hArith(a, SYM.add, b, a + b, `想：${a} 和 ${b} 组成几？${a} + ${b} = ${a + b}`);
    }
  },
  sub10(rng) {
    for (;;) {
      const a = int(rng, 1, 10); const b = int(rng, 0, a);
      if ((b === 0 || b === a) && chance(rng, 0.75)) continue;
      return hArith(a, SYM.sub, b, a - b, `想加算减：${b} + ${a - b} = ${a}，所以 ${a} − ${b} = ${a - b}`, ['a', 'b'], `想加算减：${b} + □ = ${a}`);
    }
  },
  chain(rng, { max, small }) {
    for (let g = 0; g < 2000; g++) {
      const num = () => (small ? int(rng, 1, 9) : chance(rng, 0.35) ? int(rng, 1, 9) * 10 : int(rng, 11, 89));
      const a = num(); const b = num(); const c = num();
      const o1 = chance(rng, 0.55) ? SYM.add : SYM.sub; const o2 = chance(rng, 0.5) ? SYM.add : SYM.sub;
      const s1 = OPS[o1](a, b); const s2 = OPS[o2](s1, c);
      if (s1 < 0 || s1 > max || s2 < 0 || s2 > max) continue;
      if (!small && (s2 === 0 || [a, b, c].filter((x) => x % 10 === 0).length > 1)) continue;
      return buildH([{ n: a, key: 'a' }, { op: o1 }, { n: b, key: 'b' }, { op: o2 }, { n: c, key: 'c' }, { op: SYM.eq }, { ans: s2 }], {
        text: hExpr([a, o1, b, o2, c]), answer: String(s2), answerText: `${a} ${o1} ${b} ${o2} ${c} = ${s2}`,
        help: `从左往右算：先算 ${a} ${o1} ${b} = ${s1}，再算 ${s1} ${o2} ${c} = ${s2}`, helpKeys: ['a', 'b'], data: { nums: [a, b, c], ops: [o1, o2], mid: s1, res: s2 },
      });
    }
    throw new Error('chain');
  },
  teen(rng) {
    const form = int(rng, 0, 4);
    if (form === 0) { const a = int(rng, 1, 9); return chance(rng, 0.5) ? hArith(10, SYM.add, a, 10 + a, `1 个十和 ${a} 个一合起来是 ${10 + a}`) : hArith(a, SYM.add, 10, 10 + a, `${a} 个一和 1 个十合起来是 ${10 + a}`); }
    if (form === 1 || form === 2) { const x = int(rng, 1, 8); const y = int(rng, 1, 9 - x); return hArith(10 + x, SYM.add, y, 10 + x + y, `先算个位：${x} + ${y} = ${x + y}，再加上 10 是 ${10 + x + y}`); }
    if (form === 3) { const x = int(rng, 2, 9); const y = int(rng, 1, x - 1); return hArith(10 + x, SYM.sub, y, 10 + x - y, `先算个位：${x} − ${y} = ${x - y}，再加上 10 是 ${10 + x - y}`); }
    const x = int(rng, 1, 9); return hArith(10 + x, SYM.sub, x, 10, `个位 ${x} − ${x} = 0，剩下 1 个十，是 10`);
  },
  carry20(rng) {
    for (;;) {
      const a = int(rng, 2, 9); const b = int(rng, 2, 9);
      if (a + b < 11) continue;
      const big = Math.max(a, b); const small = Math.min(a, b); const need = 10 - big; const rest = small - need;
      return hArith(a, SYM.add, b, a + b, `凑十法：${big} + ${need} = 10，把 ${small} 分成 ${need} 和 ${rest}，10 + ${rest} = ${a + b}`);
    }
  },
  missing20(rng) {
    for (;;) {
      const a = int(rng, 1, 12); const x = int(rng, 1, 12); const b = a + x;
      if (b > 20) continue;
      const left = chance(rng, 0.5);
      const toks = left ? [{ ans: x, label: '填空', box: true }, { op: SYM.add }, { n: a, key: 'a' }, { op: SYM.eq }, { n: b, key: 'b' }]
        : [{ n: a, key: 'a' }, { op: SYM.add }, { ans: x, label: '填空', box: true }, { op: SYM.eq }, { n: b, key: 'b' }];
      const text = left ? `□ + ${a} = ${b}` : `${a} + □ = ${b}`;
      return buildH(toks, { text, answer: String(x), answerText: `${text}，□ = ${x}`, help: `想：几和 ${a} 合起来是 ${b}？${b} − ${a} = ${x}`, helpKeys: ['a', 'b'], data: { form: left ? 'x+a=b' : 'a+x=b', a, b, x } });
    }
  },
  borrow20(rng) {
    for (;;) {
      const a = int(rng, 11, 18); const b = int(rng, 2, 9); const o = a % 10;
      if (o >= b) continue;
      return hArith(a, SYM.sub, b, a - b, `破十法：${a} = 10 + ${o}，10 − ${b} = ${10 - b}，${10 - b} + ${o} = ${a - b}`);
    }
  },
  twoDigitSimple(rng) {
    for (;;) {
      const form = int(rng, 0, 5);
      if (form === 0) { const x = int(rng, 1, 9); const y = int(rng, 1, 10 - x); return hArith(x * 10, SYM.add, y * 10, (x + y) * 10, `${x} 个十加 ${y} 个十是 ${x + y} 个十`, ['a', 'b'], `${x} 个十加 ${y} 个十是几个十？`); }
      if (form === 1) { const x = int(rng, 2, 9); const y = int(rng, 1, x - 1); return hArith(x * 10, SYM.sub, y * 10, (x - y) * 10, `${x} 个十减 ${y} 个十是 ${x - y} 个十`, ['a', 'b'], `${x} 个十减 ${y} 个十是几个十？`); }
      const a = int(rng, 21, 98); const t = Math.floor(a / 10); const o = a % 10;
      if (o === 0) continue;
      if (form === 2) { const b = int(rng, 1, 9); if (o + b > 9) continue; return hArith(a, SYM.add, b, a + b, `个位 ${o} + ${b} = ${o + b}，十位不变，是 ${a + b}`); }
      if (form === 3) { const y = int(rng, 1, 9 - t); if (y < 1 || t + y > 9) continue; return hArith(a, SYM.add, y * 10, a + y * 10, `十位 ${t} + ${y} = ${t + y}，个位不变，是 ${a + y * 10}`); }
      if (form === 4) { const b = int(rng, 1, o); return hArith(a, SYM.sub, b, a - b, `个位 ${o} − ${b} = ${o - b}，十位不变，是 ${a - b}`); }
      const y = int(rng, 1, t - 1); if (y < 1) continue; return hArith(a, SYM.sub, y * 10, a - y * 10, `十位 ${t} − ${y} = ${t - y}，个位不变，是 ${a - y * 10}`);
    }
  },
  add2d1carry(rng) {
    for (;;) {
      const a = int(rng, 11, 94); const b = int(rng, 2, 9); const o = a % 10;
      if (o === 0 || o + b < 10 || a + b > 100) continue;
      const tens = a - o;
      return hArith(a, SYM.add, b, a + b, `先算 ${o} + ${b} = ${o + b}，再算 ${tens} + ${o + b} = ${a + b}`);
    }
  },
  sub2d1borrow(rng) {
    for (;;) {
      const a = int(rng, 20, 99); const b = int(rng, 2, 9); const o = a % 10;
      if (o >= b) continue;
      const tens = a - o;
      return hArith(a, SYM.sub, b, a - b, `把 ${a} 分成 ${tens - 10} 和 ${10 + o}，${10 + o} − ${b} = ${10 + o - b}，${tens - 10} + ${10 + o - b} = ${a - b}`);
    }
  },
  vadd(rng, { da, db, max, minCarries = 0 }) {
    const want = minCarries ? minCarries + (chance(rng, 0.6) ? 1 : 0) : chance(rng, 0.5) ? 0 : 1;
    for (let g = 0; g < 4000; g++) {
      const a = nDigit(rng, range(rng, da)); const b = nDigit(rng, range(rng, db));
      if (a + b > max) continue;
      const c = carriesOf(a, b);
      if (want === 0 ? c !== 0 : c < want) continue;
      return { ...buildAdd(a, b), text: `${a} + ${b}`, answer: String(a + b), answerText: `${a} + ${b} = ${a + b}` };
    }
    throw new Error('vadd');
  },
  vsub(rng, { da, db }) {
    const wantBorrow = chance(rng, 0.6);
    for (let g = 0; g < 4000; g++) {
      const a = nDigit(rng, da); const b = nDigit(rng, db);
      if (b >= a) continue;
      if ((borrowsOf(a, b) > 0) !== wantBorrow) continue;
      return { ...buildSub(a, b), text: `${a} − ${b}`, answer: String(a - b), answerText: `${a} − ${b} = ${a - b}` };
    }
    throw new Error('vsub');
  },
  // 三位数减法: always with 隔位退位 (a zero in the minuend lends through).
  vsubZero(rng) {
    for (let g = 0; g < 4000; g++) {
      const h = int(rng, 1, 9);
      const a = chance(rng, 0.25) ? h * 100 : h * 100 + int(rng, 0, 8);
      const b = chance(rng, 0.7) ? nDigit(rng, 3) : nDigit(rng, 2);
      if (b >= a || a - b < 10) continue;
      const lay = buildSub(a, b);
      // Needs a 0 digit that became a lender (退位点 on a zero).
      const zeroLent = lay.data.dotCols.some((c) => lay.cells.find((x) => x.id === `a${c}`).text === '0');
      if (!zeroLent) continue;
      return { ...lay, text: `${a} − ${b}`, answer: String(a - b), answerText: `${a} − ${b} = ${a - b}` };
    }
    throw new Error('vsubZero');
  },
  kou(rng, { tables }) {
    const t = pickOne(rng, tables); const x = int(rng, 1, t);
    const [a, b] = chance(rng, 0.5) ? [x, t] : [t, x];
    return hArith(a, SYM.mul, b, a * b, `口诀：${koujue(a, b)}，${a} × ${b} = ${a * b}`, ['a', 'b'], `口诀：${koujue(a, b)}`);
  },
  kouMix(rng) {
    for (;;) {
      const a = int(rng, 1, 9); const b = int(rng, 1, 9);
      if ((a === 1 || b === 1) && chance(rng, 0.7)) continue;
      return hArith(a, SYM.mul, b, a * b, `口诀：${koujue(a, b)}，${a} × ${b} = ${a * b}`, ['a', 'b'], `口诀：${koujue(a, b)}`);
    }
  },
  divTable(rng, { divisors, qmax }) {
    for (;;) {
      const d = pickOne(rng, divisors); const q = int(rng, 1, qmax);
      if (d === 1 && chance(rng, 0.8)) continue;
      if (q === 1 && chance(rng, 0.7)) continue;
      const D = d * q;
      return hArith(D, SYM.div, d, q, `想：几乘 ${d} 得 ${D}？${koujue(q, d)}，所以商是 ${q}`, ['a', 'b'], `想：几乘 ${d} 得 ${D}？${koujue(q, d)}`);
    }
  },
  divRem(rng) {
    for (;;) {
      const d = int(rng, 2, 9); const q = int(rng, 1, 9); const r = int(rng, 1, d - 1);
      const D = q * d + r;
      if (D < 10 && chance(rng, 0.7)) continue;
      return buildH([{ n: D, key: 'D' }, { op: SYM.div }, { n: d, key: 'd' }, { op: SYM.eq }, { ans: q, label: '商' }, { w: '……' }, { ans: r, label: '余数' }], {
        text: `${D} ÷ ${d}`, answer: `${q}……${r}`, answerText: `${D} ÷ ${d} = ${q}……${r}`,
        help: `想：${d} 乘几最接近 ${D} 又不超过它？${koujue(q, d)}，${D} − ${q * d} = ${r}，余数 ${r} 比 ${d} 小`, method: `想：${d} 乘几最接近 ${D} 又不超过它？用 ${d} 的口诀试一试，余数要比 ${d} 小`, helpKeys: ['D', 'd'], data: { D, d, q, r },
      });
    }
  },
  oralAddSub(rng) {
    for (;;) {
      const form = int(rng, 0, 5);
      if (form === 0) { const x = int(rng, 1, 9); const y = int(rng, 1, 9); if (x + y > 10) continue; return hArith(x * 100, SYM.add, y * 100, (x + y) * 100, `${x} 个百加 ${y} 个百是 ${x + y} 个百`, ['a', 'b'], `${x} 个百加 ${y} 个百是几个百？`); }
      if (form === 1) { const x = int(rng, 11, 19); const y = int(rng, 2, 9); if (x - y < 1) continue; return hArith(x * 100, SYM.sub, y * 100, (x - y) * 100, `${x} 个百减 ${y} 个百是 ${x - y} 个百`, ['a', 'b'], `${x} 个百减 ${y} 个百是几个百？`); }
      if (form === 2) { const a = int(rng, 11, 89) * 10; const y = int(rng, 1, 9); if (a % 100 === 0 || (a / 10) % 10 + y > 9) continue; return hArith(a, SYM.add, y * 10, a + y * 10, `${a / 10} 个十加 ${y} 个十是 ${a / 10 + y} 个十`, ['a', 'b'], `${a / 10} 个十加 ${y} 个十是几个十？`); }
      if (form === 3) { const a = int(rng, 12, 79); const b = int(rng, 12, 89); if (a + b > 100 || a % 10 === 0 || b % 10 === 0) continue; const bt = b - (b % 10); return hArith(a, SYM.add, b, a + b, `先算 ${a} + ${bt} = ${a + bt}，再算 ${a + bt} + ${b % 10} = ${a + b}`); }
      const a = int(rng, 31, 99); const b = int(rng, 12, 89); if (b >= a || a % 10 === 0 || b % 10 === 0) continue;
      const bt = b - (b % 10);
      return hArith(a, SYM.sub, b, a - b, `先算 ${a} − ${bt} = ${a - bt}，再算 ${a - bt} − ${b % 10} = ${a - b}`);
    }
  },
  missingAll(rng) {
    for (;;) {
      const form = int(rng, 0, 7);
      let toks; let text; let x; let help; let form2;
      const B = (v) => ({ ans: v, label: '填空', box: true });
      if (form <= 3) {
        const p = int(rng, 11, 60); const q = int(rng, 11, 60);
        if (form === 0) { x = p; const s = p + q; if (s > 100) continue; toks = [B(x), { op: SYM.add }, { n: q, key: 'a' }, { op: SYM.eq }, { n: s, key: 'b' }]; text = `□ + ${q} = ${s}`; help = `一个加数 = 和 − 另一个加数：${s} − ${q} = ${x}`; form2 = 'x+a=b'; }
        else if (form === 1) { x = p; const s = p + q; if (s > 100) continue; toks = [{ n: q, key: 'a' }, { op: SYM.add }, B(x), { op: SYM.eq }, { n: s, key: 'b' }]; text = `${q} + □ = ${s}`; help = `一个加数 = 和 − 另一个加数：${s} − ${q} = ${x}`; form2 = 'a+x=b'; }
        else if (form === 2) { x = p + q; if (x > 100) continue; toks = [B(x), { op: SYM.sub }, { n: q, key: 'a' }, { op: SYM.eq }, { n: p, key: 'b' }]; text = `□ − ${q} = ${p}`; help = `被减数 = 差 + 减数：${p} + ${q} = ${x}`; form2 = 'x-a=b'; }
        else { const a = p + q; if (a > 100) continue; x = q; toks = [{ n: a, key: 'a' }, { op: SYM.sub }, B(x), { op: SYM.eq }, { n: p, key: 'b' }]; text = `${a} − □ = ${p}`; help = `减数 = 被减数 − 差：${a} − ${p} = ${x}`; form2 = 'a-x=b'; }
      } else {
        const m = int(rng, 2, 9); const n = int(rng, 2, 9); const prod = m * n;
        if (form === 4) { x = n; toks = [{ n: m, key: 'a' }, { op: SYM.mul }, B(x), { op: SYM.eq }, { n: prod, key: 'b' }]; text = `${m} × □ = ${prod}`; help = `一个因数 = 积 ÷ 另一个因数：${prod} ÷ ${m} = ${x}（${koujue(m, n)}）`; form2 = 'a*x=b'; }
        else if (form === 5) { x = m; toks = [B(x), { op: SYM.mul }, { n: n, key: 'a' }, { op: SYM.eq }, { n: prod, key: 'b' }]; text = `□ × ${n} = ${prod}`; help = `一个因数 = 积 ÷ 另一个因数：${prod} ÷ ${n} = ${x}（${koujue(m, n)}）`; form2 = 'x*a=b'; }
        else if (form === 6) { x = n; toks = [{ n: prod, key: 'a' }, { op: SYM.div }, B(x), { op: SYM.eq }, { n: m, key: 'b' }]; text = `${prod} ÷ □ = ${m}`; help = `除数 = 被除数 ÷ 商：${prod} ÷ ${m} = ${x}（${koujue(m, n)}）`; form2 = 'a/x=b'; }
        else { x = prod; toks = [B(x), { op: SYM.div }, { n: n, key: 'a' }, { op: SYM.eq }, { n: m, key: 'b' }]; text = `□ ÷ ${n} = ${m}`; help = `被除数 = 商 × 除数：${m} × ${n} = ${x}（${koujue(m, n)}）`; form2 = 'x/a=b'; }
      }
      return buildH(toks, { text, answer: String(x), answerText: `${text}，□ = ${x}`, help, helpKeys: ['a', 'b'], data: { form: form2, x } });
    }
  },
  mix2(rng) {
    for (let g = 0; g < 5000; g++) {
      const form = int(rng, 0, 9);
      const s = int(rng, 2, 9); const t = int(rng, 2, 9); const big = int(rng, 10, 90); const u = int(rng, 1, 30);
      let e; let first; let mid; let res;
      // Indexes (in e) of the two numbers of the first step, for the second-level highlight.
      const fk = [[2, 4], [2, 4], [0, 2], [0, 2], [0, 2], [2, 4], [1, 3], [1, 3], [1, 3], [1, 3]][form];
      // e: token list; first: description of the first step.
      if (form === 0) { mid = s * t; res = big + mid; e = [big, SYM.add, s, SYM.mul, t]; first = `先算乘法：${s} × ${t} = ${mid}，再算 ${big} + ${mid} = ${res}`; }
      else if (form === 1) { mid = s * t; res = big - mid; e = [big, SYM.sub, s, SYM.mul, t]; first = `先算乘法：${s} × ${t} = ${mid}，再算 ${big} − ${mid} = ${res}`; }
      else if (form === 2) { mid = s * t; res = mid + u; e = [s, SYM.mul, t, SYM.add, u]; first = `先算乘法：${s} × ${t} = ${mid}，再算 ${mid} + ${u} = ${res}`; }
      else if (form === 3) { mid = s * t; res = mid - u; e = [s, SYM.mul, t, SYM.sub, u]; first = `先算乘法：${s} × ${t} = ${mid}，再算 ${mid} − ${u} = ${res}`; }
      else if (form === 4) { const D = s * t; mid = t; res = mid + u; e = [D, SYM.div, s, SYM.add, u]; first = `先算除法：${D} ÷ ${s} = ${mid}，再算 ${mid} + ${u} = ${res}`; }
      else if (form === 5) { const D = s * t; mid = t; res = big - mid; e = [big, SYM.sub, D, SYM.div, s]; first = `先算除法：${D} ÷ ${s} = ${mid}，再算 ${big} − ${mid} = ${res}`; }
      else if (form === 6) { const x = int(rng, 1, 8); const y = int(rng, 1, 9 - x); mid = x + y; res = mid * s; e = ['(', x, SYM.add, y, ')', SYM.mul, s]; first = `先算括号里：${x} + ${y} = ${mid}，再算 ${mid} × ${s} = ${res}`; }
      else if (form === 7) { const y = int(rng, 1, 30); const x = s * t + y; mid = s * t; res = t; e = ['(', x, SYM.sub, y, ')', SYM.div, s]; first = `先算括号里：${x} − ${y} = ${mid}，再算 ${mid} ÷ ${s} = ${res}`; }
      else if (form === 8) { const x = int(rng, 1, s * t - 1); const y = s * t - x; mid = s * t; res = t; e = ['(', x, SYM.add, y, ')', SYM.div, s]; first = `先算括号里：${x} + ${y} = ${mid}，再算 ${mid} ÷ ${s} = ${res}`; }
      else { const x = int(rng, 11, 60); const y = int(rng, 1, x - 1); mid = x - y; if (mid > 9) continue; res = mid * s; e = ['(', x, SYM.sub, y, ')', SYM.mul, s]; first = `先算括号里：${x} − ${y} = ${mid}，再算 ${mid} × ${s} = ${res}`; }
      if (!Number.isInteger(res) || res < 0 || res > 100 || mid < 0) continue;
      const toks = e.map((x, i) => (typeof x === 'number' ? { n: x, key: `n${i}` } : { op: x }));
      const text = e.join(' ').replace(/\( /g, '(').replace(/ \)/g, ')');
      return buildH([...toks, { op: SYM.eq }, { ans: res }], { text, answer: String(res), answerText: `${text} = ${res}`, help: first, helpKeys: fk.map((i) => `n${i}`), data: { expr: text, res } });
    }
    throw new Error('mix2');
  },
  oralMul(rng) {
    for (;;) {
      const form = int(rng, 0, 2); const b = int(rng, 2, 9);
      if (form === 0) { const x = int(rng, 1, 9); if (x === 1 && chance(rng, 0.6)) continue; return hArith(x * 10, SYM.mul, b, x * 10 * b, `先算 ${x} × ${b} = ${x * b}，再在末尾添 1 个 0：${x * 10 * b}`); }
      if (form === 1) { const x = int(rng, 1, 9); if (x === 1 && chance(rng, 0.6)) continue; return hArith(x * 100, SYM.mul, b, x * 100 * b, `先算 ${x} × ${b} = ${x * b}，再在末尾添 2 个 0：${x * 100 * b}`); }
      const a = int(rng, 11, 49); if (a % 10 === 0 || a * b > 99) continue;
      const t = a - (a % 10);
      return hArith(a, SYM.mul, b, a * b, `${t} × ${b} = ${t * b}，${a % 10} × ${b} = ${(a % 10) * b}，${t * b} + ${(a % 10) * b} = ${a * b}`);
    }
  },
  vmul(rng, { da }) {
    for (let g = 0; g < 4000; g++) {
      const b = int(rng, 2, 9);
      let a;
      if (da === 2) { a = int(rng, 12, 99); if (a % 10 === 0) continue; if (Math.floor(((a % 10) * b) / 10) === 0 && chance(rng, 0.8)) continue; }
      else {
        const cat = rng();
        if (cat < 0.5) { a = int(rng, 111, 999); const s = String(a); if (s.includes('0') || String(a * b).length < 4 && chance(rng, 0.3)) continue; if (Math.floor(((a % 10) * b) / 10) === 0 || Math.floor((((Math.floor(a / 10) % 10) * b) + Math.floor(((a % 10) * b) / 10)) / 10) === 0) continue; }
        else if (cat < 0.75) { a = int(rng, 1, 9) * 100 + int(rng, 1, 9); }
        else { a = int(rng, 1, 9) * 100 + int(rng, 1, 9) * 10; }
      }
      return { ...buildMul(a, b), text: `${a} × ${b}`, answer: String(a * b), answerText: `${a} × ${b} = ${a * b}` };
    }
    throw new Error('vmul');
  },
  estimate(rng) {
    for (;;) {
      const form = int(rng, 0, 3);
      const round = (n, u) => Math.round(n / u) * u;
      if (form === 0) {
        const a = int(rng, 12, 89); const b = int(rng, 12, 89);
        if (a % 10 === 0 || b % 10 === 0) continue;
        const ra = round(a, 10); const rb = round(b, 10); const res = ra + rb;
        return est(`${a} + ${b}`, res, '把每个数四舍五入到整十，再计算', `${a} ≈ ${ra}，${b} ≈ ${rb}，${ra} + ${rb} = ${res}`, { op: SYM.add, a, b, unit: 10, each: true });
      }
      if (form === 1) {
        const a = int(rng, 101, 899); const b = int(rng, 101, 899); const add = chance(rng, 0.5);
        if (a % 100 === 0 || b % 100 === 0) continue;
        const ra = round(a, 100); const rb = round(b, 100);
        if (add) { if (ra + rb > 1000) continue; return est(`${a} + ${b}`, ra + rb, '把每个数四舍五入到整百，再计算', `${a} ≈ ${ra}，${b} ≈ ${rb}，${ra} + ${rb} = ${ra + rb}`, { op: SYM.add, a, b, unit: 100, each: true }); }
        if (a <= b || ra - rb <= 0) continue;
        return est(`${a} − ${b}`, ra - rb, '把每个数四舍五入到整百，再计算', `${a} ≈ ${ra}，${b} ≈ ${rb}，${ra} − ${rb} = ${ra - rb}`, { op: SYM.sub, a, b, unit: 100, each: true });
      }
      const b = int(rng, 2, 9);
      if (form === 2) {
        const a = int(rng, 12, 98); if (a % 10 === 0) continue;
        const ra = round(a, 10);
        return est(`${a} × ${b}`, ra * b, '把两位数四舍五入到整十，再计算', `${a} ≈ ${ra}，${ra} × ${b} = ${ra * b}`, { op: SYM.mul, a, b, unit: 10, each: false });
      }
      const a = int(rng, 102, 898); if (a % 100 === 0) continue;
      const ra = round(a, 100);
      return est(`${a} × ${b}`, ra * b, '把三位数四舍五入到整百，再计算', `${a} ≈ ${ra}，${ra} × ${b} = ${ra * b}`, { op: SYM.mul, a, b, unit: 100, each: false });
    }
  },
  fracSame(rng) {
    for (;;) {
      const d = int(rng, 3, 12); const form = int(rng, 0, 4);
      const f = (n) => ({ f: [n, d], key: 'f', keyN: 'fn', keyD: 'fd' });
      const fa = (n) => ({ fa: [n, d], keysD: ['fd'], keysN: ['fn'] });
      if (form <= 1) {
        const n1 = int(rng, 1, d - 2); const n2 = int(rng, 1, d - 1 - n1); if (n2 < 1) continue;
        return buildH([f(n1), { op: SYM.add }, f(n2), { op: SYM.eq }, fa(n1 + n2)], { text: `${n1}/${d} + ${n2}/${d}`, answer: `${n1 + n2}/${d}`, answerText: `${n1}/${d} + ${n2}/${d} = ${n1 + n2}/${d}`, help: `分母不变，分子相加：${n1} + ${n2} = ${n1 + n2}`, method: `分母不变（还是 ${d}），分子相加：${n1} + ${n2} = □`, helpKeys: ['f'], data: { op: SYM.add, n1, n2, d, rn: n1 + n2 } });
      }
      if (form <= 3) {
        const n1 = int(rng, 2, d - 1); const n2 = int(rng, 1, n1 - 1);
        return buildH([f(n1), { op: SYM.sub }, f(n2), { op: SYM.eq }, fa(n1 - n2)], { text: `${n1}/${d} − ${n2}/${d}`, answer: `${n1 - n2}/${d}`, answerText: `${n1}/${d} − ${n2}/${d} = ${n1 - n2}/${d}`, help: `分母不变，分子相减：${n1} − ${n2} = ${n1 - n2}`, method: `分母不变（还是 ${d}），分子相减：${n1} − ${n2} = □`, helpKeys: ['f'], data: { op: SYM.sub, n1, n2, d, rn: n1 - n2 } });
      }
      const n2 = int(rng, 1, d - 1);
      return buildH([{ n: 1, key: 'one' }, { op: SYM.sub }, f(n2), { op: SYM.eq }, { fa: [d - n2, d], keysD: ['fd'], keysN: ['one', 'fn'] }], { text: `1 − ${n2}/${d}`, answer: `${d - n2}/${d}`, answerText: `1 − ${n2}/${d} = ${d - n2}/${d}`, help: `把 1 看成 ${d}/${d}：${d} − ${n2} = ${d - n2}`, method: `把 1 看成 ${d}/${d}，分母不变，分子 ${d} − ${n2} = □`, helpKeys: ['one', 'f'], data: { op: SYM.sub, n1: d, n2, d, rn: d - n2, one: true } });
    }
  },
  fracOf(rng) {
    let d; let n;
    do { d = pickOne(rng, [2, 3, 4, 5, 6, 8]); n = int(rng, 1, d - 1); } while (gcd(n, d) !== 1);
    const k = int(rng, 2, 9);
    const whole = d * k; const res = n * k;
    return buildH([{ n: whole, key: 'w' }, { w: '的' }, { f: [n, d], key: 'f' }, { w: '是' }, { ans: res }], {
      text: `${whole} 的 ${n}/${d}`, answer: String(res), answerText: `${whole} 的 ${n}/${d} 是 ${res}`,
      help: `先求 1 份：${whole} ÷ ${d} = ${k}，再求 ${n} 份：${k} × ${n} = ${res}`,
      method: n === 1 ? `把 ${whole} 平均分成 ${d} 份，1 份是 ${whole} ÷ ${d} = □` : `先求 1 份：${whole} ÷ ${d} = ${k}，再求 ${n} 份：${k} × ${n} = □`,
      helpKeys: ['w', 'f'], data: { whole, n, d, res },
    });
  },
  oralDiv(rng) {
    for (;;) {
      const form = int(rng, 0, 3); const d = int(rng, 2, 9);
      if (form === 0) { const q = int(rng, 1, 4); if (q * d > 9 || (q === 1 && chance(rng, 0.6))) continue; const D = q * d * 10; return hArith(D, SYM.div, d, q * 10, `${q * d} 个十 ÷ ${d} = ${q} 个十，是 ${q * 10}`, ['a', 'b'], `${q * d} 个十 ÷ ${d} = 几个十？`); }
      if (form === 1) { const q = int(rng, 1, 4); if (q * d > 9 || (q === 1 && chance(rng, 0.6))) continue; const D = q * d * 100; return hArith(D, SYM.div, d, q * 100, `${q * d} 个百 ÷ ${d} = ${q} 个百，是 ${q * 100}`, ['a', 'b'], `${q * d} 个百 ÷ ${d} = 几个百？`); }
      if (form === 2) {
        // 几百几十 ÷ 一位数: 240 ÷ 6 (表内) or 480 ÷ 4 (每一位都能除尽).
        let q;
        if (chance(rng, 0.5)) { q = int(rng, 2, 9); if (q * d < 10) continue; } else {
          const t = int(rng, 1, 4); const o = int(rng, 1, 4); const D2 = (t * 10 + o) * d;
          if (D2 > 99 || Math.floor(D2 / 10) % d || (D2 % 10) % d) continue;
          q = D2 / d;
        }
        const D = q * d * 10;
        return hArith(D, SYM.div, d, q * 10, `先算 ${q * d} ÷ ${d} = ${q}，所以 ${D} ÷ ${d} = ${q * 10}`);
      }
      const t = int(rng, 1, 4); const o = int(rng, 1, 4); const D = (t * 10 + o) * d;
      if (D > 99 || Math.floor(D / 10) % d || (D % 10) % d) continue;
      const tt = Math.floor(D / 10) * 10;
      return hArith(D, SYM.div, d, D / d, `${tt} ÷ ${d} = ${tt / d}，${D % 10} ÷ ${d} = ${(D % 10) / d}，${tt / d} + ${(D % 10) / d} = ${D / d}`);
    }
  },
  vdiv(rng, { mode }) {
    for (let g = 0; g < 6000; g++) {
      const d = int(rng, 2, 9);
      let D;
      if (mode === 'rem1') {
        const q = int(rng, 1, 9); const r = chance(rng, 0.85) ? int(rng, 1, d - 1) : 0; D = q * d + r;
        if (D < 10 || D >= 10 * d) continue;
      } else if (mode === 'd21') {
        D = int(rng, 10, 99);
        if (Math.floor(D / 10) < d) continue;
        if (D % d === 0 && chance(rng, 0.4)) continue;
      } else {
        const cat = int(rng, 0, 3);
        const q0 = int(rng, 10, 499); const r = chance(rng, 0.6) ? int(rng, 1, d - 1) : 0;
        D = q0 * d + r;
        if (D < 100 || D > 999) continue;
        const qs = String(Math.floor(D / d)); const first = Math.floor(D / 100);
        if (cat === 0 && !(first >= d && !qs.includes('0'))) continue;
        if (cat === 1 && !(first < d && !qs.includes('0'))) continue;
        if (cat === 2 && !(qs.length === 3 && qs[1] === '0' && qs[2] !== '0')) continue;
        if (cat === 3 && !(qs.endsWith('0'))) continue;
      }
      const lay = buildDiv(D, d);
      const q = Math.floor(D / d); const rem = D % d;
      return { ...lay, text: `${D} ÷ ${d}`, answer: rem ? `${q}……${rem}` : String(q), answerText: rem ? `${D} ÷ ${d} = ${q}……${rem}` : `${D} ÷ ${d} = ${q}` };
    }
    throw new Error('vdiv');
  },
  vdec(rng) {
    for (let g = 0; g < 4000; g++) {
      const form = int(rng, 0, 4);
      // 0.1～0.9 in one out of five operands (三下课本里 0.5 + 0.3、1.2 − 0.8 这类).
      const tenths = () => { const u = rng(); return u < 0.2 ? int(rng, 1, 9) : u < 0.84 ? int(rng, 11, 299) : int(rng, 11, 999); };
      if (form <= 1) {
        const a = tenths(); const b = tenths();
        if (a % 10 === 0 || b % 10 === 0 || (a + b) % 10 === 0) continue;
        return { ...buildAdd(a, b, 1, 1), text: `${decStr(a, 1)} + ${decStr(b, 1)}`, answer: decStr(a + b, 1), answerText: `${decStr(a, 1)} + ${decStr(b, 1)} = ${decStr(a + b, 1)}` };
      }
      if (form <= 3) {
        const a = tenths(); const b = tenths();
        if (a % 10 === 0 || b % 10 === 0 || b >= a || (a - b) % 10 === 0) continue;
        return { ...buildSub(a, b, 1, 1), text: `${decStr(a, 1)} − ${decStr(b, 1)}`, answer: decStr(a - b, 1), answerText: `${decStr(a, 1)} − ${decStr(b, 1)} = ${decStr(a - b, 1)}` };
      }
      const a = int(rng, 2, 30); const b = int(rng, 1, a * 10 - 1);
      if (b % 10 === 0) continue;
      return { ...buildSub(a, b, 0, 1), text: `${a} − ${decStr(b, 1)}`, answer: decStr(a * 10 - b, 1), answerText: `${a} − ${decStr(b, 1)} = ${decStr(a * 10 - b, 1)}` };
    }
    throw new Error('vdec');
  },
};

function est(expr, res, rule, help, data) {
  const [a, op, b] = expr.split(' ');
  return buildH([{ n: Number(a), key: 'a' }, { op }, { n: Number(b), key: 'b' }, { op: SYM.approx }, { ans: res }], {
    text: `${expr} ≈ □`, answer: String(res), answerText: `${expr} ≈ ${res}`, note: `估算规则：${rule}`, help, helpKeys: ['a', 'b'], data: { ...data, res },
  });
}

// ================================================================ public API
// Repeats are judged by what the child sees: the problem text (spaces removed), whatever the skill.
// "80 ÷ 2" as 口算 and as 除法竖式 therefore count as the same problem.
export const signature = (p) => String(p.text).replace(/\s+/g, '');

// One problem for a skill, avoiding signatures in `avoid` when possible.
export function makeProblem(skillId, rng, avoid = null) {
  const sk = SKILL[skillId];
  if (!sk) throw new Error(`unknown skill ${skillId}`);
  const [name, params] = sk.gen;
  let p;
  for (let tries = 0; tries < 60; tries++) {
    p = GEN[name](rng, params || {});
    p.skill = skillId;
    if (!avoid || !avoid.has(signature(p))) break;
  }
  p.title = sk.short;
  p.input = sk.input;
  if (!p.answers) p.answers = [p.steps.map((s) => s.token)];
  return p;
}

// n problems for a skill from a seed, without repeats (as far as the skill allows).
export function generate(skillId, n = 10, seed = 1) {
  const rng = makeRng(seed);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = makeProblem(skillId, rng, seen);
    seen.add(signature(p));
    out.push(p);
  }
  return out;
}

// Plain summary used by window.__game.generate (题面 + 答案).
export function summarize(p) {
  return { skill: p.skill, title: p.title, kind: p.kind, input: p.input, text: p.text, note: p.note || null, answer: p.answer, answerText: p.answerText, answers: p.answers.map((a) => a.slice()), steps: p.steps.map((s) => ({ token: s.token, label: s.label })) };
}

export const _internal = { buildAdd, buildSub, buildMul, buildDiv, buildH, GEN, decStr };
