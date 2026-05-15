// Définitions des slash commands (envoyées à Discord via REST).
import { ApplicationCommandOptionType, PermissionFlagsBits } from "discord.js";

// Commandes réservées à la guild Aurix (staff/streamers de l'agence).
export const guildCommandDefinitions = [
  {
    name: "setup-server",
    description: "Crée/synchronise la structure complète du serveur Aurix.",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
  },
  {
    name: "refill",
    description: "Demander un refill (500€).",
  },
  {
    name: "refill-cancel",
    description: "Annule ta demande de refill en cours.",
  },
  {
    name: "refill-sent",
    description: "(Staff) Marque le dernier batch verrouillé comme envoyé.",
    default_member_permissions: String(PermissionFlagsBits.ManageMessages),
  },
  {
    name: "compte",
    description: "Voir / modifier tes infos (Telegram, email, pseudo joueur).",
  },
  {
    name: "config",
    description: "Configuration Aurix (admin).",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: "show",
        description: "Affiche la configuration actuelle.",
        type: ApplicationCommandOptionType.Subcommand,
      },
      {
        name: "cutoff",
        description: "Définit l'heure quotidienne de cutoff refill.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "hour",
            description: "Heure (0-23)",
            type: ApplicationCommandOptionType.Integer,
            required: true,
            min_value: 0,
            max_value: 23,
          },
          {
            name: "minute",
            description: "Minute (0-59)",
            type: ApplicationCommandOptionType.Integer,
            required: false,
            min_value: 0,
            max_value: 59,
          },
        ],
      },
      {
        name: "manager",
        description: "Définit le mention/handle du manager à ping.",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "mention_or_text",
            description: "Mention Discord ou texte libre",
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: "ping",
    description: "Test : le bot répond.",
  },
  {
    name: "close-ticket",
    description: "(Admin) Ferme le ticket courant.",
    default_member_permissions: String(PermissionFlagsBits.ManageChannels),
  },
];

// Commandes GLOBALES — disponibles sur tous les serveurs où le bot est invité (serveurs streamers).
export const globalCommandDefinitions = [
  {
    name: "celsius",
    description: "Enregistrer / mettre à jour tes infos Celsius pour vérification Aurix.",
    dm_permission: false,
  },
  {
    name: "aurix",
    description: "(Streamer-owner) Statistiques Aurix de ton serveur.",
    dm_permission: false,
  },
];
