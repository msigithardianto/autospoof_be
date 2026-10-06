// Penjaga server.
// - Server "rumah" (ALLOWED_GUILD_IDS, default GUILD_ID): semua fitur bot (AI, command, auto-reply).
// - Server toko VOLT.STORE (didaftarkan seller lewat dashboard): hanya notifikasi & tombol order.
// - Server lain: diberi waktu GRACE_MS untuk didaftarkan seller, lalu bot keluar otomatis.
const { Events, AuditLogEvent, Team } = require('discord.js');

const GRACE_MS = 15 * 60_000;
const REFRESH_MS = 5 * 60_000;

function homeSet() {
  const raw = process.env.ALLOWED_GUILD_IDS || process.env.GUILD_ID || '';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

/* ---------- Server toko (dari API toko) ---------- */
let shopGuilds = new Set();
let lastRefresh = 0;

async function refreshShopGuilds(force = false) {
  if (!process.env.STORE_URL || !process.env.STORE_API_KEY) return shopGuilds;
  if (!force && Date.now() - lastRefresh < REFRESH_MS) return shopGuilds;
  try {
    const res = await fetch(`${process.env.STORE_URL.replace(/\/+$/, '')}/api/bot/guilds`, {
      headers: { 'x-api-key': process.env.STORE_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const { guilds } = await res.json();
      if (Array.isArray(guilds)) shopGuilds = new Set(guilds.filter(g => /^\d{17,20}$/.test(g)));
      lastRefresh = Date.now();
    }
  } catch (err) {
    console.error('[guard] gagal memuat server toko:', err.message);
  }
  return shopGuilds;
}

// Jika daftar rumah kosong, tidak ada pembatasan (supaya bot tidak keluar dari semua server karena salah konfigurasi)
function isHome(guildId) {
  const set = homeSet();
  return set.size === 0 || set.has(guildId);
}

const isShopGuild = guildId => shopGuilds.has(guildId);
/** Daftar server toko pernah berhasil dimuat dari API toko. Belum → jangan keluar dari server mana pun. */
const shopListReady = () => lastRefresh > 0;

/** Fitur penuh (AI, command, auto-reply) hanya di server rumah. */
const isAllowed = isHome;

async function ownerId(client) {
  const app = await client.application.fetch();
  const o = app.owner;
  return o instanceof Team ? o.ownerId : o?.id;
}

async function notify(client, text) {
  try {
    if (process.env.LOG_CHANNEL_ID) {
      const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
      return await ch.send({ content: text, allowedMentions: { parse: [] } });
    }
    const user = await client.users.fetch(await ownerId(client));
    await user.send(text);
  } catch (err) {
    console.error('[guard] gagal mengirim notifikasi:', err.message);
  }
}

// Cari siapa yang menambahkan bot (butuh izin View Audit Log di server itu; belum tentu tersedia)
async function findInviter(client, guild) {
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = logs.entries.find(e => e.target?.id === client.user.id);
    return entry?.executor ? `${entry.executor.tag} (${entry.executor.id})` : null;
  } catch {
    return null;
  }
}

async function leaveIfUnknown(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild || isHome(guild.id)) return;
  await refreshShopGuilds(true);
  if (isShopGuild(guild.id)) return;
  if (!shopListReady()) {
    console.warn(`[guard] daftar server toko belum bisa dimuat (cek STORE_URL & STORE_API_KEY) — tetap di ${guild.name} (${guild.id}).`);
    return;
  }
  const inviter = await findInviter(client, guild);
  const info = `Bot keluar dari server yang tidak terdaftar sebagai toko VOLT.STORE.\n` +
    `Server: ${guild.name} (${guild.id})\nPemilik server: ${guild.ownerId}\nAnggota: ${guild.memberCount}\n` +
    `Diundang oleh: ${inviter ?? 'tidak diketahui (audit log tidak tersedia)'}`;
  console.warn('[guard]', info.replace(/\n/g, ' | '));
  await notify(client, info);
  await guild.leave().catch(err => console.error('[guard] gagal keluar:', err.message));
}

const waiting = new Set();

/** Server baru / belum terdaftar: tunggu GRACE_MS (seller memasang Channel ID di dashboard), lalu cek ulang. */
async function handleGuild(client, guild) {
  if (isHome(guild.id) || waiting.has(guild.id)) return false;
  await refreshShopGuilds(true);
  if (isShopGuild(guild.id)) return false;
  waiting.add(guild.id);
  console.log(`[guard] server ${guild.name} (${guild.id}) belum terdaftar — menunggu ${GRACE_MS / 60000} menit.`);
  setTimeout(() => leaveIfUnknown(client, guild.id).finally(() => waiting.delete(guild.id)), GRACE_MS).unref();
  return true;
}

function setup(client) {
  if (!homeSet().size) console.warn('[guard] ALLOWED_GUILD_IDS/GUILD_ID kosong: bot TIDAK dibatasi ke server tertentu.');
  client.once(Events.ClientReady, async c => {
    await refreshShopGuilds(true);
    for (const guild of c.guilds.cache.values()) await handleGuild(c, guild);
    // Daftar server toko diperbarui berkala; server yang dilepas seller → keluar setelah masa tunggu
    setInterval(async () => {
      await refreshShopGuilds(true);
      for (const guild of c.guilds.cache.values()) if (!isHome(guild.id) && !isShopGuild(guild.id)) handleGuild(c, guild);
    }, REFRESH_MS * 6).unref();
  });
  client.on(Events.GuildCreate, guild => handleGuild(client, guild));
}

module.exports = { setup, isAllowed, isHome, isShopGuild, refreshShopGuilds, handleGuild, ownerId };
