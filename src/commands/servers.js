const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { ownerId } = require('../guard');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('servers').setDescription('Daftar server tempat bot berada (khusus pemilik bot)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    if (interaction.user.id !== (await ownerId(interaction.client))) {
      return interaction.reply({ content: 'Hanya pemilik bot yang bisa memakai command ini.', flags: MessageFlags.Ephemeral });
    }
    const lines = interaction.client.guilds.cache.map(g => `• **${g.name}** — \`${g.id}\` — ${g.memberCount} anggota`);
    await interaction.reply({ content: `Bot ada di ${lines.length} server:\n${lines.join('\n')}`.slice(0, 1900), flags: MessageFlags.Ephemeral });
  },
};
