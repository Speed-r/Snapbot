const {
  ButtonStyle, ChannelSelectMenuBuilder, EmbedBuilder, ModalBuilder,
  PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { TEXT_CHANNELS, eingabeFenster, knopf, menueSchliessen, reihe, schliessenKnopf, schnellAntwort } = require('./menue');
const { client } = require('../lib/client');
const { STANDARD_DOPPELT, STANDARD_FREISCHALT, STANDARD_NUR_BILDER, STANDARD_TEXT, STANDARD_VOLL, STANDARD_ZEIT, config, gespeicherteKanaele, regelBereit, speichern } = require('../lib/daten');
const { LINK_REGEX, WOCHENTAGE, ZEITZONE, formatUhrzeit, parseUhrzeit, privat } = require('../lib/helfer');
const { alleEntsperren, istAusnahme, rollenCache, sperreAufheben } = require('../lib/rechte');
const { doppeltText, fruehCache, hinweisText, nurBilderText } = require('../lib/regel');
const { sperrenVorbereiten } = require('../lib/ablauf');
const { abschlussStatus, abschlussText, abschlussZaehler, abschlussZeitPruefen, channelSchliessen, freischaltPause, freischaltText, istFreigeschaltet, zaehlerCache } = require('../lib/abschluss');

// ===========================================================================
// /einstellungen – Einstellungs-Menü
//   ep:…   = Menü      epm:… = Eingabefenster aus dem Menü
// Alles ist zustandslos: der aktuelle Bereich steckt in der customId, die Werte kommen aus config.
// ===========================================================================
const FARBE = 0x5865f2;

const BEREICHE = [
  { id: 'regel', name: 'Regel', emoji: '📺', info: 'Channels, Uhrzeit, Regel-Link' },
  { id: 'optionen', name: 'Optionen', emoji: '🔧', info: 'Sperre, Warte-Rolle, Löschen, Bilder, ein Beitrag' },
  { id: 'freischalten', name: 'Freischalten', emoji: '🔓', info: 'Folge-Channel für alle freischalten – automatisch oder per /channel' },
  { id: 'abschluss', name: 'Abschluss', emoji: '🏁', info: 'Folge-Channel automatisch schließen' },
  { id: 'ausnahmen', name: 'Ausnahmen', emoji: '🛡️', info: 'Rollen, für die die Regel nicht gilt' },
  { id: 'texte', name: 'Texte', emoji: '📝', info: 'Hinweistexte und Abschlusstexte' },
];
const bereichInfo = (id) => BEREICHE.find((b) => b.id === id) || BEREICHE[0];

const STANDARD_CFG = () => ({ sperren: true, loeschen: false, nurBilder: true, bildvergleich: false, toleranz: 8, gesperrt: {} });
const anAus = (x) => (x ? 'an' : 'aus');
// Texte-Bereich in Seiten: je Seite die Texte, die zusammengehören (vollständig, nicht abgeschnitten)
const TEXT_SEITEN = [
  { name: 'Hinweise', texte: ['hinweis', 'doppelt', 'nurbilder'] },
  { name: 'Abschluss', texte: ['voll', 'zeit'] },
  { name: 'Freischalten', texte: ['freischalt'] },
];
const TEXT_INFO = {
  hinweis: { titel: '📣 Hinweis (Uhrzeit-Regel)', knopf: '📣 Hinweis bearbeiten' },
  doppelt: { titel: '1️⃣ Nur ein Beitrag', knopf: '1️⃣ Ein Beitrag bearbeiten' },
  nurbilder: { titel: '🚫 Nur Bilder erlaubt', knopf: '🚫 Nur Bilder bearbeiten' },
  voll: { titel: '📸 Abschluss – Bilder voll', knopf: '📸 Bilder voll bearbeiten' },
  zeit: { titel: '⏰ Abschluss – Zeit um', knopf: '⏰ Zeit um bearbeiten' },
  freischalt: { titel: '📢 Beim Freischalten', knopf: '📢 Freischalt-Text bearbeiten' },
};
// Auf welcher Seite steht ein Text? (z. B. nach dem Bearbeiten wieder dorthin)
const seiteVonText = (art) => Math.max(0, TEXT_SEITEN.findIndex((s) => s.texte.includes(art)));

function textVorschau(guild, cfg, art) {
  const t = {
    hinweis: () => hinweisText(cfg, '0').replace('<@0>', '@Person'),
    doppelt: () => doppeltText(cfg, '0').replace('<@0>', '@Person'),
    nurbilder: () => nurBilderText(cfg, '0').replace('<@0>', '@Person'),
    voll: () => abschlussText(cfg, 'voll', cfg.abschluss?.anzahl ?? 50),
    zeit: () => abschlussText(cfg, 'zeit', 42),
    freischalt: () => freischaltText(cfg, guild.channels.cache?.get(cfg.folgeId)?.name),
  }[art]();
  return t || '*(leer)*';
}

const kanal = (id) => (id ? `<#${id}>` : '*nicht gesetzt*');
const rolle = (id, leer = '@everyone') => (id ? `<@&${id}>` : leer);

// ---------------------------------------------------------------------------
// Inhalte der Bereiche (gleich für Panel und Ansicht)
// ---------------------------------------------------------------------------
async function bereichEmbed(guild, cfg, bereich, fuss, seite = 0) {
  const b = bereichInfo(bereich);
  const e = new EmbedBuilder()
    .setColor(FARBE)
    .setAuthor({ name: 'Snap-Bot · Einstellungen', iconURL: client.user?.displayAvatarURL?.() || undefined })
    .setTitle(`${b.emoji} ${b.name}`)
    .setDescription(`*${b.info}*`)
    .setFooter({ text: fuss });
  const f = (name, value, inline = true) => ({ name, value: String(value || '–'), inline });

  if (b.id === 'regel') {
    const gesperrt = Object.keys(cfg.gesperrt || {}).length;
    e.addFields(
      f('📺 Erster Channel', kanal(cfg.ersterId)),
      f('📺 Folge-Channel', kanal(cfg.folgeId)),
      f('📣 Hinweis-Channel', kanal(cfg.hinweisId)),
      f('⏰ Erlaubt ab', (cfg.uhrzeit ? `**${cfg.uhrzeit} Uhr**` : '*nicht gesetzt*') + '\n-# Frühposter dürfen erst ab dann im Folge-Channel posten'),
      f('🔒 Gerade gesperrt', `${gesperrt} Person(en)`),
      f('🔗 Regel-Link', cfg.regelLink ? `[Zur Regel](${cfg.regelLink})` : '–'),
    );
    if (!regelBereit(cfg)) {
      e.addFields(f('⚠️ Noch nicht aktiv', 'Bitte erster Channel, Folge-Channel, Hinweis-Channel und Uhrzeit setzen.', false));
    }
  }

  if (b.id === 'optionen') {
    e.addFields(
      f('🔒 Sperre', anAus(cfg.sperren !== false)),
      f('⏳ Warte-Rolle', rolle(cfg.warteRolleId, '„⏳ Wartet“ (automatisch)')),
      f('🗑️ Zu früh löschen', anAus(cfg.loeschen)),
      f('🖼️ Nur Bilder zählen', anAus(cfg.nurBilder !== false)),
      f('🔍 Bildvergleich', anAus(cfg.bildvergleich)),
      f('🎯 Toleranz', `${cfg.toleranz ?? 8} (0–20)`),
      f('1️⃣ Nur ein Beitrag', anAus(cfg.einBeitrag !== false)),
      f('🚫 Nur Bilder erlauben', anAus(!!cfg.nurBilderErlaubt) + '\n-# Beiträge ohne Bild (Text, Video …) im Folge-Channel löschen'),
      f('\u200b', '\u200b'),
    );
  }

  if (b.id === 'freischalten') {
    const fs = cfg.freischalten || {};
    const folge = guild.channels.cache?.get(cfg.folgeId);
    const offen = regelBereit(cfg) && folge ? istFreigeschaltet(guild, cfg, folge) : null;
    const wann = fs.uhrzeit
      ? `${fs.wochentag != null ? WOCHENTAGE[fs.wochentag] : '⚠️ Wochentag wählen'} · **${fs.uhrzeit} Uhr**`
      : '⚠️ Uhrzeit fehlt';
    e.addFields(
      f('🤖 Automatisch', anAus(!!fs.auto) + '\n-# Bot schaltet den Folge-Channel selbst frei'),
      f('📅 Wann', wann),
      f('⏱️ Freischalt-Pause', `${freischaltPause(cfg)} Sekunden\n-# zwischen Freischalten und Text`),
      f('📊 Folge-Channel', offen === null ? '–' : offen ? '🔓 freigeschaltet' : '🔒 noch unsichtbar'),
      f('👆 Von Hand', '`/channel` → 🔓 Channel freischalten'),
      f('📢 Freischalt-Text', 'Einstellbar unter 📝 Texte → Seite 3'),
    );
  }
  if (b.id === 'abschluss') {
    const a = cfg.abschluss || {};
    const st = a.status?.channelId === cfg.folgeId ? a.status : null;
    let status = st?.geschlossen ? `🔴 geschlossen (${st.grund === 'voll' ? 'Bilder voll' : 'Zeit um'})` : '🟢 offen';
    let gezaehlt = '–';
    if (a.anzahl && regelBereit(cfg)) {
      const set = zaehlerCache.get(cfg.folgeId);
      if (set) gezaehlt = `${set.size} / ${a.anzahl}`;
      else {
        gezaehlt = '⏳ wird gezählt …';
        hintergrund(guild.id, () => abschlussZaehler(guild, cfg));
      }
    }
    if (!a.anzahl && !a.uhrzeit) status = '⚪ aus';
    e.addFields(
      f('📸 Bilder voll ab', a.anzahl ? `**${a.anzahl}** Leuten` : 'aus'),
      f('⏰ Zeit um', a.uhrzeit ? `${WOCHENTAGE[a.wochentag] || '⚠️ Wochentag wählen'} · **${a.uhrzeit} Uhr**` : 'aus'),
      f('🔇 Rolle', rolle(a.rolleId)),
      f('📣 Abschluss-Meldung', anAus(a.meldung !== false)),
      f('📊 Status', status),
      f('👥 Gezählt', gezaehlt),
    );
  }

  if (b.id === 'ausnahmen') {
    const rollen = (cfg.ausnahmeRollen || []).map((r) => `<@&${r}>`);
    const gesperrt = Object.keys(cfg.gesperrt || {});
    e.addFields(
      f('🛡️ Ausnahme-Rollen', rollen.join('\n') || 'keine', true),
      f('💾 Gespeicherte Namen', `${Object.keys(gespeicherteKanaele.get(cfg.ersterId)?.user || {}).length} (erster Channel)`),
      f(`🔒 Gerade gesperrt (${gesperrt.length})`,
        gesperrt.slice(0, 15).map((id) => `<@${id}>`).join(' ') + (gesperrt.length > 15 ? ` … +${gesperrt.length - 15}` : '') || '–'),
    );
  }

  if (b.id === 'texte') {
    // Vollständige Texte in der Beschreibung (bis 4096 Zeichen) – so wie sie später im Channel aussehen
    const s = TEXT_SEITEN[seite];
    const teile = s.texte.map((art) => `## ${TEXT_INFO[art].titel}\n${textVorschau(guild, cfg, art)}`);
    let beschreibung = `*${b.info}* · Seite ${seite + 1}/${TEXT_SEITEN.length}: **${s.name}**\n\n${teile.join('\n\n━━━━━━━━━━━━\n\n')}`;
    if (beschreibung.length > 4096) beschreibung = beschreibung.slice(0, 4095) + '…';
    e.setDescription(beschreibung);
  }
  return e;
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------
const schalter = (id, label, an) => knopf(id, `${label}: ${anAus(an)}`, an ? ButtonStyle.Success : ButtonStyle.Secondary);
const schliessen = (prefix) => schliessenKnopf(`${prefix}:schliessen`);

function bereichAuswahl(id, aktuell) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder('Bereich wählen …')
    .addOptions(BEREICHE.map((b) => ({ label: b.name, value: b.id, description: b.info, emoji: { name: b.emoji }, default: b.id === aktuell })));
}

function channelAuswahl(id, platzhalter, aktuell) {
  const m = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(platzhalter).setChannelTypes(...TEXT_CHANNELS);
  if (aktuell && typeof m.setDefaultChannels === 'function') m.setDefaultChannels(aktuell);
  return m;
}

function rollenAuswahl(id, platzhalter, aktuell = [], max = 1) {
  const m = new RoleSelectMenuBuilder().setCustomId(id).setPlaceholder(platzhalter).setMinValues(max > 1 ? 0 : 1).setMaxValues(max);
  const ids = aktuell.filter(Boolean);
  if (ids.length && typeof m.setDefaultRoles === 'function') m.setDefaultRoles(...ids);
  return m;
}

// ---------------------------------------------------------------------------
// Panel (Einstellen)
// ---------------------------------------------------------------------------
async function panelNachricht(guild, cfg, bereich = 'regel', seite = 0) {
  seite = Math.min(Math.max(Number(seite) || 0, 0), TEXT_SEITEN.length - 1);
  const embed = await bereichEmbed(guild, cfg, bereich, `Änderungen werden sofort gespeichert · Zeitzone: ${ZEITZONE}`, seite);
  const zeilen = [reihe(bereichAuswahl('ep:bereich', bereich))];
  const a = cfg.abschluss || {};

  if (bereich === 'regel') {
    zeilen.push(
      reihe(channelAuswahl('ep:regel:erster', '📺 Erster Channel wählen …', cfg.ersterId)),
      reihe(channelAuswahl('ep:regel:folge', '📺 Folge-Channel wählen …', cfg.folgeId)),
      reihe(channelAuswahl('ep:regel:hinweis', '📣 Hinweis-Channel wählen …', cfg.hinweisId)),
      reihe(
        knopf('ep:regel:uhrzeit', `⏰ Uhrzeit: ${cfg.uhrzeit || '–'}`, ButtonStyle.Primary),
        knopf('ep:regel:link', '🔗 Regel-Link', ButtonStyle.Primary),
        schliessen('ep'),
      ),
    );
  } else if (bereich === 'optionen') {
    zeilen.push(
      reihe(
        schalter('ep:optionen:sperren', '🔒 Sperre', cfg.sperren !== false),
        schalter('ep:optionen:loeschen', '🗑️ Löschen', cfg.loeschen),
        schalter('ep:optionen:nurBilder', '🖼️ Nur Bilder', cfg.nurBilder !== false),
        schalter('ep:optionen:bildvergleich', '🔍 Bildvergleich', cfg.bildvergleich),
        knopf('ep:optionen:toleranz', `🎯 Toleranz: ${cfg.toleranz ?? 8}`, ButtonStyle.Primary),
      ),
      reihe(rollenAuswahl('ep:optionen:warterolle', '⏳ Warte-Rolle wählen (Standard: automatisch) …', [cfg.warteRolleId])),
      reihe(
        schalter('ep:optionen:einBeitrag', '1️⃣ Nur ein Beitrag', cfg.einBeitrag !== false),
        schalter('ep:optionen:nurBilderErlaubt', '🚫 Nur Bilder erlauben', !!cfg.nurBilderErlaubt),
        schliessen('ep'),
      ),
    );
  } else if (bereich === 'freischalten') {
    const fs = cfg.freischalten || {};
    zeilen.push(
      reihe(new StringSelectMenuBuilder()
        .setCustomId('ep:freischalten:wochentag')
        .setPlaceholder('📅 Wochentag fürs automatische Freischalten …')
        .addOptions(['1', '2', '3', '4', '5', '6', '0', 'taeglich']
          .map((v) => ({ label: WOCHENTAGE[v][0].toUpperCase() + WOCHENTAGE[v].slice(1), value: v, default: fs.wochentag === v })))),
      reihe(
        schalter('ep:freischalten:auto', '🤖 Automatisch', !!fs.auto),
        knopf('ep:freischalten:uhrzeit', `⏰ Uhrzeit: ${fs.uhrzeit || 'aus'}`, ButtonStyle.Primary),
        knopf('ep:freischalten:pause', `⏱️ Pause: ${freischaltPause(cfg)} s`, ButtonStyle.Primary),
        schliessen('ep'),
      ),
    );
  } else if (bereich === 'abschluss') {
    zeilen.push(
      reihe(new StringSelectMenuBuilder()
        .setCustomId('ep:abschluss:wochentag')
        .setPlaceholder('📅 Wochentag für „Zeit um“ wählen …')
        .addOptions(['1', '2', '3', '4', '5', '6', '0', 'taeglich']
          .map((v) => ({ label: WOCHENTAGE[v][0].toUpperCase() + WOCHENTAGE[v].slice(1), value: v, default: a.wochentag === v })))),
      reihe(rollenAuswahl('ep:abschluss:rolle', '🔇 Rolle, die beim Schließen gesperrt wird (Standard: @everyone) …', [a.rolleId])),
      reihe(
        knopf('ep:abschluss:anzahl', `📸 Anzahl: ${a.anzahl || 'aus'}`, ButtonStyle.Primary),
        knopf('ep:abschluss:uhrzeit', `⏰ Uhrzeit: ${a.uhrzeit || 'aus'}`, ButtonStyle.Primary),
        schalter('ep:abschluss:meldung', '📣 Meldung', a.meldung !== false),
        schliessen('ep'),
      ),
    );
  } else if (bereich === 'ausnahmen') {
    zeilen.push(
      reihe(rollenAuswahl('ep:ausnahmen:rollen', '🛡️ Ausnahme-Rollen wählen (mehrere möglich) …', cfg.ausnahmeRollen || [], 25)),
      reihe(schliessen('ep')),
    );
  } else if (bereich === 'texte') {
    // Bearbeiten-Buttons nur für die Texte dieser Seite, darunter Blättern
    zeilen.push(
      reihe(...TEXT_SEITEN[seite].texte.map((art) => knopf(`ep:texte:${art}`, TEXT_INFO[art].knopf, ButtonStyle.Primary))),
      reihe(
        knopf(`ep:texte:seite:${seite - 1}`, '⬅️').setDisabled(seite <= 0),
        knopf('ep:texte:seitenanzeige', `${seite + 1}/${TEXT_SEITEN.length}`).setDisabled(true),
        knopf(`ep:texte:seite:${seite + 1}`, '➡️', ButtonStyle.Primary).setDisabled(seite >= TEXT_SEITEN.length - 1),
        schliessen('ep'),
      ),
    );
  }
  return { content: '', embeds: [embed], components: zeilen, allowedMentions: { parse: [] } };
}

// ---------------------------------------------------------------------------
// Fenster
// ---------------------------------------------------------------------------
// Fenster für Hinweis-/Abschlusstexte
function textFenster(cfg, art) {
  const vorgabe = {
    hinweis: { titel: 'Hinweistext', label: 'Text ({user} {channel} {nummer} {uhrzeit})', wert: cfg.text || STANDARD_TEXT },
    voll: { titel: 'Abschluss – Bilder voll', label: 'Text ({anzahl} {max} {uhrzeit} {channel})', wert: cfg.abschluss?.textVoll || STANDARD_VOLL },
    zeit: { titel: 'Abschluss – Zeit um', label: 'Text ({anzahl} {max} {uhrzeit} {channel})', wert: cfg.abschluss?.textZeit || STANDARD_ZEIT },
    doppelt: { titel: 'Nur ein Beitrag', label: 'Text ({user} {channel} {nummer})', wert: cfg.textDoppelt || STANDARD_DOPPELT },
    nurbilder: { titel: 'Nur Bilder erlaubt', label: 'Text ({user} {channel} {nummer})', wert: cfg.textNurBilder || STANDARD_NUR_BILDER },
    freischalt: { titel: 'Text beim Freischalten', label: 'Text ({nummer} {channel} {uhrzeit} {regel})', wert: cfg.textFreischalt || STANDARD_FREISCHALT },
  }[art];
  const feld = new TextInputBuilder()
    .setCustomId('text')
    .setLabel(vorgabe.label)
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1800)
    .setRequired(false)
    .setValue(vorgabe.wert);
  return new ModalBuilder().setCustomId(`text:${art}`).setTitle(vorgabe.titel).addComponents(reihe(feld));
}

// ---------------------------------------------------------------------------
// Änderungen anwenden
// ---------------------------------------------------------------------------
// Langsame Arbeit (Rollen vergeben/entfernen, Channel zählen) läuft im Hintergrund, damit das Menü sofort
// antwortet. Pro Server nacheinander, damit sich z. B. Entsperren und neues Sperren nicht überholen.
const warteschlange = new Map(); // guildId -> Promise
function hintergrund(gid, aufgabe) {
  const weiter = (warteschlange.get(gid) || Promise.resolve())
    .then(aufgabe)
    .catch((e) => console.warn('Hintergrund-Aufgabe fehlgeschlagen:', e.message));
  warteschlange.set(gid, weiter);
  return weiter;
}

// Alle aktuell Gesperrten im Hintergrund freigeben (mit dem bisherigen Folge-Channel / der bisherigen Rolle)
function alleFreigebenImHintergrund(guild, cfg) {
  const vorher = { ...cfg, gesperrt: { ...(cfg.gesperrt || {}) } };
  cfg.gesperrt = {};
  hintergrund(guild.id, () => alleEntsperren(guild, vorher));
}

function nachRegelAenderung(guild, cfg, { neuBerechnen = false } = {}) {
  if (neuBerechnen) {
    fruehCache.delete(cfg.ersterId);
    cfg.vorbereitetAm = null;
  }
  speichern();
  if (regelBereit(cfg)) hintergrund(guild.id, () => sperrenVorbereiten(guild, cfg));
}

function nachAbschlussAenderung(guild, cfg) {
  speichern();
  if (!regelBereit(cfg)) return;
  hintergrund(guild.id, async () => {
    const a = cfg.abschluss || {};
    const st = abschlussStatus(cfg);
    if (a.anzahl && !st.geschlossen && !st.vollErledigt) {
      const set = await abschlussZaehler(guild, cfg);
      if (set.size >= a.anzahl) await channelSchliessen(guild, cfg, 'voll', set.size);
    }
    await abschlussZeitPruefen(guild, cfg);
  });
}

// Gibt eine Fehlermeldung zurück oder null
async function channelSetzen(guild, cfg, art, id) {
  if (art === 'erster' && id === cfg.folgeId) return 'Erster Channel und Folge-Channel müssen verschieden sein.';
  if (art === 'folge' && id === cfg.ersterId) return 'Erster Channel und Folge-Channel müssen verschieden sein.';
  if (art === 'hinweis') {
    cfg.hinweisId = id;
    speichern();
    return null;
  }
  if (art === 'folge' && cfg.folgeId && cfg.folgeId !== id) alleFreigebenImHintergrund(guild, cfg);
  if (art === 'erster') cfg.ersterId = id;
  else cfg.folgeId = id;
  nachRegelAenderung(guild, cfg, { neuBerechnen: true });
  return null;
}

async function ausnahmenSetzen(guild, cfg, ids) {
  cfg.ausnahmeRollen = ids;
  rollenCache.clear();
  speichern();
  // Wer gerade gesperrt ist und jetzt eine Ausnahme-Rolle hat, wird freigegeben
  hintergrund(guild.id, async () => {
    for (const userId of Object.keys(cfg.gesperrt || {})) {
      if (await istAusnahme(guild, cfg, userId)) {
        await sperreAufheben(guild, cfg, userId);
        delete cfg.gesperrt[userId];
      }
    }
    speichern();
  });
}

// ---------------------------------------------------------------------------
// Klicks, Auswahl und Fenster verarbeiten
// ---------------------------------------------------------------------------
async function panelInteraktion(interaction) {
  const id = interaction.customId || '';
  if (!/^(ep|epm):/.test(id)) return false;
  const guild = interaction.guild;
  const gid = guild.id;

  // --- Panel: nur mit "Server verwalten"
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply(privat('❌ Einstellungen ändern dürfen nur Leute mit „Server verwalten“.'));
    return true;
  }
  if (id === 'ep:schliessen') return menueSchliessen(interaction, PermissionFlagsBits.ManageGuild);

  config[gid] ??= STANDARD_CFG();
  const cfg = config[gid];
  cfg.abschluss ??= {};
  const a = cfg.abschluss;
  const [, bereich, feld] = id.split(':');

  // Bereich wechseln
  if (id === 'ep:bereich') {
    await interaction.update(await panelNachricht(guild, cfg, interaction.values[0]));
    return true;
  }

  // Texte: blättern
  if (id.startsWith('ep:texte:seite:')) {
    await interaction.update(await panelNachricht(guild, cfg, 'texte', Number(id.split(':')[3])));
    return true;
  }

  // Buttons, die ein Fenster öffnen (müssen sofort antworten)
  if (interaction.isButton()) {
    const fenster = {
      'ep:regel:uhrzeit': () => eingabeFenster('epm:regel:uhrzeit', 'Uhrzeit X', 'Folge-Channel erlaubt ab (HH:MM)', cfg.uhrzeit, '16:00'),
      'ep:regel:link': () => eingabeFenster('epm:regel:link', 'Regel-Link', 'Nachrichtenlink zur Regel (leer = entfernen)', cfg.regelLink, 'https://discord.com/channels/…'),
      'ep:freischalten:pause': () => eingabeFenster('epm:freischalten:pause', 'Freischalt-Pause', 'Sekunden bis zum Freischalt-Text (0–60)', freischaltPause(cfg), '8'),
      'ep:freischalten:uhrzeit': () => eingabeFenster('epm:freischalten:uhrzeit', 'Automatisch freischalten', 'Uhrzeit HH:MM (aus = ausschalten)', cfg.freischalten?.uhrzeit ?? 'aus', '12:00'),
      'ep:optionen:toleranz': () => eingabeFenster('epm:optionen:toleranz', 'Bildvergleich-Toleranz', 'Zahl von 0 bis 20 (Standard 8)', cfg.toleranz ?? 8, '8'),
      'ep:abschluss:anzahl': () => eingabeFenster('epm:abschluss:anzahl', 'Bilder voll', 'Ab wie vielen Leuten schließen? (0 = aus)', a.anzahl ?? 0, '50'),
      'ep:abschluss:uhrzeit': () => eingabeFenster('epm:abschluss:uhrzeit', 'Zeit um', 'Uhrzeit HH:MM (aus = ausschalten)', a.uhrzeit ?? 'aus', '23:59'),
      'ep:texte:hinweis': () => textFenster(cfg, 'hinweis'),
      'ep:texte:voll': () => textFenster(cfg, 'voll'),
      'ep:texte:zeit': () => textFenster(cfg, 'zeit'),
      'ep:texte:doppelt': () => textFenster(cfg, 'doppelt'),
      'ep:texte:nurbilder': () => textFenster(cfg, 'nurbilder'),
      'ep:texte:freischalt': () => textFenster(cfg, 'freischalt'),
    }[id];
    if (fenster) {
      await interaction.showModal(fenster());
      return true;
    }
  }

  // Ab hier: Änderung anwenden, danach Panel aktualisieren
  const senden = schnellAntwort(interaction, 'update');
  let fehler = null;

  if (id.startsWith('epm:')) {
    const wert = interaction.fields.getTextInputValue('wert').trim();
    if (bereich === 'regel' && feld === 'uhrzeit') {
      const min = parseUhrzeit(wert);
      if (min === null) fehler = 'Uhrzeit bitte als HH:MM angeben, z. B. 16:00.';
      else {
        cfg.uhrzeit = formatUhrzeit(min);
        cfg.uhrzeitMinuten = min;
        nachRegelAenderung(guild, cfg, { neuBerechnen: true });
      }
    } else if (bereich === 'regel' && feld === 'link') {
      if (wert && !LINK_REGEX.test(wert)) fehler = 'Das ist kein Discord-Nachrichtenlink (https://discord.com/channels/…).';
      else { cfg.regelLink = wert || null; speichern(); }
    } else if (bereich === 'freischalten' && feld === 'pause') {
      const n = Number(wert);
      if (!Number.isInteger(n) || n < 0 || n > 60) fehler = 'Pause bitte als ganze Zahl von 0 bis 60 Sekunden.';
      else { cfg.freischaltPause = n; speichern(); }
    } else if (bereich === 'freischalten' && feld === 'uhrzeit') {
      const fs = (cfg.freischalten ??= {});
      if (!wert || wert.toLowerCase() === 'aus') { fs.uhrzeit = null; fs.uhrzeitMinuten = null; speichern(); }
      else {
        const min = parseUhrzeit(wert);
        if (min === null) fehler = 'Uhrzeit bitte als HH:MM angeben, z. B. 12:00 – oder `aus`.';
        else { fs.uhrzeit = formatUhrzeit(min); fs.uhrzeitMinuten = min; speichern(); }
      }
    } else if (bereich === 'optionen' && feld === 'toleranz') {
      const n = Number(wert);
      if (!Number.isInteger(n) || n < 0 || n > 20) fehler = 'Toleranz bitte als ganze Zahl von 0 bis 20.';
      else { cfg.toleranz = n; speichern(); }
    } else if (bereich === 'abschluss' && feld === 'anzahl') {
      const n = Number(wert || 0);
      if (!Number.isInteger(n) || n < 0 || n > 1000) fehler = 'Anzahl bitte als ganze Zahl von 0 bis 1000 (0 = aus).';
      else { a.anzahl = n || null; zaehlerCache.delete(cfg.folgeId); nachAbschlussAenderung(guild, cfg); }
    } else if (bereich === 'abschluss' && feld === 'uhrzeit') {
      if (!wert || wert.toLowerCase() === 'aus') { a.uhrzeit = null; a.uhrzeitMinuten = null; nachAbschlussAenderung(guild, cfg); }
      else {
        const min = parseUhrzeit(wert);
        if (min === null) fehler = 'Uhrzeit bitte als HH:MM angeben, z. B. 23:59 – oder `aus`.';
        else {
          a.uhrzeit = formatUhrzeit(min);
          a.uhrzeitMinuten = min;
          a.wochentag ??= '0'; // ohne Auswahl: Sonntag
          nachAbschlussAenderung(guild, cfg);
        }
      }
    }
  } else if (bereich === 'regel') {
    fehler = await channelSetzen(guild, cfg, feld, interaction.values[0]);
  } else if (bereich === 'optionen') {
    if (feld === 'warterolle') {
      const neu = interaction.values[0];
      if (neu === gid) fehler = '@everyone kann nicht die Warte-Rolle sein – bitte eine eigene Rolle wählen.';
      else if (neu !== cfg.warteRolleId) {
        alleFreigebenImHintergrund(guild, cfg);
        cfg.warteRolleId = neu;
        nachRegelAenderung(guild, cfg, { neuBerechnen: true });
      }
    } else if (feld === 'sperren') {
      cfg.sperren = cfg.sperren === false;
      if (!cfg.sperren) alleFreigebenImHintergrund(guild, cfg);
      nachRegelAenderung(guild, cfg, { neuBerechnen: true });
    } else if (feld === 'nurBilder') {
      cfg.nurBilder = cfg.nurBilder === false;
      nachRegelAenderung(guild, cfg, { neuBerechnen: true });
    } else if (feld === 'nurBilderErlaubt') {
      cfg.nurBilderErlaubt = !cfg.nurBilderErlaubt;
      speichern();
    } else if (feld === 'einBeitrag') {
      cfg.einBeitrag = cfg.einBeitrag === false;
      speichern();
    } else if (feld === 'loeschen' || feld === 'bildvergleich') {
      cfg[feld] = !cfg[feld];
      speichern();
    }
  } else if (bereich === 'freischalten') {
    const fs = (cfg.freischalten ??= {});
    if (feld === 'wochentag') fs.wochentag = interaction.values[0];
    if (feld === 'auto') fs.auto = !fs.auto;
    speichern();
  } else if (bereich === 'abschluss') {
    if (feld === 'wochentag') a.wochentag = interaction.values[0];
    if (feld === 'rolle') a.rolleId = interaction.values[0] === gid ? null : interaction.values[0];
    if (feld === 'meldung') a.meldung = a.meldung === false;
    nachAbschlussAenderung(guild, cfg);
  } else if (bereich === 'ausnahmen') {
    await ausnahmenSetzen(guild, cfg, interaction.values);
  }

  await senden(await panelNachricht(guild, cfg, bereich));
  if (fehler) await interaction.followUp(privat(`❌ ${fehler}`));
  return true;
}

module.exports = {
  panelInteraktion,
  panelNachricht,
  seiteVonText,
  textFenster,
};
