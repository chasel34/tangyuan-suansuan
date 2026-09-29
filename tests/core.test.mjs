// Engine (prefix judging), session order, scoring curves and Chinese wording.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judge, candidates, nextTokens } from '../app/js/engine.js';
import { planBasic, planExtra, extraSkills, nextGradeSkills } from '../app/js/session.js';
import { SKILL, SKILLS, ORDER, ORDER_INDEX, skillsOfGrade, DEPTH } from '../app/js/skills.js';
import { makeRng, makeProblem, signature, generate } from '../app/js/problems.js';
import { koujue, cnNumber } from '../app/js/cn.js';
import * as sc from '../app/js/scoring.js';

test('judge: prefix of any legal answer is correct', () => {
  const answers = [['1', '2'], ['1', '5', '0']];
  assert.deepEqual(judge(answers, [], '1'), { ok: true, done: false, typed: ['1'] });
  assert.equal(judge(answers, ['1'], '3').ok, false);
  assert.deepEqual(judge(answers, ['1'], '2'), { ok: true, done: true, typed: ['1', '2'] });
  assert.equal(judge(answers, ['1'], '5').done, false);
  assert.equal(judge(answers, ['1', '5'], '0').done, true);
  assert.deepEqual(candidates(answers, ['1', '5']), [['1', '5', '0']]);
  assert.deepEqual(nextTokens(answers, ['1']).sort(), ['2', '5']);
  // A wrong key never advances.
  assert.deepEqual(judge(answers, ['1'], '9').typed, ['1']);
});

test('every generated problem can be solved key by key and rejects a wrong key', () => {
  for (const s of SKILLS) for (const p of generate(s.id, 5, 77)) {
    let typed = [];
    for (let i = 0; i < p.steps.length; i++) {
      const tok = p.answers[0][i];
      const wrong = String((Number(tok) + 1) % 10);
      if (!p.answers.some((a) => a[i] === wrong && a.slice(0, i).join() === typed.join())) assert.equal(judge(p.answers, typed, wrong).ok, false);
      const r = judge(p.answers, typed, tok);
      assert.ok(r.ok, `${p.text} step ${i}`);
      assert.equal(r.done, i === p.steps.length - 1);
      typed = r.typed;
    }
  }
});

test('skill order follows prerequisites (topological)', () => {
  assert.equal(ORDER.length, 38);
  for (const id of ORDER) for (const r of SKILL[id].req) assert.ok(ORDER_INDEX[r] < ORDER_INDEX[id], `${r} before ${id}`);
  for (const s of SKILLS) for (const r of s.req) assert.ok(DEPTH[r] < DEPTH[s.id]);
  assert.deepEqual([1, 2, 3].map((g) => skillsOfGrade(g).length), [14, 13, 11]);
  // Within a grade 上册 comes before 下册.
  for (const g of [1, 2, 3]) { const sems = skillsOfGrade(g).map((id) => SKILL[id].sem).join(''); assert.match(sems, /^a+b+$/); }
});

test('basic plan walks the grade in order and a session never repeats a problem', () => {
  for (const g of [1, 2, 3]) for (const N of [6, 10, 14]) for (const seed of [1, 2, 3, 4, 5]) {
    const rng = makeRng(seed);
    const plan = planBasic(g, N, rng);
    assert.equal(plan.length, N);
    for (let i = 1; i < N; i++) assert.ok(ORDER_INDEX[plan[i - 1]] <= ORDER_INDEX[plan[i]], `grade ${g} plan order`);
    for (const id of plan) assert.equal(SKILL[id].grade, g);
    assert.equal(plan[0], skillsOfGrade(g)[0] === plan[0] ? plan[0] : plan[0]);
    const avoid = new Set();
    const list = plan.map((id) => { const p = makeProblem(id, rng, avoid); avoid.add(signature(p)); return p; });
    for (let k = 0; k < 20; k++) { const p = makeProblem(planExtra(g, k, rng), rng, avoid); avoid.add(signature(p)); list.push(p); }
    const sigs = list.map(signature);
    assert.equal(new Set(sigs).size, sigs.length, `grade ${g} N ${N} seed ${seed}: repeat`);
  }
  assert.deepEqual(planBasic(2, 6, makeRng(1), 'g2a-kou5'), Array(6).fill('g2a-kou5'));
  for (const g of [1, 2, 3]) for (const id of extraSkills(g)) assert.equal(SKILL[id].grade, g);
});

test('乘法口诀 wording', () => {
  assert.equal(koujue(2, 3), '二三得六');
  assert.equal(koujue(3, 2), '二三得六');
  assert.equal(koujue(2, 5), '二五一十');
  assert.equal(koujue(3, 4), '三四十二');
  assert.equal(koujue(9, 9), '九九八十一');
  assert.equal(koujue(1, 1), '一一得一');
  assert.equal(koujue(4, 5), '四五二十');
  assert.equal(koujue(6, 6), '六六三十六');
  assert.equal(koujue(7, 3), '三七二十一');
  assert.equal(cnNumber(40), '四十');
});

test('score, 甜度, intensity', () => {
  assert.equal(sc.targetSeconds(6), 110); assert.equal(sc.targetSeconds(10), 180); assert.equal(sc.targetSeconds(14), 260);
  assert.equal(sc.extraTotal(5), [0, 1, 2, 3, 4].reduce((s, k) => s + sc.extraPoints(k), 0));
  assert.equal(sc.extraUnlocked(8, 10), true); assert.equal(sc.extraUnlocked(7, 10), false);
  let prev = -1;
  for (let i = 0; i <= 20; i++) { const e = sc.basicE(i / 20); assert.ok(e > prev); prev = e; }
  assert.ok(sc.basicE(0) < 0.1 && Math.abs(sc.basicE(1) - 1) < 1e-9);
  assert.ok(sc.extraE(0) >= 1.25 && sc.extraE(100) <= 1.5);
  assert.equal(sc.fmtSweet(0), '0');
  assert.equal(sc.fmtSweet(Math.log10(1805)), '1,804');
  assert.equal(sc.fmtSweet(Math.log10(1600001)), '160万');
  assert.equal(sc.fmtSweet(Math.log10(32001)), '3.2万');
  assert.deepEqual(sc.sweetMilestones(90, 1200), [2, 3]); assert.equal(sc.fmtSweetValue(12345), '1.2万');
  assert.ok(sc.addSweet(0, 0.1, 20) > sc.addSweet(0, 0.1, 0));
  assert.equal(sc.fmtTime(65000), '1:05');
});

test('加时赛: problems 7+ cycle the next grade\'s first 4 skills; grade 3 stays in its harder half', () => {
  for (const g of [1, 2]) {
    const next = skillsOfGrade(g + 1).slice(0, 4);
    assert.deepEqual(nextGradeSkills(g), next);
    const rng = makeRng(7);
    const plan = Array.from({ length: 30 }, (_, k) => planExtra(g, k, rng));
    for (let k = 0; k < 6; k++) assert.ok(extraSkills(g).includes(plan[k]), `grade ${g} k ${k}: this grade's harder half`);
    for (let k = 6; k < 30; k++) assert.equal(plan[k], next[(k - 6) % 4], `grade ${g} k ${k}`);
  }
  assert.deepEqual(nextGradeSkills(3), []);
  const rng = makeRng(7);
  for (let k = 0; k < 30; k++) assert.ok(extraSkills(3).includes(planExtra(3, k, rng)), `grade 3 k ${k}`);
  assert.equal(planExtra(1, 9, makeRng(1), 'g1a-add10'), 'g1a-add10', '?skill still wins');
  // A whole extra round after a basic set never repeats (the next grade's small 口诀 skills included).
  for (const g of [1, 2]) for (let seed = 1; seed <= 60; seed++) {
    const r = makeRng(seed); const avoid = new Set(); const sig = [];
    for (const id of planBasic(g, 14, r)) { const p = makeProblem(id, r, avoid); avoid.add(signature(p)); sig.push(signature(p)); }
    for (let k = 0; k < 40; k++) { const p = makeProblem(planExtra(g, k, r), r, avoid); avoid.add(signature(p)); sig.push(signature(p)); }
    assert.equal(new Set(sig).size, sig.length, `grade ${g} seed ${seed}`);
  }
});
