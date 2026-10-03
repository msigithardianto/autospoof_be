const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ask, format, checkCooldown } = require('../ai');

const KATEGORI = {
  free_asset: 'free asset kecil yang bisa dibagikan gratis (mis. UI kit, script utilitas, preset, efek, model, suara)',
  map: 'map/lingkungan game yang bisa dijual atau dibagikan',
  sistem: 'sistem gameplay siap pakai (mis. inventory, shop, quest, daily reward, server list/server browser, leaderboard, trading)',
  ui: 'paket UI/HUD (menu, shop, inventory, notifikasi, loading screen)',
  script: 'script/module Luau yang berguna untuk developer lain',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ide').setDescription('Bingung mau bikin apa? Minta ide Roblox ke arr')
    .addStringOption(o => o.setName('kategori').setDescription('Jenis ide').setRequired(true)
      .addChoices(
        { name: 'Free asset', value: 'free_asset' },
        { name: 'Map', value: 'map' },
        { name: 'Sistem', value: 'sistem' },
        { name: 'UI', value: 'ui' },
        { name: 'Script', value: 'script' },
      ))
    .addStringOption(o => o.setName('tema').setDescription('Tema/genre (opsional), mis. tycoon, horror, simulator').setMaxLength(100))
    .addIntegerOption(o => o.setName('jumlah').setDescription('Jumlah ide (default 5)').setMinValue(1).setMaxValue(10)),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply();

    const kategori = interaction.options.getString('kategori');
    const tema = interaction.options.getString('tema');
    const jumlah = interaction.options.getInteger('jumlah') ?? 5;
    const prompt = `Beri ${jumlah} ide ${KATEGORI[kategori]} untuk Roblox${tema ? ` dengan tema/genre "${tema}"` : ''}. ` +
      'Untuk tiap ide tulis: **Nama**, deskripsi 1-2 kalimat, tingkat kesulitan (mudah/sedang/sulit), dan alasan kenapa laku/berguna. ' +
      'Prioritaskan ide yang realistis dibuat sendiri oleh developer solo dan sedang dicari orang. Jangan basa-basi, langsung daftar.';

    const answer = await ask(interaction.channelId, interaction.user.displayName, prompt, {
      noHistory: true,
      extra: 'Tugasmu sekarang: brainstorming ide produk Roblox. Abaikan topik lain.',
    });
    const { first, rest } = format(answer);
    await interaction.editReply(first);
    for (const part of rest) await interaction.followUp(part);
  },
};
