const { ButtonStyle, PermissionFlagsBits, UserSelectMenuBuilder } = require('discord.js');
const { config, regelBereit } = require('../lib/daten');
const { privat, tagVon } = require('../lib/helfer');
const { alleVonHandEntsperren, gesperrteIds, vonHandEntsperren } = require('../lib/rechte');
const { doppeltHinweisSenden, hinweisSenden, letzteHinweise } = require('../lib/regel');
const { darf, knopf, menueEmbed, menueSchliessen, rasterAuffuellen, reihe, schliessenKnopf, schnellAntwort } = require('./menue');

// ===========================================================================
// /person – Menü: wer gerade gesperrt ist, Person markieren, entsperren, alle entsperren
//   pp:<aktion>:<seite>
// ===========================================================================
const FARBE = 0xfee75c;
const PRO_SEITE = 15;
const BITTE_EINRICHTEN = 'Bitte zuerst die Regel mit `/einstellungen` einrichten.';

const name = (guild, id) => guild.members.cache?.get(id)?.displayName || 'Person';

function personNachricht(guild, seite = 0) {
  const cfg = config[guild.id];
  const e = menueEmbed(FARBE, 'Personen').setTitle('👤 Personen');
  const zeilen = [];

  if (!regelBereit(cfg)) {
    e.setDescription(`❌ ${BITTE_EINRICHTEN}`);
    zeilen.push(reihe(schliessenKnopf('pp:x:0')));
    return { content: '', embeds: [e], components: zeilen, allowedMentions: { parse: [] } };
  }

  const ids = gesperrteIds(guild, cfg);
  const heute = tagVon(new Date());
  const frei = Object.entries(cfg.manuellFrei || {}).filter(([, tag]) => tag === heute).length;
  const seiten = Math.max(1, Math.ceil(ids.length / PRO_SEITE));
  seite = Math.min(Math.max(seite, 0), seiten - 1);
  const teil = ids.slice(seite * PRO_SEITE, (seite + 1) * PRO_SEITE);

  e.setDescription(
    `**⏳ Gesperrt:** ${ids.length} – dürfen in <#${cfg.folgeId}> erst ab **${cfg.uhrzeit} Uhr** posten\n` +
    `**🔓 Heute von Hand freigegeben:** ${frei}` +
    (ids.length ? '' : '\n\n*Gerade ist niemand gesperrt.*'));
  e.addFields(teil.map((id, i) => ({ name: `${seite * PRO_SEITE + i + 1}. ${name(guild, id)}`.slice(0, 256), value: `<@${id}>\n⏳ bis ${cfg.uhrzeit} Uhr`, inline: true })));
  rasterAuffuellen(e, teil.length);
  e.setFooter({ text: `Seite ${seite + 1}/${seiten}` });

  zeilen.push(
    reihe(new UserSelectMenuBuilder().setCustomId(`pp:m:${seite}`).setPlaceholder('📣 Markieren mit Hinweistext (Uhrzeit-Regel) …')),
    reihe(new UserSelectMenuBuilder().setCustomId(`pp:d:${seite}`).setPlaceholder('1️⃣ Markieren mit „Nur ein Beitrag“ …')),
    reihe(new UserSelectMenuBuilder().setCustomId(`pp:e:${seite}`).setPlaceholder('🔓 Person entsperren …')),
    reihe(
      knopf(`pp:A:${seite}`, '🔓 Alle entsperren', ButtonStyle.Danger).setDisabled(!ids.length),
      knopf(`pp:r:${seite}`, '🔄 Aktualisieren'),
    ),
    reihe(
      knopf(`pp:p:${seite - 1}`, '⬅️').setDisabled(seite <= 0),
      knopf('pp:n:0', `${seite + 1}/${seiten}`).setDisabled(true),
      knopf(`pp:p:${seite + 1}`, '➡️', ButtonStyle.Primary).setDisabled(seite >= seiten - 1),
      schliessenKnopf(`pp:x:${seite}`),
    ),
  );
  return { content: '', embeds: [e], components: zeilen, allowedMentions: { parse: [] } };
}

async function personOeffnen(interaction) {
  return interaction.reply(personNachricht(interaction.guild));
}

async function personInteraktion(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith('pp:')) return false;
  const guild = interaction.guild;
  const [, aktion, s] = id.split(':');
  const seite = Number(s) || 0;

  if (aktion === 'x') return menueSchliessen(interaction, PermissionFlagsBits.ManageMessages);
  // Blättern und Aktualisieren darf jeder, alles andere nur mit "Nachrichten verwalten" (wie der Befehl)
  if (!['p', 'r'].includes(aktion) && !(await darf(interaction, PermissionFlagsBits.ManageMessages, 'Nachrichten verwalten'))) return true;

  const cfg = config[guild.id];
  if (!['p', 'r'].includes(aktion) && !regelBereit(cfg)) {
    await interaction.reply(privat(`❌ ${BITTE_EINRICHTEN}`));
    return true;
  }

  const senden = schnellAntwort(interaction, 'update');
  let hinweis = null;

  if (aktion === 'm') {
    const wer = interaction.values[0];
    letzteHinweise.delete(`${guild.id}:${wer}`); // von Hand immer senden
    await hinweisSenden(guild, cfg, wer);
    hinweis = `✅ <@${wer}> wurde in <#${cfg.hinweisId}> mit dem Hinweistext markiert.`;
  }
  if (aktion === 'd') {
    const wer = interaction.values[0];
    letzteHinweise.delete(`${guild.id}:doppelt:${wer}`); // von Hand immer senden
    await doppeltHinweisSenden(guild, cfg, wer);
    hinweis = `✅ <@${wer}> wurde in <#${cfg.hinweisId}> mit „Nur ein Beitrag“ markiert.`;
  }
  if (aktion === 'e') {
    const wer = interaction.values[0];
    await vonHandEntsperren(guild, cfg, wer);
    hinweis = `🔓 Sperre von <@${wer}> aufgehoben.`;
  }
  if (aktion === 'A') {
    const anzahl = await alleVonHandEntsperren(guild, cfg);
    hinweis = anzahl ? '🔓 Sperre wurde von allen aufgehoben.' : 'Gerade ist niemand gesperrt.';
  }

  await senden(personNachricht(guild, seite));
  if (hinweis) await interaction.followUp(privat(hinweis));
  return true;
}

module.exports = {
  personInteraktion,
  personOeffnen,
};
