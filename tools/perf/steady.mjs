// Repeatable steady-state renderer benchmark; run serially, without other Chrome benchmarks.
// node tools/perf/steady.mjs desktop|mobile label [seconds=12] [query=?jump=extra&seed=7&quality=0]
import { launch, RECORDER, pct, sleep } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const [mode = 'desktop', label = 'sample', seconds = '12', query = '?jump=extra&seed=7&quality=0'] = process.argv.slice(2);
const mobile = mode === 'mobile';
const b = await launch(mobile ? { w: 414, h: 860, dpr: 2, mobile, cpu: 4 } : { w: 1440, h: 900, dpr: 2 });
try {
  const version = await b.send('Browser.getVersion');
  await b.s('Page.addScriptToEvaluateOnNewDocument', { source: `
    let seed = 12345;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    ${RECORDER}
  ` });
  await b.s('Performance.enable');
  await b.s('Page.navigate', { url: `${process.env.BASE_URL || 'http://localhost:8731'}/${query}` });
  await sleep(3500);
  const metrics = async () => Object.fromEntries((await b.s('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const before = await metrics();
  const start = await b.evaluate('performance.now()');
  await sleep(Number(seconds) * 1000);
  const after = await metrics();
  const perf = await b.evaluate('({ ...__perf, state: __game.state })');
  const frames = perf.frames.filter(([t]) => t >= start).map(([, dt]) => dt);
  const elapsed = after.Timestamp - before.Timestamp;
  const perSecond = {};
  for (const key of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']) perSecond[key + 'Ms'] = +(1000 * (after[key] - before[key]) / elapsed).toFixed(2);
  const result = { label, mode, query, version: version.product, elapsed, perSecond,
    frames: { n: frames.length, p95: pct(frames, .95), max: Math.max(...frames), over20: frames.filter(x => x > 20).length, over50: frames.filter(x => x > 50).length },
    longtasks: perf.lt.filter(([t]) => t >= start), perf };
  const out = new URL('./out/', import.meta.url); mkdirSync(out, { recursive: true });
  writeFileSync(new URL(`${label}-${mode}-${Date.now()}.json`, out), JSON.stringify(result));
  console.log(JSON.stringify({ ...result, perf: undefined }, null, 2));
} finally { await b.close(); }
