// Drawings for M2: outfit parts for the 汤圆 (SVG, in its local coordinates: feet at 0,0, body
// top at about -89, eyes at y -50), collection icons, gem shapes for the canvas and the 蒸笼.
const INK = '#172754';

// ---------------------------------------------------------------- outfits
// Each part: svg markup and, for hats, where the steam starts (it rises from the top of the hat).
function scarf(colors) {
  const bands = colors.length; let s = '';
  const top = (i) => -25 + (i * 13) / bands; const bot = (i) => -25 + ((i + 1) * 13) / bands;
  for (let i = 0; i < bands; i++) s += `<path d="M-46 ${top(i)} Q0 ${top(i) + 15} 46 ${top(i)} L45 ${bot(i)} Q0 ${bot(i) + 15} -45 ${bot(i)} Z" fill="${colors[i]}"/>`;
  return `<g class="o-neck">${s}<path d="M-46 -25 Q0 -10 46 -25 L45 -12 Q0 3 -45 -12 Z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M20 -12 L25 2 L37 -1 L32 -15 Z" fill="${colors[0]}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M23 -5 L34 -8" stroke="${colors[Math.min(1, bands - 1)] === colors[0] ? '#fff' : colors[Math.min(2, bands - 1)]}" stroke-width="2.4" stroke-linecap="round"/></g>`;
}
function glasses(dark) {
  const lens = dark ? `fill="${INK}" fill-opacity=".88"` : 'fill="#FFFFFF" fill-opacity=".28"';
  return `<g class="o-face" stroke="${INK}" stroke-width="3" stroke-linecap="round">
    <circle cx="-15" cy="-50" r="11" ${lens}/><circle cx="15" cy="-50" r="11" ${lens}/>
    <path d="M-4 -52 Q0 -56 4 -52" fill="none"/><path d="M-26 -52 L-40 -57 M26 -52 L40 -57" fill="none"/>
    ${dark ? '<path d="M-20 -55 L-14 -58 M10 -55 L16 -58" stroke="#fff" stroke-width="2.2" opacity=".85"/>' : ''}</g>`;
}
export const OUTFIT = {
  'scarf-red': { slot: 'neck', svg: scarf(['#E8412F', '#E8412F', '#E8412F']) },
  'scarf-rainbow': { slot: 'neck', svg: scarf(['#FF5A6E', '#FF9A3D', '#FFD447', '#3FB860', '#2E8BFF', '#8B4DFF']) },
  glasses: { slot: 'face', svg: glasses(false) },
  shades: { slot: 'face', svg: glasses(true) },
  'cap-blue': {
    slot: 'head', steam: [0, -113],
    svg: `<g class="o-head"><path d="M-39 -79 Q-37 -113 0 -113 Q37 -113 39 -79 Z" fill="#2455F5" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M-8 -111 Q-12 -95 -10 -80 M10 -111 Q13 -95 11 -80" fill="none" stroke="#1B3FC4" stroke-width="2.4"/>
      <path d="M-2 -82 Q34 -90 62 -78 Q44 -69 -2 -76 Z" fill="#1B3FC4" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/>
      <circle cx="0" cy="-113" r="4" fill="#FFD447" stroke="${INK}" stroke-width="2.4"/></g>`,
  },
  'hat-magic': {
    slot: 'head', steam: [10, -152],
    svg: `<g class="o-head"><path d="M-33 -80 Q-14 -112 10 -152 Q20 -114 33 -80 Z" fill="#7B4DFF" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <ellipse cx="0" cy="-80" rx="45" ry="9" fill="#6232E0" stroke="${INK}" stroke-width="3.2"/>
      <path d="M-13 -99 l2.5 5 5.5 .8 -4 3.8 1 5.4 -5 -2.6 -5 2.6 1 -5.4 -4 -3.8 5.5 -.8Z" fill="#FFD447" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="10" cy="-118" r="3" fill="#FFD447"/><circle cx="14" cy="-94" r="2.4" fill="#FFD447"/></g>`,
  },
  crown: {
    slot: 'head', steam: [0, -112],
    svg: `<g class="o-head"><path d="M-31 -80 L-33 -106 L-16 -93 L0 -113 L16 -93 L33 -106 L31 -80 Z" fill="#FFD447" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>
      <path d="M-29 -86 L29 -86" stroke="#E8A317" stroke-width="3"/><circle cx="0" cy="-94" r="4.2" fill="#E8412F" stroke="${INK}" stroke-width="2"/>
      <circle cx="-18" cy="-88" r="3" fill="#2E8BFF" stroke="${INK}" stroke-width="1.8"/><circle cx="18" cy="-88" r="3" fill="#3FB860" stroke="${INK}" stroke-width="1.8"/>
      <circle cx="-33" cy="-106" r="3" fill="#FFF3A0" stroke="${INK}" stroke-width="1.8"/><circle cx="33" cy="-106" r="3" fill="#FFF3A0" stroke="${INK}" stroke-width="1.8"/><circle cx="0" cy="-113" r="3.4" fill="#FFF3A0" stroke="${INK}" stroke-width="1.8"/></g>`,
  },
};

// ---------------------------------------------------------------- 背景主题 (palettes, see bg.js)
export const THEMES = {
  'bg-rays': null, // the default key points in bg.js
  'bg-sea': [
    { E: 0, base: '#EAFBFF', a: '#DDF5FF', b: '#CDEEFF', ray: 0.0, grid: 1, blob: 1 },
    { E: 0.5, base: '#E2F6FF', a: '#2EC4F2', b: '#2455F5', ray: 0.34, grid: 0.25, blob: 0.55 },
    { E: 1.0, base: '#EFFFF8', a: '#3FE0C5', b: '#2F7BFF', ray: 0.52, grid: 0, blob: 0.15 },
    { E: 1.25, base: '#062A4F', a: '#0B3D6E', b: '#2EF2FF', ray: 0.42, grid: 0, blob: 0 },
  ],
  'bg-night': [
    { E: 0, base: '#EFEBFF', a: '#E6E0FF', b: '#DCD4FF', ray: 0.0, grid: 1, blob: 1 },
    { E: 0.5, base: '#E4DEFF', a: '#6B55E0', b: '#2B3FB0', ray: 0.34, grid: 0.25, blob: 0.55 },
    { E: 1.0, base: '#E9E2FF', a: '#8B3DFF', b: '#FFD447', ray: 0.55, grid: 0, blob: 0.15 },
    { E: 1.25, base: '#0B0F33', a: '#1C1F5C', b: '#FFD447', ray: 0.4, grid: 0, blob: 0 },
  ],
  'bg-candy': [
    { E: 0, base: '#FFF1F7', a: '#FFE6F1', b: '#FFDCEB', ray: 0.0, grid: 1, blob: 1 },
    { E: 0.5, base: '#FFE8F2', a: '#FF8FB8', b: '#5ED9C1', ray: 0.36, grid: 0.25, blob: 0.55 },
    { E: 1.0, base: '#FFF8D8', a: '#FF5DA2', b: '#4FC8FF', ray: 0.55, grid: 0, blob: 0.15 },
    { E: 1.25, base: '#3A1250', a: '#5A1E73', b: '#FF5DA2', ray: 0.42, grid: 0, blob: 0 },
  ],
};
const DEFAULT_RAYS = ['#FFE9DC', '#FF782D', '#7B4DFF'];

// ---------------------------------------------------------------- 宝石 (canvas shapes, CSS px, centred)
export const GEMS = {
  'gem-sapphire': (c) => { c.beginPath(); c.moveTo(0, -9); c.lineTo(8, -2); c.lineTo(0, 10); c.lineTo(-8, -2); c.closePath(); c.fillStyle = '#3D8BFF'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); c.beginPath(); c.moveTo(-8, -2); c.lineTo(8, -2); c.moveTo(0, -9); c.lineTo(-3, -2); c.lineTo(0, 10); c.strokeStyle = '#BFE0FF'; c.lineWidth = 1.2; c.stroke(); },
  'gem-star': (c) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; const r = i % 2 ? 4.2 : 9.5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fillStyle = '#FFD447'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); },
  'gem-amethyst': (c) => { c.beginPath(); c.moveTo(0, -10); c.lineTo(7, -4); c.lineTo(7, 5); c.lineTo(0, 10); c.lineTo(-7, 5); c.lineTo(-7, -4); c.closePath(); c.fillStyle = '#9B5CFF'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); c.beginPath(); c.moveTo(-3, -5); c.lineTo(-3, 4); c.strokeStyle = '#E3D2FF'; c.lineWidth = 2; c.stroke(); },
  'gem-coin': (c) => { c.beginPath(); c.arc(0, 0, 8.5, 0, Math.PI * 2); c.fillStyle = '#FFD447'; c.fill(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); c.fillStyle = '#FFF3A0'; c.fillRect(-1.6, -4.5, 3.2, 9); },
};
export const GEM_TRAIL = { 'gem-sapphire': '#8FC2FF', 'gem-star': '#FFE38A', 'gem-amethyst': '#C9A6FF', 'gem-coin': '#FFE38A' };

// ---------------------------------------------------------------- collection icons (SVG markup)
const SOUND_ICON = {
  'snd-ding': `<path d="M24 12 C16 12 14 20 14 27 L10 34 H38 L34 27 C34 20 32 12 24 12Z" fill="#FFD447" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cx="24" cy="37" r="3.4" fill="${INK}"/>`,
  'snd-marimba': `<rect x="8" y="14" width="7" height="22" rx="2" fill="#FF8FB8" stroke="${INK}" stroke-width="2.2"/><rect x="17" y="17" width="7" height="19" rx="2" fill="#FFD447" stroke="${INK}" stroke-width="2.2"/><rect x="26" y="20" width="7" height="16" rx="2" fill="#8FE8C4" stroke="${INK}" stroke-width="2.2"/><rect x="35" y="23" width="6" height="13" rx="2" fill="#A9C1FF" stroke="${INK}" stroke-width="2.2"/>`,
  'snd-gong': `<circle cx="24" cy="25" r="13" fill="#F2B63B" stroke="${INK}" stroke-width="2.6"/><circle cx="24" cy="25" r="5" fill="#FFE38A" stroke="${INK}" stroke-width="2"/><path d="M12 8 L36 8" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M16 8 L19 13 M32 8 L29 13" stroke="${INK}" stroke-width="2.2"/>`,
  'snd-musicbox': `<rect x="9" y="22" width="30" height="16" rx="3" fill="#FF9EC0" stroke="${INK}" stroke-width="2.4"/><path d="M9 22 L13 13 H35 L39 22" fill="#FFC6DA" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M40 28 h5" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path d="M20 10 v-5 h7" fill="none" stroke="${INK}" stroke-width="2.2"/><circle cx="18" cy="11" r="2.6" fill="${INK}"/>`,
};

function gemIcon(id) {
  const shapes = {
    'gem-sapphire': `<path d="M24 11 L37 22 L24 40 L11 22Z" fill="#3D8BFF" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M11 22 H37 M24 11 L19 22 L24 40" fill="none" stroke="#BFE0FF" stroke-width="2"/>`,
    'gem-star': `<path d="M24 8 L28.7 18.6 L40 19.6 L31.4 27.2 L34 38.5 L24 32.5 L14 38.5 L16.6 27.2 L8 19.6 L19.3 18.6Z" fill="#FFD447" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`,
    'gem-amethyst': `<path d="M24 9 L35 17 V31 L24 39 L13 31 V17Z" fill="#9B5CFF" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><path d="M19 16 V31" stroke="#E3D2FF" stroke-width="3" stroke-linecap="round"/>`,
    'gem-coin': `<circle cx="24" cy="24" r="14" fill="#FFD447" stroke="${INK}" stroke-width="2.8"/><rect x="21.5" y="16" width="5" height="16" rx="1.5" fill="#FFF3A0"/>`,
  };
  return shapes[id];
}

function themeIcon(id) {
  const k = THEMES[id]; const [base, a, b] = k ? [k[1].base, k[1].a, k[1].b] : DEFAULT_RAYS;
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * Math.PI * 2; const a1 = ((i + 0.5) / 12) * Math.PI * 2;
    rays += `<path d="M24 26 L${(24 + Math.cos(a0) * 40).toFixed(1)} ${(26 + Math.sin(a0) * 40).toFixed(1)} L${(24 + Math.cos(a1) * 40).toFixed(1)} ${(26 + Math.sin(a1) * 40).toFixed(1)}Z" fill="${i % 2 ? a : b}" opacity=".85"/>`;
  }
  const extra = id === 'bg-night' ? '<circle cx="14" cy="14" r="1.8" fill="#FFF"/><circle cx="35" cy="11" r="1.4" fill="#FFF"/><circle cx="38" cy="33" r="1.6" fill="#FFF"/>' : id === 'bg-candy' ? '<circle cx="13" cy="35" r="4" fill="#FF5DA2" stroke="#172754" stroke-width="1.6"/><circle cx="36" cy="13" r="3.4" fill="#58D8FF" stroke="#172754" stroke-width="1.6"/>' : id === 'bg-sea' ? '<path d="M6 38 Q12 34 18 38 T30 38 T42 38" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>' : '';
  return `<clipPath id="clip-${id}"><rect x="4" y="6" width="40" height="36" rx="8"/></clipPath><g clip-path="url(#clip-${id})"><rect x="4" y="6" width="40" height="36" fill="${base}"/>${rays}${extra}</g><rect x="4" y="6" width="40" height="36" rx="8" fill="none" stroke="${INK}" stroke-width="2.6"/>`;
}

// Icon for an item (outfits are drawn by the caller with a small 汤圆 wearing them).
export function itemIcon(item) {
  if (item.cat === 'gem') return `<svg viewBox="0 0 48 48" aria-hidden="true">${gemIcon(item.id)}</svg>`;
  if (item.cat === 'sound') return `<svg viewBox="0 0 48 48" aria-hidden="true">${SOUND_ICON[item.id]}</svg>`;
  if (item.cat === 'bg') return `<svg viewBox="0 0 48 48" aria-hidden="true">${themeIcon(item.id)}</svg>`;
  return '';
}

// ---------------------------------------------------------------- 蒸笼 (steamer chest)
export const STEAMER_SVG = `<svg class="steamer" viewBox="-110 -120 220 190" aria-hidden="true">
  <ellipse cx="0" cy="58" rx="96" ry="10" fill="rgba(23,39,84,.25)"/>
  <g class="st-base">
    <path d="M-92 -8 H92 V40 Q92 54 76 54 H-76 Q-92 54 -92 40 Z" fill="#E9C27A" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M-92 8 H92 M-92 28 H92" stroke="#B98A3E" stroke-width="3.2"/>
    <path d="M-60 -8 V54 M-20 -8 V54 M20 -8 V54 M60 -8 V54" stroke="#C99A4E" stroke-width="2.4" opacity=".7"/>
    <path d="M-98 -12 H98 V-2 H-98Z" fill="#D8A95A" stroke="${INK}" stroke-width="4.4" stroke-linejoin="round"/>
  </g>
  <g class="st-lid">
    <path d="M-96 -14 Q-96 -74 0 -80 Q96 -74 96 -14 Z" fill="#F2D089" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M-80 -30 Q0 -44 80 -30 M-64 -54 Q0 -66 64 -54" fill="none" stroke="#C99A4E" stroke-width="3" stroke-linecap="round"/>
    <path d="M-40 -74 Q-46 -44 -50 -16 M0 -80 V-16 M40 -74 Q46 -44 50 -16" fill="none" stroke="#C99A4E" stroke-width="2.4" opacity=".8"/>
    <rect x="-16" y="-94" width="32" height="16" rx="7" fill="#D8A95A" stroke="${INK}" stroke-width="4.4"/>
    <path d="M-98 -16 H98" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>
  </g>
</svg>`;
