// 成长记录（progress.js）：记录上限、掌握、生锈、擦亮、损坏数据修复、跨局去重、擦亮旧技能的出题替换。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as pg from '../app/js/progress.js';
import { makeRng, makeProblem, signature, generate } from '../app/js/problems.js';
import { planBasic } from '../app/js/session.js';

const DAY = pg.DAY_MS;
const T0 = new Date(2026, 0, 10, 12).getTime();
const dayOf = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const probs = (id, n, seed = 1) => generate(id, n, seed);
function solve(state, id, p, first, at = T0, ms = 3000, misses = first ? 0 : 1) {
  return pg.recordSolve(state, id, p, { ms, misses, first, day: dayOf(at), at });
}

test('recordSolve: fields are filled and trimmed to their caps', () => {
  const s = pg.emptyProgress();
  const id = 'g3a-vmul31';
  const list = probs(id, 70, 3);
  list.forEach((p, i) => solve(s, id, p, i % 2 === 0, T0 + Math.floor(i / 1) * DAY, 1000 + i));
  const r = s.skills[id];
  assert.equal(r.n, 70);
  assert.equal(r.sigs.length, pg.SIGS_MAX);
  assert.equal(r.sigs[r.sigs.length - 1], signature(list[69]));
  assert.equal(r.last6.length, pg.MASTERY.window);
  assert.equal(r.recent.length, pg.RECENT_MAX);
  assert.deepEqual(Object.keys(r.recent[0]).sort(), ['cells', 'day', 'first', 'misses', 'ms']);
  assert.equal(r.recent[29].cells, list[69].steps.length);
  assert.equal(r.days.length, pg.DAYS_MAX, '70 different days, 60 kept');
  assert.equal(r.days[r.days.length - 1].day, dayOf(T0 + 69 * DAY));
  assert.equal(r.first3.length, pg.FIRST_MAX);
  assert.equal(r.first3[0].p.text, list[0].text, 'first3 keeps the earliest problems');
  assert.equal(r.first3[0].used, false);
  assert.deepEqual(JSON.parse(JSON.stringify(r.first3[0].p)), r.first3[0].p, 'problem survives JSON');
  assert.ok(JSON.stringify(r.first3[0].p).length < 4000);
});

test('recordSolve: one day aggregates all problems of that day', () => {
  const s = pg.emptyProgress();
  const id = 'g1a-add10';
  const list = probs(id, 5);
  list.forEach((p, i) => solve(s, id, p, i !== 2, T0 + i * 60000, 2000));
  assert.equal(s.skills[id].days.length, 1);
  assert.deepEqual(s.skills[id].days[0], { day: dayOf(T0), n: 5, first: 4, ms: 10000, cells: list.reduce((a, p) => a + p.steps.length, 0) });
});

test('recordSolve: ms is clamped to [0, MS_CAP] and unknown skills are ignored', () => {
  const s = pg.emptyProgress();
  const [p] = probs('g1a-add10', 1);
  solve(s, 'g1a-add10', p, true, T0, 60 * 60 * 1000);
  solve(s, 'g1a-add10', p, true, T0, -5);
  assert.equal(s.skills['g1a-add10'].recent[0].ms, pg.MS_CAP);
  assert.equal(s.skills['g1a-add10'].recent[1].ms, 0);
  assert.deepEqual(pg.recordSolve(s, 'nope', p, { first: true, day: dayOf(T0) }), { newlyMastered: false, polished: false });
  assert.equal(s.skills.nope, undefined);
});

test('mastery: 5 of the last 6 first-try, at least 6 problems', () => {
  const s = pg.emptyProgress();
  const id = 'g1a-sub10';
  const list = probs(id, 12);
  for (let i = 0; i < 5; i++) assert.equal(solve(s, id, list[i], true).newlyMastered, false, `only ${i + 1} problems`);
  assert.equal(solve(s, id, list[5], false).newlyMastered, true, '5 of 6');
  assert.equal(s.skills[id].masteredAt, T0);
  assert.ok(pg.isMastered(s, id));
  // Never taken back, and never "newly" mastered twice.
  for (let i = 6; i < 12; i++) assert.equal(solve(s, id, list[i], false).newlyMastered, false);
  assert.ok(pg.isMastered(s, id));
  assert.equal(s.skills[id].masteredAt, T0);

  const s2 = pg.emptyProgress();
  [true, false, true, false, true, true].forEach((f, i) => solve(s2, id, list[i], f));
  assert.equal(pg.isMastered(s2, id), false, '4 of 6 is not enough');
  assert.equal(solve(s2, id, list[6], true).newlyMastered, false, 'window F T F T T T: still 4');
  assert.equal(solve(s2, id, list[7], true).newlyMastered, true, 'window T F T T T T: 5 of 6');
});

test('rust: mastered and 21+ days since the last first-try answer (masteredAt as fallback)', () => {
  const s = pg.emptyProgress();
  pg.forceMastered(s, ['g1a-add10', 'g1a-sub10', 'g1a-teen', 'g1a-carry', 'g2a-kou5'], T0);
  s.skills['g1a-sub10'].lastFirstAt = null; // falls back to masteredAt
  s.skills['g1a-add10'].lastFirstAt = T0 - 10 * DAY; // oldest
  s.skills['g1a-teen'].lastFirstAt = T0 + 5 * DAY; // not yet 21 days at T0 + 21d
  s.skills['g2a-kou5'].lastFirstAt = T0 - 3 * DAY;
  assert.deepEqual(pg.rustySkills(s, T0 + 17 * DAY), ['g1a-add10'], 'only the one 27 days old');
  assert.deepEqual(pg.rustySkills(s, T0 + 21 * DAY), ['g1a-add10', 'g2a-kou5', 'g1a-carry'], 'oldest first, at most 3');
  assert.deepEqual(pg.rustySkills(s, T0 + 100 * DAY).length, pg.RUST.max);
  // isRusty has no cap: the 4th and 5th oldest are rusty too.
  assert.ok(['g1a-add10', 'g1a-sub10', 'g1a-teen', 'g1a-carry', 'g2a-kou5'].every((id) => pg.isRusty(s, id, T0 + 100 * DAY)));
  // Not mastered: never rusty, however old.
  const s2 = pg.emptyProgress();
  solve(s2, 'g1a-add10', probs('g1a-add10', 1)[0], true, T0);
  assert.deepEqual(pg.rustySkills(s2, T0 + 400 * DAY), []);
});

test('rust: one first-try answer polishes; a miss does not, and mastery stays', () => {
  const s = pg.emptyProgress();
  const id = 'g1a-carry';
  pg.forceMastered(s, [id], T0);
  const later = T0 + 30 * DAY;
  const [a, b] = probs(id, 2);
  assert.ok(pg.isRusty(s, id, later));
  assert.deepEqual(solve(s, id, a, false, later), { newlyMastered: false, polished: false });
  assert.ok(pg.isRusty(s, id, later), 'still rusty after a miss');
  assert.ok(pg.isMastered(s, id));
  assert.deepEqual(solve(s, id, b, true, later), { newlyMastered: false, polished: true });
  assert.equal(s.skills[id].lastFirstAt, later);
  assert.equal(pg.isRusty(s, id, later + DAY), false);
});

test('lastFirstAt follows every first-try answer of any skill', () => {
  const s = pg.emptyProgress();
  const [p] = probs('g2a-kou6', 1);
  solve(s, 'g2a-kou6', p, true, T0);
  assert.equal(s.skills['g2a-kou6'].lastFirstAt, T0);
  solve(s, 'g2a-kou6', p, false, T0 + DAY);
  assert.equal(s.skills['g2a-kou6'].lastFirstAt, T0);
});

test('normalizeProgress: broken data becomes a usable state', () => {
  for (const raw of [null, undefined, 3, 'x', [], { skills: [] }, { skills: 'x' }, { v: 1 }]) assert.deepEqual(pg.normalizeProgress(raw), pg.emptyProgress());
  const s = pg.normalizeProgress({ v: 1, skills: {
    unknown: { n: 3 },
    'g1a-add10': { n: 'x', sigs: 'abc', last6: [true, 1, false, 'y'], recent: [{ day: 'bad' }, { day: '2026-01-01', ms: 'x', cells: 2, first: 1 }, 7], days: {}, first3: [{ p: {}, day: '2026-01-01' }, { p: { steps: [] }, day: '2026-01-02', at: 5 }, { p: { text: '1+1', steps: [{}], kind: 'h' }, day: '2026-01-02', at: 6 }, { p: makeProblem('g1a-add10', makeRng(1)), day: '2026-01-02', at: 5 }], mastered: 'yes', masteredAt: '2026', lastFirstAt: NaN },
    'g1a-sub10': 'garbage',
    'g1a-teen': { mastered: true, masteredAt: 42, sigs: Array.from({ length: 40 }, (_, i) => `s${i}`) },
  } });
  assert.deepEqual(Object.keys(s.skills).sort(), ['g1a-add10', 'g1a-sub10', 'g1a-teen']);
  const r = s.skills['g1a-add10'];
  assert.equal(r.n, 0); assert.deepEqual(r.sigs, []); assert.deepEqual(r.last6, [true, false]);
  assert.deepEqual(r.recent, [{ day: '2026-01-01', ms: 0, cells: 2, misses: 0, first: true }]);
  assert.deepEqual(r.days, []);
  // Only a problem the renderer and the judge can use survives (the same check as the 错题本), so a
  // broken one can never become a 时间胶囊.
  assert.equal(r.first3.length, 1); assert.equal(r.first3[0].at, 5); assert.equal(r.first3[0].used, false);
  assert.equal(r.first3[0].p.skill, 'g1a-add10');
  assert.equal(r.mastered, false); assert.equal(r.masteredAt, null); assert.equal(r.lastFirstAt, null);
  assert.deepEqual(s.skills['g1a-sub10'], pg.emptyRec());
  assert.equal(s.skills['g1a-teen'].mastered, true); assert.equal(s.skills['g1a-teen'].masteredAt, 42);
  assert.equal(s.skills['g1a-teen'].sigs.length, pg.SIGS_MAX); assert.equal(s.skills['g1a-teen'].sigs[0], 's16');
  // A recorded state survives a JSON round trip unchanged.
  const live = pg.emptyProgress();
  probs('g2b-vdivrem', 8).forEach((p, i) => solve(live, 'g2b-vdivrem', p, i % 3 !== 0, T0 + i * DAY));
  assert.deepEqual(pg.normalizeProgress(JSON.parse(JSON.stringify(live))), live);
});

test('avoidSet / makeFresh: earlier sessions are avoided when the skill has room', () => {
  const s = pg.emptyProgress();
  const id = 'g3a-vmul31';
  const past = probs(id, 24, 7);
  past.forEach((p) => solve(s, id, p, true));
  const avoid = pg.avoidSet(s, id);
  assert.equal(avoid.size, 24);
  const rng = makeRng(99); const session = new Set();
  for (let i = 0; i < 20; i++) {
    const p = pg.makeFresh(id, rng, session, avoid);
    const sig = signature(p);
    assert.ok(!session.has(sig) && !avoid.has(sig), `problem ${i} is new`);
    session.add(sig);
  }
});

test('makeFresh: a small skill never repeats within a session because of past records', () => {
  // 2、3、4的乘法口诀 (16 distinct problems) and 5的乘法口诀 (9): past records cover all of them.
  for (const id of ['g2a-kou234', 'g2a-kou5']) {
  const all = new Set(); const r0 = makeRng(1);
  for (let i = 0; i < 400; i++) all.add(signature(makeProblem(id, r0)));
  const s = pg.emptyProgress();
  for (const seed of [1, 2, 3, 4, 5, 6]) probs(id, 10, seed).forEach((p) => solve(s, id, p, true));
  const avoid = pg.avoidSet(s, id);
  for (let seed = 1; seed <= 20; seed++) {
    const rng = makeRng(seed); const session = new Set(); const plain = new Set(); const rngPlain = makeRng(seed);
    let repeats = 0; let plainRepeats = 0;
    for (let i = 0; i < 14; i++) {
      const sig = signature(pg.makeFresh(id, rng, session, avoid));
      if (session.has(sig)) repeats += 1; session.add(sig);
      const sp = signature(makeProblem(id, rngPlain, plain));
      if (plain.has(sp)) plainRepeats += 1; plain.add(sp);
    }
    if (all.size >= 14) assert.equal(repeats, 0, `seed ${seed}: no repeat within the session (${all.size} distinct problems)`);
    else assert.ok(repeats <= plainRepeats, `seed ${seed}`);
  }
  }
  assert.equal(pg.makeFresh('g2a-kou5', makeRng(1), new Set(), null).skill, 'g2a-kou5', 'no past records: plain makeProblem');
});

test('withRust: index 1 becomes the oldest rusty skill, only when N >= 4, input untouched', () => {
  const plan = planBasic(2, 10, makeRng(5));
  const copy = plan.slice();
  const r = pg.withRust(plan, ['g1a-carry', 'g1a-add10']);
  assert.deepEqual(plan, copy, 'planBasic output not changed');
  assert.equal(r.rustIndex, 1); assert.equal(r.rustSkill, 'g1a-carry');
  assert.equal(r.plan[1], 'g1a-carry');
  assert.deepEqual(r.plan.filter((_, i) => i !== 1), copy.filter((_, i) => i !== 1));
  assert.deepEqual(pg.withRust(plan, []), { plan: copy, rustIndex: -1, rustSkill: null });
  assert.deepEqual(pg.withRust(plan, null).rustIndex, -1);
  assert.equal(pg.withRust(['a', 'b', 'c'], ['x']).rustIndex, -1, 'N < 4: no replacement');
  assert.equal(pg.withRust(['a', 'b', 'c', 'd'], ['x']).plan[1], 'x');
  // Already problem 1: nothing replaced, the tag goes on problem 1 (the problem that polishes it).
  const first = pg.withRust(['x', 'b', 'c', 'd'], ['x', 'y']);
  assert.deepEqual(first, { plan: ['x', 'b', 'c', 'd'], rustIndex: 0, rustSkill: 'x' });
  // Already problem 2 or later: problem 2 is replaced as usual.
  assert.deepEqual(pg.withRust(['a', 'b', 'x', 'd'], ['x']), { plan: ['a', 'x', 'x', 'd'], rustIndex: 1, rustSkill: 'x' });
});

test('rustyFor: only the round\'s grade and below, same order as rustySkills', () => {
  const s = pg.emptyProgress();
  // Oldest first: g2a-kou5 (40 days), g1a-add10 (30), g1a-sub10 (25).
  pg.forceMastered(s, ['g2a-kou5'], T0 - 40 * DAY);
  pg.forceMastered(s, ['g1a-add10'], T0 - 30 * DAY);
  pg.forceMastered(s, ['g1a-sub10'], T0 - 25 * DAY);
  assert.deepEqual(pg.rustySkills(s, T0), ['g2a-kou5', 'g1a-add10', 'g1a-sub10']);
  assert.deepEqual(pg.rustyFor(s, 1, T0), ['g1a-add10', 'g1a-sub10'], 'grade 1: no 乘法口诀');
  assert.deepEqual(pg.rustyFor(s, 2, T0), ['g2a-kou5', 'g1a-add10', 'g1a-sub10']);
  // Grade first, then the oldest 3: three older grade-2 skills do not crowd out the grade-1 one.
  const c = pg.emptyProgress();
  pg.forceMastered(c, ['g2a-kou5', 'g2a-kou234', 'g2a-kou6'], T0 - 50 * DAY);
  pg.forceMastered(c, ['g1a-add10'], T0 - 22 * DAY);
  assert.deepEqual(pg.rustySkills(c, T0), ['g2a-kou234', 'g2a-kou5', 'g2a-kou6'], 'all grades: oldest 3');
  assert.deepEqual(pg.rustyFor(c, 1, T0), ['g1a-add10']);
  assert.ok(pg.isRusty(c, 'g1a-add10', T0), 'rusty although 4th oldest overall');
  const [p1] = probs('g1a-add10', 1);
  assert.deepEqual(solve(c, 'g1a-add10', p1, true, T0), { newlyMastered: false, polished: true }, '擦亮了 is shown');
  // A grade-1 round never gets the grade-2 skill.
  const plan = planBasic(1, 10, makeRng(3));
  assert.equal(pg.withRust(plan, pg.rustyFor(s, 1, T0)).rustSkill, 'g1a-add10');
  assert.deepEqual(pg.rustyFor(pg.emptyProgress(), 3, T0), []);
});

test('ageSkills / forceMastered (debug helpers) move every date back', () => {
  const s = pg.emptyProgress();
  const id = 'g1b-vadd2';
  probs(id, 6).forEach((p) => solve(s, id, p, true, T0));
  assert.ok(pg.isMastered(s, id));
  pg.ageSkills(s, [id], 30);
  const r = s.skills[id];
  assert.equal(r.masteredAt, T0 - 30 * DAY); assert.equal(r.lastFirstAt, T0 - 30 * DAY);
  assert.equal(r.first3[0].at, T0 - 30 * DAY); assert.equal(r.first3[0].day, dayOf(T0 - 30 * DAY));
  assert.equal(r.days[0].day, dayOf(T0 - 30 * DAY)); assert.equal(r.recent[0].day, dayOf(T0 - 30 * DAY));
  assert.deepEqual(pg.rustySkills(s, T0), [id]);
  assert.ok(pg.markFirstUsed(s, id, 0)); assert.equal(r.first3[0].used, true);
  assert.equal(pg.markFirstUsed(s, 'g1a-add10', 0), false);
});
