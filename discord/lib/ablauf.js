const { client } = require('./client');
const { config, gespeicherteKanaele, regelBereit, speichern } = require('./daten');
const { minutenVon, tagVon } = require('./helfer');
const { alleEntsperren, istAusnahme, sperreAufheben, sperren } = require('./rechte');
const { fruehCache, fruehposter } = require('./regel');
const { listeErstellen } = require('./listen');
const { abschlussNachholen, abschlussZeitPruefen } = require('./abschluss');

// Neue Woche: bisheriger Folge-Channel wird zum ersten Channel, neuer Channel wird Folge-Channel.
// Uhrzeit, Hinweis-Channel, Text und Optionen bleiben.
async function wocheWechseln(guild, cfg, neueId) {
  await alleEntsperren(guild, cfg);
  cfg.ersterId = cfg.folgeId;
  cfg.folgeId = neueId;
  cfg.vorbereitetAm = null;
  cfg.manuellFrei = {};
  fruehCache.delete(cfg.ersterId);
  speichern();
  await sperrenVorbereiten(guild, cfg); // Frühposter der alten Woche bis X Uhr sperren
}


// Vor Uhrzeit X: alle Frühposter (+ gespeicherte Namen) im Folge-Channel sperren – einmal pro Tag
async function sperrenVorbereiten(guild, cfg) {
  const jetzt = new Date();
  if (!cfg.sperren || minutenVon(jetzt) >= cfg.uhrzeitMinuten) return;
  const heute = tagVon(jetzt);
  try {
    const ids = new Set([
      ...(await fruehposter(guild, cfg)).keys(),
      ...Object.keys(gespeicherteKanaele.get(cfg.ersterId)?.user || {}),
    ]);
    let neu = 0;
    for (const id of ids) {
      if (await istAusnahme(guild, cfg, id)) continue;
      const vorher = cfg.gesperrt?.[id];
      await sperren(guild, cfg, id);
      if (!vorher && cfg.gesperrt?.[id]) neu++;
    }
    cfg.vorbereitetAm = heute;
    speichern();
    if (neu) console.log(`Tagessperre: ${neu} Frühposter bis ${cfg.uhrzeit} Uhr gesperrt (${guild.name}).`);
  } catch (e) {
    console.warn('Sperren vorbereiten fehlgeschlagen:', e.message);
  }
}

// Nach (Neu-)Start: alles frisch berechnen
async function sperrenNachholen() {
  for (const cfg of Object.values(config)) {
    fruehCache.delete(cfg.ersterId);
    cfg.vorbereitetAm = null;
  }
  // Erst "Bilder voll" nachholen, dann läuft die normale Prüfung (inkl. "Zeit um")
  for (const [gid, cfg] of Object.entries(config)) {
    const guild = client.guilds.cache.get(gid);
    if (!guild || !regelBereit(cfg)) continue;
    await abschlussNachholen(guild, cfg).catch((e) => console.warn('Abschluss nachholen fehlgeschlagen:', e.message));
  }
  await sperrenAufheben();
  for (const [gid, cfg] of Object.entries(config)) {
    const guild = client.guilds.cache.get(gid);
    if (!guild || !regelBereit(cfg)) continue;
    await listeErstellen(guild, cfg).catch((e) => console.warn('Liste schreiben fehlgeschlagen:', e.message));
    await listeErstellen(guild, cfg, 'folge').catch(() => {});
  }
}

// Läuft jede Minute:
//  - vor X Uhr (einmal pro Tag): Frühposter sperren
//  - ab X Uhr oder für Leute, die keine Frühposter mehr sind: Sperre aufheben
let taktLaeuft = false;
async function sperrenAufheben() {
  if (taktLaeuft) return; // vorige Runde noch nicht fertig (z. B. beim Start) -> diese Minute auslassen
  taktLaeuft = true;
  try {
    await minutenTakt();
  } finally {
    taktLaeuft = false;
  }
}

async function minutenTakt() {
  const jetzt = new Date();
  const heute = tagVon(jetzt);
  for (const [gid, cfg] of Object.entries(config)) {
    const guild = client.guilds.cache.get(gid);
    if (!guild || !regelBereit(cfg)) continue;
    await abschlussZeitPruefen(guild, cfg).catch((e) => console.warn('Abschluss-Prüfung fehlgeschlagen:', e.message));
    const vorbei = minutenVon(jetzt) >= cfg.uhrzeitMinuten;
    if (!vorbei && cfg.vorbereitetAm !== heute) await sperrenVorbereiten(guild, cfg);
    if (!cfg.gesperrt || Object.keys(cfg.gesperrt).length === 0) continue;
    let geaendert = false;
    for (const [userId, tag] of Object.entries(cfg.gesperrt)) {
      if (!vorbei && tag === heute) continue;
      await sperreAufheben(guild, cfg, userId);
      delete cfg.gesperrt[userId];
      geaendert = true;
    }
    if (geaendert) speichern();
  }
}

module.exports = {
  sperrenAufheben,
  sperrenNachholen,
  sperrenVorbereiten,
  wocheWechseln,
};
