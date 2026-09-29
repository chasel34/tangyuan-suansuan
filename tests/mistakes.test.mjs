// 错题本（mistakes.js）：去重、上限、再练的取题、移出，以及全部 38 个技能的题目 JSON 往返后能正常判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as mk from '../app/js/mistakes.js';
import { generate, summarize, signature } from '../app/js/problems.js';
import { judge, nextTokens } from '../app/js/engine.js';
import { SKILLS } from '../app/js/skills.js';

const D = '2026-09-29';

test('addMistake: dedupe by skill + signature keeps the newest at the end', () => {
  const s = mk.emptyMistakes();
  const [a, b] = generate('g1b-vadd2', 2, 3);
  assert.equal(mk.addMistake(s, a, '2026-09-01'), `g1b-vadd2|${signature(a)}`);
  mk.addMistake(s, b, '2026-09-02');
  mk.addMistake(s, a, '2026-09-03');
  assert.equal(s.list.length, 2);
  assert.deepEqual(s.list.map((e) => e.p.text), [b.text, a.text]);
  assert.equal(s.list[1].day, '2026-09-03');
  // A stored copy: changing the live problem does not change the list.
  a.text = 'changed';
  assert.notEqual(s.list[1].p.text, 'changed');
});

test('addMistake: at most 40, the oldest go first', () => {
  const s = mk.emptyMistakes();
  const list = generate('g3a-vmul21', 45, 9);
  list.forEach((p, i) => mk.addMistake(s, p, D));
  assert.equal(s.list.length, mk.MISTAKES_MAX);
  assert.equal(s.list[0].p.text, list[5].text);
  assert.equal(s.list[39].p.text, list[44].text);
});

test('pickReview: last min(count, 10, length) in list order, as copies', () => {
  const s = mk.emptyMistakes();
  const list = generate('g1a-add10', 14, 2);
  list.forEach((p) => mk.addMistake(s, p, D));
  assert.deepEqual(mk.pickReview(s, 6).map((e) => e.p.text), list.slice(8).map((p) => p.text));
  assert.equal(mk.pickReview(s, 14).length, mk.REVIEW_MAX);
  assert.deepEqual(mk.pickReview(s, 14).map((e) => e.p.text), list.slice(4).map((p) => p.text));
  const small = mk.emptyMistakes(); mk.addMistake(small, list[0], D); mk.addMistake(small, list[1], D);
  assert.equal(mk.pickReview(small, 10).length, 2);
  assert.equal(mk.pickReview(mk.emptyMistakes(), 10).length, 0);
  const picked = mk.pickReview(s, 1)[0];
  picked.p.steps.length = 0;
  assert.ok(s.list[s.list.length - 1].p.steps.length > 0, 'playing a review problem never changes the list');
});

test('settleMistake: miss adds, review first-try removes, review miss keeps (moved to the end)', () => {
  const s = mk.emptyMistakes();
  const [a, b, c] = generate('g2b-vdivrem', 3, 4);
  assert.equal(mk.settleMistake(s, a, { misses: 2, day: D }), 'added');
  assert.equal(mk.settleMistake(s, b, { misses: 1, day: D }), 'added');
  assert.equal(mk.settleMistake(s, c, { misses: 0, day: D }), null, 'first try outside review: nothing');
  assert.equal(s.list.length, 2);
  const [ra, rb] = mk.pickReview(s, 10);
  assert.equal(mk.settleMistake(s, ra.p, { misses: 1, review: true, key: ra.key, day: '2026-09-30' }), 'added');
  assert.deepEqual(s.list.map((e) => e.p.text), [b.text, a.text], 'missed again: kept and moved to the end');
  assert.equal(mk.settleMistake(s, rb.p, { misses: 0, review: true, key: rb.key, day: D }), 'removed');
  assert.deepEqual(s.list.map((e) => e.p.text), [a.text]);
  assert.equal(mk.settleMistake(s, rb.p, { misses: 0, review: true, key: rb.key, day: D }), null, 'already gone');
});

test('normalizeMistakes: broken data becomes a usable list', () => {
  const [a, b] = generate('g3a-fsame', 2, 1);
  assert.deepEqual(mk.normalizeMistakes(null), mk.emptyMistakes());
  assert.deepEqual(mk.normalizeMistakes('x'), mk.emptyMistakes());
  assert.deepEqual(mk.normalizeMistakes({ list: 'x' }), mk.emptyMistakes());
  const out = mk.normalizeMistakes({ list: [
    { skill: 'g3a-fsame', day: D, p: a },
    { skill: 'nope', day: D, p: b },
    { skill: 'g3a-fsame', day: D, p: { text: '1+1', steps: 'x' } },
    { skill: 'g3a-fsame', day: 5, p: b },
    null,
    { skill: 'g3a-fsame', day: '2026-09-30', p: a },
  ] });
  assert.equal(out.list.length, 2);
  assert.deepEqual(out.list.map((e) => e.p.text), [b.text, a.text], 'duplicate keeps the later one');
  assert.equal(out.list[0].day, '1970-01-01');
  assert.equal(out.list[1].key, `g3a-fsame|${signature(a)}`);
  const many = { list: generate('g2a-kou234', 20, 1).concat(generate('g2a-kou-mix', 30, 1)).map((p) => ({ skill: p.skill, day: D, p })) };
  assert.ok(mk.normalizeMistakes(many).list.length <= mk.MISTAKES_MAX);
});

// Every skill: a stored problem (JSON round trip, as in localStorage) is the same object, and every
// legal answer judged key by key on the restored copy completes it.
test('all 38 skills: problems survive JSON and judge the same after restoring', () => {
  assert.equal(SKILLS.length, 38);
  for (const sk of SKILLS) {
    for (const p of generate(sk.id, 6, 11)) {
      const s = mk.emptyMistakes();
      mk.addMistake(s, p, D);
      const back = mk.normalizeMistakes(JSON.parse(JSON.stringify(s)));
      assert.equal(back.list.length, 1, sk.id);
      const rt = mk.pickReview(back, 10)[0].p;
      assert.deepStrictEqual(rt, p, `${sk.id} ${p.text}`);
      assert.deepEqual(summarize(rt), summarize(p));
      for (const ans of rt.answers) {
        let typed = [];
        for (let i = 0; i < ans.length; i++) {
          const r = judge(rt.answers, typed, ans[i]);
          assert.ok(r.ok, `${sk.id} ${p.text} step ${i}`);
          typed = r.typed;
          assert.equal(r.done, i === ans.length - 1 || rt.answers.some((a) => a.length === i + 1 && a.every((t, j) => t === typed[j])));
        }
      }
      // The steps the renderer reads are all there.
      assert.equal(rt.steps.length, rt.answers[0].length, sk.id);
      for (const st of rt.steps) assert.ok(st.help && typeof st.label === 'string', sk.id);
      const wrong = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].find((k) => !nextTokens(rt.answers, []).includes(k));
      if (wrong) assert.equal(judge(rt.answers, [], wrong).ok, false);
    }
  }
});
