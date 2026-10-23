const { hashVonUrl } = require('./bildvergleich');

// ---------------------------------------------------------------------------
// Kleine Helfer: Zeit, Bilder, Nachrichten lesen, Konstanten
// ---------------------------------------------------------------------------
const ZEITZONE = process.env.ZEITZONE || 'Europe/Berlin';

// ---------------------------------------------------------------------------
// Zeit-Helfer (immer in der eingestellten Zeitzone)
// ---------------------------------------------------------------------------
function minutenVon(datum) {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(datum);
  const h = Number(teile.find((t) => t.type === 'hour').value);
  const m = Number(teile.find((t) => t.type === 'minute').value);
  return h * 60 + m;
}
const tagVon = (datum) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZEITZONE }).format(datum); // YYYY-MM-DD
function parseUhrzeit(text) {
  const m = /^([01]?\d|2[0-3])[:.]([0-5]\d)$/.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
const formatUhrzeit = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const datumVon = (d) => tagVon(d).split('-').reverse().join('.');
const WOCHENTAGE = { 1: 'Montag', 2: 'Dienstag', 3: 'Mittwoch', 4: 'Donnerstag', 5: 'Freitag', 6: 'Samstag', 0: 'Sonntag', taeglich: 'jeden Tag' };
const WT_KURZ = { Sun: '0', Mon: '1', Tue: '2', Wed: '3', Thu: '4', Fri: '5', Sat: '6' };
const wochentagVon = (d) => WT_KURZ[new Intl.DateTimeFormat('en-US', { timeZone: ZEITZONE, weekday: 'short' }).format(d)];

// ---------------------------------------------------------------------------
// Bild-Helfer
// ---------------------------------------------------------------------------
const hashCache = new Map(); // attachmentId -> BigInt

function istBild(att) {
  if (att.contentType) return att.contentType.startsWith('image/');
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(att.name || '');
}
const bilderVon = (msg) => [...msg.attachments.values()].filter(istBild);

async function hashVon(att) {
  if (hashCache.has(att.id)) return hashCache.get(att.id);
  const hash = await hashVonUrl(att.proxyURL || att.url);
  if (hashCache.size > 5000) hashCache.clear();
  hashCache.set(att.id, hash);
  return hash;
}

// ---------------------------------------------------------------------------
// Alle Nachrichten eines Channels (neueste zuerst, max. MAX_CHANNEL) – mit Zwischenspeicher:
//  - Beim ersten Mal wird der ganze Channel gelesen.
//  - Danach kommen neue/gelöschte/bearbeitete Nachrichten über die Discord-Ereignisse rein,
//    und höchstens alle 30 Sekunden holt der Bot mit EINER Anfrage nach, was evtl. fehlt.
// ---------------------------------------------------------------------------
const MAX_CHANNEL = 5000;
const NACHLADEN_NACH = 30 * 1000;
const nachrichtenCache = new Map(); // channelId -> { nachrichten: Map(id -> msg), neuesteId, sync }
const laufendeLadungen = new Map(); // channelId -> Promise (damit nicht zweimal parallel geladen wird)
const groesser = (a, b) => (BigInt(a) > BigInt(b) ? a : b);

async function vollLaden(channel) {
  const nachrichten = new Map();
  let vor;
  while (nachrichten.size < MAX_CHANNEL) {
    const batch = await channel.messages.fetch({ limit: 100, ...(vor ? { before: vor } : {}) });
    if (batch.size === 0) break;
    for (const m of batch.values()) nachrichten.set(m.id, m);
    if (batch.size < 100) break;
    vor = batch.last().id;
  }
  const neuesteId = [...nachrichten.keys()].reduce(groesser, '0');
  nachrichtenCache.set(channel.id, { nachrichten, neuesteId, sync: Date.now() });
}

async function nachladen(channel, c) {
  let nach = c.neuesteId;
  for (let i = 0; i < 50; i++) {
    const batch = await channel.messages.fetch({ limit: 100, after: nach });
    if (batch.size === 0) break;
    for (const m of batch.values()) c.nachrichten.set(m.id, m);
    nach = [...batch.keys()].reduce(groesser, nach);
    if (batch.size < 100) break;
  }
  c.neuesteId = nach;
  c.sync = Date.now();
}

async function alleNachrichten(channel) {
  let c = nachrichtenCache.get(channel.id);
  if (!c) {
    if (!laufendeLadungen.has(channel.id)) {
      laufendeLadungen.set(channel.id, vollLaden(channel).finally(() => laufendeLadungen.delete(channel.id)));
    }
    await laufendeLadungen.get(channel.id);
    c = nachrichtenCache.get(channel.id);
  } else if (Date.now() - c.sync > NACHLADEN_NACH) {
    await nachladen(channel, c);
  }
  return [...c.nachrichten.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
}

// Ereignisse halten den Zwischenspeicher aktuell (nur für Channels, die schon geladen wurden)
function cacheNeu(msg) {
  const c = nachrichtenCache.get(msg.channelId);
  if (!c) return;
  c.nachrichten.set(msg.id, msg);
  c.neuesteId = groesser(c.neuesteId, msg.id);
}
function cacheWeg(channelId, ids) {
  const c = nachrichtenCache.get(channelId);
  if (c) for (const id of ids) c.nachrichten.delete(id);
}
async function cacheGeaendert(msg) {
  const c = nachrichtenCache.get(msg.channelId);
  if (!c) return;
  const voll = msg.partial ? await msg.fetch().catch(() => null) : msg;
  if (voll) c.nachrichten.set(voll.id, voll);
}

// Embeds: so viele Personen pro Seite

const dateiName = (text) => text.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'channel';

const LINK_REGEX = /^https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/\d+\/\d+(?:\/\d+)?\/?$/;

// Alle Antworten sind für jeden sichtbar. Pings sind über allowedMentions am Client abgeschaltet.
const privat = (content) => ({ content });

module.exports = {
  LINK_REGEX,
  MAX_CHANNEL,
  WOCHENTAGE,
  WT_KURZ,
  ZEITZONE,
  alleNachrichten,
  bilderVon,
  cacheGeaendert,
  cacheNeu,
  cacheWeg,
  dateiName,
  datumVon,
  formatUhrzeit,
  hashCache,
  hashVon,
  istBild,
  minutenVon,
  nachrichtenCache,
  parseUhrzeit,
  privat,
  tagVon,
  wochentagVon,
};
