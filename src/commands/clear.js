const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear').setDescription('Hapus pesan')
    .addIntegerOption(o => o.setName('jumlah').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const n = interaction.options.getInteger('jumlah');
    const deleted = await interaction.channel.bulkDelete(n, true); // true = lewati pesan >14 hari
    await interaction.reply({ content: `🧹 ${deleted.size} pesan dihapus.`, flags: MessageFlags.Ephemeral });
  },
};
