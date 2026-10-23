const { PermissionFlagsBits } = require('discord.js');
const { client } = require('./client');
const { speichern } = require('./daten');
const { tagVon } = require('./helfer');

// ---------------------------------------------------------------------------
// Ausnahme-Rollen: Mitglieder mit einer dieser Rollen ignoriert die Regel komplett
// ---------------------------------------------------------------------------
const rollenCache = new Map(); // guildId:userId -> { rollen, zeit }

async function istAusnahme(guild, cfg, userId, member = null) {
  const ausnahmen = cfg.ausnahmeRollen || [];
  if (ausnahmen.length === 0) return false;
  let rollen;
  if (member?.roles?.cache) {
    rollen = [...member.roles.cache.keys()];
  } else {
    const key = `${guild.id}:${userId}`;
    const c = rollenCache.get(key);
    if (c && Date.now() - c.zeit < 2 * 60 * 1000) {
      rollen = c.rollen;
    } else {
      // Zuerst der Speicher von discord.js (wird bei jeder Nachricht der Person aktualisiert), sonst bei Discord fragen
      const m = guild.members.cache?.get(userId) ?? await guild.members.fetch({ user: userId, force: true }).catch(() => null);
      rollen = m ? [...m.roles.cache.keys()] : [];
      rollenCache.set(key, { rollen, zeit: Date.now() });
      if (rollenCache.size > 5000) rollenCache.clear();
    }
  }
  return ausnahmen.some((r) => rollen.includes(r));
}


// ---------------------------------------------------------------------------
// Sperre über eine WARTE-ROLLE:
//  - Im Folge-Channel gibt es genau EINEN Rechte-Eintrag: Warte-Rolle darf nicht schreiben.
//  - Sperren = Rolle geben, Entsperren = Rolle wegnehmen.
// Gesperrte Nutzer stehen in config[guild].gesperrt = { userId: 'YYYY-MM-DD' }.
// ---------------------------------------------------------------------------
const WARTE_ROLLEN_NAME = '⏳ Wartet';
const SENDEN = PermissionFlagsBits.SendMessages;
const rolleImChannel = new Map(); // guildId -> folgeId, für den der Eintrag schon gesetzt ist
const laufendeFreigabe = new Map(); // guildId -> Promise, solange "Alle entsperren" noch Rollen abnimmt

// Rechte-Eintrag einer Rolle für "Nachrichten senden" in einem Channel zurücknehmen
async function overwriteEntfernen(guild, channelId, id) {
  const ch = await guild.channels.fetch(channelId).catch(() => null);
  if (!ch?.permissionOverwrites?.cache.has(id)) return;
  try {
    // Nur "Nachrichten senden" zurücknehmen, andere Rechte bleiben unberührt
    const neu = await ch.permissionOverwrites.edit(id, { SendMessages: null }, { reason: 'Einstellungsregel: frei' });
    const ow = neu.permissionOverwrites.cache.get(id);
    if (ow && ow.allow.bitfield === 0n && ow.deny.bitfield === 0n) await ow.delete();
  } catch (e) {
    console.warn(`Rechte zurücksetzen fehlgeschlagen: ${e.message}`);
  }
}

// Warte-Rolle holen – oder automatisch anlegen, falls es noch keine gibt bzw. sie gelöscht wurde
async function warteRolle(guild, cfg) {
  let rolle = cfg.warteRolleId ? await guild.roles.fetch(cfg.warteRolleId).catch(() => null) : null;
  if (!rolle) {
    rolle = await guild.roles.create({
      name: WARTE_ROLLEN_NAME,
      permissions: [],
      mentionable: false,
      reason: 'Snap-Bot: Warte-Rolle für die Einstellungsregel',
    });
    cfg.warteRolleId = rolle.id;
    rolleImChannel.delete(guild.id);
    speichern();
    console.log(`Warte-Rolle "${rolle.name}" angelegt.`);
  }
  return rolle;
}

// Im Folge-Channel: Warte-Rolle darf nicht schreiben (nur ein Eintrag, egal wie viele Leute warten)
async function warteRolleImFolgeChannel(guild, cfg, rolle) {
  if (rolleImChannel.get(guild.id) === cfg.folgeId) return;
  // Läuft gerade "Alle entsperren"? Erst fertig werden lassen, sonst wären noch nicht Bearbeitete wieder gesperrt
  await laufendeFreigabe.get(guild.id);
  const folge = await guild.channels.fetch(cfg.folgeId).catch(() => null);
  if (!folge?.permissionOverwrites) return;
  const ow = folge.permissionOverwrites.cache.get(rolle.id);
  if (!ow || !(BigInt(ow.deny.bitfield) & SENDEN)) {
    await folge.permissionOverwrites.edit(rolle.id, { SendMessages: false }, { reason: `Einstellungsregel bis ${cfg.uhrzeit} Uhr` });
  }
  rolleImChannel.set(guild.id, cfg.folgeId);
}

async function sperren(guild, cfg, userId) {
  cfg.gesperrt ??= {};
  const heute = tagVon(new Date());
  if (cfg.manuellFrei?.[userId] === heute) return; // heute per /person entsperren freigegeben
  if (cfg.gesperrt[userId]) { // schon gesperrt -> nur für heute verlängern
    cfg.gesperrt[userId] = heute;
    return;
  }
  try {
    const rolle = await warteRolle(guild, cfg);
    await warteRolleImFolgeChannel(guild, cfg, rolle);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return; // nicht (mehr) auf dem Server
    await member.roles.add(rolle, `Einstellungsregel bis ${cfg.uhrzeit} Uhr`);
    cfg.gesperrt[userId] = heute;
    speichern(); // (Zusammenfassung loggt sperrenVorbereiten)
  } catch (e) {
    console.warn(`Sperren fehlgeschlagen (fehlt "Rollen verwalten" oder steht die Bot-Rolle unter der Warte-Rolle?): ${e.message}`);
  }
}

// Eine Person freigeben: Warte-Rolle wegnehmen
async function sperreAufheben(guild, cfg, userId) {
  if (!cfg.warteRolleId) return;
  const member = guild.members.cache?.get(userId) ?? await guild.members.fetch(userId).catch(() => null);
  if (member?.roles?.cache?.has(cfg.warteRolleId)) {
    await member.roles.remove(cfg.warteRolleId, 'Einstellungsregel: frei')
      .catch((e) => console.warn(`Rolle entfernen fehlgeschlagen: ${e.message}`));
  }
}

// Alle freigeben und den Rollen-Eintrag aus dem aktuellen Folge-Channel entfernen (vor einem Channel-Wechsel)
async function alleEntsperren(guild, cfg) {
  for (const id of Object.keys(cfg.gesperrt || {})) await sperreAufheben(guild, cfg, id);
  cfg.gesperrt = {};
  if (cfg.warteRolleId) await overwriteEntfernen(guild, cfg.folgeId, cfg.warteRolleId);
  rolleImChannel.delete(guild.id);
}

// Alle, die gerade warten müssen: aus der Liste der Gesperrten und alle, die die Warte-Rolle tragen
function gesperrteIds(guild, cfg) {
  const ids = new Set(Object.keys(cfg.gesperrt || {}));
  const rolle = cfg.warteRolleId && guild.roles?.cache?.get?.(cfg.warteRolleId);
  for (const id of rolle?.members?.keys?.() || []) ids.add(id);
  // Wer heute schon von Hand freigegeben wurde, zählt nicht (die Rolle wird evtl. noch im Hintergrund abgenommen)
  const heute = tagVon(new Date());
  return [...ids].filter((id) => cfg.manuellFrei?.[id] !== heute);
}

// Alle auf einmal freigeben – wirkt SOFORT:
//  1. Der Rechte-Eintrag der Warte-Rolle im Folge-Channel wird entfernt (1 Anfrage) -> alle dürfen sofort schreiben.
//  2. Danach nimmt der Bot die Rolle im Hintergrund ab. Das dauert bei vielen Leuten etwas,
//     weil Discord Rollen-Änderungen bremst – stört aber niemanden mehr.
async function alleSofortFreigeben(guild, cfg, ids) {
  if (cfg.warteRolleId) await overwriteEntfernen(guild, cfg.folgeId, cfg.warteRolleId);
  rolleImChannel.delete(guild.id);
  const kopie = { ...cfg };
  const arbeit = (async () => {
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map((id) => sperreAufheben(guild, kopie, id)));
    }
  })()
    .catch((e) => console.warn(`Alle entsperren: ${e.message}`))
    .finally(() => { if (laufendeFreigabe.get(guild.id) === arbeit) laufendeFreigabe.delete(guild.id); });
  laufendeFreigabe.set(guild.id, arbeit);
  return { fertig: arbeit }; // nicht abwarten: die Sperre ist schon aufgehoben
}

// Von Hand freigeben (/person): Sperre aufheben und heute nicht automatisch neu sperren
async function vonHandEntsperren(guild, cfg, userId) {
  await sperreAufheben(guild, cfg, userId);
  delete cfg.gesperrt?.[userId];
  (cfg.manuellFrei ??= {})[userId] = tagVon(new Date());
  speichern();
}

// Alle Gesperrten von Hand freigeben – wirkt sofort, Rollen werden im Hintergrund abgenommen.
// Gibt die Anzahl zurück (0 = niemand gesperrt).
async function alleVonHandEntsperren(guild, cfg) {
  cfg.gesperrt ??= {};
  const ids = gesperrteIds(guild, cfg);
  if (!ids.length) return 0;
  const { fertig } = await alleSofortFreigeben(guild, cfg, ids);
  const heute = tagVon(new Date());
  cfg.manuellFrei ??= {};
  for (const id of ids) {
    delete cfg.gesperrt[id];
    cfg.manuellFrei[id] = heute;
  }
  speichern();
  fertig.then(() => console.log(`Alle entsperren: Warte-Rolle bei ${ids.length} Person(en) entfernt.`));
  return ids.length;
}

// ---------------------------------------------------------------------------
// Berechtigungen vom bisherigen Folge-Channel übernehmen (für den Channel der neuen Woche)
// Weggelassen wird, was der Bot selbst setzt: Warte-Rolle, sein eigener Eintrag und die
// "Nachrichten senden"-Sperre vom Abschluss – sonst wäre der neue Channel gleich gesperrt.
// Dazu: @everyone darf den neuen Channel nicht sehen, der Bot schon.
// ---------------------------------------------------------------------------
const SEHEN = PermissionFlagsBits.ViewChannel;
// Der Bot muss den neuen Channel trotz "unsichtbar für @everyone" sehen und verwalten können
const BOT_RECHTE = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageMessages;

async function rechteVomFolgeChannel(guild, cfg) {
  const folge = cfg?.folgeId ? await guild.channels.fetch(cfg.folgeId).catch(() => null) : null;
  const abschlussRolle = cfg?.abschluss?.rolleId || guild.id;
  const geschlossen = cfg?.abschluss?.status?.channelId === cfg?.folgeId && cfg?.abschluss?.status?.geschlossen;
  const liste = [];
  for (const ow of folge?.permissionOverwrites?.cache?.values() || []) {
    if (ow.id === cfg.warteRolleId || ow.id === client.user?.id) continue;
    const allow = BigInt(ow.allow.bitfield);
    let deny = BigInt(ow.deny.bitfield);
    if (geschlossen && ow.id === abschlussRolle) deny &= ~SENDEN; // Sperre vom Abschluss nicht mitnehmen
    if (allow === 0n && deny === 0n) continue;
    liste.push({ id: ow.id, type: ow.type, allow, deny });
  }

  // Neuer Channel ist standardmäßig für @everyone unsichtbar
  let jeder = liste.find((x) => x.id === guild.id);
  if (!jeder) liste.push(jeder = { id: guild.id, type: 0, allow: 0n, deny: 0n });
  jeder.allow &= ~SEHEN;
  jeder.deny |= SEHEN;
  // ... der Bot selbst sieht ihn aber
  if (client.user?.id) liste.push({ id: client.user.id, type: 1, allow: BOT_RECHTE, deny: 0n });

  return { quelle: folge, liste, langsamModus: folge?.rateLimitPerUser || 0 };
}

// Auf einen vorhandenen Channel übertragen (ersetzt dessen bisherige Einträge)
async function rechteUebertragen(guild, cfg, zielId) {
  const r = await rechteVomFolgeChannel(guild, cfg);
  const ziel = await guild.channels.fetch(zielId).catch(() => null);
  if (!r.quelle || !ziel?.permissionOverwrites) return false;
  await ziel.permissionOverwrites.set(r.liste, `Rechte von #${r.quelle.name} übernommen`);
  if (r.langsamModus && ziel.setRateLimitPerUser) await ziel.setRateLimitPerUser(r.langsamModus).catch(() => {});
  return true;
}

module.exports = {
  WARTE_ROLLEN_NAME,
  alleEntsperren,
  gesperrteIds,
  alleSofortFreigeben,
  alleVonHandEntsperren,
  istAusnahme,
  overwriteEntfernen,
  rechteUebertragen,
  rechteVomFolgeChannel,
  rollenCache,
  sperreAufheben,
  sperren,
  vonHandEntsperren,
  warteRolle,
};
