// 今日小目标、连续天数、补签卡（daily.js）：日期计算（跨月、跨年、闰年）、得卡、补签提示的条件、
// 拒绝、使用、清零时机、损坏数据修复。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as dl from '../app/js/daily.js';

// A state whose last practice day is `lastDay` with `streak` days in a row.
const st = (lastDay, streak, extra = {}) => ({ ...dl.emptyDaily(), day: lastDay, solved: 3, lastDay, streak, ...extra });
// Practise n problems on `today`.
const play = (d, today, n = 1) => { let r; for (let i = 0; i < n; i++) { r = dl.noteSolve(d, today, 5); d = r.d; } return r; };

test('date helpers: month, year and leap-day boundaries', () => {
  assert.equal(dl.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(dl.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(dl.addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(dl.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(dl.daysBetween('2025-12-30', '2026-01-02'), 3);
  assert.equal(dl.daysBetween('2026-03-07', '2026-03-10'), 3, 'across a daylight-saving change');
  assert.equal(dl.dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('noteSolve: streak counts practice days, today counts reset each day', () => {
  let d = dl.emptyDaily();
  d = play(d, '2026-09-27', 2).d;
  assert.equal(d.streak, 1); assert.equal(d.solved, 2);
  d = play(d, '2026-09-28').d;
  assert.equal(d.streak, 2); assert.equal(d.solved, 1, 'new day');
  d = play(d, '2026-09-28').d;
  assert.equal(d.streak, 2, 'same day twice');
  assert.equal(dl.shownStreak(d, '2026-09-29'), 2, 'yesterday: still alive');
  d = play(d, '2026-10-01').d;
  assert.equal(d.streak, 1, 'practising after a break without a card starts again');
});

test('cards: start with 1, +1 when the daily goal is reached (once a day), at most 3', () => {
  let d = dl.normalizeDaily({ day: '2026-09-29', solved: 0, lastDay: '2026-09-28', streak: 3 });
  assert.equal(d.cards, 1, 'old saves without the field get the first card');
  let r = play(d, '2026-09-29', dl.DAILY_GOAL - 1);
  assert.equal(r.earned, false);
  r = play(r.d, '2026-09-29');
  assert.deepEqual([r.earned, r.full, r.d.cards], [true, false, 2]);
  r = play(r.d, '2026-09-29', 30);
  assert.equal(r.d.cards, 2, 'once a day');
  r = play(r.d, '2026-09-30', dl.DAILY_GOAL);
  assert.deepEqual([r.earned, r.d.cards], [true, 3]);
  let full = false;
  for (let i = 0; i < dl.DAILY_GOAL; i++) { r = dl.noteSolve(r.d, '2026-10-01', 1); full ||= r.full; assert.equal(r.earned, false); }
  assert.ok(full, 'full: only a note');
  assert.equal(r.d.cards, dl.CARDS.max);
});

test('offer: one missed day, streak >= 2, one card', () => {
  const d = dl.rollDaily(st('2026-09-27', 4), '2026-09-29');
  assert.deepEqual(dl.patchOffer(d, '2026-09-29'), { days: ['2026-09-28'], run: 4, cards: 1 });
  assert.equal(d.streak, 4, 'kept while the offer is open');
  assert.deepEqual(dl.streakView(d, '2026-09-29'), { n: 4, pending: true }, 'the title shows the old number, marked 待补签');
  assert.equal(dl.shownStreak(d, '2026-09-29'), 4);
  assert.deepEqual(dl.streakView(st('2026-09-25', 4), '2026-09-29'), { n: 0, pending: false }, 'cannot be saved: 0');
  assert.equal(dl.patchOffer(st('2026-09-28', 4), '2026-09-29'), null, 'not broken');
  assert.equal(dl.patchOffer(st('2026-09-29', 4), '2026-09-29'), null, 'practised today');
});

test('offer across a month and a year', () => {
  assert.deepEqual(dl.patchOffer(st('2026-02-26', 5, { cards: 2 }), '2026-03-01').days, ['2026-02-27', '2026-02-28']);
  assert.deepEqual(dl.patchOffer(st('2028-02-28', 5, { cards: 2 }), '2028-03-02').days, ['2028-02-29', '2028-03-01'], 'leap year');
  assert.equal(dl.patchOffer(st('2028-02-27', 5, { cards: 2 }), '2028-03-02'), null, 'leap year: 3 days missed, 2 cards');
  assert.deepEqual(dl.patchOffer(st('2025-12-30', 3, { cards: 2 }), '2026-01-02').days, ['2025-12-31', '2026-01-01']);
});

test('no offer: not enough cards, streak < 2, too long ago, no cards', () => {
  const today = '2026-09-29';
  const cases = [
    [st('2026-09-25', 5, { cards: 2 }), 'three missed days, two cards'],
    [st('2026-09-27', 1), 'streak of 1'],
    [st('2026-09-20', 9, { cards: 3 }), 'more than 7 days ago'],
    [st('2026-09-27', 5, { cards: 0 }), 'no cards'],
    [dl.emptyDaily(), 'never practised'],
  ];
  for (const [d, why] of cases) {
    assert.equal(dl.patchOffer(d, today), null, why);
    const rolled = dl.rollDaily(d, today);
    assert.equal(rolled.streak, 0, `${why}: cannot be saved, so it is 0`);
  }
});

test('offer once a day: already shown today, declined', () => {
  const today = '2026-09-29';
  const shown = dl.markAsked(st('2026-09-27', 4), today);
  assert.equal(dl.patchOffer(shown, today), null, 'shown today');
  assert.equal(dl.rollDaily(shown, today).streak, 4, 'shown but not answered: streak still waits');
  assert.ok(dl.patchOffer(shown, '2026-09-30') === null, 'next day: 2 missed days, 1 card');
  const two = dl.markAsked(st('2026-09-27', 4, { cards: 2 }), today);
  assert.deepEqual(dl.patchOffer(two, '2026-09-30').days, ['2026-09-28', '2026-09-29'], 'next day with 2 cards: offered again');
  const no = dl.declinePatch(st('2026-09-27', 4), today);
  assert.equal(no.streak, 0);
  assert.equal(dl.patchOffer(no, today), null);
  assert.equal(dl.patchOffer(no, '2026-09-30'), null, 'declined: gone for good');
  assert.equal(dl.usePatch(no, today), null);
});

test('usePatch: the streak goes on, filled days are not practice days, log kept', () => {
  const today = '2026-09-29';
  const d = dl.usePatch(st('2026-09-26', 6, { cards: 3 }), today);
  assert.equal(d.cards, 1);
  assert.equal(d.patchedTo, '2026-09-28');
  assert.deepEqual(d.log, [{ day: today, days: ['2026-09-27', '2026-09-28'] }]);
  assert.equal(d.streak, 6, 'filled days are not counted');
  assert.equal(dl.shownStreak(d, today), 6);
  assert.equal(dl.patchOffer(d, today), null);
  assert.equal(play(d, today).d.streak, 7, 'practising today continues it');
  // Used, then skipped the next day as well: offered again if a card is left.
  const skip = dl.rollDaily(d, '2026-09-30');
  assert.equal(skip.streak, 6);
  assert.deepEqual(dl.patchOffer(skip, '2026-09-30'), { days: ['2026-09-29'], run: 6, cards: 1 });
  const again = dl.usePatch(skip, '2026-09-30');
  assert.equal(again.cards, 0);
  assert.equal(again.log.length, 2);
  assert.equal(play(again, '2026-09-30').d.streak, 7);
  // Not possible: nothing changes.
  assert.equal(dl.usePatch(st('2026-09-25', 5, { cards: 1 }), today), null);
});

test('log keeps the last 50 uses', () => {
  let d = st('2026-01-01', 3, { cards: 3 });
  let day = '2026-01-01';
  for (let i = 0; i < 60; i++) {
    const today = dl.addDays(day, 2);
    d = dl.usePatch({ ...d, cards: 3 }, today);
    assert.ok(d, `use ${i}`);
    d = play(d, today).d;
    day = today;
  }
  assert.equal(d.log.length, dl.CARDS.log);
  assert.equal(d.log[49].day, day);
  assert.equal(d.streak, 63);
});

test('normalizeDaily: broken data becomes a usable state', () => {
  assert.deepEqual(dl.normalizeDaily(null), dl.emptyDaily());
  assert.deepEqual(dl.normalizeDaily([1]), dl.emptyDaily());
  const d = dl.normalizeDaily({ day: 'x', solved: -3, streak: 'a', cards: 9, lastDay: '2026-09-01', log: [{ day: '2026-09-02', days: ['2026-09-01'] }, { day: 1 }, 'x'] });
  assert.equal(d.day, ''); assert.equal(d.solved, 0); assert.equal(d.streak, 0);
  assert.equal(d.cards, dl.CARDS.max);
  assert.equal(d.lastDay, '2026-09-01');
  assert.deepEqual(d.log, [{ day: '2026-09-02', days: ['2026-09-01'] }]);
});

test('practising before answering is not a "no": the offer stays for the rest of the day', () => {
  const today = '2026-09-29';
  const asked = dl.markAsked(st('2026-09-27', 5), today);
  assert.equal(dl.patchOffer(asked, today), null, 'popped up once');
  let r = play(asked, today, 3);
  assert.equal(r.d.lastDay, today);
  assert.equal(r.d.streak, 1, 'today counts from 1 for now');
  assert.deepEqual(r.d.held, { day: today, run: 5, cover: '2026-09-27', last: '2026-09-27' });
  assert.deepEqual(dl.patchOffer(r.d, today, { ignoreAsked: true }), { days: ['2026-09-28'], run: 5, cards: 1 }, 'the entry is still there');
  assert.equal(dl.patchOffer(r.d, today), null, 'but it does not pop up again');
  assert.deepEqual(dl.streakView(r.d, today), { n: 5, pending: true });
  assert.deepEqual(dl.missedDays(r.d, today), ['2026-09-28'], 'the gap is still before the old cover, not lastDay');
  // Survives a reload (normalize) and more practice.
  const again = play(dl.normalizeDaily(JSON.parse(JSON.stringify(r.d))), today, 2).d;
  assert.deepEqual(again.held, r.d.held);
  const used = dl.usePatch(again, today);
  assert.equal(used.streak, 6, 'old 5 + today');
  assert.equal(used.patchedTo, '2026-09-28');
  assert.equal(used.held, null);
  assert.equal(used.cards, 0);
  assert.deepEqual(dl.streakView(used, today), { n: 6, pending: false });
  assert.equal(play(used, today).d.streak, 6, 'more today: still 6');
  assert.equal(play(used, '2026-09-30').d.streak, 7, 'tomorrow: 7');
});

test('practise first, then decline: today keeps 1; next day the held run is gone', () => {
  const today = '2026-09-29';
  const r = play(st('2026-09-26', 4, { cards: 2 }), today);
  assert.deepEqual(dl.missedDays(r.d, today), ['2026-09-27', '2026-09-28']);
  const no = dl.declinePatch(r.d, today);
  assert.equal(no.streak, 1);
  assert.equal(no.held, null);
  assert.equal(dl.patchOffer(no, today, { ignoreAsked: true }), null);
  assert.deepEqual(dl.streakView(no, today), { n: 1, pending: false });
  // Not answered at all: tomorrow the held run is dropped and today's streak goes on.
  const next = dl.rollDaily(r.d, '2026-09-30');
  assert.equal(next.held, null);
  assert.equal(dl.patchOffer(next, '2026-09-30', { ignoreAsked: true }), null);
  assert.equal(play(r.d, '2026-09-30').d.streak, 2);
  // Across a month end, two cards.
  const m = play(st('2026-09-28', 3, { cards: 2 }), '2026-10-01').d;
  assert.deepEqual(dl.usePatch(m, '2026-10-01').log.at(-1).days, ['2026-09-29', '2026-09-30']);
  assert.equal(dl.usePatch(m, '2026-10-01').streak, 4);
});

test('practising when no card can help: nothing held', () => {
  const today = '2026-09-29';
  for (const d of [st('2026-09-25', 5, { cards: 2 }), st('2026-09-27', 1), dl.declinePatch(st('2026-09-27', 4), today)]) {
    const r = play(d, today);
    assert.equal(r.d.held, null);
    assert.equal(r.d.streak, 1);
  }
  // Reaching the goal after practising gives a card; the held run can still be joined.
  const r = play(st('2026-09-27', 3), today, dl.DAILY_GOAL);
  assert.equal(r.d.cards, 2);
  assert.equal(dl.usePatch(r.d, today).streak, 4);
  assert.equal(dl.usePatch(r.d, today).cards, 1);
  assert.equal(dl.normalizeDaily({ held: { day: 'x', run: 3 } }).held, null, 'broken held');
});
