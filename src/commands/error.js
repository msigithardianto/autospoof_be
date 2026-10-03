const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const { ask, chunk, checkCooldown } = require('../ai');

const ID = 'error-modal';

module.exports = {
  data: new SlashCommandBuilder().setName('error').setDescription('Tempel error/kode, arr bantu cari penyebab dan solusinya'),

  // Tampilkan form (multi-baris)
  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId(ID).setTitle('Bantu cari error')
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId('error').setLabel('Pesan error / masalahnya').setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Mis. ServerScriptService.Main:12: attempt to index nil with \'Name\'').setMaxLength(2000).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId('kode').setLabel('Kode terkait (opsional)').setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Tempel script yang error').setMaxLength(3000).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder()
          .setCustomId('konteks').setLabel('Konteks (opsional)').setStyle(TextInputStyle.Short)
          .setPlaceholder('Mis. Script di ServerScriptService, terjadi saat player join').setMaxLength(300).setRequired(false)),
      );
    await interaction.showModal(modal);
  },

  modalId: ID,
  async handleModal(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply();

    const error = interaction.fields.getTextInputValue('error');
    const kode = interaction.fields.getTextInputValue('kode');
    const konteks = interaction.fields.getTextInputValue('konteks');
    const prompt = `Bantu selesaikan masalah ini.\n\nERROR/MASALAH:\n${error}` +
      (konteks ? `\n\nKONTEKS:\n${konteks}` : '') +
      (kode ? `\n\nKODE:\n\`\`\`lua\n${kode}\n\`\`\`` : '');

    const answer = await ask(interaction.channelId, interaction.user.displayName, prompt, {
      noHistory: true,
      extra: 'Tugasmu sekarang: debugging. Format jawaban: (1) **Penyebab** singkat, (2) **Solusi** langkah demi langkah, (3) **Kode perbaikan** (Luau, jika relevan) dalam code block. ' +
        'Pahami error Roblox umum (attempt to index nil, X is not a valid member of Y, Infinite yield possible, DataStore request rejected/throttled, RemoteEvent salah sisi client/server). ' +
        'Kalau informasi kurang untuk memastikan penyebab, sebutkan kemungkinan paling umum dan minta info tambahan yang spesifik. Jangan mengarang API yang tidak ada.',
    });
    const [first, ...rest] = chunk(answer);
    await interaction.editReply(first);
    for (const part of rest) await interaction.followUp(part);
  },
};
