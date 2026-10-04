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

const paymentCard = opts => E.render(cardSvg(opts), 1024);

module.exports = { paymentCard, cardSvg };
