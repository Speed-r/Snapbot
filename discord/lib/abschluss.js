const { client } = require('./client');
const { STANDARD_VOLL, STANDARD_ZEIT, speichern } = require('./daten');
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

  const ch = await guild.channels.fetch(cfg.folgeId).catch(() => null);
  if (!ch?.permissionOverwrites) return;
  const rolleId = cfg.abschluss.rolleId || guild.id; // ohne Rolle: @everyone
  try {
    // Bot selbst darf weiter schreiben (für den Abschlusstext)
    await ch.permissionOverwrites.edit(client.user.id, { SendMessages: true }, { reason: 'Abschluss: Bot darf posten' });
    await ch.permissionOverwrites.edit(rolleId, { SendMessages: false }, { reason: `Abschluss: ${grund === 'voll' ? 'Bilder voll' : 'Zeit um'}` });
  } catch (e) {
    console.warn(`Channel schließen fehlgeschlagen (fehlt "Berechtigungen verwalten"?): ${e.message}`);
  }
  if (cfg.abschluss.meldung !== false) { // Abschluss-Meldung abschaltbar
    await ch.send({ content: abschlussText(cfg, grund, anzahl), allowedMentions: { parse: [] } })
      .catch((e) => console.warn('Abschlusstext senden fehlgeschlagen:', e.message));
  }
  console.log(`Abschluss: #${ch.name} geschlossen (${grund === 'voll' ? `${anzahl} Bilder` : 'Zeit um'}).`);
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
  channelOeffnen,
  channelSchliessen,
  zaehlerCache,
};
