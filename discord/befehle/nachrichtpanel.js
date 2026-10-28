const { ButtonStyle, ChannelSelectMenuBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } = require('discord.js');
const { privat } = require('../lib/helfer');
const { TEXT_CHANNELS, darf, knopf, menueEmbed, menueSchliessen, reihe, schliessenKnopf } = require('./menue');

// ===========================================================================
// /nachricht – freie Nachricht über den Bot senden
//   1. Channel wählen  ->  2. Fenster mit dem Text  ->  3. Bot postet
//   np:<aktion>:<pings 0|1>        npm:<channelId>:<pings 0|1> = Text-Fenster
// ===========================================================================
const FARBE = 0x3ba55c;
const RECHT = PermissionFlagsBits.ManageMessages;

function nachrichtMenue(pings = '0', info = null) {
  const e = menueEmbed(FARBE, 'Nachricht').setTitle('✉️ Nachricht über den Bot senden')
    .setDescription('**1.** Unten den Channel wählen\n**2.** Im Fenster den Text schreiben\n**3.** Absenden – der Bot postet die Nachricht')
    .addFields({ name: '🔔 Pings', value: pings === '1'
      ? 'an – erwähnte Personen und Rollen werden angepingt (@everyone/@here nur, wenn du das selbst darfst)'
      : 'aus – Erwähnungen werden angezeigt, aber niemand wird angepingt' });
  if (info) e.addFields({ name: '​', value: info });
  return {
    content: '',
    embeds: [e],
    components: [
      reihe(new ChannelSelectMenuBuilder().setCustomId(`np:c:${pings}`).setPlaceholder('📺 Channel wählen …').setChannelTypes(...TEXT_CHANNELS)),
      reihe(
        knopf(`np:p:${pings}`, `🔔 Pings: ${pings === '1' ? 'an' : 'aus'}`, pings === '1' ? ButtonStyle.Success : ButtonStyle.Secondary),
        schliessenKnopf(`np:x:${pings}`),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function textFenster(channelId, pings) {
  const feld = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('Text der Nachricht')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);
  return new ModalBuilder().setCustomId(`npm:${channelId}:${pings}`).setTitle('Nachricht schreiben').addComponents(reihe(feld));
}

async function nachrichtOeffnen(interaction) {
  return interaction.reply(nachrichtMenue());
}

async function nachrichtInteraktion(interaction) {
  const id = interaction.customId || '';
  if (!/^npm?:/.test(id)) return false;
  const [art, a, b] = id.split(':');

  if (art === 'np' && a === 'x') return menueSchliessen(interaction, RECHT);
  if (!(await darf(interaction, RECHT, 'Nachrichten verwalten'))) return true;

  // Pings umschalten
  if (art === 'np' && a === 'p') {
    await interaction.update(nachrichtMenue(b === '1' ? '0' : '1'));
    return true;
  }

  // Channel gewählt -> Fenster für den Text öffnen
  if (art === 'np' && a === 'c') {
    await interaction.showModal(textFenster(interaction.values[0], b));
    return true;
  }

  // Fenster abgeschickt -> posten
  if (art === 'npm') {
    const channelId = a;
    const pings = b;
    const text = interaction.fields.getTextInputValue('text').trim();
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    const member = interaction.member;
    const rechte = channel?.permissionsFor?.(member);
    let info;

    if (!channel?.isTextBased()) info = '❌ Channel nicht gefunden.';
    // Nur dort, wo die Person selbst schreiben darf – der Bot ist kein Umweg um Channel-Rechte herum
    else if (!rechte?.has(PermissionFlagsBits.ViewChannel) || !rechte?.has(PermissionFlagsBits.SendMessages)) {
      info = `❌ In <#${channelId}> darfst du selbst nicht schreiben.`;
    } else if (!text) info = '❌ Die Nachricht ist leer.';
    else {
      const erlaubt = pings === '1'
        ? { parse: ['users', 'roles', ...(rechte.has(PermissionFlagsBits.MentionEveryone) ? ['everyone'] : [])] }
        : { parse: [] };
      try {
        const gesendet = await channel.send({ content: text, allowedMentions: erlaubt });
        info = `✅ Gesendet in <#${channelId}> – [zur Nachricht](${gesendet.url})`;
        console.log(`Nachricht von ${interaction.user.tag} über den Bot in #${channel.name} gesendet.`);
      } catch (e) {
        info = `❌ Senden fehlgeschlagen: ${e.message} (darf der Bot in <#${channelId}> schreiben?)`;
      }
    }

    // Aus dem Menü geöffnet -> Menü aktualisieren, sonst normal antworten
    if (interaction.message) await interaction.update(nachrichtMenue(pings, info));
    else await interaction.reply(privat(info));
    return true;
  }
  return false;
}

module.exports = {
  nachrichtInteraktion,
  nachrichtOeffnen,
};
