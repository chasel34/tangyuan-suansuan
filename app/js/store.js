// localStorage with the `tangyuan:` prefix. Every access is guarded: private mode or blocked
// storage just means nothing is remembered.
const PREFIX = 'tangyuan:';
// Set by clearAllRecords(): from then on nothing is written, so a pending save (the idle queue or the
// pagehide flush in main.js) cannot put the old data back before the page reloads.
let locked = false;

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return structuredClone(fallback);
    const v = JSON.parse(raw);
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...structuredClone(fallback), ...v } : v;
  } catch { return structuredClone(fallback); }
}

export function save(key, value) {
  if (locked) return;
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
}

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const DEFAULT_SETTINGS = { count: 10, grade: 1, sound: true, volume: 0.8, motion: reduced ? 0 : 1 };

export const loadSettings = () => load('settings', DEFAULT_SETTINGS);
export const saveSettings = (s) => save('settings', s);

// Last results (kept short; M1 only shows the best 甜度).
export function addRecord(rec) {
  const list = load('records', []);
  list.push({ ...rec, at: Date.now() });
  save('records', list.slice(-50));
}

// ---------------------------------------------------------------- 今日小目标、连续天数、补签卡 (daily.js)
import * as daily from './daily.js';
export const { DAILY_GOAL, dayKey } = daily;
const readDaily = () => daily.normalizeDaily(load('daily', null));

// Today's state. A broken streak that cards can still save keeps its number until the child answers
// the offer (daily.js explains when it becomes 0).
export const loadDaily = (today = dayKey()) => daily.rollDaily(readDaily(), today);

// One solved problem (and the combo reached so far). Returns { d, earned, full } (see daily.noteSolve).
export function noteDaily(combo, today = dayKey()) {
  const res = daily.noteSolve(readDaily(), today, combo);
  save('daily', res.d);
  return res;
}

// 补签: the three answers to the offer (main.js reads the offer itself with daily.patchOffer).
export function markPatchAsked(today = dayKey()) { save('daily', daily.markAsked(readDaily(), today)); }
export function declinePatch(today = dayKey()) { save('daily', daily.declinePatch(readDaily(), today)); }
export function usePatch(today = dayKey()) {
  const d = daily.usePatch(readDaily(), today);
  if (d) save('daily', d);
  return d;
}
export const saveDaily = (d) => save('daily', daily.normalizeDaily(d));

// ---------------------------------------------------------------- 收藏 (permanent, cosmetic only)
import { normalize } from './collection.js';
export const loadCollection = () => normalize(load('collection', null));
export const saveCollection = (c) => save('collection', { owned: c.owned, equip: c.equip, opened: c.opened });

// ---------------------------------------------------------------- 成长记录 (progress.js)
import { normalizeProgress } from './progress.js';
export const loadProgress = () => normalizeProgress(load('progress', null));
export const saveProgress = (p) => save('progress', p);

// ---------------------------------------------------------------- 错题本 (mistakes.js)
import { normalizeMistakes } from './mistakes.js';
export const loadMistakes = () => normalizeMistakes(load('mistakes', null));
export const saveMistakes = (m) => save('mistakes', m);

// ---------------------------------------------------------------- 时间胶囊 (growth.js)
// { lastDay: 'YYYY-MM-DD' }: the day a capsule intro was last shown (at most one capsule a day).
export function loadCapsuleDay() {
  const v = load('capsule', null);
  return v && typeof v.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.lastDay) ? v.lastDay : '';
}
export const saveCapsuleDay = (day) => save('capsule', { lastDay: day });

// ---------------------------------------------------------------- 清除全部记录
// Removes every key that starts with `prefix` from a Storage-like object ({ length, key(i),
// removeItem(k) }) and leaves the others. Keys are listed first (removing while walking by index
// would skip some). Never throws: a key that cannot be removed is skipped. Returns the removed keys.
export function wipePrefixed(storage, prefix = PREFIX) {
  const keys = [];
  try {
    const n = storage.length;
    for (let i = 0; i < n; i++) { const k = storage.key(i); if (typeof k === 'string' && k.startsWith(prefix)) keys.push(k); }
  } catch { /* storage not readable: the keys found so far */ }
  const removed = [];
  for (const k of keys) { try { storage.removeItem(k); removed.push(k); } catch { /* skip */ } }
  return removed;
}
// Stops all writes for the rest of this page and removes every `tangyuan:` key. The caller reloads.
export function clearAllRecords() {
  locked = true;
  try { return wipePrefixed(localStorage); } catch { return []; }
}
