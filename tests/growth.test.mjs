// 进步了和时间胶囊（growth.js）：比较对象、边界、只报进步、胶囊的选择和放置、做完后的比较。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as gr from '../app/js/growth.js';
import * as pg from '../app/js/progress.js';
import { generate, signature } from '../app/js/problems.js';
import { planBasic } from '../app/js/session.js';
import { makeRng } from '../app/js/problems.js';

const DAY = pg.DAY_MS;
const TODAY = '2026-03-10';
const ID = 'g1b-vadd2';
const ID2 = 'g2a-kou5';
const ID3 = 'g3b-vdiv21';
const g = (day, n, first, ms, cells) => ({ day, n, first, ms, cells });
const rec = (days, first3 = []) => ({ ...pg.emptyRec(), days, first3 });
const f3 = (day, ms, misses, steps = 4) => ({ p: { steps: Array(steps).fill({}) }, day, at: 1, ms, misses, used: false });

test('进步了: today is compared with the last earlier day, never with today', () => {
  const cur = g(TODAY, 3, 3, 3 * 4 * 1000, 12);
  // Only today exists: nothing to compare with.
  assert.equal(gr.compareSkill(rec([cur]), cur, TODAY), null);
  // A slower session earlier today is not a reference.
  assert.equal(gr.compareSkill(rec([g(TODAY, 5, 1, 5 * 4 * 5000, 20)]), cur, TODAY), null);
  const r = rec([g('2026-03-08', 4, 4, 4 * 4 * 2000, 16), cur]);
  const x = gr.compareSkill(r, cur, TODAY);
  assert.equal(x.kind, 'prev'); assert.equal(x.day, '2026-03-08'); assert.equal(x.what, 'time');
  assert.equal(x.from, 8000); assert.equal(x.to, 4000); assert.equal(x.gain, 0.5);
  // first3 with one problem done today is skipped (same day).
  const r2 = rec([cur], [f3('2026-03-01', 20000, 0), f3('2026-03-01', 20000, 0), f3(TODAY, 20000, 0)]);
  assert.equal(gr.compareSkill(r2, cur, TODAY), null);
});

test('进步了: both sides need at least 3 problems', () => {
  const past = g('2026-03-08', 3, 0, 3 * 4 * 3000, 12);
  assert.equal(gr.compareSkill(rec([past]), g(TODAY, 2, 2, 2 * 4 * 1000, 8), TODAY), null, 'today 2 problems');
  assert.ok(gr.compareSkill(rec([past]), g(TODAY, 3, 3, 3 * 4 * 1000, 12), TODAY), 'today 3 problems');
  const small = g('2026-03-08', 2, 0, 2 * 4 * 3000, 8);
  assert.equal(gr.compareSkill(rec([small]), g(TODAY, 5, 5, 5 * 4 * 1000, 20), TODAY), null, 'reference day with 2 problems');
  // The last day before today had 2 problems: no 上次 (the day before it is not used instead).
  assert.equal(gr.compareSkill(rec([past, g('2026-03-09', 2, 0, 2 * 4 * 9000, 8)]), g(TODAY, 3, 3, 3 * 4 * 1000, 12), TODAY), null);
  // first3 needs 3 entries.
  assert.equal(gr.compareSkill(rec([], [f3('2026-01-01', 30000, 3), f3('2026-01-01', 30000, 3)]), g(TODAY, 3, 3, 3 * 4 * 1000, 12), TODAY), null);
});

test('进步了: 10% faster per cell is the boundary (exact integers)', () => {
  const past = g('2026-03-08', 4, 4, 4 * 5 * 1000, 20); // 1000 ms per cell
  const at = (ms, cells) => gr.compareSkill(rec([past]), g(TODAY, 3, 3, ms, cells), TODAY);
  const x = at(3 * 3 * 900, 9); // exactly 900 ms per cell: 10% faster
  assert.equal(x.what, 'time'); assert.equal(x.gain, 0.1);
  assert.equal(at(3 * 3 * 900 + 1, 9), null, '1 ms slower than the boundary');
  // shown per problem at today's average cells (3 cells): 3000 → 2700
  assert.equal(Math.round(x.from), 3000); assert.equal(Math.round(x.to), 2700);
  // Per cell, not per problem: today's problems are twice as long but the same speed per cell.
  assert.equal(at(3 * 10 * 1000, 30), null);
});

test('进步了: 10 percentage points of first-try rate is the boundary', () => {
  // 5 of 10 = 50% before; 6 of 10 = 60% today (0.6 - 0.5 is 0.0999… in floating point).
  const past = g('2026-03-08', 10, 5, 10 * 4 * 1000, 40);
  const cur = (first) => g(TODAY, 10, first, 10 * 4 * 1000, 40);
  const x = gr.compareSkill(rec([past]), cur(6), TODAY);
  assert.equal(x.what, 'rate'); assert.equal(x.from, 0.5); assert.equal(x.to, 0.6);
  // 5 of 9 = 55.6% → 2 of 3 = 66.7%: 11.1 points
  assert.equal(gr.compareSkill(rec([g('2026-03-08', 9, 5, 36000, 36)]), g(TODAY, 3, 2, 12000, 12), TODAY).what, 'rate');
  // 3 of 5 = 60% → 7 of 10 = 70%: exactly 10 points
  assert.equal(gr.compareSkill(rec([g('2026-03-08', 5, 3, 20000, 20)]), g(TODAY, 10, 7, 40000, 40), TODAY).what, 'rate');
  // 3 of 5 = 60% → 13 of 19 = 68.4%: not enough
  assert.equal(gr.compareSkill(rec([g('2026-03-08', 5, 3, 20000, 20)]), g(TODAY, 19, 13, 76000, 76), TODAY), null);
});

test('进步了: one line per skill (the biggest), refs prev / 21 days / first3', () => {
  const r = rec([
    g('2026-02-01', 4, 1, 4 * 4 * 4000, 16), // month: 4000/cell, 25%
    g('2026-03-08', 4, 2, 4 * 4 * 1200, 16), // prev: 1200/cell, 50%
  ], [f3('2026-01-20', 4 * 3000, 1), f3('2026-01-20', 4 * 3000, 1), f3('2026-01-20', 4 * 3000, 0)]); // first3: 3000/cell, 33%
  const cur = g(TODAY, 4, 4, 4 * 4 * 1000, 16); // 1000/cell, 100%
  const refs = gr.compareRefs(r, TODAY);
  assert.deepEqual(refs.map((x) => x.kind), ['prev', 'month', 'first']);
  const x = gr.compareSkill(r, cur, TODAY);
  // gains: prev time 0.167, prev rate 0.5, month time 0.75, month rate 0.75, first time 0.667, first rate 0.667
  assert.equal(x.kind, 'month'); assert.equal(x.gain, 0.75); assert.equal(x.what, 'time', 'first one wins a tie');
  // The month reference is not repeated when it is also the last day.
  assert.deepEqual(gr.compareRefs(rec([g('2026-02-01', 4, 1, 16000, 16)]), TODAY).map((x) => x.kind), ['prev']);
});

test('进步了: 上次 is the last day before today; under 3 problems that day means no 上次 at all', () => {
  // The last day (03-08) had 2 problems: no 上次 (03-05 is not used in its place).
  const r = rec([g('2026-03-05', 5, 1, 5 * 4 * 4000, 20), g('2026-03-08', 2, 0, 2 * 4 * 5000, 8)]);
  assert.deepEqual(gr.compareRefs(r, TODAY), []);
  assert.equal(gr.compareSkill(r, g(TODAY, 4, 4, 4 * 4 * 1000, 16), TODAY), null);
  // The 21-day reference still comes from days with 3 or more problems.
  const r2 = rec([g('2026-02-10', 5, 1, 5 * 4 * 4000, 20), g('2026-03-08', 2, 0, 2 * 4 * 5000, 8)]);
  assert.deepEqual(gr.compareRefs(r2, TODAY).map((x) => [x.kind, x.day]), [['month', '2026-02-10']]);
  // Today's own entry is never 上次.
  const r3 = rec([g('2026-03-08', 4, 1, 16000, 16), g(TODAY, 4, 4, 4000, 16)]);
  assert.deepEqual(gr.compareRefs(r3, TODAY).map((x) => [x.kind, x.day]), [['prev', '2026-03-08']]);
});

test('进步了: global top 3, never a regression, empty when nothing improved', () => {
  const s = pg.emptyProgress();
  const ids = ['g1a-add10', 'g1a-sub10', 'g1b-vadd2', 'g2a-kou5', 'g3b-vdiv21'];
  const slow = [8000, 2000, 4000, 1000, 1500]; // earlier per-cell time; today 1000 per cell
  ids.forEach((id, i) => { s.skills[id] = rec([g('2026-03-01', 4, 4, 4 * 4 * slow[i], 16), g(TODAY, 3, 3, 3 * 4 * 1000, 12)]); });
  const out = gr.improvements(s, [...ids, 'g1a-add10'], TODAY);
  assert.deepEqual(out.map((x) => x.skill), ['g1a-add10', 'g1b-vadd2', 'g1a-sub10']);
  assert.ok(out.every((x) => x.gain >= 0.1 && (x.what === 'time' ? x.to < x.from : x.to > x.from)));
  // Slower and less accurate today: nothing at all.
  const w = pg.emptyProgress();
  w.skills[ID] = rec([g('2026-03-01', 4, 4, 4 * 4 * 1000, 16), g(TODAY, 4, 1, 4 * 4 * 3000, 16)], [f3('2026-01-01', 4000, 0), f3('2026-01-01', 4000, 0), f3('2026-01-01', 4000, 0)]);
  assert.deepEqual(gr.improvements(w, [ID], TODAY), []);
  // Skills not played in this round are not compared.
  assert.deepEqual(gr.improvements(s, [], TODAY), []);
  // Unknown or empty records are ignored.
  assert.deepEqual(gr.improvements(pg.emptyProgress(), [ID, 'nope'], TODAY), []);
});

test('进步了: works on records written by recordSolve (days of today include this round)', () => {
  const s = pg.emptyProgress();
  const list = generate(ID, 8, 3);
  const T = new Date(2026, 2, 10, 12).getTime();
  const day = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  list.slice(0, 4).forEach((p, i) => pg.recordSolve(s, ID, p, { ms: p.steps.length * 3000, misses: i % 2, first: i % 2 === 0, day: day(T - 2 * DAY), at: T - 2 * DAY }));
  list.slice(4, 7).forEach((p) => pg.recordSolve(s, ID, p, { ms: p.steps.length * 1000, misses: 0, first: true, day: day(T), at: T }));
  const out = gr.improvements(s, [ID], day(T));
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'prev');
  const t = gr.improvementText(out[0]);
  assert.equal(t.name, '两位数加两位数笔算', 'full name: short names repeat across skills');
  assert.match(t.since, /^比上次（3月8日）$/);
  assert.match(t.line, /^比上次（3月8日）每题快了 [\d.]+ 秒$/);
  // Order "比 <day> <what>"; no → (not in the display font).
  const m = gr.improvementText({ skill: 'g1a-missing', kind: 'month', day: '2026-09-04', what: 'time', from: 20000, to: 7600 });
  assert.equal(m.name, '逆向求□'); assert.equal(m.line, '比 9月4日 每题快了 12.4 秒');
  const rt = gr.improvementText({ skill: ID, kind: 'first', day: '2026-01-01', what: 'rate', from: 0.5, to: 0.8 });
  assert.equal(rt.line, '比最早做的 3 题 首次正确率从 50% 升到 80%');
  assert.ok(![m, rt, t].some((x) => x.line.includes('→')));
});

test('时间胶囊: oldest unused problem of a mastered skill, 30 days or more', () => {
  const now = new Date(2026, 5, 1, 12).getTime();
  const s = pg.emptyProgress();
  const mk = (id, daysAgo, mastered = true, used = [false, false, false]) => {
    const r = { ...pg.emptyRec(), mastered, masteredAt: mastered ? now : null };
    r.first3 = generate(id, 3, 1).map((p, i) => ({ p, day: '2026-01-01', at: now - daysAgo * DAY + i * 1000, ms: 5000, misses: 0, used: used[i] }));
    s.skills[id] = r;
  };
  mk(ID, 29.9);
  assert.equal(gr.pickCapsule(s, now), null, 'not yet 30 days');
  mk(ID, 30);
  assert.deepEqual([gr.pickCapsule(s, now).skill, gr.pickCapsule(s, now).index], [ID, 0], 'exactly 30 days');
  mk(ID2, 60, false);
  assert.equal(gr.pickCapsule(s, now).skill, ID, 'not mastered: skipped');
  mk(ID3, 45, true, [true, false, false]);
  const c = gr.pickCapsule(s, now);
  assert.deepEqual([c.skill, c.index], [ID3, 1], 'oldest, used ones skipped');
  pg.markFirstUsed(s, ID3, 1); pg.markFirstUsed(s, ID3, 2);
  assert.equal(gr.pickCapsule(s, now).skill, ID);
});

test('时间胶囊: slot, placement next to 擦亮旧技能, input untouched', () => {
  assert.deepEqual([4, 5, 6, 10, 14].map(gr.capsuleIndex), [2, 2, 3, 5, 7]);
  for (let N = 4; N <= 20; N++) assert.notEqual(gr.capsuleIndex(N), pg.RUST_INDEX, `N=${N}`);
  const p = generate(ID3, 1, 5)[0];
  const pick = { skill: ID3, index: 2, entry: { p, day: '2026-01-01', at: 1, ms: 9000, misses: 1 } };
  const plan0 = planBasic(1, 10, makeRng(4));
  const rust = pg.withRust(plan0, [ID2]);
  const planCopy = rust.plan.slice();
  const out = gr.withCapsule(rust.plan, [], pick, rust.rustIndex);
  assert.deepEqual(rust.plan, planCopy, 'plan not changed');
  assert.equal(out.capsuleIndex, 5);
  assert.equal(out.plan[1], ID2, 'rust slot kept');
  assert.equal(out.plan[5], ID3);
  assert.equal(signature(out.problems[5]), signature(p));
  assert.notEqual(out.problems[5], p, 'a copy of the stored problem');
  assert.deepEqual(out.capsule, { skill: ID3, index: 2, day: '2026-01-01', ms: 9000, misses: 1 });
  assert.equal(gr.withCapsule(plan0.slice(0, 3), [], pick).capsuleIndex, -1, 'N < 4');
  assert.equal(gr.withCapsule(plan0, [], null).capsuleIndex, -1, 'nothing to pick');
  assert.equal(gr.withCapsule(plan0, [], pick, 5).capsuleIndex, -1, 'the rust slot wins');
});

test('时间胶囊: that day vs today', () => {
  const then = { ms: 10000, misses: 2, day: '2026-02-03' };
  assert.deepEqual(gr.capsuleCompare(then, 9499, 5), { what: 'time', from: 10000, to: 9499 });
  assert.equal(gr.capsuleCompare(then, 9500, 0).what, 'miss', 'exactly 5% faster is not faster');
  assert.equal(gr.capsuleCompare(then, 9500, 2).what, 'again');
  assert.equal(gr.capsuleCompare({ ms: 0, misses: 0 }, 100, 0).what, 'again');
  assert.equal(gr.capsuleText(gr.capsuleCompare(then, 6800, 0), then.day), '比 2月3日 快了 3.2 秒');
  assert.equal(gr.capsuleText(gr.capsuleCompare(then, 12000, 1), then.day), '比 2月3日 少错了 1 次');
  assert.equal(gr.capsuleText(gr.capsuleCompare(then, 12000, 2), then.day), '2月3日 做过的题，今天又做对了');
});

test('debug data: fakeCapsuleData gives a capsule, fakeGainData gives 进步了 after one more problem', () => {
  const now = new Date(2026, 5, 1, 12).getTime();
  const s = pg.emptyProgress();
  gr.fakeCapsuleData(s, ID, generate(ID, 3, 2), now, 35);
  const c = gr.pickCapsule(s, now);
  assert.equal(c.skill, ID);
  assert.deepEqual(pg.rustySkills(s, now), [], 'not rusty');
  assert.deepEqual(JSON.parse(JSON.stringify(pg.normalizeProgress(s))), JSON.parse(JSON.stringify(s)), 'survives normalizeProgress');
  const ids = ['g1a-add10', 'g1a-sub10', 'g1b-vadd2'];
  gr.fakeGainData(s, ids, now, () => 3);
  const day = '2026-06-01';
  for (const [i, id] of ids.entries()) {
    const p = generate(id, 1, 9 + i)[0];
    pg.recordSolve(s, id, p, { ms: p.steps.length * 2500, misses: 0, first: true, day, at: now });
  }
  const out = gr.improvements(s, ids, day);
  assert.equal(out.length, 3);
  assert.deepEqual(new Set(out.map((x) => x.kind)), new Set(['prev', 'month']));
  assert.deepEqual(new Set(out.map((x) => x.what)), new Set(['time', 'rate']));
});
