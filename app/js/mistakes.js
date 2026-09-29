// 错题本：做的过程中答错过、最后做完了的题。纯逻辑：不碰 DOM、不读 localStorage，node 可以直接 import。
// main.js 用 store.loadMistakes()/saveMistakes() 读写 `tangyuan:mistakes`。
//
// 数据结构（state）：
//   { v: 1, list: [ { key, skill, day, p } ] }   旧的在前，最多 MISTAKES_MAX(40) 条
//     key:   skill + '|' + signature(p)，用来去重（同一道题只留最新的一条）
//     skill: 技能 id
//     day:   最近一次加入的日期 'YYYY-MM-DD'
//     p:     完整题目对象（JSON 往返后的副本，全部 38 个技能都能原样恢复）
//
// 规则：
//   加入：一道题答错过至少一次并且做完了（基本题、加时赛、错题再练都算）。中途退出的题不加。
//   错题再练：从列表末尾取 min(题数设置, REVIEW_MAX(10), 列表长度) 题，按列表里的顺序出。
//             第一次就答对的移出列表；又答错的按"加入"处理（移到末尾，日期更新）。
import { signature } from './problems.js';
import { SKILL } from './skills.js';

export const MISTAKES_VERSION = 1;
export const MISTAKES_MAX = 40;
export const REVIEW_MAX = 10;

export const emptyMistakes = () => ({ v: MISTAKES_VERSION, list: [] });
export const mistakeKey = (skill, p) => `${skill}|${signature(p)}`;

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
// A stored problem is usable when it has what the renderer and the judge read.
export const usable = (p) => isObj(p) && typeof p.text === 'string' && Array.isArray(p.steps) && p.steps.length > 0
  && Array.isArray(p.answers) && p.answers.length > 0 && p.answers.every(Array.isArray) && typeof p.kind === 'string';

// Anything read from storage goes through here. Broken entries and unknown skills are dropped,
// duplicates keep the newest one.
export function normalizeMistakes(raw) {
  const out = emptyMistakes();
  if (!isObj(raw) || !Array.isArray(raw.list)) return out;
  for (const e of raw.list) {
    if (!isObj(e) || !SKILL[e.skill] || !usable(e.p)) continue;
    const key = mistakeKey(e.skill, e.p);
    const i = out.list.findIndex((x) => x.key === key);
    if (i >= 0) out.list.splice(i, 1);
    out.list.push({ key, skill: e.skill, day: isDay(e.day) ? e.day : '1970-01-01', p: e.p });
  }
  if (out.list.length > MISTAKES_MAX) out.list.splice(0, out.list.length - MISTAKES_MAX);
  return out;
}

export const mistakeCount = (state) => state.list.length;

// Add (or refresh) one problem. The same problem moves to the end with the new day. Returns the key.
export function addMistake(state, problem, day) {
  const skill = problem && problem.skill;
  if (!SKILL[skill] || !usable(problem)) return null;
  const key = mistakeKey(skill, problem);
  removeMistake(state, key);
  state.list.push({ key, skill, day, p: JSON.parse(JSON.stringify(problem)) });
  if (state.list.length > MISTAKES_MAX) state.list.splice(0, state.list.length - MISTAKES_MAX);
  return key;
}

export function removeMistake(state, key) {
  const i = state.list.findIndex((e) => e.key === key);
  if (i < 0) return false;
  state.list.splice(i, 1);
  return true;
}

// Problems for one 错题再练 round: the last min(count, REVIEW_MAX, length) entries, in list order.
// Each problem is a fresh copy, so playing it never changes the stored one.
export function pickReview(state, count) {
  const n = Math.max(0, Math.min(Math.floor(Number(count) || 0), REVIEW_MAX, state.list.length));
  return state.list.slice(state.list.length - n).map((e) => ({ key: e.key, skill: e.skill, day: e.day, p: JSON.parse(JSON.stringify(e.p)) }));
}

// One finished problem. misses > 0: add (or move to the end). In a review round a first-try answer
// removes it. Returns 'added' | 'removed' | null.
export function settleMistake(state, problem, { misses = 0, review = false, key = null, day } = {}) {
  if (misses > 0) return addMistake(state, problem, day) ? 'added' : null;
  if (review) return removeMistake(state, key || mistakeKey(problem.skill, problem)) ? 'removed' : null;
  return null;
}
