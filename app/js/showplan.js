// What the show draws, as pure functions of the show intensity E, the combo and the chest tier:
// particle kinds, fever level, how long and how dense the chest gush is. No DOM, no randomness.

// Particle kinds for a burst at intensity E (fx.js knows how to draw each one). Later kinds join
// the earlier ones, so a higher E never loses a kind.
export function burstKinds(E) {
  const k = ['confetti'];
  if (E > 0.2) k.push('star');
  if (E > 0.35) k.push('heart');
  if (E > 0.45) k.push('spark', 'spark', 'twinkle');
  if (E > 0.65) k.push('coin');
  if (E > 0.8) k.push('mini', 'glow');
  if (E > 1.05) k.push('jewel', 'coin');
  return k;
}

// 连击热度 (fever): the border lights and the coin fountains beside the stage follow it.
//   0 below 5 · 1 from 5 · 2 from 10 · 3 from 20 · 4 from 35
export const FEVER_STEPS = [0, 5, 10, 20, 35];
export function feverLevel(combo) {
  const c = Math.max(0, Number(combo) || 0);
  let lv = 0;
  for (let i = 1; i < FEVER_STEPS.length; i++) if (c >= FEVER_STEPS[i]) lv = i;
  return lv;
}

// Coins that spout from the two bottom corners of the stage on a correct digit, by fever level.
export const feverCoins = (lv) => [0, 0, 2, 4, 6][Math.max(0, Math.min(4, lv))];

// The last digit of a multi-digit answer gets the 听牌 show once the show is warm enough.
export const REACH_E = 0.45;
export const reachOn = (E, step, steps) => steps > 1 && step === steps - 1 && E >= REACH_E;

// The small stamp that lands above each correct digit: a smile, a flower from E 0.45, a rainbow
// outline from E 0.85.
export const stampLook = (E) => (E > 0.85 ? 'rainbow' : E >= 0.45 ? 'flower' : 'smile');

// Idle hops of the hero between key presses: none below E 0.3, then every 4.2 s down to 2.2 s.
export const IDLE_E = 0.3;
export function idleGap(E) {
  if (E <= IDLE_E) return Infinity;
  const k = Math.min(1, (E - IDLE_E) / 0.7);
  return 4.2 - 2 * k;
}

// 行进: small 汤圆 marching across the stage after a problem (E above 0.74). n grows with E; the
// stage never holds more than `cap` actors (hero + audience + marchers).
export const PARADE_E = 0.74;
export function paradeCount(E, actors, cap = 10) {
  if (E <= PARADE_E) return 0;
  const want = 3 + Math.round(6 * Math.min(1, (E - PARADE_E) / 0.5));
  return Math.max(0, Math.min(want, cap - actors));
}

// 蒸笼 burst and gush by tier (0 白 … 4 彩虹): the higher tier is always at least as big.
// ms: how long the gush spouts; rate: items per second; kinds: what comes out.
export function gushPlan(tier) {
  const t = Math.max(0, Math.min(4, Number(tier) || 0));
  const kinds = ['coin', 'coin', 'star'];
  if (t >= 1) kinds.push('jewel');
  if (t >= 2) kinds.push('mini', 'heart');
  if (t >= 3) kinds.push('coin', 'jewel', 'glow');
  if (t >= 4) kinds.push('mini', 'twinkle', 'confetti');
  return { ms: 1000 + 220 * t, rate: 60 + 25 * t, kinds, shocks: 2 + (t >= 2 ? 1 : 0), streaks: 10 + 6 * t, confetti: t >= 4 };
}
