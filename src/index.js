require('dotenv').config({ quiet: true });
console.log('[bot] Memulai... env:', ['DISCORD_TOKEN','CLIENT_ID','GUILD_ID','AI_API_KEY','QRIS_STRING'].map(k => `${k}=${process.env[k] ? 'ada' : 'KOSONG'}`).join(' '));
const fs = require('fs');
const path = require('path');
const { qrisPng } = require('./qris');
const { ask, format, checkCooldown, wantsUi } = require('./ai');
const { Client, Collection, GatewayIntentBits, Events, MessageFlags, AttachmentBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // aktifkan juga di Developer Portal -> Bot -> Message Content Intent
  ],
});

client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const cmd = require(path.join(commandsDir, file));
  client.commands.set(cmd.data.name, cmd);
}

client.once(Events.ClientReady, c => console.log(`Online sebagai ${c.user.tag}`));

client.on(Events.InteractionCreate, async interaction => {
  const isModal = interaction.isModalSubmit();
  if (!interaction.isChatInputCommand() && !isModal) return;
  const cmd = isModal
    ? client.commands.find(c => c.modalId === interaction.customId)
    : client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await (isModal ? cmd.handleModal(interaction) : cmd.execute(interaction));
  } catch (err) {
    console.error(err);
    const msg = { content: 'Terjadi error saat menjalankan command.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
    else await interaction.reply(msg);
  }
});

// Auto-reply: kata kunci "qris" dan FAQ (src/data/faq.json)
client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  delete require.cache[require.resolve('./data/faq.json')];
  const { qris, faq } = require('./data/faq.json');
  const text = message.content.toLowerCase();
  const has = triggers => triggers.some(t => text.includes(t));

  if (has(qris.triggers)) {
    // "qris 50000" / "qris 50k" -> QRIS dinamis dengan nominal (butuh QRIS_STRING di .env)
    const m = text.match(/(\d[\d.]*)\s*(k|rb|ribu)?\b/);
    if (m && process.env.QRIS_STRING) {
      let amount = parseInt(m[1].replace(/\./g, ''), 10);
      if (m[2]) amount *= 1000;
      if (amount >= 1000 && amount <= 100000000) {
        const png = await qrisPng(process.env.QRIS_STRING, amount);
        return message.reply({
          content: `Total bayar: **Rp${amount.toLocaleString('id-ID')}**. Scan lalu kirim bukti transfer ke admin.`,
          files: [new AttachmentBuilder(png, { name: 'qris.png' })],
        });
      }
    }
    const imgPath = path.join(__dirname, '..', qris.image);
    const payload = { content: qris.text };
    if (fs.existsSync(imgPath)) payload.files = [new AttachmentBuilder(imgPath)];
    else payload.content += '\n(Gambar QRIS belum diupload ke assets/qris.png)';
    return message.reply(payload);
  }
  const hit = faq.find(f => has(f.triggers));
  if (hit) return message.reply(hit.text);

  // AI: dijawab jika bot di-mention, di-reply, atau di channel khusus AI (AI_CHANNEL_ID)
  const mentioned = message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true });
  const inAiChannel = process.env.AI_CHANNEL_ID && message.channelId === process.env.AI_CHANNEL_ID;
  if (!mentioned && !inAiChannel) return;
  const question = message.content.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  // Jika user me-reply sebuah pesan (mis. error dari orang lain), sertakan isinya sebagai konteks
  let quoted = '';
  if (message.reference?.messageId) {
    const ref = await message.fetchReference().catch(() => null);
    if (ref?.content) quoted = `\n\n[Pesan yang di-reply, dari ${ref.member?.displayName ?? ref.author.username}]:\n${ref.content.slice(0, 3000)}`;
  }
  // Lampiran teks/kode (.lua, .txt, .log, ...) ikut dibaca
  let files = '';
  for (const att of [...message.attachments.values()].slice(0, 3)) {
    if (!/\.(lua|luau|txt|log|json|md)$/i.test(att.name ?? '') || att.size > 100000) continue;
    const r = await fetch(att.url, { signal: AbortSignal.timeout(10000) }).catch(() => null);
    if (r?.ok) files += `\n\n[Lampiran ${att.name}]:\n${(await r.text()).slice(0, 6000)}`;
  }
  if (!question && !quoted && !files) return message.reply('Ya? Mau tanya apa? 😄');
  // Mode debugging otomatis kalau terlihat seperti error/kode
  const isScript = /\b(buat(kan|in)?|bikin(in|kan)?|generate|tulis(kan)?)\b[^.\n]{0,40}\b(script|sistem|system|module|ui|gui)\b/i.test(question);
  const debug = /error|bug|attempt to|nil|not a valid member|infinite yield|exception|stack|gagal|kenapa|lua|script|```/i.test(question + quoted + files);
  const wait = checkCooldown(message.author.id);
  if (wait) return message.reply(`Tunggu ${wait} detik dulu ya.`);
  try {
    await message.channel.sendTyping();
    const answer = await ask(message.channelId, message.member?.displayName ?? message.author.username, question + quoted + files, { knowledge: debug || isScript, script: isScript, ui: isScript && wantsUi(question) });
    const { first, rest, files: codeFiles } = format(answer);
    await message.reply({ content: first, files: codeFiles, allowedMentions: { parse: [], repliedUser: false } });
    for (const part of rest) await message.channel.send({ content: part, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error('[ai] ERROR:', err.message);
    message.reply('Maaf, AI lagi error. Coba lagi nanti.');
  }
});

const hints = {
  TokenInvalid: 'DISCORD_TOKEN salah/kosong/sudah direset. Isi token terbaru di Variables.',
  DisallowedIntents: 'Aktifkan "Message Content Intent" di Developer Portal -> Bot, lalu Save Changes.',
};
if (!process.env.DISCORD_TOKEN) {
  console.error('LOGIN GAGAL: DISCORD_TOKEN belum diisi di Variables.');
  process.exit(1);
}
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error(`LOGIN GAGAL [${err.code ?? 'ERR'}]: ${err.message}`);
  const key = /disallowed intents/i.test(err.message) ? 'DisallowedIntents' : /invalid token/i.test(err.message) ? 'TokenInvalid' : err.code;
  if (hints[key]) console.error(`SOLUSI: ${hints[key]}`);
  process.exit(1);
});
