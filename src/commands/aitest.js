const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { ask } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aitest').setDescription('Tes koneksi AI (admin) dan tampilkan penyebab error')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const env = ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL'].map(k => `${k}: ${process.env[k] ? (k === 'AI_API_KEY' ? 'terisi' : process.env[k]) : '(kosong/default)'}`).join('\n');
    try {
      const answer = await ask(`aitest-${interaction.id}`, 'admin', 'Balas satu kata: OK');
      await interaction.editReply(`✅ AI jalan.\nJawaban: ${answer.slice(0, 200)}\n\`\`\`${env}\`\`\``);
    } catch (err) {
      console.error('[ai] ERROR:', err);
      await interaction.editReply(`❌ AI error:\n\`\`\`${String(err.message).slice(0, 600)}\`\`\`\n\`\`\`${env}\`\`\``);
    }
  },
};
