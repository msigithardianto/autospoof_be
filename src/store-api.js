const crypto = require('crypto');
const express = require('express');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { qrisPng, validate } = require('./qris');

/* Jembatan VOLT.STORE <-> bot. Data order ada di database toko (Supabase); bot hanya notifier:
   - store -> bot (HTTP, dikunci STORE_API_KEY): kirim/perbarui embed order, DM user, QRIS platform.
   - bot -> store: klik tombol status di Discord -> POST {STORE_URL}/api/bot/orders/:id/status.
   Order toko resmi -> ORDER_CHANNEL_ID (tombol untuk admin). Order toko seller -> DM ke seller. */

const STATUS = {
  awaiting: { label: 'Menunggu pembayaran', color: 0xf5b301 },
  paid: { label: 'Lunas — antre', color: 0x3b82f6 },
  processing: { label: 'Diproses', color: 0x8b5cf6 },
  completed: { label: 'Selesai', color: 0x22c55e },
  cancelled: { label: 'Dibatalkan', color: 0x6b7280 },
  expired: { label: 'Kedaluwarsa', color: 0x6b7280 },
};
const PAY_LABEL = { qris: 'QRIS', ewallet: 'E-wallet (QRIS)', va: 'Virtual Account' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISCORD_ID = /^\d{17,20}$/;
const MAX_AMOUNT = 100_000_000;

const rp = n => `Rp${Number(n).toLocaleString('id-ID')}`;
const clip = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

/* ---------- Embed & tombol ---------- */
function orderEmbed(o) {
  const st = STATUS[o.status] ?? STATUS.awaiting;
  const lines = o.lines.map(l => `• ${clip(l.name, 60)} — ${clip(l.variant, 40)} ×${l.qty}  \`${rp(l.price * l.qty)}\``).join('\n');
  const delivery = Object.entries(o.delivery || {}).filter(([, v]) => v).map(([k, v]) => `**${clip(k, 20)}**: ${clip(v, 80)}`).join('\n');
  const money = [
    `Subtotal: ${rp(o.subtotal)}`,
    o.memberDiscount ? `Diskon Pro: -${rp(o.memberDiscount)}` : null,
    o.discount ? `Voucher: -${rp(o.discount)}` : null,
    o.fee ? `Biaya admin: ${rp(o.fee)}` : null,
    `**Total: ${rp(o.total)}**`,
  ].filter(Boolean).join('\n');
  const buyer = DISCORD_ID.test(o.buyer.id) ? `<@${o.buyer.id}> (${clip(o.buyer.name, 40)})` : `${clip(o.buyer.name, 40)} (akun demo)`;

  const embed = new EmbedBuilder()
    .setColor(st.color)
    .setTitle(`Order ${o.code}`)
    .setDescription(`Status: **${st.label}**${o.priority ? '  ·  antrean prioritas (Pro)' : ''}\nToko: **${clip(o.seller.name, 60)}**`)
    .addFields(
      { name: 'Pembeli', value: buyer, inline: true },
      { name: 'Metode', value: PAY_LABEL[o.payment] ?? o.payment, inline: true },
      { name: 'Batas bayar', value: `<t:${Math.floor(o.expiresAt / 1000)}:R>`, inline: true },
      { name: 'Item', value: clip(lines || '-', 1024) },
      { name: 'Pembayaran', value: money },
      { name: 'Data pengiriman', value: clip(delivery || '-', 1024) },
    )
    .setFooter({ text: o.updatedBy ? `Terakhir diubah: ${clip(o.updatedBy, 60)}` : 'VOLT.STORE' })
    .setTimestamp(o.createdAt);
  if (o.priceMismatch) embed.addFields({ name: 'Peringatan', value: 'Cek nominal sebelum konfirmasi.' });
  return embed;
}

function orderButtons(o) {
  const btn = (to, label, style) => new ButtonBuilder().setCustomId(`order:${to}:${o.id}`).setLabel(label).setStyle(style);
  const set = {
    awaiting: [btn('paid', 'Tandai lunas', ButtonStyle.Success), btn('cancelled', 'Batalkan', ButtonStyle.Danger)],
    paid: [btn('processing', 'Proses', ButtonStyle.Primary), btn('completed', 'Selesai', ButtonStyle.Success)],
    processing: [btn('completed', 'Selesai', ButtonStyle.Success)],
  }[o.status];
  return set ? [new ActionRowBuilder().addComponents(set)] : [];
}

const view = o => ({ embeds: [orderEmbed(o)], components: orderButtons(o) });

async function dm(client, userId, text) {
  if (!text || !DISCORD_ID.test(String(userId))) return false;
  const user = await client.users.fetch(userId).catch(() => null);
  return Boolean(await user?.send(text).catch(() => null)); // DM tertutup -> abaikan
}

/** Kirim embed baru (channel admin / DM seller), atau edit yang sudah ada. Mengembalikan referensi pesan. */
async function upsertOrderMessage(client, o, sellerDiscordId, ref) {
  if (ref?.channelId && ref?.messageId) {
    const channel = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await channel?.messages?.fetch(ref.messageId).catch(() => null);
    if (msg) {
      await msg.edit(view(o));
      return ref;
    }
  }
  let channel = null;
  if (sellerDiscordId) {
    const user = DISCORD_ID.test(sellerDiscordId) ? await client.users.fetch(sellerDiscordId).catch(() => null) : null;
    channel = await user?.createDM().catch(() => null);
  } else if (process.env.ORDER_CHANNEL_ID) {
    channel = await client.channels.fetch(process.env.ORDER_CHANNEL_ID).catch(() => null);
  }
  if (!channel?.isTextBased?.()) return null;
  const msg = await channel.send({ content: sellerDiscordId ? 'Pesanan baru di tokomu:' : undefined, ...view(o) });
  return { channelId: channel.id, messageId: msg.id };
}

/* ---------- Tombol status ---------- */
/** Tombol `order:<status>:<uuid>` -> diteruskan ke API toko (sumber data). */
async function handleOrderButton(interaction) {
  const [scope, status, id] = interaction.customId.split(':');
  if (scope !== 'order') return false;
  const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (!UUID_RE.test(id ?? '')) return reply('Order lama ini tidak lagi didukung. Kelola pesanan di dashboard VOLT.STORE.');
  if (!process.env.STORE_URL) return reply('STORE_URL belum diisi di bot.');

  await interaction.deferUpdate();
  const res = await fetch(`${process.env.STORE_URL.replace(/\/+$/, '')}/api/bot/orders/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.STORE_API_KEY ?? '' },
    body: JSON.stringify({
      status,
      actorId: interaction.user.id,
      actorName: interaction.user.username,
      admin: Boolean(interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
    }),
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);

  if (data?.order) await interaction.editReply(view(data.order)).catch(() => {});
  if (res?.ok) await dm(interaction.client, data.order.buyer.id, data.dmBuyer);
  else {
    const msg = res?.status === 403 ? 'Kamu tidak berhak mengubah order ini.'
      : res?.status === 409 ? 'Status order sudah berubah — pesan diperbarui.'
      : 'Gagal menghubungi VOLT.STORE. Coba lagi.';
    await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return true;
}

/* ---------- HTTP API ---------- */
function auth(req, res, next) {
  const key = process.env.STORE_API_KEY;
  if (!key) return res.status(503).json({ error: 'store_api_key_not_set' });
  const sha = s => crypto.createHash('sha256').update(String(s)).digest();
  if (!crypto.timingSafeEqual(sha(req.get('x-api-key') ?? ''), sha(key))) return res.status(401).json({ error: 'unauthorized' });
  next();
}

function startStoreApi(client) {
  // Server HTTP selalu jalan supaya /health bisa dipakai cek konfigurasi dari browser
  if (!process.env.STORE_API_KEY) console.warn('[store] STORE_API_KEY kosong — endpoint toko menolak semua request (503).');
  if (!process.env.STORE_URL) console.warn('[store] STORE_URL kosong — tombol order di Discord tidak bisa dipakai.');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'lokal').slice(0, 7),
      discord: client.isReady(),
      storeApiKey: Boolean(process.env.STORE_API_KEY),
      storeUrl: Boolean(process.env.STORE_URL),
      orderChannel: Boolean(process.env.ORDER_CHANNEL_ID),
      qris: Boolean(process.env.QRIS_STRING) && validate(process.env.QRIS_STRING).ok,
    }));

  // Kirim / perbarui embed order (+ DM pembeli bila status berubah)
  app.post('/notify/order', auth, async (req, res) => {
    const { order, sellerDiscordId, message, dmBuyer } = req.body ?? {};
    if (!order || !UUID_RE.test(order.id ?? '') || !Array.isArray(order.lines)) return res.status(400).json({ error: 'invalid_order' });
    if (!client.isReady()) return res.status(503).json({ error: 'discord_not_ready' });
    const ref = await upsertOrderMessage(client, order, sellerDiscordId || null, message).catch(err => {
      console.error('[store] gagal kirim embed order:', err.message);
      return null;
    });
    if (dmBuyer) await dm(client, order.buyer?.id, String(dmBuyer).slice(0, 1800));
    res.json({ message: ref });
  });

  // DM bebas (mis. konfirmasi langganan seller)
  app.post('/notify/dm', auth, async (req, res) => {
    const { userId, text } = req.body ?? {};
    if (!client.isReady()) return res.status(503).json({ error: 'discord_not_ready' });
    res.json({ sent: await dm(client, userId, String(text ?? '').slice(0, 1800)) });
  });

  // QRIS platform (toko resmi & langganan seller) dengan nominal
  app.get('/qris', auth, async (req, res) => {
    const amount = Number(req.query.amount);
    if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) return res.status(400).json({ error: 'invalid_amount' });
    if (!process.env.QRIS_STRING || !validate(process.env.QRIS_STRING).ok) return res.status(503).json({ error: 'qris_not_configured' });
    res.set('Cache-Control', 'private, max-age=600').type('png').send(await qrisPng(process.env.QRIS_STRING, amount));
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`[store] API toko aktif di port ${port}`));
}

module.exports = { startStoreApi, handleOrderButton };
