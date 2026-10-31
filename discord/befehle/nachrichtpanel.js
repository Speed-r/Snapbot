const discord = require('discord.js');
const { ButtonStyle, ChannelSelectMenuBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } = discord;
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
    .setDescription('**1.** Unten den Channel wählen\n**2.** Im Fenster den Text schreiben' +
      (DATEIEN_MOEGLICH ? ' und bei Bedarf Bilder/Dateien anhängen (bis zu 10)' : '') +
      '\n**3.** Absenden – der Bot postet die Nachricht')
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

// Datei-Upload im Fenster gibt es erst in neueren discord.js-Versionen – sonst nur Text
const DATEIEN_MOEGLICH = typeof discord.FileUploadBuilder === 'function' && typeof discord.LabelBuilder === 'function';
const MAX_DATEIEN = 10;
const ERLAUBTE_HOSTS = ['cdn.discordapp.com', 'media.discordapp.net'];

function textFenster(channelId, pings) {
  const modal = new ModalBuilder().setCustomId(`npm:${channelId}:${pings}`).setTitle('Nachricht schreiben');
  const feld = new TextInputBuilder()
    .setCustomId('text')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000);

  if (!DATEIEN_MOEGLICH) {
    return modal.addComponents(reihe(feld.setLabel('Text der Nachricht').setRequired(true)));
  }
  // Neues Fenster-Format: Text (optional) + Dateien (optional) – eins von beiden muss da sein
  const dateien = new discord.FileUploadBuilder()
    .setCustomId('dateien')
    .setMinValues(0)
    .setMaxValues(MAX_DATEIEN)
    .setRequired(false);
  return modal.addLabelComponents(
    new discord.LabelBuilder().setLabel('Text der Nachricht').setDescription('Optional, wenn du nur Dateien schickst')
      .setTextInputComponent(feld.setRequired(false)),
    new discord.LabelBuilder().setLabel('Bilder / Dateien').setDescription(`Optional, bis zu ${MAX_DATEIEN} Stück`)
      .setFileUploadComponent(dateien),
  );
}

// Hochgeladene Dateien aus dem Fenster holen (leer, wenn keine oder nicht unterstützt)
function hochgeladeneDateien(interaction) {
  if (!DATEIEN_MOEGLICH || typeof interaction.fields.getUploadedFiles !== 'function') return [];
  let dateien = null;
  try { dateien = interaction.fields.getUploadedFiles('dateien'); } catch { return []; }
  if (!dateien) return [];
  return [...(typeof dateien.values === 'function' ? dateien.values() : dateien)]
    .filter((a) => {
      try { return ERLAUBTE_HOSTS.includes(new URL(a.url).hostname); } catch { return false; }
    })
    .slice(0, MAX_DATEIEN);
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
    const text = (interaction.fields.getTextInputValue('text') || '').trim();
    const dateien = hochgeladeneDateien(interaction);
    const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
    const member = interaction.member;
    const rechte = channel?.permissionsFor?.(member);
    let info;

    if (!channel?.isTextBased()) info = '❌ Channel nicht gefunden.';
    // Nur dort, wo die Person selbst schreiben darf – der Bot ist kein Umweg um Channel-Rechte herum
    else if (!rechte?.has(PermissionFlagsBits.ViewChannel) || !rechte?.has(PermissionFlagsBits.SendMessages)) {
      info = `❌ In <#${channelId}> darfst du selbst nicht schreiben.`;
    } else if (dateien.length && !rechte.has(PermissionFlagsBits.AttachFiles)) {
      info = `❌ In <#${channelId}> darfst du selbst keine Dateien anhängen.`;
    } else if (!text && !dateien.length) info = '❌ Die Nachricht ist leer – bitte Text schreiben oder eine Datei anhängen.';
    else {
      const erlaubt = pings === '1'
        ? { parse: ['users', 'roles', ...(rechte.has(PermissionFlagsBits.MentionEveryone) ? ['everyone'] : [])] }
        : { parse: [] };
      // Dateien hängt der Bot neu an (er lädt sie von Discord und schickt sie mit) – das kann etwas dauern
      if (dateien.length) await interaction.deferUpdate();
      try {
        const gesendet = await channel.send({
          content: text || undefined,
          files: dateien.map((a) => ({ attachment: a.url, name: a.name })),
          allowedMentions: erlaubt,
        });
        info = `✅ Gesendet in <#${channelId}>${dateien.length ? ` mit ${dateien.length} Datei(en)` : ''} – [zur Nachricht](${gesendet.url})`;
        console.log(`Nachricht von ${interaction.user.tag} über den Bot in #${channel.name} gesendet${dateien.length ? ` (${dateien.length} Datei(en))` : ''}.`);
      } catch (e) {
        const zuGross = /too large|Request entity|40005/i.test(e.message);
        info = zuGross
          ? '❌ Die Dateien sind zu groß für den Bot (Discord-Grenze für Bots, meist 10 MB pro Nachricht).'
          : `❌ Senden fehlgeschlagen: ${e.message} (darf der Bot in <#${channelId}> schreiben und Dateien anhängen?)`;
      }
    }

    // Aus dem Menü geöffnet -> Menü aktualisieren, sonst normal antworten
    if (interaction.deferred) await interaction.editReply(nachrichtMenue(pings, info));
    else if (interaction.message) await interaction.update(nachrichtMenue(pings, info));
    else await interaction.reply(privat(info));
    return true;
  }
  return false;
}

module.exports = {
  nachrichtInteraktion,
  nachrichtOeffnen,
};
