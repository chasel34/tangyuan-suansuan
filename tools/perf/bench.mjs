// Cold start, one ?demo game, frame stats per phase.
// node bench.mjs [desktop|mobile] [seconds] [extra query]
import { launch, RECORDER, pct, sleep } from './cdp.mjs';
import { writeFileSync } from 'node:fs';

const mode = process.argv[2] || 'desktop';
const secs = Number(process.argv[3] || 42);
const q = process.argv[4] || '';
const mob = mode === 'mobile';
const b = await launch(mob ? { w: 414, h: 860, dpr: 2, mobile: true, cpu: 4 } : { w: 1440, h: 900, dpr: 2 });
await b.s('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
await b.s('Page.navigate', { url: q.startsWith('?') ? `http://localhost:8731/${q}` : `http://localhost:8731/?demo&count=10&seed=7&grade=3${q}` });
await sleep(secs * 1000);
const P = await b.evaluate('JSON.stringify({ ...window.__perf, gl: (() => { const c = document.createElement("canvas").getContext("webgl"); const e = c && c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })(), st: window.__game.state })');
await b.close();
const d = JSON.parse(P);
const tag = `${mode}-${Date.now()}`;
writeFileSync(new URL(`./out/${tag}.json`, import.meta.url), P);
const phaseAt = (t) => { let p = 'boot'; for (const [pt, name] of d.ph) { if (pt <= t) p = name; else break; } return p; };
const by = {};
for (const [t, dt] of d.frames) { const p = phaseAt(t); (by[p] ||= []).push(dt); }
const all = d.frames.map((x) => x[1]);
const fmt = (a) => `n=${a.length} p50=${pct(a, 0.5).toFixed(1)} p95=${pct(a, 0.95).toFixed(1)} max=${Math.max(...a).toFixed(0)} >20=${a.filter((x) => x > 20).length} >50=${a.filter((x) => x > 50).length} >100=${a.filter((x) => x > 100).length}`;
console.log(`${tag} gl=${d.gl.slice(0, 50)} end=${d.st.screen}/${d.st.mode} demoDone=${d.st.demoDone} q=${d.st.quality}`);
console.log('ALL  ', fmt(all));
for (const [p, a] of Object.entries(by)) console.log(p.padEnd(18), fmt(a));
const big = d.frames.filter((x) => x[1] > 20).map(([t, dt]) => `${t}:${dt.toFixed(0)}@${phaseAt(t)}`);
console.log('slow frames:', big.join(' '));
console.log('longtasks:', d.lt.map(([t, du]) => `${t}:${du}@${phaseAt(t)}`).join(' '));
