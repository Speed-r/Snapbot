const { client } = require('../lib/client');
const { config, regelBereit } = require('../lib/daten');
const { bilderVon, cacheGeaendert, cacheNeu, cacheWeg, minutenVon } = require('../lib/helfer');
const { istAusnahme, sperren } = require('../lib/rechte');
const { doppeltHinweisSenden, doppelterBeitrag, fruehCache, hinweisSenden, verstoesst } = require('../lib/regel');
const { listeSpaeterAktualisieren } = require('../lib/listen');
const { abschlussVollPruefen, zaehlerCache } = require('../lib/abschluss');

// Bild im ersten Channel gelöscht oder bearbeitet -> Liste (und ggf. Sperre) aktualisieren
function ersterChannelGeaendert(guildId, channelId) {
  const cfg = config[guildId];
  if (!regelBereit(cfg)) return;
  const welcher = channelId === cfg.ersterId ? 'erster' : channelId === cfg.folgeId ? 'folge' : null;
  if (!welcher) return;
  if (welcher === 'erster') fruehCache.delete(cfg.ersterId);
  if (welcher === 'folge') zaehlerCache.delete(cfg.folgeId);
  const guild = client.guilds.cache.get(guildId);
  if (guild) listeSpaeterAktualisieren(guild, cfg, 3 * 1000, welcher);
}

// Gelöscht / bearbeitet: Zwischenspeicher anpassen, dann Listen & Sperren nachziehen
function nachrichtGeloescht(msg) {
  cacheWeg(msg.channelId, [msg.id]);
  ersterChannelGeaendert(msg.guildId, msg.channelId);
}
function nachrichtenGeloescht(msgs, channel) {
  cacheWeg(channel.id, [...msgs.keys()]);
  ersterChannelGeaendert(channel.guildId, channel.id);
}
async function nachrichtBearbeitet(alt, neu) {
  await cacheGeaendert(neu);
  ersterChannelGeaendert(neu.guildId, neu.channelId);
}

// Neue Nachricht im ersten oder Folge-Channel
async function nachrichtNeu(msg) {
  cacheNeu(msg);
  if (msg.author.bot || !msg.guild) return;
  const cfg = config[msg.guild.id];
  if (!regelBereit(cfg)) return;
  if (msg.channelId !== cfg.ersterId && msg.channelId !== cfg.folgeId) return;
  // Ausnahme-Rollen: keine Sperre und kein Hinweis – Listen und Abschluss zählen sie aber normal mit
  let ausnahmeErgebnis = null;
  const ausnahme = async () => (ausnahmeErgebnis ??= await istAusnahme(msg.guild, cfg, msg.author.id, msg.member));

  // 1) Post im ersten Channel vor Uhrzeit X -> ist jetzt Frühposter, im Folge-Channel bis X sperren
  if (msg.channelId === cfg.ersterId) {
    fruehCache.delete(cfg.ersterId);
    if (minutenVon(msg.createdAt) >= cfg.uhrzeitMinuten) return;
    if (cfg.nurBilder && bilderVon(msg).length === 0) return;
    listeSpaeterAktualisieren(msg.guild, cfg);
    if (cfg.sperren && !(await ausnahme())) await sperren(msg.guild, cfg, msg.author.id);
    return;
  }

  // 2) Post im Folge-Channel vor Uhrzeit X -> prüfen und markieren
  //    (greift, wenn Sperre aus ist, nicht gesetzt werden konnte oder der Bot offline war)
  if (msg.channelId !== cfg.folgeId) return;
  const hatBild = bilderVon(msg).length > 0;

  // 2a) Nur EIN Beitrag pro Person: weiterer Beitrag wird gelöscht (Ausnahme-Rollen dürfen mehrere)
  if (cfg.einBeitrag !== false && (!cfg.nurBilder || hatBild) && !(await ausnahme()) && await doppelterBeitrag(msg, cfg)) {
    const weg = await msg.delete().then(() => true).catch((e) => { console.warn('Löschen fehlgeschlagen:', e.message); return false; });
    if (weg) {
      await doppeltHinweisSenden(msg.guild, cfg, msg.author.id).catch(() => {});
      console.log(`Zweiter Beitrag von ${msg.author.tag} im Folge-Channel gelöscht.`);
      return;
    }
  }
  if (!cfg.nurBilder || hatBild) listeSpaeterAktualisieren(msg.guild, cfg, 10 * 1000, 'folge');

  let geloescht = false;
  if (minutenVon(msg.createdAt) < cfg.uhrzeitMinuten && (!cfg.nurBilder || hatBild) && !(await ausnahme())) {
    try {
      if (await verstoesst(msg, cfg)) {
        if (cfg.loeschen) {
          geloescht = await msg.delete().then(() => true).catch((e) => { console.warn('Löschen fehlgeschlagen:', e.message); return false; });
        }
        await hinweisSenden(msg.guild, cfg, msg.author.id);
        if (cfg.sperren) await sperren(msg.guild, cfg, msg.author.id);
        console.log(`Hinweis: ${msg.author.tag} hat vor ${cfg.uhrzeit} Uhr im Folge-Channel gepostet.`);
      }
    } catch (e) {
      console.error('Fehler bei der Prüfung:', e);
    }
  }

  // 3) Abschluss: X verschiedene Leute mit Bild erreicht?
  if (hatBild && !geloescht) {
    await abschlussVollPruefen(msg.guild, cfg, msg.author.id).catch((e) => console.warn('Abschluss-Prüfung fehlgeschlagen:', e.message));
  }
}

module.exports = {
  nachrichtBearbeitet,
  nachrichtGeloescht,
  nachrichtenGeloescht,
  ersterChannelGeaendert,
  nachrichtNeu,
};
