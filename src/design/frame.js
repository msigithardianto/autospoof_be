// Bingkai dark gold untuk foto (avatar/PP): foto di dalam cincin ganda berornamen, latar gelap berpendar.
const E = require('./engine');

const S = 1024;
const rad = d => (d * Math.PI) / 180;
const pt = (cx, cy, r, deg) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))];
const diamond = (x, y, s, fill) => `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z" fill="${fill}"/>`;

function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'image/gif';
  return null;
}

// Mengembalikan SVG; caption opsional (mis. nama pengguna)
function frameSvg(imgBuf, { caption = '', palette = 'darkgold' } = {}) {
  const mime = sniff(imgBuf);
  if (!mime) throw new Error('format gambar tidak didukung');
  const p = E.PALETTES[palette] ?? E.PALETTES.darkgold;
  const cx = S / 2, cy = caption ? 470 : 512, R = 330;
  const H = caption ? 1100 : S;

  let b = `<circle cx="${cx}" cy="${cy}" r="480" fill="url(#glow)" opacity="0.9"/>`;
  b += `<defs><clipPath id="clip"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${R + 6}" fill="${p.bg0}"/>`;
  b += `<image href="data:${mime};base64,${imgBuf.toString('base64')}" x="${cx - R}" y="${cy - R}" width="${R * 2}" height="${R * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip)"/>`;
  // lapisan bingkai
  b += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.bg0}" stroke-width="10" opacity="0.7"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${R + 14}" fill="none" stroke="url(#gold)" stroke-width="14"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${R + 38}" fill="none" stroke="url(#gold)" stroke-width="3"/>`;
  b += `<circle cx="${cx}" cy="${cy}" r="${R + 62}" fill="none" stroke="url(#gold)" stroke-width="7"/>`;
  // detail jam di antara cincin
  let ticks = '';
  for (let a = 0; a < 360; a += 6) {
    const major = a % 30 === 0;
    const [x1, y1] = pt(cx, cy, R + (major ? 42 : 46), a), [x2, y2] = pt(cx, cy, R + 56, a);
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${major ? 3 : 1.4}"/>`;
  }
  b += `<g stroke="${p.mid}" opacity="0.85">${ticks}</g>`;
  for (const a of [-90, 0, 90, 180]) {
    const [x, y] = pt(cx, cy, R + 62, a);
    b += diamond(+x.toFixed(1), +y.toFixed(1), 20, 'url(#gold)') + diamond(+x.toFixed(1), +y.toFixed(1), 8, p.bg0);
  }
  if (caption) {
    const t = caption.toUpperCase();
    const size = E.fitSize('cinzel', t, 820, 76, 0.14);
    b += E.text('cinzel', t, { x: cx, y: 960, size, tracking: 0.14, fill: 'url(#goldH)' });
    b += `<g stroke="${p.mid}" stroke-width="2" opacity="0.9"><line x1="${cx - 250}" y1="1010" x2="${cx - 24}" y2="1010"/><line x1="${cx + 24}" y1="1010" x2="${cx + 250}" y2="1010"/></g>` + diamond(cx, 1010, 9, 'url(#gold)');
  }
  return E.svgWrap(S, H, p, b);
}

// PNG berbingkai dari buffer gambar apa pun (png/jpg/webp/gif)
const frameImage = (imgBuf, opts = {}) => E.render(frameSvg(imgBuf, opts), 1024);

async function fetchBuffer(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`gagal mengunduh gambar (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { frameImage, frameSvg, fetchBuffer, sniff };
