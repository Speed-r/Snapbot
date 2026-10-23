const { hamming } = require('./bildvergleich');
const { STANDARD_DOPPELT, STANDARD_TEXT, istGespeichert } = require('./daten');
const { alleNachrichten, bilderVon, datumVon, formatUhrzeit, hashVon, minutenVon, tagVon } = require('./helfer');

// ---------------------------------------------------------------------------
// Frühposter: Wer hat im ERSTEN Channel vor Uhrzeit X gepostet – egal an welchem Tag?
// Diese Personen dürfen im Folge-Channel erst ab Uhrzeit X posten.
// Wer im ersten Channel nach X oder gar nicht gepostet hat, darf im Folge-Channel sofort.
// ---------------------------------------------------------------------------
const fruehCache = new Map(); // channelId -> { zeit, personen: Map(userId -> {...}) }

async function fruehposter(guild, cfg, neuLaden = false) {
  const c = fruehCache.get(cfg.ersterId);
  if (c && !neuLaden && Date.now() - c.zeit < 10 * 60 * 1000) return c.personen;
  const erster = await guild.channels.fetch(cfg.ersterId).catch(() => null);
  if (!erster?.isTextBased()) return new Map();

  const nachrichten = (await alleNachrichten(erster))
    .filter((m) => !m.author.bot && minutenVon(m.createdAt) < cfg.uhrzeitMinuten)
    .filter((m) => !cfg.nurBilder || bilderVon(m).length > 0)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const personen = new Map();
  for (const m of nachrichten) {
    let p = personen.get(m.author.id);
    if (!p) {
      p = {
        id: m.author.id,
        name: m.author.globalName || m.author.username,
        user: m.author.username,
        datum: datumVon(m.createdAt),
        zeit: formatUhrzeit(minutenVon(m.createdAt)),
        bilder: [],
      };
      personen.set(m.author.id, p);
    }
    for (const att of bilderVon(m)) p.bilder.push({ id: att.id, url: att.url, proxyURL: att.proxyURL });
  }
  fruehCache.set(cfg.ersterId, { zeit: Date.now(), personen });
  return personen;
}


// Darf die Person gerade (vor Uhrzeit X) im Folge-Channel NICHT posten?
async function verstoesst(msg, cfg) {
  if (cfg.manuellFrei?.[msg.author.id] === tagVon(msg.createdAt)) return false; // heute von Hand entsperrt
  if (istGespeichert(cfg, msg.author.id)) return true; // steht in der gespeicherten Liste
  const p = (await fruehposter(msg.guild, cfg)).get(msg.author.id);
  if (!p) return false; // im ersten Channel nach X oder gar nicht gepostet -> darf sofort
  if (!cfg.bildvergleich) return true;

  // Optional: nur melden, wenn es dasselbe Bild ist
  const originale = [];
  for (const att of p.bilder) {
    try { originale.push(await hashVon(att)); } catch { /* Bild nicht lesbar */ }
  }
  for (const att of bilderVon(msg)) {
    let h;
    try { h = await hashVon(att); } catch { continue; }
    if (originale.some((o) => hamming(o, h) <= cfg.toleranz)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hinweis
// ---------------------------------------------------------------------------
function hinweisText(cfg, userId) {
  return (cfg.text || STANDARD_TEXT)
    .replaceAll('{user}', `<@${userId}>`)
    .replaceAll('{uhrzeit}', cfg.uhrzeit)
    .replaceAll('{regelchannel}', '{regel}') // alter Platzhalter funktioniert weiter
    .replaceAll('{regel}', cfg.regelLink || (cfg.regelId ? `<#${cfg.regelId}>` : 'in den Regeln'));
}

const letzteHinweise = new Map(); // guildId:userId -> Zeitstempel (verhindert Spam)

async function hinweisSenden(guild, cfg, userId) {
  const schluessel = `${guild.id}:${userId}`;
  if (Date.now() - (letzteHinweise.get(schluessel) || 0) < 5 * 60 * 1000) return; // max. 1x pro 5 Min
  letzteHinweise.set(schluessel, Date.now());

  const ziel = await guild.channels.fetch(cfg.hinweisId).catch(() => null);
  if (!ziel?.isTextBased()) {
    console.warn('Hinweis-Channel nicht gefunden oder kein Text-Channel.');
    return;
  }
  await ziel.send({ content: hinweisText(cfg, userId), allowedMentions: { users: [userId] } });
}

// ---------------------------------------------------------------------------
// Nur EIN Beitrag pro Person im Folge-Channel (Ausnahme-Rollen ausgenommen)
// Gezählt wird wie überall: mit "Nur Bilder" nur Posts mit Bild, sonst jeder Post.
// ---------------------------------------------------------------------------
const zaehltAlsBeitrag = (m, cfg) => !m.author.bot && (!cfg.nurBilder || bilderVon(m).length > 0);

// Hat die Person im Folge-Channel schon einen ÄLTEREN Beitrag, der noch steht?
async function doppelterBeitrag(msg, cfg) {
  const eigene = BigInt(msg.id);
  return (await alleNachrichten(msg.channel)).some((m) =>
    m.author.id === msg.author.id && m.id !== msg.id && BigInt(m.id) < eigene && zaehltAlsBeitrag(m, cfg));
}

function doppeltText(cfg, userId) {
  return (cfg.textDoppelt || STANDARD_DOPPELT).replaceAll('{user}', `<@${userId}>`);
}

async function doppeltHinweisSenden(guild, cfg, userId) {
  const schluessel = `${guild.id}:doppelt:${userId}`;
  if (Date.now() - (letzteHinweise.get(schluessel) || 0) < 5 * 60 * 1000) return; // max. 1x pro 5 Min
  letzteHinweise.set(schluessel, Date.now());
  const ziel = await guild.channels.fetch(cfg.hinweisId).catch(() => null);
  if (!ziel?.isTextBased()) return;
  await ziel.send({ content: doppeltText(cfg, userId), allowedMentions: { users: [userId] } });
}

module.exports = {
  doppelterBeitrag,
  doppeltHinweisSenden,
  doppeltText,
  fruehCache,
  fruehposter,
  hinweisSenden,
  hinweisText,
  letzteHinweise,
  verstoesst,
  zaehltAlsBeitrag,
};
