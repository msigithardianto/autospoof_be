const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ask, chunk, checkCooldown } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tanya').setDescription('Tanya apa saja ke arr (AI)')
    .addStringOption(o => o.setName('pertanyaan').setDescription('Pertanyaanmu').setMaxLength(1500).setRequired(true)),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const answer = await ask(interaction.channelId, interaction.user.displayName, interaction.options.getString('pertanyaan'));
    const [first, ...rest] = chunk(answer);
    await interaction.editReply(first);
    for (const part of rest) await interaction.followUp(part);
  },
};
