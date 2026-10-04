// Mesin desain: teks -> path vektor (opentype.js), palet, dan render SVG -> PNG (resvg).
const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const { Resvg } = require('@resvg/resvg-js');

const nm = (pkg, weight, file) => path.join(__dirname, '..', '..', 'node_modules', '@expo-google-fonts', pkg, weight, file);
const FONT_FILES = {
  serifBold: nm('playfair-display', '700Bold', 'PlayfairDisplay_700Bold.ttf'),
  serifBlack: nm('playfair-display', '900Black', 'PlayfairDisplay_900Black.ttf'),
  cinzel: nm('cinzel', '700Bold', 'Cinzel_700Bold.ttf'),
  cinzelMed: nm('cinzel', '500Medium', 'Cinzel_500Medium.ttf'),
  sansXB: nm('montserrat', '800ExtraBold', 'Montserrat_800ExtraBold.ttf'),
  sansB: nm('montserrat', '700Bold', 'Montserrat_700Bold.ttf'),
  sansM: nm('montserrat', '500Medium', 'Montserrat_500Medium.ttf'),
  sansR: nm('montserrat', '400Regular', 'Montserrat_400Regular.ttf'),
};
const fonts = {};
const font = key => {
  if (!fonts[key]) {
    const buf = fs.readFileSync(FONT_FILES[key]);
    fonts[key] = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  }
  return fonts[key];
};

// ---------- Teks ----------
// Hapus karakter yang tidak ada di font supaya tidak muncul kotak kosong
function clean(str, key = 'sansB') {
  const f = font(key);
  return [...String(str ?? '')].filter(ch => ch === ' ' || f.charToGlyphIndex(ch) !== 0).join('').replace(/\s+/g, ' ').trim();
}

function layout(key, str, size, tracking = 0) {
  const f = font(key);
  const glyphs = f.stringToGlyphs(str);
  const scale = size / f.unitsPerEm;
  let x = 0;
  const items = glyphs.map((g, i) => {
    const item = { g, x };
    let adv = (g.advanceWidth || 0) * scale;
    if (i < glyphs.length - 1) adv += f.getKerningValue(g, glyphs[i + 1]) * scale;
    x += adv + tracking * size;
    return item;
  });
  return { items, width: Math.max(0, x - (glyphs.length ? tracking * size : 0)) };
}

const textWidth = (key, str, size, tracking = 0) => layout(key, str, size, tracking).width;
// Perkecil ukuran agar muat dalam lebar maksimum
const fitSize = (key, str, maxW, size, tracking = 0) => {
  const w = textWidth(key, str, size, tracking);
  return w > maxW ? (size * maxW) / w : size;
};

// Mengembalikan <path> dengan teks sebagai outline. anchor: start | middle | end
function text(key, str, { x, y, size, tracking = 0, anchor = 'middle', fill, opacity = 1 }) {
  const L = layout(key, str, size, tracking);
  const x0 = anchor === 'middle' ? x - L.width / 2 : anchor === 'end' ? x - L.width : x;
  const d = L.items.map(it => it.g.getPath(x0 + it.x, y, size).toPathData(2)).join('');
  return `<path d="${d}" fill="${fill}" opacity="${opacity}"/>`;
}

// Pecah judul menjadi maksimal 2 baris agar muat
function wrap(key, str, maxW, size, tracking, maxLines = 2) {
  if (textWidth(key, str, size, tracking) <= maxW || maxLines < 2 || !str.includes(' ')) return [str];
  const words = str.split(' ');
  let best = [str], bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const diff = Math.abs(textWidth(key, a, size, tracking) - textWidth(key, b, size, tracking));
    if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
  }
  return best;
}

function initials(name) {
  const words = name.split(' ').filter(Boolean);
  const letters = w => [...w].find(ch => /\p{L}|\p{N}/u.test(ch)) ?? '';
  const s = words.length > 1 ? letters(words[0]) + letters(words[1]) : [...words[0] ?? ''].filter(ch => /\p{L}|\p{N}/u.test(ch)).slice(0, 2).join('');
  return s.toUpperCase();
}

// ---------- Palet ----------
const GOLD = [[0, '#FFF3BF'], [0.22, '#E9C95D'], [0.5, '#B98A1C'], [0.76, '#F4D97E'], [1, '#9A7210']];
const PLAT = [[0, '#FFFFFF'], [0.22, '#DDE2EC'], [0.5, '#98A2B6'], [0.76, '#EDF0F6'], [1, '#76809A']];
const DGOLD = [[0, '#E2BF4E'], [0.5, '#A87C14'], [1, '#7C5A0A']];
const PALETTES = {
  gold:     { name: 'Emas Klasik', bg0: '#0A0A0D', bg1: '#1C1911', stops: GOLD, text: '#F3EBD3', muted: '#A99E7E', mid: '#D4AF37', dark: false },
  royal:    { name: 'Biru Royal + Emas', bg0: '#070B1C', bg1: '#162654', stops: GOLD, text: '#F3EBD3', muted: '#9FA9C9', mid: '#D4AF37', dark: false },
  crimson:  { name: 'Merah Marun + Emas', bg0: '#0D0607', bg1: '#35121A', stops: GOLD, text: '#F6E9D5', muted: '#C09A93', mid: '#D4AF37', dark: false },
  emerald:  { name: 'Hijau Zamrud + Emas', bg0: '#04100C', bg1: '#0F3427', stops: GOLD, text: '#F1EBD2', muted: '#8FB3A4', mid: '#D4AF37', dark: false },
  platinum: { name: 'Platinum', bg0: '#090B10', bg1: '#1A202D', stops: PLAT, text: '#EEF1F7', muted: '#98A2B6', mid: '#B9C1D1', dark: false },
  ivory:    { name: 'Ivory (terang)', bg0: '#F4EFE3', bg1: '#FFFFFF', stops: DGOLD, text: '#2A2416', muted: '#7B7157', mid: '#A87C14', dark: true },
};

function defs(p) {
  const stops = p.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
  return `<defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>
    <linearGradient id="goldH" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
    <radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="${p.bg1}"/><stop offset="1" stop-color="${p.bg0}"/></radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${p.mid}" stop-opacity="0.30"/><stop offset="1" stop-color="${p.mid}" stop-opacity="0"/></radialGradient>
    <linearGradient id="streak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${p.mid}" stop-opacity="0"/><stop offset="0.5" stop-color="${p.mid}" stop-opacity="0.22"/><stop offset="1" stop-color="${p.mid}" stop-opacity="0"/></linearGradient>
  </defs>`;
}

function svgWrap(W, H, p, body, { transparent = false } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs(p)}${transparent ? '' : `<rect width="${W}" height="${H}" fill="url(#bg)"/>`}${body}</svg>`;
}

function render(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng();
}

module.exports = { font, clean, text, textWidth, fitSize, wrap, initials, PALETTES, svgWrap, render };
