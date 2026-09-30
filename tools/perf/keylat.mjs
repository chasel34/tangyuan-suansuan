// Key press -> next paint (Event Timing), real CDP key events, one basic round + part of the extra round.
// node keylat.mjs [desktop|mobile] [keys]
import { launch, RECORDER, pct, sleep, busyRuns } from './cdp.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'desktop';
const nKeys = Number(process.argv[3] || 80);
const mob = mode === 'mobile';
const b = await launch(mob ? { w: 414, h: 860, dpr: 2, mobile: true, cpu: 4 } : { w: 1440, h: 900, dpr: 2 });
const trace = []; let finishTrace;
const traceDone = new Promise(resolve => { finishTrace = resolve; });
if (process.env.TRACE) {
  b.on('Tracing.dataCollected', p => trace.push(...p.value));
  b.on('Tracing.tracingComplete', () => finishTrace());
  await b.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
}
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
await b.s('Page.addScriptToEvaluateOnNewDocument', { source: `
  let visualSeed = 12345;
  Math.random = () => { visualSeed = (Math.imul(visualSeed, 1664525) + 1013904223) >>> 0; return visualSeed / 4294967296; };
  ${RECORDER}
` });
await b.s('Page.navigate', { url: `${process.env.BASE_URL || 'http://localhost:8731'}/?count=10&seed=7&grade=3` });
await sleep(2500);
// Click 开始练习 (a real pointer event).
const r = await b.evaluate('(() => { const r = document.querySelector("#start").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()');
for (const type of ['mousePressed', 'mouseReleased']) await b.s('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
if (process.env.PROF) { await b.s('Profiler.enable'); await b.s('Profiler.setSamplingInterval', { interval: 250 }); await b.s('Profiler.start'); }
await sleep(1500);
const key = async (k) => {
  const code = `Digit${k}`; const kc = 48 + Number(k);
  await b.s('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
  await b.s('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc });
};
let sent = 0; let guard = 0;
while (sent < nKeys && guard++ < nKeys * 20) {
  const st = await b.evaluate('(() => { const s = __game.state; return { screen: s.screen, overlay: s.overlay, ready: s.ready, next: __game.problem && __game.problem.next, extraUnlocked: s.extraUnlocked }; })()');
  if (st.overlay === 'levelup') { await sleep(900); await b.evaluate('__game.pickPerk(0)'); await sleep(800); continue; }
  if (st.screen === 'result') { await sleep(4000); await b.evaluate('(() => { const c = document.querySelector("#ch-ok"); if (c) c.click(); })()'); await b.evaluate('__game.startExtra(true)'); await sleep(2000); continue; }
  if (st.screen !== 'play' || !st.ready || !st.next || !st.next.length) { await sleep(100); continue; }
  await key(st.next[0]); sent++;
  await sleep(400);
}
await sleep(500);
const P = JSON.parse(await b.evaluate('JSON.stringify(window.__perf)'));
P.run = { label: process.env.PERF_LABEL || 'keylat', mode, sent, requested: nKeys,
  url: process.env.BASE_URL || 'http://localhost:8731',
  browser: (await b.send('Browser.getVersion')).product, cpu: mob ? 4 : 1,
  viewport: mob ? [414, 860, 2] : [1440, 900, 2], trace: !!process.env.TRACE, profile: !!process.env.PROF };
if (process.env.PROF) { const { profile } = await b.s('Profiler.stop'); console.log(busyRuns(profile, Number(process.env.PROF))); }
if (process.env.TRACE) {
  await b.send('Tracing.end'); await traceDone;
  writeFileSync(new URL(`./out/keytrace-${mode}-${Date.now()}.json`, import.meta.url), JSON.stringify({ traceEvents: trace }));
  const keys = trace.filter(e => e.name === 'EventDispatch' && e.args?.data?.type === 'keydown' && e.dur);
  const layouts = trace.filter(e => e.name === 'Layout' && e.dur);
  const counts = keys.map(k => layouts.filter(e => e.pid === k.pid && e.tid === k.tid && e.ts >= k.ts && e.ts + e.dur <= k.ts + k.dur).length);
  console.log(`keydown forced layouts: total=${counts.reduce((a, b) => a + b, 0)} keys=${keys.length} p95=${pct(counts, .95)} max=${Math.max(0, ...counts)}`);
}
await b.close();
writeFileSync(new URL(`./out/${P.run.label}-${mode}-${Date.now()}.json`, import.meta.url), JSON.stringify(P));
const ev = P.ev.filter((e) => e.name === 'keydown');
// Keys under 16 ms are not reported by Event Timing: count them as 16 (upper bound).
const durs = ev.map((e) => e.dur).concat(Array(Math.max(0, sent - ev.length)).fill(16));
const procs = ev.map((e) => e.proc).concat(Array(Math.max(0, sent - ev.length)).fill(0));
console.log(`${mode} keys=${sent} reported=${ev.length} dur p50=${pct(durs, 0.5)} p95=${pct(durs, 0.95)} max=${Math.max(...durs)} | handler p50=${pct(procs, 0.5)} p95=${pct(procs, 0.95)} max=${Math.max(...procs)}`);
console.log('worst:', ev.sort((a, b) => b.dur - a.dur).slice(0, 8).map((e) => `${e.t}:${e.dur}(proc ${e.proc}, delay ${e.delay}, after ${e.after})`).join(' '));
const fr = P.frames.map((x) => x[1]);
console.log(`frames p95=${pct(fr, 0.95).toFixed(1)} max=${Math.max(...fr).toFixed(0)} >20=${fr.filter((x) => x > 20).length}; longtasks: ${P.lt.map(([t, d]) => `${t}:${d}`).join(' ')}`);
