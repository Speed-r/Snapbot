const fs = require('fs');
const path = require('path');

const CONFIG_ORDNER = path.join(__dirname, '..', '..', 'config');

// ---------------------------------------------------------------------------
// Einstellungen (pro Server in config.json)
// ---------------------------------------------------------------------------
const CONFIG_PFAD = path.join(CONFIG_ORDNER, 'config.json');

const STANDARD_TEXT =
  '{user}\n\nBitte beachte die Snap-Sonderchannel-Einstellungsregel.\n' +
  'Kannst es dann gern ab {uhrzeit} Uhr einstellen 🫶\n' +
  'Lies gern nochmal nach {regel}';

const STANDARD_VOLL =
  '📸 **Der Channel ist voll!**\n{anzahl} Leute haben ihr Bild gepostet – der Channel ist jetzt geschlossen.\nDanke an alle! 🫶';
const STANDARD_DOPPELT =
  '{user}\n\nIm Folge-Channel darf jeder nur **einen** Beitrag posten – dein weiterer Beitrag wurde entfernt. 🫶';
const STANDARD_ZEIT =
  '⏰ **Die Zeit ist um!**\nDer Channel wurde um {uhrzeit} Uhr geschlossen – {anzahl} Leute haben mitgemacht.\nDanke an alle! 🫶';

const config = {}; // Einstellungen pro Server (guildId -> {...})
try {
  if (fs.existsSync(CONFIG_PFAD)) Object.assign(config, JSON.parse(fs.readFileSync(CONFIG_PFAD, 'utf8')));
} catch (e) {
  console.error('config.json konnte nicht gelesen werden:', e.message);
}
// ---------------------------------------------------------------------------
// Gespeicherte Namen (💾 unter /verlauf und /liste) – eine Datei PRO CHANNEL in config/gespeichert/
// Ist dieser Channel der erste Channel, zählen die Namen für die Regel und stehen auf /liste.
// ---------------------------------------------------------------------------
const GESPEICHERT_ORDNER = path.join(CONFIG_ORDNER, 'gespeichert');
const gespeicherteKanaele = new Map(); // channelId -> { guildId, channelId, channelName, quellen, user }
const sichererName = (text) => String(text).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'channel';

function kanalDateiPfad(daten) {
  return path.join(GESPEICHERT_ORDNER, `${sichererName(daten.channelName)}_${daten.channelId}.json`);
}

function kanalSichern(daten) {
  fs.mkdirSync(GESPEICHERT_ORDNER, { recursive: true });
  // alte Datei desselben Channels (z. B. nach Umbenennen) entfernen
  for (const f of fs.readdirSync(GESPEICHERT_ORDNER)) {
    if (f.endsWith(`_${daten.channelId}.json`) && path.join(GESPEICHERT_ORDNER, f) !== kanalDateiPfad(daten)) {
      fs.rmSync(path.join(GESPEICHERT_ORDNER, f), { force: true });
    }
  }
  const ziel = kanalDateiPfad(daten);
  fs.writeFileSync(ziel + '.tmp', JSON.stringify(daten, null, 2));
  fs.renameSync(ziel + '.tmp', ziel);
}

function kanalLoeschen(channelId) {
  gespeicherteKanaele.delete(channelId);
  if (!fs.existsSync(GESPEICHERT_ORDNER)) return;
  for (const f of fs.readdirSync(GESPEICHERT_ORDNER)) {
    if (f.endsWith(`_${channelId}.json`)) fs.rmSync(path.join(GESPEICHERT_ORDNER, f), { force: true });
  }
}

function kanalHolen(guildId, channelId, channelName) {
  let d = gespeicherteKanaele.get(channelId);
  if (!d) {
    d = { guildId, channelId, channelName: channelName || channelId, quellen: [], user: {} };
    gespeicherteKanaele.set(channelId, d);
  }
  if (channelName) d.channelName = channelName;
  return d;
}

// Beim Start laden
try {
  if (fs.existsSync(GESPEICHERT_ORDNER)) {
    for (const f of fs.readdirSync(GESPEICHERT_ORDNER).filter((x) => x.endsWith('.json'))) {
      const d = JSON.parse(fs.readFileSync(path.join(GESPEICHERT_ORDNER, f), 'utf8'));
      if (d.channelId) gespeicherteKanaele.set(d.channelId, d);
    }
  }
} catch (e) {
  console.error('Gespeicherte Namen konnten nicht geladen werden:', e.message);
}

// Zählt für die Regel: steht in der Datei des AKTUELLEN ersten Channels
const istGespeichert = (cfg, userId) => Boolean(gespeicherteKanaele.get(cfg?.ersterId)?.user?.[userId]);

function speichern() {
  // erst in temporäre Datei schreiben, dann umbenennen -> config.json kann nie halb geschrieben sein
  fs.mkdirSync(CONFIG_ORDNER, { recursive: true });
  const tmp = CONFIG_PFAD + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2));
  fs.renameSync(tmp, CONFIG_PFAD);
}

// Ist die Regel fertig eingerichtet? (Channels + Uhrzeit gesetzt) – vorher passiert nichts automatisch
const regelBereit = (cfg) => Boolean(cfg && cfg.ersterId && cfg.folgeId && cfg.hinweisId && cfg.uhrzeitMinuten != null);

module.exports = {
  regelBereit,
  CONFIG_ORDNER,
  CONFIG_PFAD,
  GESPEICHERT_ORDNER,
  STANDARD_TEXT,
  STANDARD_VOLL,
  STANDARD_DOPPELT,
  STANDARD_ZEIT,
  config,
  gespeicherteKanaele,
  istGespeichert,
  kanalDateiPfad,
  kanalHolen,
  kanalLoeschen,
  kanalSichern,
  sichererName,
  speichern,
};
