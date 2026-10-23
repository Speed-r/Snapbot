const {
  ButtonStyle, ChannelSelectMenuBuilder,
  PermissionFlagsBits, StringSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const { TEXT_CHANNELS, knopf, menueEmbed, menueSchliessen, rasterAuffuellen, reihe, schliessenKnopf, schnellAntwort } = require('./menue');
const { config, gespeicherteKanaele, kanalHolen, kanalLoeschen, kanalSichern, regelBereit } = require('../lib/daten');
const { alleNachrichten, datumVon, privat } = require('../lib/helfer');
const { listeErstellen } = require('../lib/listen');
const { verlaufAuswerten, verlaufDatei, verlaufLesen } = require('../lib/verlauf');

// ===========================================================================
// /listen – Menü mit Ansichten, 3-Spalten-Raster, Blättern, 💾, Textdatei, Schließen
// Zustandslos: alles Nötige steckt in der customId:
//   lp:<aktion>:<ansicht>:<channelId|->:<tage>:<vor><bild>:<seite>
// ===========================================================================
const FARBE = 0x57f287;
const PRO_SEITE = 15; // 5 Reihen à 3 Kästchen

const ANSICHTEN = [
  { id: 'frueh', name: 'Frühposter', emoji: '⏰', info: 'Erster Channel: wer vor der Uhrzeit gepostet hat' },
  { id: 'folge', name: 'Folge-Channel', emoji: '📺', info: 'Alle, die im Folge-Channel gepostet haben' },
  { id: 'verlauf', name: 'Verlauf', emoji: '📜', info: 'Alle, die je in einem Channel gepostet haben' },
  { id: 'gespeichert', name: 'Gespeichert', emoji: '💾', info: 'Gespeicherte Namen eines Channels' },
];
const ZEITRAEUME = [
  { label: 'Kompletter Verlauf', value: '0' }, { label: 'Letzte 7 Tage', value: '7' }, { label: 'Letzte 14 Tage', value: '14' },
  { label: 'Letzte 30 Tage', value: '30' }, { label: 'Letzte 90 Tage', value: '90' },
];

// ---------------------------------------------------------------------------
// Zustand <-> customId
// ---------------------------------------------------------------------------
const STANDARD = { ansicht: 'frueh', ch: '-', tage: '0', vor: '0', bild: '0', seite: 0 };
const kodiere = (aktion, z, extra = {}) => {
  const n = { ...z, ...extra };
  return ['lp', aktion, n.ansicht, n.ch || '-', n.tage, `${n.vor}${n.bild}`, n.seite].join(':');
};
function dekodiere(customId) {
  const [, aktion, ansicht, ch, tage, flags = '00', seite = '0'] = customId.split(':');
  return { aktion, z: { ansicht, ch, tage, vor: flags[0], bild: flags[1], seite: Number(seite) || 0 } };
}

// ---------------------------------------------------------------------------
// Daten je Ansicht (kurz zwischengespeichert, damit Blättern sofort geht)
// ---------------------------------------------------------------------------
const ergebnisCache = new Map(); // schluessel -> { zeit, daten }
const MERKEN_MS = 60 * 1000;
async function gemerkt(schluessel, laden) {
  const c = ergebnisCache.get(schluessel);
  if (c && Date.now() - c.zeit < MERKEN_MS) return c.daten;
  const daten = await laden();
  ergebnisCache.set(schluessel, { zeit: Date.now(), daten });
  if (ergebnisCache.size > 100) ergebnisCache.delete(ergebnisCache.keys().next().value);
  return daten;
}
const vergessen = (praefix) => { for (const k of ergebnisCache.keys()) if (k.startsWith(praefix)) ergebnisCache.delete(k); };

// Einheitliches Format: { titel, beschreibung, kanal: {id,name}, eintraege: [{ id, name, user, zeile, letzter? }], pfad?, speicherbar }
async function datenLaden(guild, cfg, z) {
  const kurzDatum = (d) => d.slice(0, 6); // "12.10.2026" -> "12.10."

  if (z.ansicht === 'frueh' || z.ansicht === 'folge') {
    if (!regelBereit(cfg)) return { fehler: 'Bitte zuerst die Regel mit `/einstellungen` einrichten.' };
    const welcher = z.ansicht === 'frueh' ? 'erster' : 'folge';
    const l = await gemerkt(`${guild.id}:liste:${welcher}`, () => listeErstellen(guild, cfg, welcher));
    if (!l) return { fehler: 'Channel nicht gefunden.' };
    // Ausnahme-Rollen markieren (nur aus dem Speicher von discord.js, ohne zusätzliche Anfragen)
    const ausnahmen = cfg.ausnahmeRollen || [];
    const istAusnahme = (id) => ausnahmen.some((r) => guild.members.cache?.get(id)?.roles?.cache?.has(r));
    return {
      titel: z.ansicht === 'frueh' ? `⏰ Frühposter (vor ${cfg.uhrzeit} Uhr)` : '📺 Folge-Channel',
      beschreibung: `<#${l.channelId}>` + (z.ansicht === 'frueh'
        ? ` · dürfen im Folge-Channel erst ab **${cfg.uhrzeit} Uhr** posten${ausnahmen.length ? ' (außer 🛡️ Ausnahme)' : ''}` : ''),
      kanal: { id: l.channelId, name: l.channelName },
      eintraege: l.personen.map((p) => ({
        id: p.id, name: p.name, user: p.user,
        zeile: (p.gespeichert ? `💾 gespeichert${p.letzter ? ` · ${kurzDatum(p.letzter)}` : ''}` : `📅 ${kurzDatum(p.datum)} · ${p.zeit}`) +
          (z.ansicht === 'frueh' && istAusnahme(p.id) ? '\n🛡️ Ausnahme' : ''),
      })),
      zusatz: l.gespeichertAnzahl ? `${l.postAnzahl} aus Posts · ${l.gespeichertAnzahl} gespeichert` : null,
      pfad: l.pfad,
      speicherbar: true,
    };
  }

  const chId = z.ch !== '-' ? z.ch : cfg?.ersterId;
  if (!chId) return { fehler: 'Bitte unten einen Channel wählen.', ohneChannel: true };
  const channel = await guild.channels.fetch(chId).catch(() => null);
  if (!channel?.isTextBased()) return { fehler: 'Channel nicht gefunden.', ohneChannel: true };

  if (z.ansicht === 'verlauf') {
    const nurVor = z.vor === '1' && regelBereit(cfg);
    const nurBilder = z.bild === '1';
    const tage = Number(z.tage) || 0;
    const v = await gemerkt(`${guild.id}:verlauf:${chId}:${tage}:${z.vor}${z.bild}`, async () => {
      const ab = tage ? Date.now() - tage * 24 * 60 * 60 * 1000 : null;
      let nachrichten;
      let abgeschnitten = false;
      // Erster/Folge-Channel liegen schon im Zwischenspeicher – andere Channels werden gelesen
      if (chId === cfg?.ersterId || chId === cfg?.folgeId) {
        nachrichten = (await alleNachrichten(channel)).filter((m) => !ab || m.createdTimestamp >= ab);
      } else {
        ({ nachrichten, abgeschnitten } = await verlaufLesen(channel, ab));
      }
      const auswertung = verlaufAuswerten(nachrichten, { nurBilder, vorMinuten: nurVor ? cfg.uhrzeitMinuten : null });
      const aeltester = nachrichten.reduce((a, m) => (!a || m.createdTimestamp < a.createdTimestamp ? m : a), null)?.createdAt;
      const info = {
        zeitraum: tage ? `Letzte ${tage} Tage` : `Kompletter Verlauf${aeltester ? ` (seit ${datumVon(aeltester)})` : ''}`,
        filter: [nurVor && `nur vor ${cfg.uhrzeit} Uhr`, nurBilder && 'nur Bilder'].filter(Boolean).join(', '),
        gelesen: nachrichten.length,
        abgeschnitten,
      };
      return { auswertung, info, pfad: verlaufDatei(channel, auswertung, info) };
    });
    return {
      titel: `📜 Verlauf – #${channel.name}`,
      beschreibung: `${v.info.zeitraum}${v.info.filter ? ` · ${v.info.filter}` : ''} · ${v.info.gelesen} Nachrichten gelesen` +
        (v.info.abgeschnitten ? ' · ⚠️ Grenze erreicht, ältere fehlen' : ''),
      kanal: { id: channel.id, name: channel.name },
      eintraege: v.auswertung.liste.map((u) => ({
        id: u.id, name: u.name, user: u.user, letzter: u.letzter,
        zeile: `📝 ${u.anzahl} Post${u.anzahl === 1 ? '' : 's'} · ${datumVon(u.letzter).slice(0, 6)}`,
      })),
      pfad: v.pfad,
      speicherbar: true,
    };
  }

  // gespeichert
  const d = gespeicherteKanaele.get(chId);
  const istErster = cfg?.ersterId === chId;
  return {
    titel: `💾 Gespeichert – #${channel.name}`,
    beschreibung: istErster ? 'Erster Channel – diese Namen zählen für die Regel.' : 'Zählt erst, wenn dieser Channel der erste Channel ist.',
    kanal: { id: channel.id, name: channel.name },
    eintraege: Object.entries(d?.user || {}).map(([id, u]) => ({
      id, name: u.name || u.user || id, user: u.user || id,
      zeile: u.letzter ? `📅 zuletzt ${datumVon(new Date(u.letzter)).slice(0, 6)}` : '💾 gespeichert',
    })),
    speicherbar: false,
  };
}

// ---------------------------------------------------------------------------
// Nachricht bauen
// ---------------------------------------------------------------------------

async function listenNachricht(guild, z, { bestaetigen = false } = {}) {
  const cfg = config[guild.id];
  const d = await datenLaden(guild, cfg, z);
  const ansicht = ANSICHTEN.find((a) => a.id === z.ansicht) || ANSICHTEN[0];

  const e = menueEmbed(FARBE, 'Listen');
  const zeilen = [reihe(new StringSelectMenuBuilder()
    .setCustomId(kodiere('a', z))
    .setPlaceholder('Ansicht wählen …')
    .addOptions(ANSICHTEN.map((a) => ({ label: a.name, value: a.id, description: a.info, emoji: { name: a.emoji }, default: a.id === z.ansicht }))))];

  let seiten = 1;
  if (d.fehler) {
    e.setTitle(`${ansicht.emoji} ${ansicht.name}`).setDescription(`❌ ${d.fehler}`);
  } else {
    seiten = Math.max(1, Math.ceil(d.eintraege.length / PRO_SEITE));
    z.seite = Math.min(Math.max(z.seite, 0), seiten - 1);
    const start = z.seite * PRO_SEITE;
    const teil = d.eintraege.slice(start, start + PRO_SEITE);
    e.setTitle(d.titel).setDescription(d.beschreibung + (teil.length ? '' : '\n\n*Noch niemand.*'));
    // 3-Spalten-Raster: Name im Titel des Kästchens, Markierung + Info darunter
    e.addFields(teil.map((p, i) => ({ name: `${start + i + 1}. ${p.name}`.slice(0, 256), value: `<@${p.id}>\n${p.zeile}`, inline: true })));
    // Raster auffüllen, damit die letzte Reihe nicht auseinandergezogen wird
    rasterAuffuellen(e, teil.length);
    e.setFooter({ text: `${d.eintraege.length} Person(en)${d.zusatz ? ` · ${d.zusatz}` : ''} · Seite ${z.seite + 1}/${seiten}` });
  }

  // Ansicht-spezifische Bedienung
  if (z.ansicht === 'verlauf' || z.ansicht === 'gespeichert') {
    const m = new ChannelSelectMenuBuilder().setCustomId(kodiere('c', z)).setPlaceholder('Channel wählen (Standard: erster Channel) …').setChannelTypes(...TEXT_CHANNELS);
    const aktuell = z.ch !== '-' ? z.ch : cfg?.ersterId;
    if (aktuell && typeof m.setDefaultChannels === 'function') m.setDefaultChannels(aktuell);
    zeilen.push(reihe(m));
  }
  if (z.ansicht === 'verlauf') {
    zeilen.push(reihe(new StringSelectMenuBuilder()
      .setCustomId(kodiere('t', z))
      .setPlaceholder('Zeitraum …')
      .addOptions(ZEITRAEUME.map((t) => ({ ...t, default: t.value === z.tage })))));
    zeilen.push(reihe(
      knopf(kodiere('v', z), `⏰ Nur vor ${cfg?.uhrzeit || 'X'}: ${z.vor === '1' ? 'an' : 'aus'}`, z.vor === '1' ? ButtonStyle.Success : ButtonStyle.Secondary),
      knopf(kodiere('b', z), `🖼️ Nur Bilder: ${z.bild === '1' ? 'an' : 'aus'}`, z.bild === '1' ? ButtonStyle.Success : ButtonStyle.Secondary),
      knopf(kodiere('s', z), '💾 Speichern', ButtonStyle.Primary).setDisabled(!!d.fehler || !d.eintraege.length),
      knopf(kodiere('d', z), '📄 Datei').setDisabled(!!d.fehler),
    ));
  } else if (z.ansicht === 'gespeichert') {
    zeilen.push(reihe(new UserSelectMenuBuilder().setCustomId(kodiere('u', z)).setPlaceholder('🗑️ Person aus der Datei entfernen …')));
    zeilen.push(bestaetigen
      // Rückfrage direkt im Menü
      ? reihe(
        knopf(kodiere('L', z), `⚠️ Ja, alle ${d.eintraege.length} löschen`, ButtonStyle.Danger),
        knopf(kodiere('k', z), 'Abbrechen'))
      : reihe(knopf(kodiere('l', z), '🗑️ Alle löschen', ButtonStyle.Danger).setDisabled(!!d.fehler || !d.eintraege.length)));
  } else {
    zeilen.push(reihe(
      knopf(kodiere('s', z), '💾 Speichern', ButtonStyle.Primary).setDisabled(!!d.fehler || !d.eintraege.length),
      knopf(kodiere('d', z), '📄 Datei').setDisabled(!!d.fehler),
      knopf(kodiere('r', z), '🔄 Aktualisieren'),
    ));
  }

  // Blättern + Schließen
  zeilen.push(reihe(
    knopf(kodiere('p', z, { seite: z.seite - 1 }), '⬅️').setDisabled(z.seite <= 0),
    knopf(kodiere('n', z), `${z.seite + 1}/${seiten}`).setDisabled(true),
    knopf(kodiere('p', z, { seite: z.seite + 1 }), '➡️', ButtonStyle.Primary).setDisabled(z.seite >= seiten - 1),
    schliessenKnopf(kodiere('x', z)),
  ));

  return { nachricht: { content: '', embeds: [e], components: zeilen, allowedMentions: { parse: [] } }, daten: d };
}

// ---------------------------------------------------------------------------
// Öffnen (/listen) und Klicks
// ---------------------------------------------------------------------------
async function listenOeffnen(interaction) {
  const senden = schnellAntwort(interaction, 'reply');
  const { nachricht } = await listenNachricht(interaction.guild, { ...STANDARD });
  return senden(nachricht);
}

async function listenInteraktion(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('lp:')) return false;
  const guild = interaction.guild;
  const { aktion, z } = dekodiere(id);
  const verwalten = () => interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  if (aktion === 'x') return menueSchliessen(interaction, PermissionFlagsBits.ManageMessages);

  // Aktionen, die etwas ändern, brauchen "Server verwalten"
  if (['s', 'u', 'l', 'L'].includes(aktion) && !verwalten()) {
    await interaction.reply(privat('❌ Speichern und Löschen dürfen nur Leute mit „Server verwalten“.'));
    return true;
  }

  // Datei schicken
  if (aktion === 'd') {
    await interaction.deferReply();
    const { daten } = await listenNachricht(guild, z);
    if (!daten.pfad) await interaction.editReply('❌ Für diese Ansicht gibt es keine Datei.');
    else await interaction.editReply({ content: `📄 ${daten.titel}`, files: [daten.pfad] });
    return true;
  }

  const senden = schnellAntwort(interaction, 'update');
  let hinweis = null;

  if (aktion === 'a') Object.assign(z, { ansicht: interaction.values[0], seite: 0 });
  if (aktion === 'c') Object.assign(z, { ch: interaction.values[0], seite: 0 });
  if (aktion === 't') Object.assign(z, { tage: interaction.values[0], seite: 0 });
  if (aktion === 'v') Object.assign(z, { vor: z.vor === '1' ? '0' : '1', seite: 0 });
  if (aktion === 'b') Object.assign(z, { bild: z.bild === '1' ? '0' : '1', seite: 0 });
  if (aktion === 'r') vergessen(`${guild.id}:`);

  // "Alle löschen": erst Rückfrage im Menü (l), dann löschen (L) oder abbrechen (k)
  if (aktion === 'l') {
    const { nachricht } = await listenNachricht(guild, z, { bestaetigen: true });
    await senden(nachricht);
    return true;
  }
  if (aktion === 'L') {
    const chId = z.ch !== '-' ? z.ch : config[guild.id]?.ersterId;
    const anzahl = Object.keys(gespeicherteKanaele.get(chId)?.user || {}).length;
    kanalLoeschen(chId);
    vergessen(`${guild.id}:liste:`);
    hinweis = `🗑️ ${anzahl} gespeicherte Namen von <#${chId}> gelöscht.`;
  }

  if (aktion === 'u') {
    const chId = z.ch !== '-' ? z.ch : config[guild.id]?.ersterId;
    const d = gespeicherteKanaele.get(chId);
    const wer = interaction.values[0];
    if (d?.user?.[wer]) {
      delete d.user[wer];
      kanalSichern(d);
      vergessen(`${guild.id}:liste:`);
      hinweis = `✅ <@${wer}> aus der Datei von <#${chId}> entfernt.`;
    } else hinweis = `<@${wer}> steht nicht in der Datei von <#${chId}>.`;
  }

  if (aktion === 's') {
    const { daten } = await listenNachricht(guild, z);
    const ziel = kanalHolen(guild.id, daten.kanal.id, daten.kanal.name);
    let neu = 0;
    for (const p of daten.eintraege) {
      if (!ziel.user[p.id]) neu++;
      const vorher = ziel.user[p.id] || {};
      const letzter = p.letzter instanceof Date ? p.letzter.toISOString() : vorher.letzter || new Date().toISOString();
      ziel.user[p.id] = { name: p.name || vorher.name, user: p.user || vorher.user, letzter };
    }
    (ziel.quellen ??= []).push({ zeitraum: daten.titel, filter: null, am: new Date().toISOString(), anzahl: daten.eintraege.length });
    kanalSichern(ziel);
    vergessen(`${guild.id}:liste:`);
    const istErster = config[guild.id]?.ersterId === daten.kanal.id;
    hinweis = `💾 **${daten.eintraege.length}** Namen in die Datei von <#${daten.kanal.id}> gespeichert (${neu} neu, insgesamt ${Object.keys(ziel.user).length}).\n` +
      (istErster ? 'Das ist der erste Channel – die Namen zählen ab sofort für die Regel.' : 'Die Namen zählen, sobald dieser Channel der erste Channel ist.');
  }

  const { nachricht } = await listenNachricht(guild, z);
  await senden(nachricht);
  if (hinweis) await interaction.followUp(privat(hinweis));
  return true;
}

module.exports = {
  listenInteraktion,
  listenNachricht,
  listenOeffnen,
};
