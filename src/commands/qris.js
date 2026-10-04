const { SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const { qrisPng } = require('../qris');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('qris').setDescription('Buat QRIS dengan nominal tertentu')
    .addIntegerOption(o => o.setName('nominal').setDescription('Nominal dalam Rupiah').setMinValue(1).setRequired(true)),
  async execute(interaction) {
    if (!process.env.QRIS_STRING) {
      return interaction.reply({ content: 'QRIS_STRING belum diisi di .env.', flags: MessageFlags.Ephemeral });
    }
    const check = require('../qris').validate(process.env.QRIS_STRING);
    if (!check.ok) return interaction.reply({ content: `QRIS_STRING tidak valid: ${check.reason}. Admin: salin ulang teks QRIS ke Variables.`, flags: MessageFlags.Ephemeral });
    const nominal = interaction.options.getInteger('nominal');
    const png = await qrisPng(process.env.QRIS_STRING, nominal);
    await interaction.reply({
      content: `Total bayar: **Rp${nominal.toLocaleString('id-ID')}**\nScan QRIS di bawah, lalu kirim bukti transfer ke admin.`,
      files: [new AttachmentBuilder(png, { name: 'qris.png' })],
    });
  },
};
