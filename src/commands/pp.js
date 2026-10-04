const fs = require('fs');
const path = require('path');
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const ROOT = path.join(__dirname, '..', '..', 'assets', 'pp');
const IMG = /\.(png|jpe?g|webp|gif)$/i;
const PREFIX = 'pp:';

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
  data: new SlashCommandBuilder().setName('pp').setDescription('Tampilkan PP (foto profil) acak')
    .addStringOption(o => {
      o.setName('kategori').setDescription('Kategori PP (default: acak)');
      const cats = categories().filter(c => filesIn(c).length).slice(0, 24);
      if (cats.length) o.addChoices({ name: 'Acak', value: 'acak' }, ...cats.map(c => ({ name: c, value: c })));
      return o;
    }),
  async execute(interaction) {
    const payload = buildPayload(interaction.options.getString('kategori'), interaction.user.displayName);
    await interaction.reply(payload ?? empty);
  },

  buttonPrefix: PREFIX,
  async handleButton(interaction) {
    const payload = buildPayload(interaction.customId.slice(PREFIX.length), interaction.user.displayName);
    if (!payload) return interaction.reply(empty);
    await interaction.update({ ...payload, attachments: [] }); // ganti gambar lama dengan yang baru
  },
};
