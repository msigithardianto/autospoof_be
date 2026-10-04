const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { OPT_OUT_ROLE } = require('./pp');

module.exports = {
  data: new SlashCommandBuilder().setName('ppoptout').setDescription('Tidak mau fotomu muncul di /pp? Pakai ini (jalankan lagi untuk membatalkan)'),
  async execute(interaction) {
    const { guild, member } = interaction;
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === OPT_OUT_ROLE);
    try {
      role ??= await guild.roles.create({ name: OPT_OUT_ROLE, reason: 'Role opt-out /pp' });
      const has = member.roles.cache.has(role.id);
      await (has ? member.roles.remove(role) : member.roles.add(role));
      await interaction.reply({ content: has ? '✅ Fotomu boleh muncul lagi di `/pp`.' : '✅ Fotomu tidak akan muncul di `/pp` lagi.', flags: MessageFlags.Ephemeral });
    } catch (err) {
      console.error('[ppoptout]', err.message);
      await interaction.reply({ content: 'Aku tidak punya izin **Manage Roles** untuk mengatur ini. Minta admin memberi role `no-pp` secara manual.', flags: MessageFlags.Ephemeral });
    }
  },
};
