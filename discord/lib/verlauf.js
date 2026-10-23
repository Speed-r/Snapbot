const fs = require('fs');
const path = require('path');
const { bilderVon, dateiName, datumVon, formatUhrzeit, minutenVon, tagVon } = require('./helfer');
const { LISTEN_ORDNER } = require('./listen');

// ---------------------------------------------------------------------------
// Verlauf: alle User eines Channels – auch aus der Zeit, bevor der Bot lief
// (Discord speichert den kompletten Nachrichtenverlauf, der Bot liest ihn rückwärts)
// ---------------------------------------------------------------------------
const MAX_VERLAUF = 20000; // Sicherheitsgrenze: max. Nachrichten pro Abfrage

async function verlaufLesen(channel, abTimestamp, fortschritt) {
  const alle = [];
  let vor;
  let ende = false;
  while (!ende && alle.length < MAX_VERLAUF) {
    const batch = await channel.messages.fetch({ limit: 100, ...(vor ? { before: vor } : {}) });
    if (batch.size === 0) break;
    for (const m of batch.values()) {
      if (abTimestamp && m.createdTimestamp < abTimestamp) { ende = true; break; }
      alle.push(m);
    }
    if (batch.size < 100) break;
    vor = batch.last().id;
    if (alle.length % 2000 === 0) await fortschritt?.(alle.length).catch(() => {});
  }
  return { nachrichten: alle, abgeschnitten: alle.length >= MAX_VERLAUF };
}

function verlaufAuswerten(nachrichten, { nurBilder, vorMinuten }) {
  const user = new Map();
  const proTag = new Map(); // YYYY-MM-DD -> Map(userId -> erste Uhrzeit)
  for (const m of nachrichten) {
    if (m.author.bot) continue;
    if (nurBilder && bilderVon(m).length === 0) continue;
    if (vorMinuten != null && minutenVon(m.createdAt) >= vorMinuten) continue;

    const u = user.get(m.author.id) || {
      id: m.author.id,
      name: m.author.globalName || m.author.username,
      user: m.author.username,
      anzahl: 0,
      erster: m.createdAt,
      letzter: m.createdAt,
    };
    u.anzahl++;
    if (m.createdAt < u.erster) u.erster = m.createdAt;
    if (m.createdAt > u.letzter) u.letzter = m.createdAt;
    user.set(m.author.id, u);

    const tag = tagVon(m.createdAt);
    if (!proTag.has(tag)) proTag.set(tag, new Map());
    const t = proTag.get(tag);
    const zeit = minutenVon(m.createdAt);
    if (!t.has(m.author.id) || zeit < t.get(m.author.id).zeit) t.set(m.author.id, { zeit, name: u.name });
  }
  const liste = [...user.values()].sort((a, b) => b.anzahl - a.anzahl || a.erster - b.erster);
  return { liste, proTag };
}

function verlaufDatei(channel, auswertung, info) {
  const { liste, proTag } = auswertung;
  const zeilen = [
    `Verlauf: #${channel.name}`,
    `Zeitraum: ${info.zeitraum}`,
    info.filter ? `Filter: ${info.filter}` : null,
    `Gelesene Nachrichten: ${info.gelesen}${info.abgeschnitten ? ` (Grenze von ${MAX_VERLAUF} erreicht – ältere fehlen)` : ''}`,
    `User: ${liste.length}`,
    '',
    '=== Alle User ===',
    'Posts  Erster Post        Letzter Post       Name',
    ...liste.map((u) =>
      `${String(u.anzahl).padStart(5)}  ${datumVon(u.erster)} ${formatUhrzeit(minutenVon(u.erster))}   ` +
      `${datumVon(u.letzter)} ${formatUhrzeit(minutenVon(u.letzter))}   ${u.name} (@${u.user})`),
    '',
    '=== Pro Tag (erste Uhrzeit je User) ===',
  ].filter((z) => z !== null);

  for (const tag of [...proTag.keys()].sort().reverse()) {
    const eintraege = [...proTag.get(tag).values()].sort((a, b) => a.zeit - b.zeit);
    zeilen.push('', `${tag.split('-').reverse().join('.')} – ${eintraege.length} User`);
    for (const e of eintraege) zeilen.push(`  ${formatUhrzeit(e.zeit)}  ${e.name}`);
  }

  fs.mkdirSync(LISTEN_ORDNER, { recursive: true });
  const pfad = path.join(LISTEN_ORDNER, `verlauf_${tagVon(new Date())}_${dateiName(channel.name)}.txt`);
  fs.writeFileSync(pfad, zeilen.join('\r\n'), 'utf8');
  return pfad;
}

module.exports = {
  MAX_VERLAUF,
  verlaufAuswerten,
  verlaufDatei,
  verlaufLesen,
};
