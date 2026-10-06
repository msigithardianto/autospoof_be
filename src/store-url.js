const fs = require('fs');
const path = require('path');

/* Alamat web VOLT.STORE untuk bot -> toko (tombol order, daftar server toko).
   Urutan: env STORE_URL (override manual) -> alamat yang dikirim web sendiri lewat header `x-store-url`
   di setiap request ber-API-key (dipelajari otomatis, disimpan ke data/ agar tetap ada setelah restart). */

const FILE = path.join(__dirname, '..', 'data', 'store-url.txt');
let learned = null;
try {
  learned = fs.readFileSync(FILE, 'utf8').trim() || null;
} catch {}

const clean = v => String(v ?? '').trim().replace(/\/+$/, '');

/** Origin web toko, atau null bila belum diketahui. */
function storeUrl() {
  return clean(process.env.STORE_URL) || learned || null;
}

/** Simpan origin dari web (hanya dipanggil untuk request yang API key-nya valid). true = baru/berubah. */
function learnStoreUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? ''));
  } catch {
    return false;
  }
  const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return false;
  if (url.origin === learned) return false;
  learned = url.origin;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, learned);
  } catch (err) {
    console.warn('[store] gagal menyimpan alamat toko:', err.message);
  }
  console.log(`[store] alamat toko dipelajari otomatis: ${learned}`);
  return true;
}

module.exports = { storeUrl, learnStoreUrl };
