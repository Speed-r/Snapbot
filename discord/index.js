const path = require('path');
// .env zuerst laden, damit alle Module die Werte sehen
require('dotenv').config({ path: path.join(__dirname, '..', 'config', '.env'), quiet: true });

const { Events } = require('discord.js');
const { client } = require('./lib/client');
const { config, speichern } = require('./lib/daten');
const { listeErstellen, listenTimer } = require('./lib/listen');
const { sperrenAufheben, sperrenNachholen } = require('./lib/ablauf');
const { commands } = require('./befehle/liste');
const { interaktion } = require('./befehle/ausfuehren');
const { nachrichtBearbeitet, nachrichtGeloescht, nachrichtNeu, nachrichtenGeloescht } = require('./ereignisse/nachrichten');

// ---------------------------------------------------------------------------
// Ereignisse verbinden
// ---------------------------------------------------------------------------
client.on(Events.InteractionCreate, interaktion);
client.on(Events.MessageCreate, nachrichtNeu);
client.on(Events.MessageDelete, nachrichtGeloescht);
client.on(Events.MessageBulkDelete, nachrichtenGeloescht);
client.on(Events.MessageUpdate, (alt, neu) => nachrichtBearbeitet(alt, neu).catch((e) => console.warn('Bearbeitung verarbeiten fehlgeschlagen:', e.message)));

let aufhebenTimer = null;

client.once(Events.ClientReady, async (c) => {
  await c.application.commands.set(commands.map((cmd) => cmd.toJSON()));
  console.log(`Eingeloggt als ${c.user.tag} – Commands registriert.`);
  await sperrenNachholen(); // Sperren und Listen frisch berechnen (auch nach Offline-Zeit)
  aufhebenTimer = setInterval(() => sperrenAufheben().catch((e) => console.error(e)), 60 * 1000);
});

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN fehlt – bitte in config/.env eintragen.');
  process.exit(1);
}
// ---------------------------------------------------------------------------
// Sauberes Beenden: Strg+C, Fenster schließen, pm2 stop/restart, Absturz
// ---------------------------------------------------------------------------
let beendetGerade = false;

async function beenden(grund, code = 0) {
  if (beendetGerade) return;
  beendetGerade = true;
  console.log(`\nBeende Bot (${grund}) …`);

  // Falls etwas hängt: spätestens nach 10 Sekunden hart beenden
  setTimeout(() => {
    console.warn('Beenden dauert zu lange – erzwinge Ende.');
    process.exit(code || 1);
  }, 10 * 1000).unref();

  try {
    if (aufhebenTimer) clearInterval(aufhebenTimer);

    // Noch ausstehende Listen sofort schreiben
    for (const [schluessel, timer] of listenTimer) {
      clearTimeout(timer);
      const [gid, welcher] = schluessel.split(':');
      const guild = client.guilds.cache.get(gid);
      if (guild && config[gid]) await listeErstellen(guild, config[gid], welcher).catch(() => {});
    }
    listenTimer.clear();

    speichern();
    console.log('Einstellungen gespeichert.');

    await client.destroy(); // meldet den Bot sauber bei Discord ab (Status wird offline)
    console.log('Von Discord getrennt. Tschüss!');
  } catch (e) {
    console.error('Fehler beim Beenden:', e);
    code = code || 1;
  }
  process.exit(code);
}

process.on('SIGINT', () => beenden('Strg+C'));
process.on('SIGTERM', () => beenden('SIGTERM / pm2'));
process.on('SIGHUP', () => beenden('Fenster geschlossen'));
if (process.platform === 'win32') process.on('SIGBREAK', () => beenden('Strg+Pause'));
process.on('uncaughtException', (e) => {
  console.error('Unerwarteter Fehler:', e);
  beenden('Absturz', 1);
});
process.on('unhandledRejection', (e) => console.error('Unbehandelter Fehler:', e));

// Discord-Verbindung: Meldungen bei Abbruch und automatischer Wiederverbindung
client.on(Events.ShardDisconnect, (_e, id) => !beendetGerade && console.warn(`Verbindung zu Discord getrennt (Shard ${id}) – verbinde neu …`));
client.on(Events.ShardReconnecting, (id) => console.log(`Verbinde neu … (Shard ${id})`));
client.on(Events.ShardResume, (id) => console.log(`Wieder verbunden (Shard ${id}).`));
client.on(Events.Error, (e) => console.error('Discord-Fehler:', e.message));

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('Login fehlgeschlagen:', e.message);
  if (/disallowed intents/i.test(e.message)) {
    console.error('→ Im Developer Portal unter Bot → Privileged Gateway Intents den "Message Content Intent" einschalten.');
  } else if (/token/i.test(e.message)) {
    console.error('→ Token in config/.env prüfen.');
  }
  process.exit(1);
});