const { client } = require('./client');
const { PermissionFlagsBits } = require('discord.js');
const { STANDARD_FREISCHALT, STANDARD_VOLL, STANDARD_ZEIT, speichern } = require('./daten');
const { alleNachrichten, bilderVon, minutenVon, tagVon, wochentagVon } = require('./helfer');
const { overwriteEntfernen } = require('./rechte');

// ---------------------------------------------------------------------------
// Abschluss: Folge-Channel schließen, wenn
//   A) X verschiedene Leute ein Bild gepostet haben  -> Text "Bilder voll"
//   B) Uhrzeit (an Wochentag) erreicht und noch offen -> Text "Zeit um"
// Was zuerst eintritt, schließt. Geöffnet wird nur manuell (/channel öffnen).
// ---------------------------------------------------------------------------

const zaehlerCache = new Map(); // folgeChannelId -> Set(userIds mit Bild)

// Verschiedene Leute, die im Folge-Channel ein Bild gepostet haben (ohne Bots)
async function abschlussZaehler(guild, cfg) {
  let set = zaehlerCache.get(cfg.folgeId);
  if (set) return set;
  set = new Set();
  const ch = await guild.channels.fetch(cfg.folgeId).catch(() => null);
  if (ch?.isTextBased()) {
    for (const m of await alleNachrichten(ch)) {
      if (m.author.bot || set.has(m.author.id) || bilderVon(m).length === 0) continue;
      set.add(m.author.id);
    }
  }
  zaehlerCache.set(cfg.folgeId, set);
  return set;
}

// Status gehört immer zum aktuellen Folge-Channel – neue Woche = neuer Status
function abschlussStatus(cfg) {
  cfg.abschluss ??= {};
  const a = cfg.abschluss;
  if (!a.status || a.status.channelId !== cfg.folgeId) {
    a.status = { channelId: cfg.folgeId, geschlossen: false, grund: null, vollErledigt: false, zeitTag: null };
  }
  return a.status;
}

function abschlussText(cfg, art, anzahl) {
  const a = cfg.abschluss || {};
  const vorlage = art === 'voll' ? a.textVoll || STANDARD_VOLL : a.textZeit || STANDARD_ZEIT;
  return vorlage
    .replaceAll('{anzahl}', String(anzahl))
    .replaceAll('{max}', String(a.anzahl ?? '–'))
    .replaceAll('{uhrzeit}', a.uhrzeit || '–')
    .replaceAll('{channel}', `<#${cfg.folgeId}>`);
}

async function channelSchliessen(guild, cfg, grund, anzahl) {
  const st = abschlussStatus(cfg);
  // Schon zu (z. B. hat eine andere Prüfung gerade geschlossen)? Dann nichts tun – keine zweite Meldung.
  // Prüfen und Setzen passieren ohne Pause dazwischen, deshalb kann das nicht doppelt passieren.
  if (st.geschlossen) return false;
  st.geschlossen = true;
  st.grund = grund;
  st.am = new Date().toISOString();
  if (grund === 'voll') st.vollErledigt = true;
  else st.zeitTag = tagVon(new Date());
  speichern();

  const start = Date.now();
  const ch = await guild.channels.fetch(cfg.folgeId).catch(() => null);
  if (!ch?.permissionOverwrites) return;
  const rolleId = cfg.abschluss.rolleId || guild.id; // ohne Rolle: @everyone
  try {
    // Bot selbst darf weiter schreiben (für den Abschlusstext) – nur setzen, wenn der Eintrag noch fehlt.
    // Beide Änderungen gleichzeitig statt nacheinander: Discord bremst Rechte-Änderungen am selben Channel.
    const botEintrag = ch.permissionOverwrites.cache?.get(client.user.id);
    const botDarfSchon = (BigInt(botEintrag?.allow?.bitfield ?? 0) & PermissionFlagsBits.SendMessages) !== 0n;
    await Promise.all([
      botDarfSchon ? null : ch.permissionOverwrites.edit(client.user.id, { SendMessages: true }, { reason: 'Abschluss: Bot darf posten' }),
      ch.permissionOverwrites.edit(rolleId, { SendMessages: false }, { reason: `Abschluss: ${grund === 'voll' ? 'Bilder voll' : 'Zeit um'}` }),
    ]);
  } catch (e) {
    console.warn(`Channel schließen fehlgeschlagen (fehlt "Berechtigungen verwalten"?): ${e.message}`);
  }
  if (cfg.abschluss.meldung !== false) { // Abschluss-Meldung abschaltbar
    await ch.send({ content: abschlussText(cfg, grund, anzahl), allowedMentions: { parse: [] } })
      .catch((e) => console.warn('Abschlusstext senden fehlgeschlagen:', e.message));
  }
  console.log(`Abschluss: #${ch.name} geschlossen (${grund === 'voll' ? `${anzahl} Bilder` : 'Zeit um'}) – Meldung nach ${((Date.now() - start) / 1000).toFixed(1)} s.`);
  return true;
}

async function channelOeffnen(guild, cfg) {
  const st = abschlussStatus(cfg);
  await overwriteEntfernen(guild, cfg.folgeId, cfg.abschluss.rolleId || guild.id);
  st.geschlossen = false;
  st.vollErledigt = true; // nach manuellem Öffnen nicht sofort wieder automatisch schließen
  st.zeitTag = tagVon(new Date());
  speichern();
}

// ---------------------------------------------------------------------------
// Neuen Folge-Channel für alle freischalten (Button in /einstellungen, Bereich Regel):
// @everyone: Kanal sehen JA, Nachrichten schreiben JA – danach der Freischalt-Text.
// Die Warte-Rolle sperrt Frühposter trotzdem weiter (Rollen-Einträge zählen mehr als @everyone).
// ---------------------------------------------------------------------------
// {nummer} = die (letzte) Zahl im Namen des Folge-Channels, z. B. "snap-44" -> 44
function nummerAusName(name) {
  const zahlen = String(name || '').match(/\d+/g);
  return zahlen ? String(Number(zahlen.at(-1))) : '?';
}


// Pause zwischen Rechte setzen und Freischalt-Text in Sekunden (einstellbar unter /einstellungen → Optionen, Standard 8)
const freischaltPause = (cfg) => cfg.freischaltPause ?? 8;

function freischaltText(cfg, channelName) {
  return (cfg.textFreischalt || STANDARD_FREISCHALT)
    .replaceAll('{nummer}', nummerAusName(channelName))
    .replaceAll('{channel}', `<#${cfg.folgeId}>`)
    .replaceAll('{uhrzeit}', cfg.uhrzeit || '–')
    .replaceAll('{regel}', cfg.regelLink || '');
}

// Ist der Folge-Channel schon für @everyone sichtbar? Direkt am Channel nachsehen – stimmt so auch
// nach einem Neustart oder wenn von Hand freigeschaltet wurde.
// Maßgeblich sind die echten Rechte: Darf @everyone den Channel sehen? Die gespeicherte Markierung zählt
// nur, wenn sich der Channel nicht abfragen lässt (sonst bliebe der Button grau, wenn man von Hand wieder versteckt).
function istFreigeschaltet(guild, cfg, ch) {
  const sichtbar = ch?.permissionsFor?.(guild.id)?.has(PermissionFlagsBits.ViewChannel);
  if (typeof sichtbar === 'boolean') return sichtbar;
  return cfg.freigeschaltetId === cfg.folgeId;
}

async function channelFreischalten(guild, cfg) {
  const ch = await guild.channels.fetch(cfg.folgeId).catch(() => null);
  if (!ch?.isTextBased?.()) return { fehler: 'Folge-Channel nicht gefunden.' };
  if (istFreigeschaltet(guild, cfg, ch)) {
    cfg.freigeschaltetId = cfg.folgeId; // merken, falls es von Hand passiert ist
    speichern();
    return { fehler: `<#${cfg.folgeId}> ist schon freigeschaltet.` };
  }
  if (abschlussStatus(cfg).geschlossen) {
    return { fehler: `<#${cfg.folgeId}> ist geschlossen (Abschluss). Zum Öffnen: /channel → 🔓 Folge-Channel öffnen.` };
  }
  try {
    await ch.permissionOverwrites.edit(guild.id, { [nameVon(PermissionFlagsBits.ViewChannel)]: true, [nameVon(PermissionFlagsBits.SendMessages)]: true },
      { reason: 'Channel freigeschaltet' });
  } catch (e) {
    return { fehler: `Rechte setzen fehlgeschlagen: ${e.message} (hat der Bot „Rollen verwalten“?)` };
  }
  // Gleich als freigeschaltet merken (kein doppelter Text bei schnellem Doppelklick)
  cfg.freigeschaltetId = cfg.folgeId;
  speichern();

  const text = freischaltText(cfg, ch.name).trim();
  // Erst die Rechte, den Text erst ein paar Sekunden später – Discord braucht manchmal kurz, bis die Rechte bei allen ankommen.
  // Pings sind hier gewollt: @everyone/@here, Rollen und Personen im Text werden angepingt.
  if (text) {
    setTimeout(() => {
      ch.send({ content: text, allowedMentions: { parse: ['everyone', 'roles', 'users'] } })
        .catch((e) => console.warn('Freischalt-Text fehlgeschlagen:', e.message));
    }, freischaltPause(cfg) * 1000);
  }
  // @everyone/@here pingt nur, wenn der Bot das Recht dazu hat – sonst Hinweis im Menü
  const botDarf = ch.permissionsFor?.(guild.members?.me)?.has(PermissionFlagsBits.MentionEveryone);
  const warnung = /@(everyone|here)/.test(text) && botDarf === false
    ? '\n⚠️ @everyone/@here hat nicht gepingt: Dem Bot fehlt das Recht „Erwähne @everyone, @here und alle Rollen“.'
    : '';
  console.log(`Freigeschaltet: #${ch.name} ist jetzt für alle sichtbar.`);
  // Keine Erfolgsmeldung im Channel – nur ein Hinweis, falls @everyone nicht pingen kann
  return { info: warnung ? warnung.trim() : null };
}

// PermissionFlagsBits-Wert -> Name für permissionOverwrites.edit (z. B. ViewChannel)
function nameVon(bit) {
  return Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === bit);
}

// A) nach jedem gültigen Bild-Post im Folge-Channel
async function abschlussVollPruefen(guild, cfg, userId) {
  const a = cfg.abschluss;
  if (!a?.anzahl) return;
  const st = abschlussStatus(cfg);
  if (st.geschlossen || st.vollErledigt) return;
  const set = await abschlussZaehler(guild, cfg);
  set.add(userId);
  if (set.size >= a.anzahl) await channelSchliessen(guild, cfg, 'voll', set.size);
}

// B) jede Minute
async function abschlussZeitPruefen(guild, cfg) {
  const a = cfg.abschluss;
  if (a?.uhrzeitMinuten == null) return;
  const jetzt = new Date();
  if (a.wochentag !== 'taeglich' && wochentagVon(jetzt) !== a.wochentag) return;
  if (minutenVon(jetzt) < a.uhrzeitMinuten) return;
  const st = abschlussStatus(cfg);
  if (st.geschlossen || st.zeitTag === tagVon(jetzt)) return;
  const set = await abschlussZaehler(guild, cfg);
  const schonVoll = a.anzahl && !st.vollErledigt && set.size >= a.anzahl;
  await channelSchliessen(guild, cfg, schonVoll ? 'voll' : 'zeit', set.size);
}

// C) nach dem Start: wurde die Anzahl erreicht, während der Bot offline war? Dann jetzt als "voll" schließen
async function abschlussNachholen(guild, cfg) {
  const a = cfg.abschluss;
  if (!a?.anzahl) return;
  const st = abschlussStatus(cfg);
  if (st.geschlossen || st.vollErledigt) return;
  const set = await abschlussZaehler(guild, cfg);
  if (set.size >= a.anzahl) await channelSchliessen(guild, cfg, 'voll', set.size);
}

module.exports = {
  abschlussNachholen,
  abschlussStatus,
  abschlussText,
  abschlussVollPruefen,
  abschlussZaehler,
  abschlussZeitPruefen,
  channelFreischalten,
  channelOeffnen,
  channelSchliessen,
  freischaltPause,
  istFreigeschaltet,
  freischaltText,
  nummerAusName,
  zaehlerCache,
};
