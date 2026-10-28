const { PermissionFlagsBits } = require('discord.js');
const { config, regelBereit, speichern } = require('../lib/daten');
const { privat } = require('../lib/helfer');
const { doppeltText, hinweisText } = require('../lib/regel');
const { abschlussText } = require('../lib/abschluss');
const { panelInteraktion, panelNachricht } = require('./panel');
const { listenInteraktion, listenOeffnen } = require('./listenpanel');
const { personInteraktion, personOeffnen } = require('./personpanel');
const { channelInteraktion, channelOeffnenBefehl } = require('./channelpanel');
const { nachrichtInteraktion, nachrichtOeffnen } = require('./nachrichtpanel');

const STANDARD_CFG = () => ({ sperren: true, loeschen: false, nurBilder: true, bildvergleich: false, toleranz: 8, gesperrt: {} });

// Alle Slash-Commands, Buttons und Fenster
async function interaktion(interaction) {
  const start = Date.now();
  try {
    await interaktionAusfuehren(interaction);
  } finally {
    // Hinweis in der Konsole, wenn etwas ungewöhnlich lange dauert
    const dauer = Date.now() - start;
    if (dauer > 2000) {
      const was = interaction.commandName ? `/${interaction.commandName}` : interaction.customId;
      console.log(`⏱️ ${was} hat ${(dauer / 1000).toFixed(1)} s gedauert.`);
    }
  }
}

async function interaktionAusfuehren(interaction) {
  if (!interaction.guild) return;
  const gid = interaction.guild.id;

  try {
    // Klicks, Auswahl und Fenster der Menüs
    if (await panelInteraktion(interaction)) return;
    if (await listenInteraktion(interaction)) return;
    if (await personInteraktion(interaction)) return;
    if (await channelInteraktion(interaction)) return;
    if (await nachrichtInteraktion(interaction)) return;

    // Text-Fenster aus dem Einstellungs-Menü (Bereich Texte) abgeschickt
    if (interaction.isModalSubmit() && interaction.customId.startsWith('text:')) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply(privat('❌ Texte ändern dürfen nur Leute mit „Server verwalten“.'));
      }
      const cfg = config[gid];
      if (!regelBereit(cfg)) return interaction.reply(privat('Bitte zuerst die Regel mit `/einstellungen` einrichten.'));
      const art = interaction.customId.split(':')[1];
      const wert = interaction.fields.getTextInputValue('text').trim() || null;
      if (art === 'hinweis') cfg.text = wert;
      else if (art === 'doppelt') cfg.textDoppelt = wert;
      else {
        cfg.abschluss ??= {};
        if (art === 'voll') cfg.abschluss.textVoll = wert;
        else cfg.abschluss.textZeit = wert;
      }
      speichern();
      if (interaction.message?.components?.[0]?.components?.[0]?.customId === 'ep:bereich') {
        return interaction.update(await panelNachricht(interaction.guild, cfg, 'texte'));
      }
      if (art === 'hinweis') return interaction.reply(privat(hinweisText(cfg, '0').replace('<@0>', '@Person')));
      if (art === 'doppelt') return interaction.reply(privat(doppeltText(cfg, '0').replace('<@0>', '@Person')));
      return interaction.reply(privat(abschlussText(cfg, art, cfg.abschluss?.anzahl ?? 50)));
    }

    if (!interaction.isChatInputCommand()) return;

    // Jeder Befehl öffnet sein Menü
    switch (interaction.commandName) {
      case 'einstellungen':
        config[gid] ??= STANDARD_CFG();
        return interaction.reply(await panelNachricht(interaction.guild, config[gid], 'regel'));
      case 'channel':
        return channelOeffnenBefehl(interaction);
      case 'person':
        return personOeffnen(interaction);
      case 'listen':
        return listenOeffnen(interaction);
      case 'nachricht':
        return nachrichtOeffnen(interaction);
    }
  } catch (e) {
    console.error(e);
    const antwort = privat(`❌ Fehler: ${e.message}`);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) interaction.followUp(antwort).catch(() => {});
      else interaction.reply(antwort).catch(() => {});
    }
  }
}

module.exports = {
  interaktion,
};
