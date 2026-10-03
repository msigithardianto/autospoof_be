require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { qrisPng } = require('./qris');
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
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
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
  if (hit) message.reply(hit.text);
});

client.login(process.env.DISCORD_TOKEN);
