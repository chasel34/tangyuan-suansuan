// Score, 甜度 (sweetness, a show-only number unrelated to the score), combo and show intensity.
// Pure: no DOM.

export const BASIC_SCORE = 100;
export const EXTRA_SECONDS = 90;
export const EXTRA_UNLOCK_RATE = 0.8;

// Extra round: the k-th (0-based) solved problem is worth 10 + 5k points.
export const extraPoints = (k) => 10 + 5 * k;
export const extraTotal = (n) => 10 * n + (5 * n * (n - 1)) / 2;

// Target time for the basic set (display only, never a penalty): 6 -> 1:50, 10 -> 3:00, 14 -> 4:20.
export const targetSeconds = (N) => Math.ceil((N * 18) / 10) * 10;

export const extraUnlocked = (firstTry, N) => N > 0 && firstTry / N >= EXTRA_UNLOCK_RATE;

// ---------------------------------------------------------------- 演出强度 E
// Basic set: grows with progress p in [0, 1] (completed problems + fraction of the current one).
// 0 = quiet first problem, 1 = the full-score finale. The extra round runs from 1.25 upward.
export function basicE(p) {
  const x = Math.min(1, Math.max(0, p));
  return 0.04 + 0.96 * x ** 1.2;
}
export const EXTRA_E0 = 1.25;
export function extraE(k) { return EXTRA_E0 + 0.25 * Math.min(1, k / 12); }

// ---------------------------------------------------------------- 甜度 (log10 inside)
// Without combo the basic set ends near 10^2.5 (about 300); a steady combo lands it between a few
// thousand and 10万 (see the 连击倍率 tiers below). The extra round adds up to 3 more decades.
export const SWEET_BASIC_L = 2.5;
export const sweetBasicL = (f) => SWEET_BASIC_L * Math.min(1, Math.max(0, f)) ** 1.15;
export const sweetExtraL = (n) => SWEET_BASIC_L + 3.0 * (1 - Math.exp(-n / 10));
export const SWEET_MAX_L = 9;

// ---------------------------------------------------------------- 连击倍率 (a small slot reel)
// Discrete tiers so the reel has something to roll to: ×1 → ×1.5 (5) → ×2 (10) → ×3 (20) → ×4 (35) → ×5 (50).
// The 倍率提前 perk moves the first step to combo 3. Only 甜度 uses it: never the score.
export const COMBO_MULTS = [1, 1.5, 2, 3, 4, 5];
export const COMBO_STEPS = [0, 5, 10, 20, 35, 50];
export function comboTier(combo, early = false) {
  const c = Math.max(0, combo);
  let t = 0;
  for (let i = 1; i < COMBO_STEPS.length; i++) if (c >= (i === 1 && early ? 3 : COMBO_STEPS[i])) t = i;
  return t;
}
export const fmtMult = (m) => `×${m}`;
// 甜度 lives in log10 space, so the multiplier is damped there: ×2 adds 50% more decades, ×5 triples them.
export const comboMult = (combo, early = false) => 1 + (COMBO_MULTS[comboTier(combo, early)] - 1) * 0.5;
// boost: session perks (甜度 +20% → 1.2).
export function addSweet(L, base, combo, { early = false, boost = 1 } = {}) {
  return Math.min(SWEET_MAX_L, L + Math.max(0.004, base) * comboMult(combo, early) * boost);
}
export const sweetValue = (L) => Math.round(10 ** L) - 1;

// 1,804 / 3.2万 / 160万 / 1.2亿
export function fmtSweet(L) { return fmtSweetValue(sweetValue(L)); }
export function fmtSweetValue(value) {
  const v = Math.max(0, Math.round(value));
  if (v < 10000) return v.toLocaleString('en-US');
  const [div, unit] = v >= 1e8 ? [1e8, '亿'] : [1e4, '万'];
  const m = v / div;
  return (m < 10 ? (Math.floor(m * 10) / 10).toFixed(1).replace(/\.0$/, '') : String(Math.floor(m))) + unit;
}

// Milestones (100, 1000, 1万 ... 1亿) crossed between two display values.
export function sweetMilestones(prev, next) {
  const out = [];
  for (let e = 2; e <= 8; e++) if (prev < 10 ** e && next >= 10 ** e) out.push(e);
  return out;
}
export const milestoneLabel = (e) => ['1', '10', '100', '1000', '1万', '10万', '100万', '1000万', '1亿'][e];

// Combo milestones worth a bigger show.
export const comboMilestone = (c) => [5, 10, 20, 30, 50].includes(c) || (c > 50 && c % 25 === 0);

export const fmtTime = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
