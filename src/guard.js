// Penjaga server: bot hanya aktif di server yang diizinkan (ALLOWED_GUILD_IDS, default GUILD_ID).
const { Events, AuditLogEvent, Team } = require('discord.js');

function allowedSet() {
  const raw = process.env.ALLOWED_GUILD_IDS || process.env.GUILD_ID || '';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

// Jika daftar kosong, tidak ada pembatasan (supaya bot tidak keluar dari semua server karena salah konfigurasi)
function isAllowed(guildId) {
  const set = allowedSet();
  return set.size === 0 || set.has(guildId);
}

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

async function handleGuild(client, guild) {
  if (isAllowed(guild.id)) return false;
  const inviter = await findInviter(client, guild);
  const info = `🚨 Bot ditambahkan ke server TIDAK DIIZINKAN dan otomatis keluar.\n` +
    `Server: ${guild.name} (${guild.id})\nPemilik server: ${guild.ownerId}\nAnggota: ${guild.memberCount}\n` +
    `Diundang oleh: ${inviter ?? 'tidak diketahui (audit log tidak tersedia)'}`;
  console.warn('[guard]', info.replace(/\n/g, ' | '));
  await notify(client, info);
  await guild.leave().catch(err => console.error('[guard] gagal keluar:', err.message));
  return true;
}

function setup(client) {
  if (!allowedSet().size) console.warn('[guard] ALLOWED_GUILD_IDS/GUILD_ID kosong: bot TIDAK dibatasi ke server tertentu.');
  client.once(Events.ClientReady, async c => {
    for (const guild of c.guilds.cache.values()) await handleGuild(c, guild);
  });
  client.on(Events.GuildCreate, guild => handleGuild(client, guild));
}

module.exports = { setup, isAllowed, handleGuild, ownerId };
