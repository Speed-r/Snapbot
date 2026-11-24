const { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

// Name des Rechtsklick-Befehls (Nachricht -> Apps)
const BEARBEITEN_NAME = 'Bot-Nachricht bearbeiten';

// ---------------------------------------------------------------------------
// Slash-Commands – jeder Befehl öffnet ein Menü, es gibt keine Felder
// ---------------------------------------------------------------------------
const commands = [
  new SlashCommandBuilder()
    .setName('einstellungen')
    .setDescription('Einstellungs-Menü: Regel, Optionen, Abschluss, Ausnahmen, Texte')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Channel-Menü: neue Woche, Channel erstellen, Folge-Channel öffnen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  new SlashCommandBuilder()
    .setName('person')
    .setDescription('Personen-Menü: Gesperrte ansehen, markieren, entsperren, alle entsperren')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('listen')
    .setDescription('Listen-Menü: Frühposter, Folge-Channel, Verlauf und gespeicherte Namen')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('nachricht')
    .setDescription('Freie Nachricht über den Bot in einen Channel senden')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // Rechtsklick auf eine Nachricht des Bots -> Apps -> "Bot-Nachricht bearbeiten"
  new ContextMenuCommandBuilder()
    .setName(BEARBEITEN_NAME)
    .setType(ApplicationCommandType.Message)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
];

module.exports = {
  BEARBEITEN_NAME,
  commands,
};
