const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { logoSvg } = require('../design/logo');
const E = require('../design/engine');
const { designBrief, checkCooldown } = require('../ai');

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'logo';
const STYLE_NAMES = { elegan: 'Elegan', modern: 'Modern', minimal: 'Minimal' };

module.exports = {
  data: new SlashCommandBuilder().setName('logo').setDescription('Buat logo elegan & modern (PNG + SVG)')
    .addStringOption(o => o.setName('nama').setDescription('Nama brand/studio').setMaxLength(30).setRequired(true))
    .addStringOption(o => o.setName('tagline').setDescription('Tagline di bawah nama (opsional)').setMaxLength(40))
    .addStringOption(o => o.setName('gaya').setDescription('Gaya desain (default: elegan)')
      .addChoices({ name: 'Elegan (lambang lingkaran, serif)', value: 'elegan' }, { name: 'Modern (heksagon, geometris)', value: 'modern' }, { name: 'Minimal (wordmark bersih)', value: 'minimal' }))
    .addStringOption(o => o.setName('warna').setDescription('Palet warna (default: emas klasik)')
      .addChoices(...Object.entries(E.PALETTES).map(([value, p]) => ({ name: p.name, value }))))
    .addBooleanOption(o => o.setName('transparan').setDescription('Latar transparan (PNG) untuk ditempel di desain lain'))
    .addStringOption(o => o.setName('ide').setDescription('Ceritakan brand-nya, AI pilihkan tagline/gaya/warna yang pas').setMaxLength(200)),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    const name = E.clean(interaction.options.getString('nama'));
    if (!name) return interaction.reply({ content: 'Nama tidak valid (karakter tidak didukung font).', flags: MessageFlags.Ephemeral });

    await interaction.deferReply();
    const brief = await designBrief(name, interaction.options.getString('ide'));
    const tagline = interaction.options.getString('tagline') ?? brief?.tagline ?? '';
    const style = interaction.options.getString('gaya') ?? brief?.style ?? 'elegan';
    const palette = interaction.options.getString('warna') ?? brief?.palette ?? 'gold';
    const transparent = interaction.options.getBoolean('transparan') ?? false;

    const svg = logoSvg({ name, tagline, style, palette, transparent });
    const png = E.render(svg, 1024);
    const base = slug(name);
    await interaction.editReply({
      content: `✨ Logo **${name}** — gaya ${STYLE_NAMES[style]} • ${E.PALETTES[palette].name}${brief ? ' (diarahkan AI)' : ''}\nMau variasi lain? Jalankan lagi dengan \`gaya\` atau \`warna\` berbeda. File SVG bisa di-scale tanpa pecah.`,
      files: [new AttachmentBuilder(png, { name: `${base}-logo.png` }), new AttachmentBuilder(Buffer.from(svg), { name: `${base}-logo.svg` })],
    });
  },
};
