// Show plan (showplan.js): pure rules for particle kinds, fever, 听牌, stamps, idle hops, 行进, chest gush.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as sp from '../app/js/showplan.js';

test('burstKinds: grows with E and never loses a kind', () => {
  assert.deepEqual(sp.burstKinds(0), ['confetti']);
  let prev = new Set();
  for (let E = 0; E <= 1.5; E += 0.05) {
    const now = new Set(sp.burstKinds(E));
    for (const k of prev) assert.ok(now.has(k), `lost ${k} at E=${E.toFixed(2)}`);
    prev = now;
  }
  assert.ok(sp.burstKinds(0.9).includes('mini'));
  assert.ok(!sp.burstKinds(0.3).includes('coin'));
});

test('feverLevel: steps at 5 / 10 / 20 / 35, monotone', () => {
  assert.equal(sp.feverLevel(0), 0);
  assert.equal(sp.feverLevel(4), 0);
  assert.equal(sp.feverLevel(5), 1);
  assert.equal(sp.feverLevel(10), 2);
  assert.equal(sp.feverLevel(19), 2);
  assert.equal(sp.feverLevel(20), 3);
  assert.equal(sp.feverLevel(35), 4);
  assert.equal(sp.feverLevel(500), 4);
  assert.equal(sp.feverLevel(-3), 0);
  for (let c = 1; c < 80; c++) assert.ok(sp.feverLevel(c) >= sp.feverLevel(c - 1));
  for (let lv = 1; lv <= 4; lv++) assert.ok(sp.feverCoins(lv) >= sp.feverCoins(lv - 1));
});

test('reachOn: only the last digit of a multi-digit answer, from E 0.45', () => {
  assert.equal(sp.reachOn(0.5, 2, 3), true);
  assert.equal(sp.reachOn(0.5, 1, 3), false);
  assert.equal(sp.reachOn(0.44, 2, 3), false);
  assert.equal(sp.reachOn(0.9, 0, 1), false);
});

test('stampLook: smile, flower, rainbow', () => {
  assert.equal(sp.stampLook(0.1), 'smile');
  assert.equal(sp.stampLook(0.45), 'flower');
  assert.equal(sp.stampLook(0.86), 'rainbow');
});

test('idleGap: none at low E, shorter as E grows', () => {
  assert.equal(sp.idleGap(0.3), Infinity);
  assert.ok(sp.idleGap(0.5) > sp.idleGap(0.9));
  assert.ok(sp.idleGap(1.2) >= 2.2 - 1e-9);
});

test('paradeCount: 3 to 9 marchers above E 0.74, never more than the cap', () => {
  assert.equal(sp.paradeCount(0.7, 1), 0);
  assert.equal(sp.paradeCount(0.76, 1), 3);
  assert.equal(sp.paradeCount(1.3, 1), 9);
  assert.equal(sp.paradeCount(1.3, 6), 4);
  assert.equal(sp.paradeCount(1.3, 12), 0);
  for (let a = 0; a <= 10; a++) assert.ok(a + sp.paradeCount(1.3, a) <= 10 || sp.paradeCount(1.3, a) === 0);
});

test('gushPlan: a higher tier is never smaller', () => {
  for (let t = 1; t <= 4; t++) {
    const a = sp.gushPlan(t - 1); const b = sp.gushPlan(t);
    assert.ok(b.ms >= a.ms && b.rate >= a.rate && b.streaks >= a.streaks && b.shocks >= a.shocks);
    for (const k of a.kinds) assert.ok(b.kinds.includes(k));
  }
  assert.equal(sp.gushPlan(4).confetti, true);
  assert.equal(sp.gushPlan(3).confetti, false);
  assert.deepEqual(sp.gushPlan(9), sp.gushPlan(4));
});

test('jackpotSymbol: fixed by the combo, climbing with it', () => {
  assert.equal(sp.JACKPOT_SYMBOLS[sp.jackpotSymbol(5)], 'coin');
  assert.equal(sp.JACKPOT_SYMBOLS[sp.jackpotSymbol(10)], 'star');
  assert.equal(sp.JACKPOT_SYMBOLS[sp.jackpotSymbol(20)], 'gem');
  assert.equal(sp.JACKPOT_SYMBOLS[sp.jackpotSymbol(30)], 'heart');
  assert.equal(sp.JACKPOT_SYMBOLS[sp.jackpotSymbol(75)], 'ty');
  for (let c = 1; c < 120; c++) assert.ok(sp.jackpotSymbol(c) >= sp.jackpotSymbol(c - 1));
});
