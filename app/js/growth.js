// "进步了！"和时间胶囊：都是拿成长记录（progress.js 的 state）里过去的表现和现在比。
// 纯逻辑：不碰 DOM、不读 localStorage，node 可以直接 import。所有函数都把"今天"作为参数。
//
// 进步了（结算页，最多 3 行）
//   对本局出现过的每个技能，"现在"是这个技能今天的日汇总 days[today]（已经包含本局）。
//   比较对象依次是：上次练习的那天（今天以前最后一个日汇总，那天不足 3 题就不比上次）、21 天以前最近的一天、最早的 3 题
//   （first3，三题都早于今天才用）。双方都至少 3 题才比；今天的不和今天比。
//   用时按"每格平均毫秒"比，缩短 ≥ 10% 算进步；第一次就答对率提高 ≥ 10 个百分点算进步。
//   两个边界都用整数交叉相乘判断，没有浮点误差。每个技能只取改善最大的一项，全局按改善幅度
//   从大到小取前 3。只返回进步，从不返回退步。
//
// 时间胶囊（按年级开局的基本题里，每天最多 1 题）
//   从已掌握技能的 first3 里选"做题时间距今 ≥ 30 天、没用过"的最旧一题，原样再出一次，
//   放在下标 max(1, min(N-2, floor(N/2)))。N ≥ 4 时这个下标 ≥ 2，不会和擦亮旧技能（下标 1，或 0）
//   重合；万一重合，保留擦亮题、这局不出胶囊。
//   做完后比较：本次用时 < 当时 × 0.95 → 快了；否则本次答错次数 < 当时 → 少错了；否则只说又做对了。
import { SKILL } from './skills.js';
import { DAY_MS, recOf } from './progress.js';
import { daysBetween, localDay } from './daily.js';

export const COMPARE = { minN: 3, monthDays: 21 };
export const CAPSULE = { days: 30, minN: 4 };


// ---------------------------------------------------------------- 进步了
// A reference or the current side: { n, first, ms, cells } (sums), like a days entry.
const cellsOf = (p) => Math.max(1, p && Array.isArray(p.steps) ? p.steps.length : 1);
function first3Ref(r, today) {
  const f = r.first3 || [];
  if (f.length < COMPARE.minN || !f.every((e) => e.day < today)) return null;
  return { kind: 'first', day: f[0].day, n: f.length, first: f.filter((e) => !e.misses).length, ms: f.reduce((a, e) => a + e.ms, 0), cells: f.reduce((a, e) => a + cellsOf(e.p), 0) };
}
// The references for one skill record, in order: prev, month, first (duplicates dropped).
export function compareRefs(r, today) {
  if (!r) return [];
  const before = (r.days || []).filter((g) => g.day < today);
  const refs = [];
  // 上次 is the last practice day before today; with fewer than 3 problems that day it is skipped
  // (not replaced by an earlier day).
  const last = before[before.length - 1];
  const prev = last && last.n >= COMPARE.minN ? last : null;
  if (prev) refs.push({ kind: 'prev', ...prev });
  const month = before.filter((g) => g.n >= COMPARE.minN && daysBetween(g.day, today) >= COMPARE.monthDays).pop();
  if (month && (!prev || month.day !== prev.day)) refs.push({ kind: 'month', ...month });
  const f = first3Ref(r, today);
  if (f) refs.push(f);
  return refs;
}

// The biggest improvement of `cur` over the references of record `r`, or null.
// Result: { kind, day, what: 'time'|'rate', from, to, gain }. For 'time', from/to are ms per problem
// at today's average cell count; for 'rate', fractions 0..1. gain: fraction for time (0.1 = 10%
// faster), points/100 for rate (0.1 = 10 percentage points).
export function compareSkill(r, cur, today) {
  if (!r || !cur || cur.n < COMPARE.minN || cur.cells <= 0) return null;
  const cellsNow = cur.cells / cur.n;
  let best = null;
  const take = (x) => { if (!best || x.gain > best.gain) best = x; };
  for (const ref of compareRefs(r, today)) {
    // Time per cell: cur.ms/cur.cells <= 0.9 × ref.ms/ref.cells  ⇔  10·cur.ms·ref.cells <= 9·ref.ms·cur.cells
    if (ref.ms > 0 && ref.cells > 0 && 10 * cur.ms * ref.cells <= 9 * ref.ms * cur.cells) {
      const before = ref.ms / ref.cells; const now = cur.ms / cur.cells;
      take({ kind: ref.kind, day: ref.day, what: 'time', from: before * cellsNow, to: now * cellsNow, gain: (before - now) / before });
    }
    // First-try rate: cur.first/cur.n − ref.first/ref.n >= 0.1  ⇔  10·(cur.first·ref.n − ref.first·cur.n) >= cur.n·ref.n
    if (10 * (cur.first * ref.n - ref.first * cur.n) >= cur.n * ref.n) {
      take({ kind: ref.kind, day: ref.day, what: 'rate', from: ref.first / ref.n, to: cur.first / cur.n, gain: cur.first / cur.n - ref.first / ref.n });
    }
  }
  return best;
}

// Up to `max` improvements for the skills of this round, biggest first (ties by skill id).
// skills: the skill ids played in this round; state: progress state (already holding this round).
export function improvements(state, skills, today, max = 3) {
  const out = [];
  for (const id of new Set(skills)) {
    const r = state.skills[id];
    if (!r || !SKILL[id]) continue;
    const cur = (r.days || []).find((g) => g.day === today);
    const best = compareSkill(r, cur, today);
    if (best) out.push({ skill: id, ...best });
  }
  return out.sort((a, b) => b.gain - a.gain || (a.skill < b.skill ? -1 : 1)).slice(0, max);
}

// ---------------------------------------------------------------- 时间胶囊
// The oldest unused first3 problem of a mastered skill done at least 30 days ago, or null.
// { skill, index, entry }.
export function pickCapsule(state, now) {
  let best = null;
  for (const [id, r] of Object.entries(state.skills)) {
    if (!SKILL[id] || !r.mastered) continue;
    (r.first3 || []).forEach((e, i) => {
      if (e.used || !e.p || !(e.at > 0) || now - e.at < CAPSULE.days * DAY_MS) return;
      if (!best || e.at < best.entry.at || (e.at === best.entry.at && (id < best.skill || (id === best.skill && i < best.index)))) best = { skill: id, index: i, entry: e };
    });
  }
  return best;
}

export const capsuleIndex = (N) => Math.max(1, Math.min(N - 2, Math.floor(N / 2)));

// Put the capsule into a basic plan. Returns { plan, problems, capsuleIndex, capsule } as new
// arrays (the inputs are not changed); capsuleIndex = -1 when nothing was placed (N < 4, no pick,
// or the slot is the 擦亮旧技能 slot). The problem is a JSON copy of the stored one.
// capsule = { skill, index, day, ms, misses } (what the comparison needs afterwards).
// `at` overrides the slot (debug only: window.__game.capsuleNow puts it first).
export function withCapsule(plan, problems, pick, rustIndex = -1, at = null) {
  const outPlan = plan.slice(); const outProblems = problems.slice();
  const none = { plan: outPlan, problems: outProblems, capsuleIndex: -1, capsule: null };
  if (!pick || outPlan.length < CAPSULE.minN) return none;
  const k = at ?? capsuleIndex(outPlan.length);
  if (k === rustIndex) return none;
  const p = JSON.parse(JSON.stringify(pick.entry.p));
  outPlan[k] = pick.skill;
  outProblems[k] = p;
  return { plan: outPlan, problems: outProblems, capsuleIndex: k, capsule: { skill: pick.skill, index: pick.index, day: pick.entry.day, ms: pick.entry.ms, misses: pick.entry.misses } };
}

// That day vs today on the same problem. { what: 'time', from, to } when today is faster than
// 95% of that day's time (exactly 5% faster is not enough); else { what: 'miss', from, to } when
// there were fewer misses; else { what: 'again' }.
export function capsuleCompare(then, ms, misses) {
  if (then.ms > 0 && ms < then.ms * 0.95) return { what: 'time', from: then.ms, to: ms };
  if (misses < then.misses) return { what: 'miss', from: then.misses, to: misses };
  return { what: 'again' };
}

// ---------------------------------------------------------------- 文案
export const fmtDay = (key) => { const [, m, d] = key.split('-').map(Number); return `${m}月${d}日`; };
// Seconds with one decimal, at least 0.1.
export const fmtSec = (ms) => Math.max(0.1, Math.round(ms / 100) / 10).toFixed(1).replace(/\.0$/, '');
export function capsuleText(c, day) {
  const d = fmtDay(day);
  if (c.what === 'time') return `比 ${d} 快了 ${fmtSec(c.from - c.to)} 秒`;
  if (c.what === 'miss') return `比 ${d} 少错了 ${c.from - c.to} 次`;
  return `${d} 做过的题，今天又做对了`;
}
// One 进步了 line: { name, since, sep, text, line }. name is the full skill name (short names repeat
// across skills, e.g. 进位加法); line = since + sep + text, e.g. "比 9月4日 每题快了 12.4 秒".
export function improvementText(x) {
  const since = x.kind === 'first' ? '比最早做的 3 题' : x.kind === 'prev' ? `比上次（${fmtDay(x.day)}）` : `比 ${fmtDay(x.day)}`;
  const sep = x.kind === 'prev' ? '' : ' ';
  const text = x.what === 'time' ? `每题快了 ${fmtSec(x.from - x.to)} 秒` : `首次正确率从 ${Math.round(x.from * 100)}% 升到 ${Math.round(x.to * 100)}%`;
  return { name: SKILL[x.skill] ? SKILL[x.skill].name : x.skill, since, sep, text, line: since + sep + text };
}

// ---------------------------------------------------------------- debug helpers (pure; window.__game uses them)
function putDay(r, g) {
  r.days = r.days.filter((x) => x.day !== g.day);
  r.days.push(g);
  r.days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

// A capsule for skill `id`: its first3 become `problems` (3 of them) solved `daysAgo` days before
// `now` (slow times, 2 misses on the second one), and the skill is mastered with a recent first-try
// answer (so it is not rusty). Also writes that old day into `days`.
export function fakeCapsuleData(state, id, problems, now, daysAgo = 35) {
  const r = recOf(state, id);
  const at = now - daysAgo * DAY_MS; const day = localDay(at);
  r.first3 = problems.slice(0, 3).map((p, i) => ({ p: JSON.parse(JSON.stringify(p)), day, at: at + i * 60000, ms: 12000 + 4000 * i, misses: i === 1 ? 2 : 0, used: false }));
  const cells = r.first3.reduce((a, e) => a + cellsOf(e.p), 0);
  putDay(r, { day, n: 3, first: 2, ms: r.first3.reduce((a, e) => a + e.ms, 0), cells });
  r.n = Math.max(r.n, 3);
  r.last6 = [true, true, true, true, true, true];
  if (!r.mastered) { r.mastered = true; r.masteredAt = now - DAY_MS; }
  r.lastFirstAt = now - DAY_MS;
  return state;
}

// History that makes 进步了 show for these skills after one more problem today: a past day and
// two problems already done today (the last days entry, so the next solve adds to it). Three
// patterns in turn: slower on the last practice day (time), fewer first-try answers on the last
// practice day (rate), and slower 25 days ago with an ordinary last practice day (time, 比 X月X日).
// cellsOf(id) gives a typical cell count of the skill.
export function fakeGainData(state, ids, now, cellsOfSkill) {
  const today = localDay(now);
  ids.forEach((id, i) => {
    if (!SKILL[id]) return;
    const r = recOf(state, id);
    const c = Math.max(1, cellsOfSkill(id));
    const prevDay = localDay(now - 3 * DAY_MS); const monthDay = localDay(now - 25 * DAY_MS);
    r.days = r.days.filter((g) => g.day < monthDay);
    const kind = i % 3;
    if (kind === 0) putDay(r, { day: prevDay, n: 5, first: 5, ms: 5 * c * 6000, cells: 5 * c });
    if (kind === 1) putDay(r, { day: prevDay, n: 5, first: 1, ms: 5 * c * 1200, cells: 5 * c });
    if (kind === 2) { putDay(r, { day: monthDay, n: 4, first: 3, ms: 4 * c * 7000, cells: 4 * c }); putDay(r, { day: prevDay, n: 4, first: 4, ms: 4 * c * 1200, cells: 4 * c }); }
    putDay(r, { day: today, n: 2, first: 2, ms: 2 * c * 1500, cells: 2 * c });
    r.n = Math.max(r.n, 10);
  });
  return state;
}
