const crypto = require('crypto');
const express = require('express');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const orders = require('./orders');
const { qrisPng, validate } = require('./qris');

/* Jembatan VOLT.STORE <-> bot.
   - HTTP API (dipanggil server Next.js, dikunci STORE_API_KEY): buat order, status, QRIS, batal.
   - Embed order + tombol admin di ORDER_CHANNEL_ID, DM ke pembeli saat status berubah. */

const STATUS = {
  awaiting: { label: 'Menunggu pembayaran', color: 0xf5b301 },
  paid: { label: 'Lunas — antre', color: 0x3b82f6 },
  processing: { label: 'Diproses', color: 0x8b5cf6 },
  completed: { label: 'Selesai', color: 0x22c55e },
  cancelled: { label: 'Dibatalkan', color: 0x6b7280 },
  expired: { label: 'Kedaluwarsa', color: 0x6b7280 },
};
const BUYER_DM = {
  paid: 'Pembayaran untuk pesanan **{id}** sudah kami terima. Pesananmu masuk antrean.',
  processing: 'Pesanan **{id}** sedang diproses.',
  completed: 'Pesanan **{id}** sudah selesai. Terima kasih sudah belanja di VOLT.STORE!',
  cancelled: 'Pesanan **{id}** dibatalkan admin. Hubungi admin bila ada pertanyaan.',
};
const PAY_LABEL = { qris: 'QRIS', ewallet: 'E-wallet (QRIS)', va: 'Virtual Account' };
const ID_RE = /^INV-[A-Z0-9]{4,12}$/;
const DISCORD_ID = /^\d{17,20}$/;
const MAX_TOTAL = 100_000_000;

const rp = n => `Rp${Number(n).toLocaleString('id-ID')}`;
const clip = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

/* ---------- Discord ---------- */
function orderEmbed(o) {
  const st = STATUS[o.status];
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
    .setTitle(`Order ${o.id}`)
    .setDescription(`Status: **${st.label}**${o.priority ? '  ·  antrean prioritas (Pro)' : ''}`)
    .addFields(
      { name: 'Pembeli', value: buyer, inline: true },
      { name: 'Metode', value: PAY_LABEL[o.payment] ?? o.payment, inline: true },
      { name: 'Batas bayar', value: `<t:${Math.floor(o.expiresAt / 1000)}:R>`, inline: true },
      { name: 'Item', value: clip(lines || '-', 1024) },
      { name: 'Pembayaran', value: money },
      { name: 'Data pengiriman', value: clip(delivery || '-', 1024) },
    )
    .setTimestamp(o.createdAt);
  if (o.priceMismatch) embed.addFields({ name: 'Peringatan', value: 'Harga item dari web tidak cocok dengan katalog. Cek nominal sebelum konfirmasi.' });
  if (o.updatedBy) embed.setFooter({ text: `Terakhir diubah oleh ${o.updatedBy}` });
  return embed;
}

function orderButtons(o) {
  const btn = (action, label, style) => new ButtonBuilder().setCustomId(`order:${action}:${o.id}`).setLabel(label).setStyle(style);
  const set = {
    awaiting: [btn('paid', 'Tandai lunas', ButtonStyle.Success), btn('cancelled', 'Batalkan', ButtonStyle.Danger)],
    paid: [btn('processing', 'Proses', ButtonStyle.Primary), btn('completed', 'Selesai', ButtonStyle.Success)],
    processing: [btn('completed', 'Selesai', ButtonStyle.Success)],
  }[o.status];
  return set ? [new ActionRowBuilder().addComponents(set)] : [];
}

const posting = new Set();
async function postOrder(client, o) {
  if (!client.isReady() || posting.has(o.id)) return; // dikirim ulang otomatis saat bot online
  posting.add(o.id);
  try {
    await sendOrder(client, o);
  } finally {
    posting.delete(o.id);
  }
}

async function sendOrder(client, o) {
  const channelId = process.env.ORDER_CHANNEL_ID;
  if (!channelId) return console.warn('[store] ORDER_CHANNEL_ID kosong — order tidak diposting ke Discord.');
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return console.error('[store] ORDER_CHANNEL_ID tidak valid / bot tidak punya akses.');
  const msg = await channel.send({ embeds: [orderEmbed(o)], components: orderButtons(o) });
  orders.patch(o.id, { channelId: channel.id, messageId: msg.id });
}

async function refreshMessage(client, o) {
  if (!o.channelId || !o.messageId) return;
  const channel = await client.channels.fetch(o.channelId).catch(() => null);
  const msg = await channel?.messages.fetch(o.messageId).catch(() => null);
  await msg?.edit({ embeds: [orderEmbed(o)], components: orderButtons(o) }).catch(() => {});
}

async function dmBuyer(client, o, text) {
  if (!text || !DISCORD_ID.test(o.buyer.id)) return;
  const user = await client.users.fetch(o.buyer.id).catch(() => null);
  await user?.send(text.replace('{id}', o.id)).catch(() => {}); // DM tertutup -> abaikan
}

const isAdmin = interaction =>
  interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
  (process.env.ADMIN_ROLE_ID && interaction.member?.roles?.cache?.has(process.env.ADMIN_ROLE_ID));

/** Tombol `order:<status>:<id>` di embed order. Mengembalikan false bila bukan tombol order. */
async function handleOrderButton(interaction) {
  const [scope, status, id] = interaction.customId.split(':');
  if (scope !== 'order') return false;
  if (!isAdmin(interaction)) {
    await interaction.reply({ content: 'Hanya admin yang bisa mengubah status order.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const o = orders.transition(id, status, { updatedBy: interaction.user.username });
  if (!o) {
    await interaction.reply({ content: `Status order ${id} sudah berubah. Muat ulang pesan.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.update({ embeds: [orderEmbed(o)], components: orderButtons(o) });
  await dmBuyer(interaction.client, o, BUYER_DM[status]);
  return true;
}

/* ---------- HTTP API ---------- */
function auth(req, res, next) {
  const key = process.env.STORE_API_KEY;
  if (!key) return res.status(503).json({ error: 'store_api_key_not_set' });
  const given = req.get('x-api-key') ?? '';
  const ok = key && given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  next();
}

/** Order milik pembeli `?buyer=<id>` (404 bila bukan miliknya, supaya ID orang lain tidak bisa diintip). */
function own(req, res) {
  const o = ID_RE.test(req.params.id) ? orders.get(req.params.id) : null;
  if (!o || o.buyer.id !== req.query.buyer) {
    res.status(404).json({ error: 'not_found' });
    return null;
  }
  return o;
}

const publicView = o => ({
  id: o.id, status: o.status, paidAt: o.paidAt, processingAt: o.processingAt, completedAt: o.completedAt, closedAt: o.closedAt,
});

function validOrder(b) {
  const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  return b && ID_RE.test(b.id) && ['qris', 'ewallet', 'va'].includes(b.payment) &&
    int(b.total, 1, MAX_TOTAL) && int(b.subtotal, 0, MAX_TOTAL) && int(b.expiresAt, Date.now(), Date.now() + 2 * 864e5) &&
    Array.isArray(b.lines) && b.lines.length > 0 && b.lines.length <= 50 &&
    b.lines.every(l => l && typeof l.name === 'string' && int(l.qty, 1, 99) && int(l.price, 0, MAX_TOTAL)) &&
    b.buyer && typeof b.buyer.id === 'string' && typeof b.buyer.name === 'string';
}

function startStoreApi(client) {
  // Server HTTP selalu jalan supaya /health bisa dipakai cek konfigurasi dari browser
  if (!process.env.STORE_API_KEY) console.warn('[store] STORE_API_KEY kosong — endpoint order menolak semua request (503).');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'lokal').slice(0, 7),
      discord: client.isReady(),
      storeApiKey: Boolean(process.env.STORE_API_KEY),
      orderChannel: Boolean(process.env.ORDER_CHANNEL_ID),
      qris: Boolean(process.env.QRIS_STRING) && validate(process.env.QRIS_STRING).ok,
    }));

  app.post('/orders', auth, async (req, res) => {
    const b = req.body;
    if (!validOrder(b)) return res.status(400).json({ error: 'invalid_order' });
    if (orders.get(b.id)) return res.status(409).json({ error: 'duplicate' });
    const o = orders.create({
      id: b.id,
      createdAt: Date.now(),
      expiresAt: b.expiresAt,
      status: 'awaiting',
      payment: b.payment,
      lines: b.lines.map(l => ({ name: l.name, variant: String(l.variant ?? ''), qty: l.qty, price: l.price })),
      subtotal: b.subtotal,
      memberDiscount: b.memberDiscount | 0,
      discount: b.discount | 0,
      fee: b.fee | 0,
      total: b.total,
      priority: !!b.priority,
      priceMismatch: !!b.priceMismatch,
      delivery: typeof b.delivery === 'object' && b.delivery ? b.delivery : {},
      buyer: { id: b.buyer.id, name: b.buyer.name },
    });
    res.status(201).json(publicView(o));
    postOrder(client, o).catch(err => console.error('[store] gagal posting order:', err.message));
  });

  app.get('/orders/:id', auth, (req, res) => {
    const o = own(req, res);
    if (o) res.json(publicView(o));
  });

  app.get('/orders/:id/qris', auth, async (req, res) => {
    const o = own(req, res);
    if (!o) return;
    if (!process.env.QRIS_STRING || !validate(process.env.QRIS_STRING).ok) return res.status(503).json({ error: 'qris_not_configured' });
    if (o.status !== 'awaiting') return res.status(410).json({ error: 'not_awaiting' });
    const png = await qrisPng(process.env.QRIS_STRING, o.total);
    res.set('Cache-Control', 'private, max-age=600').type('png').send(png);
  });

  /* ---------- Admin (dashboard web, password dicek di server Next) ---------- */
  const adminView = ({ channelId, messageId, ...o }) => ({ ...o, posted: Boolean(messageId) });

  app.get('/admin/orders', auth, (_req, res) => {
    for (const o of orders.overdue()) {
      const next = orders.transition(o.id, 'expired');
      if (next) refreshMessage(client, next);
    }
    res.set('Cache-Control', 'no-store').json({ orders: orders.all().map(adminView) });
  });

  app.post('/admin/orders/:id/status', auth, async (req, res) => {
    const status = req.body?.status;
    const o = ID_RE.test(req.params.id) ? orders.get(req.params.id) : null;
    if (!o) return res.status(404).json({ error: 'not_found' });
    const next = STATUS[status] && orders.transition(o.id, status, { updatedBy: 'admin (web)' });
    if (!next) return res.status(409).json({ error: 'invalid_transition', order: adminView(o) });
    res.json({ order: adminView(next) });
    refreshMessage(client, next);
    dmBuyer(client, next, BUYER_DM[status]);
  });

  app.post('/orders/:id/cancel', auth, async (req, res) => {
    const o = own(req, res);
    if (!o) return;
    const next = orders.transition(o.id, 'cancelled', { updatedBy: 'pembeli (web)' });
    if (!next) return res.status(409).json(publicView(o));
    res.json(publicView(next));
    refreshMessage(client, next);
  });

  // Kirim embed order yang tertunda (bot baru online / sempat gagal kirim)
  const flush = () => {
    for (const o of orders.unposted()) postOrder(client, o).catch(err => console.error('[store] gagal posting order:', err.message));
  };
  client.on(Events.ClientReady, flush);

  // Order lewat batas bayar -> kedaluwarsa (embed ikut diperbarui)
  setInterval(() => {
    flush();
    for (const o of orders.overdue()) {
      const next = orders.transition(o.id, 'expired');
      if (next) refreshMessage(client, next);
    }
  }, 30_000).unref();

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`[store] API toko aktif di port ${port}`));
}

module.exports = { startStoreApi, handleOrderButton };
