const { EmbedBuilder } = require('discord.js');

function listEmbed(title, items, color) {
  const embed = new EmbedBuilder().setTitle(title).setColor(color);
  if (!items.length) return embed.setDescription('Belum ada item.');
  // Embed dibatasi 25 field
  items.slice(0, 25).forEach((item, i) => {
    embed.addFields({
      name: `${i + 1}. ${item.nama} — ${item.harga}`,
      value: item.deskripsi || '-',
    });
  });
  if (items.length > 25) embed.setFooter({ text: `Menampilkan 25 dari ${items.length} item` });
  return embed;
}

module.exports = { listEmbed };
