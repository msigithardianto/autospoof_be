// Kartu pembayaran QRIS berbingkai dark gold. QR tetap hitam di atas panel putih (kontras & quiet zone terjaga agar bisa discan).
const QRCode = require('qrcode');
const E = require('./engine');
const { sniff } = require('./frame');

const W = 1024;
const diamond = (x, y, s, fill) => `<path d="M${x} ${y - s} L${x + s} ${y} L${x} ${y + s} L${x - s} ${y} Z" fill="${fill}"/>`;

// QR sebagai vektor tajam: satu path berisi semua modul gelap
function qrPath(text, x0, y0, size) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, m = size / n;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (qr.modules.data[r * n + c]) d += `M${(x0 + c * m).toFixed(2)} ${(y0 + r * m).toFixed(2)}h${(m + 0.04).toFixed(2)}v${(m + 0.04).toFixed(2)}h-${(m + 0.04).toFixed(2)}z`;
  }
  return `<path d="${d}" fill="#000" shape-rendering="crispEdges"/>`;
}

function cardSvg({ qrisString, imageBuf, amount = null, merchant = '', nmid = '', terminal = '' }) {
  const p = E.PALETTES.darkgold;
  const H = amount ? 1535 : 1335;
  const px = 172, py = 476, pw = 680; // panel putih
  let b = `<ellipse cx="${W / 2}" cy="${H * 0.42}" rx="520" ry="${H * 0.5}" fill="url(#glow)" opacity="0.7"/>`;
  // bingkai ganda + berlian di sudut
  b += `<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="url(#gold)" stroke-width="6"/>`;
  b += `<rect x="54" y="54" width="${W - 108}" height="${H - 108}" fill="none" stroke="${p.mid}" stroke-opacity="0.5" stroke-width="1.6"/>`;
  for (const [x, y] of [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]]) b += diamond(x, y, 24, 'url(#gold)') + diamond(x, y, 9, p.bg0);

  // header
  b += E.text('cinzel', 'QRIS', { x: W / 2, y: 150, size: 84, tracking: 0.3, fill: 'url(#goldH)' });
  b += E.text('sansM', 'QR CODE STANDAR PEMBAYARAN NASIONAL', { x: W / 2, y: 204, size: 20, tracking: 0.22, fill: p.muted });
  b += `<g stroke="${p.mid}" stroke-width="2" opacity="0.9"><line x1="${W / 2 - 230}" y1="244" x2="${W / 2 - 26}" y2="244"/><line x1="${W / 2 + 26}" y1="244" x2="${W / 2 + 230}" y2="244"/></g>${diamond(W / 2, 244, 10, 'url(#gold)')}`;
  // info merchant (seperti poster QRIS)
  const nameU = E.clean(merchant, 'cinzel').toUpperCase();
  if (nameU) b += E.text('cinzel', nameU, { x: W / 2, y: 330, size: E.fitSize('cinzel', nameU, 800, 50, 0.1), tracking: 0.1, fill: p.text });
  if (nmid) b += E.text('sansM', `NMID: ${nmid}`, { x: W / 2, y: 378, size: E.fitSize('sansM', `NMID: ${nmid}`, 760, 26, 0.06), tracking: 0.06, fill: p.muted });
  if (terminal) b += E.text('sansM', E.clean(terminal, 'sansM'), { x: W / 2, y: 416, size: 24, tracking: 0.12, fill: p.muted });

  // panel putih + bingkai emas
  b += `<rect x="${px - 14}" y="${py - 14}" width="${pw + 28}" height="${pw + 28}" rx="46" fill="none" stroke="url(#gold)" stroke-width="9"/>`;
  b += `<rect x="${px}" y="${py}" width="${pw}" height="${pw}" rx="34" fill="#FFFFFF"/>`;
  if (qrisString) {
    b += qrPath(qrisString, px + 60, py + 60, pw - 120);
  } else if (imageBuf) {
    const mime = sniff(imageBuf);
    if (!mime) throw new Error('format gambar tidak didukung');
    b += `<image href="data:${mime};base64,${imageBuf.toString('base64')}" x="${px + 24}" y="${py + 24}" width="${pw - 48}" height="${pw - 48}" preserveAspectRatio="xMidYMid meet"/>`;
  }

  let y = py + pw + 90;
  if (amount) {
    b += E.text('sansM', 'TOTAL BAYAR', { x: W / 2, y, size: 26, tracking: 0.4, fill: p.muted });
    const label = `Rp ${amount.toLocaleString('id-ID')}`;
    const size = E.fitSize('sansXB', label, 780, 118, 0.02);
    b += E.text('sansXB', label, { x: W / 2, y: y + 24 + size * 0.78, size, tracking: 0.02, fill: 'url(#goldH)' });
    y += 24 + size * 0.78 + 66;
  }
  b += E.text('sansB', 'TERIMA PEMBAYARAN QRIS DARI MANA SAJA', { x: W / 2, y: H - 96, size: 24, tracking: 0.14, fill: p.text });
  b += E.text('sansR', 'E-WALLET • M-BANKING • BANK LAINNYA', { x: W / 2, y: H - 58, size: 18, tracking: 0.22, fill: p.muted });
  return E.svgWrap(W, H, p, b);
}

// ---------- Mode poster: poster QRIS resmi (mis. GoPay Merchant) utuh, QR diganti QR dinamis, dibingkai dark gold ----------
// Koordinat dalam ruang poster referensi 1129x1600 (hasil pengukuran piksel). Hanya dipakai bila rasio gambar cocok.
const POSTER = { w: 1129, h: 1600, cover: { x: 240, y: 580, w: 670, h: 677 }, qr: { x: 253.5, y: 596.5, size: 640 } };

function imageSize(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Apakah gambar ini poster dengan tata letak yang sama seperti POSTER (rasio ±2%)?
function isKnownPoster(buf) {
  const d = imageSize(buf);
  return !!d && Math.abs(d.w / d.h - POSTER.w / POSTER.h) < 0.02 * (POSTER.w / POSTER.h);
}

// Daerah logo resmi pada poster referensi (hasil pengukuran piksel), dipotong lalu ditaruh di panel putih.
const CROPS = {
  qris: { x: 142, y: 282, w: 436, h: 78 },       // logo QRIS + "QR Code Standar Pembayaran Nasional"
  gpn: { x: 898, y: 270, w: 92, h: 100 },        // logo GPN
  footer: { x: 50, y: 1464, w: 1034, h: 106 },   // "Terima pembayaran QRIS dari mana saja" + logo bank
  merchant: { x: 360, y: 424, w: 410, h: 148 },  // nama merchant + NMID + terminal (mode statis)
  qr: { x: 247, y: 586, w: 654, h: 663 },        // QR statis bawaan poster (mode statis)
};

// Kartu hibrida: bingkai dark gold + panel putih berisi logo resmi (dipotong dari poster) + QR
function posterSvg({ posterBuf, qrisString = null, amount = null, merchant = '', nmid = '', terminal = '' }) {
  const p = E.PALETTES.darkgold;
  const mime = sniff(posterBuf);
  if (!mime) throw new Error('format poster tidak didukung');
  const W = 1024, CX = W / 2;
  const cardX = 132, cardW = 760, pad = 40;
  let defs = `<image id="poster" href="data:${mime};base64,${posterBuf.toString('base64')}" width="${POSTER.w}" height="${POSTER.h}"/>`;
  let n = 0;
  // tempel potongan poster di (dx,dy) dengan lebar dw; mengembalikan {svg,h}
  const crop = (r, dx, dy, dw) => {
    const k = dw / r.w, h = r.h * k, id = `c${n++}`;
    defs += `<clipPath id="${id}"><rect x="${dx}" y="${dy}" width="${dw}" height="${h}"/></clipPath>`;
    return { h, svg: `<g clip-path="url(#${id})"><use href="#poster" transform="translate(${dx - r.x * k} ${dy - r.y * k}) scale(${k})"/></g>` };
  };

  let b = '';
  let y = 108;

  // Nominal sebagai teks hitam polos di panel putih (tanpa kotak/latar), tepat di atas QR
  const amountText = top => {
    const label = `Rp ${amount.toLocaleString('id-ID')}`;
    const size = E.fitSize('sansXB', label, cardW - 2 * pad - 40, 62, 0.02);
    let out = E.text('sansM', 'TOTAL BAYAR', { x: CX, y: top + 18, size: 20, tracking: 0.4, fill: '#111111' });
    out += E.text('sansXB', label, { x: CX, y: top + 34 + size * 0.82, size, tracking: 0.02, fill: '#111111' });
    return { svg: out, h: 34 + size * 0.95 };
  };

  // ---- panel putih utama ----
  const cardTop = y;
  let cy = cardTop + pad;
  let inner = '';
  const q = crop(CROPS.qris, cardX + pad, cy, 318);
  const g = crop(CROPS.gpn, cardX + cardW - pad - 66, cy - 2, 66);
  inner += q.svg + g.svg;
  cy += Math.max(q.h, g.h) + 34;

  if (qrisString) {
    const name = E.clean(merchant, 'sansB').toUpperCase();
    if (name) { inner += E.text('sansB', name, { x: CX, y: cy + 26, size: E.fitSize('sansB', name, cardW - 2 * pad, 34, 0.02), tracking: 0.02, fill: '#111111' }); cy += 40; }
    if (nmid) { inner += E.text('sansM', `NMID: ${nmid}`, { x: CX, y: cy + 20, size: 22, tracking: 0.03, fill: '#333333' }); cy += 32; }
    if (terminal) { inner += E.text('sansM', E.clean(terminal, 'sansM'), { x: CX, y: cy + 20, size: 22, tracking: 0.1, fill: '#333333' }); cy += 32; }
    cy += 10;
    cy += 22;
    const qs = 540;
    inner += qrPath(qrisString, CX - qs / 2, cy, qs);
    cy += qs + (amount ? 22 : pad);
    if (amount) { const a = amountText(cy); inner += a.svg; cy += a.h + pad - 6; }
  } else {
    const m = crop(CROPS.merchant, CX - 150, cy, 300);
    inner += m.svg; cy += m.h + 10;
    const qw = 520, qr = crop(CROPS.qr, CX - qw / 2, cy, qw);
    inner += qr.svg; cy += qr.h + (amount ? 22 : pad);
    if (amount) { const a = amountText(cy); inner += a.svg; cy += a.h + pad - 6; }
  }
  const cardH = cy - cardTop;
  b += `<rect x="${cardX - 12}" y="${cardTop - 12}" width="${cardW + 24}" height="${cardH + 24}" rx="48" fill="none" stroke="url(#gold)" stroke-width="9"/>`;
  b += `<rect x="${cardX}" y="${cardTop}" width="${cardW}" height="${cardH}" rx="38" fill="#FFFFFF"/>` + inner;

  // ---- strip logo resmi di bawah ----
  const stripX = 96, stripW = W - 2 * stripX, stripTop = cardTop + cardH + 44;
  const f = crop(CROPS.footer, stripX + 30, stripTop + 22, stripW - 60);
  const stripH = f.h + 44;
  b += `<rect x="${stripX}" y="${stripTop}" width="${stripW}" height="${stripH}" rx="30" fill="#FFFFFF" stroke="url(#gold)" stroke-width="5"/>` + f.svg;

  const H = Math.round(stripTop + stripH + 96);
  // bingkai luar + sudut berlian (digambar terakhir agar di atas latar)
  let frame = `<ellipse cx="${CX}" cy="${H * 0.45}" rx="560" ry="${H * 0.5}" fill="url(#glow)" opacity="0.55"/>`;
  frame += `<rect x="30" y="30" width="${W - 60}" height="${H - 60}" fill="none" stroke="url(#gold)" stroke-width="6"/>`;
  frame += `<rect x="54" y="54" width="${W - 108}" height="${H - 108}" fill="none" stroke="${p.mid}" stroke-opacity="0.5" stroke-width="1.6"/>`;
  for (const [x, yy] of [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]]) frame += diamond(x, yy, 24, 'url(#gold)') + diamond(x, yy, 9, p.bg0);

  const body = `<defs>${defs}</defs>` + frame + b;
  return { svg: E.svgWrap(W, H, p, body), width: W };
}

const paymentCard = opts => E.render(cardSvg(opts), 1024);
const posterCard = opts => { const { svg, width } = posterSvg(opts); return E.render(svg, width); };

module.exports = { paymentCard, cardSvg, posterCard, posterSvg, isKnownPoster, imageSize };
