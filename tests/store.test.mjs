// 清除全部记录（store.js）：只删 `tangyuan:` 开头的键，删除失败不抛异常。
import test from 'node:test';
import assert from 'node:assert/strict';
import { wipePrefixed } from '../app/js/store.js';

// A Map-backed stand-in for localStorage. fail: keys whose removeItem throws.
function fakeStorage(entries, { fail = [], brokenKey = false } = {}) {
  const m = new Map(entries);
  return {
    m,
    get length() { if (brokenKey === 'length') throw new Error('blocked'); return m.size; },
    key(i) { if (brokenKey === 'key' && i > 0) throw new Error('blocked'); return [...m.keys()][i] ?? null; },
    removeItem(k) { if (fail.includes(k)) throw new Error('nope'); m.delete(k); },
  };
}
const ALL = [
  ['tangyuan:settings', '{}'], ['other:app', '1'], ['tangyuan:progress', '{}'], ['tangyuan:mistakes', '{}'],
  ['tangyuan:daily', '{}'], ['tangyuan:collection', '{}'], ['tangyuanX', 'keep'], ['tangyuan:records', '[]'],
  ['tangyuan:capsule', '{}'], ['theme', 'dark'],
];

test('wipePrefixed removes only tangyuan: keys, including neighbours in the index order', () => {
  const st = fakeStorage(ALL);
  const removed = wipePrefixed(st);
  assert.deepEqual(removed.sort(), ALL.map(([k]) => k).filter((k) => k.startsWith('tangyuan:')).sort());
  assert.deepEqual([...st.m.keys()].sort(), ['other:app', 'tangyuanX', 'theme']);
  assert.deepEqual(wipePrefixed(st), [], 'second time: nothing left');
});

test('wipePrefixed never throws', () => {
  const st = fakeStorage(ALL, { fail: ['tangyuan:progress'] });
  const removed = wipePrefixed(st);
  assert.ok(!removed.includes('tangyuan:progress'));
  assert.ok(st.m.has('tangyuan:progress'), 'the failing key stays');
  assert.ok(!st.m.has('tangyuan:mistakes'), 'the others are still removed');
  assert.deepEqual(wipePrefixed(fakeStorage(ALL, { brokenKey: 'length' })), []);
  const half = fakeStorage(ALL, { brokenKey: 'key' });
  assert.deepEqual(wipePrefixed(half), ['tangyuan:settings'], 'keys listed before the error are removed');
  assert.deepEqual(wipePrefixed(null), []);
});
