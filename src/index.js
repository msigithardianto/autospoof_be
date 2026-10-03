require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
