const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Cek bot hidup'),
  async execute(interaction) {
    await interaction.reply(`Pong! ${Math.round(interaction.client.ws.ping)}ms`);
  },
};
