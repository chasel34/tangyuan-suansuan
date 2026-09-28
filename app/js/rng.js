// Seeded random numbers (mulberry32). Pure: safe to import from node tests.

export function makeRng(seed) {
  let s = (Number(seed) >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [a, b] (inclusive).
export const int = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
export const pickOne = (rng, list) => list[Math.floor(rng() * list.length)];
export const chance = (rng, p) => rng() < p;
