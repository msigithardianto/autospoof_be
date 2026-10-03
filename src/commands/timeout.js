const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout').setDescription('Timeout (mute) member')
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
    .addIntegerOption(o => o.setName('menit').setDescription('Durasi (menit, maks 40320)').setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName('alasan').setDescription('Alasan'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const minutes = interaction.options.getInteger('menit');
    const reason = interaction.options.getString('alasan') ?? 'Tanpa alasan';
    if (!member) return interaction.reply({ content: 'Member tidak ditemukan.', flags: MessageFlags.Ephemeral });
    if (!member.moderatable) return interaction.reply({ content: 'Aku tidak bisa timeout member ini.', flags: MessageFlags.Ephemeral });
    await member.timeout(minutes * 60 * 1000, `${interaction.user.tag}: ${reason}`);
    await interaction.reply(`🔇 ${member.user.tag} di-timeout ${minutes} menit. Alasan: ${reason}`);
  },
};
