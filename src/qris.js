const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { AttachmentBuilder } = require('discord.js');

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

// Cari gambar QRIS statis (assets/qris.png|jpg|jpeg|webp)
function staticFile() {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const f = path.join(__dirname, '..', 'assets', `qris.${ext}`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Poster QRIS resmi (mis. GoPay Merchant) di assets/qris-poster.*; hanya dipakai jika rasionya cocok dengan tata letak yang sudah diukur
function loadPoster() {
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const f = path.join(__dirname, '..', 'assets', `qris-poster.${ext}`);
    if (!fs.existsSync(f)) continue;
    const buf = fs.readFileSync(f);
    if (require('./design/payment').isKnownPoster(buf)) return buf;
    console.warn('[qris] assets/qris-poster.* ada tapi rasio/tata letaknya tidak dikenali; memakai kartu standar.');
    return null;
  }
  return null;
}

const rupiah = n => `Rp${n.toLocaleString('id-ID')}`;

// Bentuk balasan pembayaran:
// 1) QRIS_STRING valid  -> QRIS dinamis dengan nominal otomatis
// 2) ada gambar statis   -> kirim gambar, pembeli mengetik nominal sendiri
// 3) tidak ada keduanya  -> pesan kesalahan untuk admin
const merchantName = qris => parseTLV(qris).find(t => t.tag === '59')?.value ?? '';
// NMID (tag 51, sub 02) dan ID terminal (tag 62, sub 07) bila ada
const sub = (qris, tag, subTag) => { try { return parseTLV(parseTLV(qris).find(t => t.tag === tag)?.value ?? '').find(t => t.tag === subTag)?.value ?? ''; } catch { return ''; } };
const merchantInfo = qris => ({ merchant: merchantName(qris), nmid: sub(qris, '51', '02'), terminal: sub(qris, '62', '07') });

// Kartu berbingkai dark gold; jika gagal dirender, kembali ke gambar polos
async function framedOrPlain(framed, plain) {
  try { return framed(); } catch (err) { console.error('[qris] bingkai gagal, pakai gambar polos:', err.message); return plain(); }
}

async function paymentPayload(amount) {
  const { paymentCard, posterCard } = require('./design/payment');
  if (process.env.QRIS_STRING && validate(process.env.QRIS_STRING).ok) {
    const dyn = makeDynamicQris(process.env.QRIS_STRING, amount);
    const poster = loadPoster();
    const png = await framedOrPlain(
      () => poster ? posterCard({ posterBuf: poster, qrisString: dyn, amount, ...merchantInfo(process.env.QRIS_STRING) }) : paymentCard({ qrisString: dyn, amount, ...merchantInfo(process.env.QRIS_STRING) }),
      () => qrisPng(process.env.QRIS_STRING, amount));
    return { content: `Total bayar: **${rupiah(amount)}**\nScan QRIS di bawah (nominal sudah terisi), lalu kirim bukti transfer ke admin.`, files: [new AttachmentBuilder(png, { name: 'qris.png' })] };
  }
  const file = staticFile();
  const poster = loadPoster();
  if (file || poster) {
    const img = file ? fs.readFileSync(file) : poster;
    const png = await framedOrPlain(
      () => poster ? posterCard({ posterBuf: poster, amount }) : paymentCard({ imageBuf: img, amount, merchant: process.env.MERCHANT_NAME || 'Arr Studio' }),
      () => img);
    return { content: `Total bayar: **${rupiah(amount)}**\nScan QR di bawah, **masukkan nominal ${rupiah(amount)} secara manual**, lalu kirim bukti transfer ke admin.`, files: [new AttachmentBuilder(png, { name: 'qris.png' })] };
  }
  return { error: 'Belum ada QRIS. Admin: isi `QRIS_STRING` (teks QRIS berawalan 000201) di Variables, atau upload gambar QR ke `assets/qris.png`.' };
}

// QRIS tanpa nominal (balasan kata kunci "qris"): gambar statis dalam bingkai
async function staticAttachment() {
  const file = staticFile();
  const poster = loadPoster();
  if (!file && !poster) return null;
  const img = file ? fs.readFileSync(file) : poster;
  const { paymentCard, posterCard } = require('./design/payment');
  const png = await framedOrPlain(
    () => poster ? posterCard({ posterBuf: poster }) : paymentCard({ imageBuf: img, merchant: process.env.MERCHANT_NAME || 'Arr Studio' }),
    () => img);
  return new AttachmentBuilder(png, { name: 'qris.png' });
}

module.exports = { loadPoster, staticAttachment, paymentPayload, staticFile, validate, crc16, parseTLV, makeDynamicQris, qrisPng };
