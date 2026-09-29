// Adaptive quality. Tier 0 is full quality; each step down trims the most expensive work first:
//   1: backdrop at a lower resolution, fewer particles
//   2: backdrop at 30 fps, fewer particles again, the audience steam updated less often
//   3: backdrop at 15 fps, minimal particles, no card marquee, no fever lights, no parade
// The tier drops after ~1.5 s of slow frames (p95 above 20 ms) and climbs back one step after
// ~8 s of comfortable frames. ?quality=0..3 pins a tier (debug).
import { params, frameStats, resetFrameStats } from './core.js';

const PINNED = params.has('quality') ? Math.max(0, Math.min(3, Number(params.get('quality')) || 0)) : null;
const TIERS = [
  // bgScale: backdrop pixels per device pixel (the rays are soft, so half resolution looks the same).
  // partCap: the front particle layer (and the chest's own layer); backCap: the layer behind the card.
  // fever: the border lights and corner fountains of a long combo; parade: marchers after a problem.
  { bgScale: 0.5, bgEvery: 1, partCap: 360, backCap: 520, steamEvery: 1, marquee: true, fever: true, parade: true },
  { bgScale: 0.4, bgEvery: 1, partCap: 240, backCap: 340, steamEvery: 2, marquee: true, fever: true, parade: true },
  { bgScale: 0.33, bgEvery: 2, partCap: 150, backCap: 180, steamEvery: 3, marquee: true, fever: true, parade: false },
  { bgScale: 0.25, bgEvery: 4, partCap: 80, backCap: 70, steamEvery: 4, marquee: false, fever: false, parade: false },
];

export const Q = {
  tier: PINNED ?? 0,
  get p() { return TIERS[this.tier]; },
  slow: 0, fast: 0, listeners: new Set(),
};
window.__quality = Q.tier;

function set(t) {
  if (t === Q.tier) return;
  Q.tier = t; window.__quality = t;
  document.body.classList.toggle('q-low', t >= 3);
  for (const fn of Q.listeners) fn(t);
  resetFrameStats();
}
export const onQuality = (fn) => { Q.listeners.add(fn); return () => Q.listeners.delete(fn); };

// Called about every 0.5 s (real time) while the game is visible.
export function checkQuality() {
  if (PINNED !== null || document.hidden) return;
  const f = frameStats();
  if (f.n < 30) return;
  if (f.p95 > 20) { Q.slow += 1; Q.fast = 0; } else if (f.p95 < 17.5) { Q.fast += 1; Q.slow = 0; } else { Q.slow = 0; Q.fast = 0; }
  if (Q.slow >= 3 && Q.tier < TIERS.length - 1) { Q.slow = 0; set(Q.tier + 1); }
  if (Q.fast >= 16 && Q.tier > 0) { Q.fast = 0; set(Q.tier - 1); }
}
setInterval(checkQuality, 500);
