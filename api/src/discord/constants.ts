// api/src/discord/constants.ts

// ─────────────────────────────────────────────
// IDs (LunaLive serveur officiel)
// ─────────────────────────────────────────────
export const GUILD_ID = "1467139956249067717";

// Tickets
export const STAFF_TICKETS_CATEGORY_ID = "1467141806922666034";

// Channel où il y a le bouton “Faire une demande streamer”
export const APPLY_CHANNEL_ID = "1467142148431413370";

// Channel où on envoie UNIQUEMENT le message de décision (accept/refuse)
export const STAFF_DECISIONS_CHANNEL_ID = "1467142397816209530";
export const STAFF_DECISIONS_PING_ROLE_ID = "1467140795105546441";

// Roles
export const ROLE_VERIFIED_ID = "1467140844233556231";
export const ROLE_VIEWER_ID = "1467140868288024742";
export const ROLE_STREAMER_ID = "1467140886793027656";
export const ROLE_PARTNER_ID = "1467140935954726984";
export const ROLE_MOD_LUNALIVE_ID = "1467140910771994801";
export const ROLE_RESTRICTED_ID = "1467140964773794005";

// Qui peut approuver/rejeter (dans le ticket)
export const STAFF_ROLE_IDS = ["1467140769436405981", "1467140795105546441"];

// ─────────────────────────────────────────────
// Custom IDs (Discord components)
// ─────────────────────────────────────────────
export const CID_APPLY_OPEN = "apply:open";
export const CID_APPLY_MODAL = "apply:modal";
export const CID_APPLY_DECIDE_PREFIX = "apply:decide:"; // apply:decide:approve:<id> | reject

// ─────────────────────────────────────────────
// Slash commands list (guild-scoped)
// ─────────────────────────────────────────────
export const SLASH_COMMANDS = [
  { name: "help", description: "Aide LunaLive" },
  { name: "whoami", description: "Afficher votre statut de liaison LunaLive" },
  { name: "link", description: "Lier votre Discord à votre compte LunaLive" },
] as const;
