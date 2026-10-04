const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('avatar').setDescription('Lihat foto profil seseorang dalam ukuran besar')
    .addUserOption(o => o.setName('user').setDescription('Pengguna (default: kamu)')),
  async execute(interaction) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const embed = new EmbedBuilder().setColor(0xd4af37).setTitle(`Avatar ${user.displayName}`).setImage(url);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Buka ukuran penuh').setStyle(ButtonStyle.Link).setURL(user.displayAvatarURL({ size: 4096, extension: 'png' })));
    await interaction.reply({ embeds: [embed], components: [row] });
  },
};
