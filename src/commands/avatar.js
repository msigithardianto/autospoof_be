const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { COLOR } = require('../theme');
const { frameImage, fetchBuffer } = require('../design/frame');

module.exports = {
  data: new SlashCommandBuilder().setName('avatar').setDescription('Lihat foto profil seseorang dalam bingkai dark gold')
    .addUserOption(o => o.setName('user').setDescription('Pengguna (default: kamu)'))
    .addBooleanOption(o => o.setName('bingkai').setDescription('Pakai bingkai dark gold (default: ya)')),
  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') ?? interaction.user;
    const framed = interaction.options.getBoolean('bingkai') ?? true;
    const url = user.displayAvatarURL({ size: 1024, extension: 'png', forceStatic: true });
    const full = user.displayAvatarURL({ size: 4096, extension: 'png', forceStatic: true });
    const embed = new EmbedBuilder().setColor(COLOR);
    const payload = {};
    try {
      if (!framed) throw new Error('tanpa bingkai');
      const png = frameImage(await fetchBuffer(url), { caption: user.displayName });
      payload.files = [new AttachmentBuilder(png, { name: 'avatar.png' })];
      embed.setImage('attachment://avatar.png');
    } catch (err) {
      if (framed) console.error('[avatar] bingkai gagal, pakai gambar asli:', err.message);
      embed.setTitle(`Avatar ${user.displayName}`).setImage(url);
    }
    payload.embeds = [embed];
    payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Buka ukuran penuh').setStyle(ButtonStyle.Link).setURL(full))];
    await interaction.editReply(payload);
  },
};
