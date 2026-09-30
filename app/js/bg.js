// Full-screen backdrop. The colours follow four key points by show intensity E
// (cream -> peach + orange/purple rays -> lemon + violet/yellow -> indigo + cyan), interpolated
// continuously. WebGL draws the rays; without WebGL a CSS conic gradient does the same job.
import { hex, mixRgb, rgbStr, clamp, smooth, VP } from './core.js';
import { Q } from './quality.js';

// a = the softer stripe, b = the strong stripe. Each stays within one hue family between key points
// (orange -> yellow, purple -> bright violet) so the mix never passes through grey.
export const KEYS = [
  { E: 0, base: '#FFF5DA', a: '#FFF1CF', b: '#FFE7BF', ray: 0.0, grid: 1, blob: 1 },
  { E: 0.5, base: '#FFE9DC', a: '#FF782D', b: '#7B4DFF', ray: 0.36, grid: 0.25, blob: 0.55 },
  { E: 1.0, base: '#FFF7C2', a: '#F5FF3B', b: '#8B3DFF', ray: 0.55, grid: 0, blob: 0.15 },
  { E: 1.25, base: '#1A1F5C', a: '#262D7E', b: '#2EF2FF', ray: 0.42, grid: 0, blob: 0 },
];

// Palette at intensity E (piecewise, eased between key points). keys: a theme's key points.
export function paletteAt(E, keys = KEYS) {
  const e = clamp(E, 0, keys[keys.length - 1].E);
  let i = 0;
  while (i < keys.length - 2 && e > keys[i + 1].E) i += 1;
  const A = keys[i]; const B = keys[i + 1];
  const k = smooth(A.E, B.E, e);
  return {
    base: mixRgb(hex(A.base), hex(B.base), k), a: mixRgb(hex(A.a), hex(B.a), k), b: mixRgb(hex(A.b), hex(B.b), k),
    ray: A.ray + (B.ray - A.ray) * k, grid: A.grid + (B.grid - A.grid) * k, blob: A.blob + (B.blob - A.blob) * k, dark: smooth(1.05, 1.22, e),
  };
}

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }';
const FRAG = `precision mediump float;
uniform vec2 uRes; uniform vec2 uCenter; uniform float uTime, uE, uRay, uGrid, uDark, uKick, uDpr, uBlob;
uniform vec3 uBase, uA, uB;
float hash(vec2 c){ return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 p = (fc - uCenter) / uRes.y;
  float r = length(p); float a = atan(p.y, p.x);
  vec3 col = uBase;
  // (The graph-paper grid is a static CSS layer above this canvas: sharp at any backdrop resolution.)
  // Two big soft colour spots on the paper (quiet screens).
  vec2 uv = fc / uRes.y;
  float b1 = 1. - smoothstep(.29, .34, length(uv - vec2(.06, .80)));
  float b2 = 1. - smoothstep(.33, .38, length(uv - vec2(uRes.x / uRes.y - .02, .12)));
  col = mix(col, vec3(1., .87, .82), b1 * uBlob * .55);
  col = mix(col, vec3(.89, .88, 1.), b2 * uBlob * .6);
  // Sunburst rays from the mascot, count and spin grow with E.
  float n = floor(mix(10., 18., clamp(uE, 0., 1.)));
  float spin = uTime * (.06 + .35 * clamp(uE, 0., 1.4));
  float wob = sin(r * 5. - uTime * 1.2) * .18 * smoothstep(.6, 1.2, uE);
  float s = sin(a * n + spin + wob);
  float ray = smoothstep(-.08, .08, s);
  vec3 rc = mix(uA, uB, ray);
  float m = uRay * (.55 + .45 * (1. - smoothstep(.1, 1.4, r))) * (1. + .25 * uKick);
  col = mix(col, rc, clamp(m, 0., 1.) * (ray * .45 + .55));
  // Soft glow behind the mascot.
  col = mix(col, mix(vec3(1., .98, .9), vec3(.35, .8, 1.), uDark), (1. - smoothstep(0., .42, r)) * uRay * mix(.9, .7, uDark));
  // Extra round: beat rings and twinkles.
  float ring = smoothstep(0., .03, abs(fract(r * 2.2 - uTime * .7) - .5) - .44) * uDark;
  col = mix(col, vec3(.18, .95, 1.), ring * .35 * (1. + uKick));
  vec2 q = fc / (38. * uDpr); vec2 c = floor(q); float h = hash(c);
  float tw = step(.86, h) * (1. - smoothstep(0., .16, length(fract(q) - .5))) * (.5 + .5 * sin(uTime * 3. + h * 40.));
  col += vec3(.8, 1., 1.) * tw * uDark * .8;
  // Gentle vignette.
  // Vignette only on the dark (extra round) palette; on light bases it would turn lemon into mud.
  col *= 1. - (.04 + .16 * uDark) * smoothstep(.5, 1.3, length((fc / uRes - .5) * vec2(uRes.x / uRes.y, 1.)));
  gl_FragColor = vec4(col, 1.);
}`;

export class Backdrop {
  constructor(canvas, fallback, grid = null) {
    this.canvas = canvas; this.fallback = fallback; this.grid = grid;
    this.frame = 0; this.last = ''; this.cssAt = -1e9; this.keys = KEYS;
    this.E = 0; this.center = { x: innerWidth / 2, y: innerHeight * 0.3 }; this.kick = 0; this.time = 0; this.motion = 1;
    this.gl = null;
    // Size the canvas before the context exists: the drawing buffer is then allocated once, while
    // the modules load, instead of being reallocated on the first animation frame (~35 ms).
    // Keep the backing size stable across adaptive tier changes. Reallocating a live
    // WebGL buffer can synchronously wait for the GPU (200 ms in native Chrome).
    // A pinned low tier still starts with its smaller buffer; viewport resize remains supported.
    this.bufferScale = Q.p.bgScale;
    this.resize();
    try { this.init(); } catch (e) { this.gl = null; }
    // The CSS fallback has a rotating 260vmax gradient. Do not animate/rasterize it
    // underneath an opaque WebGL canvas; retain it for unavailable/lost contexts.
    fallback.hidden = !!this.gl;
    if (!this.gl) { canvas.style.display = 'none'; document.body.classList.add('no-webgl'); }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault(); this.gl = null; fallback.hidden = false;
      this.cssKey = ''; this.updateCss(paletteAt(this.E, this.keys), true);
      canvas.style.display = 'none'; document.body.classList.add('no-webgl');
    });
  }
  init() {
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power', depth: false, stencil: false });
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['uRes', 'uCenter', 'uTime', 'uE', 'uRay', 'uGrid', 'uDark', 'uKick', 'uDpr', 'uBlob', 'uBase', 'uA', 'uB']) this.u[n] = gl.getUniformLocation(prog, n);
    this.gl = gl;
  }
  // Soft gradients render below CSS resolution; cap pixels for large desktop windows.
  // Adaptive tiers reduce draw frequency without reallocating the drawing buffer.
  resize() {
    let k = this.bufferScale * Math.min(2, VP.dpr);
    const px = VP.w * VP.h * k * k;
    if (px > 900000) k *= Math.sqrt(900000 / px);
    const w = Math.max(64, Math.round(VP.w * k)); const h = Math.max(64, Math.round(VP.h * k));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; this.last = ''; }
    this.dpr = k;
  }
  // 背景主题 (collection): another set of key points; null = the default.
  setTheme(keys) { this.keys = keys || KEYS; this.last = ''; this.cssKey = ''; }
  // Page-level colours: at most ~7 times a second and only on the elements that use them
  // (never on :root, which would restyle the whole document).
  updateCss(pal, force = false) {
    const t = performance.now();
    if (!force && t - this.cssAt < 140) return;
    const key = `${pal.base.map(Math.round)}|${pal.ray.toFixed(2)}|${pal.grid.toFixed(2)}|${pal.blob.toFixed(2)}|${this.motion}`;
    if (key === this.cssKey) return;
    this.cssKey = key; this.cssAt = t;
    if (!this.gl) {
      const fb = this.fallback.style;
      fb.setProperty('--bg-base', rgbStr(pal.base));
      fb.setProperty('--ray-a', rgbStr(pal.a));
      fb.setProperty('--ray-b', rgbStr(pal.b));
      fb.setProperty('--ray', (pal.ray * (0.35 + 0.65 * this.motion)).toFixed(3));
      fb.setProperty('--blob', pal.blob.toFixed(3));
    }
    document.body.style.backgroundColor = rgbStr(pal.base);
    // A layer at opacity 0 is still composited: hide it outright once the grid has faded out.
    if (this.grid) { const o = pal.grid * 0.35; this.grid.style.opacity = o.toFixed(3); this.grid.style.visibility = o < 0.005 ? 'hidden' : ''; }
    document.body.classList.toggle('dark-bg', pal.dark > 0.5);
  }
  draw(dt) {
    this.time += dt * (0.3 + 0.7 * this.motion);
    const pal = paletteAt(this.E, this.keys);
    this.updateCss(pal);
    const gl = this.gl;
    if (!gl || document.hidden) return;
    // Lower tiers skip frames; a backdrop with no moving parts (quiet start, title) is only redrawn
    // when something that affects it changes.
    this.frame += 1;
    if (this.frame % Q.p.bgEvery) return;
    const moving = pal.ray * this.motion > 0.004 || pal.dark > 0.004;
    this.resize();
    const key = `${this.E.toFixed(3)}|${Math.round(this.center.x)}|${Math.round(this.center.y)}|${this.canvas.width}|${this.motion}`;
    if (!moving && key === this.last) return;
    this.last = key;
    const d = this.dpr;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uCenter, this.center.x * d, (VP.h - this.center.y) * d);
    gl.uniform1f(this.u.uTime, this.time);
    gl.uniform1f(this.u.uE, this.E);
    gl.uniform1f(this.u.uRay, pal.ray * (0.35 + 0.65 * this.motion));
    gl.uniform1f(this.u.uGrid, pal.grid);
    gl.uniform1f(this.u.uBlob, pal.blob);
    gl.uniform1f(this.u.uDark, pal.dark);
    gl.uniform1f(this.u.uKick, this.kick * this.motion);
    gl.uniform1f(this.u.uDpr, d);
    gl.uniform3f(this.u.uBase, ...pal.base.map((v) => v / 255));
    gl.uniform3f(this.u.uA, ...pal.a.map((v) => v / 255));
    gl.uniform3f(this.u.uB, ...pal.b.map((v) => v / 255));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
