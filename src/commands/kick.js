const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick').setDescription('Kick member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('alasan').setDescription('Alasan'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('alasan') ?? 'Tanpa alasan';
    if (!member) return interaction.reply({ content: 'Member tidak ditemukan.', flags: MessageFlags.Ephemeral });
    if (!member.kickable) return interaction.reply({ content: 'Aku tidak bisa kick member ini (role lebih tinggi).', flags: MessageFlags.Ephemeral });
    await member.kick(`${interaction.user.tag}: ${reason}`);
    await interaction.reply(`👢 ${member.user.tag} di-kick. Alasan: ${reason}`);
  },
};
