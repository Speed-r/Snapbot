const { Client, GatewayIntentBits, Partials } = require('discord.js');

// Der Discord-Client – eine Instanz für den ganzen Bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // nötig, um Bild-Anhänge zu sehen
  ],
  // damit der Bot auch das Löschen/Bearbeiten von Nachrichten mitbekommt,
  // die vor seinem Start gepostet wurden
  partials: [Partials.Message, Partials.Channel],
  allowedMentions: { parse: [] },
});

module.exports = {
  client,
};
