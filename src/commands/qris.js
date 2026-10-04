const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { paymentPayload } = require('../qris');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('qris').setDescription('Tampilkan QR pembayaran dengan nominal tertentu')
    .addIntegerOption(o => o.setName('nominal').setDescription('Nominal dalam Rupiah').setMinValue(1).setRequired(true)),
  async execute(interaction) {
    const payload = await paymentPayload(interaction.options.getInteger('nominal'));
    if (payload.error) return interaction.reply({ content: payload.error, flags: MessageFlags.Ephemeral });
    await interaction.reply(payload);
  },
};
