const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { bannerSvg, SIZES } = require('../design/banner');
const E = require('../design/engine');
const { designBrief, checkCooldown } = require('../ai');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'banner';
const STYLE_NAMES = { elegan: 'Elegan', modern: 'Modern', minimal: 'Minimal' };

module.exports = {
  data: new SlashCommandBuilder().setName('banner').setDescription('Buat banner elegan & modern (PNG + SVG)')
    .addStringOption(o => o.setName('judul').setDescription('Judul utama').setMaxLength(40).setRequired(true))
    .addStringOption(o => o.setName('subjudul').setDescription('Teks kecil di bawah judul (opsional)').setMaxLength(60))
    .addStringOption(o => o.setName('ukuran').setDescription('Ukuran banner (default: Discord)')
      .addChoices(...Object.entries(SIZES).map(([value, s]) => ({ name: s.name, value }))))
    .addStringOption(o => o.setName('gaya').setDescription('Gaya desain (default: elegan)')
      .addChoices({ name: 'Elegan (bingkai emas, serif)', value: 'elegan' }, { name: 'Modern (geometris, rata kiri)', value: 'modern' }, { name: 'Minimal (bersih, banyak ruang)', value: 'minimal' }))
    .addStringOption(o => o.setName('warna').setDescription('Palet warna (default: emas klasik)')
      .addChoices(...Object.entries(E.PALETTES).map(([value, p]) => ({ name: p.name, value }))))
    .addStringOption(o => o.setName('ide').setDescription('Ceritakan temanya, AI pilihkan subjudul/gaya/warna yang pas').setMaxLength(200)),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    const title = E.clean(interaction.options.getString('judul'));
    if (!title) return interaction.reply({ content: 'Judul tidak valid (karakter tidak didukung font).', flags: MessageFlags.Ephemeral });

    await interaction.deferReply();
    const brief = await designBrief(title, interaction.options.getString('ide'));
    const subtitle = interaction.options.getString('subjudul') ?? brief?.tagline ?? '';
    const style = interaction.options.getString('gaya') ?? brief?.style ?? 'elegan';
    const palette = interaction.options.getString('warna') ?? brief?.palette ?? 'gold';
    const size = interaction.options.getString('ukuran') ?? 'discord';

    const { svg, width } = bannerSvg({ title, subtitle, style, palette, size });
    const png = E.render(svg, width);
    const base = slug(title);
    await interaction.editReply({
      content: `🎨 Banner **${title}** — ${SIZES[size].name} • ${STYLE_NAMES[style]} • ${E.PALETTES[palette].name}${brief ? ' (diarahkan AI)' : ''}`,
      files: [new AttachmentBuilder(png, { name: `${base}-banner.png` }), new AttachmentBuilder(Buffer.from(svg), { name: `${base}-banner.svg` })],
    });
  },
};
