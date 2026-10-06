const fs = require('fs');
const path = require('path');

// Penyimpanan order VOLT.STORE: Map di memori + file JSON.
// Di Railway, pasang Volume lalu set DATA_DIR=/data supaya order tidak hilang saat redeploy.
const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DIR, 'orders.json');
const MAX_ORDERS = 2000;

const orders = new Map();
try {
  for (const o of JSON.parse(fs.readFileSync(FILE, 'utf8'))) orders.set(o.id, o);
} catch {}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      const list = [...orders.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ORDERS);
      fs.writeFileSync(FILE, JSON.stringify(list));
    } catch (err) {
      console.error('[orders] gagal simpan:', err.message);
    }
  }, 300);
}

// Alur status: awaiting -> paid -> processing -> completed; awaiting -> cancelled | expired
const NEXT = {
  awaiting: ['paid', 'cancelled', 'expired'],
  paid: ['processing', 'completed'],
  processing: ['completed'],
};
const STAMP = { paid: 'paidAt', processing: 'processingAt', completed: 'completedAt', cancelled: 'closedAt', expired: 'closedAt' };

const get = id => orders.get(id);

function create(order) {
  orders.set(order.id, order);
  save();
  return order;
}

/** Ubah status bila transisinya sah. Mengembalikan order baru, atau null bila ditolak. */
function transition(id, status, extra = {}) {
  const o = orders.get(id);
  if (!o || !NEXT[o.status]?.includes(status)) return null;
  const at = status === 'expired' ? o.expiresAt : Date.now();
  const next = { ...o, ...extra, status, [STAMP[status]]: at };
  // Langsung "Selesai" dari "Lunas": isi juga waktu proses supaya timeline lengkap
  if (status === 'completed' && !next.processingAt) next.processingAt = at;
  orders.set(id, next);
  save();
  return next;
}

function patch(id, fields) {
  const o = orders.get(id);
  if (!o) return null;
  const next = { ...o, ...fields };
  orders.set(id, next);
  save();
  return next;
}

const overdue = (now = Date.now()) => [...orders.values()].filter(o => o.status === 'awaiting' && now > o.expiresAt);

module.exports = { get, create, transition, patch, overdue };
