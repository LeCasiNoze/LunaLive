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
  {
    name: "celsius-vip-invite",
    description: "(Admin) Envoie le DM d'invitation VIP à tous les vérifiés ≥750€ qui n'ont pas encore reçu.",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
  },
  {
    name: "verify-landings",
    description: "(Admin) Force une passe de vérification des landings maintenant.",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
  },
  {
    name: "link-partner",
    description: "(Admin) Rattache un binôme au ticket courant (partage refill + accès salon).",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: "user",
        description: "Le streamer à rattacher en binôme",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
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
    description: "(Streamer-owner) Stats Aurix de ton serveur + recherche d'un viewer.",
    dm_permission: false,
    options: [
      {
        name: "viewer",
        description: "Voir le statut d'inscription d'un viewer précis.",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },
];
