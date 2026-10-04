const E = require('./engine');

const SIZES = {
  discord: { w: 960, h: 540, name: 'Banner Discord (960×540)', scale: 2 },
  youtube: { w: 2560, h: 1440, name: 'Banner YouTube (2560×1440)', scale: 1 },
  roblox: { w: 1920, h: 1080, name: 'Thumbnail Roblox (1920×1080)', scale: 1 },
  header: { w: 1500, h: 500, name: 'Header X/Twitter (1500×500)', scale: 1 },
};
const rad = d => (d * Math.PI) / 180;
const hexPts = (cx, cy, r, rot = 0) => [0, 1, 2, 3, 4, 5].map(i => [cx + r * Math.cos(rad(rot + i * 60)), cy + r * Math.sin(rad(rot + i * 60))].map(v => v.toFixed(1)).join(',')).join(' ');
const diamond = (x, y, s, fill) => `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z" fill="${fill}"/>`;

// Judul: usahakan satu baris (diperkecil seperlunya); pecah 2 baris hanya jika jadi terlalu kecil
function fitTitle(key, str, maxW, baseSize, tracking, maxLines = 2) {
  const single = E.fitSize(key, str, maxW, baseSize, tracking);
  if (single >= baseSize * 0.62 || maxLines < 2 || !str.includes(' ')) return { lines: [str], size: single };
  const lines = E.wrap(key, str, maxW, baseSize, tracking, maxLines);
  return { lines, size: Math.min(...lines.map(l => E.fitSize(key, l, maxW, baseSize, tracking))) };
}

// 1) ELEGAN: bingkai ganda, judul serif emas di tengah, pembatas berlian
function elegan({ W, H, title, subtitle }, p) {
  const m = Math.min(W, H);
  const o = m * 0.05, o2 = m * 0.075;
  let b = `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.45}" ry="${H * 0.6}" fill="url(#glow)" opacity="0.8"/>`;
  b += `<rect x="${o}" y="${o}" width="${W - 2 * o}" height="${H - 2 * o}" fill="none" stroke="url(#gold)" stroke-width="${Math.max(2, m * 0.004)}"/>`;
  b += `<rect x="${o2}" y="${o2}" width="${W - 2 * o2}" height="${H - 2 * o2}" fill="none" stroke="${p.mid}" stroke-opacity="0.45" stroke-width="${Math.max(1, m * 0.0016)}"/>`;
  for (const [x, y] of [[o, o], [W - o, o], [o, H - o], [W - o, H - o]]) b += diamond(x, y, m * 0.022, 'url(#gold)') + diamond(x, y, m * 0.009, p.bg0);

  const t = fitTitle('cinzel', title.toUpperCase(), W * 0.74, H * 0.2, 0.12);
  const lh = t.size * 1.12;
  const hasSub = !!subtitle;
  const blockH = t.lines.length * lh + (hasSub ? H * 0.2 : 0);
  let y = (H - blockH) / 2 + t.size * 0.82;
  for (const line of t.lines) { b += E.text('cinzel', line, { x: W / 2, y, size: t.size, tracking: 0.12, fill: 'url(#goldH)' }); y += lh; }
  if (hasSub) {
    const dy = y - lh + t.size * 0.38 + H * 0.025;
    const half = W * 0.12;
    b += `<g stroke="${p.mid}" stroke-width="${Math.max(1.5, m * 0.003)}" opacity="0.9"><line x1="${W / 2 - half - m * 0.03}" y1="${dy}" x2="${W / 2 - m * 0.03}" y2="${dy}"/><line x1="${W / 2 + m * 0.03}" y1="${dy}" x2="${W / 2 + half + m * 0.03}" y2="${dy}"/></g>` + diamond(W / 2, dy, m * 0.014, 'url(#gold)');
    const st = subtitle.toUpperCase();
    const ss = E.fitSize('sansM', st, W * 0.7, H * 0.05, 0.3);
    b += E.text('sansM', st, { x: W / 2, y: dy + H * 0.1, size: ss, tracking: 0.3, fill: p.muted });
  }
  return b;
}

// 2) MODERN: judul tebal rata kiri, heksagon & grid titik di kanan, garis cahaya diagonal
function modern({ W, H, title, subtitle }, p) {
  const m = Math.min(W, H);
  let b = '';
  // titik-titik grid di kanan
  let dots = '';
  const gap = m * 0.055;
  for (let x = W * 0.58; x < W; x += gap) for (let y = gap * 0.6; y < H; y += gap) dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(m * 0.0042).toFixed(2)}"/>`;
  b += `<g fill="${p.mid}" opacity="0.22">${dots}</g>`;
  // heksagon besar
  const hx = W * 0.84, hy = H * 0.5;
  b += `<polygon points="${hexPts(hx, hy, H * 0.56, 30)}" fill="none" stroke="url(#gold)" stroke-width="${m * 0.008}" opacity="0.9" stroke-linejoin="round"/>`;
  b += `<polygon points="${hexPts(hx, hy, H * 0.43, 30)}" fill="${p.mid}" fill-opacity="0.06" stroke="url(#gold)" stroke-width="${m * 0.003}" opacity="0.8" stroke-linejoin="round"/>`;
  b += `<polygon points="${hexPts(hx, hy, H * 0.29, 30)}" fill="none" stroke="${p.mid}" stroke-opacity="0.5" stroke-width="${m * 0.002}" stroke-linejoin="round"/>`;
  b += `<polygon points="${hexPts(hx + H * 0.33, hy - H * 0.27, H * 0.13, 30)}" fill="url(#gold)" opacity="0.9"/>`;
  b += `<polygon points="${hexPts(hx - H * 0.27, hy + H * 0.33, H * 0.06, 30)}" fill="none" stroke="url(#gold)" stroke-width="${m * 0.004}"/>`;
  // garis cahaya diagonal
  b += `<polygon points="${W * 0.55},0 ${W * 0.60},0 ${W * 0.47},${H} ${W * 0.42},${H}" fill="url(#streak)" opacity="0.8"/>`;

  const x0 = W * 0.075;
  const t = fitTitle('sansXB', title.toUpperCase(), W * 0.45, H * 0.19, 0.04);
  const lh = t.size * 1.1;
  const blockH = t.lines.length * lh + (subtitle ? H * 0.16 : 0);
  let y = (H - blockH) / 2 + t.size * 0.78;
  b += `<rect x="${x0}" y="${y - t.size * 1.28}" width="${W * 0.07}" height="${Math.max(4, m * 0.012)}" rx="${m * 0.006}" fill="url(#goldH)"/>`;
  for (const line of t.lines) { b += E.text('sansXB', line, { x: x0, y, size: t.size, tracking: 0.04, anchor: 'start', fill: 'url(#goldH)' }); y += lh; }
  if (subtitle) {
    const ss = E.fitSize('sansM', subtitle, W * 0.45, H * 0.05, 0.12);
    b += E.text('sansM', subtitle, { x: x0, y: y - lh + t.size * 0.38 + H * 0.085, size: ss, tracking: 0.12, anchor: 'start', fill: p.muted });
  }
  return b;
}

// 3) MINIMAL: banyak ruang kosong, judul bersih di tengah, garis tipis
function minimal({ W, H, title, subtitle }, p) {
  const m = Math.min(W, H);
  let b = `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${W * 0.4}" ry="${H * 0.55}" fill="url(#glow)" opacity="0.55"/>`;
  const t = fitTitle('sansB', title.toUpperCase(), W * 0.7, H * 0.15, 0.2);
  const lh = t.size * 1.15;
  const blockH = t.lines.length * lh + (subtitle ? H * 0.17 : 0);
  let y = (H - blockH) / 2 + t.size * 0.78;
  for (const line of t.lines) { b += E.text('sansB', line, { x: W / 2, y, size: t.size, tracking: 0.2, fill: 'url(#goldH)' }); y += lh; }
  const ly = y - lh + t.size * 0.34 + H * 0.04;
  b += `<rect x="${W / 2 - W * 0.04}" y="${ly}" width="${W * 0.08}" height="${Math.max(2, m * 0.004)}" fill="url(#goldH)"/>`;
  if (subtitle) {
    const st = subtitle.toUpperCase(), ss = E.fitSize('sansR', st, W * 0.6, H * 0.04, 0.4);
    b += E.text('sansR', st, { x: W / 2, y: ly + H * 0.085, size: ss, tracking: 0.4, fill: p.muted });
  }
  return b;
}

const STYLES = { elegan, modern, minimal };

function bannerSvg({ title, subtitle = '', style = 'elegan', palette = 'gold', size = 'discord' }) {
  const sz = SIZES[size] ?? SIZES.discord;
  const p = E.PALETTES[palette] ?? E.PALETTES.gold;
  const args = { W: sz.w, H: sz.h, title: E.clean(title), subtitle: E.clean(subtitle) };
  return { svg: E.svgWrap(sz.w, sz.h, p, (STYLES[style] ?? elegan)(args, p)), width: sz.w * sz.scale };
}

module.exports = { bannerSvg, SIZES, STYLES: Object.keys(STYLES) };
