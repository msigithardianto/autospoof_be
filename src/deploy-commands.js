// Jalankan sekali setiap kali menambah/mengubah command: npm run deploy
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const dir = path.join(__dirname, 'commands');
const body = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => require(path.join(dir, f)).data.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);
const route = GUILD_ID ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID) : Routes.applicationCommands(CLIENT_ID);
rest.put(route, { body }).then(() => console.log(`${body.length} command terdaftar.`)).catch(console.error);
