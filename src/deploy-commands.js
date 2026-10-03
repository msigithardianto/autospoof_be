// Mendaftarkan slash command ke Discord: npm run deploy
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter(k => !process.env[k]);
if (missing.length) {
  console.error(`[deploy] GAGAL: variabel belum diisi di Railway Variables: ${missing.join(', ')}`);
  process.exit(1);
}

const dir = path.join(__dirname, 'commands');
const body = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => require(path.join(dir, f)).data.toJSON());
const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
console.log(`[deploy] Mendaftarkan ${body.length} command ${GUILD_ID ? `ke server ${GUILD_ID}` : '(global)'}...`);

const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 30 detik menghubungi Discord')), 30000));
Promise.race([new REST().setToken(DISCORD_TOKEN).put(route, { body }), timeout])
  .then(() => { console.log(`[deploy] OK: ${body.length} command terdaftar.`); process.exit(0); })
  .catch(err => {
    console.error(`[deploy] GAGAL [${err.code ?? err.status ?? 'ERR'}]: ${err.message}`);
    if (err.code === 50001 || err.code === 10004) console.error('[deploy] SOLUSI: bot belum ada di server GUILD_ID, atau GUILD_ID salah.');
    if (err.status === 401) console.error('[deploy] SOLUSI: DISCORD_TOKEN salah/sudah direset.');
    process.exit(1);
  });
