const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ask, format, checkCooldown } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tanya').setDescription('Tanya apa saja ke arr (AI)')
    .addStringOption(o => o.setName('pertanyaan').setDescription('Pertanyaanmu').setMaxLength(1500).setRequired(true)),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const answer = await ask(interaction.channelId, interaction.user.displayName, interaction.options.getString('pertanyaan'));
    const { first, rest, files } = format(answer);
    await interaction.editReply({ content: first, files });
    for (const part of rest) await interaction.followUp(part);
  },
};
