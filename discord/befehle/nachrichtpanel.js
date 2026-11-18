const discord = require('discord.js');
const { ButtonStyle, ChannelSelectMenuBuilder, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle } = discord;
const { client } = require('../lib/client');
const { privat } = require('../lib/helfer');
const { TEXT_CHANNELS, darf, knopf, menueEmbed, menueSchliessen, reihe, schliessenKnopf, schnellAntwort } = require('./menue');

// ===========================================================================
// /nachricht – freie Nachricht über den Bot senden
//   1. Channel wählen  ->  2. Fenster mit dem Text  ->  3. Bot postet
//   np:<aktion>:<pings 0|1>        npm:<channelId>:<pings 0|1> = Text-Fenster
// ===========================================================================
const FARBE = 0x3ba55c;
const RECHT = PermissionFlagsBits.ManageMessages;

function nachrichtMenue(pings = '0', info = null, gefunden = null) {
  const e = menueEmbed(FARBE, 'Nachricht').setTitle('✉️ Nachricht über den Bot senden')
    .setDescription('**1.** Unten den Channel wählen\n**2.** Im Fenster den Text schreiben' +
      (DATEIEN_MOEGLICH ? ' und bei Bedarf Bilder/Dateien anhängen (bis zu 10)' : '') +
      '\n**3.** Absenden – der Bot postet die Nachricht')
    .addFields({ name: '🔔 Pings', value: pings === '1'
      ? 'an – erwähnte Personen und Rollen werden angepingt (@everyone/@here nur, wenn du das selbst darfst)'
      : 'aus – Erwähnungen werden angezeigt, aber niemand wird angepingt' });
  e.addFields(
    { name: '✍️ Formatierung', value: '`**fett**` · `*kursiv*` · `__unterstrichen__` · `~~durch~~` · `||Spoiler||`\n`# Überschrift` · `> Zitat` · `- Liste` · `[Text](https://link)`' },
    { name: '🎞️ GIF', value: 'GIF-Link (z. B. von tenor.com oder giphy.com) in den Text einfügen – Discord zeigt ihn als GIF an.' },
    { name: '✏️ Bearbeiten', value: 'Button **✏️ Gesendete Nachricht bearbeiten** (Link oder Message-ID eingeben) – oder Rechtsklick auf die Bot-Nachricht → **Apps** → **Bot-Nachricht bearbeiten**' },
  );
  if (info) e.addFields({ name: '\u200b', value: info });
  return {
    content: '',
    embeds: [e],
    components: [
      reihe(new ChannelSelectMenuBuilder().setCustomId(`np:c:${pings}`).setPlaceholder('📺 Channel wählen …').setChannelTypes(...TEXT_CHANNELS)),
      reihe(
        knopf(`np:p:${pings}`, `🔔 Pings: ${pings === '1' ? 'an' : 'aus'}`, pings === '1' ? ButtonStyle.Success : ButtonStyle.Secondary),
        knopf(`np:f:${pings}`, '✏️ Gesendete Nachricht bearbeiten', ButtonStyle.Primary),
        schliessenKnopf(`np:x:${pings}`),
      ),
      // Nach der Suche: gefundene Nachricht bearbeiten
      ...(gefunden ? [reihe(
        knopf(`np:e:${pings}:${gefunden.channelId}:${gefunden.id}`, '✏️ Text dieser Nachricht bearbeiten', ButtonStyle.Success),
        knopf(`np:k:${pings}`, 'Abbrechen'),
      )] : []),
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
  if (!/^np[mf]?:/.test(id)) return false;
  const [art, a, b, c, d] = id.split(':');

  if (art === 'np' && a === 'x') return menueSchliessen(interaction, RECHT);
  if (!(await darf(interaction, RECHT, 'Nachrichten verwalten'))) return true;

  // Bearbeiten: 1) Fenster für Link/ID  2) Nachricht suchen  3) Bearbeiten-Fenster  (Abbrechen: k)
  if (art === 'np' && a === 'f') {
    const feld = new TextInputBuilder().setCustomId('ziel').setLabel('Nachrichten-Link oder Message-ID')
      .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)
      .setPlaceholder('https://discord.com/channels/… oder 1234567890123456789');
    await interaction.showModal(new ModalBuilder().setCustomId(`npf:${b}`).setTitle('Nachricht zum Bearbeiten').addComponents(reihe(feld)));
    return true;
  }
  if (art === 'npf') {
    const pings = a;
    const senden = schnellAntwort(interaction, 'update'); // die Suche über alle Channels kann kurz dauern
    const { msg, fehler } = await nachrichtSuchen(interaction, interaction.fields.getTextInputValue('ziel'));
    if (fehler) await senden(nachrichtMenue(pings, fehler));
    else {
      const vorschau = (msg.content || '*(nur Anhang)*').slice(0, 300) + (msg.content.length > 300 ? ' …' : '');
      await senden(nachrichtMenue(pings, `Gefunden in <#${msg.channelId}> – [zur Nachricht](${msg.url}):\n>>> ${vorschau}`, msg));
    }
    return true;
  }
  if (art === 'np' && a === 'e') {
    const channel = await interaction.guild.channels.fetch(c).catch(() => null);
    const msg = channel?.messages ? await channel.messages.fetch(d).catch(() => null) : null;
    const problem = !msg ? '❌ Die Nachricht gibt es nicht mehr.' : bearbeitbar(msg);
    if (problem) {
      await interaction.update(nachrichtMenue(b, problem));
      return true;
    }
    await interaction.showModal(bearbeitenFenster(msg));
    return true;
  }
  if (art === 'np' && a === 'k') {
    await interaction.update(nachrichtMenue(b));
    return true;
  }

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

// ===========================================================================
// Gesendete Bot-Nachricht bearbeiten (Rechtsklick -> Apps -> "Bot-Nachricht bearbeiten")
//   npe:<channelId>:<messageId> = Bearbeiten-Fenster
// ===========================================================================
function bearbeitbar(msg) {
  if (msg?.author?.id !== client.user?.id) return '❌ Bearbeiten geht nur bei Nachrichten, die der Bot gesendet hat.';
  if (msg.components?.length || msg.embeds?.length) return '❌ Menüs und Embeds des Bots kann man so nicht bearbeiten – nur normale Text-Nachrichten.';
  return null;
}

async function selbstSchreibenDarf(interaction, channel) {
  const rechte = channel?.permissionsFor?.(interaction.member);
  return !!rechte?.has(PermissionFlagsBits.ViewChannel) && !!rechte?.has(PermissionFlagsBits.SendMessages);
}

async function bearbeitenStart(interaction) {
  if (!(await darf(interaction, RECHT, 'Nachrichten verwalten'))) return;
  const msg = interaction.targetMessage;
  const problem = bearbeitbar(msg);
  if (problem) return interaction.reply(privat(problem));
  if (!(await selbstSchreibenDarf(interaction, msg.channel))) {
    return interaction.reply(privat(`❌ In <#${msg.channelId}> darfst du selbst nicht schreiben.`));
  }
  return interaction.showModal(bearbeitenFenster(msg));
}

function bearbeitenFenster(msg) {
  const feld = new TextInputBuilder()
    .setCustomId('text')
    .setLabel('Neuer Text')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(!msg.attachments?.size); // mit Anhang darf der Text auch leer werden
  if (msg.content) feld.setValue(msg.content.slice(0, 2000));
  return new ModalBuilder().setCustomId(`npe:${msg.channelId}:${msg.id}`).setTitle('Bot-Nachricht bearbeiten').addComponents(reihe(feld));
}

// Nachricht per Link (…/channels/<server>/<channel>/<nachricht>) oder nur per ID finden.
// Nur ID: der Bot sucht in allen Text-Channels, die die Person selbst sehen darf.
async function nachrichtSuchen(interaction, eingabe) {
  const guild = interaction.guild;
  const text = String(eingabe || '').trim();
  const link = text.match(/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/);
  const nurId = text.match(/^\d{17,20}$/);
  if (!link && !nurId) return { fehler: '❌ Das ist weder ein Nachrichten-Link noch eine Message-ID.' };
  if (link && link[1] !== guild.id) return { fehler: '❌ Der Link gehört zu einem anderen Server.' };

  const darfSehen = (ch) => ch?.permissionsFor?.(interaction.member)?.has(PermissionFlagsBits.ViewChannel);
  let msg = null;
  if (link) {
    const ch = await guild.channels.fetch(link[2]).catch(() => null);
    if (!darfSehen(ch)) return { fehler: '❌ Diesen Channel darfst du nicht sehen.' };
    msg = ch?.messages ? await ch.messages.fetch(link[3]).catch(() => null) : null;
  } else {
    const kandidaten = [...(guild.channels.cache?.values?.() || [])].filter((ch) => ch.isTextBased?.() && ch.messages && darfSehen(ch));
    for (let i = 0; i < kandidaten.length && !msg; i += 5) {
      const treffer = await Promise.all(kandidaten.slice(i, i + 5).map((ch) => ch.messages.fetch(nurId[0]).catch(() => null)));
      msg = treffer.find(Boolean) || null;
    }
  }
  if (!msg) return { fehler: '❌ Nachricht nicht gefunden.' + (nurId ? ' Tipp: Mit dem Nachrichten-Link geht es schneller und sicherer (Rechtsklick → Nachrichtenlink kopieren).' : '') };
  const problem = bearbeitbar(msg);
  if (problem) return { fehler: problem };
  if (!(await selbstSchreibenDarf(interaction, msg.channel))) return { fehler: `❌ In <#${msg.channelId}> darfst du selbst nicht schreiben.` };
  return { msg };
}

async function bearbeitenAbschicken(interaction) {
  if (!(await darf(interaction, RECHT, 'Nachrichten verwalten'))) return;
  const [, channelId, messageId] = interaction.customId.split(':');
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  const msg = channel?.messages ? await channel.messages.fetch(messageId).catch(() => null) : null;
  if (!msg) return interaction.reply(privat('❌ Die Nachricht gibt es nicht mehr.'));
  const problem = bearbeitbar(msg);
  if (problem) return interaction.reply(privat(problem));
  if (!(await selbstSchreibenDarf(interaction, channel))) return interaction.reply(privat(`❌ In <#${channelId}> darfst du selbst nicht schreiben.`));

  const text = (interaction.fields.getTextInputValue('text') || '').trim();
  if (!text && !msg.attachments?.size) return interaction.reply(privat('❌ Die Nachricht darf nicht leer sein.'));
  if (text === msg.content) return interaction.reply(privat('Nichts geändert.'));

  // Beim Bearbeiten pingt Discord nie neu an – die Erwähnungen bleiben aber sichtbar
  await msg.edit({ content: text, allowedMentions: { parse: [] } });
  console.log(`Bot-Nachricht in #${channel.name} von ${interaction.user.tag} bearbeitet.`);
  const info = `✏️ Nachricht bearbeitet – [zur Nachricht](${msg.url})`;
  const ausMenue = interaction.message?.components?.[0]?.components?.[0]?.customId?.startsWith('np:');
  return ausMenue ? interaction.update(nachrichtMenue('0', info)) : interaction.reply(privat(info));
}

module.exports = {
  bearbeitenAbschicken,
  bearbeitenStart,
  nachrichtInteraktion,
  nachrichtOeffnen,
};
