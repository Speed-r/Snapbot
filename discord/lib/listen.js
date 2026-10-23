const fs = require('fs');
const path = require('path');
const { gespeicherteKanaele, istGespeichert, speichern } = require('./daten');
const { alleNachrichten, bilderVon, dateiName, datumVon, formatUhrzeit, minutenVon } = require('./helfer');
const { sperreAufheben } = require('./rechte');
const { fruehposter } = require('./regel');

// ---------------------------------------------------------------------------
// Listen: erster Channel = alle Frühposter (vor X, ganze Woche) | Folge-Channel = alle Posts
// Textdatei pro Channel im Ordner listen/
// ---------------------------------------------------------------------------
const LISTEN_ORDNER = path.join(__dirname, '..', '..', 'listen');


async function listeErstellen(guild, cfg, welcher = 'erster') {
  const istFolge = welcher === 'folge';
  const kanal = await guild.channels.fetch(istFolge ? cfg.folgeId : cfg.ersterId).catch(() => null);
  if (!kanal?.isTextBased()) return null;

  let roh;
  if (istFolge) {
    // Folge-Channel: pro Person der erste Post
    roh = new Map();
    const nachrichten = (await alleNachrichten(kanal))
      .filter((m) => !m.author.bot && (!cfg.nurBilder || bilderVon(m).length > 0))
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    for (const m of nachrichten) {
      if (roh.has(m.author.id)) continue;
      roh.set(m.author.id, {
        id: m.author.id,
        name: m.author.globalName || m.author.username,
        user: m.author.username,
        datum: datumVon(m.createdAt),
        zeit: formatUhrzeit(minutenVon(m.createdAt)),
      });
    }
  } else {
    roh = await fruehposter(guild, cfg, true);
  }

  // Alle Nutzer (die Ausnahme-Rollen gelten nur für Sperre und Hinweis, nicht für die Listen)
  const personen = new Map(roh);

  // Erster Channel: zusätzlich alle gespeicherten Namen aus der Datei dieses Channels
  const postAnzahl = personen.size;
  if (!istFolge) {
    const datei = gespeicherteKanaele.get(kanal.id);
    for (const [id, u] of Object.entries(datei?.user || {})) {
      if (personen.has(id)) continue;
      personen.set(id, {
        id,
        gespeichert: true,
        letzter: u.letzter ? datumVon(new Date(u.letzter)) : null,
        name: u.name || id,
        user: u.user || id,
      });
    }
  }
  const gespeichertAnzahl = personen.size - postAnzahl;
  const jetzt = new Date();

  const zeilen = [
    `${istFolge ? 'Folge-Channel' : 'Erster Channel'}: #${kanal.name}`,
    istFolge
      ? 'Alle Personen, die hier gepostet haben (erster Post)'
      : `Frühposter: vor ${cfg.uhrzeit} Uhr gepostet – dürfen im Folge-Channel erst ab ${cfg.uhrzeit} Uhr posten`,
    `Anzahl: ${personen.size}` + (gespeichertAnzahl ? ` (${postAnzahl} aus Posts, ${gespeichertAnzahl} aus gespeicherter Datei)` : ''),
    '',
    ...[...personen.values()].map((p) => p.gespeichert
      ? `gespeichert       ${p.name} (@${p.user})${p.letzter ? ` – zuletzt ${p.letzter}` : ''}`
      : `${p.datum} ${p.zeit}  ${p.name} (@${p.user})`),
    '',
    `Stand: ${datumVon(jetzt)} ${formatUhrzeit(minutenVon(jetzt))} Uhr`,
  ];

  fs.mkdirSync(LISTEN_ORDNER, { recursive: true });
  const pfad = path.join(LISTEN_ORDNER, `liste_${dateiName(kanal.name)}.txt`);
  fs.writeFileSync(pfad, zeilen.join('\r\n'), 'utf8');
  return {
    pfad, personen: [...personen.values()], postAnzahl, gespeichertAnzahl,
    channelId: kanal.id, channelName: kanal.name, datum: datumVon(jetzt), uhrzeit: cfg.uhrzeit, istFolge,
  };
}

const listenTimer = new Map();
function listeSpaeterAktualisieren(guild, cfg, verzoegerung = 10 * 1000, welcher = 'erster') {
  const schluessel = `${guild.id}:${welcher}`;
  clearTimeout(listenTimer.get(schluessel));
  listenTimer.set(schluessel, setTimeout(() => {
    listenTimer.delete(schluessel);
    const arbeit = welcher === 'folge' ? listeErstellen(guild, cfg, 'folge') : listeUndSperrenAbgleichen(guild, cfg);
    arbeit.catch((e) => console.warn('Liste schreiben fehlgeschlagen:', e.message));
  }, verzoegerung));
}

// Liste neu schreiben. Wer gesperrt ist, aber keinen Früh-Post mehr im ersten Channel hat
// (z. B. Bild gelöscht, um es zu bearbeiten), wird wieder freigegeben.
async function listeUndSperrenAbgleichen(guild, cfg) {
  const liste = await listeErstellen(guild, cfg);
  if (!liste || !cfg.gesperrt) return;
  const nochDa = new Set(liste.personen.map((p) => p.id));
  let geaendert = false;
  for (const userId of Object.keys(cfg.gesperrt)) {
    if (nochDa.has(userId) || istGespeichert(cfg, userId)) continue;
    await sperreAufheben(guild, cfg, userId);
    delete cfg.gesperrt[userId];
    geaendert = true;
    console.log(`Freigegeben: ${userId} hat seinen Post im ersten Channel gelöscht.`);
  }
  if (geaendert) speichern();
}

module.exports = {
  LISTEN_ORDNER,
  listeErstellen,
  listeSpaeterAktualisieren,
  listeUndSperrenAbgleichen,
  listenTimer,
};
