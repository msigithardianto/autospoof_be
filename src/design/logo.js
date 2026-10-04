const E = require('./engine');

const S = 1024;
const rad = d => (d * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const diamond = (x, y, s, fill) => { x = +x; y = +y; return `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z" fill="${fill}"/>`; };

// Teks nama + tagline di bagian bawah (dipakai semua gaya)
function captions(name, tagline, p, { y, titleKey, titleSize, tracking, upper = true, taglineY }) {
  const title = upper ? name.toUpperCase() : name;
  const size = E.fitSize(titleKey, title, 840, titleSize, tracking);
  let out = E.text(titleKey, title, { x: S / 2, y, size, tracking, fill: 'url(#goldH)' });
  if (tagline) {
    const t = tagline.toUpperCase();
    const ts = E.fitSize('sansM', t, 760, 27, 0.34);
    const w = E.textWidth('sansM', t, ts, 0.34);
    const ty = taglineY ?? y + 66;
    out += E.text('sansM', t, { x: S / 2, y: ty, size: ts, tracking: 0.34, fill: p.muted });
    const lx = 40 + Math.max(0, 0);
    out += `<g stroke="${p.mid}" stroke-width="2" opacity="0.85"><line x1="${S / 2 - w / 2 - 28 - 90}" y1="${ty - ts * 0.35}" x2="${S / 2 - w / 2 - 28}" y2="${ty - ts * 0.35}"/><line x1="${S / 2 + w / 2 + 28}" y1="${ty - ts * 0.35}" x2="${S / 2 + w / 2 + 28 + 90}" y2="${ty - ts * 0.35}"/></g>`;
  }
  return out;
}

// 1) ELEGAN: lambang lingkaran dengan monogram serif, cincin ganda, dan detail jam
function elegan(name, tagline, p) {
  const cx = S / 2, cy = 410;
  let b = `<circle cx="${cx}" cy="${cy}" r="420" fill="url(#glow)"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="272" fill="none" stroke="url(#gold)" stroke-width="9"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="248" fill="none" stroke="url(#gold)" stroke-width="2.5" opacity="0.9"/>`;
  let ticks = '';
  for (let a = 0; a < 360; a += 5) {
    const major = a % 30 === 0;
    const [x1, y1] = pt(cx, cy, major ? 222 : 231, a), [x2, y2] = pt(cx, cy, 240, a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${major ? 3 : 1.4}"/>`;
  }
  b += `<g stroke="${p.mid}" opacity="0.8">${ticks}</g>`;
  for (const a of [-90, 0, 90, 180]) { const [x, y] = pt(cx, cy, 272, a); b += diamond(x.toFixed(1), y.toFixed(1), 17, 'url(#gold)') + diamond(x.toFixed(1), y.toFixed(1), 7, p.bg0); }
  const mono = E.initials(name) || '?';
  const msize = E.fitSize('serifBlack', mono, 300, 270, 0.02);
  b += E.text('serifBlack', mono, { x: cx, y: cy + msize * 0.355, size: msize, tracking: 0.02, fill: 'url(#gold)' });
  b += captions(name, tagline, p, { y: 800, titleKey: 'cinzel', titleSize: 92, tracking: 0.16 });
  return b;
}

// 2) MODERN: heksagon bertumpuk dengan inisial geometris
function modern(name, tagline, p) {
  const cx = S / 2, cy = 410;
  const hex = (r, rot = 30) => [0, 1, 2, 3, 4, 5].map(i => pt(cx, cy, r, rot + i * 60).map(v => v.toFixed(1)).join(',')).join(' ');
  let b = `<circle cx="${cx}" cy="${cy}" r="430" fill="url(#glow)"/>`;
  b += `<polygon points="${hex(300)}" fill="none" stroke="url(#gold)" stroke-width="3" opacity="0.35" stroke-linejoin="round"/>`;
  b += `<polygon points="${hex(262)}" fill="none" stroke="url(#gold)" stroke-width="12" stroke-linejoin="round"/>`;
  b += `<polygon points="${hex(222)}" fill="none" stroke="url(#gold)" stroke-width="2.5" opacity="0.8" stroke-linejoin="round"/>`;
  for (let i = 0; i < 6; i++) { const [x, y] = pt(cx, cy, 262, 30 + i * 60); b += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11" fill="${p.bg0}" stroke="url(#gold)" stroke-width="4"/>`; }
  const mono = E.initials(name) || '?';
  const msize = E.fitSize('sansXB', mono, 270, 230, 0.04);
  b += E.text('sansXB', mono, { x: cx, y: cy + msize * 0.36, size: msize, tracking: 0.04, fill: 'url(#gold)' });
  b += captions(name, tagline, p, { y: 800, titleKey: 'sansXB', titleSize: 84, tracking: 0.14 });
  return b;
}

// 3) MINIMAL: wordmark bersih dengan aksen garis emas
function minimal(name, tagline, p) {
  const cx = S / 2, cy = 470;
  let b = `<circle cx="${cx}" cy="${cy}" r="420" fill="url(#glow)" opacity="0.6"/>`;
  const title = name.toUpperCase();
  const size = E.fitSize('sansXB', title, 860, 150, 0.1);
  b += `<rect x="${cx - 46}" y="${cy - size * 0.95}" width="92" height="7" rx="3.5" fill="url(#goldH)"/>`;
  b += E.text('sansXB', title, { x: cx, y: cy + size * 0.3, size, tracking: 0.1, fill: 'url(#goldH)' });
  if (tagline) {
    const t = tagline.toUpperCase(), ts = E.fitSize('sansM', t, 800, 30, 0.4);
    b += E.text('sansM', t, { x: cx, y: cy + size * 0.3 + 80, size: ts, tracking: 0.4, fill: p.muted });
  }
  b += diamond(cx, cy + size * 0.3 + (tagline ? 140 : 70), 9, 'url(#gold)');
  return b;
}

const STYLES = { elegan, modern, minimal };

function logoSvg({ name, tagline = '', style = 'elegan', palette = 'gold', transparent = false }) {
  const p = E.PALETTES[palette] ?? E.PALETTES.gold;
  const body = (STYLES[style] ?? elegan)(E.clean(name, 'sansB'), E.clean(tagline, 'sansB'), p);
  return E.svgWrap(S, S, p, body, { transparent });
}

module.exports = { logoSvg, STYLES: Object.keys(STYLES) };
