// M2 rules: 蒸笼档位, 收藏解锁顺序, 观众合成, 经验与升级, 三选一, 连击倍率.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chestTier, chestGoals, GOALS, TIERS, MAX_TIER } from '../app/js/chest.js';
import * as col from '../app/js/collection.js';
import { addMember, buildCrowd, fillingIndex, mass, RUN, MAX_LEVEL } from '../app/js/merge.js';
import * as pk from '../app/js/perks.js';
import * as sc from '../app/js/scoring.js';

// ---------------------------------------------------------------- chestTier
const base = { maxCombo: 0, firstTryRate: 0, solved: 10, count: 10, extraSolved: 0 };

test('chestTier: one tier per goal reached, capped at 彩虹', () => {
  assert.equal(chestTier(base), 0);
  assert.equal(chestTier({ ...base, firstTryRate: 0.8 }), 1);
  assert.equal(chestTier({ ...base, firstTryRate: 0.8, maxCombo: 10 }), 2);
  assert.equal(chestTier({ ...base, firstTryRate: 1, maxCombo: 12 }), 3);
  assert.equal(chestTier({ ...base, firstTryRate: 1, maxCombo: 25 }), 4);
  assert.equal(chestTier({ maxCombo: 40, firstTryRate: 1, solved: 14, count: 14, extraSolved: 20 }), MAX_TIER);
  assert.deepEqual(chestGoals({ ...base, firstTryRate: 0.9, maxCombo: 30 }), ['rate80', 'combo10', 'combo25']);
  assert.equal(chestTier({ ...base, count: 14, solved: 14 }), 1, '做完 14 题 is a goal');
  assert.equal(chestTier({ ...base, extraSolved: 8 }), 1);
  assert.equal(chestTier({ ...base, extraSolved: 16 }), 2);
  assert.equal(chestTier({}), 0, 'missing fields count as zero');
  assert.equal(TIERS.length, 5);
});

test('chestTier: same input always gives the same tier', () => {
  const s = { maxCombo: 17, firstTryRate: 0.9, solved: 10, count: 10, extraSolved: 5 };
  const t = chestTier(s);
  for (let i = 0; i < 50; i++) assert.equal(chestTier({ ...s }), t);
});

test('chestTier: raising any performance input never lowers the tier', () => {
  const combos = [0, 5, 9, 10, 11, 24, 25, 60];
  const rates = [0, 0.5, 0.79, 0.8, 0.9, 1];
  const extras = [0, 7, 8, 15, 16, 30];
  for (const count of [6, 10, 14]) for (const c of combos) for (const r of rates) for (const x of extras) {
    const s = { maxCombo: c, firstTryRate: r, solved: count, count, extraSolved: x };
    const t = chestTier(s);
    for (const c2 of combos.filter((v) => v > c)) assert.ok(chestTier({ ...s, maxCombo: c2 }) >= t);
    for (const r2 of rates.filter((v) => v > r)) assert.ok(chestTier({ ...s, firstTryRate: r2 }) >= t);
    for (const x2 of extras.filter((v) => v > x)) assert.ok(chestTier({ ...s, extraSolved: x2 }) >= t);
    assert.ok(chestTier({ ...s, solved: count - 1 }) <= t, 'fewer solved never raises it');
  }
});

test('chest goals are written in plain words', () => {
  for (const g of GOALS) assert.match(g.text, /[一-龥]/);
  assert.ok(GOALS.some((g) => g.text === '本局最高连击达到 10'));
});

// ---------------------------------------------------------------- 收藏
test('collection: 15 rewards, three per tier, covering every category', () => {
  assert.equal(col.ITEMS.length, 15);
  for (let t = 0; t <= MAX_TIER; t++) assert.equal(col.itemsOfTier(t).length, 3);
  for (const c of col.CATEGORIES) assert.ok(col.ITEMS.some((i) => i.cat === c.key), c.key);
  assert.equal(new Set(col.ALL_ITEMS.map((i) => i.id)).size, col.ALL_ITEMS.length, 'unique ids');
  for (const i of col.ITEMS.filter((x) => x.cat === 'outfit')) assert.ok(col.SLOTS.includes(i.slot));
});

test('collection: a chest gives the next unowned item of its tier, in the fixed order, then a gift', () => {
  let c = col.emptyCollection();
  const got = [];
  for (let k = 0; k < 4; k++) { const r = col.nextReward(2, c.owned); got.push(r.id); c = col.grant(c, r); }
  assert.deepEqual(got, ['hat-magic', 'gem-amethyst', 'bg-night', 'gift']);
  assert.equal(col.nextReward(2, c.owned).gift, true);
  assert.equal(c.opened, 4);
  assert.equal(c.owned.length, 3, 'gifts add nothing to the collection');
  // Other tiers are untouched by tier 2.
  assert.equal(col.nextReward(0, c.owned).id, 'scarf-red');
  // Same owned list → same reward.
  assert.equal(col.nextReward(4, ['scarf-rainbow']).id, 'bg-candy');
  assert.equal(col.nextReward(4, ['scarf-rainbow']).id, 'bg-candy');
});

test('collection: equip only owned items, outfits toggle per slot, stored data is sanitized', () => {
  let c = col.emptyCollection();
  assert.equal(col.equip(c, 'crown').equip.head, null, 'not owned');
  c = col.grant(c, col.ITEM.crown); c = col.grant(c, col.ITEM['cap-blue']);
  c = col.equip(c, 'crown'); assert.equal(c.equip.head, 'crown');
  c = col.equip(c, 'cap-blue'); assert.equal(c.equip.head, 'cap-blue', 'same slot replaces');
  c = col.equip(c, 'cap-blue'); assert.equal(c.equip.head, null, 'tap again to take it off');
  c = col.equip(c, 'bg-rays'); assert.equal(c.equip.bg, 'bg-rays', 'base items are always owned');
  const n = col.normalize({ owned: ['crown', 'nope', 'bg-rays'], equip: { head: 'crown', face: 'glasses', bg: 'bg-sea', gem: 'x' } });
  assert.deepEqual(n.owned, ['crown']);
  assert.equal(n.equip.head, 'crown'); assert.equal(n.equip.face, null); assert.equal(n.equip.bg, 'bg-rays'); assert.equal(n.equip.gem, 'gem-sapphire');
  assert.deepEqual(col.normalize(null), col.emptyCollection());
  assert.match(col.conditionText(col.ITEM['bg-night']), /紫色蒸笼.*2 个目标.*第 3 件/);
});

// ---------------------------------------------------------------- 合成
test('merge: three of the same filling and size become one of the next size', () => {
  let r = addMember([], 0, 1); r = addMember(r.list, 0, r.nextId);
  assert.equal(r.merges.length, 0);
  r = addMember(r.list, 0, r.nextId);
  assert.equal(r.merges.length, 1);
  assert.deepEqual(r.list.map((m) => m.lv), [1]);
  assert.deepEqual(r.merges[0].ids, [1, 2, 3]);
  // Different fillings never merge.
  let q = { list: [], nextId: 1 };
  for (const f of [0, 1, 0, 1]) q = addMember(q.list, f, q.nextId);
  assert.equal(q.list.length, 4);
});

test('merge cadence: 6 problems merge twice, 10 problems chain to 大 at the 9th, 27 reach 金', () => {
  let s = { list: [], nextId: 1 }; const at = [];
  for (let i = 0; i < 27; i++) { s = addMember(s.list, fillingIndex(i), s.nextId); if (s.merges.length) at.push([i + 1, s.merges.map((m) => m.lv)]); }
  assert.deepEqual(at.slice(0, 3), [[3, [1]], [6, [1]], [9, [1, 2]]]);
  assert.deepEqual(at[at.length - 1], [27, [1, 2, 3]], 'the 27th is a triple chain to 金');
  assert.deepEqual(s.list.map((m) => m.lv), [MAX_LEVEL]);
  assert.equal(buildCrowd(6).merges, 2);
  assert.deepEqual(buildCrowd(10).list.map((m) => m.lv).sort(), [0, 2]);
  assert.deepEqual(buildCrowd(14).list.map((m) => m.lv).sort(), [0, 0, 1, 2]);
});

test('merge: mass is kept, 金 never merges further, fillings change every run', () => {
  for (const n of [1, 5, 9, 14, 30, 60, 90]) assert.equal(mass(buildCrowd(n).list), n);
  const big = buildCrowd(81, 0);
  assert.ok(big.list.filter((m) => m.lv === MAX_LEVEL).length >= 3, 'three 金 stay three 金');
  assert.equal(fillingIndex(0, 2), 2); assert.equal(fillingIndex(RUN - 1, 2), 2); assert.equal(fillingIndex(RUN, 2), 3);
  assert.equal(fillingIndex(RUN * 5, 0), 0);
});

// ---------------------------------------------------------------- 经验与升级
test('level-ups per basic set: 6 → 1, 10 → 2, 14 → 2 (after problems 4 and 9)', () => {
  const ups = (n) => pk.levelUpsBetween(0, n * pk.XP_BASIC);
  assert.equal(ups(6), 1); assert.equal(ups(10), 2); assert.equal(ups(14), 2);
  const when = []; for (let i = 1; i <= 14; i++) if (pk.levelUpsBetween((i - 1) * pk.XP_BASIC, i * pk.XP_BASIC)) when.push(i);
  assert.deepEqual(when, [4, 9]);
  // Extra round: about one more level-up.
  const extraToNext = (n) => { let k = 0; while (pk.levelUpsBetween(n * pk.XP_BASIC, n * pk.XP_BASIC + k * pk.XP_EXTRA) === 0) k++; return k; };
  assert.equal(extraToNext(10), 9); assert.equal(extraToNext(14), 4); assert.equal(extraToNext(6), 4);
  assert.deepEqual(pk.levelOf(0), { level: 1, into: 0, need: 35, frac: 0 });
  assert.equal(pk.levelOf(90).level, 3);
});

test('三选一: fixed rotation by level-up index, skipping perks already taken', () => {
  const ids = (a) => a.map((p) => p.id);
  assert.deepEqual(ids(pk.perkChoices(0, [])), ['sweet20', 'coins', 'gong']);
  assert.deepEqual(ids(pk.perkChoices(1, ['coins'])), ['confetti', 'shades', 'fireworks']);
  assert.deepEqual(ids(pk.perkChoices(2, ['coins', 'shades'])), ['early', 'magnet', 'cheer']);
  assert.deepEqual(ids(pk.perkChoices(3, ['coins', 'shades', 'magnet'])), ['sweet20', 'gong', 'confetti']);
  assert.deepEqual(ids(pk.perkChoices(0, [])), ids(pk.perkChoices(0, [])), 'deterministic');
  const all = pk.PERKS.map((p) => p.id);
  assert.deepEqual(ids(pk.perkChoices(9, all)), ['more', 'more', 'more']);
  assert.equal(pk.sweetBoost(['sweet20', 'coins']), 1.2);
  assert.ok(Math.abs(pk.sweetBoost(['sweet20', 'more', 'more']) - 1.6) < 1e-9);
});

test('连击倍率 tiers: ×1, ×1.5 at 5, ×2 at 10, ×3 at 20, ×4 at 35, ×5 at 50; 倍率提前 moves ×1.5 to 3', () => {
  const m = (c, e) => sc.COMBO_MULTS[sc.comboTier(c, e)];
  assert.deepEqual([0, 4, 5, 9, 10, 19, 20, 34, 35, 49, 50, 200].map((c) => m(c)), [1, 1, 1.5, 1.5, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(m(3, true), 1.5); assert.equal(m(3, false), 1); assert.equal(m(10, true), 2);
  assert.ok(sc.addSweet(0, 0.1, 20) > sc.addSweet(0, 0.1, 10));
  assert.ok(sc.addSweet(0, 0.1, 0, { boost: 1.2 }) > sc.addSweet(0, 0.1, 0));
  assert.equal(sc.fmtMult(1.5), '×1.5');
});
