const { SlashCommandBuilder } = require('discord.js');
const { listEmbed } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('mapready').setDescription('Daftar map yang ready dijual'),
  async execute(interaction) {
    delete require.cache[require.resolve('../data/maps.json')]; // reload tanpa restart
    const maps = require('../data/maps.json');
    await interaction.reply({ embeds: [listEmbed('🗺️ Map Ready', maps, 0x2ecc71)] });
  },
};
