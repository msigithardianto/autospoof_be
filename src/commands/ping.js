const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Cek bot hidup'),
  async execute(interaction) {
    const v = (process.env.RAILWAY_GIT_COMMIT_SHA || 'lokal').slice(0, 7);
    await interaction.reply(`Pong! ${Math.round(interaction.client.ws.ping)}ms • versi \`${v}\``);
  },
};
