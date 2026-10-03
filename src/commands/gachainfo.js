const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { load, roll } = require('../gacha');

module.exports = {
  data: new SlashCommandBuilder().setName('gachainfo').setDescription('Lihat peluang dan daftar hadiah gacha'),
  async execute(interaction) {
    const cfg = load();
    const result = roll(cfg);
    const pools = result?.pools ?? [];
    const total = pools.reduce((s, p) => s + p.weight, 0);
    const embed = new EmbedBuilder().setColor(0xe67e22).setTitle('🎰 Info Gacha')
      .setDescription(`Bisa gacha **1x tiap ${cfg.cooldownHours} jam** dengan \`/gacha\`.`);
    for (const p of pools) {
      embed.addFields({
        name: `${p.emoji} ${p.label} — ${((p.weight / total) * 100).toFixed(1)}%`,
        value: p.items.map(i => `• ${i.nama}`).join('\n').slice(0, 1000),
      });
    }
    await interaction.reply({ embeds: [embed] });
  },
};
