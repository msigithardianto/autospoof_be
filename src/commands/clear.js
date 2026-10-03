const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear').setDescription('Hapus pesan di channel ini')
    .addIntegerOption(o => o.setName('jumlah').setDescription('Jumlah pesan (1-1000)').setMinValue(1).setMaxValue(1000).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(interaction) {
    const channel = interaction.channel;
    const needed = PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ViewChannel;
    if (!channel.permissionsFor(interaction.guild.members.me)?.has(needed)) {
      return interaction.reply({
        content: 'Aku belum punya izin **Manage Messages**, **Read Message History**, dan **View Channel** di channel ini. Atur di Edit Channel → Permissions, atau beri role bot izin tersebut.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let remaining = interaction.options.getInteger('jumlah');
    let total = 0;
    while (remaining > 0) {
      const deleted = await channel.bulkDelete(Math.min(100, remaining), true); // true = lewati pesan >14 hari
      if (deleted.size === 0) break;
      total += deleted.size;
      remaining -= deleted.size;
    }
    const note = total < interaction.options.getInteger('jumlah') ? '\n(Pesan lebih lama dari 14 hari tidak bisa dihapus massal oleh Discord.)' : '';
    await interaction.editReply(`🧹 ${total} pesan dihapus.${note}`);
    setTimeout(() => interaction.deleteReply().catch(() => {}), 5000); // bersihkan balasan ephemeral sendiri
  },
};
