import { readFileSync } from 'node:fs';
import { pct } from './cdp.mjs';
for (const f of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(f, 'utf8'));
  const phaseAt = (t) => { let p = 'boot'; for (const [pt, name] of d.ph) { if (pt <= t) p = name; else break; } return p; };
  const a = d.frames.map((x) => x[1]);
  console.log(f.split('/').pop(), `n=${a.length} p95=${pct(a, 0.95).toFixed(1)} max=${Math.max(...a).toFixed(0)} >20=${a.filter((x) => x > 20).length} >50=${a.filter((x) => x > 50).length} >100=${a.filter((x) => x > 100).length}`,
    '| slow:', d.frames.filter((x) => x[1] > 20).map(([t, dt]) => `${t}:${dt.toFixed(0)}@${phaseAt(t)}`).join(' '), '| lt:', d.lt.map(([t, du]) => `${t}:${du}@${phaseAt(t)}`).join(' '));
}
