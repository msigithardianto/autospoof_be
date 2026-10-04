const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { resetHistory } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset').setDescription('Hapus ingatan percakapan arr di channel ini')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    resetHistory(interaction.channelId);
    await interaction.reply({ content: '🧠 Ingatan percakapan di channel ini sudah dihapus.', flags: MessageFlags.Ephemeral });
  },
};
