// CPU profile of a window. node prof.mjs <desktop|mobile> <query> <startMs> <durMs> [click]
// Prints self time and inclusive time per function for the window.
import { launch, RECORDER, sleep } from './cdp.mjs';
const [mode = 'desktop', q = '?count=10&seed=7&grade=3', startMs = '2500', durMs = '600', click = ''] = process.argv.slice(2);
const mob = mode === 'mobile';
const b = await launch(mob ? { w: 414, h: 860, dpr: 2, mobile: true, cpu: 4 } : { w: 1440, h: 900, dpr: 2 });
await b.s('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
await b.s('Profiler.enable');
await b.s('Profiler.setSamplingInterval', { interval: 200 });
if (Number(startMs) === 0) await b.s('Profiler.start');
await b.s('Page.navigate', { url: `http://localhost:8731/${q}` });
await sleep(Number(startMs));
if (Number(startMs) > 0) await b.s('Profiler.start');
if (click) {
  const r = await b.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(click)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await b.s('Input.dispatchMouseEvent', { type, x: r[0], y: r[1], button: 'left', clickCount: 1 });
}
await sleep(Number(durMs));
const { profile } = await b.s('Profiler.stop');
const perf = JSON.parse(await b.evaluate('JSON.stringify(window.__perf)'));
await b.close();
console.log('slow frames', perf.frames.filter((x) => x[1] > 20).map((x) => x.join(':')).join(' '), '| lt', perf.lt.map((x) => x.join(':')).join(' '));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const self = new Map(); const incl = new Map();
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
const dts = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = (dts[i + 1] ?? 0) / 1000;
  let n = byId.get(profile.samples[i]);
  self.set(key(n), (self.get(key(n)) || 0) + dt);
  const seen = new Set();
  while (n) { const k = key(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } n = byId.get(parent.get(n.id)); }
}
const top = (m, k) => [...m.entries()].filter(([n]) => !/^\((root|program|idle)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k);
console.log('--- self'); for (const [n, v] of top(self, 25)) console.log(v.toFixed(1).padStart(7), n);
console.log('--- inclusive'); for (const [n, v] of top(incl, 40)) console.log(v.toFixed(1).padStart(7), n);
// Busy runs (consecutive non-idle samples) longer than 40 ms, with their top inclusive functions.
{
  let t = 0; let run = null; const runs = [];
  const isIdle = (n) => n.callFrame.functionName === '(idle)';
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i] / 1000;
    const n = byId.get(profile.samples[i]);
    if (isIdle(n)) { if (run) { run.end = t; runs.push(run); run = null; } continue; }
    if (!run) run = { start: t, ids: [] };
    run.ids.push([profile.samples[i], (profile.timeDeltas[i + 1] ?? 0) / 1000]);
  }
  for (const r of runs.filter((r) => r.end - r.start > Number(process.env.RUNMS || 40))) {
    const inc = new Map();
    for (const [id, dt] of r.ids) { let n = byId.get(id); const seen = new Set(); while (n) { const k = key(n); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) || 0) + dt); } n = byId.get(parent.get(n.id)); } }
    console.log(`\n### run @${r.start.toFixed(0)}ms ${(r.end - r.start).toFixed(0)}ms:`, top(inc, 18).map(([n, v]) => `${n} ${v.toFixed(0)}`).join(' | '));
  }
}
