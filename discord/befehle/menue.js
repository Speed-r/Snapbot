const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { client } = require('../lib/client');
const { privat } = require('../lib/helfer');

// ---------------------------------------------------------------------------
// Bausteine, die alle Menüs (/einstellungen, /channel, /person, /listen) gemeinsam nutzen
// ---------------------------------------------------------------------------
const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const reihe = (...k) => new ActionRowBuilder().addComponents(...k);
const knopf = (id, label, stil = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(stil);
const schliessenKnopf = (id) => knopf(id, 'Schließen', ButtonStyle.Danger);

// Embed im einheitlichen Stil
const menueEmbed = (farbe, bereich) => new EmbedBuilder()
  .setColor(farbe)
  .setAuthor({ name: `Snap-Bot · ${bereich}`, iconURL: client.user?.displayAvatarURL?.() || undefined });

// Leere Kästchen anhängen, damit das 3-Spalten-Raster sauber bleibt
function rasterAuffuellen(embed, anzahl) {
  for (let i = 0; i < (3 - (anzahl % 3)) % 3; i++) embed.addFields({ name: '​', value: '​', inline: true });
}

// Eingabefenster mit einem Textfeld (Feld-ID "wert")
function eingabeFenster(id, titel, label, wert, platzhalter) {
  const feld = new TextInputBuilder().setCustomId('wert').setLabel(label).setStyle(TextInputStyle.Short).setRequired(false);
  if (wert != null && wert !== '') feld.setValue(String(wert));
  if (platzhalter) feld.setPlaceholder(platzhalter);
  return new ModalBuilder().setCustomId(id).setTitle(titel).addComponents(reihe(feld));
}

// Menü schließen: wer es geöffnet hat oder wer das angegebene Recht hat
async function menueSchliessen(interaction, recht) {
  const aufrufer = interaction.message.interactionMetadata?.user?.id ?? interaction.message.interaction?.user?.id;
  if (interaction.user?.id !== aufrufer && !interaction.memberPermissions?.has(recht)) {
    await interaction.reply(privat('❌ Schließen darf nur, wer das Menü geöffnet hat.'));
    return true;
  }
  await interaction.deferUpdate();
  await interaction.message.delete().catch(() => {});
  return true;
}

// Schnell antworten: normalerweise EINE Anfrage an Discord (update/reply) statt zwei (defer + edit).
// Dauert das Bauen der Antwort länger als 2 s, meldet der Bot vorher "denkt nach", damit Discord nicht abbricht.
//   const senden = schnellAntwort(interaction, 'update' | 'reply');  ...  await senden(nachricht);
function schnellAntwort(interaction, art = 'update') {
  let defer = null;
  const timer = setTimeout(() => {
    defer = (art === 'update' ? interaction.deferUpdate() : interaction.deferReply()).catch(() => {});
  }, 2000);
  return async (nachricht) => {
    clearTimeout(timer);
    if (defer) {
      await defer;
      return interaction.editReply(nachricht);
    }
    return art === 'update' ? interaction.update(nachricht) : interaction.reply(nachricht);
  };
}

// Prüft ein Recht und antwortet sonst mit einem Hinweis. true = darf.
async function darf(interaction, recht, name) {
  if (interaction.memberPermissions?.has(recht)) return true;
  await interaction.reply(privat(`❌ Dafür brauchst du „${name}“.`));
  return false;
}

module.exports = {
  TEXT_CHANNELS,
  darf,
  eingabeFenster,
  knopf,
  menueEmbed,
  menueSchliessen,
  rasterAuffuellen,
  reihe,
  schliessenKnopf,
  schnellAntwort,
};
