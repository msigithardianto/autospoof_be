const QRCode = require('qrcode');

// CRC16-CCITT (poly 0x1021, init 0xFFFF) sesuai standar EMVCo/QRIS
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function parseTLV(str) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    const tag = str.slice(i, i + 2);
    const len = parseInt(str.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) throw new Error('String QRIS tidak valid');
    out.push({ tag, value: str.slice(i + 4, i + 4 + len) });
    i += 4 + len;
  }
  return out;
}

const tlv = ({ tag, value }) => `${tag}${String(value.length).padStart(2, '0')}${value}`;

// Ubah QRIS statis (string hasil decode gambar QRIS) menjadi QRIS dinamis dengan nominal
function makeDynamicQris(staticQris, amount) {
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Nominal harus bilangan bulat positif');
  const fields = parseTLV(staticQris.trim()).filter(f => f.tag !== '63' && f.tag !== '54');
  const init = fields.find(f => f.tag === '01');
  if (init) init.value = '12'; // 11 = statis, 12 = dinamis
  const idx = fields.findIndex(f => Number(f.tag) > 54);
  fields.splice(idx === -1 ? fields.length : idx, 0, { tag: '54', value: String(amount) });
  const body = fields.map(tlv).join('') + '6304';
  return body + crc16(body);
}

async function qrisPng(staticQris, amount) {
  return QRCode.toBuffer(makeDynamicQris(staticQris, amount), { width: 600, margin: 2 });
}

// Cek bentuk string QRIS: awalan 000201, CRC valid, dan bisa di-parse
function validate(str) {
  const q = String(str ?? '').trim();
  if (!q) return { ok: false, reason: 'kosong' };
  if (!q.startsWith('000201')) return { ok: false, reason: 'harus diawali 000201 (bukan teks QRIS)' };
  if (q.slice(-8, -4) !== '6304') return { ok: false, reason: 'tidak diakhiri 6304 + 4 karakter CRC (kepotong saat disalin?)' };
  if (crc16(q.slice(0, -4)) !== q.slice(-4).toUpperCase()) return { ok: false, reason: 'CRC tidak cocok (ada karakter yang salah/terpotong/spasi)' };
  try { parseTLV(q); } catch { return { ok: false, reason: 'struktur tidak valid' }; }
  return { ok: true };
}

module.exports = { validate, crc16, parseTLV, makeDynamicQris, qrisPng };
