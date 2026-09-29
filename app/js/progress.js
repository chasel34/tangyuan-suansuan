// 成长记录：每个技能的练习历史、掌握、生锈、跨局去重。纯逻辑：不碰 DOM、不读 localStorage，
// node 可以直接 import。main.js 用 store.loadProgress()/saveProgress() 读写 `tangyuan:progress`。
//
// 数据结构（state）：
//   { v: 1, skills: { [skillId]: rec } }
//   rec = {
//     n:           完成的题数（累计）
//     sigs:        最近 SIGS_MAX(24) 道题的签名 signature(p)，旧的在前；用于跨局去重
//     last6:       最近 MASTERY.window(6) 题是否第一次就答对（布尔数组，旧的在前）
//     recent:      最近 RECENT_MAX(30) 题 { day:'YYYY-MM-DD', ms, cells, misses, first }，旧的在前
//                  ms = 开放输入到最后一位答对的游戏时间（扣掉确认框暂停、升级遮罩和题间演出，
//                  按 ?speed 换算回真实时间，上限 MS_CAP）；cells = p.steps.length；first = 第一次就答对
//     days:        最近 DAYS_MAX(60) 个练习日的汇总 { day, n, first, ms, cells }，按日期升序
//                  （n 题数、first 第一次就答对的题数、ms 总用时、cells 总格数）
//     first3:      这个技能最早完成的 FIRST_MAX(3) 道题：
//                  { p: 完整题目对象（JSON 往返后的副本）, day, at, ms, misses, used: false }
//                  时间胶囊（阶段 5）用；used 由 markFirstUsed() 设置
//     mastered:    是否已掌握（一旦为 true 永不回退）
//     masteredAt:  掌握的时间戳（ms），未掌握为 null
//     lastFirstAt: 最近一次第一次就答对的时间戳（ms），没有为 null；生锈按它计算
//   }
//
// 规则：
//   掌握：最近 6 题（至少 6 题）中至少 5 题第一次就答对。已掌握的不因答错收回。
//   生锈：已掌握、且距 lastFirstAt（没有就用 masteredAt）≥ 21 天就是生锈（isRusty，没有个数上限）。
//         生锈技能第一次就答对一题就擦亮（lastFirstAt 更新为现在）。
//         "最多 3 个"只用于首页提示和出题候选：先按年级过滤（不高于本局年级），再取最旧的 3 个（rustyFor）。
import { makeProblem, signature } from './problems.js';
import { SKILL } from './skills.js';
import { usable } from './mistakes.js';
import { addDays } from './daily.js';

export const PROGRESS_VERSION = 1;
export const SIGS_MAX = 24;
export const RECENT_MAX = 30;
export const DAYS_MAX = 60;
export const FIRST_MAX = 3;
export const MASTERY = { window: 6, need: 5 };
export const RUST = { days: 21, max: 3 };
export const DAY_MS = 864e5;
export const MS_CAP = 10 * 60 * 1000; // 一题最多记 10 分钟（离开设备很久不会把平均用时拉歪）

export const emptyProgress = () => ({ v: PROGRESS_VERSION, skills: {} });
export const emptyRec = () => ({ n: 0, sigs: [], last6: [], recent: [], days: [], first3: [], mastered: false, masteredAt: null, lastFirstAt: null });

// ---------------------------------------------------------------- repair
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x, d = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const numOrNull = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const arr = (x) => (Array.isArray(x) ? x : []);
const tail = (a, n) => (a.length > n ? a.slice(a.length - n) : a);

function normalizeRec(r) {
  if (!isObj(r)) return emptyRec();
  const out = emptyRec();
  out.n = Math.max(0, Math.floor(num(r.n)));
  out.sigs = tail(arr(r.sigs).filter((s) => typeof s === 'string'), SIGS_MAX);
  out.last6 = tail(arr(r.last6).filter((b) => typeof b === 'boolean'), MASTERY.window);
  out.recent = tail(arr(r.recent).filter((e) => isObj(e) && isDay(e.day)).map((e) => ({
    day: e.day, ms: Math.max(0, num(e.ms)), cells: Math.max(1, num(e.cells, 1)), misses: Math.max(0, num(e.misses)), first: !!e.first,
  })), RECENT_MAX);
  out.days = tail(arr(r.days).filter((e) => isObj(e) && isDay(e.day)).map((e) => ({
    day: e.day, n: Math.max(0, num(e.n)), first: Math.max(0, num(e.first)), ms: Math.max(0, num(e.ms)), cells: Math.max(0, num(e.cells)),
  })).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)), DAYS_MAX);
  out.first3 = arr(r.first3).filter((e) => isObj(e) && usable(e.p) && isDay(e.day)).slice(0, FIRST_MAX).map((e) => ({
    p: e.p, day: e.day, at: num(e.at), ms: Math.max(0, num(e.ms)), misses: Math.max(0, num(e.misses)), used: !!e.used,
  }));
  out.mastered = r.mastered === true;
  out.masteredAt = out.mastered ? numOrNull(r.masteredAt) : null;
  out.lastFirstAt = numOrNull(r.lastFirstAt);
  return out;
}

// Anything read from storage goes through here: wrong types become empty values, unknown skills
// are dropped, and a broken record never stops the game.
export function normalizeProgress(raw) {
  const out = emptyProgress();
  if (!isObj(raw) || !isObj(raw.skills)) return out;
  for (const [id, r] of Object.entries(raw.skills)) if (SKILL[id]) out.skills[id] = normalizeRec(r);
  return out;
}

export const recOf = (state, id) => state.skills[id] || (state.skills[id] = emptyRec());

// ---------------------------------------------------------------- mastery and rust
export const isMastered = (state, id) => !!(state.skills[id] && state.skills[id].mastered);
export const masteredSkills = (state) => Object.keys(state.skills).filter((id) => isMastered(state, id));
const meetsMastery = (last6) => last6.length >= MASTERY.window && last6.filter(Boolean).length >= MASTERY.need;

// When the rust clock started: the last first-try answer, or the moment of mastery.
export const rustClock = (r) => (r ? r.lastFirstAt ?? r.masteredAt ?? null : null);

// Rusty: mastered and left alone for RUST.days or more. No cap: this decides 擦亮了 (recordSolve).
const rustyRec = (r, now) => !!r && r.mastered && rustClock(r) !== null && now - rustClock(r) >= RUST.days * DAY_MS;
export const isRusty = (state, id, now = Date.now()) => !!SKILL[id] && rustyRec(state.skills[id], now);
// Rusty skills of grade `maxGrade` and below, the one left alone longest first, at most RUST.max.
export function rustySkills(state, now = Date.now(), maxGrade = Infinity) {
  return Object.entries(state.skills)
    .filter(([id, r]) => SKILL[id] && SKILL[id].grade <= maxGrade && rustyRec(r, now))
    .sort((a, b) => rustClock(a[1]) - rustClock(b[1]) || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id)
    .slice(0, RUST.max);
}
// The candidates for a round of `grade` (擦亮旧技能 and the title hint): filtered by grade first,
// then the oldest 3, so older skills of a higher grade never crowd out this grade's.
export const rustyFor = (state, grade, now = Date.now()) => rustySkills(state, now, grade);

// ---------------------------------------------------------------- recording
// One finished problem (the last cell answered correctly). Mutates `state` and returns what
// changed: { newlyMastered, polished }. `first` = answered without any miss.
// opts: { ms, misses, first, day, at }  (day 'YYYY-MM-DD' local date, at = Date.now()).
export function recordSolve(state, skillId, problem, { ms = 0, misses = 0, first = false, day, at = Date.now() } = {}) {
  if (!SKILL[skillId]) return { newlyMastered: false, polished: false };
  const wasRusty = isRusty(state, skillId, at);
  const r = recOf(state, skillId);
  const t = Math.round(Math.min(MS_CAP, Math.max(0, Number(ms) || 0)));
  const cells = Math.max(1, problem && problem.steps ? problem.steps.length : 1);
  const miss = Math.max(0, Math.floor(Number(misses) || 0));
  first = !!first;
  r.n += 1;
  if (problem && problem.text !== undefined) {
    const sig = signature(problem);
    const i = r.sigs.indexOf(sig);
    if (i >= 0) r.sigs.splice(i, 1);
    r.sigs.push(sig);
    r.sigs = tail(r.sigs, SIGS_MAX);
  }
  r.last6.push(first); r.last6 = tail(r.last6, MASTERY.window);
  r.recent.push({ day, ms: t, cells, misses: miss, first }); r.recent = tail(r.recent, RECENT_MAX);
  let g = r.days[r.days.length - 1];
  if (!g || g.day !== day) { g = { day, n: 0, first: 0, ms: 0, cells: 0 }; r.days.push(g); }
  g.n += 1; g.first += first ? 1 : 0; g.ms += t; g.cells += cells;
  r.days = tail(r.days, DAYS_MAX);
  if (problem && r.first3.length < FIRST_MAX) r.first3.push({ p: JSON.parse(JSON.stringify(problem)), day, at, ms: t, misses: miss, used: false });
  if (first) r.lastFirstAt = at;
  let newlyMastered = false;
  if (!r.mastered && meetsMastery(r.last6)) { r.mastered = true; r.masteredAt = at; newlyMastered = true; }
  return { newlyMastered, polished: wasRusty && first };
}

// Time capsule (阶段 5): mark first3[index] of a skill as used.
export function markFirstUsed(state, skillId, index) {
  const e = state.skills[skillId] && state.skills[skillId].first3[index];
  if (e) e.used = true;
  return !!e;
}

// ---------------------------------------------------------------- cross-session dedupe
// Signatures of this skill's recent problems (earlier sessions included).
export const avoidSet = (state, skillId) => new Set(state.skills[skillId] ? state.skills[skillId].sigs : []);

// A new problem for skillId that avoids this session's problems and, when the skill has room, the
// skill's recent problems from earlier sessions. Two tiers: if avoiding both leaves only a problem
// already seen in this session (small skills such as 5的乘法口诀), try again avoiding this session
// alone, so a session never repeats more than it did before. makeProblem's retry limit keeps it
// finite. `past` is a Set (avoidSet) or null.
export function makeFresh(skillId, rng, session, past = null) {
  if (!past || !past.size) return makeProblem(skillId, rng, session);
  const both = { has: (s) => session.has(s) || past.has(s) };
  const p = makeProblem(skillId, rng, both);
  if (!session.has(signature(p))) return p;
  return makeProblem(skillId, rng, session);
}

// ---------------------------------------------------------------- 擦亮旧技能 (basic round)
// Replace problem index 1 of a basic plan with the oldest rusty skill (at most one per session,
// only when N >= 4). If that skill is already before index 1 (problem 1), nothing is replaced and
// the tag goes on that problem, so the round has it once and the tag is on the problem that
// polishes it. Returns a new plan; the input is not changed. rustIndex = -1 when there is none.
// `rusty` should already be limited to the round's grade and below (rustyFor).
export const RUST_INDEX = 1;
export function withRust(plan, rusty) {
  const out = plan.slice();
  if (out.length < 4 || !rusty || !rusty.length) return { plan: out, rustIndex: -1, rustSkill: null };
  const at = out.indexOf(rusty[0]);
  if (at >= 0 && at < RUST_INDEX) return { plan: out, rustIndex: at, rustSkill: rusty[0] };
  out[RUST_INDEX] = rusty[0];
  return { plan: out, rustIndex: RUST_INDEX, rustSkill: rusty[0] };
}

// ---------------------------------------------------------------- debug helpers (pure)
// Move every timestamp and day of these skills `days` back (mastery, last first-try, first3,
// recent, days). Used by window.__game.ageSkills / fakeRust.
export function ageSkills(state, ids, days) {
  const dt = days * DAY_MS;
  for (const id of ids) {
    const r = state.skills[id]; if (!r) continue;
    if (r.masteredAt !== null) r.masteredAt -= dt;
    if (r.lastFirstAt !== null) r.lastFirstAt -= dt;
    for (const e of r.first3) { e.at -= dt; e.day = addDays(e.day, -days); }
    for (const e of r.recent) e.day = addDays(e.day, -days);
    for (const e of r.days) e.day = addDays(e.day, -days);
  }
  return state;
}
// Mark skills as mastered (as if 6 first-try answers had been given at `at`).
export function forceMastered(state, ids, at = Date.now()) {
  for (const id of ids) {
    if (!SKILL[id]) continue;
    const r = recOf(state, id);
    r.last6 = Array(MASTERY.window).fill(true);
    if (!r.mastered) { r.mastered = true; r.masteredAt = at; }
    r.lastFirstAt = at;
  }
  return state;
}
