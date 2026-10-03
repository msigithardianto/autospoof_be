const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { ask, listModels, resolveModel } = require('../ai');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aitest').setDescription('Tes koneksi AI (admin) dan tampilkan penyebab error')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const env = ['AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL'].map(k => `${k}: ${process.env[k] ? (k === 'AI_API_KEY' ? 'terisi' : process.env[k]) : '(kosong/default)'}`).join('\n');
    try {
      const model = await resolveModel();
      const answer = await ask(`aitest-${interaction.id}`, 'admin', 'Balas satu kata: OK');
      await interaction.editReply(`✅ AI jalan. Model dipakai: **${model}**\nJawaban: ${answer.slice(0, 200)}\n\`\`\`${env}\`\`\``);
    } catch (err) {
      console.error('[ai] ERROR:', err);
      let models = '(gagal mengambil daftar model)';
      try { models = (await listModels()).slice(0, 25).join(', '); } catch {}
      await interaction.editReply(`❌ AI error:\n\`\`\`${String(err.message).slice(0, 600)}\`\`\`\nModel tersedia: ${models.slice(0, 700)}\n\`\`\`${env}\`\`\``);
    }
  },
};
