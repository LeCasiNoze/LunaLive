// api/src/discord/kb/_config.ts
// Configuration interne du système KB — NE PAS EXPOSER À L'UTILISATEUR
// ─────────────────────────────────────────────────────────────────────────────
// Master user — bypass de toutes les restrictions du bot support
// Discord ID numérique de l'admin principal LunaLive
// ─────────────────────────────────────────────────────────────────────────────
export const MASTER_DISCORD_USER_ID = "1469366876621639741";
// ─────────────────────────────────────────────────────────────────────────────
// Bypass mode
// Quand true : le master user peut déclencher toutes les commandes staff
// sans vérification de rôle Discord.
// À activer uniquement en production après validation.
// ─────────────────────────────────────────────────────────────────────────────
export const MASTER_BYPASS_ENABLED = true;
// ─────────────────────────────────────────────────────────────────────────────
// Vérifie si un Discord user ID est le master user
// ─────────────────────────────────────────────────────────────────────────────
export function isMasterUser(discordUserId) {
    return MASTER_BYPASS_ENABLED && discordUserId === MASTER_DISCORD_USER_ID;
}
