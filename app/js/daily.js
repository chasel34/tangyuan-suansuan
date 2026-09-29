// 今日小目标、连续练习天数、补签卡。纯逻辑：不碰 DOM、不读 localStorage，node 可以直接 import。
// store.js 的 loadDaily()/noteDaily() 等用它读写 `tangyuan:daily`。所有函数都把"今天"作为参数
// （'YYYY-MM-DD'，本地日期），测试可以固定日期。
//
// 数据结构（state）：
//   day, solved, bestCombo   今天的日期、今天答对的题数、今天的最高连击（换日时清零）
//   streak                   连续练习天数（只数练习过的日子，补签的日子不算）
//   lastDay                  最后一个练习日
//   cards                    持有的补签卡（初始 CARDS.first=1，最多 CARDS.max=3）
//   cardDay                  最近一次因为完成今日小目标而得卡（或卡已满只提示）的日期；每天最多一次
//   asked                    最近一次在首页弹出补签提示的日期；每天最多弹出一次（入口一直在）
//   patchedTo                补签补到的最后一天（没有为 ''）
//   held                     没回答补签提示就开始练习时，断掉的那段连续：{ day: 今天, run: 原来的天数,
//                            cover: 原来连续到的最后一天, last: 原来的最后练习日 }；只在当天有效，
//                            换日时丢掉。没有为 null
//   log                      补签记录 [{ day: 使用的日期, days: [补上的日期…] }]，最多 CARDS.log=50 条
//
// 连续是否还在：cover = max(lastDay, patchedTo)，cover 是今天或昨天时连续还在。
// 等待补签的一段连续（waiting）：今天的 held，或者（没有 held 时）断掉的当前连续。
// 补签提示：有等待补签的连续、它的最后练习日在最近 CARDS.reach=7 天内、它的 cover 到今天之间空出的
//   天数 ≥1 且 ≤ 持有张数、它的天数 ≥ CARDS.minRun=2。首页每天只弹出一次（asked），之后当天仍能从
//   今日小目标卡上的"补签"再打开。
// 清零时机：连续断了并且补不上（天数太多、张数不够、太久没练、连续不到 2 天），或者孩子点了"不用了"。
//   没回答就开始练习不算拒绝：今天从 1 开始数，原来的天数存进 held，当天接上时两段合起来。
export const DAILY_GOAL = 20;
export const CARDS = { first: 1, max: 3, reach: 7, minRun: 2, log: 50 };

const pad2 = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
// The local day of a timestamp (ms).
export const localDay = (t) => dayKey(new Date(t));
const isDay = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
// Day arithmetic on the key itself (progress.js and growth.js use these too) (UTC midnight), so a daylight-saving change never gives 6.96 days.
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const addDays = (key, n) => { const t = new Date(utc(key) + n * 864e5); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
export const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5); // b - a

export const emptyDaily = () => ({ day: '', solved: 0, bestCombo: 0, streak: 0, lastDay: '', cards: CARDS.first, cardDay: '', asked: '', patchedTo: '', held: null, log: [] });

const int = (x, lo, hi, d) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.floor(x))) : d);
export function normalizeDaily(raw) {
  const out = emptyDaily();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  out.day = isDay(raw.day) ? raw.day : '';
  out.solved = int(raw.solved, 0, 1e9, 0);
  out.bestCombo = int(raw.bestCombo, 0, 1e9, 0);
  out.streak = int(raw.streak, 0, 1e6, 0);
  out.lastDay = isDay(raw.lastDay) ? raw.lastDay : '';
  out.cards = int(raw.cards, 0, CARDS.max, CARDS.first);
  out.cardDay = isDay(raw.cardDay) ? raw.cardDay : '';
  out.asked = isDay(raw.asked) ? raw.asked : '';
  out.patchedTo = isDay(raw.patchedTo) ? raw.patchedTo : '';
  const h = raw.held;
  out.held = h && typeof h === 'object' && isDay(h.day) && isDay(h.cover) && isDay(h.last) && Number.isFinite(h.run) && h.run >= 0
    ? { day: h.day, run: Math.floor(h.run), cover: h.cover, last: h.last } : null;
  out.log = (Array.isArray(raw.log) ? raw.log : [])
    .filter((e) => e && isDay(e.day) && Array.isArray(e.days) && e.days.every(isDay))
    .map((e) => ({ day: e.day, days: e.days.slice() }))
    .slice(-CARDS.log);
  return out;
}

// The last day the streak reaches: the last practice day or the last day filled with a card.
export const coverDay = (d) => (d.patchedTo > d.lastDay ? d.patchedTo : d.lastDay);
// Still alive when it reaches yesterday (a clock set back also counts as alive).
export const streakAlive = (d, today) => !!d.lastDay && coverDay(d) >= addDays(today, -1);

// The days from the day after `cover` up to yesterday (oldest first).
function gapDays(cover, today) {
  const out = [];
  for (let k = addDays(cover, 1); k < today; k = addDays(k, 1)) { out.push(k); if (out.length > 400) break; }
  return out;
}
// The missed days of the streak waiting for a card (see waiting()).
export function missedDays(d, today) {
  const w = waiting(d, today);
  return w ? gapDays(w.cover, today) : [];
}
// The broken streak that a card could still save: today's held one (the child practised before
// answering), or the current streak when it is broken. { run, cover, last } or null.
export function waiting(d, today) {
  if (d.held && d.held.day === today) return { run: d.held.run, cover: d.held.cover, last: d.held.last };
  if (!d.lastDay || streakAlive(d, today)) return null;
  return { run: d.streak, cover: coverDay(d), last: d.lastDay };
}

// Offer: { days, run, cards } or null. Without ignoreAsked it is the pop-up on the title, at most once
// a day; with it, whether a card can be used at all (the 补签 entry on the 今日小目标 card).
export function patchOffer(d, today, { ignoreAsked = false } = {}) {
  const w = waiting(d, today);
  if (!w) return null;
  if (!ignoreAsked && d.asked === today) return null;
  if (w.run < CARDS.minRun) return null;
  if (daysBetween(w.last, today) > CARDS.reach) return null;
  const days = gapDays(w.cover, today);
  if (!days.length || days.length > d.cards) return null;
  return { days, run: w.run, cards: d.cards };
}

// What the title shows: { n, pending }. While a card can still save a broken streak, n is the old
// number and pending is true ("待补签"); otherwise the live streak, or 0 after a break.
export function streakView(d, today) {
  const o = patchOffer(d, today, { ignoreAsked: true });
  if (o) return { n: o.run, pending: true };
  return { n: streakAlive(d, today) ? d.streak : 0, pending: false };
}
export const shownStreak = (d, today) => streakView(d, today).n;

// Start of a day (every read goes through here): a new day clears today's counts; a streak that is
// broken and cannot be saved with cards becomes 0. Returns a new object.
export function rollDaily(src, today) {
  const d = { ...src, held: src.held || null, log: src.log.slice() };
  if (d.day !== today) { d.day = today; d.solved = 0; d.bestCombo = 0; }
  if (d.held && d.held.day !== today) d.held = null;
  if (d.lastDay && !streakAlive(d, today) && !patchOffer(d, today, { ignoreAsked: true })) d.streak = 0;
  return d;
}

// One solved problem (real play only). Returns { d, earned, full }: earned = a card was given for
// reaching DAILY_GOAL today; full = the goal was reached but 3 cards are already held.
export function noteSolve(src, today, combo = 0) {
  const d = rollDaily(src, today);
  if (d.lastDay !== today) {
    if (streakAlive(d, today)) d.streak += 1;
    else {
      // Practising before answering the offer is not a "no": keep the old run for today.
      if (patchOffer(d, today, { ignoreAsked: true })) d.held = { day: today, run: d.streak, cover: coverDay(d), last: d.lastDay };
      d.streak = 1;
    }
    d.lastDay = today;
  }
  d.solved += 1;
  d.bestCombo = Math.max(d.bestCombo, combo);
  let earned = false; let full = false;
  if (d.solved >= DAILY_GOAL && d.cardDay !== today) {
    d.cardDay = today;
    if (d.cards < CARDS.max) { d.cards += 1; earned = true; } else full = true;
  }
  return { d, earned, full };
}

// The offer popped up on the title today.
export const markAsked = (src, today) => ({ ...rollDaily(src, today), asked: today });
// "不用了": no more offers today and the old streak is gone. Practised today already: today's 1 stays.
export function declinePatch(src, today) {
  const d = rollDaily(src, today);
  d.asked = today;
  if (d.held) d.held = null; else if (!streakAlive(d, today)) d.streak = 0;
  return d;
}
// "接上": the missed days are filled with cards. The streak keeps its number (filled days are not
// practice days) and goes on when the child practises today; if the child already practised today
// (held), the two parts join: run + today's streak. Returns null when not possible.
export function usePatch(src, today) {
  const d = rollDaily(src, today);
  const offer = patchOffer(d, today, { ignoreAsked: true });
  if (!offer) return null;
  d.cards -= offer.days.length;
  d.patchedTo = addDays(today, -1);
  d.asked = today;
  if (d.held) { d.streak = d.held.run + d.streak; d.held = null; }
  d.log.push({ day: today, days: offer.days });
  if (d.log.length > CARDS.log) d.log.splice(0, d.log.length - CARDS.log);
  return d;
}
