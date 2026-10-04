const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const ROOT = path.join(__dirname, '..', '..', 'assets', 'pp');
const IMG = /\.(png|jpe?g|webp|gif)$/i;
const PREFIX = 'pp:';
const OPT_OUT_ROLE = 'no-pp'; // anggota dengan role ini tidak akan ditampilkan

// Daftar anggota di-cache 10 menit per server supaya tidak kena rate limit
const memberCache = new Map(); // guildId -> { at, list }
async function getMembers(guild) {
  const hit = memberCache.get(guild.id);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.list;
  const members = await guild.members.list({ limit: 1000 }); // butuh Server Members Intent aktif di Developer Portal
  const list = [...members.values()];
  memberCache.set(guild.id, { at: Date.now(), list });
  return list;
}

async function memberPayload(guild, who) {
  const all = await getMembers(guild);
  const eligible = all.filter(m => !m.user.bot && m.user.avatar && !m.roles.cache.some(r => r.name.toLowerCase() === OPT_OUT_ROLE));
  if (!eligible.length) return { content: 'Belum ada anggota dengan foto profil yang bisa ditampilkan.', flags: MessageFlags.Ephemeral };
  const m = rand(eligible);
  const embed = new EmbedBuilder().setColor(0xd4af37).setTitle(`🖼️ PP ${m.displayName}`)
    .setImage(m.displayAvatarURL({ size: 1024, extension: 'png' })).setFooter({ text: `Diminta oleh ${who} • tidak mau ditampilkan? pakai /ppoptout` });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}member`).setLabel('Acak lagi').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setLabel('Ukuran penuh').setStyle(ButtonStyle.Link).setURL(m.displayAvatarURL({ size: 4096, extension: 'png' })),
  );
  return { embeds: [embed], components: [row] };
}

const intentHelp = { content: 'Aku belum bisa membaca daftar anggota. Admin: aktifkan **Server Members Intent** di Developer Portal → Bot, simpan, lalu coba lagi.', flags: MessageFlags.Ephemeral };

async function payloadFor(guild, cat, who) {
  if (!cat || cat === 'member') {
    if (!guild) return { content: 'Mode anggota hanya bisa dipakai di server.', flags: MessageFlags.Ephemeral };
    try { return await memberPayload(guild, who); } catch (err) { console.error('[pp] gagal ambil anggota:', err.message); return intentHelp; }
  }
  return buildPayload(cat, who) ?? empty;
}

const categories = () => {
  try { return fs.readdirSync(ROOT, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; }
};
const filesIn = cat => {
  try { return fs.readdirSync(path.join(ROOT, cat)).filter(f => IMG.test(f)); } catch { return []; }
};
const rand = arr => arr[Math.floor(Math.random() * arr.length)];

// Pilih gambar: kategori tertentu atau acak dari semua kategori. Folder "couple" mengirim pasangan <id>_1 / <id>_2.
function pick(cat) {
  const cats = categories().filter(c => filesIn(c).length);
  if (!cats.length) return null;
  const chosen = cat && cat !== 'acak' && cats.includes(cat) ? cat : rand(cats);
  const files = filesIn(chosen);
  if (chosen === 'couple') {
    const ids = [...new Set(files.map(f => f.match(/^(.+)_[12]\.\w+$/)?.[1]).filter(Boolean))].filter(id => files.some(f => f.startsWith(`${id}_1.`)) && files.some(f => f.startsWith(`${id}_2.`)));
    if (ids.length) {
      const id = rand(ids);
      return { cat: chosen, paths: [1, 2].map(n => path.join(ROOT, chosen, files.find(f => f.startsWith(`${id}_${n}.`)))) };
    }
  }
  return { cat: chosen, paths: [path.join(ROOT, chosen, rand(files))] };
}

function buildPayload(cat, who) {
  const result = pick(cat);
  if (!result) return null;
  const files = result.paths.map((p, i) => new AttachmentBuilder(p, { name: `pp_${i + 1}${path.extname(p).toLowerCase()}` }));
  const embeds = files.map((f, i) => new EmbedBuilder().setColor(0xd4af37).setImage(`attachment://${f.name}`)
    .setTitle(i === 0 ? `🖼️ PP ${result.cat}` : null).setFooter(i === files.length - 1 ? { text: `Diminta oleh ${who}` } : null));
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${PREFIX}${cat || 'acak'}`).setLabel('Acak lagi').setEmoji('🔄').setStyle(ButtonStyle.Secondary));
  return { embeds, files, components: [row] };
}

const empty = { content: 'Koleksi PP masih kosong. Admin: upload gambar ke `assets/pp/<kategori>/` di repo (lihat `assets/pp/README.md`).', flags: MessageFlags.Ephemeral };

module.exports = {
  data: new SlashCommandBuilder().setName('pp').setDescription('Tampilkan PP (foto profil) acak anggota server atau koleksi')
    .addStringOption(o => {
      o.setName('sumber').setDescription('Dari mana PP diambil (default: anggota server)');
      const cats = categories().filter(c => filesIn(c).length).slice(0, 23);
      o.addChoices({ name: 'Anggota server', value: 'member' }, { name: 'Koleksi (acak)', value: 'acak' }, ...cats.map(c => ({ name: `Koleksi: ${c}`, value: c })));
      return o;
    }),
  async execute(interaction) {
    await interaction.deferReply();
    const payload = await payloadFor(interaction.guild, interaction.options.getString('sumber'), interaction.user.displayName);
    if (payload.flags) { await interaction.deleteReply(); return interaction.followUp(payload); }
    await interaction.editReply(payload);
  },

  buttonPrefix: PREFIX,
  async handleButton(interaction) {
    await interaction.deferUpdate();
    const payload = await payloadFor(interaction.guild, interaction.customId.slice(PREFIX.length), interaction.user.displayName);
    if (payload.flags) return interaction.followUp(payload);
    await interaction.editReply({ ...payload, attachments: [] }); // ganti gambar lama dengan yang baru
  },

  OPT_OUT_ROLE,
};
