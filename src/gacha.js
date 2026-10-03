const { randomInt } = require('crypto');

const cooldowns = new Map(); // userId -> timestamp (reset kalau bot restart/deploy)

function load() {
  delete require.cache[require.resolve('./data/gacha.json')]; // edit JSON tanpa restart lokal
  return require('./data/gacha.json');
}

// Pilih rarity berdasarkan weight (hanya rarity yang punya asset), lalu asset acak di rarity itu
function roll(cfg) {
  const pools = Object.entries(cfg.rarities)
    .map(([key, r]) => ({ key, ...r, items: cfg.assets.filter(a => a.rarity === key) }))
    .filter(p => p.items.length && p.weight > 0);
  if (!pools.length) return null;
  let n = randomInt(pools.reduce((s, p) => s + p.weight, 0));
  const pool = pools.find(p => (n -= p.weight) < 0);
  return { rarity: pool, asset: pool.items[randomInt(pool.items.length)], pools };
}

function remainingMs(userId, cfg) {
  const last = cooldowns.get(userId);
  return last ? Math.max(0, last + cfg.cooldownHours * 3600 * 1000 - Date.now()) : 0;
}

const markUsed = userId => cooldowns.set(userId, Date.now());

function formatDuration(ms) {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${m} menit`;
}

module.exports = { load, roll, remainingMs, markUsed, formatDuration };
