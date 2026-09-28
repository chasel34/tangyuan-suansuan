// localStorage with the `tangyuan:` prefix. Every access is guarded: private mode or blocked
// storage just means nothing is remembered.
const PREFIX = 'tangyuan:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return structuredClone(fallback);
    const v = JSON.parse(raw);
    return fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? { ...structuredClone(fallback), ...v } : v;
  } catch { return structuredClone(fallback); }
}

export function save(key, value) {
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

// ---------------------------------------------------------------- 今日小目标 (local, per day)
export const DAILY_GOAL = 20;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const prevDay = (key) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1)); };

export function loadDaily() {
  const d = load('daily', { day: '', solved: 0, bestCombo: 0, streak: 0, lastDay: '' });
  const today = dayKey();
  if (d.day !== today) { d.day = today; d.solved = 0; d.bestCombo = 0; }
  // A streak is still alive if the last practice day was today or yesterday.
  if (d.lastDay && d.lastDay !== today && d.lastDay !== prevDay(today)) d.streak = 0;
  return d;
}

// One solved problem (and the combo reached so far).
export function noteDaily(combo) {
  const d = loadDaily();
  const today = dayKey();
  if (d.lastDay !== today) { d.streak = d.lastDay === prevDay(today) ? d.streak + 1 : 1; d.lastDay = today; }
  d.solved += 1;
  d.bestCombo = Math.max(d.bestCombo, combo);
  save('daily', d);
  return d;
}

// ---------------------------------------------------------------- 收藏 (permanent, cosmetic only)
import { normalize } from './collection.js';
export const loadCollection = () => normalize(load('collection', null));
export const saveCollection = (c) => save('collection', { owned: c.owned, equip: c.equip, opened: c.opened });
