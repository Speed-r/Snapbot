const { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { config, regelBereit } = require('../lib/daten');
const { privat } = require('../lib/helfer');
const { wocheWechseln } = require('../lib/ablauf');
const { abschlussStatus, channelOeffnen } = require('../lib/abschluss');
const { rechteUebertragen, rechteVomFolgeChannel } = require('../lib/rechte');
const { TEXT_CHANNELS, darf, eingabeFenster, knopf, menueEmbed, menueSchliessen, reihe, schliessenKnopf, schnellAntwort } = require('./menue');

// ===========================================================================
// /channel – Menü: aktuelle Woche ansehen, neue Woche starten, Channel erstellen, Folge-Channel öffnen
//   cp:<aktion>[:<channelId>]      cpm:<n|N> = Eingabefenster "Channel erstellen"
// ===========================================================================
const FARBE = 0xeb459e;
const BITTE_EINRICHTEN = 'Bitte zuerst die Regel mit `/einstellungen` einrichten.';
const GRUND = { voll: 'Bilder voll', zeit: 'Zeit um' };

async function channelNachricht(guild, { bestaetigen = null, info = null } = {}) {
  const cfg = config[guild.id];
  const bereit = regelBereit(cfg);
  const e = menueEmbed(FARBE, 'Channels').setTitle('📺 Channels');
  const folge = bereit ? await guild.channels.fetch(cfg.folgeId).catch(() => null) : null;
  const status = bereit ? abschlussStatus(cfg) : null;

  if (!bereit) {
    e.setDescription(`⚠️ ${BITTE_EINRICHTEN}\nChannels erstellen geht trotzdem.`);
  } else {
    e.setDescription('Diese Woche')
      .addFields(
        { name: 'Erster Channel', value: `<#${cfg.ersterId}>`, inline: true },
        { name: 'Folge-Channel', value: `<#${cfg.folgeId}>`, inline: true },
        { name: 'Folge-Channel ist', value: status.geschlossen ? `🔒 geschlossen (${GRUND[status.grund] || 'von Hand'})` : '🔓 offen', inline: true },
        { name: 'Erlaubt ab', value: `${cfg.uhrzeit} Uhr`, inline: true },
        { name: 'Hinweis-Channel', value: `<#${cfg.hinweisId}>`, inline: true },
        { name: 'Neue Channels in', value: folge?.parentId ? `<#${folge.parentId}>` : 'ohne Kategorie', inline: true },
      );
  }
  if (info) e.addFields({ name: '​', value: info });
  e.setFooter({ text: 'Neue Woche: der Folge-Channel wird zum ersten Channel, der gewählte Channel zum neuen Folge-Channel. Neue Channels bekommen die Berechtigungen des Folge-Channels.' });

  const zeilen = [];
  if (bereit) {
    const auswahl = new ChannelSelectMenuBuilder().setCustomId('cp:w').setPlaceholder('📅 Neue Woche: neuen Folge-Channel wählen …').setChannelTypes(...TEXT_CHANNELS);
    zeilen.push(reihe(auswahl));
  }
  if (bestaetigen) {
    zeilen.push(reihe(
      knopf(`cp:R:${bestaetigen}`, '✅ Ja + Rechte übernehmen', ButtonStyle.Success),
      knopf(`cp:W:${bestaetigen}`, 'Ja, Rechte so lassen'),
      knopf('cp:k', 'Abbrechen'),
    ));
  }
  zeilen.push(reihe(
    knopf('cp:n', '➕ Channel erstellen', ButtonStyle.Primary),
    knopf('cp:N', '➕ Erstellen + neue Woche', ButtonStyle.Primary).setDisabled(!bereit),
    knopf('cp:o', '🔓 Folge-Channel öffnen', ButtonStyle.Success).setDisabled(!status?.geschlossen),
    knopf('cp:r', '🔄'),
    schliessenKnopf('cp:x'),
  ));
  return { content: '', embeds: [e], components: zeilen, allowedMentions: { parse: [] } };
}

async function channelOeffnenBefehl(interaction) {
  return interaction.reply(await channelNachricht(interaction.guild));
}

// Neue Woche starten und das Menü dabei auf dem Laufenden halten
async function neueWoche(interaction, channelId, { rechte = false } = {}) {
  const guild = interaction.guild;
  const cfg = config[guild.id];
  if (channelId === cfg.folgeId) {
    return interaction.editReply(await channelNachricht(guild, { info: '❌ Das ist schon der Folge-Channel – bitte den Channel der neuen Woche wählen.' }));
  }
  if (channelId === cfg.ersterId) {
    return interaction.editReply(await channelNachricht(guild, { info: '❌ Das ist der erste Channel dieser Woche – bitte einen neuen Channel wählen.' }));
  }
  await interaction.editReply(await channelNachricht(guild, { info: '⏳ Neue Woche wird gestartet …' }));
  // Rechte vom bisherigen Folge-Channel übernehmen – vor dem Wechsel, solange er noch der Folge-Channel ist
  let rechteInfo = '';
  if (rechte) {
    const ok = await rechteUebertragen(guild, cfg, channelId).catch((e) => { console.warn('Rechte übernehmen fehlgeschlagen:', e.message); return false; });
    rechteInfo = ok ? `\n🔐 Berechtigungen von <#${cfg.folgeId}> übernommen.` : '\n⚠️ Berechtigungen konnten nicht übernommen werden (fehlt „Rollen verwalten“?).';
  }
  await wocheWechseln(guild, cfg, channelId);
  return interaction.editReply(await channelNachricht(guild, { info: `✅ Neue Woche gestartet: <#${cfg.ersterId}> ➜ <#${cfg.folgeId}>${rechteInfo}` }));
}

async function channelInteraktion(interaction) {
  const id = interaction.customId || '';
  if (!/^cpm?:/.test(id)) return false;
  const guild = interaction.guild;
  const [art, aktion, wert] = id.split(':');

  if (aktion === 'x') return menueSchliessen(interaction, PermissionFlagsBits.ManageChannels);
  if (aktion === 'r' || aktion === 'k') {
    await interaction.update(await channelNachricht(guild));
    return true;
  }

  // Erstellen braucht "Kanäle verwalten", neue Woche und öffnen "Server verwalten"
  const nurErstellen = aktion === 'n';
  if (nurErstellen && !(await darf(interaction, PermissionFlagsBits.ManageChannels, 'Kanäle verwalten'))) return true;
  if (!nurErstellen && !(await darf(interaction, PermissionFlagsBits.ManageGuild, 'Server verwalten'))) return true;
  if (!nurErstellen && !regelBereit(config[guild.id])) {
    await interaction.reply(privat(`❌ ${BITTE_EINRICHTEN}`));
    return true;
  }

  // Button "Erstellen": Fenster für den Namen öffnen
  if (art === 'cp' && (aktion === 'n' || aktion === 'N')) {
    await interaction.showModal(eingabeFenster(`cpm:${aktion}`, aktion === 'N' ? 'Channel erstellen + neue Woche' : 'Channel erstellen',
      'Name des neuen Channels', null, 'z. B. snap-kw44'));
    return true;
  }

  // Fenster abgeschickt: Channel anlegen (in der Kategorie des Folge-Channels)
  if (art === 'cpm') {
    const name = interaction.fields.getTextInputValue('wert').trim();
    if (!name) {
      await interaction.reply(privat('❌ Bitte einen Namen eingeben.'));
      return true;
    }
    await interaction.deferUpdate();
    const cfg = config[guild.id];
    // Neuer Channel: gleiche Kategorie, Berechtigungen und Langsamer Modus wie der bisherige Folge-Channel
    const r = await rechteVomFolgeChannel(guild, cfg);
    const neu = await guild.channels.create({
      name: name.slice(0, 100),
      type: ChannelType.GuildText,
      parent: r.quelle?.parentId ?? undefined,
      permissionOverwrites: r.liste,
      rateLimitPerUser: r.langsamModus || undefined,
      reason: r.quelle ? `Rechte von #${r.quelle.name} übernommen` : undefined,
    });
    const rechteInfo = (r.quelle ? ` Berechtigungen von <#${r.quelle.id}> übernommen.` : '') + ' Für @everyone unsichtbar.';
    if (aktion === 'N') {
      await neueWoche(interaction, neu.id);
      return true;
    }
    await interaction.editReply(await channelNachricht(guild, { info: `✅ Channel ${neu} erstellt.${rechteInfo}` }));
    return true;
  }

  // Neue Woche: erst wählen, dann bestätigen
  if (aktion === 'w') {
    await interaction.update(await channelNachricht(guild, { bestaetigen: interaction.values[0], info: `Neue Woche mit <#${interaction.values[0]}> als Folge-Channel starten?` }));
    return true;
  }
  if (aktion === 'W' || aktion === 'R') {
    await interaction.deferUpdate();
    await neueWoche(interaction, wert, { rechte: aktion === 'R' });
    return true;
  }

  if (aktion === 'o') {
    const senden = schnellAntwort(interaction, 'update');
    const cfg = config[guild.id];
    let info = `<#${cfg.folgeId}> ist nicht geschlossen.`;
    if (abschlussStatus(cfg).geschlossen) {
      await channelOeffnen(guild, cfg);
      info = `🔓 <#${cfg.folgeId}> ist wieder offen. Er wird diese Woche nicht mehr automatisch geschlossen.`;
    }
    await senden(await channelNachricht(guild, { info }));
    return true;
  }
  return false;
}

module.exports = {
  channelInteraktion,
  channelOeffnenBefehl,
};
