const { COLOR } = require('../theme');
const { SlashCommandBuilder } = require('discord.js');
const { listEmbed } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('sistemready').setDescription('Daftar sistem yang tersedia'),
  async execute(interaction) {
    delete require.cache[require.resolve('../data/systems.json')];
    const systems = require('../data/systems.json');
    await interaction.reply({ embeds: [listEmbed('⚙️ Sistem Ready', systems, COLOR)] });
  },
};
