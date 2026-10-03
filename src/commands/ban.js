const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban').setDescription('Ban member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption(o => o.setName('alasan').setDescription('Alasan'))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('alasan') ?? 'Tanpa alasan';
    if (member && !member.bannable) return interaction.reply({ content: 'Aku tidak bisa ban member ini (role lebih tinggi).', flags: MessageFlags.Ephemeral });
    await interaction.guild.members.ban(user, { reason: `${interaction.user.tag}: ${reason}` });
    await interaction.reply(`🔨 ${user.tag} di-ban. Alasan: ${reason}`);
  },
};
