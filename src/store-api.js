const crypto = require('crypto');
const express = require('express');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, FileUploadBuilder, LabelBuilder, MessageFlags, ModalBuilder,
  OAuth2Scopes, PermissionFlagsBits, TextInputBuilder, TextInputStyle, escapeMarkdown,
} = require('discord.js');
const { isHome, refreshShopGuilds } = require('./guard');
const { qrisPng, validate } = require('./qris');
const { storeUrl, learnStoreUrl } = require('./store-url');

/* Jembatan VOLT.STORE <-> bot. Data order ada di database toko (Supabase); bot hanya notifier:
   - store -> bot (HTTP, dikunci STORE_API_KEY): kirim/perbarui embed order, DM user, QRIS platform.
   - bot -> store: klik tombol status di Discord -> POST {alamat toko}/api/bot/orders/:id/status.
     Alamat toko = env STORE_URL, atau otomatis dari header x-store-url yang dikirim web (lihat store-url.js).
   Order toko resmi -> ORDER_CHANNEL_ID. Order toko seller -> channel toko (bila dipasang) atau DM seller. */

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
const cut = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));
const clip = (s, n) => escapeMarkdown(cut(s, n));
const NO_PING = { parse: [] };
// Izin minimal bot di server toko
const SHOP_PERMS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory,
];
const PERM_LABEL = new Map([
  [PermissionFlagsBits.ViewChannel, 'View Channel'],
  [PermissionFlagsBits.SendMessages, 'Send Messages'],
  [PermissionFlagsBits.EmbedLinks, 'Embed Links'],
  [PermissionFlagsBits.ReadMessageHistory, 'Read Message History'],
]);

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
      { name: 'Item', value: cut(lines || '-', 1024) },
      { name: 'Pembayaran', value: money },
      { name: 'Data pengiriman', value: cut(delivery || '-', 1024) },
    )
    .setFooter({ text: o.updatedBy ? `Terakhir diubah: ${clip(o.updatedBy, 60)}` : 'VOLT.STORE' })
    .setTimestamp(o.createdAt);
  if (o.priceMismatch) embed.addFields({ name: 'Peringatan', value: 'Cek nominal sebelum konfirmasi.' });
  if (o.proof?.images?.length) {
    const links = o.proof.images.map((u, i) => `[Foto ${i + 1}](${u})`).join(' · ');
    embed.addFields({ name: 'Bukti pengiriman', value: cut(`${links}${o.proof.note ? `\n${clip(o.proof.note, 300)}` : ''}`, 1024) });
    embed.setImage(o.proof.images[0]);
  }
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

const view = o => ({ embeds: [orderEmbed(o)], components: orderButtons(o), allowedMentions: NO_PING });

/** Foto bukti pengiriman sebagai embed gambar (DM pembeli). */
const proofEmbeds = o => (o?.proof?.images ?? []).slice(0, PROOF_MAX).map((u, i) =>
  new EmbedBuilder().setColor(STATUS.completed.color).setTitle(`Bukti pengiriman ${o.code}${o.proof.images.length > 1 ? ` (${i + 1})` : ''}`)
    .setDescription(i === 0 && o.proof.note ? clip(o.proof.note, 300) : null).setImage(u));

async function dm(client, userId, text, embeds = []) {
  if (!text || !DISCORD_ID.test(String(userId))) return false;
  const user = await client.users.fetch(userId).catch(() => null);
  return Boolean(await user?.send({ content: text, embeds, allowedMentions: NO_PING }).catch(() => null)); // DM tertutup -> abaikan
}

/** Kirim embed baru (channel admin / channel toko / DM seller), atau edit yang sudah ada. Mengembalikan referensi pesan. */
async function upsertOrderMessage(client, o, sellerDiscordId, sellerChannelId, ref) {
  if (ref?.channelId && ref?.messageId) {
    const channel = await client.channels.fetch(ref.channelId).catch(() => null);
    const msg = await channel?.messages?.fetch(ref.messageId).catch(() => null);
    if (msg) {
      await msg.edit(view(o));
      return ref;
    }
  }
  const send = async (channel, content) => {
    if (!channel?.isTextBased?.()) return null;
    const msg = await channel.send({ content, ...view(o) }).catch(() => null);
    return msg ? { channelId: channel.id, messageId: msg.id } : null;
  };
  if (!sellerDiscordId) {
    const official = process.env.ORDER_CHANNEL_ID ? await client.channels.fetch(process.env.ORDER_CHANNEL_ID).catch(() => null) : null;
    return send(official);
  }
  // Toko seller: channel toko dulu, cadangan DM ke pemilik toko
  if (sellerChannelId && DISCORD_ID.test(sellerChannelId)) {
    const shop = await client.channels.fetch(sellerChannelId).catch(() => null);
    const ok = await send(shop, 'Pesanan baru:');
    if (ok) return ok;
  }
  const user = DISCORD_ID.test(sellerDiscordId) ? await client.users.fetch(sellerDiscordId).catch(() => null) : null;
  return send(await user?.createDM().catch(() => null), 'Pesanan baru di tokomu:');
}

/* ---------- Tombol status ---------- */
const PROOF_MAX = 3;
const IMAGE_TYPES = /^image\/(png|jpe?g|webp)$/;

/** Modal "Selesai": foto bukti pengiriman wajib (1–3) + catatan opsional untuk pembeli. */
function proofModal(id) {
  return new ModalBuilder()
    .setCustomId(`orderproof:${id}`)
    .setTitle('Bukti pengiriman')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Foto bukti (wajib)')
        .setDescription('Screenshot bahwa pesanan sudah dikirim, mis. riwayat transfer Robux. Dilihat pembeli.')
        .setFileUploadComponent(new FileUploadBuilder().setCustomId('proof').setMinValues(1).setMaxValues(PROOF_MAX).setRequired(true)),
      new LabelBuilder()
        .setLabel('Catatan untuk pembeli (opsional)')
        .setTextInputComponent(new TextInputBuilder().setCustomId('note').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)),
    );
}

/** Tombol `order:<status>:<uuid>` -> diteruskan ke API toko (sumber data). "Selesai" membuka modal bukti dulu. */
async function handleOrderButton(interaction) {
  const [scope, status, id] = interaction.customId.split(':');
  if (scope !== 'order') return false;
  const reply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });

  if (!UUID_RE.test(id ?? '')) return reply('Order lama ini tidak lagi didukung. Kelola pesanan di dashboard VOLT.STORE.');
  if (!storeUrl()) return reply('Bot belum terhubung ke VOLT.STORE. Buka dashboard admin sekali (tab Sistem) agar terhubung otomatis, lalu coba lagi.');
  if (status === 'completed') return interaction.showModal(proofModal(id));

  await interaction.deferUpdate();
  return callStore(interaction, id, status, {});
}

/** Kiriman modal bukti -> tandai selesai beserta foto. */
async function handleProofModal(interaction) {
  const [scope, id] = interaction.customId.split(':');
  if (scope !== 'orderproof' || !UUID_RE.test(id ?? '')) return false;
  const files = [...(interaction.fields.getUploadedFiles('proof')?.values() ?? [])];
  if (!files.length || files.some(f => !IMAGE_TYPES.test(f.contentType ?? ''))) {
    return interaction.reply({ content: 'Bukti harus berupa foto (PNG, JPG, atau WEBP).', flags: MessageFlags.Ephemeral });
  }
  const note = interaction.fields.getTextInputValue('note')?.trim() || null;
  // Modal dibuka dari tombol di pesan -> deferUpdate memperbarui pesan embed yang sama
  await interaction.deferUpdate();
  return callStore(interaction, id, 'completed', { proof: files.slice(0, PROOF_MAX).map(f => f.url), note });
}

async function callStore(interaction, id, status, extra) {
  const base = storeUrl();
  const res = await fetch(`${base}/api/bot/orders/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.STORE_API_KEY ?? '' },
    body: JSON.stringify({
      status,
      actorId: interaction.user.id,
      actorName: interaction.user.username,
      admin: Boolean(interaction.inGuild() && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)),
      guildId: interaction.guildId ?? null,
      home: Boolean(interaction.inGuild() && isHome(interaction.guildId)),
      ...extra,
    }),
    // Selesai: toko mengunduh & menyimpan foto bukti → beri waktu lebih
    signal: AbortSignal.timeout(status === 'completed' ? 25000 : 10000),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);

  if (data?.order) await interaction.editReply(view(data.order)).catch(() => {});
  if (res?.ok) await dm(interaction.client, data.order.buyer.id, data.dmBuyer, proofEmbeds(data.order));
  else {
    const msg = res?.status === 403 ? 'Kamu tidak berhak mengubah order ini.'
      : res?.status === 409 ? 'Status order sudah berubah — pesan diperbarui.'
      : res?.status === 400 && data?.error && !/^[a-z_]+$/.test(data.error) ? data.error
      : 'Gagal menghubungi VOLT.STORE. Coba lagi.';
    await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return true;
}

/* ---------- HTTP API ---------- */
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const keyValid = req => Boolean(process.env.STORE_API_KEY) && crypto.timingSafeEqual(sha(req.get('x-api-key') ?? ''), sha(process.env.STORE_API_KEY));

function auth(req, res, next) {
  if (!process.env.STORE_API_KEY) return res.status(503).json({ error: 'store_api_key_not_set' });
  if (!keyValid(req)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

/** Request ber-key dari web membawa alamatnya sendiri → bot tahu ke mana memanggil balik (tanpa STORE_URL manual). */
function learnOrigin(req, _res, next) {
  if (req.get('x-store-url') && keyValid(req) && learnStoreUrl(req.get('x-store-url'))) refreshShopGuilds(true).catch(() => {});
  next();
}

function startStoreApi(client) {
  // Server HTTP selalu jalan supaya /health bisa dipakai cek konfigurasi dari browser
  if (!process.env.STORE_API_KEY) console.warn('[store] STORE_API_KEY kosong — endpoint toko menolak semua request (503).');
  if (!storeUrl()) console.warn('[store] alamat toko belum diketahui — terisi otomatis saat web pertama kali menghubungi bot (atau isi STORE_URL).');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(learnOrigin);

  app.get('/health', (_req, res) =>
    res.json({
      ok: true,
      version: (process.env.RAILWAY_GIT_COMMIT_SHA || 'lokal').slice(0, 7),
      discord: client.isReady(),
      storeApiKey: Boolean(process.env.STORE_API_KEY),
      storeUrl: Boolean(storeUrl()),
      orderChannel: Boolean(process.env.ORDER_CHANNEL_ID),
      qris: Boolean(process.env.QRIS_STRING) && validate(process.env.QRIS_STRING).ok,
    }));

  // Kirim / perbarui embed order (+ DM pembeli bila status berubah)
  app.post('/notify/order', auth, async (req, res) => {
    const { order, sellerDiscordId, sellerChannelId, message, dmBuyer } = req.body ?? {};
    if (!order || !UUID_RE.test(order.id ?? '') || !Array.isArray(order.lines)) return res.status(400).json({ error: 'invalid_order' });
    if (!client.isReady()) return res.status(503).json({ error: 'discord_not_ready' });
    const ref = await upsertOrderMessage(client, order, sellerDiscordId || null, sellerChannelId || null, message).catch(err => {
      console.error('[store] gagal kirim embed order:', err.message);
      return null;
    });
    if (dmBuyer) await dm(client, order.buyer?.id, String(dmBuyer).slice(0, 1800), order.status === 'completed' ? proofEmbeds(order) : []);
    res.json({ message: ref });
  });

  // Link undangan bot untuk server toko (izin minimal, tanpa slash command)
  app.get('/discord/invite', auth, (_req, res) => {
    if (!client.isReady()) return res.status(503).json({ error: 'discord_not_ready' });
    res.json({ url: client.generateInvite({ scopes: [OAuth2Scopes.Bot], permissions: SHOP_PERMS }) });
  });

  // Hubungkan channel toko: verifikasi bot bisa kirim & pemilik toko punya izin Manage Server di server itu
  app.post('/discord/link', auth, async (req, res) => {
    const { channelId, userId, shopName } = req.body ?? {};
    if (!DISCORD_ID.test(String(channelId)) || !DISCORD_ID.test(String(userId))) return res.status(400).json({ error: 'Channel ID tidak valid (17–20 digit angka).' });
    if (!client.isReady()) return res.status(503).json({ error: 'Bot sedang offline. Coba lagi sebentar.' });

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.guild) return res.status(400).json({ error: 'Channel tidak ditemukan. Undang bot ke servermu dulu, lalu salin ID text channel.' });
    if (!channel.isTextBased() || channel.isThread() || channel.isVoiceBased()) return res.status(400).json({ error: 'Pilih text channel biasa (bukan thread / voice).' });

    const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe().catch(() => null));
    const perms = me && channel.permissionsFor(me);
    const missing = SHOP_PERMS.filter(p => !perms?.has(p)).map(p => PERM_LABEL.get(p));
    if (missing.length) return res.status(400).json({ error: `Bot belum punya izin di channel itu: ${missing.join(', ')}.` });

    const member = await channel.guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(403).json({ error: 'Akun Discord-mu bukan anggota server itu.' });
    if (!member.permissions.has(PermissionFlagsBits.ManageGuild)) return res.status(403).json({ error: 'Kamu butuh izin Manage Server di server itu.' });

    await channel.send({ content: `Channel ini terhubung ke toko **${clip(shopName, 40)}** di VOLT.STORE. Pesanan baru akan muncul di sini.`, allowedMentions: NO_PING }).catch(() => {});
    refreshShopGuilds(true);
    res.json({ guildId: channel.guild.id, guildName: cut(channel.guild.name, 100), channelName: cut(channel.name, 100) });
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

module.exports = { startStoreApi, handleOrderButton, handleProofModal };
