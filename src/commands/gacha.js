const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { load, roll, remainingMs, markUsed, formatDuration } = require('../gacha');

module.exports = {
  data: new SlashCommandBuilder().setName('gacha').setDescription('Gacha free asset! Dapatkan asset gratis secara acak'),
  async execute(interaction) {
    const cfg = load();
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
    const wait = isAdmin ? 0 : remainingMs(interaction.user.id, cfg);
    if (wait) {
      return interaction.reply({ content: `⏳ Kamu sudah gacha. Coba lagi dalam **${formatDuration(wait)}**.`, flags: MessageFlags.Ephemeral });
    }
    const result = roll(cfg);
    if (!result) return interaction.reply({ content: 'Belum ada asset di gacha.', flags: MessageFlags.Ephemeral });
    if (!isAdmin) markUsed(interaction.user.id);

    const { asset, rarity } = result;
    const embed = new EmbedBuilder()
      .setColor(Number(rarity.color))
      .setTitle(`${rarity.emoji} ${rarity.label} — ${asset.nama}`)
      .setDescription(asset.deskripsi || '-')
      .setFooter({ text: `Gacha oleh ${interaction.user.displayName}` });
    const payload = { content: `🎁 ${interaction.user} mendapatkan:`, embeds: [embed] };
    if (/^https?:\/\//.test(asset.link || '')) {
      payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ambil asset').setStyle(ButtonStyle.Link).setURL(asset.link))];
    }
    await interaction.reply(payload);
  },
};
