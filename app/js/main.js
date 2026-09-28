// 汤圆算算 — game flow, input, and the "director" that turns each event into visuals and sound.
import { params, SPEED, setPaused, isPaused, now, onFrame, wait, later, tween, clamp, lerp, smooth, rand, pick, chance, centerOf, easeOutBack, easeOutCubic, easeInCubic, frameStats, VP, gameNow, holdClock, hitStop } from './core.js';
import { makeRng, makeProblem, signature, generate, summarize } from './problems.js';
import { judge, nextTokens } from './engine.js';
import { planBasic, planExtra } from './session.js';
import { SKILL, SKILLS, INPUT } from './skills.js';
import * as sc from './scoring.js';
import { Audio } from './audio.js';
import { Backdrop } from './bg.js';
import { FX } from './fx.js';
import { Tangyuan, FILLINGS, GOLD } from './tangyuan.js';
import * as store from './store.js';
import * as pk from './perks.js';
import { chestTier, chestGoals } from './chest.js';
import * as col from './collection.js';
import { addMember, buildCrowd, fillingIndex, MAX_LEVEL } from './merge.js';
import { Reel, MultReel } from './reels.js';
import { THEMES } from './art.js';
import { showLevelUp, PERK_LOOK } from './levelup.js';
import { playChest, warmChest } from './chestshow.js';
import { renderCollection } from './collectionui.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const body = document.body;
const root = document.documentElement;

// ---------------------------------------------------------------- setup
const settings = store.loadSettings();
const P = {
  count: [6, 10, 14].includes(Number(params.get('count'))) ? Number(params.get('count')) : null,
  grade: [1, 2, 3].includes(Number(params.get('grade'))) ? Number(params.get('grade')) : null,
  skill: params.get('skill'),
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : null,
  jump: params.get('jump'),
  demo: params.has('demo'),
  tier: params.has('tier') ? Math.max(0, Math.min(4, Number(params.get('tier')) || 0)) : null,
};
if (P.skill && !SKILL[P.skill]) { console.warn(`unknown skill ${P.skill}`); P.skill = null; }

const audio = new Audio();
const bg = new Backdrop($('#bg'), $('#bg-fallback'), $('#bg-grid'));
const fx = new FX($('#fx'));
const hero = new Tangyuan($('#hero-layer'), { scale: 0.8, armLayer: $('#arm-layer') });
const crowdLayer = $('#crowd-layer');
const crowd = [];
// Four friends in different fillings keep the hero company on the title screen (rocking gently).
const friends = FILLINGS.slice(0, 4).map((f) => { const m = new Tangyuan(crowdLayer, { scale: 0.4, filling: f }); m.bob = 0.4; m.sway = 4; return m; });
const extras = [];
const stage = $('#stage'); const card = $('#card'); const sheet = $('#sheet'); const pad = $('#pad');

const S = {
  screen: 'title', mode: 'basic', grade: settings.grade, N: settings.count, seed: 0, rng: null, onlySkill: null,
  plan: [], problems: [], sigs: new Set(), qi: 0, problem: null, typed: [], ready: false, run: 0,
  E: 0.04, visualE: 0.04, combo: 0, maxCombo: 0, solved: 0, firstTry: 0, misses: 0, wrongInQ: false,
  cellMisses: 0, hintLevel: 0, shownWrong: null, sweetL: 0, sweet: 0, sweetAtStart: 0, startT: 0, endT: 0,
  extra: { solved: 0, misses: 0, score: 0, endAt: 0, over: false }, cells: {}, lines: {},
  demo: P.demo, demoDone: false, shake: 0, flash: 0, busyUntil: 0, confirmOpen: false, settingsOpen: false,
  lastTick: -1, fwT: 2,
  // M2: experience, level-ups and perks (this session), the audience merge model, the last chest.
  xp: 0, xpShown: 0, xpBase: 0, level: 1, levelUps: 0, perks: [], members: [], nextId: 1, memberCount: 0, fillStart: 0,
  chestTier: null, lastChest: null, gemRun: 0, gemAt: 0,
};
// 收藏 (permanent): what the player owns and has put on.
let COL = store.loadCollection();
const debugRun = () => S.demo || !!P.jump || !!S.onlySkill;
const motion = () => settings.motion;
const still = () => settings.motion <= 0.001;

// ---------------------------------------------------------------- screens and layout
// The old screen slides away while the new one drops in, under a quick puff of steam.
function showScreen(name) {
  const prev = S.screen;
  S.screen = name;
  const next = $(`#screen-${name}`);
  const old = prev !== name ? $(`#screen-${prev}`) : null;
  $$('.screen').forEach((s) => { s.classList.toggle('is-active', s === next); if (s !== old) s.classList.remove('leaving'); });
  if (old && !still()) {
    old.classList.add('leaving');
    later(240, () => old.classList.remove('leaving'));
    next.classList.remove('entering'); void next.offsetWidth; next.classList.add('entering');
    later(330, () => { next.classList.remove('entering'); layoutActors(); });
    const w = $('#wipe'); w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
    later(620, () => w.classList.remove('go'));
    audio.whoosh();
  }
  requestAnimationFrame(layoutActors);
}

function layoutActors() {
  let r;
  friends.forEach((m) => { m.visible = S.screen === 'title'; });
  hero.maxLift = Infinity;
  if (S.screen === 'title') {
    r = $('#title-stage').getBoundingClientRect();
    hero.S = clamp(r.height / 150, 0.55, 1.45);
    const gx = r.left + r.width / 2; const gy = r.bottom - 12;
    hero.place(gx, gy);
    const heroHalf = 64 * hero.S; const avail = Math.min(r.width / 2, 230) - heroHalf;
    const fs = clamp(Math.min(hero.S * 0.42, (avail - 8) / 212), 0.15, 0.7);
    friends.forEach((m, i) => { const side = i % 2 ? 1 : -1; const k = i < 2 ? 0 : 1; m.S = fs; m.place(gx + side * (heroHalf + fs * (54 + 104 * k)), gy - 2); });
  } else if (S.screen === 'play') {
    r = stage.getBoundingClientRect();
    // Tall layouts (three-round division at 375 wide) leave a very short stage. The hero keeps a
    // minimum size (about 60px tall) so its face and carrying arms stay readable, and the
    // audience steps aside until there is room again.
    hero.S = clamp((r.height - 18) / 150, 0.5, 1.3);
    hero.place(r.left + r.width / 2, r.bottom - 8);
    body.classList.toggle('short-stage', r.height < 125);
    S.tinyStage = r.height < 100;
    S.stageRect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    // Jumps stay within the stage (plus a little): the hero is about 105 * S tall with its steam.
    hero.maxLift = Math.max(12, r.height - 105 * hero.S - 16);
    const xr = $('#xp-fill').parentElement.getBoundingClientRect();
    S.xpRect = { left: xr.left, top: xr.top, width: xr.width, height: xr.height };
  } else if (S.screen === 'collection') {
    r = $('#col-stage').getBoundingClientRect();
    hero.S = clamp((r.height - 20) / 140, 0.6, 1.15);
    hero.place(r.left + r.width / 2, r.bottom - 12);
  } else {
    // Results: the hero and a two/three-row audience stand on the card and fill the space
    // between the banner and the card.
    r = $(`#screen-${S.screen} .result-card`).getBoundingClientRect();
    S.resultCardTop = r.top;
    S.resultCardRect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    const top = $(`#screen-${S.screen} .result-banner`).getBoundingClientRect().bottom;
    hero.S = clamp((r.top - top - 10) / 170, 0.4, 1.35);
    hero.place(r.left + r.width / 2, r.top + 4);
  }
  bg.center = hero.center;
  placeCrowd();
  updateMarquee();
}

// Card border bulbs (跑马灯): an SVG rounded rect drawn on the card's border line.
function updateMarquee() {
  const svg = $('#marquee'); if (!svg || S.screen !== 'play') return;
  const w = card.offsetWidth; const h = card.offsetHeight;
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  for (const rect of svg.querySelectorAll('rect')) {
    rect.setAttribute('x', 1.5); rect.setAttribute('y', 1.5); rect.setAttribute('width', Math.max(0, w - 3)); rect.setAttribute('height', Math.max(0, h - 3)); rect.setAttribute('rx', 20.5);
  }
}

// ---------------------------------------------------------------- keypad
const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'Backspace', '0'];
let padKeys = null;
let padButtons = {};
function renderPad(keys = DIGIT_KEYS) {
  if (padKeys && padKeys.join() === keys.join()) return;
  padKeys = keys.slice();
  pad.innerHTML = '';
  padButtons = {};
  for (const k of keys) {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.key = k;
    if (k === 'Backspace') { b.className = 'del'; b.setAttribute('aria-label', '删除'); b.innerHTML = '<svg viewBox="0 0 30 22" aria-hidden="true"><path d="M9 2 H27 V20 H9 L2 11Z" fill="#fff" stroke="#172754" stroke-width="2.6" stroke-linejoin="round"/><path d="M14 7 L21 15 M21 7 L14 15" stroke="#172754" stroke-width="2.6" stroke-linecap="round"/></svg>'; } else {
      b.textContent = k;
      if (k === '0') b.className = 'zero';
    }
    pad.appendChild(b);
    padButtons[k] = b;
  }
}
pad.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault();
  if (S.demo) return;
  press(b.dataset.key, b);
});

// ---------------------------------------------------------------- sheet rendering
function renderSheet(p) {
  sheet.innerHTML = '';
  S.cells = {}; S.lines = {};
  sheet.style.setProperty('--cols', p.cols);
  sheet.style.gridTemplateRows = p.rowH.map((h) => `calc(var(--ch) * ${h})`).join(' ');
  sheet.className = `sheet k-${p.kind}`;
  if (p.bracket) {
    const b = document.createElement('div'); b.className = 'bracket';
    // ")" joined at the top to the bar over the dividend.
    b.innerHTML = '<svg viewBox="0 0 10 100" preserveAspectRatio="none" aria-hidden="true"><path d="M1 1 Q12 48 2 96" vector-effect="non-scaling-stroke"/></svg>';
    b.style.gridRow = `${p.bracket.r + 1}`; b.style.gridColumn = `${p.bracket.c0 + 1} / ${p.bracket.c1 + 2}`;
    sheet.appendChild(b);
  }
  for (const l of p.lines) {
    const d = document.createElement('div');
    d.className = `hline${l.kind === 'frac' ? ' frac' : ''}${l.hidden ? ' hidden' : ''}`;
    d.style.gridRow = `${l.r + 1}`; d.style.gridColumn = `${l.c0 + 1} / ${l.c1 + 2}`;
    sheet.appendChild(d);
    if (l.id) S.lines[l.id] = d;
  }
  for (const c of p.cells) {
    const d = document.createElement('div');
    d.className = `cell ${c.kind}${c.cls ? ` ${c.cls}` : ''}`;
    d.style.gridRow = c.rs ? `${c.r + 1} / span ${c.rs}` : `${c.r + 1}`;
    d.style.gridColumn = c.cs ? `${c.c + 1} / span ${c.cs}` : `${c.c + 1}`;
    if (c.kind === 'input') { d.appendChild(document.createElement('span')); d.setAttribute('aria-label', '填写处'); } else d.textContent = c.text;
    if (['carry', 'dot', 'auto'].includes(c.kind)) d.classList.add('hidden');
    if (c.kind === 'auto' && c.text === '.') d.classList.add('dotpt');
    d.dataset.id = c.id;
    sheet.appendChild(d);
    S.cells[c.id] = d;
  }
  fitSheet(p);
}

// Size the grid so any layout (wide expressions, tall long division) fits above the keypad.
function fitSheet(p = S.problem) {
  if (!p) return;
  const vh = innerHeight;
  const hud = $('.hud').offsetHeight + $('.hud2').offsetHeight + $('#xpbar').offsetHeight + 6;
  const cs = getComputedStyle($('#screen-play'));
  const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap || cs.gap || 6) * 4;
  const chrome = $('.card-top').offsetHeight + ($('#note').hidden ? 0 : $('#note').offsetHeight + 4) + 26 + 18;
  // Tall long division may squeeze the stage further so its rows stay readable.
  const stageMin = p.kind === 'div' ? (vh < 720 ? 58 : 90) : (vh < 720 ? 64 : 112);
  const availH = vh - hud - pad.offsetHeight - padV - chrome - stageMin - 8;
  const availW = card.clientWidth - 28;
  const rows = p.rowH.reduce((a, b) => a + b, 0);
  let cw = Math.min(p.kind === 'h' ? 50 : 56, availW / p.cols);
  let ch = Math.min(cw * (p.kind === 'div' ? 0.84 : 1.02), availH / rows);
  ch = Math.max(19, ch);
  if (cw > ch * 1.3) cw = Math.max(ch * 1.15, Math.min(cw, availW / p.cols));
  const fs = Math.min(cw * 0.86, ch * 0.8);
  sheet.style.setProperty('--cw', `${cw.toFixed(1)}px`);
  sheet.style.setProperty('--ch', `${ch.toFixed(1)}px`);
  sheet.style.setProperty('--fs', `${fs.toFixed(1)}px`);
  sheet.style.setProperty('--lw', `${clamp(fs * 0.075, 2, 3.4).toFixed(1)}px`);
}

// ---------------------------------------------------------------- session
function initSession() {
  S.run += 1;
  S.mode = 'basic';
  S.N = P.count || settings.count;
  S.grade = P.grade || settings.grade;
  S.onlySkill = P.skill;
  S.seed = P.seed ?? Math.floor(Math.random() * 1e9);
  S.rng = makeRng(S.seed);
  S.demoRng = makeRng(S.seed ^ 0x5bd1e995);
  S.plan = planBasic(S.grade, S.N, S.rng, S.onlySkill);
  S.problems = []; S.sigs = new Set();
  Object.assign(S, { qi: 0, problem: null, typed: [], ready: false, E: 0.04, combo: 0, maxCombo: 0, solved: 0, firstTry: 0, misses: 0, wrongInQ: false, cellMisses: 0, hintLevel: 0, shownWrong: null, sweetL: 0, sweet: 0, sweetAtStart: 0, endT: 0 });
  S.extra = { solved: 0, misses: 0, score: 0, endAt: 0, over: false };
  Object.assign(S, { xp: 0, xpShown: 0, xpBase: 0, level: 1, levelUps: 0, perks: [], chestTier: null, lastChest: null, fillStart: S.seed % 5 });
  DEMO.slipped = 0; DEMO.next = 0; DEMO.repeat = 0;
  clearCrowd();
  fx.clear();
  multReel.set(0, { animate: false });
  applyLook(); renderPerkIcons(); updateXpBar();
  const pips = $('#pips'); pips.innerHTML = ''; pips.classList.toggle('many', S.N > 10);
  for (let i = 0; i < S.N; i++) { const s = document.createElement('span'); s.className = 'pip'; pips.appendChild(s); }
  $('#clock-label').textContent = `目标 ${sc.fmtTime(sc.targetSeconds(S.N) * 1000)}`;
  $('.clock').classList.remove('extra', 'hurry'); DOMC.hurry = false;
  showClasses(S.E);
  showCombo(); updateTally(); updateSweet(false);
}

function startGame() {
  audio.unlock();
  initSession();
  S.startT = gameNow();
  audio.setLevel(0, 100, 0);
  audio.musicGain(0.75);
  audio.startMusic();
  audio.jingle();
  showScreen('play');
  setupProblem();
}

function makeNext(skillId) {
  const p = makeProblem(skillId, S.rng, S.sigs);
  S.sigs.add(signature(p));
  return p;
}

// Body classes and CSS variables that follow the show intensity.
function showClasses(E) {
  body.classList.toggle('show-bunting', E >= 0.3);
  body.classList.toggle('show-bunting2', E >= 0.9);
  body.classList.toggle('lv-marquee', E >= 0.45);
  body.classList.toggle('lv6', E >= 0.6);
  body.classList.toggle('lv8', E >= 0.8);
  // Keypad colour strength: on #pad only (a :root variable restyles the whole page), in steps of
  // 0.05 so the keys' colour transition runs a few times per game rather than after every key.
  const padk = (Math.round((0.35 + 0.65 * clamp(E)) * 20) / 20).toFixed(2);
  if (padk !== showClasses.padk) { showClasses.padk = padk; pad.style.setProperty('--padk', padk); }
}

function updateE() {
  if (S.mode === 'extra') { S.E = sc.extraE(S.extra.solved); } else {
    const n = S.problem ? S.problem.steps.length : 1;
    S.E = sc.basicE((S.qi + S.typed.length / n) / S.N);
  }
  const extra = S.mode === 'extra';
  const tier = Math.floor(S.extra.solved / 3);
  const L = extra ? 10 + Math.min(2, 1 + Math.floor(tier / 2)) : Math.min(10, Math.round(S.E * 10));
  const bpm = extra ? 128 + 4 * Math.min(5, tier) : 100 + 26 * Math.min(1, S.E);
  const key = extra ? 2 + Math.min(3, tier) : S.qi === S.N - 1 ? 2 : 0;
  audio.setLevel(L, bpm, key);
  hero.bob = clamp(S.E);
  showClasses(S.E);
}

async function setupProblem() {
  S.ready = false;
  const run = S.run;
  const extra = S.mode === 'extra';
  const p = extra ? makeNext(planExtra(S.grade, S.extra.solved, S.rng, S.onlySkill)) : (S.problems[S.qi] ||= makeNext(S.plan[S.qi]));
  S.problem = p; S.typed = []; S.wrongInQ = false; S.cellMisses = 0; S.hintLevel = 0; S.shownWrong = null; S.sweetAtStart = S.sweet;
  S.xpBase = S.xp;
  updateE();
  $$('.pip').forEach((el, i) => el.classList.toggle('now', !extra && i === S.qi));
  $('#qtitle').textContent = p.title;
  $('#qno').textContent = extra ? `加时 ${S.extra.solved + 1}` : `第${S.qi + 1}题`;
  const note = $('#note'); note.hidden = !p.note; note.textContent = p.note || '';
  $('#step-label').innerHTML = '&nbsp;';
  $('#stamp').classList.remove('show');
  if (S.missTimer) { S.missTimer(); S.missTimer = null; }
  renderPad(p.keys || DIGIT_KEYS);
  renderSheet(p);
  requestAnimationFrame(layoutActors);
  if (!still() && (extra || S.E > 0.28)) cutin(extra ? `加时 ${S.extra.solved + 1}` : S.qi === S.N - 1 ? '最后一题' : `第${S.qi + 1}题`, S.E);
  await cardEnter();
  if (run !== S.run || S.screen !== 'play') return;
  S.ready = true;
  activate(0);
}

async function cardEnter() {
  if (still()) { card.style.transform = ''; card.style.opacity = 1; return; }
  const E = S.E;
  if (E < 0.4) await tween(260, (k) => { card.style.transform = `translateX(${(1 - k) * 50}px) rotate(${(1 - k) * 2.5}deg)`; card.style.opacity = k; }, easeOutCubic);
  else {
    await tween(240 + 80 * Math.min(1, E), (k) => { card.style.transform = `translateY(${(1 - k) * -90}px) rotate(${(1 - k) * -6}deg) scale(${0.85 + 0.15 * k})`; card.style.opacity = Math.min(1, k * 3); }, easeInCubic);
    const r = card.getBoundingClientRect();
    fx.puff(r.left + 24, r.top, 5); fx.puff(r.right - 24, r.top, 5);
    audio.land();
    S.shake = Math.max(S.shake, 3 * E);
    await tween(200, (k) => { card.style.transform = `scale(${1 + Math.sin(k * Math.PI) * 0.03 * E}, ${1 - Math.sin(k * Math.PI) * 0.04 * E})`; });
  }
  card.style.transform = ''; card.style.opacity = 1;
}

// ---------------------------------------------------------------- step label (under the current cell)
// The label content sits in one inline-block (.lbl) that is shifted so its centre lines up with the
// current cell, clamped to the card.
function setLabel(html) {
  $('#step-label').innerHTML = `<span class="lbl">${html}</span>`;
  queueAlign();
}
// Measured at the start of the next frame (after this key's DOM writes), so a key press never
// forces an extra layout.
function queueAlign() {
  if (queueAlign.on) return;
  queueAlign.on = true;
  requestAnimationFrame(() => { queueAlign.on = false; alignLabel(); });
}
function alignLabel() {
  const lbl = $('#step-label .lbl'); if (!lbl) return;
  const p = S.problem; const st = p && p.steps[S.typed.length];
  const cell = st && S.cells[st.cell];
  if (!cell || S.screen !== 'play') { lbl.style.transform = ''; return; }
  const L = $('#step-label').getBoundingClientRect(); const w = lbl.offsetWidth;
  const cr = card.getBoundingClientRect(); const margin = 12;
  if (w >= cr.width - 2 * margin) { lbl.style.transform = ''; return; }
  const c = cell.getBoundingClientRect();
  const left = clamp(c.left + c.width / 2 - w / 2, cr.left + margin, cr.right - margin - w);
  const natural = L.left + (L.width - w) / 2;
  lbl.style.transform = `translateX(${(left - natural).toFixed(1)}px)`;
}
// "最后一位": the orange frame and pill on the last cell of a multi-digit answer.
function applyReach() {
  const p = S.problem; const k = S.typed.length; const st = p && p.steps[k];
  if (!st || !S.ready || S.screen !== 'play') return;
  const want = k === p.steps.length - 1 && p.steps.length > 1;
  if (!want) return;
  const cell = S.cells[st.cell];
  if (!cell.classList.contains('active') || cell.classList.contains('reach')) return;
  cell.classList.add('reach');
  const lbl = $('#step-label .lbl');
  if (lbl && S.hintLevel < 3 && !lbl.querySelector('.reach-pill')) { const b = lbl.querySelector('b'); b?.insertAdjacentHTML('afterend', '<span class="reach-pill">最后一位</span>'); queueAlign(); }
}

function activate(k) {
  const p = S.problem;
  $$('.cell.active').forEach((c) => c.classList.remove('active', 'reach'));
  $$('.cell.hint-glow').forEach((c) => c.classList.remove('hint-glow'));
  const st = p.steps[k];
  if (!st) return;
  S.cellMisses = 0; S.hintLevel = 0;
  const cell = S.cells[st.cell];
  cell.classList.add('active');
  cell.classList.remove('reach');
  for (const id of st.show) revealOne(id);
  setLabel(`<b>${st.label}</b>`);
  // Last digit of a multi-digit answer: 还差最后一位 (shown once the previous digit has landed).
  applyReach();
}

// ---------------------------------------------------------------- input
function pressVisual(btn) { if (!btn) return; btn.classList.add('press'); later(110, () => btn.classList.remove('press')); }

function press(key, btn = padButtons[key]) {
  if (S.screen !== 'play' || S.confirmOpen || S.settingsOpen || S.levelOpen) return;
  pressVisual(btn);
  if (key === 'Backspace') { erase(); return; }
  if (!S.ready || !S.problem) return;
  const p = S.problem;
  const st = p.steps[S.typed.length];
  if (!st) return;
  const cell = S.cells[st.cell];
  // Read geometry before any DOM write, so it costs no forced layout.
  const c = centerOf(cell); const cardTop = card.getBoundingClientRect().top;
  const res = judge(p.answers, S.typed, key);
  const span = cell.firstChild;
  // The digit shows in its cell right away (judging, sound and combo too); the hero's arm reaching
  // over to pat the cell is decoration running alongside, never a delay.
  span.textContent = key;
  popDigit(span);
  if (res.ok) {
    S.typed = res.typed;
    S.shownWrong = null;
    cell.classList.remove('bad');
    cell.classList.add('filled');
    addCombo();
    // 叮: one step up the scale per correct digit (octave up after the top); louder as the show grows.
    audio.ding(S.combo, dingStyle(), 0.08 + 0.06 * Math.min(1, S.E));
    bumpSweet(c, cardTop);
    spawnGems(c, cardTop);
    updateE();
    hideMissTag();
    const last = res.done;
    if (last) { S.ready = false; cell.classList.remove('active', 'reach'); } else activate(S.typed.length);
    onCorrect(st, cell, last, c, cardTop);
  } else {
    audio.keyTap(0);
    breakCombo();
    S.wrongInQ = true;
    S.cellMisses += 1;
    if (S.mode === 'extra') S.extra.misses += 1; else S.misses += 1;
    updateTally();
    cell.classList.add('bad');
    S.shownWrong = key;
    onWrong(st, cell);
  }
  // The hand pats the top edge of the card above the column: the arm never crosses the problem.
  if (!still()) { hero.tap({ x: c.x, y: cardTop - 2 }); later(120, () => audio.place()); }
}

// A quick pop of the digit (Web Animations: runs on the compositor).
function popDigit(span) {
  if (still()) return;
  span.animate([{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: 260 / SPEED, easing: 'cubic-bezier(.3,1.8,.5,1)' });
}

function erase() {
  if (!S.shownWrong || !S.problem) return;
  const st = S.problem.steps[S.typed.length];
  const cell = S.cells[st.cell];
  cell.firstChild.textContent = '';
  cell.classList.remove('bad');
  S.shownWrong = null;
  audio.erase();
  hideMissTag();
  applyReach();
  const c = centerOf(cell); fx.puff(c.x, c.y, 5);
}

// ---------------------------------------------------------------- director
function revealOne(id) {
  const el = S.cells[id] || S.lines[id];
  if (!el || !el.classList.contains('hidden')) return;
  el.classList.remove('hidden');
  if (still()) return;
  if (el.classList.contains('hline')) { el.classList.add('appear'); return; }
  const def = S.problem.cells.find((c) => c.id === id);
  const src = def && def.from ? S.cells[def.from] : null;
  if (src) {
    // Positions are read on the next frame (no forced layout inside the key handler).
    el.style.opacity = '0';
    requestAnimationFrame(() => {
      const a = src.getBoundingClientRect(); const b = el.getBoundingClientRect();
      const dx = a.left - b.left; const dy = a.top - b.top;
      el.style.opacity = '';
      tween(360, (k) => { el.style.transform = `translate(${dx * (1 - k)}px, ${dy * (1 - k) - Math.sin(k * Math.PI) * 22}px) scale(${1 + Math.sin(k * Math.PI) * 0.4})`; }).then(() => { el.style.transform = ''; });
    });
  } else el.classList.add('appear');
}

function burstKinds(E) {
  const k = ['confetti'];
  if (E > 0.2) k.push('star');
  if (E > 0.45) k.push('spark', 'spark');
  if (E > 0.65) k.push('coin');
  return k;
}

function onCorrect(st, cell, last, c, top) {
  const E = S.E;
  cell.classList.remove('just'); requestAnimationFrame(() => cell.classList.add('just')); later(450, () => cell.classList.remove('just'));
  for (const id of st.reveal) revealOne(id);
  if (!still()) {
    fx.burst(c.x, top - 2, { count: (4 + 12 * E) * confettiK(), speed: 260 + 260 * E, kinds: burstKinds(E), angle: -Math.PI / 2, spread: 1.4, up: 60, life: 0.7 });
    // A small shake on every digit: barely there on the first problems, stronger with the show and the combo.
    S.shake = Math.max(S.shake, 0.4 + 2.6 * clamp(E) * Math.min(1, S.combo / 15));
  }
  if (last) { clearProblem(); return; }
  if (E > 0.6) audio.run((t) => audio.coin(t, 84 + audio.key, 0.025 + 0.025 * E));
  if (!still() && now() > S.busyUntil) {
    hero.setFace('happy', E > 0.45 ? 'grin' : 'smile', 360); hero.setMood('happy');
    later(420, () => { if (hero.mood === 'happy') hero.setMood('calm'); });
    if (E > 0.35 && chance(0.5)) { S.busyUntil = now() + 400; hero.hop(10 + 18 * E, 260); }
  }
  if (!still()) crowd.forEach((m) => { if (!m.hopping && !m.busy && (perkOn('cheer') || chance(0.5))) m.hop((perkOn('cheer') ? 16 : 8) + rand(0, 12), 260); });
}

function onWrong(st, cell) {
  audio.wrong();
  giveHelp(st);
  showMissTag();
  if (still()) return;
  cell.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 360 / SPEED });
  S.busyUntil = now() + 1000;
  hero.hurt(chance(0.5) ? 1 : -1);
  crowd.forEach((m) => { m.surprised(600); });
}

// Hints on the same cell: 2nd miss highlights the digits to look at (and the hero points at them),
// 3rd miss shows the method with the result blank (口诀 / 分步式), 4th miss shows the worked result.
function giveHelp(st) {
  if (!st || S.problem.steps[S.typed.length] !== st) return;
  const n = S.cellMisses;
  if (n < 2) return;
  S.hintLevel = Math.min(4, n);
  const els = st.help.ids.map((id) => S.cells[id]).filter((el) => el && !el.classList.contains('hidden'));
  els.forEach((el) => el.classList.add('hint-glow'));
  if (els[0] && !still()) later(700, () => hero.point(centerOf(els[0])));
  if (n === 3) setLabel(`<b>${st.label}</b><span class="help-text">方法：${st.help.method || st.help.text}</span>`);
  if (n >= 4) setLabel(`<b>${st.label}</b><span class="help-text full">提示：${st.help.text}</span>`);
}

// "差一点" sits in the label line under the sheet, so it never covers the problem.
function showMissTag() {
  const label = $('#step-label .lbl') || $('#step-label');
  if (S.hintLevel >= 3) return;
  let tag = label.querySelector('.miss-pill');
  if (!tag) { tag = $('#miss-tag').cloneNode(true); tag.removeAttribute('id'); tag.className = 'miss-pill'; label.appendChild(tag); queueAlign(); }
  if (!still()) tag.animate([{ transform: 'scale(.4)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 260 / SPEED, easing: 'ease-out' });
  if (S.missTimer) S.missTimer();
  S.missTimer = later(1600, hideMissTag);
}
function hideMissTag() { const t = $('#step-label .miss-pill'); if (t) { t.remove(); queueAlign(); } }

async function clearProblem() {
  const E = S.E;
  const extra = S.mode === 'extra';
  const run = S.run;
  let gained = 0;
  if (extra) { gained = sc.extraPoints(S.extra.solved); S.extra.solved += 1; S.extra.score += gained; } else {
    S.solved += 1; if (!S.wrongInQ) S.firstTry += 1;
    const pip = $$('.pip')[S.qi];
    if (pip) { pip.classList.remove('now'); pip.classList.add('done'); pip.style.setProperty('--c', ['#2455F5', '#FFD447', '#FF782D', '#7B4DFF'][Math.min(3, Math.floor(E * 4))]); }
  }
  // 今日小目标 counts real play only (not ?demo, ?skill= or ?jump= debug runs).
  if (!S.demo && !S.onlySkill && !P.jump) store.noteDaily(S.maxCombo);
  updateTally();
  setLabel(`<span class="answer-text">${S.problem.answerText}</span>`);
  $('#stamp').classList.add('show');
  audio.clear(E);
  if (!still()) hitStop(40 + 10 * Math.min(1, E));
  celebrate(E);
  addCrowd();
  magnetGems();
  if (perkOn('fireworks') && !still()) fx.fireworks(VP.w, VP.h, 2, 0.05, 0.25);
  if (!still()) {
    const r = stage.getBoundingClientRect(); const sweetGain = S.sweet - S.sweetAtStart;
    // One big float per cleared problem: "+N 甜度" in the basic round, "+N分" in the extra round
    // (the 甜度 chip still pops). The per-digit "+123" floats make way for it.
    const str = gained ? `+${gained}分` : sweetGain > 0 ? `+${sweetGain.toLocaleString('en-US')} 甜度` : '';
    if (str) {
      let size = Math.min(24 + 12 * Math.min(1.2, E), r.width / 7) * (gained ? 1.15 : 1);
      let left = r.left + 8; let y = r.top + Math.max(size, r.height * 0.28);
      if (S.combo >= 3) {
        // Beside the combo label (under the bunting, top left), never on top of it.
        const cbr = $('#combo').getBoundingClientRect();
        left = cbr.right + 8; y = Math.max(r.top + size * 0.6, (cbr.top + cbr.bottom) / 2);
      }
      // On a short stage the hero's head reaches that height: move right of the hero.
      if (y + size * 0.6 > r.bottom - 8 - 105 * hero.S - 6) left = Math.max(left, hero.x + 60 * hero.S);
      const room = r.right - 8 - left;
      const w = fx.measure(str, size); if (w > room) size *= room / w;
      const x = left + room / 2;
      fx.fadeSlot('digit');
      fx.text(x, y, str, { color: gained ? '#FFFFFF' : '#FFD447', size, vy: -45, life: 1.1, slot: 'big' });
    }
  }
  if (!extra && S.qi === S.N - 1) {
    S.endT = gameNow();
    await wait(650); if (run !== S.run) return;
    await settleXp(); if (run === S.run) finale();
    return;
  }
  await wait(extra ? 560 : lerp(700, 1100, clamp(E)));
  if (run !== S.run || S.screen !== 'play' || (extra && S.extra.over)) return;
  // Level-up (三选一) happens here: after a problem, before the next one appears.
  await settleXp();
  if (run !== S.run || S.screen !== 'play' || (extra && S.extra.over)) return;
  if (!extra) S.qi += 1;
  setupProblem();
}

function celebrate(E) {
  if (still()) { hero.setFace('happy', 'grin', 700); return; }
  const W = VP.w; const H = VP.h;
  S.busyUntil = now() + 900;
  hero.celebrate(E, E > 0.6);
  crowd.forEach((m, i) => later(40 * i, () => { m.setFace('happy', 'grin', 700); m.raise(true); m.hop(14 + rand(0, 16) + 20 * Math.max(0, E - 0.6), 300).then(() => m.raise(false)); }));
  const sr = stage.getBoundingClientRect();
  const cx = sr.left + sr.width / 2; const cy = sr.top + sr.height * 0.45;
  fx.burst(cx, cy, { count: 16 + 50 * Math.min(1.2, E), speed: 420 + 420 * E, kinds: burstKinds(E), up: 200, life: 0.8 });
  fx.ring(cx, cy, { color: '#FFD447', radius: 90 + 140 * E, width: 9 });
  if (E > 0.3) fx.streamers(W, H, Math.round(2 + 5 * E));
  if (E > 0.5) fx.fireworks(W, H, Math.round(1 + 4 * E), 0.05, 0.28);
  if (E > 0.65) fx.rain(W, Math.round(15 + 30 * E), ['confetti', 'confetti', 'star', 'coin']);
  S.shake = Math.max(S.shake, 2 + 7 * Math.min(1.3, E));
}

// ---------------------------------------------------------------- combo and 甜度
// 甜度 is a slot-machine counter (every digit rolls and stops with a click); 连击倍率 is a small reel
// in the combo label that rolls up when the combo passes 5 / 10 / 20 / 35 / 50.
let reelClickAt = 0; let reelTickAt = 0;
const sweetReel = new Reel($('#sweet'), {
  onStop: (i) => { const t = performance.now(); if (t - reelClickAt < 45) return; reelClickAt = t; audio.reelStop(i % 4); },
  onTick: () => { const t = performance.now(); if (t - reelTickAt < 60) return; reelTickAt = t; audio.reelTick(); },
});
const multReel = new MultReel($('#mult'), sc.COMBO_MULTS.map(sc.fmtMult));
function addCombo() {
  S.combo += 1;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  showCombo();
  if (sc.comboMilestone(S.combo)) {
    audio.comboUp(S.combo);
    if (!still() && now() > S.busyUntil) hero.surprised(520);
    if (!still()) { hitStop(40); const c = centerOf($('#combo')); fx.burst(c.x, c.y, { count: 14 * confettiK(), kinds: ['star', 'spark'], speed: 320, up: 60 }); }
  }
}
function breakCombo() {
  const had = S.combo;
  S.combo = 0;
  showCombo();
  if (had >= 3) {
    audio.comboEnd();
    const r = S.stageRect || stage.getBoundingClientRect();
    fx.text(r.left + 70, r.top + Math.min(58, r.height * 0.5), `本次连击 ${had}`, { color: '#FFFFFF', size: 18, vy: -30, life: 1.2, slot: 'combo' });
  }
}
function showCombo() {
  const box = $('#combo');
  const on = S.combo >= 3;
  box.classList.toggle('on', on);
  const tier = sc.comboTier(S.combo, perkOn('early'));
  box.classList.toggle('has-mult', on);
  if (tier !== multReel.tier) {
    const up = tier > multReel.tier;
    multReel.set(tier, { animate: !still() && on });
    if (up && on) {
      audio.multUp(tier);
      if (!still()) { const c = centerOf($('#mult')); fx.burst(c.x, c.y, { count: 10, kinds: ['star', 'spark'], speed: 260, up: 80, colors: ['#FFD447', '#FFFFFF'] }); }
    }
  }
  if (on) {
    $('#combo-n').textContent = S.combo;
    if (!still()) box.animate([{ transform: 'rotate(-8deg) scale(1.35)' }, { transform: 'rotate(-8deg) scale(1)' }], { duration: 220 / SPEED, easing: 'cubic-bezier(.3,1.8,.5,1)' });
  }
}
function bumpSweet(c, cardTop) {
  const prev = S.sweetL;
  const n = S.problem.steps.length; const k = S.typed.length;
  const base = S.mode === 'extra' ? (sc.sweetExtraL(S.extra.solved + 1) - sc.sweetExtraL(S.extra.solved)) / n
    : sc.sweetBasicL((S.qi + k / n) / S.N) - sc.sweetBasicL((S.qi + (k - 1) / n) / S.N);
  S.sweetL = sc.addSweet(prev, base, S.combo, { early: perkOn('early'), boost: pk.sweetBoost(S.perks) });
  const before = S.sweet;
  S.sweet = Math.max(S.sweet + 1, sc.sweetValue(S.sweetL));
  updateSweet(true);
  const gain = S.sweet - before;
  if (!still() && S.E > 0.15 && gain > 0) {
    fx.text(c.x, cardTop - 10, `+${gain.toLocaleString('en-US')}`, { color: pick(['#FFD447', '#FFFFFF', '#9FD8FF']), size: 16 + 8 * Math.min(1, S.E), vy: -110, life: 0.8, slot: 'digit', sprite: false });
  }
  for (const e of sc.sweetMilestones(before, S.sweet)) lockSweet(e);
}
// 甜度 reached 100 / 1000 / 1万 ...: the reel locks with a flash and pays out coins.
function lockSweet(e) {
  audio.jackpot(e);
  const box = $('#sweet-box');
  box.classList.remove('lock'); requestAnimationFrame(() => box.classList.add('lock'));
  later(720, () => box.classList.remove('lock'));
  if (still()) return;
  hitStop(45);
  const c = centerOf(box);
  // The words go on the stage under the bunting (the canvas is below the header, never on top of it).
  // Right-aligned under the bunting, clear of the hero standing in the middle.
  const str = `甜度 ${sc.milestoneLabel(e)}！`; const size = 24 + 2 * (e - 2);
  const r = S.stageRect; const wT = fx.measure(str, size);
  const tx = r ? r.right - wT / 2 - 4 : c.x; const ty = r ? r.top + 62 : c.y + 38;
  fx.text(tx, ty, str, { color: '#FFD447', size, vy: 12, life: 1.4, slot: 'sweet' });
  fx.burst(c.x, c.y + 12, { count: (18 + 6 * (e - 2)) * confettiK(), kinds: ['coin', 'coin', 'star'], speed: 420, up: 120 });
  fx.ring(c.x, c.y, { color: '#FFD447', radius: 70 + 10 * e, width: 7 });
  S.flash = Math.max(S.flash, 0.25);
}
function updateSweet(pop) {
  sweetReel.instant = still();
  sweetReel.set(sc.fmtSweetValue(S.sweet), { animate: pop });
  if (pop && !still()) $('#sweet-box').animate([{ transform: 'scale(1.1) rotate(-2deg)' }, { transform: 'scale(1)' }], { duration: 200 / SPEED, easing: 'cubic-bezier(.3,1.8,.5,1)' });
}
function updateTally() {
  $('#ok').textContent = S.mode === 'extra' ? S.extra.solved : S.solved;
  $('#ng').textContent = S.mode === 'extra' ? S.extra.misses : S.misses;
}

// ---------------------------------------------------------------- 收藏 applied to the game, perks
const perkOn = (id) => S.perks.includes(id);
const confettiK = () => (perkOn('confetti') ? 2 : 1);
const dingStyle = () => (perkOn('gong') ? 'snd-gong' : COL.equip.sound);
function currentOutfit() { const e = COL.equip; return { head: e.head, face: perkOn('shades') ? 'shades' : e.face, neck: e.neck }; }
function applyLook() {
  hero.setOutfit(currentOutfit());
  bg.setTheme(THEMES[COL.equip.bg] || null);
  fx.gemStyle = perkOn('coins') ? 'gem-coin' : COL.equip.gem;
  fx.rainbow = perkOn('magnet');
}
function renderPerkIcons() {
  $('#perk-icons').innerHTML = S.perks.map((id) => { const l = PERK_LOOK[id] || PERK_LOOK.sweet20; return `<i class="perk-ico" style="--pc:${l.color}" title="${(pk.PERK[id] || pk.PERK_MORE).name}">${l.glyph}</i>`; }).join('');
}
function applyPerk(id) {
  S.perks.push(id);
  applyLook(); renderPerkIcons(); showCombo();
}
function updateCollectionCount() {
  const n = col.ITEMS.filter((i) => COL.owned.includes(i.id)).length;
  $('#collection-count').textContent = `${n}/${col.ITEMS.length}`;
}

// ---------------------------------------------------------------- 经验宝石 and the XP bar
// XP is fixed per finished problem (perks.js); the gems only carry it to the bar. Each correct
// digit sends one gem straight to the bar and drops one or two on the stage floor; when the problem
// is done the magnet pulls in whatever is still lying there. Level-ups wait until the problem is
// finished (the game clock is held while the 三选一 overlay is open).
const XPE = { lv: $('#lv'), fill: $('#xp-fill'), bar: $('#xpbar'), glow: $('#xp-glow'), tr: '' };
function updateXpBar() {
  const start = pk.xpBefore(S.level); const need = pk.xpNeed(S.level);
  const frac = clamp((S.xpShown - start) / need);
  const txt = `Lv ${S.level}`;
  if (XPE.lv.textContent !== txt) XPE.lv.textContent = txt;
  const tr = `scaleX(${frac.toFixed(3)})`;
  if (tr !== XPE.tr) { XPE.tr = tr; XPE.fill.style.transform = tr; }
  XPE.bar.classList.toggle('full', frac >= 0.999);
}
function xpTarget() {
  const r = S.xpRect; if (!r) return { x: VP.w / 2, y: 80 };
  const frac = clamp((S.xpShown - pk.xpBefore(S.level)) / pk.xpNeed(S.level));
  return { x: r.left + Math.max(10, r.width * frac), y: r.top + r.height / 2 };
}
function gemArrive(v) {
  S.xpShown = Math.min(S.xp, S.xpShown + v);
  updateXpBar();
  const t = now(); if (t - S.gemAt > 600) S.gemRun = 0;
  S.gemRun += 1; S.gemAt = t;
  audio.gem(S.gemRun);
  XPE.glow.getAnimations().forEach((a) => a.cancel());
  XPE.glow.animate([{ opacity: 0.8 }, { opacity: 0 }], { duration: 240 / SPEED });
}
function spawnGems(c, cardTop) {
  const n = S.problem.steps.length; const per = (S.mode === 'extra' ? pk.XP_EXTRA : pk.XP_BASIC) / n;
  S.xp += per;
  if (still() || !S.stageRect) { S.xpShown = S.xp; updateXpBar(); return; }
  const t = xpTarget(); const r = S.stageRect;
  const ground = S.E > 0.5 ? 2 : 1; const fly = S.E > 0.35 ? 2 : 1;
  for (let i = 0; i < fly; i++) fx.flyGem(c.x + rand(-10, 10), cardTop - 6, t.x, t.y, { delay: i * 0.07, onArrive: () => gemArrive((per * 0.5) / fly) });
  for (let i = 0; i < ground; i++) fx.dropGem(c.x + rand(-8, 8), cardTop - 8, r.bottom - 8, r.left + 14, r.right - 14, { onArrive: () => gemArrive((per * 0.5) / ground) });
}
function magnetGems() {
  if (still()) return;
  const t = xpTarget();
  const n = fx.magnet(t.x, t.y, { stagger: perkOn('magnet') ? 0.08 : 0.24 });
  if (!n) return;
  audio.magnet();
  XPE.bar.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06, 1.25)' }, { transform: 'scale(1)' }], { duration: 420 / SPEED, easing: 'ease-out' });
}
// Between problems: settle the XP of the finished problem, then level up if the bar is full.
async function settleXp() {
  S.xp = S.xpBase + (S.mode === 'extra' ? pk.XP_EXTRA : pk.XP_BASIC);
  S.xpShown = S.xp; updateXpBar();
  const target = pk.levelOf(S.xp).level;
  if (target <= S.level) return;
  holdClock(true); S.levelOpen = true;
  while (S.level < target) {
    S.level += 1; updateXpBar();
    const choices = pk.perkChoices(S.levelUps, S.perks);
    const id = await showLevelUp(S.level, choices, { audio, auto: S.demo, still: still() });
    S.levelUps += 1;
    applyPerk(id);
    updateXpBar();
  }
  S.levelOpen = false; holdClock(false);
}

// ---------------------------------------------------------------- audience (小汤圆观众) and 合成
// The model is merge.js (pure): S.members = [{ id, f, lv }]. Each member is drawn by a Tangyuan in
// `actors` (id → actor); `crowd` is the plain list of those actors for the effects code.
// Sizes: 小 1, 中 1.38, 大 1.8, 金 2.25 (golden). Bigger ones stand closer to the hero and behind.
const LV_SCALE = [1, 1.38, 1.8, 2.25];
const actors = new Map();
let crowdQueue = Promise.resolve();
const actorList = () => [...actors.values()].map((m) => ({ id: m.mid, f: m.f, lv: m.lv }));
function syncCrowdArray() { crowd.length = 0; for (const m of actors.values()) crowd.push(m); }
function makeActor(mem, scale) {
  const m = new Tangyuan(crowdLayer, { scale, filling: mem.lv >= MAX_LEVEL ? GOLD : FILLINGS[mem.f] });
  m.bob = 0.6; m.lv = mem.lv; m.mid = mem.id; m.f = mem.f;
  actors.set(mem.id, m);
  return m;
}
// Bigger members are drawn first (behind). Only nodes that are out of place are moved: moving SVG
// nodes restyles and repaints the whole actors layer.
function reorderCrowd() {
  const list = [...actors.values()].sort((a, b) => b.lv - a.lv || a.mid - b.mid);
  const want = [...list.map((m) => m.shadow).filter(Boolean), ...list.map((m) => m.g)];
  const have = [...crowdLayer.children].filter((n) => want.includes(n));
  for (let i = want.length - 1; i >= 0; i--) {
    if (have[i] === want[i]) continue;
    const next = i + 1 < want.length ? want[i + 1] : null;
    if (want[i].nextSibling !== next) crowdLayer.insertBefore(want[i], next);
  }
}
// Slots for a list of members: biggest next to the hero, alternating sides; when a side is full a
// back row starts behind. On the result screens they stand on the card.
function crowdSlots(list) {
  const onResult = S.screen === 'result' || S.screen === 'final';
  const r = onResult ? S.resultCardRect : S.stageRect;
  const out = new Map();
  if (!r) return out;
  const base = onResult ? clamp(hero.S * 0.42, 0.22, 0.5) : clamp(hero.S * 0.45, 0.2, 0.42);
  const floorY = onResult ? r.top + 4 : r.bottom - 10;
  const heroHalf = 58 * hero.S;
  // The tallest member still fits on the stage (about 105 × scale px with its steam).
  const maxS = onResult ? base * LV_SCALE[MAX_LEVEL] : Math.max(base, (r.height - 16) / 105);
  const sorted = [...list].sort((a, b) => b.lv - a.lv || a.id - b.id);
  const edge = [heroHalf, heroHalf]; const row = [0, 0]; const half = r.width / 2 - 2;
  sorted.forEach((m, i) => {
    const side = i % 2; const sc0 = Math.min(maxS, base * LV_SCALE[m.lv]); const w = 94 * sc0;
    if (edge[side] + w > half && edge[side] > heroHalf + 1) { row[side] += 1; edge[side] = heroHalf * 0.55 + row[side] * 18; }
    const x0 = edge[side]; edge[side] = x0 + w * 0.9;
    const k = row[side];
    out.set(m.id, { x: r.left + r.width / 2 + (side ? 1 : -1) * (x0 + w / 2), y: floorY - k * 24 * (base / 0.3), s: sc0 * (1 - k * 0.07), row: k });
  });
  return out;
}
function crowdShown() { return ['play', 'result', 'final'].includes(S.screen) && !(S.screen === 'play' && S.tinyStage); }
function placeCrowd() {
  const slots = crowdSlots(actorList()); const shown = crowdShown();
  for (const [id, m] of actors) {
    const sl = slots.get(id);
    m.visible = shown && !!sl && !m.gone;
    m.maxLift = S.screen === 'play' ? hero.maxLift + 10 : Infinity;
    if (!sl || m.entering || m.busy) continue;
    m.place(sl.x, sl.y);
    if (!m.appearing) m.S = sl.s;
  }
}
// Everybody glides to their slots.
function glideCrowd(ms = 320) {
  const slots = crowdSlots(actorList()); const jobs = [];
  for (const [id, m] of actors) {
    const sl = slots.get(id); if (!sl || m.entering) continue;
    const x0 = m.x; const y0 = m.y; const s0 = m.S; const scale = !m.appearing;
    jobs.push(tween(ms, (k) => { m.x = lerp(x0, sl.x, k); m.y = lerp(y0, sl.y, k); if (scale) m.S = lerp(s0, sl.s, k); }, easeOutCubic));
  }
  return Promise.all(jobs);
}
function clearCrowd() {
  for (const m of actors.values()) m.destroy();
  actors.clear(); crowd.length = 0;
  S.members = []; S.nextId = 1; S.memberCount = 0; crowdQueue = Promise.resolve();
}
// Actors straight from the model (debug jumps, after the finale, motion 0).
function rebuildCrowd() {
  for (const m of actors.values()) m.destroy();
  actors.clear();
  for (const mem of S.members) makeActor(mem, 0.3);
  reorderCrowd(); syncCrowdArray(); placeCrowd();
}
// A solved problem adds a member; three of the same filling and size merge (chains included).
function addCrowd() {
  if (S.screen !== 'play') return;
  const f = fillingIndex(S.memberCount, S.fillStart);
  const before = S.members;
  const r = addMember(before, f, S.nextId);
  S.memberCount += 1; S.nextId = r.nextId; S.members = r.list;
  if (still()) { rebuildCrowd(); return; }
  const added = { id: r.added, f, lv: 0 };
  const run = S.run;
  crowdQueue = crowdQueue.then(() => (run === S.run ? animateAdd(added, r.merges, run) : null)).catch((e) => console.error(e));
}
async function animateAdd(added, merges, run) {
  const m = makeActor(added, 0.01); reorderCrowd(); syncCrowdArray();
  const sl = crowdSlots(actorList()).get(added.id);
  m.place(sl.x, sl.y); m.visible = crowdShown(); m.appearing = true;
  glideCrowd(300);
  if (S.mode === 'extra') {
    // Extra round: newcomers jump in from the side of the screen.
    const fromLeft = sl.x < VP.w / 2; const x0 = fromLeft ? -50 : VP.w + 50;
    m.S = sl.s; m.entering = true;
    await tween(520, (k) => { m.x = lerp(x0, sl.x, k); m.y = sl.y; m.lift = Math.sin(k * Math.PI) * 90; }, (k) => k);
    m.lift = 0; m.entering = false; m.appearing = false; m.sq.kick(3);
  } else {
    m.hop(24, 360);
    await tween(420, (k) => { m.S = sl.s * k; }, easeOutBack);
    m.appearing = false;
  }
  for (const mg of merges) {
    if (run !== S.run) return;
    await wait(220);
    await mergeStep(mg);
  }
}
// Three jump together, flash, and one bigger 汤圆 pops out of the flash.
async function mergeStep(mg) {
  const three = mg.ids.map((id) => actors.get(id)).filter(Boolean);
  if (three.length < 3) { rebuildCrowd(); return; }
  // They gather where the bigger one will stand (never behind the hero).
  const after = actorList().filter((m) => !mg.ids.includes(m.id)).concat({ id: mg.into, f: mg.f, lv: mg.lv });
  const target = crowdSlots(after).get(mg.into);
  const cx = target ? target.x : three.reduce((a, m) => a + m.x, 0) / 3; const cy = target ? target.y : Math.max(...three.map((m) => m.y));
  audio.merge(mg.lv);
  const starts = three.map((m) => ({ m, x: m.x, y: m.y }));
  for (const m of three) { m.busy = true; m.setFace('happy', 'grin', 600); m.raise(true); }
  await tween(250, (k) => { for (const st of starts) { st.m.x = lerp(st.x, cx, k); st.m.y = lerp(st.y, cy, k); st.m.lift = Math.sin(k * Math.PI) * 34; } }, easeInCubic);
  const size = 94 * three[0].S;
  fx.ring(cx, cy - size * 0.5, { color: mg.lv >= MAX_LEVEL ? '#FFD447' : '#FFFFFF', radius: 50 + 40 * mg.lv, width: 7 + mg.lv });
  fx.burst(cx, cy - size * 0.5, { count: 12 + 10 * mg.lv, kinds: mg.lv >= 2 ? ['star', 'coin', 'spark'] : ['star', 'spark', 'confetti'], speed: 360 + 90 * mg.lv, up: 150 });
  S.flash = Math.max(S.flash, 0.12 * mg.lv);
  if (mg.lv >= 2) { hitStop(45); S.shake = Math.max(S.shake, 3 + 3 * mg.lv); }
  for (const m of three) { m.destroy(); actors.delete(m.mid); }
  const big = makeActor({ id: mg.into, f: mg.f, lv: mg.lv }, 0.01); reorderCrowd(); syncCrowdArray();
  const sl = crowdSlots(actorList()).get(mg.into);
  big.place(cx, cy); big.visible = crowdShown(); big.appearing = true;
  big.setFace('happy', 'grin', 900); big.hop(26 + 8 * mg.lv, 380);
  tween(380, (k) => { big.S = sl.s * k; }, easeOutBack).then(() => { big.appearing = false; });
  await glideCrowd(340);
}
// 满分终场: the whole audience merges into the giant 汤圆 (they come back on the result card).
async function grandMerge() {
  // Let a merge that is still playing (the last problem's) finish first.
  await Promise.race([crowdQueue, wait(1500)]);
  const list = [...actors.values()].filter((m) => m.visible);
  if (!list.length) return null;
  const top = list.reduce((a, m) => (m.lv > a.lv ? m : a), list[0]);
  const filling = top.lv >= MAX_LEVEL ? GOLD : FILLINGS[top.f];
  if (still()) { for (const m of list) { m.gone = true; m.visible = false; } return filling; }
  const cx = VP.w / 2; const cy = S.stageRect ? S.stageRect.bottom - 30 : VP.h * 0.4;
  audio.merge(3);
  const starts = list.map((m) => ({ m, x: m.x, y: m.y, s: m.S }));
  for (const m of list) { m.busy = true; m.raise(true); m.setFace('happy', 'grin', 900); }
  await tween(420, (k) => { for (const st of starts) { st.m.x = lerp(st.x, cx, k); st.m.y = lerp(st.y, cy, k); st.m.lift = Math.sin(k * Math.PI) * 70; st.m.S = st.s * (1 - 0.5 * k); } }, easeInCubic);
  for (const m of list) { m.gone = true; m.visible = false; m.busy = false; m.raise(false); m.lift = 0; }
  fx.ring(cx, cy - 40, { color: '#FFD447', radius: 220, width: 12 });
  fx.burst(cx, cy - 40, { count: 60, kinds: ['star', 'coin', 'spark', 'confetti'], speed: 700, up: 200 });
  hitStop(50);
  return filling;
}
function restoreCrowd() { for (const m of actors.values()) { m.gone = false; m.busy = false; } placeCrowd(); }

// ---------------------------------------------------------------- cut-ins and seals
function cutin(text, E) {
  audio.whoosh();
  const r = stage.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'cutin';
  const h = 50 + 18 * Math.min(1.2, E);
  const pals = [['#2455F5', '#3D6BFF'], ['#FF782D', '#FF9552'], ['#7B4DFF', '#9670FF'], ['#1A1F5C', '#2E3790']];
  const pal = S.mode === 'extra' ? pals[3] : pals[Math.min(2, Math.floor(E * 3))];
  el.style.cssText = `top:${r.top + r.height * 0.42 - h / 2}px;height:${h}px;--c1:${pal[0]};--c2:${pal[1]}`;
  el.innerHTML = `<div class="band"></div><div class="txt" style="font-size:${28 + 12 * Math.min(1.2, E)}px">${text}</div>`;
  $('#cutins').appendChild(el);
  (async () => {
    await tween(220, (k) => { el.style.transform = `translateX(${(1 - k) * 110}%) rotate(-5deg) scaleY(${0.6 + 0.4 * k})`; }, easeOutBack);
    await wait(380 + 140 * E);
    await tween(180, (k) => { el.style.transform = `translateX(${-k * 110}%) rotate(-5deg)`; }, easeInCubic);
    el.remove();
  })();
}

function flySeal(text, { color = null, y = 0.2, hold = 1300 } = {}) {
  const el = document.createElement('div');
  el.className = 'seal seal-fly';
  if (color) { el.style.color = color; el.style.borderColor = color; el.style.boxShadow = `inset 0 0 0 5px #fff, inset 0 0 0 10px ${color}, 0 8px 0 rgba(23,39,84,.35)`; }
  el.textContent = text;
  $('#cutins').appendChild(el);
  const w = el.offsetWidth; const h = el.offsetHeight;
  el.style.left = `${innerWidth / 2 - w / 2}px`; el.style.top = `${innerHeight * y - h / 2}px`;
  (async () => {
    if (still()) el.style.transform = 'rotate(-8deg)';
    else await tween(300, (k) => { el.style.transform = `scale(${lerp(3.2, 1, k)}) rotate(${lerp(-24, -8, k)}deg)`; el.style.opacity = Math.min(1, k * 2); }, easeOutBack);
    S.shake = Math.max(S.shake, 14);
    await wait(hold);
    await tween(260, (k) => { el.style.opacity = 1 - k; el.style.transform = `scale(${1 + k * 0.25}) rotate(-8deg)`; });
    el.remove();
  })();
}

// ---------------------------------------------------------------- finale (满分终场)
async function finale() {
  const run = S.run;
  S.ready = false;
  S.endT = S.endT || gameNow();
  S.E = 1; showClasses(1);
  // The whole audience flies together: the last and biggest merge brings out the giant 汤圆.
  const filling = await grandMerge();
  if (run !== S.run) return;
  audio.finale();
  if (still()) { flySeal('100分', { hold: 900 }); await wait(1300); if (run === S.run) showResult(); return; }
  const W = VP.w; const H = VP.h;
  S.flash = 0.7;
  fx.fireworks(W, H, 10, 0.05, 0.3);
  fx.streamers(W, H, 12 * confettiK());
  fx.rain(W, 90 * confettiK(), ['confetti', 'confetti', 'star', 'coin']);
  const giant = new Tangyuan($('#hero-layer'), { scale: Math.min(4.2, W / 112), shadow: false, filling: filling || undefined });
  extras.push(giant);
  giant.setFace('happy', 'grin'); giant.setMood('happy'); giant.raise(true); giant.bob = 1;
  const y0 = H + 100 * giant.S; const y1 = H + 16 * giant.S;
  giant.place(W / 2, y0);
  hero.celebrate(1, true);
  await tween(560, (k) => { giant.y = lerp(y0, y1, k); }, easeOutBack);
  flySeal('100分', { y: 0.22, hold: 1250 });
  S.flash = 0.5;
  for (let i = 0; i < 3; i++) { giant.sq.kick(-2.5); await tween(260, (k) => { giant.lift = Math.sin(k * Math.PI) * 40; giant.rot = Math.sin(k * Math.PI * 2) * 5; }); giant.lift = 0; giant.rot = 0; giant.sq.kick(3); }
  fx.fireworks(W, H, 6, 0.05, 0.3);
  await wait(420);
  await tween(420, (k) => { giant.y = lerp(y1, y0, k); }, easeInCubic);
  giant.destroy(); extras.splice(extras.indexOf(giant), 1);
  crowd.forEach((m) => m.raise(false));
  if (run === S.run) showResult();
}

// ---------------------------------------------------------------- results
// Entrance: the 100分 seal slams down, the stat boxes pop in one by one with rolling numbers,
// then the buttons slide up. The audience hops in along the top of the card.
function resultEntrance(screen, statsEl, actionsEl, sealEl) {
  const boxes = [...statsEl.children];
  if (still()) { statsEl.classList.remove('intro'); actionsEl.classList.remove('intro'); boxes.forEach((b) => b.classList.add('in')); return; }
  statsEl.classList.add('intro'); actionsEl.classList.add('intro'); actionsEl.classList.remove('in');
  boxes.forEach((b) => b.classList.remove('in'));
  const run = S.run;
  if (sealEl) {
    sealEl.style.opacity = 0;
    later(220, () => {
      if (run !== S.run) return;
      tween(340, (k) => { sealEl.style.transform = `scale(${lerp(3, 1, k)}) rotate(${lerp(-24, -7, k)}deg)`; sealEl.style.opacity = Math.min(1, k * 2.5); }, easeOutBack)
        .then(() => { S.shake = Math.max(S.shake, 10); audio.gong(); const c = centerOf(sealEl); fx.burst(c.x, c.y, { count: 44, kinds: ['confetti', 'star', 'coin'], speed: 620, up: 200 }); fx.ring(c.x, c.y, { color: '#E8412F', radius: 130, width: 8 }); });
    });
  }
  const t0 = sealEl ? 620 : 300;
  boxes.forEach((b, i) => later(t0 + 110 * i, () => {
    if (run !== S.run || S.screen !== screen) return;
    b.classList.add('in');
    audio.run((t) => audio.blip(t, 76 + i * 2, 0.08));
    const num = b.querySelector('b[data-n]');
    if (num) { const to = Number(num.dataset.n); tween(420, (k) => { num.textContent = Math.round(to * k); }, easeOutCubic); }
  }));
  later(t0 + 110 * boxes.length + 120, () => { if (run === S.run) actionsEl.classList.add('in'); });
  crowd.forEach((m, i) => later(t0 + 60 * i, () => { if (S.screen === screen && !m.hopping) m.hop(30, 340); }));
}

function setStat(id, value) { const el = $(`#${id}`); el.dataset.n = value; el.textContent = value; }

function showResult() {
  closeConfirm();
  const rate = S.firstTry / S.N;
  const ok = sc.extraUnlocked(S.firstTry, S.N);
  $('#result-title').textContent = S.onlySkill ? `${SKILL[S.onlySkill].short} 完成！` : `${S.grade}年级 完成！`;
  setStat('r-ok', S.solved); setStat('r-ng', S.misses); setStat('r-rate', Math.round(rate * 100)); setStat('r-combo', S.maxCombo);
  $('#r-time').textContent = sc.fmtTime(S.endT - S.startT);
  $('#r-sweet').textContent = sc.fmtSweetValue(S.sweet);
  const un = $('#r-unlock');
  un.textContent = ok ? '首次正确率达到 80%，加时赛解锁！' : '首次正确率达到 80% 就能解锁加时赛';
  un.classList.toggle('yes', ok);
  $('#go-extra').hidden = !ok;
  if (!S.demo && !P.jump) store.addRecord({ grade: S.grade, count: S.N, firstRate: rate, misses: S.misses, timeMs: Math.round(S.endT - S.startT), sweet: S.sweet });
  audio.musicGain(0.45, 0.6);
  restoreCrowd();
  showScreen('result');
  hero.setFace('happy', 'grin', 1500); hero.setMood('happy');
  S.fwT = 0.9; S.cheerT = 1.8;
  resultEntrance('result', $('#r-stats'), $('#screen-result .actions'), $('#r-seal'));
  // The 蒸笼 opens once the stats are in. The prize is decided and saved right now, so leaving the
  // page early never loses it; the buttons wake up when the chest has been opened.
  const chest = prepareChest('basic');
  const acts = $('#screen-result .actions'); acts.inert = true;
  const run = S.run;
  later(still() ? 300 : 1700, async () => {
    if (run !== S.run || S.screen !== 'result') { acts.inert = false; return; }
    await showChest(chest);
    acts.inert = false;
    if (S.demo && run === S.run && S.screen === 'result') later(500, () => { if (S.screen !== 'result' || !S.demo) return; if (ok) startExtra(); else finishDemo(); });
  });
}

// 蒸笼: tier from how the round went (chest.js), prize = the next item of that tier (collection.js).
// Debug runs (?demo, ?jump, ?skill) show the chest but do not save the prize.
function prepareChest(kind) {
  const stats = { maxCombo: S.maxCombo, firstTryRate: S.N ? S.firstTry / S.N : 0, solved: S.solved, count: S.N, extraSolved: kind === 'extra' ? S.extra.solved : 0 };
  const tier = P.tier ?? chestTier(stats);
  const goals = P.tier === null ? chestGoals(stats) : [];
  const reward = col.nextReward(tier, COL.owned);
  const fresh = !debugRun();
  if (fresh) { COL = col.grant(COL, reward); store.saveCollection(COL); updateCollectionCount(); }
  S.chestTier = tier; S.lastChest = { kind, tier, goals, reward: reward.id };
  return { tier, goals, reward, fresh };
}
async function showChest({ tier, goals, reward, fresh }) {
  S.chestOpen = true;
  audio.musicGain(0.3, 0.3);
  await playChest({ tier, goals, reward, audio, still: still(), auto: S.demo, fresh });
  S.chestOpen = false;
  audio.musicGain(0.45, 0.6);
}

// force: used by ?jump=extra and __game.startExtra(true); the button only exists when unlocked.
function startExtra(force = false) {
  if (!force && !sc.extraUnlocked(S.firstTry, S.N)) { toast('首次正确率达到 80% 才能进加时赛'); return false; }
  audio.unlock();
  S.run += 1;
  S.mode = 'extra';
  S.extra = { solved: 0, misses: 0, score: 0, endAt: 0, over: false };
  S.combo = 0; showCombo(); updateTally();
  $('.clock').classList.add('extra');
  $('#clock-label').textContent = '剩余';
  $$('.pip').forEach((p) => { p.classList.add('done'); p.classList.remove('now'); });
  audio.musicGain(0.8, 0.2);
  audio.startMusic();
  showScreen('play');
  S.extra.endAt = gameNow() + sc.EXTRA_SECONDS * 1000 + 900;
  audio.gong();
  S.flash = 0.6;
  cutin('加时赛', 1.2);
  setupProblem();
  return true;
}

async function endExtra() {
  const run = S.run;
  S.extra.over = true;
  S.ready = false;
  audio.gong();
  flySeal('时间到', { color: '#2455F5', y: 0.3, hold: 1000 });
  await wait(1500);
  if (run === S.run) showFinal();
}

function showFinal() {
  closeConfirm();
  const total = sc.BASIC_SCORE + S.extra.score;
  $('#f-break').textContent = `基本 ${sc.BASIC_SCORE} + 加时 ${S.extra.score}`;
  setStat('f-ok', S.extra.solved); setStat('f-ng', S.extra.misses); setStat('f-combo', S.maxCombo);
  $('#f-sweet').textContent = sc.fmtSweetValue(S.sweet);
  audio.musicGain(0.45, 0.6);
  restoreCrowd();
  showScreen('final');
  S.fwT = 0.9; S.cheerT = 2.6;
  resultEntrance('final', $('#f-stats'), $('#screen-final .actions'), null);
  const chest = prepareChest('extra');
  const acts = $('#screen-final .actions'); acts.inert = true;
  const run = S.run;
  later(still() ? 300 : 2300, async () => {
    if (run !== S.run || S.screen !== 'final') { acts.inert = false; return; }
    await showChest(chest);
    acts.inert = false;
    if (S.demo && run === S.run) later(400, finishDemo);
  });
  const el = $('#f-score');
  if (still()) el.textContent = total;
  else {
    let lastV = -1;
    tween(900 + Math.min(1200, S.extra.solved * 120), (k) => { const v = Math.round(lerp(0, total, k)); if (v !== lastV) { el.textContent = v; lastV = v; } }, easeOutCubic)
      .then(() => { audio.clear(1); const c = centerOf(el); fx.burst(c.x, c.y, { count: 50, kinds: ['confetti', 'star', 'coin'], speed: 700, up: 200 }); hero.celebrate(1, true); });
  }
}

function finishDemo() { S.demoDone = true; }

function toTitle() {
  S.run += 1;
  S.ready = false; S.mode = 'basic'; S.E = 0.04; S.combo = 0;
  S.perks = []; S.xp = 0; S.xpShown = 0; S.level = 1; S.levelUps = 0;
  showCombo(); applyLook(); renderPerkIcons(); updateXpBar(); updateCollectionCount();
  fx.clear();
  audio.stopMusic();
  clearCrowd();
  showClasses(0);
  closeConfirm();
  renderToday();
  showScreen('title');
  hero.resetFace();
}

// ---------------------------------------------------------------- 首页：今日小目标
function renderToday() {
  const d = store.loadDaily();
  $('#today-solved').textContent = d.solved;
  $('#today-combo').textContent = d.bestCombo;
  $('#today-streak').textContent = d.streak;
  $('#today-goal').textContent = d.solved >= store.DAILY_GOAL ? '今天的目标完成啦' : `答对 ${store.DAILY_GOAL} 题`;
  $('#today-fill').style.width = `${Math.min(100, (d.solved / store.DAILY_GOAL) * 100)}%`;
}
function updateStartSub() {
  $('#start-sub').textContent = `${P.grade || settings.grade}年级 · ${P.count || settings.count} 题 · 从易到难`;
}

// Tap the hero: a startled hop and a squeak (friends hop too on the title screen).
function pokeHero(e) {
  const c = hero.center; const dx = e.clientX - c.x; const dy = e.clientY - c.y;
  if (S.screen === 'play' && Math.hypot(dx, dy) > 70 * hero.S + 20) return;
  if (still() || hero.hopping) return;
  audio.unlock();
  audio.run((t) => { audio.pop(t, 0.14, 620); audio.bell(t + 0.06, 88, 0.07, 0.5); });
  hero.poke();
  if (S.screen === 'title') friends.forEach((m, i) => later(80 + 70 * i, () => { if (!m.hopping) m.hop(18, 280); }));
}
$('#title-stage').addEventListener('pointerdown', pokeHero);
stage.addEventListener('pointerdown', pokeHero);
$('#title-scroll').addEventListener('scroll', () => layoutActors(), { passive: true });

// ---------------------------------------------------------------- demo (?demo): plays by itself with a few slips
const DEMO = { next: 0, slipped: 0, repeat: 0 };
function demoTick(t) {
  if (!S.demo || S.screen !== 'play' || !S.ready || !S.problem || t < DEMO.next) return;
  const toks = nextTokens(S.problem.answers, S.typed);
  if (!toks.length) return;
  const r = S.demoRng;
  let key = toks[0];
  let slip = false;
  if (DEMO.repeat > 0 && S.cellMisses > 0) { DEMO.repeat -= 1; slip = true; } else {
    DEMO.repeat = 0;
    const room = S.mode === 'extra' || S.wrongInQ || DEMO.slipped < Math.floor(S.N * 0.2);
    slip = room && !S.shownWrong && S.cellMisses === 0 && r() < (S.mode === 'extra' ? 0.05 : 0.09);
    if (slip && S.mode !== 'extra' && !S.wrongInQ) { DEMO.slipped += 1; if (r() < 0.45) DEMO.repeat = 2; }
  }
  if (slip) { const wrong = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].filter((d) => !toks.includes(d)); key = wrong[Math.floor(r() * wrong.length)]; }
  press(key, padButtons[key]);
  DEMO.next = t + (slip ? 750 : (240 + r() * 300) * (S.mode === 'extra' ? 0.8 : 1));
}

// ---------------------------------------------------------------- jumps (?jump=finale|chest|extra|result)
function fakeBasic() {
  initSession();
  S.solved = S.N; S.firstTry = Math.max(Math.ceil(S.N * 0.8), S.N - 1); S.misses = 2; S.maxCombo = 3 * S.N;
  S.sweetL = Math.log10(1805); S.sweet = 1804; S.startT = gameNow() - 151000; S.endT = gameNow(); S.qi = S.N - 1;
  $$('.pip').forEach((p, i) => { p.classList.add('done'); p.style.setProperty('--c', ['#2455F5', '#FFD447', '#FF782D', '#7B4DFF'][Math.min(3, Math.floor((i / S.N) * 4))]); });
  updateTally(); updateSweet(false);
}
function fillSolved(p) {
  for (const c of p.cells) {
    const el = S.cells[c.id]; if (!el) continue;
    el.classList.remove('hidden', 'active');
    if (c.kind === 'input') { el.firstChild.textContent = c.text; el.classList.add('filled'); }
  }
  Object.values(S.lines).forEach((l) => l.classList.remove('hidden'));
}
// The audience as if n problems had been solved (merged by the rules, placed directly).
function fakeCrowd(n) {
  const b = buildCrowd(n, S.fillStart);
  S.members = b.list; S.nextId = b.nextId; S.memberCount = n;
  rebuildCrowd();
}
// Run fn once the current problem is ready for input.
function whenReady(fn) {
  const run = S.run;
  const t = setInterval(() => { if (run !== S.run) { clearInterval(t); return; } if (S.ready) { clearInterval(t); fn(); } }, 50);
}
function jump(name) {
  audio.unlock();
  if (name === 'result' || name === 'chest') {
    // ?jump=chest&tier=0..4 forces the tier; without it the fake round decides.
    fakeBasic();
    S.E = 1; S.visualE = 1; showClasses(1);
    layoutActors();
    fakeCrowd(S.N);
    showResult();
    return;
  }
  if (name === 'levelup') {
    // First problem on screen, the bar fills up: the 三选一 overlay opens.
    startGame();
    whenReady(() => { S.xpBase = pk.xpNeed(1) - pk.XP_BASIC; S.xp = S.xpBase; S.xpShown = S.xp; updateXpBar(); S.ready = false; settleXp().then(() => { S.ready = true; }); });
    return;
  }
  if (name === 'merge') {
    // Eight solved (two 中 and two 小 of one filling); the ninth sets off a chain up to 大.
    startGame();
    whenReady(() => { S.E = 0.6; S.visualE = 0.6; showClasses(0.6); fakeCrowd(8); later(2500, addCrowd); });
    return;
  }
  if (name === 'collection') { openCollection(); return; }
  if (name === 'extra') { fakeBasic(); startExtra(true); requestAnimationFrame(() => { layoutActors(); fakeCrowd(S.N); }); return; }
  if (name === 'finale') {
    fakeBasic();
    S.solved = S.N - 1; S.firstTry = S.N - 2; S.startT = gameNow() - 151000; S.endT = 0; updateTally();
    showScreen('play');
    const p = makeNext(S.plan[S.N - 1]);
    S.problems[S.N - 1] = p; S.problem = p; S.typed = p.answers[0].slice();
    $('#qtitle').textContent = p.title; $('#qno').textContent = `第${S.N}题`;
    const note = $('#note'); note.hidden = !p.note; note.textContent = p.note || '';
    renderPad(DIGIT_KEYS); renderSheet(p); fillSolved(p);
    S.E = 1; S.visualE = 0.95; updateE(); S.E = 1;
    audio.startMusic();
    requestAnimationFrame(() => {
      layoutActors();
      fakeCrowd(S.N - 1);
      S.solved = S.N; S.firstTry = S.N - 1; S.combo = 3 * S.N; updateTally(); showCombo();
      setLabel(`<span class="answer-text">${p.answerText}</span>`);
      $('#stamp').classList.add('show');
      later(300, finale);
    });
    return;
  }
  console.warn(`unknown jump ${name}`);
  startGame();
}

// ---------------------------------------------------------------- frame loop
// Elements and last-written values touched every frame (writes are skipped when nothing changed).
const DOMC = { actors: $('#actors'), flashEl: $('#flash'), clockEl: $('#clock'), clockBox: $('.clock'), off: '', flash: '', clock: '', hurry: false, kick: 0 };
onFrame((dt, t) => {
  S.visualE += (S.E - S.visualE) * Math.min(1, dt * 2.2);
  bg.E = S.warmE ?? (S.screen === 'title' ? 0 : S.screen === 'collection' ? 0.55 : S.visualE);
  bg.kick = audio.pulse();
  bg.motion = motion();
  bg.draw(dt);
  // Beat glow on the keypad (lv8 only): one variable on #pad, written only when it visibly changes.
  const kick = S.screen === 'play' && body.classList.contains('lv8') ? Math.round(bg.kick * motion() * 20) / 20 : 0;
  if (kick !== DOMC.kick) { DOMC.kick = kick; pad.style.setProperty('--kick', kick); }
  fx.motion = motion();
  fx.update(dt); fx.draw();
  hero.update(dt);
  for (const m of crowd) m.update(dt);
  for (const m of friends) m.update(dt);
  for (const m of extras) m.update(dt);
  if (!still() && dt > 0) {
    if (S.screen === 'title' && Math.random() < dt * 0.6) { const m = pick(friends); if (!m.hopping) m.hop(12 + rand(0, 14), 300); }
    if (S.screen === 'play') {
      // The audience starts jumping on its own once the show heats up.
      if (S.visualE > 0.6) for (const m of crowd) if (!m.hopping && !m.entering && !m.busy && Math.random() < dt * (S.visualE - 0.5) * 2.2) m.hop(10 + 34 * Math.min(1.5, S.visualE) * Math.random(), 320);
      // Full-score / extra round: keep confetti coming and a firework now and then (behind the card).
      if (S.visualE > 0.85 && Math.random() < dt * (S.visualE - 0.8) * 5) fx.rain(VP.w, 3, ['confetti', 'confetti', 'star', S.mode === 'extra' ? 'coin' : 'confetti']);
      if (S.mode === 'extra') { S.fwT -= dt; if (S.fwT <= 0) { S.fwT = 1.8 + rand(0, 1.6); fx.fireworks(VP.w, VP.h, 2, 0.05, 0.22); } }
    }
    if (S.screen === 'result' || S.screen === 'final') {
      // The card covers the lower half; fireworks burst in the band between the banner and the audience.
      const band = Math.max(0.12, ((S.resultCardTop || VP.h * 0.45) - 150 * hero.S) / VP.h);
      S.fwT -= dt; if (S.fwT <= 0) { S.fwT = 1.1 + rand(0, 1.3); fx.fireworks(VP.w, VP.h, chance(0.4) ? 2 : 1, 0.1, band); }
      if (Math.random() < dt * 1.2) fx.rain(VP.w, 4, ['confetti', 'confetti', 'star']);
      for (const m of crowd) if (!m.hopping && !m.entering && !m.busy && Math.random() < dt * 0.9) m.hop(12 + rand(0, 26), 320);
      S.cheerT -= dt;
      if (S.cheerT <= 0 && now() > S.busyUntil) { S.cheerT = 2.6 + rand(0, 2); hero.celebrate(0.8, chance(0.5)); }
    }
  }
  // Shake the stage and the actors only; the card and the keypad never move.
  S.shake = Math.max(0, S.shake - dt * 40);
  const k = S.shake * motion();
  const off = k > 0.2 ? `translate(${rand(-k, k).toFixed(1)}px, ${rand(-k, k).toFixed(1)}px)` : '';
  if (off !== DOMC.off) { DOMC.off = off; stage.style.transform = off; DOMC.actors.style.transform = off; }
  S.flash = Math.max(0, S.flash - dt * 2.5);
  const fl = (S.flash * motion() * 0.8).toFixed(2);
  if (fl !== DOMC.flash) { DOMC.flash = fl; DOMC.flashEl.style.opacity = fl; DOMC.flashEl.style.visibility = fl === '0.00' ? 'hidden' : ''; }
  // Clock (text written only when it changes).
  if (S.screen === 'play') {
    let txt;
    if (S.mode === 'extra') {
      const left = S.extra.endAt - gameNow();
      const secs = Math.ceil(Math.max(0, left) / 1000);
      txt = sc.fmtTime(Math.min(sc.EXTRA_SECONDS * 1000, Math.max(0, left) + 999));
      const hurry = left < 10000;
      if (hurry !== DOMC.hurry) { DOMC.hurry = hurry; DOMC.clockBox.classList.toggle('hurry', hurry); }
      if (left < 10500 && secs !== S.lastTick && secs > 0 && !S.extra.over) { S.lastTick = secs; audio.tick(secs <= 3); }
      if (left <= 0 && !S.extra.over) endExtra();
    } else {
      txt = sc.fmtTime((S.endT || gameNow()) - S.startT);
    }
    if (txt !== DOMC.clock) { DOMC.clock = txt; DOMC.clockEl.textContent = txt; }
  }
  audio.update();
  demoTick(t);
});

// ?fps: frame statistics in the corner (FPS, p95 frame time, p95 script time per frame, particles, quality).
if (params.has('fps')) {
  const box = document.createElement('div'); box.id = 'fps'; box.setAttribute('aria-hidden', 'true'); document.body.appendChild(box);
  setInterval(() => { const f = frameStats(); box.textContent = `FPS ${f.fps.toFixed(0)} · p95 ${f.p95.toFixed(1)}ms · JS ${f.workP95.toFixed(1)}ms · 粒子 ${fx.parts.length} · 画质 ${window.__quality ?? 0}`; }, 500);
}

addEventListener('resize', () => { fitSheet(); alignLabel(); requestAnimationFrame(layoutActors); });
// The card grows when a two-line hint appears: keep the hero standing on the (smaller) stage.
if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (S.screen === 'play') layoutActors(); }).observe(stage);

// ---------------------------------------------------------------- UI wiring
function toast(msg, ms = 2600) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, ms);
}

function setGrade(g, persist = true) {
  if (persist) { settings.grade = g; store.saveSettings(settings); }
  $$('.grade-pick button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.grade) === g)));
  updateStartSub();
}
function setCount(n) {
  settings.count = n; store.saveSettings(settings);
  $$('.pick [data-count]').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.count) === n)));
  updateStartSub();
}
function setSound(on) {
  settings.sound = on; store.saveSettings(settings);
  audio.setMuted(!on);
  $('#sound-toggle').setAttribute('aria-pressed', String(on)); $('#sound-toggle').textContent = on ? '开' : '关';
  $('#mute').setAttribute('aria-pressed', String(!on));
}
function setMotion(v) {
  settings.motion = clamp(v); store.saveSettings(settings);
  $('#motion').value = Math.round(settings.motion * 100);
  $('#motion-val').textContent = `${Math.round(settings.motion * 100)}%`;
  body.classList.toggle('still', still());
}

$$('.grade-pick button').forEach((b) => b.addEventListener('click', () => {
  audio.unlock(); P.grade = null; setGrade(Number(b.dataset.grade));
  audio.run((t) => audio.blip(t, 76 + Number(b.dataset.grade) * 2, 0.1));
  if (!still() && !hero.hopping) hero.hop(14, 260);
}));
$('#start').addEventListener('click', () => startGame());
$('#open-settings').addEventListener('click', openSettings);
$('#close-settings').addEventListener('click', closeSettings);
$$('.pick [data-count]').forEach((b) => b.addEventListener('click', () => { P.count = null; setCount(Number(b.dataset.count)); }));
$('#sound-toggle').addEventListener('click', () => { audio.unlock(); setSound(!settings.sound); });
$('#volume').addEventListener('input', (e) => { settings.volume = Number(e.target.value) / 100; audio.setVolume(settings.volume); store.saveSettings(settings); });
$('#motion').addEventListener('input', (e) => setMotion(Number(e.target.value) / 100));
$('#mute').addEventListener('click', () => { audio.unlock(); setSound(!settings.sound); });
$('#home').addEventListener('click', openConfirm);
$('#confirm-no').addEventListener('click', closeConfirm);
$('#confirm-yes').addEventListener('click', () => { S.demo = false; toTitle(); });
$('#go-extra').addEventListener('click', () => startExtra());
$('#go-again').addEventListener('click', () => startGame());
$('#go-title').addEventListener('click', toTitle);
$('#f-again').addEventListener('click', () => startGame());
$('#f-title').addEventListener('click', toTitle);
$('#open-collection').addEventListener('click', () => { audio.unlock(); openCollection(); });
$('#col-back').addEventListener('click', toTitle);
$('#col-stage').addEventListener('pointerdown', pokeHero);
$('#col-scroll').addEventListener('scroll', () => layoutActors(), { passive: true });

// ---------------------------------------------------------------- 收藏页
function openCollection() {
  renderCollection(COL, pickItem);
  showScreen('collection');
  hero.resetFace();
}
// Put on / use an item; the choice is saved and used in the game right away.
function pickItem(id) {
  const it = col.ITEM[id]; if (!it) return;
  COL = col.equip(COL, id);
  store.saveCollection(COL);
  applyLook();
  renderCollection(COL, pickItem);
  audio.unlock();
  if (it.cat === 'sound') audio.run(() => { [1, 3, 5, 8].forEach((c, i) => later(110 * i, () => audio.ding(c, it.id, 0.12))); });
  else audio.run((t) => { audio.pop(t, 0.12, 700); audio.bell(t + 0.05, 91, 0.08, 0.6); });
  if (!still()) { hero.celebrate(0.5); if (it.cat === 'gem') { const c = hero.headTop; fx.gemStyle = COL.equip.gem; for (let i = 0; i < 5; i++) fx.dropGem(c.x + rand(-40, 40), c.y, c.y + 110, c.x - 110, c.x + 110, {}); later(900, () => { const t = hero.center; fx.magnet(t.x, t.y - 20); }); } }
}

function openSettings() { S.settingsOpen = true; $('#settings').hidden = false; $('#close-settings').focus(); }
function closeSettings() { S.settingsOpen = false; $('#settings').hidden = true; }
// While "回到首页？" is open the game is paused: virtual time stops, so the extra-round countdown,
// the carrying hand and any pending timers wait for the answer.
function openConfirm() {
  if (S.screen !== 'play') { toTitle(); return; }
  S.confirmOpen = true; $('#confirm').hidden = false; $('#confirm-no').focus();
  if (!isPaused()) { setPaused(true); S.confirmPaused = true; audio.musicGain(0.25, 0.2); }
}
function closeConfirm() {
  if (S.confirmPaused) { S.confirmPaused = false; setPaused(false); if (S.screen === 'play') audio.musicGain(S.mode === 'extra' ? 0.8 : 0.75, 0.2); }
  S.confirmOpen = false; $('#confirm').hidden = true;
}

addEventListener('pointerdown', () => { audio.unlock(); if (S.screen === 'play') audio.startMusic(); }, { capture: true });
addEventListener('keydown', (e) => {
  audio.unlock();
  if (S.levelOpen || S.chestOpen) return;
  if (e.key === 'Escape') {
    if (S.settingsOpen) closeSettings(); else if (S.confirmOpen) closeConfirm(); else if (S.demo) { S.demo = false; toast('自动演示已停止'); } else if (S.screen === 'play') openConfirm(); else if (S.screen === 'collection') toTitle();
    return;
  }
  if (S.screen === 'title' && e.key === 'Enter' && !S.settingsOpen) {
    const a = document.activeElement;
    // Enter on a grade button starts with that grade; other focused buttons handle Enter themselves.
    if (a && a.closest && a.closest('.grade-pick')) { e.preventDefault(); startGame(); return; }
    if (a?.tagName !== 'BUTTON') { startGame(); return; }
  }
  if (S.screen !== 'play' || S.demo) return;
  if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); press('Backspace'); }
});

// Bunting flags hanging from the curve M0 4 Q200 30 400 4 (two strings: the second one near the peak).
function drawFlags(sel, shift) {
  const cols = ['#FF782D', '#2455F5', '#FFD447', '#7B4DFF', '#FF8FB1', '#3FB860'];
  let html = '';
  const n = 13;
  for (let i = 0; i < n; i++) {
    const t0 = (i + 0.15) / n; const t1 = (i + 0.85) / n; const tm = (t0 + t1) / 2;
    const y = (t) => 4 + 2 * (1 - t) * t * 26;
    const x0 = 400 * t0; const x1 = 400 * t1; const xm = 400 * tm;
    html += `<path d="M${x0.toFixed(1)} ${y(t0).toFixed(1)} L${x1.toFixed(1)} ${y(t1).toFixed(1)} L${xm.toFixed(1)} ${(y(tm) + 16).toFixed(1)}Z" fill="${cols[(i + shift) % cols.length]}" stroke="#172754" stroke-width="2" stroke-linejoin="round"/>`;
  }
  $(sel).innerHTML = html;
}
drawFlags('#flags', 0);
drawFlags('#flags2', 3);
drawFlags('#screen-result .rflags', 1);
drawFlags('#screen-final .rflags', 4);

// Logo bursts: a yellow 16-point star with a pink 12-point star inside.
(function drawBurst() {
  const star = (n, R, r) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; const rr = i % 2 ? r : R; d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(1)} ${(Math.sin(a) * rr).toFixed(1)}`; } return `${d}Z`; };
  $('#burst-outer').setAttribute('d', star(16, 104, 78));
  $('#burst-inner').setAttribute('d', star(12, 74, 56));
  $('#burst-inner').setAttribute('fill', '#FF9EC0');
}());

// ---------------------------------------------------------------- debug API for the playtest agent
window.__game = {
  get state() {
    return {
      screen: S.screen, mode: S.mode, grade: S.grade, count: S.N, seed: S.seed, skill: S.onlySkill,
      qi: S.qi, problemNo: S.mode === 'extra' ? S.extra.solved + 1 : S.qi + 1, step: S.typed.length, ready: S.ready,
      combo: S.combo, maxCombo: S.maxCombo, solved: S.solved, firstTry: S.firstTry, misses: S.misses,
      firstTryRate: S.N ? S.firstTry / S.N : 0, extraUnlocked: sc.extraUnlocked(S.firstTry, S.N),
      sweetness: S.sweet, sweetnessText: sc.fmtSweetValue(S.sweet),
      E: Number(S.E.toFixed(3)), visualE: Number(S.visualE.toFixed(3)),
      cellMisses: S.cellMisses, hintLevel: S.hintLevel, wrongShown: S.shownWrong,
      extra: { ...S.extra, leftMs: S.mode === 'extra' ? Math.max(0, Math.round(S.extra.endAt - gameNow())) : null },
      score: sc.BASIC_SCORE + (S.extra.score || 0), crowd: crowd.length, today: store.loadDaily(),
      demo: S.demo, demoDone: S.demoDone, speed: SPEED, motion: settings.motion, webgl: !!bg.gl, audio: audio.ok,
      time: Math.round(now()), gameTime: Math.round(gameNow()), particles: fx.parts.length, quality: window.__quality ?? 0,
      // M2
      xp: Number(S.xp.toFixed(2)), xpShown: Number(S.xpShown.toFixed(2)), level: S.level, levelUps: S.levelUps, perks: S.perks.slice(),
      comboMult: sc.COMBO_MULTS[sc.comboTier(S.combo, S.perks.includes('early'))],
      members: S.members.map((m) => ({ id: m.id, filling: FILLINGS[m.f].name, level: ['小', '中', '大', '金'][m.lv] })),
      chestTier: S.chestTier, lastChest: S.lastChest,
      collection: { owned: COL.owned.slice(), equip: { ...COL.equip }, opened: COL.opened },
      overlay: S.levelOpen ? 'levelup' : S.chestOpen ? 'chest' : null,
    };
  },
  get problem() {
    const p = S.problem; if (!p) return null;
    const st = p.steps[S.typed.length];
    return { ...summarize(p), typed: S.typed.slice(), step: S.typed.length, stepLabel: st?.label || null, next: nextTokens(p.answers, S.typed), method: st?.help.method || null, hint: st?.help.text || null };
  },
  get answers() { return S.problem ? S.problem.answers.map((a) => a.slice()) : []; },
  plan() { return S.plan.slice(); },
  generate(skillId, n = 10, seed = 1) { return generate(skillId, n, seed).map(summarize); },
  skills: SKILLS.map((s) => ({ id: s.id, name: s.name, short: s.short, grade: s.grade, semester: s.sem === 'a' ? '上册' : '下册', system: s.sys, req: s.req.slice(), input: INPUT[s.input] })),
  press(key) { press(String(key), padButtons[String(key)]); },
  solveStep() { const t = S.problem && nextTokens(S.problem.answers, S.typed)[0]; if (t !== undefined) press(t, padButtons[t]); return t; },
  wrongStep() { const toks = S.problem ? nextTokens(S.problem.answers, S.typed) : []; const w = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].find((d) => !toks.includes(d)); if (w) press(w, padButtons[w]); return w; },
  start: () => startGame(),
  // Like the button: refused below 80% first-try unless force is true.
  startExtra: (force = false) => startExtra(force),
  toTitle: () => toTitle(),
  jump: (name) => jump(name),
  setDemo(on) { S.demo = !!on; },
  poke() { pokeHero({ clientX: hero.center.x, clientY: hero.center.y }); },
  // Freeze / resume virtual time (for screenshots of exact moments). freezeAfter(ms) runs ms of game time, then freezes.
  freeze() { setPaused(true); },
  unfreeze() { setPaused(false); },
  get frozen() { return isPaused(); },
  freezeAfter(ms) { setPaused(false); return new Promise((res) => later(ms, () => { setPaused(true); res(Math.round(now())); })); },
  // M2: the pure rules, exposed for the playtester to check determinism.
  chestTier, chestGoals,
  nextReward: (tier, owned = COL.owned) => col.nextReward(tier, owned),
  perkChoices: (levelIndex, taken = []) => pk.perkChoices(levelIndex, taken).map((p) => p.id),
  buildCrowd: (n, start = 0) => buildCrowd(n, start).list.map((m) => ({ filling: FILLINGS[m.f].name, level: ['小', '中', '大', '金'][m.lv] })),
  levelOf: (xp) => pk.levelOf(xp),
  // Pick a perk card on the open 三选一 overlay (0, 1, 2).
  pickPerk(i = 0) { const c = document.querySelectorAll('#lu-cards .lu-card')[i]; if (c) c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); },
  // Debug only (writes localStorage): own every item / start from nothing.
  grantAll() { let c = COL; for (const it of col.ITEMS) c = col.grant(c, it); c.opened = COL.opened; COL = c; store.saveCollection(COL); updateCollectionCount(); if (S.screen === 'collection') renderCollection(COL, pickItem); return COL.owned.length; },
  resetCollection() { COL = col.emptyCollection(); store.saveCollection(COL); applyLook(); updateCollectionCount(); if (S.screen === 'collection') renderCollection(COL, pickItem); },
  equip(id) { pickItem(id); return { ...COL.equip }; },
  // One more audience member now (as if a problem was solved): shows the merge rules at work.
  addAudience() { addCrowd(); return S.members.map((m) => ({ filling: FILLINGS[m.f].name, level: ['小', '中', '大', '金'][m.lv] })); },
};

// Audio starts on the first touch or key anywhere (creating the AudioContext takes ~100 ms on some
// machines; better on the title screen than on the first digit).
addEventListener('pointerdown', () => audio.unlock(), { once: true, capture: true });
addEventListener('keydown', () => audio.unlock(), { once: true, capture: true });

// ---------------------------------------------------------------- boot
setGrade(P.grade || settings.grade, false);
setCount(settings.count);
setSound(settings.sound);
audio.setVolume(settings.volume); $('#volume').value = Math.round(settings.volume * 100);
setMotion(settings.motion);
renderPad(DIGIT_KEYS);
renderToday();
applyLook(); updateCollectionCount(); updateXpBar(); renderPerkIcons(); updateSweet(false);
requestAnimationFrame(layoutActors);
// Warm-up on the idle title screen: particle sprites, a text float, a cut-in banner and a seal are
// drawn once (almost invisible), so their first real use mid-game does not stall a frame while the
// GPU prepares shaders and glyphs.
// Each step runs in its own frame (together they cost one long frame on a cold start).
async function prewarm() {
  fx.prewarm();
  await nextFrame(); warmChest();
  await nextFrame();
  const box = $('#cutins');
  const band = document.createElement('div'); band.className = 'cutin'; band.style.cssText = 'top:0;height:60px;opacity:.004';
  band.innerHTML = '<div class="band" style="--c1:#2455F5;--c2:#FF782D"></div><div class="txt" style="font-size:34px">第10题 最后一题 加时 时间到</div>';
  const seal = document.createElement('div'); seal.className = 'seal seal-fly'; seal.style.cssText = 'left:0;top:80px;opacity:.004'; seal.textContent = '100分 时间到';
  box.append(band, seal);
  setTimeout(() => { band.remove(); seal.remove(); }, 250);
}
// Warm-up pass (about 8 frames): every screen and show level is drawn once, nearly transparent,
// over the title, and the backdrop runs through its palettes. The GPU compiles and rasterizes what
// they need now instead of stalling a frame the first time they appear mid-game.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function warmup() {
  const cls = ['warm', 'show-bunting', 'show-bunting2', 'lv-marquee', 'lv6', 'lv8'];
  body.classList.add(...cls);
  for (const [E, dark] of [[0.5, false], [1, false], [1.3, true], [1.3, true]]) {
    S.warmE = E; body.classList.toggle('dark-bg', dark);
    await nextFrame(); await nextFrame();
  }
  S.warmE = null;
  body.classList.remove(...cls, 'dark-bg');
  showClasses(S.E);
}
(document.fonts?.ready || Promise.resolve()).then(async () => {
  await nextFrame(); await prewarm();
  if (!P.jump) await warmup();
  // The sound graph (reverb impulse, noise buffer: ~8 ms, ~30 ms on a slow phone) is built now,
  // on the idle title, instead of inside the first tap.
  (window.requestIdleCallback || setTimeout)(() => audio.prepare());
  if (P.jump) jump(P.jump); else if (P.demo) startGame();
});
