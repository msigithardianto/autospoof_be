const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { ask, format, checkCooldown } = require('../ai');

const JENIS = { otomatis: 'Pilih jenis & letak yang paling tepat', server: 'Script (server)', client: 'LocalScript (client)', module: 'ModuleScript' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('script').setDescription('Minta arr membuatkan script Roblox (Luau) lengkap')
    .addStringOption(o => o.setName('deskripsi').setDescription('Script apa yang kamu mau? Jelaskan sedetail mungkin').setMaxLength(1500).setRequired(true))
    .addStringOption(o => o.setName('jenis').setDescription('Jenis script (default: otomatis)')
      .addChoices({ name: 'Otomatis', value: 'otomatis' }, { name: 'Script (server)', value: 'server' }, { name: 'LocalScript (client)', value: 'client' }, { name: 'ModuleScript', value: 'module' })),
  async execute(interaction) {
    const wait = checkCooldown(interaction.user.id);
    if (wait) return interaction.reply({ content: `Tunggu ${wait} detik dulu ya.`, flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const jenis = interaction.options.getString('jenis') ?? 'otomatis';
    const prompt = `Buatkan script Roblox: ${interaction.options.getString('deskripsi')}\nJenis: ${JENIS[jenis]}.`;
    const answer = await ask(interaction.channelId, interaction.user.displayName, prompt, { noHistory: true, knowledge: true, script: true });
    const { first, rest, files } = format(answer);
    await interaction.editReply({ content: first, files });
    for (const part of rest) await interaction.followUp(part);
  },
};
