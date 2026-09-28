// Trace a cold start. node perftrace.mjs <desktop|mobile> <seconds> <query> <out.json> [clickStartAtMs]
import { launch, RECORDER, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const [mode = 'desktop', secs = '6', q = '?demo&count=10&seed=7&grade=3', out = 'out/trace.json', clickAt] = process.argv.slice(2);
const mob = mode === 'mobile';
const b = await launch(mob ? { w: 414, h: 860, dpr: 2, mobile: true, cpu: 4 } : { w: 1440, h: 900, dpr: 2 });
await b.s('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
const events = [];
b.on('Tracing.dataCollected', (p) => events.push(...p.value));
let done; const fin = new Promise((r) => { done = r; });
b.on('Tracing.tracingComplete', () => done());
await b.send('Tracing.start', { traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.execute', 'blink', 'cc', 'gpu', 'viz', 'toplevel', 'disabled-by-default-v8.cpu_profiler', 'blink.user_timing', 'loading', 'latencyInfo'] }, transferMode: 'ReportEvents' });
await b.s('Page.navigate', { url: `http://localhost:8731/${q}` });
if (clickAt) {
  await sleep(Number(clickAt));
  const r = await b.evaluate('(() => { const r = document.querySelector("#start").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
  await b.evaluate('performance.mark("click")');
  for (const type of ['mousePressed', 'mouseReleased']) await b.s('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
  await sleep(Number(secs) * 1000 - Number(clickAt));
} else await sleep(Number(secs) * 1000);
const perf = await b.evaluate('JSON.stringify(window.__perf)');
await b.send('Tracing.end');
await fin;
await b.close();
writeFileSync(out, JSON.stringify({ traceEvents: events }));
const P = JSON.parse(perf);
console.log('slow frames', P.frames.filter((x) => x[1] > 20).map((x) => x.join(':')).join(' '), '| lt', P.lt.map((x) => x.join(':')).join(' '));
